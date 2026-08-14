# Deploy do AXIS na VPS (Docker Compose + Caddy)

Arquitetura: o **backend** roda num container (porta interna 4000, sem exposição
ao host) e o **Caddy** serve o frontend (SPA) + proxy reverso de `/api/*` com
HTTPS automático. Supabase continua na nuvem (banco, auth, RLS, Storage).

```
Internet ── 80/443 ──► Caddy (frontend + /api) ──► backend:4000 (rede interna)
```

## Pré-requisitos

- VPS com Ubuntu/Debian e **Docker + Docker Compose plugin**:
  ```bash
  sudo apt update && sudo apt install -y docker.io docker-compose-plugin
  sudo systemctl enable --now docker
  ```
- Um domínio (ex: `axis.seudominio.com`) com **registro DNS A** apontando
  para o IP da VPS.

## 1. Firewall

Libere **apenas** 22 (SSH), 80 e 443:

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

> As portas internas (4000) **não** precisam ser abertas — o backend não é
> publicado no host (`docker-compose.yml` não declara `ports` para ele).

## 2. Clonar e configurar

```bash
git clone https://github.com/rubensbmelo/projeto-axis.git && cd projeto-axis
cp .env.production.example .env.production
nano .env.production   # preencha Supabase + SITE_ADDRESS + CORS_ORIGINS
```

Nunca commite/exponga o `.env.production` (contém a `SUPABASE_SERVICE_ROLE_KEY`).

## 3. Subir

```bash
docker compose --env-file .env.production up -d --build
docker compose ps                 # ambos healthy
docker compose logs -f backend    # logs do backend
```

O Caddy emite o certificado TLS automaticamente (letsencrypt) no primeiro
acesso a `https://axis.seudominio.com`.

## 4. Verificação

- `https://<dominio>/` → tela de login
- `https://<dominio>/health` → `{"ok":true}` (via proxy /api)
- Logs: `docker compose logs -f`

## 5. Atualização (deploy novo)

```bash
git pull
docker compose --env-file .env.production up -d --build
```

`restart: unless-stopped` garante que os containers sobem de novo após reboot
ou crash.

## 6. Backups

- **Supabase**: o banco vive na nuvem — habilite backups automáticos no painel
  (ou faça `pg_dump` periódico se precisar de export extra).
- **Caddy**: os certificados ficam no volume `caddy_data` — não precisa
  backup, o Caddy renova sozinho. Se trocar de servidor, os certs são
  re-emitidos.

## 7. Monitoramento

- **Health check**: o compose já tem `healthcheck` no backend; o Caddy depende
  dele via `depends_on: service_healthy`.
- **Uptime**: aponte um [Uptime Kuma](https://github.com/louislam/uptime-kuma)
  (ou serviço externo) para `https://<dominio>/health`.
- **Logs rotacionados**: `logging: max-size: 10m, max-file: 3` já configurado.

## 8. Atualizações de segurança do host

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot   # containers voltam sozinhos (restart: unless-stopped)
```

## 9. Lembretes de segurança

- **Nunca** expor a `SUPABASE_SERVICE_ROLE_KEY` no frontend ou em logs.
- Não abrir a porta 4000 no firewall.
- Rodar containers sem `--privileged` (é o padrão aqui).
- Usar SSH por chave (desativar senha no `/etc/ssh/sshd_config`).

## Teste local sem domínio

Para testar o Caddy localmente (HTTP, sem TLS), use:

```bash
SITE_ADDRESS=":8080" docker compose --env-file .env.production up -d --build
# acesse http://localhost:8080
```

# Deploy do AXIS na VPS (Docker Compose + nginx + Caddy)

> CI: o workflow `.github/workflows/ci.yml` roda em push/PR — typecheck +
> testes (se as credenciais estiverem nos secrets), build do frontend e
> validação de Docker/compose. Para **bloquear merge** em caso de falha,
> ative a branch protection no GitHub: Settings → Branches → Add rule →
> `master` → marque **Require status checks to pass** e selecione os checks
> `Backend (tsc + testes)`, `Frontend (build)` e `Docker (imagens + compose
> config)`. Os secrets usados pelo CI: `SUPABASE_URL`,
> `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

## Arquitetura (VPS compartilhada)

O **nginx do host** já é o proxy HTTPS de outros apps da mesma VPS (ex:
RepFlow, WFMS). Para **não interferir neles**, o AXIS entra pela mesma porta
via nginx — o **Caddy** do container passa a servir **HTTP interno** numa
porta privada (`127.0.0.1:8081`), e o nginx faz o TLS do domínio do AXIS.

```
Internet ── 80/443 ──► nginx (host) ──► 127.0.0.1:8081 ──► Caddy (frontend + /api) ──► backend:4000
```

> ⚠️ **Regra de ouro em VPS compartilhada:** antes de qualquer mudança em
> portas/serviços existentes, **verifique o que já roda na máquina**
> (`docker ps`, `ss -tlnp`, `nginx -T`) e confirme com o responsável antes de
> desativar/parar algo. Nunca pare um serviço que sirva outros projetos sem
> essa checagem.

## Pré-requisitos

- VPS com Ubuntu/Debian e **Docker + Docker Compose plugin**:
  ```bash
  sudo apt update && sudo apt install -y docker.io docker-compose-plugin
  sudo systemctl enable --now docker
  ```
- **nginx + certbot** já instalados no host (ou instale: `sudo apt install -y nginx certbot python3-certbot-nginx`)
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

> Portas internas (4000, 8081) **não** são abertas — o backend não é publicado
> no host e o Caddy escuta só em `127.0.0.1`.

## 2. Clonar e configurar

```bash
git clone https://github.com/rubensbmelo/projeto-axis.git && cd projeto-axis
cp .env.production.example .env.production
nano .env.production   # Supabase + SITE_ADDRESS=:80 + CORS_ORIGINS
```

Nunca commite/exponga o `.env.production` (contém a `SUPABASE_SERVICE_ROLE_KEY`).

## 3. Subir (frontend em HTTP interno)

```bash
docker compose --env-file .env.production up -d --build
docker compose ps                 # ambos healthy
curl http://127.0.0.1:8081/health # deve responder {"ok":true}
```

## 4. Nginx na frente (HTTPS do domínio do AXIS)

Crie o site (server block só na porta 80, com proxy pro Caddy):

```bash
sudo tee /etc/nginx/sites-enabled/axis > /dev/null <<'EOF'
server {
    listen 80;
    server_name axis.seudominio.com;
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
sudo nginx -t && sudo systemctl reload nginx
```

Emita o certificado e ative o HTTPS (adiciona o bloco 443 + redirect):

```bash
sudo certbot --nginx -d axis.seudominio.com
```

> O nginx **não é reiniciado** nos passos acima (`reload`), para não derrubar
> os outros apps. Sempre rode `nginx -t` antes do reload.

## 5. Verificação

- `https://<dominio>/` → tela de login
- `https://<dominio>/health` → `{"ok":true}`
- `sudo nginx -t` e `curl -I https://<dominio>` ok
- **Confirme que os outros domínios da VPS seguem no ar** (ex: `repflow.cloud`,
  `lite.rbmelo.com`)

## 6. Atualização (deploy novo)

```bash
git pull
docker compose --env-file .env.production up -d --build
```

`restart: unless-stopped` garante que os containers sobem de novo após reboot
ou crash.

## 7. Backups

- **Supabase**: o banco vive na nuvem — habilite backups automáticos no painel
  (ou faça `pg_dump` periódico se precisar de export extra).
- **Certificados TLS**: o nginx usa o certbot (`/etc/letsencrypt`), que renova
  sozinho via timer — não precisa backup manual. O Caddy não guarda certs (só
  HTTP interno).

## 8. Monitoramento

- **Health check**: o compose já tem `healthcheck` no backend; o Caddy depende
  dele via `depends_on: service_healthy`.
- **Uptime**: aponte um [Uptime Kuma](https://github.com/louislam/uptime-kuma)
  (ou serviço externo) para `https://<dominio>/health`.
- **Logs rotacionados**: `logging: max-size: 10m, max-file: 3` já configurado.

## 9. Atualizações de segurança do host

```bash
sudo apt update && sudo apt upgrade -y
sudo reboot   # containers voltam sozinhos (restart: unless-stopped)
```

## 10. Lembretes de segurança

- **Nunca** expor a `SUPABASE_SERVICE_ROLE_KEY` no frontend ou em logs.
- Não abrir as portas 4000/8081 no firewall (só 22/80/443).
- Rodar containers sem `--privileged` (é o padrão aqui).
- Usar SSH por chave (desativar senha no `/etc/ssh/sshd_config`).
- Em VPS compartilhada, **nunca** parar serviços/portas usados por outros
  projetos sem verificar antes (`docker ps`, `ss -tlnp`, `nginx -T`) e sem
  aprovação do responsável.

## Teste local sem domínio

Com o frontend em HTTP interno, o compose publica `127.0.0.1:8081`:

```bash
docker compose --env-file .env.production up -d --build
# acesse http://127.0.0.1:8081   (com SITE_ADDRESS=:80)
```

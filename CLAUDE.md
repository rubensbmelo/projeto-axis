# CLAUDE.md — Contexto do projeto AXIS

> Leia este arquivo antes de mexer em qualquer coisa. Ele resume todo o
> levantamento de requisitos já feito, pra você não precisar repetir nada.

## O que é o AXIS

Sistema de controle de cirurgias/OPME para **médicos e clínicas** (não é para
distribuidoras de OPME — isso é um produto separado, fora de escopo aqui).

Rastreia o funil completo de uma cirurgia particular/convênio: solicitação →
autorização → agendamento → cirurgia → cobrança → pagamento → recebimento.

## Origem do domínio

O parceiro de negócio tem um amigo médico (cirurgião de mão, clínica "SOS Mão
Recife", apelidado "Bicão" nas conversas) que hoje controla tudo numa planilha
Excel manual. Ele quer digitalizar isso pra própria clínica primeiro e, se
funcionar, vender pra outros médicos de outras especialidades.

Fontes usadas para levantar requisitos (todas já processadas):
- Projeto de código original que ele mandou (React + Express + Supabase) —
  usado só como referência de domínio, **não é a base do código atual**.
- 2 vídeos mostrando documentos reais: Guia de Solicitação de Internação
  (padrão TISS/convênio), Registro de Admissão de Paciente, Descrição
  Cirúrgica com códigos CBHPM/TUSS.
- Planilha real dele (`Planilha_Controle_de_Procedimentos.xlsx`, 179 casos).
  Achado crítico: campos de paciente/procedimento ~100% preenchidos, mas
  **toda a parte financeira (autorização, cobrança, pagamento, recebimento)
  estava 0% preenchida** — esse é o problema #1 que o produto resolve.
- 4 áudios do WhatsApp, resumo do que cada um trouxe:
  1. Contexto geral: é para médico/clínica, secretária opera o sistema no
     dia a dia, e existem campos financeiros que NÃO estavam na planilha:
     **comissão do médico** e **receita adicional** (repasse ligado a OPME).
  2. Relatórios que ele quer: cirurgias por mês, ranking por hospital,
     ranking por convênio, ranking por tipo de procedimento (ele já fazia
     isso manualmente no Power BI).
  3. Confirmação explícita: o mesmo sistema deve servir pra médicos de
     **qualquer especialidade**, não só cirurgia de mão — não fixar listas
     de procedimento por especialidade.
  4. Ele alegou que o frontend original já tinha os campos prontos — ao
     checar o código, o formulário só tinha 5 campos básicos. Divergência
     registrada, não bloqueou o trabalho, mas vale ter em mente ao validar
     requisitos com ele: nem tudo que ele descreve de memória bate 100% com
     o que existe.

## Decisões de arquitetura já tomadas

- **Multi-tenant desde o início** (`organizations` = cada clínica), porque a
  visão de produto é vender pra vários médicos, cada um isolado do outro.
- Convênio/hospital/fornecedor são **tabelas de referência por organização**,
  não texto livre — a planilha tinha "Unimed" escrito de 3 jeitos diferentes.
- CPF e matrícula são sempre `text`, nunca numérico (a planilha tinha CPF
  corrompido em notação científica por causa disso no Excel).
- Documentos são upload real pro Supabase Storage, ligados ao caso
  (`case_documents`), não nome de arquivo solto como na planilha.
- Todo `UPDATE` em `surgery_cases` grava em `audit_log` campo a campo
  (importante por ser dado de saúde/CPF).
- Papéis: `owner`, `doctor`, `secretary`, `viewer`.

## Status atual

- [x] **Fase 1 — Schema** (`backend/migrations/001_init.sql`): completo.
- [x] **Fase 2 — Backend** (`backend/src/`): completo — organizações,
      pacientes, casos, documentos, relatórios. Ainda **não testado** contra
      um Supabase real (rode `npm install && npx tsc --noEmit` primeiro).
- [x] **Rodada de segurança** (após revisão externa, 2 passadas):
  1. RLS de `audit_log` sem política de INSERT → adicionada, e depois
     reforçada pra exigir `user_id = auth.uid()` (evita log falsificado).
  2. Falha de insert em `audit_log` era silenciosa → agora loga no console.
  3. Upload de documento podia deixar arquivo órfão no Storage se o insert
     no banco falhasse depois → agora desfaz o upload nesse caso.
  4. `surgery_cases` não validava se `patient_id`/`doctor_id`/`hospital_id`/
     `insurer_id`/`supplier_id` pertenciam à mesma organização do caso (FK
     do Postgres não é filtrada por RLS) → validação adicionada em
     `validateOrgReferences()` antes de insert/update.
  5. Qualquer papel (inclusive `viewer`) podia criar/editar casos, pacientes
     e tabelas de referência → agora só `owner`/`doctor`/`secretary`
     escrevem; `viewer` só lê.
  6. Nome de arquivo do upload ia direto pro caminho do Storage (risco de
     path traversal/caracteres inválidos) → caminho agora usa UUID; o nome
     original só fica guardado como `file_name` de exibição no banco.
   - **Ainda pendente, decidido deixar pra depois**: validação robusta de
     payload **no backend** (formato de data, CPF, valores negativos,
     transições de status inválidas tipo "pago" → "solicitado") e testes
     automatizados. Não bloqueiam o frontend, mas precisam entrar antes de
     dado real de paciente em produção.
     > O frontend já valida essas regras no lado do cliente (react-hook-form
     > + zod, Fase 3) — mas isso é só UX; o backend **não** tem as mesmas
     > regras ainda. Manter como pendência até o backend aplicar.
- [x] **Fase 3 — Frontend (v1)**: React + Vite + TS + **shadcn/ui** (não
      Ant Design — decisão consciente, ver histórico). Cobre o fluxo
      completo de um caso: login/onboarding, CRUD de pacientes/casos/
      hospitais/convênios/fornecedores/membros, form de caso com todos os
      campos, upload de documento e os 4 relatórios. Falta ajuste visual
      fino e revisão de UX.
- [ ] Onboarding visual (tela de "criar organização") — JÁ FEITO no front,
      resta revisão/refinamento.
- [ ] Deploy

## Pendências conscientes (adiadas)

Rastro de correções já aplicadas e itens adiados de propósito, pra não
perder o fio de qual ferramenta corrigiu o quê.

### Correções de segurança aplicadas

- [x] `audit insert` agora exige `user_id = auth.uid()` — `001_init.sql`.
- [x] Validação de referências por org em casos (patient/doctor/hospital/
      insurer/supplier) — `routes/cases.ts` (`validateOrgReferences`).
- [x] Viewer bloqueado de criar/editar casos — `routes/cases.ts` (`requireRole`).
- [x] Nome de arquivo do Storage trocado por UUID + extensão sanitizada —
      `routes/documents.ts`.
- [x] Upload de documento confere se o caso pertence à org antes de subir —
      `routes/documents.ts` (`validateCaseBelongsToOrg`, opencode 2026-08-14).

### Melhorias funcionais aplicadas

- [x] Migration `002_storage_policies.sql`: policies de RLS no
      `storage.objects` do bucket `case-documents` (multi-tenant por org no
      caminho). Sem isso, upload de documento falhava com "row-level
      security policy".
- [x] `/api/reports/summary` agora distingue `total_casos` (todos os casos
      da org) de `cirurgias_realizadas` (só com `data_cirurgia`); tela de
      Relatórios mostra os dois números separados.
- [x] Nova rota `GET /api/cases/:id/audit` (histórico do `audit_log`, mais
      recente primeiro) + seção "Histórico de auditoria" na tela de Detalhe
      do caso (campo, valor antigo, valor novo, quem, quando).
- [x] Busca de casos (`GET /api/cases?search=`) cobre nome de paciente além
      de procedimento; placeholder da tela atualizado.
- [x] Validação de payload **no backend** com zod (`src/lib/validation.ts`):
      datas (AAAA-MM-DD), valores >= 0, CPF (formato, pacientes), campos
      obrigatórios, `.strict()` contra chaves extras e transição de status
      (não pode voltar no fluxo, exceto → `cancelado`). O frontend já
      validava (UX); agora o backend rejeita payloads inválidos
      independentemente do cliente.
- [x] Testes automatizados de integração (vitest + supertest, `npm test`) —
      rodam o app Express real contra o Supabase real: casos (payload,
      status, refs por org), pacientes, permissões por papel, auditoria,
      upload/URL assinada e isolamento multi-tenant (39 testes). Exigem
      credenciais em `backend/.env`. `src/app.ts` exporta o app (o
      `index.ts` só sobe o servidor).
- [x] Hardening de produção (`src/app.ts`): CORS restrito por `CORS_ORIGINS`
      (allowlist), rate limiting global + específico (auth/upload) via
      `express-rate-limit`, headers de segurança via `helmet`, remoção de
      `x-powered-by`, e sanitização central de erros (objetos de erro do
      Supabase viram só a mensagem). Uploads restringidos por allowlist de
      MIME/extensão e tamanho configurável (`DOC_UPLOAD_MAX_MB`). Novas
      variáveis documentadas em `backend/.env.example`. Testes: CORS, 429 e
      upload inválido (+44 testes no total).
- [x] RLS por papel (`003_rls_roles.sql`): escrita exige
      owner/doctor/secretary no próprio banco (viewer não contorna o API);
      Storage vinculado ao caso (case_id do caminho precisa existir na org).
- [x] Auditoria atômica (`004_audit_trigger.sql`): trigger grava
      insert/update-por-campo/delete na MESMA transação; `case_ref` (sem FK)
      preserva o id do caso apagado + snapshot de procedimento/patient_name;
      insert direto no `audit_log` revogado (só o trigger grava). O Express
      **não** faz mais inserts manuais (`logAudit` removido) — sem duplicação.
      `006_audit_cascade_fix.sql`: `set search_path` na função (segurança
      SECURITY DEFINER) e a exclusão em cascata da org não quebra mais (audita
      só a exclusão individual de caso).
- [x] Normalização de procedimentos (`005_procedures.sql`): `procedimento`
      (texto livre) virou `procedure_id` → tabela de referência `procedures`
      por org. Ranking de procedimento agrupa por nome normalizado; há aba
      "Procedimentos" em Cadastros e o form de caso usa Combobox.
      **Lição:** depois dessa migração, toda query que referenciar procedimento
      precisa ser conferida; em `surgery_cases`, usar o relacionamento
      `procedure:procedures(name)` em vez da coluna antiga `procedimento`.
- [x] Magic bytes no upload (`documents.ts`) além de MIME/extensão.
- [x] **Corrigido o Combobox** que não abria no form de caso (paciente,
      médico, procedimento, hospital, convênio, fornecedor): a causa era o
      trigger `<PopoverTrigger asChild><Button>` do shadcn v4 — o `Button`
      é um `Slot` interno, e o `Slot` aninhado no `asChild` não repassava a
      ref/evento ao Radix (dropdown nunca abria, sem erro de console).
      Fix: trigger virou `<button>` nativo com `buttonVariants`
      (`4fd2af4`); também removidas animações/`overflow-hidden` do
      `PopoverContent` (`faa3d45`). Confirmado ao vivo em produção.
- [x] Hardening dos containers: backend roda como usuário `node`
      (não-root), `cap_drop: ALL` + `no-new-privileges` no compose.

### Pendências (adiadas de propósito)

- [ ] Rotacionar `SUPABASE_SERVICE_ROLE_KEY` (usada no ambiente local/VPS;
      nunca entrou no git) e criar Supabase exclusivo para CI.
- [ ] **Login deve abrir direto no painel/dashboard** (comissão em destaque),
      não na lista de casos — é o "chamariz" comercial do produto, precisa
      ser a primeira coisa que o médico vê. (Combinado em conversa, ainda
      não implementado nessa sessão: hoje `/` redireciona para `/casos`.)
- [ ] **Ajuste de linguagem "clínica" → "consultório"/"espaço de trabalho"**
      em todo o app (produto é centrado no médico, não numa clínica fixa).
      Estado: frontend já aplicado (Onboarding, Login, Patients, Reports);
      falta conferir mensagens do backend (ainda usam "organização") e docs.
- [x] **Otimizar a detecção de pacientes duplicados em organizações grandes**:
      o POST de pacientes agora pré-filtra candidatos por tokens do nome e
      variantes do CPF, usando os índices da migration `007_patient_duplicate_indexes.sql`,
      e só compara similaridade em JavaScript sobre esse subconjunto. Ainda
      vale monitorar volume e ajustar a estratégia se uma organização chegar
      a dezenas de milhares de pacientes.

## Deploy na VPS (acesso mínimo)

- **Usuário de deploy**: `axis` (dono de `/opt/axis`, **apenas** no grupo
  `docker` — **NÃO tem sudo**). Usar este usuário pro deploy — NÃO root.
  O deploy funciona sem sudo: `git pull` + `docker compose` + healthcheck.
- **Chave SSH dedicada**: `~/.ssh/axis_deploy_ed25519` (comment
  `axis-deploy@opencode`), instalada no `/home/axis/.ssh/authorized_keys`.
- **Alias SSH local**: `axis-vps` → `User axis` + `IdentityFile
  ~/.ssh/axis_deploy_ed25519` + `IdentitiesOnly yes`. Ex: `ssh axis-vps`.
- **Root**: fica **só como fallback de emergência** (alias `76.13.175.61` /
  chave `id_ed25519`). Não usar rotineiramente pro deploy.
- **Ciclo de deploy** (como `axis`): ir a `/opt/axis`, `git pull`, e
  `docker compose --env-file .env.production up -d --build`; validar
  `/health`, `/inicio`, `/casos`, `/relatorios`.

## Próximo passo sugerido

- Corrigir o bug do Combobox em `/casos/novo` (bloqueia o fluxo de criar caso).
- Redirecionar o login para o painel (dashboard de relatórios) em vez de
  `/casos`, seguindo o combinado de "chamariz" do médico.

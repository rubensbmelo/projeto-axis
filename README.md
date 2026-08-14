# AXIS — v2

Sistema de controle de cirurgias/OPME para médicos e clínicas (convênio,
autorização, agendamento, cobrança, pagamento, recebimento).

Este é um projeto **novo**, construído do zero, usando como especificação:
- O projeto original que o parceiro (médico) enviou (código de referência)
- A planilha real de controle dele (`Planilha_Controle_de_Procedimentos.xlsx`)
- Vídeos e áudios explicando o processo

## Estrutura

```
backend/
  migrations/001_init.sql   → schema Postgres/Supabase (multi-tenant, RLS)
  migrations/002_storage_policies.sql → RLS no Storage (bucket case-documents)
  src/
    index.ts                → entrypoint Express
    supabaseClient.ts       → clientes Supabase (admin + escopado ao usuário)
    middleware/auth.ts       → autenticação + resolução de organização
    routes/
      organizations.ts       → criação de clínica, membros
      patients.ts             → CRUD de pacientes
      cases.ts                 → CRUD de casos cirúrgicos (entidade central)
      documents.ts             → upload de documentos (Supabase Storage)
      reports.ts                → relatórios/dashboard
      referenceTable.ts          → fábrica de CRUD p/ hospitals/insurers/suppliers

frontend/                   → React + Vite + TS + shadcn/ui (Tailwind)
  src/
    pages/                  → Login, Onboarding, Casos, Pacientes,
                              Cadastros, Relatórios, Membros
    components/             → componentes shadcn + Combobox/ConfirmDialog
    auth/                   → contexto de sessão Supabase
    api/                    → cliente HTTP (JWT + x-org-id) e client Supabase
```

## Como rodar

1. Crie um projeto no [Supabase](https://supabase.com) (ou use um de teste)
2. No SQL Editor do Supabase, rode `backend/migrations/001_init.sql` e depois
   `backend/migrations/002_storage_policies.sql`
3. No Storage do Supabase, crie um bucket **privado** chamado `case-documents`
4. Copie `backend/.env.example` para `backend/.env` e preencha com as
   credenciais reais do seu projeto Supabase (Project Settings → API)
5. Copie `frontend/.env.example` para `frontend/.env` e preencha com
   `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (mesmos valores do passo 4)
6. Backend: `cd backend && npm install && npm run dev`
7. Frontend: `cd frontend && npm install && npm run dev`
8. Acesse `http://localhost:5173` (o Vite faz proxy de `/api` para
   `http://localhost:4000`)

Na primeira vez: crie uma conta na tela de login e depois faça o onboarding
da clínica (cria a organização e te torna `owner`).

## Status

- [x] Schema multi-tenant com RLS (+ RLS do Storage)
- [x] Backend: organizações, pacientes, casos, documentos, relatórios,
      auditoria, validação de referências por org
- [x] Frontend (Fase 3): fluxo completo de um caso + cadastros + relatórios
- [ ] Testes automatizados
- [ ] Validação de payload no backend (hoje só no frontend)
- [ ] CORS restrito / hardening para produção
- [ ] Deploy

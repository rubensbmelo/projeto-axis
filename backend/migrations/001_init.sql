-- =========================================================
-- AXIS — Schema v2 (multi-tenant, clínica/médico)
-- =========================================================
-- Cada "organization" é uma clínica (ex: SOS Mão). Todo o resto
-- dos dados é isolado por organization_id via RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------
-- 1. Organizações e membros
-- ---------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'doctor', 'secretary', 'viewer')),
  full_name text,
  crm text, -- registro do médico (Conselho Regional de Medicina), null para outros papéis
  created_at timestamptz default now(),
  unique (org_id, user_id)
);

-- ---------------------------------------------------------
-- 2. Tabelas de referência (por organização, evita bagunça
--    de "Unimed" vs "unimed" vs "UNIMED" que vimos na planilha)
-- ---------------------------------------------------------

create table insurers ( -- convênios
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (org_id, name)
);

create table hospitals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (org_id, name)
);

create table suppliers ( -- fornecedores de OPME
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz default now(),
  unique (org_id, name)
);

-- ---------------------------------------------------------
-- 3. Pacientes
-- ---------------------------------------------------------

create table patients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  full_name text not null,
  cpf text, -- texto, nunca numeric (evita o bug de notação científica visto na planilha)
  birth_date date,
  phone text,
  address text,
  created_at timestamptz default now()
);

create index idx_patients_org on patients(org_id);
create index idx_patients_cpf on patients(org_id, cpf);

-- ---------------------------------------------------------
-- 4. Casos cirúrgicos (entidade central)
-- ---------------------------------------------------------

create table surgery_cases (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,

  patient_id uuid not null references patients(id) on delete restrict,
  doctor_id uuid not null references org_members(id) on delete restrict,
  hospital_id uuid references hospitals(id) on delete set null,
  insurer_id uuid references insurers(id) on delete set null,
  supplier_id uuid references suppliers(id) on delete set null,

  matricula text, -- carteirinha do convênio (texto, aceita "Particular", "127/p8" etc.)
  guia_numero text,
  procedimento text not null,
  usa_opme boolean not null default false,
  ficha_de_sala boolean not null default false,

  status text not null default 'solicitado'
    check (status in ('solicitado', 'autorizado', 'agendado', 'realizado', 'faturado', 'pago', 'cancelado')),

  data_solicitacao date,
  data_autorizacao date,
  data_agendamento date,
  data_cirurgia date,

  entrada_cobranca date,
  valor_cobranca numeric(12,2),
  data_pagamento date,
  data_recebimento date,

  valor_cirurgia numeric(12,2),
  comissao_medico numeric(12,2),
  receita_adicional numeric(12,2), -- ex: repasse de OPME

  observacoes text,

  created_by uuid references org_members(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_cases_org on surgery_cases(org_id);
create index idx_cases_status on surgery_cases(org_id, status);
create index idx_cases_doctor on surgery_cases(doctor_id);
create index idx_cases_data_cirurgia on surgery_cases(org_id, data_cirurgia);

-- ---------------------------------------------------------
-- 5. Documentos anexados ao caso (guias, laudos, descrição
--    cirúrgica) — substitui o campo "nome do arquivo" solto
-- ---------------------------------------------------------

create table case_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  case_id uuid not null references surgery_cases(id) on delete cascade,
  document_type text check (document_type in
    ('guia_solicitacao', 'guia_autorizacao', 'descricao_cirurgica', 'nota_fiscal', 'outro')),
  file_name text not null,
  storage_path text not null, -- caminho no Supabase Storage
  uploaded_by uuid references org_members(id),
  uploaded_at timestamptz default now()
);

create index idx_docs_case on case_documents(case_id);

-- ---------------------------------------------------------
-- 6. Log de auditoria (obrigatório para dado de saúde/CPF)
-- ---------------------------------------------------------

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  case_id uuid references surgery_cases(id) on delete set null,
  user_id uuid references auth.users(id),
  action text not null, -- 'insert' | 'update' | 'delete'
  field_changed text,
  old_value text,
  new_value text,
  created_at timestamptz default now()
);

create index idx_audit_org on audit_log(org_id);
create index idx_audit_case on audit_log(case_id);

-- ---------------------------------------------------------
-- 7. Trigger: updated_at automático
-- ---------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_surgery_cases_updated_at
  before update on surgery_cases
  for each row execute function set_updated_at();

-- ---------------------------------------------------------
-- 8. Row Level Security — isolamento multi-tenant
-- ---------------------------------------------------------

alter table organizations enable row level security;
alter table org_members enable row level security;
alter table insurers enable row level security;
alter table hospitals enable row level security;
alter table suppliers enable row level security;
alter table patients enable row level security;
alter table surgery_cases enable row level security;
alter table case_documents enable row level security;
alter table audit_log enable row level security;

-- Helper: função que retorna as orgs do usuário logado
create or replace function my_org_ids()
returns setof uuid as $$
  select org_id from org_members where user_id = auth.uid();
$$ language sql stable security definer;

-- organizations: só vê a própria org
create policy "org select" on organizations
  for select using (id in (select my_org_ids()));

-- org_members: só vê membros da própria org
create policy "members select" on org_members
  for select using (org_id in (select my_org_ids()));

create policy "members insert by owner" on org_members
  for insert with check (
    org_id in (select org_id from org_members where user_id = auth.uid() and role = 'owner')
  );

-- Tabelas de referência: select/insert/update para qualquer membro da org
create policy "insurers all" on insurers
  for all using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));

create policy "hospitals all" on hospitals
  for all using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));

create policy "suppliers all" on suppliers
  for all using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));

-- Pacientes
create policy "patients all" on patients
  for all using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));

-- Casos cirúrgicos
create policy "cases all" on surgery_cases
  for all using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));

-- Documentos
create policy "documents all" on case_documents
  for all using (org_id in (select my_org_ids())) with check (org_id in (select my_org_ids()));

-- Auditoria: leitura permitida a qualquer membro da org; inserção também
-- precisa ser permitida (é o backend, autenticado como o usuário, que grava
-- os registros de auditoria) — nunca UPDATE/DELETE, pra manter o log imutável.
create policy "audit select" on audit_log
  for select using (org_id in (select my_org_ids()));

create policy "audit insert" on audit_log
  for insert with check (org_id in (select my_org_ids()) and user_id = auth.uid());

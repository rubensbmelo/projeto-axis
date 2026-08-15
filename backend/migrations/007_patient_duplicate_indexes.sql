-- Índices para reduzir o conjunto de candidatos da detecção de duplicidade.
create extension if not exists pg_trgm;

create index if not exists patients_org_cpf_idx
  on public.patients (org_id, cpf)
  where cpf is not null;

create index if not exists patients_full_name_trgm_idx
  on public.patients using gin (full_name gin_trgm_ops);

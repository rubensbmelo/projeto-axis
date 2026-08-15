-- =========================================================
-- AXIS — CPF único por organização (bloqueio definitivo)
-- =========================================================
-- Pacientes sem CPF (NULL) continuam permitidos em qualquer quantidade
-- (NULL não conflita numa UNIQUE); só CPF preenchido e duplicado na
-- mesma organização é bloqueado.
create unique index if not exists unique_org_cpf
  on public.patients (org_id, cpf)
  where cpf is not null;

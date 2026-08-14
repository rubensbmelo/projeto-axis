-- =========================================================
-- AXIS — Auditoria atômica no banco + rastreabilidade de exclusão
-- =========================================================
-- A auditoria passa a ser gravada por TRIGGER na MESMA transação da
-- alteração em surgery_cases. Não depende mais do logAudit() silencioso
-- do Express (que apenas logava e seguia em frente).
--
-- Rastreabilidade de exclusão: o id do caso é preservado em case_ref
-- (coluna sem FK, não é anulada pelo ON DELETE SET NULL) e gravamos um
-- snapshot de procedimento + patient_name, para o registro continuar
-- identificável mesmo depois do DELETE.

alter table audit_log add column if not exists case_ref uuid;
alter table audit_log add column if not exists procedimento text;
alter table audit_log add column if not exists patient_name text;

-- Backfill das linhas existentes (casos ainda existentes).
update audit_log a
set case_ref = a.case_id,
    procedimento = c.procedimento,
    patient_name = p.full_name
from surgery_cases c
left join patients p on p.id = c.patient_id
where a.case_ref is null and c.id = a.case_id;

-- ---------------------------------------------------------
-- Trigger: audita INSERT/UPDATE/DELETE na mesma transação
-- ---------------------------------------------------------
create or replace function audit_surgery_cases()
returns trigger as $$
declare
  v_patient_name text;
begin
  -- DELETE: o caso já foi removido; usamos case_ref (sem FK) para
  -- preservar o id, e gravamos o snapshot antes da linha sumir.
  if tg_op = 'DELETE' then
    select p.full_name into v_patient_name from patients p where p.id = old.patient_id;
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (old.org_id, null, old.id, auth.uid(), 'delete', null, null, null, old.procedimento, v_patient_name);
    return old;
  end if;

  select p.full_name into v_patient_name from patients p where p.id = new.patient_id;

  if tg_op = 'INSERT' then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'insert', null, null, null, new.procedimento, v_patient_name);
    return new;
  end if;

  -- UPDATE: uma linha por campo alterado
  if new.status is distinct from old.status then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'status', old.status::text, new.status::text, new.procedimento, v_patient_name);
  end if;
  if new.procedimento is distinct from old.procedimento then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'procedimento', old.procedimento::text, new.procedimento::text, new.procedimento, v_patient_name);
  end if;
  if new.patient_id is distinct from old.patient_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'patient_id', old.patient_id::text, new.patient_id::text, new.procedimento, v_patient_name);
  end if;
  if new.doctor_id is distinct from old.doctor_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'doctor_id', old.doctor_id::text, new.doctor_id::text, new.procedimento, v_patient_name);
  end if;
  if new.hospital_id is distinct from old.hospital_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'hospital_id', old.hospital_id::text, new.hospital_id::text, new.procedimento, v_patient_name);
  end if;
  if new.insurer_id is distinct from old.insurer_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'insurer_id', old.insurer_id::text, new.insurer_id::text, new.procedimento, v_patient_name);
  end if;
  if new.supplier_id is distinct from old.supplier_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'supplier_id', old.supplier_id::text, new.supplier_id::text, new.procedimento, v_patient_name);
  end if;
  if new.matricula is distinct from old.matricula then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'matricula', old.matricula::text, new.matricula::text, new.procedimento, v_patient_name);
  end if;
  if new.guia_numero is distinct from old.guia_numero then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'guia_numero', old.guia_numero::text, new.guia_numero::text, new.procedimento, v_patient_name);
  end if;
  if new.usa_opme is distinct from old.usa_opme then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'usa_opme', old.usa_opme::text, new.usa_opme::text, new.procedimento, v_patient_name);
  end if;
  if new.ficha_de_sala is distinct from old.ficha_de_sala then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'ficha_de_sala', old.ficha_de_sala::text, new.ficha_de_sala::text, new.procedimento, v_patient_name);
  end if;
  if new.data_solicitacao is distinct from old.data_solicitacao then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_solicitacao', old.data_solicitacao::text, new.data_solicitacao::text, new.procedimento, v_patient_name);
  end if;
  if new.data_autorizacao is distinct from old.data_autorizacao then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_autorizacao', old.data_autorizacao::text, new.data_autorizacao::text, new.procedimento, v_patient_name);
  end if;
  if new.data_agendamento is distinct from old.data_agendamento then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_agendamento', old.data_agendamento::text, new.data_agendamento::text, new.procedimento, v_patient_name);
  end if;
  if new.data_cirurgia is distinct from old.data_cirurgia then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_cirurgia', old.data_cirurgia::text, new.data_cirurgia::text, new.procedimento, v_patient_name);
  end if;
  if new.entrada_cobranca is distinct from old.entrada_cobranca then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'entrada_cobranca', old.entrada_cobranca::text, new.entrada_cobranca::text, new.procedimento, v_patient_name);
  end if;
  if new.valor_cobranca is distinct from old.valor_cobranca then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'valor_cobranca', old.valor_cobranca::text, new.valor_cobranca::text, new.procedimento, v_patient_name);
  end if;
  if new.data_pagamento is distinct from old.data_pagamento then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_pagamento', old.data_pagamento::text, new.data_pagamento::text, new.procedimento, v_patient_name);
  end if;
  if new.data_recebimento is distinct from old.data_recebimento then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_recebimento', old.data_recebimento::text, new.data_recebimento::text, new.procedimento, v_patient_name);
  end if;
  if new.valor_cirurgia is distinct from old.valor_cirurgia then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'valor_cirurgia', old.valor_cirurgia::text, new.valor_cirurgia::text, new.procedimento, v_patient_name);
  end if;
  if new.comissao_medico is distinct from old.comissao_medico then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'comissao_medico', old.comissao_medico::text, new.comissao_medico::text, new.procedimento, v_patient_name);
  end if;
  if new.receita_adicional is distinct from old.receita_adicional then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'receita_adicional', old.receita_adicional::text, new.receita_adicional::text, new.procedimento, v_patient_name);
  end if;
  if new.observacoes is distinct from old.observacoes then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'observacoes', old.observacoes::text, new.observacoes::text, new.procedimento, v_patient_name);
  end if;

  return new;
end;
$$ language plpgsql security definer;

create trigger trg_audit_surgery_cases
  after insert or update or delete on surgery_cases
  for each row execute function audit_surgery_cases();

-- Remove a permissão de insert direto no audit_log: agora só o trigger
-- (security definer) grava, fechando a possibilidade de falsificação.
drop policy if exists "audit insert" on audit_log;

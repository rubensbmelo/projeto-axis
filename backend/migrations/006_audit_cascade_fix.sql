-- =========================================================
-- AXIS — Correção: trigger de auditoria no DELETE em cascata
-- =========================================================
-- Ao deletar uma ORGANIZAÇÃO inteira, o cascade apaga surgery_cases e o
-- trigger tentava gravar audit_log com org_id que já não existia → violava
-- a FK e quebrava a exclusão (e o teardown dos testes, deixando resíduo).
-- Correção: a auditoria de DELETE só é gravada quando a organização ainda
-- existe (exclusão individual de caso). No cascade da org, não audita.

create or replace function audit_surgery_cases()
returns trigger as $$
declare
  v_patient_name text;
  v_proc_name text;
begin
  if tg_op = 'DELETE' then
    -- Só audita se a org ainda existir (não no cascade de DELETE da org).
    if exists (select 1 from organizations o where o.id = old.org_id) then
      select p.full_name into v_patient_name from patients p where p.id = old.patient_id;
      select pr.name into v_proc_name from procedures pr where pr.id = old.procedure_id;
      insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
      values (old.org_id, null, old.id, auth.uid(), 'delete', null, null, null, v_proc_name, v_patient_name);
    end if;
    return old;
  end if;

  select p.full_name into v_patient_name from patients p where p.id = new.patient_id;
  select pr.name into v_proc_name from procedures pr where pr.id = new.procedure_id;

  if tg_op = 'INSERT' then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'insert', null, null, null, v_proc_name, v_patient_name);
    return new;
  end if;

  if new.procedure_id is distinct from old.procedure_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'procedure_id',
      (select pr.name from procedures pr where pr.id = old.procedure_id),
      v_proc_name, v_proc_name, v_patient_name);
  end if;
  if new.status is distinct from old.status then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'status', old.status::text, new.status::text, v_proc_name, v_patient_name);
  end if;
  if new.patient_id is distinct from old.patient_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'patient_id', old.patient_id::text, new.patient_id::text, v_proc_name, v_patient_name);
  end if;
  if new.doctor_id is distinct from old.doctor_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'doctor_id', old.doctor_id::text, new.doctor_id::text, v_proc_name, v_patient_name);
  end if;
  if new.hospital_id is distinct from old.hospital_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'hospital_id', old.hospital_id::text, new.hospital_id::text, v_proc_name, v_patient_name);
  end if;
  if new.insurer_id is distinct from old.insurer_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'insurer_id', old.insurer_id::text, new.insurer_id::text, v_proc_name, v_patient_name);
  end if;
  if new.supplier_id is distinct from old.supplier_id then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'supplier_id', old.supplier_id::text, new.supplier_id::text, v_proc_name, v_patient_name);
  end if;
  if new.matricula is distinct from old.matricula then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'matricula', old.matricula::text, new.matricula::text, v_proc_name, v_patient_name);
  end if;
  if new.guia_numero is distinct from old.guia_numero then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'guia_numero', old.guia_numero::text, new.guia_numero::text, v_proc_name, v_patient_name);
  end if;
  if new.usa_opme is distinct from old.usa_opme then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'usa_opme', old.usa_opme::text, new.usa_opme::text, v_proc_name, v_patient_name);
  end if;
  if new.ficha_de_sala is distinct from old.ficha_de_sala then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'ficha_de_sala', old.ficha_de_sala::text, new.ficha_de_sala::text, v_proc_name, v_patient_name);
  end if;
  if new.data_solicitacao is distinct from old.data_solicitacao then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_solicitacao', old.data_solicitacao::text, new.data_solicitacao::text, v_proc_name, v_patient_name);
  end if;
  if new.data_autorizacao is distinct from old.data_autorizacao then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_autorizacao', old.data_autorizacao::text, new.data_autorizacao::text, v_proc_name, v_patient_name);
  end if;
  if new.data_agendamento is distinct from old.data_agendamento then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_agendamento', old.data_agendamento::text, new.data_agendamento::text, v_proc_name, v_patient_name);
  end if;
  if new.data_cirurgia is distinct from old.data_cirurgia then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_cirurgia', old.data_cirurgia::text, new.data_cirurgia::text, v_proc_name, v_patient_name);
  end if;
  if new.entrada_cobranca is distinct from old.entrada_cobranca then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'entrada_cobranca', old.entrada_cobranca::text, new.entrada_cobranca::text, v_proc_name, v_patient_name);
  end if;
  if new.valor_cobranca is distinct from old.valor_cobranca then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'valor_cobranca', old.valor_cobranca::text, new.valor_cobranca::text, v_proc_name, v_patient_name);
  end if;
  if new.data_pagamento is distinct from old.data_pagamento then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_pagamento', old.data_pagamento::text, new.data_pagamento::text, v_proc_name, v_patient_name);
  end if;
  if new.data_recebimento is distinct from old.data_recebimento then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'data_recebimento', old.data_recebimento::text, new.data_recebimento::text, v_proc_name, v_patient_name);
  end if;
  if new.valor_cirurgia is distinct from old.valor_cirurgia then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'valor_cirurgia', old.valor_cirurgia::text, new.valor_cirurgia::text, v_proc_name, v_patient_name);
  end if;
  if new.comissao_medico is distinct from old.comissao_medico then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'comissao_medico', old.comissao_medico::text, new.comissao_medico::text, v_proc_name, v_patient_name);
  end if;
  if new.receita_adicional is distinct from old.receita_adicional then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'receita_adicional', old.receita_adicional::text, new.receita_adicional::text, v_proc_name, v_patient_name);
  end if;
  if new.observacoes is distinct from old.observacoes then
    insert into audit_log (org_id, case_id, case_ref, user_id, action, field_changed, old_value, new_value, procedimento, patient_name)
    values (new.org_id, new.id, new.id, auth.uid(), 'update', 'observacoes', old.observacoes::text, new.observacoes::text, v_proc_name, v_patient_name);
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists trg_audit_surgery_cases on surgery_cases;
create trigger trg_audit_surgery_cases
  after insert or update or delete on surgery_cases
  for each row execute function audit_surgery_cases();

import { beforeAll, afterAll, describe, it, expect } from 'vitest';

import { admin, authHeaders, createPatient, createProcedure, http, setupOrg, teardownOrg, type TestCtx } from './helpers';

describe('auditoria: insert e updates gravados por campo', () => {
  let ctx: TestCtx;
  let caseId: string;
  let procId: string;

  beforeAll(async () => {
    ctx = await setupOrg('Audit');
    const patientId = await createPatient(ctx.owner.token, ctx.orgId, 'Paciente Audit');
    procId = await createProcedure(ctx.owner.token, ctx.orgId, 'Caso audit');
    const created = await http()
      .post('/api/cases')
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .send({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId });
    caseId = created.body.id;
  });

  afterAll(async () => {
    await teardownOrg(ctx);
  });

  const audit = () =>
    http().get(`/api/cases/${caseId}/audit`).set(authHeaders(ctx.owner.token, ctx.orgId));

  it('registra insert na criação', async () => {
    const res = await audit();
    expect(res.status).toBe(200);
    expect(res.body.some((e: any) => e.action === 'insert')).toBe(true);
  });

  it('registra update por campo alterado', async () => {
    await http()
      .put(`/api/cases/${caseId}`)
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .send({ observacoes: 'texto novo', status: 'autorizado' });

    const res = await audit();
    const updates = res.body.filter((e: any) => e.action === 'update');
    expect(updates.some((e: any) => e.field_changed === 'observacoes' && e.new_value === 'texto novo')).toBe(true);
    expect(updates.some((e: any) => e.field_changed === 'status' && e.new_value === 'autorizado')).toBe(true);
  });

  it('histórico vem ordenado do mais recente para o mais antigo', async () => {
    const res = await audit();
    const times = res.body.map((e: any) => new Date(e.created_at).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    expect(times).toEqual(sorted);
  });

  it('exclusão é auditada e preserva a identidade do caso (case_ref/procedimento/paciente)', async () => {
    const patientId = await createPatient(ctx.owner.token, ctx.orgId, 'Paciente Excluído');
    const procName = 'Caso a excluir';
    const delProc = await createProcedure(ctx.owner.token, ctx.orgId, procName);
    const created = await http()
      .post('/api/cases')
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .send({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: delProc });
    expect(created.status).toBe(201);
    const caseId = created.body.id;

    const del = await http().delete(`/api/cases/${caseId}`).set(authHeaders(ctx.owner.token, ctx.orgId));
    expect(del.status).toBe(200);

    // O caso já não existe; a linha de auditoria é localizada por case_ref.
    const { data: rows, error } = await admin
      .from('audit_log')
      .select('action, case_ref, procedimento, patient_name, field_changed')
      .eq('case_ref', caseId);
    expect(error).toBeNull();
    expect(rows).toBeTruthy();
    expect(rows!.some((e: any) => e.action === 'delete')).toBe(true);

    const delRow = rows!.find((e: any) => e.action === 'delete');
    expect(delRow).toBeTruthy();
    expect(delRow!.case_ref).toBe(caseId);
    expect(delRow!.procedimento).toBe(procName);
    expect(delRow!.patient_name).toBe('Paciente Excluído');
  });
});

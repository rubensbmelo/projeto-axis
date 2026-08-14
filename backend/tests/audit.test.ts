import { beforeAll, afterAll, describe, it, expect } from 'vitest';

import { authHeaders, createPatient, http, setupOrg, teardownOrg, type TestCtx } from './helpers';

describe('auditoria: insert e updates gravados por campo', () => {
  let ctx: TestCtx;
  let caseId: string;

  beforeAll(async () => {
    ctx = await setupOrg('Audit');
    const patientId = await createPatient(ctx.owner.token, ctx.orgId, 'Paciente Audit');
    const created = await http()
      .post('/api/cases')
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .send({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedimento: 'Caso audit' });
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
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authHeaders, createPatient, createProcedure, http, setupOrg, teardownOrg, type TestCtx } from './helpers';

describe('relatórios', () => {
  let ctx: TestCtx;
  let patientId: string;
  let procedureId: string;

  beforeAll(async () => {
    ctx = await setupOrg('Reports');
    patientId = await createPatient(ctx.owner.token, ctx.orgId, 'Paciente Reports');
    procedureId = await createProcedure(ctx.owner.token, ctx.orgId, 'Procedimento Reports');

    const created = await http()
      .post('/api/cases')
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .send({
        patient_id: patientId,
        doctor_id: ctx.ownerMemberId,
        procedure_id: procedureId,
        status: 'faturado',
        entrada_cobranca: '2026-08-01',
        valor_cobranca: 1000,
      });
    expect(created.status).toBe(201);
  });

  afterAll(async () => {
    await teardownOrg(ctx);
  });

  it('lista pendência financeira com o nome do procedimento relacionado', async () => {
    const res = await http()
      .get('/api/reports/pendencias-financeiras')
      .set(authHeaders(ctx.owner.token, ctx.orgId));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].procedure.name).toBe('Procedimento Reports');
  });
});

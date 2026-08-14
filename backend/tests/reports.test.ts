import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authHeaders, createPatient, createProcedure, http, setupOrg, teardownOrg, type TestCtx } from './helpers';

describe('relatórios', () => {
  let ctx: TestCtx;
  let patientId: string;
  let procedureId: string;

  const daysAgo = (days: number) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };

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
        entrada_cobranca: daysAgo(45),
        valor_cobranca: 1000,
      });
    expect(created.status).toBe(201);

    const mismatched = await http()
      .post('/api/cases')
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .send({
        patient_id: patientId,
        doctor_id: ctx.ownerMemberId,
        procedure_id: procedureId,
        status: 'solicitado',
        data_solicitacao: daysAgo(45),
        valor_cobranca: 500,
      });
    expect(mismatched.status).toBe(201);
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

  it('calcula alertas e faturamento mensal', async () => {
    const [alerts, summary] = await Promise.all([
      http().get('/api/reports/alerts').set(authHeaders(ctx.owner.token, ctx.orgId)),
      http().get('/api/reports/summary').set(authHeaders(ctx.owner.token, ctx.orgId)),
    ]);

    expect(alerts.status).toBe(200);
    expect(alerts.body.authorization.count).toBe(1);
    expect(alerts.body.billing.count).toBe(1);
    expect(summary.status).toBe(200);
    expect(summary.body.faturamento_por_mes).toHaveLength(6);
    expect(summary.body.faturamento_por_mes.some((month: any) => month.valor === 1000)).toBe(true);
  });
});

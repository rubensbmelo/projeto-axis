import { beforeAll, afterAll, describe, it, expect } from 'vitest';

import { authHeaders, createPatient, http, setupOrg, teardownOrg, type TestCtx } from './helpers';

describe('cases: payload, status e referências por organização', () => {
  let ctx: TestCtx;
  let patientId: string;

  beforeAll(async () => {
    ctx = await setupOrg('Cases');
    patientId = await createPatient(ctx.owner.token, ctx.orgId, 'Paciente Teste');
  });

  afterAll(async () => {
    await teardownOrg(ctx);
  });

  const post = (body: unknown) =>
    http().post('/api/cases').set(authHeaders(ctx.owner.token, ctx.orgId)).send(body as object);

  it('cria um caso válido (201)', async () => {
    const res = await post({
      patient_id: patientId,
      doctor_id: ctx.ownerMemberId,
      procedimento: 'Síndrome do túnel do carpo',
      usa_opme: true,
      valor_cobranca: 1000,
    });
    expect(res.status).toBe(201);
    expect(res.body.org_id).toBe(ctx.orgId);
  });

  it('rejeita payload sem campos obrigatórios (400)', async () => {
    const res = await post({ patient_id: patientId });
    expect(res.status).toBe(400);
  });

  it('rejeita valor negativo (400)', async () => {
    const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedimento: 'X', valor_cobranca: -5 });
    expect(res.status).toBe(400);
  });

  it('rejeita data inválida (400)', async () => {
    const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedimento: 'X', data_cirurgia: '15/07/2026' });
    expect(res.status).toBe(400);
  });

  it('rejeita id que não é uuid (400)', async () => {
    const res = await post({ patient_id: 'nao-e-uuid', doctor_id: ctx.ownerMemberId, procedimento: 'X' });
    expect(res.status).toBe(400);
  });

  it('rejeita procedimento em branco (400)', async () => {
    const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedimento: '   ' });
    expect(res.status).toBe(400);
  });

  it('neutraliza injeção de org_id no body (caso cai na org real)', async () => {
    const res = await post({
      patient_id: patientId,
      doctor_id: ctx.ownerMemberId,
      procedimento: 'Injeção',
      org_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(201);
    expect(res.body.org_id).toBe(ctx.orgId);
  });

  it('rejeita referência de paciente de outra organização (400)', async () => {
    const other = await setupOrg('OtherRef');
    try {
      const otherPatient = await createPatient(other.owner.token, other.orgId, 'Outro Paciente');
      const res = await post({ patient_id: otherPatient, doctor_id: ctx.ownerMemberId, procedimento: 'Cross' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/não pertence a esta organização|não existe/i);
    } finally {
      await teardownOrg(other);
    }
  });

  describe('transição de status', () => {
    let caseId: string;
    beforeAll(async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedimento: 'Status Test' });
      caseId = res.body.id;
    });

    const put = (body: unknown) =>
      http().put(`/api/cases/${caseId}`).set(authHeaders(ctx.owner.token, ctx.orgId)).send(body as object);

    it('permite avançar no fluxo (solicitado → autorizado)', async () => {
      const res = await put({ status: 'autorizado' });
      expect(res.status).toBe(200);
    });

    it('bloqueia voltar no fluxo (autorizado → solicitado)', async () => {
      const res = await put({ status: 'solicitado' });
      expect(res.status).toBe(400);
    });

    it('permite cancelar de qualquer estado', async () => {
      const res = await put({ status: 'cancelado' });
      expect(res.status).toBe(200);
    });
  });
});

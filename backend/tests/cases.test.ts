import { beforeAll, afterAll, describe, it, expect } from 'vitest';

import { authHeaders, createPatient, createProcedure, http, setupOrg, teardownOrg, type TestCtx } from './helpers';

describe('cases: payload, status e referências por organização', () => {
  let ctx: TestCtx;
  let patientId: string;
  let procId: string;

  beforeAll(async () => {
    ctx = await setupOrg('Cases');
    patientId = await createPatient(ctx.owner.token, ctx.orgId, 'Paciente Teste');
    procId = await createProcedure(ctx.owner.token, ctx.orgId, 'Síndrome do túnel do carpo');
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
      procedure_id: procId,
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
    const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId, valor_cobranca: -5 });
    expect(res.status).toBe(400);
  });

  it('rejeita data inválida (400)', async () => {
    const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId, data_cirurgia: '15/07/2026' });
    expect(res.status).toBe(400);
  });

  it('rejeita id que não é uuid (400)', async () => {
    const res = await post({ patient_id: 'nao-e-uuid', doctor_id: ctx.ownerMemberId, procedure_id: procId });
    expect(res.status).toBe(400);
  });

  it('rejeita sem procedure_id (400)', async () => {
    const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId });
    expect(res.status).toBe(400);
  });

  it('neutraliza injeção de org_id no body (caso cai na org real)', async () => {
    const res = await post({
      patient_id: patientId,
      doctor_id: ctx.ownerMemberId,
      procedure_id: procId,
      org_id: '00000000-0000-0000-0000-000000000000',
    });
    expect(res.status).toBe(201);
    expect(res.body.org_id).toBe(ctx.orgId);
  });

  it('rejeita referência de paciente de outra organização (400)', async () => {
    const other = await setupOrg('OtherRef');
    try {
      const otherPatient = await createPatient(other.owner.token, other.orgId, 'Outro Paciente');
      const res = await post({ patient_id: otherPatient, doctor_id: ctx.ownerMemberId, procedure_id: procId });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/não pertence a esta organização|não existe/i);
    } finally {
      await teardownOrg(other);
    }
  });

  it('rejeita referência de procedimento de outra organização (400)', async () => {
    const other = await setupOrg('OtherProc');
    try {
      const otherProc = await createProcedure(other.owner.token, other.orgId, 'Proc Outra Org');
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: otherProc });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/não pertence a esta organização|não existe/i);
    } finally {
      await teardownOrg(other);
    }
  });

  describe('transição de status', () => {
    let caseId: string;
    beforeAll(async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId });
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

    it('bloqueia voltar de "pago" para "solicitado"', async () => {
      const created = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId });
      const caseId = created.body.id;
      await http().put(`/api/cases/${caseId}`).set(authHeaders(ctx.owner.token, ctx.orgId)).send({ status: 'autorizado' });
      await http().put(`/api/cases/${caseId}`).set(authHeaders(ctx.owner.token, ctx.orgId)).send({ status: 'agendado' });
      await http().put(`/api/cases/${caseId}`).set(authHeaders(ctx.owner.token, ctx.orgId)).send({ status: 'realizado' });
      await http().put(`/api/cases/${caseId}`).set(authHeaders(ctx.owner.token, ctx.orgId)).send({ status: 'faturado' });
      await http().put(`/api/cases/${caseId}`).set(authHeaders(ctx.owner.token, ctx.orgId)).send({ status: 'pago' });
      const res = await http().put(`/api/cases/${caseId}`).set(authHeaders(ctx.owner.token, ctx.orgId)).send({ status: 'solicitado' });
      expect(res.status).toBe(400);
      expect(String(res.body.error)).toMatch(/não é possível voltar de "pago" para "solicitado"/i);
    });
  });

  describe('validação de payload via API direta (sem frontend)', () => {
    it('rejeita data inválida no POST', async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId, data_cirurgia: '15/07/2026' });
      expect(res.status).toBe(400);
    });

    it('rejeita valor negativo no POST', async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId, valor_cobranca: -5 });
      expect(res.status).toBe(400);
    });

    it('rejeita string não-numérica em valor', async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId, valor_cobranca: 'abc' });
      expect(res.status).toBe(400);
    });

    it('rejeita criar caso já com status avançado (ex: pago)', async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId, status: 'pago' });
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/começar como 'solicitado'/i);
    });

    it('permite criar caso com status solicitado explícito', async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId, status: 'solicitado' });
      expect(res.status).toBe(201);
    });

    it('permite criar caso sem status (default solicitado)', async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('solicitado');
    });

    it('permite campo matricula com formato livre ("Particular", "127/p8")', async () => {
      const res = await post({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedure_id: procId, matricula: '127/p8' });
      expect(res.status).toBe(201);
    });
  });
});

import { beforeAll, afterAll, describe, it, expect } from 'vitest';

import {
  addMember,
  authHeaders,
  createPatient,
  createTestUser,
  http,
  setupOrg,
  teardownOrg,
  type TestCtx,
  type TestUser,
} from './helpers';

describe('permissões por papel (owner/doctor/secretary/viewer)', () => {
  let ctx: TestCtx;
  let viewer: TestUser;
  let secretary: TestUser;
  let patientId: string;
  let caseId: string;

  beforeAll(async () => {
    ctx = await setupOrg('Perm');

    viewer = await createTestUser();
    secretary = await createTestUser();
    ctx.users.push(viewer, secretary);

    await addMember(ctx.owner.token, ctx.orgId, viewer.userId, 'viewer', 'Viewer');
    await addMember(ctx.owner.token, ctx.orgId, secretary.userId, 'secretary', 'Secretária');

    patientId = await createPatient(ctx.owner.token, ctx.orgId, 'Paciente Perm');
  });

  afterAll(async () => {
    await teardownOrg(ctx);
  });

  it('viewer lê casos (200)', async () => {
    const res = await http().get('/api/cases').set(authHeaders(viewer.token, ctx.orgId));
    expect(res.status).toBe(200);
  });

  it('viewer não cria caso (403)', async () => {
    const res = await http()
      .post('/api/cases')
      .set(authHeaders(viewer.token, ctx.orgId))
      .send({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedimento: 'X' });
    expect(res.status).toBe(403);
  });

  it('viewer não cria paciente (403)', async () => {
    const res = await http().post('/api/patients').set(authHeaders(viewer.token, ctx.orgId)).send({ full_name: 'X' });
    expect(res.status).toBe(403);
  });

  it('viewer não cria hospital (403)', async () => {
    const res = await http().post('/api/hospitals').set(authHeaders(viewer.token, ctx.orgId)).send({ name: 'H' });
    expect(res.status).toBe(403);
  });

  it('secretary cria caso (201)', async () => {
    const res = await http()
      .post('/api/cases')
      .set(authHeaders(secretary.token, ctx.orgId))
      .send({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedimento: 'Caso da secretária' });
    expect(res.status).toBe(201);
    caseId = res.body.id;
  });

  it('secretary edita caso (200)', async () => {
    const res = await http()
      .put(`/api/cases/${caseId}`)
      .set(authHeaders(secretary.token, ctx.orgId))
      .send({ observacoes: 'atualizado pela secretária' });
    expect(res.status).toBe(200);
  });

  it('secretary NÃO exclui caso (403 — delete é só owner/doctor)', async () => {
    const res = await http().delete(`/api/cases/${caseId}`).set(authHeaders(secretary.token, ctx.orgId));
    expect(res.status).toBe(403);
  });

  it('viewer não altera membros (403)', async () => {
    const res = await http()
      .post('/api/organizations/members')
      .set(authHeaders(viewer.token, ctx.orgId))
      .send({ user_id: viewer.userId, role: 'viewer' });
    expect(res.status).toBe(403);
  });
});

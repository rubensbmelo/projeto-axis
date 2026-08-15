import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  authHeaders,
  createPatient,
  createProcedure,
  createTestUser,
  http,
  setupOrg,
  teardownOrg,
  type TestCtx,
  type TestUser,
} from './helpers';

describe('isolamento multi-tenant', () => {
  let orgA: TestCtx;
  let orgB: TestCtx;
  let userB: TestUser;
  let procA: string;
  let procB: string;

  beforeAll(async () => {
    orgA = await setupOrg('TenantA');
    orgB = await setupOrg('TenantB');

    // Usuário B pertence à org B (owner)
    userB = orgB.owner;

    procA = await createProcedure(orgA.owner.token, orgA.orgId, 'Proc A');
    procB = await createProcedure(userB.token, orgB.orgId, 'Proc B');
  });

  afterAll(async () => {
    await teardownOrg(orgA);
    await teardownOrg(orgB);
  });

  it('cada org só vê os próprios cadastros', async () => {
    await http()
      .post('/api/hospitals')
      .set(authHeaders(orgA.owner.token, orgA.orgId))
      .send({ name: 'Hospital A' });

    const listB = await http().get('/api/hospitals').set(authHeaders(userB.token, orgB.orgId));
    expect(listB.status).toBe(200);
    expect(listB.body.some((h: any) => h.name === 'Hospital A')).toBe(false);
  });

  it('rejeita acesso com x-org-id de outra organização (403)', async () => {
    const res = await http().get('/api/cases').set(authHeaders(orgA.owner.token, orgB.orgId));
    expect(res.status).toBe(403);
  });

  it('descoberta de organizações ignora x-org-id antigo', async () => {
    const res = await http().get('/api/organizations/me').set(authHeaders(orgA.owner.token, orgB.orgId));
    expect(res.status).toBe(200);
    expect(res.body.memberships).toEqual([
      expect.objectContaining({ org_id: orgA.orgId, role: 'owner' }),
    ]);
    expect(res.body.active_org_id).toBe(orgA.orgId);
  });

  it('rejeita caso referenciando paciente de outra organização (400)', async () => {
    const patientB = await createPatient(userB.token, orgB.orgId, 'Paciente B');
    const res = await http()
      .post('/api/cases')
      .set(authHeaders(orgA.owner.token, orgA.orgId))
      .send({ patient_id: patientB, doctor_id: orgA.ownerMemberId, procedure_id: procA });
    expect(res.status).toBe(400);
  });

  it('rejeita editar caso de outra organização (404)', async () => {
    const createdB = await http()
      .post('/api/cases')
      .set(authHeaders(userB.token, orgB.orgId))
      .send({ patient_id: (await createPatient(userB.token, orgB.orgId, 'Paciente B2')), doctor_id: orgB.ownerMemberId, procedure_id: procB });

    const res = await http()
      .put(`/api/cases/${createdB.body.id}`)
      .set(authHeaders(orgA.owner.token, orgA.orgId))
      .send({ observacoes: 'invadir' });
    expect(res.status).toBe(404);
  });

  it('consulta com usuário de outra org não vê casos alheios', async () => {
    const listB = await http().get('/api/cases').set(authHeaders(userB.token, orgB.orgId));
    const listA = await http().get('/api/cases').set(authHeaders(orgA.owner.token, orgA.orgId));
    const idsB = new Set(listB.body.data.map((c: any) => c.id));
    const idsA = new Set(listA.body.data.map((c: any) => c.id));
    for (const idB of idsB) expect(idsA.has(idB)).toBe(false);
  });
});

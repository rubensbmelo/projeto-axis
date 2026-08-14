import { beforeAll, afterAll, describe, it, expect } from 'vitest';

import { authHeaders, createPatient, http, setupOrg, teardownOrg, type TestCtx } from './helpers';

describe('documentos: upload, URL assinada e download', () => {
  let ctx: TestCtx;
  let caseId: string;

  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF', 'utf-8');

  beforeAll(async () => {
    ctx = await setupOrg('Docs');
    const patientId = await createPatient(ctx.owner.token, ctx.orgId, 'Paciente Docs');
    const created = await http()
      .post('/api/cases')
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .send({ patient_id: patientId, doctor_id: ctx.ownerMemberId, procedimento: 'Caso docs' });
    caseId = created.body.id;
  });

  afterAll(async () => {
    await teardownOrg(ctx);
  });

  it('sobe um PDF e retorna o registro (201)', async () => {
    const res = await http()
      .post(`/api/cases/${caseId}/documents`)
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .field('document_type', 'guia_solicitacao')
      .attach('file', PDF, 'descricao.pdf');
    expect(res.status).toBe(201);
    expect(res.body.file_name).toBe('descricao.pdf');
    expect(res.body.storage_path).toContain(ctx.orgId);
  });

  it('rejeita document_type inválido (400)', async () => {
    const res = await http()
      .post(`/api/cases/${caseId}/documents`)
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .field('document_type', 'hack')
      .attach('file', PDF, 'x.pdf');
    expect(res.status).toBe(400);
  });

  it('rejeita upload sem arquivo (400)', async () => {
    const res = await http()
      .post(`/api/cases/${caseId}/documents`)
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .field('document_type', 'outro');
    expect(res.status).toBe(400);
  });

  it('rejeita extensão fora da allowlist (400)', async () => {
    const res = await http()
      .post(`/api/cases/${caseId}/documents`)
      .set(authHeaders(ctx.owner.token, ctx.orgId))
      .field('document_type', 'outro')
      .attach('file', Buffer.from('MZ fake exe'), 'malware.exe');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/não permitido/i);
  });

  it('gera URL assinada e o download retorna o PDF (200)', async () => {
    const list = await http()
      .get(`/api/cases/${caseId}/documents`)
      .set(authHeaders(ctx.owner.token, ctx.orgId));
    const docId = list.body[0].id;

    const urlRes = await http()
      .get(`/api/cases/${caseId}/documents/${docId}/url`)
      .set(authHeaders(ctx.owner.token, ctx.orgId));
    expect(urlRes.status).toBe(200);
    expect(urlRes.body.url).toBeTruthy();

    const dl = await fetch(urlRes.body.url);
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-type')).toContain('pdf');
  });

  it('não expõe documento de outro caso via URL (404)', async () => {
    const urlRes = await http()
      .get(`/api/cases/00000000-0000-0000-0000-000000000000/documents/00000000-0000-0000-0000-000000000000/url`)
      .set(authHeaders(ctx.owner.token, ctx.orgId));
    expect(urlRes.status).toBe(404);
  });
});

import request from 'supertest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { app } from '../src/app';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Testes de integração exigem SUPABASE_URL / ANON / SERVICE_ROLE no backend/.env');
}

export const admin: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
export const anon: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export interface TestUser {
  email: string;
  password: string;
  token: string;
  userId: string;
}

export interface TestCtx {
  orgId: string;
  ownerMemberId: string;
  owner: TestUser;
  users: TestUser[];
}

let seq = 0;

export async function createTestUser(): Promise<TestUser> {
  const email = `test-${Date.now()}-${seq++}@opencode.local`;
  const password = 'Axis12345!';
  await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`login falhou para ${email}: ${error?.message}`);
  return { email, password, token: data.session.access_token, userId: data.user.id };
}

export async function createOrgFor(token: string, name: string): Promise<{ orgId: string; memberId: string }> {
  const res = await request(app)
    .post('/api/organizations')
    .set('Authorization', `Bearer ${token}`)
    .send({ name, full_name: 'Test Owner', crm: 'CRM-TEST' });
  if (res.status !== 201) {
    throw new Error(`criar org falhou: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { orgId: res.body.organization.id, memberId: res.body.membership.id };
}

export async function addMember(
  ownerToken: string,
  orgId: string,
  userId: string,
  role: string,
  full_name = 'Member'
): Promise<void> {
  const res = await request(app)
    .post('/api/organizations/members')
    .set('Authorization', `Bearer ${ownerToken}`)
    .set('x-org-id', orgId)
    .send({ user_id: userId, role, full_name });
  if (res.status !== 201) {
    throw new Error(`adicionar membro falhou: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

// Cria um usuário owner + uma organização própria pra isolar cada suíte.
export async function setupOrg(label: string): Promise<TestCtx> {
  const owner = await createTestUser();
  const { orgId, memberId } = await createOrgFor(owner.token, `Test ${label} ${Date.now()}`);
  return { orgId, ownerMemberId: memberId, owner, users: [owner] };
}

// Apaga a org (cascade nas tabelas), remove arquivos do Storage e os usuários.
export async function teardownOrg(ctx: TestCtx): Promise<void> {
  await removeStorageFolder(ctx.orgId);
  await admin.from('organizations').delete().eq('id', ctx.orgId);
  for (const u of ctx.users) {
    try {
      await admin.auth.admin.deleteUser(u.userId);
    } catch {
      // ignora — usuário pode já ter sido removido
    }
  }
}

async function removeStorageFolder(orgId: string): Promise<void> {
  try {
    const { data: folders } = await admin.storage.from('case-documents').list(orgId, { limit: 100 });
    for (const folder of folders || []) {
      const { data: files } = await admin.storage.from('case-documents').list(`${orgId}/${folder.name}`, { limit: 100 });
      const paths = (files || []).map((f) => `${orgId}/${folder.name}/${f.name}`);
      if (paths.length) await admin.storage.from('case-documents').remove(paths);
    }
  } catch {
    // best-effort
  }
}

export function http() {
  return request(app);
}

export function authHeaders(token: string, orgId?: string): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (orgId) h['x-org-id'] = orgId;
  return h;
}

// Cria um paciente de teste e retorna o id (ou lança).
export async function createPatient(token: string, orgId: string, full_name: string): Promise<string> {
  const res = await http()
    .post('/api/patients')
    .set(authHeaders(token, orgId))
    .send({ full_name });
  if (res.status !== 201) throw new Error(`criar paciente falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id;
}

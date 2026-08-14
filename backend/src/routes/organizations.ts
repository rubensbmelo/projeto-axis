import { Router } from 'express';
import { AuthedRequest, authMiddleware, identifyUser, requireRole } from '../middleware/auth';
import { adminClient } from '../supabaseClient';

const router = Router();

// GET /api/organizations/me — lista as organizações do usuário logado.
// This discovery route must not depend on a possibly stale x-org-id stored by
// the browser, otherwise an old/deleted org can hide valid memberships.
router.get('/me', identifyUser as any, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data: memberships, error } = await adminClient
    .from('org_members')
    .select('id, org_id, role')
    .eq('user_id', r.user.id);

  if (error) return res.status(500).json({ error: 'Failed to resolve organization' });

  const result = (memberships || []).map((m: any) => ({
    org_id: m.org_id,
    role: m.role,
    org_member_id: m.id,
  }));
  const requestedOrgId = req.headers['x-org-id'] as string | undefined;
  const active = result.find((m) => m.org_id === requestedOrgId) || result[0];
  res.json({ memberships: result, active_org_id: active?.org_id || '' });
});

// POST /api/organizations — cria uma clínica nova e vira 'owner' dela.
// Usada uma vez, no onboarding do primeiro usuário de cada clínica.
// Só exige um usuário identificado (não uma org já existente).
router.post('/', identifyUser as any, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { name, full_name, crm } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Nome da clínica é obrigatório' });

  const { data: org, error: orgError } = await adminClient
    .from('organizations')
    .insert({ name })
    .select()
    .single();
  if (orgError) return res.status(400).json({ error: orgError });

  const { data: member, error: memberError } = await adminClient
    .from('org_members')
    .insert({
      org_id: org.id,
      user_id: r.user.id,
      role: 'owner',
      full_name: full_name || r.user.email,
      crm: crm || null,
    })
    .select()
    .single();
  if (memberError) {
    // Evita organização órfã: se o membro falhar, desfaz a org criada.
    await adminClient.from('organizations').delete().eq('id', org.id);
    return res.status(400).json({ error: memberError });
  }

  res.status(201).json({ organization: org, membership: member });
});

// GET /api/organizations/members — lista membros da org ativa
router.get('/members', authMiddleware as any, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data, error } = await r.supabase.from('org_members').select('*').eq('org_id', r.orgId);
  if (error) return res.status(400).json({ error });
  res.json(data || []);
});

// POST /api/organizations/members — convida/adiciona um membro (só owner)
router.post('/members', authMiddleware as any, requireRole('owner') as any, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { user_id, role, full_name, crm } = req.body || {};
  if (!user_id || !role) return res.status(400).json({ error: 'user_id e role são obrigatórios' });

  const { data, error } = await adminClient
    .from('org_members')
    .insert({ org_id: r.orgId, user_id, role, full_name, crm: crm || null })
    .select()
    .single();
  if (error) return res.status(400).json({ error });
  res.status(201).json(data);
});

export default router;

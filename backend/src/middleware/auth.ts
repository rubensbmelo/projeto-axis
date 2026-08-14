import { Request, Response, NextFunction } from 'express';
import { adminClient, createClientForUser } from '../supabaseClient';

export interface OrgMembership {
  org_id: string;
  role: string;
  org_member_id: string;
}

export interface AuthedRequest extends Request {
  user: any;
  supabase: any;
  memberships: OrgMembership[];
  orgId: string; // organização ativa para esta requisição
  orgMemberId: string; // id do org_members do usuário na org ativa
  orgRole: string;
}

// Só identifica o usuário do token, sem exigir organização.
// Usado em rotas de onboarding (ex: criar a primeira clínica).
export async function identifyUser(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : undefined;
    if (!token) return res.status(401).json({ error: 'Missing access token' });

    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid token' });

    const r = req as AuthedRequest;
    r.user = data.user;
    r.supabase = createClientForUser(token);
    (r as any)._token = token;
    next();
  } catch (err) {
    console.error('identifyUser error', err);
    res.status(500).json({ error: 'Internal auth error' });
  }
}

// Identifica o usuário E resolve a organização ativa. Exige que o usuário
// já pertença a pelo menos uma organização (ver POST /api/organizations).
// Se pertencer a mais de uma, o cliente manda o header 'x-org-id'.
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  identifyUser(req, res, async () => {
    try {
      const r = req as AuthedRequest;

      const { data: memberships, error: memberError } = await adminClient
        .from('org_members')
        .select('id, org_id, role')
        .eq('user_id', r.user.id);

      if (memberError) return res.status(500).json({ error: 'Failed to resolve organization' });
      if (!memberships || memberships.length === 0) {
        return res.status(403).json({ error: 'Usuário não pertence a nenhuma organização. Crie uma organização primeiro.' });
      }

      const requestedOrgId = req.headers['x-org-id'] as string | undefined;
      const active = requestedOrgId
        ? memberships.find((m: any) => m.org_id === requestedOrgId)
        : memberships[0];

      if (!active) return res.status(403).json({ error: 'Usuário não pertence à organização informada' });

      r.memberships = memberships.map((m: any) => ({ org_id: m.org_id, role: m.role, org_member_id: m.id }));
      r.orgId = active.org_id;
      r.orgMemberId = active.id;
      r.orgRole = active.role;

      next();
    } catch (err) {
      console.error('auth middleware error', err);
      res.status(500).json({ error: 'Internal auth error' });
    }
  });
}

// Bloqueia rotas que só owner/doctor podem usar (ex: apagar registros)
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const r = req as AuthedRequest;
    if (!roles.includes(r.orgRole)) {
      return res.status(403).json({ error: 'Permissão insuficiente para esta ação' });
    }
    next();
  };
}

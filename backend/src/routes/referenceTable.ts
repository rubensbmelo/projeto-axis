import { Router } from 'express';
import { AuthedRequest, requireRole } from '../middleware/auth';

const canWrite = requireRole('owner', 'doctor', 'secretary') as any;

// Fábrica de rotas CRUD simples para tabelas de referência por organização
// (hospitals, insurers, suppliers) — todas têm o mesmo formato: { id, org_id, name }.
// GET é liberado pra qualquer membro (inclusive viewer); escrita não.
export function referenceTableRouter(tableName: string) {
  const router = Router();

  router.get('/', async (req, res) => {
    const r = req as unknown as AuthedRequest;
    const { data, error } = await r.supabase
      .from(tableName)
      .select('*')
      .eq('org_id', r.orgId)
      .order('name', { ascending: true });
    if (error) return res.status(400).json({ error });
    res.json(data || []);
  });

  router.post('/', canWrite, async (req, res) => {
    const r = req as unknown as AuthedRequest;
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ error: 'Campo "name" é obrigatório' });

    const { data, error } = await r.supabase
      .from(tableName)
      .insert({ org_id: r.orgId, name })
      .select()
      .single();
    if (error) return res.status(400).json({ error });
    res.status(201).json(data);
  });

  router.put('/:id', canWrite, async (req, res) => {
    const r = req as unknown as AuthedRequest;
    const { name } = req.body || {};
    const { data, error } = await r.supabase
      .from(tableName)
      .update({ name })
      .eq('id', req.params.id)
      .eq('org_id', r.orgId)
      .select()
      .single();
    if (error) return res.status(400).json({ error });
    res.json(data);
  });

  router.delete('/:id', canWrite, async (req, res) => {
    const r = req as unknown as AuthedRequest;
    const { error } = await r.supabase
      .from(tableName)
      .delete()
      .eq('id', req.params.id)
      .eq('org_id', r.orgId);
    if (error) return res.status(400).json({ error });
    res.json({ deleted: true });
  });

  return router;
}

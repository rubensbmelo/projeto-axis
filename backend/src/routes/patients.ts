import { Router } from 'express';
import { AuthedRequest, requireRole } from '../middleware/auth';

const canWrite = requireRole('owner', 'doctor', 'secretary') as any;
const router = Router();

router.get('/', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const search = (req.query.search as string) || '';

  let query = r.supabase.from('patients').select('*').eq('org_id', r.orgId);
  if (search) query = query.ilike('full_name', `%${search}%`);

  const { data, error } = await query.order('full_name', { ascending: true });
  if (error) return res.status(400).json({ error });
  res.json(data || []);
});

router.get('/:id', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data, error } = await r.supabase
    .from('patients')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', r.orgId)
    .single();
  if (error) return res.status(404).json({ error });
  res.json(data);
});

router.post('/', canWrite, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { full_name, cpf, birth_date, phone, address } = req.body || {};
  if (!full_name) return res.status(400).json({ error: 'Nome do paciente é obrigatório' });

  const { data, error } = await r.supabase
    .from('patients')
    .insert({ org_id: r.orgId, full_name, cpf: cpf || null, birth_date: birth_date || null, phone: phone || null, address: address || null })
    .select()
    .single();
  if (error) return res.status(400).json({ error });
  res.status(201).json(data);
});

router.put('/:id', canWrite, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { full_name, cpf, birth_date, phone, address } = req.body || {};

  const { data, error } = await r.supabase
    .from('patients')
    .update({ full_name, cpf, birth_date, phone, address })
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
    .from('patients')
    .delete()
    .eq('id', req.params.id)
    .eq('org_id', r.orgId);
  if (error) return res.status(400).json({ error });
  res.json({ deleted: true });
});

export default router;

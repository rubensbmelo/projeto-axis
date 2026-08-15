import { Router } from 'express';
import { AuthedRequest, requireRole } from '../middleware/auth';
import { parseOrError, referenceSchema } from '../lib/validation';

const canWrite = requireRole('owner', 'doctor', 'secretary') as any;

// Fábrica de rotas CRUD simples para tabelas de referência por organização
// (hospitals, insurers, suppliers) — todas têm o mesmo formato: { id, org_id, name }.
// GET é liberado pra qualquer membro (inclusive viewer); escrita não.
export function referenceTableRouter(tableName: string) {
  const router = Router();
  const caseField = `${tableName.slice(0, -1)}_id`;

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

  router.get('/:id/summary', async (req, res) => {
    const r = req as unknown as AuthedRequest;
    const { data: reference, error: referenceError } = await r.supabase
      .from(tableName)
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', r.orgId)
      .single();
    if (referenceError) return res.status(404).json({ error: referenceError });

    let casesQuery = r.supabase
      .from('surgery_cases')
      .select('status, valor_cobranca')
      .eq('org_id', r.orgId)
      .eq(caseField, req.params.id);
    if (r.orgRole === 'doctor') casesQuery = casesQuery.eq('doctor_id', r.orgMemberId);
    const { data: cases, error: casesError } = await casesQuery;
    if (casesError) return res.status(400).json({ error: casesError });

    const rows = cases || [];
    const valor_total_faturado = rows
      .filter((row: any) => ['faturado', 'pago'].includes(row.status))
      .reduce((sum: number, row: any) => sum + (Number(row.valor_cobranca) || 0), 0);

    res.json({ reference, total_casos: rows.length, valor_total_faturado });
  });

  router.get('/:id', async (req, res) => {
    const r = req as unknown as AuthedRequest;
    const { data, error } = await r.supabase
      .from(tableName)
      .select('*')
      .eq('id', req.params.id)
      .eq('org_id', r.orgId)
      .single();
    if (error) return res.status(404).json({ error });
    res.json(data);
  });

  router.post('/', canWrite, async (req, res) => {
    const r = req as unknown as AuthedRequest;
    const parsed = parseOrError(referenceSchema, req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { name } = parsed.value;

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
    const parsed = parseOrError(referenceSchema, req.body || {});
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { name } = parsed.value;

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

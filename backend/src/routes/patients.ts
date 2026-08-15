import { Router } from 'express';
import { AuthedRequest, requireRole } from '../middleware/auth';
import { patientSchema, patientUpdateSchema, parseOrError } from '../lib/validation';

const canWrite = requireRole('owner', 'doctor', 'secretary') as any;
const router = Router();

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = a[i - 1] === b[j - 1]
        ? diagonal
        : Math.min(diagonal + 1, previous[j] + 1, previous[j - 1] + 1);
      diagonal = above;
    }
  }
  return previous[b.length];
}

function similarName(a: string, b: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  if (shorter.length >= 6 && (left.includes(right) || right.includes(left))) return true;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length) >= 0.85;
}

function cpfVariants(value?: string): string[] {
  if (!value) return [];
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11) return [value];
  return [digits, `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`];
}

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

router.get('/:id/summary', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data: patient, error: patientError } = await r.supabase
    .from('patients')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', r.orgId)
    .single();
  if (patientError) return res.status(404).json({ error: patientError });

  let casesQuery = r.supabase
    .from('surgery_cases')
    .select('status, valor_cobranca')
    .eq('org_id', r.orgId)
    .eq('patient_id', req.params.id);
  if (r.orgRole === 'doctor') casesQuery = casesQuery.eq('doctor_id', r.orgMemberId);
  const { data: cases, error: casesError } = await casesQuery;
  if (casesError) return res.status(400).json({ error: casesError });

  const rows = cases || [];
  const valor_total_faturado = rows
    .filter((row: any) => ['faturado', 'pago'].includes(row.status))
    .reduce((sum: number, row: any) => sum + (Number(row.valor_cobranca) || 0), 0);

  res.json({
    patient,
    total_cirurgias: rows.length,
    valor_total_faturado,
  });
});

router.post('/', canWrite, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const body = req.body || {};

  const parsed = parseOrError(patientSchema, body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const { full_name, cpf, birth_date, phone, address } = parsed.value;
  // Busca apenas candidatos indexáveis. A similaridade final continua em JS,
  // mas não carregamos toda a base da organização para cada cadastro.
  const nameTokens = full_name.split(/\s+/).map((token) => token.replace(/[%_]/g, '')).filter((token) => token.length >= 3);
  const nameCandidates = nameTokens.length > 0
    ? nameTokens.map((token) => r.supabase
      .from('patients')
      .select('id, full_name, cpf')
      .eq('org_id', r.orgId)
      .ilike('full_name', `%${token}%`))
    : [r.supabase
      .from('patients')
      .select('id, full_name, cpf')
      .eq('org_id', r.orgId)
      .ilike('full_name', `%${full_name}%`)];
  const cpfCandidates = cpfVariants(cpf).map((variant) => r.supabase
    .from('patients')
    .select('id, full_name, cpf')
    .eq('org_id', r.orgId)
    .eq('cpf', variant));
  const candidateResults = await Promise.all([...nameCandidates, ...cpfCandidates]);
  const duplicateQueryError = candidateResults.find((result) => result.error)?.error;
  if (duplicateQueryError) return res.status(400).json({ error: duplicateQueryError });

  const existingPatients = Array.from(new Map(
    candidateResults.flatMap((result) => result.data || []).map((patient: any) => [patient.id, patient])
  ).values());

  const normalizedCpf = cpf ? cpf.replace(/\D/g, '') : '';
  const matches = (existingPatients || []).filter((patient: any) => {
    const sameCpf = normalizedCpf && patient.cpf && patient.cpf.replace(/\D/g, '') === normalizedCpf;
    return Boolean(sameCpf) || similarName(full_name, patient.full_name);
  });

  const { data, error } = await r.supabase
    .from('patients')
    .insert({ org_id: r.orgId, full_name, cpf: cpf || null, birth_date: birth_date || null, phone: phone || null, address: address || null })
    .select()
    .single();
  if (error) return res.status(400).json({ error });
  res.status(201).json(matches.length > 0
    ? { ...data, warning: 'possible_duplicate', matches }
    : data);
});

router.put('/:id', canWrite, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const body = req.body || {};

  const parsed = parseOrError(patientUpdateSchema, body);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const { full_name, cpf, birth_date, phone, address } = parsed.value;
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

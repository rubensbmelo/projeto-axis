import { Router } from 'express';
import { AuthedRequest, requireRole } from '../middleware/auth';
import { caseCreateSchema, caseUpdateSchema, parseOrError, statusTransitionError } from '../lib/validation';
import { filterCasesByAlert, type CaseAlertType } from '../lib/caseAlerts';

const router = Router();

// Campos editáveis pelo cliente (nunca deixamos org_id/id virem do body)
const EDITABLE_FIELDS = [
  'patient_id', 'doctor_id', 'hospital_id', 'insurer_id', 'supplier_id', 'procedure_id',
  'matricula', 'guia_numero', 'usa_opme', 'ficha_de_sala', 'status',
  'data_solicitacao', 'data_autorizacao', 'data_agendamento', 'data_cirurgia',
  'entrada_cobranca', 'valor_cobranca', 'data_pagamento', 'data_recebimento',
  'valor_cirurgia', 'comissao_medico', 'receita_adicional', 'observacoes',
];

function pickEditableFields(body: any) {
  const out: Record<string, any> = {};
  for (const key of EDITABLE_FIELDS) {
    // Ignora undefined E string vazia (campo opcional "não enviado")
    if (body[key] !== undefined && body[key] !== '') out[key] = body[key];
  }
  return out;
}

// A auditoria é gravada pelo TRIGGER no banco (migration 004), na MESMA
// transação da alteração — não precisa mais do insert explícito aqui.
// Impede que um caso referencie paciente/médico/hospital/convênio/fornecedor
// de OUTRA organização (RLS não pega isso: foreign keys no Postgres não
// respeitam RLS ao validar a existência da linha referenciada).
const ORG_SCOPED_REFERENCES: Record<string, string> = {
  patient_id: 'patients',
  doctor_id: 'org_members',
  hospital_id: 'hospitals',
  insurer_id: 'insurers',
  supplier_id: 'suppliers',
  procedure_id: 'procedures',
};

async function validateOrgReferences(supabase: any, orgId: string, payload: Record<string, any>): Promise<string | null> {
  for (const [field, table] of Object.entries(ORG_SCOPED_REFERENCES)) {
    const value = payload[field];
    if (value === undefined || value === null) continue; // campo opcional não enviado
    const { data, error } = await supabase.from(table).select('id').eq('id', value).eq('org_id', orgId).maybeSingle();
    if (error) return `Falha ao validar ${field}`;
    if (!data) return `${field} não pertence a esta organização ou não existe`;
  }
  return null; // sem erro
}

const CASE_SELECT = `
  *,
  patient:patients(id, full_name, cpf),
  hospital:hospitals(id, name),
  insurer:insurers(id, name),
  supplier:suppliers(id, name),
  procedure:procedures(id, name),
  doctor:org_members!surgery_cases_doctor_id_fkey(id, full_name)
`;

// GET /api/cases — lista com filtros opcionais
router.get('/', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { status, doctor_id, from, to, search, alert } = req.query as Record<string, string>;

  let query = r.supabase.from('surgery_cases').select(CASE_SELECT).eq('org_id', r.orgId);
  if (r.orgRole === 'doctor') query = query.eq('doctor_id', r.orgMemberId);
  if (status) query = query.eq('status', status);
  if (doctor_id) query = query.eq('doctor_id', doctor_id);
  if (from) query = query.gte('data_cirurgia', from);
  if (to) query = query.lte('data_cirurgia', to);
  if (search) {
    // Busca por nome de paciente E por nome de procedimento (via tabela de
    // referência). Primeiro achamos os ids correspondentes e filtramos.
    const [patientRes, procRes] = await Promise.all([
      r.supabase.from('patients').select('id').eq('org_id', r.orgId).ilike('full_name', `%${search}%`),
      r.supabase.from('procedures').select('id').eq('org_id', r.orgId).ilike('name', `%${search}%`),
    ]);
    if (patientRes.error) return res.status(400).json({ error: patientRes.error });
    if (procRes.error) return res.status(400).json({ error: procRes.error });

    const patientIds = (patientRes.data || []).map((p: any) => p.id);
    const procIds = (procRes.data || []).map((p: any) => p.id);
    const conditions: string[] = [];
    if (patientIds.length > 0) conditions.push(`patient_id.in.(${patientIds.join(',')})`);
    if (procIds.length > 0) conditions.push(`procedure_id.in.(${procIds.join(',')})`);

    if (conditions.length > 0) {
      query = query.or(conditions.join(','));
    } else {
      // Nenhum paciente/procedimento casa: retorna vazio.
      query = query.eq('id', '00000000-0000-0000-0000-000000000000');
    }
  }

  const { data: queriedData, error } = await query.order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error });
  if (alert && !['authorization', 'billing'].includes(alert)) {
    return res.status(400).json({ error: 'Alerta inválido' });
  }
  const data = alert ? filterCasesByAlert(queriedData || [], alert as CaseAlertType) : queriedData || [];
  res.json(data);
});

// GET /api/cases/:id
router.get('/:id', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data, error } = await r.supabase
    .from('surgery_cases')
    .select(CASE_SELECT)
    .eq('id', req.params.id)
    .eq('org_id', r.orgId)
    .single();
  if (error) return res.status(404).json({ error });
  res.json(data);
});

// GET /api/cases/:id/audit — histórico de auditoria do caso (mais recente primeiro)
router.get('/:id/audit', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data, error } = await r.supabase
    .from('audit_log')
    .select('id, action, field_changed, old_value, new_value, user_id, created_at')
    .eq('case_id', req.params.id)
    .eq('org_id', r.orgId)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error });
  res.json(data || []);
});

// POST /api/cases — viewer não pode criar
router.post('/', requireRole('owner', 'doctor', 'secretary') as any, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const payload = pickEditableFields(req.body || {});

  const parsed = parseOrError(caseCreateSchema, payload);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });

  const refError = await validateOrgReferences(r.supabase, r.orgId, parsed.value);
  if (refError) return res.status(400).json({ error: refError });

  const { data, error } = await r.supabase
    .from('surgery_cases')
    .insert({ ...parsed.value, org_id: r.orgId, created_by: r.orgMemberId })
    .select(CASE_SELECT)
    .single();
  if (error) return res.status(400).json({ error });

  res.status(201).json(data);
});

// PUT /api/cases/:id — viewer não pode editar; grava um audit_log por campo alterado
router.put('/:id', requireRole('owner', 'doctor', 'secretary') as any, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const payload = pickEditableFields(req.body || {});

  const parsed = parseOrError(caseUpdateSchema, payload);
  if (!parsed.ok) return res.status(400).json({ error: parsed.error });
  const update = parsed.value;

  const refError = await validateOrgReferences(r.supabase, r.orgId, update);
  if (refError) return res.status(400).json({ error: refError });

  const { data: before, error: beforeError } = await r.supabase
    .from('surgery_cases')
    .select('*')
    .eq('id', req.params.id)
    .eq('org_id', r.orgId)
    .single();
  if (beforeError) return res.status(404).json({ error: beforeError });

  const transitionError = statusTransitionError(before.status, update.status);
  if (transitionError) return res.status(400).json({ error: transitionError });

  const { data: after, error } = await r.supabase
    .from('surgery_cases')
    .update(update)
    .eq('id', req.params.id)
    .eq('org_id', r.orgId)
    .select(CASE_SELECT)
    .single();
  if (error) return res.status(400).json({ error });

  res.json(after);
});

// DELETE /api/cases/:id — só owner/doctor podem apagar (secretária não)
router.delete('/:id', requireRole('owner', 'doctor') as any, async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { error } = await r.supabase.from('surgery_cases').delete().eq('id', req.params.id).eq('org_id', r.orgId);
  if (error) return res.status(400).json({ error });

  res.json({ deleted: true });
});

export default router;

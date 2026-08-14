import { Router } from 'express';
import { AuthedRequest } from '../middleware/auth';
import { filterCasesByAlert } from '../lib/caseAlerts';

const router = Router();

function countBy<T>(rows: T[], keyFn: (row: T) => string | null | undefined) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const key = keyFn(row) || 'Não informado';
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function scopedCases(r: AuthedRequest, query: any) {
  const scoped = query.eq('org_id', r.orgId);
  return r.orgRole === 'doctor' ? scoped.eq('doctor_id', r.orgMemberId) : scoped;
}

// GET /api/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Retorna os 4 recortes pedidos: cirurgias por mês, ranking de hospital,
// ranking de convênio e ranking de procedimento.
router.get('/summary', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { from, to } = req.query as Record<string, string>;

  // Total de casos da organização, independente de status ou de ter
  // data_cirurgia preenchida.
  const { count: totalCasos, error: countError } = await scopedCases(
    r,
    r.supabase.from('surgery_cases').select('*', { count: 'exact', head: true })
  );
  if (countError) return res.status(400).json({ error: countError });

  let query = scopedCases(
    r,
    r.supabase
    .from('surgery_cases')
    .select('data_cirurgia, valor_cobranca, hospital:hospitals(name), insurer:insurers(name), procedure:procedures(name), status')
    .not('data_cirurgia', 'is', null)
  );

  if (from) query = query.gte('data_cirurgia', from);
  if (to) query = query.lte('data_cirurgia', to);

  const { data, error } = await query;
  if (error) return res.status(400).json({ error });

  const rows = data || [];

  const byMonth: Record<string, number> = {};
  for (const row of rows) {
    const month = String(row.data_cirurgia).slice(0, 7); // YYYY-MM
    byMonth[month] = (byMonth[month] || 0) + 1;
  }
  const cirurgias_por_mes = Object.entries(byMonth)
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const por_hospital = countBy(rows, (row: any) => row.hospital?.name);
  const por_convenio = countBy(rows, (row: any) => row.insurer?.name);
  const por_procedimento = countBy(rows, (row: any) => row.procedure?.name);

  // Valor faturado = soma dos casos já faturados/pagos (status reflete cobrança).
  const valor_total_faturado = rows
    .filter((row: any) => ['faturado', 'pago'].includes(row.status))
    .reduce((sum: number, row: any) => sum + (Number(row.valor_cobranca) || 0), 0);

  // Recebimentos: o que realmente entrou, agrupado pela data de recebimento.
  const { data: recv, error: recvError } = await scopedCases(
    r,
    r.supabase
    .from('surgery_cases')
    .select('data_recebimento, valor_cobranca')
    .not('data_recebimento', 'is', null)
  );
  if (recvError) return res.status(400).json({ error: recvError });

  const recvRows = recv || [];
  const valor_total_recebido = recvRows.reduce((sum: number, row: any) => sum + (Number(row.valor_cobranca) || 0), 0);

  const recvByMonth: Record<string, { count: number; total: number }> = {};
  for (const row of recvRows) {
    const month = String(row.data_recebimento).slice(0, 7); // YYYY-MM
    const entry = recvByMonth[month] || { count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(row.valor_cobranca) || 0;
    recvByMonth[month] = entry;
  }
  const recebimentos_por_mes = Object.entries(recvByMonth)
    .map(([month, v]) => ({ month, count: v.count, total: v.total }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // Comissão por médico.
  const { data: comm, error: commError } = await scopedCases(
    r,
    r.supabase
    .from('surgery_cases')
    .select('comissao_medico, doctor:org_members!surgery_cases_doctor_id_fkey(full_name)')
    .not('comissao_medico', 'is', null)
  );
  if (commError) return res.status(400).json({ error: commError });

  const commByDoctor: Record<string, number> = {};
  for (const row of comm || []) {
    const name = (row as any).doctor?.full_name || 'Não informado';
    commByDoctor[name] = (commByDoctor[name] || 0) + (Number(row.comissao_medico) || 0);
  }
  const comissao_por_medico = Object.entries(commByDoctor)
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => b.total - a.total);

  // Comissão do mês corrente (por data_cirurgia) — destaque do painel do médico.
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data: commMonth, error: commMonthError } = await scopedCases(
    r,
    r.supabase
    .from('surgery_cases')
    .select('comissao_medico')
    .gte('data_cirurgia', `${month}-01`)
    .lte('data_cirurgia', `${month}-31`)
  );
  if (commMonthError) return res.status(400).json({ error: commMonthError });
  const comissao_do_mes = (commMonth || []).reduce((s: number, row: any) => s + (Number(row.comissao_medico) || 0), 0);

  const { data: billingRows, error: billingError } = await scopedCases(
    r,
    r.supabase.from('surgery_cases').select('status, valor_cobranca, entrada_cobranca')
  );
  if (billingError) return res.status(400).json({ error: billingError });

  const faturamentoByMonth: Record<string, number> = {};
  const chartStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  for (let i = 0; i < 6; i += 1) {
    const date = new Date(Date.UTC(chartStart.getUTCFullYear(), chartStart.getUTCMonth() + i, 1));
    faturamentoByMonth[date.toISOString().slice(0, 7)] = 0;
  }
  for (const row of billingRows || []) {
    if (!['faturado', 'pago'].includes(row.status) || !row.entrada_cobranca) continue;
    const key = String(row.entrada_cobranca).slice(0, 7);
    if (key in faturamentoByMonth) faturamentoByMonth[key] += Number(row.valor_cobranca) || 0;
  }
  const faturamento_por_mes = Object.entries(faturamentoByMonth).map(([mes, valor]) => ({ mes, valor }));

  res.json({
    total_casos: totalCasos ?? 0,
    cirurgias_realizadas: rows.length,
    valor_total_faturado,
    valor_total_recebido,
    comissao_do_mes,
    faturamento_por_mes,
    cirurgias_por_mes,
    por_hospital,
    por_convenio,
    por_procedimento,
    recebimentos_por_mes,
    comissao_por_medico,
  });
});

// GET /api/reports/pendencias-financeiras — casos faturados mas sem
// pagamento/recebimento registrado, pra fechar o funil que estava 100%
// invisível na planilha original.
router.get('/pendencias-financeiras', async (req, res) => {
  const r = req as unknown as AuthedRequest;

  const { data, error } = await scopedCases(
    r,
    r.supabase.from('surgery_cases')
    .select('id, status, procedure:procedures(name), valor_cobranca, entrada_cobranca, data_pagamento, data_recebimento, patient:patients(full_name), insurer:insurers(name)')
    .eq('status', 'faturado')
    .is('data_recebimento', null)
  );

  if (error) return res.status(400).json({ error });
  res.json(data || []);
});

router.get('/alerts', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data, error } = await scopedCases(
    r,
    r.supabase.from('surgery_cases').select('id, status, doctor_id, data_solicitacao, data_autorizacao, entrada_cobranca, data_recebimento')
  );
  if (error) return res.status(400).json({ error });

  const rows = data || [];
  const authorization = filterCasesByAlert(rows, 'authorization');
  const billing = filterCasesByAlert(rows, 'billing');
  res.json({
    authorization: { count: authorization.length },
    billing: { count: billing.length },
  });
});

export default router;

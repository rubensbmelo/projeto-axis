export type CaseAlertType = 'authorization' | 'billing' | 'value_below_historical';

export interface ValueBelowHistoricalCase {
  id: string;
  procedure_id: string;
  insurer_id: string;
  valor_cobranca: number;
  media_historica: number;
  [key: string]: any;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function elapsedCalendarDays(value: string | null | undefined, now = new Date()): number {
  const date = parseDate(value);
  if (!date) return 0;
  return Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - date.getTime()) / 86400000);
}

export function elapsedBusinessDays(value: string | null | undefined, now = new Date()): number {
  const date = parseDate(value);
  if (!date) return 0;

  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const cursor = new Date(date);
  let businessDays = 0;

  while (cursor < end) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) businessDays += 1;
  }

  return businessDays;
}

export function matchesCaseAlert(row: any, type: CaseAlertType, now = new Date()): boolean {
  if (type === 'authorization') {
    return ['solicitado', 'autorizado'].includes(row.status)
      && !!row.data_solicitacao
      && !row.data_autorizacao
      && elapsedBusinessDays(row.data_solicitacao, now) > 21;
  }

  if (type === 'billing') {
    return row.status === 'faturado'
    && !!row.entrada_cobranca
    && !row.data_recebimento
    && elapsedCalendarDays(row.entrada_cobranca, now) > 30;
  }

  return false;
}

export function filterCasesByAlert(rows: any[], type: CaseAlertType, now = new Date()): any[] {
  if (type === 'value_below_historical') return findValueBelowHistorical(rows);
  return rows.filter((row) => matchesCaseAlert(row, type, now));
}

export function findValueBelowHistorical(rows: any[]): ValueBelowHistoricalCase[] {
  const eligible = rows.filter((row) => (
    ['faturado', 'pago'].includes(row.status)
    && row.procedure_id
    && row.insurer_id
    && row.valor_cobranca !== null
    && row.valor_cobranca !== undefined
    && Number.isFinite(Number(row.valor_cobranca))
  ));

  const groups = new Map<string, any[]>();
  for (const row of eligible) {
    const key = `${row.procedure_id}:${row.insurer_id}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  const alerts: ValueBelowHistoricalCase[] = [];
  for (const current of eligible) {
    const key = `${current.procedure_id}:${current.insurer_id}`;
    const history = (groups.get(key) || []).filter((row) => row.id !== current.id);
    if (history.length < 5) continue;

    const average = history.reduce((sum, row) => sum + Number(row.valor_cobranca), 0) / history.length;
    if (Number(current.valor_cobranca) <= average * 0.8) {
      alerts.push({
        ...current,
        valor_cobranca: Number(current.valor_cobranca),
        media_historica: average,
      });
    }
  }

  return alerts;
}

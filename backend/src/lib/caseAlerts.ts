export type CaseAlertType = 'authorization' | 'billing';

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

  return row.status === 'faturado'
    && !!row.entrada_cobranca
    && !row.data_recebimento
    && elapsedCalendarDays(row.entrada_cobranca, now) > 30;
}

export function filterCasesByAlert(rows: any[], type: CaseAlertType, now = new Date()): any[] {
  return rows.filter((row) => matchesCaseAlert(row, type, now));
}

export const STATUS_FLOW = [
  "solicitado",
  "autorizado",
  "agendado",
  "realizado",
  "faturado",
  "pago",
] as const;

export const STATUS_OPTIONS = [...STATUS_FLOW, "cancelado"];

export const STATUS_LABELS: Record<string, string> = {
  solicitado: "Solicitado",
  autorizado: "Autorizado",
  agendado: "Agendado",
  realizado: "Realizado",
  faturado: "Faturado",
  pago: "Pago",
  cancelado: "Cancelado",
};

// Variante do Badge + cor semântica por status. Realizado/pago já não ficam
// idênticos (verde neutro vs. verde forte).
export const STATUS_BADGE: Record<string, { variant: string; className?: string }> = {
  solicitado: { variant: "secondary", className: "bg-slate-100 text-slate-700" },
  autorizado: { variant: "secondary", className: "bg-slate-100 text-status-authorized" },
  agendado: { variant: "secondary", className: "bg-indigo-50 text-indigo-700" },
  realizado: { variant: "secondary", className: "bg-status-received-bg text-status-received-text" },
  faturado: { variant: "secondary", className: "bg-status-billed-bg text-status-billed-text" },
  pago: { variant: "secondary", className: "bg-status-received-bg text-status-received-text" },
  cancelado: { variant: "secondary", className: "bg-slate-100 text-slate-600" },
};

export type PaymentStatus = "autorizado" | "cobrado" | "recebido" | "cancelado";

export function paymentStatus(status?: string | null): PaymentStatus {
  if (status === "cancelado") return "cancelado";
  if (status === "faturado") return "cobrado";
  if (status === "pago") return "recebido";
  return "autorizado";
}

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  autorizado: "Autorizado",
  cobrado: "Cobrado",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

export const PAYMENT_STATUS_BADGE: Record<PaymentStatus, { variant: string; className?: string }> = {
  autorizado: { variant: "secondary", className: "bg-slate-100 text-status-authorized" },
  cobrado: { variant: "secondary", className: "bg-status-billed-bg text-status-billed-text" },
  recebido: { variant: "secondary", className: "bg-status-received-bg text-status-received-text" },
  cancelado: { variant: "secondary", className: "bg-slate-100 text-slate-600" },
};

export function paymentStatusLabel(status?: string | null): string {
  return PAYMENT_STATUS_LABELS[paymentStatus(status)];
}

export function statusLabel(s?: string | null): string {
  if (!s) return "—";
  return STATUS_LABELS[s] ?? s;
}

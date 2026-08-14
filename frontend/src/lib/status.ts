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
  solicitado: { variant: "outline", className: "text-sky-700" },
  autorizado: { variant: "outline", className: "text-blue-700" },
  agendado: { variant: "secondary", className: "text-purple-700" },
  realizado: { variant: "default", className: "bg-green-600 text-white" },
  faturado: { variant: "outline", className: "text-amber-700" },
  pago: { variant: "default", className: "bg-emerald-600 text-white" },
  cancelado: { variant: "destructive", className: "" },
};

export function statusLabel(s?: string | null): string {
  if (!s) return "—";
  return STATUS_LABELS[s] ?? s;
}

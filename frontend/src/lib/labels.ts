// Rótulos humanos para campos do formulário de caso (evita expor o nome
// interno do banco, ex: data_solicitacao → "Data da solicitação").
export const FIELD_LABELS: Record<string, string> = {
  data_solicitacao: "Data da solicitação",
  data_autorizacao: "Data da autorização",
  data_agendamento: "Data do agendamento",
  data_cirurgia: "Data da cirurgia",
  entrada_cobranca: "Entrada da cobrança",
  data_pagamento: "Data do pagamento",
  data_recebimento: "Data do recebimento",
  valor_cobranca: "Valor da cobrança",
  valor_cirurgia: "Valor da cirurgia",
  comissao_medico: "Comissão do médico",
  receita_adicional: "Receita adicional",
};

export function fieldLabel(name: string): string {
  return FIELD_LABELS[name] ?? name.replace(/_/g, " ");
}

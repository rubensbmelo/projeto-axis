export interface OrgMembership {
  org_id: string;
  role: string;
  org_member_id: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: string;
  full_name: string | null;
  crm: string | null;
}

export interface Patient {
  id: string;
  org_id: string;
  full_name: string;
  cpf: string | null;
  birth_date: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
}

export interface PatientCreateResponse extends Patient {
  warning?: "possible_duplicate";
  matches?: Pick<Patient, "id" | "full_name" | "cpf">[];
}

export interface PatientSummary {
  patient: Patient;
  total_cirurgias: number;
  valor_total_faturado: number;
}

export interface Reference {
  id: string;
  org_id: string;
  name: string;
}

export interface CaseRow {
  id: string;
  org_id: string;
  patient_id: string;
  doctor_id: string;
  hospital_id: string | null;
  insurer_id: string | null;
  supplier_id: string | null;
  procedure_id: string;
  matricula: string | null;
  guia_numero: string | null;
  usa_opme: boolean;
  ficha_de_sala: boolean;
  status: string;
  data_solicitacao: string | null;
  data_autorizacao: string | null;
  data_agendamento: string | null;
  data_cirurgia: string | null;
  entrada_cobranca: string | null;
  valor_cobranca: number | null;
  data_pagamento: string | null;
  data_recebimento: string | null;
  valor_cirurgia: number | null;
  comissao_medico: number | null;
  receita_adicional: number | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
  patient?: { id: string; full_name: string; cpf: string | null } | null;
  hospital?: { id: string; name: string } | null;
  insurer?: { id: string; name: string } | null;
  supplier?: { id: string; name: string } | null;
  procedure?: { id: string; name: string } | null;
  doctor?: { id: string; full_name: string } | null;
}

export interface PaginatedCases {
  data: CaseRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CasePayload {
  patient_id: string;
  doctor_id: string;
  hospital_id?: string | null;
  insurer_id?: string | null;
  supplier_id?: string | null;
  procedure_id: string;
  matricula?: string | null;
  guia_numero?: string | null;
  usa_opme?: boolean;
  ficha_de_sala?: boolean;
  status?: string;
  data_solicitacao?: string | null;
  data_autorizacao?: string | null;
  data_agendamento?: string | null;
  data_cirurgia?: string | null;
  entrada_cobranca?: string | null;
  valor_cobranca?: number | null;
  data_pagamento?: string | null;
  data_recebimento?: string | null;
  valor_cirurgia?: number | null;
  comissao_medico?: number | null;
  receita_adicional?: number | null;
  observacoes?: string | null;
}

export interface CaseDocument {
  id: string;
  org_id: string;
  case_id: string;
  document_type: string | null;
  file_name: string;
  storage_path: string;
  uploaded_by: string | null;
  uploaded_at: string;
}

export interface ReportSummary {
  total_casos: number;
  cirurgias_realizadas: number;
  valor_total_faturado: number;
  valor_total_recebido: number;
  comissao_do_mes: number;
  faturamento_por_mes: { mes: string; valor: number }[];
  cirurgias_por_mes: { month: string; count: number }[];
  por_hospital: { label: string; count: number }[];
  por_convenio: { label: string; count: number }[];
  por_fornecedor: { label: string; count: number }[];
  por_procedimento: { label: string; count: number }[];
  recebimentos_por_mes: { month: string; count: number; total: number }[];
  comissao_por_medico: { label: string; total: number }[];
}

export interface ReportAlerts {
  authorization: { count: number };
  billing: { count: number };
  valor_abaixo_historico: {
    count: number;
    cases: {
      id: string;
      procedure_id: string;
      insurer_id: string;
      valor_cobranca: number;
      media_historica: number;
      procedure?: { name: string } | null;
      insurer?: { name: string } | null;
    }[];
  };
}

export interface AuditEntry {
  id: string;
  action: string;
  field_changed: string | null;
  old_value: string | null;
  new_value: string | null;
  user_id: string;
  created_at: string;
}

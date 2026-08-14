import { z } from 'zod';

export const STATUS_FLOW = [
  'solicitado',
  'autorizado',
  'agendado',
  'realizado',
  'faturado',
  'pago',
] as const;

export const STATUS_VALUES = [...STATUS_FLOW, 'cancelado'];

const uuid = z.string().uuid('ID inválido');

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use AAAA-MM-DD)');

const money = z.number('Valor deve ser um número').min(0, 'Valor não pode ser negativo');

// Campos opcionais aceitam ausência; string vazia é tratada como "não enviado"
// na camada de pickEditableFields antes de chegar aqui.
export const caseCreateSchema = z
  .object({
    patient_id: uuid,
    doctor_id: uuid,
    hospital_id: uuid.optional(),
    insurer_id: uuid.optional(),
    supplier_id: uuid.optional(),
    matricula: z.string().max(200).optional(),
    guia_numero: z.string().max(200).optional(),
    procedimento: z.string().trim().min(1, 'Procedimento é obrigatório').max(500),
    usa_opme: z.boolean().optional(),
    ficha_de_sala: z.boolean().optional(),
    status: z.enum(STATUS_VALUES).optional(),
    data_solicitacao: isoDate.optional(),
    data_autorizacao: isoDate.optional(),
    data_agendamento: isoDate.optional(),
    data_cirurgia: isoDate.optional(),
    entrada_cobranca: isoDate.optional(),
    data_pagamento: isoDate.optional(),
    data_recebimento: isoDate.optional(),
    valor_cobranca: money.optional(),
    valor_cirurgia: money.optional(),
    comissao_medico: money.optional(),
    receita_adicional: money.optional(),
    observacoes: z.string().max(2000).optional(),
  })
  .strict();

// PUT: tudo opcional (atualização parcial). Transição de status é validada na
// rota, onde temos o status anterior.
export const caseUpdateSchema = z
  .object({
    patient_id: uuid.optional(),
    doctor_id: uuid.optional(),
    hospital_id: uuid.optional(),
    insurer_id: uuid.optional(),
    supplier_id: uuid.optional(),
    matricula: z.string().max(200).optional(),
    guia_numero: z.string().max(200).optional(),
    procedimento: z.string().trim().min(1, 'Procedimento é obrigatório').max(500).optional(),
    usa_opme: z.boolean().optional(),
    ficha_de_sala: z.boolean().optional(),
    status: z.enum(STATUS_VALUES).optional(),
    data_solicitacao: isoDate.optional(),
    data_autorizacao: isoDate.optional(),
    data_agendamento: isoDate.optional(),
    data_cirurgia: isoDate.optional(),
    entrada_cobranca: isoDate.optional(),
    data_pagamento: isoDate.optional(),
    data_recebimento: isoDate.optional(),
    valor_cobranca: money.optional(),
    valor_cirurgia: money.optional(),
    comissao_medico: money.optional(),
    receita_adicional: money.optional(),
    observacoes: z.string().max(2000).optional(),
  })
  .strict();

export const patientSchema = z
  .object({
    full_name: z.string().trim().min(1, 'Nome é obrigatório').max(300),
    cpf: z
      .string()
      .max(20)
      .refine((v) => v === '' || /^\d{11}$/.test(v.replace(/\D/g, '')), 'CPF inválido')
      .optional(),
    birth_date: isoDate.optional(),
    phone: z.string().max(50).optional(),
    address: z.string().max(500).optional(),
  })
  .strict();

export const referenceSchema = z
  .object({
    name: z.string().trim().min(1, 'Campo "name" é obrigatório').max(200),
  })
  .strict();

// Para PUT de paciente, todos os campos são opcionais (atualização parcial).
export const patientUpdateSchema = patientSchema.partial();

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseOrError<T>(schema: z.ZodType<T>, data: unknown): Result<T> {
  const result = schema.safeParse(data);
  if (result.success) return { ok: true, value: result.data };
  const message = result.error.issues[0]?.message ?? 'Payload inválido';
  return { ok: false, error: message };
}

// Ranking do fluxo para validar transição de status. Voltar é bloqueado,
// exceto para "cancelado" (permitido a partir de qualquer estado).
export function statusTransitionError(
  from: string | undefined | null,
  to: string | undefined
): string | null {
  if (!from || !to || to === from) return null;
  if (to === 'cancelado') return null;
  const fromIndex = STATUS_FLOW.indexOf(from as (typeof STATUS_FLOW)[number]);
  const toIndex = STATUS_FLOW.indexOf(to as (typeof STATUS_FLOW)[number]);
  if (fromIndex !== -1 && toIndex !== -1 && toIndex < fromIndex) {
    return `Não é possível voltar de "${from}" para "${to}". Use "cancelado" para encerrar o caso.`;
  }
  return null;
}

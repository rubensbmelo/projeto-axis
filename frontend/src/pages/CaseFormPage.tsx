import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type {
  CasePayload,
  CaseRow,
  OrgMember,
  Patient,
  Reference,
} from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Combobox } from "@/components/combobox";
import { Separator } from "@/components/ui/separator";
import { PageLoader } from "@/components/spinner";
import { STATUS_FLOW, STATUS_OPTIONS, statusLabel } from "@/lib/status";
import { fieldLabel } from "@/lib/labels";

const DATE_FIELDS: (keyof CaseFormValues)[] = [
  "data_solicitacao",
  "data_autorizacao",
  "data_agendamento",
  "data_cirurgia",
  "entrada_cobranca",
  "data_pagamento",
  "data_recebimento",
];

const MONEY_FIELDS: (keyof CaseFormValues)[] = [
  "valor_cobranca",
  "valor_cirurgia",
  "comissao_medico",
  "receita_adicional",
];

// Subdivisões de data para agrupar o formulário em blocos com hierarquia.
const SCHEDULE_DATES: (keyof CaseFormValues)[] = [
  "data_solicitacao",
  "data_autorizacao",
  "data_agendamento",
  "data_cirurgia",
];

const FINANCE_DATES: (keyof CaseFormValues)[] = [
  "entrada_cobranca",
  "data_pagamento",
  "data_recebimento",
];

interface CaseFormValues {
  patient_id: string;
  doctor_id: string;
  hospital_id: string;
  insurer_id: string;
  supplier_id: string;
  procedure_id: string;
  matricula: string;
  guia_numero: string;
  usa_opme: boolean;
  ficha_de_sala: boolean;
  status: string;
  data_solicitacao: string;
  data_autorizacao: string;
  data_agendamento: string;
  data_cirurgia: string;
  entrada_cobranca: string;
  data_pagamento: string;
  data_recebimento: string;
  valor_cobranca: string;
  valor_cirurgia: string;
  comissao_medico: string;
  receita_adicional: string;
  observacoes: string;
}

const EMPTY_VALUES: CaseFormValues = {
  patient_id: "",
  doctor_id: "",
  hospital_id: "",
  insurer_id: "",
  supplier_id: "",
  procedure_id: "",
  matricula: "",
  guia_numero: "",
  usa_opme: false,
  ficha_de_sala: false,
  status: "solicitado",
  data_solicitacao: "",
  data_autorizacao: "",
  data_agendamento: "",
  data_cirurgia: "",
  entrada_cobranca: "",
  data_pagamento: "",
  data_recebimento: "",
  valor_cobranca: "",
  valor_cirurgia: "",
  comissao_medico: "",
  receita_adicional: "",
  observacoes: "",
};

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function makeCaseSchema(currentStatus?: string) {
  const optionalDate = z
    .string()
    .refine((v) => v === "" || isIsoDate(v), "Data inválida");

  const optionalMoney = z
    .string()
    .refine(
      (v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0),
      "Valor deve ser um número >= 0"
    );

  const base = z.object({
    patient_id: z.string().min(1, "Paciente é obrigatório"),
    doctor_id: z.string().min(1, "Médico é obrigatório"),
    hospital_id: z.string(),
    insurer_id: z.string(),
    supplier_id: z.string(),
    procedure_id: z.string().min(1, "Procedimento é obrigatório"),
    matricula: z.string(),
    guia_numero: z.string(),
    usa_opme: z.boolean(),
    ficha_de_sala: z.boolean(),
    status: z.string().min(1, "Status é obrigatório"),
    data_solicitacao: optionalDate,
    data_autorizacao: optionalDate,
    data_agendamento: optionalDate,
    data_cirurgia: optionalDate,
    entrada_cobranca: optionalDate,
    data_pagamento: optionalDate,
    data_recebimento: optionalDate,
    valor_cobranca: optionalMoney,
    valor_cirurgia: optionalMoney,
    comissao_medico: optionalMoney,
    receita_adicional: optionalMoney,
    observacoes: z.string(),
  });

  if (!currentStatus) return base;

  return base.superRefine((values, ctx) => {
    if (values.status === "cancelado") return;
    const currentIndex = STATUS_FLOW.indexOf(currentStatus as (typeof STATUS_FLOW)[number]);
    const nextIndex = STATUS_FLOW.indexOf(values.status as (typeof STATUS_FLOW)[number]);
    if (currentIndex !== -1 && nextIndex !== -1 && nextIndex < currentIndex) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: `Não é possível voltar de "${currentStatus}" para "${values.status}". Use "cancelado" para encerrar o caso.`,
      });
    }
  });
}

export default function CaseFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();

  const [currentStatus, setCurrentStatus] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [hospitals, setHospitals] = useState<Reference[]>([]);
  const [insurers, setInsurers] = useState<Reference[]>([]);
  const [suppliers, setSuppliers] = useState<Reference[]>([]);
  const [procedures, setProcedures] = useState<Reference[]>([]);

  const schema = useMemo(() => makeCaseSchema(currentStatus), [currentStatus]);

  const form = useForm<CaseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: EMPTY_VALUES,
  });

  const loadOptions = useCallback(async () => {
    const [p, m, h, i, s, pr] = await Promise.all([
      api.get<Patient[]>("/patients"),
      api.get<OrgMember[]>("/organizations/members"),
      api.get<Reference[]>("/hospitals"),
      api.get<Reference[]>("/insurers"),
      api.get<Reference[]>("/suppliers"),
      api.get<Reference[]>("/procedures"),
    ]);
    setPatients(p);
    setMembers(m);
    setHospitals(h);
    setInsurers(i);
    setSuppliers(s);
    setProcedures(pr);
  }, []);

  useEffect(() => {
    loadOptions().catch((e) => toast.error((e as Error).message));
  }, [loadOptions]);

  useEffect(() => {
    if (!id) return;
    api
      .get<CaseRow>(`/cases/${id}`)
      .then((c) => {
        const values: CaseFormValues = {
          patient_id: c.patient_id,
          doctor_id: c.doctor_id,
          hospital_id: c.hospital_id ?? "",
          insurer_id: c.insurer_id ?? "",
          supplier_id: c.supplier_id ?? "",
          procedure_id: c.procedure_id,
          matricula: c.matricula ?? "",
          guia_numero: c.guia_numero ?? "",
          usa_opme: c.usa_opme,
          ficha_de_sala: c.ficha_de_sala,
          status: c.status,
          data_solicitacao: c.data_solicitacao ?? "",
          data_autorizacao: c.data_autorizacao ?? "",
          data_agendamento: c.data_agendamento ?? "",
          data_cirurgia: c.data_cirurgia ?? "",
          entrada_cobranca: c.entrada_cobranca ?? "",
          data_pagamento: c.data_pagamento ?? "",
          data_recebimento: c.data_recebimento ?? "",
          valor_cobranca: c.valor_cobranca?.toString() ?? "",
          valor_cirurgia: c.valor_cirurgia?.toString() ?? "",
          comissao_medico: c.comissao_medico?.toString() ?? "",
          receita_adicional: c.receita_adicional?.toString() ?? "",
          observacoes: c.observacoes ?? "",
        };
        setCurrentStatus(c.status);
        form.reset(values);
      })
      .catch((e) => {
        toast.error((e as Error).message);
        navigate("/casos");
      })
      .finally(() => setLoading(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const watchedDates = form.watch(["data_solicitacao", "data_cirurgia"]);
  const dateWarning =
    watchedDates[0] && watchedDates[1] && watchedDates[1] < watchedDates[0]
      ? "A data da cirurgia é anterior à data de solicitação."
      : null;

  const buildPayload = (v: CaseFormValues): CasePayload => {
    const optionalStr = (s: string) => (s.trim() === "" ? undefined : s);
    const optionalNum = (s: string) => (s.trim() === "" ? undefined : Number(s));
    const optionalDate = (s: string) => (s === "" ? undefined : s);

    const out: Record<string, unknown> = {
      patient_id: v.patient_id,
      doctor_id: v.doctor_id,
      procedure_id: v.procedure_id,
      usa_opme: v.usa_opme,
      ficha_de_sala: v.ficha_de_sala,
      status: v.status,
      hospital_id: optionalStr(v.hospital_id),
      insurer_id: optionalStr(v.insurer_id),
      supplier_id: optionalStr(v.supplier_id),
      matricula: optionalStr(v.matricula),
      guia_numero: optionalStr(v.guia_numero),
      observacoes: optionalStr(v.observacoes),
    };
    for (const field of MONEY_FIELDS) {
      out[field] = optionalNum(v[field] as string);
    }
    for (const field of DATE_FIELDS) {
      out[field] = optionalDate(v[field] as string);
    }

    return out as unknown as CasePayload;
  };

  const onSubmit = async (values: CaseFormValues) => {
    const payload = buildPayload(values);
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/cases/${id}`, payload);
        toast.success("Caso atualizado");
      } else {
        await api.post("/cases", payload);
        toast.success("Caso criado");
      }
      navigate("/casos");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;

  const patientOptions = patients.map((p) => ({ value: p.id, label: p.full_name }));
  const doctorOptions = members.map((m) => ({
    value: m.id,
    label: m.full_name ?? m.user_id,
  }));
  const hospitalOptions = hospitals.map((h) => ({ value: h.id, label: h.name }));
  const insurerOptions = insurers.map((i) => ({ value: i.id, label: i.name }));
  const supplierOptions = suppliers.map((s) => ({ value: s.id, label: s.name }));
  const procedureOptions = procedures.map((p) => ({ value: p.id, label: p.name }));

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Editar caso" : "Novo caso"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold">Identificação</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Paciente, médico e dados do procedimento.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FormField
                control={form.control}
                name="patient_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Paciente *</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onChange={field.onChange}
                        options={patientOptions}
                        placeholder="Selecione o paciente"
                        emptyText="Nenhum paciente encontrado"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="doctor_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Médico responsável *</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onChange={field.onChange}
                        options={doctorOptions}
                        placeholder="Selecione o médico"
                        emptyText="Nenhum membro encontrado"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <FormControl>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {statusLabel(s)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="procedure_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Procedimento *</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onChange={field.onChange}
                        options={procedureOptions}
                        placeholder="Selecione o procedimento"
                        emptyText="Nenhum procedimento encontrado"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hospital_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Hospital</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onChange={field.onChange}
                        options={hospitalOptions}
                        placeholder="Selecione o hospital"
                        emptyText="Nenhum hospital encontrado"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="insurer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Convênio</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onChange={field.onChange}
                        options={insurerOptions}
                        placeholder="Selecione o convênio"
                        emptyText="Nenhum convênio encontrado"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="supplier_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fornecedor (OPME)</FormLabel>
                    <FormControl>
                      <Combobox
                        value={field.value}
                        onChange={field.onChange}
                        options={supplierOptions}
                        placeholder="Selecione o fornecedor"
                        emptyText="Nenhum fornecedor encontrado"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="matricula"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Matrícula / carteirinha</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Particular, 127/p8" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="guia_numero"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nº da guia</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex gap-8">
              <FormField
                control={form.control}
                name="usa_opme"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Usa OPME</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ficha_de_sala"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="font-normal">Ficha de sala</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <Separator className="my-2" />
            <div>
              <h3 className="text-sm font-semibold">Agendamento</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Datas do fluxo da cirurgia.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {SCHEDULE_DATES.map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel(name)}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value as string} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <Separator className="my-2" />
            <div>
              <h3 className="text-sm font-semibold">Financeiro</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Valores, comissão e recebimentos.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MONEY_FIELDS.map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel(name)} (R$)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          {...field}
                          value={field.value as string}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
              {FINANCE_DATES.map((name) => (
                <FormField
                  key={name}
                  control={form.control}
                  name={name}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{fieldLabel(name)}</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value as string} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ))}
            </div>

            <Separator className="my-2" />
            <div>
              <h3 className="text-sm font-semibold">Observações</h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Anotações livres sobre o caso.
              </p>
            </div>
            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {dateWarning && (
              <div className="flex animate-in items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-800 fade-in-0 duration-150 ease-[var(--ease-axis-out)]">
                <TriangleAlert className="size-4" />
                {dateWarning}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft className="size-4" />
                Cancelar
              </Button>
              <Button type="submit" loading={saving}>
                <Save className="size-4" />
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

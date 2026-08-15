import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, CalendarDays, MapPin, Pencil, Phone } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { CaseRow, PatientSummary, PaginatedCases } from "@/types";
import { PAYMENT_STATUS_BADGE, paymentStatus, paymentStatusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { PageLoader } from "@/components/spinner";

const patientSchema = z.object({
  full_name: z.string().min(1, "Nome é obrigatório"),
  cpf: z.string().refine((value) => value === "" || /^\d{11}$/.test(value.replace(/\D/g, "")), "CPF deve ter 11 dígitos").optional(),
  birth_date: z.string().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "Data inválida").optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type PatientForm = z.infer<typeof patientSchema>;

function money(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sortCases(rows: CaseRow[]) {
  return [...rows].sort((a, b) => {
    const left = a.data_cirurgia ?? a.created_at;
    const right = b.data_cirurgia ?? b.created_at;
    return right.localeCompare(left);
  });
}

export default function PatientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<PatientSummary | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const form = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: { full_name: "", cpf: "", birth_date: "", phone: "", address: "" },
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [summaryData, casesData] = await Promise.all([
        api.get<PatientSummary>(`/patients/${id}/summary`),
        api.get<PaginatedCases>(`/cases?patient_id=${id}&page=1&pageSize=100`),
      ]);
      setSummary(summaryData);
      setCases(sortCases(casesData.data));
    } catch (error) {
      toast.error((error as Error).message);
      navigate("/pacientes");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const openEdit = () => {
    if (!summary) return;
    form.reset({
      full_name: summary.patient.full_name,
      cpf: summary.patient.cpf ?? "",
      birth_date: summary.patient.birth_date ?? "",
      phone: summary.patient.phone ?? "",
      address: summary.patient.address ?? "",
    });
    setEditOpen(true);
  };

  const save = async (values: PatientForm) => {
    if (!id) return;
    setSaving(true);
    try {
      await api.put(`/patients/${id}`, {
        full_name: values.full_name.trim(),
        cpf: values.cpf?.trim() || undefined,
        birth_date: values.birth_date || undefined,
        phone: values.phone?.trim() || undefined,
        address: values.address?.trim() || undefined,
      });
      toast.success("Paciente atualizado");
      setEditOpen(false);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <PageLoader />;
  if (!summary) return null;

  const patient = summary.patient;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" aria-label="Voltar para pacientes" onClick={() => navigate("/pacientes")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">Ficha do paciente</p>
          <h1 className="truncate font-heading text-[22px] font-semibold tracking-[-0.02em]">{patient.full_name}</h1>
        </div>
        <Button variant="outline" onClick={openEdit}><Pencil className="size-4" /> Editar</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Dados cadastrais</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">CPF</p><p className="mt-1 font-medium">{patient.cpf ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Nascimento</p><p className="mt-1 font-medium">{patient.birth_date ?? "—"}</p></div>
          <div className="flex gap-2"><Phone className="mt-0.5 size-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Telefone</p><p className="mt-1 font-medium">{patient.phone ?? "—"}</p></div></div>
          <div className="flex gap-2"><MapPin className="mt-0.5 size-4 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Endereço</p><p className="mt-1 font-medium">{patient.address ?? "—"}</p></div></div>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label="Resumo do paciente">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total de cirurgias</CardTitle></CardHeader><CardContent><p className="font-heading text-3xl font-semibold">{summary.total_cirurgias}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Valor total faturado</CardTitle></CardHeader><CardContent><p className="font-heading text-3xl font-semibold">{money(summary.valor_total_faturado)}</p></CardContent></Card>
      </section>

      <Card>
        <CardHeader><CardTitle className="text-sm">Histórico de cirurgias</CardTitle></CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <CalendarDays className="size-6" />
              <p>Nenhuma cirurgia registrada ainda para este paciente.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-hidden rounded-lg border md:block">
                <Table>
                  <TableHeader><TableRow><TableHead>Procedimento</TableHead><TableHead>Hospital</TableHead><TableHead>Convênio</TableHead><TableHead>Data da cirurgia</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                  <TableBody>{cases.map((row) => {
                    const badge = PAYMENT_STATUS_BADGE[paymentStatus(row.status)];
                    return <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/casos/${row.id}`)}><TableCell>{row.procedure?.name ?? "—"}</TableCell><TableCell>{row.hospital?.name ?? "—"}</TableCell><TableCell>{row.insurer?.name ?? "—"}</TableCell><TableCell>{row.data_cirurgia ?? "—"}</TableCell><TableCell><Badge variant={badge.variant as never} className={badge.className}>{paymentStatusLabel(row.status)}</Badge></TableCell></TableRow>;
                  })}</TableBody>
                </Table>
              </div>
              <div className="space-y-3 md:hidden">{cases.map((row) => {
                const badge = PAYMENT_STATUS_BADGE[paymentStatus(row.status)];
                return <button key={row.id} type="button" className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/50" onClick={() => navigate(`/casos/${row.id}`)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.procedure?.name ?? "—"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{row.hospital?.name ?? "—"}</p></div><Badge variant={badge.variant as never} className={badge.className}>{paymentStatusLabel(row.status)}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><span className="block text-muted-foreground">Convênio</span><span className="font-medium">{row.insurer?.name ?? "—"}</span></div><div><span className="block text-muted-foreground">Cirurgia</span><span className="font-medium">{row.data_cirurgia ?? "—"}</span></div></div></button>;
              })}</div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Editar paciente</DialogTitle><DialogDescription>Atualize os dados cadastrais do paciente.</DialogDescription></DialogHeader><Form {...form}><form onSubmit={form.handleSubmit(save)} className="grid gap-4"><FormField control={form.control} name="full_name" render={({ field }) => <FormItem><FormLabel>Nome *</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} /><div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><FormField control={form.control} name="cpf" render={({ field }) => <FormItem><FormLabel>CPF</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="birth_date" render={({ field }) => <FormItem><FormLabel>Data de nascimento</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>} /></div><FormField control={form.control} name="phone" render={({ field }) => <FormItem><FormLabel>Telefone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} /><FormField control={form.control} name="address" render={({ field }) => <FormItem><FormLabel>Endereço</FormLabel><FormControl><Textarea rows={2} {...field} /></FormControl><FormMessage /></FormItem>} /><DialogFooter><Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button><Button type="submit" loading={saving}>Salvar</Button></DialogFooter></form></Form></DialogContent>
      </Dialog>
    </div>
  );
}

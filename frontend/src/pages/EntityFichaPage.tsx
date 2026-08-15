import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Pencil } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { CaseRow, PaginatedCases, ReferenceSummary } from "@/types";
import { PAYMENT_STATUS_BADGE, paymentStatus, paymentStatusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageLoader } from "@/components/spinner";

const ENTITY_CONFIG = {
  hospitals: { endpoint: "/hospitals", title: "Hospital", filter: "hospital_id" },
  insurers: { endpoint: "/insurers", title: "Convênio", filter: "insurer_id" },
  suppliers: { endpoint: "/suppliers", title: "Fornecedor", filter: "supplier_id" },
} as const;

function money(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sortCases(rows: CaseRow[]) {
  return [...rows].sort((a, b) => (b.data_cirurgia ?? b.created_at).localeCompare(a.data_cirurgia ?? a.created_at));
}

export default function EntityFichaPage() {
  const { type, id } = useParams();
  const navigate = useNavigate();
  const config = useMemo(() => (type && type in ENTITY_CONFIG ? ENTITY_CONFIG[type as keyof typeof ENTITY_CONFIG] : null), [type]);
  const [summary, setSummary] = useState<ReferenceSummary | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!config || !id) return;
    setLoading(true);
    try {
      const [summaryData, casesData] = await Promise.all([
        api.get<ReferenceSummary>(`${config.endpoint}/${id}/summary`),
        api.get<PaginatedCases>(`/cases?${config.filter}=${id}&page=1&pageSize=100`),
      ]);
      setSummary(summaryData);
      setCases(sortCases(casesData.data));
    } catch (error) {
      toast.error((error as Error).message);
      navigate("/cadastros");
    } finally {
      setLoading(false);
    }
  }, [config, id, navigate]);

  useEffect(() => {
    load();
  }, [load]);

  if (!config || loading) return <PageLoader />;
  if (!summary) return null;

  const save = async () => {
    if (!id || !name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    try {
      await api.put(`${config.endpoint}/${id}`, { name: name.trim() });
      toast.success(`${config.title} atualizado`);
      setEditOpen(false);
      await load();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = () => {
    setName(summary.reference.name);
    setEditOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" aria-label="Voltar para cadastros" onClick={() => navigate("/cadastros")}><ArrowLeft className="size-4" /></Button>
        <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Ficha de cadastro</p><h1 className="truncate font-heading text-[22px] font-semibold tracking-[-0.02em]">{summary.reference.name}</h1></div>
        <Button variant="outline" onClick={openEdit}><Pencil className="size-4" /> Editar</Button>
      </div>

      <Card><CardHeader><CardTitle className="text-sm">{config.title}</CardTitle></CardHeader><CardContent><p className="text-lg font-medium">{summary.reference.name}</p></CardContent></Card>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2" aria-label={`Resumo do ${config.title.toLowerCase()}`}>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Total de casos</CardTitle></CardHeader><CardContent><p className="font-heading text-3xl font-semibold">{summary.total_casos}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Valor total faturado</CardTitle></CardHeader><CardContent><p className="font-heading text-3xl font-semibold">{money(summary.valor_total_faturado)}</p></CardContent></Card>
      </section>

      <Card><CardHeader><CardTitle className="text-sm">Histórico de casos</CardTitle></CardHeader><CardContent>
        {cases.length === 0 ? <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><CalendarDays className="size-6" /><p>Nenhum caso registrado ainda para este {config.title.toLowerCase()}.</p></div> : <>
          <div className="hidden overflow-hidden rounded-lg border md:block"><Table><TableHeader><TableRow><TableHead>Procedimento</TableHead><TableHead>Paciente</TableHead><TableHead>Data da cirurgia</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{cases.map((row) => { const badge = PAYMENT_STATUS_BADGE[paymentStatus(row.status)]; return <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/casos/${row.id}`)}><TableCell>{row.procedure?.name ?? "—"}</TableCell><TableCell>{row.patient?.full_name ?? "—"}</TableCell><TableCell>{row.data_cirurgia ?? "—"}</TableCell><TableCell><Badge variant={badge.variant as never} className={badge.className}>{paymentStatusLabel(row.status)}</Badge></TableCell></TableRow>; })}</TableBody></Table></div>
          <div className="space-y-3 md:hidden">{cases.map((row) => { const badge = PAYMENT_STATUS_BADGE[paymentStatus(row.status)]; return <button key={row.id} type="button" className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-muted/50" onClick={() => navigate(`/casos/${row.id}`)}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.procedure?.name ?? "—"}</p><p className="mt-1 truncate text-xs text-muted-foreground">{row.patient?.full_name ?? "—"}</p></div><Badge variant={badge.variant as never} className={badge.className}>{paymentStatusLabel(row.status)}</Badge></div><p className="mt-3 text-xs text-muted-foreground">Cirurgia <span className="font-medium text-foreground">{row.data_cirurgia ?? "—"}</span></p></button>; })}</div>
        </>}
      </CardContent></Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle>Editar {config.title.toLowerCase()}</DialogTitle><DialogDescription>Atualize o nome do cadastro.</DialogDescription></DialogHeader><div className="grid gap-2"><label htmlFor="entity-name" className="text-sm font-medium">Nome</label><Input id="entity-name" value={name} onChange={(event) => setName(event.target.value)} /></div><DialogFooter><Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancelar</Button><Button onClick={save} loading={saving}>Salvar</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

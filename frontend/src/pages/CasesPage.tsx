import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, Funnel, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { CaseRow, PaginatedCases, Reference } from "@/types";
import { useCachedFetch } from "@/lib/swr";
import { PAYMENT_STATUS_BADGE, STATUS_OPTIONS, paymentStatus, paymentStatusLabel, statusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((__, j) => (
            <TableCell key={j}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function PaginationControls({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t pt-4">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
        Próxima
      </Button>
    </div>
  );
}

export default function CasesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<string | undefined>();
  const [alert, setAlert] = useState<string | undefined>(() => searchParams.get("alert") ?? undefined);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [hospitalId, setHospitalId] = useState("");
  const [insurerId, setInsurerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<CaseRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: hospitals = [] } = useCachedFetch<Reference[]>("/hospitals");
  const { data: insurers = [] } = useCachedFetch<Reference[]>("/insurers");
  const { data: suppliers = [] } = useCachedFetch<Reference[]>("/suppliers");

  // Debounce curto (~250ms) pra não disparar request a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const listUrl = useMemo(() => {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (alert) params.set("alert", alert);
    if (hospitalId) params.set("hospital_id", hospitalId);
    if (insurerId) params.set("insurer_id", insurerId);
    if (supplierId) params.set("supplier_id", supplierId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(page));
    params.set("pageSize", "25");
    const qs = params.toString();
    return `/cases${qs ? "?" + qs : ""}`;
  }, [status, debouncedSearch, alert, hospitalId, insurerId, supplierId, from, to, page]);

  // Stale-while-revalidate: ao voltar de aba/janela (reload do navegador),
  // a lista em cache aparece na hora — sem skeleton.
  const { data: rowsData, loading, refetch } = useCachedFetch<PaginatedCases>(listUrl);
  const rows = rowsData?.data ?? [];
  const totalPages = Math.max(1, Math.ceil((rowsData?.total ?? 0) / 25));
  const activeFilterCount = [hospitalId, insurerId, supplierId, from || to].filter(Boolean).length;

  const clearFilters = () => {
    setHospitalId("");
    setInsurerId("");
    setSupplierId("");
    setFrom("");
    setTo("");
  };

  useEffect(() => {
    setPage(1);
  }, [status, debouncedSearch, alert, hospitalId, insurerId, supplierId, from, to]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setAlert(searchParams.get("alert") ?? undefined);
  }, [searchParams]);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.del(`/cases/${toDelete.id}`);
      toast.success("Caso excluído");
      setToDelete(null);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Casos</CardTitle>
        <CardAction>
          <Button onClick={() => navigate("/casos/novo")}>
            <Plus className="size-4" />
            Novo caso
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-72 max-w-full">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por paciente ou procedimento"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={status ?? "all"} onValueChange={setStatus}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Sheet>
            <SheetTrigger asChild>
              <button type="button" className={buttonVariants({ variant: "outline" })}>
                <Funnel className="size-4" />
                Filtros
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-0.5 size-5 justify-center rounded-full px-0 text-[11px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Filtros avançados</SheetTitle>
                <SheetDescription>Refine os casos por referência e período da cirurgia.</SheetDescription>
              </SheetHeader>
              <div className="grid gap-5 overflow-y-auto py-2">
                <div className="grid gap-2">
                  <label htmlFor="case-filter-hospital" className="text-sm font-medium">Hospital</label>
                  <Select value={hospitalId || "all"} onValueChange={(value) => setHospitalId(value === "all" ? "" : value)}>
                    <SelectTrigger id="case-filter-hospital" className="w-full"><SelectValue placeholder="Todos os hospitais" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os hospitais</SelectItem>
                      {(hospitals ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label htmlFor="case-filter-insurer" className="text-sm font-medium">Convênio</label>
                  <Select value={insurerId || "all"} onValueChange={(value) => setInsurerId(value === "all" ? "" : value)}>
                    <SelectTrigger id="case-filter-insurer" className="w-full"><SelectValue placeholder="Todos os convênios" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os convênios</SelectItem>
                      {(insurers ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label htmlFor="case-filter-supplier" className="text-sm font-medium">Fornecedor</label>
                  <Select value={supplierId || "all"} onValueChange={(value) => setSupplierId(value === "all" ? "" : value)}>
                    <SelectTrigger id="case-filter-supplier" className="w-full"><SelectValue placeholder="Todos os fornecedores" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os fornecedores</SelectItem>
                      {(suppliers ?? []).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <fieldset className="grid gap-3">
                  <legend className="text-sm font-medium">Data da cirurgia</legend>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5"><label htmlFor="case-filter-from" className="text-xs text-muted-foreground">De</label><Input id="case-filter-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
                    <div className="grid gap-1.5"><label htmlFor="case-filter-to" className="text-xs text-muted-foreground">Até</label><Input id="case-filter-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
                  </div>
                </fieldset>
              </div>
              {activeFilterCount > 0 && (
                <button type="button" className="mt-auto text-left text-sm font-medium text-destructive hover:underline" onClick={clearFilters}>
                  Limpar filtros
                </button>
              )}
            </SheetContent>
          </Sheet>
        </div>

        <div className="hidden rounded-lg border md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Procedimento</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data cirurgia</TableHead>
                <TableHead>Data solicitação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingRows cols={6} />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    Nenhum caso encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const badge = PAYMENT_STATUS_BADGE[paymentStatus(row.status)];
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.procedure?.name ?? "—"}</TableCell>
                      <TableCell>{row.patient?.full_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={badge.variant as never}
                          className={badge.className}
                        >
                          {paymentStatusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.data_cirurgia ?? "—"}</TableCell>
                      <TableCell>{row.data_solicitacao ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Ver caso de ${row.patient?.full_name ?? "paciente"}`}
                            title="Ver detalhes"
                            onClick={() => navigate(`/casos/${row.id}`)}
                          >
                            <Eye className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Editar caso de ${row.patient?.full_name ?? "paciente"}`}
                            title="Editar"
                            onClick={() => navigate(`/casos/${row.id}/editar`)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Excluir caso de ${row.patient?.full_name ?? "paciente"}`}
                            title="Excluir"
                            onClick={() => setToDelete(row)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />

        {/* Cards — mobile */}
        <div className="space-y-3 md:hidden">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum caso encontrado.</p>
          ) : (
            rows.map((row) => {
              const badge = PAYMENT_STATUS_BADGE[paymentStatus(row.status)];
              return (
                <div key={row.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.procedure?.name ?? "—"}</p>
                      <p className="truncate text-sm text-muted-foreground">{row.patient?.full_name ?? "—"}</p>
                    </div>
                    <Badge variant={badge.variant as never} className={badge.className}>
                      {paymentStatusLabel(row.status)}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="block text-muted-foreground/70">Cirurgia</span>
                      <span className="font-medium">{row.data_cirurgia ?? "—"}</span>
                    </div>
                    <div>
                      <span className="block text-muted-foreground/70">Solicitação</span>
                      <span className="font-medium">{row.data_solicitacao ?? "—"}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Ver caso de ${row.patient?.full_name ?? "paciente"}`}
                      title="Ver detalhes"
                      onClick={() => navigate(`/casos/${row.id}`)}
                    >
                      <Eye className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Editar caso de ${row.patient?.full_name ?? "paciente"}`}
                      title="Editar"
                      onClick={() => navigate(`/casos/${row.id}/editar`)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      aria-label={`Excluir caso de ${row.patient?.full_name ?? "paciente"}`}
                      title="Excluir"
                      onClick={() => setToDelete(row)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <PaginationControls page={page} totalPages={totalPages} onPageChange={setPage} />
      </CardContent>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Excluir caso?"
        description={`O caso "${toDelete?.procedure?.name}" será excluído permanentemente.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={remove}
      />
    </Card>
  );
}

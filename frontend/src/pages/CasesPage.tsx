import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { CaseRow } from "@/types";
import { STATUS_BADGE, STATUS_OPTIONS, statusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export default function CasesPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [toDelete, setToDelete] = useState<CaseRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce curto (~250ms) pra não disparar request a cada tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== "all") params.set("status", status);
      if (debouncedSearch) params.set("search", debouncedSearch);
      const qs = params.toString();
      const data = await api.get<CaseRow[]>(`/cases${qs ? "?" + qs : ""}`);
      setRows(data);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, debouncedSearch]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.del(`/cases/${toDelete.id}`);
      toast.success("Caso excluído");
      setToDelete(null);
      load();
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
        </div>

        <div className="rounded-lg border">
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
                  const badge = STATUS_BADGE[row.status] ?? { variant: "outline" };
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.procedimento}</TableCell>
                      <TableCell>{row.patient?.full_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={badge.variant as never}
                          className={badge.className}
                        >
                          {statusLabel(row.status)}
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
      </CardContent>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Excluir caso?"
        description={`O caso "${toDelete?.procedimento}" será excluído permanentemente.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={remove}
      />
    </Card>
  );
}

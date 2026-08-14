import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { Reference } from "@/types";
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
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";

function LoadingRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
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

const TABS = [
  { value: "hospitals", label: "Hospitais", endpoint: "/hospitals" },
  { value: "insurers", label: "Convênios", endpoint: "/insurers" },
  { value: "suppliers", label: "Fornecedores", endpoint: "/suppliers" },
];

function ReferenceTable({ endpoint }: { endpoint: string }) {
  const [rows, setRows] = useState<Reference[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Reference | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Reference | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<Reference[]>(endpoint));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    setEditing(null);
    setName("");
    setDialogOpen(true);
  };

  const openEdit = (r: Reference) => {
    setEditing(r);
    setName(r.name);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`${endpoint}/${editing.id}`, { name: name.trim() });
      } else {
        await api.post(endpoint, { name: name.trim() });
      }
      toast.success("Salvo");
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.del(`${endpoint}/${toDelete.id}`);
      toast.success("Excluído");
      setToDelete(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button onClick={openNew} className="mb-4">
        <Plus className="size-4" />
        Novo
      </Button>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <LoadingRows cols={2} />
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="h-16 text-center text-muted-foreground">
                  Nenhum registro.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Editar ${r.name}`}
                        title="Editar"
                        onClick={() => openEdit(r)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Excluir ${r.name}`}
                        title="Excluir"
                        onClick={() => setToDelete(r)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar" : "Novo"}</DialogTitle>
            <DialogDescription>Nome de exibição.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="ref-name">Nome</Label>
            <Input
              id="ref-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={save} loading={saving}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Excluir?"
        description={`"${toDelete?.name}" será excluído.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={remove}
      />
    </>
  );
}

export default function ReferencePage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cadastros</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="hospitals">
          <TabsList className="mb-4">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value}>
              <ReferenceTable endpoint={t.endpoint} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

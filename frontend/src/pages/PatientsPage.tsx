import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { Patient, PatientCreateResponse } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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

const patientSchema = z.object({
  full_name: z.string().min(1, "Nome é obrigatório"),
  cpf: z
    .string()
    .refine(
      (v) => v === "" || /^\d{11}$/.test(v.replace(/\D/g, "")),
      "CPF deve ter 11 dígitos (com ou sem máscara)"
    )
    .optional(),
  birth_date: z
    .string()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Data inválida")
    .optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type PatientForm = z.infer<typeof patientSchema>;
type DuplicateState = {
  created: PatientCreateResponse;
  matches: Pick<Patient, "id" | "full_name" | "cpf">[];
} | null;

const DEFAULT_VALUES: PatientForm = {
  full_name: "",
  cpf: "",
  birth_date: "",
  phone: "",
  address: "",
};

export default function PatientsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicate, setDuplicate] = useState<DuplicateState>(null);
  const [resolvingDuplicate, setResolvingDuplicate] = useState(false);

  const form = useForm<PatientForm>({
    resolver: zodResolver(patientSchema),
    defaultValues: DEFAULT_VALUES,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<Patient[]>("/patients"));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openNew = () => {
    form.reset(DEFAULT_VALUES);
    setDialogOpen(true);
  };

  const onSubmit = async (values: PatientForm) => {
    const payload = {
      full_name: values.full_name.trim(),
      cpf: values.cpf?.trim() || undefined,
      birth_date: values.birth_date || undefined,
      phone: values.phone?.trim() || undefined,
      address: values.address?.trim() || undefined,
    };
    setSaving(true);
    try {
      const created = await api.post<PatientCreateResponse>("/patients", payload);
      if (created.warning === "possible_duplicate" && created.matches?.length) {
        setDialogOpen(false);
        setDuplicate({ created, matches: created.matches });
        return;
      }
      toast.success("Paciente criado");
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const keepExisting = async () => {
    if (!duplicate) return;
    setResolvingDuplicate(true);
    try {
      await api.del(`/patients/${duplicate.created.id}`);
      toast.success("Paciente existente mantido; novo cadastro descartado");
      setDuplicate(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setResolvingDuplicate(false);
    }
  };

  const keepNew = () => {
    setDuplicate(null);
    toast.success("Paciente criado");
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.del(`/patients/${toDelete.id}`);
      toast.success("Paciente excluído");
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
        <CardTitle>Pacientes</CardTitle>
        <CardAction>
          <Button onClick={openNew}>
            <Plus className="size-4" />
            Novo paciente
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CPF</TableHead>
                <TableHead>Nascimento</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingRows cols={5} />
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    Nenhum paciente encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/pacientes/${p.id}`)}>
                    <TableCell>{p.full_name}</TableCell>
                    <TableCell>{p.cpf ?? "—"}</TableCell>
                    <TableCell>{p.birth_date ?? "—"}</TableCell>
                    <TableCell>{p.phone ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Editar paciente ${p.full_name}`}
                          title="Editar"
                          onClick={(event) => {
                            event.stopPropagation();
                            navigate(`/pacientes/${p.id}`);
                          }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          aria-label={`Excluir paciente ${p.full_name}`}
                          title="Excluir"
                          onClick={(event) => {
                            event.stopPropagation();
                            setToDelete(p);
                          }}
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
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo paciente</DialogTitle>
            <DialogDescription>Cadastro de paciente do seu consultório.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
              <FormField
                control={form.control}
                name="full_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF</FormLabel>
                      <FormControl>
                        <Input placeholder="000.000.000-00" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="birth_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de nascimento</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Endereço</FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialogOpen(false)}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={saving}>
                  Salvar
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!duplicate}
        onOpenChange={(open) => {
          if (!open && !resolvingDuplicate) keepNew();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Paciente parecido encontrado</DialogTitle>
            <DialogDescription>
              Encontramos um paciente parecido: <strong>{duplicate?.matches[0]?.full_name}</strong>. Deseja usar esse paciente existente ou criar um novo mesmo assim?
            </DialogDescription>
          </DialogHeader>
          {duplicate && duplicate.matches.length > 1 && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              {duplicate.matches.map((match) => <p key={match.id}>{match.full_name}</p>)}
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="outline" onClick={keepNew} disabled={resolvingDuplicate}>
              Criar novo mesmo assim
            </Button>
            <Button type="button" onClick={keepExisting} loading={resolvingDuplicate}>
              Usar paciente existente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Excluir paciente?"
        description={`O paciente "${toDelete?.full_name}" será excluído permanentemente.`}
        confirmLabel="Excluir"
        loading={deleting}
        onConfirm={remove}
      />
    </Card>
  );
}

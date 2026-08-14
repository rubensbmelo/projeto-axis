import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { OrgMember } from "@/types";
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
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const ROLE_OPTIONS = ["owner", "doctor", "secretary", "viewer"];

export default function MembersPage() {
  const [rows, setRows] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user_id, setUserId] = useState("");
  const [role, setRole] = useState("viewer");
  const [full_name, setFullName] = useState("");
  const [crm, setCrm] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.get<OrgMember[]>("/organizations/members"));
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
    setUserId("");
    setRole("viewer");
    setFullName("");
    setCrm("");
    setDialogOpen(true);
  };

  const save = async () => {
    if (!user_id.trim() || !role) {
      toast.error("Informe o ID do usuário e o papel");
      return;
    }
    setSaving(true);
    try {
      await api.post("/organizations/members", {
        user_id: user_id.trim(),
        role,
        full_name: full_name.trim() || undefined,
        crm: crm.trim() || undefined,
      });
      toast.success("Membro adicionado");
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Membros</CardTitle>
        <CardAction>
          <Button onClick={openNew}>
            <Plus className="size-4" />
            Adicionar membro
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CRM</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Papel</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Nenhum membro.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.full_name ?? "—"}</TableCell>
                    <TableCell>{m.crm ?? "—"}</TableCell>
                    <TableCell>{m.user_id.slice(0, 8)}…</TableCell>
                    <TableCell>
                      <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                        {m.role}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar membro</DialogTitle>
            <DialogDescription>Vincule um usuário do Supabase a esta clínica.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="user_id">ID do usuário (Supabase) *</Label>
              <Input
                id="user_id"
                value={user_id}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="UUID em auth.users"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Papel *</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger id="role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="full_name">Nome</Label>
                <Input
                  id="full_name"
                  value={full_name}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="crm">CRM (se médico)</Label>
                <Input
                  id="crm"
                  value={crm}
                  onChange={(e) => setCrm(e.target.value)}
                />
              </div>
            </div>
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
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

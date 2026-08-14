import { useState } from "react";
import { Activity } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function OnboardingPage({
  onCreated,
}: {
  onCreated: (orgId: string) => void;
}) {
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [crm, setCrm] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !fullName.trim()) {
      toast.error("Preencha o nome do seu consultório e seu nome");
      return;
    }
    setLoading(true);
    try {
      const data = await api.post<{ organization: { id: string } }>("/organizations", {
        name: name.trim(),
        full_name: fullName.trim(),
        crm: crm.trim() || undefined,
      });
      onCreated(data.organization.id);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Activity className="size-6" />
          </div>
          <CardTitle className="text-xl text-balance">Boas-vindas ao AXIS</CardTitle>
          <CardDescription className="text-balance">
            Crie seu espaço no AXIS para começar a registrar seus casos cirúrgicos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do seu consultório ou prática</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: SOS Mão Recife"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="full_name">Seu nome</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nome completo"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="crm">CRM (opcional)</Label>
              <Input
                id="crm"
                value={crm}
                onChange={(e) => setCrm(e.target.value)}
                placeholder="Apenas se for médico"
              />
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              Criar espaço
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

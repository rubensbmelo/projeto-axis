import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Activity, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/api/supabase";
import { cn } from "@/lib/utils";
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
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

const PASSWORD_RULES = [
  { key: "length", label: "Pelo menos 8 caracteres", test: (value: string) => value.length >= 8 },
  { key: "uppercase", label: "1 letra maiúscula", test: (value: string) => /[A-Z]/.test(value) },
  { key: "lowercase", label: "1 letra minúscula", test: (value: string) => /[a-z]/.test(value) },
  { key: "number", label: "1 número", test: (value: string) => /\d/.test(value) },
  { key: "special", label: "1 caractere especial", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
] as const;

function PasswordChecklist({ password }: { password: string }) {
  return (
    <div className="grid gap-2" aria-label="Requisitos da senha">
      <p className="text-xs font-semibold text-foreground">Sua senha precisa ter:</p>
      {PASSWORD_RULES.map((rule) => {
        const valid = rule.test(password);
        return (
          <div
            key={rule.key}
            className={cn(
              "flex items-center gap-2 text-xs transition-colors",
              valid ? "text-success" : "text-muted-foreground"
            )}
          >
            {valid ? <CheckCircle2 className="size-4 shrink-0" /> : <Circle className="size-4 shrink-0" />}
            <span>{rule.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function LoginBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden bg-muted/50">
      <div className="absolute inset-[-2rem] grid grid-cols-[12rem_1fr] gap-6 p-8 opacity-80 blur-[13px] md:grid-cols-[15rem_1fr] md:gap-8 md:p-14">
        <aside className="rounded-2xl bg-card p-5 shadow-sm">
          <div className="mb-10 flex items-center gap-2 font-semibold"><Activity className="size-5" /> AXIS</div>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <div className="rounded-lg bg-primary px-3 py-2 text-primary-foreground">Início</div>
            <div>Casos</div>
            <div>Pacientes</div>
            <div>Relatórios</div>
          </div>
        </aside>
        <div className="grid content-start gap-6">
          <div>
            <p className="text-2xl font-semibold">Bom dia, Dr. Exemplo</p>
            <p className="mt-2 text-sm text-muted-foreground">Resumo financeiro do seu espaço</p>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-2xl border border-primary/20 bg-card p-5"><p className="text-sm text-muted-foreground">Comissão do mês</p><p className="mt-4 text-3xl font-semibold text-primary">R$ 12.480</p></div>
            <div className="rounded-2xl bg-card p-5"><p className="text-sm text-muted-foreground">Cirurgias</p><p className="mt-4 text-3xl font-semibold">18</p></div>
            <div className="rounded-2xl bg-card p-5"><p className="text-sm text-muted-foreground">Casos ativos</p><p className="mt-4 text-3xl font-semibold">32</p></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl border bg-card p-5"><p className="font-semibold">Central de alertas</p><div className="mt-5 h-20 rounded-xl bg-muted" /></div>
            <div className="rounded-2xl border bg-card p-5"><p className="font-semibold">Hospitais</p><div className="mt-5 grid gap-2"><div className="h-3 rounded bg-muted" /><div className="h-3 w-4/5 rounded bg-muted" /><div className="h-3 w-3/5 rounded bg-muted" /></div></div>
          </div>
        </div>
      </div>
      <div className="absolute inset-0 bg-background/75 backdrop-blur-[2px]" />
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isDesktop, setDesktop] = useState(false);
  const passwordStrong = PASSWORD_RULES.every((rule) => rule.test(password));

  // Em mobile o balão do checklist cai para baixo do campo; em telas largas
  // (>= 768px) ele fica ao lado, como especificado.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha e-mail e senha");
      return;
    }
    if (mode === "signup" && !passwordStrong) {
      toast.error("Escolha uma senha que atenda a todos os requisitos");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // "Retornar para a página pretendida": o router preserva a URL atual
        // (ex: /casos/{id}/editar) enquanto a tela de login é exibida. Volta
        // pra ela — exceto telas de CRIAÇÃO ("/novo"), onde voltar é inútil
        // (form em branco); nesses casos cai no Início.
        const from = location.pathname + location.search;
        const hasIntent = from && from !== "/" && from !== "/login" && !from.endsWith("/novo");
        navigate(hasIntent ? from : "/inicio", { replace: true });
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-muted/40 p-4 md:p-8">
      <LoginBackdrop />
      <Card className="relative z-10 w-full max-w-xl shadow-2xl shadow-black/10">
        <CardHeader className="!flex flex-col items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Activity className="size-6" />
          </div>
          <CardTitle className="text-xl">AXIS</CardTitle>
          <CardDescription className="max-w-80 text-balance">
            Gestão financeira de cirurgias e OPME, do pedido ao recebimento.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@consultorio.com"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <Popover open={mode === "signup" && passwordFocused} onOpenChange={setPasswordFocused}>
                <PopoverAnchor asChild>
                  <div>
                    <Input
                      id="password"
                      type="password"
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      value={password}
                      onFocus={() => mode === "signup" && setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </PopoverAnchor>
                <PopoverContent
                  side={isDesktop ? "right" : "bottom"}
                  align="start"
                  sideOffset={14}
                  collisionPadding={16}
                  onOpenAutoFocus={(event) => event.preventDefault()}
                  onCloseAutoFocus={(event) => event.preventDefault()}
                  className="w-64 p-4"
                >
                  <PasswordChecklist password={password} />
                </PopoverContent>
              </Popover>
            </div>
            <Button type="submit" className="w-full" loading={loading} disabled={mode === "signup" && !passwordStrong}>
              {mode === "login" ? "Entrar" : "Criar conta"}
            </Button>
          </form>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
              setPasswordFocused(false);
            }}
            className="mt-4 w-full text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            {mode === "login" ? "Não tem conta? Criar conta" : "Já tem conta? Entrar"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}

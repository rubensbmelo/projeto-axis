import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { ReportAlerts, ReportSummary } from "@/types";
import { useAuth } from "@/auth/AuthContext";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageLoader } from "@/components/spinner";

function money(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function RankingCard({ title, data }: { title: string; data: { label: string; count: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.length === 0 ? (
          <p className="py-3 text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          data.slice(0, 5).map((item, index) => (
            <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <span className="truncate">{item.label}</span>
              </div>
              <span className="shrink-0 font-medium tabular-nums">{item.count}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default function InicioPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [alerts, setAlerts] = useState<ReportAlerts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ReportSummary>("/reports/summary"),
      api.get<ReportAlerts>("/reports/alerts"),
    ])
      .then(([summaryData, alertsData]) => {
        setSummary(summaryData);
        setAlerts(alertsData);
      })
      .catch((error) => toast.error((error as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (!summary) return <p className="text-muted-foreground">Nenhum dado disponível.</p>;

  const name = user?.user_metadata?.full_name?.split(" ")[0] || user?.email?.split("@")[0] || "médico";
  const alertItems = [
    {
      key: "authorization",
      title: "Autorização pendente",
      description: "Solicitações há mais de 21 dias úteis sem resposta.",
      count: alerts?.authorization.count ?? 0,
    },
    {
      key: "billing",
      title: "Cobrança sem retorno",
      description: "Cobranças faturadas há mais de 30 dias sem recebimento.",
      count: alerts?.billing.count ?? 0,
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-[25px] font-semibold tracking-[-0.03em] text-balance">
          {greeting()}, {name}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Aqui está o resumo do seu espaço no AXIS.</p>
      </header>

      <section aria-labelledby="inicio-alerts-title" className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          <h2 id="inicio-alerts-title" className="text-sm font-semibold">Central de alertas</h2>
        </div>
        {alertItems.some((item) => item.count > 0) ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {alertItems.map((item) => (
              <button
                key={item.key}
                type="button"
                className="group rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-left transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-destructive/40"
                onClick={() => navigate(`/casos?alert=${item.key}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-destructive">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <ArrowRight className="mt-0.5 size-4 shrink-0 text-destructive transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="mt-4 font-heading text-3xl font-semibold tracking-[-0.03em] text-destructive tabular-nums">{item.count}</p>
                <p className="mt-1 text-xs text-muted-foreground">Ver casos</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-xl border border-status-received-bg bg-status-received-bg/40 p-4">
            <CheckCircle2 className="size-5 text-status-received-text" />
            <div>
              <p className="text-sm font-semibold text-status-received-text">Tudo em dia</p>
              <p className="text-xs text-muted-foreground">Nenhum prazo crítico encontrado.</p>
            </div>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.15fr_2fr]" aria-label="Resumo financeiro">
        <Card className="border-primary/20 bg-primary/[0.03] py-6">
          <CardHeader className="px-6">
            <CardTitle className="text-[17px] font-normal">Comissão do mês</CardTitle>
            <p className="text-[13px] text-muted-foreground">Recebimentos registrados neste mês</p>
          </CardHeader>
          <CardContent className="px-6">
            <p className="font-heading text-[40px] leading-none font-semibold tracking-[-0.04em] text-primary tabular-nums">
              {money(summary.comissao_do_mes)}
            </p>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-4">
          <Card size="sm" className="py-5">
            <CardHeader className="px-5"><CardTitle className="text-[13px] font-normal text-muted-foreground">Total de casos</CardTitle></CardHeader>
            <CardContent className="px-5"><p className="font-heading text-[28px] font-semibold tracking-[-0.03em]">{summary.total_casos}</p></CardContent>
          </Card>
          <Card size="sm" className="py-5">
            <CardHeader className="px-5"><CardTitle className="text-[13px] font-normal text-muted-foreground">Cirurgias realizadas</CardTitle></CardHeader>
            <CardContent className="px-5"><p className="font-heading text-[28px] font-semibold tracking-[-0.03em]">{summary.cirurgias_realizadas}</p></CardContent>
          </Card>
          <Card size="sm" className="py-5">
            <CardHeader className="px-5"><CardTitle className="text-[13px] font-normal text-muted-foreground">Valor faturado</CardTitle></CardHeader>
            <CardContent className="px-5"><p className="font-heading text-xl font-semibold tracking-[-0.03em]">{money(summary.valor_total_faturado)}</p></CardContent>
          </Card>
          <Card size="sm" className="py-5">
            <CardHeader className="px-5"><CardTitle className="text-[13px] font-normal text-muted-foreground">Já recebido</CardTitle></CardHeader>
            <CardContent className="px-5"><p className="font-heading text-xl font-semibold tracking-[-0.03em]">{money(summary.valor_total_recebido)}</p></CardContent>
          </Card>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2" aria-label="Rankings">
        <RankingCard title="Melhores hospitais" data={summary.por_hospital} />
        <RankingCard title="Melhores convênios" data={summary.por_convenio} />
        <RankingCard title="Melhores fornecedores" data={summary.por_fornecedor} />
        <RankingCard title="Melhores procedimentos" data={summary.por_procedimento} />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Faturamento mensal</CardTitle>
          <p className="text-xs text-muted-foreground">Valor de cobranças faturadas nos últimos 6 meses.</p>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.faturamento_por_mes} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value: number) => `R$ ${(value / 1000).toFixed(0)}k`} width={48} />
                <Tooltip
                  cursor={{ fill: "var(--muted)" }}
                  formatter={(value) => [money(Number(value) || 0), "Faturado"]}
                  labelFormatter={(label) => `Mês ${label}`}
                />
                <Bar dataKey="valor" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={42} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

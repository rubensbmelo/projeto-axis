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

import type { CaseRow, ReportAlerts, ReportSummary } from "@/types";
import { useCachedFetch } from "@/lib/swr";
import { PAYMENT_STATUS_BADGE, paymentStatus, paymentStatusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageLoader } from "@/components/spinner";

function CountUp({ value }: { value: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const duration = 800;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{displayValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</>;
}

function money(value: number) {
  return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthBounds(value: string) {
  const [year, month] = value.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${value}-01`,
    to: `${value}-${String(lastDay).padStart(2, "0")}`,
  };
}

function CountTable({
  title,
  data,
}: {
  title: string;
  data: { label: string; count: number }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2} className="h-12 text-center text-muted-foreground">
                    Sem dados.
                  </TableCell>
                </TableRow>
              ) : (
                data.map((d) => (
                  <TableRow key={d.label}>
                    <TableCell>{d.label}</TableCell>
                    <TableCell className="text-right">{d.count}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState(currentMonthValue);
  const { from, to } = monthBounds(period);

  // Stale-while-revalidate: ao voltar de aba/janela (reload do navegador),
  // os dados em cache aparecem na hora — sem skeleton.
  const summaryRes = useCachedFetch<ReportSummary>(`/reports/summary?from=${from}&to=${to}`);
  const pendenciasRes = useCachedFetch<CaseRow[]>("/reports/pendencias-financeiras");
  const alertsRes = useCachedFetch<ReportAlerts>("/reports/alerts");

  const summary = summaryRes.data;
  const pendencias = pendenciasRes.data ?? [];
  const alerts = alertsRes.data;

  if (!summary) return <PageLoader />;

  const monthData = summary.cirurgias_por_mes.map(({ month, count }) => ({
    label: month,
    count,
  }));
  const valueAlert = alerts?.valor_abaixo_historico;
  const valueAlertDescription = valueAlert?.cases.length === 1
    ? `Esperado ~R$ ${valueAlert.cases[0].media_historica.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}; cobrado R$ ${valueAlert.cases[0].valor_cobranca.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`
    : "Casos cobrados pelo menos 20% abaixo da média histórica.";

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
    ...(alerts?.valor_abaixo_historico.count
      ? [{
          key: "value_below_historical",
          title: "Valor abaixo do histórico",
          description: valueAlertDescription,
          count: alerts.valor_abaixo_historico.count,
        }]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-[22px] font-semibold tracking-[-0.02em] text-balance">Painel</h2>
          <p className="mt-1 text-[13px] text-muted-foreground text-balance">
             Visão geral dos casos do seu espaço no AXIS.
          </p>
        </div>
        <div className="grid gap-1.5 sm:w-44">
          <label htmlFor="report-period" className="text-xs font-medium text-muted-foreground">Período</label>
          <Input
            id="report-period"
            type="month"
            value={period}
            onChange={(event) => setPeriod(event.target.value || currentMonthValue())}
            aria-label="Selecionar mês e ano do relatório"
          />
        </div>
      </div>

      <section aria-labelledby="alerts-title" className="space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          <h3 id="alerts-title" className="text-sm font-semibold">Central de alertas</h3>
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
                <p className="mt-4 font-heading text-3xl font-semibold tracking-[-0.03em] text-destructive tabular-nums">
                  {item.count}
                </p>
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-h-56 border-primary/20 py-6 lg:row-span-2">
          <CardHeader className="px-6">
            <CardTitle className="text-[17px] font-normal text-balance">Comissão recebida</CardTitle>
            <p className="text-[13px] text-muted-foreground text-balance">Recebimentos registrados neste mês</p>
          </CardHeader>
          <CardContent className="mt-auto px-6">
            <p className="font-heading text-[40px] leading-none font-semibold tracking-[-0.04em] text-primary tabular-nums">
              <span className="mr-1 text-xl font-normal">R$</span><CountUp value={summary.comissao_do_mes} />
            </p>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-2">
          <Card size="sm" className="py-5">
            <CardHeader className="px-5"><CardTitle className="text-[13px] font-normal text-muted-foreground">Casos cadastrados</CardTitle></CardHeader>
            <CardContent className="px-5"><p className="font-heading text-[28px] font-semibold tracking-[-0.03em]">{summary.total_casos}</p></CardContent>
          </Card>
          <Card size="sm" className="py-5">
            <CardHeader className="px-5"><CardTitle className="text-[13px] font-normal text-muted-foreground">Cirurgias realizadas</CardTitle></CardHeader>
            <CardContent className="px-5"><p className="font-heading text-[28px] font-semibold tracking-[-0.03em]">{summary.cirurgias_realizadas}</p></CardContent>
          </Card>
          <Card size="sm" className="py-5 sm:col-span-3 lg:col-span-2">
            <CardHeader className="px-5"><CardTitle className="text-[13px] font-normal text-muted-foreground">Valor total faturado</CardTitle></CardHeader>
            <CardContent className="px-5"><p className="font-heading text-[28px] font-semibold tracking-[-0.03em]">{money(summary.valor_total_faturado)}</p></CardContent>
          </Card>
        </div>
      </div>

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
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value: number) => `R$ ${(value / 1000).toFixed(0)}k`}
                  width={48}
                />
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

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <CountTable title="Cirurgias por mês" data={monthData} />
          <CountTable title="Ranking por convênio" data={summary.por_convenio} />
        </div>
        <div className="space-y-4">
          <CountTable title="Ranking por hospital" data={summary.por_hospital} />
          <CountTable title="Ranking por procedimento" data={summary.por_procedimento} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recebimentos por mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mês</TableHead>
                    <TableHead className="text-right">Qtde</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.recebimentos_por_mes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-12 text-center text-muted-foreground">
                        Nenhum recebimento registrado.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.recebimentos_por_mes.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell>{m.month}</TableCell>
                        <TableCell className="text-right">{m.count}</TableCell>
                        <TableCell className="text-right">
                          R$ {m.total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Comissão por médico</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Médico</TableHead>
                    <TableHead className="text-right">Comissão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.comissao_por_medico.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="h-12 text-center text-muted-foreground">
                        Nenhuma comissão registrada.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summary.comissao_por_medico.map((m) => (
                      <TableRow key={m.label}>
                        <TableCell>{m.label}</TableCell>
                        <TableCell className="text-right">
                          R$ {m.total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-300/70">
        <CardHeader>
            <CardTitle className="text-balance">Pendências financeiras — faturado sem recebimento</CardTitle>
            <p className="text-sm text-amber-700 text-balance">
            Casos já faturados cuja cobrança ainda não foi recebida. Este é o
            principal gargalo que o AXIS resolve.
          </p>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Procedimento</TableHead>
                  <TableHead>Valor cobrança</TableHead>
                  <TableHead>Entrada cobrança</TableHead>
                  <TableHead>Status pagamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendencias.length === 0 ? (
                  <TableRow className="animate-in fade-in-0 duration-150 ease-[var(--ease-axis-out)]">
                    <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                      Nenhuma pendência.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendencias.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.patient?.full_name ?? "—"}</TableCell>
                      <TableCell>{r.procedure?.name ?? "—"}</TableCell>
                      <TableCell>
                        {r.valor_cobranca != null
                          ? `R$ ${r.valor_cobranca.toFixed(2)}`
                          : "—"}
                      </TableCell>
                      <TableCell>{r.entrada_cobranca ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={PAYMENT_STATUS_BADGE[paymentStatus(r.status)].variant as never}
                          className={PAYMENT_STATUS_BADGE[paymentStatus(r.status)].className}
                        >
                          {paymentStatusLabel(r.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { CaseRow, ReportSummary } from "@/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageLoader } from "@/components/spinner";

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
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [pendencias, setPendencias] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<ReportSummary>("/reports/summary"),
      api.get<CaseRow[]>("/reports/pendencias-financeiras"),
    ])
      .then(([s, p]) => {
        setSummary(s);
        setPendencias(p);
      })
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;
  if (!summary)
    return <p className="text-muted-foreground">Nenhum dado disponível.</p>;

  const monthData = summary.cirurgias_por_mes.map(({ month, count }) => ({
    label: month,
    count,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl font-semibold">Relatórios</h2>
        <p className="text-sm text-muted-foreground">
          Visão geral dos casos da sua clínica.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total de casos cadastrados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-semibold">
              {summary.total_casos}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cirurgias realizadas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-semibold">
              {summary.cirurgias_realizadas}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Valor total faturado</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-3xl font-semibold">
              R$ {summary.valor_total_faturado.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>
      </div>

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

      <Card className="border-amber-300/70">
        <CardHeader>
          <CardTitle>Pendências financeiras — faturado sem recebimento</CardTitle>
          <p className="text-sm text-amber-700">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendencias.length === 0 ? (
                  <TableRow className="animate-in fade-in-0 duration-150 ease-out">
                    <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                      Nenhuma pendência.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendencias.map((r) => (
                    <TableRow
                      key={r.id}
                      className="animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-out"
                    >
                      <TableCell>{r.patient?.full_name ?? "—"}</TableCell>
                      <TableCell>{r.procedimento}</TableCell>
                      <TableCell>
                        {r.valor_cobranca != null
                          ? `R$ ${r.valor_cobranca.toFixed(2)}`
                          : "—"}
                      </TableCell>
                      <TableCell>{r.entrada_cobranca ?? "—"}</TableCell>
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

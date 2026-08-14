import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";

import { api, uploadDocument } from "@/api/client";
import type { AuditEntry, CaseDocument, CaseRow, OrgMember } from "@/types";
import { PAYMENT_STATUS_BADGE, paymentStatus, paymentStatusLabel } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardAction,
} from "@/components/ui/card";
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
import { PageLoader } from "@/components/spinner";

const DOCUMENT_TYPES = [
  { label: "Guia de solicitação", value: "guia_solicitacao" },
  { label: "Guia de autorização", value: "guia_autorizacao" },
  { label: "Descrição cirúrgica", value: "descricao_cirurgica" },
  { label: "Nota fiscal", value: "nota_fiscal" },
  { label: "Outro", value: "outro" },
];

const DOC_TYPE_LABEL = Object.fromEntries(DOCUMENT_TYPES.map((d) => [d.value, d.label]));

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function money(v: number | null): string {
  return v != null ? `R$ ${v.toFixed(2)}` : "—";
}

export default function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [row, setRow] = useState<CaseRow | null>(null);
  const [docs, setDocs] = useState<CaseDocument[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [memberName, setMemberName] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState("outro");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [newDocumentId, setNewDocumentId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [caseData, docsData, auditData, members] = await Promise.all([
      api.get<CaseRow>(`/cases/${id}`),
      api.get<CaseDocument[]>(`/cases/${id}/documents`),
      api.get<AuditEntry[]>(`/cases/${id}/audit`),
      api.get<OrgMember[]>("/organizations/members").catch(() => [] as OrgMember[]),
    ]);
    setRow(caseData);
    setDocs(docsData);
    setAudit(auditData);
    setMemberName(
      Object.fromEntries(members.map((m) => [m.user_id, m.full_name ?? m.user_id]))
    );
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((e) => {
        toast.error((e as Error).message);
        navigate("/casos");
      })
      .finally(() => setLoading(false));
  }, [load, navigate]);

  const doUpload = async () => {
    if (!selectedFile) {
      toast.warning("Selecione um arquivo");
      return;
    }
    setUploading(true);
    try {
      const doc = await uploadDocument(id!, selectedFile, docType);
      toast.success("Documento enviado");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setDocs((prev) => [doc, ...prev]);
      setNewDocumentId(doc.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const openSignedUrl = async (docId: string) => {
    try {
      const data = await api.get<{ url: string }>(`/cases/${id}/documents/${docId}/url`);
      window.open(data.url, "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (loading) return <PageLoader />;
  if (!row) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Caso — {row.procedure?.name ?? "—"}</CardTitle>
          <CardAction>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft className="size-4" />
                Voltar
              </Button>
              <Button onClick={() => navigate(`/casos/${row.id}/editar`)}>
                <Pencil className="size-4" />
                Editar
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Paciente" value={row.patient?.full_name ?? "—"} />
            <Field label="Médico" value={row.doctor?.full_name ?? "—"} />
            <Field label="Hospital" value={row.hospital?.name ?? "—"} />
            <Field label="Convênio" value={row.insurer?.name ?? "—"} />
            <Field label="Fornecedor" value={row.supplier?.name ?? "—"} />
            <Field
              label="Status"
              value={
                <Badge
                  variant={PAYMENT_STATUS_BADGE[paymentStatus(row.status)].variant as never}
                  className={PAYMENT_STATUS_BADGE[paymentStatus(row.status)].className}
                >
                  {paymentStatusLabel(row.status)}
                </Badge>
              }
            />
            <Field label="Matrícula" value={row.matricula ?? "—"} />
            <Field label="Nº da guia" value={row.guia_numero ?? "—"} />
            <Field label="Usa OPME" value={row.usa_opme ? "Sim" : "Não"} />
            <Field label="Ficha de sala" value={row.ficha_de_sala ? "Sim" : "Não"} />
            <Field label="Data solicitação" value={row.data_solicitacao ?? "—"} />
            <Field label="Data autorização" value={row.data_autorizacao ?? "—"} />
            <Field label="Data agendamento" value={row.data_agendamento ?? "—"} />
            <Field label="Data cirurgia" value={row.data_cirurgia ?? "—"} />
            <Field label="Valor cobrança" value={money(row.valor_cobranca)} />
            <Field label="Data pagamento" value={row.data_pagamento ?? "—"} />
            <Field label="Data recebimento" value={row.data_recebimento ?? "—"} />
            <Field label="Valor da cirurgia" value={money(row.valor_cirurgia)} />
            <Field label="Comissão do médico" value={money(row.comissao_medico)} />
            <Field label="Receita adicional" value={money(row.receita_adicional)} />
          </div>
          {row.observacoes && (
            <div className="mt-4 flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Observações</span>
              <span className="text-sm">{row.observacoes}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" />
              {selectedFile ? selectedFile.name : "Escolher arquivo"}
            </Button>
            <Button onClick={doUpload} loading={uploading} disabled={!selectedFile}>
              Enviar
            </Button>
          </div>

          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Arquivo</TableHead>
                  <TableHead>Enviado em</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.length === 0 ? (
                  <TableRow className="animate-in fade-in-0 duration-150 ease-[var(--ease-axis-out)]">
                    <TableCell colSpan={4} className="h-16 text-center text-muted-foreground">
                      Nenhum documento.
                    </TableCell>
                  </TableRow>
                ) : (
                  docs.map((doc) => (
                    <TableRow
                      key={doc.id}
                      className={
                        doc.id === newDocumentId
                          ? "animate-in fade-in-0 slide-in-from-top-1 duration-200 ease-[var(--ease-axis-out)]"
                          : undefined
                      }
                    >
                      <TableCell>
                        {doc.document_type ? DOC_TYPE_LABEL[doc.document_type] ?? doc.document_type : "—"}
                      </TableCell>
                      <TableCell>{doc.file_name}</TableCell>
                      <TableCell>{new Date(doc.uploaded_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Baixar ${doc.file_name}`}
                          title="Baixar"
                          onClick={() => openSignedUrl(doc.id)}
                        >
                          <Download className="size-4" />
                        </Button>
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
          <CardTitle>Histórico de auditoria</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ação</TableHead>
                  <TableHead>Campo</TableHead>
                  <TableHead>Valor antigo</TableHead>
                  <TableHead>Valor novo</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-16 text-center text-muted-foreground">
                      Nenhum registro de auditoria.
                    </TableCell>
                  </TableRow>
                ) : (
                  audit.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge
                          variant={
                            entry.action === "insert"
                              ? "secondary"
                              : entry.action === "delete"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.field_changed ?? "—"}</TableCell>
                      <TableCell className="max-w-48 truncate">{entry.old_value ?? "—"}</TableCell>
                      <TableCell className="max-w-48 truncate">{entry.new_value ?? "—"}</TableCell>
                      <TableCell>
                        {entry.user_id ? memberName[entry.user_id] ?? `${entry.user_id.slice(0, 8)}…` : "—"}
                      </TableCell>
                      <TableCell>{new Date(entry.created_at).toLocaleString()}</TableCell>
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

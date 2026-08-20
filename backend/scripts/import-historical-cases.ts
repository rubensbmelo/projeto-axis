// =========================================================
// AXIS — Importação única dos 179 casos históricos
// (Planilha Controle de Procedimentos.xlsx → produção)
// =========================================================
// Script de uso único. Roda em modo dry-run por padrão (não grava nada);
// só grava no banco quando chamado com --commit.
//
// Uso:
//   npx ts-node --transpile-only scripts/import-historical-cases.ts
//   npx ts-node --transpile-only scripts/import-historical-cases.ts --commit
//
// Flags opcionais:
//   --file=<caminho>       (default: Planilha Controle de Procedimentos.xlsx na raiz do repo)
//   --org-id=<uuid>        (default: org única já existente, com verificação)
//   --doctor-id=<uuid>     (default: org_member do Dr. Maurício, com verificação)

import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';
import { adminClient } from '../src/supabaseClient';

// ---------------------------------------------------------
// CLI
// ---------------------------------------------------------

const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const argValue = (flag: string): string | undefined =>
  argv.find((a) => a.startsWith(`${flag}=`))?.split('=').slice(1).join('=');

const FILE_PATH = argValue('--file') ?? path.join(__dirname, '../../Planilha Controle de Procedimentos.xlsx');
const ORG_ID = argValue('--org-id') ?? '379216df-04b4-4898-af69-0deaeb52885a';
const DOCTOR_ID = argValue('--doctor-id') ?? 'f7dec701-6726-463b-a879-547f28143681';

// ---------------------------------------------------------
// Colunas da planilha (nomes exatos, incluindo espaços/typo reais do arquivo)
// ---------------------------------------------------------

const COLUMNS = {
  matricula: 'Matrícula',
  nome: 'Nome do Paciente',
  cpf: 'CPF',
  hospital: 'Hospital ',
  convenio: 'Nome do convênio',
  fichaDeSala: 'Ficha de sala',
  opme: 'OPME',
  fornecedor: 'Fornecedor ',
  procedimento: 'Procedimento',
  documentacao: 'Doumentação',
  dataSolicitacao: 'Data da solicitação',
  dataAutorizacao: 'Data da autorização',
  dataAgendamento: 'Data do agendamento',
  dataCirurgia: 'Data da cirurgia',
  entradaCobranca: 'Entrada para cobrança',
  valorCobranca: 'Valor da cobrança',
  dataPagamento: 'Data do pagamento',
  dataRecebimento: 'Data do recebimento',
} as const;

// ---------------------------------------------------------
// Normalização de texto (mesma lógica de similaridade usada em
// src/routes/patients.ts, reaplicada aqui pra hospitais/convênios/
// fornecedores/procedimentos e para o próprio dedup de pacientes)
// ---------------------------------------------------------

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Chave de agrupamento "óbvio": case-insensitive + trim + espaços colapsados
// + acentos removidos. É o que a tarefa pede para hospitais/convênios/
// fornecedores/procedimentos — não tenta corrigir erro de digitação real.
function normKey(value: string): string {
  return stripAccents(value).toLowerCase().trim().replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = a[i - 1] === b[j - 1]
        ? diagonal
        : Math.min(diagonal + 1, previous[j] + 1, previous[j - 1] + 1);
      diagonal = above;
    }
  }
  return previous[b.length];
}

// Idêntica à heurística de patients.ts — usada tanto pro dedup de pacientes
// quanto (por analogia) pra sinalizar possíveis duplicatas de referência.
function similarName(a: string, b: string): boolean {
  const left = normKey(a);
  const right = normKey(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  if (shorter.length >= 6 && (left.includes(right) || right.includes(left))) return true;
  const distance = levenshtein(left, right);
  return 1 - distance / Math.max(left.length, right.length) >= 0.85;
}

function cpfDigits(value?: string | null): string {
  return value ? value.replace(/\D/g, '') : '';
}

// similarName() não pega nomes com meio-nome abreviado por inicial (ex:
// "RENATA SORIANO F P VILARIM" vs "RENATA SORIANO FREIRE PEREIRA
// VILARIM") — o comprimento e as letras divergem demais pra Levenshtein
// ou substring. Isso é comum na planilha real (reentrada abreviada por
// pressa). Detecta por alinhamento token a token, só pra SINALIZAR no
// relatório — nunca mescla automaticamente.
function tokenizeName(value: string): string[] {
  return normKey(value).split(' ').filter(Boolean);
}

function initialsAlignedMatch(shortTokens: string[], longTokens: string[]): boolean {
  if (shortTokens.length < 2 || longTokens.length < shortTokens.length) return false;
  let cursor = 0;
  for (const token of shortTokens) {
    let matched = false;
    while (cursor < longTokens.length) {
      const candidate = longTokens[cursor];
      cursor += 1;
      if (candidate === token || (token.length === 1 && candidate.startsWith(token))) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

function possibleAbbreviatedDuplicate(a: string, b: string): boolean {
  if (similarName(a, b)) return false; // já seria mesclado por essa via, não precisa sinalizar de novo
  const ta = tokenizeName(a);
  const tb = tokenizeName(b);
  if (ta.length === 0 || tb.length === 0) return false;
  if (ta[0] !== tb[0]) return false; // primeiro nome precisa bater exatamente
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  return initialsAlignedMatch(shorter, longer);
}

// ---------------------------------------------------------
// Parsers de célula (datas, CPF, dinheiro, booleano SIM/NÃO)
// ---------------------------------------------------------

interface Issue {
  type: string;
  row: number; // 1-based, relativo às linhas de dados (sem cabeçalho)
  patient: string;
  detail: string;
}

function excelSerialToISO(serial: number): string | null {
  const d = XLSX.SSF.parse_date_code(serial);
  if (!d) return null;
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
}

// Tolera separador trocado/duplicado (ex: "22/01//2026", "09-01/2026") —
// extrai dia/mês/ano por posição, não inventa dígitos.
function parseDateCell(raw: unknown, field: string, row: number, patient: string, issues: Issue[]): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const iso = excelSerialToISO(raw);
    if (iso) return iso;
    issues.push({ type: 'data_invalida', row, patient, detail: `${field}: serial Excel inválido (${raw})` });
    return null;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\D+(\d{1,2})\D+(\d{4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      issues.push({ type: 'data_recuperada', row, patient, detail: `${field}: "${s}" (formatação inconsistente) recuperada como ${iso}` });
      return iso;
    }
  }
  issues.push({ type: 'data_nao_parseavel', row, patient, detail: `${field}: valor "${s}" não reconhecido, gravado como null` });
  return null;
}

interface CpfResult {
  value: string | null;
  recovered: boolean;
}

function parseCpf(raw: unknown, row: number, patient: string, issues: Issue[]): CpfResult {
  if (raw === null || raw === undefined || raw === '') return { value: null, recovered: false };
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 11) return { value: digits, recovered: false };
  if (digits.length === 10) {
    const padded = `0${digits}`;
    issues.push({ type: 'cpf_recuperado', row, patient, detail: `CPF "${raw}" (10 dígitos, zero à esquerda perdido no Excel) recuperado como ${padded}` });
    return { value: padded, recovered: true };
  }
  issues.push({ type: 'cpf_irrecuperavel', row, patient, detail: `CPF "${raw}" não corresponde a 11 dígitos válidos — gravado como null` });
  return { value: null, recovered: false };
}

function parseMoney(raw: unknown, field: string, row: number, patient: string, issues: Issue[]): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return raw;
  const cleaned = String(raw).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (Number.isFinite(n)) return n;
  issues.push({ type: 'valor_nao_parseavel', row, patient, detail: `${field}: valor "${raw}" não reconhecido, gravado como null` });
  return null;
}

function parseBool(raw: unknown): boolean | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const k = normKey(String(raw));
  if (k === 'sim') return true;
  if (k === 'nao') return false;
  return null;
}

// ---------------------------------------------------------
// Inferência de status (regra fixa dada pela tarefa)
// ---------------------------------------------------------

function inferStatus(dates: {
  dataSolicitacao: string | null;
  dataAutorizacao: string | null;
  dataAgendamento: string | null;
  dataCirurgia: string | null;
  entradaCobranca: string | null;
  dataPagamento: string | null;
  dataRecebimento: string | null;
}): string {
  if (dates.dataRecebimento) return 'pago';
  if (dates.entradaCobranca || dates.dataPagamento) return 'faturado';
  if (dates.dataCirurgia) return 'realizado';
  if (dates.dataAutorizacao) return 'autorizado';
  if (dates.dataAgendamento) return 'agendado';
  if (dates.dataSolicitacao) return 'solicitado';
  return 'solicitado';
}

// ---------------------------------------------------------
// Tabelas de referência: agrupamento normalizado + reaproveitamento
// de linhas já existentes no banco
// ---------------------------------------------------------

interface RefRow {
  id: string;
  name: string;
}

interface RefGroup {
  key: string;
  canonicalName: string;
  rawVariants: Map<string, number>;
  existingId: string | null;
  resolvedId: string | null; // preenchido depois de inserir/simular
}

async function loadExisting(table: string): Promise<RefRow[]> {
  const { data, error } = await adminClient.from(table).select('id, name').eq('org_id', ORG_ID);
  if (error) throw new Error(`Falha ao carregar ${table}: ${error.message}`);
  return data || [];
}

function buildRefGroups(rawValues: string[], existing: RefRow[]): Map<string, RefGroup> {
  const existingByKey = new Map(existing.map((r) => [normKey(r.name), r]));
  const groups = new Map<string, RefGroup>();

  for (const raw of rawValues) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = normKey(trimmed);
    let group = groups.get(key);
    if (!group) {
      group = { key, canonicalName: trimmed, rawVariants: new Map(), existingId: null, resolvedId: null };
      groups.set(key, group);
    }
    group.rawVariants.set(trimmed, (group.rawVariants.get(trimmed) || 0) + 1);
  }

  for (const group of groups.values()) {
    const existingRow = existingByKey.get(group.key);
    if (existingRow) {
      group.existingId = existingRow.id;
      group.resolvedId = existingRow.id;
      group.canonicalName = existingRow.name;
      continue;
    }
    let best: [string, number] | null = null;
    for (const [variant, count] of group.rawVariants) {
      if (!best || count > best[1]) best = [variant, count];
    }
    group.canonicalName = best![0];
  }

  return groups;
}

interface NearDuplicate {
  a: string;
  b: string;
}

function findNearDuplicates(groups: Map<string, RefGroup>): NearDuplicate[] {
  const names = [...groups.values()].map((g) => g.canonicalName);
  const pairs: NearDuplicate[] = [];
  for (let i = 0; i < names.length; i += 1) {
    for (let j = i + 1; j < names.length; j += 1) {
      if (similarName(names[i], names[j])) pairs.push({ a: names[i], b: names[j] });
    }
  }
  return pairs;
}

async function resolveGroups(table: string, groups: Map<string, RefGroup>): Promise<void> {
  for (const group of groups.values()) {
    if (group.resolvedId) continue; // já existia no banco
    if (COMMIT) {
      const { data, error } = await adminClient
        .from(table)
        .insert({ org_id: ORG_ID, name: group.canonicalName })
        .select('id')
        .single();
      if (error) throw new Error(`Falha ao criar ${table} "${group.canonicalName}": ${error.message}`);
      group.resolvedId = data.id;
    } else {
      group.resolvedId = `DRYRUN:${table}:${group.key}`;
    }
  }
}

// ---------------------------------------------------------
// Fornecedor: tratamento especial (campo aceita "Não"/"SIM" como
// resposta booleana disfarçada, e combos tipo "A/B" com mais de um
// fornecedor na mesma célula, que não cabem num único supplier_id)
// ---------------------------------------------------------

interface SupplierResolution {
  candidateForGroup: string | null; // valor único, elegível a virar/achar entidade
  note: string | null; // texto a preservar em observações
}

function resolveSupplierCell(raw: unknown, row: number, patient: string, issues: Issue[]): SupplierResolution {
  if (raw === null || raw === undefined || raw === '') return { candidateForGroup: null, note: null };
  const trimmed = String(raw).trim();
  const key = normKey(trimmed);

  if (key === 'nao') return { candidateForGroup: null, note: null };

  if (key === 'sim') {
    issues.push({ type: 'fornecedor_anomalo', row, patient, detail: `Coluna Fornecedor contém "SIM" (não é um nome de fornecedor) — gravado sem fornecedor, revisar linha original` });
    return { candidateForGroup: null, note: `Valor anômalo na planilha original (coluna Fornecedor): "${trimmed}"` };
  }

  if (/\/| e /i.test(trimmed)) {
    issues.push({ type: 'fornecedor_multiplo', row, patient, detail: `Múltiplos fornecedores na mesma célula ("${trimmed}") — não é possível atribuir um único supplier_id, gravado sem fornecedor` });
    return { candidateForGroup: null, note: `Fornecedor(es) na planilha original (não atribuído automaticamente, múltiplos valores): "${trimmed}"` };
  }

  return { candidateForGroup: trimmed, note: null };
}

// ---------------------------------------------------------
// Pacientes: dedup por CPF (forte) ou nome parecido (fraco), mantendo
// uma lista em memória que cresce durante a própria importação (pra
// pegar reentradas duplicadas dentro da planilha, não só contra o banco)
// ---------------------------------------------------------

interface PatientRecord {
  id: string;
  full_name: string;
  cpf: string | null;
}

interface PatientResolution {
  id: string;
  created: boolean;
  matchedBy: 'cpf' | 'nome' | null;
}

async function resolvePatient(
  fullName: string,
  cpf: string | null,
  known: PatientRecord[],
  row: number,
  issues: Issue[],
): Promise<PatientResolution> {
  const cpfNorm = cpfDigits(cpf);

  if (cpfNorm) {
    const cpfMatch = known.find((p) => cpfDigits(p.cpf) === cpfNorm);
    if (cpfMatch) return { id: cpfMatch.id, created: false, matchedBy: 'cpf' };
  }

  const nameMatches = known.filter((p) => similarName(fullName, p.full_name));
  if (nameMatches.length > 0) {
    // CPF explicitamente divergente entre nomes parecidos é sinal forte de
    // que são pessoas diferentes — não mescla, cria um paciente novo e avisa.
    const conflicting = cpfNorm && nameMatches.every((p) => cpfDigits(p.cpf) && cpfDigits(p.cpf) !== cpfNorm);
    if (!conflicting) {
      return { id: nameMatches[0].id, created: false, matchedBy: 'nome' };
    }
    issues.push({
      type: 'paciente_nome_parecido_cpf_diferente',
      row,
      patient: fullName,
      detail: `Nome parecido com paciente já cadastrado (${nameMatches[0].full_name}), mas CPF diferente — tratado como pessoa distinta, revisar`,
    });
  }

  if (COMMIT) {
    const { data, error } = await adminClient
      .from('patients')
      .insert({ org_id: ORG_ID, full_name: fullName, cpf: cpfNorm || null })
      .select('id, full_name, cpf')
      .single();
    if (error) throw new Error(`Falha ao criar paciente "${fullName}": ${error.message}`);
    known.push(data);
    return { id: data.id, created: true, matchedBy: null };
  }

  const fakeId = `DRYRUN:patient:${row}`;
  known.push({ id: fakeId, full_name: fullName, cpf: cpfNorm || null });
  return { id: fakeId, created: true, matchedBy: null };
}

// ---------------------------------------------------------
// Leitura da planilha
// ---------------------------------------------------------

interface SheetRow {
  rowNumber: number; // 1-based, relativo às linhas de dados
  cells: Record<string, unknown>;
}

function readSheet(filePath: string): SheetRow[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Planilha não encontrada em: ${filePath}`);
  }
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const header = raw[0] as string[];

  const colIndex: Record<string, number> = {};
  for (const [key, label] of Object.entries(COLUMNS)) {
    const idx = header.indexOf(label);
    if (idx === -1) throw new Error(`Coluna esperada não encontrada na planilha: "${label}"`);
    colIndex[key] = idx;
  }

  const rows: SheetRow[] = [];
  let rowNumber = 0;
  for (const r of raw.slice(1)) {
    if (!r.some((v) => v !== null && v !== '')) continue; // linha totalmente vazia
    rowNumber += 1;
    const cells: Record<string, unknown> = {};
    for (const key of Object.keys(COLUMNS)) cells[key] = r[colIndex[key]];
    rows.push({ rowNumber, cells });
  }
  return rows;
}

// ---------------------------------------------------------
// Relatório
// ---------------------------------------------------------

interface Report {
  mode: 'DRY-RUN' | 'COMMIT';
  totalRows: number;
  casesCreated: number;
  casesSkipped: Array<{ row: number; patient: string; reason: string }>;
  statusBreakdown: Record<string, number>;
  patients: { created: number; reusedByCpf: number; reusedByName: number; createdNames: string[]; possibleAbbreviatedDuplicates: NearDuplicate[] };
  references: Record<string, { existingReused: number; newCreated: Array<{ name: string; mergedVariants: string[] }>; nearDuplicates: NearDuplicate[] }>;
  issues: Issue[];
}

function printAndSaveReport(report: Report): void {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push('='.repeat(70));
  push(`RELATÓRIO DE IMPORTAÇÃO — ${report.mode}`);
  push('='.repeat(70));
  push(`Linhas processadas na planilha: ${report.totalRows}`);
  push(`Casos ${report.mode === 'DRY-RUN' ? 'que seriam criados' : 'criados'}: ${report.casesCreated}`);
  push(`Linhas puladas (erro fatal): ${report.casesSkipped.length}`);
  for (const s of report.casesSkipped) push(`  - linha ${s.row} (${s.patient}): ${s.reason}`);
  push('');
  push('--- Distribuição de status inferido ---');
  for (const [status, count] of Object.entries(report.statusBreakdown)) push(`  ${status}: ${count}`);
  push('');
  push('--- Pacientes ---');
  push(`  Criados: ${report.patients.created}`);
  push(`  Reaproveitados por CPF: ${report.patients.reusedByCpf}`);
  push(`  Reaproveitados por nome parecido: ${report.patients.reusedByName}`);
  if (report.patients.createdNames.length > 0) {
    push('  Nomes dos pacientes criados:');
    for (const name of report.patients.createdNames) push(`    - ${name}`);
  }
  if (report.patients.possibleAbbreviatedDuplicates.length > 0) {
    push('  Possíveis duplicatas (nome com meio-nome abreviado, ex: "F P" vs "Freire Pereira") — NÃO mescladas automaticamente, revisar manualmente:');
    for (const dup of report.patients.possibleAbbreviatedDuplicates) push(`    - "${dup.a}" vs "${dup.b}"`);
  }
  push('');

  for (const [table, info] of Object.entries(report.references)) {
    push(`--- Referências: ${table} ---`);
    push(`  Já existiam e foram reaproveitadas: ${info.existingReused}`);
    push(`  Novas criadas: ${info.newCreated.length}`);
    for (const created of info.newCreated) {
      const variants = created.mergedVariants.filter((v) => v !== created.name);
      push(`    - "${created.name}"${variants.length ? ` (agrupou variações: ${variants.join(', ')})` : ''}`);
    }
    if (info.nearDuplicates.length > 0) {
      push('  Possíveis duplicatas — NÃO mescladas automaticamente, revisar manualmente:');
      for (const dup of info.nearDuplicates) push(`    - "${dup.a}" vs "${dup.b}"`);
    }
    push('');
  }

  push('--- Linhas com problema (revisão humana) ---');
  const byType = new Map<string, Issue[]>();
  for (const issue of report.issues) {
    if (!byType.has(issue.type)) byType.set(issue.type, []);
    byType.get(issue.type)!.push(issue);
  }
  if (report.issues.length === 0) push('  Nenhuma.');
  for (const [type, issues] of byType) {
    push(`  [${type}] (${issues.length})`);
    for (const issue of issues) push(`    - linha ${issue.row} (${issue.patient}): ${issue.detail}`);
  }

  const text = lines.join('\n');
  console.log(text);

  const reportsDir = path.join(__dirname, 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(reportsDir, `import-report-${report.mode.toLowerCase()}-${stamp}.txt`);
  fs.writeFileSync(outPath, text, 'utf8');
  console.log(`\nRelatório salvo em: ${outPath}`);
}

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------

async function main(): Promise<void> {
  console.log(`Modo: ${COMMIT ? 'COMMIT (grava no banco)' : 'DRY-RUN (simulação, nada é gravado)'}`);
  console.log(`Arquivo: ${FILE_PATH}`);
  console.log(`Org: ${ORG_ID} | Médico (doctor_id): ${DOCTOR_ID}`);

  const { data: org, error: orgErr } = await adminClient.from('organizations').select('id, name').eq('id', ORG_ID).single();
  if (orgErr || !org) throw new Error(`Organização ${ORG_ID} não encontrada: ${orgErr?.message}`);
  const { data: doctor, error: doctorErr } = await adminClient
    .from('org_members')
    .select('id, org_id, full_name')
    .eq('id', DOCTOR_ID)
    .single();
  if (doctorErr || !doctor) throw new Error(`org_member ${DOCTOR_ID} não encontrado: ${doctorErr?.message}`);
  if (doctor.org_id !== ORG_ID) throw new Error(`org_member ${DOCTOR_ID} pertence a outra organização`);
  console.log(`Organização confirmada: "${org.name}" | Médico confirmado: "${doctor.full_name}"\n`);

  const rows = readSheet(FILE_PATH);
  console.log(`Linhas de dados lidas da planilha: ${rows.length}\n`);

  const issues: Issue[] = [];

  // ---- Fase 1: agrupar valores de referência ----
  const [existingHospitals, existingInsurers, existingSuppliers, existingProcedures, existingPatients] = await Promise.all([
    loadExisting('hospitals'),
    loadExisting('insurers'),
    loadExisting('suppliers'),
    loadExisting('procedures'),
    (async () => {
      const { data, error } = await adminClient.from('patients').select('id, full_name, cpf').eq('org_id', ORG_ID);
      if (error) throw new Error(`Falha ao carregar patients: ${error.message}`);
      return (data || []) as PatientRecord[];
    })(),
  ]);

  const hospitalRaw = rows.map((r) => r.cells.hospital).filter((v): v is string => typeof v === 'string' || typeof v === 'number').map(String);
  const insurerRaw = rows.map((r) => r.cells.convenio).filter((v): v is string => typeof v === 'string' || typeof v === 'number').map(String);
  const procedureRaw = rows.map((r) => r.cells.procedimento).filter((v): v is string => typeof v === 'string' || typeof v === 'number').map(String);

  // Fornecedor precisa de resolução por linha antes de virar candidato a grupo
  // (filtra "Não"/"SIM"/combos múltiplos — ver resolveSupplierCell).
  const supplierResolutions = new Map<number, SupplierResolution>();
  for (const row of rows) {
    const resolution = resolveSupplierCell(row.cells.fornecedor, row.rowNumber, String(row.cells.nome ?? ''), issues);
    supplierResolutions.set(row.rowNumber, resolution);
  }
  const supplierRaw = [...supplierResolutions.values()].map((r) => r.candidateForGroup).filter((v): v is string => v !== null);

  const hospitalGroups = buildRefGroups(hospitalRaw, existingHospitals);
  const insurerGroups = buildRefGroups(insurerRaw, existingInsurers);
  const supplierGroups = buildRefGroups(supplierRaw, existingSuppliers);
  const procedureGroups = buildRefGroups(procedureRaw, existingProcedures);

  const hospitalDupes = findNearDuplicates(hospitalGroups);
  const insurerDupes = findNearDuplicates(insurerGroups);
  const supplierDupes = findNearDuplicates(supplierGroups);
  const procedureDupes = findNearDuplicates(procedureGroups);

  await resolveGroups('hospitals', hospitalGroups);
  await resolveGroups('insurers', insurerGroups);
  await resolveGroups('suppliers', supplierGroups);
  await resolveGroups('procedures', procedureGroups);

  // ---- Fase 2: montar casos linha a linha ----
  const knownPatients = [...existingPatients];
  let patientsCreated = 0;
  let patientsReusedByCpf = 0;
  let patientsReusedByName = 0;
  const createdPatientNames: string[] = [];

  const casesToInsert: Record<string, unknown>[] = [];
  const casesSkipped: Array<{ row: number; patient: string; reason: string }> = [];
  const statusBreakdown: Record<string, number> = {};

  for (const row of rows) {
    const c = row.cells;
    const patientName = String(c.nome ?? '').trim();
    if (!patientName) {
      casesSkipped.push({ row: row.rowNumber, patient: '(sem nome)', reason: 'Nome do paciente vazio' });
      continue;
    }

    const procedimentoRaw = c.procedimento !== null && c.procedimento !== undefined ? String(c.procedimento).trim() : '';
    if (!procedimentoRaw) {
      casesSkipped.push({ row: row.rowNumber, patient: patientName, reason: 'Procedimento vazio (campo obrigatório, procedure_id não pode ser null)' });
      continue;
    }

    const { value: cpf } = parseCpf(c.cpf, row.rowNumber, patientName, issues);
    const patientResult = await resolvePatient(patientName, cpf, knownPatients, row.rowNumber, issues);
    if (patientResult.created) {
      patientsCreated += 1;
      createdPatientNames.push(patientName);
    } else if (patientResult.matchedBy === 'cpf') {
      patientsReusedByCpf += 1;
    } else if (patientResult.matchedBy === 'nome') {
      patientsReusedByName += 1;
    }

    const dataSolicitacao = parseDateCell(c.dataSolicitacao, 'Data da solicitação', row.rowNumber, patientName, issues);
    const dataAutorizacao = parseDateCell(c.dataAutorizacao, 'Data da autorização', row.rowNumber, patientName, issues);
    const dataAgendamento = parseDateCell(c.dataAgendamento, 'Data do agendamento', row.rowNumber, patientName, issues);
    const dataCirurgia = parseDateCell(c.dataCirurgia, 'Data da cirurgia', row.rowNumber, patientName, issues);
    const entradaCobranca = parseDateCell(c.entradaCobranca, 'Entrada para cobrança', row.rowNumber, patientName, issues);
    const dataPagamento = parseDateCell(c.dataPagamento, 'Data do pagamento', row.rowNumber, patientName, issues);
    const dataRecebimento = parseDateCell(c.dataRecebimento, 'Data do recebimento', row.rowNumber, patientName, issues);
    const valorCobranca = parseMoney(c.valorCobranca, 'Valor da cobrança', row.rowNumber, patientName, issues);

    const status = inferStatus({ dataSolicitacao, dataAutorizacao, dataAgendamento, dataCirurgia, entradaCobranca, dataPagamento, dataRecebimento });
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;

    const hospitalRawValue = typeof c.hospital === 'string' || typeof c.hospital === 'number' ? String(c.hospital).trim() : '';
    const insurerRawValue = typeof c.convenio === 'string' || typeof c.convenio === 'number' ? String(c.convenio).trim() : '';
    const hospitalId = hospitalRawValue ? hospitalGroups.get(normKey(hospitalRawValue))!.resolvedId : null;
    const insurerId = insurerRawValue ? insurerGroups.get(normKey(insurerRawValue))!.resolvedId : null;
    const procedureId = procedureGroups.get(normKey(procedimentoRaw))!.resolvedId;

    const supplierResolution = supplierResolutions.get(row.rowNumber)!;
    const supplierId = supplierResolution.candidateForGroup
      ? supplierGroups.get(normKey(supplierResolution.candidateForGroup))!.resolvedId
      : null;

    const documentacao = c.documentacao !== null && c.documentacao !== undefined ? String(c.documentacao).trim() : '';
    const observacoesParts: string[] = [];
    if (documentacao) observacoesParts.push(`Nota histórica (planilha original): documento "${documentacao}" mencionado, arquivo original não migrado.`);
    if (supplierResolution.note) observacoesParts.push(supplierResolution.note);
    const observacoes = observacoesParts.length > 0 ? observacoesParts.join(' ') : null;

    const matriculaRaw = c.matricula !== null && c.matricula !== undefined ? String(c.matricula).trim() : '';

    casesToInsert.push({
      org_id: ORG_ID,
      patient_id: patientResult.id,
      doctor_id: DOCTOR_ID,
      hospital_id: hospitalId,
      insurer_id: insurerId,
      supplier_id: supplierId,
      procedure_id: procedureId,
      matricula: matriculaRaw || null,
      guia_numero: null,
      usa_opme: parseBool(c.opme) ?? false,
      ficha_de_sala: parseBool(c.fichaDeSala) ?? false,
      status,
      data_solicitacao: dataSolicitacao,
      data_autorizacao: dataAutorizacao,
      data_agendamento: dataAgendamento,
      data_cirurgia: dataCirurgia,
      entrada_cobranca: entradaCobranca,
      valor_cobranca: valorCobranca,
      data_pagamento: dataPagamento,
      data_recebimento: dataRecebimento,
      valor_cirurgia: null,
      comissao_medico: null,
      receita_adicional: null,
      observacoes,
      created_by: DOCTOR_ID,
    });
  }

  // ---- Fase 3: gravar casos (se --commit) ----
  if (COMMIT) {
    const CHUNK = 25;
    for (let i = 0; i < casesToInsert.length; i += CHUNK) {
      const chunk = casesToInsert.slice(i, i + CHUNK);
      const { error } = await adminClient.from('surgery_cases').insert(chunk);
      if (error) throw new Error(`Falha ao inserir lote de casos (linhas ~${i + 1}-${i + chunk.length}): ${error.message}`);
    }
  }

  // ---- Relatório ----
  const abbreviatedDuplicates: NearDuplicate[] = [];
  for (let i = 0; i < knownPatients.length; i += 1) {
    for (let j = i + 1; j < knownPatients.length; j += 1) {
      if (possibleAbbreviatedDuplicate(knownPatients[i].full_name, knownPatients[j].full_name)) {
        abbreviatedDuplicates.push({ a: knownPatients[i].full_name, b: knownPatients[j].full_name });
      }
    }
  }

  const buildRefReport = (table: string, groups: Map<string, RefGroup>, dupes: NearDuplicate[]) => {
    const newCreated: Array<{ name: string; mergedVariants: string[] }> = [];
    let existingReused = 0;
    for (const group of groups.values()) {
      if (group.existingId) existingReused += 1;
      else newCreated.push({ name: group.canonicalName, mergedVariants: [...group.rawVariants.keys()] });
    }
    return { existingReused, newCreated, nearDuplicates: dupes };
  };

  const report: Report = {
    mode: COMMIT ? 'COMMIT' : 'DRY-RUN',
    totalRows: rows.length,
    casesCreated: casesToInsert.length,
    casesSkipped,
    statusBreakdown,
    patients: {
      created: patientsCreated,
      reusedByCpf: patientsReusedByCpf,
      reusedByName: patientsReusedByName,
      createdNames: createdPatientNames,
      possibleAbbreviatedDuplicates: abbreviatedDuplicates,
    },
    references: {
      hospitals: buildRefReport('hospitals', hospitalGroups, hospitalDupes),
      insurers: buildRefReport('insurers', insurerGroups, insurerDupes),
      suppliers: buildRefReport('suppliers', supplierGroups, supplierDupes),
      procedures: buildRefReport('procedures', procedureGroups, procedureDupes),
    },
    issues,
  };

  printAndSaveReport(report);
}

main().catch((err) => {
  console.error('\nERRO FATAL:', err.message);
  process.exit(1);
});

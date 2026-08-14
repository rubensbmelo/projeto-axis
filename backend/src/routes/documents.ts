import { Router } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { AuthedRequest, requireRole } from '../middleware/auth';

const router = Router();
const MAX_UPLOAD_MB = Number(process.env.DOC_UPLOAD_MAX_MB ?? 15);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
});

const BUCKET = 'case-documents';
const VALID_TYPES = ['guia_solicitacao', 'guia_autorizacao', 'descricao_cirurgica', 'nota_fiscal', 'outro'];

// Allowlist de MIME → extensões aceitas nos documentos anexados.
const ALLOWED_DOC_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
};

function validateFileType(file: Express.Multer.File): string | null {
  const ext = (file.originalname.split('.').pop() || '').toLowerCase();
  const allowedExts = ALLOWED_DOC_TYPES[file.mimetype];
  if (!allowedExts || !allowedExts.includes(`.${ext}`)) {
    return 'Tipo de arquivo não permitido. Use PDF, imagem (jpg/png/webp), Word (doc/docx) ou Excel (xls/xlsx).';
  }
  // Magic bytes: confere o conteúdo real, não só o que o cliente declarou.
  const b = file.buffer;
  const match = {
    'application/pdf': () => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
    'image/jpeg': () => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
    'image/png': () => b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
    'image/webp': () =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
    'application/msword': () => isOle(b),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': () => isZip(b),
    'application/vnd.ms-excel': () => isOle(b),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': () => isZip(b),
  } as Record<string, () => boolean>;
  const checker = match[file.mimetype];
  if (checker && !checker()) {
    return 'Conteúdo do arquivo não corresponde ao tipo declarado.';
  }
  return null;
}

function isZip(b: Buffer): boolean {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);
}

function isOle(b: Buffer): boolean {
  return b.length >= 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
}

// Confere que o caso existe e pertence à organização antes de subir arquivo
// (mesmo padrão do validateOrgReferences em cases.ts — FK não respeita RLS).
async function validateCaseBelongsToOrg(supabase: any, orgId: string, caseId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('surgery_cases')
    .select('id')
    .eq('id', caseId)
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) return 'Falha ao validar o caso';
  if (!data) return 'Caso não pertence a esta organização ou não existe';
  return null;
}

// GET /api/cases/:caseId/documents
router.get('/:caseId/documents', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data, error } = await r.supabase
    .from('case_documents')
    .select('*')
    .eq('case_id', req.params.caseId)
    .eq('org_id', r.orgId)
    .order('uploaded_at', { ascending: false });
  if (error) return res.status(400).json({ error });
  res.json(data || []);
});

// POST /api/cases/:caseId/documents  (multipart/form-data: file, document_type)
router.post('/:caseId/documents', requireRole('owner', 'doctor', 'secretary') as any, upload.single('file'), async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const file = req.file;
  const documentType = (req.body?.document_type as string) || 'outro';

  if (!file) return res.status(400).json({ error: 'Nenhum arquivo enviado (campo "file")' });
  if (!VALID_TYPES.includes(documentType)) {
    return res.status(400).json({ error: `document_type inválido. Use um de: ${VALID_TYPES.join(', ')}` });
  }

  const typeError = validateFileType(file);
  if (typeError) return res.status(400).json({ error: typeError });

  const caseError = await validateCaseBelongsToOrg(r.supabase, r.orgId, req.params.caseId);
  if (caseError) return res.status(404).json({ error: caseError });

  // O nome do arquivo enviado pelo usuário NUNCA vai pro caminho do Storage
  // (evita path traversal e caracteres inválidos) — só é usado como
  // "file_name" de exibição, guardado no banco.
  const extension = (file.originalname.split('.').pop() || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
  const safeFileName = `${randomUUID()}${extension ? '.' + extension : ''}`;
  const storagePath = `${r.orgId}/${req.params.caseId}/${safeFileName}`;

  const { error: uploadError } = await r.supabase.storage
    .from(BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype });
  if (uploadError) return res.status(400).json({ error: uploadError });

  const { data, error } = await r.supabase
    .from('case_documents')
    .insert({
      org_id: r.orgId,
      case_id: req.params.caseId,
      document_type: documentType,
      file_name: file.originalname,
      storage_path: storagePath,
      uploaded_by: r.orgMemberId,
    })
    .select()
    .single();
  if (error) {
    // Desfaz o upload pra não deixar arquivo órfão sem registro no banco
    await r.supabase.storage.from(BUCKET).remove([storagePath]);
    return res.status(400).json({ error });
  }

  res.status(201).json(data);
});

// GET /api/cases/:caseId/documents/:docId/url — gera link temporário de download
router.get('/:caseId/documents/:docId/url', async (req, res) => {
  const r = req as unknown as AuthedRequest;
  const { data: doc, error: docError } = await r.supabase
    .from('case_documents')
    .select('storage_path')
    .eq('id', req.params.docId)
    .eq('case_id', req.params.caseId)
    .eq('org_id', r.orgId)
    .single();
  if (docError) return res.status(404).json({ error: docError });

  const { data, error } = await r.supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.storage_path, 60 * 5); // 5 minutos
  if (error) return res.status(400).json({ error });

  res.json({ url: data.signedUrl });
});

export default router;

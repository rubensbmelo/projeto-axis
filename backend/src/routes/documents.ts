import { Router } from 'express';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { AuthedRequest, requireRole } from '../middleware/auth';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } }); // 15MB

const BUCKET = 'case-documents';
const VALID_TYPES = ['guia_solicitacao', 'guia_autorizacao', 'descricao_cirurgica', 'nota_fiscal', 'outro'];

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

import dotenv from 'dotenv';
dotenv.config();

import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { authMiddleware } from './middleware/auth';

import organizationsRoutes from './routes/organizations';
import patientsRoutes from './routes/patients';
import casesRoutes from './routes/cases';
import documentsRoutes from './routes/documents';
import reportsRoutes from './routes/reports';
import { referenceTableRouter } from './routes/referenceTable';

// CORS restrito por variável de ambiente (frontend local + produção).
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json());

// Atrás de proxy reverso (Render/Railway/Cloudflare), ajustar para 1 no deploy.
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

// Sanitiza qualquer campo `error` que venha como objeto (ex: PostgrestError)
// para nunca vazar detalhes internos (hints, codes, schema) ao cliente.
app.use((req, res, next) => {
  const original = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (b.error && typeof b.error === 'object') {
        const e = b.error as { message?: unknown };
        b.error = typeof e?.message === 'string' && e.message ? e.message : 'Erro inesperado';
      }
    }
    return original(body) as Response;
  }) as typeof res.json;
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      // Sem Origin (curl, testes, mesmo-origin) ou origem permitida → libera.
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
  })
);

const rateOptions = (limit: number) => ({
  windowMs: 15 * 60 * 1000,
  limit,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente mais tarde.' },
});

// Rate limiting global (todas as rotas /api) + limites específicos.
app.use('/api', rateLimit(rateOptions(Number(process.env.RATE_LIMIT_GLOBAL ?? 300))));
app.post('/api/organizations', rateLimit(rateOptions(Number(process.env.RATE_LIMIT_AUTH ?? 30))));
app.post('/api/cases/:caseId/documents', rateLimit(rateOptions(Number(process.env.RATE_LIMIT_UPLOAD ?? 30))));

app.get('/health', (_req, res) => res.json({ ok: true }));

// organizations.ts controla sua própria autenticação rota-a-rota
// (POST / não exige org ainda existir; as demais exigem).
app.use('/api/organizations', organizationsRoutes);

// Todo o resto exige usuário autenticado E já pertencer a uma organização.
app.use('/api/patients', authMiddleware, patientsRoutes);
app.use('/api/cases', authMiddleware, casesRoutes);
app.use('/api/cases', authMiddleware, documentsRoutes); // /api/cases/:caseId/documents
app.use('/api/reports', authMiddleware, reportsRoutes);
app.use('/api/hospitals', authMiddleware, referenceTableRouter('hospitals'));
app.use('/api/insurers', authMiddleware, referenceTableRouter('insurers'));
app.use('/api/suppliers', authMiddleware, referenceTableRouter('suppliers'));

// Erros não capturados: loga no servidor, devolve mensagem genérica.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

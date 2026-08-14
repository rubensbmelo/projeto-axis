import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';

import organizationsRoutes from './routes/organizations';
import patientsRoutes from './routes/patients';
import casesRoutes from './routes/cases';
import documentsRoutes from './routes/documents';
import reportsRoutes from './routes/reports';
import { referenceTableRouter } from './routes/referenceTable';

const app = express();
app.use(cors());
app.use(express.json());

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

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

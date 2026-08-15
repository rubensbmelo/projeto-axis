import { supabase } from './supabase';
import type { CaseDocument } from '../types';

const ORG_KEY = 'axis_org_id';

export function orgId(): string | null {
  return localStorage.getItem(ORG_KEY);
}

export function setOrgId(id: string) {
  localStorage.setItem(ORG_KEY, id);
}

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const org = orgId();
  if (org) headers['x-org-id'] = org;

  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let errorBody: unknown = null;
    try {
      const body = await res.json();
      errorBody = body;
      if (body?.error) {
        message = typeof body.error === 'string' ? body.error : JSON.stringify(body.error);
      } else if (body?.message) {
        message = body.message;
      }
    } catch {
      // corpo não-JSON
    }
    const err = new Error(message) as Error & { body?: unknown };
    err.body = errorBody;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export async function uploadDocument(
  caseId: string,
  file: File,
  documentType: string
): Promise<CaseDocument> {
  const token = await getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const org = orgId();
  if (org) headers['x-org-id'] = org;

  const body = new FormData();
  body.append('file', file);
  body.append('document_type', documentType);

  const res = await fetch(`/api/cases/${caseId}/documents`, { method: 'POST', headers, body });
  if (!res.ok) {
    let message = `Erro ${res.status}`;
    try {
      const parsed = await res.json();
      if (parsed?.error) message = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return res.json() as Promise<CaseDocument>;
}

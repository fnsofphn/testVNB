import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabaseClient';
import { validateRosterRows } from './validation.js';

export type TrainingOperationsCommand = { type: string; payload?: Record<string, unknown> };

type TrainingOperationsResponse = {
  ok: boolean;
  role: string;
  availableRoles?: string[];
  actor?: { id: string; name: string; email: string; role: string };
  directory?: Array<{ id: string; name: string; email: string; role?: string; roles?: string[]; active?: boolean; profileLinked?: boolean; assignable?: boolean }>;
  accountDirectory?: Array<{ id: string; name: string; email: string; role?: string; roles?: string[]; active?: boolean; profileLinked?: boolean }>;
  state: any;
  version: number;
  updatedAt?: string | null;
  storage?: string;
  summary?: Record<string, number>;
  audit?: { persisted: number; warning?: string };
};

function requireSupabase() {
  if (!supabase) throw new Error('Supabase client is not configured.');
  return supabase;
}

async function getAccessToken() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  let session = data.session;
  const expiresAt = Number(session?.expires_at || 0);
  if (session && expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) < 60) {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data.session;
  }
  if (!session?.access_token) throw new Error('Missing session token.');
  return session.access_token;
}

async function requestApi(path: string, init: RequestInit = {}, activeRole?: string) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (activeRole) headers.set('X-VWork-Role', activeRole);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    const error = new Error(payload?.error || `HTTP ${response.status}`) as Error & { code?: string; status?: number; details?: unknown; version?: number };
    error.code = payload?.code;
    error.status = response.status;
    error.details = payload?.details;
    error.version = payload?.version;
    throw error;
  }
  return payload;
}

export async function fetchTrainingOperationsState(activeRole?: string): Promise<TrainingOperationsResponse> {
  return requestApi('/api/vwork-training-operations', { method: 'GET' }, activeRole);
}

export async function executeTrainingOperationsCommand(command: TrainingOperationsCommand, expectedVersion: number, activeRole?: string): Promise<TrainingOperationsResponse> {
  return requestApi('/api/vwork-training-operations', {
    method: 'POST',
    body: JSON.stringify({ command, expectedVersion, requestId: crypto.randomUUID() }),
  }, activeRole);
}

export async function createTrainingOperationsAccount(input: { fullName: string; email: string; password: string; roles: string[]; replaceRoles?: boolean }, activeRole?: string) {
  return requestApi('/api/vwork-training-operations-user', {
    method: 'POST',
    body: JSON.stringify(input),
  }, activeRole) as Promise<{ ok: true; user: { id: string; authUserId: string; email: string; name: string; role: string; roles: string[]; authUserCreated: boolean } }>;
}

async function uploadFileToSignedUrl(signedUrl: string, file: File) {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);
  const response = await fetch(signedUrl, { method: 'PUT', headers: { 'x-upsert': 'true' }, body });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Upload failed with HTTP ${response.status}.`);
  }
}

export async function uploadTrainingOperationsFile(file: File, entityId: string, documentType: string, activeRole?: string) {
  const payload = await requestApi('/api/vwork-training-operations-file', {
    method: 'POST',
    body: JSON.stringify({ fileName: file.name, contentType: file.type || 'application/octet-stream', size: file.size, entityId, documentType }),
  }, activeRole);
  const upload = payload?.upload;
  if (!upload?.bucket || !upload.path || !upload.signedUrl) throw new Error('Server did not return a signed upload URL.');
  await uploadFileToSignedUrl(upload.signedUrl, file);
  return { id: upload.path, name: upload.fileName || file.name, bucket: upload.bucket, path: upload.path, private: true, size: file.size, contentType: file.type || 'application/octet-stream' };
}

export async function getTrainingOperationsFileUrl(path: string, fileName?: string, activeRole?: string) {
  const payload = await requestApi('/api/vwork-training-operations-file', {
    method: 'POST',
    body: JSON.stringify({ action: 'signed_download', path, fileName }),
  }, activeRole);
  if (!payload?.download?.signedUrl) throw new Error('Server did not return a signed download URL.');
  return payload.download.signedUrl as string;
}

export async function validateRosterWorkbook(file: File, expectedClassCodes: string[]) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return validateRosterRows([], expectedClassCodes);
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], { defval: '' });
  return validateRosterRows(rows, expectedClassCodes);
}

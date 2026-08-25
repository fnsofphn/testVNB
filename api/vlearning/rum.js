import { createHash } from 'node:crypto';
import { incrementSharedCounters } from '../_shared-counter.js';

const MAX_BODY_BYTES = 8 * 1024;
const ALLOWED_EVENTS = new Set(['login', 'open_course', 'open_class', 'submit_quiz']);
const ALLOWED_STATUSES = new Set(['ok', 'error']);

function hash(value, length = 24) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function cleanText(value, max = 80) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, max);
}

function clampDuration(value) {
  const numeric = Number(value);
  return Math.max(0, Math.min(300_000, Math.round(Number.isFinite(numeric) ? numeric : 0)));
}

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('Payload too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    const error = new Error('Invalid JSON body.');
    error.statusCode = 400;
    throw error;
  }
}

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

async function verifyUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Authentication required.');
    error.statusCode = 401;
    throw error;
  }
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    const error = new Error('RUM authentication is not configured.');
    error.statusCode = 503;
    throw error;
  }
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) {
    const authError = new Error('Invalid bearer token.');
    authError.statusCode = 401;
    throw authError;
  }
  return String(data.user.id);
}

function logRum(level, fields) {
  const line = JSON.stringify({
    level,
    route: 'vlearning-rum',
    module: 'vlearning',
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = String(req.headers['x-vercel-id'] || req.headers['x-request-id'] || hash(`${Date.now()}:${Math.random()}`, 16));
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const event = cleanText(body?.event, 40);
    const status = cleanText(body?.status, 20);
    if (!ALLOWED_EVENTS.has(event) || !ALLOWED_STATUSES.has(status)) {
      sendJson(res, 400, { ok: false, error: 'Invalid RUM event.' });
      return;
    }
    const userId = await verifyUser(req);
    const [counter] = await incrementSharedCounters([
      { key: `rum:${hash(userId)}:${Math.floor(Date.now() / 60_000)}`, windowMs: 60_000 },
    ]);
    if (counter.count > 600) {
      sendJson(res, 429, { ok: false, error: 'RUM rate limit exceeded.' });
      return;
    }
    const scopeType = cleanText(body?.scopeType, 30) || 'global';
    const scopeId = cleanText(body?.scopeId, 180) || 'global';
    logRum(status === 'error' ? 'warning' : 'info', {
      msg: 'browser_measure',
      event,
      status,
      requestId,
      scopeType,
      scopeHash: hash(`${scopeType}:${scopeId}`),
      userHash: hash(userId),
      totalMs: clampDuration(body?.totalMs),
      dbMs: 0,
      retryCount: Math.max(0, Math.min(20, Math.round(Number(body?.retryCount || 0)))),
      navigationType: cleanText(body?.navigationType, 30) || 'unknown',
      connectionType: cleanText(body?.connectionType, 30) || 'unknown',
      ingestMs: Date.now() - startedAt,
    });
    sendJson(res, 202, { ok: true, requestId });
  } catch (error) {
    const status = Number(error?.statusCode || 500);
    logRum(status >= 500 ? 'error' : 'warning', {
      msg: 'ingest_failed',
      status: 'error',
      requestId,
      code: status,
      totalMs: Date.now() - startedAt,
      dbMs: 0,
      retryCount: 0,
    });
    sendJson(res, status, { ok: false, error: status >= 500 ? 'Unable to record browser metric.' : error.message });
  }
}

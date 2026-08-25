import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const VSUITE_ROLES = new Set([
  'admin',
  'vsuite_admin',
  'vsuite_ops',
  'vsuite_requester',
  'vsuite_accountant',
  'vsuite_manager',
  'vsuite_director',
  'vsuite_treasurer',
  'vsuite_trainer',
  'vsuite_teamlead',
  'vsuite_ctv',
  'vsuite_lms',
]);

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.msg || data?.message || JSON.stringify(data);
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function buildHeaders(apiKey, authorization) {
  const headers = {
    apikey: apiKey,
    'Content-Type': 'application/json',
  };
  if (authorization) headers.Authorization = authorization;
  return headers;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

async function ensureBucket(client, bucket) {
  const bucketOptions = {
    public: true,
    fileSizeLimit: MAX_UPLOAD_BYTES,
  };
  const existing = await client.storage.getBucket(bucket);
  if (!existing.error) {
    const updated = await client.storage.updateBucket(bucket, bucketOptions);
    if (updated.error && !String(updated.error.message || '').toLowerCase().includes('already exists')) {
      throw updated.error;
    }
    return;
  }
  if (!String(existing.error.message || '').toLowerCase().includes('not found')) {
    throw existing.error;
  }

  const created = await client.storage.createBucket(bucket, bucketOptions);
  if (created.error && !String(created.error.message || '').toLowerCase().includes('already exists')) {
    throw created.error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'vsuite-file', ...RATE_LIMITS.upload })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const bucket = process.env.SUPABASE_VSUITE_BUCKET || 'vsuite-documents';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Server upload is not configured.' });
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      sendJson(res, 401, { ok: false, error: 'Missing session token.' });
      return;
    }

    const sessionUser = await requestJson(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: buildHeaders(anonKey, `Bearer ${token}`),
    });

    const encodedRequesterId = encodeURIComponent(`eq.${sessionUser.id}`);
    const requesterProfiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active,auth_user_id&auth_user_id=${encodedRequesterId}&active=is.true`,
      {
        method: 'GET',
        headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      },
    );

    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    if (!requesterProfile || !VSUITE_ROLES.has(String(requesterProfile.role || ''))) {
      sendJson(res, 403, { ok: false, error: 'No active V-Suite profile mapped to this session.' });
      return;
    }

    const body = await readJsonBody(req);
    const fileName = String(body.fileName || '').trim();
    const paymentRequestId = String(body.paymentRequestId || '').trim();
    const documentType = String(body.documentType || 'other').trim();
    if (body.action !== 'signed_upload_url' || !fileName || !paymentRequestId) {
      sendJson(res, 400, { ok: false, error: 'Missing upload payload.' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await ensureBucket(admin, bucket);

    const safeFileName = `${Date.now()}-${slugify(fileName) || 'file'}`;
    const objectPath = [
      'payment-documents',
      slugify(paymentRequestId) || 'unknown-request',
      slugify(documentType) || 'other',
      safeFileName,
    ].join('/');

    const signedResult = await admin.storage.from(bucket).createSignedUploadUrl(objectPath, { upsert: true });
    if (signedResult.error) throw signedResult.error;

    sendJson(res, 200, {
      ok: true,
      upload: {
        bucket,
        path: objectPath,
        token: signedResult.data?.token || '',
        signedUrl: signedResult.data?.signedUrl || '',
        fileName,
      },
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

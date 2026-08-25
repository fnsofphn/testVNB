import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

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

function cleanEntryPath(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .join('/');
}

const configuredMaxUploadBytes = Number(process.env.SUPABASE_UPLOAD_FILE_SIZE_LIMIT_BYTES || '');
const MAX_UPLOAD_BYTES = Number.isFinite(configuredMaxUploadBytes) && configuredMaxUploadBytes > 0
  ? configuredMaxUploadBytes
  : 150 * 1024 * 1024;
const BUCKET_OBJECT_LIMIT_BYTES = MAX_UPLOAD_BYTES;

async function ensureBucket(client, bucket) {
  const bucketOptions = {
    public: true,
    fileSizeLimit: BUCKET_OBJECT_LIMIT_BYTES,
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
  if (!await enforceRateLimit(req, res, { route: 'scorm-upload', ...RATE_LIMITS.upload })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const bucket = process.env.SUPABASE_SCORM_BUCKET || process.env.SUPABASE_WORKFLOW_BUCKET || process.env.SUPABASE_INTAKE_BUCKET || 'vcontent-intake';

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

    const requesterProfiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active,auth_user_id&auth_user_id=${encodeURIComponent(`eq.${sessionUser.id}`)}&active=is.true`,
      {
        method: 'GET',
        headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      },
    );

    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    if (!requesterProfile) {
      sendJson(res, 403, { ok: false, error: 'No active profile mapped to this session.' });
      return;
    }

    const body = await readJsonBody(req);
    const packageId = slugify(body.packageId || '');
    const entries = Array.isArray(body.entries) ? body.entries : [];
    if (!packageId || !entries.length || entries.length > 500) {
      sendJson(res, 400, { ok: false, error: 'Invalid SCORM upload payload.' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    await ensureBucket(admin, bucket);

    const storagePrefix = ['elearning', 'scorm', packageId].join('/');
    const uploads = [];
    for (const entry of entries) {
      const entryPath = cleanEntryPath(entry.path);
      if (!entryPath) continue;
      const objectPath = `${storagePrefix}/${entryPath}`;
      const signedResult = await admin.storage.from(bucket).createSignedUploadUrl(objectPath, { upsert: true });
      if (signedResult.error) throw signedResult.error;
      uploads.push({
        path: entryPath,
        objectPath,
        token: signedResult.data?.token || '',
        signedUrl: signedResult.data?.signedUrl || '',
        contentType: String(entry.contentType || 'application/octet-stream'),
      });
    }

    sendJson(res, 200, {
      ok: true,
      bucket,
      storagePrefix,
      uploads,
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

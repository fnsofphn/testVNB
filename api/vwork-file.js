import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const VWORK_UPLOAD_ROLES = new Set([
  'admin',
  'vplanning_admin',
  'vplanning_director',
  'vplanning_manager',
  'vplanning_member',
  'vplanning_collaborator',
  'vplanning_lecturer',
  'vplanning_controller',
  'vsuite_admin',
  'vsuite_ops',
  'vsuite_requester',
  'vsuite_accountant',
  'vsuite_manager',
  'vsuite_director',
  'vsuite_treasurer',
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hasVWorkUploadRole(profile) {
  const roles = [profile?.role, ...(Array.isArray(profile?.vplanning_roles) ? profile.vplanning_roles : [])]
    .map((role) => String(role || '').trim())
    .filter(Boolean);
  return roles.some((role) => VWORK_UPLOAD_ROLES.has(role));
}

async function isVPlanningUser(supabaseUrl, headers, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  const users = await requestJson(
    `${supabaseUrl}/rest/v1/vplanning_users?select=email,roles&email=${encodeURIComponent(`eq.${normalizedEmail}`)}&limit=1`,
    { method: 'GET', headers },
  );
  return Array.isArray(users) && users.some((user) => Array.isArray(user.roles) && user.roles.some((role) => String(role || '').startsWith('vplanning_')));
}

async function findAuthorizedProfile(supabaseUrl, headers, profiles) {
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    if (hasVWorkUploadRole(profile) || await isVPlanningUser(supabaseUrl, headers, profile.email)) return profile;
  }
  return null;
}

async function findActiveVWorkProfile(supabaseUrl, headers, sessionUser) {
  const select = 'id,email,role,vplanning_roles,active,auth_user_id';
  const authUserId = String(sessionUser?.id || '').trim();
  if (authUserId) {
    const profiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=${select}&auth_user_id=${encodeURIComponent(`eq.${authUserId}`)}&active=is.true`,
      { method: 'GET', headers },
    );
    const matched = await findAuthorizedProfile(supabaseUrl, headers, profiles);
    if (matched) return matched;
  }

  const email = normalizeEmail(sessionUser?.email);
  if (email) {
    const profiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=${select}&email=${encodeURIComponent(`eq.${email}`)}&active=is.true`,
      { method: 'GET', headers },
    );
    const matched = await findAuthorizedProfile(supabaseUrl, headers, profiles);
    if (matched) return matched;
  }

  return null;
}

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
  if (!await enforceRateLimit(req, res, { route: 'vwork-file', ...RATE_LIMITS.upload })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const bucket = process.env.SUPABASE_VWORK_BUCKET || 'vwork-documents';

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

    const requesterProfile = await findActiveVWorkProfile(
      supabaseUrl,
      buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      sessionUser,
    );
    if (!requesterProfile) {
      sendJson(res, 403, { ok: false, code: 'VWORK_PERMISSION_DENIED', error: 'Tài khoản hiện tại chưa được cấp quyền tải tệp trong V-Work.' });
      return;
    }

    const body = await readJsonBody(req);
    const fileName = String(body.fileName || '').trim();
    const entityId = String(body.entityId || '').trim();
    const documentType = String(body.documentType || 'other').trim();
    if (body.action !== 'signed_upload_url' || !fileName || !entityId) {
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
      'vwork-documents',
      slugify(entityId) || 'unknown-entity',
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

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

function extractStorageObject(fileUrl, bucket) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const publicSegment = `/storage/v1/object/public/${bucket}/`;
  const signedSegment = `/storage/v1/object/sign/${bucket}/`;

  if (fileUrl.includes(publicSegment)) return decodeURIComponent(fileUrl.split(publicSegment)[1].split('?')[0]);
  if (fileUrl.includes(signedSegment)) return decodeURIComponent(fileUrl.split(signedSegment)[1].split('?')[0]);
  if (fileUrl.startsWith(`storage://${bucket}/`)) return fileUrl.slice(`storage://${bucket}/`.length);
  return null;
}

async function ensureBucket(client, bucket) {
  const existing = await client.storage.getBucket(bucket);
  if (!existing.error) return;
  if (!String(existing.error.message || '').toLowerCase().includes('not found')) throw existing.error;
  const created = await client.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: '20MB',
  });
  if (created.error && !String(created.error.message || '').toLowerCase().includes('already exists')) throw created.error;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'profile-avatar-upload', ...RATE_LIMITS.upload })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const bucket = process.env.SUPABASE_AVATAR_BUCKET || 'vcontent-avatars';

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
    if (!requesterProfile) {
      sendJson(res, 403, { ok: false, error: 'No active profile mapped to this session.' });
      return;
    }

    const body = await readJsonBody(req);
    const profileId = String(body.profileId || '').trim();
    const fileName = String(body.fileName || '').trim();
    const contentType = String(body.contentType || 'application/octet-stream').trim();
    const base64Data = String(body.base64Data || '').trim();
    const previousUrl = String(body.previousUrl || '').trim();

    if (!profileId || !fileName || !base64Data) {
      sendJson(res, 400, { ok: false, error: 'Missing upload payload.' });
      return;
    }

    if (requesterProfile.id !== profileId) {
      sendJson(res, 403, { ok: false, error: 'Cannot upload avatar for another profile.' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await ensureBucket(admin, bucket);
    const safeFileName = `${Date.now()}-${slugify(fileName) || 'avatar'}`;
    const objectPath = ['avatars', slugify(profileId) || 'unknown-profile', safeFileName].join('/');

    const previousObjectPath = extractStorageObject(previousUrl, bucket);
    if (previousObjectPath) await admin.storage.from(bucket).remove([previousObjectPath]);

    const bytes = Buffer.from(base64Data, 'base64');
    const uploadResult = await admin.storage.from(bucket).upload(objectPath, bytes, {
      contentType,
      upsert: true,
    });
    if (uploadResult.error) throw uploadResult.error;

    const publicResult = admin.storage.from(bucket).getPublicUrl(objectPath);
    const publicUrl = publicResult?.data?.publicUrl;
    if (!publicUrl) throw new Error('Failed to resolve uploaded file URL.');

    sendJson(res, 200, {
      ok: true,
      file: {
        fileName,
        fileUrl: publicUrl,
        bucket,
        path: objectPath,
      },
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

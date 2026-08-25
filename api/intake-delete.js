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

function extractStorageObject(fileUrl, bucket) {
  if (!fileUrl || typeof fileUrl !== 'string') return null;
  const publicSegment = `/storage/v1/object/public/${bucket}/`;
  const signedSegment = `/storage/v1/object/sign/${bucket}/`;

  if (fileUrl.includes(publicSegment)) {
    return decodeURIComponent(fileUrl.split(publicSegment)[1].split('?')[0]);
  }
  if (fileUrl.includes(signedSegment)) {
    return decodeURIComponent(fileUrl.split(signedSegment)[1].split('?')[0]);
  }
  if (fileUrl.startsWith(`storage://${bucket}/`)) {
    return fileUrl.slice(`storage://${bucket}/`.length);
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'intake-delete', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  const bucket = process.env.SUPABASE_INTAKE_BUCKET || 'vcontent-intake';

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
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,active,auth_user_id&auth_user_id=${encodedRequesterId}&active=is.true`,
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
    const fileUrl = String(body.fileUrl || '').trim();
    const objectPath = extractStorageObject(fileUrl, bucket);
    if (!objectPath) {
      sendJson(res, 200, { ok: true, removed: false });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const removeResult = await admin.storage.from(bucket).remove([objectPath]);
    if (removeResult.error) {
      throw removeResult.error;
    }

    sendJson(res, 200, { ok: true, removed: true });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

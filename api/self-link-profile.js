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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'self-link-profile', ...RATE_LIMITS.admin })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Server profile linking is not configured.' });
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

    const authUserId = String(sessionUser?.id || '').trim();
    const email = String(sessionUser?.email || '').trim().toLowerCase();
    if (!authUserId || !email) {
      sendJson(res, 400, { ok: false, error: 'Authenticated user is missing id or email.' });
      return;
    }

    const body = await readJsonBody(req);
    const profileEmail = String(body.email || email).trim().toLowerCase();

    const encodedEmail = encodeURIComponent(`eq.${profileEmail}`);
    const candidates = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,email,full_name,active,auth_user_id&email=${encodedEmail}&active=is.true`,
      {
        method: 'GET',
        headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      },
    );

    const profile = Array.isArray(candidates)
      ? candidates.find((item) => !item.auth_user_id || item.auth_user_id === authUserId) || null
      : null;

    if (!profile) {
      sendJson(res, 404, { ok: false, error: 'No active profile matched this email.' });
      return;
    }

    if (profile.auth_user_id && profile.auth_user_id !== authUserId) {
      sendJson(res, 409, { ok: false, error: 'Profile is already linked to another auth user.' });
      return;
    }

    await requestJson(`${supabaseUrl}/rest/v1/vcontent_profiles?id=eq.${encodeURIComponent(profile.id)}`, {
      method: 'PATCH',
      headers: {
        ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        auth_user_id: authUserId,
        email: profileEmail,
      }),
    });

    sendJson(res, 200, {
      ok: true,
      profile: {
        id: profile.id,
        email: profileEmail,
        fullName: profile.full_name || null,
      },
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

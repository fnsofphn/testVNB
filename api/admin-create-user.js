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

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, '_');
}

function canProvisionAuthUser(role) {
  return [
    'admin',
    'manager_dao_tao',
    'quan_ly_dao_tao',
    'quan_tri_dao_tao',
    'giam_doc_dao_tao',
    'training_manager',
    'training_admin',
    'training_ops_admin',
    'vtraining_manager',
    'vtraining_admin',
  ].includes(normalizeRole(role));
}

const VBUSINESS_ROLES = new Set([
  'admin',
  'sales_mgr',
  'sales_exec',
  'bid_mgr',
  'bid_member',
  'pm',
  'finance',
  'accountant',
  'hr',
  'employee',
]);

function normalizeVBusinessRole(role) {
  const normalized = normalizeRole(role);
  return VBUSINESS_ROLES.has(normalized) ? normalized : null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'admin-create-user', ...RATE_LIMITS.admin })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Server auth provisioning is not configured.' });
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
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,vbusiness_role,active,auth_user_id&auth_user_id=${encodedRequesterId}&active=is.true`,
      {
        method: 'GET',
        headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      },
    );

    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    if (!requesterProfile || (!canProvisionAuthUser(requesterProfile.role) && requesterProfile.vbusiness_role !== 'admin')) {
      sendJson(res, 403, { ok: false, error: 'Only admin or training manager accounts can create login users.' });
      return;
    }

    const body = await readJsonBody(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim();
    const profileId = String(body.profileId || '').trim();
    const profileRole = normalizeRole(body.profileRole || body.role || 'hoc_gia') || 'hoc_gia';
    const vbusinessRole = normalizeVBusinessRole(body.vbusinessRole || body.vbusiness_role || body.role);

    if (!email || !password) {
      sendJson(res, 400, { ok: false, error: 'Email and password are required.' });
      return;
    }
    if (password.length < 6) {
      sendJson(res, 400, { ok: false, error: 'Password must be at least 6 characters.' });
      return;
    }
    if ((body.vbusinessRole || body.vbusiness_role) && !vbusinessRole) {
      sendJson(res, 400, { ok: false, error: 'Invalid VBusiness role.' });
      return;
    }

    const created = await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || email,
        },
        app_metadata: vbusinessRole ? { vbusiness_role: vbusinessRole } : undefined,
      }),
    });

    const authUserId = created?.id || created?.user?.id || null;

    if (profileId && authUserId) {
      await requestJson(`${supabaseUrl}/rest/v1/vcontent_profiles?id=eq.${encodeURIComponent(profileId)}`, {
        method: 'PATCH',
        headers: {
          ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          auth_user_id: authUserId,
          ...(vbusinessRole ? { vbusiness_role: vbusinessRole } : {}),
        }),
      });
    } else if (authUserId) {
      const existingProfiles = await requestJson(
        `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,email&email=eq.${encodeURIComponent(email)}&limit=1`,
        {
          method: 'GET',
          headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
        },
      );
      const existingProfile = Array.isArray(existingProfiles) ? existingProfiles[0] : null;
      const profilePayload = {
        email,
        full_name: fullName || email,
        auth_user_id: authUserId,
        active: true,
        ...(vbusinessRole ? { vbusiness_role: vbusinessRole } : {}),
      };
      if (existingProfile?.id) {
        await requestJson(`${supabaseUrl}/rest/v1/vcontent_profiles?id=eq.${encodeURIComponent(existingProfile.id)}`, {
          method: 'PATCH',
          headers: {
            ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(profilePayload),
        });
      } else {
        await requestJson(`${supabaseUrl}/rest/v1/vcontent_profiles`, {
          method: 'POST',
          headers: {
            ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            id: `PROFILE_${Date.now()}`,
            role: profileRole,
            access_scope: 'self',
            ...profilePayload,
          }),
        });
      }
    }

    sendJson(res, 200, {
      ok: true,
      user: {
        id: authUserId,
        email: created?.email || created?.user?.email || email,
      },
    });
  } catch (error) {
    const message = String(error.message || error);
    const alreadyExists = message.includes('already been registered') || message.includes('User already registered');
    sendJson(res, alreadyExists ? 409 : error.status || 500, {
      ok: false,
      error: alreadyExists ? 'Email already exists in Supabase Auth.' : message,
    });
  }
}

import { enforceRateLimit } from './_rate-limit.js';

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
  return {
    apikey: apiKey,
    Authorization: authorization || `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRole(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  if (['quan_ly_noi_dung', 'quan_ly_don_hang', 'order_manager'].includes(normalized)) return 'content_manager';
  if (normalized === 'quan_ly_san_xuat') return 'production_manager';
  return normalized;
}

async function listAllProfiles(supabaseUrl, headers) {
  const select =
    'id,email,full_name,role,vbusiness_role,company_id,organization_id,title,active,access_scope,auth_user_id,student_class,student_group,student_code';
  const pageSize = 1000;
  const profiles = [];

  for (let offset = 0; offset < 20_000; offset += pageSize) {
    const page = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=${select}&active=is.true&order=full_name.asc&limit=${pageSize}&offset=${offset}`,
      { headers },
    );
    if (!Array.isArray(page) || page.length === 0) break;
    profiles.push(...page);
    if (page.length < pageSize) break;
  }

  return profiles;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'profiles-list', windowMs: 60_000, max: 90 })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Server profile listing is not configured.' });
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

    const headers = buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`);
    const profiles = await listAllProfiles(supabaseUrl, headers);

    const requesterProfile = Array.isArray(profiles)
      ? profiles.find((item) => item.auth_user_id === sessionUser.id) ||
        profiles.find((item) => normalizeEmail(item.email) === normalizeEmail(sessionUser.email)) ||
        null
      : null;

    const role = normalizeRole(requesterProfile?.role);
    const canListAssignableProfiles =
      ['admin', 'content_manager', 'production_manager', 'pm'].includes(role) ||
      requesterProfile?.vbusiness_role === 'admin';
    if (!requesterProfile || !canListAssignableProfiles) {
      sendJson(res, 403, { ok: false, error: 'Profile listing is not allowed for this role.' });
      return;
    }

    sendJson(res, 200, {
      ok: true,
      profiles: Array.isArray(profiles) ? profiles : [],
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

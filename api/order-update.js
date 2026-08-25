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
  return {
    apikey: apiKey,
    Authorization: authorization || `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const MANAGER_ROLES = new Set(['admin', 'content_manager', 'production_manager', 'pm']);
const ORDER_PATCH_KEYS = new Set([
  'client',
  'company_id',
  'title',
  'module',
  'deadline',
  'status',
  'created_by_profile_id',
  'intake_note',
  'rejection_reason',
  'change_request_reason',
  'stage_sla_overrides',
  'submitted_at',
  'launched_at',
  'assignees',
]);

function sanitizePatch(rawPatch, role) {
  if (!isPlainObject(rawPatch)) return null;
  const patch = {};
  for (const [key, value] of Object.entries(rawPatch)) {
    if (ORDER_PATCH_KEYS.has(key)) {
      patch[key] = value;
    }
  }
  if (!Object.keys(patch).length) return null;
  if (role === 'production_manager') {
    const keys = Object.keys(patch);
    if (keys.some((key) => key !== 'stage_sla_overrides')) return null;
  }
  return patch;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'order-update', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Order update API is not configured.' });
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
    const encodedRequesterId = encodeURIComponent(`eq.${sessionUser.id}`);
    const requesterProfiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active&auth_user_id=${encodedRequesterId}&active=is.true&limit=1`,
      { headers },
    );
    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    const role = normalizeRole(requesterProfile?.role);
    if (!requesterProfile || !MANAGER_ROLES.has(role)) {
      sendJson(res, 403, { ok: false, error: 'This role cannot update orders.' });
      return;
    }

    const body = await readJsonBody(req);
    const orderId = String(body.orderId || '').trim();
    const patch = sanitizePatch(body.patch, role);
    if (!orderId || !patch) {
      sendJson(res, 400, { ok: false, error: 'Missing order update payload.' });
      return;
    }

    const encodedOrderId = encodeURIComponent(`eq.${orderId}`);
    const updated = await requestJson(`${supabaseUrl}/rest/v1/vcontent_orders?id=${encodedOrderId}&select=*`, {
      method: 'PATCH',
      headers: {
        ...headers,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        ...patch,
        updated_at: new Date().toISOString(),
      }),
    });

    sendJson(res, 200, { ok: true, order: Array.isArray(updated) ? updated[0] : updated });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

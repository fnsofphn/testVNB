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

function toAvatarInitials(fullName) {
  return String(fullName || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
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
  const normalized = String(role || '').trim().toLowerCase();
  return VBUSINESS_ROLES.has(normalized) ? normalized : null;
}

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function canCreateProfile(requesterProfile, targetRole) {
  const requesterRole = normalizeRole(requesterProfile?.role);
  const requesterVBusinessRole = normalizeRole(requesterProfile?.vbusiness_role);
  if (requesterRole === 'admin' || requesterVBusinessRole === 'admin') return true;
  if (requesterRole !== 'training_ops_admin') return false;
  return new Set(['hoc_vien', 'giang_vien', 'ctv']).has(normalizeRole(targetRole));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'admin-create-profile', ...RATE_LIMITS.admin })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Server profile provisioning is not configured.' });
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
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,vbusiness_role,active,auth_user_id&auth_user_id=eq.${encodeURIComponent(sessionUser.id)}&active=is.true`,
      {
        method: 'GET',
        headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      },
    );

    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    const body = await readJsonBody(req);
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const role = String(body.role || '').trim().toLowerCase();
    if (!requesterProfile || !canCreateProfile(requesterProfile, role)) {
      sendJson(res, 403, { ok: false, error: 'Only admin or training manager accounts can create training profiles.' });
      return;
    }

    const organizationId = body.organizationId ? String(body.organizationId) : null;
    const companyId = body.companyId ? String(body.companyId) : null;
    const title = body.title ? String(body.title).trim() : null;
    const accessScope = String(body.accessScope || 'self').trim().toLowerCase();
    const studentClass = body.studentClass ? String(body.studentClass).trim() : null;
    const studentGroup = body.studentGroup ? String(body.studentGroup).trim() : null;
    const studentCode = body.studentCode ? String(body.studentCode).trim() : null;
    const vbusinessRole = normalizeVBusinessRole(body.vbusinessRole || body.vbusiness_role);

    if (!fullName || !email || !role) {
      sendJson(res, 400, { ok: false, error: 'Full name, email and role are required.' });
      return;
    }
    if ((body.vbusinessRole || body.vbusiness_role) && !vbusinessRole) {
      sendJson(res, 400, { ok: false, error: 'Invalid VBusiness role.' });
      return;
    }

    const existingProfiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,email&email=eq.${encodeURIComponent(email)}`,
      {
        method: 'GET',
        headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      },
    );

    if (Array.isArray(existingProfiles) && existingProfiles.length) {
      sendJson(res, 409, { ok: false, error: 'Email already exists in profiles.' });
      return;
    }

    const profileId = `PROFILE_${Date.now()}`;
    const payload = {
      id: profileId,
      email,
      full_name: fullName,
      role,
      organization_id: organizationId,
      company_id: companyId,
      title,
      avatar_initials: toAvatarInitials(fullName),
      active: true,
      access_scope: accessScope,
      student_class: studentClass,
      student_group: studentGroup,
      student_code: studentCode,
      vbusiness_role: vbusinessRole,
    };

    await requestJson(`${supabaseUrl}/rest/v1/vcontent_profiles`, {
      method: 'POST',
      headers: {
        ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });

    sendJson(res, 200, {
      ok: true,
      profile: {
        id: profileId,
        email,
        fullName,
        role,
      },
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

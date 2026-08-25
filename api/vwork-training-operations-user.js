import { createLimitedBufferReader, parseByteLimit } from './_body-limit.js';
import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

const MAX_BODY_BYTES = parseByteLimit(process.env.VWORK_TRAINING_OPERATIONS_USER_BODY_LIMIT, 64 * 1024);
const readLimitedBuffer = createLimitedBufferReader({ maxBytes: MAX_BODY_BYTES });
const ACCOUNT_ROLES = {
  manager: { profileRole: 'ctv', vplanningRole: 'vplanning_manager', title: 'Quản lý ekip' },
  member: { profileRole: 'ctv', vplanningRole: 'vplanning_member', title: 'Thành viên ekip' },
};

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') {
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized) > MAX_BODY_BYTES) {
      const error = new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`);
      error.status = 413;
      throw error;
    }
    return req.body;
  }
  const buffer = await readLimitedBuffer(req);
  if (!buffer.length) return {};
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    const error = new Error('Invalid JSON body.');
    error.status = 400;
    throw error;
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.message || data?.msg || data?.error || JSON.stringify(data);
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function buildHeaders(apiKey, authorization, prefer) {
  return {
    apikey: apiKey,
    Authorization: authorization,
    'Content-Type': 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function canProvisionAccounts(profile, vplanningUser) {
  const tokens = [
    profile?.role,
    profile?.title,
    ...(Array.isArray(profile?.vplanning_roles) ? profile.vplanning_roles : []),
    ...(Array.isArray(vplanningUser?.roles) ? vplanningUser.roles : []),
  ].map(normalizeRole).filter(Boolean);
  return tokens.some((token) => [
    'admin', 'training_ops_admin', 'vplanning_admin', 'training_manager',
    'training_admin', 'production_manager', 'vplanning_director',
  ].some((allowed) => token === allowed || token.includes(allowed)));
}

async function restoreRow(restUrl, serviceHeaders, table, key, previous) {
  const filter = `${key}=eq.${encodeURIComponent(previous?.[key] || '')}`;
  if (!previous) {
    await requestJson(`${restUrl}/${table}?${filter}`, { method: 'DELETE', headers: serviceHeaders });
    return;
  }
  await requestJson(`${restUrl}/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(previous),
  });
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === 'production' && process.env.VWORK_TRAINING_OPERATIONS_ENABLED !== 'true') {
    res.status(404).json({ ok: false, code: 'TRAINING_OPERATIONS_DISABLED', error: 'VWork Training Operations is not enabled.' });
    return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!enforceRateLimit(req, res, { route: 'vwork-training-operations-user', ...RATE_LIMITS.admin })) return;

  const config = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  };
  if (!config.supabaseUrl || !config.serviceRoleKey || !config.anonKey) {
    res.status(500).json({ ok: false, code: 'TRAINING_OPERATIONS_CONFIG_MISSING', error: 'Supabase server config is missing.' });
    return;
  }

  let createdAuthUserId = '';
  let provisionedEmail = '';
  let previousProfile = null;
  let previousVplanningUser = null;
  let profileWasCreated = false;
  let vplanningUserWasCreated = false;
  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ ok: false, error: 'Missing session token.' });
      return;
    }

    const sessionUser = await requestJson(`${config.supabaseUrl}/auth/v1/user`, {
      headers: buildHeaders(config.anonKey, `Bearer ${token}`),
    });
    const restUrl = `${config.supabaseUrl}/rest/v1`;
    const serviceHeaders = buildHeaders(config.serviceRoleKey, `Bearer ${config.serviceRoleKey}`);
    const requesterEmail = normalizeEmail(sessionUser?.email);
    const requesterProfiles = await requestJson(
      `${restUrl}/vcontent_profiles?select=id,email,role,title,vplanning_roles,active,auth_user_id&or=(auth_user_id.eq.${encodeURIComponent(sessionUser.id)},email.eq.${encodeURIComponent(requesterEmail)})&active=is.true&limit=1`,
      { headers: serviceHeaders },
    );
    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] || null : null;
    const requesterUsers = requesterEmail ? await requestJson(
      `${restUrl}/vplanning_users?select=email,roles&email=eq.${encodeURIComponent(requesterEmail)}&limit=1`,
      { headers: serviceHeaders },
    ) : [];
    const requesterVplanningUser = Array.isArray(requesterUsers) ? requesterUsers[0] || null : null;
    if (!requesterProfile || !canProvisionAccounts(requesterProfile, requesterVplanningUser)) {
      res.status(403).json({ ok: false, code: 'TRAINING_OPERATIONS_ACCOUNT_PERMISSION_DENIED', error: 'Chỉ Quản lý vận hành hoặc quản trị viên VWork được tạo tài khoản ekip.' });
      return;
    }

    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    provisionedEmail = email;
    const fullName = String(body.fullName || '').trim();
    const password = String(body.password || '');
    const accountRole = String(body.role || '').trim().toLowerCase();
    const roleConfig = ACCOUNT_ROLES[accountRole];
    if (!/^\S+@\S+\.\S+$/.test(email) || fullName.length < 2 || !roleConfig) {
      res.status(400).json({ ok: false, code: 'TRAINING_OPERATIONS_ACCOUNT_INVALID', error: 'Họ tên, email hợp lệ và vai trò ekip là bắt buộc.' });
      return;
    }
    if (password.length < 8 || password.length > 128) {
      res.status(400).json({ ok: false, code: 'TRAINING_OPERATIONS_PASSWORD_INVALID', error: 'Mật khẩu tạm phải có từ 8 đến 128 ký tự.' });
      return;
    }

    const [profiles, users] = await Promise.all([
      requestJson(`${restUrl}/vcontent_profiles?select=id,email,full_name,role,title,vplanning_roles,active,access_scope,auth_user_id&email=eq.${encodeURIComponent(email)}&limit=1`, { headers: serviceHeaders }),
      requestJson(`${restUrl}/vplanning_users?select=email,full_name,title,roles,departments,owner_ids,payload&email=eq.${encodeURIComponent(email)}&limit=1`, { headers: serviceHeaders }),
    ]);
    previousProfile = Array.isArray(profiles) ? profiles[0] || null : null;
    previousVplanningUser = Array.isArray(users) ? users[0] || null : null;

    const created = await requestJson(`${config.supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { product: 'vwork', module: 'training_operations', role: accountRole },
      }),
    });
    createdAuthUserId = String(created?.id || created?.user?.id || '');
    if (!createdAuthUserId) throw new Error('Supabase Auth did not return a user id.');

    const vplanningRoles = [...new Set([...(previousProfile?.vplanning_roles || []), roleConfig.vplanningRole])];
    const profilePayload = {
      email,
      full_name: fullName,
      auth_user_id: createdAuthUserId,
      active: true,
      vplanning_roles: vplanningRoles,
      ...(previousProfile ? {} : { id: `VWOPS_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, role: roleConfig.profileRole, title: roleConfig.title, access_scope: 'self' }),
    };
    if (previousProfile?.id) {
      await requestJson(`${restUrl}/vcontent_profiles?id=eq.${encodeURIComponent(previousProfile.id)}`, {
        method: 'PATCH', headers: { ...serviceHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(profilePayload),
      });
    } else {
      profileWasCreated = true;
      await requestJson(`${restUrl}/vcontent_profiles`, {
        method: 'POST', headers: { ...serviceHeaders, Prefer: 'return=minimal' }, body: JSON.stringify(profilePayload),
      });
    }

    vplanningUserWasCreated = !previousVplanningUser;
    await requestJson(`${restUrl}/vplanning_users?on_conflict=email`, {
      method: 'POST',
      headers: { ...serviceHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        email,
        full_name: fullName,
        title: roleConfig.title,
        roles: [...new Set([...(previousVplanningUser?.roles || []), roleConfig.vplanningRole])],
        departments: previousVplanningUser?.departments || ['VTraining'],
        owner_ids: previousVplanningUser?.owner_ids || [],
        payload: { ...(previousVplanningUser?.payload || {}), source: 'vwork_training_operations', authUserId: createdAuthUserId },
      }),
    });

    res.status(201).json({ ok: true, user: { id: email, authUserId: createdAuthUserId, email, name: fullName, role: accountRole } });
  } catch (error) {
    if (createdAuthUserId) {
      const restUrl = `${config.supabaseUrl}/rest/v1`;
      const serviceHeaders = buildHeaders(config.serviceRoleKey, `Bearer ${config.serviceRoleKey}`);
      try {
        if (profileWasCreated) {
          await requestJson(`${restUrl}/vcontent_profiles?auth_user_id=eq.${encodeURIComponent(createdAuthUserId)}`, { method: 'DELETE', headers: serviceHeaders });
        } else if (previousProfile) {
          await restoreRow(restUrl, serviceHeaders, 'vcontent_profiles', 'id', previousProfile);
        }
        if (vplanningUserWasCreated) {
          if (provisionedEmail) await requestJson(`${restUrl}/vplanning_users?email=eq.${encodeURIComponent(provisionedEmail)}`, { method: 'DELETE', headers: serviceHeaders });
        } else if (previousVplanningUser) {
          await restoreRow(restUrl, serviceHeaders, 'vplanning_users', 'email', previousVplanningUser);
        }
        await requestJson(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(createdAuthUserId)}`, { method: 'DELETE', headers: serviceHeaders });
      } catch {
        // Preserve the original provisioning error; reconciliation is reported below.
      }
    }
    const message = String(error?.message || error);
    const exists = /already.*registered|user already|already exists/i.test(message);
    res.status(exists ? 409 : Number(error?.status || 500)).json({
      ok: false,
      code: exists ? 'TRAINING_OPERATIONS_ACCOUNT_EXISTS' : 'TRAINING_OPERATIONS_ACCOUNT_CREATE_FAILED',
      error: exists ? 'Email đã có tài khoản đăng nhập.' : message,
      rollbackAttempted: Boolean(createdAuthUserId),
    });
  }
}

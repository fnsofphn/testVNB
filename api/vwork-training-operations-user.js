import { createLimitedBufferReader, parseByteLimit } from './_body-limit.js';
import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';
import { resolveActiveTrainingRole, resolveTrainingRoles } from '../src/modules/vplanning/trainingOperations/roles.js';

const MAX_BODY_BYTES = parseByteLimit(process.env.VWORK_TRAINING_OPERATIONS_USER_BODY_LIMIT, 64 * 1024);
const readLimitedBuffer = createLimitedBufferReader({ maxBytes: MAX_BODY_BYTES });
const ACCOUNT_ROLES = {
  operations: { profileRole: 'production_manager', profileVplanningRole: 'vplanning_director', directoryRole: 'vplanning_director', title: 'Quản lý vận hành' },
  intake: { profileRole: 'client', profileVplanningRole: 'vplanning_intake', directoryRole: 'account_manager', title: 'Đầu mối / Sale' },
  content: { profileRole: 'specialist', profileVplanningRole: 'vplanning_content', directoryRole: 'content_manager', title: 'Chuyên viên nội dung' },
  vtraining: { profileRole: 'specialist', profileVplanningRole: 'vplanning_vtraining', directoryRole: 'vtraining', title: 'Chuyên viên vận hành VTraining' },
  manager: { profileRole: 'ctv', profileVplanningRole: 'vplanning_manager', directoryRole: 'vplanning_manager', title: 'Quản lý ekip' },
  member: { profileRole: 'ctv', profileVplanningRole: 'vplanning_member', directoryRole: 'vplanning_member', title: 'Thành viên ekip' },
};
const ACCOUNT_ROLE_VALUES = Object.freeze(Object.keys(ACCOUNT_ROLES));
const MANAGED_ROLE_TOKENS = new Set([
  'admin', 'training_ops_admin', 'vplanning_admin', 'training_admin', 'production_manager', 'pm',
  'sale', 'dau_moi', 'chuyen_vien_noi_dung', 'noi_dung', 'training_instructor', 'van_hanh_vtraining',
  'manager', 'teamlead', 'quan_ly_ekip', 'member', 'cong_tac_vien', 'vplanning_collaborator',
  ...Object.values(ACCOUNT_ROLES).flatMap((item) => [item.profileRole, item.profileVplanningRole, item.directoryRole]).filter(Boolean),
]);

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

function isAuthUserBanned(user, now = Date.now()) {
  const bannedUntil = Date.parse(String(user?.banned_until || ''));
  return Number.isFinite(bannedUntil) && bannedUntil > now;
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

function isManagedRoleToken(value) {
  const token = normalizeRole(value);
  return [...MANAGED_ROLE_TOKENS].some((managed) => token === managed || token.includes(managed));
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

async function getAuthUserById(supabaseUrl, serviceHeaders, userId) {
  if (!userId) return null;
  try {
    const result = await requestJson(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: serviceHeaders });
    return result?.user || result || null;
  } catch (error) {
    if (error?.status === 404) return null;
    throw error;
  }
}

async function findAuthUserByEmail(supabaseUrl, serviceHeaders, email) {
  const perPage = 1000;
  for (let page = 1; page <= 100; page += 1) {
    const result = await requestJson(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=${perPage}`, { headers: serviceHeaders });
    const users = Array.isArray(result?.users) ? result.users : [];
    const match = users.find((user) => normalizeEmail(user?.email) === email);
    if (match) return match;
    if (users.length < perPage || (Number(result?.last_page) > 0 && page >= Number(result.last_page))) return null;
  }
  return null;
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
  let authUserId = '';
  let provisionedEmail = '';
  let previousProfile = null;
  let previousVplanningUser = null;
  let profileWasCreated = false;
  let vplanningUserWasCreated = false;
  let databaseWasMutated = false;
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
    const availableRoles = resolveTrainingRoles(requesterProfile, requesterVplanningUser);
    const activeRole = resolveActiveTrainingRole(req.headers['x-vwork-role'], availableRoles);
    if (!requesterProfile || activeRole !== 'operations' || !canProvisionAccounts(requesterProfile, requesterVplanningUser)) {
      res.status(403).json({ ok: false, code: 'TRAINING_OPERATIONS_ACCOUNT_PERMISSION_DENIED', error: 'Chỉ Quản lý vận hành hoặc quản trị viên VWork được tạo tài khoản ekip.' });
      return;
    }

    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    provisionedEmail = email;
    const fullName = String(body.fullName || '').trim();
    const password = String(body.password || '');
    const replaceRoles = body.replaceRoles === true;
    const restoreLoginAccess = body.restoreLoginAccess === true;
    const requestedRoles = (Array.isArray(body.roles) ? body.roles : [body.role])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value, index, values) => value && values.indexOf(value) === index);
    const invalidRoles = requestedRoles.filter((value) => !ACCOUNT_ROLE_VALUES.includes(value));
    const primaryRole = requestedRoles[0];
    const primaryRoleConfig = ACCOUNT_ROLES[primaryRole];
    if (!/^\S+@\S+\.\S+$/.test(email) || fullName.length < 2 || !primaryRoleConfig || invalidRoles.length) {
      res.status(400).json({ ok: false, code: 'TRAINING_OPERATIONS_ACCOUNT_INVALID', error: 'Họ tên, email hợp lệ và ít nhất một vai trò VWork hợp lệ là bắt buộc.' });
      return;
    }
    const [profiles, users] = await Promise.all([
      requestJson(`${restUrl}/vcontent_profiles?select=id,email,full_name,role,title,vplanning_roles,active,access_scope,auth_user_id&email=eq.${encodeURIComponent(email)}&limit=1`, { headers: serviceHeaders }),
      requestJson(`${restUrl}/vplanning_users?select=email,full_name,title,roles,departments,owner_ids,payload&email=eq.${encodeURIComponent(email)}&limit=1`, { headers: serviceHeaders }),
    ]);
    previousProfile = Array.isArray(profiles) ? profiles[0] || null : null;
    previousVplanningUser = Array.isArray(users) ? users[0] || null : null;
    if (replaceRoles && !previousProfile && !previousVplanningUser) {
      res.status(404).json({ ok: false, code: 'TRAINING_OPERATIONS_ACCOUNT_NOT_FOUND', error: 'Không tìm thấy tài khoản VWork cần chỉnh.' });
      return;
    }
    if (replaceRoles && requesterEmail === email && !requestedRoles.includes('operations')) {
      res.status(400).json({ ok: false, code: 'TRAINING_OPERATIONS_SELF_ROLE_DOWNGRADE_DENIED', error: 'Bạn không thể tự gỡ vai trò Quản lý vận hành của chính mình.' });
      return;
    }

    const knownAuthUserId = String(previousProfile?.auth_user_id || previousVplanningUser?.payload?.authUserId || '');
    let authUser = await getAuthUserById(config.supabaseUrl, serviceHeaders, knownAuthUserId);
    if (authUser && normalizeEmail(authUser.email) !== email) authUser = null;
    if (!authUser) {
      try {
        const created = await requestJson(`${config.supabaseUrl}/auth/v1/admin/users`, {
          method: 'POST',
          headers: serviceHeaders,
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
            app_metadata: { product: 'vwork', module: 'training_operations', roles: requestedRoles },
          }),
        });
        authUser = created?.user || created || null;
        createdAuthUserId = String(authUser?.id || '');
      } catch (error) {
        const exists = /already.*registered|user already|already exists/i.test(String(error?.message || error));
        if (!exists) throw error;
        authUser = await findAuthUserByEmail(config.supabaseUrl, serviceHeaders, email);
        if (!authUser) throw error;
      }
    }
    authUserId = String(authUser?.id || '');
    if (!authUserId) throw new Error('Supabase Auth did not return a user id.');

    const selectedRoleConfigs = requestedRoles.map((value) => ACCOUNT_ROLES[value]);
    const profileVplanningRoles = selectedRoleConfigs.map((configItem) => configItem.profileVplanningRole).filter(Boolean);
    const directoryRoles = selectedRoleConfigs.map((configItem) => configItem.directoryRole);
    const retainedProfileRoles = replaceRoles
      ? (previousProfile?.vplanning_roles || []).filter((value) => !isManagedRoleToken(value))
      : (previousProfile?.vplanning_roles || []);
    const retainedDirectoryRoles = replaceRoles
      ? (previousVplanningUser?.roles || []).filter((value) => !isManagedRoleToken(value))
      : (previousVplanningUser?.roles || []);
    const vplanningRoles = [...new Set([...retainedProfileRoles, ...profileVplanningRoles])];
    const profilePayload = {
      email,
      full_name: fullName,
      auth_user_id: authUserId,
      active: true,
      vplanning_roles: vplanningRoles,
      ...(replaceRoles ? { role: primaryRoleConfig.profileRole, title: primaryRoleConfig.title } : {}),
      ...(previousProfile ? {} : { id: `VWOPS_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`, role: primaryRoleConfig.profileRole, title: primaryRoleConfig.title, access_scope: 'self' }),
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
    databaseWasMutated = true;

    vplanningUserWasCreated = !previousVplanningUser;
    await requestJson(`${restUrl}/vplanning_users?on_conflict=email`, {
      method: 'POST',
      headers: { ...serviceHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        email,
        full_name: fullName,
        title: replaceRoles ? primaryRoleConfig.title : previousVplanningUser?.title || primaryRoleConfig.title,
        roles: [...new Set([...retainedDirectoryRoles, ...directoryRoles])],
        departments: previousVplanningUser?.departments || ['VTraining'],
        owner_ids: previousVplanningUser?.owner_ids || [],
        payload: { ...(previousVplanningUser?.payload || {}), source: 'vwork_training_operations', authUserId },
      }),
    });

    const loginAccessRestored = restoreLoginAccess && isAuthUserBanned(authUser);
    if (loginAccessRestored) {
      await requestJson(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
        method: 'PUT',
        headers: serviceHeaders,
        body: JSON.stringify({ ban_duration: 'none' }),
      });
    }

    res.status(createdAuthUserId ? 201 : 200).json({
      ok: true,
      user: { id: email, authUserId, email, name: fullName, role: primaryRole, roles: requestedRoles, authUserCreated: Boolean(createdAuthUserId), loginAccessRestored },
    });
  } catch (error) {
    if (databaseWasMutated || createdAuthUserId) {
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
        if (createdAuthUserId) await requestJson(`${config.supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(createdAuthUserId)}`, { method: 'DELETE', headers: serviceHeaders });
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

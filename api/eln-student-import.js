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
    const message = typeof data === 'string' ? data : data?.msg || data?.message || data?.error || JSON.stringify(data);
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

function sanitizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toAvatarInitials(fullName) {
  return String(fullName || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function isAlreadyRegistered(error) {
  return /already.*registered|already exists|User already registered/i.test(String(error?.message || error || ''));
}

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

function canImportStudents(profile) {
  return new Set(['admin', 'training_ops_admin']).has(normalizeRole(profile?.role));
}

async function getRows(supabaseUrl, serviceRoleKey, table, select, filters = []) {
  const query = [`select=${encodeURIComponent(select)}`, ...filters].join('&');
  return requestJson(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
  });
}

async function findAuthUserByEmail(supabaseUrl, serviceRoleKey, email) {
  for (let page = 1; page <= 10; page += 1) {
    const payload = await requestJson(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=100`, {
      method: 'GET',
      headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
    });
    const users = Array.isArray(payload?.users) ? payload.users : Array.isArray(payload) ? payload : [];
    const match = users.find((user) => String(user.email || '').toLowerCase() === email);
    if (match) return match;
    if (users.length < 100) break;
  }
  return null;
}

async function ensureAuthUser(supabaseUrl, serviceRoleKey, email, password, fullName, knownAuthUserId) {
  if (knownAuthUserId) {
    const updated = await requestJson(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(knownAuthUserId)}`, {
      method: 'PUT',
      headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      body: JSON.stringify({
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName || email },
      }),
    });
    return updated?.id || updated?.user?.id || knownAuthUserId;
  }

  try {
    const created = await requestJson(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName || email },
      }),
    });
    return created?.id || created?.user?.id || null;
  } catch (error) {
    if (!isAlreadyRegistered(error)) throw error;
    const existing = await findAuthUserByEmail(supabaseUrl, serviceRoleKey, email);
    if (!existing?.id) throw new Error(`Email ${email} already exists in Auth, but its user id could not be resolved.`);
    return ensureAuthUser(supabaseUrl, serviceRoleKey, email, password, fullName, existing.id);
  }
}

async function upsertProfile(supabaseUrl, serviceRoleKey, row, authUserId, classRow) {
  const existingProfiles = await getRows(
    supabaseUrl,
    serviceRoleKey,
    'vcontent_profiles',
    'id,email,auth_user_id',
    [`email=eq.${encodeURIComponent(row.email)}`],
  );
  const payload = {
    email: row.email,
    full_name: row.fullName,
    role: 'hoc_vien',
    title: row.position || null,
    avatar_initials: toAvatarInitials(row.fullName),
    active: true,
    access_scope: 'self',
    student_class: classRow?.code || classRow?.name || null,
    student_group: row.department || row.unit || null,
    student_code: row.employeeCode || null,
    auth_user_id: authUserId,
  };

  const existing = Array.isArray(existingProfiles) ? existingProfiles[0] : null;
  if (existing?.id) {
    await requestJson(`${supabaseUrl}/rest/v1/vcontent_profiles?id=eq.${encodeURIComponent(existing.id)}`, {
      method: 'PATCH',
      headers: {
        ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    return existing.id;
  }

  const profileId = `PROFILE_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  await requestJson(`${supabaseUrl}/rest/v1/vcontent_profiles`, {
    method: 'POST',
    headers: {
      ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ id: profileId, ...payload }),
  });
  return profileId;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'eln-student-import', ...RATE_LIMITS.import })) return;

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
    const requesterProfiles = await getRows(
      supabaseUrl,
      serviceRoleKey,
      'vcontent_profiles',
      'id,role,active,auth_user_id',
      [`auth_user_id=eq.${encodeURIComponent(sessionUser.id)}`, 'active=is.true'],
    );
    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    if (!requesterProfile || !canImportStudents(requesterProfile)) {
      sendJson(res, 403, { ok: false, error: 'Only admin or training manager accounts can import and provision students.' });
      return;
    }

    const body = await readJsonBody(req);
    const clientId = String(body.clientId || '').trim();
    const classId = String(body.classId || '').trim();
    const courseId = String(body.courseId || '').trim();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const now = new Date().toISOString();
    if (!clientId || !classId) {
      sendJson(res, 400, { ok: false, error: 'Client and class are required.' });
      return;
    }

    const classRows = await getRows(supabaseUrl, serviceRoleKey, 'vcontent_eln_classes', '*', [`id=eq.${encodeURIComponent(classId)}`]);
    const classRow = Array.isArray(classRows) ? classRows[0] : null;
    const results = [];
    const validRows = [];

    for (const row of rows) {
      const email = String(row.email || '').trim().toLowerCase();
      const password = String(row.password || '');
      const fullName = String(row.fullName || '').trim();
      const rowErrors = Array.isArray(row.errors) ? [...row.errors] : [];
      if (!password) rowErrors.push('Thieu mat khau');
      else if (password.length < 6) rowErrors.push('Mật khẩu tối thiểu 6 ký tự');
      if (rowErrors.length) {
        results.push({ rowNumber: row.rowNumber, email, ok: false, errors: rowErrors });
        continue;
      }

      try {
        const existingProfiles = await getRows(
          supabaseUrl,
          serviceRoleKey,
          'vcontent_profiles',
          'id,email,auth_user_id',
          [`email=eq.${encodeURIComponent(email)}`],
        );
        const existingProfile = Array.isArray(existingProfiles) ? existingProfiles[0] : null;
        const authUserId = await ensureAuthUser(supabaseUrl, serviceRoleKey, email, password, fullName, existingProfile?.auth_user_id || '');
        const profileId = await upsertProfile(supabaseUrl, serviceRoleKey, { ...row, email, fullName }, authUserId, classRow);
        validRows.push({ ...row, email, fullName, authUserId, profileId });
        results.push({ rowNumber: row.rowNumber, email, ok: true, authUserId, profileId });
      } catch (error) {
        results.push({ rowNumber: row.rowNumber, email, ok: false, errors: [String(error.message || error)] });
      }
    }

    const studentRows = validRows.map((row) => ({
      id: sanitizeId(`${clientId}-${row.email}`) || `student-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      client_id: clientId,
      user_id: row.authUserId,
      profile_id: row.profileId,
      employee_code: row.employeeCode || '',
      full_name: row.fullName,
      email: row.email,
      phone: row.phone || '',
      department: row.department || '',
      position: row.position || '',
      unit: row.unit || '',
      status: 'active',
      updated_at: now,
    }));

    if (studentRows.length) {
      await requestJson(`${supabaseUrl}/rest/v1/vcontent_eln_students?on_conflict=client_id,email`, {
        method: 'POST',
        headers: {
          ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
          Prefer: 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(studentRows),
      });
      const emailFilter = validRows.map((row) => `"${row.email}"`).join(',');
      const students = await getRows(
        supabaseUrl,
        serviceRoleKey,
        'vcontent_eln_students',
        '*',
        [`client_id=eq.${encodeURIComponent(clientId)}`, `email=in.(${emailFilter})`],
      );
      const authByEmail = new Map(validRows.map((row) => [row.email, row.authUserId]));
      const profileByEmail = new Map(validRows.map((row) => [row.email, row.profileId]));
      const classStudents = (Array.isArray(students) ? students : []).map((student) => ({
        class_id: classId,
        student_id: student.id,
        source_module: 'manual',
        source_id: String(body.fileName || ''),
        status: 'active',
        metadata: {
          sourceModule: 'manual',
          importedBy: body.importedBy ? String(body.importedBy) : null,
        },
        updated_at: now,
      }));
      if (classStudents.length) {
        await requestJson(`${supabaseUrl}/rest/v1/vcontent_eln_class_students?on_conflict=class_id,student_id`, {
          method: 'POST',
          headers: {
            ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(classStudents),
        });
      }
      const enrollments = courseId ? (Array.isArray(students) ? students : []).map((student) => ({
        class_id: classId,
        course_id: courseId,
        student_id: student.id,
        user_id: authByEmail.get(String(student.email || '').toLowerCase()) || student.user_id || null,
        profile_id: profileByEmail.get(String(student.email || '').toLowerCase()) || student.profile_id || null,
        invite_status: 'created',
        learning_status: 'not_started',
        updated_at: now,
      })) : [];
      if (enrollments.length) {
        await requestJson(`${supabaseUrl}/rest/v1/vcontent_eln_enrollments?on_conflict=class_id,student_id`, {
          method: 'POST',
          headers: {
            ...buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
            Prefer: 'resolution=merge-duplicates,return=representation',
          },
          body: JSON.stringify(enrollments),
        });
      }
    }

    const failed = results.filter((result) => !result.ok);
    await requestJson(`${supabaseUrl}/rest/v1/vcontent_eln_import_batches`, {
      method: 'POST',
      headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      body: JSON.stringify({
        class_id: classId,
        file_name: String(body.fileName || ''),
        total_rows: rows.length,
        success_rows: validRows.length,
        error_rows: failed.length,
        updated_rows: rows.filter((row) => row.action === 'update').length,
        skipped_rows: 0,
        imported_by: body.importedBy ? String(body.importedBy) : null,
        errors: failed.map((result) => ({ row: result.rowNumber, email: result.email, errors: result.errors || [] })),
      }),
    });

    sendJson(res, failed.length ? 207 : 200, {
      ok: failed.length === 0,
      imported: validRows.length,
      errors: failed.length,
      results,
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

const TABLE_ASSIGNMENTS = 'vcontent_vcoaching_assignments';
const TABLE_PREWORK = 'vcontent_vcoaching_prework_submissions';
const TABLE_REVIEWS = 'vcontent_vcoaching_reviews';
const TABLE_ACTION_PLANS = 'vcontent_vcoaching_action_plans';
const TABLE_MATERIAL_READS = 'vcontent_vcoaching_material_reads';
const READ_ROLES = new Set(['admin', 'content_manager', 'production_manager', 'pm', 'coaching_admin', 'coach', 'coachee', 'observer']);
const WRITE_ROLES = new Set(['admin', 'content_manager', 'production_manager', 'pm', 'coaching_admin', 'coach']);
const COACHEE_WRITE_ROLES = new Set(['admin', 'content_manager', 'production_manager', 'pm', 'coaching_admin', 'coach', 'coachee']);

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

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

function mapAssignment(row) {
  return {
    id: String(row.id),
    coacheeProfileId: String(row.coachee_profile_id || ''),
    coacheeName: String(row.coachee_name || ''),
    coacheeEmail: String(row.coachee_email || ''),
    coachProfileId: String(row.coach_profile_id || ''),
    coachName: String(row.coach_name || ''),
    sessionLabel: String(row.session_label || ''),
    groupName: String(row.group_name || ''),
    status: String(row.status || 'active'),
  };
}

function mapPrework(row) {
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id || ''),
    status: String(row.status || 'draft'),
    situation: String(row.situation || ''),
    expectation: String(row.expectation || ''),
    blockers: String(row.blockers || ''),
    submittedAt: row.submitted_at || null,
  };
}

function mapReview(row) {
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id || ''),
    status: String(row.status || 'pending'),
    coachComment: String(row.coach_comment || ''),
    reviewedAt: row.reviewed_at || null,
  };
}

function mapActionPlan(row) {
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id || ''),
    status: String(row.status || 'draft'),
    objective: String(row.objective || ''),
    actions: String(row.actions || ''),
    dueDate: String(row.due_date || ''),
    submittedAt: row.submitted_at || null,
  };
}

function mapMaterialRead(row) {
  return {
    assignmentId: String(row.assignment_id || ''),
    materialId: String(row.material_id || ''),
    readAt: row.read_at || null,
  };
}

function visibleAssignmentsQuery(profile, role) {
  if (['admin', 'content_manager', 'production_manager', 'pm', 'coaching_admin'].includes(role)) return {};
  if (role === 'coach') return { coach_profile_id: profile.id };
  if (role === 'coachee') return { coachee_profile_id: profile.id };
  return { coachee_profile_id: profile.id };
}

function applyEq(query, filters) {
  return Object.entries(filters).reduce((current, [key, value]) => current.eq(key, value), query);
}

async function loadState(admin, profile, role) {
  const filters = visibleAssignmentsQuery(profile, role);
  const assignmentsResult = await applyEq(
    admin.from(TABLE_ASSIGNMENTS).select('*').is('deleted_at', null).order('session_label').order('coachee_name'),
    filters,
  );
  if (assignmentsResult.error) throw assignmentsResult.error;
  const assignments = assignmentsResult.data || [];
  const assignmentIds = assignments.map((item) => item.id);
  const profilesResult = await admin
    .from('vcontent_profiles')
    .select('id,email,full_name,role')
    .eq('active', true)
    .in('role', ['coach', 'coaching_admin', 'coachee'])
    .order('full_name');
  if (profilesResult.error) throw profilesResult.error;
  const profiles = (profilesResult.data || []).map((item) => ({
    id: String(item.id),
    email: String(item.email || ''),
    fullName: String(item.full_name || item.email || ''),
    role: String(item.role || ''),
  }));
  if (!assignmentIds.length) {
    return { assignments: [], materialReads: [], preworks: [], reviews: [], actionPlans: [], profiles };
  }

  const [reads, preworks, reviews, actionPlans] = await Promise.all([
    admin.from(TABLE_MATERIAL_READS).select('*').in('assignment_id', assignmentIds),
    admin.from(TABLE_PREWORK).select('*').in('assignment_id', assignmentIds).is('deleted_at', null),
    admin.from(TABLE_REVIEWS).select('*').in('assignment_id', assignmentIds).is('deleted_at', null),
    admin.from(TABLE_ACTION_PLANS).select('*').in('assignment_id', assignmentIds).is('deleted_at', null),
  ]);
  for (const result of [reads, preworks, reviews, actionPlans]) {
    if (result.error) throw result.error;
  }
  return {
    assignments: assignments.map(mapAssignment),
    materialReads: (reads.data || []).map(mapMaterialRead),
    preworks: (preworks.data || []).map(mapPrework),
    reviews: (reviews.data || []).map(mapReview),
    actionPlans: (actionPlans.data || []).map(mapActionPlan),
    profiles,
  };
}

async function ensureCanAccessAssignment(admin, assignmentId, profile, role, options = {}) {
  const result = await admin.from(TABLE_ASSIGNMENTS).select('*').eq('id', assignmentId).is('deleted_at', null).maybeSingle();
  if (result.error) throw result.error;
  const assignment = result.data;
  if (!assignment) {
    const error = new Error('Assignment not found.');
    error.status = 404;
    throw error;
  }
  const isManager = ['admin', 'content_manager', 'production_manager', 'pm', 'coaching_admin'].includes(role);
  const isCoach = role === 'coach' && assignment.coach_profile_id === profile.id;
  const isCoachee = role === 'coachee' && assignment.coachee_profile_id === profile.id;
  if (!isManager && !isCoach && !(options.allowCoachee && isCoachee)) {
    const error = new Error('No permission for this VCoaching assignment.');
    error.status = 403;
    throw error;
  }
  return assignment;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'vcoaching-state', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'VCoaching state API is not configured.' });
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
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const profiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active,full_name,email,auth_user_id&auth_user_id=${encodeURIComponent(`eq.${sessionUser.id}`)}&active=is.true&limit=1`,
      { method: 'GET', headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`) },
    );
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    const role = normalizeRole(profile?.role);
    if (!profile || !READ_ROLES.has(role)) {
      sendJson(res, 403, { ok: false, error: 'No permission for VCoaching.' });
      return;
    }

    const body = await readJsonBody(req);

    if (body.action === 'load_state') {
      sendJson(res, 200, { ok: true, state: await loadState(admin, profile, role) });
      return;
    }

    if (body.action === 'save_assignment') {
      if (!WRITE_ROLES.has(role)) {
        sendJson(res, 403, { ok: false, error: 'No permission to assign coaching sessions.' });
        return;
      }
      const row = {
        coachee_profile_id: String(body.coacheeProfileId || '').trim(),
        coachee_name: String(body.coacheeName || '').trim(),
        coachee_email: String(body.coacheeEmail || '').trim(),
        coach_profile_id: String(body.coachProfileId || profile.id).trim(),
        coach_name: String(body.coachName || profile.full_name || profile.email || '').trim(),
        session_label: String(body.sessionLabel || '').trim(),
        group_name: String(body.groupName || '').trim(),
        status: String(body.status || 'active'),
        updated_by_profile_id: profile.id,
        updated_by_name: profile.full_name || profile.email || 'Vinabrain user',
        updated_at: new Date().toISOString(),
      };
      if (!row.coachee_profile_id || !row.coachee_name || !row.session_label || !row.group_name) {
        sendJson(res, 400, { ok: false, error: 'Missing assignment payload.' });
        return;
      }
      const upsert = await admin
        .from(TABLE_ASSIGNMENTS)
        .upsert(row, { onConflict: 'coachee_profile_id,session_label' })
        .select('*')
        .single();
      if (upsert.error) throw upsert.error;
      sendJson(res, 200, { ok: true, assignment: mapAssignment(upsert.data), state: await loadState(admin, profile, role) });
      return;
    }

    if (body.action === 'save_prework') {
      if (!COACHEE_WRITE_ROLES.has(role)) {
        sendJson(res, 403, { ok: false, error: 'No permission to submit pre-work.' });
        return;
      }
      const assignmentId = String(body.assignmentId || '').trim();
      await ensureCanAccessAssignment(admin, assignmentId, profile, role, { allowCoachee: true });
      const status = body.submit ? 'submitted' : 'draft';
      const upsert = await admin
        .from(TABLE_PREWORK)
        .upsert(
          {
            assignment_id: assignmentId,
            status,
            situation: String(body.situation || ''),
            expectation: String(body.expectation || ''),
            blockers: String(body.blockers || ''),
            submitted_at: status === 'submitted' ? new Date().toISOString() : null,
            updated_by_profile_id: profile.id,
            updated_by_name: profile.full_name || profile.email || 'Vinabrain user',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'assignment_id' },
        )
        .select('*')
        .single();
      if (upsert.error) throw upsert.error;
      sendJson(res, 200, { ok: true, prework: mapPrework(upsert.data), state: await loadState(admin, profile, role) });
      return;
    }

    if (body.action === 'save_review') {
      if (!WRITE_ROLES.has(role)) {
        sendJson(res, 403, { ok: false, error: 'No permission to review pre-work.' });
        return;
      }
      const assignmentId = String(body.assignmentId || '').trim();
      await ensureCanAccessAssignment(admin, assignmentId, profile, role);
      const upsert = await admin
        .from(TABLE_REVIEWS)
        .upsert(
          {
            assignment_id: assignmentId,
            status: String(body.status || 'pending'),
            coach_comment: String(body.coachComment || ''),
            reviewed_by_profile_id: profile.id,
            reviewed_by_name: profile.full_name || profile.email || 'Vinabrain user',
            reviewed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'assignment_id' },
        )
        .select('*')
        .single();
      if (upsert.error) throw upsert.error;
      sendJson(res, 200, { ok: true, review: mapReview(upsert.data), state: await loadState(admin, profile, role) });
      return;
    }

    if (body.action === 'save_action_plan') {
      if (!COACHEE_WRITE_ROLES.has(role)) {
        sendJson(res, 403, { ok: false, error: 'No permission to submit action plan.' });
        return;
      }
      const assignmentId = String(body.assignmentId || '').trim();
      await ensureCanAccessAssignment(admin, assignmentId, profile, role, { allowCoachee: true });
      const status = String(body.status || (body.submit ? 'submitted' : 'draft'));
      const upsert = await admin
        .from(TABLE_ACTION_PLANS)
        .upsert(
          {
            assignment_id: assignmentId,
            status,
            objective: String(body.objective || ''),
            actions: String(body.actions || ''),
            due_date: String(body.dueDate || '') || null,
            submitted_at: ['submitted', 'coach_feedback', 'approved'].includes(status) ? new Date().toISOString() : null,
            updated_by_profile_id: profile.id,
            updated_by_name: profile.full_name || profile.email || 'Vinabrain user',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'assignment_id' },
        )
        .select('*')
        .single();
      if (upsert.error) throw upsert.error;
      sendJson(res, 200, { ok: true, actionPlan: mapActionPlan(upsert.data), state: await loadState(admin, profile, role) });
      return;
    }

    if (body.action === 'mark_material_read') {
      const assignmentId = String(body.assignmentId || '').trim();
      await ensureCanAccessAssignment(admin, assignmentId, profile, role, { allowCoachee: true });
      const materialId = String(body.materialId || '').trim();
      if (!materialId) {
        sendJson(res, 400, { ok: false, error: 'Missing material id.' });
        return;
      }
      const upsert = await admin
        .from(TABLE_MATERIAL_READS)
        .upsert(
          {
            assignment_id: assignmentId,
            material_id: materialId,
            read_by_profile_id: profile.id,
            read_at: new Date().toISOString(),
          },
          { onConflict: 'assignment_id,material_id' },
        )
        .select('*')
        .single();
      if (upsert.error) throw upsert.error;
      sendJson(res, 200, { ok: true, materialRead: mapMaterialRead(upsert.data), state: await loadState(admin, profile, role) });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'Unsupported VCoaching action.' });
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: String(error.message || error) });
  }
}

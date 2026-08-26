import { createLimitedBufferReader, parseByteLimit } from './_body-limit.js';
import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';
import {
  TRAINING_OPERATIONS_STATE_ID,
  applyTrainingOperationsCommand,
  assertTrainingOperationsCommandRole,
  createInitialTrainingOperationsState,
  summarizeTrainingOperationsState,
} from '../src/modules/vplanning/trainingOperations/domain.js';
import {
  normalizeTrainingRole,
  resolveActiveTrainingRole,
  resolveTrainingRoles,
} from '../src/modules/vplanning/trainingOperations/roles.js';

const MAX_BODY_BYTES = parseByteLimit(process.env.VWORK_TRAINING_OPERATIONS_BODY_LIMIT, 1024 * 1024);
const readLimitedBuffer = createLimitedBufferReader({ maxBytes: MAX_BODY_BYTES });
const PEOPLEONE_EMAIL_DOMAINS = new Set(['peopleone.com', 'peopleone.com.vn', 'peopleone.vn']);

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
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.message || data?.msg || data?.error || JSON.stringify(data);
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function headers(apiKey, authorization) {
  return {
    apikey: apiKey,
    Authorization: authorization,
    'Content-Type': 'application/json',
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hasPeopleOneEmail(value) {
  return PEOPLEONE_EMAIL_DOMAINS.has(normalizeEmail(value).split('@')[1] || '');
}

async function findProfile(restUrl, serviceHeaders, sessionUser) {
  const select = 'id,email,full_name,role,title,vplanning_roles,vplanning_departments,vplanning_owner_ids,active,auth_user_id';
  const authUserId = String(sessionUser?.id || '').trim();
  const email = normalizeEmail(sessionUser?.email);
  const filters = [];
  if (authUserId) filters.push(`auth_user_id=${encodeURIComponent(`eq.${authUserId}`)}`);
  if (email) filters.push(`email=${encodeURIComponent(`eq.${email}`)}`);
  for (const filter of filters) {
    const rows = await requestJson(`${restUrl}/vcontent_profiles?select=${select}&${filter}&active=is.true&limit=5`, { headers: serviceHeaders });
    if (Array.isArray(rows) && rows.length) return rows[0];
  }
  return null;
}

async function findVPlanningUser(restUrl, serviceHeaders, email) {
  if (!email) return null;
  const rows = await requestJson(`${restUrl}/vplanning_users?select=email,full_name,title,roles,departments,owner_ids&email=${encodeURIComponent(`eq.${email}`)}&limit=1`, { headers: serviceHeaders });
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function authenticate(req, config) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    const error = new Error('Missing session token.');
    error.status = 401;
    throw error;
  }
  const sessionUser = await requestJson(`${config.supabaseUrl}/auth/v1/user`, {
    headers: headers(config.anonKey, `Bearer ${token}`),
  });
  const restUrl = `${config.supabaseUrl}/rest/v1`;
  const serviceHeaders = headers(config.serviceRoleKey, `Bearer ${config.serviceRoleKey}`);
  const profile = await findProfile(restUrl, serviceHeaders, sessionUser);
  const vplanningUser = await findVPlanningUser(restUrl, serviceHeaders, normalizeEmail(sessionUser?.email));
  const availableRoles = resolveTrainingRoles(profile, vplanningUser);
  const requestedRole = req.headers['x-vwork-role'];
  if (requestedRole && !availableRoles.includes(normalizeTrainingRole(requestedRole))) {
    const error = new Error('Tài khoản hiện tại không được cấp vai trò VWork đã chọn.');
    error.status = 403;
    error.code = 'TRAINING_OPERATIONS_ROLE_NOT_GRANTED';
    throw error;
  }
  const role = resolveActiveTrainingRole(requestedRole, availableRoles);
  if (!profile || !role || (!hasPeopleOneEmail(profile.email) && !vplanningUser && !availableRoles.includes('operations'))) {
    const error = new Error('Tài khoản hiện tại chưa được cấp quyền cho VWork Vận hành đào tạo.');
    error.status = 403;
    error.code = 'TRAINING_OPERATIONS_PERMISSION_DENIED';
    throw error;
  }
  return {
    role,
    availableRoles,
    actor: {
      id: profile.id || sessionUser.id,
      name: profile.full_name || vplanningUser?.full_name || sessionUser.email,
      email: normalizeEmail(profile.email || sessionUser.email),
      role,
    },
    restUrl,
    serviceHeaders,
  };
}

function redactInput(input) {
  return {
    ...input,
    versions: input.versions.map((version) => ({
      id: version.id,
      version: version.version,
      status: version.status,
      sourceDataCode: version.sourceDataCode,
      validation: version.validation,
      reason: version.reason,
      effectiveAt: version.effectiveAt,
      submittedBy: version.submittedBy,
      submittedAt: version.submittedAt,
      fileCount: version.files?.length || 0,
    })),
  };
}

function stateForRole(state, auth) {
  const output = structuredClone(state);
  const role = auth.role;
  const isAssigned = (item) => [auth.actor.id, auth.actor.email, auth.actor.name].includes(item.assigneeId)
    || [auth.actor.email, auth.actor.name].includes(item.assignee);
  if (['admin', 'operations'].includes(role)) return output;
  if (role === 'intake') {
    output.inputs = output.inputs.filter((item) => item.ownerRole === 'intake');
    output.tasks = output.tasks.filter(isAssigned);
    output.notifications = output.notifications.filter((item) => (item.recipients || []).some((value) => ['intake', auth.actor.id, auth.actor.email].includes(value)));
    output.auditEvents = output.auditEvents.filter((item) => item.actor?.id === auth.actor.id || ['PROJECT_CREATED', 'SCOPE_CHANGE_APPROVED'].includes(item.type));
    return output;
  }
  if (role === 'content') {
    output.inputs = output.inputs.filter((item) => item.ownerRole === 'content');
    output.tasks = output.tasks.filter(isAssigned);
    output.changeRequests = [];
    output.notifications = output.notifications.filter((item) => (item.recipients || []).some((value) => ['content', auth.actor.id, auth.actor.email].includes(value)));
    output.auditEvents = output.auditEvents.filter((item) => item.actor?.id === auth.actor.id || item.entityType === 'project');
    return output;
  }
  if (role === 'vtraining') {
    output.inputs = output.inputs.filter((item) => item.ownerRole === 'vtraining');
    output.tasks = output.tasks.filter((item) => ['material', 'roster'].includes(item.input) || isAssigned(item));
    output.changeRequests = [];
    return output;
  }
  output.inputs = output.inputs.map(redactInput);
  if (role === 'member') {
    output.tasks = output.tasks.filter(isAssigned);
    output.changeRequests = [];
  }
  return output;
}

async function loadState(auth) {
  const [rows, taskRows, auditRows] = await Promise.all([
    requestJson(`${auth.restUrl}/vwork_training_operations_state?id=eq.${encodeURIComponent(TRAINING_OPERATIONS_STATE_ID)}&select=id,active_project_id,payload,version,updated_at&limit=1`, { headers: auth.serviceHeaders }),
    requestJson(`${auth.restUrl}/vwork_training_operations_tasks?state_id=eq.${encodeURIComponent(TRAINING_OPERATIONS_STATE_ID)}&select=task_id,snapshot,row_version,archived_at&order=task_id.asc`, { headers: auth.serviceHeaders }),
    requestJson(`${auth.restUrl}/vwork_training_operations_audit_events?state_id=eq.${encodeURIComponent(TRAINING_OPERATIONS_STATE_ID)}&select=id,actor_id,actor_email,actor_name,actor_role,entity_type,entity_id,summary,details,happened_at,command_type&order=happened_at.asc`, { headers: auth.serviceHeaders }),
  ]);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (!row) return { state: createInitialTrainingOperationsState(), version: 0, updatedAt: null, storage: 'seed' };
  const tasks = (Array.isArray(taskRows) ? taskRows : []).map((item) => item.snapshot).filter(Boolean);
  const auditEvents = (Array.isArray(auditRows) ? auditRows : []).map((item) => ({
    id: item.id,
    type: item.command_type,
    actor: { id: item.actor_id, email: item.actor_email, name: item.actor_name, role: item.actor_role },
    entityType: item.entity_type,
    entityId: item.entity_id,
    summary: item.summary,
    details: item.details || {},
    happenedAt: item.happened_at,
  }));
  return {
    state: { ...(row.payload || {}), activeProjectId: row.active_project_id || row.payload?.activeProjectId || null, tasks, auditEvents },
    version: Number(row.version || 0), updatedAt: row.updated_at || null, storage: 'database',
  };
}

async function loadVWorkAccountDirectory(auth) {
  const [rows, profiles] = await Promise.all([
    requestJson(`${auth.restUrl}/vplanning_users?select=email,full_name,title,roles,departments,owner_ids,payload&order=full_name.asc`, { headers: auth.serviceHeaders }),
    requestJson(`${auth.restUrl}/vcontent_profiles?select=id,email,full_name,role,title,vplanning_roles,active`, { headers: auth.serviceHeaders }),
  ]);
  const profilesByEmail = new Map((Array.isArray(profiles) ? profiles : []).map((item) => [normalizeEmail(item.email), item]));
  return (Array.isArray(rows) ? rows : []).map((item) => {
    const email = normalizeEmail(item.email);
    const profile = profilesByEmail.get(email);
    const roles = resolveTrainingRoles(profile || { title: item.title }, item);
    const projectIds = Array.isArray(item.payload?.projectIds) ? item.payload.projectIds.map(String) : [];
    const classIds = Array.isArray(item.payload?.classIds) ? item.payload.classIds.map(String) : [];
    return {
      id: email,
      name: String(item.full_name || profile?.full_name || item.email || '').trim(),
      email,
      role: roles.includes('manager') ? 'manager' : roles.includes('member') ? 'member' : roles[0],
      roles,
      active: Boolean(profile) && profile.active !== false,
      profileLinked: Boolean(profile),
      assignable: Boolean(profile) && profile.active !== false && roles.length > 0,
      projectIds,
      classIds,
    };
  }).filter((item) => item?.id && item?.name);
}

async function loadTeamDirectory(auth) {
  const accounts = await loadVWorkAccountDirectory(auth);
  return accounts.filter((item) => item.active && item.roles.length);
}

function assignmentScopeAllows(person, task) {
  const projectAllowed = !person.projectIds?.length || person.projectIds.includes(String(task.projectId));
  const classAllowed = !person.classIds?.length || person.classIds.includes(String(task.classId)) || person.classIds.includes(String(task.classCode));
  return projectAllowed && classAllowed;
}

async function normalizeAssignmentCommand(auth, state, command) {
  if (String(command?.type || '').toUpperCase() !== 'ASSIGN_TASKS') return command;
  const directory = await loadTeamDirectory(auth);
  const payload = structuredClone(command.payload || {});
  const assignee = directory.find((item) => item.id === normalizeEmail(payload.assigneeId));
  const reviewer = directory.find((item) => item.id === normalizeEmail(payload.reviewerId));
  if (!assignee?.active) {
    const error = new Error('Người nhận không tồn tại hoặc tài khoản đã ngừng hoạt động.');
    error.status = 400;
    error.code = 'TRAINING_OPERATIONS_ASSIGNEE_INVALID';
    throw error;
  }
  if (!reviewer?.active || !reviewer.roles.some((role) => ['manager', 'operations'].includes(role))) {
    const error = new Error('Người xác nhận không hợp lệ trong danh mục VWork.');
    error.status = 400;
    error.code = 'TRAINING_OPERATIONS_REVIEWER_INVALID';
    throw error;
  }
  if (payload.requireSeparation && assignee.id === reviewer.id) {
    const error = new Error('Người thực hiện và người duyệt phải khác nhau.');
    error.status = 400;
    error.code = 'TRAINING_OPERATIONS_SEPARATION_REQUIRED';
    throw error;
  }
  const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds : [payload.taskId];
  const tasks = taskIds.map((taskId) => state.tasks.find((item) => item.id === taskId));
  if (tasks.some((item) => !item)) {
    const error = new Error('Có công việc không tồn tại trong phạm vi hiện tại.');
    error.status = 404;
    error.code = 'TRAINING_OPERATIONS_TASK_NOT_FOUND';
    throw error;
  }
  const assigningActor = directory.find((item) => item.id === normalizeEmail(auth.actor.email));
  if (tasks.some((task) => !assignmentScopeAllows(assignee, task) || !assignmentScopeAllows(reviewer, task) || (assigningActor && !assignmentScopeAllows(assigningActor, task)))) {
    const error = new Error('Người giao, người nhận hoặc người xác nhận nằm ngoài phạm vi dự án/lớp.');
    error.status = 403;
    error.code = 'TRAINING_OPERATIONS_ASSIGNMENT_SCOPE_DENIED';
    throw error;
  }
  payload.assigneeId = assignee.id;
  payload.assigneeName = assignee.name;
  payload.reviewerId = reviewer.id;
  payload.reviewerName = reviewer.name;
  return { ...command, payload };
}

async function loadCommandRequest(auth, requestId) {
  const rows = await requestJson(
    `${auth.restUrl}/vwork_training_operations_command_requests?request_id=eq.${encodeURIComponent(requestId)}&select=request_id,state_id,actor_id,result&limit=1`,
    { headers: auth.serviceHeaders },
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function saveState(auth, nextState, expectedVersion, requestId, commandType, newAuditEvents) {
  if (!Array.isArray(nextState.tasks) || nextState.tasks.length === 0) {
    const error = new Error('Payload công việc rỗng hoặc không hợp lệ; server từ chối lưu để tránh mất dữ liệu.');
    error.status = 400;
    error.code = 'TRAINING_OPERATIONS_EMPTY_TASK_PAYLOAD';
    throw error;
  }
  const payload = structuredClone(nextState);
  delete payload.tasks;
  delete payload.auditEvents;
  try {
    return await requestJson(`${auth.restUrl}/rpc/persist_vwork_training_operations_state`, {
      method: 'POST',
      headers: auth.serviceHeaders,
      body: JSON.stringify({
        p_state_id: TRAINING_OPERATIONS_STATE_ID,
        p_expected_version: expectedVersion,
        p_request_id: requestId,
        p_command_type: commandType,
        p_active_project_id: nextState.activeProjectId || null,
        p_payload: payload,
        p_tasks: nextState.tasks,
        p_audit_events: newAuditEvents,
        p_actor: auth.actor,
      }),
    });
  } catch (error) {
    if (String(error.message || '').includes('VWORK_VERSION_CONFLICT') || error.status === 409) {
      error.status = 409;
      error.code = 'TRAINING_OPERATIONS_VERSION_CONFLICT';
    } else if (String(error.message || '').includes('VWORK_')) {
      error.status = 400;
      error.code = 'TRAINING_OPERATIONS_DATA_LOSS_GUARD';
    }
    throw error;
  }
}

function sendError(res, error) {
  const status = error.code === 'TRAINING_OPERATIONS_PERMISSION_DENIED' ? 403 : Number(error.status || 500);
  res.status(status).json({
    ok: false,
    code: error.code || (error.status === 409 ? 'TRAINING_OPERATIONS_VERSION_CONFLICT' : 'TRAINING_OPERATIONS_ERROR'),
    error: String(error.message || error),
    details: error.details,
  });
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === 'production' && process.env.VWORK_TRAINING_OPERATIONS_ENABLED !== 'true') {
    res.status(404).json({ ok: false, code: 'TRAINING_OPERATIONS_DISABLED', error: 'VWork Training Operations is not enabled.' });
    return;
  }
  const limit = req.method === 'GET' ? { windowMs: 60_000, max: 120 } : RATE_LIMITS.mutation;
  if (!enforceRateLimit(req, res, { ...limit, route: 'vwork-training-operations' })) return;
  const config = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
  };
  if (!config.supabaseUrl || !config.serviceRoleKey || !config.anonKey) {
    res.status(500).json({ ok: false, code: 'TRAINING_OPERATIONS_CONFIG_MISSING', error: 'Supabase server config is missing.' });
    return;
  }
  try {
    const auth = await authenticate(req, config);
    const current = await loadState(auth);
    if (req.method === 'GET') {
      const canManageAccounts = ['operations', 'admin'].includes(auth.role);
      const canAssignTasks = canManageAccounts || auth.role === 'manager';
      const fullDirectory = canAssignTasks ? await loadVWorkAccountDirectory(auth) : [];
      const accountDirectory = canManageAccounts ? fullDirectory : [];
      const directory = canAssignTasks ? fullDirectory : [];
      res.status(200).json({ ok: true, role: auth.role, availableRoles: auth.availableRoles, actor: auth.actor, directory, accountDirectory, state: stateForRole(current.state, auth), version: current.version, updatedAt: current.updatedAt, storage: current.storage });
      return;
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      res.status(405).json({ ok: false, error: 'Method not allowed.' });
      return;
    }
    const body = await readJsonBody(req);
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      res.status(400).json({ ok: false, code: 'TRAINING_OPERATIONS_EXPECTED_VERSION_REQUIRED', error: 'expectedVersion là bắt buộc.' });
      return;
    }
    const requestId = String(body.requestId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      res.status(400).json({ ok: false, code: 'TRAINING_OPERATIONS_REQUEST_ID_REQUIRED', error: 'requestId UUID là bắt buộc để bảo đảm idempotency.' });
      return;
    }
    const replay = await loadCommandRequest(auth, requestId);
    if (replay) {
      if (replay.state_id !== TRAINING_OPERATIONS_STATE_ID || replay.actor_id !== auth.actor.id) {
        res.status(409).json({ ok: false, code: 'TRAINING_OPERATIONS_REQUEST_ID_CONFLICT', error: 'requestId đã được sử dụng bởi một lệnh khác.' });
        return;
      }
      res.status(200).json({
        ok: true,
        role: auth.role,
        availableRoles: auth.availableRoles,
        state: stateForRole(current.state, auth),
        version: Number(replay.result?.version ?? current.version),
        updatedAt: replay.result?.updatedAt || current.updatedAt,
        summary: summarizeTrainingOperationsState(current.state),
        audit: { persisted: Number(replay.result?.auditCount || 0) },
        idempotentReplay: true,
      });
      return;
    }
    if (expectedVersion !== current.version) {
      res.status(409).json({ ok: false, code: 'TRAINING_OPERATIONS_VERSION_CONFLICT', error: 'Dữ liệu đã thay đổi trên server. Hãy tải lại trước khi lưu.', version: current.version, updatedAt: current.updatedAt });
      return;
    }
    assertTrainingOperationsCommandRole(String(body.command?.type || '').toUpperCase(), auth.role);
    const command = await normalizeAssignmentCommand(auth, current.state, body.command);
    const previousAuditLength = current.state.auditEvents?.length || 0;
    const nextState = applyTrainingOperationsCommand(current.state, command, { role: auth.role, actor: auth.actor });
    const newAuditEvents = (nextState.auditEvents || []).slice(previousAuditLength);
    const saved = await saveState(auth, nextState, expectedVersion, requestId, String(command?.type || 'UNKNOWN'), newAuditEvents);
    res.status(200).json({
      ok: true,
      role: auth.role,
      availableRoles: auth.availableRoles,
      state: stateForRole(nextState, auth),
      version: Number(saved.version),
      updatedAt: saved.updatedAt || null,
      summary: summarizeTrainingOperationsState(nextState),
      audit: { persisted: Number(saved.auditCount || 0) },
      idempotentReplay: Boolean(saved.idempotentReplay),
    });
  } catch (error) {
    sendError(res, error);
  }
}

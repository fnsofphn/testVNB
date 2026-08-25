import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';
import {
  normalizeDeletedTaskIds,
  unexpectedMissingTaskIds,
} from '../src/modules/vplanning/stateSyncPolicy.js';

const STATE_ID = 'default';
const META_ENTITY = '__meta';
const RECORD_CHUNK_SIZE = 500;
const PEOPLEONE_EMAIL_DOMAINS = new Set(['peopleone.com', 'peopleone.com.vn', 'peopleone.vn']);
const VWORK_STATE_ROLES = new Set([
  'admin',
  'vplanning_admin',
  'vplanning_director',
  'vplanning_manager',
  'vplanning_member',
  'vplanning_collaborator',
  'vplanning_lecturer',
  'vplanning_controller',
]);

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

async function requestOptionalJson(url, options = {}) {
  try {
    return await requestJson(url, options);
  } catch (error) {
    if ([400, 404].includes(Number(error.status))) return [];
    throw error;
  }
}

function buildHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
}

function buildAuthHeaders(apiKey, authorization) {
  return {
    apikey: apiKey,
    Authorization: authorization,
    'Content-Type': 'application/json',
  };
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isPeopleOneEmail(value) {
  const domain = normalizeEmail(value).split('@')[1] || '';
  return PEOPLEONE_EMAIL_DOMAINS.has(domain);
}

function hasVWorkStateRole(profile) {
  const roles = [profile?.role, ...toArray(profile?.vplanning_roles)]
    .map((role) => String(role || '').trim())
    .filter(Boolean);
  return roles.some((role) => VWORK_STATE_ROLES.has(role));
}

async function isVPlanningUser(supabaseUrl, headers, email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return false;
  const users = await requestJson(
    `${supabaseUrl}/rest/v1/vplanning_users?select=email,roles&email=${encodeURIComponent(`eq.${normalizedEmail}`)}&limit=1`,
    { method: 'GET', headers },
  );
  return Array.isArray(users) && users.some((user) =>
    toArray(user.roles).some((role) => String(role || '').startsWith('vplanning_')),
  );
}

async function findActiveVWorkProfile(supabaseUrl, headers, sessionUser) {
  const select = 'id,email,full_name,role,vplanning_roles,active,auth_user_id';
  const queries = [];
  const authUserId = String(sessionUser?.id || '').trim();
  const email = normalizeEmail(sessionUser?.email);
  if (authUserId) queries.push(`auth_user_id=${encodeURIComponent(`eq.${authUserId}`)}`);
  if (email) queries.push(`email=${encodeURIComponent(`eq.${email}`)}`);

  for (const filter of queries) {
    const profiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=${select}&${filter}&active=is.true&limit=5`,
      { method: 'GET', headers },
    );
    for (const profile of toArray(profiles)) {
      if (isPeopleOneEmail(profile.email) || hasVWorkStateRole(profile) || await isVPlanningUser(supabaseUrl, headers, profile.email)) {
        return profile;
      }
    }
  }
  return null;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function recordIdFor(entityType, item, index) {
  const id = isPlainObject(item) ? item.id || item.code || item.key : '';
  return String(id || `${entityType}_${index + 1}`);
}

function decomposeState(payload) {
  const records = [];
  const meta = {};

  for (const [entityType, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        records.push({
          entity_type: entityType,
          record_id: recordIdFor(entityType, item, index),
          payload: item,
          sort_order: index,
        });
      });
    } else {
      meta[entityType] = value;
    }
  }

  records.push({
    entity_type: META_ENTITY,
    record_id: STATE_ID,
    payload: meta,
    sort_order: 0,
  });
  return records;
}

function assembleState(records) {
  const state = {};
  const grouped = new Map();

  for (const row of records) {
    if (row.entity_type === META_ENTITY) {
      Object.assign(state, row.payload || {});
      continue;
    }
    const list = grouped.get(row.entity_type) || [];
    list.push(row);
    grouped.set(row.entity_type, list);
  }

  for (const [entityType, rows] of grouped.entries()) {
    state[entityType] = rows
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0))
      .map((row) => row.payload);
  }

  return state;
}

function mergeRecordBackedState(normalizedState, recordState) {
  const merged = { ...(normalizedState || {}) };
  const normalizedOwnedKeys = new Set([
    'version',
    'module',
    'storage',
    'projects',
    'users',
    'jobs',
    'tasks',
    'acceptanceItems',
    'stageQuality',
    'notifications',
    'processTemplates',
    'escalationRules',
    'governanceEvents',
    'monthlyScorecards',
    'savedAt',
  ]);
  for (const [key, value] of Object.entries(recordState || {})) {
    if (normalizedOwnedKeys.has(key)) {
      const normalizedValue = merged[key];
      const hasNormalizedValue = Array.isArray(normalizedValue)
        ? normalizedValue.length > 0
        : normalizedValue !== undefined && normalizedValue !== null && normalizedValue !== '';
      if (hasNormalizedValue) continue;
    }
    merged[key] = value;
  }
  return merged;
}

function summarizeEntityCounts(payload) {
  const counts = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (Array.isArray(value)) counts[key] = value.length;
  }
  return counts;
}

function resolveActor(requesterProfile, sessionUser) {
  return {
    actor_id: requesterProfile?.id || sessionUser?.id || null,
    actor_name: requesterProfile?.full_name || requesterProfile?.email || sessionUser?.email || null,
  };
}

async function upsertRecordChunks(recordsBaseUrl, headers, records) {
  for (let index = 0; index < records.length; index += RECORD_CHUNK_SIZE) {
    const chunk = records.slice(index, index + RECORD_CHUNK_SIZE);
    await requestJson(`${recordsBaseUrl}?on_conflict=entity_type,record_id`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
  }
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function toStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\n|;]+/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function asDate(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function taskIdFor(task, index) {
  return String(task?.id || task?.workCode || task?.work_code || task?.code || `task_${index + 1}`);
}

function projectCodeFor(task) {
  return String(task?.projectCode || task?.project_code || task?.project || '').trim();
}

function projectRowsFromState(payload) {
  const byCode = new Map();
  toArray(payload?.projects).forEach((project) => {
    const code = String(project.code || project.projectCode || project.project_code || '').trim();
    if (!code) return;
    byCode.set(code, {
      project_code: code,
      name: String(project.name || project.title || code),
      customer: String(project.customer || project.client || ''),
      status: String(project.status || 'running'),
      start_date: asDate(project.startDate || project.start_date),
      end_date: asDate(project.endDate || project.end_date),
      class_count: Number(project.classCount || project.class_count || project.classes || 0) || null,
      learner_count: Number(project.learnerCount || project.learner_count || project.learners || 0) || null,
      payload: project,
    });
  });
  toArray(payload?.tasks).forEach((task) => {
    const code = projectCodeFor(task);
    if (!code || byCode.has(code)) return;
    byCode.set(code, {
      project_code: code,
      name: code,
      customer: String(task.customer || ''),
      status: 'running',
      start_date: null,
      end_date: null,
      class_count: null,
      learner_count: null,
      payload: { projectCode: code, customer: task.customer || '' },
    });
  });
  return [...byCode.values()];
}

function userRowsFromState(payload) {
  return toArray(payload?.users).map((user) => {
    const email = String(user.email || '').trim().toLowerCase();
    if (!email) return null;
    return {
      email,
      full_name: String(user.fullName || user.full_name || user.name || email),
      title: String(user.title || ''),
      roles: toStringArray(user.roles || user.vplanningRoles || user.vplanning_roles),
      departments: toStringArray(user.departments || user.vplanningDepartments || user.vplanning_departments),
      owner_ids: toStringArray(user.ownerIds || user.owner_ids || user.vplanningOwnerIds || user.vplanning_owner_ids),
      payload: user,
    };
  }).filter(Boolean);
}

function orgRowsFromState(payload) {
  return toArray(payload?.orgUnits || payload?.org || payload?.organization).map((unit, index) => {
    const code = String(unit.code || unit.id || `org_${index + 1}`).trim();
    return {
      unit_code: code,
      name: String(unit.name || code),
      people: toStringArray(unit.people || unit.members),
      payload: unit,
    };
  });
}

function jobRowsFromState(payload) {
  const byCode = new Map();
  toArray(payload?.jobs || payload?.jobSystem || payload?.job_system).forEach((job, index) => {
    const code = String(Array.isArray(job) ? job[0] : job.code || job.jobCode || job.job_code || '').trim();
    if (!code) return;
    byCode.set(code, {
      job_code: code,
      name: String(Array.isArray(job) ? job[1] : job.name || job.title || code),
      department: String(job.department || job.team || ''),
      standard_tasks: Array.isArray(job.tasks) ? job.tasks : [],
      okr: isPlainObject(job.okr) ? job.okr : {},
      payload: Array.isArray(job) ? { code, name: job[1] } : job,
      sort_order: index,
    });
  });
  toArray(payload?.tasks).forEach((task, index) => {
    const code = String(task.jobCode || task.job_code || '').trim();
    if (!code || byCode.has(code)) return;
    byCode.set(code, {
      job_code: code,
      name: code,
      department: String(task.group || task.groupName || task.group_name || ''),
      standard_tasks: [],
      okr: {},
      payload: { code, name: code },
      sort_order: 1000 + index,
    });
  });
  return [...byCode.values()];
}

function taskRowsFromState(payload) {
  return toArray(payload?.tasks).map((task, index) => ({
    task_id: taskIdFor(task, index),
    project_code: projectCodeFor(task) || null,
    work_code: String(task.workCode || task.work_code || ''),
    work_type: String(task.workType || task.work_type || ''),
    title: String(task.title || `Công việc ${index + 1}`),
    group_name: String(task.group || task.groupName || task.group_name || ''),
    owner_id: String(task.ownerId || task.owner_id || ''),
    owner_name: String(task.ownerName || task.owner_name || task.ownerLead || task.owner_lead || ''),
    job_code: String(task.jobCode || task.job_code || '') || null,
    stage: String(task.stage || 'assigned'),
    status: String(task.status || ''),
    priority: String(task.priority || ''),
    risk: String(task.risk || ''),
    traffic: String(task.traffic || ''),
    deadline: asDate(task.deadline),
    proposed_due: asDate(task.proposedDue || task.proposed_due),
    source_module: String(task.sourceModule || task.source_module || ''),
    source_id: String(task.sourceId || task.source_id || ''),
    source_url: String(task.sourceUrl || task.source_url || ''),
    deliverable_link: String(task.deliverableLink || task.deliverable_link || task.deliverable || ''),
    evidence_link: String(task.evidenceLink || task.evidence_link || ''),
    payload: task,
    sort_order: index,
  }));
}

function checklistRowsFromState(payload) {
  return toArray(payload?.tasks).flatMap((task, taskIndex) => {
    const taskId = taskIdFor(task, taskIndex);
    return toArray(task.checklist).map((item, itemIndex) => {
      const label = isPlainObject(item) ? item.label : item;
      return {
        task_id: taskId,
        item_index: itemIndex,
        label: String(label || `Checklist ${itemIndex + 1}`),
        done: Boolean(isPlainObject(item) ? item.done : false),
        added_by: String(isPlainObject(item) ? item.added_by || item.addedBy || '' : ''),
        payload: isPlainObject(item) ? item : { label },
      };
    });
  });
}

function reportRowsFromState(payload) {
  return toArray(payload?.tasks).flatMap((task, taskIndex) => {
    const taskId = taskIdFor(task, taskIndex);
    return toArray(task.reports).map((report, reportIndex) => ({
      task_id: taskId,
      report_index: reportIndex,
      by_name: String(report.by || report.byName || report.by_name || ''),
      report_date: String(report.date || report.reportDate || report.report_date || ''),
      note: String(report.note || ''),
      payload: report,
    }));
  });
}

function activityRowsFromState(payload) {
  return toArray(payload?.tasks).flatMap((task, taskIndex) => {
    const taskId = taskIdFor(task, taskIndex);
    return toArray(task.activity).map((event, activityIndex) => ({
      task_id: taskId,
      activity_index: activityIndex,
      action: String(event.action || ''),
      by_name: String(event.by || event.byName || event.by_name || ''),
      role_name: String(event.role || event.roleName || event.role_name || ''),
      note: String(event.note || ''),
      happened_at: event.at || event.happened_at || null,
      payload: event,
    }));
  });
}

function reminderRowsFromState(payload) {
  return toArray(payload?.tasks).flatMap((task, taskIndex) => {
    const taskId = taskIdFor(task, taskIndex);
    return toArray(task.reminders).map((reminder, reminderIndex) => ({
      task_id: taskId,
      reminder_index: reminderIndex,
      kind: String(reminder.kind || 'remind'),
      message: String(reminder.message || ''),
      from_name: String(reminder.from || reminder.fromName || reminder.from_name || ''),
      done: Boolean(reminder.done),
      payload: reminder,
    }));
  });
}

function groupBy(rows, key) {
  return toArray(rows).reduce((map, row) => {
    const value = String(row?.[key] || '');
    if (!value) return map;
    const list = map.get(value) || [];
    list.push(row);
    map.set(value, list);
    return map;
  }, new Map());
}

function taskRowsToState(taskRows, details = {}) {
  const checklistByTask = groupBy(details.checklist, 'task_id');
  const reportsByTask = groupBy(details.reports, 'task_id');
  const activityByTask = groupBy(details.activity, 'task_id');
  const remindersByTask = groupBy(details.reminders, 'task_id');
  return toArray(taskRows).map((row) => {
    const payload = isPlainObject(row.payload) ? row.payload : {};
    const taskId = String(row.task_id || payload.id || '');
    return {
      ...payload,
      id: payload.id ?? taskId,
      projectCode: row.project_code ?? payload.projectCode ?? payload.project_code ?? '',
      workCode: row.work_code ?? payload.workCode ?? payload.work_code ?? '',
      workType: row.work_type ?? payload.workType ?? payload.work_type ?? '',
      title: row.title ?? payload.title ?? '',
      group: row.group_name ?? payload.group ?? payload.groupName ?? '',
      ownerId: row.owner_id ?? payload.ownerId ?? payload.owner_id ?? '',
      ownerName: row.owner_name ?? payload.ownerName ?? payload.owner_name ?? payload.ownerLead ?? '',
      ownerLead: payload.ownerLead ?? row.owner_name ?? '',
      jobCode: row.job_code ?? payload.jobCode ?? payload.job_code ?? '',
      stage: row.stage ?? payload.stage ?? 'assigned',
      status: row.status ?? payload.status ?? '',
      priority: row.priority ?? payload.priority ?? '',
      risk: row.risk ?? payload.risk ?? '',
      traffic: row.traffic ?? payload.traffic ?? '',
      deadline: row.deadline ?? payload.deadline ?? '',
      proposedDue: row.proposed_due ?? payload.proposedDue ?? payload.proposed_due ?? '',
      sourceModule: row.source_module ?? payload.sourceModule ?? payload.source_module ?? 'vplanning',
      sourceId: row.source_id ?? payload.sourceId ?? payload.source_id ?? '',
      sourceUrl: row.source_url ?? payload.sourceUrl ?? payload.source_url ?? '',
      deliverableLink: row.deliverable_link ?? payload.deliverableLink ?? payload.deliverable_link ?? '',
      evidenceLink: row.evidence_link ?? payload.evidenceLink ?? payload.evidence_link ?? '',
      checklist: (checklistByTask.get(taskId) || []).map((item) => ({
        ...(isPlainObject(item.payload) ? item.payload : {}),
        label: item.label,
        done: Boolean(item.done),
        added_by: item.added_by || undefined,
      })),
      reports: (reportsByTask.get(taskId) || []).map((report) => ({
        ...(isPlainObject(report.payload) ? report.payload : {}),
        by: report.payload?.by ?? report.by_name ?? '',
        date: report.payload?.date ?? report.report_date ?? '',
        note: report.payload?.note ?? report.note ?? '',
      })),
      activity: (activityByTask.get(taskId) || []).map((event) => ({
        ...(isPlainObject(event.payload) ? event.payload : {}),
        action: event.payload?.action ?? event.action ?? '',
        by: event.payload?.by ?? event.by_name ?? '',
        role: event.payload?.role ?? event.role_name ?? '',
        note: event.payload?.note ?? event.note ?? '',
        at: event.payload?.at ?? event.happened_at ?? '',
      })),
      reminders: (remindersByTask.get(taskId) || []).map((reminder) => ({
        ...(isPlainObject(reminder.payload) ? reminder.payload : {}),
        kind: reminder.kind,
        message: reminder.message,
        from: reminder.payload?.from ?? reminder.from_name ?? '',
        done: Boolean(reminder.done),
      })),
    };
  });
}

async function loadNormalizedState(supabaseUrl, headers) {
  const restUrl = `${supabaseUrl}/rest/v1`;
  const [
    projects,
    users,
    jobs,
    tasks,
    checklist,
    reports,
    activity,
    reminders,
    acceptance,
    stageQuality,
    notifications,
    processTemplates,
    escalationRules,
    governanceEvents,
    monthlyScorecards,
  ] = await Promise.all([
    requestJson(`${restUrl}/vplanning_projects?select=*&order=project_code.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_users?select=*&order=email.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_job_system?select=*&order=sort_order.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_tasks?select=*&order=sort_order.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_task_checklist?select=*&order=task_id.asc,item_index.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_task_reports?select=*&order=task_id.asc,report_index.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_task_activity?select=*&order=task_id.asc,activity_index.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_task_reminders?select=*&order=task_id.asc,reminder_index.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_acceptance_items?select=*&order=project_code.asc,item_index.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_stage_quality?select=*&order=project_code.asc,stage_code.asc,item_index.asc`, { headers }),
    requestJson(`${restUrl}/vplanning_notifications?select=*&order=created_at.desc`, { headers }),
    requestOptionalJson(`${restUrl}/vplanning_process_templates?select=*&order=sort_order.asc`, { headers }),
    requestOptionalJson(`${restUrl}/vplanning_escalation_rules?select=*&order=sort_order.asc`, { headers }),
    requestOptionalJson(`${restUrl}/vplanning_governance_events?select=*&order=happened_at.desc`, { headers }),
    requestOptionalJson(`${restUrl}/vplanning_monthly_scorecards?select=*&order=month_key.desc,score.desc`, { headers }),
  ]);

  return {
    version: 2,
    module: 'vplanning',
    storage: 'normalized',
    projects: toArray(projects).map((project) => ({
      ...(isPlainObject(project.payload) ? project.payload : {}),
      code: project.project_code,
      projectCode: project.project_code,
      name: project.name,
      customer: project.customer,
      status: project.status,
      startDate: project.start_date,
      endDate: project.end_date,
      classCount: project.class_count,
      learnerCount: project.learner_count,
    })),
    users: toArray(users).map((user) => ({
      ...(isPlainObject(user.payload) ? user.payload : {}),
      name: user.full_name,
      fullName: user.full_name,
      email: user.email,
      title: user.title || '',
      roles: user.roles || [],
      departments: user.departments || [],
      ownerIds: user.owner_ids || [],
    })),
    jobs: toArray(jobs).map((job) => ({
      ...(isPlainObject(job.payload) ? job.payload : {}),
      code: job.job_code,
      jobCode: job.job_code,
      name: job.name,
      department: job.department || '',
      tasks: job.standard_tasks || [],
      okr: job.okr || {},
    })),
    tasks: taskRowsToState(tasks, { checklist, reports, activity, reminders }),
    acceptanceItems: toArray(acceptance).map((item) => ({
      ...(isPlainObject(item.payload) ? item.payload : {}),
      projectCode: item.project_code,
      itemIndex: item.item_index,
      item: item.item,
      ownerName: item.owner_name || '',
      timing: item.timing || '',
      done: Boolean(item.done),
    })),
    stageQuality: toArray(stageQuality).map((item) => ({
      ...(isPlainObject(item.payload) ? item.payload : {}),
      projectCode: item.project_code,
      stageCode: item.stage_code,
      itemIndex: item.item_index,
      item: item.item,
      done: Boolean(item.done),
    })),
    notifications: toArray(notifications).map((item) => ({
      ...(isPlainObject(item.payload) ? item.payload : {}),
      id: item.id,
      toEmail: item.to_email || '',
      title: item.title,
      body: item.body || '',
      kind: item.kind,
      read: Boolean(item.read),
      entityType: item.entity_type || '',
      entityId: item.entity_id || '',
      createdAt: item.created_at,
    })),
    processTemplates: toArray(processTemplates).map((item) => ({
      ...(isPlainObject(item.payload) ? item.payload : {}),
      code: item.template_code,
      groupCode: item.group_code,
      groupName: item.group_name,
      title: item.title,
      description: item.description || '',
      output: item.output,
      checkingPoint: item.checking_point || '',
      riskBlocked: item.risk_blocked || '',
      operationMapping: item.operation_mapping || '',
      servesOkrs: item.serves_okrs || [],
      raci: item.raci || {},
      checkpoints: item.checkpoints || [],
      hardGate: item.hard_gate || '',
      okrs: item.okrs || [],
    })),
    escalationRules: toArray(escalationRules).map((item) => ({
      ...(isPlainObject(item.payload) ? item.payload : {}),
      id: item.rule_id,
      level: item.level,
      trigger: item.trigger,
      slaHours: item.sla_hours,
      action: item.action,
    })),
    governanceEvents: toArray(governanceEvents).map((item) => ({
      ...(isPlainObject(item.payload) ? item.payload : {}),
      id: item.event_id,
      taskId: item.task_id,
      projectCode: item.project_code,
      action: item.action,
      actorName: item.actor_name,
      note: item.note,
      at: item.happened_at,
    })),
    monthlyScorecards: toArray(monthlyScorecards).map((item) => ({
      ...(isPlainObject(item.payload) ? item.payload : {}),
      id: item.scorecard_id,
      month: item.month_key,
      ownerId: item.owner_id,
      ownerName: item.owner_name,
      total: item.total_tasks,
      completed: item.completed_tasks,
      onTime: item.on_time_tasks,
      resultScore: item.result_score,
      score: item.score,
    })),
    savedAt: new Date().toISOString(),
  };
}

function acceptanceRowsFromState(payload) {
  const rows = [];
  toArray(payload?.acceptanceItems || payload?.acceptance || payload?.acceptance_items).forEach((item, index) => {
    const projectCode = String(item.projectCode || item.project_code || item.project || '').trim();
    if (!projectCode) return;
    rows.push({
      project_code: projectCode,
      item_index: Number(item.itemIndex || item.item_index || index) || index,
      item: String(item.item || item.label || item.title || `Acceptance ${index + 1}`),
      owner_name: String(item.ownerName || item.owner_name || item.owner || ''),
      timing: String(item.timing || item.deadline || ''),
      done: Boolean(item.done || item.completed),
      payload: item,
    });
  });
  return rows;
}

function stageQualityRowsFromState(payload) {
  const rows = [];
  toArray(payload?.stageQuality || payload?.stage_quality || payload?.qualityItems).forEach((item, index) => {
    const projectCode = String(item.projectCode || item.project_code || item.project || '').trim();
    if (!projectCode) return;
    rows.push({
      project_code: projectCode,
      stage_code: String(item.stageCode || item.stage_code || item.stage || 'general'),
      item_index: Number(item.itemIndex || item.item_index || index) || index,
      item: String(item.item || item.label || item.title || `Quality ${index + 1}`),
      done: Boolean(item.done || item.completed),
      payload: item,
    });
  });
  return rows;
}

function notificationRowsFromState(payload) {
  return toArray(payload?.notifications).map((notification) => ({
    to_email: String(notification.toEmail || notification.to_email || notification.email || ''),
    title: String(notification.title || 'V-Work'),
    body: String(notification.body || notification.message || ''),
    kind: String(notification.kind || 'info'),
    read: Boolean(notification.read),
    entity_type: String(notification.entityType || notification.entity_type || ''),
    entity_id: String(notification.entityId || notification.entity_id || ''),
    payload: notification,
  }));
}

function processTemplateRowsFromState(payload) {
  return toArray(payload?.processTemplates || payload?.process_templates).flatMap((group, groupIndex) => {
    const steps = toArray(group.steps);
    return steps.map((step, stepIndex) => ({
      template_code: String(step.code || `${group.id || 'N'}-${stepIndex + 1}`),
      group_code: String(group.id || group.groupCode || ''),
      group_name: String(group.name || ''),
      title: String(step.title || ''),
      description: String(step.description || ''),
      output: String(step.output || ''),
      checking_point: String(step.checkingPoint || step.checking_point || ''),
      risk_blocked: String(step.riskBlocked || step.risk_blocked || ''),
      operation_mapping: String(step.operationMapping || step.operation_mapping || ''),
      serves_okrs: toStringArray(step.servesOkrs || step.serves_okrs || group.okrs),
      raci: isPlainObject(step.raci) ? step.raci : {},
      checkpoints: toArray(step.checkpoints),
      hard_gate: String(step.hardGate || step.hard_gate || ''),
      okrs: toStringArray(group.okrs),
      payload: { ...step, group },
      sort_order: groupIndex * 100 + stepIndex,
    }));
  });
}

function escalationRuleRowsFromState(payload) {
  return toArray(payload?.escalationRules || payload?.escalation_rules).map((rule, index) => ({
    rule_id: String(rule.id || rule.ruleId || `rule_${index + 1}`),
    level: String(rule.level || ''),
    trigger: String(rule.trigger || ''),
    sla_hours: Number(rule.slaHours || rule.sla_hours || 0) || null,
    action: String(rule.action || ''),
    payload: rule,
    sort_order: index,
  }));
}

function governanceEventRowsFromState(payload) {
  return toArray(payload?.governanceEvents || payload?.governance_events).map((event, index) => ({
    event_id: String(event.id || event.eventId || `governance_${index + 1}`),
    task_id: String(event.taskId || event.task_id || ''),
    project_code: String(event.projectCode || event.project_code || ''),
    action: String(event.action || ''),
    actor_name: String(event.by || event.actorName || event.actor_name || ''),
    note: String(event.note || ''),
    happened_at: event.at || event.happened_at || null,
    payload: event,
  }));
}

function monthlyScorecardRowsFromState(payload) {
  return toArray(payload?.monthlyScorecards || payload?.monthly_scorecards).map((row, index) => ({
    scorecard_id: String(row.id || row.scorecardId || `${row.month || 'month'}_${row.ownerId || index + 1}`),
    month_key: String(row.month || row.monthKey || row.month_key || ''),
    owner_id: String(row.ownerId || row.owner_id || row.owner?.id || ''),
    owner_name: String(row.ownerName || row.owner_name || row.owner?.name || ''),
    total_tasks: Number(row.total || row.totalTasks || row.total_tasks || 0) || 0,
    completed_tasks: Number(row.completed || row.completedTasks || row.completed_tasks || 0) || 0,
    on_time_tasks: Number(row.onTime || row.on_time || row.on_time_tasks || 0) || 0,
    result_score: Number(row.resultScore || row.result_score || 0) || 0,
    score: Number(row.score || 0) || 0,
    payload: row,
  }));
}

const NORMALIZED_DELETE_FILTERS = {
  vplanning_projects: 'project_code=neq.__never__',
  vplanning_users: 'email=neq.__never__',
  vplanning_org_units: 'unit_code=neq.__never__',
  vplanning_job_system: 'job_code=neq.__never__',
  vplanning_tasks: 'task_id=neq.__never__',
  vplanning_task_checklist: 'task_id=neq.__never__',
  vplanning_task_reports: 'task_id=neq.__never__',
  vplanning_task_activity: 'task_id=neq.__never__',
  vplanning_task_reminders: 'task_id=neq.__never__',
  vplanning_acceptance_items: 'project_code=neq.__never__',
  vplanning_stage_quality: 'project_code=neq.__never__',
  vplanning_notifications: 'id=not.is.null',
  vplanning_process_templates: 'template_code=neq.__never__',
  vplanning_escalation_rules: 'rule_id=neq.__never__',
  vplanning_governance_events: 'event_id=neq.__never__',
  vplanning_monthly_scorecards: 'scorecard_id=neq.__never__',
};

async function clearNormalizedTable(baseUrl, headers, table) {
  const filter = NORMALIZED_DELETE_FILTERS[table];
  if (!filter) throw new Error(`Missing delete filter for ${table}.`);
  await requestJson(`${baseUrl}/${table}?${filter}`, {
    method: 'DELETE',
    headers,
  });
}

async function upsertTableRows(baseUrl, headers, table, rows, conflictTarget) {
  if (!rows.length) return;
  for (let index = 0; index < rows.length; index += RECORD_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + RECORD_CHUNK_SIZE);
    await requestJson(`${baseUrl}/${table}?on_conflict=${conflictTarget}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(chunk),
    });
  }
}

async function clearOptionalNormalizedTable(baseUrl, headers, table) {
  try {
    await clearNormalizedTable(baseUrl, headers, table);
  } catch (error) {
    if (![400, 404].includes(Number(error.status))) throw error;
  }
}

async function upsertOptionalTableRows(baseUrl, headers, table, rows, conflictTarget) {
  try {
    await upsertTableRows(baseUrl, headers, table, rows, conflictTarget);
  } catch (error) {
    if (![400, 404].includes(Number(error.status))) throw error;
  }
}

async function syncNormalizedState(supabaseUrl, headers, payload) {
  const restUrl = `${supabaseUrl}/rest/v1`;
  const shouldSyncOptionalTable = (...keys) => keys.some((key) => Array.isArray(payload?.[key]));
  const PARENT_TABLES_ARE_UPSERT_ONLY = true;
  const rowsByTable = {
    vplanning_projects: projectRowsFromState(payload),
    vplanning_users: userRowsFromState(payload),
    vplanning_org_units: orgRowsFromState(payload),
    vplanning_job_system: jobRowsFromState(payload),
    vplanning_tasks: taskRowsFromState(payload),
    vplanning_task_checklist: checklistRowsFromState(payload),
    vplanning_task_reports: reportRowsFromState(payload),
    vplanning_task_activity: activityRowsFromState(payload),
    vplanning_task_reminders: reminderRowsFromState(payload),
  };
  if (shouldSyncOptionalTable('acceptanceItems', 'acceptance', 'acceptance_items')) {
    rowsByTable.vplanning_acceptance_items = acceptanceRowsFromState(payload);
  }
  if (shouldSyncOptionalTable('stageQuality', 'stage_quality', 'qualityItems')) {
    rowsByTable.vplanning_stage_quality = stageQualityRowsFromState(payload);
  }
  if (shouldSyncOptionalTable('notifications')) {
    rowsByTable.vplanning_notifications = notificationRowsFromState(payload);
  }
  if (shouldSyncOptionalTable('processTemplates', 'process_templates')) {
    rowsByTable.vplanning_process_templates = processTemplateRowsFromState(payload);
  }
  if (shouldSyncOptionalTable('escalationRules', 'escalation_rules')) {
    rowsByTable.vplanning_escalation_rules = escalationRuleRowsFromState(payload);
  }
  if (shouldSyncOptionalTable('governanceEvents', 'governance_events')) {
    rowsByTable.vplanning_governance_events = governanceEventRowsFromState(payload);
  }
  if (shouldSyncOptionalTable('monthlyScorecards', 'monthly_scorecards')) {
    rowsByTable.vplanning_monthly_scorecards = monthlyScorecardRowsFromState(payload);
  }
  const clearOrder = [
    'vplanning_monthly_scorecards',
    'vplanning_governance_events',
    'vplanning_escalation_rules',
    'vplanning_process_templates',
    'vplanning_notifications',
    'vplanning_stage_quality',
    'vplanning_acceptance_items',
    'vplanning_task_reminders',
    'vplanning_task_activity',
    'vplanning_task_reports',
    'vplanning_task_checklist',
    'vplanning_tasks',
  ];
  for (const table of clearOrder) {
    if (!(table in rowsByTable)) continue;
    if (['vplanning_process_templates','vplanning_escalation_rules','vplanning_governance_events','vplanning_monthly_scorecards'].includes(table)) {
      await clearOptionalNormalizedTable(restUrl, headers, table);
    } else {
      await clearNormalizedTable(restUrl, headers, table);
    }
  }
  await upsertTableRows(restUrl, headers, 'vplanning_projects', rowsByTable.vplanning_projects, 'project_code');
  await upsertTableRows(restUrl, headers, 'vplanning_users', rowsByTable.vplanning_users, 'email');
  await upsertTableRows(restUrl, headers, 'vplanning_org_units', rowsByTable.vplanning_org_units, 'unit_code');
  await upsertTableRows(restUrl, headers, 'vplanning_job_system', rowsByTable.vplanning_job_system, 'job_code');
  await upsertTableRows(restUrl, headers, 'vplanning_tasks', rowsByTable.vplanning_tasks, 'task_id');
  await upsertTableRows(restUrl, headers, 'vplanning_task_checklist', rowsByTable.vplanning_task_checklist, 'task_id,item_index');
  await upsertTableRows(restUrl, headers, 'vplanning_task_reports', rowsByTable.vplanning_task_reports, 'task_id,report_index');
  await upsertTableRows(restUrl, headers, 'vplanning_task_activity', rowsByTable.vplanning_task_activity, 'task_id,activity_index');
  await upsertTableRows(restUrl, headers, 'vplanning_task_reminders', rowsByTable.vplanning_task_reminders, 'task_id,reminder_index');
  if ('vplanning_acceptance_items' in rowsByTable) await upsertTableRows(restUrl, headers, 'vplanning_acceptance_items', rowsByTable.vplanning_acceptance_items, 'project_code,item_index');
  if ('vplanning_stage_quality' in rowsByTable) await upsertTableRows(restUrl, headers, 'vplanning_stage_quality', rowsByTable.vplanning_stage_quality, 'project_code,stage_code,item_index');
  if ('vplanning_notifications' in rowsByTable) await upsertTableRows(restUrl, headers, 'vplanning_notifications', rowsByTable.vplanning_notifications, 'id');
  if ('vplanning_process_templates' in rowsByTable) await upsertOptionalTableRows(restUrl, headers, 'vplanning_process_templates', rowsByTable.vplanning_process_templates, 'template_code');
  if ('vplanning_escalation_rules' in rowsByTable) await upsertOptionalTableRows(restUrl, headers, 'vplanning_escalation_rules', rowsByTable.vplanning_escalation_rules, 'rule_id');
  if ('vplanning_governance_events' in rowsByTable) await upsertOptionalTableRows(restUrl, headers, 'vplanning_governance_events', rowsByTable.vplanning_governance_events, 'event_id');
  if ('vplanning_monthly_scorecards' in rowsByTable) await upsertOptionalTableRows(restUrl, headers, 'vplanning_monthly_scorecards', rowsByTable.vplanning_monthly_scorecards, 'scorecard_id');
}

export default async function handler(req, res) {
  const limit = req.method === 'GET'
    ? { windowMs: 60_000, max: 120 }
    : RATE_LIMITS.mutation;
  if (!await enforceRateLimit(req, res, { ...limit, route: 'vplanning-state' })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    res.status(500).json({ ok: false, error: 'Supabase server config is missing.' });
    return;
  }

  const headers = buildHeaders(serviceRoleKey);
  const baseUrl = `${supabaseUrl}/rest/v1/vplanning_state`;
  const recordsBaseUrl = `${supabaseUrl}/rest/v1/vplanning_records`;

  try {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ ok: false, error: 'Missing session token.' });
      return;
    }
    const sessionUser = await requestJson(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: buildAuthHeaders(anonKey, `Bearer ${token}`),
    });
    const requesterProfile = await findActiveVWorkProfile(supabaseUrl, headers, sessionUser);
    if (!requesterProfile) {
      res.status(403).json({
        ok: false,
        code: 'VWORK_PERMISSION_DENIED',
        error: 'Tài khoản hiện tại chưa được cấp quyền sử dụng V-Work.',
      });
      return;
    }

    if (req.method === 'GET') {
      const source = new URL(req.url || '/', 'http://localhost').searchParams.get('source');
      if (source === 'normalized') {
        const [normalizedState, records, stateRows] = await Promise.all([
          loadNormalizedState(supabaseUrl, headers),
          requestJson(`${recordsBaseUrl}?select=entity_type,record_id,payload,sort_order&order=entity_type.asc,sort_order.asc`, { headers }),
          requestJson(`${baseUrl}?id=eq.${encodeURIComponent(STATE_ID)}&select=updated_at&limit=1`, { headers }),
        ]);
        const stateRow = Array.isArray(stateRows) ? stateRows[0] : null;
        res.status(200).json({ ok: true, state: mergeRecordBackedState(normalizedState, assembleState(records)), updatedAt:stateRow?.updated_at || null, storage: 'normalized' });
        return;
      }

      const records = await requestJson(`${recordsBaseUrl}?select=entity_type,record_id,payload,sort_order&order=entity_type.asc,sort_order.asc`, { headers });
      const hasEntityRecords = Array.isArray(records) && records.some((row) => row.entity_type !== META_ENTITY);
      if (hasEntityRecords) {
        res.status(200).json({ ok: true, state: assembleState(records), storage: 'records' });
        return;
      }

      const rows = await requestJson(`${baseUrl}?id=eq.${encodeURIComponent(STATE_ID)}&select=payload,updated_at&limit=1`, { headers });
      const row = Array.isArray(rows) ? rows[0] : null;
      res.status(200).json({ ok: true, state: row?.payload || null, updatedAt: row?.updated_at || null, storage: 'state' });
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const body = await readJsonBody(req);
      const payload = body?.state;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        res.status(400).json({ ok: false, error: 'Invalid state payload.' });
        return;
      }

      if (!Array.isArray(payload.tasks)) {
        res.status(400).json({ ok: false, error: 'V-Work save payload must include a complete tasks array.' });
        return;
      }

      const [currentTaskRows, currentStateRows] = await Promise.all([
        requestJson(`${supabaseUrl}/rest/v1/vplanning_tasks?select=task_id`, { headers }),
        requestJson(`${baseUrl}?id=eq.${encodeURIComponent(STATE_ID)}&select=updated_at&limit=1`, { headers }),
      ]);
      const currentTasks = toArray(currentTaskRows).map((row)=>({ id:row.task_id }));
      const deletedTaskIds = normalizeDeletedTaskIds(body?.deletedTaskIds || payload.deletedTaskIds);
      const unexpectedMissing = unexpectedMissingTaskIds(currentTasks, payload.tasks, deletedTaskIds);
      if (unexpectedMissing.length) {
        res.status(409).json({
          ok: false,
          error: `V-Work data-loss guard blocked removal of ${unexpectedMissing.length} task(s) without explicit task IDs.`,
          code: 'VWORK_TASK_LOSS_GUARD',
          currentTaskCount: currentTasks.length,
          incomingTaskCount: payload.tasks.length,
        });
        return;
      }
      const currentStateRow = Array.isArray(currentStateRows) ? currentStateRows[0] : null;
      const expectedUpdatedAt = String(body?.expectedUpdatedAt || '').trim();
      const currentUpdatedAt = String(currentStateRow?.updated_at || '').trim();
      if (expectedUpdatedAt && currentUpdatedAt && expectedUpdatedAt !== currentUpdatedAt) {
        res.status(409).json({
          ok: false,
          error: 'V-Work data changed on the server. Reload and merge before saving again.',
          code: 'VWORK_VERSION_CONFLICT',
          updatedAt: currentUpdatedAt,
        });
        return;
      }

      const records = decomposeState(payload);
      await requestJson(`${recordsBaseUrl}?entity_type=neq.${encodeURIComponent('__never__')}`, {
        method: 'DELETE',
        headers,
      });
      await upsertRecordChunks(recordsBaseUrl, headers, records);
      await syncNormalizedState(supabaseUrl, headers, payload);

      const rows = await requestJson(`${baseUrl}?on_conflict=id&select=id,updated_at`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([{ id: STATE_ID, payload }]),
      });
      const actor = resolveActor(requesterProfile, sessionUser);
      try {
        await requestJson(`${supabaseUrl}/rest/v1/vplanning_audit_events`, {
          method: 'POST',
          headers: { ...headers, Prefer: 'return=minimal' },
          body: JSON.stringify([{
            ...actor,
            action: body?.action || 'save_state',
            entity_counts: summarizeEntityCounts(payload),
            summary: body?.summary || 'Saved V-Work state from app',
          }]),
        });
      } catch (auditError) {
        console.warn('V-Work audit insert failed:', auditError.message);
      }
      const row = Array.isArray(rows) ? rows[0] : null;
      res.status(200).json({ ok: true, updatedAt: row?.updated_at || null });
      return;
    }

    res.setHeader('Allow', 'GET, PUT, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'V-Work state request failed.' });
  }
}

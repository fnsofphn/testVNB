export const TRAINING_OPERATIONS_STATE_ID = 'default';

export const TRAINING_INPUT_DEFINITIONS = Object.freeze({
  roster: { code: 'D03', title: 'Lớp & học viên', ownerRole: 'intake' },
  vlearning: { code: 'D04', title: 'Nội dung VLearning', ownerRole: 'content' },
  game: { code: 'D05', title: 'Gamification', ownerRole: 'content' },
  discussion: { code: 'D06', title: 'Thảo luận', ownerRole: 'content' },
  assignment: { code: 'D07', title: 'Thu hoạch', ownerRole: 'content' },
  test: { code: 'D08', title: 'Kiểm tra', ownerRole: 'content' },
  material: { code: 'D09', title: 'Tài liệu VTraining', ownerRole: 'vtraining' },
});

const FIRST_INPUT_SOURCE_STEPS = Object.freeze({
  D03: 'UC02-B04', D04: 'UC03-B04', D05: 'UC04-B04', D06: 'UC05-B04',
  D07: 'UC06-B04', D08: 'UC07-B04', D09: 'UC08-B04',
});

export const TRAINING_TASK_TEMPLATES = Object.freeze([
  { group: 'prepare', code: 'T-101', title: 'Chuẩn bị thông tin lớp', inputKey: 'roster', dueOffset: 3, checklist: ['Có danh sách sơ bộ bằng file Excel', 'Đủ tên khóa học, tên lớp, thời gian và địa điểm', 'Đã chốt số lượng từng loại hoạt động'] },
  { group: 'setup', code: 'T-102', title: 'Khởi tạo lớp học', inputKey: 'roster', dueOffset: 2, checklist: ['Đúng tên lớp', 'Đúng thời gian chạy lớp'] },
  { group: 'setup', code: 'T-103', title: 'Khởi tạo danh sách học viên', inputKey: 'roster', dueOffset: 1, checklist: ['Đúng số lượng học viên', 'Tài khoản học viên thấy lớp', 'Đủ 02 tài khoản test thuộc 02 nhóm', 'Có 01 tài khoản test trước lớp và 01 tài khoản demo tại lớp'] },
  { group: 'setup', code: 'T-104', title: 'Khởi tạo hoạt động thảo luận', inputKey: 'discussion', dueOffset: 2, checklist: ['Chọn đúng thảo luận từ thư viện', 'Tài khoản test làm được và admin thấy kết quả', 'Tài khoản học viên thấy thảo luận', 'Đóng phát hành sau khi test'] },
  { group: 'setup', code: 'T-105', title: 'Khởi tạo bài kiểm tra', inputKey: 'test', dueOffset: 2, checklist: ['Chọn đúng bài kiểm tra từ thư viện', 'Đúng số câu và thời gian làm bài', 'Tài khoản test làm được và thấy kết quả', 'Đóng phát hành sau khi test'] },
  { group: 'setup', code: 'T-106', title: 'Khởi tạo bài thu hoạch', inputKey: 'assignment', dueOffset: 2, checklist: ['Chọn đúng bài thu hoạch từ thư viện', 'Đúng yêu cầu đầu ra và rubric', 'Tài khoản test nộp được bài', 'Đóng phát hành sau khi test'] },
  { group: 'setup', code: 'T-107', title: 'Khởi tạo Ứng dụng học tập số / Gamification', inputKey: 'game', dueOffset: 2, checklist: ['Khởi tạo đúng ứng dụng học tập số', 'Tài khoản test làm thử thành công', 'Màn ranking có kết quả và reset được', 'Tài khoản học viên thấy bài', 'Đóng phát hành sau khi test'] },
  { group: 'setup', code: 'T-108', title: 'Khởi tạo bài tập VLearning', inputKey: 'vlearning', dueOffset: 2, checklist: ['Khởi tạo đúng bài tập', 'Tài khoản test làm được và thấy kết quả', 'Tài khoản học viên thấy bài trong lớp'] },
  { group: 'setup', code: 'T-109', title: 'Khởi tạo tài liệu', inputKey: 'material', dueOffset: 2, checklist: ['Khởi tạo đúng tài liệu', 'Tài khoản học viên thấy tài liệu', 'Tải thử tài liệu thành công'] },
  { group: 'live', code: 'T-110', title: 'Mở phát hành các hoạt động', inputKey: 'roster', dueOffset: 0, checklist: ['Phát hành Thảo luận', 'Phát hành Ứng dụng học tập số', 'Phát hành Kiểm tra và Thu hoạch', 'Tài khoản học viên thấy các bài'] },
  { group: 'live', code: 'T-111', title: 'Xem kết quả các hoạt động', inputKey: 'roster', dueOffset: 0, checklist: ['Xem kết quả Thảo luận', 'Xem kết quả Ứng dụng học tập số', 'Xem kết quả Kiểm tra', 'Xem kết quả Thu hoạch'] },
]);

export const TRAINING_DEFAULT_CLASSES = Object.freeze([
  { id: 'TNKH01', code: 'TNKH01', courseId: 'CX-FOUNDATION', name: 'Lớp 01 · CSKH EVNSPC', startDate: '2026-09-01', endDate: '2026-09-05', cloneFrom: 'CLASS_TEMPLATE', status: 'PREPARING' },
  { id: 'TNKH02', code: 'TNKH02', courseId: 'CX-FOUNDATION', name: 'Lớp 02 · CSKH EVNSPC', startDate: '2026-09-08', endDate: '2026-09-12', cloneFrom: 'CLASS_TEMPLATE', status: 'PREPARING' },
  { id: 'TNKH03', code: 'TNKH03', courseId: 'CX-FOUNDATION', name: 'Lớp 03 · CSKH EVNSPC', startDate: '2026-09-15', endDate: '2026-09-19', cloneFrom: 'CLASS_TEMPLATE', status: 'PREPARING' },
]);

const COMMAND_ROLES = Object.freeze({
  CREATE_PROJECT: ['operations', 'admin'],
  CLONE_CLASS: ['operations', 'admin'],
  CREATE_CLASS_TASK: ['operations', 'vtraining', 'admin'],
  UPDATE_TASK_CONFIG: ['operations', 'vtraining', 'admin'],
  ARCHIVE_TASK: ['operations', 'vtraining', 'admin'],
  SUBMIT_INPUT: ['intake', 'content', 'vtraining', 'operations', 'admin'],
  ASSIGN_TASKS: ['manager', 'operations', 'admin'],
  ASSIGN_GROUP_MANAGER: ['operations', 'admin'],
  START_TASK: ['operations', 'intake', 'content', 'vtraining', 'manager', 'member', 'admin'],
  UPDATE_TASK_PROGRESS: ['operations', 'intake', 'content', 'vtraining', 'manager', 'member', 'admin'],
  SUBMIT_OUTPUT: ['operations', 'intake', 'content', 'vtraining', 'manager', 'member', 'admin'],
  SUBMIT_REVIEW: ['operations', 'intake', 'content', 'vtraining', 'manager', 'member', 'admin'],
  REVIEW_TASK: ['manager', 'admin'],
  SUBMIT_INPUT_VERSION: ['intake', 'content', 'vtraining', 'operations', 'admin'],
  RESOLVE_INPUT_IMPACT: ['manager', 'operations', 'admin'],
  REQUEST_SCOPE_CHANGE: ['intake', 'operations', 'admin'],
  APPROVE_SCOPE_CHANGE: ['operations', 'admin'],
});

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function nowIso(context) {
  return String(context?.now || new Date().toISOString());
}

function actorFrom(context) {
  const actor = context?.actor || {};
  return {
    id: String(actor.id || actor.email || 'system'),
    name: String(actor.name || actor.email || 'Hệ thống'),
    email: String(actor.email || ''),
    role: String(context?.role || actor.role || 'member'),
  };
}

function requiredText(value, label) {
  const text = String(value || '').trim();
  if (!text) throw domainError('VALIDATION_ERROR', `${label} là bắt buộc.`);
  return text;
}

function dateText(value, label) {
  const text = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw domainError('VALIDATION_ERROR', `${label} không đúng định dạng ngày.`);
  return text;
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw domainError('VALIDATION_ERROR', `${label} phải là số nguyên lớn hơn 0.`);
  return number;
}

export function domainError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details !== undefined) error.details = details;
  return error;
}

export function assertTrainingOperationsCommandRole(type, role) {
  const allowed = COMMAND_ROLES[type];
  if (!allowed) throw domainError('UNKNOWN_COMMAND', `Lệnh ${type} chưa được hỗ trợ.`);
  if (!allowed.includes(role)) throw domainError('TRAINING_OPERATIONS_PERMISSION_DENIED', `Vai trò ${role} không được phép thực hiện ${type}.`);
}

function inputDefinitionByCode(code) {
  return Object.entries(TRAINING_INPUT_DEFINITIONS).find(([, item]) => item.code === code);
}

function selectedInputCodes(scope) {
  const selected = new Set((scope?.selectedContents || []).map((item) => String(item).toUpperCase()));
  const codes = ['D03'];
  if (selected.has('VLEARNING')) codes.push('D04');
  if (selected.has('GAMIFICATION')) codes.push('D05');
  if (selected.has('DISCUSSION')) codes.push('D06');
  if (selected.has('ASSIGNMENT')) codes.push('D07');
  if (selected.has('TEST')) codes.push('D08');
  if (selected.has('VTRAINING')) codes.push('D09');
  return codes;
}

function createInputRecords(projectId, scope, timestamp) {
  const requiredCodes = new Set(selectedInputCodes(scope));
  return Object.entries(TRAINING_INPUT_DEFINITIONS).map(([key, definition]) => ({
    id: `${projectId}:${definition.code}`,
    projectId,
    key,
    dataCode: definition.code,
    title: definition.title,
    ownerRole: definition.ownerRole,
    required: requiredCodes.has(definition.code),
    status: 'MISSING',
    activeVersion: 0,
    versions: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

function taskRequiredInputs(template) {
  const code = TRAINING_INPUT_DEFINITIONS[template.inputKey]?.code || 'D03';
  return code === 'D03' ? ['D03'] : ['D03', code];
}

function createTasksForClass(projectId, courseId, classItem, classIndex, timestamp) {
  return TRAINING_TASK_TEMPLATES.map((template, templateIndex) => ({
    id: `${classItem.code}-${template.code}`,
    projectId,
    courseId,
    classId: classItem.id,
    classCode: classItem.code,
    className: classItem.name,
    startDate: classItem.startDate,
    scopeLevel: 'class',
    scopeLabel: classItem.name,
    group: template.group,
    templateId: template.code,
    title: template.title,
    input: template.inputKey,
    requiredInputCodes: taskRequiredInputs(template),
    requiredInputVersions: {},
    dueOffset: template.dueOffset,
    dueDirection: 'BEFORE',
    anchorType: 'CLASS_START',
    deadlineStatus: 'INACTIVE',
    slaStartedAt: null,
    status: 'WAITING_INPUT',
    manager: 'Ngọc Trần',
    assignee: 'Chưa giao',
    assigneeId: null,
    reviewer: 'Ngọc Trần',
    reviewerId: null,
    priority: 'Normal',
    checklistItems: [...template.checklist],
    checklist: template.checklist.map(() => false),
    checklistLog: [],
    progress: 0,
    blocker: '',
    evidence: '',
    outputs: [],
    submissions: [],
    reviews: [],
    assignmentHistory: [],
    rework: 0,
    sortOrder: classIndex * 100 + templateIndex,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}

function auditEvent(type, summary, context, entityType = 'workspace', entityId = TRAINING_OPERATIONS_STATE_ID, details = {}) {
  const timestamp = nowIso(context);
  const actor = actorFrom(context);
  return {
    id: `AUD-${timestamp.replace(/\D/g, '')}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    summary,
    entityType,
    entityId,
    actor,
    details,
    happenedAt: timestamp,
  };
}

function appendAudit(state, event) {
  state.auditEvents = [...(state.auditEvents || []), event];
  state.updatedAt = event.happenedAt;
  state.updatedBy = event.actor.email || event.actor.name;
}

function appendNotification(state, input) {
  state.notifications = [...(state.notifications || []), {
    id: `NOT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    read: false,
    createdAt: input.createdAt,
    ...input,
  }];
}

export function createInitialTrainingOperationsState(context = {}) {
  const timestamp = nowIso(context);
  const projectId = 'EVNSPC-2026';
  const courseId = 'CX-FOUNDATION';
  const scope = {
    projectId,
    version: 1,
    selectedContents: ['VTRAINING', 'VLEARNING', 'GAMIFICATION', 'DISCUSSION', 'ASSIGNMENT', 'TEST'],
    instanceCount: { VLEARNING: 1, GAMIFICATION: 2, DISCUSSION: 2, ASSIGNMENT: 1, TEST: 1, MATERIAL: 4 },
    createdAt: timestamp,
  };
  const classes = TRAINING_DEFAULT_CLASSES.map((item) => ({ ...item, projectId }));
  const tasks = classes.flatMap((classItem, index) => createTasksForClass(projectId, courseId, classItem, index, timestamp));
  const state = {
    schemaVersion: 1,
    activeProjectId: projectId,
    projects: [{ id: projectId, code: projectId, name: 'Đào tạo Trải nghiệm khách hàng EVNSPC 2026', customerId: 'EVNSPC', customerName: 'EVNSPC', startDate: '2026-09-01', deadline: '2026-09-30', classCount: 3, teamId: 'VTRAINING-SOUTH', status: 'PREPARING', scopeVersion: 1, createdAt: timestamp, updatedAt: timestamp }],
    courses: [{ id: courseId, projectId, code: courseId, name: 'Trải nghiệm khách hàng', systems: ['VTraining', 'VLearning'], contentVersion: '2026-v1', status: 'PREPARING', createdAt: timestamp, updatedAt: timestamp }],
    classes,
    scopes: [scope],
    inputs: createInputRecords(projectId, scope, timestamp),
    tasks,
    changeRequests: [],
    notifications: [],
    auditEvents: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    updatedBy: 'system',
  };
  appendAudit(state, auditEvent('WORKSPACE_INITIALIZED', 'Khởi tạo dữ liệu mẫu vận hành đào tạo trong store riêng.', context));
  return state;
}

function activeProject(state, projectId) {
  const id = String(projectId || state.activeProjectId || '');
  const project = state.projects.find((item) => item.id === id);
  if (!project) throw domainError('NOT_FOUND', 'Không tìm thấy dự án vận hành đào tạo.');
  return project;
}

function activeScope(state, projectId) {
  return [...state.scopes].filter((item) => item.projectId === projectId).sort((a, b) => b.version - a.version)[0] || null;
}

function findTask(state, taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) throw domainError('NOT_FOUND', `Không tìm thấy công việc ${taskId}.`);
  return task;
}

function findInput(state, projectId, inputKeyOrCode) {
  const token = String(inputKeyOrCode || '').trim();
  const item = state.inputs.find((input) => input.projectId === projectId && (input.key === token || input.dataCode === token));
  if (!item) throw domainError('NOT_FOUND', `Không tìm thấy nguồn input ${token}.`);
  return item;
}

function assertInputOwner(input, role) {
  if (['operations', 'admin'].includes(role)) return;
  if (input.ownerRole !== role) throw domainError('TRAINING_OPERATIONS_PERMISSION_DENIED', `Vai trò ${role} không sở hữu ${input.dataCode}.`);
}

function actorMatches(context, ...values) {
  const actor = actorFrom(context);
  const tokens = new Set([actor.id, actor.email, actor.name].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  return values.some((value) => tokens.has(String(value || '').trim().toLowerCase()));
}

function assertTaskAssignee(task, context) {
  if (context.role === 'admin') return;
  if (!actorMatches(context, task.assigneeId, task.assignee)) {
    throw domainError('TRAINING_OPERATIONS_PERMISSION_DENIED', `Bạn không phải người được giao thực hiện ${task.id}.`);
  }
}

function assertTaskReviewer(task, context) {
  if (context.role === 'admin') return;
  if (!actorMatches(context, task.reviewerId, task.reviewer)) {
    throw domainError('TRAINING_OPERATIONS_PERMISSION_DENIED', `Bạn không phải người duyệt được chỉ định cho ${task.id}.`);
  }
}

function validateInputPayload(input, payload, state) {
  const data = payload?.data && typeof payload.data === 'object' ? clone(payload.data) : {};
  const files = Array.isArray(payload?.files) ? payload.files : [];
  const errors = [];
  if (input.dataCode === 'D03') {
    const classRows = Array.isArray(data.classes) ? data.classes : [];
    const learnerRows = Array.isArray(data.learners) ? data.learners : [];
    const expected = state.projects.find((item) => item.id === input.projectId)?.classCount || 0;
    if (classRows.length && classRows.length !== expected) errors.push(`Số lớp hợp lệ (${classRows.length}) không khớp số lớp dự kiến (${expected}).`);
    if (!classRows.length && !files.length) errors.push('Cần file hoặc danh sách lớp hợp lệ.');
    if (learnerRows.some((row) => !String(row.email || row.learnerCode || '').trim() || !String(row.classCode || '').trim())) errors.push('Học viên phải có email/mã học viên và mã lớp đích.');
  } else if (input.dataCode === 'D04') {
    for (const key of ['content_name', 'eln_count', 'eln_structure']) if (!String(data[key] ?? '').trim()) errors.push(`D04 thiếu ${key}.`);
  } else if (input.dataCode === 'D05') {
    const gameCount = Number(data.game_count);
    const legacyContent = String(data.game_content || '').trim();
    const gameContents = Array.isArray(data.game_contents)
      ? data.game_contents.map((item) => String(item || '').trim())
      : legacyContent ? [legacyContent] : [];
    if (!Number.isInteger(gameCount) || gameCount < 0) errors.push('D05 game_count phải là số nguyên không âm.');
    if (Number.isInteger(gameCount) && (gameContents.slice(0, gameCount).some((item) => !item) || gameContents.length < gameCount)) {
      errors.push(`D05 cần đủ ${Math.max(0, gameCount)} nội dung/link game.`);
    }
    if (gameCount > 0) {
      for (const key of ['play_limit', 'schedule']) if (!String(data[key] ?? '').trim()) errors.push(`D05 thiếu ${key}.`);
    }
    data.game_count = Number.isInteger(gameCount) && gameCount >= 0 ? gameCount : data.game_count;
    data.game_contents = gameContents;
    data.game_content = gameContents[0] || '';
  } else if (input.dataCode === 'D06') {
    for (const key of ['discussion_count', 'topic_content', 'mode']) if (!String(data[key] ?? '').trim()) errors.push(`D06 thiếu ${key}.`);
    if (String(data.mode || '').toLowerCase().includes('nhóm') && !String(data.group_reference || '').trim()) errors.push('D06 chế độ nhóm phải có group_reference từ D03.');
  } else if (input.dataCode === 'D07') {
    for (const key of ['assignment_count', 'assignment_brief', 'rubric_pass_score', 'submission_rule']) if (!String(data[key] ?? '').trim()) errors.push(`D07 thiếu ${key}.`);
  } else if (input.dataCode === 'D08') {
    for (const key of ['test_count', 'question_bank', 'test_structure', 'test_rule']) if (!String(data[key] ?? '').trim()) errors.push(`D08 thiếu ${key}.`);
  } else if (input.dataCode === 'D09') {
    const classIds = Array.isArray(data.class_ids) ? data.class_ids : Array.isArray(data.classIds) ? data.classIds : [];
    const validClassIds = new Set(state.classes.filter((item) => item.projectId === input.projectId).map((item) => item.id));
    if (!files.length && !String(data.material_link || data.materialLink || '').trim()) errors.push('D09 cần file hoặc link tài liệu.');
    if (!classIds.length || classIds.some((id) => !validClassIds.has(id))) errors.push('D09 phải gắn đúng ít nhất một lớp thuộc dự án.');
    const visibleFrom = String(data.visible_from || data.visibleFrom || '');
    const visibleTo = String(data.visible_to || data.visibleTo || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visibleFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(visibleTo) || visibleTo < visibleFrom) errors.push('D09 cần khoảng thời gian hiển thị hợp lệ.');
  } else if (!Object.keys(data).length && !files.length) {
    errors.push(`Cần nhập dữ liệu hoặc đính kèm file cho ${input.dataCode}.`);
  }
  if (payload?.validation?.errors?.length) errors.push(...payload.validation.errors.map(String));
  if (errors.length) throw domainError('INPUT_VALIDATION_FAILED', 'Input chưa hợp lệ.', { errors });
  return { data, files, validation: { valid: true, errors: [], warnings: payload?.validation?.warnings || [] } };
}

function refreshTaskReadiness(state, projectId, timestamp) {
  const inputs = state.inputs.filter((item) => item.projectId === projectId && item.status === 'ACTIVE');
  const versions = Object.fromEntries(inputs.map((item) => [item.dataCode, item.activeVersion]));
  state.tasks.forEach((task) => {
    if (task.projectId !== projectId || ['DONE', 'CANCELLED', 'IN_REVIEW', 'IN_PROGRESS', 'REWORK'].includes(task.status)) return;
    const readyInputs = task.requiredInputCodes.every((code) => Number(versions[code] || 0) > 0);
    const assigned = Boolean(task.assigneeId || (task.assignee && task.assignee !== 'Chưa giao')) && Boolean(task.reviewerId || task.reviewer);
    task.requiredInputVersions = Object.fromEntries(task.requiredInputCodes.filter((code) => versions[code]).map((code) => [code, versions[code]]));
    task.status = readyInputs && assigned ? 'READY' : 'WAITING_INPUT';
    task.deadlineStatus = readyInputs && assigned ? 'ACTIVE' : 'INACTIVE';
    task.slaStartedAt = readyInputs && assigned ? (task.slaStartedAt || timestamp) : null;
    task.updatedAt = timestamp;
  });
}

function diffValues(before, after, prefix = '') {
  const result = [];
  const left = before && typeof before === 'object' ? before : {};
  const right = after && typeof after === 'object' ? after : {};
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (JSON.stringify(left[key]) !== JSON.stringify(right[key])) result.push({ path, before: left[key] ?? null, after: right[key] ?? null });
  }
  return result;
}

function submitInput(state, payload, context, isNewVersion = false) {
  const timestamp = nowIso(context);
  const project = activeProject(state, payload.projectId);
  const input = findInput(state, project.id, payload.inputKey || payload.dataCode);
  assertInputOwner(input, context.role);
  if (!input.required && !payload.allowOptional) throw domainError('INPUT_NOT_IN_SCOPE', `${input.dataCode} không thuộc phạm vi đang hoạt động.`);
  const validated = validateInputPayload(input, payload, state);
  const previous = input.versions.find((item) => item.version === input.activeVersion) || null;
  if (previous && !isNewVersion) throw domainError('INPUT_VERSION_REQUIRED', 'Input đã có phiên bản active; hãy dùng luồng cập nhật input.');
  const reason = previous ? requiredText(payload.reason, 'Lý do cập nhật') : String(payload.reason || 'Nộp input lần đầu');
  const version = input.activeVersion + 1;
  const versionRecord = {
    id: `${input.id}:v${version}`,
    version,
    status: 'ACTIVE',
    sourceDataCode: input.dataCode,
    sourceStepCode: previous ? 'UC15-B03' : FIRST_INPUT_SOURCE_STEPS[input.dataCode],
    data: validated.data,
    files: validated.files,
    validation: validated.validation,
    reason,
    effectiveAt: payload.effectiveAt || timestamp,
    submittedBy: actorFrom(context),
    submittedAt: timestamp,
    diff: previous ? diffValues(previous.data, validated.data) : [],
  };
  input.versions.forEach((item) => { if (item.status === 'ACTIVE') item.status = 'SUPERSEDED'; });
  input.versions.push(versionRecord);
  input.activeVersion = version;
  input.status = 'ACTIVE';
  input.updatedAt = timestamp;
  const affectedTaskIds = state.tasks.filter((task) => task.projectId === project.id && task.requiredInputCodes.includes(input.dataCode) && !['CANCELLED'].includes(task.status)).map((task) => task.id);
  if (previous) {
    state.tasks.forEach((task) => {
      if (!affectedTaskIds.includes(task.id) || task.status === 'DONE') return;
      task.inputImpact = { inputId: input.id, fromVersion: previous.version, toVersion: version, decision: 'PENDING', detectedAt: timestamp };
      task.updatedAt = timestamp;
    });
  }
  refreshTaskReadiness(state, project.id, timestamp);
  appendNotification(state, { createdAt: timestamp, kind: previous ? 'INPUT_UPDATED' : 'INPUT_READY', title: `${input.dataCode} ${previous ? `đã cập nhật lên v${version}` : 'đã sẵn sàng'}`, body: `${affectedTaskIds.length} công việc liên quan được kiểm tra lại.`, entityType: 'input', entityId: input.id, recipients: ['operations', 'manager'] });
  appendAudit(state, auditEvent(previous ? 'INPUT_VERSION_CREATED' : 'INPUT_SUBMITTED', `${input.dataCode} · ${input.title} đã được xác nhận phiên bản ${version}.`, context, 'input', input.id, { version, affectedTaskIds, reason }));
}

function taskTemplateByInputKey(inputKey) {
  return TRAINING_TASK_TEMPLATES.find((item) => item.inputKey === inputKey);
}

function createProject(state, payload, context) {
  const timestamp = nowIso(context);
  const project = payload.project || {};
  const course = payload.course || {};
  const projectId = requiredText(project.id || project.code, 'Mã dự án');
  const customerId = requiredText(project.customerId || project.customerName, 'Khách hàng');
  const name = requiredText(project.name, 'Tên dự án');
  const startDate = dateText(project.startDate, 'Ngày bắt đầu');
  const deadline = dateText(project.deadline, 'Deadline');
  if (deadline < startDate) throw domainError('VALIDATION_ERROR', 'Deadline không được trước ngày bắt đầu.');
  if (state.projects.some((item) => item.customerId === customerId && item.name.toLowerCase() === name.toLowerCase())) throw domainError('DUPLICATE_PROJECT', 'Tên dự án đã tồn tại trong cùng khách hàng.');
  const classRows = Array.isArray(payload.classes) ? payload.classes : [];
  const classCount = positiveInteger(project.classCount || classRows.length, 'Số lớp');
  if (classRows.length !== classCount) throw domainError('VALIDATION_ERROR', 'Danh sách lớp phải khớp số lớp dự kiến.');
  const systems = [...new Set((course.systems || []).map(String))];
  if (!systems.some((item) => ['VTraining', 'VLearning'].includes(item))) throw domainError('VALIDATION_ERROR', 'Phải chọn ít nhất VTraining hoặc VLearning.');
  const courseId = requiredText(course.id || course.code, 'Mã khóa học');
  const selectedContents = [...new Set((payload.scope?.selectedContents || systems.map((item) => item.toUpperCase())).map((item) => String(item).toUpperCase()))];
  const scope = { projectId, version: 1, selectedContents, instanceCount: payload.scope?.instanceCount || {}, createdAt: timestamp };
  const normalizedClasses = classRows.map((item, index) => {
    const classId = requiredText(item.id || item.code, `Mã lớp ${index + 1}`);
    const classStart = dateText(item.startDate, `Ngày bắt đầu lớp ${index + 1}`);
    const classEnd = dateText(item.endDate, `Ngày kết thúc lớp ${index + 1}`);
    if (classEnd < classStart) throw domainError('VALIDATION_ERROR', `Ngày kết thúc lớp ${classId} không hợp lệ.`);
    return { id: classId, code: classId, projectId, courseId, name: requiredText(item.name, `Tên lớp ${index + 1}`), startDate: classStart, endDate: classEnd, cloneFrom: item.cloneFrom || 'CLASS_TEMPLATE', status: 'PREPARING', createdAt: timestamp, updatedAt: timestamp };
  });
  state.projects.push({ id: projectId, code: projectId, name, customerId, customerName: project.customerName || customerId, startDate, deadline, classCount, teamId: project.teamId || '', status: 'PREPARING', scopeVersion: 1, createdAt: timestamp, updatedAt: timestamp });
  state.courses.push({ id: courseId, projectId, code: courseId, name: requiredText(course.name, 'Tên khóa học'), systems, contentVersion: course.contentVersion || 'v1', status: 'PREPARING', createdAt: timestamp, updatedAt: timestamp });
  state.classes.push(...normalizedClasses);
  state.scopes.push(scope);
  state.inputs.push(...createInputRecords(projectId, scope, timestamp));
  state.tasks.push(...normalizedClasses.flatMap((item, index) => createTasksForClass(projectId, courseId, item, index, timestamp)));
  state.activeProjectId = projectId;
  appendAudit(state, auditEvent('PROJECT_CREATED', `Tạo dự án ${projectId}, khóa học ${courseId} và ${classCount} lớp; sinh công việc cấp lớp ở trạng thái Chờ input.`, context, 'project', projectId, { courseId, classCount, scopeVersion: 1 }));
}

function cloneClass(state, payload, context) {
  const timestamp = nowIso(context);
  const project = activeProject(state, payload.projectId);
  const course = state.courses.find((item) => item.id === payload.courseId && item.projectId === project.id);
  if (!course) throw domainError('NOT_FOUND', 'Không tìm thấy khóa học đích.');
  const classId = requiredText(payload.class?.id || payload.class?.code, 'Mã lớp');
  if (state.classes.some((item) => item.id === classId)) throw domainError('DUPLICATE_CLASS', 'Mã lớp đã tồn tại.');
  const startDate = dateText(payload.class?.startDate, 'Ngày bắt đầu lớp');
  const endDate = dateText(payload.class?.endDate, 'Ngày kết thúc lớp');
  if (endDate < startDate) throw domainError('VALIDATION_ERROR', 'Ngày kết thúc lớp không hợp lệ.');
  const classItem = { id: classId, code: classId, projectId: project.id, courseId: course.id, name: requiredText(payload.class?.name, 'Tên lớp'), startDate, endDate, cloneFrom: payload.cloneFrom || 'CLASS_TEMPLATE', status: 'PREPARING', createdAt: timestamp, updatedAt: timestamp };
  const sourceTasks = payload.cloneFrom && payload.cloneFrom !== 'CLASS_TEMPLATE' ? state.tasks.filter((item) => item.classId === payload.cloneFrom) : [];
  const tasks = createTasksForClass(project.id, course.id, classItem, state.classes.filter((item) => item.projectId === project.id).length, timestamp).map((task) => {
    const source = sourceTasks.find((item) => item.templateId === task.templateId);
    return source ? { ...task, dueOffset: source.dueOffset, checklistItems: [...source.checklistItems], checklist: source.checklistItems.map(() => false), manager: source.manager, reviewer: source.reviewer } : task;
  });
  state.classes.push(classItem);
  state.tasks.push(...tasks);
  project.classCount += 1;
  project.updatedAt = timestamp;
  appendAudit(state, auditEvent('CLASS_CLONED', `Tạo lớp ${classId} từ ${classItem.cloneFrom}; sinh ${tasks.length} công việc có ID riêng.`, context, 'class', classId, { taskIds: tasks.map((item) => item.id) }));
}

function updateTaskConfig(state, payload, context) {
  const task = findTask(state, payload.taskId);
  const allowedGroups = new Set(TRAINING_TASK_TEMPLATES.map((item) => item.group));
  if (payload.enabled !== undefined) task.status = payload.enabled ? 'WAITING_INPUT' : 'CANCELLED';
  if (payload.dueOffset !== undefined) task.dueOffset = Math.max(0, Number(payload.dueOffset) || 0);
  if (payload.title !== undefined) task.title = requiredText(payload.title, 'Tên công việc');
  if (payload.group !== undefined) {
    const group = requiredText(payload.group, 'Nhóm công việc');
    if (!allowedGroups.has(group)) throw domainError('VALIDATION_ERROR', 'Nhóm công việc không hợp lệ.');
    task.group = group;
  }
  if (Array.isArray(payload.checklistItems)) {
    const items = payload.checklistItems.map((item) => String(item).trim()).filter(Boolean);
    if (!items.length) throw domainError('VALIDATION_ERROR', 'Checklist phải có ít nhất một tiêu chí.');
    task.checklistItems = items;
    task.checklist = items.map((_, index) => Boolean(task.checklist[index]));
  }
  task.updatedAt = nowIso(context);
  refreshTaskReadiness(state, task.projectId, task.updatedAt);
  appendAudit(state, auditEvent('TASK_CONFIG_UPDATED', `Cập nhật cấu hình ${task.id}.`, context, 'task', task.id));
}

function createClassTask(state, payload, context) {
  const timestamp = nowIso(context);
  const classId = requiredText(payload.classId || payload.classCode, 'Lớp');
  const classItem = state.classes.find((item) => item.id === classId || item.code === classId);
  if (!classItem) throw domainError('NOT_FOUND', 'Không tìm thấy lớp cần thêm công việc.');
  const group = requiredText(payload.group, 'Nhóm công việc');
  if (!new Set(TRAINING_TASK_TEMPLATES.map((item) => item.group)).has(group)) throw domainError('VALIDATION_ERROR', 'Nhóm công việc không hợp lệ.');
  const checklistItems = (Array.isArray(payload.checklistItems) ? payload.checklistItems : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (!checklistItems.length) throw domainError('VALIDATION_ERROR', 'Checklist phải có ít nhất một tiêu chí.');
  const inputKey = TRAINING_INPUT_DEFINITIONS[payload.inputKey] ? payload.inputKey : 'roster';
  const existingIds = new Set(state.tasks.map((item) => item.id));
  let sequence = 1;
  let taskId = '';
  do {
    taskId = `${classItem.code}-CUSTOM-${String(sequence).padStart(3, '0')}`;
    sequence += 1;
  } while (existingIds.has(taskId));
  const task = {
    ...createTasksForClass(classItem.projectId, classItem.courseId, classItem, state.classes.indexOf(classItem), timestamp)[0],
    id: taskId,
    templateId: 'CUSTOM',
    title: requiredText(payload.title, 'Tên công việc'),
    group,
    input: inputKey,
    requiredInputCodes: taskRequiredInputs({ inputKey }),
    dueOffset: Math.max(0, Number(payload.dueOffset) || 0),
    checklistItems,
    checklist: checklistItems.map(() => false),
    custom: true,
  };
  state.tasks.push(task);
  refreshTaskReadiness(state, classItem.projectId, timestamp);
  appendAudit(state, auditEvent('CLASS_TASK_CREATED', `Thêm ${task.id} vào lớp ${classItem.code}.`, context, 'task', task.id, { classId: classItem.id, group, inputKey }));
}

function archiveTask(state, payload, context) {
  const task = findTask(state, payload.taskId);
  if (['IN_PROGRESS', 'IN_REVIEW'].includes(task.status)) throw domainError('INVALID_TRANSITION', 'Không thể xóa công việc đang thực hiện hoặc đang chờ review.');
  const timestamp = nowIso(context);
  task.status = 'CANCELLED';
  task.archivedAt = timestamp;
  task.archivedBy = actorFrom(context);
  task.archiveReason = requiredText(payload.reason, 'Lý do xóa');
  task.updatedAt = timestamp;
  appendAudit(state, auditEvent('TASK_ARCHIVED', `Đã lưu trữ ${task.id}; lịch sử và audit được giữ nguyên.`, context, 'task', task.id, { reason: task.archiveReason }));
}

function assignTasks(state, payload, context) {
  const timestamp = nowIso(context);
  const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds : [payload.taskId];
  if (!taskIds.filter(Boolean).length) throw domainError('VALIDATION_ERROR', 'Chưa chọn công việc cần phân công.');
  const assigneeName = requiredText(payload.assigneeName, 'Người thực hiện');
  const reviewerName = requiredText(payload.reviewerName, 'Người duyệt');
  if (payload.requireSeparation && payload.assigneeId && payload.assigneeId === payload.reviewerId) throw domainError('VALIDATION_ERROR', 'Người thực hiện và người duyệt phải khác nhau.');
  taskIds.forEach((taskId) => {
    const task = findTask(state, taskId);
    if (['DONE', 'CANCELLED'].includes(task.status)) throw domainError('INVALID_TRANSITION', `Không thể phân công ${task.id} ở trạng thái hiện tại.`);
    const plannedDeadline = payload.deadline ? dateText(payload.deadline, 'Deadline công việc') : task.plannedDeadline || null;
    if (plannedDeadline && plannedDeadline > task.startDate && !String(payload.deadlineOverrideReason || '').trim()) {
      throw domainError('VALIDATION_ERROR', `Deadline ${task.id} sau ngày khai giảng; cần nêu lý do ngoại lệ.`);
    }
    task.assignee = assigneeName;
    task.assigneeId = payload.assigneeId || assigneeName;
    task.reviewer = reviewerName;
    task.reviewerId = payload.reviewerId || reviewerName;
    task.priority = payload.priority || 'Normal';
    task.plannedDeadline = plannedDeadline;
    task.assignmentHistory.push({ assigneeId: task.assigneeId, assigneeName, reviewerId: task.reviewerId, reviewerName, deadline: task.plannedDeadline, deadlineOverrideReason: payload.deadlineOverrideReason || '', priority: task.priority, note: payload.note || '', assignedBy: actorFrom(context), assignedAt: timestamp });
    task.updatedAt = timestamp;
    appendNotification(state, { createdAt: timestamp, kind: 'TASK_ASSIGNED', title: `Bạn được giao ${task.id}`, body: task.title, entityType: 'task', entityId: task.id, recipients: [task.assigneeId, task.reviewerId] });
    refreshTaskReadiness(state, task.projectId, timestamp);
  });
  appendAudit(state, auditEvent('TASKS_ASSIGNED', `Phân công ${taskIds.length} công việc cho ${assigneeName}.`, context, 'task_batch', taskIds.join(','), {
    taskIds,
    assigneeId: payload.assigneeId || assigneeName,
    assigneeName,
    reviewerId: payload.reviewerId || reviewerName,
    reviewerName,
    activeRole: context.role,
    assignedAt: timestamp,
  }));
}

function assignGroupManager(state, payload, context) {
  const timestamp = nowIso(context);
  const classId = requiredText(payload.classId || payload.classCode, 'Lớp');
  const group = requiredText(payload.group, 'Nhóm việc');
  const managerName = requiredText(payload.managerName, 'Quản lý ekip');
  const classItem = state.classes.find((item) => item.id === classId || item.code === classId);
  if (!classItem) throw domainError('NOT_FOUND', 'Không tìm thấy lớp cần giao Quản lý ekip.');
  const tasks = state.tasks.filter((item) => item.classId === classItem.id && item.group === group && item.status !== 'CANCELLED');
  if (!tasks.length) throw domainError('NOT_FOUND', 'Nhóm việc không có công việc đang hoạt động.');
  tasks.forEach((task) => {
    task.manager = managerName;
    task.managerId = payload.managerId || managerName;
    task.reviewer = managerName;
    task.reviewerId = payload.managerId || managerName;
    task.updatedAt = timestamp;
  });
  appendNotification(state, { createdAt: timestamp, kind: 'GROUP_MANAGER_ASSIGNED', title: `Bạn phụ trách ${group} · ${classItem.code}`, body: `${tasks.length} công việc`, entityType: 'class', entityId: classItem.id, recipients: [payload.managerId || managerName] });
  appendAudit(state, auditEvent('GROUP_MANAGER_ASSIGNED', `Giao ${managerName} phụ trách nhóm ${group} của lớp ${classItem.code}.`, context, 'class_group', `${classItem.id}:${group}`, { taskIds: tasks.map((item) => item.id), managerName }));
}

function startTask(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskAssignee(task, context);
  if (task.status !== 'READY') throw domainError('INVALID_TRANSITION', 'Chỉ công việc Sẵn sàng mới được bắt đầu.');
  task.status = 'IN_PROGRESS';
  task.startedAt = nowIso(context);
  task.updatedAt = task.startedAt;
  appendAudit(state, auditEvent('TASK_STARTED', `${task.id} bắt đầu thực hiện.`, context, 'task', task.id));
}

function updateTaskProgress(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskAssignee(task, context);
  if (!['IN_PROGRESS', 'REWORK'].includes(task.status)) throw domainError('INVALID_TRANSITION', 'Công việc chưa ở trạng thái cho phép cập nhật tiến độ.');
  if (Array.isArray(payload.checklist)) {
    if (payload.checklist.length !== task.checklistItems.length) throw domainError('VALIDATION_ERROR', 'Checklist không khớp cấu hình bắt buộc.');
    task.checklist = payload.checklist.map(Boolean);
    task.checklistLog.push({ checklist: [...task.checklist], actor: actorFrom(context), happenedAt: nowIso(context) });
  }
  if (payload.blocker !== undefined) task.blocker = String(payload.blocker || '').trim();
  task.progress = Math.min(70, Math.round(task.checklist.filter(Boolean).length / Math.max(task.checklist.length, 1) * 70));
  task.updatedAt = nowIso(context);
  appendAudit(state, auditEvent('TASK_PROGRESS_UPDATED', `Cập nhật tiến độ ${task.id} đạt ${task.progress}%.`, context, 'task', task.id, { blocker: task.blocker }));
}

function submitOutput(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskAssignee(task, context);
  if (!['IN_PROGRESS', 'REWORK'].includes(task.status)) throw domainError('INVALID_TRANSITION', 'Công việc chưa ở trạng thái cho phép nộp kết quả.');
  const actualOutput = requiredText(payload.actualOutput, 'Actual Output');
  const evidence = Array.isArray(payload.evidence) ? payload.evidence.filter((item) => item && (item.url || item.fileUrl || item.path || item.id)) : [];
  if (!evidence.length) throw domainError('VALIDATION_ERROR', 'Cần ít nhất một Evidence có thể truy cập.');
  const version = (task.outputs.at(-1)?.version || 0) + 1;
  task.outputs.push({ id: `${task.id}:OUT:v${version}`, version, actualOutput, metrics: payload.metrics || {}, evidence, submittedBy: actorFrom(context), submittedAt: nowIso(context) });
  task.evidence = evidence[0].url || evidence[0].fileUrl || evidence[0].path || evidence[0].id;
  task.progress = Math.max(task.progress, 75);
  task.updatedAt = nowIso(context);
  appendAudit(state, auditEvent('TASK_OUTPUT_SUBMITTED', `Nộp Output/Evidence phiên bản ${version} cho ${task.id}.`, context, 'task', task.id, { version }));
}

function submitReview(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskAssignee(task, context);
  if (!['IN_PROGRESS', 'REWORK'].includes(task.status)) throw domainError('INVALID_TRANSITION', 'Công việc chưa thể gửi duyệt.');
  if (!task.checklist.length || !task.checklist.every(Boolean)) throw domainError('SUBMISSION_NOT_READY', 'Checklist bắt buộc chưa hoàn thành 100%.');
  const output = task.outputs.at(-1);
  if (!output?.evidence?.length) throw domainError('SUBMISSION_NOT_READY', 'Chưa có Output và Evidence hợp lệ.');
  if (!task.reviewerId && !task.reviewer) throw domainError('SUBMISSION_NOT_READY', 'Chưa có người duyệt còn hiệu lực.');
  const timestamp = nowIso(context);
  const submission = { id: `${task.id}:SUB:${task.submissions.length + 1}`, status: 'IN_REVIEW', taskSnapshot: { checklistItems: clone(task.checklistItems), checklist: clone(task.checklist), requiredInputVersions: clone(task.requiredInputVersions), output: clone(output) }, submittedBy: actorFrom(context), submittedAt: timestamp };
  task.submissions.push(submission);
  task.status = 'IN_REVIEW';
  task.progress = 80;
  task.updatedAt = timestamp;
  appendNotification(state, { createdAt: timestamp, kind: 'REVIEW_REQUESTED', title: `${task.id} chờ duyệt`, body: task.title, entityType: 'submission', entityId: submission.id, recipients: [task.reviewerId || task.reviewer] });
  appendAudit(state, auditEvent('TASK_SUBMITTED_FOR_REVIEW', `Tạo phiếu ${submission.id} và khóa snapshot kết quả.`, context, 'submission', submission.id));
}

function reviewTask(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskReviewer(task, context);
  if (task.status !== 'IN_REVIEW') throw domainError('INVALID_TRANSITION', 'Công việc không ở hàng đợi duyệt.');
  const result = String(payload.result || '').toUpperCase();
  if (!['PASS', 'REWORK'].includes(result)) throw domainError('VALIDATION_ERROR', 'Kết quả review phải là PASS hoặc REWORK.');
  const comment = String(payload.comment || '').trim();
  if (result === 'REWORK' && !comment) throw domainError('VALIDATION_ERROR', 'Comment là bắt buộc khi trả lại.');
  const submission = [...task.submissions].reverse().find((item) => item.status === 'IN_REVIEW');
  if (!submission) throw domainError('NOT_FOUND', 'Không tìm thấy phiếu đang chờ duyệt.');
  const timestamp = nowIso(context);
  submission.status = result;
  submission.reviewedAt = timestamp;
  task.reviews.push({ id: `${submission.id}:REV`, submissionId: submission.id, result, comment, reviewer: actorFrom(context), reviewedAt: timestamp });
  task.status = result === 'PASS' ? 'DONE' : 'REWORK';
  task.progress = result === 'PASS' ? 100 : 60;
  task.completedAt = result === 'PASS' ? timestamp : null;
  if (result === 'REWORK') task.rework += 1;
  task.updatedAt = timestamp;
  appendNotification(state, { createdAt: timestamp, kind: result === 'PASS' ? 'TASK_APPROVED' : 'TASK_REWORK', title: `${task.id}: ${result === 'PASS' ? 'Đạt' : 'Cần làm lại'}`, body: comment || 'Kết quả đã được xác nhận.', entityType: 'task', entityId: task.id, recipients: [task.assigneeId || task.assignee] });
  appendAudit(state, auditEvent(result === 'PASS' ? 'TASK_APPROVED' : 'TASK_RETURNED', `${task.id} ${result === 'PASS' ? 'hoàn thành 100%' : `được mở lại lần ${task.rework}`}.`, context, 'task', task.id, { result, comment }));
}

function resolveInputImpact(state, payload, context) {
  const decision = String(payload.decision || '').toUpperCase();
  if (!['CONTINUE', 'REWORK', 'CHANGE_FLOW'].includes(decision)) throw domainError('VALIDATION_ERROR', 'Quyết định impact không hợp lệ.');
  const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds : [payload.taskId];
  taskIds.forEach((id) => {
    const task = findTask(state, id);
    if (!task.inputImpact || task.inputImpact.decision !== 'PENDING') throw domainError('INVALID_TRANSITION', `${task.id} không có impact đang chờ xử lý.`);
    task.inputImpact.decision = decision;
    task.inputImpact.decidedBy = actorFrom(context);
    task.inputImpact.decidedAt = nowIso(context);
    if (decision === 'REWORK') {
      task.status = 'REWORK';
      task.progress = Math.min(task.progress, 60);
      task.rework += 1;
    }
    if (decision === 'CHANGE_FLOW') task.status = 'WAITING_INPUT';
    task.updatedAt = nowIso(context);
  });
  appendAudit(state, auditEvent('INPUT_IMPACT_RESOLVED', `Đã xử lý ${taskIds.length} task bị ảnh hưởng theo quyết định ${decision}.`, context, 'task_batch', taskIds.join(','), { decision, taskIds }));
}

function requestScopeChange(state, payload, context) {
  const timestamp = nowIso(context);
  const project = activeProject(state, payload.projectId);
  const changeType = requiredText(payload.changeType, 'Loại thay đổi');
  const reason = requiredText(payload.reason, 'Lý do thay đổi');
  const request = {
    id: `CR-${String(state.changeRequests.length + 1).padStart(4, '0')}`,
    projectId: project.id,
    status: 'PENDING',
    changeType,
    objectKey: payload.objectKey || '',
    currentScopeVersion: project.scopeVersion,
    proposed: clone(payload.proposed || {}),
    reason,
    effectiveAt: payload.effectiveAt || timestamp,
    impact: { createTaskCount: Number(payload.impact?.createTaskCount || 0), cancelTaskCount: Number(payload.impact?.cancelTaskCount || 0), keepTaskCount: state.tasks.filter((item) => item.projectId === project.id).length, affectedTaskIds: payload.impact?.affectedTaskIds || [] },
    requestedBy: actorFrom(context),
    requestedAt: timestamp,
  };
  state.changeRequests.push(request);
  appendNotification(state, { createdAt: timestamp, kind: 'SCOPE_CHANGE_REQUESTED', title: `${request.id} chờ phê duyệt`, body: reason, entityType: 'change_request', entityId: request.id, recipients: ['operations'] });
  appendAudit(state, auditEvent('SCOPE_CHANGE_REQUESTED', `Tạo ${request.id}: ${reason}. Chưa sinh hoặc hủy task.`, context, 'change_request', request.id, { impact: request.impact }));
}

function approveScopeChange(state, payload, context) {
  const timestamp = nowIso(context);
  const request = state.changeRequests.find((item) => item.id === payload.changeRequestId);
  if (!request) throw domainError('NOT_FOUND', 'Không tìm thấy yêu cầu thay đổi.');
  if (request.status !== 'PENDING') throw domainError('INVALID_TRANSITION', 'Yêu cầu thay đổi đã được xử lý.');
  const project = activeProject(state, request.projectId);
  if (request.changeType !== 'quantity') {
    request.status = 'APPROVED';
    request.approvedBy = actorFrom(context);
    request.approvedAt = timestamp;
    appendNotification(state, { createdAt: timestamp, kind: 'INPUT_CHANGE_APPROVED', title: `${request.id} đã được duyệt`, body: 'Người sở hữu input có thể tạo phiên bản mới; scope hiện tại không thay đổi.', entityType: 'change_request', entityId: request.id, recipients: [TRAINING_INPUT_DEFINITIONS[request.objectKey]?.ownerRole || 'operations'] });
    appendAudit(state, auditEvent('INPUT_CHANGE_APPROVED', `Duyệt ${request.id} để cập nhật input; không tạo Scope mới.`, context, 'change_request', request.id, { scopeVersion: project.scopeVersion }));
    return;
  }
  const previousScope = activeScope(state, project.id);
  const nextScope = clone(previousScope);
  nextScope.version = previousScope.version + 1;
  nextScope.createdAt = timestamp;
  nextScope.changeRequestId = request.id;
  const objectKey = request.objectKey;
  if (request.changeType === 'quantity') {
    const inputDefinition = TRAINING_INPUT_DEFINITIONS[objectKey];
    if (!inputDefinition) throw domainError('VALIDATION_ERROR', 'Đối tượng thay đổi số lượng không hợp lệ.');
    const contentKey = ({ game: 'GAMIFICATION', discussion: 'DISCUSSION', assignment: 'ASSIGNMENT', test: 'TEST', material: 'MATERIAL', vlearning: 'VLEARNING' })[objectKey];
    const currentCount = Number(nextScope.instanceCount[contentKey] || 0);
    const nextCount = Math.max(0, Number(request.proposed.nextCount));
    if (!Number.isInteger(nextCount)) throw domainError('VALIDATION_ERROR', 'Số lượng mới phải là số nguyên không âm.');
    nextScope.instanceCount[contentKey] = nextCount;
    const template = taskTemplateByInputKey(objectKey);
    if (template && nextCount > currentCount) {
      const classes = state.classes.filter((item) => item.projectId === project.id);
      classes.forEach((classItem, classIndex) => {
        for (let index = currentCount; index < nextCount; index += 1) {
          const task = createTasksForClass(project.id, classItem.courseId, classItem, classIndex, timestamp).find((item) => item.templateId === template.code);
          task.id = `${classItem.code}-${template.code}-I${index + 1}`;
          task.title = `${template.title} ${String(index + 1).padStart(2, '0')}`;
          state.tasks.push(task);
        }
      });
    }
    if (template && nextCount < currentCount) {
      let remaining = (currentCount - nextCount) * state.classes.filter((item) => item.projectId === project.id).length;
      [...state.tasks].reverse().forEach((task) => {
        if (remaining > 0 && task.projectId === project.id && task.input === objectKey && !['DONE', 'IN_PROGRESS', 'IN_REVIEW'].includes(task.status)) {
          task.status = 'CANCELLED';
          task.cancelledByChangeRequestId = request.id;
          task.updatedAt = timestamp;
          remaining -= 1;
        }
      });
      if (remaining > 0) throw domainError('SCOPE_CHANGE_CONFLICT', 'Không thể hủy task đã bắt đầu; cần điều chỉnh impact trước khi duyệt.', { remaining });
    }
  }
  state.scopes.push(nextScope);
  project.scopeVersion = nextScope.version;
  project.updatedAt = timestamp;
  request.status = 'APPROVED';
  request.approvedBy = actorFrom(context);
  request.approvedAt = timestamp;
  refreshTaskReadiness(state, project.id, timestamp);
  appendAudit(state, auditEvent('SCOPE_CHANGE_APPROVED', `Duyệt ${request.id}; tạo Scope v${nextScope.version} và giữ nguyên lịch sử task.`, context, 'change_request', request.id, { scopeVersion: nextScope.version }));
}

export function applyTrainingOperationsCommand(currentState, command, context = {}) {
  if (!currentState || typeof currentState !== 'object' || Array.isArray(currentState)) throw domainError('INVALID_STATE', 'Training Operations state không hợp lệ.');
  const type = requiredText(command?.type, 'Loại lệnh').toUpperCase();
  const role = String(context.role || 'member');
  assertTrainingOperationsCommandRole(type, role);
  const state = clone(currentState);
  const payload = command?.payload || {};
  switch (type) {
    case 'CREATE_PROJECT': createProject(state, payload, { ...context, role }); break;
    case 'CLONE_CLASS': cloneClass(state, payload, { ...context, role }); break;
    case 'CREATE_CLASS_TASK': createClassTask(state, payload, { ...context, role }); break;
    case 'UPDATE_TASK_CONFIG': updateTaskConfig(state, payload, { ...context, role }); break;
    case 'ARCHIVE_TASK': archiveTask(state, payload, { ...context, role }); break;
    case 'SUBMIT_INPUT': submitInput(state, payload, { ...context, role }, false); break;
    case 'SUBMIT_INPUT_VERSION': submitInput(state, payload, { ...context, role }, true); break;
    case 'ASSIGN_TASKS': assignTasks(state, payload, { ...context, role }); break;
    case 'ASSIGN_GROUP_MANAGER': assignGroupManager(state, payload, { ...context, role }); break;
    case 'START_TASK': startTask(state, payload, { ...context, role }); break;
    case 'UPDATE_TASK_PROGRESS': updateTaskProgress(state, payload, { ...context, role }); break;
    case 'SUBMIT_OUTPUT': submitOutput(state, payload, { ...context, role }); break;
    case 'SUBMIT_REVIEW': submitReview(state, payload, { ...context, role }); break;
    case 'REVIEW_TASK': reviewTask(state, payload, { ...context, role }); break;
    case 'RESOLVE_INPUT_IMPACT': resolveInputImpact(state, payload, { ...context, role }); break;
    case 'REQUEST_SCOPE_CHANGE': requestScopeChange(state, payload, { ...context, role }); break;
    case 'APPROVE_SCOPE_CHANGE': approveScopeChange(state, payload, { ...context, role }); break;
    default: throw domainError('UNKNOWN_COMMAND', `Lệnh ${type} chưa được hỗ trợ.`);
  }
  state.schemaVersion = 1;
  return state;
}

export function summarizeTrainingOperationsState(state) {
  return {
    projects: state?.projects?.length || 0,
    courses: state?.courses?.length || 0,
    classes: state?.classes?.length || 0,
    inputs: state?.inputs?.length || 0,
    tasks: state?.tasks?.length || 0,
    changeRequests: state?.changeRequests?.length || 0,
    auditEvents: state?.auditEvents?.length || 0,
  };
}

export const TRAINING_OPERATIONS_STATE_ID = 'default';

export const TRAINING_INPUT_DEFINITIONS = Object.freeze({
  roster: { code: 'D03', title: 'Lớp & học viên', ownerRole: 'intake', scopeLevel: 'class' },
  vlearning: { code: 'D04', title: 'Nội dung VLearning', ownerRole: 'content', scopeLevel: 'course', activity: 'VLEARNING' },
  game: { code: 'D05', title: 'Gamification', ownerRole: 'content', scopeLevel: 'course', activity: 'GAMIFICATION' },
  discussion: { code: 'D06', title: 'Thảo luận', ownerRole: 'content', scopeLevel: 'course', activity: 'DISCUSSION' },
  assignment: { code: 'D07', title: 'Thu hoạch', ownerRole: 'content', scopeLevel: 'course', activity: 'ASSIGNMENT' },
  test: { code: 'D08', title: 'Kiểm tra', ownerRole: 'content', scopeLevel: 'course', activity: 'TEST' },
  material: { code: 'D09', title: 'Nguồn tài liệu VTraining', ownerRole: 'content', scopeLevel: 'course', activity: 'VTRAINING' },
});

export const TRAINING_COURSE_ROLES = Object.freeze(['intake', 'content', 'vtraining', 'manager', 'member']);

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
  { group: 'live', code: 'T-110', title: 'Mở phát hành các hoạt động', inputKey: 'roster', dueOffset: 0, dependsOnGroups: ['setup'], checklist: ['Phát hành Thảo luận', 'Phát hành Ứng dụng học tập số', 'Phát hành Kiểm tra và Thu hoạch', 'Tài khoản học viên thấy các bài'] },
  { group: 'live', code: 'T-111', title: 'Xem kết quả các hoạt động', inputKey: 'roster', dueOffset: 0, dependsOnTemplates: ['T-110'], checklist: ['Xem kết quả Thảo luận', 'Xem kết quả Ứng dụng học tập số', 'Xem kết quả Kiểm tra', 'Xem kết quả Thu hoạch'] },
]);

export const TRAINING_DEFAULT_CLASSES = Object.freeze([
  { id: 'TNKH01', code: 'TNKH01', courseId: 'CX-FOUNDATION', name: 'Lớp 01 · CSKH EVNSPC', startDate: '2026-09-01', endDate: '2026-09-05', cloneFrom: 'CLASS_TEMPLATE', status: 'PREPARING' },
  { id: 'TNKH02', code: 'TNKH02', courseId: 'CX-FOUNDATION', name: 'Lớp 02 · CSKH EVNSPC', startDate: '2026-09-08', endDate: '2026-09-12', cloneFrom: 'CLASS_TEMPLATE', status: 'PREPARING' },
  { id: 'TNKH03', code: 'TNKH03', courseId: 'CX-FOUNDATION', name: 'Lớp 03 · CSKH EVNSPC', startDate: '2026-09-15', endDate: '2026-09-19', cloneFrom: 'CLASS_TEMPLATE', status: 'PREPARING' },
]);

const COMMAND_ROLES = Object.freeze({
  CREATE_PROJECT: ['operations', 'admin'],
  CREATE_PROJECT_BUNDLE: ['operations', 'admin'],
  CREATE_COURSE: ['operations', 'admin'],
  COPY_COURSE_CONFIG: ['operations', 'admin'],
  ASSIGN_COURSE_ROLE: ['operations', 'admin'],
  REMOVE_COURSE_ROLE: ['operations', 'admin'],
  UPDATE_COURSE_STATUS: ['operations', 'manager', 'admin'],
  UPDATE_COURSE_TEMPLATE: ['operations', 'manager', 'admin'],
  UPDATE_CLASS_STATUS: ['operations', 'manager', 'admin'],
  CLONE_CLASS: ['operations', 'admin'],
  CREATE_CLASS_TASK: ['operations', 'vtraining', 'manager', 'admin'],
  UPDATE_TASK_CONFIG: ['operations', 'vtraining', 'manager', 'admin'],
  MOVE_CLASS_TASK: ['operations', 'vtraining', 'manager', 'admin'],
  ARCHIVE_TASK: ['operations', 'vtraining', 'manager', 'admin'],
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
  APPROVE_SCOPE_CHANGE: ['manager', 'operations', 'admin'],
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

function createInputRecords(projectId, courseId, scope, classes, timestamp) {
  const requiredCodes = new Set(selectedInputCodes(scope));
  const courseInputs = Object.entries(TRAINING_INPUT_DEFINITIONS).filter(([, definition]) => definition.scopeLevel === 'course').map(([key, definition]) => ({
    id: `${courseId}:${definition.code}`,
    projectId,
    courseId,
    classId: null,
    scopeLevel: 'course',
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
  const classInputs = classes.flatMap((classItem) => Object.entries(TRAINING_INPUT_DEFINITIONS).filter(([, definition]) => definition.scopeLevel === 'class').map(([key, definition]) => ({
    id: `${classItem.id}:${definition.code}`,
    projectId,
    courseId,
    classId: classItem.id,
    scopeLevel: 'class',
    key,
    dataCode: definition.code,
    title: definition.title,
    ownerRole: definition.ownerRole,
    required: true,
    status: 'MISSING',
    activeVersion: 0,
    versions: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  })));
  return [...courseInputs, ...classInputs];
}

function taskRequiredInputs(template) {
  const code = TRAINING_INPUT_DEFINITIONS[template.inputKey]?.code || 'D03';
  return code === 'D03' ? ['D03'] : ['D03', code];
}

function normalizeTaskTemplates(overrides) {
  if (!Array.isArray(overrides)) return TRAINING_TASK_TEMPLATES;
  const byCode = new Map(overrides.map((item) => [String(item?.code || '').toUpperCase(), item]));
  return TRAINING_TASK_TEMPLATES.flatMap((template) => {
    const override = byCode.get(template.code);
    if (override?.enabled === false) return [];
    if (!override) return [template];
    const checklist = Array.isArray(override.checklist)
      ? override.checklist.map((item) => String(item || '').trim()).filter(Boolean)
      : template.checklist;
    if (!checklist.length) throw domainError('VALIDATION_ERROR', `${template.code} cần ít nhất một tiêu chí checklist.`);
    return [{
      ...template,
      title: String(override.title || template.title).trim() || template.title,
      dueOffset: Math.max(0, Number(override.dueOffset ?? template.dueOffset) || 0),
      checklist,
    }];
  });
}

function createTasksForClass(projectId, courseId, classItem, classIndex, timestamp, selectedContents = [], templateOverrides) {
  const requiredCodes = new Set(selectedInputCodes({ selectedContents }));
  const templates = normalizeTaskTemplates(templateOverrides).filter((template) => template.inputKey === 'roster' || requiredCodes.has(TRAINING_INPUT_DEFINITIONS[template.inputKey]?.code));
  const taskScopePrefix = String(classItem.code).startsWith(`${courseId}-`) ? classItem.code : `${courseId}-${classItem.code}`;
  const taskIdByTemplate = new Map(templates.map((template) => [template.code, `${taskScopePrefix}-${template.code}`]));
  return templates.map((template, templateIndex) => ({
    id: `${taskScopePrefix}-${template.code}`,
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
    dependsOnTaskIds: templates.filter((candidate) => template.dependsOnGroups?.includes(candidate.group)).map((candidate) => taskIdByTemplate.get(candidate.code))
      .concat((template.dependsOnTemplates || []).map((code) => taskIdByTemplate.get(code)).filter(Boolean)),
    blockingInputCodes: taskRequiredInputs(template),
    blockingTaskIds: [],
    dueOffset: template.dueOffset,
    dueDirection: 'BEFORE',
    anchorType: 'CLASS_START',
    deadlineStatus: 'INACTIVE',
    slaStartedAt: null,
    status: 'WAITING_INPUT',
    manager: 'Chưa giao',
    assignee: 'Chưa giao',
    assigneeId: null,
    reviewer: 'Chưa giao',
    reviewerId: null,
    priority: 'Normal',
    checklistItems: [...template.checklist],
    checklist: template.checklist.map(() => false),
    checklistEvidence: template.checklist.map(() => []),
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
    courseId,
    version: 1,
    selectedContents: ['VTRAINING', 'VLEARNING', 'GAMIFICATION', 'DISCUSSION', 'ASSIGNMENT', 'TEST'],
    instanceCount: { VLEARNING: 1, GAMIFICATION: 2, DISCUSSION: 2, ASSIGNMENT: 1, TEST: 1, MATERIAL: 4 },
    createdAt: timestamp,
  };
  const classes = TRAINING_DEFAULT_CLASSES.map((item) => ({ ...item, projectId }));
  const tasks = classes.flatMap((classItem, index) => createTasksForClass(projectId, courseId, classItem, index, timestamp, scope.selectedContents));
  const state = {
    schemaVersion: 3,
    activeProjectId: projectId,
    projects: [{ id: projectId, code: projectId, name: 'Đào tạo Trải nghiệm khách hàng EVNSPC 2026', customerId: 'EVNSPC', customerName: 'EVNSPC', startDate: '2026-09-01', deadline: '2026-09-30', classCount: 3, teamId: 'VTRAINING-SOUTH', status: 'PREPARING', scopeVersion: 1, createdAt: timestamp, updatedAt: timestamp }],
    courses: [{ id: courseId, projectId, code: courseId, name: 'Trải nghiệm khách hàng', systems: ['VTraining', 'VLearning'], activities: scope.selectedContents, contentVersion: '2026-v1', status: 'DECLARED', startDate: classes.map((item) => item.startDate).sort()[0], endDate: classes.map((item) => item.endDate).sort().at(-1), templateVersion: 1, templateRecommendations: [], createdAt: timestamp, updatedAt: timestamp }],
    classes,
    scopes: [scope],
    inputs: createInputRecords(projectId, courseId, scope, classes, timestamp),
    teamAssignments: [],
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

function courseScope(state, courseId) {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return null;
  return [...state.scopes]
    .filter((item) => item.courseId === courseId || (!item.courseId && item.projectId === course.projectId))
    .sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0] || null;
}

function scopedClassCode(courseCode, rawCode) {
  const courseToken = String(courseCode || '').trim().toUpperCase();
  const classToken = requiredText(rawCode, 'Mã lớp').toUpperCase();
  return classToken.startsWith(`${courseToken}-`) ? classToken : `${courseToken}-${classToken}`;
}

/**
 * Upgrades legacy payloads in memory. Reading old state never writes or merges
 * production data; persistence only happens through an explicit command.
 */
  export function normalizeTrainingOperationsState(currentState, context = {}) {
  if (!currentState || typeof currentState !== 'object' || Array.isArray(currentState)) {
    throw domainError('INVALID_STATE', 'Training Operations state không hợp lệ.');
  }
  const state = clone(currentState);
  const timestamp = nowIso(context);
  for (const key of ['projects', 'courses', 'classes', 'scopes', 'inputs', 'teamAssignments', 'tasks', 'changeRequests', 'notifications', 'auditEvents']) {
    if (!Array.isArray(state[key])) state[key] = [];
  }
  state.courses = state.courses.map((course) => {
    const classes = state.classes.filter((item) => item.courseId === course.id);
    const scope = courseScope(state, course.id);
    return {
      activities: clone(course.activities || scope?.selectedContents || []),
      status: course.status || 'DECLARED',
      startDate: course.startDate || classes.map((item) => item.startDate).filter(Boolean).sort()[0] || null,
      endDate: course.endDate || classes.map((item) => item.endDate).filter(Boolean).sort().at(-1) || null,
      templateVersion: Number(course.templateVersion || 1),
      templateRecommendations: clone(course.templateRecommendations || []),
      ...course,
    };
  });
  state.scopes = state.scopes.map((scope) => ({
    ...scope,
    courseId: scope.courseId || (state.courses.filter((item) => item.projectId === scope.projectId).length === 1
      ? state.courses.find((item) => item.projectId === scope.projectId)?.id || null
      : null),
  }));
  if (Number(state.schemaVersion || 1) < 2 || state.inputs.some((item) => !item.scopeLevel || !item.courseId)) {
    const legacyInputs = state.inputs;
    const rebuilt = [];
    state.courses.forEach((course) => {
      const classes = state.classes.filter((item) => item.courseId === course.id);
      const scope = courseScope(state, course.id) || { selectedContents: course.activities || [] };
      createInputRecords(course.projectId, course.id, scope, classes, timestamp).forEach((fresh) => {
        const projectCourseCount = state.courses.filter((item) => item.projectId === course.projectId).length;
        const legacy = legacyInputs.find((item) => item.projectId === course.projectId && item.dataCode === fresh.dataCode
          && (fresh.classId
            ? item.classId === fresh.classId
            : item.courseId === course.id || (!item.courseId && projectCourseCount === 1)));
        rebuilt.push(legacy ? {
          ...fresh,
          status: legacy.status || fresh.status,
          activeVersion: Number(legacy.activeVersion || 0),
          versions: clone(legacy.versions || []),
          createdAt: legacy.createdAt || fresh.createdAt,
          updatedAt: legacy.updatedAt || fresh.updatedAt,
        } : fresh);
      });
    });
    state.inputs = rebuilt;
    state.legacyUnscopedInputs = clone(legacyInputs.filter((legacy) => !rebuilt.some((item) => item.id === legacy.id || item.versions?.some((version) => legacy.versions?.some((legacyVersion) => legacyVersion.id === version.id)))));
  }
  state.inputs = state.inputs.map((input) => {
    const definition = inputDefinitionByCode(input.dataCode)?.[1];
    return definition ? { ...input, title: definition.title, ownerRole: definition.ownerRole } : input;
  });
  state.tasks = state.tasks.map((task, taskIndex) => ({
    ...task,
    scopeLevel: task.scopeLevel || 'class',
    dependsOnTaskIds: Array.isArray(task.dependsOnTaskIds) ? task.dependsOnTaskIds : task.templateId === 'T-110'
      ? state.tasks.filter((item) => item.classId === task.classId && item.group === 'setup' && item.status !== 'CANCELLED').map((item) => item.id)
      : task.templateId === 'T-111'
        ? state.tasks.filter((item) => item.classId === task.classId && item.templateId === 'T-110').map((item) => item.id)
        : [],
    blockingInputCodes: Array.isArray(task.blockingInputCodes) ? task.blockingInputCodes : clone(task.requiredInputCodes || []),
    blockingTaskIds: Array.isArray(task.blockingTaskIds) ? task.blockingTaskIds : [],
    sortOrder: Number.isFinite(Number(task.sortOrder)) ? Number(task.sortOrder) : taskIndex,
    checklistEvidence: Array.isArray(task.checklistEvidence)
      ? task.checklistItems.map((_, index) => clone(task.checklistEvidence[index] || []))
      : task.checklistItems.map(() => []),
  }));
  state.tasks.filter((task) => task.assigneeId && task.assignee !== 'Chưa giao' && task.status !== 'CANCELLED').forEach((task) => {
    const assigneeTokens = new Set([task.assigneeId, task.assignee].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
    const existing = state.teamAssignments.find((item) => item.courseId === task.courseId && item.role === 'member'
      && [item.accountId, item.accountEmail, item.accountName].some((item) => assigneeTokens.has(String(item || '').trim().toLowerCase())));
    if (!existing) state.teamAssignments.push({
      id: `${task.courseId}:member:${task.assigneeId}`,
      projectId: task.projectId,
      courseId: task.courseId,
      role: 'member',
      accountId: task.assigneeId,
      accountName: task.assignee,
      accountEmail: String(task.assigneeId).includes('@') ? task.assigneeId : '',
      status: 'ACTIVE',
      assignedAt: task.assignmentHistory?.at(-1)?.assignedAt || task.updatedAt || timestamp,
      updatedAt: task.updatedAt || timestamp,
      derivedFromTask: true,
    });
  });
  state.tasks.filter((task) => !['DONE', 'CANCELLED'].includes(task.status)).forEach((task) => {
    const assignmentsForIdentity = (role, ...values) => state.teamAssignments.filter((item) => item.courseId === task.courseId && item.role === role
      && actorMatches({ actor: { id: item.accountId, email: item.accountEmail, name: item.accountName } }, ...values));
    const memberAssignments = assignmentsForIdentity('member', task.assigneeId, task.assignee);
    if (task.assigneeId && memberAssignments.some((item) => item.status === 'ARCHIVED') && !memberAssignments.some((item) => item.status !== 'ARCHIVED')) {
      task.assignee = 'Chưa giao';
      task.assigneeId = null;
      markTaskForReassignment(task, 'COURSE_MEMBER_REMOVED', timestamp);
    }
    const managerAssignments = assignmentsForIdentity('manager', task.managerId, task.manager, task.reviewerId, task.reviewer);
    if ((task.managerId || task.reviewerId) && managerAssignments.some((item) => item.status === 'ARCHIVED') && !managerAssignments.some((item) => item.status !== 'ARCHIVED')) {
      task.manager = 'Chưa giao';
      task.managerId = null;
      task.reviewer = 'Chưa giao';
      task.reviewerId = null;
      markTaskForReassignment(task, 'COURSE_MANAGER_REMOVED', timestamp);
    }
  });
  state.schemaVersion = 3;
  return state;
}

function markTaskForReassignment(task, reason, timestamp, unassignedBy = null) {
  const resumeStatus = task.resumeStatus || task.status;
  const wasInFlight = task.assignmentStatus === 'NEEDS_REASSIGNMENT' || ['IN_PROGRESS', 'IN_REVIEW', 'REWORK'].includes(resumeStatus);
  task.resumeStatus = resumeStatus;
  task.status = wasInFlight ? 'NEEDS_REASSIGNMENT' : 'UNASSIGNED';
  task.assignmentStatus = wasInFlight ? 'NEEDS_REASSIGNMENT' : 'UNASSIGNED';
  task.assignmentReason = reason;
  task.waitingReason = 'ASSIGNMENT';
  if (!wasInFlight) {
    task.deadlineStatus = 'INACTIVE';
    task.slaStartedAt = null;
  }
  task.unassignedAt = task.unassignedAt || timestamp;
  task.unassignedBy = unassignedBy || task.unassignedBy || null;
  task.updatedAt = timestamp;
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

function findInput(state, payload) {
  const token = String(payload.inputId || payload.inputKey || payload.dataCode || '').trim();
  const item = state.inputs.find((input) => {
    const tokenMatches = input.id === token || input.key === token || input.dataCode === token;
    return tokenMatches
      && (!payload.projectId || input.projectId === payload.projectId)
      && (!payload.courseId || input.courseId === payload.courseId)
      && (!payload.classId || input.classId === payload.classId);
  });
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
    if (!files.length) errors.push('Cần đính kèm file danh sách học viên.');
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
    const validClassIds = new Set(state.classes.filter((item) => item.courseId === input.courseId).map((item) => item.id));
    if (!files.length && !String(data.material_link || data.materialLink || '').trim()) errors.push('D09 cần file hoặc link tài liệu.');
    if (!classIds.length || classIds.some((id) => !validClassIds.has(id))) errors.push('D09 phải gắn đúng ít nhất một lớp thuộc dự án.');
    const visibleFrom = String(data.visible_from || data.visibleFrom || '');
    const visibleTo = String(data.visible_to || data.visibleTo || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(visibleFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(visibleTo) || visibleTo < visibleFrom) errors.push('D09 cần khoảng thời gian hiển thị hợp lệ.');
  } else if (!Object.keys(data).length && !files.length) {
    errors.push(`Cần nhập dữ liệu hoặc đính kèm file cho ${input.dataCode}.`);
  }
  if (input.dataCode !== 'D03' && payload?.validation?.errors?.length) errors.push(...payload.validation.errors.map(String));
  if (errors.length) throw domainError('INPUT_VALIDATION_FAILED', 'Input chưa hợp lệ.', { errors });
  return { data, files, validation: { valid: true, errors: [], warnings: payload?.validation?.warnings || [] } };
}

function refreshTaskReadiness(state, projectId, timestamp) {
  state.tasks.forEach((task) => {
    if (task.projectId !== projectId || ['DONE', 'CANCELLED', 'IN_REVIEW', 'IN_PROGRESS', 'REWORK', 'UNASSIGNED', 'NEEDS_REASSIGNMENT'].includes(task.status)) return;
    const inputs = state.inputs.filter((item) => item.projectId === projectId && item.status === 'ACTIVE'
      && (item.scopeLevel === 'course' ? item.courseId === task.courseId : item.classId === task.classId));
    const versions = Object.fromEntries(inputs.map((item) => [item.dataCode, item.activeVersion]));
    const blockingInputCodes = task.requiredInputCodes.filter((code) => Number(versions[code] || 0) <= 0);
    const blockingTaskIds = (task.dependsOnTaskIds || []).filter((id) => {
      const dependency = state.tasks.find((item) => item.id === id);
      return dependency && !['DONE', 'CANCELLED'].includes(dependency.status);
    });
    const assigned = Boolean(task.assigneeId) && Boolean(task.reviewerId);
    task.requiredInputVersions = Object.fromEntries(task.requiredInputCodes.filter((code) => versions[code]).map((code) => [code, versions[code]]));
    task.blockingInputCodes = blockingInputCodes;
    task.blockingTaskIds = blockingTaskIds;
    task.waitingReason = blockingInputCodes.length ? 'INPUT' : !assigned ? 'ASSIGNMENT' : blockingTaskIds.length ? 'DEPENDENCY' : null;
    const ready = !blockingInputCodes.length && assigned && !blockingTaskIds.length;
    task.status = ready ? 'READY' : 'WAITING_INPUT';
    task.deadlineStatus = ready ? 'ACTIVE' : 'INACTIVE';
    task.slaStartedAt = ready ? (task.slaStartedAt || timestamp) : null;
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
  const input = findInput(state, { ...payload, projectId: project.id });
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
  const affectedTaskIds = state.tasks.filter((task) => task.projectId === project.id
    && task.requiredInputCodes.includes(input.dataCode)
    && (input.scopeLevel === 'course' ? task.courseId === input.courseId : task.classId === input.classId)
    && !['CANCELLED'].includes(task.status)).map((task) => task.id);
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
  const scope = { projectId, courseId, version: 1, selectedContents, instanceCount: payload.scope?.instanceCount || {}, createdAt: timestamp };
  const normalizedClasses = classRows.map((item, index) => {
    const classId = scopedClassCode(courseId, item.id || item.code);
    const classStart = dateText(item.startDate, `Ngày bắt đầu lớp ${index + 1}`);
    const classEnd = dateText(item.endDate, `Ngày kết thúc lớp ${index + 1}`);
    if (classEnd < classStart) throw domainError('VALIDATION_ERROR', `Ngày kết thúc lớp ${classId} không hợp lệ.`);
    return { id: classId, code: classId, projectId, courseId, name: requiredText(item.name, `Tên lớp ${index + 1}`), startDate: classStart, endDate: classEnd, cloneFrom: item.cloneFrom || 'CLASS_TEMPLATE', status: 'PREPARING', createdAt: timestamp, updatedAt: timestamp };
  });
  if (new Set(normalizedClasses.map((item) => item.id)).size !== normalizedClasses.length) throw domainError('DUPLICATE_CLASS', 'Mã lớp trong khóa học không được trùng nhau.');
  state.projects.push({ id: projectId, code: projectId, name, customerId, customerName: project.customerName || customerId, startDate, deadline, classCount, teamId: project.teamId || '', status: 'PREPARING', scopeVersion: 1, createdAt: timestamp, updatedAt: timestamp });
  state.courses.push({ id: courseId, projectId, code: courseId, name: requiredText(course.name, 'Tên khóa học'), systems, activities: selectedContents, contentVersion: course.contentVersion || 'v1', status: 'DECLARED', startDate: normalizedClasses.map((item) => item.startDate).sort()[0], endDate: normalizedClasses.map((item) => item.endDate).sort().at(-1), templateVersion: 1, templateRecommendations: [], createdAt: timestamp, updatedAt: timestamp });
  state.classes.push(...normalizedClasses);
  state.scopes.push(scope);
  state.inputs.push(...createInputRecords(projectId, courseId, scope, normalizedClasses, timestamp));
  state.tasks.push(...normalizedClasses.flatMap((item, index) => createTasksForClass(projectId, courseId, item, index, timestamp, selectedContents, payload.taskTemplates)));
  state.activeProjectId = projectId;
  appendAudit(state, auditEvent('PROJECT_CREATED', `Tạo dự án ${projectId}, khóa học ${courseId} và ${classCount} lớp; sinh công việc cấp lớp ở trạng thái Chờ input.`, context, 'project', projectId, { courseId, classCount, scopeVersion: 1 }));
}

function createCourse(state, payload, context) {
  const timestamp = nowIso(context);
  const project = activeProject(state, payload.projectId);
  const course = payload.course || {};
  const courseId = requiredText(course.id || course.code, 'Mã khóa học').toUpperCase();
  if (state.courses.some((item) => item.id === courseId)) throw domainError('DUPLICATE_COURSE', 'Mã khóa học đã tồn tại.');
  const sourceCourse = payload.copyFromCourseId ? state.courses.find((item) => item.id === payload.copyFromCourseId && item.projectId === project.id) : null;
  if (payload.copyFromCourseId && !sourceCourse) throw domainError('NOT_FOUND', 'Không tìm thấy khóa nguồn trong cùng dự án để nhân bản.');
  const classRows = Array.isArray(payload.classes) ? payload.classes : [];
  if (!classRows.length) throw domainError('VALIDATION_ERROR', 'Khóa học cần ít nhất một lớp.');
  const sourceScope = sourceCourse ? courseScope(state, sourceCourse.id) : null;
  const selectedContents = [...new Set((sourceCourse?.activities || payload.scope?.selectedContents || course.activities || []).map((item) => String(item).toUpperCase()))];
  const systems = clone(sourceCourse?.systems || course.systems || []);
  const sourceClassId = sourceCourse ? state.classes.find((item) => item.courseId === sourceCourse.id)?.id : null;
  const sourceTaskTemplates = sourceCourse ? state.tasks.filter((item) => item.classId === sourceClassId).map((item) => ({
    code: item.templateId,
    title: item.title,
    dueOffset: item.dueOffset,
    enabled: item.status !== 'CANCELLED',
    checklist: clone(item.checklistItems || []),
  })) : payload.taskTemplates;
  const classes = classRows.map((item, index) => {
    const classId = scopedClassCode(courseId, item.id || item.code || `L${index + 1}`);
    if (state.classes.some((existing) => existing.id === classId)) throw domainError('DUPLICATE_CLASS', `Mã lớp ${classId} đã tồn tại.`);
    const startDate = dateText(item.startDate, `Ngày bắt đầu lớp ${index + 1}`);
    const endDate = dateText(item.endDate, `Ngày kết thúc lớp ${index + 1}`);
    if (endDate < startDate) throw domainError('VALIDATION_ERROR', `Ngày kết thúc lớp ${classId} không hợp lệ.`);
    return { id: classId, code: classId, projectId: project.id, courseId, name: requiredText(item.name, `Tên lớp ${index + 1}`), startDate, endDate, cloneFrom: item.cloneFrom || 'CLASS_TEMPLATE', status: 'PREPARING', createdAt: timestamp, updatedAt: timestamp };
  });
  if (new Set(classes.map((item) => item.id)).size !== classes.length) throw domainError('DUPLICATE_CLASS', 'Mã lớp trong khóa học không được trùng nhau.');
  const scope = { projectId: project.id, courseId, version: 1, selectedContents, instanceCount: clone(sourceScope?.instanceCount || payload.scope?.instanceCount || {}), createdAt: timestamp };
  state.courses.push({ id: courseId, code: courseId, projectId: project.id, name: requiredText(course.name, 'Tên khóa học'), systems, activities: selectedContents, contentVersion: sourceCourse?.contentVersion || course.contentVersion || 'v1', status: 'DECLARED', startDate: classes.map((item) => item.startDate).sort()[0], endDate: classes.map((item) => item.endDate).sort().at(-1), templateVersion: Number(sourceCourse?.templateVersion || 1), templateRecommendations: [], copiedFromCourseId: sourceCourse?.id || null, copiedAt: sourceCourse ? timestamp : null, createdAt: timestamp, updatedAt: timestamp });
  state.classes.push(...classes);
  state.scopes.push(scope);
  state.inputs.push(...createInputRecords(project.id, courseId, scope, classes, timestamp));
  state.tasks.push(...classes.flatMap((item, index) => createTasksForClass(project.id, courseId, item, index, timestamp, selectedContents, sourceTaskTemplates)));
  project.classCount = state.classes.filter((item) => item.projectId === project.id).length;
  project.updatedAt = timestamp;
  appendAudit(state, auditEvent(sourceCourse ? 'COURSE_DUPLICATED' : 'COURSE_CREATED', `${sourceCourse ? `Nhân bản cấu hình khóa ${sourceCourse.id} thành` : 'Tạo khóa'} ${courseId} với ${classes.length} lớp trong dự án ${project.id}.`, context, 'course', courseId, sourceCourse ? { sourceCourseId: sourceCourse.id } : {}));
}

function createProjectBundle(state, payload, context) {
  const additionalCourses = Array.isArray(payload.additionalCourses) ? payload.additionalCourses : [];
  createProject(state, payload, context);
  additionalCourses.forEach((coursePayload) => createCourse(state, { projectId: payload.project?.id || payload.project?.code, ...coursePayload }, context));
  appendAudit(state, auditEvent('PROJECT_BUNDLE_CREATED', `Hoàn tất khởi tạo dự án và ${additionalCourses.length + 1} khóa học trong một giao dịch.`, context, 'project', payload.project?.id || payload.project?.code, { courseCount: additionalCourses.length + 1 }));
}

function copyCourseConfig(state, payload, context) {
  const timestamp = nowIso(context);
  const source = state.courses.find((item) => item.id === payload.sourceCourseId);
  const target = state.courses.find((item) => item.id === payload.targetCourseId);
  if (!source || !target || source.projectId !== target.projectId) throw domainError('NOT_FOUND', 'Không tìm thấy khóa nguồn/đích trong cùng dự án.');
  target.activities = clone(source.activities || []);
  target.systems = clone(source.systems || []);
  target.contentVersion = source.contentVersion;
  target.templateVersion = Number(source.templateVersion || 1);
  target.copiedFromCourseId = source.id;
  target.copiedAt = timestamp;
  target.updatedAt = timestamp;
  const nextScope = clone(courseScope(state, target.id) || { projectId: target.projectId, courseId: target.id, version: 0, instanceCount: {} });
  nextScope.version = Number(nextScope.version || 0) + 1;
  nextScope.selectedContents = clone(source.activities || []);
  nextScope.copiedFromCourseId = source.id;
  nextScope.createdAt = timestamp;
  state.scopes.push(nextScope);
  const requiredCodes = new Set(selectedInputCodes(nextScope));
  state.inputs.filter((item) => item.courseId === target.id && item.scopeLevel === 'course').forEach((item) => {
    item.required = requiredCodes.has(item.dataCode);
    item.updatedAt = timestamp;
  });
  const sourceTasks = state.tasks.filter((item) => item.courseId === source.id);
  const targetClasses = state.classes.filter((item) => item.courseId === target.id);
  targetClasses.forEach((classItem, classIndex) => {
    const generated = createTasksForClass(target.projectId, target.id, classItem, classIndex, timestamp, target.activities || []);
    generated.forEach((candidate) => {
      if (!state.tasks.some((item) => item.courseId === target.id && item.classId === classItem.id && item.templateId === candidate.templateId)) state.tasks.push(candidate);
    });
  });
  state.tasks.filter((item) => item.courseId === target.id && !['DONE', 'IN_PROGRESS', 'IN_REVIEW'].includes(item.status)).forEach((task) => {
    const template = sourceTasks.find((item) => item.templateId === task.templateId);
    if (!template) {
      task.status = 'CANCELLED';
      task.cancelledByCourseCopy = true;
      task.updatedAt = timestamp;
      return;
    }
    task.dueOffset = template.dueOffset;
    task.checklistItems = clone(template.checklistItems);
    task.checklist = task.checklistItems.map(() => false);
    task.checklistEvidence = task.checklistItems.map(() => []);
    task.updatedAt = timestamp;
  });
  refreshTaskReadiness(state, target.projectId, timestamp);
  appendAudit(state, auditEvent('COURSE_CONFIG_COPIED', `Sao chép cấu hình ${source.id} sang ${target.id}; bản sao đã tách liên kết.`, context, 'course', target.id, { sourceCourseId: source.id }));
}

function cloneClass(state, payload, context) {
  const timestamp = nowIso(context);
  const project = activeProject(state, payload.projectId);
  const course = state.courses.find((item) => item.id === payload.courseId && item.projectId === project.id);
  if (!course) throw domainError('NOT_FOUND', 'Không tìm thấy khóa học đích.');
  const classId = scopedClassCode(course.code, payload.class?.id || payload.class?.code);
  if (state.classes.some((item) => item.id === classId)) throw domainError('DUPLICATE_CLASS', 'Mã lớp đã tồn tại.');
  const startDate = dateText(payload.class?.startDate, 'Ngày bắt đầu lớp');
  const endDate = dateText(payload.class?.endDate, 'Ngày kết thúc lớp');
  if (endDate < startDate) throw domainError('VALIDATION_ERROR', 'Ngày kết thúc lớp không hợp lệ.');
  const classItem = { id: classId, code: classId, projectId: project.id, courseId: course.id, name: requiredText(payload.class?.name, 'Tên lớp'), startDate, endDate, cloneFrom: payload.cloneFrom || 'CLASS_TEMPLATE', status: 'PREPARING', createdAt: timestamp, updatedAt: timestamp };
  const sourceTasks = payload.cloneFrom && payload.cloneFrom !== 'CLASS_TEMPLATE' ? state.tasks.filter((item) => item.classId === payload.cloneFrom) : [];
  const tasks = createTasksForClass(project.id, course.id, classItem, state.classes.filter((item) => item.projectId === project.id).length, timestamp, course.activities || []).map((task) => {
    const source = sourceTasks.find((item) => item.templateId === task.templateId);
    return source ? { ...task, dueOffset: source.dueOffset, checklistItems: [...source.checklistItems], checklist: source.checklistItems.map(() => false), manager: source.manager, reviewer: source.reviewer } : task;
  });
  state.classes.push(classItem);
  state.inputs.push(...createInputRecords(project.id, course.id, courseScope(state, course.id) || { selectedContents: course.activities || [] }, [classItem], timestamp).filter((item) => item.scopeLevel === 'class'));
  state.tasks.push(...tasks);
  project.classCount += 1;
  project.updatedAt = timestamp;
  appendAudit(state, auditEvent('CLASS_CLONED', `Tạo lớp ${classId} từ ${classItem.cloneFrom}; sinh ${tasks.length} công việc có ID riêng.`, context, 'class', classId, { taskIds: tasks.map((item) => item.id) }));
}

function updateTaskConfig(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskConfigurationAccess(state, task.courseId, context);
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
    task.checklistEvidence = items.map((_, index) => clone(task.checklistEvidence?.[index] || []));
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
  assertTaskConfigurationAccess(state, classItem.courseId, context);
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
  const taskScopePrefix = String(classItem.code).startsWith(`${classItem.courseId}-`) ? classItem.code : `${classItem.courseId}-${classItem.code}`;
  do {
    taskId = `${taskScopePrefix}-CUSTOM-${String(sequence).padStart(3, '0')}`;
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
    sortOrder: Math.max(-1, ...state.tasks.filter((item) => item.classId === classItem.id && item.group === group && item.status !== 'CANCELLED').map((item) => Number(item.sortOrder) || 0)) + 1,
  };
  const courseManagers = state.teamAssignments.filter((item) => item.courseId === classItem.courseId && item.role === 'manager' && item.status !== 'ARCHIVED');
  const courseManager = context.role === 'manager'
    ? courseManagers.find((item) => actorMatches(context, item.accountId, item.accountEmail, item.accountName))
    : courseManagers[0];
  if (courseManager) {
    task.manager = courseManager.accountName || courseManager.accountEmail || courseManager.accountId;
    task.managerId = courseManager.accountId || courseManager.accountEmail || task.manager;
    task.reviewer = task.manager;
    task.reviewerId = task.managerId;
  }
  state.tasks.push(task);
  refreshTaskReadiness(state, classItem.projectId, timestamp);
  appendAudit(state, auditEvent('CLASS_TASK_CREATED', `Thêm ${task.id} vào lớp ${classItem.code}.`, context, 'task', task.id, { classId: classItem.id, group, inputKey }));
}

function moveClassTask(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskConfigurationAccess(state, task.courseId, context);
  const direction = String(payload.direction || '').toUpperCase();
  if (!['UP', 'DOWN'].includes(direction)) throw domainError('VALIDATION_ERROR', 'Hướng di chuyển công việc không hợp lệ.');
  const siblings = state.tasks
    .filter((item) => item.classId === task.classId && item.group === task.group && item.status !== 'CANCELLED')
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  const index = siblings.findIndex((item) => item.id === task.id);
  const targetIndex = index + (direction === 'UP' ? -1 : 1);
  if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
  siblings.forEach((item, itemIndex) => { item.sortOrder = itemIndex; });
  const target = siblings[targetIndex];
  const currentOrder = task.sortOrder;
  task.sortOrder = target.sortOrder;
  target.sortOrder = currentOrder;
  const timestamp = nowIso(context);
  task.updatedAt = timestamp;
  target.updatedAt = timestamp;
  appendAudit(state, auditEvent('CLASS_TASK_MOVED', `Di chuyển ${task.id} ${direction === 'UP' ? 'lên' : 'xuống'} trong nhóm ${task.group}.`, context, 'task', task.id, { direction, adjacentTaskId: target.id }));
}

function archiveTask(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskConfigurationAccess(state, task.courseId, context);
  if (['IN_PROGRESS', 'IN_REVIEW'].includes(task.status)) throw domainError('INVALID_TRANSITION', 'Không thể xóa công việc đang thực hiện hoặc đang chờ review.');
  const timestamp = nowIso(context);
  task.status = 'CANCELLED';
  task.archivedAt = timestamp;
  task.archivedBy = actorFrom(context);
  task.archiveReason = requiredText(payload.reason, 'Lý do xóa');
  task.updatedAt = timestamp;
  refreshTaskReadiness(state, task.projectId, timestamp);
  appendAudit(state, auditEvent('TASK_ARCHIVED', `Đã lưu trữ ${task.id}; lịch sử và audit được giữ nguyên.`, context, 'task', task.id, { reason: task.archiveReason }));
}

function assignTasks(state, payload, context) {
  const timestamp = nowIso(context);
  const taskIds = Array.isArray(payload.taskIds) ? payload.taskIds : [payload.taskId];
  if (!taskIds.filter(Boolean).length) throw domainError('VALIDATION_ERROR', 'Chưa chọn công việc cần phân công.');
  const assigneeName = requiredText(payload.assigneeName, 'Người thực hiện');
  const assigneeId = payload.assigneeId || assigneeName;
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
    task.assigneeId = assigneeId;
    task.reviewer = reviewerName;
    task.reviewerId = payload.reviewerId || reviewerName;
    if (task.assignmentStatus) task.status = task.resumeStatus || 'WAITING_INPUT';
    task.assignmentStatus = null;
    task.assignmentReason = null;
    task.resumeStatus = null;
    task.unassignedAt = null;
    task.unassignedBy = null;
    task.priority = payload.priority || 'Normal';
    task.plannedDeadline = plannedDeadline;
    task.assignmentHistory.push({ assigneeId: task.assigneeId, assigneeName, reviewerId: task.reviewerId, reviewerName, deadline: task.plannedDeadline, deadlineOverrideReason: payload.deadlineOverrideReason || '', priority: task.priority, note: payload.note || '', assignedBy: actorFrom(context), assignedAt: timestamp });
    task.updatedAt = timestamp;
    appendNotification(state, { createdAt: timestamp, kind: 'TASK_ASSIGNED', title: `Bạn được giao ${task.id}`, body: task.title, entityType: 'task', entityId: task.id, recipients: [task.assigneeId, task.reviewerId] });
    refreshTaskReadiness(state, task.projectId, timestamp);
    const courseMembership = state.teamAssignments.find((item) => item.courseId === task.courseId && item.role === 'member' && actorMatches({ actor: { id: assigneeId, email: assigneeId, name: assigneeName } }, item.accountId, item.accountEmail, item.accountName));
    const membership = {
      id: courseMembership?.id || `${task.courseId}:member:${assigneeId}`,
      projectId: task.projectId,
      courseId: task.courseId,
      role: 'member',
      accountId: assigneeId,
      accountName: assigneeName,
      accountEmail: String(assigneeId).includes('@') ? assigneeId : '',
      status: 'ACTIVE',
      assignedAt: courseMembership?.assignedAt || timestamp,
      updatedAt: timestamp,
    };
    if (courseMembership) Object.assign(courseMembership, membership); else state.teamAssignments.push(membership);
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

function courseAssignmentMatches(state, courseId, role, context) {
  return state.teamAssignments.some((item) => item.courseId === courseId && item.role === role && item.status !== 'ARCHIVED'
    && actorMatches(context, item.accountId, item.accountEmail, item.accountName));
}

function assertCourseManager(state, courseId, context) {
  if (['operations', 'admin'].includes(context.role)) return;
  if (context.role !== 'manager' || !courseAssignmentMatches(state, courseId, 'manager', context)) {
    throw domainError('TRAINING_OPERATIONS_PERMISSION_DENIED', 'Bạn không phải Quản lý khóa học được phân công cho khóa này.');
  }
}

function assertTaskConfigurationAccess(state, courseId, context) {
  if (['operations', 'vtraining', 'admin'].includes(context.role)) return;
  assertCourseManager(state, courseId, context);
}

function assignCourseRole(state, payload, context) {
  const timestamp = nowIso(context);
  const course = state.courses.find((item) => item.id === payload.courseId);
  if (!course) throw domainError('NOT_FOUND', 'Không tìm thấy khóa học cần phân quyền.');
  const role = requiredText(payload.role, 'Vai trò trong khóa').toLowerCase();
  if (!TRAINING_COURSE_ROLES.includes(role)) throw domainError('VALIDATION_ERROR', 'Vai trò trong khóa không hợp lệ.');
  const accountId = requiredText(payload.accountId || payload.accountEmail || payload.accountName, 'Tài khoản');
  const existing = state.teamAssignments.find((item) => item.courseId === course.id && item.role === role && item.accountId === accountId);
  const assignment = {
    id: existing?.id || `${course.id}:${role}:${accountId}`,
    projectId: course.projectId,
    courseId: course.id,
    role,
    accountId,
    accountName: payload.accountName || accountId,
    accountEmail: payload.accountEmail || '',
    status: 'ACTIVE',
    archivedAt: null,
    archivedBy: null,
    assignedAt: existing?.assignedAt || timestamp,
    updatedAt: timestamp,
  };
  const replacedAssignments = role === 'manager'
    ? state.teamAssignments.filter((item) => item.courseId === course.id && item.role === 'manager' && item.status !== 'ARCHIVED' && item.accountId !== accountId)
    : [];
  replacedAssignments.forEach((item) => {
    item.status = 'ARCHIVED';
    item.archivedAt = timestamp;
    item.archivedBy = actorFrom(context);
    item.updatedAt = timestamp;
  });
  if (existing) Object.assign(existing, assignment); else state.teamAssignments.push(assignment);
  state.tasks.filter((item) => item.courseId === course.id && !['DONE', 'CANCELLED'].includes(item.status)).forEach((task) => {
    if (role === 'manager') {
      task.manager = assignment.accountName;
      task.managerId = accountId;
      task.reviewer = assignment.accountName;
      task.reviewerId = accountId;
    }
    if (task.assigneeId && task.reviewerId) {
      if (task.assignmentStatus) task.status = task.resumeStatus || 'WAITING_INPUT';
      task.assignmentStatus = null;
      task.assignmentReason = null;
      task.resumeStatus = null;
    }
    task.updatedAt = timestamp;
  });
  refreshTaskReadiness(state, course.projectId, timestamp);
  appendAudit(state, auditEvent('COURSE_ROLE_ASSIGNED', `Gán ${assignment.accountName} làm ${role} tại khóa ${course.code}.`, context, 'course', course.id, { assignmentId: assignment.id, replacedAssignmentIds: replacedAssignments.map((item) => item.id) }));
}

function removeCourseRole(state, payload, context) {
  const timestamp = nowIso(context);
  const course = state.courses.find((item) => item.id === payload.courseId);
  if (!course) throw domainError('NOT_FOUND', 'Không tìm thấy khóa học cần gỡ phân quyền.');
  const accountId = requiredText(payload.accountId, 'Tài khoản');
  const role = requiredText(payload.role, 'Vai trò trong khóa').toLowerCase();
  const assignment = state.teamAssignments.find((item) => item.courseId === course.id && item.role === role && item.accountId === accountId && item.status !== 'ARCHIVED');
  if (!assignment) throw domainError('NOT_FOUND', 'Không tìm thấy phân công còn hiệu lực trong khóa học này.');
  const assignmentIdentity = { actor: { id: assignment.accountId, email: assignment.accountEmail, name: assignment.accountName } };
  const affectedTasks = state.tasks.filter((item) => {
    if (item.courseId !== course.id || ['DONE', 'CANCELLED'].includes(item.status)) return false;
    if (role === 'manager') return actorMatches(assignmentIdentity, item.managerId, item.manager, item.reviewerId, item.reviewer);
    if (role === 'member') return actorMatches(assignmentIdentity, item.assigneeId, item.assignee);
    return false;
  });
  affectedTasks.forEach((task) => {
    if (role === 'manager') {
      task.manager = 'Chưa giao';
      task.managerId = null;
      task.reviewer = 'Chưa giao';
      task.reviewerId = null;
    } else {
      task.assignee = 'Chưa giao';
      task.assigneeId = null;
    }
    markTaskForReassignment(task, role === 'manager' ? 'COURSE_MANAGER_REMOVED' : 'COURSE_MEMBER_REMOVED', timestamp, actorFrom(context));
  });
  assignment.status = 'ARCHIVED';
  assignment.archivedAt = timestamp;
  assignment.archivedBy = actorFrom(context);
  assignment.updatedAt = timestamp;
  appendAudit(state, auditEvent('COURSE_ROLE_REMOVED', `Gỡ ${assignment.accountName} khỏi vai trò ${role} tại khóa ${course.code}; ${affectedTasks.length} công việc chuyển sang chờ phân công lại.`, context, 'course', course.id, { assignmentId: assignment.id, accountId, role, affectedTaskIds: affectedTasks.map((item) => item.id) }));
}

function updateCourseStatus(state, payload, context) {
  const course = state.courses.find((item) => item.id === payload.courseId);
  if (!course) throw domainError('NOT_FOUND', 'Không tìm thấy khóa học.');
  assertCourseManager(state, course.id, context);
  const next = requiredText(payload.status, 'Trạng thái khóa').toUpperCase();
  const previousStatus = course.status || 'DECLARED';
  const transitions = { DECLARED: ['ACTIVE', 'ARCHIVED'], PREPARING: ['ACTIVE', 'ARCHIVED'], ACTIVE: ['ENDED'], ENDED: ['ARCHIVED'], ARCHIVED: [] };
  if (!transitions[previousStatus]?.includes(next)) throw domainError('INVALID_TRANSITION', `Không thể chuyển khóa từ ${course.status} sang ${next}.`);
  if (next === 'ENDED') {
    const unfinished = state.tasks.filter((item) => item.courseId === course.id && !['DONE', 'CANCELLED'].includes(item.status));
    if (unfinished.length) throw domainError('COURSE_NOT_READY_TO_CLOSE', `Còn ${unfinished.length} công việc chưa hoàn thành.`, { taskIds: unfinished.map((item) => item.id) });
  }
  course.status = next;
  course.updatedAt = nowIso(context);
  if (next === 'ARCHIVED') course.archivedAt = course.updatedAt;
  appendAudit(state, auditEvent('COURSE_STATUS_UPDATED', `Khóa ${course.code} chuyển sang ${next}.`, context, 'course', course.id, { from: previousStatus, to: next, reason: String(payload.reason || '').trim() }));
}

function updateClassStatus(state, payload, context) {
  const classItem = state.classes.find((item) => item.id === payload.classId);
  if (!classItem) throw domainError('NOT_FOUND', 'Không tìm thấy lớp.');
  assertCourseManager(state, classItem.courseId, context);
  const next = requiredText(payload.status, 'Trạng thái lớp').toUpperCase();
  if (next === 'ENDED') {
    const unfinished = state.tasks.filter((item) => item.classId === classItem.id && !['DONE', 'CANCELLED'].includes(item.status));
    if (unfinished.length) throw domainError('CLASS_NOT_READY_TO_CLOSE', `Còn ${unfinished.length} công việc chưa hoàn thành.`, { taskIds: unfinished.map((item) => item.id) });
  }
  if (!['PREPARING', 'ACTIVE', 'ENDED', 'ARCHIVED'].includes(next)) throw domainError('VALIDATION_ERROR', 'Trạng thái lớp không hợp lệ.');
  classItem.status = next;
  classItem.updatedAt = nowIso(context);
  appendAudit(state, auditEvent('CLASS_STATUS_UPDATED', `Lớp ${classItem.code} chuyển sang ${next}.`, context, 'class', classItem.id));
}

function updateCourseTemplate(state, payload, context) {
  const course = state.courses.find((item) => item.id === payload.courseId);
  if (!course) throw domainError('NOT_FOUND', 'Không tìm thấy khóa học.');
  assertCourseManager(state, course.id, context);
  const recommendation = requiredText(payload.recommendation, 'Khuyến nghị cải tiến');
  const timestamp = nowIso(context);
  course.templateRecommendations.push({ id: `${course.id}:REC:${course.templateRecommendations.length + 1}`, recommendation, appliesToNextCourse: true, createdBy: actorFrom(context), createdAt: timestamp });
  course.templateVersion = Number(course.templateVersion || 1) + 1;
  course.updatedAt = timestamp;
  appendAudit(state, auditEvent('COURSE_TEMPLATE_RECOMMENDED', `Ghi nhận cải tiến template v${course.templateVersion} cho khóa kế tiếp.`, context, 'course', course.id));
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
  if (Array.isArray(payload.checklistEvidence)) {
    if (payload.checklistEvidence.length !== task.checklistItems.length) throw domainError('VALIDATION_ERROR', 'Minh chứng theo checklist không khớp cấu hình.');
    task.checklistEvidence = payload.checklistEvidence.map((items) => Array.isArray(items)
      ? items.filter((item) => item && (item.url || item.fileUrl || item.path || item.id))
      : []);
  }
  if (payload.blocker !== undefined) task.blocker = String(payload.blocker || '').trim();
  task.progress = Math.round(task.checklist.filter(Boolean).length / Math.max(task.checklist.length, 1) * 100);
  task.updatedAt = nowIso(context);
  appendAudit(state, auditEvent('TASK_PROGRESS_UPDATED', `Cập nhật tiến độ ${task.id} đạt ${task.progress}%.`, context, 'task', task.id, { blocker: task.blocker }));
}

function submitOutput(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskAssignee(task, context);
  if (!['IN_PROGRESS', 'REWORK'].includes(task.status)) throw domainError('INVALID_TRANSITION', 'Công việc chưa ở trạng thái cho phép nộp kết quả.');
  const actualOutput = requiredText(payload.actualOutput, 'Kết quả thực tế');
  const evidence = Array.isArray(payload.evidence) ? payload.evidence.filter((item) => item && (item.url || item.fileUrl || item.path || item.id)) : [];
  if (!evidence.length) throw domainError('VALIDATION_ERROR', 'Cần ít nhất một minh chứng có thể truy cập.');
  const version = (task.outputs.at(-1)?.version || 0) + 1;
  task.outputs.push({ id: `${task.id}:OUT:v${version}`, version, actualOutput, metrics: payload.metrics || {}, evidence, submittedBy: actorFrom(context), submittedAt: nowIso(context) });
  task.evidence = evidence[0].url || evidence[0].fileUrl || evidence[0].path || evidence[0].id;
  task.updatedAt = nowIso(context);
  appendAudit(state, auditEvent('TASK_OUTPUT_SUBMITTED', `Nộp kết quả và minh chứng phiên bản ${version} cho ${task.id}.`, context, 'task', task.id, { version }));
}

function submitReview(state, payload, context) {
  const task = findTask(state, payload.taskId);
  assertTaskAssignee(task, context);
  if (!['IN_PROGRESS', 'REWORK'].includes(task.status)) throw domainError('INVALID_TRANSITION', 'Công việc chưa thể gửi duyệt.');
  if (Array.isArray(payload.checklist) || Array.isArray(payload.checklistEvidence) || payload.blocker !== undefined) updateTaskProgress(state, payload, context);
  const hasOutput = String(payload.actualOutput || '').trim() || (Array.isArray(payload.evidence) && payload.evidence.some((item) => item && (item.url || item.fileUrl || item.path || item.id)));
  if (hasOutput) submitOutput(state, payload, context);
  const output = task.outputs.at(-1) || null;
  if (!task.reviewerId && !task.reviewer) throw domainError('SUBMISSION_NOT_READY', 'Chưa có người duyệt còn hiệu lực.');
  const timestamp = nowIso(context);
  const submission = { id: `${task.id}:SUB:${task.submissions.length + 1}`, status: 'IN_REVIEW', taskSnapshot: { checklistItems: clone(task.checklistItems), checklist: clone(task.checklist), checklistEvidence: clone(task.checklistEvidence), requiredInputVersions: clone(task.requiredInputVersions), output: output ? clone(output) : null }, submittedBy: actorFrom(context), submittedAt: timestamp };
  task.submissions.push(submission);
  task.status = 'IN_REVIEW';
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
  task.progress = result === 'PASS' ? 100 : task.progress;
  task.completedAt = result === 'PASS' ? timestamp : null;
  if (result === 'REWORK') task.rework += 1;
  task.updatedAt = timestamp;
  refreshTaskReadiness(state, task.projectId, timestamp);
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
  const affectedCourseIds = [...new Set((payload.affectedCourseIds || [payload.courseId]).filter(Boolean).map(String))];
  if (!affectedCourseIds.length || affectedCourseIds.some((id) => !state.courses.some((course) => course.id === id && course.projectId === project.id))) {
    throw domainError('VALIDATION_ERROR', 'Yêu cầu thay đổi phải chỉ rõ khóa học bị ảnh hưởng trong dự án.');
  }
  const governanceImpact = {
    contract: Boolean(payload.governanceImpact?.contract),
    cost: Boolean(payload.governanceImpact?.cost),
    clientMilestone: Boolean(payload.governanceImpact?.clientMilestone),
  };
  const request = {
    id: `CR-${String(state.changeRequests.length + 1).padStart(4, '0')}`,
    projectId: project.id,
    courseId: affectedCourseIds.length === 1 ? affectedCourseIds[0] : null,
    affectedCourseIds,
    governanceImpact,
    approvalLevel: affectedCourseIds.length > 1 || Object.values(governanceImpact).some(Boolean) ? 'OPERATIONS' : 'COURSE_MANAGER',
    status: 'PENDING',
    changeType,
    objectKey: payload.objectKey || '',
    currentScopeVersion: project.scopeVersion,
    proposed: clone(payload.proposed || {}),
    reason,
    effectiveAt: payload.effectiveAt || timestamp,
    impact: { createTaskCount: Number(payload.impact?.createTaskCount || 0), cancelTaskCount: Number(payload.impact?.cancelTaskCount || 0), keepTaskCount: state.tasks.filter((item) => affectedCourseIds.includes(item.courseId)).length, affectedTaskIds: payload.impact?.affectedTaskIds || [] },
    requestedBy: actorFrom(context),
    requestedAt: timestamp,
  };
  state.changeRequests.push(request);
  appendNotification(state, { createdAt: timestamp, kind: 'SCOPE_CHANGE_REQUESTED', title: `${request.id} chờ phê duyệt`, body: reason, entityType: 'change_request', entityId: request.id, recipients: [request.approvalLevel === 'OPERATIONS' ? 'operations' : 'manager'] });
  appendAudit(state, auditEvent('SCOPE_CHANGE_REQUESTED', `Tạo ${request.id}: ${reason}. Chưa sinh hoặc hủy task.`, context, 'change_request', request.id, { impact: request.impact }));
}

function approveScopeChange(state, payload, context) {
  const timestamp = nowIso(context);
  const request = state.changeRequests.find((item) => item.id === payload.changeRequestId);
  if (!request) throw domainError('NOT_FOUND', 'Không tìm thấy yêu cầu thay đổi.');
  if (request.status !== 'PENDING') throw domainError('INVALID_TRANSITION', 'Yêu cầu thay đổi đã được xử lý.');
  const project = activeProject(state, request.projectId);
  if (request.approvalLevel === 'OPERATIONS' && !['operations', 'admin'].includes(context.role)) {
    throw domainError('TRAINING_OPERATIONS_PERMISSION_DENIED', 'Thay đổi liên khóa/hợp đồng/chi phí/mốc bàn giao phải do Quản lý vận hành phê duyệt.');
  }
  if (request.approvalLevel === 'COURSE_MANAGER') assertCourseManager(state, request.affectedCourseIds[0], context);
  if (request.changeType !== 'quantity') {
    request.status = 'APPROVED';
    request.approvedBy = actorFrom(context);
    request.approvedAt = timestamp;
    appendNotification(state, { createdAt: timestamp, kind: 'INPUT_CHANGE_APPROVED', title: `${request.id} đã được duyệt`, body: 'Người sở hữu input có thể tạo phiên bản mới; scope hiện tại không thay đổi.', entityType: 'change_request', entityId: request.id, recipients: [TRAINING_INPUT_DEFINITIONS[request.objectKey]?.ownerRole || 'operations'] });
    appendAudit(state, auditEvent('INPUT_CHANGE_APPROVED', `Duyệt ${request.id} để cập nhật input; không tạo Scope mới.`, context, 'change_request', request.id, { scopeVersion: project.scopeVersion }));
    return;
  }
  const targetCourseId = request.affectedCourseIds[0];
  const previousScope = courseScope(state, targetCourseId);
  if (!previousScope) throw domainError('NOT_FOUND', 'Không tìm thấy scope của khóa học cần thay đổi.');
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
      const classes = state.classes.filter((item) => item.courseId === targetCourseId);
      classes.forEach((classItem, classIndex) => {
        for (let index = currentCount; index < nextCount; index += 1) {
          const course = state.courses.find((item) => item.id === classItem.courseId);
          const task = createTasksForClass(project.id, classItem.courseId, classItem, classIndex, timestamp, course?.activities || []).find((item) => item.templateId === template.code);
          if (!task) continue;
          const taskScopePrefix = String(classItem.code).startsWith(`${classItem.courseId}-`) ? classItem.code : `${classItem.courseId}-${classItem.code}`;
          task.id = `${taskScopePrefix}-${template.code}-I${index + 1}`;
          task.title = `${template.title} ${String(index + 1).padStart(2, '0')}`;
          state.tasks.push(task);
        }
      });
    }
    if (template && nextCount < currentCount) {
      let remaining = (currentCount - nextCount) * state.classes.filter((item) => item.courseId === targetCourseId).length;
      [...state.tasks].reverse().forEach((task) => {
        if (remaining > 0 && task.courseId === targetCourseId && task.input === objectKey && !['DONE', 'IN_PROGRESS', 'IN_REVIEW'].includes(task.status)) {
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
  const state = normalizeTrainingOperationsState(currentState, context);
  const payload = command?.payload || {};
  switch (type) {
    case 'CREATE_PROJECT': createProject(state, payload, { ...context, role }); break;
    case 'CREATE_PROJECT_BUNDLE': createProjectBundle(state, payload, { ...context, role }); break;
    case 'CREATE_COURSE': createCourse(state, payload, { ...context, role }); break;
    case 'COPY_COURSE_CONFIG': copyCourseConfig(state, payload, { ...context, role }); break;
    case 'ASSIGN_COURSE_ROLE': assignCourseRole(state, payload, { ...context, role }); break;
    case 'REMOVE_COURSE_ROLE': removeCourseRole(state, payload, { ...context, role }); break;
    case 'UPDATE_COURSE_STATUS': updateCourseStatus(state, payload, { ...context, role }); break;
    case 'UPDATE_COURSE_TEMPLATE': updateCourseTemplate(state, payload, { ...context, role }); break;
    case 'UPDATE_CLASS_STATUS': updateClassStatus(state, payload, { ...context, role }); break;
    case 'CLONE_CLASS': cloneClass(state, payload, { ...context, role }); break;
    case 'CREATE_CLASS_TASK': createClassTask(state, payload, { ...context, role }); break;
    case 'UPDATE_TASK_CONFIG': updateTaskConfig(state, payload, { ...context, role }); break;
    case 'MOVE_CLASS_TASK': moveClassTask(state, payload, { ...context, role }); break;
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
  state.schemaVersion = 3;
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

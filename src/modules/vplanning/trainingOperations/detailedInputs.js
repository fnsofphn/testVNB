// Shared server/client contract. Commands are authorized again on the server;
// caller-supplied names, role labels, versions and approval timestamps are never trusted.
const field = (key, label, type = 'text', required = true) => ({ key, label, type, required });
export const DETAIL_SCHEMAS = Object.freeze({
  roster: { label: 'Lớp & học viên', code: 'D03', fields: [field('roster', 'Danh sách học viên / tham chiếu file'), field('groups', 'Thông tin chia nhóm', 'textarea', false)] },
  vlearning: { label: 'Bài giảng VLearning', code: 'D04', fields: [field('name', 'Tên bài giảng'), field('parts', 'Tên các phần', 'textarea'), field('vimeo', 'Link Vimeo', 'url'), field('excel', 'File Excel bài giảng / tham chiếu file'), field('quiz', 'Câu hỏi cuối bài (nếu có)', 'textarea', false)] },
  game: { label: 'Game', code: 'D05', fields: [field('name', 'Tên game đầy đủ'), field('systemName', 'Tên game trên hệ thống'), field('attempts', 'Số lượt chơi', 'number'), field('minutes', 'Thời gian chơi (phút)', 'number')] },
  discussion: { label: 'Chủ đề thảo luận', code: 'D06', fields: [field('name', 'Tên chủ đề'), field('description', 'Mô tả chủ đề', 'textarea'), field('groups', 'Danh sách học viên đã chia nhóm / tham chiếu file'), field('minutes', 'Thời lượng mỗi phiên (phút)', 'number')] },
  assignment: { label: 'Bài thu hoạch', code: 'D07', fields: [field('name', 'Tên bài thu hoạch'), field('questions', 'Câu hỏi thu hoạch', 'textarea'), field('duration', 'Thời gian làm bài'), field('attempts', 'Số lượt làm bài', 'number')] },
  test: { label: 'Bài kiểm tra', code: 'D08', fields: [field('name', 'Tên bài kiểm tra'), field('questions', 'Bộ câu hỏi / tham chiếu file', 'textarea'), field('count', 'Số câu hỏi mỗi bài', 'number'), field('minutes', 'Thời gian hoàn thành (phút)', 'number'), field('attempts', 'Số lượt làm bài', 'number')] },
  material: { label: 'Tài liệu', code: 'D09', fields: [field('agenda', 'Agenda / tham chiếu file'), field('materials', 'Tài liệu học tập / tham chiếu file', 'textarea')] },
  email: { label: 'Input gửi mail lịch học', code: 'EMAIL', fields: [field('recipients', 'Email học viên / tham chiếu danh sách', 'textarea'), field('access', 'Hướng dẫn truy cập ELN (học trực tuyến)', 'textarea', false), field('preparation', 'Tài liệu, chia nhóm, dụng cụ (học trực tiếp)', 'textarea', false)] },
});
export const DETAIL_COMMANDS = ['CREATE_DETAIL_INPUT', 'SAVE_DETAIL_INPUT', 'SUBMIT_DETAIL_INPUT', 'RETURN_DETAIL_INPUT', 'APPROVE_DETAIL_INPUT', 'ASSIGN_DETAIL_INPUT', 'LINK_DETAIL_INPUT', 'APPLY_DETAIL_INPUT', 'REQUEST_DETAIL_INPUT', 'UPDATE_INPUT_CONTEXT'];
export const DETAIL_STATUS = { DRAFT: 'Bản nháp', REVIEW: 'Chờ kiểm tra', RETURNED: 'Yêu cầu bổ sung', READY: 'Sẵn sàng' };
const token = value => String(value || '').trim().toLowerCase();
export function detailIdentity(context, ...ids) {
  const tokens = [context?.actor?.id, context?.actor?.email].map(token).filter(Boolean);
  return ids.some(id => tokens.includes(token(id)));
}
export const detailOperations = context => ['operations', 'admin'].includes(context?.role);
export function detailCourseManager(state, courseId, context) {
  return detailOperations(context) || context?.role === 'manager' && (state.teamAssignments || []).some(a =>
    a.courseId === courseId && a.role === 'manager' && a.status !== 'ARCHIVED' && detailIdentity(context, a.accountId, a.accountEmail));
}
export const canEditDetail = (input, context) => detailOperations(context) || detailIdentity(context, input.ownerId, ...(input.collaboratorIds || []));
export const canReviewDetail = (input, context) => detailOperations(context) || detailIdentity(context, input.reviewerId);
export const isDetailParticipant = (input, context) => canEditDetail(input, context) || canReviewDetail(input, context);
export function canReadDetail(state, input, context) {
  return isDetailParticipant(input, context) || detailCourseManager(state, input.courseId, context) || (state.tasks || []).some(t =>
    !t.archivedAt && t.status !== 'CANCELLED' && (t.inputBindings || []).some(b => b.inputId === input.id)
    && detailIdentity(context, t.assigneeId, t.reviewerId, t.managerId));
}
function fail(message, code = 'DETAIL_INPUT_VALIDATION', status = 400) {
  const error = new Error(message); error.code = code; error.status = status; throw error;
}
function requireAccess(allowed) { if (!allowed) fail('Bạn không có quyền với bộ input này.', 'TRAINING_OPERATIONS_PERMISSION_DENIED', 403); }
function text(value, label, required = true, max = 12000) {
  if (value !== undefined && value !== null && typeof value !== 'string' && typeof value !== 'number') fail(label + ' không hợp lệ.');
  const result = String(value ?? '').trim();
  if (required && !result || result.length > max) fail(label + (result.length > max ? ' quá dài.' : ' là bắt buộc.'));
  return result;
}
export function safeDetailUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
export function cleanDetailData(key, source = {}, complete = false) {
  const schema = DETAIL_SCHEMAS[key];
  if (!schema || !source || typeof source !== 'object' || Array.isArray(source)) fail('Loại hoặc dữ liệu input không hợp lệ.');
  return Object.fromEntries(schema.fields.map(f => {
    const value = text(source[f.key], f.label, complete && f.required);
    if (value && f.type === 'number' && (!Number.isSafeInteger(Number(value)) || Number(value) <= 0)) fail(f.label + ' phải là số nguyên dương.');
    if (value && f.type === 'url' && !safeDetailUrl(value)) fail(f.label + ' phải là đường dẫn http/https hợp lệ.');
    if (key === 'vlearning' && f.key === 'vimeo' && value && !/(^|\.)vimeo\.com$/i.test(new URL(value).hostname)) fail('Link bài giảng phải thuộc Vimeo.');
    return [f.key, value];
  }));
}
export function cleanInputContext(level, source = {}) {
  const keys = level === 'project' ? ['program', 'audience'] : level === 'course' ? ['program', 'audience', 'deliveryMode', 'venue', 'thumbnail'] : ['instructor', 'deliveryMode', 'venue'];
  const result = Object.fromEntries(keys.map(key => [key, text(source[key], key, false, 2000)]));
  if (result.thumbnail && !safeDetailUrl(result.thumbnail)) fail('Ảnh khóa học cần URL http/https.');
  return result;
}
export function detailContext(state, task) {
  const project = state.projects.find(p => p.id === task.projectId) || {};
  const course = state.courses.find(c => c.id === task.courseId) || {};
  const classroom = state.classes.find(c => c.id === task.classId) || {};
  return {
    projectId: task.projectId, projectName: project.name || '', customer: project.customerName || '',
    program: course.program || project.program || project.name || '', audience: course.audience || project.audience || '',
    courseId: task.courseId, courseName: course.name || '', systems: course.systems || [], thumbnail: course.thumbnail || '',
    classId: task.classId, className: classroom.name || '', instructor: classroom.instructor || '',
    startDate: classroom.startDate || course.startDate || '', endDate: classroom.endDate || course.endDate || '',
    deliveryMode: classroom.deliveryMode || course.deliveryMode || '', venue: classroom.venue || course.venue || '',
  };
}
function cleanFiles(files, inputId) {
  if (!Array.isArray(files) || files.length > 20) fail('Tối đa 20 file trong một bộ input.');
  return files.map(file => {
    const path = text(file.path, 'Đường dẫn file');
    // Base64url encoding must work identically in browser and Node.
    const entity = typeof Buffer !== 'undefined' ? Buffer.from(inputId).toString('base64url') : btoa(unescape(encodeURIComponent(inputId))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    if (!path.startsWith('training-operations/' + entity + '/detail/') || path.includes('..') || !/^[\w/.-]+$/.test(path)) fail('File không thuộc bộ input này.');
    const size = Number(file.size);
    if (!Number.isSafeInteger(size) || size <= 0 || size > 25 * 1024 * 1024) fail('File phải lớn hơn 0 và không quá 25 MB.');
    return { path, id: path, name: text(file.name, 'Tên file', true, 180), size, private: true };
  });
}
function assignment(payload) {
  const ownerId = text(payload.ownerId, 'Người phụ trách chính', true, 200);
  const reviewerId = text(payload.reviewerId, 'Người chốt', true, 200);
  if (!Array.isArray(payload.collaboratorIds || [])) fail('Danh sách người cùng nhập không hợp lệ.');
  const collaboratorIds = [...new Set((payload.collaboratorIds || []).map(v => text(v, 'Người cùng nhập', true, 200)))].filter(v => v !== ownerId);
  if (collaboratorIds.length > 30) fail('Tối đa 30 người cùng nhập.');
  const dueAt = text(payload.dueAt, 'Hạn cung cấp');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt) || !Number.isFinite(Date.parse(dueAt)) || new Date(dueAt).toISOString().slice(0, 10) !== dueAt) fail('Hạn cung cấp không hợp lệ.');
  return { ownerId, reviewerId, collaboratorIds, dueAt };
}
function taskById(state, id) {
  const task = state.tasks.find(t => t.id === id && !t.archivedAt && t.status !== 'CANCELLED');
  if (!task) fail('Không tìm thấy công việc.', 'NOT_FOUND', 404);
  return task;
}
export function detailDiff(before = {}, after = {}) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map(key => ({ key, before: before[key] ?? null, after: after[key] ?? null }));
}
function event(state, input, type, context, details = {}) {
  const at = context.now || new Date().toISOString();
  const actor = { id: context.actor?.id || '', email: context.actor?.email || '', name: context.actor?.name || '', role: context.role };
  const entry = { id: 'DI-' + input.id + '-' + (input.revision || 0) + '-' + type, type, actor, happenedAt: at, summary: type + ' · ' + input.title, entityType: 'detailed_input', entityId: input.id, details };
  state.auditEvents.push(entry);
  input.history = [...(input.history || []), entry];
  input.updatedAt = at;
  state.updatedAt = at;
  state.updatedBy = actor.id;
}
function notify(state, input, type, context) {
  const tasks = state.tasks.filter(t => (t.inputBindings || []).some(b => b.inputId === input.id));
  state.notifications.push({ id: input.id + ':' + input.revision + ':' + type, read: false, kind: type,
    title: input.title + ' · ' + (DETAIL_STATUS[input.status] || type), body: 'Input có thay đổi. Mở công việc để xem bản đang dùng và quyết định phiên bản.',
    entityType: 'detailed_input', entityId: input.id, createdAt: context.now || new Date().toISOString(),
    recipients: [...new Set([input.ownerId, input.reviewerId, ...(input.collaboratorIds || []), ...tasks.flatMap(t => [t.assigneeId, t.reviewerId, t.managerId])].filter(Boolean))] });
}
export function applyDetailCommand(state, type, payload, context) {
  state.detailedInputs ||= [];
  if (type === 'UPDATE_INPUT_CONTEXT') {
    const course = state.courses.find(c => c.id === payload.courseId);
    if (!course) fail('Không tìm thấy khóa học.', 'NOT_FOUND', 404);
    requireAccess(detailCourseManager(state, course.id, context));
    const target = payload.level === 'project' ? state.projects.find(p => p.id === course.projectId)
      : payload.level === 'course' ? course : payload.level === 'class' ? state.classes.find(c => c.id === payload.classId && c.courseId === course.id) : null;
    if (!target) fail('Phạm vi thông tin kế thừa không hợp lệ.');
    if (payload.level === 'project') requireAccess(detailOperations(context));
    const keys = payload.level === 'project' ? ['program', 'audience'] : payload.level === 'course' ? ['program', 'audience', 'deliveryMode', 'venue', 'thumbnail'] : ['instructor', 'deliveryMode', 'venue'];
    const before = Object.fromEntries(keys.map(k => [k, target[k] || '']));
    for (const key of keys) target[key] = text(payload.data?.[key], key, false, 2000);
    if (target.thumbnail && !safeDetailUrl(target.thumbnail)) fail('Ảnh khóa học cần URL http/https.');
    const reason = text(payload.reason, 'Lý do cập nhật thông tin');
    event(state, { id: target.id, title: target.name, revision: state.auditEvents.length }, type, context, { reason, diff: detailDiff(before, Object.fromEntries(keys.map(k => [k, target[k]]))) });
    return;
  }
  if (type === 'CREATE_DETAIL_INPUT') {
    const task = taskById(state, payload.taskId);
    requireAccess(detailCourseManager(state, task.courseId, context));
    if (['DONE', 'IN_REVIEW'].includes(task.status)) fail('Không thêm input bắt buộc khi công việc đã hoàn thành hoặc chờ nghiệm thu.');
    if (!DETAIL_SCHEMAS[payload.key]) fail('Loại input không hợp lệ.');
    const id = 'DIN-' + text(payload.id, 'ID input', true, 80);
    if (!/^DIN-[a-zA-Z0-9-]+$/.test(id) || state.detailedInputs.some(i => i.id === id)) fail('ID input không hợp lệ hoặc đã tồn tại.');
    const input = { id, title: text(payload.title, 'Tên bộ input', true, 200), key: payload.key,
      projectId: task.projectId, courseId: task.courseId, classId: task.classId, scopeLevel: 'activity', activityId: task.id,
      ...assignment(payload), status: 'DRAFT', revision: 1, latestVersion: 0, versions: [], history: [],
      draft: { data: cleanDetailData(payload.key, payload.data || {}), files: [], reason: '' },
      createdAt: context.now || new Date().toISOString() };
    state.detailedInputs.push(input);
    task.inputBindings = [...(task.inputBindings || []), { inputId: id, version: 0 }];
    event(state, input, type, context, { taskId: task.id });
    notify(state, input, type, context);
    return;
  }
  const input = state.detailedInputs.find(i => i.id === payload.inputId);
  if (!input) fail('Không tìm thấy bộ input.', 'NOT_FOUND', 404);
  if (!Number.isInteger(payload.expectedRevision) || payload.expectedRevision !== input.revision) fail('Input đã được người khác cập nhật. Tải lại trước khi lưu.', 'DETAIL_INPUT_CONFLICT', 409);
  requireAccess(canReadDetail(state, input, context));
  const at = context.now || new Date().toISOString();
  const actor = { id: context.actor?.id, email: context.actor?.email, name: context.actor?.name };
  let details = {};
  if (type === 'ASSIGN_DETAIL_INPUT') {
    requireAccess(detailCourseManager(state, input.courseId, context));
    const before = { ownerId: input.ownerId, reviewerId: input.reviewerId, collaboratorIds: input.collaboratorIds, dueAt: input.dueAt };
    Object.assign(input, assignment(payload));
    details = { diff: detailDiff(before, assignment(payload)) };
  } else if (type === 'SAVE_DETAIL_INPUT' || type === 'SUBMIT_DETAIL_INPUT') {
    requireAccess(canEditDetail(input, context));
    if (input.status === 'REVIEW') fail('Bản đang kiểm tra bị khóa. Người chốt cần yêu cầu bổ sung trước khi sửa.');
    const submitting = type === 'SUBMIT_DETAIL_INPUT';
    input.draft = { data: cleanDetailData(input.key, payload.data, submitting), files: cleanFiles(payload.files || [], input.id),
      reason: text(payload.reason, 'Lý do cập nhật', submitting && input.latestVersion > 0), editedAt: at, editedBy: actor };
    if (submitting) {
      if (input.key === 'email') {
        const inherited = detailContext(state, input);
        const remote = /trực tuyến|online/i.test(inherited.deliveryMode);
        if (!input.draft.data[remote ? 'access' : 'preparation']) fail(remote ? 'Cần hướng dẫn truy cập ELN.' : 'Cần thông tin chuẩn bị cho lớp.');
      }
      input.submittedBy = actor; input.submittedAt = at;
    }
    input.status = submitting ? 'REVIEW' : 'DRAFT';
    details = { reason: input.draft.reason };
  } else if (type === 'RETURN_DETAIL_INPUT') {
    requireAccess(canReviewDetail(input, context));
    if (input.status !== 'REVIEW') fail('Chỉ trả lại bản đang chờ kiểm tra.');
    input.feedback = text(payload.reason, 'Nội dung yêu cầu bổ sung');
    input.status = 'RETURNED'; details = { reason: input.feedback };
  } else if (type === 'APPROVE_DETAIL_INPUT') {
    requireAccess(canReviewDetail(input, context));
    if (input.status !== 'REVIEW' || !input.draft) fail('Input chưa gửi kiểm tra.');
    cleanDetailData(input.key, input.draft.data, true);
    if (input.key === 'email') {
      const inherited = detailContext(state, input);
      const remote = /trực tuyến|online/i.test(inherited.deliveryMode);
      if (!input.draft.data[remote ? 'access' : 'preparation']) fail('Thông tin lớp đã thay đổi. Yêu cầu bổ sung hướng dẫn phù hợp trước khi chốt.');
    }
    const previous = input.versions.find(v => v.version === input.latestVersion);
    const version = input.latestVersion + 1;
    input.versions.push({ ...structuredClone(input.draft), version, submittedBy: input.submittedBy, submittedAt: input.submittedAt,
      approvedBy: actor, approvedAt: at, context: detailContext(state, input),
      diff: detailDiff(previous?.data || {}, input.draft.data), fileDiff: detailDiff({ files: previous?.files || [] }, { files: input.draft.files }) });
    input.latestVersion = version; input.status = 'READY'; input.draft = null; input.feedback = '';
    for (const task of state.tasks) for (const binding of task.inputBindings || []) if (binding.inputId === input.id) {
      if (!binding.version && !['IN_PROGRESS', 'REWORK', 'IN_REVIEW', 'DONE'].includes(task.status)) binding.version = version;
      else if (binding.version !== version) binding.pendingVersion = version;
    }
    details = { version };
  } else if (type === 'LINK_DETAIL_INPUT') {
    const task = taskById(state, payload.taskId);
    requireAccess(detailCourseManager(state, task.courseId, context));
    if (task.courseId !== input.courseId || task.classId !== input.classId || task.projectId !== input.projectId) fail('Bộ input chỉ được gắn với công việc cùng dự án, khóa và lớp.');
    if (['DONE', 'IN_REVIEW'].includes(task.status)) fail('Không thay bộ input của công việc đã hoàn thành hoặc chờ nghiệm thu.');
    if (!(task.inputBindings || []).some(b => b.inputId === input.id)) {
      const inProgress = ['IN_PROGRESS', 'REWORK'].includes(task.status);
      task.inputBindings = [...(task.inputBindings || []), { inputId: input.id, version: inProgress ? 0 : input.latestVersion, ...(inProgress && input.latestVersion ? { pendingVersion: input.latestVersion } : {}) }];
    }
    details = { taskId: task.id };
  } else if (type === 'APPLY_DETAIL_INPUT') {
    const task = taskById(state, payload.taskId);
    requireAccess(detailCourseManager(state, task.courseId, context));
    const binding = (task.inputBindings || []).find(b => b.inputId === input.id);
    if (!binding?.pendingVersion || !input.versions.some(v => v.version === binding.pendingVersion)) fail('Không có phiên bản mới đang chờ quyết định.');
    if (!['KEEP', 'APPLY', 'REWORK'].includes(payload.decision)) fail('Quyết định phiên bản không hợp lệ.');
    if (payload.decision === 'KEEP' && !binding.version) fail('Chưa có bản cũ để tiếp tục sử dụng.');
    if (['DONE', 'IN_REVIEW'].includes(task.status) && payload.decision !== 'KEEP') fail('Công việc đã hoàn thành hoặc chờ nghiệm thu chỉ được giữ bản đã dùng.');
    const reason = text(payload.reason, 'Lý do quyết định');
    details = { taskId: task.id, fromVersion: binding.version, toVersion: binding.pendingVersion, decision: payload.decision, reason };
    if (payload.decision !== 'KEEP') binding.version = binding.pendingVersion;
    if (payload.decision === 'REWORK' && ['IN_PROGRESS', 'REWORK'].includes(task.status)) {
      task.status = 'REWORK'; task.checklist = task.checklist.map(() => false); task.progress = 0;
      task.rework = Number(task.rework || 0) + 1;
    }
    binding.decisions = [...(binding.decisions || []), { ...details, actor, at }];
    delete binding.pendingVersion;
  } else if (type === 'REQUEST_DETAIL_INPUT') {
    details = { reason: text(payload.reason, 'Nội dung cần bổ sung') };
  } else fail('Lệnh input không hợp lệ.');
  input.revision += 1;
  event(state, input, type, context, details);
  if (type !== 'SAVE_DETAIL_INPUT') notify(state, input, type, context);
}

// The presence of a detailed set replaces only that legacy data-code dependency.
// All linked sets of the same type are required; an unrelated type never satisfies it.
export function detailedReadiness(state, task) {
  const bindings = task.inputBindings || [];
  const resolved = bindings.map(binding => ({ binding, input: (state.detailedInputs || []).find(i => i.id === binding.inputId && i.courseId === task.courseId && i.classId === task.classId && i.projectId === task.projectId) }));
  return { replacedCodes: new Set(resolved.filter(r => r.input).map(r => DETAIL_SCHEMAS[r.input.key]?.code)),
    blockingIds: resolved.filter(({ input, binding }) => !input || !input.versions.some(v => v.version === binding.version)).map(r => r.binding.inputId) };
}
export function projectDetailsForActor(state, context) {
  return (state.detailedInputs || []).filter(i => canReadDetail(state, i, context)).map(input => {
    if (isDetailParticipant(input, context) || detailCourseManager(state, input.courseId, context)) return structuredClone(input);
    const visible = new Set([input.latestVersion, ...state.tasks.filter(t => detailIdentity(context, t.assigneeId, t.reviewerId, t.managerId)).flatMap(t => (t.inputBindings || []).filter(b => b.inputId === input.id).map(b => b.version))]);
    const { draft, history, submittedBy, submittedAt, ...publicInput } = input;
    return { ...structuredClone(publicInput), versions: structuredClone(input.versions.filter(v => visible.has(v.version))), history: (history || []).filter(e => ['APPROVE_DETAIL_INPUT', 'APPLY_DETAIL_INPUT', 'REQUEST_DETAIL_INPUT'].includes(e.type)) };
  });
}

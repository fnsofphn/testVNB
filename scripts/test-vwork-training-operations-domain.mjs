import assert from 'node:assert/strict';
import {
  applyTrainingOperationsCommand,
  createInitialTrainingOperationsState,
  normalizeTrainingOperationsState,
  summarizeTrainingOperationsState,
} from '../src/modules/vplanning/trainingOperations/domain.js';

const clock = { value: Date.parse('2026-08-25T01:00:00.000Z') };
const context = (role, name) => ({ role, actor: { id: `${role}-01`, email: `${role}@peopleone.vn`, name, role }, now: new Date(clock.value += 1000).toISOString() });
const command = (state, type, payload, role, name = role) => applyTrainingOperationsCommand(state, { type, payload }, context(role, name));
const commandAs = (state, type, payload, role, id, name) => applyTrainingOperationsCommand(state, { type, payload }, { role, actor: { id, email: `${id}@peopleone.vn`, name, role }, now: new Date(clock.value += 1000).toISOString() });

let state = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
const initialSummary = summarizeTrainingOperationsState(state);
assert.deepEqual(initialSummary, { projects: 1, courses: 1, classes: 3, inputs: 9, tasks: 33, changeRequests: 0, auditEvents: 1 });

// Legacy project-level D03 is preserved for audit but is never guessed onto a class.
const legacyState = structuredClone(state);
legacyState.schemaVersion = 1;
legacyState.inputs = [{ id: 'EVNSPC-2026:D03', projectId: 'EVNSPC-2026', key: 'roster', dataCode: 'D03', title: 'Lớp & học viên', ownerRole: 'intake', required: true, status: 'ACTIVE', activeVersion: 1, versions: [{ id: 'EVNSPC-2026:D03:v1', version: 1, status: 'ACTIVE', files: [{ name: 'legacy.xlsx' }] }] }];
const normalizedLegacy = normalizeTrainingOperationsState(legacyState, { now: '2026-08-25T00:00:00.000Z' });
assert.equal(normalizedLegacy.schemaVersion, 3);
assert.ok(normalizedLegacy.inputs.filter((item) => item.dataCode === 'D03').every((item) => item.status === 'MISSING'));
assert.equal(normalizedLegacy.legacyUnscopedInputs[0].id, 'EVNSPC-2026:D03');

// UC01 — create project, scope, course, class and class-owned tasks.
state = command(state, 'CREATE_PROJECT', {
  project: { id: 'ALPHA-2026', name: 'Đào tạo Alpha 2026', customerId: 'ALPHA', customerName: 'Alpha', startDate: '2026-10-01', deadline: '2026-10-31', classCount: 1, teamId: 'TEAM-01' },
  course: { id: 'ALPHA-CX', name: 'Trải nghiệm khách hàng Alpha', systems: ['VTraining', 'VLearning'], contentVersion: '2026-v1' },
  classes: [{ id: 'ALPHA01', name: 'Lớp 01 · Alpha', startDate: '2026-10-10', endDate: '2026-10-12', cloneFrom: 'CLASS_TEMPLATE' }],
  scope: { selectedContents: ['VTRAINING', 'VLEARNING', 'GAMIFICATION', 'DISCUSSION', 'ASSIGNMENT', 'TEST'], instanceCount: { VLEARNING: 1, GAMIFICATION: 2, DISCUSSION: 1, ASSIGNMENT: 1, TEST: 1, MATERIAL: 2 } },
}, 'operations', 'Quản lý vận hành');
assert.equal(state.activeProjectId, 'ALPHA-2026');
assert.equal(state.tasks.filter((item) => item.projectId === 'ALPHA-2026').length, 11);
assert.ok(state.tasks.filter((item) => item.projectId === 'ALPHA-2026').every((item) => item.scopeLevel === 'class' && item.status === 'WAITING_INPUT'));

// UC02 — D03 accepts the user's source file without validating its business format.
state = command(state, 'SUBMIT_INPUT', { projectId: 'ALPHA-2026', courseId: 'ALPHA-CX', classId: 'ALPHA-CX-ALPHA01', inputKey: 'roster', sourceStepCode: 'UC02-B04', data: {}, validation: { valid: false, errors: ['Client could not parse this format.'] }, files: [{ name: 'alpha-roster-notes.txt', fileUrl: 'https://files.example/alpha-roster-notes.txt' }] }, 'intake', 'Đầu mối Alpha');
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-CX-ALPHA01:D03').activeVersion, 1);
assert.throws(
  () => command(createInitialTrainingOperationsState(), 'SUBMIT_INPUT', { projectId: 'EVNSPC-2026', courseId: 'CX-FOUNDATION', classId: 'TNKH01', inputKey: 'roster', data: {} }, 'intake', 'Đầu mối Alpha'),
  (error) => error?.code === 'INPUT_VALIDATION_FAILED' && error?.details?.errors?.includes('Cần đính kèm file danh sách học viên.'),
);

// UC03–UC07 — versioned content inputs D04–D08.
const contentInputs = {
  vlearning: { code: 'D04', step: 'UC03-B04', data: { content_name: 'VLearning Alpha', eln_count: 1, eln_structure: '01 phần / 01 bài', vimeo_links: 'https://vimeo.com/alpha' } },
  game: { code: 'D05', step: 'UC04-B04', data: { game_count: 1, game_content: 'Tình huống Alpha', play_limit: 3, schedule: '2026-10-10' } },
  discussion: { code: 'D06', step: 'UC05-B04', data: { discussion_count: 1, topic_content: 'Tình huống CSKH', mode: 'Nhóm', group_reference: 'D03.group_data' } },
  assignment: { code: 'D07', step: 'UC06-B04', data: { assignment_count: 1, assignment_brief: 'Bài thu hoạch', rubric_pass_score: 70, submission_rule: 'PDF, 01 lần' } },
  test: { code: 'D08', step: 'UC07-B04', data: { test_count: 1, question_bank: 'Bộ đề Alpha', test_structure: '20 câu', test_rule: '30 phút, đạt 70%' } },
};
for (const [key, definition] of Object.entries(contentInputs)) {
  state = command(state, 'SUBMIT_INPUT', { projectId: 'ALPHA-2026', inputKey: key, sourceStepCode: 'CLIENT_VALUE_MUST_NOT_OVERRIDE_TRACE', data: definition.data }, 'content', 'Chuyên viên nội dung');
  const version = state.inputs.find((item) => item.id === `ALPHA-CX:${definition.code}`).versions[0];
  assert.equal(version.status, 'ACTIVE');
  assert.equal(version.sourceDataCode, definition.code);
  assert.equal(version.sourceStepCode, definition.step);
}

// FB-01 — D05 accepts exactly 0/1/2/3 game links and preserves them as an array.
for (const gameCount of [0, 1, 2, 3]) {
  let dynamicState = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
  const gameContents = Array.from({ length: gameCount }, (_, index) => `https://game.example.vn/${index + 1}`);
  dynamicState = command(dynamicState, 'SUBMIT_INPUT', {
    projectId: 'EVNSPC-2026',
    inputKey: 'game',
    data: { game_count: gameCount, game_contents: gameContents, ...(gameCount ? { play_limit: 3, schedule: '2026-09-01' } : {}) },
  }, 'content', 'Chuyên viên nội dung');
  const savedData = dynamicState.inputs.find((item) => item.id === 'CX-FOUNDATION:D05').versions[0].data;
  assert.equal(savedData.game_count, gameCount);
  assert.deepEqual(savedData.game_contents, gameContents);
}

// UC08 — Content supplies the source material; VTraining executes T-109.
state = command(state, 'SUBMIT_INPUT', { projectId: 'ALPHA-2026', courseId: 'ALPHA-CX', inputKey: 'material', sourceStepCode: 'UC08-B04', data: { class_ids: ['ALPHA-CX-ALPHA01'], visible_from: '2026-10-10', visible_to: '2026-10-12', material_name_type: 'Hướng dẫn PDF' }, files: [{ name: 'guide.pdf', fileUrl: 'https://files.example/guide.pdf' }] }, 'content', 'Chuyên viên nội dung');
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-CX:D09').activeVersion, 1);
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-CX:D09').versions[0].sourceStepCode, 'UC08-B04');

// Live publishing cannot start merely because its own input exists: setup tasks must finish first.
const assignedLivePublishId = 'ALPHA-CX-ALPHA01-T-110';
state = command(state, 'ASSIGN_TASKS', { taskIds: [assignedLivePublishId], assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', priority: 'Normal', requireSeparation: true }, 'manager', 'Ngọc Trần');
const assignedLivePublish = state.tasks.find((item) => item.id === assignedLivePublishId);
assert.equal(assignedLivePublish.status, 'WAITING_INPUT');
assert.equal(assignedLivePublish.waitingReason, 'DEPENDENCY');
assert.ok(assignedLivePublish.blockingTaskIds.length > 0);

// UC09 + UC10 — generated task dependencies and assignment.
const discussionTaskId = 'ALPHA-CX-ALPHA01-T-104';
assert.deepEqual(state.tasks.find((item) => item.id === discussionTaskId).requiredInputCodes, ['D03', 'D06']);
state = command(state, 'ASSIGN_GROUP_MANAGER', { classCode: 'ALPHA-CX-ALPHA01', group: 'setup', managerId: 'manager-01', managerName: 'Ngọc Trần' }, 'operations', 'Quản lý vận hành');
assert.ok(state.tasks.filter((item) => item.classCode === 'ALPHA-CX-ALPHA01' && item.group === 'setup').every((item) => item.manager === 'Ngọc Trần' && item.assignee === 'Chưa giao'));
state = command(state, 'ASSIGN_TASKS', { taskIds: [discussionTaskId], assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', deadline: '2026-10-08', priority: 'High', requireSeparation: true }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).status, 'READY');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).deadlineStatus, 'ACTIVE');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).assignmentHistory.length, 1);
assert.ok(state.teamAssignments.some((item) => item.courseId === 'ALPHA-CX' && item.role === 'member' && item.accountId === 'member-01' && item.status === 'ACTIVE'));
assert.throws(() => command(state, 'ASSIGN_TASKS', { taskIds: [discussionTaskId], assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', deadline: '2026-10-11' }, 'manager', 'Ngọc Trần'), /lý do ngoại lệ/);

// UC11 — start and checklist/progress update.
assert.throws(() => commandAs(state, 'START_TASK', { taskId: discussionTaskId }, 'member', 'member-02', 'Thành viên khác'), /không phải người được giao/);
state = command(state, 'START_TASK', { taskId: discussionTaskId }, 'member', 'Nam Nguyễn');
const checklistLength = state.tasks.find((item) => item.id === discussionTaskId).checklist.length;
state = command(state, 'UPDATE_TASK_PROGRESS', { taskId: discussionTaskId, checklist: Array(checklistLength).fill(true), checklistEvidence: Array.from({ length: checklistLength }, (_, index) => [{ id: `CE-${index + 1}`, url: `https://evidence.example/check-${index + 1}` }]), blocker: '' }, 'member', 'Nam Nguyễn');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).progress, 100);

// UC12 + UC13 — output/evidence version and immutable submission snapshot.
state = command(state, 'SUBMIT_OUTPUT', { taskId: discussionTaskId, actualOutput: 'Đã khởi tạo và kiểm thử thảo luận.', evidence: [{ id: 'E-01', name: 'Danh sach lop.xlsx', path: 'private/evidence/danh-sach-lop.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }], metrics: { testAccounts: 2 } }, 'member', 'Nam Nguyễn');
state = command(state, 'SUBMIT_REVIEW', { taskId: discussionTaskId }, 'member', 'Nam Nguyễn');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).status, 'IN_REVIEW');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).submissions[0].taskSnapshot.output.version, 1);
assert.deepEqual(state.tasks.find((item) => item.id === discussionTaskId).submissions[0].taskSnapshot.output.evidence[0], { id: 'E-01', name: 'Danh sach lop.xlsx', path: 'private/evidence/danh-sach-lop.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
assert.throws(() => commandAs(state, 'REVIEW_TASK', { taskId: discussionTaskId, result: 'PASS', comment: 'Không có quyền.' }, 'manager', 'manager-02', 'Quản lý khác'), /không phải người duyệt/);

// UC14 — rework requires a comment, then pass completes at 100%.
assert.throws(() => command(state, 'REVIEW_TASK', { taskId: discussionTaskId, result: 'REWORK', comment: '' }, 'manager', 'Ngọc Trần'), /Comment/);
state = command(state, 'REVIEW_TASK', { taskId: discussionTaskId, result: 'REWORK', comment: 'Bổ sung ảnh kết quả tài khoản test.' }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).status, 'REWORK');
state = command(state, 'SUBMIT_REVIEW', { taskId: discussionTaskId, checklist: Array(checklistLength).fill(true), checklistEvidence: Array.from({ length: checklistLength }, (_, index) => [{ id: `CE-R-${index + 1}`, url: `https://minhchung.example/check-${index + 1}` }]), blocker: '', actualOutput: 'Đã bổ sung ảnh kiểm thử.', evidence: [{ id: 'E-02', url: 'https://vtraining.example/discussion/01-proof' }] }, 'member', 'Nam Nguyễn');
state = command(state, 'REVIEW_TASK', { taskId: discussionTaskId, result: 'PASS', comment: 'Đạt.' }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).status, 'DONE');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).progress, 100);

// FB-02/FB-07/FB-08 — 0% and no evidence may be reviewed; rework comment survives; PASS completes at 100%.
const zeroProgressTaskId = 'ALPHA-CX-ALPHA01-T-105';
state = command(state, 'ASSIGN_TASKS', { taskIds: [zeroProgressTaskId], assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', priority: 'Normal', requireSeparation: true }, 'manager', 'Ngọc Trần');
state = command(state, 'START_TASK', { taskId: zeroProgressTaskId }, 'member', 'Nam Nguyễn');
assert.equal(state.tasks.find((item) => item.id === zeroProgressTaskId).progress, 0);
state = command(state, 'SUBMIT_REVIEW', { taskId: zeroProgressTaskId, checklist: Array(state.tasks.find((item) => item.id === zeroProgressTaskId).checklist.length).fill(false), checklistEvidence: Array.from({ length: state.tasks.find((item) => item.id === zeroProgressTaskId).checklist.length }, () => []), blocker: '' }, 'member', 'Nam Nguyễn');
assert.equal(state.tasks.find((item) => item.id === zeroProgressTaskId).status, 'IN_REVIEW');
assert.equal(state.tasks.find((item) => item.id === zeroProgressTaskId).submissions.at(-1).taskSnapshot.output, null);
state = command(state, 'REVIEW_TASK', { taskId: zeroProgressTaskId, result: 'REWORK', comment: 'Bổ sung cấu hình thời gian làm bài.' }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === zeroProgressTaskId).progress, 0);
assert.equal(state.tasks.find((item) => item.id === zeroProgressTaskId).reviews.at(-1).comment, 'Bổ sung cấu hình thời gian làm bài.');
state = command(state, 'SUBMIT_REVIEW', { taskId: zeroProgressTaskId }, 'member', 'Nam Nguyễn');
state = command(state, 'REVIEW_TASK', { taskId: zeroProgressTaskId, result: 'PASS', comment: 'Đạt.' }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === zeroProgressTaskId).status, 'DONE');
assert.equal(state.tasks.find((item) => item.id === zeroProgressTaskId).progress, 100);
const livePublishTask = state.tasks.find((item) => item.id === 'ALPHA-CX-ALPHA01-T-110');
assert.ok(livePublishTask.dependsOnTaskIds.some((id) => id.endsWith('T-109')));
assert.equal(livePublishTask.status, 'WAITING_INPUT');

// UC15 — new input version, diff and affected-task decision.
state = command(state, 'SUBMIT_INPUT_VERSION', { projectId: 'ALPHA-2026', inputKey: 'game', sourceStepCode: 'UC15-B03', data: { game_count: 2, game_contents: ['Tình huống Alpha v2', 'Tình huống Alpha bổ sung'], play_limit: 3, schedule: '2026-10-10' }, reason: 'Khách hàng cập nhật nội dung game.', effectiveAt: '2026-09-20T00:00:00.000Z' }, 'content', 'Chuyên viên nội dung');
const gameTask = state.tasks.find((item) => item.id === 'ALPHA-CX-ALPHA01-T-107');
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-CX:D05').activeVersion, 2);
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-CX:D05').versions[1].sourceStepCode, 'UC15-B03');
assert.deepEqual(state.inputs.find((item) => item.id === 'ALPHA-CX:D05').versions[1].data.game_contents, ['Tình huống Alpha v2', 'Tình huống Alpha bổ sung']);
assert.throws(() => command(state, 'SUBMIT_INPUT_VERSION', { projectId: 'ALPHA-2026', inputKey: 'game', data: { game_count: 3, game_contents: ['Một', 'Hai'], play_limit: 3, schedule: '2026-10-10' }, reason: 'Thiếu nội dung game.' }, 'content', 'Chuyên viên nội dung'), /Input chưa hợp lệ/);
assert.equal(gameTask.inputImpact.decision, 'PENDING');
state = command(state, 'RESOLVE_INPUT_IMPACT', { taskIds: [gameTask.id], decision: 'REWORK' }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === gameTask.id).status, 'REWORK');

// A content-only approval does not create a new scope version.
const scopeVersionBeforeContentRequest = state.projects.find((item) => item.id === 'ALPHA-2026').scopeVersion;
state = command(state, 'REQUEST_SCOPE_CHANGE', { projectId: 'ALPHA-2026', courseId: 'ALPHA-CX', changeType: 'content', objectKey: 'discussion', proposed: { source: 'system' }, reason: 'Đổi nội dung thảo luận nhưng giữ nguyên phạm vi.' }, 'intake', 'Đầu mối Alpha');
const contentRequest = state.changeRequests.at(-1);
state = command(state, 'APPROVE_SCOPE_CHANGE', { changeRequestId: contentRequest.id }, 'operations', 'Quản lý vận hành');
assert.equal(state.projects.find((item) => item.id === 'ALPHA-2026').scopeVersion, scopeVersionBeforeContentRequest);
assert.equal(state.changeRequests.at(-1).status, 'APPROVED');

// UC16 — request first, approve later, preserve old tasks and create scope v2.
const taskCountBeforeScope = state.tasks.length;
state = command(state, 'REQUEST_SCOPE_CHANGE', { projectId: 'ALPHA-2026', courseId: 'ALPHA-CX', changeType: 'quantity', objectKey: 'game', proposed: { nextCount: 3 }, reason: 'Bổ sung một game cho mỗi lớp.', effectiveAt: '2026-09-25T00:00:00.000Z' }, 'intake', 'Đầu mối Alpha');
const request = state.changeRequests.at(-1);
assert.equal(request.status, 'PENDING');
assert.equal(state.tasks.length, taskCountBeforeScope);
state = command(state, 'APPROVE_SCOPE_CHANGE', { changeRequestId: request.id }, 'operations', 'Quản lý vận hành');
assert.equal(state.changeRequests.at(-1).status, 'APPROVED');
assert.equal(state.projects.find((item) => item.id === 'ALPHA-2026').scopeVersion, 2);
assert.equal(state.tasks.length, taskCountBeforeScope + 1);
assert.ok(state.auditEvents.some((item) => item.type === 'SCOPE_CHANGE_APPROVED'));

// Server-side authorization remains the boundary, not hidden UI controls.
assert.throws(() => command(state, 'SUBMIT_INPUT_VERSION', { projectId: 'ALPHA-2026', inputKey: 'roster', data: { classes: [{ code: 'ALPHA01' }] }, reason: 'Không hợp lệ' }, 'content', 'Chuyên viên nội dung'), /không sở hữu/);

// FB2 — class-scoped D03 only affects tasks of the selected class.
let fb2State = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
fb2State = command(fb2State, 'SUBMIT_INPUT', { projectId: 'EVNSPC-2026', courseId: 'CX-FOUNDATION', classId: 'TNKH01', inputKey: 'roster', files: [{ name: 'anything.bin', fileUrl: 'https://files.example/anything.bin' }] }, 'intake', 'Đầu mối');
const rosterAudit = fb2State.auditEvents.at(-1);
assert.ok(rosterAudit.details.affectedTaskIds.length > 0);
assert.ok(rosterAudit.details.affectedTaskIds.every((id) => id.startsWith('CX-FOUNDATION-TNKH01-')));
assert.equal(fb2State.inputs.find((item) => item.id === 'TNKH02:D03').status, 'MISSING');

// FB2 — add a detached course, course-prefixed class IDs and course-local team roles.
fb2State = command(fb2State, 'CREATE_COURSE', {
  projectId: 'EVNSPC-2026',
  course: { id: 'CX-ADVANCED', name: 'Trải nghiệm khách hàng nâng cao', systems: ['VTraining'], activities: ['VTRAINING'] },
  classes: [{ id: 'L01', name: 'Lớp nâng cao 01', startDate: '2026-10-01', endDate: '2026-10-03' }],
  scope: { selectedContents: ['VTRAINING'], instanceCount: { MATERIAL: 1 } },
}, 'operations', 'Quản lý vận hành');
assert.ok(fb2State.classes.some((item) => item.id === 'CX-ADVANCED-L01'));
assert.ok(fb2State.tasks.filter((item) => item.courseId === 'CX-ADVANCED').every((item) => item.id.startsWith('CX-ADVANCED-L01-')));
fb2State = command(fb2State, 'ASSIGN_COURSE_ROLE', { courseId: 'CX-ADVANCED', role: 'manager', accountId: 'manager-01', accountName: 'Ngọc Trần' }, 'operations', 'Quản lý vận hành');
assert.ok(fb2State.teamAssignments.some((item) => item.courseId === 'CX-ADVANCED' && item.role === 'manager' && item.accountId === 'manager-01'));
fb2State = command(fb2State, 'ASSIGN_COURSE_ROLE', { courseId: 'CX-ADVANCED', role: 'member', accountId: 'member-01', accountName: 'Nam Nguyễn' }, 'operations', 'Quản lý vận hành');
assert.ok(fb2State.teamAssignments.some((item) => item.courseId === 'CX-ADVANCED' && item.role === 'member' && item.accountId === 'member-01'));
assert.ok(fb2State.tasks.filter((item) => item.courseId === 'CX-ADVANCED').every((item) => !item.assigneeId));
const retainedAssignmentTaskId = fb2State.tasks.find((item) => item.courseId === 'CX-ADVANCED').id;
fb2State = commandAs(fb2State, 'ASSIGN_TASKS', { taskIds: [retainedAssignmentTaskId], assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', priority: 'Normal', requireSeparation: true }, 'manager', 'manager-01', 'Ngọc Trần');
const completedHistoricalTask = fb2State.tasks.find((item) => item.courseId === 'CX-ADVANCED' && item.id !== retainedAssignmentTaskId);
const completedHistoricalTaskId = completedHistoricalTask.id;
Object.assign(completedHistoricalTask, { status: 'DONE', assigneeId: 'member-01', assignee: 'Nam Nguyễn', managerId: 'manager-01', manager: 'Ngọc Trần', reviewerId: 'manager-01', reviewer: 'Ngọc Trần' });
completedHistoricalTask.assignmentHistory.push({ assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', assignedAt: new Date(clock.value += 1000).toISOString() });
const inProgressTaskId = fb2State.tasks.find((item) => item.courseId === 'CX-ADVANCED' && ![retainedAssignmentTaskId, completedHistoricalTaskId].includes(item.id)).id;
fb2State = commandAs(fb2State, 'ASSIGN_TASKS', { taskIds: [inProgressTaskId], assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', priority: 'Normal', requireSeparation: true }, 'manager', 'manager-01', 'Ngọc Trần');
fb2State.tasks.find((item) => item.id === inProgressTaskId).status = 'IN_PROGRESS';
const cancelledHistoricalTask = fb2State.tasks.find((item) => item.courseId === 'CX-ADVANCED' && ![retainedAssignmentTaskId, completedHistoricalTaskId, inProgressTaskId].includes(item.id));
const cancelledHistoricalTaskId = cancelledHistoricalTask.id;
Object.assign(cancelledHistoricalTask, { status: 'CANCELLED', assigneeId: 'member-01', assignee: 'Nam Nguyễn', managerId: 'manager-01', manager: 'Ngọc Trần', reviewerId: 'manager-01', reviewer: 'Ngọc Trần' });
fb2State = command(fb2State, 'REMOVE_COURSE_ROLE', { courseId: 'CX-ADVANCED', role: 'member', accountId: 'member-01' }, 'operations', 'Quản lý vận hành');
assert.equal(fb2State.teamAssignments.find((item) => item.courseId === 'CX-ADVANCED' && item.role === 'member' && item.accountId === 'member-01').status, 'ARCHIVED');
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).assigneeId, null);
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).assignee, 'Chưa giao');
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).status, 'UNASSIGNED');
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).assignmentStatus, 'UNASSIGNED');
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).assignmentHistory.at(-1).assigneeId, 'member-01');
assert.equal(fb2State.tasks.find((item) => item.id === inProgressTaskId).status, 'NEEDS_REASSIGNMENT');
assert.equal(fb2State.tasks.find((item) => item.id === inProgressTaskId).resumeStatus, 'IN_PROGRESS');
assert.equal(fb2State.tasks.find((item) => item.id === inProgressTaskId).assigneeId, null);
assert.equal(fb2State.tasks.find((item) => item.id === completedHistoricalTaskId).assigneeId, 'member-01');
assert.equal(fb2State.tasks.find((item) => item.id === cancelledHistoricalTaskId).assigneeId, 'member-01');
assert.throws(() => commandAs(fb2State, 'UPDATE_TASK_PROGRESS', { taskId: inProgressTaskId, checklist: fb2State.tasks.find((item) => item.id === inProgressTaskId).checklist }, 'member', 'member-01', 'Nam Nguyễn'), /không phải người được giao/);
assert.ok(fb2State.auditEvents.some((item) => item.type === 'COURSE_ROLE_REMOVED' && item.details.affectedTaskIds.includes(retainedAssignmentTaskId)));
fb2State = commandAs(fb2State, 'ASSIGN_TASKS', { taskIds: [retainedAssignmentTaskId], assigneeId: 'member-02', assigneeName: 'Chiếu Anh', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', priority: 'Normal', requireSeparation: true }, 'manager', 'manager-01', 'Ngọc Trần');
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).assignmentStatus, null);
fb2State = command(fb2State, 'REMOVE_COURSE_ROLE', { courseId: 'CX-ADVANCED', role: 'manager', accountId: 'manager-01' }, 'operations', 'Quản lý vận hành');
assert.equal(fb2State.teamAssignments.find((item) => item.courseId === 'CX-ADVANCED' && item.role === 'manager' && item.accountId === 'manager-01').status, 'ARCHIVED');
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).reviewerId, null);
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).assignmentStatus, 'UNASSIGNED');
assert.equal(fb2State.tasks.find((item) => item.id === inProgressTaskId).reviewerId, null);
assert.equal(fb2State.tasks.find((item) => item.id === inProgressTaskId).status, 'NEEDS_REASSIGNMENT');
assert.equal(fb2State.tasks.find((item) => item.id === completedHistoricalTaskId).reviewerId, 'manager-01');
assert.equal(fb2State.tasks.find((item) => item.id === cancelledHistoricalTaskId).reviewerId, 'manager-01');
fb2State = command(fb2State, 'ASSIGN_COURSE_ROLE', { courseId: 'CX-ADVANCED', role: 'manager', accountId: 'manager-02', accountName: 'Kim Ánh' }, 'operations', 'Quản lý vận hành');
assert.equal(fb2State.teamAssignments.find((item) => item.courseId === 'CX-ADVANCED' && item.role === 'manager' && item.accountId === 'manager-01').status, 'ARCHIVED');
assert.ok(fb2State.tasks.filter((item) => item.courseId === 'CX-ADVANCED' && !['DONE', 'CANCELLED'].includes(item.status)).every((item) => item.managerId === 'manager-02' && item.reviewerId === 'manager-02'));
assert.equal(fb2State.tasks.find((item) => item.id === retainedAssignmentTaskId).assignmentStatus, null);
assert.equal(fb2State.tasks.find((item) => item.id === inProgressTaskId).assignmentStatus, 'NEEDS_REASSIGNMENT');
fb2State = commandAs(fb2State, 'ASSIGN_TASKS', { taskIds: [inProgressTaskId], assigneeId: 'member-02', assigneeName: 'Chiếu Anh', reviewerId: 'manager-02', reviewerName: 'Kim Ánh', priority: 'Normal', requireSeparation: true }, 'manager', 'manager-02', 'Kim Ánh');
assert.equal(fb2State.tasks.find((item) => item.id === inProgressTaskId).status, 'IN_PROGRESS');
assert.equal(fb2State.tasks.find((item) => item.id === inProgressTaskId).assignmentStatus, null);
assert.equal(fb2State.tasks.find((item) => item.id === completedHistoricalTaskId).reviewerId, 'manager-01');
const staleRemovedMemberState = structuredClone(fb2State);
const staleOpenTask = staleRemovedMemberState.tasks.find((item) => item.courseId === 'CX-ADVANCED' && !['DONE', 'CANCELLED'].includes(item.status));
Object.assign(staleOpenTask, { status: 'IN_PROGRESS', assigneeId: 'thao-01', assignee: 'Thảo Nguyễn Phương', assignmentStatus: null, assignmentReason: null });
const staleDoneTask = staleRemovedMemberState.tasks.find((item) => item.id === completedHistoricalTaskId);
Object.assign(staleDoneTask, { assigneeId: 'thao-01', assignee: 'Thảo Nguyễn Phương' });
staleRemovedMemberState.teamAssignments.push({ id: 'CX-ADVANCED:member:thao-01', projectId: 'EVNSPC-2026', courseId: 'CX-ADVANCED', role: 'member', accountId: 'thao-01', accountName: 'Thảo Nguyễn Phương', status: 'ARCHIVED' });
const reconciledRemovedMemberState = normalizeTrainingOperationsState(staleRemovedMemberState, { now: new Date(clock.value += 1000).toISOString() });
assert.equal(reconciledRemovedMemberState.tasks.find((item) => item.id === staleOpenTask.id).assigneeId, null);
assert.equal(reconciledRemovedMemberState.tasks.find((item) => item.id === staleOpenTask.id).status, 'NEEDS_REASSIGNMENT');
assert.equal(reconciledRemovedMemberState.tasks.find((item) => item.id === completedHistoricalTaskId).assignee, 'Thảo Nguyễn Phương');
fb2State = commandAs(fb2State, 'UPDATE_COURSE_STATUS', { courseId: 'CX-ADVANCED', status: 'ACTIVE' }, 'manager', 'manager-02', 'Kim Ánh');
assert.equal(fb2State.courses.find((item) => item.id === 'CX-ADVANCED').status, 'ACTIVE');
fb2State = command(fb2State, 'COPY_COURSE_CONFIG', { sourceCourseId: 'CX-FOUNDATION', targetCourseId: 'CX-ADVANCED' }, 'operations', 'Quản lý vận hành');
assert.equal(fb2State.courses.find((item) => item.id === 'CX-ADVANCED').copiedFromCourseId, 'CX-FOUNDATION');

// Single-course change: assigned course manager may approve. Cross-course/governance: operations only.
fb2State = command(fb2State, 'REQUEST_SCOPE_CHANGE', { projectId: 'EVNSPC-2026', courseId: 'CX-ADVANCED', changeType: 'content', objectKey: 'material', reason: 'Đổi tài liệu trong một khóa.' }, 'intake', 'Đầu mối');
let fb2Request = fb2State.changeRequests.at(-1);
assert.equal(fb2Request.approvalLevel, 'COURSE_MANAGER');
fb2State = commandAs(fb2State, 'APPROVE_SCOPE_CHANGE', { changeRequestId: fb2Request.id }, 'manager', 'manager-02', 'Kim Ánh');
fb2State = command(fb2State, 'REQUEST_SCOPE_CHANGE', { projectId: 'EVNSPC-2026', affectedCourseIds: ['CX-FOUNDATION', 'CX-ADVANCED'], governanceImpact: { cost: true }, changeType: 'content', objectKey: 'material', reason: 'Thay đổi chi phí liên khóa.' }, 'intake', 'Đầu mối');
fb2Request = fb2State.changeRequests.at(-1);
assert.equal(fb2Request.approvalLevel, 'OPERATIONS');
assert.throws(() => commandAs(fb2State, 'APPROVE_SCOPE_CHANGE', { changeRequestId: fb2Request.id }, 'manager', 'manager-02', 'Kim Ánh'), /Quản lý vận hành/);
fb2State = command(fb2State, 'APPROVE_SCOPE_CHANGE', { changeRequestId: fb2Request.id }, 'operations', 'Quản lý vận hành');
assert.equal(fb2State.changeRequests.at(-1).status, 'APPROVED');

// Multi-course creation is one domain command, so a failure cannot persist a partial project.
let bundleState = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
bundleState = command(bundleState, 'CREATE_PROJECT_BUNDLE', {
  project: { id: 'BUNDLE-2026', name: 'Dự án nhiều khóa', customerName: 'EVN', startDate: '2026-11-01', deadline: '2026-12-31', classCount: 1 },
  course: { id: 'QL01A', name: 'QL01A', systems: ['VTraining'] },
  classes: [{ id: 'L01', name: 'Lớp QL01A', startDate: '2026-11-01', endDate: '2026-11-02' }],
  scope: { selectedContents: ['VTRAINING'] },
  additionalCourses: [{
    course: { id: 'QL01B', name: 'QL01B', systems: ['VTraining'] },
    classes: [{ id: 'L01', name: 'Lớp QL01B', startDate: '2026-11-08', endDate: '2026-11-09' }],
    scope: { selectedContents: ['VTRAINING'] },
  }],
}, 'operations', 'Quản lý vận hành');
assert.equal(bundleState.courses.filter((item) => item.projectId === 'BUNDLE-2026').length, 2);
assert.ok(bundleState.auditEvents.some((item) => item.type === 'PROJECT_BUNDLE_CREATED'));

const atomicBase = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
assert.throws(() => command(atomicBase, 'CREATE_PROJECT_BUNDLE', {
  project: { id: 'ATOMIC-2026', name: 'Kiểm tra atomic', customerName: 'EVN', startDate: '2026-11-01', deadline: '2026-12-31', classCount: 1 },
  course: { id: 'ATOMIC-A', name: 'Khóa hợp lệ', systems: ['VTraining'] },
  classes: [{ id: 'L01', name: 'Lớp hợp lệ', startDate: '2026-11-01', endDate: '2026-11-02' }],
  scope: { selectedContents: ['VTRAINING'] },
  additionalCourses: [{ course: { id: 'ATOMIC-B', name: 'Khóa lỗi', systems: ['VTraining'] }, classes: [], scope: { selectedContents: ['VTRAINING'] } }],
}, 'operations', 'Quản lý vận hành'), /ít nhất một lớp/);
assert.equal(atomicBase.projects.some((item) => item.id === 'ATOMIC-2026'), false);

// Course duplication creates a new course while copying configuration only.
let duplicateState = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
duplicateState = command(duplicateState, 'UPDATE_TASK_CONFIG', { taskId: 'CX-FOUNDATION-TNKH01-T-101', dueOffset: 5, checklistItems: ['Tiêu chí cấu hình riêng'] }, 'vtraining', 'Chuyên viên VTraining');
duplicateState = command(duplicateState, 'CREATE_COURSE', {
  projectId: 'EVNSPC-2026',
  copyFromCourseId: 'CX-FOUNDATION',
  course: { id: 'CX-FOUNDATION-COPY', name: 'Trải nghiệm khách hàng · Bản sao' },
  classes: [{ id: 'L01', name: 'Lớp 01 · Bản sao', startDate: '2026-11-01', endDate: '2026-11-03' }],
}, 'operations', 'Quản lý vận hành');
const duplicatedCourse = duplicateState.courses.find((item) => item.id === 'CX-FOUNDATION-COPY');
const duplicatedTask = duplicateState.tasks.find((item) => item.id === 'CX-FOUNDATION-COPY-L01-T-101');
assert.equal(duplicatedCourse.copiedFromCourseId, 'CX-FOUNDATION');
assert.equal(duplicatedTask.dueOffset, 5);
assert.deepEqual(duplicatedTask.checklistItems, ['Tiêu chí cấu hình riêng']);
assert.ok(duplicateState.auditEvents.some((item) => item.type === 'COURSE_DUPLICATED' && item.entityId === 'CX-FOUNDATION-COPY'));

// Class task maintenance — assigned managers may append, edit, reorder and soft-delete tasks.
let taskMaintenanceState = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
assert.throws(
  () => command(taskMaintenanceState, 'CREATE_CLASS_TASK', { classId: 'TNKH01', title: 'Thiếu người xác nhận', group: 'setup', checklistItems: ['Tiêu chí'] }, 'operations', 'Quản lý vận hành'),
  /chưa có Quản lý ekip để làm Người xác nhận/,
  'A task must not be created before the course manager/reviewer is assigned.',
);
taskMaintenanceState = command(taskMaintenanceState, 'ASSIGN_COURSE_ROLE', { courseId: 'CX-FOUNDATION', role: 'manager', accountId: 'manager-01', accountName: 'Ngọc Trần', accountEmail: 'manager@peopleone.vn' }, 'operations', 'Quản lý vận hành');
const setupOrderBefore = Math.max(...taskMaintenanceState.tasks.filter((item) => item.classId === 'TNKH01' && item.group === 'setup').map((item) => item.sortOrder));
taskMaintenanceState = commandAs(taskMaintenanceState, 'CREATE_CLASS_TASK', { classId: 'TNKH01', title: 'Việc mới A', group: 'setup', inputKey: 'roster', dueOffset: 1, checklistItems: ['Tiêu chí A'] }, 'manager', 'manager-01', 'Ngọc Trần');
taskMaintenanceState = commandAs(taskMaintenanceState, 'CREATE_CLASS_TASK', { classId: 'TNKH01', title: 'Việc mới B', group: 'setup', inputKey: 'roster', dueOffset: 1, checklistItems: ['Tiêu chí B'] }, 'manager', 'manager-01', 'Ngọc Trần');
const customA = taskMaintenanceState.tasks.find((item) => item.title === 'Việc mới A');
const customB = taskMaintenanceState.tasks.find((item) => item.title === 'Việc mới B');
assert.ok(customA.sortOrder > setupOrderBefore && customB.sortOrder > customA.sortOrder, 'New tasks must append to the selected group instead of jumping to the top.');
assert.equal(customA.managerId, 'manager-01');
assert.equal(customA.reviewerId, 'manager-01');
taskMaintenanceState = commandAs(taskMaintenanceState, 'MOVE_CLASS_TASK', { taskId: customB.id, direction: 'UP' }, 'manager', 'manager-01', 'Ngọc Trần');
assert.ok(taskMaintenanceState.tasks.find((item) => item.id === customB.id).sortOrder < taskMaintenanceState.tasks.find((item) => item.id === customA.id).sortOrder);
taskMaintenanceState = commandAs(taskMaintenanceState, 'UPDATE_TASK_CONFIG', { taskId: customA.id, title: 'Việc mới A đã sửa', checklistItems: ['Tiêu chí đã sửa'] }, 'manager', 'manager-01', 'Ngọc Trần');
assert.equal(taskMaintenanceState.tasks.find((item) => item.id === customA.id).title, 'Việc mới A đã sửa');
taskMaintenanceState = commandAs(taskMaintenanceState, 'ARCHIVE_TASK', { taskId: customA.id, reason: 'Không còn áp dụng.' }, 'manager', 'manager-01', 'Ngọc Trần');
assert.equal(taskMaintenanceState.tasks.find((item) => item.id === customA.id).status, 'CANCELLED');
assert.throws(() => commandAs(taskMaintenanceState, 'CREATE_CLASS_TASK', { classId: 'TNKH01', title: 'Ngoài phạm vi', group: 'setup', checklistItems: ['Không hợp lệ'] }, 'manager', 'manager-02', 'Quản lý khác'), /không phải Quản lý khóa học/);

console.log('V-Work Training Operations domain UC01-UC16 and FB2 course model passed.');

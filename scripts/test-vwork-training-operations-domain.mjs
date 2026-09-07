import assert from 'node:assert/strict';
import {
  applyTrainingOperationsCommand,
  createInitialTrainingOperationsState,
  summarizeTrainingOperationsState,
} from '../src/modules/vplanning/trainingOperations/domain.js';

const clock = { value: Date.parse('2026-08-25T01:00:00.000Z') };
const context = (role, name) => ({ role, actor: { id: `${role}-01`, email: `${role}@peopleone.vn`, name, role }, now: new Date(clock.value += 1000).toISOString() });
const command = (state, type, payload, role, name = role) => applyTrainingOperationsCommand(state, { type, payload }, context(role, name));
const commandAs = (state, type, payload, role, id, name) => applyTrainingOperationsCommand(state, { type, payload }, { role, actor: { id, email: `${id}@peopleone.vn`, name, role }, now: new Date(clock.value += 1000).toISOString() });

let state = createInitialTrainingOperationsState({ now: '2026-08-25T00:00:00.000Z' });
const initialSummary = summarizeTrainingOperationsState(state);
assert.deepEqual(initialSummary, { projects: 1, courses: 1, classes: 3, inputs: 7, tasks: 33, changeRequests: 0, auditEvents: 1 });

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
state = command(state, 'SUBMIT_INPUT', { projectId: 'ALPHA-2026', inputKey: 'roster', sourceStepCode: 'UC02-B04', data: {}, validation: { valid: false, errors: ['Client could not parse this format.'] }, files: [{ name: 'alpha-roster-notes.txt', fileUrl: 'https://files.example/alpha-roster-notes.txt' }] }, 'intake', 'Đầu mối Alpha');
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-2026:D03').activeVersion, 1);
assert.throws(
  () => command(createInitialTrainingOperationsState(), 'SUBMIT_INPUT', { projectId: 'EVNSPC-2026', inputKey: 'roster', data: {} }, 'intake', 'Đầu mối Alpha'),
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
  const version = state.inputs.find((item) => item.id === `ALPHA-2026:${definition.code}`).versions[0];
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
  const savedData = dynamicState.inputs.find((item) => item.id === 'EVNSPC-2026:D05').versions[0].data;
  assert.equal(savedData.game_count, gameCount);
  assert.deepEqual(savedData.game_contents, gameContents);
}

// UC08 — VTraining material assignment D09.
state = command(state, 'SUBMIT_INPUT', { projectId: 'ALPHA-2026', inputKey: 'material', sourceStepCode: 'UC08-B04', data: { class_ids: ['ALPHA01'], visible_from: '2026-10-10', visible_to: '2026-10-12', material_name_type: 'Hướng dẫn PDF' }, files: [{ name: 'guide.pdf', fileUrl: 'https://files.example/guide.pdf' }] }, 'vtraining', 'VTraining Ops');
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-2026:D09').activeVersion, 1);
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-2026:D09').versions[0].sourceStepCode, 'UC08-B04');

// UC09 + UC10 — generated task dependencies and assignment.
const discussionTaskId = 'ALPHA01-T-104';
assert.deepEqual(state.tasks.find((item) => item.id === discussionTaskId).requiredInputCodes, ['D03', 'D06']);
state = command(state, 'ASSIGN_GROUP_MANAGER', { classCode: 'ALPHA01', group: 'setup', managerId: 'manager-01', managerName: 'Ngọc Trần' }, 'operations', 'Quản lý vận hành');
assert.ok(state.tasks.filter((item) => item.classCode === 'ALPHA01' && item.group === 'setup').every((item) => item.manager === 'Ngọc Trần' && item.assignee === 'Chưa giao'));
state = command(state, 'ASSIGN_TASKS', { taskIds: [discussionTaskId], assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', deadline: '2026-10-08', priority: 'High', requireSeparation: true }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).status, 'READY');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).deadlineStatus, 'ACTIVE');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).assignmentHistory.length, 1);
assert.throws(() => command(state, 'ASSIGN_TASKS', { taskIds: [discussionTaskId], assigneeId: 'member-01', assigneeName: 'Nam Nguyễn', reviewerId: 'manager-01', reviewerName: 'Ngọc Trần', deadline: '2026-10-11' }, 'manager', 'Ngọc Trần'), /lý do ngoại lệ/);

// UC11 — start and checklist/progress update.
assert.throws(() => commandAs(state, 'START_TASK', { taskId: discussionTaskId }, 'member', 'member-02', 'Thành viên khác'), /không phải người được giao/);
state = command(state, 'START_TASK', { taskId: discussionTaskId }, 'member', 'Nam Nguyễn');
const checklistLength = state.tasks.find((item) => item.id === discussionTaskId).checklist.length;
state = command(state, 'UPDATE_TASK_PROGRESS', { taskId: discussionTaskId, checklist: Array(checklistLength).fill(true), blocker: '' }, 'member', 'Nam Nguyễn');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).progress, 70);

// UC12 + UC13 — output/evidence version and immutable submission snapshot.
state = command(state, 'SUBMIT_OUTPUT', { taskId: discussionTaskId, actualOutput: 'Đã khởi tạo và kiểm thử thảo luận.', evidence: [{ id: 'E-01', url: 'https://vtraining.example/discussion/01' }], metrics: { testAccounts: 2 } }, 'member', 'Nam Nguyễn');
state = command(state, 'SUBMIT_REVIEW', { taskId: discussionTaskId }, 'member', 'Nam Nguyễn');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).status, 'IN_REVIEW');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).submissions[0].taskSnapshot.output.version, 1);
assert.throws(() => commandAs(state, 'REVIEW_TASK', { taskId: discussionTaskId, result: 'PASS', comment: 'Không có quyền.' }, 'manager', 'manager-02', 'Quản lý khác'), /không phải người duyệt/);

// UC14 — rework requires a comment, then pass completes at 100%.
assert.throws(() => command(state, 'REVIEW_TASK', { taskId: discussionTaskId, result: 'REWORK', comment: '' }, 'manager', 'Ngọc Trần'), /Comment/);
state = command(state, 'REVIEW_TASK', { taskId: discussionTaskId, result: 'REWORK', comment: 'Bổ sung ảnh kết quả tài khoản test.' }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).status, 'REWORK');
state = command(state, 'SUBMIT_OUTPUT', { taskId: discussionTaskId, actualOutput: 'Đã bổ sung ảnh kiểm thử.', evidence: [{ id: 'E-02', url: 'https://vtraining.example/discussion/01-proof' }] }, 'member', 'Nam Nguyễn');
state = command(state, 'SUBMIT_REVIEW', { taskId: discussionTaskId }, 'member', 'Nam Nguyễn');
state = command(state, 'REVIEW_TASK', { taskId: discussionTaskId, result: 'PASS', comment: 'Đạt.' }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).status, 'DONE');
assert.equal(state.tasks.find((item) => item.id === discussionTaskId).progress, 100);

// UC15 — new input version, diff and affected-task decision.
state = command(state, 'SUBMIT_INPUT_VERSION', { projectId: 'ALPHA-2026', inputKey: 'game', sourceStepCode: 'UC15-B03', data: { game_count: 2, game_contents: ['Tình huống Alpha v2', 'Tình huống Alpha bổ sung'], play_limit: 3, schedule: '2026-10-10' }, reason: 'Khách hàng cập nhật nội dung game.', effectiveAt: '2026-09-20T00:00:00.000Z' }, 'content', 'Chuyên viên nội dung');
const gameTask = state.tasks.find((item) => item.id === 'ALPHA01-T-107');
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-2026:D05').activeVersion, 2);
assert.equal(state.inputs.find((item) => item.id === 'ALPHA-2026:D05').versions[1].sourceStepCode, 'UC15-B03');
assert.deepEqual(state.inputs.find((item) => item.id === 'ALPHA-2026:D05').versions[1].data.game_contents, ['Tình huống Alpha v2', 'Tình huống Alpha bổ sung']);
assert.throws(() => command(state, 'SUBMIT_INPUT_VERSION', { projectId: 'ALPHA-2026', inputKey: 'game', data: { game_count: 3, game_contents: ['Một', 'Hai'], play_limit: 3, schedule: '2026-10-10' }, reason: 'Thiếu nội dung game.' }, 'content', 'Chuyên viên nội dung'), /Input chưa hợp lệ/);
assert.equal(gameTask.inputImpact.decision, 'PENDING');
state = command(state, 'RESOLVE_INPUT_IMPACT', { taskIds: [gameTask.id], decision: 'REWORK' }, 'manager', 'Ngọc Trần');
assert.equal(state.tasks.find((item) => item.id === gameTask.id).status, 'REWORK');

// A content-only approval does not create a new scope version.
const scopeVersionBeforeContentRequest = state.projects.find((item) => item.id === 'ALPHA-2026').scopeVersion;
state = command(state, 'REQUEST_SCOPE_CHANGE', { projectId: 'ALPHA-2026', changeType: 'content', objectKey: 'discussion', proposed: { source: 'system' }, reason: 'Đổi nội dung thảo luận nhưng giữ nguyên phạm vi.' }, 'intake', 'Đầu mối Alpha');
const contentRequest = state.changeRequests.at(-1);
state = command(state, 'APPROVE_SCOPE_CHANGE', { changeRequestId: contentRequest.id }, 'operations', 'Quản lý vận hành');
assert.equal(state.projects.find((item) => item.id === 'ALPHA-2026').scopeVersion, scopeVersionBeforeContentRequest);
assert.equal(state.changeRequests.at(-1).status, 'APPROVED');

// UC16 — request first, approve later, preserve old tasks and create scope v2.
const taskCountBeforeScope = state.tasks.length;
state = command(state, 'REQUEST_SCOPE_CHANGE', { projectId: 'ALPHA-2026', changeType: 'quantity', objectKey: 'game', proposed: { nextCount: 3 }, reason: 'Bổ sung một game cho mỗi lớp.', effectiveAt: '2026-09-25T00:00:00.000Z' }, 'intake', 'Đầu mối Alpha');
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

console.log('V-Work Training Operations domain UC01-UC16 passed.');

import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_ANON_KEY = 'anon-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';

const calls = [];
let persistedRequest = null;
let lastPersistedBody = null;
globalThis.fetch = async (url, options = {}) => {
  const value = String(url);
  calls.push({ url: value, method: options.method || 'GET', headers: options.headers, body: options.body });
  if (value.endsWith('/auth/v1/user')) return Response.json({ id: 'auth-operations', email: 'ops@peopleone.vn' });
  if (value.includes('/vcontent_profiles?select=id,email,full_name') && !value.includes('auth_user_id=') && !value.includes('email=eq.')) return Response.json([
    { id: 'profile-operations', email: 'ops@peopleone.vn', full_name: 'Quản trị đa vai', role: 'training_ops_admin', active: true, auth_user_id: 'auth-operations', vplanning_roles: ['vplanning_admin'] },
    { id: 'profile-manager', email: 'manager@peopleone.vn', full_name: 'Ngọc Trần', role: 'user', active: true, vplanning_roles: ['vplanning_manager'] },
    { id: 'profile-member', email: 'member@peopleone.vn', full_name: 'Nam Nguyễn', role: 'user', active: true, vplanning_roles: ['vplanning_member'] },
    { id: 'profile-scoped', email: 'scoped@peopleone.vn', full_name: 'Ngoài phạm vi', role: 'user', active: true, vplanning_roles: ['vplanning_member'] },
    { id: 'profile-chieu-anh', email: 'chieuanh.old@gmail.com', full_name: 'Chiêu Anh', role: 'user', active: true, auth_user_id: 'auth-chieu-anh', vplanning_roles: ['vplanning_member'] },
    { id: 'profile-content', email: 'content@peopleone.vn', full_name: 'Chỉ nội dung', role: 'user', active: true, vplanning_roles: ['vplanning_content'] },
    { id: 'profile-inactive', email: 'inactive@peopleone.vn', full_name: 'Đã khóa', role: 'user', active: false, vplanning_roles: ['vplanning_member'] },
  ]);
  if (value.includes('/vcontent_profiles?')) return Response.json([{ id: 'profile-operations', email: 'ops@peopleone.vn', full_name: 'Quản trị đa vai', role: 'training_ops_admin', active: true, auth_user_id: 'auth-operations', vplanning_roles: ['vplanning_admin'] }]);
  if (value.includes('/vplanning_users?') && value.includes('email=eq.')) return Response.json([]);
  if (value.includes('/vplanning_users?')) return Response.json([
    { email: 'ops@peopleone.vn', full_name: 'Quản trị đa vai', roles: ['training_ops_admin', 'vplanning_admin', 'vplanning_manager', 'vplanning_member'] },
    { email: 'manager@peopleone.vn', full_name: 'Ngọc Trần', roles: ['vplanning_manager'] },
    { email: 'member@peopleone.vn', full_name: 'Nam Nguyễn', roles: ['vplanning_member'] },
    { email: 'scoped@peopleone.vn', full_name: 'Ngoài phạm vi', roles: ['vplanning_member'], payload: { projectIds: ['OUTSIDE-PROJECT'] } },
    { email: 'chieuanh18082003@gmail.com', full_name: 'Chiêu Anh', roles: ['vplanning_member'], payload: { authUserId: 'auth-chieu-anh' } },
    { email: 'inactive@peopleone.vn', full_name: 'Đã khóa', roles: ['vplanning_member'] },
    { email: 'content@peopleone.vn', full_name: 'Chỉ nội dung', roles: ['vplanning_content'] },
    { email: 'unlinked@peopleone.vn', full_name: 'Tài khoản VWork chưa liên kết', roles: ['vplanning_member'] },
  ]);
  if (value.includes('/vwork_training_operations_state?') && (options.method || 'GET') === 'GET') return Response.json([]);
  if (value.includes('/vwork_training_operations_tasks?') && (options.method || 'GET') === 'GET') return Response.json([]);
  if (value.includes('/vwork_training_operations_audit_events?') && (options.method || 'GET') === 'GET') return Response.json([]);
  if (value.includes('/vwork_training_operations_command_requests?') && (options.method || 'GET') === 'GET') return Response.json(persistedRequest ? [persistedRequest] : []);
  if (value.endsWith('/rpc/persist_vwork_training_operations_state')) {
    const body = JSON.parse(options.body);
    lastPersistedBody = body;
    assert.equal(body.p_state_id, 'default');
    assert.equal(body.p_expected_version, 0);
    assert.ok(Array.isArray(body.p_tasks) && body.p_tasks.length === 33);
    assert.equal(body.p_payload.tasks, undefined);
    assert.equal(body.p_payload.auditEvents, undefined);
    persistedRequest = { request_id: body.p_request_id, state_id: 'default', actor_id: 'profile-operations', result: { version: 1, updatedAt: '2026-08-25T02:00:00.000Z', auditCount: 1 } };
    return Response.json({ version: 1, updatedAt: '2026-08-25T02:00:00.000Z', taskCount: 33, auditCount: 1, idempotentReplay: false });
  }
  throw new Error(`Unexpected fetch: ${options.method || 'GET'} ${value}`);
};

const { default: handler, stateForRole } = await import('../api/vwork-training-operations.js');
const { resolveActiveTrainingRole } = await import('../src/modules/vplanning/trainingOperations/roles.js');

assert.equal(resolveActiveTrainingRole(undefined, ['vtraining', 'manager', 'member']), 'manager', 'A team manager must land in the fixed manager interface without switching roles.');
assert.equal(resolveActiveTrainingRole(undefined, ['content', 'member']), 'content', 'A specialist/member account must keep its specialist interface.');

function responseRecorder() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.payload = value; return this; },
  };
}

function request(method, body, activeRole) {
  return {
    method,
    body,
    headers: { authorization: 'Bearer session-test', 'x-forwarded-for': `127.0.0.${calls.length + 1}`, ...(activeRole ? { 'x-vwork-role': activeRole } : {}) },
    socket: { remoteAddress: `127.0.0.${calls.length + 1}` },
  };
}

const getResponse = responseRecorder();
await handler(request('GET'), getResponse);
assert.equal(getResponse.statusCode, 200);
assert.equal(getResponse.payload.ok, true);
assert.equal(getResponse.payload.role, 'operations');
assert.deepEqual(getResponse.payload.availableRoles, ['operations', 'intake', 'content', 'vtraining', 'manager', 'member']);
assert.equal(getResponse.payload.storage, 'seed');
assert.equal(getResponse.payload.state.tasks.length, 33);
assert.deepEqual(getResponse.payload.directory.map((item) => [item.id, item.role]), [['ops@peopleone.vn', 'manager'], ['manager@peopleone.vn', 'manager'], ['member@peopleone.vn', 'member'], ['scoped@peopleone.vn', 'member'], ['chieuanh18082003@gmail.com', 'member'], ['content@peopleone.vn', undefined], ['unlinked@peopleone.vn', 'member']]);
assert.deepEqual(getResponse.payload.directory[0].roles, ['operations', 'intake', 'content', 'vtraining', 'manager', 'member']);
assert.equal(getResponse.payload.directory.find((item) => item.id === 'chieuanh18082003@gmail.com').assignable, true);
assert.equal(getResponse.payload.directory.find((item) => item.id === 'chieuanh18082003@gmail.com').profileLinked, true);
assert.equal(getResponse.payload.accountDirectory.find((item) => item.id === 'inactive@peopleone.vn').assignable, false);
assert.equal(getResponse.payload.directory.find((item) => item.id === 'content@peopleone.vn').assignable, true);
assert.equal(getResponse.payload.directory.find((item) => item.id === 'chieuanh18082003@gmail.com').assignable, true);
assert.equal(getResponse.payload.directory.find((item) => item.id === 'unlinked@peopleone.vn').profileLinked, false);
assert.equal(getResponse.payload.directory.find((item) => item.id === 'unlinked@peopleone.vn').assignable, true);
assert.equal(getResponse.payload.accountDirectory.length, 8);
assert.equal(getResponse.payload.accountDirectory.find((item) => item.id === 'inactive@peopleone.vn').profileLinked, true);

const managerView = responseRecorder();
await handler(request('GET', undefined, 'manager'), managerView);
assert.equal(managerView.statusCode, 200);
assert.equal(managerView.payload.directory.length, 7);
assert.equal(managerView.payload.accountDirectory.length, 0);
assert.equal(managerView.payload.state.projects.length, 0);
assert.equal(managerView.payload.state.tasks.length, 0);

const memberView = responseRecorder();
await handler(request('GET', undefined, 'member'), memberView);
assert.equal(memberView.statusCode, 200);
assert.equal(memberView.payload.role, 'member');
assert.equal(memberView.payload.state.tasks.length, 0);

const legacyAssignedState = structuredClone(getResponse.payload.state);
const legacyAssignedTask = legacyAssignedState.tasks.find((item) => item.id === 'CX-FOUNDATION-TNKH01-T-101');
legacyAssignedTask.assigneeId = 'member@peopleone.vn';
legacyAssignedTask.assignee = 'Nam Nguyễn';
const legacyMemberView = stateForRole(legacyAssignedState, { role: 'member', actor: { id: 'profile-member', email: 'member@peopleone.vn', name: 'Nam Nguyễn' } });
assert.equal(legacyMemberView.courses.length, 1);
assert.equal(legacyMemberView.tasks.length, 1);
assert.ok(legacyMemberView.teamAssignments.some((item) => item.courseId === 'CX-FOUNDATION' && item.accountId === 'member@peopleone.vn' && item.derivedFromTask === true), 'Legacy task assignments must derive course membership during read normalization.');

const assignedManagerState = structuredClone(getResponse.payload.state);
assignedManagerState.teamAssignments.push({ courseId: 'CX-FOUNDATION', projectId: 'EVNSPC-2026', role: 'manager', accountId: 'profile-operations', status: 'ACTIVE' });
const managerVisibleInput = assignedManagerState.inputs.find((item) => item.courseId === 'CX-FOUNDATION' && item.key === 'vlearning');
managerVisibleInput.status = 'ACTIVE';
managerVisibleInput.activeVersion = 2;
managerVisibleInput.versions = [
  { id: `${managerVisibleInput.id}:v1`, version: 1, status: 'SUPERSEDED', data: { content_name: 'Bản cũ không được lộ' }, files: [{ name: 'old.docx', path: 'training-operations/old/vlearning/old.docx' }] },
  { id: `${managerVisibleInput.id}:v2`, version: 2, status: 'ACTIVE', data: { content_name: 'Trải nghiệm khách hàng' }, files: [{ name: 'input.xlsx', path: 'training-operations/current/vlearning/input.xlsx' }] },
];
const assignedManagerView = stateForRole(assignedManagerState, { role: 'manager', actor: { id: 'profile-operations', email: 'ops@peopleone.vn', name: 'Quản trị đa vai' } });
assert.equal(assignedManagerView.courses.length, 1);
assert.equal(assignedManagerView.courseInputProgress[0].total, 7);
const projectedManagerInput = assignedManagerView.inputs.find((item) => item.id === managerVisibleInput.id);
assert.equal(projectedManagerInput.versions.find((item) => item.version === 2).data.content_name, 'Trải nghiệm khách hàng');
assert.equal(projectedManagerInput.versions.find((item) => item.version === 2).files[0].name, 'input.xlsx');
assert.equal(projectedManagerInput.versions.find((item) => item.version === 1).data, undefined, 'Non-owners must only receive active input details, not superseded source data.');

const invalidRole = responseRecorder();
await handler(request('GET', undefined, 'director'), invalidRole);
assert.equal(invalidRole.statusCode, 403);
assert.equal(invalidRole.payload.code, 'TRAINING_OPERATIONS_ROLE_NOT_GRANTED');

const forbiddenCommand = responseRecorder();
await handler(request('POST', {
  expectedVersion: 0,
  requestId: '33333333-3333-4333-8333-333333333333',
  command: { type: 'ASSIGN_TASKS', payload: { taskIds: ['CX-FOUNDATION-TNKH01-T-101'] } },
}, 'intake'), forbiddenCommand);
assert.equal(forbiddenCommand.statusCode, 403);
assert.equal(forbiddenCommand.payload.code, 'TRAINING_OPERATIONS_PERMISSION_DENIED');

const postResponse = responseRecorder();
await handler(request('POST', {
  expectedVersion: 0,
  requestId: '11111111-1111-4111-8111-111111111111',
  command: { type: 'ASSIGN_GROUP_MANAGER', payload: { classCode: 'TNKH01', group: 'setup', managerId: 'manager-01', managerName: 'Ngọc Trần' } },
}), postResponse);
assert.equal(postResponse.statusCode, 200);
assert.equal(postResponse.payload.version, 1);
assert.ok(postResponse.payload.state.tasks.filter((item) => item.classCode === 'TNKH01' && item.group === 'setup').every((item) => item.manager === 'Ngọc Trần'));
assert.ok(calls.some((item) => item.url.endsWith('/rpc/persist_vwork_training_operations_state') && item.method === 'POST'));
assert.ok(calls.filter((item) => item.url.includes('/vwork_training_operations_')).every((item) => String(item.headers?.Authorization || '').includes('service-test')));

const rpcCallsBeforeReplay = calls.filter((item) => item.url.endsWith('/rpc/persist_vwork_training_operations_state')).length;
const replayResponse = responseRecorder();
await handler(request('POST', {
  expectedVersion: 0,
  requestId: '11111111-1111-4111-8111-111111111111',
  command: { type: 'ASSIGN_GROUP_MANAGER', payload: { classCode: 'TNKH01', group: 'setup', managerId: 'manager-01', managerName: 'Ngọc Trần' } },
}), replayResponse);
assert.equal(replayResponse.statusCode, 200);
assert.equal(replayResponse.payload.idempotentReplay, true);
assert.equal(replayResponse.payload.version, 1);
assert.equal(calls.filter((item) => item.url.endsWith('/rpc/persist_vwork_training_operations_state')).length, rpcCallsBeforeReplay);

persistedRequest = null;

const badVersion = responseRecorder();
await handler(request('POST', { expectedVersion: 4, requestId: '22222222-2222-4222-8222-222222222222', command: { type: 'ASSIGN_GROUP_MANAGER', payload: {} } }), badVersion);
assert.equal(badVersion.statusCode, 409);
assert.equal(badVersion.payload.code, 'TRAINING_OPERATIONS_VERSION_CONFLICT');

const missingRequestId = responseRecorder();
await handler(request('POST', { expectedVersion: 0, command: { type: 'ASSIGN_GROUP_MANAGER', payload: {} } }), missingRequestId);
assert.equal(missingRequestId.statusCode, 400);
assert.equal(missingRequestId.payload.code, 'TRAINING_OPERATIONS_REQUEST_ID_REQUIRED');

persistedRequest = null;
lastPersistedBody = null;
const multiAssignment = responseRecorder();
await handler(request('POST', {
  expectedVersion: 0,
  requestId: '44444444-4444-4444-8444-444444444444',
  command: {
    type: 'ASSIGN_TASKS',
    payload: {
      taskIds: ['CX-FOUNDATION-TNKH01-T-101', 'CX-FOUNDATION-TNKH01-T-102'],
      assigneeId: ' MEMBER@PEOPLEONE.VN ',
      reviewerId: 'MANAGER@PEOPLEONE.VN',
      requireSeparation: true,
    },
  },
}), multiAssignment);
assert.equal(multiAssignment.statusCode, 200);
const assignedTasks = lastPersistedBody.p_tasks.filter((item) => ['CX-FOUNDATION-TNKH01-T-101', 'CX-FOUNDATION-TNKH01-T-102'].includes(item.id));
assert.equal(assignedTasks.length, 2);
assert.ok(assignedTasks.every((item) => item.assigneeId === 'member@peopleone.vn' && item.assignee === 'Nam Nguyễn'));
assert.ok(assignedTasks.every((item) => item.reviewerId === 'manager@peopleone.vn' && item.reviewer === 'Ngọc Trần'));
assert.ok(lastPersistedBody.p_payload.teamAssignments.some((item) => item.courseId === 'CX-FOUNDATION' && item.role === 'member' && item.accountId === 'member@peopleone.vn' && item.status === 'ACTIVE'), 'Task assignment must persist the assignee course membership in the same RPC payload.');

persistedRequest = null;
lastPersistedBody = null;
const vworkRoleOnlyAssignment = responseRecorder();
await handler(request('POST', {
  expectedVersion: 0,
  requestId: '77777777-7777-4777-8777-777777777777',
  command: { type: 'ASSIGN_TASKS', payload: { taskIds: ['CX-FOUNDATION-TNKH01-T-101'], assigneeId: 'inactive@peopleone.vn', reviewerId: 'manager@peopleone.vn', requireSeparation: true } },
}), vworkRoleOnlyAssignment);
assert.equal(vworkRoleOnlyAssignment.statusCode, 400);
assert.equal(vworkRoleOnlyAssignment.payload.code, 'TRAINING_OPERATIONS_ASSIGNEE_INVALID');
assert.equal(lastPersistedBody, null);

persistedRequest = null;
const scopedAssignment = responseRecorder();
await handler(request('POST', {
  expectedVersion: 0,
  requestId: '55555555-5555-4555-8555-555555555555',
  command: { type: 'ASSIGN_TASKS', payload: { taskIds: ['CX-FOUNDATION-TNKH01-T-101'], assigneeId: 'scoped@peopleone.vn', reviewerId: 'manager@peopleone.vn', requireSeparation: true } },
}), scopedAssignment);
assert.equal(scopedAssignment.statusCode, 403);
assert.equal(scopedAssignment.payload.code, 'TRAINING_OPERATIONS_ASSIGNMENT_SCOPE_DENIED');

const separatedAssignment = responseRecorder();
await handler(request('POST', {
  expectedVersion: 0,
  requestId: '66666666-6666-4666-8666-666666666666',
  command: { type: 'ASSIGN_TASKS', payload: { taskIds: ['CX-FOUNDATION-TNKH01-T-101'], assigneeId: 'manager@peopleone.vn', reviewerId: 'manager@peopleone.vn', requireSeparation: true } },
}), separatedAssignment);
assert.equal(separatedAssignment.statusCode, 400);
assert.match(separatedAssignment.payload.error, /phải khác nhau/);

console.log('V-Work Training Operations API auth, persistence and concurrency checks passed.');

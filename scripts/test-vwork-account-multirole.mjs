import assert from 'node:assert/strict';
import handler from '../api/vwork-training-operations-user.js';

const originalFetch = globalThis.fetch;
const originalEnv = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
};

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
process.env.SUPABASE_ANON_KEY = 'test-anon-key';

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const method = options.method || 'GET';
  calls.push({ url: String(url), method, body: options.body ? JSON.parse(options.body) : null });
  let payload;
  if (String(url).endsWith('/auth/v1/user')) {
    payload = { id: 'requester-auth', email: 'admin@peopleone.vn' };
  } else if (String(url).includes('/vcontent_profiles?') && String(url).includes('or=(')) {
    payload = [{ id: 'requester-profile', email: 'admin@peopleone.vn', role: 'training_manager', vplanning_roles: ['vplanning_director'], active: true, auth_user_id: 'requester-auth' }];
  } else if (String(url).includes('/vplanning_users?') && String(url).includes('admin%40peopleone.vn')) {
    payload = [{ email: 'admin@peopleone.vn', roles: ['training_ops_admin'] }];
  } else if (String(url).includes('/vcontent_profiles?') && method === 'GET') {
    payload = [{ id: 'target-profile', email: 'member@peopleone.vn', full_name: 'Tên cũ', role: 'ctv', title: 'Thành viên ekip', vplanning_roles: ['vplanning_member'], active: true, access_scope: 'self', auth_user_id: 'existing-auth' }];
  } else if (String(url).includes('/vplanning_users?') && method === 'GET') {
    payload = [{ email: 'member@peopleone.vn', full_name: 'Tên cũ', title: 'Thành viên ekip', roles: ['vplanning_member', 'finance_viewer'], departments: ['VTraining'], owner_ids: [], payload: { authUserId: 'existing-auth' } }];
  } else if (String(url).endsWith('/auth/v1/admin/users/existing-auth')) {
    payload = { id: 'existing-auth', email: 'member@peopleone.vn', app_metadata: {}, banned_until: '2099-01-01T00:00:00.000Z' };
  } else {
    payload = [];
  }
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const req = {
  method: 'POST',
  headers: { authorization: 'Bearer requester-token', 'x-vwork-role': 'operations' },
  body: { fullName: 'Nguyễn Thành Viên', email: 'member@peopleone.vn', password: '', roles: ['operations', 'content'], replaceRoles: true, restoreLoginAccess: true },
  socket: { remoteAddress: '127.0.0.1' },
};
const result = { status: 0, payload: null };
const res = {
  setHeader() {},
  status(value) { result.status = value; return this; },
  json(value) { result.payload = value; return this; },
};

try {
  await handler(req, res);
  assert.equal(result.status, 200, 'Existing Auth users must be linked instead of rejected as duplicates.');
  assert.deepEqual(result.payload.user.roles, ['operations', 'content']);
  assert.equal(result.payload.user.authUserCreated, false);
  assert.equal(result.payload.user.loginAccessRestored, true);
  assert.equal(result.payload.user.loginAccessReconciled, true);
  assert.equal(calls.filter((call) => call.url.endsWith('/auth/v1/admin/users') && call.method === 'POST').length, 0, 'Known Auth users must not be recreated.');
  const profilePatch = calls.find((call) => call.url.includes('/vcontent_profiles?id=') && call.method === 'PATCH');
  const directoryUpsert = calls.find((call) => call.url.includes('/vplanning_users?on_conflict=email') && call.method === 'POST');
  assert.deepEqual(profilePatch.body.vplanning_roles.sort(), ['vplanning_content', 'vplanning_director']);
  assert.equal(profilePatch.body.role, 'production_manager');
  assert.deepEqual(directoryUpsert.body.roles.sort(), ['content_manager', 'finance_viewer', 'vplanning_director']);
  assert.equal(calls.some((call) => call.body?.password), false, 'Existing-user reconciliation must not send or persist a password.');
  const authRestore = calls.find((call) => call.url.endsWith('/auth/v1/admin/users/existing-auth') && call.method === 'PUT');
  assert.deepEqual(authRestore?.body, { ban_duration: 'none' }, 'Explicit account reconciliation must lift an existing Auth ban.');

  const mutationCount = calls.filter((call) => ['PATCH', 'POST'].includes(call.method) && call.url.includes('/rest/v1/')).length;
  const selfResult = { status: 0, payload: null };
  await handler({ ...req, body: { fullName: 'Quản trị viên', email: 'admin@peopleone.vn', password: '', roles: ['member'], replaceRoles: true } }, {
    setHeader() {},
    status(value) { selfResult.status = value; return this; },
    json(value) { selfResult.payload = value; return this; },
  });
  assert.equal(selfResult.status, 400);
  assert.equal(selfResult.payload.code, 'TRAINING_OPERATIONS_SELF_ROLE_DOWNGRADE_DENIED');
  assert.equal(calls.filter((call) => ['PATCH', 'POST'].includes(call.method) && call.url.includes('/rest/v1/')).length, mutationCount, 'Self-lockout rejection must happen before database mutation.');
  console.log('V-Work multi-role existing-account reconciliation passed.');
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

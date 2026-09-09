import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_ANON_KEY = 'anon-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const value = String(url);
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url: value, method, body });
  if (value.endsWith('/auth/v1/user')) return Response.json({ id: 'auth-operations', email: 'ops@peopleone.vn' });
  if (value.includes('/vcontent_profiles?') && value.includes('or=')) {
    return Response.json([{ id: 'profile-operations', email: 'ops@peopleone.vn', role: 'production_manager', active: true, auth_user_id: 'auth-operations', vplanning_roles: ['vplanning_director'] }]);
  }
  if (value.includes('/vplanning_users?') && value.includes('ops%40peopleone.vn')) return Response.json([]);
  if (value.includes('/vcontent_profiles?select=') && value.includes('active=is.true')) {
    return Response.json([
      { id: 'profile-old-1', email: 'old1@peopleone.vn', role: 'ctv', title: 'Thành viên ekip', vplanning_roles: ['vplanning_member'], active: true, auth_user_id: 'auth-old-1' },
      { id: 'profile-old-2', email: 'old2@peopleone.vn', role: 'ctv', title: 'Thành viên ekip', vplanning_roles: ['vplanning_member'], active: true, auth_user_id: null },
      { id: 'profile-unrelated', email: 'outside@example.com', role: 'student', title: 'Học viên', vplanning_roles: [], active: true, auth_user_id: 'auth-outside' },
    ]);
  }
  if (value.includes('/vplanning_users?select=email,roles,payload')) {
    return Response.json([
      { email: 'old1@peopleone.vn', roles: ['vplanning_member'], payload: { authUserId: 'auth-old-1' } },
      { email: 'old2@peopleone.vn', roles: ['account_manager'], payload: {} },
    ]);
  }
  if (value.endsWith('/auth/v1/admin/users/auth-old-1') && method === 'GET') return Response.json({ id: 'auth-old-1', email: 'old1@peopleone.vn', banned_until: '2099-01-01T00:00:00.000Z' });
  if (value.includes('/auth/v1/admin/users?page=1&per_page=1000')) return Response.json({ users: [{ id: 'auth-old-2', email: 'old2@peopleone.vn', banned_until: '2099-01-01T00:00:00.000Z' }], last_page: 1 });
  if (value.includes('/vcontent_profiles?id=eq.profile-old-2') && method === 'PATCH') return new Response(null, { status: 204 });
  if (value.endsWith('/auth/v1/admin/users/auth-old-1') && method === 'PUT') return Response.json({ id: 'auth-old-1', email: 'old1@peopleone.vn' });
  if (value.endsWith('/auth/v1/admin/users/auth-old-2') && method === 'PUT') return Response.json({ id: 'auth-old-2', email: 'old2@peopleone.vn' });
  throw new Error(`Unexpected fetch: ${method} ${value}`);
};

const { default: handler } = await import('../api/vwork-training-operations-user.js');
const result = { status: 0, payload: null };
await handler({
  method: 'POST',
  headers: { authorization: 'Bearer requester-token', 'x-vwork-role': 'operations', 'x-forwarded-for': '127.0.0.42' },
  body: { action: 'RESTORE_ACTIVE_LOGIN_ACCESS' },
  socket: { remoteAddress: '127.0.0.42' },
}, {
  setHeader() {},
  status(value) { result.status = value; return this; },
  json(value) { result.payload = value; return this; },
});

assert.equal(result.status, 200, JSON.stringify({ payload: result.payload, calls }, null, 2));
assert.equal(result.payload.ok, true);
assert.deepEqual(result.payload.reconciliation, { candidates: 2, checked: 2, restored: 2, linked: 1, rolesReconciled: 1, missingAuth: 0 });
assert.equal(calls.filter((call) => call.method === 'PUT' && call.body?.ban_duration === 'none').length, 2);
assert.equal(calls.some((call) => call.url.includes('auth-outside') && call.method === 'PUT'), false, 'Unrelated active profiles must not be unbanned.');
assert.equal(calls.some((call) => call.url.includes('profile-old-2') && call.method === 'PATCH' && call.body?.auth_user_id === 'auth-old-2'), true);
assert.equal(calls.some((call) => call.url.includes('profile-old-2') && call.method === 'PATCH' && call.body?.vplanning_roles?.includes('vplanning_intake')), true);

console.log('V-Work legacy account login reconciliation checks passed.');

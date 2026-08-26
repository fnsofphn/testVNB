import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_ANON_KEY = 'anon-test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test';

const calls = [];
globalThis.fetch = async (url, options = {}) => {
  const value = String(url);
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ url: value, method, body, headers: options.headers });
  if (value.endsWith('/auth/v1/user')) return Response.json({ id: 'auth-operations', email: 'ops@peopleone.vn' });
  if (value.includes('/vcontent_profiles?') && value.includes('or=')) {
    return Response.json([{ id: 'profile-operations', email: 'ops@peopleone.vn', role: 'training_manager', active: true, auth_user_id: 'auth-operations', vplanning_roles: [] }]);
  }
  if (value.includes('/vplanning_users?') && value.includes('ops%40peopleone.vn')) return Response.json([]);
  if (value.includes('/vcontent_profiles?') && value.includes('member%40peopleone.vn')) return Response.json([]);
  if (value.includes('/vplanning_users?') && value.includes('member%40peopleone.vn') && method === 'GET') return Response.json([]);
  if (value.endsWith('/auth/v1/admin/users') && method === 'POST') return Response.json({ id: 'auth-member', email: 'member@peopleone.vn' }, { status: 201 });
  if (value.endsWith('/rest/v1/vcontent_profiles') && method === 'POST') return new Response('', { status: 201 });
  if (value.includes('/rest/v1/vplanning_users?on_conflict=email') && method === 'POST') return new Response('', { status: 201 });
  throw new Error(`Unexpected fetch: ${method} ${value}`);
};

const { default: handler } = await import('../api/vwork-training-operations-user.js');

function responseRecorder() {
  return {
    statusCode: 200,
    payload: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    json(value) { this.payload = value; return this; },
  };
}

const response = responseRecorder();
await handler({
  method: 'POST',
  body: { fullName: 'Nam Nguyễn', email: 'member@peopleone.vn', password: 'Vw!Test2026', role: 'member' },
  headers: { authorization: 'Bearer session-test', 'x-forwarded-for': '127.0.0.31' },
  socket: { remoteAddress: '127.0.0.31' },
}, response);

assert.equal(response.statusCode, 201);
assert.equal(response.payload.ok, true);
assert.deepEqual(response.payload.user, {
  id: 'member@peopleone.vn',
  authUserId: 'auth-member',
  email: 'member@peopleone.vn',
  name: 'Nam Nguyễn',
  role: 'member',
  roles: ['member'],
  authUserCreated: true,
});
assert.equal('password' in response.payload.user, false);

const authCreate = calls.find((item) => item.url.endsWith('/auth/v1/admin/users') && item.method === 'POST');
assert.equal(authCreate.body.email_confirm, true);
assert.equal(authCreate.body.app_metadata.module, 'training_operations');
const profileCreate = calls.find((item) => item.url.endsWith('/rest/v1/vcontent_profiles') && item.method === 'POST');
assert.equal(profileCreate.body.role, 'ctv');
assert.deepEqual(profileCreate.body.vplanning_roles, ['vplanning_member']);
const directoryCreate = calls.find((item) => item.url.includes('/vplanning_users?on_conflict=email') && item.method === 'POST');
assert.deepEqual(directoryCreate.body.roles, ['vplanning_member']);
assert.ok(calls.filter((item) => item.method !== 'GET').every((item) => String(item.headers?.Authorization || '').includes('service-test')));

console.log('V-Work Training Operations account provisioning API checks passed.');

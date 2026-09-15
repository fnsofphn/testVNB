import assert from 'node:assert/strict';
import { configuration, seedAccounts, TEST_ACCOUNTS } from './vcoaching-seed.mjs';

const env = { SUPABASE_URL: 'https://test-ref.supabase.co', VCOACHING_TEST_PROJECT_REF: 'test-ref',
  VCOACHING_ENVIRONMENT: 'test', SUPABASE_SERVICE_ROLE_KEY: 'server-test-key' };
assert.equal(configuration(env).ref, 'test-ref');
for (const patch of [{ NODE_ENV: 'production' }, { VERCEL_ENV: 'production' },
  { VCOACHING_ENVIRONMENT: 'production' }, { VCOACHING_TEST_PROJECT_REF: 'other-ref' },
  { SUPABASE_SERVICE_ROLE_KEY: '' }]) assert.throws(() => configuration({ ...env, ...patch }));

function fake({ failProfile = false, existing = false } = {}) {
  const users = existing ? TEST_ACCOUNTS.map((a, i) => ({ id: `old-${i}`, email: a.email,
    app_metadata: { vcoaching: { active: false, role: 'unit' } } })) : [];
  const profiles = existing ? users.map(u => ({ id: u.id, email: u.email, auth_user_id: u.id, active: true })) : [];
  const mutations = [];
  const client = {
    auth: { admin: {
      listUsers: async () => ({ data: { users }, error: null }),
      createUser: async input => {
        mutations.push(['createAuth', input.email]);
        const user = { id: `new-${users.length}`, ...input }; users.push(user);
        return { data: { user }, error: null };
      },
      updateUserById: async (id, patch) => { mutations.push(['updateAuth', id]); Object.assign(users.find(u => u.id === id), patch); return { error: null }; },
      deleteUser: async id => { mutations.push(['deleteAuth', id]); users.splice(users.findIndex(u => u.id === id), 1); return { error: null }; },
    } },
    from: () => ({
      select: () => ({
        in: async () => ({ data: profiles, error: null }),
        eq: (_key, id) => ({ single: async () => ({ data: profiles.find(p => p.id === id), error: null }) }),
      }),
      insert: async p => { mutations.push(['insertProfile', p.id]); if (failProfile) return { error: new Error('fixture') }; profiles.push(p); return { error: null }; },
      delete: () => ({ eq: (_key, id) => ({ eq: async () => { mutations.push(['deleteProfile', id]); const i = profiles.findIndex(p => p.id === id); if (i >= 0) profiles.splice(i, 1); return { error: null }; } }) }),
    }),
  };
  return { client, mutations, users, profiles };
}

const dry = fake();
assert.equal((await seedAccounts(dry.client)).filter(a => a.state === 'create').length, 5);
assert.equal(dry.mutations.length, 0);
await assert.rejects(seedAccounts(dry.client, { apply: true, password: 'short' }));
assert.equal(dry.mutations.length, 0);

const preserved = fake({ existing: true });
const before = JSON.stringify(preserved.users);
await seedAccounts(preserved.client, { apply: true, initializeAdmin: true });
assert.equal(preserved.mutations.length, 0, 'Existing grants, including revoked Admin grants, must remain unchanged');
assert.equal(JSON.stringify(preserved.users), before);

const good = fake();
await seedAccounts(good.client, { apply: true, password: 'test-only-fixture-password' });
assert.equal(good.users.length, 5);
assert.equal(good.profiles.length, 5);
const mutationsBefore = good.mutations.length;
await seedAccounts(good.client, { apply: true, password: 'different-fixture-password' });
assert.equal(good.mutations.length, mutationsBefore, 'Repeated seed must perform no writes');

const bad = fake({ failProfile: true });
await assert.rejects(seedAccounts(bad.client, { apply: true, password: 'test-only-fixture-password' }));
assert.equal(bad.users.length, 0, 'Failed profile provisioning must not leave an Auth account');
assert.equal(bad.profiles.length, 0);
console.log('PASS: environment guards, dry-run, existing grant preservation, repeat seed, provisioning rollback.');

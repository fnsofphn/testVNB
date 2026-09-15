import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';

export const TEST_ACCOUNTS = Object.freeze([
  { email: 'giangvien@vinabrain.com', name: 'Giảng viên kiểm thử V-Coaching', role: 'expert' },
  { email: 'chuyenvien@vinabrain.com', name: 'Chuyên viên dữ liệu kiểm thử V-Coaching', role: 'data' },
  { email: 'quantriduan@vinabrain.com', name: 'Quản trị dự án kiểm thử V-Coaching', role: 'project' },
  { email: 'admin@vinabrain.com', name: 'Admin tổng kiểm thử V-Coaching', role: 'system', superAdmin: true },
  { email: 'donvi@vinabrain.com', name: 'Đơn vị kiểm thử V-Coaching', role: 'unit' },
]);

export function configuration(env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
  const ref = env.VCOACHING_TEST_PROJECT_REF;
  if (!url || !ref || new URL(url).hostname !== `${ref}.supabase.co`) {
    throw new Error('Cần SUPABASE_URL và VCOACHING_TEST_PROJECT_REF khớp môi trường kiểm thử đã xác nhận.');
  }
  if (env.VCOACHING_ENVIRONMENT !== 'test' || env.NODE_ENV === 'production' || env.VERCEL_ENV === 'production') {
    throw new Error('Seed chỉ được chạy trong môi trường test, không chạy trên production.');
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Thiếu SUPABASE_SERVICE_ROLE_KEY phía máy chủ.');
  return { url, ref, key: env.SUPABASE_SERVICE_ROLE_KEY };
}

async function allAuthUsers(client) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Không đọc được danh sách Auth (${error.status || 'unknown'}).`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

// Auth and application profiles use separate APIs. A newly-created Auth account
// has no active V-Coaching grant until its profile has been verified. Existing
// accounts are never reset, unlocked, re-granted, or adopted by this seed.
export async function seedAccounts(client, { apply = false, password = '', verifyClient, initializeAdmin = false } = {}) {
  const users = await allAuthUsers(client);
  const { data: profiles, error } = await client.from('vcontent_profiles')
    .select('id,email,auth_user_id,active').in('email', TEST_ACCOUNTS.map(a => a.email));
  if (error) throw new Error('Không đọc được hồ sơ ứng dụng; chưa tạo tài khoản nào.');
  const plan = TEST_ACCOUNTS.map(account => {
    const user = users.find(u => u.email?.toLowerCase() === account.email);
    const profile = profiles.find(p => p.email?.toLowerCase() === account.email);
    const state = user ? 'preserve_existing' : profile ? 'conflict_profile_without_auth' : 'create';
    return { account, user, profile, state };
  });
  if (!apply) return plan.map(({ account, state }) => ({ email: account.email, state }));
  if (plan.some(p => p.state === 'conflict_profile_without_auth')) {
    throw new Error('Có hồ sơ trùng email nhưng chưa xác minh liên kết Auth. Cần đối chiếu trước khi seed.');
  }
  if (plan.some(p => p.state === 'create') && password.length < 14) {
    throw new Error('Cần VCOACHING_TEST_PASSWORD tối thiểu 14 ký tự qua biến môi trường.');
  }
  const results = [];
  for (const { account, state, user: existing, profile } of plan) {
    if (existing) {
      if (initializeAdmin && account.superAdmin && !Object.hasOwn(existing.app_metadata || {}, 'vcoaching')) {
        if (!profile?.active || profile.auth_user_id !== existing.id || existing.banned_until && new Date(existing.banned_until) > new Date()) {
          throw new Error('Admin hiện có chưa có hồ sơ hoạt động khớp Auth; không cấp quyền tự động.');
        }
        const { error: grantError } = await client.auth.admin.updateUserById(existing.id, {
          app_metadata: { ...existing.app_metadata, vcoaching: {
            active: true, role: 'system', super_admin: true, projects: ['vcoaching-test'],
            units: ['vcoaching-test-unit'], initiatives: [], test_fixture: true, seed_version: 1,
          } },
        });
        if (grantError) throw new Error('Chưa xác minh cấp quyền Admin tổng V-Coaching.');
      }
      results.push({ email: account.email, state, authId: existing.id,
        profileLinked: profile?.auth_user_id === existing.id,
        loginVerified: false, reason: 'Giữ nguyên mật khẩu, trạng thái và quyền hiện có.' });
      continue;
    }
    const grant = { active: false, role: account.role, super_admin: !!account.superAdmin,
      projects: ['vcoaching-test'], units: ['vcoaching-test-unit'], initiatives: [],
      test_fixture: true, seed_version: 1 };
    const { data: created, error: createError } = await client.auth.admin.createUser({
      email: account.email, password, email_confirm: true,
      user_metadata: { full_name: account.name }, app_metadata: { vcoaching: grant },
    });
    if (createError || !created.user) {
      // Do not retry an uncertain write, nor print API payloads containing secrets.
      throw new Error(`Không xác minh được tạo Auth cho ${account.email}; chạy dry-run để đối chiếu trước khi thử lại.`);
    }
    const id = created.user.id;
    const profileId = `VCOACH_${id}`;
    try {
      const { error: profileError } = await client.from('vcontent_profiles').insert({
        id: profileId, auth_user_id: id, email: account.email, full_name: account.name,
        role: 'client', title: account.name, active: true, access_scope: 'self',
      });
      if (profileError) throw new Error('profile_create_failed');
      const { data: check, error: checkError } = await client.from('vcontent_profiles')
        .select('id,auth_user_id,active').eq('id', profileId).single();
      if (checkError || check.auth_user_id !== id || !check.active) throw new Error('profile_verify_failed');
      const { error: grantError } = await client.auth.admin.updateUserById(id, {
        app_metadata: { vcoaching: { ...grant, active: true } },
      });
      if (grantError) throw new Error('grant_failed');
    } catch {
      const cleanupProfile = await client.from('vcontent_profiles').delete().eq('id', profileId).eq('auth_user_id', id);
      const cleanupAuth = await client.auth.admin.deleteUser(id);
      if (cleanupProfile.error || cleanupAuth.error) {
        throw new Error(`Khởi tạo chưa hoàn tất: ${account.email}, Auth ${id}. Phục hồi chưa hoàn tất; cần kiểm tra trước khi seed lại.`);
      }
      throw new Error(`Khởi tạo hồ sơ/quyền thất bại cho ${account.email}; đã thu hồi tài khoản vừa tạo.`);
    }
    let loginVerified = false;
    if (verifyClient) {
      const { data, error: loginError } = await verifyClient.auth.signInWithPassword({ email: account.email, password });
      loginVerified = !loginError && data.user?.id === id && !!data.session;
      if (loginVerified) await verifyClient.auth.signOut();
    }
    results.push({ email: account.email, state: 'created', authId: id, profileLinked: true, loginVerified });
  }
  return results;
}

async function main() {
  const cfg = configuration(process.env);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const client = createClient(cfg.url, cfg.key, options);
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const apply = process.argv.includes('--apply');
  if (apply && !anon) throw new Error('Thiếu anon/publishable key để kiểm chứng đăng nhập thật.');
  const result = await seedAccounts(client, { apply, password: process.env.VCOACHING_TEST_PASSWORD,
    verifyClient: anon ? createClient(cfg.url, anon, options) : undefined,
    initializeAdmin: process.argv.includes('--initialize-existing-admin') });
  console.log(JSON.stringify({ project: cfg.ref, mode: apply ? 'apply' : 'dry-run', accounts: result }, null, 2));
  if (result.some(r => r.state === 'created' && !r.loginVerified)) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

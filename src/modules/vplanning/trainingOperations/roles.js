export const TRAINING_ROLE_OPTIONS = Object.freeze([
  ['operations', 'Quản lý vận hành'],
  ['intake', 'Đầu mối / Sale'],
  ['content', 'Chuyên viên nội dung'],
  ['vtraining', 'Chuyên viên vận hành VTraining'],
  ['manager', 'Quản lý ekip'],
  ['member', 'Thành viên ekip'],
]);

export const TRAINING_ROLE_VALUES = Object.freeze(TRAINING_ROLE_OPTIONS.map(([value]) => value));

const PRIMARY_ROLE_BY_IDENTITY_TOKEN = Object.freeze({
  training_ops_admin: 'operations',
  training_manager: 'operations',
  training_admin: 'operations',
  production_manager: 'operations',
  vplanning_director: 'operations',
  quan_ly_van_hanh: 'operations',
  client: 'intake',
  sale: 'intake',
  account_manager: 'intake',
  dau_moi_sale: 'intake',
  dau_moi: 'intake',
  content_manager: 'content',
  vplanning_content: 'content',
  chuyen_vien_noi_dung: 'content',
  vtraining: 'vtraining',
  training_instructor: 'vtraining',
  chuyen_vien_van_hanh_vtraining: 'vtraining',
  van_hanh_vtraining: 'vtraining',
  vplanning_manager: 'manager',
  quan_ly_ekip: 'manager',
  vplanning_member: 'member',
  thanh_vien_ekip: 'member',
});

export function normalizeTrainingRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

export function resolveTrainingRoles(profile, vplanningUser) {
  const tokens = [
    profile?.role,
    profile?.title,
    ...(Array.isArray(profile?.vplanning_roles) ? profile.vplanning_roles : []),
    ...(Array.isArray(vplanningUser?.roles) ? vplanningUser.roles : []),
  ].map(normalizeTrainingRole).filter(Boolean);
  const has = (...values) => values.some((value) => tokens.includes(value));

  if (has('admin', 'training_ops_admin', 'vplanning_admin')) return [...TRAINING_ROLE_VALUES];

  const roles = [];
  if (has('operations', 'vplanning_operations', 'training_manager', 'training_admin', 'production_manager', 'pm', 'vplanning_director', 'quan_ly_van_hanh')) roles.push('operations');
  if (has('intake', 'vplanning_intake', 'client', 'sale', 'account_manager', 'dau_moi', 'dau_moi_sale')) roles.push('intake');
  if (has('content', 'content_manager', 'vplanning_content', 'chuyen_vien_noi_dung', 'noi_dung')) roles.push('content');
  if (has('vtraining', 'vplanning_vtraining', 'training_instructor', 'chuyen_vien_van_hanh_vtraining', 'van_hanh_vtraining')) roles.push('vtraining');
  if (has('manager', 'vplanning_manager', 'teamlead', 'quan_ly_ekip')) roles.push('manager');
  if (has('member', 'vplanning_member', 'vplanning_collaborator', 'ctv', 'cong_tac_vien', 'thanh_vien_ekip')) roles.push('member');
  return [...new Set(roles)];
}

export function resolvePrimaryTrainingRole(profile, vplanningUser, availableRoles) {
  const configuredPrimaryRole = normalizeTrainingRole(vplanningUser?.payload?.primaryRole);
  if (TRAINING_ROLE_VALUES.includes(configuredPrimaryRole) && availableRoles.includes(configuredPrimaryRole)) {
    return configuredPrimaryRole;
  }

  // Legacy accounts do not have payload.primaryRole yet. role/title are the
  // compatibility source; roles arrays are capability grants and must not
  // silently promote an account to another workspace.
  const identityTokens = [
    profile?.title,
    profile?.role,
    vplanningUser?.title,
  ].map(normalizeTrainingRole).filter(Boolean);

  for (const token of identityTokens) {
    const role = PRIMARY_ROLE_BY_IDENTITY_TOKEN[token];
    if (role && availableRoles.includes(role)) return role;
  }

  return availableRoles[0] || null;
}

export function resolveActiveTrainingRole(requestedRole, availableRoles, profile = null, vplanningUser = null) {
  const requested = normalizeTrainingRole(requestedRole);
  if (requested) return availableRoles.includes(requested) ? requested : null;
  return resolvePrimaryTrainingRole(profile, vplanningUser, availableRoles);
}

export const TRAINING_ROLE_OPTIONS = Object.freeze([
  ['operations', 'Quản lý vận hành'],
  ['intake', 'Đầu mối / Sale'],
  ['content', 'Chuyên viên nội dung'],
  ['vtraining', 'Chuyên viên vận hành VTraining'],
  ['manager', 'Quản lý ekip'],
  ['member', 'Thành viên ekip'],
]);

export const TRAINING_ROLE_VALUES = Object.freeze(TRAINING_ROLE_OPTIONS.map(([value]) => value));

// A multi-role account uses one stable workspace. Prefer the role with the
// broadest coordination responsibility so a manager never lands in the
// member-only surface and loses their review queue.
export const TRAINING_INTERFACE_ROLE_PRIORITY = Object.freeze([
  'operations',
  'manager',
  'intake',
  'content',
  'vtraining',
  'member',
]);

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
  const has = (...values) => values.some((value) => tokens.includes(value) || tokens.some((token) => token.includes(value)));

  if (has('admin', 'training_ops_admin', 'vplanning_admin')) return [...TRAINING_ROLE_VALUES];

  const roles = [];
  if (has('training_manager', 'training_admin', 'production_manager', 'pm', 'vplanning_director')) roles.push('operations');
  if (has('client', 'sale', 'account_manager', 'dau_moi')) roles.push('intake');
  if (has('specialist', 'content_manager', 'chuyen_vien_noi_dung', 'noi_dung')) roles.push('content');
  if (has('vtraining', 'training_instructor', 'van_hanh_vtraining')) roles.push('vtraining');
  if (has('vplanning_manager', 'manager', 'teamlead', 'quan_ly_ekip')) roles.push('manager');
  if (has('vplanning_member', 'vplanning_collaborator', 'ctv', 'member', 'cong_tac_vien')) roles.push('member');
  return [...new Set(roles)];
}

export function resolveActiveTrainingRole(requestedRole, availableRoles) {
  const requested = normalizeTrainingRole(requestedRole);
  if (requested) return availableRoles.includes(requested) ? requested : null;
  return TRAINING_INTERFACE_ROLE_PRIORITY.find((role) => availableRoles.includes(role)) || null;
}

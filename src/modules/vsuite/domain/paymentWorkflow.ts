export type VsuitePaymentStatus =
  | 'draft'
  | 'submitted'
  | 'accountant_review'
  | 'manager_approved'
  | 'director_approved'
  | 'paid'
  | 'returned'
  | 'rejected';

export type VsuitePaymentAction =
  | 'submit'
  | 'accountant_review'
  | 'manager_approve'
  | 'director_approve'
  | 'mark_paid'
  | 'return'
  | 'reject';

export type VsuitePlanStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type VsuitePlanAction = 'submit' | 'approve' | 'reject';
export type VsuitePaymentActorProfile = { id: string; email?: string | null; role?: string | null; title?: string | null };
export type VsuitePaymentActorRequest = {
  status: VsuitePaymentStatus;
  requester_profile_id?: string | null;
  delegated_approver_email?: string | null;
};

const PAYMENT_TRANSITIONS: Record<VsuitePaymentStatus, Partial<Record<VsuitePaymentAction, VsuitePaymentStatus>>> = {
  draft: { submit: 'submitted', reject: 'rejected' },
  submitted: { accountant_review: 'manager_approved', return: 'returned', reject: 'rejected' },
  accountant_review: { director_approve: 'director_approved', return: 'returned', reject: 'rejected' },
  manager_approved: { director_approve: 'director_approved', return: 'returned', reject: 'rejected' },
  director_approved: { mark_paid: 'paid' },
  paid: {},
  returned: { submit: 'submitted', accountant_review: 'manager_approved', reject: 'rejected' },
  rejected: {},
};

const PLAN_TRANSITIONS: Record<VsuitePlanStatus, Partial<Record<VsuitePlanAction, VsuitePlanStatus>>> = {
  draft: { submit: 'submitted' },
  submitted: { approve: 'approved', reject: 'rejected' },
  approved: {},
  rejected: { submit: 'submitted' },
};

const PAYMENT_ACTION_LABELS: Record<VsuitePaymentAction, string> = {
  submit: 'Gửi duyệt',
  accountant_review: 'Kế toán xác nhận đủ chứng từ',
  manager_approve: 'Quản lý duyệt nghiệp vụ',
  director_approve: 'Giám đốc duyệt',
  mark_paid: 'Xác nhận đã thanh toán',
  return: 'Trả lại bổ sung',
  reject: 'Từ chối',
};

const PAYMENT_ACTION_ROLES: Record<VsuitePaymentAction, string[]> = {
  submit: ['admin', 'vsuite_admin', 'vsuite_ops', 'vsuite_requester'],
  accountant_review: ['vsuite_accountant', 'vsuite_treasurer'],
  manager_approve: [],
  director_approve: ['vsuite_director'],
  mark_paid: ['vsuite_accountant', 'vsuite_treasurer'],
  return: ['vsuite_accountant', 'vsuite_treasurer', 'vsuite_manager', 'vsuite_director'],
  reject: ['vsuite_accountant', 'vsuite_treasurer', 'vsuite_manager', 'vsuite_director'],
};

export function getNextPaymentStatus(status: VsuitePaymentStatus, action: VsuitePaymentAction) {
  return PAYMENT_TRANSITIONS[status]?.[action] || status;
}

function normalizePaymentActorText(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
}

export function isAccountingPaymentProfile(profile: VsuitePaymentActorProfile | null) {
  const role = String(profile?.role || '');
  const title = normalizePaymentActorText(profile?.title);
  return ['vsuite_accountant', 'vsuite_treasurer'].includes(role) || title.includes('ke toan') || title.includes('thu quy');
}

export function isDirectorPaymentProfile(profile: VsuitePaymentActorProfile | null) {
  const role = String(profile?.role || '');
  const email = String(profile?.email || '').trim().toLowerCase();
  const title = normalizePaymentActorText(profile?.title);
  return role === 'vsuite_director' || email === 'hailt@peopleone.com.vn' || title.includes('giam doc');
}

export function canCurrentProfileActOnPaymentRequest(profile: VsuitePaymentActorProfile | null, request: VsuitePaymentActorRequest, action: VsuitePaymentAction) {
  const status = request.status;
  if (!profile || getNextPaymentStatus(status, action) === status) return false;
  const isAccounting = isAccountingPaymentProfile(profile);
  const isDirector = isDirectorPaymentProfile(profile);
  const isDelegatedDirector = Boolean(
    request.delegated_approver_email
      && String(profile.email || '').trim().toLowerCase() === String(request.delegated_approver_email).trim().toLowerCase(),
  );
  const isRequester = String(request.requester_profile_id || '') === String(profile.id || '');
  if (action === 'accountant_review' || action === 'mark_paid') return isAccounting && !isDirector;
  if (action === 'manager_approve') return false;
  if (action === 'director_approve') return isDirector || (isDelegatedDirector && !isAccounting);
  if (action === 'submit') return isRequester || isAccounting;
  if (action === 'return' || action === 'reject') {
    if (status === 'manager_approved') return isDirector || isDelegatedDirector;
    if (status === 'accountant_review') return isDirector || isDelegatedDirector;
    if (status === 'submitted') return isAccounting;
    return isRequester || isAccounting;
  }
  return false;
}

export function getNextPlanStatus(status: VsuitePlanStatus, action: VsuitePlanAction) {
  return PLAN_TRANSITIONS[status]?.[action] || status;
}

export function getPaymentActionLabel(action: VsuitePaymentAction) {
  return PAYMENT_ACTION_LABELS[action];
}

export function canActOnPaymentRequest(role: string | null | undefined, status: VsuitePaymentStatus, action: VsuitePaymentAction) {
  if (getNextPaymentStatus(status, action) === status) return false;
  return PAYMENT_ACTION_ROLES[action]?.includes(String(role || '')) || false;
}

export function canApproveVsuitePlan(role: string | null | undefined) {
  return ['admin', 'vsuite_admin', 'vsuite_ops', 'vsuite_manager', 'vsuite_director'].includes(String(role || ''));
}

export type VsuiteRole =
  | 'vsuite_admin'
  | 'vsuite_ops'
  | 'vsuite_trainer'
  | 'vsuite_teamlead'
  | 'vsuite_ctv'
  | 'vsuite_lms'
  | 'vsuite_accountant'
  | 'vsuite_requester'
  | 'vsuite_manager'
  | 'vsuite_director'
  | 'vsuite_treasurer';

export type VsuiteTabKey =
  | 'course_info'
  | 'trainer'
  | 'teamlead'
  | 'ctv'
  | 'logistics'
  | 'lms'
  | 'customer'
  | 'acceptance';

export type VsuiteChecklistState = 'pending' | 'done' | 'na';

export const VSUITE_ROLE_META: Record<VsuiteRole, { label: string; title: string }> = {
  vsuite_admin: { label: 'V-Suite Admin', title: 'Toàn quyền điều hành V-Suite' },
  vsuite_ops: { label: 'V-Suite Ops', title: 'Quản lý vận hành dịch vụ' },
  vsuite_trainer: { label: 'V-Suite Trainer', title: 'Giảng viên và chuyên gia phụ trách lớp' },
  vsuite_teamlead: { label: 'V-Suite Teamlead', title: 'Điều phối CTV và checklist lớp' },
  vsuite_ctv: { label: 'V-Suite CTV', title: 'Cộng tác viên vận hành lớp' },
  vsuite_lms: { label: 'V-Suite LMS', title: 'Kỹ thuật LMS và học liệu' },
  vsuite_accountant: { label: 'V-Suite Accountant', title: 'Kế toán và nghiệm thu' },
  vsuite_requester: { label: 'V-Suite Requester', title: 'Nhân viên lập đề nghị thanh toán' },
  vsuite_manager: { label: 'V-Suite Manager', title: 'Quản lý duyệt nghiệp vụ' },
  vsuite_director: { label: 'V-Suite Director', title: 'Giám đốc duyệt chi' },
  vsuite_treasurer: { label: 'V-Suite Treasurer', title: 'Thủ quỹ hoặc người xác nhận chi tiền' },
};

export const VSUITE_TABS: Array<{ key: VsuiteTabKey; label: string; description: string }> = [
  { key: 'course_info', label: 'Thông tin khóa', description: 'Mã lớp, lịch học, địa điểm, số học viên và đầu mối.' },
  { key: 'trainer', label: 'Giảng viên', description: 'Hợp đồng, briefing, tài liệu và readiness giảng viên.' },
  { key: 'teamlead', label: 'CTV Teamlead', description: 'Phân công, sơ đồ vận hành và kiểm soát báo cáo.' },
  { key: 'ctv', label: 'CTV lớp', description: 'Check-in, điểm danh, ảnh lớp, phiếu đánh giá và báo cáo.' },
  { key: 'logistics', label: 'Hậu cần', description: 'Phòng học, Zoom, in ấn, ăn uống, vé, khách sạn và xe.' },
  { key: 'lms', label: 'LMS / Phần mềm', description: 'Tài khoản, nhóm học viên, bài giảng, bài test và dashboard.' },
  { key: 'customer', label: 'Khách hàng', description: 'Đầu mối, danh sách học viên, thông báo và xử lý sự cố.' },
  { key: 'acceptance', label: 'Nghiệm thu', description: 'Hồ sơ, minh chứng, đề nghị thanh toán và quyết toán.' },
];

export const VSUITE_LAYERS = [
  { key: 'dashboard', title: 'Dashboard tổng quan', description: 'KPI hợp đồng, lớp, nhắc việc, chi phí và cảnh báo.' },
  { key: 'class-list', title: 'Danh sách vận hành', description: 'Chọn hợp đồng, chương trình hoặc lớp cần xử lý.' },
  { key: 'class-detail', title: 'Chi tiết lớp', description: 'Theo dõi tiến độ tổng, trạng thái và nhân sự phụ trách.' },
  { key: 'tab-detail', title: 'Chi tiết mảng', description: 'Mở từng mảng checklist để kiểm soát các việc cần làm.' },
  { key: 'item-detail', title: 'Chi tiết hạng mục', description: 'Cập nhật trạng thái, minh chứng, nhắc việc và lịch sử.' },
] as const;

const TAB_EDIT: Record<VsuiteTabKey, VsuiteRole[]> = {
  course_info: ['vsuite_admin', 'vsuite_ops'],
  trainer: ['vsuite_admin', 'vsuite_ops', 'vsuite_trainer', 'vsuite_teamlead'],
  teamlead: ['vsuite_admin', 'vsuite_ops', 'vsuite_teamlead'],
  ctv: ['vsuite_admin', 'vsuite_ops', 'vsuite_teamlead', 'vsuite_ctv'],
  logistics: ['vsuite_admin', 'vsuite_ops', 'vsuite_teamlead', 'vsuite_accountant'],
  lms: ['vsuite_admin', 'vsuite_ops', 'vsuite_lms'],
  customer: ['vsuite_admin', 'vsuite_ops'],
  acceptance: ['vsuite_admin', 'vsuite_ops', 'vsuite_accountant', 'vsuite_teamlead', 'vsuite_requester', 'vsuite_manager', 'vsuite_director', 'vsuite_treasurer'],
};

export function isVsuiteRole(role: string | null | undefined): role is VsuiteRole {
  return Object.prototype.hasOwnProperty.call(VSUITE_ROLE_META, String(role || ''));
}

export function canEditVsuiteTab(tab: string, role: string | null | undefined) {
  if (!isVsuiteRole(role)) return false;
  const key = tab as VsuiteTabKey;
  return Boolean(TAB_EDIT[key]?.includes(role));
}

export function getVsuiteStatusTone(status: string | null | undefined): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' {
  const value = String(status || '').toLowerCase();
  if (['overdue', 'blocked', 'missing_conditions', 'red'].includes(value)) return 'danger';
  if (['pending', 'preparing', 'amber', 'in_progress'].includes(value)) return 'warning';
  if (['done', 'completed', 'ready', 'green'].includes(value)) return 'success';
  if (['running', 'accepting'].includes(value)) return 'violet';
  return 'neutral';
}

export function buildVsuiteClassCompletion(items: Array<{ state?: string | null }>) {
  const actionable = items.filter((item) => item.state !== 'na');
  const done = actionable.filter((item) => item.state === 'done').length;
  const total = actionable.length;
  return {
    total,
    done,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

export const VSUITE_SEED_EMAILS: Record<VsuiteRole, string> = {
  vsuite_admin: 'vsuite.admin@vinabrain.com',
  vsuite_ops: 'ops@vinabrain.com',
  vsuite_trainer: 'trainer@vinabrain.com',
  vsuite_teamlead: 'teamlead@vinabrain.com',
  vsuite_ctv: 'ctv@vinabrain.com',
  vsuite_lms: 'lms@vinabrain.com',
  vsuite_accountant: 'accountant@vinabrain.com',
  vsuite_requester: 'requester@vinabrain.com',
  vsuite_manager: 'manager@vinabrain.com',
  vsuite_director: 'director@vinabrain.com',
  vsuite_treasurer: 'treasurer@vinabrain.com',
};

export function buildVsuiteSeedAccounts(password = '123456') {
  return (Object.keys(VSUITE_ROLE_META) as VsuiteRole[]).map((role) => ({
    email: VSUITE_SEED_EMAILS[role],
    password,
    fullName: VSUITE_ROLE_META[role].label,
    role,
    title: VSUITE_ROLE_META[role].title,
  }));
}

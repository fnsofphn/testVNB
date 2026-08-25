export type RoleKey =
  | 'admin'
  | 'content_manager'
  | 'production_manager'
  | 'pm'
  | 'specialist'
  | 'qc'
  | 'hoc_gia'
  | 'hoc_vien'
  | 'giang_vien'
  | 'ctv'
  | 'coaching_admin'
  | 'coach'
  | 'coachee'
  | 'observer'
  | 'plx_playbook_viewer'
  | 'training_ops_admin'
  | 'client'
  | 'client_director'
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

export type PageKey =
  | 'profile'
  | 'guide'
  | 'ecosystem'
  | 'dashboard'
  | 'production-insight'
  | 'tracking'
  | 'today-todo'
  | 'notifications'
  | 'client-orders'
  | 'client-new-order'
  | 'client-order-detail'
  | 'client-products'
  | 'client-delivery'
  | 'client-payment'
  | 'client-approvals'
  | 'producer-inbox'
  | 'order-pm-dashboard'
  | 'producer-launch'
  | 'producer-deliver'
  | 'producer-invoice'
  | 'production-workflow'
  | 'schedule-setup'
  | 'my-tasks'
  | 'smf-my-tasks'
  | 'vsmf-my-tasks'
  | 'gsmf-my-tasks'
  | 'smf00'
  | 'smf01'
  | 'smf02'
  | 'smf03'
  | 'smf04'
  | 'smf05'
  | 'smf06'
  | 'smf07'
  | 'smf08'
  | 'smf09'
  | 'vsmf00'
  | 'vsmf01'
  | 'vsmf02'
  | 'vsmf03'
  | 'vsmf04'
  | 'vsmf05'
  | 'vsmf06'
  | 'vsmf07'
  | 'vsmf08'
  | 'gsmf01'
  | 'gsmf00'
  | 'gsmf02'
  | 'gsmf03'
  | 'gsmf04'
  | 'qc-criteria'
  | 'lecturer-question-bank'
  | 'quiz-test-library'
  | 'quiz-question-library'
  | 'quiz-create-test'
  | 'vdiscussion'
  | 'v-events'
  | 'vbusiness'
  | 'vplanning'
  | 'vtraining'
  | 'vculture'
  | 'vcoaching'
  | 'vlearning'
  | 'v-survey'
  | 'v-suite'
  | 'v-helpdesk'
  | 'elearning-courses'
  | 'student-survey-results'
  | 'student-survey-results-2'
  | 'student-survey-plx-tna'
  | 'users'
  | 'account-manager'
  | 'utilities'
  | 'data'
  | 'training-knowledge'
  | 'training-test'
  | 'audit'
  | 'archived-products';

export type NavItem = {
  key: PageKey;
  label: string;
  icon: string;
};

export type NavSection = {
  title: string;
  tone?: 'gold' | 'violet' | 'red' | 'cyan';
  items: NavItem[];
};

export const ROLE_META: Record<RoleKey, { label: string; title: string }> = {
  content_manager: { label: 'Qu\u1ea3n l\u00fd n\u1ed9i dung', title: 'To\u00e0n quy\u1ec1n, tr\u1eeb s\u1eeda k\u1ebf ho\u1ea1ch s\u1ea3n xu\u1ea5t' },
  production_manager: { label: 'Qu\u1ea3n l\u00fd s\u1ea3n xu\u1ea5t', title: 'To\u00e0n quy\u1ec1n, tr\u1eeb s\u1eeda qu\u1ea3n l\u00fd \u0111\u01a1n h\u00e0ng' },
  admin: { label: 'Quản trị', title: 'GĐ Đào tạo · Toàn quyền' },
  pm: { label: 'PM', title: 'Điều phối sản xuất' },
  specialist: { label: 'Chuyên viên', title: 'Kịch bản · Thiết kế · Thu âm · Dựng' },
  qc: { label: 'QC', title: 'Kiểm soát chất lượng' },
  hoc_gia: { label: 'Học giả', title: 'Thực hiện công đoạn được giao' },
  hoc_vien: { label: 'Học viên', title: 'Chỉ tham gia game public' },
  giang_vien: { label: 'Giảng viên', title: 'Xem lớp và hoạt động được phân công' },
  ctv: { label: 'CTV', title: 'Cộng tác viên VTraining' },
  coaching_admin: { label: 'Quản trị coaching', title: 'Quản lý chương trình V-culture/V-coaching' },
  coach: { label: 'Coach', title: 'Theo dõi nhóm coachee và phản hồi sau phiên' },
  coachee: { label: 'Coachee', title: 'Đọc tài liệu, chuẩn bị trước phiên và xác nhận CTHĐ' },
  observer: { label: 'Observer', title: 'Theo dõi báo cáo V-culture/V-coaching được chia sẻ' },
  plx_playbook_viewer: { label: 'PLX CEO Playbook', title: 'Chi xem so tay PLX CEO Playbook' },
  training_ops_admin: { label: 'Quản trị đào tạo', title: 'Vận hành VTraining, VSurvey, VDiscussion, VEvent và kết quả game' },
  client: { label: 'Khách hàng', title: 'Cổng khách hàng' },
  client_director: { label: 'Giám đốc KH', title: 'Duyệt đơn nội bộ khách hàng' },
  vsuite_admin: { label: 'V-Suite Admin', title: 'Toàn quyền điều hành V-Suite' },
  vsuite_ops: { label: 'V-Suite Ops', title: 'Quản lý vận hành dịch vụ' },
  vsuite_trainer: { label: 'V-Suite Trainer', title: 'Giảng viên' },
  vsuite_teamlead: { label: 'V-Suite Teamlead', title: 'Điều phối CTV' },
  vsuite_ctv: { label: 'V-Suite CTV', title: 'Cộng tác viên vận hành' },
  vsuite_lms: { label: 'V-Suite LMS', title: 'Kỹ thuật LMS' },
  vsuite_accountant: { label: 'V-Suite Accountant', title: 'Kế toán và nghiệm thu' },
  vsuite_requester: { label: 'V-Suite Requester', title: 'Nhân viên lập đề nghị thanh toán' },
  vsuite_manager: { label: 'V-Suite Manager', title: 'Quản lý duyệt nghiệp vụ' },
  vsuite_director: { label: 'V-Suite Director', title: 'Giám đốc duyệt chi' },
  vsuite_treasurer: { label: 'V-Suite Treasurer', title: 'Thủ quỹ xác nhận chi tiền' },
};

export const PAGE_LABELS = {
  ecosystem: 'Hệ sinh thái Vinabrain',
  profile: 'Hồ sơ cá nhân',
  guide: 'Hướng dẫn sử dụng phần mềm',
  dashboard: 'Quản lý đơn hàng',
  'production-insight': 'Insight sản xuất',
  tracking: 'Kế hoạch sản xuất',
  'today-todo': 'Today-do list',
  notifications: 'Thông báo',
  'client-orders': 'Đơn hàng của tôi',
  'client-new-order': 'Tạo đơn hàng mới',
  'client-order-detail': 'Chi tiết đơn hàng',
  'client-products': 'Nhập yêu cầu sản phẩm',
  'client-delivery': 'Nghiệm thu',
  'client-payment': 'Thanh toán',
  'client-approvals': 'Duyệt đơn khách hàng',
  'producer-inbox': 'Hộp thư đơn hàng',
  'order-pm-dashboard': 'Bảng điều khiển PM theo đơn',
  'producer-launch': 'Chuyển vào sản xuất',
  'producer-deliver': 'Bàn giao sản phẩm',
  'producer-invoice': 'Đề nghị thanh toán',
  'production-workflow': 'Luồng sản xuất',
  'schedule-setup': 'Thiết lập kế hoạch',
  'my-tasks': 'Công việc của tôi',
  'smf-my-tasks': 'SMF-00 Việc của tôi',
  smf00: 'SMF-00 Danh mục đơn hàng',
  smf01: 'SMF-01 Đầu vào',
  smf02: 'SMF-02 Storyboard',
  smf03: 'SMF-03 Thiết kế slides',
  smf04: 'SMF-04 QC Slides',
  smf05: 'SMF-05 Thu âm',
  smf06: 'SMF-06 QC Âm thanh',
  smf07: 'SMF-07 Biên tập Video',
  smf08: 'SMF-08 QC Video',
  smf09: 'SMF-09 SCORM + Trắc nghiệm',
  'vsmf-my-tasks': 'VSMF-00 Việc của tôi',
  vsmf00: 'VSMF-00 Danh mục đơn hàng',
  vsmf01: 'VSMF-01 Đầu vào',
  vsmf02: 'VSMF-02 Storyboard',
  vsmf03: 'VSMF-03 Thiết kế slides',
  vsmf04: 'VSMF-04 QC Slides',
  vsmf05: 'VSMF-05 Thu âm',
  vsmf06: 'VSMF-06 QC Âm thanh',
  vsmf07: 'VSMF-07 Biên tập Video',
  vsmf08: 'VSMF-08 QC Video',
  'gsmf-my-tasks': 'GSMF-00 Việc của tôi',
  gsmf01: 'GSMF-01 Yêu cầu khởi chạy',
  gsmf00: 'GSMF-00 Danh mục game',
  gsmf02: 'GSMF-02 Màn chạy thử trò chơi',
  gsmf03: 'GSMF-03 QC trò chơi',
  gsmf04: 'GSMF-04 Trò chơi hoàn chỉnh',
  'qc-criteria': 'Tiêu chí QC',
  users: 'Người dùng',
  'account-manager': 'Quản lý tài khoản',
  utilities: 'V-tools',
  'v-suite': 'V-Suite',
  'v-helpdesk': 'V-helpdesk',
  data: 'Data',
  'training-knowledge': 'Kiến thức training',
  'training-test': 'Test kiến thức',
  audit: 'Nhật ký kiểm tra',
  'archived-products': 'Thư viện lưu trữ',
} as Record<PageKey, string>;

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Tổng quan',
    items: [
      { key: 'dashboard', label: 'Quản lý đơn hàng', icon: '⬛' },
      { key: 'tracking', label: 'Kế hoạch sản xuất', icon: '📊' },
      { key: 'archived-products', label: 'Thư viện lưu trữ', icon: 'LIB' },
    ],
  },
  {
    title: 'Nghiệm thu',
    tone: 'gold',
    items: [
      { key: 'client-delivery', label: 'Nghiệm thu Sản phẩm', icon: '✅' },
      { key: 'client-payment', label: 'Thanh toán', icon: '💳' },
    ],
  },
  {
    title: 'Kế hoạch SX',
    items: [
      { key: 'production-workflow', label: 'Luồng sản xuất', icon: '🎯' },
      { key: 'schedule-setup', label: 'Thiết lập kế hoạch', icon: '📐' },
      { key: 'my-tasks', label: 'Công việc của tôi', icon: '✅' },
    ],
  },
  {
    title: 'Phân hệ 2 — E-learning SMF',
    tone: 'violet',
    items: [
      { key: 'smf-my-tasks', label: 'SMF-00 Việc của tôi', icon: '00' },
      { key: 'smf00', label: 'SMF-00 Danh mục đơn hàng', icon: '00' },
      { key: 'smf01', label: 'SMF-01 Đầu vào', icon: '01' },
      { key: 'smf02', label: 'SMF-02 Storyboard', icon: '02' },
      { key: 'smf03', label: 'SMF-03 Thiết kế slides', icon: '03' },
      { key: 'smf04', label: 'SMF-04 QC Slides', icon: '04' },
      { key: 'smf05', label: 'SMF-05 Thu âm', icon: '05' },
      { key: 'smf06', label: 'SMF-06 QC Âm thanh', icon: '06' },
      { key: 'smf07', label: 'SMF-07 Biên tập Video', icon: '07' },
      { key: 'smf08', label: 'SMF-08 QC Video', icon: '08' },
      { key: 'smf09', label: 'SMF-09 SCORM + Trắc nghiệm', icon: '09' },
    ],
  },
  {
    title: 'Phân hệ 3 — Video học liệu',
    tone: 'red',
    items: [
      { key: 'vsmf-my-tasks', label: 'VSMF-00 Việc của tôi', icon: '00' },
      { key: 'vsmf00', label: 'VSMF-00 Danh mục đơn hàng', icon: '00' },
      { key: 'vsmf01', label: 'VSMF-01 Đầu vào', icon: '01' },
      { key: 'vsmf02', label: 'VSMF-02 Storyboard', icon: '02' },
      { key: 'vsmf03', label: 'VSMF-03 Thiết kế slides', icon: '03' },
      { key: 'vsmf04', label: 'VSMF-04 QC Slides', icon: '04' },
      { key: 'vsmf05', label: 'VSMF-05 Thu âm', icon: '05' },
      { key: 'vsmf06', label: 'VSMF-06 QC Âm thanh', icon: '06' },
      { key: 'vsmf07', label: 'VSMF-07 Biên tập Video', icon: '07' },
      { key: 'vsmf08', label: 'VSMF-08 QC Video', icon: '08' },
    ],
  },
  {
    title: 'Phân hệ 4 — Trò chơi tương tác',
    tone: 'cyan',
    items: [
      { key: 'gsmf-my-tasks', label: 'GSMF-00 Việc của tôi', icon: '00' },
      { key: 'gsmf00', label: 'GSMF-00 Danh mục game', icon: '00' },
      { key: 'gsmf01', label: 'GSMF-01 Yêu cầu khởi chạy', icon: '🎮' },
      { key: 'gsmf02', label: 'GSMF-02 Màn chạy thử game', icon: '🕹' },
      { key: 'gsmf03', label: 'GSMF-03 QC trò chơi', icon: '🧪' },
      { key: 'gsmf04', label: 'GSMF-04 Trò chơi hoàn chỉnh', icon: '🏁' },
    ],
  },
  {
    title: 'Kh\u1ea3o s\u00e1t',
    tone: 'cyan',
    items: [
      { key: 'v-survey', label: 'V-survey', icon: 'VS' },
      { key: 'student-survey-results', label: 'Kh\u1ea3o s\u00e1t EVNSPC TNKH', icon: 'SV' },
      { key: 'student-survey-results-2', label: 'Kh\u1ea3o s\u00e1t EVNSPC TNKH 2', icon: 'S2' },
      { key: 'student-survey-plx-tna', label: 'Kh\u1ea3o s\u00e1t PLX TNA', icon: 'PX' },
    ],
  },
  {
    title: 'Hệ thống',
    tone: 'cyan',
    items: [
      { key: 'qc-criteria', label: 'Tiêu chí QC', icon: '📏' },
      { key: 'notifications', label: 'Thông báo', icon: 'BEL' },
      { key: 'users', label: 'Người dùng', icon: '👥' },
      { key: 'utilities', label: 'V-tools', icon: 'VT' },
      { key: 'v-helpdesk', label: 'V-helpdesk', icon: 'VH' },
      { key: 'data', label: 'Data', icon: 'DB' },
      { key: 'audit', label: 'Nhật ký kiểm tra', icon: '📚' },
      { key: 'account-manager', label: 'Quản lý tài khoản', icon: 'ACC' },
    ],
  },
  {
    title: 'Training vận hành',
    tone: 'violet',
    items: [
      { key: 'training-knowledge', label: 'Kiến thức training', icon: 'TR' },
      { key: 'training-test', label: 'Test kiến thức', icon: 'QT' },
    ],
  },
  {
    title: 'Today-do list',
    tone: 'gold',
    items: [{ key: 'today-todo', label: 'Today-do list', icon: 'TD' }],
  },
  {
    title: 'Hỗ trợ',
    tone: 'cyan',
    items: [{ key: 'guide', label: 'Hướng dẫn sử dụng phần mềm', icon: '📘' }],
  },
  {
    title: 'Insight',
    tone: 'gold',
    items: [{ key: 'production-insight', label: 'Insight sản xuất', icon: 'IN' }],
  },
];

const REMOVED_PLANNING_MODULE_KEYS: PageKey[] = ['production-workflow', 'schedule-setup'];
const REMOVED_VCONTENT_SURVEY_NAV_KEYS: PageKey[] = [
  'v-survey',
  'student-survey-results',
  'student-survey-results-2',
  'student-survey-plx-tna',
];
const REMOVED_SEPARATED_PRODUCT_NAV_KEYS: PageKey[] = ['utilities', 'v-helpdesk'];
const REMOVED_GAMIFICATION_NAV_KEYS: PageKey[] = ['gsmf-my-tasks', 'gsmf00', 'gsmf01', 'gsmf02', 'gsmf03', 'gsmf04'];
for (const section of NAV_SECTIONS) {
  section.items = section.items.filter(
    (item) =>
      !REMOVED_PLANNING_MODULE_KEYS.includes(item.key) &&
      !REMOVED_VCONTENT_SURVEY_NAV_KEYS.includes(item.key) &&
      !REMOVED_SEPARATED_PRODUCT_NAV_KEYS.includes(item.key) &&
      !REMOVED_GAMIFICATION_NAV_KEYS.includes(item.key),
  );
}
for (let index = NAV_SECTIONS.length - 1; index >= 0; index -= 1) {
  if (!NAV_SECTIONS[index].items.length) NAV_SECTIONS.splice(index, 1);
}

export const ALLOWED_PAGES: Record<RoleKey, PageKey[]> = {
  admin: (Object.keys(PAGE_LABELS) as PageKey[]).filter((page) => page !== 'my-tasks' && page !== 'smf-my-tasks' && page !== 'vsmf-my-tasks' && page !== 'gsmf-my-tasks'),
  content_manager: (Object.keys(PAGE_LABELS) as PageKey[]).filter((page) => page !== 'my-tasks' && page !== 'smf-my-tasks' && page !== 'vsmf-my-tasks' && page !== 'gsmf-my-tasks'),
  production_manager: (Object.keys(PAGE_LABELS) as PageKey[]).filter((page) => page !== 'my-tasks' && page !== 'smf-my-tasks' && page !== 'vsmf-my-tasks' && page !== 'gsmf-my-tasks'),
  pm: ['profile', 'guide', 'ecosystem', 'dashboard', 'production-insight', 'tracking', 'today-todo', 'notifications', 'producer-inbox', 'order-pm-dashboard', 'producer-launch', 'producer-deliver', 'producer-invoice', 'production-workflow', 'schedule-setup', 'my-tasks', 'smf00', 'smf01', 'smf02', 'vsmf00', 'vsmf01', 'vsmf02', 'gsmf00', 'gsmf01', 'gsmf02', 'utilities', 'training-knowledge', 'training-test', 'archived-products'],
  specialist: ['profile', 'guide', 'ecosystem', 'today-todo', 'notifications', 'utilities', 'my-tasks', 'smf-my-tasks', 'smf01', 'smf02', 'smf03', 'smf04', 'smf05', 'smf06', 'smf07', 'smf08', 'smf09', 'vsmf-my-tasks', 'vsmf01', 'vsmf02', 'vsmf03', 'vsmf04', 'vsmf05', 'vsmf06', 'vsmf07', 'vsmf08', 'gsmf-my-tasks', 'gsmf00', 'gsmf01', 'gsmf02', 'gsmf03', 'gsmf04'],
  qc: ['profile', 'guide', 'ecosystem', 'today-todo', 'notifications', 'utilities', 'training-knowledge', 'training-test', 'my-tasks', 'smf00', 'smf04', 'smf06', 'smf08', 'vsmf00', 'vsmf04', 'vsmf06', 'vsmf08', 'gsmf00', 'gsmf03', 'qc-criteria', 'production-insight', 'tracking'],
  hoc_gia: [
    'ecosystem',
    'my-tasks',
    'smf-my-tasks',
    'profile',
    'guide',
    'notifications',
    'smf01',
    'smf02',
    'smf03',
    'smf04',
    'smf05',
    'smf06',
    'smf07',
    'smf08',
    'smf09',
    'vsmf-my-tasks',
    'vsmf01',
    'vsmf02',
    'vsmf03',
    'vsmf04',
    'vsmf05',
    'vsmf06',
    'vsmf07',
    'vsmf08',
    'gsmf-my-tasks',
  ],
  hoc_vien: ['ecosystem', 'vtraining', 'vcoaching', 'vlearning', 'vdiscussion', 'profile'],
  giang_vien: ['profile', 'guide', 'ecosystem', 'vtraining', 'notifications'],
  ctv: ['profile', 'guide', 'ecosystem', 'vtraining', 'notifications'],
  coaching_admin: ['profile', 'guide', 'ecosystem', 'vculture', 'vcoaching', 'vtraining', 'vdiscussion', 'notifications'],
  coach: ['profile', 'guide', 'ecosystem', 'vculture', 'vcoaching', 'vtraining', 'vdiscussion', 'notifications'],
  coachee: ['profile', 'guide', 'ecosystem', 'vculture', 'vcoaching', 'vlearning', 'notifications'],
  observer: ['profile', 'guide', 'ecosystem', 'vculture', 'vcoaching', 'notifications'],
  plx_playbook_viewer: [],
  training_ops_admin: [
    'profile',
    'guide',
    'ecosystem',
    'notifications',
    'vtraining',
    'gsmf00',
    'v-survey',
    'student-survey-results',
    'student-survey-results-2',
    'student-survey-plx-tna',
    'vdiscussion',
    'v-events',
  ],
  client: ['profile', 'guide', 'ecosystem', 'vtraining', 'v-helpdesk', 'client-orders', 'client-order-detail', 'client-new-order', 'client-products', 'client-delivery', 'client-payment', 'notifications'],
  client_director: ['profile', 'guide', 'ecosystem', 'vtraining', 'v-helpdesk', 'client-orders', 'client-order-detail', 'client-new-order', 'client-products', 'client-delivery', 'client-payment', 'client-approvals', 'notifications'],
  vsuite_admin: ['profile', 'guide', 'ecosystem', 'v-suite', 'vtraining', 'notifications'],
  vsuite_ops: ['profile', 'guide', 'ecosystem', 'v-suite', 'vtraining', 'notifications'],
  vsuite_trainer: ['profile', 'guide', 'ecosystem', 'v-suite', 'vtraining', 'notifications'],
  vsuite_teamlead: ['profile', 'guide', 'ecosystem', 'v-suite', 'vtraining', 'notifications'],
  vsuite_ctv: ['profile', 'guide', 'ecosystem', 'v-suite', 'vtraining', 'notifications'],
  vsuite_lms: ['profile', 'guide', 'ecosystem', 'v-suite', 'vtraining', 'notifications'],
  vsuite_accountant: ['profile', 'guide', 'ecosystem', 'v-suite', 'notifications'],
  vsuite_requester: ['profile', 'guide', 'ecosystem', 'v-suite', 'notifications'],
  vsuite_manager: ['profile', 'guide', 'ecosystem', 'v-suite', 'notifications'],
  vsuite_director: ['profile', 'guide', 'ecosystem', 'v-suite', 'notifications'],
  vsuite_treasurer: ['profile', 'guide', 'ecosystem', 'v-suite', 'notifications'],
};

PAGE_LABELS['lecturer-question-bank'] = 'Bộ câu hỏi giảng viên';
PAGE_LABELS['quiz-test-library'] = 'Thư viện bài kiểm tra';
PAGE_LABELS['quiz-question-library'] = 'Thư viện câu hỏi kiểm tra';
PAGE_LABELS['quiz-create-test'] = 'Khởi tạo bài kiểm tra';
PAGE_LABELS.vdiscussion = 'V-Discussion';
PAGE_LABELS['v-events'] = 'V-events';
PAGE_LABELS.vbusiness = 'V-Business';
PAGE_LABELS.vplanning = 'V-Work';
PAGE_LABELS.vtraining = 'V-Training';
PAGE_LABELS.vculture = 'V-Culture';
PAGE_LABELS.vcoaching = 'V-Coaching';
PAGE_LABELS.vlearning = 'V-Learning';
PAGE_LABELS['v-survey'] = 'V-survey';
PAGE_LABELS['v-helpdesk'] = 'V-helpdesk';
PAGE_LABELS['elearning-courses'] = 'Khóa học E-learning';
PAGE_LABELS['student-survey-results'] = 'Khảo sát học viên';
PAGE_LABELS['student-survey-results-2'] = 'Khảo sát học viên 2';
PAGE_LABELS['student-survey-plx-tna'] = 'Kh\u1ea3o s\u00e1t PLX TNA';

const systemSection = NAV_SECTIONS.find((section) => section.items.some((item) => item.key === 'qc-criteria'));
const surveySection = NAV_SECTIONS.find((section) => section.items.some((item) => item.key === 'student-survey-results'));
const ecosystemSection = NAV_SECTIONS.find((section) => section.items.some((item) => item.key === 'ecosystem'));
if (ecosystemSection && !ecosystemSection.items.some((item) => item.key === 'v-suite')) {
  ecosystemSection.items.push({ key: 'v-suite', label: 'V-Suite', icon: 'VS' });
}
if (ecosystemSection && !ecosystemSection.items.some((item) => item.key === 'v-events')) {
  ecosystemSection.items.push({ key: 'v-events', label: 'V-events', icon: 'VE' });
}
if (ecosystemSection && !ecosystemSection.items.some((item) => item.key === 'vplanning')) {
  ecosystemSection.items.push({ key: 'vplanning', label: 'V-Work', icon: 'VW' });
}
if (systemSection && !systemSection.items.some((item) => item.key === 'lecturer-question-bank')) {
  const qcCriteriaIndex = systemSection.items.findIndex((item) => item.key === 'qc-criteria');
  systemSection.items.splice(qcCriteriaIndex >= 0 ? qcCriteriaIndex + 1 : 0, 0, {
    key: 'lecturer-question-bank',
    label: 'Bộ câu hỏi giảng viên',
    icon: 'LQ',
  });
}

if (surveySection && !surveySection.items.some((item) => item.key === 'student-survey-results')) {
  surveySection.items.splice(0, 0, {
    key: 'student-survey-results',
    label: 'Khảo sát học viên',
    icon: 'SV',
  });
}

if (surveySection && !surveySection.items.some((item) => item.key === 'student-survey-results-2')) {
  const surveyIndex = surveySection.items.findIndex((item) => item.key === 'student-survey-results');
  surveySection.items.splice(surveyIndex >= 0 ? surveyIndex + 1 : 0, 0, {
    key: 'student-survey-results-2',
    label: 'Khảo sát học viên 2',
    icon: 'S2',
  });
}

if (!ALLOWED_PAGES.qc.includes('lecturer-question-bank')) {
  ALLOWED_PAGES.qc.splice(ALLOWED_PAGES.qc.indexOf('qc-criteria') + 1, 0, 'lecturer-question-bank');
}

if (!ALLOWED_PAGES.qc.includes('student-survey-results')) {
  ALLOWED_PAGES.qc.splice(ALLOWED_PAGES.qc.indexOf('lecturer-question-bank') + 1, 0, 'student-survey-results');
}

if (!ALLOWED_PAGES.qc.includes('student-survey-results-2')) {
  ALLOWED_PAGES.qc.splice(ALLOWED_PAGES.qc.indexOf('student-survey-results') + 1, 0, 'student-survey-results-2');
}

if (!ALLOWED_PAGES.qc.includes('student-survey-plx-tna')) {
  ALLOWED_PAGES.qc.splice(ALLOWED_PAGES.qc.indexOf('student-survey-results-2') + 1, 0, 'student-survey-plx-tna');
}

for (const page of ['quiz-test-library', 'quiz-question-library', 'quiz-create-test'] as PageKey[]) {
  if (!ALLOWED_PAGES.qc.includes(page)) ALLOWED_PAGES.qc.push(page);
  if (!ALLOWED_PAGES.pm.includes(page)) ALLOWED_PAGES.pm.push(page);
  if (!ALLOWED_PAGES.admin.includes(page)) ALLOWED_PAGES.admin.push(page);
}

for (const page of ['vbusiness', 'vplanning', 'vdiscussion', 'v-events', 'vtraining', 'vculture', 'vcoaching', 'vlearning', 'v-survey', 'elearning-courses'] as PageKey[]) {
  if (!ALLOWED_PAGES.qc.includes(page)) ALLOWED_PAGES.qc.push(page);
  if (!ALLOWED_PAGES.pm.includes(page)) ALLOWED_PAGES.pm.push(page);
  if (!ALLOWED_PAGES.admin.includes(page)) ALLOWED_PAGES.admin.push(page);
  if (!ALLOWED_PAGES.content_manager.includes(page)) ALLOWED_PAGES.content_manager.push(page);
  if (!ALLOWED_PAGES.production_manager.includes(page)) ALLOWED_PAGES.production_manager.push(page);
}

for (const page of ['vculture', 'vcoaching'] as PageKey[]) {
  if (!ALLOWED_PAGES.coaching_admin.includes(page)) ALLOWED_PAGES.coaching_admin.push(page);
  if (!ALLOWED_PAGES.coach.includes(page)) ALLOWED_PAGES.coach.push(page);
  if (!ALLOWED_PAGES.coachee.includes(page)) ALLOWED_PAGES.coachee.push(page);
  if (!ALLOWED_PAGES.observer.includes(page)) ALLOWED_PAGES.observer.push(page);
}

for (const page of ['vtraining'] as PageKey[]) {
  if (!ALLOWED_PAGES.client.includes(page)) ALLOWED_PAGES.client.push(page);
  if (!ALLOWED_PAGES.client_director.includes(page)) ALLOWED_PAGES.client_director.push(page);
}

if (!ALLOWED_PAGES.pm.includes('student-survey-results')) {
  ALLOWED_PAGES.pm.push('student-survey-results');
}

if (!ALLOWED_PAGES.pm.includes('student-survey-results-2')) {
  ALLOWED_PAGES.pm.push('student-survey-results-2');
}

if (!ALLOWED_PAGES.pm.includes('student-survey-plx-tna')) {
  ALLOWED_PAGES.pm.push('student-survey-plx-tna');
}

if (!ALLOWED_PAGES.admin.includes('lecturer-question-bank')) {
  ALLOWED_PAGES.admin.push('lecturer-question-bank');
}

if (!ALLOWED_PAGES.admin.includes('student-survey-results')) {
  ALLOWED_PAGES.admin.push('student-survey-results');
}

if (!ALLOWED_PAGES.admin.includes('student-survey-results-2')) {
  ALLOWED_PAGES.admin.push('student-survey-results-2');
}

if (!ALLOWED_PAGES.admin.includes('student-survey-plx-tna')) {
  ALLOWED_PAGES.admin.push('student-survey-plx-tna');
}

for (const adminLikeRole of ['content_manager', 'production_manager'] as const) {
  for (const page of ALLOWED_PAGES.admin) {
    if (page === 'users') continue;
    if (!ALLOWED_PAGES[adminLikeRole].includes(page)) {
      ALLOWED_PAGES[adminLikeRole].push(page);
    }
  }
  ALLOWED_PAGES[adminLikeRole] = ALLOWED_PAGES[adminLikeRole].filter((page) => page !== 'users');
}

export const KPIS = [
  { label: 'Việc quá hạn', value: '6', sub: 'Cần xử lý ngay', tone: 'danger' },
  { label: 'Sản phẩm đang SX', value: '24', sub: '↑3 tuần này', tone: 'violet' },
  { label: 'Hoàn thành tháng', value: '11', sub: 'Mục tiêu: 15', tone: 'success' },
  { label: 'Đơn hàng đang chạy', value: '8', sub: '5 đối tác', tone: 'warning' },
] as const;

export const HEATMAP_ROWS = [
  { order: 'VNPT-BG001', stages: ['done', 'done', 'done', 'done', 'active', 'idle', 'idle', 'idle', 'idle'] },
  { order: 'EVN-Video01', stages: ['done', 'done', 'done', 'done', 'done', 'done', 'fail', 'locked', 'locked'] },
  { order: 'PLX-Game01', stages: ['done', 'done', 'done', 'active', 'locked', 'locked', 'locked', 'idle', 'idle'] },
];

export const ALERTS = [
  { level: 'critical', title: 'VNPT BG-001 B5: Thu âm hạn 13/4', detail: 'VC: Minh Tú · 7/14 cảnh', action: 'smf05' as PageKey },
  { level: 'critical', title: 'EVN-Video01 B7: QC lỗi vòng 2', detail: '3 lỗi nghiêm trọng chờ sửa', action: 'vsmf06' as PageKey },
  { level: 'warning', title: 'SGT đơn mới: Hộp thư chờ PM nhận', detail: 'Gửi 5 ngày trước', action: 'producer-inbox' as PageKey },
  { level: 'warning', title: 'VNPT đơn mới chờ bàn giao đợt 1', detail: '3 sản phẩm đã hoàn thành', action: 'producer-deliver' as PageKey },
];

export const ORDERS = [
  { id: 'ORD-2606', title: 'VNPT Rising Batch 3', client: 'VNPT Corp', module: 'ELN', status: 'in_production', deadline: '2026-04-18', stage: 'SMF-05', owner: 'Văn Đức', progress: 68, products: 3 },
  { id: 'ORD-2607', title: 'EVN Safety Video 01', client: 'EVN', module: 'VIDEO', status: 'qc_fail', deadline: '2026-04-15', stage: 'VSMF-07', owner: 'Hà Nhi', progress: 82, products: 1 },
  { id: 'ORD-2608', title: 'SaigonTourist Service Culture', client: 'SaigonTourist', module: 'ELN', status: 'pending_launch', deadline: '2026-04-25', stage: 'SMF-01', owner: 'Lê Hải', progress: 12, products: 2 },
  { id: 'ORD-2609', title: 'BIDV KYC Storyline', client: 'BIDV', module: 'ELN', status: 'ready_delivery', deadline: '2026-04-12', stage: 'SMF-08', owner: 'Phương Anh', progress: 96, products: 1 },
];

export const TASKS = [
  { id: 'TS-401', title: 'Duyệt kịch bản v2', owner: 'PM', due: 'Hôm nay 15:00', status: 'review', stage: 'SMF-02' },
  { id: 'TS-402', title: 'Đồng bộ phụ đề và xuất 1080p', owner: 'Chuyên viên', due: 'Hôm nay 18:00', status: 'in_progress', stage: 'VSMF-06' },
  { id: 'TS-403', title: 'QC video đợt 3', owner: 'QC', due: 'Ngày mai', status: 'todo', stage: 'SMF-07' },
  { id: 'TS-404', title: 'Khóa gói đầu vào', owner: 'PM', due: 'Quá hạn 1 ngày', status: 'overdue', stage: 'SMF-01' },
];

export const NOTIFICATIONS = [
  { level: 'critical', title: 'QC fail ở EVN-Video01', body: 'VSMF-08 trả về 3 lỗi chính, cần mở lại VSMF-07.', when: '11/4 09:15', page: 'vsmf07' as PageKey },
  { level: 'warning', title: 'Đơn hàng ORD-2608 chờ khởi chạy', body: 'Gói đầu vào đã đủ, PM cần xác nhận đầu vào.', when: '11/4 08:40', page: 'producer-launch' as PageKey },
  { level: 'info', title: 'Khách hàng xác nhận thanh toán đợt 1', body: 'VNPT BG-002 đã xác nhận biên nhận trên cổng khách hàng.', when: '10/4 16:30', page: 'client-payment' as PageKey },
];

export const USERS = [
  { name: 'Lê Hải', email: 'le.hai@peopleone.vn', role: 'Quản trị', org: 'PeopleOne', active: true },
  { name: 'Nguyễn Văn Đức', email: 'v.duc@peopleone.vn', role: 'PM', org: 'PeopleOne', active: true },
  { name: 'Phương Anh', email: 'p.anh@peopleone.vn', role: 'Chuyên viên', org: 'PeopleOne', active: true },
  { name: 'Minh Tú', email: 'm.tu@peopleone.vn', role: 'Chuyên viên', org: 'PeopleOne', active: true },
  { name: 'Hà Nhi', email: 'ha.nhi@peopleone.vn', role: 'QC', org: 'PeopleOne', active: true },
  { name: 'Nguyễn Thị Lan', email: 'n.lan@vnpt.vn', role: 'Khách hàng', org: 'VNPT Corp', active: true },
];

export const QC_CRITERIA = [
  { group: 'B4 Slides', name: 'Phông chữ đúng bộ nhận diện', severity: 'Nghiêm trọng', stage: 'B4' },
  { group: 'B4 Slides', name: 'Bảng màu đúng chuẩn', severity: 'Nghiêm trọng', stage: 'B4' },
  { group: 'B4 Slides', name: 'Căn chỉnh nhất quán', severity: 'Chính', stage: 'B4' },
  { group: 'B7 Video', name: 'Đồng bộ âm thanh - hình ảnh', severity: 'Nghiêm trọng', stage: 'B7' },
  { group: 'B7 Video', name: 'Cân bằng nhạc nền (giọng > nhạc)', severity: 'Chính', stage: 'B7' },
];

export const STAGE_PAGES: Record<
  string,
  {
    eye: string;
    title: string;
    subtitle: string;
    columns: { title: string; count: number; tone: 'neutral' | 'danger' | 'warning' | 'success' }[];
    queue: { product: string; note: string; owner: string; status: string }[];
  }
> = {
  smf01: {
    eye: 'Phân hệ 2 · SMF-01',
    title: 'Quản lý Đầu vào',
    subtitle: 'Cổng đầu vào trước khi PM nhận đơn và khởi chạy sản xuất.',
    columns: [
      { title: 'Cần bổ sung', count: 3, tone: 'danger' },
      { title: 'Chờ xác nhận', count: 8, tone: 'warning' },
      { title: 'Sẵn sàng khởi chạy', count: 5, tone: 'success' },
    ],
    queue: [
      { product: 'VNPT-BG001 / P01', note: 'Thiếu kiểu chữ và bảng màu bản chốt', owner: 'Khách hàng', status: 'changes_requested' },
      { product: 'SGT-001 / P02', note: 'Đủ hồ sơ, chờ PM xác nhận', owner: 'PM', status: 'submitted' },
    ],
  },
  smf02: {
    eye: 'Phân hệ 2 · SMF-02',
    title: 'Quản lý Kịch bản',
    subtitle: 'Không gian tác nghiệp B2: soạn bản nháp, gửi duyệt, PM rà soát và mở B3.',
    columns: [
      { title: 'Cần làm', count: 4, tone: 'danger' },
      { title: 'Đang viết', count: 6, tone: 'warning' },
      { title: 'Chờ duyệt PM', count: 3, tone: 'neutral' },
      { title: 'Đã duyệt', count: 9, tone: 'success' },
    ],
    queue: [
      { product: 'VNPT-BG001 / P02', note: 'Kịch bản v3 đang chờ PM góp ý', owner: 'Phương Anh', status: 'in_review' },
      { product: 'BIDV-KYC / P01', note: 'Đã duyệt, chuẩn bị mở B3', owner: 'PM', status: 'approved' },
    ],
  },
  smf03: {
    eye: 'Phân hệ 2 · SMF-03',
    title: 'Quản lý Thiết kế slides',
    subtitle: 'Theo dõi tiến độ thiết kế, kiểm soát danh mục thương hiệu và chuẩn bị bàn giao sang QC.',
    columns: [
      { title: 'Cần làm', count: 5, tone: 'danger' },
      { title: 'Đang thiết kế', count: 7, tone: 'warning' },
      { title: 'Chờ gửi B4', count: 2, tone: 'neutral' },
      { title: 'Đạt B4', count: 10, tone: 'success' },
    ],
    queue: [
      { product: 'VNPT-BG001 / P03', note: 'Hình chủ đạo v2 đã ổn, chờ chốt cảnh 7-12', owner: 'Thiết kế', status: 'in_progress' },
      { product: 'SGT-001 / P01', note: 'Slides đã đạt kiểm tra thương hiệu', owner: 'QC', status: 'approved' },
    ],
  },
  smf04: {
    eye: 'Phân hệ 2 · SMF-04',
    title: 'Quản lý QC slides',
    subtitle: 'Cổng QC cho slides: nhận rà soát, đạt/chưa đạt và trả về B3 khi cần.',
    columns: [
      { title: 'Hàng chờ cần làm', count: 3, tone: 'danger' },
      { title: 'Đang rà soát', count: 2, tone: 'warning' },
      { title: 'Đã đạt', count: 11, tone: 'success' },
    ],
    queue: [{ product: 'EVN-Safety / P01', note: '2 lỗi chính: giãn cách và chú thích chân trang chưa đúng mẫu', owner: 'Hà Nhi', status: 'review' }],
  },
  smf05: {
    eye: 'Phân hệ 2 · SMF-05',
    title: 'Quản lý Thu âm',
    subtitle: 'Theo dõi tiến độ thu âm và chuẩn bị bàn giao sang cổng QC âm thanh.',
    columns: [
      { title: 'Cần thu', count: 4, tone: 'danger' },
      { title: 'Đang thu', count: 5, tone: 'warning' },
      { title: 'Chờ QC âm thanh', count: 2, tone: 'neutral' },
      { title: 'Sẵn sàng B6', count: 8, tone: 'success' },
    ],
    queue: [{ product: 'VNPT-BG001 / P01', note: '7/14 cảnh đã thu, thiếu chỉnh giọng địa phương', owner: 'Minh Tú', status: 'overdue' }],
  },
  smf06: {
    eye: 'Phân hệ 2 · SMF-06',
    title: 'Quản lý QC âm thanh',
    subtitle: 'QC theo từng tệp âm thanh, đạt/chưa đạt và trả về B5 khi cần.',
    columns: [
      { title: 'Hàng chờ rà soát', count: 2, tone: 'danger' },
      { title: 'Đang rà soát', count: 2, tone: 'warning' },
      { title: 'Đạt B6', count: 7, tone: 'success' },
    ],
    queue: [{ product: 'VNPT-BG001 / P01', note: 'Cần rà 2 tệp còn nhiễu nền và nhịp đọc chưa đều.', owner: 'QC âm thanh', status: 'review' }],
  },
  smf07: {
    eye: 'Phân hệ 2 · SMF-07',
    title: 'Quản lý Biên tập Video',
    subtitle: 'Theo dõi dựng, phụ đề, cấu hình xuất và danh mục bàn giao sang QC video.',
    columns: [
      { title: 'Cần dựng', count: 3, tone: 'danger' },
      { title: 'Đang dựng', count: 6, tone: 'warning' },
      { title: 'Chờ QC B8', count: 3, tone: 'neutral' },
      { title: 'B8 đạt', count: 6, tone: 'success' },
    ],
    queue: [{ product: 'EVN-Video01 / P01', note: 'QC lỗi vòng 2, đang sửa khung phụ đề và đồng bộ', owner: 'Tổ video', status: 'changes_requested' }],
  },
  smf08: {
    eye: 'Phân hệ 2 · SMF-08',
    title: 'Quản lý QC Video',
    subtitle: 'Bảng rà soát B8, nơi QC quyết định đạt/chưa đạt và mở đóng gói SCORM.',
    columns: [
      { title: 'Hàng chờ rà soát', count: 2, tone: 'danger' },
      { title: 'Đang rà soát', count: 3, tone: 'warning' },
      { title: 'Đạt', count: 7, tone: 'success' },
    ],
    queue: [{ product: 'EVN-Video01 / P01', note: '3 lỗi chính: tràn phụ đề, mở/kết video, lệch đồng bộ lời đọc', owner: 'Hà Nhi', status: 'fail' }],
  },
  smf09: {
    eye: 'Phân hệ 2 · SMF-09',
    title: 'Quản lý SCORM + Trắc nghiệm',
    subtitle: 'Đóng gói SCORM, cấu hình trắc nghiệm và kiểm thử LMS trước khi bàn giao.',
    columns: [
      { title: 'Cần đóng gói', count: 2, tone: 'danger' },
      { title: 'Đang kiểm thử LMS', count: 2, tone: 'warning' },
      { title: 'Sẵn sàng BG', count: 5, tone: 'success' },
    ],
    queue: [{ product: 'BIDV-KYC / P01', note: 'Kiểm tra cân bằng trắc nghiệm đã đạt, chờ tải lên gói bản chốt', owner: 'CD', status: 'packaging' }],
  },
  gsmf01: {
    eye: 'Phân hệ 4 · GSMF-01',
    title: 'Yêu cầu khởi chạy',
    subtitle: 'Khóa mô tả lối chơi, phạm vi học tập, phạm vi tài nguyên và điều kiện mở vòng mẫu.',
    columns: [
      { title: 'Thiếu mô tả', count: 2, tone: 'danger' },
      { title: 'Chờ chốt phạm vi', count: 3, tone: 'warning' },
      { title: 'Sẵn sàng bản mẫu', count: 2, tone: 'success' },
    ],
    queue: [
      { product: 'PLX-Game01 / Sprint A', note: 'Thiếu thang điểm và liên hệ người duyệt', owner: 'Khách hàng', status: 'changes_requested' },
      { product: 'VNPT-QuizRush / P01', note: 'Mô tả lối chơi đã đủ, PM chờ xác nhận', owner: 'PM', status: 'submitted' },
    ],
  },
  gsmf02: {
    eye: 'Phân hệ 4 · GSMF-02',
    title: 'Màn chạy thử trò chơi',
    subtitle: 'Theo dõi bản chơi thử, logic vòng lặp chính, cân bằng trò chơi và phản hồi vòng thử nghiệm.',
    columns: [
      { title: 'Cần dựng bản mẫu', count: 2, tone: 'danger' },
      { title: 'Đang chạy thử', count: 4, tone: 'warning' },
      { title: 'Chờ QC trò chơi', count: 1, tone: 'neutral' },
      { title: 'Đạt thử nội bộ', count: 3, tone: 'success' },
    ],
    queue: [
      { product: 'PLX-Game01 / Build 0.8', note: 'Vòng lặp chính ổn, cần chỉnh nhịp thưởng và luồng chơi lại', owner: 'Tổ trò chơi', status: 'in_progress' },
      { product: 'VNPT-QuizRush / Build 1.0', note: 'Thử nội bộ đạt, chờ QA kiểm tra nhanh', owner: 'PM', status: 'approved' },
    ],
  },
  gsmf03: {
    eye: 'Phân hệ 4 · GSMF-03',
    title: 'QC trò chơi',
    subtitle: 'Kiểm tra lỗi chặn, cân bằng, theo dõi điểm và điều kiện đạt trước khi phát hành.',
    columns: [
      { title: 'Hàng chờ QC', count: 2, tone: 'danger' },
      { title: 'Đang kiểm thử', count: 2, tone: 'warning' },
      { title: 'Đạt QA', count: 4, tone: 'success' },
    ],
    queue: [
      { product: 'PLX-Game01 / Build 0.8', note: '1 lỗi chặn ở trạng thái chơi lại và 2 lỗi chính ở đặt lại điểm', owner: 'QC', status: 'fail' },
    ],
  },
  gsmf04: {
    eye: 'Phân hệ 4 · GSMF-04',
    title: 'Trò chơi hoàn chỉnh',
    subtitle: 'Khóa bản phát hành, tài nguyên cuối, gói bàn giao và danh mục sẵn sàng bàn giao.',
    columns: [
      { title: 'Cần hoàn thiện', count: 1, tone: 'danger' },
      { title: 'Đang đóng gói', count: 2, tone: 'warning' },
      { title: 'Sẵn sàng bàn giao', count: 3, tone: 'success' },
    ],
    queue: [
      { product: 'VNPT-QuizRush / Release Candidate', note: 'Bản chốt đã đạt QC, chờ xuất gói và ghi chú bàn giao', owner: 'Tổ trò chơi', status: 'packaging' },
    ],
  },
};

export const VIDEO_STAGE_MAP: Record<string, keyof typeof STAGE_PAGES> = {
  vsmf01: 'smf01',
  vsmf02: 'smf02',
  vsmf03: 'smf03',
  vsmf04: 'smf04',
  vsmf05: 'smf05',
  vsmf06: 'smf06',
  vsmf07: 'smf07',
  vsmf08: 'smf08',
};

export const GAME_STAGE_MAP: Record<string, keyof typeof STAGE_PAGES> = {
  gsmf01: 'gsmf01',
  gsmf02: 'gsmf02',
  gsmf03: 'gsmf03',
  gsmf04: 'gsmf04',
};

export function getAllowedPages(role: RoleKey) {
  return ALLOWED_PAGES[role];
}

export function isAdminLikeRole(role: string | null | undefined) {
  return ['admin', 'content_manager', 'production_manager'].includes(normalizeAppRole(role));
}

export function canEditProductionPlan(role: string | null | undefined) {
  const normalized = normalizeAppRole(role);
  return normalized === 'admin' || normalized === 'pm' || normalized === 'production_manager';
}

export function canEditOrderManagement(role: string | null | undefined) {
  const normalized = normalizeAppRole(role);
  return normalized === 'admin' || normalized === 'pm' || normalized === 'content_manager';
}

export function isTrainingAdminRole(role: string | null | undefined) {
  return ['admin', 'training_ops_admin'].includes(normalizeAppRole(role));
}

export function isWorkflowStage(page: string) {
  return /^smf0[1-9]$|^vsmf0[1-8]$|^gsmf0[1-4]$/.test(page);
}

export function normalizeAppRole(role: string | null | undefined): RoleKey {
  const normalized = String(role || '').trim().toLowerCase();
  const asciiNormalized = normalized
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, '_');
  if (
    asciiNormalized === 'training_ops_admin' ||
    asciiNormalized === 'dao_tao_admin_gioi_han' ||
    asciiNormalized === 'admin_dao_tao_gioi_han'
  ) {
    return 'training_ops_admin';
  }
  if (
    asciiNormalized === 'manager_dao_tao' ||
    asciiNormalized === 'quan_ly_dao_tao' ||
    asciiNormalized === 'quan_tri_dao_tao' ||
    asciiNormalized === 'haile' ||
    asciiNormalized === 'hai_le' ||
    asciiNormalized === 'giam_doc' ||
    asciiNormalized === 'director' ||
    asciiNormalized === 'giam_doc_dao_tao' ||
    asciiNormalized === 'training_manager' ||
    asciiNormalized === 'training_admin' ||
    asciiNormalized === 'vtraining_manager' ||
    asciiNormalized === 'vtraining_admin' ||
    normalized === 'manager đào tạo' ||
    normalized === 'quản lý đào tạo'
  ) {
    return 'admin';
  }
  if (
    asciiNormalized === 'quan_ly_noi_dung' ||
    asciiNormalized === 'quan_ly_don_hang' ||
    asciiNormalized === 'content_manager' ||
    asciiNormalized === 'order_manager'
  ) {
    return 'content_manager';
  }
  if (asciiNormalized === 'quan_ly_san_xuat' || asciiNormalized === 'production_manager') return 'production_manager';
  if (normalized === 'cd' || normalized === 'vc' || normalized === 'designer') return 'specialist';
  if (asciiNormalized === 'hoc_gia') return 'hoc_gia';
  if (normalized === 'hoc_gia' || normalized === 'học giả') return 'hoc_gia';
  if (
    asciiNormalized === 'giang_vien' ||
    asciiNormalized === 'giao_vien' ||
    asciiNormalized === 'gv' ||
    asciiNormalized === 'lecturer' ||
    asciiNormalized === 'instructor' ||
    asciiNormalized === 'trainer' ||
    asciiNormalized === 'facilitator' ||
    normalized === 'giảng viên' ||
    normalized === 'giáo viên'
  ) {
    return 'giang_vien';
  }
  if (
    asciiNormalized === 'hoc_vien' ||
    asciiNormalized === 'hocvien' ||
    asciiNormalized === 'nguoi_hoc' ||
    asciiNormalized === 'hoc_sinh' ||
    asciiNormalized === 'sinh_vien' ||
    normalized === 'student' ||
    normalized === 'learner' ||
    normalized === 'trainee' ||
    normalized === 'member' ||
    normalized === 'hv'
  ) {
    return 'hoc_vien';
  }
  if (asciiNormalized === 'ctv' || asciiNormalized === 'cong_tac_vien' || normalized === 'collaborator') return 'ctv';
  if (
    asciiNormalized === 'quan_tri_coaching' ||
    asciiNormalized === 'coaching_admin' ||
    asciiNormalized === 'culture_admin' ||
    asciiNormalized === 'vcoaching_admin'
  ) {
    return 'coaching_admin';
  }
  if (asciiNormalized === 'coach' || asciiNormalized === 'mentor' || asciiNormalized === 'vcoach') return 'coach';
  if (asciiNormalized === 'coachee' || asciiNormalized === 'mentee' || asciiNormalized === 'nguoi_duoc_coach') return 'coachee';
  if (asciiNormalized === 'observer' || asciiNormalized === 'viewer' || asciiNormalized === 'quan_sat_vien') return 'observer';
  if (asciiNormalized === 'plx_playbook_viewer' || asciiNormalized === 'plx_ceo_playbook') return 'plx_playbook_viewer';
  if (asciiNormalized === 'training_ops_admin') return 'training_ops_admin';
  if (normalized === 'hoc_vien' || normalized === 'học viên') return 'hoc_vien';
  if (normalized === 'client_director') return 'client_director';
  if (
    normalized === 'vsuite_admin' ||
    normalized === 'vsuite_ops' ||
    normalized === 'vsuite_trainer' ||
    normalized === 'vsuite_teamlead' ||
    normalized === 'vsuite_ctv' ||
    normalized === 'vsuite_lms' ||
    normalized === 'vsuite_accountant' ||
    normalized === 'vsuite_requester' ||
    normalized === 'vsuite_manager' ||
    normalized === 'vsuite_director' ||
    normalized === 'vsuite_treasurer'
  ) {
    return normalized as RoleKey;
  }
  if (
    normalized === 'admin' ||
    normalized === 'content_manager' ||
    normalized === 'production_manager' ||
    normalized === 'pm' ||
    normalized === 'specialist' ||
    normalized === 'qc' ||
    normalized === 'hoc_vien' ||
    normalized === 'giang_vien' ||
    normalized === 'ctv' ||
    normalized === 'coaching_admin' ||
    normalized === 'coach' ||
    normalized === 'coachee' ||
    normalized === 'observer' ||
    normalized === 'plx_playbook_viewer' ||
    normalized === 'training_ops_admin' ||
    normalized === 'client'
  ) {
    return normalized as RoleKey;
  }
  return 'client';
}

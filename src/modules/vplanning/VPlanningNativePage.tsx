// @ts-nocheck
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, BarChart3, CalendarDays, Check, CheckSquare, ClipboardCheck, Clock3, Copy, Eye, LogOut, MessageCircle, Paperclip, ReceiptText, Send, ShieldAlert, Target, Trash2, Users, X } from 'lucide-react';
import {
  advanceVsuitePaymentRequest,
  createVsuitePaymentDocument,
  createVsuitePaymentRequest,
  deleteVsuitePaymentDocument,
  delegateVsuitePaymentRequest,
  fetchVsuitePaymentApprovalEvents,
  fetchVsuitePaymentDocuments,
  fetchVsuitePaymentRequests,
  fetchVsuitePeopleProfiles,
  remindVsuitePaymentOpinion,
  requestVsuitePaymentOpinion,
  respondVsuitePaymentOpinion,
  softDeleteVsuitePaymentRequest,
  updateVsuitePaymentRequest,
  uploadVworkDocumentFile,
} from '../vsuite/services/api';
import {
  isSuspiciousTaskReduction,
  normalizeDeletedTaskIds,
  recoverCachedTasks,
  reconcileRemoteTasks,
} from './stateSyncPolicy.js';
import { isVWorkCollaborationProposalParticipant } from './proposalVisibility.js';
import VWorkTrainingSchedule, { normalizeTrainingSchedules } from './VWorkTrainingSchedule';
import trainingScheduleSeed from './trainingScheduleSeed.json';
import './VPlanningNativePage.css';

const STATE_API = '/api/vplanning-state';
const ENABLE_TRAINING_OPERATIONS = import.meta.env.DEV || import.meta.env.VITE_ENABLE_VWORK_TRAINING_OPERATIONS === 'true';
const NOTICE_DISPATCH_API = '/api/notice-dispatch';
const AUTH_SNAPSHOT_STORAGE_KEY = 'vcontent.auth.session-snapshot';
const AUTH_PROFILE_SNAPSHOT_STORAGE_KEY = 'vcontent.auth.profile-snapshot';
const LOCAL_STATE_KEY = 'peopleone_vplanning_state';
const TRAINING_SCHEDULE_SEED = normalizeTrainingSchedules(trainingScheduleSeed);
function trainingSchedulesFromState(state) {
  if (state && Object.prototype.hasOwnProperty.call(state, 'trainingSchedules') && Array.isArray(state.trainingSchedules)) {
    return normalizeTrainingSchedules(state.trainingSchedules);
  }
  return TRAINING_SCHEDULE_SEED.map((item)=>({ ...item }));
}
function readJsonStorage(key, storage = localStorage) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJsonStorage(key, value, storage = localStorage) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* local persistence is best effort */
  }
}
function notifyVWork(message, tone = 'success') {
  if (typeof window === 'undefined' || !message) return;
  window.dispatchEvent(new CustomEvent('vwork-toast', { detail:{ id:Date.now(), message, tone } }));
}
function getVWorkErrorMessage(error) {
  if (!error) return 'Lỗi không xác định.';
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  const details = [
    error.message,
    error.details,
    error.hint,
    error.code,
  ].map((item)=>String(item || '').trim()).filter(Boolean);
  if (details.length) return details.join(' · ');
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== '{}' ? serialized : 'Lỗi không xác định.';
  } catch {
    return 'Lỗi không xác định.';
  }
}
function vworkActionToast(action, data = {}, eventNote = '', task = {}) {
  const title = task.title || 'Công việc';
  if (action === 'Nhận việc' || action === 'Tiếp nhận việc') return `Công việc "${title}" đã được tiếp nhận, chuyển sang Đang làm.`;
  if (action === 'Cập nhật checklist') return `Đã cập nhật checklist cho "${title}".`;
  if (action === 'Thêm checklist') return `Đã thêm checklist cho "${title}".`;
  if (action === 'Xoá checklist') return `Đã xoá checklist khỏi "${title}".`;
  if (action === 'Cập nhật trạng thái') return `Đã cập nhật trạng thái "${title}".`;
  if (action === 'Nhắc việc') return `Đã cập nhật nhắc việc cho "${title}".`;
  if (action === 'Lập kế hoạch') return `Đã lưu kế hoạch thực hiện cho "${title}".`;
  if (action === 'Trao đổi') return `Đã thêm trao đổi vào "${title}".`;
  if (action === 'Cập nhật minh chứng') return `Đã cập nhật minh chứng cho "${title}".`;
  if (action === 'Gửi báo cáo') return `Đã gửi báo cáo cho "${title}", chuyển sang chờ duyệt.`;
  if (action === 'Cập nhật checkpoint quy trình') return `Đã cập nhật checkpoint cho "${title}".`;
  if (action === 'Quản lý duyệt') return `Đã duyệt "${title}" và chuyển KSV.`;
  if (action === 'Yêu cầu bổ sung') return `Đã yêu cầu bổ sung cho "${title}".`;
  if (action === 'KSV xác nhận') return `Đã xác nhận hoàn thành "${title}".`;
  if (action === 'Xác nhận hoàn thành') return `Đã xác nhận hoàn thành "${title}". Công việc đã được chuyển xuống cuối danh sách.`;
  if (action === 'Sửa thông tin công việc') return `Đã lưu thông tin mới cho "${title}".`;
  return eventNote ? `Đã cập nhật "${title}": ${eventNote}` : `Đã cập nhật "${title}".`;
}
function containsVPlanningTextEncodingError(value) {
  const serialized = JSON.stringify(value || '');
  return /[\p{L}]\?{2,}[\p{L}]?|\?{3,}|\uFFFD|[\u00c3\u00c6\u00d0]/u.test(serialized)
    || serialized.includes('\u00c3\u00a1\u00c2');
}
function repairVWorkTaskEncoding(task) {
  if (!task || typeof task !== 'object') return task;
  const participantNames = Array.isArray(task.participantNames)
    ? task.participantNames.map((name)=>String(name || '').trim()).filter(Boolean)
    : [];
  const canRestoreParticipants = containsVPlanningTextEncodingError(task.participants)
    && participantNames.length > 0
    && !containsVPlanningTextEncodingError(participantNames);
  return canRestoreParticipants
    ? { ...task, participants:participantNames.join(', ') }
    : task;
}
function isUsableVPlanningState(state) {
  if (!Array.isArray(state?.tasks)) return false;
  if (!state.tasks.length) return true;
  // A damaged optional field must not make every valid task disappear. At least one
  // clean/recoverable task is enough to load the state; sanitizeVWorkState isolates the rest.
  return state.tasks.some((task)=>!containsVPlanningTextEncodingError(repairVWorkTaskEncoding(task)));
}
const LEGACY_MOCK_PROJECT_CODES = new Set([['WEEK','04T6'].join('-'), ['AI','PLX'].join('-')]);
const LEGACY_MOCK_TEXT_PATTERNS = [
  new RegExp(`${['WEEK','04T6'].join('-')}|${['AI','PLX'].join('-')}|${['RQ','01[789]'].join('-')}|${['Thieu 2 video','demo'].join(' ')}`, 'i'),
  /Công việc tuan 04T6/i,
  /Ra soat tai lieu va video cho buoi lam viec VNPT/i,
  /Goi bao cao nhanh GD/i,
];
function normalizeLegacyText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\u0111/g, 'd').replace(/\u0110/g, 'D');
}
function normalizeText(value) {
  return normalizeLegacyText(value).trim().toLowerCase();
}
function isLegacyMockVWorkTask(task) {
  const code = String(task?.projectCode || task?.sourceId || '').trim();
  if (LEGACY_MOCK_PROJECT_CODES.has(code)) return true;
  const text = [
    task?.title,
    task?.group,
    task?.customer,
    task?.ownerLead,
    task?.ownerName,
    task?.method,
    task?.sourceId,
  ].map((value)=>String(value || '')).join(' ');
  const normalizedText = normalizeLegacyText(text);
  return LEGACY_MOCK_TEXT_PATTERNS.some((pattern)=>pattern.test(text) || pattern.test(normalizedText));
}
function sanitizeVWorkState(state) {
  const tasks = dedupeVWorkAdminRequestTasks(Array.isArray(state?.tasks)
    ? state.tasks
      .map(repairVWorkTaskEncoding)
      .filter((task)=>!containsVPlanningTextEncodingError(task))
      .filter((task)=>!isLegacyMockVWorkTask(task))
      .map(normalizeVWorkReviewers)
    : []);
  const taskIds = new Set(tasks.map((task)=>String(task.id)));
  const notifications = Array.isArray(state?.notifications)
    ? state.notifications.filter((notice)=>{
      const text = [notice.title, notice.body, notice.entityId, notice.metadata?.taskId].map((value)=>String(value || '')).join(' ');
      const taskId = String(notice.metadata?.taskId || notice.entityId || '');
      const normalizedText = normalizeLegacyText(text);
      return !LEGACY_MOCK_TEXT_PATTERNS.some((pattern)=>pattern.test(text) || pattern.test(normalizedText)) && (!taskId || taskIds.has(taskId));
    })
    : [];
  return { ...(state || {}), tasks, notifications };
}
function stateFingerprint(state) {
  const tasks = Array.isArray(state?.tasks) ? state.tasks.map((task)=>[task.id, task.updatedAt || '', task.stage || '', task.status || '', task.reminders?.length || 0, task.activity?.length || 0]) : [];
  const notifications = Array.isArray(state?.notifications) ? state.notifications.map((notice)=>[notice.id, notice.read, notice.emailStatus || '']) : [];
  const forms = Array.isArray(state?.vworkForms) ? state.vworkForms.map((form)=>[form.id, form.fileName || form.name || '', form.updatedAt || '']) : [];
  const trainingSchedules = Array.isArray(state?.trainingSchedules) ? state.trainingSchedules.map((item)=>[item.id, item.status || '', item.updatedAt || '', item.archivedAt || '']) : [];
  const deletedTaskIds = normalizeDeletedTaskIds(state?.deletedTaskIds);
  return JSON.stringify({ tasks, notifications, settings:Array.isArray(state?.vworkSettings) ? state.vworkSettings.length : 0, forms, trainingSchedules, deletedTaskIds });
}
function shouldKeepLocalTasksWhenRemoteShrinks(localTasks, remoteTasks, deletedTaskIds = []) {
  return isSuspiciousTaskReduction(localTasks, remoteTasks, deletedTaskIds);
}
function stampChangedTasks(previousTasks, nextTasks, actor) {
  const previousById = new Map(previousTasks.map((task)=>[String(task.id), task]));
  const now = new Date().toISOString();
  return nextTasks.map((task)=> {
    const previous = previousById.get(String(task.id));
    if (previous && JSON.stringify({ ...previous, updatedAt:undefined, updatedBy:undefined }) === JSON.stringify({ ...task, updatedAt:undefined, updatedBy:undefined })) return task;
    return { ...task, updatedAt:task.updatedAt && previous?.updatedAt !== task.updatedAt ? task.updatedAt : now, updatedBy:actor?.email || actor?.name || 'vwork-user' };
  });
}
function mergeReadState(existing = [], incoming = []) {
  const readById = new Map(existing.map((notice)=>[notice.id, Boolean(notice.read)]));
  return mergeNotifications(existing, incoming).map((notice)=>readById.has(notice.id) ? { ...notice, read:readById.get(notice.id) } : notice);
}
function readAuthSessionSnapshot() {
  return readJsonStorage(AUTH_SNAPSHOT_STORAGE_KEY) || {};
}
function vPlanningApiHeaders(includeJson = false) {
  const token = String(readAuthSessionSnapshot()?.access_token || '').trim();
  return {
    Accept:'application/json',
    ...(includeJson ? { 'Content-Type':'application/json' } : {}),
    ...(token ? { Authorization:`Bearer ${token}` } : {}),
  };
}

const ROLES = {
  vplanning_director: 'Giám đốc',
  vplanning_manager: 'Trưởng bộ phận',
  vplanning_member: 'Nhân viên',
  vplanning_collaborator: 'Cộng tác viên',
  vplanning_lecturer: 'Giảng viên',
  vplanning_controller: 'Kiểm soát viên',
  vplanning_admin: 'Quản trị',
};
const PEOPLE_BY_ROLE = {
  vplanning_director: 'Hải Lê',
  vplanning_manager: 'Hạnh Vũ',
  vplanning_member: 'Hằng Trần',
  vplanning_collaborator: 'Nguyệt Đỗ',
  vplanning_lecturer: 'Huyên Vũ',
  vplanning_controller: 'Huyên Vũ',
  vplanning_admin: 'Nam Phạm',
};
const DIRECTOR_EMAILS = new Set(['hailt@peopleone.com.vn']);
const ROLE_SCOPE_LABEL = {
  all: 'Toàn hệ thống',
  team: 'Team/phòng ban phụ trách',
  self: 'Việc của tôi',
  review: 'Hàng đợi kiểm soát',
};
const DEFAULT_ROLE = 'vplanning_member';
const ROLE_PRIORITY = ['vplanning_admin','vplanning_director','vplanning_manager','vplanning_controller','vplanning_lecturer','vplanning_member','vplanning_collaborator'];
const VPLANNING_ROLE_MATRIX = {
  vplanning_admin: {
    scope: 'all',
    actions: ['view_all','view_enterprise','create_plan','import_excel','auto_assign','manage_tasks','manage_forms','update_catalog','update_own_task','approve_team','control_review','lock_monthly','view_workload','view_monthly','view_health'],
  },
  vplanning_director: {
    scope: 'all',
    actions: ['view_all','view_enterprise','import_excel','auto_assign','manage_tasks','manage_forms','approve_team','view_workload','view_monthly','view_health'],
  },
  vplanning_manager: {
    scope: 'all',
    departments: ['Sales','Nội dung','Kế toán','Hậu cần','QC'],
    actions: ['view_all','view_team','create_plan','import_excel','auto_assign','manage_tasks','manage_forms','update_own_task','approve_team','view_workload','view_monthly','view_health'],
  },
  vplanning_member: {
    scope: 'all',
    actions: ['view_all','view_self','import_excel','auto_assign','manage_forms','update_own_task','view_workload','view_monthly','view_health'],
  },
  vplanning_collaborator: {
    scope: 'all',
    actions: ['view_all','view_self','import_excel','auto_assign','manage_forms','update_own_task','view_workload','view_monthly','view_health'],
  },
  vplanning_lecturer: {
    scope: 'all',
    actions: ['view_all','view_self','import_excel','auto_assign','manage_forms','update_own_task','confirm_readiness','view_workload','view_monthly','view_health'],
  },
  vplanning_controller: {
    scope: 'all',
    actions: ['view_all','view_self','import_excel','auto_assign','manage_forms','update_own_task','view_workload','view_monthly','control_review','lock_monthly','view_health'],
  },
};
const can = (role, action) => Boolean(VPLANNING_ROLE_MATRIX[role]?.actions.includes(action));
const currentRole = (role) => VPLANNING_ROLE_MATRIX[role] || VPLANNING_ROLE_MATRIX.vplanning_member;
const VWORK_FORM_ROLE_SCOPE = Object.keys(VPLANNING_ROLE_MATRIX);
const MASTER = {
  owners: [
    { id:'PPO-001', name:'Ba Nguyễn', role:'', department:'Kế toán' },
    { id:'PPO-002', name:'Nguyệt Đỗ', role:'', department:'Hậu cần' },
    { id:'PPO-003', name:'Hạnh Vũ', role:'', department:'Sales' },
    { id:'PPO-004', name:'Hằng Trần', role:'', department:'Sales' },
    { id:'PPO-005', name:'Huyên Vũ', role:'', department:'Nội dung' },
    { id:'PPO-006', name:'Huyên Vũ', role:'', department:'Nội dung' },
    { id:'PPO-007', name:'Ngọc Phạm', role:'', department:'Nội dung' },
    { id:'PPO-008', name:'Huyên Vũ', role:'', department:'Nội dung' },
    { id:'PPO-009', name:'Nam Phạm', role:'', department:'Quản trị' },
    { id:'PPO-010', name:'Thảo Nguyễn Phương', role:'', department:'Giám đốc' },
  ],
  jobs: [
    ['JOB-SALE','Quản trị bán hàng'], ['JOB-BID','Quản trị đấu thầu'], ['JOB-CONTRACT','Quản trị hợp đồng'],
    ['JOB-CUSTOMER','Quản trị khách hàng'], ['JOB-PM','Quản trị dự án'], ['JOB-FACULTY','Quản trị giảng viên'],
    ['JOB-CONTENT','Quản trị nội dung'], ['JOB-ELEARNING','Quản trị học liệu số'], ['JOB-LMS','Quản trị LMS'],
    ['JOB-OPS','Quản trị vận hành'], ['JOB-LOGISTICS','Quản trị hậu cần'], ['JOB-QA','Kiểm soát chất lượng'],
    ['JOB-ACCEPTANCE','Quản trị nghiệm thu'], ['JOB-FINANCE','Quản trị tài chính'], ['JOB-PAYMENT','Quản trị thanh toán'],
  ],
  objectives: [
    ['OBJ-001','Sẵn sàng triển khai lớp','Đảm bảo đủ điều kiện triển khai'],
    ['OBJ-002','Chất lượng giảng viên','Đảm bảo readiness'],
    ['OBJ-003','Chất lượng LMS','Đảm bảo LMS ổn định'],
    ['OBJ-004','Chất lượng học liệu','Đảm bảo tài liệu final'],
    ['OBJ-005','Nghiệm thu đúng hạn','Hoàn tất hồ sơ'],
  ],
  results: [
    ['RES-001','Hợp đồng hoàn thành'], ['RES-002','Giảng viên sẵn sàng'], ['RES-003','LMS sẵn sàng'],
    ['RES-004','Học liệu final'], ['RES-005','Báo cáo hoàn thành'], ['RES-006','Nghiệm thu hoàn thành'],
  ],
  users: [
    { name:'Hải Lê', email:'hailt@peopleone.com.vn', aliases:['haile','hailt'], title:'Giám đốc, toàn quyền', roles:['vplanning_admin','vplanning_director'], departments:['Giám đốc','Sales','Nội dung','Kế toán','Hậu cần'], ownerIds:[] },
    { name:'Nam Phạm', email:'phamhoainamk54@gmail.com', aliases:['phamhoainamk54','phamhoaianmk54'], title:'Admin tổng', roles:['vplanning_admin'], departments:['Quản trị','Sales','Nội dung','Kế toán','Hậu cần','QC'], ownerIds:['PPO-009'] },
    { name:'Hạnh Vũ', email:'hanhvu@peopleone.com.vn', title:'Sales, quản lý dự án', roles:['vplanning_manager'], departments:['Sales'], ownerIds:['PPO-003','PPO-004'] },
    { name:'Huyên Vũ', email:'huyenvu@peopleone.com.vn', title:'Nội dung, quản lý dự án, QC', roles:['vplanning_manager','vplanning_controller'], departments:['Nội dung'], ownerIds:['PPO-005','PPO-006','PPO-007','PPO-008'] },
    { name:'Ngọc Phạm', email:'minhngocpham2002@gmail.com', title:'VNB, Trưởng bộ phận', roles:['vplanning_manager'], departments:['Nội dung'], ownerIds:['PPO-007'] },
    { name:'Thảo Nguyễn Phương', email:'thaonguyenphuong2248@gmail.com', aliases:['thao','thaonguyenphuong2248'], title:'Nhân viên', roles:['vplanning_member'], departments:['Giám đốc'], ownerIds:['PPO-010'] },
    { name:'Ba Nguyễn', email:'banguyen@peopleone.com.vn', title:'Kế toán, Trưởng bộ phận', roles:['vplanning_manager','vplanning_member'], departments:['Kế toán'], ownerIds:['PPO-001'] },
    { name:'Nguyệt Đỗ', email:'nguyetdothi@peopleone.com.vn', title:'Kế toán, hậu cần, Trưởng bộ phận', roles:['vplanning_manager','vplanning_member','vplanning_collaborator'], departments:['Kế toán','Hậu cần'], ownerIds:['PPO-002'] },
    { name:'Hằng Trần', email:'hangtran@peopleone.com.vn', title:'Sales, Trưởng bộ phận', roles:['vplanning_manager','vplanning_member'], departments:['Sales'], ownerIds:['PPO-004'] },
  ],
  orgUnits: [
    { code:'sales', name:'Sales', people:['Hạnh Vũ','Hằng Trần'] },
    { code:'accounting', name:'Kế toán', people:['Ba Nguyễn','Nguyệt Đỗ'] },
    { code:'content', name:'Nội dung', people:['Huyên Vũ','Ngọc Phạm'] },
    { code:'director', name:'Giám đốc', people:['Hải Lê'] },
    { code:'logistics', name:'Hậu cần', people:['Nguyệt Đỗ'] },
    { code:'quality', name:'QC', people:['Huyên Vũ','Ngọc Phạm'] },
  ],
};
const RESULT_OUTCOME_BLUEPRINTS = {
  'RES-001': {
    title:'Hợp đồng hoàn thành',
    criteria:['Phạm vi và phụ lục được chốt', 'Điều khoản thanh toán rõ', 'Hồ sơ lưu đúng nguồn'],
    milestones:['Rà soát đề xuất', 'Chốt điều khoản', 'Ký hoặc xác nhận hợp đồng', 'Lưu minh chứng'],
    evidence:'Link hợp đồng, phụ lục, email xác nhận',
  },
  'RES-002': {
    title:'Giảng viên sẵn sàng',
    criteria:['Giảng viên nắm mục tiêu lớp', 'Có giáo án hoặc tài liệu hướng dẫn', 'Đã trao đổi/chạy thử nếu cần'],
    milestones:['Chốt giảng viên', 'Gửi thông tin lớp', 'Chạy thử nếu cần', 'Xác nhận lịch triển khai'],
    evidence:'Biên bản briefing, giáo án, lịch giảng viên',
  },
  'RES-003': {
    title:'Sẵn sàng phục vụ 1000 học viên',
    criteria:['Phần mềm/LMS sẵn sàng', 'Test tải lần 1 đạt', 'Test tải lần 2 đạt', 'Điều chỉnh hệ thống xong', 'Thông tin học viên sẵn sàng'],
    milestones:['Cấu hình lớp và phân quyền', 'Import danh sách học viên', 'Test tải lần 1', 'Điều chỉnh hệ thống', 'Test tải lần 2', 'Thông tin học viên sẵn sàng', 'Runbook hỗ trợ sự cố'],
    evidence:'Ảnh test, log kiểm thử, danh sách học viên, checklist vận hành',
  },
  'RES-004': {
    title:'Học liệu final',
    criteria:['Nội dung đúng phạm vi', 'Đã QC', 'Đã bàn giao bản final'],
    milestones:['Chốt đầu bài', 'Soạn học liệu', 'QC nội bộ', 'Điều chỉnh sau QC', 'Bàn giao bản final'],
    evidence:'Link slide, tài liệu, checklist QC',
  },
  'RES-005': {
    title:'Báo cáo hoàn thành',
    criteria:['Có tiến độ, kết quả, rủi ro', 'Có minh chứng', 'Có đề xuất tiếp theo nếu cần'],
    milestones:['Tổng hợp tiến độ', 'Gắn minh chứng', 'Nêu vướng mắc', 'Gửi báo cáo quản lý'],
    evidence:'Báo cáo, link minh chứng, ghi chú xử lý',
  },
  'RES-006': {
    title:'Nghiệm thu hoàn thành',
    criteria:['Đủ hồ sơ nghiệm thu', 'Quản lý duyệt', 'KSV xác nhận', 'Có biên bản hoặc xác nhận khách hàng'],
    milestones:['Thu hồ sơ', 'Đối chiếu checklist nghiệm thu', 'Quản lý duyệt', 'KSV xác nhận', 'Lưu biên bản'],
    evidence:'Biên bản nghiệm thu, báo cáo sau khóa, phụ lục minh chứng',
  },
};
const COMPANY_OKRS_2406 = [
  { code:'O1', title:'Doanh thu & dòng tiền', desc:'Hợp đồng, báo giá, nghiệm thu và thu tiền đúng mốc.' },
  { code:'O2', title:'Trải nghiệm học tập & niềm tin khách hàng', desc:'Lớp chạy ổn định, học viên được hỗ trợ, phản hồi được xử lý.' },
  { code:'O3', title:'Quy trình khoa học & deliverable chuẩn', desc:'Có WBS, checklist, bằng chứng và chuẩn đầu ra rõ.' },
  { code:'O4', title:'Hiệu quả nguồn lực & chi phí', desc:'Cân tải nhân sự, kiểm soát chi phí, tránh làm lại.' },
  { code:'O5', title:'Quan hệ khách hàng & upsale', desc:'Theo dõi cơ hội, nhu cầu, đề xuất tiếp theo.' },
  { code:'O6', title:'Chất lượng & tỷ lệ thắng thầu', desc:'Hồ sơ thầu đầy đủ, đúng hạn, kiểm soát rủi ro.' },
];
const PROCESS_GROUPS_BASE_2406 = [
  {
    id:'N1',
    name:'Dự án đào tạo',
    okrs:['O1','O2','O3','O4','O5'],
    triggers:['JOB-PM','JOB-FACULTY','JOB-CONTENT','JOB-LMS','JOB-OPS','JOB-ACCEPTANCE','JOB-FINANCE','JOB-PAYMENT'],
    steps:[
      { code:'N1.1', title:'Pre-sales & cơ hội', output:'Qualified opportunity/brief', raci:{ A:'Sales/PM', R:'Sales', C:'Giám đốc, Nội dung', I:'Kế toán' }, checkpoints:['Nhu cầu/pain point rõ','Phạm vi sơ bộ','RACI dự án'], hardGate:'Có brief cơ hội trước khi chào bán' },
      { code:'N1.2', title:'Chào bán & thương mại', output:'Đề xuất, báo giá, hợp đồng', raci:{ A:'Sales/PM', R:'Sales', C:'Kế toán, Nội dung', I:'Giám đốc' }, checkpoints:['Đề xuất giải pháp','Cost sheet','Báo giá chính thức','Điều khoản thanh toán'], hardGate:'Hard gate: có cost sheet trước báo giá' },
      { code:'N1.3', title:'Chuẩn bị triển khai', output:'Lớp sẵn sàng triển khai', raci:{ A:'PM', R:'Nội dung/LMS/Hậu cần', C:'Giảng viên, QC', I:'Sales' }, checkpoints:['Lesson plan v1 trước T-10','Hợp đồng CTV trước T-7','QC trước triển khai','Danh sách học viên sẵn sàng'], hardGate:'Hard gate: QC và readiness trước ngày học' },
      { code:'N1.4', title:'Triển khai lớp', output:'Lớp chạy đúng chuẩn và có phản hồi', raci:{ A:'PM', R:'Vận hành/CTV/Giảng viên', C:'Nội dung, LMS', I:'Khách hàng' }, checkpoints:['Check-in/điểm danh','Gamification/thảo luận','Test/thu hoạch','Feedback và minh chứng'], hardGate:'Hard gate: đủ minh chứng từng buổi' },
      { code:'N1.5', title:'Kết thúc & tài chính', output:'Nghiệm thu, hóa đơn, thu tiền, lesson learned', raci:{ A:'PM', R:'Kế toán/Vận hành', C:'Sales, Giám đốc', I:'Khách hàng' }, checkpoints:['Hồ sơ nghiệm thu','Biên bản ký','Hóa đơn','Theo dõi công nợ','Lesson learned'], hardGate:'Hard gate: minh chứng đủ trước nghiệm thu' },
    ],
  },
  {
    id:'N2',
    name:'Dự án tư vấn / coaching',
    okrs:['O1','O3','O5'],
    triggers:['JOB-PM','JOB-CUSTOMER','JOB-CONTENT','JOB-FACULTY','JOB-ACCEPTANCE'],
    steps:[
      { code:'N2.1', title:'Chốt scope & dữ liệu', output:'Scope, deliverable, dữ liệu khảo sát', raci:{ A:'PM', R:'Tư vấn/Nội dung', C:'Khách hàng', I:'Sales' }, checkpoints:['Scope rõ','Nguồn dữ liệu','Lịch phỏng vấn/khảo sát'], hardGate:'Hard gate: scope và dữ liệu đầu vào được xác nhận' },
      { code:'N2.2', title:'Chào bán & chi phí', output:'Proposal, cost sheet, hợp đồng tư vấn', raci:{ A:'Sales', R:'Sales/Kế toán', C:'PM, Giám đốc', I:'Nội dung' }, checkpoints:['Proposal','Cost sheet','Báo giá','Hợp đồng'], hardGate:'Hard gate: chi phí chuyên gia được duyệt' },
      { code:'N2.3', title:'Chuẩn bị chuyên gia', output:'Expert plan, hợp đồng chuyên gia, timeline', raci:{ A:'PM', R:'Nội dung', C:'Chuyên gia', I:'Khách hàng' }, checkpoints:['Chọn chuyên gia','Hợp đồng chuyên gia','Timeline triển khai'], hardGate:'Hard gate: chuyên gia cam kết trước kickoff' },
      { code:'N2.4', title:'Triển khai draft-feedback-final', output:'Bản tư vấn final đã phản hồi', raci:{ A:'PM', R:'Chuyên gia/Nội dung', C:'Khách hàng, QC', I:'Sales' }, checkpoints:['Draft 1','Feedback khách hàng','Điều chỉnh','Final deliverable','QC final'], hardGate:'Hard gate: không final khi chưa có feedback/QC' },
      { code:'N2.5', title:'Nghiệm thu & bài học', output:'Nghiệm thu, thanh toán, lesson learned', raci:{ A:'PM', R:'Kế toán/Vận hành', C:'Sales', I:'Giám đốc' }, checkpoints:['Biên bản nghiệm thu','Hóa đơn','Thu tiền','Lesson learned'], hardGate:'Hard gate: nghiệm thu trước xuất hóa đơn cuối' },
    ],
  },
  {
    id:'N3',
    name:'E-learning / video học liệu',
    okrs:['O2','O3','O4'],
    triggers:['JOB-ELEARNING','JOB-LMS','JOB-CONTENT','JOB-QA'],
    steps:[
      { code:'N3.1', title:'Brief & yêu cầu kỹ thuật', output:'Learning brief và yêu cầu nền tảng', raci:{ A:'PM', R:'Nội dung/LMS', C:'Khách hàng', I:'Giám đốc' }, checkpoints:['Mục tiêu học tập','Chuẩn kỹ thuật','Đối tượng học viên'], hardGate:'Hard gate: brief được duyệt trước thiết kế' },
      { code:'N3.2', title:'Thiết kế học liệu', output:'Storyboard, kịch bản, checklist QC', raci:{ A:'Nội dung', R:'Thiết kế học liệu', C:'QC, Giảng viên', I:'PM' }, checkpoints:['Storyboard','Kịch bản','QC nội dung'], hardGate:'Hard gate: storyboard trước sản xuất' },
      { code:'N3.3', title:'Chuẩn bị sản xuất', output:'Timeline, nhân sự, hợp đồng, tài nguyên', raci:{ A:'PM', R:'Sản xuất/Hậu cần', C:'Kế toán', I:'Nội dung' }, checkpoints:['Lịch quay/record','Nhân sự','Hợp đồng CTV','Tài nguyên'], hardGate:'Hard gate: đủ người và lịch trước sản xuất' },
      { code:'N3.4', title:'Sản xuất, revision, final master', output:'Final master đạt kỹ thuật và nội dung', raci:{ A:'PM', R:'Sản xuất/LMS', C:'Nội dung, QC', I:'Khách hàng' }, checkpoints:['Draft','Review','Revision','Final master','Technical check'], hardGate:'Hard gate: technical check trước bàn giao' },
      { code:'N3.5', title:'Bàn giao & nghiệm thu kỹ thuật', output:'Acceptance nội dung/kỹ thuật, hóa đơn', raci:{ A:'PM', R:'LMS/Kế toán', C:'Khách hàng', I:'Giám đốc' }, checkpoints:['Bàn giao file','Nghiệm thu kỹ thuật','Nghiệm thu nội dung','Hóa đơn'], hardGate:'Hard gate: đủ file nguồn và checklist nghiệm thu' },
    ],
  },
  {
    id:'N4',
    name:'Đấu thầu',
    okrs:['O1','O6'],
    triggers:['JOB-BID','JOB-CONTRACT','JOB-FINANCE'],
    steps:[
      { code:'N4.1', title:'Chuẩn bị hồ sơ mời thầu', output:'Checklist pháp lý/kỹ thuật/tài chính', raci:{ A:'Sales', R:'Đấu thầu', C:'Kế toán, Nội dung', I:'Giám đốc' }, checkpoints:['Scope thầu','Timeline nộp','Checklist pháp lý','Checklist kỹ thuật'], hardGate:'Hard gate: checklist thầu trước phân công hồ sơ' },
      { code:'N4.2', title:'Hoàn thiện hồ sơ, giá, bảo lãnh', output:'Bộ hồ sơ thầu sẵn sàng nộp', raci:{ A:'Sales', R:'Đấu thầu/Kế toán', C:'Giám đốc, Nội dung', I:'PM' }, checkpoints:['Biểu mẫu','Giá thầu','Bảo lãnh','Phí thầu','Rà soát lần cuối'], hardGate:'Hard gate: giá và bảo lãnh được duyệt trước nộp' },
      { code:'N4.3', title:'Nộp, làm rõ, chuyển dự án', output:'Kết quả thầu và workbook dự án nếu trúng', raci:{ A:'Sales', R:'Đấu thầu', C:'PM, Kế toán', I:'Giám đốc' }, checkpoints:['Nộp hồ sơ','Làm rõ','Theo dõi kết quả','Convert sang dự án'], hardGate:'Hard gate: trúng thầu phải tạo kế hoạch dự án' },
    ],
  },
  {
    id:'N5',
    name:'Điều phối tuần',
    okrs:['O3','O4'],
    triggers:['JOB-PM','JOB-OPS','JOB-CONTENT'],
    steps:[
      { code:'N5.1', title:'Lập kế hoạch tuần', output:'Bảng việc tuần theo owner, deadline, risk, next step', raci:{ A:'Giám đốc/PM', R:'PM các mảng', C:'Sales, Nội dung, Kế toán', I:'Toàn team' }, checkpoints:['Pipeline/status','4 ưu tiên tuần','RACI/WBS','Deadline và risk'], hardGate:'Hard gate: việc tuần phải có owner và next step' },
      { code:'N5.2', title:'Cảnh báo & escalation', output:'Danh sách alert và kết quả tuần', raci:{ A:'Giám đốc', R:'PM', C:'Owner liên quan', I:'Team' }, checkpoints:['Thiếu owner','Thiếu bước WBS','Chờ quá 7 ngày','Block báo giá chưa có cost sheet','Escalation đã xử lý'], hardGate:'Hard gate: alert đỏ phải có người xử lý trong tuần' },
    ],
  },
];
const PROCESS_STEP_DETAILS_2406 = {
  'N1.1': {
    title:'Khởi tạo cơ hội',
    description:'Mở vòng đời bán hàng: tiếp nhận brief, xác định khách hàng và đầu mối, làm rõ mục tiêu, đối tượng, quy mô, thời gian và hình thức triển khai.',
    output:'Hồ sơ cơ hội đã phân loại kèm recap sau buổi làm việc',
    raci:{ A:'Sale lead', R:'Sale lead', C:'Huyên', I:'Giám đốc' },
    checkpoints:['Brief khách hàng','Đầu mối khách hàng','Mục tiêu/đối tượng/quy mô','Thời gian và hình thức','Phân loại dự án'],
    checkingPoint:'Phân loại dự án: trọng điểm, phải chốt, theo dõi hoặc tạo cơ hội để ưu tiên nguồn lực.',
    hardGate:'Cơ hội phải có brief và phân loại trước khi chuyển sang chào bán.',
    riskBlocked:'Tránh bán sai nhu cầu, thiếu đầu mối hoặc phân tán nguồn lực.',
    servesOkrs:['O1','O5'],
    operationMapping:'Tạo opportunity/project seed, gắn khách hàng, sale lead, phân loại ưu tiên và recap làm việc.'
  },
  'N1.2': {
    title:'Chào bán & thương mại',
    description:'Biến cơ hội thành hợp đồng: proposal, đề cương/outline, tổng hợp khối lượng làm dự toán, cost sheet, báo giá tham khảo rồi chính thức, thương thảo hợp đồng.',
    output:'Báo giá chính thức và hợp đồng',
    raci:{ A:'Đầu mối sale', R:'Đầu mối sale', C:'Huyên, Ms Ba', I:'Giám đốc' },
    checkpoints:['Proposal','Đề cương/outline','Dự toán khối lượng','Cost sheet','Báo giá chính thức','Thương thảo hợp đồng'],
    checkingPoint:'Phải có cost sheet trước khi gửi báo giá chính thức.',
    hardGate:'Khóa gửi báo giá nếu chưa có cost sheet được xác nhận.',
    riskBlocked:'Tránh báo giá thiếu chi phí, phải làm lại hợp đồng hoặc ảnh hưởng doanh thu.',
    servesOkrs:['O1'],
    operationMapping:'Cảnh báo việc sắp gửi báo giá nhưng thiếu cost sheet; yêu cầu Ms Ba/Kế toán xác nhận trước.'
  },
  'N1.3': {
    title:'Chuẩn bị triển khai',
    description:'Bảo đảm đủ điều kiện trước khi mở lớp: tuyển/lựa giảng viên, ký hợp đồng CTV, soạn giáo án, đánh giá timing và QC giáo án, chuẩn bị học liệu, chốt lịch, logistics và danh sách học viên.',
    output:'Lớp sẵn sàng triển khai',
    raci:{ A:'Giám đốc', R:'Giám đốc, Ms Hạnh, Ms Nguyệt', C:'Huyên', I:'Sales' },
    checkpoints:['Giáo án bản 1 trước T-10','Ký hợp đồng CTV trước T-7','QC giáo án trước triển khai','Học liệu sẵn sàng','Logistics/danh sách học viên'],
    checkingPoint:'Giáo án bản 1 trước T-10, hợp đồng CTV trước T-7 và QC trước triển khai.',
    hardGate:'Không mở lớp nếu thiếu QC giáo án, giảng viên hoặc danh sách học viên.',
    riskBlocked:'Chặn rủi ro lớp chạy gấp, thiếu giảng viên, thiếu học liệu hoặc chất lượng không đạt.',
    servesOkrs:['O3','O4'],
    operationMapping:'Sinh WBS chuẩn bị lớp, nhắc hạn T-10/T-7 và đưa các mục chưa ready vào hàng đợi chỉ đạo.'
  },
  'N1.4': {
    title:'Triển khai lớp',
    description:'Vận hành thực địa: tổ chức lớp, theo dõi chất lượng theo checklist, thu phản hồi học viên và ghi nhận điều chỉnh.',
    output:'Lớp đạt chuẩn, có dữ liệu phản hồi và minh chứng nghiệm thu từng buổi',
    raci:{ A:'PM/Vận hành', R:'Đầu mối vận hành', C:'Giám đốc, Huyên', I:'Khách hàng' },
    checkpoints:['Check-in/điểm danh','Gamification/thảo luận','Kiểm tra/bài thu hoạch','Feedback học viên','Minh chứng nghiệm thu từng buổi'],
    checkingPoint:'Kiểm soát check-in, điểm danh, gamification, thảo luận, kiểm tra và bài thu hoạch theo thời gian thực.',
    hardGate:'Mỗi buổi phải có minh chứng trước khi tính hoàn thành vận hành.',
    riskBlocked:'Tránh mất bằng chứng nghiệm thu, phản hồi xấu không được xử lý hoặc lớp lệch chuẩn.',
    servesOkrs:['O2','O4'],
    operationMapping:'Owner cập nhật kết quả từng buổi, đính kèm minh chứng và chuyển vấn đề chất lượng sang hàng đợi duyệt.'
  },
  'N1.5': {
    title:'Kết thúc & tài chính',
    description:'Đóng dự án: nghiệm thu lớp, xuất hóa đơn, theo dõi công nợ, thu tiền, tổng kết và lesson learned.',
    output:'Biên bản nghiệm thu, hóa đơn, tiền thu và bài học dự án',
    raci:{ A:'PM/Vận hành', R:'QL vận hành, Ms Ba', C:'Giám đốc, Khách hàng', I:'Sales' },
    checkpoints:['Ảnh lớp/minh chứng','Điểm danh ký','Kết quả kiểm tra','Biên bản nghiệm thu','Hóa đơn','Theo dõi công nợ','Lesson learned'],
    checkingPoint:'Hồ sơ nghiệm thu đủ minh chứng trước khi trình ký; thu tiền đúng mốc.',
    hardGate:'Không trình nghiệm thu nếu thiếu minh chứng bắt buộc.',
    riskBlocked:'Tránh chậm nghiệm thu, chậm hóa đơn, thất lạc công nợ hoặc lặp lỗi dự án sau.',
    servesOkrs:['O1','O2'],
    operationMapping:'Tạo checklist đóng dự án, gắn công nợ theo mã dự án và yêu cầu lesson learned trước khi đóng.'
  },
  'N2.1': {
    title:'Khởi tạo & xác định deliverables',
    description:'Khung hóa bài toán tư vấn/coaching: tiếp nhận bài toán, xác định deliverables, thu thập dữ liệu đầu vào và xác định phạm vi khảo sát.',
    output:'Bản mô tả phạm vi và danh mục deliverable làm cơ sở proposal',
    raci:{ A:'Đầu mối sale theo khách', R:'Đầu mối sale theo khách', C:'Huyên, Giám đốc', I:'Ms Ba' },
    checkpoints:['Bài toán khách hàng','Deliverables','Dữ liệu đầu vào','Phạm vi khảo sát','Cơ sở proposal'],
    checkingPoint:'Chốt phạm vi và sản phẩm bàn giao trước khi báo giá để tránh trượt scope.',
    hardGate:'Không báo giá tư vấn khi chưa chốt phạm vi và deliverables.',
    riskBlocked:'Chặn trượt scope, định giá sai và sản phẩm tư vấn không rõ chuẩn đầu ra.',
    servesOkrs:['O3','O1'],
    operationMapping:'Task detail phải có deliverable list và scope trước khi được chuyển sang thương mại.'
  },
  'N2.2': {
    title:'Thương mại tư vấn',
    description:'Chốt thương mại: proposal kèm phương pháp, workload, cost sheet, báo giá, phương án đấu thầu nếu có, thương thảo hợp đồng và điều khoản thanh toán.',
    output:'Hợp đồng tư vấn với điều khoản thanh toán theo mốc',
    raci:{ A:'Đầu mối sale', R:'Đầu mối sale', C:'Ms Ba, Hằng, Giám đốc', I:'Huyên' },
    checkpoints:['Proposal kèm phương pháp','Workload','Cost sheet','Báo giá','Phương án thầu nếu có','Điều khoản thanh toán'],
    checkingPoint:'Đủ cost sheet và phương pháp trước khi phát hành báo giá.',
    hardGate:'Khóa báo giá nếu thiếu cost sheet hoặc phương pháp triển khai.',
    riskBlocked:'Tránh ký hợp đồng sai giá, thiếu phương pháp hoặc hồ sơ thầu không chuẩn từ đầu.',
    servesOkrs:['O1','O6'],
    operationMapping:'Nếu có cấu phần thầu, tự gắn template N4; nếu không, tiếp tục luồng hợp đồng tư vấn.'
  },
  'N2.3': {
    title:'Nhân sự chuyên gia',
    description:'Bảo đảm nguồn lực chuyên môn: chốt chuyên gia chính và phối hợp, ký hợp đồng chuyên gia/CTV.',
    output:'Đội ngũ chuyên gia đã ký hợp đồng, sẵn sàng kickoff',
    raci:{ A:'Ms Hạnh', R:'Ms Hạnh, Ms Nguyệt', C:'Giám đốc', I:'PM/Sales' },
    checkpoints:['Shortlist tối thiểu 2 chuyên gia','Chọn chuyên gia chính','Chọn chuyên gia phối hợp','Ký hợp đồng chuyên gia/CTV','Cam kết lịch trước kickoff'],
    checkingPoint:'Shortlist tối thiểu 2 người và ký hợp đồng trước kickoff.',
    hardGate:'Không kickoff tư vấn khi thiếu chuyên gia hoặc chưa ràng buộc pháp lý.',
    riskBlocked:'Tránh thiếu người, đổi chuyên gia sát ngày hoặc không kiểm soát chi phí chuyên gia.',
    servesOkrs:['O3','O4'],
    operationMapping:'Hiển thị rủi ro nhân sự chuyên gia trong workload/faculty và nhắc hợp đồng trước kickoff.'
  },
  'N2.4': {
    title:'Triển khai tư vấn',
    description:'Tạo giá trị cốt lõi: kickoff, thu thập dữ liệu, phỏng vấn, workshop/khảo sát, bản draft, phản hồi khách và bản final.',
    output:'Deliverable tư vấn đạt kỳ vọng khách hàng',
    raci:{ A:'Giám đốc/Chuyên gia', R:'Giám đốc/Chuyên gia', C:'Huyên, Khách hàng', I:'Đầu mối sale' },
    checkpoints:['Kickoff','Thu thập dữ liệu','Phỏng vấn/workshop/khảo sát','Draft','Feedback khách','Final deliverable','QC final'],
    checkingPoint:'Mỗi vòng draft - phản hồi - final là một vòng kiểm soát chất lượng có nghiệm thu từng phần.',
    hardGate:'Không final khi chưa có feedback khách và QC.',
    riskBlocked:'Tránh tư vấn lệch kỳ vọng, thiếu bằng chứng làm việc hoặc mất cơ hội upsale.',
    servesOkrs:['O3','O5'],
    operationMapping:'Task kết quả cần thể hiện vòng draft/feedback/final và trạng thái bằng chứng đi kèm.'
  },
  'N2.5': {
    title:'Nghiệm thu tư vấn',
    description:'Đóng dự án tư vấn: nghiệm thu từng mốc hoặc nghiệm thu cuối, xuất hóa đơn, thu công nợ và tổng kết.',
    output:'Nghiệm thu ký, hóa đơn, tiền thu và lesson learned',
    raci:{ A:'Đầu mối sale + Giám đốc', R:'Đầu mối sale, Ms Ba', C:'Khách hàng', I:'Team dự án' },
    checkpoints:['Biên bản nghiệm thu từng mốc','Deliverable đã duyệt','Hóa đơn theo mốc','Theo dõi công nợ','Lesson learned'],
    checkingPoint:'Đủ biên bản nghiệm thu từng mốc gắn deliverable đã duyệt trước khi xuất hóa đơn tương ứng.',
    hardGate:'Không xuất hóa đơn cuối nếu chưa có nghiệm thu/deliverable được duyệt.',
    riskBlocked:'Tránh thất thoát doanh thu, chậm công nợ hoặc đóng dự án không tạo cơ hội tiếp theo.',
    servesOkrs:['O1','O5'],
    operationMapping:'Theo dõi nghiệm thu/công nợ theo mã dự án và mở next opportunity sau lesson learned.'
  },
  'N3.1': {
    title:'Xác định đầu bài',
    description:'Chốt yêu cầu học liệu số: mục tiêu học tập, đối tượng, số module, chuẩn đầu ra, định dạng và yêu cầu kỹ thuật.',
    output:'Đầu bài rõ mục tiêu, chuẩn đầu ra và yêu cầu kỹ thuật',
    raci:{ A:'Giám đốc', R:'Giám đốc, Huyên', C:'Khách hàng/LMS', I:'Ms Nguyệt' },
    checkpoints:['Mục tiêu học tập','Đối tượng học viên','Số module','Chuẩn đầu ra','Định dạng học liệu','Yêu cầu kỹ thuật','Biên bản họp chốt đầu bài'],
    checkingPoint:'Brief đủ sâu; ELN hay tắc vì thiếu brief nên cần họp chốt đầu bài.',
    hardGate:'Không thiết kế học liệu nếu brief chưa đủ mục tiêu, chuẩn đầu ra và yêu cầu kỹ thuật.',
    riskBlocked:'Chặn rủi ro làm lại do đầu bài mơ hồ.',
    servesOkrs:['O3'],
    operationMapping:'Mở checklist đầu bài ELN; thiếu brief sẽ đưa vào hàng đợi cần giám đốc/Huyên duyệt.'
  },
  'N3.2': {
    title:'Thiết kế học liệu số',
    description:'Learning design: đề cương, kịch bản/storyboard, giáo án ELN, QC learning flow, timing và trải nghiệm.',
    output:'Bộ thiết kế đã QC, sẵn sàng sản xuất',
    raci:{ A:'Giám đốc', R:'Giám đốc', C:'Huyên', I:'Ms Nguyệt' },
    checkpoints:['Đề cương','Kịch bản/storyboard','Giáo án ELN','Learning flow','Timing','QC trải nghiệm'],
    checkingPoint:'Storyboard, learning flow rõ và QC trải nghiệm trước khi quay dựng.',
    hardGate:'Storyboard và learning flow phải được QC trước sản xuất.',
    riskBlocked:'Chốt chặn chất lượng trước khi tốn chi phí quay dựng.',
    servesOkrs:['O3'],
    operationMapping:'Yêu cầu đủ storyboard/QC để chuyển trạng thái sang sẵn sàng sản xuất.'
  },
  'N3.3': {
    title:'Chuẩn bị sản xuất',
    description:'Thiết lập điều kiện sản xuất: chốt người xuất hiện, ký hợp đồng CTV và đơn vị sản xuất, lập timeline quay dựng và checklist thu âm/quay/hậu kỳ.',
    output:'Kế hoạch sản xuất đủ nguồn lực và lịch',
    raci:{ A:'Ms Nguyệt', R:'Ms Nguyệt', C:'Giám đốc, Huyên', I:'PM/Sales' },
    checkpoints:['Chốt người xuất hiện','Ký hợp đồng CTV','Ký đơn vị sản xuất','Timeline quay dựng','Checklist thu âm/quay/hậu kỳ'],
    checkingPoint:'Chốt người, ký hợp đồng và timeline trước khi vào quay.',
    hardGate:'Không vào sản xuất nếu thiếu người, hợp đồng hoặc timeline.',
    riskBlocked:'Chặn thiếu nguồn lực, trễ lịch hoặc đội chi phí sản xuất.',
    servesOkrs:['O3','O4'],
    operationMapping:'Tạo task hợp đồng/sản xuất/hậu kỳ và cảnh báo nếu thiếu điều kiện trước ngày quay.'
  },
  'N3.4': {
    title:'Sản xuất',
    description:'Tạo bản học liệu: quay/thu âm, dựng nháp, góp ý vòng 1, chỉnh sửa vòng 2, final master và kiểm tra kỹ thuật.',
    output:'File master đạt chuẩn hình, tiếng và đồ họa',
    raci:{ A:'Ms Nguyệt', R:'Ms Nguyệt', C:'Giám đốc, Huyên', I:'Đầu mối sale' },
    checkpoints:['Quay/thu âm','Dựng nháp','Góp ý vòng 1','Chỉnh sửa vòng 2','Final master','Kiểm tra kỹ thuật'],
    checkingPoint:'Chuỗi góp ý - chỉnh sửa - final kiểm soát chất lượng kỹ thuật và nội dung.',
    hardGate:'Final master phải có technical check trước bàn giao.',
    riskBlocked:'Giới hạn vòng sửa để giữ tiến độ và chi phí, bám KR <= 1 vòng sửa/chuyên đề.',
    servesOkrs:['O3'],
    operationMapping:'Theo dõi vòng sửa, technical check và cảnh báo khi vượt vòng sửa hoặc thiếu master.'
  },
  'N3.5': {
    title:'Bàn giao & nghiệm thu ELN',
    description:'Đóng học liệu số: nghiệm thu nội dung, nghiệm thu kỹ thuật, bàn giao file, xuất hóa đơn và thu tiền.',
    output:'Học liệu bàn giao đạt nghiệm thu, hóa đơn và tiền thu',
    raci:{ A:'Giám đốc/Huyên', R:'Ms Nguyệt, Ms Ba', C:'Khách hàng', I:'PM/Sales' },
    checkpoints:['Nghiệm thu nội dung','Nghiệm thu kỹ thuật','Bàn giao file','Hóa đơn','Thu tiền'],
    checkingPoint:'Nghiệm thu kép nội dung và kỹ thuật trước khi bàn giao và xuất hóa đơn.',
    hardGate:'Không bàn giao/xuất hóa đơn nếu thiếu nghiệm thu kép.',
    riskBlocked:'Chặn rủi ro sản phẩm cuối không đạt chuẩn hoặc thu tiền chậm.',
    servesOkrs:['O1','O3'],
    operationMapping:'Task nghiệm thu kép phải đủ bằng chứng trước khi được đóng và chuyển công nợ.'
  },
  'N4.1': {
    title:'Chuẩn bị thầu',
    description:'Mở gói thầu: xác định phạm vi hồ sơ và timeline thầu, lập checklist hồ sơ pháp lý, kỹ thuật và tài chính.',
    output:'Danh mục hồ sơ bắt buộc đã khóa và timeline ngược từ hạn nộp',
    raci:{ A:'Hằng', R:'Hằng', C:'Hạnh, Ms Ba', I:'Giám đốc' },
    checkpoints:['Phạm vi hồ sơ','Timeline thầu','Checklist pháp lý','Checklist kỹ thuật','Checklist tài chính','Timeline ngược từ hạn nộp'],
    checkingPoint:'Rà yêu cầu hồ sơ và lịch thầu ngay khi phát sinh.',
    hardGate:'Checklist thầu phải được khóa trước khi phân công hồ sơ.',
    riskBlocked:'Chặn sót hồ sơ hoặc trễ deadline thầu.',
    servesOkrs:['O6'],
    operationMapping:'Tạo checklist hồ sơ và timeline ngược; cảnh báo thiếu hồ sơ bắt buộc.'
  },
  'N4.2': {
    title:'Hoàn thiện hồ sơ thầu',
    description:'Lập hồ sơ: biểu mẫu kỹ thuật, hồ sơ thầu chính, in/scan/đóng bộ; hồ sơ giá, báo giá, công chứng; bảo lãnh ngân hàng, giấy tờ thanh toán, phí dự thầu/trúng thầu.',
    output:'Bộ hồ sơ hoàn chỉnh, đóng bộ đúng quy cách',
    raci:{ A:'Hằng', R:'Hằng', C:'Hạnh, Ms Ba', I:'Giám đốc' },
    checkpoints:['Biểu mẫu kỹ thuật','Hồ sơ thầu chính','In/scan/đóng bộ','Hồ sơ giá/báo giá','Công chứng','Bảo lãnh ngân hàng','Giấy tờ thanh toán/phí thầu'],
    checkingPoint:'Đủ 3 khối pháp lý, kỹ thuật, giá và bảo lãnh theo checklist bắt buộc.',
    hardGate:'Không nộp thầu nếu thiếu pháp lý, kỹ thuật, giá hoặc bảo lãnh.',
    riskBlocked:'Chặn hồ sơ bị loại và mở đường doanh thu.',
    servesOkrs:['O6','O1'],
    operationMapping:'Tách checklist 3 khối, gắn owner từng khối và nhắc Ms Ba phần tài chính/phí.'
  },
  'N4.3': {
    title:'Nộp & theo dõi thầu',
    description:'Khép gói thầu: nộp đúng hạn, theo dõi làm rõ hồ sơ và xử lý phát sinh sau nộp.',
    output:'Xác nhận đã nộp, nhật ký làm rõ và kết quả thầu',
    raci:{ A:'Hằng', R:'Hằng', C:'Hạnh, Ms Ba', I:'Đầu mối sale' },
    checkpoints:['Nộp trước hạn','Xác nhận đã nộp','Nhật ký làm rõ','Theo dõi kết quả','Chuyển dự án nếu trúng'],
    checkingPoint:'Nộp trước hạn và sẵn sàng phản hồi yêu cầu làm rõ.',
    hardGate:'Trúng thầu phải chuyển thành dự án với workbook và phân công tự động.',
    riskBlocked:'Giữ đúng hạn, tăng tỷ lệ trúng và không đứt mạch sau khi trúng thầu.',
    servesOkrs:['O6'],
    operationMapping:'Nếu kết quả là trúng thầu, tạo kế hoạch dự án, workbook và auto assign theo template.'
  },
  'N5.1': {
    title:'Lập kế hoạch tuần',
    description:'Nhịp điều hành: mỗi tuần cập nhật pipeline và trạng thái, đặt 4 ưu tiên gồm cơ hội chốt trong 7 ngày, proposal/báo giá/hồ sơ thầu sắp đến hạn, dự án sắp triển khai cần giáo án/GV/học liệu, công nợ/hóa đơn/nghiệm thu.',
    output:'Bảng việc tuần theo owner, phối hợp, deadline, trạng thái, rủi ro và next step',
    raci:{ A:'Giám đốc/PM', R:'PM các mảng', C:'Sales, Nội dung, Kế toán', I:'Toàn team' },
    checkpoints:['Pipeline/status','4 ưu tiên tuần','RACI','WBS','Deadline','Risk','Next step','Việc theo từng người'],
    checkingPoint:'Đủ RACI, WBS và pipeline trước khi chốt; thiếu dữ liệu phải đặt câu hỏi bù.',
    hardGate:'Việc tuần phải có owner, deadline, rủi ro và next step.',
    riskBlocked:'Chặn họp tuần thiếu dữ liệu, việc không owner hoặc không có bước tiếp theo.',
    servesOkrs:['O1','O2','O3','O4','O5','O6'],
    operationMapping:'Nguồn để workbook V-Work nạp vào, đồng thời sinh workload theo từng người.'
  },
  'N5.2': {
    title:'Cảnh báo & escalation tuần',
    description:'Kiểm soát rủi ro: đánh dấu ngay dự án thiếu owner hoặc thiếu bước theo WBS; escalate dự án chờ phản hồi trên 7 ngày; khóa dự án chưa có cost sheet nhưng sắp gửi báo giá.',
    output:'Danh sách cảnh báo + hành động và 5 kết quả cuối tuần',
    raci:{ A:'Giám đốc', R:'PM', C:'Owner liên quan', I:'Team' },
    checkpoints:['Thiếu owner','Thiếu bước WBS','Chờ phản hồi trên 7 ngày','Chưa có cost sheet nhưng sắp gửi báo giá','Số proposal','Số báo giá','Cơ hội tiến bước','Giáo án/đề cương','Rủi ro đã xử lý'],
    checkingPoint:'Alert đỏ phải có người xử lý trong tuần và cập nhật hành động cụ thể.',
    hardGate:'Khóa dự án/báo giá khi thiếu điều kiện bắt buộc; escalation phải có owner xử lý.',
    riskBlocked:'Kiểm soát tiến độ toàn hệ thống và giúp giám đốc biết việc nào cần chỉ đạo ngay.',
    servesOkrs:['O1','O2','O3','O4','O5','O6'],
    operationMapping:'Ánh xạ vào cảnh báo trễ hạn, việc cần giám sát, nhắc việc và ra yêu cầu ở module master/detail.'
  }
};
const PROCESS_GROUPS_2406 = PROCESS_GROUPS_BASE_2406.map((group)=>({
  ...group,
  steps:group.steps.map((step)=>({
    ...step,
    ...(PROCESS_STEP_DETAILS_2406[step.code] || {}),
    specCode:step.code
  }))
}));
function allProcessSteps2406() {
  return PROCESS_GROUPS_2406.flatMap((group)=>group.steps.map((step)=>({ ...step, groupId:group.id, groupName:group.name, okrs:group.okrs })));
}
function processForTask2406(task) {
  const text = `${task.projectCode || ''} ${task.group || ''} ${task.title || ''} ${task.jobCode || ''} ${task.workCode || ''}`.toLowerCase();
  if (text.includes('tuần') || text.includes('week') || String(task.projectCode || '').startsWith('WEEK')) return PROCESS_GROUPS_2406.find((group)=>group.id === 'N5').steps[text.includes('alert') || text.includes('chờ') ? 1 : 0];
  if (['JOB-BID','JOB-CONTRACT'].includes(task.jobCode) || text.includes('thầu')) return PROCESS_GROUPS_2406.find((group)=>group.id === 'N4').steps[text.includes('giá') || text.includes('bảo lãnh') ? 1 : 0];
  if (['JOB-ELEARNING','JOB-LMS'].includes(task.jobCode) || text.includes('lms') || text.includes('elearning') || text.includes('video')) return PROCESS_GROUPS_2406.find((group)=>group.id === 'N3').steps[text.includes('test') || text.includes('final') || text.includes('master') ? 3 : text.includes('bàn giao') || text.includes('nghiệm thu') ? 4 : 0];
  if (text.includes('coaching') || text.includes('tư vấn') || text.includes('chuyên gia')) return PROCESS_GROUPS_2406.find((group)=>group.id === 'N2').steps[text.includes('draft') || text.includes('feedback') || text.includes('final') ? 3 : text.includes('nghiệm thu') ? 4 : 0];
  const training = PROCESS_GROUPS_2406.find((group)=>group.id === 'N1');
  if (['JOB-SALE','JOB-CUSTOMER'].includes(task.jobCode)) return training.steps[0];
  if (['JOB-FINANCE','JOB-PAYMENT','JOB-CONTRACT'].includes(task.jobCode)) return training.steps[4];
  if (['JOB-FACULTY','JOB-CONTENT','JOB-LMS','JOB-LOGISTICS','JOB-QA'].includes(task.jobCode)) return training.steps[2];
  if (['JOB-OPS'].includes(task.jobCode)) return training.steps[3];
  return training.steps[2];
}
const PROCESS_CHECKPOINT_STATUSES = [
  { id:'not_started', label:'Chưa làm', done:false, tone:'b-gray' },
  { id:'in_progress', label:'Đang làm', done:false, tone:'b-blue' },
  { id:'pending_review', label:'Chờ duyệt', done:false, tone:'b-amber' },
  { id:'done', label:'Đạt', done:true, tone:'b-green' },
  { id:'blocked', label:'Không đạt', done:false, tone:'b-red' },
];
function processCheckpointStatusMeta(status) {
  return PROCESS_CHECKPOINT_STATUSES.find((item)=>item.id === status) || PROCESS_CHECKPOINT_STATUSES[0];
}
function checkpointStatusRows2406(task) {
  const step = processForTask2406(task);
  const readiness = outcomeReadiness(task);
  const taskText = `${task.title || ''} ${task.method || ''} ${task.evidenceLink || ''} ${task.deliverableLink || ''} ${(task.reports || []).map((report)=>report.note).join(' ')}`.toLowerCase();
  const savedRows = Array.isArray(task.processCheckpoints) ? task.processCheckpoints : [];
  return (step.checkpoints || []).map((label, index)=>{
    const saved = savedRows.find((item)=>item.stepCode === step.code && item.label === label) || savedRows.find((item)=>item.label === label);
    const words = String(label).toLowerCase().split(/[\s/,-]+/).filter((word)=>word.length > 3);
    const matched = words.some((word)=>taskText.includes(word));
    const threshold = Math.round(((index + 1) / step.checkpoints.length) * 100);
    const inferredDone = matched || readiness.percent >= threshold || isTaskDone(task);
    const status = saved?.status || (inferredDone ? 'done' : 'not_started');
    const meta = processCheckpointStatusMeta(status);
    const done = Boolean(meta.done);
    return {
      label,
      stepCode:step.code,
      status,
      statusLabel:meta.label,
      statusTone:meta.tone,
      evidence:saved?.evidence || '',
      note:saved?.note || '',
      updatedAt:saved?.updatedAt || '',
      updatedBy:saved?.updatedBy || '',
      done,
      blocked:!done && (status === 'blocked' || index === 0 && readiness.percent < 35),
    };
  });
}
function checkpointReadiness2406(task) {
  const step = processForTask2406(task);
  const group = PROCESS_GROUPS_2406.find((item)=>step.code.startsWith(item.id)) || PROCESS_GROUPS_2406[0];
  const readiness = outcomeReadiness(task);
  const checkpoints = checkpointStatusRows2406(task);
  const completed = checkpoints.filter((item)=>item.done).length;
  return { step, checkpoints, percent:checkpoints.length ? Math.round(completed / checkpoints.length * 100) : readiness.percent, hardGate:step.hardGate, okrs:group.okrs || [] };
}
function processSummary2406(tasks) {
  return PROCESS_GROUPS_2406.map((group)=>{
    const groupTasks = tasks.filter((task)=>processForTask2406(task).code.startsWith(group.id));
    const progress = groupTasks.length ? Math.round(groupTasks.reduce((sum, task)=>sum + checkpointReadiness2406(task).percent, 0) / groupTasks.length) : 0;
    const blocked = groupTasks.filter((task)=>checkpointReadiness2406(task).checkpoints.some((item)=>item.blocked)).length;
    const review = groupTasks.filter((task)=>managementSignal(task).level === 'warning').length;
    return { ...group, tasks:groupTasks, progress, blocked, review };
  });
}
function normalizeRoleKey(role) {
  return String(role || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
function readVPlanningAuthProfile() {
  return readJsonStorage(AUTH_PROFILE_SNAPSHOT_STORAGE_KEY) || {};
}
function normalizeRoleList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[,\s|;]+/);
  return [];
}
function findVPlanningUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const localPart = normalized.split('@')[0];
  return MASTER.users.find((user)=> {
    const userEmail = String(user.email || '').toLowerCase();
    const aliases = (user.aliases || []).map((item)=>String(item || '').toLowerCase());
    return userEmail === normalized || userEmail.split('@')[0] === localPart || aliases.includes(normalized) || aliases.includes(localPart);
  }) || null;
}
function mapGenericRole(role) {
  const roleMap = {
    admin: 'vplanning_admin',
    quan_tri: 'vplanning_admin',
    director: 'vplanning_director',
    giam_doc: 'vplanning_director',
    manager: 'vplanning_manager',
    truong_bo_phan: 'vplanning_manager',
    controller: 'vplanning_controller',
    kiem_soat_vien: 'vplanning_controller',
    lecturer: 'vplanning_lecturer',
    giang_vien: 'vplanning_lecturer',
    collaborator: 'vplanning_collaborator',
    cong_tac_vien: 'vplanning_collaborator',
    staff: 'vplanning_member',
    employee: 'vplanning_member',
    nhan_vien: 'vplanning_member',
  };
  const trimmed = String(role || '').trim();
  if (VPLANNING_ROLE_MATRIX[trimmed]) return trimmed;
  const normalized = normalizeRoleKey(trimmed);
  return VPLANNING_ROLE_MATRIX[normalized] ? normalized : roleMap[normalized] || '';
}
function uniqueRoles(roles) {
  return [...new Set(roles.map(mapGenericRole).filter(Boolean))].sort((left, right)=>ROLE_PRIORITY.indexOf(left) - ROLE_PRIORITY.indexOf(right));
}
function resolveVPlanningRoles(profile = {}) {
  const email = String(profile.email || '').trim().toLowerCase();
  const matchedUser = findVPlanningUserByEmail(email);
  const metadata = profile.app_metadata || profile.appMetadata || {};
  const moduleRoles = profile.moduleRoles || profile.module_roles || metadata.moduleRoles || metadata.module_roles || {};
  const roles = uniqueRoles([
    ...normalizeRoleList(profile.vplanningRoles || profile.vplanning_roles),
    ...normalizeRoleList(moduleRoles.vplanning),
    ...normalizeRoleList(metadata.vplanningRoles || metadata.vplanning_roles),
    ...(matchedUser?.roles || []),
    profile.vplanningRole || profile.vplanning_role || '',
    profile.role || profile.userRole || '',
  ]);
  return roles.length ? roles : [DEFAULT_ROLE];
}
function resolveVPlanningRole(profile = {}) {
  return resolveVPlanningRoles(profile)[0] || DEFAULT_ROLE;
}
function resolveVPlanningUser(profile = {}, activeRole = DEFAULT_ROLE) {
  const email = String(profile.email || '').trim().toLowerCase();
  const matchedUser = findVPlanningUserByEmail(email);
  const roles = resolveVPlanningRoles(profile);
  const departments = normalizeRoleList(profile.vplanningDepartments || profile.vplanning_departments || profile.departments || profile.department)
    .concat(matchedUser?.departments || []);
  const ownerIds = normalizeRoleList(profile.vplanningOwnerIds || profile.vplanning_owner_ids || profile.ownerIds || profile.owner_ids)
    .concat(matchedUser?.ownerIds || []);
  return {
    id: profile.id || profile.userId || profile.auth_user_id || profile.email || activeRole,
    email: profile.email || matchedUser?.email || '',
    name: matchedUser?.name || profile.fullName || profile.full_name || profile.name || profile.email || 'Người dùng chưa gắn hồ sơ',
    title: matchedUser?.title || profile.title || ROLES[activeRole] || '',
    roles,
    activeRole,
    departments: [...new Set(departments.filter(Boolean))],
    ownerIds: [...new Set(ownerIds.filter(Boolean))],
  };
}
function resolveVPlanningRoleLegacy(profile = {}) {
  const explicitRole = String(profile.vplanningRole || profile.vplanning_role || '').trim();
  if (VPLANNING_ROLE_MATRIX[explicitRole]) return explicitRole;
  const normalizedExplicit = normalizeRoleKey(explicitRole);
  if (VPLANNING_ROLE_MATRIX[normalizedExplicit]) return normalizedExplicit;

  const email = String(profile.email || '').trim().toLowerCase();
  const matchedUser = findVPlanningUserByEmail(email);
  if (matchedUser?.roles?.length) return matchedUser.roles[0];

  const rawRole = String(profile.role || profile.userRole || '').trim();
  if (VPLANNING_ROLE_MATRIX[rawRole]) return rawRole;
  const roleMap = {
    admin: 'vplanning_admin',
    quan_tri: 'vplanning_admin',
    director: 'vplanning_director',
    giam_doc: 'vplanning_director',
    manager: 'vplanning_manager',
    truong_bo_phan: 'vplanning_manager',
    controller: 'vplanning_controller',
    kiem_soat_vien: 'vplanning_controller',
    lecturer: 'vplanning_lecturer',
    giang_vien: 'vplanning_lecturer',
    collaborator: 'vplanning_collaborator',
    cong_tac_vien: 'vplanning_collaborator',
    staff: 'vplanning_member',
    employee: 'vplanning_member',
    nhan_vien: 'vplanning_member',
  };
  return roleMap[normalizeRoleKey(rawRole)] || DEFAULT_ROLE;
}
function resolveVPlanningPerson(role, profile = {}) {
  return resolveVPlanningUser(profile, role).name;
}
function buildVPlanningState(tasks, currentUser, notifications = [], vworkSettings = [], vworkForms = [], trainingSchedules = [], deletedTaskIds = []) {
  const cleanState = sanitizeVWorkState({ tasks, notifications });
  return {
    version: 1,
    module: 'vplanning',
    tasks: cleanState.tasks,
    notifications: cleanState.notifications,
    vworkSettings,
    vworkForms: mergeVWorkForms(vworkForms),
    trainingSchedules: normalizeTrainingSchedules(trainingSchedules),
    deletedTaskIds: normalizeDeletedTaskIds(deletedTaskIds),
    processTemplates: PROCESS_GROUPS_2406,
    escalationRules: [
      { id:'owner_ack', level:'owner', trigger:'stage_assigned', slaHours:24, action:'Nhắc owner nhận việc và lập kế hoạch.' },
      { id:'manager_review', level:'manager', trigger:'reported_or_missing_evidence', slaHours:48, action:'Quản lý duyệt, yêu cầu bổ sung minh chứng hoặc chuyển KSV.' },
      { id:'director_intervention', level:'director', trigger:'overdue_or_hard_gate_block', slaHours:72, action:'Giám đốc chỉ đạo xử lý vướng mắc, đổi owner hoặc ưu tiên nguồn lực.' },
    ],
    governanceEvents: cleanState.tasks.flatMap((task)=>(task.activity || []).map((event, index)=>({ id:`${task.id}-${index}`, taskId:task.id, projectCode:task.projectCode, ...event }))).slice(-200),
    monthlyScorecards: workloadOwners().map((owner)=>({ ownerId:owner.id, ownerName:owner.name, month:'2026-07', ...scoreComposite(owner, cleanState.tasks) })),
    users: MASTER.users,
    currentUser: currentUser ? {
      id: currentUser.id,
      email: currentUser.email,
      name: currentUser.name,
      activeRole: currentUser.activeRole,
      roles: currentUser.roles,
    } : null,
    savedAt: new Date().toISOString(),
  };
}
async function fetchVPlanningState() {
  const response = await fetch(`${STATE_API}?source=normalized`, { cache:'no-store', headers: { ...vPlanningApiHeaders(), 'Cache-Control':'no-cache' } });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Không tải được dữ liệu V-Work (${response.status}).`);
  }
  return { state:payload.state || null, updatedAt:payload.updatedAt || null };
}
async function persistVPlanningState(state, actorId, expectedUpdatedAt = null, deletedTaskIds = []) {
  const response = await fetch(STATE_API, {
    method: 'PUT',
    headers: vPlanningApiHeaders(true),
    body: JSON.stringify({
      state,
      actorId,
      expectedUpdatedAt,
      deletedTaskIds:normalizeDeletedTaskIds(deletedTaskIds),
      action: 'save_tasks',
      summary: 'Saved V-Work tasks from app',
    }),
  });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Không lưu được dữ liệu V-Work (${response.status}).`);
  }
  return payload;
}
const PRIORITIES = ['Low','Medium','High','Critical'];
const RISKS = ['Low','Medium','High','Critical'];
const VWORK_ASSIGNMENT_MODES = [
  { id:'quick', title:'Tạo nhanh', desc:'Việc phát sinh, nhập gọn thông tin chính', action:'create_plan' },
  { id:'deep', title:'Tạo chuyên sâu', desc:'Theo loại việc, checklist và người duyệt', action:'create_plan' },
  { id:'import', title:'Import file', desc:'Nhập danh sách việc từ Excel hoặc Word', action:'import_excel' },
];
const VWORK_REQUEST_SEEDS = [];
const VWORK_ADMIN_REQUEST_FORM_TEMPLATES = [
  { id:'advance', label:'Đề nghị tạm ứng', fileName:'de nghi tam ung - People One.pdf' },
  { id:'payment', label:'Đề nghị thanh toán', fileName:'de nghi thanh toan - People One.pdf' },
  { id:'advance_payment', label:'Đề nghị thanh toán tạm ứng', fileName:'de nghi thanh toan tam ung- People One.pdf' },
  { id:'cash_payment', label:'Phiếu chi', fileName:'phieu chi- People One.pdf' },
  { id:'loan_proposal', label:'Đề xuất vay tiền', fileName:'de xuat vay tien - People One.pdf' },
];
const VWORK_ADMIN_REQUEST_STATUSES = {
  submitted:{ label:'Chờ kế toán', tone:'b-amber' },
  accountant_review:{ label:'Kế toán đã duyệt', tone:'b-blue' },
  manager_approved:{ label:'Chờ Giám đốc duyệt', tone:'b-purple' },
  director_approved:{ label:'Giám đốc đã duyệt', tone:'b-green' },
  paid:{ label:'Đã thanh toán', tone:'b-green' },
  returned:{ label:'Cần bổ sung', tone:'b-amber' },
  rejected:{ label:'Từ chối', tone:'b-red' },
};
const VWORK_ADMIN_REQUEST_TYPES = [
  { id:'purchase', label:'Mua sắm / hành chính', formTemplate:'payment' },
  { id:'business_trip', label:'Đi công tác', formTemplate:'advance' },
  { id:'work_plan', label:'Kế hoạch công việc', formTemplate:'payment' },
  { id:'contract_draft', label:'Dự thảo hợp đồng', formTemplate:'payment' },
  { id:'quote_budget', label:'Báo giá / lập dự toán', formTemplate:'payment' },
  { id:'bid_comparison', label:'Bảng chào giá', formTemplate:'payment' },
  { id:'work_policy', label:'Chủ trương công việc', formTemplate:'payment' },
  { id:'payment', label:'Đề nghị thanh toán', formTemplate:'payment' },
  { id:'advance', label:'Tạm ứng', formTemplate:'advance' },
  { id:'advance_payment', label:'Thanh toán tạm ứng', formTemplate:'advance_payment' },
  { id:'equipment', label:'Trang bị thiết bị', formTemplate:'payment' },
  { id:'repair', label:'Sửa chữa cơ sở vật chất / tài sản', formTemplate:'payment' },
  { id:'cash_payment', label:'Phiếu chi', formTemplate:'cash_payment' },
  { id:'loan_proposal', label:'Đề xuất vay tiền', formTemplate:'loan_proposal', accountingOnly:true },
  { id:'other', label:'Đề nghị khác', formTemplate:'payment' },
];
const VWORK_ADMIN_REQUEST_DYNAMIC_FIELDS = {
  business_trip:{ label:'Nơi đến / thời gian công tác', placeholder:'VD: Hà Nội · 12–14/07/2026' },
  work_plan:{ label:'Phạm vi / kết quả kế hoạch', placeholder:'Mục tiêu, đầu việc và kết quả cần phê duyệt' },
  contract_draft:{ label:'Đối tác / bên ký hợp đồng', placeholder:'Tên pháp nhân, giá trị và thời hạn hợp đồng' },
  quote_budget:{ label:'Phạm vi báo giá / dự toán', placeholder:'Hạng mục, số lượng, đơn giá và căn cứ lập giá' },
  bid_comparison:{ label:'Các nhà cung cấp so sánh', placeholder:'Nhà cung cấp, tổng giá và lựa chọn đề xuất' },
  work_policy:{ label:'Chủ trương cần phê duyệt', placeholder:'Phạm vi, ngân sách và tác động dự kiến' },
  advance_payment:{ label:'Phiếu tạm ứng cần quyết toán', placeholder:'Mã phiếu tạm ứng, thực chi và chênh lệch' },
  equipment:{ label:'Thiết bị / số lượng', placeholder:'Tên thiết bị, cấu hình, số lượng và đơn vị sử dụng' },
  repair:{ label:'Tài sản / hiện trạng cần sửa chữa', placeholder:'Mã tài sản, hiện trạng và phương án sửa chữa' },
  other:{ label:'Thông tin bổ sung', placeholder:'Thông tin cần người duyệt xem xét' },
};
const VWORK_PROPOSAL_TYPES = [
  { id:'price', label:'Xin ý kiến giá bán', group:'Kinh doanh', assignJobCode:'JOB-SALE', hint:'Khách hàng, nhu cầu, phạm vi, mức giá đề xuất' },
  { id:'quote', label:'Xin ý kiến gửi báo giá', group:'Kinh doanh', assignJobCode:'JOB-SALE', hint:'Khách hàng, nhu cầu, căn cứ đơn giá, deadline gửi' },
  { id:'collaboration', label:'Đề xuất phối hợp', group:'Phối hợp', assignJobCode:'JOB-OPS', hint:'Chọn công việc đang có, chọn người phối hợp và nêu lý do cần hỗ trợ' },
  { id:'lesson', label:'Đề xuất soạn gấp giáo án', group:'Nội dung học liệu', assignJobCode:'JOB-ELEARNING', hint:'Chủ đề, số lượng, hạn cần xong, người review' },
  { id:'hiregv', label:'Đề xuất thuê GV/CTV', group:'Giảng viên', assignJobCode:'JOB-FACULTY', hint:'GV/CTV đề xuất, nội dung phụ trách, thù lao dự kiến' },
  { id:'work', label:'Đề xuất công việc phát sinh', group:'Công việc chung', assignJobCode:'JOB-OPS', hint:'Bối cảnh, kết quả cần đạt, người phối hợp, hạn xử lý' },
];
const VWORK_WORK_TYPES = [
  { jobCode:'JOB-OPS', title:'Hành chính', desc:'Họp, giao ban, biên bản' },
  { jobCode:'JOB-SALE', title:'Hồ sơ / báo giá', desc:'Khách hàng, cost sheet, hợp đồng' },
  { jobCode:'JOB-BID', title:'Hồ sơ đấu thầu', desc:'Checklist pháp lý, giá, bảo lãnh' },
  { jobCode:'JOB-FINANCE', title:'Tài chính', desc:'Tạm ứng, hoàn ứng, quyết toán' },
  { jobCode:'JOB-ELEARNING', title:'Nội dung học liệu', desc:'Slide, video, SCORM, bài kiểm tra' },
  { jobCode:'JOB-FACULTY', title:'Giảng viên', desc:'Briefing, giáo án, lịch dạy' },
];
const VWORK_DEEP_TOPIC_GUIDES = {
  'JOB-OPS': [
    { title:'Chuẩn bị họp/giao ban', detail:'Agenda, người tham dự, tài liệu trước họp, biên bản sau họp.', checkpoints:['Chốt agenda và thành phần', 'Gửi tài liệu trước họp', 'Tổng hợp biên bản và việc phát sinh'] },
    { title:'Tổng hợp hành chính', detail:'Thu đầu vào, rà thiếu thông tin, gửi bản tổng hợp cho người phụ trách.', checkpoints:['Thu đủ đầu vào', 'Rà thiếu thông tin', 'Gửi bản tổng hợp'] },
    { title:'Theo dõi văn bản/biên bản', detail:'Soạn, luân chuyển xác nhận, lưu minh chứng bản cuối.', checkpoints:['Soạn bản nháp', 'Lấy xác nhận liên quan', 'Lưu bản cuối'] },
  ],
  'JOB-SALE': [
    { title:'Tổng hợp nhu cầu khách hàng', detail:'Gom đầu vào, phạm vi, deadline và điều kiện thương mại.', checkpoints:['Thu đủ nhu cầu khách hàng', 'Chốt phạm vi sơ bộ', 'Gửi đầu vào cho báo giá'] },
    { title:'Chuẩn bị báo giá', detail:'Cost sheet, phương án, điều khoản thanh toán và bản gửi khách.', checkpoints:['Lập cost sheet', 'Rà điều khoản thanh toán', 'Gửi bản báo giá'] },
    { title:'Hồ sơ hợp đồng', detail:'Tổng hợp thông tin pháp lý, phạm vi, phụ lục và người ký.', checkpoints:['Thu thông tin pháp lý', 'Rà phạm vi/phụ lục', 'Trình ký hoặc gửi xác nhận'] },
  ],
  'JOB-BID': [
    { title:'Checklist hồ sơ thầu', detail:'Tách pháp lý, kỹ thuật, tài chính và người chịu trách nhiệm từng phần.', checkpoints:['Lập checklist pháp lý', 'Lập checklist kỹ thuật', 'Lập checklist tài chính'] },
    { title:'Bảo lãnh/chứng từ thầu', detail:'Theo dõi bảo lãnh, phí, chứng từ bắt buộc và hạn nộp.', checkpoints:['Xác nhận yêu cầu bảo lãnh', 'Chuẩn bị chứng từ tài chính', 'Đối chiếu trước hạn nộp'] },
  ],
  'JOB-FINANCE': [
    { title:'Tạm ứng/hoàn ứng', detail:'Mã đề nghị, chứng từ, người nhận và trạng thái kế toán.', checkpoints:['Thu chứng từ', 'Đối chiếu số tiền', 'Gửi kế toán duyệt'] },
    { title:'Quyết toán chi phí', detail:'Tổng hợp chi phí, P&L, hóa đơn và minh chứng thanh toán.', checkpoints:['Tổng hợp chi phí', 'Rà hóa đơn/chứng từ', 'Cập nhật P&L'] },
  ],
  'JOB-ELEARNING': [
    { title:'Tổng hợp đầu vào', detail:'Thu brief, tài liệu gốc, yêu cầu khách hàng và tiêu chuẩn đầu ra.', checkpoints:['Thu brief và tài liệu gốc', 'Rà yêu cầu khách hàng', 'Chốt tiêu chuẩn đầu ra'] },
    { title:'Đề cương nhiệm vụ', detail:'Chia đầu việc theo slide/video/SCORM/câu hỏi, gắn owner và hạn.', checkpoints:['Lập đề cương nhiệm vụ', 'Chia đầu việc theo sản phẩm', 'Chốt owner và hạn'] },
    { title:'QC học liệu', detail:'Rà nội dung, tương tác, media, câu hỏi và bản bàn giao.', checkpoints:['QC nội dung', 'QC tương tác/media', 'Bàn giao bản final'] },
  ],
  'JOB-FACULTY': [
    { title:'Briefing giảng viên', detail:'Mục tiêu lớp, lịch, tài liệu, tiêu chuẩn deliverable và kênh trao đổi.', checkpoints:['Chốt lịch briefing', 'Gửi tài liệu lớp', 'Xác nhận yêu cầu deliverable'] },
    { title:'Theo dõi giáo án/lịch dạy', detail:'Giáo án, lịch dạy, thù lao, xác nhận readiness trước lớp.', checkpoints:['Thu giáo án', 'Xác nhận lịch dạy', 'Chốt readiness trước lớp'] },
  ],
};
function normalizeDeepTaskSuggestionText(value) {
  return normalizeLegacyText(value).trim().toLowerCase();
}
function getDeepTaskSuggestions(jobCode, settings = []) {
  const defaults = VWORK_DEEP_TOPIC_GUIDES[jobCode] || VWORK_DEEP_TOPIC_GUIDES['JOB-OPS'] || [];
  const custom = (Array.isArray(settings) ? settings : [])
    .filter((item)=>item?.kind === 'vwork_deep_task_suggestion' && item.jobCode === jobCode)
    .map((item)=>({
      title:String(item.title || '').trim(),
      detail:item.detail || 'Đã từng nhập thủ công trong nhóm việc này.',
      checkpoints:Array.isArray(item.checkpoints) ? item.checkpoints : [],
      custom:true,
    }))
    .filter((item)=>item.title);
  const seen = new Set();
  return [...defaults, ...custom].filter((item)=>{
    const key = normalizeDeepTaskSuggestionText(item.title);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function rememberDeepTaskSuggestion(settings = [], jobCode, title, checkpoints = []) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) return Array.isArray(settings) ? settings : [];
  const existing = getDeepTaskSuggestions(jobCode, settings).some((item)=>normalizeDeepTaskSuggestionText(item.title) === normalizeDeepTaskSuggestionText(cleanTitle));
  if (existing) return Array.isArray(settings) ? settings : [];
  const nextItem = {
    kind:'vwork_deep_task_suggestion',
    code:`${jobCode}-${normalizeDeepTaskSuggestionText(cleanTitle).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || Date.now()}`,
    jobCode,
    title:cleanTitle,
    checkpoints:Array.isArray(checkpoints) ? checkpoints.filter(Boolean) : [],
    source:'vplanning_records',
    origin:'manual_assignment',
    updatedAt:new Date().toISOString(),
  };
  return [nextItem, ...(Array.isArray(settings) ? settings : [])];
}
const LIGHTS = ['Green','Amber','Red'];
const STAGE = {
  assigned:'Chưa bắt đầu', acknowledged:'Đã nhận', in_progress:'Đang thực hiện', reported:'Chờ duyệt',
  lead_approved:'Chờ xác nhận', controller_approved:'Hoàn thành', explain_requested:'Cần bổ sung', assignment_returned:'Đã phản hồi việc',
};
const STAGE_BADGE = { assigned:'b-red', acknowledged:'b-blue', in_progress:'b-amber', reported:'b-purple', lead_approved:'b-blue', controller_approved:'b-green', explain_requested:'b-red', assignment_returned:'b-red' };
const TASK_STATUS_LABELS = {
  all:'Tất cả',
  not_started:'Chưa bắt đầu',
  assigned:'Mới giao',
  acknowledged:'Đã nhận việc',
  in_progress:'Đang thực hiện',
  pending:'Chờ xử lý',
  returned:'Đã phản hồi',
  overdue:'Quá hạn',
  completed:'Hoàn thành',
};
const TASK_STATUS_TONE = {
  not_started:'b-gray',
  assigned:'b-red',
  acknowledged:'b-blue',
  in_progress:'b-amber',
  pending:'b-purple',
  returned:'b-red',
  overdue:'b-red',
  completed:'b-green',
};
const STATUS_FILTERS = [
  ['all','Tất cả'],
  ['not_started','Chưa bắt đầu'],
  ['assigned','Mới giao'],
  ['in_progress','Đang thực hiện'],
  ['pending','Chờ xử lý'],
  ['overdue','Quá hạn'],
  ['completed','Hoàn thành'],
];
const NOTIFICATION_KIND_TONE = { danger:'b-red', warning:'b-amber', success:'b-green', info:'b-blue' };
const NOTIFICATION_KIND_LABEL = { danger:'Cần xử lý', warning:'Cần duyệt', success:'Hoàn thành', info:'Thông báo' };
const TEMPLATE_URL = '/vplanning/templates/PeopleOne_Project_Workbook_Template.xlsx';
const REQUIRED_COLUMNS = ['STT','Mã dự án','Khách hàng','Nhóm công việc','Công việc cụ thể','Loại công việc','Mã công việc','Key Objective','Objective_ID','Result','Result_ID','Chủ trì','Owner_ID','Tham gia','Deadline','Mã Job','Mã OKR','Status','Priority','% Complete','Predecessor Task','Deliverable Link','Approval By','Risk Level','Traffic Light'];
const fmtPct = (value) => Math.max(0, Math.min(100, Number(value) || 0));
const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`;
const ownerById = (id) => MASTER.owners.find((item) => item.id === id);
const DIRECTOR_APPROVER_LABEL = 'Giám đốc';
function participantNamesForTask(task) {
  return [
    ...(String(task?.participants || '').split(',').map((item)=>item.trim()).filter(Boolean)),
    ...(Array.isArray(task?.participantNames) ? task.participantNames : []),
    ...(Array.isArray(task?.collaboratorNames) ? task.collaboratorNames : []),
    ...(Array.isArray(task?.payload?.participantNames) ? task.payload.participantNames : []),
    ...(Array.isArray(task?.payload?.collaboratorNames) ? task.payload.collaboratorNames : []),
    ...participantOwnerIdsForTask(task).map((id)=>ownerById(id)?.name),
  ].filter(Boolean).filter((name, index, names)=>names.findIndex((item)=>normalizeText(item) === normalizeText(name)) === index);
}
function participantOwnerIdsForTask(task) {
  return [
    ...(Array.isArray(task?.participantOwnerIds) ? task.participantOwnerIds : []),
    ...(Array.isArray(task?.collaboratorOwnerIds) ? task.collaboratorOwnerIds : []),
    ...(Array.isArray(task?.payload?.participantOwnerIds) ? task.payload.participantOwnerIds : []),
    ...(Array.isArray(task?.payload?.collaboratorOwnerIds) ? task.payload.collaboratorOwnerIds : []),
  ].filter(Boolean).map(String);
}
function normalizeVWorkReviewers(task) {
  if (!task || isFinancialApprovalTask(task)) return task;
  const reviewerOwnerIds = reviewerOwnerIdsForTask(task);
  const reviewerNames = reviewerDisplayNamesForTask(task);
  if (!reviewerOwnerIds.length && !reviewerNames.length) return task;
  const participantOwnerIds = [...new Set([...participantOwnerIdsForTask(task), ...reviewerOwnerIds])];
  const participantNames = [...new Set([...participantNamesForTask(task), ...reviewerNames].filter(Boolean))];
  return {
    ...task,
    approvalBy:'director',
    reviewerOwnerId:'',
    reviewerOwnerIds:[],
    reviewerName:'',
    reviewerNames:[],
    participantOwnerIds,
    participantNames,
    participants:participantNames.join(', '),
  };
}
function uniqueOwnersByName(owners) {
  const groups = new Map();
  owners.forEach((owner)=> {
    const key = normalizeText(owner.name);
    if (!groups.has(key)) groups.set(key, owner);
  });
  return [...groups.values()];
}
function workloadOwners() {
  const groups = new Map();
  MASTER.owners.forEach((owner)=> {
    const key = owner.name;
    const current = groups.get(key) || { ...owner, id:owner.id, ownerIds:[], roles:[], departments:[] };
    current.ownerIds.push(owner.id);
    if (!current.roles.includes(owner.role)) current.roles.push(owner.role);
    if (!current.departments.includes(owner.department)) current.departments.push(owner.department);
    current.id = current.ownerIds.join('+');
    current.role = current.roles.join(' / ');
    current.department = current.departments.join(' / ');
    groups.set(key, current);
  });
  return [...groups.values()];
}
function workloadOwnersForTasks(tasks = []) {
  const owners = workloadOwners().map((owner)=>({ ...owner, ownerIds:[...ownerIdsFor(owner)] }));
  const byName = new Map(owners.map((owner)=>[normalizeText(owner.name), owner]));
  MASTER.users.filter((user)=>(user.roles || []).includes('vplanning_director')).forEach((user)=>{
    const nameKey = normalizeText(user.name);
    if (byName.has(nameKey)) return;
    const ownedTasks = tasks.filter((task)=>normalizeText(task.ownerName || task.ownerLead) === nameKey);
    if (!ownedTasks.length) return;
    const ownerIds = [...new Set(ownedTasks.map((task)=>String(task.ownerId || '').trim()).filter(Boolean))];
    const owner = { id:ownerIds.join('+') || user.email, name:'Giám đốc', matchNames:[user.name], ownerIds, roles:user.roles || [], departments:user.departments || [] };
    owners.push(owner);
    byName.set(nameKey, owner);
  });
  return owners;
}
function isOutsideVWorkWorkforce(task) {
  return normalizeText(task?.ownerName || task?.ownerLead || '') === normalizeText('Coach/Giảng viên');
}
function ownerIdsFor(owner) {
  return Array.isArray(owner?.ownerIds) && owner.ownerIds.length ? owner.ownerIds : [owner?.id].filter(Boolean);
}
function taskBelongsToOwner(task, owner) {
  const ids = ownerIdsFor(owner).map(String);
  const names = [owner?.name].filter(Boolean).map(normalizeText);
  return ids.includes(String(task.ownerId || ''))
    || participantOwnerIdsForTask(task).some((id)=>ids.includes(id))
    || names.includes(normalizeText(task.ownerName))
    || names.includes(normalizeText(task.ownerLead))
    || participantNamesForTask(task).some((name)=>names.includes(normalizeText(name)));
}
function taskPrimaryOwnedBy(task, owner) {
  const ids = ownerIdsFor(owner).map(String);
  const ownerNames = [owner?.name, ...(owner?.matchNames || [])].map(normalizeText).filter(Boolean);
  const taskOwnerId = String(task.ownerId || '');
  if (taskOwnerId) return ids.includes(taskOwnerId);
  const taskOwnerName = normalizeText(task.ownerName || task.ownerLead || '');
  return Boolean(taskOwnerName && ownerNames.includes(taskOwnerName));
}
function primaryOwnerIdsForUser(currentUser, me) {
  const currentName = normalizeText(currentUser?.name || me || '');
  const matchedIds = MASTER.owners
    .filter((owner)=>normalizeText(owner.name) === currentName)
    .map((owner)=>String(owner.id));
  return matchedIds.length ? matchedIds : [...new Set([...(currentUser?.ownerIds || []), currentUser?.email, currentUser?.id].map(String).filter(Boolean))];
}
function currentUserIsPrimaryOwner(task, currentUser, me) {
  const primaryOwnerIds = primaryOwnerIdsForUser(currentUser, me);
  const taskOwnerId = String(task.ownerId || '');
  if (taskOwnerId) return primaryOwnerIds.includes(taskOwnerId);
  const currentName = normalizeText(currentUser?.name || me || '');
  return Boolean(currentName && normalizeText(task.ownerName || task.ownerLead || '') === currentName);
}
function currentUserCanWorkOnTask(task, currentUser, me) {
  if (currentUserIsPrimaryOwner(task, currentUser, me)) return true;
  const primaryOwnerIds = primaryOwnerIdsForUser(currentUser, me);
  const currentName = normalizeText(currentUser?.name || me || '');
  return participantOwnerIdsForTask(task).some((id)=>primaryOwnerIds.includes(String(id)))
    || participantNamesForTask(task).some((name)=>normalizeText(name) === currentName);
}
const jobExists = (code) => MASTER.jobs.some(([job]) => job === code);
function standardChecklistForJob(jobCode){
  const map = {
    'JOB-PM':['Chốt phạm vi','Lập timeline','Điều phối liên quan','Báo cáo kết quả'],
    'JOB-CONTENT':['Xác nhận đầu bài','Soạn nội dung','QC nội bộ','Bàn giao học liệu'],
    'JOB-FACULTY':['Xác nhận giảng viên','Gửi thông tin lớp','Chạy thử nếu cần','Chốt lịch triển khai'],
    'JOB-LMS':['Tạo lớp/LMS','Import học viên','Kiểm thử đăng nhập','Theo dõi vận hành'],
    'JOB-OPS':['Lập checklist vận hành','Phân công hỗ trợ','Theo dõi lớp','Tổng hợp sau lớp'],
    'JOB-FINANCE':['Kiểm tra chứng từ','Đối chiếu chi phí','Cập nhật P&L','Báo cáo kế toán'],
    'JOB-LOGISTICS':['Chốt hậu cần','Chuẩn bị vật phẩm','Theo dõi check-in','Bàn giao minh chứng'],
  };
  return (map[jobCode] || ['Xác nhận phạm vi','Triển khai công việc','Cập nhật minh chứng','Báo cáo kết quả']).map((label)=>ck(label));
}
const objectiveExists = (id) => MASTER.objectives.some(([objective]) => objective === id);
const resultExists = (id) => MASTER.results.some(([result]) => result === id);
function taskDepartment(task){ return ownerById(task.ownerId)?.department || ''; }
function getVisibleTasks(tasks, role, me, currentUser){
  const matrix = currentRole(role);
  if (can(role, 'view_all')) return tasks;
  if (matrix.scope === 'team') {
    const departments = currentUser?.departments?.length ? currentUser.departments : matrix.departments || [];
    const ownerIds = (currentUser?.ownerIds || []).map(String);
    return tasks.filter((task)=>departments.includes(taskDepartment(task)) || ownerIds.includes(String(task.ownerId || '')) || normalizeText(task.ownerName) === normalizeText(me));
  }
  const ownerIds = (currentUser?.ownerIds || []).map(String);
  const owner = { id:ownerIds[0], ownerIds, name:me || currentUser?.name || '' };
  return tasks.filter((task)=>normalizeText(task.ownerName) === normalizeText(me) || ownerIds.includes(String(task.ownerId || '')) || taskBelongsToOwner(task, owner));
}
function getOwnTasks(tasks, me, currentUser){
  return tasks.filter((task)=>currentUserIsPrimaryOwner(task, currentUser, me));
}
function isFinancialApprovalTask(task) {
  const text = normalizeText([task?.title, task?.group, task?.workType, task?.jobCode, task?.requestKind].filter(Boolean).join(' '));
  return isVWorkAdminRequest(task)
    || task?.jobCode === 'JOB-FINANCE'
    || text.includes('de xuat')
    || text.includes('de nghi')
    || text.includes('mua')
    || text.includes('thanh toan')
    || text.includes('tam ung')
    || text.includes('ve may bay');
}
function reviewerOwnerIdsForTask(task) {
  return [
    task?.reviewerOwnerId,
    task?.reviewerId,
    task?.approvalBy,
    task?.payload?.reviewerOwnerId,
    task?.payload?.reviewerId,
    task?.payload?.approvalBy,
    ...(Array.isArray(task?.reviewerOwnerIds) ? task.reviewerOwnerIds : []),
    ...(Array.isArray(task?.reviewerIds) ? task.reviewerIds : []),
    ...(Array.isArray(task?.payload?.reviewerOwnerIds) ? task.payload.reviewerOwnerIds : []),
    ...(Array.isArray(task?.payload?.reviewerIds) ? task.payload.reviewerIds : []),
  ].filter(Boolean).map(String);
}
function reviewerNamesForTask(task) {
  return reviewerDisplayNamesForTask(task).map(normalizeText);
}
function reviewerDisplayNamesForTask(task) {
  return [
    task?.reviewerName,
    task?.approvalByName,
    task?.payload?.reviewerName,
    task?.payload?.approvalByName,
    ...(Array.isArray(task?.reviewerNames) ? task.reviewerNames : []),
    ...(Array.isArray(task?.payload?.reviewerNames) ? task.payload.reviewerNames : []),
    ownerById(task?.reviewerOwnerId)?.name,
    ownerById(task?.reviewerId)?.name,
    ownerById(task?.approvalBy)?.name,
    ownerById(task?.payload?.reviewerOwnerId)?.name,
    ownerById(task?.payload?.reviewerId)?.name,
    ownerById(task?.payload?.approvalBy)?.name,
    ...reviewerOwnerIdsForTask(task).map((id)=>ownerById(id)?.name),
  ].filter(Boolean).filter((name, index, names)=>names.findIndex((item)=>normalizeText(item) === normalizeText(name)) === index);
}
function currentUserTaskKeys(currentUser = {}) {
  return [...new Set([
    currentUser.id,
    currentUser.email,
    ...(Array.isArray(currentUser.ownerIds) ? currentUser.ownerIds : []),
  ].filter(Boolean).map((value)=>String(value).trim().toLowerCase()))];
}
function currentUserMatchesTaskIdentity(currentUser, ownerId, ownerName='') {
  const keys = currentUserTaskKeys(currentUser);
  const id = String(ownerId || '').trim().toLowerCase();
  if (id && keys.includes(id)) return true;
  const userName = normalizeText(currentUser?.name || '');
  return Boolean(userName && ownerName && userName === normalizeText(ownerName));
}
function taskPrimaryReviewer(task, currentUser = {}) {
  const ownerId = task?.reviewerOwnerId || task?.reviewerId || task?.approvalBy || '';
  const ownerName = task?.reviewerName || task?.approvalByName || ownerById(ownerId)?.name || '';
  return { ownerId, ownerName, isCurrent:currentUserMatchesTaskIdentity(currentUser, ownerId, ownerName) };
}
function taskReviewerDelegation(task, currentUser = {}) {
  const expiresAt = task?.reviewerDelegationExpiresAt || '';
  const active = Boolean(task?.reviewerDelegateOwnerId)
    && (!expiresAt || Date.parse(`${String(expiresAt).slice(0,10)}T23:59:59`) >= Date.now())
    && !task?.reviewerDelegationRevokedAt;
  return {
    active,
    ownerId:task?.reviewerDelegateOwnerId || '',
    ownerName:task?.reviewerDelegateName || '',
    isCurrent:active && currentUserMatchesTaskIdentity(currentUser, task?.reviewerDelegateOwnerId, task?.reviewerDelegateName),
  };
}
function currentUserCanReviewTask(task, role, currentUser = {}) {
  const primary = taskPrimaryReviewer(task, currentUser);
  const delegation = taskReviewerDelegation(task, currentUser);
  return primary.isCurrent || delegation.isCurrent || isDirectorUser(currentUser, role) || can(role, 'manage_tasks');
}
function isTaskForCurrentReviewer(task, role, currentUser = {}) {
  return currentUserCanReviewTask(task, role, currentUser)
    || Boolean(task?.directorDelegateOwnerIds?.some((id)=>(currentUser?.ownerIds || []).map(String).includes(String(id))));
}
function isVWorkAdminRequestAwaitingCurrentUser(task, role, currentUser = {}) {
  if (!isVWorkAdminRequest(task)) return false;
  const meta = adminRequestMeta(task);
  const status = meta.paymentStatus || 'submitted';
  if (['paid','rejected'].includes(status)) return false;
  if (meta.opinionStatus === 'pending'
    && String(meta.opinionRequestedEmail || '').trim().toLowerCase() === String(currentUser?.email || '').trim().toLowerCase()) return true;
  return nextVWorkAdminRequestActions(task, role, currentUser).length > 0;
}
function isVWorkProposalOpinionAwaitingCurrentUser(task, currentUser = {}) {
  if (!isVWorkProposalRequestTask(task)) return false;
  const request = proposalRequestTaskToRequest(task);
  return request.status === 'info'
    && request.opinionStatus !== 'responded'
    && String(request.opinionRequestedEmail || '').trim().toLowerCase() === String(currentUser?.email || '').trim().toLowerCase();
}
function getReviewTasks(tasks, role, currentUser = {}){
  const adminRequests = tasks.filter((task)=>isVWorkAdminRequestAwaitingCurrentUser(task, role, currentUser));
  const proposalOpinions = tasks.filter((task)=>isVWorkProposalOpinionAwaitingCurrentUser(task, currentUser));
  const reviewable = tasks
    .filter((task)=>!isVWorkAdminRequest(task))
    .filter((task)=>task.stage === 'reported' || task.stage === 'lead_approved' || task.stage === 'explain_requested')
    .filter((task)=>isTaskForCurrentReviewer(task, role, currentUser));
  if (can(role, 'control_review')) {
    return sortTasksForDisplay([...reviewable, ...adminRequests, ...proposalOpinions]);
  }
  if (can(role, 'approve_team')) return sortTasksForDisplay([...reviewable, ...adminRequests, ...proposalOpinions]);
  return sortTasksForDisplay([...reviewable, ...adminRequests, ...proposalOpinions]);
}
function addDays(days){
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + Number(days || 0));
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0,10);
}
function isVWorkAdminRequest(task) {
  return task?.sourceModule === 'vwork_admin_request' || task?.requestKind === 'admin_request';
}
function adminRequestMeta(task) {
  return task?.adminRequest || {};
}
function splitAdminRequestText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line)=>line.trim())
    .filter(Boolean);
}
function parseVWorkAttachmentLinks(value) {
  return splitAdminRequestText(value)
    .flatMap((line)=>line.split(/[;,]/g))
    .map((link)=>String(link || '').trim())
    .filter(Boolean)
    .filter((link, index, links)=>links.indexOf(link) === index);
}
function getAdminRequestNote(task) {
  const meta = adminRequestMeta(task);
  if (String(meta.note || '').trim()) return String(meta.note || '').trim();
  const purpose = String(meta.purpose || '').replace(/\r/g, '');
  const method = String(task?.method || '').replace(/\r/g, '');
  if (method && purpose && method.startsWith(purpose)) return method.slice(purpose.length).trim();
  return '';
}
function getAdminRequestAttachmentLinks(task) {
  const meta = adminRequestMeta(task);
  const explicitLinks = Array.isArray(meta.attachmentLinks) ? meta.attachmentLinks : [];
  const textSources = [
    meta.attachmentLink,
    meta.note,
    meta.purpose,
    task?.method,
  ].filter(Boolean).map(String);
  const textLinks = textSources.flatMap((text)=>text.match(/(?:https?:\/\/|www\.)[^\s,;]+/gi) || []);
  return [...explicitLinks, ...textLinks]
    .map((link)=>typeof link === 'object' ? String(link?.url || '') : String(link || ''))
    .map((link)=>link.trim().replace(/[).,\]]+$/g, ''))
    .filter(Boolean)
    .filter((link, index, links)=>links.indexOf(link) === index);
}
function getAdminRequestAttachmentFiles(task) {
  const meta = adminRequestMeta(task);
  return (Array.isArray(meta.attachmentFiles) ? meta.attachmentFiles : [])
    .map((file)=>({
      name:String(file?.name || file?.fileName || '').trim(),
      url:String(file?.url || file?.fileUrl || '').trim(),
      type:String(file?.type || file?.fileType || '').trim(),
      size:Number(file?.size || 0),
    }))
    .filter((file)=>file.name);
}
function vsuitePaymentDocumentsToAttachmentFiles(documents = []) {
  return (Array.isArray(documents) ? documents : [])
    .map((document)=>({
      name:String(document?.title || document?.url || '').trim(),
      url:String(document?.url || '').trim(),
      type:String(document?.document_type || '').trim(),
      size:0,
      note:String(document?.note || '').trim(),
    }))
    .filter((file)=>file.name || file.url);
}
function normalizeAdminRequestUrl(link) {
  const value = String(link || '').trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}
function isAllowedLoanAttachmentFile(file) {
  if (!file) return false;
  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();
  return name.endsWith('.doc') || name.endsWith('.docx') || name.endsWith('.pdf')
    || type === 'application/pdf'
    || type === 'application/msword'
    || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}
function loanPurposeText(draft) {
  return [
    `Bên đi vay: ${String(draft.borrower || '').trim()}`,
    `Bên cho vay: ${String(draft.lender || '').trim()}`,
    `Số tiền: ${Number(String(draft.amount || '').replace(/[^\d.]/g, '') || 0).toLocaleString('vi-VN')} VND`,
    `Mục đích khoản vay: ${String(draft.loanPurpose || '').trim()}`,
    `Thời hạn trả: ${String(draft.dueDate || '').trim()}`,
    '',
    String(draft.content || '').trim(),
  ].filter((line, index)=>index === 5 || Boolean(line.trim())).join('\n');
}
function adminRequestMatchTokens(task) {
  if (!isVWorkAdminRequest(task)) return [];
  const meta = adminRequestMeta(task);
  const exactTokens = [
    meta.vsuitePaymentRequestId ? `vsuite:${meta.vsuitePaymentRequestId}` : '',
    meta.requestCode || task?.workCode || task?.sourceId ? `code:${normalizeText(meta.requestCode || task?.workCode || task?.sourceId)}` : '',
  ].filter(Boolean);
  const softToken = [
    normalizeText(task?.title || ''),
    normalizeText(meta.vendor || ''),
    String(Number(meta.amount || 0) || ''),
  ].join('|');
  return softToken.replace(/\|/g, '') ? [...exactTokens, `soft:${softToken}`] : exactTokens;
}
function isSameVWorkAdminRequest(left, right) {
  if (!isVWorkAdminRequest(left) || !isVWorkAdminRequest(right)) return false;
  const leftTokens = new Set(adminRequestMatchTokens(left));
  return adminRequestMatchTokens(right).some((token)=>leftTokens.has(token));
}
function vworkAdminRequestKeepScore(task) {
  const meta = adminRequestMeta(task);
  let score = 0;
  if (meta.vsuitePaymentRequestId) score += 4;
  if (meta.requestCode || task?.workCode || task?.sourceId) score += 2;
  if (String(task?.ownerName || '').trim() && normalizeText(task?.ownerName) !== 'vsuite') score += 3;
  if (String(meta.requesterName || '').trim() && normalizeText(meta.requesterName) !== 'vsuite') score += 3;
  if (!String(task?.id || '').startsWith('vsuite-')) score += 1;
  return score;
}
function dedupeVWorkAdminRequestTasks(tasks) {
  const result = [];
  for (const task of tasks) {
    if (!isVWorkAdminRequest(task)) {
      result.push(task);
      continue;
    }
    const existingIndex = result.findIndex((item)=>isSameVWorkAdminRequest(item, task));
    if (existingIndex < 0) {
      result.push(task);
      continue;
    }
    if (vworkAdminRequestKeepScore(task) > vworkAdminRequestKeepScore(result[existingIndex])) {
      result[existingIndex] = task;
    }
  }
  return result;
}
function mergeVWorkAdminRequestWithRemote(localTask, remoteTask) {
  if (!localTask || !remoteTask) return localTask || remoteTask;
  const localMeta = adminRequestMeta(localTask);
  const remoteMeta = adminRequestMeta(remoteTask);
  const localFiles = Array.isArray(localMeta.attachmentFiles) ? localMeta.attachmentFiles : [];
  const remoteFiles = Array.isArray(remoteMeta.attachmentFiles) ? remoteMeta.attachmentFiles : [];
  const fileMap = new Map([...localFiles, ...remoteFiles].map((file)=>[`${file?.url || ''}|${file?.name || file?.fileName || ''}`, file]));
  const mergedMeta = {
    ...remoteMeta,
    ...localMeta,
    vsuitePaymentRequestId:remoteMeta.vsuitePaymentRequestId || localMeta.vsuitePaymentRequestId,
    requestCode:remoteMeta.requestCode || localMeta.requestCode,
    paymentStatus:remoteMeta.paymentStatus || localMeta.paymentStatus,
    accountingNote:remoteMeta.accountingNote || localMeta.accountingNote,
    managerNote:remoteMeta.managerNote || localMeta.managerNote,
    directorNote:remoteMeta.directorNote || localMeta.directorNote,
    paymentRef:remoteMeta.paymentRef || localMeta.paymentRef,
    paidAmount:remoteMeta.paidAmount || localMeta.paidAmount,
    paidDate:remoteMeta.paidDate || localMeta.paidDate,
    delegatedApproverEmail:remoteMeta.delegatedApproverEmail || localMeta.delegatedApproverEmail,
    delegatedApproverName:remoteMeta.delegatedApproverName || localMeta.delegatedApproverName,
    opinionRequestedEmail:remoteMeta.opinionRequestedEmail || localMeta.opinionRequestedEmail,
    opinionRequestedTo:remoteMeta.opinionRequestedTo || localMeta.opinionRequestedTo,
    opinionRequestNote:remoteMeta.opinionRequestNote || localMeta.opinionRequestNote,
    opinionRequestedAt:remoteMeta.opinionRequestedAt || localMeta.opinionRequestedAt,
    opinionStatus:remoteMeta.opinionStatus || localMeta.opinionStatus,
    opinionResponse:remoteMeta.opinionResponse || localMeta.opinionResponse,
    opinionRespondedAt:remoteMeta.opinionRespondedAt || localMeta.opinionRespondedAt,
    updatedAt:remoteMeta.updatedAt || localMeta.updatedAt,
    attachmentFiles:[...fileMap.values()],
  };
  return {
    ...remoteTask,
    ...localTask,
    status:remoteTask.status,
    complete:remoteTask.complete,
    traffic:remoteTask.traffic,
    checklist:remoteTask.checklist?.length ? remoteTask.checklist : localTask.checklist,
    activity:[...(localTask.activity || []), ...(remoteTask.activity || [])].filter((event,index,events)=>events.findIndex((item)=>`${item.action}|${item.at}|${item.note}` === `${event.action}|${event.at}|${event.note}`) === index),
    adminRequest:mergedMeta,
  };
}
function mergeVWorkAdminRequestSources(localRequests, remoteRequests, remoteLoaded = false) {
  const activeRemotePaymentIds = new Set(remoteRequests.map((task)=>String(adminRequestMeta(task).vsuitePaymentRequestId || '')).filter(Boolean));
  const activeRemoteSourceIds = new Set(remoteRequests.map((task)=>String(task.sourceId || adminRequestMeta(task).requestCode || '')).filter(Boolean));
  const synchronizedLocalRequests = remoteLoaded ? localRequests.filter((task)=>{
    const meta = adminRequestMeta(task);
    const paymentId = String(meta.vsuitePaymentRequestId || '');
    const sourceId = String(task.sourceId || meta.requestCode || '');
    if (!paymentId) return true;
    return activeRemotePaymentIds.has(paymentId) || (sourceId && activeRemoteSourceIds.has(sourceId));
  }) : localRequests;
  const usedRemoteIds = new Set();
  const mergedLocal = synchronizedLocalRequests.map((localTask)=>{
    const remoteIndex = remoteRequests.findIndex((remoteTask)=>!usedRemoteIds.has(remoteTask.id) && isSameVWorkAdminRequest(localTask, remoteTask));
    if (remoteIndex < 0) return localTask;
    usedRemoteIds.add(remoteRequests[remoteIndex].id);
    return mergeVWorkAdminRequestWithRemote(localTask, remoteRequests[remoteIndex]);
  });
  return [...mergedLocal, ...remoteRequests.filter((remoteTask)=>!usedRemoteIds.has(remoteTask.id))];
}
function getVWorkAdminRequestReviewTasks(tasks, paymentRequestRows, remoteLoaded, role, currentUser) {
  const localRequests = dedupeVWorkAdminRequestTasks(tasks.filter(isVWorkAdminRequest));
  const remoteRequests = remoteLoaded ? (paymentRequestRows || []).map((row)=>vsuitePaymentRequestToVWorkTask(row)) : [];
  return mergeVWorkAdminRequestSources(localRequests, remoteRequests, remoteLoaded)
    .filter((task)=>isVWorkAdminRequestAwaitingCurrentUser(task, role, currentUser));
}
function isVWorkProposalRequestTask(task) {
  return task?.sourceModule === 'vwork_proposal_request' && task?.requestKind === 'work_proposal' && task?.workProposal;
}
function proposalRequestTaskToRequest(task) {
  return {
    ...(task.workProposal || {}),
    id:task.sourceId || task.workProposal?.id || task.workCode || String(task.id),
    taskRecordId:task.id,
    title:task.workProposal?.title || task.title || '',
    status:task.workProposal?.status || 'pending',
  };
}
function dedupeVWorkProposalRequests(rows) {
  const result = [];
  const seen = new Set();
  for (const row of rows) {
    const key = String(row?.id || row?.taskRecordId || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}
function isVWorkProposalDelegate(item, currentUser = {}) {
  return Boolean(item?.delegatedApproverEmail)
    && String(item.delegatedApproverEmail).trim().toLowerCase() === String(currentUser?.email || '').trim().toLowerCase();
}
function isVWorkProposalDecisionOwner(item, currentUser = {}) {
  return item?.delegatedApproverEmail ? isVWorkProposalDelegate(item, currentUser) : isDirectorUser(currentUser, '');
}
function isVWorkTaskProposalRecipient(item, currentUser = {}) {
  return item?.type === 'task_idea' && currentUserMatchesTaskIdentity(currentUser, item.recipientOwnerId, item.recipientName);
}
function isVWorkProposalAwaitingCurrentUser(item, currentUser = {}) {
  const currentEmail = String(currentUser?.email || '').trim().toLowerCase();
  const opinionTarget = item?.status === 'info' && item.opinionStatus !== 'responded' && String(item.opinionRequestedEmail || '').trim().toLowerCase() === currentEmail;
  const opinionReturned = item?.status === 'info' && item.opinionStatus === 'responded' && isVWorkProposalDecisionOwner(item, currentUser);
  const recipientNeedsResponse = isVWorkTaskProposalRecipient(item, currentUser) && !['rewarded','rejected'].includes(item.status);
  return opinionTarget || opinionReturned || recipientNeedsResponse || (item?.status === 'pending' && isVWorkProposalDecisionOwner(item, currentUser));
}
function getVWorkProposalReviewRequests(tasks, currentUser = {}) {
  return dedupeVWorkProposalRequests(tasks.filter(isVWorkProposalRequestTask).map(proposalRequestTaskToRequest))
    .filter((item)=>isVWorkProposalAwaitingCurrentUser(item, currentUser));
}
function createVWorkProposalRequestTask(request, baseId, currentUser) {
  return {
    id:baseId,
    projectCode:'ADMIN',
    customer:'PeopleOne',
    group:'Đề xuất công việc',
    title:request.title,
    workType:request.group || 'Đề xuất công việc',
    workCode:request.id,
    ownerId:request.ownerId || '',
    ownerName:request.ownerName || currentUser?.name || currentUser?.email || '',
    ownerLead:request.ownerName || currentUser?.name || currentUser?.email || '',
    participants:'Giám đốc',
    deadline:addDays(request.urgency === 'Gấp' ? 1 : request.urgency === 'Trong ngày' ? 0 : 3),
    startDate:addDays(0),
    jobCode:request.assignJobCode || 'JOB-OPS',
    status:'assigned',
    priority:request.urgency === 'Gấp' ? 'High' : 'Medium',
    complete:0,
    risk:request.urgency === 'Gấp' ? 'High' : 'Medium',
    traffic:'Amber',
    sourceModule:'vwork_proposal_request',
    sourceId:request.id,
    requestKind:'work_proposal',
    checklist:[ck('Giám đốc xem đề xuất'), ck('Duyệt hoặc từ chối')],
    method:[request.detail, `Nguồn: đề xuất ${request.id}`].filter(Boolean).join('\n\n'),
    reports:[],
    activity:addTaskEvent({ activity:[] }, currentUser, 'Gửi đề xuất công việc', `${request.id} - ${request.title}`),
    errors:[],
    stage:'reported',
    workProposal:request,
  };
}
function isAccountingUser(currentUser = {}, role = '') {
  if (isDirectorUser(currentUser, role)) return false;
  const accountingPeople = MASTER.orgUnits.find((unit)=>unit.code === 'accounting')?.people || [];
  const currentName = normalizeText(currentUser?.name || '');
  if (accountingPeople.some((name)=>normalizeText(name) === currentName)) return true;
  const accountingOwnerIds = new Set(MASTER.owners.filter((owner)=>accountingPeople.includes(owner.name)).map((owner)=>owner.id));
  if ((currentUser?.ownerIds || []).some((ownerId)=>accountingOwnerIds.has(ownerId))) return true;
  const title = normalizeText(currentUser?.title || '');
  return title.includes(normalizeText('Kế toán'));
}
function isDirectorUser(currentUser = {}, role = '') {
  const roles = Array.isArray(currentUser?.roles) ? currentUser.roles : [];
  const email = String(currentUser?.email || '').trim().toLowerCase();
  return role === 'vplanning_director'
    || roles.includes('vplanning_director')
    || DIRECTOR_EMAILS.has(email)
    || normalizeText(currentUser?.name || '') === normalizeText('Hải Lê');
}
function isDelegatedRequestApprover(request, currentUser = {}) {
  const meta = adminRequestMeta(request);
  const delegatedApproverId = String(meta.delegatedApproverId || '').trim();
  const delegatedApproverEmail = String(meta.delegatedApproverEmail || '').trim().toLowerCase();
  if (!delegatedApproverId && !delegatedApproverEmail) return false;
  const ownerIds = Array.isArray(currentUser?.ownerIds) ? currentUser.ownerIds.map(String) : [];
  const email = String(currentUser?.email || '').trim().toLowerCase();
  return ownerIds.includes(delegatedApproverId) || String(currentUser?.id || '') === delegatedApproverId || (delegatedApproverEmail && email === delegatedApproverEmail);
}
function isAdminRequestDecisionOwner(request, role, currentUser = {}) {
  const meta = adminRequestMeta(request);
  const hasDelegation = Boolean(String(meta.delegatedApproverId || '').trim() || String(meta.delegatedApproverEmail || '').trim());
  return hasDelegation ? isDelegatedRequestApprover(request, currentUser) : isDirectorUser(currentUser, role);
}
function requestFlowSteps(task) {
  const status = adminRequestMeta(task).paymentStatus || 'submitted';
  return [
    { key:'submitted', label:'Gửi yêu cầu', done:['submitted','accountant_review','manager_approved','director_approved','paid'].includes(status) },
    { key:'accounting', label:'Kế toán duyệt', done:['accountant_review','manager_approved','director_approved','paid'].includes(status) },
    { key:'director', label:'Giám đốc/ủy quyền duyệt', done:['director_approved','paid'].includes(status) },
    { key:'paid', label:'Thanh toán/xác nhận', done:status === 'paid' },
  ];
}
function vworkAdminRequestStatusMeta(status, meta = null) {
  if (meta?.delegatedApproverEmail && ['accountant_review','manager_approved'].includes(status)) {
    return { label:'Giám đốc ủy quyền duyệt', tone:'b-purple' };
  }
  return VWORK_ADMIN_REQUEST_STATUSES[status] || VWORK_ADMIN_REQUEST_STATUSES.submitted;
}
const VWORK_REQUESTER_PROFILE_FALLBACKS = {
  PROFILE_ADMIN_9bf0b61b6c03:{ full_name:'Nam Phạm', email:'phamhoainamk54@gmail.com' },
  PROFILE_ADMIN_dad5c9cf35d3:{ full_name:'Ngọc Phạm', email:'minhngocpham2002@gmail.com' },
  PROFILE_VPLANNING_NGUYETDOTHI:{ full_name:'Nguyệt Đỗ', email:'nguyetdothi@peopleone.com.vn' },
};
function resolveVWorkRequesterIdentity(request, requesterProfile = null) {
  const fallback = VWORK_REQUESTER_PROFILE_FALLBACKS[String(request?.requester_profile_id || '')] || null;
  const email = String(requesterProfile?.email || fallback?.email || '').trim().toLowerCase();
  const peopleOneUser = email ? MASTER.users.find((user)=>String(user.email || '').trim().toLowerCase() === email) : null;
  return {
    name:peopleOneUser?.name || requesterProfile?.full_name || fallback?.full_name || email || 'Chưa xác định người gửi',
    email:peopleOneUser?.email || requesterProfile?.email || fallback?.email || '',
  };
}
function vsuitePaymentRequestToVWorkTask(request, documents = [], approvalEvents = [], requesterProfile = null) {
  const template = VWORK_ADMIN_REQUEST_FORM_TEMPLATES[1];
  const status = request?.status || 'submitted';
  const amount = Number(request?.amount || 0);
  const requesterIdentity = resolveVWorkRequesterIdentity(request, requesterProfile);
  const delegatedApproverEmail = String(request?.delegated_approver_email || '').trim().toLowerCase();
  const delegatedUser = delegatedApproverEmail
    ? MASTER.users.find((user)=>String(user.email || '').trim().toLowerCase() === delegatedApproverEmail)
    : null;
  return {
    id:`vsuite-${request.id}`,
    projectCode:'ADMIN',
    customer:'PeopleOne',
    group:'Yêu cầu hành chính',
    title:request?.title || 'Yêu cầu hành chính',
    workType:'Yêu cầu hành chính',
    workCode:request?.code || '',
    ownerId:'',
    ownerName:requesterIdentity.name,
    ownerLead:requesterIdentity.name,
    participants:'Kế toán, Giám đốc',
    deadline:request?.due_date || addDays(3),
    startDate:String(request?.created_at || '').slice(0,10) || addDays(0),
    jobCode:'JOB-FINANCE',
    status:status === 'paid' ? 'completed' : 'assigned',
    priority:amount >= 5000000 ? 'High' : 'Medium',
    complete:status === 'paid' ? 100 : status === 'director_approved' ? 80 : status === 'manager_approved' ? 60 : status === 'accountant_review' ? 40 : 0,
    risk:amount >= 5000000 ? 'Medium' : 'Low',
    traffic:['returned','rejected'].includes(status) ? 'Red' : status === 'paid' ? 'Green' : 'Amber',
    sourceModule:'vwork_admin_request',
    sourceId:request?.code || request?.id || '',
    requestKind:'admin_request',
    checklist:[
      ck('Kế toán duyệt thông tin/chứng từ', ['accountant_review','manager_approved','director_approved','paid'].includes(status)),
      ck('Giám đốc duyệt chi', ['director_approved','paid'].includes(status)),
      ck('Kế toán/thủ quỹ xác nhận thanh toán', status === 'paid'),
    ],
    method:request?.purpose || '',
    reports:[],
    activity:approvalEvents.map((event)=>({
      action:{ submit:'Gửi yêu cầu', accountant_review:'Kế toán duyệt', director_approve:'Giám đốc/ủy quyền duyệt', mark_paid:'Kế toán xác nhận thanh toán', return:'Trả lại bổ sung', reject:'Từ chối', delegate_director_approval:'Ủy quyền duyệt', request_opinion:'Đề nghị cho ý kiến', respond_opinion:'Bổ sung ý kiến' }[event.action] || event.action || 'Cập nhật phiếu',
      by:event.actor_profile_id || 'PeopleOne',
      at:event.created_at || '',
      note:event.note || `${event.from_status || ''} → ${event.to_status || ''}`,
    })),
    errors:[],
    stage:status === 'paid' ? 'controller_approved' : 'reported',
    adminRequest:{
      vsuitePaymentRequestId:request?.id || '',
      requestCode:request?.code || '',
      requesterProfileId:request?.requester_profile_id || '',
      requestType:'payment',
      vendor:request?.vendor_name || request?.payee_name || '',
      amount,
      currency:request?.currency || 'VND',
      purpose:request?.purpose || '',
      formTemplate:template.id,
      formFileName:template.fileName,
      paymentStatus:status,
      requesterName:requesterIdentity.name,
      requesterEmail:requesterIdentity.email,
      accountingNote:request?.accountant_note || '',
      directorNote:request?.director_note || '',
      paymentRef:request?.payment_transaction_ref || '',
      paidAmount:Number(request?.paid_amount || 0),
      paidDate:request?.paid_date || '',
      delegatedApproverId:delegatedUser?.ownerIds?.[0] || '',
      delegatedApproverName:delegatedUser?.name || '',
      delegatedApproverEmail:request?.delegated_approver_email || '',
      opinionRequestedTo:request?.opinion_requested_name || '',
      opinionRequestedEmail:request?.opinion_requested_email || '',
      opinionRequestNote:request?.opinion_request_note || '',
      opinionRequestedAt:request?.opinion_requested_at || '',
      opinionStatus:request?.opinion_status || 'none',
      opinionResponse:request?.opinion_response || '',
      opinionRespondedAt:request?.opinion_responded_at || '',
      attachmentFiles:vsuitePaymentDocumentsToAttachmentFiles(documents),
      createdAt:request?.created_at || '',
      updatedAt:request?.updated_at || '',
    },
  };
}
function vworkTaskToVsuitePaymentRequest(task) {
  const meta = adminRequestMeta(task);
  return {
    id:meta.vsuitePaymentRequestId || '',
    class_id:null,
    code:meta.requestCode || task.sourceId || task.workCode || '',
    title:task.title || '',
    requester_profile_id:meta.requesterProfileId || null,
    vendor_name:meta.vendor || '',
    payee_name:meta.vendor || '',
    payee_bank:'',
    payee_account:'',
    amount:Number(meta.amount || 0),
    currency:meta.currency || 'VND',
    purpose:meta.purpose || task.method || '',
    status:meta.paymentStatus || 'submitted',
    due_date:task.deadline || null,
    accountant_note:meta.accountingNote || '',
    manager_note:meta.managerNote || '',
    director_note:meta.directorNote || '',
    payment_transaction_ref:meta.paymentRef || '',
    paid_amount:Number(meta.paidAmount || 0) || null,
    paid_date:meta.paidDate || null,
    paid_at:null,
    delegated_approver_email:meta.delegatedApproverEmail || null,
    opinion_requested_email:meta.opinionRequestedEmail || null,
    opinion_requested_name:meta.opinionRequestedTo || '',
    opinion_request_note:meta.opinionRequestNote || '',
    opinion_requested_at:meta.opinionRequestedAt || null,
    opinion_status:meta.opinionStatus || 'none',
    opinion_response:meta.opinionResponse || '',
    opinion_responded_at:meta.opinionRespondedAt || null,
    last_action_note:'',
    created_at:meta.createdAt || '',
    updated_at:meta.updatedAt || '',
  };
}
function nextVWorkAdminRequestActions(request, role, currentUser) {
  const status = adminRequestMeta(request).paymentStatus || 'submitted';
  const actions = [];
  if (['submitted','returned'].includes(status) && isAccountingUser(currentUser, role)) {
    actions.push({ action:'accountant_review', label:'Kế toán duyệt', nextStatus:'manager_approved', vsuiteActions:['accountant_review'] });
  }
  if (['accountant_review','manager_approved'].includes(status) && isAdminRequestDecisionOwner(request, role, currentUser)) {
    actions.push({ action:'director_approve', label:'Duyệt', nextStatus:'director_approved' });
  }
  if (status === 'director_approved' && isAccountingUser(currentUser, role)) {
    actions.push({ action:'mark_paid', label:'Xác nhận đã thanh toán', nextStatus:'paid' });
  }
  const canReturnOrReject = (isAccountingUser(currentUser, role) && ['submitted','returned'].includes(status))
    || (isAdminRequestDecisionOwner(request, role, currentUser) && ['accountant_review','manager_approved'].includes(status));
  if (canReturnOrReject) {
    actions.push({ action:'return', label:'Trả lại bổ sung', nextStatus:'returned' });
    actions.push({ action:'reject', label:'Từ chối', nextStatus:'rejected' });
  }
  return actions;
}
function ck(label, done=false, dueAt=''){ return { label, done, dueAt, completedAt:'', completedBy:'' }; }
function progressOf(task){
  if (isTaskDone(task)) return 100;
  return task.checklist.length ? Math.round(task.checklist.filter((item)=>item.done).length / task.checklist.length * 100) : fmtPct(task.complete);
}
function isTaskDone(task){ return task.stage === 'controller_approved' || task.status === 'completed'; }
function isTaskOverdue(task){ return Boolean(task.deadline && !isTaskDone(task) && task.deadline < addDays(0)); }
function getTaskStatus(task){
  if (isTaskDone(task)) return 'completed';
  if (task.stage === 'assignment_returned') return 'returned';
  if (['reported','lead_approved','explain_requested'].includes(task.stage)) return 'pending';
  if (isTaskOverdue(task)) return 'overdue';
  if (task.stage === 'in_progress') return 'in_progress';
  if (task.stage === 'acknowledged') return 'acknowledged';
  if (task.stage === 'assigned') return 'assigned';
  return 'not_started';
}
const TASK_DISPLAY_ORDER = { assigned:0, returned:1, pending:2, overdue:3, in_progress:4, acknowledged:5, not_started:6, completed:7 };
function taskIdValue(task) {
  const numeric = Number(task.id);
  return Number.isFinite(numeric) ? numeric : 0;
}
function taskActivityTime(task) {
  const activity = Array.isArray(task?.activity) ? task.activity : [];
  const lastActivity = activity.reduce((latest, item)=> {
    const value = Date.parse(item?.at || '');
    return Number.isFinite(value) && value > latest ? value : latest;
  }, 0);
  const direct = Math.max(
    Date.parse(task?.updatedAt || '') || 0,
    Date.parse(task?.completedAt || '') || 0,
    lastActivity,
  );
  return Number.isFinite(direct) ? direct : 0;
}
function sortTasksForDisplay(rows) {
  return [...rows].sort((left, right) => {
    const leftStatus = getTaskStatus(left);
    const rightStatus = getTaskStatus(right);
    const completedDelta = Number(leftStatus === 'completed') - Number(rightStatus === 'completed');
    if (completedDelta) return completedDelta;
    const updatedDelta = taskActivityTime(right) - taskActivityTime(left);
    if (updatedDelta) return updatedDelta;
    const statusDelta = (TASK_DISPLAY_ORDER[leftStatus] ?? 9) - (TASK_DISPLAY_ORDER[rightStatus] ?? 9);
    if (statusDelta) return statusDelta;
    return taskIdValue(right) - taskIdValue(left);
  });
}
function filterTasksByStatus(tasks, statusFilter) {
  if (!statusFilter || statusFilter === 'all') return tasks;
  return tasks.filter((task)=>getTaskStatus(task) === statusFilter);
}
function statusCounts(tasks) {
  return tasks.reduce((acc, task)=>{
    const status = getTaskStatus(task);
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, { assigned:0, in_progress:0, pending:0, overdue:0, completed:0, not_started:0 });
}
function isProjectTask(task) {
  return Boolean(task.projectCode && String(task.projectCode).trim() && String(task.projectCode).trim() !== 'Việc chung' && (task.workType || '').toLowerCase() !== 'việc lẻ');
}
function projectWorkGroups(tasks) {
  return [...new Set(tasks.filter(isProjectTask).map((task)=>task.projectCode))].map((projectCode)=>{
    const rows = tasks.filter((task)=>task.projectCode === projectCode);
    const counts = statusCounts(rows);
    const progress = rows.length ? Math.round(rows.reduce((sum, task)=>sum + progressOf(task), 0) / rows.length) : 0;
    const owners = [...new Set(rows.map((task)=>task.ownerName).filter(Boolean))];
    return { projectCode, rows, counts, progress, owners };
  }).sort((left, right)=>right.counts.overdue - left.counts.overdue || right.counts.pending - left.counts.pending || right.rows.length - left.rows.length);
}
function nonProjectWork(tasks) {
  return tasks.filter((task)=>!isProjectTask(task));
}
function resultBlueprint(task) {
  return RESULT_OUTCOME_BLUEPRINTS[task.resultId] || {
    title: task.resultName || task.resultId || 'Kết quả cần đạt',
    criteria:['Có phạm vi rõ', 'Có tiến trình thực hiện', 'Có minh chứng bàn giao'],
    milestones:['Xác nhận phạm vi', 'Triển khai', 'Cập nhật minh chứng', 'Báo cáo kết quả'],
    evidence:'Link minh chứng hoặc ghi chú kết quả',
  };
}
function milestonesForTask(task) {
  const blueprint = resultBlueprint(task);
  const checklistLabels = new Set((task.checklist || []).filter((item)=>item.done).map((item)=>String(item.label || '').toLowerCase()));
  const reportsText = [...(task.reports || []).map((item)=>item.note), task.method, task.evidenceLink, task.deliverableLink].join(' ').toLowerCase();
  return blueprint.milestones.map((label, index)=>{
    const normalized = String(label || '').toLowerCase();
    const done = checklistLabels.has(normalized) || reportsText.includes(normalized) || progressOf(task) >= Math.round(((index + 1) / blueprint.milestones.length) * 100) || isTaskDone(task);
    return { label, done };
  });
}
function outcomeReadiness(task) {
  const milestones = milestonesForTask(task);
  const done = milestones.filter((item)=>item.done).length;
  const hasEvidence = Boolean(task.evidenceLink || task.deliverableLink || (task.reports || []).length);
  const percent = milestones.length ? Math.round((done / milestones.length) * 100) : progressOf(task);
  const missing = milestones.filter((item)=>!item.done).map((item)=>item.label);
  const status = isTaskDone(task) ? 'completed' : isTaskOverdue(task) ? 'danger' : task.stage === 'reported' || task.stage === 'lead_approved' ? 'review' : percent >= 70 && hasEvidence ? 'on_track' : 'working';
  return { percent, milestones, hasEvidence, missing, status, blueprint:resultBlueprint(task) };
}
function managementSignal(task) {
  const readiness = outcomeReadiness(task);
  if (isTaskOverdue(task) || task.risk === 'Critical' || task.traffic === 'Red') return { label:'Cần GĐ xử lý', tone:'b-red', level:'danger' };
  if (['reported','lead_approved','explain_requested'].includes(task.stage) || readiness.percent >= 70 && !readiness.hasEvidence) return { label:'Cần duyệt', tone:'b-amber', level:'warning' };
  if (isTaskDone(task) || readiness.percent >= 80 && readiness.hasEvidence) return { label:'Ổn', tone:'b-green', level:'ok' };
  return { label:'Đang theo dõi', tone:'b-blue', level:'info' };
}
function enterpriseHardGateDecision(task) {
  const readiness = checkpointReadiness2406(task);
  const outcome = outcomeReadiness(task);
  const missingCheckpoints = readiness.checkpoints.filter((item)=>!item.done).map((item)=>item.label);
  const blockers = [];
  if (missingCheckpoints.length && ['reported','lead_approved'].includes(task.stage)) blockers.push(`Chưa đủ checkpoint: ${missingCheckpoints.slice(0, 3).join(', ')}`);
  if (!outcome.hasEvidence && ['reported','lead_approved'].includes(task.stage)) blockers.push('Thiếu minh chứng kết quả trước khi duyệt.');
  if (task.risk === 'Critical' && task.stage !== 'explain_requested') blockers.push('Risk Critical cần chỉ đạo hoặc giải trình trước khi đóng.');
  if (isTaskOverdue(task) && task.stage !== 'explain_requested') blockers.push('Công việc quá hạn cần cập nhật xử lý trước khi duyệt.');
  const hardGateBlock = blockers.length > 0;
  return {
    hardGateBlock,
    blockers,
    step: readiness.step,
    percent: Math.min(readiness.percent, outcome.percent),
    tone: hardGateBlock ? 'b-red' : outcome.percent >= 80 && outcome.hasEvidence ? 'b-green' : 'b-amber',
    label: hardGateBlock ? 'Bị chặn bởi hard gate' : 'Đủ điều kiện chuyển duyệt',
  };
}
function escalationLevel(task) {
  const signal = managementSignal(task);
  const gate = enterpriseHardGateDecision(task);
  const reminderOpen = (task.reminders || []).filter((item)=>!item.done).length;
  if (signal.level === 'danger' || gate.hardGateBlock) return { level:'director', label:'Cần giám đốc chỉ đạo', tone:'b-red', score:3 };
  if (signal.level === 'warning' || reminderOpen) return { level:'manager', label:'Cần quản lý duyệt', tone:'b-amber', score:2 };
  if (getTaskStatus(task) === 'assigned') return { level:'owner', label:'Cần owner nhận việc', tone:'b-blue', score:1 };
  return { level:'normal', label:'Đang kiểm soát', tone:'b-green', score:0 };
}
function scoreComposite(owner, tasks) {
  const metrics = workloadMetrics(owner, tasks);
  const completed = metrics.tasks.filter((task)=>isTaskDone(task)).length;
  const onTime = metrics.tasks.filter((task)=>isTaskDone(task) && !isTaskOverdue(task)).length;
  const reviewPenalty = metrics.review * 4 + metrics.urgent * 9 + metrics.missingEvidence * 3;
  const resultScore = metrics.outcomeAvg;
  const deliveryScore = metrics.total ? Math.round((completed / metrics.total) * 100) : 0;
  const onTimeScore = metrics.total ? Math.round((onTime / metrics.total) * 100) : 0;
  const score = Math.max(0, Math.min(100, Math.round(resultScore * 0.45 + deliveryScore * 0.35 + onTimeScore * 0.2 - reviewPenalty)));
  return { ...metrics, completed, onTime, resultScore, deliveryScore, onTimeScore, reviewPenalty, score };
}
function taskEffortWeight(task) {
  const priorityWeight = { Low:1, Medium:2, High:3, Critical:4 }[task.priority] || 2;
  const riskWeight = { Low:0, Medium:1, High:2, Critical:3 }[task.risk] || 1;
  const readiness = outcomeReadiness(task);
  const signal = managementSignal(task);
  const reviewWeight = signal.level === 'warning' ? 2 : signal.level === 'danger' ? 3 : 0;
  const evidenceWeight = readiness.hasEvidence ? 0 : 1;
  const progressRelief = Math.floor(readiness.percent / 35);
  return Math.max(1, priorityWeight + riskWeight + reviewWeight + evidenceWeight - progressRelief);
}
function workloadLoadScore(metrics) {
  if (!metrics.total) return 0;
  const raw = metrics.effortPoints * 6 + metrics.urgent * 12 + metrics.review * 8 + metrics.missingEvidence * 5 + Math.max(0, 70 - metrics.outcomeAvg) * 0.25;
  return Math.max(0, Math.min(100, Math.round(raw)));
}
function workloadMetrics(owner, tasks) {
  const ownerTasks = tasks.filter((task)=>taskBelongsToOwner(task, owner));
  const activeTasks = ownerTasks.filter((task)=>!isTaskDone(task));
  const urgentTasks = ownerTasks.filter((task)=>managementSignal(task).level === 'danger');
  const reviewTasks = ownerTasks.filter((task)=>managementSignal(task).level === 'warning');
  const missingEvidenceTasks = ownerTasks.filter((task)=>!outcomeReadiness(task).hasEvidence && !isTaskDone(task));
  const outcomeAvg = ownerTasks.length ? Math.round(ownerTasks.reduce((sum, task)=>sum + outcomeReadiness(task).percent, 0) / ownerTasks.length) : 0;
  const effortPoints = activeTasks.reduce((sum, task)=>sum + taskEffortWeight(task), 0);
  const metrics = {
    owner,
    tasks: ownerTasks,
    activeTasks,
    urgentTasks,
    reviewTasks,
    missingEvidenceTasks,
    total: ownerTasks.length,
    active: activeTasks.length,
    urgent: urgentTasks.length,
    review: reviewTasks.length,
    missingEvidence: missingEvidenceTasks.length,
    outcomeAvg,
    effortPoints,
  };
  return { ...metrics, load: workloadLoadScore(metrics) };
}
function outcomeSummary(tasks) {
  const grouped = tasks.reduce((acc, task)=>{
    const readiness = outcomeReadiness(task);
    const signal = managementSignal(task);
    const key = task.resultId || task.resultName || 'OUTCOME';
    if (!acc[key]) acc[key] = { key, title:readiness.blueprint.title, tasks:0, progress:0, danger:0, review:0, done:0, examples:[] };
    acc[key].tasks += 1;
    acc[key].progress += readiness.percent;
    acc[key].danger += signal.level === 'danger' ? 1 : 0;
    acc[key].review += signal.level === 'warning' ? 1 : 0;
    acc[key].done += isTaskDone(task) ? 1 : 0;
    if (acc[key].examples.length < 2 && signal.level !== 'ok') acc[key].examples.push(task.title);
    return acc;
  }, {});
  return Object.values(grouped).map((row)=>({ ...row, progress:row.tasks ? Math.round(row.progress / row.tasks) : 0 }));
}
function ownerEmails(ownerId) {
  const direct = String(ownerId || '').trim().toLowerCase();
  const matched = MASTER.users.filter((user)=>user.ownerIds?.map(String).includes(String(ownerId)) || String(user.id || '') === String(ownerId) || String(user.email || '').toLowerCase() === direct).map((user)=>user.email);
  return [...new Set([...(direct.includes('@') ? [direct] : []), ...matched].filter(Boolean))];
}
function roleEmails(roles) {
  const roleSet = new Set(roles);
  return MASTER.users.filter((user)=>user.roles?.some((role)=>roleSet.has(role))).map((user)=>user.email);
}
function reviewerEmailsForTask(task) {
  const reviewerOwnerIds = reviewerOwnerIdsForTask(task);
  const delegated = taskReviewerDelegation(task).active ? ownerEmails(task.reviewerDelegateOwnerId) : [];
  if (reviewerOwnerIds.length || delegated.length) return [...new Set([...reviewerOwnerIds.flatMap((ownerId)=>ownerEmails(ownerId)), ...delegated])];
  return [];
}
function participantEmailsForTask(task) {
  return [...new Set(participantOwnerIdsForTask(task).flatMap((ownerId)=>ownerEmails(ownerId)))];
}
function notificationRecipientsForTask(task, eventType) {
  if (eventType === 'assigned' || eventType === 'explain_requested' || eventType === 'overdue') return [...new Set([...ownerEmails(task.ownerId), ...participantEmailsForTask(task)])];
  if (eventType === 'assignment_returned') return reviewerEmailsForTask(task).length ? reviewerEmailsForTask(task) : roleEmails(['vplanning_director','vplanning_admin']);
  if (eventType === 'reported' || eventType === 'lead_approved') return reviewerEmailsForTask(task).length ? reviewerEmailsForTask(task) : roleEmails(['vplanning_director','vplanning_admin']);
  if (eventType === 'completed') return [...new Set([
    ...ownerEmails(task.ownerId),
    ...participantEmailsForTask(task),
    ...reviewerEmailsForTask(task),
    ...roleEmails(['vplanning_admin','vplanning_director']),
  ])];
  return ownerEmails(task.ownerId);
}
function makeNotification({ task, toEmail, title, body, kind='info', eventType, eventKey='' }) {
  const occurrenceKey = String(eventKey || '').replace(/[^a-z0-9]+/gi,'_');
  return {
    id: `VPL-${eventType}-${task.id}-${String(toEmail || 'all').replace(/[^a-z0-9]+/gi,'_')}${occurrenceKey ? `-${occurrenceKey}` : ''}`,
    toEmail,
    title,
    body,
    kind,
    read:false,
    entityType:'task',
    entityId:String(task.id),
    linkPage:'vplanning',
    metadata:{ module:'vplanning', taskId:task.id, projectCode:task.projectCode || '', status:getTaskStatus(task), eventType },
    createdAt:new Date().toISOString(),
    emailStatus:'pending',
  };
}
async function dispatchVPlanningEmailNotice(notification) {
  const token = String(readAuthSessionSnapshot()?.access_token || '').trim();
  if (!token || !notification.toEmail) return { ok:false, status:'skipped', error:'Missing session token or recipient email.' };
  const response = await fetch(NOTICE_DISPATCH_API, {
    method:'POST',
    headers:{ 'Content-Type':'application/json', Accept:'application/json', Authorization:`Bearer ${token}` },
    body:JSON.stringify({
      eventType:'vplanning_notification',
      title:notification.title,
      body:notification.body,
      level:notification.kind,
      linkPage:'vplanning',
      persistInApp:false,
      recipientEmails:[notification.toEmail],
      eventKey:notification.id,
      metadata:notification.metadata,
    }),
  });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}
function mergeNotifications(existing, incoming) {
  const byId = new Map();
  [...existing, ...incoming].forEach((item)=> {
    if (!item?.id) return;
    const previous = byId.get(item.id);
    byId.set(item.id, {
      ...(previous || {}),
      ...item,
      createdAt:previous?.createdAt || item.createdAt,
      emailStatus:previous?.emailStatus && previous.emailStatus !== 'pending' ? previous.emailStatus : item.emailStatus,
    });
  });
  return [...byId.values()].sort((left,right)=>String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}
function buildVPlanningNotifications(tasks, currentUser, storedNotifications = [], role = DEFAULT_ROLE) {
  const email = String(currentUser?.email || '').toLowerCase();
  const base = storedNotifications.filter((item)=>!item.toEmail || String(item.toEmail).toLowerCase() === email);
  const readState = new Map(base.map((item)=>[item.id, Boolean(item.read)]));
  const generated = [];
  const visible = getVisibleTasks(tasks, role, currentUser?.name || '', currentUser);
  visible.forEach((task)=>{
    if (task.stage === 'assigned' && (task.ownerName === currentUser?.name || currentUser?.ownerIds?.includes(task.ownerId))) {
      generated.push(makeNotification({ task, toEmail:email, title:'Bạn có việc mới được giao', body:task.title, kind:'info', eventType:'assigned' }));
    }
    if (isTaskOverdue(task)) {
      generated.push(makeNotification({ task, toEmail:email, title:'Công việc quá hạn', body:`${task.title} · hạn ${task.deadline}`, kind:'danger', eventType:'overdue' }));
    }
    if (task.stage === 'reported' && can(role, 'approve_team') && isTaskForCurrentReviewer(task, role, currentUser)) {
      generated.push(makeNotification({ task, toEmail:email, title:'Có việc chờ quản lý duyệt', body:task.title, kind:'warning', eventType:'reported' }));
    }
    if (task.stage === 'lead_approved' && can(role, 'control_review')) {
      generated.push(makeNotification({ task, toEmail:email, title:'Có việc chờ KSV xác nhận', body:task.title, kind:'warning', eventType:'lead_approved' }));
    }
    if (task.stage === 'explain_requested' && (task.ownerName === currentUser?.name || currentUser?.ownerIds?.includes(task.ownerId))) {
      generated.push(makeNotification({ task, toEmail:email, title:'Cần giải trình công việc', body:task.title, kind:'danger', eventType:'explain_requested' }));
    }
  });
  tasks.forEach((task)=>{
    const adminMeta = isVWorkAdminRequest(task) ? adminRequestMeta(task) : null;
    const proposal = isVWorkProposalRequestTask(task) ? proposalRequestTaskToRequest(task) : null;
    const requestedEmail = String(adminMeta?.opinionRequestedEmail || proposal?.opinionRequestedEmail || '').trim().toLowerCase();
    const opinionStatus = adminMeta?.opinionStatus || proposal?.opinionStatus;
    if (requestedEmail && requestedEmail === email && opinionStatus === 'pending') {
      generated.push(makeNotification({ task, toEmail:email, title:'Bạn được đề nghị cho ý kiến', body:task.title, kind:'warning', eventType:'opinion_requested', eventKey:adminMeta?.opinionRequestedAt || proposal?.opinionRequestedAt || '' }));
    }
  });
  return mergeNotifications(base, generated.map((item)=>({ ...item, read: readState.get(item.id) || false }))).slice(0, 50);
}
function normalizeHeader(value){ return String(value || '').trim(); }
function mapRow(headers, row){
  return headers.reduce((acc, header, index) => {
    acc[header] = row[index] ?? '';
    return acc;
  }, {});
}
function templateRow(projectCode, customer, group, title, job, owner, offset, priority='Medium', risk='Medium', objective='OBJ-001', result='RES-005', checklist=[]){
  const ownerInfo = ownerById(owner) || MASTER.owners[0];
  const objectiveInfo = MASTER.objectives.find(([id])=>id===objective);
  const resultInfo = MASTER.results.find(([id])=>id===result);
  return {
    stt:'', projectCode, customer, group, title, workType:'Dự án', workCode: uid('CV').toUpperCase(), keyObjective:objectiveInfo?.[1] || '',
    objectiveId: objective, resultName:resultInfo?.[1] || '', resultId: result, ownerLead:ownerInfo.name, ownerId: owner, ownerName: ownerInfo.name, participants:'', deadline: addDays(offset), jobCode: job,
    okrCode:`${objective}-${result}`,
    status:'assigned', priority, complete:0, predecessor:'', deliverable:'', approvalBy:'deptlead', risk,
    sourceModule:'vplanning', sourceId:projectCode, sourceUrl:'', deliverableLink:'',
    traffic: risk === 'High' || risk === 'Critical' ? 'Amber' : 'Green',
    checklist: checklist.length ? checklist : ['Xác nhận phạm vi', 'Thực hiện', 'Bàn giao minh chứng'],
    errors: [],
  };
}
const PROJECT_TEMPLATES = [
  {
    id:'ai-enterprise', name:'Dự án đào tạo AI doanh nghiệp', tone:'b-blue',
    desc:'Từ khởi động, chuẩn bị nội dung, giảng viên, lớp học, triển khai đến tổng hợp kết quả.',
    rows:(meta)=>[
      templateRow(meta.code, meta.customer, 'Khởi động', 'Chốt phạm vi, lịch và đầu mối dự án', 'JOB-PM', 'PPO-003', 0, 'High', 'Medium', 'OBJ-001', 'RES-005', ['Kickoff', 'Xác nhận phạm vi', 'Chốt timeline']),
      templateRow(meta.code, meta.customer, 'Nội dung', 'Chuẩn bị khung chương trình và tài liệu chính', 'JOB-CONTENT', 'PPO-005', 7, 'High', 'Medium', 'OBJ-004', 'RES-004', ['Khung chương trình', 'Tài liệu chính', 'Review nội bộ']),
      templateRow(meta.code, meta.customer, 'Giảng viên', 'Chốt giảng viên và lịch briefing', 'JOB-FACULTY', 'PPO-003', 12, 'Medium', 'Medium', 'OBJ-002', 'RES-002', ['Danh sách giảng viên', 'Briefing', 'Chạy thử']),
      templateRow(meta.code, meta.customer, 'LMS', 'Chuẩn bị lớp học và tài khoản học viên', 'JOB-LMS', 'PPO-006', 14, 'High', 'High', 'OBJ-003', 'RES-003', ['Import học viên', 'Tạo lớp', 'Test đăng nhập']),
      templateRow(meta.code, meta.customer, 'Nghiệm thu', 'Tổng hợp báo cáo và minh chứng bàn giao', 'JOB-PM', 'PPO-003', 28, 'High', 'Medium', 'OBJ-005', 'RES-006', ['Báo cáo', 'Minh chứng', 'Biên bản nghiệm thu']),
    ],
  },
  {
    id:'leadership-coaching', name:'Dự án coaching lãnh đạo doanh nghiệp', tone:'b-purple',
    desc:'Tạo kế hoạch coaching: chốt mục tiêu, thu thông tin người học, phân coach, theo dõi phiên và báo cáo kết quả.',
    rows:(meta)=>[
      templateRow(meta.code, meta.customer, 'Khởi động', 'Chốt mục tiêu coaching với khách hàng', 'JOB-CUSTOMER', 'PPO-003', 0, 'High', 'Medium', 'OBJ-001', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Thông tin đầu vào', 'Thu thập hồ sơ người tham gia và nhu cầu phát triển', 'JOB-PM', 'PPO-003', 5, 'Medium', 'Medium', 'OBJ-001', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Coach', 'Phân công coach và chốt lịch phiên', 'JOB-FACULTY', 'PPO-003', 8, 'High', 'Medium', 'OBJ-002', 'RES-002'),
      templateRow(meta.code, meta.customer, 'Triển khai', 'Theo dõi phiên coaching và ghi chú tiến bộ', 'JOB-PM', 'PPO-005', 21, 'Medium', 'Medium', 'OBJ-005', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Báo cáo', 'Tổng hợp kết quả coaching và gửi khách hàng', 'JOB-PM', 'PPO-003', 35, 'High', 'Medium', 'OBJ-005', 'RES-006'),
    ],
  },
  {
    id:'behavior-standard', name:'Dự án đào tạo Chuẩn mực hành vi', tone:'b-green',
    desc:'Chuẩn hóa khung hành vi, học liệu, facilitator, logistics, cam kết hành động và đánh giá sau lớp.',
    rows:(meta)=>[
      templateRow(meta.code, meta.customer, 'Khung hành vi', 'Chốt chuẩn mực hành vi và tình huống mẫu', 'JOB-CONTENT', 'PPO-005', 0, 'High', 'Medium', 'OBJ-004', 'RES-004'),
      templateRow(meta.code, meta.customer, 'Học liệu', 'Bản địa hóa nội dung và slide facilitator', 'JOB-CONTENT', 'PPO-007', 7, 'High', 'Medium', 'OBJ-004', 'RES-004'),
      templateRow(meta.code, meta.customer, 'Vận hành', 'Chuẩn bị lớp, học viên và hậu cần', 'JOB-LOGISTICS', 'PPO-003', 10, 'Medium', 'Medium', 'OBJ-001', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Triển khai', 'Tổ chức lớp và thu cam kết hành động', 'JOB-OPS', 'PPO-003', 14, 'High', 'Medium', 'OBJ-005', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Đánh giá', 'Tổng hợp khảo sát và báo cáo kết quả', 'JOB-PM', 'PPO-003', 17, 'Medium', 'Low', 'OBJ-005', 'RES-006'),
    ],
  },
  {
    id:'elearning-1000', name:'Dự án đào tạo elearning chuỗi 20 lớp / 1000 học viên', tone:'b-red',
    desc:'Kế hoạch nhiều lớp: danh sách học viên, lớp học, học liệu, chạy thử và hỗ trợ trong quá trình học.',
    rows:(meta)=>[
      templateRow(meta.code, meta.customer, 'Kế hoạch lớp', 'Lập lịch các lớp và phân nhóm học viên', 'JOB-PM', 'PPO-003', 0, 'Critical', 'High', 'OBJ-001', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Danh sách học viên', 'Nhập danh sách học viên và chia nhóm/lớp', 'JOB-OPS', 'PPO-006', 5, 'Critical', 'High', 'OBJ-001', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Lớp học', 'Kiểm tra lớp học và tài khoản học viên', 'JOB-LMS', 'PPO-006', 7, 'Critical', 'High', 'OBJ-003', 'RES-003'),
      templateRow(meta.code, meta.customer, 'Học liệu', 'Đóng gói học liệu và bài thu hoạch', 'JOB-ELEARNING', 'PPO-005', 10, 'High', 'Medium', 'OBJ-004', 'RES-004'),
      templateRow(meta.code, meta.customer, 'Chạy thử', 'Chạy thử quy trình học trước khi mở lớp', 'JOB-OPS', 'PPO-006', 14, 'Critical', 'High', 'OBJ-003', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Hỗ trợ', 'Chuẩn bị người hỗ trợ và cách ghi nhận vướng mắc', 'JOB-OPS', 'PPO-003', 16, 'High', 'Medium', 'OBJ-005', 'RES-005'),
    ],
  },
  {
    id:'petrolimex-cx', name:'Dự án đào tạo Trải nghiệm khách hàng Cửa hàng trưởng Petrolimex', tone:'b-amber',
    desc:'Thiết kế tình huống CX, logistics vùng, facilitator briefing, lớp cửa hàng trưởng và action plan.',
    rows:(meta)=>[
      templateRow(meta.code, meta.customer, 'Khung trải nghiệm', 'Chốt khung trải nghiệm khách hàng và tình huống cửa hàng', 'JOB-CONTENT', 'PPO-005', 0, 'High', 'Medium', 'OBJ-004', 'RES-004'),
      templateRow(meta.code, meta.customer, 'Danh sách học viên', 'Chuẩn hóa danh sách Cửa hàng trưởng theo vùng', 'JOB-OPS', 'PPO-003', 5, 'High', 'Medium', 'OBJ-001', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Giảng viên', 'Gửi thông tin lớp và thực hành tình huống', 'JOB-FACULTY', 'PPO-003', 8, 'Medium', 'Medium', 'OBJ-002', 'RES-002'),
      templateRow(meta.code, meta.customer, 'Triển khai lớp', 'Tổ chức lớp CX và thu action plan', 'JOB-OPS', 'PPO-003', 14, 'High', 'Medium', 'OBJ-005', 'RES-005'),
      templateRow(meta.code, meta.customer, 'Nghiệm thu', 'Báo cáo kết quả và đề xuất theo dõi sau lớp', 'JOB-PM', 'PPO-003', 18, 'High', 'Low', 'OBJ-005', 'RES-006'),
    ],
  },
];
const seedTasks = [];
const DEFAULT_VWORK_FORM_TEMPLATES = [
  {
    id:'vwork-form-weekly-spc-vnpt',
    name:'Kế hoạch công việc tuần SPC VNPT',
    fileName:'Ke_hoach_cong_viec_tuan_SPC_VNPT.docx',
    fileType:'docx',
    size:36333,
    roleScope:VWORK_FORM_ROLE_SCOPE,
    source:'project content/vwork/form',
    uploadedBy:'system',
    uploadedAt:'2026-07-06T17:00:07+07:00',
  },
  {
    id:'vwork-form-work-info',
    name:'Mẫu thông tin công việc',
    fileName:'Mẫu thông tin công việc.xlsx',
    fileType:'xlsx',
    size:17155,
    roleScope:VWORK_FORM_ROLE_SCOPE,
    source:'project content/vwork/form',
    uploadedBy:'system',
    uploadedAt:'2026-07-07T09:16:28+07:00',
  },
];
function normalizeVWorkFormName(value) {
  return String(value || '').trim().toLowerCase().normalize('NFC');
}
function mergeVWorkForms(forms = []) {
  const merged = [];
  const seen = new Set();
  [...DEFAULT_VWORK_FORM_TEMPLATES, ...(Array.isArray(forms) ? forms : [])].forEach((item, index)=>{
    const fileName = String(item?.fileName || item?.name || '').trim();
    if (!fileName) return;
    const key = normalizeVWorkFormName(fileName);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({
      id:item.id || `vwork-form-${index + 1}`,
      name:item.name || fileName.replace(/\.[^.]+$/, ''),
      fileName,
      fileType:String(item.fileType || fileName.split('.').pop() || '').toLowerCase(),
      size:Number(item.size || 0) || 0,
      roleScope:Array.isArray(item.roleScope) && item.roleScope.length ? item.roleScope : VWORK_FORM_ROLE_SCOPE,
      source:item.source || 'vwork_upload',
      uploadedBy:item.uploadedBy || '',
      uploadedAt:item.uploadedAt || new Date().toISOString(),
    });
  });
  return merged;
}

function validateRows(rows){
  return rows.map((row) => {
    const errors = [];
    const excluded = row.importAction === 'skip' && row.excludedReason;
    if (!excluded) {
      if (!row.projectCode) errors.push('Thiếu Mã dự án');
      if (!row.title) errors.push('Thiếu Công việc cụ thể');
      if (!row.ownerId) errors.push(row.ownerName ? `Chưa ánh xạ người chủ trì: ${row.ownerName}` : 'Thiếu người chủ trì');
      const isDirectorOwner = MASTER.users.some((user)=>user.email === row.ownerId && (user.roles || []).includes('vplanning_director'));
      if (row.ownerId && !ownerById(row.ownerId) && !isDirectorOwner) errors.push(`Owner_ID không hợp lệ: ${row.ownerId}`);
      if (!row.deadline) errors.push('Thiếu Deadline');
      if (row.jobCode && !jobExists(row.jobCode)) errors.push(`Mã Job không hợp lệ: ${row.jobCode}`);
      if (row.objectiveId && !objectiveExists(row.objectiveId)) errors.push(`Objective_ID không hợp lệ: ${row.objectiveId}`);
      if (row.resultId && !resultExists(row.resultId)) errors.push(`Result_ID không hợp lệ: ${row.resultId}`);
      if (!PRIORITIES.includes(row.priority)) errors.push(`Priority không hợp lệ: ${row.priority || '(trống)'}`);
      if (!RISKS.includes(row.risk)) errors.push(`Risk Level không hợp lệ: ${row.risk || '(trống)'}`);
      if (!LIGHTS.includes(row.traffic)) errors.push(`Traffic Light không hợp lệ: ${row.traffic || '(trống)'}`);
      if (fmtPct(row.complete) !== Number(row.complete || 0)) errors.push('% Complete phải từ 0 đến 100');
    }
    return { ...row, errors };
  });
}
export function importTaskFingerprint(task) {
  return [task?.projectCode, task?.group, task?.title, task?.ownerId || task?.ownerName]
    .map((value)=>normalizeText(value).replace(/\s+/g, ' '))
    .join('|');
}
function classifyImportRows(rows, existingTasks) {
  const existingByFingerprint = new Map((existingTasks || []).map((task)=>[importTaskFingerprint(task), task]));
  return (rows || []).map((row)=>{
    if (row.excludedReason) return { ...row, importAction:'skip', duplicateTaskId:'', duplicateStatus:'excluded' };
    const duplicate = existingByFingerprint.get(importTaskFingerprint(row));
    if (!duplicate) return { ...row, importAction:row.importAction === 'skip' ? 'create' : (row.importAction || 'create'), duplicateTaskId:'', duplicateStatus:'new' };
    return {
      ...row,
      importAction:row.importAction === 'update' || row.importAction === 'copy' ? row.importAction : 'skip',
      duplicateTaskId:duplicate.id,
      duplicateStatus:'duplicate',
      warnings:[...new Set([...(row.warnings || []), `Trùng với việc #${duplicate.id}; mặc định bỏ qua để không tạo duplicate.`])],
    };
  });
}
function convertWorkbookRows(rawRows){
  return validateRows(rawRows.map((item) => {
    const owner = ownerById(String(item.Owner_ID || '').trim());
    return {
      stt:String(item.STT || '').trim(),
      projectCode:String(item['Mã dự án'] || '').trim(),
      customer:String(item['Khách hàng'] || '').trim(),
      group:String(item['Nhóm công việc'] || '').trim(),
      title:String(item['Công việc cụ thể'] || '').trim(),
      workType:String(item['Loại công việc'] || 'Dự án').trim(),
      workCode:String(item['Mã công việc'] || uid('CV')).trim(),
      keyObjective:String(item['Key Objective'] || '').trim(),
      objectiveId:String(item.Objective_ID || '').trim(),
      resultName:String(item.Result || '').trim(),
      resultId:String(item.Result_ID || '').trim(),
      ownerLead:String(item['Chủ trì'] || '').trim(),
      ownerId:String(item.Owner_ID || '').trim(),
      ownerName:owner?.name || String(item['Chủ trì'] || '').trim(),
      participants:String(item['Tham gia'] || '').trim(),
      deadline:String(item.Deadline || '').slice(0,10),
      jobCode:String(item['Mã Job'] || '').trim(),
      okrCode:String(item['Mã OKR'] || '').trim(),
      status:String(item.Status || 'assigned').trim() || 'assigned',
      priority:String(item.Priority || 'Medium').trim(),
      complete:fmtPct(item['% Complete']),
      predecessor:String(item['Predecessor Task'] || '').trim(),
      deliverable:String(item['Deliverable Link'] || '').trim(),
      deliverableLink:String(item['Deliverable Link'] || '').trim(),
      approvalBy:String(item['Approval By'] || 'deptlead').trim(),
      risk:String(item['Risk Level'] || 'Medium').trim(),
      traffic:String(item['Traffic Light'] || 'Green').trim(),
      sourceModule:'vplanning',
      sourceId:String(item['Mã dự án'] || '').trim(),
      sourceUrl:'',
      checklist:['Xác nhận phạm vi', 'Thực hiện', 'Bàn giao minh chứng'],
    };
  }));
}
function decodeDocxXmlText(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
function docxCellText(xml) {
  return decodeDocxXmlText([...String(xml || '').matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match)=>match[1]).join(''))
    .replace(/\s+/g, ' ')
    .trim();
}
function docxJobCodeFor(group, title) {
  const text = `${group || ''} ${title || ''}`.toLowerCase();
  if (text.includes('lms') || text.includes('vlearning') || text.includes('game')) return 'JOB-LMS';
  if (text.includes('học liệu') || text.includes('scorm') || text.includes('video') || text.includes('slide')) return 'JOB-CONTENT';
  if (text.includes('test') || text.includes('qc') || text.includes('lỗi')) return 'JOB-QA';
  if (text.includes('báo cáo') || text.includes('tiến độ')) return 'JOB-OPS';
  return 'JOB-PM';
}
function excelDateToIso(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0,10);
  if (typeof value === 'number') {
    const date = new Date(Math.round((value - 25569) * 86400 * 1000));
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0,10);
  }
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0,10);
  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  return '';
}
function canonicalImportHeader(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');
}
function simpleWorkbookValue(item, canonicalNames) {
  const found = Object.entries(item || {}).find(([key])=>canonicalNames.includes(canonicalImportHeader(key)));
  return found ? found[1] : '';
}
const FLEX_IMPORT_COLUMNS = {
  stt:['stt','so thu tu'],
  project:['ma du an','ten du an','du an','project','project code'],
  customer:['khach hang','ten khach hang','customer','client'],
  parentGroup:['nhom cong viec cha','nhom cong viec','nhom nhiem vu','nhom viec','workstream','group'],
  childGroup:['nhom cong viec con','hang muc','hang muc cong viec','phan viec'],
  title:['ten cong viec','ten cong viec cu the','cong viec cu the','cong viec','noi dung cong viec','task','task name'],
  result:['ket qua can dat','ket qua can hoan thanh','ket qua','deliverable','output'],
  checkpoint:['diem kiem soat cong viec','checkpoint','diem kiem soat'],
  note:['ghi chu','note','notes'],
  owner:['nguoi chu tri','chu tri','nguoi phu trach chinh','phu trach chinh','phu trach','owner','assignee'],
  participants:['nguoi tham gia','tham gia','tham gia va ' + 'ph' + 'oi hop','nguoi ' + 'ph' + 'oi hop','ph' + 'oi ' + 'hop','participants'],
  startDate:['ngay bat dau','start date','start'],
  deadline:['deadline','han hoan thanh','han can xu ly','moc uu tien','thoi han','thoi gian','ngay thuc hien','lich thuc hien','han','due date'],
  expectedHours:['so gio du kien','gio du kien','estimated hours'],
  actualHours:['so gio thuc te','gio thuc te','actual hours'],
  priority:['muc do uu tien','priority','uu tien'],
  status:['trang thai','status'],
  jobCode:['ma loai cv','ma job','job code'],
};
const IMPORT_MAPPING_FIELDS = [
  { key:'stt', label:'STT' },
  { key:'project', label:'Dự án' },
  { key:'customer', label:'Khách hàng' },
  { key:'parentGroup', label:'Nhóm công việc' },
  { key:'childGroup', label:'Hạng mục / nhóm con' },
  { key:'title', label:'Tên công việc', required:true },
  { key:'result', label:'Kết quả cần đạt' },
  { key:'checkpoint', label:'Điểm kiểm soát' },
  { key:'note', label:'Ghi chú' },
  { key:'owner', label:'Người chủ trì', required:true },
  { key:'participants', label:'Người phối hợp' },
  { key:'startDate', label:'Ngày bắt đầu' },
  { key:'deadline', label:'Deadline' },
  { key:'expectedHours', label:'Số giờ dự kiến' },
  { key:'actualHours', label:'Số giờ thực tế' },
  { key:'priority', label:'Mức ưu tiên' },
  { key:'status', label:'Trạng thái' },
  { key:'jobCode', label:'Mã loại việc' },
];
function detectImportColumnMapping(headers) {
  return Object.fromEntries(IMPORT_MAPPING_FIELDS.map(({ key })=>[
    key,
    (headers || []).find((header)=>FLEX_IMPORT_COLUMNS[key]?.includes(canonicalImportHeader(header))) || '',
  ]));
}
function mapRowsWithImportMapping(rows, mapping) {
  return (rows || []).map((item)=>{
    const mapped = { __sourceRow:item.__sourceRow };
    for (const { key } of IMPORT_MAPPING_FIELDS) {
      const sourceHeader = mapping?.[key];
      if (sourceHeader) mapped[FLEX_IMPORT_COLUMNS[key][0]] = item[sourceHeader];
    }
    return mapped;
  });
}
function unmappedImportHeaders(headers, mapping) {
  const used = new Set(Object.values(mapping || {}).filter(Boolean));
  return [...new Set((headers || []).filter((header)=>header && !used.has(header)))];
}
const IMPORT_PROFILE = {
  assignment:{ id:'assignment', label:'Phân công dự án', description:'Giữ nguyên chủ trì, người phối hợp, kết quả cần đạt và mốc deadline trong Excel.' },
  library:{ id:'library', label:'Thư viện mẫu công việc', description:'Chọn dự án, người phụ trách và thời hạn trước khi tạo việc từ danh mục mẫu.' },
  generic:{ id:'generic', label:'Import linh hoạt', description:'Ánh xạ các cột công việc gần nghĩa và yêu cầu xác nhận các trường còn thiếu.' },
  standard:{ id:'standard', label:'Template V-Work', description:'Workbook theo template chuẩn V-Work.' },
};
function flexValue(item, names) {
  return simpleWorkbookValue(item, names);
}
export function detectWorkbookProfile(headers) {
  const keys = new Set((headers || []).map(canonicalImportHeader).filter(Boolean));
  const has = (name)=>keys.has(name);
  if (has('ten cong viec') && has('nhom cong viec cha') && (has('so gio du kien') || has('nhom cong viec con'))) return IMPORT_PROFILE.library;
  if ((has('ten du an') || has('ma du an')) && (has('nhom nhiem vu') || has('nhom cong viec')) && (has('ten cong viec cu the') || has('cong viec cu the')) && has('chu tri')) return IMPORT_PROFILE.assignment;
  return IMPORT_PROFILE.generic;
}
function findFlexibleHeaderRow(rows) {
  let best = { index:0, score:-1 };
  (rows || []).slice(0, 12).forEach((row, index)=>{
    const keys = new Set((row || []).map(canonicalImportHeader).filter(Boolean));
    const score = Object.values(FLEX_IMPORT_COLUMNS).reduce((sum, names)=>sum + (names.some((name)=>keys.has(name)) ? 1 : 0), 0);
    if (score > best.score) best = { index, score };
  });
  return best.score >= 2 ? best.index : 0;
}
function hasSimpleWorkbookHeaders(headers) {
  const keys = new Set((headers || []).map(canonicalImportHeader));
  return keys.has('ten cong viec') && keys.has('nguoi chu tri');
}
function priorityFromVWorkForm(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('không quan trọng') && text.includes('không khẩn cấp')) return 'Low';
  if (text.includes('khẩn cấp') || text.includes('quan trọng')) return 'High';
  return 'Medium';
}
function statusFromVWorkForm(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('hoàn thành')) return 'controller_approved';
  if (text.includes('đang')) return 'in_progress';
  return 'assigned';
}
const IMPORT_OWNER_ALIASES = new Map([
  ['ms hanh','Hạnh Vũ'], ['chi hanh','Hạnh Vũ'], ['hanh vu','Hạnh Vũ'],
  ['ms ba','Ba Nguyễn'], ['chi ba','Ba Nguyễn'], ['ba nguyen','Ba Nguyễn'],
  ['mr huyen','Huyên Vũ'], ['anh huyen','Huyên Vũ'], ['huyen vu','Huyên Vũ'],
  ['ms ngoc','Ngọc Phạm'], ['chi ngoc','Ngọc Phạm'], ['ngoc pham','Ngọc Phạm'],
  ['mr nam','Nam Phạm'], ['anh nam','Nam Phạm'], ['nam pham','Nam Phạm'],
  ['giam doc peopleone','Hải Lê'], ['giam doc hai le','Hải Lê'], ['hai le','Hải Lê'],
]);
function isExternalVWorkPerson(value) {
  const text = normalizeText(value);
  return text.includes('coach/giang vien') || text === 'coach' || text === 'giang vien';
}
export function resolveImportOwner(name) {
  const raw = String(name || '').trim();
  if (!raw) return { id:'', name:'', resolved:false, external:false };
  if (isExternalVWorkPerson(raw)) return { id:'', name:raw, resolved:false, external:true };
  const canonicalName = IMPORT_OWNER_ALIASES.get(normalizeText(raw)) || raw;
  const owner = MASTER.owners.find((item)=>normalizeText(item.name) === normalizeText(canonicalName));
  if (owner) return { ...owner, resolved:true, external:false };
  const tokens = normalizeText(canonicalName).split(/\s+/).filter(Boolean);
  const tokenMatches = MASTER.owners.filter((item)=>{
    const ownerTokens = normalizeText(item.name).split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every((token)=>ownerTokens.includes(token));
  });
  if (tokenMatches.length === 1) return { ...tokenMatches[0], resolved:true, external:false };
  const director = MASTER.users.find((user)=>(user.roles || []).includes('vplanning_director') && normalizeText(user.name) === normalizeText(canonicalName));
  if (director) return { id:director.email, name:director.name, resolved:true, external:false, director:true };
  return { id:'', name:raw, resolved:false, external:false };
}
function splitImportParticipants(value) {
  return String(value || '').split(/[;,\n]+/).map((item)=>item.trim()).filter(Boolean);
}
function resolveImportParticipants(value) {
  const internal = [];
  const external = [];
  splitImportParticipants(value).forEach((name)=>{
    const resolved = resolveImportOwner(name);
    if (resolved.resolved) internal.push(resolved);
    else external.push(name);
  });
  return {
    participantOwnerIds:[...new Set(internal.map((item)=>String(item.id)).filter(Boolean))],
    participantNames:[...new Set(internal.map((item)=>item.name).filter(Boolean))],
    externalParticipants:[...new Set(external)],
  };
}
function localIsoDate(date) {
  const value = date instanceof Date ? date : new Date(`${date}T00:00:00`);
  if (Number.isNaN(value.getTime())) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function shiftIsoDate(iso, days) {
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}
function deadlineOffsetFromRule(value) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  const offsets = [];
  for (const match of text.matchAll(/\bt\s*([+-])\s*(\d+)\s*(h|gio|ngay)?/g)) {
    const amount = Number(match[2]);
    const days = match[3] === 'h' || match[3] === 'gio' ? Math.ceil(amount / 24) : amount;
    offsets.push((match[1] === '-' ? -1 : 1) * days);
  }
  return offsets.length ? Math.max(...offsets) : null;
}
export function deadlineFromImportValue(value, anchorDate = localIsoDate(new Date())) {
  return deadlineFromImportValueWithYear(value, anchorDate, null);
}
function deadlineFromImportValueWithYear(value, anchorDate = localIsoDate(new Date()), fallbackYear = null) {
  const source = String(value ?? '').trim();
  const exactDate = excelDateToIso(value);
  if (exactDate) return { deadline:exactDate, deadlineRule:'', deadlineSourceValue:source, deadlineKind:'date', deadlineWarning:'' };
  const dateMatches = [...source.matchAll(/(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{4}))?/g)];
  if (dateMatches.length) {
    const match = dateMatches[dateMatches.length - 1];
    const year = Number(match[3] || fallbackYear);
    const month = Number(match[2]);
    const day = Number(match[1]);
    if (year >= 2000 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
        return { deadline:localIsoDate(date), deadlineRule:'', deadlineSourceValue:source, deadlineKind:'date', deadlineWarning:'' };
      }
    }
  }
  if (!source) return { deadline:localIsoDate(new Date()), deadlineRule:'', deadlineSourceValue:'', deadlineKind:'blank', deadlineWarning:'File chưa có deadline; đang dùng hôm nay và có thể chỉnh trước khi tạo việc.' };
  const offset = deadlineOffsetFromRule(source);
  if (offset !== null) return { deadline:shiftIsoDate(anchorDate, offset), deadlineRule:source, deadlineSourceValue:source, deadlineKind:'relative', deadlineWarning:'' };
  return { deadline:anchorDate || localIsoDate(new Date()), deadlineRule:source, deadlineSourceValue:source, deadlineKind:'rule', deadlineWarning:'Mốc nghiệp vụ chưa thể tự quy đổi; cần xác nhận ngày hạn áp dụng.' };
}
function convertSimpleWorkbookRows(rawRows, currentUser, context = {}) {
  return convertFlexibleWorkbookRows(rawRows, currentUser, { ...context, profile:IMPORT_PROFILE.library });
}
function flexibleSourceCode(value, fallback = 'VWORK') {
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24).toUpperCase() || fallback;
}
function convertFlexibleWorkbookRows(rawRows, currentUser, context = {}) {
  const profile = context.profile || IMPORT_PROFILE.generic;
  const sourceId = String(context.fileName || context.sourceId || 'Import linh hoạt').replace(/\.[^.]+$/, '');
  return validateRows(rawRows.map((item, index)=>{
    const ownerRaw = flexValue(item, FLEX_IMPORT_COLUMNS.owner);
    const owner = resolveImportOwner(ownerRaw);
    const title = String(flexValue(item, FLEX_IMPORT_COLUMNS.title) || '').trim();
    const group = [flexValue(item, FLEX_IMPORT_COLUMNS.parentGroup), flexValue(item, FLEX_IMPORT_COLUMNS.childGroup)].map((value)=>String(value || '').trim()).filter(Boolean).join(' / ');
    const priority = priorityFromVWorkForm(flexValue(item, FLEX_IMPORT_COLUMNS.priority) || flexValue(item, FLEX_IMPORT_COLUMNS.deadline));
    const deadlineMeta = deadlineFromImportValueWithYear(flexValue(item, FLEX_IMPORT_COLUMNS.deadline), context.anchorDate || localIsoDate(new Date()), context.documentYear);
    const jobCode = String(flexValue(item, FLEX_IMPORT_COLUMNS.jobCode) || '').trim() || docxJobCodeFor(group, title);
    const result = String(flexValue(item, FLEX_IMPORT_COLUMNS.result) || '').trim();
    const checkpoint = String(flexValue(item, FLEX_IMPORT_COLUMNS.checkpoint) || '').trim();
    const note = String(flexValue(item, FLEX_IMPORT_COLUMNS.note) || '').trim();
    const status = statusFromVWorkForm(flexValue(item, FLEX_IMPORT_COLUMNS.status));
    const projectValue = flexValue(item, FLEX_IMPORT_COLUMNS.project);
    const participants = resolveImportParticipants(flexValue(item, FLEX_IMPORT_COLUMNS.participants));
    const sourceRow = Number(item.__sourceRow || (Number(context.headerIndex) || 0) + index + 2);
    const externalOwner = Boolean(owner.external);
    return {
      stt:String(flexValue(item, FLEX_IMPORT_COLUMNS.stt) || index + 1),
      projectCode:profile.id === 'library' && !projectValue ? '' : flexibleSourceCode(projectValue, 'VWORK'),
      projectName:String(projectValue || '').trim(),
      customer:String(flexValue(item, FLEX_IMPORT_COLUMNS.customer) || '').trim(),
      group,
      title,
      workType:'Dự án',
      workCode:`${context.sourceModule === 'docx_import' ? 'DOCX' : 'FORM'}-${String(flexValue(item, FLEX_IMPORT_COLUMNS.stt) || index + 1).padStart(3, '0')}`,
      keyObjective:'',
      objectiveId:'',
      resultName:result,
      resultId:'',
      ownerLead:owner.name,
      ownerId:owner.id,
      ownerName:owner.name,
      participants:participants.participantNames.join(', '),
      participantOwnerIds:participants.participantOwnerIds,
      participantNames:participants.participantNames,
      externalParticipants:participants.externalParticipants,
      startDate:excelDateToIso(flexValue(item, FLEX_IMPORT_COLUMNS.startDate)),
      deadline:deadlineMeta.deadline,
      deadlineRule:deadlineMeta.deadlineRule,
      deadlineSourceValue:deadlineMeta.deadlineSourceValue,
      deadlineKind:deadlineMeta.deadlineKind,
      jobCode:jobExists(jobCode) ? jobCode : 'JOB-PM',
      okrCode:'',
      status,
      statusSourceValue:String(flexValue(item, FLEX_IMPORT_COLUMNS.status) || '').trim(),
      priority,
      prioritySourceValue:String(flexValue(item, FLEX_IMPORT_COLUMNS.priority) || '').trim(),
      complete:status === 'controller_approved' ? 100 : 0,
      predecessor:'',
      deliverable:result || checkpoint,
      checkpoint,
      note,
      expectedHours:Number(flexValue(item, FLEX_IMPORT_COLUMNS.expectedHours)) || 0,
      actualHours:Number(flexValue(item, FLEX_IMPORT_COLUMNS.actualHours)) || 0,
      deliverableLink:'',
      approvalBy:'deptlead',
      risk:priority === 'High' ? 'High' : 'Medium',
      traffic:priority === 'High' ? 'Amber' : 'Green',
      sourceModule:context.sourceModule || 'xlsx_import',
      sourceId,
      sourceFile:context.fileName || '',
      sourceSheet:context.sheetName || '',
      sourceRow,
      importProfile:profile.id,
      sourceUrl:'',
      checklist:[checkpoint, result].filter(Boolean).length ? [checkpoint, result].filter(Boolean) : [title || 'Thực hiện công việc'],
      importAction:externalOwner ? 'skip' : 'create',
      excludedReason:externalOwner ? `${ownerRaw} không thuộc nhân sự V-Work.` : '',
      warnings:[deadlineMeta.deadlineWarning, ...participants.externalParticipants.map((name)=>`${name} được lưu là bên phối hợp ngoài V-Work.`)].filter(Boolean),
    };
  }).filter((row)=>String(row.title || '').trim()));
}
export function readFlexibleWorkbookPreview(XLSX, wb, currentUser, fileName) {
  let best = { sheetName:'', headerIndex:0, score:-1, rows:[], profile:IMPORT_PROFILE.generic };
  for (const sheetName of wb.SheetNames || []) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header:1, blankrows:true, defval:'' });
    const headerIndex = findFlexibleHeaderRow(rows);
    const headers = (rows[headerIndex] || []).map(normalizeHeader);
    const keys = new Set(headers.map(canonicalImportHeader));
    const score = Object.values(FLEX_IMPORT_COLUMNS).reduce((sum, names)=>sum + (names.some((name)=>keys.has(name)) ? 1 : 0), 0);
    if (score > best.score) best = { sheetName, headerIndex, score, rows, profile:detectWorkbookProfile(headers) };
  }
  const headers = (best.rows[best.headerIndex] || []).map(normalizeHeader);
  const objects = best.rows.slice(best.headerIndex + 1)
    .map((row, index)=>({ row, sourceRow:best.headerIndex + index + 2 }))
    .filter((item)=>item.row.some((cell)=>String(cell || '').trim()))
    .map((item)=>({ ...mapRow(headers, item.row), __sourceRow:item.sourceRow }));
  const mapping = detectImportColumnMapping(headers);
  const context = { fileName, sheetName:best.sheetName, headerIndex:best.headerIndex, profile:best.profile, anchorDate:localIsoDate(new Date()), sourceModule:'xlsx_import' };
  const preview = convertFlexibleWorkbookRows(mapRowsWithImportMapping(objects, mapping), currentUser, context);
  return { preview, count:objects.length, sheetName:best.sheetName, headerIndex:best.headerIndex, profile:best.profile, context, headers, rawRows:objects, mapping, unmappedHeaders:unmappedImportHeaders(headers, mapping) };
}
export async function readFlexibleDocxPreview(file, currentUser) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('File Word không có nội dung document.xml.');
  const tables = [...documentXml.matchAll(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>/g)].map((table)=>
    [...table[0].matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((row)=>
      [...row[0].matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((cell)=>docxCellText(cell[0])),
    ),
  );
  let best = { tableIndex:-1, headerIndex:-1, score:-1, rows:[], headers:[], mapping:{} };
  tables.forEach((rows, tableIndex)=>{
    rows.forEach((row, headerIndex)=>{
      const headers = row.map(normalizeHeader);
      const mapping = detectImportColumnMapping(headers);
      const score = Object.values(mapping).filter(Boolean).length;
      if (score > best.score && mapping.title) best = { tableIndex, headerIndex, score, rows, headers, mapping };
    });
  });
  if (best.tableIndex < 0 || best.score < 2) {
    return { preview:[], count:0, sheetName:'Word', headerIndex:0, profile:IMPORT_PROFILE.generic, context:{ fileName:file.name, sheetName:'Word', headerIndex:0, profile:IMPORT_PROFILE.generic, sourceModule:'docx_import' }, headers:[], rawRows:[], mapping:{}, unmappedHeaders:[] };
  }
  const rawRows = best.rows.slice(best.headerIndex + 1)
    .map((row, index)=>({ row, sourceRow:best.headerIndex + index + 2 }))
    .filter((item)=>item.row.some((cell)=>String(cell || '').trim()))
    .map((item)=>({ ...mapRow(best.headers, item.row), __sourceRow:item.sourceRow }));
  const yearMatches = `${file.name} ${tables.flat(2).join(' ')}`.match(/\b20\d{2}\b/g) || [];
  const documentYear = yearMatches.length ? Number(yearMatches[yearMatches.length - 1]) : new Date().getFullYear();
  const profile = detectWorkbookProfile(Object.values(best.mapping).filter(Boolean));
  const context = { fileName:file.name, sheetName:`Word · Bảng ${best.tableIndex + 1}`, headerIndex:best.headerIndex, profile, anchorDate:localIsoDate(new Date()), documentYear, sourceModule:'docx_import' };
  const preview = convertFlexibleWorkbookRows(mapRowsWithImportMapping(rawRows, best.mapping), currentUser, context);
  return { preview, count:rawRows.length, sheetName:context.sheetName, headerIndex:best.headerIndex, profile, context, headers:best.headers, rawRows, mapping:best.mapping, unmappedHeaders:unmappedImportHeaders(best.headers, best.mapping) };
}
async function loadXlsx(){
  if (window.XLSX) return window.XLSX;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Không tải được thư viện đọc Excel.'));
    document.head.appendChild(script);
  });
  return window.XLSX;
}
function Card({ title, children, action }){ return <section className="card">{title && <div className="row between"><h3>{title}</h3>{action}</div>}{children}</section>; }
function Badge({ children, tone='b-gray' }){ return <span className={`badge ${tone}`}>{children}</span>; }
function getInitials(value) {
  return String(value || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part)=>part[0]?.toUpperCase() || '')
    .join('');
}
function StageBadge({ stage }){ return <Badge tone={STAGE_BADGE[stage] || 'b-gray'}>{STAGE[stage] || stage}</Badge>; }
function TaskStatusBadge({ task }){ const status = getTaskStatus(task); return <Badge tone={TASK_STATUS_TONE[status] || 'b-gray'}>{TASK_STATUS_LABELS[status] || status}</Badge>; }
function Progress({ value }){ return <div><div className="progress"><span style={{width:`${value}%`}} /></div><span className="muted" style={{fontSize:11}}>{value}%</span></div>; }
function ManagementSignalBadge({ task }){ const signal = managementSignal(task); return <Badge tone={signal.tone}>{signal.label}</Badge>; }
function ResultProgress({ task }) {
  const readiness = outcomeReadiness(task);
  return <div>
    <div className="row between"><div><strong>{readiness.blueprint.title}</strong><div className="muted">Kết quả cần đạt: {readiness.blueprint.criteria.join(' · ')}</div></div><ManagementSignalBadge task={task} /></div>
    <Progress value={readiness.percent} />
    <div className="milestone-list">{readiness.milestones.map((item)=><div className="milestone-item" key={item.label}>
      <span className={`milestone-check ${item.done ? 'done' : ''}`}>{item.done ? '✓' : ''}</span>
      <div><strong>{item.label}</strong><div className="muted">{item.done ? 'Đã có tiến trình hoặc minh chứng' : 'Cần cập nhật tiến trình/minh chứng'}</div></div>
      <Badge tone={item.done ? 'b-green' : 'b-gray'}>{item.done ? 'Đạt' : 'Chưa đạt'}</Badge>
    </div>)}</div>
    {!readiness.hasEvidence && <p className="muted" style={{marginTop:10}}>Minh chứng cần có: {readiness.blueprint.evidence}</p>}
  </div>;
}
function OutcomeBoard({ tasks, onOpen }) {
  const rows = outcomeSummary(tasks);
  const urgent = tasks.filter((task)=>managementSignal(task).level === 'danger');
  const review = tasks.filter((task)=>managementSignal(task).level === 'warning');
  const ok = tasks.filter((task)=>managementSignal(task).level === 'ok');
  return <Card title="Quản trị kết quả công việc" action={urgent.length ? <Badge tone="b-red">{urgent.length} cần chỉ đạo ngay</Badge> : <Badge tone="b-green">Đang kiểm soát</Badge>}>
    <div className="management-strip">
      <div className="soft-box"><strong>Cần chỉ đạo ngay</strong><div className="num" style={{fontSize:24,color:'var(--red)'}}>{urgent.length}</div><p className="muted">Quá hạn, risk Critical hoặc traffic Red.</p></div>
      <div className="soft-box"><strong>Cần duyệt</strong><div className="num" style={{fontSize:24,color:'var(--amber)'}}>{review.length}</div><p className="muted">Đang chờ quản lý/KSV hoặc thiếu minh chứng.</p></div>
      <div className="soft-box"><strong>Ổn</strong><div className="num" style={{fontSize:24,color:'var(--green)'}}>{ok.length}</div><p className="muted">Đã có tiến trình tốt và minh chứng phù hợp.</p></div>
    </div>
    <div className="outcome-grid">{rows.map((row)=><div className={`outcome-card ${row.danger ? 'danger' : row.review ? 'warning' : ''}`} key={row.key}>
      <div className="row between"><strong>{row.title}</strong><Badge tone={row.danger ? 'b-red' : row.review ? 'b-amber' : 'b-green'}>{row.danger ? 'Cần chỉ đạo' : row.review ? 'Cần duyệt' : 'Ổn'}</Badge></div>
      <Progress value={row.progress} />
      <div className="muted">{row.tasks} việc · {row.done} hoàn thành · {row.review} cần duyệt</div>
      {row.examples.map((title)=><button className="btn btn-sm" key={title} onClick={()=>onOpen(tasks.find((task)=>task.title === title))}>{title}</button>)}
    </div>)}</div>
  </Card>;
}
function ProcessCheckpoint2406({ task, canEdit=false, onStatusChange }) {
  const readiness = checkpointReadiness2406(task);
  const okrTitles = (readiness.step.servesOkrs || readiness.okrs || []).map((okr)=>COMPANY_OKRS_2406.find((item)=>item.code===okr)?.title).filter(Boolean).join(' · ');
  return <div>
    <div className="row between"><div><strong>{readiness.step.code} - {readiness.step.title}</strong><div className="muted">{readiness.step.description || `Output: ${readiness.step.output}`}</div></div><Badge tone={readiness.percent >= 80 ? 'b-green' : readiness.percent >= 40 ? 'b-amber' : 'b-red'}>{readiness.percent}% checkpoint</Badge></div>
    <div className="grid grid-2" style={{marginTop:8}}>
      <div className="soft-box"><strong>Đầu ra cần đạt</strong><div className="muted">{readiness.step.output}</div></div>
      <div className="soft-box"><strong>Checking point</strong><div className="muted">{readiness.step.checkingPoint || readiness.hardGate}</div></div>
    </div>
    <div className="soft-box" style={{marginTop:8}}><strong>Hard gate</strong><div className="muted">{readiness.hardGate}</div>{readiness.step.riskBlocked && <div className="muted" style={{marginTop:6}}>Rủi ro được chặn: {readiness.step.riskBlocked}</div>}</div>
    <div className="grid grid-2" style={{marginTop:8}}>
      <div><strong>RACI</strong><table><tbody>{Object.entries(readiness.step.raci || {}).map(([key,value])=><tr key={key}><th>{key}</th><td>{value}</td></tr>)}</tbody></table></div>
      <div><strong>OKR liên kết</strong><div className="pill-row" style={{marginTop:6}}>{(readiness.step.servesOkrs || readiness.okrs).map((okr)=><Badge key={okr} tone="b-blue">{okr}</Badge>)}</div><p className="muted">{okrTitles}</p>{readiness.step.operationMapping && <p className="muted">Ánh xạ vận hành: {readiness.step.operationMapping}</p>}</div>
    </div>
    <div className="checkpoint-list">{readiness.checkpoints.map((item)=><div className="checkpoint-item checkpoint-status-row" key={item.label}>
      <span className={`checkpoint-dot ${item.done ? 'done' : item.blocked ? 'blocked' : ''}`}>{item.done ? '✓' : item.blocked ? '!' : '•'}</span>
      <span><strong>{item.label}</strong><div className="muted">Trạng thái: <Badge tone={item.statusTone}>{item.statusLabel}</Badge>{item.updatedBy ? ` · ${item.updatedBy}` : ''}</div>{item.evidence && <div className="muted">Minh chứng: {item.evidence}</div>}{item.note && <div className="muted">Ghi chú: {item.note}</div>}
        {canEdit && <div className="row checkpoint-actions">{PROCESS_CHECKPOINT_STATUSES.map((status)=><button className={`btn btn-sm ${item.status === status.id ? 'btn-primary' : ''}`} key={status.id} onClick={()=>onStatusChange?.(item, status.id)}>{status.label}</button>)}</div>}
      </span>
    </div>)}</div>
  </div>;
}
function Process2406Board({ tasks, onOpen }) {
  const rows = processSummary2406(tasks);
  return <Card title="Quy trình chuẩn" action={<Badge tone="b-blue">OKR · RACI · WBS · checkpoint</Badge>}>
    <div className="process-grid">{rows.map((row)=><div className={`process-card ${row.blocked ? 'danger' : row.review ? 'warning' : ''}`} key={row.id}>
      <div className="row between"><Badge tone="b-blue">{row.id}</Badge><Badge tone={row.blocked ? 'b-red' : row.review ? 'b-amber' : 'b-green'}>{row.blocked ? 'Cần chỉ đạo' : row.review ? 'Cần duyệt' : 'Ổn'}</Badge></div>
      <strong>{row.name}</strong>
      <Progress value={row.progress} />
      <div className="muted">{row.tasks.length} việc · {row.blocked} bị chặn · {row.review} chờ duyệt</div>
      {row.tasks[0] && <button className="btn btn-sm" onClick={()=>onOpen(row.tasks[0])}>Mở việc đại diện</button>}
    </div>)}</div>
  </Card>;
}
function WorkloadSnapshot({ tasks, onOpenOwner }) {
  const rows = workloadOwners().map((owner)=>workloadMetrics(owner, tasks)).filter((row)=>row.total).sort((left, right)=>right.urgent - left.urgent || right.load - left.load).slice(0, 6);
  return <div className="workload-snapshot">
    {rows.map((row)=><button className="workload-mini" type="button" key={row.owner.id} onClick={()=>onOpenOwner?.(row.owner)}>
      <div className="row between"><strong>{row.owner.name}</strong><Badge tone={row.urgent ? 'b-red' : row.review ? 'b-amber' : 'b-green'}>{row.load}% tải</Badge></div>
      <div className="muted">{row.total} việc · {row.review} chờ duyệt · {row.urgent} cần GĐ</div>
      <Progress value={row.load} />
    </button>)}
    {!rows.length && <p className="muted">Chưa có dữ liệu workload.</p>}
  </div>;
}
function ProjectSnapshot({ tasks, onOpen }) {
  const projects = [...new Set(tasks.map((task)=>task.projectCode || 'Việc chung'))].map((projectCode)=>{
    const rows = tasks.filter((task)=>(task.projectCode || 'Việc chung') === projectCode);
    const counts = statusCounts(rows);
    const progress = rows.length ? Math.round(rows.reduce((sum, task)=>sum + progressOf(task), 0) / rows.length) : 0;
    return { projectCode, rows, counts, progress };
  }).sort((left, right)=>right.counts.overdue - left.counts.overdue || right.rows.length - left.rows.length).slice(0, 6);
  return <div className="project-snapshot">
    {projects.map((project)=><button className="project-mini" type="button" key={project.projectCode} onClick={()=>project.rows[0] && onOpen(project.rows[0])}>
      <div className="row between"><strong>{project.projectCode}</strong><Badge tone={project.counts.overdue ? 'b-red' : project.counts.pending ? 'b-amber' : 'b-green'}>{project.rows.length} việc</Badge></div>
      <Progress value={project.progress} />
      <div className="muted">{project.counts.overdue} quá hạn · {project.counts.pending} chờ duyệt · {project.counts.completed} hoàn thành</div>
    </button>)}
  </div>;
}
function WorkOverview({ tasks, onOpenTask }) {
  const projects = projectWorkGroups(tasks);
  const standalone = nonProjectWork(tasks);
  const [openProjects, setOpenProjects] = useState(()=>new Set(projects.slice(0, 2).map((project)=>project.projectCode)));
  const [standaloneOpen, setStandaloneOpen] = useState(true);
  const toggleProject = (projectCode) => setOpenProjects((previous)=>{
    const next = new Set(previous);
    if (next.has(projectCode)) next.delete(projectCode);
    else next.add(projectCode);
    return next;
  });
  return <div className="work-overview">
    <div className="overview-head">
      <div>
        <h4>{'C\u00f4ng vi\u1ec7c theo d\u1ef1 \u00e1n'}</h4>
        <p className="muted">{'B\u1ea5m t\u1eebng d\u1ef1 \u00e1n \u0111\u1ec3 s\u1ed5 danh s\u00e1ch vi\u1ec7c, m\u1edf chi ti\u1ebft ngay trong popup.'}</p>
      </div>
    </div>
    <div className="project-accordion">
      {projects.map((project)=>{
        const open = openProjects.has(project.projectCode);
        return <section className={`project-group ${open ? 'open' : ''}`} key={project.projectCode}>
          <button className="project-group-head" type="button" onClick={()=>toggleProject(project.projectCode)} aria-expanded={open}>
            <div>
              <strong>{project.projectCode}</strong>
              <div className="muted">{project.owners.slice(0, 4).join(' · ') || 'Ch\u01b0a c\u00f3 owner'} {' · '} {project.rows.length} {'vi\u1ec7c'}</div>
            </div>
            <div className="project-group-metrics">
              <Badge tone={project.counts.overdue ? 'b-red' : 'b-green'}>{project.counts.overdue} {'qu\u00e1 h\u1ea1n'}</Badge>
              <Badge tone={project.counts.pending ? 'b-amber' : 'b-gray'}>{project.counts.pending} {'ch\u1edd duy\u1ec7t'}</Badge>
              <span className="chevron">{open ? 'Thu g\u1ecdn' : 'S\u1ed5 ra'}</span>
            </div>
          </button>
          <div className="project-progress"><Progress value={project.progress} /></div>
          {open && <div className="task-stack">
            {sortTasksForDisplay(project.rows).map((task)=><TaskCompactRow key={task.id} task={task} onOpen={onOpenTask} />)}
          </div>}
        </section>;
      })}
      {!projects.length && <div className="empty-panel">{'Ch\u01b0a c\u00f3 c\u00f4ng vi\u1ec7c n\u00e0o g\u1eafn d\u1ef1 \u00e1n.'}</div>}
    </div>
    <section className={`standalone-group ${standaloneOpen ? 'open' : ''}`}>
      <button className="project-group-head" type="button" onClick={()=>setStandaloneOpen(!standaloneOpen)} aria-expanded={standaloneOpen}>
        <div>
          <strong>{'C\u00f4ng vi\u1ec7c kh\u00f4ng theo d\u1ef1 \u00e1n'}</strong>
          <div className="muted">{'Vi\u1ec7c v\u1eadn h\u00e0nh, nh\u1eafc vi\u1ec7c, vi\u1ec7c ph\u00e1t sinh ch\u01b0a g\u1eafn project.'}</div>
        </div>
        <div className="project-group-metrics">
          <Badge tone={statusCounts(standalone).overdue ? 'b-red' : 'b-gray'}>{standalone.length} {'vi\u1ec7c'}</Badge>
          <span className="chevron">{standaloneOpen ? 'Thu g\u1ecdn' : 'S\u1ed5 ra'}</span>
        </div>
      </button>
      {standaloneOpen && <div className="task-stack">
        {sortTasksForDisplay(standalone).map((task)=><TaskCompactRow key={task.id} task={task} onOpen={onOpenTask} />)}
        {!standalone.length && <div className="empty-panel">{'Ch\u01b0a c\u00f3 vi\u1ec7c l\u1ebb trong ph\u1ea1m vi hi\u1ec7n t\u1ea1i.'}</div>}
      </div>}
    </section>
  </div>;
}
function TaskCompactRow({ task, onOpen }) {
  const signal = managementSignal(task);
  const checklistDone = (task.checklist || []).filter((item)=>item.done).length;
  const checklistTotal = (task.checklist || []).length;
  return <button className="task-compact-row" type="button" onClick={()=>onOpen(task)}>
    <span className="task-compact-main">
      <strong>{task.title}</strong>
      <small>{task.group || 'Nh\u00f3m vi\u1ec7c'} {' · '} {task.ownerName || 'Ch\u01b0a c\u00f3 owner'} {' · '} {'h\u1ea1n'} {task.deadline || 'ch\u01b0a \u0111\u1eb7t'}</small>
    </span>
    <span className="task-compact-meta">
      <TaskStatusBadge task={task} />
      <Badge tone={signal.tone}>{signal.label}</Badge>
      <span className="check-count">{checklistDone}/{checklistTotal || 0} checklist</span>
    </span>
  </button>;
}
function LegacyTaskTable({ rows, onOpen, showProject=true }){
  return <div className="table-wrap"><table><thead><tr>{showProject && <th>Dự án</th>}<th>Nhóm</th><th>Công việc</th><th>Owner</th><th>Hạn</th><th>Tiến độ</th><th>Trạng thái</th><th></th></tr></thead><tbody>
    {sortTasksForDisplay(rows).map((task)=><tr key={task.id}>{showProject && <td><Badge>{task.projectCode}</Badge></td>}<td className="muted">{task.group}</td><td><strong>{task.title}</strong><div className="muted">{task.jobCode} · {task.objectiveId} · {task.resultId}</div></td><td>{task.ownerName}</td><td className="muted">{task.deadline}</td><td style={{minWidth:100}}><Progress value={progressOf(task)} /></td><td><TaskStatusBadge task={task} /></td><td><button className="btn btn-sm" onClick={()=>onOpen(task)}>Mở</button></td></tr>)}
    {!rows.length && <tr><td colSpan={showProject?8:7} className="muted">Không có việc.</td></tr>}
  </tbody></table></div>;
}
function TaskTable({ rows, onOpen, showProject=true }){
  return <div className="table-wrap"><table><thead><tr>{showProject && <th>Dự án</th>}<th>Nhóm</th><th>Công việc</th><th>Người phụ trách</th><th>Hạn</th><th>Tiến độ</th><th>Trạng thái</th><th>Cảnh báo</th><th></th></tr></thead><tbody>
    {sortTasksForDisplay(rows).map((task)=>{ const signal = managementSignal(task); return <tr key={task.id}>{showProject && <td><Badge>{task.projectCode || 'Việc chung'}</Badge></td>}<td className="muted">{task.group}</td><td><strong>{task.title}</strong><div className="muted">{task.workType || 'Việc'} · {task.customer || 'PeopleOne'}</div></td><td>{task.ownerName}</td><td className="muted">{task.deadline}</td><td style={{minWidth:100}}><Progress value={progressOf(task)} /></td><td><TaskStatusBadge task={task} /></td><td><Badge tone={signal.tone}>{signal.label}</Badge></td><td><button className="btn btn-sm" onClick={()=>onOpen(task)}>Mở</button></td></tr>; })}
    {!rows.length && <tr><td colSpan={showProject?9:8} className="muted">Không có việc.</td></tr>}
  </tbody></table></div>;
}
function NotificationBell({ notifications, onOpen, onReadAll }) {
  const [open, setOpen] = useState(false);
  const noticeRef = useRef(null);
  const unread = notifications.filter((item)=>!item.read).length;
  const rows = notifications.slice(0, 8);
  function toggleNoticeList() {
    setOpen((current)=>{
      const next = !current;
      if (next && unread) onReadAll?.();
      return next;
    });
  }
  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!noticeRef.current || noticeRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);
  return <div className="notice-wrap" ref={noticeRef}>
    <button className="notice-btn" type="button" aria-label="Thông báo V-Work" aria-expanded={open} onClick={toggleNoticeList}>
      🔔
      {unread ? <span className="notice-dot">{unread > 99 ? '99+' : unread}</span> : null}
    </button>
    {open && <div className="notice-popover" role="dialog" aria-label="Thông báo V-Work">
      <div className="notice-head"><strong>Thông báo</strong><button className="btn btn-sm" onClick={onReadAll}>Đánh dấu đã đọc</button></div>
      <div className="notice-list">
        {rows.length ? rows.map((item)=><button type="button" className={`notice-item ${item.read ? '' : 'unread'}`} key={item.id} onClick={()=>{ onOpen(item); setOpen(false); }}>
          <div className="row between"><Badge tone={NOTIFICATION_KIND_TONE[item.kind] || 'b-blue'}>{NOTIFICATION_KIND_LABEL[item.kind] || 'Thông báo'}</Badge>{!item.read && <span className="unread-mark">Mới</span>}</div>
          <strong>{item.title}</strong>
          <div>{item.body}</div>
          <small>{item.emailStatus ? `Email: ${item.emailStatus}` : 'Thông báo trong app'} · {item.createdAt ? new Date(item.createdAt).toLocaleString('vi-VN') : ''}</small>
        </button>) : <div className="notice-empty">Chưa có thông báo V-Work mới.</div>}
      </div>
    </div>}
  </div>;
}
function addTaskEvent(task, actor, action, note) {
  return [
    ...(task.activity || []),
    { at:new Date().toISOString(), by:actor?.name || 'V-Work User', role:ROLES[actor?.activeRole] || actor?.activeRole || '', action, note },
  ];
}
const URL_PATTERN = /(https?:\/\/[^\s]+)/gi;
function reportLinksFromText(value) {
  return String(value || '').match(URL_PATTERN) || [];
}
function ReportTextWithLinks({ text }) {
  const value = String(text || '');
  return <>{value.split(URL_PATTERN).map((part, index)=> /^https?:\/\//i.test(part)
    ? <a key={`${part}-${index}`} href={part} target="_blank" rel="noreferrer">{part}</a>
    : <span key={`${part}-${index}`}>{part}</span>)}</>;
}
function TaskReportSummary({ task }) {
  const reports = Array.isArray(task?.reports) ? task.reports : [];
  const evidenceLinks = [task?.evidenceLink, task?.deliverableLink].filter(Boolean);
  const inlineLinks = reports.flatMap((item)=>reportLinksFromText(item?.note));
  const links = [...new Set([...evidenceLinks, ...inlineLinks])];
  return <Card title="Báo cáo & link minh chứng">
    <div className="vwork-report-summary">
      {reports.length ? reports.slice().reverse().map((item, index)=><div className="vwork-report-box" key={`${item.date || ''}-${index}`}>
        <div className="row between"><strong>{item.by || task.ownerName || 'Người báo cáo'}</strong><small>{item.date || ''}</small></div>
        <p><ReportTextWithLinks text={item.note || 'Đã cập nhật tiến độ.'} /></p>
      </div>) : <p className="muted">Chưa có nội dung báo cáo.</p>}
      {links.length ? <div className="vwork-report-links">{links.map((link)=><a className="btn btn-primary" key={link} href={link} target="_blank" rel="noreferrer">Mở link bài tập / minh chứng</a>)}</div> : <p className="muted">Chưa có link minh chứng.</p>}
    </div>
  </Card>;
}
function TaskDetail({ task, role, me, currentUser, onClose, onPatch, onAccepted, readOnly=false, initialView='overview', linkedProposalTasks=[], onCreateLinkedProposal, onUpdateLinkedProposal }){
  const [report, setReport] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [comment, setComment] = useState('');
  const [evidence, setEvidence] = useState(task.evidenceLink || task.deliverableLink || '');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [showDecline, setShowDecline] = useState(false);
  const [startAt, setStartAt] = useState(task.startAt || (task.startDate ? `${String(task.startDate).slice(0,10)}T08:00` : ''));
  const [endAt, setEndAt] = useState(task.endAt || (task.deadline ? `${String(task.deadline).slice(0,10)}T17:00` : ''));
  const [delegateOwnerId, setDelegateOwnerId] = useState(task.reviewerDelegateOwnerId || '');
  const [delegateExpiresAt, setDelegateExpiresAt] = useState(task.reviewerDelegationExpiresAt || '');
  const [proposalTitle, setProposalTitle] = useState('');
  const [proposalDetail, setProposalDetail] = useState('');
  const [proposalRecipientId, setProposalRecipientId] = useState('');
  const [proposalComments, setProposalComments] = useState({});
  const [detailView, setDetailView] = useState(initialView);
  const [reportFiles, setReportFiles] = useState([]);
  const [commentFiles, setCommentFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const isOwner = currentUserIsPrimaryOwner(task, currentUser, me);
  const isParticipant = currentUserCanWorkOnTask(task, currentUser, me);
  const taskCompleted = isTaskDone(task);
  const canStaff = !readOnly && !isVWorkAdminRequest(task) && can(role, 'update_own_task') && (isOwner || isParticipant) && !taskCompleted;
  const canReviewer = !readOnly && !isVWorkAdminRequest(task) && currentUserCanReviewTask(task, role, currentUser);
  const primaryReviewer = taskPrimaryReviewer(task, currentUser);
  const reviewerDelegation = taskReviewerDelegation(task, currentUser);
  const canDelegate = !readOnly && !taskCompleted && (primaryReviewer.isCurrent || isDirectorUser(currentUser, role) || can(role, 'manage_tasks'));
  const people = uniqueOwnersByName(MASTER.owners);
  const patchWithEvent = (data, action, eventNote) => {
    if (readOnly) return;
    onPatch(task.id, { ...data, activity:addTaskEvent(task, currentUser, action, eventNote) });
    notifyVWork(vworkActionToast(action, data, eventNote, task));
  };
  const saveSchedule = () => {
    if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) return alert('Thời gian kết thúc phải sau thời gian bắt đầu.');
    patchWithEvent({ startAt, endAt, startDate:startAt ? startAt.slice(0,10) : task.startDate, deadline:endAt ? endAt.slice(0,10) : task.deadline }, 'Cập nhật tiến độ việc', `${startAt || 'Chưa có bắt đầu'} → ${endAt || 'Chưa có kết thúc'}`);
  };
  const updateChecklist = (index, data, action='Cập nhật checklist') => {
    const nextItem = { ...(task.checklist?.[index] || {}), ...data };
    patchWithEvent({ checklist:(task.checklist || []).map((item, itemIndex)=>itemIndex === index ? nextItem : item), stage:task.stage === 'acknowledged' ? 'in_progress' : task.stage }, action, nextItem.label || nextItem.text || 'Checklist');
  };
  const toggleChecklist = (index) => {
    const item = task.checklist?.[index] || {};
    const done = !item.done;
    updateChecklist(index, { done, completedAt:done ? new Date().toISOString() : '', completedBy:done ? (currentUser?.name || me) : '' });
  };
  const addChecklistItem = () => {
    const label = newChecklistItem.trim();
    if (!label) return;
    patchWithEvent({ checklist:[...(task.checklist || []), ck(label)] }, 'Thêm checklist', label);
    setNewChecklistItem('');
  };
  const removeChecklistItem = (index) => {
    const item = task.checklist?.[index];
    if (!item || !window.confirm(`Xoá mục checklist “${item.label || item.text}”?`)) return;
    patchWithEvent({ checklist:(task.checklist || []).filter((_, itemIndex)=>itemIndex !== index) }, 'Xoá checklist', item.label || item.text || 'Checklist');
  };
  const acceptTask = () => {
    if (startAt && endAt && Date.parse(endAt) < Date.parse(startAt)) return alert('Thời gian kết thúc phải sau thời gian bắt đầu.');
    patchWithEvent({
      stage:'in_progress',
      acceptedAt:new Date().toISOString(),
      assignmentResponse:'',
      startAt,
      endAt,
      startDate:startAt ? startAt.slice(0,10) : task.startDate,
      deadline:endAt ? endAt.slice(0,10) : task.deadline,
    }, 'Tiếp nhận việc', 'Đã xem thời hạn và tiếp nhận công việc');
    onAccepted?.();
  };
  const returnTask = () => {
    if (!declineReason.trim()) return alert('Vui lòng nhập lý do hoặc nội dung cần làm rõ.');
    patchWithEvent({ stage:'assignment_returned', assignmentResponse:declineReason.trim(), assignmentRespondedAt:new Date().toISOString(), assignmentRespondedBy:currentUser?.name || me }, 'Phản hồi việc', declineReason.trim());
    setShowDecline(false);
  };
  const uploadTaskFiles = async (files, documentType) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return [];
    setIsUploading(true);
    try {
      const uploadedFiles = [];
      for (const file of selectedFiles) {
        const uploaded = await uploadVworkDocumentFile({ file, entityId:String(task.id), documentType });
        uploadedFiles.push({ name:uploaded.fileName || file.name, url:uploaded.fileUrl, size:file.size || 0, type:file.type || '' });
      }
      return uploadedFiles;
    } catch (error) {
      notifyVWork(`Không tải được file: ${getVWorkErrorMessage(error)}`, 'error');
      throw error;
    } finally {
      setIsUploading(false);
    }
  };
  const submitForReview = async () => {
    if (!report.trim()) return alert('Cần nhập báo cáo kết quả trước khi gửi duyệt.');
    if (!evidence.trim() && !reportFiles.length && !(task.reportAttachments || []).length) return alert('Cần có link hoặc file minh chứng trước khi gửi duyệt.');
    const incomplete = (task.checklist || []).filter((item)=>!item.done);
    if (incomplete.length) return alert(`Còn ${incomplete.length} mục checklist chưa hoàn thành.`);
    try {
      const attachments = await uploadTaskFiles(reportFiles, 'task_report');
      const submittedAt = new Date().toISOString();
      patchWithEvent({ stage:'reported', submittedForReviewAt:submittedAt, evidenceLink:evidence.trim() || task.evidenceLink || '', deliverableLink:evidence.trim() || task.deliverableLink || '', reportAttachments:[...(task.reportAttachments || []), ...attachments], reports:[...(task.reports || []), { by:currentUser?.name || task.ownerName, note:report.trim(), date:new Date().toLocaleDateString('vi-VN'), at:submittedAt, attachments }] }, 'Gửi duyệt', report.trim());
      setReport('');
      setReportFiles([]);
    } catch {
      // Giữ nguyên nội dung và file đã chọn để người dùng có thể thử lại.
    }
  };
  const saveComment = async () => {
    if (!comment.trim() && !commentFiles.length) return;
    try {
      const attachments = await uploadTaskFiles(commentFiles, 'task_discussion');
      const note = comment.trim() || `Đính kèm ${attachments.length} file`;
      patchWithEvent({ conversationAttachments:[...(task.conversationAttachments || []), ...attachments], comments:[...(task.comments || []), { by:currentUser?.name || me, role:ROLES[role], note, at:new Date().toISOString(), attachments }] }, 'Trao đổi', note);
      setComment('');
      setCommentFiles([]);
    } catch {
      // Giữ nguyên nội dung và file đã chọn để người dùng có thể thử lại.
    }
  };
  const remindTask = () => {
    const note = reviewNote.trim() || 'Vui lòng cập nhật tiến độ và phản hồi trên V-Work.';
    patchWithEvent({ reminders:[...(task.reminders || []), { kind:'reviewer', message:note, from:currentUser?.name || me, done:false, at:new Date().toISOString() }] }, 'Nhắc việc', note);
  };
  const requestChanges = () => {
    if (!reviewNote.trim()) return alert('Cần nêu rõ nội dung phải bổ sung.');
    patchWithEvent({ stage:'explain_requested', controllerNote:reviewNote.trim(), reviewRequestedAt:new Date().toISOString() }, 'Yêu cầu bổ sung', reviewNote.trim());
  };
  const approveTask = () => {
    const note = reviewNote.trim() || 'Đã duyệt hoàn thành công việc.';
    patchWithEvent({ stage:'controller_approved', status:'completed', complete:100, completedAt:new Date().toISOString(), completedBy:currentUser?.name || me, controllerNote:note }, 'Duyệt hoàn thành', note);
    onClose();
  };
  const delegateReview = () => {
    const owner = people.find((item)=>String(item.id) === String(delegateOwnerId));
    if (!owner) return alert('Vui lòng chọn người nhận uỷ quyền.');
    if (!delegateExpiresAt) return alert('Vui lòng chọn ngày kết thúc uỷ quyền.');
    patchWithEvent({ reviewerDelegateOwnerId:owner.id, reviewerDelegateName:owner.name, reviewerDelegatedAt:new Date().toISOString(), reviewerDelegatedBy:currentUser?.name || me, reviewerDelegationExpiresAt:delegateExpiresAt, reviewerDelegationRevokedAt:'' }, 'Uỷ quyền duyệt việc', `${owner.name} đến ${delegateExpiresAt}`);
  };
  const revokeDelegation = () => patchWithEvent({ reviewerDelegationRevokedAt:new Date().toISOString() }, 'Thu hồi uỷ quyền duyệt', reviewerDelegation.ownerName || 'Người được uỷ quyền');
  const createTaskProposal = () => {
    const recipient = people.find((item)=>String(item.id) === String(proposalRecipientId));
    if (!proposalTitle.trim() || !recipient) return alert('Cần nhập nội dung đề xuất và chọn người nhận.');
    const proposal = { id:uid('TASK-PROP').toUpperCase(), type:'task_idea', group:'Đề xuất trong công việc', title:proposalTitle.trim(), detail:proposalDetail.trim(), targetTaskId:String(task.id), project:task.projectCode || '', ownerId:task.ownerId || currentUser?.ownerIds?.[0] || '', ownerName:currentUser?.name || me, recipientOwnerId:recipient.id, recipientName:recipient.name, createdBy:currentUser?.name || me, createdById:currentUser?.id || currentUser?.email || '', createdAt:new Date().toISOString(), status:'pending', comments:[], rewardPoints:0, urgency:'Bình thường' };
    if (onCreateLinkedProposal) onCreateLinkedProposal(proposal);
    else patchWithEvent({ proposals:[...(task.proposals || []), proposal] }, 'Tạo đề xuất trong công việc', `${proposal.title} → ${recipient.name}`);
    setProposalTitle(''); setProposalDetail(''); setProposalRecipientId('');
  };
  const updateProposal = (proposalId, updater, action) => {
    if (onUpdateLinkedProposal && linkedProposalTasks.some((item)=>String(item.sourceId) === String(proposalId))) {
      onUpdateLinkedProposal(proposalId, updater, action);
      return;
    }
    const proposals = (task.proposals || []).map((item)=>item.id === proposalId ? updater(item) : item);
    patchWithEvent({ proposals }, action, proposals.find((item)=>item.id === proposalId)?.title || 'Đề xuất công việc');
  };
  const proposalRows = [...linkedProposalTasks.map(proposalRequestTaskToRequest), ...(task.proposals || [])]
    .filter((item, index, rows)=>rows.findIndex((row)=>String(row.id) === String(item.id)) === index);
  const unifiedActivity = [...(task.activity || []).map((item)=>({ ...item, kind:'activity' })), ...(task.comments || []).map((item)=>({ action:'Trao đổi', note:item.note, by:item.by, role:item.role, at:item.at, attachments:item.attachments || [], kind:'comment' }))].sort((left,right)=>Date.parse(right.at || '') - Date.parse(left.at || ''));
  const reviewBlockers = [
    ...(!task.reports?.length ? ['Chưa có báo cáo kết quả.'] : []),
    ...(!task.evidenceLink && !task.deliverableLink && !(task.reportAttachments || []).length ? ['Chưa có minh chứng.'] : []),
    ...((task.checklist || []).some((item)=>!item.done) ? ['Checklist chưa hoàn thành.'] : []),
  ];
  const reviewerLabel = primaryReviewer.ownerName || reviewerDisplayNamesForTask(task)[0] || DIRECTOR_APPROVER_LABEL;
  const isIntakeView = ['assigned','assignment_returned'].includes(task.stage);
  return <div className="modal-bg" onClick={onClose}><div className="modal vwork-task-detail-modal" onClick={(event)=>event.stopPropagation()}>
    <button className="modal-x" type="button" aria-label="Đóng chi tiết công việc" onClick={onClose}>×</button>
    <div className="modal-head vwork-task-detail-head"><div><div className="pill-row"><TaskStatusBadge task={task} /><Badge tone="b-blue">{task.projectCode || 'Việc chung'}</Badge></div><h3>{task.title}</h3><div className="muted">Phụ trách: {task.ownerName || 'Chưa phân công'} · Duyệt: {reviewerLabel}</div></div><button className="btn btn-sm modal-back" type="button" onClick={onClose}>← Quay lại</button></div>
    {readOnly ? <div className="vwork-readonly-banner"><strong>Đang xem công việc của {task.ownerName || 'người khác'}</strong><span>Bạn có thể xem toàn bộ nội dung nhưng chỉ người tham gia hoặc người duyệt được cập nhật.</span></div> : null}
    <div className={`vwork-task-detail-flow ${isIntakeView ? 'is-intake' : ''}`}>
      {isIntakeView ? <>
        <section className="vwork-flow-card vwork-intake-card"><div><h4>Tiếp nhận công việc</h4><p>Kiểm tra thời hạn dự kiến trước khi phản hồi hoặc tiếp nhận công việc.</p></div>{task.stage === 'assigned' && canStaff && isOwner ? <div className="row"><button className="btn" type="button" onClick={()=>setShowDecline((value)=>!value)}>Phản hồi</button><button className="btn btn-primary" type="button" onClick={acceptTask}><Check size={16}/>Tiếp nhận</button></div> : null}{showDecline && task.stage === 'assigned' && <div className="vwork-inline-response"><textarea rows="3" value={declineReason} onChange={(event)=>setDeclineReason(event.target.value)} placeholder="Nêu lý do, thông tin chưa rõ hoặc đề nghị giao lại..."/><div className="row end"><button className="btn btn-danger" type="button" onClick={returnTask}>Gửi phản hồi cho người giao</button></div></div>}{task.stage === 'assignment_returned' && <div className="vwork-returned-card"><span>Đã phản hồi người giao</span><h4>{task.assignmentResponse || 'Chờ người giao xử lý lại công việc.'}</h4><small>{task.assignmentRespondedBy} · {task.assignmentRespondedAt ? new Date(task.assignmentRespondedAt).toLocaleString('vi-VN') : ''}</small></div>}</section>
        <section className="vwork-flow-card vwork-intake-time"><div className="vwork-flow-heading"><div><h4>Thời gian dự kiến</h4><p>Thời gian có thể điều chỉnh lại sau khi công việc được tiếp nhận.</p></div></div><div className="grid grid-2 vwork-schedule-grid"><label><span>Bắt đầu</span><input type="datetime-local" value={startAt} disabled={task.stage !== 'assigned' || !canStaff || !isOwner} onChange={(event)=>setStartAt(event.target.value)} /></label><label><span>Kết thúc dự kiến</span><input type="datetime-local" value={endAt} disabled={task.stage !== 'assigned' || !canStaff || !isOwner} onChange={(event)=>setEndAt(event.target.value)} /></label></div>{task.stage === 'assigned' && canStaff && isOwner && <div className="row end"><button className="btn" type="button" onClick={saveSchedule}>Lưu thời gian</button></div>}</section>
      </> : <>
        <nav className="vwork-detail-nav" aria-label="Nội dung chi tiết công việc"><button type="button" className={detailView === 'overview' ? 'active' : ''} onClick={()=>setDetailView('overview')}><ClipboardCheck size={17}/>Tổng quan</button><button type="button" className={detailView === 'report' ? 'active' : ''} onClick={()=>setDetailView('report')}><Send size={17}/>Báo cáo<b>{task.reports?.length || 0}</b></button><button type="button" className={detailView === 'discussion' ? 'active' : ''} onClick={()=>setDetailView('discussion')}><MessageCircle size={17}/>Trao đổi<b>{task.comments?.length || 0}</b></button><button type="button" className={detailView === 'proposal' ? 'active' : ''} onClick={()=>setDetailView('proposal')}><Target size={17}/>Đề xuất<b>{proposalRows.length}</b></button>{(canReviewer || reviewerDelegation.active || taskCompleted) && <button type="button" className={detailView === 'review' ? 'active' : ''} onClick={()=>setDetailView('review')}><ShieldAlert size={17}/>Duyệt</button>}</nav>
        {detailView === 'overview' && <>
          <section className="vwork-flow-card"><div className="vwork-flow-heading"><div><h4>Tiến độ và thời gian thực hiện</h4></div><strong>{progressOf(task)}%</strong></div><Progress value={progressOf(task)} /><div className="grid grid-2 vwork-schedule-grid"><label><span>Bắt đầu</span><input type="datetime-local" value={startAt} disabled={!canStaff && !canReviewer} onChange={(event)=>setStartAt(event.target.value)} /></label><label><span>Kết thúc dự kiến</span><input type="datetime-local" value={endAt} disabled={!canStaff && !canReviewer} onChange={(event)=>setEndAt(event.target.value)} /></label></div>{(canStaff || canReviewer) && <div className="row end"><button className="btn" type="button" onClick={saveSchedule}>Lưu thời gian</button></div>}</section>
          <section className="vwork-flow-card"><div className="vwork-flow-heading"><div><h4>Checklist công việc</h4></div><strong>{(task.checklist || []).filter((item)=>item.done).length}/{(task.checklist || []).length}</strong></div><div className="vwork-checklist-deadlines">{(task.checklist || []).map((item,index)=><div className={`vwork-checklist-deadline-row ${item.done ? 'done' : ''}`} key={`${item.label || item.text}-${index}`}><button type="button" aria-label={item.done ? 'Bỏ hoàn thành' : 'Đánh dấu hoàn thành'} disabled={!canStaff} onClick={()=>toggleChecklist(index)}>{item.done ? <Check size={16}/> : null}</button><input value={item.label || item.text || ''} disabled={!canStaff} onChange={(event)=>updateChecklist(index,{ label:event.target.value, text:event.target.value },'Sửa checklist')} /><label><span>Hạn mục</span><input type="datetime-local" value={item.dueAt || ''} disabled={!canStaff && !canReviewer} max={endAt || undefined} onChange={(event)=>updateChecklist(index,{ dueAt:event.target.value },'Đặt hạn checklist')} /></label>{canStaff && <button className="vwork-check-remove" type="button" aria-label="Xoá mục checklist" onClick={()=>removeChecklistItem(index)}>×</button>}{item.completedAt && <small>{item.completedBy} · {new Date(item.completedAt).toLocaleString('vi-VN')}</small>}</div>)}{!(task.checklist || []).length && <p className="muted">Chưa có mục checklist.</p>}</div>{canStaff && <div className="checklist-add-row"><input value={newChecklistItem} onChange={(event)=>setNewChecklistItem(event.target.value)} placeholder="Thêm việc cần làm..." onKeyDown={(event)=>{ if (event.key === 'Enter') addChecklistItem(); }} /><button className="btn" type="button" onClick={addChecklistItem}>Thêm mục</button></div>}</section>
          <div className="vwork-detail-shortcuts"><button type="button" onClick={()=>setDetailView('report')}><Send size={20}/><span><strong>Báo cáo & minh chứng</strong><small>Gửi kết quả, link và file cho người duyệt</small></span><ArrowRight size={18}/></button><button type="button" onClick={()=>setDetailView('discussion')}><MessageCircle size={20}/><span><strong>Trao đổi công việc</strong><small>Bình luận và đính kèm tài liệu theo luồng</small></span><ArrowRight size={18}/></button></div>
        </>}
        {detailView === 'report' && <section className="vwork-flow-card vwork-detail-page"><div className="vwork-flow-heading"><div><span>Báo cáo công việc</span><h4>Báo cáo kết quả và minh chứng</h4><p>Gửi nội dung, link hoặc tệp kết quả để người duyệt kiểm tra.</p></div>{task.submittedForReviewAt && <Badge tone="b-purple">Đã gửi duyệt</Badge>}</div>{task.reports?.length ? <div className="vwork-report-history">{task.reports.slice().reverse().map((item,index)=><article key={`${item.at || item.date}-${index}`}><strong>{item.by}</strong><p>{item.note}</p>{item.attachments?.length ? <div className="vwork-task-file-list">{item.attachments.map((file)=><a key={`${file.name}-${file.url}`} href={file.url} target="_blank" rel="noreferrer"><Paperclip size={14}/>{file.name}</a>)}</div> : null}<small>{item.at ? new Date(item.at).toLocaleString('vi-VN') : item.date}</small></article>)}</div> : <p className="muted">Chưa có báo cáo.</p>}{canStaff && !['reported','lead_approved'].includes(task.stage) && <div className="vwork-report-compose"><textarea rows="6" value={report} onChange={(event)=>setReport(event.target.value)} placeholder="Tóm tắt kết quả, phần đã hoàn thành, vướng mắc và đề nghị hỗ trợ..."/><label className="vwork-evidence-field"><span>Link hoặc thông tin minh chứng</span><input value={evidence} onChange={(event)=>setEvidence(event.target.value)} placeholder="Link Drive, tài liệu bàn giao hoặc mã hồ sơ..." /></label><label className="vwork-task-file-upload"><Paperclip size={17}/><span>Đính kèm file báo cáo hoặc minh chứng</span><input type="file" multiple hidden onChange={(event)=>setReportFiles(Array.from(event.target.files || []))}/></label>{reportFiles.length ? <div className="vwork-selected-files">{reportFiles.map((file)=><span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div> : null}<div className="row end"><button className="btn btn-primary" type="button" disabled={isUploading} onClick={submitForReview}><Send size={16}/>{isUploading ? 'Đang tải file...' : 'Gửi duyệt'}</button></div></div>}</section>}
        {detailView === 'discussion' && <section className="vwork-flow-card vwork-detail-page"><div className="vwork-flow-heading"><div><span>Trao đổi công việc</span><h4>Trao đổi và hoạt động</h4><p>Mỗi trao đổi được lưu theo thời gian và có thể kèm tài liệu liên quan.</p></div><MessageCircle size={19}/></div>{!readOnly && <div className="vwork-comment-compose"><textarea rows="5" value={comment} onChange={(event)=>setComment(event.target.value)} placeholder="Trao đổi, đặt câu hỏi hoặc cập nhật vướng mắc..."/><div className="vwork-comment-actions"><label className="vwork-task-file-upload"><Paperclip size={17}/><span>Đính kèm file</span><input type="file" multiple hidden onChange={(event)=>setCommentFiles(Array.from(event.target.files || []))}/></label><button className="btn btn-primary" type="button" disabled={isUploading} onClick={saveComment}>{isUploading ? 'Đang tải file...' : 'Gửi trao đổi'}</button></div>{commentFiles.length ? <div className="vwork-selected-files">{commentFiles.map((file)=><span key={`${file.name}-${file.size}`}>{file.name}</span>)}</div> : null}</div>}<div className="vwork-unified-activity">{unifiedActivity.map((item,index)=><article key={`${item.at}-${index}`}><i>{item.kind === 'comment' ? <MessageCircle size={15}/> : <Clock3 size={15}/>}</i><div><strong>{item.action}</strong><p>{item.note || 'Đã cập nhật công việc.'}</p>{item.attachments?.length ? <div className="vwork-task-file-list">{item.attachments.map((file)=><a key={`${file.name}-${file.url}`} href={file.url} target="_blank" rel="noreferrer"><Paperclip size={14}/>{file.name}</a>)}</div> : null}<small>{item.by || 'V-Work'} · {item.at ? new Date(item.at).toLocaleString('vi-VN') : ''}</small></div></article>)}{!unifiedActivity.length && <p className="muted">Chưa có trao đổi hoặc hoạt động.</p>}</div></section>}
        {detailView === 'proposal' && <section className="vwork-flow-card vwork-detail-page"><div className="vwork-flow-heading"><div><h4>Đề xuất gắn với công việc</h4></div><Target size={19}/></div>{canStaff && <div className="vwork-task-proposal-compose"><div className="grid grid-2"><input value={proposalTitle} onChange={(event)=>setProposalTitle(event.target.value)} placeholder="Tên đề xuất / sáng kiến"/><select value={proposalRecipientId} onChange={(event)=>setProposalRecipientId(event.target.value)}><option value="">Chọn người nhận đề xuất</option>{people.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></div><textarea rows="2" value={proposalDetail} onChange={(event)=>setProposalDetail(event.target.value)} placeholder="Mô tả lợi ích, cách làm hoặc hỗ trợ cần thiết..."/><div className="row end"><button className="btn" type="button" onClick={createTaskProposal}>Tạo đề xuất</button></div></div>}<div className="vwork-task-proposals">{proposalRows.map((proposal)=><article key={proposal.id}><div><Badge tone={proposal.status === 'rewarded' ? 'b-green' : 'b-purple'}>{proposal.status === 'rewarded' ? `${proposal.rewardPoints} điểm` : 'Chờ phản hồi'}</Badge><strong>{proposal.title}</strong><p>{proposal.detail || 'Không có mô tả thêm.'}</p><small>{proposal.createdBy || proposal.ownerName} → {proposal.recipientName}</small></div>{(proposal.comments || []).map((item,index)=><blockquote key={`${item.at}-${index}`}><strong>{item.by}</strong>{item.note}</blockquote>)}{currentUserMatchesTaskIdentity(currentUser, proposal.recipientOwnerId, proposal.recipientName) && <div className="vwork-proposal-response"><textarea rows="2" value={proposalComments[proposal.id] || ''} onChange={(event)=>setProposalComments((current)=>({ ...current,[proposal.id]:event.target.value }))} placeholder="Phản hồi đề xuất..."/><div className="row"><button className="btn" type="button" onClick={()=>{ const note=(proposalComments[proposal.id] || '').trim(); if (!note) return; updateProposal(proposal.id,(item)=>({ ...item, comments:[...(item.comments || []),{ by:currentUser?.name || me,note,at:new Date().toISOString() }] }),'Phản hồi đề xuất'); setProposalComments((current)=>({ ...current,[proposal.id]:'' })); }}>Gửi phản hồi</button><select defaultValue="" onChange={(event)=>{ const points=Number(event.target.value); if (!points) return; updateProposal(proposal.id,(item)=>({ ...item,status:'rewarded',rewardPoints:points,rewardedBy:currentUser?.name || me,rewardedAt:new Date().toISOString() }),'Ghi nhận sáng kiến'); event.target.value=''; }}><option value="">Ghi nhận rewards</option><option value="10">10 điểm</option><option value="20">20 điểm</option><option value="50">50 điểm</option></select></div></div>}</article>)}{!proposalRows.length && <p className="muted">Chưa có đề xuất nào gắn với công việc.</p>}</div></section>}
        {detailView === 'review' && (canReviewer || reviewerDelegation.active || taskCompleted) && <section className="vwork-flow-card vwork-review-card"><div className="vwork-flow-heading"><div><span>Dành cho người duyệt</span><h4>Duyệt, nhắc việc và uỷ quyền</h4></div><ShieldAlert size={20}/></div><div className="vwork-review-identity"><div><span>Người duyệt chính</span><strong>{reviewerLabel}</strong></div><div><span>Đang uỷ quyền</span><strong>{reviewerDelegation.active ? `${reviewerDelegation.ownerName} · đến ${task.reviewerDelegationExpiresAt}` : 'Không'}</strong></div></div>{reviewBlockers.length && !taskCompleted ? <div className="vwork-review-blockers">{reviewBlockers.map((item)=><span key={item}>{item}</span>)}</div> : null}{canReviewer && !taskCompleted && <><textarea rows="3" value={reviewNote} onChange={(event)=>setReviewNote(event.target.value)} placeholder="Nhận xét duyệt, nội dung cần bổ sung hoặc lời nhắc..."/><div className="row end"><button className="btn" type="button" onClick={remindTask}>Nhắc việc</button><button className="btn btn-danger" type="button" onClick={requestChanges}>Yêu cầu bổ sung</button><button className="btn btn-primary" type="button" disabled={task.stage !== 'reported' || reviewBlockers.length > 0} onClick={approveTask}><CheckSquare size={16}/>Duyệt hoàn thành</button></div></>}{taskCompleted && <div className="vwork-completed-note"><Check size={18}/><div><strong>Đã hoàn thành</strong><span>{task.completedBy} · {task.completedAt ? new Date(task.completedAt).toLocaleString('vi-VN') : ''}</span></div></div>}{canDelegate && <div className="vwork-delegate-review"><div className="grid grid-2"><label><span>Người duyệt thay</span><select value={delegateOwnerId} onChange={(event)=>setDelegateOwnerId(event.target.value)}><option value="">Chọn người nhận uỷ quyền</option>{people.filter((item)=>!currentUserMatchesTaskIdentity(currentUser,item.id,item.name)).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>Uỷ quyền đến ngày</span><input type="date" value={delegateExpiresAt} min={addDays(0)} onChange={(event)=>setDelegateExpiresAt(event.target.value)} /></label></div><div className="row end">{reviewerDelegation.active && <button className="btn" type="button" onClick={revokeDelegation}>Thu hồi</button>}<button className="btn" type="button" onClick={delegateReview}>Uỷ quyền duyệt việc</button></div></div>}</section>}
      </>}
    </div>
  </div></div>;
}

function TaskDetailLegacy({ task, role, me, currentUser, onClose, onPatch, onDelete, readOnly=false }){
  const defaultTab = (task.stage === 'reported' || task.stage === 'lead_approved' || task.stage === 'explain_requested') ? 'approval' : 'work';
  const [tab, setTab] = useState(defaultTab);
  const [report, setReport] = useState('');
  const [note, setNote] = useState('');
  const [comment, setComment] = useState('');
  const [evidence, setEvidence] = useState(task.evidenceLink || task.deliverableLink || '');
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [reminderAt, setReminderAt] = useState(task.reminderAt || '');
  const [reminderNote, setReminderNote] = useState(task.reminderNote || '');
  const [proposedDue, setProposedDue] = useState(task.proposedDue || '');
  const [coord, setCoord] = useState(task.coord || { internal:'', customer:'', lecturer:'', collaborator:'' });
  const [method, setMethod] = useState(task.method || '');
  const [evalWork, setEvalWork] = useState(task.evalWork || [false,false,false,false,false]);
  const [evalResult, setEvalResult] = useState(task.evalResult || [false,false,false,false,false]);
  const [editTask, setEditTask] = useState({
    projectCode: task.projectCode || '',
    group: task.group || '',
    title: task.title || '',
    ownerId: task.ownerId || '',
    ownerName: task.ownerName || '',
    deadline: task.deadline || '',
    jobCode: task.jobCode || '',
    priority: task.priority || 'Medium',
    risk: task.risk || 'Medium',
    traffic: task.traffic || 'Green',
    deliverableLink: task.deliverableLink || '',
    sourceUrl: task.sourceUrl || '',
  });
  const isOwner = currentUserIsPrimaryOwner(task, currentUser, me);
  const isParticipant = currentUserCanWorkOnTask(task, currentUser, me);
  const isAdminRequest = isVWorkAdminRequest(task);
  const taskCompleted = isTaskDone(task);
  const canStaff = !readOnly && !isAdminRequest && can(role, 'update_own_task') && (isOwner || isParticipant) && !taskCompleted;
  const canLead = !readOnly && !isAdminRequest && isDirectorUser(currentUser, role);
  const canController = !readOnly && !isAdminRequest && can(role, 'control_review');
  const canDirectorComplete = !readOnly && !isAdminRequest && isDirectorUser(currentUser, role);
  const canComplete = !isAdminRequest && canDirectorComplete;
  const canManageTask = !readOnly && !isAdminRequest && (can(role, 'manage_tasks') || can(role, 'create_plan'));
  const hardGateBlock = enterpriseHardGateDecision(task);
  const blockApproval = hardGateBlock.hardGateBlock;
  const patchWithEvent = (data, action, eventNote) => {
    if (readOnly) return;
    onPatch(task.id, { ...data, activity:addTaskEvent(task, currentUser, action, eventNote) });
    notifyVWork(vworkActionToast(action, data, eventNote, task));
  };
  const updateEditTask = (key, value) => setEditTask((previous)=>({ ...previous, [key]:value }));
  const chooseOwner = (ownerId) => {
    const owner = MASTER.owners.find((item)=>item.id === ownerId);
    setEditTask((previous)=>({ ...previous, ownerId, ownerName:owner?.name || previous.ownerName }));
  };
  const saveTaskEdit = () => {
    if (!editTask.title.trim()) {
      alert('Tên công việc không được để trống.');
      return;
    }
    if (!editTask.ownerId.trim() || !editTask.ownerName.trim()) {
      alert('Cần có Owner_ID và người phụ trách.');
      return;
    }
    patchWithEvent({
      ...editTask,
      title:editTask.title.trim(),
      projectCode:editTask.projectCode.trim(),
      group:editTask.group.trim(),
      ownerId:editTask.ownerId.trim(),
      ownerName:editTask.ownerName.trim(),
      deliverableLink:editTask.deliverableLink.trim(),
      sourceUrl:editTask.sourceUrl.trim(),
    }, 'Sửa thông tin công việc', editTask.title.trim());
  };
  const deleteTask = () => {
    const ok = window.confirm(`Xoá công việc "${task.title}"? Thao tác này dùng để dọn việc trùng và không thể hoàn tác sau khi dữ liệu được lưu.`);
    if (!ok) return;
    onDelete?.(task.id);
    notifyVWork(`Đã xoá công việc "${task.title}".`, 'warning');
    onClose();
  };
  const toggle = (idx) => patchWithEvent({ checklist: task.checklist.map((item, i)=>i===idx ? {...item, done:!item.done} : item), stage: task.stage === 'assigned' ? 'in_progress' : task.stage }, 'Cập nhật checklist', task.checklist[idx]?.label || 'Checklist');
  const updateChecklistItem = (idx, label) => {
    const nextLabel = String(label || '').trimStart();
    patchWithEvent({
      checklist:(task.checklist || []).map((item, itemIndex)=>itemIndex === idx ? {...item, label:nextLabel, text:nextLabel} : item),
    }, 'Sửa checklist', nextLabel || 'Checklist');
  };
  const addChecklistItem = () => {
    const label = newChecklistItem.trim();
    if (!label) return;
    patchWithEvent({ checklist:[...(task.checklist || []), ck(label)] }, 'Thêm checklist', label);
    setNewChecklistItem('');
  };
  const removeChecklistItem = (idx) => {
    const item = task.checklist?.[idx];
    if (!item) return;
    patchWithEvent({ checklist:task.checklist.filter((_, itemIndex)=>itemIndex !== idx) }, 'Xoá checklist', item.label || 'Checklist');
  };
  const updateTaskStatus = (stage) => {
    if (taskCompleted || isAdminRequest) return;
    patchWithEvent({ stage, status: stage === 'controller_approved' ? 'completed' : task.status }, 'Cập nhật trạng thái', TASK_STATUS_LABEL[stage] || stage);
  };
  const saveReminder = () => {
    patchWithEvent({ reminderAt, reminderNote }, 'Nhắc việc', reminderAt ? `${reminderAt} - ${reminderNote || task.title}` : 'Đã cập nhật nhắc việc');
  };
  const pickEvidenceFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setEvidence(`File: ${file.name}`);
  };
  const savePlan = () => {
    if (proposedDue && task.deadline && proposedDue >= task.deadline) {
      alert(`Hạn đề xuất phải sớm hơn hạn đã giao (${task.deadline}).`);
      return;
    }
    patchWithEvent({ proposedDue, coord, method, planDone:true, stage:task.stage === 'assigned' ? 'acknowledged' : task.stage }, 'Lập kế hoạch', method || 'Hoàn thành kế hoạch thực hiện');
  };
  const saveComment = () => {
    if (!comment.trim()) return;
    patchWithEvent({ comments:[...(task.comments || []), { by:currentUser?.name || me, role:ROLES[role], note:comment.trim(), at:new Date().toISOString() }] }, 'Trao đổi', comment.trim());
    setComment('');
  };
  const saveEvidence = () => {
    patchWithEvent({ evidenceLink:evidence, deliverableLink:evidence || task.deliverableLink }, 'Cập nhật minh chứng', evidence || 'Đã cập nhật minh chứng');
  };
  const completeTask = () => {
    const completionNote = note.trim() || (canDirectorComplete ? 'Giám đốc xác nhận hoàn thành.' : 'Kiểm soát viên xác nhận hoàn thành.');
    patchWithEvent({
      stage:'controller_approved',
      status:'completed',
      complete:100,
      completedAt:new Date().toISOString(),
      completedBy:currentUser?.name || me || '',
      controllerNote:completionNote,
    }, 'Xác nhận hoàn thành', completionNote);
    onClose();
  };
  const v1ApprovalBlockers = [];
  if (!task.reports?.length && !report.trim()) v1ApprovalBlockers.push('Chưa có báo cáo kết quả.');
  if (!task.evidenceLink && !task.deliverableLink && !evidence.trim()) v1ApprovalBlockers.push('Chưa có link minh chứng hoặc file bàn giao.');
  if (isTaskOverdue(task) && task.stage !== 'explain_requested') v1ApprovalBlockers.push('Việc đang quá hạn, cần cập nhật hướng xử lý trước khi duyệt.');
  const v1BlockApproval = v1ApprovalBlockers.length > 0;
  const updateProcessCheckpoint = (checkpoint, status) => {
    const meta = processCheckpointStatusMeta(status);
    const existing = Array.isArray(task.processCheckpoints) ? task.processCheckpoints : [];
    const nextRow = {
      stepCode:checkpoint.stepCode,
      label:checkpoint.label,
      status,
      evidence:evidence || checkpoint.evidence || task.evidenceLink || task.deliverableLink || '',
      note:report || checkpoint.note || '',
      updatedAt:new Date().toISOString(),
      updatedBy:currentUser?.name || me || task.ownerName,
    };
    const next = [...existing.filter((item)=>!(item.stepCode === checkpoint.stepCode && item.label === checkpoint.label)), nextRow];
    patchWithEvent({ processCheckpoints:next, stage:task.stage === 'assigned' ? 'in_progress' : task.stage }, 'Cập nhật checkpoint quy trình', `${checkpoint.stepCode} - ${checkpoint.label}: ${meta.label}`);
  };
  const toggleEval = (list, setter, idx) => setter(list.map((value, i)=>i===idx ? !value : value));
  const evalWorkLabels = ['Tuân thủ quy trình & hướng dẫn','Phối hợp tốt với bộ phận liên quan','Báo cáo đầy đủ, đúng hạn','Chủ động xử lý vướng mắc','Sử dụng nguồn lực hợp lý'];
  const evalResultLabels = ['Hoàn thành đúng phạm vi','Đạt chất lượng/tiêu chuẩn','Đúng hoặc trước hạn','Có minh chứng bàn giao','Quản lý/khách nghiệm thu'];
  return <div className="modal-bg" onClick={onClose}><div className="modal" onClick={(event)=>event.stopPropagation()}>
    <button className="modal-x" type="button" aria-label="Đóng popup" onClick={onClose}>×</button>
    <div className="modal-head"><div><h3>{task.title}</h3><div className="muted">{task.projectCode} · {task.group} · {task.ownerName}</div></div><button className="btn btn-sm modal-back" type="button" onClick={onClose}>← Quay lại</button></div>
    {readOnly ? <div className="vwork-readonly-banner"><strong>Đang xem công việc của {task.ownerName || 'người khác'}</strong><span>Bạn có thể xem đầy đủ nội dung nhưng không thể thay đổi trạng thái, checklist hoặc báo cáo.</span></div> : null}
    <div className="detail-layout">
      <div>
        <div className="detail-tabs"><button className={tab==='work'?'active':''} onClick={()=>setTab('work')}>Thực hiện</button><button className={tab==='exchange'?'active':''} onClick={()=>setTab('exchange')}>Trao đổi</button><button className={tab==='approval'?'active':''} onClick={()=>setTab('approval')}>Duyệt / kiểm soát</button>{canManageTask && <button className={tab==='manage'?'active':''} onClick={()=>setTab('manage')}>Sửa / xoá</button>}</div>
        {tab==='work' && <div>
          <Card title={'Vi\u1ec7c c\u1ea7n l\u00e0m'}>
            <div className="task-quick-status"><TaskStatusBadge task={task} /><ManagementSignalBadge task={task} /><Progress value={progressOf(task)} /></div>
            <div className="checklist-editor">
              {(task.checklist || []).map((item, idx)=><div className="checklist-edit-row" key={idx}>
                <label><input type="checkbox" checked={item.done} disabled={readOnly} onChange={()=>toggle(idx)} /><input className="checklist-label-input" value={item.label || item.text || ''} readOnly={readOnly} onChange={(event)=>updateChecklistItem(idx, event.target.value)} placeholder={'Nh\u1eadp checkpoint...'} /></label>
                {!readOnly ? <button className="btn btn-sm" type="button" onClick={()=>removeChecklistItem(idx)}>{'Xo\u00e1'}</button> : null}
              </div>)}
              {!readOnly ? <div className="checklist-add-row">
                <input value={newChecklistItem} onChange={(event)=>setNewChecklistItem(event.target.value)} placeholder={'Th\u00eam checklist con...'} onKeyDown={(event)=>{ if (event.key === 'Enter') addChecklistItem(); }} />
                <button className="btn" type="button" onClick={addChecklistItem}>{'Th\u00eam checklist'}</button>
              </div> : null}
            </div>
          </Card>
          {canStaff && <Card title="Nhận việc & kế hoạch ngắn"><div className="grid grid-2"><label><span>Đề xuất hạn sớm hơn nếu cần</span><input type="date" value={proposedDue} onChange={(event)=>setProposedDue(event.target.value)} /></label><label><span>Cách thực hiện / cần phối hợp ai</span><input value={method} onChange={(event)=>setMethod(event.target.value)} placeholder="Ví dụ: rà tài liệu, gọi khách, gửi nhóm..." /></label></div><div className="row" style={{justifyContent:'flex-end',marginTop:10}}><button className="btn" onClick={()=>patchWithEvent({stage:'acknowledged'}, 'Nhận việc', 'Đã nhận việc')}>Đã nhận việc</button><button className="btn btn-primary" onClick={savePlan}>Lưu kế hoạch</button></div></Card>}
          {canStaff && <Card title="Báo cáo kết quả"><textarea rows="3" value={report} onChange={(event)=>setReport(event.target.value)} placeholder="Đã làm gì, kết quả ra sao, còn vướng gì, cần ai hỗ trợ..." /><div className="grid grid-2" style={{marginTop:10}}><label><span>Link minh chứng / file bàn giao</span><input value={evidence} onChange={(event)=>setEvidence(event.target.value)} placeholder="https://..." /></label><div className="row" style={{alignItems:'end'}}><button className="btn" onClick={saveEvidence}>Lưu minh chứng</button></div></div><div className="row" style={{justifyContent:'flex-end',marginTop:10}}><button className="btn btn-primary" onClick={()=>{patchWithEvent({stage:'reported',evidenceLink:evidence,deliverableLink:evidence || task.deliverableLink,reports:[...(task.reports||[]),{by:currentUser?.name || task.ownerName,note:report || 'Đã cập nhật tiến độ.',date:new Date().toLocaleDateString('vi-VN')} ]}, 'Gửi báo cáo', report || 'Đã cập nhật tiến độ.'); setReport('');}}>Gửi báo cáo</button></div></Card>}
          {canStaff && <Card title={'Minh ch\u1ee9ng c\u00f4ng vi\u1ec7c'}>
            <div className="grid grid-2">
              <label><span>{'D\u00e1n link Drive / deliverable'}</span><input value={evidence} onChange={(event)=>setEvidence(event.target.value)} placeholder="https://drive.google.com/..." /></label>
              <label><span>{'Ho\u1eb7c ch\u1ecdn file t\u1eeb m\u00e1y'}</span><input type="file" onChange={pickEvidenceFile} /></label>
            </div>
            <div className="row between" style={{marginTop:10}}>
              <span className="muted">{evidence || 'Ch\u01b0a c\u00f3 minh ch\u1ee9ng'}</span>
              <button className="btn" type="button" onClick={saveEvidence}>{'L\u01b0u minh ch\u1ee9ng'}</button>
            </div>
          </Card>}
        </div>}
        {tab==='exchange' && <Card title="Trao đổi công việc">{!readOnly ? <><textarea rows="3" value={comment} onChange={(event)=>setComment(event.target.value)} placeholder="Ghi chú, câu hỏi, vướng mắc, chỉ đạo..." /><div className="row" style={{justifyContent:'flex-end',marginTop:10}}><button className="btn btn-primary" onClick={saveComment}>Thêm trao đổi</button></div></> : null}<div className="grid" style={{marginTop:12}}>{(task.comments || []).map((item,idx)=><div className="comment-box" key={idx}><strong>{item.by}</strong> <span className="muted">{item.role}</span><p>{item.note}</p><small className="muted">{new Date(item.at).toLocaleString('vi-VN')}</small></div>)}{!(task.comments || []).length && <p className="muted">Chưa có trao đổi.</p>}</div></Card>}
        {tab==='approval' && <div>
          <TaskReportSummary task={task} />
          <Card title="Điều kiện duyệt V1">{v1ApprovalBlockers.length ? <ul>{v1ApprovalBlockers.map((item)=><li key={item}>{item}</li>)}</ul> : <p className="muted">Đã có báo cáo và minh chứng cơ bản để Giám đốc hoặc người được uỷ quyền xem xét.</p>}</Card>
          {taskCompleted && <Card title="Đã hoàn thành"><p className="muted">Công việc đã được xác nhận hoàn thành và xếp xuống cuối danh sách.</p>{task.completedBy ? <p><strong>Người xác nhận:</strong> {task.completedBy}</p> : null}</Card>}
          {canLead && !taskCompleted && <Card title="Giám đốc duyệt"><textarea rows="2" value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Nhận xét ngắn: đồng ý, cần bổ sung gì, lưu ý trước khi xác nhận hoàn thành..." style={{marginTop:10}} /><div className="row" style={{justifyContent:'flex-end',marginTop:10}}><button className="btn btn-primary" disabled={v1BlockApproval} onClick={()=>patchWithEvent({stage:'lead_approved',leadNote:note || 'Giám đốc đã duyệt.', evalWork, evalResult}, 'Giám đốc duyệt', note || 'Giám đốc đã duyệt.')}>Duyệt kết quả</button></div></Card>}
          {canComplete && !taskCompleted && <Card title="Giám đốc xác nhận"><textarea rows="2" value={note} onChange={(event)=>setNote(event.target.value)} placeholder="Ghi chú kiểm soát hoặc lý do yêu cầu bổ sung..." /><div className="row" style={{justifyContent:'flex-end',marginTop:10}}><button className="btn btn-danger" onClick={()=>patchWithEvent({stage:'explain_requested',controllerNote:note || 'Cần bổ sung thêm.'}, 'Yêu cầu bổ sung', note || 'Cần bổ sung thêm.')}>Yêu cầu bổ sung</button><button className="btn btn-primary" disabled={v1BlockApproval && !canDirectorComplete} onClick={completeTask}>Xác nhận hoàn thành</button></div></Card>}
          {!taskCompleted && !canLead && !canComplete && <p className="muted">Bạn không có quyền duyệt hoặc kiểm soát công việc này.</p>}
        </div>}
        {tab==='manage' && canManageTask && <div>
          <Card title="Sửa thông tin công việc"><div className="grid grid-2">
            <label><span>Mã dự án</span><input value={editTask.projectCode} onChange={(event)=>updateEditTask('projectCode', event.target.value)} /></label>
            <label><span>Nhóm công việc</span><input value={editTask.group} onChange={(event)=>updateEditTask('group', event.target.value)} /></label>
            <label style={{gridColumn:'1 / -1'}}><span>Tên công việc</span><input value={editTask.title} onChange={(event)=>updateEditTask('title', event.target.value)} /></label>
            <label><span>Owner_ID</span><select value={editTask.ownerId} onChange={(event)=>chooseOwner(event.target.value)}><option value="">Chọn Owner_ID</option>{MASTER.owners.map((owner)=><option key={owner.id} value={owner.id}>{owner.id} - {owner.name}</option>)}</select></label>
            <label><span>Người phụ trách</span><input value={editTask.ownerName} onChange={(event)=>updateEditTask('ownerName', event.target.value)} /></label>
            <label><span>Deadline</span><input type="date" value={editTask.deadline} onChange={(event)=>updateEditTask('deadline', event.target.value)} /></label>
            <label><span>Mã Job</span><select value={editTask.jobCode} onChange={(event)=>updateEditTask('jobCode', event.target.value)}><option value="">Chọn mã job</option>{MASTER.jobs.map(([code,name])=><option key={code} value={code}>{code} - {name}</option>)}</select></label>
            <label><span>Priority</span><select value={editTask.priority} onChange={(event)=>updateEditTask('priority', event.target.value)}>{['Low','Medium','High','Critical'].map((item)=><option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>Risk Level</span><select value={editTask.risk} onChange={(event)=>updateEditTask('risk', event.target.value)}>{['Low','Medium','High','Critical'].map((item)=><option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>Traffic Light</span><select value={editTask.traffic} onChange={(event)=>updateEditTask('traffic', event.target.value)}>{['Green','Amber','Red'].map((item)=><option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>Link minh chứng / deliverable</span><input value={editTask.deliverableLink} onChange={(event)=>updateEditTask('deliverableLink', event.target.value)} placeholder="https://..." /></label>
            <label style={{gridColumn:'1 / -1'}}><span>Link nguồn</span><input value={editTask.sourceUrl} onChange={(event)=>updateEditTask('sourceUrl', event.target.value)} placeholder="https://..." /></label>
          </div><div className="row" style={{justifyContent:'flex-end',marginTop:10}}><button className="btn btn-primary" onClick={saveTaskEdit}>Lưu chỉnh sửa</button></div></Card>
          {onDelete && <Card title="Xoá việc trùng"><p className="muted">Dùng khi kế hoạch bị tạo/import trùng. Hãy chắc rằng việc này không còn cần theo dõi trước khi xoá.</p><div className="row" style={{justifyContent:'flex-end'}}><button className="btn btn-danger" onClick={deleteTask}>Xoá công việc này</button></div></Card>}
        </div>}
      </div>
      <div>
        <Card title={'Tr\u1ea1ng th\u00e1i & nh\u1eafc vi\u1ec7c'}>
          <div className="grid">
            <label><span>{'Tr\u1ea1ng th\u00e1i'}</span><select value={task.stage || 'assigned'} onChange={(event)=>updateTaskStatus(event.target.value)} disabled={readOnly || isAdminRequest || taskCompleted || (!canManageTask && !canStaff)}>
              <option value="assigned">{'M\u1edbi giao'}</option>
              <option value="acknowledged">{'\u0110\u00e3 nh\u1eadn vi\u1ec7c'}</option>
              <option value="in_progress">{'\u0110ang th\u1ef1c hi\u1ec7n'}</option>
              <option value="reported">Cần duyệt</option>
              <option value="explain_requested">{'C\u1ea7n b\u1ed5 sung'}</option>
              <option value="controller_approved">{'Ho\u00e0n th\u00e0nh'}</option>
            </select></label>
            <label><span>{'Th\u1eddi gian nh\u1eafc'}</span><input type="datetime-local" value={reminderAt} disabled={readOnly} onChange={(event)=>setReminderAt(event.target.value)} /></label>
            <label><span>{'N\u1ed9i dung nh\u1eafc'}</span><textarea rows="2" value={reminderNote} disabled={readOnly} onChange={(event)=>setReminderNote(event.target.value)} placeholder={'V\u00ed d\u1ee5: nh\u1eafc g\u1eedi minh ch\u1ee9ng tr\u01b0\u1edbc 16h'} /></label>
            {!readOnly ? <button className="btn" type="button" onClick={saveReminder}>{'L\u01b0u nh\u1eafc vi\u1ec7c'}</button> : null}
          </div>
        </Card>
        <Card title="Thông tin nhanh"><div className="pill-row"><Badge tone="b-blue">{task.jobCode || 'Việc thường'}</Badge><Badge tone="b-purple">Ưu tiên: {task.priority}</Badge><Badge tone={task.risk === 'High' || task.risk === 'Critical' ? 'b-red' : 'b-green'}>Rủi ro: {task.risk}</Badge><Badge tone={task.traffic === 'Red' ? 'b-red' : task.traffic === 'Amber' ? 'b-amber' : 'b-green'}>{task.traffic === 'Red' ? 'Cần chú ý' : task.traffic === 'Amber' ? 'Theo dõi sát' : 'Ổn'}</Badge></div><p className="muted">Hạn hoàn thành: {task.deadline}</p>{task.deadlineRule ? <p className="muted">Mốc deadline trong Excel: {task.deadlineRule}</p> : null}<p className="muted">Duyệt: {DIRECTOR_APPROVER_LABEL}</p><p className="muted">Người phối hợp: {participantNamesForTask(task).join(', ') || 'Chưa có'}</p>{task.externalParticipants?.length ? <p className="muted">Phối hợp ngoài V-Work: {task.externalParticipants.join(', ')}</p> : null}{task.expectedHours ? <p className="muted">Thời lượng dự kiến: {task.expectedHours} giờ</p> : null}{task.sourceFile ? <p className="muted">Nguồn: {task.sourceFile} · {task.sourceSheet || '-'} · dòng {task.sourceRow || '-'}</p> : null}<p className="muted">Minh chứng: {task.evidenceLink || task.deliverableLink ? <a href={task.evidenceLink || task.deliverableLink} target="_blank">Mở link</a> : 'Chưa có'}</p></Card>
        <Card title="Nguồn việc"><table><tbody><tr><th>Nguồn</th><td>{task.sourceModule === 'vplanning' || !task.sourceModule ? 'V-Work' : task.sourceModule}</td></tr><tr><th>Mã tham chiếu</th><td>{task.sourceId || task.projectCode || 'Việc chung'}</td></tr><tr><th>Liên kết</th><td>{task.sourceUrl ? <a href={task.sourceUrl} target="_blank">Mở nguồn</a> : 'Chưa liên kết'}</td></tr></tbody></table></Card>
        <Card title="Lịch sử">{(task.activity || []).length ? <div className="timeline">{task.activity.map((item,idx)=><div className="timeline-item" key={idx}><strong>{item.action}</strong><div>{item.note}</div><small>{item.by} · {item.role} · {new Date(item.at).toLocaleString('vi-VN')}</small></div>)}</div> : <p className="muted">Chưa có lịch sử thao tác.</p>}</Card>
        <Card title="Lịch sử báo cáo">{task.reports?.length ? task.reports.map((item, idx)=><p key={idx}><strong>{item.by}</strong>: {item.note}<br/><span className="muted">{item.date}</span></p>) : <p className="muted">Chưa có báo cáo.</p>}</Card>
      </div>
    </div>
  </div></div>;
}
function Dashboard({ tasks, setTasks, role, me, currentUser, setPage }){
  const [detail, setDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [selectedOwner, setSelectedOwner] = useState(null);
  const mine = getVisibleTasks(tasks, role, me, currentUser);
  const projectOptions = ['all', ...new Set(mine.map((task)=>task.projectCode || 'Việc chung'))];
  const coordinated = filterTasksByStatus(mine, statusFilter).filter((task)=>projectFilter === 'all' || (task.projectCode || 'Việc chung') === projectFilter);
  const waiting = getReviewTasks(tasks, role);
  const counts = statusCounts(mine);
  const patch = (id, data) => setTasks((previous)=>previous.map((task)=>task.id === id ? {...task, ...data} : task));
  if (selectedOwner) return <WorkloadDetail owner={selectedOwner} tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} onBack={()=>setSelectedOwner(null)} />;
  return <div><div className="grid grid-4">
    <div className="kpi"><div className="num">{mine.length}</div><div className="lbl">Việc trong phạm vi</div></div>
    <div className="kpi"><div className="num" style={{color:'var(--red)'}}>{counts.overdue}</div><div className="lbl">Quá hạn</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--purple)'}}>{counts.pending || waiting.length}</div><div className="lbl">Chờ xử lý / chờ duyệt</div></div>
    <div className="kpi"><div className="num" style={{color:'var(--green)'}}>{counts.completed}</div><div className="lbl">Hoàn thành</div></div>
  </div>
  <Card title="Bức tranh kế hoạch công việc" action={can(role, 'import_excel') ? <button className="btn btn-primary" onClick={()=>setPage('independent')}>Khởi tạo kế hoạch</button> : null}>
    <WorkOverview tasks={mine} onOpenTask={setDetail} />
    <div className="workload-strip">
      <div>
        <h4>{'Workload theo ng\u01b0\u1eddi'}</h4>
        <p className="muted">{'B\u1ea5m t\u00ean nh\u00e2n s\u1ef1 \u0111\u1ec3 xem to\u00e0n b\u1ed9 vi\u1ec7c v\u00e0 \u0111i\u1ec3m t\u1ea3i.'}</p>
      </div>
      <WorkloadSnapshot tasks={mine} onOpenOwner={setSelectedOwner} />
    </div>
  </Card>
  <Card title="Bảng điều phối công việc" action={<div className="row"><label><span>Dự án</span><select value={projectFilter} onChange={(event)=>setProjectFilter(event.target.value)}>{projectOptions.map((item)=><option key={item} value={item}>{item === 'all' ? 'Tất cả dự án' : item}</option>)}</select></label><label><span>Trạng thái</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}>{STATUS_FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>}>
    <TaskTable rows={coordinated} onOpen={setDetail} />
  </Card>
  {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}</div>;
}
function AccessDenied(){
  return <Card title="Không đủ quyền"><p className="muted">Tài khoản của bạn chưa được cấp quyền thao tác tại khu vực này. Vui lòng liên hệ người quản lý V-Work để được hỗ trợ.</p></Card>;
}
function Intake({ tasks, setTasks, role, currentUser }){
  const [tab, setTab] = useState('excel');
  const [preview, setPreview] = useState([]);
  const [mappingSource, setMappingSource] = useState(null);
  const [importContext, setImportContext] = useState({ profile:null, fileName:'', sheetName:'', headerIndex:0 });
  const [bulkDeadline, setBulkDeadline] = useState(()=>{
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [anchorDate, setAnchorDate] = useState(()=>localIsoDate(new Date()));
  const [librarySetup, setLibrarySetup] = useState(()=>({ projectCode:'', ownerId:'', startDate:localIsoDate(new Date()), deadline:localIsoDate(new Date()) }));
  const [message, setMessage] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(PROJECT_TEMPLATES[0].id);
  const [meta, setMeta] = useState({ code:'NEW-PLAN', customer:'Khách hàng', start:addDays(0), classes:'1', learners:'30' });
  if (!can(role, 'import_excel')) return <AccessDenied role={role} />;
  const selectedRows = preview.filter((row)=>row.selected !== false);
  const valid = selectedRows.filter((row)=>row.importAction !== 'skip' && !row.errors.length);
  const invalid = selectedRows.filter((row)=>row.importAction !== 'skip' && row.errors.length).length;
  const skipped = preview.filter((row)=>row.importAction === 'skip' || row.selected === false).length;
  const importNow = new Date();
  const importToday = `${importNow.getFullYear()}-${String(importNow.getMonth() + 1).padStart(2, '0')}-${String(importNow.getDate()).padStart(2, '0')}`;
  const directorImportUser = MASTER.users.find((user)=>(user.roles || []).includes('vplanning_director'));
  const importOwnerOptions = [
    ...(directorImportUser ? [{ id:directorImportUser.email, name:'Giám đốc Hải Lê', taskOwnerName:directorImportUser.name }] : []),
    ...uniqueOwnersByName(MASTER.owners),
  ];
  function prepareImportRows(rows) {
    const sourceRows = (Array.isArray(rows) ? rows : []).map((row)=>({
      ...row,
      baseErrors:Array.isArray(row.baseErrors) ? row.baseErrors : [],
      selected:row.excludedReason ? false : row.selected !== false,
    }));
    const validatedRows = validateRows(sourceRows);
    return classifyImportRows(validatedRows.map((row, index)=>({
      ...row,
      errors:[...new Set([...(sourceRows[index]?.baseErrors || []), ...(row.errors || [])])],
    })), tasks);
  }
  function loadImportPreview(rows, context = {}) {
    setPreview(prepareImportRows(rows));
    setImportContext({ profile:context.profile || IMPORT_PROFILE.generic, fileName:context.fileName || '', sheetName:context.sheetName || '', headerIndex:context.headerIndex || 0 });
    setBulkDeadline(importToday);
    setAnchorDate(importToday);
  }
  function loadDetectedImport(result) {
    const source = {
      headers:result.headers || [],
      rawRows:result.rawRows || [],
      mapping:result.mapping || {},
      context:result.context || {},
      unmappedHeaders:result.unmappedHeaders || [],
    };
    setMappingSource(source);
    loadImportPreview(result.preview || [], result.context || {});
  }
  function updateDetectedColumn(fieldKey, sourceHeader) {
    if (!mappingSource) return;
    const mapping = { ...mappingSource.mapping, [fieldKey]:sourceHeader };
    const profile = detectWorkbookProfile(Object.values(mapping).filter(Boolean));
    const context = { ...mappingSource.context, profile };
    const nextSource = { ...mappingSource, mapping, context, unmappedHeaders:unmappedImportHeaders(mappingSource.headers, mapping) };
    setMappingSource(nextSource);
    loadImportPreview(convertFlexibleWorkbookRows(mapRowsWithImportMapping(mappingSource.rawRows, mapping), currentUser, context), context);
    setMessage('Đã cập nhật ánh xạ cột và kiểm tra lại dữ liệu preview.');
  }
  function updatePreviewDeadline(index, deadline) {
    setPreview((current)=>prepareImportRows(current.map((row, rowIndex)=>rowIndex === index ? {
      ...row,
      deadline,
      deadlineKind:'manual',
      warnings:(row.warnings || []).filter((warning)=>!warning.includes('deadline') && !warning.includes('Mốc nghiệp vụ')),
    } : row)));
  }
  function applyBulkDeadline() {
    if (!bulkDeadline) return;
    setPreview((current)=>prepareImportRows(current.map((row)=>row.selected === false ? row : { ...row, deadline:bulkDeadline, deadlineKind:'manual' })));
    setMessage(`Đã áp dụng hạn ${new Date(`${bulkDeadline}T00:00:00`).toLocaleDateString('vi-VN')} cho ${preview.length} việc trong preview.`);
  }
  function applyAnchorDate() {
    if (!anchorDate) return;
    setPreview((current)=>prepareImportRows(current.map((row)=>{
      if (!['relative','rule'].includes(row.deadlineKind) || !row.deadlineRule) return row;
      const deadlineMeta = deadlineFromImportValue(row.deadlineRule, anchorDate);
      const warnings = (row.warnings || []).filter((warning)=>!warning.includes('Mốc nghiệp vụ'));
      return { ...row, ...deadlineMeta, warnings:[...warnings, deadlineMeta.deadlineWarning].filter(Boolean) };
    })));
    setMessage(`Đã tính lại deadline theo ngày T ${new Date(`${anchorDate}T00:00:00`).toLocaleDateString('vi-VN')}.`);
  }
  function applyLibrarySetup() {
    const owner = importOwnerOptions.find((item)=>String(item.id) === String(librarySetup.ownerId));
    if (!librarySetup.projectCode || !owner || !librarySetup.deadline) {
      setMessage('Cần chọn dự án, người phụ trách chính và deadline trước khi tạo việc từ thư viện.');
      return;
    }
    setPreview((current)=>prepareImportRows(current.map((row)=>row.selected === false ? row : ({
      ...row,
      projectCode:flexibleSourceCode(librarySetup.projectCode, 'VWORK'),
      ownerId:owner.id,
      ownerName:owner.taskOwnerName || owner.name,
      ownerLead:owner.taskOwnerName || owner.name,
      startDate:librarySetup.startDate,
      deadline:librarySetup.deadline,
      deadlineKind:'manual',
    }))));
    setMessage(`Đã áp dụng thông tin tạo việc cho ${preview.length} mục trong thư viện.`);
  }
  function updateImportRow(index, patch) {
    setPreview((current)=>prepareImportRows(current.map((row, rowIndex)=>rowIndex === index ? { ...row, ...patch } : row)));
  }
  async function handleFile(event){
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('Đang đọc workbook...');
    try {
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type:'array', cellDates:true });
      const ws = wb.Sheets.WORK_ITEMS || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, blankrows:false });
      const headers = rows[0].map(normalizeHeader);
      const missing = REQUIRED_COLUMNS.filter((column)=>!headers.includes(column));
      if (missing.length) {
        if (hasSimpleWorkbookHeaders(headers)) {
          const objects = rows.slice(1).filter((row)=>row.some((cell)=>String(cell || '').trim())).map((row)=>mapRow(headers,row));
          loadImportPreview(convertSimpleWorkbookRows(objects, currentUser, { fileName:file.name, sheetName:wb.SheetNames[0], headerIndex:0 }), { profile:IMPORT_PROFILE.library, fileName:file.name, sheetName:wb.SheetNames[0], headerIndex:0 });
          setMessage(`Đã đọc ${objects.length} dòng từ form thông tin công việc.`);
          return;
        }
        loadImportPreview([{ projectCode:'', title:'Workbook thiếu cột bắt buộc', ownerName:'', deadline:'', jobCode:'', priority:'', risk:'', traffic:'', baseErrors:missing.map((column)=>`Thiếu cột ${column}`), checklist:[] }], { profile:IMPORT_PROFILE.generic, fileName:file.name, sheetName:wb.SheetNames[0], headerIndex:0 });
        setMessage('Workbook chưa đúng cấu trúc.');
        return;
      }
      const objects = rows.slice(1).filter((row)=>row.some((cell)=>String(cell || '').trim())).map((row)=>mapRow(headers,row));
      loadImportPreview(convertWorkbookRows(objects), { profile:IMPORT_PROFILE.standard, fileName:file.name, sheetName:wb.SheetNames[0], headerIndex:0 });
      setMessage(`Đã đọc ${objects.length} dòng từ workbook.`);
    } catch (error) {
      setMessage(getVWorkErrorMessage(error));
    } finally {
      event.target.value = '';
    }
  }
  async function handleFlexibleWorkbookFile(event){
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('Đang đọc workbook...');
    try {
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type:'array', cellDates:true });
      const ws = wb.Sheets.WORK_ITEMS || wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, blankrows:false, defval:'' });
      const headers = (rows[0] || []).map(normalizeHeader);
      const missing = REQUIRED_COLUMNS.filter((column)=>!headers.includes(column));
      if (!missing.length) {
        setMappingSource(null);
        const objects = rows.slice(1).filter((row)=>row.some((cell)=>String(cell || '').trim())).map((row)=>mapRow(headers,row));
        loadImportPreview(convertWorkbookRows(objects), { profile:IMPORT_PROFILE.standard, fileName:file.name, sheetName:ws === wb.Sheets.WORK_ITEMS ? 'WORK_ITEMS' : wb.SheetNames[0], headerIndex:0 });
        setMessage(`Đã đọc ${objects.length} dòng từ workbook đúng template.`);
        return;
      }
      const flexible = readFlexibleWorkbookPreview(XLSX, wb, currentUser, file.name);
      if (flexible.preview.length) loadDetectedImport(flexible);
      else {
        setMappingSource(null);
        loadImportPreview([{ projectCode:'', title:'Không đọc được công việc từ workbook', ownerName:'', deadline:'', jobCode:'', priority:'', risk:'', traffic:'', baseErrors:['Không tìm thấy cột nội dung công việc gần nghĩa trong file.'], checklist:[] }], flexible.context);
      }
      setMessage(flexible.preview.length ? `Đã nhận diện ${flexible.profile.label}: ${flexible.preview.length}/${flexible.count} dòng từ sheet ${flexible.sheetName}, hàng tiêu đề ${flexible.headerIndex + 1}.` : 'Workbook chưa đúng mẫu và không tìm được dòng công việc.');
    } catch (error) {
      setMessage(getVWorkErrorMessage(error));
    } finally {
      event.target.value = '';
    }
  }
  async function handleDocxFile(event){
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage('Đang đọc file Word...');
    try {
      const detected = await readFlexibleDocxPreview(file, currentUser);
      if (!detected.preview.length) {
        setMappingSource(null);
        loadImportPreview([{ projectCode:'', title:'File Word chưa có bảng công việc hợp lệ', ownerName:'', deadline:'', jobCode:'', priority:'', risk:'', traffic:'', baseErrors:['Không tìm thấy bảng có cột tên công việc và các cột thông tin liên quan.'], checklist:[] }], { profile:IMPORT_PROFILE.generic, fileName:file.name, sheetName:'Word', headerIndex:0 });
        setMessage('File Word chưa đúng cấu trúc bảng công việc.');
        return;
      }
      loadDetectedImport(detected);
      setMessage(`Đã nhận diện ${detected.preview.length}/${detected.count} công việc từ ${detected.sheetName}; năm áp dụng ${detected.context.documentYear}.`);
    } catch (error) {
      setMessage(getVWorkErrorMessage(error));
    } finally {
      event.target.value = '';
    }
  }
  function generateTemplate(){
    const template = PROJECT_TEMPLATES.find((item)=>item.id === selectedTemplate) || PROJECT_TEMPLATES[0];
    setMappingSource(null);
    loadImportPreview(template.rows(meta), { profile:IMPORT_PROFILE.standard, fileName:template.name, sheetName:'Mẫu hệ thống', headerIndex:0 });
    setMessage(`Đã tạo preview từ mẫu: ${template.name}.`);
  }
  function assign(){
    const base = Math.max(0, ...tasks.map((task)=>Number(task.id) || 0));
    const createRows = valid.filter((row)=>row.importAction === 'create' || row.importAction === 'copy');
    const updateRows = valid.filter((row)=>row.importAction === 'update' && row.duplicateTaskId);
    const cleanImportRow = (row)=>{
      const { errors, warnings, selected, importAction, duplicateTaskId, duplicateStatus, baseErrors, ...task } = row;
      return task;
    };
    const created = createRows.map((row, index)=>({
      ...cleanImportRow(row),
      id:base + index + 1,
      workCode:row.importAction === 'copy' ? uid('CV').toUpperCase() : row.workCode,
      stage:'assigned',
      reports:[],
      leadNote:'',
      controllerNote:'',
      checklist:(row.checklist || []).map((item)=>typeof item === 'string' ? ck(item) : item),
    }));
    const updatesById = new Map(updateRows.map((row)=>[String(row.duplicateTaskId), row]));
    const updatedTasks = tasks.map((task)=>{
      const row = updatesById.get(String(task.id));
      if (!row) return task;
      const incoming = cleanImportRow(row);
      return {
        ...task,
        ...incoming,
        id:task.id,
        stage:task.stage,
        status:task.status,
        complete:task.complete,
        checklist:(task.checklist || []).length ? task.checklist : (incoming.checklist || []).map((item)=>typeof item === 'string' ? ck(item) : item),
        activity:addTaskEvent(task, currentUser, 'Cập nhật từ file', `${row.sourceFile || row.sourceId || 'File import'} · dòng ${row.sourceRow || '-'}`),
      };
    });
    setTasks([...updatedTasks, ...created]);
    setMessage(`Đã tạo ${created.length} việc, cập nhật ${updateRows.length} việc và bỏ qua ${skipped} dòng.`);
    setPreview([]);
    setMappingSource(null);
    setImportContext({ profile:null, fileName:'', sheetName:'', headerIndex:0 });
    setBulkDeadline(importToday);
  }
  return <div>
    <Card title="Khởi tạo công việc từ file" action={<a className="btn" href={TEMPLATE_URL} download>Tải template Excel</a>}><p className="muted">Hệ thống tự nhận diện file phân công dự án và thư viện mẫu công việc. Dữ liệu nguồn, sheet, dòng Excel và quy tắc deadline được giữ lại để đối chiếu sau khi tạo việc.</p></Card>
    <Card>
      <div className="tabs"><button className={tab==='excel'?'active':''} onClick={()=>setTab('excel')}>Upload Excel</button><button className={tab==='docx'?'active':''} onClick={()=>setTab('docx')}>Upload Word</button><button className={tab==='template'?'active':''} onClick={()=>setTab('template')}>Tạo từ mẫu</button><button className={tab==='history'?'active':''} onClick={()=>setTab('history')}>Lịch sử import</button></div>
      {tab==='excel' && <div className="upload"><div style={{fontSize:30}}>XLSX</div><strong>Excel công việc</strong><p className="muted">Hệ thống tự dò sheet và hàng tiêu đề, sau đó phân biệt “Phân công dự án” với “Thư viện mẫu”. Kết quả cần đạt, Điểm kiểm soát công việc và số giờ dự kiến được giữ nguyên; mốc T-14, T-24h… không bị thay bằng ngày giả định.</p><input type="file" accept=".xlsx,.xls" onChange={handleFlexibleWorkbookFile} /></div>}
      {tab==='docx' && <div className="upload"><div style={{fontSize:30}}>DOCX</div><strong>Word công việc</strong><p className="muted">Hệ thống tự tìm bảng công việc và nhận diện các cột gần nghĩa như Dự án, Thời gian, Công việc, Kết quả, Chủ trì và Phối hợp. Bạn có thể kiểm tra hoặc đổi ánh xạ trước khi tạo việc.</p><input type="file" accept=".docx" onChange={handleDocxFile} /></div>}
      {tab==='template' && <div><div className="grid grid-3">{PROJECT_TEMPLATES.map((template)=><button key={template.id} className={`template-card ${selectedTemplate===template.id?'active':''}`} onClick={()=>setSelectedTemplate(template.id)}><span className={`badge ${template.tone}`}>{template.name}</span><span className="muted">{template.desc}</span></button>)}</div><div className="grid grid-4" style={{marginTop:14}}><label><span>Mã dự án</span><input value={meta.code} onChange={(e)=>setMeta({...meta,code:e.target.value})}/></label><label><span>Khách hàng</span><input value={meta.customer} onChange={(e)=>setMeta({...meta,customer:e.target.value})}/></label><label><span>Số lớp</span><input value={meta.classes} onChange={(e)=>setMeta({...meta,classes:e.target.value})}/></label><label><span>Số học viên</span><input value={meta.learners} onChange={(e)=>setMeta({...meta,learners:e.target.value})}/></label></div><div className="row" style={{justifyContent:'flex-end',marginTop:12}}><button className="btn btn-primary" onClick={generateTemplate}>Tạo preview từ mẫu</button></div></div>}
      {tab==='history' && <p className="muted">Bản đầu lưu lịch sử import trong phiên làm việc. Khi nối Supabase sẽ có import batch và audit log riêng.</p>}
    </Card>
    {message && <Card><strong>{message}</strong></Card>}
    {mappingSource && <Card title="Kiểm tra ánh xạ cột"><p className="muted">Hệ thống đã tự nhận diện tên cột. Hãy đổi lựa chọn nếu file của bạn dùng tên khác; preview sẽ được kiểm tra lại ngay.</p><div className="vwork-import-mapping-grid">{IMPORT_MAPPING_FIELDS.map((field)=><label key={field.key}><span>{field.label}{field.required ? ' *' : ''}</span><select value={mappingSource.mapping?.[field.key] || ''} onChange={(event)=>updateDetectedColumn(field.key,event.target.value)}><option value="">Không nhập trường này</option>{mappingSource.headers.map((header, headerIndex)=><option key={`${field.key}-${header}-${headerIndex}`} value={header}>{header}</option>)}</select></label>)}</div>{mappingSource.unmappedHeaders?.length ? <div className="vwork-import-unmapped"><strong>Cột chưa sử dụng</strong><div>{mappingSource.unmappedHeaders.map((header, headerIndex)=><Badge key={`${header}-${headerIndex}`} tone="b-amber">{header}</Badge>)}</div><span>Các cột này chưa được đưa vào công việc; hãy ánh xạ nếu có thông tin cần giữ.</span></div> : <div className="vwork-import-mapping-ok"><Badge tone="b-green">Đã sử dụng toàn bộ cột có dữ liệu</Badge></div>}</Card>}
    {preview.length > 0 && <Card title="Thông tin nhận diện file"><div className="vwork-import-profile"><div><Badge tone="b-blue">{importContext.profile?.label || 'Import linh hoạt'}</Badge><strong>{importContext.fileName || 'Nguồn nội bộ'}</strong><span>{importContext.profile?.description}</span></div><div><span>Sheet</span><strong>{importContext.sheetName || '-'}</strong></div><div><span>Hàng tiêu đề</span><strong>{Number(importContext.headerIndex || 0) + 1}</strong></div></div></Card>}
    {preview.length > 0 && importContext.profile?.id === 'assignment' && preview.some((row)=>['relative','rule'].includes(row.deadlineKind)) && <Card title="Quy đổi mốc deadline"><div className="vwork-import-anchor"><div><strong>Ngày T / ngày diễn ra mốc chính</strong><span>Ví dụ T-14 được tính lùi 14 ngày; nếu một ô có nhiều mốc, hệ thống lấy mốc cuối cùng gần T nhất.</span></div><label><span>Ngày T</span><input type="date" value={anchorDate} onChange={(event)=>setAnchorDate(event.target.value)} /></label><button className="btn" type="button" disabled={!anchorDate} onClick={applyAnchorDate}>Tính lại deadline</button></div></Card>}
    {preview.length > 0 && importContext.profile?.id === 'library' && <Card title="Tạo việc từ thư viện"><div className="vwork-import-library-setup"><label><span>Mã dự án</span><input value={librarySetup.projectCode} onChange={(event)=>setLibrarySetup((current)=>({ ...current, projectCode:event.target.value }))} placeholder="Ví dụ: VNPT-RISING" /></label><label><span>Người phụ trách chính</span><select value={librarySetup.ownerId} onChange={(event)=>setLibrarySetup((current)=>({ ...current, ownerId:event.target.value }))}><option value="">Chọn người phụ trách</option>{importOwnerOptions.map((owner)=><option key={owner.id} value={owner.id}>{owner.name}</option>)}</select></label><label><span>Ngày bắt đầu</span><input type="date" value={librarySetup.startDate} onChange={(event)=>setLibrarySetup((current)=>({ ...current, startDate:event.target.value }))} /></label><label><span>Deadline</span><input type="date" value={librarySetup.deadline} onChange={(event)=>setLibrarySetup((current)=>({ ...current, deadline:event.target.value }))} /></label><button className="btn btn-primary" type="button" onClick={applyLibrarySetup}>Áp dụng cho mục đã chọn</button></div></Card>}
    {preview.length > 0 && <Card title={`Preview: ${valid.length} sẵn sàng, ${invalid} lỗi, ${skipped} bỏ qua`} action={<div className="vwork-import-deadline-actions"><label><span>Đổi ngày hạn tất cả</span><input type="date" value={bulkDeadline} onChange={(event)=>setBulkDeadline(event.target.value)} /></label><button className="btn" type="button" disabled={!bulkDeadline} onClick={applyBulkDeadline}>Áp dụng</button><button className="btn btn-primary" disabled={!valid.length || invalid > 0} onClick={assign}>Tạo việc</button></div>}>
      <div className="table-wrap"><table className="vwork-import-preview-table"><thead><tr><th>Chọn</th><th>Nguồn</th><th>Dự án / Công việc</th><th>Chủ trì</th><th>Đầu ra</th><th>Mốc nguồn</th><th>Ngày hạn áp dụng</th><th>Xử lý</th><th>Kiểm tra</th></tr></thead><tbody>{preview.map((row, idx)=><tr key={`${row.sourceSheet || 'source'}-${row.sourceRow || idx}`} className={row.selected === false ? 'is-muted' : ''}><td><input type="checkbox" checked={row.selected !== false} disabled={Boolean(row.excludedReason)} onChange={(event)=>updateImportRow(idx,{ selected:event.target.checked })} /></td><td><strong>{row.sourceSheet || '-'}</strong><div className="muted">Dòng {row.sourceRow || '-'}</div></td><td><div className="vwork-import-task-edit"><input value={row.title || ''} onChange={(event)=>updateImportRow(idx,{ title:event.target.value })} aria-label="Tên công việc" /><input value={row.projectCode || ''} onChange={(event)=>updateImportRow(idx,{ projectCode:flexibleSourceCode(event.target.value,'VWORK') })} aria-label="Mã dự án" /></div><div className="muted">{row.group}</div>{row.note ? <div className="muted">Ghi chú: {row.note}</div> : null}</td><td><select value={row.ownerId || ''} disabled={Boolean(row.excludedReason)} onChange={(event)=>{ const owner=importOwnerOptions.find((item)=>String(item.id)===event.target.value); updateImportRow(idx,{ ownerId:owner?.id || '', ownerName:owner?.taskOwnerName || owner?.name || row.ownerName, ownerLead:owner?.taskOwnerName || owner?.name || row.ownerLead }); }}><option value="">{row.ownerName ? `Chưa ánh xạ: ${row.ownerName}` : 'Chọn chủ trì'}</option>{importOwnerOptions.map((owner)=><option key={owner.id} value={owner.id}>{owner.name}</option>)}</select>{row.externalParticipants?.length ? <div className="muted">Ngoài V-Work: {row.externalParticipants.join(', ')}</div> : null}</td><td><textarea rows="2" value={row.deliverable || ''} onChange={(event)=>updateImportRow(idx,{ deliverable:event.target.value, resultName:event.target.value })} aria-label="Kết quả cần đạt" />{row.expectedHours ? <div className="muted">Dự kiến {row.expectedHours} giờ</div> : null}</td><td><strong>{row.deadlineRule || row.deadlineSourceValue || 'Trống'}</strong><div className="muted">{row.deadlineKind === 'relative' ? 'Mốc tương đối' : row.deadlineKind === 'date' ? 'Ngày trong file' : row.deadlineKind === 'blank' ? 'File để trống' : 'Quy tắc nghiệp vụ'}</div></td><td><div className="vwork-import-deadline"><input type="date" value={row.deadline || ''} onChange={(event)=>updatePreviewDeadline(idx, event.target.value)} />{row.deadline && row.deadline < importToday ? <Badge tone="b-amber">Đã quá hạn</Badge> : null}</div></td><td>{row.duplicateStatus === 'duplicate' ? <select value={row.importAction} onChange={(event)=>updateImportRow(idx,{ importAction:event.target.value })}><option value="skip">Bỏ qua</option><option value="update">Cập nhật việc cũ</option><option value="copy">Tạo bản sao</option></select> : row.excludedReason ? <Badge tone="b-gray">Ngoài V-Work</Badge> : <Badge tone="b-green">Tạo mới</Badge>}</td><td>{row.errors?.length ? <ul className="error-list">{row.errors.map((error)=><li key={error}>{error}</li>)}</ul> : row.excludedReason ? <span className="muted">{row.excludedReason}</span> : <Badge tone="b-green">OK</Badge>}{row.warnings?.length ? <ul className="vwork-import-warnings">{row.warnings.map((warning)=><li key={warning}>{warning}</li>)}</ul> : null}</td></tr>)}</tbody></table></div>
    </Card>}
  </div>;
}
function VWorkAdminRequestDesk({ tasks, setTasks, role, currentUser, mode = 'request', approvalCategory = 'all', embedded = false, onPaymentRequestsLoaded = null }) {
  const proposalOnly = mode === 'proposal';
  const defaultForm = {
    requestType:'purchase',
    title:'',
    vendor:'',
    amount:'',
    purpose:'',
    dueDate:addDays(3),
    formTemplate:'payment',
    note:'',
    borrower:'',
    lender:'',
    loanPurpose:'',
    content:'',
    project:'',
    dynamicDetail:'',
    attachmentFiles:[],
    attachmentLinksText:'',
  };
  const [draft, setDraft] = useState(defaultForm);
  const [actionNotes, setActionNotes] = useState({});
  const [opinionTargets, setOpinionTargets] = useState({});
  const [opinionResponses, setOpinionResponses] = useState({});
  const [paymentConfirmations, setPaymentConfirmations] = useState({});
  const [delegateTargets, setDelegateTargets] = useState({});
  const [requestSearch, setRequestSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState('all');
  const [requestQueueView, setRequestQueueView] = useState('pending');
  const [activeRequestAction, setActiveRequestAction] = useState(null);
  const [mobileApprovalTab, setMobileApprovalTab] = useState('pending');
  const [mobileApprovalTaskId, setMobileApprovalTaskId] = useState('');
  const [mobileApprovalResult, setMobileApprovalResult] = useState(null);
  const [requestPageSize, setRequestPageSize] = useState(100);
  const [approvalView, setApprovalView] = useState(()=>proposalOnly ? 'proposal-create' : mode === 'request' ? 'create' : 'inbox');
  const [delegateTaskId, setDelegateTaskId] = useState('');
  const [expandedRequestIds, setExpandedRequestIds] = useState({});
  const [selectedRequestId, setSelectedRequestId] = useState('');
  const [isEditingRequest, setIsEditingRequest] = useState(false);
  const [requestEditDraft, setRequestEditDraft] = useState(null);
  const [requestReplacementFiles, setRequestReplacementFiles] = useState([]);
  const [proposalRequests, setProposalRequests] = useState(VWORK_REQUEST_SEEDS);
  const [vsuiteRows, setVsuiteRows] = useState([]);
  const [vsuiteDocuments, setVsuiteDocuments] = useState([]);
  const [vsuiteApprovalEvents, setVsuiteApprovalEvents] = useState([]);
  const [vsuiteProfiles, setVsuiteProfiles] = useState([]);
  const [vsuiteLoaded, setVsuiteLoaded] = useState(false);
  const [vsuiteError, setVsuiteError] = useState('');
  const [isVsuiteBusy, setIsVsuiteBusy] = useState(false);
  const accountingPeople = MASTER.orgUnits.find((unit)=>unit.code === 'accounting')?.people || [];
  const peopleOneUserRows = [
    ...vsuiteProfiles.map((profile)=>({ id:profile.id, email:profile.email || '', name:profile.full_name || profile.email || '', title:profile.title || profile.role || '', role:profile.role, ownerIds:[profile.id] })),
    ...MASTER.users,
  ];
  const peopleOneUsers = [...peopleOneUserRows.reduce((map,user)=>{
    const email = String(user.email || '').trim().toLowerCase();
    if (email && !map.has(email)) map.set(email, user);
    return map;
  }, new Map()).values()].filter((user)=>String(user.email).toLowerCase() !== String(currentUser?.email || '').toLowerCase());
  const peopleOneDelegateUsers = peopleOneUsers.filter((user)=>user.email && String(user.email).trim().toLowerCase() !== String(currentUser?.email || '').trim().toLowerCase());
  const canCreateLoanRequest = isAccountingUser(currentUser, role);
  async function loadVsuiteAdminRequests() {
    try {
      // The active payment list is authoritative. Optional documents/log/profile
      // queries must never keep deleted requests alive in browser storage.
      const paymentRequests = await fetchVsuitePaymentRequests();
      const nextPaymentRequests = Array.isArray(paymentRequests) ? paymentRequests : [];
      setVsuiteRows(nextPaymentRequests);
      setVsuiteLoaded(true);
      setVsuiteError('');
      onPaymentRequestsLoaded?.(nextPaymentRequests);
      const [documentsResult, eventsResult, profilesResult] = await Promise.allSettled([
        fetchVsuitePaymentDocuments(),
        fetchVsuitePaymentApprovalEvents().catch(()=>[]),
        fetchVsuitePeopleProfiles().catch(()=>[]),
      ]);
      const paymentDocuments = documentsResult.status === 'fulfilled' ? documentsResult.value : [];
      const approvalEvents = eventsResult.status === 'fulfilled' ? eventsResult.value : [];
      const profiles = profilesResult.status === 'fulfilled' ? profilesResult.value : [];
      setVsuiteDocuments(Array.isArray(paymentDocuments) ? paymentDocuments : []);
      setVsuiteApprovalEvents(Array.isArray(approvalEvents) ? approvalEvents : []);
      setVsuiteProfiles(Array.isArray(profiles) ? profiles : []);
    } catch (error) {
      setVsuiteError(getVWorkErrorMessage(error));
    }
  }
  useEffect(() => {
    if (proposalOnly || approvalCategory === 'proposal') return;
    loadVsuiteAdminRequests();
  }, [proposalOnly, approvalCategory]);
  const localRequests = dedupeVWorkAdminRequestTasks(tasks.filter(isVWorkAdminRequest));
  const documentsByPaymentId = useMemo(()=>vsuiteDocuments.reduce((map, document)=>{
    const key = String(document?.payment_request_id || '');
    if (!key) return map;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(document);
    return map;
  }, new Map()), [vsuiteDocuments]);
  const approvalEventsByPaymentId = useMemo(()=>vsuiteApprovalEvents.reduce((map, event)=>{
    const key = String(event?.entity_id || '');
    if (!key) return map;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(event);
    return map;
  }, new Map()), [vsuiteApprovalEvents]);
  const remoteRequestTasks = vsuiteRows.map((row)=>vsuitePaymentRequestToVWorkTask(row, documentsByPaymentId.get(String(row?.id || '')) || [], approvalEventsByPaymentId.get(String(row?.id || '')) || [], vsuiteProfiles.find((profile)=>String(profile.id) === String(row?.requester_profile_id || ''))));
  useEffect(() => {
    if (!vsuiteLoaded) return;
    const activePaymentIds = new Set(vsuiteRows.map((row)=>String(row?.id || '')).filter(Boolean));
    const activeRequestCodes = new Set(vsuiteRows.map((row)=>String(row?.code || '')).filter(Boolean));
    setTasks((current)=>{
      const next = current.filter((task)=>{
        if (!isVWorkAdminRequest(task)) return true;
        const meta = adminRequestMeta(task);
        const paymentId = String(meta.vsuitePaymentRequestId || '');
        const requestCode = String(task.sourceId || meta.requestCode || '');
        if (!paymentId) return true;
        return activePaymentIds.has(paymentId) || (requestCode && activeRequestCodes.has(requestCode));
      });
      return next.length === current.length ? current : next;
    });
  }, [vsuiteLoaded, vsuiteRows]);
  const requests = mergeVWorkAdminRequestSources(localRequests, remoteRequestTasks, vsuiteLoaded);
  const proposalRequestRows = dedupeVWorkProposalRequests([
    ...tasks.filter(isVWorkProposalRequestTask).map(proposalRequestTaskToRequest),
    ...proposalRequests,
  ]);
  const directorCanCreateRequests = !isDirectorUser(currentUser, role);
  const requestApprovalOnly = mode === 'approval' || (!proposalOnly && !directorCanCreateRequests);
  const showPaymentApproval = !requestApprovalOnly || approvalCategory !== 'proposal';
  const showProposalApproval = requestApprovalOnly && approvalCategory !== 'request';
  const trackingRequests = mode === 'request' && !requestApprovalOnly
    ? requests.filter((task)=>{
        const meta = adminRequestMeta(task);
        return currentUserMatchesTaskIdentity(
          currentUser,
          meta.requesterProfileId || meta.requesterEmail,
          meta.requesterName || task.ownerName,
        );
      })
    : requests;
  const visibleRequests = mode !== 'approval' || requestQueueView === 'all'
    ? trackingRequests
    : requestQueueView === 'processed'
      ? trackingRequests.filter((task)=>!isVWorkAdminRequestAwaitingCurrentUser(task, role, currentUser))
      : trackingRequests.filter((task)=>isVWorkAdminRequestAwaitingCurrentUser(task, role, currentUser));
  const waitingDirector = trackingRequests.filter((task)=>['accountant_review','manager_approved'].includes(adminRequestMeta(task).paymentStatus || '')).length;
  const waitingAccounting = trackingRequests.filter((task)=>['submitted','returned','director_approved'].includes(adminRequestMeta(task).paymentStatus || '')).length;
  const template = VWORK_ADMIN_REQUEST_FORM_TEMPLATES.find((item)=>item.id === draft.formTemplate) || VWORK_ADMIN_REQUEST_FORM_TEMPLATES[1];
  const adminRequestTypesForUser = VWORK_ADMIN_REQUEST_TYPES.filter((item)=>!item.accountingOnly || canCreateLoanRequest);
  const isLoanRequest = draft.requestType === 'loan_proposal';
  const dynamicField = VWORK_ADMIN_REQUEST_DYNAMIC_FIELDS[draft.requestType];
  useEffect(() => {
    if (requestApprovalOnly && approvalView !== 'inbox') setApprovalView('inbox');
  }, [requestApprovalOnly, approvalView]);
  const normalizedRequestSearch = normalizeLegacyText(requestSearch).toLowerCase();
  const filteredRequests = visibleRequests.filter((task)=>{
    const meta = adminRequestMeta(task);
    const status = meta.paymentStatus || 'submitted';
    const statusMatched = requestStatusFilter === 'all'
      || (requestStatusFilter === 'active' && !['paid','rejected'].includes(status))
      || status === requestStatusFilter;
    if (!statusMatched) return false;
    if (!normalizedRequestSearch) return true;
    const haystack = normalizeLegacyText([task.title, task.ownerName, meta.requestCode, meta.vendor, meta.requesterName, meta.amount, meta.paymentStatus].filter(Boolean).join(' ')).toLowerCase();
    return haystack.includes(normalizedRequestSearch);
  });
  const displayedRequests = filteredRequests.slice(0, requestPageSize);
  const selectedRequest = trackingRequests.find((task)=>String(task.id) === String(selectedRequestId)) || null;
  const selectedRequestMeta = selectedRequest ? adminRequestMeta(selectedRequest) : null;
  const selectedRequestStatus = selectedRequestMeta ? vworkAdminRequestStatusMeta(selectedRequestMeta.paymentStatus || 'submitted', selectedRequestMeta) : null;
  const selectedRequestPurposeLines = selectedRequest ? splitAdminRequestText(selectedRequestMeta?.purpose || selectedRequest.method) : [];
  const selectedRequestNoteLines = selectedRequest ? splitAdminRequestText(getAdminRequestNote(selectedRequest)) : [];
  const selectedRequestAttachmentLinks = selectedRequest ? getAdminRequestAttachmentLinks(selectedRequest) : [];
  const selectedRequestAttachmentFiles = selectedRequest ? getAdminRequestAttachmentFiles(selectedRequest) : [];
  const setField = (key, value) => setDraft((current)=>({ ...current, [key]:value }));
  const toggleRequestDetail = (taskId) => setExpandedRequestIds((current)=>({ ...current, [taskId]:!current[taskId] }));
  function canEditAdminRequest(task) {
    if (!task || mode !== 'request' || requestApprovalOnly) return false;
    const meta = adminRequestMeta(task);
    const status = meta.paymentStatus || 'submitted';
    const isRequester = currentUserMatchesTaskIdentity(
      currentUser,
      meta.requesterProfileId || meta.requesterEmail,
      meta.requesterName || task.ownerName,
    );
    return isRequester && ['draft','submitted','returned'].includes(status);
  }
  function openRequestDetail(task) {
    setSelectedRequestId(task.id);
    setIsEditingRequest(false);
    setRequestEditDraft(null);
    setRequestReplacementFiles([]);
  }
  function beginEditRequest(task) {
    if (!canEditAdminRequest(task)) return;
    const meta = adminRequestMeta(task);
    setRequestEditDraft({
      title:task.title || '',
      vendor:meta.vendor || '',
      amount:String(meta.amount || ''),
      dueDate:task.deadline || '',
      purpose:meta.purpose || task.method || '',
      note:meta.note || '',
    });
    setRequestReplacementFiles([]);
    setIsEditingRequest(true);
  }
  function assignFromProposal(request) {
    if (request.type === 'collaboration') {
      const collaboratorOwnerIds = [...new Set((request.collaboratorOwnerIds || []).filter(Boolean))];
      const collaboratorNames = collaboratorOwnerIds.map((id)=>ownerById(id)?.name).filter(Boolean);
      setTasks(tasks.map((task)=>String(task.id) === String(request.targetTaskId) ? {
        ...task,
        participantOwnerIds:[...new Set([...participantOwnerIdsForTask(task), ...collaboratorOwnerIds])],
        participantNames:[...new Set([...participantNamesForTask(task), ...collaboratorNames])],
        participants:[...new Set([...participantNamesForTask(task), ...collaboratorNames])].join(', '),
        activity:addTaskEvent(task, currentUser, 'Duyệt đề xuất phối hợp', `${request.id} - thêm ${collaboratorNames.join(', ') || 'người phối hợp'}`),
      } : task));
      setProposalRequests(proposalRequests.map((item)=>item.id === request.id ? {
        ...item,
        status:'assigned',
        flowLog:[...(item.flowLog || []), { action:'Giám đốc duyệt phối hợp', by:currentUser?.name || currentUser?.email || 'V-Work', at:new Date().toISOString(), note:`Đã thêm ${collaboratorNames.join(', ') || 'người phối hợp'} vào công việc.` }],
      } : item));
      updateProposalRequest({
        ...request,
        status:'assigned',
        flowLog:[...(request.flowLog || []), { action:'Giám đốc duyệt phối hợp', by:currentUser?.name || currentUser?.email || 'V-Work', at:new Date().toISOString(), note:`Đã thêm ${collaboratorNames.join(', ') || 'người phối hợp'} vào công việc.` }],
      });
      notifyVWork(`Đã thêm người phối hợp vào công việc theo đề xuất "${request.title}".`);
      return;
    }
    const base = Math.max(0, ...tasks.map((task)=>Number(task.id) || 0));
    const owner = ownerById(request.ownerId) || ownerById(currentUser?.ownerIds?.[0]) || MASTER.owners[0];
    const task = {
      id:base + 1,
      projectCode:'',
      customer:'PeopleOne',
      group:'Đề xuất được duyệt',
      title:request.title,
      workType:request.group || 'Đề xuất công việc',
      workCode:uid('RQJOB').toUpperCase(),
      ownerLead:owner?.name || currentUser?.name || '',
      ownerId:owner?.id || currentUser?.ownerIds?.[0] || '',
      ownerName:owner?.name || currentUser?.name || currentUser?.email || '',
      participants:'',
      deadline:addDays(request.urgency === 'Gấp' ? 1 : request.urgency === 'Trong ngày' ? 0 : 3),
      startDate:addDays(0),
      jobCode:request.assignJobCode || 'JOB-OPS',
      status:'assigned',
      priority:request.urgency === 'Gấp' ? 'High' : 'Medium',
      complete:0,
      risk:request.urgency === 'Gấp' ? 'High' : 'Medium',
      traffic:request.urgency === 'Gấp' ? 'Amber' : 'Green',
      sourceModule:'vwork_proposal',
      sourceId:request.id,
      requestKind:'work_proposal',
      checklist:standardChecklistForJob(request.assignJobCode || 'JOB-OPS'),
      method:[request.detail, `Nguồn: đề xuất ${request.id}`].filter(Boolean).join('\n\n'),
      reports:[],
      activity:addTaskEvent({ activity:[] }, currentUser, 'Duyệt đề xuất & giao việc', `${request.id} - ${request.title}`),
      errors:[],
      stage:'assigned',
    };
    setTasks([task, ...tasks]);
    setProposalRequests(proposalRequests.map((item)=>item.id === request.id ? {
      ...item,
      status:'assigned',
      flowLog:[...(item.flowLog || []), { action:'Duyệt & giao việc', by:currentUser?.name || currentUser?.email || 'V-Work', at:new Date().toISOString(), note:`Chuyển thành việc ${task.workCode}` }],
    } : item));
    updateProposalRequest({
      ...request,
      status:'assigned',
      flowLog:[...(request.flowLog || []), { action:'Duyệt & giao việc', by:currentUser?.name || currentUser?.email || 'V-Work', at:new Date().toISOString(), note:`Chuyển thành việc ${task.workCode}` }],
    });
    notifyVWork(`Đã chuyển đề xuất "${request.title}" thành công việc.`);
  }
  function persistProposalRequest(request) {
    setProposalRequests((previous)=>dedupeVWorkProposalRequests([request, ...previous]));
    setTasks((previous)=>{
      const existing = previous.find((task)=>isVWorkProposalRequestTask(task) && String(task.sourceId) === String(request.id));
      if (existing) {
        return previous.map((task)=>task === existing ? {
          ...task,
          title:request.title || task.title,
          method:[request.detail, `Nguồn: đề xuất ${request.id}`].filter(Boolean).join('\n\n'),
          workProposal:request,
          activity:addTaskEvent(task, currentUser, 'Cập nhật đề xuất công việc', request.status || 'pending'),
        } : task);
      }
      const base = Math.max(0, ...previous.map((task)=>Number(task.id) || 0)) + 1;
      return [createVWorkProposalRequestTask(request, base, currentUser), ...previous];
    });
  }
  function updateProposalRequest(request) {
    setProposalRequests((previous)=>dedupeVWorkProposalRequests(previous.map((item)=>item.id === request.id ? request : item)));
    setTasks((previous)=>previous.map((task)=>isVWorkProposalRequestTask(task) && String(task.sourceId) === String(request.id) ? {
      ...task,
      title:request.title || task.title,
      workProposal:request,
      activity:addTaskEvent(task, currentUser, 'Cập nhật trạng thái đề xuất', request.status || 'pending'),
    } : task));
  }
  function deleteProposalRequest(request) {
    setProposalRequests((previous)=>previous.filter((item)=>String(item.id) !== String(request.id)));
    setTasks((previous)=>previous.filter((task)=>!(isVWorkProposalRequestTask(task) && String(task.sourceId) === String(request.id))));
    notifyVWork(`Đã xóa đề xuất "${request.title}".`, 'warning');
  }
  async function submitAdminRequest() {
    const loanMode = draft.requestType === 'loan_proposal';
    const title = loanMode ? (draft.title.trim() || `Đề xuất vay tiền - ${draft.borrower.trim() || 'PeopleOne'}`) : draft.title.trim();
    const amount = Number(String(draft.amount || '').replace(/[^\d.]/g, ''));
    if (loanMode && !canCreateLoanRequest) {
      notifyVWork('Chỉ Kế toán được tạo Đề xuất vay tiền.', 'warning');
      return;
    }
    if (loanMode && (!draft.borrower.trim() || !draft.lender.trim() || !amount || !draft.loanPurpose.trim() || !draft.dueDate || !draft.content.trim() || !draft.attachmentFiles.length)) {
      notifyVWork('Hãy nhập đủ bên đi vay, bên cho vay, số tiền, mục đích, thời hạn trả, nội dung và file đính kèm.', 'warning');
      return;
    }
    if (loanMode && draft.attachmentFiles.some((file)=>!isAllowedLoanAttachmentFile(file))) {
      notifyVWork('Đề xuất vay tiền chỉ chấp nhận file Word hoặc PDF.', 'warning');
      return;
    }
    if (!title || !amount) return;
    const base = Math.max(0, ...tasks.map((task)=>Number(task.id) || 0));
    const ownerName = currentUser?.name || currentUser?.email || 'V-Work';
    const purposeText = loanMode ? loanPurposeText(draft) : [draft.purpose.trim(), draft.dynamicDetail.trim()].filter(Boolean).join('\n');
    const noteText = loanMode ? draft.note.trim() : draft.note.trim();
    const vendorText = loanMode ? draft.lender.trim() : draft.vendor.trim();
    const attachmentLinks = [...new Set([
      ...parseVWorkAttachmentLinks(draft.attachmentLinksText),
      ...getAdminRequestAttachmentLinks({ adminRequest:{ note:noteText, purpose:purposeText } }),
    ])];
    const attachmentFiles = draft.attachmentFiles.map((file)=>({
      name:file.name,
      type:file.type || String(file.name || '').split('.').pop() || '',
      size:file.size || 0,
    }));
    const requestCode = `HC-${Date.now().toString(36).toUpperCase()}`;
    setIsVsuiteBusy(true);
    notifyVWork(`Đang tạo phiếu "${title}"...`);
    let paymentRow;
    try {
      paymentRow = await createVsuitePaymentRequest({
        code:requestCode,
        title,
        vendor_name:vendorText,
        payee_name:loanMode ? draft.borrower.trim() : vendorText,
        amount,
        currency:'VND',
        purpose:[purposeText, noteText, `Biểu mẫu: ${template.fileName}`].filter(Boolean).join('\n'),
        due_date:draft.dueDate || addDays(3),
        initialStatus:'submitted',
      });
      notifyVWork(`Đã tiếp nhận phiếu "${title}". Đang hoàn tất file đính kèm...`);
      try {
        const uploadedFiles = await Promise.all(draft.attachmentFiles.map((file)=>uploadVworkDocumentFile({
          file,
          entityId:requestCode,
          documentType:draft.requestType || 'admin_request',
        })));
        uploadedFiles.forEach((uploadedFile, index)=>{
          attachmentFiles[index] = {
            ...attachmentFiles[index],
            name:uploadedFile.fileName || attachmentFiles[index].name,
            url:uploadedFile.fileUrl,
          };
        });
        if (attachmentFiles.length && paymentRow?.id) {
          await Promise.all(attachmentFiles.map((file)=>createVsuitePaymentDocument({
            payment_request_id:paymentRow.id,
            document_type:draft.requestType || 'admin_request',
            title:file.name,
            url:file.url,
            note:`File đính kèm ${title}: ${file.name}`,
            verified:false,
          })));
        }
      } catch (attachmentError) {
        notifyVWork(`Phiếu đã được tạo nhưng file đính kèm chưa hoàn tất: ${getVWorkErrorMessage(attachmentError)}`, 'warning');
      }
      if (loanMode && paymentRow?.id) {
        await advanceVsuitePaymentRequest({
          request:paymentRow,
          action:'accountant_review',
          note:'Kế toán tạo đề xuất vay tiền và gửi trực tiếp Giám đốc duyệt.',
        });
        paymentRow = { ...paymentRow, status:'manager_approved', accountant_note:'Kế toán tạo đề xuất vay tiền và gửi trực tiếp Giám đốc duyệt.' };
      }
      setVsuiteError('');
    } catch (error) {
      const message = getVWorkErrorMessage(error);
      setVsuiteError(message);
      notifyVWork(`Chưa ghi được yêu cầu sang VSuite: ${message}`, 'warning');
      setIsVsuiteBusy(false);
      return;
    }
    setIsVsuiteBusy(false);
    const persistedRequestCode = paymentRow?.code || requestCode;
    const next = {
      id:base + 1,
      projectCode:'ADMIN',
      customer:'PeopleOne',
      group:'Yêu cầu hành chính',
      title,
      workType:'Yêu cầu hành chính',
      workCode:persistedRequestCode,
      ownerId:currentUser?.ownerIds?.[0] || '',
      ownerName,
      ownerLead:ownerName,
      participants:'Kế toán, Giám đốc',
      deadline:draft.dueDate || addDays(3),
      startDate:addDays(0),
      jobCode:'JOB-FINANCE',
      status:'assigned',
      priority:Number(amount) >= 5000000 ? 'High' : 'Medium',
      complete:0,
      risk:Number(amount) >= 5000000 ? 'Medium' : 'Low',
      traffic:'Amber',
      sourceModule:'vwork_admin_request',
      sourceId:persistedRequestCode,
      requestKind:'admin_request',
      checklist:[
        ck('Kế toán duyệt thông tin/chứng từ', loanMode),
        ck(loanMode ? 'Giám đốc duyệt khoản vay' : 'Giám đốc duyệt chi'),
        ck('Kế toán/thủ quỹ xác nhận thanh toán'),
      ],
      method:[purposeText, noteText].filter(Boolean).join('\n\n'),
      reports:[],
      activity:addTaskEvent({ activity:[] }, currentUser, loanMode ? 'Tạo đề xuất vay tiền' : 'Tạo yêu cầu hành chính', `${persistedRequestCode} - ${title}`),
      errors:[],
      stage:'reported',
      adminRequest:{
        vsuitePaymentRequestId:paymentRow?.id || '',
        requestCode:persistedRequestCode,
        requestType:draft.requestType,
        project:draft.project.trim(),
        dynamicDetail:draft.dynamicDetail.trim(),
        vendor:vendorText,
        borrower:loanMode ? draft.borrower.trim() : '',
        lender:loanMode ? draft.lender.trim() : '',
        loanPurpose:loanMode ? draft.loanPurpose.trim() : '',
        amount,
        currency:'VND',
        purpose:purposeText,
        formTemplate:draft.formTemplate,
        formFileName:template.fileName,
        paymentStatus:paymentRow?.status || 'submitted',
        requesterName:ownerName,
        requesterEmail:currentUser?.email || '',
        note:noteText,
        attachmentLinks,
        attachmentFiles,
        accountingNote:'',
        directorNote:'',
        paymentRef:'',
        createdAt:paymentRow?.created_at || new Date().toISOString(),
      },
    };
    setTasks((current)=>[next, ...current]);
    if (paymentRow?.id) setVsuiteRows((current)=>current.some((row)=>String(row.id) === String(paymentRow.id)) ? current.map((row)=>String(row.id) === String(paymentRow.id) ? paymentRow : row) : [paymentRow, ...current]);
    notifyVWork(loanMode ? `Đã gửi đề xuất vay tiền "${title}" cho Giám đốc duyệt.` : `Đã gửi yêu cầu "${title}" cho kế toán duyệt.`);
    setDraft(defaultForm);
  }
  async function attachPaymentRequestDocument(task, file) {
    if (!file) return false;
    const meta = adminRequestMeta(task);
    if (!meta.vsuitePaymentRequestId) {
      notifyVWork('Phiếu này chưa có mã dữ liệu thanh toán để gắn file.', 'warning');
      return false;
    }
    setIsVsuiteBusy(true);
    notifyVWork(`Đang tải lại file "${file.name}"...`);
    try {
      const uploadedFile = await uploadVworkDocumentFile({
        file,
        entityId:meta.requestCode || meta.vsuitePaymentRequestId,
        documentType:meta.requestType || 'admin_request',
      });
      const storedDocument = await createVsuitePaymentDocument({
        payment_request_id:meta.vsuitePaymentRequestId,
        document_type:meta.requestType || 'admin_request',
        title:uploadedFile.fileName || file.name,
        url:uploadedFile.fileUrl,
        note:`File đính kèm bổ sung cho ${task.title}`,
        verified:false,
      });
      setVsuiteDocuments((current)=>[storedDocument, ...current.filter((item)=>String(item.id) !== String(storedDocument.id))]);
      setTasks((current)=>current.map((item)=>String(item.id) === String(task.id) ? {
        ...item,
        adminRequest:{
          ...adminRequestMeta(item),
          attachmentFiles:[
            ...(adminRequestMeta(item).attachmentFiles || []).filter((itemFile)=>itemFile.url || itemFile.name !== file.name),
            { name:uploadedFile.fileName || file.name, type:file.type || '', size:file.size || 0, url:uploadedFile.fileUrl },
          ],
        },
        activity:addTaskEvent(item, currentUser, 'Bổ sung file đính kèm', uploadedFile.fileName || file.name),
      } : item));
      notifyVWork(`Đã tải file "${uploadedFile.fileName || file.name}". Người duyệt có thể mở xem ngay.`);
      setIsVsuiteBusy(false);
      return true;
    } catch (error) {
      notifyVWork(`Chưa tải được file: ${getVWorkErrorMessage(error)}`, 'warning');
      setIsVsuiteBusy(false);
      return false;
    }
  }
  async function saveAdminRequestEdits(task) {
    if (!canEditAdminRequest(task) || !requestEditDraft) return false;
    const title = String(requestEditDraft.title || '').trim();
    const vendor = String(requestEditDraft.vendor || '').trim();
    const purpose = String(requestEditDraft.purpose || '').trim();
    const note = String(requestEditDraft.note || '').trim();
    const dueDate = String(requestEditDraft.dueDate || '').trim();
    const amount = Number(String(requestEditDraft.amount || '').replace(/[^\d.]/g, ''));
    if (!title || !amount || !dueDate || !purpose) {
      notifyVWork('Hãy nhập đủ tiêu đề, số tiền, hạn xử lý và nội dung chi.', 'warning');
      return false;
    }
    const meta = adminRequestMeta(task);
    if (!meta.vsuitePaymentRequestId) {
      notifyVWork('Phiếu chưa đồng bộ VSuite nên chưa thể sửa dữ liệu gốc.', 'warning');
      return false;
    }
    setIsVsuiteBusy(true);
    notifyVWork(`Đang cập nhật phiếu "${task.title}"...`);
    let uploadedDocuments = [];
    try {
      for (const file of requestReplacementFiles) {
        const uploadedFile = await uploadVworkDocumentFile({
          file,
          entityId:meta.requestCode || meta.vsuitePaymentRequestId,
          documentType:meta.requestType || 'admin_request',
        });
        const document = await createVsuitePaymentDocument({
          payment_request_id:meta.vsuitePaymentRequestId,
          document_type:meta.requestType || 'admin_request',
          title:uploadedFile.fileName || file.name,
          url:uploadedFile.fileUrl,
          note:`File thay thế khi sửa phiếu ${meta.requestCode || task.title}`,
          verified:false,
        });
        uploadedDocuments.push(document);
      }
      const storedRequest = await updateVsuitePaymentRequest({
        request:vworkTaskToVsuitePaymentRequest(task),
        title,
        vendorName:vendor,
        payeeName:vendor,
        amount,
        purpose:[purpose, note, meta.formFileName ? `Biểu mẫu: ${meta.formFileName}` : ''].filter(Boolean).join('\n'),
        dueDate,
      });
      const replaceableDocuments = requestReplacementFiles.length
        ? vsuiteDocuments.filter((document)=>String(document.payment_request_id) === String(meta.vsuitePaymentRequestId) && document.document_type !== 'payment_proof')
        : [];
      if (uploadedDocuments.length) {
        await Promise.all(replaceableDocuments.map((document)=>deleteVsuitePaymentDocument(document.id)));
        setVsuiteDocuments((current)=>[
          ...uploadedDocuments,
          ...current.filter((document)=>!replaceableDocuments.some((oldDocument)=>String(oldDocument.id) === String(document.id))),
        ]);
      }
      const attachmentFiles = uploadedDocuments.length
        ? uploadedDocuments.map((document)=>({ name:document.title, type:document.document_type || '', size:0, url:document.url }))
        : (meta.attachmentFiles || []);
      setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(storedRequest.id) ? storedRequest : row));
      setTasks((current)=>current.map((item)=>String(item.id) === String(task.id) ? {
        ...item,
        title,
        deadline:dueDate,
        method:[purpose,note].filter(Boolean).join('\n\n'),
        adminRequest:{
          ...adminRequestMeta(item),
          vendor,
          amount,
          purpose,
          note,
          attachmentFiles,
          updatedAt:storedRequest.updated_at || new Date().toISOString(),
        },
        activity:addTaskEvent(item, currentUser, 'Cập nhật đề nghị', 'Đổi thông tin, hạn xử lý hoặc file đính kèm'),
      } : item));
      setIsEditingRequest(false);
      setRequestEditDraft(null);
      setRequestReplacementFiles([]);
      setVsuiteError('');
      notifyVWork(`Đã cập nhật phiếu "${title}".`);
      setIsVsuiteBusy(false);
      return true;
    } catch (error) {
      if (uploadedDocuments.length) {
        await Promise.allSettled(uploadedDocuments.map((document)=>deleteVsuitePaymentDocument(document.id)));
      }
      const message = getVWorkErrorMessage(error);
      setVsuiteError(message);
      notifyVWork(`Chưa cập nhật được phiếu: ${message}`, 'warning');
      setIsVsuiteBusy(false);
      return false;
    }
  }
  async function advanceRequest(task, action) {
    const note = (actionNotes[task.id] || '').trim();
    const paymentConfirmation = paymentConfirmations[task.id] || {};
    const nextAction = nextVWorkAdminRequestActions(task, role, currentUser).find((item)=>item.action === action);
    if (!nextAction) return false;
    if (action === 'return' && !note.trim()) {
      notifyVWork('Ghi chú trả lại bổ sung là bắt buộc trước khi gửi lại phiếu.', 'warning');
      return false;
    }
    if (action === 'reject' && !note.trim()) {
      notifyVWork('Lý do từ chối là bắt buộc để người gửi biết cần xử lý thế nào.', 'warning');
      return false;
    }
    if (action === 'mark_paid' && (!String(paymentConfirmation.transactionRef || '').trim()
      || !String(paymentConfirmation.paidDate || '').trim()
      || !Number(paymentConfirmation.paidAmount || 0)
      || !paymentConfirmation.proofFile)) {
      notifyVWork('Hãy vào trang Cần duyệt, mở phiếu và bổ sung đầy đủ mã giao dịch, ngày thanh toán, số tiền thực trả, chứng từ thanh toán.', 'warning');
      return false;
    }
    const meta = adminRequestMeta(task);
    const hasLocalMirror = tasks.some((item)=>String(item.id) === String(task.id));
    if (meta.vsuitePaymentRequestId) {
      setIsVsuiteBusy(true);
      notifyVWork(`Đang ${nextAction.label.toLowerCase()} "${task.title}"...`);
      try {
        let vsuiteRequest = vworkTaskToVsuitePaymentRequest(task);
        const vsuiteActions = nextAction.vsuiteActions || [nextAction.action];
        for (const vsuiteAction of vsuiteActions) {
          if (vsuiteAction === 'mark_paid' && paymentConfirmation.proofFile) {
            const uploadedProof = await uploadVworkDocumentFile({
              file:paymentConfirmation.proofFile,
              entityId:meta.vsuitePaymentRequestId,
              documentType:'payment_proof',
            });
            await createVsuitePaymentDocument({
              payment_request_id:meta.vsuitePaymentRequestId,
              document_type:'payment_proof',
              title:uploadedProof.fileName || paymentConfirmation.proofFile.name,
              url:uploadedProof.fileUrl,
              note:`Chứng từ thanh toán · ${paymentConfirmation.transactionRef}`,
              verified:true,
            });
          }
          const storedRequest = await advanceVsuitePaymentRequest({
            request:vsuiteRequest,
            action:vsuiteAction,
            note,
            transactionRef:vsuiteAction === 'mark_paid' ? paymentConfirmation.transactionRef : undefined,
            paidAmount:vsuiteAction === 'mark_paid' ? Number(paymentConfirmation.paidAmount || 0) : undefined,
            paidDate:vsuiteAction === 'mark_paid' ? paymentConfirmation.paidDate : undefined,
          });
          vsuiteRequest = storedRequest;
          setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(storedRequest.id) ? storedRequest : row));
        }
        await loadVsuiteAdminRequests();
        setVsuiteError('');
      } catch (error) {
        const message = getVWorkErrorMessage(error);
        setVsuiteError(message);
        notifyVWork(`Chưa cập nhật được VSuite: ${message}`, 'warning');
        setIsVsuiteBusy(false);
        return false;
      }
      setIsVsuiteBusy(false);
    }
    const nextMeta = {
      ...meta,
      paymentStatus:nextAction.nextStatus,
      accountingNote:['accountant_review','manager_approve','mark_paid'].includes(action) ? note : meta.accountingNote,
      directorNote:action === 'director_approve' ? note : meta.directorNote,
      returnNote:action === 'return' ? note : meta.returnNote,
      rejectionNote:action === 'reject' ? note : meta.rejectionNote,
      paymentRef:action === 'mark_paid' ? paymentConfirmation.transactionRef : meta.paymentRef,
      paidAmount:action === 'mark_paid' ? Number(paymentConfirmation.paidAmount || 0) : meta.paidAmount,
      paidDate:action === 'mark_paid' ? paymentConfirmation.paidDate : meta.paidDate,
      updatedAt:new Date().toISOString(),
    };
    const nextChecklist = (task.checklist || []).map((item, index)=>({
      ...item,
      done: index === 0 ? ['accountant_review','manager_approved','director_approved','paid'].includes(nextAction.nextStatus)
        : index === 1 ? ['director_approved','paid'].includes(nextAction.nextStatus)
        : index === 2 ? nextAction.nextStatus === 'paid'
        : item.done,
    }));
    const showMobileActionResult = () => {
      if (typeof window === 'undefined' || !window.matchMedia('(max-width: 720px)').matches) return;
      setMobileApprovalResult({
        heading:action === 'reject' ? 'Đã từ chối đề nghị' : action === 'return' ? 'Đã trả lại bổ sung' : 'Đã duyệt đề nghị',
        title:task.title,
        status:vworkAdminRequestStatusMeta(nextAction.nextStatus).label,
      });
    };
    if (!hasLocalMirror) {
      notifyVWork(`Đã cập nhật "${task.title}" sang ${vworkAdminRequestStatusMeta(nextAction.nextStatus).label}.`);
      showMobileActionResult();
      return true;
    }
    setTasks(tasks.map((item)=>item.id === task.id ? {
      ...item,
      adminRequest:nextMeta,
      checklist:nextChecklist,
      status:nextAction.nextStatus === 'paid' ? 'completed' : item.status,
      stage:nextAction.nextStatus === 'paid' ? 'controller_approved' : 'reported',
      complete:nextAction.nextStatus === 'paid' ? 100 : nextAction.nextStatus === 'director_approved' ? 80 : nextAction.nextStatus === 'manager_approved' ? 60 : nextAction.nextStatus === 'accountant_review' ? 40 : item.complete,
      activity:addTaskEvent(item, currentUser, nextAction.label, note || vworkAdminRequestStatusMeta(nextAction.nextStatus).label),
    } : item));
    notifyVWork(`Đã cập nhật "${task.title}" sang ${vworkAdminRequestStatusMeta(nextAction.nextStatus).label}.`);
    showMobileActionResult();
    return true;
  }
  function canDeleteAdminRequest(task) {
    const meta = adminRequestMeta(task);
    const status = meta.paymentStatus || 'submitted';
    if (status === 'paid') return false;
    const requesterEmail = String(meta.requesterEmail || '').trim().toLowerCase();
    const currentEmail = String(currentUser?.email || '').trim().toLowerCase();
    return isDirectorUser(currentUser, role)
      || isAccountingUser(currentUser, role)
      || role === 'vplanning_admin'
      || (requesterEmail && requesterEmail === currentEmail && ['draft','submitted','returned'].includes(status));
  }
  async function deleteAdminRequest(task) {
    if (!canDeleteAdminRequest(task)) return;
    const reason = window.prompt(`Nhập lý do xóa phiếu "${task.title}":`, 'Phiếu tạo nhầm hoặc trùng lặp.');
    if (!String(reason || '').trim()) return;
    const meta = adminRequestMeta(task);
    const previousRemoteRow = vsuiteRows.find((row)=>String(row.id) === String(meta.vsuitePaymentRequestId || '')) || null;
    if (meta.vsuitePaymentRequestId) {
      setIsVsuiteBusy(true);
      setVsuiteRows((current)=>current.filter((row)=>String(row.id) !== String(meta.vsuitePaymentRequestId)));
      notifyVWork(`Đang xóa phiếu "${task.title}"...`, 'warning');
      try {
        await softDeleteVsuitePaymentRequest({ requestId:meta.vsuitePaymentRequestId, reason });
        setVsuiteError('');
      } catch (error) {
        if (previousRemoteRow) setVsuiteRows((current)=>current.some((row)=>String(row.id) === String(previousRemoteRow.id)) ? current : [previousRemoteRow, ...current]);
        const message = getVWorkErrorMessage(error);
        setVsuiteError(message);
        notifyVWork(`Chưa xóa được phiếu: ${message}`, 'warning');
        setIsVsuiteBusy(false);
        return;
      }
      setIsVsuiteBusy(false);
    }
    setTasks((previous)=>previous.filter((item)=>String(item.id) !== String(task.id)));
    setExpandedRequestIds((current)=>{ const next={...current}; delete next[task.id]; return next; });
    notifyVWork(`Đã xóa phiếu "${task.title}".`, 'warning');
  }
  async function delegateDirectorApproval(task, ownerIdOverride = '') {
    if (!isDirectorUser(currentUser, role)) return;
    const targetKey = ownerIdOverride || delegateTargets[task.id] || '';
    if (!targetKey) {
      notifyVWork('Hãy chọn người được ủy quyền trước khi xác nhận.', 'warning');
      return false;
    }
    const delegatedUser = peopleOneDelegateUsers.find((user)=>String(user.email || '').toLowerCase() === String(targetKey).toLowerCase() || (user.ownerIds || []).map(String).includes(String(targetKey)));
    const owner = delegatedUser ? { id:delegatedUser.id || delegatedUser.ownerIds?.[0] || delegatedUser.email, name:delegatedUser.name } : ownerById(targetKey) || MASTER.owners.find((item)=>item.id === targetKey);
    if (!owner) {
      notifyVWork('Không tìm thấy tài khoản PeopleOne được chọn.', 'warning');
      return;
    }
    const delegatedApproverEmail = String(delegatedUser?.email || MASTER.users.find((user)=>(user.ownerIds || []).includes(owner.id) || normalizeText(user.name) === normalizeText(owner.name))?.email || '').trim().toLowerCase();
    if (!delegatedApproverEmail) {
      notifyVWork(`Chưa có email hệ thống cho ${owner.name}, không thể lưu ủy quyền.`, 'warning');
      return;
    }
    const meta = adminRequestMeta(task);
    const hasLocalMirror = tasks.some((item)=>String(item.id) === String(task.id));
    let storedDelegatedApproverEmail = delegatedApproverEmail;
    const previousRemoteRow = vsuiteRows.find((row)=>String(row.id) === String(meta.vsuitePaymentRequestId || '')) || null;
    if (meta.vsuitePaymentRequestId) {
      setIsVsuiteBusy(true);
      setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(meta.vsuitePaymentRequestId) ? { ...row, delegated_approver_email:delegatedApproverEmail } : row));
      notifyVWork(`Đang ủy quyền "${task.title}" cho ${owner.name}...`);
      try {
        const storedRequest = await delegateVsuitePaymentRequest({
          request:vworkTaskToVsuitePaymentRequest(task),
          approverEmail:delegatedApproverEmail,
        });
        storedDelegatedApproverEmail = String(storedRequest.delegated_approver_email || delegatedApproverEmail).trim().toLowerCase();
        setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(storedRequest.id) ? storedRequest : row));
        setVsuiteError('');
      } catch (error) {
        if (previousRemoteRow) setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(previousRemoteRow.id) ? previousRemoteRow : row));
        const message = getVWorkErrorMessage(error);
        setVsuiteError(message);
        notifyVWork(`Chưa lưu được ủy quyền: ${message}`, 'warning');
        setIsVsuiteBusy(false);
        return false;
      }
      setIsVsuiteBusy(false);
    }
    const nextMeta = {
      ...meta,
      delegatedApproverId:owner.id,
      delegatedApproverName:owner.name,
      delegatedApproverEmail:storedDelegatedApproverEmail,
      delegatedBy:currentUser?.name || currentUser?.email || 'Giám đốc',
      delegatedAt:new Date().toISOString(),
      updatedAt:new Date().toISOString(),
    };
    if (!hasLocalMirror) {
      notifyVWork(`Đã lưu ủy quyền duyệt cho ${owner.name}.`);
      return true;
    }
    setTasks(tasks.map((item)=>item.id === task.id ? {
      ...item,
      adminRequest:nextMeta,
      activity:addTaskEvent(item, currentUser, 'Ủy quyền duyệt', `Giám đốc ủy quyền cho ${owner.name} toàn quyền quyết định yêu cầu này.`),
    } : item));
    notifyVWork(`Đã ủy quyền duyệt "${task.title}" cho ${owner.name}.`);
    return true;
  }
  async function revokeDirectorDelegation(task) {
    if (!isDirectorUser(currentUser, role)) return;
    const meta = adminRequestMeta(task);
    const previousRemoteRow = vsuiteRows.find((row)=>String(row.id) === String(meta.vsuitePaymentRequestId || '')) || null;
    if (meta.vsuitePaymentRequestId) {
      setIsVsuiteBusy(true);
      setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(meta.vsuitePaymentRequestId) ? { ...row, delegated_approver_email:null } : row));
      notifyVWork(`Đang thu hồi ủy quyền của phiếu "${task.title}"...`);
      try {
        const storedRequest = await delegateVsuitePaymentRequest({ request:vworkTaskToVsuitePaymentRequest(task), approverEmail:'' });
        setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(storedRequest.id) ? storedRequest : row));
        setVsuiteError('');
      } catch (error) {
        if (previousRemoteRow) setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(previousRemoteRow.id) ? previousRemoteRow : row));
        const message = getVWorkErrorMessage(error);
        setVsuiteError(message);
        notifyVWork(`Chưa thu hồi được ủy quyền: ${message}`, 'warning');
        setIsVsuiteBusy(false);
        return;
      }
      setIsVsuiteBusy(false);
    }
    setTasks(tasks.map((item)=>String(item.id) === String(task.id) ? {
      ...item,
      adminRequest:{ ...adminRequestMeta(item), delegatedApproverId:'', delegatedApproverName:'', delegatedApproverEmail:'', delegatedRevokedAt:new Date().toISOString() },
      activity:addTaskEvent(item, currentUser, 'Thu hồi ủy quyền', meta.delegatedApproverName || meta.delegatedApproverEmail || ''),
    } : item));
    notifyVWork(`Đã thu hồi ủy quyền của phiếu "${task.title}".`);
  }
  const approvalNav = requestApprovalOnly
    ? []
    : proposalOnly
      ? [
          ['proposal-create','Tạo Đề xuất',''],
          ['proposal-inbox','Theo dõi đề xuất',String(proposalRequestRows.length)],
        ]
      : [
          ['create','Tạo Đề nghị',''],
          ['inbox','Theo dõi đề nghị',String(trackingRequests.length)],
        ];
  async function requestOpinionForApproval(task) {
    const targetEmail = opinionTargets[task.id] || '';
    const target = peopleOneUsers.find((user)=>String(user.email).toLowerCase() === String(targetEmail).toLowerCase());
    if (!target) {
      notifyVWork('Hãy chọn một tài khoản PeopleOne để đề nghị cho ý kiến.', 'warning');
      return false;
    }
    const note = String(actionNotes[task.id] || '').trim();
    const meta = adminRequestMeta(task);
    const previousRemoteRow = vsuiteRows.find((row)=>String(row.id) === String(meta.vsuitePaymentRequestId || '')) || null;
    if (meta.vsuitePaymentRequestId) {
      setIsVsuiteBusy(true);
      setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(meta.vsuitePaymentRequestId) ? { ...row, opinion_requested_email:target.email, opinion_requested_name:target.name, opinion_request_note:note, opinion_status:'pending' } : row));
      notifyVWork(`Đang gửi đề nghị cho ý kiến tới ${target.name}...`);
      try {
        const storedRequest = await requestVsuitePaymentOpinion({ request:vworkTaskToVsuitePaymentRequest(task), targetEmail:target.email, note });
        setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(storedRequest.id) ? storedRequest : row));
        setVsuiteError('');
      } catch (error) {
        if (previousRemoteRow) setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(previousRemoteRow.id) ? previousRemoteRow : row));
        const message = getVWorkErrorMessage(error);
        setVsuiteError(message);
        notifyVWork(`Chưa gửi được đề nghị cho ý kiến: ${message}`, 'warning');
        setIsVsuiteBusy(false);
        return false;
      }
      setIsVsuiteBusy(false);
    }
    setTasks(tasks.map((item)=>item.id === task.id ? {
      ...item,
      adminRequest:{ ...adminRequestMeta(item), opinionRequestedTo:target.name, opinionRequestedEmail:target.email, opinionRequestedAt:new Date().toISOString(), opinionRequestNote:note, opinionStatus:'pending', opinionResponse:'', opinionRespondedAt:'' },
      activity:addTaskEvent(item, currentUser, 'Đề nghị cho ý kiến', `${target.name}${note ? ` · ${note}` : ''}`),
    } : item));
    notifyVWork(`Đã gửi đề nghị cho ý kiến tới ${target.name}.`);
    return true;
  }
  async function respondApprovalOpinion(task) {
    const response = String(opinionResponses[task.id] || '').trim();
    if (!response) {
      notifyVWork('Hãy nhập ý kiến trước khi gửi.', 'warning');
      return false;
    }
    const meta = adminRequestMeta(task);
    const previousRemoteRow = vsuiteRows.find((row)=>String(row.id) === String(meta.vsuitePaymentRequestId || '')) || null;
    if (meta.vsuitePaymentRequestId) {
      setIsVsuiteBusy(true);
      setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(meta.vsuitePaymentRequestId) ? { ...row, opinion_status:'responded', opinion_response:response, opinion_responded_at:new Date().toISOString() } : row));
      notifyVWork('Đang gửi ý kiến tới người duyệt...');
      try {
        const storedRequest = await respondVsuitePaymentOpinion({ request:vworkTaskToVsuitePaymentRequest(task), response });
        setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(storedRequest.id) ? storedRequest : row));
        setVsuiteError('');
      } catch (error) {
        if (previousRemoteRow) setVsuiteRows((current)=>current.map((row)=>String(row.id) === String(previousRemoteRow.id) ? previousRemoteRow : row));
        const message = getVWorkErrorMessage(error);
        setVsuiteError(message);
        notifyVWork(`Chưa gửi được ý kiến: ${message}`, 'warning');
        setIsVsuiteBusy(false);
        return false;
      }
      setIsVsuiteBusy(false);
    }
    setTasks(tasks.map((item)=>item.id === task.id ? {
      ...item,
      adminRequest:{ ...adminRequestMeta(item), opinionStatus:'responded', opinionResponse:response, opinionRespondedAt:new Date().toISOString() },
      activity:addTaskEvent(item, currentUser, 'Bổ sung ý kiến', response),
    } : item));
    setOpinionResponses((current)=>({ ...current, [task.id]:'' }));
    notifyVWork('Đã gửi ý kiến tới người duyệt.');
    return true;
  }
  async function remindApprovalOpinion(task) {
    const meta = adminRequestMeta(task);
    const target = meta.opinionRequestedTo || meta.delegatedApproverName || 'người liên quan';
    if (meta.vsuitePaymentRequestId) {
      try {
        await remindVsuitePaymentOpinion({ request:vworkTaskToVsuitePaymentRequest(task) });
      } catch (error) {
        notifyVWork(`Chưa gửi được nhắc việc: ${getVWorkErrorMessage(error)}`, 'warning');
        return;
      }
    }
    setTasks(tasks.map((item)=>item.id === task.id ? { ...item, activity:addTaskEvent(item, currentUser, 'Nhắc việc cần duyệt', `Đã nhắc ${target} bổ sung ý kiến.`) } : item));
    notifyVWork(`Đã nhắc ${target} bổ sung ý kiến.`);
  }
  function toggleApprovalChecklist(task, checklistIndex) {
    const currentEntry = task.checklist?.[checklistIndex];
    const currentLabel = typeof currentEntry === 'string' ? currentEntry : currentEntry?.label || '';
    setTasks(tasks.map((item)=>item.id === task.id ? { ...item, checklist:(item.checklist || []).map((entry,index)=>index === checklistIndex ? (typeof entry === 'string' ? { label:entry, done:true } : { ...entry, done:!entry.done }) : entry), activity:addTaskEvent(item, currentUser, 'Cập nhật checklist duyệt', currentLabel) } : item));
  }
  const mobilePendingRequests = requests.filter((task)=>isVWorkAdminRequestAwaitingCurrentUser(task, role, currentUser));
  const mobileProcessedRequests = requests.filter((task)=>{
    const meta = adminRequestMeta(task);
    const delegatedByCurrentDirector = isDirectorUser(currentUser, role)
      && Boolean(meta.delegatedApproverEmail)
      && normalizeText(meta.delegatedBy || '') === normalizeText(currentUser?.name || currentUser?.email || '');
    return ['director_approved','paid','rejected'].includes(meta.paymentStatus || '') || delegatedByCurrentDirector;
  });
  const mobileApprovalRows = mobileApprovalTab === 'pending' ? mobilePendingRequests : mobileProcessedRequests;
  const mobileApprovalTask = requests.find((task)=>String(task.id) === String(mobileApprovalTaskId));
  const mobileApprovalMeta = mobileApprovalTask ? adminRequestMeta(mobileApprovalTask) : null;
  const mobileApprovalActions = mobileApprovalTask ? nextVWorkAdminRequestActions(mobileApprovalTask, role, currentUser) : [];
  const canMobileDelegate = Boolean(mobileApprovalTask)
    && isDirectorUser(currentUser, role)
    && !mobileApprovalMeta?.delegatedApproverEmail
    && !mobileApprovalMeta?.delegatedApproverId
    && ['accountant_review','manager_approved'].includes(mobileApprovalMeta?.paymentStatus || '');
  const mobileApprovalFiles = mobileApprovalTask ? getAdminRequestAttachmentFiles(mobileApprovalTask) : [];
  const mobileApprovalPurpose = mobileApprovalTask ? splitAdminRequestText(mobileApprovalMeta?.purpose || mobileApprovalTask.method) : [];
  const mobileActivePayment = mobileApprovalTask ? paymentConfirmations[mobileApprovalTask.id] || { transactionRef:'', paidDate:new Date().toISOString().slice(0,10), paidAmount:mobileApprovalMeta?.amount || '', proofFile:null } : null;
  return <div className={`vwork-request-stack vwork-approval-handoff vwork-approval-category-${approvalCategory} ${embedded ? 'is-embedded' : ''}`}>
    {requestApprovalOnly && showPaymentApproval ? <div className="vwork-mobile-approval-screen">
          {mobileApprovalResult ? <div className="vwork-mobile-approval-result" role="status"><div className="vwork-mobile-result-icon"><Check size={38} /></div><small>Cập nhật thành công</small><h1>{mobileApprovalResult.heading}</h1><p>{mobileApprovalResult.title}</p><div><span>Trạng thái mới</span><strong>{mobileApprovalResult.status}</strong></div><button type="button" className="primary" onClick={()=>{ setMobileApprovalResult(null); setMobileApprovalTab('pending'); }}>Duyệt phiếu tiếp theo</button><button type="button" onClick={()=>{ setMobileApprovalResult(null); setMobileApprovalTab('done'); }}>Xem phiếu đã xử lý</button></div> : null}
          {!mobileApprovalTask ? <><header className="vwork-mobile-approval-header"><div><small>Xin chào, {currentUser?.name || 'Giám đốc'}</small><h1>Cần bạn duyệt</h1></div><span className="vwork-mobile-pending-count">{mobilePendingRequests.length}</span></header><div className="vwork-mobile-approval-body"><div className="vwork-mobile-approval-tabs" role="tablist"><button type="button" className={mobileApprovalTab==='pending'?'active':''} onClick={()=>setMobileApprovalTab('pending')}>Chờ tôi duyệt · {mobilePendingRequests.length}</button><button type="button" className={mobileApprovalTab==='done'?'active':''} onClick={()=>setMobileApprovalTab('done')}>Đã xử lý · {mobileProcessedRequests.length}</button></div><div className="vwork-mobile-approval-list">{mobileApprovalRows.map((task)=>{ const meta=adminRequestMeta(task); const status=vworkAdminRequestStatusMeta(meta.paymentStatus || 'submitted', meta); return <button type="button" className="vwork-mobile-approval-card" key={task.id} onClick={()=>{ setMobileApprovalTaskId(task.id); setActiveRequestAction(null); }}><span className={`badge ${status.tone}`}>{status.label}</span><time>{task.deadline ? `Hạn ${new Date(task.deadline).toLocaleDateString('vi-VN')}` : 'Cần xử lý'}</time><strong>{task.title}</strong><small>{meta.requestCode || task.sourceId} · {meta.requesterName || task.ownerName || 'Chưa xác định'}</small>{Number(meta.amount || 0) > 0 ? <b>{Number(meta.amount || 0).toLocaleString('vi-VN')} {meta.currency || 'VND'}</b> : null}<em>{mobileApprovalTab === 'pending' ? 'Mở duyệt' : 'Xem lại'}<ArrowRight size={15} /></em></button>})}{!mobileApprovalRows.length ? <div className="vwork-mobile-approval-empty"><strong>{mobileApprovalTab === 'pending' ? 'Bạn đã xử lý hết phiếu' : 'Chưa có phiếu đã xử lý'}</strong><small>{mobileApprovalTab === 'pending' ? 'Các yêu cầu mới sẽ xuất hiện tại đây.' : 'Kết quả duyệt sẽ được lưu tại đây.'}</small></div> : null}</div></div></> : <div className="vwork-mobile-approval-detail"><header><button type="button" aria-label="Quay lại danh sách" onClick={()=>{ setMobileApprovalTaskId(''); setActiveRequestAction(null); }}><ArrowLeft size={20} /></button><strong>Chi tiết phê duyệt</strong><span /></header><main>{mobileApprovalMeta?.opinionRequestedTo ? <div className="vwork-mobile-opinion-banner">Đang tham vấn {mobileApprovalMeta.opinionRequestedTo}{mobileApprovalMeta.opinionResponse ? ` · ${mobileApprovalMeta.opinionResponse}` : ''}</div> : null}<Badge tone={vworkAdminRequestStatusMeta(mobileApprovalMeta?.paymentStatus || 'submitted', mobileApprovalMeta).tone}>{vworkAdminRequestStatusMeta(mobileApprovalMeta?.paymentStatus || 'submitted', mobileApprovalMeta).label}</Badge><h1>{mobileApprovalTask.title}</h1><p className="vwork-mobile-request-meta">{mobileApprovalMeta?.requestCode || mobileApprovalTask.sourceId} · {mobileApprovalMeta?.requesterName || mobileApprovalTask.ownerName || 'Chưa xác định'} · {mobileApprovalTask.startDate ? new Date(mobileApprovalTask.startDate).toLocaleDateString('vi-VN') : ''}</p><section className="vwork-mobile-request-summary">{Number(mobileApprovalMeta?.amount || 0) > 0 ? <div><small>Số tiền đề nghị</small><strong>{Number(mobileApprovalMeta.amount).toLocaleString('vi-VN')} {mobileApprovalMeta.currency || 'VND'}</strong></div> : null}<div><small>Nội dung</small>{mobileApprovalPurpose.map((line,index)=><p key={`${mobileApprovalTask.id}-mobile-purpose-${index}`}>{line}</p>)}</div><div><small>File đính kèm</small>{mobileApprovalFiles.length ? mobileApprovalFiles.map((file)=><a key={`${file.name}-${file.url}`} href={file.url || '#'} target="_blank" rel="noreferrer">{file.name}</a>) : <p>Chưa có file đính kèm</p>}</div></section>{(mobileApprovalTask.checklist || []).length ? <section className="vwork-mobile-checklist"><h2>Checklist duyệt</h2>{mobileApprovalTask.checklist.map((entry,index)=>{ const label=typeof entry==='string'?entry:entry.label; const done=typeof entry==='object'&&entry.done; return <label key={`${label}-${index}`}><input type="checkbox" checked={Boolean(done)} disabled={!mobileApprovalActions.length} onChange={()=>toggleApprovalChecklist(mobileApprovalTask,index)} /><span>{label}</span></label>})}</section> : null}<section className="vwork-mobile-request-log"><h2>Nhật ký</h2>{(mobileApprovalTask.activity || []).slice().reverse().map((item,index)=><div key={`${item.at}-${index}`}><strong>{item.action}</strong><small>{item.by || 'PeopleOne'} · {item.at ? new Date(item.at).toLocaleString('vi-VN') : ''}</small>{item.note ? <p>{item.note}</p> : null}</div>)}</section></main>{mobileApprovalActions.length ? <footer className="vwork-mobile-approval-actions">{mobileApprovalActions.some((item)=>item.action==='director_approve') ? <button className="approve" type="button" onClick={()=>setActiveRequestAction({taskId:mobileApprovalTask.id,mode:'decision',action:'director_approve'})}><Check size={18} />Duyệt đề nghị</button> : null}<div>{canMobileDelegate ? <button type="button" onClick={()=>setActiveRequestAction({taskId:mobileApprovalTask.id,mode:'delegate'})}>Ủy quyền</button> : null}{mobileApprovalActions.some((item)=>item.action==='reject') ? <button className="reject" type="button" onClick={()=>setActiveRequestAction({taskId:mobileApprovalTask.id,mode:'decision',action:'reject'})}><X size={17} />Từ chối</button> : null}<button type="button" onClick={()=>setActiveRequestAction({taskId:mobileApprovalTask.id,mode:'request_opinion'})}><MessageCircle size={17} />Hỏi ý kiến</button></div></footer> : null}{activeRequestAction?.taskId === mobileApprovalTask.id ? <div className="vwork-mobile-sheet-backdrop" onClick={()=>setActiveRequestAction(null)}><section className="vwork-mobile-action-sheet" onClick={(event)=>event.stopPropagation()}><i /><h2>{activeRequestAction.mode === 'delegate' ? 'Ủy quyền phê duyệt' : activeRequestAction.mode === 'request_opinion' ? 'Đề nghị cho ý kiến' : activeRequestAction.action === 'reject' ? 'Từ chối đề nghị' : 'Duyệt đề nghị'}</h2><p>{activeRequestAction.mode === 'delegate' ? 'Chọn đúng tài khoản PeopleOne sẽ chịu trách nhiệm duyệt phiếu này.' : activeRequestAction.mode === 'request_opinion' ? 'Chọn người cần tham vấn trước khi quyết định.' : activeRequestAction.action === 'reject' ? 'Nêu rõ lý do để người gửi chỉnh sửa.' : 'Có thể ghi thêm ý kiến cụ thể khi duyệt.'}</p>{activeRequestAction.mode === 'delegate' ? <select value={delegateTargets[mobileApprovalTask.id] || ''} onChange={(event)=>setDelegateTargets((current)=>({...current,[mobileApprovalTask.id]:event.target.value}))}><option value="">Chọn người được ủy quyền</option>{peopleOneDelegateUsers.map((user)=><option key={user.email} value={user.email}>{user.name}</option>)}</select> : activeRequestAction.mode === 'request_opinion' ? <select value={opinionTargets[mobileApprovalTask.id] || ''} onChange={(event)=>setOpinionTargets((current)=>({...current,[mobileApprovalTask.id]:event.target.value}))}><option value="">Chọn tài khoản PeopleOne</option>{peopleOneUsers.map((user)=><option key={user.email} value={user.email}>{user.name}</option>)}</select> : null}{activeRequestAction.action === 'mark_paid' && mobileActivePayment ? <div className="vwork-payment-confirmation"><label><span>Mã giao dịch</span><input value={mobileActivePayment.transactionRef} onChange={(event)=>setPaymentConfirmations((current)=>({...current,[mobileApprovalTask.id]:{...mobileActivePayment,transactionRef:event.target.value}}))} /></label></div> : null}<textarea rows="4" value={actionNotes[mobileApprovalTask.id] || ''} onChange={(event)=>setActionNotes((current)=>({...current,[mobileApprovalTask.id]:event.target.value}))} placeholder={activeRequestAction.mode === 'request_opinion' ? 'Nội dung cần tham vấn...' : activeRequestAction.action === 'reject' ? 'Lý do từ chối...' : 'Ý kiến khi duyệt (không bắt buộc)...'} /><div><button type="button" onClick={()=>setActiveRequestAction(null)}>Hủy</button><button className={activeRequestAction.action === 'reject' ? 'danger' : activeRequestAction.mode === 'request_opinion' ? 'opinion' : 'confirm'} disabled={isVsuiteBusy} type="button" onClick={async()=>{ const delegatedUser=peopleOneDelegateUsers.find((user)=>user.email === delegateTargets[mobileApprovalTask.id]); const ok=activeRequestAction.mode === 'delegate' ? await delegateDirectorApproval(mobileApprovalTask) : activeRequestAction.mode === 'request_opinion' ? await requestOpinionForApproval(mobileApprovalTask) : await advanceRequest(mobileApprovalTask,activeRequestAction.action); if(ok){ if(activeRequestAction.mode === 'delegate'){ setMobileApprovalResult({heading:'Đã ủy quyền phê duyệt',title:mobileApprovalTask.title,status:`Chờ ${delegatedUser?.name || 'người được ủy quyền'} duyệt`}); } setActiveRequestAction(null); setMobileApprovalTaskId(''); setMobileApprovalTab(activeRequestAction.mode === 'request_opinion' ? 'pending' : 'done'); } }}>{activeRequestAction.mode === 'delegate' ? 'Xác nhận ủy quyền' : activeRequestAction.mode === 'request_opinion' ? 'Gửi đề nghị' : activeRequestAction.action === 'reject' ? 'Xác nhận từ chối' : 'Xác nhận duyệt'}</button></div></section></div> : null}</div>}
    </div> : null}
    <div className="vwork-approval-desktop-screen">
    <div className="vwork-approval-heading"><div><span>V-Work · PeopleOne</span><h2>{requestApprovalOnly ? approvalCategory === 'request' ? 'Đề nghị cần duyệt' : approvalCategory === 'proposal' ? 'Đề xuất cần duyệt' : 'Cần duyệt' : proposalOnly ? 'Đề xuất công việc' : 'Đề nghị thanh toán / tạm ứng'}</h2></div>{proposalOnly && !requestApprovalOnly ? <button className="btn btn-primary" type="button" onClick={()=>setApprovalView('proposal-create')}>＋ Tạo Đề xuất</button> : null}</div>
    <div className="vwork-approval-shell">
      {approvalNav.length ? <aside className="vwork-approval-nav">{approvalNav.map(([key,label,badge])=><button type="button" key={key} className={approvalView===key?'active':''} onClick={()=>setApprovalView(key)}><span>{label}</span>{badge ? <b>{badge}</b> : null}</button>)}</aside> : null}
      <main className="vwork-approval-main">
    {requestApprovalOnly && approvalView==='inbox' && <div className="vwork-approval-queue-tabs vwork-approval-primary-filters"><button type="button" className={requestQueueView==='pending'?'active':''} onClick={()=>setRequestQueueView('pending')}>Chờ tôi xử lý</button><button type="button" className={requestQueueView==='processed'?'active':''} onClick={()=>setRequestQueueView('processed')}>Đã xử lý</button><button type="button" className={requestQueueView==='all'?'active':''} onClick={()=>setRequestQueueView('all')}>Tất cả</button></div>}
    {proposalOnly && approvalView==='proposal-create' && <ProposalRequestDesk requests={proposalRequestRows} setRequests={setProposalRequests} tasks={tasks} onCreateRequest={persistProposalRequest} onUpdateRequest={updateProposalRequest} onDeleteRequest={deleteProposalRequest} onAssignFromRequest={assignFromProposal} currentUser={currentUser} defaultOwnerId={currentUser?.ownerIds?.[0] || MASTER.owners[0]?.id || ''} view="create" />}
    {proposalOnly && approvalView==='proposal-inbox' && <ProposalRequestDesk requests={proposalRequestRows} setRequests={setProposalRequests} tasks={tasks} onCreateRequest={persistProposalRequest} onUpdateRequest={updateProposalRequest} onDeleteRequest={deleteProposalRequest} onAssignFromRequest={assignFromProposal} currentUser={currentUser} peopleOneUsers={peopleOneUsers} defaultOwnerId={currentUser?.ownerIds?.[0] || MASTER.owners[0]?.id || ''} view="track" />}
    {showPaymentApproval && !proposalOnly && (approvalView==='create' || approvalView==='inbox') && <div>
    <div className={`vwork-request-grid ${approvalView === 'inbox' || !directorCanCreateRequests ? 'compact' : ''}`}>
    {approvalView==='create' && mode !== 'approval' && <Card title="Tạo đề nghị phê duyệt">
      <p className="muted">Chọn loại đề nghị để hệ thống hiển thị đúng biểu mẫu và luồng phê duyệt.</p>
      <div className="vwork-approval-type-pills">{adminRequestTypesForUser.map((item)=><button key={item.id} type="button" className={draft.requestType===item.id?'active':''} onClick={()=>{
          const requestType = item.id;
          const type = VWORK_ADMIN_REQUEST_TYPES.find((item)=>item.id === requestType) || VWORK_ADMIN_REQUEST_TYPES[0];
          setDraft({...draft, requestType, formTemplate:type.formTemplate});
        }}>{item.label}</button>)}</div>
      <div className="grid grid-2" style={{marginTop:14}}>
        <label><span>Biểu mẫu kế toán</span><select value={draft.formTemplate} onChange={(event)=>setField('formTemplate', event.target.value)}>{VWORK_ADMIN_REQUEST_FORM_TEMPLATES.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Dự án / danh mục</span><input value={draft.project} onChange={(event)=>setField('project', event.target.value)} placeholder="VD: Dự án V-Work · CNTT" /></label>
      </div>
      {dynamicField ? <label style={{marginTop:10}}><span>{dynamicField.label}</span><textarea rows="2" value={draft.dynamicDetail} onChange={(event)=>setField('dynamicDetail', event.target.value)} placeholder={dynamicField.placeholder} /></label> : null}
      {isLoanRequest ? <div className="vwork-loan-request-form">
        <div className="grid grid-2">
          <label><span>Bên đi vay</span><input value={draft.borrower} onChange={(event)=>setField('borrower', event.target.value)} placeholder="VD: PeopleOne / đơn vị đi vay" /></label>
          <label><span>Bên cho vay</span><input value={draft.lender} onChange={(event)=>setField('lender', event.target.value)} placeholder="VD: Cá nhân / đối tác / tổ chức cho vay" /></label>
        </div>
        <div className="grid grid-2" style={{marginTop:10}}>
          <label><span>Số tiền</span><input type="number" min="0" value={draft.amount} onChange={(event)=>setField('amount', event.target.value)} placeholder="Nhập số tiền vay" /></label>
          <label><span>Thời hạn trả</span><input type="date" value={draft.dueDate} onChange={(event)=>setField('dueDate', event.target.value)} /></label>
        </div>
        <label style={{marginTop:10}}><span>Mục đích khoản vay</span><input value={draft.loanPurpose} onChange={(event)=>setField('loanPurpose', event.target.value)} placeholder="VD: Bổ sung dòng tiền triển khai dự án..." /></label>
        <label style={{marginTop:10}}><span>Nhập nội dung</span><textarea rows="4" value={draft.content} onChange={(event)=>setField('content', event.target.value)} placeholder="Nêu bối cảnh, điều kiện vay, phương án hoàn trả, chứng từ liên quan..." /></label>
        <label style={{marginTop:10}}><span>Đính kèm file</span><input type="file" multiple onChange={(event)=>setField('attachmentFiles', Array.from(event.target.files || []))} /></label>
        {draft.attachmentFiles.length ? <p className="muted vwork-file-hint">Đã chọn {draft.attachmentFiles.length} file: {draft.attachmentFiles.map((file)=>file.name).join(', ')}</p> : <p className="muted vwork-file-hint">Bắt buộc đính kèm file trước khi gửi Giám đốc.</p>}
        <label style={{marginTop:10}}><span>Ghi chú thêm</span><input value={draft.note} onChange={(event)=>setField('note', event.target.value)} placeholder="Ghi chú nội bộ nếu có" /></label>
      </div> : <>
        <label style={{marginTop:10}}><span>Tiêu đề</span><input value={draft.title} onChange={(event)=>setField('title', event.target.value)} placeholder="VD: Đề nghị thanh toán chi phí triển khai dự án" /></label>
        <div className="grid grid-3" style={{marginTop:10}}>
          <label><span>Đối tượng thanh toán / nhà cung cấp</span><input value={draft.vendor} onChange={(event)=>setField('vendor', event.target.value)} placeholder="VD: Nhà cung cấp, giảng viên, đối tác..." /></label>
          <label><span>Số tiền</span><input type="number" min="0" value={draft.amount} onChange={(event)=>setField('amount', event.target.value)} placeholder="Nhập số tiền" /></label>
          <label><span>Hạn cần xử lý</span><input type="date" value={draft.dueDate} onChange={(event)=>setField('dueDate', event.target.value)} /></label>
        </div>
        <label style={{marginTop:10}}><span>Lý do / nội dung chi</span><textarea rows="3" value={draft.purpose} onChange={(event)=>setField('purpose', event.target.value)} placeholder="Nêu nhu cầu, đơn vị sử dụng, lý do cần mua/chi..." /></label>
        <label style={{marginTop:10}}><span>Ghi chú thêm</span><input value={draft.note} onChange={(event)=>setField('note', event.target.value)} placeholder="Link báo giá/chứng từ nếu đã có" /></label>
        <label style={{marginTop:10}}><span>Đính kèm file</span><input type="file" multiple onChange={(event)=>setField('attachmentFiles', Array.from(event.target.files || []))} /></label>
        {draft.attachmentFiles.length ? <p className="muted vwork-file-hint">Đã chọn {draft.attachmentFiles.length} file: {draft.attachmentFiles.map((file)=>file.name).join(', ')}</p> : <p className="muted vwork-file-hint">Có thể đính kèm nhiều báo giá, chứng từ, ảnh hoặc tài liệu liên quan.</p>}
      </>}
      <label style={{marginTop:10}}><span>Link liên quan</span><textarea rows="2" value={draft.attachmentLinksText} onChange={(event)=>setField('attachmentLinksText', event.target.value)} placeholder="Mỗi link một dòng: Drive, hợp đồng, báo giá hoặc tài liệu tham chiếu..." /></label>
      <div className="grid grid-2" style={{marginTop:10}}><label><span>Người duyệt bước 1</span><input value="Kế toán trưởng" disabled /></label><label><span>Người duyệt bước 2</span><input value="Giám đốc / người được uỷ quyền" disabled /></label></div>
      <label className="vwork-checklist-option"><input type="checkbox" defaultChecked /> Kèm checklist hồ sơ và điều kiện duyệt</label>
      <div className="row between" style={{marginTop:12}}><span className="muted">Sẽ dùng mẫu: {template.fileName}</span><button className="btn btn-primary" type="button" disabled={isVsuiteBusy} onClick={submitAdminRequest}>{isVsuiteBusy ? 'Đang ghi...' : isLoanRequest ? 'Gửi Giám đốc duyệt' : 'Gửi yêu cầu'}</button></div>
    </Card>}
    {approvalView==='inbox' && <Card title={mode === 'approval' ? `Phiếu phê duyệt (${filteredRequests.length})` : `Theo dõi đề nghị (${filteredRequests.length})`} action={<div className="pill-row"><Badge tone="b-amber">{waitingAccounting} kế toán</Badge><Badge tone="b-purple">{waitingDirector} giám đốc</Badge></div>}>
      <div className="vwork-request-ops">
        <input value={requestSearch} onChange={(event)=>{ setRequestSearch(event.target.value); setRequestPageSize(100); }} placeholder="Tìm mã phiếu, người gửi, nhà cung cấp, số tiền..." />
        {mode !== 'approval' ? <select value={requestStatusFilter} onChange={(event)=>{ setRequestStatusFilter(event.target.value); setRequestPageSize(100); }}>
          <option value="active">Đang xử lý</option>
          <option value="submitted">Chờ kế toán</option>
          <option value="manager_approved">Chờ giám đốc</option>
          <option value="director_approved">Chờ thanh toán</option>
          <option value="paid">Đã thanh toán</option>
          <option value="rejected">Từ chối</option>
          <option value="all">Tất cả</option>
        </select> : null}
        <Badge tone="b-gray">Hiển thị {displayedRequests.length}/{filteredRequests.length}</Badge>
      </div>
      <div className="vwork-proposal-table-wrap"><table className="vwork-proposal-table vwork-payment-request-table"><thead><tr><th>Phiếu</th><th>Người gửi</th><th>Trạng thái</th><th>Luồng xử lý</th><th aria-label="Thao tác" /></tr></thead><tbody>{displayedRequests.map((task)=>{
        const meta = adminRequestMeta(task);
        const status = vworkAdminRequestStatusMeta(meta.paymentStatus || 'submitted', meta);
        const actions = nextVWorkAdminRequestActions(task, role, currentUser);
        const flowSteps = requestFlowSteps(task);
        const canDelegate = isDirectorUser(currentUser, role) && !meta.delegatedApproverEmail && !meta.delegatedApproverId && ['accountant_review','manager_approved'].includes(meta.paymentStatus || '');
        const canRevokeDelegation = isDirectorUser(currentUser, role) && Boolean(meta.delegatedApproverEmail || meta.delegatedApproverId);
        const isOpinionTarget = meta.opinionStatus === 'pending' && String(meta.opinionRequestedEmail || '').trim().toLowerCase() === String(currentUser?.email || '').trim().toLowerCase();
        const canRequestOpinion = isAdminRequestDecisionOwner(task, role, currentUser) && ['accountant_review','manager_approved'].includes(meta.paymentStatus || '');
        const needsPaymentConfirmation = actions.some((item)=>item.action === 'mark_paid');
        const paymentConfirmation = paymentConfirmations[task.id] || { transactionRef:'', paidDate:new Date().toISOString().slice(0,10), paidAmount:meta.amount || '', proofFile:null };
        const isExpanded = Boolean(expandedRequestIds[task.id]);
        const purposeLines = splitAdminRequestText(meta.purpose || task.method);
        const noteLines = splitAdminRequestText(getAdminRequestNote(task));
        const attachmentLinks = getAdminRequestAttachmentLinks(task);
        const attachmentFiles = getAdminRequestAttachmentFiles(task);
        return <Fragment key={task.id}><tr className="vwork-proposal-row" tabIndex={0} onClick={()=>openRequestDetail(task)} onKeyDown={(event)=>{ if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRequestDetail(task); } }}>
          <td data-label="Phiếu"><strong>{task.title}</strong><small>{meta.requestCode || task.sourceId} · {(meta.amount || 0).toLocaleString('vi-VN')} {meta.currency || 'VND'}</small><small>{meta.vendor || '-'} · {meta.formFileName || '-'}</small></td>
          <td data-label="Người gửi">{meta.requesterName || task.ownerName || '-'}{meta.delegatedApproverName ? <small>Ủy quyền: {meta.delegatedApproverName}</small> : null}</td>
          <td data-label="Trạng thái"><Badge tone={status.tone}>{status.label}</Badge>{meta.returnNote ? <small className="vwork-return-note">Ghi chú trả lại bổ sung: {meta.returnNote}</small> : null}</td>
          <td data-label="Luồng & log"><div className="vwork-request-flow">{flowSteps.map((step)=><span key={step.key} className={step.done ? 'done' : ''}>{step.label}</span>)}</div>{(task.activity || []).length ? <details className="vwork-request-inline-log"><summary>Log ({task.activity.length})</summary><div>{(task.activity || []).slice().reverse().map((item, index)=><p key={`${item.at}-${index}`}><strong>{item.action}</strong><span>{item.by || 'V-Work'} · {item.at ? new Date(item.at).toLocaleString('vi-VN') : ''}</span><em>{item.note || '-'}</em></p>)}</div></details> : <small>Chưa có log</small>}</td>
          <td data-label="Thao tác" onClick={(event)=>event.stopPropagation()}>{requestApprovalOnly ? <div className="vwork-request-row-actions">{actions.map((item)=><button key={item.action} disabled={isVsuiteBusy} className={item.action === 'reject' ? 'btn btn-danger btn-sm' : item.action === 'director_approve' || item.action === 'accountant_review' || item.action === 'mark_paid' ? 'btn btn-primary btn-sm' : 'btn btn-sm'} type="button" onClick={()=>setActiveRequestAction({ taskId:task.id, mode:'decision', action:item.action })}>{item.label}</button>)}{canDelegate ? <button className="btn btn-sm" disabled={isVsuiteBusy} type="button" onClick={()=>setDelegateTaskId(task.id)}>Ủy quyền</button> : null}{canRevokeDelegation ? <button className="btn btn-sm" disabled={isVsuiteBusy} type="button" onClick={()=>revokeDirectorDelegation(task)}>Thu hồi ủy quyền</button> : null}{delegateTaskId === task.id ? <div className="vwork-inline-delegation"><select value={delegateTargets[task.id] || ''} onChange={(event)=>setDelegateTargets((current)=>({...current,[task.id]:event.target.value}))}><option value="">Chọn người được ủy quyền</option>{peopleOneDelegateUsers.map((user)=><option key={user.email} value={user.email}>{user.name}</option>)}</select><button className="btn btn-primary btn-sm" disabled={isVsuiteBusy} type="button" onClick={async()=>{ if (await delegateDirectorApproval(task)) setDelegateTaskId(''); }}>Xác nhận ủy quyền</button><button className="btn btn-sm" type="button" onClick={()=>setDelegateTaskId('')}>Hủy</button></div> : null}{canRequestOpinion ? <button className="btn btn-sm" disabled={isVsuiteBusy} type="button" onClick={()=>setActiveRequestAction({ taskId:task.id, mode:'request_opinion' })}>Đề nghị ý kiến</button> : null}{isOpinionTarget ? <button className="btn btn-primary btn-sm" disabled={isVsuiteBusy} type="button" onClick={()=>setActiveRequestAction({ taskId:task.id, mode:'respond_opinion' })}>Đưa ý kiến</button> : null}{!actions.length && !canDelegate && !canRevokeDelegation && !canRequestOpinion && !isOpinionTarget ? <button className="btn btn-sm vwork-proposal-detail-button" type="button" onClick={()=>openRequestDetail(task)}><Eye size={15} /> Chi tiết</button> : null}</div> : <button className="btn btn-sm vwork-proposal-detail-button" type="button" onClick={()=>openRequestDetail(task)}><Eye size={15} /> Chi tiết</button>}</td>
        </tr>{activeRequestAction?.taskId === task.id ? <tr className="vwork-request-action-row"><td colSpan={5}><div className="vwork-request-action-editor">
          {activeRequestAction.mode === 'respond_opinion' ? <><div><strong>Đưa ý kiến cho người duyệt</strong><small>Ý kiến được bổ sung vào phiếu; quyền quyết định vẫn thuộc người duyệt.</small></div><textarea rows="3" value={opinionResponses[task.id] || ''} onChange={(event)=>setOpinionResponses((current)=>({ ...current,[task.id]:event.target.value }))} placeholder="Nhập ý kiến cụ thể, rủi ro hoặc điều kiện đề xuất..." /><div className="vwork-request-action-confirm"><button className="btn" type="button" onClick={()=>setActiveRequestAction(null)}>Hủy</button><button className="btn btn-primary" disabled={isVsuiteBusy} type="button" onClick={async()=>{ if (await respondApprovalOpinion(task)) setActiveRequestAction(null); }}>Gửi ý kiến</button></div></> : activeRequestAction.mode === 'request_opinion' ? <><div><strong>Đề nghị người khác cho ý kiến</strong><small>Chọn đúng tài khoản PeopleOne và ghi rõ nội dung cần tham vấn.</small></div><select value={opinionTargets[task.id] || ''} onChange={(event)=>setOpinionTargets((current)=>({...current,[task.id]:event.target.value}))}><option value="">Chọn người cần cho ý kiến</option>{peopleOneUsers.map((user)=><option key={user.email} value={user.email}>{user.name} · {user.title}</option>)}</select><textarea rows="3" value={actionNotes[task.id] || ''} onChange={(event)=>setActionNotes((current)=>({ ...current,[task.id]:event.target.value }))} placeholder="Nội dung cần xin ý kiến..." /><div className="vwork-request-action-confirm"><button className="btn" type="button" onClick={()=>setActiveRequestAction(null)}>Hủy</button><button className="btn btn-primary" disabled={isVsuiteBusy} type="button" onClick={async()=>{ if (await requestOpinionForApproval(task)) setActiveRequestAction(null); }}>Gửi đề nghị</button></div></> : <><div><strong>{actions.find((item)=>item.action === activeRequestAction.action)?.label || 'Xử lý phiếu'}</strong><small>{['reject','return'].includes(activeRequestAction.action) ? 'Bắt buộc nhập lý do để người gửi biết cần xử lý thế nào.' : 'Có thể ghi thêm ý kiến cụ thể trước khi xác nhận.'}</small></div>{(task.checklist || []).length && activeRequestAction.action === 'director_approve' ? <div className="vwork-approval-checklist"><b>Checklist duyệt</b>{task.checklist.map((entry,index)=>{ const label=typeof entry==='string'?entry:entry.label; const done=typeof entry==='object'&&entry.done; return <label key={`${label}-${index}`}><input type="checkbox" checked={Boolean(done)} onChange={()=>toggleApprovalChecklist(task,index)} /><span>{label}</span></label>})}</div> : null}{activeRequestAction.action === 'mark_paid' ? <div className="vwork-payment-confirmation"><label><span>Mã giao dịch</span><input value={paymentConfirmation.transactionRef} onChange={(event)=>setPaymentConfirmations((current)=>({ ...current,[task.id]:{...paymentConfirmation,transactionRef:event.target.value} }))} /></label><label><span>Ngày thanh toán</span><input type="date" value={paymentConfirmation.paidDate} onChange={(event)=>setPaymentConfirmations((current)=>({ ...current,[task.id]:{...paymentConfirmation,paidDate:event.target.value} }))} /></label><label><span>Số tiền thực trả</span><input type="number" min="1" value={paymentConfirmation.paidAmount} onChange={(event)=>setPaymentConfirmations((current)=>({ ...current,[task.id]:{...paymentConfirmation,paidAmount:event.target.value} }))} /></label><label><span>Chứng từ thanh toán</span><input type="file" onChange={(event)=>setPaymentConfirmations((current)=>({ ...current,[task.id]:{...paymentConfirmation,proofFile:event.target.files?.[0] || null} }))} /></label></div> : null}<textarea rows="3" value={actionNotes[task.id] || ''} onChange={(event)=>setActionNotes((current)=>({ ...current,[task.id]:event.target.value }))} placeholder={['reject','return'].includes(activeRequestAction.action) ? 'Nhập lý do...' : 'Ý kiến xử lý (không bắt buộc)...'} /><div className="vwork-request-action-confirm"><button className="btn" type="button" onClick={()=>setActiveRequestAction(null)}>Hủy</button><button className={activeRequestAction.action === 'reject' ? 'btn btn-danger' : 'btn btn-primary'} disabled={isVsuiteBusy} type="button" onClick={async()=>{ if (await advanceRequest(task,activeRequestAction.action)) setActiveRequestAction(null); }}>Xác nhận</button></div></>}
        </div></td></tr> : null}{isExpanded ? <tr className="vwork-request-detail-row"><td colSpan={5}><div className="vwork-request-detail-panel">
          <section><h4>Thông tin phiếu</h4><dl><div><dt>Mã phiếu</dt><dd>{meta.requestCode || task.sourceId || '-'}</dd></div><div><dt>Loại đề nghị</dt><dd>{VWORK_ADMIN_REQUEST_TYPES.find((item)=>item.id === meta.requestType)?.label || meta.requestType || '-'}</dd></div><div><dt>Dự án / danh mục</dt><dd>{meta.project || task.projectCode || '-'}</dd></div><div><dt>Người gửi</dt><dd>{meta.requesterName || task.ownerName || '-'}{meta.requesterEmail ? ` · ${meta.requesterEmail}` : ''}</dd></div><div><dt>Nhà cung cấp/đối tượng</dt><dd>{meta.vendor || '-'}</dd></div><div><dt>Số tiền đề nghị</dt><dd>{(meta.amount || 0).toLocaleString('vi-VN')} {meta.currency || 'VND'}</dd></div><div><dt>Hạn xử lý</dt><dd>{task.deadline || '-'}</dd></div><div><dt>Biểu mẫu</dt><dd>{meta.formFileName || '-'}</dd></div>{meta.paymentRef ? <><div><dt>Mã giao dịch</dt><dd>{meta.paymentRef}</dd></div><div><dt>Đã thanh toán</dt><dd>{Number(meta.paidAmount || meta.amount || 0).toLocaleString('vi-VN')} {meta.currency || 'VND'} · {meta.paidDate || '-'}</dd></div></> : null}</dl></section>
          <section><h4>Lý do / nội dung chi</h4>{purposeLines.length ? purposeLines.map((line, index)=><p key={`${task.id}-purpose-${index}`}>{line}</p>) : <p className="muted">Chưa có nội dung chi.</p>}</section>
          <section><h4>File đính kèm</h4>{attachmentFiles.length ? <div className="vwork-request-attachment-links">{attachmentFiles.map((file)=>(file.url ? <a key={`${file.name}-${file.url}`} href={file.url} target="_blank" rel="noreferrer">{file.name}{file.size ? ` · ${(file.size / 1024 / 1024).toFixed(2)} MB` : ''}</a> : <span className="vwork-missing-attachment" key={file.name}>{file.name} · Chưa tải lên</span>))}</div> : <p className="muted">Chưa có file đính kèm.</p>}<label className="btn btn-sm vwork-attachment-upload">{attachmentFiles.some((file)=>!file.url) ? 'Tải lại file' : 'Bổ sung file'}<input type="file" hidden disabled={isVsuiteBusy} onChange={(event)=>{ const file=event.target.files?.[0]; if(file) attachPaymentRequestDocument(task,file); event.target.value=''; }} /></label></section>
          <section><h4>Ghi chú / link liên quan</h4>{noteLines.length ? noteLines.map((line, index)=><p key={`${task.id}-note-${index}`}>{line}</p>) : <p className="muted">Chưa có ghi chú thêm.</p>}{attachmentLinks.length ? <div className="vwork-request-attachment-links">{attachmentLinks.map((link)=><a key={link} href={normalizeAdminRequestUrl(link)} target="_blank" rel="noreferrer">{link}</a>)}</div> : <small>Chưa có link liên quan.</small>}</section>
          <section><h4>Nhật ký xử lý</h4>{(task.activity || []).length ? <div className="vwork-request-log">{(task.activity || []).slice().reverse().map((item, index)=><div key={`${item.at}-${index}`}><strong>{item.action}</strong><small>{item.by || 'V-Work'} · {item.at ? new Date(item.at).toLocaleString('vi-VN') : ''}</small><p>{item.note || '-'}</p></div>)}</div> : <p className="muted">Nhật ký trạng thái được lưu tại VSuite.</p>}</section>
          {meta.opinionRequestedTo ? <section><h4>Ý kiến tham vấn</h4><div className="vwork-opinion-reminder"><strong>{meta.opinionStatus === 'responded' ? `Đã có ý kiến từ ${meta.opinionRequestedTo}` : `Đang chờ ý kiến: ${meta.opinionRequestedTo}`}</strong><span>{meta.opinionRequestNote || 'Chưa có nội dung tham vấn.'}</span>{meta.opinionResponse ? <p>{meta.opinionResponse}</p> : null}</div></section> : null}
          {canDeleteAdminRequest(task) ? <section className="vwork-request-delete-panel"><h4>Xóa phiếu / đề nghị</h4><p>Chỉ dùng khi phiếu tạo nhầm hoặc bị trùng. Phiếu đã thanh toán không thể xóa.</p><button className="btn btn-danger btn-sm" disabled={isVsuiteBusy} type="button" onClick={()=>deleteAdminRequest(task)}>Xóa phiếu này</button></section> : null}
        </div></td></tr> : null}</Fragment>;
      })}{!displayedRequests.length && <tr><td colSpan={5}><div className="empty-panel">{mode === 'approval' ? 'Chưa có yêu cầu cần bạn xử lý.' : 'Bạn chưa có đề nghị nào trong bộ lọc này.'}</div></td></tr>}</tbody></table></div>
      {filteredRequests.length > displayedRequests.length ? <div className="row" style={{justifyContent:'center',marginTop:12}}><button className="btn" type="button" onClick={()=>setRequestPageSize((current)=>current + 100)}>Hiển thị thêm 100 phiếu</button></div> : null}
    </Card>}
    {selectedRequest && selectedRequestMeta && <div className="modal-bg vwork-proposal-detail-layer" role="presentation" onMouseDown={(event)=>{ if(event.target===event.currentTarget) setSelectedRequestId(''); }}><div className="modal vwork-proposal-detail-modal vwork-payment-detail-modal" role="dialog" aria-modal="true" aria-label={`Chi tiết đề nghị ${selectedRequest.title}`} onMouseDown={(event)=>event.stopPropagation()}>
      <button className="modal-x" type="button" aria-label="Đóng" onClick={()=>setSelectedRequestId('')}>×</button>
      <div className="vwork-proposal-detail-head"><div><span className="vwork-proposal-eyebrow">Chi tiết đề nghị</span><h3>{selectedRequest.title}</h3><p>{selectedRequestMeta.requestCode || selectedRequest.sourceId || '-'} · {VWORK_ADMIN_REQUEST_TYPES.find((item)=>item.id === selectedRequestMeta.requestType)?.label || selectedRequestMeta.requestType || 'Đề nghị thanh toán / tạm ứng'}</p></div><Badge tone={selectedRequestStatus?.tone || 'b-gray'}>{selectedRequestStatus?.label || 'Đang xử lý'}</Badge></div>
      <div className="vwork-proposal-detail-body">
        {isEditingRequest && requestEditDraft ? <section className="vwork-proposal-action-panel vwork-request-edit-form"><div className="vwork-request-edit-heading"><div><h4>Sửa thông tin phiếu</h4><p>Thay đổi được lưu vào phiếu gốc và ghi nhận trong nhật ký xử lý.</p></div></div>
          <label><span>Tiêu đề đề nghị <b className="required-mark">*</b></span><input value={requestEditDraft.title} onChange={(event)=>setRequestEditDraft((current)=>({...current,title:event.target.value}))} /></label>
          <div className="vwork-request-edit-grid"><label><span>Nhà cung cấp / đối tượng</span><input value={requestEditDraft.vendor} onChange={(event)=>setRequestEditDraft((current)=>({...current,vendor:event.target.value}))} /></label><label><span>Số tiền <b className="required-mark">*</b></span><input type="number" min="0" value={requestEditDraft.amount} onChange={(event)=>setRequestEditDraft((current)=>({...current,amount:event.target.value}))} /></label><label><span>Hạn xử lý <b className="required-mark">*</b></span><input type="date" value={requestEditDraft.dueDate} onChange={(event)=>setRequestEditDraft((current)=>({...current,dueDate:event.target.value}))} /></label></div>
          <label><span>Lý do / nội dung chi <b className="required-mark">*</b></span><textarea rows="5" value={requestEditDraft.purpose} onChange={(event)=>setRequestEditDraft((current)=>({...current,purpose:event.target.value}))} /></label>
          <label><span>Ghi chú chi tiết</span><textarea rows="3" value={requestEditDraft.note} onChange={(event)=>setRequestEditDraft((current)=>({...current,note:event.target.value}))} /></label>
          <label className="vwork-request-replacement"><span>Thay file hồ sơ</span><input type="file" multiple onChange={(event)=>setRequestReplacementFiles(Array.from(event.target.files || []))} /><small>{requestReplacementFiles.length ? `${requestReplacementFiles.length} file mới sẽ thay hồ sơ đính kèm hiện tại.` : 'Không chọn file mới nếu muốn giữ nguyên hồ sơ hiện tại. Chứng từ thanh toán không bị thay.'}</small></label>
          <div className="vwork-payment-detail-actions"><button className="btn" type="button" disabled={isVsuiteBusy} onClick={()=>{ setIsEditingRequest(false); setRequestEditDraft(null); setRequestReplacementFiles([]); }}>Hủy</button><button className="btn btn-primary" type="button" disabled={isVsuiteBusy} onClick={()=>saveAdminRequestEdits(selectedRequest)}>{isVsuiteBusy ? 'Đang lưu...' : 'Lưu thay đổi'}</button></div>
        </section> : <>
          <section className="vwork-proposal-summary"><h4>Thông tin phiếu</h4><dl><div><dt>Người gửi</dt><dd>{selectedRequestMeta.requesterName || selectedRequest.ownerName || '-'}</dd></div><div><dt>Số tiền</dt><dd>{(selectedRequestMeta.amount || 0).toLocaleString('vi-VN')} {selectedRequestMeta.currency || 'VND'}</dd></div><div><dt>Nhà cung cấp / đối tượng</dt><dd>{selectedRequestMeta.vendor || '-'}</dd></div><div><dt>Hạn xử lý</dt><dd>{selectedRequest.deadline || 'Chưa đặt'}</dd></div><div><dt>Dự án / danh mục</dt><dd>{selectedRequestMeta.project || selectedRequest.projectCode || '-'}</dd></div><div><dt>Biểu mẫu</dt><dd>{selectedRequestMeta.formFileName || '-'}</dd></div></dl></section>
          <section><h4>Lý do / nội dung chi</h4>{selectedRequestPurposeLines.length ? selectedRequestPurposeLines.map((line,index)=><p className="vwork-proposal-content" key={`${selectedRequest.id}-purpose-${index}`}>{line}</p>) : <p className="muted">Chưa có nội dung chi.</p>}</section>
          <section><h4>File đính kèm</h4>{selectedRequestAttachmentFiles.length ? <div className="vwork-request-attachment-links">{selectedRequestAttachmentFiles.map((file)=>(file.url ? <a key={`${file.name}-${file.url}`} href={file.url} target="_blank" rel="noreferrer"><Paperclip size={14} />{file.name}</a> : <span className="vwork-missing-attachment" key={file.name}><Paperclip size={14} />{file.name} · Chưa tải lên</span>))}</div> : <p className="muted">Chưa có file đính kèm.</p>}</section>
          {(selectedRequestNoteLines.length || selectedRequestAttachmentLinks.length) ? <section><h4>Ghi chú / link liên quan</h4>{selectedRequestNoteLines.map((line,index)=><p className="vwork-proposal-content" key={`${selectedRequest.id}-note-${index}`}>{line}</p>)}{selectedRequestAttachmentLinks.length ? <div className="vwork-request-attachment-links">{selectedRequestAttachmentLinks.map((link)=><a key={link} href={normalizeAdminRequestUrl(link)} target="_blank" rel="noreferrer">{link}</a>)}</div> : null}</section> : null}
          <section><h4>Nhật ký xử lý</h4>{(selectedRequest.activity || []).length ? <div className="vwork-request-log">{selectedRequest.activity.slice().reverse().map((item,index)=><div key={`${item.at}-${index}`}><strong>{item.action}</strong><small>{item.by || 'V-Work'} · {item.at ? new Date(item.at).toLocaleString('vi-VN') : ''}</small><p>{item.note || '-'}</p></div>)}</div> : <p className="muted">Nhật ký trạng thái được lưu tại VSuite.</p>}</section>
          <div className="vwork-payment-detail-actions">{canEditAdminRequest(selectedRequest) ? <button className="btn btn-primary" type="button" onClick={()=>beginEditRequest(selectedRequest)}>Sửa thông tin</button> : <span className="vwork-payment-edit-note">Chỉ người tạo được sửa khi phiếu ở trạng thái nháp, chờ xử lý hoặc đã trả lại.</span>}{canDeleteAdminRequest(selectedRequest) ? <button className="btn btn-danger btn-sm" disabled={isVsuiteBusy} type="button" onClick={()=>deleteAdminRequest(selectedRequest)}><Trash2 size={15} /> Xóa phiếu</button> : null}</div>
        </>}
      </div>
    </div></div>}
       </div></div>}
    {showProposalApproval && approvalView==='inbox' && <ProposalRequestDesk requests={proposalRequestRows} setRequests={setProposalRequests} tasks={tasks} onCreateRequest={persistProposalRequest} onUpdateRequest={updateProposalRequest} onDeleteRequest={deleteProposalRequest} onAssignFromRequest={assignFromProposal} currentUser={currentUser} peopleOneUsers={peopleOneUsers} defaultOwnerId={currentUser?.ownerIds?.[0] || MASTER.owners[0]?.id || ''} approvalOnly queueView={requestQueueView} />}
      </main>
    </div>
    </div>
  </div>;
}
function ProposalRequestDesk({ requests, setRequests, tasks = [], onCreateRequest, onUpdateRequest, onDeleteRequest, onAssignFromRequest, currentUser, peopleOneUsers = MASTER.users, defaultOwnerId, approvalOnly = false, view = 'all', queueView = 'all' }) {
  const defaultType = VWORK_PROPOSAL_TYPES[0];
  const [draft, setDraft] = useState({ type:defaultType.id, title:'', approver:'director', project:'', detail:'', urgency:'normal', targetTaskId:'', collaboratorOwnerIds:[], attachmentFiles:[], attachmentLinksText:'' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decisionNotes, setDecisionNotes] = useState({});
  const [opinionTargetsByRequest, setOpinionTargetsByRequest] = useState({});
  const [opinionResponsesByRequest, setOpinionResponsesByRequest] = useState({});
  const [recipientResponsesByRequest, setRecipientResponsesByRequest] = useState({});
  const [recipientRewardsByRequest, setRecipientRewardsByRequest] = useState({});
  const [delegateTargetsByRequest, setDelegateTargetsByRequest] = useState({});
  const [openDelegateRequestId, setOpenDelegateRequestId] = useState('');
  const [selectedProposalId, setSelectedProposalId] = useState('');
  const currentEmail = String(currentUser?.email || '').trim().toLowerCase();
  function isProposalDelegate(item) {
    return isVWorkProposalDelegate(item, currentUser);
  }
  function isProposalDecisionOwner(item) {
    return isVWorkProposalDecisionOwner(item, currentUser);
  }
  function isTaskProposalRecipient(item) {
    return isVWorkTaskProposalRecipient(item, currentUser);
  }
  function isProposalAwaitingCurrentUser(item) {
    return isVWorkProposalAwaitingCurrentUser(item, currentUser);
  }
  const relevantProposalRequests = approvalOnly && !isDirectorUser(currentUser, '')
    ? requests.filter((item)=>String(item.opinionRequestedEmail || '').trim().toLowerCase() === currentEmail || isProposalDelegate(item) || isTaskProposalRecipient(item) || isVWorkCollaborationProposalParticipant(item, currentUser))
    : requests;
  const visibleProposalRequests = !approvalOnly || queueView === 'all'
    ? relevantProposalRequests
    : queueView === 'processed'
      ? relevantProposalRequests.filter((item)=>!isProposalAwaitingCurrentUser(item))
      : relevantProposalRequests.filter(isProposalAwaitingCurrentUser);
  const pendingCount = visibleProposalRequests.filter((item)=>(item.status === 'pending' || item.status === 'info') && (isProposalDecisionOwner(item) || String(item.opinionRequestedEmail || '').trim().toLowerCase() === currentEmail || isTaskProposalRecipient(item))).length;
  const selectedType = VWORK_PROPOSAL_TYPES.find((item)=>item.id === draft.type) || defaultType;
  const collaborationMode = draft.type === 'collaboration';
  const activeTaskOptions = tasks.filter((task)=>!isVWorkAdminRequest(task) && !isVWorkProposalRequestTask(task) && !['completed','cancelled'].includes(String(task.status || '').toLowerCase()));
  const scopedTaskOptions = getOwnTasks(activeTaskOptions, currentUser?.name || '', currentUser);
  const ownTaskOptions = scopedTaskOptions.length ? scopedTaskOptions : activeTaskOptions;
  function toggleDraftCollaborator(ownerId) {
    const exists = draft.collaboratorOwnerIds.includes(ownerId);
    setDraft({...draft, collaboratorOwnerIds:exists ? draft.collaboratorOwnerIds.filter((item)=>item !== ownerId) : [...draft.collaboratorOwnerIds, ownerId]});
  }
  async function submitRequest() {
    if (collaborationMode && !draft.targetTaskId) {
      notifyVWork(ownTaskOptions.length ? 'Hãy chọn công việc cần đề xuất phối hợp.' : 'Hiện chưa có công việc đang hoạt động để đề xuất phối hợp. Hãy tạo công việc trước hoặc chọn loại Đề xuất công việc mới.', 'warning');
      return;
    }
    if (collaborationMode && !draft.collaboratorOwnerIds.length) {
      notifyVWork('Hãy chọn ít nhất một người cần phối hợp.', 'warning');
      return;
    }
    const targetTask = collaborationMode ? tasks.find((task)=>String(task.id) === String(draft.targetTaskId)) : null;
    const requestTitle = draft.title.trim() || (collaborationMode ? `Đề xuất phối hợp: ${targetTask?.title || 'công việc'}` : '');
    if (!requestTitle) {
      notifyVWork('Hãy nhập tiêu đề đề xuất.', 'warning');
      return;
    }
    const requestId = `RQ-${Date.now().toString(36).toUpperCase()}`;
    const attachmentFiles = [];
    setIsSubmitting(true);
    try {
      for (const file of draft.attachmentFiles) {
        const uploadedFile = await uploadVworkDocumentFile({ file, entityId:requestId, documentType:'work_proposal' });
        attachmentFiles.push({
          name:uploadedFile.fileName || file.name,
          url:uploadedFile.fileUrl,
          type:file.type || '',
          size:file.size || 0,
        });
      }
    } catch (error) {
      notifyVWork(`Chưa upload được file đính kèm: ${getVWorkErrorMessage(error)}`, 'warning');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    const next = {
      id:requestId,
      title:requestTitle,
      type:draft.type,
      group:selectedType.group,
      ownerId:currentUser?.ownerIds?.[0] || defaultOwnerId || draft.approver || '',
      ownerName:currentUser?.name || currentUser?.email || '',
      requestedBy:currentUser?.email || currentUser?.id || '',
      approverId:'director',
      project:collaborationMode ? (targetTask?.projectCode || targetTask?.customer || 'Công việc đang có') : draft.project || 'Chưa gắn dự án',
      status:'pending',
      urgency:draft.urgency === 'urgent' ? 'Gấp' : draft.urgency === 'today' ? 'Trong ngày' : 'Bình thường',
      assignJobCode:selectedType.assignJobCode,
      detail:draft.detail,
      targetTaskId:draft.targetTaskId,
      collaboratorOwnerIds:draft.collaboratorOwnerIds,
      collaboratorNames:draft.collaboratorOwnerIds.map((id)=>ownerById(id)?.name).filter(Boolean),
      attachmentFiles,
      attachmentLinks:parseVWorkAttachmentLinks(draft.attachmentLinksText),
      opinionStatus:'none',
      opinionRequestedEmail:'',
      opinionResponse:'',
      flowLog:[{ action:'Gửi đề xuất', by:currentUser?.name || currentUser?.email || 'V-Work', at:new Date().toISOString(), note:draft.detail || selectedType.hint }],
    };
    setRequests([next, ...requests]);
    if (onCreateRequest) onCreateRequest(next);
    notifyVWork(`Đã gửi đề xuất "${next.title}" cho Giám đốc duyệt.`);
    setDraft({ type:defaultType.id, title:'', approver:'director', project:'', detail:'', urgency:'normal', targetTaskId:'', collaboratorOwnerIds:[], attachmentFiles:[], attachmentLinksText:'' });
  }
  function setStatus(id, status) {
    const label = status === 'approved' ? 'Chỉ duyệt' : status === 'info' ? 'Yêu cầu làm rõ' : status === 'rejected' ? 'Từ chối' : 'Cập nhật đề xuất';
    const opinionTarget = peopleOneUsers.find((user)=>user.email === opinionTargetsByRequest[id]);
    const decisionNote = String(decisionNotes[id] || '').trim();
    if (status === 'info' && !opinionTarget) {
      notifyVWork('Hãy chọn một tài khoản PeopleOne để đề nghị cho ý kiến.', 'warning');
      return;
    }
    if (status === 'rejected' && !decisionNote) {
      notifyVWork('Hãy nhập lý do từ chối để người đề xuất biết cần điều chỉnh gì.', 'warning');
      return;
    }
    const nextRequests = requests.map((item)=>item.id === id ? {
      ...item,
      status,
      opinionRequestedTo:status === 'info' ? opinionTarget?.name || '' : item.opinionRequestedTo,
      opinionRequestedEmail:status === 'info' ? opinionTarget?.email || '' : item.opinionRequestedEmail,
      opinionRequestedAt:status === 'info' ? new Date().toISOString() : item.opinionRequestedAt,
      opinionStatus:status === 'info' ? 'pending' : item.opinionStatus,
      opinionResponse:status === 'info' ? '' : item.opinionResponse,
      flowLog:[...(item.flowLog || []), { action:status === 'info' ? 'Đề nghị cho ý kiến' : label, by:currentUser?.name || currentUser?.email || 'V-Work', at:new Date().toISOString(), note:[opinionTarget?.name,decisionNote].filter(Boolean).join(' · ') || item.title }],
    } : item);
    setRequests(nextRequests);
    const updated = nextRequests.find((item)=>item.id === id);
    if (updated && onUpdateRequest) onUpdateRequest(updated);
  }
  function respondToProposalOpinion(item) {
    const response = String(opinionResponsesByRequest[item.id] || '').trim();
    if (!response) {
      notifyVWork('Hãy nhập ý kiến trước khi gửi.', 'warning');
      return;
    }
    const updated = {
      ...item,
      opinionStatus:'responded',
      opinionResponse:response,
      opinionRespondedAt:new Date().toISOString(),
      flowLog:[...(item.flowLog || []), { action:'Bổ sung ý kiến', by:currentUser?.name || currentUser?.email || 'PeopleOne', at:new Date().toISOString(), note:response }],
    };
    setRequests(requests.map((request)=>request.id === item.id ? updated : request));
    if (onUpdateRequest) onUpdateRequest(updated);
    setOpinionResponsesByRequest((current)=>({ ...current,[item.id]:'' }));
    notifyVWork('Đã gửi ý kiến về đề xuất công việc.');
  }
  function respondToTaskProposal(item) {
    const response = String(recipientResponsesByRequest[item.id] || '').trim();
    const rewardPoints = Number(recipientRewardsByRequest[item.id] || 0);
    if (!response && !rewardPoints) return alert('Vui lòng nhập phản hồi hoặc chọn mức rewards.');
    const next = {
      ...item,
      status:rewardPoints ? 'rewarded' : item.status,
      rewardPoints:rewardPoints || item.rewardPoints || 0,
      rewardedBy:rewardPoints ? (currentUser?.name || currentUser?.email || '') : item.rewardedBy,
      rewardedAt:rewardPoints ? new Date().toISOString() : item.rewardedAt,
      comments:response ? [...(item.comments || []), { by:currentUser?.name || currentUser?.email || 'Người nhận đề xuất', note:response, at:new Date().toISOString() }] : (item.comments || []),
      flowLog:[...(item.flowLog || []), { action:rewardPoints ? 'Ghi nhận sáng kiến' : 'Phản hồi đề xuất', by:currentUser?.name || currentUser?.email || 'V-Work', at:new Date().toISOString(), note:[response,rewardPoints ? `${rewardPoints} điểm` : ''].filter(Boolean).join(' · ') }],
    };
    setRequests(requests.map((request)=>String(request.id) === String(item.id) ? next : request));
    onUpdateRequest?.(next);
    setRecipientResponsesByRequest((current)=>({ ...current,[item.id]:'' }));
    setRecipientRewardsByRequest((current)=>({ ...current,[item.id]:'' }));
  }
  function delegateProposal(item) {
    if (!isDirectorUser(currentUser, '')) return false;
    const targetEmail = delegateTargetsByRequest[item.id] || '';
    const target = peopleOneUsers.find((user)=>String(user.email || '').trim().toLowerCase() === String(targetEmail).trim().toLowerCase());
    if (!target) {
      notifyVWork('Hãy chọn một tài khoản PeopleOne để nhận ủy quyền.', 'warning');
      return false;
    }
    const updated = {
      ...item,
      delegatedApproverEmail:target.email,
      delegatedApproverName:target.name,
      delegatedAt:new Date().toISOString(),
      delegatedBy:currentUser?.name || currentUser?.email || 'Giám đốc',
      flowLog:[...(item.flowLog || []), { action:'Ủy quyền phê duyệt', by:currentUser?.name || currentUser?.email || 'Giám đốc', at:new Date().toISOString(), note:`${target.name} chịu trách nhiệm duyệt hoặc từ chối đề xuất này.` }],
    };
    setRequests(requests.map((request)=>request.id === item.id ? updated : request));
    onUpdateRequest?.(updated);
    setOpenDelegateRequestId('');
    notifyVWork(`Đã ủy quyền đề xuất "${item.title}" cho ${target.name}.`);
    return true;
  }
  function canDeleteProposal(item) {
    const currentEmail = String(currentUser?.email || '').trim().toLowerCase();
    const requesterEmail = String(item.requestedBy || '').trim().toLowerCase();
    return isDirectorUser(currentUser, '') || (requesterEmail === currentEmail && item.status !== 'assigned');
  }
  function deleteProposal(item) {
    if (!canDeleteProposal(item)) return;
    const ok = window.confirm(`Xóa đề xuất "${item.title}"? Đề xuất sẽ bị gỡ khỏi danh sách và không thể khôi phục.`);
    if (!ok) return;
    setRequests(requests.filter((request)=>String(request.id) !== String(item.id)));
    onDeleteRequest?.(item);
    setSelectedProposalId('');
  }
  function proposalStatusMeta(item) {
    if (item.status === 'assigned') return { label:'Đã giao việc', tone:'b-blue' };
    if (item.status === 'approved') return { label:'Đã duyệt', tone:'b-green' };
    if (item.status === 'rewarded') return { label:`Đã ghi nhận ${item.rewardPoints || 0} điểm`, tone:'b-green' };
    if (item.status === 'rejected') return { label:'Từ chối', tone:'b-red' };
    if (item.status === 'info') return { label:item.opinionStatus === 'responded' ? 'Đã có ý kiến' : 'Đang xin ý kiến', tone:'b-amber' };
    return { label:'Chờ duyệt', tone:'b-amber' };
  }
  const showCreate = !approvalOnly && view !== 'track';
  const showTracking = view !== 'create';
  const selectedProposal = visibleProposalRequests.find((item)=>String(item.id) === String(selectedProposalId)) || null;
  const selectedProposalStatus = selectedProposal ? proposalStatusMeta(selectedProposal) : null;
  const selectedIsOpinionTarget = Boolean(selectedProposal && selectedProposal.status === 'info' && selectedProposal.opinionStatus !== 'responded' && String(selectedProposal.opinionRequestedEmail || '').trim().toLowerCase() === currentEmail);
  const selectedIsRecipient = Boolean(selectedProposal && isTaskProposalRecipient(selectedProposal));
  return <div className={`vwork-request-grid ${approvalOnly || view !== 'all' ? 'compact' : ''}`}>
    {showCreate && <Card title="Tạo Đề xuất công việc">
      <p className="muted">Gửi đề xuất công việc hoặc đề xuất phối hợp. Khi Giám đốc duyệt, hệ thống mới giao việc mới hoặc gắn thêm người phối hợp vào việc hiện có.</p>
      <div className="grid grid-2">
        <label><span>Loại đề xuất</span><select value={draft.type} onChange={(event)=>setDraft({...draft,type:event.target.value})}>{VWORK_PROPOSAL_TYPES.map((item)=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Duyệt bởi</span><input value="Giám đốc / người được uỷ quyền" disabled /></label>
      </div>
      {collaborationMode && <div className="soft-box" style={{marginTop:10}}><label><span>Chọn công việc cần phối hợp <b className="required-mark">*</b></span><select value={draft.targetTaskId} onChange={(event)=>setDraft({...draft,targetTaskId:event.target.value})}><option value="">{ownTaskOptions.length ? 'Chọn công việc đang hoạt động' : 'Chưa có công việc phù hợp'}</option>{ownTaskOptions.map((task)=><option key={task.id} value={task.id}>{task.title} · {task.ownerName || task.ownerLead || 'Chưa rõ người phụ trách'}</option>)}</select></label>{!ownTaskOptions.length ? <p className="vwork-collaboration-empty">Chưa có công việc đang hoạt động. Hãy tạo công việc trước hoặc đổi loại đề xuất sang “Đề xuất công việc mới”.</p> : null}<div className="vwork-chip-list vwork-team-chips"><span>Người phối hợp đề xuất <b className="required-mark">*</b></span>{uniqueOwnersByName(MASTER.owners).filter((item)=>!currentUser?.ownerIds?.includes(item.id)).map((item)=><button type="button" key={item.id} className={'vwork-person-chip ' + (draft.collaboratorOwnerIds.includes(item.id) ? 'active' : '')} onClick={()=>toggleDraftCollaborator(item.id)}><b>{getInitials(item.name)}</b>{item.name}</button>)}</div></div>}
      <label style={{marginTop:10}}><span>Tiêu đề đề xuất</span><input value={draft.title} onChange={(event)=>setDraft({...draft,title:event.target.value})} placeholder={selectedType.label} /></label>
      <div className="grid grid-2" style={{marginTop:10}}>
        <label><span>Gắn dự án / hợp đồng</span><input value={draft.project} onChange={(event)=>setDraft({...draft,project:event.target.value})} placeholder="VD: VNPT 2026" /></label>
        <label><span>Mức khẩn</span><select value={draft.urgency} onChange={(event)=>setDraft({...draft,urgency:event.target.value})}><option value="normal">Bình thường</option><option value="today">Trong ngày</option><option value="urgent">Gấp</option></select></label>
      </div>
      <label style={{marginTop:10}}><span>Nội dung chi tiết / lý do</span><textarea rows="3" value={draft.detail} onChange={(event)=>setDraft({...draft,detail:event.target.value})} placeholder={selectedType.hint} /></label>
      <label style={{marginTop:10}}><span>Đính kèm file</span><input type="file" multiple onChange={(event)=>setDraft({...draft,attachmentFiles:Array.from(event.target.files || [])})} /></label>
      {draft.attachmentFiles.length ? <p className="muted vwork-file-hint">Đã chọn {draft.attachmentFiles.length} file: {draft.attachmentFiles.map((file)=>file.name).join(', ')}</p> : <p className="muted vwork-file-hint">Có thể đính kèm nhiều file liên quan để người duyệt mở xem.</p>}
      <label style={{marginTop:10}}><span>Link liên quan</span><textarea rows="2" value={draft.attachmentLinksText} onChange={(event)=>setDraft({...draft,attachmentLinksText:event.target.value})} placeholder="Mỗi link một dòng" /></label>
      <div className="row" style={{justifyContent:'flex-end',marginTop:12}}><button className="btn btn-primary" type="button" disabled={isSubmitting} onClick={submitRequest}>{isSubmitting ? 'Đang gửi...' : 'Gửi đề xuất'}</button></div>
    </Card>}
    {showTracking && <Card title={`Theo dõi đề xuất (${visibleProposalRequests.length})`}>
      <div className="vwork-proposal-table-wrap">{visibleProposalRequests.length ? <table className="vwork-proposal-table"><thead><tr><th>Đề xuất</th><th>Người gửi</th><th>Người nhận / phối hợp</th><th>Mức độ</th><th>Trạng thái</th><th aria-label="Thao tác" /></tr></thead><tbody>{visibleProposalRequests.map((item)=>{ const status=proposalStatusMeta(item); const typeLabel=VWORK_PROPOSAL_TYPES.find((type)=>type.id===item.type)?.label || item.group || 'Đề xuất công việc'; const recipients=item.type==='collaboration' ? (item.collaboratorNames || []).join(', ') : item.type==='task_idea' ? (item.recipientName || 'Chưa chọn') : (item.opinionRequestedTo || item.delegatedApproverName || 'Giám đốc'); return <tr key={item.id} tabIndex={0} className="vwork-proposal-row" onClick={()=>setSelectedProposalId(item.id)} onKeyDown={(event)=>{ if(event.key==='Enter'||event.key===' '){ event.preventDefault(); setSelectedProposalId(item.id); } }}><td data-label="Đề xuất"><strong>{item.title}</strong><small>{item.id} · {typeLabel} · {item.project || 'Chưa gắn dự án'}</small></td><td data-label="Người gửi"><span>{item.ownerName || item.requestedBy || '-'}</span></td><td data-label="Người nhận / phối hợp"><span>{recipients || '-'}</span></td><td data-label="Mức độ"><span className={`vwork-urgency ${item.urgency === 'Gấp' ? 'urgent' : item.urgency === 'Trong ngày' ? 'today' : ''}`}>{item.urgency || 'Bình thường'}</span></td><td data-label="Trạng thái"><Badge tone={status.tone}>{status.label}</Badge></td><td><button className="btn btn-sm vwork-proposal-detail-button" type="button" onClick={(event)=>{ event.stopPropagation(); setSelectedProposalId(item.id); }}><Eye size={15} /> Chi tiết</button></td></tr>})}</tbody></table> : <div className="empty-panel">Chưa có đề xuất công việc cần xử lý.</div>}</div>
    </Card>}
    {selectedProposal && <div className="modal-bg vwork-proposal-detail-layer" role="presentation" onMouseDown={(event)=>{ if(event.target===event.currentTarget) setSelectedProposalId(''); }}><div className="modal vwork-proposal-detail-modal" role="dialog" aria-modal="true" aria-label={`Chi tiết đề xuất ${selectedProposal.title}`} onMouseDown={(event)=>event.stopPropagation()}>
      <button className="modal-x" type="button" aria-label="Đóng" onClick={()=>setSelectedProposalId('')}>×</button>
      <div className="vwork-proposal-detail-head"><div><span className="vwork-proposal-eyebrow">Chi tiết đề xuất</span><h3>{selectedProposal.title}</h3><p>{selectedProposal.id} · {selectedProposal.group || 'Đề xuất công việc'}</p></div><Badge tone={selectedProposalStatus.tone}>{selectedProposalStatus.label}</Badge></div>
      <div className="vwork-proposal-detail-body">
        <section className="vwork-proposal-summary"><h4>Thông tin đề xuất</h4><dl><div><dt>Người gửi</dt><dd>{selectedProposal.ownerName || selectedProposal.requestedBy || '-'}</dd></div><div><dt>Dự án / công việc</dt><dd>{selectedProposal.project || 'Chưa gắn dự án'}{selectedProposal.targetTaskId ? ` · #${selectedProposal.targetTaskId}` : ''}</dd></div><div><dt>Mức độ</dt><dd>{selectedProposal.urgency || 'Bình thường'}</dd></div><div><dt>Người nhận / phối hợp</dt><dd>{selectedProposal.type === 'collaboration' ? (selectedProposal.collaboratorNames || []).join(', ') || '-' : selectedProposal.type === 'task_idea' ? selectedProposal.recipientName || '-' : selectedProposal.opinionRequestedTo || selectedProposal.delegatedApproverName || 'Giám đốc'}</dd></div></dl></section>
        <section><h4>Nội dung</h4><p className="vwork-proposal-content">{selectedProposal.detail || 'Chưa có nội dung chi tiết.'}</p></section>
        {(selectedProposal.attachmentFiles?.length || selectedProposal.attachmentLinks?.length) ? <section><h4>Tài liệu liên quan</h4><div className="vwork-request-attachment-links">{(selectedProposal.attachmentFiles || []).map((file)=>(file.url ? <a key={`${file.name}-${file.url}`} href={file.url} target="_blank" rel="noreferrer"><Paperclip size={14} />{file.name}</a> : <span key={file.name}><Paperclip size={14} />{file.name}</span>))}{(selectedProposal.attachmentLinks || []).map((link)=><a key={link} href={normalizeAdminRequestUrl(link)} target="_blank" rel="noreferrer">{link}</a>)}</div></section> : null}
        {selectedProposal.opinionRequestedTo ? <section><h4>Ý kiến tham vấn</h4><div className="vwork-opinion-reminder"><strong>{selectedProposal.opinionStatus === 'responded' ? `Đã có ý kiến từ ${selectedProposal.opinionRequestedTo}` : `Đang chờ ý kiến: ${selectedProposal.opinionRequestedTo}`}</strong>{selectedProposal.opinionResponse ? <p>{selectedProposal.opinionResponse}</p> : null}</div></section> : null}
        {(selectedProposal.comments || []).length ? <section><h4>Phản hồi</h4><div className="vwork-request-log">{selectedProposal.comments.slice().reverse().map((entry,index)=><div key={`${entry.at}-${index}`}><strong>Phản hồi của {entry.by}</strong><small>{entry.at ? new Date(entry.at).toLocaleString('vi-VN') : ''}</small><p>{entry.note}</p></div>)}</div></section> : null}
        {selectedProposal.delegatedApproverName ? <div className="vwork-delegation-notice"><strong>Đã ủy quyền cho {selectedProposal.delegatedApproverName}</strong><span>Người được ủy quyền chịu trách nhiệm duyệt hoặc từ chối đề xuất này.</span></div> : null}
        {(selectedProposal.flowLog || []).length ? <section><h4>Nhật ký xử lý</h4><div className="vwork-request-log">{selectedProposal.flowLog.slice().reverse().map((event,index)=><div key={`${event.at}-${index}`}><strong>{event.action}</strong><small>{event.by} · {event.at ? new Date(event.at).toLocaleString('vi-VN') : ''}</small><p>{event.note || '-'}</p></div>)}</div></section> : null}
        {selectedIsOpinionTarget ? <section className="vwork-proposal-action-panel"><h4>Gửi ý kiến</h4><div className="vwork-opinion-response"><textarea rows="4" value={opinionResponsesByRequest[selectedProposal.id] || ''} onChange={(event)=>setOpinionResponsesByRequest((current)=>({...current,[selectedProposal.id]:event.target.value}))} placeholder="Nhập ý kiến, lưu ý hoặc điều kiện đề xuất..." /><button className="btn btn-primary" type="button" onClick={()=>respondToProposalOpinion(selectedProposal)}>Gửi ý kiến</button></div></section> : null}
        {selectedIsRecipient ? <section className="vwork-proposal-action-panel"><h4>Phản hồi đề xuất</h4><div className="vwork-opinion-response"><textarea rows="3" value={recipientResponsesByRequest[selectedProposal.id] || ''} onChange={(event)=>setRecipientResponsesByRequest((current)=>({...current,[selectedProposal.id]:event.target.value}))} placeholder="Phản hồi đề xuất hoặc ghi nhận giá trị sáng kiến..." /><select value={recipientRewardsByRequest[selectedProposal.id] || ''} onChange={(event)=>setRecipientRewardsByRequest((current)=>({...current,[selectedProposal.id]:event.target.value}))}><option value="">Không cộng điểm</option><option value="10">10 điểm</option><option value="20">20 điểm</option><option value="50">50 điểm</option></select><button className="btn btn-primary" type="button" onClick={()=>respondToTaskProposal(selectedProposal)}>Gửi phản hồi</button></div></section> : null}
        {!selectedIsOpinionTarget && (selectedProposal.status === 'pending' || selectedProposal.status === 'info') && isProposalDecisionOwner(selectedProposal) ? <section className="vwork-proposal-action-panel"><h4>Xử lý đề xuất</h4>{isDirectorUser(currentUser, '') && !selectedProposal.delegatedApproverEmail ? <div className="vwork-proposal-delegation-control">{openDelegateRequestId === selectedProposal.id ? <><select value={delegateTargetsByRequest[selectedProposal.id] || ''} onChange={(event)=>setDelegateTargetsByRequest((current)=>({...current,[selectedProposal.id]:event.target.value}))}><option value="">Chọn người được ủy quyền</option>{peopleOneUsers.filter((user)=>user.email && String(user.email).toLowerCase() !== currentEmail).map((user)=><option key={user.email} value={user.email}>{user.name}</option>)}</select><button className="btn btn-primary" type="button" onClick={()=>delegateProposal(selectedProposal)}>Xác nhận ủy quyền</button><button className="btn" type="button" onClick={()=>setOpenDelegateRequestId('')}>Hủy</button></> : <button className="btn" type="button" onClick={()=>setOpenDelegateRequestId(selectedProposal.id)}>Ủy quyền</button>}</div> : null}<div className="vwork-proposal-decision-fields"><textarea rows="3" value={decisionNotes[selectedProposal.id] || ''} onChange={(event)=>setDecisionNotes((current)=>({...current,[selectedProposal.id]:event.target.value}))} placeholder="Ý kiến khi duyệt hoặc lý do khi từ chối..." /><select value={opinionTargetsByRequest[selectedProposal.id] || ''} onChange={(event)=>setOpinionTargetsByRequest((current)=>({...current,[selectedProposal.id]:event.target.value}))}><option value="">Chọn người cần cho ý kiến</option>{peopleOneUsers.filter((user)=>user.email&&user.email!==currentUser?.email).map((user)=><option key={user.email} value={user.email}>{user.name} · {user.title}</option>)}</select></div><div className="vwork-request-actions"><button className="btn btn-primary" type="button" onClick={()=>onAssignFromRequest(selectedProposal)}>{selectedProposal.type === 'collaboration' ? 'Duyệt & thêm người phối hợp' : 'Duyệt & giao việc'}</button><button className="btn btn-danger" type="button" onClick={()=>setStatus(selectedProposal.id,'rejected')}>Từ chối</button><button className="btn" type="button" onClick={()=>setStatus(selectedProposal.id,'info')}>Đề nghị cho ý kiến</button></div></section> : null}
        {canDeleteProposal(selectedProposal) ? <div className="vwork-request-delete-action"><button className="btn btn-danger btn-sm" type="button" onClick={()=>deleteProposal(selectedProposal)}><Trash2 size={15} /> Xóa đề xuất</button></div> : null}
      </div>
    </div></div>}
  </div>;
}
function IndependentTask({ tasks, setTasks, role, currentUser, settings = [], setSettings }){
  const titleInputRef = useRef(null);
  const defaultOwnerId = currentUser?.ownerIds?.[0] || MASTER.owners[0]?.id || '';
  const canCreateTask = can(role, 'create_plan');
  const canImportTasks = can(role, 'import_excel');
  const [mode, setMode] = useState(()=>canCreateTask ? 'quick' : 'import');
  const [requests, setRequests] = useState(VWORK_REQUEST_SEEDS);
  const [fromRequest, setFromRequest] = useState(null);
  const [checkpointDraft, setCheckpointDraft] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState({
    title:'',
    jobCode:'JOB-PM',
    ownerId:defaultOwnerId,
    participants:[],
    startDate:addDays(0),
    deadline:addDays(7),
    priority:'Medium',
    risk:'Medium',
    method:'',
    mitigation:'',
    checkpoints:[],
    reviewerOwnerId:'',
    reviewerOwnerIds:[],
  });
  const [message, setMessage] = useState('');
  if (!canCreateTask && !canImportTasks) return <AccessDenied role={role} />;
  const availableModes = VWORK_ASSIGNMENT_MODES.filter((item)=>can(role, item.action));
  const job = MASTER.jobs.find(([code])=>code === form.jobCode) || MASTER.jobs[0];
  const checklist = standardChecklistForJob(form.jobCode);
  const directorUser = MASTER.users.find((user)=>(user.roles || []).includes('vplanning_director'));
  const directorOwner = directorUser ? { id:directorUser.email, name:'Giám đốc Hải Lê', taskOwnerName:directorUser.name } : null;
  const visibleOwners = [directorOwner, ...uniqueOwnersByName(MASTER.owners)].filter(Boolean);
  const assignmentOwnerById = (ownerId) => visibleOwners.find((item)=>String(item.id) === String(ownerId));
  const owner = assignmentOwnerById(form.ownerId) || MASTER.owners[0];
  const topicGuides = getDeepTaskSuggestions(form.jobCode, settings);
  const priorityOptions = [
    { value:'Low', label:'Thấp' },
    { value:'Medium', label:'Trung bình' },
    { value:'High', label:'Gấp' },
  ];
  const riskOptions = [
    { value:'Low', label:'Thấp' },
    { value:'Medium', label:'Trung bình' },
    { value:'High', label:'Cao' },
  ];
  function submit(){
    const title = String(titleInputRef.current?.value || form.title || '').trim();
    if (!title) {
      setMessage('Vui lòng nhập tên công việc.');
      return;
    }
    const reviewerOwnerId = form.reviewerOwnerId || directorOwner?.id || '';
    const reviewer = assignmentOwnerById(reviewerOwnerId);
    if (!reviewer) {
      setMessage('Vui lòng chọn người duyệt công việc.');
      return;
    }
    if (String(reviewer.id) === String(owner.id)) {
      setMessage('Người phụ trách không được tự duyệt công việc của mình.');
      return;
    }
    const base = Math.max(0, ...tasks.map((task)=>Number(task.id) || 0));
    const objective = form.jobCode === 'JOB-FINANCE' ? 'OBJ-005' : form.jobCode === 'JOB-LMS' ? 'OBJ-003' : 'OBJ-001';
    const result = form.jobCode === 'JOB-LMS' ? 'RES-003' : form.jobCode === 'JOB-FACULTY' ? 'RES-002' : 'RES-005';
    const task = {
      id:base + 1,
      stt:'',
      projectCode:'',
      customer:'PeopleOne',
      group:'Giao việc độc lập',
      title,
      workType:'Việc độc lập',
      workCode:uid('JOB').toUpperCase(),
      keyObjective:MASTER.objectives.find(([code])=>code===objective)?.[1] || '',
      objectiveId:objective,
      resultName:MASTER.results.find(([code])=>code===result)?.[1] || '',
      resultId:result,
      ownerLead:owner.taskOwnerName || owner.name,
      ownerId:owner.id,
      ownerName:owner.taskOwnerName || owner.name,
      participants:form.participants.map((id)=>assignmentOwnerById(id)?.taskOwnerName || assignmentOwnerById(id)?.name).filter(Boolean).join(', '),
      participantOwnerIds:form.participants,
      participantNames:form.participants.map((id)=>assignmentOwnerById(id)?.taskOwnerName || assignmentOwnerById(id)?.name).filter(Boolean),
      deadline:form.deadline,
      startDate:form.startDate,
      jobCode:form.jobCode,
      okrCode:`${objective}-${result}`,
      status:'assigned',
      priority:form.priority,
      complete:0,
      predecessor:'',
      deliverable:'',
      approvalBy:reviewer.id,
      approvalByName:reviewer.taskOwnerName || reviewer.name,
      reviewerOwnerId:reviewer.id,
      reviewerOwnerIds:[reviewer.id],
      reviewerName:reviewer.taskOwnerName || reviewer.name,
      reviewerNames:[reviewer.taskOwnerName || reviewer.name],
      createdById:currentUser?.id || currentUser?.email || '',
      createdByEmail:currentUser?.email || '',
      createdByName:currentUser?.name || '',
      risk:form.risk,
      sourceModule:'vplanning',
      sourceId:'INDEPENDENT',
      sourceUrl:'',
      deliverableLink:'',
      evidenceLink:'',
      traffic: form.risk === 'High' || form.risk === 'Critical' ? 'Amber' : 'Green',
      checklist:form.checkpoints.length ? form.checkpoints.map((item)=>ck(item)) : checklist,
      method:[form.method, form.mitigation ? `mitigation: ${form.mitigation}` : '', fromRequest ? `source request: ${fromRequest.id}` : ''].filter(Boolean).join('\n\n'),
      reports:[],
      activity:addTaskEvent({ activity:[] }, currentUser, 'Giao việc độc lập', title),
      errors:[],
      stage:'assigned',
    };
    setTasks([...tasks, task]);
    if (mode === 'deep' && setSettings) {
      setSettings((previous)=>rememberDeepTaskSuggestion(previous, form.jobCode, title, form.checkpoints));
    }
    if (fromRequest) {
      setRequests(requests.map((item)=>item.id === fromRequest.id ? { ...item, status:'assigned' } : item));
    }
    setMessage(`Đã giao việc độc lập cho ${owner.name}. Checklist có ${task.checklist.length} checkpoint.`);
    if (titleInputRef.current) titleInputRef.current.value = '';
    setForm({...form, title:'', method:'', mitigation:'', checkpoints:[]});
    setCheckpointDraft('');
    setFromRequest(null);
  }
  function approveProposalAndAssign(request) {
    setFromRequest(request);
    setMode('deep');
    setForm({
      ...form,
      title:request.title.replace(/^(Xin ý kiến|Xin y kien|Đề xuất|De xuat|Đề nghị|De nghi)\s+/i, ''),
      jobCode:request.assignJobCode || form.jobCode,
      ownerId:request.ownerId || defaultOwnerId || form.ownerId,
      reviewerOwnerId:'',
      reviewerOwnerIds:[],
      method:[request.detail, `Nguon: de xuat ${request.id}`].filter(Boolean).join('\n\n'),
      risk:request.urgency === 'Gap' ? 'High' : form.risk,
      checkpoints:standardChecklistForJob(request.assignJobCode || form.jobCode).map((item)=>item.label),
    });
    titleInputRef.current?.focus();
  }
  function applyDeepTaskSuggestion(item) {
    setForm({
      ...form,
      title:form.title || item.title,
      method:item.detail,
      checkpoints:item.checkpoints,
    });
    titleInputRef.current?.focus();
  }
  function addCheckpoint() {
    const label = checkpointDraft.trim();
    if (!label) return;
    setForm({...form, checkpoints:[...form.checkpoints, label]});
    setCheckpointDraft('');
  }
  function removeCheckpoint(index) {
    setForm({...form, checkpoints:form.checkpoints.filter((_, itemIndex)=>itemIndex !== index)});
  }
  function toggleParticipant(id) {
    const exists = form.participants.includes(id);
    setForm({...form, participants: exists ? form.participants.filter((item)=>item !== id) : [...form.participants, id]});
  }
  return <div>
    <Card title="Chọn cách tạo việc">
      <div className="vwork-mode-grid vwork-create-mode-grid">{availableModes.map((item)=><button type="button" key={item.id} className={'vwork-mode ' + (mode===item.id?'active':'')} onClick={()=>setMode(item.id)}><strong>{item.title}</strong><span>{item.desc}</span></button>)}</div>
    </Card>
    {mode === 'import' ? <Intake tasks={tasks} setTasks={setTasks} role={role} currentUser={currentUser} /> : <Card title={mode === 'deep' ? 'Tạo việc chuyên sâu' : 'Tạo việc nhanh'} action={fromRequest ? <Badge tone="b-green">Từ đề xuất {fromRequest.id}</Badge> : null}>
      {mode === 'deep' && <div className="vwork-type-grid">{VWORK_WORK_TYPES.map((item)=><button type="button" key={item.jobCode} className={'vwork-type ' + (form.jobCode===item.jobCode?'active':'')} onClick={()=>setForm({...form,jobCode:item.jobCode})}><strong>{item.title}</strong><span>{item.desc}</span></button>)}</div>}
      <div className="vwork-assignment-card">
        <div className="vwork-form-section-title">{mode === 'deep' ? 'Tạo việc chuyên sâu' : 'Tạo việc nhanh'}</div>
        <div className="vwork-form-section-sub">{mode === 'deep' ? 'Chọn chủ đề liên quan, nhập checkpoint để người nhận tick hoặc điều chỉnh khi thực hiện.' : 'Việc phát sinh hằng ngày. Chọn đủ danh mục, hạn và người theo dõi.'}</div>
        <label><span>Tên công việc</span><input ref={titleInputRef} value={form.title} onChange={(event)=>setForm({...form,title:event.target.value})} placeholder="Chọn gợi ý hoặc nhập việc mới..." /></label>
        {mode === 'deep' && <div className="vwork-title-suggestions"><span>Đề xuất theo nhóm việc</span><div>{topicGuides.map((item)=><button type="button" key={item.title} onClick={()=>applyDeepTaskSuggestion(item)}><strong>{item.title}</strong>{item.custom ? <em>Đã nhập trước</em> : null}</button>)}</div></div>}
        <div className="vwork-checkpoint-builder">
          <span>Checkpoint</span>
          <div className="vwork-checkpoint-add"><input value={checkpointDraft} onChange={(event)=>setCheckpointDraft(event.target.value)} placeholder="Thêm mốc kiểm tra / việc nhỏ..." onKeyDown={(event)=>{ if (event.key === 'Enter') { event.preventDefault(); addCheckpoint(); } }} /><button className="btn" type="button" onClick={addCheckpoint}>+</button></div>
          <div className="vwork-checkpoint-list">{form.checkpoints.map((item, index)=><button type="button" key={`${item}-${index}`} onClick={()=>removeCheckpoint(index)}><b>{index + 1}</b>{item}<em>×</em></button>)}</div>
        </div>
        <div className="grid grid-3 vwork-assignment-core" style={{marginTop:10}}>
          <label><span>Loại việc</span><select value={form.jobCode} onChange={(event)=>setForm({...form,jobCode:event.target.value})}>{MASTER.jobs.map(([code,name])=><option key={code} value={code}>{code} - {name}</option>)}</select></label>
          <label className="vwork-owner-select"><span>Người chủ trì</span><select value={form.ownerId} onChange={(event)=>setForm({...form,ownerId:event.target.value})}>{visibleOwners.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="vwork-owner-select"><span>Người duyệt</span><select value={form.reviewerOwnerId || directorOwner?.id || ''} onChange={(event)=>setForm({...form,reviewerOwnerId:event.target.value,reviewerOwnerIds:[event.target.value]})}>{visibleOwners.filter((item)=>String(item.id)!==String(form.ownerId)).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <p className="vwork-reviewer-hint">Người duyệt được xem báo cáo, trao đổi, nhắc việc, yêu cầu bổ sung, duyệt hoàn thành và có thể uỷ quyền duyệt việc này cho người khác.</p>
        <div className="row between" style={{marginTop:12}}><span className="muted">Các mục nâng cao: người phối hợp, ưu tiên, rủi ro và hướng dẫn chi tiết.</span><button className="btn btn-sm" type="button" onClick={()=>setShowAdvanced((value)=>!value)}>{showAdvanced ? 'Ẩn nâng cao' : 'Mở nâng cao'}</button></div>
        {showAdvanced && <div className="vwork-advanced-fields">
        <div className="vwork-chip-list vwork-lead-chips"><span>Người chủ trì</span>{visibleOwners.map((item)=><button type="button" key={item.id} className={'vwork-person-chip lead ' + (form.ownerId === item.id ? 'active' : '')} onClick={()=>setForm({...form,ownerId:item.id,participants:form.participants.filter((participant)=>participant !== item.id)})}><b>{getInitials(item.name)}</b>{item.name}</button>)}</div>
        <div className="vwork-chip-list vwork-team-chips"><span>Người phối hợp</span>{visibleOwners.filter((item)=>item.id !== form.ownerId).map((item)=><button type="button" key={item.id} className={'vwork-person-chip ' + (form.participants.includes(item.id) ? 'active' : '')} onClick={()=>toggleParticipant(item.id)}><b>{getInitials(item.name)}</b>{item.name}</button>)}</div>
        <div className="grid grid-2" style={{marginTop:10}}>
          <label><span>Bắt đầu</span><input type="date" value={form.startDate} onChange={(event)=>setForm({...form,startDate:event.target.value})} /></label>
          <label><span>Hạn</span><input type="date" value={form.deadline} onChange={(event)=>setForm({...form,deadline:event.target.value})} /></label>
        </div>
        <div className="vwork-segmented-wrap">
          <div><span>Ưu tiên</span><div className="vwork-segmented priority">{priorityOptions.map((item)=><button type="button" key={item.value} data-v={item.value.toLowerCase()} className={form.priority === item.value ? 'active' : ''} onClick={()=>setForm({...form,priority:item.value})}>{item.label}</button>)}</div></div>
          <div><span>Rủi ro</span><div className="vwork-segmented risk">{riskOptions.map((item)=><button type="button" key={item.value} data-v={item.value.toLowerCase()} className={form.risk === item.value ? 'active' : ''} onClick={()=>setForm({...form,risk:item.value})}>{item.label}</button>)}</div></div>
        </div>
        {(form.risk === 'High' || form.risk === 'Critical') && <label style={{marginTop:10}}><span>Biện pháp xử lý rủi ro</span><textarea rows="2" value={form.mitigation} onChange={(event)=>setForm({...form,mitigation:event.target.value})} placeholder="Nêu cách giảm rủi ro, người hỗ trợ, mốc kiểm tra..." /></label>}
        <label style={{marginTop:10}}><span>Hướng dẫn / lưu ý thực hiện</span><textarea rows="2" value={form.method} onChange={(event)=>setForm({...form,method:event.target.value})} /></label>
        </div>}
      </div>
      <div className="vwork-footbar"><span>Chọn người & hạn để giao</span><button className="btn" type="button" onClick={()=>setMessage('Đã lưu nháp giao việc V-Work.')}>Nháp</button><button className="btn btn-primary" onClick={submit}>Giao việc</button></div>
    </Card>}
    {message && mode !== 'import' ? <Card><strong>{message}</strong></Card> : null}
  </div>;
}
function Inbox({ tasks, setTasks, role, me, currentUser }){
  const [detail, setDetail] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const visible = getOwnTasks(tasks, me, currentUser);
  const filtered = filterTasksByStatus(visible, statusFilter);
  const counts = statusCounts(visible);
  const patch = (id, data) => setTasks(tasks.map((task)=>task.id === id ? {...task, ...data} : task));
  return <div><Card title="Inbox công việc">
    <div className="filter-bar"><label><span>Trạng thái</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}>{STATUS_FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><div className="pill-row">{STATUS_FILTERS.filter(([value])=>value !== 'all').map(([value,label])=><button className="btn btn-sm status-pill" key={value} onClick={()=>setStatusFilter(value)}><Badge tone={TASK_STATUS_TONE[value] || 'b-gray'}>{counts[value] || 0}</Badge>{label}</button>)}</div></div>
    <TaskTable rows={filtered} onOpen={setDetail} />
  </Card>{detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}</div>;
}
export function Review({ tasks, setTasks, role, me, currentUser, setPage, paymentRequestRows = [], paymentRequestLoadState = 'loaded', onPaymentRequestsLoaded = null }){
  const [activeQueue, setActiveQueue] = useState('');
  const [detail, setDetail] = useState(null);
  const reviewTasks = getReviewTasks(tasks, role, currentUser)
    .filter((task,index,rows)=>rows.findIndex((row)=>String(row.id) === String(task.id)) === index);
  const workReviewTasks = reviewTasks.filter((task)=>!isVWorkAdminRequest(task) && !isVWorkProposalRequestTask(task));
  const requestReviewTasks = getVWorkAdminRequestReviewTasks(tasks, paymentRequestRows, paymentRequestLoadState === 'loaded', role, currentUser);
  const proposalReviewRequests = getVWorkProposalReviewRequests(tasks, currentUser);
  const requestCount = paymentRequestLoadState === 'loaded' ? requestReviewTasks.length : null;
  const totalReviewCount = workReviewTasks.length + proposalReviewRequests.length + (requestCount || 0);
  const reviewSections = [
    { key:'work', label:'Công việc cần duyệt', description:'Các công việc cần kiểm tra báo cáo, minh chứng và duyệt hoàn thành.', count:workReviewTasks.length, icon:ClipboardCheck, tone:'work' },
    { key:'request', label:'Đề nghị cần duyệt', description:'Phiếu thanh toán, tạm ứng và các đề nghị hành chính đang chờ xử lý.', count:requestCount, icon:ReceiptText, tone:'request' },
    { key:'proposal', label:'Đề xuất cần duyệt', description:'Đề xuất công việc, phối hợp hoặc sáng kiến cần xem xét và quyết định.', count:proposalReviewRequests.length, icon:Target, tone:'proposal' },
  ];
  const activeSection = reviewSections.find((section)=>section.key === activeQueue);
  const patch = (id, data) => setTasks((previous)=>previous.map((task)=>task.id === id ? {...task, ...data} : task));
  return <div className="vwork-review-stack">
    <section className="vwork-review-hub" aria-labelledby="vwork-review-hub-title">
      <div className="vwork-review-hub-head"><div><span>V-Work · PeopleOne</span><h2 id="vwork-review-hub-title">Cần duyệt</h2><p>Chọn loại hồ sơ để mở danh sách cần xử lý.</p></div><Badge tone="b-red">{paymentRequestLoadState === 'loaded' ? `${totalReviewCount} chờ xử lý` : paymentRequestLoadState === 'error' ? 'Chưa tải đủ dữ liệu' : 'Đang tải đề nghị'}</Badge></div>
      <div className="vwork-review-category-grid">
        {reviewSections.map((section)=>{ const Icon=section.icon; const countLabel=section.count == null ? (paymentRequestLoadState === 'error' ? 'chưa tải' : 'đang tải') : `${section.count} mục chờ xử lý`; return <button type="button" key={section.key} className={`vwork-review-category ${section.tone}`} onClick={()=>setActiveQueue(section.key)} aria-label={`Mở ${section.label}, ${countLabel}`}>
          <span className="vwork-review-category-icon"><Icon size={22} /></span>
          <span className="vwork-review-category-copy"><strong>{section.label}</strong><small>{section.description}</small></span>
          <span className="vwork-review-category-count"><b>{section.count == null ? '—' : section.count}</b><small>{section.count == null ? countLabel : 'chờ xử lý'}</small></span>
          <span className="vwork-review-category-open">Mở danh sách <ArrowRight size={17} /></span>
        </button>; })}
      </div>
    </section>
    {activeSection && <div className="modal-bg vwork-review-layer" role="presentation" onMouseDown={(event)=>{ if(event.target === event.currentTarget) setActiveQueue(''); }}><section className="modal vwork-review-layer-modal" role="dialog" aria-modal="true" aria-label={activeSection.label} onMouseDown={(event)=>event.stopPropagation()}>
      <header className="vwork-review-layer-head"><div><span>Danh sách cần xử lý</span><h3>{activeSection.label}</h3><p>{activeSection.description}</p></div><div><Badge tone="b-red">{activeSection.count == null ? (paymentRequestLoadState === 'error' ? 'Chưa tải đủ dữ liệu' : 'Đang tải') : `${activeSection.count} chờ xử lý`}</Badge><button className="modal-x" type="button" aria-label="Đóng danh sách" onClick={()=>setActiveQueue('')}>×</button></div></header>
      <div className="vwork-review-layer-body">
        {activeQueue === 'work' ? <div className="vwork-v2-list">
          {workReviewTasks.map((task)=><VWorkTaskCard key={task.id} task={task} onOpen={setDetail} openLabel="Kiểm tra & duyệt" action={<Badge tone={isTaskOverdue(task) ? 'b-red' : 'b-purple'}>{isTaskOverdue(task) ? 'Nộp sau hạn' : 'Chờ duyệt'}</Badge>} />)}
          {!workReviewTasks.length && <div className="empty-panel">Không có công việc đang chờ duyệt hoàn thành.</div>}
        </div> : <VWorkAdminRequestDesk tasks={tasks} setTasks={setTasks} role={role} currentUser={currentUser} mode="approval" approvalCategory={activeQueue} embedded onPaymentRequestsLoaded={onPaymentRequestsLoaded} />}
      </div>
    </section></div>}
    {detail && <TaskDetail task={tasks.find((task)=>task.id === detail.id) || detail} role={role} me={me} currentUser={currentUser} initialView="review" onClose={()=>setDetail(null)} onPatch={patch} />}
  </div>;
}
function WorkloadDetail({ owner, tasks, setTasks, role, me, currentUser, onBack }){
  const [detail, setDetail] = useState(null);
  const metrics = workloadMetrics(owner, tasks);
  const ownerTasks = metrics.tasks;
  const patch = (id, data) => setTasks(tasks.map((task)=>task.id === id ? {...task, ...data} : task));
  return <div>
    <Card title={`Hồ sơ workload - ${owner.name}`} action={<button className="btn btn-sm" onClick={onBack}>Quay lại workload</button>}>
      <div className="grid grid-4">
        <div className="kpi"><div className="num">{metrics.total}</div><div className="lbl">Tổng việc</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--blue)'}}>{metrics.load}%</div><div className="lbl">Điểm tải</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--amber)'}}>{metrics.review}</div><div className="lbl">Cần duyệt</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--red)'}}>{metrics.urgent}</div><div className="lbl">Cần chỉ đạo</div></div>
      </div>
      <div className="soft-box"><strong>Usecase quản lý tải việc</strong><p className="muted">PM/giám đốc mở hồ sơ nhân sự để cân tải, phát hiện việc trễ, mở từng việc để nhắc tiến độ, bổ sung minh chứng hoặc chuyển duyệt.</p></div>
    </Card>
    <Card title="Công việc theo nhân sự"><TaskTable rows={ownerTasks} onOpen={setDetail} /></Card>
    {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}
  </div>;
}
function Workload({ tasks, setTasks, role, me, currentUser }){
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [projectFilter, setProjectFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const scopedTasks = getVisibleTasks(tasks, role, me, currentUser);
  const projectOptions = ['all', ...new Set(scopedTasks.map((task)=>task.projectCode || 'Việc chung'))];
  const filteredTasks = filterTasksByStatus(scopedTasks, statusFilter).filter((task)=>projectFilter === 'all' || (task.projectCode || 'Việc chung') === projectFilter);
  const rows = workloadOwners().map((owner)=>workloadMetrics(owner, filteredTasks));
  if (selectedOwner) return <WorkloadDetail owner={selectedOwner} tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} onBack={()=>setSelectedOwner(null)} />;
  return <Card title="Bảng điều phối / workload" action={<div className="row"><label><span>Dự án</span><select value={projectFilter} onChange={(event)=>setProjectFilter(event.target.value)}>{projectOptions.map((item)=><option key={item} value={item}>{item === 'all' ? 'Tất cả dự án' : item}</option>)}</select></label><label><span>Trạng thái</span><select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}>{STATUS_FILTERS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div>}><div className="table-wrap"><table><thead><tr><th>Nhân sự</th><th>Tổng việc</th><th>Đang xử lý</th><th>Cần duyệt</th><th>Cần GĐ</th><th>Thiếu minh chứng</th><th>Điểm tải</th><th></th></tr></thead><tbody>{rows.map((row)=><tr key={row.owner.id}><td><strong>{row.owner.name}</strong></td><td>{row.total}</td><td>{row.active}</td><td>{row.review}</td><td>{row.urgent}</td><td>{row.missingEvidence}</td><td style={{minWidth:120}}><Progress value={row.load} /></td><td><button className="btn btn-sm" onClick={()=>setSelectedOwner(row.owner)}>Mở</button></td></tr>)}</tbody></table></div></Card>;
}
function parseTaskDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(`${raw.slice(0,10)}T00:00:00`);
  const vi = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (vi) return new Date(Number(vi[3]), Number(vi[2]) - 1, Number(vi[1]));
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function dateKey(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0,10);
}
function weekStartOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}
function addDateDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function taskDates(task) {
  const rows = [parseTaskDate(task.deadline)];
  (task.reports || []).forEach((item)=>rows.push(parseTaskDate(item.date)));
  (task.activity || []).forEach((item)=>rows.push(parseTaskDate(item.at)));
  return rows.filter(Boolean);
}
function taskInWeek(task, weekStart) {
  const start = new Date(weekStart);
  const end = addDateDays(start, 7);
  return taskDates(task).some((date)=>date >= start && date < end);
}
function weekOptionsFromTasks(tasks) {
  const starts = new Set(taskDates({ deadline:addDays(0), reports:[], activity:[] }).map((date)=>dateKey(weekStartOf(date))));
  tasks.flatMap(taskDates).forEach((date)=>starts.add(dateKey(weekStartOf(date))));
  return [...starts].sort((left, right)=>right.localeCompare(left));
}
function weeklyScoreForOwner(owner, scopedTasks, weekStartKey) {
  const start = parseTaskDate(weekStartKey);
  const rows = scopedTasks.filter((task)=>taskBelongsToOwner(task, owner) && taskInWeek(task, start));
  const completed = rows.filter(isTaskDone).length;
  const overdue = rows.filter(isTaskOverdue).length;
  const pending = rows.filter((task)=>['reported','lead_approved','explain_requested'].includes(task.stage)).length;
  const reported = rows.filter((task)=>(task.reports || []).some((item)=> {
    const date = parseTaskDate(item.date);
    return date && date >= start && date < addDateDays(start, 7);
  })).length;
  const missingEvidence = rows.filter((task)=>!task.evidenceLink && !task.deliverableLink && !isTaskDone(task)).length;
  const onTime = rows.filter((task)=>isTaskDone(task) && task.deadline && parseTaskDate(task.deadline) >= start).length;
  const avgProgress = rows.length ? Math.round(rows.reduce((sum, task)=>sum + progressOf(task), 0) / rows.length) : 0;
  const completionRate = rows.length ? Math.round(completed / rows.length * 100) : 0;
  const reportRate = rows.length ? Math.round(reported / rows.length * 100) : 0;
  const score = rows.length ? Math.max(0, Math.min(100, Math.round(completionRate * .38 + avgProgress * .24 + reportRate * .18 + Math.max(0, 100 - overdue * 22 - missingEvidence * 10 - pending * 4) * .2))) : 0;
  const assessment = !rows.length ? 'Chưa có việc tuần này' : score >= 80 && overdue === 0 ? 'Hoàn thành tốt' : overdue || score < 55 ? 'Cần chỉ đạo/nhắc việc' : pending || missingEvidence ? 'Cần đẩy nhanh duyệt' : 'Đang ổn';
  const tone = !rows.length ? 'b-gray' : score >= 80 && overdue === 0 ? 'b-green' : overdue || score < 55 ? 'b-red' : 'b-amber';
  return { owner, tasks:rows, total:rows.length, completed, overdue, pending, reported, missingEvidence, onTime, avgProgress, score, assessment, tone };
}
function WeeklyAssessment({ tasks, setTasks, role, me, currentUser }) {
  const scopedTasks = getVisibleTasks(tasks, role, me, currentUser);
  const weekOptions = weekOptionsFromTasks(scopedTasks);
  const [weekStart, setWeekStart] = useState(weekOptions[0] || dateKey(weekStartOf(parseTaskDate(addDays(0)))));
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (weekOptions.length && !weekOptions.includes(weekStart)) setWeekStart(weekOptions[0]);
  }, [weekOptions.join('|'), weekStart]);
  const rows = workloadOwners().map((owner)=>weeklyScoreForOwner(owner, scopedTasks, weekStart)).filter((row)=>row.total).sort((left, right)=>right.score - left.score || left.overdue - right.overdue);
  const selected = selectedOwner ? rows.find((row)=>row.owner.id === selectedOwner.id) || weeklyScoreForOwner(selectedOwner, scopedTasks, weekStart) : null;
  const weekEnd = dateKey(addDateDays(parseTaskDate(weekStart), 6));
  const best = rows.filter((row)=>row.score >= 80 && row.overdue === 0).length;
  const late = rows.reduce((sum, row)=>sum + row.overdue, 0);
  const missing = rows.reduce((sum, row)=>sum + row.missingEvidence, 0);
  const patch = (id, data) => setTasks((previous)=>previous.map((task)=>task.id === id ? {...task, ...data} : task));
  return <div>
    <Card title="Đánh giá tuần theo nhân sự" action={<label style={{minWidth:220}}><span>Chọn tuần</span><select value={weekStart} onChange={(event)=>{ setWeekStart(event.target.value); setSelectedOwner(null); }}>{weekOptions.map((value)=><option key={value} value={value}>{value} đến {dateKey(addDateDays(parseTaskDate(value), 6))}</option>)}</select></label>}>
      <div className="grid grid-4">
        <div className="kpi"><div className="num">{rows.length}</div><div className="lbl">Nhân sự có việc</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--green)'}}>{best}</div><div className="lbl">Hoàn thành tốt</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--red)'}}>{late}</div><div className="lbl">Việc trễ hạn</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--amber)'}}>{missing}</div><div className="lbl">Thiếu minh chứng</div></div>
      </div>
      <p className="muted">Dữ liệu lấy trực tiếp từ công việc đang lưu trong V-Work: deadline, stage, checklist, báo cáo, minh chứng và lịch sử thao tác. Tuần đang xem: <strong>{weekStart} đến {weekEnd}</strong>.</p>
      <div className="table-wrap"><table><thead><tr><th>Hạng</th><th>Nhân sự</th><th>Việc tuần</th><th>Hoàn thành</th><th>Trễ hạn</th><th>Chờ duyệt</th><th>Báo cáo</th><th>Thiếu minh chứng</th><th>Tiến độ TB</th><th>Điểm tuần</th><th>Nhận định</th><th></th></tr></thead><tbody>{rows.map((row, index)=><tr key={row.owner.id}><td>{index + 1}</td><td><strong>{row.owner.name}</strong></td><td>{row.total}</td><td>{row.completed}</td><td><Badge tone={row.overdue ? 'b-red' : 'b-green'}>{row.overdue}</Badge></td><td>{row.pending}</td><td>{row.reported}</td><td>{row.missingEvidence}</td><td><Progress value={row.avgProgress} /></td><td><Badge tone={row.tone}>{row.score}</Badge></td><td>{row.assessment}</td><td><button className="btn btn-sm" onClick={()=>setSelectedOwner(row.owner)}>Mở</button></td></tr>)}{!rows.length && <tr><td colSpan={12} className="muted">Chưa có dữ liệu công việc trong tuần này.</td></tr>}</tbody></table></div>
    </Card>
    {selected && <Card title={`Chi tiết tuần - ${selected.owner.name}`} action={<button className="btn btn-sm" onClick={()=>setSelectedOwner(null)}>Đóng chi tiết</button>}>
      <div className="grid grid-4">
        <div className="soft-box"><strong>Điểm tuần</strong><div className="num" style={{fontSize:24}}>{selected.score}</div><p className="muted">{selected.assessment}</p></div>
        <div className="soft-box"><strong>Hoàn thành</strong><div className="num" style={{fontSize:24,color:'var(--green)'}}>{selected.completed}/{selected.total}</div><p className="muted">KSV xác nhận hoặc completed.</p></div>
        <div className="soft-box"><strong>Trễ hạn</strong><div className="num" style={{fontSize:24,color:'var(--red)'}}>{selected.overdue}</div><p className="muted">Chưa hoàn thành và quá deadline.</p></div>
        <div className="soft-box"><strong>Thiếu minh chứng</strong><div className="num" style={{fontSize:24,color:'var(--amber)'}}>{selected.missingEvidence}</div><p className="muted">Chưa có evidence/deliverable link.</p></div>
      </div>
      <TaskTable rows={selected.tasks} onOpen={setDetail} />
    </Card>}
    {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}
  </div>;
}
function Monthly({ tasks, role, me, currentUser }){
  const scopedTasks = getVisibleTasks(tasks, role, me, currentUser);
  const rows = workloadOwners().map((owner)=>{
    const mine = scopedTasks.filter((task)=>taskBelongsToOwner(task, owner));
    const approved = mine.filter((task)=>task.stage === 'controller_approved').length;
    const avg = mine.length ? Math.round(mine.reduce((sum, task)=>sum + progressOf(task), 0) / mine.length) : 0;
    return { owner, total:mine.length, approved, avg, score:approved * 10 + avg };
  }).filter((row)=>row.total).sort((a,b)=>b.score-a.score);
  return <Card title="Tổng hợp tháng"><div className="table-wrap"><table><thead><tr><th>Hạng</th><th>Nhân sự</th><th>Việc</th><th>KSV xác nhận</th><th>Tiến độ TB</th><th>Điểm</th><th>Xếp loại</th></tr></thead><tbody>{rows.map((row, idx)=><tr key={row.owner.id}><td>{idx+1}</td><td><strong>{row.owner.name}</strong></td><td>{row.total}</td><td>{row.approved}</td><td><Progress value={row.avg} /></td><td><Badge tone="b-green">{row.score}</Badge></td><td>{row.score >= 80 ? <Badge tone="b-amber">Xuất sắc</Badge> : row.score >= 40 ? <Badge tone="b-blue">Tốt</Badge> : <Badge>Đạt</Badge>}</td></tr>)}</tbody></table></div></Card>;
}
function projectRows(tasks, projectCode) {
  return projectCode === 'INDEPENDENT' ? tasks.filter((task)=>!task.projectCode) : tasks.filter((task)=>task.projectCode === projectCode);
}
function ProjectDetail({ project, tasks, setTasks, role, me, currentUser, onBack }){
  const [tab, setTab] = useState('overview');
  const [detail, setDetail] = useState(null);
  const rows = projectRows(tasks, project.code);
  const active = rows.filter((task)=>task.stage !== 'controller_approved');
  const done = rows.filter((task)=>task.stage === 'controller_approved');
  const waiting = rows.filter((task)=>['reported','lead_approved','explain_requested'].includes(task.stage));
  const late = rows.filter((task)=>task.stage !== 'controller_approved' && task.deadline < addDays(0));
  const byGroup = [...new Set(rows.map((task)=>task.group || 'Chưa phân nhóm'))].map((group)=>{
    const groupTasks = rows.filter((task)=>String(task.group || 'Chưa phân nhóm') === group);
    return { group, total:groupTasks.length, progress:groupTasks.length ? Math.round(groupTasks.reduce((sum, task)=>sum + progressOf(task), 0) / groupTasks.length) : 0 };
  });
  const patch = (id, data) => setTasks(tasks.map((task)=>task.id === id ? {...task, ...data} : task));
  const sourceModules = [...new Set(rows.map((task)=>task.sourceModule || 'vplanning'))];
  return <div>
    <Card title="Hồ sơ dự án" action={<button className="btn btn-sm" onClick={onBack}>Quay lại danh sách dự án</button>}>
      <div className="row between"><div><h2 style={{margin:'0 0 4px'}}>{project.code}</h2><div className="muted">{project.customer}</div></div><Badge tone={late.length ? 'b-red' : 'b-green'}>{late.length ? `${late.length} việc cần xử lý` : 'Đang kiểm soát'}</Badge></div>
      <div className="grid grid-4" style={{marginTop:14}}>
        <div className="kpi"><div className="num">{rows.length}</div><div className="lbl">Tổng việc</div></div>
        <div className="kpi"><div className="num">{active.length}</div><div className="lbl">Đang mở</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--purple)'}}>{waiting.length}</div><div className="lbl">Chờ duyệt</div></div>
        <div className="kpi"><div className="num" style={{color:'var(--green)'}}>{done.length}</div><div className="lbl">KSV xác nhận</div></div>
      </div>
      <div className="tabs"><button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Tổng quan</button><button className={tab==='outcomes'?'active':''} onClick={()=>setTab('outcomes')}>Kết quả</button><button className={tab==='tasks'?'active':''} onClick={()=>setTab('tasks')}>Công việc</button><button className={tab==='acceptance'?'active':''} onClick={()=>setTab('acceptance')}>Nghiệm thu</button><button className={tab==='quality'?'active':''} onClick={()=>setTab('quality')}>Chất lượng</button><button className={tab==='links'?'active':''} onClick={()=>setTab('links')}>Liên kết nguồn</button></div>
      {tab==='overview' && <div className="grid grid-2"><div className="soft-box"><strong>Usecase PM/Sales</strong><p className="muted">Mở hồ sơ dự án để xem tiến độ, phát hiện việc trễ/risk, mở từng việc giao nhắc, theo dõi báo cáo và chuẩn bị nghiệm thu.</p></div><div className="soft-box"><strong>Nhóm công việc</strong>{byGroup.map((row)=><div key={row.group} style={{marginTop:8}}><div className="row between"><span>{row.group}</span><span className="muted">{row.total} việc</span></div><Progress value={row.progress} /></div>)}</div></div>}
      {tab==='outcomes' && <OutcomeBoard tasks={rows} onOpen={setDetail} />}
      {tab==='tasks' && <div><h3>Công việc trong dự án</h3><TaskTable rows={rows} onOpen={setDetail} /></div>}
      {tab==='acceptance' && <div><h3>Nghiệm thu theo dự án</h3><table><thead><tr><th>Hạng mục</th><th>Trách nhiệm</th><th>Thời điểm</th><th>Gợi ý task liên quan</th><th>Trạng thái</th></tr></thead><tbody>{ACCEPTANCE_ITEMS.map(([item, who, when], idx)=>{ const linked = rows.find((task)=>normalizeHeader(task.title).includes(normalizeHeader(item).slice(0,8)) || normalizeHeader(task.deliverable || '').includes(normalizeHeader(item).slice(0,8))); return <tr key={item}><td>{item}</td><td>{who}</td><td>{when}</td><td>{linked ? <button className="btn btn-sm" onClick={()=>setDetail(linked)}>Mở việc liên quan</button> : <span className="muted">Chưa gắn việc</span>}</td><td><Badge tone={linked || idx < 3 ? 'b-green' : 'b-gray'}>{linked ? 'Có task theo dõi' : idx < 3 ? 'Có sẵn' : 'Chờ cập nhật'}</Badge></td></tr>; })}</tbody></table></div>}
      {tab==='quality' && <div><h3>Chất lượng công đoạn theo dự án</h3><table><thead><tr><th>Công đoạn</th><th>Việc liên quan</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead><tbody>{QUALITY_STAGES.map((stage, idx)=>{ const stageTasks = rows.filter((task)=>idx < 2 ? ['Khởi động','Nội dung'].includes(task.group) : idx < 5 ? ['Giảng viên','LMS','Hậu cần'].includes(task.group) : ['Nghiệm thu','Vận hành','Công việc tuần 04T6'].includes(task.group)); const avg = stageTasks.length ? Math.round(stageTasks.reduce((sum, task)=>sum + progressOf(task), 0) / stageTasks.length) : 0; return <tr key={stage}><td><strong>s{idx}</strong><div>{stage}</div></td><td>{stageTasks.length ? `${stageTasks.length} việc` : 'Chưa có việc gắn công đoạn'}</td><td><Progress value={avg} /></td><td><Badge tone={avg >= 80 ? 'b-green' : avg >= 30 ? 'b-amber' : 'b-gray'}>{avg >= 80 ? 'Ổn' : avg >= 30 ? 'Đang theo dõi' : 'Cần lập việc'}</Badge></td></tr>; })}</tbody></table></div>}
      {tab==='links' && <div><h3>Liên kết nguồn</h3><table><thead><tr><th>Module nguồn</th><th>Số việc</th><th>Cách dùng</th></tr></thead><tbody>{sourceModules.map((module)=><tr key={module}><td><Badge tone="b-blue">{module}</Badge></td><td>{rows.filter((task)=>String(task.sourceModule || 'vplanning') === module).length}</td><td>{module === 'vplanning' ? 'Việc được quản lý trực tiếp trong V-Work' : 'Tham chiếu nhẹ, không copy dữ liệu module khác'}</td></tr>)}</tbody></table></div>}
    </Card>
    {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}
  </div>;
}
function Projects({ tasks, setTasks, role, me, currentUser }){
  const [selectedProject, setSelectedProject] = useState(null);
  const projects = Object.values(tasks.reduce((acc, task)=>{
    const key = task.projectCode || 'INDEPENDENT';
    if (!acc[key]) acc[key] = { code:key, customer:task.customer || 'PeopleOne', total:0, done:0, late:0, risk:0, groups:new Set() };
    acc[key].total += 1;
    acc[key].done += task.stage === 'controller_approved' ? 1 : 0;
    acc[key].late += task.stage !== 'controller_approved' && task.deadline < addDays(0) ? 1 : 0;
    acc[key].risk += task.risk === 'High' || task.risk === 'Critical' ? 1 : 0;
    acc[key].groups.add(task.group);
    return acc;
  }, {})).map((project)=>({...project, progress:project.total ? Math.round(project.done / project.total * 100) : 0}));
  if (selectedProject) return <ProjectDetail project={selectedProject} tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} onBack={()=>setSelectedProject(null)} />;
  return <Card title="Quản lý dự án đào tạo"><div className="grid grid-3">{projects.map((project)=><button className="template-card" key={project.code} onClick={()=>setSelectedProject(project)}><span className="badge b-blue">{project.code}</span><strong>{project.customer}</strong><span className="muted">{project.total} việc · {project.groups.size} nhóm · {project.risk} việc cần giám sát · {project.late} việc trễ</span><Progress value={project.progress} /></button>)}</div></Card>;
}
function Process2406({ tasks, setTasks, role, me, currentUser }) {
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState('N1');
  const patch = (id, data) => setTasks(tasks.map((task)=>task.id === id ? {...task, ...data} : task));
  const group = PROCESS_GROUPS_2406.find((item)=>item.id === selected) || PROCESS_GROUPS_2406[0];
  const groupTasks = tasks.filter((task)=>processForTask2406(task).code.startsWith(group.id));
  return <div>
    <Card title="Quy trình vận hành - OKR, RACI, WBS, checkpoint" action={<Badge tone="b-blue">5 nhóm quy trình</Badge>}>
      <div className="tabs">{PROCESS_GROUPS_2406.map((item)=><button key={item.id} className={selected===item.id?'active':''} onClick={()=>setSelected(item.id)}>{item.id} · {item.name}</button>)}</div>
      <div className="grid grid-2">
        <div className="soft-box"><strong>{group.id} - {group.name}</strong><p className="muted">Mục tiêu là biến công việc rời rạc thành chuỗi kết quả có người chịu trách nhiệm, checkpoint bắt buộc và tín hiệu quản trị.</p><div className="pill-row">{group.okrs.map((okr)=><Badge key={okr} tone="b-blue">{okr}</Badge>)}</div></div>
        <div className="soft-box"><strong>OKR công ty</strong>{group.okrs.map((okr)=>{ const item = COMPANY_OKRS_2406.find((row)=>row.code === okr); return <p key={okr}><strong>{okr}</strong> · {item?.title}<br/><span className="muted">{item?.desc}</span></p>; })}</div>
      </div>
    </Card>
    <Card title="Các bước chuẩn trong quy trình">
      <div className="grid grid-2">{group.steps.map((step)=><div className="process-step" key={step.code}>
        <div className="row between"><Badge tone="b-blue">{step.code}</Badge><Badge tone="b-purple">RACI</Badge></div>
        <strong>{step.title}</strong>
        <p className="muted">{step.description}</p>
        <div className="grid grid-2">
          <div className="soft-box"><strong>Đầu ra</strong><div className="muted">{step.output}</div></div>
          <div className="soft-box"><strong>Checking point</strong><div className="muted">{step.checkingPoint}</div></div>
        </div>
        <div className="soft-box"><strong>Hard gate</strong><div className="muted">{step.hardGate}</div>{step.riskBlocked && <div className="muted" style={{marginTop:6}}>Rủi ro được chặn: {step.riskBlocked}</div>}</div>
        <div className="checkpoint-list">{step.checkpoints.map((item)=><div className="checkpoint-item" key={item}><span className="checkpoint-dot">•</span><span>{item}</span></div>)}</div>
        <table><tbody>{Object.entries(step.raci).map(([key,value])=><tr key={key}><th>{key}</th><td>{value}</td></tr>)}</tbody></table>
        <p className="muted">Ánh xạ vận hành: {step.operationMapping}</p>
      </div>)}</div>
    </Card>
    <Card title={`Công việc đang nằm trong ${group.id}`}>
      <TaskTable rows={groupTasks} onOpen={setDetail} />
    </Card>
    {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}
  </div>;
}
function ReminderEscalationCenter({ tasks, setTasks, role, me, currentUser }) {
  const [detail, setDetail] = useState(null);
  const rows = getVisibleTasks(tasks, role, me, currentUser)
    .map((task)=>({ task, escalation:escalationLevel(task), gate:enterpriseHardGateDecision(task) }))
    .filter((row)=>row.escalation.score > 0 || row.gate.hardGateBlock)
    .sort((left,right)=>right.escalation.score - left.escalation.score);
  const patch = (id, data) => setTasks(tasks.map((task)=>task.id === id ? {...task, ...data} : task));
  const sendReminder = (task, escalation) => {
    patch(task.id, {
      reminders:[...(task.reminders || []), { kind:escalation.level, message:`${escalation.label}: ${task.title}`, from:currentUser?.name || me, done:false, at:new Date().toISOString() }],
      activity:addTaskEvent(task, currentUser, 'Nhắc việc / escalation', escalation.label),
    });
    notifyVWork(`Đã nhắc việc cho ${task.ownerName || 'người phụ trách'}: "${task.title}".`, escalation.level === 'director' ? 'warning' : 'success');
  };
  return <div>
    <Card title="Reminder & escalation" action={<Badge tone="b-red">{rows.filter((row)=>row.escalation.level === 'director').length} cần giám đốc</Badge>}>
      <p className="muted">Trung tâm này gom các việc mới giao chưa nhận, chờ duyệt, thiếu minh chứng, quá hạn hoặc bị chặn cứng để quản lý nhắc đúng người.</p>
      <TaskTable rows={rows.map((row)=>row.task)} onOpen={setDetail} />
    </Card>
    <Card title="Hàng đợi xử lý nhanh"><table><thead><tr><th>Cấp xử lý</th><th>Công việc</th><th>Hard gate</th><th>Thao tác</th></tr></thead><tbody>{rows.map(({ task, escalation, gate })=><tr key={task.id}><td><Badge tone={escalation.tone}>{escalation.label}</Badge></td><td><strong>{task.title}</strong><div className="muted">{task.ownerName} · {task.deadline}</div></td><td>{gate.hardGateBlock ? gate.blockers.slice(0,2).join(' · ') : 'Không bị chặn'}</td><td><button className="btn btn-sm" onClick={()=>sendReminder(task, escalation)}>Tạo reminder</button></td></tr>)}</tbody></table></Card>
    {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}
  </div>;
}
function MonthlyScorecard({ tasks, role, me, currentUser }) {
  const scopedTasks = getVisibleTasks(tasks, role, me, currentUser);
  const rows = workloadOwners().map((owner)=>scoreComposite(owner, scopedTasks)).filter((row)=>row.total).sort((left,right)=>right.score-left.score);
  return <Card title="Scorecard tháng & xếp hạng kết quả">
    <div className="table-wrap"><table><thead><tr><th>Hạng</th><th>Nhân sự</th><th>Việc</th><th>Hoàn thành</th><th>Đúng hạn</th><th>Điểm kết quả</th><th>Điểm tổng hợp</th><th>Nhận định</th></tr></thead><tbody>{rows.map((row, index)=><tr key={row.owner.id}><td>{index + 1}</td><td><strong>{row.owner.name}</strong></td><td>{row.total}</td><td>{row.completed}</td><td>{row.onTime}</td><td><Progress value={row.resultScore} /></td><td><Badge tone={row.score >= 80 ? 'b-green' : row.score >= 55 ? 'b-blue' : 'b-amber'}>{row.score}</Badge></td><td>{row.urgent ? 'Cần giảm tải/rà soát việc đỏ' : row.review ? 'Cần đẩy nhanh duyệt' : 'Đang ổn định'}</td></tr>)}</tbody></table></div>
  </Card>;
}
function ProcessTemplateAdmin({ tasks }) {
  const rows = PROCESS_GROUPS_2406.flatMap((group)=>group.steps.map((step)=>({ group, step, used:tasks.filter((task)=>processForTask2406(task).code === step.code).length })));
  return <Card title="Quản trị template quy trình">
    <p className="muted">Template này là chuẩn vận hành doanh nghiệp để mapping công việc sang kết quả, OKR, RACI, WBS, checkpoint, hard gate và escalation. Mỗi bước phải nói rõ đầu ra cần đạt, điểm kiểm soát và rủi ro được chặn.</p>
    <div className="template-admin-list">{rows.map(({ group, step, used })=><div className="template-admin-item" key={step.code}>
      <div className="row between"><div><Badge tone="b-blue">{step.code}</Badge> <strong>{step.title}</strong><div className="muted">{group.name}</div></div><Badge tone={used ? 'b-green' : 'b-gray'}>{used} việc</Badge></div>
      <p>{step.description}</p>
      <div className="grid grid-2">
        <div className="soft-box"><strong>Đầu ra</strong><div className="muted">{step.output}</div></div>
        <div className="soft-box"><strong>Checking point</strong><div className="muted">{step.checkingPoint}</div></div>
      </div>
      <div className="grid grid-2">
        <div><strong>Hard gate</strong><p className="muted">{step.hardGate}</p><strong>Rủi ro chặn</strong><p className="muted">{step.riskBlocked}</p></div>
        <div><strong>RACI</strong><table><tbody>{Object.entries(step.raci).map(([key,value])=><tr key={key}><th>{key}</th><td>{value}</td></tr>)}</tbody></table></div>
      </div>
      <div className="checkpoint-list">{step.checkpoints.map((item)=><div className="checkpoint-item" key={item}><span className="checkpoint-dot">•</span><span>{item}</span></div>)}</div>
      <p className="muted">Ánh xạ vận hành: {step.operationMapping}</p>
    </div>)}</div>
  </Card>;
}
function GovernanceCrudPanel({ tasks }) {
  const projectCodes = [...new Set(tasks.map((task)=>task.projectCode || 'INDEPENDENT'))];
  const tables = [
    { name:'Project', count:projectCodes.length, source:'vplanning_projects', next:'Tạo/sửa hồ sơ dự án, khách hàng, số lớp, số học viên, trạng thái.' },
    { name:'User & role', count:MASTER.users.length, source:'vplanning_users', next:'Quản trị nhiều role, phòng ban, ownerIds, phạm vi nhìn dữ liệu.' },
    { name:'Org unit', count:MASTER.orgUnits.length, source:'vplanning_org_units', next:'Quản trị khối Sales, Nội dung, Kế toán, Hậu cần, QC.' },
    { name:'Job catalog', count:MASTER.jobs.length, source:'vplanning_job_system', next:'Quản trị job code, checklist chuẩn, OKR và owner mặc định.' },
    { name:'Acceptance / Quality', count:ACCEPTANCE_ITEMS.length + QUALITY_STAGES.length, source:'vplanning_acceptance_items + vplanning_stage_quality', next:'Gắn checklist nghiệm thu/chất lượng theo từng dự án.' },
  ];
  return <Card title="CRUD-ready governance data">
    <p className="muted">Khu vực này cho admin kiểm soát dữ liệu nền tảng. API và migration đã chuẩn bị để chuyển các phần này từ seed sang dữ liệu thật mà không ảnh hưởng module khác.</p>
    <table><thead><tr><th>Dữ liệu</th><th>Số bản ghi</th><th>Bảng lưu</th><th>Bước vận hành</th></tr></thead><tbody>{tables.map((row)=><tr key={row.name}><td><strong>{row.name}</strong></td><td>{row.count}</td><td><code>{row.source}</code></td><td>{row.next}</td></tr>)}</tbody></table>
  </Card>;
}
function EnterpriseCommandCenter({ tasks, setTasks, role, me, currentUser }) {
  const visible = getVisibleTasks(tasks, role, me, currentUser);
  const directorRows = visible.filter((task)=>escalationLevel(task).level === 'director');
  const reviewRows = visible.filter((task)=>escalationLevel(task).level === 'manager');
  const gateRows = visible.filter((task)=>enterpriseHardGateDecision(task).hardGateBlock);
  return <div>
    <div className="grid grid-4">
      <div className="kpi"><div className="num">{visible.length}</div><div className="lbl">Việc trong phạm vi</div></div>
      <div className="kpi"><div className="num" style={{color:'var(--red)'}}>{directorRows.length}</div><div className="lbl">Cần chỉ đạo</div></div>
      <div className="kpi"><div className="num" style={{color:'var(--amber)'}}>{reviewRows.length}</div><div className="lbl">Cần duyệt</div></div>
      <div className="kpi"><div className="num" style={{color:'var(--purple)'}}>{gateRows.length}</div><div className="lbl">Bị hard gate</div></div>
    </div>
    <ReminderEscalationCenter tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />
    <MonthlyScorecard tasks={tasks} role={role} me={me} currentUser={currentUser} />
    <ProcessTemplateAdmin tasks={visible} />
    <GovernanceCrudPanel tasks={tasks} />
  </div>;
}
const VWORK_EVAL_CRITERIA = [
  { id:'scope', label:'Đúng phạm vi' },
  { id:'quality', label:'Đạt chất lượng' },
  { id:'timing', label:'Đúng hạn' },
  { id:'evidence', label:'Có minh chứng' },
];
function vworkGrade(criteria = {}) {
  const values = VWORK_EVAL_CRITERIA.map((item)=>criteria[item.id]).filter(Boolean);
  const failed = values.filter((value)=>value === 'fail').length;
  const slow = values.filter((value)=>value === 'slow').length;
  if (values.length < VWORK_EVAL_CRITERIA.length) return '';
  if (!failed && !slow) return 'A';
  if (!failed && slow <= 2) return 'B';
  return 'C';
}
function vworkGradeLabel(grade) {
  return grade === 'A' ? 'Xuất sắc' : grade === 'B' ? 'Hoàn thành tốt' : grade === 'C' ? 'Cần cải thiện' : 'Chưa xếp loại';
}
function isVWorkEvaluationCandidate(task) {
  return isTaskDone(task) || ['reported','lead_approved'].includes(task.stage);
}
function isVWorkEvaluationPassed(task) {
  const evaluation = task?.vworkEvaluation || {};
  return evaluation.bossApproved === true && ['A','B'].includes(evaluation.grade);
}
function vworkTaskBucket(task) {
  if (isTaskDone(task)) return 'done';
  if (['reported','lead_approved'].includes(task.stage)) return 'review';
  if (['acknowledged','in_progress','explain_requested'].includes(task.stage)) return 'doing';
  return 'todo';
}
function vworkSearchMatch(task, query) {
  if (!query) return true;
  const haystack = normalizeLegacyText([
    task.title,
    task.ownerName,
    task.projectCode,
    task.jobCode,
    task.group,
    task.department,
    task.sourceId,
  ].filter(Boolean).join(' ')).toLowerCase();
  return haystack.includes(normalizeLegacyText(query).toLowerCase());
}
function vworkDueTone(task) {
  if (isTaskDone(task)) return 'ok';
  if (isTaskOverdue(task)) return 'overdue';
  const due = task.deadline ? new Date(`${task.deadline}T00:00:00`) : null;
  if (!due || Number.isNaN(due.getTime())) return 'none';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const days = Math.ceil((due.getTime() - now.getTime()) / 86400000);
  if (days <= 2) return 'soon';
  return 'ok';
}
function VWorkDesktopDetail({ task, currentUser, me, onPatch, onOpen, onAccept, onReport, onRemind }) {
  if (!task) return <aside className="vwork-detail-panel vwork-detail-empty"><div className="vwork-detail-big">VW</div><strong>Chọn một việc</strong><p className="muted">Xem chi tiết, checklist, tiến độ và lịch sử cập nhật ngay bên cạnh bảng.</p></aside>;
  const signal = managementSignal(task);
  const done = (task.checklist || []).filter((item)=>item.done).length;
  const total = (task.checklist || []).length;
  const canEditChecklist = true;
  const toggleChecklist = (index) => {
    const checklist = (task.checklist || []).map((item, itemIndex)=>itemIndex === index ? {...item, done:!item.done} : item);
    onPatch(task.id, {
      checklist,
      complete: checklist.length ? Math.round(checklist.filter((item)=>item.done).length / checklist.length * 100) : task.complete,
      activity:addTaskEvent(task, currentUser, 'Cập nhật checklist', checklist[index]?.label || checklist[index]?.text || 'Checklist'),
    });
    notifyVWork(vworkActionToast('Cập nhật checklist', {}, '', task));
  };
  const updateChecklistLabel = (index, label) => {
    const nextLabel = String(label || '').trimStart();
    const checklist = (task.checklist || []).map((item, itemIndex)=>itemIndex === index ? {...item, label:nextLabel, text:nextLabel} : item);
    onPatch(task.id, {
      checklist,
      activity:addTaskEvent(task, currentUser, 'Sửa checklist', nextLabel || 'Checklist'),
    });
  };
  const addChecklistLabel = () => {
    const label = window.prompt('Thêm checkpoint / việc cần làm');
    const nextLabel = String(label || '').trim();
    if (!nextLabel) return;
    onPatch(task.id, {
      checklist:[...(task.checklist || []), ck(nextLabel)],
      activity:addTaskEvent(task, currentUser, 'Thêm checklist', nextLabel),
    });
    notifyVWork(vworkActionToast('Thêm checklist', {}, nextLabel, task));
  };
  const removeChecklistLabel = (index) => {
    const item = task.checklist?.[index];
    if (!item) return;
    onPatch(task.id, {
      checklist:(task.checklist || []).filter((_, itemIndex)=>itemIndex !== index),
      activity:addTaskEvent(task, currentUser, 'Xoá checklist', item.label || item.text || 'Checklist'),
    });
    notifyVWork(vworkActionToast('Xoá checklist', {}, item.label || item.text || 'Checklist', task));
  };
  return <aside className="vwork-detail-panel">
    <div className="vwork-detail-head">
      <Badge tone={signal.tone}>{signal.label}</Badge>
      <h3>{task.title}</h3>
      <p className="muted">{task.projectCode || 'Việc chung'} · {task.group || task.department || 'V-Work'}</p>
    </div>
    <div className="vwork-detail-body">
      <div className="vwork-detail-grid">
        <div><span>Người phụ trách</span><strong>{task.ownerName || 'Chưa có owner'}</strong></div>
        <div><span>Hạn</span><strong>{task.deadline || 'Chưa đặt'}</strong></div>
        <div><span>Trạng thái</span><strong>{TASK_STATUS_LABELS[getTaskStatus(task)] || getTaskStatus(task)}</strong></div>
        <div><span>Checklist</span><strong>{done}/{total || 0}</strong></div>
      </div>
      <div className="vwork-detail-section">
        <div className="vwork-section-title">Tiến độ</div>
        <Progress value={progressOf(task)} />
      </div>
      <div className="vwork-detail-section">
        <div className="row between"><div className="vwork-section-title">Checklist</div><button className="btn btn-sm" type="button" onClick={addChecklistLabel}>Thêm checkpoint</button></div>
        <div className="vwork-check-list">{(task.checklist || []).map((item, index)=><div key={`${item.label || item.text}-${index}`} className={`vwork-check-item ${item.done ? 'done' : ''}`}>
          <button type="button" className="vwork-check-toggle" onClick={()=>canEditChecklist && toggleChecklist(index)}>{item.done ? '✓' : ''}</button><input value={item.label || item.text || ''} onChange={(event)=>updateChecklistLabel(index, event.target.value)} placeholder="Nhập checkpoint..." /><button className="vwork-check-remove" type="button" onClick={()=>removeChecklistLabel(index)}>×</button>
        </div>)}{!task.checklist?.length && <p className="muted">Chưa có checklist.</p>}</div>
      </div>
      <div className="vwork-detail-section">
        <div className="vwork-section-title">Dòng trao đổi</div>
        <div className="vwork-thread">{(task.activity || []).slice(-5).reverse().map((item, index)=><div className="vwork-thread-item" key={`${item.at}-${index}`}><strong>{item.action}</strong><p>{item.note || 'Đã cập nhật công việc.'}</p><small>{item.by || 'V-Work'} · {item.at ? new Date(item.at).toLocaleString('vi-VN') : ''}</small></div>)}{!task.activity?.length && <p className="muted">Chưa có cập nhật.</p>}</div>
      </div>
      <div className="vwork-detail-actions">
        {vworkTaskBucket(task) === 'todo' && <button className="btn btn-primary" type="button" onClick={()=>onAccept(task)}>Tiếp nhận</button>}
        {vworkTaskBucket(task) === 'doing' && <button className="btn btn-primary" type="button" onClick={()=>onReport(task)}>Báo cáo xong</button>}
        <button className="btn" type="button" onClick={()=>onRemind(task)}>Nhắc việc</button>
        <button className="btn" type="button" onClick={()=>onOpen(task)}>Mở đầy đủ</button>
      </div>
    </div>
  </aside>;
}
function VWorkDesktopRow({ task, selected, action, onSelect }) {
  const signal = managementSignal(task);
  const status = getTaskStatus(task);
  const dueTone = vworkDueTone(task);
  const done = (task.checklist || []).filter((item)=>item.done).length;
  const total = (task.checklist || []).length;
  return <tr className={`${selected ? 'selected' : ''} ${signal.level === 'danger' ? 'danger' : ''}`} onClick={()=>onSelect(task)}>
    <td><div className="vwork-task-title">{task.title}</div><div className="vwork-task-sub">{task.projectCode || 'Việc chung'} · {task.ownerName || 'Chưa có owner'}</div></td>
    <td><Badge tone={TASK_STATUS_TONE[status] || signal.tone}>{TASK_STATUS_LABELS[status] || status}</Badge></td>
    <td><div className="vwork-progress-cell"><Progress value={progressOf(task)} /></div></td>
    <td><span className={`vwork-due ${dueTone}`}>{task.deadline || 'Chưa đặt'}</span></td>
    <td><span className="vwork-check-count">{done}/{total || 0}</span></td>
    <td onClick={(event)=>event.stopPropagation()}><div className="vwork-row-actions">{action}</div></td>
  </tr>;
}
function VWorkTaskCard({ task, onOpen, action, openLabel='Mở chi tiết' }) {
  const signal = managementSignal(task);
  const done = (task.checklist || []).filter((item)=>item.done).length;
  const total = (task.checklist || []).length;
  return <div className="vwork-v2-card">
    <div className="row between">
      <div><strong>{task.title}</strong><div className="muted vwork-card-meta">{task.ownerName || 'Chưa có owner'} · Hạn {task.deadline || 'chưa đặt'} · {task.projectCode || 'Việc chung'}</div></div>
      <Badge tone={signal.tone}>{signal.label}</Badge>
    </div>
    <Progress value={progressOf(task)} />
    <div className="row between">
      <span className="muted">{done}/{total || 0} checklist · {TASK_STATUS_LABELS[getTaskStatus(task)] || getTaskStatus(task)}</span>
      <div className="row">{action}<button className="btn btn-sm" type="button" onClick={()=>onOpen(task)}>{openLabel}</button></div>
    </div>
  </div>;
}
function VWorkHome({ tasks, setTasks, role, me, currentUser, setPage }) {
  const [expandedOwnerId, setExpandedOwnerId] = useState('');
  const [detailTask, setDetailTask] = useState(null);
  const directoryTasks = tasks.filter((task)=>!isVWorkAdminRequest(task) && !isVWorkProposalRequestTask(task) && !isOutsideVWorkWorkforce(task));
  const scoped = directoryTasks;
  const active = scoped.filter((task)=>!isTaskDone(task));
  const flagged = active.filter((task)=>managementSignal(task).level !== 'ok' || escalationLevel(task).score > 0);
  const overdue = active.filter((task)=>isTaskOverdue(task));
  const reviewRows = scoped.filter((task)=>['reported','lead_approved','explain_requested'].includes(task.stage));
  const evalRows = scoped.filter((task)=>isVWorkEvaluationCandidate(task) && !isVWorkEvaluationPassed(task));
  const owners = workloadOwnersForTasks(directoryTasks)
    .map((owner)=>({ ...owner, primaryTasks:directoryTasks.filter((task)=>taskPrimaryOwnedBy(task, owner)) }))
    .sort((left, right)=>{
      const leftIsDirector = (left.roles || []).includes('vplanning_director');
      const rightIsDirector = (right.roles || []).includes('vplanning_director');
      if (leftIsDirector !== rightIsDirector) return leftIsDirector ? -1 : 1;
      const currentName = normalizeText(currentUser?.name || me || '');
      const leftIsCurrent = normalizeText(left.name) === currentName;
      const rightIsCurrent = normalizeText(right.name) === currentName;
      if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;
      return left.name.localeCompare(right.name, 'vi');
    });
  const displayName = String(currentUser?.name || me || 'bạn').trim() || 'bạn';
  const patchDetailTask = (id, data) => setTasks((previous)=>previous.map((task)=>task.id === id ? {...task, ...data} : task));
  const deleteDetailTask = (id) => {
    setTasks((previous)=>previous.filter((task)=>task.id !== id));
    setDetailTask(null);
  };
  return <div className="vwork-home">
    {detailTask ? <TaskDetail task={tasks.find((task)=>task.id === detailTask.id) || detailTask} role={role} me={me} currentUser={currentUser} onClose={()=>setDetailTask(null)} onPatch={patchDetailTask} onDelete={detailTask.readOnly ? undefined : deleteDetailTask} readOnly={Boolean(detailTask.readOnly)} /> : null}
    <div className="vwork-page-head">
      <div><h2>Xin chào, {displayName}</h2><p>Bức tranh tổng thể công việc hôm nay, {new Date().toLocaleDateString('vi-VN')}.</p></div>
    </div>
    <div className="vwork-stat-grid">
      <div className="vwork-stat blue"><span>Đang thực hiện</span><strong>{active.length}</strong><small>việc đang chạy</small></div>
      <div className="vwork-stat red"><span>Có cờ rủi ro</span><strong>{flagged.length}</strong><small>{overdue.length} việc quá hạn</small></div>
      <div className="vwork-stat amber"><span>Đề xuất chờ duyệt</span><strong>{reviewRows.length}</strong><small>cần quyết định</small></div>
      <div className="vwork-stat green"><span>Đánh giá / cải thiện</span><strong>{evalRows.length}</strong><small>việc cần xử lý</small></div>
    </div>
    <div className="vwork-split wide">
      <div>
        <div className="vwork-section-heading"><div className="vwork-section-title">Công việc theo người</div><Badge tone="b-blue">{directoryTasks.length} việc toàn hệ thống</Badge></div>
        <div className="vwork-table-wrap"><table className="vwork-table"><thead><tr><th>Nhân sự</th><th>Cần làm</th><th>Đang làm</th><th>Xong</th><th>Cờ</th></tr></thead><tbody>
          {owners.map((owner)=>{
            const ownerTasks = owner.primaryTasks;
            const todo = ownerTasks.filter((task)=>vworkTaskBucket(task)==='todo').length;
            const doing = ownerTasks.filter((task)=>vworkTaskBucket(task)==='doing').length;
            const done = ownerTasks.filter((task)=>vworkTaskBucket(task)==='done').length;
            const flags = ownerTasks.filter((task)=>managementSignal(task).level !== 'ok').length;
            const expanded = expandedOwnerId === owner.id;
            return <Fragment key={owner.id}>
              <tr className="vwork-owner-row" onClick={()=>setExpandedOwnerId(expanded ? '' : owner.id)} aria-expanded={expanded}>
                <td><span className="chevron">{expanded ? '▼' : '▶'}</span><strong>{owner.name}</strong></td><td><Badge tone="b-amber">{todo}</Badge></td><td><Badge tone="b-blue">{doing}</Badge></td><td><Badge tone="b-green">{done}</Badge></td><td>{flags ? <Badge tone="b-red">{flags}</Badge> : <span className="muted">0</span>}</td>
              </tr>
              {expanded ? <tr className="vwork-owner-detail-row"><td colSpan={5}>
                <div className="vwork-owner-task-list">
                  {sortTasksForDisplay(ownerTasks).map((task)=>{
                    const canEdit = currentUserCanWorkOnTask(task, currentUser, me);
                    return <div className="vwork-owner-task" key={task.id}>
                      <div>
                        <strong>{task.title}</strong>
                        <span>{task.projectCode || 'Việc chung'} · {task.ownerName || 'Chưa có owner'} · Hạn {task.deadline || 'chưa đặt'}</span>
                      </div>
                      <div className="vwork-owner-task-meta">
                        <Badge tone={TASK_STATUS_TONE[getTaskStatus(task)] || managementSignal(task).tone}>{TASK_STATUS_LABELS[getTaskStatus(task)] || getTaskStatus(task)}</Badge>
                        <button className="btn btn-sm" type="button" onClick={(event)=>{ event.stopPropagation(); setDetailTask({ ...task, readOnly:!canEdit }); }}>{canEdit ? 'Mở chi tiết' : 'Mở xem'}</button>
                      </div>
                    </div>;
                  })}
                  {!ownerTasks.length ? <div className="empty-panel">Chưa có việc trong phạm vi đang xem.</div> : null}
                </div>
              </td></tr> : null}
            </Fragment>;
          })}
        </tbody></table></div>
      </div>
      <aside className="vwork-detail-panel vwork-risk-panel">
        <div className="vwork-detail-head"><h3>Việc cần chú ý</h3></div>
        <div className="vwork-detail-body vwork-v2-list">
          {flagged.slice(0, 8).map((task)=><button type="button" className="vwork-request-card" key={task.id} onClick={()=>setPage('monitor')}><strong>{task.title}</strong><span className="vwork-card-meta">{task.ownerName || 'Chưa có owner'} · {managementSignal(task).label}</span></button>)}
          {!flagged.length && <div className="empty-panel">Không có việc rủi ro.</div>}
        </div>
      </aside>
    </div>
  </div>;
}
function VWorkBox({ tasks, setTasks, role, me, currentUser, searchQuery = '', activeTab, onTabChange }) {
  const [localTab, setLocalTab] = useState('todo');
  const [detail, setDetail] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const tab = activeTab || localTab;
  const setTab = (nextTab) => {
    if (onTabChange) onTabChange(nextTab);
    else setLocalTab(nextTab);
    setSelectedIds([]);
  };
  const scoped = getOwnTasks(tasks, me, currentUser);
  const rows = sortTasksForDisplay(scoped.filter((task)=>vworkTaskBucket(task) === tab).filter((task)=>vworkSearchMatch(task, searchQuery)));
  const patch = (id, data) => setTasks((previous)=>previous.map((task)=>String(task.id) === String(id) ? {...task, ...data} : task));
  const mayDeleteTask = (task) => isDirectorUser(currentUser, role)
    || can(role, 'manage_tasks')
    || can(role, 'create_plan')
    || currentUserMatchesTaskIdentity(currentUser, task.createdById || task.createdByEmail, task.createdByName);
  const deletableRows = rows.filter(mayDeleteTask);
  const allSelected = Boolean(deletableRows.length) && deletableRows.every((task)=>selectedIds.includes(String(task.id)));
  const toggleSelected = (taskId) => setSelectedIds((current)=>current.includes(String(taskId)) ? current.filter((id)=>id !== String(taskId)) : [...current, String(taskId)]);
  const toggleAll = () => setSelectedIds(allSelected ? [] : deletableRows.map((task)=>String(task.id)));
  const removeSelected = () => {
    const selectedTasks = tasks.filter((task)=>selectedIds.includes(String(task.id)) && mayDeleteTask(task));
    if (!selectedTasks.length) return;
    const ok = window.confirm(`Xoá ${selectedTasks.length} công việc khỏi dữ liệu thật? Hệ thống sẽ ghi nhận mã xoá để các công việc này không quay lại khi đồng bộ.`);
    if (!ok) return;
    const selectedSet = new Set(selectedTasks.map((task)=>String(task.id)));
    setTasks((previous)=>previous.filter((task)=>!selectedSet.has(String(task.id))));
    setSelectedIds([]);
    setDetail(null);
    notifyVWork(`Đã xoá ${selectedTasks.length} công việc khỏi dữ liệu thật.`, 'warning');
  };
  const createLinkedProposal = (request) => {
    setTasks((previous)=>{
      const baseId = Math.max(0, ...previous.map((task)=>Number(task.id) || 0)) + 1;
      const updatedTasks = previous.map((task)=>String(task.id) === String(request.targetTaskId) ? { ...task, activity:addTaskEvent(task, currentUser, 'Tạo đề xuất trong công việc', `${request.title} → ${request.recipientName}`) } : task);
      return [createVWorkProposalRequestTask(request, baseId, currentUser), ...updatedTasks];
    });
    notifyVWork(`Đã tạo đề xuất “${request.title}” trong công việc.`);
  };
  const updateLinkedProposal = (proposalId, updater, action) => {
    setTasks((previous)=>previous.map((item)=>{
      if (!isVWorkProposalRequestTask(item) || String(item.sourceId) !== String(proposalId)) return item;
      const nextProposal = updater(proposalRequestTaskToRequest(item));
      return { ...item, title:nextProposal.title || item.title, workProposal:nextProposal, activity:addTaskEvent(item, currentUser, action, nextProposal.title || item.title) };
    }));
  };
  const tabs = [
    ['todo','Tiếp nhận', scoped.filter((task)=>vworkTaskBucket(task)==='todo').length],
    ['doing','Đang thực hiện', scoped.filter((task)=>vworkTaskBucket(task)==='doing').length],
    ['review','Chờ duyệt', scoped.filter((task)=>vworkTaskBucket(task)==='review').length],
    ['done','Hoàn thành', scoped.filter((task)=>vworkTaskBucket(task)==='done').length],
  ];
  const tabPresentation = {
    todo:{ icon:ClipboardCheck, tone:'blue', note:'Cần xác nhận hoặc phản hồi' },
    doing:{ icon:BarChart3, tone:'amber', note:'Đang cập nhật tiến độ' },
    review:{ icon:ShieldAlert, tone:'purple', note:'Đã gửi người duyệt' },
    done:{ icon:CheckSquare, tone:'green', note:'Đã chốt hoàn thành' },
  };
  const workboxAttention = scoped.filter((task)=>!isTaskDone(task)).map(briefingAttentionForTask).filter((row)=>row.reasons.length).sort((left,right)=>right.score - left.score || (left.daysUntil ?? 9999) - (right.daysUntil ?? 9999));
  const attentionLead = workboxAttention[0] || null;
  const workboxNow = new Date();
  const rowStatus = (task) => task.stage === 'assignment_returned' ? 'Đã phản hồi' : (TASK_STATUS_LABELS[getTaskStatus(task)] || getTaskStatus(task));
  return <div className="vwork-workbox-clean">
    <section className="vwork-workbox-hero"><div><span className="vwork-brief-eyebrow"><Users size={15}/> V-Work · Công việc cá nhân</span><h1>Điều hành công việc của {currentUser?.name || me}</h1><p>Tập trung vào việc cần tiếp nhận, mốc đang thực hiện và kết quả đang chờ duyệt từ dữ liệu thật của hệ thống.</p><div className="vwork-workbox-meta"><div><span>Cập nhật</span><strong>{workboxNow.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'})} · {workboxNow.toLocaleDateString('vi-VN')}</strong></div><div><span>Tổng việc</span><strong>{scoped.length} công việc</strong></div><div><span>Cần chú ý</span><strong>{workboxAttention.length} công việc</strong></div></div></div></section>
    <div className="vwork-workbox-state-grid">{tabs.map(([key,label,count])=>{ const presentation=tabPresentation[key]; const StateIcon=presentation.icon; return <button type="button" key={key} className={`${tab===key?'active':''} ${presentation.tone}`} onClick={()=>setTab(key)}><span><StateIcon size={18}/></span><strong>{count}</strong><b>{label}</b><small>{presentation.note}</small></button>; })}</div>
    {attentionLead && <section className="vwork-workbox-priority"><span><AlertTriangle size={19}/></span><div><small>Việc cần xử lý trước</small><strong>{attentionLead.task.title}</strong><p>{attentionLead.reasons.slice(0,3).join(' · ')}</p></div><button className="btn" type="button" onClick={()=>setDetail(attentionLead.task)}>Xem chi tiết</button></section>}
    {selectedIds.length > 0 && <div className="vwork-bulk-toolbar"><strong>Đã chọn {selectedIds.length} việc</strong><span>Chỉ các việc bạn có quyền quản lý mới được xoá.</span><button className="btn btn-danger" type="button" onClick={removeSelected}><Trash2 size={16}/>Xoá dữ liệu thật</button></div>}
    <section className="vwork-workbox-agenda"><header><div><span>Danh sách thực hiện</span><h2>{tabs.find(([key])=>key===tab)?.[1] || 'Công việc'}</h2><p>{rows.length} việc trong nhóm đang xem{searchQuery ? ` · lọc theo “${searchQuery}”` : ''}</p></div><div className="vwork-brief-filters">{tabs.map(([key,label,count])=><button type="button" key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}<b>{count}</b></button>)}</div></header><div className="vwork-table-wrap vwork-workbox-table"><table className="vwork-table"><thead><tr><th className="vwork-select-col"><input type="checkbox" aria-label="Chọn tất cả công việc trong danh sách đang lọc" checked={allSelected} disabled={!deletableRows.length} onChange={toggleAll}/></th><th>Công việc</th><th>Hạn</th><th>Trạng thái</th><th></th></tr></thead><tbody>{rows.map((task)=>{ const dueTone=vworkDueTone(task); const canDelete=mayDeleteTask(task); return <tr key={task.id} onClick={()=>setDetail(task)}><td className="vwork-select-col" onClick={(event)=>event.stopPropagation()}><input type="checkbox" aria-label={`Chọn ${task.title}`} checked={selectedIds.includes(String(task.id))} disabled={!canDelete} onChange={()=>toggleSelected(task.id)}/></td><td><div className="vwork-task-title">{task.title}</div><div className="vwork-task-sub">{task.projectCode || 'Việc chung'} · {task.ownerName || 'Chưa có người phụ trách'}</div></td><td><span className={`vwork-due ${dueTone}`}>{task.deadline || 'Chưa đặt'}</span></td><td><Badge tone={TASK_STATUS_TONE[getTaskStatus(task)] || 'b-gray'}>{rowStatus(task)}</Badge></td><td onClick={(event)=>event.stopPropagation()}><button className="btn btn-sm" type="button" onClick={()=>setDetail(task)}>Chi tiết</button></td></tr>})}{!rows.length && <tr><td colSpan={5}><div className="empty-panel">Không có việc trong nhóm này.</div></td></tr>}</tbody></table></div></section>
    <div className="vwork-mobile-shell vwork-workbox-mobile"><div className="vwork-mobile-topnav">{tabs.map(([key,label,count])=><button type="button" key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}<b>{count}</b></button>)}</div><div className="vwork-v2-list">{rows.map((task)=><article className="vwork-v2-card" key={task.id} onClick={()=>setDetail(task)}><div className="row between"><label onClick={(event)=>event.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(String(task.id))} disabled={!mayDeleteTask(task)} onChange={()=>toggleSelected(task.id)}/></label><Badge tone={TASK_STATUS_TONE[getTaskStatus(task)] || 'b-gray'}>{rowStatus(task)}</Badge></div><strong>{task.title}</strong><span className="muted">Hạn {task.deadline || 'chưa đặt'} · {task.projectCode || 'Việc chung'}</span><button className="btn btn-sm" type="button" onClick={(event)=>{ event.stopPropagation(); setDetail(task); }}>Chi tiết</button></article>)}{!rows.length && <div className="empty-panel">Không có việc trong nhóm này.</div>}</div></div>
    {detail && <TaskDetail task={tasks.find((task)=>String(task.id)===String(detail.id)) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onAccepted={()=>{ setTab('doing'); setDetail(null); }} onPatch={patch} linkedProposalTasks={tasks.filter((item)=>isVWorkProposalRequestTask(item) && String(item.workProposal?.targetTaskId || '') === String(detail.id))} onCreateLinkedProposal={createLinkedProposal} onUpdateLinkedProposal={updateLinkedProposal} />}
  </div>;
}

function VWorkBoxLegacy({ tasks, setTasks, role, me, currentUser, searchQuery = '', activeTab, onTabChange }) {
  const [localTab, setLocalTab] = useState('todo');
  const [detail, setDetail] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const tab = activeTab || localTab;
  const setTab = (nextTab) => {
    if (onTabChange) onTabChange(nextTab);
    else setLocalTab(nextTab);
  };
  const scoped = getOwnTasks(tasks, me, currentUser);
  const rows = sortTasksForDisplay(scoped
    .filter((task)=>tab === 'all' || vworkTaskBucket(task) === tab)
    .filter((task)=>vworkSearchMatch(task, searchQuery)));
  const selectedTask = tasks.find((task)=>String(task.id) === String(selectedId)) || rows[0] || null;
  const patch = (id, data) => setTasks((previous)=>previous.map((task)=>task.id === id ? {...task, ...data} : task));
  const transition = (task, stage, label) => {
    patch(task.id, {
      stage,
      status: stage === 'controller_approved' ? 'completed' : task.status,
      activity:addTaskEvent(task, currentUser, label, label),
    });
    notifyVWork(vworkActionToast(label, { stage }, label, task));
  };
  const remind = (task) => {
    const count = Number(task.remindCount || 0) + 1;
    patch(task.id, {
      remindCount:count,
      reminders:[...(task.reminders || []), { kind:'manager', message:`Nhắc việc lần ${count}`, from:currentUser?.name || me, done:false, at:new Date().toISOString() }],
      activity:addTaskEvent(task, currentUser, 'Nhắc việc', `Nhắc việc lần ${count}`),
    });
    notifyVWork(`Đã nhắc việc cho ${task.ownerName || 'người phụ trách'}: "${task.title}".`);
  };
  const actionForTask = (task) => {
    const bucket = vworkTaskBucket(task);
    if (bucket === 'todo') return <button className="btn btn-primary btn-sm vwork-action-icon" type="button" title="Tiếp nhận" onClick={()=>transition(task, 'acknowledged', 'Tiếp nhận việc')}>Tiếp nhận</button>;
    if (bucket === 'doing') return <button className="btn btn-primary btn-sm vwork-action-icon" type="button" title="Báo cáo xong" onClick={()=>transition(task, 'reported', 'Báo cáo hoàn thành')}>Báo cáo xong</button>;
    return <Badge tone="b-green">Chờ đánh giá</Badge>;
  };
  const tabs = [
    ['todo','Tiếp nhận', scoped.filter((task)=>vworkTaskBucket(task)==='todo').length],
    ['doing','Đang làm', scoped.filter((task)=>vworkTaskBucket(task)==='doing').length],
    ['done','Hoàn thành', scoped.filter((task)=>vworkTaskBucket(task)==='done').length],
    ['all','Tất cả', scoped.length],
  ];
  const counts = statusCounts(scoped);
  return <div>
    <div className="vwork-desktop-shell">
      <div className="vwork-page-head">
        <div><h2>Work-box</h2><p>Bảng công việc cá nhân để tiếp nhận, báo cáo, nhắc việc và cập nhật checklist.</p></div>
        <Badge tone="b-blue">{scoped.length} việc của tôi</Badge>
      </div>
      <div className="vwork-stat-grid">
        <div className="vwork-stat blue"><span>Đang xử lý</span><strong>{(counts.in_progress || 0) + (counts.acknowledged || 0)}</strong><small>việc đang chạy</small></div>
        <div className="vwork-stat red"><span>Quá hạn</span><strong>{counts.overdue}</strong><small>cần xử lý</small></div>
        <div className="vwork-stat amber"><span>Chờ duyệt</span><strong>{counts.pending}</strong><small>cần quyết định</small></div>
        <div className="vwork-stat green"><span>Hoàn thành</span><strong>{counts.completed}</strong><small>đã xong</small></div>
      </div>
      <div className="vwork-toolbar"><div className="vwork-seg-tabs">{tabs.map(([key,label,count])=><button type="button" key={key} className={tab===key?'active':''} onClick={()=>{ setTab(key); setSelectedId(null); }}>{label}<span>{count}</span></button>)}</div>{searchQuery && <Badge tone="b-gray">Đang lọc: {searchQuery}</Badge>}</div>
      <div className="vwork-split">
        <div className="vwork-table-wrap"><table className="vwork-table"><thead><tr><th>Công việc</th><th>Trạng thái</th><th>Tiến độ</th><th>Hạn</th><th>Checklist</th><th></th></tr></thead><tbody>
          {rows.map((task)=><VWorkDesktopRow key={task.id} task={task} selected={String(selectedTask?.id) === String(task.id)} action={actionForTask(task)} onSelect={(item)=>setSelectedId(item.id)} />)}
          {!rows.length && <tr><td colSpan={6}><div className="empty-panel">Không có việc khớp bộ lọc.</div></td></tr>}
        </tbody></table></div>
        <VWorkDesktopDetail task={selectedTask} currentUser={currentUser} me={me} onPatch={patch} onOpen={setDetail} onAccept={(task)=>transition(task, 'acknowledged', 'Tiếp nhận việc')} onReport={(task)=>transition(task, 'reported', 'Báo cáo hoàn thành')} onRemind={remind} />
      </div>
    </div>
    <div className="vwork-mobile-shell">
      <div className="vwork-mobile-appbar"><span>VW</span><div><strong>V-Work</strong><small>Work-box của bạn</small></div><Badge tone="b-blue">{scoped.length}</Badge></div>
      <div className="vwork-mobile-topnav">{tabs.map(([key,label,count])=><button type="button" key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}<b>{count}</b></button>)}</div>
      <Card title="Work-box" action={<Badge tone="b-blue">{scoped.length} việc của tôi</Badge>}>
        <div className="vwork-v2-tabs">{tabs.map(([key,label,count])=><button type="button" key={key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{label}<b>{count}</b></button>)}</div>
        <div className="vwork-v2-list">{rows.map((task)=><VWorkTaskCard key={task.id} task={task} onOpen={setDetail} action={actionForTask(task)} />)}{!rows.length && <div className="empty-panel">Không có việc trong nhóm này.</div>}</div>
      </Card>
    </div>
    {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}
  </div>;
}
function VWorkMonitor({ tasks, setTasks, role, me, currentUser }) {
  const [detail, setDetail] = useState(null);
  const scoped = getVisibleTasks(tasks, role, me, currentUser);
  const rows = scoped.map((task)=>({ task, escalation:escalationLevel(task), signal:managementSignal(task) }))
    .filter((row)=>row.escalation.score > 0 || row.signal.level !== 'ok')
    .sort((left,right)=>right.escalation.score - left.escalation.score || (isTaskOverdue(right.task) ? 1 : 0) - (isTaskOverdue(left.task) ? 1 : 0));
  const patch = (id, data) => setTasks(tasks.map((task)=>task.id === id ? {...task, ...data} : task));
  const remind = (task, pushBoss=false) => {
    const count = Number(task.remindCount || 0) + 1;
    const note = pushBoss ? 'Đẩy việc quan trọng lên Giám đốc' : `Nhắc việc lần ${count}`;
    patch(task.id, {
      remindCount:count,
      reminders:[...(task.reminders || []), { kind:pushBoss ? 'director' : 'manager', message:note, from:currentUser?.name || me, done:false, at:new Date().toISOString() }],
      activity:addTaskEvent(task, currentUser, 'Nhắc việc / escalation', note),
    });
    notifyVWork(pushBoss ? `Đã đẩy "${task.title}" lên Giám đốc.` : `Đã nhắc việc cho ${task.ownerName || 'người phụ trách'}: "${task.title}".`, pushBoss ? 'warning' : 'success');
  };
  return <div>
    <Card title="Giám sát việc quan trọng" action={<Badge tone="b-red">{rows.filter((row)=>row.escalation.level === 'director').length} cần Giám đốc</Badge>}>
      <div className="vwork-v2-list">{rows.map(({ task, escalation })=><VWorkTaskCard key={task.id} task={task} onOpen={setDetail} action={<><Badge tone={escalation.tone}>{escalation.label}</Badge><button className="btn btn-sm" type="button" onClick={()=>remind(task)}>Nhắc</button>{can(role, 'view_enterprise') && <button className="btn btn-sm" type="button" onClick={()=>remind(task, true)}>Đẩy GĐ</button>}</>} />)}{!rows.length && <div className="empty-panel">Chưa có việc rủi ro cần can thiệp.</div>}</div>
    </Card>
    {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}
  </div>;
}
function VWorkEvaluate({ tasks, setTasks, role, me, currentUser }) {
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState({ criteria:{}, note:'' });
  const scoped = getVisibleTasks(tasks, role, me, currentUser);
  const candidates = scoped.filter(isVWorkEvaluationCandidate);
  const rows = sortTasksForDisplay(candidates.filter((task)=>!isVWorkEvaluationPassed(task)));
  const historyRows = candidates
    .filter(isVWorkEvaluationPassed)
    .sort((left,right)=>String(right.vworkEvaluation?.updatedAt || '').localeCompare(String(left.vworkEvaluation?.updatedAt || '')));
  const excellentCount = historyRows.filter((task)=>task.vworkEvaluation?.grade === 'A').length;
  const goodCount = historyRows.filter((task)=>task.vworkEvaluation?.grade === 'B').length;
  const patch = (id, data) => setTasks(tasks.map((task)=>task.id === id ? {...task, ...data} : task));
  const openEval = (task) => {
    setSelected(task);
    setDraft({ criteria:task.vworkEvaluation?.criteria || {}, note:task.vworkEvaluation?.note || '' });
  };
  const setCriterion = (id, value) => setDraft((previous)=>({ ...previous, criteria:{ ...previous.criteria, [id]:value } }));
  const submitEval = (task, boss=false) => {
    const grade = vworkGrade(draft.criteria);
    if (!grade) {
      window.alert('Cần chọn đủ 4 tiêu chí trước khi xếp loại.');
      return;
    }
    const previous = task.vworkEvaluation || {};
    const nextEval = {
      ...previous,
      criteria:draft.criteria,
      grade,
      note:draft.note,
      assistantReviewed: previous.assistantReviewed || !boss,
      bossApproved: previous.bossApproved || boss || can(role, 'view_enterprise'),
      updatedAt:new Date().toISOString(),
      updatedBy:currentUser?.name || me,
    };
    patch(task.id, { vworkEvaluation:nextEval, activity:addTaskEvent(task, currentUser, boss ? 'Chốt xếp loại' : 'Đánh giá công việc', `${grade} - ${draft.note || vworkGradeLabel(grade)}`) });
    notifyVWork(boss ? `Đã chốt xếp loại ${grade} cho "${task.title}".` : `Đã gửi đánh giá ${grade} cho "${task.title}".`);
    setSelected(null);
  };
  const evaluationAction = (task, history=false) => {
    const evalState = task.vworkEvaluation || {};
    const needsFinalApproval = Boolean(evalState.grade && !evalState.bossApproved);
    return <><Badge tone={evalState.grade === 'A' ? 'b-green' : evalState.grade === 'C' ? 'b-red' : evalState.grade ? 'b-blue' : 'b-gray'}>{vworkGradeLabel(evalState.grade)}</Badge>{needsFinalApproval && <Badge tone="b-amber">Chờ chốt</Badge>}<button className="btn btn-sm" type="button" onClick={()=>openEval(task)}>{history ? 'Mở đánh giá' : evalState.grade ? 'Đánh giá lại' : 'Đánh giá'}</button></>;
  };
  return <div>
    <Card title="Cần đánh giá / cải thiện" action={<Badge tone="b-purple">{rows.length} việc cần xử lý</Badge>}>
      <div className="vwork-v2-list">{rows.map((task)=><VWorkTaskCard key={task.id} task={task} onOpen={setDetail} action={evaluationAction(task)} />)}{!rows.length && <div className="empty-panel">Không còn việc chưa đạt hoặc chờ chốt đánh giá.</div>}</div>
    </Card>
    <Card title="Lịch sử đánh giá đạt" action={<div className="row" style={{flexWrap:'wrap'}}><Badge tone="b-green">{excellentCount} xuất sắc</Badge><Badge tone="b-blue">{goodCount} hoàn thành tốt</Badge><button className="btn btn-sm" type="button" disabled={!historyRows.length} onClick={()=>setShowHistory((current)=>!current)}>{showHistory ? 'Ẩn lịch sử' : `Xem ${historyRows.length} việc`}</button></div>}>
      {showHistory ? <div className="vwork-v2-list">{historyRows.map((task)=><VWorkTaskCard key={task.id} task={task} onOpen={setDetail} action={evaluationAction(task, true)} />)}</div> : <p className="muted">Các việc đã được chốt Xuất sắc hoặc Hoàn thành tốt được lưu tại đây để danh sách trên chỉ tập trung vào việc chưa đạt.</p>}
    </Card>
    {selected && <div className="modal-bg" onClick={()=>setSelected(null)}><div className="modal vwork-eval-modal" onClick={(event)=>event.stopPropagation()}>
      <button className="modal-x" type="button" aria-label="Đóng popup" onClick={()=>setSelected(null)}>×</button>
      <div className="modal-head"><div><h3>Đánh giá: {selected.title}</h3><p className="muted">{selected.ownerName} · {selected.projectCode || 'Việc chung'}</p></div><button className="btn btn-sm modal-back" type="button" onClick={()=>setSelected(null)}>← Quay lại</button></div>
      <div className="vwork-criteria-grid">{VWORK_EVAL_CRITERIA.map((item)=><div className="vwork-criterion" key={item.id}><strong>{item.label}</strong><div className="vwork-criterion-actions">{['pass','slow','fail'].map((value)=><button type="button" key={value} className={draft.criteria[item.id]===value?'active':''} onClick={()=>setCriterion(item.id, value)}>{value === 'pass' ? 'Đạt' : value === 'slow' ? 'Chậm' : 'Không đạt'}</button>)}</div></div>)}</div>
      <label style={{marginTop:12}}><span>Ghi nhận</span><textarea rows="3" value={draft.note} onChange={(event)=>setDraft({...draft, note:event.target.value})} placeholder="Kết quả, thái độ, điểm cần cải thiện..." /></label>
      <div className="grade-box"><strong>{vworkGradeLabel(vworkGrade(draft.criteria))}</strong><span>{vworkGrade(draft.criteria) || 'Chọn đủ tiêu chí để ra xếp loại'}</span></div>
      <div className="row" style={{justifyContent:'flex-end',marginTop:12}}><button className="btn" onClick={()=>submitEval(selected, false)}>Gửi đánh giá</button>{can(role, 'view_enterprise') && <button className="btn btn-primary" onClick={()=>submitEval(selected, true)}>Chốt xếp loại</button>}</div>
    </div></div>}
    {detail && <TaskDetail task={tasks.find((task)=>task.id===detail.id) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={(id)=>setTasks((previous)=>previous.filter((task)=>task.id !== id))} />}
  </div>;
}
function briefingDaysUntil(deadline) {
  if (!deadline) return null;
  const todayValue = Date.parse(`${addDays(0)}T12:00:00`);
  const deadlineValue = Date.parse(`${String(deadline).slice(0,10)}T12:00:00`);
  if (!Number.isFinite(deadlineValue)) return null;
  return Math.round((deadlineValue - todayValue) / 86400000);
}
function briefingAttentionForTask(task) {
  const progress = progressOf(task);
  const readiness = outcomeReadiness(task);
  const gate = enterpriseHardGateDecision(task);
  const daysUntil = briefingDaysUntil(task.deadline);
  const reasons = [];
  let score = 0;
  let category = 'watch';
  const addReason = (label, points, tone = 'watch') => {
    if (!reasons.includes(label)) reasons.push(label);
    score += points;
    if (tone === 'critical') category = 'critical';
    else if (tone === 'review' && category !== 'critical') category = 'review';
  };
  if (daysUntil !== null && daysUntil < 0) addReason(`Quá hạn ${Math.abs(daysUntil)} ngày`, 100 + Math.min(30, Math.abs(daysUntil) * 3), 'critical');
  if (task.risk === 'Critical') addReason('Rủi ro Critical', 80, 'critical');
  else if (task.risk === 'High') addReason('Rủi ro cao', 34);
  if (task.traffic === 'Red') addReason('Đèn đỏ', 70, 'critical');
  else if (task.traffic === 'Amber') addReason('Đèn vàng', 22);
  if (gate.hardGateBlock) addReason(gate.blockers[0] || 'Bị chặn bởi hard gate', 60, 'critical');
  if (task.stage === 'explain_requested') addReason('Đang chờ giải trình', 55, 'critical');
  else if (['reported','lead_approved'].includes(task.stage)) addReason('Đang chờ duyệt kết quả', 36, 'review');
  if (!task.ownerId && !task.ownerName && !task.ownerLead) addReason('Chưa có người phụ trách', 45, 'critical');
  if (!task.deadline) addReason('Chưa có deadline', 28);
  if (daysUntil !== null && daysUntil >= 0 && daysUntil <= 3 && progress < 80) addReason(daysUntil === 0 ? 'Đến hạn hôm nay' : `Còn ${daysUntil} ngày, tiến độ ${progress}%`, 38, 'review');
  if (!readiness.hasEvidence && progress >= 70) addReason('Tiến độ cao nhưng thiếu minh chứng', 30, 'review');
  const openReminders = (task.reminders || []).filter((item)=>!item.done).length;
  if (openReminders) addReason(`${openReminders} nhắc việc chưa đóng`, 12 + openReminders * 4);
  const activityAt = taskActivityTime(task) || Date.parse(task.startDate || task.createdAt || '');
  const inactiveDays = Number.isFinite(activityAt) && activityAt > 0 ? Math.floor((Date.now() - activityAt) / 86400000) : 0;
  if (inactiveDays >= 5 && progress < 60) addReason(`${inactiveDays} ngày chưa cập nhật`, Math.min(30, 10 + inactiveDays));
  if (task.priority === 'High' || task.priority === 'Critical') score += 10;
  return { task, score, category, reasons, progress, readiness, daysUntil };
}
function briefingDecisionForTask(task) {
  if (isVWorkAdminRequest(task)) {
    const meta = adminRequestMeta(task);
    const status = meta.paymentStatus || 'submitted';
    if (!['accountant_review','manager_approved'].includes(status)) return null;
    return { task, type:'Đề nghị', owner:meta.requesterName || task.ownerName || 'Chưa rõ người gửi', note:Number(meta.amount || 0) > 0 ? `${Number(meta.amount).toLocaleString('vi-VN')} ${meta.currency || 'VND'}` : 'Chờ phê duyệt' };
  }
  if (isVWorkProposalRequestTask(task)) {
    const request = proposalRequestTaskToRequest(task);
    if (!['pending','info'].includes(request.status)) return null;
    return { task, type:'Đề xuất', owner:request.ownerName || task.ownerName || 'Chưa rõ người gửi', note:request.status === 'info' ? 'Đang xin ý kiến' : 'Chờ quyết định' };
  }
  const evaluation = task.vworkEvaluation || {};
  if (evaluation.grade && !evaluation.bossApproved) return { task, type:'Đánh giá', owner:task.ownerName || 'Chưa rõ người phụ trách', note:`Chờ chốt xếp loại ${evaluation.grade}` };
  return null;
}
function VWorkBriefing({ tasks, setTasks, role, me, currentUser }) {
  const [agendaFilter, setAgendaFilter] = useState('all');
  const [detail, setDetail] = useState(null);
  const scoped = getVisibleTasks(tasks, role, me, currentUser);
  const workRows = scoped.filter((task)=>!isVWorkAdminRequest(task) && !isVWorkProposalRequestTask(task) && !isOutsideVWorkWorkforce(task));
  const active = workRows.filter((task)=>!isTaskDone(task));
  const completed = workRows.filter(isTaskDone);
  const attentionRows = active.map(briefingAttentionForTask)
    .filter((row)=>row.reasons.length > 0)
    .sort((left,right)=>right.score - left.score || (left.daysUntil ?? 9999) - (right.daysUntil ?? 9999) || taskActivityTime(right.task) - taskActivityTime(left.task));
  const decisionRows = scoped.map(briefingDecisionForTask).filter(Boolean)
    .filter((row, index, rows)=>rows.findIndex((item)=>String(item.task.id) === String(row.task.id)) === index)
    .sort((left,right)=>taskActivityTime(right.task) - taskActivityTime(left.task));
  const overdueCount = active.filter((task)=>briefingDaysUntil(task.deadline) < 0).length;
  const criticalCount = attentionRows.filter((row)=>row.category === 'critical').length;
  const reviewCount = attentionRows.filter((row)=>row.category === 'review').length;
  const watchCount = attentionRows.filter((row)=>row.category === 'watch').length;
  const filteredAttentionRows = agendaFilter === 'all' ? attentionRows : attentionRows.filter((row)=>row.category === agendaFilter);
  const ownerCoverage = workRows.length ? Math.round(workRows.filter((task)=>task.ownerId || task.ownerName || task.ownerLead).length / workRows.length * 100) : 100;
  const deadlineCoverage = workRows.length ? Math.round(workRows.filter((task)=>task.deadline).length / workRows.length * 100) : 100;
  const evidenceRelevant = workRows.filter((task)=>progressOf(task) >= 70 || ['reported','lead_approved','controller_approved'].includes(task.stage));
  const evidenceCoverage = evidenceRelevant.length ? Math.round(evidenceRelevant.filter((task)=>outcomeReadiness(task).hasEvidence).length / evidenceRelevant.length * 100) : 100;
  const attentionByOwner = [...attentionRows.reduce((map, row)=>{
    const owner = row.task.ownerName || row.task.ownerLead || 'Chưa phân công';
    const current = map.get(owner) || { owner, count:0, critical:0 };
    current.count += 1;
    current.critical += Number(row.category === 'critical');
    map.set(owner, current);
    return map;
  }, new Map()).values()].sort((left,right)=>right.critical - left.critical || right.count - left.count || left.owner.localeCompare(right.owner, 'vi')).slice(0,6);
  const generatedAt = new Date();
  const generatedDate = generatedAt.toLocaleDateString('vi-VN', { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' });
  const generatedTime = generatedAt.toLocaleTimeString('vi-VN', { hour:'2-digit', minute:'2-digit' });
  const leadRow = attentionRows[0];
  const meetingLead = leadRow
    ? `Ưu tiên số 1 là “${leadRow.task.title}” — ${leadRow.reasons.slice(0,2).join('; ').toLowerCase()}.`
    : decisionRows.length
      ? `Không có việc vận hành đỏ; cuộc họp nên tập trung chốt ${decisionRows.length} quyết định đang chờ.`
      : 'Không có điểm nghẽn nổi bật; tập trung xác nhận cam kết tuần và các mốc sắp tới.';
  const copyText = [
    `V-WORK · GIAO BAN ${generatedAt.toLocaleDateString('vi-VN')}`,
    `Phạm vi: ${workRows.length} việc · ${active.length} đang thực hiện · ${completed.length} hoàn thành`,
    '',
    `NHẬN ĐỊNH: ${meetingLead}`,
    '',
    `1) VIỆC CẦN CHÚ Ý (${attentionRows.length})`,
    ...(attentionRows.length ? attentionRows.map((row,index)=>`${index + 1}. ${row.task.title} · ${row.task.ownerName || row.task.ownerLead || 'Chưa phân công'} · ${row.reasons.join('; ')}`) : ['- Không có']),
    '',
    `2) QUYẾT ĐỊNH CẦN CHỐT (${decisionRows.length})`,
    ...(decisionRows.length ? decisionRows.map((row,index)=>`${index + 1}. [${row.type}] ${row.task.title} · ${row.owner} · ${row.note}`) : ['- Không có']),
  ].join('\n');
  const copyBriefing = async () => {
    try {
      await navigator.clipboard?.writeText(copyText);
      notifyVWork('Đã copy nội dung giao ban.');
    } catch {
      window.prompt('Copy nội dung giao ban:', copyText);
    }
  };
  const patch = (id, data) => setTasks?.((current)=>current.map((task)=>String(task.id) === String(id) ? { ...task, ...data } : task));
  const remove = (id) => setTasks?.((current)=>current.filter((task)=>String(task.id) !== String(id)));
  const filters = [
    ['all','Tất cả',attentionRows.length],
    ['critical','Cần chỉ đạo',criticalCount],
    ['review','Cần duyệt / chốt',reviewCount],
    ['watch','Theo dõi sát',watchCount],
  ];
  return <div className="vwork-brief-page">
    <section className="vwork-brief-hero">
      <div className="vwork-brief-hero-copy">
        <span className="vwork-brief-eyebrow"><CalendarDays size={15} /> V-Work · Giao ban điều hành</span>
        <h1>Bức tranh công việc để ra quyết định</h1>
        <p>Tổng hợp trực tiếp từ công việc, deadline, tiến độ, rủi ro, minh chứng và luồng phê duyệt đang lưu trong hệ thống.</p>
        <div className="vwork-brief-meta"><div><span>Snapshot</span><strong>{generatedTime} · {generatedDate}</strong></div><div><span>Phạm vi</span><strong>{workRows.length} việc nội bộ</strong></div><div><span>Độ phủ</span><strong>{new Set(workRows.map((task)=>task.ownerName || task.ownerLead).filter(Boolean)).size} người phụ trách</strong></div></div>
      </div>
      <button className="vwork-brief-copy" type="button" onClick={copyBriefing}><Copy size={17} />Copy nội dung họp</button>
    </section>

    <div className="vwork-brief-kpis">
      <article><span className="blue"><BarChart3 size={18} /></span><strong>{active.length}</strong><b>Việc đang thực hiện</b><small>{completed.length} việc đã hoàn thành trong phạm vi</small></article>
      <article><span className="red"><Clock3 size={18} /></span><strong>{overdueCount}</strong><b>Việc quá hạn</b><small>{criticalCount} việc cần chỉ đạo ngay</small></article>
      <article><span className="amber"><ShieldAlert size={18} /></span><strong>{attentionRows.length}</strong><b>Việc cần chú ý</b><small>Mỗi việc chỉ xuất hiện một lần</small></article>
      <article><span className="purple"><ClipboardCheck size={18} /></span><strong>{decisionRows.length}</strong><b>Quyết định cần chốt</b><small>Đề xuất, đề nghị và xếp loại</small></article>
    </div>

    <div className="vwork-brief-method"><Target size={17} /><p><strong>Cơ chế xếp hạng:</strong> quá hạn, Critical/đèn đỏ, hard gate, chờ giải trình, sắp đến hạn, thiếu minh chứng và nhắc việc được quy thành điểm điều hành. Việc có điểm cao hơn được đưa lên trước; không đếm trùng giữa các nhóm.</p></div>

    <section className="vwork-brief-insight-grid">
      <article className="vwork-brief-card vwork-brief-finding">
        <header><div><span>Phát hiện điều hành</span><h2>Cuộc họp nên bắt đầu từ đâu?</h2></div><AlertTriangle size={22} /></header>
        <p className="vwork-brief-lead">{meetingLead}</p>
        <div className="vwork-brief-owner-list">{attentionByOwner.length ? attentionByOwner.map((row,index)=><div key={row.owner}><b>{String(index + 1).padStart(2,'0')}</b><span><strong>{row.owner}</strong><small>{row.count} việc cần chú ý · {row.critical} việc cần chỉ đạo</small></span></div>) : <div className="vwork-brief-empty">Không có người phụ trách nào đang có việc cần chú ý.</div>}</div>
      </article>
      <article className="vwork-brief-card vwork-brief-coverage">
        <header><div><span>Chất lượng dữ liệu</span><h2>Đủ dữ liệu để giao ban?</h2></div><Users size={22} /></header>
        <div><span>Đã có người phụ trách</span><strong>{ownerCoverage}%</strong><Progress value={ownerCoverage} /></div>
        <div><span>Đã có deadline</span><strong>{deadlineCoverage}%</strong><Progress value={deadlineCoverage} /></div>
        <div><span>Có minh chứng khi tiến độ ≥ 70%</span><strong>{evidenceCoverage}%</strong><Progress value={evidenceCoverage} /></div>
        <p>Điểm thiếu dữ liệu được đưa thẳng vào danh sách cần chú ý để xử lý ngay trong cuộc họp.</p>
      </article>
    </section>

    <section className="vwork-brief-decisions">
      <div className="vwork-brief-section-head"><div><span>Hàng đợi quyết định</span><h2>Việc cần Giám đốc chốt</h2></div><b>{decisionRows.length}</b></div>
      <div className="vwork-brief-decision-grid">{decisionRows.length ? decisionRows.map((row)=><button type="button" key={row.task.id} onClick={()=>setDetail(row.task)}><span>{row.type}</span><strong>{row.task.title}</strong><small>{row.owner}</small><em>{row.note}<ArrowRight size={15} /></em></button>) : <div className="vwork-brief-empty wide"><Check size={18} />Không có quyết định đang chờ Giám đốc.</div>}</div>
    </section>

    <section className="vwork-brief-agenda">
      <div className="vwork-brief-agenda-head"><div><span>Danh sách điều hành</span><h2>Việc cần chú ý</h2><p>Hiển thị đầy đủ theo mức ưu tiên, không cắt danh sách.</p></div><div className="vwork-brief-filters">{filters.map(([key,label,count])=><button type="button" key={key} className={agendaFilter===key?'active':''} onClick={()=>setAgendaFilter(key)}>{label}<b>{count}</b></button>)}</div></div>
      <div className="vwork-brief-attention-list">{filteredAttentionRows.length ? filteredAttentionRows.map((row,index)=><button type="button" className={`vwork-brief-attention-row ${row.category}`} key={row.task.id} onClick={()=>setDetail(row.task)}><span className="vwork-brief-rank">{String(index + 1).padStart(2,'0')}</span><div className="vwork-brief-task"><div><strong>{row.task.title}</strong><small>{row.task.projectCode || 'Việc chung'} · {row.task.ownerName || row.task.ownerLead || 'Chưa phân công'} · Hạn {row.task.deadline || 'chưa đặt'}</small></div><div className="vwork-brief-reasons">{row.reasons.map((reason)=><span key={reason}>{reason}</span>)}</div></div><div className="vwork-brief-progress"><strong>{row.progress}%</strong><Progress value={row.progress} /></div><div className="vwork-brief-score"><strong>{row.score}</strong><span>điểm ưu tiên</span><Eye size={16} /></div></button>) : <div className="vwork-brief-empty wide"><Check size={18} />Không có việc trong nhóm lọc này.</div>}</div>
    </section>
    {detail && <TaskDetail task={tasks.find((task)=>String(task.id) === String(detail.id)) || detail} role={role} me={me} currentUser={currentUser} onClose={()=>setDetail(null)} onPatch={patch} onDelete={remove} />}
  </div>;
}
function formatVWorkFormSize(size) {
  const value = Number(size || 0);
  if (!value) return '-';
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}
function VWorkForms({ forms, setForms, currentUser }) {
  const rows = mergeVWorkForms(forms);
  const [notice, setNotice] = useState('');
  const uploadForms = (files) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;
    const existing = new Set(rows.map((item)=>normalizeVWorkFormName(item.fileName)));
    const now = new Date().toISOString();
    const nextItems = incoming.filter((file)=>!existing.has(normalizeVWorkFormName(file.name))).map((file)=>({
      id:`vwork-form-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name:file.name.replace(/\.[^.]+$/, ''),
      fileName:file.name,
      fileType:String(file.name.split('.').pop() || '').toLowerCase(),
      size:file.size,
      roleScope:VWORK_FORM_ROLE_SCOPE,
      source:'vwork_upload',
      uploadedBy:currentUser?.name || currentUser?.email || 'V-Work',
      uploadedAt:now,
    }));
    const skipped = incoming.length - nextItems.length;
    if (nextItems.length) setForms((previous)=>mergeVWorkForms([...(Array.isArray(previous) ? previous : []), ...nextItems]));
    setNotice(skipped ? `Đã bỏ qua ${skipped} form trùng tên.` : `Đã thêm ${nextItems.length} form.`);
  };
  const deleteForm = (id) => {
    setForms((previous)=>mergeVWorkForms(Array.isArray(previous) ? previous.filter((item)=>item.id !== id) : []));
    setNotice('Đã xoá form upload khỏi V-Work.');
  };
  return <div>
    <Card title="Form công việc" action={<Badge tone="b-blue">{rows.length} form</Badge>}>
      <div className="vwork-form-admin">
        <label className="vwork-form-upload">
          <span>Upload form</span>
          <strong>Chọn file biểu mẫu công việc</strong>
          <small>DOC, DOCX, XLS, XLSX, PDF</small>
          <input type="file" multiple accept=".doc,.docx,.xls,.xlsx,.pdf" onChange={(event)=>{ uploadForms(event.target.files); event.target.value = ''; }} />
        </label>
        <div className="soft-box">
          <strong>Quản lý biểu mẫu</strong>
          <p className="muted">Form trùng tên file sẽ được bỏ qua để không tạo bản lặp.</p>
          {notice && <Badge tone={notice.includes('bỏ qua') ? 'b-amber' : 'b-green'}>{notice}</Badge>}
        </div>
      </div>
      <div className="table-wrap" style={{marginTop:14}}>
        <table>
          <thead><tr><th>Form</th><th>File</th><th>Dung lượng</th><th>Nguồn</th><th>Người tải</th><th></th></tr></thead>
          <tbody>{rows.map((item)=><tr key={item.id}>
            <td><strong>{item.name}</strong><div className="muted">{item.roleScope.map((roleKey)=>ROLES[roleKey] || roleKey).join(' · ')}</div></td>
            <td>{item.fileName}<div className="muted">{String(item.fileType || '').toUpperCase()}</div></td>
            <td>{formatVWorkFormSize(item.size)}</td>
            <td>{item.source === 'project content/vwork/form' ? 'Form khởi tạo' : 'Upload V-Work'}</td>
            <td>{item.uploadedBy || '-'}<div className="muted">{item.uploadedAt ? new Date(item.uploadedAt).toLocaleString('vi-VN') : ''}</div></td>
            <td>{item.source === 'project content/vwork/form' ? <Badge tone="b-gray">Mặc định</Badge> : <button className="btn btn-danger btn-sm" type="button" onClick={()=>deleteForm(item.id)}>Xóa</button>}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </Card>
  </div>;
}
function VWorkSettings({ tasks, settings, setSettings }) {
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ group:'Loại việc', code:'', name:'', note:'' });
  const [editingCode, setEditingCode] = useState('');
  const baseRows = [
    ...MASTER.jobs.map(([code,name])=>({ group:'Loại việc', code, name, note:'Job catalog hiện hành', readonly:true })),
    ...VWORK_WORK_TYPES.map((item)=>({ group:'Loại việc mobile', code:item.jobCode, name:item.title, note:item.desc })),
    ...VWORK_EVAL_CRITERIA.map((item)=>({ group:'Tiêu chí đánh giá', code:item.id, name:item.label, note:'Đạt / Chậm / Không đạt', readonly:true })),
    ...MASTER.owners.map((owner)=>({ group:'Nhân sự', code:owner.id, name:owner.name, note:'', readonly:true })),
  ];
  const customRows = Array.isArray(settings) ? settings : [];
  const rows = [...baseRows, ...customRows].filter((item)=>!query || `${item.group} ${item.code} ${item.name} ${item.note}`.toLowerCase().includes(query.toLowerCase()));
  const resetForm = () => {
    setForm({ group:'Loại việc', code:'', name:'', note:'' });
    setEditingCode('');
  };
  const saveSetting = () => {
    if (!form.code.trim() || !form.name.trim()) return;
    const code = form.code.trim();
    const nextItem = { ...form, code, name:form.name.trim(), note:form.note.trim(), source:'vplanning_records', updatedAt:new Date().toISOString() };
    setSettings((previous)=>[nextItem, ...(Array.isArray(previous) ? previous : []).filter((item)=>item.code !== (editingCode || code))]);
    resetForm();
  };
  const editSetting = (item) => {
    if (item.readonly) return;
    setForm({ group:item.group || 'Danh mục khác', code:item.code || '', name:item.name || '', note:item.note || '' });
    setEditingCode(item.code || '');
  };
  const deleteSetting = (code) => {
    if (!code) return;
    setSettings((previous)=>(Array.isArray(previous) ? previous : []).filter((item)=>item.code !== code));
    if (editingCode === code) resetForm();
  };
  return <div>
    <Card title="Cài đặt danh mục" action={<Badge tone="b-blue">{rows.length} mục</Badge>}>
      <div className="filter-bar"><label><span>Tìm danh mục</span><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Tìm loại việc, owner, tiêu chí..." /></label></div>
      <div className="grid grid-2">
        <div className="table-wrap"><table><thead><tr><th>Nhóm</th><th>Mã</th><th>Tên</th><th>Ghi chú</th><th>CRUD</th></tr></thead><tbody>{rows.map((item, index)=><tr key={`${item.group}-${item.code}-${index}`}><td>{item.group}</td><td><strong>{item.code}</strong></td><td>{item.name}</td><td>{item.note}</td><td>{item.readonly ? <Badge tone="b-gray">Hệ thống</Badge> : <div className="row"><button className="btn btn-ghost" type="button" onClick={()=>editSetting(item)}>Sửa</button><button className="btn btn-danger" type="button" onClick={()=>deleteSetting(item.code)}>Xóa</button></div>}</td></tr>)}</tbody></table></div>
        <div className="soft-box"><strong>{editingCode ? 'Sửa mục cấu hình' : 'Thêm mục cấu hình'}</strong><div className="grid" style={{marginTop:10}}><label><span>Nhóm</span><select value={form.group} onChange={(event)=>setForm({...form, group:event.target.value})}><option>Loại việc</option><option>Tiêu chí đánh giá</option><option>Quy tắc nhắc hạn</option><option>Danh mục khác</option></select></label><label><span>Mã</span><input value={form.code} onChange={(event)=>setForm({...form, code:event.target.value})} disabled={Boolean(editingCode)} /></label><label><span>Tên</span><input value={form.name} onChange={(event)=>setForm({...form, name:event.target.value})} /></label><label><span>Ghi chú</span><textarea rows="2" value={form.note} onChange={(event)=>setForm({...form, note:event.target.value})} /></label><div className="row"><button className="btn btn-primary" type="button" onClick={saveSetting}>{editingCode ? 'Cập nhật cấu hình' : 'Lưu cấu hình'}</button>{editingCode && <button className="btn btn-ghost" type="button" onClick={resetForm}>Hủy sửa</button>}</div></div></div>
      </div>
    </Card>
    <Card title="Tín hiệu kết nối dữ liệu thật"><table><tbody><tr><th>Task hiện có</th><td>{tasks.length}</td></tr><tr><th>Job catalog</th><td>{MASTER.jobs.length}</td></tr><tr><th>Cấu hình tự tạo</th><td>{customRows.length}</td></tr><tr><th>Storage</th><td>vplanning_records + vplanning_state qua /api/vplanning-state</td></tr></tbody></table></Card>
  </div>;
}
const QUALITY_STAGES = [
  'Khởi tạo & chốt điều kiện khóa','E-learning trước khóa','Chuẩn bị giảng viên','Khởi tạo & kiểm thử hệ thống',
  'Chuẩn bị vận hành & hậu cần','Khai giảng & học trên lớp','Bế giảng & phát quà','Sau khóa & nghiệm thu',
];
function Quality(){
  const rows = QUALITY_STAGES.map((stage, index)=>({
    stage,
    items:index === 0 ? ['Chốt phạm vi, lịch, đối tượng học viên','Xác nhận đầu mối khách hàng'] :
      index === 1 ? ['Kịch bản học liệu','Upload LMS và hướng dẫn học viên'] :
      index === 5 ? ['Điểm danh, ghi hình, hỗ trợ lớp','Theo dõi giảng viên và tương tác lớp'] :
      ['Checklist chất lượng công đoạn','Minh chứng hoàn thành'],
  }));
  return <Card title="Chất lượng theo công đoạn"><div className="table-wrap"><table><thead><tr><th>Công đoạn</th><th>Hạng mục kiểm soát mẫu</th><th>Trạng thái</th></tr></thead><tbody>{rows.map((row, idx)=><tr key={row.stage}><td><strong>s{idx}</strong><div>{row.stage}</div></td><td>{row.items.map((item)=><div key={item}>- {item}</div>)}</td><td><Badge tone={idx < 2 ? 'b-green' : 'b-amber'}>{idx < 2 ? 'Đã có mẫu' : 'Cần cập nhật theo dự án'}</Badge></td></tr>)}</tbody></table></div></Card>;
}
const ACCEPTANCE_ITEMS = [
  ['Ảnh chụp lớp học','CTV','Từng buổi'], ['Danh sách điểm danh có chữ ký','CTV','Từng buổi'],
  ['KQ bài kiểm tra E-learning','QT LMS','Trước khóa'], ['KQ bài kiểm tra cuối khóa','QT LMS','Sau buổi cuối'],
  ['Tổng hợp điểm thảo luận nhóm','Teamlead','Từng buổi'], ['Bài thu hoạch/cam kết','Teamlead','Sau lớp <=T+2'],
  ['Phiếu đánh giá','CTV','Sau lớp'], ['Báo cáo sau khóa','QL vận hành','<=T+3'], ['Biên bản nghiệm thu','QL vận hành','<=T+7'],
];
function Acceptance(){
  return <Card title="Hồ sơ nghiệm thu"><p className="muted">Seed ban đầu theo chuẩn dự án đào tạo; khi nối database, từng dự án sẽ có checklist nghiệm thu riêng.</p><table><thead><tr><th>Hạng mục</th><th>Trách nhiệm</th><th>Thời điểm</th><th>Trạng thái</th></tr></thead><tbody>{ACCEPTANCE_ITEMS.map(([item, who, when], idx)=><tr key={item}><td>{item}</td><td>{who}</td><td>{when}</td><td><Badge tone={idx < 3 ? 'b-green' : 'b-gray'}>{idx < 3 ? 'Có sẵn' : 'Chờ cập nhật'}</Badge></td></tr>)}</tbody></table></Card>;
}
function Catalog(){
  return <div className="grid grid-2"><Card title="Job Catalog"><table><thead><tr><th>Mã Job</th><th>Tên Job</th></tr></thead><tbody>{MASTER.jobs.map(([code,name])=><tr key={code}><td><strong>{code}</strong></td><td>{name}</td></tr>)}</tbody></table></Card><Card title="Objective / Result Master"><table><thead><tr><th>Mã</th><th>Tên</th><th>Mô tả</th></tr></thead><tbody>{MASTER.objectives.map(([code,name,desc])=><tr key={code}><td><strong>{code}</strong></td><td>{name}</td><td>{desc}</td></tr>)}{MASTER.results.map(([code,name])=><tr key={code}><td><strong>{code}</strong></td><td>{name}</td><td></td></tr>)}</tbody></table></Card><Card title="Owner Master"><table><thead><tr><th>Owner_ID</th><th>Nhân sự</th></tr></thead><tbody>{MASTER.owners.map((owner)=><tr key={owner.id}><td><strong>{owner.id}</strong></td><td>{owner.name}</td></tr>)}</tbody></table></Card><Card title="Người dùng & phân quyền đa vai trò"><table><thead><tr><th>Người dùng</th><th>Chức danh</th><th>Roles</th></tr></thead><tbody>{MASTER.users.map((user)=><tr key={user.email}><td><strong>{user.name}</strong><div className="muted">{user.email}</div></td><td>{user.title}</td><td>{user.roles.map((role)=><Badge key={role} tone="b-blue">{ROLES[role]}</Badge>)}</td></tr>)}</tbody></table></Card><Card title="Cơ cấu tổ chức"><table><thead><tr><th>Khối</th><th>Thành viên</th></tr></thead><tbody>{MASTER.orgUnits.map((unit)=><tr key={unit.code}><td><strong>{unit.name}</strong></td><td>{unit.people.join(', ')}</td></tr>)}</tbody></table></Card></div>;
}
function HelpGuide(){
  const [guideRole, setGuideRole] = useState('staff');
  const roleGuides = {
    staff: {
      label:'Người nhận việc',
      tone:'b-green',
      goal:'Biết việc nào cần làm, nhận việc đúng cách, báo cáo ngắn gọn và có minh chứng.',
      steps:[
        ['Mở việc mới','Vào Inbox công việc, ưu tiên các việc có nhãn Mới giao, Cần báo ngay hoặc Quá hạn. Bấm Mở ở dòng công việc.'],
        ['Đọc đúng 3 phần','Đọc tên việc, hạn hoàn thành/rủi ro ở cột phải, rồi xem checklist để biết các việc nhỏ cần làm.'],
        ['Nhận việc','Ở tab Thực hiện, bấm Đã nhận việc để quản lý biết bạn đã đọc và bắt đầu xử lý.'],
        ['Lập kế hoạch','Điền phối hợp nội bộ/khách hàng/giảng viên/CTV nếu có, ghi cách thực hiện ngắn, rồi bấm Hoàn thành kế hoạch.'],
        ['Báo cáo','Khi có kết quả, ghi 2-4 dòng: đã làm gì, còn vướng gì, cần ai hỗ trợ. Dán link minh chứng rồi bấm Gửi báo cáo.'],
      ],
    },
    manager: {
      label:'Trưởng bộ phận / PM',
      tone:'b-blue',
      goal:'Giao việc rõ, theo dõi việc mới/trễ, duyệt báo cáo và xử lý việc trùng hoặc sai owner.',
      steps:[
        ['Tạo hoặc import việc','Vào Khởi tạo kế hoạch để upload Excel/tạo từ mẫu, hoặc Giao việc độc lập cho việc phát sinh nhanh.'],
        ['Kiểm tra phân công','Xem Owner_ID, deadline, priority, risk. Việc mới giao sẽ lên đầu danh sách để dễ nhắc.'],
        ['Theo dõi team','Vào Workload để xem tải từng người, vào Dashboard để xem việc cần chỉ đạo/cần duyệt.'],
        ['Duyệt báo cáo','Mở việc ở trạng thái Chờ xử lý/chờ duyệt, vào tab Duyệt / kiểm soát, đánh giá công việc/kết quả rồi Duyệt chuyển KSV.'],
        ['Sửa hoặc xoá','Nếu việc trùng/sai thông tin, mở tab Sửa / xoá để chỉnh tên việc, owner, deadline, mã job hoặc xoá việc.'],
      ],
    },
    controller: {
      label:'Kiểm soát viên',
      tone:'b-amber',
      goal:'Kiểm tra chất lượng báo cáo/minh chứng trước khi xác nhận hoàn thành.',
      steps:[
        ['Xem hàng đợi','Vào Xác nhận / Kiểm soát để xem việc chờ KSV, hoặc Dashboard để xem nhóm cần duyệt.'],
        ['Đọc kết quả','Mở việc, xem checklist, báo cáo kết quả, link minh chứng và lịch sử báo cáo.'],
        ['Đối chiếu minh chứng','Nếu chưa có báo cáo hoặc link minh chứng thì chưa xác nhận. Ghi rõ cần bổ sung gì.'],
        ['Xác nhận hoặc trả lại','Ở tab Duyệt / kiểm soát, bấm Xác nhận hoàn thành nếu đủ; bấm Yêu cầu bổ sung nếu còn thiếu.'],
      ],
    },
    director: {
      label:'Giám đốc / Admin',
      tone:'b-purple',
      goal:'Nhìn toàn cảnh, xử lý việc đỏ, đánh giá tuần và tổng hợp kết quả.',
      steps:[
        ['Xem điều hành','Vào Dashboard công việc để thấy bức tranh theo dự án, workload theo người và các việc cần GĐ xử lý.'],
        ['Ưu tiên việc đỏ','Mở các việc Cần chỉ đạo ngay: quá hạn, risk Critical, traffic Red hoặc thiếu minh chứng quan trọng.'],
        ['Theo dõi hiệu suất','Vào Tổng hợp tháng để xem điểm tổng hợp, đúng hạn, hoàn thành, nhận định từng người.'],
        ['Kiểm soát hệ thống','Vào Job / User / Org Catalog khi cần rà owner, role, job code, cơ cấu tổ chức.'],
      ],
    },
  };
  const flow = [
    ['1', 'Giao / nhận việc', 'PM/GĐ giao việc từ Excel, mẫu dự án hoặc giao việc độc lập. Người nhận mở Inbox và nhận việc.'],
    ['2', 'Lập kế hoạch', 'Người nhận ghi cách làm, phối hợp cần thiết, checklist và mốc hoàn thành dự kiến.'],
    ['3', 'Báo cáo kết quả', 'Người nhận cập nhật tiến độ, link minh chứng, vấn đề cần hỗ trợ hoặc đề xuất xử lý.'],
    ['4', 'Duyệt / KSV', 'PM duyệt cấp quản lý, KSV kiểm tra minh chứng và xác nhận hoặc yêu cầu giải trình.'],
  ];
  const detailFields = [
    ['Tên công việc', 'Đọc trước tiên để hiểu đầu ra phải làm. Nếu tên việc có kèm tên người nhưng đã có owner riêng, nên sửa gọn lại.'],
    ['Thông tin bên phải', 'Xem deadline, priority, risk, traffic light, trạng thái duyệt và link nguồn. Đây là phần đọc nhanh, không phải nơi thao tác chính.'],
    ['Việc cần làm', 'Checklist ngắn để người nhận biết cần làm gì trước, việc nào đã xong, tiến độ hiện tại ra sao.'],
    ['Điều kiện duyệt V1', 'Chỉ kiểm tra các điều kiện cơ bản: có báo cáo kết quả, có link minh chứng/file bàn giao, không bỏ trống việc quá hạn.'],
    ['Checklist', 'Các việc nhỏ phải tick. Nhân sự tick khi hoàn thành, PM/KSV dùng để rà thiếu sót.'],
    ['Báo cáo kết quả', 'Ghi báo cáo ngắn, rõ kết quả và vướng mắc. Link minh chứng nên là link file, folder, file bàn giao hoặc sản phẩm.'],
  ];
  const tabs = [
    ['Thực hiện', 'Người nhận việc dùng nhiều nhất. Có 4 nhóm thao tác: nhận việc, cập nhật checklist, lập kế hoạch phối hợp, gửi báo cáo/minh chứng. Không cần dùng tab khác nếu chỉ làm và báo cáo việc của mình.'],
    ['Trao đổi', 'Dùng khi cần hỏi, nhắc, lưu chỉ đạo hoặc giải thích thêm. Nội dung ở đây giúp PM/KSV đọc lại bối cảnh trước khi duyệt.'],
    ['Duyệt / kiểm soát', 'PM dùng để duyệt cấp quản lý. KSV dùng để xác nhận hoàn thành hoặc yêu cầu bổ sung. Nếu thiếu báo cáo/minh chứng, nút duyệt sẽ bị chặn.'],
    ['Sửa / xoá', 'Chỉ người có quyền tạo/giao việc hoặc admin thấy tab này. Dùng khi import trùng, sai owner, sai deadline, sai mã job hoặc tên việc quá dài.'],
  ];
  const howTo = [
    ['Muốn xem việc của tôi', 'Inbox công việc', 'Lọc Tất cả/Mới giao/Quá hạn, bấm Mở để thao tác.'],
    ['Muốn giao việc nhanh', 'Giao việc độc lập', 'Nhập tên việc, chọn người nhận, deadline, priority/risk, rồi bấm Giao việc.'],
    ['Muốn import nhiều việc', 'Khởi tạo kế hoạch', 'Tải template Excel, điền WBS/Công việc/Owner_ID/Deadline, upload và kiểm tra preview trước khi phân công.'],
    ['Muốn xoá việc trùng', 'Mở chi tiết công việc', 'Tab Sửa / xoá, kiểm tra đúng việc rồi bấm Xoá công việc này.'],
    ['Muốn duyệt báo cáo', 'Xác nhận / Kiểm soát', 'Mở việc chờ duyệt, đọc báo cáo/minh chứng, vào tab Duyệt / kiểm soát.'],
    ['Muốn xem ai đang quá tải', 'Workload', 'Mở từng nhân sự để xem việc đang xử lý, cần duyệt, thiếu minh chứng và điểm tải.'],
    ['Muốn xem việc đỏ', 'Dashboard công việc', 'Ưu tiên Cần GĐ xử lý, Quá hạn, Critical/High risk, Red traffic.'],
    ['Muốn kiểm tra role', 'Job / User / Org Catalog', 'Xem danh sách người dùng, roles, ownerIds và phòng ban.'],
  ];
  const scenario = [
    ['GĐ/PM giao việc', 'Tạo việc “Rà soát tài liệu/video cho buổi làm việc VNPT”, chọn owner, deadline, priority High.'],
    ['Nhân sự nhận', 'Người nhận vào Inbox, mở việc, bấm Đã nhận việc, ghi cần phối hợp ai và cách làm.'],
    ['Nhân sự báo cáo', 'Ghi “Đã rà soát xong tài liệu A/B, còn thiếu video C”, dán link folder minh chứng, bấm Gửi báo cáo.'],
    ['PM duyệt', 'PM đọc báo cáo, tick đánh giá công việc/kết quả, duyệt chuyển KSV nếu đủ.'],
    ['KSV xác nhận', 'KSV đối chiếu checklist, báo cáo và minh chứng. Đủ thì xác nhận; thiếu thì yêu cầu bổ sung nêu rõ thiếu gì.'],
  ];
  const mistakes = [
    ['Không thấy HDSD hoặc menu mới', 'Hard reload Ctrl+F5. Nếu vẫn không thấy, kiểm tra đúng production deploy và route /vplanning đang chạy native React, không phải file tĩnh legacy.'],
    ['Không thấy việc cần theo dõi', 'Kiểm tra đúng tài khoản đăng nhập, role và dữ liệu đã đồng bộ. Các role đều xem được danh sách công việc chung; Owner_ID chỉ dùng để xác định người phụ trách.'],
    ['Không thấy nút duyệt', 'Bạn cần role Trưởng bộ phận/PM hoặc KSV. Người nhận việc không có quyền duyệt.'],
    ['Không thấy tab Sửa / xoá', 'Chỉ người có quyền tạo kế hoạch/giao việc hoặc admin mới thấy để tránh xoá nhầm dữ liệu.'],
    ['Import Excel bị sai người', 'Kiểm tra Owner_ID trong Excel. Tên người không cần để trong tên công việc; phân công dựa vào Owner_ID/owner.'],
    ['Duyệt bị chặn', 'Kiểm tra báo cáo kết quả và link minh chứng. Thiếu một trong hai phần này thì cần bổ sung trước.'],
    ['Việc mới không ở trên', 'Danh sách ưu tiên Mới giao, Chờ xử lý, Quá hạn rồi mới đến việc đang làm/hoàn thành. Nếu vẫn sai, tải lại trang sau khi import.'],
    ['Không biết ghi báo cáo thế nào', 'Dùng mẫu: “Đã làm gì - Kết quả hiện tại - Minh chứng ở đâu - Cần ai hỗ trợ/ra quyết định gì”.'],
  ];
  const activeRoleGuide = roleGuides[guideRole];
  return <div className="help-page">
    <Card title="Hướng dẫn sử dụng V-Work">
      <div className="help-hero">
        <div>
          <Badge tone="b-blue">Hướng dẫn thao tác chi tiết</Badge>
          <h2>Biết mình đang ở vai trò nào, mở đúng màn hình, bấm đúng nút, ghi đúng thông tin.</h2>
          <p className="muted">Màn này dùng như sổ tay vận hành nhanh: người mới có thể đi từ nhận việc đến báo cáo; PM/KSV/GĐ có thể rà đúng nơi cần duyệt, kiểm soát và chỉ đạo.</p>
        </div>
        <div className="help-mini-screen" aria-label="Minh hoạ danh sách công việc">
          <div className="mini-top"><span></span><span></span><span></span></div>
          <div className="mini-row active"><strong>Mới giao</strong><span>Cần báo ngay</span></div>
          <div className="mini-row"><strong>Đang thực hiện</strong><span>Theo dõi</span></div>
          <div className="mini-row"><strong>Chờ duyệt</strong><span>Cần duyệt</span></div>
        </div>
      </div>
    </Card>
    <Card title="1. Chọn đúng vai trò của bạn">
      <div className="guide-role-tabs">{Object.entries(roleGuides).map(([key, item])=><button key={key} className={`guide-role-tab ${guideRole === key ? 'active' : ''}`} onClick={()=>setGuideRole(key)}><Badge tone={item.tone}>{item.label}</Badge></button>)}</div>
      <div className="guide-role-panel">
        <div>
          <Badge tone={activeRoleGuide.tone}>{activeRoleGuide.label}</Badge>
          <h3>{activeRoleGuide.goal}</h3>
        </div>
        <div className="guide-action-list">{activeRoleGuide.steps.map(([title, desc], index)=><div className="guide-action" key={title}><span>{index + 1}</span><div><strong>{title}</strong><p>{desc}</p></div></div>)}</div>
      </div>
    </Card>
    <Card title="Sơ đồ flow đơn giản">
      <div className="guide-flow">{flow.map((item, index)=><div className="guide-step" key={item[0]}>
        <div className="guide-no">{item[0]}</div>
        <strong>{item[1]}</strong>
        <p>{item[2]}</p>
        {index < flow.length - 1 && <span className="guide-arrow">→</span>}
      </div>)}</div>
    </Card>
    <Card title="2. Muốn làm gì thì vào đâu">
      <div className="table-wrap"><table><thead><tr><th>Nhu cầu</th><th>Màn hình</th><th>Cách thao tác</th></tr></thead><tbody>{howTo.map(([want, where, action])=><tr key={want}><td><strong>{want}</strong></td><td><Badge tone="b-blue">{where}</Badge></td><td>{action}</td></tr>)}</tbody></table></div>
    </Card>
    <div className="grid grid-2">
      <Card title="Khi mở chi tiết công việc">
        <div className="detail-map">
          <div className="detail-map-main">
            <div className="map-title">Tên công việc</div>
            <div className="map-tabs"><span className="active">Thực hiện</span><span>Trao đổi</span><span>Duyệt / kiểm soát</span></div>
            <div className="map-block green">Việc cần làm + checklist</div>
            <div className="map-block">Nhận việc & kế hoạch ngắn</div>
            <div className="map-block blue">Báo cáo kết quả + link minh chứng</div>
          </div>
          <div className="detail-map-side">
            <div className="map-block amber">Thông tin nhanh: hạn, ưu tiên, rủi ro</div>
            <div className="map-block">Nguồn việc</div>
            <div className="map-block">Lịch sử thao tác</div>
          </div>
        </div>
        <p className="muted">Phần bên trái là nơi thao tác chính. Cột bên phải chỉ để đọc nhanh thông tin nền, nguồn việc và lịch sử.</p>
      </Card>
      <Card title="Nên bấm gì trước?">
        <div className="help-checklist">
          <label><input type="checkbox" checked readOnly /> Việc mới giao: bấm <strong>Đã nhận việc</strong>.</label>
          <label><input type="checkbox" checked readOnly /> Có cách làm hoặc cần phối hợp: điền phần lập kế hoạch.</label>
          <label><input type="checkbox" checked readOnly /> Có kết quả: ghi báo cáo ngắn, dán link minh chứng.</label>
          <label><input type="checkbox" checked readOnly /> Việc trùng/sai: báo quản lý hoặc dùng tab <strong>Sửa / xoá</strong> nếu có quyền.</label>
        </div>
      </Card>
    </div>
    <Card title="3. Đọc từng vùng trong chi tiết công việc">
      <div className="guide-field-grid">{detailFields.map(([name, desc])=><div className="guide-field" key={name}><strong>{name}</strong><p>{desc}</p></div>)}</div>
    </Card>
    <Card title="Bản đồ các tab trong chi tiết công việc">
      <div className="guide-tab-grid">{tabs.map(([name, desc])=><div className="guide-tab-card" key={name}><Badge tone="b-green">{name}</Badge><p>{desc}</p></div>)}</div>
    </Card>
    <Card title="4. Ví dụ thực tế: chuẩn bị buổi làm việc VNPT">
      <div className="guide-scenario">{scenario.map(([title, desc], index)=><div className="scenario-step" key={title}><div className="guide-no">{index + 1}</div><div><strong>{title}</strong><p>{desc}</p></div></div>)}</div>
    </Card>
    <Card title="5. Mẫu ghi báo cáo tốt">
      <div className="report-example">
        <div><strong>Báo cáo nên ngắn nhưng đủ 4 ý</strong><p>Đã rà soát xong tài liệu A/B cho VNPT. Video C còn thiếu bản final. Minh chứng ở link đính kèm. Cần PM xác nhận phiên bản sử dụng trong buổi chiều mai.</p></div>
        <div><strong>Minh chứng nên gắn gì?</strong><p>Link folder tài liệu, file bàn giao, video, ảnh lớp, danh sách điểm danh, báo cáo sau khóa, hoặc link sản phẩm đã hoàn thành.</p></div>
      </div>
    </Card>
    <Card title="6. Lỗi thường gặp và cách xử lý">
      <div className="guide-error-list">{mistakes.map(([title, fix])=><div className="guide-error" key={title}><strong>{title}</strong><p>{fix}</p></div>)}</div>
    </Card>
  </div>;
}
function Links(){
  const rows = [['vtraining','class','delivery_scope'],['vcontent','product','learning_asset'],['vbusiness','contract','commercial_source'],['vsuite','approval_request','approval_dependency'],['vculture','survey_campaign','related_workstream'],['vcoaching','coaching_program','delivery_scope'],['vlearning','course','learning_asset']];
  return <Card title="Liên kết hệ sinh thái"><p className="muted">Bản đầu chỉ lưu tham chiếu nhẹ, không copy dữ liệu module khác.</p><table><thead><tr><th>Module</th><th>Loại nguồn</th><th>Quan hệ</th></tr></thead><tbody>{rows.map((row)=><tr key={row.join('-')}><td><Badge tone="b-blue">{row[0]}</Badge></td><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></Card>;
}
function Shell({ onSignOut }){
  const authProfile = useMemo(()=>readVPlanningAuthProfile(), []);
  const [role] = useState(()=>resolveVPlanningRole(authProfile));
  const [page, setPage] = useState(()=>isDirectorUser(resolveVPlanningUser(authProfile, resolveVPlanningRole(authProfile)), resolveVPlanningRole(authProfile)) ? 'review' : 'dashboard');
  const [tasks, setTasksBase] = useState(seedTasks);
  const [vworkSettings, setVworkSettings] = useState([]);
  const [vworkForms, setVworkFormsBase] = useState(()=>mergeVWorkForms([]));
  const [trainingSchedules, setTrainingSchedulesBase] = useState(()=>TRAINING_SCHEDULE_SEED.map((item)=>({ ...item })));
  const [notifications, setNotificationsBase] = useState([]);
  const [noticeDetailTask, setNoticeDetailTask] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [workboxTab, setWorkboxTab] = useState('todo');
  const [paymentRequestRows, setPaymentRequestRows] = useState([]);
  const [paymentRequestLoadState, setPaymentRequestLoadState] = useState('loading');
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const [recoveryInfo, setRecoveryInfo] = useState(null);
  const [, setSaveStatus] = useState('Đang tải dữ liệu...');
  const localDirtyRef = useRef(false);
  const localMutationSeqRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const suppressNextSaveRef = useRef(false);
  const lastRemoteFingerprintRef = useRef('');
  const lastRemoteUpdatedAtRef = useRef(null);
  const deletedTaskIdsRef = useRef([]);
  const recoveryPendingRef = useRef(false);
  const pendingNotificationChangesRef = useRef(null);
  const tasksRef = useRef(tasks);
  const currentUser = useMemo(()=>resolveVPlanningUser(authProfile, role), [authProfile, role]);
  const me = currentUser.name;
  const actorId = currentUser.id || authProfile.id || authProfile.userId || authProfile.email || role;
  const currentNotifications = useMemo(()=>buildVPlanningNotifications(tasks, currentUser, notifications, role), [tasks, currentUser, notifications, role]);
  useEffect(() => {
    let cancelled = false;
    setPaymentRequestLoadState('loading');
    fetchVsuitePaymentRequests()
      .then((rows)=>{
        if (cancelled) return;
        setPaymentRequestRows(Array.isArray(rows) ? rows : []);
        setPaymentRequestLoadState('loaded');
      })
      .catch(()=>{
        if (cancelled) return;
        setPaymentRequestLoadState('error');
      });
    return ()=>{ cancelled = true; };
  }, [role, currentUser.id, currentUser.email]);
  function markLocalDirty() {
    localDirtyRef.current = true;
    localMutationSeqRef.current += 1;
  }
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);
  function queueNotificationsForChanges(previousTasks, nextTasks) {
    const previousById = new Map(previousTasks.map((task)=>[String(task.id), task]));
    const incoming = [];
    nextTasks.forEach((task)=>{
      const previous = previousById.get(String(task.id));
      if (!previous) {
        notificationRecipientsForTask(task, 'assigned').forEach((toEmail)=>incoming.push(makeNotification({ task, toEmail, title:'V-Work giao việc mới', body:task.title, kind:'info', eventType:'assigned' })));
        if (isVWorkProposalRequestTask(task) && task.workProposal?.recipientOwnerId) {
          ownerEmails(task.workProposal.recipientOwnerId).forEach((toEmail)=>incoming.push(makeNotification({ task, toEmail, title:'Bạn nhận được đề xuất trong công việc', body:task.title, kind:'info', eventType:'task_proposal_received' })));
        }
        return;
      }
      const previousAdminMeta = isVWorkAdminRequest(previous) ? adminRequestMeta(previous) : null;
      const nextAdminMeta = isVWorkAdminRequest(task) ? adminRequestMeta(task) : null;
      const previousProposal = isVWorkProposalRequestTask(previous) ? proposalRequestTaskToRequest(previous) : null;
      const nextProposal = isVWorkProposalRequestTask(task) ? proposalRequestTaskToRequest(task) : null;
      const previousOpinionAt = previousAdminMeta?.opinionRequestedAt || previousProposal?.opinionRequestedAt || '';
      const nextOpinionAt = nextAdminMeta?.opinionRequestedAt || nextProposal?.opinionRequestedAt || '';
      const opinionEmail = nextAdminMeta?.opinionRequestedEmail || nextProposal?.opinionRequestedEmail || '';
      if (opinionEmail && nextOpinionAt && nextOpinionAt !== previousOpinionAt) {
        incoming.push(makeNotification({ task, toEmail:opinionEmail, title:'Bạn được đề nghị cho ý kiến', body:task.title, kind:'warning', eventType:'opinion_requested', eventKey:nextOpinionAt }));
      }
      const previousRespondedAt = previousAdminMeta?.opinionRespondedAt || previousProposal?.opinionRespondedAt || '';
      const nextRespondedAt = nextAdminMeta?.opinionRespondedAt || nextProposal?.opinionRespondedAt || '';
      if (nextRespondedAt && nextRespondedAt !== previousRespondedAt) {
        roleEmails(['vplanning_director','vplanning_admin']).forEach((toEmail)=>incoming.push(makeNotification({ task, toEmail, title:'Đã có ý kiến bổ sung', body:task.title, kind:'info', eventType:'opinion_responded', eventKey:nextRespondedAt })));
      }
      if (previous.stage !== task.stage) {
        const status = getTaskStatus(task);
        const eventType = status === 'completed' ? 'completed' : task.stage;
        const titleMap = {
          reported:'V-Work có việc chờ duyệt',
          lead_approved:'V-Work có việc chờ KSV xác nhận',
          explain_requested:'V-Work yêu cầu giải trình',
          assignment_returned:'V-Work có phản hồi tiếp nhận việc',
          completed:'V-Work đã hoàn thành việc',
        };
        const kind = status === 'completed' ? 'success' : task.stage === 'explain_requested' ? 'danger' : 'warning';
        notificationRecipientsForTask(task, eventType).forEach((toEmail)=>incoming.push(makeNotification({ task, toEmail, title:titleMap[eventType] || 'V-Work cập nhật công việc', body:task.title, kind, eventType, eventKey:eventType === 'completed' ? task.completedAt || task.updatedAt : '' })));
      }
    });
    const fresh = incoming.filter((item)=>item.toEmail);
    if (!fresh.length) return;
    setNotificationsBase((previous)=>mergeNotifications(previous, fresh));
    fresh.forEach((notice)=>{
      dispatchVPlanningEmailNotice(notice)
        .then((result)=>setNotificationsBase((previous)=>previous.map((item)=>item.id === notice.id ? {...item, emailStatus:result?.deliveries?.[0]?.status || result?.status || 'sent'} : item)))
        .catch((error)=>setNotificationsBase((previous)=>previous.map((item)=>item.id === notice.id ? {...item, emailStatus:'skipped', emailError:String(error.message || error)} : item)));
    });
  }
  function markNotificationRead(notificationId) {
    markLocalDirty();
    setNotificationsBase((previous)=>mergeNotifications(previous, currentNotifications).map((item)=>item.id === notificationId ? {...item, read:true} : item));
  }
  function openNotification(notification) {
    markNotificationRead(notification.id);
    const taskId = String(notification.metadata?.taskId || notification.entityId || '');
    const task = tasks.find((item)=>String(item.id) === taskId);
    if (task) {
      if (isVWorkAdminRequest(task) || isVWorkProposalRequestTask(task)) {
        setNoticeDetailTask(null);
        setPage('review');
        return;
      }
      setNoticeDetailTask(task);
      return;
    }
    setPage('inbox');
  }
  function markAllNotificationsRead() {
    markLocalDirty();
    setNotificationsBase((previous)=>mergeNotifications(previous, currentNotifications).map((item)=>({...item, read:true})));
  }
  const setTasks = (next) => {
    setTasksBase((previous)=> {
      const nextTasks = typeof next === 'function' ? next(previous) : next;
      const cleanTasks = stampChangedTasks(previous, sanitizeVWorkState({ tasks: nextTasks }).tasks, currentUser);
      const nextIds = new Set(cleanTasks.map((task)=>String(task.id)));
      const removedIds = previous.map((task)=>String(task.id)).filter((id)=>!nextIds.has(id));
      const restoredIds = new Set(cleanTasks.map((task)=>String(task.id)));
      deletedTaskIdsRef.current = normalizeDeletedTaskIds([
        ...deletedTaskIdsRef.current.filter((id)=>!restoredIds.has(String(id))),
        ...removedIds,
      ]);
      markLocalDirty();
      pendingNotificationChangesRef.current = { previousTasks:previous, nextTasks:cleanTasks };
      return cleanTasks;
    });
  };
  useEffect(()=> {
    const pending = pendingNotificationChangesRef.current;
    if (!pending) return;
    pendingNotificationChangesRef.current = null;
    queueNotificationsForChanges(pending.previousTasks, pending.nextTasks);
  }, [tasks]);
  const setVworkForms = (next) => {
    setVworkFormsBase((previous)=>{
      const nextForms = typeof next === 'function' ? next(previous) : next;
      markLocalDirty();
      return mergeVWorkForms(nextForms);
    });
  };
  const setVworkSettingsDirty = (next) => {
    markLocalDirty();
    setVworkSettings(next);
  };
  const setTrainingSchedules = (next) => {
    markLocalDirty();
    setTrainingSchedulesBase((previous)=>normalizeTrainingSchedules(typeof next === 'function' ? next(previous) : next));
  };
  const allLinks = [
    { key:'dashboard', label:'Tổng quan', icon:'▦', action:'view_self' },
    { key:'independent', label:'Tạo việc', icon:'＋', action:'create_plan' },
    { key:'workbox', label:'Việc của tôi', icon:'☞', action:'view_self' },
    { key:'requests', label:'Đề nghị', icon:'▱', action:'view_self' },
    { key:'proposals', label:'Đề xuất', icon:'◇', action:'view_self' },
    { key:'briefing', label:'Giao ban', icon:'▤', action:'view_workload' },
    { key:'review', label:'Cần duyệt', icon:'📥', action:'review_queue' },
    { key:'monitor', label:'Giám sát', icon:'🚩', action:'view_workload' },
    { key:'evaluate', label:'Đánh giá', icon:'⭐', action:'review_queue' },
    { key:'trainingOperations', label:'Vận hành đào tạo', icon:'▦', action:'view_self', href:'/vwork/training-operations', hidden:!ENABLE_TRAINING_OPERATIONS },
    { key:'trainingSchedule', label:'Lịch đào tạo', icon:'▦', action:'view_self' },
    { key:'vworkSettings', label:'Cài đặt', icon:'⚙', action:'update_catalog' },
    { key:'forms', label:'Form công việc', icon:'', action:'manage_forms', hidden:true },
    { key:'guide', label:'HDSD V-Work', icon:'', action:'view_self', hidden:true },
  ];
  const localReviewTasks = getReviewTasks(tasks, role, currentUser);
  const workReviewCount = localReviewTasks.filter((task)=>!isVWorkAdminRequest(task) && !isVWorkProposalRequestTask(task)).length;
  const requestReviewCount = getVWorkAdminRequestReviewTasks(tasks, paymentRequestRows, paymentRequestLoadState === 'loaded', role, currentUser).length;
  const proposalReviewCount = getVWorkProposalReviewRequests(tasks, currentUser).length;
  const reviewQueueCount = workReviewCount + requestReviewCount + proposalReviewCount;
  const links = allLinks.filter((item, index, list)=> item.sec || can(role, item.action) || (item.key === 'independent' && can(role, 'import_excel')) || (item.key === 'review' && (can(role, 'approve_team') || can(role, 'control_review') || reviewQueueCount > 0)) || (item.key === 'evaluate' && (can(role, 'approve_team') || can(role, 'control_review') || can(role, 'view_enterprise'))) || item.key === 'dashboard' || item.key === 'workbox' || item.key === 'proposals' || item.key === 'requests' || item.key === 'trainingOperations' || item.key === 'trainingSchedule' || item.key === 'guide').filter((item, index, list)=> !item.sec || list.slice(index + 1).some((next)=>!next.sec)).filter((item)=>!(isDirectorUser(currentUser, role) && ['proposals','requests'].includes(item.key)));
  const navBadgeFor = (key) => {
    if (key === 'review') return reviewQueueCount;
    if (key === 'monitor') return tasks.filter((task)=>managementSignal(task).level === 'danger').length;
    if (key === 'evaluate') return tasks.filter((task)=>isVWorkEvaluationCandidate(task) && !isVWorkEvaluationPassed(task)).length;
    if (key === 'workbox') return getOwnTasks(tasks, me, currentUser).length;
    return 0;
  };
  const linkKeys = links.map((item)=>item.key).join('|');
  useEffect(() => {
    if (!linkKeys.split('|').includes(page)) setPage('dashboard');
  }, [linkKeys, page]);
  useEffect(() => {
    let toastTimer;
    const onToast = (event) => {
      const detail = event.detail || {};
      setToast({ id:detail.id || Date.now(), message:detail.message || '', tone:detail.tone || 'success' });
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(()=>setToast(null), 3200);
    };
    window.addEventListener('vwork-toast', onToast);
    return () => {
      window.clearTimeout(toastTimer);
      window.removeEventListener('vwork-toast', onToast);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function loadState() {
      try {
        const remoteResult = await fetchVPlanningState();
        const remoteState = remoteResult.state;
        if (cancelled) return;
        if (isUsableVPlanningState(remoteState)) {
          const cleanState = sanitizeVWorkState(remoteState);
          const remoteDeletedTaskIds = normalizeDeletedTaskIds(remoteState.deletedTaskIds);
          const localState = readJsonStorage(LOCAL_STATE_KEY);
          const localTasks = isUsableVPlanningState(localState) ? sanitizeVWorkState(localState).tasks : [];
          // A successful remote load is authoritative. Merging stale local tombstones here can
          // hide valid work owned by other people after a bulk cleanup on another session.
          const effectiveDeletedTaskIds = remoteDeletedTaskIds;
          const hasRecoveryCandidate = isSuspiciousTaskReduction(localTasks, cleanState.tasks, effectiveDeletedTaskIds);
          const reconciledTasks = hasRecoveryCandidate
            ? recoverCachedTasks(localTasks, cleanState.tasks, effectiveDeletedTaskIds)
            : reconcileRemoteTasks(localTasks, cleanState.tasks, effectiveDeletedTaskIds);
          suppressNextSaveRef.current = true;
          lastRemoteFingerprintRef.current = stateFingerprint(cleanState);
          lastRemoteUpdatedAtRef.current = remoteResult.updatedAt;
          deletedTaskIdsRef.current = effectiveDeletedTaskIds;
          setTasksBase(reconciledTasks);
          setRecoveryInfo(hasRecoveryCandidate ? {
            cachedCount:localTasks.length,
            serverCount:cleanState.tasks.length,
            mergedCount:reconciledTasks.length,
            recoveredCount:Math.max(0, reconciledTasks.length - cleanState.tasks.length),
            status:'ready',
          } : null);
          setNotificationsBase(cleanState.notifications);
          setVworkSettings(Array.isArray(remoteState.vworkSettings) ? remoteState.vworkSettings : []);
          setVworkFormsBase(mergeVWorkForms(remoteState.vworkForms));
          setTrainingSchedulesBase(trainingSchedulesFromState(remoteState));
          setSaveStatus('Đã tải dữ liệu thật từ Supabase');
        } else {
          const localState = readJsonStorage(LOCAL_STATE_KEY);
          if (isUsableVPlanningState(localState)) {
            const cleanState = sanitizeVWorkState(localState);
            suppressNextSaveRef.current = true;
            setTasksBase(cleanState.tasks);
            setNotificationsBase(cleanState.notifications);
            setVworkSettings(Array.isArray(localState.vworkSettings) ? localState.vworkSettings : []);
            setVworkFormsBase(mergeVWorkForms(localState.vworkForms));
            setTrainingSchedulesBase(trainingSchedulesFromState(localState));
            setSaveStatus('Đang dùng bản lưu cục bộ, sẽ đồng bộ khi có thay đổi');
          } else {
            setSaveStatus(remoteState?.tasks ? 'Đã phát hiện dữ liệu lỗi tiếng Việt, đang phục hồi từ dữ liệu sạch' : 'Đang dùng dữ liệu khởi tạo, sẽ lưu khi có thay đổi');
          }
        }
      } catch (error) {
        if (cancelled) return;
        const localState = readJsonStorage(LOCAL_STATE_KEY);
        if (isUsableVPlanningState(localState)) {
          const cleanState = sanitizeVWorkState(localState);
          suppressNextSaveRef.current = true;
          setTasksBase(cleanState.tasks);
          setNotificationsBase(cleanState.notifications);
          setVworkSettings(Array.isArray(localState.vworkSettings) ? localState.vworkSettings : []);
          setVworkFormsBase(mergeVWorkForms(localState.vworkForms));
          setTrainingSchedulesBase(trainingSchedulesFromState(localState));
          setSaveStatus(`Đã tải bản lưu cục bộ; API chưa sẵn sàng: ${error.message}`);
        } else {
          setSaveStatus(`API chưa sẵn sàng: ${error.message}`);
        }
      } finally {
        if (!cancelled) setHasLoadedState(true);
      }
    }
    loadState();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!hasLoadedState) return undefined;
    let cancelled = false;
    const refreshRemoteState = async () => {
      if (localDirtyRef.current || saveInFlightRef.current) return;
      try {
        const remoteResult = await fetchVPlanningState();
        const remoteState = remoteResult.state;
        if (cancelled || !isUsableVPlanningState(remoteState)) return;
        const cleanState = sanitizeVWorkState(remoteState);
        const remoteDeletedTaskIds = normalizeDeletedTaskIds(remoteState.deletedTaskIds);
        const reconciledTasks = reconcileRemoteTasks(tasksRef.current, cleanState.tasks, remoteDeletedTaskIds);
        const guardedReduction = shouldKeepLocalTasksWhenRemoteShrinks(tasksRef.current, cleanState.tasks, remoteDeletedTaskIds);
        const fingerprint = stateFingerprint(cleanState);
        const currentTasksFingerprint = stateFingerprint({ tasks:tasksRef.current });
        const reconciledTasksFingerprint = stateFingerprint({ tasks:reconciledTasks });
        if (fingerprint === lastRemoteFingerprintRef.current && currentTasksFingerprint === reconciledTasksFingerprint) return;
        lastRemoteFingerprintRef.current = fingerprint;
        lastRemoteUpdatedAtRef.current = remoteResult.updatedAt;
        deletedTaskIdsRef.current = remoteDeletedTaskIds;
        suppressNextSaveRef.current = true;
        setTasksBase(reconciledTasks);
        setNotificationsBase((previous)=>mergeReadState(previous, cleanState.notifications));
        setVworkSettings(Array.isArray(remoteState.vworkSettings) ? remoteState.vworkSettings : []);
        setVworkFormsBase(mergeVWorkForms(remoteState.vworkForms));
        setTrainingSchedulesBase(trainingSchedulesFromState(remoteState));
        setSaveStatus(guardedReduction
          ? `Đã giữ ${reconciledTasks.length - cleanState.tasks.length} việc chưa có xác nhận xóa; đồng bộ cập nhật lúc ${new Date().toLocaleTimeString('vi-VN')}`
          : `Đã đồng bộ dữ liệu thật lúc ${new Date().toLocaleTimeString('vi-VN')}`);
      } catch (error) {
        if (!cancelled) setSaveStatus((previous)=>previous.includes('Đã lưu') ? previous : `Chưa đồng bộ được dữ liệu mới: ${error.message}`);
      }
    };
    const timer = window.setInterval(refreshRemoteState, 10000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [hasLoadedState]);
  useEffect(() => {
    if (!hasLoadedState) return undefined;
    if (suppressNextSaveRef.current) {
      suppressNextSaveRef.current = false;
      return undefined;
    }
    if (!localDirtyRef.current) return undefined;
    if (containsVPlanningTextEncodingError(tasks)) {
      setSaveStatus('Dữ liệu có lỗi tiếng Việt nên chưa lưu; vui lòng tải lại để phục hồi dữ liệu sạch');
      return undefined;
    }
    setSaveStatus('Đang lưu...');
    const timer = window.setTimeout(async () => {
      const state = buildVPlanningState(tasks, currentUser, currentNotifications, vworkSettings, vworkForms, trainingSchedules, deletedTaskIdsRef.current);
      const saveSeq = localMutationSeqRef.current;
      writeJsonStorage(LOCAL_STATE_KEY, state);
      try {
        saveInFlightRef.current = true;
        const result = await persistVPlanningState(state, actorId, lastRemoteUpdatedAtRef.current, deletedTaskIdsRef.current);
        if (localMutationSeqRef.current === saveSeq) localDirtyRef.current = false;
        lastRemoteFingerprintRef.current = stateFingerprint(state);
        lastRemoteUpdatedAtRef.current = result.updatedAt || lastRemoteUpdatedAtRef.current;
        setSaveStatus(`Đã lưu dữ liệu thật${result.updatedAt ? ` lúc ${new Date(result.updatedAt).toLocaleString('vi-VN')}` : ''}`);
        if (recoveryPendingRef.current) {
          recoveryPendingRef.current = false;
          setRecoveryInfo(null);
          notifyVWork(`Đã khôi phục ${state.tasks.length} việc V-Work lên máy chủ.`);
        }
      } catch (error) {
        setSaveStatus(`Đã lưu cục bộ; chưa đồng bộ API: ${error.message}`);
        if (recoveryPendingRef.current) {
          recoveryPendingRef.current = false;
          setRecoveryInfo((previous)=>previous ? { ...previous, status:'error', error:error.message } : previous);
          notifyVWork(`Chưa thể khôi phục: ${error.message}`, 'error');
        }
      } finally {
        saveInFlightRef.current = false;
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [tasks, actorId, hasLoadedState, currentUser, currentNotifications, vworkSettings, vworkForms, trainingSchedules]);
  const patchNoticeTask = (id, data) => setTasks((previous)=>previous.map((task)=>task.id === id ? {...task, ...data} : task));
  const ownTasks = getOwnTasks(tasks, me, currentUser);
  const vworkShellMobileTabs = [
    { key:'todo', label:'Tiếp nhận công việc', page:'workbox', workboxTab:'todo', count:ownTasks.filter((task)=>vworkTaskBucket(task)==='todo').length },
    { key:'doing', label:'Đang làm', page:'workbox', workboxTab:'doing', count:ownTasks.filter((task)=>vworkTaskBucket(task)==='doing').length },
    { key:'work-review', label:'Chờ duyệt', page:'workbox', workboxTab:'review', count:ownTasks.filter((task)=>vworkTaskBucket(task)==='review').length },
    { key:'done', label:'Hoàn thành', page:'workbox', workboxTab:'done', count:ownTasks.filter((task)=>vworkTaskBucket(task)==='done').length },
    isDirectorUser(currentUser, role)
      ? { key:'review', label:'Cần duyệt', page:'review', count:reviewQueueCount }
      : { key:'proposals', label:'Đề xuất', page:'proposals', count:tasks.filter((task)=>isVWorkProposalRequestTask(task)).length },
    ...(!isDirectorUser(currentUser, role)
      ? [{ key:'requests', label:'Đề nghị', page:'requests', count:tasks.filter((task)=>isVWorkAdminRequest(task)).length }]
      : []),
  ];
  function selectMobileWorkTab(item) {
    if (item.workboxTab) setWorkboxTab(item.workboxTab);
    setPage(item.page);
  }
  function downloadRecoverySnapshot() {
    const state = buildVPlanningState(tasks, currentUser, currentNotifications, vworkSettings, vworkForms, trainingSchedules, deletedTaskIdsRef.current);
    const blob = new Blob([JSON.stringify({ exportedAt:new Date().toISOString(), source:'vwork_local_recovery', recoveryInfo, state }, null, 2)], { type:'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vwork-recovery-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  function confirmLocalRecovery() {
    recoveryPendingRef.current = true;
    setRecoveryInfo((previous)=>previous ? { ...previous, status:'saving', error:'' } : previous);
    setTasks((current)=>[...current]);
  }
  return <div className={`vplanning-native shell page-${page}`}><aside className="sidebar"><div className="brand"><div className="mark"><span className="mark-desktop">V</span><span className="mark-mobile">VW</span></div><div className="brand-title"><strong>V-Work</strong><small>Bảng điều hành</small></div><div className="vwork-mobile-brand-actions"><NotificationBell notifications={currentNotifications} onOpen={openNotification} onReadAll={markAllNotificationsRead} /><span className="vwork-mobile-avatar">{getInitials(currentUser.name || currentUser.email || 'HL') || 'HL'}</span><button type="button" className="vwork-account-logout" onClick={()=>void onSignOut?.()} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={15} /></button></div></div><nav>{links.filter((item)=>!item.hidden).map((item)=><button key={item.key} className={`nav-btn ${page===item.key?'active':''}`} onClick={()=>item.href ? window.location.assign(item.href) : setPage(item.key)}><span><i>{item.icon}</i>{item.label}</span>{navBadgeFor(item.key) ? <b>{navBadgeFor(item.key)}</b> : null}</button>)}</nav><div className="vwork-shell-mobile-tabs">{vworkShellMobileTabs.map((item)=><button key={item.key} type="button" className={(page === item.page && (!item.workboxTab || workboxTab === item.workboxTab)) ? 'active' : ''} onClick={()=>selectMobileWorkTab(item)}>{item.label}<b>{item.count}</b></button>)}</div><div className="sidebar-user"><span>{getInitials(currentUser.name || currentUser.email || 'HL') || 'HL'}</span><div><strong>{currentUser.name || currentUser.email || 'V-Work'}</strong><small>{currentUser.title || ROLES[role] || 'Giám đốc'}</small></div><button type="button" className="vwork-account-logout" onClick={()=>void onSignOut?.()} aria-label="Đăng xuất" title="Đăng xuất"><LogOut size={16} /></button></div></aside><div className="main"><header className="topbar"><div><strong>{page === 'briefing' ? 'Chuẩn bị giao ban' : links.find((item)=>item.key===page)?.label || 'V-Work'}</strong></div><div className="topbar-spacer" /><label className="vwork-search"><span>⌕</span><input value={searchQuery} onChange={(event)=>setSearchQuery(event.target.value)} placeholder="Tìm việc, đề xuất, đề nghị..." /></label><div className="row"><NotificationBell notifications={currentNotifications} onOpen={openNotification} onReadAll={markAllNotificationsRead} /></div></header><main className="content">
    {recoveryInfo && <div className="soft-box" style={{marginBottom:16,borderColor:'var(--amber)'}}><div className="row" style={{justifyContent:'space-between',alignItems:'center'}}><div><strong>Phát hiện bản phục hồi V-Work trên máy này</strong><p className="muted" style={{margin:'6px 0 0'}}>Cache có {recoveryInfo.cachedCount} việc, máy chủ có {recoveryInfo.serverCount} việc; bản hợp nhất giữ {recoveryInfo.mergedCount} việc. Hãy tải JSON dự phòng trước khi khôi phục.</p>{recoveryInfo.error && <p style={{color:'var(--red)',margin:'6px 0 0'}}>{recoveryInfo.error}</p>}</div><div className="row"><button className="btn" type="button" onClick={downloadRecoverySnapshot}>Tải JSON dự phòng</button><button className="btn btn-primary" type="button" disabled={recoveryInfo.status==='saving'} onClick={confirmLocalRecovery}>{recoveryInfo.status==='saving' ? 'Đang khôi phục...' : `Khôi phục ${recoveryInfo.recoveredCount} việc`}</button></div></div></div>}
    {page==='dashboard' && <VWorkHome tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} setPage={setPage} />}
    {page==='enterprise' && <EnterpriseCommandCenter tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='independent' && <IndependentTask tasks={tasks} setTasks={setTasks} role={role} currentUser={currentUser} settings={vworkSettings} setSettings={setVworkSettingsDirty} />}
    {page==='inbox' && <Inbox tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='review' && <Review tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} setPage={setPage} paymentRequestRows={paymentRequestRows} paymentRequestLoadState={paymentRequestLoadState} onPaymentRequestsLoaded={(rows)=>{ setPaymentRequestRows(rows); setPaymentRequestLoadState('loaded'); }} />}
    {page==='workbox' && <VWorkBox tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} searchQuery={searchQuery} activeTab={workboxTab} onTabChange={setWorkboxTab} />}
    {page==='proposals' && <VWorkAdminRequestDesk tasks={tasks} setTasks={setTasks} role={role} currentUser={currentUser} mode="proposal" />}
    {page==='requests' && <VWorkAdminRequestDesk tasks={tasks} setTasks={setTasks} role={role} currentUser={currentUser} mode="request" />}
    {page==='monitor' && <VWorkMonitor tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='evaluate' && <VWorkEvaluate tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='briefing' && <VWorkBriefing tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='trainingSchedule' && <VWorkTrainingSchedule records={trainingSchedules} setRecords={setTrainingSchedules} canEdit currentUser={currentUser} />}
    {page==='forms' && <VWorkForms forms={vworkForms} setForms={setVworkForms} currentUser={currentUser} />}
    {page==='vworkSettings' && <VWorkSettings tasks={tasks} settings={vworkSettings} setSettings={setVworkSettingsDirty} />}
    {page==='workload' && <Workload tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='weekly' && <WeeklyAssessment tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='monthly' && <Monthly tasks={tasks} role={role} me={me} currentUser={currentUser} />}
    {page==='process2406' && <Process2406 tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='projects' && <Projects tasks={tasks} setTasks={setTasks} role={role} me={me} currentUser={currentUser} />}
    {page==='quality' && <Quality />}
    {page==='acceptance' && <Acceptance />}
    {page==='guide' && <HelpGuide />}
    {page==='catalog' && <Catalog />}
    {page==='links' && <Links />}
  </main></div>{toast && <div className={`vwork-toast ${toast.tone}`} role="status">{toast.message}</div>}{noticeDetailTask && <TaskDetail task={tasks.find((task)=>task.id===noticeDetailTask.id) || noticeDetailTask} role={role} me={me} currentUser={currentUser} onClose={()=>setNoticeDetailTask(null)} onPatch={patchNoticeTask} onDelete={(id)=>{ setTasks((previous)=>previous.filter((task)=>task.id !== id)); setNoticeDetailTask(null); }} />}</div>;
}


export default function VPlanningNativePage({ onSignOut }) {
  return <Shell onSignOut={onSignOut} />;
}

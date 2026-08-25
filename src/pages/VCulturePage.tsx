import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Navigate, useLocation } from 'react-router-dom';
import { BookOpen, Check, Download, ExternalLink, FileUp, Pencil, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getAllowedPages, normalizeAppRole } from '@/data/vcontent';
import { supabase } from '@/lib/supabaseClient';
import { filterActiveVcoachingMaterials, removeVcoachingMaterial, replaceVcoachingMaterial } from '@/lib/vcoachingMaterials';
import {
  buildVcoachingExportRows,
  exportVcoachingWorkflowWorkbook,
  summarizeVcoachingState,
  type VcoachingWorkflowState,
} from '@/lib/vcoachingWorkflow';

type UploadedMaterial = {
  id: string;
  name: string;
  size: number;
  type: string;
  chapter: string;
  session: string;
  group: string;
  owner: string;
  uploadedAt: string;
  bucket: string;
  path: string;
  deletedAt?: string | null;
};

type PortalMaterial = {
  id: string;
  title: string;
  scope: string;
  tag: string;
};

type FocusTask = {
  key: string;
  label: string;
  owner?: string;
};

type FocusTaskPhase = {
  id: string;
  title: string;
  tag: string;
  tasks: FocusTask[];
};

const VCULTURE_MATERIALS_BUCKET = 'vculture-materials';
const VCULTURE_MATERIALS_TABLE = 'vcontent_vculture_materials';
const VCULTURE_CONTENT_TABLE = 'vcontent_vculture_content_overrides';
const VCULTURE_FOCUS_TASK_TABLE = 'vcontent_vculture_focus_task_statuses';
const VCULTURE_PORTAL_HTML_URL = '/vculture/vculture-original.html';

const DEFAULT_MATERIALS: UploadedMaterial[] = [];
const EMPTY_VCOACHING_STATE: VcoachingWorkflowState & { profiles?: VcoachingProfileOption[] } = {
  assignments: [],
  materialReads: [],
  preworks: [],
  reviews: [],
  actionPlans: [],
  profiles: [],
};

type VcoachingProfileOption = {
  id: string;
  email: string;
  fullName: string;
  role: string;
};

const PORTAL_MATERIALS: PortalMaterial[] = [
  { id: 'chuong1', title: 'Chương 1 — Khung tổng thể VNPT Rising', scope: 'Bối cảnh, HEART, Nhân-Quả, 5 mắt xích, 3 tầng', tag: 'Bắt buộc' },
  { id: 'chuong2', title: 'Chương 2 — Phương thức dẫn dắt Ban TGĐ', scope: '5L La Bàn, 4 Đòn bẩy, 3 Không, kiến trúc sư văn hóa', tag: 'Bắt buộc' },
  { id: 'chuong4', title: 'Chương 4 — Triển khai & Vượt lực cản', scope: 'Lộ trình 3 giai đoạn, cascade, lực cản chuyển đổi', tag: 'Nên đọc' },
  { id: 'chuong5', title: 'Chương 5 — Kế hoạch hành động Ban TGĐ', scope: 'CTHĐ, template 9 cấu phần, phối hợp liên mảng', tag: 'Nên đọc' },
  { id: 'chuong6', title: 'Chương 6 — Khung vận hành & Bộ công cụ', scope: 'VNRS01-05, VCI dashboard, GROW coaching, thông điệp 3 tầng', tag: 'Công cụ' },
  { id: 'phu-luc', title: 'Phụ lục — 5 Mắt xích Nhân-Quả chi tiết', scope: 'MX1-MX5 theo 6 lớp, đọc theo mảng phụ trách', tag: 'Tham khảo' },
  { id: 'cthd-long', title: 'CTHĐ mẫu — PTGĐ Dương Thành Long', scope: 'Ví dụ kế hoạch hành động cá nhân với KPI và RACI', tag: 'Mẫu' },
];
const DEFAULT_SELECTED_PORTAL_MATERIALS = ['chuong1', 'chuong2', 'phu-luc'];
const FOCUS_TASK_PHASES: FocusTaskPhase[] = [
  {
    id: 'ws1-facilitator',
    title: 'Chuẩn bị kỹ cho giảng viên thực hiện WS1a, WS1b',
    tag: 'Workshop - Giảng viên',
    tasks: [
      { key: 'a', label: 'Chuẩn bị giáo án, tài liệu hướng dẫn cho giảng viên', owner: 'GĐ soạn' },
      { key: 'b', label: 'Đưa lên phần mềm V-Training' },
      { key: 'c', label: 'Liên hệ chốt giảng viên và ToT cho giảng viên trước' },
      { key: 'd', label: 'Chốt lịch dự kiến với khách hàng và giảng viên' },
      { key: 'e', label: 'Rà soát thông tin dữ liệu từ các Ban được thu thập và cập nhật lên V-Training' },
      { key: 'f', label: 'Rà soát thông tin dữ liệu từ các đơn vị được thu thập và cập nhật lên V-Training' },
      { key: 'h', label: 'Ghi chép thông tin các phiên để chỉnh sửa, góp ý các KHHĐ của các PTGĐ' },
    ],
  },
  {
    id: 'ws0-coaching',
    title: 'Chuẩn bị hỗ trợ cho WS0 Coaching',
    tag: 'Coaching - Giám đốc',
    tasks: [
      { key: 'a', label: 'Chuẩn bị trang web' },
      { key: 'b', label: 'Đưa quy trình coaching từng phiên TGĐ và PTGĐ lên web' },
      { key: 'c', label: 'Chỉnh sửa, góp ý các KHHĐ của các PTGĐ' },
      { key: 'd', label: 'Video PeopleOne Rising Leadership Model' },
      { key: 'e', label: 'Video phân tích VNPT Rising và dẫn dắt của Ban TGĐ' },
    ],
  },
  {
    id: 'ws1-level-3',
    title: 'Chương trình WS1 - dành cho quản lý cấp 3',
    tag: 'Đào tạo - Quản lý cấp 3',
    tasks: [
      { key: 'a', label: 'Giảng viên: dự kiến Giám đốc PeopleOne dạy khoảng 5 lớp' },
      { key: 'b', label: 'Chuẩn bị giáo án và nội dung cho giảng viên' },
    ],
  },
  {
    id: 'dt1',
    title: 'Chương trình ĐT1',
    tag: 'Đào tạo',
    tasks: [
      { key: 'pending', label: 'Nội dung chi tiết đang chờ bổ sung / xác định' },
    ],
  },
];

const LABEL_OVERRIDES: Record<string, string> = {
  dashboard: 'Dashboard tổng quan',
  'docs-van-hoa': 'Tài liệu nền tảng Vinabrain',
  'ws0-overview': 'WS0 - Tổng quan 8 phiên',
  'ws0-phien1': 'Phiên 1 - Mở đầu hành trình',
  'ws0-phien2': 'Phiên 2 - Lãnh đạo nền tảng',
  'ws0-phien3': 'Phiên 3 - Dẫn dắt vận hành',
  'ws0-phien4': 'Phiên 4 - Trải nghiệm con người',
  'ws0-phien5': 'Phiên 5 - Đột phá học liệu',
  'ws0-phien6': 'Phiên 6 - Dữ liệu và đo lường',
  'ws0-phien7': 'Phiên 7 - Đúc kết chiến lược',
  'ws0-phien8': 'Phiên 8 - Cao điểm Ban điều hành',
  'ws0-members': 'Hồ sơ thành viên Ban điều hành',
  'ws0-prework': 'Pre-work & Form bổ sung thông tin',
  'ws1a-overview': 'WS1a - Ban chức năng',
  'ws1a-nhom-a': 'Nhóm A - Nhân sự & Văn hóa',
  'ws1a-nhom-b': 'Nhóm B - Vận hành & Đo lường',
  'ws1a-nhom-c': 'Nhóm C - Kinh doanh & Công nghệ',
  'ws1a-prework': 'WS1a - Form chuẩn bị trước phiên',
  'ws1b-overview': 'WS1b - Đơn vị thành viên',
  'ws1b-tct': 'WS1b - Cụm đơn vị triển khai',
  'ws1b-ttp': 'WS1b - Cụm trọng điểm',
  'ws1b-prework': 'WS1b - Form chuẩn bị trước phiên',
  chuong1: 'Chương 1 - Khung tổng thể Vinabrain',
  chuong2: 'Chương 2 - Phương thức dẫn dắt',
  'phu-luc': 'Phụ lục - Mắt xích nhân quả',
  chuong4: 'Chương 4 - Triển khai & vượt lực cản',
  chuong5: 'Chương 5 - Kế hoạch hành động',
  chuong6: 'Chương 6 - Khung vận hành & công cụ',
  'cthd-long': 'CTHĐ mẫu - Dữ liệu và đo lường',
};

function extractPortal(portalHtml: string) {
  const style = portalHtml.match(/<style>([\s\S]*?)<\/style>/i)?.[1] || '';
  const body = portalHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || portalHtml;
  return {
    style: `${style}\n${PORTAL_PATCH_CSS}`,
    body: injectReactSlots(brandForVinabrain(body.replace(/<script[\s\S]*?<\/script>/gi, '')))
      .replace('<div class="sb-item" id="nav-dashboard"', '<div class="sb-item act" id="nav-dashboard"')
      .replace('<div class="screen" id="s-dashboard"', '<div class="screen act" id="s-dashboard"'),
  };
}

function injectReactSlots(input: string) {
  const libraryPanel = '<div class="vc-doc-tools-panel" data-slot-kind="library"><div><strong>Quản lý tài liệu đọc trước</strong><span>Chọn tài liệu có sẵn trong module Tài liệu VNPT Rising hoặc upload file bổ sung.</span></div><div class="vc-doc-tools-actions"><button class="btn btn-gh btn-sm" type="button" data-toggle-doc-picker="true">📚 Chọn tài liệu có sẵn</button><label class="btn btn-pr btn-sm vc-transfer-button">📎 Upload tài liệu<input class="vc-native-upload-input" multiple type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" style="display:none"></label></div><div class="vc-doc-picker"><label><input type="checkbox" checked data-doc-id="chuong1"> Chương 1 — Khung tổng thể VNPT Rising</label><label><input type="checkbox" checked data-doc-id="chuong2"> Chương 2 — Phương thức dẫn dắt Ban TGĐ</label><label><input type="checkbox" checked data-doc-id="phu-luc"> Phụ lục — 5 Mắt xích Nhân-Quả chi tiết</label><label><input type="checkbox" data-doc-id="chuong5"> Chương 5 — Kế hoạch hành động Ban TGĐ</label><label><input type="checkbox" data-doc-id="cthd-long"> CTHĐ mẫu — PTGĐ Dương Thành Long</label></div></div><div class="vculture-materials-react-slot" data-slot-kind="library"></div>';
  const sessionPanel = '<div class="vc-doc-tools-panel" data-slot-kind="session"><div><strong>Quản lý tài liệu đọc trước phiên</strong><span>Coach chọn tài liệu có sẵn trong module Tài liệu VNPT Rising hoặc upload PDF/DOCX/PPTX riêng cho phiên này.</span></div><div class="vc-doc-tools-actions"><button class="btn btn-gh btn-sm" type="button" data-toggle-doc-picker="true">📚 Chọn tài liệu có sẵn</button><label class="btn btn-pr btn-sm vc-transfer-button">📎 Upload tài liệu<input class="vc-native-upload-input" multiple type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" style="display:none"></label></div><div class="vc-doc-picker"><label><input type="checkbox" checked data-doc-id="chuong1"> Chương 1 — Khung tổng thể VNPT Rising</label><label><input type="checkbox" checked data-doc-id="chuong2"> Chương 2 — Phương thức dẫn dắt Ban TGĐ</label><label><input type="checkbox" checked data-doc-id="phu-luc"> Phụ lục — 5 Mắt xích Nhân-Quả chi tiết</label><label><input type="checkbox" data-doc-id="chuong5"> Chương 5 — Kế hoạch hành động Ban TGĐ</label><label><input type="checkbox" data-doc-id="cthd-long"> CTHĐ mẫu — PTGĐ Dương Thành Long</label></div></div><div class="vculture-materials-react-slot" data-slot-kind="session"></div>';
  return input
    .replace(
      /(<div class="screen" id="s-docs-van-hoa"[\s\S]*?<div class="alert[^"]*"[^>]*>[\s\S]*?<\/div>)/,
      `$1${libraryPanel}`,
    )
    .replace(
      /(<div id="t-doc-[^"]+"[^>]*>\s*<div class="alert[^"]*"[^>]*>[\s\S]*?<\/div>)/g,
      `$1${sessionPanel}`,
    )
    .replace(
      /(<div id="pw-read"[^>]*>\s*<div class="alert[^"]*"[^>]*>[\s\S]*?<\/div>)/g,
      `$1${sessionPanel}`,
    );
}

function brandForVinabrain(input: string) {
  return input
    .replace(/PeopleOne\s*(?:\u00d7|x)\s*VNPT/g, 'Vinabrain')
    .replace(/PeopleOne Coach/g, 'Vinabrain Coach')
    .replace(/PeopleOne/g, 'Vinabrain')
    .replace(/>VR</g, '>VB<')
    .replace(/PPO/g, 'VB');
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isAllowedMaterial(file: File) {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];
  return allowed.includes(file.type) || /\.(pdf|doc|docx|ppt|pptx)$/i.test(file.name);
}

function sanitizeStorageSegment(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function mapMaterialRow(row: any): UploadedMaterial {
  return {
    id: String(row.id),
    name: String(row.file_name || ''),
    size: Number(row.file_size || 0),
    type: String(row.content_type || 'application/octet-stream'),
    chapter: String(row.chapter || ''),
    session: String(row.session_label || ''),
    group: String(row.coachee_group || ''),
    owner: String(row.owner_name || 'Vinabrain user'),
    uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).toLocaleString('vi-VN') : '-',
    bucket: String(row.storage_bucket || VCULTURE_MATERIALS_BUCKET),
    path: String(row.storage_path || ''),
    deletedAt: row.deleted_at || null,
  };
}

function getFocusTaskId(phaseId: string, taskKey: string) {
  return `${phaseId}:${taskKey}`;
}

function getFocusTaskTotals(statuses: Record<string, boolean>) {
  const total = FOCUS_TASK_PHASES.reduce((sum, phase) => sum + phase.tasks.length, 0);
  const done = FOCUS_TASK_PHASES.reduce(
    (sum, phase) => sum + phase.tasks.filter((task) => statuses[getFocusTaskId(phase.id, task.key)]).length,
    0,
  );
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

function getTransferFeedbackKind(message: string) {
  const normalized = message.toLowerCase();
  if (!message) return 'idle';
  if (normalized.includes('không') || normalized.includes('khong') || normalized.includes('chưa') || normalized.includes('chua') || normalized.includes('error') || normalized.includes('failed') || normalized.includes('http ')) return 'error';
  if (
    normalized.includes('đang') ||
    normalized.includes('dang') ||
    normalized.includes('storage') ||
    normalized.includes('signed upload') ||
    normalized.includes('signed download')
  ) {
    return 'active';
  }
  if (normalized.includes('đã ') || normalized.includes('da ') || normalized.includes('opened') || normalized.includes('mở link') || normalized.includes('mo link')) return 'done';
  return 'note';
}

async function getAccessToken() {
  if (!supabase) throw new Error('Supabase client is not configured.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  let session = data.session;
  const expiresAt = Number(session?.expires_at || 0);
  if (session && expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) < 60) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data.session;
  }
  if (session) {
    const verified = await supabase.auth.getUser(session.access_token);
    if (verified.error) throw verified.error;
  }
  const token = session?.access_token;
  if (!token) throw new Error('Missing session token.');
  return token;
}

async function requestMaterialApi(init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch('/api/vculture-material-upload', {
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function requestVcoachingApi(init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch('/api/vcoaching-state', {
    ...init,
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function uploadFileToSignedUrl(signedUrl: string, file: File) {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);

  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'x-upsert': 'true',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = text;
    try {
      const payload = text ? JSON.parse(text) : null;
      message = payload?.error || payload?.message || payload?.msg || text;
    } catch {
      // Keep the raw response text when Storage does not return JSON.
    }
    throw new Error(message || `Upload failed with HTTP ${response.status}.`);
  }
}

function serializeEditablePortal(host: HTMLElement) {
  const clone = host.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.vculture-materials-react-slot,.vc-role-notice,.vc-prep-role-note,.vc-prep-submissions,.vc-edit-pencil').forEach((node) => node.remove());
  clone.querySelectorAll('[contenteditable]').forEach((node) => {
    node.removeAttribute('contenteditable');
    node.classList.remove('vc-editable-block');
    node.classList.remove('vc-editable-candidate');
  });
  clone.querySelectorAll('.vc-editable-candidate').forEach((node) => node.classList.remove('vc-editable-candidate'));
  clone.querySelectorAll('.is-disabled').forEach((node) => node.classList.remove('is-disabled'));
  clone.querySelectorAll('textarea,input,select,button').forEach((node) => {
    node.removeAttribute('disabled');
  });
  return clone.innerHTML;
}

function setPortalEditable(host: HTMLElement, enabled: boolean, canManage: boolean) {
  const selectors = [
    '.pg-title',
    '.card-title',
    '.alert',
    '.doc-item',
    '.stat-card',
    '.heart-card',
    '.cascade-box',
    '.screen p',
    '.screen li',
    '.screen td',
    '.screen th',
  ].join(',');
  host.querySelectorAll<HTMLElement>(selectors).forEach((element) => {
    if (element.closest('.vculture-materials-react-slot')) return;
    if (element.querySelector('input,textarea,select,button')) return;
    element.classList.toggle('vc-editable-candidate', canManage);
    element.contentEditable = enabled ? 'true' : 'false';
    element.classList.toggle('vc-editable-block', enabled);
    const existingPencil = element.querySelector<HTMLElement>(':scope > .vc-edit-pencil');
    if (canManage && !existingPencil) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'vc-edit-pencil';
      button.title = 'Sửa nội dung này';
      button.textContent = '✎';
      element.appendChild(button);
    } else if (!canManage && existingPencil) {
      existingPencil.remove();
    }
  });
}

function applyRoleNavigation(host: HTMLElement, role: string) {
  const allItems = Array.from(host.querySelectorAll<HTMLElement>('.sb-item[id^="nav-"]'));
  allItems.forEach((item) => {
    item.hidden = false;
    item.classList.remove('vc-role-hidden');
  });

  host.querySelectorAll<HTMLElement>('.sb-group').forEach((group) => {
    group.hidden = false;
    group.classList.remove('vc-role-hidden');
  });

  const labelByFirstItem: Record<string, string> = {
    'nav-dashboard': role === 'coachee' ? 'Việc của tôi' : role === 'observer' ? 'Theo dõi' : 'Tổng quan',
    'nav-ws0-overview': role === 'coachee' ? 'Phiên coaching của tôi' : 'WS0 — Ban TGĐ (8 phiên)',
    'nav-ws1a-overview': role === 'coachee' ? 'Form chuẩn bị bổ sung' : 'WS1a — Ban Tập đoàn',
    'nav-chuong1': 'Tài liệu VNPT Rising',
  };

  if (role === 'coach' || role === 'coaching_admin' || role === 'admin') {
    host.querySelectorAll<HTMLElement>('.sb-group').forEach((group) => {
      const firstItem = group.querySelector<HTMLElement>('.sb-item[id^="nav-"]');
      const label = group.querySelector<HTMLElement>('.sb-group-label');
      if (firstItem && labelByFirstItem[firstItem.id] && label) label.textContent = labelByFirstItem[firstItem.id];
    });
    return;
  }

  const allowedByRole: Record<string, Set<string>> = {
    coachee: new Set([
      'nav-dashboard',
      'nav-docs-van-hoa',
      'nav-ws0-phien1',
      'nav-ws0-prework',
      'nav-chuong1',
      'nav-chuong2',
      'nav-chuong4',
      'nav-chuong5',
      'nav-chuong6',
      'nav-phu-luc',
      'nav-cthd-long',
    ]),
    observer: new Set([
      'nav-dashboard',
      'nav-docs-van-hoa',
      'nav-ws0-phien1',
      'nav-ws0-phien2',
      'nav-ws0-phien3',
      'nav-ws0-phien4',
      'nav-ws0-phien5',
      'nav-ws0-phien6',
      'nav-ws0-phien7',
      'nav-ws0-phien8',
      'nav-chuong1',
      'nav-chuong2',
      'nav-chuong4',
      'nav-chuong5',
      'nav-chuong6',
      'nav-phu-luc',
      'nav-cthd-long',
    ]),
  };
  const allowed = allowedByRole[role] || allowedByRole.observer;

  allItems.forEach((item) => {
    const visible = allowed.has(item.id);
    item.hidden = !visible;
    item.classList.toggle('vc-role-hidden', !visible);
  });

  host.querySelectorAll<HTMLElement>('.sb-group').forEach((group) => {
    const visibleItems = Array.from(group.querySelectorAll<HTMLElement>('.sb-item[id^="nav-"]')).filter((item) => !item.hidden);
    group.hidden = visibleItems.length === 0;
    group.classList.toggle('vc-role-hidden', visibleItems.length === 0);
    const firstItem = visibleItems[0];
    const label = group.querySelector<HTMLElement>('.sb-group-label');
    if (firstItem && labelByFirstItem[firstItem.id] && label) label.textContent = labelByFirstItem[firstItem.id];
  });
}

export function VCulturePage() {
  const location = useLocation();
  const { profile, refreshProfile, session, signOut } = useAuth();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mountedPortalBodyRef = useRef('');
  const activeScreenRef = useRef<string>(window.sessionStorage.getItem('vculture.activeScreen') || 'dashboard');
  const activeTabsRef = useRef<Record<string, { tabId: string; containerId: string }>>({});
  const routeMode = location.pathname.includes('vcoaching') ? 'coaching' : 'culture';
  const pageKey = routeMode === 'coaching' ? 'vcoaching' : 'vculture';
  const profileMatchesSession = Boolean(
    profile &&
      session?.user &&
      ((profile.authUserId && profile.authUserId === session.user.id) ||
        (profile.email && session.user.email && profile.email.toLowerCase() === session.user.email.toLowerCase())),
  );
  const effectiveProfile = profileMatchesSession ? profile : null;
  const viewerRole = normalizeAppRole(effectiveProfile?.role);
  const allowedPages = getAllowedPages(viewerRole);
  const canManage = ['admin', 'content_manager', 'production_manager', 'pm', 'coach', 'coaching_admin'].includes(viewerRole);
  const [portal, setPortal] = useState<{ style: string; body: string } | null>(null);
  const [portalLoadError, setPortalLoadError] = useState('');
  const [materialsMounts, setMaterialsMounts] = useState<HTMLElement[]>([]);
  const [dashboardToolsMount, setDashboardToolsMount] = useState<HTMLElement | null>(null);
  const [workflowMount, setWorkflowMount] = useState<HTMLElement | null>(null);
  const [materials, setMaterials] = useState(DEFAULT_MATERIALS);
  const [vcoachingState, setVcoachingState] = useState(EMPTY_VCOACHING_STATE);
  const [vcoachingFeedback, setVcoachingFeedback] = useState('');
  const [vcoachingLoading, setVcoachingLoading] = useState(false);
  const [selectedPortalMaterials, setSelectedPortalMaterials] = useState<string[]>(DEFAULT_SELECTED_PORTAL_MATERIALS);
  const [materialForm, setMaterialForm] = useState({ chapter: 'Chương 1', session: 'WS0 - Phiên 1', group: 'Ban điều hành' });
  const [editingMaterialId, setEditingMaterialId] = useState('');
  const [materialEditForm, setMaterialEditForm] = useState({ name: '', chapter: '', session: '', group: '' });
  const [materialFeedback, setMaterialFeedback] = useState('');
  const [focusTaskStatuses, setFocusTaskStatuses] = useState<Record<string, boolean>>({});
  const [focusTaskFeedback, setFocusTaskFeedback] = useState('');
  const [focusTaskSavingKey, setFocusTaskSavingKey] = useState<string | null>(null);
  const [portalBody, setPortalBody] = useState('');
  const [contentEditMode, setContentEditMode] = useState(false);
  const [contentFeedback, setContentFeedback] = useState('');
  const navigationRestoreTimerRef = useRef<number | null>(null);

  const rememberPortalNavigation = (source?: Element | null) => {
    const host = hostRef.current;
    if (!host) return;
    const screen =
      source?.closest<HTMLElement>('.screen') ||
      Array.from(host.querySelectorAll<HTMLElement>('.screen.act')).find((item) => item.id !== 's-dashboard') ||
      host.querySelector<HTMLElement>('.screen.act');
    const screenId = screen?.id.replace(/^s-/, '');
    if (screenId) {
      activeScreenRef.current = screenId;
      window.sessionStorage.setItem('vculture.activeScreen', screenId);
    }
    screen?.querySelectorAll<HTMLElement>('.tab.act[onclick*="switchTab"]').forEach((tab) => {
      const match = (tab.getAttribute('onclick') || '').match(/switchTab\(this,'([^']+)','([^']+)'\)/);
      if (match) activeTabsRef.current[match[2]] = { tabId: match[1], containerId: match[2] };
    });
  };

  const restorePortalNavigationState = () => {
    const host = hostRef.current;
    if (!host) return;
    const savedScreen = activeScreenRef.current || 'dashboard';
    const target = host.querySelector<HTMLElement>(`#s-${savedScreen}`) || host.querySelector<HTMLElement>('#s-dashboard');
    if (target) {
      host.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('act'));
      target.classList.add('act');
      host.querySelectorAll('.sb-item').forEach((item) => item.classList.remove('act'));
      host.querySelector(`#nav-${savedScreen}`)?.classList.add('act');
      host.querySelector('#bc-text')?.replaceChildren(document.createTextNode(LABEL_OVERRIDES[savedScreen] || savedScreen));
    }
    Object.values(activeTabsRef.current).forEach(({ tabId, containerId }) => {
      const container = host.querySelector<HTMLElement>(`#${containerId}`);
      const tabButton = host.querySelector<HTMLElement>(`#${containerId} .tab[onclick*="'${tabId}'"]`);
      const tabContent = host.querySelector<HTMLElement>(`#${tabId}`);
      if (!container || !tabButton || !tabContent) return;
      container.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('act'));
      tabButton.classList.add('act');
      Array.from(tabContent.parentElement?.children || []).forEach((child) => {
        if (child instanceof HTMLElement && child.tagName === 'DIV' && child.id && child.id !== containerId) {
          child.style.display = 'none';
        }
      });
      tabContent.style.display = 'block';
    });
  };

  const schedulePortalNavigationRestore = () => {
    if (navigationRestoreTimerRef.current !== null) {
      window.clearTimeout(navigationRestoreTimerRef.current);
    }
    navigationRestoreTimerRef.current = window.setTimeout(() => {
      navigationRestoreTimerRef.current = null;
      restorePortalNavigationState();
    }, 0);
  };

  const showMaterialFeedback = (message: string) => {
    setMaterialFeedback(message);
    hostRef.current?.querySelectorAll<HTMLElement>('.vc-native-upload-status').forEach((status) => {
      status.hidden = false;
      status.textContent = message;
    });
  };

  useEffect(() => {
    if (!session?.user || profileMatchesSession) return;
    void refreshProfile();
  }, [profileMatchesSession, refreshProfile, session?.user?.id]);

  useEffect(
    () => () => {
      if (navigationRestoreTimerRef.current !== null) {
        window.clearTimeout(navigationRestoreTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    let active = true;
    setPortalLoadError('');
    fetch(VCULTURE_PORTAL_HTML_URL, { cache: 'no-cache' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((html) => {
        if (!active) return;
        const nextPortal = extractPortal(html);
        setPortal(nextPortal);
        setPortalBody(nextPortal.body);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setPortalLoadError(error instanceof Error ? error.message : 'Không tải được HTML gốc VCulture.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mountedPortalBodyRef.current === portalBody) return;
    mountedPortalBodyRef.current = portalBody;
    host.innerHTML = portalBody;
  }, [portalBody]);

  useEffect(() => {
    setContentEditMode(false);
    if (!portal) return;
    setPortalBody(portal.body);
    if (!supabase) return;
    let active = true;
    supabase
      .from(VCULTURE_MATERIALS_TABLE)
      .select('id,file_name,file_size,content_type,chapter,session_label,coachee_group,owner_name,uploaded_at,storage_bucket,storage_path,deleted_at')
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setMaterialFeedback(`Chưa tải được thư viện tài liệu: ${error.message}`);
          return;
        }
        setMaterials(filterActiveVcoachingMaterials((data || []).map(mapMaterialRow)));
      });
    return () => {
      active = false;
    };
  }, [portal, routeMode]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase
      .from(VCULTURE_FOCUS_TASK_TABLE)
      .select('phase_id,task_key,is_done')
      .eq('route_key', routeMode)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setFocusTaskFeedback(`Chưa tải được kết quả nhiệm vụ trọng tâm: ${error.message}`);
          return;
        }
        const next: Record<string, boolean> = {};
        for (const row of data || []) {
          next[getFocusTaskId(String(row.phase_id), String(row.task_key))] = Boolean(row.is_done);
        }
        setFocusTaskStatuses(next);
      });
    return () => {
      active = false;
    };
  }, [routeMode]);

  useEffect(() => {
    if (!portal) return;
    if (!supabase) return;
    let active = true;
    supabase
      .from(VCULTURE_CONTENT_TABLE)
      .select('html_body,updated_at')
      .eq('route_key', routeMode)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setContentFeedback('Chưa tải được bản nội dung đã chỉnh. Vui lòng đăng nhập lại nếu phiên đã hết hạn.');
          return;
        }
        if (data?.html_body) {
          setPortalBody(injectReactSlots(String(data.html_body)));
          setContentFeedback(`Đang dùng bản nội dung đã cập nhật lúc ${new Date(data.updated_at).toLocaleString('vi-VN')}.`);
        }
      });
    return () => {
      active = false;
    };
  }, [portal, routeMode]);

  const loadVcoachingState = async () => {
    if (routeMode !== 'coaching') return;
    setVcoachingLoading(true);
    try {
      const payload = await requestVcoachingApi({
        method: 'POST',
        body: JSON.stringify({ action: 'load_state' }),
      }) as { state?: VcoachingWorkflowState & { profiles?: VcoachingProfileOption[] } };
      setVcoachingState(payload.state || EMPTY_VCOACHING_STATE);
      setVcoachingFeedback('');
    } catch (error) {
      setVcoachingFeedback(error instanceof Error ? `Không tải được dữ liệu coaching: ${error.message}` : 'Không tải được dữ liệu coaching.');
    } finally {
      setVcoachingLoading(false);
    }
  };

  useEffect(() => {
    if (routeMode !== 'coaching' || !effectiveProfile) return;
    void loadVcoachingState();
  }, [routeMode, effectiveProfile?.id]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const setUserLabels = () => {
      const name = effectiveProfile?.fullName || session?.user?.email || 'Vinabrain User';
      const role = viewerRole;
      host.querySelector('.sb-user-name')?.replaceChildren(document.createTextNode(name));
      host.querySelector('.sb-user-role')?.replaceChildren(document.createTextNode(`Hệ thống coaching VNPT Rising · ${role}`));
      host.querySelector('#tb-role-label')?.replaceChildren(document.createTextNode(role));
      const avatar = host.querySelector<HTMLElement>('#tb-av');
      avatar?.replaceChildren(document.createTextNode(name.split(/\s+/).slice(-2).map((part) => part[0]).join('').toUpperCase() || 'VB'));
      if (avatar && !host.querySelector('.vc-account-menu')) {
        avatar.setAttribute('role', 'button');
        avatar.setAttribute('tabindex', '0');
        avatar.setAttribute('aria-haspopup', 'menu');
        avatar.setAttribute('aria-expanded', 'false');
        const menu = document.createElement('div');
        menu.className = 'vc-account-menu';
        menu.hidden = true;
        menu.innerHTML = `<div class="vc-account-menu-name">${escapeHtml(name)}</div><div class="vc-account-menu-role">${escapeHtml(role)}</div><button type="button" class="vc-signout-btn">Đăng xuất</button>`;
        avatar.insertAdjacentElement('afterend', menu);
      }
      const menu = host.querySelector<HTMLElement>('.vc-account-menu');
      const signOutButton = host.querySelector<HTMLButtonElement>('.vc-account-menu .vc-signout-btn');
      menu?.querySelector('.vc-account-menu-name')?.replaceChildren(document.createTextNode(name));
      menu?.querySelector('.vc-account-menu-role')?.replaceChildren(document.createTextNode(role));
      if (avatar && menu) {
        avatar.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          menu.hidden = !menu.hidden;
          avatar.setAttribute('aria-expanded', String(!menu.hidden));
        };
        avatar.onkeydown = (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          menu.hidden = !menu.hidden;
          avatar.setAttribute('aria-expanded', String(!menu.hidden));
        };
      }
      if (signOutButton) {
        signOutButton.onclick = (event) => {
          event.preventDefault();
          event.stopPropagation();
          void signOut();
        };
      }
    };

    const go = (sid: string, options: { preserveScroll?: boolean } = {}) => {
      host.querySelectorAll('.screen').forEach((screen) => screen.classList.remove('act'));
      const target = host.querySelector<HTMLElement>(`#s-${sid}`) || host.querySelector<HTMLElement>('#s-dashboard');
      target?.classList.add('act');
      host.querySelectorAll('.sb-item').forEach((item) => item.classList.remove('act'));
      host.querySelector(`#nav-${target?.id.replace(/^s-/, '') || 'dashboard'}`)?.classList.add('act');
      const labelKey = target?.id.replace(/^s-/, '') || sid;
      host.querySelector('#bc-text')?.replaceChildren(document.createTextNode(LABEL_OVERRIDES[labelKey] || labelKey));
      activeScreenRef.current = labelKey;
      window.sessionStorage.setItem('vculture.activeScreen', labelKey);
      if (!options.preserveScroll) host.querySelector('#content')?.scrollTo({ top: 0 });
    };

    const switchTab = (btn: HTMLElement, tabId: string, containerId: string) => {
      const container = host.querySelector<HTMLElement>(`#${containerId}`);
      const target = host.querySelector<HTMLElement>(`#${tabId}`);
      if (!container || !target) return;
      container.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('act'));
      btn.classList.add('act');
      activeTabsRef.current[containerId] = { tabId, containerId };
      const parent = target.parentElement;
      if (!parent) return;
      Array.from(parent.children).forEach((child) => {
        if (child instanceof HTMLElement && child.tagName === 'DIV' && child.id && child.id !== containerId) {
          child.style.display = 'none';
        }
      });
      target.style.display = 'block';
    };

    const restoreNavigation = () => {
      const savedScreen = activeScreenRef.current || 'dashboard';
      if (savedScreen !== 'dashboard') go(savedScreen, { preserveScroll: true });
      Object.values(activeTabsRef.current).forEach(({ tabId, containerId }) => {
        const tabButton = host.querySelector<HTMLElement>(`#${containerId} .tab[onclick*="'${tabId}'"]`);
        if (tabButton) switchTab(tabButton, tabId, containerId);
      });
    };

    (window as any).go = go;
    (window as any).switchTab = switchTab;
    const handlePortalClick = (event: MouseEvent) => {
      const signOutButton = event.target instanceof Element ? event.target.closest<HTMLElement>('.vc-signout-btn') : null;
      if (signOutButton) {
        event.preventDefault();
        event.stopPropagation();
        void signOut();
        return;
      }
      const accountAvatar = event.target instanceof Element ? event.target.closest<HTMLElement>('#tb-av') : null;
      if (accountAvatar) {
        event.preventDefault();
        event.stopPropagation();
        const menu = host.querySelector<HTMLElement>('.vc-account-menu');
        if (menu) {
          menu.hidden = !menu.hidden;
          accountAvatar.setAttribute('aria-expanded', String(!menu.hidden));
        }
        return;
      }
      const accountMenu = event.target instanceof Element ? event.target.closest<HTMLElement>('.vc-account-menu') : null;
      if (!accountMenu) {
        const menu = host.querySelector<HTMLElement>('.vc-account-menu');
        const avatar = host.querySelector<HTMLElement>('#tb-av');
        if (menu && !menu.hidden) {
          menu.hidden = true;
          avatar?.setAttribute('aria-expanded', 'false');
        }
      }
      const docPickerButton = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-toggle-doc-picker]') : null;
      if (docPickerButton) {
        event.preventDefault();
        event.stopPropagation();
        const panel = docPickerButton.closest<HTMLElement>('.vc-doc-tools-panel');
        panel?.classList.toggle('is-picker-open');
        return;
      }
      const docPickerInput = event.target instanceof Element ? event.target.closest<HTMLInputElement>('.vc-doc-picker input[type="checkbox"]') : null;
      if (docPickerInput) {
        setSelectedPortalMaterials((current) => {
          const docId = String(docPickerInput.dataset.docId || '');
          if (!docId) return current;
          return docPickerInput.checked ? Array.from(new Set([...current, docId])) : current.filter((id) => id !== docId);
        });
        return;
      }
      const editButton = event.target instanceof Element ? event.target.closest<HTMLElement>('.vc-edit-pencil') : null;
      if (editButton) {
        event.preventDefault();
        event.stopPropagation();
        if (contentEditMode) {
          void saveContentOverride();
          return;
        }
        setContentEditMode(true);
        const editable = editButton.parentElement;
        window.setTimeout(() => {
          editable?.focus();
        }, 0);
        return;
      }
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[onclick]') : null;
      const onclick = target?.getAttribute('onclick') || '';
      const goMatch = onclick.match(/go\('([^']+)'\)/);
      if (goMatch) {
        event.preventDefault();
        go(goMatch[1]);
        return;
      }
      const tabMatch = onclick.match(/switchTab\(this,'([^']+)','([^']+)'\)/);
      if (target && tabMatch) {
        event.preventDefault();
        switchTab(target, tabMatch[1], tabMatch[2]);
      }
    };
    const handlePortalChange = (event: Event) => {
      const uploadInput = event.target instanceof Element ? event.target.closest<HTMLInputElement>('.vc-native-upload-input') : null;
      if (uploadInput) {
        rememberPortalNavigation(uploadInput);
        void handleSignedUpload(event as unknown as ChangeEvent<HTMLInputElement>);
      }
    };
    host.addEventListener('click', handlePortalClick);
    host.addEventListener('change', handlePortalChange);
    setUserLabels();

    const role = viewerRole;
    applyRoleNavigation(host, role);
    const roleText: Record<string, string> = {
      admin: 'Admin: quản trị toàn bộ nội dung, upload tài liệu, theo dõi chuẩn bị và phản hồi CTHĐ.',
      coaching_admin: 'Quản trị coaching: upload tài liệu, phân quyền coach, theo dõi/chốt kết quả.',
      coach: 'Coach: nhận thông tin chuẩn bị từ coachee, xem tài liệu và phản hồi/chốt CTHĐ sau phiên.',
      coachee: 'Coachee: đọc tài liệu, điền thông tin cần chuẩn bị trước phiên và xác nhận CTHĐ sau phiên.',
      observer: 'Observer: chỉ xem tài liệu và trạng thái được chia sẻ, không chỉnh sửa hoặc upload.',
    };
    const existingRoleNotice = host.querySelector('.vc-role-notice');
    existingRoleNotice?.remove();
    const roleNotice = document.createElement('div');
    roleNotice.className = 'alert alert-t vc-role-notice';
    roleNotice.textContent = roleText[role] || roleText.observer;
    const dashboard = host.querySelector<HTMLElement>('#s-dashboard');
    dashboard?.insertBefore(roleNotice, dashboard.firstElementChild?.nextSibling || null);
    let workflowSlot = dashboard?.querySelector<HTMLElement>('.vculture-workflow-react-slot') || null;
    if (routeMode === 'coaching' && dashboard && !workflowSlot) {
      workflowSlot = document.createElement('div');
      workflowSlot.className = 'vculture-workflow-react-slot';
      roleNotice.insertAdjacentElement('afterend', workflowSlot);
    }
    setWorkflowMount(routeMode === 'coaching' ? workflowSlot : null);
    let dashboardToolsSlot = dashboard?.querySelector<HTMLElement>('.vculture-dashboard-tools-react-slot') || null;
    if (canManage && dashboard && !dashboardToolsSlot) {
      dashboardToolsSlot = document.createElement('div');
      dashboardToolsSlot.className = 'vculture-dashboard-tools-react-slot';
      (workflowSlot || roleNotice).insertAdjacentElement('afterend', dashboardToolsSlot);
    }
    setDashboardToolsMount(canManage ? dashboardToolsSlot : null);

    const materialSlots: HTMLElement[] = [];
    const materialTargets = host.querySelectorAll<HTMLElement>('#s-docs-van-hoa, [id^="t-doc-"], #pw-read');
    materialTargets.forEach((target, index) => {
      const existingToolPanel = target.querySelector<HTMLElement>('.vc-doc-tools-panel');
      if (existingToolPanel) {
        existingToolPanel.hidden = !canManage;
      } else if (canManage) {
        const panel = document.createElement('div');
        panel.className = 'vc-doc-tools-panel';
        panel.dataset.slotKind = target.id === 's-docs-van-hoa' ? 'library' : 'session';
        panel.innerHTML = '<div><strong>Quản lý tài liệu đọc trước phiên</strong><span>Coach chọn tài liệu có sẵn trong module Tài liệu VNPT Rising hoặc upload PDF/DOCX/PPTX riêng cho phiên này.</span></div><div class="vc-doc-tools-actions"><button class="btn btn-gh btn-sm" type="button" data-toggle-doc-picker="true">📚 Chọn tài liệu có sẵn</button><label class="btn btn-pr btn-sm vc-transfer-button">📎 Upload tài liệu<input class="vc-native-upload-input" multiple type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" style="display:none"></label></div><div class="vc-doc-picker"><label><input type="checkbox" checked data-doc-id="chuong1"> Chương 1 — Khung tổng thể VNPT Rising</label><label><input type="checkbox" checked data-doc-id="chuong2"> Chương 2 — Phương thức dẫn dắt Ban TGĐ</label><label><input type="checkbox" checked data-doc-id="phu-luc"> Phụ lục — 5 Mắt xích Nhân-Quả chi tiết</label><label><input type="checkbox" data-doc-id="chuong5"> Chương 5 — Kế hoạch hành động Ban TGĐ</label><label><input type="checkbox" data-doc-id="cthd-long"> CTHĐ mẫu — PTGĐ Dương Thành Long</label></div>';
        const anchor = target.querySelector('.alert') || target.firstElementChild;
        anchor?.insertAdjacentElement('afterend', panel);
      }
      let slot = target.querySelector<HTMLElement>('.vculture-materials-react-slot');
      if (!slot) {
        slot = document.createElement('div');
        slot.className = 'vculture-materials-react-slot';
        slot.dataset.slotKind = target.id === 's-docs-van-hoa' ? 'library' : 'session';
        const anchor = target.querySelector('.alert') || target.firstElementChild;
        anchor?.insertAdjacentElement('afterend', slot);
      }
      slot.dataset.slotIndex = String(index);
      materialSlots.push(slot);
    });
    setMaterialsMounts(materialSlots);

    materialTargets.forEach((target) => {
      target.querySelector('.vc-native-material-panel')?.remove();
      const panel = document.createElement('div');
      panel.className = 'card vc-native-material-panel';
      const isLibrary = target.id === 's-docs-van-hoa';
      const uploadMarkup = canManage
        ? '<label class="btn btn-pr btn-sm vc-transfer-button"><span>📎</span> Upload PDF/DOCX/PPTX<input class="vc-native-upload-input" multiple type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" style="display:none"></label>'
        : '<span class="pill pill-gr">Chỉ tải xuống</span>';
      const rows = materials.length
        ? materials.slice(0, 6).map((item) => {
          const isEditing = canManage && editingMaterialId === item.id;
          const actions = canManage
            ? `<button class="btn btn-gh btn-xs" type="button" data-edit-material="${escapeHtml(item.id)}">✎ Sửa</button><button class="btn btn-ol btn-xs" type="button" data-delete-material="${escapeHtml(item.id)}">🗑 Xóa</button>`
            : '';
          if (isEditing) {
            return `<div class="vc-native-file-row is-editing" data-material-id="${escapeHtml(item.id)}"><div class="vc-native-edit-grid"><input class="fi vc-material-edit-input" data-material-field="name" value="${escapeHtml(materialEditForm.name)}" aria-label="Tên tài liệu"><input class="fi vc-material-edit-input" data-material-field="chapter" value="${escapeHtml(materialEditForm.chapter)}" aria-label="Chương"><input class="fi vc-material-edit-input" data-material-field="session" value="${escapeHtml(materialEditForm.session)}" aria-label="Phiên"><input class="fi vc-material-edit-input" data-material-field="group" value="${escapeHtml(materialEditForm.group)}" aria-label="Nhóm coachee"></div><div class="vc-material-actions"><button class="btn btn-pr btn-xs vc-transfer-button" type="button" data-save-material="${escapeHtml(item.id)}">✓ Lưu</button><button class="btn btn-gh btn-xs" type="button" data-cancel-material="true">Hủy</button></div></div>`;
          }
          return `<div class="vc-native-file-row" data-material-id="${escapeHtml(item.id)}"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.chapter)} · ${escapeHtml(item.session)} · ${formatFileSize(item.size)}</span></div><div class="vc-material-actions"><button class="btn btn-gh btn-xs vc-transfer-button" type="button" data-download-material="${escapeHtml(item.id)}">⬇ Tải xuống</button>${actions}</div></div>`;
        }).join('')
        : '<div class="vc-dashboard-empty">Chưa có file upload thật. Coach/admin bấm Upload để thêm tài liệu cho phiên này.</div>';
      panel.innerHTML = `<div class="fl-sb" style="gap:10px;margin-bottom:10px"><div><div class="card-title" style="margin-bottom:3px"><span class="ct-icon">📎</span>${isLibrary ? 'Thư viện file upload thật' : 'File upload thật cho phiên này'}</div><div style="font-size:11px;color:var(--t2)">Upload và tải xuống file thật từ Supabase Storage, gắn theo chương/phiên/nhóm coachee.</div></div>${uploadMarkup}</div><div class="vc-native-upload-status" hidden></div><div class="vc-native-file-list">${rows}</div>`;
      const anchor = target.querySelector('.alert') || target.firstElementChild;
      anchor?.insertAdjacentElement('afterend', panel);
      panel.querySelectorAll<HTMLButtonElement>('[data-download-material]').forEach((button) => {
        button.addEventListener('click', () => {
          const item = materials.find((material) => material.id === button.dataset.downloadMaterial);
          if (item) void downloadMaterialWithSignedUrl(item);
        });
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-edit-material]').forEach((button) => {
        button.addEventListener('click', () => {
          const item = materials.find((material) => material.id === button.dataset.editMaterial);
          if (item) startEditMaterial(item);
        });
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-delete-material]').forEach((button) => {
        button.addEventListener('click', () => {
          const item = materials.find((material) => material.id === button.dataset.deleteMaterial);
          if (item) void deleteMaterial(item);
        });
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-save-material]').forEach((button) => {
        button.addEventListener('click', () => {
          const row = button.closest<HTMLElement>('.vc-native-file-row');
          const item = materials.find((material) => material.id === button.dataset.saveMaterial);
          if (!row || !item) return;
          const getValue = (field: string) =>
            row.querySelector<HTMLInputElement>(`[data-material-field="${field}"]`)?.value || '';
          void saveMaterialUpdate(item, {
            name: getValue('name'),
            chapter: getValue('chapter'),
            session: getValue('session'),
            group: getValue('group'),
          });
        });
      });
      panel.querySelectorAll<HTMLButtonElement>('[data-cancel-material]').forEach((button) => {
        button.addEventListener('click', cancelEditMaterial);
      });
    });

    const prepTargets = host.querySelectorAll<HTMLElement>('[id^="t-cb-"], #pw-form, #s-ws1a-prework, #s-ws1b-prework');
    prepTargets.forEach((target) => {
      target.querySelector('.vc-prep-role-note')?.remove();
      target.querySelectorAll('.vc-prep-hidden-for-coach').forEach((node) => node.classList.remove('vc-prep-hidden-for-coach'));
      const note = document.createElement('div');
      note.className = `alert ${role === 'coachee' ? 'alert-a' : 'alert-bl'} vc-prep-role-note`;
      if (role === 'coachee') {
        note.innerHTML = '<strong>Vai trò coachee:</strong> bạn là người điền và gửi thông tin cần chuẩn bị trước phiên. Coach sẽ nhận nội dung này để thiết kế/dẫn phiên.';
      } else if (role === 'coach' || role === 'coaching_admin' || role === 'admin') {
        note.innerHTML = '<strong>Vai trò coach/admin:</strong> phần này là thông tin coachee nộp trước phiên. Bạn chỉ xem, rà soát mức độ đầy đủ và dùng làm đầu vào coaching.';
      } else {
        note.innerHTML = '<strong>Vai trò observer:</strong> chỉ xem trạng thái chuẩn bị được chia sẻ, không nhập hoặc chỉnh sửa thông tin.';
      }
      target.insertBefore(note, target.firstElementChild);
      const editable = role === 'coachee';
      target.querySelectorAll('textarea,input,select').forEach((field) => {
        if (field instanceof HTMLInputElement && field.type === 'checkbox') return;
        if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
          field.disabled = !editable;
          if (!editable && field instanceof HTMLTextAreaElement && !field.value) {
            field.placeholder = 'Chờ coachee nộp thông tin chuẩn bị trước phiên...';
          }
        }
      });
      target.querySelectorAll('button').forEach((button) => {
        button.disabled = !editable;
        if (!editable) button.classList.add('is-disabled');
      });
      if (!editable && !target.querySelector('.vc-prep-submissions')) {
        Array.from(target.children).forEach((child) => {
          if (child instanceof HTMLElement && !child.classList.contains('vc-prep-role-note')) {
            child.classList.add('vc-prep-hidden-for-coach');
          }
        });
        const summary = document.createElement('div');
        summary.className = 'card vc-prep-submissions';
        summary.innerHTML = '<div class="card-title"><span class="ct-icon">📥</span> Thông tin coachee đã chuẩn bị</div><div class="alert alert-bl" style="margin-bottom:10px">Đây là màn coach xem dữ liệu do coachee nhập trước phiên. Coach dùng nội dung này để chuẩn bị và dẫn phiên, không điền thay coachee.</div><table class="tbl"><thead><tr><th>Coachee</th><th>Phiên</th><th>Nội dung đã chuẩn bị</th><th>Trạng thái</th></tr></thead><tbody><tr><td>Nguyễn Minh Anh</td><td>WS0/Phiên 1</td><td>Ưu tiên làm rõ rào cản phối hợp liên mảng, kỳ vọng có 1 hành vi cam kết trong 14 ngày.</td><td><span class="pill pill-a">Đang bổ sung</span></td></tr><tr><td>Lê Quốc Huy</td><td>WS0/Phiên 2</td><td>Đã mô tả tình huống thực tế, mục tiêu phiên và dữ liệu cần coach phản biện.</td><td><span class="pill pill-ok">Đã nộp đủ</span></td></tr></tbody></table>';
        target.appendChild(summary);
      }
    });
    setPortalEditable(host, canManage && contentEditMode, canManage);
    restoreNavigation();

    return () => {
      setPortalEditable(host, false, false);
      host.removeEventListener('click', handlePortalClick);
      host.removeEventListener('change', handlePortalChange);
      if ((window as any).go === go) delete (window as any).go;
      if ((window as any).switchTab === switchTab) delete (window as any).switchTab;
    };
  }, [canManage, contentEditMode, editingMaterialId, effectiveProfile?.fullName, materialEditForm, materials, portalBody, session?.user?.email, signOut, viewerRole]);

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    rememberPortalNavigation(event.target);
    if (!canManage) {
      showMaterialFeedback('Tài khoản này chỉ được tải tài liệu, không có quyền upload.');
      event.target.value = '';
      schedulePortalNavigationRestore();
      return;
    }
    if (!supabase) {
      showMaterialFeedback('Supabase chưa được cấu hình, không thể upload file thật.');
      event.target.value = '';
      schedulePortalNavigationRestore();
      return;
    }
    showMaterialFeedback('Đang tải tài liệu lên Storage...');
    const uploaded: UploadedMaterial[] = [];
    try {
      for (const file of files) {
        if (!isAllowedMaterial(file)) throw new Error(`File ${file.name} không đúng định dạng PDF/DOC/DOCX/PPT/PPTX.`);
        const safeName = sanitizeStorageSegment(file.name) || `material-${Date.now()}`;
        const objectPath = [
          'pre-reading',
          sanitizeStorageSegment(materialForm.chapter) || 'chapter',
          sanitizeStorageSegment(materialForm.session) || 'session',
          sanitizeStorageSegment(materialForm.group) || 'group',
          `${Date.now()}-${safeName}`,
        ].join('/');
        const storageResult = await supabase.storage.from(VCULTURE_MATERIALS_BUCKET).upload(objectPath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });
        if (storageResult.error) throw storageResult.error;
        const insertResult = await supabase
          .from(VCULTURE_MATERIALS_TABLE)
          .insert({
            file_name: file.name,
            file_size: file.size,
            content_type: file.type || 'application/octet-stream',
            chapter: materialForm.chapter,
            session_label: materialForm.session,
            coachee_group: materialForm.group,
            owner_profile_id: profile?.id || null,
            owner_name: profile?.fullName || 'Vinabrain user',
            storage_bucket: VCULTURE_MATERIALS_BUCKET,
            storage_path: objectPath,
          })
          .select('id,file_name,file_size,content_type,chapter,session_label,coachee_group,owner_name,uploaded_at,storage_bucket,storage_path,deleted_at')
          .single();
        if (insertResult.error) throw insertResult.error;
        uploaded.push(mapMaterialRow(insertResult.data));
      }
      setMaterials((current) => [...uploaded, ...current]);
      showMaterialFeedback(`Đã upload ${uploaded.length} tài liệu.`);
    } catch (error) {
      showMaterialFeedback(error instanceof Error ? error.message : 'Không upload được tài liệu.');
    }
    event.target.value = '';
    schedulePortalNavigationRestore();
  }

  async function downloadMaterial(item: UploadedMaterial) {
    if (!item.bucket || !item.path || !supabase) {
      showMaterialFeedback('Tài liệu mẫu chưa có file trên Storage.');
      return;
    }
    showMaterialFeedback(`Đang tạo link tải xuống cho ${item.name}...`);
    const signed = await supabase.storage.from(item.bucket).createSignedUrl(item.path, 60, {
      download: item.name,
    });
    if (signed.error || !signed.data?.signedUrl) {
      showMaterialFeedback(signed.error?.message || 'Không tạo được link tải.');
      return;
    }
    window.open(signed.data.signedUrl, '_blank', 'noopener,noreferrer');
    showMaterialFeedback(`Đã mở link tải xuống cho ${item.name}.`);
  }

  async function handleSignedUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    rememberPortalNavigation(event.target);
    if (!canManage) {
      showMaterialFeedback('Tài khoản này chỉ được tải tài liệu, không có quyền upload.');
      event.target.value = '';
      schedulePortalNavigationRestore();
      return;
    }
    if (!supabase) {
      showMaterialFeedback('Supabase chưa được cấu hình, không thể upload file thật.');
      event.target.value = '';
      schedulePortalNavigationRestore();
      return;
    }
    showMaterialFeedback('Đang xin signed upload URL và tải tài liệu lên Storage...');
    const uploaded: UploadedMaterial[] = [];
    try {
      for (const file of files) {
        if (!isAllowedMaterial(file)) throw new Error(`File ${file.name} không đúng định dạng PDF/DOC/DOCX/PPT/PPTX.`);
        const payload = await requestMaterialApi({
          method: 'POST',
          body: JSON.stringify({
            action: 'signed_upload_url',
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            chapter: materialForm.chapter,
            sessionLabel: materialForm.session,
            coacheeGroup: materialForm.group,
          }),
        });
        const upload = (payload as { upload?: { bucket?: string; path?: string; token?: string; signedUrl?: string; fileName?: string } }).upload;
        if (!upload?.bucket || !upload.path || !upload.token || !upload.signedUrl) {
          throw new Error('Server did not return a signed upload URL.');
        }
        await uploadFileToSignedUrl(upload.signedUrl, file);
        const insertResult = await supabase
          .from(VCULTURE_MATERIALS_TABLE)
          .insert({
            file_name: file.name,
            file_size: file.size,
            content_type: file.type || 'application/octet-stream',
            chapter: materialForm.chapter,
            session_label: materialForm.session,
            coachee_group: materialForm.group,
            owner_profile_id: profile?.id || null,
            owner_name: profile?.fullName || 'Vinabrain user',
            storage_bucket: upload.bucket,
            storage_path: upload.path,
          })
          .select('id,file_name,file_size,content_type,chapter,session_label,coachee_group,owner_name,uploaded_at,storage_bucket,storage_path,deleted_at')
          .single();
        if (insertResult.error) throw insertResult.error;
        uploaded.push(mapMaterialRow(insertResult.data));
      }
      setMaterials((current) => [...uploaded, ...current]);
      showMaterialFeedback(`Đã upload ${uploaded.length} tài liệu qua signed URL.`);
    } catch (error) {
      showMaterialFeedback(error instanceof Error ? error.message : 'Không upload được tài liệu.');
    }
    event.target.value = '';
    schedulePortalNavigationRestore();
  }

  async function downloadMaterialWithSignedUrl(item: UploadedMaterial) {
    if (!item.bucket || !item.path || !supabase) {
      showMaterialFeedback('Tài liệu mẫu chưa có file trên Storage.');
      return;
    }
    showMaterialFeedback(`Đang tạo signed download URL cho ${item.name}...`);
    try {
      const payload = await requestMaterialApi({
        method: 'POST',
        body: JSON.stringify({
          action: 'signed_download_url',
          materialId: item.id,
        }),
      });
      const download = (payload as { download?: { signedUrl?: string } }).download;
      if (!download?.signedUrl) {
        showMaterialFeedback('Không tạo được link tải.');
        return;
      }
      window.open(download.signedUrl, '_blank', 'noopener,noreferrer');
      showMaterialFeedback(`Đã mở link tải xuống cho ${item.name}.`);
    } catch (error) {
      showMaterialFeedback(error instanceof Error ? error.message : 'Không tạo được link tải.');
    }
  }

  function startEditMaterial(item: UploadedMaterial) {
    setEditingMaterialId(item.id);
    setMaterialEditForm({
      name: item.name,
      chapter: item.chapter,
      session: item.session,
      group: item.group,
    });
    showMaterialFeedback('');
  }

  function cancelEditMaterial() {
    setEditingMaterialId('');
    setMaterialEditForm({ name: '', chapter: '', session: '', group: '' });
  }

  async function saveMaterialUpdate(item: UploadedMaterial, formValues: { name: string; chapter: string; session: string; group: string }) {
    if (!supabase || !canManage) {
      showMaterialFeedback('Tài khoản hiện tại không có quyền sửa tài liệu upload.');
      return;
    }
    const next = {
      name: formValues.name.trim(),
      chapter: formValues.chapter.trim(),
      session: formValues.session.trim(),
      group: formValues.group.trim(),
    };
    if (!next.name || !next.chapter || !next.session || !next.group) {
      showMaterialFeedback('Vui lòng nhập đủ tên file, chương, phiên và nhóm trước khi lưu.');
      return;
    }
    showMaterialFeedback(`Đang lưu thay đổi cho ${item.name}...`);
    let payload: { material?: unknown };
    try {
      payload = await requestMaterialApi({
        method: 'POST',
        body: JSON.stringify({
          action: 'update_material',
          materialId: item.id,
          fileName: next.name,
          chapter: next.chapter,
          sessionLabel: next.session,
          coacheeGroup: next.group,
        }),
      }) as { material?: unknown };
    } catch (error) {
      showMaterialFeedback(error instanceof Error ? `Không lưu được tài liệu: ${error.message}` : 'Không lưu được tài liệu.');
      return;
    }
    if (!payload.material) {
      showMaterialFeedback('Không lưu được tài liệu: server không trả về dữ liệu cập nhật.');
      return;
    }
    const updated = mapMaterialRow(payload.material);
    setMaterials((current) => replaceVcoachingMaterial(current, updated));
    cancelEditMaterial();
    showMaterialFeedback(`Đã lưu thay đổi cho ${updated.name}.`);
  }

  async function updateMaterial(item: UploadedMaterial) {
    await saveMaterialUpdate(item, materialEditForm);
  }

  async function deleteMaterial(item: UploadedMaterial) {
    if (!supabase || !canManage) {
      showMaterialFeedback('Tài khoản hiện tại không có quyền xóa tài liệu upload.');
      return;
    }
    const ok = window.confirm(`Xóa thật tài liệu "${item.name}"? File trong Storage và dữ liệu metadata sẽ bị xóa khỏi hệ thống.`);
    if (!ok) return;
    showMaterialFeedback(`Đang xóa thật tài liệu ${item.name} khỏi Storage và database...`);
    try {
      await requestMaterialApi({
        method: 'POST',
        body: JSON.stringify({
          action: 'delete_material',
          materialId: item.id,
        }),
      });
    } catch (error) {
      showMaterialFeedback(error instanceof Error ? `Không xóa được tài liệu: ${error.message}` : 'Không xóa được tài liệu.');
      return;
    }
    setMaterials((current) => removeVcoachingMaterial(current, item.id));
    if (editingMaterialId === item.id) cancelEditMaterial();
    showMaterialFeedback(`Đã xóa thật tài liệu ${item.name}.`);
  }

  function togglePortalMaterial(materialId: string) {
    setSelectedPortalMaterials((current) =>
      current.includes(materialId) ? current.filter((id) => id !== materialId) : [...current, materialId],
    );
  }

  async function toggleFocusTask(phaseId: string, taskKey: string) {
    if (!supabase || !canManage) {
      setFocusTaskFeedback('Tài khoản hiện tại không có quyền cập nhật nhiệm vụ trọng tâm.');
      return;
    }
    const id = getFocusTaskId(phaseId, taskKey);
    const nextDone = !focusTaskStatuses[id];
    setFocusTaskStatuses((current) => ({ ...current, [id]: nextDone }));
    setFocusTaskSavingKey(id);
    setFocusTaskFeedback('Đang lưu kết quả online...');
    const { error } = await supabase
      .from(VCULTURE_FOCUS_TASK_TABLE)
      .upsert(
        {
          route_key: routeMode,
          phase_id: phaseId,
          task_key: taskKey,
          is_done: nextDone,
          updated_by_profile_id: profile?.id || null,
          updated_by_name: profile?.fullName || session?.user?.email || 'Vinabrain user',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'route_key,phase_id,task_key' },
      );
    setFocusTaskSavingKey(null);
    if (error) {
      setFocusTaskStatuses((current) => ({ ...current, [id]: !nextDone }));
      setFocusTaskFeedback(`Không lưu được kết quả nhiệm vụ: ${error.message}`);
      return;
    }
    setFocusTaskFeedback('Đã lưu kết quả online.');
  }

  async function resetFocusTasks() {
    if (!supabase || !canManage) return;
    setFocusTaskFeedback('Đang đặt lại toàn bộ nhiệm vụ...');
    const payload = FOCUS_TASK_PHASES.flatMap((phase) =>
      phase.tasks.map((task) => ({
        route_key: routeMode,
        phase_id: phase.id,
        task_key: task.key,
        is_done: false,
        updated_by_profile_id: profile?.id || null,
        updated_by_name: profile?.fullName || session?.user?.email || 'Vinabrain user',
        updated_at: new Date().toISOString(),
      })),
    );
    const { error } = await supabase
      .from(VCULTURE_FOCUS_TASK_TABLE)
      .upsert(payload, { onConflict: 'route_key,phase_id,task_key' });
    if (error) {
      setFocusTaskFeedback(`Không đặt lại được nhiệm vụ: ${error.message}`);
      return;
    }
    setFocusTaskStatuses({});
    setFocusTaskFeedback('Đã đặt lại và lưu online.');
  }

  async function mutateVcoachingState(body: Record<string, unknown>, successMessage: string) {
    setVcoachingFeedback('Đang lưu dữ liệu coaching...');
    try {
      const payload = await requestVcoachingApi({
        method: 'POST',
        body: JSON.stringify(body),
      }) as { state?: VcoachingWorkflowState & { profiles?: VcoachingProfileOption[] } };
      if (payload.state) setVcoachingState(payload.state);
      setVcoachingFeedback(successMessage);
    } catch (error) {
      setVcoachingFeedback(error instanceof Error ? error.message : 'Không lưu được dữ liệu coaching.');
    }
  }

  function exportVcoachingReport() {
    const bytes = exportVcoachingWorkflowWorkbook(vcoachingState);
    const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `vcoaching-trang-thai-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setVcoachingFeedback('Đã xuất Excel trạng thái VCoaching.');
  }

  function openPortalMaterial(materialId: string) {
    const go = (window as any).go;
    if (typeof go === 'function') go(materialId);
  }

  async function saveContentOverride(nextBody?: string) {
    if (!supabase || !hostRef.current) {
      setContentFeedback('Supabase chưa được cấu hình, không thể lưu nội dung.');
      return;
    }
    if (!canManage) {
      setContentFeedback('Tài khoản hiện tại không có quyền chỉnh nội dung.');
      return;
    }
    const bodyToSave = nextBody || serializeEditablePortal(hostRef.current);
    setContentFeedback('Đang lưu bản nội dung cập nhật...');
    const row = {
      route_key: routeMode,
      html_body: bodyToSave,
      updated_by_profile_id: profile?.id || null,
      updated_by_name: profile?.fullName || 'Vinabrain user',
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };
    const { error } = await supabase
      .from(VCULTURE_CONTENT_TABLE)
      .upsert(row, { onConflict: 'route_key' });
    if (error) {
      setContentFeedback(`Không lưu được nội dung: ${error.message}`);
      return;
    }
    setPortalBody(bodyToSave);
    setContentEditMode(false);
    setContentFeedback('Đã lưu bản nội dung cập nhật.');
  }

  async function resetContentOverride() {
    if (!supabase || !canManage || !portal) return;
    const { error } = await supabase
      .from(VCULTURE_CONTENT_TABLE)
      .update({
        deleted_at: new Date().toISOString(),
        updated_by_profile_id: profile?.id || null,
        updated_by_name: profile?.fullName || 'Vinabrain user',
      })
      .eq('route_key', routeMode);
    if (error) {
      setContentFeedback(`Không khôi phục được nội dung gốc: ${error.message}`);
      return;
    }
    setPortalBody(portal.body);
    setContentEditMode(false);
    setContentFeedback('Đã khôi phục về nội dung HTML gốc.');
  }

  async function importContentFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!/\.(html|htm|txt)$/i.test(file.name)) {
      setContentFeedback('Chỉ hỗ trợ import file .html, .htm hoặc .txt.');
      return;
    }
    const text = await file.text();
    const body = text.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || text;
    const cleanBody = brandForVinabrain(body.replace(/<script[\s\S]*?<\/script>/gi, ''))
      .replace('<div class="sb-item" id="nav-dashboard"', '<div class="sb-item act" id="nav-dashboard"')
      .replace('<div class="screen" id="s-dashboard"', '<div class="screen act" id="s-dashboard"');
    await saveContentOverride(cleanBody);
  }

  if (!allowedPages.includes(pageKey)) {
    return <Navigate to="/login" replace />;
  }

  if (portalLoadError) {
    return (
      <div className="vculture-portal-host vculture-portal-status">
        <div className="vculture-portal-status-card">
          <strong>Không tải được VCulture</strong>
          <span>{portalLoadError}</span>
        </div>
      </div>
    );
  }

  if (!portal) {
    return (
      <div className="vculture-portal-host vculture-portal-status">
        <div className="vculture-portal-status-card">
          <strong>Đang tải VCulture</strong>
          <span>Đang chuẩn bị nội dung chương trình.</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{portal.style}</style>
      <div
        ref={hostRef}
        className={`vculture-portal-host ${contentEditMode ? 'vc-content-editing' : ''}`}
      />
      {workflowMount
        ? createPortal(
          <VCoachingWorkflowPanel
            canManage={canManage}
            feedback={vcoachingFeedback}
            loading={vcoachingLoading}
            profiles={vcoachingState.profiles || []}
            state={vcoachingState}
            viewerProfileId={effectiveProfile?.id || ''}
            viewerRole={viewerRole}
            onExport={exportVcoachingReport}
            onMarkMaterialRead={(assignmentId) => void mutateVcoachingState({
              action: 'mark_material_read',
              assignmentId,
              materialId: 'vnpt-rising-foundation',
            }, 'Đã ghi nhận đọc tài liệu.')}
            onRefresh={() => void loadVcoachingState()}
            onSaveActionPlan={(payload) => void mutateVcoachingState({ action: 'save_action_plan', ...payload }, 'Đã lưu CTHĐ.')}
            onSaveAssignment={(payload) => void mutateVcoachingState({ action: 'save_assignment', ...payload }, 'Đã lưu phân phiên coaching.')}
            onSavePrework={(payload) => void mutateVcoachingState({ action: 'save_prework', ...payload }, 'Đã lưu pre-work.')}
            onSaveReview={(payload) => void mutateVcoachingState({ action: 'save_review', ...payload }, 'Đã lưu review của coach.')}
          />,
          workflowMount,
        )
        : null}
      {dashboardToolsMount
        ? createPortal(
          <>
            <CoachDashboardTools
              contentEditMode={contentEditMode}
              contentFeedback={contentFeedback}
              materialFeedback={materialFeedback}
              materials={materials}
              onDownload={downloadMaterialWithSignedUrl}
              onImportContent={importContentFile}
              onOpenDocs={() => openPortalMaterial('docs-van-hoa')}
              onResetContent={() => void resetContentOverride()}
              onSaveContent={() => void saveContentOverride()}
              onToggleEdit={() => setContentEditMode((current) => !current)}
              onUpload={handleSignedUpload}
            />
            <FocusTasksPanel
              canManage={canManage}
              feedback={focusTaskFeedback}
              phases={FOCUS_TASK_PHASES}
              savingKey={focusTaskSavingKey}
              statuses={focusTaskStatuses}
              onReset={() => void resetFocusTasks()}
              onToggle={(phaseId, taskKey) => void toggleFocusTask(phaseId, taskKey)}
            />
          </>,
            dashboardToolsMount,
          )
        : null}
      {materialsMounts.map((materialsMount, index) =>
        createPortal(
            <MaterialsPanel
              key={materialsMount.dataset.slotIndex || index}
              canManage={canManage}
              mode={materialsMount.dataset.slotKind === 'library' ? 'library' : 'session'}
              feedback={materialFeedback}
              form={materialForm}
              editForm={materialEditForm}
              editingMaterialId={editingMaterialId}
              materials={materials}
              portalMaterials={PORTAL_MATERIALS}
              selectedPortalMaterials={selectedPortalMaterials}
              onCancelEdit={cancelEditMaterial}
              onDelete={deleteMaterial}
              onDownload={downloadMaterialWithSignedUrl}
              onEditFormChange={setMaterialEditForm}
              onFormChange={setMaterialForm}
              onOpenPortalMaterial={openPortalMaterial}
              onSaveEdit={updateMaterial}
              onStartEdit={startEditMaterial}
              onTogglePortalMaterial={togglePortalMaterial}
              onUpload={handleSignedUpload}
            />,
            materialsMount,
          ),
      )}
    </>
  );
}

function VCoachingWorkflowPanel({
  canManage,
  feedback,
  loading,
  profiles,
  state,
  viewerProfileId,
  viewerRole,
  onExport,
  onMarkMaterialRead,
  onRefresh,
  onSaveActionPlan,
  onSaveAssignment,
  onSavePrework,
  onSaveReview,
}: {
  canManage: boolean;
  feedback: string;
  loading: boolean;
  profiles: VcoachingProfileOption[];
  state: VcoachingWorkflowState;
  viewerProfileId: string;
  viewerRole: string;
  onExport: () => void;
  onMarkMaterialRead: (assignmentId: string) => void;
  onRefresh: () => void;
  onSaveActionPlan: (payload: Record<string, unknown>) => void;
  onSaveAssignment: (payload: Record<string, unknown>) => void;
  onSavePrework: (payload: Record<string, unknown>) => void;
  onSaveReview: (payload: Record<string, unknown>) => void;
}) {
  const summary = summarizeVcoachingState(state);
  const rows = buildVcoachingExportRows(state);
  const coaches = profiles.filter((profile) => ['coach', 'coaching_admin'].includes(profile.role));
  const coachees = profiles.filter((profile) => profile.role === 'coachee');
  const [assignmentForm, setAssignmentForm] = useState({
    coacheeProfileId: '',
    coachProfileId: viewerProfileId,
    sessionLabel: 'WS0 - Phiên 1',
    groupName: 'Ban điều hành',
  });
  const [activeAssignmentId, setActiveAssignmentId] = useState('');
  const [preworkDrafts, setPreworkDrafts] = useState<Record<string, { situation: string; expectation: string; blockers: string }>>({});
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { status: string; coachComment: string }>>({});
  const [actionPlanDrafts, setActionPlanDrafts] = useState<Record<string, { objective: string; actions: string; dueDate: string; status: string }>>({});

  useEffect(() => {
    setPreworkDrafts(Object.fromEntries(state.assignments.map((assignment) => {
      const existing = state.preworks.find((item) => item.assignmentId === assignment.id);
      return [assignment.id, {
        situation: existing?.situation || '',
        expectation: existing?.expectation || '',
        blockers: existing?.blockers || '',
      }];
    })));
    setReviewDrafts(Object.fromEntries(state.assignments.map((assignment) => {
      const existing = state.reviews.find((item) => item.assignmentId === assignment.id);
      return [assignment.id, {
        status: existing?.status || 'pending',
        coachComment: existing?.coachComment || '',
      }];
    })));
    setActionPlanDrafts(Object.fromEntries(state.assignments.map((assignment) => {
      const existing = state.actionPlans.find((item) => item.assignmentId === assignment.id);
      return [assignment.id, {
        objective: existing?.objective || '',
        actions: existing?.actions || '',
        dueDate: existing?.dueDate || '',
        status: existing?.status || 'draft',
      }];
    })));
    setActiveAssignmentId((current) => current || state.assignments[0]?.id || '');
  }, [state.assignments, state.preworks, state.reviews, state.actionPlans]);

  const activeAssignment = state.assignments.find((assignment) => assignment.id === activeAssignmentId) || state.assignments[0];
  const activePrework = activeAssignment ? preworkDrafts[activeAssignment.id] || { situation: '', expectation: '', blockers: '' } : null;
  const activeReview = activeAssignment ? reviewDrafts[activeAssignment.id] || { status: 'pending', coachComment: '' } : null;
  const activeActionPlan = activeAssignment ? actionPlanDrafts[activeAssignment.id] || { objective: '', actions: '', dueDate: '', status: 'draft' } : null;
  const canEditCoacheeData = activeAssignment && (canManage || activeAssignment.coacheeProfileId === viewerProfileId);
  const canReview = activeAssignment && (canManage || activeAssignment.coachProfileId === viewerProfileId);

  function saveAssignment() {
    const coachee = coachees.find((profile) => profile.id === assignmentForm.coacheeProfileId);
    const coach = coaches.find((profile) => profile.id === assignmentForm.coachProfileId) || coaches[0];
    if (!coachee || !coach) return;
    onSaveAssignment({
      coacheeProfileId: coachee.id,
      coacheeName: coachee.fullName,
      coacheeEmail: coachee.email,
      coachProfileId: coach.id,
      coachName: coach.fullName,
      sessionLabel: assignmentForm.sessionLabel,
      groupName: assignmentForm.groupName,
      status: 'active',
    });
  }

  return (
    <div className="card vc-workflow-panel">
      <div className="vc-workflow-head">
        <div>
          <div className="vc-focus-eyebrow">VCoaching E2E</div>
          <div className="vc-focus-title">Theo dõi coaching thật</div>
          <div className="vc-focus-subtitle">Pre-work, review coach, CTHĐ, đọc tài liệu, phân phiên và xuất Excel đều đi qua API/DB.</div>
        </div>
        <div className="vc-workflow-actions">
          <button className="btn btn-gh btn-sm" onClick={onRefresh} disabled={loading}>Làm mới</button>
          <button className="btn btn-pr btn-sm" onClick={onExport} disabled={!state.assignments.length}>Excel</button>
        </div>
      </div>
      {feedback ? <TransferFeedback message={feedback} /> : null}
      <div className="vc-workflow-stats">
        <div><strong>{summary.totalCoachees}</strong><span>Coachee</span></div>
        <div><strong>{summary.materialRead.done}/{summary.totalCoachees}</strong><span>Đã đọc TL</span></div>
        <div><strong>{summary.prework.done}/{summary.totalCoachees}</strong><span>Pre-work</span></div>
        <div><strong>{summary.review.done}/{summary.totalCoachees}</strong><span>Coach review</span></div>
        <div><strong>{summary.actionPlan.done}/{summary.totalCoachees}</strong><span>CTHĐ</span></div>
      </div>

      {canManage ? (
        <div className="vc-workflow-assignment">
          <select className="fi" value={assignmentForm.coacheeProfileId} onChange={(event) => setAssignmentForm({ ...assignmentForm, coacheeProfileId: event.target.value })}>
            <option value="">Chọn coachee</option>
            {coachees.map((profile) => <option value={profile.id} key={profile.id}>{profile.fullName} · {profile.email}</option>)}
          </select>
          <select className="fi" value={assignmentForm.coachProfileId} onChange={(event) => setAssignmentForm({ ...assignmentForm, coachProfileId: event.target.value })}>
            <option value="">Chọn coach</option>
            {coaches.map((profile) => <option value={profile.id} key={profile.id}>{profile.fullName}</option>)}
          </select>
          <input className="fi" value={assignmentForm.sessionLabel} onChange={(event) => setAssignmentForm({ ...assignmentForm, sessionLabel: event.target.value })} />
          <input className="fi" value={assignmentForm.groupName} onChange={(event) => setAssignmentForm({ ...assignmentForm, groupName: event.target.value })} />
          <button className="btn btn-pr btn-sm" onClick={saveAssignment} disabled={!assignmentForm.coacheeProfileId}>Lưu phân phiên</button>
        </div>
      ) : null}

      {!state.assignments.length ? (
        <div className="vc-dashboard-empty">Chưa có phân phiên coaching. Coach/admin tạo phân phiên để coachee bắt đầu nộp pre-work và CTHĐ.</div>
      ) : (
        <div className="vc-workflow-grid">
          <div className="vc-workflow-list">
            {rows.map((row, index) => {
              const assignment = state.assignments[index];
              return (
                <button
                  className={`vc-workflow-row ${assignment.id === activeAssignment?.id ? 'is-active' : ''}`}
                  key={assignment.id}
                  onClick={() => setActiveAssignmentId(assignment.id)}
                >
                  <strong>{row.coacheeName}</strong>
                  <span>{row.sessionLabel} · {row.coachName}</span>
                  <em>{row.materialReadStatus} / {row.preworkStatus} / {row.coachReviewStatus} / {row.actionPlanStatus}</em>
                </button>
              );
            })}
          </div>
          {activeAssignment && activePrework && activeReview && activeActionPlan ? (
            <div className="vc-workflow-detail">
              <div className="vc-workflow-detail-head">
                <div>
                  <strong>{activeAssignment.coacheeName}</strong>
                  <span>{activeAssignment.sessionLabel} · {activeAssignment.groupName}</span>
                </div>
                <button className="btn btn-gh btn-xs" onClick={() => onMarkMaterialRead(activeAssignment.id)}>Đã đọc tài liệu</button>
              </div>
              <div className="vc-workflow-columns">
                <section>
                  <h3>Pre-work</h3>
                  <textarea className="fi" rows={3} disabled={!canEditCoacheeData} placeholder="Tình huống cần coaching" value={activePrework.situation} onChange={(event) => setPreworkDrafts({ ...preworkDrafts, [activeAssignment.id]: { ...activePrework, situation: event.target.value } })} />
                  <textarea className="fi" rows={3} disabled={!canEditCoacheeData} placeholder="Kỳ vọng sau phiên" value={activePrework.expectation} onChange={(event) => setPreworkDrafts({ ...preworkDrafts, [activeAssignment.id]: { ...activePrework, expectation: event.target.value } })} />
                  <textarea className="fi" rows={2} disabled={!canEditCoacheeData} placeholder="Rào cản/dữ liệu cần coach biết" value={activePrework.blockers} onChange={(event) => setPreworkDrafts({ ...preworkDrafts, [activeAssignment.id]: { ...activePrework, blockers: event.target.value } })} />
                  <button className="btn btn-pr btn-sm" disabled={!canEditCoacheeData} onClick={() => onSavePrework({ assignmentId: activeAssignment.id, ...activePrework, submit: true })}>Nộp pre-work</button>
                </section>
                <section>
                  <h3>Coach review</h3>
                  <select className="fi" disabled={!canReview} value={activeReview.status} onChange={(event) => setReviewDrafts({ ...reviewDrafts, [activeAssignment.id]: { ...activeReview, status: event.target.value } })}>
                    <option value="pending">Chờ review</option>
                    <option value="needs_more">Cần bổ sung</option>
                    <option value="approved">Đã duyệt</option>
                  </select>
                  <textarea className="fi" rows={6} disabled={!canReview} placeholder="Nhận xét/yêu cầu bổ sung của coach" value={activeReview.coachComment} onChange={(event) => setReviewDrafts({ ...reviewDrafts, [activeAssignment.id]: { ...activeReview, coachComment: event.target.value } })} />
                  <button className="btn btn-pr btn-sm" disabled={!canReview} onClick={() => onSaveReview({ assignmentId: activeAssignment.id, ...activeReview })}>Lưu review</button>
                </section>
                <section>
                  <h3>CTHĐ</h3>
                  <input className="fi" disabled={!canEditCoacheeData && !canReview} placeholder="Mục tiêu" value={activeActionPlan.objective} onChange={(event) => setActionPlanDrafts({ ...actionPlanDrafts, [activeAssignment.id]: { ...activeActionPlan, objective: event.target.value } })} />
                  <textarea className="fi" rows={4} disabled={!canEditCoacheeData && !canReview} placeholder="Hành động/cam kết" value={activeActionPlan.actions} onChange={(event) => setActionPlanDrafts({ ...actionPlanDrafts, [activeAssignment.id]: { ...activeActionPlan, actions: event.target.value } })} />
                  <input className="fi" type="date" disabled={!canEditCoacheeData && !canReview} value={activeActionPlan.dueDate} onChange={(event) => setActionPlanDrafts({ ...actionPlanDrafts, [activeAssignment.id]: { ...activeActionPlan, dueDate: event.target.value } })} />
                  <select className="fi" disabled={!canReview} value={activeActionPlan.status} onChange={(event) => setActionPlanDrafts({ ...actionPlanDrafts, [activeAssignment.id]: { ...activeActionPlan, status: event.target.value } })}>
                    <option value="draft">Nháp</option>
                    <option value="submitted">Đã gửi</option>
                    <option value="coach_feedback">Coach góp ý</option>
                    <option value="approved">Đã chốt</option>
                  </select>
                  <button className="btn btn-pr btn-sm" disabled={!canEditCoacheeData && !canReview} onClick={() => onSaveActionPlan({ assignmentId: activeAssignment.id, ...activeActionPlan, submit: true })}>Lưu CTHĐ</button>
                </section>
              </div>
            </div>
          ) : null}
        </div>
      )}
      <div className="vc-workflow-note">
        Thiếu pre-work: {summary.missing.prework.map((row) => row.coacheeName).join(', ') || 'không'} · Chưa review: {summary.pending.review.map((row) => row.coacheeName).join(', ') || 'không'}
      </div>
    </div>
  );
}

function FocusTasksPanel({
  canManage,
  feedback,
  phases,
  savingKey,
  statuses,
  onReset,
  onToggle,
}: {
  canManage: boolean;
  feedback: string;
  phases: FocusTaskPhase[];
  savingKey: string | null;
  statuses: Record<string, boolean>;
  onReset: () => void;
  onToggle: (phaseId: string, taskKey: string) => void;
}) {
  const totals = getFocusTaskTotals(statuses);
  return (
    <div className="card vc-focus-tasks">
      <div className="vc-focus-head">
        <div>
          <div className="vc-focus-eyebrow">VNPT HEART</div>
          <div className="vc-focus-title">Nhiệm vụ trọng tâm</div>
          <div className="vc-focus-subtitle">
            Checklist triển khai lưu online. Admin/coach tick là toàn bộ người dùng được quyền sẽ thấy kết quả mới nhất.
          </div>
        </div>
        <div className="vc-focus-progress">
          <div className="vc-focus-percent">{totals.percent}%</div>
          <div className="vc-focus-count">{totals.done} / {totals.total} nhiệm vụ</div>
          <div className="vc-focus-track"><div style={{ width: `${totals.percent}%` }} /></div>
        </div>
      </div>
      <div className="vc-focus-actions">
        {feedback ? <span>{feedback}</span> : <span>Kết quả được ghi vào Supabase theo từng nhiệm vụ.</span>}
        {canManage ? (
          <button className="btn btn-gh btn-sm" type="button" onClick={onReset}>
            <RotateCcw size={13} /> Đặt lại toàn bộ
          </button>
        ) : null}
      </div>
      <div className="vc-focus-grid">
        {phases.map((phase, index) => {
          const phaseDone = phase.tasks.filter((task) => statuses[getFocusTaskId(phase.id, task.key)]).length;
          const phasePercent = phase.tasks.length ? Math.round((phaseDone / phase.tasks.length) * 100) : 0;
          return (
            <section className="vc-focus-phase" key={phase.id}>
              <div className="vc-focus-phase-head">
                <div className="vc-focus-phase-number">{index + 1}</div>
                <div>
                  <h3>{phase.title}</h3>
                  <span>{phase.tag}</span>
                </div>
                <strong>{phasePercent}%</strong>
              </div>
              <div className="vc-focus-phase-track"><div style={{ width: `${phasePercent}%` }} /></div>
              <div className="vc-focus-list">
                {phase.tasks.map((task) => {
                  const taskId = getFocusTaskId(phase.id, task.key);
                  const done = Boolean(statuses[taskId]);
                  const saving = savingKey === taskId;
                  return (
                    <button
                      className={`vc-focus-task ${done ? 'is-done' : ''}`}
                      disabled={!canManage || saving}
                      key={taskId}
                      onClick={() => onToggle(phase.id, task.key)}
                      type="button"
                    >
                      <span className="vc-focus-check">{done ? <Check size={14} /> : null}</span>
                      <span className="vc-focus-key">{task.key}</span>
                      <span className="vc-focus-task-copy">
                        <span>{task.label}</span>
                        {task.owner ? <em>{task.owner}</em> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function TransferFeedback({ message }: { message: string }) {
  if (!message) return null;
  const kind = getTransferFeedbackKind(message);
  const label = kind === 'active' ? 'Đang xử lý' : kind === 'done' ? 'Hoàn tất' : kind === 'error' ? 'Cần kiểm tra' : 'Thông báo';
  return (
    <div className={`vc-transfer-feedback is-${kind}`} role="status">
      <div className="vc-transfer-feedback-head">
        <span className="vc-transfer-dot" />
        <span>{label}</span>
      </div>
      <div className="vc-transfer-feedback-message">{message}</div>
      <div className="vc-transfer-track" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

function MaterialsPanel({
  canManage,
  editForm,
  editingMaterialId,
  feedback,
  form,
  materials,
  mode,
  portalMaterials,
  selectedPortalMaterials,
  onCancelEdit,
  onDelete,
  onDownload,
  onEditFormChange,
  onFormChange,
  onOpenPortalMaterial,
  onSaveEdit,
  onStartEdit,
  onTogglePortalMaterial,
  onUpload,
}: {
  canManage: boolean;
  editForm: { name: string; chapter: string; session: string; group: string };
  editingMaterialId: string;
  feedback: string;
  form: { chapter: string; session: string; group: string };
  materials: UploadedMaterial[];
  mode: 'library' | 'session';
  portalMaterials: PortalMaterial[];
  selectedPortalMaterials: string[];
  onCancelEdit: () => void;
  onDelete: (item: UploadedMaterial) => Promise<void>;
  onDownload: (item: UploadedMaterial) => Promise<void>;
  onEditFormChange: (form: { name: string; chapter: string; session: string; group: string }) => void;
  onFormChange: (form: { chapter: string; session: string; group: string }) => void;
  onOpenPortalMaterial: (materialId: string) => void;
  onSaveEdit: (item: UploadedMaterial) => Promise<void>;
  onStartEdit: (item: UploadedMaterial) => void;
  onTogglePortalMaterial: (materialId: string) => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}) {
  const isLibrary = mode === 'library';
  const visiblePortalMaterials = isLibrary
    ? portalMaterials
    : portalMaterials.filter((item) => selectedPortalMaterials.includes(item.id));
  return (
    <div className="card vc-real-materials">
      <div className="vc-existing-materials">
        <div className="fl-sb" style={{ marginBottom: 10 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 3 }}>
              <span className="ct-icon"><BookOpen size={15} /></span> Tài liệu VNPT Rising có sẵn
            </div>
            <div style={{ fontSize: 11, color: 'var(--t2)' }}>
              {isLibrary
                ? 'Chọn các mục nền trong module Tài liệu VNPT Rising để gắn vào phiên/chương.'
                : 'Các mục đã được gắn cho phiên này. Người học mở trực tiếp trong module, không cần upload lại file.'}
            </div>
          </div>
          <span className="pill pill-t">{visiblePortalMaterials.length} mục</span>
        </div>
        <div className="vc-portal-doc-list">
          {visiblePortalMaterials.map((item) => (
            <div className="doc-item vc-portal-doc-row" key={item.id}>
              <div className="doc-icon" style={{ background: 'var(--tl)', fontSize: 16 }}>📖</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{item.title}</div>
                <div style={{ fontSize: 11, color: 'var(--t2)', marginTop: 2 }}>{item.scope}</div>
                <div style={{ marginTop: 4 }}><span className="pill pill-a">{item.tag}</span></div>
              </div>
              {canManage && isLibrary ? (
                <label className="fl" style={{ gap: 6, fontSize: 11, color: 'var(--t2)' }}>
                  <input
                    checked={selectedPortalMaterials.includes(item.id)}
                    type="checkbox"
                    onChange={() => onTogglePortalMaterial(item.id)}
                  />
                  Gắn
                </label>
              ) : null}
              <button className="btn btn-gh btn-xs" onClick={() => onOpenPortalMaterial(item.id)}>
                <ExternalLink size={11} /> Mở
              </button>
            </div>
          ))}
          {!visiblePortalMaterials.length ? (
            <div className="alert alert-bl">Chưa chọn tài liệu VNPT Rising nào cho phiên này.</div>
          ) : null}
        </div>
      </div>

      <div className="fl-sb" style={{ marginBottom: 12 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 3 }}>
            <span className="ct-icon">📎</span> {isLibrary ? 'Thư viện tài liệu upload thật' : 'File upload thật cho phiên này'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--t2)' }}>
            {isLibrary
              ? 'Gắn file theo chương, phiên/workshop và nhóm coachee. File lưu trong Supabase Storage.'
              : 'Các file dưới đây có thể tải thật. Coach/admin upload, coachee và observer được tải theo quyền.'}
          </div>
        </div>
        {canManage ? (
          <label className="btn btn-pr btn-sm vc-transfer-button">
            <FileUp size={13} /> Upload PDF/DOCX/PPTX
            <input multiple type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={onUpload} style={{ display: 'none' }} />
          </label>
        ) : (
          <span className="pill pill-gr">Chỉ tải xuống</span>
        )}
      </div>
      {canManage ? (
        <div className="g3" style={{ marginBottom: 12 }}>
          <label>
            <span className="ft">Chương</span>
            <input className="fi" value={form.chapter} onChange={(event) => onFormChange({ ...form, chapter: event.target.value })} />
          </label>
          <label>
            <span className="ft">Phiên</span>
            <input className="fi" value={form.session} onChange={(event) => onFormChange({ ...form, session: event.target.value })} />
          </label>
          <label>
            <span className="ft">Nhóm coachee</span>
            <input className="fi" value={form.group} onChange={(event) => onFormChange({ ...form, group: event.target.value })} />
          </label>
        </div>
      ) : null}
      <TransferFeedback message={feedback} />
      <table className="tbl">
        <thead>
          <tr>
            <th>Tài liệu</th>
            <th>Gắn với</th>
            <th>Nhóm</th>
            <th>Người tải</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {!materials.length ? (
            <tr>
              <td colSpan={5}>
                <div style={{ color: 'var(--t2)' }}>
                  Chưa có file upload thật. Coach/admin upload tài liệu tại đây, sau đó coachee và observer tải xuống bằng link ký số từ Supabase Storage.
                </div>
              </td>
            </tr>
          ) : null}
          {materials.map((item) => {
            const isEditing = canManage && editingMaterialId === item.id;
            return (
              <tr className={`vc-transfer-row ${isEditing ? 'is-editing' : ''}`} key={item.id}>
                <td>
                  {isEditing ? (
                    <input
                      aria-label="Tên tài liệu"
                      className="fi vc-material-edit-input"
                      value={editForm.name}
                      onChange={(event) => onEditFormChange({ ...editForm, name: event.target.value })}
                    />
                  ) : (
                    <>
                      <strong>{item.name}</strong>
                      <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{formatFileSize(item.size)} · {item.uploadedAt}</div>
                    </>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <div className="vc-material-edit-stack">
                      <input
                        aria-label="Chương"
                        className="fi vc-material-edit-input"
                        value={editForm.chapter}
                        onChange={(event) => onEditFormChange({ ...editForm, chapter: event.target.value })}
                      />
                      <input
                        aria-label="Phiên"
                        className="fi vc-material-edit-input"
                        value={editForm.session}
                        onChange={(event) => onEditFormChange({ ...editForm, session: event.target.value })}
                      />
                    </div>
                  ) : (
                    <>
                      {item.chapter}
                      <div style={{ fontSize: 10.5, color: 'var(--t3)' }}>{item.session}</div>
                    </>
                  )}
                </td>
                <td>
                  {isEditing ? (
                    <input
                      aria-label="Nhóm coachee"
                      className="fi vc-material-edit-input"
                      value={editForm.group}
                      onChange={(event) => onEditFormChange({ ...editForm, group: event.target.value })}
                    />
                  ) : (
                    item.group
                  )}
                </td>
                <td>{item.owner}</td>
                <td>
                  <div className="vc-material-actions">
                    {isEditing ? (
                      <>
                        <button className="btn btn-pr btn-xs vc-transfer-button" onClick={() => void onSaveEdit(item)}>
                          <Save size={11} /> Lưu
                        </button>
                        <button className="btn btn-gh btn-xs" onClick={onCancelEdit}>
                          <X size={11} /> Hủy
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="btn btn-pr btn-xs vc-transfer-button" onClick={() => void onDownload(item)}>
                          <Download size={11} /> Tải xuống
                        </button>
                        {canManage ? (
                          <>
                            <button className="btn btn-gh btn-xs" onClick={() => onStartEdit(item)}>
                              <Pencil size={11} /> Sửa
                            </button>
                            <button className="btn btn-ol btn-xs" onClick={() => void onDelete(item)}>
                              <Trash2 size={11} /> Xóa
                            </button>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoachDashboardTools({
  contentEditMode,
  contentFeedback,
  materialFeedback,
  materials,
  onDownload,
  onImportContent,
  onOpenDocs,
  onResetContent,
  onSaveContent,
  onToggleEdit,
  onUpload,
}: {
  contentEditMode: boolean;
  contentFeedback: string;
  materialFeedback: string;
  materials: UploadedMaterial[];
  onDownload: (item: UploadedMaterial) => Promise<void>;
  onImportContent: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  onOpenDocs: () => void;
  onResetContent: () => void;
  onSaveContent: () => void;
  onToggleEdit: () => void;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}) {
  return (
    <div className="card vc-dashboard-tools">
      <div className="fl-sb" style={{ alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div className="card-title" style={{ marginBottom: 4 }}>
            <span className="ct-icon">🛠️</span> Quản lý nội dung & tài liệu
          </div>
          <div style={{ color: 'var(--t2)', fontSize: 12 }}>
            Khu vực này chỉ hiển thị cho coach/admin. Dùng để sửa nội dung phiên, import HTML/TXT, upload và tải tài liệu đọc trước.
          </div>
          {contentFeedback ? <div className="vc-dashboard-feedback">{contentFeedback}</div> : null}
        </div>
        <div className="vc-dashboard-tool-actions">
          <div className="vc-dashboard-tool-group">
            <span>Nội dung phiên</span>
            <button className={`btn ${contentEditMode ? 'btn-a' : 'btn-pr'} btn-sm`} onClick={onToggleEdit}>
              <Pencil size={13} /> {contentEditMode ? 'Tắt sửa' : 'Bật sửa'}
            </button>
            <button className="btn btn-pr btn-sm" disabled={!contentEditMode} onClick={onSaveContent}>
              <Save size={13} /> Lưu thay đổi
            </button>
            <label className="btn btn-gh btn-sm">
              Import nội dung
              <input type="file" accept=".html,.htm,.txt" onChange={onImportContent} style={{ display: 'none' }} />
            </label>
            <button className="btn btn-ol btn-sm" onClick={onResetContent}>
              <RotateCcw size={13} /> Khôi phục gốc
            </button>
          </div>
          <div className="vc-dashboard-tool-group">
            <span>Tài liệu</span>
            <button className="btn btn-gh btn-sm" onClick={onOpenDocs}>
              <BookOpen size={13} /> Mở thư viện
            </button>
            <label className="btn btn-pr btn-sm vc-transfer-button">
              <FileUp size={13} /> Upload file
              <input multiple type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" onChange={onUpload} style={{ display: 'none' }} />
            </label>
          </div>
        </div>
      </div>
      <div className="vc-dashboard-files">
        <div className="vc-dashboard-files-title">File đã upload thật</div>
        <TransferFeedback message={materialFeedback} />
        {materials.length ? (
          materials.slice(0, 4).map((item) => (
            <div className="vc-dashboard-file-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.chapter} · {item.session} · {formatFileSize(item.size)}</span>
              </div>
              <button className="btn btn-gh btn-xs vc-transfer-button" onClick={() => void onDownload(item)}>
                <Download size={11} /> Tải xuống
              </button>
            </div>
          ))
        ) : (
          <div className="vc-dashboard-empty">Chưa có file upload thật. Bấm Upload tài liệu để thêm file PDF/DOCX/PPTX.</div>
        )}
      </div>
    </div>
  );
}

const PORTAL_PATCH_CSS = `
.vculture-portal-host{height:100vh;display:flex;overflow:hidden;background:#F8FAFC;color:var(--tx)}
.vculture-portal-host #sb{width:var(--sw);height:100vh}
.vculture-portal-host #main{height:100vh}
.vculture-portal-host .screen input[type="checkbox"]{width:auto!important;height:auto!important;min-width:0!important;min-height:0!important;accent-color:var(--t)}
.vculture-portal-host .btn.is-disabled{opacity:.45;cursor:not-allowed}
.vculture-portal-host .vc-real-materials{border-left:3px solid var(--t)}
.vculture-portal-host .vc-existing-materials{border-bottom:1px solid var(--bd);margin-bottom:14px;padding-bottom:12px}
.vculture-portal-host .vc-portal-doc-row{cursor:default}
.vculture-portal-host .vc-portal-doc-row .btn,.vculture-portal-host .vc-portal-doc-row label{flex-shrink:0}
.vculture-portal-host .vc-role-hidden{display:none!important}
.vculture-portal-host .vc-doc-tools-panel{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:10px 0 12px;padding:12px;border:1px solid var(--bd);border-left:3px solid var(--t);border-radius:9px;background:#fff}
.vculture-portal-host .vc-doc-tools-panel[hidden]{display:none!important}
.vculture-portal-host .vc-doc-tools-panel strong{display:block;font-size:13px;color:var(--tx);margin-bottom:3px}
.vculture-portal-host .vc-doc-tools-panel span{display:block;font-size:11px;color:var(--t2)}
.vculture-portal-host .vc-doc-tools-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.vculture-portal-host .vc-doc-picker{display:none;flex-basis:100%;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;border-top:1px solid var(--bd);padding-top:10px}
.vculture-portal-host .vc-doc-tools-panel.is-picker-open .vc-doc-picker{display:grid}
.vculture-portal-host .vc-doc-picker label{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--tx);padding:8px;border:1px solid var(--bd);border-radius:8px;background:#F8FAFC}
.vculture-portal-host #topbar{position:relative}
.vculture-portal-host .vc-account-menu{position:fixed;right:14px;top:44px;z-index:2147483647;width:180px;background:#FFFFFF;border:1px solid #CBD5E1;border-radius:10px;box-shadow:0 16px 36px rgba(15,23,42,.16);padding:10px}
.vculture-portal-host .vc-account-menu-name{font-size:12px;font-weight:800;color:#0F172A;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vculture-portal-host .vc-account-menu-role{font-size:11px;color:#64748B;margin:2px 0 10px;text-transform:capitalize}
.vculture-portal-host .vc-signout-btn{width:100%;height:32px;white-space:nowrap;border:1px solid #CBD5E1;border-radius:8px;background:#FFFFFF;color:#0F172A;font-size:12px;font-weight:800;padding:0 12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.vculture-portal-host .vc-signout-btn:hover{border-color:#0F766E;color:#0F766E;background:#F0FDFA}
.vculture-portal-host .vc-transfer-button{position:relative;overflow:hidden;isolation:isolate;box-shadow:0 8px 18px rgba(10,78,163,.12);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.vculture-portal-host .vc-transfer-button::before{content:"";position:absolute;inset:0;background:linear-gradient(100deg,transparent 0%,rgba(255,255,255,.18) 35%,rgba(255,255,255,.42) 50%,rgba(255,255,255,.18) 65%,transparent 100%);transform:translateX(-120%);z-index:-1}
.vculture-portal-host .vc-transfer-button:hover{transform:translateY(-1px);box-shadow:0 12px 24px rgba(10,78,163,.16)}
.vculture-portal-host .vc-transfer-button:hover::before{animation:vcTransferSheen 1.4s ease infinite}
.vculture-portal-host .vc-transfer-row{transition:background .18s ease}
.vculture-portal-host .vc-transfer-row:hover{background:#F8FBFF}
.vculture-portal-host .vc-native-upload-status{position:relative;overflow:hidden;font-size:12px;color:#0F766E;background:#ECFDF5;border:1px solid #99F6E4;border-radius:8px;padding:9px 10px 15px;margin:8px 0;box-shadow:0 10px 24px rgba(15,118,110,.09)}
.vculture-portal-host .vc-native-upload-status::after{content:"";position:absolute;left:10px;right:10px;bottom:7px;height:4px;border-radius:999px;background:linear-gradient(90deg,#6D35D9,#0A4EA3,#19C2C2,#E2403B);background-size:220% 100%;animation:vcTransferGradient 1.45s linear infinite}
.vculture-portal-host .vc-transfer-feedback{position:relative;overflow:hidden;border:1px solid #BFE7E2;border-radius:10px;background:#F0FDFA;color:#0F766E;padding:10px 12px 13px;margin:10px 0;box-shadow:0 12px 28px rgba(15,118,110,.08)}
.vculture-portal-host .vc-transfer-feedback.is-done{border-color:#BBF7D0;background:#F0FDF4;color:#166534}
.vculture-portal-host .vc-transfer-feedback.is-error{border-color:#FECACA;background:#FEF2F2;color:#991B1B}
.vculture-portal-host .vc-transfer-feedback.is-note{border-color:#DBE7F6;background:#F8FAFC;color:#334155}
.vculture-portal-host .vc-transfer-feedback-head{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.vculture-portal-host .vc-transfer-dot{width:7px;height:7px;border-radius:999px;background:currentColor;box-shadow:0 0 0 4px color-mix(in srgb,currentColor 13%,transparent)}
.vculture-portal-host .vc-transfer-feedback-message{font-size:12px;color:inherit}
.vculture-portal-host .vc-transfer-track{position:absolute;left:12px;right:12px;bottom:7px;height:4px;border-radius:999px;background:rgba(15,23,42,.08);overflow:hidden}
.vculture-portal-host .vc-transfer-track>span{display:block;width:100%;height:100%;border-radius:999px;background:linear-gradient(90deg,#6D35D9,#0A4EA3,#19C2C2,#E2403B);background-size:220% 100%;transform-origin:left center}
.vculture-portal-host .vc-transfer-feedback.is-active .vc-transfer-track>span{animation:vcTransferGradient 1.35s linear infinite}
.vculture-portal-host .vc-transfer-feedback.is-done .vc-transfer-track>span{background:linear-gradient(90deg,#0F766E,#22C55E);animation:none}
.vculture-portal-host .vc-transfer-feedback.is-error .vc-transfer-track>span{background:linear-gradient(90deg,#DC2626,#F97316);animation:none}
.vculture-portal-host .vc-transfer-feedback.is-note .vc-transfer-track>span{background:linear-gradient(90deg,#64748B,#CBD5E1);animation:none}
.vculture-portal-host .vc-dashboard-tools{border-left:3px solid var(--t);margin-bottom:16px}
.vculture-portal-host .vc-dashboard-tool-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}
.vculture-portal-host .vc-dashboard-tool-group{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:8px;border:1px solid var(--bd);border-radius:8px;background:#fff}
.vculture-portal-host .vc-dashboard-tool-group>span{font-size:10px;font-weight:900;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;margin-right:2px}
.vculture-portal-host .vc-dashboard-feedback{margin-top:8px;color:var(--t2);font-size:11px}
.vculture-portal-host .vc-dashboard-files{border-top:1px solid var(--bd);margin-top:12px;padding-top:10px}
.vculture-portal-host .vc-dashboard-files-title{font-size:11px;font-weight:800;color:var(--t2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:8px}
.vculture-portal-host .vc-dashboard-file-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--bd)}
.vculture-portal-host .vc-dashboard-file-row:last-child{border-bottom:0}
.vculture-portal-host .vc-dashboard-file-row strong{display:block;font-size:12px}
.vculture-portal-host .vc-dashboard-file-row span{display:block;font-size:10.5px;color:var(--t3);margin-top:2px}
.vculture-portal-host .vc-dashboard-empty{font-size:12px;color:var(--t2);background:#F8FAFC;border:1px dashed var(--bd);border-radius:8px;padding:10px}
.vculture-portal-host .vc-workflow-panel{border-left:3px solid #0F766E;margin-bottom:16px}
.vculture-portal-host .vc-workflow-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;border-bottom:1px solid var(--bd);padding-bottom:12px}
.vculture-portal-host .vc-workflow-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.vculture-portal-host .vc-workflow-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:12px 0}
.vculture-portal-host .vc-workflow-stats>div{border:1px solid var(--bd);border-radius:8px;background:#fff;padding:10px}
.vculture-portal-host .vc-workflow-stats strong{display:block;font-size:20px;color:#0F766E}
.vculture-portal-host .vc-workflow-stats span{font-size:10.5px;color:var(--t2);font-weight:800;text-transform:uppercase}
.vculture-portal-host .vc-workflow-assignment{display:grid;grid-template-columns:1.2fr 1fr .9fr .9fr auto;gap:8px;margin:10px 0;padding:10px;border:1px solid var(--bd);border-radius:8px;background:#F8FAFC}
.vculture-portal-host .vc-workflow-grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:12px}
.vculture-portal-host .vc-workflow-list{display:flex;flex-direction:column;gap:8px;max-height:560px;overflow:auto}
.vculture-portal-host .vc-workflow-row{border:1px solid var(--bd);border-radius:8px;background:#fff;text-align:left;padding:10px;cursor:pointer;color:var(--tx)}
.vculture-portal-host .vc-workflow-row.is-active{border-color:#0F766E;background:#F0FDFA}
.vculture-portal-host .vc-workflow-row strong,.vculture-portal-host .vc-workflow-row span,.vculture-portal-host .vc-workflow-row em{display:block}
.vculture-portal-host .vc-workflow-row span{font-size:11px;color:var(--t2);margin-top:3px}
.vculture-portal-host .vc-workflow-row em{font-style:normal;font-size:10.5px;color:#0F766E;margin-top:5px}
.vculture-portal-host .vc-workflow-detail{border:1px solid var(--bd);border-radius:8px;background:#fff;padding:12px}
.vculture-portal-host .vc-workflow-detail-head{display:flex;align-items:center;justify-content:space-between;gap:10px;border-bottom:1px solid var(--bd);padding-bottom:10px;margin-bottom:10px}
.vculture-portal-host .vc-workflow-detail-head strong,.vculture-portal-host .vc-workflow-detail-head span{display:block}
.vculture-portal-host .vc-workflow-detail-head span{font-size:11px;color:var(--t2);margin-top:3px}
.vculture-portal-host .vc-workflow-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.vculture-portal-host .vc-workflow-columns section{display:flex;flex-direction:column;gap:8px;min-width:0}
.vculture-portal-host .vc-workflow-columns h3{font-size:13px;margin:0;color:var(--tx)}
.vculture-portal-host .vc-workflow-note{margin-top:10px;font-size:11px;color:var(--t2)}
.vculture-portal-host .vc-transfer-row.is-editing{background:#F8FBFF}
.vculture-portal-host .vc-material-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.vculture-portal-host .vc-material-edit-stack{display:grid;gap:6px}
.vculture-portal-host .vc-material-edit-input{height:34px;padding:7px 9px;font-size:12px}
.vculture-portal-host .vc-native-material-panel{border-left:3px solid var(--t);margin:10px 0 12px}
.vculture-portal-host .vc-native-file-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid var(--bd)}
.vculture-portal-host .vc-native-file-row:first-child{border-top:0}
.vculture-portal-host .vc-native-file-row strong{display:block;font-size:12px}
.vculture-portal-host .vc-native-file-row span{display:block;font-size:10.5px;color:var(--t3);margin-top:2px}
.vculture-portal-host .vc-focus-tasks{border-left:3px solid #E2403B;margin-bottom:16px}
.vculture-portal-host .vc-focus-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:14px;border-bottom:1px solid var(--bd)}
.vculture-portal-host .vc-focus-eyebrow{display:inline-flex;align-items:center;font-size:11px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#0A4EA3;background:#EEF4FC;border:1px solid #DBE7F6;border-radius:999px;padding:4px 10px;margin-bottom:8px}
.vculture-portal-host .vc-focus-title{font-family:var(--font-display);font-size:26px;font-weight:900;color:#06336B;letter-spacing:-.02em}
.vculture-portal-host .vc-focus-subtitle{font-size:12px;color:var(--t2);max-width:620px;margin-top:4px}
.vculture-portal-host .vc-focus-progress{min-width:190px;text-align:right}
.vculture-portal-host .vc-focus-percent{font-family:var(--font-display);font-size:34px;font-weight:900;color:#E2403B;line-height:1}
.vculture-portal-host .vc-focus-count{font-size:11px;font-weight:800;color:var(--t2);margin:4px 0 8px}
.vculture-portal-host .vc-focus-track,.vculture-portal-host .vc-focus-phase-track{height:8px;border-radius:999px;background:#E2E8F0;overflow:hidden}
.vculture-portal-host .vc-focus-track>div,.vculture-portal-host .vc-focus-phase-track>div{height:100%;border-radius:999px;background:linear-gradient(90deg,#0A4EA3,#E2403B);transition:width .25s ease}
.vculture-portal-host .vc-focus-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;color:var(--t2);font-size:11px}
.vculture-portal-host .vc-focus-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.vculture-portal-host .vc-focus-phase{border:1px solid var(--bd);border-radius:12px;background:#FFFFFF;padding:14px}
.vculture-portal-host .vc-focus-phase-head{display:grid;grid-template-columns:auto 1fr auto;align-items:start;gap:10px;margin-bottom:10px}
.vculture-portal-host .vc-focus-phase-number{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#0A4EA3,#06336B);color:#fff;display:grid;place-items:center;font-weight:900}
.vculture-portal-host .vc-focus-phase h3{font-size:14px;line-height:1.3;margin:0;color:var(--tx)}
.vculture-portal-host .vc-focus-phase span{font-size:10.5px;color:var(--t2)}
.vculture-portal-host .vc-focus-phase strong{font-size:12px;color:#E2403B}
.vculture-portal-host .vc-focus-list{display:flex;flex-direction:column;margin-top:10px}
.vculture-portal-host .vc-focus-task{width:100%;display:grid;grid-template-columns:auto auto 1fr;align-items:start;gap:9px;text-align:left;background:transparent;border:0;border-top:1px solid var(--bd);padding:10px 0;color:var(--tx);cursor:pointer}
.vculture-portal-host .vc-focus-task:first-child{border-top:0}
.vculture-portal-host .vc-focus-task:disabled{cursor:default}
.vculture-portal-host .vc-focus-check{width:22px;height:22px;border-radius:7px;border:2px solid #CBD5E1;background:#fff;color:#fff;display:grid;place-items:center;transition:.2s}
.vculture-portal-host .vc-focus-task.is-done .vc-focus-check{background:#1F9D6B;border-color:#1F9D6B}
.vculture-portal-host .vc-focus-key{width:24px;height:24px;border-radius:7px;background:#F1F5F9;color:#64748B;display:grid;place-items:center;font-size:11px;font-weight:900}
.vculture-portal-host .vc-focus-task-copy>span{display:block;font-size:12.5px;color:var(--tx)}
.vculture-portal-host .vc-focus-task-copy em{display:inline-flex;font-style:normal;font-size:10.5px;font-weight:800;color:#06336B;background:#EEF4FC;border-radius:999px;padding:2px 8px;margin-top:5px}
.vculture-portal-host .vc-focus-task.is-done .vc-focus-task-copy>span{color:#94A3B8;text-decoration:line-through;text-decoration-color:#CBD5E1}
.vculture-portal-host .vc-prep-hidden-for-coach{display:none!important}
.vculture-portal-host .vc-editable-candidate{position:relative}
.vculture-portal-host .vc-edit-pencil{position:absolute;top:6px;right:6px;width:24px;height:24px;border:1px solid var(--bd);border-radius:6px;background:#fff;color:var(--t);box-shadow:0 4px 10px rgba(15,23,42,.12);font-size:13px;line-height:1;display:flex;align-items:center;justify-content:center;opacity:0;pointer-events:none;z-index:5}
.vculture-portal-host .vc-editable-candidate:hover>.vc-edit-pencil,.vculture-portal-host.vc-content-editing .vc-edit-pencil{opacity:1;pointer-events:auto}
.vculture-portal-host .vc-edit-pencil:hover{background:var(--tl);border-color:var(--t)}
.vculture-portal-host.vc-content-editing .vc-editable-block{outline:1.5px dashed var(--t);outline-offset:2px;background:rgba(37,99,235,.04)}
.vculture-portal-host.vc-content-editing .vc-editable-block:focus{outline:2px solid var(--t);background:#fff}
@keyframes vcTransferGradient{0%{background-position:0% 50%}100%{background-position:220% 50%}}
@keyframes vcTransferSheen{0%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
@media(prefers-reduced-motion:reduce){
  .vculture-portal-host .vc-transfer-button,
  .vculture-portal-host .vc-transfer-row,
  .vculture-portal-host .vc-focus-track>div,
  .vculture-portal-host .vc-focus-phase-track>div{transition:none}
  .vculture-portal-host .vc-transfer-button:hover{transform:none}
  .vculture-portal-host .vc-transfer-button::before,
  .vculture-portal-host .vc-native-upload-status::after,
  .vculture-portal-host .vc-transfer-feedback.is-active .vc-transfer-track>span{animation:none}
}
@media(max-width:900px){
  .vculture-portal-host{display:block;overflow:auto;height:auto;min-height:100vh}
  .vculture-portal-host #sb{width:100%;height:auto;max-height:42vh}
  .vculture-portal-host #main{height:auto;min-height:58vh}
  .vculture-portal-host .g2,.vculture-portal-host .g3,.vculture-portal-host .g4,.vculture-portal-host .g5{grid-template-columns:1fr!important}
  .vculture-portal-host #topbar{height:auto;min-height:var(--th);flex-wrap:wrap;padding:9px 12px}
  .vculture-portal-host #content{padding:14px}
  .vculture-portal-host .vc-dashboard-tool-actions{justify-content:flex-start}
  .vculture-portal-host .vc-dashboard-file-row{align-items:flex-start;flex-direction:column}
  .vculture-portal-host .vc-workflow-head{display:block}
  .vculture-portal-host .vc-workflow-actions{justify-content:flex-start;margin-top:10px}
  .vculture-portal-host .vc-workflow-stats{grid-template-columns:repeat(2,minmax(0,1fr))}
  .vculture-portal-host .vc-workflow-assignment{grid-template-columns:1fr}
  .vculture-portal-host .vc-workflow-grid{grid-template-columns:1fr}
  .vculture-portal-host .vc-workflow-columns{grid-template-columns:1fr}
  .vculture-portal-host .vc-focus-head{display:block}
  .vculture-portal-host .vc-focus-progress{text-align:left;margin-top:12px}
  .vculture-portal-host .vc-focus-grid{grid-template-columns:1fr}
  .vculture-portal-host .vc-focus-actions{align-items:flex-start;flex-direction:column}
  .vculture-portal-host .vc-doc-picker{grid-template-columns:1fr}
  .vculture-portal-host .vc-doc-tools-actions{justify-content:flex-start}
}
`;

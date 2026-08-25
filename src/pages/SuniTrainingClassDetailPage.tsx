import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CalendarDays, Download, FileText, Gamepad2, ListChecks, MessageCircle, Trash2, Upload, Users } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useToast } from '@/components/system/ToastProvider';
import {
  isClassAssignedToCustomer,
  parseSuniClassStudentImportRows,
  SuniApiError,
  suniTrainingApi,
  type SuniAgendaPayload,
  type SuniClassStudent,
  type SuniClassStudentImportRow,
  type SuniTrainingAgenda,
  type SuniTrainingClassActivity,
  type SuniTrainingMaterial,
  type SuniTrainingResult,
  type SuniUser,
} from '@/lib/suni';
import { VDiscussionApiError, isDiscussionLibraryTemplate, vdiscussionApi, type VDiscussionGroupMonitorSummary, type VDiscussionStatus } from '@/lib/suniDiscussion';
import { queries as discussionQueries } from '@/features/vdiscussion';
import { queries as sharedQueries } from '@/features/shared';
import { queries as trainingQueries } from '@/features/vtraining';
import { buildQuizShareLink, deleteVTrainingQuizSubmission, listQuizSubmissions, scoreQuizAnswers, getQuizQuestionSetBundle, updateQuizFormStatus, type QuizSubmission } from '@/lib/quiz';
import { getDefaultGameCatalog } from '@/lib/gameCatalog';
import { clearPlxGameSession, deletePlxGameParticipants, deletePlxGameRuns, getOrCreatePlxParticipantId, savePlxGameSession } from '@/lib/plxGame';
import {
  PLX_REFLECTION_LIBRARY_TITLE,
  trainingLibraryApi,
  type TrainingActivitySubmission,
  type TrainingLibraryItem,
} from '@/lib/trainingLibrary';
import { buildTrainingCompletionRows, summarizeTrainingCompletion, type TrainingCompletionRow } from '@/lib/trainingCompletionExport';
import { buildQuizScoresByProfile } from '@/lib/trainingQuizScoreMatcher';
import { useAuth } from '@/contexts/AuthContext';
import { isTrainingAdminRole, normalizeAppRole } from '@/data/vcontent';
import { buildRuntimeRefetchInterval, getRuntimePollMs, getScaleAwarePollMs } from '@/lib/runtimeLoadMode';
import { buildStudentClassOverview } from '@/features/vtraining/domain/classOverview';
import { DEFAULT_REFLECTION_DURATION_MINUTES, formatReflectionQuestionPrompt, normalizeReflectionDurationMinutes } from '@/features/vtraining/domain/reflectionActivity';
import { getRumDurationMs, getRumStartedAt, reportVLearningRum } from '@/lib/rum';

type ClassDetailTab = 'overview' | 'students' | 'agenda' | 'materials' | 'results' | 'discussion' | 'quiz' | 'reflection' | 'game' | 'customerContacts';

const CLASS_DETAIL_STALE_MS = 60 * 1000;
const ClassResultsPanel = lazy(() => import('@/pages/vtraining/ClassResultsPanel').then((module) => ({ default: module.ClassResultsPanel })));

function normalizeClassDetailTab(value?: string): ClassDetailTab {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'students') return 'students';
  if (normalized === 'agenda') return 'agenda';
  if (normalized === 'materials') return 'materials';
  if (normalized === 'results') return 'results';
  if (normalized === 'discussions' || normalized === 'discussion') return 'discussion';
  if (normalized === 'quizzes' || normalized === 'quiz') return 'quiz';
  if (normalized === 'reflections' || normalized === 'reflection') return 'reflection';
  if (normalized === 'games' || normalized === 'game') return 'game';
  if (normalized === 'customer-contacts' || normalized === 'customercontacts') return 'customerContacts';
  return 'overview';
}

function classTabPath(classId: string, tab: ClassDetailTab) {
  const base = `/vtraining/classes/${classId}`;
  if (tab === 'overview') return base;
  if (tab === 'discussion') return `${base}/discussions`;
  if (tab === 'quiz') return `${base}/quizzes`;
  if (tab === 'reflection') return `${base}/reflections`;
  if (tab === 'game') return `${base}/games`;
  if (tab === 'customerContacts') return `${base}/customer-contacts`;
  return `${base}/${tab}`;
}

function isPlxReflectionLibraryItem(item?: TrainingLibraryItem | null) {
  if (!item) return false;
  const variants = Array.isArray(item.metadata?.variants) ? item.metadata.variants : [];
  const haystack = [
    item.id,
    item.sourceId,
    item.title,
    item.description,
    ...variants.map((variant) => JSON.stringify(variant || {})),
  ].join(' ');
  return item.title === PLX_REFLECTION_LIBRARY_TITLE || /(?:^|[^a-z0-9])plx(?:[^a-z0-9]|$)|petrolimex/i.test(haystack);
}

function getReflectionLibraryDurationMinutes(item?: TrainingLibraryItem | null) {
  if (!item) return DEFAULT_REFLECTION_DURATION_MINUTES;
  if (isPlxReflectionLibraryItem(item)) return 30;
  const metadataDuration = normalizeReflectionDurationMinutes(item.metadata?.durationMinutes as number | string | null | undefined);
  return metadataDuration || DEFAULT_REFLECTION_DURATION_MINUTES;
}

type SingleStudentFormState = {
  fullName: string;
  groupName: string;
  email: string;
  studentCode: string;
  department: string;
  position: string;
};

type CustomerContactFormState = {
  profileId: string;
  fullName: string;
  email: string;
};

const EMPTY_SINGLE_STUDENT_FORM: SingleStudentFormState = {
  fullName: '',
  groupName: '',
  email: '',
  studentCode: '',
  department: '',
  position: '',
};

const EMPTY_CUSTOMER_CONTACT_FORM: CustomerContactFormState = {
  profileId: '',
  fullName: '',
  email: '',
};

const STUDENT_IMPORT_TEMPLATE_ROWS = [
  ['ho_ten', 'nhom', 'email', 'don_vi', 'chuc_vu'],
  ['Nguyễn Văn A', '1', 'nguyenvana@example.com', 'Phòng Kinh doanh', 'Chuyên viên'],
  ['Trần Thị B', '2', 'tranthib@example.com', 'Phòng Nhân sự', 'Trưởng nhóm'],
];

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError || error instanceof VDiscussionApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác.';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatTime(value?: string | null) {
  if (!value) return '-';
  return String(value).slice(0, 5);
}

function formatBytes(value?: number | null) {
  if (!value) return '-';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getClassDiscussionStatusLabel(status: string) {
  if (status === 'active' || status === 'published' || status === 'open') return 'Đang phát hành';
  if (status === 'completed' || status === 'closed') return 'Chưa phát hành';
  if (status === 'archived') return 'Lưu trữ';
  return 'Bản nháp';
}

function getClassDiscussionStatusTone(status: string): 'danger' | 'warning' | 'success' | 'violet' | 'neutral' {
  if (status === 'active' || status === 'published' || status === 'open') return 'success';
  if (status === 'completed' || status === 'closed') return 'neutral';
  if (status === 'archived') return 'violet';
  return 'warning';
}

function emptyAgenda(courseId: string, classId: string): SuniAgendaPayload {
  return {
    courseId,
    classId,
    sessionNo: 1,
    sessionDate: '',
    startTime: '',
    endTime: '',
    title: '',
    description: '',
  };
}

type AgendaContentLine = {
  id: string;
  agendaId?: string;
  startTime: string;
  endTime: string;
  title: string;
  description: string;
};

type ParsedAgendaRow = SuniAgendaPayload & {
  rowNumber: number;
  columnNumber?: number;
};

function createAgendaContentLine(input?: Partial<AgendaContentLine>): AgendaContentLine {
  return {
    id: input?.id || `agenda-line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agendaId: input?.agendaId,
    startTime: input?.startTime || '',
    endTime: input?.endTime || '',
    title: input?.title || '',
    description: input?.description || '',
  };
}

function normalizeAgendaCell(value: string) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAgendaToken(value: string) {
  return normalizeAgendaCell(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function addDaysToIsoDate(value: string | null | undefined, offset: number) {
  if (!value) return '';
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function parseAgendaSessionNo(value: string) {
  const match = normalizeAgendaToken(value).match(/\bbuoi\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseAgendaDayIndex(value: string) {
  const match = normalizeAgendaToken(value).match(/\bngay\s*(\d+)/);
  return match ? Number(match[1]) : null;
}

function parseAgendaTimeRange(value: string) {
  const compact = normalizeAgendaCell(value)
    .replace(/[–—]/g, '-')
    .replace(/[hH]/g, ':')
    .replace(/\s*:\s*/g, ':')
    .replace(/(\d)\s+(?=\d)/g, '$1')
    .replace(/\s*-\s*/g, '-');
  const match = compact.match(/(\d{1,2})[:.](\d{1,2})-(\d{1,2})[:.](\d{1,2})/);
  if (!match) return { startTime: '', endTime: '' };
  const [, startHour, startMinute, endHour, endMinute] = match;
  const normalizePart = (hour: string, minute: string) => `${hour.padStart(2, '0')}:${minute.padStart(2, '0').slice(0, 2)}`;
  return {
    startTime: normalizePart(startHour, startMinute),
    endTime: normalizePart(endHour, endMinute),
  };
}

function deterministicUuid(value: string) {
  let hash1 = 0xdeadbeef;
  let hash2 = 0x41c6ce57;
  let hash3 = 0xc0decafe;
  let hash4 = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    hash1 = Math.imul(hash1 ^ char, 2654435761);
    hash2 = Math.imul(hash2 ^ char, 1597334677);
    hash3 = Math.imul(hash3 ^ char, 2246822507);
    hash4 = Math.imul(hash4 ^ char, 3266489909);
  }
  hash1 = Math.imul(hash1 ^ (hash1 >>> 16), 2246822507) ^ Math.imul(hash2 ^ (hash2 >>> 13), 3266489909);
  hash2 = Math.imul(hash2 ^ (hash2 >>> 16), 2246822507) ^ Math.imul(hash3 ^ (hash3 >>> 13), 3266489909);
  hash3 = Math.imul(hash3 ^ (hash3 >>> 16), 2246822507) ^ Math.imul(hash4 ^ (hash4 >>> 13), 3266489909);
  hash4 = Math.imul(hash4 ^ (hash4 >>> 16), 2246822507) ^ Math.imul(hash1 ^ (hash1 >>> 13), 3266489909);
  const bytes = [hash1, hash2, hash3, hash4].flatMap((hash) => [
    (hash >>> 24) & 0xff,
    (hash >>> 16) & 0xff,
    (hash >>> 8) & 0xff,
    hash & 0xff,
  ]);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function agendaImportId(classId: string, row: Pick<ParsedAgendaRow, 'rowNumber' | 'sessionNo' | 'sessionDate' | 'startTime' | 'title'>) {
  const slug = normalizeAgendaToken(row.title)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return deterministicUuid(`agenda-${classId}-${row.sessionNo}-${row.sessionDate || 'no-date'}-${row.startTime || row.rowNumber}-${slug || row.rowNumber}`);
}

function directChildrenByLocalName(element: Element, localName: string) {
  return Array.from(element.children).filter((child) => child.localName === localName);
}

function descendantsByLocalName(element: Element, localName: string) {
  return Array.from(element.getElementsByTagName('*')).filter((child) => child.localName === localName);
}

async function parseAgendaDocx(file: File, input: { courseId: string; classId: string; classStartAt?: string | null }) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('Không đọc được nội dung file Word.');

  const doc = new DOMParser().parseFromString(documentXml, 'application/xml');
  const parseError = doc.getElementsByTagName('parsererror')[0];
  if (parseError) throw new Error('File Word không đúng định dạng XML.');

  const table = descendantsByLocalName(doc.documentElement, 'tbl')[0];
  if (!table) throw new Error('Không tìm thấy bảng agenda trong file Word.');

  const columnContexts: Array<{ sessionNo: number; sessionDate: string }> = [];
  const parsedRows: ParsedAgendaRow[] = [];

  directChildrenByLocalName(table, 'tr').forEach((row, index) => {
    const cells = directChildrenByLocalName(row, 'tc').map((cell) => (
      normalizeAgendaCell(descendantsByLocalName(cell, 't').map((node) => node.textContent || '').join(' '))
    ));
    const timeCell = cells[0] || '';
    const contentCells = cells.slice(1);
    const contentCell = contentCells.join(' ').trim();
    const timeToken = normalizeAgendaToken(timeCell);
    const contentToken = normalizeAgendaToken(contentCell);
    if (!timeCell && !contentCell) return;
    if (timeToken.includes('thoi luong') && contentToken.includes('noi dung')) return;

    const sessionNo = parseAgendaSessionNo(timeCell);
    const { startTime, endTime } = parseAgendaTimeRange(timeCell);
    const isTimeRow = Boolean(startTime || endTime);

    if (sessionNo && !isTimeRow) {
      contentCells.forEach((cell, columnIndex) => {
        const dayIndex = parseAgendaDayIndex(cell) || parseAgendaDayIndex(timeCell);
        columnContexts[columnIndex] = {
          sessionNo,
          sessionDate: dayIndex ? addDaysToIsoDate(input.classStartAt, dayIndex - 1) : columnContexts[columnIndex]?.sessionDate || addDaysToIsoDate(input.classStartAt, sessionNo - 1),
        };
      });
      return;
    }

    contentCells.forEach((cell, columnIndex) => {
      const cellToken = normalizeAgendaToken(cell);
      const dayIndex = parseAgendaDayIndex(cell);
      const cellSessionNo = parseAgendaSessionNo(cell) || sessionNo;
      if (dayIndex || cellSessionNo) {
        columnContexts[columnIndex] = {
          sessionNo: cellSessionNo || columnContexts[columnIndex]?.sessionNo || Math.max(1, dayIndex || 1),
          sessionDate: dayIndex ? addDaysToIsoDate(input.classStartAt, dayIndex - 1) : columnContexts[columnIndex]?.sessionDate || '',
        };
        if (!isTimeRow) return;
      }
      if (!cell || cellToken === 'noi dung') return;
      const context = columnContexts[columnIndex] || {
        sessionNo: sessionNo || 1,
        sessionDate: addDaysToIsoDate(input.classStartAt, columnIndex),
      };
      const payload: ParsedAgendaRow = {
        id: '',
        rowNumber: index + 1,
        columnNumber: columnIndex + 1,
        courseId: input.courseId,
        classId: input.classId,
        sessionNo: context.sessionNo,
        sessionDate: context.sessionDate || null,
        startTime: startTime || null,
        endTime: endTime || null,
        title: cell,
        description: '',
      };
      payload.id = agendaImportId(input.classId, payload);
      parsedRows.push(payload);
    });
  });

  if (!parsedRows.length) throw new Error('Không tách được nội dung agenda từ file này.');
  return parsedRows.sort((left, right) =>
    String(left.sessionDate || '').localeCompare(String(right.sessionDate || '')) ||
    Number(left.sessionNo || 0) - Number(right.sessionNo || 0) ||
    String(left.startTime || '').localeCompare(String(right.startTime || '')) ||
    Number(left.rowNumber || 0) - Number(right.rowNumber || 0) ||
    Number(left.columnNumber || 0) - Number(right.columnNumber || 0)
  );
}

function activityLabel(type: string) {
  if (type === 'discussion') return 'Thảo luận';
  if (type === 'quiz') return 'Kiểm tra';
  if (type === 'reflection') return 'Thu hoạch';
  if (type === 'game') return 'Game';
  return type;
}

function isPublishedStatus(status?: string | null) {
  return ['active', 'published', 'open'].includes(String(status || '').toLowerCase());
}

function isDraftStatus(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  return !normalized || normalized === 'draft';
}

function getActivityNotOpenNotice(type: string) {
  return `${activityLabel(type)} chưa mở, bạn vui lòng thử lại sau.`;
}

function activityTone(status?: string | null): 'danger' | 'warning' | 'success' | 'violet' | 'neutral' {
  const normalized = String(status || '').toLowerCase();
  if (isPublishedStatus(normalized)) return 'success';
  if (['completed', 'closed'].includes(normalized)) return 'violet';
  if (normalized === 'archived') return 'neutral';
  return 'warning';
}

function activityStatusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'published', 'open'].includes(normalized)) return 'Đang phát hành';
  if (['completed', 'closed'].includes(normalized)) return 'Chưa phát hành';
  if (normalized === 'archived') return 'Lưu trữ';
  return 'Bản nháp';
}

function nextPublishStatus(status?: string | null) {
  return String(status || '').toLowerCase() === 'active' ? 'completed' : 'active';
}

function normalizeSearchText(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function looselyMatchesSearch(text: string, query: string) {
  const haystack = normalizeSearchText(text);
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  const tokens = needle.split(' ').filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

async function loadXlsx() {
  return import('xlsx');
}

async function downloadStudentImportTemplate() {
  const XLSX = await loadXlsx();
  const worksheet = XLSX.utils.aoa_to_sheet(STUDENT_IMPORT_TEMPLATE_ROWS);
  worksheet['!cols'] = [{ wch: 24 }, { wch: 16 }, { wch: 30 }, { wch: 24 }, { wch: 20 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'HocVien');
  XLSX.writeFile(workbook, 'mau_import_hoc_vien_vtraining.xlsx');
}

async function downloadClassStudentsWorkbook(rows: SuniClassStudent[], filename: string) {
  const XLSX = await loadXlsx();
  const worksheet = XLSX.utils.json_to_sheet(rows.map((student) => ({
    'Họ tên': student.fullName,
    Nhóm: student.groupName || '',
    Email: student.email || '',
    'Mã học viên': student.studentCode || '',
    'Đơn vị': student.department || '',
    'Chức vụ': student.position || '',
    'Trạng thái': student.status || 'active',
  })));
  worksheet['!cols'] = [{ wch: 26 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 24 }, { wch: 22 }, { wch: 14 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'HocVien');
  XLSX.writeFile(workbook, filename);
}

function sanitizeExportFilename(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 90) || 'bao-cao';
}

function mapCompletionRowsForSheet(rows: TrainingCompletionRow[]) {
  return rows.map((row) => ({
    'Trạng thái': row.completionStatus,
    'Họ tên': row.fullName,
    Email: row.email,
    Nhóm: row.groupName,
    'Mã HV': row.studentCode,
    'Đơn vị': row.department,
    'Chức vụ': row.position,
    'Trạng thái học viên': row.studentStatus,
    'Số lần': row.attemptCount,
    'Lần mới nhất': row.latestAttemptNo,
    Điểm: row.score,
    'Trạng thái bài': row.submissionStatus,
    'Thời gian nộp': row.submittedAt,
  }));
}

async function downloadTrainingCompletionWorkbook(input: {
  classId: string;
  activityTitle: string;
  activityType: 'quiz' | 'reflection';
  students: SuniClassStudent[];
  submissions: Array<TrainingActivitySubmission | QuizSubmission>;
}) {
  const XLSX = await loadXlsx();
  const rows = buildTrainingCompletionRows(input.students, input.submissions);
  const summary = summarizeTrainingCompletion(rows);
  const workbook = XLSX.utils.book_new();
  const summarySheet = XLSX.utils.json_to_sheet([{
    Lớp: input.classId,
    Bài: input.activityTitle,
    Loại: input.activityType === 'quiz' ? 'Bài kiểm tra' : 'Bài thu hoạch',
    'Tổng học viên': summary.total,
    'Đã làm': summary.done,
    'Chưa làm': summary.missing,
  }]);
  const doneSheet = XLSX.utils.json_to_sheet(mapCompletionRowsForSheet(rows.done));
  const missingSheet = XLSX.utils.json_to_sheet(mapCompletionRowsForSheet(rows.missing));
  summarySheet['!cols'] = [{ wch: 22 }, { wch: 48 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 10 }];
  doneSheet['!cols'] = [{ wch: 12 }, { wch: 26 }, { wch: 30 }, { wch: 10 }, { wch: 14 }, { wch: 34 }, { wch: 18 }, { wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 24 }];
  missingSheet['!cols'] = doneSheet['!cols'];
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Tong_quan');
  XLSX.utils.book_append_sheet(workbook, doneSheet, 'Da_lam');
  XLSX.utils.book_append_sheet(workbook, missingSheet, 'Chua_lam');
  XLSX.writeFile(workbook, `${input.activityType}-${sanitizeExportFilename(input.activityTitle)}-${input.classId}.xlsx`);
}

function TrainingMaterialList({ materials, canManage, classId }: { materials: SuniTrainingMaterial[]; canManage: boolean; classId: string }) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState('');
  async function refreshMaterials() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trainingQueries.materials(classId) }),
      queryClient.invalidateQueries({ queryKey: ['suni', 'training', 'materials'] }),
    ]);
  }
  const visibilityMutation = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) => suniTrainingApi.updateMaterialVisibility(id, visible),
    onSuccess: refreshMaterials,
  });
  const deleteMutation = useMutation({
    mutationFn: (material: SuniTrainingMaterial) => suniTrainingApi.deleteMaterial(material),
    onSuccess: refreshMaterials,
  });

  async function toggle(id: string, visible: boolean) {
    setErrorMessage('');
    try {
      await visibilityMutation.mutateAsync({ id, visible });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }
  async function remove(material: SuniTrainingMaterial) {
    if (!window.confirm(`Xoa tai lieu "${material.title || material.fileName}" khoi lop?`)) return;
    setErrorMessage('');
    try {
      await deleteMutation.mutateAsync(material);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <>
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      <div className="suni-native-table-wrap">
        <table className="data-table suni-native-table">
          <thead><tr><th>Tài liệu</th><th>Dung lượng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            {materials.map((material) => (
              <tr key={material.id}>
                <td><strong>{material.title || material.fileName}</strong><span>{material.description || material.fileName}</span></td>
                <td>{material.fileType === 'external-link' ? 'Link' : formatBytes(material.fileSize)}</td>
                <td><Badge tone={material.visibleToStudents ? 'success' : 'neutral'}>{material.visibleToStudents ? 'public' : 'Ẩn'}</Badge></td>
                <td><div className="suni-native-row-actions">
                  {material.publicUrl ? <a className="btn btn-ghost btn-small" href={material.publicUrl} target="_blank" rel="noreferrer">Mở</a> : null}
                  {canManage ? <button className="btn btn-ghost btn-small" onClick={() => void toggle(material.id, !material.visibleToStudents)}>{material.visibleToStudents ? 'Ẩn' : 'Hiện'}</button> : null}
                  {canManage ? <button className="btn btn-danger btn-small" disabled={deleteMutation.isPending} onClick={() => void remove(material)}>Xóa</button> : null}
                </div></td>
              </tr>
            ))}
            {!materials.length ? <tr><td colSpan={4}>Chưa có tài liệu học tập.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ClassMaterialUpload({ classId, courseId }: { classId: string; courseId?: string | null }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkDescription, setLinkDescription] = useState('');
  const [visible, setVisible] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  async function refreshMaterials() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: trainingQueries.materials(classId) }),
      queryClient.invalidateQueries({ queryKey: ['suni', 'training', 'materials'] }),
    ]);
  }
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Cần chọn file tài liệu.');
      return suniTrainingApi.uploadMaterial({ courseId, classId, file, visibleToStudents: visible });
    },
    onSuccess: async () => {
      setFile(null);
      await refreshMaterials();
    },
  });
  const linkMutation = useMutation({
    mutationFn: () => {
      if (!linkUrl.trim()) throw new Error('Cần dán link tài liệu.');
      return suniTrainingApi.createMaterialLink({
        courseId,
        classId,
        title: linkTitle.trim() || 'Link tài liệu học tập',
        description: linkDescription.trim(),
        url: linkUrl.trim(),
        visibleToStudents: visible,
      });
    },
    onSuccess: async () => {
      setLinkTitle('');
      setLinkUrl('');
      setLinkDescription('');
      await refreshMaterials();
    },
  });

  async function upload() {
    setErrorMessage('');
    try {
      await uploadMutation.mutateAsync();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function addLink() {
    setErrorMessage('');
    try {
      await linkMutation.mutateAsync();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <Card title="Upload tài liệu riêng cho lớp">
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      <div className="vtraining-import-box">
        <label className="btn btn-ghost">
          <Upload size={16} /> Chọn file
          <input type="file" accept=".ppt,.pptx,.doc,.docx,.xls,.xlsx,.pdf,application/pdf" hidden onChange={(event) => setFile(event.target.files?.[0] || null)} />
        </label>
        <label className="checkbox-row vtraining-public-toggle">
          <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} />
          <span>Public</span>
        </label>
        <span>{file?.name || 'Chọn slide/doc/excel/pdf để upload vào bucket training-materials.'}</span>
        <button className="btn btn-primary" disabled={!file || uploadMutation.isPending} onClick={() => void upload()}>{uploadMutation.isPending ? 'Đang upload...' : 'Upload'}</button>
      </div>
      <div className="vtraining-import-box">
        <input className="input" value={linkTitle} onChange={(event) => setLinkTitle(event.target.value)} placeholder="Tên link tài liệu" />
        <input className="input" value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Dán link Drive hoặc link tài liệu" />
        <input className="input" value={linkDescription} onChange={(event) => setLinkDescription(event.target.value)} placeholder="Mô tả ngắn (tuỳ chọn)" />
        <button className="btn btn-primary" disabled={!linkUrl.trim() || linkMutation.isPending} onClick={() => void addLink()}>
          {linkMutation.isPending ? 'Đang lưu...' : 'Thêm link'}
        </button>
      </div>
    </Card>
  );
}

function ClassAgendaForm({ courseId, classId, editing, onCancel }: { courseId: string; classId: string; editing: SuniTrainingAgenda | null; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [baseForm, setBaseForm] = useState<SuniAgendaPayload>(() => editing ? {
    courseId,
    classId,
    sessionNo: editing.sessionNo,
    sessionDate: editing.sessionDate || '',
    title: '',
  } : emptyAgenda(courseId, classId));
  const [lines, setLines] = useState<AgendaContentLine[]>(() => [
    createAgendaContentLine(editing ? {
      agendaId: editing.id,
      startTime: formatTime(editing.startTime) === '-' ? '' : formatTime(editing.startTime),
      endTime: formatTime(editing.endTime) === '-' ? '' : formatTime(editing.endTime),
      title: editing.title,
      description: editing.description || '',
    } : undefined),
  ]);
  const [errorMessage, setErrorMessage] = useState('');
  const mutation = useMutation({
    mutationFn: (payloads: SuniAgendaPayload[]) => Promise.all(payloads.map((payload) => suniTrainingApi.saveAgenda(payload))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trainingQueries.agendas(classId) });
      setBaseForm(emptyAgenda(courseId, classId));
      setLines([createAgendaContentLine()]);
      onCancel();
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    const validLines = lines.filter((line) => line.title.trim());
    if (!validLines.length) return setErrorMessage('Cần nhập ít nhất một nội dung trong buổi học.');
    try {
      await mutation.mutateAsync(validLines.map((line) => ({
        id: line.agendaId,
        courseId,
        classId,
        sessionNo: baseForm.sessionNo,
        sessionDate: baseForm.sessionDate || null,
        startTime: line.startTime || null,
        endTime: line.endTime || null,
        title: line.title,
        description: line.description,
      })));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  function updateLine(lineId: string, patch: Partial<AgendaContentLine>) {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  }

  function addLine(afterIndex: number) {
    setLines((current) => {
      const previous = current[afterIndex];
      const next = createAgendaContentLine({ startTime: previous?.endTime || '' });
      return [...current.slice(0, afterIndex + 1), next, ...current.slice(afterIndex + 1)];
    });
  }

  function removeLine(lineId: string) {
    setLines((current) => current.length > 1 ? current.filter((line) => line.id !== lineId) : current);
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      {errorMessage ? <div className="notice danger full">{errorMessage}</div> : null}
      <label><span>Buổi số</span><input type="number" min="1" value={baseForm.sessionNo} onChange={(event) => setBaseForm((current) => ({ ...current, sessionNo: Number(event.target.value) || 1 }))} /></label>
      <label><span>Ngày</span><input type="date" value={baseForm.sessionDate || ''} onChange={(event) => setBaseForm((current) => ({ ...current, sessionDate: event.target.value }))} /></label>
      <div className="full suni-native-table-wrap">
        <table className="data-table suni-native-table">
          <thead><tr><th>Từ giờ</th><th>Đến giờ</th><th>Nội dung</th><th>Giảng viên / ghi chú</th><th>Thao tác</th></tr></thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td><input type="time" value={line.startTime} onChange={(event) => updateLine(line.id, { startTime: event.target.value })} /></td>
                <td><input type="time" value={line.endTime} onChange={(event) => updateLine(line.id, { endTime: event.target.value })} /></td>
                <td><input value={line.title} onChange={(event) => updateLine(line.id, { title: event.target.value })} placeholder={index === 0 ? 'VD: Khai giảng' : 'Nội dung tiếp theo'} /></td>
                <td><input value={line.description} onChange={(event) => updateLine(line.id, { description: event.target.value })} placeholder="Giảng viên hoặc ghi chú" /></td>
                <td>
                  <div className="suni-native-row-actions">
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => addLine(index)}>+</button>
                    <button type="button" className="btn btn-danger btn-small" disabled={lines.length <= 1} onClick={() => removeLine(line.id)}>Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="action-row full">
        {editing ? <button type="button" className="btn btn-ghost" onClick={onCancel}>Hủy sửa</button> : null}
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Đang lưu...' : editing ? 'Cập nhật nội dung' : 'Thêm buổi học'}</button>
      </div>
    </form>
  );
}

function ClassAgendaImport({ courseId, classId, classStartAt }: { courseId: string; classId: string; classStartAt?: string | null }) {
  const queryClient = useQueryClient();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedAgendaRow[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const importMutation = useMutation({
    mutationFn: (payloads: ParsedAgendaRow[]) => Promise.all(payloads.map((payload) => suniTrainingApi.saveAgenda(payload))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: trainingQueries.agendas(classId) });
    },
  });

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setErrorMessage('');
    setRows([]);
    setFileName(file?.name || '');
    if (!file) return;
    setIsParsing(true);
    try {
      const parsedRows = await parseAgendaDocx(file, { courseId, classId, classStartAt });
      setRows(parsedRows);
      await importMutation.mutateAsync(parsedRows);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <Card title="Import agenda từ Word" action={<Badge tone={rows.length ? 'success' : 'neutral'}>{rows.length} nội dung</Badge>}>
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {!classStartAt ? <div className="notice warning">Lớp chưa có ngày bắt đầu nên các mốc NGÀY 1, NGÀY 2 trong file sẽ chưa map được ngày học.</div> : null}
      <div className="vtraining-import-box">
        <label className="btn btn-ghost">
          <Upload size={16} /> Chọn file agenda
          <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(event) => void handleFileChange(event)} />
        </label>
        <span>{fileName || 'Chọn file .docx có bảng THỜI LƯỢNG / NỘI DUNG. Hệ thống tự tách buổi, ngày, giờ và nội dung.'}</span>
        <button type="button" className="btn btn-primary" disabled={!rows.length || importMutation.isPending} onClick={() => void importMutation.mutateAsync(rows)}>
          {importMutation.isPending || isParsing ? 'Đang import...' : 'Import lại'}
        </button>
      </div>
      {rows.length ? (
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Buổi</th><th>Ngày</th><th>Giờ</th><th>Nội dung</th></tr></thead>
            <tbody>
              {rows.slice(0, 12).map((row) => (
                <tr key={row.id}>
                  <td>{row.sessionNo}</td>
                  <td>{formatDate(row.sessionDate)}</td>
                  <td>{formatTime(row.startTime)} - {formatTime(row.endTime)}</td>
                  <td><strong>{row.title}</strong></td>
                </tr>
              ))}
              {rows.length > 12 ? <tr><td colSpan={4}>Còn {rows.length - 12} nội dung khác đã được import.</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}

function ActivityManager({ classId, courseId, activities, canManage, activityType }: { classId: string; courseId?: string | null; activities: SuniTrainingClassActivity[]; canManage: boolean; activityType: SuniTrainingClassActivity['type'] }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [errorMessage, setErrorMessage] = useState('');
  const scopedActivities = activities.filter((activity) => activity.type === activityType);
  const saveMutation = useMutation({
    mutationFn: () => suniTrainingApi.saveClassActivity({ classId, courseId, type: activityType, title, description, status }),
    onSuccess: async () => {
      setTitle('');
      setDescription('');
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) });
    },
  });

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!title.trim()) return setErrorMessage('Cần nhập tên hoạt động.');
    try {
      await saveMutation.mutateAsync();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="vtraining-detail-stack">
      {canManage ? (
        <Card title={`Thêm ${activityLabel(activityType).toLowerCase()}`}>
          <form className="form-grid" onSubmit={(event) => void save(event)}>
            {errorMessage ? <div className="notice danger full">{errorMessage}</div> : null}
            <label><span>Trạng thái</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="draft">Nháp</option><option value="active">Gán cho học viên</option><option value="completed">Hoàn thành</option><option value="archived">Lưu trữ</option></select></label>
            <label className="full"><span>Tên hoạt động</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label className="full"><span>Mô tả / nguồn liên kết</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} /></label>
            <div className="action-row full"><button className="btn btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Đang lưu...' : 'Thêm hoạt động'}</button></div>
          </form>
        </Card>
      ) : null}
      <Card title={`${activityLabel(activityType)} của lớp`} action={<Badge tone={scopedActivities.length ? 'success' : 'warning'}>{scopedActivities.length} hoạt động</Badge>}>
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Loại</th><th>Hoạt động</th><th>Thời gian</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {scopedActivities.map((activity) => (
                <tr key={activity.id}>
                  <td>{activityLabel(activity.type)}</td>
                  <td><strong>{activity.title}</strong><span>{activity.description || activity.sourceId || '-'}</span></td>
                  <td>{activity.openAt ? formatDate(activity.openAt) : '-'} {activity.closeAt ? `- ${formatDate(activity.closeAt)}` : ''}</td>
                  <td><Badge tone={activityTone(activity.status)}>{activity.status}</Badge></td>
                </tr>
              ))}
              {!scopedActivities.length ? <tr><td colSpan={4}>Chưa có {activityLabel(activityType).toLowerCase()} được gán.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ClassQuizLibraryManager({
  classId,
  courseId,
  activities,
  canManage,
  isStudent,
  results,
  focusActivityId,
}: {
  classId: string;
  courseId?: string | null;
  activities: SuniTrainingClassActivity[];
  canManage: boolean;
  isStudent: boolean;
  results: SuniTrainingResult[];
  focusActivityId?: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { profile } = useAuth();
  const [libraryItems, setLibraryItems] = useState<TrainingLibraryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [title, setTitle] = useState('');
  const [questionCount, setQuestionCount] = useState(20);
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [retakeCount, setRetakeCount] = useState(0);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [published, setPublished] = useState(true);
  const [submissionsByForm, setSubmissionsByForm] = useState<Record<string, QuizSubmission[]>>({});
  const [classStudents, setClassStudents] = useState<SuniClassStudent[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const quizActivities = activities.filter((activity) => activity.type === 'quiz');
  const scopedQuizActivities = focusActivityId ? quizActivities.filter((activity) => activity.id === focusActivityId) : quizActivities;
  const visibleQuizActivities = scopedQuizActivities;
  const studentResult = isStudent ? results.find((result) => result.studentProfileId === profile?.id) || results[0] || null : null;
  const selectedLibraryItem = libraryItems.find((entry) => entry.id === selectedItemId);
  const selectedLibraryQuestionCount = Math.max(1, Number(selectedLibraryItem?.metadata.questionCount || 0));
  const updateActivityMutation = useMutation({
    mutationFn: async ({ activity, status }: { activity: SuniTrainingClassActivity; status: string }) => {
      const formId = String(activity.metadata?.formId || activity.sourceId || '');
      await suniTrainingApi.saveClassActivity({
        id: activity.id,
        classId,
        courseId: activity.courseId || courseId || null,
        type: activity.type,
        title: activity.title,
        description: activity.description || '',
        status,
        sourceId: activity.sourceId,
        libraryItemId: activity.libraryItemId,
        openAt: activity.openAt,
        closeAt: activity.closeAt,
        metadata: activity.metadata || {},
      });
      if (formId) await updateQuizFormStatus(formId, status === 'active' ? 'active' : 'paused');
      return { ...activity, status };
    },
    onSuccess: async (updatedActivity) => {
      queryClient.setQueryData<SuniTrainingClassActivity[]>(
        trainingQueries.classActivitiesForRole(classId, isStudent),
        (current = []) => current.map((activity) => (activity.id === updatedActivity.id ? updatedActivity : activity)),
      );
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) });
    },
  });
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => suniTrainingApi.deleteClassActivity(activityId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) }),
  });

  useEffect(() => {
    if (!canManage || focusActivityId) return;
    trainingLibraryApi.listItems('quiz').then(setLibraryItems).catch((error) => setErrorMessage(getErrorMessage(error)));
  }, [canManage, focusActivityId]);

  useEffect(() => {
    if (!canManage || !focusActivityId) return;
    suniTrainingApi.listClassStudents([classId]).then(setClassStudents).catch((error) => setErrorMessage(getErrorMessage(error)));
  }, [canManage, classId, focusActivityId]);

  useEffect(() => {
    const item = libraryItems.find((entry) => entry.id === selectedItemId);
    if (!item) return;
    setTitle(item.title);
    setQuestionCount(Math.max(1, Number(item.metadata.questionCount || 20)));
  }, [selectedItemId, libraryItems]);

  useEffect(() => {
    if (!focusActivityId) return;
    void Promise.all(visibleQuizActivities.map(async (activity) => {
      const formId = String(activity.metadata?.formId || activity.sourceId || '');
      if (!formId || submissionsByForm[formId]) return;
      const rows = await listQuizSubmissions(formId);
      setSubmissionsByForm((current) => ({ ...current, [formId]: rows }));
    })).catch((error) => setErrorMessage(getErrorMessage(error)));
  }, [focusActivityId, visibleQuizActivities.map((activity) => activity.id).join('|')]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    const libraryItem = libraryItems.find((item) => item.id === selectedItemId);
    if (!libraryItem) return setErrorMessage('Cần chọn bài kiểm tra từ thư viện.');
    const libraryQuestionCount = Math.max(1, Number(libraryItem.metadata.questionCount || questionCount || 1));
    const safeQuestionCount = Math.min(Math.max(1, Number(questionCount || 1)), libraryQuestionCount);
    const safeRetakeCount = Math.max(0, Number(retakeCount || 0));
    const totalAttempts = safeRetakeCount + 1;
    try {
      const assigned = await trainingLibraryApi.assignQuizToClass({
        classId,
        courseId,
        libraryItem,
        title,
        questionCount: safeQuestionCount,
        durationMinutes,
        shuffleQuestions,
        maxAttempts: totalAttempts,
        published,
      });
      setSelectedItemId('');
      queryClient.setQueryData<SuniTrainingClassActivity[]>(
        trainingQueries.classActivitiesForRole(classId, isStudent),
        (current = []) => current.some((activity) => activity.id === assigned.activity.id) ? current : [assigned.activity, ...current],
      );
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function syncQuizScores(activity: SuniTrainingClassActivity) {
    setErrorMessage('');
    try {
      const formId = String(activity.metadata?.formId || activity.sourceId || '');
      const rows = submissionsByForm[formId] || await listQuizSubmissions(formId);
      const scoresByProfile = buildQuizScoresByProfile({
        formIds: [formId],
        students: classStudents,
        submissions: rows,
      });
      await Promise.all(Array.from(scoresByProfile.entries()).map(([profileId, score]) => {
        const existing = results.find((result) => result.studentProfileId === profileId);
        return suniTrainingApi.saveTrainingResult({
          id: existing?.id,
          classId,
          courseId: existing?.courseId || courseId || null,
          studentProfileId: profileId,
          scores: { ...(existing?.scores || {}), quiz: score },
        });
      }));
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function exportQuizCompletion(activity: SuniTrainingClassActivity) {
    setErrorMessage('');
    try {
      const formId = String(activity.metadata?.formId || activity.sourceId || '');
      const rows = submissionsByForm[formId] || await listQuizSubmissions(formId);
      if (!submissionsByForm[formId]) setSubmissionsByForm((current) => ({ ...current, [formId]: rows }));
      await downloadTrainingCompletionWorkbook({
        classId,
        activityTitle: activity.title,
        activityType: 'quiz',
        students: classStudents,
        submissions: rows,
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function deleteQuizResult(activity: SuniTrainingClassActivity, submission: QuizSubmission) {
    const confirmed = window.confirm('Xóa lượt nộp này? Học viên sẽ được mở lại lượt làm nếu trước đó đã hết số lượt cho phép.');
    if (!confirmed) return;
    setErrorMessage('');
    try {
      const formId = String(activity.metadata?.formId || activity.sourceId || '');
      await deleteVTrainingQuizSubmission(submission.id);
      const rows = await listQuizSubmissions(formId);
      setSubmissionsByForm((current) => ({ ...current, [formId]: rows }));
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) });
      pushToast({ title: 'Đã xóa lượt nộp', message: submission.respondentName || submission.email || undefined, tone: 'success' });
    } catch (error) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      pushToast({ title: 'Không xóa được kết quả', message, tone: 'danger' });
    }
  }

  async function toggleActivityStatus(activity: SuniTrainingClassActivity) {
    const status = nextPublishStatus(activity.status);
    const confirmed = window.confirm(status === 'active' ? 'Phát hành bài kiểm tra này?' : 'Đóng phát hành bài kiểm tra này?');
    if (!confirmed) return;
    setErrorMessage('');
    try {
      await updateActivityMutation.mutateAsync({ activity, status });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function deleteActivity(activity: SuniTrainingClassActivity) {
    const confirmed = window.confirm('Xóa bài kiểm tra này khỏi lớp? Lượt nộp/form quiz đã tạo sẽ không hiển thị trong lớp này nữa.');
    if (!confirmed) return;
    setErrorMessage('');
    try {
      await deleteActivityMutation.mutateAsync(activity.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="vtraining-detail-stack">
      {focusActivityId ? <div className="suni-native-row-actions"><Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/quizzes`}>Quay lại danh sách kiểm tra</Link></div> : null}
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {canManage && !focusActivityId ? (
        <Card title="Chọn bài kiểm tra từ thư viện">
          <form className="form-grid" onSubmit={(event) => void assign(event)}>
            <label className="full">
              <span>Bài trong thư viện</span>
              <select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}>
                <option value="">Chọn bài kiểm tra</option>
                {libraryItems.map((item) => <option value={item.id} key={item.id}>{item.title} · {String(item.metadata.questionCount || 0)} câu</option>)}
              </select>
            </label>
            <label><span>Tiêu đề trong lớp</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label><span>Thời lượng phút</span><input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value || 1))} /></label>
            <label>
              <span>Số câu lấy từ bộ đề</span>
              <input
                type="number"
                min={1}
                max={selectedLibraryQuestionCount}
                value={questionCount}
                onChange={(event) => setQuestionCount(Number(event.target.value || 1))}
              />
            </label>
            <label><span>Số lần làm lại</span><input type="number" min={0} value={retakeCount} onChange={(event) => setRetakeCount(Math.max(0, Number(event.target.value || 0)))} /></label>
            <div className="action-row full">
              <label className="checkbox-row"><input type="checkbox" checked={shuffleQuestions} onChange={(event) => setShuffleQuestions(event.target.checked)} /> Xáo trộn câu hỏi</label>
              <label className="checkbox-row"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> Phát hành</label>
              <button className="btn btn-primary" disabled={!selectedItemId || !title.trim()}>Gán vào lớp</button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title={isStudent ? 'Bài kiểm tra của lớp' : 'Kiểm tra của lớp'} action={<Badge tone={visibleQuizActivities.length ? 'success' : 'warning'}>{visibleQuizActivities.length} bài</Badge>}>
        <div className="vtraining-detail-stack">
          {visibleQuizActivities.map((activity) => {
            const formId = String(activity.metadata?.formId || activity.sourceId || '');
            const rows = submissionsByForm[formId] || [];
            const totalAttempts = Math.max(1, Number(activity.metadata?.maxAttempts || 1));
            const retakesAllowed = Math.max(0, totalAttempts - 1);
            const isLockedForStudent = isStudent && !isPublishedStatus(activity.status);
            return (
              <div
                className={`vtraining-quiz-activity-card ${formId ? 'suni-native-click-row' : ''} ${isLockedForStudent ? 'is-locked' : ''}`}
                key={activity.id}
                onClick={() => {
                  if (canManage && !focusActivityId) {
                    navigate(`/vtraining/classes/${classId}/quizzes/${activity.id}`);
                    return;
                  }
                  if (isLockedForStudent) {
                    pushToast({ title: getActivityNotOpenNotice('quiz'), tone: 'warning' });
                    return;
                  }
                  if (formId) window.open(buildQuizShareLink(formId), '_blank', 'noopener,noreferrer');
                }}
              >
                <div className="suni-native-toolbar suni-native-toolbar-compact">
                  <span><strong>{activity.title}</strong> · {Number(activity.metadata?.questionCount || 0) || '-'} câu · {Number(activity.metadata?.durationMinutes || 0) || '-'} phút · {activityStatusLabel(activity.status)}</span>
                  <div className="suni-native-row-actions">
                    {canManage ? (
                      <>
                        <Badge tone={activityTone(activity.status)}>{activityStatusLabel(activity.status)}</Badge>
                        {!focusActivityId ? <button className="btn btn-ghost btn-small" onClick={(event) => { event.stopPropagation(); navigate(`/vtraining/classes/${classId}/quizzes/${activity.id}`); }}>Chi tiết</button> : null}
                        <button className="btn btn-ghost btn-small" disabled={updateActivityMutation.isPending} onClick={(event) => { event.stopPropagation(); void toggleActivityStatus(activity); }}>{activity.status === 'active' ? 'Đóng phát hành' : 'Phát hành'}</button>
                        {focusActivityId && formId ? <button className="btn btn-primary btn-small" onClick={(event) => { event.stopPropagation(); void syncQuizScores(activity); }}>Đồng bộ điểm</button> : null}
                        {focusActivityId && formId ? <button className="btn btn-ghost btn-small" disabled={!classStudents.length} onClick={(event) => { event.stopPropagation(); void exportQuizCompletion(activity); }}><Download size={14} /> Trích xuất</button> : null}
                        <button className="btn btn-danger btn-small" disabled={deleteActivityMutation.isPending} onClick={(event) => { event.stopPropagation(); void deleteActivity(activity); }}><Trash2 size={14} /> Xóa</button>
                      </>
                    ) : null}
                  </div>
                </div>
                {!isStudent && focusActivityId ? (
                  <div className="suni-native-table-wrap">
                    <table className="data-table suni-native-table">
                      <thead><tr><th>Học viên</th><th>Email</th><th>Lần</th><th>Điểm</th><th>Thời gian nộp</th>{canManage ? <th>Thao tác</th> : null}</tr></thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id}>
                            <td><strong>{row.respondentName || row.studentProfileId || '-'}</strong></td>
                            <td>{row.email || '-'}</td>
                            <td>{row.attemptNo || 1}</td>
                            <td>{row.score == null ? '-' : `${row.score}/10`}</td>
                            <td>{formatDateTime(row.submittedAt)}</td>
                            {canManage ? (
                              <td>
                                <button className="btn btn-danger btn-small" onClick={(event) => { event.stopPropagation(); void deleteQuizResult(activity, row); }}>
                                  <Trash2 size={14} /> Xóa kết quả
                                </button>
                              </td>
                            ) : null}
                          </tr>
                        ))}
                        {!rows.length ? <tr><td colSpan={canManage ? 6 : 5}>Chưa có lượt nộp.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!visibleQuizActivities.length ? <div className="muted-text">Chưa có bài kiểm tra được gán.</div> : null}
        </div>
      </Card>
    </div>
  );
}

function ClassReflectionLibraryManager({
  classId,
  courseId,
  activities,
  canManage,
  isStudent,
  studentProfileId,
  results,
  focusActivityId,
}: {
  classId: string;
  courseId?: string | null;
  activities: SuniTrainingClassActivity[];
  canManage: boolean;
  isStudent: boolean;
  studentProfileId?: string | null;
  results: SuniTrainingResult[];
  focusActivityId?: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [libraryItems, setLibraryItems] = useState<TrainingLibraryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState('');
  const [title, setTitle] = useState('');
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_REFLECTION_DURATION_MINUTES);
  const [published, setPublished] = useState(true);
  const [submissions, setSubmissions] = useState<Record<string, TrainingActivitySubmission[]>>({});
  const [grading, setGrading] = useState<Record<string, { score: string; feedback: string; status: 'graded' | 'needs_resubmission' }>>({});
  const [classStudents, setClassStudents] = useState<SuniClassStudent[]>([]);
  const [reflectionSearch, setReflectionSearch] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const reflectionActivities = activities.filter((activity) => activity.type === 'reflection');
  const scopedReflectionActivities = focusActivityId ? reflectionActivities.filter((activity) => activity.id === focusActivityId) : reflectionActivities;
  const visibleReflectionActivities = isStudent ? scopedReflectionActivities.filter((activity) => !isDraftStatus(activity.status)) : scopedReflectionActivities;
  const studentResult = isStudent ? results.find((result) => result.studentProfileId === studentProfileId) || results[0] || null : null;
  const updateActivityMutation = useMutation({
    mutationFn: ({ activity, status }: { activity: SuniTrainingClassActivity; status: string }) => suniTrainingApi.saveClassActivity({
      id: activity.id,
      classId,
      courseId: activity.courseId || courseId || null,
      type: activity.type,
      title: activity.title,
      description: activity.description || '',
      status,
      sourceId: activity.sourceId,
      libraryItemId: activity.libraryItemId,
      openAt: activity.openAt,
      closeAt: activity.closeAt,
      metadata: activity.metadata || {},
    }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) }),
  });
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => suniTrainingApi.deleteClassActivity(activityId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) }),
  });

  useEffect(() => {
    if (!canManage || focusActivityId) return;
    trainingLibraryApi.listItems('reflection').then(setLibraryItems).catch((error) => setErrorMessage(getErrorMessage(error)));
  }, [canManage, focusActivityId]);

  useEffect(() => {
    if (!canManage || !focusActivityId) return;
    suniTrainingApi.listClassStudents([classId]).then(setClassStudents).catch((error) => setErrorMessage(getErrorMessage(error)));
  }, [canManage, classId, focusActivityId]);

  useEffect(() => {
    const item = libraryItems.find((entry) => entry.id === selectedItemId);
    if (item) {
      setTitle(item.title);
      setDurationMinutes(getReflectionLibraryDurationMinutes(item));
    }
  }, [selectedItemId, libraryItems]);

  async function loadSubmissions(activityId: string) {
    const rows = await trainingLibraryApi.listActivitySubmissions(activityId);
    setSubmissions((current) => ({ ...current, [activityId]: rows }));
    return rows;
  }

  useEffect(() => {
    if (!focusActivityId) return;
    void Promise.all(visibleReflectionActivities.map((activity) => loadSubmissions(activity.id))).catch((error) => setErrorMessage(getErrorMessage(error)));
  }, [focusActivityId, visibleReflectionActivities.map((activity) => activity.id).join('|')]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    const libraryItem = libraryItems.find((item) => item.id === selectedItemId);
    if (!libraryItem) return setErrorMessage('Cần chọn bài thu hoạch từ thư viện.');
    try {
      await trainingLibraryApi.assignReflectionToClass({ classId, courseId, libraryItem, title, maxAttempts, durationMinutes, published });
      setSelectedItemId('');
      setDurationMinutes(DEFAULT_REFLECTION_DURATION_MINUTES);
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function grade(submission: TrainingActivitySubmission) {
    setErrorMessage('');
    const draft = grading[submission.id];
    if (!draft) return;
    try {
      await trainingLibraryApi.gradeReflection({
        submission,
        score: Number(draft.score || 0),
        feedback: draft.feedback,
        status: draft.status,
      });
      await loadSubmissions(submission.activityId);
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function exportReflectionCompletion(activity: SuniTrainingClassActivity) {
    const rows = submissions[activity.id] || [];
    await downloadTrainingCompletionWorkbook({
      classId,
      activityTitle: activity.title,
      activityType: 'reflection',
      students: classStudents,
      submissions: rows,
    });
  }

  async function allowSubmissionEdit(submission: TrainingActivitySubmission) {
    setErrorMessage('');
    try {
      await trainingLibraryApi.updateReflectionSubmissionAnswers({
        submission,
        answers: submission.answers,
        status: 'needs_resubmission',
      });
      await loadSubmissions(submission.activityId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function deleteReflectionResult(submission: TrainingActivitySubmission) {
    const confirmed = window.confirm('Xóa bài thu hoạch này? Học viên sẽ được mở lại lượt làm nếu trước đó đã hết số lượt cho phép.');
    if (!confirmed) return;
    setErrorMessage('');
    try {
      await trainingLibraryApi.deleteReflectionSubmission(submission);
      await loadSubmissions(submission.activityId);
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) });
      pushToast({ title: 'Đã xóa bài thu hoạch', message: getStudentLabel(submission), tone: 'success' });
    } catch (error) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      pushToast({ title: 'Không xóa được bài thu hoạch', message, tone: 'danger' });
    }
  }

  function getStudentInfo(submission: TrainingActivitySubmission) {
    const student = classStudents.find((item) => item.profileId === submission.studentProfileId);
    if (!student) return { name: submission.studentProfileId || '-', email: '', code: '' };
    return { name: student.fullName || '-', email: student.email || '', code: student.studentCode || '' };
  }

  function getSubmissionSearchText(submission: TrainingActivitySubmission) {
    const student = getStudentInfo(submission);
    return [
      student.name,
      student.email,
      student.code,
      String(submission.attemptNo || ''),
      submission.feedback,
      submission.status,
      ...Object.values(submission.answers || {}),
      ...submission.attachments.map((file) => file.name),
    ].join(' ');
  }

  function openSubmissionDetail(submission: TrainingActivitySubmission) {
    window.open(
      `/vtraining/reflections/${submission.activityId}?submissionId=${submission.id}&student=${encodeURIComponent(getStudentLabel(submission))}`,
      '_blank',
      'noopener,noreferrer',
    );
  }

  function getStudentLabel(submission: TrainingActivitySubmission) {
    const student = classStudents.find((item) => item.profileId === submission.studentProfileId);
    if (!student) return submission.studentProfileId || '-';
    return student.email ? `${student.fullName} · ${student.email}` : student.fullName;
  }

  async function toggleActivityStatus(activity: SuniTrainingClassActivity) {
    const status = nextPublishStatus(activity.status);
    const confirmed = window.confirm(status === 'active' ? 'Phát hành bài thu hoạch này?' : 'Đóng phát hành bài thu hoạch này?');
    if (!confirmed) return;
    setErrorMessage('');
    try {
      await updateActivityMutation.mutateAsync({ activity, status });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function deleteActivity(activity: SuniTrainingClassActivity) {
    const confirmed = window.confirm('Xóa bài thu hoạch này khỏi lớp? Các bài nộp gắn với activity này sẽ không còn thuộc lớp.');
    if (!confirmed) return;
    setErrorMessage('');
    try {
      await deleteActivityMutation.mutateAsync(activity.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="vtraining-detail-stack">
      {focusActivityId ? <div className="suni-native-row-actions"><Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/reflections`}>Quay lại danh sách thu hoạch</Link></div> : null}
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {canManage && !focusActivityId ? (
        <Card title="Chọn bài thu hoạch từ thư viện">
          <form className="form-grid" onSubmit={(event) => void assign(event)}>
            <label className="full">
              <span>Bài trong thư viện</span>
              <select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}>
                <option value="">Chọn bài thu hoạch</option>
                {libraryItems.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
              </select>
            </label>
            <label><span>Tiêu đề trong lớp</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <label><span>Thời lượng phút</span><input type="number" min={1} value={durationMinutes} onChange={(event) => setDurationMinutes(normalizeReflectionDurationMinutes(event.target.value))} /></label>
            <label><span>Số lần nộp lại</span><input type="number" min={1} value={maxAttempts} onChange={(event) => setMaxAttempts(Number(event.target.value || 1))} /></label>
            <div className="action-row full">
              <label className="checkbox-row"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> Phát hành</label>
              <button className="btn btn-primary" disabled={!selectedItemId || !title.trim()}>Gán vào lớp</button>
            </div>
          </form>
        </Card>
      ) : null}

      {visibleReflectionActivities.map((activity) => {
        const rows = submissions[activity.id] || [];
        const filteredRows = rows.filter((row) => looselyMatchesSearch(getSubmissionSearchText(row), reflectionSearch));
        const activityDurationMinutes = normalizeReflectionDurationMinutes(activity.metadata?.durationMinutes as number | string | null | undefined);
        const isLockedForStudent = isStudent && !isPublishedStatus(activity.status);
        const variants = Array.isArray(activity.metadata?.variants) ? activity.metadata.variants : [];
        const firstVariant = variants[0];
        const previewQuestions = Array.isArray(firstVariant?.questions) ? firstVariant.questions : [];
        return (
          <Card
            key={activity.id}
            title={activity.title}
            action={(
              <div className="suni-native-row-actions">
                <Badge tone={activityTone(activity.status)}>{activityStatusLabel(activity.status)}</Badge>
                {canManage ? (
                  <>
                    {!focusActivityId ? <Link className="btn btn-ghost btn-small" to={`/vtraining/classes/${classId}/reflections/${activity.id}`}>Chi tiết</Link> : null}
                    <button className="btn btn-ghost btn-small" disabled={updateActivityMutation.isPending} onClick={() => void toggleActivityStatus(activity)}>{activity.status === 'active' ? 'Đóng phát hành' : 'Phát hành'}</button>
                    {focusActivityId ? <button className="btn btn-ghost btn-small" disabled={!classStudents.length} onClick={() => exportReflectionCompletion(activity)}><Download size={14} /> Trích xuất</button> : null}
                    <button className="btn btn-danger btn-small" disabled={deleteActivityMutation.isPending} onClick={() => void deleteActivity(activity)}><Trash2 size={14} /> Xóa</button>
                  </>
                ) : null}
              </div>
            )}
          >
            {isStudent ? (
              <div
                className={`vtraining-quiz-activity-card suni-native-click-row ${isLockedForStudent ? 'is-locked' : ''}`}
                onClick={() => {
                  if (isLockedForStudent) {
                    pushToast({ title: getActivityNotOpenNotice('reflection'), tone: 'warning' });
                    return;
                  }
                  window.open(`/vtraining/reflections/${activity.id}`, '_blank', 'noopener,noreferrer');
                }}
              >
                <div className="suni-native-toolbar suni-native-toolbar-compact">
                  <span><strong>{activity.title}</strong> · {activityDurationMinutes} phút · {activityStatusLabel(activity.status)}</span>
                  <button type="button" className="btn btn-primary btn-small" onClick={(event) => {
                    event.stopPropagation();
                    if (isLockedForStudent) {
                      pushToast({ title: getActivityNotOpenNotice('reflection'), tone: 'warning' });
                      return;
                    }
                    window.open(`/vtraining/reflections/${activity.id}`, '_blank', 'noopener,noreferrer');
                  }}>
                    Làm bài thu hoạch
                  </button>
                </div>
              </div>
            ) : focusActivityId ? (
              <>
              <div className="vtraining-reflection-submission-toolbar">
                <label>
                  <span>Tìm bài nộp</span>
                  <input
                    value={reflectionSearch}
                    onChange={(event) => setReflectionSearch(event.target.value)}
                    placeholder="Nhập tên, email, mã học viên, nội dung hoặc nhận xét"
                  />
                </label>
                <Badge tone={filteredRows.length === rows.length ? 'neutral' : 'success'}>{filteredRows.length}/{rows.length} bài nộp</Badge>
              </div>
              <div className="suni-native-table-wrap">
                <table className="data-table suni-native-table vtraining-reflection-submission-table">
                  <thead><tr><th>STT</th><th>Học viên</th><th>Lần</th><th>Bài làm</th><th>Điểm</th><th>Nhận xét</th><th>Thao tác</th></tr></thead>
                  <tbody>
                    {filteredRows.map((row, index) => {
                      const draft = grading[row.id] || { score: String(row.score ?? ''), feedback: row.feedback || '', status: row.status === 'needs_resubmission' ? 'needs_resubmission' as const : 'graded' as const };
                      const student = getStudentInfo(row);
                      return (
                        <tr key={row.id} className="suni-native-click-row" onClick={() => openSubmissionDetail(row)}>
                          <td className="vtraining-row-index">{index + 1}</td>
                          <td>
                            <div className="vtraining-student-identity">
                              <strong>{student.name}</strong>
                              <span>{student.email || '-'}</span>
                            </div>
                          </td>
                          <td>{row.attemptNo}</td>
                          <td>
                            <div
                              role="button"
                              tabIndex={0}
                              className="vtraining-reflection-answer-preview vtraining-reflection-answer-link"
                              onClick={() => window.open(`/vtraining/reflections/${row.activityId}?submissionId=${row.id}&student=${encodeURIComponent(getStudentLabel(row))}`, '_blank', 'noopener,noreferrer')}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  window.open(`/vtraining/reflections/${row.activityId}?submissionId=${row.id}&student=${encodeURIComponent(getStudentLabel(row))}`, '_blank', 'noopener,noreferrer');
                                }
                              }}
                            >
                              {Object.values(row.answers).filter(Boolean).map((answer, index) => (
                                <p key={`${row.id}-${index}`}>{answer}</p>
                              ))}
                              {!Object.values(row.answers).filter(Boolean).length ? <span>-</span> : null}
                              {row.attachments.map((file) => file.url ? <a key={file.path || file.name} href={file.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{file.name}</a> : file.name)}
                            </div>
                          </td>
                          <td onClick={(event) => event.stopPropagation()}><input className="vtraining-score-input" type="number" min="0" max="10" step="0.1" value={draft.score} onChange={(event) => setGrading((current) => ({ ...current, [row.id]: { ...draft, score: event.target.value } }))} /></td>
                          <td onClick={(event) => event.stopPropagation()}><input value={draft.feedback} onChange={(event) => setGrading((current) => ({ ...current, [row.id]: { ...draft, feedback: event.target.value } }))} /></td>
                          <td onClick={(event) => event.stopPropagation()}><div className="suni-native-row-actions">
                            <select value={draft.status} onChange={(event) => setGrading((current) => ({ ...current, [row.id]: { ...draft, status: event.target.value as 'graded' | 'needs_resubmission' } }))}>
                              <option value="graded">Đã chấm</option>
                              <option value="needs_resubmission">Cần nộp lại</option>
                            </select>
                            <button className="btn btn-ghost btn-small" onClick={() => void allowSubmissionEdit(row)}>Cho phép sửa</button>
                            <button className="btn btn-primary btn-small" onClick={() => void grade(row)}>Lưu điểm</button>
                            <button className="btn btn-danger btn-small" onClick={() => void deleteReflectionResult(row)}><Trash2 size={14} /> Xóa kết quả</button>
                          </div></td>
                        </tr>
                      );
                    })}
                    {!rows.length ? <tr><td colSpan={7}>Chưa có bài nộp.</td></tr> : null}
                  </tbody>
                </table>
              </div>
              </>
            ) : (
              <div className="vtraining-detail-stack">
                {activity.description ? <p className="muted-text">{activity.description}</p> : null}
                {firstVariant?.title ? (
                  <div className="suni-native-toolbar suni-native-toolbar-compact">
                    <span><FileText size={16} /> {firstVariant.title}</span>
                    <Badge tone="neutral">{previewQuestions.length || 1} câu hỏi · {activityDurationMinutes} phút</Badge>
                  </div>
                ) : null}
                <div className="lecturer-bank-question-stack">
                  {previewQuestions.length ? previewQuestions.map((question: any) => (
                    <article className="lecturer-bank-question" key={question.id || question.code || question.prompt}>
                      <div className="lecturer-bank-question-code">Câu {question.code || ''}</div>
                      <h4>{formatReflectionQuestionPrompt(question.prompt)}</h4>
                      {question.guidance ? <p className="muted-text">{question.guidance}</p> : null}
                    </article>
                  )) : (
                    <article className="lecturer-bank-question">
                      <div className="lecturer-bank-question-code">Bài thu hoạch</div>
                      <h4>{activity.description || 'Mẫu bài thu hoạch đã được gán vào lớp.'}</h4>
                    </article>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}
      {!visibleReflectionActivities.length ? <Card title="Thu hoạch của lớp"><div className="muted-text">Chưa có bài thu hoạch được gán.</div></Card> : null}
    </div>
  );
}

function ClassGameLibraryManager({ classId, className, courseId, activities, students, canManage, isStudent, focusActivityId }: { classId: string; className?: string | null; courseId?: string | null; activities: SuniTrainingClassActivity[]; students: SuniClassStudent[]; canManage: boolean; isStudent: boolean; focusActivityId?: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const { profile, session: authSession } = useAuth();
  const games = getDefaultGameCatalog();
  const [gameId, setGameId] = useState(games[0]?.id || '');
  const [title, setTitle] = useState(games[0]?.projectName || '');
  const [published, setPublished] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [resettingRankId, setResettingRankId] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);
  const gameActivities = activities.filter((activity) => activity.type === 'game');
  const scopedGameActivities = focusActivityId ? gameActivities.filter((activity) => activity.id === focusActivityId) : gameActivities;
  const visibleActivities = isStudent ? scopedGameActivities.filter((activity) => !isDraftStatus(activity.status)) : scopedGameActivities;
  const getActivityGameId = (activity: SuniTrainingClassActivity) => activity.sourceId || String(activity.metadata?.gameId || '');
  const supportsRealtimeRank = (activity: SuniTrainingClassActivity) => {
    const activityGameId = getActivityGameId(activity);
    if (!activityGameId) return false;
    return games.some((game) => game.id === activityGameId && game.resultMode !== 'session');
  };
  const getClassGameUrl = (activity: SuniTrainingClassActivity) => {
    const activityGameId = getActivityGameId(activity);
    if (!activityGameId) return '';
    const params = new URLSearchParams({
      classId,
      activityId: activity.id,
    });
    return `/play/${encodeURIComponent(activityGameId)}?${params.toString()}`;
  };
  const getClassGameRankUrl = (activity: SuniTrainingClassActivity) => {
    const url = getClassGameUrl(activity);
    if (!url) return '';
    return `${url}&view=rank`;
  };
  const currentStudent = useMemo(() => {
    if (!isStudent || !profile) return null;
    const profileId = String(profile.id || '').trim();
    const email = String(profile.email || '').trim().toLowerCase();
    return students.find((student) =>
      (profileId && String(student.profileId || '').trim() === profileId) ||
      (email && String(student.email || '').trim().toLowerCase() === email)
    ) || null;
  }, [isStudent, profile, students]);
  const prepareStudentGameSession = (activity: SuniTrainingClassActivity) => {
    if (!isStudent || !profile) return;
    const activityGameId = getActivityGameId(activity);
    if (!activityGameId) return;
    const email = String(currentStudent?.email || profile.email || '').trim();
    const playerName = String(currentStudent?.fullName || profile.fullName || email).trim() || email;
    const groupName = String(currentStudent?.groupName || profile.studentGroup || '').trim();
    const resolvedClassName = String(className || profile.studentClass || classId).trim() || classId;
    if (!email || !playerName || !groupName) {
      pushToast({
        title: 'Chưa đủ thông tin học viên',
        message: 'Game cần email, tên và nhóm trong danh sách lớp để tự điền.',
        tone: 'warning',
      });
      return;
    }
    savePlxGameSession({
      gameId: activityGameId,
      participantId: getOrCreatePlxParticipantId(activityGameId),
      classId,
      activityId: activity.id,
      profileId: currentStudent?.profileId || profile.id || null,
      authUserId: authSession?.user?.id || profile.authUserId || null,
      email,
      playerName,
      className: resolvedClassName,
      groupName,
      savedAt: new Date().toISOString(),
    }, { classId, activityId: activity.id });
  };
  const openClassGame = (activity: SuniTrainingClassActivity, url: string) => {
    if (isStudent) prepareStudentGameSession(activity);
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const updateActivityMutation = useMutation({
    mutationFn: ({ activity, status }: { activity: SuniTrainingClassActivity; status: string }) => suniTrainingApi.saveClassActivity({
      id: activity.id,
      classId,
      courseId: activity.courseId || courseId || null,
      type: activity.type,
      title: activity.title,
      description: activity.description || '',
      status,
      sourceId: activity.sourceId,
      libraryItemId: activity.libraryItemId,
      openAt: activity.openAt,
      closeAt: activity.closeAt,
      metadata: activity.metadata || {},
    }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) }),
  });
  const deleteActivityMutation = useMutation({
    mutationFn: (activityId: string) => suniTrainingApi.deleteClassActivity(activityId),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) }),
  });

  useEffect(() => {
    const game = games.find((item) => item.id === gameId);
    if (game) setTitle(game.projectName);
  }, [gameId]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isAssigning) return;
    setErrorMessage('');
    setIsAssigning(true);
    try {
      const selectedGame = games.find((item) => item.id === gameId);
      const existingActivity = gameActivities.find((activity) => getActivityGameId(activity) === gameId);
      await suniTrainingApi.saveClassActivity({
        id: existingActivity?.id,
        classId,
        courseId: existingActivity?.courseId || courseId,
        type: 'game',
        title,
        description: selectedGame?.description || '',
        status: published ? 'active' : 'draft',
        sourceId: gameId,
        libraryItemId: existingActivity?.libraryItemId,
        openAt: existingActivity?.openAt,
        closeAt: existingActivity?.closeAt,
        metadata: { ...(existingActivity?.metadata || {}), gameId, classId },
      });
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classActivities(classId) });
      pushToast({
        title: existingActivity ? 'Đã cập nhật game trong lớp' : 'Đã gán game vào lớp',
        message: title,
        tone: 'success',
      });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsAssigning(false);
    }
  }

  async function toggleActivityStatus(activity: SuniTrainingClassActivity) {
    const status = nextPublishStatus(activity.status);
    const confirmed = window.confirm(status === 'active' ? 'Phát hành game này?' : 'Đóng phát hành game này?');
    if (!confirmed) return;
    setErrorMessage('');
    try {
      await updateActivityMutation.mutateAsync({ activity, status });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function deleteActivity(activity: SuniTrainingClassActivity) {
    const confirmed = window.confirm('Xóa game này khỏi lớp?');
    if (!confirmed) return;
    setErrorMessage('');
    try {
      await deleteActivityMutation.mutateAsync(activity.id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function resetRank(activity: SuniTrainingClassActivity) {
    const activityGameId = getActivityGameId(activity);
    if (!activityGameId || !supportsRealtimeRank(activity) || resettingRankId) return;
    const confirmed = window.confirm(`Reset rank realtime của ${activity.title} trong lớp này?`);
    if (!confirmed) return;
    setErrorMessage('');
    setResettingRankId(activity.id);
    const scope = { classId, activityId: activity.id };
    try {
      await deletePlxGameRuns(activityGameId, scope);
      await deletePlxGameParticipants(activityGameId, scope);
      clearPlxGameSession(activityGameId, scope);
      pushToast({ title: 'Đã reset rank realtime', message: activity.title, tone: 'success' });
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setResettingRankId('');
    }
  }

  return (
    <div className="vtraining-detail-stack">
      {focusActivityId ? <div className="suni-native-row-actions"><Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/games`}>Quay lại danh sách game</Link></div> : null}
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {canManage && !focusActivityId ? (
        <Card title="Chọn game từ danh mục VContent">
          <form className="form-grid" onSubmit={(event) => void assign(event)}>
            <label className="full"><span>Game</span><select value={gameId} onChange={(event) => setGameId(event.target.value)}>{games.map((game) => <option value={game.id} key={game.id}>{game.projectName}</option>)}</select></label>
            <label className="full"><span>Tiêu đề trong lớp</span><input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
            <div className="action-row full">
              <label className="checkbox-row"><input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} /> Phát hành</label>
              <button className="btn btn-primary" disabled={!gameId || !title.trim() || isAssigning}>{isAssigning ? 'Đang gán...' : 'Gán vào lớp'}</button>
              <Link className="btn btn-ghost" to="/gsmf00">Mở danh mục game</Link>
            </div>
          </form>
        </Card>
      ) : null}
      <Card title="Game của lớp" action={<Badge tone={visibleActivities.length ? 'success' : 'warning'}>{visibleActivities.length} game</Badge>}>
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Game</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {visibleActivities.map((activity) => {
                const isLockedForStudent = isStudent && !isPublishedStatus(activity.status);
                const url = getClassGameUrl(activity);
                const rankUrl = supportsRealtimeRank(activity) ? getClassGameRankUrl(activity) : '';
                const isResettingRank = resettingRankId === activity.id;
                return (
                  <tr
                    key={activity.id}
                    className={`${url ? 'suni-native-click-row' : ''} ${isLockedForStudent ? 'is-locked' : ''}`}
                    onClick={() => {
                      if (canManage && !focusActivityId) {
                        navigate(`/vtraining/classes/${classId}/games/${activity.id}`);
                        return;
                      }
                      if (isLockedForStudent) {
                        pushToast({ title: getActivityNotOpenNotice('game'), tone: 'warning' });
                        return;
                      }
                      if (url) openClassGame(activity, url);
                    }}
                  >
                  <td><strong>{activity.title}</strong></td>
                  <td><Badge tone={activityTone(activity.status)}>{activityStatusLabel(activity.status)}</Badge></td>
                  <td>
                    {canManage ? (
                      <div className="suni-native-row-actions">
                        {rankUrl ? (
                          <>
                            <button
                              className="btn btn-ghost btn-small"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                window.open(rankUrl, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              Xem rank realtime
                            </button>
                            <button
                              className="btn btn-danger btn-small"
                              type="button"
                              disabled={Boolean(resettingRankId)}
                              onClick={(event) => {
                                event.stopPropagation();
                                void resetRank(activity);
                              }}
                            >
                              {isResettingRank ? 'Đang reset...' : 'Reset rank'}
                            </button>
                          </>
                        ) : null}
                        <button className="btn btn-ghost btn-small" disabled={updateActivityMutation.isPending} onClick={(event) => { event.stopPropagation(); void toggleActivityStatus(activity); }}>{activity.status === 'active' ? 'Đóng phát hành' : 'Phát hành'}</button>
                        <button className="btn btn-danger btn-small" disabled={deleteActivityMutation.isPending} onClick={(event) => { event.stopPropagation(); void deleteActivity(activity); }}><Trash2 size={14} /> Xóa</button>
                      </div>
                    ) : '-'}
                  </td>
                  </tr>
                );
              })}
              {!visibleActivities.length ? <tr><td colSpan={3}>Chưa có game được gán.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ClassDiscussionMonitorPanel({ classId, eventId }: { classId: string; eventId: string }) {
  const monitorPollMs = getScaleAwarePollMs('discussion-monitor', getRuntimePollMs('discussion', 15000, {
    envName: 'VITE_DISCUSSION_MONITOR_POLL_MS',
    useScopeDefault: false,
  }));
  const monitoringQuery = useQuery({
    queryKey: discussionQueries.classMonitorSummary(eventId),
    queryFn: () => vdiscussionApi.getEventMonitoringSummary(eventId),
    enabled: Boolean(eventId),
    refetchInterval: buildRuntimeRefetchInterval(monitorPollMs, `class-monitor:${classId}:${eventId}`),
    refetchIntervalInBackground: false,
  });
  const monitors = monitoringQuery.data || [];
  const totals = useMemo(() => monitors.reduce(
    (acc, monitor) => ({
      groups: acc.groups + 1,
      members: acc.members + monitor.totalMembers,
      joined: acc.joined + monitor.joinedCount,
      contributed: acc.contributed + monitor.contributedCount,
      completed: acc.completed + (monitor.completionPercent >= 100 ? 1 : 0),
    }),
    { groups: 0, members: 0, joined: 0, contributed: 0, completed: 0 },
  ), [monitors]);

  function groupLabel(monitor: VDiscussionGroupMonitorSummary) {
    return String(monitor.group.name || 'Nhóm thảo luận').replace(/^Nhom\b/i, 'Nhóm');
  }

  return (
    <div className="vtraining-detail-stack">
      <div className="suni-native-row-actions">
        <Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/discussions`}>Quay lại danh sách</Link>
        <Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/discussions/${eventId}`}>Điều chỉnh</Link>
        <Link className="btn btn-primary" to={`/vdiscussion/${eventId}`}>Mở VDiscussion</Link>
      </div>
      <Card
        title="Theo dõi tiến trình thảo luận"
        action={<Badge tone={monitoringQuery.isFetching ? 'warning' : 'success'}>{monitoringQuery.isFetching ? 'Đang cập nhật' : `${totals.groups} nhóm`}</Badge>}
      >
        {monitoringQuery.error ? <div className="notice danger">{getErrorMessage(monitoringQuery.error)}</div> : null}
        <div className="vtraining-detail-grid">
          <div><span>Nhóm</span><strong>{totals.groups}</strong></div>
          <div><span>Đã vào phiên</span><strong>{totals.joined}/{totals.members}</strong></div>
          <div><span>Có đóng góp</span><strong>{totals.contributed}/{totals.members}</strong></div>
          <div><span>Hoàn thành</span><strong>{totals.completed}/{totals.groups}</strong></div>
        </div>
      </Card>
      <Card title="Tiến trình từng nhóm" action={<Badge tone="violet">poll {Math.round(monitorPollMs / 1000)}s</Badge>}>
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Nhóm</th><th>Chủ đề</th><th>Bước</th><th>Đã vào</th><th>Đóng góp</th><th>Hoàn thành</th><th>Kết quả</th><th>Thao tác</th></tr></thead>
            <tbody>
              {monitors.map((monitor) => (
                <tr key={monitor.group.id}>
                  <td><strong>{groupLabel(monitor)}</strong></td>
                  <td>{monitor.topic?.title || '-'}</td>
                  <td>{monitor.currentStep}</td>
                  <td>{monitor.joinedCount}/{monitor.totalMembers}</td>
                  <td>{monitor.contributedCount}/{monitor.totalMembers}</td>
                  <td>{monitor.completionPercent}%</td>
                  <td>{monitor.result.score == null ? '-' : `${monitor.result.score}/10`}</td>
                  <td>
                    <div className="suni-native-row-actions">
                      {monitor.session?.id ? <Link className="btn btn-ghost btn-small" to={`/vdiscussion/session/${monitor.session.id}/overview`}>Phiên</Link> : null}
                      <Link className="btn btn-primary btn-small" to={`/vdiscussion/${eventId}/results/${monitor.group.id}`}>Kết quả</Link>
                    </div>
                  </td>
                </tr>
              ))}
              {monitoringQuery.isLoading ? <tr><td colSpan={8}>Đang tải tiến trình nhóm...</td></tr> : null}
              {!monitoringQuery.isLoading && !monitors.length ? <tr><td colSpan={8}>Chưa có nhóm nào để theo dõi.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function ClassDiscussionRoutePanel({
  classId,
  eventId,
  view,
}: {
  classId: string;
  eventId: string;
  view?: string;
}) {
  const normalizedView = String(view || 'detail').toLowerCase();
  if (normalizedView === 'monitor') return <ClassDiscussionMonitorPanel classId={classId} eventId={eventId} />;
  if (normalizedView === 'results') {
    return (
      <div className="vtraining-detail-stack">
        <div className="suni-native-row-actions">
          <Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/discussions`}>Quay lại danh sách</Link>
          <Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/discussions/${eventId}/monitor`}>Theo dõi tiến trình</Link>
          <Link className="btn btn-primary" to={`/vdiscussion/${eventId}`}>Mở VDiscussion</Link>
        </div>
        <ClassDiscussionMonitorPanel classId={classId} eventId={eventId} />
      </div>
    );
  }
  return (
    <Card title="Điều chỉnh thảo luận">
      <div className="vtraining-detail-stack">
        <div className="notice">Mở màn hình VDiscussion để điều chỉnh chủ đề, nhóm, học viên và trạng thái phát hành.</div>
        <div className="suni-native-row-actions">
          <Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/discussions`}>Quay lại danh sách</Link>
          <Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/discussions/${eventId}/monitor`}>Theo dõi tiến trình</Link>
          <Link className="btn btn-ghost" to={`/vtraining/classes/${classId}/discussions/${eventId}/results`}>Kết quả</Link>
          <Link className="btn btn-primary" to={`/vdiscussion/${eventId}`}>Điều chỉnh trong VDiscussion</Link>
        </div>
      </div>
    </Card>
  );
}

function CustomerContactsPanel({
  classId,
  contacts,
  customers,
  form,
  isSaving,
  onChange,
  onSubmit,
}: {
  classId: string;
  contacts: SuniUser[];
  customers: SuniUser[];
  form: CustomerContactFormState;
  isSaving: boolean;
  onChange: <K extends keyof CustomerContactFormState>(field: K, value: CustomerContactFormState[K]) => void;
  onSubmit: () => void;
}) {
  const assignedContactIds = useMemo(() => new Set(contacts.map((contact) => String(contact.id || ''))), [contacts]);
  const isExistingCustomer = Boolean(form.profileId);
  const selectedCustomerAlreadyAssigned = Boolean(form.profileId && assignedContactIds.has(form.profileId));

  return (
    <div className="vtraining-detail-stack">
      <Card title="Thêm đầu mối khách hàng">
        <form className="form-grid" onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}>
          <label className="full">
            <span>Chọn khách hàng đã có</span>
            <select
              value={form.profileId}
              onChange={(event) => {
                const profileId = event.target.value;
                const customer = customers.find((entry) => entry.id === profileId);
                onChange('profileId', profileId);
                onChange('fullName', customer?.fullName || customer?.name || '');
                onChange('email', customer?.email || '');
              }}
            >
              <option value="">Tạo khách hàng mới</option>
              {customers.map((customer) => {
                const alreadyAssigned = assignedContactIds.has(String(customer.id || ''));
                return (
                <option value={customer.id} key={customer.id}>
                  {customer.fullName || customer.name || customer.email || customer.id} - {customer.email || 'chưa có email'}{alreadyAssigned ? ' - đã gán' : ''}
                </option>
                );
              })}
            </select>
          </label>
          <label><span>Họ tên</span><input value={form.fullName} disabled={isExistingCustomer} onChange={(event) => onChange('fullName', event.target.value)} placeholder="VD: Nguyễn Văn A" /></label>
          <label><span>Email đăng nhập</span><input type="email" value={form.email} disabled={isExistingCustomer} onChange={(event) => onChange('email', event.target.value)} placeholder="khachhang@company.vn" /></label>
          <div className="notice full">{selectedCustomerAlreadyAssigned ? 'Tài khoản này đã được gán quyền xem lớp hiện tại.' : isExistingCustomer ? 'Tài khoản đã có sẽ được gán thêm quyền xem lớp này, không tạo lại tài khoản.' : <>Tài khoản thật sẽ được tạo với mật khẩu mặc định <strong>123456</strong> và chỉ được gán quyền xem kết quả của lớp này.</>}</div>
          <div className="action-row full">
            <button type="submit" className="btn btn-primary" disabled={!form.fullName.trim() || !form.email.trim() || selectedCustomerAlreadyAssigned || isSaving}>
              {isSaving ? 'Đang lưu...' : selectedCustomerAlreadyAssigned ? 'Đã gán khách hàng này' : isExistingCustomer ? 'Gán khách hàng vào lớp' : 'Tạo tài khoản khách hàng'}
            </button>
          </div>
        </form>
      </Card>

      <Card title="Đầu mối đã gán" action={<Badge tone={contacts.length ? 'success' : 'neutral'}>{contacts.length} tài khoản</Badge>}>
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Họ tên</th><th>Email</th><th>Role</th><th>Quyền xem</th></tr></thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id}>
                  <td><strong>{contact.fullName || contact.name || '-'}</strong></td>
                  <td>{contact.email || '-'}</td>
                  <td>{contact.role || 'client'}</td>
                  <td><Badge tone="success">Lớp {classId}</Badge></td>
                </tr>
              ))}
              {!contacts.length ? <tr><td colSpan={4}>Chưa có đầu mối khách hàng được gán cho lớp.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function SuniTrainingClassDetailPage() {
  const { classId, classTab, activityId = '', eventId = '', discussionView = '' } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const activeTab = eventId ? 'discussion' : normalizeClassDetailTab(classTab);
  const [importRows, setImportRows] = useState<SuniClassStudentImportRow[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [singleStudentForm, setSingleStudentForm] = useState<SingleStudentFormState>(EMPTY_SINGLE_STUDENT_FORM);
  const [editingStudentId, setEditingStudentId] = useState('');
  const [studentEditForm, setStudentEditForm] = useState<SingleStudentFormState>(EMPTY_SINGLE_STUDENT_FORM);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [bulkGroupName, setBulkGroupName] = useState('');
  const [studentGroupFilter, setStudentGroupFilter] = useState('');
  const [studentDepartmentFilter, setStudentDepartmentFilter] = useState('');
  const [studentPositionFilter, setStudentPositionFilter] = useState('');
  const [customerContactForm, setCustomerContactForm] = useState<CustomerContactFormState>(EMPTY_CUSTOMER_CONTACT_FORM);
  const [selectedDiscussionId, setSelectedDiscussionId] = useState('');
  const [selectedClassDiscussionIds, setSelectedClassDiscussionIds] = useState<string[]>([]);
  const [editingAgenda, setEditingAgenda] = useState<SuniTrainingAgenda | null>(null);
  const [actionError, setActionError] = useState('');
  const classRumRef = useRef({ classId: classId || '', startedAt: getRumStartedAt(), reported: false });

  if (!classId) return <Navigate to="/vtraining/classes" replace />;

  const classQuery = useQuery({
    queryKey: trainingQueries.classDetail(classId),
    queryFn: () => suniTrainingApi.getClass(classId),
  });
  useEffect(() => {
    if (classRumRef.current.classId !== classId) {
      classRumRef.current = { classId, startedAt: getRumStartedAt(), reported: false };
      return;
    }
    if (classRumRef.current.reported || (!classQuery.data && !classQuery.error)) return;
    classRumRef.current.reported = true;
    void reportVLearningRum('open_class', getRumDurationMs(classRumRef.current.startedAt), {
      status: classQuery.error ? 'error' : 'ok',
      scopeType: 'class',
      scopeId: classId,
    });
  }, [classId, classQuery.data, classQuery.error]);
  const viewerRole = normalizeAppRole(profile?.role);
  const isStudent = viewerRole === 'hoc_vien';
  const isInstructor = viewerRole === 'giang_vien';
  const isCustomer = viewerRole === 'client' || viewerRole === 'client_director';
  const canManage = isTrainingAdminRole(profile?.role);
  const canInstructorViewClass = !isInstructor || Boolean(classQuery.data && (
    classQuery.data.instructorId === profile?.id || classQuery.data.instructorIds?.includes(profile?.id || '')
  ));
  const canCustomerViewClass = !isCustomer || isClassAssignedToCustomer(classQuery.data, profile?.id);
  const canViewClass = canInstructorViewClass && canCustomerViewClass;
  const isDiscussionRoute = activeTab === 'discussion';
  const isQuizRoute = activeTab === 'quiz';
  const isReflectionRoute = activeTab === 'reflection';
  const isGameRoute = activeTab === 'game';
  const isActivityRoute = isQuizRoute || isReflectionRoute || isGameRoute;
  const studentsQuery = useQuery({
    queryKey: trainingQueries.classStudents(classId, isStudent ? profile?.id || profile?.email || 'self' : 'all'),
    queryFn: () => suniTrainingApi.listClassStudentsFast(classId, isStudent ? { profileId: profile?.id, email: profile?.email } : undefined),
    enabled: (activeTab === 'students' && (canManage || (isCustomer && canCustomerViewClass)))
      || (isDiscussionRoute && canManage)
      || (activeTab === 'overview' && isStudent && canViewClass),
    staleTime: CLASS_DETAIL_STALE_MS,
  });
  const discussionsQuery = useQuery({
    queryKey: trainingQueries.classDiscussions(classId),
    queryFn: () => vdiscussionApi.listClassEvents(classId),
    enabled: !isCustomer && canViewClass && isDiscussionRoute && !eventId,
  });
  const discussionTemplatesQuery = useQuery({
    queryKey: discussionQueries.libraryTemplates(),
    queryFn: () => vdiscussionApi.listLibraryTemplates(''),
    enabled: canManage && isDiscussionRoute && !eventId,
  });
  const classCourseId = classQuery.data?.courseId || '';
  const agendaQuery = useQuery({
    queryKey: trainingQueries.agendas(classId),
    queryFn: () => suniTrainingApi.listAgendas({ courseId: classCourseId, classId }),
    enabled: Boolean(classCourseId) && !isCustomer && canViewClass && activeTab === 'agenda',
  });
  const materialsQuery = useQuery({
    queryKey: trainingQueries.classMaterials(classId, classCourseId, isStudent),
    queryFn: () => suniTrainingApi.listMaterials({ courseId: classCourseId, classId, includeCourseLevelForClass: Boolean(classCourseId), visibleOnly: isStudent }),
    enabled: !isCustomer && canViewClass && (activeTab === 'materials' || (activeTab === 'overview' && isStudent)),
  });
  const activitiesQuery = useQuery({
    queryKey: trainingQueries.classActivitiesForRole(classId, isStudent),
    queryFn: () => suniTrainingApi.listClassActivities(classId, isStudent),
    enabled: !isCustomer && canViewClass && isActivityRoute,
  });
  const resultsQuery = useQuery({
    queryKey: trainingQueries.classResultsForRole(classId, profile?.id || '', isStudent),
    queryFn: () => suniTrainingApi.listClassTrainingResultsFast({ classId, studentProfileId: isStudent ? profile?.id || '' : undefined, classContext: classQuery.data }),
    enabled: activeTab === 'results'
      ? (isCustomer ? canCustomerViewClass : (canViewClass && (!isStudent || Boolean(profile?.id))))
      : (isQuizRoute && Boolean(activityId) && canViewClass && !isStudent),
    staleTime: CLASS_DETAIL_STALE_MS,
  });
  const customerContactsQuery = useQuery({
    queryKey: trainingQueries.classCustomerContacts(classId),
    queryFn: () => suniTrainingApi.listClassCustomerContacts(classId),
    enabled: canManage && activeTab === 'customerContacts',
  });
  const customersQuery = useQuery({
    queryKey: sharedQueries.customerUsers(),
    queryFn: () => suniTrainingApi.listUsers(),
    enabled: canManage && activeTab === 'customerContacts',
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (!classQuery.data || !canViewClass || isStudent) return;
    if (!(canManage || isCustomer)) return;
    void queryClient.prefetchQuery({
      queryKey: trainingQueries.classStudents(classId, 'all'),
      queryFn: () => suniTrainingApi.listClassStudentsFast(classId),
      staleTime: CLASS_DETAIL_STALE_MS,
    });
    void queryClient.prefetchQuery({
      queryKey: trainingQueries.classResultsForRole(classId, profile?.id || '', false),
      queryFn: () => suniTrainingApi.listClassTrainingResultsFast({ classId, classContext: classQuery.data }),
      staleTime: CLASS_DETAIL_STALE_MS,
    });
  }, [canManage, canViewClass, classId, classQuery.data, isCustomer, isStudent, profile?.id, queryClient]);

  const klass = classQuery.data;
  const students = studentsQuery.data || [];
  const allDiscussions = discussionsQuery.data || [];
  const discussionTemplates = discussionTemplatesQuery.data || [];
  const agendas = agendaQuery.data || [];
  const agendaSessionCount = useMemo(() => new Set(agendas.map((agenda) => String(agenda.sessionNo || agenda.id))).size, [agendas]);
  const materials = materialsQuery.data || [];
  const studentOverview = useMemo(
    () => buildStudentClassOverview(students, { profileId: profile?.id, email: profile?.email }),
    [students, profile?.id, profile?.email],
  );
  const activities = activitiesQuery.data || [];
  const results = resultsQuery.data || [];
  const customerContacts = customerContactsQuery.data || [];
  const customerProfiles = useMemo(
    () => (customersQuery.data || []).filter((user) => ['client', 'client_director'].includes(normalizeAppRole(user.role))),
    [customersQuery.data],
  );
  const visibleClassDiscussions = useMemo(() => allDiscussions, [allDiscussions]);
  const selectedClassDiscussionIdSet = useMemo(() => new Set(selectedClassDiscussionIds), [selectedClassDiscussionIds]);
  const libraryDiscussions = useMemo(
    () => isStudent ? [] : discussionTemplates.filter((event) => isDiscussionLibraryTemplate(event)),
    [discussionTemplates, isStudent],
  );
  const studentGroupOptions = useMemo(
    () => [...new Set(students.map((student) => String(student.groupName || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
    [students],
  );
  const studentDepartmentOptions = useMemo(
    () => [...new Set(students.map((student) => String(student.department || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
    [students],
  );
  const studentPositionOptions = useMemo(
    () => [...new Set(students.map((student) => String(student.position || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'vi', { numeric: true })),
    [students],
  );
  const filteredStudents = useMemo(
    () => students.filter((student) => {
      if (studentGroupFilter && String(student.groupName || '').trim() !== studentGroupFilter) return false;
      if (studentDepartmentFilter && String(student.department || '').trim() !== studentDepartmentFilter) return false;
      if (studentPositionFilter && String(student.position || '').trim() !== studentPositionFilter) return false;
      return true;
    }),
    [students, studentGroupFilter, studentDepartmentFilter, studentPositionFilter],
  );

  useEffect(() => {
    const studentIds = new Set(students.map((student) => student.id));
    setSelectedStudentIds((current) => {
      const next = current.filter((id) => studentIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [students]);

  useEffect(() => {
    const discussionIds = new Set(visibleClassDiscussions.map((discussion) => discussion.id));
    setSelectedClassDiscussionIds((current) => {
      const next = current.filter((id) => discussionIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [visibleClassDiscussions]);

  const importStudentsMutation = useMutation({
    mutationFn: () => suniTrainingApi.importClassStudents({ classId, rows: importRows }),
    onSuccess: async () => {
      setImportRows([]);
      setImportFileName('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trainingQueries.classes() }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classStudents(classId) }),
      ]);
    },
  });

  const addSingleStudentMutation = useMutation({
    mutationFn: () => {
      const fullName = singleStudentForm.fullName.trim();
      if (!fullName) throw new Error('Cần nhập họ tên học viên.');
      const email = singleStudentForm.email.trim();
      const duplicateEmail = email && students.some((student) => String(student.email || '').trim().toLowerCase() === email.toLowerCase());
      if (duplicateEmail) throw new Error('Email này đã có trong lớp.');
      const row: SuniClassStudentImportRow = {
        rowNumber: 1,
        fullName,
        groupName: singleStudentForm.groupName.trim(),
        email,
        studentCode: singleStudentForm.studentCode.trim(),
        department: singleStudentForm.department.trim(),
        position: singleStudentForm.position.trim(),
        status: 'ready',
      };
      return suniTrainingApi.importClassStudents({ classId, rows: [row] });
    },
    onSuccess: async () => {
      setSingleStudentForm(EMPTY_SINGLE_STUDENT_FORM);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trainingQueries.classes() }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classStudents(classId) }),
      ]);
    },
  });

  const updateStudentMutation = useMutation({
    mutationFn: () => suniTrainingApi.updateClassStudent({
      id: editingStudentId,
      classId,
      fullName: studentEditForm.fullName.trim(),
      groupName: studentEditForm.groupName.trim(),
      email: studentEditForm.email.trim(),
      studentCode: studentEditForm.studentCode.trim(),
      department: studentEditForm.department.trim(),
      position: studentEditForm.position.trim(),
      status: 'active',
    }),
    onSuccess: async () => {
      setEditingStudentId('');
      setStudentEditForm(EMPTY_SINGLE_STUDENT_FORM);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trainingQueries.classStudents(classId) }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) }),
        queryClient.invalidateQueries({ queryKey: discussionQueries.events() }),
      ]);
    },
  });

  const updateStudentGroupMutation = useMutation({
    mutationFn: () => suniTrainingApi.updateClassStudentsGroup({ classId, studentIds: selectedStudentIds, groupName: bulkGroupName }),
    onSuccess: async () => {
      setSelectedStudentIds([]);
      setBulkGroupName('');
      await queryClient.invalidateQueries({ queryKey: trainingQueries.classStudents(classId) });
    },
  });

  const deleteStudentsMutation = useMutation({
    mutationFn: (studentIds: string[]) => suniTrainingApi.deleteClassStudents({ classId, studentIds }),
    onSuccess: async () => {
      setSelectedStudentIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trainingQueries.classes() }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classStudents(classId) }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) }),
      ]);
    },
  });

  const createCustomerContactMutation = useMutation({
    mutationFn: () => suniTrainingApi.createClassCustomerContact({
      classId,
      profileId: customerContactForm.profileId.trim() || undefined,
      fullName: customerContactForm.fullName.trim(),
      email: customerContactForm.email.trim(),
      password: '123456',
    }),
    onSuccess: async () => {
      setCustomerContactForm(EMPTY_CUSTOMER_CONTACT_FORM);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trainingQueries.classes() }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classDetail(classId) }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classCustomerContacts(classId) }),
        queryClient.invalidateQueries({ queryKey: sharedQueries.customerUsers() }),
      ]);
    },
  });

  const importDiscussionMutation = useMutation({
    mutationFn: async () => {
      if (!klass) throw new Error('Không tìm thấy lớp đào tạo.');
      if (!selectedDiscussionId) throw new Error('Cần chọn thảo luận từ thư viện.');
      if (!students.length) throw new Error('Cần import học viên vào lớp trước khi import thảo luận.');
      const source = await vdiscussionApi.getEvent(selectedDiscussionId);
      const preserveImportedTitle = source.metadata?.preserveTitleOnClassImport === true;
      const importedGroupNames = new Set(students.map((student) => String(student.groupName || '').trim()).filter(Boolean));
      const numberOfGroups = Math.max(1, Math.min(students.length, importedGroupNames.size || 1));
      const importedEvent = await vdiscussionApi.createCompleteEventSetup({
        event: {
          id: `discussion-event-${klass.id}-${source.id}-${Date.now()}`,
          title: preserveImportedTitle ? source.title : `${source.title} - ${klass.name || klass.code || 'Lớp đào tạo'}`,
          description: '',
          startAt: klass.startAt || null,
          endAt: klass.endAt || null,
          status: 'draft',
          maxGroupSize: Math.max(1, Math.ceil(students.length / numberOfGroups)),
          autoCreateGroups: true,
          metadata: {
            setupSource: 'class-discussion-import',
            discussionKind: 'class-instance',
            sourceEventId: source.id,
            classId: klass.id,
            classCode: klass.code || '',
            className: klass.name || '',
            courseId: klass.courseId || '',
            courseTitle: klass.course?.title || '',
          },
        },
        topics: source.topics.map((topic) => ({
          title: topic.title,
          description: topic.description || '',
          topicNumber: topic.topicNumber,
          durationMinutes: topic.durationMinutes,
          subProblems: topic.subProblems,
          metadata: topic.metadata,
        })),
        participants: students.map((student) => ({
          eventId: '',
          profileId: student.profileId || null,
          email: student.email || null,
          fullName: student.fullName,
          studentCode: student.studentCode || null,
          groupName: student.groupName || null,
          status: 'active',
        })),
        numberOfGroups,
        topicGroupMode: 'auto',
        publish: false,
        metadata: {
          importedFromClassDetail: true,
          discussionKind: 'class-instance',
        },
      });
      await suniTrainingApi.linkClassDiscussion({
        classId: klass.id,
        discussionEventId: importedEvent.id,
        sourceDiscussionEventId: source.id,
        status: 'draft',
        metadata: {
          groupCount: numberOfGroups,
          studentCount: students.length,
        },
      });
      return importedEvent;
    },
    onSuccess: async () => {
      setSelectedDiscussionId('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussionQueries.events() }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classDiscussions(classId) }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) }),
      ]);
    },
  });

  const deleteClassDiscussionsMutation = useMutation({
    mutationFn: (discussionEventIds: string[]) => suniTrainingApi.deleteClassDiscussions({ classId, discussionEventIds }),
    onSuccess: async () => {
      setSelectedClassDiscussionIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: discussionQueries.events() }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classDiscussions(classId) }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.classResults(classId) }),
        queryClient.invalidateQueries({ queryKey: trainingQueries.resultsRoot() }),
      ]);
    },
  });

  const updateClassDiscussionStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: VDiscussionStatus }) => {
      await vdiscussionApi.updateEventStatus(id, status);
      return { id, status };
    },
    onSuccess: async ({ id, status }) => {
      queryClient.setQueryData(
        discussionQueries.events(),
        (current: typeof allDiscussions | undefined) => (current || []).map((discussion) => (discussion.id === id ? { ...discussion, status } : discussion)),
      );
      await queryClient.invalidateQueries({ queryKey: discussionQueries.events() });
    },
  });

  const deleteAgendaMutation = useMutation({
    mutationFn: (id: string) => suniTrainingApi.deleteAgenda(id),
    onSuccess: async () => {
      setEditingAgenda(null);
      await queryClient.invalidateQueries({ queryKey: trainingQueries.agendas(classId) });
    },
  });

  async function runAction(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  function setSingleStudentField<K extends keyof SingleStudentFormState>(field: K, value: SingleStudentFormState[K]) {
    setSingleStudentForm((current) => ({ ...current, [field]: value }));
  }

  function setStudentEditField<K extends keyof SingleStudentFormState>(field: K, value: SingleStudentFormState[K]) {
    setStudentEditForm((current) => ({ ...current, [field]: value }));
  }

  function setCustomerContactField<K extends keyof CustomerContactFormState>(field: K, value: CustomerContactFormState[K]) {
    setCustomerContactForm((current) => ({ ...current, [field]: value }));
  }

  function startEditStudent(student: SuniClassStudent) {
    setEditingStudentId(student.id);
    setStudentEditForm({
      fullName: student.fullName || '',
      groupName: student.groupName || '',
      email: student.email || '',
      studentCode: student.studentCode || '',
      department: student.department || '',
      position: student.position || '',
    });
  }

  function toggleStudentSelection(studentId: string, checked: boolean) {
    setSelectedStudentIds((current) => {
      if (checked) return current.includes(studentId) ? current : [...current, studentId];
      return current.filter((id) => id !== studentId);
    });
  }

  function toggleAllStudents(checked: boolean) {
    setSelectedStudentIds(checked ? filteredStudents.map((student) => student.id) : []);
  }

  async function deleteSelectedStudents(studentIds: string[]) {
    if (!studentIds.length) return;
    const confirmed = window.confirm(studentIds.length === 1
      ? 'Xóa học viên này khỏi lớp? Kết quả lớp của học viên này cũng sẽ được gỡ khỏi lớp.'
      : `Xóa ${studentIds.length} học viên khỏi lớp? Kết quả lớp của các học viên này cũng sẽ được gỡ khỏi lớp.`);
    if (!confirmed) return;
    await runAction(() => deleteStudentsMutation.mutateAsync(studentIds));
  }

  function toggleClassDiscussionSelection(discussionId: string, checked: boolean) {
    setSelectedClassDiscussionIds((current) => {
      if (checked) return current.includes(discussionId) ? current : [...current, discussionId];
      return current.filter((id) => id !== discussionId);
    });
  }

  function toggleAllClassDiscussions(checked: boolean) {
    setSelectedClassDiscussionIds(checked ? visibleClassDiscussions.map((discussion) => discussion.id) : []);
  }

  function openClassDiscussion(event: { id: string; status: string }) {
    if (isStudent && !isPublishedStatus(event.status)) {
      pushToast({ title: getActivityNotOpenNotice('discussion'), tone: 'warning' });
      return;
    }
    if (isInstructor) {
      pushToast({ title: 'Giảng viên xem thông tin thảo luận trong tab lớp học.', tone: 'warning' });
      return;
    }
    if (isStudent) {
      window.open(`/vdiscussion/${event.id}`, '_blank', 'noopener,noreferrer');
      return;
    }
    navigate(`/vtraining/classes/${classId}/discussions/${event.id}`);
  }

  async function deleteSelectedClassDiscussions(discussionIds: string[]) {
    if (!discussionIds.length) return;
    const confirmed = window.confirm(discussionIds.length === 1
      ? 'Xóa thảo luận này khỏi lớp? Dữ liệu phiên, nhóm, bài đóng góp và chat của bản thảo luận lớp sẽ bị xóa thật. Bản gốc trong thư viện không bị xóa.'
      : `Xóa ${discussionIds.length} thảo luận khỏi lớp? Dữ liệu phiên, nhóm, bài đóng góp và chat của các bản thảo luận lớp sẽ bị xóa thật. Bản gốc trong thư viện không bị xóa.`);
    if (!confirmed) return;
    await runAction(() => deleteClassDiscussionsMutation.mutateAsync(discussionIds));
  }

  async function updateClassDiscussionStatus(discussionId: string, currentStatus: string) {
    const nextStatus: VDiscussionStatus = currentStatus === 'active' ? 'completed' : 'active';
    const confirmed = window.confirm(nextStatus === 'active'
      ? 'Phát hành thảo luận này cho học viên?'
      : 'Đóng phát hành thảo luận này? Học viên sẽ không còn thấy thảo luận ở danh sách đang mở.');
    if (!confirmed) return;
    await runAction(() => updateClassDiscussionStatusMutation.mutateAsync({ id: discussionId, status: nextStatus }));
  }

  async function handleStudentFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setActionError('');
    setImportFileName(file.name);
    try {
      const XLSX = await loadXlsx();
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
      if (!worksheet) {
        setImportRows([]);
        setActionError('File Excel không có sheet dữ liệu.');
        return;
      }
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as unknown[][];
      setImportRows(parseSuniClassStudentImportRows(rows));
    } catch (error) {
      setImportRows([]);
      setActionError(error instanceof Error ? `Không đọc được file Excel: ${error.message}` : 'Không đọc được file Excel.');
    }
  }

  if (classQuery.isLoading) return <div className="vdiscussion-empty">Đang tải lớp đào tạo...</div>;
  if (!klass) return <div className="vdiscussion-empty">Không tìm thấy lớp đào tạo.</div>;
  if (isCustomer && !canCustomerViewClass) {
    return <div className="vdiscussion-empty"><strong>Chưa được gán quyền xem lớp này</strong><span>Liên hệ quản lý đào tạo để được thêm vào danh sách đầu mối khách hàng của lớp.</span></div>;
  }
  if (isInstructor && !canInstructorViewClass) {
    return <div className="vdiscussion-empty"><strong>Chưa được gán quyền xem lớp này</strong><span>Liên hệ quản lý đào tạo để được gán làm giảng viên của lớp.</span></div>;
  }
  if (isInstructor) {
    return <Navigate to={`/vtraining/classes/${classId}/giaoan`} replace />;
  }
  if (isCustomer && !['overview', 'students', 'results'].includes(activeTab)) {
    return <Navigate to={classTabPath(classId, 'results')} replace />;
  }
  if (isStudent && activeTab === 'materials') {
    return <Navigate to={classTabPath(classId, 'overview')} replace />;
  }

  const validImportRows = importRows.filter((row) => row.status !== 'error');
  const invalidImportRows = importRows.filter((row) => row.status === 'error');

  return (
    <div className="suni-native-page">
      <SectionHeader
        eye="VTraining"
        title={klass.name || 'Lớp đào tạo'}
      />

      {actionError ? <div className="notice danger">{actionError}</div> : null}
      {classQuery.error || studentsQuery.error || discussionsQuery.error || agendaQuery.error || materialsQuery.error || activitiesQuery.error || resultsQuery.error || customerContactsQuery.error || customersQuery.error ? (
        <div className="notice danger">{getErrorMessage(classQuery.error || studentsQuery.error || discussionsQuery.error || agendaQuery.error || materialsQuery.error || activitiesQuery.error || resultsQuery.error || customerContactsQuery.error || customersQuery.error)}</div>
      ) : null}

      <div className="vdiscussion-tabs">
        <button type="button" className={activeTab === 'overview' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'overview'))}><BookOpen size={16} /> Tổng quan</button>
        {canManage || isCustomer ? <button type="button" className={activeTab === 'students' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'students'))}><Users size={16} /> Học viên</button> : null}
        {!isCustomer ? <button type="button" className={activeTab === 'discussion' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'discussion'))}><MessageCircle size={16} /> Thảo luận</button> : null}
        {!isCustomer ? <button type="button" className={activeTab === 'quiz' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'quiz'))}><ListChecks size={16} /> Kiểm tra</button> : null}
        {!isCustomer ? <button type="button" className={activeTab === 'reflection' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'reflection'))}><FileText size={16} /> Thu hoạch</button> : null}
        {!isCustomer ? <button type="button" className={activeTab === 'game' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'game'))}><Gamepad2 size={16} /> Game</button> : null}
        {!isCustomer ? <button type="button" className={activeTab === 'agenda' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'agenda'))}><CalendarDays size={16} /> Agenda</button> : null}
        {!isCustomer && !isStudent ? <button type="button" className={activeTab === 'materials' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'materials'))}><FileText size={16} /> Tài liệu</button> : null}
        <button type="button" className={activeTab === 'results' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'results'))}><ListChecks size={16} /> Kết quả</button>
        {canManage ? <button type="button" className={activeTab === 'customerContacts' ? 'is-active' : ''} onClick={() => navigate(classTabPath(classId, 'customerContacts'))}><Users size={16} /> Đầu mối khách hàng</button> : null}
      </div>

      {activeTab === 'overview' && !isStudent ? (
        <Card title="Thông tin lớp">
          <div className="vtraining-detail-grid">
            <div><span>Mã lớp</span><strong>{klass.code || '-'}</strong></div>
            <div><span>Khóa đào tạo</span><strong>{klass.course?.title || '-'}</strong></div>
            <div><span>Hình thức</span><strong>{klass.deliveryMode || '-'}</strong></div>
            <div><span>Địa điểm / link</span><strong>{klass.location || '-'}</strong></div>
            <div><span>Quản lý lớp</span><strong>{klass.classManager?.fullName || klass.opsTeamName || '-'}</strong></div>
            <div><span>Giảng viên</span><strong>{(klass.instructors?.length ? klass.instructors : klass.instructor ? [klass.instructor] : []).map((user) => user.fullName || user.email || user.id).join(', ') || '-'}</strong></div>
            <div className="full"><span>Mô tả</span><strong>{klass.description || 'Chưa có mô tả.'}</strong></div>
          </div>
        </Card>
      ) : null}

      {activeTab === 'overview' && isStudent ? (
        <div className="vtraining-detail-stack">
          <Card title="Tổng quan lớp">
            <div className="vtraining-student-overview-list">
              <div><span>Khóa đào tạo</span><strong>{klass.course?.title || '-'}</strong></div>
              <div><span>Số nhóm</span><strong>{studentsQuery.isLoading ? 'Đang tải...' : studentOverview.groupCount || '-'}</strong></div>
              <div><span>Nhóm của tôi</span><strong>{studentsQuery.isLoading ? 'Đang tải...' : studentOverview.myGroupName || '-'}</strong></div>
            </div>
          </Card>

          <Card
            title="Thành viên trong nhóm của tôi"
            action={<Badge tone={studentOverview.myGroupMembers.length ? 'success' : 'warning'}>{studentOverview.myGroupMembers.length} học viên</Badge>}
          >
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr><th>Họ tên</th><th>Email</th><th>Mã học viên</th><th>Đơn vị</th><th>Chức vụ</th></tr></thead>
                <tbody>
                  {studentOverview.myGroupMembers.map((student) => (
                    <tr key={student.id}>
                      <td><strong>{student.fullName}</strong></td>
                      <td>{student.email || '-'}</td>
                      <td>{student.studentCode || '-'}</td>
                      <td>{student.department || '-'}</td>
                      <td>{student.position || '-'}</td>
                    </tr>
                  ))}
                  {!studentsQuery.isLoading && !studentOverview.myGroupMembers.length ? (
                    <tr><td colSpan={5}>Chưa có dữ liệu nhóm cho tài khoản này.</td></tr>
                  ) : null}
                  {studentsQuery.isLoading ? <tr><td colSpan={5}>Đang tải danh sách nhóm...</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Tài liệu học tập" action={<Badge tone={materials.length ? 'success' : 'warning'}>{materials.length} file</Badge>}>
            <TrainingMaterialList materials={materials} canManage={false} classId={classId} />
          </Card>
        </div>
      ) : null}

      {activeTab === 'overview' && canManage ? (
        <Card title="Vận hành lớp">
          <div className="suni-native-row-actions">
            <Link className="btn btn-primary" to={`/vtraining/operations?classId=${classId}`}>Thông tin vận hành</Link>
            <Link className="btn btn-ghost" to={`/vtraining/checklist?classId=${classId}`}>Checklist vận hành</Link>
            <Link className="btn btn-ghost" to={`/vtraining/evidence?classId=${classId}`}>Minh chứng vận hành</Link>
          </div>
        </Card>
      ) : null}

      {activeTab === 'students' && (canManage || isCustomer) ? (
        <div className="vtraining-detail-stack">
          {canManage ? (
            <Card title="Thêm học viên lẻ">
              <form className="form-grid" onSubmit={(event) => {
                event.preventDefault();
                void runAction(() => addSingleStudentMutation.mutateAsync());
              }}>
                <label><span>Họ tên</span><input value={singleStudentForm.fullName} onChange={(event) => setSingleStudentField('fullName', event.target.value)} /></label>
                <label><span>Nhóm</span><input value={singleStudentForm.groupName} onChange={(event) => setSingleStudentField('groupName', event.target.value)} placeholder="VD: 1" /></label>
                <label><span>Email</span><input type="email" value={singleStudentForm.email} onChange={(event) => setSingleStudentField('email', event.target.value)} /></label>
                <label><span>Mã học viên</span><input value={singleStudentForm.studentCode} onChange={(event) => setSingleStudentField('studentCode', event.target.value)} /></label>
                <label><span>Đơn vị</span><input value={singleStudentForm.department} onChange={(event) => setSingleStudentField('department', event.target.value)} /></label>
                <label><span>Chức vụ</span><input value={singleStudentForm.position} onChange={(event) => setSingleStudentField('position', event.target.value)} /></label>
                <div className="action-row full">
                  <button type="submit" className="btn btn-primary" disabled={!singleStudentForm.fullName.trim() || addSingleStudentMutation.isPending}>
                    {addSingleStudentMutation.isPending ? 'Đang thêm...' : 'Thêm học viên'}
                  </button>
                </div>
              </form>
            </Card>
          ) : null}

          {canManage ? <Card
            title="Import học viên vào lớp"
            action={<Badge tone={invalidImportRows.length ? 'danger' : validImportRows.length ? 'success' : 'neutral'}>{validImportRows.length} hợp lệ / {invalidImportRows.length} lỗi</Badge>}
          >
            <div className="vtraining-import-box">
              <button type="button" className="btn btn-ghost" onClick={() => void downloadStudentImportTemplate()}>
                <Download size={16} /> Tải file mẫu
              </button>
              <label className="btn btn-ghost">
                <Upload size={16} /> Chọn file Excel
                <input type="file" accept=".xlsx,.xls" hidden onChange={(event) => void handleStudentFile(event)} />
              </label>
              <span>{importFileName || 'Cột bắt buộc: họ tên, nhóm (số), email, đơn vị, chức vụ. Nếu trùng email hoặc mã học viên thì hệ thống cập nhật học viên hiện có.'}</span>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!validImportRows.length || Boolean(invalidImportRows.length) || importStudentsMutation.isPending}
                onClick={() => void runAction(() => importStudentsMutation.mutateAsync())}
              >
                {importStudentsMutation.isPending ? 'Đang import...' : 'Import học viên'}
              </button>
            </div>
            {invalidImportRows.length ? (
              <div className="notice danger">
                File còn {invalidImportRows.length} dòng lỗi. Sửa các dòng được báo lỗi rồi import lại.
              </div>
            ) : null}
            {importRows.length ? (
              <div className="suni-native-table-wrap">
                <table className="data-table suni-native-table">
                  <thead><tr><th>Dòng</th><th>Họ tên</th><th>Nhóm</th><th>Email</th><th>Đơn vị</th><th>Chức vụ</th><th>Trạng thái</th></tr></thead>
                  <tbody>{importRows.slice(0, 20).map((row) => (
                    <tr key={row.rowNumber}>
                      <td>{row.rowNumber}</td>
                      <td>{row.fullName || '-'}</td>
                      <td>{row.groupName || '-'}</td>
                      <td>{row.email || '-'}</td>
                      <td>{row.department || '-'}</td>
                      <td>{row.position || '-'}</td>
                      <td><Badge tone={row.status === 'error' ? 'danger' : 'success'}>{row.message || 'Hợp lệ'}</Badge></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : null}
          </Card> : null}

          <Card
            title="Danh sách học viên"
            action={(
              <div className="suni-native-row-actions">
                <Badge tone="success">{filteredStudents.length === students.length ? `${students.length} học viên` : `${filteredStudents.length}/${students.length} học viên`}</Badge>
                <button type="button" className="btn btn-ghost btn-small" disabled={!students.length} onClick={() => void downloadClassStudentsWorkbook(students, `danh_sach_hoc_vien_${classId}.xlsx`)}>
                  <Download size={14} /> Excel
                </button>
              </div>
            )}
          >
            <div className="form-grid vsurvey-table-filters">
              <label>
                <span>Nhóm</span>
                <select value={studentGroupFilter} onChange={(event) => setStudentGroupFilter(event.target.value)}>
                  <option value="">Tất cả nhóm</option>
                  {studentGroupOptions.map((group) => <option value={group} key={group}>{group}</option>)}
                </select>
              </label>
              <label>
                <span>Đơn vị</span>
                <select value={studentDepartmentFilter} onChange={(event) => setStudentDepartmentFilter(event.target.value)}>
                  <option value="">Tất cả đơn vị</option>
                  {studentDepartmentOptions.map((department) => <option value={department} key={department}>{department}</option>)}
                </select>
              </label>
              <label>
                <span>Chức vụ</span>
                <select value={studentPositionFilter} onChange={(event) => setStudentPositionFilter(event.target.value)}>
                  <option value="">Tất cả chức vụ</option>
                  {studentPositionOptions.map((position) => <option value={position} key={position}>{position}</option>)}
                </select>
              </label>
              <div className="action-row">
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  disabled={!studentGroupFilter && !studentDepartmentFilter && !studentPositionFilter}
                  onClick={() => {
                    setStudentGroupFilter('');
                    setStudentDepartmentFilter('');
                    setStudentPositionFilter('');
                  }}
                >
                  Xóa lọc
                </button>
              </div>
            </div>
            {canManage && selectedStudentIds.length ? (
              <div className="vdiscussion-bulk-bar">
                <span>Đã chọn {selectedStudentIds.length} học viên</span>
                <div className="suni-native-row-actions">
                  <input className="vtraining-score-input" value={bulkGroupName} onChange={(event) => setBulkGroupName(event.target.value)} placeholder="Nhóm" />
                  <button type="button" className="btn btn-ghost btn-small" disabled={!bulkGroupName.trim() || updateStudentGroupMutation.isPending} onClick={() => void runAction(() => updateStudentGroupMutation.mutateAsync())}>Đổi nhóm</button>
                  <button type="button" className="btn btn-danger btn-small" disabled={deleteStudentsMutation.isPending} onClick={() => void deleteSelectedStudents(selectedStudentIds)}>Xóa khỏi lớp</button>
                </div>
              </div>
            ) : null}
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr>
                  {canManage ? <th><input type="checkbox" checked={filteredStudents.length > 0 && filteredStudents.every((student) => selectedStudentIds.includes(student.id))} onChange={(event) => toggleAllStudents(event.target.checked)} aria-label="Chọn tất cả học viên đang hiển thị" /></th> : null}
                  <th>Họ tên</th><th>Nhóm</th><th>Email</th><th>Mã HV</th><th>Đơn vị</th><th>Chức vụ</th><th>Thao tác</th>
                </tr></thead>
                <tbody>
                  {studentsQuery.isLoading || studentsQuery.isFetching ? <tr><td colSpan={canManage ? 8 : 7}>Đang tải danh sách học viên...</td></tr> : null}
                  {filteredStudents.map((student) => (
                    <tr key={student.id}>
                      {canManage ? <td><input type="checkbox" checked={selectedStudentIds.includes(student.id)} onChange={(event) => toggleStudentSelection(student.id, event.target.checked)} aria-label={`Chọn ${student.fullName}`} /></td> : null}
                      {editingStudentId === student.id ? (
                        <>
                          <td><input value={studentEditForm.fullName} onChange={(event) => setStudentEditField('fullName', event.target.value)} /></td>
                          <td><input value={studentEditForm.groupName} onChange={(event) => setStudentEditField('groupName', event.target.value)} /></td>
                          <td><input type="email" value={studentEditForm.email} onChange={(event) => setStudentEditField('email', event.target.value)} /></td>
                          <td><input value={studentEditForm.studentCode} onChange={(event) => setStudentEditField('studentCode', event.target.value)} /></td>
                          <td><input value={studentEditForm.department} onChange={(event) => setStudentEditField('department', event.target.value)} /></td>
                          <td><input value={studentEditForm.position} onChange={(event) => setStudentEditField('position', event.target.value)} /></td>
                          <td><div className="suni-native-row-actions">
                            <button type="button" className="btn btn-primary btn-small" disabled={updateStudentMutation.isPending} onClick={() => void runAction(() => updateStudentMutation.mutateAsync())}>Lưu</button>
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => { setEditingStudentId(''); setStudentEditForm(EMPTY_SINGLE_STUDENT_FORM); }}>Hủy</button>
                          </div></td>
                        </>
                      ) : (
                        <>
                          <td><strong>{student.fullName}</strong></td>
                          <td>{student.groupName || '-'}</td>
                          <td>{student.email || '-'}</td>
                          <td>{student.studentCode || '-'}</td>
                          <td>{student.department || '-'}</td>
                          <td>{student.position || '-'}</td>
                          <td>{canManage ? <div className="suni-native-row-actions">
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => startEditStudent(student)}>Sửa</button>
                            <button type="button" className="btn btn-danger btn-small" disabled={deleteStudentsMutation.isPending} onClick={() => void deleteSelectedStudents([student.id])}>Xóa</button>
                          </div> : '-'}</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {!(studentsQuery.isLoading || studentsQuery.isFetching) && !students.length ? <tr><td colSpan={canManage ? 8 : 7}>Chưa có học viên trong lớp.</td></tr> : null}
                  {!(studentsQuery.isLoading || studentsQuery.isFetching) && students.length > 0 && !filteredStudents.length ? <tr><td colSpan={canManage ? 8 : 7}>Không có học viên phù hợp bộ lọc.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'agenda' ? (
        <div className="vtraining-detail-stack">
          {canManage && classCourseId ? <ClassAgendaImport courseId={classCourseId} classId={classId} classStartAt={klass.startAt} /> : null}
          {canManage && classCourseId ? (
            <Card title={editingAgenda ? 'Sửa buổi học của lớp' : 'Thêm buổi học cho lớp'}>
              <ClassAgendaForm
                key={editingAgenda?.id || 'new'}
                courseId={classCourseId}
                classId={classId}
                editing={editingAgenda}
                onCancel={() => setEditingAgenda(null)}
              />
            </Card>
          ) : null}
          <Card title="Agenda lớp" action={<Badge tone={agendas.length ? 'success' : 'warning'}>{agendaSessionCount} buổi · {agendas.length} nội dung</Badge>}>
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr><th>Buổi</th><th>Ngày</th><th>Giờ</th><th>Nội dung</th><th>Giảng viên / ghi chú</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {agendas.map((agenda) => (
                    <tr key={agenda.id}>
                      <td>{agenda.sessionNo}</td>
                      <td>{formatDate(agenda.sessionDate)}</td>
                      <td>{formatTime(agenda.startTime)} - {formatTime(agenda.endTime)}</td>
                      <td><strong>{agenda.title}</strong></td>
                      <td>{agenda.description || '-'}</td>
                      <td>{canManage ? <div className="suni-native-row-actions"><button className="btn btn-ghost btn-small" onClick={() => setEditingAgenda(agenda)}>Sửa</button><button className="btn btn-danger btn-small" onClick={() => void runAction(() => deleteAgendaMutation.mutateAsync(agenda.id))}>Xóa</button></div> : '-'}</td>
                    </tr>
                  ))}
                  {!agendas.length ? <tr><td colSpan={6}>Chưa có agenda riêng cho lớp này.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'materials' ? (
        <div className="vtraining-detail-stack">
          {canManage ? <ClassMaterialUpload classId={classId} courseId={klass.courseId} /> : null}
          <Card title="Tài liệu học tập" action={<Badge tone={materials.length ? 'success' : 'warning'}>{materials.length} file</Badge>}>
            <TrainingMaterialList materials={materials} canManage={canManage} classId={classId} />
          </Card>
        </div>
      ) : null}

      {activeTab === 'quiz' ? (
        <ClassQuizLibraryManager classId={classId} courseId={klass.courseId} activities={activities} canManage={canManage} isStudent={isStudent} results={results} focusActivityId={activityId} />
      ) : null}

      {activeTab === 'reflection' ? (
        <ClassReflectionLibraryManager
          classId={classId}
          courseId={klass.courseId}
          activities={activities}
          canManage={canManage}
          isStudent={isStudent}
          studentProfileId={profile?.id || null}
          results={results}
          focusActivityId={activityId}
        />
      ) : null}

      {activeTab === 'game' ? (
        <ClassGameLibraryManager classId={classId} className={klass.name || klass.code || classId} courseId={klass.courseId} activities={activities} students={students} canManage={canManage} isStudent={isStudent} focusActivityId={activityId} />
      ) : null}

      {activeTab === 'results' ? (
        <Suspense fallback={<div className="notice">Đang tải bảng kết quả...</div>}>
          <ClassResultsPanel classId={classId} results={results} canManage={canManage} isStudent={isStudent} isLoading={resultsQuery.isLoading || resultsQuery.isFetching} />
        </Suspense>
      ) : null}

      {activeTab === 'customerContacts' && canManage ? (
        <CustomerContactsPanel
          classId={classId}
          contacts={customerContacts}
          customers={customerProfiles}
          form={customerContactForm}
          isSaving={createCustomerContactMutation.isPending}
          onChange={setCustomerContactField}
          onSubmit={() => void runAction(() => createCustomerContactMutation.mutateAsync())}
        />
      ) : null}

      {activeTab === 'discussion' ? (
        <div className="vtraining-detail-stack">
          {eventId ? <ClassDiscussionRoutePanel classId={classId} eventId={eventId} view={discussionView} /> : null}
          {!eventId ? (
          <>
          {canManage ? <Card title="Import thảo luận từ thư viện" action={<Badge tone={students.length ? 'success' : 'warning'}>{students.length ? 'Sẵn sàng' : 'Cần học viên'}</Badge>}>
            <div className="form-grid">
              <label className="full">
                <span>Thảo luận trong thư viện</span>
                <select value={selectedDiscussionId} onChange={(event) => setSelectedDiscussionId(event.target.value)}>
                  <option value="">Chọn thảo luận</option>
                  {libraryDiscussions.map((event) => <option value={event.id} key={event.id}>{event.title}</option>)}
                </select>
              </label>
            </div>
            <div className="action-row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!selectedDiscussionId || !students.length || importDiscussionMutation.isPending}
                onClick={() => void runAction(() => importDiscussionMutation.mutateAsync())}
              >
                {importDiscussionMutation.isPending ? 'Đang import...' : 'Import vào lớp'}
              </button>
            </div>
          </Card> : null}

          <Card
            title="Thảo luận của lớp"
            action={(
              <div className="suni-native-row-actions">
                <Badge tone="violet">{discussionsQuery.isLoading ? 'Đang tải...' : `${visibleClassDiscussions.length} thảo luận`}</Badge>
                {canManage && selectedClassDiscussionIds.length ? (
                  <Badge tone="warning">Đã chọn {selectedClassDiscussionIds.length}</Badge>
                ) : null}
              </div>
            )}
          >
            {canManage && selectedClassDiscussionIds.length ? (
              <div className="vdiscussion-bulk-bar">
                <span>Đã chọn {selectedClassDiscussionIds.length} thảo luận</span>
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  disabled={deleteClassDiscussionsMutation.isPending}
                  onClick={() => void deleteSelectedClassDiscussions(selectedClassDiscussionIds)}
                >
                  <Trash2 size={14} /> Xóa khỏi lớp
                </button>
              </div>
            ) : null}
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table vtraining-class-discussions-table">
                <thead><tr>
                  {canManage ? (
                    <th>
                      <input
                        type="checkbox"
                        checked={visibleClassDiscussions.length > 0 && selectedClassDiscussionIds.length === visibleClassDiscussions.length}
                        onChange={(event) => toggleAllClassDiscussions(event.target.checked)}
                        aria-label="Chọn tất cả thảo luận"
                      />
                    </th>
                  ) : null}
                  <th>Thảo luận</th><th>Chủ đề</th><th>Học viên</th><th>Nhóm</th><th>Trạng thái</th><th>Thao tác</th>
                </tr></thead>
                <tbody>
                  {visibleClassDiscussions.map((event) => (
                    <tr
                      key={event.id}
                      className={`suni-native-click-row ${isStudent && !isPublishedStatus(event.status) ? 'is-locked' : ''}`}
                      onClick={() => openClassDiscussion(event)}
                    >
                      {canManage ? (
                        <td className="vtraining-class-discussion-check">
                          <input
                            type="checkbox"
                            checked={selectedClassDiscussionIdSet.has(event.id)}
                            onClick={(clickEvent) => clickEvent.stopPropagation()}
                            onChange={(inputEvent) => toggleClassDiscussionSelection(event.id, inputEvent.target.checked)}
                            aria-label={`Chọn ${event.title}`}
                          />
                        </td>
                      ) : null}
                      <td className="vtraining-class-discussion-title" data-label="Thảo luận"><strong>{event.title}</strong></td>
                      <td data-label="Chủ đề">{event.topicCount}</td>
                      <td data-label="Học viên">{event.participantCount}</td>
                      <td data-label="Nhóm">{event.groupCount}</td>
                      <td data-label="Trạng thái"><Badge tone={getClassDiscussionStatusTone(event.status)}>{getClassDiscussionStatusLabel(event.status)}</Badge></td>
                      <td data-label="Thao tác">
                        <div className="suni-native-row-actions">
                          {canManage ? (
                            <>
                              <button
                                type="button"
                                className="btn btn-ghost btn-small"
                                disabled={updateClassDiscussionStatusMutation.isPending}
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  void updateClassDiscussionStatus(event.id, event.status);
                                }}
                              >
                                {event.status === 'active' ? 'Đóng phát hành' : 'Phát hành'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-small"
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  openClassDiscussion(event);
                                }}
                              >
                                Chi tiết
                              </button>
                              <Link
                                className="btn btn-ghost btn-small"
                                to={`/vtraining/classes/${classId}/discussions/${event.id}/monitor`}
                                onClick={(clickEvent) => clickEvent.stopPropagation()}
                              >
                                Theo dõi
                              </Link>
                              <Link
                                className="btn btn-ghost btn-small"
                                to={`/vtraining/classes/${classId}/discussions/${event.id}/results`}
                                onClick={(clickEvent) => clickEvent.stopPropagation()}
                              >
                                Kết quả
                              </Link>
                              <button
                                type="button"
                                className="btn btn-danger btn-small"
                                disabled={deleteClassDiscussionsMutation.isPending}
                                onClick={(clickEvent) => {
                                  clickEvent.stopPropagation();
                                  void deleteSelectedClassDiscussions([event.id]);
                                }}
                              >
                                <Trash2 size={14} /> Xóa
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {discussionsQuery.isLoading ? <tr><td colSpan={canManage ? 7 : 6}>Đang tải thảo luận của lớp...</td></tr> : null}
                  {discussionsQuery.error ? <tr><td colSpan={canManage ? 7 : 6}>{getErrorMessage(discussionsQuery.error)}</td></tr> : null}
                  {!discussionsQuery.isLoading && !discussionsQuery.error && !visibleClassDiscussions.length ? <tr><td colSpan={canManage ? 7 : 6}>Chưa có thảo luận nào được gán vào lớp.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
          </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

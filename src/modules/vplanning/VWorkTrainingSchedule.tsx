import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { CalendarDays, CopyPlus, ExternalLink, FileSpreadsheet, Info, Pencil, Plus, Save, Search, Trash2, Users, X } from 'lucide-react';
import { listElearningDeploymentBundle, type ElearningClass } from '@/lib/elearning';
import { suniTrainingApi, type SuniClassStudent, type SuniTrainingClass, type SuniTrainingResult } from '@/lib/suni';

export type VWorkTrainingScheduleItem = {
  id: string;
  customer: string;
  program: string;
  status: string;
  className: string;
  eLearningStart: string;
  eLearningEnd: string;
  deliveryStart: string;
  deliveryEnd: string;
  workshop: string;
  trainer: string;
  owner: string;
  notes: string;
  year: number;
  sourceFile?: string;
  sourceSheet?: string;
  sourceRow?: number;
  updatedAt?: string;
  updatedBy?: string;
  archivedAt?: string;
};

type Props = {
  records: VWorkTrainingScheduleItem[];
  setRecords: (updater: VWorkTrainingScheduleItem[] | ((rows: VWorkTrainingScheduleItem[]) => VWorkTrainingScheduleItem[])) => void;
  canEdit: boolean;
  currentUser?: { name?: string; email?: string };
};

type ScheduleView = 'year' | 'month' | 'list' | 'trainer';
type ImportPreview = { fileName: string; rows: VWorkTrainingScheduleItem[]; creates: number; updates: number };

const STATUS_OPTIONS = ['Đã chốt', 'Dự kiến', 'Đang triển khai', 'Hoãn', 'Hoàn thành', 'Chưa xác định'];
const MONTH_LABELS = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
const EMPTY_DRAFT: VWorkTrainingScheduleItem = {
  id: '', customer: '', program: '', status: 'Dự kiến', className: '', eLearningStart: '', eLearningEnd: '',
  deliveryStart: '', deliveryEnd: '', workshop: '', trainer: '', owner: '', notes: '', year: new Date().getFullYear(),
};

function normalizeKey(value: unknown) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function scheduleKey(item: Partial<VWorkTrainingScheduleItem>) {
  return [item.year, item.customer, item.program, item.className || 'khong-lop'].map(normalizeKey).filter(Boolean).join('__');
}

function makeScheduleId(item: Partial<VWorkTrainingScheduleItem>) {
  const key = scheduleKey(item) || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return `training-${key}`;
}

function toIsoDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000) {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  if (!text) return '';
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
    return `${year}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

function parseWorkshopDate(value: string) {
  const match = String(value || '').match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : '';
}

function formatDate(value: string) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
}

function formatRange(start: string, end: string) {
  if (!start && !end) return '—';
  if (!end || start === end) return formatDate(start || end);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function rangeIntersectsMonth(start: string, end: string, year: number, monthIndex: number) {
  if (!start && !end) return false;
  const from = new Date(`${start || end}T00:00:00`);
  const to = new Date(`${end || start}T23:59:59`);
  const monthStart = new Date(year, monthIndex, 1);
  const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59);
  return !Number.isNaN(from.getTime()) && from <= monthEnd && to >= monthStart;
}

function dateInRange(dateIso: string, start: string, end: string) {
  if (!dateIso || (!start && !end)) return false;
  return dateIso >= (start || end) && dateIso <= (end || start);
}

function statusClass(status: string) {
  const normalized = normalizeKey(status);
  if (normalized.includes('chot') || normalized.includes('hoan-thanh')) return 'is-confirmed';
  if (normalized.includes('hoan')) return 'is-delayed';
  if (normalized.includes('trien-khai')) return 'is-progress';
  return 'is-planned';
}

function parseWorkbookRows(XLSX: any, workbook: any, fileName: string) {
  const sheetName = workbook.SheetNames.includes('Lịch') ? 'Lịch' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error('Không tìm thấy sheet lịch đào tạo.');
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
  const trainerSheet = workbook.Sheets['Lịch GV'];
  const trainerRows = trainerSheet ? XLSX.utils.sheet_to_json(trainerSheet, { header: 1, defval: '', raw: true }) as unknown[][] : [];

  const read = (sourceRows: unknown[][], withTrainers = false) => {
    const output: VWorkTrainingScheduleItem[] = [];
    let customer = '';
    let program = '';
    let status = '';
    sourceRows.slice(4).forEach((row, offset) => {
      const sourceRow = offset + 5;
      const tt = String(row[0] || '').trim();
      if (String(row[1] || '').trim()) customer = String(row[1]).trim();
      if (String(row[2] || '').trim()) { program = String(row[2]).trim(); status = String(row[3] || '').trim(); }
      else if (String(row[3] || '').trim()) status = String(row[3]).trim();
      const className = String(row[4] || '').trim();
      if (!tt && !className && !String(row[2] || '').trim()) return;
      if (!customer && !program && !className) return;
      const eLearningStart = toIsoDate(row[5]);
      const eLearningEnd = toIsoDate(row[6]);
      const deliveryStart = toIsoDate(row[7]);
      const deliveryEnd = toIsoDate(row[8]);
      const workshop = String(row[9] || '').trim();
      const inferredYear = Number((deliveryStart || eLearningStart || parseWorkshopDate(workshop) || `${new Date().getFullYear()}`).slice(0, 4));
      const trainer = withTrainers
        ? [...new Set(row.slice(10).map((cell) => String(cell || '').trim()).filter((cell) => cell && !['E', 'O', 'D'].includes(cell) && !/^hoàn thiện/i.test(cell)))].join(', ')
        : '';
      const item: VWorkTrainingScheduleItem = {
        ...EMPTY_DRAFT,
        id: '', customer, program, status: status || 'Chưa xác định', className,
        eLearningStart, eLearningEnd, deliveryStart, deliveryEnd, workshop, trainer,
        year: inferredYear || new Date().getFullYear(), sourceFile: fileName, sourceSheet: sheetName, sourceRow,
        updatedAt: new Date().toISOString(),
      };
      item.id = makeScheduleId(item);
      output.push(item);
    });
    return output;
  };

  const canonical = read(rows);
  const trainers = new Map(read(trainerRows, true).map((row) => [scheduleKey(row), row.trainer]));
  return canonical.map((row) => ({ ...row, trainer: trainers.get(scheduleKey(row)) || row.trainer }));
}

function ScheduleEditor({ draft, onChange, onSave, onDuplicate, onArchive, onCancel, isNew }: {
  draft: VWorkTrainingScheduleItem;
  onChange: (patch: Partial<VWorkTrainingScheduleItem>) => void;
  onSave: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  return <section className="vwork-training-editor" aria-label={isNew ? 'Thêm lịch đào tạo' : 'Chỉnh sửa lịch đào tạo'}>
    <div className="vwork-training-editor-head"><div><span>{isNew ? 'LỊCH MỚI' : 'CHỈNH SỬA'}</span><h3>{draft.program || 'Lịch đào tạo'}</h3></div><button type="button" className="btn" onClick={onCancel}>Đóng</button></div>
    <div className="vwork-training-form-grid">
      <label><span>Khách hàng *</span><input value={draft.customer} onChange={(event) => onChange({ customer: event.target.value })} /></label>
      <label className="is-wide"><span>Chương trình *</span><input value={draft.program} onChange={(event) => onChange({ program: event.target.value })} /></label>
      <label><span>Lớp / Phiên</span><input value={draft.className} onChange={(event) => onChange({ className: event.target.value })} /></label>
      <label><span>Tình trạng</span><select value={draft.status} onChange={(event) => onChange({ status: event.target.value })}>{STATUS_OPTIONS.map((status) => <option key={status}>{status}</option>)}</select></label>
      <label><span>E-learning từ ngày</span><input type="date" value={draft.eLearningStart} onChange={(event) => onChange({ eLearningStart: event.target.value })} /></label>
      <label><span>E-learning đến ngày</span><input type="date" value={draft.eLearningEnd} onChange={(event) => onChange({ eLearningEnd: event.target.value })} /></label>
      <label><span>Học trực tiếp/trực tuyến từ</span><input type="date" value={draft.deliveryStart} onChange={(event) => onChange({ deliveryStart: event.target.value })} /></label>
      <label><span>Học trực tiếp/trực tuyến đến</span><input type="date" value={draft.deliveryEnd} onChange={(event) => onChange({ deliveryEnd: event.target.value })} /></label>
      <label><span>Hội thảo</span><input value={draft.workshop} onChange={(event) => onChange({ workshop: event.target.value })} placeholder="Ví dụ: sáng 24/07/2026" /></label>
      <label><span>Giảng viên / phụ trách</span><input value={draft.trainer} onChange={(event) => onChange({ trainer: event.target.value })} /></label>
      <label><span>Owner vận hành</span><input value={draft.owner} onChange={(event) => onChange({ owner: event.target.value })} /></label>
      <label className="is-wide"><span>Ghi chú</span><textarea rows={3} value={draft.notes} onChange={(event) => onChange({ notes: event.target.value })} /></label>
    </div>
    <div className="vwork-training-editor-actions">
      {!isNew && <button type="button" className="btn" onClick={onDuplicate}><CopyPlus size={16} />Nhân bản</button>}
      {!isNew && <button type="button" className="btn btn-danger" onClick={onArchive}><Trash2 size={16} />Lưu trữ</button>}
      <button type="button" className="btn btn-primary" onClick={onSave}><Save size={16} />Lưu lịch</button>
    </div>
  </section>;
}

type ScheduleDetailPhase = 'year' | 'month' | 'elearning' | 'delivery' | 'workshop' | 'list' | 'trainer';
type ScheduleDetailState = { item: VWorkTrainingScheduleItem; phase: ScheduleDetailPhase; label?: string };
type TrainingScheduleInsight = {
  linkedClass: SuniTrainingClass | null;
  students: SuniClassStudent[];
  results: SuniTrainingResult[];
  elearningClass: ElearningClass | null;
};

function schedulePhaseLabel(phase: ScheduleDetailPhase) {
  if (phase === 'elearning') return 'E-learning';
  if (phase === 'delivery') return 'Học trực tiếp / trực tuyến';
  if (phase === 'workshop') return 'Hội thảo';
  if (phase === 'trainer') return 'Lịch giảng viên';
  return 'Lịch đào tạo';
}

function scheduleInfoTitle(item: VWorkTrainingScheduleItem, label?: string) {
  return [
    item.customer,
    item.program,
    item.className ? `Lớp: ${item.className}` : '',
    label || '',
    item.trainer ? `Giảng viên: ${item.trainer}` : '',
  ].filter(Boolean).join('\n');
}

function findLinkedTrainingClass(item: VWorkTrainingScheduleItem, classes: SuniTrainingClass[]) {
  const itemClass = normalizeKey(item.className);
  const itemProgram = normalizeKey(item.program);
  const itemCustomer = normalizeKey(item.customer);
  const scored = classes.map((klass) => {
    const className = normalizeKey(klass.name);
    const classCode = normalizeKey(klass.code);
    const courseTitle = normalizeKey(klass.course?.title || klass.course?.name);
    const customerName = normalizeKey(klass.course?.customerName);
    let score = 0;
    if (itemClass && (className === itemClass || classCode === itemClass)) score += 12;
    if (itemClass && (className.includes(itemClass) || itemClass.includes(className) || classCode.includes(itemClass))) score += 6;
    if (itemProgram && (courseTitle.includes(itemProgram) || itemProgram.includes(courseTitle))) score += 5;
    if (itemCustomer && (customerName.includes(itemCustomer) || itemCustomer.includes(customerName))) score += 3;
    return { klass, score };
  }).filter((entry) => entry.score >= 8);
  return scored.sort((left, right) => right.score - left.score)[0]?.klass || null;
}

function averageFinalScore(results: SuniTrainingResult[]) {
  const scores = results.map((row) => Number(row.finalScore)).filter((score) => Number.isFinite(score));
  if (!scores.length) return null;
  return Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 100) / 100;
}

function formatInsightScore(value: number | null) {
  return value == null ? '—' : String(value).replace('.', ',');
}

function ScheduleDetailPopup({ detail, canEdit, linkedClass, insight, insightLoading, dataError, onEdit, onClose }: {
  detail: ScheduleDetailState;
  canEdit: boolean;
  linkedClass: SuniTrainingClass | null;
  insight: TrainingScheduleInsight | null;
  insightLoading: boolean;
  dataError: string;
  onEdit: (item: VWorkTrainingScheduleItem) => void;
  onClose: () => void;
}) {
  const { item, phase, label } = detail;
  const sourceLabel = [item.sourceFile, item.sourceSheet ? `sheet ${item.sourceSheet}` : '', item.sourceRow ? `dòng ${item.sourceRow}` : ''].filter(Boolean).join(' · ') || 'VWork';
  const resultCount = insight?.results.length || 0;
  const passedCount = insight?.results.filter((row) => row.passed === true).length || 0;
  const averageScore = insight ? averageFinalScore(insight.results) : null;
  const instructorNames = (linkedClass?.instructors || [])
    .map((instructor) => instructor.fullName || instructor.name || instructor.email || '')
    .filter(Boolean)
    .join(', ') || item.trainer || 'Chưa phân công';

  return <div className="vwork-training-detail-backdrop" role="dialog" aria-modal="true" aria-label="Chi tiết lịch đào tạo">
    <section className="vwork-training-detail-card">
      <header>
        <div><span>{schedulePhaseLabel(phase)}</span><h3>{item.program || 'Lịch đào tạo'}</h3><p>{item.customer} · {item.className || 'Không lớp'}</p></div>
        <button type="button" className="vwork-training-icon-btn" aria-label="Đóng chi tiết" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="vwork-training-detail-grid">
        <div><span>Tình trạng</span><strong>{item.status || 'Chưa xác định'}</strong></div>
        <div><span>E-learning</span><strong>{formatRange(item.eLearningStart, item.eLearningEnd)}</strong></div>
        <div><span>Trực tiếp / trực tuyến</span><strong>{formatRange(item.deliveryStart, item.deliveryEnd)}</strong></div>
        <div><span>Hội thảo</span><strong>{item.workshop || '—'}</strong></div>
        <div><span>Giảng viên</span><strong>{instructorNames}</strong></div>
        <div><span>Owner</span><strong>{item.owner || '—'}</strong></div>
      </div>
      {label ? <p className="vwork-training-detail-focus"><Info size={15} />{label}</p> : null}
      {item.notes ? <div className="vwork-training-detail-note"><span>Ghi chú</span><p>{item.notes}</p></div> : null}
      <div className="vwork-training-detail-source">
        <span>Nguồn dữ liệu</span>
        <strong>{sourceLabel}</strong>
        <div>
          {linkedClass ? <a href={`/vtraining/classes/${encodeURIComponent(linkedClass.id)}`} target="_blank" rel="noreferrer"><ExternalLink size={14} />Mở lớp VTraining</a> : null}
          {insight?.elearningClass ? <a href="/vlearning" target="_blank" rel="noreferrer"><ExternalLink size={14} />Mở VLearning</a> : null}
          {!linkedClass ? <small>Chưa tìm thấy lớp VTraining khớp với lịch này.</small> : null}
        </div>
      </div>
      <div className="vwork-training-detail-source">
        <span>Dữ liệu liên kết</span>
        {insightLoading ? <p>Đang tải dữ liệu lớp...</p> : null}
        {!insightLoading && dataError ? <p>{dataError}</p> : null}
        {!insightLoading && linkedClass ? (
          <div className="vwork-training-linked-data">
            <div><span>Lớp VTraining</span><strong>{linkedClass.name || linkedClass.code || linkedClass.id}</strong><small>{linkedClass.status || '—'}</small></div>
            <div><span>Sĩ số</span><strong>{insight?.students.length || linkedClass.currentLearnerCount || 0}</strong><small>học viên</small></div>
            <div><span>Kết quả</span><strong>{resultCount}</strong><small>{passedCount} đạt</small></div>
            <div><span>Điểm TB</span><strong>{formatInsightScore(averageScore)}</strong><small>final score</small></div>
            <div><span>VLearning</span><strong>{insight?.elearningClass ? insight.elearningClass.name : 'Chưa liên kết'}</strong><small>{insight?.elearningClass?.status || '—'}</small></div>
          </div>
        ) : null}
      </div>
      <footer>
        {canEdit ? <button type="button" className="btn" onClick={() => onEdit(item)}><Pencil size={15} />Sửa lịch</button> : null}
        <button type="button" className="btn btn-primary" onClick={onClose}>Đóng</button>
      </footer>
    </section>
  </div>;
}

export function normalizeTrainingSchedules(value: unknown): VWorkTrainingScheduleItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === 'object').map((raw: any, index) => {
    const deliveryStart = toIsoDate(raw.deliveryStart);
    const eLearningStart = toIsoDate(raw.eLearningStart);
    const year = Number(raw.year || (deliveryStart || eLearningStart || '').slice(0, 4)) || new Date().getFullYear();
    const item: VWorkTrainingScheduleItem = {
      ...EMPTY_DRAFT, ...raw, year,
      customer: String(raw.customer || ''), program: String(raw.program || ''), status: String(raw.status || 'Chưa xác định'),
      className: String(raw.className || ''), eLearningStart, eLearningEnd: toIsoDate(raw.eLearningEnd),
      deliveryStart, deliveryEnd: toIsoDate(raw.deliveryEnd), workshop: String(raw.workshop || ''), trainer: String(raw.trainer || ''),
      owner: String(raw.owner || ''), notes: String(raw.notes || ''),
      id: String(raw.id || ''),
    };
    item.id = item.id || makeScheduleId(item) || `training-${index + 1}`;
    return item;
  });
}

export default function VWorkTrainingSchedule({ records, setRecords, canEdit, currentUser }: Props) {
  const now = new Date();
  const availableYears = useMemo(() => [...new Set([now.getFullYear(), ...records.map((item) => item.year).filter(Boolean)])].sort((a, b) => a - b), [records]);
  const [year, setYear] = useState(() => availableYears.includes(2026) ? 2026 : availableYears[0]);
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<ScheduleView>('year');
  const [customer, setCustomer] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [draft, setDraft] = useState<VWorkTrainingScheduleItem | null>(null);
  const [detail, setDetail] = useState<ScheduleDetailState | null>(null);
  const [notice, setNotice] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [trainingClasses, setTrainingClasses] = useState<SuniTrainingClass[]>([]);
  const [trainingDataError, setTrainingDataError] = useState('');
  const [detailInsight, setDetailInsight] = useState<TrainingScheduleInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  const customers = useMemo(() => [...new Set(records.map((item) => item.customer).filter(Boolean))].sort(), [records]);
  const visibleRows = useMemo(() => records.filter((item) => !item.archivedAt && item.year === year && (customer === 'all' || item.customer === customer) && (!keyword.trim() || [item.customer, item.program, item.className, item.status, item.trainer, item.owner].join(' ').toLowerCase().includes(keyword.trim().toLowerCase()))), [records, year, customer, keyword]);
  const monthRows = useMemo(() => visibleRows.filter((item) => rangeIntersectsMonth(item.eLearningStart, item.eLearningEnd, year, month) || rangeIntersectsMonth(item.deliveryStart, item.deliveryEnd, year, month) || parseWorkshopDate(item.workshop).startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)), [visibleRows, year, month]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const canSaveDraft = Boolean(draft?.customer.trim() && draft?.program.trim());
  const confirmedCount = visibleRows.filter((item) => normalizeKey(item.status).includes('chot')).length;
  const trainerCount = new Set(visibleRows.flatMap((item) => item.trainer.split(',').map((name) => name.trim()).filter(Boolean))).size;
  const upcomingCount = visibleRows.filter((item) => (item.deliveryEnd || item.deliveryStart || item.eLearningEnd || item.eLearningStart) >= now.toISOString().slice(0, 10)).length;
  const linkedClassForDetail = detail ? findLinkedTrainingClass(detail.item, trainingClasses) : null;

  useEffect(() => {
    let cancelled = false;
    suniTrainingApi.listClasses()
      .then((rows) => {
        if (!cancelled) setTrainingClasses(rows);
      })
      .catch((error) => {
        if (!cancelled) setTrainingDataError(error instanceof Error ? error.message : 'Không tải được dữ liệu VTraining.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDetailInsight(null);
    setTrainingDataError('');
    if (!detail || !linkedClassForDetail) {
      setInsightLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setInsightLoading(true);
    Promise.all([
      suniTrainingApi.listClassStudents([linkedClassForDetail.id]),
      suniTrainingApi.listClassTrainingResultsFast({ classId: linkedClassForDetail.id, classContext: linkedClassForDetail }),
      listElearningDeploymentBundle(),
    ])
      .then(([students, results, bundle]) => {
        if (cancelled) return;
        const elearningClass = bundle.classes.find((klass) => klass.trainingClassId === linkedClassForDetail.id) || null;
        setDetailInsight({ linkedClass: linkedClassForDetail, students, results, elearningClass });
      })
      .catch((error) => {
        if (!cancelled) setTrainingDataError(error instanceof Error ? error.message : 'Không tải được dữ liệu liên kết.');
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detail, linkedClassForDetail]);

  function openNew() {
    setDraft({ ...EMPTY_DRAFT, id: '', year });
    setDetail(null);
    setNotice('');
  }

  function openEdit(item: VWorkTrainingScheduleItem) {
    setDraft({ ...item });
    setDetail(null);
  }

  function saveDraft(asCopy = false) {
    if (!draft || !canSaveDraft) { setNotice('Vui lòng nhập Khách hàng và Chương trình.'); return; }
    if (draft.eLearningStart && draft.eLearningEnd && draft.eLearningStart > draft.eLearningEnd) { setNotice('Ngày kết thúc E-learning phải sau ngày bắt đầu.'); return; }
    if (draft.deliveryStart && draft.deliveryEnd && draft.deliveryStart > draft.deliveryEnd) { setNotice('Ngày kết thúc học trực tiếp/trực tuyến phải sau ngày bắt đầu.'); return; }
    const nextYear = Number((draft.deliveryStart || draft.eLearningStart || parseWorkshopDate(draft.workshop) || `${draft.year}`).slice(0, 4)) || draft.year;
    const id = asCopy || !draft.id ? `${makeScheduleId({ ...draft, year: nextYear })}-${Date.now().toString(36)}` : draft.id;
    const next = { ...draft, id, year: nextYear, archivedAt: '', updatedAt: new Date().toISOString(), updatedBy: currentUser?.email || currentUser?.name || 'vwork-user' };
    setRecords((rows) => rows.some((item) => item.id === id) ? rows.map((item) => item.id === id ? next : item) : [...rows, next]);
    setYear(nextYear);
    setDraft(null);
    setNotice(asCopy ? 'Đã nhân bản lịch đào tạo.' : 'Đã lưu lịch đào tạo.');
  }

  function archiveDraft() {
    if (!draft?.id || !window.confirm('Lưu trữ lịch này? Dữ liệu vẫn được giữ trong lịch sử VWork.')) return;
    setRecords((rows) => rows.map((item) => item.id === draft.id ? { ...item, archivedAt: new Date().toISOString(), updatedBy: currentUser?.email || currentUser?.name || 'vwork-user' } : item));
    setDraft(null);
    setNotice('Đã lưu trữ lịch đào tạo.');
  }

  async function previewImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      setNotice('Đang đọc file Excel...');
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const rows = parseWorkbookRows(XLSX, workbook, file.name);
      const existingKeys = new Set(records.map(scheduleKey));
      setImportPreview({ fileName: file.name, rows, creates: rows.filter((item) => !existingKeys.has(scheduleKey(item))).length, updates: rows.filter((item) => existingKeys.has(scheduleKey(item))).length });
      setNotice('');
    } catch (error) {
      setImportPreview(null);
      setNotice(error instanceof Error ? error.message : 'Không đọc được file Excel.');
    }
  }

  function applyImport() {
    if (!importPreview) return;
    setRecords((current) => {
      const byKey = new Map(current.map((item) => [scheduleKey(item), item]));
      importPreview.rows.forEach((incoming) => {
        const key = scheduleKey(incoming);
        const existing = byKey.get(key);
        byKey.set(key, existing ? { ...existing, ...incoming, id: existing.id, trainer: incoming.trainer || existing.trainer, owner: existing.owner, notes: existing.notes, updatedAt: new Date().toISOString(), updatedBy: currentUser?.email || currentUser?.name || 'vwork-user' } : incoming);
      });
      return [...byKey.values()];
    });
    setNotice(`Đã cập nhật ${importPreview.updates} lịch và thêm ${importPreview.creates} lịch; không xóa lịch ngoài file.`);
    setImportPreview(null);
  }

  const trainerGroups = useMemo(() => {
    const groups = new Map<string, VWorkTrainingScheduleItem[]>();
    monthRows.forEach((item) => {
      const names = item.trainer.split(',').map((name) => name.trim()).filter(Boolean);
      (names.length ? names : ['Chưa phân công']).forEach((name) => groups.set(name, [...(groups.get(name) || []), item]));
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, 'vi'));
  }, [monthRows]);

  return <div className="vwork-training-page">
    <section className="vwork-training-hero">
      <div><span>V-WORK · KẾ HOẠCH & ĐIỀU HÀNH</span><h1>Lịch đào tạo</h1><p>Một nguồn dữ liệu xuyên suốt năm cho lớp học, E-learning, học trực tiếp/trực tuyến, hội thảo và lịch giảng viên.</p></div>
      {canEdit && <div className="vwork-training-hero-actions"><label className="btn"><FileSpreadsheet size={16} />Import Excel<input type="file" accept=".xlsx,.xls" hidden onChange={previewImport} /></label><button type="button" className="btn btn-primary" onClick={openNew}><Plus size={16} />Thêm lịch</button></div>}
    </section>

    <section className="vwork-training-kpis" aria-label="Tổng hợp lịch đào tạo">
      <article><CalendarDays /><div><strong>{visibleRows.length}</strong><span>Lịch trong năm</span></div></article>
      <article><Save /><div><strong>{confirmedCount}</strong><span>Đã chốt</span></div></article>
      <article><Users /><div><strong>{trainerCount}</strong><span>Giảng viên đã phân công</span></div></article>
      <article><CalendarDays /><div><strong>{upcomingCount}</strong><span>Sắp tới / đang diễn ra</span></div></article>
    </section>

    <section className="vwork-training-toolbar">
      <label><span>Năm</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{availableYears.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>Khách hàng</span><select value={customer} onChange={(event) => setCustomer(event.target.value)}><option value="all">Tất cả</option>{customers.map((item) => <option key={item}>{item}</option>)}</select></label>
      {(view === 'month' || view === 'trainer') && <label><span>Tháng</span><select value={month} onChange={(event) => setMonth(Number(event.target.value))}>{MONTH_LABELS.map((label, index) => <option key={label} value={index}>{label}</option>)}</select></label>}
      <label className="vwork-training-search"><span>Tìm kiếm</span><div><Search size={15} /><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Chương trình, lớp, giảng viên..." /></div></label>
      <div className="vwork-training-view-tabs" aria-label="Chế độ xem">{([['year', 'Năm'], ['month', 'Tháng'], ['list', 'Danh sách'], ['trainer', 'Giảng viên']] as const).map(([key, label]) => <button type="button" key={key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>{label}</button>)}</div>
    </section>

    {notice && <div className="vwork-training-notice" role="status">{notice}</div>}
    {importPreview && <section className="vwork-training-import-preview"><div><strong>{importPreview.fileName}</strong><span>{importPreview.rows.length} dòng hợp lệ · {importPreview.updates} cập nhật · {importPreview.creates} thêm mới</span><small>Import không xóa các lịch không có trong file.</small></div><div><button className="btn" type="button" onClick={() => setImportPreview(null)}>Hủy</button><button className="btn btn-primary" type="button" onClick={applyImport}>Áp dụng</button></div></section>}
    {draft && canEdit && <ScheduleEditor draft={draft} onChange={(patch) => setDraft((current) => current ? { ...current, ...patch } : current)} onSave={() => saveDraft(false)} onDuplicate={() => saveDraft(true)} onArchive={archiveDraft} onCancel={() => setDraft(null)} isNew={!draft.id} />}

    {view === 'year' && <div className="vwork-training-table-wrap"><table className="vwork-training-year-table"><thead><tr><th>Khách hàng / Chương trình</th><th>Lớp</th><th>Tình trạng</th>{MONTH_LABELS.map((label) => <th key={label}>{label.replace('Tháng ', 'T')}</th>)}{canEdit && <th>Sửa</th>}</tr></thead><tbody>{visibleRows.map((item) => <tr key={item.id}><td><button type="button" className="vwork-training-row-info" title={scheduleInfoTitle(item)} onClick={() => setDetail({ item, phase: 'year' })}><strong>{item.customer}</strong><span>{item.program}</span><Info size={14} /></button></td><td>{item.className || '—'}</td><td><span className={`vwork-training-status ${statusClass(item.status)}`}>{item.status}</span></td>{MONTH_LABELS.map((_, index) => { const e = rangeIntersectsMonth(item.eLearningStart, item.eLearningEnd, year, index); const d = rangeIntersectsMonth(item.deliveryStart, item.deliveryEnd, year, index); const w = parseWorkshopDate(item.workshop).startsWith(`${year}-${String(index + 1).padStart(2, '0')}`); const label = [e ? `E-learning: ${formatRange(item.eLearningStart, item.eLearningEnd)}` : '', d ? `Học: ${formatRange(item.deliveryStart, item.deliveryEnd)}` : '', w ? `Hội thảo: ${item.workshop}` : ''].filter(Boolean).join('\n'); return <td key={index} className={`vwork-training-month-cell ${label ? 'is-clickable' : ''}`} title={label} onClick={() => label && setDetail({ item, phase: e ? 'elearning' : d ? 'delivery' : 'workshop', label })}>{e && <i className="is-elearning" />}{d && <i className="is-delivery" />}{w && <i className="is-workshop" />}</td>; })}{canEdit && <td><button type="button" className="vwork-training-icon-btn" aria-label={`Sửa ${item.program}`} onClick={() => openEdit(item)}><Pencil size={15} /></button></td>}</tr>)}</tbody></table></div>}

    {view === 'month' && <div className="vwork-training-table-wrap"><table className="vwork-training-month-table"><thead><tr><th>Chương trình / Lớp</th>{Array.from({ length: daysInMonth }, (_, index) => { const date = new Date(year, month, index + 1); return <th key={index} className={date.getDay() === 0 || date.getDay() === 6 ? 'is-weekend' : ''}>{index + 1}</th>; })}</tr></thead><tbody>{monthRows.map((item) => <tr key={item.id} onDoubleClick={() => canEdit && openEdit(item)}><td><button type="button" className="vwork-training-row-info" title={scheduleInfoTitle(item)} onClick={() => setDetail({ item, phase: 'month' as ScheduleDetailPhase })}><strong>{item.customer} · {item.className || 'Không lớp'}</strong><span>{item.program}</span><Info size={14} /></button></td>{Array.from({ length: daysInMonth }, (_, index) => { const dateIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`; const date = new Date(year, month, index + 1); const e = dateInRange(dateIso, item.eLearningStart, item.eLearningEnd); const d = dateInRange(dateIso, item.deliveryStart, item.deliveryEnd); const w = parseWorkshopDate(item.workshop) === dateIso; const label = [e ? 'E-learning' : '', d ? 'Học trực tiếp/trực tuyến' : '', w ? item.workshop : ''].filter(Boolean).join(' · '); return <td key={dateIso} className={`${date.getDay() === 0 || date.getDay() === 6 ? 'is-weekend ' : ''}${e ? 'has-elearning ' : ''}${d ? 'has-delivery ' : ''}${w ? 'has-workshop ' : ''}${label ? 'is-clickable' : ''}`} title={label} onClick={() => label && setDetail({ item, phase: e ? 'elearning' : d ? 'delivery' : 'workshop', label: `${formatDate(dateIso)} · ${label}` })} />; })}</tr>)}</tbody></table>{!monthRows.length && <div className="vwork-training-empty">Không có lịch phù hợp trong tháng này.</div>}</div>}

    {view === 'list' && <div className="vwork-training-table-wrap"><table className="vwork-training-list-table"><thead><tr><th>KH</th><th>Chương trình</th><th>Lớp</th><th>Tình trạng</th><th>E-learning</th><th>Trực tiếp / Trực tuyến</th><th>Hội thảo</th><th>Giảng viên / phụ trách</th><th>Owner</th>{canEdit && <th>Sửa</th>}</tr></thead><tbody>{visibleRows.map((item) => <tr key={item.id} onClick={() => setDetail({ item, phase: 'list' })}><td><strong>{item.customer}</strong></td><td>{item.program}</td><td>{item.className || '—'}</td><td><span className={`vwork-training-status ${statusClass(item.status)}`}>{item.status}</span></td><td>{formatRange(item.eLearningStart, item.eLearningEnd)}</td><td>{formatRange(item.deliveryStart, item.deliveryEnd)}</td><td>{item.workshop || '—'}</td><td>{item.trainer || 'Chưa phân công'}</td><td>{item.owner || '—'}</td>{canEdit && <td><button type="button" className="vwork-training-icon-btn" aria-label={`Sửa ${item.program}`} onClick={(event) => { event.stopPropagation(); openEdit(item); }}><Pencil size={15} /></button></td>}</tr>)}</tbody></table></div>}

    {view === 'trainer' && <div className="vwork-training-trainer-grid">{trainerGroups.map(([name, items]) => <section key={name}><header><span>{name.slice(0, 2).toUpperCase()}</span><div><strong>{name}</strong><small>{items.length} lịch trong {MONTH_LABELS[month].toLowerCase()}</small></div></header><div>{items.map((item) => <button type="button" key={item.id} title={scheduleInfoTitle(item, `Giảng viên: ${name}`)} onClick={() => setDetail({ item, phase: 'trainer', label: `Giảng viên: ${name}` })}><strong>{item.customer} · {item.className || 'Không lớp'}</strong><span>{item.program}</span><small>{formatRange(item.deliveryStart || item.eLearningStart, item.deliveryEnd || item.eLearningEnd)}</small></button>)}</div></section>)}{!trainerGroups.length && <div className="vwork-training-empty">Không có lịch giảng viên trong tháng này.</div>}</div>}

    {detail ? (
      <ScheduleDetailPopup
        detail={detail}
        canEdit={canEdit}
        linkedClass={linkedClassForDetail}
        insight={detailInsight}
        insightLoading={insightLoading}
        dataError={trainingDataError}
        onEdit={openEdit}
        onClose={() => setDetail(null)}
      />
    ) : null}
    <div className="vwork-training-legend"><span><i className="is-elearning" />E-learning</span><span><i className="is-delivery" />Học trực tiếp/trực tuyến</span><span><i className="is-workshop" />Hội thảo</span><small>Nguồn ban đầu: 2. T7_Lịch đào tạo update full T7.xlsx · 65 dòng</small></div>
  </div>;
}

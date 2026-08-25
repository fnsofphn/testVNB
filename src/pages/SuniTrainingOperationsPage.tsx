import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useToast } from '@/components/system/ToastProvider';
import {
  SuniApiError,
  suniTrainingApi,
  type SuniOperationChecklistItem,
  type SuniOperationChecklistPayload,
  type SuniOperationEvidence,
  type SuniOperationEvidenceUploadPayload,
  type SuniOperationPhase,
  type SuniOperationPriority,
  type SuniOperationTemplateKey,
  type SuniOperationTask,
  type SuniOperationTaskPayload,
  type SuniTrainingClass,
  type SuniUser,
} from '@/lib/suni';
import { queries as trainingQueries } from '@/features/vtraining';
import { ClipboardCheck, Eye, Plus, Trash2, Upload } from 'lucide-react';

type OperationsMode = 'operations' | 'checklist' | 'evidence';
type BadgeTone = 'danger' | 'warning' | 'success' | 'violet' | 'purple' | 'neutral';

const PHASES: SuniOperationPhase[] = ['PRE', 'DURING', 'POST'];
const TASK_STATUSES = ['Chưa bắt đầu', 'Đang làm', 'Chờ xác nhận', 'Hoàn thành', 'Trễ hạn', 'Bỏ qua'];
const EVIDENCE_STATUSES = [
  { value: 'not_required', label: 'Không yêu cầu' },
  { value: 'missing', label: 'Thiếu minh chứng' },
  { value: 'submitted', label: 'Đã nộp' },
  { value: 'approved', label: 'Đã xác nhận' },
  { value: 'rejected', label: 'Cần nộp lại' },
];

const EMPTY_TASK_FORM: SuniOperationTaskPayload = {
  classId: '',
  title: '',
  group: '',
  phase: 'PRE',
  dueAt: '',
  ownerProfileId: null,
  ownerName: '',
  priority: 'MEDIUM',
  status: 'Chưa bắt đầu',
  requiresEvidence: false,
  evidenceStatus: 'not_required',
  evidenceType: '',
  evidenceUrl: '',
  note: '',
  sortOrder: 0,
};

const EMPTY_CHECKLIST_FORM: SuniOperationChecklistPayload = {
  classId: '',
  phase: 'PRE',
  title: '',
  done: false,
  ownerProfileId: null,
  ownerName: '',
  status: 'Chưa bắt đầu',
  priority: 'MEDIUM',
  requiresEvidence: false,
  evidenceStatus: 'not_required',
  evidenceType: '',
  dueAt: '',
  note: '',
  sortOrder: 0,
};

const EMPTY_EVIDENCE_FORM: SuniOperationEvidenceUploadPayload = {
  classId: '',
  taskId: null,
  checklistItemId: null,
  type: '',
  sessionLabel: '',
  title: '',
  fileName: '',
  fileUrl: '',
  status: 'Chờ',
  ownerProfileId: null,
  ownerName: '',
  note: '',
  file: null,
};

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với VTraining.';
}

function statusTone(status?: string | null): BadgeTone {
  const value = String(status || '').trim().toLowerCase();
  if (['ok', 'xong', 'active', 'open', 'completed'].some((token) => value.includes(token))) return 'success';
  if (value.includes('đang')) return 'violet';
  if (value.includes('chờ') || value.includes('sắp') || value.includes('chưa') || value.includes('pending')) return 'warning';
  return 'neutral';
}

function classStatusLabel(status?: string | null) {
  const value = String(status || '').trim().toLowerCase();
  if (['active', 'open'].includes(value)) return 'Đang vận hành';
  if (['completed', 'closed'].includes(value)) return 'Đã hoàn tất';
  if (value === 'archived') return 'Lưu trữ';
  return 'Sắp mở';
}

function phaseTone(phase: string): BadgeTone {
  if (phase === 'PRE') return 'violet';
  if (phase === 'DURING') return 'purple';
  return 'success';
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function fromDateTimeInput(value?: string | null) {
  return value ? new Date(value).toISOString() : null;
}

function getClassCourseLabel(klass: SuniTrainingClass) {
  return klass.course?.title || klass.course?.code || klass.courseId || '-';
}

function getClassManagerName(klass: SuniTrainingClass) {
  return klass.classManager?.fullName || klass.classManager?.name || klass.classManager?.email || '';
}

function userDisplayName(user?: SuniUser | null) {
  return user?.fullName || user?.name || user?.email || '';
}

function isCtvUser(user: SuniUser) {
  const role = String(user.role || '').toLowerCase();
  const haystack = `${role} ${user.title || ''}`.toLowerCase();
  return role === 'ctv' || haystack.includes('ctv') || haystack.includes('cong tac vien') || haystack.includes('cộng tác viên');
}

function evidenceStatusLabel(status?: string | null) {
  return EVIDENCE_STATUSES.find((item) => item.value === status)?.label || status || '-';
}

function evidenceStatusTone(status?: string | null): BadgeTone {
  if (status === 'approved' || status === 'not_required') return 'success';
  if (status === 'submitted') return 'violet';
  if (status === 'missing' || status === 'rejected') return 'warning';
  return 'neutral';
}

function OperationsTabs({ mode, classId }: { mode: OperationsMode; classId?: string }) {
  const suffix = classId ? `?classId=${encodeURIComponent(classId)}` : '';
  return (
    <div className="suni-native-tabs">
      <Link className={mode === 'operations' ? 'is-active' : ''} to={`/vtraining/operations${suffix}`}>Thông tin vận hành</Link>
      <Link className={mode === 'checklist' ? 'is-active' : ''} to={`/vtraining/checklist${suffix}`}>Checklist vận hành</Link>
      <Link className={mode === 'evidence' ? 'is-active' : ''} to={`/vtraining/evidence${suffix}`}>Minh chứng vận hành</Link>
    </div>
  );
}

function DetailRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="suni-resource-info-list">
      {rows.map(([label, value]) => (
        <div className="suni-resource-info-row" key={label}>
          <span>{label}</span>
          <strong>{value || '-'}</strong>
        </div>
      ))}
    </div>
  );
}

function ClassSelector({
  classes,
  selectedClassId,
  onSelect,
}: {
  classes: SuniTrainingClass[];
  selectedClassId: string;
  onSelect: (classId: string) => void;
}) {
  return (
    <div className="suni-native-toolbar suni-native-toolbar-compact">
      <select value={selectedClassId} onChange={(event) => onSelect(event.target.value)}>
        {classes.map((klass) => <option key={klass.id} value={klass.id}>{klass.code || klass.name} - {klass.name || klass.code}</option>)}
      </select>
    </div>
  );
}

function CtvSelect({
  users,
  value,
  ownerName,
  onChange,
}: {
  users: SuniUser[];
  value?: string | null;
  ownerName?: string;
  onChange: (profileId: string | null, ownerName: string) => void;
}) {
  return (
    <select
      value={value || ''}
      onChange={(event) => {
        const profileId = event.target.value || null;
        const user = users.find((item) => item.id === profileId) || null;
        onChange(profileId, userDisplayName(user) || ownerName || '');
      }}
    >
      <option value="">Chưa giao CTV</option>
      {users.map((user) => <option key={user.id} value={user.id}>{userDisplayName(user)}</option>)}
    </select>
  );
}

function ClassDetail({ row, tasks, onClose }: { row: SuniTrainingClass; tasks: SuniOperationTask[]; onClose: () => void }) {
  const doneTasks = tasks.filter((task) => task.status === 'Xong').length;
  return (
    <Card title={`Chi tiết vận hành: ${row.name || row.code}`} action={<button className="btn btn-ghost btn-small" onClick={onClose}>Đóng</button>}>
      <div className="suni-resource-detail-grid">
        <div className="suni-resource-profile-panel">
          <div className="suni-resource-detail-head">
            <strong>{row.code || row.id}: {row.name}</strong>
            <Badge tone={statusTone(row.status)}>{classStatusLabel(row.status)}</Badge>
          </div>
          <DetailRows rows={[
            ['Khóa', getClassCourseLabel(row)],
            ['Thời gian', `${formatDate(row.startAt)} - ${formatDate(row.endAt)}`],
            ['Địa điểm', row.location || '-'],
            ['Sĩ số', `${row.currentLearnerCount ?? 0}/${row.maxLearnerCount ?? '-'}`],
            ['CV VH chính', getClassManagerName(row)],
            ['Ekip', row.opsTeamName || '-'],
            ['Số buổi', row.sessionCount != null ? String(row.sessionCount) : '-'],
            ['Tiến độ task', `${doneTasks}/${tasks.length}`],
            ['Ghi chú', row.description || '-'],
          ]} />
        </div>
        <div className="suni-resource-profile-panel">
          <div className="suni-resource-detail-head"><strong>Task vận hành gắn lớp</strong><Badge tone="neutral">{tasks.length} task</Badge></div>
          <div className="suni-resource-edit-table-wrap">
            <table className="suni-resource-edit-table">
              <thead><tr><th>Việc</th><th>Phase</th><th>Hạn</th><th>TT</th></tr></thead>
              <tbody>
                {tasks.length === 0 ? <tr><td colSpan={4}>Chưa có task vận hành.</td></tr> : null}
                {tasks.map((task) => <tr key={task.id}><td>{task.title}</td><td><Badge tone={phaseTone(task.phase)}>{task.phase}</Badge></td><td>{formatDateTime(task.dueAt)}</td><td><Badge tone={statusTone(task.status)}>{task.status}</Badge></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Card>
  );
}

function EvidenceClassPicker({
  classes,
  loading,
  onSelect,
  mode,
}: {
  classes: SuniTrainingClass[];
  loading: boolean;
  onSelect: (classId: string) => void;
  mode: 'checklist' | 'evidence';
}) {
  const isChecklist = mode === 'checklist';
  return (
    <Card title="Chọn lớp đào tạo" action={<Badge tone={classes.length ? 'success' : 'neutral'}>{classes.length} lớp</Badge>}>
      <div className="suni-native-table-wrap">
        <table className="data-table suni-native-table">
          <thead><tr><th>Mã</th><th>Lớp</th><th>Khóa</th><th>Địa điểm</th><th>Sĩ số</th><th>CV VH</th><th>Buổi</th><th>TT</th><th>Thao tác</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9}>Đang tải danh sách lớp đào tạo...</td></tr> : null}
            {!loading && classes.length === 0 ? <tr><td colSpan={9}>Chưa có lớp đào tạo để xem {isChecklist ? 'checklist vận hành' : 'minh chứng vận hành'}.</td></tr> : null}
            {classes.map((row) => (
              <tr key={row.id}>
                <td><code>{row.code || row.id}</code></td>
                <td>
                  <button className="suni-resource-name-button" type="button" onClick={() => onSelect(row.id)}>
                    <strong>{row.name || row.code || row.id}</strong>
                    <span>{formatDate(row.startAt)} - {formatDate(row.endAt)}</span>
                  </button>
                </td>
                <td>{getClassCourseLabel(row)}</td>
                <td>{row.location || '-'}</td>
                <td>{row.currentLearnerCount ?? 0}/{row.maxLearnerCount ?? '-'}</td>
                <td>{getClassManagerName(row) || '-'}</td>
                <td>{row.sessionCount ?? '-'}</td>
                <td><Badge tone={statusTone(row.status)}>{classStatusLabel(row.status)}</Badge></td>
                <td><button className="btn btn-primary btn-small" type="button" onClick={() => onSelect(row.id)}><Eye size={14} /> {isChecklist ? 'Xem checklist' : 'Xem minh chứng'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TemplateApplyPanel({
  appliedKeys,
  ctvUsers,
  defaultOwnerProfileId,
  onDefaultOwnerChange,
  onApply,
  applying,
}: {
  appliedKeys: Set<string>;
  ctvUsers: SuniUser[];
  defaultOwnerProfileId: string;
  onDefaultOwnerChange: (profileId: string) => void;
  onApply: (templateKey: SuniOperationTemplateKey) => void;
  applying: boolean;
}) {
  const templates = suniTrainingApi.listOperationTemplates();
  return (
    <Card
      title="Áp dụng form mẫu vận hành"
      action={(
        <div className="suni-native-row-actions">
          <span className="suni-operation-muted">CTV mặc định</span>
          <select value={defaultOwnerProfileId} onChange={(event) => onDefaultOwnerChange(event.target.value)}>
            <option value="">Theo vai trò trong mẫu</option>
            {ctvUsers.map((user) => <option key={user.id} value={user.id}>{userDisplayName(user)}</option>)}
          </select>
        </div>
      )}
    >
      <div className="suni-operation-template-grid">
        {templates.map((template) => {
          const isApplied = appliedKeys.has(template.key);
          return (
            <article className={isApplied ? 'suni-operation-template-card is-applied' : 'suni-operation-template-card'} key={template.key}>
              <div>
                <span>{template.key === 'offline' ? 'Offline' : 'Online'}</span>
                <strong>{template.name}</strong>
                <p>{template.description}</p>
              </div>
              <div className="suni-operation-template-meta">
                <Badge tone={isApplied ? 'success' : 'neutral'}>{isApplied ? 'Đã áp dụng' : `${template.tasks.length} việc`}</Badge>
                <button className="btn btn-primary btn-small" type="button" disabled={applying || isApplied} onClick={() => onApply(template.key)}>
                  <ClipboardCheck size={14} /> {isApplied ? 'Đã insert' : 'Insert mẫu'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

function TaskDetail({
  row,
  selectedClass,
  ctvUsers,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  row: SuniOperationTask | null;
  selectedClass: SuniTrainingClass;
  ctvUsers: SuniUser[];
  onClose: () => void;
  onSave: (payload: SuniOperationTaskPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
  deleting: boolean;
}) {
  const [form, setForm] = useState<SuniOperationTaskPayload>(() => row ? {
    id: row.id,
    classId: row.classId,
    courseId: row.courseId,
    title: row.title,
    group: row.group,
    phase: row.phase,
    dueAt: toDateTimeInput(row.dueAt),
    ownerProfileId: row.ownerProfileId || null,
    ownerName: row.ownerName,
    priority: row.priority,
    status: row.status,
    requiresEvidence: row.requiresEvidence,
    evidenceStatus: row.evidenceStatus,
    evidenceType: row.evidenceType || '',
    evidenceUrl: row.evidenceUrl || '',
    note: row.note || '',
    sortOrder: row.sortOrder,
  } : { ...EMPTY_TASK_FORM, classId: selectedClass.id, courseId: selectedClass.courseId || null });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({ ...form, dueAt: fromDateTimeInput(form.dueAt) });
  }

  function setField<K extends keyof SuniOperationTaskPayload>(field: K, value: SuniOperationTaskPayload[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <Card title={row ? `Chi tiết task: ${row.title}` : 'Thêm task vận hành'} action={<button className="btn btn-ghost btn-small" onClick={onClose}>Đóng</button>}>
      <form className="form-grid suni-resource-detail-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="full"><span>Tên việc</span><input value={form.title} onChange={(event) => setField('title', event.target.value)} required /></label>
        <label><span>Nhóm</span><input value={form.group || ''} onChange={(event) => setField('group', event.target.value)} placeholder="Hậu cần / Kỹ thuật..." /></label>
        <label><span>Phase</span><select value={form.phase} onChange={(event) => setField('phase', event.target.value as SuniOperationPhase)}>{PHASES.map((phase) => <option key={phase} value={phase}>{phase}</option>)}</select></label>
        <label><span>Hạn</span><input type="datetime-local" value={form.dueAt || ''} onChange={(event) => setField('dueAt', event.target.value)} /></label>
        <label><span>CTV phụ trách</span><CtvSelect users={ctvUsers} value={form.ownerProfileId} ownerName={form.ownerName || ''} onChange={(profileId, ownerName) => setForm((current) => ({ ...current, ownerProfileId: profileId, ownerName }))} /></label>
        <label><span>Ưu tiên</span><select value={form.priority} onChange={(event) => setField('priority', event.target.value as SuniOperationPriority)}><option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option></select></label>
        <label><span>Trạng thái</span><select value={form.status} onChange={(event) => setField('status', event.target.value)}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="checkbox-row"><input type="checkbox" checked={form.requiresEvidence === true} onChange={(event) => setForm((current) => ({ ...current, requiresEvidence: event.target.checked, evidenceStatus: event.target.checked ? (current.evidenceStatus === 'not_required' ? 'missing' : current.evidenceStatus) : 'not_required' }))} /><span>Bắt buộc minh chứng</span></label>
        <label><span>Loại minh chứng</span><input value={form.evidenceType || ''} onChange={(event) => setField('evidenceType', event.target.value)} placeholder="Điểm danh / Ảnh / Recording..." /></label>
        <label><span>TT minh chứng</span><select value={form.evidenceStatus || 'not_required'} onChange={(event) => setField('evidenceStatus', event.target.value)}>{EVIDENCE_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        <label className="full"><span>Minh chứng / link</span><input value={form.evidenceUrl || ''} onChange={(event) => setField('evidenceUrl', event.target.value)} placeholder="https://drive.google.com/..." /></label>
        <label className="full"><span>Ghi chú tiến độ</span><textarea rows={4} value={form.note || ''} onChange={(event) => setField('note', event.target.value)} /></label>
        <div className="action-row full">
          {row ? <button className="btn btn-danger" type="button" disabled={deleting} onClick={() => void onDelete(row.id)}><Trash2 size={15} /> Xóa</button> : null}
          <button className="btn btn-primary" type="submit" disabled={saving}><Upload size={15} /> {saving ? 'Đang lưu...' : 'Lưu cập nhật'}</button>
        </div>
      </form>
    </Card>
  );
}

function ChecklistDetail({
  item,
  selectedClass,
  ctvUsers,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  item: SuniOperationChecklistItem | null;
  selectedClass: SuniTrainingClass;
  ctvUsers: SuniUser[];
  onClose: () => void;
  onSave: (payload: SuniOperationChecklistPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
  deleting: boolean;
}) {
  const [form, setForm] = useState<SuniOperationChecklistPayload>(() => item ? {
    id: item.id,
    classId: item.classId,
    phase: item.phase,
    title: item.title,
    done: item.done,
    ownerProfileId: item.ownerProfileId || null,
    ownerName: item.ownerName || '',
    status: item.status,
    priority: item.priority,
    requiresEvidence: item.requiresEvidence,
    evidenceStatus: item.evidenceStatus,
    evidenceType: item.evidenceType || '',
    dueAt: toDateTimeInput(item.dueAt),
    note: item.note || '',
    sortOrder: item.sortOrder,
  } : { ...EMPTY_CHECKLIST_FORM, classId: selectedClass.id });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({ ...form, priority: form.priority === 'MEDIUM' ? 'LOW' : form.priority, dueAt: fromDateTimeInput(form.dueAt) });
  }

  function setField<K extends keyof SuniOperationChecklistPayload>(field: K, value: SuniOperationChecklistPayload[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <Card title={item ? `Chi tiết checklist: ${item.phase}` : 'Thêm hạng mục checklist'} action={<button className="btn btn-ghost btn-small" onClick={onClose}>Đóng</button>}>
      <form className="form-grid suni-resource-detail-form" onSubmit={(event) => void handleSubmit(event)}>
        <label><span>Phase</span><select value={form.phase} onChange={(event) => setField('phase', event.target.value as SuniOperationPhase)}>{PHASES.map((phase) => <option key={phase} value={phase}>{phase}</option>)}</select></label>
        <label><span>Thứ tự</span><input type="number" min="0" value={form.sortOrder || 0} onChange={(event) => setField('sortOrder', Number(event.target.value || 0))} /></label>
        <label className="full"><span>Hạng mục</span><input value={form.title} onChange={(event) => setField('title', event.target.value)} required /></label>
        <label><span>CTV phụ trách</span><CtvSelect users={ctvUsers} value={form.ownerProfileId} ownerName={form.ownerName || ''} onChange={(profileId, ownerName) => setForm((current) => ({ ...current, ownerProfileId: profileId, ownerName }))} /></label>
        <label><span>Deadline</span><input type="datetime-local" value={form.dueAt || ''} onChange={(event) => setField('dueAt', event.target.value)} /></label>
        <label><span>Trạng thái</span><select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value, done: event.target.value === 'Hoàn thành' }))}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="checkbox-row"><input type="checkbox" checked={form.requiresEvidence === true} onChange={(event) => setForm((current) => ({ ...current, requiresEvidence: event.target.checked, evidenceStatus: event.target.checked ? (current.evidenceStatus === 'not_required' ? 'missing' : current.evidenceStatus) : 'not_required' }))} /><span>Bắt buộc minh chứng</span></label>
        <label><span>Loại minh chứng</span><input value={form.evidenceType || ''} onChange={(event) => setField('evidenceType', event.target.value)} /></label>
        <label><span>TT minh chứng</span><select value={form.evidenceStatus || 'not_required'} onChange={(event) => setField('evidenceStatus', event.target.value)}>{EVIDENCE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
        <label className="checkbox-row full"><input type="checkbox" checked={form.done === true} onChange={(event) => setForm((current) => ({ ...current, done: event.target.checked, status: event.target.checked ? 'Hoàn thành' : 'Đang làm' }))} /><span>Đã xong</span></label>
        <label className="full"><span>Ghi chú</span><textarea rows={4} value={form.note || ''} onChange={(event) => setField('note', event.target.value)} /></label>
        <div className="action-row full">
          {item ? <button className="btn btn-danger" type="button" disabled={deleting} onClick={() => void onDelete(item.id)}><Trash2 size={15} /> Xóa</button> : null}
          <button className="btn btn-primary" type="submit" disabled={saving}><Upload size={15} /> {saving ? 'Đang lưu...' : 'Lưu checklist'}</button>
        </div>
      </form>
    </Card>
  );
}

function EvidenceDetail({
  row,
  initialPayload,
  selectedClass,
  tasks,
  checklist,
  ctvUsers,
  onClose,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  row: SuniOperationEvidence | null;
  initialPayload?: SuniOperationEvidenceUploadPayload | null;
  selectedClass: SuniTrainingClass;
  tasks: SuniOperationTask[];
  checklist: SuniOperationChecklistItem[];
  ctvUsers: SuniUser[];
  onClose: () => void;
  onSave: (payload: SuniOperationEvidenceUploadPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  saving: boolean;
  deleting: boolean;
}) {
  const [form, setForm] = useState<SuniOperationEvidenceUploadPayload>(() => row ? {
    id: row.id,
    classId: row.classId,
    taskId: row.taskId || null,
    checklistItemId: row.checklistItemId || null,
    type: row.type,
    sessionLabel: row.sessionLabel,
    title: row.title,
    fileName: row.fileName || '',
    fileUrl: row.fileUrl || '',
    storageBucket: row.storageBucket || null,
    storagePath: row.storagePath || null,
    status: row.status,
    ownerProfileId: row.ownerProfileId || null,
    ownerName: row.ownerName,
    note: row.note || '',
    file: null,
  } : { ...EMPTY_EVIDENCE_FORM, ...(initialPayload || {}), classId: selectedClass.id });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave(form);
  }

  function setField<K extends keyof SuniOperationEvidenceUploadPayload>(field: K, value: SuniOperationEvidenceUploadPayload[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setForm((current) => ({ ...current, file, fileName: file?.name || current.fileName || '' }));
  }

  function selectTask(taskId: string) {
    const task = tasks.find((item) => item.id === taskId) || null;
    const checklistItem = checklist.find((item) => item.taskId === taskId) || null;
    setForm((current) => ({
      ...current,
      taskId: task?.id || null,
      checklistItemId: checklistItem?.id || null,
      type: current.type || task?.evidenceType || '',
      title: current.title || task?.title || '',
      ownerProfileId: current.ownerProfileId || task?.ownerProfileId || null,
      ownerName: current.ownerName || task?.ownerName || '',
    }));
  }

  function selectChecklistItem(checklistItemId: string) {
    const checklistItem = checklist.find((item) => item.id === checklistItemId) || null;
    const task = checklistItem?.taskId ? tasks.find((item) => item.id === checklistItem.taskId) || null : null;
    setForm((current) => ({
      ...current,
      checklistItemId: checklistItem?.id || null,
      taskId: task?.id || checklistItem?.taskId || current.taskId || null,
      type: checklistItem?.evidenceType || current.type || task?.evidenceType || '',
      title: checklistItem?.title || current.title || task?.title || '',
      ownerProfileId: checklistItem?.ownerProfileId || current.ownerProfileId || task?.ownerProfileId || null,
      ownerName: checklistItem?.ownerName || current.ownerName || task?.ownerName || '',
      note: current.note || checklistItem?.note || '',
    }));
  }

  return (
    <Card title={row ? `Chi tiết minh chứng: ${row.type}` : 'Thêm minh chứng vận hành'} action={<button className="btn btn-ghost btn-small" onClick={onClose}>Đóng</button>}>
      <form className="form-grid suni-resource-detail-form" onSubmit={(event) => void handleSubmit(event)}>
        <label className="full"><span>Gắn với công việc</span><select value={form.taskId || ''} onChange={(event) => selectTask(event.target.value)}><option value="">Minh chứng chung của lớp</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
        <label className="full"><span>Gắn với checklist</span><select value={form.checklistItemId || ''} onChange={(event) => selectChecklistItem(event.target.value)}><option value="">Chọn checklist cần minh chứng</option>{checklist.filter((item) => item.requiresEvidence).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
        <label><span>Loại minh chứng</span><input value={form.type} onChange={(event) => setField('type', event.target.value)} placeholder="Điểm danh / Ảnh / Feedback..." required /></label>
        <label><span>Ngày/Buổi</span><input value={form.sessionLabel || ''} onChange={(event) => setField('sessionLabel', event.target.value)} placeholder="N1 / Buổi 06..." /></label>
        <label className="full"><span>Tiêu đề</span><input value={form.title || ''} onChange={(event) => setField('title', event.target.value)} /></label>
        <label><span>File upload</span><input type="file" onChange={handleFileChange} /></label>
        <label><span>URL / Drive</span><input value={form.fileUrl || ''} onChange={(event) => setField('fileUrl', event.target.value)} placeholder="https://drive.google.com/..." /></label>
        <label><span>Trạng thái</span><select value={form.status} onChange={(event) => setField('status', event.target.value)}><option>Chờ</option><option>OK</option><option>Cần nộp lại</option></select></label>
        <label><span>CTV phụ trách</span><CtvSelect users={ctvUsers} value={form.ownerProfileId} ownerName={form.ownerName || ''} onChange={(profileId, ownerName) => setForm((current) => ({ ...current, ownerProfileId: profileId, ownerName }))} /></label>
        <label className="full"><span>Ghi chú</span><textarea rows={3} value={form.note || ''} onChange={(event) => setField('note', event.target.value)} /></label>
        <div className="action-row full">
          {row ? <button className="btn btn-danger" type="button" disabled={deleting} onClick={() => void onDelete(row.id)}><Trash2 size={15} /> Xóa</button> : null}
          <button className="btn btn-primary" type="submit" disabled={saving}><Upload size={15} /> {saving ? 'Đang lưu...' : 'Upload / Cập nhật'}</button>
        </div>
      </form>
    </Card>
  );
}

export function SuniTrainingOperationsPage({ mode }: { mode: OperationsMode }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const classIdParam = searchParams.get('classId') || '';
  const [selectedClassId, setSelectedClassId] = useState(classIdParam);
  const [showClassDetail, setShowClassDetail] = useState(true);
  const [editingTaskId, setEditingTaskId] = useState('');
  const [editingChecklistId, setEditingChecklistId] = useState('');
  const [editingEvidenceId, setEditingEvidenceId] = useState('');
  const [evidenceDraft, setEvidenceDraft] = useState<SuniOperationEvidenceUploadPayload | null>(null);
  const [defaultOwnerProfileId, setDefaultOwnerProfileId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const classesQuery = useQuery({ queryKey: trainingQueries.classes(), queryFn: () => suniTrainingApi.listClasses() });
  const usersQuery = useQuery({ queryKey: trainingQueries.operationUsers(), queryFn: () => suniTrainingApi.listUsers() });
  const classes = classesQuery.data || [];
  const ctvUsers = useMemo(() => (usersQuery.data || []).filter(isCtvUser), [usersQuery.data]);
  const requiresExplicitClassSelection = mode === 'checklist' || mode === 'evidence';
  const effectiveClassId = requiresExplicitClassSelection ? selectedClassId : selectedClassId || classes[0]?.id || '';
  const selectedClass = useMemo(() => classes.find((item) => item.id === effectiveClassId) || null, [classes, effectiveClassId]);

  useEffect(() => {
    if (classIdParam) setSelectedClassId(classIdParam);
  }, [classIdParam]);

  const tasksQuery = useQuery({
    queryKey: trainingQueries.operationTasks(effectiveClassId),
    queryFn: () => suniTrainingApi.listOperationTasks(effectiveClassId),
    enabled: Boolean(effectiveClassId),
  });
  const checklistQuery = useQuery({
    queryKey: trainingQueries.operationChecklist(effectiveClassId),
    queryFn: () => suniTrainingApi.listOperationChecklist(effectiveClassId),
    enabled: Boolean(effectiveClassId),
  });
  const evidenceQuery = useQuery({
    queryKey: trainingQueries.operationEvidence(effectiveClassId),
    queryFn: () => suniTrainingApi.listOperationEvidence(effectiveClassId),
    enabled: Boolean(effectiveClassId),
  });

  const tasks = tasksQuery.data || [];
  const checklist = checklistQuery.data || [];
  const evidence = evidenceQuery.data || [];
  const appliedTemplateKeys = useMemo(() => new Set(checklist.map((item) => String(item.templateKey || '')).filter(Boolean)), [checklist]);
  const selectedTask = editingTaskId === '__new__' ? null : tasks.find((item) => item.id === editingTaskId) || null;
  const selectedChecklist = editingChecklistId === '__new__' ? null : checklist.find((item) => item.id === editingChecklistId) || null;
  const selectedEvidence = editingEvidenceId === '__new__' ? null : evidence.find((item) => item.id === editingEvidenceId) || null;
  const evidenceByChecklistId = useMemo(() => {
    const map = new Map<string, SuniOperationEvidence>();
    evidence.forEach((item) => {
      if (!item.checklistItemId || map.has(item.checklistItemId)) return;
      map.set(item.checklistItemId, item);
    });
    return map;
  }, [evidence]);
  const title = mode === 'operations' ? 'Thông tin vận hành' : mode === 'checklist' ? 'Checklist vận hành' : 'Minh chứng vận hành';

  const invalidateOperation = async () => {
    await queryClient.invalidateQueries({ queryKey: trainingQueries.operationRoot() });
  };

  const taskMutation = useMutation({
    mutationFn: (payload: SuniOperationTaskPayload) => suniTrainingApi.saveOperationTask(payload),
    onSuccess: async () => {
      await invalidateOperation();
      setEditingTaskId('');
      pushToast({ title: 'Đã lưu task vận hành', tone: 'success' });
    },
  });
  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => suniTrainingApi.deleteOperationTask(id),
    onSuccess: async () => {
      await invalidateOperation();
      setEditingTaskId('');
      pushToast({ title: 'Đã xóa task vận hành', tone: 'success' });
    },
  });
  const checklistMutation = useMutation({
    mutationFn: (payload: SuniOperationChecklistPayload) => suniTrainingApi.saveOperationChecklistItem(payload),
    onSuccess: async () => {
      await invalidateOperation();
      setEditingChecklistId('');
      pushToast({ title: 'Đã lưu checklist', tone: 'success' });
    },
  });
  const seedChecklistMutation = useMutation({
    mutationFn: (classId: string) => suniTrainingApi.seedOperationChecklist(classId),
    onSuccess: async () => {
      await invalidateOperation();
      pushToast({ title: 'Đã tạo checklist mẫu', tone: 'success' });
    },
  });
  const applyTemplateMutation = useMutation({
    mutationFn: (templateKey: SuniOperationTemplateKey) => {
      const user = ctvUsers.find((item) => item.id === defaultOwnerProfileId) || null;
      return suniTrainingApi.applyOperationTemplate({
        classId: effectiveClassId,
        templateKey,
        ownerProfileId: user?.id || null,
        ownerName: userDisplayName(user),
      });
    },
    onSuccess: async () => {
      await invalidateOperation();
      pushToast({ title: 'Đã insert form mẫu vận hành cho lớp', tone: 'success' });
    },
  });
  const deleteChecklistMutation = useMutation({
    mutationFn: (id: string) => suniTrainingApi.deleteOperationChecklistItem(id),
    onSuccess: async () => {
      await invalidateOperation();
      setEditingChecklistId('');
      pushToast({ title: 'Đã xóa hạng mục checklist', tone: 'success' });
    },
  });
  const evidenceMutation = useMutation({
    mutationFn: (payload: SuniOperationEvidenceUploadPayload) => suniTrainingApi.saveOperationEvidence(payload),
    onSuccess: async () => {
      await invalidateOperation();
      setEditingEvidenceId('');
      setEvidenceDraft(null);
      pushToast({ title: 'Đã lưu minh chứng', tone: 'success' });
    },
  });
  const deleteEvidenceMutation = useMutation({
    mutationFn: (id: string) => suniTrainingApi.deleteOperationEvidence(id),
    onSuccess: async () => {
      await invalidateOperation();
      setEditingEvidenceId('');
      setEvidenceDraft(null);
      pushToast({ title: 'Đã xóa minh chứng', tone: 'success' });
    },
  });

  async function runAction(action: () => Promise<unknown>) {
    setErrorMessage('');
    try {
      await action();
    } catch (error) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      pushToast({ title: 'Không lưu được dữ liệu', message, tone: 'danger' });
    }
  }

  const loading = classesQuery.isLoading || tasksQuery.isLoading || checklistQuery.isLoading || evidenceQuery.isLoading;
  const queryError = classesQuery.error || tasksQuery.error || checklistQuery.error || evidenceQuery.error;
  const doneTaskCount = tasks.filter((item) => item.status === 'Hoàn thành' || item.status === 'Xong').length;
  const doneChecklistCount = checklist.filter((item) => item.done || item.status === 'Hoàn thành').length;
  const missingEvidenceCount = checklist.filter((item) => item.requiresEvidence && !['submitted', 'approved'].includes(item.evidenceStatus)).length;
  const needsClassSelection = requiresExplicitClassSelection && !selectedClass;

  function selectClassForOperationsDetail(classId: string) {
    setSelectedClassId(classId);
    setShowClassDetail(true);
    setEditingTaskId('');
    setEditingChecklistId('');
    setEditingEvidenceId('');
    setEvidenceDraft(null);
    setSearchParams({ classId });
  }

  function openEvidenceForChecklist(item: SuniOperationChecklistItem) {
    const existingEvidence = evidenceByChecklistId.get(item.id);
    if (existingEvidence) {
      setEvidenceDraft(null);
      setEditingEvidenceId(existingEvidence.id);
      return;
    }
    const task = item.taskId ? tasks.find((row) => row.id === item.taskId) || null : null;
    setEvidenceDraft({
      ...EMPTY_EVIDENCE_FORM,
      classId: item.classId,
      taskId: item.taskId || null,
      checklistItemId: item.id,
      type: item.evidenceType || task?.evidenceType || 'Minh chứng vận hành',
      sessionLabel: item.phase,
      title: item.title,
      status: 'Chờ',
      ownerProfileId: item.ownerProfileId || task?.ownerProfileId || null,
      ownerName: item.ownerName || task?.ownerName || '',
      note: item.note || '',
    });
    setEditingEvidenceId('__new__');
  }

  return (
    <>
      <SectionHeader
        eye="VTraining"
        title={title}
        subtitle="Dữ liệu vận hành lưu trực tiếp vào Supabase, giữ pattern click-to-detail như màn GV và CTV."
        actions={<OperationsTabs mode={mode} classId={effectiveClassId} />}
      />

      {queryError ? <div className="notice danger">{getErrorMessage(queryError)}</div> : null}
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      {classes.length && !needsClassSelection ? <ClassSelector classes={classes} selectedClassId={effectiveClassId} onSelect={(classId) => {
        if (requiresExplicitClassSelection) {
          selectClassForOperationsDetail(classId);
          return;
        }
        setSelectedClassId(classId);
        setShowClassDetail(true);
        setEditingTaskId('');
        setEditingChecklistId('');
        setEditingEvidenceId('');
        setEvidenceDraft(null);
      }} /> : null}

      {!needsClassSelection ? <div className="vuni-stat-grid">
        <div className="vuni-stat is-blue"><small>Lớp vận hành</small><strong>{classes.length}</strong></div>
        <div className="vuni-stat is-green"><small>Task xong</small><strong>{doneTaskCount}</strong></div>
        <div className="vuni-stat is-amber"><small>Cần xử lý</small><strong>{tasks.length - doneTaskCount + checklist.length - doneChecklistCount + evidence.filter((item) => item.status !== 'OK').length}</strong></div>
        <div className="vuni-stat is-violet"><small>Thiếu minh chứng</small><strong>{missingEvidenceCount}</strong></div>
      </div> : null}

      {!loading && !classes.length ? <div className="notice warning">Chưa có lớp đào tạo để gắn dữ liệu vận hành. Hãy tạo lớp ở màn Lớp đào tạo trước.</div> : null}
      {needsClassSelection ? <EvidenceClassPicker classes={classes} loading={classesQuery.isLoading} onSelect={selectClassForOperationsDetail} mode={mode === 'checklist' ? 'checklist' : 'evidence'} /> : null}

      {mode === 'operations' && selectedClass ? (
        <>
          {showClassDetail ? <ClassDetail row={selectedClass} tasks={tasks} onClose={() => setShowClassDetail(false)} /> : null}
          {editingTaskId ? <TaskDetail key={editingTaskId} row={selectedTask} selectedClass={selectedClass} ctvUsers={ctvUsers} saving={taskMutation.isPending} deleting={deleteTaskMutation.isPending} onClose={() => setEditingTaskId('')} onSave={(payload) => runAction(() => taskMutation.mutateAsync(payload))} onDelete={(id) => runAction(() => deleteTaskMutation.mutateAsync(id))} /> : null}
          <Card title="Thông tin vận hành theo lớp" action={<button className="btn btn-primary btn-small" type="button" onClick={() => setEditingTaskId('__new__')}><Plus size={14} /> Thêm task</button>}>
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr><th>Mã</th><th>Lớp</th><th>Khóa</th><th>Địa điểm</th><th>Sĩ số</th><th>CV VH</th><th>Ekip</th><th>Buổi</th><th>TT</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {classes.map((row) => <tr key={row.id}><td><code>{row.code || row.id}</code></td><td><button className="suni-resource-name-button" type="button" onClick={() => { setSelectedClassId(row.id); setShowClassDetail(true); }}><strong>{row.name}</strong><span>{formatDate(row.startAt)} - {formatDate(row.endAt)}</span></button></td><td>{getClassCourseLabel(row)}</td><td>{row.location || '-'}</td><td>{row.currentLearnerCount ?? 0}/{row.maxLearnerCount ?? '-'}</td><td>{getClassManagerName(row) || '-'}</td><td>{row.opsTeamName || '-'}</td><td>{row.sessionCount ?? '-'}</td><td><Badge tone={statusTone(row.status)}>{classStatusLabel(row.status)}</Badge></td><td><button className="btn btn-ghost btn-small" onClick={() => { setSelectedClassId(row.id); setShowClassDetail(true); }}><Eye size={14} /> Chi tiết</button></td></tr>)}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title="Giao việc vận hành">
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr><th>ID</th><th>Việc</th><th>Nhóm</th><th>Phase</th><th>Hạn</th><th>NV</th><th>ƯT</th><th>TT</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={9}>Đang tải dữ liệu vận hành...</td></tr> : null}
                  {!loading && tasks.length === 0 ? <tr><td colSpan={9}>Chưa có task vận hành cho lớp này.</td></tr> : null}
                  {tasks.map((row) => <tr key={row.id}><td><code>{row.id.slice(0, 8)}</code></td><td><button className="suni-resource-name-button" type="button" onClick={() => setEditingTaskId(row.id)}><strong>{row.title}</strong><span>{row.evidenceUrl || row.note || '-'}</span></button></td><td>{row.group || '-'}</td><td><Badge tone={phaseTone(row.phase)}>{row.phase}</Badge></td><td>{formatDateTime(row.dueAt)}</td><td>{row.ownerName || '-'}</td><td><Badge tone={row.priority === 'HIGH' ? 'warning' : 'neutral'}>{row.priority}</Badge></td><td><Badge tone={statusTone(row.status)}>{row.status}</Badge></td><td><button className="btn btn-ghost btn-small" onClick={() => setEditingTaskId(row.id)}><Eye size={14} /> Chi tiết</button></td></tr>)}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {mode === 'checklist' && selectedClass ? (
        <>
          <TemplateApplyPanel appliedKeys={appliedTemplateKeys} ctvUsers={ctvUsers} defaultOwnerProfileId={defaultOwnerProfileId} onDefaultOwnerChange={setDefaultOwnerProfileId} applying={applyTemplateMutation.isPending} onApply={(templateKey) => void runAction(() => applyTemplateMutation.mutateAsync(templateKey))} />
          {editingChecklistId ? <ChecklistDetail key={editingChecklistId} item={selectedChecklist} selectedClass={selectedClass} ctvUsers={ctvUsers} saving={checklistMutation.isPending} deleting={deleteChecklistMutation.isPending} onClose={() => setEditingChecklistId('')} onSave={(payload) => runAction(() => checklistMutation.mutateAsync(payload))} onDelete={(id) => runAction(() => deleteChecklistMutation.mutateAsync(id))} /> : null}
          <Card title="Checklist vận hành theo lớp" action={<div className="suni-native-row-actions"><button className="btn btn-ghost btn-small" disabled={seedChecklistMutation.isPending || checklist.length > 0} onClick={() => void runAction(() => seedChecklistMutation.mutateAsync(effectiveClassId))}>Tạo mẫu nhanh</button><button className="btn btn-primary btn-small" type="button" onClick={() => setEditingChecklistId('__new__')}><Plus size={14} /> Thêm hạng mục</button></div>}>
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr><th>Phase</th><th>Hạng mục</th><th>Hạn</th><th>TT</th><th>Minh chứng</th><th>CTV</th><th>Ghi chú</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={8}>Đang tải checklist...</td></tr> : null}
                  {!loading && checklist.length === 0 ? <tr><td colSpan={8}>Chưa có checklist cho lớp này. Hãy insert mẫu trực tiếp hoặc trực tuyến.</td></tr> : null}
                  {checklist.map((item) => <tr key={item.id}><td><Badge tone={phaseTone(item.phase)}>{item.phase}</Badge></td><td><button className="suni-resource-name-button" type="button" onClick={() => setEditingChecklistId(item.id)}><strong>{item.title}</strong><span>{item.templateKey ? `${item.templateKey} · ${item.evidenceType || 'Checklist'}` : item.sortOrder ? `Thứ tự ${item.sortOrder}` : 'Tùy chỉnh'}</span></button></td><td>{formatDateTime(item.dueAt)}</td><td><button className="btn btn-ghost btn-small" disabled={checklistMutation.isPending} onClick={() => void runAction(() => checklistMutation.mutateAsync({ id: item.id, classId: item.classId, taskId: item.taskId, templateKey: item.templateKey, templateItemKey: item.templateItemKey, phase: item.phase, title: item.title, done: !item.done, ownerProfileId: item.ownerProfileId, ownerName: item.ownerName, status: !item.done ? 'Hoàn thành' : 'Đang làm', priority: item.priority, requiresEvidence: item.requiresEvidence, evidenceStatus: item.evidenceStatus, evidenceType: item.evidenceType, dueAt: item.dueAt, note: item.note || '', sortOrder: item.sortOrder }))}>{item.done ? 'Đã xong' : item.status}</button></td><td><Badge tone={evidenceStatusTone(item.evidenceStatus)}>{evidenceStatusLabel(item.evidenceStatus)}</Badge></td><td>{item.ownerName || '-'}</td><td>{item.note || '-'}</td><td><button className="btn btn-ghost btn-small" onClick={() => setEditingChecklistId(item.id)}><Eye size={14} /> Chi tiết</button></td></tr>)}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {mode === 'evidence' && selectedClass ? (
        <>
          {editingEvidenceId ? <EvidenceDetail key={`${editingEvidenceId}-${evidenceDraft?.checklistItemId || 'general'}`} row={selectedEvidence} initialPayload={evidenceDraft} selectedClass={selectedClass} tasks={tasks} checklist={checklist} ctvUsers={ctvUsers} saving={evidenceMutation.isPending} deleting={deleteEvidenceMutation.isPending} onClose={() => { setEditingEvidenceId(''); setEvidenceDraft(null); }} onSave={(payload) => runAction(() => evidenceMutation.mutateAsync(payload))} onDelete={(id) => runAction(() => deleteEvidenceMutation.mutateAsync(id))} /> : null}
          <Card title="Checklist vận hành & minh chứng theo đầu việc" action={<button className="btn btn-primary btn-small" type="button" onClick={() => { setEvidenceDraft(null); setEditingEvidenceId('__new__'); }}><Upload size={14} /> Upload chung</button>}>
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr><th>Phase</th><th>Đầu việc checklist</th><th>CTV</th><th>Hạn</th><th>Trạng thái việc</th><th>Minh chứng</th><th>File / Link</th><th>Thao tác</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={8}>Đang tải checklist và minh chứng...</td></tr> : null}
                  {!loading && checklist.length === 0 ? <tr><td colSpan={8}>Chưa có checklist vận hành cho lớp này. Hãy tạo hoặc insert mẫu checklist trước.</td></tr> : null}
                  {checklist.map((item) => {
                    const row = evidenceByChecklistId.get(item.id) || null;
                    return (
                      <tr key={item.id}>
                        <td><Badge tone={phaseTone(item.phase)}>{item.phase}</Badge></td>
                        <td><button className="suni-resource-name-button" type="button" onClick={() => openEvidenceForChecklist(item)}><strong>{item.title}</strong><span>{item.evidenceType || item.templateKey || `Thứ tự ${item.sortOrder || '-'}`}</span></button></td>
                        <td>{item.ownerName || '-'}</td>
                        <td>{formatDateTime(item.dueAt)}</td>
                        <td><Badge tone={statusTone(item.status)}>{item.done ? 'Đã xong' : item.status}</Badge></td>
                        <td><button className="btn btn-ghost btn-small" type="button" onClick={() => openEvidenceForChecklist(item)}><Upload size={14} /> {row ? 'Xem / cập nhật' : 'Minh chứng'}</button></td>
                        <td>{row?.fileUrl ? <a href={row.fileUrl} target="_blank" rel="noreferrer">{row.fileName || row.title || 'Mở file'}</a> : <Badge tone={evidenceStatusTone(item.evidenceStatus)}>{evidenceStatusLabel(item.evidenceStatus)}</Badge>}</td>
                        <td><button className="btn btn-ghost btn-small" type="button" onClick={() => openEvidenceForChecklist(item)}><Eye size={14} /> Chi tiết</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}

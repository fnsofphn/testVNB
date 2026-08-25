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
  type SuniTrainingClass,
  type SuniUser,
} from '@/lib/suni';
import { queries as trainingQueries } from '@/features/vtraining';
import { CheckCircle2, ClipboardCheck, Eye, Pencil, Plus, Trash2, X } from 'lucide-react';

type BadgeTone = 'danger' | 'warning' | 'success' | 'violet' | 'purple' | 'neutral';

const TASK_STATUSES = ['Chưa bắt đầu', 'Đang làm', 'Chờ xác nhận', 'Hoàn thành', 'Trễ hạn', 'Bỏ qua'];
const EVIDENCE_STATUSES = [
  { value: 'not_required', label: 'Không yêu cầu' },
  { value: 'missing', label: 'Thiếu minh chứng' },
  { value: 'submitted', label: 'Đã nộp' },
  { value: 'approved', label: 'Đã xác nhận' },
  { value: 'rejected', label: 'Cần nộp lại' },
];

const EMPTY_CHECKLIST_FORM: SuniOperationChecklistPayload = {
  classId: '',
  phase: 'DURING',
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

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với VTraining.';
}

function statusTone(status?: string | null): BadgeTone {
  const value = String(status || '').trim().toLowerCase();
  if (value.includes('hoàn') || value.includes('xong') || value.includes('active') || value.includes('ok')) return 'success';
  if (value.includes('đang')) return 'violet';
  if (value.includes('chờ') || value.includes('chưa') || value.includes('thiếu') || value.includes('trễ')) return 'warning';
  return 'neutral';
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

function classStatusLabel(status?: string | null) {
  const value = String(status || '').trim().toLowerCase();
  if (['active', 'open'].includes(value)) return 'Đang vận hành';
  if (['completed', 'closed'].includes(value)) return 'Đã hoàn tất';
  if (value === 'archived') return 'Lưu trữ';
  return 'Sắp mở';
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
      <option value="">Theo vai trò trong mẫu</option>
      {users.map((user) => <option key={user.id} value={user.id}>{userDisplayName(user)}</option>)}
    </select>
  );
}

function OperationsTabs({ classId }: { classId?: string }) {
  const suffix = classId ? `?classId=${encodeURIComponent(classId)}` : '';
  return (
    <div className="suni-native-tabs">
      <Link to={`/vtraining/operations${suffix}`}>Thông tin vận hành</Link>
      <Link className="is-active" to={`/vtraining/checklist${suffix}`}>Checklist vận hành</Link>
      <Link to={`/vtraining/evidence${suffix}`}>Minh chứng vận hành</Link>
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

function ChecklistClassPicker({
  classes,
  loading,
  onSelect,
}: {
  classes: SuniTrainingClass[];
  loading: boolean;
  onSelect: (classId: string) => void;
}) {
  return (
    <Card title="Chọn lớp đào tạo" action={<Badge tone={classes.length ? 'success' : 'neutral'}>{classes.length} lớp</Badge>}>
      <div className="suni-native-table-wrap">
        <table className="data-table suni-native-table">
          <thead><tr><th>Mã</th><th>Lớp</th><th>Khóa</th><th>Địa điểm</th><th>Sĩ số</th><th>CV VH</th><th>Buổi</th><th>TT</th><th>Thao tác</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9}>Đang tải danh sách lớp đào tạo...</td></tr> : null}
            {!loading && classes.length === 0 ? <tr><td colSpan={9}>Chưa có lớp đào tạo để xem checklist vận hành.</td></tr> : null}
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
                <td><button className="btn btn-primary btn-small" type="button" onClick={() => onSelect(row.id)}><Eye size={14} /> Xem checklist</button></td>
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
      <div className="suni-operation-template-grid suni-checklist-template-grid">
        {templates.map((template) => {
          const isApplied = appliedKeys.has(template.key);
          const checklistCount = template.tasks.reduce((sum, task) => sum + (task.checklistItems?.length || 1), 0);
          const label = template.key === 'hcmc' ? 'HCMC' : template.key === 'offline' ? 'Offline' : 'Online';
          return (
            <article className={isApplied ? 'suni-operation-template-card is-applied' : 'suni-operation-template-card'} key={template.key}>
              <div>
                <span>{label}</span>
                <strong>{template.name}</strong>
                <p>{template.description}</p>
              </div>
              <div className="suni-operation-template-meta">
                <Badge tone={isApplied ? 'success' : 'neutral'}>{isApplied ? 'Đã áp dụng' : `${checklistCount} tick`}</Badge>
                <button className="btn btn-primary btn-small" type="button" disabled={applying || isApplied} onClick={() => onApply(template.key)}>
                  <ClipboardCheck size={14} /> {isApplied ? 'Đã insert' : template.key === 'hcmc' ? 'Insert mẫu HCMC' : 'Insert mẫu'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

function ChecklistLayer({
  item,
  initialPayload,
  parentTask,
  evidence,
  selectedClass,
  ctvUsers,
  onClose,
  onSave,
  onSaveEvidence,
  onDelete,
  saving,
  savingEvidence,
  deleting,
}: {
  item: SuniOperationChecklistItem | null;
  initialPayload?: SuniOperationChecklistPayload | null;
  parentTask: SuniOperationTask | null;
  evidence: SuniOperationEvidence | null;
  selectedClass: SuniTrainingClass;
  ctvUsers: SuniUser[];
  onClose: () => void;
  onSave: (payload: SuniOperationChecklistPayload) => Promise<SuniOperationChecklistItem | void>;
  onSaveEvidence: (payload: SuniOperationEvidenceUploadPayload) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  saving: boolean;
  savingEvidence: boolean;
  deleting: boolean;
}) {
  const [form, setForm] = useState<SuniOperationChecklistPayload>(() => item ? {
    id: item.id,
    classId: item.classId,
    taskId: item.taskId || null,
    templateKey: item.templateKey || null,
    templateItemKey: item.templateItemKey || null,
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
  } : initialPayload ? {
    ...initialPayload,
    dueAt: toDateTimeInput(initialPayload.dueAt),
  } : { ...EMPTY_CHECKLIST_FORM, classId: selectedClass.id });
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState(evidence?.fileUrl || '');

  function setField<K extends keyof SuniOperationChecklistPayload>(field: K, value: SuniOperationChecklistPayload[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleEvidenceFileChange(event: ChangeEvent<HTMLInputElement>) {
    setEvidenceFile(event.target.files?.[0] || null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const savedItem = await onSave({ ...form, dueAt: fromDateTimeInput(form.dueAt) });
    if (!savedItem) return;
    const checklistItem = savedItem;
    const hasEvidenceInput = Boolean(evidenceFile || evidenceUrl.trim());
    if (!checklistItem || !hasEvidenceInput) return;
    await onSaveEvidence({
      id: evidence?.id,
      classId: checklistItem.classId,
      taskId: checklistItem.taskId || parentTask?.id || null,
      checklistItemId: checklistItem.id,
      type: form.evidenceType || evidence?.type || 'Minh chứng công việc',
      sessionLabel: form.phase,
      title: form.title || evidence?.title || 'Minh chứng công việc',
      fileName: evidence?.fileName || evidenceFile?.name || '',
      fileUrl: evidenceUrl.trim() || evidence?.fileUrl || '',
      storageBucket: evidence?.storageBucket || null,
      storagePath: evidence?.storagePath || null,
      status: evidenceUrl.trim() || evidenceFile ? 'Chờ' : evidence?.status || 'Chờ',
      ownerProfileId: form.ownerProfileId || evidence?.ownerProfileId || null,
      ownerName: form.ownerName || evidence?.ownerName || '',
      note: form.note || evidence?.note || '',
      file: evidenceFile,
    });
  }

  const parentTitle = parentTask?.title || form.note || 'Checklist tùy chỉnh';

  return (
    <div className="suni-checklist-layer">
      <section className="suni-checklist-layer-panel" aria-label="Chi tiết checklist">
        <div className="suni-checklist-layer-head">
          <div>
            <span>{parentTask?.group || 'Checklist vận hành'}</span>
            <h3>{parentTitle}</h3>
            <p>{form.title || 'Hạng mục mới'}</p>
          </div>
          <button className="suni-native-action-icon" type="button" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>
        <form className="form-grid suni-resource-detail-form suni-checklist-layer-grid" onSubmit={(event) => void handleSubmit(event)}>
          <label className="checkbox-row full suni-checklist-layer-done">
            <input
              type="checkbox"
              checked={form.done === true}
              onChange={(event) => setForm((current) => ({ ...current, done: event.target.checked, status: event.target.checked ? 'Hoàn thành' : 'Đang làm' }))}
            />
            <span>Done hạng mục này</span>
          </label>
          <label className="full"><span>Đầu mục tick</span><input value={form.title} onChange={(event) => setField('title', event.target.value)} required /></label>
          <label><span>Trạng thái</span><select value={form.status || 'Chưa bắt đầu'} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value, done: event.target.value === 'Hoàn thành' }))}>{TASK_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label><span>Deadline</span><input type="datetime-local" value={form.dueAt || ''} onChange={(event) => setField('dueAt', event.target.value)} /></label>
          <label><span>Phụ trách</span><CtvSelect users={ctvUsers} value={form.ownerProfileId} ownerName={form.ownerName || ''} onChange={(profileId, ownerName) => setForm((current) => ({ ...current, ownerProfileId: profileId, ownerName }))} /></label>
          <label><span>Ưu tiên</span><select value={form.priority || 'MEDIUM'} onChange={(event) => setField('priority', event.target.value as SuniOperationPriority)}><option value="HIGH">HIGH</option><option value="MEDIUM">MEDIUM</option><option value="LOW">LOW</option></select></label>
          <label className="checkbox-row"><input type="checkbox" checked={form.requiresEvidence === true} onChange={(event) => setForm((current) => ({ ...current, requiresEvidence: event.target.checked, evidenceStatus: event.target.checked ? (current.evidenceStatus === 'not_required' ? 'missing' : current.evidenceStatus) : 'not_required' }))} /><span>Cần minh chứng</span></label>
          <label><span>Minh chứng</span><select value={form.evidenceStatus || 'not_required'} onChange={(event) => setField('evidenceStatus', event.target.value)}>{EVIDENCE_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label className="full"><span>Loại minh chứng</span><input value={form.evidenceType || ''} onChange={(event) => setField('evidenceType', event.target.value)} placeholder="Ảnh lớp / Điểm danh / Kết quả khảo sát..." /></label>
          <div className="full suni-checklist-evidence-box">
            <div className="suni-checklist-evidence-head">
              <strong>Minh chứng công việc</strong>
              {evidence?.fileUrl ? <a href={evidence.fileUrl} target="_blank" rel="noreferrer">Mở minh chứng hiện có</a> : <span>Chưa có file/link</span>}
            </div>
            {item ? (
              <div className="suni-checklist-evidence-grid">
                <label><span>Upload file</span><input type="file" onChange={handleEvidenceFileChange} /></label>
                <label><span>Link Drive</span><input value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://drive.google.com/..." /></label>
              </div>
            ) : (
              <p>Lưu hạng mục trước, sau đó mở lại để upload file hoặc dán link Drive.</p>
            )}
          </div>
          <label className="full"><span>Ghi chú</span><textarea rows={4} value={form.note || ''} onChange={(event) => setField('note', event.target.value)} /></label>
          <div className="action-row full">
            {item ? <button className="btn btn-danger" type="button" disabled={deleting} onClick={() => void onDelete(item.id)}><Trash2 size={15} /> Xóa</button> : null}
            <button className="btn btn-primary" type="submit" disabled={saving || savingEvidence}><CheckCircle2 size={15} /> {saving || savingEvidence ? 'Đang lưu...' : 'Lưu checklist'}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

type ChecklistWork = {
  key: string;
  group: string;
  title: string;
  task: SuniOperationTask | null;
  items: SuniOperationChecklistItem[];
};

function groupChecklistItems(checklist: SuniOperationChecklistItem[], tasks: SuniOperationTask[]) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const workMap = new Map<string, ChecklistWork>();
  checklist
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .forEach((item) => {
      const task = item.taskId ? tasksById.get(item.taskId) || null : null;
      const key = task?.id || item.note || item.id;
      const title = task?.title || item.note || item.title;
      const group = task?.group || 'Checklist tùy chỉnh';
      if (!workMap.has(key)) workMap.set(key, { key, group, title, task, items: [] });
      workMap.get(key)?.items.push(item);
    });
  const groups = new Map<string, ChecklistWork[]>();
  Array.from(workMap.values()).forEach((work) => {
    if (!groups.has(work.group)) groups.set(work.group, []);
    groups.get(work.group)?.push(work);
  });
  return Array.from(groups.entries()).map(([group, works]) => ({ group, works }));
}

export function SuniTrainingChecklistPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const classIdParam = searchParams.get('classId') || '';
  const [selectedClassId, setSelectedClassId] = useState(classIdParam);
  const [editingChecklistId, setEditingChecklistId] = useState('');
  const [newChecklistDraft, setNewChecklistDraft] = useState<SuniOperationChecklistPayload | null>(null);
  const [defaultOwnerProfileId, setDefaultOwnerProfileId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const classesQuery = useQuery({ queryKey: trainingQueries.classes(), queryFn: () => suniTrainingApi.listClasses() });
  const usersQuery = useQuery({ queryKey: trainingQueries.operationUsers(), queryFn: () => suniTrainingApi.listUsers() });
  const classes = classesQuery.data || [];
  const ctvUsers = useMemo(() => (usersQuery.data || []).filter(isCtvUser), [usersQuery.data]);
  const selectedClass = useMemo(() => classes.find((item) => item.id === selectedClassId) || null, [classes, selectedClassId]);

  useEffect(() => {
    if (classIdParam) setSelectedClassId(classIdParam);
  }, [classIdParam]);

  const tasksQuery = useQuery({
    queryKey: trainingQueries.operationTasks(selectedClassId),
    queryFn: () => suniTrainingApi.listOperationTasks(selectedClassId),
    enabled: Boolean(selectedClassId),
  });
  const checklistQuery = useQuery({
    queryKey: trainingQueries.operationChecklist(selectedClassId),
    queryFn: () => suniTrainingApi.listOperationChecklist(selectedClassId),
    enabled: Boolean(selectedClassId),
  });
  const evidenceQuery = useQuery({
    queryKey: trainingQueries.operationEvidence(selectedClassId),
    queryFn: () => suniTrainingApi.listOperationEvidence(selectedClassId),
    enabled: Boolean(selectedClassId),
  });

  const tasks = tasksQuery.data || [];
  const checklist = checklistQuery.data || [];
  const evidence = evidenceQuery.data || [];
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const evidenceByChecklistId = useMemo(() => {
    const map = new Map<string, SuniOperationEvidence>();
    evidence.forEach((item) => {
      if (!item.checklistItemId || map.has(item.checklistItemId)) return;
      map.set(item.checklistItemId, item);
    });
    return map;
  }, [evidence]);
  const appliedTemplateKeys = useMemo(() => new Set(checklist.map((item) => String(item.templateKey || '')).filter(Boolean)), [checklist]);
  const visibleChecklist = useMemo(() => (
    appliedTemplateKeys.has('hcmc')
      ? checklist.filter((item) => item.templateKey === 'hcmc')
      : checklist
  ), [appliedTemplateKeys, checklist]);
  const visibleTaskIds = useMemo(() => new Set(visibleChecklist.map((item) => item.taskId).filter(Boolean)), [visibleChecklist]);
  const visibleTasks = useMemo(() => tasks.filter((task) => visibleTaskIds.has(task.id)), [tasks, visibleTaskIds]);
  const checklistGroups = useMemo(() => groupChecklistItems(visibleChecklist, visibleTasks), [visibleChecklist, visibleTasks]);
  const selectedChecklist = editingChecklistId === '__new__' ? null : checklist.find((item) => item.id === editingChecklistId) || null;
  const selectedChecklistTaskId = selectedChecklist?.taskId || newChecklistDraft?.taskId || null;
  const selectedChecklistTask = selectedChecklistTaskId ? tasksById.get(selectedChecklistTaskId) || null : null;
  const selectedChecklistEvidence = selectedChecklist ? evidenceByChecklistId.get(selectedChecklist.id) || null : null;
  const loading = classesQuery.isLoading || tasksQuery.isLoading || checklistQuery.isLoading || evidenceQuery.isLoading;
  const queryError = classesQuery.error || tasksQuery.error || checklistQuery.error || evidenceQuery.error;
  const doneChecklistCount = visibleChecklist.filter((item) => item.done || item.status === 'Hoàn thành').length;
  const missingEvidenceCount = visibleChecklist.filter((item) => item.requiresEvidence && !['submitted', 'approved'].includes(item.evidenceStatus)).length;

  const invalidateOperation = async () => {
    await queryClient.invalidateQueries({ queryKey: trainingQueries.operationRoot() });
  };

  const checklistMutation = useMutation({
    mutationFn: (payload: SuniOperationChecklistPayload) => suniTrainingApi.saveOperationChecklistItem(payload),
    onSuccess: async () => {
      await invalidateOperation();
      setEditingChecklistId('');
      pushToast({ title: 'Đã lưu checklist', tone: 'success' });
    },
  });
  const toggleChecklistMutation = useMutation({
    mutationFn: (payload: SuniOperationChecklistPayload) => suniTrainingApi.saveOperationChecklistItem(payload),
    onSuccess: async () => {
      await invalidateOperation();
    },
  });
  const evidenceMutation = useMutation({
    mutationFn: (payload: SuniOperationEvidenceUploadPayload) => suniTrainingApi.saveOperationEvidence(payload),
    onSuccess: async () => {
      await invalidateOperation();
      pushToast({ title: 'Đã lưu minh chứng công việc', tone: 'success' });
    },
  });
  const seedChecklistMutation = useMutation({
    mutationFn: (classId: string) => suniTrainingApi.seedOperationChecklist(classId),
    onSuccess: async () => {
      await invalidateOperation();
      pushToast({ title: 'Đã tạo checklist mẫu nhanh', tone: 'success' });
    },
  });
  const applyTemplateMutation = useMutation({
    mutationFn: (templateKey: SuniOperationTemplateKey) => {
      const user = ctvUsers.find((item) => item.id === defaultOwnerProfileId) || null;
      return suniTrainingApi.applyOperationTemplate({
        classId: selectedClassId,
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

  async function runAction<T>(action: () => Promise<T>) {
    setErrorMessage('');
    try {
      return await action();
    } catch (error) {
      const message = getErrorMessage(error);
      setErrorMessage(message);
      pushToast({ title: 'Không lưu được dữ liệu', message, tone: 'danger' });
      return undefined;
    }
  }

  function selectClass(classId: string) {
    setSelectedClassId(classId);
    setEditingChecklistId('');
    setNewChecklistDraft(null);
    setSearchParams({ classId });
  }

  function openNewChecklistChild(work: ChecklistWork) {
    const parentTask = work.task;
    const lastItem = work.items.reduce<SuniOperationChecklistItem | null>((current, item) => (
      !current || (item.sortOrder || 0) > (current.sortOrder || 0) ? item : current
    ), null);
    setNewChecklistDraft({
      ...EMPTY_CHECKLIST_FORM,
      classId: selectedClassId,
      taskId: parentTask?.id || null,
      templateKey: parentTask?.templateKey || work.items[0]?.templateKey || null,
      templateItemKey: `${parentTask?.templateItemKey || parentTask?.id || work.key}:custom-${Date.now()}`,
      phase: parentTask?.phase || work.items[0]?.phase || 'DURING',
      title: '',
      ownerProfileId: parentTask?.ownerProfileId || work.items[0]?.ownerProfileId || null,
      ownerName: parentTask?.ownerName || work.items[0]?.ownerName || '',
      status: 'Chưa bắt đầu',
      priority: parentTask?.priority || work.items[0]?.priority || 'MEDIUM',
      requiresEvidence: parentTask?.requiresEvidence || false,
      evidenceStatus: parentTask?.requiresEvidence ? 'missing' : 'not_required',
      evidenceType: parentTask?.evidenceType || '',
      dueAt: parentTask?.dueAt || lastItem?.dueAt || '',
      note: parentTask?.title || work.title,
      sortOrder: (lastItem?.sortOrder || 0) + 1,
    });
    setEditingChecklistId('__new__');
  }

  function toChecklistPayload(item: SuniOperationChecklistItem, done: boolean): SuniOperationChecklistPayload {
    return {
      id: item.id,
      classId: item.classId,
      taskId: item.taskId,
      templateKey: item.templateKey,
      templateItemKey: item.templateItemKey,
      phase: item.phase,
      title: item.title,
      done,
      ownerProfileId: item.ownerProfileId,
      ownerName: item.ownerName,
      status: done ? 'Hoàn thành' : 'Đang làm',
      priority: item.priority,
      requiresEvidence: item.requiresEvidence,
      evidenceStatus: item.evidenceStatus,
      evidenceType: item.evidenceType,
      dueAt: item.dueAt,
      note: item.note || '',
      sortOrder: item.sortOrder,
    };
  }

  return (
    <>
      <SectionHeader
        eye="VTraining"
        title="Checklist vận hành"
        subtitle="Checklist theo lớp tách riêng: mỗi đầu mục có ô tick done, chi tiết trạng thái/minh chứng/phụ trách nằm trong layer khi bấm vào."
        actions={<OperationsTabs classId={selectedClassId} />}
      />

      {queryError ? <div className="notice danger">{getErrorMessage(queryError)}</div> : null}
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

      {classes.length && selectedClass ? <ClassSelector classes={classes} selectedClassId={selectedClassId} onSelect={selectClass} /> : null}

      {selectedClass ? (
        <div className="vuni-stat-grid">
          <div className="vuni-stat is-blue"><small>Đầu việc cha</small><strong>{visibleTasks.length || tasks.length}</strong></div>
          <div className="vuni-stat is-green"><small>Done</small><strong>{doneChecklistCount}</strong></div>
          <div className="vuni-stat is-amber"><small>Cần xử lý</small><strong>{Math.max(0, visibleChecklist.length - doneChecklistCount)}</strong></div>
          <div className="vuni-stat is-violet"><small>Thiếu minh chứng</small><strong>{missingEvidenceCount}</strong></div>
        </div>
      ) : null}

      {!loading && !classes.length ? <div className="notice warning">Chưa có lớp đào tạo để gắn checklist vận hành. Hãy tạo lớp ở màn Lớp đào tạo trước.</div> : null}
      {!selectedClass ? <ChecklistClassPicker classes={classes} loading={classesQuery.isLoading} onSelect={selectClass} /> : null}

      {selectedClass ? (
        <>
          <TemplateApplyPanel
            appliedKeys={appliedTemplateKeys}
            ctvUsers={ctvUsers}
            defaultOwnerProfileId={defaultOwnerProfileId}
            onDefaultOwnerChange={setDefaultOwnerProfileId}
            applying={applyTemplateMutation.isPending}
            onApply={(templateKey) => void runAction(() => applyTemplateMutation.mutateAsync(templateKey))}
          />

          {editingChecklistId ? (
            <ChecklistLayer
              key={editingChecklistId}
              item={selectedChecklist}
              initialPayload={newChecklistDraft}
              parentTask={selectedChecklistTask}
              evidence={selectedChecklistEvidence}
              selectedClass={selectedClass}
              ctvUsers={ctvUsers}
              saving={checklistMutation.isPending}
              savingEvidence={evidenceMutation.isPending}
              deleting={deleteChecklistMutation.isPending}
              onClose={() => {
                setEditingChecklistId('');
                setNewChecklistDraft(null);
              }}
              onSave={(payload) => runAction(() => checklistMutation.mutateAsync(payload))}
              onSaveEvidence={(payload) => runAction(() => evidenceMutation.mutateAsync(payload))}
              onDelete={(id) => runAction(() => deleteChecklistMutation.mutateAsync(id))}
            />
          ) : null}

          <Card
            title="Checklist vận hành theo lớp"
            action={(
              <div className="suni-native-row-actions">
                <button className="btn btn-ghost btn-small" disabled={seedChecklistMutation.isPending || checklist.length > 0} onClick={() => void runAction(() => seedChecklistMutation.mutateAsync(selectedClassId))}>Tạo mẫu nhanh</button>
                <button className="btn btn-primary btn-small" type="button" onClick={() => { setNewChecklistDraft(null); setEditingChecklistId('__new__'); }}><Plus size={14} /> Thêm hạng mục</button>
              </div>
            )}
          >
            <div className="suni-checklist-board">
              {loading ? <div className="suni-native-linked-empty"><strong>Đang tải checklist...</strong></div> : null}
              {!loading && visibleChecklist.length === 0 ? <div className="suni-native-linked-empty"><strong>Chưa có checklist cho lớp này.</strong><span>Hãy insert mẫu trực tiếp, trực tuyến hoặc HCMC để bắt đầu.</span></div> : null}
              {checklistGroups.map((group) => (
                <section className="suni-checklist-group" key={group.group}>
                  <div className="suni-checklist-group-head">
                    <strong>{group.group}</strong>
                    <Badge tone="neutral">{group.works.reduce((sum, work) => sum + work.items.length, 0)} tick</Badge>
                  </div>
                  {group.works.map((work) => {
                    const doneCount = work.items.filter((item) => item.done || item.status === 'Hoàn thành').length;
                    return (
                      <article className="suni-checklist-work" key={work.key}>
                        <div className="suni-checklist-work-head">
                          <div>
                            <strong>{work.title}</strong>
                            <span>{work.task?.ownerName || work.task?.ownerProfileId || work.items[0]?.ownerName || 'Chưa giao CTV'}</span>
                          </div>
                          <div className="suni-checklist-work-actions">
                            <Badge tone={doneCount === work.items.length ? 'success' : 'warning'}>{doneCount}/{work.items.length}</Badge>
                            <button className="suni-checklist-child-add" type="button" onClick={() => openNewChecklistChild(work)}>
                              <Plus size={13} /> Thêm việc con
                            </button>
                          </div>
                        </div>
                        <div className="suni-checklist-items">
                          {work.items.map((item) => (
                            <button className={item.done ? 'suni-checklist-item is-done' : 'suni-checklist-item'} type="button" key={item.id} onClick={() => { setNewChecklistDraft(null); setEditingChecklistId(item.id); }}>
                              <span className="suni-checklist-done" onClick={(event) => event.stopPropagation()}>
                                <input
                                  aria-label={`Done ${item.title}`}
                                  type="checkbox"
                                  checked={item.done}
                                  disabled={toggleChecklistMutation.isPending}
                                  onChange={(event) => void runAction(() => toggleChecklistMutation.mutateAsync(toChecklistPayload(item, event.target.checked)))}
                                />
                              </span>
                              <span className="suni-checklist-item-main">
                                <strong>{item.title}</strong>
                                <span>{formatDateTime(item.dueAt)} · {item.ownerName || 'Theo vai trò mẫu'}</span>
                              </span>
                              <span className="suni-checklist-item-meta">
                                <Badge tone={statusTone(item.done ? 'Hoàn thành' : item.status)}>{item.done ? 'Done' : item.status}</Badge>
                                {item.requiresEvidence ? <Badge tone={evidenceStatusTone(item.evidenceStatus)}>{evidenceStatusLabel(item.evidenceStatus)}</Badge> : null}
                                <span className="suni-checklist-edit-pill"><Pencil size={13} /> Sửa</span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </section>
              ))}
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}

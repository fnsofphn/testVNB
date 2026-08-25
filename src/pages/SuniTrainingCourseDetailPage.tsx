import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, CalendarDays, FileText, GraduationCap, ListChecks, Upload } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import {
  SuniApiError,
  suniTrainingApi,
  type SuniAgendaPayload,
  type SuniUser,
  type SuniTrainingAgenda,
  type SuniTrainingMaterial,
  type SuniTrainingScoreComponent,
} from '@/lib/suni';
import { queries } from '@/features/vtraining';
import { queries as sharedQueries } from '@/features/shared';
import { useAuth } from '@/contexts/AuthContext';
import { isTrainingAdminRole, normalizeAppRole } from '@/data/vcontent';

type CourseTab = 'overview' | 'classes' | 'agenda' | 'materials' | 'results';

const SCORE_COMPONENTS: SuniTrainingScoreComponent[] = [
  { key: 'attendance', label: 'Chuyên cần', weight: 0 },
  { key: 'quiz', label: 'Bài kiểm tra', weight: 0 },
  { key: 'reflection', label: 'Thu hoạch', weight: 0 },
  { key: 'discussion', label: 'Thảo luận', weight: 0 },
];

const SCORE_COMPONENT_PLACEHOLDERS: Partial<Record<SuniTrainingScoreComponent['key'], string>> = {
  attendance: '0 hoặc 10',
  quiz: 'VD: 20',
  reflection: 'VD: 30',
  discussion: 'VD: 40',
};

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với VTraining.';
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

function statusTone(status?: string | null): 'danger' | 'warning' | 'success' | 'violet' | 'neutral' {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'published', 'open'].includes(normalized)) return 'success';
  if (['completed', 'closed', 'locked'].includes(normalized)) return 'violet';
  if (['archived'].includes(normalized)) return 'neutral';
  return 'warning';
}

function statusLabel(status?: string | null) {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'published', 'open'].includes(normalized)) return 'Đang mở';
  if (['completed', 'closed'].includes(normalized)) return 'Hoàn thành';
  if (normalized === 'locked') return 'Đã khóa';
  if (normalized === 'archived') return 'Lưu trữ';
  return 'Nháp';
}

function emptyAgenda(courseId: string): SuniAgendaPayload {
  return {
    courseId,
    sessionNo: 1,
    sessionDate: '',
    startTime: '',
    endTime: '',
    title: '',
    description: '',
  };
}

function CourseAgendaForm({ courseId, editing, onCancel }: { courseId: string; editing: SuniTrainingAgenda | null; onCancel: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SuniAgendaPayload>(() => editing ? {
    id: editing.id,
    courseId,
    classId: null,
    sessionNo: editing.sessionNo,
    sessionDate: editing.sessionDate || '',
    startTime: formatTime(editing.startTime) === '-' ? '' : formatTime(editing.startTime),
    endTime: formatTime(editing.endTime) === '-' ? '' : formatTime(editing.endTime),
    title: editing.title,
    description: editing.description || '',
  } : emptyAgenda(courseId));
  const [errorMessage, setErrorMessage] = useState('');
  const mutation = useMutation({
    mutationFn: (payload: SuniAgendaPayload) => suniTrainingApi.saveAgenda(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.agendas(courseId) });
      setForm(emptyAgenda(courseId));
      onCancel();
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!form.title.trim()) return setErrorMessage('Cần nhập nội dung chính của buổi học.');
    try {
      await mutation.mutateAsync(form);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      {errorMessage ? <div className="notice danger full">{errorMessage}</div> : null}
      <label><span>Buổi số</span><input type="number" min="1" value={form.sessionNo} onChange={(event) => setForm((current) => ({ ...current, sessionNo: Number(event.target.value) || 1 }))} /></label>
      <label><span>Ngày</span><input type="date" value={form.sessionDate || ''} onChange={(event) => setForm((current) => ({ ...current, sessionDate: event.target.value }))} /></label>
      <label><span>Từ giờ</span><input type="time" value={form.startTime || ''} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} /></label>
      <label><span>Đến giờ</span><input type="time" value={form.endTime || ''} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} /></label>
      <label className="full"><span>Nội dung chính</span><input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
      <label className="full"><span>Giảng viên / ghi chú</span><textarea value={form.description || ''} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
      <div className="action-row full">
        {editing ? <button type="button" className="btn btn-ghost" onClick={onCancel}>Hủy sửa</button> : null}
        <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Đang lưu...' : editing ? 'Cập nhật buổi học' : 'Thêm buổi học'}</button>
      </div>
    </form>
  );
}

function CourseMaterialsUpload({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visible, setVisible] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Cần chọn file tài liệu.');
      return suniTrainingApi.uploadMaterial({ courseId, title, description, visibleToStudents: visible, file });
    },
    onSuccess: async () => {
      setTitle('');
      setDescription('');
      setFile(null);
      await queryClient.invalidateQueries({ queryKey: queries.materials(courseId) });
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    try {
      await mutation.mutateAsync();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] || null);
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      {errorMessage ? <div className="notice danger full">{errorMessage}</div> : null}
      <label><span>Tiêu đề</span><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={file?.name || 'Tên hiển thị'} /></label>
      <label className="checkbox-row"><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /><span>Public</span></label>
      <label className="full"><span>Mô tả</span><input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <label className="full"><span>File</span><input type="file" accept=".ppt,.pptx,.doc,.docx,.xls,.xlsx,.pdf,application/pdf" onChange={handleFile} /></label>
      <div className="action-row full">
        <button type="submit" className="btn btn-primary" disabled={!file || mutation.isPending}><Upload size={16} /> {mutation.isPending ? 'Đang upload...' : 'Upload tài liệu'}</button>
      </div>
    </form>
  );
}

function MaterialRows({ materials, courseId, canManage }: { materials: SuniTrainingMaterial[]; courseId: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [errorMessage, setErrorMessage] = useState('');
  const visibilityMutation = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) => suniTrainingApi.updateMaterialVisibility(id, visible),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: queries.materials(courseId) }),
  });
  const deleteMutation = useMutation({
    mutationFn: (material: SuniTrainingMaterial) => suniTrainingApi.deleteMaterial(material),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: queries.materials(courseId) }),
  });

  async function run(action: () => Promise<unknown>) {
    setErrorMessage('');
    try {
      await action();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <>
      {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
      <div className="suni-native-table-wrap">
        <table className="data-table suni-native-table">
          <thead><tr><th>Tài liệu</th><th>Loại</th><th>Dung lượng</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
          <tbody>
            {materials.map((material) => (
              <tr key={material.id}>
                <td><strong>{material.title || material.fileName}</strong><span>{material.description || material.fileName}</span></td>
                <td>{material.fileType || '-'}</td>
                <td>{formatBytes(material.fileSize)}</td>
                <td><Badge tone={material.visibleToStudents ? 'success' : 'neutral'}>{material.visibleToStudents ? 'public' : 'Ẩn'}</Badge></td>
                <td><div className="suni-native-row-actions">
                  {material.publicUrl ? <a className="btn btn-ghost btn-small" href={material.publicUrl} target="_blank" rel="noreferrer">Mở</a> : null}
                  {canManage ? <button className="btn btn-ghost btn-small" onClick={() => void run(() => visibilityMutation.mutateAsync({ id: material.id, visible: !material.visibleToStudents }))}>{material.visibleToStudents ? 'Ẩn' : 'Hiện'}</button> : null}
                  {canManage ? <button className="btn btn-danger btn-small" onClick={() => void run(() => deleteMutation.mutateAsync(material))}>Xóa</button> : null}
                </div></td>
              </tr>
            ))}
            {!materials.length ? <tr><td colSpan={5}>Chưa có tài liệu học tập.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ScoreRulePanel({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const ruleQuery = useQuery({ queryKey: queries.scoreRule(courseId), queryFn: () => suniTrainingApi.getScoreRule(courseId) });
  const [components, setComponents] = useState<SuniTrainingScoreComponent[]>(SCORE_COMPONENTS);
  const [passingScore, setPassingScore] = useState('');
  const [loadedRuleId, setLoadedRuleId] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  if (ruleQuery.data && ruleQuery.data.id !== loadedRuleId) {
    setLoadedRuleId(ruleQuery.data.id);
    setComponents(SCORE_COMPONENTS.map((component) => {
      const saved = ruleQuery.data?.components.find((item) => item.key === component.key);
      return saved ? { ...component, weight: saved.weight } : component;
    }));
    setPassingScore(ruleQuery.data.passingScore == null ? '' : String(ruleQuery.data.passingScore));
  }

  const mutation = useMutation({
    mutationFn: () => suniTrainingApi.saveScoreRule({
      courseId,
      components: components.filter((component) => component.weight > 0),
      passingScore: passingScore === '' ? null : Number(passingScore),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queries.scoreRule(courseId) }),
        queryClient.invalidateQueries({ queryKey: queries.courseResults(courseId) }),
      ]);
    },
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    try {
      await mutation.mutateAsync();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <form className="form-grid" onSubmit={(event) => void submit(event)}>
      {errorMessage ? <div className="notice danger full">{errorMessage}</div> : null}
      {components.map((component, index) => (
        <label key={component.key}><span>{component.label} (%)</span><input type="number" min="0" max="100" value={component.weight} placeholder={SCORE_COMPONENT_PLACEHOLDERS[component.key]} onChange={(event) => setComponents((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, weight: Number(event.target.value) || 0 } : item))} /></label>
      ))}
      <label><span>Điểm đạt (/10)</span><input type="number" min="0" max="10" step="0.1" value={passingScore} onChange={(event) => setPassingScore(event.target.value)} placeholder="VD: 6.5, để trống nếu chưa chốt" /></label>
      <div className="score-rule-notes full">
        <div className="notice">Nhập tỷ trọng theo phần trăm. Cấu phần không tính điểm có thể để 0%. Nếu có cấu phần lớn hơn 0%, tổng tỷ trọng phải bằng 100%.</div>
        <div className="notice">Chuyên cần là điểm thành phần trên thang /10. Để 0% nếu khóa không tính chuyên cần, hoặc đặt 10% nếu chuyên cần chiếm 10% cơ cấu điểm. Nếu lớp có nhiều thảo luận, điểm Thảo luận là trung bình các phiên; điểm cộng là tổng các phiên và có thể chỉnh tại bảng kết quả.</div>
      </div>
      <div className="action-row full">
        <button className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Đang lưu...' : 'Lưu công thức điểm'}</button>
      </div>
    </form>
  );
}

function CourseCustomerAccessPanel({ courseId, selectedProfileIds, users }: { courseId: string; selectedProfileIds: string[]; users: SuniUser[] }) {
  const queryClient = useQueryClient();
  const customers = useMemo(() => users.filter((user) => {
    const role = normalizeAppRole(user.role);
    return role === 'client' || role === 'client_director';
  }), [users]);
  const [draftIds, setDraftIds] = useState<string[]>(selectedProfileIds);
  const [loadedSignature, setLoadedSignature] = useState(selectedProfileIds.join('|'));
  const [errorMessage, setErrorMessage] = useState('');

  const selectedSignature = selectedProfileIds.join('|');
  if (selectedSignature !== loadedSignature) {
    setLoadedSignature(selectedSignature);
    setDraftIds(selectedProfileIds);
  }

  const mutation = useMutation({
    mutationFn: () => suniTrainingApi.updateCourseCustomerViewers(courseId, draftIds),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queries.course(courseId) }),
        queryClient.invalidateQueries({ queryKey: queries.courses() }),
        queryClient.invalidateQueries({ queryKey: queries.customerResultsRoot() }),
      ]);
    },
  });

  function toggle(profileId: string) {
    setDraftIds((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : [...current, profileId]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    try {
      await mutation.mutateAsync();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <Card title="Khách hàng xem kết quả" action={<Badge tone={draftIds.length ? 'success' : 'neutral'}>{draftIds.length} tài khoản</Badge>}>
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        {errorMessage ? <div className="notice danger full">{errorMessage}</div> : null}
        <div className="notice full">Admin gán tài khoản khách hàng vào khóa này để họ xem toàn bộ kết quả học tập của khóa, không có quyền chỉnh sửa.</div>
        <div className="full suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Chọn</th><th>Khách hàng</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id}>
                  <td><input type="checkbox" checked={draftIds.includes(customer.id)} onChange={() => toggle(customer.id)} /></td>
                  <td><strong>{customer.fullName || customer.name || customer.email || customer.id}</strong></td>
                  <td>{customer.email || '-'}</td>
                  <td>{customer.role || '-'}</td>
                </tr>
              ))}
              {!customers.length ? <tr><td colSpan={4}>Chưa có tài khoản khách hàng active để gán.</td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="action-row full">
          <button className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending ? 'Đang lưu...' : 'Lưu quyền xem kết quả'}</button>
        </div>
      </form>
    </Card>
  );
}

export function SuniTrainingCourseDetailPage() {
  const { courseId } = useParams();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<CourseTab>('overview');
  const [editingAgenda, setEditingAgenda] = useState<SuniTrainingAgenda | null>(null);
  const [actionError, setActionError] = useState('');

  if (!courseId) return <Navigate to="/vtraining/courses" replace />;
  const canManage = isTrainingAdminRole(profile?.role);

  const courseQuery = useQuery({ queryKey: queries.course(courseId), queryFn: () => suniTrainingApi.getCourse(courseId) });
  const classesQuery = useQuery({ queryKey: queries.courseClasses(courseId), queryFn: () => suniTrainingApi.listCourseClasses(courseId) });
  const agendaQuery = useQuery({ queryKey: queries.agendas(courseId), queryFn: () => suniTrainingApi.listAgendas({ courseId }) });
  const materialsQuery = useQuery({ queryKey: queries.materials(courseId), queryFn: () => suniTrainingApi.listMaterials({ courseId }) });
  const resultsQuery = useQuery({ queryKey: queries.courseResults(courseId), queryFn: () => suniTrainingApi.listTrainingResults({ courseId }) });
  const usersQuery = useQuery({ queryKey: sharedQueries.users(), queryFn: () => suniTrainingApi.listUsers(), enabled: canManage });

  const course = courseQuery.data;
  const classes = classesQuery.data || [];
  const agendas = agendaQuery.data || [];
  const materials = materialsQuery.data || [];
  const results = resultsQuery.data || [];
  const users = usersQuery.data || [];

  const loading = courseQuery.isLoading;
  const error = courseQuery.error || classesQuery.error || agendaQuery.error || materialsQuery.error || resultsQuery.error || usersQuery.error;

  const deleteAgendaMutation = useMutation({
    mutationFn: (id: string) => suniTrainingApi.deleteAgenda(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: queries.agendas(courseId) }),
  });

  async function runAction(action: () => Promise<unknown>) {
    setActionError('');
    try {
      await action();
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  }

  const scoreSummary = useMemo(() => {
    const completed = results.filter((result) => result.finalScore != null).length;
    const passed = results.filter((result) => result.passed === true).length;
    return { completed, passed };
  }, [results]);

  if (loading) return <div className="vdiscussion-empty">Đang tải khóa đào tạo...</div>;
  if (!course) return <div className="vdiscussion-empty">Không tìm thấy khóa đào tạo.</div>;

  return (
    <div className="suni-native-page">
      <SectionHeader
        eye="VTraining"
        title={course.title || course.code || 'Khóa đào tạo'}
        subtitle={`${course.code || 'Chưa có mã'} · ${course.courseProgram?.name || 'Khóa độc lập'}`}
        actions={<Link className="btn btn-ghost" to="/vtraining/courses"><ArrowLeft size={15} /> Quay lại danh sách khóa</Link>}
      />

      {error ? <div className="notice danger">{getErrorMessage(error)}</div> : null}
      {actionError ? <div className="notice danger">{actionError}</div> : null}

      <div className="vdiscussion-tabs">
        <button type="button" className={activeTab === 'overview' ? 'is-active' : ''} onClick={() => setActiveTab('overview')}><BookOpen size={16} /> Tổng quan</button>
        <button type="button" className={activeTab === 'classes' ? 'is-active' : ''} onClick={() => setActiveTab('classes')}><GraduationCap size={16} /> Danh sách lớp</button>
        <button type="button" className={activeTab === 'agenda' ? 'is-active' : ''} onClick={() => setActiveTab('agenda')}><CalendarDays size={16} /> Agenda</button>
        <button type="button" className={activeTab === 'materials' ? 'is-active' : ''} onClick={() => setActiveTab('materials')}><FileText size={16} /> Tài liệu học tập</button>
        <button type="button" className={activeTab === 'results' ? 'is-active' : ''} onClick={() => setActiveTab('results')}><ListChecks size={16} /> Cơ cấu điểm</button>
      </div>

      {activeTab === 'overview' ? (
        <div className="vtraining-detail-stack">
          <Card title="Thông tin khóa">
            <div className="vtraining-detail-grid">
              <div><span>Mã khóa</span><strong>{course.code || '-'}</strong></div>
              <div><span>Tên khóa</span><strong>{course.title || '-'}</strong></div>
              <div><span>Thời gian</span><strong>{formatDate(course.startAt)} - {formatDate(course.endAt)}</strong></div>
              <div><span>Đối tượng</span><strong>{course.targetAudience || '-'}</strong></div>
              <div><span>Hình thức</span><strong>{course.format || '-'}</strong></div>
              <div><span>Chương trình</span><strong>{course.courseProgram?.name || '-'}</strong></div>
              <div><span>Khách hàng / đơn vị</span><strong>{course.customerName || '-'}</strong></div>
              <div><span>Trạng thái</span><strong><Badge tone={statusTone(course.status)}>{statusLabel(course.status)}</Badge></strong></div>
            </div>
          </Card>
          {canManage ? <CourseCustomerAccessPanel courseId={courseId} selectedProfileIds={course.customerViewerProfileIds || []} users={users} /> : null}
        </div>
      ) : null}

      {activeTab === 'classes' ? (
        <Card title="Lớp thuộc khóa" action={<Badge tone={classes.length ? 'success' : 'warning'}>{classes.length} lớp</Badge>}>
          <div className="suni-native-table-wrap">
            <table className="data-table suni-native-table">
              <thead><tr><th>Mã</th><th>Lớp</th><th>Lịch</th><th>Hình thức</th><th>Học viên</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
              <tbody>
                {classes.map((klass) => (
                  <tr
                    key={klass.id}
                    className="suni-native-click-row"
                    tabIndex={0}
                    onClick={() => window.open(`/vtraining/classes/${klass.id}`, '_blank', 'noopener,noreferrer')}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        window.open(`/vtraining/classes/${klass.id}`, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  >
                    <td><code>{klass.code || '-'}</code></td>
                    <td><strong>{klass.name || '-'}</strong><span>{klass.description || '-'}</span></td>
                    <td>{formatDate(klass.startAt)} - {formatDate(klass.endAt)}</td>
                    <td>{klass.deliveryMode || '-'}</td>
                    <td>{klass.currentLearnerCount || 0}/{klass.maxLearnerCount || 0}</td>
                    <td><Badge tone={statusTone(klass.status)}>{statusLabel(klass.status)}</Badge></td>
                    <td><Link className="btn btn-ghost btn-small" to={`/vtraining/classes/${klass.id}`} target="_blank" rel="noopener noreferrer">Mở lớp</Link></td>
                  </tr>
                ))}
                {!classes.length ? <tr><td colSpan={7}>Chưa có lớp thuộc khóa này.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {activeTab === 'agenda' ? (
        <div className="vtraining-detail-stack">
          {canManage ? <Card title={editingAgenda ? 'Sửa buổi học' : 'Thêm buổi học'}>
            <CourseAgendaForm key={editingAgenda?.id || 'new'} courseId={courseId} editing={editingAgenda} onCancel={() => setEditingAgenda(null)} />
          </Card> : null}
          <Card title="Agenda khóa" action={<Badge tone={agendas.length ? 'success' : 'warning'}>{agendas.length} buổi</Badge>}>
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
                  {!agendas.length ? <tr><td colSpan={6}>Chưa có agenda cho khóa.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'materials' ? (
        <div className="vtraining-detail-stack">
          {canManage ? <Card title="Upload tài liệu">
            <CourseMaterialsUpload courseId={courseId} />
          </Card> : null}
          <Card title="Tài liệu học tập" action={<Badge tone={materials.length ? 'success' : 'warning'}>{materials.length} file</Badge>}>
            <MaterialRows materials={materials} courseId={courseId} canManage={canManage} />
          </Card>
        </div>
      ) : null}

      {activeTab === 'results' ? (
        <div className="vtraining-detail-stack">
          <Card title="Cơ cấu điểm theo khóa">
            {canManage ? <ScoreRulePanel courseId={courseId} /> : <div className="notice">Chỉ admin được cấu hình cơ cấu điểm.</div>}
          </Card>
          <Card title="Tổng hợp kết quả" action={<Badge tone={scoreSummary.completed ? 'success' : 'neutral'}>{scoreSummary.completed} có điểm / {scoreSummary.passed} đạt</Badge>}>
            <div className="suni-native-table-wrap">
              <table className="data-table suni-native-table">
                <thead><tr><th>Lớp</th><th>Học viên</th><th>Scores slot</th><th>Điểm cuối</th><th>Kết quả</th></tr></thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.id}>
                      <td>{result.classId}</td>
                      <td>{result.studentProfileId}</td>
                      <td><code>{JSON.stringify(result.scores)}</code></td>
                      <td>{result.finalScore ?? '-'}</td>
                      <td><Badge tone={result.passed ? 'success' : result.passed === false ? 'danger' : 'neutral'}>{result.passed == null ? 'Chưa chốt' : result.passed ? 'Đạt' : 'Chưa đạt'}</Badge></td>
                    </tr>
                  ))}
                  {!results.length ? <tr><td colSpan={5}>Chưa có dữ liệu kết quả. vtest sẽ cập nhật vào scores sau.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

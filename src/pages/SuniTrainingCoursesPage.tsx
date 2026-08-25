import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import {
  SuniApiError,
  suniTrainingApi,
  type SuniCoursePayload,
  type SuniTrainingCourse,
  type SuniTrainingProgram,
} from '@/lib/suni';
import { queries } from '@/features/vtraining';
import { useAuth } from '@/contexts/AuthContext';
import { isTrainingAdminRole, normalizeAppRole } from '@/data/vcontent';

type CourseFormState = {
  id?: string;
  code: string;
  title: string;
  programId: string;
  customerName: string;
  coordinatorName: string;
  format: string;
  startAt: string;
  endAt: string;
  durationDays: string;
  expectedDuration: string;
  location: string;
  onlineLearningUrl: string;
  targetAudience: string;
  plannedClassCount: string;
  status: string;
  objective: string;
  description: string;
};

const EMPTY_FORM: CourseFormState = {
  code: '',
  title: '',
  programId: '',
  customerName: '',
  coordinatorName: '',
  format: 'offline',
  startAt: '',
  endAt: '',
  durationDays: '',
  expectedDuration: '',
  location: '',
  onlineLearningUrl: '',
  targetAudience: '',
  plannedClassCount: '1',
  status: 'published',
  objective: '',
  description: '',
};

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với VTraining.';
}

function normalizeStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['active', 'published'].includes(normalized)) return 'published';
  if (normalized === 'locked') return 'locked';
  if (normalized === 'archived') return 'archived';
  return 'draft';
}

function statusTone(status: string | null | undefined): 'danger' | 'warning' | 'success' | 'violet' | 'neutral' {
  const bucket = normalizeStatus(status);
  if (bucket === 'published') return 'success';
  if (bucket === 'locked') return 'violet';
  if (bucket === 'archived') return 'neutral';
  return 'warning';
}

function statusLabel(status: string | null | undefined) {
  const bucket = normalizeStatus(status);
  if (bucket === 'published') return 'Đang mở';
  if (bucket === 'locked') return 'Đã khóa';
  if (bucket === 'archived') return 'Lưu trữ';
  return 'Nháp';
}

function toFormState(course?: SuniTrainingCourse | null): CourseFormState {
  if (!course) return EMPTY_FORM;
  return {
    id: String(course.id),
    code: course.code || '',
    title: course.title || course.name || '',
    programId: course.programId || '',
    customerName: course.customerName || '',
    coordinatorName: course.coordinatorName || '',
    format: course.format || 'offline',
    startAt: course.startAt || '',
    endAt: course.endAt || '',
    durationDays: course.durationDays != null ? String(course.durationDays) : '',
    expectedDuration: course.expectedDuration || '',
    location: course.location || '',
    onlineLearningUrl: course.onlineLearningUrl || '',
    targetAudience: course.targetAudience || '',
    plannedClassCount: course.plannedClassCount != null ? String(course.plannedClassCount) : '1',
    status: normalizeStatus(course.status),
    objective: course.objective || '',
    description: course.description || '',
  };
}

function toPayload(form: CourseFormState): SuniCoursePayload {
  const online = form.format === 'online' || form.format === 'e-learning';
  return {
    id: form.id,
    code: form.code.trim(),
    title: form.title.trim(),
    programId: form.programId || null,
    customerName: form.customerName.trim() || null,
    coordinatorName: form.coordinatorName.trim() || null,
    format: form.format,
    startAt: form.startAt || null,
    endAt: form.endAt || null,
    durationDays: form.durationDays ? Number(form.durationDays) : null,
    expectedDuration: form.expectedDuration.trim() || null,
    locationType: online ? 'online' : 'offline',
    location: online ? null : form.location.trim() || null,
    onlineLearningUrl: online ? form.onlineLearningUrl.trim() || null : null,
    targetAudience: form.targetAudience.trim() || null,
    plannedClassCount: form.plannedClassCount ? Number(form.plannedClassCount) : 1,
    status: form.status || 'published',
    objective: form.objective.trim() || null,
    description: form.description.trim() || null,
  };
}

function CourseModal({ initialCourse, programs, onClose }: {
  initialCourse: SuniTrainingCourse | null;
  programs: SuniTrainingProgram[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CourseFormState>(() => toFormState(initialCourse));
  const [errorMessage, setErrorMessage] = useState('');
  const isEdit = Boolean(form.id);

  const saveMutation = useMutation({
    mutationFn: (payload: SuniCoursePayload) => suniTrainingApi.saveCourse(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queries.courses() }),
        queryClient.invalidateQueries({ queryKey: queries.programs() }),
        queryClient.invalidateQueries({ queryKey: queries.classes() }),
      ]);
      onClose();
    },
  });

  function setField<K extends keyof CourseFormState>(field: K, value: CourseFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!form.code.trim()) return setErrorMessage('Cần nhập mã khóa.');
    if (!form.title.trim()) return setErrorMessage('Cần nhập tên khóa.');
    try {
      await saveMutation.mutateAsync(toPayload(form));
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  const online = form.format === 'online' || form.format === 'e-learning';

  return (
    <div className="suni-native-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="suni-native-modal" onSubmit={(event) => void handleSubmit(event)}>
        <div className="suni-native-modal-head">
          <div>
            <span>VTraining</span>
            <h3>{isEdit ? 'Sửa khóa đào tạo' : 'Tạo khóa đào tạo'}</h3>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>Đóng</button>
        </div>
        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
        <div className="form-grid">
          <label><span>Mã khóa</span><input value={form.code} onChange={(event) => setField('code', event.target.value)} placeholder="VD: VT26-K01" /></label>
          <label><span>Chương trình</span><select value={form.programId} onChange={(event) => setField('programId', event.target.value)}><option value="">Khóa độc lập</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name || program.code}</option>)}</select></label>
          <label className="full"><span>Tên khóa</span><input value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="Nhập tên khóa đào tạo" /></label>
          <label><span>Khách hàng</span><input value={form.customerName} onChange={(event) => setField('customerName', event.target.value)} /></label>
          <label><span>PM / Điều phối</span><input value={form.coordinatorName} onChange={(event) => setField('coordinatorName', event.target.value)} /></label>
          <label><span>Hình thức</span><select value={form.format} onChange={(event) => setField('format', event.target.value)}><option value="offline">Offline</option><option value="online">Online</option><option value="workshop">Workshop</option><option value="e-learning">E-learning</option><option value="blended">Blended</option></select></label>
          <label><span>Trạng thái</span><select value={form.status} onChange={(event) => setField('status', event.target.value)}><option value="draft">Nháp</option><option value="published">Đang mở</option><option value="locked">Đã khóa</option><option value="archived">Lưu trữ</option></select></label>
          <label><span>Từ ngày</span><input type="date" value={form.startAt} onChange={(event) => setField('startAt', event.target.value)} /></label>
          <label><span>Đến ngày</span><input type="date" value={form.endAt} onChange={(event) => setField('endAt', event.target.value)} /></label>
          <label><span>Số ngày</span><input type="number" min="0" value={form.durationDays} onChange={(event) => setField('durationDays', event.target.value)} /></label>
          <label><span>Thời lượng hiển thị</span><input value={form.expectedDuration} onChange={(event) => setField('expectedDuration', event.target.value)} placeholder="VD: 24 giờ / 6 buổi" /></label>
          <label><span>Số lớp dự kiến</span><input type="number" min="0" value={form.plannedClassCount} onChange={(event) => setField('plannedClassCount', event.target.value)} /></label>
          <label><span>{online ? 'Link học online' : 'Địa điểm'}</span><input value={online ? form.onlineLearningUrl : form.location} onChange={(event) => setField(online ? 'onlineLearningUrl' : 'location', event.target.value)} placeholder={online ? 'https://...' : 'Phòng học / địa chỉ'} /></label>
          <label className="full"><span>Đối tượng học viên</span><input value={form.targetAudience} onChange={(event) => setField('targetAudience', event.target.value)} placeholder="VD: Cán bộ quản lý, nhân viên..." /></label>
          <label className="full"><span>Mục tiêu</span><textarea value={form.objective} onChange={(event) => setField('objective', event.target.value)} /></label>
          <label className="full"><span>Mô tả</span><textarea value={form.description} onChange={(event) => setField('description', event.target.value)} /></label>
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo khóa'}</button>
        </div>
      </form>
    </div>
  );
}

export function SuniTrainingCoursesPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const canManage = isTrainingAdminRole(profile?.role);
  const isCustomerView = ['client', 'client_director'].includes(normalizeAppRole(profile?.role));
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingCourse, setEditingCourse] = useState<SuniTrainingCourse | null | undefined>(undefined);
  const [deleteError, setDeleteError] = useState('');

  const coursesQuery = useQuery({
    queryKey: isCustomerView ? queries.customerCourses(profile?.id || '') : queries.courses(),
    queryFn: () => isCustomerView ? suniTrainingApi.listCustomerCourses(profile?.id) : suniTrainingApi.listCourses(),
    enabled: !isCustomerView || Boolean(profile?.id),
  });
  const programsQuery = useQuery({ queryKey: queries.programs(), queryFn: () => suniTrainingApi.listPrograms(), enabled: canManage });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => suniTrainingApi.deleteCourse(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queries.courses() }),
        queryClient.invalidateQueries({ queryKey: queries.programs() }),
        queryClient.invalidateQueries({ queryKey: queries.classes() }),
      ]);
    },
  });

  const courses = coursesQuery.data || [];
  const programs = programsQuery.data || [];
  const filteredCourses = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return courses.filter((course) => {
      const haystack = `${course.code || ''} ${course.title || ''} ${course.customerName || ''} ${course.courseProgram?.name || ''}`.toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (statusFilter && normalizeStatus(course.status) !== statusFilter) return false;
      return true;
    });
  }, [courses, search, statusFilter]);

  async function handleDelete(course: SuniTrainingCourse) {
    setDeleteError('');
    if (!window.confirm(`Xóa khóa "${course.title || course.code || course.id}"?`)) return;
    try {
      await deleteMutation.mutateAsync(String(course.id));
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    }
  }

  const loading = coursesQuery.isLoading;
  const isBackgroundLoading = programsQuery.isLoading;
  const hasQueryError = Boolean(coursesQuery.error || programsQuery.error);
  const errorMessage = getErrorMessage(coursesQuery.error || programsQuery.error || null);

  return (
    <div className="suni-native-page">
      <SectionHeader
        eye="VTraining"
        title="Khóa đào tạo"
        actions={<div className="suni-native-tabs"><Link to="/vtraining/programs">Chương trình</Link><Link className="is-active" to="/vtraining/courses">Khóa</Link><Link to="/vtraining/classes">Lớp</Link>{canManage ? <button className="btn btn-primary" onClick={() => setEditingCourse(null)}>Tạo khóa</button> : null}</div>}
      />
      {hasQueryError ? <div className="notice danger">{errorMessage}</div> : null}
      {deleteError ? <div className="notice danger">{deleteError}</div> : null}
      <Card title="Danh sách khóa" action={<Badge tone={hasQueryError ? 'danger' : loading || isBackgroundLoading ? 'warning' : 'success'}>{hasQueryError ? 'Lỗi kết nối' : loading ? 'Đang tải' : isBackgroundLoading ? 'Đang đồng bộ chương trình' : `${filteredCourses.length} dòng`}</Badge>}>
        <div className="suni-native-toolbar suni-native-toolbar-compact">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên, khách hàng, chương trình..." />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tất cả trạng thái</option><option value="draft">Nháp</option><option value="published">Đang mở</option><option value="locked">Đã khóa</option><option value="archived">Lưu trữ</option></select>
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setStatusFilter(''); }}>Xóa lọc</button>
        </div>
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Mã</th><th>Khóa</th><th>Chương trình</th><th>Khách hàng</th><th>Lịch</th><th>Hình thức</th><th>Lớp KH/TT</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9}>Đang tải dữ liệu VTraining...</td></tr> : null}
              {!loading && filteredCourses.length === 0 ? <tr><td colSpan={9}>Chưa có khóa phù hợp.</td></tr> : null}
              {!loading && filteredCourses.map((course) => (
                <tr
                  key={course.id}
                  className="suni-native-click-row"
                  tabIndex={0}
                  onClick={() => navigate(`/vtraining/courses/${course.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/vtraining/courses/${course.id}`);
                    }
                  }}
                >
                  <td><code>{course.code || '-'}</code></td>
                  <td><strong>{course.title || '-'}</strong></td>
                  <td>{course.courseProgram?.name || '-'}</td>
                  <td>{course.customerName || '-'}</td>
                  <td>{course.startAt || '-'} {course.endAt ? `- ${course.endAt}` : ''}</td>
                  <td>{course.format || '-'}</td>
                  <td>{course.plannedClassCount || 0} / {Array.isArray(course.klasses) ? course.klasses.length : 0}</td>
                  <td><Badge tone={statusTone(course.status)}>{statusLabel(course.status)}</Badge></td>
                  <td><div className="suni-native-row-actions"><Link className="btn btn-ghost btn-small" to={`/vtraining/courses/${course.id}`} onClick={(event) => event.stopPropagation()}>Mở</Link>{canManage ? <button className="btn btn-ghost btn-small" onClick={(event) => { event.stopPropagation(); setEditingCourse(course); }}>Sửa</button> : null}{canManage ? <button className="btn btn-danger btn-small" disabled={deleteMutation.isPending} onClick={(event) => { event.stopPropagation(); void handleDelete(course); }}>Xóa</button> : null}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editingCourse !== undefined ? <CourseModal initialCourse={editingCourse} programs={programs} onClose={() => setEditingCourse(undefined)} /> : null}
    </div>
  );
}

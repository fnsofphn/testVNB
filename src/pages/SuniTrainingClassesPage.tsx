import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Rocket, Trash2 } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import {
  SuniApiError,
  isClassAssignedToCustomer,
  suniTrainingApi,
  type SuniClassPayload,
  type SuniTrainingClass,
  type SuniTrainingCourse,
  type SuniUser,
} from '@/lib/suni';
import { queries } from '@/features/vtraining';
import { queries as sharedQueries } from '@/features/shared';
import { useAuth } from '@/contexts/AuthContext';
import { isTrainingAdminRole, normalizeAppRole } from '@/data/vcontent';

type ClassFormState = {
  id?: string;
  code: string;
  name: string;
  courseId: string;
  instructorId: string;
  instructorIds: string[];
  classManagerId: string;
  startAt: string;
  endAt: string;
  sessionCount: string;
  deliveryMode: string;
  location: string;
  opsTeamName: string;
  maxLearnerCount: string;
  currentLearnerCount: string;
  status: string;
  description: string;
};

const EMPTY_FORM: ClassFormState = {
  code: '',
  name: '',
  courseId: '',
  instructorId: '',
  instructorIds: [],
  classManagerId: '',
  startAt: '',
  endAt: '',
  sessionCount: '',
  deliveryMode: 'offline',
  location: '',
  opsTeamName: '',
  maxLearnerCount: '',
  currentLearnerCount: '0',
  status: 'pending',
  description: '',
};

const NAMED_VTRAINING_INSTRUCTORS = [
  {
    id: 'PROFILE_GIANG_VIEN_LEPHUNGHAO64_GMAIL_COM',
    email: 'lephunghao64@gmail.com',
    fullName: 'Lê Phụng Hào',
    title: 'Giảng viên',
    role: 'giang_vien',
  },
  {
    id: 'PROFILE_GIANG_VIEN_NGUYENTHUHAXINCHAO_GMAIL_COM',
    email: 'nguyenthuhaxinchao@gmail.com',
    fullName: 'Nguyễn Thu Hà',
    title: 'Giảng viên',
    role: 'giang_vien',
  },
] satisfies SuniUser[];

const NAMED_VTRAINING_INSTRUCTOR_EMAILS = new Set(
  NAMED_VTRAINING_INSTRUCTORS.map((user) => String(user.email || '').toLowerCase()),
);

const NAMED_VTRAINING_INSTRUCTOR_IDS = new Set(
  NAMED_VTRAINING_INSTRUCTORS.map((user) => user.id),
);

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với VTraining.';
}

function formatDate(value: string | null | undefined) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizeStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['active', 'open'].includes(normalized)) return 'active';
  if (['completed', 'closed', 'inactive'].includes(normalized)) return 'completed';
  if (normalized === 'archived') return 'archived';
  return 'pending';
}

function statusTone(status: string | null | undefined): 'danger' | 'warning' | 'success' | 'violet' | 'neutral' {
  const bucket = normalizeStatus(status);
  if (bucket === 'active') return 'success';
  if (bucket === 'completed') return 'neutral';
  if (bucket === 'archived') return 'neutral';
  return 'warning';
}

function statusLabel(status: string | null | undefined) {
  const bucket = normalizeStatus(status);
  if (bucket === 'active') return 'Đang mở';
  if (bucket === 'completed') return 'Đã đóng';
  if (bucket === 'archived') return 'Lưu trữ';
  return 'Sắp mở';
}

function getUserName(user: SuniUser | null | undefined) {
  return user?.fullName || user?.name || user?.email || '';
}

function userSearchText(user: SuniUser) {
  return `${getUserName(user)} ${user.email || ''} ${user.title || ''} ${user.role || ''}`.toLowerCase();
}

function normalizeUserText(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, '_');
}

function isInstructorUser(user: SuniUser) {
  const email = String(user.email || '').trim().toLowerCase();
  return NAMED_VTRAINING_INSTRUCTOR_EMAILS.has(email) || NAMED_VTRAINING_INSTRUCTOR_IDS.has(String(user.id || ''));
}

function ensureNamedInstructorUsers(users: SuniUser[]) {
  const byId = new Map<string, SuniUser>();
  users.forEach((user) => {
    if (user.id) byId.set(user.id, user);
  });
  NAMED_VTRAINING_INSTRUCTORS.forEach((user) => {
    const existing = byId.get(user.id);
    byId.set(user.id, { ...user, ...(existing || {}) });
  });
  return [...byId.values()];
}

function isClassManagerUser(user: SuniUser) {
  const role = normalizeUserText(user.role);
  const title = normalizeUserText(`${user.title || ''} ${getUserName(user)}`);
  if (['admin', 'training_ops_admin', 'manager_dao_tao', 'quan_ly_dao_tao', 'training_manager', 'training_admin', 'vtraining_manager', 'vtraining_admin'].includes(role)) return true;
  return title.includes('van_hanh') || title.includes('operation') || title.includes('operations') || title.includes('ops');
}

function filterAssignableUsers(users: SuniUser[], predicate: (user: SuniUser) => boolean, keyword: string, selectedId: string) {
  const normalizedKeyword = normalizeUserText(keyword);
  return users.filter((user) => {
    if (selectedId && String(user.id) === selectedId) return true;
    if (!predicate(user)) return false;
    if (!normalizedKeyword) return true;
    return normalizeUserText(userSearchText(user)).includes(normalizedKeyword);
  });
}

function toFormState(klass?: SuniTrainingClass | null): ClassFormState {
  if (!klass) return EMPTY_FORM;
  return {
    id: String(klass.id),
    code: klass.code || '',
    name: klass.name || '',
    courseId: klass.courseId || '',
    instructorId: klass.instructorId || '',
    instructorIds: klass.instructorIds?.length ? klass.instructorIds : (klass.instructorId ? [klass.instructorId] : []),
    classManagerId: klass.classManagerId || '',
    startAt: klass.startAt || '',
    endAt: klass.endAt || '',
    sessionCount: klass.sessionCount != null ? String(klass.sessionCount) : '',
    deliveryMode: klass.deliveryMode || 'offline',
    location: klass.location || '',
    opsTeamName: klass.opsTeamName || '',
    maxLearnerCount: klass.maxLearnerCount != null ? String(klass.maxLearnerCount) : '',
    currentLearnerCount: klass.currentLearnerCount != null ? String(klass.currentLearnerCount) : '0',
    status: normalizeStatus(klass.status),
    description: klass.description || '',
  };
}

function toPayload(form: ClassFormState): SuniClassPayload {
  const online = form.deliveryMode === 'online' || form.deliveryMode === 'e-learning';
  return {
    id: form.id,
    code: form.code.trim(),
    name: form.name.trim(),
    courseId: form.courseId || null,
    instructorId: form.instructorIds[0] || form.instructorId || null,
    instructorIds: form.instructorIds,
    classManagerId: form.classManagerId || null,
    startAt: form.startAt || null,
    endAt: form.endAt || null,
    sessionCount: form.sessionCount ? Number(form.sessionCount) : null,
    deliveryMode: form.deliveryMode,
    locationType: online ? 'online' : 'offline',
    location: form.location.trim() || null,
    opsTeamName: form.opsTeamName.trim() || null,
    maxLearnerCount: form.maxLearnerCount ? Number(form.maxLearnerCount) : null,
    currentLearnerCount: form.currentLearnerCount ? Number(form.currentLearnerCount) : 0,
    status: form.status || 'pending',
    description: form.description.trim() || null,
  };
}

function ClassModal({
  initialClass,
  courses,
  users,
  onClose,
}: {
  initialClass: SuniTrainingClass | null;
  courses: SuniTrainingCourse[];
  users: SuniUser[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ClassFormState>(() => toFormState(initialClass));
  const [errorMessage, setErrorMessage] = useState('');
  const [instructorSearch, setInstructorSearch] = useState('');
  const [classManagerSearch, setClassManagerSearch] = useState('');
  const isEdit = Boolean(form.id);
  const assignableUsers = useMemo(() => ensureNamedInstructorUsers(users), [users]);
  const instructorUsers = useMemo(
    () => filterAssignableUsers(assignableUsers, isInstructorUser, instructorSearch, ''),
    [assignableUsers, instructorSearch],
  );
  const selectedInstructorUsers = useMemo(
    () => form.instructorIds
      .map((id) => assignableUsers.find((user) => user.id === id))
      .filter(Boolean) as SuniUser[],
    [assignableUsers, form.instructorIds],
  );
  const classManagerUsers = useMemo(
    () => filterAssignableUsers(users, isClassManagerUser, classManagerSearch, form.classManagerId),
    [form.classManagerId, classManagerSearch, users],
  );
  const saveMutation = useMutation({
    mutationFn: (payload: SuniClassPayload) => suniTrainingApi.saveClass(payload),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queries.classes() }),
        queryClient.invalidateQueries({ queryKey: queries.courses() }),
      ]);
    },
  });

  function setField<K extends keyof ClassFormState>(field: K, value: ClassFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleInstructor(userId: string) {
    const normalizedId = String(userId || '').trim();
    if (!normalizedId) return;
    setForm((current) => {
      const exists = current.instructorIds.includes(normalizedId);
      const instructorIds = exists
        ? current.instructorIds.filter((id) => id !== normalizedId)
        : [...current.instructorIds, normalizedId];
      return {
        ...current,
        instructorIds,
        instructorId: instructorIds[0] || '',
      };
    });
  }

  function addInstructor(userId: string) {
    const normalizedId = String(userId || '').trim();
    if (!normalizedId) return;
    setForm((current) => {
      if (current.instructorIds.includes(normalizedId)) return current;
      const instructorIds = [...current.instructorIds, normalizedId];
      return {
        ...current,
        instructorIds,
        instructorId: instructorIds[0] || '',
      };
    });
    setInstructorSearch('');
  }

  function chooseClassManager(userId: string) {
    const user = users.find((entry) => entry.id === userId);
    setField('classManagerId', userId);
    setClassManagerSearch(user ? getUserName(user) || user.email || user.id : '');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');
    if (!form.code.trim()) return setErrorMessage('Cần nhập mã lớp.');
    if (!form.name.trim()) return setErrorMessage('Cần nhập tên lớp.');
    try {
      const savedClass = await saveMutation.mutateAsync(toPayload(form));
      await queryClient.invalidateQueries({ queryKey: queries.classInstructorAssignments(savedClass.id) });
      await queryClient.invalidateQueries({ queryKey: queries.instructorLessonGrants(savedClass.id) });
      onClose();
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  return (
    <div className="suni-native-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="suni-native-modal" onSubmit={(event) => void handleSubmit(event)}>
        <div className="suni-native-modal-head">
          <div>
            <span>VTraining</span>
            <h3>{isEdit ? 'Sửa lớp đào tạo' : 'Tạo lớp đào tạo'}</h3>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>Đóng</button>
        </div>
        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}
        <div className="form-grid">
          <label><span>Mã lớp</span><input value={form.code} onChange={(event) => setField('code', event.target.value)} placeholder="VD: VT26-K01-L01" /></label>
          <label><span>Khóa đào tạo</span><select value={form.courseId} onChange={(event) => setField('courseId', event.target.value)}><option value="">Chưa gắn khóa</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.title || course.code}</option>)}</select></label>
          <label className="full"><span>Tên lớp</span><input value={form.name} onChange={(event) => setField('name', event.target.value)} /></label>
          <div className="form-field">
            <span>Giảng viên</span>
            <div className="vtraining-instructor-picker" aria-label="Chọn nhiều giảng viên">
              {selectedInstructorUsers.length ? (
                <div className="vtraining-instructor-selected">
                  {selectedInstructorUsers.map((user) => (
                    <button type="button" key={user.id} onClick={() => toggleInstructor(user.id)}>
                      {getUserName(user) || user.email || user.id} <span>×</span>
                    </button>
                  ))}
                </div>
              ) : <div className="muted-text">Chưa chọn giảng viên</div>}
              <select value="" onChange={(event) => addInstructor(event.target.value)}>
                <option value="">Chọn giảng viên...</option>
                {instructorUsers
                  .filter((user) => !form.instructorIds.includes(user.id))
                  .map((user) => (
                    <option key={user.id} value={user.id}>{getUserName(user) || user.email || user.id}</option>
                  ))}
              </select>
              <input value={instructorSearch} onChange={(event) => setInstructorSearch(event.target.value)} placeholder="Tìm trong danh sách giảng viên..." />
            </div>
          </div>
          <label>
            <span>Quản lý lớp</span>
            <input value={classManagerSearch} onChange={(event) => setClassManagerSearch(event.target.value)} placeholder="Tìm quản lý lớp..." />
            <select value={form.classManagerId} onChange={(event) => chooseClassManager(event.target.value)}>
              <option value="">Chưa chọn</option>
              {classManagerUsers.map((user) => <option key={user.id} value={user.id}>{getUserName(user) || user.email || user.id}</option>)}
            </select>
          </label>
          <label><span>Từ ngày</span><input type="date" value={form.startAt} onChange={(event) => setField('startAt', event.target.value)} /></label>
          <label><span>Đến ngày</span><input type="date" value={form.endAt} onChange={(event) => setField('endAt', event.target.value)} /></label>
          <label><span>Số buổi</span><input type="number" min="0" value={form.sessionCount} onChange={(event) => setField('sessionCount', event.target.value)} /></label>
          <label><span>Hình thức</span><select value={form.deliveryMode} onChange={(event) => setField('deliveryMode', event.target.value)}><option value="offline">Offline</option><option value="online">Online</option><option value="blended">Blended</option><option value="e-learning">E-learning</option></select></label>
          <label><span>Địa điểm / link</span><input value={form.location} onChange={(event) => setField('location', event.target.value)} /></label>
          <label><span>Ê-kíp vận hành</span><input value={form.opsTeamName} onChange={(event) => setField('opsTeamName', event.target.value)} /></label>
          <label><span>Sĩ số tối đa</span><input type="number" min="0" value={form.maxLearnerCount} onChange={(event) => setField('maxLearnerCount', event.target.value)} /></label>
          <label><span>Học viên hiện tại</span><input type="number" min="0" value={form.currentLearnerCount} onChange={(event) => setField('currentLearnerCount', event.target.value)} /></label>
          <label><span>Trạng thái</span><select value={form.status} onChange={(event) => setField('status', event.target.value)}><option value="pending">Sắp mở</option><option value="active">Đang mở</option><option value="completed">Đã đóng</option><option value="archived">Lưu trữ</option></select></label>
          <label className="full"><span>Mô tả</span><textarea value={form.description} onChange={(event) => setField('description', event.target.value)} /></label>
        </div>
        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo lớp'}</button>
        </div>
      </form>
    </div>
  );
}

export function SuniTrainingClassesPage() {
  const { profile } = useAuth();
  const canManage = isTrainingAdminRole(profile?.role);
  const viewerRole = normalizeAppRole(profile?.role);
  const isCustomerView = ['client', 'client_director'].includes(viewerRole);
  const isStudentView = viewerRole === 'hoc_vien';
  const isInstructorView = viewerRole === 'giang_vien';
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingClass, setEditingClass] = useState<SuniTrainingClass | null | undefined>(undefined);
  const [deleteError, setDeleteError] = useState('');

  const classesQuery = useQuery({
    queryKey: isStudentView
      ? queries.studentClassesScoped(profile?.id || '', profile?.email || '', profile?.studentCode || '', profile?.studentClass || '', profile?.studentGroup || '')
      : isCustomerView
        ? queries.customerClasses(profile?.id || '')
        : isInstructorView
          ? queries.instructorClasses(profile?.id || '')
          : queries.classes(),
    queryFn: () => {
      if (isStudentView) return suniTrainingApi.listStudentClasses({
        id: profile?.id,
        email: profile?.email,
        studentCode: profile?.studentCode,
        studentClass: profile?.studentClass,
        studentGroup: profile?.studentGroup,
      });
      if (isCustomerView) return suniTrainingApi.listCustomerClasses(profile?.id);
      if (isInstructorView) return suniTrainingApi.listInstructorClasses(profile?.id);
      return suniTrainingApi.listClasses();
    },
    enabled: isStudentView
      ? Boolean(profile?.id || profile?.email || profile?.studentCode || profile?.studentClass || profile?.studentGroup)
      : isCustomerView
        ? Boolean(profile?.id)
        : isInstructorView
          ? Boolean(profile?.id)
          : true,
    staleTime: isStudentView ? 5 * 60 * 1000 : 0,
  });
  const coursesQuery = useQuery({ queryKey: queries.courses(), queryFn: () => suniTrainingApi.listCourses(), enabled: canManage });
  const usersQuery = useQuery({ queryKey: sharedQueries.users(), queryFn: () => suniTrainingApi.listUsers(), enabled: canManage, staleTime: 60 * 1000 });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => suniTrainingApi.deleteClass(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queries.classes() }),
        queryClient.invalidateQueries({ queryKey: queries.courses() }),
      ]);
    },
  });

  const classes = isCustomerView
    ? (classesQuery.data || []).filter((klass) => isClassAssignedToCustomer(klass, profile?.id))
    : classesQuery.data || [];
  const courses = isStudentView ? [] : coursesQuery.data || [];
  const users = usersQuery.data || [];
  const filteredClasses = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return classes.filter((klass) => {
      const instructorNames = (klass.instructors?.length ? klass.instructors : klass.instructor ? [klass.instructor] : [])
        .map((user) => getUserName(user))
        .join(' ');
      const haystack = `${klass.code || ''} ${klass.name || ''} ${klass.course?.title || ''} ${klass.location || ''} ${instructorNames}`.toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (statusFilter && normalizeStatus(klass.status) !== statusFilter) return false;
      return true;
    });
  }, [classes, search, statusFilter]);

  async function handleDelete(klass: SuniTrainingClass) {
    setDeleteError('');
    if (!window.confirm(`Xóa lớp "${klass.name || klass.code || klass.id}"?`)) return;
    try {
      await deleteMutation.mutateAsync(String(klass.id));
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    }
  }

  const loading = classesQuery.isLoading;
  const isBackgroundLoading = (!isStudentView && coursesQuery.isLoading) || usersQuery.isLoading;
  const hasQueryError = Boolean(classesQuery.error || coursesQuery.error || usersQuery.error);
  const errorMessage = getErrorMessage(classesQuery.error || coursesQuery.error || usersQuery.error || null);
  const classOpenPath = (klass: SuniTrainingClass) => isInstructorView
    ? `/vtraining/classes/${klass.id}/giaoan`
    : `/vtraining/classes/${klass.id}`;

  return (
    <div className={`suni-native-page suni-native-page-classes ${isStudentView ? 'is-student-view' : ''}`}>
      <SectionHeader
        eye="VTraining"
        title="Lớp đào tạo"
        actions={canManage ? <div className="suni-native-tabs"><Link to="/vtraining/programs">Chương trình</Link><Link to="/vtraining/courses">Khóa</Link><Link className="is-active" to="/vtraining/classes">Lớp</Link><button className="btn btn-primary" onClick={() => setEditingClass(null)}>Tạo lớp</button></div> : null}
      />
      {hasQueryError ? <div className="notice danger">{errorMessage}</div> : null}
      {deleteError ? <div className="notice danger">{deleteError}</div> : null}
      <Card title="Danh sách lớp" action={<Badge tone={hasQueryError ? 'danger' : loading || isBackgroundLoading ? 'warning' : 'success'}>{hasQueryError ? 'Lỗi kết nối' : loading ? 'Đang tải' : isBackgroundLoading ? 'Đang đồng bộ dữ liệu phụ' : `${filteredClasses.length} dòng`}</Badge>}>
        <div className="suni-native-toolbar suni-native-toolbar-compact">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên, khóa, địa điểm, giảng viên..." />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tất cả trạng thái</option><option value="pending">Sắp mở</option><option value="active">Đang mở</option><option value="completed">Đã đóng</option><option value="archived">Lưu trữ</option></select>
          <button className="btn btn-ghost" onClick={() => { setSearch(''); setStatusFilter(''); }}>Xóa lọc</button>
        </div>
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table suni-native-classes-table">
            <colgroup>
              <col className="classes-col-code" />
              <col className="classes-col-name" />
              <col className="classes-col-course" />
              <col className="classes-col-date" />
              <col className="classes-col-date" />
              <col className="classes-col-status" />
              {canManage ? <col className="classes-col-actions" /> : null}
            </colgroup>
            <thead><tr><th>Mã</th><th>Lớp</th><th>Khóa</th><th>Từ ngày</th><th>Đến ngày</th><th>Trạng thái</th>{canManage ? <th>Thao tác</th> : null}</tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={canManage ? 7 : 6}>Đang tải dữ liệu VTraining...</td></tr> : null}
              {!loading && filteredClasses.length === 0 ? <tr><td colSpan={canManage ? 7 : 6}>Chưa có lớp phù hợp.</td></tr> : null}
              {!loading && filteredClasses.map((klass) => (
                <tr key={klass.id}>
                  <td><code>{klass.code || '-'}</code></td>
                  <td><Link to={classOpenPath(klass)} target={isInstructorView ? undefined : '_blank'} rel={isInstructorView ? undefined : 'noopener noreferrer'}><strong>{klass.name || '-'}</strong></Link>{klass.description ? <span>{klass.description}</span> : null}</td>
                  <td>{klass.course?.title || '-'}</td>
                  <td>{formatDate(klass.startAt)}</td>
                  <td>{formatDate(klass.endAt)}</td>
                  <td><Badge tone={statusTone(klass.status)}>{statusLabel(klass.status)}</Badge></td>
                  {canManage ? (
                    <td>
                      <div className="suni-native-row-actions suni-native-row-actions-icons">
                        <Link className="suni-native-action-icon" to={`/vtraining/classes/${klass.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Mở lớp ${klass.name || klass.code || klass.id}`} title="Mở">
                          <Rocket size={16} />
                        </Link>
                        <button className="suni-native-action-icon" type="button" onClick={() => setEditingClass(klass)} aria-label={`Sửa lớp ${klass.name || klass.code || klass.id}`} title="Sửa">
                          <Pencil size={16} />
                        </button>
                        <button className="suni-native-action-icon is-danger" type="button" disabled={deleteMutation.isPending} onClick={() => void handleDelete(klass)} aria-label={`Xóa lớp ${klass.name || klass.code || klass.id}`} title="Xóa">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {canManage && editingClass !== undefined ? <ClassModal initialClass={editingClass} courses={courses} users={users} onClose={() => setEditingClass(undefined)} /> : null}
    </div>
  );
}

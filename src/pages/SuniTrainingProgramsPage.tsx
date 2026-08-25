import { Fragment, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import {
  SuniApiError,
  suniTrainingApi,
  type SuniProgramPayload,
  type SuniTrainingProgram,
  type SuniUser,
} from '@/lib/suni';
import { queries } from '@/features/vtraining';
import { queries as sharedQueries } from '@/features/shared';
import { useAuth } from '@/contexts/AuthContext';
import { isTrainingAdminRole, normalizeAppRole } from '@/data/vcontent';

type ProgramFormState = {
  id?: string;
  code: string;
  name: string;
  customerName: string;
  executionYear: string;
  plannedCourseCount: string;
  description: string;
  ownerId: string;
  learnerGroup: string;
  status: string;
};

const EMPTY_FORM: ProgramFormState = {
  code: '',
  name: '',
  customerName: '',
  executionYear: String(new Date().getFullYear()),
  plannedCourseCount: '0',
  description: '',
  ownerId: '',
  learnerGroup: 'staff',
  status: 'not_started',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Đang triển khai',
  published: 'Đang triển khai',
  in_progress: 'Đang triển khai',
  ongoing: 'Đang triển khai',
  running: 'Đang triển khai',
  draft: 'Chưa bắt đầu',
  pending: 'Chưa bắt đầu',
  inactive: 'Chưa bắt đầu',
  not_started: 'Chưa bắt đầu',
  completed: 'Hoàn thành',
  closed: 'Hoàn thành',
  archived: 'Lưu trữ',
};

const LEARNER_GROUP_LABELS: Record<string, string> = {
  leadership: 'Lãnh đạo',
  manager: 'Cán bộ quản lý',
  staff: 'Nhân viên',
};

function getErrorMessage(error: unknown) {
  if (error instanceof SuniApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Không thực hiện được thao tác với VTraining.';
}

function normalizeStatus(status: string | null | undefined) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['active', 'published', 'ongoing', 'running', 'in_progress'].includes(normalized)) return 'in_progress';
  if (['completed', 'closed'].includes(normalized)) return 'completed';
  if (['archived'].includes(normalized)) return 'archived';
  return 'not_started';
}

function statusTone(status: string | null | undefined): 'danger' | 'warning' | 'success' | 'violet' | 'neutral' {
  const bucket = normalizeStatus(status);
  if (bucket === 'in_progress') return 'violet';
  if (bucket === 'completed') return 'success';
  if (bucket === 'archived') return 'neutral';
  return 'warning';
}

function statusLabel(status: string | null | undefined) {
  const bucket = normalizeStatus(status);
  return STATUS_LABELS[bucket] || STATUS_LABELS[String(status || '').trim().toLowerCase()] || 'Chưa bắt đầu';
}

function getOwnerName(program: SuniTrainingProgram, usersById: Map<string, SuniUser>) {
  const explicitName =
    program.owner?.fullName ||
    program.owner?.name ||
    program.ownerName ||
    program.ownerFullName ||
    program.coordinatorName ||
    program.managerName;
  if (explicitName) return explicitName;
  const ownerId = String(program.ownerId || '');
  if (!ownerId) return '';
  const user = usersById.get(ownerId);
  return user?.fullName || user?.name || user?.email || '';
}

function toFormState(program?: SuniTrainingProgram | null): ProgramFormState {
  if (!program) return EMPTY_FORM;
  return {
    id: String(program.id),
    code: program.code || '',
    name: program.name || '',
    customerName: program.customerName || '',
    executionYear: program.executionYear ? String(program.executionYear) : String(new Date().getFullYear()),
    plannedCourseCount: program.plannedCourseCount != null ? String(program.plannedCourseCount) : '0',
    description: program.description || '',
    ownerId: program.ownerId ? String(program.ownerId) : '',
    learnerGroup: program.learnerGroup || 'staff',
    status: normalizeStatus(program.status),
  };
}

function toPayload(form: ProgramFormState): SuniProgramPayload {
  return {
    id: form.id,
    code: form.code.trim(),
    name: form.name.trim(),
    customerName: form.customerName.trim() || null,
    executionYear: form.executionYear ? Number(form.executionYear) : null,
    plannedCourseCount: form.plannedCourseCount ? Number(form.plannedCourseCount) : 0,
    description: form.description.trim() || null,
    ownerId: form.ownerId,
    learnerGroup: form.learnerGroup || 'staff',
    status: form.status || 'not_started',
  };
}

function ProgramModal({
  initialProgram,
  users,
  onClose,
}: {
  initialProgram: SuniTrainingProgram | null;
  users: SuniUser[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProgramFormState>(() => toFormState(initialProgram));
  const [errorMessage, setErrorMessage] = useState('');
  const isEdit = Boolean(form.id);

  const saveMutation = useMutation({
    mutationFn: (payload: SuniProgramPayload) => suniTrainingApi.saveProgram(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.programs() });
      onClose();
    },
  });

  function setField<K extends keyof ProgramFormState>(field: K, value: ProgramFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    if (!form.code.trim()) {
      setErrorMessage('Cần nhập mã chương trình.');
      return;
    }
    if (!form.name.trim()) {
      setErrorMessage('Cần nhập tên chương trình.');
      return;
    }
    if (!form.ownerId) {
      setErrorMessage('Cần chọn người phụ trách.');
      return;
    }

    try {
      await saveMutation.mutateAsync(toPayload(form));
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
            <h3>{isEdit ? 'Sửa chương trình đào tạo' : 'Tạo chương trình đào tạo'}</h3>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>Đóng</button>
        </div>

        {errorMessage ? <div className="notice danger">{errorMessage}</div> : null}

        <div className="form-grid">
          <label>
            <span>Mã chương trình</span>
            <input value={form.code} onChange={(event) => setField('code', event.target.value)} placeholder="VD: VT-2026-01" />
          </label>
          <label>
            <span>Năm thực hiện</span>
            <input type="number" value={form.executionYear} onChange={(event) => setField('executionYear', event.target.value)} />
          </label>
          <label className="full">
            <span>Tên chương trình</span>
            <input value={form.name} onChange={(event) => setField('name', event.target.value)} placeholder="VD: Chương trình phát triển năng lực quản lý" />
          </label>
          <label>
            <span>Khách hàng / Đơn vị</span>
            <input value={form.customerName} onChange={(event) => setField('customerName', event.target.value)} placeholder="VD: EVNSPC" />
          </label>
          <label>
            <span>Số khóa kế hoạch</span>
            <input type="number" min="0" value={form.plannedCourseCount} onChange={(event) => setField('plannedCourseCount', event.target.value)} />
          </label>
          <label>
            <span>Người phụ trách</span>
            <select value={form.ownerId} onChange={(event) => setField('ownerId', event.target.value)}>
              <option value="">Chọn người phụ trách</option>
              {users.map((user) => (
                <option value={user.id} key={user.id}>
                  {user.fullName || user.name || user.email || `User #${user.id}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Đối tượng học viên</span>
            <select value={form.learnerGroup} onChange={(event) => setField('learnerGroup', event.target.value)}>
              <option value="leadership">Lãnh đạo</option>
              <option value="manager">Cán bộ quản lý</option>
              <option value="staff">Nhân viên</option>
            </select>
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={form.status} onChange={(event) => setField('status', event.target.value)}>
              <option value="not_started">Chưa bắt đầu</option>
              <option value="in_progress">Đang triển khai</option>
              <option value="completed">Hoàn thành</option>
            </select>
          </label>
          <label className="full">
            <span>Mô tả</span>
            <textarea value={form.description} onChange={(event) => setField('description', event.target.value)} />
          </label>
        </div>

        <div className="action-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
          <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo chương trình'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function SuniTrainingProgramsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const canManage = isTrainingAdminRole(profile?.role);
  const isCustomerView = ['client', 'client_director'].includes(normalizeAppRole(profile?.role));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [editingProgram, setEditingProgram] = useState<SuniTrainingProgram | null | undefined>(undefined);
  const [deleteError, setDeleteError] = useState('');

  const programsQuery = useQuery({
    queryKey: isCustomerView ? queries.customerPrograms(profile?.id || '') : queries.programs(),
    queryFn: () => isCustomerView ? suniTrainingApi.listCustomerPrograms(profile?.id) : suniTrainingApi.listPrograms(),
    enabled: !isCustomerView || Boolean(profile?.id),
  });

  const usersQuery = useQuery({
    queryKey: sharedQueries.users(),
    queryFn: () => suniTrainingApi.listUsers(),
    enabled: canManage,
    staleTime: 60 * 1000,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => suniTrainingApi.deleteProgram(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queries.programs() });
    },
  });

  const programs = programsQuery.data || [];
  const users = usersQuery.data || [];
  const usersById = useMemo(() => new Map(users.map((user) => [String(user.id), user])), [users]);

  const customers = useMemo(() => {
    return Array.from(new Set(programs.map((program) => String(program.customerName || '').trim()).filter(Boolean))).sort();
  }, [programs]);

  const filteredPrograms = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return programs.filter((program) => {
      const ownerName = getOwnerName(program, usersById);
      const haystack = `${program.code || ''} ${program.name || ''} ${program.customerName || ''} ${ownerName}`.toLowerCase();
      if (keyword && !haystack.includes(keyword)) return false;
      if (statusFilter && normalizeStatus(program.status) !== statusFilter) return false;
      if (customerFilter && program.customerName !== customerFilter) return false;
      return true;
    });
  }, [customerFilter, programs, search, statusFilter, usersById]);
  const selectedProgramCourses = [] as any[];

  async function handleDelete(program: SuniTrainingProgram) {
    setDeleteError('');
    if (!window.confirm(`Xóa chương trình "${program.name || program.code || program.id}"?`)) return;
    try {
      await deleteMutation.mutateAsync(String(program.id));
    } catch (error) {
      setDeleteError(getErrorMessage(error));
    }
  }

  const loading = programsQuery.isLoading;
  const isBackgroundLoading = usersQuery.isLoading;
  const errorMessage = getErrorMessage(programsQuery.error || usersQuery.error || null);
  const hasQueryError = Boolean(programsQuery.error || usersQuery.error);

  return (
    <div className="suni-native-page">
      <SectionHeader
        eye="VTraining"
        title="Chương trình đào tạo"
        actions={<div className="suni-native-tabs"><Link className="is-active" to="/vtraining/programs">Chương trình</Link><Link to="/vtraining/courses">Khóa</Link><Link to="/vtraining/classes">Lớp</Link>{canManage ? <button className="btn btn-primary" onClick={() => setEditingProgram(null)}>Tạo chương trình</button> : null}</div>}
      />

      {hasQueryError ? <div className="notice danger">{errorMessage}</div> : null}
      {deleteError ? <div className="notice danger">{deleteError}</div> : null}

      <Card
        title="Danh sách chương trình"
        action={<Badge tone={hasQueryError ? 'danger' : loading || isBackgroundLoading ? 'warning' : 'success'}>{hasQueryError ? 'Lỗi kết nối' : loading ? 'Đang tải' : isBackgroundLoading ? 'Đang đồng bộ phụ trách' : `${filteredPrograms.length} dòng`}</Badge>}
      >
        <div className="suni-native-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên, khách hàng, owner..." />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="not_started">Chưa bắt đầu</option>
            <option value="in_progress">Đang triển khai</option>
            <option value="completed">Hoàn thành</option>
            <option value="archived">Lưu trữ</option>
          </select>
          <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
            <option value="">Tất cả khách hàng</option>
            {customers.map((customer) => <option key={customer} value={customer}>{customer}</option>)}
          </select>
          <button className="btn btn-ghost" onClick={() => {
            setSearch('');
            setStatusFilter('');
            setCustomerFilter('');
          }}>Xóa lọc</button>
        </div>

        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead>
              <tr>
                <th>Mã</th>
                <th>Chương trình</th>
                <th>Khách hàng</th>
                <th>Năm</th>
                <th>Owner</th>
                <th>Đối tượng</th>
                <th>Khóa/Lớp</th>
                <th>Trạng thái</th>
                {canManage ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canManage ? 9 : 8}>Đang tải dữ liệu VTraining...</td></tr>
              ) : null}
              {!loading && filteredPrograms.length === 0 ? (
                <tr><td colSpan={canManage ? 9 : 8}>Chưa có chương trình phù hợp.</td></tr>
              ) : null}
              {!loading && filteredPrograms.map((program) => (
                <Fragment key={program.id}>
                  <tr
                    key={program.id}
                    className="suni-native-click-row"
                    tabIndex={0}
                    onClick={() => navigate(`/vtraining/programs/${program.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/vtraining/programs/${program.id}`);
                      }
                    }}
                  >
                    <td><code>{program.code || '-'}</code></td>
                    <td>
                      <strong>{program.name || '-'}</strong>
                    </td>
                    <td>{program.customerName || '-'}</td>
                    <td>{program.executionYear || '-'}</td>
                    <td>{getOwnerName(program, usersById) || '-'}</td>
                    <td>{LEARNER_GROUP_LABELS[String(program.learnerGroup || 'staff')] || 'Nhân viên'}</td>
                    <td>{Array.isArray(program.courses) ? program.courses.length : program.plannedCourseCount || 0} / {Array.isArray(program.klasses) ? program.klasses.length : 0}</td>
                    <td><Badge tone={statusTone(program.status)}>{statusLabel(program.status)}</Badge></td>
                    {canManage ? <td>
                      <div className="suni-native-row-actions">
                        <button className="btn btn-ghost btn-small" onClick={(event) => { event.stopPropagation(); setEditingProgram(program); }}>Sửa</button>
                        <button className="btn btn-danger btn-small" disabled={deleteMutation.isPending} onClick={(event) => { event.stopPropagation(); void handleDelete(program); }}>Xóa</button>
                      </div>
                    </td> : null}
                  </tr>
                  {false ? (
                    <tr className="suni-native-inline-detail-row">
                      <td colSpan={9}>
                        <div className="suni-native-inline-detail">
                          <div className="suni-native-inline-detail-head">
                            <strong>Khóa trong chương trình: {program.name || program.code || 'Chương trình đào tạo'}</strong>
                            <Badge tone={selectedProgramCourses.length ? 'success' : 'warning'}>{selectedProgramCourses.length} khóa</Badge>
                          </div>
                          {selectedProgramCourses.length ? (
                            <div className="suni-native-linked-list">
                              {selectedProgramCourses.map((course) => (
                                <Link className="suni-native-linked-row" to={`/vtraining/courses/${course.id}`} key={course.id}>
                                  <div>
                                    <code>{course.code || '-'}</code>
                                    <strong>{course.title || course.name || 'Khóa đào tạo'}</strong>
                                    <span>{course.description || course.objective || 'Chưa có mô tả.'}</span>
                                  </div>
                                  <div>
                                    <span>{course.startAt || '-'}{course.endAt ? ` - ${course.endAt}` : ''}</span>
                                    <span>{course.format || '-'}</span>
                                  </div>
                                  <div>
                                    <span>{course.plannedClassCount || 0} KH / {Array.isArray(course.klasses) ? course.klasses.length : 0} TT</span>
                                    <Badge tone={statusTone(course.status)}>{statusLabel(course.status)}</Badge>
                                  </div>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <div className="suni-native-linked-empty">
                              <strong>Chưa có khóa nào trong chương trình này.</strong>
                              <span>Mở tab Khóa để tạo khóa và gắn vào chương trình đào tạo này.</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {canManage && editingProgram !== undefined ? (
        <ProgramModal
          initialProgram={editingProgram}
          users={users}
          onClose={() => setEditingProgram(undefined)}
        />
      ) : null}
    </div>
  );
}

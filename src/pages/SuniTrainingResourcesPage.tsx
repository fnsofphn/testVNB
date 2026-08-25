import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Edit3, Eye, Plus, Search, Trash2, UserCheck } from 'lucide-react';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import {
  createProfile,
  deleteProfile,
  listProfiles,
  listTrainingResourceDetails,
  updateProfile,
  upsertTrainingResourceDetail,
  type ProfileRow,
  type TrainingResourceDetailRow,
} from '@/services/vcontent';
import { isTrainingAdminRole, normalizeAppRole } from '@/data/vcontent';

type ResourceKind = 'instructors' | 'collaborators' | 'learners';

const RESOURCE_ROLE_OPTIONS = [
  { value: 'giang_vien', label: 'Giảng viên' },
  { value: 'specialist', label: 'Specialist' },
  { value: 'pm', label: 'PM' },
  { value: 'content_manager', label: 'Content manager' },
  { value: 'production_manager', label: 'Production manager' },
  { value: 'ctv', label: 'CTV' },
  { value: 'hoc_vien', label: 'Học viên' },
];

type ResourceFormState = {
  fullName: string;
  email: string;
  title: string;
  role: string;
  studentClass: string;
  studentGroup: string;
  studentCode: string;
  active: boolean;
};

type ResourceDetailFormState = {
  specialty: string;
  fee: string;
  contractNo: string;
  contractStatus: string;
  sessions: string;
  rating: string;
  phone: string;
  bank: string;
  contractStart: string;
  contractEnd: string;
  contractValue: string;
  paidValue: string;
  collaboratorType: string;
  works: ResourceWorkRow[];
  payments: ResourcePaymentRow[];
  notes: string;
};

type ResourceWorkRow = {
  course: string;
  className: string;
  role: string;
  sessions: string;
  status: string;
};

type ResourcePaymentRow = {
  month: string;
  amount: string;
  status: string;
  paidDate: string;
};

const RESOURCE_META: Record<ResourceKind, { eye: string; title: string; defaultRole: string; defaultTitle: string; emptyText: string }> = {
  instructors: {
    eye: 'Quản lý nguồn lực',
    title: 'Giảng viên',
    defaultRole: 'giang_vien',
    defaultTitle: 'Giảng viên',
    emptyText: 'Chưa có giảng viên trong danh sách.',
  },
  collaborators: {
    eye: 'Quản lý nguồn lực',
    title: 'Cộng tác viên',
    defaultRole: 'ctv',
    defaultTitle: 'Cộng tác viên',
    emptyText: 'Chưa có cộng tác viên trong danh sách.',
  },
  learners: {
    eye: 'Quản lý nguồn lực',
    title: 'Học viên',
    defaultRole: 'hoc_vien',
    defaultTitle: 'Học viên',
    emptyText: 'Chưa có học viên trong danh sách.',
  },
};

function emptyResourceForm(kind: ResourceKind): ResourceFormState {
  const meta = RESOURCE_META[kind];
  return {
    fullName: '',
    email: '',
    title: meta.defaultTitle,
    role: meta.defaultRole,
    studentClass: '',
    studentGroup: '',
    studentCode: '',
    active: true,
  };
}

function profileToForm(profile: ProfileRow, kind: ResourceKind): ResourceFormState {
  return {
    fullName: profile.full_name || '',
    email: profile.email || '',
    title: profile.title || RESOURCE_META[kind].defaultTitle,
    role: profile.role || RESOURCE_META[kind].defaultRole,
    studentClass: profile.student_class || '',
    studentGroup: profile.student_group || '',
    studentCode: profile.student_code || '',
    active: profile.active !== false,
  };
}

function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesKind(profile: ProfileRow, kind: ResourceKind) {
  const role = normalizeText(profile.role);
  const haystack = normalizeText(`${profile.role || ''} ${profile.title || ''} ${profile.full_name || ''}`);
  if (kind === 'learners') return role === 'hoc_vien';
  if (kind === 'instructors') {
    return role === 'giang_vien' || ['giang vien', 'giao vien', 'lecturer', 'instructor', 'trainer', 'facilitator'].some((token) => haystack.includes(token));
  }
  return role === 'ctv' || ['cong tac vien', 'ctv', 'collaborator', 'freelancer'].some((token) => haystack.includes(token));
}

function normalizeResourceRole(value: string, kind: ResourceKind) {
  const normalized = normalizeText(value).replace(/\s+/g, '_').replace(/-/g, '_');
  if (kind === 'learners') return 'hoc_vien';
  if (['admin', 'content_manager', 'production_manager', 'pm', 'specialist', 'designer', 'vc', 'qc', 'ctv', 'giang_vien'].includes(normalized)) return normalized;
  return RESOURCE_META[kind].defaultRole;
}

function matchesSearch(profile: ProfileRow, keyword: string) {
  if (!keyword.trim()) return true;
  const haystack = normalizeText(`${profile.full_name || ''} ${profile.email || ''} ${profile.title || ''} ${profile.student_class || ''} ${profile.student_group || ''} ${profile.student_code || ''}`);
  return normalizeText(keyword).split(' ').filter(Boolean).every((token) => haystack.includes(token));
}

function resourceCode(profile: ProfileRow) {
  return profile.student_code || profile.student_group || profile.student_class || profile.id;
}

function emptyWorkRow(kind: ResourceKind): ResourceWorkRow {
  return {
    course: '',
    className: kind === 'collaborators' ? '' : '',
    role: '',
    sessions: kind === 'instructors' ? '' : '',
    status: '',
  };
}

function emptyPaymentRow(): ResourcePaymentRow {
  return {
    month: '',
    amount: '',
    status: '',
    paidDate: '',
  };
}

function splitDetailLines(value: string) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseWorkRows(value: unknown, kind: ResourceKind): ResourceWorkRow[] {
  if (Array.isArray(value)) {
    return value.map((row) => ({
      course: String(row?.course ?? ''),
      className: String(row?.className ?? ''),
      role: String(row?.role ?? ''),
      sessions: String(row?.sessions ?? ''),
      status: String(row?.status ?? ''),
    }));
  }

  return splitDetailLines(String(value || '')).map((line) => {
    const [course = '', second = '', third = '', fourth = ''] = line.split('|').map((part) => part.trim());
    return kind === 'collaborators'
      ? { course, className: second, role: third, sessions: '', status: fourth }
      : { course, className: '', role: second, sessions: third, status: fourth };
  });
}

function parsePaymentRows(value: unknown): ResourcePaymentRow[] {
  if (Array.isArray(value)) {
    return value.map((row) => ({
      month: String(row?.month ?? ''),
      amount: String(row?.amount ?? ''),
      status: String(row?.status ?? ''),
      paidDate: String(row?.paidDate ?? ''),
    }));
  }

  return splitDetailLines(String(value || '')).map((line) => {
    const [month = '', amount = '', status = '', paidDate = ''] = line.split('|').map((part) => part.trim());
    return { month, amount, status, paidDate };
  });
}

function isFilledRow(row: Record<string, string>) {
  return Object.values(row).some((value) => value.trim());
}

function serializeWorkRows(rows: ResourceWorkRow[], kind: ResourceKind) {
  return rows
    .filter(isFilledRow)
    .map((row) => kind === 'collaborators'
      ? [row.course, row.className, row.role, row.status].map((value) => value.trim()).join(' | ')
      : [row.course, row.role, row.sessions, row.status].map((value) => value.trim()).join(' | '))
    .join('\n');
}

function serializePaymentRows(rows: ResourcePaymentRow[]) {
  return rows
    .filter(isFilledRow)
    .map((row) => [row.month, row.amount, row.status, row.paidDate].map((value) => value.trim()).join(' | '))
    .join('\n');
}

function emptyDetailForm(kind: ResourceKind, profile?: ProfileRow | null): ResourceDetailFormState {
  return {
    specialty: profile?.title || '',
    fee: '',
    contractNo: '',
    contractStatus: profile?.active === false ? 'Đã khoá' : 'Đang HĐ',
    sessions: '',
    rating: '',
    phone: '',
    bank: '',
    contractStart: '',
    contractEnd: '',
    contractValue: '',
    paidValue: '',
    collaboratorType: kind === 'collaborators' ? 'Part-time' : '',
    works: [emptyWorkRow(kind)],
    payments: kind === 'collaborators' ? [emptyPaymentRow()] : [],
    notes: '',
  };
}

function normalizeDetail(detail: Record<string, any> | null | undefined, kind: ResourceKind, profile?: ProfileRow | null): ResourceDetailFormState {
  const base = emptyDetailForm(kind, profile);
  const source = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail : {};
  const works = parseWorkRows(source.works ?? source.worksText, kind);
  const payments = parsePaymentRows(source.payments ?? source.paymentsText);
  return {
    specialty: String(source.specialty ?? base.specialty),
    fee: String(source.fee ?? base.fee),
    contractNo: String(source.contractNo ?? base.contractNo),
    contractStatus: String(source.contractStatus ?? base.contractStatus),
    sessions: String(source.sessions ?? base.sessions),
    rating: String(source.rating ?? base.rating),
    phone: String(source.phone ?? base.phone),
    bank: String(source.bank ?? base.bank),
    contractStart: String(source.contractStart ?? base.contractStart),
    contractEnd: String(source.contractEnd ?? base.contractEnd),
    contractValue: String(source.contractValue ?? base.contractValue),
    paidValue: String(source.paidValue ?? base.paidValue),
    collaboratorType: String(source.collaboratorType ?? base.collaboratorType),
    works: works.length ? works : base.works,
    payments: payments.length || kind !== 'collaborators' ? payments : base.payments,
    notes: String(source.notes ?? base.notes),
  };
}

function detailFormToPayload(form: ResourceDetailFormState, kind: ResourceKind) {
  const works = form.works.filter(isFilledRow);
  const payments = form.payments.filter(isFilledRow);
  return {
    specialty: form.specialty.trim(),
    fee: form.fee.trim(),
    contractNo: form.contractNo.trim(),
    contractStatus: form.contractStatus.trim(),
    sessions: form.sessions.trim(),
    rating: form.rating.trim(),
    phone: form.phone.trim(),
    bank: form.bank.trim(),
    contractStart: form.contractStart.trim(),
    contractEnd: form.contractEnd.trim(),
    contractValue: form.contractValue.trim(),
    paidValue: form.paidValue.trim(),
    collaboratorType: form.collaboratorType.trim(),
    works,
    payments,
    worksText: serializeWorkRows(works, kind),
    paymentsText: serializePaymentRows(payments),
    notes: form.notes.trim(),
  };
}

function missingText(value: string | null | undefined) {
  return String(value || '').trim() || 'Chưa cập nhật';
}

function infoRows(profile: ProfileRow, kind: ResourceKind, detail: ResourceDetailFormState) {
  if (kind === 'instructors') {
    return [
      ['Mã', resourceCode(profile)],
      ['Họ tên', missingText(profile.full_name)],
      ['Chuyên môn', missingText(detail.specialty || profile.title)],
      ['Chi phí', missingText(detail.fee)],
      ['Số HĐ', missingText(detail.contractNo)],
      ['TT HĐ', missingText(detail.contractStatus)],
      ['Buổi phụ trách', missingText(detail.sessions)],
      ['Rating', missingText(detail.rating)],
      ['SĐT', missingText(detail.phone)],
      ['Email', missingText(profile.email)],
      ['TK Ngân hàng', missingText(detail.bank)],
      ['HĐ từ', missingText(detail.contractStart)],
      ['HĐ đến', missingText(detail.contractEnd)],
      ['Giá trị HĐ', missingText(detail.contractValue)],
      ['Đã thanh toán', missingText(detail.paidValue)],
    ];
  }

  if (kind === 'collaborators') {
    return [
      ['Mã', resourceCode(profile)],
      ['Họ tên', missingText(profile.full_name)],
      ['Chuyên môn', missingText(detail.specialty || profile.title)],
      ['Loại', missingText(detail.collaboratorType || profile.role)],
      ['Chi phí', missingText(detail.fee)],
      ['Số HĐ', missingText(detail.contractNo)],
      ['TT HĐ', missingText(detail.contractStatus)],
      ['SĐT', missingText(detail.phone)],
      ['Email', missingText(profile.email)],
      ['TK NH', missingText(detail.bank)],
      ['HĐ từ', missingText(detail.contractStart)],
      ['HĐ đến', missingText(detail.contractEnd)],
      ['Giá trị HĐ', missingText(detail.contractValue)],
      ['Đã TT', missingText(detail.paidValue)],
      ['Đánh giá', missingText(detail.rating)],
    ];
  }

  return [
    ['Mã học viên', resourceCode(profile)],
    ['Họ tên', missingText(profile.full_name)],
    ['Email', missingText(profile.email)],
    ['Lớp', missingText(profile.student_class)],
    ['Nhóm', missingText(profile.student_group)],
  ];
}

export function SuniTrainingResourcesPage({ kind }: { kind: ResourceKind }) {
  const meta = RESOURCE_META[kind];
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const canManage = isTrainingAdminRole(profile?.role) || normalizeAppRole(profile?.role) === 'admin';
  const [keyword, setKeyword] = useState('');
  const [editingId, setEditingId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [form, setForm] = useState<ResourceFormState>(() => emptyResourceForm(kind));
  const [detailId, setDetailId] = useState('');
  const [detailForm, setDetailForm] = useState<ResourceDetailFormState>(() => emptyDetailForm(kind));

  const profilesQuery = useQuery({
    queryKey: ['profiles', 'resources'],
    queryFn: listProfiles,
  });

  const rows = useMemo(() => {
    return (profilesQuery.data || [])
      .filter((item: ProfileRow) => matchesKind(item, kind))
      .filter((item: ProfileRow) => matchesSearch(item, keyword))
      .sort((left: ProfileRow, right: ProfileRow) => String(left.full_name || '').localeCompare(String(right.full_name || ''), 'vi'));
  }, [kind, keyword, profilesQuery.data]);

  const resourceDetailsQuery = useQuery({
    queryKey: ['training-resource-details', kind, rows.map((row: ProfileRow) => row.id).join('|')],
    queryFn: () => listTrainingResourceDetails(rows.map((row: ProfileRow) => row.id)),
    enabled: kind !== 'learners' && rows.length > 0,
  });

  const resourceDetailsByProfileId = useMemo(() => {
    const map = new Map<string, TrainingResourceDetailRow>();
    for (const item of resourceDetailsQuery.data || []) {
      map.set(item.profile_id, item);
    }
    return map;
  }, [resourceDetailsQuery.data]);

  const stats = useMemo(() => ({
    total: rows.length,
    active: rows.filter((item: ProfileRow) => item.active !== false).length,
    inactive: rows.filter((item: ProfileRow) => item.active === false).length,
  }), [rows]);
  const detailRow = useMemo(() => rows.find((item: ProfileRow) => item.id === detailId) || null, [detailId, rows]);
  const detailRecord = detailRow ? resourceDetailsByProfileId.get(detailRow.id) || null : null;

  useEffect(() => {
    if (!detailRow || kind === 'learners') return;
    setDetailForm(normalizeDetail(detailRecord?.detail, kind, detailRow));
  }, [detailRecord?.detail, detailRow, kind]);

  const saveDetailMutation = useMutation({
    mutationFn: async () => {
      if (!detailRow || kind === 'learners') throw new Error('Không tìm thấy hồ sơ cần lưu.');
      return upsertTrainingResourceDetail({
        profile_id: detailRow.id,
        resource_kind: kind,
        detail: detailFormToPayload(detailForm, kind),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['training-resource-details'] });
      setFeedback('Đã lưu chi tiết nguồn lực.');
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : 'Không lưu được chi tiết nguồn lực.'),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        role: normalizeResourceRole(form.role || meta.defaultRole, kind),
        title: form.title.trim() || meta.defaultTitle,
        studentClass: kind === 'learners' ? form.studentClass.trim() || null : null,
        studentGroup: kind === 'learners' ? form.studentGroup.trim() || null : null,
        studentCode: kind === 'learners' ? form.studentCode.trim() || null : null,
      };
      if (!payload.fullName) throw new Error('Cần nhập họ tên.');
      if (!payload.email) throw new Error('Cần nhập email.');
      if (editingId) {
        await updateProfile(editingId, {
          full_name: payload.fullName,
          email: payload.email,
          role: payload.role,
          title: payload.title,
          active: form.active,
          student_class: payload.studentClass,
          student_group: payload.studentGroup,
          student_code: payload.studentCode,
        });
        return editingId;
      }
      return createProfile({
        fullName: payload.fullName,
        email: payload.email,
        role: payload.role,
        organizationId: null,
        companyId: null,
        title: payload.title,
        accessScope: payload.role === 'hoc_vien' ? 'self' : 'all',
        studentClass: payload.studentClass,
        studentGroup: payload.studentGroup,
        studentCode: payload.studentCode,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setFeedback(editingId ? 'Đã cập nhật tài khoản.' : 'Đã thêm tài khoản.');
      setEditingId('');
      setShowForm(false);
      setForm(emptyResourceForm(kind));
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : 'Không lưu được tài khoản.'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setFeedback('Đã xoá tài khoản khỏi danh sách hoạt động.');
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : 'Không xoá được tài khoản.'),
  });

  function openCreateForm() {
    setEditingId('');
    setDetailId('');
    setFeedback('');
    setForm(emptyResourceForm(kind));
    setShowForm(true);
  }

  function openEditForm(row: ProfileRow) {
    setEditingId(row.id);
    setDetailId('');
    setFeedback('');
    setForm(profileToForm(row, kind));
    setShowForm(true);
  }

  function openDetail(row: ProfileRow) {
    setShowForm(false);
    setEditingId('');
    setDetailId(row.id);
    const saved = resourceDetailsByProfileId.get(row.id);
    setDetailForm(normalizeDetail(saved?.detail, kind, row));
  }

  function patchDetailForm(patch: Partial<ResourceDetailFormState>) {
    setDetailForm((current) => ({ ...current, ...patch }));
  }

  function updateWorkRow(index: number, patch: Partial<ResourceWorkRow>) {
    setDetailForm((current) => ({
      ...current,
      works: current.works.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function addWorkRow() {
    setDetailForm((current) => ({ ...current, works: [...current.works, emptyWorkRow(kind)] }));
  }

  function removeWorkRow(index: number) {
    setDetailForm((current) => {
      const nextRows = current.works.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, works: nextRows.length ? nextRows : [emptyWorkRow(kind)] };
    });
  }

  function updatePaymentRow(index: number, patch: Partial<ResourcePaymentRow>) {
    setDetailForm((current) => ({
      ...current,
      payments: current.payments.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  }

  function addPaymentRow() {
    setDetailForm((current) => ({ ...current, payments: [...current.payments, emptyPaymentRow()] }));
  }

  function removePaymentRow(index: number) {
    setDetailForm((current) => {
      const nextRows = current.payments.filter((_, rowIndex) => rowIndex !== index);
      return { ...current, payments: nextRows.length ? nextRows : [emptyPaymentRow()] };
    });
  }

  function patchForm(patch: Partial<ResourceFormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage) return setFeedback('Bạn không có quyền chỉnh sửa nguồn lực.');
    saveMutation.mutate();
  }

  function remove(row: ProfileRow) {
    if (!canManage) return;
    const ok = window.confirm(`Xoá ${row.full_name || row.email || row.id} khỏi danh sách hoạt động?`);
    if (ok) deleteMutation.mutate(row.id);
  }

  return (
    <>
      <SectionHeader
        eye={meta.eye}
        title={meta.title}
        subtitle="Danh sách tài khoản, thông tin chi tiết, thêm/sửa/xoá. Cấu trúc này có thể mở rộng thêm hồ sơ năng lực, hợp đồng, lịch sử lớp và đánh giá."
        actions={canManage ? <button type="button" className="btn btn-primary" onClick={openCreateForm}><Plus size={16} /> Thêm {meta.title.toLowerCase()}</button> : null}
      />

      <div className="vuni-stat-grid">
        <div className="vuni-stat is-blue"><small>Tổng tài khoản</small><strong>{stats.total}</strong></div>
        <div className="vuni-stat is-green"><small>Đang hoạt động</small><strong>{stats.active}</strong></div>
        <div className="vuni-stat is-slate"><small>Đã khoá</small><strong>{stats.inactive}</strong></div>
      </div>

      {showForm ? (
        <Card title={editingId ? `Sửa ${meta.title.toLowerCase()}` : `Thêm ${meta.title.toLowerCase()}`}>
          <form className="form-grid" onSubmit={submit}>
            <label><span>Họ tên</span><input value={form.fullName} onChange={(event) => patchForm({ fullName: event.target.value })} placeholder="Nguyễn Văn A" /></label>
            <label><span>Email</span><input type="email" value={form.email} onChange={(event) => patchForm({ email: event.target.value })} placeholder="user@company.vn" /></label>
            <label><span>Chức danh</span><input value={form.title} onChange={(event) => patchForm({ title: event.target.value })} placeholder={meta.defaultTitle} /></label>
            <label>
              <span>Role hệ thống</span>
              <select value={normalizeResourceRole(form.role, kind)} onChange={(event) => patchForm({ role: event.target.value })}>
                {RESOURCE_ROLE_OPTIONS.filter((option) => kind === 'learners' ? option.value === 'hoc_vien' : option.value !== 'hoc_vien').map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {kind === 'learners' ? (
              <>
                <label><span>Lớp học viên</span><input value={form.studentClass} onChange={(event) => patchForm({ studentClass: event.target.value })} placeholder="PPO_DT26_K01" /></label>
                <label><span>Nhóm</span><input value={form.studentGroup} onChange={(event) => patchForm({ studentGroup: event.target.value })} placeholder="Nhóm 1" /></label>
                <label><span>Mã học viên</span><input value={form.studentCode} onChange={(event) => patchForm({ studentCode: event.target.value })} placeholder="HV001" /></label>
              </>
            ) : null}
            <label><span>Trạng thái</span><select value={form.active ? 'active' : 'inactive'} onChange={(event) => patchForm({ active: event.target.value === 'active' })}><option value="active">Đang hoạt động</option><option value="inactive">Đã khoá</option></select></label>
            <div className="action-row full">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Huỷ</button>
              <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>{saveMutation.isPending ? 'Đang lưu...' : 'Lưu tài khoản'}</button>
            </div>
          </form>
        </Card>
      ) : null}

      {detailRow && kind !== 'learners' ? (
        <Card
          title={`${kind === 'instructors' ? 'Chi tiết giảng viên' : 'Chi tiết CTV'}: ${detailRow.full_name || detailRow.email || detailRow.id}`}
          action={<button type="button" className="btn btn-ghost btn-small" onClick={() => setDetailId('')}>Đóng</button>}
        >
          <div className="suni-resource-detail-grid">
            <div className="suni-resource-profile-panel">
              <div className="suni-resource-detail-head">
                <strong>{resourceCode(detailRow)}: {detailRow.full_name || '-'}</strong>
                {detailRow.active === false ? <Badge tone="danger">Đã khoá</Badge> : <Badge tone="success">Đang hoạt động</Badge>}
              </div>
              <div className="suni-resource-info-list">
                {infoRows(detailRow, kind, detailForm).map(([label, value]) => (
                  <div className="suni-resource-info-row" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="suni-resource-profile-panel">
              <div className="suni-resource-detail-head">
                <strong>Nhập chi tiết</strong>
                {resourceDetailsQuery.isFetching ? <Badge tone="warning">Đang đồng bộ</Badge> : detailRecord ? <Badge tone="success">Đã có dữ liệu</Badge> : <Badge tone="neutral">Chưa có dữ liệu</Badge>}
              </div>
              <div className="form-grid suni-resource-detail-form">
                <label><span>Chuyên môn</span><input value={detailForm.specialty} onChange={(event) => patchDetailForm({ specialty: event.target.value })} /></label>
                {kind === 'collaborators' ? (
                  <label><span>Loại CTV</span><input value={detailForm.collaboratorType} onChange={(event) => patchDetailForm({ collaboratorType: event.target.value })} placeholder="Full-time / Part-time" /></label>
                ) : (
                  <label><span>Buổi phụ trách</span><input value={detailForm.sessions} onChange={(event) => patchDetailForm({ sessions: event.target.value })} placeholder="B1-B4, B7-B8" /></label>
                )}
                <label><span>Chi phí</span><input value={detailForm.fee} onChange={(event) => patchDetailForm({ fee: event.target.value })} placeholder={kind === 'instructors' ? '15tr/ngày' : '500k/buổi'} /></label>
                <label><span>Rating</span><input value={detailForm.rating} onChange={(event) => patchDetailForm({ rating: event.target.value })} placeholder="4.8/5" /></label>
                <label><span>Số HĐ</span><input value={detailForm.contractNo} onChange={(event) => patchDetailForm({ contractNo: event.target.value })} placeholder={kind === 'instructors' ? 'HĐ-2026-001' : 'CTV-2026-001'} /></label>
                <label><span>TT HĐ</span><input value={detailForm.contractStatus} onChange={(event) => patchDetailForm({ contractStatus: event.target.value })} placeholder="Đang HĐ" /></label>
                <label><span>HĐ từ</span><input value={detailForm.contractStart} onChange={(event) => patchDetailForm({ contractStart: event.target.value })} placeholder="01/01/2026" /></label>
                <label><span>HĐ đến</span><input value={detailForm.contractEnd} onChange={(event) => patchDetailForm({ contractEnd: event.target.value })} placeholder="31/12/2026" /></label>
                <label><span>Giá trị HĐ</span><input value={detailForm.contractValue} onChange={(event) => patchDetailForm({ contractValue: event.target.value })} placeholder="180,000,000đ" /></label>
                <label><span>Đã thanh toán</span><input value={detailForm.paidValue} onChange={(event) => patchDetailForm({ paidValue: event.target.value })} placeholder="90,000,000đ" /></label>
                <label><span>SĐT</span><input value={detailForm.phone} onChange={(event) => patchDetailForm({ phone: event.target.value })} placeholder="0912-345-001" /></label>
                <label><span>TK ngân hàng</span><input value={detailForm.bank} onChange={(event) => patchDetailForm({ bank: event.target.value })} placeholder="VCB 001234567890" /></label>
                <label className="full"><span>Ghi chú</span><textarea value={detailForm.notes} onChange={(event) => patchDetailForm({ notes: event.target.value })} rows={3} /></label>
              </div>

              <div className="suni-resource-detail-head suni-resource-section-gap">
                <strong>{kind === 'instructors' ? 'Công việc hiện tại' : 'Công việc'}</strong>
                {canManage ? <button type="button" className="btn btn-ghost btn-small" onClick={addWorkRow}><Plus size={14} /> Thêm dòng</button> : null}
              </div>
              <div className="suni-resource-edit-table-wrap">
                <table className="suni-resource-edit-table">
                  <thead>
                    <tr>
                      <th>Khóa</th>
                      {kind === 'collaborators' ? <th>Lớp</th> : null}
                      <th>Vai trò</th>
                      {kind === 'instructors' ? <th>Buổi</th> : null}
                      <th>TT</th>
                      <th aria-label="Thao tác" />
                    </tr>
                  </thead>
                  <tbody>
                    {detailForm.works.map((row, index) => (
                      <tr key={`work-${index}`}>
                        <td><input value={row.course} onChange={(event) => updateWorkRow(index, { course: event.target.value })} placeholder="KH-001 QLNS" /></td>
                        {kind === 'collaborators' ? <td><input value={row.className} onChange={(event) => updateWorkRow(index, { className: event.target.value })} placeholder="Lớp A" /></td> : null}
                        <td><input value={row.role} onChange={(event) => updateWorkRow(index, { role: event.target.value })} placeholder={kind === 'instructors' ? 'GV chính' : 'KT AV'} /></td>
                        {kind === 'instructors' ? <td><input value={row.sessions} onChange={(event) => updateWorkRow(index, { sessions: event.target.value })} placeholder="6 buổi" /></td> : null}
                        <td><input value={row.status} onChange={(event) => updateWorkRow(index, { status: event.target.value })} placeholder={kind === 'instructors' ? 'Đang giảng' : 'Đang làm'} /></td>
                        <td className="suni-resource-table-actions">
                          {canManage ? <button type="button" className="icon-button" onClick={() => removeWorkRow(index)} aria-label="Xóa dòng công việc"><Trash2 size={14} /></button> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {kind === 'collaborators' ? (
                <>
                  <div className="suni-resource-detail-head suni-resource-section-gap">
                    <strong>Thanh toán</strong>
                    {canManage ? <button type="button" className="btn btn-ghost btn-small" onClick={addPaymentRow}><Plus size={14} /> Thêm dòng</button> : null}
                  </div>
                  <div className="suni-resource-edit-table-wrap">
                    <table className="suni-resource-edit-table">
                      <thead>
                        <tr>
                          <th>Tháng</th>
                          <th>Số tiền</th>
                          <th>TT</th>
                          <th>Ngày TT</th>
                          <th aria-label="Thao tác" />
                        </tr>
                      </thead>
                      <tbody>
                        {detailForm.payments.map((row, index) => (
                          <tr key={`payment-${index}`}>
                            <td><input value={row.month} onChange={(event) => updatePaymentRow(index, { month: event.target.value })} placeholder="03/2026" /></td>
                            <td><input value={row.amount} onChange={(event) => updatePaymentRow(index, { amount: event.target.value })} placeholder="3,000,000đ" /></td>
                            <td><input value={row.status} onChange={(event) => updatePaymentRow(index, { status: event.target.value })} placeholder="Chờ TT" /></td>
                            <td><input value={row.paidDate} onChange={(event) => updatePaymentRow(index, { paidDate: event.target.value })} placeholder="-" /></td>
                            <td className="suni-resource-table-actions">
                              {canManage ? <button type="button" className="icon-button" onClick={() => removePaymentRow(index)} aria-label="Xóa dòng thanh toán"><Trash2 size={14} /></button> : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              <div className="action-row suni-resource-detail-actions">
                {canManage ? <button type="button" className="btn btn-ghost btn-small" onClick={() => openEditForm(detailRow)}><Edit3 size={14} /> Sửa tài khoản</button> : null}
                {canManage ? <button type="button" className="btn btn-primary btn-small" disabled={saveDetailMutation.isPending} onClick={() => saveDetailMutation.mutate()}>{saveDetailMutation.isPending ? 'Đang lưu...' : 'Lưu chi tiết'}</button> : null}
              </div>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title={`Danh sách ${meta.title.toLowerCase()}`} action={<Badge tone={stats.total ? 'success' : 'warning'}>{stats.total} tài khoản</Badge>}>
        <div className="vtraining-import-box">
          <Search size={16} />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Tìm tên, email, chức danh, lớp, nhóm, mã..." />
        </div>
        {feedback ? <div className="notice">{feedback}</div> : null}
        <div className="suni-native-table-wrap">
          <table className="data-table suni-native-table">
            <thead><tr><th>Tài khoản</th><th>Chức danh</th><th>Role</th><th>Thông tin</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
            <tbody>
              {rows.map((row: ProfileRow) => (
                <tr key={row.id}>
                  <td>
                    {kind === 'learners' ? (
                      <><strong>{row.full_name || '-'}</strong><span>{row.email || '-'}</span></>
                    ) : (
                      <button type="button" className="suni-resource-name-button" onClick={() => openDetail(row)}>
                        <strong>{row.full_name || '-'}</strong>
                        <span>{row.email || '-'}</span>
                      </button>
                    )}
                  </td>
                  <td>{row.title || '-'}</td>
                  <td>{row.role || '-'}</td>
                  <td><span>{kind === 'learners' ? `${row.student_class || '-'} / ${row.student_group || '-'}` : resourceCode(row)}</span><span>{kind === 'learners' ? row.student_code || '-' : row.id}</span></td>
                  <td>{row.active === false ? <Badge tone="danger">Đã khoá</Badge> : <Badge tone="success">Hoạt động</Badge>}</td>
                  <td>
                    {canManage ? (
                      <div className="suni-native-row-actions">
                        <button type="button" className="btn btn-ghost btn-small" onClick={() => openEditForm(row)}><Edit3 size={14} /> Sửa</button>
                        {kind !== 'learners' ? <button type="button" className="btn btn-ghost btn-small" onClick={() => openDetail(row)}><Eye size={14} /> Chi tiết</button> : null}
                        <button type="button" className="btn btn-danger btn-small" disabled={deleteMutation.isPending} onClick={() => remove(row)}><Trash2 size={14} /> Xoá</button>
                      </div>
                    ) : kind !== 'learners' ? <button type="button" className="btn btn-ghost btn-small" onClick={() => openDetail(row)}><Eye size={14} /> Chi tiết</button> : <UserCheck size={16} />}
                  </td>
                </tr>
              ))}
              {!rows.length ? <tr><td colSpan={6}>{profilesQuery.isLoading ? 'Đang tải danh sách...' : meta.emptyText}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

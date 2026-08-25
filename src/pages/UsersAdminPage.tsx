import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import {
  adminCreateAuthUser,
  adminResetAuthPassword,
  createProfile,
  listCompanies,
  listOrganizations,
  listProfiles,
  updateProfile,
} from '@/services/vcontent';

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'content_manager', label: 'Quản lý nội dung' },
  { value: 'production_manager', label: 'Quản lý sản xuất' },
  { value: 'pm', label: 'PM' },
  { value: 'qc', label: 'QC' },
  { value: 'hoc_gia', label: 'Học giả' },
  { value: 'hoc_vien', label: 'Học viên' },
  { value: 'giang_vien', label: 'Giảng viên' },
  { value: 'coaching_admin', label: 'Quản trị coaching' },
  { value: 'coach', label: 'Coach' },
  { value: 'coachee', label: 'Coachee' },
  { value: 'observer', label: 'Observer' },
  { value: 'client', label: 'Client' },
  { value: 'client_director', label: 'Client Director' },
  { value: 'vsuite_admin', label: 'V-Suite Admin' },
  { value: 'vsuite_ops', label: 'V-Suite Ops' },
  { value: 'vsuite_requester', label: 'V-Suite Requester' },
  { value: 'vsuite_accountant', label: 'V-Suite Accountant' },
  { value: 'vsuite_manager', label: 'V-Suite Manager' },
  { value: 'vsuite_director', label: 'V-Suite Director' },
  { value: 'vsuite_treasurer', label: 'V-Suite Treasurer' },
  { value: 'vsuite_trainer', label: 'V-Suite Trainer' },
  { value: 'vsuite_teamlead', label: 'V-Suite Teamlead' },
  { value: 'vsuite_ctv', label: 'V-Suite CTV' },
  { value: 'vsuite_lms', label: 'V-Suite LMS' },
];

const ACCESS_SCOPE_OPTIONS = ['all', 'organization', 'company', 'self'];

export function UsersAdminPage() {
  const { profile, session } = useAuth();
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ['profiles'],
    queryFn: listProfiles,
  });
  const organizationsQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: listOrganizations,
  });
  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: listCompanies,
  });
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('client');
  const [organizationId, setOrganizationId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [title, setTitle] = useState('');
  const [accessScope, setAccessScope] = useState('self');
  const [studentClass, setStudentClass] = useState('');
  const [studentGroup, setStudentGroup] = useState('');
  const [studentCode, setStudentCode] = useState('');
  const [createAuthNow, setCreateAuthNow] = useState(true);
  const [password, setPassword] = useState('Welcome@123');
  const [createFeedback, setCreateFeedback] = useState('');
  const [profileDrafts, setProfileDrafts] = useState<Record<string, { role: string; accessScope: string }>>({});
  const [updateFeedback, setUpdateFeedback] = useState('');

  const createProfileMutation = useMutation({
    mutationFn: createProfile,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
  const createAuthMutation = useMutation({
    mutationFn: adminCreateAuthUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
    },
  });
  const resetPasswordMutation = useMutation({
    mutationFn: adminResetAuthPassword,
  });
  const updateProfileMutation = useMutation({
    mutationFn: ({ profileId, role, accessScope }: { profileId: string; role: string; accessScope: string }) =>
      updateProfile(profileId, { role, access_scope: accessScope }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profiles'] });
      setUpdateFeedback('Đã cập nhật role người dùng.');
    },
    onError: (error) => {
      setUpdateFeedback(error instanceof Error ? error.message : 'Không cập nhật được role người dùng.');
    },
  });

  function getProfileDraft(item: any) {
    return profileDrafts[item.id] || { role: item.role || 'client', accessScope: item.access_scope || 'self' };
  }

  function patchProfileDraft(profileId: string, patch: Partial<{ role: string; accessScope: string }>, fallback: { role: string; accessScope: string }) {
    setProfileDrafts((current) => ({
      ...current,
      [profileId]: {
        ...(current[profileId] || fallback),
        ...patch,
      },
    }));
  }

  const handleCreateUser = async () => {
    setCreateFeedback('');
    if (!session?.access_token) {
      setCreateFeedback('Thiếu access token.');
      return;
    }

    try {
      const profileId = await createProfileMutation.mutateAsync({
        fullName,
        email,
        role,
        organizationId: organizationId || null,
        companyId: companyId || null,
        title: title || null,
        accessScope,
        studentClass: role === 'hoc_vien' ? studentClass || null : null,
        studentGroup: role === 'hoc_vien' ? studentGroup || null : null,
        studentCode: role === 'hoc_vien' ? studentCode || null : null,
      });

      if (createAuthNow) {
        await createAuthMutation.mutateAsync({
          accessToken: session.access_token,
          email,
          password,
          fullName,
          profileId,
        });
      }

      setFullName('');
      setEmail('');
      setRole('client');
      setOrganizationId('');
      setCompanyId('');
      setTitle('');
      setAccessScope('self');
      setStudentClass('');
      setStudentGroup('');
      setStudentCode('');
      setCreateAuthNow(true);
      setPassword('Welcome@123');
      setCreateFeedback(createAuthNow ? 'Đã tạo profile và tài khoản Auth.' : 'Đã tạo profile.');
    } catch (error) {
      setCreateFeedback(String(error instanceof Error ? error.message : error));
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <>
        <SectionHeader
          eye="Hệ thống"
          title="Người dùng & Phân quyền"
          subtitle="Màn quản trị đầy đủ chỉ mở cho Admin."
        />
        <Card title="Danh sach nguoi dung">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ten</th>
                <th>Email</th>
                <th>Role</th>
                <th>Don vi</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data || []).map((item: any) => (
                <tr key={item.id}>
                  <td>{item.full_name}</td>
                  <td>{item.email || '-'}</td>
                  <td>{item.role}</td>
                  <td>{item.company_id || item.organization_id || '-'}</td>
                  <td>{item.active ? <Badge tone="success">Active</Badge> : <Badge tone="danger">Inactive</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        eye="Hệ thống"
        title="Người dùng & Phân quyền"
        subtitle="CRUD profile tren Supabase, kem tao Auth user va reset password bang server function."
      />
      <div className="content-grid two-column">
        <Card title="Tạo người dùng mới">
          <div className="form-grid">
            <label>
              <span>Họ tên</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nguyễn Văn A" />
            </label>
            <label>
              <span>Email</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="user@company.vn" />
            </label>
            <label>
              <span>Role</span>
              <select
                value={role}
                onChange={(event) => {
                  const nextRole = event.target.value;
                  setRole(nextRole);
                  if (nextRole === 'hoc_vien') setAccessScope('self');
                  if (nextRole.startsWith('vsuite_')) setAccessScope('all');
                }}
              >
                <option value="admin">Admin</option>
                <option value="content_manager">Quản lý nội dung</option>
                <option value="production_manager">Quản lý sản xuất</option>
                <option value="pm">PM</option>
                <option value="qc">QC</option>
                <option value="hoc_gia">Học giả</option>
                <option value="hoc_vien">Học viên</option>
                <option value="giang_vien">Giảng viên</option>
                <option value="coaching_admin">Quản trị coaching</option>
                <option value="coach">Coach</option>
                <option value="coachee">Coachee</option>
                <option value="observer">Observer</option>
                <option value="client">Client</option>
                <option value="client_director">Client Director</option>
                <option value="vsuite_admin">V-Suite Admin</option>
                <option value="vsuite_ops">V-Suite Ops</option>
                <option value="vsuite_requester">V-Suite Requester</option>
                <option value="vsuite_accountant">V-Suite Accountant</option>
                <option value="vsuite_manager">V-Suite Manager</option>
                <option value="vsuite_director">V-Suite Director</option>
                <option value="vsuite_treasurer">V-Suite Treasurer</option>
                <option value="vsuite_trainer">V-Suite Trainer</option>
                <option value="vsuite_teamlead">V-Suite Teamlead</option>
                <option value="vsuite_ctv">V-Suite CTV</option>
                <option value="vsuite_lms">V-Suite LMS</option>
              </select>
            </label>
            <label>
              <span>Access scope</span>
              <select value={accessScope} onChange={(event) => setAccessScope(event.target.value)}>
                <option value="all">all</option>
                <option value="organization">organization</option>
                <option value="company">company</option>
                <option value="self">self</option>
              </select>
            </label>
            <label>
              <span>Tổ chức</span>
              <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
                <option value="">-- Chọn --</option>
                {(organizationsQuery.data || []).map((item: any) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Công ty</span>
              <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
                <option value="">-- Chọn --</option>
                {(companiesQuery.data || [])
                  .filter((item: any) => !organizationId || item.organization_id === organizationId)
                  .map((item: any) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Chức danh</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Project Manager" />
            </label>
            {role === 'hoc_vien' ? (
              <>
                <label>
                  <span>Lop hoc vien</span>
                  <input value={studentClass} onChange={(event) => setStudentClass(event.target.value)} placeholder="PLX-K01" />
                </label>
                <label>
                  <span>Nhom hoc vien</span>
                  <input value={studentGroup} onChange={(event) => setStudentGroup(event.target.value)} placeholder="Nhom 1" />
                </label>
                <label>
                  <span>Ma hoc vien</span>
                  <input value={studentCode} onChange={(event) => setStudentCode(event.target.value)} placeholder="Tuy chon" />
                </label>
              </>
            ) : null}
            <label>
              <span>Mật khẩu đầu</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="full">
                <span>Khởi chạy đăng nhập</span>
              <select value={createAuthNow ? 'yes' : 'no'} onChange={(event) => setCreateAuthNow(event.target.value === 'yes')}>
                <option value="yes">Tạo luôn tài khoản Auth</option>
                <option value="no">Chỉ tạo profile</option>
              </select>
            </label>
            <div className="action-row">
              <button
                className="btn btn-danger"
                onClick={() => void handleCreateUser()}
                disabled={!fullName || !email || (role === 'hoc_vien' && (!studentClass || !studentGroup)) || createProfileMutation.isPending || createAuthMutation.isPending}
              >
                {createProfileMutation.isPending || createAuthMutation.isPending ? 'Đang tạo...' : 'Tạo người dùng'}
              </button>
            </div>
            {createFeedback ? <div className="muted-text">{createFeedback}</div> : null}
          </div>
        </Card>
        <Card title="Danh sách hiện có">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ten</th>
                <th>Email</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Lop/Nhom</th>
                <th>Auth</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data || []).map((item: any) => (
                <tr key={item.id}>
                  <td>
                    <div className="fw6">{item.full_name}</div>
                    <div className="muted-text">{item.title || '-'}</div>
                  </td>
                  <td>{item.email || '-'}</td>
                  <td>
                    <select
                      value={getProfileDraft(item).role}
                      onChange={(event) =>
                        patchProfileDraft(item.id, { role: event.target.value }, { role: item.role || 'client', accessScope: item.access_scope || 'self' })
                      }
                      disabled={updateProfileMutation.isPending}
                    >
                      {ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={getProfileDraft(item).accessScope}
                      onChange={(event) =>
                        patchProfileDraft(item.id, { accessScope: event.target.value }, { role: item.role || 'client', accessScope: item.access_scope || 'self' })
                      }
                      disabled={updateProfileMutation.isPending}
                    >
                      {ACCESS_SCOPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div>{item.student_class || '-'}</div>
                    <div className="muted-text">{item.student_group || item.student_code || '-'}</div>
                  </td>
                  <td>{item.auth_user_id ? <Badge tone="success">linked</Badge> : <Badge tone="warning">profile-only</Badge>}</td>
                  <td>
                    <div className="action-row">
                      <button
                        className="btn btn-primary btn-small"
                        onClick={() => {
                          const draft = getProfileDraft(item);
                          updateProfileMutation.mutate({ profileId: item.id, role: draft.role, accessScope: draft.accessScope });
                        }}
                        disabled={
                          updateProfileMutation.isPending ||
                          (getProfileDraft(item).role === (item.role || 'client') &&
                            getProfileDraft(item).accessScope === (item.access_scope || 'self'))
                        }
                      >
                        {updateProfileMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                      </button>
                    {item.auth_user_id ? (
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => {
                          const nextPassword = window.prompt(`Mật khẩu mới cho ${item.email || item.full_name}`, 'Welcome@123');
                          if (!nextPassword || !session?.access_token) return;
                          resetPasswordMutation.mutate({
                            accessToken: session.access_token,
                            userId: item.auth_user_id,
                            password: nextPassword,
                          });
                        }}
                      >
                        Reset password
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-small"
                        onClick={() => {
                          if (!session?.access_token || !item.email) return;
                          createAuthMutation.mutate({
                            accessToken: session.access_token,
                            email: item.email,
                            password: 'Welcome@123',
                            fullName: item.full_name,
                            profileId: item.id,
                          });
                        }}
                      >
                        Tạo auth
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {updateFeedback ? <div className="muted-text">{updateFeedback}</div> : null}
          {resetPasswordMutation.error ? <div className="muted-text">{String(resetPasswordMutation.error)}</div> : null}
        </Card>
      </div>
    </>
  );
}

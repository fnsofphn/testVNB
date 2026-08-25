import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, SectionHeader } from '@/components/ui/Primitives';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { listCompanies, listOrganizations, updateProfile, uploadProfileAvatar } from '@/services/vcontent';

type NoticeState = {
  tone: 'success' | 'danger';
  message: string;
} | null;

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function formatErrorMessage(error: unknown) {
  if (!error) return 'Đã xảy ra lỗi.';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
    return maybe.message || maybe.details || maybe.hint || maybe.code || JSON.stringify(error);
  }
  return String(error);
}

export function ProfilePage() {
  const { profile, session, refreshProfile } = useAuth();
  const organizationsQuery = useQuery({ queryKey: ['organizations'], queryFn: listOrganizations });
  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: listCompanies });

  const [notice, setNotice] = useState<NoticeState>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [draft, setDraft] = useState({
    fullName: '',
    email: '',
    phone: '',
    title: '',
    organizationId: '',
    companyId: '',
    avatarUrl: '',
  });

  useEffect(() => {
    setDraft({
      fullName: profile?.fullName || '',
      email: session?.user?.email || profile?.email || '',
      phone: profile?.phone || '',
      title: profile?.title || '',
      organizationId: profile?.organizationId || '',
      companyId: profile?.companyId || '',
      avatarUrl: profile?.avatarUrl || '',
    });
  }, [profile, session?.user?.email]);

  const companies = companiesQuery.data || [];
  const organizations = organizationsQuery.data || [];
  const filteredCompanies = useMemo(
    () => (draft.organizationId ? companies.filter((item: any) => item.organization_id === draft.organizationId) : companies),
    [companies, draft.organizationId],
  );
  const organizationName = organizations.find((item: any) => item.id === draft.organizationId)?.name || 'Chưa gắn đơn vị';
  const companyName = companies.find((item: any) => item.id === draft.companyId)?.name || 'Chưa gắn công ty';
  const previewAvatar = avatarFile ? URL.createObjectURL(avatarFile) : draft.avatarUrl;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Không tìm thấy profile hiện tại.');
      if (!supabase) throw new Error('Supabase client is not configured.');

      let avatarUrl = draft.avatarUrl || null;
      if (avatarFile) {
        const uploaded = await uploadProfileAvatar({
          file: avatarFile,
          profileId: profile.id,
          previousUrl: draft.avatarUrl || null,
        });
        avatarUrl = uploaded.fileUrl;
      }

      const authPayload: { email?: string; data: Record<string, unknown> } = {
        data: {
          phone: draft.phone.trim() || null,
          avatar_url: avatarUrl,
        },
      };

      const nextEmail = draft.email.trim();
      const currentEmail = session?.user?.email || profile.email || '';
      const emailChanged = Boolean(nextEmail && nextEmail !== currentEmail);
      if (emailChanged) authPayload.email = nextEmail;

      const authResult = await supabase.auth.updateUser(authPayload);
      if (authResult.error) throw authResult.error;

      await updateProfile(profile.id, {
        full_name: draft.fullName.trim() || profile.fullName,
        email: nextEmail || null,
        title: draft.title.trim() || null,
        organization_id: draft.organizationId || null,
        company_id: draft.companyId || null,
        avatar_initials: getInitials(draft.fullName || profile.fullName),
      });

      await refreshProfile();
      return {
        message: emailChanged ? 'Đã lưu hồ sơ. Nếu đổi email, hãy kiểm tra hộp thư để xác nhận.' : 'Đã cập nhật hồ sơ cá nhân.',
        avatarUrl,
      };
    },
    onSuccess: async (result) => {
      setAvatarFile(null);
      setDraft((current) => ({ ...current, avatarUrl: result.avatarUrl || current.avatarUrl }));
      setNotice({ tone: 'success', message: result.message });
      await refreshProfile();
    },
    onError: (error) => {
      setNotice({ tone: 'danger', message: formatErrorMessage(error) });
    },
  });

  return (
    <>
      <SectionHeader eye="Tài khoản" title="Hồ sơ cá nhân" subtitle="Tự cập nhật thông tin người dùng, avatar và thông tin liên hệ để hiển thị đúng trên workspace." />
      <div className="content-grid two-column">
        <Card title="Thông tin cá nhân">
          <div className="stack compact">
            {notice ? <div className={`bullet-item ${notice.tone === 'danger' ? 'tone-danger' : 'tone-success'}`}>{notice.message}</div> : null}
            <div className="profile-editor-header">
              <div className="profile-avatar-large">
                {previewAvatar ? <img src={previewAvatar} alt={draft.fullName || 'Avatar'} className="profile-avatar-image" /> : <span>{getInitials(draft.fullName || profile?.fullName || 'VC')}</span>}
              </div>
              <div className="stack compact">
                <label className="btn btn-ghost profile-avatar-picker">
                  Đổi avatar
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setAvatarFile(file);
                      setNotice(null);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <div className="muted-text">Ảnh đại diện sẽ hiện ở sidebar và topbar.</div>
              </div>
            </div>
            <div className="form-grid">
              <label>
                <span>Họ tên</span>
                <input className="fi" value={draft.fullName} onChange={(event) => setDraft((current) => ({ ...current, fullName: event.target.value }))} />
              </label>
              <label>
                <span>Email</span>
                <input className="fi" type="email" value={draft.email} onChange={(event) => setDraft((current) => ({ ...current, email: event.target.value }))} />
              </label>
              <label>
                <span>Số điện thoại</span>
                <input className="fi" value={draft.phone} onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))} />
              </label>
              <label>
                <span>Role</span>
                <input className="fi" value={profile?.role || ''} readOnly />
              </label>
              <label>
                <span>Chức danh</span>
                <input className="fi" value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label>
                <span>Scope</span>
                <input className="fi" value={profile?.accessScope || ''} readOnly />
              </label>
              <label>
                <span>Đơn vị</span>
                <select className="fi" value={draft.organizationId} onChange={(event) => setDraft((current) => ({ ...current, organizationId: event.target.value, companyId: '' }))}>
                  <option value="">Chọn đơn vị</option>
                  {organizations.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Công ty</span>
                <select className="fi" value={draft.companyId} onChange={(event) => setDraft((current) => ({ ...current, companyId: event.target.value }))}>
                  <option value="">Chọn công ty</option>
                  {filteredCompanies.map((item: any) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="action-row">
              <button className="btn btn-danger" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
                {mutation.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
              </button>
            </div>
          </div>
        </Card>
        <Card title="Thông tin hiển thị">
          <div className="stack compact">
            <div className="bullet-item">Họ tên: {draft.fullName || '-'}</div>
            <div className="bullet-item">Email: {draft.email || '-'}</div>
            <div className="bullet-item">Số điện thoại: {draft.phone || '-'}</div>
            <div className="bullet-item">Đơn vị: {organizationName}</div>
            <div className="bullet-item">Công ty: {companyName}</div>
            <div className="bullet-item">Role: {profile?.role || '-'}</div>
            <div className="bullet-item">Chức danh: {draft.title || '-'}</div>
          </div>
        </Card>
      </div>
    </>
  );
}

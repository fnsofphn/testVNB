import type { ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { BookOpen, GraduationCap, LifeBuoy, LogOut, MessageCircle, ShieldCheck } from 'lucide-react';
import { isInvalidAuthSessionError, useAuth } from '@/contexts/AuthContext';
import { getAllowedPages, normalizeAppRole, ROLE_META } from '@/data/vcontent';

export function SuniTrainingLearnerLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { loading, profile, signOut } = useAuth();
  const role = normalizeAppRole(profile?.role);
  const requiredPage = location.pathname.startsWith('/vdiscussion') ? 'vdiscussion' : 'vtraining';
  const allowedPages = getAllowedPages(role);

  if (!loading && (role !== 'hoc_vien' || !allowedPages.includes(requiredPage))) {
    return <Navigate to="/login" replace />;
  }

  const displayName = profile?.fullName || profile?.email || 'Học viên';
  const roleLabel = ROLE_META[role]?.label || profile?.role || 'Học viên';
  const studentNavItems = [
    { path: '/vtraining', label: 'Lớp học', icon: GraduationCap },
    { path: '/vdiscussion', label: 'Thảo luận', icon: MessageCircle },
  ];
  const StudentBrandIcon = requiredPage === 'vdiscussion' ? MessageCircle : BookOpen;

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      if (!isInvalidAuthSessionError(error)) throw error;
    }
  }

  return (
    <div className="vdiscussion-student-shell">
      <header className="vdiscussion-student-topbar">
        <Link className="vdiscussion-student-brand" to={requiredPage === 'vdiscussion' ? '/vdiscussion' : '/vtraining'}>
          <span><StudentBrandIcon size={20} /></span>
          <div>
            <small>Vinabrain Learning</small>
            <strong>{requiredPage === 'vdiscussion' ? 'VDiscussion' : 'VTraining'}</strong>
          </div>
        </Link>
        <nav className="vdiscussion-student-navlinks" aria-label="Điều hướng học viên">
          {studentNavItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
            return (
              <Link className={active ? 'is-active' : ''} to={item.path} key={item.path}>
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="vdiscussion-student-account">
          <span>{displayName.slice(0, 1).toUpperCase() || <StudentBrandIcon size={17} />}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{roleLabel}</small>
          </div>
          <button className="btn btn-ghost btn-small" type="button" onClick={() => void handleSignOut()}>
            <LogOut size={15} /> Đăng xuất
          </button>
        </div>
      </header>
      <main className="vdiscussion-student-content" key={location.pathname}>{children}</main>
      <footer className="vdiscussion-student-footer">
        <div>
          <strong>Vinabrain Learning Space</strong>
          <span>Theo dõi lớp học, thảo luận, tài liệu và kết quả học tập cá nhân.</span>
        </div>
        <div className="vdiscussion-student-footer-status" aria-label="Trạng thái hỗ trợ">
          <span><ShieldCheck size={15} /> Bảo mật phiên học</span>
          <span><LifeBuoy size={15} /> Hỗ trợ học viên</span>
        </div>
        <nav aria-label="Liên kết học viên">
          <Link to="/vtraining">VTraining</Link>
          <Link to="/vdiscussion">VDiscussion</Link>
        </nav>
      </footer>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import { isInvalidAuthSessionError, useAuth } from '@/contexts/AuthContext';
import { getAllowedPages, normalizeAppRole, ROLE_META } from '@/data/vcontent';

type NavSection = {
  section: string;
  items: Array<{ path: string; label: string; icon: string }>;
};

const managerNavItems: NavSection[] = [
  {
    section: 'TỔNG QUAN',
    items: [{ path: '/vtraining', label: 'Tổng quan điều hành', icon: '01' }],
  },
  {
    section: 'QUẢN LÝ ĐÀO TẠO',
    items: [
      { path: '/vtraining/programs', label: 'Chương trình đào tạo', icon: 'CT' },
      { path: '/vtraining/courses', label: 'Khóa đào tạo', icon: 'KH' },
      { path: '/vtraining/classes', label: 'Lớp đào tạo', icon: 'LP' },
    ],
  },
  {
    section: 'QUẢN LÝ NỘI DUNG',
    items: [
      { path: '/vtraining/needs', label: 'TNA / Nhu cầu', icon: 'TN' },
      { path: '/vtraining/content/lessonplans', label: 'Nội dung đào tạo', icon: 'ND' },
      { path: '/vtraining/library', label: 'Thư viện', icon: 'TV' },
      { path: '/vtraining/agenda', label: 'Agenda & Công cụ', icon: 'AG' },
    ],
  },
  {
    section: 'QUẢN LÝ VẬN HÀNH',
    items: [
      { path: '/vtraining/operations', label: 'Thông tin vận hành', icon: 'VH' },
      { path: '/vtraining/checklist', label: 'Checklist vận hành', icon: 'CL' },
      { path: '/vtraining/evidence', label: 'Minh chứng vận hành', icon: 'MC' },
    ],
  },
  {
    section: 'QUẢN LÝ NGUỒN LỰC',
    items: [
      { path: '/vtraining/instructors', label: 'Giảng viên', icon: 'GV' },
      { path: '/vtraining/collaborators', label: 'Cộng tác viên', icon: 'CTV' },
      { path: '/vtraining/learners', label: 'Học viên', icon: 'HV' },
    ],
  },
];

const topTabs = [
  { path: '/vtraining', label: 'Tổng quan', paths: ['/vtraining'] },
  { path: '/vtraining/programs', label: 'Đào tạo', paths: ['/vtraining/programs', '/vtraining/courses', '/vtraining/classes'] },
  { path: '/vtraining/content/lessonplans', label: 'Nội dung', paths: ['/vtraining/needs', '/vtraining/content', '/vtraining/library', '/vdiscussion', '/vtraining/agenda'] },
  { path: '/vtraining/operations', label: 'Vận hành', paths: ['/vtraining/operations', '/vtraining/checklist', '/vtraining/evidence'] },
  { path: '/vtraining/instructors', label: 'Nguồn lực', paths: ['/vtraining/instructors', '/vtraining/collaborators', '/vtraining/learners'] },
];

const customerNavItems: NavSection[] = [
  {
    section: 'QUẢN LÝ ĐÀO TẠO',
    items: [
      { path: '/vtraining/programs', label: 'Chương trình đào tạo', icon: 'CT' },
      { path: '/vtraining/courses', label: 'Khóa đào tạo', icon: 'KH' },
      { path: '/vtraining/classes', label: 'Lớp đào tạo', icon: 'LP' },
    ],
  },
];

const customerTopTabs = [
  { path: '/vtraining/programs', label: 'Đào tạo', paths: ['/vtraining', '/vtraining/programs', '/vtraining/courses', '/vtraining/classes'] },
];

const instructorNavItems: NavSection[] = [
  {
    section: 'LỚP ĐƯỢC GÁN',
    items: [
      { path: '/vtraining/classes', label: 'Lớp đào tạo', icon: 'LP' },
    ],
  },
];

const instructorTopTabs = [
  { path: '/vtraining/classes', label: 'Lớp được gán', paths: ['/vtraining', '/vtraining/classes'] },
];

function isPathActive(currentPath: string, targetPath: string) {
  if (targetPath === '/vtraining') return currentPath === targetPath;
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}

export function SuniTrainingManagerLayout({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();
  const { loading, profile, signOut } = useAuth();
  const role = normalizeAppRole(profile?.role);
  const allowedPages = getAllowedPages(role);

  const requiredPage = location.pathname.startsWith('/vdiscussion') ? 'vdiscussion' : 'vtraining';

  if (!loading && !allowedPages.includes(requiredPage)) {
    return <Navigate to="/login" replace />;
  }

  const displayName = profile?.fullName || profile?.email || 'Minh Ngoc';
  const avatarText = displayName.trim().charAt(0).toUpperCase() || 'M';
  const isCustomerExperience = role === 'client' || role === 'client_director';
  const isInstructorExperience = role === 'giang_vien';
  const roleLabel = role === 'admin' ? 'Manager đào tạo' : ROLE_META[role]?.label || profile?.role || 'Vai trò';

  if (isInstructorExperience) {
    if (location.pathname === '/vtraining') return <Navigate to="/vtraining/classes" replace />;
    const allowedInstructorRoute = location.pathname === '/vtraining' || location.pathname === '/vtraining/classes' || location.pathname.startsWith('/vtraining/classes/') || location.pathname.startsWith('/vtraining/giaoan/');
    if (!allowedInstructorRoute) return <Navigate to="/vtraining/classes" replace />;
  }

  const visibleNavItems = isCustomerExperience ? customerNavItems : isInstructorExperience ? instructorNavItems : managerNavItems;
  const visibleTopTabs = isCustomerExperience ? customerTopTabs : isInstructorExperience ? instructorTopTabs : topTabs;

  async function handleSignOut() {
    try {
      await signOut();
    } catch (error) {
      if (!isInvalidAuthSessionError(error)) throw error;
    }
  }

  return (
    <div className="vuni-shell">
      <aside className={`vuni-sidebar ${isSidebarOpen ? 'is-open' : 'is-collapsed'}`}>
        <div className="vuni-sidebar-head">
          {isSidebarOpen ? (
            <div className="vuni-brand">
              <span>V</span>
              <div>
                <strong>VTraining</strong>
                <small>{roleLabel}</small>
              </div>
            </div>
          ) : null}
          <button className="vuni-icon-button" type="button" onClick={() => setIsSidebarOpen((value) => !value)} aria-label="Toggle sidebar">
            <Menu size={16} />
          </button>
        </div>

        <nav className="vuni-sidebar-nav">
          {visibleNavItems.map((section) => (
            <div className="vuni-nav-section" key={section.section}>
              {isSidebarOpen ? <h3>{section.section}</h3> : null}
              {section.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  target={item.path === '/vtraining/library' ? '_blank' : undefined}
                  rel={item.path === '/vtraining/library' ? 'noopener noreferrer' : undefined}
                  className={`vuni-nav-item ${isPathActive(location.pathname, item.path) ? 'is-active' : ''}`}
                  title={isSidebarOpen ? undefined : item.label}
                >
                  <span>{item.icon}</span>
                  {isSidebarOpen ? <strong>{item.label}</strong> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {isSidebarOpen ? (
          <div className="vuni-sidebar-account">
            <div className="vuni-avatar">{avatarText}</div>
            <div>
              <strong>{displayName}</strong>
              <small>{roleLabel}</small>
            </div>
            <button className="vuni-icon-button" type="button" onClick={() => void handleSignOut()} aria-label="Đăng xuất">
              <LogOut size={15} />
            </button>
          </div>
        ) : null}
      </aside>

      <main className="vuni-main">
        {!isInstructorExperience ? (
        <header className="vuni-topbar">
          <div className="vuni-topbar-left">
            <span className="vuni-manager-badge">VTraining Manager</span>
            <nav className="vuni-top-tabs">
              {visibleTopTabs.map((tab) => {
                const active = tab.paths.some((path) => isPathActive(location.pathname, path));
                return <Link key={tab.path} className={active ? 'is-active' : ''} to={tab.path}>{tab.label}</Link>;
              })}
            </nav>
          </div>
          <div className="vuni-role-card">
            <small>Vai trò</small>
            <strong>{roleLabel}</strong>
          </div>
        </header>
        ) : null}

        <div className="vuni-content route-page-shell" key={location.pathname}>
          {children}
        </div>
      </main>
    </div>
  );
}

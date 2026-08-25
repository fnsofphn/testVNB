import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import { PAGE_LABELS, getAllowedPages, normalizeAppRole, type PageKey } from '@/data/vcontent';
import { useAppShell } from '@/contexts/AppShellContext';
import { useAuth } from '@/contexts/AuthContext';
import { getPageIdFromBrowserPath, useBrowserPath } from '@/lib/browserPath';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function AppLayout() {
  const navigate = useNavigate();
  const { role, setRole, sidebarCollapsed } = useAppShell();
  const { loading, profile } = useAuth();
  const browserPath = useBrowserPath();
  const effectiveRole = profile?.role ? normalizeAppRole(profile.role) : role;
  const allowedPages = useMemo(() => getAllowedPages(effectiveRole), [effectiveRole]);
  const fallbackPage = allowedPages[0] ?? 'dashboard';
  const currentPage = getPageIdFromBrowserPath(browserPath) as PageKey;
  const isWorkspacePage = Object.prototype.hasOwnProperty.call(PAGE_LABELS, currentPage);
  const blockedWorkspaceTarget = effectiveRole === 'plx_playbook_viewer' ? '/vculture/plx-ceo-playbook' : '/login';
  const isWorkspacePageBlocked = !loading && isWorkspacePage && !allowedPages.includes(currentPage);

  useEffect(() => {
    if (profile?.role) {
      setRole(normalizeAppRole(profile.role));
    }
  }, [profile?.role, setRole]);

  useEffect(() => {
    if (loading) return;

    if (!isWorkspacePage) return;

    if (!allowedPages.includes(currentPage)) {
      navigate(allowedPages.length ? `/${fallbackPage}` : blockedWorkspaceTarget, { replace: true });
    }
  }, [allowedPages, blockedWorkspaceTarget, currentPage, fallbackPage, isWorkspacePage, loading, navigate]);

  if (isWorkspacePageBlocked) {
    return <Navigate to={allowedPages.length ? `/${fallbackPage}` : blockedWorkspaceTarget} replace />;
  }

  return (
    <div className={`shell-frame ${sidebarCollapsed ? 'is-sidebar-collapsed' : ''}`} data-route-page={currentPage}>
      <Sidebar currentPage={currentPage} />
      <div className="shell-main">
        <TopBar currentPage={currentPage} title={PAGE_LABELS[currentPage] || 'VContent'} />
        <main className="shell-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

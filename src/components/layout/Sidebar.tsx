import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { NAV_SECTIONS, PAGE_LABELS, ROLE_META, type PageKey } from '@/data/vcontent';
import { useAppShell } from '@/contexts/AppShellContext';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMyTasksPreview, getMyTasksPreviewQueryKey, shouldUseMyTasksPreview, type MyTasksPreviewOptions } from '@/lib/myTasksPreview';
import { inferProductWorkflowModule, listOrdersWithProducts, listWorkflowRecords } from '@/services/vcontent';

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function getSidebarStatusClass(status: string | null | undefined) {
  if (['changes_requested', 'qc_fail', 'fail', 'rejected'].includes(String(status || ''))) return 'status-danger';
  if (['submitted', 'review', 'in_review', 'submitted_qc', 'submitted_video', 'claimed'].includes(String(status || ''))) return 'status-warning';
  if (['approved', 'qc_passed', 'completed', 'ready_delivery', 'done'].includes(String(status || ''))) return 'status-success';
  if (['in_progress', 'recording', 'editing', 'started'].includes(String(status || ''))) return 'status-working';
  return '';
}

function shouldShowSidebarStatus(pageKey: PageKey) {
  return pageKey !== 'smf03' && pageKey !== 'vsmf03';
}

function prefetchWorkspaceChunk(pageKey: PageKey) {
  if (pageKey === 'my-tasks' || pageKey === 'smf-my-tasks' || pageKey === 'vsmf-my-tasks' || pageKey === 'gsmf-my-tasks') {
    void import('@/pages/MyTasksBoardPage');
    return;
  }
  if (pageKey === 'training-knowledge' || pageKey === 'training-test') {
    void import('@/modules/vcontent/training/TrainingOperationsPages');
    return;
  }
  if (/^(smf01|vsmf01)$/.test(pageKey)) {
    void import('@/pages/InputGatePages');
    return;
  }
  if (/^(smf02|vsmf02)$/.test(pageKey)) {
    void import('@/pages/StoryboardStagePages');
    return;
  }
  if (pageKey === 'gsmf00') {
    void import('@/pages/GameCatalogPage');
    return;
  }
  if (/^gsmf0[1-4]$/.test(pageKey)) {
    if (pageKey === 'gsmf01') void import('@/pages/GameInputGatePage');
    if (pageKey === 'gsmf02') void import('@/pages/GamePrototypePage');
    if (pageKey === 'gsmf03') void import('@/pages/GameQcPage');
    return;
  }
  if (/^(smf03|vsmf03|smf04|vsmf04|smf05|vsmf05|smf06|vsmf06|smf07|vsmf07|smf08|vsmf08|smf09)$/.test(pageKey)) {
    void import('@/pages/ProductionStagePages');
  }
}

export function Sidebar({ currentPage }: { currentPage: PageKey }) {
  const navigate = useNavigate();
  const sidebarRef = useRef<HTMLElement | null>(null);
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const { role, isAllowed, sidebarCollapsed, toggleSidebar } = useAppShell();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const viewerRole = String(profile?.role || role || '').toLowerCase();
  const viewerEmail = profile?.email || '';
  const activePage = currentPage;
  const shouldPrefetchPreview = false;
  const previewOptionsByPage = useMemo<Record<string, MyTasksPreviewOptions>>(
    () => ({
      'my-tasks': { includeActivityLogs: true },
      smf01: { stageIndices: [0], includeActivityLogs: false },
      vsmf01: { stageIndices: [0], includeActivityLogs: false },
      smf02: { stageIndices: [1], includeActivityLogs: true },
      vsmf02: { stageIndices: [1], includeActivityLogs: true },
      smf03: { stageIndices: [2], includeActivityLogs: true },
      vsmf03: { stageIndices: [2], includeActivityLogs: true },
      smf04: { stageIndices: [3], includeActivityLogs: true },
      vsmf04: { stageIndices: [3], includeActivityLogs: true },
      smf05: { stageIndices: [4], includeActivityLogs: true },
      vsmf05: { stageIndices: [4], includeActivityLogs: true },
      smf06: { stageIndices: [5], includeActivityLogs: true },
      vsmf06: { stageIndices: [5], includeActivityLogs: true },
      smf07: { stageIndices: [6], includeActivityLogs: true },
      vsmf07: { stageIndices: [6], includeActivityLogs: true },
      smf08: { stageIndices: [7], includeActivityLogs: true },
      vsmf08: { stageIndices: [7], includeActivityLogs: true },
      smf09: { stageIndices: [8], includeActivityLogs: false },
    }),
    [],
  );
  const displayName = profile?.fullName || 'Tài khoản';
  const subtitle = role === 'hoc_gia' ? '' : profile?.title || ROLE_META[role].title;
  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: listOrdersWithProducts,
    staleTime: 1000 * 60,
  });
  const workflowQuery = useQuery({
    queryKey: ['workflow-records', 'sidebar-nav-status'],
    queryFn: () => listWorkflowRecords({ kinds: ['slide_design'], includeReviews: false, includeQuestionLibrary: false }),
    staleTime: 1000 * 60 * 10,
  });

  const orders = ordersQuery.data?.orders || [];
  const products = ordersQuery.data?.products || [];
  const slideDesigns = workflowQuery.data?.slideDesigns || [];

  const visibleSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => isAllowed(item.key)),
      })).filter((section) => section.items.length),
    [isAllowed],
  );

  const sidebarStatusByPage = useMemo(() => {
    const byPage = new Map<PageKey, { status: string; changedAt: number }>();
    const productById = new Map(products.map((item) => [item.id, item]));
    const orderById = new Map(orders.map((item) => [item.id, item]));

    for (const record of slideDesigns) {
      const product = productById.get(record.product_id);
      if (!product) continue;
      const order = orderById.get(product.order_id);
      if (!order) continue;

      const module = inferProductWorkflowModule(product.id, order.module);
      const pageKey = module === 'VIDEO' ? 'vsmf03' : module === 'ELN' ? 'smf03' : null;
      if (!pageKey) continue;

      const updatedAt = (record as { updated_at?: string | null }).updated_at;
      const changedAt = new Date(
        String(updatedAt || record.approved_at || record.returned_at || record.submitted_at || 0),
      ).getTime();
      const current = byPage.get(pageKey);
      const next = String(record.status || '');
      if (!current || changedAt >= current.changedAt) {
        byPage.set(pageKey, { status: next, changedAt });
      }
    }

    return byPage;
  }, [orders, products, slideDesigns]);

  const prefetchSpecialistPreview = (pageKey: PageKey) => {
    if (!shouldPrefetchPreview) return;
    if (!viewerEmail) return;
    const options = previewOptionsByPage[pageKey];
    if (!options) return;
    void queryClient.prefetchQuery({
      queryKey: getMyTasksPreviewQueryKey(viewerRole, viewerEmail, options),
      queryFn: () => fetchMyTasksPreview(viewerRole, viewerEmail || null, options),
      staleTime: 1000 * 60,
    });
  };

  useEffect(() => {
    if (sidebarCollapsed) return;
    const savedScroll = window.sessionStorage.getItem('vcontent.sidebar.scrollTop');
    if (savedScroll && sidebarRef.current) {
      sidebarRef.current.scrollTop = Number(savedScroll) || 0;
    }
    window.requestAnimationFrame(() => {
      activeLinkRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  }, [activePage, sidebarCollapsed]);

  return (
    <aside
      className={`sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}
      ref={sidebarRef}
      onScroll={(event) => {
        window.sessionStorage.setItem('vcontent.sidebar.scrollTop', String(event.currentTarget.scrollTop));
      }}
    >
      <div className="sidebar-inner">
        <div className="sidebar-brand">
          <div className="sidebar-badge">
            <img src="/vinabrain-logo-transparent.png" alt="" />
          </div>
          <div>
            <div className="sidebar-title">Vinabrain</div>
            <div className="sidebar-subtitle">{ROLE_META[role].label}</div>
          </div>
        </div>

        <Link className="sidebar-profile sidebar-profile-link" to="/profile">
          <div className="sidebar-profile-avatar">
            {profile?.avatarUrl ? <img src={profile.avatarUrl} alt={displayName} className="profile-avatar-image" /> : <span>{getInitials(displayName || 'VC')}</span>}
          </div>
          <div>
            <div className="profile-name">{displayName} — {ROLE_META[role].label}</div>
            {subtitle ? <div className="profile-role">{subtitle}</div> : null}
          </div>
        </Link>

        <nav className="sidebar-nav">
          {visibleSections.map((section) => (
            <div className="sidebar-section" key={section.title}>
              <div className={`sidebar-label tone-${section.tone || 'default'}`}>{section.title}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.key}
                  to={`/${item.key}`}
                  end
                  ref={item.key === activePage ? activeLinkRef : null}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(`/${item.key}`);
                  }}
                  onPointerDown={() => {
                    prefetchWorkspaceChunk(item.key);
                    prefetchSpecialistPreview(item.key);
                  }}
                  onMouseEnter={() => {
                    prefetchWorkspaceChunk(item.key);
                    prefetchSpecialistPreview(item.key);
                  }}
                  onFocus={() => {
                    prefetchWorkspaceChunk(item.key);
                    prefetchSpecialistPreview(item.key);
                  }}
                  className={() =>
                    `sidebar-link ${item.key === activePage ? 'is-active' : ''} ${shouldShowSidebarStatus(item.key) ? getSidebarStatusClass(sidebarStatusByPage.get(item.key)?.status) : ''}`.trim()
                  }
                >
                  <span className="sidebar-link-label">{PAGE_LABELS[item.key]}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <button
        type="button"
        className="sidebar-collapse-toggle"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? 'Mở thanh điều hướng' : 'Ẩn thanh điều hướng'}
        title={sidebarCollapsed ? 'Mở thanh điều hướng' : 'Ẩn thanh điều hướng'}
      >
        {sidebarCollapsed ? '⟩' : '⟨'}
      </button>
    </aside>
  );
}

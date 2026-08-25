import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';
import { getAllowedPages, type PageKey, type RoleKey } from '@/data/vcontent';

type AppShellContextValue = {
  role: RoleKey;
  setRole: (role: RoleKey) => void;
  isAllowed: (page: PageKey) => boolean;
  fallbackPage: PageKey;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
};

const AppShellContext = createContext<AppShellContextValue | null>(null);

export function AppShellProvider({ children }: PropsWithChildren) {
  const [role, setRole] = useState<RoleKey>('admin');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem('vcontent.sidebar.collapsed') === '1';
  });

  const value = useMemo<AppShellContextValue>(() => {
    const allowed = getAllowedPages(role);
    return {
      role,
      setRole,
      isAllowed: (page) => allowed.includes(page),
      fallbackPage: allowed[0] ?? 'dashboard',
      sidebarCollapsed,
      setSidebarCollapsed: (collapsed) => {
        setSidebarCollapsed(collapsed);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('vcontent.sidebar.collapsed', collapsed ? '1' : '0');
        }
      },
      toggleSidebar: () => {
        setSidebarCollapsed((prev) => {
          const next = !prev;
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('vcontent.sidebar.collapsed', next ? '1' : '0');
          }
          return next;
        });
      },
    };
  }, [role, sidebarCollapsed]);

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error('useAppShell must be used within AppShellProvider');
  }
  return context;
}

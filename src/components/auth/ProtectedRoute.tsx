import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSplash } from '@/components/system/AppSplash';

export function ProtectedRoute() {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AppSplash />;
  }

  if (session) {
    return <Outlet />;
  }

  if (!session) {
    const returnPath = `${location.pathname}${location.search}${location.hash}`;
    const loginPath = returnPath && returnPath !== '/login' ? `/login?next=${encodeURIComponent(returnPath)}` : '/login';
    return <Navigate to={loginPath} replace />;
  }

  return <Outlet />;
}

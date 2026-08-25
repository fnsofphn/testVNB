import { lazy, Suspense, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import { AppSplash } from '@/components/system/AppSplash';

const SuniTrainingLearnerLayout = lazy(() => import('./SuniTrainingLearnerLayout')
  .then((module) => ({ default: module.SuniTrainingLearnerLayout })));
const SuniTrainingManagerLayout = lazy(() => import('./SuniTrainingManagerLayout')
  .then((module) => ({ default: module.SuniTrainingManagerLayout })));

export function SuniTrainingRoleLayout({ children }: { children: ReactNode }) {
  const { loading, profile } = useAuth();
  if (loading) return <AppSplash />;
  const Layout = normalizeAppRole(profile?.role) === 'hoc_vien'
    ? SuniTrainingLearnerLayout
    : SuniTrainingManagerLayout;
  return (
    <Suspense fallback={<AppSplash />}>
      <Layout>{children}</Layout>
    </Suspense>
  );
}

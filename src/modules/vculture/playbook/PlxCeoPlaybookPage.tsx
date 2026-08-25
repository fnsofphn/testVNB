import { Navigate } from 'react-router-dom';
import { AppSplash } from '@/components/system/AppSplash';
import { useAuth } from '@/contexts/AuthContext';
import { normalizeAppRole } from '@/data/vcontent';
import playbookHtml from './plx-ceo-playbook.html?raw';

const PLAYBOOK_ALLOWED_ROLES = new Set(['admin', 'coaching_admin', 'coach', 'plx_playbook_viewer']);

export function PlxCeoPlaybookPage() {
  const { loading, profile } = useAuth();

  if (loading) {
    return <AppSplash />;
  }

  const viewerRole = normalizeAppRole(profile?.role);
  if (!PLAYBOOK_ALLOWED_ROLES.has(viewerRole)) {
    return <Navigate to="/login" replace />;
  }

  return (
    <iframe
      srcDoc={playbookHtml}
      title="PLX CEO PLAYBOOK"
      style={{ width: '100vw', height: '100vh', border: 0, display: 'block', background: '#0b0f1a' }}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    />
  );
}

import { Outlet } from 'react-router-dom';
import { ToastProvider } from '@/components/system/ToastProvider';

export function LearnerAppFrame() {
  return (
    <ToastProvider>
      <Outlet />
    </ToastProvider>
  );
}

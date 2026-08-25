import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type VLearningLearnerShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  footer?: ReactNode;
};

export function VLearningLearnerShell({ title, subtitle = 'Learning Space', children, action, footer }: VLearningLearnerShellProps) {
  return (
    <div className="elearning-learner-shell">
      <header className="elearning-learner-topbar">
        <Link className="elearning-learner-brand" to="/vlearning">
          <span>VB</span>
          <div>
            <strong>{title}</strong>
            <small>{subtitle}</small>
          </div>
        </Link>
        {action}
      </header>

      <main className="elearning-learner-content">{children}</main>

      {footer ? <footer className="elearning-learner-footer">{footer}</footer> : null}
    </div>
  );
}

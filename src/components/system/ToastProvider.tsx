import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastTone = 'success' | 'warning' | 'danger' | 'info';

type ToastInput = {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastItem = ToastInput & {
  id: string;
  tone: ToastTone;
};

type ToastContextValue = {
  pushToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function makeToastId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (input: ToastInput) => {
      const id = makeToastId();
      const durationMs = input.durationMs ?? 3200;
      const nextToast: ToastItem = {
        ...input,
        id,
        tone: input.tone || 'info',
      };

      setToasts((current) => [...current.slice(-3), nextToast]);
      window.setTimeout(() => dismissToast(id), durationMs);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div className={`toast-card tone-${toast.tone}`} key={toast.id} role="status">
            <div className="toast-card-head">
              <div className="toast-card-title">{toast.title}</div>
              <button className="toast-card-close" onClick={() => dismissToast(toast.id)} aria-label="Đóng thông báo">
                ×
              </button>
            </div>
            {toast.message ? <div className="toast-card-message">{toast.message}</div> : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider.');
  }
  return context;
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft } from 'lucide-react';

export default function TaskDetailLayer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const hasDraft = () => Boolean(ref.current?.querySelector('[data-detail-dirty="true"]'));
  function requestClose() {
    if (hasDraft()) setConfirmClose(true); else closeRef.current();
  }
  const requestRef = useRef(requestClose);
  requestRef.current = requestClose;
  useEffect(() => {
    const root = document.getElementById('root');
    const previous = document.activeElement as HTMLElement | null;
    const previousInert = root?.inert || false;
    const overflow = document.body.style.overflow;
    if (root) root.inert = true;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLButtonElement>('.detail-layer-back')?.focus();
    const beforeUnload = (event: BeforeUnloadEvent) => { if (hasDraft()) { event.preventDefault(); event.returnValue = ''; } };
    const keydown = (event: KeyboardEvent) => {
      if (document.querySelector('.assignment-dialog')) return;
      if (event.key === 'Escape') { event.preventDefault(); requestRef.current(); }
      if (event.key !== 'Tab' || !ref.current) return;
      const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary')).filter(node => node.getClientRects().length && !node.closest('[inert]'));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      if (root) root.inert = previousInert;
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('beforeunload', beforeUnload);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(<div className="vwork-training-operations training-overlay-portal detail-layer-backdrop" onMouseDown={requestClose}>
    <section className="detail-layer" ref={ref} role="dialog" aria-modal="true" aria-label={'Chi tiết công việc ' + title} onMouseDown={(event) => event.stopPropagation()}>
      <header className="detail-layer-toolbar"><button type="button" className="detail-layer-back" onClick={requestClose}><ArrowLeft size={18}/>Quay lại danh sách</button><span>Chi tiết công việc</span></header>
      <div className="detail-layer-scroll" inert={confirmClose}>{children}</div>
      {confirmClose && <div className="detail-close-confirm" role="alertdialog" aria-modal="true" aria-label="Input chưa lưu"><h3>Input chưa lưu</h3><p>Đóng sẽ bỏ phần đang sửa. Bạn có thể tiếp tục và lưu nháp trước.</p><button type="button" autoFocus onClick={() => setConfirmClose(false)}>Tiếp tục nhập</button><button type="button" onClick={() => { ref.current?.querySelectorAll('[data-detail-dirty]').forEach(node => node.removeAttribute('data-detail-dirty')); closeRef.current(); }}>Bỏ phần chưa lưu và đóng</button></div>}
    </section>
  </div>, document.body);
}

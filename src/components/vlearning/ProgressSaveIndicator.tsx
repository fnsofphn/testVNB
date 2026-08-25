import { ActivityBars } from './ActivityBars';
import type { ScormSyncStatus } from './ScormRuntimeBridge';

type ProgressSaveIndicatorProps = {
  status: ScormSyncStatus;
};

const STATUS_LABELS: Record<ScormSyncStatus, string> = {
  idle: 'Đã lưu',
  dirty: 'Chưa đồng bộ',
  saving: 'Đang lưu...',
  saved: 'Đã lưu',
  failed: 'Lỗi tạm thời',
};

export function ProgressSaveIndicator({ status }: ProgressSaveIndicatorProps) {
  return (
    <div className={`progress-save-indicator progress-save-indicator-${status}`} aria-live="polite">
      {status === 'saving' ? <ActivityBars active tone="blue" size="sm" label={STATUS_LABELS[status]} /> : <span aria-hidden="true" />}
      <strong>{STATUS_LABELS[status]}</strong>
    </div>
  );
}

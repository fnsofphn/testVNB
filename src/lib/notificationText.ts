import type { NotificationRow } from '@/services/vcontent';

const STAGE_LABELS: Record<string, string> = {
  'SMF-01': 'Đầu vào',
  'SMF-02': 'Storyboard',
  'SMF-03': 'Thiết kế slides',
  'SMF-04': 'QC Slides',
  'SMF-05': 'Thu âm',
  'SMF-06': 'QC Âm thanh',
  'SMF-07': 'Biên tập video',
  'SMF-08': 'QC Video',
  'SMF-09': 'SCORM + Trắc nghiệm',
  'VSMF-01': 'Đầu vào',
  'VSMF-02': 'Storyboard',
  'VSMF-03': 'Thiết kế slides',
  'VSMF-04': 'QC Slides',
  'VSMF-05': 'Thu âm',
  'VSMF-06': 'QC Âm thanh',
  'VSMF-07': 'Biên tập video',
  'VSMF-08': 'QC Video',
  'GSMF-01': 'Yêu cầu khởi chạy',
  'GSMF-02': 'Màn chạy thử trò chơi',
  'GSMF-03': 'QC trò chơi',
  'GSMF-04': 'Trò chơi hoàn chỉnh',
};

function normalizeStageCode(value: string | null | undefined) {
  const normalized = String(value || '').trim().toUpperCase().replace(/_/g, '-');
  const match = normalized.match(/^(SMF|VSMF|GSMF)-?(\d{1,2})$/);
  if (!match) return normalized;
  return `${match[1]}-${match[2].padStart(2, '0')}`;
}

function inferStageCodeFromIndex(item: NotificationRow) {
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const productId = String(metadata.product_id || '').toUpperCase();
  const stageIndex = Number(metadata.stage_index);
  if (!Number.isFinite(stageIndex)) return '';
  const prefix = productId.includes('_G') || productId.includes('-G') ? 'GSMF' : productId.includes('_H') || productId.includes('-H') ? 'VSMF' : 'SMF';
  return `${prefix}-${String(stageIndex + 1).padStart(2, '0')}`;
}

export function getNotificationStageDisplay(item: NotificationRow) {
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const stageCode = normalizeStageCode(String(metadata.stage_code || metadata.stage_label || '').trim()) || inferStageCodeFromIndex(item);
  if (!stageCode) return 'công đoạn mới';
  const label = STAGE_LABELS[stageCode];
  return label ? `${stageCode} ${label}` : stageCode;
}

export function isAssignmentNotification(item: NotificationRow) {
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  return (
    /giao|phan cong|phân công|assigned|duoc phan cong|được phân công/i.test(`${item.title || ''} ${item.body || ''} ${item.event_key || ''}`) ||
    /assigned/i.test(String(metadata.source || '')) ||
    Boolean(metadata.stage_code || metadata.stage_label || metadata.stage_index)
  );
}

export function formatAssignmentNotificationTitle(item: NotificationRow) {
  return `Bạn được giao ${getNotificationStageDisplay(item)}`;
}

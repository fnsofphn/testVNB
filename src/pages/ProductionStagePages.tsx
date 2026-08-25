import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppShell } from '@/contexts/AppShellContext';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { GeneralInfoSummary } from '@/components/workflow/GeneralInfoSummary';
import { useToast } from '@/components/system/ToastProvider';
import { normalizeAppRole } from '@/data/vcontent';
import { fetchMyTasksPreview, getMyTasksPreviewQueryKey, shouldUseMyTasksPreview } from '@/lib/myTasksPreview';
import { buildDisplayProductCodeMap, getDisplayOrderCode } from '@/lib/orderDisplayCodes';
import { buildTaskAssigneePatch, findAssignableProfile, isTaskExplicitlyAssignedToCurrentProfile, toAssignableProfiles } from '@/lib/taskAssignee';
import {
  archiveTasksForStage,
  createActivityLog,
  createScormReview,
  createSlideDesignReview,
  createVideoReview,
  createVoiceReview,
  deleteScormReview,
  deleteSlideDesignReview,
  deleteVideoReview,
  deleteVoiceReview,
  deleteIntakeAsset,
  deleteWorkflowAsset,
  ensureTaskForStage,
  ensureWorkflowRecord,
  inferProductWorkflowModule,
  listInputItems,
  listActivityLogs,
  listOrdersWithProducts,
  listProfiles,
  listTasks,
  listWorkflowRecords,
  updateOrder,
  updateProduct,
  updateTask,
  updateWorkflowRecord,
  uploadIntakeAsset,
  uploadWorkflowAsset,
  type OrderRow,
  type InputItemRow,
  type ProfileRow,
  type ProductRow,
  type ScormReviewRow,
  type SlideDesignReviewRow,
  type TaskRow,
  type VideoReviewRow,
  type VoiceReviewRow,
} from '@/services/vcontent';
import type { PageKey } from '@/data/vcontent';

const WORKFLOW_MAX_UPLOAD_MB = 200;
const WORKFLOW_MAX_UPLOAD_BYTES = WORKFLOW_MAX_UPLOAD_MB * 1024 * 1024;
const SLIDE_DESIGN_ACCEPTED_FILE_TYPES = '.ppt,.pptx,.pdf,.doc,.docx,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/x-zip-compressed';
const SLIDE_DESIGN_ACCEPTED_FILE_LABEL = 'PPT/PPTX/PDF/DOC/DOCX/ZIP';
const AUDIO_ACCEPTED_FILE_TYPES = '.mp3,.wav,.m4a,.aac,.ogg,audio/*';
const VIDEO_ACCEPTED_FILE_TYPES = '.mp4,.mov,.webm,.m4v,.avi,.zip,video/*,application/zip,application/x-zip-compressed';
const SUBTITLE_ACCEPTED_FILE_TYPES = '.srt,.vtt,.txt,.doc,.docx,.pdf,text/plain,text/vtt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const REVIEW_ACCEPTED_FILE_TYPES = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp,.zip,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,image/*,application/zip,application/x-zip-compressed';

function canSeeAllStageAssignments(role: string | null | undefined) {
  return ['admin', 'content_manager', 'production_manager', 'pm'].includes(normalizeAppRole(role));
}

function confirmArchiveStageAction(productId: string, stageCode: string) {
  return window.confirm(`Lưu trữ ${productId} khỏi ${stageCode}?\n\nSản phẩm sẽ được ẩn khỏi màn hiện tại. Bạn có chắc muốn tiếp tục?`);
}

type DomainConfig = {
  pageId: 'smf03' | 'vsmf03' | 'smf05' | 'vsmf05' | 'smf07' | 'vsmf07';
  module: 'ELN' | 'VIDEO';
  stageIndex: number;
  recordKind: 'slide_design' | 'voice_over' | 'video_edit';
  eye: string;
  title: string;
  subtitle: string;
  nextStagePage: string;
  nextStageRoute: PageKey;
  startLabel: string;
  submitLabel: string;
  stageCode: string;
};

type QcConfig = {
  pageId: 'smf04' | 'vsmf04' | 'smf06' | 'vsmf06' | 'smf08' | 'vsmf08';
  module: 'ELN' | 'VIDEO';
  stageIndex: number;
  recordKind: 'slide_design' | 'voice_over' | 'video_edit';
  eye: string;
  title: string;
  subtitle: string;
  previousStageIndex: number;
  nextStageIndex: number;
  nextStagePage: string;
  nextStageRoute: PageKey | null;
  previousStagePage: string;
  previousStageRoute: PageKey;
  stageCode: string;
};

type NoticeState = {
  tone: 'success' | 'danger';
  message: string;
} | null;

type UploadOperationState = {
  label: string;
  progress: number;
  tone: 'warning' | 'danger' | 'success' | 'violet' | 'neutral';
};

type WorkflowAssetItem = {
  url: string;
  label: string;
};

type SlideDesignMeta = {
  brandSpec: string;
  qcFeedbackFile: string;
};

const DOMAIN_CONFIGS: Record<DomainConfig['pageId'], DomainConfig> = {
  smf03: { pageId: 'smf03', module: 'ELN', stageIndex: 2, recordKind: 'slide_design', eye: 'Module 2 \u00b7 SMF-03', title: '\u0051\u0075\u1ea3\u006e \u006c\u00fd \u0054\u0068\u0069\u1ebf\u0074 \u006b\u1ebf Slides', subtitle: 'Workspace B3: thi\u1ebft k\u1ebf slides, l\u01b0u h\u1ed3 s\u01a1 v\u00e0 submit sang c\u1ed5ng QC B4.', nextStagePage: 'SMF-04', nextStageRoute: 'smf04', startLabel: 'X\u00e1c nh\u1eadn c\u00f4ng vi\u1ec7c', submitLabel: 'G\u1eedi duy\u1ec7t', stageCode: 'SMF-03' },
  vsmf03: { pageId: 'vsmf03', module: 'VIDEO', stageIndex: 2, recordKind: 'slide_design', eye: 'Module 3 \u00b7 VSMF-03', title: '\u0051\u0075\u1ea3\u006e \u006c\u00fd \u0054\u0068\u0069\u1ebf\u0074 \u006b\u1ebf Slides', subtitle: 'Workspace VSMF-03: thi\u1ebft k\u1ebf khung h\u00ecnh, l\u01b0u h\u1ed3 s\u01a1 v\u00e0 submit sang QC.', nextStagePage: 'VSMF-04', nextStageRoute: 'vsmf04', startLabel: 'X\u00e1c nh\u1eadn c\u00f4ng vi\u1ec7c', submitLabel: 'G\u1eedi duy\u1ec7t', stageCode: 'VSMF-03' },
  smf05: { pageId: 'smf05', module: 'ELN', stageIndex: 4, recordKind: 'voice_over', eye: 'Module 2 \u00b7 SMF-05', title: '\u0051\u0075\u1ea3\u006e \u006c\u00fd Thu Voice', subtitle: 'Workspace B5: thu voice, ch\u1ed1t handoff package v\u00e0 m\u1edf B6 Video.', nextStagePage: 'SMF-06', nextStageRoute: 'smf06', startLabel: 'X\u00e1c nh\u1eadn c\u00f4ng vi\u1ec7c', submitLabel: 'G\u1eedi duy\u1ec7t', stageCode: 'SMF-05' },
  vsmf05: { pageId: 'vsmf05', module: 'VIDEO', stageIndex: 4, recordKind: 'voice_over', eye: 'Module 3 \u00b7 VSMF-05', title: '\u0051\u0075\u1ea3\u006e \u006c\u00fd Thu Voice', subtitle: 'Workspace VSMF-05: thu voice video v\u00e0 chuy\u1ec3n sang VSMF-06.', nextStagePage: 'VSMF-06', nextStageRoute: 'vsmf06', startLabel: 'X\u00e1c nh\u1eadn c\u00f4ng vi\u1ec7c', submitLabel: 'G\u1eedi duy\u1ec7t', stageCode: 'VSMF-05' },
  smf07: { pageId: 'smf07', module: 'ELN', stageIndex: 6, recordKind: 'video_edit', eye: 'Module 2 \u00b7 SMF-07', title: '\u0051\u0075\u1ea3\u006e \u006c\u00fd Bi\u00ean t\u1eadp Video', subtitle: 'Workspace B7: d\u1ef1ng video, render, subtitle v\u00e0 submit sang B8 QC Video.', nextStagePage: 'SMF-08', nextStageRoute: 'smf08', startLabel: 'X\u00e1c nh\u1eadn c\u00f4ng vi\u1ec7c', submitLabel: 'G\u1eedi duy\u1ec7t', stageCode: 'SMF-07' },
  vsmf07: { pageId: 'vsmf07', module: 'VIDEO', stageIndex: 6, recordKind: 'video_edit', eye: 'Module 3 \u00b7 VSMF-07', title: '\u0051\u0075\u1ea3\u006e \u006c\u00fd Bi\u00ean t\u1eadp Video', subtitle: 'Workspace VSMF-07: d\u1ef1ng video, render v\u00e0 submit sang QC Video.', nextStagePage: 'VSMF-08', nextStageRoute: 'vsmf08', startLabel: 'X\u00e1c nh\u1eadn c\u00f4ng vi\u1ec7c', submitLabel: 'G\u1eedi duy\u1ec7t', stageCode: 'VSMF-07' },
};

const QC_CONFIGS: Record<QcConfig['pageId'], QcConfig> = {
  smf04: { pageId: 'smf04', module: 'ELN', stageIndex: 3, recordKind: 'slide_design', eye: 'Module 2 \u00b7 SMF-04', title: 'QC Slides', subtitle: 'Gate B4: claim review, pass/fail v\u00e0 tr\u1ea3 v\u1ec1 B3 khi c\u1ea7n.', previousStageIndex: 2, nextStageIndex: 4, nextStagePage: 'SMF-05', nextStageRoute: 'smf05', previousStagePage: 'SMF-03', previousStageRoute: 'smf03', stageCode: 'SMF-04' },
  vsmf04: { pageId: 'vsmf04', module: 'VIDEO', stageIndex: 3, recordKind: 'slide_design', eye: 'Module 3 \u00b7 VSMF-04', title: 'QC Slides', subtitle: 'Gate VSMF-04: review khung h\u00ecnh, pass/fail v\u00e0 tr\u1ea3 v\u1ec1 VSMF-03.', previousStageIndex: 2, nextStageIndex: 4, nextStagePage: 'VSMF-05', nextStageRoute: 'vsmf05', previousStagePage: 'VSMF-03', previousStageRoute: 'vsmf03', stageCode: 'VSMF-04' },
  smf06: { pageId: 'smf06', module: 'ELN', stageIndex: 5, recordKind: 'voice_over', eye: 'Module 2 \u00b7 SMF-06', title: 'QC \u00c2m thanh', subtitle: 'Gate B6: review voice, pass/fail v\u00e0 tr\u1ea3 v\u1ec1 B5 khi c\u1ea7n.', previousStageIndex: 4, nextStageIndex: 6, nextStagePage: 'SMF-07', nextStageRoute: 'smf07', previousStagePage: 'SMF-05', previousStageRoute: 'smf05', stageCode: 'SMF-06' },
  vsmf06: { pageId: 'vsmf06', module: 'VIDEO', stageIndex: 5, recordKind: 'voice_over', eye: 'Module 3 \u00b7 VSMF-06', title: 'QC \u00c2m thanh', subtitle: 'Gate VSMF-06: review voice, pass/fail v\u00e0 tr\u1ea3 v\u1ec1 VSMF-05.', previousStageIndex: 4, nextStageIndex: 6, nextStagePage: 'VSMF-07', nextStageRoute: 'vsmf07', previousStagePage: 'VSMF-05', previousStageRoute: 'vsmf05', stageCode: 'VSMF-06' },
  smf08: { pageId: 'smf08', module: 'ELN', stageIndex: 7, recordKind: 'video_edit', eye: 'Module 2 \u00b7 SMF-08', title: 'QC Video', subtitle: 'Gate B8: review video cu\u1ed1i, pass/fail v\u00e0 m\u1edf SMF-09.', previousStageIndex: 6, nextStageIndex: 8, nextStagePage: 'SMF-09', nextStageRoute: 'smf09', previousStagePage: 'SMF-07', previousStageRoute: 'smf07', stageCode: 'SMF-08' },
  vsmf08: { pageId: 'vsmf08', module: 'VIDEO', stageIndex: 7, recordKind: 'video_edit', eye: 'Module 3 \u00b7 VSMF-08', title: 'QC Video', subtitle: 'Gate VSMF-08: review video cu\u1ed1i, pass/fail v\u00e0 m\u1edf b\u00e0n giao.', previousStageIndex: 6, nextStageIndex: 8, nextStagePage: 'Ready delivery', nextStageRoute: null, previousStagePage: 'VSMF-07', previousStageRoute: 'vsmf07', stageCode: 'VSMF-08' },
};

const SLIDE_CHECKLIST = [
  { key: 'brand_font', label: 'Brand font \u0111\u00fang guideline' },
  { key: 'color_palette', label: 'Color palette \u0111\u00fang brand' },
  { key: 'storyboard_alignment', label: 'B\u00e1m storyboard \u0111\u00e3 duy\u1ec7t' },
] as const;

const VOICE_CHECKLIST = [
  { key: 'script_locked', label: 'Script \u0111\u00e3 kh\u00f3a' },
  { key: 'pronunciation_checked', label: 'Ph\u00e1t \u00e2m \u0111\u00e3 ki\u1ec3m tra' },
  { key: 'pacing_aligned', label: 'Nh\u1ecbp \u0111\u1ecdc ph\u00f9 h\u1ee3p' },
  { key: 'noise_cleaned', label: '\u0110\u00e3 x\u1eed l\u00fd noise' },
] as const;

const VIDEO_CHECKLIST = [
  { key: 'voice_synced', label: 'Voice sync \u0111\u00fang timeline' },
  { key: 'transitions_checked', label: 'Transition \u1ed5n \u0111\u1ecbnh' },
  { key: 'subtitle_embedded', label: 'Subtitle \u0111\u00e3 g\u1eafn' },
  { key: 'branding_applied', label: 'Branding \u0111\u00e3 \u00e1p d\u1ee5ng' },
] as const;

function parseWorkflowStatusDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPastWorkflowDeadline(value: string | null | undefined) {
  const deadline = parseWorkflowStatusDate(value);
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadline.getTime() < today.getTime();
}

function isCompletedWorkflowStatus(status: string) {
  return ['approved', 'qc_passed', 'completed', 'ready_delivery', 'done'].includes(status);
}

function getDeadlineAwareStatus(status: string | null | undefined, deadline: string | null | undefined) {
  const normalized = String(status || 'todo');
  if (!isCompletedWorkflowStatus(normalized) && isPastWorkflowDeadline(deadline)) return 'overdue';
  return normalized;
}

function toneForStatus(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' | 'purple' {
  if (['overdue', 'changes_requested', 'qc_fail', 'fail', 'rejected'].includes(status)) return 'danger';
  if (status === 'todo') return 'purple';
  if (['submitted', 'review', 'in_review', 'submitted_qc', 'submitted_video', 'packaging', 'building_quiz', 'claimed'].includes(status)) return 'warning';
  if (['approved', 'qc_passed', 'completed', 'ready_delivery', 'done'].includes(status)) return 'success';
  if (['in_progress', 'recording', 'editing', 'started'].includes(status)) return 'violet';
  return 'neutral';
}

function getWorkflowStatusLabel(status: string | null | undefined) {
  switch (String(status || '')) {
    case 'todo':
      return 'Chưa bắt đầu';
    case 'draft':
      return 'Bản nháp';
    case 'in_progress':
    case 'started':
      return 'Đang làm';
    case 'recording':
      return 'Đang thu';
    case 'editing':
      return 'Đang biên tập';
    case 'review':
    case 'in_review':
    case 'claimed':
      return 'Đang duyệt';
    case 'submitted':
      return 'Đã gửi';
    case 'submitted_qc':
      return 'Đã gửi QC';
    case 'submitted_video':
      return 'Đã gửi QC';
    case 'changes_requested':
    case 'qc_fail':
    case 'fail':
    case 'rejected':
      return 'Bị trả lại';
    case 'approved':
      return 'Đã duyệt';
    case 'qc_passed':
      return 'QC đạt';
    case 'completed':
    case 'done':
      return 'Hoàn thành';
    case 'ready_delivery':
      return 'Sẵn sàng bàn giao';
    case 'overdue':
      return 'Quá hạn';
    default:
      return String(status || 'Chưa bắt đầu');
  }
}

function getReviewDecisionLabel(decision: string | null | undefined) {
  switch (String(decision || '')) {
    case 'submitted':
      return 'Đã gửi duyệt';
    case 'changes_requested':
      return 'Bị trả lại';
    case 'approved':
      return 'Đã duyệt';
    default:
      return String(decision || '-');
  }
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

function formatDisplayDateTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

function localizeWorkflowText(text: string | null | undefined) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value
    .replace(/submitted to QC video\./gi, 'đã gửi sang QC video.')
    .replace(/submitted to QC gate\./gi, 'đã gửi sang cổng QC.')
    .replace(/submitted to video\./gi, 'đã chuyển sang bước video.')
    .replace(/QC passed\./gi, 'QC đã duyệt.')
    .replace(/QC failed\. Return to previous step\./gi, 'QC chưa đạt, trả về bước trước.')
    .replace(/approved at/gi, 'được duyệt tại')
    .replace(/returned to/gi, 'bị trả về')
    .replace(/started/gi, 'bắt đầu')
    .replace(/submitted/gi, 'đã gửi')
    .replace(/claimed/gi, 'đã nhận review');
}

function getWorkflowStatusFrameClass(status: string) {
  if (['in_progress', 'recording', 'editing', 'started'].includes(status)) return 'status-working';
  if (['submitted', 'review', 'in_review', 'submitted_qc', 'submitted_video', 'claimed'].includes(status)) return 'status-submitted';
  if (['changes_requested', 'qc_fail', 'fail', 'rejected'].includes(status)) return 'status-returned';
  if (['approved', 'qc_passed', 'completed', 'ready_delivery', 'done'].includes(status)) return 'status-approved';
  return 'status-neutral';
}

function getWorkflowEventTone(actionType: string) {
  if (actionType === 'workflow_step_started') return 'status-working';
  if (actionType === 'workflow_step_submitted') return 'status-submitted';
  if (actionType === 'workflow_step_returned') return 'status-returned';
  if (actionType === 'workflow_step_approved') return 'status-approved';
  return 'status-neutral';
}

function getWorkflowEventLabel(actionType: string) {
  if (actionType === 'workflow_step_started') return 'Bắt đầu';
  if (actionType === 'workflow_step_submitted') return 'Gửi QC';
  if (actionType === 'workflow_step_returned') return 'Bị trả lại';
  if (actionType === 'workflow_step_approved') return 'Được duyệt';
  if (actionType === 'workflow_review_claimed') return 'QC nhận review';
  return actionType;
}

function formatWorkflowLogLine(log: { action_type: string; happened_at: string }) {
  return `${getWorkflowEventLabel(log.action_type)} ${new Date(log.happened_at).toLocaleString('vi-VN')}`;
}

function WorkflowLogItem({ log }: { log: { id: string; action_type: string; happened_at: string } }) {
  return (
    <div className={`bullet-item workflow-status-tile ${getWorkflowEventTone(log.action_type)}`}>
      <div className="fw6">{formatWorkflowLogLine(log)}</div>
    </div>
  );
}

function getStatusFromStageEvent(actionType: string, fallbackStatus: string) {
  if (actionType === 'workflow_step_returned') return 'changes_requested';
  if (actionType === 'workflow_step_approved') return 'qc_passed';
  if (actionType === 'workflow_step_submitted') {
    return fallbackStatus === 'submitted_video' ? 'submitted_video' : 'submitted_qc';
  }
  if (actionType === 'workflow_review_claimed') return 'claimed';
  if (actionType === 'workflow_step_started') return 'in_progress';
  return fallbackStatus;
}

function isOpenWorkflowStatus(status: string | null | undefined) {
  return ['todo', 'draft', 'in_progress', 'recording', 'editing', 'started', 'submitted', 'review', 'in_review', 'submitted_qc', 'submitted_video', 'claimed', 'changes_requested', 'qc_fail', 'fail', 'rejected'].includes(String(status || ''));
}

function isRuntimeWorkflowStatus(status: string | null | undefined) {
  return [
    'in_progress',
    'recording',
    'editing',
    'started',
    'submitted',
    'review',
    'in_review',
    'submitted_qc',
    'submitted_video',
    'approved',
    'qc_passed',
    'completed',
    'done',
    'ready_delivery',
  ].includes(String(status || ''));
}

function canArchiveStageRow(row: { product: ProductRow; task: TaskRow | null; record: any | null }, stageIndex: number) {
  if (!row.task) return false;
  const rawStatus = String(row.record?.status || row.task.status || '').toLowerCase();
  return (
    Number(row.product.current_stage_index ?? 0) > stageIndex ||
    ['submitted_qc', 'submitted_video', 'qc_passed', 'approved', 'completed', 'done', 'ready_delivery'].includes(rawStatus)
  );
}

function getRowsForStage(
  orders: OrderRow[],
  products: ProductRow[],
  tasks: TaskRow[],
  records: Array<any>,
  module: 'ELN' | 'VIDEO',
  stageIndices: number[],
  forceIncludeKeys?: Set<string>,
) {
  const stageIndexSet = new Set(stageIndices);
  const productsByOrderId = new Map<string, ProductRow[]>();
  const activeTaskByKey = new Map<string, TaskRow>();
  const recordByKey = new Map<string, any>();

  for (const product of products) {
    const bucket = productsByOrderId.get(product.order_id) || [];
    bucket.push(product);
    productsByOrderId.set(product.order_id, bucket);
  }

  for (const task of tasks) {
    if (task.archived || !stageIndexSet.has(task.stage_index)) continue;
    const key = `${task.order_id}::${task.product_id}`;
    if (!activeTaskByKey.has(key)) {
      activeTaskByKey.set(key, task);
    }
  }

  for (const record of records) {
    const key = `${record.order_id}::${record.product_id}`;
    if (!recordByKey.has(key)) {
      recordByKey.set(key, record);
    }
  }

  const rows: Array<{ order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }> = [];
  for (const order of orders) {
    const orderProducts = productsByOrderId.get(order.id) || [];
    for (const product of orderProducts) {
      if (inferProductWorkflowModule(product.id, order.module) !== module) continue;
      const key = `${order.id}::${product.id}`;
      const activeTask = activeTaskByKey.get(key) || null;
      const record = recordByKey.get(key) || null;
      const isAtCurrentStage = stageIndexSet.has(product.current_stage_index);
      const hasOpenRecord = Boolean(record && isOpenWorkflowStatus(record.status));
      const isForceIncluded = Boolean(forceIncludeKeys?.has(key));
      if (!activeTask && !isAtCurrentStage && !hasOpenRecord && !isForceIncluded) continue;
      rows.push({ order, product, task: activeTask, record });
    }
  }

  return rows;
}

function findWorkflowRecordByProduct(entries: Array<any> | undefined, orderId: string, productId: string) {
  return (entries || []).find((entry) => entry.order_id === orderId && entry.product_id === productId) || null;
}

function findVoiceScriptInputItem(
  entries: InputItemRow[],
  selected: { order: OrderRow; product: ProductRow } | null,
  module: 'ELN' | 'VIDEO',
) {
  if (!selected) return null;
  const matchingItems = entries.filter(
    (item) =>
      item.order_id === selected.order.id &&
      item.product_id === selected.product.id &&
      item.module === module &&
      (item.item_code === 'voice_script' || item.item_code === 'lesson_script'),
  );
  return (
    matchingItems.find((item) => item.item_code === 'voice_script' && (item.file_url || item.file_name)) ||
    matchingItems.find((item) => item.item_code === 'lesson_script' && (item.file_url || item.file_name)) ||
    matchingItems.find((item) => item.item_code === 'voice_script') ||
    matchingItems.find((item) => item.item_code === 'lesson_script') ||
    null
  );
}

function getAssetLabel(value: string | null | undefined) {
  if (!value) return 'Ch\u01b0a c\u00f3 file';
  if (isAssetUrl(value)) {
    try {
      const url = new URL(value, window.location.origin);
      const requestedName = url.searchParams.get('filename');
      if (requestedName) return requestedName;
      return decodeURIComponent(url.pathname.slice(url.pathname.lastIndexOf('/') + 1)) || value;
    } catch {
      const clean = value.split('?')[0];
      return decodeURIComponent(clean.slice(clean.lastIndexOf('/') + 1)) || value;
    }
  }
  return value;
}

function renderInlineFeedbackText(value: string) {
  const parts = value.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function RichFeedbackText({ text }: { text: string | null | undefined }) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return null;

  return (
    <div className="workflow-feedback-rich">
      {lines.map((line, index) => {
        const checklistMatch = line.match(/^(?:[-*]\s*)?\[([ xX])\]\s*(.+)$/);
        if (checklistMatch) {
          const checked = checklistMatch[1].toLowerCase() === 'x';
          return (
            <div className={`workflow-feedback-check ${checked ? 'is-checked' : ''}`} key={`${line}-${index}`}>
              <span className="workflow-feedback-box" aria-hidden="true">{checked ? '✓' : ''}</span>
              <span>{renderInlineFeedbackText(checklistMatch[2])}</span>
            </div>
          );
        }

        const bulletMatch = line.match(/^[-*]\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div className="workflow-feedback-bullet" key={`${line}-${index}`}>
              <span aria-hidden="true">•</span>
              <span>{renderInlineFeedbackText(bulletMatch[1])}</span>
            </div>
          );
        }

        return <p key={`${line}-${index}`}>{renderInlineFeedbackText(line)}</p>;
      })}
    </div>
  );
}

function parseAssetItems(value: string | null | undefined): WorkflowAssetItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          if (typeof item === 'string') {
            return { url: item, label: getAssetLabel(item) };
          }
          if (item && typeof item === 'object' && typeof item.url === 'string') {
            return { url: item.url, label: typeof item.label === 'string' && item.label ? item.label : getAssetLabel(item.url) };
          }
          return null;
        })
        .filter(Boolean) as WorkflowAssetItem[];
    }
  } catch {
    // Keep backward compatibility for single-file values.
  }
  return [{ url: value, label: getAssetLabel(value) }];
}

function serializeAssetItems(items: WorkflowAssetItem[]) {
  if (!items.length) return null;
  if (items.length === 1) return items[0].url;
  return JSON.stringify(items);
}

function getAssetSummary(value: string | null | undefined) {
  const items = parseAssetItems(value);
  if (!items.length) return 'Ch\u01b0a c\u00f3 file';
  if (items.length === 1) return items[0].label;
  return `${items.length} file đã upload`;
}

function isAssetUrl(value: string | null | undefined) {
  return Boolean(value && (/^https?:\/\//i.test(value) || value.startsWith('/api/')));
}

function parseSlideDesignMeta(value: string | null | undefined): SlideDesignMeta {
  if (!value) return { brandSpec: '', qcFeedbackFile: '' };
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        brandSpec: typeof parsed.brandSpec === 'string' ? parsed.brandSpec : '',
        qcFeedbackFile: typeof parsed.qcFeedbackFile === 'string' ? parsed.qcFeedbackFile : '',
      };
    }
  } catch {
    // Backward compatible with legacy plain-text brand spec values.
  }
  return { brandSpec: value, qcFeedbackFile: '' };
}

function isManualDriveProductLink(value: string | null | undefined) {
  return /https?:\/\/(?:drive|docs)\.google\.com\//i.test(String(value || '').trim());
}

function getManualSlideProductLink(value: string | null | undefined) {
  const parsed = parseSlideDesignMeta(value);
  const link = String(parsed.brandSpec || '').trim();
  return isManualDriveProductLink(link) ? link : '';
}

function serializeSlideDesignMeta(meta: SlideDesignMeta) {
  if (!meta.brandSpec && !meta.qcFeedbackFile) return null;
  if (!meta.qcFeedbackFile) return meta.brandSpec || null;
  return JSON.stringify(meta);
}

function getSlideDesignFeedbackFile(record: any) {
  return parseSlideDesignMeta(record?.brand_spec).qcFeedbackFile || '';
}

function readWorkflowChecklist(value: any) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function getVideoEditQcFeedbackFile(record: any) {
  return String(readWorkflowChecklist(record?.checklist).qcFeedbackFile || '').trim();
}

function renderNotice(notice: NoticeState) {
  return notice ? <div className={`bullet-item ${notice.tone === 'danger' ? 'tone-danger' : 'tone-success'}`}>{notice.message}</div> : null;
}

function formatErrorMessage(error: unknown) {
  if (!error) return '\u0110\u00e3 x\u1ea3y ra l\u1ed7i.';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
    return maybe.message || maybe.details || maybe.hint || maybe.code || JSON.stringify(error);
  }
  return String(error);
}

function isOptionalWorkflowSideEffectError(error: unknown) {
  const message = formatErrorMessage(error).toLowerCase();
  return message.includes('row-level security') || message.includes('permission denied');
}

async function runOptionalWorkflowSideEffect<T>(operation: Promise<T>) {
  try {
    return await operation;
  } catch (error) {
    if (isOptionalWorkflowSideEffectError(error)) return null;
    throw error;
  }
}

function getDomainRecordAssigneeProfileId(recordKind: DomainConfig['recordKind'], record: any) {
  if (!record) return '';
  if (recordKind === 'slide_design') return String(record.designer_profile_id || '');
  if (recordKind === 'voice_over') return String(record.talent_profile_id || '');
  return String(record.editor_profile_id || '');
}

function getDomainRecordAssigneePatch(recordKind: DomainConfig['recordKind'], profileId: string) {
  if (recordKind === 'slide_design') return { designer_profile_id: profileId || null };
  if (recordKind === 'voice_over') return { talent_profile_id: profileId || null };
  return { editor_profile_id: profileId || null };
}

function getDomainRowAssigneeLabel(
  recordKind: DomainConfig['recordKind'],
  row: { task: TaskRow | null; record: any | null },
  profileNameById: Map<string, string>,
) {
  const profileId = row.task?.assignee_profile_id || getDomainRecordAssigneeProfileId(recordKind, row.record);
  if (profileId) return profileNameById.get(profileId) || row.task?.assignee || 'Chưa phân công';
  return row.task?.assignee || 'Chưa phân công';
}

function getQcRowAssigneeLabel(row: { task: TaskRow | null; record: any | null }, profileNameById: Map<string, string>) {
  const profileId = row.task?.assignee_profile_id || getQcReviewerProfileId(row.record);
  if (profileId) return profileNameById.get(profileId) || row.task?.assignee || 'Chưa phân công';
  return row.task?.assignee || 'Chưa phân công';
}

function getScormRowAssigneeLabel(row: { task: TaskRow | null; record: any | null }, profileNameById: Map<string, string>) {
  const profileId = row.task?.assignee_profile_id || String(row.record?.owner_profile_id || '');
  if (profileId) return profileNameById.get(profileId) || row.task?.assignee || 'Chưa phân công';
  return row.task?.assignee || 'Chưa phân công';
}

function getQcReviewerProfileId(record: any) {
  return String(record?.qc_reviewer_profile_id || record?.handoff_profile_id || '');
}

function usesVideoLinkOnly(pageId: PageKey) {
  return pageId === 'smf07' || pageId === 'vsmf07';
}

function supportsSlideDesignProductLink(pageId: PageKey) {
  return pageId === 'smf03' || pageId === 'vsmf03';
}

function validateWorkflowFile(file: File) {
  if (file.size > WORKFLOW_MAX_UPLOAD_BYTES) {
    throw new Error(`File vượt quá ${WORKFLOW_MAX_UPLOAD_MB}MB.`);
  }
}

function formatRelativeUploadMeta(value: string | null | undefined) {
  if (!value) return 'Vừa cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Vừa cập nhật';
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) return `Cập nhật ${diffHours} giờ trước`;
  const diffDays = Math.max(1, Math.round(diffHours / 24));
  return `Cập nhật ${diffDays} ngày trước`;
}

function UploadProgressPanel({ operation }: { operation: UploadOperationState | null | undefined }) {
  if (!operation) return null;
  return (
    <div className="intake-progress-panel">
      <div className="intake-progress-head">
        <span>{operation.label}</span>
        <span>{operation.progress}%</span>
      </div>
      <div className="progress-track intake-progress-track">
        <div className={`progress-fill tone-${operation.tone}`} style={{ width: `${operation.progress}%` }} />
      </div>
    </div>
  );
}

function FileActions({
  label,
  assetValue,
  onUpload,
  onDelete,
  operation,
  accept,
}: {
  label: string;
  assetValue: string | null | undefined;
  onUpload: (file: File) => void;
  onDelete: () => void;
  operation?: UploadOperationState | null;
  accept?: string;
}) {
  return (
    <div className="asset-toolbar">
      <label className="btn btn-ghost">
        {label}
        <input
          type="file"
          accept={accept}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            onUpload(file);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {assetValue ? (
        <>
          {isAssetUrl(assetValue) ? (
            <a className="btn btn-ghost" href={assetValue} target="_blank" rel="noreferrer">
              {'Tải/xem file'}
            </a>
          ) : null}
          <button className="btn btn-ghost" onClick={onDelete}>
            {'Xóa file'}
          </button>
          <div className="muted-text">{getAssetLabel(assetValue)}</div>
        </>
      ) : (
        <div className="muted-text">{'Chưa có file đã upload.'}</div>
      )}
      <UploadProgressPanel operation={operation} />
    </div>
  );
}
function MultiFileActions({
  label,
  assetValue,
  onUpload,
  onDeleteItem,
  operation,
  accept,
}: {
  label: string;
  assetValue: string | null | undefined;
  onUpload: (files: File[]) => void;
  onDeleteItem: (fileUrl: string) => void;
  operation?: UploadOperationState | null;
  accept?: string;
}) {
  const items = parseAssetItems(assetValue);
  return (
    <div className="asset-toolbar">
      <label className="btn btn-ghost">
        {label}
        <input
          type="file"
          multiple
          accept={accept}
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files || []);
            if (!files.length) return;
            onUpload(files);
            event.currentTarget.value = '';
          }}
        />
      </label>
      {items.length ? (
        <div className="stack compact full">
          {items.map((item) => (
            <div className="intake-file-row" key={item.url}>
              <div className="muted-text intake-file-name">{item.label}</div>
              <div className="intake-inline-actions">
                {isAssetUrl(item.url) ? (
                  <a className="btn btn-ghost btn-small" href={item.url} target="_blank" rel="noreferrer">
                    {'T\u1ea3i/xem file'}
                  </a>
                ) : null}
                <button className="btn btn-ghost btn-small" onClick={() => onDeleteItem(item.url)}>
                  {'X\u00f3a file'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="muted-text">{'Ch\u01b0a c\u00f3 file \u0111\u00e3 upload.'}</div>
      )}
      <UploadProgressPanel operation={operation} />
    </div>
  );
}

function ReferenceAsset({ label, assetValue, emptyLabel }: { label: string; assetValue: string | null | undefined; emptyLabel: string }) {
  return (
    <div className="asset-toolbar">
      <div className="bullet-item">{label}</div>
      {assetValue ? (
        <>
          {isAssetUrl(assetValue) ? (
            <a className="btn btn-ghost" href={assetValue} target="_blank" rel="noreferrer">
                  {'Mở/tải file'}
            </a>
          ) : null}
          <div className="muted-text">{getAssetLabel(assetValue)}</div>
        </>
      ) : (
        <div className="muted-text">{emptyLabel}</div>
      )}
    </div>
  );
}

function ReferenceDownloadBar({
  title,
  meta,
  note,
  url,
  emptyLabel,
}: {
  title: string;
  meta: string;
  note?: string | null;
  url: string | null | undefined;
  emptyLabel: string;
}) {
  return (
    <div className="storyboard-input-bar">
      <div className="storyboard-input-bar-file">
        <div className="storyboard-input-bar-icon" aria-hidden="true">
          <span className="storyboard-input-bar-page">
            <span className="storyboard-input-bar-page-fold" />
            <span className="storyboard-input-bar-page-line line-1" />
            <span className="storyboard-input-bar-page-line line-2" />
          </span>
        </div>
        <div className="storyboard-input-bar-copy">
          <div className="storyboard-input-bar-title">{title}</div>
          <div className="storyboard-input-bar-meta">{meta}</div>
          <RichFeedbackText text={note} />
        </div>
      </div>
      {url ? (
        <a className="storyboard-input-bar-download" href={url} target="_blank" rel="noreferrer">
          <span aria-hidden="true">↓</span>
          <span>Xem</span>
        </a>
      ) : (
        <div className="storyboard-input-bar-empty">{emptyLabel}</div>
      )}
    </div>
  );
}

function StageQueue({ rows, selectedKey, setSelectedKey, getMeta, colorizeFrame = false }: { rows: Array<{ order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }>; selectedKey: string; setSelectedKey: (value: string) => void; getMeta: (row: { order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }) => string; colorizeFrame?: boolean }) {
  return (
    <div className="stack">
      {rows.map((row) => {
        const active = `${row.order.id}::${row.product.id}` === selectedKey;
        const status = row.record?.status || row.task?.status || 'todo';
        const statusFrameClass = colorizeFrame ? ` ${getWorkflowStatusFrameClass(status)}` : '';
        return (
          <button key={`${row.order.id}-${row.product.id}`} className={`list-item storyboard-queue-item workflow-nav-card${statusFrameClass}${active ? ' active' : ''}`} onClick={() => setSelectedKey(`${row.order.id}::${row.product.id}`)}>
            <div className="workflow-nav-main">
              <div className="workflow-nav-code">{row.product.id}</div>
              <div className="workflow-nav-meta">{row.order.id}</div>
              <div className="workflow-nav-meta">{row.product.name}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function DomainStagePage({ pageId }: { pageId: PageKey }) {
  const config = DOMAIN_CONFIGS[pageId as DomainConfig['pageId']];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, loading } = useAuth();
  const { role: shellRole } = useAppShell();
  const { pushToast } = useToast();
  const viewerRole = normalizeAppRole(profile?.role || shellRole);
  const shouldAutoNavigate = canSeeAllStageAssignments(viewerRole);
  const isAdminRole = canSeeAllStageAssignments(viewerRole);
  const isInternalRole = Boolean(viewerRole && !['client', 'client_director'].includes(viewerRole));
  const queryClient = useQueryClient();
  const isSlideDesignStage = config.recordKind === 'slide_design';
  const isVoiceStage = config.recordKind === 'voice_over';
  const isVideoStage = config.recordKind === 'video_edit';
  const shouldUseServerPreview = !loading && shouldUseMyTasksPreview(viewerRole);
  const previewOptions = useMemo(() => ({ stageIndices: [config.stageIndex], includeActivityLogs: true }), [config.stageIndex]);
  const workflowKinds = config.recordKind === 'slide_design'
    ? ['slide_design', 'storyboard']
    : config.recordKind === 'voice_over'
      ? ['voice_over', 'storyboard', 'slide_design']
      : ['video_edit', 'voice_over', 'slide_design'];
  const previewQuery = useQuery({
    queryKey: getMyTasksPreviewQueryKey(viewerRole, profile?.email || '', previewOptions),
    queryFn: () => fetchMyTasksPreview(viewerRole, profile?.email || null, previewOptions),
    enabled: shouldUseServerPreview,
    staleTime: 1000 * 60,
  });
  const useFallbackQueries = !shouldUseServerPreview || previewQuery.isError;
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts, staleTime: 1000 * 60, enabled: useFallbackQueries });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'stage', config.stageIndex], queryFn: () => listTasks({ stageIndices: [config.stageIndex] }), staleTime: 1000 * 60, enabled: useFallbackQueries });
  const workflowQuery = useQuery({
    queryKey: ['workflow-records', ...workflowKinds, 'lite'],
    queryFn: () => listWorkflowRecords({ kinds: workflowKinds as any, includeReviews: isSlideDesignStage || isVoiceStage || isVideoStage, includeQuestionLibrary: false }),
    staleTime: 1000 * 60,
    enabled: useFallbackQueries,
  });
  const inputItemsQuery = useQuery({
    queryKey: ['input-items', config.module],
    queryFn: () => listInputItems({ module: config.module }),
    staleTime: 1000 * 60,
    enabled: useFallbackQueries,
  });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'domain-stage-assignees'], queryFn: listProfiles, staleTime: 1000 * 60 * 5, enabled: useFallbackQueries });
  const activityLogsQuery = useQuery({
    queryKey: ['activity-logs', 'task-starts'],
    queryFn: () =>
      listActivityLogs({
        actionTypes: ['task_started', 'workflow_step_started', 'workflow_review_claimed', 'workflow_step_submitted', 'workflow_step_returned', 'workflow_step_approved'],
        limit: 1000,
    }),
    staleTime: 1000 * 60 * 2,
    enabled: useFallbackQueries,
  });
  const usePreviewData = shouldUseServerPreview && Boolean(previewQuery.data);
  const ordersData = usePreviewData ? { orders: previewQuery.data!.orders, products: previewQuery.data!.products } : ordersQuery.data;
  const tasksData = usePreviewData ? (previewQuery.data?.tasks || []) : (tasksQuery.data || []);
  const profilesData = usePreviewData ? (previewQuery.data?.profiles || []) : (profilesQuery.data || []);
  const activityLogs = usePreviewData ? (previewQuery.data?.activityLogs || []) : (activityLogsQuery.data || []);
  const workflowData = usePreviewData
    ? {
        storyboards: previewQuery.data?.storyboards || [],
        storyboardReviews: previewQuery.data?.storyboardReviews || [],
        slideDesigns: previewQuery.data?.slideDesigns || [],
        slideDesignReviews: previewQuery.data?.slideDesignReviews || [],
        voiceOvers: previewQuery.data?.voiceOvers || [],
        voiceReviews: previewQuery.data?.voiceReviews || [],
        videoEdits: previewQuery.data?.videoEdits || [],
        videoReviews: previewQuery.data?.videoReviews || [],
      }
    : workflowQuery.data;
  const inputItemsData = usePreviewData ? (previewQuery.data?.inputItems || []) : (inputItemsQuery.data || []);
  const stageWorkKeys = useMemo(
    () =>
      new Set(
        (previewQuery.data?.workItems || [])
          .filter((item) => item.stage_index === config.stageIndex)
          .map((item) => `${item.order_id}::${item.product_id}`),
      ),
    [config.stageIndex, previewQuery.data?.workItems],
  );

  const records = useMemo(() => {
    if (config.recordKind === 'slide_design') return workflowData?.slideDesigns || [];
    if (config.recordKind === 'voice_over') return workflowData?.voiceOvers || [];
    return workflowData?.videoEdits || [];
  }, [config.recordKind, workflowData]);

  const rows = useMemo(() => {
    const baseRows = getRowsForStage(
      ordersData?.orders || [],
      ordersData?.products || [],
      tasksData,
      records,
      config.module,
      [config.stageIndex],
      usePreviewData ? stageWorkKeys : undefined,
    );
    if (usePreviewData) {
      return baseRows.filter((row) => stageWorkKeys.has(`${row.order.id}::${row.product.id}`));
    }
    if (!isAdminRole) {
      return baseRows.filter((row) => isTaskExplicitlyAssignedToCurrentProfile(row.task, profile, profilesData));
    }
    return baseRows;
  }, [config.module, config.stageIndex, isAdminRole, ordersData, profile, profilesData, records, stageWorkKeys, tasksData, usePreviewData]);
  const orderDisplayCodeMap = useMemo(
    () => new Map((ordersData?.orders || []).map((order) => [order.id, getDisplayOrderCode(order)])),
    [ordersData?.orders],
  );
  const productDisplayCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    const orders = ordersData?.orders || [];
    const products = ordersData?.products || [];
    const productsByOrderId = new Map<string, ProductRow[]>();
    for (const product of products) {
      const bucket = productsByOrderId.get(product.order_id) || [];
      bucket.push(product);
      productsByOrderId.set(product.order_id, bucket);
    }
    for (const order of orders) {
      const displayOrderCode = orderDisplayCodeMap.get(order.id) || order.id;
      const orderProducts = productsByOrderId.get(order.id) || [];
      const displayMap = buildDisplayProductCodeMap(displayOrderCode, orderProducts);
      for (const [productId, displayCode] of displayMap) {
        map.set(productId, displayCode);
      }
    }
    return map;
  }, [orderDisplayCodeMap, ordersData?.orders, ordersData?.products]);
  const rowsWithDisplayStatus = useMemo(() => {
    const latestStageEventByProduct = new Map<string, { actionType: string; happenedAt: number }>();
    for (const log of activityLogs) {
      if (log.metadata?.stage_code !== config.stageCode) continue;
      const productId = typeof log.metadata?.product_id === 'string' ? log.metadata.product_id : null;
      if (!productId) continue;
      const happenedAt = new Date(log.happened_at).getTime();
      const current = latestStageEventByProduct.get(productId);
      if (!current || happenedAt >= current.happenedAt) {
        latestStageEventByProduct.set(productId, { actionType: log.action_type, happenedAt });
      }
    }

    return rows.map((row) => {
      const fallbackStatus = String(row.record?.status || row.task?.status || 'todo');
      const latestEvent = latestStageEventByProduct.get(row.product.id);
      const displayStatus = isRuntimeWorkflowStatus(fallbackStatus)
        ? fallbackStatus
        : latestEvent
          ? getStatusFromStageEvent(latestEvent.actionType, fallbackStatus)
          : fallbackStatus;
      return {
        ...row,
        displayStatus,
        record: row.record ? { ...row.record, status: displayStatus } : row.record,
      };
    });
  }, [activityLogs, config.stageCode, rows]);

  const [selectedKey, setSelectedKey] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [startedAtOverrides, setStartedAtOverrides] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [comment, setComment] = useState('');
  const [selectedAssigneeProfileId, setSelectedAssigneeProfileId] = useState('');
  const [mainAssetLink, setMainAssetLink] = useState('');
  const [assetOperations, setAssetOperations] = useState<Record<string, UploadOperationState>>({});
  const [isSlideDragOver, setIsSlideDragOver] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  useEffect(() => {
    setSelectedKey('');
    setNotice(null);
    setStartedAtOverrides({});
    setDraft({});
    setComment('');
    setSelectedAssigneeProfileId('');
    setMainAssetLink('');
    setAssetOperations({});
    setIsSlideDragOver(false);
    setIsDetailOpen(false);
  }, [config.pageId]);

  useEffect(() => {
    const firstKey = rowsWithDisplayStatus[0] ? `${rowsWithDisplayStatus[0].order.id}::${rowsWithDisplayStatus[0].product.id}` : '';
    const selectedStillVisible = selectedKey
      ? rowsWithDisplayStatus.some((row) => `${row.order.id}::${row.product.id}` === selectedKey)
      : false;
    const productKey = searchParams.get('product');
    if (productKey) {
      const productStillVisible = rowsWithDisplayStatus.some((row) => `${row.order.id}::${row.product.id}` === productKey);
      if (productStillVisible && productKey !== selectedKey) setSelectedKey(productKey);
      if (!productStillVisible && selectedKey) setSelectedKey('');
      return;
    }
    if (firstKey && (!selectedKey || !selectedStillVisible)) setSelectedKey(firstKey);
    if (!firstKey && selectedKey) setSelectedKey('');
  }, [config.pageId, rowsWithDisplayStatus, searchParams, selectedKey]);

  const selected = useMemo(() => rowsWithDisplayStatus.find((row) => `${row.order.id}::${row.product.id}` === selectedKey) || null, [rowsWithDisplayStatus, selectedKey]);
  const selectedStoryboardRecord = useMemo(
    () => (selected ? findWorkflowRecordByProduct(workflowData?.storyboards, selected.order.id, selected.product.id) : null),
    [selected, workflowData?.storyboards],
  );
  const selectedSlideRecord = useMemo(
    () => (selected ? findWorkflowRecordByProduct(workflowData?.slideDesigns, selected.order.id, selected.product.id) : null),
    [selected, workflowData?.slideDesigns],
  );
  const selectedVoiceRecord = useMemo(
    () => (selected ? findWorkflowRecordByProduct(workflowData?.voiceOvers, selected.order.id, selected.product.id) : null),
    [selected, workflowData?.voiceOvers],
  );
  const selectedLessonScript = useMemo(
    () => findVoiceScriptInputItem(inputItemsData as InputItemRow[], selected, config.module),
    [config.module, inputItemsData, selected],
  );
  const assigneeProfiles = useMemo(
    () => toAssignableProfiles(profilesData, ['admin', 'content_manager', 'production_manager', 'pm', 'specialist', 'designer', 'vc', 'qc', 'hoc_gia']),
    [profilesData],
  );
  const profileNameById = useMemo<Map<string, string>>(
    () => new Map((profilesData as ProfileRow[]).map((item) => [item.id, item.full_name || item.email || item.id])),
    [profilesData],
  );
  const selectedAssignee = findAssignableProfile(assigneeProfiles, selectedAssigneeProfileId);
  const selectedAssigneeLabel = selectedAssignee?.fullName || selected?.task?.assignee || profile?.fullName || 'Chưa phân công';
  const startedAtByTask = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of activityLogs) {
      const taskId = typeof log.metadata?.task_id === 'string' ? log.metadata.task_id : null;
      if (!taskId) continue;
      const current = map.get(taskId);
      if (!current || new Date(log.happened_at).getTime() < new Date(current).getTime()) {
        map.set(taskId, log.happened_at);
      }
    }
    return map;
  }, [activityLogs]);
  const selectedStageLogs = useMemo(
    () =>
      activityLogs.filter(
        (log) =>
          log.metadata?.order_id === selected?.order.id &&
          log.metadata?.product_id === selected?.product.id &&
          log.metadata?.stage_code === config.stageCode,
      ),
    [activityLogs, config.stageCode, selected?.order.id, selected?.product.id],
  );
  const selectedSlideReviews = useMemo(() => {
    if (!selected || !isSlideDesignStage) return [];
    const recordId = selected.record?.id || `${selected.order.id}::${selected.product.id}`;
    return (workflowData?.slideDesignReviews || [])
      .filter((review) => review.slide_design_id === recordId)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [isSlideDesignStage, selected, workflowData?.slideDesignReviews]);
  const selectedVoiceReviews = useMemo(() => {
    if (!selected || !isVoiceStage) return [];
    const recordId = selected.record?.id || `${selected.order.id}::${selected.product.id}`;
    return (workflowData?.voiceReviews || [])
      .filter((review) => review.voice_over_id === recordId)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [isVoiceStage, selected, workflowData?.voiceReviews]);
  const latestSlideFeedbackReview = useMemo(
    () => selectedSlideReviews.find((review) => review.decision === 'changes_requested') || null,
    [selectedSlideReviews],
  );
  const latestVoiceFeedbackReview = useMemo(
    () => selectedVoiceReviews.find((review) => review.decision === 'changes_requested') || null,
    [selectedVoiceReviews],
  );
  const selectedVideoReviews = useMemo(() => {
    if (!selected || !isVideoStage) return [];
    const recordId = selected.record?.id || `${selected.order.id}::${selected.product.id}`;
    return (workflowData?.videoReviews || [])
      .filter((review) => review.video_edit_id === recordId)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [isVideoStage, selected, workflowData?.videoReviews]);
  const latestVideoFeedbackReview = useMemo(
    () => selectedVideoReviews.find((review) => review.decision === 'changes_requested') || null,
    [selectedVideoReviews],
  );
  const selectedStartedAt = selected?.task?.id
    ? startedAtOverrides[selected.task.id] || startedAtByTask.get(selected.task.id) || ''
    : '';
  const selectedDeadline = selected?.task?.due_date || selected?.order.deadline || selected?.record?.due_date || null;
  const selectedDisplayOrderCode = selected ? orderDisplayCodeMap.get(selected.order.id) || getDisplayOrderCode(selected.order) : '';
  const selectedDisplayProductCode = selected ? productDisplayCodeMap.get(selected.product.id) || selected.product.id : '';
  const selectedGeneralNote = String(selected?.record?.notes || selected?.order.intake_note || '').trim();
  const storyboardInputUrl = selectedStoryboardRecord?.file_name || null;
  const storyboardInputMeta = selectedStoryboardRecord?.submitted_at
    ? `File Storyboard từ SMF-02 | ${formatRelativeUploadMeta(selectedStoryboardRecord.submitted_at)}`
    : 'File Storyboard từ SMF-02';
  const feedbackAssetUrl = getSlideDesignFeedbackFile(selected?.record) || null;
  const feedbackMeta = latestSlideFeedbackReview
    ? formatRelativeUploadMeta(latestSlideFeedbackReview.created_at)
    : feedbackAssetUrl
      ? 'File feedback từ SMF-04'
      : 'Chưa có feedback từ SMF-04';
  const currentSlideAsset = draft.file_name || selected?.record?.file_name || '';
  const canUseSlideProductLink = supportsSlideDesignProductLink(config.pageId);
  const slideSubmissionAssetValue = String(mainAssetLink || currentSlideAsset).trim();
  const hasApprovedStoryboardRecord = Boolean(
    selectedStoryboardRecord &&
      (['approved', 'done'].includes(String(selectedStoryboardRecord.status || '')) ||
        Number(selected?.product.current_stage_index ?? 0) >= config.stageIndex),
  );
  const hasStoryboardInput = Boolean(storyboardInputUrl) || hasApprovedStoryboardRecord;
  const storyboardEmptyLabel = hasApprovedStoryboardRecord
    ? 'Storyboard đã duyệt nhưng chưa có file đính kèm'
    : 'Chưa có file storyboard';
  const hasSlideAsset = Boolean(String(currentSlideAsset).trim());
  const hasSlideSubmissionAsset = Boolean(slideSubmissionAssetValue);
  const lessonScriptInputUrl = selectedLessonScript?.file_url || selectedLessonScript?.file_name || null;
  const lessonScriptInputMeta = selectedLessonScript?.updated_at
    ? `File Kịch bản từ SMF-01 | ${formatRelativeUploadMeta(selectedLessonScript.updated_at)}`
    : 'File Kịch bản từ SMF-01';
  const voiceFeedbackSummary = latestVoiceFeedbackReview?.comment || '';
  const voiceFeedbackMeta = latestVoiceFeedbackReview
    ? formatRelativeUploadMeta(latestVoiceFeedbackReview.created_at)
    : 'Chưa có feedback từ SMF-06';
  const currentVoiceAssetValue = selected?.record?.file_name || draft.file_name || '';
  const voiceAssetItems = parseAssetItems(currentVoiceAssetValue);
  const hasLessonScriptInput = Boolean(lessonScriptInputUrl) || isVoiceStage;
  const hasVoiceAssets = voiceAssetItems.length > 0;
  const videoVoiceAssetItems = useMemo(() => parseAssetItems(selectedVoiceRecord?.file_name), [selectedVoiceRecord?.file_name]);
  const videoSlideAsset = String(selectedSlideRecord?.file_name || '').trim();
  const videoSlideProductLink = getManualSlideProductLink(selectedSlideRecord?.brand_spec);
  const videoVoiceInputMeta = selectedVoiceRecord?.submitted_at
    ? `File Voice từ SMF-05 | ${formatRelativeUploadMeta(selectedVoiceRecord.submitted_at)}`
    : 'File Voice từ SMF-05';
  const videoSlideInputMeta = selectedSlideRecord?.submitted_at
    ? `File Slide từ SMF-03 | ${formatRelativeUploadMeta(selectedSlideRecord.submitted_at)}`
    : 'File Slide từ SMF-03';
  const videoFeedbackAssetUrl =
    selected?.record && (selected.record.status === 'changes_requested' || Boolean(selected.record.returned_at))
      ? getVideoEditQcFeedbackFile(selected.record) || null
      : null;
  const videoFeedbackMeta = latestVideoFeedbackReview
    ? formatRelativeUploadMeta(latestVideoFeedbackReview.created_at)
    : videoFeedbackAssetUrl
      ? 'File feedback tu SMF-08'
      : 'Chưa có feedback từ SMF-08';
  const videoLinkValue = String(mainAssetLink || draft.file_name || selected?.record?.file_name || '').trim();
  const hasVideoVoiceInput = videoVoiceAssetItems.length > 0;
  const hasVideoSlideInput = Boolean(videoSlideAsset || videoSlideProductLink);
  const hasVideoLink = Boolean(videoLinkValue);
  const layeredVideoCurrentStageCode = config.module === 'VIDEO' ? 'VSMF-07' : 'SMF-07';
  const layeredVideoScriptStageCode = config.module === 'VIDEO' ? 'VSMF-01' : 'SMF-01';
  const layeredVideoVoiceStageCode = config.module === 'VIDEO' ? 'VSMF-05' : 'SMF-05';
  const layeredVideoSlideStageCode = config.module === 'VIDEO' ? 'VSMF-03' : 'SMF-03';
  const layeredVideoQcStageCode = config.module === 'VIDEO' ? 'VSMF-08' : 'SMF-08';
  const voiceCheckpoint = useMemo(() => {
    if (!isVoiceStage) return null;
    const status = String(selected?.displayStatus || selected?.record?.status || selected?.task?.status || 'todo');
    const dueTime = selectedDeadline ? new Date(selectedDeadline).getTime() : NaN;
    if (!hasLessonScriptInput) return 'Chưa có đầu vào';
    if (['qc_passed', 'completed', 'done', 'approved'].includes(status)) return 'Hoàn thành';
    if (status === 'submitted_video') return 'Chờ duyệt';
    if (!Number.isNaN(dueTime) && dueTime < Date.now() && !['qc_passed', 'completed', 'done', 'approved'].includes(status)) return 'Quá hạn';
    if (hasVoiceAssets || ['recording', 'in_progress'].includes(status)) return 'Đang thực hiện';
    if (selected?.task || getDomainRecordAssigneeProfileId(config.recordKind, selected?.record) || ['claimed', 'todo', 'started'].includes(status)) return 'Đã xác nhận';
    return 'Đã xác nhận';
  }, [config.recordKind, hasLessonScriptInput, hasVoiceAssets, isVoiceStage, selected, selectedDeadline]);
  const selectedReviewerLabel = selectedAssigneeLabel;
  const selectedLessonScriptUrl = lessonScriptInputUrl;
  const selectedLessonScriptMeta = lessonScriptInputMeta;
  const selectedVoiceInputItems = voiceAssetItems;
  const voiceQcCheckpoint = voiceCheckpoint;
  const videoCheckpoint = useMemo(() => {
    if (!isVideoStage) return null;
    const status = String(selected?.displayStatus || selected?.record?.status || selected?.task?.status || 'todo');
    const dueTime = selectedDeadline ? new Date(selectedDeadline).getTime() : NaN;
    if (!hasVideoSlideInput || !hasVideoVoiceInput) return 'Chưa có đầu vào';
    if (['qc_passed', 'completed', 'done', 'approved'].includes(status)) return 'Hoàn thành';
    if (status === 'submitted_qc') return 'Chờ duyệt';
    if (!Number.isNaN(dueTime) && dueTime < Date.now() && !['qc_passed', 'completed', 'done', 'approved'].includes(status)) return 'Quá hạn';
    if (hasVideoLink || ['editing', 'in_progress', 'started'].includes(status)) return 'Đang thực hiện';
    if (selected?.task || getDomainRecordAssigneeProfileId(config.recordKind, selected?.record) || ['claimed', 'todo'].includes(status)) return 'Đã xác nhận';
    return 'Đã xác nhận';
  }, [config.recordKind, hasVideoLink, hasVideoSlideInput, hasVideoVoiceInput, isVideoStage, selected, selectedDeadline]);

  useEffect(() => {
    const record = selected?.record;
    if (!record) {
      setDraft({});
      return;
    }
    if (config.recordKind === 'slide_design') {
      setDraft({
        target_slides: record.target_slides || 24,
        completed_slides: record.completed_slides || 0,
        file_name: isAssetUrl(record.file_name) ? '' : record.file_name || '',
        brand_spec: getManualSlideProductLink(record.brand_spec),
        notes: record.notes || '',
        checklist: record.checklist || {},
      });
      return;
    }
    if (config.recordKind === 'voice_over') {
      setDraft({
        estimated_minutes: record.estimated_minutes || 18,
        recorded_minutes: record.recorded_minutes || 0,
        file_name: isAssetUrl(record.file_name) ? '' : record.file_name || '',
        voice_style: record.voice_style || '',
        notes: record.notes || '',
        checklist: record.checklist || {},
      });
      return;
    }
    setDraft({
      target_minutes: record.target_minutes || 18,
      render_progress: record.render_progress || 0,
      file_name: isAssetUrl(record.file_name) ? '' : record.file_name || '',
      subtitle_file: isAssetUrl(record.subtitle_file) ? '' : record.subtitle_file || '',
      render_preset: record.render_preset || '1080p',
      notes: record.notes || '',
      checklist: record.checklist || {},
    });
  }, [config.recordKind, selected?.record]);

  useEffect(() => {
    if (!selected) {
      setSelectedAssigneeProfileId('');
      return;
    }
    setSelectedAssigneeProfileId(
      selected.task?.assignee_profile_id ||
      getDomainRecordAssigneeProfileId(config.recordKind, selected.record) ||
      profile?.id ||
      '',
    );
  }, [config.recordKind, profile?.id, selected]);

  useEffect(() => {
    if (config.recordKind === 'slide_design') {
      setMainAssetLink(getManualSlideProductLink(selected?.record?.brand_spec));
      return;
    }
    setMainAssetLink(String(selected?.record?.file_name || ''));
  }, [config.recordKind, selected?.record?.brand_spec, selected?.record?.file_name]);

  useEffect(() => {
    const operationKeys = Object.keys(assetOperations);
    if (!operationKeys.length) return;
    const timer = window.setInterval(() => {
      setAssetOperations((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, operation]) => [
            key,
            {
              ...operation,
              progress: operation.progress >= 92 ? operation.progress : Math.min(92, operation.progress + (operation.progress < 40 ? 18 : operation.progress < 72 ? 10 : 4)),
            },
          ]),
        ) as Record<string, UploadOperationState>,
      );
    }, 260);
    return () => window.clearInterval(timer);
  }, [assetOperations]);

  function startAssetOperation(key: string, label: string) {
    setAssetOperations((current) => ({
      ...current,
      [key]: {
        label,
        progress: 8,
        tone: 'violet',
      },
    }));
  }

  function finishAssetOperation(key: string, label: string) {
    setAssetOperations((current) => ({
      ...current,
      [key]: {
        label,
        progress: 100,
        tone: 'success',
      },
    }));
    window.setTimeout(() => {
      setAssetOperations((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }, 700);
  }

  function failAssetOperation(key: string, label: string) {
    setAssetOperations((current) => ({
      ...current,
      [key]: {
        label,
        progress: 100,
        tone: 'danger',
      },
    }));
    window.setTimeout(() => {
      setAssetOperations((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }, 1200);
  }

  async function runAssetUpload(key: string, label: string, action: { action: 'upload_main' | 'upload_subtitle'; file: File }) {
    startAssetOperation(key, label);
    try {
      await mutation.mutateAsync(action);
      finishAssetOperation(key, 'Đã tải lên xong');
    } catch (error) {
      failAssetOperation(key, 'Upload that bai, vui long thu lai');
      throw error;
    }
  }

  async function runBatchAssetUpload(key: string, label: string, files: File[]) {
    startAssetOperation(key, label);
    try {
      await mutation.mutateAsync({ action: 'upload_main_batch', files });
      finishAssetOperation(key, 'Đã tải lên xong');
    } catch (error) {
      failAssetOperation(key, 'Upload that bai, vui long thu lai');
      throw error;
    }
  }

  function openDetail(key: string) {
    setSelectedKey(key);
    setIsDetailOpen(true);
  }

  function closeDetail() {
    setIsDetailOpen(false);
    setIsSlideDragOver(false);
  }

  async function archiveRow(row: { order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }) {
    const key = `${row.order.id}::${row.product.id}`;
    await archiveTasksForStage(row.order.id, row.product.id, config.stageIndex);
    if (selectedKey === key) {
      setIsDetailOpen(false);
      setSelectedKey('');
    }
    setNotice({ tone: 'success', message: 'Đã lưu trữ khỏi màn hiện tại.' });
    pushToast({ title: 'Đã lưu trữ', message: `${row.product.id} đã được ẩn khỏi ${config.stageCode}.`, tone: 'success' });
    await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
    await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
  }

  async function confirmArchiveRow(row: { order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }) {
    if (!confirmArchiveStageAction(row.product.id, config.stageCode)) return;
    await archiveRow(row);
  }

  const checklistConfig = config.recordKind === 'slide_design' ? SLIDE_CHECKLIST : config.recordKind === 'voice_over' ? VOICE_CHECKLIST : VIDEO_CHECKLIST;
  const isLayeredVideoStage = config.pageId === 'smf07' || config.pageId === 'vsmf07';
  const shouldColorTaskLinked = ['smf03', 'vsmf03', 'smf06', 'vsmf06'].includes(config.pageId);
  const linkedTaskStatus = selected?.displayStatus || selected?.record?.status || selected?.task?.status || 'todo';
  const linkedTaskStatusClass = shouldColorTaskLinked ? getWorkflowStatusFrameClass(linkedTaskStatus) : 'status-neutral';

  const mutation = useMutation({
    mutationFn: async (input: {
      action: 'create' | 'save' | 'start' | 'submit' | 'archive' | 'upload_main' | 'upload_main_batch' | 'delete_main' | 'delete_main_item' | 'upload_subtitle' | 'delete_subtitle' | 'save_main_link';
      file?: File;
      files?: File[];
      fileUrl?: string;
      link?: string;
    }) => {
      if (!selected) throw new Error('Ch\u01b0a ch\u1ecdn item.');
      const existingTasks = tasksData;
      const ensuredTask =
        selected.task ||
        (await ensureTaskForStage({
          orderId: selected.order.id,
          productId: selected.product.id,
          stageIndex: config.stageIndex,
          existingTasks,
          assignee: selectedAssignee?.fullName || profile?.fullName || null,
          assigneeProfileId: selectedAssignee?.profileId || profile?.id || null,
          assigneeAccountId: selectedAssignee?.accountId || profile?.authUserId || null,
        }));
      const record = await ensureWorkflowRecord({
        kind: config.recordKind,
        orderId: selected.order.id,
        productId: selected.product.id,
        title: `${selected.product.id}: ${selected.product.name}`,
        profileId: profile?.id || null,
      });
      const storyboardRecord = findWorkflowRecordByProduct(workflowData?.storyboards, selected.order.id, selected.product.id);
      const slideRecord = findWorkflowRecordByProduct(workflowData?.slideDesigns, selected.order.id, selected.product.id);

      if (input.action === 'archive') {
        await archiveTasksForStage(selected.order.id, selected.product.id, config.stageIndex);
        return { notice: 'Đã lưu trữ khỏi màn hiện tại.', archived: true };
      }

      if (input.action === 'create') {
        return { notice: '\u0110\u00e3 t\u1ea1o h\u1ed3 s\u01a1 t\u00e1c nghi\u1ec7p.' };
      }

      if (input.action === 'upload_main') {
        if (!input.file) throw new Error('Ch\u01b0a c\u00f3 file de upload.');
        validateWorkflowFile(input.file);
        const uploaded = config.recordKind === 'slide_design'
          ? await uploadIntakeAsset({
              file: input.file,
              orderId: selected.order.id,
              productId: selected.product.id,
              module: config.module,
              itemCode: config.stageCode,
              previousUrl: record.file_name,
            })
          : await uploadWorkflowAsset({
              file: input.file,
              orderId: selected.order.id,
              productId: selected.product.id,
              module: config.module,
              stageCode: config.stageCode,
              slot: config.recordKind,
              previousUrl: record.file_name,
            });
        await updateWorkflowRecord(config.recordKind, record.id, {
          file_name: uploaded.fileUrl,
          updated_at: new Date().toISOString(),
        });
        return { notice: '\u0110\u00e3 t\u1ea3i file l\u00ean server.' };
      }

      if (input.action === 'upload_main_batch') {
        if (config.recordKind !== 'voice_over') throw new Error('Ch\u1ee9c nang nay chi ap dung cho thu voice.');
        const files = input.files || [];
        if (!files.length) throw new Error('Chưa có file để upload.');
        const currentItems = parseAssetItems(record.file_name);
        const nextItems = [...currentItems];
        for (const file of files) {
          validateWorkflowFile(file);
          const uploaded = await uploadIntakeAsset({
            file,
            orderId: selected.order.id,
            productId: selected.product.id,
            module: config.module,
            itemCode: config.stageCode,
          });
          nextItems.push({ url: uploaded.fileUrl, label: uploaded.fileName || getAssetLabel(uploaded.fileUrl) });
        }
        await updateWorkflowRecord(config.recordKind, record.id, {
          file_name: serializeAssetItems(nextItems),
          updated_at: new Date().toISOString(),
        });
        return { notice: `\u0110\u00e3 t\u1ea3i ${files.length} file voice l\u00ean server.` };
      }

      if (input.action === 'delete_main') {
        const items = parseAssetItems(record.file_name);
        if (config.recordKind === 'voice_over') {
          await Promise.all(
            items
              .filter((item) => isAssetUrl(item.url))
              .map((item) => deleteIntakeAsset({ fileUrl: item.url })),
          );
        } else if (items.length === 1 && isAssetUrl(items[0]?.url)) {
          await deleteWorkflowAsset({ fileUrl: String(items[0].url) });
        }
        await updateWorkflowRecord(config.recordKind, record.id, {
          file_name: null,
          updated_at: new Date().toISOString(),
        });
        return { notice: '\u0110\u00e3 x\u00f3a file ch\u00ednh.' };
      }

      if (input.action === 'delete_main_item') {
        if (config.recordKind !== 'voice_over') throw new Error('Ch\u1ee9c nang nay chi ap dung cho thu voice.');
        const currentItems = parseAssetItems(record.file_name);
        const targetUrl = String(input.fileUrl || '');
        if (!targetUrl) throw new Error('Chưa xác định file cần xóa.');
        if (isAssetUrl(targetUrl)) {
          await deleteIntakeAsset({ fileUrl: targetUrl });
        }
        const nextItems = currentItems.filter((item) => item.url !== targetUrl);
        await updateWorkflowRecord(config.recordKind, record.id, {
          file_name: serializeAssetItems(nextItems),
          updated_at: new Date().toISOString(),
        });
        return { notice: '\u0110\u00e3 x\u00f3a file voice.' };
      }

      if (input.action === 'save_main_link') {
        const nextLink = String(input.link ?? mainAssetLink).trim();
        if (config.recordKind === 'slide_design') {
          await updateWorkflowRecord('slide_design', record.id, {
            brand_spec: serializeSlideDesignMeta({ ...parseSlideDesignMeta(record.brand_spec), brandSpec: isManualDriveProductLink(nextLink) ? nextLink : '' }),
            ...getDomainRecordAssigneePatch('slide_design', selectedAssigneeProfileId),
            updated_at: new Date().toISOString(),
          });
          return { notice: nextLink ? 'Đã lưu link sản phẩm.' : 'Đã xóa link sản phẩm.' };
        }
        await updateWorkflowRecord(config.recordKind, record.id, {
          file_name: nextLink || null,
          ...getDomainRecordAssigneePatch(config.recordKind, selectedAssigneeProfileId),
          updated_at: new Date().toISOString(),
        });
        return { notice: nextLink ? 'Đã lưu link sản phẩm.' : 'Đã xóa link sản phẩm.' };
      }

      if (input.action === 'upload_subtitle') {
        if (config.recordKind !== 'video_edit') throw new Error('B\u01b0\u1edbc n\u00e0y kh\u00f4ng c\u00f3 subtitle.');
        if (!input.file) throw new Error('Ch\u01b0a c\u00f3 file subtitle de upload.');
        validateWorkflowFile(input.file);
        const uploaded = await uploadWorkflowAsset({
          file: input.file,
          orderId: selected.order.id,
          productId: selected.product.id,
          module: config.module,
          stageCode: config.stageCode,
          slot: 'subtitle',
          previousUrl: record.subtitle_file,
        });
        await updateWorkflowRecord('video_edit', record.id, {
          subtitle_file: uploaded.fileUrl,
          updated_at: new Date().toISOString(),
        });
        return { notice: '\u0110\u00e3 t\u1ea3i file subtitle l\u00ean server.' };
      }

      if (input.action === 'delete_subtitle') {
        if (config.recordKind !== 'video_edit') throw new Error('B\u01b0\u1edbc n\u00e0y kh\u00f4ng c\u00f3 subtitle.');
        if (isAssetUrl(record.subtitle_file)) {
          await deleteWorkflowAsset({ fileUrl: String(record.subtitle_file) });
        }
        await updateWorkflowRecord('video_edit', record.id, {
          subtitle_file: null,
          updated_at: new Date().toISOString(),
        });
        return { notice: '\u0110\u00e3 x\u00f3a file subtitle.' };
      }

      if (input.action === 'save') {
        const normalizedTargetSlides = config.recordKind === 'slide_design' ? Math.max(1, Number(draft.target_slides) || 1) : draft.target_slides;
        await updateWorkflowRecord(config.recordKind, record.id, {
          ...draft,
          ...(config.recordKind === 'slide_design'
            ? {
                target_slides: normalizedTargetSlides,
                brand_spec: serializeSlideDesignMeta({
                  ...parseSlideDesignMeta(record.brand_spec),
                  brandSpec: getManualSlideProductLink(draft.brand_spec || mainAssetLink || record.brand_spec),
                }),
              }
            : {}),
          file_name: String(draft.file_name || '').trim() || record.file_name || null,
          ...(config.recordKind === 'video_edit'
            ? { subtitle_file: String(draft.subtitle_file || '').trim() || record.subtitle_file || null }
            : {}),
          ...getDomainRecordAssigneePatch(config.recordKind, selectedAssigneeProfileId),
          updated_at: new Date().toISOString(),
        });
        await updateTask(ensuredTask.id, buildTaskAssigneePatch(selectedAssignee));
        return { notice: '\u0110\u00e3 l\u01b0u c\u1eadp nh\u1eadt.' };
      }

      if (input.action === 'start') {
        const shouldLogStart = ensuredTask.status !== 'in_progress';
        const startedAt = new Date().toISOString();
        const status = config.recordKind === 'slide_design' ? 'in_progress' : config.recordKind === 'voice_over' ? 'recording' : 'editing';
        const preservedFileName = String(draft.file_name || '').trim() || record.file_name || null;
        const preservedSubtitleFile = String(draft.subtitle_file || '').trim() || record.subtitle_file || null;
        await updateWorkflowRecord(config.recordKind, record.id, {
          status,
          ...draft,
          file_name: preservedFileName,
          ...(config.recordKind === 'slide_design'
            ? {
                brand_spec: serializeSlideDesignMeta({
                  ...parseSlideDesignMeta(record.brand_spec),
                  brandSpec: getManualSlideProductLink(draft.brand_spec || mainAssetLink || record.brand_spec),
                }),
              }
            : {}),
          ...(config.recordKind === 'video_edit' ? { subtitle_file: preservedSubtitleFile } : {}),
          ...getDomainRecordAssigneePatch(config.recordKind, selectedAssigneeProfileId),
          updated_at: new Date().toISOString(),
        });
        await updateTask(ensuredTask.id, {
          status: 'in_progress',
          progress: Math.max(ensuredTask.progress, 25),
          ...buildTaskAssigneePatch(selectedAssignee),
        });
        await updateProduct(selected.product.id, {
          current_stage_index: config.stageIndex,
          progress: Math.max(selected.product.progress, 25),
        });
        if (shouldLogStart) {
          await createActivityLog({
            actorProfileId: profile?.id || null,
            actionType: 'workflow_step_started',
            objectType: 'task',
            objectId: ensuredTask.id,
            summary: `${selected.product.id} started ${config.stageCode}`,
            metadata: {
              task_id: ensuredTask.id,
              order_id: selected.order.id,
              product_id: selected.product.id,
              stage_code: config.stageCode,
              stage_index: config.stageIndex,
              module: config.module,
            },
          });
        }
        return { notice: '\u0110\u00e3 ghi nh\u1eadn b\u1eaft \u0111\u1ea7u b\u01b0\u1edbc.', taskId: ensuredTask.id, startedAt };
      }

      if (config.recordKind === 'slide_design') {
        const slideProductLinkValue = String((input.link ?? mainAssetLink ?? getManualSlideProductLink(record?.brand_spec)) || getManualSlideProductLink(draft.brand_spec)).trim();
        const slideFileValue = String(record.file_name || draft.file_name || '').trim();
        if (!slideProductLinkValue && !slideFileValue) {
          throw new Error('Vui lòng upload Slide PDF hoặc nhập link sản phẩm trước khi gửi duyệt.');
        }
        const normalizedTargetSlides = Math.max(1, Number(draft.target_slides) || 1);
        await updateWorkflowRecord('slide_design', record.id, {
          ...draft,
          file_name: slideFileValue || null,
          brand_spec: serializeSlideDesignMeta({ ...parseSlideDesignMeta(record.brand_spec), brandSpec: isManualDriveProductLink(slideProductLinkValue) ? slideProductLinkValue : '' }),
          ...getDomainRecordAssigneePatch('slide_design', selectedAssigneeProfileId),
          status: 'submitted_qc',
          target_slides: normalizedTargetSlides,
          completed_slides: Math.max(Number(draft.completed_slides) || 0, normalizedTargetSlides),
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        await updateTask(ensuredTask.id, { status: 'done', progress: 100, ...buildTaskAssigneePatch(selectedAssignee) });
        await ensureTaskForStage({
          orderId: selected.order.id,
          productId: selected.product.id,
          stageIndex: 3,
          existingTasks,
          assignee: null,
        });
        await updateProduct(selected.product.id, { current_stage_index: 3, progress: 50 });
        await createActivityLog({
          actorProfileId: profile?.id || null,
          actionType: 'workflow_step_submitted',
          objectType: 'workflow',
          objectId: record.id,
          summary: `${selected.product.id} submitted ${config.stageCode} to QC`,
          metadata: {
            order_id: selected.order.id,
            product_id: selected.product.id,
            stage_code: config.stageCode,
            stage_index: config.stageIndex,
            module: config.module,
          },
        });
        await runOptionalWorkflowSideEffect(
          createSlideDesignReview({
            slideDesignId: record.id,
            reviewerProfileId: profile?.id || null,
            decision: 'submitted',
            comment: 'Bộ slides đã được gửi sang cổng QC.',
            criteria: {
              slide_count: true,
              brand_font: Boolean(draft.checklist?.brand_font),
              color_palette: Boolean(draft.checklist?.color_palette),
              storyboard_alignment: Boolean(draft.checklist?.storyboard_alignment),
            },
          }),
        );
        return { notice: '\u0110\u00e3 g\u1eedi duy\u1ec7t', nextRoute: config.nextStageRoute };
      }
      if (config.recordKind === 'voice_over') {
        if (!hasLessonScriptInput) {
          throw new Error('Vui lòng chờ file Kịch bản từ SMF-01 trước khi bắt đầu thu âm.');
        }
        const voiceAssetValue = String(record.file_name || draft.file_name || '').trim();
        if (!parseAssetItems(voiceAssetValue).length) {
          throw new Error('Vui lòng upload file Voice trước khi gửi duyệt.');
        }
        await updateWorkflowRecord('voice_over', record.id, {
          ...draft,
          file_name: voiceAssetValue,
          ...getDomainRecordAssigneePatch('voice_over', selectedAssigneeProfileId),
          status: 'submitted_video',
          recorded_minutes: Math.max(Number(draft.recorded_minutes) || 0, Number(draft.estimated_minutes) || 0),
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        await updateTask(ensuredTask.id, { status: 'done', progress: 100, ...buildTaskAssigneePatch(selectedAssignee) });
        await ensureTaskForStage({
          orderId: selected.order.id,
          productId: selected.product.id,
          stageIndex: 5,
          existingTasks,
          assignee: null,
        });
        await updateProduct(selected.product.id, { current_stage_index: 5, progress: 55 });
        await createActivityLog({
          actorProfileId: profile?.id || null,
          actionType: 'workflow_step_submitted',
          objectType: 'workflow',
          objectId: record.id,
          summary: `${selected.product.id} submitted ${config.stageCode} to ${config.nextStagePage}`,
          metadata: {
            order_id: selected.order.id,
            product_id: selected.product.id,
            stage_code: config.stageCode,
            stage_index: config.stageIndex,
            module: config.module,
          },
        });
        await runOptionalWorkflowSideEffect(
          createVoiceReview({
            voiceOverId: record.id,
            reviewerProfileId: profile?.id || null,
            decision: 'submitted',
            comment: 'Gói thu voice đã được chuyển sang bước biên tập video.',
            criteria: {
              script_locked: Boolean(draft.checklist?.script_locked),
              pronunciation_checked: Boolean(draft.checklist?.pronunciation_checked),
              pacing_aligned: Boolean(draft.checklist?.pacing_aligned),
              noise_cleaned: Boolean(draft.checklist?.noise_cleaned),
            },
          }),
        );
        return { notice: '\u0110\u00e3 g\u1eedi duy\u1ec7t', nextRoute: config.nextStageRoute };
      }

      if (!hasVideoSlideInput || !hasVideoVoiceInput) {
        throw new Error('Vui lòng chờ đủ file Slide từ SMF-03 và file Voice từ SMF-05 trước khi gửi duyệt.');
      }
      if (!String(input.link ?? mainAssetLink ?? draft.file_name ?? record.file_name ?? '').trim()) {
        throw new Error('Vui lòng nhập link video hoàn thiện trước khi gửi duyệt.');
      }
      await updateWorkflowRecord('video_edit', record.id, {
        ...draft,
        file_name: String(input.link ?? mainAssetLink ?? draft.file_name ?? record.file_name ?? '').trim(),
        ...getDomainRecordAssigneePatch('video_edit', selectedAssigneeProfileId),
        status: 'submitted_qc',
        render_progress: 100,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await updateTask(ensuredTask.id, { status: 'done', progress: 100, ...buildTaskAssigneePatch(selectedAssignee) });
      await ensureTaskForStage({
        orderId: selected.order.id,
        productId: selected.product.id,
        stageIndex: 6,
        existingTasks,
        assignee: null,
      });
      await updateProduct(selected.product.id, { current_stage_index: 6, progress: 75 });
      await createActivityLog({
        actorProfileId: profile?.id || null,
        actionType: 'workflow_step_submitted',
        objectType: 'workflow',
        objectId: record.id,
        summary: `${selected.product.id} submitted ${config.stageCode} to ${config.nextStagePage}`,
        metadata: {
          order_id: selected.order.id,
          product_id: selected.product.id,
          stage_code: config.stageCode,
          stage_index: config.stageIndex,
          module: config.module,
        },
      });
      await runOptionalWorkflowSideEffect(createVideoReview({
        videoEditId: record.id,
        reviewerProfileId: profile?.id || null,
        decision: 'submitted',
          comment: 'Gói video đã được gửi sang QC video.',
        criteria: {
          voice_synced: Boolean(draft.checklist?.voice_synced),
          transitions_checked: Boolean(draft.checklist?.transitions_checked),
          subtitle_embedded: Boolean(draft.checklist?.subtitle_embedded),
          branding_applied: Boolean(draft.checklist?.branding_applied),
        },
      }));
      return { notice: '\u0110\u00e3 g\u1eedi duy\u1ec7t', nextRoute: config.nextStageRoute };
    },
    onSuccess: async (result) => {
      setNotice(result?.notice ? { tone: 'success', message: result.notice } : null);
      if (result?.archived) {
        setIsDetailOpen(false);
        setSelectedKey('');
      }
      if (result?.notice === '\u0110\u00e3 g\u1eedi duy\u1ec7t') {
        pushToast({
          title: '\u0110\u00e3 g\u1eedi duy\u1ec7t th\u00e0nh c\u00f4ng',
          message: 'B\u1ea1n c\u00f3 th\u1ec3 tho\u00e1t m\u00e0n n\u00e0y.',
          tone: 'success',
        });
      } else {
      pushToast({ title: `${config.stageCode} cập nhật thành công`, message: result?.notice || 'Đã ghi nhận thao tác.', tone: 'success' });
      }
      if (result?.taskId && result?.startedAt) {
        setStartedAtOverrides((current) => ({ ...current, [result.taskId]: result.startedAt }));
      }
      await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['activity-logs', 'task-starts'] });
      await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
      if (shouldAutoNavigate && result?.nextRoute) {
        navigate(`/${result.nextRoute}`);
      }
    },
    onError: (error) => {
      setNotice({ tone: 'danger', message: formatErrorMessage(error) });
      pushToast({ title: `${config.stageCode} thất bại`, message: formatErrorMessage(error), tone: 'danger', durationMs: 4200 });
    },
  });

  function confirmSelectedArchive() {
    if (!selected) return;
    if (!confirmArchiveStageAction(selected.product.id, config.stageCode)) return;
    mutation.mutate({ action: 'archive' });
  }

  return (
    <div className={`workflow-stage-page${isDetailOpen ? ' is-detail-open' : ''}`}>
      <SectionHeader eye={config.eye} title={config.title} subtitle={config.subtitle} />
      {isSlideDesignStage ? (
        <>
          <Card title="Danh sách sản phẩm thiết kế slides">
            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table storyboard-dashboard-table">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Người phụ trách</th>
                    <th>Đơn hàng</th>
                    <th>Trạng thái</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithDisplayStatus.map((row) => {
                    const key = `${row.order.id}::${row.product.id}`;
                    const status = row.displayStatus || row.record?.status || row.task?.status || 'todo';
                    const displayProductCode = productDisplayCodeMap.get(row.product.id) || row.product.id;
                    const displayOrderCode = orderDisplayCodeMap.get(row.order.id) || getDisplayOrderCode(row.order);
                    const assigneeLabel = getDomainRowAssigneeLabel(config.recordKind, row, profileNameById);
                    return (
                      <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                        <td>{displayProductCode}</td>
                        <td>{row.product.name}</td>
                        <td>{assigneeLabel}</td>
                        <td>{displayOrderCode}</td>
                        <td><Badge tone={toneForStatus(status)}>{getWorkflowStatusLabel(status)}</Badge></td>
                        <td>{formatDisplayDate(row.task?.due_date || row.order.deadline || row.record?.due_date)}</td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                            Xem chi tiết
                          </button>
                          {canArchiveStageRow(row, config.stageIndex) ? (
                            <button className="btn btn-ghost btn-small" onClick={() => void confirmArchiveRow(row)}>
                              Lưu trữ
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!rowsWithDisplayStatus.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước thiết kế slides.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          {isDetailOpen && selected ? (
            <div className="storyboard-detail-page">
              <div className="storyboard-detail-shell slide-design-detail-shell">
                <div className="storyboard-modal-head">
                  <div>
                    <div className="storyboard-modal-eyebrow">{config.stageCode} / Slide Design Phase</div>
                  </div>
                  <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Đóng cửa sổ chi tiết">
                    ×
                  </button>
                </div>

                <div className="slide-design-workspace">
                  {renderNotice(notice)}
                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedAssigneeLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  <div className="storyboard-modal-stack">
                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 1</div>
                          <h4>Tài liệu đầu vào</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        <ReferenceDownloadBar
                          title={storyboardInputUrl ? getAssetLabel(storyboardInputUrl) : 'File Storyboard (SMF-02)'}
                          meta={storyboardInputMeta}
                          url={storyboardInputUrl}
                          emptyLabel={storyboardEmptyLabel}
                        />
                        <ReferenceDownloadBar
                          title={feedbackAssetUrl ? getAssetLabel(feedbackAssetUrl) : 'File feedback (SMF-04)'}
                          meta={feedbackMeta}
                          note={latestSlideFeedbackReview?.comment}
                          url={feedbackAssetUrl}
                          emptyLabel="Chưa có feedback"
                        />
                      </div>
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 2</div>
                          <h4>Hành động</h4>
                          <p>Tiếp nhận nhiệm vụ và tải slide PDF để gửi duyệt.</p>
                        </div>
                        <button
                          className="storyboard-ui-btn storyboard-confirm-btn"
                          onClick={() => mutation.mutate({ action: 'start' })}
                          disabled={mutation.isPending || !hasStoryboardInput}
                        >
                          {config.startLabel}
                        </button>
                      </div>

                      <div className="slide-design-upload-label">Tải lên file slide / hồ sơ</div>
                      <label
                        className={`storyboard-upload-dropzone slide-design-upload-dropzone ${isSlideDragOver ? 'is-dragover' : ''}`}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setIsSlideDragOver(true);
                        }}
                        onDragEnter={(event) => {
                          event.preventDefault();
                          setIsSlideDragOver(true);
                        }}
                        onDragLeave={(event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                          setIsSlideDragOver(false);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const file = event.dataTransfer.files?.[0];
                          setIsSlideDragOver(false);
                          if (!file) return;
                          void runAssetUpload('domain-main', 'Đang tải file slide lên server', { action: 'upload_main', file });
                        }}
                      >
                        <div className="slide-design-upload-icon" aria-hidden="true">📄</div>
                        <div className="storyboard-upload-dropzone-title">Nhấn để tải lên hoặc kéo thả file</div>
                        <div className="storyboard-upload-dropzone-subtitle">Chấp nhận {SLIDE_DESIGN_ACCEPTED_FILE_LABEL}, tối đa {WORKFLOW_MAX_UPLOAD_MB}MB</div>
                        <input
                          type="file"
                          accept={SLIDE_DESIGN_ACCEPTED_FILE_TYPES}
                          hidden
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            void runAssetUpload('domain-main', 'Đang tải file slide lên server', { action: 'upload_main', file });
                            event.currentTarget.value = '';
                          }}
                        />
                      </label>

                      <UploadProgressPanel operation={assetOperations['domain-main']} />

                      {canUseSlideProductLink ? (
                        <div className="slide-design-link-panel">
                          <label className="full">
                            <span>Link sản phẩm</span>
                            <input className="fi" value={mainAssetLink} onChange={(event) => setMainAssetLink(event.target.value)} placeholder="https://..." />
                          </label>
                          <div className="action-row">
                            <button
                              className="storyboard-ui-btn storyboard-ui-btn-secondary"
                              onClick={() => mutation.mutate({ action: 'save_main_link', link: mainAssetLink })}
                              disabled={mutation.isPending || !String(mainAssetLink).trim()}
                            >
                              Lưu link
                            </button>
                            <button
                              className="storyboard-ui-btn storyboard-ui-btn-ghost"
                              onClick={() => { setMainAssetLink(''); mutation.mutate({ action: 'save_main_link', link: '' }); }}
                              disabled={mutation.isPending || !String(mainAssetLink).trim()}
                            >
                              Xóa link
                            </button>
                          </div>
                        </div>
                      ) : null}

                      {hasSlideAsset ? (
                        <div className="storyboard-uploaded-file">
                          <div className="storyboard-input-file">
                            <div className="storyboard-input-file-icon" aria-hidden="true">📎</div>
                            <div className="storyboard-input-file-copy">
                              <div className="muted-text">Slide PDF đã tải lên</div>
                              {isAssetUrl(currentSlideAsset) ? (
                                <a href={currentSlideAsset} target="_blank" rel="noreferrer">
                                  {getAssetLabel(currentSlideAsset)}
                                </a>
                              ) : (
                                <div className="storyboard-input-file-main">{currentSlideAsset}</div>
                              )}
                            </div>
                          </div>
                          <div className="action-row">
                            {isAssetUrl(currentSlideAsset) ? (
                              <a className="storyboard-ui-btn storyboard-ui-btn-secondary" href={currentSlideAsset} target="_blank" rel="noreferrer">
                                Tải xuống
                              </a>
                            ) : null}
                            <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={() => mutation.mutate({ action: 'delete_main' })}>
                              Xóa file
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 3</div>
                          <h4>Theo dõi công việc</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        <div className="bullet-item">Task: {selected.task?.id || 'Chưa tạo'}</div>
                        <div className="bullet-item">Trạng thái task: <Badge tone={toneForStatus(linkedTaskStatus)}>{getWorkflowStatusLabel(linkedTaskStatus)}</Badge></div>
                        <div className="bullet-item">Bắt đầu lúc: {selectedStartedAt ? formatDisplayDateTime(selectedStartedAt) : 'Chưa ghi nhận'}</div>
                        <div className="bullet-item">Bước tiếp theo: {config.nextStagePage}</div>
                      </div>
                      {selectedStageLogs.length ? (
                        <div className="stack compact slide-design-log-list">
                          {selectedStageLogs.map((log) => (
                            <WorkflowLogItem key={log.id} log={log} />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  </div>

                  <div className="storyboard-modal-footer slide-design-footer">
                    <div className="storyboard-modal-actions">
                      <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                        Hủy bỏ
                      </button>
                      <button
                        className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete"
                        onClick={() => mutation.mutate({ action: 'submit', link: mainAssetLink || undefined })}
                        disabled={mutation.isPending || !hasStoryboardInput || !hasSlideSubmissionAsset}
                      >
                        {config.submitLabel}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : isVoiceStage ? (
        <>
          <Card title="Danh sách sản phẩm thu âm">
            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table storyboard-dashboard-table">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Người phụ trách</th>
                    <th>Đơn hàng</th>
                    <th>Trạng thái</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithDisplayStatus.map((row) => {
                    const key = `${row.order.id}::${row.product.id}`;
                    const status = row.displayStatus || row.record?.status || row.task?.status || 'todo';
                    const displayProductCode = productDisplayCodeMap.get(row.product.id) || row.product.id;
                    const displayOrderCode = orderDisplayCodeMap.get(row.order.id) || getDisplayOrderCode(row.order);
                    const assigneeLabel = getDomainRowAssigneeLabel(config.recordKind, row, profileNameById);
                    return (
                      <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                        <td>{displayProductCode}</td>
                        <td>{row.product.name}</td>
                        <td>{assigneeLabel}</td>
                        <td>{displayOrderCode}</td>
                        <td><Badge tone={toneForStatus(status)}>{getWorkflowStatusLabel(status)}</Badge></td>
                        <td>{formatDisplayDate(row.task?.due_date || row.order.deadline || row.record?.due_date)}</td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                            Xem chi tiết
                          </button>
                          {canArchiveStageRow(row, config.stageIndex) ? (
                            <button className="btn btn-ghost btn-small" onClick={() => void confirmArchiveRow(row)}>
                              Lưu trữ
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!rowsWithDisplayStatus.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước thu âm.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          {isDetailOpen && selected ? (
            <div className="storyboard-detail-page">
              <div className="storyboard-detail-shell slide-design-detail-shell">
                <div className="storyboard-modal-head">
                  <div>
                    <div className="storyboard-modal-eyebrow">{config.stageCode} / Thu âm</div>
                  </div>
                  <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Đóng cửa sổ chi tiết">
                    ×
                  </button>
                </div>

                <div className="slide-design-workspace">
                  {renderNotice(notice)}

                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedAssigneeLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  {config.pageId !== 'smf05' ? (
                  <section className="storyboard-modal-panel slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <h4>Tiến độ thu âm</h4>
                      </div>
                    </div>
                    <div className="storyboard-admin-checkpoints">
                      {['Chưa có đầu vào', 'Đã xác nhận', 'Đang thực hiện', 'Quá hạn', 'Chờ duyệt', 'Hoàn thành'].map((label) => {
                        const tone =
                          label === 'Chưa có đầu vào' ? 'warning' :
                          label === 'Quá hạn' ? 'danger' :
                          label === 'Hoàn thành' ? 'success' :
                          label === 'Chờ duyệt' ? 'neutral' :
                          'violet';
                        return (
                          <div key={label} className={`storyboard-admin-checkpoint ${voiceCheckpoint === label ? 'is-active' : ''} tone-${tone}`}>
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  ) : null}

                  <div className="storyboard-modal-stack">
                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 1</div>
                          <h4>Tài liệu đầu vào</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        <ReferenceDownloadBar
                          title={lessonScriptInputUrl ? getAssetLabel(lessonScriptInputUrl) : 'File Kịch bản (SMF-01)'}
                          meta={lessonScriptInputMeta}
                          url={lessonScriptInputUrl}
                          emptyLabel="Chưa có file kịch bản từ SMF-01"
                        />
                        {latestVoiceFeedbackReview ? (
                          <div className="storyboard-uploaded-file">
                            <div className="storyboard-input-file">
                              <div className="storyboard-input-file-icon" aria-hidden="true">💬</div>
                              <div className="storyboard-input-file-copy">
                                <div className="muted-text">Thông tin feedback từ SMF-06</div>
                                <div className="storyboard-input-file-main">
                                  {voiceFeedbackSummary ? <RichFeedbackText text={voiceFeedbackSummary} /> : 'QC yêu cầu chỉnh sửa file thu âm.'}
                                </div>
                                <div className="muted-text">{voiceFeedbackMeta}</div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="storyboard-input-bar-empty">Chưa có feedback từ SMF-06</div>
                        )}
                      </div>
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 2</div>
                          <h4>Hành động</h4>
                          <p>Xác nhận công việc, tải file thu âm và gửi duyệt sang SMF-06.</p>
                        </div>
                        <button
                          className="storyboard-ui-btn storyboard-confirm-btn"
                          onClick={() => mutation.mutate({ action: 'start' })}
                          disabled={mutation.isPending}
                        >
                          {config.startLabel}
                        </button>
                      </div>

                      <MultiFileActions
                        label="Upload Voice (MP3, WAV, ...)"
                        assetValue={selected?.record?.file_name}
                        onUpload={(files) => void runBatchAssetUpload('domain-main', 'Đang tải các file voice lên server', files)}
                        onDeleteItem={(fileUrl) => mutation.mutate({ action: 'delete_main_item', fileUrl })}
                        operation={assetOperations['domain-main']}
                        accept={AUDIO_ACCEPTED_FILE_TYPES}
                      />
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 3</div>
                          <h4>Lịch sử xử lý</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        {selectedStageLogs.map((log) => (
                          <WorkflowLogItem key={log.id} log={log} />
                        ))}
                        {!selectedStageLogs.length ? <div className="muted-text">Chưa có lịch sử cho bước này.</div> : null}
                      </div>
                    </section>
                  </div>

                  <div className="storyboard-modal-footer slide-design-footer">
                    <div className="storyboard-modal-actions">
                      <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                        Hủy bỏ
                      </button>
                      <button
                        className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete"
                        onClick={() => mutation.mutate({ action: 'submit' })}
                        disabled={mutation.isPending || !hasVoiceAssets}
                      >
                        {config.submitLabel}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : isVoiceStage ? (
        <>
          <Card title="Danh sách sản phẩm QC âm thanh">
            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table storyboard-dashboard-table">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Người phụ trách</th>
                    <th>Đơn hàng</th>
                    <th>Trạng thái</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = `${row.order.id}::${row.product.id}`;
                    const status = String(row.record?.status || row.task?.status || 'todo');
                    const displayProductCode = productDisplayCodeMap.get(row.product.id) || row.product.id;
                    const displayOrderCode = orderDisplayCodeMap.get(row.order.id) || getDisplayOrderCode(row.order);
                    const assigneeLabel = getDomainRowAssigneeLabel(config.recordKind, row, profileNameById);
                    return (
                      <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                        <td>{displayProductCode}</td>
                        <td>{row.product.name}</td>
                        <td>{assigneeLabel}</td>
                        <td>{displayOrderCode}</td>
                        <td><Badge tone={toneForStatus(status)}>{getWorkflowStatusLabel(status)}</Badge></td>
                        <td>{formatDisplayDate(row.task?.due_date || row.order.deadline || row.record?.due_date)}</td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                            Xem chi tiết
                          </button>
                          {canArchiveStageRow(row, config.stageIndex) ? (
                            <button className="btn btn-ghost btn-small" onClick={() => void confirmArchiveRow(row)}>
                              Lưu trữ
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước QC âm thanh.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          {isDetailOpen && selected ? (
            <div className="storyboard-detail-page">
              <div className="storyboard-detail-shell slide-design-detail-shell">
                <div className="storyboard-modal-head">
                  <div>
                    <div className="storyboard-modal-eyebrow">{config.stageCode} / QC Am thanh</div>
                  </div>
                  <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Đóng cửa sổ chi tiết">
                    ×
                  </button>
                </div>

                <div className="slide-design-workspace">
                  {renderNotice(notice)}

                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedReviewerLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  <section className="storyboard-modal-panel slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <h4>Tiến độ QC âm thanh</h4>
                      </div>
                    </div>
                    <div className="storyboard-admin-checkpoints">
                      {['Chưa có đầu vào', 'Đã xác nhận', 'Đang thực hiện', 'Quá hạn', 'Chờ duyệt', 'Hoàn thành'].map((label) => {
                        const tone =
                          label === 'Chưa có đầu vào' ? 'warning' :
                          label === 'Quá hạn' ? 'danger' :
                          label === 'Hoàn thành' ? 'success' :
                          label === 'Chờ duyệt' ? 'neutral' :
                          'violet';
                        return (
                          <div key={label} className={`storyboard-admin-checkpoint ${voiceQcCheckpoint === label ? 'is-active' : ''} tone-${tone}`}>
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <div className="storyboard-modal-stack">
                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 1</div>
                          <h4>Tài liệu đầu vào</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        <ReferenceDownloadBar
                          title={selectedLessonScriptUrl ? getAssetLabel(selectedLessonScriptUrl) : 'File Kịch bản (SMF-01)'}
                          meta={selectedLessonScriptMeta}
                          url={selectedLessonScriptUrl}
                          emptyLabel="Chưa có file kịch bản từ SMF-01"
                        />
                        <div className="stack compact">
                          {selectedVoiceInputItems.length ? selectedVoiceInputItems.map((item) => (
                            <ReferenceDownloadBar
                              key={item.url}
                              title={item.label || getAssetLabel(item.url)}
                              meta="File Voice từ SMF-05"
                              url={item.url}
                              emptyLabel="Chưa có file voice từ SMF-05"
                            />
                          )) : (
                            <ReferenceDownloadBar
                              title="File Voice từ SMF-05"
                              meta="Chưa có file voice được upload"
                              url={null}
                              emptyLabel="Chưa có file voice từ SMF-05"
                            />
                          )}
                        </div>
                      </div>
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 2</div>
                          <h4>Hành động</h4>
                          <p>Xác nhận công việc, nhập feedback text để trả lại hoặc duyệt hoàn thành.</p>
                        </div>
                        <button className="storyboard-ui-btn storyboard-confirm-btn" onClick={() => mutation.mutate({ action: 'start' })}>
                          Xác nhận công việc
                        </button>
                      </div>

                      <textarea className="fta" rows={6} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={'Nhập feedback, mỗi ý một dòng. Ví dụ:\n**Âm lượng**\n- [ ] Cắt noise đoạn 00:12\n- [x] Đã sửa nhịp đọc câu mở đầu'} />
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 3</div>
                          <h4>Lịch sử xử lý</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        {selectedStageLogs.map((log) => (
                          <WorkflowLogItem key={log.id} log={log} />
                        ))}
                        {!selectedStageLogs.length ? <div className="muted-text">Chưa có lịch sử cho bước này.</div> : null}
                      </div>
                    </section>
                  </div>

                  <div className="storyboard-modal-footer slide-design-footer">
                    <div className="storyboard-modal-actions">
                      <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                        Hủy bỏ
                      </button>
                      <button className="storyboard-ui-btn storyboard-ui-btn-secondary" onClick={() => mutation.mutate({ action: 'submit' })}>
                        Trả lại
                      </button>
                      <button className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete" onClick={() => mutation.mutate({ action: 'submit' })}>
                        Duyệt
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : isLayeredVideoStage ? (
        <>
          <Card title="Danh sách sản phẩm biên tập video">
            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table storyboard-dashboard-table">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Người phụ trách</th>
                    <th>Đơn hàng</th>
                    <th>Trạng thái</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rowsWithDisplayStatus.map((row) => {
                    const key = `${row.order.id}::${row.product.id}`;
                    const status = row.displayStatus || row.record?.status || row.task?.status || 'todo';
                    const displayProductCode = productDisplayCodeMap.get(row.product.id) || row.product.id;
                    const displayOrderCode = orderDisplayCodeMap.get(row.order.id) || getDisplayOrderCode(row.order);
                    const assigneeLabel = getDomainRowAssigneeLabel(config.recordKind, row, profileNameById);
                    return (
                      <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                        <td>{displayProductCode}</td>
                        <td>{row.product.name}</td>
                        <td>{assigneeLabel}</td>
                        <td>{displayOrderCode}</td>
                        <td><Badge tone={toneForStatus(status)}>{getWorkflowStatusLabel(status)}</Badge></td>
                        <td>{formatDisplayDate(row.task?.due_date || row.order.deadline || row.record?.due_date)}</td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                            Xem chi tiet
                          </button>
                          {canArchiveStageRow(row, config.stageIndex) ? (
                            <button className="btn btn-ghost btn-small" onClick={() => void confirmArchiveRow(row)}>
                              Lưu trữ
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!rowsWithDisplayStatus.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước biên tập video.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          {isDetailOpen && selected ? (
            <div className="storyboard-detail-page">
              <div className="storyboard-detail-shell slide-design-detail-shell">
                <div className="storyboard-modal-head">
                  <div>
                    <div className="storyboard-modal-eyebrow">{config.stageCode} / Bien tap Video</div>
                  </div>
                  <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Dong cua so chi tiet">
                    x
                  </button>
                </div>

                <div className="slide-design-workspace">
                  {renderNotice(notice)}

                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedAssigneeLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  {config.pageId !== 'smf07' ? (
                  <section className="storyboard-modal-panel slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <h4>Tiến độ biên tập video</h4>
                      </div>
                    </div>
                    <div className="storyboard-admin-checkpoints">
                      {['Chưa có đầu vào', 'Đã xác nhận', 'Đang thực hiện', 'Quá hạn', 'Chờ duyệt', 'Hoàn thành'].map((label) => {
                        const tone =
                          label === 'Chưa có đầu vào' ? 'warning' :
                          label === 'Quá hạn' ? 'danger' :
                          label === 'Hoàn thành' ? 'success' :
                          label === 'Chờ duyệt' ? 'neutral' :
                          'violet';
                        return (
                          <div key={label} className={`storyboard-admin-checkpoint ${videoCheckpoint === label ? 'is-active' : ''} tone-${tone}`}>
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  ) : null}

                  <div className="storyboard-modal-stack">
                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 1</div>
                          <h4>Tài liệu đầu vào</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        <div className="storyboard-reference-subtitle">Kịch bản</div>
                        <ReferenceDownloadBar
                          title={selectedLessonScriptUrl ? getAssetLabel(selectedLessonScriptUrl) : `File Kịch bản từ ${layeredVideoScriptStageCode}`}
                          meta={selectedLessonScriptMeta}
                          url={selectedLessonScriptUrl}
                          emptyLabel={`Chưa có file kịch bản từ ${layeredVideoScriptStageCode}`}
                        />
                        <div className="storyboard-reference-subtitle">Voice</div>
                        {videoVoiceAssetItems.length ? videoVoiceAssetItems.map((item) => (
                          <ReferenceDownloadBar
                            key={item.url}
                            title={item.label || getAssetLabel(item.url)}
                            meta={videoVoiceInputMeta}
                            url={item.url}
                            emptyLabel={`Chưa có file voice từ ${layeredVideoVoiceStageCode}`}
                          />
                        )) : (
                          <ReferenceDownloadBar
                            title={`File Voice tu ${layeredVideoVoiceStageCode}`}
                            meta="Chưa có file voice được upload"
                            url={null}
                            emptyLabel={`Chưa có file voice từ ${layeredVideoVoiceStageCode}`}
                          />
                        )}
                        <div className="storyboard-reference-subtitle">Slides</div>
                        <ReferenceDownloadBar
                          title={videoSlideAsset ? getAssetLabel(videoSlideAsset) : `File Slide tu ${layeredVideoSlideStageCode}`}
                          meta={videoSlideInputMeta}
                          url={videoSlideAsset || null}
                          emptyLabel={`Chưa có file slide từ ${layeredVideoSlideStageCode}`}
                        />
                        <ReferenceDownloadBar
                          title={videoSlideProductLink ? getAssetLabel(videoSlideProductLink) : `Link sản phẩm từ ${layeredVideoSlideStageCode}`}
                          meta={`Link Drive sản phẩm do ${layeredVideoSlideStageCode} dán thủ công`}
                          url={videoSlideProductLink || null}
                          emptyLabel={`Chưa có link sản phẩm từ ${layeredVideoSlideStageCode}`}
                        />
                        <div className="storyboard-reference-subtitle">Feedback</div>
                        <ReferenceDownloadBar
                          title={videoFeedbackAssetUrl ? getAssetLabel(videoFeedbackAssetUrl) : `File Feedback tu ${layeredVideoQcStageCode}`}
                          meta={videoFeedbackMeta}
                          note={latestVideoFeedbackReview?.comment}
                          url={videoFeedbackAssetUrl}
                          emptyLabel={`Chưa có file feedback từ ${layeredVideoQcStageCode}`}
                        />
                      </div>
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 2</div>
                          <h4>Hành động</h4>
                          <p>{`Cập nhật link video hoàn thiện và gửi duyệt sang ${layeredVideoQcStageCode}.`}</p>
                        </div>
                        <button
                          className="storyboard-ui-btn storyboard-confirm-btn"
                          onClick={() => mutation.mutate({ action: 'start' })}
                          disabled={mutation.isPending || !hasVideoSlideInput || !hasVideoVoiceInput}
                        >
                          {config.startLabel}
                        </button>
                      </div>

                      <div className="form-grid storyboard-form-grid">
                        <label className="full">
                          <span>Link video hoàn thiện</span>
                          <input className="fi" value={mainAssetLink} onChange={(e) => setMainAssetLink(e.target.value)} placeholder="https://..." />
                        </label>
                        <label className="full">
                          <span>Ghi chú handoff</span>
                          <textarea className="fta" rows={4} value={draft.notes || ''} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} />
                        </label>
                      </div>

                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 3</div>
                          <h4>Lịch sử xử lý</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        {selectedStageLogs.map((log) => (
                          <WorkflowLogItem key={log.id} log={log} />
                        ))}
                        {!selectedStageLogs.length ? <div className="muted-text">Chưa có lịch sử cho bước này.</div> : null}
                      </div>
                    </section>
                  </div>

                  <div className="storyboard-modal-footer slide-design-footer">
                    <div className="storyboard-modal-actions">
                      <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                        Huy bo
                      </button>
                      <button
                        className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete"
                        onClick={() => mutation.mutate({ action: 'submit', link: mainAssetLink })}
                        disabled={mutation.isPending || !hasVideoLink}
                      >
                        Gửi duyệt
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
      <div className="storyboard-layout">
        <Card title={'Queue thao t\u00e1c'}>
          <StageQueue
            rows={rowsWithDisplayStatus}
            selectedKey={selectedKey}
            setSelectedKey={setSelectedKey}
            getMeta={(row) => getAssetSummary(row.record?.file_name) || row.record?.title || 'Ch\u01b0a c\u00f3 h\u1ed3 s\u01a1 t\u00e1c nghi\u1ec7p'}
            colorizeFrame={shouldColorTaskLinked}
          />
        </Card>
        <Card title={selected ? `${selected.product.id}: ${selected.product.name}` : 'Workspace'}>
          {selected ? (
            <div className="storyboard-workspace">
              {renderNotice(notice)}
              {isSlideDesignStage ? (
                <div className="slide-design-workspace">
                  <div className="slide-design-hero">
                    <div className="slide-design-chip">{config.stageCode} SLIDE DESIGN</div>
                    <div className="slide-design-title">{selected.product.name}</div>
                    <div className="slide-design-code">Mã sản phẩm: {selectedDisplayProductCode}</div>
                  </div>

                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedAssigneeLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  <section className="slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <div className="slide-design-section-eyebrow">PHẦN 1</div>
                        <h4>Tài liệu đầu vào</h4>
                      </div>
                    </div>
                    <div className="stack compact">
                      <ReferenceDownloadBar
                        title={storyboardInputUrl ? getAssetLabel(storyboardInputUrl) : 'File Storyboard (SMF-02)'}
                        meta={storyboardInputMeta}
                        url={storyboardInputUrl}
                        emptyLabel={storyboardEmptyLabel}
                      />
                      <ReferenceDownloadBar
                        title={feedbackAssetUrl ? getAssetLabel(feedbackAssetUrl) : 'File feedback (SMF-04)'}
                        meta={feedbackMeta}
                        note={latestSlideFeedbackReview?.comment}
                        url={feedbackAssetUrl}
                        emptyLabel="Chưa có feedback"
                      />
                    </div>
                  </section>

                  <section className="slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <div className="slide-design-section-eyebrow">PHẦN 2</div>
                        <h4>Hành động</h4>
                        <p>Tiếp nhận nhiệm vụ và tải slide PDF để gửi duyệt.</p>
                      </div>
                      <button
                        className="storyboard-ui-btn storyboard-confirm-btn"
                        onClick={() => mutation.mutate({ action: 'start' })}
                        disabled={mutation.isPending || !hasStoryboardInput}
                      >
                        {config.startLabel}
                      </button>
                    </div>

                    <div className="slide-design-upload-label">Tải lên file slide / hồ sơ</div>
                    <label
                      className={`storyboard-upload-dropzone slide-design-upload-dropzone ${isSlideDragOver ? 'is-dragover' : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsSlideDragOver(true);
                      }}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsSlideDragOver(true);
                      }}
                      onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                        setIsSlideDragOver(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const file = event.dataTransfer.files?.[0];
                        setIsSlideDragOver(false);
                        if (!file) return;
                        void runAssetUpload('domain-main', 'Đang tải file slide lên server', { action: 'upload_main', file });
                      }}
                    >
                      <div className="slide-design-upload-icon" aria-hidden="true">📄</div>
                      <div className="storyboard-upload-dropzone-title">Nhấn để tải lên hoặc kéo thả file</div>
                      <div className="storyboard-upload-dropzone-subtitle">Chấp nhận {SLIDE_DESIGN_ACCEPTED_FILE_LABEL}, tối đa {WORKFLOW_MAX_UPLOAD_MB}MB</div>
                      <input
                        type="file"
                        accept={SLIDE_DESIGN_ACCEPTED_FILE_TYPES}
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          void runAssetUpload('domain-main', 'Đang tải file slide lên server', { action: 'upload_main', file });
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>

                    <UploadProgressPanel operation={assetOperations['domain-main']} />

                    {canUseSlideProductLink ? (
                      <div className="slide-design-link-panel">
                        <label className="full">
                          <span>Link sản phẩm</span>
                          <input className="fi" value={mainAssetLink} onChange={(event) => setMainAssetLink(event.target.value)} placeholder="https://..." />
                        </label>
                        <div className="action-row">
                          <button
                            className="storyboard-ui-btn storyboard-ui-btn-secondary"
                            onClick={() => mutation.mutate({ action: 'save_main_link', link: mainAssetLink })}
                            disabled={mutation.isPending || !String(mainAssetLink).trim()}
                          >
                            Lưu link
                          </button>
                          <button
                            className="storyboard-ui-btn storyboard-ui-btn-ghost"
                            onClick={() => { setMainAssetLink(''); mutation.mutate({ action: 'save_main_link', link: '' }); }}
                            disabled={mutation.isPending || !String(mainAssetLink).trim()}
                          >
                            Xóa link
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {hasSlideAsset ? (
                      <div className="storyboard-uploaded-file">
                        <div className="storyboard-input-file">
                          <div className="storyboard-input-file-icon" aria-hidden="true">📎</div>
                          <div className="storyboard-input-file-copy">
                            <div className="muted-text">Slide PDF đã tải lên</div>
                            {isAssetUrl(currentSlideAsset) ? (
                              <a href={currentSlideAsset} target="_blank" rel="noreferrer">
                                {getAssetLabel(currentSlideAsset)}
                              </a>
                            ) : (
                              <div className="storyboard-input-file-main">{currentSlideAsset}</div>
                            )}
                          </div>
                        </div>
                        <div className="action-row">
                          {isAssetUrl(currentSlideAsset) ? (
                            <a className="storyboard-ui-btn storyboard-ui-btn-secondary" href={currentSlideAsset} target="_blank" rel="noreferrer">
                              Tải xuống
                            </a>
                          ) : null}
                          <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={() => mutation.mutate({ action: 'delete_main' })}>
                            Xóa file
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <div className="storyboard-modal-footer slide-design-footer">
                    <div className="storyboard-modal-actions">
                      <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={() => setNotice(null)}>
                        Hủy bỏ
                      </button>
                      <button
                        className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete"
                        onClick={() => mutation.mutate({ action: 'submit', link: mainAssetLink || undefined })}
                        disabled={mutation.isPending || !hasStoryboardInput || !hasSlideSubmissionAsset}
                      >
                        {config.submitLabel}
                      </button>
                    </div>
                  </div>
                </div>
              ) : isVideoStage ? (
                <div className="slide-design-workspace">
                  <div className="slide-design-hero">
                    <div className="slide-design-chip">{config.stageCode} VIDEO EDIT</div>
                    <div className="slide-design-title">{selected.product.name}</div>
                    <div className="slide-design-code">Mã sản phẩm: {selectedDisplayProductCode}</div>
                  </div>

                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedAssigneeLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  <section className="storyboard-modal-panel slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <h4>Tiến độ biên tập video</h4>
                      </div>
                    </div>
                    <div className="storyboard-admin-checkpoints">
                      {['Chưa có đầu vào', 'Đã xác nhận', 'Đang thực hiện', 'Quá hạn', 'Chờ duyệt', 'Hoàn thành'].map((label) => {
                        const tone =
                          label === 'Chưa có đầu vào' ? 'warning' :
                          label === 'Quá hạn' ? 'danger' :
                          label === 'Hoàn thành' ? 'success' :
                          label === 'Chờ duyệt' ? 'neutral' :
                          'violet';
                        return (
                          <div key={label} className={`storyboard-admin-checkpoint ${videoCheckpoint === label ? 'is-active' : ''} tone-${tone}`}>
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <div className="storyboard-modal-stack">
                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 1</div>
                          <h4>Tài liệu đầu vào</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        <div className="storyboard-reference-subtitle">Kịch bản</div>
                        <ReferenceDownloadBar
                          title={selectedLessonScriptUrl ? getAssetLabel(selectedLessonScriptUrl) : 'File Kịch bản từ SMF-01'}
                          meta={selectedLessonScriptMeta}
                          url={selectedLessonScriptUrl}
                          emptyLabel="Chưa có file kịch bản từ SMF-01"
                        />
                        <div className="storyboard-reference-subtitle">Voice</div>
                        {videoVoiceAssetItems.length ? videoVoiceAssetItems.map((item) => (
                          <ReferenceDownloadBar
                            key={item.url}
                            title={item.label || getAssetLabel(item.url)}
                            meta={videoVoiceInputMeta}
                            url={item.url}
                            emptyLabel="Chưa có file voice từ SMF-05"
                          />
                        )) : (
                          <ReferenceDownloadBar
                            title="File Voice từ SMF-05"
                            meta="Chưa có file voice được upload"
                            url={null}
                            emptyLabel="Chưa có file voice từ SMF-05"
                          />
                        )}
                        <div className="storyboard-reference-subtitle">Slides</div>
                        <ReferenceDownloadBar
                          title={videoSlideAsset ? getAssetLabel(videoSlideAsset) : 'File Slide từ SMF-03'}
                          meta={videoSlideInputMeta}
                          url={videoSlideAsset || null}
                          emptyLabel="Chưa có file slide từ SMF-03"
                        />
                        <ReferenceDownloadBar
                          title={videoSlideProductLink ? getAssetLabel(videoSlideProductLink) : 'Link sản phẩm từ SMF-03'}
                          meta="Link Drive sản phẩm do SMF-03 dán thủ công"
                          url={videoSlideProductLink || null}
                          emptyLabel="Chưa có link sản phẩm từ SMF-03"
                        />
                        <div className="storyboard-reference-subtitle">Feedback</div>
                        <ReferenceDownloadBar
                          title={videoFeedbackAssetUrl ? getAssetLabel(videoFeedbackAssetUrl) : 'File Feedback từ SMF-08'}
                          meta={videoFeedbackMeta}
                          note={latestVideoFeedbackReview?.comment}
                          url={videoFeedbackAssetUrl}
                          emptyLabel="Chưa có file feedback từ SMF-08"
                        />
                      </div>
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 2</div>
                          <h4>Hành động</h4>
                          <p>Cập nhật link video hoàn thiện và gửi duyệt sang SMF-08.</p>
                        </div>
                      </div>

                      <div className="form-grid storyboard-form-grid">
                        <label className="full">
                          <span>Link video hoàn thiện</span>
                          <input className="fi" value={mainAssetLink} onChange={(e) => setMainAssetLink(e.target.value)} placeholder="https://..." />
                        </label>
                        <label className="full">
                          <span>Ghi chú handoff</span>
                          <textarea className="fta" rows={4} value={draft.notes || ''} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} />
                        </label>
                      </div>

                      <div className="action-row">
                        <button
                          className="btn btn-danger"
                          onClick={() => mutation.mutate({ action: 'submit', link: mainAssetLink })}
                          disabled={mutation.isPending || !hasVideoLink}
                        >
                          Gửi duyệt
                        </button>
                      </div>
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 3</div>
                          <h4>Lịch sử xử lý</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        {selectedStageLogs.map((log) => (
                          <WorkflowLogItem key={log.id} log={log} />
                        ))}
                        {!selectedStageLogs.length ? <div className="muted-text">Chưa có lịch sử cho bước này.</div> : null}
                      </div>
                    </section>
                  </div>
                </div>
              ) : (
              <>
              <div className="form-grid storyboard-form-grid">
                {config.recordKind === 'slide_design' ? (
                  <>
                    <label><span>Số lượng slides</span><input className="fi" type="number" min="1" value={draft.target_slides || 1} onChange={(e) => setDraft((c) => ({ ...c, target_slides: Math.max(1, Number(e.target.value) || 1) }))} /></label>
                    <label><span>{'\u0110\u00e3 xong'}</span><input className="fi" type="number" value={draft.completed_slides || 0} onChange={(e) => setDraft((c) => ({ ...c, completed_slides: Number(e.target.value) || 0 }))} /></label>
                    <label className="full"><span>File slides / URL</span><input className="fi" value={draft.file_name || ''} onChange={(e) => setDraft((c) => ({ ...c, file_name: e.target.value }))} /></label>
                    <label className="full"><span>Yêu cầu thương hiệu</span><input className="fi" value={draft.brand_spec || ''} onChange={(e) => setDraft((c) => ({ ...c, brand_spec: e.target.value }))} /></label>
                  </>
                ) : null}
                {config.recordKind === 'voice_over' ? (
                  <>
                    <label><span>{'Th\u1eddi l\u01b0\u1ee3ng d\u1ef1 ki\u1ebfn'}</span><input className="fi" type="number" value={draft.estimated_minutes || 0} onChange={(e) => setDraft((c) => ({ ...c, estimated_minutes: Number(e.target.value) || 0 }))} /></label>
                    <label><span>{'\u0110\u00e3 thu'}</span><input className="fi" type="number" value={draft.recorded_minutes || 0} onChange={(e) => setDraft((c) => ({ ...c, recorded_minutes: Number(e.target.value) || 0 }))} /></label>
                    <label className="full"><span>File voice / URL</span><input className="fi" value={draft.file_name || ''} onChange={(e) => setDraft((c) => ({ ...c, file_name: e.target.value }))} /></label>
                    <label className="full"><span>Phong cách giọng đọc</span><input className="fi" value={draft.voice_style || ''} onChange={(e) => setDraft((c) => ({ ...c, voice_style: e.target.value }))} /></label>
                  </>
                ) : null}
                {config.recordKind === 'video_edit' ? (
                  <>
                    <label><span>{'Target ph\u00fat'}</span><input className="fi" type="number" value={draft.target_minutes || 0} onChange={(e) => setDraft((c) => ({ ...c, target_minutes: Number(e.target.value) || 0 }))} /></label>
                    <label><span>Tiến độ render</span><input className="fi" type="number" value={draft.render_progress || 0} onChange={(e) => setDraft((c) => ({ ...c, render_progress: Math.min(100, Number(e.target.value) || 0) }))} /></label>
                    <label className="full"><span>File video / URL</span><input className="fi" value={draft.file_name || ''} onChange={(e) => setDraft((c) => ({ ...c, file_name: e.target.value }))} /></label>
                    <label><span>File subtitle / URL</span><input className="fi" value={draft.subtitle_file || ''} onChange={(e) => setDraft((c) => ({ ...c, subtitle_file: e.target.value }))} /></label>
                    <label><span>Cấu hình render</span><input className="fi" value={draft.render_preset || ''} onChange={(e) => setDraft((c) => ({ ...c, render_preset: e.target.value }))} /></label>
                  </>
                ) : null}
                <label className="full"><span>Note / handoff</span><textarea className="fta" rows={4} value={draft.notes || ''} onChange={(e) => setDraft((c) => ({ ...c, notes: e.target.value }))} /></label>
              </div>
              <div className="stack compact">
                {config.recordKind === 'slide_design' ? (
                  <ReferenceAsset
                    label={'Storyboard dau vao'}
                    assetValue={selectedStoryboardRecord?.file_name}
                    emptyLabel={'Chưa có storyboard để tải tại bước này.'}
                  />
                ) : null}
                {config.recordKind === 'voice_over' ? (
                  <>
                    <ReferenceAsset
                      label={'Storyboard tham chieu'}
                      assetValue={selectedStoryboardRecord?.file_name}
                      emptyLabel={'Chưa có storyboard để tải tại bước này.'}
                    />
                    <ReferenceAsset
                      label={'Kịch bản / slides tham chiếu'}
                      assetValue={selectedSlideRecord?.file_name}
                      emptyLabel={'Chưa có file kịch bản/slides để tải tại bước này.'}
                    />
                  </>
                ) : null}
                <div className="bullet-item">Upload limit: {WORKFLOW_MAX_UPLOAD_MB}MB per file</div>
                {usesVideoLinkOnly(config.pageId) ? (
                  <>
                    <label className="full">
                      <span>Link video</span>
                      <input className="fi" value={mainAssetLink} onChange={(e) => setMainAssetLink(e.target.value)} placeholder="https://..." />
                    </label>
                    <div className="action-row">
                      <button className="btn btn-ghost" onClick={() => mutation.mutate({ action: 'save_main_link', link: mainAssetLink })}>Lưu link</button>
                      <button className="btn btn-ghost" onClick={() => { setMainAssetLink(''); mutation.mutate({ action: 'save_main_link', link: '' }); }}>Xóa link</button>
                    </div>
                  </>
                ) : canUseSlideProductLink ? (
                  <>
                    <label className="full">
                      <span>Link sản phẩm</span>
                      <input className="fi" value={mainAssetLink} onChange={(e) => setMainAssetLink(e.target.value)} placeholder="https://..." />
                    </label>
                    <div className="action-row">
                      <button className="btn btn-ghost" onClick={() => mutation.mutate({ action: 'save_main_link', link: mainAssetLink })}>Lưu link</button>
                      <button className="btn btn-ghost" onClick={() => { setMainAssetLink(''); mutation.mutate({ action: 'save_main_link', link: '' }); }}>Xóa link</button>
                    </div>
                    <FileActions
                      label={'Tải file chính'}
                      assetValue={draft.file_name || selected.record?.file_name}
                      onUpload={(file) => void runAssetUpload('domain-main', 'Đang tải file chính lên server', { action: 'upload_main', file })}
                      onDelete={() => mutation.mutate({ action: 'delete_main' })}
                      operation={assetOperations['domain-main']}
                      accept={SLIDE_DESIGN_ACCEPTED_FILE_TYPES}
                    />
                  </>
                ) : config.recordKind === 'voice_over' ? (
                  <MultiFileActions
                    label={'T\u1ea3i file voice'}
                    assetValue={selected.record?.file_name}
                    onUpload={(files) => void runBatchAssetUpload('domain-main', 'Đang tải các file voice lên server', files)}
                    onDeleteItem={(fileUrl) => mutation.mutate({ action: 'delete_main_item', fileUrl })}
                    operation={assetOperations['domain-main']}
                    accept={AUDIO_ACCEPTED_FILE_TYPES}
                  />
                ) : (
                  <FileActions
                    label={'T\u1ea3i file ch\u00ednh'}
                    assetValue={draft.file_name || selected.record?.file_name}
                    onUpload={(file) => void runAssetUpload('domain-main', 'Đang tải file chính lên server', { action: 'upload_main', file })}
                    onDelete={() => mutation.mutate({ action: 'delete_main' })}
                    operation={assetOperations['domain-main']}
                    accept={config.recordKind === 'slide_design' ? SLIDE_DESIGN_ACCEPTED_FILE_TYPES : VIDEO_ACCEPTED_FILE_TYPES}
                  />
                )}
                {config.recordKind === 'video_edit' ? (
                  <FileActions
                    label={'T\u1ea3i file'}
                    assetValue={draft.subtitle_file || selected.record?.subtitle_file}
                    onUpload={(file) => void runAssetUpload('domain-subtitle', 'Đang tải subtitle lên server', { action: 'upload_subtitle', file })}
                    onDelete={() => mutation.mutate({ action: 'delete_subtitle' })}
                    operation={assetOperations['domain-subtitle']}
                    accept={SUBTITLE_ACCEPTED_FILE_TYPES}
                  />
                ) : null}
              </div>
              <div className="stack compact">
                {checklistConfig.map((item) => (
                  <label className={`review-criterion ${draft.checklist?.[item.key] ? 'pass' : ''}`} key={item.key}>
                    <input type="checkbox" checked={Boolean(draft.checklist?.[item.key])} onChange={(e) => setDraft((c) => ({ ...c, checklist: { ...(c.checklist || {}), [item.key]: e.target.checked } }))} />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
              <div className="action-row">
                <button className="btn btn-ghost" onClick={() => mutation.mutate({ action: 'create' })}>{'T\u1ea1o h\u1ed3 s\u01a1'}</button>
                <button className="btn btn-ghost" onClick={() => mutation.mutate({ action: 'save' })}>{'L\u01b0u c\u1eadp nh\u1eadt'}</button>
                <button className="btn btn-ghost" onClick={() => mutation.mutate({ action: 'start' })}>{config.startLabel}</button>
                <button className="btn btn-danger" onClick={() => mutation.mutate({ action: 'submit', link: canUseSlideProductLink ? mainAssetLink || undefined : undefined })}>{config.submitLabel}</button>
                {canArchiveStageRow(selected, config.stageIndex) ? (
                  <button className="btn btn-ghost" onClick={confirmSelectedArchive}>Lưu trữ</button>
                ) : null}
              </div>
              </>
              )}
            </div>
          ) : <div className="muted-text">{'Ch\u1ecdn item \u0111\u1ec3 thao t\u00e1c.'}</div>}
        </Card>
        <div className="stack storyboard-sidebar">
        <Card title={'Task li\u00ean k\u1ebft'}>
          {selected ? (
            <div className="stack compact">
              {notice ? <div className="bullet-item">{notice.message}</div> : null}
              <div className="bullet-item">Task: {selected.task?.id || 'Ch\u01b0a t\u1ea1o'}</div>
               <div className="bullet-item">Trạng thái task: <Badge tone={toneForStatus(linkedTaskStatus)}>{getWorkflowStatusLabel(linkedTaskStatus)}</Badge></div>
              <div className="bullet-item">Bắt đầu lúc: {selected.task?.id && (startedAtOverrides[selected.task.id] || startedAtByTask.get(selected.task.id)) ? new Date(String(startedAtOverrides[selected.task.id] || startedAtByTask.get(selected.task.id))).toLocaleString('vi-VN') : 'Chưa ghi nhận'}</div>
               <div className="bullet-item">Bước tiếp theo: {config.nextStagePage}</div>
            </div>
          ) : <div className="muted-text">{'Ch\u1ecdn item \u0111\u1ec3 xem task.'}</div>}
        </Card>
        {shouldColorTaskLinked ? (
          <Card title="Lịch sử bước">
            <div className="stack compact">
              {selectedStageLogs.map((log) => (
                <WorkflowLogItem key={log.id} log={log} />
              ))}
              {!selectedStageLogs.length ? <div className="muted-text">Chưa có log cho bước này.</div> : null}
            </div>
          </Card>
        ) : null}
        </div>
      </div>
      )}
    </div>
  );
}

export function QualityGatePage({ pageId }: { pageId: PageKey }) {
  const config = QC_CONFIGS[pageId as QcConfig['pageId']];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, loading } = useAuth();
  const { role: shellRole } = useAppShell();
  const { pushToast } = useToast();
  const viewerRole = normalizeAppRole(profile?.role || shellRole);
  const shouldAutoNavigate = canSeeAllStageAssignments(viewerRole);
  const isAdminRole = canSeeAllStageAssignments(viewerRole);
  const isInternalRole = Boolean(viewerRole && !['client', 'client_director'].includes(viewerRole));
  const isSlideQcStage = config.recordKind === 'slide_design';
  const isVoiceQcStage = config.recordKind === 'voice_over';
  const queryClient = useQueryClient();
  const shouldUseServerPreview = !loading && shouldUseMyTasksPreview(viewerRole);
  const previewOptions = useMemo(() => ({ stageIndices: [config.stageIndex], includeActivityLogs: true }), [config.stageIndex]);
  const previewQuery = useQuery({
    queryKey: getMyTasksPreviewQueryKey(viewerRole, profile?.email || '', previewOptions),
    queryFn: () => fetchMyTasksPreview(viewerRole, profile?.email || null, previewOptions),
    enabled: shouldUseServerPreview,
    staleTime: 1000 * 60,
  });
  const useFallbackQueries = !shouldUseServerPreview || previewQuery.isError;
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts, enabled: useFallbackQueries });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'stage', config.stageIndex], queryFn: () => listTasks({ stageIndices: [config.stageIndex] }), enabled: useFallbackQueries });
  const workflowQuery = useQuery({
    queryKey: ['workflow-records', config.recordKind, 'with-reviews'],
    queryFn: () => listWorkflowRecords({ kinds: [config.recordKind], includeReviews: true, includeQuestionLibrary: false }),
    enabled: useFallbackQueries,
  });
  const inputItemsQuery = useQuery({ queryKey: ['input-items', config.module], queryFn: () => listInputItems({ module: config.module }), enabled: useFallbackQueries });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'qc-stage-assignees'], queryFn: listProfiles, enabled: useFallbackQueries });
  const activityLogsQuery = useQuery({
    queryKey: ['activity-logs', 'qc-task-starts', config.stageCode],
    queryFn: () =>
      listActivityLogs({
        actionTypes: ['task_started', 'workflow_step_started', 'workflow_review_claimed', 'workflow_step_submitted', 'workflow_step_returned', 'workflow_step_approved'],
        limit: 1000,
    }),
    staleTime: 1000 * 60 * 2,
    enabled: useFallbackQueries,
  });
  const usePreviewData = shouldUseServerPreview && Boolean(previewQuery.data);
  const ordersData = usePreviewData ? { orders: previewQuery.data!.orders, products: previewQuery.data!.products } : ordersQuery.data;
  const tasksData = usePreviewData ? (previewQuery.data?.tasks || []) : (tasksQuery.data || []);
  const profilesData = usePreviewData ? (previewQuery.data?.profiles || []) : (profilesQuery.data || []);
  const activityLogs = usePreviewData ? (previewQuery.data?.activityLogs || []) : (activityLogsQuery.data || []);
  const workflowData = usePreviewData
    ? {
        slideDesigns: previewQuery.data?.slideDesigns || [],
        slideDesignReviews: previewQuery.data?.slideDesignReviews || [],
        voiceOvers: previewQuery.data?.voiceOvers || [],
        voiceReviews: previewQuery.data?.voiceReviews || [],
        videoEdits: previewQuery.data?.videoEdits || [],
        videoReviews: previewQuery.data?.videoReviews || [],
      }
    : workflowQuery.data;
  const inputItemsData = usePreviewData ? (previewQuery.data?.inputItems || []) : (inputItemsQuery.data || []);
  const stageWorkKeys = useMemo(
    () =>
      new Set(
        (previewQuery.data?.workItems || [])
          .filter((item) => item.stage_index === config.stageIndex)
          .map((item) => `${item.order_id}::${item.product_id}`),
      ),
    [config.stageIndex, previewQuery.data?.workItems],
  );

  const records =
    config.recordKind === 'slide_design'
      ? workflowData?.slideDesigns || []
      : config.recordKind === 'voice_over'
        ? workflowData?.voiceOvers || []
        : workflowData?.videoEdits || [];
  const reviews =
    config.recordKind === 'slide_design'
      ? workflowData?.slideDesignReviews || []
      : config.recordKind === 'voice_over'
        ? workflowData?.voiceReviews || []
        : workflowData?.videoReviews || [];
  const rows = useMemo(() => {
    const baseRows = getRowsForStage(
      ordersData?.orders || [],
      ordersData?.products || [],
      tasksData,
      records,
      config.module,
      [config.stageIndex],
      usePreviewData ? stageWorkKeys : undefined,
    );
    if (usePreviewData) {
      return baseRows.filter((row) => stageWorkKeys.has(`${row.order.id}::${row.product.id}`));
    }
    if (!isAdminRole) {
      return baseRows.filter((row) => isTaskExplicitlyAssignedToCurrentProfile(row.task, profile, profilesData));
    }
    return baseRows;
  }, [config.module, config.stageIndex, isAdminRole, ordersData, profile, profilesData, records, stageWorkKeys, tasksData, usePreviewData]);
  const qcOrderDisplayCodeMap = useMemo(
    () => new Map((ordersData?.orders || []).map((order) => [order.id, getDisplayOrderCode(order)])),
    [ordersData?.orders],
  );
  const qcProductDisplayCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    const orders = ordersData?.orders || [];
    const products = ordersData?.products || [];
    for (const order of orders) {
      const displayOrderCode = qcOrderDisplayCodeMap.get(order.id) || order.id;
      const orderProducts = products.filter((product) => product.order_id === order.id);
      const displayMap = buildDisplayProductCodeMap(displayOrderCode, orderProducts);
      for (const [productId, displayCode] of displayMap) {
        map.set(productId, displayCode);
      }
    }
    return map;
  }, [ordersData?.orders, ordersData?.products, qcOrderDisplayCodeMap]);

  const [selectedKey, setSelectedKey] = useState('');
  const [notice, setNotice] = useState<NoticeState>(null);
  const [comment, setComment] = useState('');
  const [criteria, setCriteria] = useState<Record<string, boolean>>({});
  const [selectedReviewerProfileId, setSelectedReviewerProfileId] = useState('');
  const [reviewLink, setReviewLink] = useState('');
  const [assetOperations, setAssetOperations] = useState<Record<string, UploadOperationState>>({});
  const [videoQcFeedbackOverrides, setVideoQcFeedbackOverrides] = useState<Record<string, string>>({});
  const [videoQcSubtitleOverrides, setVideoQcSubtitleOverrides] = useState<Record<string, string>>({});
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const isLayeredVideoQcStage = config.pageId === 'smf08' || config.pageId === 'vsmf08';

  const startedAtByTask = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of activityLogs) {
      const taskId = typeof log.metadata?.task_id === 'string' ? log.metadata.task_id : null;
      if (!taskId) continue;
      const current = map.get(taskId);
      if (!current || new Date(log.happened_at).getTime() < new Date(current).getTime()) {
        map.set(taskId, log.happened_at);
      }
    }
    return map;
  }, [activityLogs]);

  useEffect(() => {
    setSelectedKey('');
    setNotice(null);
    setComment('');
    setCriteria({});
    setSelectedReviewerProfileId('');
    setReviewLink('');
    setAssetOperations({});
    setVideoQcFeedbackOverrides({});
    setVideoQcSubtitleOverrides({});
    setIsDetailOpen(false);
  }, [config.pageId]);

  useEffect(() => {
    const firstKey = rows[0] ? `${rows[0].order.id}::${rows[0].product.id}` : '';
    const selectedStillVisible = selectedKey ? rows.some((row) => `${row.order.id}::${row.product.id}` === selectedKey) : false;
    const productKey = searchParams.get('product');
    if (productKey) {
      const productStillVisible = rows.some((row) => `${row.order.id}::${row.product.id}` === productKey);
      if (productStillVisible && productKey !== selectedKey) setSelectedKey(productKey);
      if (!productStillVisible && selectedKey) setSelectedKey('');
      return;
    }
    if (firstKey && (!selectedKey || !selectedStillVisible)) setSelectedKey(firstKey);
    if (!firstKey && selectedKey) setSelectedKey('');
  }, [config.pageId, rows, searchParams, selectedKey]);

  const selected = useMemo(() => rows.find((row) => `${row.order.id}::${row.product.id}` === selectedKey) || null, [rows, selectedKey]);
  const selectedStageLogs = useMemo(
    () =>
      activityLogs.filter(
        (log) =>
          log.metadata?.order_id === selected?.order.id &&
          log.metadata?.product_id === selected?.product.id &&
          (log.metadata?.stage_code === config.stageCode || log.metadata?.stage_code === config.previousStagePage),
      ),
    [activityLogs, config.previousStagePage, config.stageCode, selected?.order.id, selected?.product.id],
  );
  const selectedReviews = useMemo(
    () =>
      reviews.filter(
        (item: any) =>
          item[
            config.recordKind === 'slide_design'
              ? 'slide_design_id'
              : config.recordKind === 'voice_over'
                ? 'voice_over_id'
                : 'video_edit_id'
          ] === selected?.record?.id,
      ),
    [config.recordKind, reviews, selected?.record?.id],
  );
  const selectedLessonScript = useMemo(
    () => findVoiceScriptInputItem(inputItemsData as InputItemRow[], selected, config.module),
    [config.module, inputItemsData, selected],
  );
  const assigneeProfiles = useMemo(
    () => toAssignableProfiles(profilesData, ['admin', 'content_manager', 'production_manager', 'pm', 'qc', 'hoc_gia']),
    [profilesData],
  );
  const profileNameById = useMemo<Map<string, string>>(
    () => new Map((profilesData as ProfileRow[]).map((item) => [item.id, item.full_name || item.email || item.id])),
    [profilesData],
  );
  const selectedReviewer = findAssignableProfile(assigneeProfiles, selectedReviewerProfileId);
  const selectedReviewerLabel = selectedReviewer?.fullName || selected?.task?.assignee || profile?.fullName || 'Chưa phân công';
  const criteriaConfig = config.recordKind === 'slide_design' ? SLIDE_CHECKLIST : config.recordKind === 'voice_over' ? VOICE_CHECKLIST : VIDEO_CHECKLIST;
  const selectedStartedAt = selected?.task?.id ? startedAtByTask.get(selected.task.id) || '' : '';
  const selectedDeadline = selected?.task?.due_date || selected?.order.deadline || selected?.record?.due_date || null;
  const selectedDisplayOrderCode = selected ? qcOrderDisplayCodeMap.get(selected.order.id) || getDisplayOrderCode(selected.order) : '';
  const selectedDisplayProductCode = selected ? qcProductDisplayCodeMap.get(selected.product.id) || selected.product.id : '';
  const selectedGeneralNote = String(selected?.record?.notes || selected?.order.intake_note || '').trim();
  const selectedFeedbackFile = isSlideQcStage ? getSlideDesignFeedbackFile(selected?.record) : selected?.record?.file_name || '';
  const selectedSlideInputFile = selected?.record?.file_name || '';
  const selectedSlideProductLink = getManualSlideProductLink(selected?.record?.brand_spec);
  const selectedVoiceSourceRecord = useMemo(
    () =>
      isVoiceQcStage && selected
        ? findWorkflowRecordByProduct(workflowData?.voiceOvers, selected.order.id, selected.product.id)
        : null,
    [isVoiceQcStage, selected, workflowData?.voiceOvers],
  );
  const selectedVoiceInputItems = useMemo(
    () => parseAssetItems(selectedVoiceSourceRecord?.file_name || selected?.record?.file_name),
    [selected?.record?.file_name, selectedVoiceSourceRecord?.file_name],
  );
  const selectedLessonScriptUrl = selectedLessonScript?.file_url || selectedLessonScript?.file_name || null;
  const selectedLessonScriptMeta = selectedLessonScript?.updated_at
    ? `File Kịch bản từ SMF-01 | ${formatRelativeUploadMeta(selectedLessonScript.updated_at)}`
    : 'File Kịch bản từ SMF-01';
  const layeredQcScriptStageCode = config.module === 'VIDEO' ? 'VSMF-01' : 'SMF-01';
  const layeredQcVoiceStageCode = config.module === 'VIDEO' ? 'VSMF-05' : 'SMF-05';
  const layeredQcEditStageCode = config.module === 'VIDEO' ? 'VSMF-07' : 'SMF-07';
  const layeredQcCurrentStageCode = config.module === 'VIDEO' ? 'VSMF-08' : 'SMF-08';
  const selectedVideoInputUrl = isLayeredVideoQcStage ? String(selected?.record?.file_name || '').trim() : '';
  const selectedVideoInputMeta = selected?.record?.submitted_at
    ? `Link video tu ${layeredQcEditStageCode} | ${formatRelativeUploadMeta(selected.record.submitted_at)}`
    : `Link video tu ${layeredQcEditStageCode}`;
  const selectedVideoQcFeedbackFile = isLayeredVideoQcStage ? videoQcFeedbackOverrides[selectedKey] || getVideoEditQcFeedbackFile(selected?.record) : '';
  const selectedVideoQcSubtitleFile = isLayeredVideoQcStage ? videoQcSubtitleOverrides[selectedKey] || selected?.record?.subtitle_file : selected?.record?.subtitle_file;
  const qcCheckpoint = useMemo(() => {
    if (!isSlideQcStage) return null;
    const status = String(selected?.task?.status || selected?.record?.status || 'todo');
    const dueTime = selectedDeadline ? new Date(selectedDeadline).getTime() : NaN;
    if (!selectedSlideInputFile && !selectedSlideProductLink) return 'Chưa có đầu vào';
    if (['approved', 'qc_passed', 'done', 'completed'].includes(status)) return 'Hoàn thành';
    if (!Number.isNaN(dueTime) && dueTime < Date.now() && !['approved', 'qc_passed', 'done', 'completed'].includes(status)) return 'Quá hạn';
    if (selectedFeedbackFile || status === 'in_progress') return 'Đang thực hiện';
    if (status === 'claimed' || Boolean(selected?.record?.qc_reviewer_profile_id) || Boolean(selected?.record?.handoff_profile_id) || Boolean(selected?.task)) return 'Đã xác nhận';
    return 'Đã xác nhận';
  }, [isSlideQcStage, selected?.record?.qc_reviewer_profile_id, selected?.record?.status, selected?.task, selectedDeadline, selectedFeedbackFile, selectedSlideInputFile, selectedSlideProductLink]);
  const voiceQcCheckpoint = useMemo(() => {
    if (!isVoiceQcStage) return null;
    const status = String(selected?.task?.status || selected?.record?.status || 'todo');
    const dueTime = selectedDeadline ? new Date(selectedDeadline).getTime() : NaN;
    if (!selectedVoiceInputItems.length || !selectedLessonScriptUrl) return 'Chưa có đầu vào';
    if (['approved', 'qc_passed', 'done', 'completed'].includes(status)) return 'Hoàn thành';
    if (status === 'submitted_video') return 'Chờ duyệt';
    if (!Number.isNaN(dueTime) && dueTime < Date.now() && !['approved', 'qc_passed', 'done', 'completed'].includes(status)) return 'Quá hạn';
    if (status === 'in_progress') return 'Đang thực hiện';
    if (status === 'claimed' || Boolean(selected?.record?.qc_reviewer_profile_id) || Boolean(selected?.record?.handoff_profile_id) || Boolean(selected?.task)) return 'Đã xác nhận';
    return 'Đã xác nhận';
  }, [isVoiceQcStage, selected?.record?.handoff_profile_id, selected?.record?.qc_reviewer_profile_id, selected?.record?.status, selected?.task, selectedDeadline, selectedLessonScriptUrl, selectedVoiceInputItems.length]);
  const videoQcCheckpoint = useMemo(() => {
    if (!isLayeredVideoQcStage) return null;
    const status = String(selected?.task?.status || selected?.record?.status || 'todo');
    const dueTime = selectedDeadline ? new Date(selectedDeadline).getTime() : NaN;
    if (!selectedVideoInputUrl) return 'Chưa có đầu vào';
    if (['approved', 'qc_passed', 'done', 'completed'].includes(status)) return 'Hoàn thành';
    if (status === 'submitted_qc') return 'Chờ duyệt';
    if (!Number.isNaN(dueTime) && dueTime < Date.now() && !['approved', 'qc_passed', 'done', 'completed'].includes(status)) return 'Quá hạn';
    if (selectedVideoQcFeedbackFile || status === 'in_progress') return 'Đang thực hiện';
    if (status === 'claimed' || Boolean(selected?.record?.qc_reviewer_profile_id) || Boolean(selected?.task)) return 'Đã xác nhận';
    return 'Đã xác nhận';
  }, [isLayeredVideoQcStage, selected?.record?.qc_reviewer_profile_id, selected?.record?.status, selected?.task, selectedDeadline, selectedVideoInputUrl, selectedVideoQcFeedbackFile]);

  useEffect(() => {
    setComment(selectedReviews[0]?.comment || '');
    const nextCriteria: Record<string, boolean> = {};
    for (const item of criteriaConfig) nextCriteria[item.key] = Boolean(selectedReviews[0]?.criteria?.[item.key] ?? true);
    setCriteria(nextCriteria);
  }, [criteriaConfig, selectedReviews]);

  useEffect(() => {
    if (!selected) {
      setSelectedReviewerProfileId('');
      return;
    }
    setSelectedReviewerProfileId(selected.task?.assignee_profile_id || getQcReviewerProfileId(selected.record) || profile?.id || '');
  }, [profile?.id, selected]);

  useEffect(() => {
    setReviewLink(String(selected?.record?.file_name || ''));
  }, [selected?.record?.file_name]);

  useEffect(() => {
    const operationKeys = Object.keys(assetOperations);
    if (!operationKeys.length) return;
    const timer = window.setInterval(() => {
      setAssetOperations((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, operation]) => [
            key,
            {
              ...operation,
              progress: operation.progress >= 92 ? operation.progress : Math.min(92, operation.progress + (operation.progress < 40 ? 18 : operation.progress < 72 ? 10 : 4)),
            },
          ]),
        ) as Record<string, UploadOperationState>,
      );
    }, 260);
    return () => window.clearInterval(timer);
  }, [assetOperations]);

  function startAssetOperation(key: string, label: string) {
    setAssetOperations((current) => ({
      ...current,
      [key]: {
        label,
        progress: 8,
        tone: 'violet',
      },
    }));
  }

  function finishAssetOperation(key: string, label: string) {
    setAssetOperations((current) => ({
      ...current,
      [key]: {
        label,
        progress: 100,
        tone: 'success',
      },
    }));
    window.setTimeout(() => {
      setAssetOperations((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }, 700);
  }

  function failAssetOperation(key: string, label: string) {
    setAssetOperations((current) => ({
      ...current,
      [key]: {
        label,
        progress: 100,
        tone: 'danger',
      },
    }));
    window.setTimeout(() => {
      setAssetOperations((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }, 1200);
  }

  async function runAssetUpload(key: string, label: string, action: { action: 'upload_main' | 'upload_subtitle'; file: File }) {
    startAssetOperation(key, label);
    try {
      await mutation.mutateAsync(action);
      finishAssetOperation(key, 'Đã tải lên xong');
    } catch (error) {
      failAssetOperation(key, 'Upload that bai, vui long thu lai');
      throw error;
    }
  }

  function openDetail(key: string) {
    setSelectedKey(key);
    setIsDetailOpen(true);
  }

  function closeDetail() {
    setIsDetailOpen(false);
  }

  async function archiveRow(row: { order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }) {
    const key = `${row.order.id}::${row.product.id}`;
    await archiveTasksForStage(row.order.id, row.product.id, config.stageIndex);
    if (selectedKey === key) {
      setIsDetailOpen(false);
      setSelectedKey('');
    }
    setNotice({ tone: 'success', message: 'Đã lưu trữ khỏi màn hiện tại.' });
    pushToast({ title: 'Đã lưu trữ', message: `${row.product.id} đã được ẩn khỏi ${config.stageCode}.`, tone: 'success' });
    await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
    await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
  }

  async function confirmArchiveRow(row: { order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }) {
    if (!confirmArchiveStageAction(row.product.id, config.stageCode)) return;
    await archiveRow(row);
  }

  async function runQcAssetUpload(key: string, label: string, action: { action: 'upload_main' | 'upload_subtitle'; file: File }) {
    startAssetOperation(key, label);
    try {
      const result = await mutation.mutateAsync(action);
      if (key === 'qc-main' && typeof result?.qcFeedbackFile === 'string' && selectedKey) {
        setVideoQcFeedbackOverrides((current) => ({ ...current, [selectedKey]: result.qcFeedbackFile }));
      }
      if (key === 'qc-subtitle' && typeof result?.subtitleFile === 'string' && selectedKey) {
        setVideoQcSubtitleOverrides((current) => ({ ...current, [selectedKey]: result.subtitleFile }));
      }
      finishAssetOperation(key, 'Đã tải lên xong');
    } catch (error) {
      failAssetOperation(key, 'Upload that bai, vui long thu lai');
      throw error;
    }
  }

  const mutation = useMutation({
    mutationFn: async (input: {
      action: 'claim' | 'fail' | 'pass' | 'archive' | 'delete_review' | 'upload_main' | 'delete_main' | 'upload_subtitle' | 'delete_subtitle' | 'save_link';
      reviewId?: string;
      file?: File;
      link?: string;
    }) => {
      if (!selected) throw new Error('Ch\u01b0a ch\u1ecdn item QC.');
      const existingTasks = tasksData;
      const task =
        selected.task ||
        (await ensureTaskForStage({
          orderId: selected.order.id,
          productId: selected.product.id,
          stageIndex: config.stageIndex,
          existingTasks,
          assignee: selectedReviewer?.fullName || profile?.fullName || null,
          assigneeProfileId: selectedReviewer?.profileId || profile?.id || null,
          assigneeAccountId: selectedReviewer?.accountId || profile?.authUserId || null,
        }));
      const record =
        selected.record ||
        (await ensureWorkflowRecord({
          kind: config.recordKind,
          orderId: selected.order.id,
          productId: selected.product.id,
          title: `${selected.product.id}: ${selected.product.name}`,
          profileId: profile?.id || null,
        }));

      if (input.action === 'archive') {
        await archiveTasksForStage(selected.order.id, selected.product.id, config.stageIndex);
        return { notice: 'Đã lưu trữ khỏi màn hiện tại.', archived: true };
      }

      if (input.action === 'delete_review' && input.reviewId) {
        if (config.recordKind === 'slide_design') await deleteSlideDesignReview(input.reviewId);
        else if (config.recordKind === 'voice_over') await deleteVoiceReview(input.reviewId);
        else await deleteVideoReview(input.reviewId);
        return { notice: '\u0110\u00e3 x\u00f3a review log.' };
      }

      if (input.action === 'save_link') {
        const nextLink = String(input.link ?? reviewLink).trim();
        await updateWorkflowRecord(config.recordKind, record.id, {
          file_name: nextLink || null,
          updated_at: new Date().toISOString(),
        });
        return { notice: nextLink ? 'Đã lưu link video review.' : 'Đã xóa link video review.' };
      }

      if (input.action === 'upload_main') {
        if (!input.file) throw new Error('Ch\u01b0a c\u00f3 file \u0111\u1ec3 upload.');
        validateWorkflowFile(input.file);
        const currentFeedbackFile = getSlideDesignFeedbackFile(record);
        const uploaded = await uploadWorkflowAsset({
          file: input.file,
          orderId: selected.order.id,
          productId: selected.product.id,
          module: config.module,
          stageCode: config.stageCode,
          slot: config.recordKind === 'slide_design' ? 'qc-slide' : 'qc-video',
          previousUrl:
            config.recordKind === 'slide_design'
              ? currentFeedbackFile
              : config.recordKind === 'video_edit'
                ? getVideoEditQcFeedbackFile(record)
                : record.file_name,
        });
        if (config.recordKind === 'slide_design') {
          const meta = parseSlideDesignMeta(record.brand_spec);
          await updateWorkflowRecord('slide_design', record.id, {
            brand_spec: serializeSlideDesignMeta({ ...meta, qcFeedbackFile: uploaded.fileUrl }),
            updated_at: new Date().toISOString(),
          });
        } else if (config.recordKind === 'video_edit') {
          await updateWorkflowRecord('video_edit', record.id, {
            checklist: { ...readWorkflowChecklist(record.checklist), qcFeedbackFile: uploaded.fileUrl },
            updated_at: new Date().toISOString(),
          });
          return { notice: '\u0110\u00e3 t\u1ea3i file review l\u00ean server.', qcFeedbackFile: uploaded.fileUrl };
        } else {
          await updateWorkflowRecord(config.recordKind, record.id, {
            file_name: uploaded.fileUrl,
            updated_at: new Date().toISOString(),
          });
        }
        return { notice: '\u0110\u00e3 t\u1ea3i file review l\u00ean server.' };
      }

      if (input.action === 'delete_main') {
        if (config.recordKind === 'slide_design') {
          const currentFeedbackFile = getSlideDesignFeedbackFile(record);
          if (isAssetUrl(currentFeedbackFile)) {
            await deleteWorkflowAsset({ fileUrl: String(currentFeedbackFile) });
          }
          const meta = parseSlideDesignMeta(record.brand_spec);
          await updateWorkflowRecord('slide_design', record.id, {
            brand_spec: serializeSlideDesignMeta({ ...meta, qcFeedbackFile: '' }),
            updated_at: new Date().toISOString(),
          });
        } else if (config.recordKind === 'video_edit') {
          const currentFeedbackFile = getVideoEditQcFeedbackFile(record);
          if (isAssetUrl(currentFeedbackFile)) {
            await deleteWorkflowAsset({ fileUrl: String(currentFeedbackFile) });
          }
          await updateWorkflowRecord('video_edit', record.id, {
            checklist: { ...readWorkflowChecklist(record.checklist), qcFeedbackFile: '' },
            updated_at: new Date().toISOString(),
          });
        } else {
          if (isAssetUrl(record.file_name)) {
            await deleteWorkflowAsset({ fileUrl: String(record.file_name) });
          }
          await updateWorkflowRecord(config.recordKind, record.id, {
            file_name: null,
            updated_at: new Date().toISOString(),
          });
        }
        return { notice: '\u0110\u00e3 x\u00f3a file \u0111ang review.', qcFeedbackFile: '' };
      }

      if (input.action === 'upload_subtitle') {
        if (config.recordKind !== 'video_edit') throw new Error('B\u01b0\u1edbc n\u00e0y kh\u00f4ng c\u00f3 subtitle.');
        if (!input.file) throw new Error('Ch\u01b0a c\u00f3 subtitle \u0111\u1ec3 upload.');
        validateWorkflowFile(input.file);
        const uploaded = await uploadWorkflowAsset({
          file: input.file,
          orderId: selected.order.id,
          productId: selected.product.id,
          module: config.module,
          stageCode: config.stageCode,
          slot: 'qc-subtitle',
          previousUrl: record.subtitle_file,
        });
        await updateWorkflowRecord('video_edit', record.id, {
          subtitle_file: uploaded.fileUrl,
          updated_at: new Date().toISOString(),
        });
        return { notice: '\u0110\u00e3 t\u1ea3i subtitle review l\u00ean server.', subtitleFile: uploaded.fileUrl };
      }

      if (input.action === 'delete_subtitle') {
        if (config.recordKind !== 'video_edit') throw new Error('B\u01b0\u1edbc n\u00e0y kh\u00f4ng c\u00f3 subtitle.');
        if (isAssetUrl(record.subtitle_file)) {
          await deleteWorkflowAsset({ fileUrl: String(record.subtitle_file) });
        }
        await updateWorkflowRecord('video_edit', record.id, {
          subtitle_file: null,
          updated_at: new Date().toISOString(),
        });
        return { notice: '\u0110\u00e3 x\u00f3a subtitle \u0111ang review.', subtitleFile: '' };
      }

      if (input.action === 'claim') {
        await updateTask(task.id, { status: 'in_progress', ...buildTaskAssigneePatch(selectedReviewer) });
        await updateWorkflowRecord(config.recordKind, record.id, {
          ...(config.recordKind === 'voice_over'
            ? { handoff_profile_id: selectedReviewerProfileId || null }
            : { qc_reviewer_profile_id: selectedReviewerProfileId || null }),
          updated_at: new Date().toISOString(),
        });
        if (task.status !== 'in_progress') {
          await createActivityLog({
            actorProfileId: profile?.id || null,
            actionType: 'workflow_review_claimed',
            objectType: 'task',
            objectId: task.id,
            summary: `${selected.product.id} claimed ${config.stageCode}`,
            metadata: {
              task_id: task.id,
              order_id: selected.order.id,
              product_id: selected.product.id,
              stage_code: config.stageCode,
              stage_index: config.stageIndex,
              module: config.module,
            },
          });
        }
        return { notice: '\u0110\u00e3 ghi nh\u1eadn b\u1eaft \u0111\u1ea7u review.' };
      }

      if (config.recordKind === 'slide_design') {
        if (input.action === 'fail') {
          if (!getSlideDesignFeedbackFile(record)) {
            throw new Error('Vui lòng upload file Feedback trước khi trả lại SMF-03.');
          }
          await archiveTasksForStage(selected.order.id, selected.product.id, config.stageIndex);
          await ensureTaskForStage({ orderId: selected.order.id, productId: selected.product.id, stageIndex: config.previousStageIndex, existingTasks, assignee: null });
          await updateProduct(selected.product.id, { current_stage_index: config.previousStageIndex, progress: 55 });
          await updateWorkflowRecord('slide_design', record.id, {
            status: 'changes_requested',
            qc_reviewer_profile_id: selectedReviewerProfileId || null,
            returned_at: new Date().toISOString(),
            approved_at: null,
            updated_at: new Date().toISOString(),
          });
          await createActivityLog({
            actorProfileId: profile?.id || null,
            actionType: 'workflow_step_returned',
            objectType: 'workflow',
            objectId: record.id,
            summary: `${selected.product.id} returned to ${config.previousStagePage}`,
            metadata: {
              order_id: selected.order.id,
              product_id: selected.product.id,
              stage_code: config.previousStagePage,
              stage_index: config.previousStageIndex,
              module: config.module,
            },
          });
          await runOptionalWorkflowSideEffect(
            createSlideDesignReview({ slideDesignId: record.id, reviewerProfileId: profile?.id || null, decision: 'changes_requested', comment: comment || 'QC chưa đạt, trả về bước trước.', criteria }),
          );
          return { notice: `\u0110\u00e3 tr\u1ea3 v\u1ec1 ${config.previousStagePage}.` };
        }
        await updateTask(task.id, { status: 'done', progress: 100, ...buildTaskAssigneePatch(selectedReviewer) });
        await ensureTaskForStage({ orderId: selected.order.id, productId: selected.product.id, stageIndex: config.nextStageIndex, existingTasks, assignee: null });
        await updateProduct(selected.product.id, { current_stage_index: config.nextStageIndex, progress: 63 });
        await updateWorkflowRecord('slide_design', record.id, {
          status: 'qc_passed',
          qc_reviewer_profile_id: selectedReviewerProfileId || null,
          approved_at: new Date().toISOString(),
          returned_at: null,
          updated_at: new Date().toISOString(),
        });
        await createActivityLog({
          actorProfileId: profile?.id || null,
          actionType: 'workflow_step_approved',
          objectType: 'workflow',
          objectId: record.id,
          summary: `${selected.product.id} approved at ${config.previousStagePage}`,
          metadata: {
            order_id: selected.order.id,
            product_id: selected.product.id,
            stage_code: config.previousStagePage,
            stage_index: config.previousStageIndex,
            module: config.module,
          },
        });
        await runOptionalWorkflowSideEffect(
          createSlideDesignReview({ slideDesignId: record.id, reviewerProfileId: profile?.id || null, decision: 'approved', comment: comment || 'QC đã duyệt.', criteria }),
        );
        return { notice: `\u0110\u00e3 pass sang ${config.nextStagePage}.` };
      }

      if (config.recordKind === 'voice_over') {
        if (input.action === 'fail') {
          if (!comment.trim()) {
            throw new Error('Vui lòng nhập feedback trước khi trả lại SMF-05.');
          }
          await archiveTasksForStage(selected.order.id, selected.product.id, config.stageIndex);
          await ensureTaskForStage({ orderId: selected.order.id, productId: selected.product.id, stageIndex: config.previousStageIndex, existingTasks, assignee: null });
          await updateProduct(selected.product.id, { current_stage_index: config.previousStageIndex, progress: 55 });
          await updateWorkflowRecord('voice_over', record.id, {
            status: 'changes_requested',
            handoff_profile_id: selectedReviewerProfileId || null,
            returned_at: new Date().toISOString(),
            completed_at: null,
            updated_at: new Date().toISOString(),
          });
          await createActivityLog({
            actorProfileId: profile?.id || null,
            actionType: 'workflow_step_returned',
            objectType: 'workflow',
            objectId: record.id,
            summary: `${selected.product.id} returned to ${config.previousStagePage}`,
            metadata: {
              order_id: selected.order.id,
              product_id: selected.product.id,
              stage_code: config.previousStagePage,
              stage_index: config.previousStageIndex,
              module: config.module,
            },
          });
          await runOptionalWorkflowSideEffect(
            createVoiceReview({ voiceOverId: record.id, reviewerProfileId: profile?.id || null, decision: 'changes_requested', comment: comment || '\u0051\u0043 ch\u01b0a \u0111\u1ea1t, tr\u1ea3 v\u1ec1 b\u01b0\u1edbc tr\u01b0\u1edbc.', criteria }),
          );
          return { notice: `\u0110\u00e3 tr\u1ea3 v\u1ec1 ${config.previousStagePage}.` };
        }
        await updateTask(task.id, { status: 'done', progress: 100, ...buildTaskAssigneePatch(selectedReviewer) });
        await ensureTaskForStage({ orderId: selected.order.id, productId: selected.product.id, stageIndex: config.nextStageIndex, existingTasks, assignee: null });
        await updateProduct(selected.product.id, { current_stage_index: config.nextStageIndex, progress: 63 });
        await updateWorkflowRecord('voice_over', record.id, {
          status: 'completed',
          handoff_profile_id: selectedReviewerProfileId || null,
          completed_at: new Date().toISOString(),
          returned_at: null,
          updated_at: new Date().toISOString(),
        });
        await createActivityLog({
          actorProfileId: profile?.id || null,
          actionType: 'workflow_step_approved',
          objectType: 'workflow',
          objectId: record.id,
          summary: `${selected.product.id} approved at ${config.previousStagePage}`,
          metadata: {
            order_id: selected.order.id,
            product_id: selected.product.id,
            stage_code: config.previousStagePage,
            stage_index: config.previousStageIndex,
            module: config.module,
          },
        });
        await runOptionalWorkflowSideEffect(
          createVoiceReview({ voiceOverId: record.id, reviewerProfileId: profile?.id || null, decision: 'approved', comment: comment || 'QC \u0111\u00e3 duy\u1ec7t.', criteria }),
        );
        return { notice: `\u0110\u00e3 pass sang ${config.nextStagePage}.` };
      }

      if (input.action === 'fail') {
        const nextVersion = Math.max(1, (record.current_version || 1) + 1);
        await archiveTasksForStage(selected.order.id, selected.product.id, config.stageIndex);
        await ensureTaskForStage({ orderId: selected.order.id, productId: selected.product.id, stageIndex: config.previousStageIndex, existingTasks, assignee: null });
        await updateProduct(selected.product.id, { current_stage_index: config.previousStageIndex, progress: 75 });
        await updateWorkflowRecord('video_edit', record.id, {
          status: 'changes_requested',
          qc_reviewer_profile_id: selectedReviewerProfileId || null,
          returned_at: new Date().toISOString(),
          current_version: nextVersion,
          render_progress: 75,
          approved_at: null,
          updated_at: new Date().toISOString(),
        });
        await createActivityLog({
          actorProfileId: profile?.id || null,
          actionType: 'workflow_step_returned',
          objectType: 'workflow',
          objectId: record.id,
          summary: `${selected.product.id} returned to ${config.previousStagePage}`,
          metadata: {
            order_id: selected.order.id,
            product_id: selected.product.id,
            stage_code: config.previousStagePage,
            stage_index: config.previousStageIndex,
            module: config.module,
          },
        });
        await runOptionalWorkflowSideEffect(
          createVideoReview({ videoEditId: record.id, reviewerProfileId: profile?.id || null, decision: 'changes_requested', comment: comment || 'QC chưa đạt, trả về bước trước.', criteria }),
        );
        return { notice: '\u0110\u00e3 tr\u1ea3 l\u1ea1i', nextRoute: config.previousStageRoute };
      }

      await updateTask(task.id, { status: 'done', progress: 100, ...buildTaskAssigneePatch(selectedReviewer) });
      await updateWorkflowRecord('video_edit', record.id, {
        status: 'qc_passed',
        qc_reviewer_profile_id: selectedReviewerProfileId || null,
        approved_at: new Date().toISOString(),
        returned_at: null,
        updated_at: new Date().toISOString(),
      });
      await createActivityLog({
        actorProfileId: profile?.id || null,
        actionType: 'workflow_step_approved',
        objectType: 'workflow',
        objectId: record.id,
        summary: `${selected.product.id} approved at ${config.previousStagePage}`,
        metadata: {
          order_id: selected.order.id,
          product_id: selected.product.id,
          stage_code: config.previousStagePage,
          stage_index: config.previousStageIndex,
          module: config.module,
        },
      });
      await runOptionalWorkflowSideEffect(
        createVideoReview({ videoEditId: record.id, reviewerProfileId: profile?.id || null, decision: 'approved', comment: comment || 'QC đã duyệt.', criteria }),
      );
      if (config.pageId === 'vsmf08') {
        await updateProduct(selected.product.id, { current_stage_index: 7, progress: 100, ready_for_delivery: true, finished: true });
        await updateOrder(selected.order.id, { status: 'ready_delivery' });
        return { notice: '\u0110\u00e3 pass v\u00e0 s\u1eb5n s\u00e0ng b\u00e0n giao.' };
      }
      await ensureTaskForStage({ orderId: selected.order.id, productId: selected.product.id, stageIndex: config.nextStageIndex, existingTasks, assignee: null });
      await updateProduct(selected.product.id, { current_stage_index: config.nextStageIndex, progress: 88 });
      return { notice: `\u0110\u00e3 pass sang ${config.nextStagePage}.` };
    },
    onSuccess: async (result) => {
      setNotice(result?.notice ? { tone: 'success', message: result.notice } : null);
      if (result?.archived) {
        setIsDetailOpen(false);
        setSelectedKey('');
      }
      if (typeof result?.qcFeedbackFile === 'string' && selectedKey) {
        setVideoQcFeedbackOverrides((current) => ({ ...current, [selectedKey]: result.qcFeedbackFile }));
      }
      if (typeof result?.subtitleFile === 'string' && selectedKey) {
        setVideoQcSubtitleOverrides((current) => ({ ...current, [selectedKey]: result.subtitleFile }));
      }
      if (result?.notice === '\u0110\u00e3 tr\u1ea3 l\u1ea1i') {
        pushToast({ title: result.notice, tone: 'success' });
      } else {
      pushToast({ title: `${config.stageCode} đã cập nhật`, message: result?.notice || 'Đã ghi nhận review.', tone: 'success' });
      }
      await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['activity-logs', 'task-starts'] });
      await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
      if (!shouldAutoNavigate) return;
      if (result?.nextRoute) {
        navigate(`/${result.nextRoute}`);
        return;
      }
      if (result?.notice?.includes(config.previousStagePage)) {
        navigate(`/${config.previousStageRoute}`);
        return;
      }
      if (config.nextStageRoute && result?.notice?.includes(config.nextStagePage)) {
        navigate(`/${config.nextStageRoute}`);
      }
    },
    onError: (error) => {
      setNotice({ tone: 'danger', message: formatErrorMessage(error) });
      pushToast({ title: `${config.stageCode} thất bại`, message: formatErrorMessage(error), tone: 'danger', durationMs: 4200 });
    },
  });

  function confirmSelectedArchive() {
    if (!selected) return;
    if (!confirmArchiveStageAction(selected.product.id, config.stageCode)) return;
    mutation.mutate({ action: 'archive' });
  }

  return (
    <div className={`workflow-stage-page${isDetailOpen ? ' is-detail-open' : ''}`}>
      <SectionHeader eye={config.eye} title={config.title} subtitle={config.subtitle} />
      {isSlideQcStage ? (
        <>
          <Card title="Danh sách sản phẩm QC slides">
            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table storyboard-dashboard-table">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Người phụ trách</th>
                    <th>Đơn hàng</th>
                    <th>Trạng thái</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = `${row.order.id}::${row.product.id}`;
                    const deadline = row.task?.due_date || row.order.deadline || row.record?.due_date;
                    const status = getDeadlineAwareStatus(row.record?.status || row.task?.status || 'todo', deadline);
                    const displayProductCode = qcProductDisplayCodeMap.get(row.product.id) || row.product.id;
                    const displayOrderCode = qcOrderDisplayCodeMap.get(row.order.id) || getDisplayOrderCode(row.order);
                    const assigneeLabel = getQcRowAssigneeLabel(row, profileNameById);
                    return (
                      <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                        <td>{displayProductCode}</td>
                        <td>{row.product.name}</td>
                        <td>{assigneeLabel}</td>
                        <td>{displayOrderCode}</td>
                        <td><Badge tone={toneForStatus(status)}>{getWorkflowStatusLabel(status)}</Badge></td>
                        <td>{formatDisplayDate(deadline)}</td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                            Xem chi tiet
                          </button>
                          {canArchiveStageRow(row, config.stageIndex) ? (
                            <button className="btn btn-ghost btn-small" onClick={() => void confirmArchiveRow(row)}>
                              Lưu trữ
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước QC slides.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          {isDetailOpen && selected ? (
            <div className="storyboard-detail-page">
              <div className="storyboard-detail-shell slide-design-detail-shell">
                <div className="storyboard-modal-head">
                  <div>
                    <div className="storyboard-modal-eyebrow">{config.stageCode} / QC Slides</div>
                  </div>
                  <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Dong cua so chi tiet">
                    x
                  </button>
                </div>

                <div className="slide-design-workspace">
                  {renderNotice(notice)}

                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedReviewerLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  <section className="storyboard-modal-panel slide-design-section">
                    {selectedFeedbackFile ? (
                      <div className="storyboard-uploaded-file">
                        <div className="storyboard-input-file">
                          <div className="storyboard-input-file-icon" aria-hidden="true">DOC</div>
                          <div className="storyboard-input-file-copy">
                            <div className="muted-text">File feedback hien tai</div>
                            <a href={selectedFeedbackFile} target="_blank" rel="noreferrer">
                              {getAssetLabel(selectedFeedbackFile)}
                            </a>
                          </div>
                        </div>
                        <a className="storyboard-ui-btn storyboard-ui-btn-secondary" href={selectedFeedbackFile} target="_blank" rel="noreferrer">
                          Tai xuong
                        </a>
                      </div>
                    ) : null}
                  </section>

                  <div className="storyboard-modal-stack">
                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 1</div>
                          <h4>Tài liệu đầu vào</h4>
                        </div>
                      </div>
                      <ReferenceDownloadBar
                        title={selectedSlideInputFile ? getAssetLabel(selectedSlideInputFile) : 'File Slide tu SMF-03'}
                        meta="Tài liệu đầu vào tu buoc thiet ke slides"
                        url={selectedSlideInputFile}
                        emptyLabel="Chưa có file slide từ SMF-03"
                      />
                      <ReferenceDownloadBar
                        title={selectedSlideProductLink ? getAssetLabel(selectedSlideProductLink) : 'Link sản phẩm từ SMF-03'}
                        meta="Link Drive sản phẩm do SMF-03 dán thủ công"
                        url={selectedSlideProductLink}
                        emptyLabel="Chưa có link sản phẩm từ SMF-03"
                      />
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 2</div>
                          <h4>Hành động</h4>
                          <p>Xác nhận công việc, tải feedback Word, trả lại hoặc gửi duyệt.</p>
                        </div>
                        <button className="storyboard-ui-btn storyboard-confirm-btn" onClick={() => mutation.mutate({ action: 'claim' })}>
                          Xác nhận công việc
                        </button>
                      </div>

                      <FileActions
                        label="Upload Feedback"
                        assetValue={selectedFeedbackFile}
                    onUpload={(file) => void runAssetUpload('qc-main', 'Đang tải feedback lên server', { action: 'upload_main', file })}
                        onDelete={() => mutation.mutate({ action: 'delete_main' })}
                        operation={assetOperations['qc-main']}
                        accept={REVIEW_ACCEPTED_FILE_TYPES}
                      />

                      <textarea className="fta" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={'Nhận xét QC / PM review\n**Nhóm lỗi**\n- [ ] Việc cần sửa\n- [x] Việc đã sửa'} />
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 3</div>
                          <h4>Lịch sử xử lý</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        {selectedStageLogs.map((log) => (
                          <WorkflowLogItem key={log.id} log={log} />
                        ))}
                        {!selectedStageLogs.length ? <div className="muted-text">Chưa có lịch sử cho bước này.</div> : null}
                      </div>
                    </section>
                  </div>

                  <div className="storyboard-modal-footer slide-design-footer">
                    <div className="storyboard-modal-actions">
                      <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                        Huy bo
                      </button>
                      <button className="storyboard-ui-btn storyboard-ui-btn-secondary" onClick={() => mutation.mutate({ action: 'fail' })}>
                        Tra lai
                      </button>
                      <button className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete" onClick={() => mutation.mutate({ action: 'pass' })}>
                        Duyệt
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : isVoiceQcStage ? (
        <>
          <Card title="Danh sách sản phẩm QC âm thanh">
            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table storyboard-dashboard-table">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Người phụ trách</th>
                    <th>Đơn hàng</th>
                    <th>Trạng thái</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = `${row.order.id}::${row.product.id}`;
                    const status = String(row.record?.status || row.task?.status || 'todo');
                    const displayProductCode = qcProductDisplayCodeMap.get(row.product.id) || row.product.id;
                    const displayOrderCode = qcOrderDisplayCodeMap.get(row.order.id) || getDisplayOrderCode(row.order);
                    const assigneeLabel = getQcRowAssigneeLabel(row, profileNameById);
                    return (
                      <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                        <td>{displayProductCode}</td>
                        <td>{row.product.name}</td>
                        <td>{assigneeLabel}</td>
                        <td>{displayOrderCode}</td>
                        <td><Badge tone={toneForStatus(status)}>{getWorkflowStatusLabel(status)}</Badge></td>
                        <td>{formatDisplayDate(row.task?.due_date || row.order.deadline || row.record?.due_date)}</td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                            Xem chi tiet
                          </button>
                          {canArchiveStageRow(row, config.stageIndex) ? (
                            <button className="btn btn-ghost btn-small" onClick={() => void confirmArchiveRow(row)}>
                              Lưu trữ
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước QC âm thanh.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          {isDetailOpen && selected ? (
            <div className="storyboard-detail-page">
              <div className="storyboard-detail-shell slide-design-detail-shell">
                <div className="storyboard-modal-head">
                  <div>
                    <div className="storyboard-modal-eyebrow">{config.stageCode} / QC Am thanh</div>
                  </div>
                  <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Dong cua so chi tiet">
                    x
                  </button>
                </div>

                <div className="slide-design-workspace">
                  {renderNotice(notice)}

                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedReviewerLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  {config.pageId !== 'smf06' ? (
                  <section className="storyboard-modal-panel slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <h4>Tiến độ QC âm thanh</h4>
                      </div>
                    </div>
                    <div className="storyboard-admin-checkpoints">
                      {['Chưa có đầu vào', 'Đã xác nhận', 'Đang thực hiện', 'Quá hạn', 'Chờ duyệt', 'Hoàn thành'].map((label) => {
                        const tone =
                          label === 'Chưa có đầu vào' ? 'warning' :
                          label === 'Quá hạn' ? 'danger' :
                          label === 'Hoàn thành' ? 'success' :
                          label === 'Chờ duyệt' ? 'neutral' :
                          'violet';
                        return (
                          <div key={label} className={`storyboard-admin-checkpoint ${videoQcCheckpoint === label ? 'is-active' : ''} tone-${tone}`}>
                            <span>{label}</span>
                          </div>
                        );
                      })}
                    </div>
                    {selectedVoiceInputItems.length ? (
                      <div className="stack compact">
                        {selectedVoiceInputItems.map((item) => (
                          <div className="storyboard-uploaded-file" key={item.url}>
                            <div className="storyboard-input-file">
                              <div className="storyboard-input-file-icon" aria-hidden="true">DOC</div>
                              <div className="storyboard-input-file-copy">
                                <div className="muted-text">File thu am hien tai</div>
                                <a href={item.url} target="_blank" rel="noreferrer">
                                  {item.label || getAssetLabel(item.url)}
                                </a>
                              </div>
                            </div>
                            <a className="storyboard-ui-btn storyboard-ui-btn-secondary" href={item.url} target="_blank" rel="noreferrer">
                              Tai xuong
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </section>
                  ) : null}

                  <div className="storyboard-modal-stack">
                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 1</div>
                          <h4>Tài liệu đầu vào</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        <ReferenceDownloadBar
                          title={selectedLessonScriptUrl ? getAssetLabel(selectedLessonScriptUrl) : 'File Kịch bản từ SMF-01'}
                          meta={selectedLessonScriptMeta}
                          url={selectedLessonScriptUrl}
                          emptyLabel="Chưa có file kịch bản từ SMF-01"
                        />
                        {selectedVoiceInputItems.length ? selectedVoiceInputItems.map((item) => (
                          <ReferenceDownloadBar
                            key={item.url}
                            title={item.label || getAssetLabel(item.url)}
                            meta="File Voice tu SMF-05"
                            url={item.url}
                            emptyLabel="Chưa có file voice từ SMF-05"
                          />
                        )) : (
                          <ReferenceDownloadBar
                            title="File Voice tu SMF-05"
                            meta="Chưa có file voice được upload"
                            url={null}
                            emptyLabel="Chưa có file voice từ SMF-05"
                          />
                        )}
                      </div>
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 2</div>
                          <h4>Hành động</h4>
                          <p>Xác nhận công việc, nhập feedback plain text để trả lại hoặc duyệt.</p>
                        </div>
                        <button className="storyboard-ui-btn storyboard-confirm-btn" onClick={() => mutation.mutate({ action: 'claim' })}>
                          Xác nhận công việc
                        </button>
                      </div>

                      <textarea
                        className="fta"
                        rows={6}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={'Nhập feedback, mỗi ý một dòng. Ví dụ:\n**Âm lượng**\n- [ ] Cắt noise đoạn 00:12\n- [x] Đã sửa nhịp đọc câu mở đầu'}
                      />
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 3</div>
                          <h4>Lịch sử xử lý</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        {selectedStageLogs.map((log) => (
                          <WorkflowLogItem key={log.id} log={log} />
                        ))}
                        {!selectedStageLogs.length ? <div className="muted-text">Chưa có lịch sử cho bước này.</div> : null}
                      </div>
                    </section>
                  </div>

                  <div className="storyboard-modal-footer slide-design-footer">
                    <div className="storyboard-modal-actions">
                      <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                        Huy bo
                      </button>
                      <button className="storyboard-ui-btn storyboard-ui-btn-secondary" onClick={() => mutation.mutate({ action: 'fail' })}>
                        Tra lai
                      </button>
                      <button className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete" onClick={() => mutation.mutate({ action: 'pass' })}>
                        Duyệt
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : isLayeredVideoQcStage ? (
        <>
          <Card title="Danh sách sản phẩm QC video">
            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table storyboard-dashboard-table">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Người phụ trách</th>
                    <th>Đơn hàng</th>
                    <th>Trạng thái</th>
                    <th>Deadline</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = `${row.order.id}::${row.product.id}`;
                    const status = String(row.record?.status || row.task?.status || 'todo');
                    const displayProductCode = qcProductDisplayCodeMap.get(row.product.id) || row.product.id;
                    const displayOrderCode = qcOrderDisplayCodeMap.get(row.order.id) || getDisplayOrderCode(row.order);
                    const assigneeLabel = getQcRowAssigneeLabel(row, profileNameById);
                    return (
                      <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                        <td>{displayProductCode}</td>
                        <td>{row.product.name}</td>
                        <td>{assigneeLabel}</td>
                        <td>{displayOrderCode}</td>
                        <td><Badge tone={toneForStatus(status)}>{getWorkflowStatusLabel(status)}</Badge></td>
                        <td>{formatDisplayDate(row.task?.due_date || row.order.deadline || row.record?.due_date)}</td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                            Xem chi tiet
                          </button>
                          {canArchiveStageRow(row, config.stageIndex) ? (
                            <button className="btn btn-ghost btn-small" onClick={() => void confirmArchiveRow(row)}>
                              Lưu trữ
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước QC video.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>

          {isDetailOpen && selected ? (
            <div className="storyboard-detail-page">
              <div className="storyboard-detail-shell slide-design-detail-shell">
                <div className="storyboard-modal-head">
                  <div>
                    <div className="storyboard-modal-eyebrow">{config.stageCode} / QC Video</div>
                  </div>
                  <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Dong cua so chi tiet">
                    x
                  </button>
                </div>

                <div className="slide-design-workspace">
                  {renderNotice(notice)}

                  <GeneralInfoSummary
                    name={selected.product.name}
                    orderCode={selectedDisplayOrderCode}
                    orderId={selected.order.id}
                    productCode={selectedDisplayProductCode}
                    assigneeLabel={selectedReviewerLabel}
                    startDate={formatDisplayDateTime(selectedStartedAt)}
                    deadline={formatDisplayDate(selectedDeadline)}
                    note={selectedGeneralNote}
                  />

                  <div className="storyboard-modal-stack">
                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 1</div>
                          <h4>Tài liệu đầu vào</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        <ReferenceDownloadBar
                          title={selectedLessonScriptUrl ? getAssetLabel(selectedLessonScriptUrl) : `File Kịch bản từ ${layeredQcScriptStageCode}`}
                          meta={selectedLessonScriptMeta}
                          url={selectedLessonScriptUrl}
                          emptyLabel={`Chưa có file kịch bản từ ${layeredQcScriptStageCode}`}
                        />
                        <ReferenceDownloadBar
                          title={`Link video tu ${layeredQcEditStageCode}`}
                          meta={selectedVideoInputUrl || selectedVideoInputMeta}
                          url={selectedVideoInputUrl || null}
                          emptyLabel={`Chưa có link video từ ${layeredQcEditStageCode}`}
                        />
                      </div>
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 2</div>
                          <h4>Hành động</h4>
                          <p>{`Xác nhận công việc, nhập feedback plain text để trả lại ${layeredQcEditStageCode} hoặc duyệt.`}</p>
                        </div>
                        <button className="storyboard-ui-btn storyboard-confirm-btn" onClick={() => mutation.mutate({ action: 'claim' })}>
                          Xác nhận công việc
                        </button>
                      </div>

                      <FileActions
                    label="Tải file review"
                        assetValue={selectedVideoQcFeedbackFile}
                    onUpload={(file) => void runQcAssetUpload('qc-main', 'Đang tải file review lên server', { action: 'upload_main', file })}
                        onDelete={() => mutation.mutate({ action: 'delete_main' })}
                        operation={assetOperations['qc-main']}
                        accept={REVIEW_ACCEPTED_FILE_TYPES}
                      />

                      <FileActions
                    label="Tải subtitle review"
                        assetValue={selectedVideoQcSubtitleFile}
                    onUpload={(file) => void runQcAssetUpload('qc-subtitle', 'Đang tải file review lên server', { action: 'upload_subtitle', file })}
                        onDelete={() => mutation.mutate({ action: 'delete_subtitle' })}
                        operation={assetOperations['qc-subtitle']}
                        accept={SUBTITLE_ACCEPTED_FILE_TYPES}
                      />

                      <textarea
                        className="fta"
                        rows={6}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={`Nhập feedback để trả lại ${layeredQcEditStageCode} nếu cần...\n**Nhóm lỗi**\n- [ ] Việc cần sửa\n- [x] Việc đã sửa`}
                      />
                    </section>

                    <section className="storyboard-modal-panel slide-design-section">
                      <div className="slide-design-section-head">
                        <div>
                          <div className="slide-design-section-eyebrow">PHẦN 3</div>
                          <h4>Lịch sử xử lý</h4>
                        </div>
                      </div>
                      <div className="stack compact">
                        {selectedStageLogs.map((log) => (
                          <WorkflowLogItem key={log.id} log={log} />
                        ))}
                        {!selectedStageLogs.length ? <div className="muted-text">Chưa có lịch sử cho bước này.</div> : null}
                      </div>
                    </section>
                  </div>

                  <div className="storyboard-modal-footer slide-design-footer">
                    <div className="storyboard-modal-actions">
                      <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                        Huy bo
                      </button>
                      <button className="storyboard-ui-btn storyboard-ui-btn-secondary" onClick={() => mutation.mutate({ action: 'fail' })}>
                        Tra lai
                      </button>
                      <button className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete" onClick={() => mutation.mutate({ action: 'pass' })}>
                        Duyệt
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="storyboard-layout">
          <Card title="Queue QC">
            <StageQueue rows={rows} selectedKey={selectedKey} setSelectedKey={setSelectedKey} getMeta={(row) => row.record?.file_name || row.record?.title || 'Chưa có file review'} colorizeFrame={false} />
          </Card>
          <Card title={'Bang review'}>
            {selected ? (
              <div className="storyboard-workspace">
                {renderNotice(notice)}
                <div className="stack compact">
                  {config.pageId === 'vsmf08' ? (
                    <>
                      <label className="full">
                        <span>Link video review</span>
                        <input className="fi" value={reviewLink} onChange={(e) => setReviewLink(e.target.value)} placeholder="https://..." />
                      </label>
                      <div className="action-row">
                        <button className="btn btn-ghost" onClick={() => mutation.mutate({ action: 'save_link', link: reviewLink })}>Lưu link</button>
                        <button className="btn btn-ghost" onClick={() => { setReviewLink(''); mutation.mutate({ action: 'save_link', link: '' }); }}>Xóa link</button>
                      </div>
                    </>
                  ) : (
                    <FileActions
                    label={'Tải file review'}
                      assetValue={selected.record?.file_name}
                    onUpload={(file) => void runAssetUpload('qc-main', 'Đang tải file review lên server', { action: 'upload_main', file })}
                      onDelete={() => mutation.mutate({ action: 'delete_main' })}
                      operation={assetOperations['qc-main']}
                      accept={REVIEW_ACCEPTED_FILE_TYPES}
                    />
                  )}
                  {config.recordKind === 'video_edit' ? (
                    <FileActions
                    label={'Tải file lên'}
                      assetValue={selected.record?.subtitle_file}
                    onUpload={(file) => void runAssetUpload('qc-subtitle', 'Đang tải file review lên server', { action: 'upload_subtitle', file })}
                      onDelete={() => mutation.mutate({ action: 'delete_subtitle' })}
                      operation={assetOperations['qc-subtitle']}
                      accept={SUBTITLE_ACCEPTED_FILE_TYPES}
                    />
                  ) : null}
                </div>
                <label>
                  <span>Nguoi review</span>
                  <select className="fi" value={selectedReviewerProfileId} onChange={(e) => setSelectedReviewerProfileId(e.target.value)}>
                    <option value="">-- Chon --</option>
                    {assigneeProfiles.map((option) => <option key={option.profileId} value={option.profileId}>{option.fullName}</option>)}
                  </select>
                </label>
                <div className="stack compact">
                  {criteriaConfig.map((item) => (
                    <label className={`review-criterion ${criteria[item.key] ? 'pass' : ''}`} key={item.key}>
                      <input type="checkbox" checked={Boolean(criteria[item.key])} onChange={(e) => setCriteria((c) => ({ ...c, [item.key]: e.target.checked }))} />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <textarea className="fta" rows={5} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={'Nhận xét QC / PM review\n**Nhóm lỗi**\n- [ ] Việc cần sửa\n- [x] Việc đã sửa'} />
                <div className="action-row">
                  <button className="storyboard-ui-btn storyboard-confirm-btn" onClick={() => mutation.mutate({ action: 'claim' })}>Xác nhận công việc</button>
                  <button className="btn btn-ghost" onClick={() => mutation.mutate({ action: 'fail' })}>Tra lai</button>
                  <button className="btn btn-danger" onClick={() => mutation.mutate({ action: 'pass' })}>{config.pageId === 'vsmf08' ? 'Duyệt -> Sẵn sàng bàn giao' : 'Duyệt'}</button>
                </div>
              </div>
            ) : <div className="muted-text">{'Chon item de review.'}</div>}
          </Card>
          <Card title="Lịch sử review">
            <div className="stack compact">
              {renderNotice(notice)}
              {selectedReviews.map((review: SlideDesignReviewRow | VoiceReviewRow | VideoReviewRow) => (
                <div className="storyboard-review-item" key={review.id}>
                  <div className="action-row">
                    <Badge tone={review.decision === 'approved' ? 'success' : review.decision === 'changes_requested' ? 'danger' : 'warning'}>{getReviewDecisionLabel(review.decision)}</Badge>
                    <button className="btn btn-ghost btn-small" onClick={() => mutation.mutate({ action: 'delete_review', reviewId: review.id })}>{'Xóa'}</button>
                  </div>
                  <div className="muted-text">{new Date(review.created_at).toLocaleString('vi-VN')}</div>
                  <RichFeedbackText text={localizeWorkflowText(review.comment || 'Không có ghi chú.')} />
                </div>
              ))}
              {!selectedReviews.length ? <div className="muted-text">{'Chưa có lịch sử review.'}</div> : null}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export function ScormStagePage() {
  const { profile, loading } = useAuth();
  const { role: shellRole } = useAppShell();
  const { pushToast } = useToast();
  const viewerRole = normalizeAppRole(profile?.role || shellRole);
  const isAdminRole = canSeeAllStageAssignments(viewerRole);
  const isInternalRole = Boolean(viewerRole && !['client', 'client_director'].includes(viewerRole));
  const queryClient = useQueryClient();
  const shouldUseServerPreview = !loading && shouldUseMyTasksPreview(viewerRole);
  const previewOptions = useMemo(() => ({ stageIndices: [8], includeActivityLogs: true }), []);
  const previewQuery = useQuery({
    queryKey: getMyTasksPreviewQueryKey(viewerRole, profile?.email || '', previewOptions),
    queryFn: () => fetchMyTasksPreview(viewerRole, profile?.email || null, previewOptions),
    enabled: shouldUseServerPreview,
    staleTime: 1000 * 60,
  });
  const useFallbackQueries = !shouldUseServerPreview || previewQuery.isError;
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts, enabled: useFallbackQueries });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'stage', 'scorm'], queryFn: () => listTasks({ stageIndices: [8] }), enabled: useFallbackQueries });
  const inputItemsQuery = useQuery({ queryKey: ['input-items', 'ELN'], queryFn: () => listInputItems({ module: 'ELN' }), enabled: useFallbackQueries });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'scorm-assignees'], queryFn: listProfiles, enabled: useFallbackQueries });
  const activityLogsQuery = useQuery({
    queryKey: ['activity-logs', 'scorm-task-starts'],
    queryFn: () =>
      listActivityLogs({
        actionTypes: ['task_started', 'workflow_step_started', 'workflow_review_claimed', 'workflow_step_submitted', 'workflow_step_returned', 'workflow_step_approved'],
        limit: 1000,
      }),
    enabled: useFallbackQueries,
  });
  const workflowQuery = useQuery({
    queryKey: ['workflow-records', 'scorm_package', 'with-reviews', 'questions'],
    queryFn: () => listWorkflowRecords({ kinds: ['scorm_package', 'video_edit'], includeReviews: true, includeQuestionLibrary: true }),
    enabled: useFallbackQueries,
  });
  const usePreviewData = shouldUseServerPreview && Boolean(previewQuery.data);
  const ordersData = usePreviewData ? { orders: previewQuery.data!.orders, products: previewQuery.data!.products } : ordersQuery.data;
  const tasksData = usePreviewData ? (previewQuery.data?.tasks || []) : (tasksQuery.data || []);
  const profilesData = usePreviewData ? (previewQuery.data?.profiles || []) : (profilesQuery.data || []);
  const activityLogs = usePreviewData ? (previewQuery.data?.activityLogs || []) : (activityLogsQuery.data || []);
  const workflowData = usePreviewData
    ? {
        scormPackages: previewQuery.data?.scormPackages || [],
        scormReviews: previewQuery.data?.scormReviews || [],
        videoEdits: previewQuery.data?.videoEdits || [],
      }
    : workflowQuery.data;
  const inputItemsData = usePreviewData ? (previewQuery.data?.inputItems || []) : (inputItemsQuery.data || []);
  const stageWorkKeys = useMemo(
    () =>
      new Set(
        (previewQuery.data?.workItems || [])
          .filter((item) => item.stage_index === 8)
          .map((item) => `${item.order_id}::${item.product_id}`),
      ),
    [previewQuery.data?.workItems],
  );
  const scormRecordKeys = useMemo(
    () =>
      new Set(
        (workflowData?.scormPackages || [])
          .filter((record) => isRuntimeWorkflowStatus(record.status))
          .map((record) => `${record.order_id}::${record.product_id}`),
      ),
    [workflowData?.scormPackages],
  );
  const scormForceIncludeKeys = useMemo(
    () => new Set([...stageWorkKeys, ...scormRecordKeys]),
    [scormRecordKeys, stageWorkKeys],
  );

  const scormRows = useMemo(
    () =>
      getRowsForStage(
        ordersData?.orders || [],
        ordersData?.products || [],
        tasksData,
        workflowData?.scormPackages || [],
        'ELN',
        [8],
        scormForceIncludeKeys,
      ),
    [ordersData, scormForceIncludeKeys, tasksData, workflowData],
  ).filter((row) => {
    const key = `${row.order.id}::${row.product.id}`;
    if (usePreviewData) return stageWorkKeys.has(key) || scormRecordKeys.has(key);
    if (!isAdminRole) return isTaskExplicitlyAssignedToCurrentProfile(row.task, profile, profilesData);
    return true;
  });
  const scormOrderDisplayCodeMap = useMemo(
    () => new Map((ordersData?.orders || []).map((order) => [order.id, getDisplayOrderCode(order)])),
    [ordersData?.orders],
  );
  const scormProductDisplayCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    const orders = ordersData?.orders || [];
    const products = ordersData?.products || [];
    for (const order of orders) {
      const displayOrderCode = scormOrderDisplayCodeMap.get(order.id) || order.id;
      const orderProducts = products.filter((product) => product.order_id === order.id);
      const displayMap = buildDisplayProductCodeMap(displayOrderCode, orderProducts);
      for (const [productId, displayCode] of displayMap) {
        map.set(productId, displayCode);
      }
    }
    return map;
  }, [ordersData?.orders, ordersData?.products, scormOrderDisplayCodeMap]);
  const profileNameById = useMemo<Map<string, string>>(
    () => new Map((profilesData as ProfileRow[]).map((item) => [item.id, item.full_name || item.email || item.id])),
    [profilesData],
  );
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState<Record<string, any>>({});
  const [notice, setNotice] = useState<NoticeState>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [scormUploadOperation, setScormUploadOperation] = useState<UploadOperationState | null>(null);

  useEffect(() => {
    if (!selectedKey && scormRows[0]) setSelectedKey(`${scormRows[0].order.id}::${scormRows[0].product.id}`);
  }, [scormRows, selectedKey]);

  const selected = useMemo(() => scormRows.find((row) => `${row.order.id}::${row.product.id}` === selectedKey) || null, [scormRows, selectedKey]);
  const selectedDisplayOrderCode = selected ? scormOrderDisplayCodeMap.get(selected.order.id) || getDisplayOrderCode(selected.order) : '';
  const selectedDisplayProductCode = selected ? scormProductDisplayCodeMap.get(selected.product.id) || selected.product.id : '';
  const selectedGeneralNote = String(selected?.record?.notes || selected?.order.intake_note || '').trim();
  const selectedAssigneeLabel = selected?.task?.assignee || profile?.fullName || 'Chưa phân công';
  const startedAtByTask = useMemo(() => {
    const map = new Map<string, string>();
    for (const log of activityLogs) {
      const taskId = typeof log.metadata?.task_id === 'string' ? log.metadata.task_id : null;
      if (!taskId) continue;
      const current = map.get(taskId);
      if (!current || new Date(log.happened_at).getTime() < new Date(current).getTime()) {
        map.set(taskId, log.happened_at);
      }
    }
    return map;
  }, [activityLogs]);
  const selectedStartedAt = selected?.task?.id
    ? startedAtByTask.get(selected.task.id) || selected?.task?.created_at || selected?.record?.updated_at || ''
    : selected?.record?.updated_at || '';
  const selectedDeadline = selected?.task?.due_date || selected?.order.deadline || selected?.record?.due_date || null;
  const selectedStageLogs = useMemo(
    () =>
      activityLogs.filter(
        (log) =>
          log.metadata?.order_id === selected?.order.id &&
          log.metadata?.product_id === selected?.product.id &&
          log.metadata?.stage_code === 'SMF-09',
      ),
    [activityLogs, selected?.order.id, selected?.product.id],
  );
  const selectedReviews = useMemo(
    () => ((workflowData?.scormReviews || []) as ScormReviewRow[]).filter((item) => item.scorm_package_id === selected?.record?.id),
    [workflowData, selected?.record?.id],
  );
  const selectedVideoRecord = useMemo(
    () => (selected ? findWorkflowRecordByProduct(workflowData?.videoEdits, selected.order.id, selected.product.id) : null),
    [selected, workflowData?.videoEdits],
  );
  const selectedLessonScript = useMemo(
    () =>
      (inputItemsData as InputItemRow[]).find(
        (item) => selected && item.order_id === selected.order.id && item.product_id === selected.product.id && item.module === 'ELN' && item.item_code === 'lesson_script',
      ) || null,
    [inputItemsData, selected],
  );
  const selectedScormQuiz = useMemo(
    () =>
      (inputItemsData as InputItemRow[]).find(
        (item) => selected && item.order_id === selected.order.id && item.product_id === selected.product.id && item.module === 'ELN' && item.item_code === 'scorm_quiz',
      ) || null,
    [inputItemsData, selected],
  );

  useEffect(() => {
    if (!selected?.record) {
      setDraft({});
      return;
    }
    setDraft({
      pass_score: selected.record.pass_score || 80,
      completion_rule: selected.record.completion_rule || 'watch_video_and_pass_quiz',
      randomize_questions: Boolean(selected.record.randomize_questions),
      package_file_name: selected.record.package_file_name || '',
      notes: selected.record.notes || '',
      selected_question_ids: selected.record.selected_question_ids || [],
    });
  }, [selected?.record]);

  function openDetail(key: string) {
    setSelectedKey(key);
    setIsDetailOpen(true);
  }

  function closeDetail() {
    setIsDetailOpen(false);
  }

  async function archiveRow(row: { order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }) {
    const key = `${row.order.id}::${row.product.id}`;
    await archiveTasksForStage(row.order.id, row.product.id, 8);
    if (selectedKey === key) {
      setIsDetailOpen(false);
      setSelectedKey('');
    }
    setNotice({ tone: 'success', message: 'Đã lưu trữ khỏi màn hiện tại.' });
    pushToast({ title: 'Đã lưu trữ', message: `${row.product.id} đã được ẩn khỏi SMF-09.`, tone: 'success' });
    await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
    await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
    await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
  }

  async function confirmArchiveRow(row: { order: OrderRow; product: ProductRow; task: TaskRow | null; record: any | null }) {
    if (!confirmArchiveStageAction(row.product.id, 'SMF-09')) return;
    await archiveRow(row);
  }

  async function handleScormZipUpload(file: File) {
    if (!selected) {
      setNotice({ tone: 'danger', message: 'Chưa chọn package.' });
      return;
    }
    try {
      validateWorkflowFile(file);
      if (!/\.zip$/i.test(file.name) && file.type !== 'application/zip' && file.type !== 'application/x-zip-compressed') {
        throw new Error('Chỉ chấp nhận file ZIP.');
      }
      setScormUploadOperation({ label: 'Đang tải file ZIP lên server', progress: 30, tone: 'violet' });
      const scorm = await ensureWorkflowRecord({
        kind: 'scorm_package',
        orderId: selected.order.id,
        productId: selected.product.id,
        title: `${selected.product.id}: ${selected.product.name}`,
        profileId: profile?.id || null,
      });
      setScormUploadOperation({ label: 'Đang lưu file ZIP', progress: 70, tone: 'violet' });
      const uploaded = await uploadWorkflowAsset({
        file,
        orderId: selected.order.id,
        productId: selected.product.id,
        module: 'ELN',
        stageCode: 'SMF-09',
        slot: 'scorm_package',
        previousUrl: selected.record?.package_file_name || null,
      });
      await updateWorkflowRecord('scorm_package', scorm.id, {
        package_file_name: uploaded.fileUrl,
        updated_at: new Date().toISOString(),
      });
      setDraft((current) => ({ ...current, package_file_name: uploaded.fileUrl }));
      setScormUploadOperation({ label: 'Đã tải file ZIP lên server', progress: 100, tone: 'success' });
      setNotice({ tone: 'success', message: 'Đã tải file ZIP lên server.' });
      await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
      await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
    } catch (error) {
      setScormUploadOperation({ label: formatErrorMessage(error), progress: 100, tone: 'danger' });
      setNotice({ tone: 'danger', message: formatErrorMessage(error) });
    } finally {
      window.setTimeout(() => setScormUploadOperation(null), 1400);
    }
  }

  const mutation = useMutation({
    mutationFn: async (input: { action: 'create' | 'save' | 'start' | 'finalize' | 'archive' | 'delete_review'; reviewId?: string }) => {
      if (!selected) throw new Error('Chưa chọn package.');
      const existingTasks = tasksData;
      const task =
        selected.task ||
        (await ensureTaskForStage({ orderId: selected.order.id, productId: selected.product.id, stageIndex: 8, existingTasks, assignee: profile?.fullName || null }));
      const scorm = await ensureWorkflowRecord({ kind: 'scorm_package', orderId: selected.order.id, productId: selected.product.id, title: `${selected.product.id}: ${selected.product.name}`, profileId: profile?.id || null });
      if (input.action === 'create') return;
      if (input.action === 'archive') {
        await archiveTasksForStage(selected.order.id, selected.product.id, 8);
        return { archived: true };
      }
      if (input.action === 'delete_review' && input.reviewId) {
        await deleteScormReview(input.reviewId);
        return;
      }
      if (input.action === 'save') {
        await updateWorkflowRecord('scorm_package', scorm.id, { ...draft, updated_at: new Date().toISOString() });
        return;
      }
      if (input.action === 'start') {
        const shouldLogStart = task.status !== 'in_progress';
        await updateWorkflowRecord('scorm_package', scorm.id, { status: 'building_quiz', updated_at: new Date().toISOString() });
        await updateTask(task.id, { status: 'in_progress', progress: Math.max(task.progress, 25), assignee: profile?.fullName || task.assignee });
        await updateProduct(selected.product.id, { current_stage_index: 8, progress: Math.max(selected.product.progress || 0, 30) });
        if (shouldLogStart) {
          await createActivityLog({
            actorProfileId: profile?.id || null,
            actionType: 'workflow_step_started',
            objectType: 'task',
            objectId: task.id,
            summary: `${selected.product.id} started SMF-09`,
            metadata: {
              task_id: task.id,
              order_id: selected.order.id,
              product_id: selected.product.id,
              stage_code: 'SMF-09',
              stage_index: 8,
              module: 'ELN',
            },
          });
        }
        return;
      }
      if (!String(draft.package_file_name || '').trim()) throw new Error('Cần tải file ZIP package trước khi hoàn thành SCORM.');
      await updateTask(task.id, { status: 'done', progress: 100, assignee: profile?.fullName || task.assignee });
      await updateWorkflowRecord('scorm_package', scorm.id, { ...draft, status: 'ready_delivery', manifest_status: 'validated', updated_at: new Date().toISOString() });
      await createScormReview({ scormPackageId: scorm.id, reviewerProfileId: profile?.id || null, decision: 'approved', comment: 'Đã hoàn thành SMF-09, package SCORM sẵn sàng bàn giao.', criteria: { manifest: true, selected_questions: (draft.selected_question_ids || []).length, completion_rule: draft.completion_rule } });
      await updateProduct(selected.product.id, { current_stage_index: 9, progress: 100, ready_for_delivery: true, finished: true });
      await updateOrder(selected.order.id, { status: 'ready_delivery' });
    },
    onSuccess: async (result, input) => {
      const message =
        input.action === 'save' ? 'Đã lưu cấu hình SCORM.' :
        input.action === 'start' ? 'Đã xác nhận công việc SMF-09.' :
        input.action === 'finalize' ? 'Đã hoàn thành SMF-09.' :
        input.action === 'archive' ? 'Đã lưu trữ khỏi màn hiện tại.' :
        input.action === 'delete_review' ? 'Đã xóa review SCORM.' :
        'Đã tạo hồ sơ SCORM.';
      setNotice({ tone: 'success', message });
      if (result?.archived) {
        setIsDetailOpen(false);
        setSelectedKey('');
      }
      await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
    },
    onError: (error) => {
      setNotice({ tone: 'danger', message: formatErrorMessage(error) });
    },
  });

  function confirmSelectedArchive() {
    if (!selected) return;
    if (!confirmArchiveStageAction(selected.product.id, 'SMF-09')) return;
    mutation.mutate({ action: 'archive' });
  }

  return (
    <div className={`workflow-stage-page${isDetailOpen ? ' is-detail-open' : ''}`}>
      <SectionHeader eye={'Module 2 · SMF-09'} title="SCORM + Quiz" subtitle={'Chọn câu hỏi, chốt quiz, đóng gói SCORM và sẵn sàng bàn giao.'} />
      <Card title="Danh sách package SCORM">
        <div className="intake-dashboard-table-wrap">
          <table className="data-table intake-dashboard-table storyboard-dashboard-table">
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>Người phụ trách</th>
                <th>Đơn hàng</th>
                <th>Số câu hỏi</th>
                <th>Trạng thái</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {scormRows.map((row) => {
                const key = `${row.order.id}::${row.product.id}`;
                const status = String(row.record?.status || row.task?.status || 'todo');
                const displayProductCode = scormProductDisplayCodeMap.get(row.product.id) || row.product.id;
                const displayOrderCode = scormOrderDisplayCodeMap.get(row.order.id) || getDisplayOrderCode(row.order);
                const assigneeLabel = getScormRowAssigneeLabel(row, profileNameById);
                return (
                  <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                    <td>{displayProductCode}</td>
                    <td>{row.product.name}</td>
                    <td>{assigneeLabel}</td>
                    <td>{displayOrderCode}</td>
                    <td>{(row.record?.selected_question_ids || []).length}</td>
                    <td><Badge tone={toneForStatus(status)}>{getWorkflowStatusLabel(status)}</Badge></td>
                    <td>
                      <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                        Xem chi tiết
                      </button>
                      {canArchiveStageRow(row, 8) ? (
                        <button className="btn btn-ghost btn-small" onClick={() => void confirmArchiveRow(row)}>
                          Lưu trữ
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!scormRows.length ? (
                <tr>
                  <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước đóng gói SCORM.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {isDetailOpen && selected ? (
        <div className="storyboard-detail-page">
          <div className="storyboard-detail-shell slide-design-detail-shell">
            <div className="storyboard-modal-head">
              <div>
                <div className="storyboard-modal-eyebrow">SMF-09 / SCORM + Quiz</div>
              </div>
              <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Đóng cửa sổ chi tiết">
                x
              </button>
            </div>

            <div className="slide-design-workspace">
              {renderNotice(notice)}

              <GeneralInfoSummary
                name={selected.product.name}
                orderCode={selectedDisplayOrderCode}
                orderId={selected.order.id}
                productCode={selectedDisplayProductCode}
                assigneeLabel={selectedAssigneeLabel}
                startDate={formatDisplayDateTime(selectedStartedAt)}
                deadline={formatDisplayDate(selectedDeadline)}
                note={selectedGeneralNote}
              />

              <div className="storyboard-modal-stack">
                <section className="storyboard-modal-panel slide-design-section">
                  <div className="slide-design-section-head">
                    <div>
                      <div className="slide-design-section-eyebrow">PHẦN 1</div>
                      <h4>Tài liệu đầu vào</h4>
                    </div>
                  </div>
                  <div className="stack compact">
                    <ReferenceDownloadBar
                      title={selectedVideoRecord?.file_name ? getAssetLabel(selectedVideoRecord.file_name) : 'Link video tu SMF-07'}
                      meta="Đầu vào video để đóng gói SCORM"
                      url={selectedVideoRecord?.file_name}
                      emptyLabel="Chưa có link/video đầu vào từ SMF-07"
                    />
                    <ReferenceDownloadBar
                      title={selectedLessonScript?.file_url || selectedLessonScript?.file_name ? getAssetLabel(selectedLessonScript?.file_url || selectedLessonScript?.file_name) : 'Kịch bản từ SMF-01'}
                      meta="Tài liệu nội dung tham chiếu"
                      url={selectedLessonScript?.file_url || selectedLessonScript?.file_name}
                      emptyLabel="Chưa có file kịch bản từ SMF-01"
                    />
                    <ReferenceDownloadBar
                      title={selectedScormQuiz?.file_url || selectedScormQuiz?.file_name ? getAssetLabel(selectedScormQuiz?.file_url || selectedScormQuiz?.file_name) : 'Quiz SCORM từ SMF-01'}
                      meta="File Word/Excel câu hỏi SCORM"
                      url={selectedScormQuiz?.file_url || selectedScormQuiz?.file_name}
                      emptyLabel="Chưa có file Quiz SCORM từ SMF-01"
                    />
                  </div>
                </section>

                <section className="storyboard-modal-panel slide-design-section">
                  <div className="slide-design-section-head">
                    <div>
                      <div className="slide-design-section-eyebrow">PHẦN 2</div>
                      <h4>Tải file ZIP package</h4>
                      <p>Tải file SCORM dạng .zip để lưu vào hồ sơ và hoàn thành bước SMF-09.</p>
                    </div>
                  </div>
                  <label
                    className="storyboard-upload-dropzone slide-design-upload-dropzone"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = event.dataTransfer.files?.[0];
                      if (file) void handleScormZipUpload(file);
                    }}
                  >
                    <div className="slide-design-upload-icon" aria-hidden="true">ZIP</div>
                    <div className="storyboard-upload-dropzone-title">Nhấn để tải lên hoặc kéo thả file ZIP</div>
                    <div className="storyboard-upload-dropzone-subtitle">Chỉ chấp nhận .zip, tối đa {WORKFLOW_MAX_UPLOAD_MB}MB</div>
                    <input
                      type="file"
                      accept=".zip,application/zip,application/x-zip-compressed"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        void handleScormZipUpload(file);
                        event.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <UploadProgressPanel operation={scormUploadOperation} />
                  {draft.package_file_name ? (
                    <div className="storyboard-uploaded-file">
                      <div className="storyboard-input-file">
                        <div className="storyboard-input-file-icon" aria-hidden="true">ZIP</div>
                        <div className="storyboard-input-file-copy">
                          <div className="muted-text">File ZIP đã tải lên</div>
                          {isAssetUrl(draft.package_file_name) ? (
                            <a href={draft.package_file_name} target="_blank" rel="noreferrer">
                              {getAssetLabel(draft.package_file_name)}
                            </a>
                          ) : (
                            <div className="storyboard-input-file-main">{draft.package_file_name}</div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </section>

                <section className="storyboard-modal-panel slide-design-section">
                  <div className="slide-design-section-head">
                    <div>
                      <div className="slide-design-section-eyebrow">PHẦN 4</div>
                      <h4>Lịch sử xử lý & review SCORM</h4>
                    </div>
                  </div>
                  <div className="stack compact">
                    {selectedStageLogs.map((log) => (
                      <WorkflowLogItem key={log.id} log={log} />
                    ))}
                    {selectedReviews.map((review) => (
                      <div className="storyboard-review-item" key={review.id}>
                        <div className="action-row">
                          <Badge tone={review.decision === 'approved' ? 'success' : 'warning'}>{getReviewDecisionLabel(review.decision)}</Badge>
                          <button className="btn btn-ghost btn-small" onClick={() => mutation.mutate({ action: 'delete_review', reviewId: review.id })}>{'Xóa'}</button>
                        </div>
                        <div className="muted-text">{new Date(review.created_at).toLocaleString('vi-VN')}</div>
                        <RichFeedbackText text={localizeWorkflowText(review.comment || 'Không có ghi chú.')} />
                      </div>
                    ))}
                    {!selectedStageLogs.length && !selectedReviews.length ? <div className="muted-text">Chưa có lịch sử cho bước này.</div> : null}
                  </div>
                </section>
              </div>

              <div className="storyboard-modal-footer slide-design-footer">
                <div className="storyboard-modal-actions">
                  <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                    Huy bo
                  </button>
                  <button className="storyboard-ui-btn storyboard-ui-btn-secondary" onClick={() => mutation.mutate({ action: 'create' })}>
                    Tao ho so
                  </button>
                  <button className="storyboard-ui-btn storyboard-ui-btn-secondary" onClick={() => mutation.mutate({ action: 'save' })}>
                    Lưu cập nhật
                  </button>
                  <button className="storyboard-ui-btn storyboard-confirm-btn" onClick={() => mutation.mutate({ action: 'start' })}>
                    Xác nhận công việc
                  </button>
                  {selected.task?.stage_index === 8 ? <button className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete" onClick={() => mutation.mutate({ action: 'finalize' })}>{'Hoàn thành'}</button> : null}
                  {canArchiveStageRow(selected, 8) ? (
                    <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={confirmSelectedArchive}>
                      Lưu trữ
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

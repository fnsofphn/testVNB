import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil } from 'lucide-react';
import { useToast } from '@/components/system/ToastProvider';
import { useAuth } from '@/contexts/AuthContext';
import { useAppShell } from '@/contexts/AppShellContext';
import { Badge, Card, Kpi } from '@/components/ui/Primitives';
import { canEditProductionPlan, isAdminLikeRole, normalizeAppRole } from '@/data/vcontent';
import { getStatusDisplayLabel } from '@/lib/statusLabels';
import { getProjectedProductDeadline, getProjectedProductStatus, readWorkflowStatusProjection } from '@/lib/workflowProjection';
import { getOrderWorkflowStatus, getTaskWorkflowStatus, resolveSummaryWorkflowStatus, type WorkflowStatus } from '@/lib/workflowStatus';
import { isSystemTestAssigneeProfile } from '@/lib/taskAssignee';
import {
  createActivityLog,
  createNotification,
  ensureTaskForStage,
  inferProductWorkflowModule,
  listOrdersWithProducts,
  listProfiles,
  listTasks,
  normalizeOrderCodeFragment,
  fetchWorkflowRecordsPreview,
  syncWorkflowStatusProjection,
  updateTask,
  updateOrder,
  type OrderRow,
  type ProductRow,
  type ProfileRow,
  type TaskRow,
} from '@/services/vcontent';

type PlanStatus = 'not_started' | 'in_progress' | 'overdue' | 'pending' | 'completed';
type OrderType = 'H' | 'E' | 'G' | 'M';

type ProductPlanOverride = {
  productId: string;
  status: PlanStatus;
  startDate: string;
  deadline?: string;
  displayProductCode?: string;
  assigneeProfileId: string | null;
  assigneeEmail?: string | null;
  assigneeName: string;
  currentStageCode?: string;
  updatedAt: string;
};

type CheckpointAssignment = {
  productId: string;
  stageCode: string;
  assigneeProfileId: string | null;
  assigneeEmail?: string | null;
  assigneeName: string;
  plannedStartDate?: string;
  plannedDeadline: string;
  note: string;
  checkpointStatus?: PlanStatus;
  updatedAt: string;
};

type PlanRow = {
  productId: string;
  orderId: string;
  displayOrderCode: string;
  displayProductCode: string;
  orderName: string;
  productName: string;
  moduleCode: 'ELN' | 'VIDEO' | 'GAME';
  type: OrderType;
  startDate: string;
  deadline: string;
  assigneeProfileId: string | null;
  assigneeEmail: string | null;
  assigneeName: string;
  status: PlanStatus;
  currentStageIndex: number;
  product: ProductRow;
  order: OrderRow;
};

type CheckpointStep = { code: string; label: string };
type ModalMode = 'view' | 'edit';
type CheckpointTableRow = {
  key: string;
  stageCode: string;
  step: CheckpointStep;
  startDate: string;
  assigneeProfileId: string;
  assigneeAccountId: string | null;
  assigneeEmail: string | null;
  assigneeName: string;
  status: PlanStatus;
  displayStatus: string;
  deadline: string;
  note: string;
};
type ProductionPlanningWorkflowRecords = {
  storyboards?: Array<{ order_id: string; product_id: string; status: string }>;
  slideDesigns?: Array<{ order_id: string; product_id: string; status: string }>;
  voiceOvers?: Array<{ order_id: string; product_id: string; status: string }>;
  videoEdits?: Array<{ order_id: string; product_id: string; status: string }>;
  scormPackages?: Array<{ order_id: string; product_id: string; status: string }>;
};
type CheckpointDraft = Partial<Pick<CheckpointAssignment, 'assigneeProfileId' | 'assigneeEmail' | 'assigneeName' | 'plannedStartDate' | 'plannedDeadline' | 'note'>>;

type GroupedOrder = {
  orderId: string;
  displayOrderCode: string;
  orderName: string;
  type: OrderType;
  deadline: string;
  products: PlanRow[];
};

const ELN_CHECKPOINT_STEPS: CheckpointStep[] = [
  { code: 'CP01', label: '\u0059\u00ea\u0075 \u0063\u1ea7\u0075 \u0111\u1ea7\u0075 \u0076\u00e0\u006f' },
  { code: 'CP02', label: 'Storyboard' },
  { code: 'CP03', label: 'Slide' },
  { code: 'CP04', label: 'QC slide' },
  { code: 'CP05', label: 'Thu voice' },
  { code: 'CP06', label: 'QC \u00e2m thanh' },
  { code: 'CP07', label: 'Bi\u00ean t\u1eadp video' },
  { code: 'CP08', label: 'QC video' },
  { code: 'CP09', label: 'SCORM + Quiz' },
];

const VIDEO_CHECKPOINT_STEPS: CheckpointStep[] = ELN_CHECKPOINT_STEPS.slice(0, 8);

const GAME_CHECKPOINT_STEPS: CheckpointStep[] = [
  { code: 'CP01', label: '\u0059\u00ea\u0075 \u0063\u1ea7\u0075 \u0111\u1ea7\u0075 \u0076\u00e0\u006f' },
  { code: 'CP02', label: 'Prototype' },
  { code: 'CP03', label: 'QC game' },
  { code: 'CP04', label: 'Ready delivery' },
];

const STATUS_LABEL: Record<PlanStatus, string> = {
  not_started: 'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  overdue: 'Quá hạn',
  pending: 'Pending',
  completed: 'Hoàn thành',
};

const STATUS_TONE: Record<PlanStatus, 'neutral' | 'violet' | 'purple' | 'danger' | 'warning' | 'success'> = {
  not_started: 'purple',
  in_progress: 'violet',
  overdue: 'danger',
  pending: 'warning',
  completed: 'success',
};

function normalizeText(value: string) {
  return String(value || '').normalize('NFC').trim();
}

function normalizeEmail(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const raw = String(value).trim();
  const vnDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalized = vnDate ? `${vnDate[3]}-${vnDate[2].padStart(2, '0')}-${vnDate[1].padStart(2, '0')}` : raw.slice(0, 10);
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateInput(value: string | null | undefined) {
  return String(value || '').slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('vi-VN');
}

function todayDateInput() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isPastDueDate(value: string | null | undefined) {
  const due = parseDate(value);
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

function maxDateInput(...values: Array<string | null | undefined>): string {
  return values.reduce<string>((max, value) => {
    const normalized = normalizeDateInput(value);
    const date = parseDate(normalized);
    if (!date) return max;
    const maxDate = parseDate(max);
    return !maxDate || date.getTime() > maxDate.getTime() ? normalized : max;
  }, '');
}

function readOrderMeta(order: OrderRow) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, unknown>;
  const orderMeta = (raw as { order_meta?: Record<string, unknown> }).order_meta;
  if (!orderMeta || typeof orderMeta !== 'object') return {} as Record<string, unknown>;
  return orderMeta;
}

function mapDisplayOrderCode(order: OrderRow) {
  const orderMeta = readOrderMeta(order);
  const displayCode = String(orderMeta.display_order_code || '').trim();
  return displayCode || String(order.id || '').trim();
}

function resolveOrderCreatedDate(order: OrderRow) {
  return normalizeDateInput(order.created_at || order.submitted_at || order.launched_at || '');
}

function resolvePlanStartDate(order: OrderRow, overrideStartDate?: string | null) {
  const orderCreatedDate = resolveOrderCreatedDate(order);
  const minimumStartDate = orderCreatedDate || todayDateInput();
  return maxDateInput(overrideStartDate, minimumStartDate) || minimumStartDate || normalizeDateInput(order.deadline);
}

function buildDisplayProductCodeMap(orderCode: string, products: Array<{ id: string }>) {
  const baseCode = normalizeOrderCodeFragment(orderCode).toUpperCase();
  return new Map(
    products.map((product, index) => [
      product.id,
      baseCode ? `${baseCode}_${String(index + 1).padStart(2, '0')}` : product.id,
    ]),
  );
}

function mapOrderType(order: OrderRow): OrderType {
  const match = String(order.id || '').toUpperCase().match(/_([HEGM])$/);
  if (match) return match[1] as OrderType;
  const module = String(order.module || '').toUpperCase();
  if (module === 'ELN') return 'E';
  if (module === 'VIDEO') return 'H';
  if (module === 'GAME') return 'G';
  return 'M';
}

function getCheckpointStepsByType(type: OrderType) {
  if (type === 'H' || type === 'M') return VIDEO_CHECKPOINT_STEPS;
  if (type === 'G') return GAME_CHECKPOINT_STEPS;
  return ELN_CHECKPOINT_STEPS;
}

function mapTaskStatus(task: TaskRow, fallbackDeadline?: string): PlanStatus {
  return getTaskWorkflowStatus(task, fallbackDeadline) as PlanStatus;
}

function resolveWorkflowProductStatus(input: {
  product: ProductRow;
  orderType: OrderType;
  tasks: TaskRow[];
  assignments?: Record<string, CheckpointAssignment>;
  manualPending?: boolean;
  fallbackDeadline?: string | null;
}): PlanStatus {
  const { product, orderType, tasks, assignments = {}, manualPending, fallbackDeadline } = input;
  if (product.finished || product.ready_for_delivery) return 'completed';

  const activeTasks = tasks.filter((task) => !task.archived);
  const stageCount = getCheckpointStepsByType(orderType).length;
  const effectiveCurrentStageIndex = getEffectiveCheckpointStageIndex(product, activeTasks);
  const stageTasks = activeTasks.filter((task) => Number(task.stage_index) >= 0 && Number(task.stage_index) < stageCount);

  const statuses: PlanStatus[] = [];
  for (let index = 0; index < stageCount; index += 1) {
    const task = pickStageTask(stageTasks, index);
    const stageCode = stageCodeFromCheckpoint(orderType, index);
    const checkpointCode = getCheckpointStepsByType(orderType)[index]?.code || `CP${String(index + 1).padStart(2, '0')}`;
    const saved = assignments[assignmentKey(product.id, checkpointCode)] || assignments[assignmentKey(product.id, stageCode)];
    const deadline = saved?.plannedDeadline || task?.due_date || fallbackDeadline || '';
    const runtime = resolveCheckpointRuntimeStatus({
      stageTask: task,
      deadline: String(deadline),
      selectedRowStatus: 'in_progress',
      currentStageIndex: effectiveCurrentStageIndex,
      stepIndex: index,
      fallbackDeadline: String(fallbackDeadline || ''),
    });
    const savedStatus = saved?.checkpointStatus ? normalizePlanningSummaryStatus(saved.checkpointStatus) : null;
    if (savedStatus === 'completed') {
      statuses.push('completed');
    } else if (savedStatus === 'pending' && runtime !== 'completed') {
      statuses.push('pending');
    } else if (savedStatus === 'in_progress') {
      statuses.push('in_progress');
    } else {
      statuses.push(runtime);
    }
  }

  const aggregateStatus = getOrderWorkflowStatus(statuses as WorkflowStatus[]) as PlanStatus;
  if (manualPending && aggregateStatus !== 'completed') return 'pending';
  return aggregateStatus;
}

function resolveCheckpointRuntimeStatus(input: {
  stageTask: TaskRow | null;
  deadline: string;
  selectedRowStatus: PlanStatus;
  currentStageIndex: number;
  stepIndex: number;
  fallbackDeadline: string;
}) {
  const { stageTask, deadline, selectedRowStatus, currentStageIndex, stepIndex, fallbackDeadline } = input;
  let status: PlanStatus;
  if (selectedRowStatus === 'completed') {
    status = 'completed';
  } else if (stepIndex < currentStageIndex) {
    status = 'completed';
  } else if (stageTask) {
    status = getTaskWorkflowStatus(
      {
        ...stageTask,
        due_date: deadline || fallbackDeadline || stageTask.due_date,
      },
      deadline || fallbackDeadline,
    ) as PlanStatus;
  } else {
    status = 'not_started';
  }
  if (status !== 'completed') {
    const due = parseDate(deadline || fallbackDeadline);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due && due.getTime() < today.getTime()) {
      status = 'overdue';
    }
  }
  return status;
}

function getTaskStatusPriority(status: string | null | undefined) {
  const raw = String(status || '').toLowerCase();
  if (['done', 'approved', 'completed'].includes(raw)) return 6;
  if (['review', 'in_review', 'submitted', 'changes_requested', 'pending'].includes(raw)) return 5;
  if (['in_progress', 'draft', 'started', 'claimed', 'recording', 'editing', 'packaging'].includes(raw)) return 4;
  if (raw === 'todo' || raw === 'not_started') return 1;
  return 2;
}

function pickStageTask(tasks: TaskRow[], stageIndex: number) {
  const candidates = tasks.filter((task) => Number(task.stage_index) === stageIndex && !task.archived);
  return (
    candidates
      .slice()
      .sort((left, right) => {
        const priorityDiff = getTaskStatusPriority(right.status) - getTaskStatusPriority(left.status);
        if (priorityDiff) return priorityDiff;
        return String(right.due_date || '').localeCompare(String(left.due_date || ''));
      })[0] || null
  );
}

function getEffectiveCheckpointStageIndex(product: ProductRow, tasks: TaskRow[]) {
  const activeStageIndex = tasks.reduce((max, task) => {
    if (getTaskStatusPriority(task.status) < 4) return max;
    const index = Number(task.stage_index);
    if (!Number.isFinite(index) || index < 0) return max;
    return Math.max(max, index);
  }, Number(product.current_stage_index || 0));
  return Math.max(0, activeStageIndex);
}

function getCheckpointStatusTone(status: string) {
  const raw = String(status || '').toLowerCase();
  if (['changes_requested', 'qc_fail', 'fail', 'rejected', 'overdue'].includes(raw)) return 'danger' as const;
  if (['todo', 'not_started'].includes(raw)) return 'purple' as const;
  if (['submitted', 'review', 'in_review', 'submitted_qc', 'submitted_video', 'claimed', 'draft', 'pending'].includes(raw)) {
    return 'warning' as const;
  }
  if (['approved', 'qc_passed', 'completed', 'ready_delivery', 'done'].includes(raw)) return 'success' as const;
  if (['in_progress', 'recording', 'editing', 'started'].includes(raw)) return 'violet' as const;
  return 'neutral' as const;
}

function getWorkflowRecordStatusForCheckpoint(
  records: ProductionPlanningWorkflowRecords | undefined,
  productId: string,
  stepIndex: number,
) {
  if (!records) return null;
  const rawStatus =
    stepIndex === 1
      ? records.storyboards?.find((item) => item.product_id === productId)?.status || null
      : stepIndex === 2 || stepIndex === 3
        ? records.slideDesigns?.find((item) => item.product_id === productId)?.status || null
        : stepIndex === 4 || stepIndex === 5
          ? records.voiceOvers?.find((item) => item.product_id === productId)?.status || null
          : stepIndex === 6 || stepIndex === 7
            ? records.videoEdits?.find((item) => item.product_id === productId)?.status || null
            : stepIndex === 8
              ? records.scormPackages?.find((item) => item.product_id === productId)?.status || null
              : null;
  const normalized = String(rawStatus || '').trim().toLowerCase();
  if (!normalized) return null;
  if (stepIndex === 1) {
    if (['in_review', 'review', 'submitted', 'approved', 'completed', 'done', 'qc_passed'].includes(normalized)) {
      return 'completed';
    }
    return normalized;
  }
  if (stepIndex === 2 || stepIndex === 3) {
    if (['submitted_qc', 'submitted', 'in_review', 'review'].includes(normalized)) return normalized;
    if (['approved', 'completed', 'done', 'qc_passed'].includes(normalized)) return 'completed';
    return normalized;
  }
  if (stepIndex === 4 || stepIndex === 5) {
    if (['submitted_video', 'submitted', 'in_review', 'review'].includes(normalized)) return normalized;
    if (['completed', 'done', 'approved', 'qc_passed'].includes(normalized)) return 'completed';
    return normalized;
  }
  if (stepIndex === 6 || stepIndex === 7) {
    if (['submitted_qc', 'submitted', 'in_review', 'review'].includes(normalized)) return normalized;
    if (['approved', 'completed', 'done', 'qc_passed'].includes(normalized)) return 'completed';
    return normalized;
  }
  if (stepIndex === 8) {
    if (['packaging', 'ready_delivery', 'completed', 'done'].includes(normalized)) return normalized;
    return normalized;
  }
  return null;
}

function getCheckpointDisplayStatus(
  row: PlanRow,
  stepIndex: number,
  task: TaskRow | null,
  fallbackStatus: PlanStatus,
  workflowRecords?: ProductionPlanningWorkflowRecords,
) {
  const liveStatus = String(getWorkflowRecordStatusForCheckpoint(workflowRecords, row.productId, stepIndex) || '').trim().toLowerCase();
  if (liveStatus) return liveStatus;

  const projection = readWorkflowStatusProjection(row.order);
  const projectedStep = projection?.products?.[row.productId]?.steps?.[String(stepIndex)];
  const sourceStatus = String(projectedStep?.sourceStatus || '').trim().toLowerCase();
  const projectedStatus = String(projectedStep?.status || '').trim();
  if (sourceStatus && !['todo', 'not_started', 'draft'].includes(sourceStatus)) return sourceStatus;
  if (projectedStatus) return projectedStatus;
  const taskStatus = String(task?.status || '').trim().toLowerCase();
  if (taskStatus && !['todo', 'not_started', 'draft'].includes(taskStatus)) return taskStatus;
  return fallbackStatus;
}

function normalizeCheckpointDisplayStatus(status: string) {
  const raw = String(status || '').trim().toLowerCase();
  if (['todo', 'not_started', 'draft'].includes(raw)) return 'todo';
  if (['submitted', 'submitted_qc', 'submitted_video', 'review', 'in_review', 'claimed', 'pm_review'].includes(raw)) return 'in_review';
  if (['done', 'completed', 'approved', 'qc_passed', 'accepted'].includes(raw)) return 'completed';
  if (['started', 'in_progress', 'recording', 'editing', 'packaging', 'in_production'].includes(raw)) return 'in_progress';
  if (raw === 'pending') return 'pending';
  return raw || 'todo';
}

function normalizePlanningSummaryStatus(status: string | PlanStatus, deadline?: string | null): PlanStatus {
  const raw = String(status || '').trim().toLowerCase();
  if (!raw || ['todo', 'not_started', 'draft'].includes(raw)) return 'not_started';
  if (raw === 'overdue') return isPastDueDate(deadline) ? 'overdue' : 'in_progress';
  if (raw === 'pending') return 'pending';
  if (['done', 'completed', 'approved', 'qc_passed', 'accepted', 'ready_delivery'].includes(raw)) return 'completed';
  return 'in_progress';
}

function assignmentKey(productId: string, stageCode: string) {
  return `${productId}::${stageCode}`;
}

function readProductOverrides(order: OrderRow) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, ProductPlanOverride>;
  const overrides = (raw as { production_plan_products?: Record<string, ProductPlanOverride> }).production_plan_products;
  if (!overrides || typeof overrides !== 'object') return {} as Record<string, ProductPlanOverride>;
  return overrides;
}

function readCheckpointAssignments(order: OrderRow) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, CheckpointAssignment>;
  const assignments = (raw as { tracking_assignments?: Record<string, CheckpointAssignment> }).tracking_assignments;
  if (!assignments || typeof assignments !== 'object') return {} as Record<string, CheckpointAssignment>;
  return assignments;
}

function buildDefaultCheckpointDeadlines(startDate: string, deadline: string, stepCount: number) {
  const start = parseDate(startDate) || parseDate(deadline);
  const end = parseDate(deadline);
  if (!start || !end) return Array.from({ length: stepCount }, () => String(deadline || '').slice(0, 10));
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / dayMs));
  return Array.from({ length: stepCount }, (_, index) => {
    const ratio = stepCount === 1 ? 0 : index / (stepCount - 1);
    const next = new Date(start);
    next.setDate(start.getDate() + Math.round(diffDays * ratio));
    return next.toISOString().slice(0, 10);
  });
}

function stageCodeFromCheckpoint(type: OrderType, stepIndex: number) {
  const prefix = type === 'H' || type === 'M' ? 'VSMF' : type === 'G' ? 'GSMF' : 'SMF';
  const normalized = Math.max(1, stepIndex + 1);
  return `${prefix}-${String(normalized).padStart(2, '0')}`;
}

function stageRouteFromCode(stageCode: string) {
  const normalized = String(stageCode || '').toLowerCase().replace(/-/g, '');
  if (/^(smf|vsmf|gsmf)\d{2}$/.test(normalized)) return normalized;
  return null;
}

function buildCheckpointRows(
  row: PlanRow,
  tasks: TaskRow[],
  profiles: ProfileRow[] = [],
  workflowRecords?: ProductionPlanningWorkflowRecords,
): CheckpointTableRow[] {
  const checkpointSteps = getCheckpointStepsByType(row.type);
  const assignments = readCheckpointAssignments(row.order);
  const profilesById = new Map(profiles.map((item) => [item.id, item]));
  const stageTasks = tasks
    .filter((task) => task.product_id === row.productId && !task.archived)
    .sort((a, b) => Number(a.stage_index) - Number(b.stage_index));
  const effectiveCurrentStageIndex = getEffectiveCheckpointStageIndex(row.product, stageTasks);
  const defaults = buildDefaultCheckpointDeadlines(row.startDate, row.deadline, checkpointSteps.length);
  const deadlineMax = parseDate(row.deadline);
  const minimumStartDate = row.startDate;
  let previousDeadline = '';
  let previousStartDate = '';

  return checkpointSteps.map((step, index) => {
    const key = assignmentKey(row.productId, step.code);
    const stageCode = stageCodeFromCheckpoint(row.type, index);
    const saved = assignments[key] || assignments[assignmentKey(row.productId, stageCode)];
    let startDate = maxDateInput(
      saved?.plannedStartDate || (index === 0 ? row.startDate : previousDeadline || previousStartDate || row.startDate),
      minimumStartDate,
    );
    let deadline = saved?.plannedDeadline || defaults[index];
    const parsed = parseDate(deadline);
    if (deadlineMax && parsed && parsed.getTime() > deadlineMax.getTime()) deadline = row.deadline;
    const parsedStart = parseDate(startDate);
    if (parsedStart && parsed && parsedStart.getTime() > parsed.getTime()) deadline = startDate;
    if (previousDeadline) {
      const prev = parseDate(previousDeadline);
      const current = parseDate(deadline);
      if (prev && current && current.getTime() < prev.getTime()) deadline = previousDeadline;
    }
    if (previousStartDate) {
      const prevStart = parseDate(previousStartDate);
      const currentStart = parseDate(startDate);
      if (prevStart && currentStart && currentStart.getTime() < prevStart.getTime()) startDate = previousStartDate;
    }
    previousStartDate = startDate;
    previousDeadline = deadline;
    const stageTask = pickStageTask(stageTasks, index);
    const stageTaskProfile = profilesById.get(stageTask?.assignee_profile_id || '');
    const savedProfile = profilesById.get(saved?.assigneeProfileId || '');
      let status = resolveCheckpointRuntimeStatus({
        stageTask,
        deadline,
        selectedRowStatus: row.status,
        currentStageIndex: effectiveCurrentStageIndex,
        stepIndex: index,
        fallbackDeadline: row.deadline,
      });
      const displayStatus = normalizeCheckpointDisplayStatus(getCheckpointDisplayStatus(row, index, stageTask, status, workflowRecords));
      if (saved?.checkpointStatus === 'pending' && status !== 'completed') {
        status = 'pending';
      }

    return {
      key,
      stageCode,
      step,
      startDate,
      assigneeProfileId: saved?.assigneeProfileId || stageTask?.assignee_profile_id || '',
        assigneeAccountId: stageTask?.assignee_account_id || null,
        assigneeEmail: normalizeEmail(saved?.assigneeEmail || savedProfile?.email || stageTaskProfile?.email),
        assigneeName: saved?.assigneeName || normalizeText(stageTask?.assignee || ''),
        status,
        displayStatus,
        deadline,
        note: saved?.note || '',
      };
  });
}

function isCheckpointAssignedToProfile(item: CheckpointTableRow, profile: ReturnType<typeof useAuth>['profile']) {
  if (!profile) return false;
  const currentEmail = normalizeEmail(profile.email);
  if (item.assigneeEmail && currentEmail) return item.assigneeEmail === currentEmail;
  if (item.assigneeAccountId && profile.authUserId) return item.assigneeAccountId === profile.authUserId;
  if (item.assigneeProfileId) return item.assigneeProfileId === profile.id;
  return false;
}

function isPlanRowAssignedToProfile(row: PlanRow, checkpointRows: CheckpointTableRow[], profile: ReturnType<typeof useAuth>['profile']) {
  if (!profile) return false;
  const currentEmail = normalizeEmail(profile.email);
  if (row.assigneeEmail && currentEmail && row.assigneeEmail === currentEmail) return true;
  if (row.assigneeProfileId === profile.id) return true;
  return checkpointRows.some((item) => isCheckpointAssignedToProfile(item, profile));
}

export function ProductionPlanningPage({
  moduleFilter,
  hideTypeColumn = false,
  showCheckpointColumn = false,
  compactCatalog = false,
}: {
  moduleFilter?: 'ELN' | 'VIDEO' | 'GAME';
  hideTypeColumn?: boolean;
  showCheckpointColumn?: boolean;
  compactCatalog?: boolean;
} = {}) {
  const { profile } = useAuth();
  const { role: shellRole } = useAppShell();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'production-planning'], queryFn: () => listTasks() });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'production-planning'], queryFn: listProfiles });
  const workflowRecordsQuery = useQuery({
    queryKey: ['workflow-records', 'production-planning'],
    queryFn: async () => {
      const payload = await fetchWorkflowRecordsPreview();
      return {
        storyboards: payload.storyboards || [],
        slideDesigns: payload.slideDesigns || [],
        voiceOvers: payload.voiceOvers || [],
        videoEdits: payload.videoEdits || [],
        scormPackages: payload.scormPackages || [],
      };
    },
  });
  const orders = (ordersQuery.data?.orders || []) as OrderRow[];
  const products = (ordersQuery.data?.products || []) as ProductRow[];
  const tasks = (tasksQuery.data || []) as TaskRow[];
  const profiles = (profilesQuery.data || []) as ProfileRow[];
  const workflowRecords = workflowRecordsQuery.data as ProductionPlanningWorkflowRecords | undefined;
  const isInitialDataLoading = (ordersQuery.isPending || tasksQuery.isPending) && !ordersQuery.data;
  const dataError = ordersQuery.error || tasksQuery.error || profilesQuery.error || workflowRecordsQuery.error;

  const [typeFilter, setTypeFilter] = useState<'all' | OrderType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PlanStatus>('all');
  const [orderKeyword, setOrderKeyword] = useState('');
  const [productKeyword, setProductKeyword] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedModalMode, setSelectedModalMode] = useState<ModalMode>('view');
  const [notice, setNotice] = useState('');
  const [savingCheckpointDrafts, setSavingCheckpointDrafts] = useState(false);
  const [checkpointDrafts, setCheckpointDrafts] = useState<Record<string, CheckpointDraft>>({});
  const effectiveRole = String(profile?.role || shellRole || '').trim().toLowerCase();
  const isAdminRole = isAdminLikeRole(effectiveRole);
  const canManagePlan = canEditProductionPlan(effectiveRole);
  const isInternalRole = !['client', 'client_director', ''].includes(effectiveRole);
  const canViewFullPlan = canManagePlan || isAdminLikeRole(effectiveRole);
  const restrictToAssignedWork = isInternalRole && !canViewFullPlan;

  const assigneeOptions = useMemo(
    () =>
      profiles
        .filter((item) => {
          const role = normalizeAppRole(item.role);
          return item.active && !isSystemTestAssigneeProfile(item) && !['client', 'client_director', 'hoc_vien'].includes(role);
        })
        .map((item) => ({ id: item.id, email: normalizeEmail(item.email), label: normalizeText(item.full_name || item.email || item.id) }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [profiles],
  );

  const planRows = useMemo(() => {
    const tasksByProduct = tasks.reduce<Map<string, TaskRow[]>>((acc, item) => {
      const bucket = acc.get(item.product_id) || [];
      bucket.push(item);
      acc.set(item.product_id, bucket);
      return acc;
    }, new Map());
    const orderById = new Map(orders.map((item) => [item.id, item]));
    const profilesById = new Map(profiles.map((item) => [item.id, item]));
    return products
      .map((product) => {
        const order = orderById.get(product.order_id);
        if (!order) return null;
        const orderProducts = (products.filter((item) => item.order_id === order.id) || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const displayOrderCode = mapDisplayOrderCode(order);
        const displayProductCodeMap = buildDisplayProductCodeMap(displayOrderCode, orderProducts);
        const productTasks = (tasksByProduct.get(product.id) || []).slice().sort((a, b) => Number(a.stage_index) - Number(b.stage_index));
        const overrides = readProductOverrides(order);
        const assignments = readCheckpointAssignments(order);
        const override = overrides[product.id];
        const moduleCode = inferProductWorkflowModule(product.id, order.module) as 'ELN' | 'VIDEO' | 'GAME';
        const latestTaskWithOwner = productTasks
          .slice()
          .sort((a, b) => Number(b.stage_index) - Number(a.stage_index))
          .find((item) => item.assignee_profile_id || item.assignee);
        const overrideProfile = profilesById.get(override?.assigneeProfileId || '');
        const latestTaskProfile = profilesById.get(latestTaskWithOwner?.assignee_profile_id || '');
        const autoStatus = resolveWorkflowProductStatus({
          product,
          orderType: mapOrderType(order),
          tasks: productTasks,
          assignments,
          manualPending: override?.status === 'pending',
          fallbackDeadline: order.deadline,
        });
        const projectedDeadline = getProjectedProductDeadline(order, product.id, override?.deadline || productTasks[productTasks.length - 1]?.due_date || order.deadline || '');
        const projectedStatus = resolveSummaryWorkflowStatus(
          getProjectedProductStatus(order, product.id, autoStatus) as PlanStatus,
          projectedDeadline || order.deadline || '',
        ) as PlanStatus;
        const normalizedStatus = normalizePlanningSummaryStatus(projectedStatus, projectedDeadline || order.deadline || '');
        const row: PlanRow = {
          productId: product.id,
          orderId: order.id,
          displayOrderCode,
          displayProductCode: normalizeText(override?.displayProductCode || '') || displayProductCodeMap.get(product.id) || product.id,
          orderName: normalizeText(order.title || '-'),
          productName: normalizeText(product.name || ''),
          moduleCode,
          type: mapOrderType(order),
          startDate: resolvePlanStartDate(order, override?.startDate),
          deadline: projectedDeadline || '',
          assigneeProfileId: override?.assigneeProfileId || latestTaskWithOwner?.assignee_profile_id || null,
          assigneeEmail: normalizeEmail(override?.assigneeEmail || overrideProfile?.email || latestTaskProfile?.email),
          assigneeName: override?.assigneeName || normalizeText(latestTaskWithOwner?.assignee || ''),
          status: normalizedStatus,
          currentStageIndex: Number(product.current_stage_index || 0),
          product,
          order,
        };
        return row;
      })
      .filter((item): item is PlanRow => Boolean(item));
  }, [orders, products, profiles, tasks]);

  const filteredRows = useMemo(() => {
    const orderSearch = orderKeyword.trim().toLowerCase();
    const productSearch = productKeyword.trim().toLowerCase();
    return planRows.filter((row) => {
      if (moduleFilter && row.moduleCode !== moduleFilter) return false;
      if (!moduleFilter && typeFilter !== 'all' && row.type !== typeFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (restrictToAssignedWork) {
        const checkpointRows = buildCheckpointRows(row, tasks, profiles, workflowRecords);
        if (!isPlanRowAssignedToProfile(row, checkpointRows, profile)) return false;
      }
      if (orderSearch && !row.displayOrderCode.toLowerCase().includes(orderSearch)) return false;
      if (productSearch && !row.displayProductCode.toLowerCase().includes(productSearch)) return false;
      return true;
    });
  }, [moduleFilter, orderKeyword, planRows, productKeyword, profile, profiles, restrictToAssignedWork, statusFilter, tasks, typeFilter, workflowRecords]);

  const groupedOrders = useMemo(() => {
    const map = new Map<string, GroupedOrder>();
    for (const row of filteredRows) {
      const existing = map.get(row.orderId);
      if (existing) {
        existing.products.push(row);
      } else {
        map.set(row.orderId, {
          orderId: row.orderId,
          displayOrderCode: row.displayOrderCode,
          orderName: row.orderName,
          type: row.type,
          deadline: row.deadline,
          products: [row],
        });
      }
    }
    return [...map.values()].sort((a, b) => a.displayOrderCode.localeCompare(b.displayOrderCode));
  }, [filteredRows]);

  const checkpointSummaryByProductId = useMemo(() => {
      const map = new Map<string, CheckpointTableRow[]>();
      for (const row of filteredRows) {
        const rows = buildCheckpointRows(row, tasks, profiles, workflowRecords);
        map.set(
          row.productId,
          restrictToAssignedWork ? rows.filter((item) => isCheckpointAssignedToProfile(item, profile)) : rows,
        );
      }
      return map;
    }, [filteredRows, profile, profiles, restrictToAssignedWork, tasks, workflowRecords]);

  const selectedRow = useMemo(() => planRows.find((item) => item.productId === selectedProductId) || null, [planRows, selectedProductId]);

  const kpi = useMemo(() => {
    const total = filteredRows.length || 1;
    const inProgress = filteredRows.filter((item) => item.status === 'in_progress').length;
    const completed = filteredRows.filter((item) => item.status === 'completed').length;
    const overdue = filteredRows.filter((item) => item.status === 'overdue').length;
    const pending = filteredRows.filter((item) => item.status === 'pending').length;
    const notStarted = filteredRows.filter((item) => item.status === 'not_started').length;
    return {
      inProgress,
      completed,
      overdue,
      pending,
      notStarted,
      inProgressPct: Math.round((inProgress * 100) / total),
      completedPct: Math.round((completed * 100) / total),
      overduePct: Math.round((overdue * 100) / total),
      pendingPct: Math.round((pending * 100) / total),
      notStartedPct: Math.round((notStarted * 100) / total),
    };
  }, [filteredRows]);

  const saveOverridesMutation = useMutation({
    mutationFn: async (payload: { orderId: string; stageOverrides: Record<string, unknown> }) => {
      await updateOrder(payload.orderId, { stage_sla_overrides: payload.stageOverrides }, { refreshProjection: false });
      return payload;
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] });
      const previousOrdersData = queryClient.getQueryData<{ orders: OrderRow[]; products: ProductRow[] }>(['orders']);
      queryClient.setQueryData<{ orders: OrderRow[]; products: ProductRow[] }>(['orders'], (current) => {
        if (!current) return current;
        return {
          ...current,
          orders: current.orders.map((order) =>
            order.id === payload.orderId
              ? {
                  ...order,
                  stage_sla_overrides: {
                    ...payload.stageOverrides,
                    status_projection: undefined,
                  },
                }
              : order,
          ),
        };
      });
      return { previousOrdersData };
    },
    onError: (_error, _payload, context) => {
      if (context?.previousOrdersData) {
        queryClient.setQueryData(['orders'], context.previousOrdersData);
      }
      setNotice('Không lưu được kế hoạch sản xuất. Vui lòng thử lại.');
    },
    onSuccess: (payload) => {
      void syncWorkflowStatusProjection(payload.orderId)
        .catch((error) => {
          console.error('Failed to sync workflow status projection', error);
        })
        .finally(() => {
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
          void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        });
      setNotice('Đã cập nhật kế hoạch sản xuất.');
    },
  });

  function updateProductRow(row: PlanRow, patch: Partial<ProductPlanOverride>) {
    const base = row.order.stage_sla_overrides && typeof row.order.stage_sla_overrides === 'object' ? row.order.stage_sla_overrides : {};
    const current = readProductOverrides(row.order);
    const previous = current[row.productId] || {
      productId: row.productId,
      status: row.status,
      startDate: row.startDate,
      assigneeProfileId: row.assigneeProfileId,
      assigneeEmail: row.assigneeEmail,
      assigneeName: row.assigneeName,
      updatedAt: new Date().toISOString(),
    };
    saveOverridesMutation.mutate({
      orderId: row.order.id,
      stageOverrides: {
        ...base,
        production_plan_products: {
          ...current,
          [row.productId]: {
            ...previous,
            ...patch,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  function handleMarkProductPending(row: PlanRow) {
    const base = row.order.stage_sla_overrides && typeof row.order.stage_sla_overrides === 'object' ? row.order.stage_sla_overrides : {};
    const tracking = readCheckpointAssignments(row.order);
    const current = readProductOverrides(row.order);
    const stageTasks = tasks
      .filter((task) => task.product_id === row.productId && !task.archived)
      .sort((a, b) => Number(a.stage_index) - Number(b.stage_index));
    const checkpointSteps = getCheckpointStepsByType(row.type);
    const defaults = buildDefaultCheckpointDeadlines(row.startDate, row.deadline, checkpointSteps.length);
    let previousDeadline = '';
    let previousStartDate = '';
    const nextTracking: Record<string, CheckpointAssignment> = { ...tracking };

    checkpointSteps.forEach((step, index) => {
      const cpKey = assignmentKey(row.productId, step.code);
      const stageCode = stageCodeFromCheckpoint(row.type, index);
      const stageKey = assignmentKey(row.productId, stageCode);
      const saved = tracking[cpKey] || tracking[stageKey];
      const startDate = maxDateInput(
        saved?.plannedStartDate || (index === 0 ? row.startDate : previousDeadline || previousStartDate || row.startDate),
        row.startDate,
      );
      let deadline = saved?.plannedDeadline || defaults[index];
      const parsedStart = parseDate(startDate);
      const parsedDeadline = parseDate(deadline);
      if (parsedStart && parsedDeadline && parsedStart.getTime() > parsedDeadline.getTime()) deadline = startDate;
      if (previousDeadline) {
        const prev = parseDate(previousDeadline);
        const currentDeadline = parseDate(deadline);
        if (prev && currentDeadline && currentDeadline.getTime() < prev.getTime()) deadline = previousDeadline;
      }
      previousDeadline = deadline;
      const stageTask = stageTasks.find((task) => Number(task.stage_index) === index) || null;
      const runtimeStatus = resolveCheckpointRuntimeStatus({
        stageTask,
        deadline,
        selectedRowStatus: row.status,
        currentStageIndex: row.currentStageIndex,
        stepIndex: index,
        fallbackDeadline: row.deadline,
      });
      const nextStatus: PlanStatus = runtimeStatus === 'completed' ? 'completed' : 'pending';
      const prevRecord = saved || {
        productId: row.productId,
        stageCode,
        assigneeProfileId: row.assigneeProfileId,
        assigneeEmail: row.assigneeEmail,
        assigneeName: row.assigneeName,
        plannedStartDate: startDate,
        plannedDeadline: deadline,
        note: '',
        checkpointStatus: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      const nextRecord = {
        ...prevRecord,
        stageCode,
        plannedStartDate: startDate,
        plannedDeadline: deadline,
        checkpointStatus: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      previousStartDate = startDate;
      nextTracking[cpKey] = nextRecord;
      nextTracking[stageKey] = nextRecord;
    });

    const nextProductStatus = resolveWorkflowProductStatus({
      product: row.product,
      orderType: row.type,
      tasks: stageTasks,
      assignments: nextTracking,
      fallbackDeadline: row.deadline,
    });

    const previous = current[row.productId] || {
      productId: row.productId,
      status: row.status,
      startDate: row.startDate,
      assigneeProfileId: row.assigneeProfileId,
      assigneeEmail: row.assigneeEmail,
      assigneeName: row.assigneeName,
      updatedAt: new Date().toISOString(),
    };

    saveOverridesMutation.mutate({
      orderId: row.order.id,
      stageOverrides: {
        ...base,
        tracking_assignments: nextTracking,
        production_plan_products: {
          ...current,
          [row.productId]: {
            ...previous,
            status: nextProductStatus,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  function handleResumeProduction(row: PlanRow) {
    const base = row.order.stage_sla_overrides && typeof row.order.stage_sla_overrides === 'object' ? row.order.stage_sla_overrides : {};
    const tracking = readCheckpointAssignments(row.order);
    const current = readProductOverrides(row.order);
    const stageTasks = tasks
      .filter((task) => task.product_id === row.productId && !task.archived)
      .sort((a, b) => Number(a.stage_index) - Number(b.stage_index));
    const checkpointSteps = getCheckpointStepsByType(row.type);
    const defaults = buildDefaultCheckpointDeadlines(row.startDate, row.deadline, checkpointSteps.length);
    let previousDeadline = '';
    let previousStartDate = '';
    const nextTracking: Record<string, CheckpointAssignment> = { ...tracking };

    checkpointSteps.forEach((step, index) => {
      const cpKey = assignmentKey(row.productId, step.code);
      const stageCode = stageCodeFromCheckpoint(row.type, index);
      const stageKey = assignmentKey(row.productId, stageCode);
      const saved = tracking[cpKey] || tracking[stageKey];
      const startDate = maxDateInput(
        saved?.plannedStartDate || (index === 0 ? row.startDate : previousDeadline || previousStartDate || row.startDate),
        row.startDate,
      );
      let deadline = saved?.plannedDeadline || defaults[index];
      const parsedStart = parseDate(startDate);
      const parsedDeadline = parseDate(deadline);
      if (parsedStart && parsedDeadline && parsedStart.getTime() > parsedDeadline.getTime()) deadline = startDate;
      if (previousDeadline) {
        const prev = parseDate(previousDeadline);
        const currentDeadline = parseDate(deadline);
        if (prev && currentDeadline && currentDeadline.getTime() < prev.getTime()) deadline = previousDeadline;
      }
      previousDeadline = deadline;
      const stageTask = stageTasks.find((task) => Number(task.stage_index) === index) || null;
      const runtimeStatus = resolveCheckpointRuntimeStatus({
        stageTask,
        deadline,
        selectedRowStatus: row.status,
        currentStageIndex: row.currentStageIndex,
        stepIndex: index,
        fallbackDeadline: row.deadline,
      });
      const prevRecord = saved || {
        productId: row.productId,
        stageCode,
        assigneeProfileId: row.assigneeProfileId,
        assigneeEmail: row.assigneeEmail,
        assigneeName: row.assigneeName,
        plannedStartDate: startDate,
        plannedDeadline: deadline,
        note: '',
        checkpointStatus: runtimeStatus,
        updatedAt: new Date().toISOString(),
      };
      const nextRecord = {
        ...prevRecord,
        stageCode,
        plannedStartDate: startDate,
        plannedDeadline: deadline,
        checkpointStatus: runtimeStatus,
        updatedAt: new Date().toISOString(),
      };
      previousStartDate = startDate;
      nextTracking[cpKey] = nextRecord;
      nextTracking[stageKey] = nextRecord;
    });

    const autoStatus = resolveWorkflowProductStatus({
      product: row.product,
      orderType: row.type,
      tasks: stageTasks,
      assignments: nextTracking,
      fallbackDeadline: row.deadline,
    });

    const previous = current[row.productId] || {
      productId: row.productId,
      status: row.status,
      startDate: row.startDate,
      assigneeProfileId: row.assigneeProfileId,
      assigneeEmail: row.assigneeEmail,
      assigneeName: row.assigneeName,
      updatedAt: new Date().toISOString(),
    };

    saveOverridesMutation.mutate({
      orderId: row.order.id,
      stageOverrides: {
        ...base,
        tracking_assignments: nextTracking,
        production_plan_products: {
          ...current,
          [row.productId]: {
            ...previous,
            status: autoStatus,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });
  }

  function handleTogglePending(row: PlanRow) {
    if (row.status === 'pending') {
      handleResumeProduction(row);
      return;
    }
    handleMarkProductPending(row);
  }

    const checkpointRows = useMemo(() => {
      if (!selectedRow) return [];
    const rows = buildCheckpointRows(selectedRow, tasks, profiles, workflowRecords);
      if (!restrictToAssignedWork) return rows;
      return rows.filter((item) => isCheckpointAssignedToProfile(item, profile));
  }, [profile, profiles, restrictToAssignedWork, selectedRow, tasks, workflowRecords]);

  useEffect(() => {
    setCheckpointDrafts({});
  }, [selectedProductId, selectedModalMode]);

  function patchCheckpointDraft(rowKey: string, patch: CheckpointDraft) {
    setCheckpointDrafts((current) => ({
      ...current,
      [rowKey]: {
        ...(current[rowKey] || {}),
        ...patch,
      },
    }));
  }

  function showDeadlineExceededPopup() {
    pushToast({ title: 'Vượt quá ngày hoàn thành đơn hàng', tone: 'danger', durationMs: 4200 });
  }

  function getCheckpointDraftValue<T extends keyof CheckpointDraft>(item: CheckpointTableRow, key: T, fallback: NonNullable<CheckpointDraft[T]> | '') {
    const draft = checkpointDrafts[item.key];
    return typeof draft?.[key] === 'undefined' ? fallback : draft[key] || '';
  }

  function getEffectiveCheckpointRowsForDrafts() {
    return checkpointRows.map((item) => {
      const draft = checkpointDrafts[item.key] || {};
      const assignee = typeof draft.assigneeProfileId === 'undefined'
        ? null
        : assigneeOptions.find((option) => option.id === draft.assigneeProfileId);
      return {
        ...item,
        startDate: typeof draft.plannedStartDate === 'undefined' ? item.startDate : draft.plannedStartDate || '',
        deadline: typeof draft.plannedDeadline === 'undefined' ? item.deadline : draft.plannedDeadline || '',
        note: typeof draft.note === 'undefined' ? item.note : draft.note || '',
        assigneeProfileId: typeof draft.assigneeProfileId === 'undefined' ? item.assigneeProfileId : draft.assigneeProfileId || '',
        assigneeEmail: typeof draft.assigneeProfileId === 'undefined' ? item.assigneeEmail : draft.assigneeEmail || assignee?.email || null,
        assigneeName: typeof draft.assigneeProfileId === 'undefined' ? item.assigneeName : draft.assigneeName || assignee?.label || '',
      };
    });
  }

  async function handleSaveAllCheckpointDrafts() {
    if (!selectedRow || selectedModalMode !== 'edit' || !canManagePlan || savingCheckpointDrafts) return;
    const draftRows = checkpointRows.filter((item) => Boolean(checkpointDrafts[item.key]));
    if (!draftRows.length) {
      setNotice('Không có thay đổi để lưu.');
      return;
    }
    setSavingCheckpointDrafts(true);
    try {
      const effectiveCheckpointRows = getEffectiveCheckpointRowsForDrafts();
      const sideEffects: Array<{ item: CheckpointTableRow; patch: Partial<CheckpointAssignment> }> = [];
      let mergedStageOverrides =
        selectedRow.order.stage_sla_overrides && typeof selectedRow.order.stage_sla_overrides === 'object'
          ? selectedRow.order.stage_sla_overrides
          : {};
      for (const item of draftRows) {
        const draft = checkpointDrafts[item.key] || {};
        const hasAssigneeDraft = typeof draft.assigneeProfileId !== 'undefined';
        const assigneeProfileId = hasAssigneeDraft ? draft.assigneeProfileId || '' : '';
        const assignee = assigneeOptions.find((option) => option.id === assigneeProfileId);
        const patch: Partial<CheckpointAssignment> = {
          plannedStartDate:
            typeof draft.plannedStartDate === 'undefined'
              ? item.startDate || ''
              : draft.plannedStartDate || '',
          plannedDeadline:
            typeof draft.plannedDeadline === 'undefined'
              ? item.deadline || ''
              : draft.plannedDeadline || '',
          note: typeof draft.note === 'undefined' ? item.note || '' : draft.note || '',
        };
        if (hasAssigneeDraft) {
          patch.assigneeProfileId = assigneeProfileId || null;
          patch.assigneeEmail = draft.assigneeEmail || assignee?.email || null;
          patch.assigneeName = draft.assigneeName || assignee?.label || '';
        }
        const nextStageOverrides = await updateCheckpoint(selectedRow, item.step.code, patch, mergedStageOverrides, true, effectiveCheckpointRows);
        if (!nextStageOverrides) return;
        mergedStageOverrides = nextStageOverrides;
        sideEffects.push({ item, patch });
      }
      await saveOverridesMutation.mutateAsync({
        orderId: selectedRow.order.id,
        stageOverrides: mergedStageOverrides,
      });
      setCheckpointDrafts({});
      setNotice('Đã lưu chung tất cả phân công checking point.');
      for (const { item, patch } of sideEffects) {
        void syncCheckpointAssignmentSideEffects(selectedRow, item, patch)
          .catch((error) => {
            console.error('Failed to run checkpoint assignment side effects', error);
          })
          .finally(() => {
            void queryClient.invalidateQueries({ queryKey: ['notifications'] });
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
          });
      }
    } catch (error) {
      console.error('Failed to save checkpoint drafts', error);
      setNotice(error instanceof Error ? error.message : 'Không lưu được phân công checking point.');
    } finally {
      setSavingCheckpointDrafts(false);
    }
  }

  async function syncCheckpointAssignmentSideEffects(row: PlanRow, currentCheckpoint: CheckpointTableRow, patch: Partial<CheckpointAssignment>) {
    const stageIndex = Math.max(0, Number(currentCheckpoint.step.code.slice(2)) - 1);
    const effectiveAssigneeProfileId =
      typeof patch.assigneeProfileId === 'undefined'
        ? currentCheckpoint.assigneeProfileId || null
        : patch.assigneeProfileId || null;
    const effectiveDeadline = patch.plannedDeadline || currentCheckpoint.deadline || row.deadline || null;
    const assigneeProfile = profiles.find((item) => item.id === effectiveAssigneeProfileId) || null;
    const assigneeChanged =
      typeof patch.assigneeProfileId !== 'undefined' &&
      patch.assigneeProfileId !== (currentCheckpoint.assigneeProfileId || null);

    const ensuredTask = await ensureTaskForStage({
      orderId: row.orderId,
      productId: row.productId,
      stageIndex,
      existingTasks: tasks,
      dueDate: effectiveDeadline,
      assignee: assigneeProfile?.full_name || null,
      assigneeProfileId: assigneeProfile?.id || null,
      assigneeAccountId: assigneeProfile?.auth_user_id || null,
      notifyAssignment: false,
    });

    if (ensuredTask?.id) {
      await updateTask(ensuredTask.id, {
        due_date: effectiveDeadline,
        assignee: assigneeProfile?.full_name || null,
        assignee_profile_id: assigneeProfile?.id || null,
        assignee_account_id: assigneeProfile?.auth_user_id || null,
      }, { notifyAssignment: false });
    }

    if (assigneeChanged && assigneeProfile?.id) {
      const stageLabel = `${currentCheckpoint.stageCode} - ${currentCheckpoint.step.label}`;
      const assigneeEmail = assigneeProfile?.email || patch.assigneeEmail || null;
      await Promise.allSettled([
        createNotification({
          level: 'info',
          title: `Bạn được giao ${currentCheckpoint.stageCode}`,
          body: `Thuộc sản phẩm ${row.displayProductCode || row.productId}. Vui lòng kiểm tra.`,
          linkPage: 'my-tasks',
          recipientProfileId: assigneeProfile?.id || null,
          recipientAccountId: assigneeProfile?.auth_user_id || null,
          eventKey: `${row.productId}:${currentCheckpoint.stageCode}:assigned:${assigneeProfile?.id || patch.assigneeProfileId}`,
          metadata: {
            order_id: row.orderId,
            display_order_code: row.displayOrderCode,
            product_id: row.productId,
            display_product_code: row.displayProductCode,
            stage_index: stageIndex,
            stage_code: currentCheckpoint.stageCode,
            assignee_profile_id: assigneeProfile?.id || null,
            assignee_account_id: assigneeProfile?.auth_user_id || null,
            assignee_email: assigneeEmail,
          },
        }),
        createActivityLog({
          actionType: 'workflow_step_assigned',
          objectType: 'task',
          objectId: ensuredTask?.id || `${row.productId}::${stageIndex}`,
          summary: `Gán ${row.displayProductCode} - ${stageLabel} cho ${assigneeProfile?.full_name || 'unassigned'}${assigneeEmail ? ` (${assigneeEmail})` : ''}`,
          metadata: {
            task_id: ensuredTask?.id || null,
            order_id: row.orderId,
            display_order_code: row.displayOrderCode,
            product_id: row.productId,
            display_product_code: row.displayProductCode,
            stage_index: stageIndex,
            stage_code: currentCheckpoint.stageCode,
            assignee_profile_id: assigneeProfile?.id || null,
            assignee_account_id: assigneeProfile?.auth_user_id || null,
            assignee_name: assigneeProfile?.full_name || null,
            assignee_email: assigneeEmail,
            planned_start_date: patch.plannedStartDate || currentCheckpoint.startDate || null,
            planned_deadline: effectiveDeadline,
            source: 'production_planning_modal',
          },
        }),
      ]);
    }
  }

  async function updateCheckpoint(
    row: PlanRow,
    stageCode: string,
    patch: Partial<CheckpointAssignment>,
    baseStageOverrides?: Record<string, unknown>,
    buildOnly = false,
    validationRows = checkpointRows,
  ) {
    if (!canManagePlan) {
      setNotice('Bạn không có quyền cập nhật phân công ở màn kế hoạch sản xuất.');
      return null;
    }
    const currentCheckpoint = validationRows.find((item) => item.step.code === stageCode);
    if (!currentCheckpoint) return null;
    const nextStartDate = patch.plannedStartDate || currentCheckpoint.startDate;
    const nextDeadline = patch.plannedDeadline || currentCheckpoint.deadline;
    const maxDeadline = parseDate(row.deadline);
    const previous = validationRows.find((item) => Number(item.step.code.slice(2)) === Number(stageCode.slice(2)) - 1);
    if (maxDeadline) {
      const parsed = parseDate(nextDeadline);
      if (parsed && parsed.getTime() > maxDeadline.getTime()) {
        showDeadlineExceededPopup();
        setNotice('Deadline checking point không được vượt deadline tổng của sản phẩm.');
        return null;
      }
    }
    if (previous) {
      const prevStartDate = parseDate(previous.startDate);
      const candidateStartDate = parseDate(nextStartDate);
      if (prevStartDate && candidateStartDate && candidateStartDate.getTime() < prevStartDate.getTime()) {
        setNotice('Ngày bắt đầu checking point sau phải lớn hơn hoặc bằng checking point trước.');
        return null;
      }
      const prevDate = parseDate(previous.deadline);
      const nextDate = parseDate(nextDeadline);
      if (prevDate && nextDate && nextDate.getTime() < prevDate.getTime()) {
        setNotice('Deadline checking point sau phải lớn hơn hoặc bằng checking point trước.');
        return null;
      }
    }
    const parsedStartDate = parseDate(nextStartDate);
    const parsedDeadline = parseDate(nextDeadline);
    if (parsedStartDate && parsedDeadline && parsedStartDate.getTime() > parsedDeadline.getTime()) {
      setNotice('Ngày bắt đầu không được lớn hơn deadline của checking point.');
      return null;
    }

    const base = baseStageOverrides || (row.order.stage_sla_overrides && typeof row.order.stage_sla_overrides === 'object' ? row.order.stage_sla_overrides : {});
    const tracking = (base as { tracking_assignments?: Record<string, CheckpointAssignment> }).tracking_assignments || {};
    const key = assignmentKey(row.productId, stageCode);
    const stageRow = validationRows.find((item) => item.step.code === stageCode);
    const stageKey = assignmentKey(row.productId, stageRow?.stageCode || stageCodeFromCheckpoint(row.type, Number(stageCode.slice(2)) - 1));
    const previousRecord = tracking[key] || {
      productId: row.productId,
      stageCode,
      assigneeProfileId: row.assigneeProfileId,
      assigneeEmail: row.assigneeEmail,
      assigneeName: row.assigneeName,
      plannedStartDate: currentCheckpoint.startDate,
      plannedDeadline: currentCheckpoint.deadline,
      note: '',
      checkpointStatus: currentCheckpoint.status,
      updatedAt: new Date().toISOString(),
    };

    const nextStageOverrides = {
      ...base,
      tracking_assignments: {
        ...tracking,
        [key]: {
          ...previousRecord,
          ...patch,
          plannedStartDate: patch.plannedStartDate || currentCheckpoint.startDate,
          plannedDeadline: patch.plannedDeadline || currentCheckpoint.deadline,
          updatedAt: new Date().toISOString(),
        },
        ...(stageKey !== key
          ? {
              [stageKey]: {
                ...previousRecord,
                ...patch,
                stageCode: stageRow?.stageCode || stageCodeFromCheckpoint(row.type, Number(stageCode.slice(2)) - 1),
                plannedStartDate: patch.plannedStartDate || currentCheckpoint.startDate,
                plannedDeadline: patch.plannedDeadline || currentCheckpoint.deadline,
                updatedAt: new Date().toISOString(),
              },
            }
          : {}),
      },
    };

    if (buildOnly) return nextStageOverrides;

    await saveOverridesMutation.mutateAsync({
      orderId: row.order.id,
      stageOverrides: nextStageOverrides,
    });

    await syncCheckpointAssignmentSideEffects(row, currentCheckpoint, patch);
    setNotice('Đã lưu cập nhật checking point.');
    return nextStageOverrides;
  }

  function openProductModal(productId: string, mode: ModalMode) {
    setSelectedProductId(productId);
    setSelectedModalMode(mode);
  }

  function closeProductModal() {
    setSelectedProductId('');
    setSelectedModalMode('view');
  }

  function openStageDetail(stageCode: string) {
    const route = stageRouteFromCode(stageCode);
    if (!route || !selectedRow) return;
    const productKey = `${selectedRow.order.id}::${selectedRow.product.id}`;
    closeProductModal();
    const query = route === 'smf01' || route === 'vsmf01'
      ? `?view=detail&product=${encodeURIComponent(productKey)}`
      : `?product=${encodeURIComponent(productKey)}`;
    navigate(`/${route}${query}`);
  }

  return (
    <div className={`overview-compact overview-production${compactCatalog ? ' catalog-compact' : ''}${selectedRow ? ' is-detail-open' : ''}`}>
      {compactCatalog ? (
        <div className="catalog-toolbar">
          <div className="catalog-toolbar-filters">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PlanStatus)}>
              <option value="all">Lọc trạng thái</option>
              <option value="not_started">Chưa bắt đầu</option>
              <option value="in_progress">Đang thực hiện</option>
              <option value="pending">Pending</option>
              <option value="overdue">Quá hạn</option>
              <option value="completed">Hoàn thành</option>
            </select>
          </div>
          <div className="catalog-toolbar-meta">Hiển thị {filteredRows.length} đơn hàng</div>
        </div>
      ) : null}
      {compactCatalog ? null : (
      <Card title="Bộ lọc kế hoạch sản xuất">
        <div className="production-plan-filter-grid">
          {moduleFilter ? null : (
            <label>
              <span>Loại sản phẩm</span>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | OrderType)}>
                <option value="all">Tất cả</option>
                <option value="H">H</option>
                <option value="E">E</option>
                <option value="G">G</option>
                <option value="M">M</option>
              </select>
            </label>
          )}
          <label>
            <span>Trạng thái</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | PlanStatus)}>
              <option value="all">Tất cả</option>
              <option value="not_started">Chưa bắt đầu</option>
              <option value="in_progress">Đang thực hiện</option>
              <option value="overdue">Quá hạn</option>
              <option value="pending">Pending</option>
              <option value="completed">Hoàn thành</option>
            </select>
          </label>
          <label>
            <span>Mã đơn hàng</span>
            <input value={orderKeyword} onChange={(event) => setOrderKeyword(event.target.value)} placeholder="Ví dụ: HCMC_CMHV_H" />
          </label>
          <label>
            <span>Mã sản phẩm</span>
            <input value={productKeyword} onChange={(event) => setProductKeyword(event.target.value)} placeholder="Ví dụ: HCMC_CMHV_H01" />
          </label>
        </div>
      </Card>
      )}

      {compactCatalog ? null : (
      <div className="kpi-row production-plan-kpis">
        <Kpi label="Đang sản xuất" value={String(kpi.inProgress)} tone="violet" />
        <Kpi label="Hoàn thành" value={String(kpi.completed)} tone="success" />
        <Kpi label="Quá hạn" value={String(kpi.overdue)} tone="danger" />
        <Kpi label="Pending" value={String(kpi.pending)} tone="warning" />
        <Kpi label="Chưa sản xuất" value={String(kpi.notStarted)} tone="neutral" />
      </div>
      )}

      <Card title="Danh sách sản phẩm theo cụm đơn hàng">
        {isInitialDataLoading ? <div className="muted-text">Đang tải dữ liệu kế hoạch sản xuất...</div> : null}
        {dataError ? <div className="bullet-item tone-danger">{dataError instanceof Error ? dataError.message : String(dataError)}</div> : null}
        <div className="production-plan-table-wrap production-plan-glass-panel">
          <table className={`data-table production-plan-table production-plan-table-compact production-plan-table-corporate${compactCatalog && hideTypeColumn && showCheckpointColumn ? ' production-plan-table-catalog-checkpoint' : ''}`}>
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Mã đơn hàng</th>
                <th>Tên sản phẩm</th>
                {hideTypeColumn ? null : <th>Loại</th>}
                <th>Bắt đầu</th>
                <th>Deadline</th>
                <th>Trạng thái</th>
                {showCheckpointColumn ? <th>Checking point</th> : null}
                {compactCatalog ? null : <th>Thao tác</th>}
              </tr>
            </thead>
            <tbody>
              {groupedOrders.map((group) => {
                return [
                  ...group.products.map((row) => (
                        <tr key={row.productId}>
                          <td>{row.displayProductCode}</td>
                          <td>{row.displayOrderCode}</td>
                          <td className="production-plan-col-product-name">{row.productName}</td>
                          {hideTypeColumn ? null : <td>{row.type}</td>}
                          <td>{formatDate(row.startDate)}</td>
                          <td>{formatDate(row.deadline)}</td>
                          <td>
                            {(() => {
                              const summaryStatus = normalizePlanningSummaryStatus(row.status, row.deadline);
                              return compactCatalog ? (
                                <span className={`catalog-status-text tone-${STATUS_TONE[summaryStatus]}`}>{STATUS_LABEL[summaryStatus]}</span>
                              ) : (
                                <Badge tone={STATUS_TONE[summaryStatus]}>{STATUS_LABEL[summaryStatus]}</Badge>
                              );
                            })()}
                          </td>
                          {showCheckpointColumn ? (
                            <td>
                              <div className="stack compact">
                                {(() => {
                                  const checkpointRowsForProduct = checkpointSummaryByProductId.get(row.productId) || [];
                                    const currentCheckpoint =
                                      checkpointRowsForProduct.find((item) => ['in_progress', 'pending', 'overdue', 'submitted', 'submitted_qc', 'submitted_video', 'review', 'in_review', 'claimed', 'changes_requested'].includes(String(item.displayStatus || '').toLowerCase())) ||
                                      checkpointRowsForProduct.find((item) => String(item.displayStatus || '').toLowerCase() !== 'completed') ||
                                      checkpointRowsForProduct[checkpointRowsForProduct.length - 1];
                                  if (!currentCheckpoint) return <span className="muted-text">-</span>;
                                  return compactCatalog ? (
                                    <button
                                      className="production-plan-icon-btn"
                                      type="button"
                                      title="Xem chi tiết"
                                      aria-label={`Xem chi tiết ${row.displayProductCode}`}
                                      onClick={() => openProductModal(row.productId, 'view')}
                                    >
                                      <Eye size={16} strokeWidth={1.9} />
                                    </button>
                                  ) : (
                                    <>
                                      <div className="fw6">{currentCheckpoint.step.label}</div>
                                      <div className="muted-text">
                                        {currentCheckpoint.assigneeName || 'Chưa phân công'} · {formatDate(currentCheckpoint.deadline)}
                                      </div>
                                      <button
                                        className="btn btn-ghost btn-small"
                                        type="button"
                                        onClick={() => openProductModal(row.productId, canManagePlan ? 'edit' : 'view')}
                                      >
                                        Xem chi tiết
                                      </button>
                                    </>
                                  );
                                })()}
                              </div>
                            </td>
                          ) : null}
                          {compactCatalog ? null : (
                          <td>
                            <div className="production-plan-row-actions production-plan-row-actions-icons">
                              <button
                                className="production-plan-icon-btn"
                                type="button"
                                title="Xem chi tiết"
                                aria-label={`Xem chi tiết ${row.displayProductCode}`}
                                onClick={() => openProductModal(row.productId, 'view')}
                              >
                                <Eye size={16} strokeWidth={1.9} />
                              </button>
                              {canManagePlan ? (
                              <button
                                className="production-plan-icon-btn"
                                type="button"
                                title="Chỉnh sửa thông tin"
                                aria-label={`Chỉnh sửa thông tin ${row.displayProductCode}`}
                                onClick={() => openProductModal(row.productId, 'edit')}
                              >
                                <Pencil size={16} strokeWidth={1.9} />
                              </button>
                              ) : null}
                            </div>
                          </td>
                          )}
                        </tr>
                      )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedRow ? (
        <div className="production-plan-detail-page">
          <div className="production-plan-detail-shell production-plan-modal-shell">
            <div className="results-modal-head">
              <h3>{selectedModalMode === 'edit' ? 'Chỉnh sửa checking point' : 'Chi tiết checking point'} · {selectedRow.displayProductCode}</h3>
              <div className="production-plan-modal-actions">
                {selectedModalMode === 'edit' && canManagePlan ? (
                  <button
                    className="btn btn-primary production-plan-action-pill"
                    onClick={() => { void handleSaveAllCheckpointDrafts(); }}
                    disabled={saveOverridesMutation.isPending || savingCheckpointDrafts || Object.keys(checkpointDrafts).length === 0}
                  >
                    {saveOverridesMutation.isPending || savingCheckpointDrafts ? 'Đang lưu...' : 'Lưu chung'}
                  </button>
                ) : null}
                {selectedModalMode === 'edit' && canManagePlan ? (
                  <button
                    className="btn btn-ghost production-plan-action-pill"
                    onClick={() => handleTogglePending(selectedRow)}
                    disabled={saveOverridesMutation.isPending || savingCheckpointDrafts || selectedRow.status === 'completed'}
                  >
                    {saveOverridesMutation.isPending || savingCheckpointDrafts
                      ? 'Đang cập nhật...'
                      : selectedRow.status === 'pending'
                        ? 'Tái sản xuất'
                        : 'Pending sản phẩm'}
                  </button>
                ) : null}
                <button className="btn btn-ghost production-plan-action-pill" onClick={closeProductModal}>Đóng</button>
              </div>
            </div>
            <div className="results-modal-body">
              <div className="muted-text">
                Đơn hàng: {selectedRow.displayOrderCode} · Sản phẩm: {selectedRow.productName} · Deadline tổng: {formatDate(selectedRow.deadline)}
              </div>
              <table className="data-table production-plan-checkpoint-table production-plan-table-compact">
                <thead>
                  <tr>
                    <th>Checking point</th>
                    <th>Phụ trách</th>
                    <th>Trạng thái</th>
                    <th className="production-plan-start-date-head">Bắt đầu</th>
                    <th>Deadline</th>
                    {compactCatalog ? null : <th>Ghi chú</th>}
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {checkpointRows.map((item) => (
                    <tr key={item.key}>
                      <td>{item.step.label}</td>
                      <td>
                        <select
                          value={String(getCheckpointDraftValue(item, 'assigneeProfileId', item.assigneeProfileId || ''))}
                          disabled={selectedModalMode !== 'edit' || !canManagePlan}
                          onChange={(event) => {
                            const assignee = assigneeOptions.find((option) => option.id === event.target.value);
                            patchCheckpointDraft(item.key, {
                              assigneeProfileId: event.target.value || null,
                              assigneeEmail: assignee?.email || null,
                              assigneeName: assignee?.label || '',
                            });
                          }}
                        >
                          <option value="">Chọn phụ trách</option>
                          {assigneeOptions.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </td>
                        <td>
                          <Badge tone={getCheckpointStatusTone(item.displayStatus)}>{getStatusDisplayLabel(item.displayStatus)}</Badge>
                        </td>
                      <td className="production-plan-start-date-cell">
                        {selectedModalMode === 'edit' && canManagePlan ? (
                          <input
                            type="date"
                            value={String(getCheckpointDraftValue(item, 'plannedStartDate', item.startDate || ''))}
                            disabled={!canManagePlan}
                            onChange={(event) => { patchCheckpointDraft(item.key, { plannedStartDate: event.target.value }); }}
                          />
                        ) : (
                          <div className="production-plan-start-date-badge">{formatDate(item.startDate)}</div>
                        )}
                      </td>
                      <td>
                        {selectedModalMode === 'edit' && canManagePlan ? (
                          <input
                            type="date"
                            value={String(getCheckpointDraftValue(item, 'plannedDeadline', item.deadline || ''))}
                            max={normalizeDateInput(selectedRow.deadline)}
                            disabled={!canManagePlan}
                            onChange={(event) => { patchCheckpointDraft(item.key, { plannedDeadline: event.target.value }); }}
                          />
                        ) : (
                          <div className="production-plan-deadline-text">{formatDate(item.deadline)}</div>
                        )}
                      </td>
                      {compactCatalog ? null : (
                        <td>
                          <input
                            value={String(getCheckpointDraftValue(item, 'note', item.note || ''))}
                            placeholder="Ghi chú"
                            readOnly={selectedModalMode !== 'edit' || !canManagePlan}
                            onChange={(event) => { patchCheckpointDraft(item.key, { note: normalizeText(event.target.value) }); }}
                          />
                        </td>
                      )}
                      <td>
                        <button className="btn btn-ghost btn-small" type="button" onClick={() => openStageDetail(item.stageCode)}>Xem chi tiết</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {notice ? <div className="notice">{notice}</div> : null}
    </div>
  );
}

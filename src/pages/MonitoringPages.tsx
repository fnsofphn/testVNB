import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil } from 'lucide-react';
import { useToast } from '@/components/system/ToastProvider';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { useAppShell } from '@/contexts/AppShellContext';
import { useAuth } from '@/contexts/AuthContext';
import { PRODUCT_LIBRARY_ITEMS } from '@/data/productLibrary2025';
import { canEditOrderManagement, normalizeAppRole } from '@/data/vcontent';
import { buildDisplayProductCodeMap, getDisplayOrderCode } from '@/lib/orderDisplayCodes';
import { getProjectedOrderStatus, getProjectedProductDeadline, getProjectedProductStatus } from '@/lib/workflowProjection';
import { getStatusDisplayLabel } from '@/lib/statusLabels';
import {
  getOrderWorkflowStatus,
  getProductWorkflowStatus,
  getTaskWorkflowStatus,
  resolveSummaryWorkflowStatus,
  resolveWorkflowOverrideStatus,
  type WorkflowStatus,
} from '@/lib/workflowStatus';
import {
  createClientOrder,
  createActivityLog,
  createNotification,
  createOrderProduct,
  deleteOrder,
  deleteOrderProduct,
  ensureTaskForStage,
  inferProductWorkflowModule,
  listOrdersWithProducts,
  listProfiles,
  listTasks,
  listWorkflowRecords,
  normalizeOrderCodeFragment,
  updateOrder,
  updateProduct,
  updateTask,
  type ProfileRow,
  type OrderRow,
  type ProductRow,
  type TaskRow,
} from '@/services/vcontent';

function toneForStatus(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' | 'purple' {
  if (['overdue', 'qc_fail', 'fail', 'changes_requested', 'critical'].includes(status)) return 'danger';
  if (['submitted', 'review', 'in_review', 'ready_for_launch', 'packaging', 'warning'].includes(status)) return 'warning';
  if (['done', 'approved', 'ready_delivery', 'paid', 'success'].includes(status)) return 'success';
  if (['todo', 'not_started'].includes(status)) return 'purple';
  if (['in_production', 'in_progress', 'recording', 'editing', 'info'].includes(status)) return 'violet';
  return 'neutral';
}

function isLaunchedProduct(progress: number, tasks: Array<{ product_id: string; archived?: boolean }>, productId: string) {
  return progress > 0 || tasks.some((task) => task.product_id === productId && !task.archived);
}

type AssignmentRecord = {
  productId: string;
  stageCode: string;
  assigneeProfileId: string | null;
  assigneeEmail?: string | null;
  assigneeName: string;
  plannedDeadline: string;
  note: string;
  notificationState: 'pending';
  checkpointStatus?: string;
  updatedAt: string;
};

const ASSIGNMENT_ROWS_BY_MODULE: Record<'ELN' | 'VIDEO' | 'GAME', string[]> = {
  ELN: ['SMF-00', 'SMF-01', 'SMF-02', 'SMF-03', 'SMF-04', 'SMF-05', 'SMF-06', 'SMF-07', 'SMF-08'],
  VIDEO: ['VSMF-00', 'VSMF-01', 'VSMF-02', 'VSMF-03', 'VSMF-04', 'VSMF-05', 'VSMF-06', 'VSMF-07'],
  GAME: ['GSMF-01', 'GSMF-02', 'GSMF-03', 'GSMF-04'],
};

function normalizeUtf8Text(value: string) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

function normalizeDisplayOrderCode(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function sanitizeMultilineNote(value: string, maxLength = 500) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .slice(0, maxLength);
}

function buildOrderCodeSuggestion(input: { title: string; client: string; projectCode: string; orderType: 'E' | 'H' | 'G' | 'M' }) {
  const parts = [input.client, input.projectCode, input.title]
    .map((part) => normalizeOrderCodeFragment(part))
    .filter(Boolean)
    .join('_');
  const suffix = input.orderType === 'M' ? 'M' : input.orderType;
  return normalizeDisplayOrderCode(`${parts}-${suffix}`);
}

function getOrderModuleLabelFromType(orderType: 'E' | 'H' | 'G' | 'M') {
  if (orderType === 'H') return 'VIDEO';
  if (orderType === 'G') return 'GAME';
  if (orderType === 'M') return 'MIXED';
  return 'ELN';
}

async function requireActiveProfile(
  profile: ReturnType<typeof useAuth>['profile'],
  refreshProfile: ReturnType<typeof useAuth>['refreshProfile'],
) {
  let activeProfile = profile;
  if (!activeProfile) {
    activeProfile = await refreshProfile().catch(() => null);
  }
  if (!activeProfile) {
    throw new Error('Thiếu profile hiện tại. Hãy kiểm tra đăng nhập và phân quyền.');
  }
  return activeProfile;
}

function assignmentKey(productId: string, stageCode: string) {
  return `${productId}::${stageCode}`;
}

function readTrackingAssignments(order: { stage_sla_overrides?: Record<string, unknown> | null }) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, AssignmentRecord>;
  const maybe = (raw as { tracking_assignments?: Record<string, AssignmentRecord> }).tracking_assignments;
  if (!maybe || typeof maybe !== 'object') return {} as Record<string, AssignmentRecord>;
  return maybe;
}

function readOrderMeta(order: { stage_sla_overrides?: Record<string, unknown> | null }) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, unknown>;
  const orderMeta = (raw as { order_meta?: Record<string, unknown> }).order_meta;
  if (!orderMeta || typeof orderMeta !== 'object') return {} as Record<string, unknown>;
  return orderMeta;
}

function getWorkflowStageLabel(module: string, stageIndex: number, launched: boolean) {
  if (!launched) return 'Chưa khởi chạy';
  const prefix = module === 'VIDEO' ? 'VSMF' : module === 'GAME' ? 'GSMF' : 'SMF';
  const maxStage = module === 'VIDEO' ? 7 : module === 'GAME' ? 4 : 8;
  const normalized = Math.min(Math.max(stageIndex + 1, 1), maxStage);
  return `${prefix}-${String(normalized).padStart(2, '0')}`;
}

type DashboardStatus = 'not_started' | 'in_progress' | 'overdue' | 'pending' | 'completed';
type DashboardOrderType = 'H' | 'E' | 'G' | 'M';

type DashboardProductRow = {
  productId: string;
  productName: string;
  deadline: string;
  status: DashboardStatus;
  assigneeProfileId?: string | null;
  assigneeName?: string;
  currentStageCode?: string;
};

type DashboardCheckpointRow = {
  checkpointId: string;
  orderId: string;
  productId: string;
  productName: string;
  deadline: string;
  status: DashboardStatus;
  note: string;
};

type DashboardOrderRow = {
  orderId: string;
  orderCode: string;
  orderName: string;
  orderType: DashboardOrderType;
  customer: string;
  productCount: number;
  deadline: string;
  status: DashboardStatus;
  pmNote: string;
  products: DashboardProductRow[];
  checkpoints: DashboardCheckpointRow[];
};

type StoredCheckpoint = {
  checkpointId?: string;
  productId?: string;
  productName?: string;
  deadline?: string;
  status?: DashboardStatus;
  note?: string;
};

type ProductPlanOverride = {
  productId: string;
  status?: DashboardStatus;
  startDate?: string;
  deadline?: string;
  displayProductCode?: string;
  note?: string;
  assigneeProfileId?: string | null;
  assigneeName?: string;
  currentStageCode?: string;
  updatedAt?: string;
};

type CheckpointProductDraft = {
  productCode: string;
  productName: string;
  deadline: string;
};

const DASHBOARD_STATUS_LABEL: Record<DashboardStatus, string> = {
  not_started: 'Chưa bắt đầu',
  in_progress: 'Đang thực hiện',
  overdue: 'Quá hạn',
  pending: 'Pending',
  completed: 'Hoàn thành',
};

const DASHBOARD_STATUS_TONE: Record<DashboardStatus, 'neutral' | 'violet' | 'purple' | 'danger' | 'warning' | 'success'> = {
  not_started: 'purple',
  in_progress: 'violet',
  overdue: 'danger',
  pending: 'warning',
  completed: 'success',
};

function parseDashboardDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDashboardDate(value: string | null | undefined) {
  const date = parseDashboardDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function normalizeDateInput(value: string | null | undefined) {
  return String(value || '').slice(0, 10);
}

function isAfterOrderDeadline(deadline: string | null | undefined, orderDeadline: string | null | undefined) {
  const normalizedDeadline = normalizeDateInput(deadline);
  const normalizedOrderDeadline = normalizeDateInput(orderDeadline);
  if (!normalizedDeadline || !normalizedOrderDeadline) return false;
  return normalizedDeadline > normalizedOrderDeadline;
}

function mapDashboardOrderType(order: OrderRow): DashboardOrderType {
  const orderMeta = readOrderMeta(order);
  const typeFromMeta = String(orderMeta.order_type || '').toUpperCase();
  if (['H', 'E', 'G', 'M'].includes(typeFromMeta)) return typeFromMeta as DashboardOrderType;
  const match = String(order.id || '').toUpperCase().match(/_([HEGM])$/);
  if (match) return match[1] as DashboardOrderType;
  const module = String(order.module || '').toUpperCase();
  if (module === 'GAME') return 'G';
  if (module === 'ELN') return 'E';
  if (module === 'VIDEO') return 'H';
  return 'M';
}

function mapDashboardCustomer(order: OrderRow) {
  const orderMeta = readOrderMeta(order);
  const customerFromMeta = String(orderMeta.customer || '').trim();
  if (customerFromMeta) return customerFromMeta;
  return String(order.client || '').trim() || '-';
}

function buildNextProductCode(orderCode: string, products: DashboardProductRow[]) {
  const baseCode = normalizeOrderCodeFragment(orderCode).toUpperCase();
  if (!baseCode) return '';
  const prefix = `${baseCode}_`;
  let maxSequence = 0;

  for (const product of products) {
    const normalizedProductId = String(product.productId || '').trim().toUpperCase();
    const markerIndex = normalizedProductId.indexOf(prefix);
    if (markerIndex < 0) continue;
    const matched = normalizedProductId.slice(markerIndex).match(new RegExp(`^${prefix}(\\d+)$`));
    if (!matched) continue;
    const sequence = Number(matched[1] || 0);
    if (Number.isFinite(sequence) && sequence > maxSequence) {
      maxSequence = sequence;
    }
  }

  return `${baseCode}_${String(maxSequence + 1).padStart(2, '0')}`;
}

function mapDashboardTaskStatus(task: TaskRow, fallbackDeadline?: string): DashboardStatus {
  return getTaskWorkflowStatus(task, fallbackDeadline) as DashboardStatus;
}

function normalizeDashboardStatusValue(value: string | null | undefined): DashboardStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (['done', 'completed', 'approved', 'qc_passed', 'accepted'].includes(raw)) return 'completed';
  if (['overdue', 'fail', 'qc_fail', 'rejected', 'critical'].includes(raw)) return 'overdue';
  if (['started', 'in_progress', 'recording', 'editing', 'packaging', 'in_production'].includes(raw)) return 'in_progress';
  if (['pending', 'review', 'in_review', 'submitted', 'changes_requested', 'waiting', 'submitted_qc', 'submitted_video'].includes(raw)) return 'pending';
  return 'not_started';
}

function getDashboardTrackingStatus(order: OrderRow, productId: string, module: string): DashboardStatus | null {
  const assignments = Object.values(readTrackingAssignments(order)).filter((assignment) => assignment?.productId === productId);
  if (!assignments.length) return null;

  const statuses = assignments.map((assignment) => normalizeDashboardStatusValue(assignment.checkpointStatus || 'not_started'));
  const expectedCount = ASSIGNMENT_ROWS_BY_MODULE[(module === 'VIDEO' ? 'VIDEO' : module === 'GAME' ? 'GAME' : 'ELN') as 'ELN' | 'VIDEO' | 'GAME'].length;
  if (statuses.some((status) => status === 'overdue')) return 'overdue';
  if (statuses.some((status) => status === 'in_progress')) return 'in_progress';
  if (statuses.some((status) => status === 'completed') && statuses.length < expectedCount) return 'in_progress';
  if (statuses.some((status) => status === 'completed') && statuses.some((status) => status !== 'completed')) return 'in_progress';
  if (statuses.length >= expectedCount && statuses.every((status) => status === 'completed')) return 'completed';
  if (statuses.some((status) => status === 'pending')) return 'pending';
  return null;
}

function isUnstartedDashboardProduct(product: ProductRow, order: OrderRow, tasks: TaskRow[]) {
  if (product.finished || product.ready_for_delivery) return false;
  if (Number(product.progress || 0) > 0) return false;
  if (Number(product.current_stage_index || 0) > 0) return false;
  if (getDashboardTrackingStatus(order, product.id, inferProductWorkflowModule(product.id, order.module))) return false;
  const activeTasks = tasks.filter((task) => !task.archived);
  if (!activeTasks.length) return true;
  return activeTasks.every((task) => {
    const status = String(task.status || '').trim().toLowerCase();
    return !status || status === 'todo' || status === 'not_started';
  });
}

function mapDashboardProductStatus(product: ProductRow, order: OrderRow, tasks: TaskRow[]): DashboardStatus {
  const trackingStatus = getDashboardTrackingStatus(order, product.id, inferProductWorkflowModule(product.id, order.module));
  if (trackingStatus) return trackingStatus;
  if (isUnstartedDashboardProduct(product, order, tasks)) return 'not_started';
  const computedStatus = getProductWorkflowStatus({
    finished: product.finished,
    readyForDelivery: product.ready_for_delivery,
    progress: product.progress,
    currentStageIndex: product.current_stage_index,
    tasks,
    fallbackDeadline: order.deadline,
  }) as DashboardStatus;
  return getProjectedProductStatus(order, product.id, computedStatus) as DashboardStatus;
}

function resolveDashboardProductStatus(overrideStatus: DashboardStatus | undefined, computedStatus: DashboardStatus): DashboardStatus {
  return resolveWorkflowOverrideStatus(overrideStatus as WorkflowStatus | undefined, computedStatus as WorkflowStatus) as DashboardStatus;
}

function readProductPlanOverrides(order: OrderRow | null) {
  if (!order) return {} as Record<string, ProductPlanOverride>;
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, ProductPlanOverride>;
  const maybe = (raw as { production_plan_products?: Record<string, ProductPlanOverride> }).production_plan_products;
  if (!maybe || typeof maybe !== 'object') return {} as Record<string, ProductPlanOverride>;
  return maybe;
}

function checkpointCodeFromStageIndex(stageIndex: number) {
  return `CP${String(Math.max(1, stageIndex + 1)).padStart(2, '0')}`;
}

function stripHtmlTags(value: string) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

function resolveActionCaseByDeadline(input: {
  hasAssignee: boolean;
  deadline: string;
  baseStatus: DashboardStatus;
}): DetailActionCase {
  if (!input.hasAssignee) return 'unassigned';
  const due = parseDashboardDate(input.deadline);
  const now = Date.now();
  if (due && due.getTime() < now && input.baseStatus !== 'completed') return 'assigned_overdue';
  if (due) {
    const diffHours = Math.floor((due.getTime() - now) / (1000 * 60 * 60));
    if (diffHours >= 0 && diffHours <= 48 && input.baseStatus !== 'completed') return 'assigned_near_due';
  }
  if (input.baseStatus === 'not_started' || input.baseStatus === 'pending') return 'assigned_not_started';
  return 'normal';
}

function mapDashboardOrderStatus(products: DashboardProductRow[]): DashboardStatus {
  const statuses = products.map((item) => item.status);
  if (!statuses.length) return 'not_started';
  if (statuses.every((status) => status === 'completed')) return 'completed';
  if (statuses.some((status) => status === 'overdue')) return 'overdue';
  if (statuses.some((status) => status === 'in_progress')) return 'in_progress';
  if (statuses.some((status) => status === 'pending')) return 'pending';
  if (statuses.every((status) => status === 'not_started')) return 'not_started';
  return getOrderWorkflowStatus(statuses as WorkflowStatus[]) as DashboardStatus;
}

function getDashboardOrderStatus(order: OrderRow, products: DashboardProductRow[]): DashboardStatus {
  const fallbackStatus = mapDashboardOrderStatus(products);
  const projectedStatus = getProjectedOrderStatus(order, fallbackStatus) as DashboardStatus;
  if (projectedStatus === 'pending' && products.some((product) => product.status === 'in_progress')) {
    return 'in_progress';
  }
  return projectedStatus;
}

function getStoredDashboardCheckpoints(order: OrderRow) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return [];
  const checkpoints = (raw as { order_checkpoints?: unknown }).order_checkpoints;
  if (!Array.isArray(checkpoints)) return [];

  return checkpoints
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as StoredCheckpoint;
      return {
        checkpointId: String(row.checkpointId || '').trim(),
        productId: String(row.productId || '').trim(),
        productName: String(row.productName || '').trim(),
        deadline: String(row.deadline || '').trim(),
        status: (row.status || 'not_started') as DashboardStatus,
        note: String(row.note || '').trim(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function buildDefaultDashboardCheckpoints(order: OrderRow, products: DashboardProductRow[]) {
  return products.map((product, index) => ({
    checkpointId: `${order.id}_CP${String(index + 1).padStart(2, '0')}`,
    orderId: order.id,
    productId: product.productId,
    productName: product.productName,
    deadline: product.deadline || order.deadline || '',
    status: product.status,
    note: '',
  }));
}

function mergeDashboardCheckpoints(order: OrderRow, products: DashboardProductRow[]) {
  const defaults = buildDefaultDashboardCheckpoints(order, products);
  const stored = getStoredDashboardCheckpoints(order);
  const byId = new Map(defaults.map((item) => [item.checkpointId, item]));

  for (const item of stored) {
    if (!item.checkpointId) continue;
    const current = byId.get(item.checkpointId);
    if (current) {
      byId.set(item.checkpointId, {
        ...current,
        productId: item.productId || current.productId,
        productName: item.productName || current.productName,
        deadline: item.deadline || current.deadline,
        status: current.status,
        note: item.note || current.note,
      });
      continue;
    }

    byId.set(item.checkpointId, {
      checkpointId: item.checkpointId,
      orderId: order.id,
      productId: item.productId || '',
      productName: item.productName || 'Checkpoint bo sung',
      deadline: item.deadline || order.deadline || '',
      status: item.status || 'not_started',
      note: item.note || '',
    });
  }

  return [...byId.values()];
}

function buildDashboardOrderRows(orders: OrderRow[], products: ProductRow[], tasks: TaskRow[]) {
  const productsByOrder = products.reduce<Map<string, ProductRow[]>>((acc, product) => {
    const bucket = acc.get(product.order_id) || [];
    bucket.push(product);
    acc.set(product.order_id, bucket);
    return acc;
  }, new Map());

  const tasksByProduct = tasks.reduce<Map<string, TaskRow[]>>((acc, task) => {
    const bucket = acc.get(task.product_id) || [];
    bucket.push(task);
    acc.set(task.product_id, bucket);
    return acc;
  }, new Map());

    return orders.map((order) => {
      const productOverrides = readProductPlanOverrides(order);
      const orderProducts = (productsByOrder.get(order.id) || []).map((product) => {
        const productTasks = (tasksByProduct.get(product.id) || []).slice().sort((a, b) => Number(a.stage_index) - Number(b.stage_index));
        const override = productOverrides[product.id];
        const computedStatus = mapDashboardProductStatus(product, order, productTasks);
        const inferredStageCode = getCurrentStageCodeForProduct(inferProductWorkflowModule(product.id, order.module), product.current_stage_index);
        const latestTaskOwner = productTasks
          .slice()
          .sort((a, b) => Number(b.stage_index) - Number(a.stage_index))
          .find((item) => item.assignee_profile_id || item.assignee);
        const projectedDeadline = getProjectedProductDeadline(order, product.id, override?.deadline || productTasks[productTasks.length - 1]?.due_date || order.deadline || '') || '';
        return {
          productId: product.id,
          productName: product.name,
          deadline: projectedDeadline,
          status: resolveSummaryWorkflowStatus(resolveDashboardProductStatus(override?.status, computedStatus), projectedDeadline) as DashboardStatus,
          assigneeProfileId: override?.assigneeProfileId || latestTaskOwner?.assignee_profile_id || null,
          assigneeName: override?.assigneeName || latestTaskOwner?.assignee || '',
          currentStageCode: override?.currentStageCode || inferredStageCode,
        } satisfies DashboardProductRow;
      });

    return {
      orderId: order.id,
      orderCode: getDisplayOrderCode(order),
      orderName: order.title || '-',
      orderType: mapDashboardOrderType(order),
      customer: mapDashboardCustomer(order),
      productCount: orderProducts.length,
      deadline: order.deadline || '',
      status: getDashboardOrderStatus(order, orderProducts),
      pmNote: String(order.intake_note || '').trim(),
      products: orderProducts,
      checkpoints: mergeDashboardCheckpoints(order, orderProducts),
    } satisfies DashboardOrderRow;
  });
}

type DetailActionCase = 'unassigned' | 'assigned_not_started' | 'assigned_overdue' | 'assigned_near_due' | 'normal';

type DashboardDetailRow = {
  productId: string;
  productName: string;
  currentStageCode: string;
  stageCodeDisplay: string;
  deadline: string;
  stageStatus: DashboardStatus;
  alertText: string;
  alertTone: 'danger' | 'warning' | 'neutral' | 'success';
  assignmentText: string;
  assignmentAssigneeId: string;
  assignmentAssigneeName: string;
  actionLabel: string;
  actionCase: DetailActionCase;
};

function getCurrentStageCodeForProduct(module: string, stageIndex: number) {
  const prefix = module === 'VIDEO' ? 'VSMF' : module === 'GAME' ? 'GSMF' : 'SMF';
  const maxStage = module === 'VIDEO' ? 7 : module === 'GAME' ? 4 : 8;
  const normalized = Math.max(1, Math.min(stageIndex + 1, maxStage));
  return `${prefix}-${String(normalized).padStart(2, '0')}`;
}

function parseStageIndexFromCode(stageCode: string) {
  const match = String(stageCode || '').trim().match(/^(?:SMF|VSMF|GSMF|CP)-?(\d{2})$/i);
  if (!match) return null;
  const stageIndex = Number(match[1]) - 1;
  return Number.isInteger(stageIndex) && stageIndex >= 0 ? stageIndex : null;
}

function buildDashboardDetailRowsForOrder(input: {
  order: DashboardOrderRow;
  sourceOrder: OrderRow | null;
  products: ProductRow[];
  tasks: TaskRow[];
}) {
  const savedAssignments = input.sourceOrder ? readTrackingAssignments(input.sourceOrder) : {};
  const productSourceMap = new Map(input.products.map((item) => [item.id, item]));
  const taskByProduct = input.tasks.reduce<Map<string, TaskRow[]>>((acc, task) => {
    const bucket = acc.get(task.product_id) || [];
    bucket.push(task);
    acc.set(task.product_id, bucket);
    return acc;
  }, new Map());

  const now = Date.now();
  return input.order.products.map((item) => {
    const sourceProduct = productSourceMap.get(item.productId) || null;
    const module = sourceProduct ? inferProductWorkflowModule(sourceProduct.id, input.sourceOrder?.module || null) : 'ELN';
    const currentStageCode = item.currentStageCode || (sourceProduct ? getCurrentStageCodeForProduct(module, sourceProduct.current_stage_index) : 'SMF-01');
    const stageCodeDisplay = currentStageCode.replace('-', '_');
    const checkpointCode = checkpointCodeFromStageIndex(sourceProduct?.current_stage_index || 0);
    const assignment =
      savedAssignments[assignmentKey(item.productId, currentStageCode)] ||
      savedAssignments[assignmentKey(item.productId, checkpointCode)] ||
      null;

    const currentStageTasks = (taskByProduct.get(item.productId) || []).filter((task) => Number(task.stage_index) === (sourceProduct?.current_stage_index || 0));
    const currentTask = currentStageTasks[0] || null;
    const fallbackStatus = currentTask ? mapDashboardTaskStatus(currentTask, item.deadline) : item.status;
    const stageStatus = assignment?.plannedDeadline ? mapDashboardTaskStatus({ ...(currentTask || ({} as TaskRow)), status: currentTask?.status || 'todo', due_date: assignment.plannedDeadline } as TaskRow, assignment.plannedDeadline) : fallbackStatus;

    const deadlineRaw = assignment?.plannedDeadline || currentTask?.due_date || item.deadline || input.order.deadline || '';
    const deadline = parseDashboardDate(deadlineRaw);
    const assigneeName = String(assignment?.assigneeName || '').trim();
    const assigneeId = assignment?.assigneeProfileId || '';
    const hasAssignee = Boolean(assigneeName);

    let alertText = '🟢 Binh thuong';
    let alertTone: DashboardDetailRow['alertTone'] = 'success';
    if (!deadline) {
      alertText = '⚪ Cho bat dau';
      alertTone = 'neutral';
    } else {
      const diffMs = deadline.getTime() - now;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24));
      if (diffMs < 0 && stageStatus !== 'completed') {
        alertText = `🔴 Quá hạn (${diffDays} ngày)`;
        alertTone = 'danger';
      } else if (diffHours >= 0 && diffHours <= 48 && stageStatus !== 'completed') {
        alertText = `🟡 Sắp đến hạn (Còn ${Math.max(diffHours, 1)}h)`;
        alertTone = 'warning';
      } else if (stageStatus === 'not_started' && !hasAssignee) {
        alertText = '⚪ Cho bat dau';
        alertTone = 'neutral';
      }
    }

    let assignmentText = 'Chưa có';
    let actionCase: DetailActionCase = 'unassigned';
    let actionLabel = 'Giao việc';
    actionCase = resolveActionCaseByDeadline({
      hasAssignee,
      deadline: deadlineRaw,
      baseStatus: stageStatus,
    });
    if (hasAssignee) {
      if (actionCase === 'assigned_overdue') {
        assignmentText = `@${assigneeName}`;
        actionLabel = 'Thúc giục';
      } else if (actionCase === 'assigned_not_started') {
        assignmentText = `@${assigneeName}`;
        actionLabel = 'Kiểm tra';
      } else if (actionCase === 'assigned_near_due') {
        assignmentText = `@${assigneeName}`;
        actionLabel = 'Hỗ trợ';
      } else {
        assignmentText = `@${assigneeName}`;
        actionLabel = 'Xem';
      }
    } else {
      actionLabel = 'Phân công';
    }

    return {
      productId: item.productId,
      productName: item.productName,
      currentStageCode,
      stageCodeDisplay,
      deadline: deadlineRaw,
      stageStatus,
      alertText: stripHtmlTags(alertText),
      alertTone,
      assignmentText,
      assignmentAssigneeId: assigneeId,
      assignmentAssigneeName: assigneeName,
      actionLabel,
      actionCase,
    } satisfies DashboardDetailRow;
  });
}

export function RealDashboardPage() {
  const { profile, refreshProfile } = useAuth();
  const { role: shellRole } = useAppShell();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'dashboard-orders'], queryFn: () => listTasks() });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'dashboard-orders'], queryFn: listProfiles });
  const orders = ordersQuery.data?.orders || [];
  const products = ordersQuery.data?.products || [];
  const tasks = tasksQuery.data || [];
  const profiles = (profilesQuery.data || []) as ProfileRow[];
  const effectiveRole = normalizeAppRole(profile?.role || shellRole);
  const canManageOrders = canEditOrderManagement(effectiveRole);

  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newProductDeadline, setNewProductDeadline] = useState('');
  const [newProductNote, setNewProductNote] = useState('');
  const [selectedDetailProductId, setSelectedDetailProductId] = useState('');
  const [quickAssigneeProfileId, setQuickAssigneeProfileId] = useState('');
  const [quickDeadline, setQuickDeadline] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [quickMessage, setQuickMessage] = useState('');
  const [deadlineMessage, setDeadlineMessage] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [showCreateOrderModal, setShowCreateOrderModal] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createOrderCode, setCreateOrderCode] = useState('');
  const [createClientName, setCreateClientName] = useState('');
  const [createProjectCode, setCreateProjectCode] = useState('');
  const [createPriority, setCreatePriority] = useState<'Cao' | 'Trung bình' | 'Thấp'>('Trung bình');
  const [createOrderType, setCreateOrderType] = useState<'E' | 'H' | 'G' | 'M'>('H');
  const [createDeadline, setCreateDeadline] = useState(new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10));
  const [createPlannedProductCount, setCreatePlannedProductCount] = useState('1');
  const [createIntakeNote, setCreateIntakeNote] = useState('');
  const [createOrderMessage, setCreateOrderMessage] = useState('');
  const [editingCheckpointProductId, setEditingCheckpointProductId] = useState('');
  const [checkpointProductDrafts, setCheckpointProductDrafts] = useState<Record<string, CheckpointProductDraft>>({});
  const [editOrderCode, setEditOrderCode] = useState('');
  const [editOrderTitle, setEditOrderTitle] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [editProjectCode, setEditProjectCode] = useState('');
  const [editOrderType, setEditOrderType] = useState<'E' | 'H' | 'G' | 'M'>('H');
  const [editDeadline, setEditDeadline] = useState('');
  const [editIntakeNote, setEditIntakeNote] = useState('');
  const [editOrderMessage, setEditOrderMessage] = useState('');
  const [orderFilterKeyword, setOrderFilterKeyword] = useState('');
  const [orderFilterType, setOrderFilterType] = useState<'all' | DashboardOrderType>('all');
  const [orderFilterStatus, setOrderFilterStatus] = useState<'all' | DashboardStatus>('all');

  const orderRows = useMemo(() => buildDashboardOrderRows(orders, products, tasks), [orders, products, tasks]);
  const filteredOrderRows = useMemo(() => {
    const keyword = normalizeUtf8Text(orderFilterKeyword).toLowerCase();
    return orderRows.filter((row) => {
      const matchesKeyword = !keyword || [row.orderCode, row.orderName, row.customer]
        .some((value) => normalizeUtf8Text(String(value || '')).toLowerCase().includes(keyword));
      const matchesType = orderFilterType === 'all' || row.orderType === orderFilterType;
      const matchesStatus = orderFilterStatus === 'all' || row.status === orderFilterStatus;
      return matchesKeyword && matchesType && matchesStatus;
    });
  }, [orderFilterKeyword, orderFilterStatus, orderFilterType, orderRows]);
  const normalizedCreateOrderCode = useMemo(() => normalizeDisplayOrderCode(createOrderCode), [createOrderCode]);
  const selectedOrder = orderRows.find((item) => item.orderId === selectedOrderId) || null;
  const selectedSourceOrder = orders.find((item) => item.id === selectedOrderId) || null;
  const assigneeOptions = useMemo(
    () =>
      profiles
        .filter((profile) => profile.active && !['client', 'client_director'].includes(String(profile.role || '')))
        .map((profile) => ({
          id: profile.id,
          label: normalizeUtf8Text(profile.full_name || profile.email || profile.id),
          email: profile.email || null,
          accountId: profile.auth_user_id || null,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [profiles],
  );

  const detailRows = useMemo(() => {
    if (!selectedOrder) return [] as DashboardDetailRow[];
    return buildDashboardDetailRowsForOrder({
      order: selectedOrder,
      sourceOrder: selectedSourceOrder,
      products: products.filter((item) => item.order_id === selectedOrder.orderId),
      tasks: tasks.filter((item) => item.order_id === selectedOrder.orderId),
    });
  }, [products, selectedOrder, selectedSourceOrder, tasks]);

  const selectedDetail = detailRows.find((item) => item.productId === selectedDetailProductId) || null;
  const nextProductCode = useMemo(
    () => (selectedOrder ? buildNextProductCode(selectedOrder.orderCode, selectedOrder.products) : ''),
    [selectedOrder],
  );
  const selectedOrderProductCodeMap = useMemo(
    () => {
      if (!selectedOrder) return new Map<string, string>();
      const map = buildDisplayProductCodeMap(selectedOrder.orderCode, selectedOrder.products);
      const overrides = readProductPlanOverrides(selectedSourceOrder);
      for (const product of selectedOrder.products) {
        const displayProductCode = normalizeOrderCodeFragment(overrides[product.productId]?.displayProductCode || '');
        if (displayProductCode) map.set(product.productId, displayProductCode);
      }
      return map;
    },
    [selectedOrder, selectedSourceOrder],
  );
  const selectedOrderProducts = useMemo(
    () => (selectedOrder ? products.filter((item) => item.order_id === selectedOrder.orderId) : []),
    [products, selectedOrder],
  );
  const selectedOrderProductNameMap = useMemo(
    () => new Map(selectedOrderProducts.map((product) => [product.id, normalizeUtf8Text(product.name || '')])),
    [selectedOrderProducts],
  );

  const kpi = useMemo(() => {
    const totalProducts = orderRows.reduce((sum, row) => sum + row.productCount, 0);
    return {
      totalOrders: orderRows.length,
      totalProducts,
    };
  }, [orderRows]);

  const allVisibleOrderIds = useMemo(() => filteredOrderRows.map((item) => item.orderId), [filteredOrderRows]);
  const selectedVisibleCount = useMemo(
    () => allVisibleOrderIds.filter((id) => selectedOrderIds.includes(id)).length,
    [allVisibleOrderIds, selectedOrderIds],
  );
  const allVisibleSelected = allVisibleOrderIds.length > 0 && selectedVisibleCount === allVisibleOrderIds.length;
  const hasPartialSelection = selectedVisibleCount > 0 && !allVisibleSelected;

  function showDeadlineExceededPopup() {
    pushToast({ title: 'Vượt quá ngày hoàn thành đơn hàng', tone: 'danger', durationMs: 4200 });
  }

  function handleNewProductDeadlineChange(value: string) {
    if (selectedOrder && isAfterOrderDeadline(value, selectedOrder.deadline)) {
      showDeadlineExceededPopup();
      return;
    }
    setNewProductDeadline(value);
  }

  function handleQuickDeadlineChange(value: string) {
    if (selectedOrder && isAfterOrderDeadline(value, selectedOrder.deadline)) {
      showDeadlineExceededPopup();
      return;
    }
    setQuickDeadline(value);
  }

  const createOrderProductMutation = useMutation({
    mutationFn: async (payload: {
      orderId: string;
      fallbackModule?: string | null;
      ownerProfileId?: string | null;
      productCode: string;
      productName: string;
      deadline: string;
      note: string;
    }) => {
      const order = orders.find((item) => item.id === payload.orderId);
      if (!order) throw new Error('Không tìm thấy đơn hàng để tạo sản phẩm.');

      if (isAfterOrderDeadline(payload.deadline, order.deadline)) {
        throw new Error('Deadline sản phẩm không được sau deadline của đơn hàng.');
      }

      const createdProduct = await createOrderProduct({
        orderId: payload.orderId,
        productCode: payload.productCode,
        productName: payload.productName,
        fallbackModule: payload.fallbackModule,
        dueDate: payload.deadline || null,
        ownerProfileId: payload.ownerProfileId || null,
      });

      const base = order.stage_sla_overrides && typeof order.stage_sla_overrides === 'object' ? order.stage_sla_overrides : {};
      const currentProductOverrides = readProductPlanOverrides(order);
      await updateOrder(payload.orderId, {
        stage_sla_overrides: {
          ...base,
          production_plan_products: {
            ...currentProductOverrides,
            [createdProduct.id]: {
              ...(currentProductOverrides[createdProduct.id] || { productId: createdProduct.id }),
              productId: createdProduct.id,
              status: 'not_started',
              startDate: '',
              deadline: payload.deadline || order.deadline || '',
              note: sanitizeMultilineNote(payload.note),
              assigneeProfileId: null,
              assigneeName: '',
              currentStageCode: '',
              updatedAt: new Date().toISOString(),
            },
          },
        },
      });

      return createdProduct;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks', 'dashboard-orders'] }),
      ]);
      setNewProductName('');
      setNewProductDeadline('');
      setNewProductNote('');
      setDeadlineMessage('Đã tạo sản phẩm mới và đưa vào kế hoạch sản xuất.');
    },
    onError: (error) => {
      setDeadlineMessage(error instanceof Error ? error.message : 'Không tạo được sản phẩm mới.');
    },
  });

  const saveOrderInfoMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSourceOrder) throw new Error('Không tìm thấy đơn hàng để cập nhật.');
      if (!canManageOrders) throw new Error('Bạn không có quyền cập nhật đơn hàng.');
      const normalizedOrderCode = normalizeDisplayOrderCode(editOrderCode);
      if (!normalizedOrderCode) throw new Error('Vui lòng nhập mã đơn hàng.');
      if (!normalizeUtf8Text(editOrderTitle)) throw new Error('Vui lòng nhập tên đơn hàng.');
      if (!normalizeUtf8Text(editClientName)) throw new Error('Vui lòng nhập khách hàng.');
      if (!editDeadline) throw new Error('Vui lòng chọn hạn hoàn thành.');
      const base = selectedSourceOrder.stage_sla_overrides && typeof selectedSourceOrder.stage_sla_overrides === 'object' ? selectedSourceOrder.stage_sla_overrides : {};
      const currentOrderMeta = readOrderMeta(selectedSourceOrder);
      await updateOrder(selectedSourceOrder.id, {
        title: normalizeUtf8Text(editOrderTitle),
        client: normalizeUtf8Text(editClientName),
        deadline: editDeadline,
        module: getOrderModuleLabelFromType(editOrderType),
        intake_note: sanitizeMultilineNote(editIntakeNote),
        stage_sla_overrides: {
          ...base,
          order_meta: {
            ...currentOrderMeta,
            utf8_guard: 'nfc-v1',
            display_order_code: normalizedOrderCode,
            project_code: normalizeOrderCodeFragment(editProjectCode),
            customer: normalizeUtf8Text(editClientName),
            order_type: editOrderType,
            updatedAt: new Date().toISOString(),
          },
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditOrderMessage('Đã cập nhật thông tin đơn hàng.');
    },
    onError: (error) => {
      setEditOrderMessage(error instanceof Error ? error.message : 'Không cập nhật được thông tin đơn hàng.');
    },
  });

  const saveCheckpointProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      if (!selectedSourceOrder || !selectedOrder) throw new Error('Không tìm thấy đơn hàng để cập nhật.');
      const draft = checkpointProductDrafts[productId];
      if (!draft) throw new Error('Không có thay đổi để lưu.');
      const nextProductCode = normalizeOrderCodeFragment(draft.productCode);
      const nextName = normalizeUtf8Text(draft.productName);
      const nextDeadline = normalizeDateInput(draft.deadline);
      if (!nextProductCode) throw new Error('Vui lòng nhập mã sản phẩm.');
      if (!nextName) throw new Error('Vui lòng nhập tên sản phẩm.');
      if (!nextDeadline) throw new Error('Vui lòng chọn deadline sản phẩm.');
      if (isAfterOrderDeadline(nextDeadline, selectedOrder.deadline)) {
        throw new Error('Deadline sản phẩm không được sau deadline của đơn hàng.');
      }

      const duplicate = selectedOrder.products.some((product) => {
        if (product.productId === productId) return false;
        return normalizeOrderCodeFragment(selectedOrderProductCodeMap.get(product.productId) || product.productId) === nextProductCode;
      });
      if (duplicate) throw new Error('Mã sản phẩm đã tồn tại trong đơn hàng này.');

      const base = selectedSourceOrder.stage_sla_overrides && typeof selectedSourceOrder.stage_sla_overrides === 'object' ? selectedSourceOrder.stage_sla_overrides : {};
      const currentProductOverrides = readProductPlanOverrides(selectedSourceOrder);
      const currentTracking = readTrackingAssignments(selectedSourceOrder);
      const currentCheckpoints = getStoredDashboardCheckpoints(selectedSourceOrder);
      const updatedAt = new Date().toISOString();
      const nextTracking = Object.fromEntries(
        Object.entries(currentTracking).map(([key, value]) => [
          key,
          value.productId === productId ? { ...value, plannedDeadline: nextDeadline, updatedAt } : value,
        ]),
      ) as Record<string, AssignmentRecord>;
      const nextStoredCheckpoints = currentCheckpoints.map((checkpoint) =>
        checkpoint.productId === productId
          ? { ...checkpoint, productName: nextName, deadline: nextDeadline }
          : checkpoint,
      );

      await updateProduct(productId, { name: nextName });
      await Promise.all(
        tasks
          .filter((task) => task.product_id === productId && !task.archived)
          .map((task) => updateTask(task.id, { due_date: nextDeadline }, { notifyAssignment: false })),
      );
      await updateOrder(selectedSourceOrder.id, {
        stage_sla_overrides: {
          ...base,
          ...(nextStoredCheckpoints.length ? { order_checkpoints: nextStoredCheckpoints } : {}),
          tracking_assignments: nextTracking,
          production_plan_products: {
            ...currentProductOverrides,
            [productId]: {
              ...(currentProductOverrides[productId] || { productId }),
              productId,
              displayProductCode: nextProductCode,
              deadline: nextDeadline,
              updatedAt,
            },
          },
        },
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks', 'dashboard-orders'] }),
      ]);
      setEditingCheckpointProductId('');
      setCheckpointProductDrafts({});
      setDeadlineMessage('Đã cập nhật sản phẩm.');
    },
    onError: (error) => {
      setDeadlineMessage(error instanceof Error ? error.message : 'Không cập nhật được sản phẩm.');
    },
  });

  const deleteOrderProductMutation = useMutation({
    mutationFn: async (payload: { orderId: string; productId: string }) => {
      await deleteOrderProduct(payload);
    },
    onSuccess: async (_, payload) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks', 'dashboard-orders'] }),
      ]);
      setSelectedDetailProductId((current) => (current === payload.productId ? '' : current));
      setDeadlineMessage('Đã xóa sản phẩm khỏi đơn hàng.');
    },
    onError: (error) => {
      setDeadlineMessage(error instanceof Error ? error.message : 'Không xóa được sản phẩm.');
    },
  });

  const saveQuickAssignmentMutation = useMutation({
    mutationFn: async (payload: {
      orderId: string;
      trackingAssignments: Record<string, AssignmentRecord>;
      productOverrides: Record<string, ProductPlanOverride>;
    }) => {
      const order = orders.find((item) => item.id === payload.orderId);
      if (!order) throw new Error('Không tìm thấy đơn hàng để cập nhật.');
      const base = order.stage_sla_overrides && typeof order.stage_sla_overrides === 'object' ? order.stage_sla_overrides : {};
      await updateOrder(payload.orderId, {
        stage_sla_overrides: {
          ...base,
          tracking_assignments: payload.trackingAssignments,
          production_plan_products: payload.productOverrides,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setQuickMessage('Da cap nhat phan cong/thong tin tien do.');
    },
  });

  const saveOrderDeadlineMutation = useMutation({
    mutationFn: async (payload: { orderId: string; deadline: string }) => {
      await updateOrder(payload.orderId, { deadline: payload.deadline });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      setDeadlineMessage('Đã cập nhật hạn hoàn thành.');
    },
    onError: (error) => {
      setDeadlineMessage(error instanceof Error ? error.message : 'Không cập nhật được hạn hoàn thành.');
    },
  });

  const deleteOrdersMutation = useMutation({
    mutationFn: async (orderIds: string[]) => {
      await Promise.all(orderIds.map((orderId) => deleteOrder(orderId)));
    },
    onSuccess: async (_, orderIds) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['orders'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks', 'dashboard-orders'] }),
      ]);
      setSelectedOrderIds((current) => current.filter((id) => !orderIds.includes(id)));
      setSelectedOrderId((current) => (orderIds.includes(current) ? '' : current));
      setDeadlineMessage(
        orderIds.length === 1 ? 'Đã xóa đơn hàng đã chọn.' : `Đã xóa ${orderIds.length} đơn hàng đã chọn.`,
      );
    },
    onError: (error) => {
      setDeadlineMessage(error instanceof Error ? error.message : 'Không xóa được đơn hàng đã chọn.');
    },
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!canManageOrders) throw new Error('Bạn không có quyền tạo đơn hàng.');
      const activeProfile = await requireActiveProfile(profile, refreshProfile);
      const plannedCount = Math.max(0, Math.floor(Number(createPlannedProductCount || 0)));
      return createClientOrder({
        title: normalizeUtf8Text(createTitle),
        deadline: createDeadline,
        client: normalizeUtf8Text(createClientName || activeProfile.fullName),
        companyId: activeProfile.companyId,
        createdByProfileId: activeProfile.id,
        bundleCounts: { eln: 0, video: 0, game: 0 },
        plannedProductCount: plannedCount,
        intakeNote: sanitizeMultilineNote(createIntakeNote),
        status: 'submitted',
        orderMeta: {
          utf8_guard: 'nfc-v1',
          display_order_code: normalizedCreateOrderCode,
          project_code: normalizeOrderCodeFragment(createProjectCode),
          priority: createPriority,
          order_type: createOrderType,
          total_products: plannedCount,
        },
      });
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCreateOrderMessage(`Đã tạo đơn hàng ${data.orderId}.`);
      setCreateTitle('');
      setCreateOrderCode('');
      setCreateClientName('');
      setCreateProjectCode('');
      setCreatePriority('Trung bình');
      setCreateOrderType('H');
      setCreateDeadline(new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10));
      setCreatePlannedProductCount('1');
      setCreateIntakeNote('');
      setShowCreateOrderModal(false);
    },
    onError: (error) => {
      setCreateOrderMessage(error instanceof Error ? error.message : 'Không tạo được đơn hàng.');
    },
  });

  function handleCreateOrderProduct() {
    if (!selectedOrder || !selectedSourceOrder) return;
    if (!normalizeUtf8Text(nextProductCode)) {
      setDeadlineMessage('Không tạo được mã sản phẩm tự động.');
      return;
    }
    if (!normalizeUtf8Text(newProductName)) {
      setDeadlineMessage('Vui lòng nhập tên sản phẩm.');
      return;
    }
    const productDeadline = newProductDeadline || selectedOrder.deadline || '';
    if (isAfterOrderDeadline(productDeadline, selectedOrder.deadline)) {
      showDeadlineExceededPopup();
      return;
    }
    setDeadlineMessage('');

    createOrderProductMutation.mutate({
      orderId: selectedOrder.orderId,
      fallbackModule: selectedSourceOrder.module,
      ownerProfileId: selectedSourceOrder.created_by_profile_id || null,
      productCode: nextProductCode,
      productName: newProductName,
      deadline: productDeadline,
      note: newProductNote,
    });
  }

  function handleDeleteOrderProduct(productId: string, productName: string) {
    if (!selectedOrder || deleteOrderProductMutation.isPending) return;
    const label = productName || selectedOrderProductCodeMap.get(productId) || productId;
    if (!window.confirm(`Xóa sản phẩm "${label}" khỏi đơn hàng này? Đơn hàng vẫn được giữ lại.`)) return;
    setDeadlineMessage('');
    deleteOrderProductMutation.mutate({ orderId: selectedOrder.orderId, productId });
  }

  function handleQuickAssignCurrentStep() {
    if (!selectedOrder || !selectedSourceOrder || !selectedDetail) return;
    if (!quickAssigneeProfileId) {
      setQuickMessage('Vui lòng chọn người thực hiện.');
      return;
    }
    const assignee = assigneeOptions.find((item) => item.id === quickAssigneeProfileId);
    if (!assignee) return;
    const nextDeadline = quickDeadline || selectedDetail.deadline || selectedOrder.deadline || '';
    if (isAfterOrderDeadline(nextDeadline, selectedOrder.deadline)) {
      showDeadlineExceededPopup();
      return;
    }

    const current = readTrackingAssignments(selectedSourceOrder);
    const currentProductOverrides = readProductPlanOverrides(selectedSourceOrder);
    const key = assignmentKey(selectedDetail.productId, selectedDetail.currentStageCode);
    const next: AssignmentRecord = {
      productId: selectedDetail.productId,
      stageCode: selectedDetail.currentStageCode,
      assigneeProfileId: assignee.id,
      assigneeEmail: assignee.email || null,
      assigneeName: assignee.label,
      plannedDeadline: nextDeadline,
      note: sanitizeMultilineNote(quickNote),
      notificationState: 'pending',
      updatedAt: new Date().toISOString(),
    };

    saveQuickAssignmentMutation.mutate({
      orderId: selectedOrder.orderId,
      trackingAssignments: {
        ...current,
        [key]: next,
      },
      productOverrides: {
        ...currentProductOverrides,
        [selectedDetail.productId]: {
          ...(currentProductOverrides[selectedDetail.productId] || { productId: selectedDetail.productId }),
          productId: selectedDetail.productId,
          assigneeProfileId: assignee.id,
          assigneeName: assignee.label,
          deadline: nextDeadline,
          status: selectedDetail.stageStatus === 'not_started' ? 'in_progress' : selectedDetail.stageStatus,
          currentStageCode: selectedDetail.currentStageCode,
          updatedAt: new Date().toISOString(),
        },
      },
    }, {
      onSuccess: async () => {
        const stageIndex = parseStageIndexFromCode(selectedDetail.currentStageCode);
        const assigneeTask =
          stageIndex === null
            ? null
            : await ensureTaskForStage({
                orderId: selectedOrder.orderId,
                productId: selectedDetail.productId,
                stageIndex,
                existingTasks: tasks,
                dueDate: next.plannedDeadline || null,
                assignee: assignee.label,
                assigneeProfileId: assignee.id,
                assigneeAccountId: assignee.accountId || null,
                notifyAssignment: false,
              });
        if (assigneeTask?.id) {
          await updateTask(
            assigneeTask.id,
            {
              due_date: next.plannedDeadline || null,
              assignee: assignee.label,
              assignee_profile_id: assignee.id,
              assignee_account_id: assignee.accountId || null,
            },
            { notifyAssignment: false },
          );
        }
        void createNotification({
          level: 'info',
          title: `Bạn được giao ${selectedDetail.currentStageCode}`,
          body: `Thuộc sản phẩm ${selectedDetail.productId}. Vui lòng kiểm tra.`,
          linkPage: 'my-tasks',
          recipientProfileId: assignee.id,
          recipientAccountId: assignee.accountId || null,
          eventKey: `${selectedDetail.productId}:${selectedDetail.currentStageCode}:assigned:${assignee.id}`,
          metadata: {
            order_id: selectedOrder.orderId,
            product_id: selectedDetail.productId,
            task_id: assigneeTask?.id || null,
            stage_index: stageIndex,
            stage_code: selectedDetail.currentStageCode,
            assignee_profile_id: assignee.id,
            assignee_account_id: assignee.accountId || null,
            assignee_email: assignee.email || null,
            planned_deadline: next.plannedDeadline || null,
          },
        });
        void createActivityLog({
          actorProfileId: profile?.id || null,
          actionType: 'workflow_step_assigned',
          objectType: 'product',
          objectId: selectedDetail.productId,
          summary: `${selectedDetail.productId} được giao ${selectedDetail.currentStageCode} cho ${assignee.label}.`,
          metadata: {
            order_id: selectedOrder.orderId,
            product_id: selectedDetail.productId,
            task_id: assigneeTask?.id || null,
            stage_index: stageIndex,
            stage_code: selectedDetail.currentStageCode,
            assignee_profile_id: assignee.id,
            assignee_account_id: assignee.accountId || null,
            assignee_email: assignee.email || null,
            assignee_name: assignee.label,
            planned_deadline: next.plannedDeadline || null,
            note: next.note || null,
          },
        }).then(() => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        });
      },
    });
  }

  function handleOrderDeadlineChange(orderId: string, currentDeadline: string, nextDeadline: string) {
    const next = String(nextDeadline || '').slice(0, 10);
    const current = String(currentDeadline || '').slice(0, 10);
    if (!next) return;
    if (next === current) return;
    saveOrderDeadlineMutation.mutate({ orderId, deadline: next });
  }

  function handleToggleOrderSelection(orderId: string, checked: boolean) {
    setSelectedOrderIds((current) => {
      if (checked) return current.includes(orderId) ? current : [...current, orderId];
      return current.filter((id) => id !== orderId);
    });
  }

  function handleToggleSelectAll(checked: boolean) {
    setSelectedOrderIds((current) => {
      if (checked) {
        const next = new Set([...current, ...allVisibleOrderIds]);
        return [...next];
      }
      return current.filter((id) => !allVisibleOrderIds.includes(id));
    });
  }

  function handleDeleteSelectedOrders() {
    if (!selectedVisibleCount || deleteOrdersMutation.isPending) return;
    const confirmed = window.confirm(
      selectedVisibleCount === 1
        ? 'Bạn có chắc muốn xóa đơn hàng đã chọn không?'
        : `Bạn có chắc muốn xóa ${selectedVisibleCount} đơn hàng đã chọn không?`,
    );
    if (!confirmed) return;
    void deleteOrdersMutation.mutateAsync(allVisibleOrderIds.filter((id) => selectedOrderIds.includes(id)));
  }

  useEffect(() => {
    setSelectedOrderIds((current) => current.filter((id) => allVisibleOrderIds.includes(id)));
  }, [allVisibleOrderIds]);

  useEffect(() => {
    setCheckpointProductDrafts({});
    setEditingCheckpointProductId('');
  }, [selectedOrderId, selectedOrderProducts]);

  useEffect(() => {
    if (!selectedSourceOrder) {
      setEditOrderCode('');
      setEditOrderTitle('');
      setEditClientName('');
      setEditProjectCode('');
      setEditOrderType('H');
      setEditDeadline('');
      setEditIntakeNote('');
      setEditOrderMessage('');
      return;
    }
    const meta = readOrderMeta(selectedSourceOrder);
    setEditOrderCode(getDisplayOrderCode(selectedSourceOrder));
    setEditOrderTitle(normalizeUtf8Text(selectedSourceOrder.title || ''));
    setEditClientName(normalizeUtf8Text(String(meta.customer || selectedSourceOrder.client || '')));
    setEditProjectCode(normalizeUtf8Text(String(meta.project_code || '')));
    setEditOrderType(mapDashboardOrderType(selectedSourceOrder));
    setEditDeadline(String(selectedSourceOrder.deadline || '').slice(0, 10));
    setEditIntakeNote(String(selectedSourceOrder.intake_note || ''));
    setEditOrderMessage('');
  }, [selectedSourceOrder]);

  const modalActionCase: DetailActionCase = selectedDetail
    ? resolveActionCaseByDeadline({
        hasAssignee: Boolean((quickAssigneeProfileId || selectedDetail.assignmentAssigneeId || '').trim()),
        deadline: quickDeadline || selectedDetail.deadline || '',
        baseStatus: selectedDetail.stageStatus,
      })
    : 'normal';

  if (selectedOrder) {
    return (
      <div className="overview-compact overview-orders">
        <SectionHeader
          eye="PeopleOne / Quản lý đơn hàng"
          title=""
          subtitle="Xem danh sách sản phẩm, checking point và ghi chú PM trong đơn hàng."
          actions={<button className="btn btn-ghost" onClick={() => setSelectedOrderId('')}> Quay lại danh sách đơn hàng</button>}
        />

        <div className="kpi-row small">
          <Kpi label="Mã đơn hàng" value={selectedOrder.orderCode} sub={selectedOrder.customer} tone="neutral" />
          <Kpi label="Số sản phẩm" value={String(selectedOrder.productCount)} sub="Trong đơn hàng hiện tại" tone="warning" />
          <Kpi label="Hạn hoàn thành" value={formatDashboardDate(selectedOrder.deadline)} sub="Theo đơn hàng" tone="violet" />
          <Kpi label="Trạng thái" value={DASHBOARD_STATUS_LABEL[selectedOrder.status]} sub="Tổng hợp theo sản phẩm" tone={DASHBOARD_STATUS_TONE[selectedOrder.status]} />
        </div>

        {canManageOrders ? (
          <Card title="Sửa thông tin đơn hàng">
            <div className="popup-order-form">
              <label>
                <span>Mã đơn hàng</span>
                <input value={editOrderCode} onChange={(event) => setEditOrderCode(normalizeUtf8Text(event.target.value))} />
              </label>
              <label>
                <span>Tên đơn hàng</span>
                <input value={editOrderTitle} onChange={(event) => setEditOrderTitle(event.target.value)} />
              </label>
              <label>
                <span>Khách hàng</span>
                <input value={editClientName} onChange={(event) => setEditClientName(event.target.value)} />
              </label>
              <label>
                <span>Mã dự án</span>
                <input value={editProjectCode} onChange={(event) => setEditProjectCode(normalizeUtf8Text(event.target.value))} />
              </label>
              <label>
                <span>Loại</span>
                <select value={editOrderType} onChange={(event) => setEditOrderType(event.target.value as 'E' | 'H' | 'G' | 'M')}>
                  <option value="E">E</option>
                  <option value="H">H</option>
                  <option value="G">G</option>
                  <option value="M">M</option>
                </select>
              </label>
              <label>
                <span>Hạn hoàn thành</span>
                <input type="date" value={editDeadline} onChange={(event) => setEditDeadline(event.target.value)} />
              </label>
              <label className="full">
                <span>Ghi chú</span>
                <textarea value={editIntakeNote} onChange={(event) => setEditIntakeNote(event.target.value)} />
              </label>
              <div className="action-row">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={() => {
                    setEditOrderMessage('');
                    saveOrderInfoMutation.mutate();
                  }}
                  disabled={saveOrderInfoMutation.isPending || !normalizeDisplayOrderCode(editOrderCode) || !normalizeUtf8Text(editOrderTitle) || !normalizeUtf8Text(editClientName) || !editDeadline}
                >
                  {saveOrderInfoMutation.isPending ? 'Đang lưu...' : 'Lưu thông tin đơn hàng'}
                </button>
              </div>
              {editOrderMessage ? <div className="notice">{editOrderMessage}</div> : null}
            </div>
          </Card>
        ) : null}

        {selectedDetail ? (
          <div className="results-modal-overlay" onClick={() => setSelectedDetailProductId('')}>
            <div className="results-modal-shell production-plan-modal-shell" onClick={(event) => event.stopPropagation()}>
              <div className="results-modal-head">
                <h3>{`Thao tác nhanh - ${selectedDetail.productId}`}</h3>
                <button className="btn btn-ghost" onClick={() => setSelectedDetailProductId('')}>Đóng</button>
              </div>
              <div className="results-modal-body">
                <div className="order-plan-checkpoint-form">
                  <label>
                    <span>Tình huống</span>
                    <input
                      readOnly
                      value={
                        modalActionCase === 'unassigned'
                          ? 'Trường hợp 1: Chưa phân công'
                          : modalActionCase === 'assigned_not_started' || modalActionCase === 'assigned_overdue'
                            ? 'Trường hợp 2: Đã phân công nhưng chậm/chưa thực hiện'
                            : modalActionCase === 'assigned_near_due'
                              ? 'Trường hợp 3: Đang thực hiện và sắp đến hạn'
                              : 'Trường hợp: Bình thường'
                      }
                    />
                  </label>

                  <label>
                    <span>Người thực hiện</span>
                    <select value={quickAssigneeProfileId} onChange={(event) => setQuickAssigneeProfileId(event.target.value)}>
                      <option value="">Chọn người thực hiện</option>
                      {assigneeOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span>Deadline bước hiện tại</span>
                    <input type="date" value={quickDeadline} max={normalizeDateInput(selectedOrder.deadline)} onChange={(event) => handleQuickDeadlineChange(event.target.value)} />
                  </label>

                  <label>
                    <span>Ghi chú PM</span>
                    <input value={quickNote} onChange={(event) => setQuickNote(event.target.value)} placeholder="Ví dụ: Ưu tiên làm trước bước này." />
                  </label>

                  <div className="action-row quick-action-buttons">
                    <button className="btn btn-primary" onClick={handleQuickAssignCurrentStep} disabled={saveQuickAssignmentMutation.isPending}>
                      {saveQuickAssignmentMutation.isPending ? 'Đang cập nhật...' : 'Lưu / Giao việc'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setQuickMessage('Đã gửi thông báo nhắc tiến độ tới người phụ trách.')}>
                      Gửi thông báo
                    </button>
                    <button className="btn btn-ghost" onClick={() => setQuickMessage('Đã mở kiểm tra đầu vào (Storyboard/Slide/Voice/Video).')}>
                      Kiểm tra đầu vào
                    </button>
                  </div>
                </div>

                {quickMessage ? <div className="notice">{quickMessage}</div> : null}
              </div>
            </div>
          </div>
        ) : null}

        <Card title="Checking point">
          <table className="data-table order-plan-table">
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>Deadline</th>
                <th>Trạng thái</th>
                <th>Ghi chú</th>
                {canManageOrders ? <th>Thao tác</th> : null}
              </tr>
            </thead>
            <tbody>
              {selectedOrder.checkpoints.map((checkpoint) => {
                const currentName = selectedOrderProductNameMap.get(checkpoint.productId) || normalizeUtf8Text(checkpoint.productName);
                const currentCode = selectedOrderProductCodeMap.get(checkpoint.productId) || checkpoint.productId;
                const isEditingProduct = editingCheckpointProductId === checkpoint.productId;
                const draft = checkpointProductDrafts[checkpoint.productId] || {
                  productCode: currentCode,
                  productName: currentName,
                  deadline: normalizeDateInput(checkpoint.deadline),
                };
                return (
                  <tr key={checkpoint.checkpointId}>
                    <td>
                      {canManageOrders && isEditingProduct ? (
                        <input
                          className="checkpoint-inline-input"
                          value={draft.productCode}
                          onChange={(event) =>
                            setCheckpointProductDrafts((current) => ({
                              ...current,
                              [checkpoint.productId]: { ...draft, productCode: normalizeOrderCodeFragment(event.target.value) },
                            }))
                          }
                          disabled={saveCheckpointProductMutation.isPending}
                        />
                      ) : currentCode}
                    </td>
                    <td>
                      {canManageOrders && isEditingProduct ? (
                        <input
                          className="checkpoint-inline-input"
                          value={draft.productName}
                          onChange={(event) =>
                            setCheckpointProductDrafts((current) => ({
                              ...current,
                              [checkpoint.productId]: { ...draft, productName: event.target.value },
                            }))
                          }
                          placeholder="Nhập tên sản phẩm..."
                          disabled={saveCheckpointProductMutation.isPending}
                        />
                      ) : currentName || '-'}
                    </td>
                    <td>
                      {canManageOrders && isEditingProduct ? (
                        <input
                          className="checkpoint-inline-input"
                          type="date"
                          value={draft.deadline}
                          max={normalizeDateInput(selectedOrder.deadline)}
                          onChange={(event) =>
                            setCheckpointProductDrafts((current) => ({
                              ...current,
                              [checkpoint.productId]: { ...draft, deadline: event.target.value },
                            }))
                          }
                          disabled={saveCheckpointProductMutation.isPending}
                        />
                      ) : formatDashboardDate(checkpoint.deadline)}
                    </td>
                    <td><Badge tone={DASHBOARD_STATUS_TONE[checkpoint.status]}>{DASHBOARD_STATUS_LABEL[checkpoint.status]}</Badge></td>
                    <td>{checkpoint.note || '-'}</td>
                    {canManageOrders ? (
                      <td className="checkpoint-product-actions">
                        {isEditingProduct ? (
                          <>
                            <button
                              className="btn btn-primary btn-small"
                              onClick={() => saveCheckpointProductMutation.mutate(checkpoint.productId)}
                              disabled={saveCheckpointProductMutation.isPending || !normalizeOrderCodeFragment(draft.productCode) || !normalizeUtf8Text(draft.productName) || !draft.deadline}
                              type="button"
                            >
                              {saveCheckpointProductMutation.isPending ? 'Đang lưu...' : 'Lưu'}
                            </button>
                            <button
                              className="btn btn-ghost btn-small"
                              onClick={() => {
                                setCheckpointProductDrafts((current) => {
                                  const next = { ...current };
                                  delete next[checkpoint.productId];
                                  return next;
                                });
                                setEditingCheckpointProductId('');
                              }}
                              disabled={saveCheckpointProductMutation.isPending}
                              type="button"
                            >
                              Hủy
                            </button>
                          </>
                        ) : (
                          <button
                            className="production-plan-icon-btn"
                            onClick={() => {
                              setCheckpointProductDrafts((current) => ({
                                ...current,
                                [checkpoint.productId]: {
                                  productCode: currentCode,
                                  productName: currentName,
                                  deadline: normalizeDateInput(checkpoint.deadline),
                                },
                              }));
                              setEditingCheckpointProductId(checkpoint.productId);
                            }}
                            disabled={saveCheckpointProductMutation.isPending || deleteOrderProductMutation.isPending}
                            type="button"
                            title={`Sửa ${currentName || checkpoint.productId}`}
                            aria-label={`Sửa ${currentName || checkpoint.productId}`}
                          >
                            <Pencil size={15} strokeWidth={1.9} />
                          </button>
                        )}
                        <button
                          className="btn btn-ghost btn-small"
                          onClick={() => handleDeleteOrderProduct(checkpoint.productId, currentName)}
                          disabled={deleteOrderProductMutation.isPending || createOrderProductMutation.isPending || saveCheckpointProductMutation.isPending}
                          type="button"
                        >
                          {deleteOrderProductMutation.isPending ? 'Đang xóa...' : 'Xóa SP'}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {canManageOrders ? (
          <Card title="Tạo sản phẩm trong đơn hàng">
            <div className="order-plan-checkpoint-form create-order-product-form">
              <label>
                <span>Mã sản phẩm</span>
                <input value={nextProductCode} readOnly placeholder="Tự động theo mã đơn hàng" />
              </label>

              <label>
                <span>Tên sản phẩm</span>
                <input value={newProductName} onChange={(event) => setNewProductName(event.target.value)} placeholder="Nhập tên sản phẩm..." />
              </label>

              <label>
                <span>Deadline</span>
                <input type="date" value={newProductDeadline} max={normalizeDateInput(selectedOrder.deadline)} onChange={(event) => handleNewProductDeadlineChange(event.target.value)} />
              </label>

              <label>
                <span>Ghi chú PM</span>
                <input value={newProductNote} onChange={(event) => setNewProductNote(event.target.value)} placeholder="Ghi chú / note..." />
              </label>

              <div className="action-row">
                <button className="btn btn-primary" onClick={handleCreateOrderProduct} disabled={createOrderProductMutation.isPending || !normalizeUtf8Text(nextProductCode) || !normalizeUtf8Text(newProductName)}>
                  {createOrderProductMutation.isPending ? 'Đang tạo...' : 'Thêm sản phẩm'}
                </button>
              </div>
              {deadlineMessage ? <div className="notice">{deadlineMessage}</div> : null}
            </div>
          </Card>
        ) : null}

        <Card title="Ghi chú đơn hàng từ PM">
          <div className="muted-text">{selectedOrder.pmNote || 'Chưa có ghi chú.'}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="overview-compact overview-orders">
      <div className="kpi-row">
        <Kpi label="Tổng số đơn hàng" value={String(kpi.totalOrders)} tone="danger" />
        <Kpi label="Tổng số sản phẩm" value={String(kpi.totalProducts)} tone="warning" />
      </div>
      <Card
        title="Danh sách đơn hàng"
        action={
          canManageOrders ? <div className="order-bulk-actions">
            <button
              className="btn btn-primary btn-small"
              type="button"
              onClick={() => {
                setCreateOrderMessage('');
                setShowCreateOrderModal(true);
              }}
            >
              Tạo đơn hàng
            </button>
            <button
              className="btn btn-danger btn-small"
              type="button"
              onClick={handleDeleteSelectedOrders}
              disabled={!selectedVisibleCount || deleteOrdersMutation.isPending}
            >
              {deleteOrdersMutation.isPending ? 'Đang xóa...' : `Xóa${selectedVisibleCount ? ` (${selectedVisibleCount})` : ''}`}
            </button>
          </div> : null
        }
      >
        <div className="order-filter-bar">
          <label className="order-filter-search">
            <span>Tìm kiếm</span>
            <input
              type="search"
              value={orderFilterKeyword}
              onChange={(event) => setOrderFilterKeyword(event.target.value)}
              placeholder="Mã đơn, tên đơn, khách hàng..."
            />
          </label>
          <label>
            <span>Loại</span>
            <select value={orderFilterType} onChange={(event) => setOrderFilterType(event.target.value as 'all' | DashboardOrderType)}>
              <option value="all">Tất cả loại</option>
              <option value="H">H</option>
              <option value="E">E</option>
              <option value="G">G</option>
              <option value="M">M</option>
            </select>
          </label>
          <label>
            <span>Trạng thái</span>
            <select value={orderFilterStatus} onChange={(event) => setOrderFilterStatus(event.target.value as 'all' | DashboardStatus)}>
              <option value="all">Tất cả trạng thái</option>
              {(Object.keys(DASHBOARD_STATUS_LABEL) as DashboardStatus[]).map((status) => (
                <option key={status} value={status}>{DASHBOARD_STATUS_LABEL[status]}</option>
              ))}
            </select>
          </label>
          <button
            className="btn btn-ghost btn-small"
            type="button"
            onClick={() => {
              setOrderFilterKeyword('');
              setOrderFilterType('all');
              setOrderFilterStatus('all');
            }}
            disabled={!orderFilterKeyword && orderFilterType === 'all' && orderFilterStatus === 'all'}
          >
            Xóa lọc
          </button>
          <div className="order-filter-count">Hiển thị {filteredOrderRows.length}/{orderRows.length}</div>
        </div>
        <table className="data-table order-plan-table order-plan-table-summary">
          <colgroup>
            <col className="order-summary-col-select" />
            <col className="order-summary-col-code" />
            <col className="order-summary-col-name" />
            <col className="order-summary-col-type" />
            <col className="order-summary-col-customer" />
            <col className="order-summary-col-product-count" />
            <col className="order-summary-col-deadline" />
            <col className="order-summary-col-status" />
            <col className="order-summary-col-detail" />
          </colgroup>
          <thead>
            <tr>
              <th className="order-select-column">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={(input) => {
                    if (input) input.indeterminate = hasPartialSelection;
                  }}
                  onChange={(event) => handleToggleSelectAll(event.target.checked)}
                  disabled={!allVisibleOrderIds.length || deleteOrdersMutation.isPending}
                  aria-label="Chọn tất cả đơn hàng trong bảng"
                />
              </th>
              <th>Mã đơn hàng</th>
              <th>Tên đơn hàng</th>
              <th>Loại</th>
              <th>Khách hàng</th>
              <th>Số sản phẩm</th>
              <th>Hạn hoàn thành</th>
              <th>Trạng thái</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrderRows.length ? filteredOrderRows.map((row) => (
              <tr key={row.orderId}>
                <td className="order-select-column">
                  <input
                    type="checkbox"
                    checked={selectedOrderIds.includes(row.orderId)}
                    onChange={(event) => handleToggleOrderSelection(row.orderId, event.target.checked)}
                    disabled={deleteOrdersMutation.isPending}
                    aria-label={`Chọn đơn hàng ${row.orderCode}`}
                  />
                </td>
                <td>{row.orderCode}</td>
                <td className="order-plan-order-name-cell">{row.orderName}</td>
                <td>{row.orderType}</td>
                <td>{row.customer}</td>
                <td>{row.productCount}</td>
                <td className="order-plan-date-cell">
                  <div className="order-deadline-editor">
                    <div className="order-deadline-controls">
                      <input
                        type="date"
                        value={String(row.deadline || '').slice(0, 10)}
                        onChange={(event) => handleOrderDeadlineChange(row.orderId, row.deadline, event.target.value)}
                        disabled={saveOrderDeadlineMutation.isPending}
                      />
                    </div>
                  </div>
                </td>
                <td className="order-plan-status-cell"><Badge tone={DASHBOARD_STATUS_TONE[row.status]}>{DASHBOARD_STATUS_LABEL[row.status]}</Badge></td>
                <td className="overview-orders-detail-cell order-plan-action-cell">
                  <button
                    className="production-plan-icon-btn"
                    type="button"
                    title={`Xem chi tiết ${row.orderCode}`}
                    aria-label={`Xem chi tiết ${row.orderCode}`}
                    onClick={() => setSelectedOrderId(row.orderId)}
                  >
                    <Eye size={16} strokeWidth={1.9} />
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={9} className="muted-text">Không có đơn hàng phù hợp bộ lọc.</td>
              </tr>
            )}
          </tbody>
        </table>
        {deadlineMessage ? <div className="notice">{deadlineMessage}</div> : null}
      </Card>

      {showCreateOrderModal ? (
        <div className="results-modal-overlay" onClick={() => setShowCreateOrderModal(false)}>
          <div className="results-modal-shell production-plan-modal-shell" onClick={(event) => event.stopPropagation()}>
            <div className="results-modal-head">
              <h3>Tạo đơn hàng</h3>
              <button className="btn btn-ghost" onClick={() => setShowCreateOrderModal(false)}>Đóng</button>
            </div>
            <div className="results-modal-body">
              <div>
                <Card title="Thông tin đơn hàng">
                  <div className="popup-order-form">
                <label>
                  <span>Tên đơn hàng</span>
                  <input
                    value={createTitle}
                    onChange={(event) => setCreateTitle(event.target.value)}
                    placeholder="Sản xuất video học liệu đào tạo CMHV HCMC"
                  />
                </label>

                <label>
                  <span>Mã đơn hàng</span>
                  <input
                    value={createOrderCode}
                    onChange={(event) => setCreateOrderCode(normalizeUtf8Text(event.target.value))}
                    placeholder="HCMC_CMHV_H"
                  />
                </label>

                <label>
                  <span>Khách hàng</span>
                  <input
                    value={createClientName}
                    onChange={(event) => setCreateClientName(event.target.value)}
                    placeholder="HCMC"
                  />
                </label>

                <label>
                  <span>Mã dự án</span>
                  <input
                    value={createProjectCode}
                    onChange={(event) => setCreateProjectCode(normalizeUtf8Text(event.target.value))}
                    placeholder="CMHV"
                  />
                </label>

                <label>
                  <span>Loại</span>
                  <select value={createOrderType} onChange={(event) => setCreateOrderType(event.target.value as 'E' | 'H' | 'G' | 'M')}>
                    <option value="E">E</option>
                    <option value="H">H</option>
                    <option value="G">G</option>
                    <option value="M">M</option>
                  </select>
                </label>

                <label>
                  <span>Mức độ ưu tiên</span>
                  <select value={createPriority} onChange={(event) => setCreatePriority(event.target.value as 'Cao' | 'Trung bình' | 'Thấp')}>
                    <option value="Cao">Cao</option>
                    <option value="Trung bình">Trung bình</option>
                    <option value="Thấp">Thấp</option>
                  </select>
                </label>

                <label>
                  <span>Hạn hoàn thành</span>
                  <input type="date" value={createDeadline} onChange={(event) => setCreateDeadline(event.target.value)} />
                </label>

                <label>
                  <span>Số lượng sản phẩm dự kiến</span>
                  <input
                    type="number"
                    min="0"
                    value={createPlannedProductCount}
                    onChange={(event) => setCreatePlannedProductCount(event.target.value.replace(/[^\d]/g, ''))}
                  />
                </label>

                <label className="full">
                  <span>Ghi chú</span>
                  <textarea
                    value={createIntakeNote}
                    onChange={(event) => setCreateIntakeNote(event.target.value)}
                    placeholder="Ví dụ: đơn sẽ được admin bổ sung sản phẩm sau..."
                  />
                </label>

                <div className="action-row">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      const suggestion = buildOrderCodeSuggestion({
                        title: createTitle,
                        client: createClientName,
                        projectCode: createProjectCode,
                        orderType: createOrderType,
                      });
                      setCreateOrderCode(suggestion);
                    }}
                  >
                    Gợi ý mã đơn
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => {
                      setCreateOrderMessage('');
                      createOrderMutation.mutate();
                    }}
                    disabled={!canManageOrders || !normalizeUtf8Text(createTitle) || !normalizedCreateOrderCode || !createDeadline || !normalizeUtf8Text(createClientName) || createOrderMutation.isPending}
                  >
                    {createOrderMutation.isPending ? 'Đang tạo...' : 'Tạo đơn hàng'}
                  </button>
                </div>
                    {createOrderMessage ? <div className="notice">{createOrderMessage}</div> : null}
                  </div>
                </Card>

              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RealTrackingPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks() });
  const profilesQuery = useQuery({ queryKey: ['profiles'], queryFn: listProfiles });
  const orders = ordersQuery.data?.orders || [];
  const products = ordersQuery.data?.products || [];
  const tasks = tasksQuery.data || [];
  const profiles = (profilesQuery.data || []) as ProfileRow[];
  const [selectedProductId, setSelectedProductId] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  const trackingRows = useMemo(
    () =>
      products.map((product) => {
        const order = orders.find((entry) => entry.id === product.order_id) || null;
        const module = inferProductWorkflowModule(product.id, order?.module);
        const launched = isLaunchedProduct(product.progress, tasks, product.id);
        const activeTasks = tasks.filter((task) => task.product_id === product.id && !task.archived);
        const savedAssignments = order ? readTrackingAssignments(order) : {};
        const latestSaved = Object.values(savedAssignments)
          .filter((item) => item.productId === product.id)
          .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];
        const owner = latestSaved?.assigneeName || activeTasks[0]?.assignee || '-';
        const health = product.ready_for_delivery || product.finished ? 'ready_delivery' : launched ? order?.status || 'in_production' : 'ready_for_launch';
        return {
          product,
          order,
          module,
          owner,
          health,
          launched,
          savedAssignments,
          stageLabel: getWorkflowStageLabel(module, product.current_stage_index, launched),
        };
      }),
    [orders, products, tasks],
  );

  const assigneeOptions = useMemo(
    () =>
      profiles
        .filter((profile) => profile.active && !['client', 'client_director'].includes(String(profile.role || '')))
        .map((profile) => ({
          id: profile.id,
          label: normalizeUtf8Text(profile.full_name || profile.email || profile.id),
          email: profile.email || null,
          accountId: profile.auth_user_id || null,
          role: String(profile.role || ''),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [profiles],
  );

  const selectedRow = useMemo(
    () => trackingRows.find((row) => row.product.id === selectedProductId) || null,
    [trackingRows, selectedProductId],
  );

  const stageRows = useMemo(() => {
    if (!selectedRow) return [] as string[];
    return ASSIGNMENT_ROWS_BY_MODULE[selectedRow.module as 'ELN' | 'VIDEO' | 'GAME'] || [];
  }, [selectedRow]);

  useEffect(() => {
    if (!selectedProductId && trackingRows[0]?.product.id) {
      setSelectedProductId(trackingRows[0].product.id);
    }
  }, [trackingRows, selectedProductId]);

  useEffect(() => {
    if (viewMode === 'detail' && !selectedRow) {
      setViewMode('list');
    }
  }, [viewMode, selectedRow]);

  const saveAssignmentsMutation = useMutation({
    mutationFn: async (payload: Record<string, AssignmentRecord>) => {
      if (!selectedRow?.order) throw new Error('Missing selected order.');
      const currentOverrides =
        selectedRow.order.stage_sla_overrides && typeof selectedRow.order.stage_sla_overrides === 'object'
          ? selectedRow.order.stage_sla_overrides
          : {};
      await updateOrder(selectedRow.order.id, {
        stage_sla_overrides: {
          ...currentOverrides,
          tracking_assignments: payload,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  function updateAssignmentField(stageCode: string, field: keyof AssignmentRecord, value: string) {
    if (!selectedRow?.order) return;
    const selectedOrderForNotice = selectedRow.order;
    const selectedProductForNotice = selectedRow.product;
    const current = readTrackingAssignments(selectedRow.order);
    const key = assignmentKey(selectedRow.product.id, stageCode);
    const existing = current[key] || {
      productId: selectedRow.product.id,
      stageCode,
      assigneeProfileId: null,
      assigneeName: '',
      plannedDeadline: '',
      note: '',
      notificationState: 'pending' as const,
      updatedAt: new Date().toISOString(),
    };
    const next: AssignmentRecord = {
      ...existing,
      assigneeName: field === 'assigneeName' ? normalizeUtf8Text(value) : existing.assigneeName,
      assigneeProfileId: field === 'assigneeProfileId' ? (value || null) : existing.assigneeProfileId,
      assigneeEmail: existing.assigneeEmail || null,
      plannedDeadline: field === 'plannedDeadline' ? value : existing.plannedDeadline,
      note: field === 'note' ? sanitizeMultilineNote(value) : existing.note,
      updatedAt: new Date().toISOString(),
    };
    if (field === 'assigneeProfileId') {
      const found = assigneeOptions.find((item) => item.id === value);
      next.assigneeName = normalizeUtf8Text(found?.label || '');
      next.assigneeEmail = found?.email || null;
    }
    void (async () => {
      await saveAssignmentsMutation.mutateAsync({
        ...current,
        [key]: next,
      });
      if (field === 'assigneeProfileId' && next.assigneeProfileId && next.assigneeProfileId !== existing.assigneeProfileId) {
        const stageIndex = parseStageIndexFromCode(stageCode);
        const assigneeAccountId = assigneeOptions.find((item) => item.id === next.assigneeProfileId)?.accountId || null;
        const assigneeTask =
          stageIndex === null
            ? null
            : await ensureTaskForStage({
                orderId: selectedOrderForNotice.id,
                productId: selectedProductForNotice.id,
                stageIndex,
                existingTasks: tasks,
                dueDate: next.plannedDeadline || null,
                assignee: next.assigneeName || null,
                assigneeProfileId: next.assigneeProfileId,
                assigneeAccountId,
                notifyAssignment: false,
              });
        if (assigneeTask?.id) {
          await updateTask(
            assigneeTask.id,
            {
              due_date: next.plannedDeadline || null,
              assignee: next.assigneeName || null,
              assignee_profile_id: next.assigneeProfileId,
              assignee_account_id: assigneeAccountId,
            },
            { notifyAssignment: false },
          );
        }
        await createNotification({
          level: 'info',
          title: `Bạn được giao ${stageCode}`,
          body: `Thuộc sản phẩm ${selectedProductForNotice.id}. Vui lòng kiểm tra.`,
          linkPage: 'my-tasks',
          recipientProfileId: next.assigneeProfileId,
          recipientAccountId: assigneeAccountId,
          eventKey: `${selectedProductForNotice.id}:${stageCode}:assigned:${next.assigneeProfileId}`,
          metadata: {
            order_id: selectedOrderForNotice.id,
            product_id: selectedProductForNotice.id,
            task_id: assigneeTask?.id || null,
            stage_index: stageIndex,
            stage_code: stageCode,
            assignee_profile_id: next.assigneeProfileId,
            assignee_account_id: assigneeAccountId,
            assignee_email: next.assigneeEmail || null,
            planned_deadline: next.plannedDeadline || null,
          },
        });
        await createActivityLog({
          actorProfileId: profile?.id || null,
          actionType: 'workflow_step_assigned',
          objectType: 'product',
          objectId: selectedProductForNotice.id,
          summary: `${selectedProductForNotice.id} được giao ${stageCode} cho ${next.assigneeName || 'người phụ trách'}.`,
          metadata: {
            order_id: selectedOrderForNotice.id,
            product_id: selectedProductForNotice.id,
            task_id: assigneeTask?.id || null,
            stage_index: stageIndex,
            stage_code: stageCode,
            assignee_profile_id: next.assigneeProfileId,
            assignee_account_id: assigneeAccountId,
            assignee_email: next.assigneeEmail || null,
            assignee_name: next.assigneeName,
            planned_deadline: next.plannedDeadline || null,
            note: next.note || null,
          },
        });
        await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    })();
  }

  function openAssignmentScreen(productId: string) {
    setSelectedProductId(productId);
    setViewMode('detail');
  }

  return (
    <>
      <SectionHeader eye="Ke hoach san xuat" title="Ke hoach san xuat" subtitle="An vao dong o bang de mo man hinh phan viec chi tiet." />

      {viewMode === 'list' ? (
        <Card title="Danh sách theo dõi sản phẩm">
          <table className="data-table">
            <thead>
              <tr>
                <th>San pham</th>
                <th>Đơn hàng</th>
                <th>Khach hang</th>
                <th>Phan he</th>
                <th>Cong doan hien tai</th>
                <th>Phu trach</th>
                <th>Tiến độ</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {trackingRows.map((row) => (
                <tr
                  key={row.product.id}
                  onClick={() => openAssignmentScreen(row.product.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openAssignmentScreen(row.product.id);
                    }
                  }}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                >
                  <td><div className="fw6">{row.product.id}</div><div className="muted-text">{row.product.name}</div></td>
                  <td>{row.order?.id || '-'}</td>
                  <td>{row.order?.client || '-'}</td>
                  <td>{row.module}</td>
                  <td>{row.stageLabel}</td>
                  <td>{row.owner}</td>
                  <td>
                    <div className="progress-inline">
                      <div className="progress-track">
                        <div className="progress-fill tone-violet" style={{ width: `${row.product.progress}%` }} />
                      </div>
                      <span>{row.product.progress}%</span>
                    </div>
                  </td>
                  <td><Badge tone={toneForStatus(row.health)}>{getStatusDisplayLabel(row.health)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted-text">An vao 1 dong trong bang de chuyen sang man hinh gan viec.</div>
        </Card>
      ) : (
        <Card title="Gán việc theo sản phẩm">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setViewMode('list')}>Quay lai danh sach</button>
            {selectedRow ? (
              <div className="muted-text">
                {selectedRow.product.id} - {normalizeUtf8Text(selectedRow.product.name)} ({selectedRow.module})
              </div>
            ) : null}
          </div>

          {!selectedRow ? (
            <div className="muted-text">Không tìm thấy sản phẩm đã chọn.</div>
          ) : (
            <div className="tracking-assignment-shell">
              <div className="tracking-assignment-stage-list">
                {stageRows.map((stageCode) => {
                  const key = assignmentKey(selectedRow.product.id, stageCode);
                  const saved = selectedRow.savedAssignments[key];
                  return (
                    <div className="tracking-assignment-stage-item" key={stageCode}>
                      <div className="tracking-assignment-stage-code">{stageCode}</div>
                      <select
                        value={saved?.assigneeProfileId || ''}
                        onChange={(event) => updateAssignmentField(stageCode, 'assigneeProfileId', event.target.value)}
                      >
                        <option value="">-- Chon nguoi phu trach --</option>
                        {assigneeOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label} ({option.role})
                          </option>
                        ))}
                      </select>
                      <input
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        value={saved?.plannedDeadline || ''}
                        onChange={(event) => updateAssignmentField(stageCode, 'plannedDeadline', event.target.value)}
                      />
                      <textarea
                        rows={2}
                        value={saved?.note || ''}
                        placeholder="Ghi chú"
                        onChange={(event) => updateAssignmentField(stageCode, 'note', event.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="muted-text">ELN co 9 row, VIDEO co 8 row, GAME co 4 row. Notification se duoc build sau.</div>
            </div>
          )}
        </Card>
      )}
    </>
  );
}

function getArchiveModuleLabel(module: string) {
  if (module === 'ELN') return 'E-learning';
  if (module === 'VIDEO') return 'Video';
  if (module === 'GAME') return 'Trò chơi';
  return module || '-';
}

function formatArchiveDate(value: string) {
  if (!value || value === '-') return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

const MANUAL_VIDEO_LINKS_STORAGE_KEY = 'vcontent.manualVideoLinks';

function readManualVideoLinks() {
  if (typeof window === 'undefined') return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MANUAL_VIDEO_LINKS_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function getArchiveRowYear(row: { updatedAt: string }) {
  return String(row.updatedAt || '').match(/\d{4}/)?.[0] || '-';
}

function buildArchiveCountOptions(values: string[]) {
  const counts = values.reduce<Map<string, number>>((acc, value) => {
    const key = value || '-';
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'vi'));
}

export function RealArchiveLibraryPage() {
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const workflowQuery = useQuery({ queryKey: ['workflow-records', 'archive-library'], queryFn: () => listWorkflowRecords({ kinds: ['video_edit', 'scorm_package'], includeReviews: false, includeQuestionLibrary: false }) });
  const [archiveSearch, setArchiveSearch] = useState('');
  const [archiveCustomerFilter, setArchiveCustomerFilter] = useState('');
  const [archiveYearFilter, setArchiveYearFilter] = useState('');
  const [manualVideoLinks, setManualVideoLinks] = useState<Record<string, string>>(() => readManualVideoLinks());
  const orders = ordersQuery.data?.orders || [];
  const products = ordersQuery.data?.products || [];
  const videoLinkByProductId = useMemo(
    () => {
      const map = new Map(
        (workflowQuery.data?.videoEdits || [])
          .filter((record) => String(record.file_name || '').trim())
          .map((record) => [record.product_id, String(record.file_name || '').trim()]),
      );
      Object.entries(manualVideoLinks).forEach(([productId, link]) => {
        if (String(link || '').trim()) map.set(productId, String(link || '').trim());
      });
      return map;
    },
    [manualVideoLinks, workflowQuery.data?.videoEdits],
  );

  useEffect(() => {
    window.localStorage.setItem(MANUAL_VIDEO_LINKS_STORAGE_KEY, JSON.stringify(manualVideoLinks));
  }, [manualVideoLinks]);

  const libraryRows = useMemo(
    () => {
      const liveRows = products
        .map((product) => {
          const order = orders.find((entry) => entry.id === product.order_id) || null;
          const module = inferProductWorkflowModule(product.id, order?.module);
          const updatedAt = String(product.delivered_at || order?.launched_at || order?.submitted_at || order?.deadline || '').slice(0, 10) || '-';

          const productCodeMap = order ? buildDisplayProductCodeMap(getDisplayOrderCode(order), products.filter((item) => item.order_id === order.id)) : new Map<string, string>();
          const productOverrides = readProductPlanOverrides(order);

          return {
            displayProductCode: normalizeUtf8Text(productOverrides[product.id]?.displayProductCode || '') || productCodeMap.get(product.id) || product.id,
            productId: product.id,
            productName: product.name,
            module,
            client: order?.client || '-',
            updatedAt,
            videoLink: videoLinkByProductId.get(product.id) || '',
            source: 'production',
          };
        });
      const importedRows = PRODUCT_LIBRARY_ITEMS.map((item) => ({
        displayProductCode: item.displayCode,
        productId: item.id,
        productName: item.title,
        module: item.module,
        client: item.client,
        updatedAt: String(item.year),
        videoLink: manualVideoLinks[item.id] || item.videoLink,
        source: item.source,
        sortTime: new Date(`${item.year}-12-31T00:00:00`).getTime(),
      }));

      return [...liveRows, ...importedRows]
        .sort((left, right) => {
          const leftTime = Number((left as { sortTime?: number }).sortTime || new Date(String(left.updatedAt || '').slice(0, 10)).getTime() || 0);
          const rightTime = Number((right as { sortTime?: number }).sortTime || new Date(String(right.updatedAt || '').slice(0, 10)).getTime() || 0);
          return rightTime - leftTime || left.displayProductCode.localeCompare(right.displayProductCode, 'vi');
        });
    },
    [manualVideoLinks, orders, products, videoLinkByProductId],
  );

  const archiveCustomerOptions = useMemo(() => buildArchiveCountOptions(libraryRows.map((row) => row.client || '-')), [libraryRows]);
  const archiveYearOptions = useMemo(() => buildArchiveCountOptions(libraryRows.map(getArchiveRowYear)), [libraryRows]);
  const filteredLibraryRows = useMemo(
    () =>
      libraryRows.filter((row) => {
        const needle = normalizeUtf8Text(archiveSearch).toLowerCase();
        if (archiveCustomerFilter && (row.client || '-') !== archiveCustomerFilter) return false;
        if (archiveYearFilter && getArchiveRowYear(row) !== archiveYearFilter) return false;
        if (!needle) return true;
        return normalizeUtf8Text([row.displayProductCode, row.productName, row.module, row.client, row.updatedAt, row.source].join(' ')).toLowerCase().includes(needle);
      }),
    [archiveCustomerFilter, archiveSearch, archiveYearFilter, libraryRows],
  );

  function openArchiveVideo(row: { videoLink: string }) {
    if (!row.videoLink) return;
    window.open(row.videoLink, '_blank', 'noopener,noreferrer');
  }

  function editArchiveVideo(row: { productId: string; displayProductCode: string; videoLink: string }) {
    const nextLink = window.prompt(`Nhập link video cho ${row.displayProductCode}`, row.videoLink || '');
    if (nextLink === null) return;
    setManualVideoLinks((current) => {
      const next = { ...current };
      const trimmed = nextLink.trim();
      if (trimmed) next[row.productId] = trimmed;
      else delete next[row.productId];
      return next;
    });
  }

  return (
    <div className="overview-compact overview-production">
      <Card title="Danh sách tài nguyên">
        <div className="archive-library-toolbar">
          <input
            value={archiveSearch}
            onChange={(event) => setArchiveSearch(event.target.value)}
            placeholder="Tìm mã, tên, phân hệ, khách hàng, nguồn..."
          />
          <select value={archiveCustomerFilter} onChange={(event) => setArchiveCustomerFilter(event.target.value)}>
            <option value="">Tất cả khách hàng ({libraryRows.length})</option>
            {archiveCustomerOptions.map(([client, count]) => <option key={client} value={client}>{client} ({count})</option>)}
          </select>
          <select value={archiveYearFilter} onChange={(event) => setArchiveYearFilter(event.target.value)}>
            <option value="">Tất cả năm ({libraryRows.length})</option>
            {archiveYearOptions.map(([year, count]) => <option key={year} value={year}>{year} ({count})</option>)}
          </select>
          <Badge tone="neutral">{filteredLibraryRows.length} sản phẩm</Badge>
        </div>
        <div className="production-plan-table-wrap production-plan-glass-panel archive-library-panel">
        <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate archive-library-table">
          <thead>
            <tr>
              <th>Mã sản phẩm</th>
              <th>Tên sản phẩm</th>
              <th>Phân hệ</th>
              <th>Khách hàng</th>
              <th>Cập nhật lần cuối</th>
              <th>Chi tiết</th>
            </tr>
          </thead>
          <tbody>
            {filteredLibraryRows.map((row) => (
              <tr key={row.productId}>
                <td><div className="fw6">{row.displayProductCode}</div></td>
                <td><div className="fw6">{row.productName}</div></td>
                <td>
                  <Badge tone={row.module === 'ELN' ? 'violet' : row.module === 'VIDEO' ? 'danger' : 'warning'}>{getArchiveModuleLabel(row.module)}</Badge>
                </td>
                <td>{row.client}</td>
                <td>{formatArchiveDate(row.updatedAt)}</td>
                <td className="overview-orders-detail-cell">
                  <button
                    className="production-plan-icon-btn"
                    type="button"
                    title={row.videoLink ? `Mo link video ${row.displayProductCode}` : `Chua co link video ${row.displayProductCode}`}
                    aria-label={row.videoLink ? `Mo link video ${row.displayProductCode}` : `Chua co link video ${row.displayProductCode}`}
                    disabled={!row.videoLink}
                    onClick={() => openArchiveVideo(row)}
                  >
                    <Eye size={16} strokeWidth={1.9} />
                  </button>
                  <button
                    className="production-plan-icon-btn"
                    type="button"
                    title={`Thêm hoặc sửa link video ${row.displayProductCode}`}
                    aria-label={`Thêm hoặc sửa link video ${row.displayProductCode}`}
                    onClick={() => editArchiveVideo(row)}
                  >
                    <Pencil size={16} strokeWidth={1.9} />
                  </button>
                </td>
              </tr>
            ))}
            {!filteredLibraryRows.length ? (
              <tr>
                <td colSpan={6} className="muted-text">Khong co san pham phu hop.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        </div>
      </Card>
    </div>
  );
}

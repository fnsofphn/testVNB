import { getOrderWorkflowStatus, getProductWorkflowStatus, getTaskWorkflowStatus, resolveWorkflowOverrideStatus, type WorkflowStatus } from '@/lib/workflowStatus';

type WorkflowProjectionOrderLike = {
  id: string;
  deadline?: string | null;
  stage_sla_overrides?: Record<string, unknown> | null;
};

type WorkflowProjectionProductLike = {
  id: string;
  order_id: string;
  current_stage_index?: number | null;
  progress?: number | null;
  ready_for_delivery?: boolean | null;
  finished?: boolean | null;
};

type WorkflowProjectionTaskLike = {
  order_id: string;
  product_id: string;
  stage_index?: number | null;
  status?: string | null;
  due_date?: string | null;
  assignee?: string | null;
  assignee_profile_id?: string | null;
  archived?: boolean | null;
};

type WorkflowProjectionInputItemLike = {
  order_id: string;
  product_id: string;
  required?: boolean | null;
  status?: string | null;
};

type TrackingAssignmentLike = {
  productId?: string;
  stageCode?: string;
  assigneeProfileId?: string | null;
  assigneeName?: string;
  plannedDeadline?: string | null;
  checkpointStatus?: string | null;
  updatedAt?: string | null;
};

type WorkflowRecordLike = {
  order_id?: string | null;
  product_id?: string | null;
  status?: string | null;
};

type WorkflowRecordsLike = {
  storyboards?: WorkflowRecordLike[];
  slideDesigns?: WorkflowRecordLike[];
  voiceOvers?: WorkflowRecordLike[];
  videoEdits?: WorkflowRecordLike[];
  scormPackages?: WorkflowRecordLike[];
};

export type WorkflowStepProjection = {
  stageIndex: number;
  stageCode: string;
  status: WorkflowStatus;
  sourceStatus: string | null;
  deadline: string | null;
  assigneeName: string;
  assigneeProfileId: string | null;
  updatedAt: string | null;
};

export type WorkflowProductProjection = {
  productId: string;
  status: WorkflowStatus;
  currentStageIndex: number;
  deadline: string | null;
  steps: Record<string, WorkflowStepProjection>;
};

export type WorkflowStatusProjection = {
  version: 1;
  generatedAt: string;
  orderId: string;
  orderStatus: WorkflowStatus;
  products: Record<string, WorkflowProductProjection>;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStageIndex(value: unknown) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function parseStageCodeIndex(value: string | null | undefined) {
  const match = String(value || '').trim().toUpperCase().match(/^(?:[SVG]?SMF)-(\d{2})$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed - 1;
}

function inferStageCodeFromTask(task: WorkflowProjectionTaskLike) {
  const modulePrefix = String(task.product_id || '').toUpperCase().includes('_G')
    ? 'GSMF'
    : String(task.product_id || '').toUpperCase().includes('_H')
      ? 'VSMF'
      : 'SMF';
  return `${modulePrefix}-${String(normalizeStageIndex(task.stage_index) + 1).padStart(2, '0')}`;
}

function readTrackingAssignments(order: WorkflowProjectionOrderLike) {
  const raw = order.stage_sla_overrides;
  if (!isObjectRecord(raw)) return {} as Record<string, TrackingAssignmentLike>;
  const trackingAssignments = raw.tracking_assignments;
  if (!isObjectRecord(trackingAssignments)) return {} as Record<string, TrackingAssignmentLike>;
  return trackingAssignments as Record<string, TrackingAssignmentLike>;
}

function readWorkflowRecordStatus(
  records: WorkflowRecordsLike | undefined,
  kind: keyof WorkflowRecordsLike,
  orderId: string,
  productId: string,
) {
  return (records?.[kind] || []).find((entry) => entry.order_id === orderId && entry.product_id === productId)?.status || null;
}

function applyTrackingStatusOverride(status: WorkflowStatus, tracking?: TrackingAssignmentLike) {
  const trackingStatus = getTaskWorkflowStatus({ status: tracking?.checkpointStatus || null });
  if (trackingStatus === 'completed') return 'completed';
  if (trackingStatus === 'pending' && status !== 'completed') return 'pending';
  if (trackingStatus === 'in_progress') return 'in_progress';
  if (trackingStatus === 'overdue') return 'overdue';
  return status;
}

export function readWorkflowStatusProjection(order: { stage_sla_overrides?: Record<string, unknown> | null }) {
  const raw = order.stage_sla_overrides;
  if (!isObjectRecord(raw)) return null;
  const projection = raw.status_projection;
  if (!isObjectRecord(projection)) return null;
  if (Number(projection.version) !== 1) return null;
  return projection as WorkflowStatusProjection;
}

export function getProjectedOrderStatus(
  order: { stage_sla_overrides?: Record<string, unknown> | null },
  fallbackStatus: WorkflowStatus,
) {
  const projection = readWorkflowStatusProjection(order);
  if (!projection) return fallbackStatus;

  const derivedProductStatuses = Object.values(projection.products || {}).map((product) => {
    const stepStatuses = Object.values(product.steps || {}).map((step) => step.status);
    return stepStatuses.length ? getOrderWorkflowStatus(stepStatuses) : product.status;
  });

  const derivedOrderStatus = derivedProductStatuses.length
    ? getOrderWorkflowStatus(derivedProductStatuses)
    : projection.orderStatus;

  return resolveWorkflowOverrideStatus(derivedOrderStatus, fallbackStatus);
}

export function getProjectedProductStatus(
  order: { stage_sla_overrides?: Record<string, unknown> | null },
  productId: string,
  fallbackStatus: WorkflowStatus,
) {
  const projection = readWorkflowStatusProjection(order);
  const projectedProduct = projection?.products?.[productId];
  if (!projectedProduct) return fallbackStatus;

  const stepStatuses = Object.values(projectedProduct.steps || {}).map((step) => step.status);
  const derivedStatus = stepStatuses.length ? getOrderWorkflowStatus(stepStatuses) : projectedProduct.status;

  return resolveWorkflowOverrideStatus(derivedStatus, fallbackStatus);
}

export function getProjectedProductDeadline(
  order: { stage_sla_overrides?: Record<string, unknown> | null },
  productId: string,
  fallbackDeadline: string | null,
) {
  return readWorkflowStatusProjection(order)?.products?.[productId]?.deadline || fallbackDeadline;
}

export function buildWorkflowStatusProjection(input: {
  order: WorkflowProjectionOrderLike;
  products: WorkflowProjectionProductLike[];
  tasks: WorkflowProjectionTaskLike[];
  inputItems?: WorkflowProjectionInputItemLike[];
  workflowRecords?: WorkflowRecordsLike;
}) {
  const { order, workflowRecords } = input;
  const generatedAt = new Date().toISOString();
  const trackingAssignments = readTrackingAssignments(order);
  const productMap: Record<string, WorkflowProductProjection> = {};

  input.products
    .filter((product) => product.order_id === order.id)
    .forEach((product) => {
        const productTasks = input.tasks
          .filter((task) => task.order_id === order.id && task.product_id === product.id && !task.archived)
          .sort((a, b) => normalizeStageIndex(a.stage_index) - normalizeStageIndex(b.stage_index));
      const productInputItems = (input.inputItems || []).filter((item) => item.order_id === order.id && item.product_id === product.id);
      const requiredInputItems = productInputItems.filter((item) => Boolean(item.required));
      const intakeReady =
        requiredInputItems.length === 0
          ? null
          : requiredInputItems.every((item) => String(item.status || '').toLowerCase() === 'approved');

        const steps: Record<string, WorkflowStepProjection> = {};
        const trackingByStageIndex = new Map<number, TrackingAssignmentLike>();
        const storyboardStatus = readWorkflowRecordStatus(workflowRecords, 'storyboards', order.id, product.id);
        const slideStatus = readWorkflowRecordStatus(workflowRecords, 'slideDesigns', order.id, product.id);
        const voiceStatus = readWorkflowRecordStatus(workflowRecords, 'voiceOvers', order.id, product.id);
        const videoStatus = readWorkflowRecordStatus(workflowRecords, 'videoEdits', order.id, product.id);
        const scormStatus = readWorkflowRecordStatus(workflowRecords, 'scormPackages', order.id, product.id);
        const sourceStatusByStage = new Map<number, string | null>([
          [1, storyboardStatus],
          [2, slideStatus],
          [3, slideStatus],
          [4, voiceStatus],
          [5, voiceStatus],
          [6, videoStatus],
          [7, videoStatus],
          [8, scormStatus],
        ]);

      Object.values(trackingAssignments).forEach((entry) => {
        if (!entry || entry.productId !== product.id) return;
        const stageIndex = parseStageCodeIndex(entry.stageCode);
        if (stageIndex === null) return;
        trackingByStageIndex.set(stageIndex, entry);
      });

      productTasks.forEach((task) => {
        const stageIndex = normalizeStageIndex(task.stage_index);
        const tracking = trackingByStageIndex.get(stageIndex);
        const stageCode = tracking?.stageCode || inferStageCodeFromTask(task);
        const deadline = tracking?.plannedDeadline || task.due_date || order.deadline || null;
        const currentStageIndex = normalizeStageIndex(product.current_stage_index);
        const recordStatus = sourceStatusByStage.get(stageIndex) || null;
        const runtimeStatus =
          recordStatus
            ? getTaskWorkflowStatus(
                {
                  status: recordStatus,
                  due_date: deadline,
                  stage_index: stageIndex,
                },
                order.deadline || null,
              )
            : stageIndex < currentStageIndex
            ? 'completed'
            : getTaskWorkflowStatus(
                {
                  status: task.status,
                  due_date: deadline,
                  stage_index: stageIndex,
                },
                order.deadline || null,
              );
        const status = applyTrackingStatusOverride(runtimeStatus, tracking);

        steps[String(stageIndex)] = {
          stageIndex,
          stageCode,
          status,
          sourceStatus: recordStatus || task.status || null,
          deadline,
          assigneeName: String(tracking?.assigneeName || task.assignee || '').trim(),
          assigneeProfileId: tracking?.assigneeProfileId || task.assignee_profile_id || null,
          updatedAt: tracking?.updatedAt || generatedAt,
        };
      });

      trackingByStageIndex.forEach((tracking, stageIndex) => {
        if (steps[String(stageIndex)]) return;
        const currentStageIndex = normalizeStageIndex(product.current_stage_index);
        const deadline = tracking.plannedDeadline || order.deadline || null;
        const recordStatus = sourceStatusByStage.get(stageIndex) || null;
        const runtimeStatus = recordStatus
          ? getTaskWorkflowStatus(
              {
                status: recordStatus,
                due_date: deadline,
                stage_index: stageIndex,
              },
              order.deadline || null,
            )
          : stageIndex < currentStageIndex
            ? 'completed'
            : getTaskWorkflowStatus({ status: 'todo', due_date: deadline }, order.deadline || null);
        steps[String(stageIndex)] = {
          stageIndex,
          stageCode: String(tracking.stageCode || ''),
          status: applyTrackingStatusOverride(runtimeStatus, tracking),
          sourceStatus: recordStatus || 'todo',
          deadline,
          assigneeName: String(tracking.assigneeName || '').trim(),
          assigneeProfileId: tracking.assigneeProfileId || null,
          updatedAt: tracking.updatedAt || generatedAt,
        };
      });

      const productStatus = getProductWorkflowStatus({
        finished: Boolean(product.finished),
        readyForDelivery: Boolean(product.ready_for_delivery),
        progress: product.progress ?? 0,
        currentStageIndex: normalizeStageIndex(product.current_stage_index),
        intakeReady,
        tasks: productTasks.map((task) => ({
          status: task.status,
          due_date: trackingByStageIndex.get(normalizeStageIndex(task.stage_index))?.plannedDeadline || task.due_date || order.deadline || null,
          stage_index: task.stage_index ?? 0,
        })),
        fallbackDeadline: order.deadline || null,
      });

      const productDeadline =
        Object.values(steps)
          .map((step) => step.deadline || '')
          .filter(Boolean)
          .sort()
          .slice(-1)[0] || order.deadline || null;

      productMap[product.id] = {
        productId: product.id,
        status: productStatus,
        currentStageIndex: normalizeStageIndex(product.current_stage_index),
        deadline: productDeadline,
        steps,
      };
    });

  return {
    version: 1 as const,
    generatedAt,
    orderId: order.id,
    orderStatus: getOrderWorkflowStatus(Object.values(productMap).map((product) => product.status)),
    products: productMap,
  } satisfies WorkflowStatusProjection;
}

export function withWorkflowStatusProjection(
  stageOverrides: Record<string, unknown> | null | undefined,
  projection: WorkflowStatusProjection,
) {
  return {
    ...(isObjectRecord(stageOverrides) ? stageOverrides : {}),
    status_projection: projection,
  };
}

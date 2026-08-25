import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppShell } from '@/contexts/AppShellContext';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { buildDisplayProductCodeMap, getDisplayOrderCode } from '@/lib/orderDisplayCodes';
import { fetchMyTasksPreview, getMyTasksPreviewQueryKey, shouldUseMyTasksPreview, type MyTaskPreviewWorkItem } from '@/lib/myTasksPreview';
import { normalizeEmail, profileEmailMatches, isProfileIdAssignedToCurrentProfile, isTaskExplicitlyAssignedToCurrentProfile } from '@/lib/taskAssignee';
import { getProjectedProductDeadline, getProjectedProductStatus } from '@/lib/workflowProjection';
import { getProductWorkflowStatus, getTaskWorkflowStatus, resolveSummaryWorkflowStatus } from '@/lib/workflowStatus';
import { getStagePageKey } from '@/lib/workflowTasks';
import {
  inferProductWorkflowModule,
  listOrdersWithProducts,
  listProfiles,
  listTasks,
  type OrderRow,
  type ProductRow,
  type ProfileRow,
  type TaskRow,
} from '@/services/vcontent';
import { normalizeAppRole } from '@/data/vcontent';

type PlanStatus = 'not_started' | 'in_progress' | 'overdue' | 'pending' | 'completed';
type OrderType = 'H' | 'E' | 'G' | 'M';
type ModuleFilter = 'ELN' | 'VIDEO' | 'GAME';

type TrackingAssignment = {
  productId?: string;
  stageCode?: string;
  assigneeProfileId?: string | null;
  assigneeEmail?: string | null;
  assigneeName?: string;
  plannedStartDate?: string | null;
  plannedDeadline?: string | null;
  note?: string | null;
  checkpointStatus?: string | null;
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
  taskDeadline: string;
  status: PlanStatus;
  currentStageIndex: number;
  product: ProductRow;
  order: OrderRow;
};

type CheckpointStep = {
  code: string;
  label: string;
};

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
  deadline: string;
  note: string;
  assignedToViewer: boolean;
};

const ELN_CHECKPOINT_STEPS: CheckpointStep[] = [
  { code: 'CP01', label: 'Yêu cầu đầu vào' },
  { code: 'CP02', label: 'Storyboard' },
  { code: 'CP03', label: 'Slide' },
  { code: 'CP04', label: 'QC slide' },
  { code: 'CP05', label: 'Thu voice' },
  { code: 'CP06', label: 'QC âm thanh' },
  { code: 'CP07', label: 'Biên tập video' },
  { code: 'CP08', label: 'QC video' },
  { code: 'CP09', label: 'SCORM + Quiz' },
];

const VIDEO_CHECKPOINT_STEPS: CheckpointStep[] = ELN_CHECKPOINT_STEPS.slice(0, 8);

const GAME_CHECKPOINT_STEPS: CheckpointStep[] = [
  { code: 'CP01', label: 'Yêu cầu đầu vào' },
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

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolvePrimaryWorkItem(items: MyTaskPreviewWorkItem[]) {
  const sortedItems = items
    .slice()
    .sort(
      (a, b) =>
        String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31')) ||
        Number(a.stage_index) - Number(b.stage_index),
    );
  return sortedItems.find((item) => item.status !== 'done') || sortedItems[0] || null;
}

function formatDate(value: string | null | undefined) {
  const parsed = parseDate(value);
  if (!parsed) return '-';
  return parsed.toLocaleDateString('vi-VN');
}

function normalizeText(value: string | null | undefined) {
  return String(value || '').normalize('NFC').trim();
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

function assignmentKey(productId: string, stageCode: string) {
  return `${productId}::${stageCode}`;
}

function readCheckpointAssignments(order: OrderRow) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, TrackingAssignment>;
  const assignments = (raw as { tracking_assignments?: Record<string, TrackingAssignment> }).tracking_assignments;
  if (!assignments || typeof assignments !== 'object') return {} as Record<string, TrackingAssignment>;
  return assignments;
}

function stageCodeFromCheckpoint(type: OrderType, stepIndex: number) {
  const prefix = type === 'H' || type === 'M' ? 'VSMF' : type === 'G' ? 'GSMF' : 'SMF';
  return `${prefix}-${String(stepIndex + 1).padStart(2, '0')}`;
}

function resolveCheckpointRuntimeStatus(input: {
  stageTask: TaskRow | null;
  deadline: string;
  currentStageIndex: number;
  stepIndex: number;
  fallbackDeadline: string;
  selectedRowStatus: PlanStatus;
}) {
  const { stageTask, deadline, currentStageIndex, stepIndex, fallbackDeadline, selectedRowStatus } = input;
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

function buildCheckpointRows(input: {
  row: PlanRow;
  tasks: TaskRow[];
  profiles: ProfileRow[];
  assignedStageSet: Set<number>;
}) {
  const { row, tasks, profiles, assignedStageSet } = input;
  const checkpointSteps = getCheckpointStepsByType(row.type);
  const assignments = readCheckpointAssignments(row.order);
  const profilesById = new Map(profiles.map((item) => [item.id, item]));
  const stageTasks = tasks
    .filter((task) => task.product_id === row.productId && !task.archived)
    .sort((a, b) => Number(a.stage_index) - Number(b.stage_index));

  return checkpointSteps.map((step, index) => {
    const stageCode = stageCodeFromCheckpoint(row.type, index);
    const saved =
      assignments[assignmentKey(row.productId, step.code)] ||
      assignments[assignmentKey(row.productId, stageCode)];
    const stageTask = stageTasks.find((task) => Number(task.stage_index) === index) || null;
    const isAssignedByTask = assignedStageSet.has(index) && Boolean(stageTask);
    const stageTaskProfile = profilesById.get(stageTask?.assignee_profile_id || '');
    const savedProfile = profilesById.get(saved?.assigneeProfileId || '');
    let status = resolveCheckpointRuntimeStatus({
      stageTask,
      deadline: String(saved?.plannedDeadline || stageTask?.due_date || row.deadline || ''),
      selectedRowStatus: row.status,
      currentStageIndex: row.currentStageIndex,
      stepIndex: index,
      fallbackDeadline: row.deadline,
    });
    if (saved?.checkpointStatus === 'pending' && status !== 'completed') {
      status = 'pending';
    }

    return {
      key: assignmentKey(row.productId, step.code),
      stageCode,
      step,
      startDate: String(saved?.plannedStartDate || (index === 0 ? row.startDate : '') || ''),
      assigneeProfileId: isAssignedByTask ? stageTask?.assignee_profile_id || '' : saved?.assigneeProfileId || stageTask?.assignee_profile_id || '',
      assigneeAccountId: isAssignedByTask ? stageTask?.assignee_account_id || null : stageTask?.assignee_account_id || null,
      assigneeEmail: normalizeEmail(
        isAssignedByTask
          ? stageTaskProfile?.email || saved?.assigneeEmail || savedProfile?.email
          : saved?.assigneeEmail || savedProfile?.email || stageTaskProfile?.email,
      ),
      assigneeName: normalizeText(
        isAssignedByTask
          ? stageTask?.assignee || saved?.assigneeName || ''
          : saved?.assigneeName || stageTask?.assignee || '',
      ),
      status,
      deadline: String(saved?.plannedDeadline || stageTask?.due_date || row.deadline || ''),
      note: normalizeText(saved?.note || ''),
      assignedToViewer: assignedStageSet.has(index),
    } satisfies CheckpointTableRow;
  });
}

function getTrackingProductId(key: string, assignment: TrackingAssignment) {
  return String(assignment.productId || key.split('::')[0] || '').trim();
}

function parseTrackingStageIndex(key: string, assignment: TrackingAssignment) {
  const rawStageCode = String(assignment.stageCode || key.split('::')[1] || '').trim();
  const match = rawStageCode.match(/^(?:SMF|VSMF|GSMF|CP)-?(\d{2})$/i);
  if (!match) return null;
  const stageIndex = Number(match[1]) - 1;
  return Number.isFinite(stageIndex) && stageIndex >= 0 ? stageIndex : null;
}

function normalizeTrackingTaskStatus(status: string | null | undefined) {
  const value = String(status || '').trim().toLowerCase();
  if (!value || value === 'not_started') return 'todo';
  if (value === 'completed') return 'done';
  return value;
}

function isTrackingAssignmentForProfile(assignment: TrackingAssignment, profile: ReturnType<typeof useAuth>['profile'], profiles: ProfileRow[]) {
  if (!profile) return false;
  if (profileEmailMatches(profile, assignment.assigneeEmail)) return true;
  if (isProfileIdAssignedToCurrentProfile(assignment.assigneeProfileId, profile, profiles)) return true;
  return false;
}

function resolveCurrentCheckpoint(rows: CheckpointTableRow[]) {
  return (
    rows.find((item) => item.assignedToViewer && (item.status === 'in_progress' || item.status === 'pending' || item.status === 'overdue')) ||
    rows.find((item) => item.assignedToViewer && item.status !== 'completed') ||
    rows.find((item) => item.assignedToViewer) ||
    null
  );
}

export function MyTasksBoardPage({ moduleFilter }: { moduleFilter?: ModuleFilter } = {}) {
  const navigate = useNavigate();
  const { profile, loading } = useAuth();
  const { role: shellRole } = useAppShell();
  const viewerRole = normalizeAppRole(profile?.role || shellRole);
  const isScholarRole = viewerRole === 'hoc_gia';
  const shouldHideMyTasksHeader = isScholarRole || viewerRole === 'specialist';
  const shouldUseServerPreview = !loading && shouldUseMyTasksPreview(viewerRole);

  const previewQuery = useQuery({
    queryKey: getMyTasksPreviewQueryKey(viewerRole || shellRole, profile?.email || '', {}),
    queryFn: () => fetchMyTasksPreview(viewerRole || shellRole, profile?.email || null, {}),
    enabled: shouldUseServerPreview,
    staleTime: 1000 * 60,
  });
  const useFallbackQueries = !shouldUseServerPreview || previewQuery.isError;
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts, enabled: useFallbackQueries, staleTime: 1000 * 60 });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'my-tasks-board'], queryFn: () => listTasks(), enabled: useFallbackQueries, staleTime: 1000 * 60 });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'my-tasks-board'], queryFn: listProfiles, enabled: useFallbackQueries, staleTime: 1000 * 60 * 5 });

  const ordersData = previewQuery.data ? { orders: previewQuery.data.orders, products: previewQuery.data.products } : ordersQuery.data;
  const tasksData = previewQuery.data?.tasks || tasksQuery.data || [];
  const profiles: ProfileRow[] = previewQuery.data?.profiles || profilesQuery.data || [];
  const viewerProfile = profile || previewQuery.data?.viewerProfile || null;

  const fallbackWorkItems = useMemo(() => {
    const itemsByStage = new Map<string, MyTaskPreviewWorkItem>();
    const scopedTasks = tasksData
      .filter((task) => !task.archived)
      .filter((task) => isTaskExplicitlyAssignedToCurrentProfile(task, viewerProfile, profiles))
      .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || Number(a.stage_index) - Number(b.stage_index));

    for (const task of scopedTasks) {
      const assignedProfile = profiles.find((entry) => entry.id === task.assignee_profile_id);
      itemsByStage.set(`${task.order_id}::${task.product_id}::${task.stage_index}`, {
        id: task.id,
        taskId: task.id,
        order_id: task.order_id,
        product_id: task.product_id,
        stage_index: task.stage_index,
        status: task.status,
        progress: task.progress,
        due_date: task.due_date,
        assignee: task.assignee,
        assignee_profile_id: task.assignee_profile_id || null,
        assignee_account_id: task.assignee_account_id || null,
        assignee_email: assignedProfile?.email || null,
        source: 'task',
      });
    }

    for (const order of ordersData?.orders || []) {
      const assignments = readCheckpointAssignments(order);
      for (const [key, assignment] of Object.entries(assignments)) {
        if (!isTrackingAssignmentForProfile(assignment, viewerProfile, profiles)) continue;
        const productId = getTrackingProductId(key, assignment);
        const stageIndex = parseTrackingStageIndex(key, assignment);
        if (!productId || stageIndex === null) continue;
        const itemKey = `${order.id}::${productId}::${stageIndex}`;
        if (itemsByStage.has(itemKey)) continue;
        const dueDate = String(assignment.plannedDeadline || order.deadline || '').slice(0, 10) || null;
        let status = normalizeTrackingTaskStatus(assignment.checkpointStatus);
        if (status !== 'done' && dueDate && new Date(`${dueDate}T23:59:59`).getTime() < Date.now()) {
          status = 'overdue';
        }
        itemsByStage.set(itemKey, {
          id: `tracking:${itemKey}`,
          taskId: null,
          order_id: order.id,
          product_id: productId,
          stage_index: stageIndex,
          status,
          progress: status === 'done' ? 100 : 0,
          due_date: dueDate,
          assignee: assignment.assigneeName || viewerProfile?.fullName || null,
          assignee_profile_id: assignment.assigneeProfileId || null,
          assignee_account_id: null,
          assignee_email: normalizeEmail(assignment.assigneeEmail) || null,
          source: 'tracking',
        });
      }
    }

    return [...itemsByStage.values()].sort(
      (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || Number(a.stage_index) - Number(b.stage_index),
    );
  }, [ordersData?.orders, profiles, tasksData, viewerProfile]);

  const workItems = useMemo(
    () => previewQuery.data?.workItems || fallbackWorkItems,
    [fallbackWorkItems, previewQuery.data?.workItems],
  );

  const [typeFilter, setTypeFilter] = useState<'all' | OrderType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PlanStatus>('all');
  const [orderKeyword, setOrderKeyword] = useState('');
  const [productKeyword, setProductKeyword] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');

  const productStageSetMap = useMemo(() => {
    const map = new Map<string, Set<number>>();
    for (const item of workItems) {
      const bucket = map.get(item.product_id) || new Set<number>();
      bucket.add(Number(item.stage_index || 0));
      map.set(item.product_id, bucket);
    }
    for (const order of ordersData?.orders || []) {
      const assignments = readCheckpointAssignments(order);
      for (const [key, assignment] of Object.entries(assignments)) {
        if (!isTrackingAssignmentForProfile(assignment, viewerProfile, profiles)) continue;
        const productId = getTrackingProductId(key, assignment);
        const stageIndex = parseTrackingStageIndex(key, assignment);
        if (!productId || stageIndex === null) continue;
        const bucket = map.get(productId) || new Set<number>();
        bucket.add(stageIndex);
        map.set(productId, bucket);
      }
    }
    return map;
  }, [ordersData?.orders, profiles, viewerProfile, workItems]);

  const planRows = useMemo(() => {
    const orderById = new Map((ordersData?.orders || []).map((item) => [item.id, item]));
    const tasksByProduct = (tasksData || []).reduce<Map<string, TaskRow[]>>((acc, item) => {
      const bucket = acc.get(item.product_id) || [];
      bucket.push(item);
      acc.set(item.product_id, bucket);
      return acc;
    }, new Map());
    const workItemsByProduct = workItems.reduce<Map<string, MyTaskPreviewWorkItem[]>>((acc, item) => {
      const bucket = acc.get(item.product_id) || [];
      bucket.push(item);
      acc.set(item.product_id, bucket);
      return acc;
    }, new Map());

    return (ordersData?.products || [])
      .filter((product) => productStageSetMap.has(product.id))
      .map((product) => {
        const order = orderById.get(product.order_id);
        if (!order) return null;
        const orderProducts = (ordersData?.products || [])
          .filter((item) => item.order_id === order.id)
          .slice()
          .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        const displayOrderCode = getDisplayOrderCode(order);
        const displayProductCodeMap = buildDisplayProductCodeMap(displayOrderCode, orderProducts);
        const productTasks = (tasksByProduct.get(product.id) || [])
          .filter((task) => !task.archived)
          .slice()
          .sort((a, b) => Number(a.stage_index) - Number(b.stage_index));
        const fallbackStatus = getProductWorkflowStatus({
          finished: product.finished,
          readyForDelivery: product.ready_for_delivery,
          progress: product.progress,
          currentStageIndex: product.current_stage_index,
          tasks: productTasks,
          fallbackDeadline: order.deadline,
        }) as PlanStatus;
        const projectedDeadline = getProjectedProductDeadline(order, product.id, order.deadline || '') || order.deadline || '';
        const projectedStatus = resolveSummaryWorkflowStatus(
          getProjectedProductStatus(order, product.id, fallbackStatus) as PlanStatus,
          projectedDeadline || order.deadline || '',
        ) as PlanStatus;
        const primaryWorkItem = resolvePrimaryWorkItem(workItemsByProduct.get(product.id) || []);
        const taskDeadline = String(primaryWorkItem?.due_date || projectedDeadline || '').slice(0, 10);

        return {
          productId: product.id,
          orderId: order.id,
          displayOrderCode,
          displayProductCode: displayProductCodeMap.get(product.id) || product.id,
          orderName: normalizeText(order.title || '-'),
          productName: normalizeText(product.name || product.id),
          moduleCode: inferProductWorkflowModule(product.id, order.module) as 'ELN' | 'VIDEO' | 'GAME',
          type: mapOrderType(order),
          startDate: String(order.launched_at || order.submitted_at || order.deadline || '').slice(0, 10),
          deadline: projectedDeadline,
          taskDeadline,
          status: projectedStatus,
          currentStageIndex: Number(product.current_stage_index || 0),
          product,
          order,
        } satisfies PlanRow;
      })
      .filter((item): item is PlanRow => Boolean(item))
      .filter((item) => !moduleFilter || item.moduleCode === moduleFilter);
  }, [moduleFilter, ordersData?.orders, ordersData?.products, productStageSetMap, tasksData, workItems]);

  const filteredRows = useMemo(() => {
    const orderSearch = orderKeyword.trim().toLowerCase();
    const productSearch = productKeyword.trim().toLowerCase();
    return planRows.filter((row) => {
      if (!isScholarRole && typeFilter !== 'all' && row.type !== typeFilter) return false;
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (orderSearch && !row.displayOrderCode.toLowerCase().includes(orderSearch)) return false;
      if (!isScholarRole && productSearch && !row.displayProductCode.toLowerCase().includes(productSearch)) return false;
      if (isScholarRole && dateFilter && row.startDate !== dateFilter && row.taskDeadline !== dateFilter) return false;
      return true;
    });
  }, [dateFilter, isScholarRole, orderKeyword, planRows, productKeyword, statusFilter, typeFilter]);

  const groupedOrders = useMemo(() => {
    const grouped = new Map<string, { orderId: string; displayOrderCode: string; products: PlanRow[] }>();
    for (const row of filteredRows) {
      const bucket = grouped.get(row.orderId) || {
        orderId: row.orderId,
        displayOrderCode: row.displayOrderCode,
        products: [],
      };
      bucket.products.push(row);
      grouped.set(row.orderId, bucket);
    }
    return [...grouped.values()].sort((a, b) => a.displayOrderCode.localeCompare(b.displayOrderCode, 'vi'));
  }, [filteredRows]);

  const checkpointRowsByProductId = useMemo(() => {
    const map = new Map<string, CheckpointTableRow[]>();
    for (const row of filteredRows) {
      map.set(
        row.productId,
        buildCheckpointRows({
          row,
          tasks: tasksData,
          profiles,
          assignedStageSet: productStageSetMap.get(row.productId) || new Set<number>(),
        }),
      );
    }
    return map;
  }, [filteredRows, productStageSetMap, profiles, tasksData]);

  const kpi = useMemo(() => {
    return {
      inProgress: filteredRows.filter((item) => item.status === 'in_progress').length,
      completed: filteredRows.filter((item) => item.status === 'completed').length,
      overdue: filteredRows.filter((item) => item.status === 'overdue').length,
      pending: filteredRows.filter((item) => item.status === 'pending').length,
      notStarted: filteredRows.filter((item) => item.status === 'not_started').length,
    };
  }, [filteredRows]);

  const selectedRow = useMemo(() => planRows.find((item) => item.productId === selectedProductId) || null, [planRows, selectedProductId]);
  const selectedCheckpointRows = selectedRow
    ? (checkpointRowsByProductId.get(selectedRow.productId) || []).filter((item) => item.assignedToViewer)
    : [];

  function openProductModal(productId: string) {
    setSelectedProductId(productId);
  }

  function closeProductModal() {
    setSelectedProductId('');
  }

  function openStageDetail(stageCode: string, row: PlanRow) {
    const stageIndex = Number(stageCode.match(/(\d{2})$/)?.[1] || '1') - 1;
    const pageKey = getStagePageKey(row.moduleCode, stageIndex);
    if (!pageKey) return;
    navigate(`/${pageKey}?product=${encodeURIComponent(`${row.orderId}::${row.productId}`)}`);
  }

  const isLoading = (ordersQuery.isPending || tasksQuery.isPending || profilesQuery.isPending || previewQuery.isPending) && !ordersData;
  const dataError = previewQuery.error || ordersQuery.error || tasksQuery.error || profilesQuery.error;

  return (
    <div className="stack">
      {!shouldHideMyTasksHeader ? (
        <SectionHeader
          eye="PeopleOne / Công việc của tôi"
          title="Công việc của tôi"
          subtitle="Danh sách sản phẩm mà tài khoản hiện tại được giao ít nhất một công đoạn. Màn này chỉ đọc dữ liệu và mở nhanh sang đúng bước sản xuất."
        />
      ) : null}

      {!shouldHideMyTasksHeader ? (
        <div className="kpi-row production-plan-kpis">
          <Kpi label="Đang sản xuất" value={String(kpi.inProgress)} tone="violet" />
          <Kpi label="Hoàn thành" value={String(kpi.completed)} tone="success" />
          <Kpi label="Quá hạn" value={String(kpi.overdue)} tone="danger" />
          <Kpi label="Pending" value={String(kpi.pending)} tone="warning" />
          <Kpi label="Chưa sản xuất" value={String(kpi.notStarted)} tone="neutral" />
        </div>
      ) : null}

      <Card title="Bộ lọc công việc của tôi">
        <div className="production-plan-filter-grid">
          {!isScholarRole ? (
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
          ) : null}
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
          {isScholarRole ? (
            <label>
              <span>Ngày tháng</span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            </label>
          ) : (
            <label>
              <span>Mã sản phẩm</span>
              <input value={productKeyword} onChange={(event) => setProductKeyword(event.target.value)} placeholder="Ví dụ: HCMC_CMHV_H01" />
            </label>
          )}
        </div>
      </Card>

      <Card title={isScholarRole ? 'Danh sách công việc của tôi' : 'Danh sách sản phẩm tham gia'}>
        {isLoading ? <div className="muted-text">Đang tải dữ liệu công việc...</div> : null}
        {dataError ? <div className="bullet-item tone-danger">{dataError instanceof Error ? dataError.message : String(dataError)}</div> : null}
        <div className="production-plan-table-wrap production-plan-glass-panel my-tasks-products-table-wrap">
          <table className="data-table production-plan-table production-plan-table-compact production-plan-table-corporate my-tasks-products-table">
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Mã đơn hàng</th>
                <th>Tên sản phẩm</th>
                <th>Loại</th>
                <th>Bắt đầu</th>
                <th>Deadline</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groupedOrders.map((group) =>
                group.products.map((row) => {
                  return (
                    <tr key={row.productId}>
                      <td>{row.displayProductCode}</td>
                      <td>{row.displayOrderCode}</td>
                      <td className="production-plan-col-product-name">{row.productName}</td>
                      <td>{row.type}</td>
                      <td>{formatDate(row.startDate)}</td>
                      <td>{formatDate(row.taskDeadline || row.deadline)}</td>
                      <td>
                        <button
                          className="production-plan-icon-btn"
                          type="button"
                          title="Xem chi tiết"
                          aria-label={`Xem chi tiết ${row.displayProductCode}`}
                          onClick={() => openProductModal(row.productId)}
                        >
                          <Eye size={16} strokeWidth={1.9} />
                        </button>
                      </td>
                    </tr>
                  );
                }),
              )}
              {!isLoading && !filteredRows.length ? (
                <tr>
                  <td colSpan={7} className="muted-text">Chưa có sản phẩm nào được giao cho tài khoản hiện tại.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {selectedRow ? (
        <div className="results-modal-overlay" onClick={closeProductModal}>
          <div className="results-modal-shell production-plan-modal-shell" onClick={(event) => event.stopPropagation()}>
            <div className="results-modal-head">
              <h3>Chi tiết checking point · {selectedRow.displayProductCode}</h3>
              <div className="production-plan-modal-actions">
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
                    <th>Ghi chú</th>
                    <th>Chi tiết</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCheckpointRows.map((item) => (
                    <tr key={item.key}>
                      <td>{item.step.label}</td>
                      <td>{item.assigneeName || '-'}</td>
                      <td>
                        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                      </td>
                      <td className="production-plan-start-date-cell">
                        <div className="production-plan-start-date-badge">{formatDate(item.startDate)}</div>
                      </td>
                      <td>{formatDate(item.deadline)}</td>
                      <td>{item.note || '-'}</td>
                      <td>
                        <button className="btn btn-ghost btn-small" type="button" onClick={() => openStageDetail(item.stageCode, selectedRow)}>
                          Xem
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!selectedCheckpointRows.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có bước nào được giao cho tài khoản hiện tại.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

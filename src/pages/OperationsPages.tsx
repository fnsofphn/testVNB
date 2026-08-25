import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import type { AuthProfile } from '@/contexts/AuthContext';
import { useAppShell } from '@/contexts/AppShellContext';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { isAdminLikeRole } from '@/data/vcontent';
import { buildDisplayProductCodeMap, getDisplayOrderCode } from '@/lib/orderDisplayCodes';
import { getStatusDisplayLabel } from '@/lib/statusLabels';
import { fetchMyTasksPreview, getMyTasksPreviewQueryKey, shouldUseMyTasksPreview, type MyTaskPreviewWorkItem } from '@/lib/myTasksPreview';
import { isProfileIdAssignedToCurrentProfile, isTaskExplicitlyAssignedToCurrentProfile, normalizeEmail, profileEmailMatches } from '@/lib/taskAssignee';
import { getStageCode, getStagePageKey, getTaskStartActionType } from '@/lib/workflowTasks';
import {
  createActivityLog,
  createDelivery,
  createPaymentReceipt,
  createPaymentRequest,
  ensureWorkflowTasksForProducts,
  inferProductWorkflowModule,
  listActivityLogs,
  listDeliveries,
  listOrdersWithProducts,
  listPaymentReceipts,
  listPaymentRequests,
  listProfiles,
  listTasks,
  updateOrder,
  updateProduct,
  updateTask,
} from '@/services/vcontent';
import type { OrderRow, ProfileRow } from '@/services/vcontent';

type MyWorkItem = MyTaskPreviewWorkItem;

type TrackingAssignment = {
  productId?: string;
  stageCode?: string;
  assigneeProfileId?: string | null;
  assigneeEmail?: string | null;
  assigneeName?: string | null;
  plannedStartDate?: string | null;
  plannedDeadline?: string | null;
  checkpointStatus?: string | null;
};

function toneForStatus(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' | 'purple' {
  if (['overdue', 'qc_fail', 'fail', 'changes_requested', 'critical', 'rejected'].includes(status)) return 'danger';
  if (['submitted', 'review', 'in_review', 'ready_for_launch', 'packaging', 'warning', 'sent'].includes(status)) return 'warning';
  if (['done', 'approved', 'ready_delivery', 'paid', 'success', 'accepted', 'confirmed'].includes(status)) return 'success';
  if (['todo', 'not_started'].includes(status)) return 'purple';
  if (['in_production', 'in_progress', 'recording', 'editing', 'info'].includes(status)) return 'violet';
  return 'neutral';
}

function isProductLaunched(product: { id: string; progress: number }, tasks: Array<{ product_id: string; archived?: boolean }>) {
  return product.progress > 0 || tasks.some((task) => task.product_id === product.id && !task.archived);
}

function getStageEntryLabel(module: string) {
  if (module === 'VIDEO') return 'VSMF-01';
  if (module === 'GAME') return 'GSMF-01';
  return 'SMF-01';
}

function readTrackingAssignments(order: OrderRow) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, TrackingAssignment>;
  const assignments = (raw as { tracking_assignments?: Record<string, TrackingAssignment> }).tracking_assignments;
  if (!assignments || typeof assignments !== 'object') return {} as Record<string, TrackingAssignment>;
  return assignments;
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
  const value = String(status || '').trim();
  if (!value || value === 'not_started') return 'todo';
  if (value === 'completed') return 'done';
  return value;
}

function isTrackingAssignmentForProfile(assignment: TrackingAssignment, profile: AuthProfile | null, profiles: ProfileRow[]) {
  if (!profile) return true;
  if (profile.role === 'pm' || isAdminLikeRole(profile.role)) return true;
  if (profileEmailMatches(profile, assignment.assigneeEmail)) return true;
  if (isProfileIdAssignedToCurrentProfile(assignment.assigneeProfileId, profile, profiles)) return true;
  return Boolean(assignment.assigneeName && assignment.assigneeName === profile.fullName);
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

function getClientFacingOrderStatus(order: { status: string; change_request_reason?: string | null; rejection_reason?: string | null }) {
  if (['submitted', 'pm_review'].includes(order.status)) return 'Đã gửi xác nhận';
  if (['changes_requested'].includes(order.status)) return order.change_request_reason?.trim() ? `Cần bổ sung: ${order.change_request_reason}` : 'Cần bổ sung thông tin';
  if (['ready_for_launch', 'in_production'].includes(order.status)) return 'Đang sản xuất';
  if (['pending_acceptance'].includes(order.status)) return 'Đã bàn giao, chờ xác nhận';
  if (['ready_delivery'].includes(order.status)) return 'Sẵn sàng bàn giao';
  if (['paid'].includes(order.status)) return 'Đã thanh toán';
  if (order.rejection_reason?.trim()) return `Cần xử lý: ${order.rejection_reason}`;
  return 'Đang xử lý';
}

export function ProducerInboxRealPage() {
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const intakeOrders = (ordersQuery.data?.orders || []).filter((item) => ['submitted', 'pm_review', 'changes_requested'].includes(item.status));
  const productCountByOrder = useMemo(() => {
    const map = new Map<string, number>();
    for (const product of ordersQuery.data?.products || []) {
      map.set(product.order_id, (map.get(product.order_id) || 0) + 1);
    }
    return map;
  }, [ordersQuery.data]);

  const updateOrderMutation = useMutation({
    mutationFn: ({ orderId, patch }: { orderId: string; patch: any }) => updateOrder(orderId, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  return (
    <>
      <SectionHeader
        eye="PM Inbox"
        title="Hộp thư đơn hàng"
        subtitle="PM xử lý đơn ở mức order. Sau khi nhận đơn, từng product sẽ vào queue Launch để mở sản xuất độc lập."
      />
      <Card title="Đơn chờ PM xử lý">
        <div className="stack">
          {intakeOrders.map((order) => (
            <div className="list-item" key={order.id}>
              <div>
                <div className="list-title">{order.id} · {order.title}</div>
                <div className="muted-text">{order.client} · {order.module} · deadline {order.deadline}</div>
                <div className="muted-text">{productCountByOrder.get(order.id) || 0} product trong order</div>
                <div className="muted-text">{order.intake_note || 'Chưa có intake note.'}</div>
              </div>
              <div className="action-row">
                <Badge tone={toneForStatus(order.status)}>{getStatusDisplayLabel(order.status)}</Badge>
                <button className="btn btn-ghost btn-small" onClick={() => updateOrderMutation.mutate({ orderId: order.id, patch: { status: 'changes_requested' } })}>
                  Yêu cầu bổ sung
                </button>
                <button className="btn btn-danger btn-small" onClick={() => updateOrderMutation.mutate({ orderId: order.id, patch: { status: 'ready_for_launch' } })}>
                  Nhận đơn
                </button>
              </div>
            </div>
          ))}
          {!intakeOrders.length ? <div className="muted-text">Không còn đơn mới trong inbox.</div> : null}
          {updateOrderMutation.error ? <div className="bullet-item tone-danger">{String(updateOrderMutation.error)}</div> : null}
        </div>
      </Card>
    </>
  );
}

export function ProducerLaunchRealPage() {
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks() });

  const launchQueue = useMemo(() => {
    const orders = ordersQuery.data?.orders || [];
    const products = ordersQuery.data?.products || [];
    const tasks = tasksQuery.data || [];

    return orders
      .filter((order) => ['ready_for_launch', 'in_production'].includes(order.status))
      .flatMap((order) =>
        products
          .filter((product) => product.order_id === order.id)
          .filter((product) => !isProductLaunched(product, tasks))
          .map((product) => ({
            order,
            product,
            module: inferProductWorkflowModule(product.id, order.module),
          })),
      );
  }, [ordersQuery.data, tasksQuery.data]);

  const launchMutation = useMutation({
    mutationFn: async ({ orderId, productId }: { orderId: string; productId: string }) => {
      const product = (ordersQuery.data?.products || []).find((item) => item.id === productId);
      if (!product) throw new Error('Không tìm thấy product để launch.');

      await updateOrder(orderId, {
        status: 'in_production',
        launched_at: new Date().toISOString().slice(0, 10),
      });

      const module = inferProductWorkflowModule(product.id, (ordersQuery.data?.orders || []).find((item) => item.id === orderId)?.module);
      const defaultDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10);
      await ensureWorkflowTasksForProducts({
        orderId,
        products: [{ id: productId }],
        fallbackModule: module,
        dueDate: defaultDueDate,
      });

      await updateProduct(product.id, {
        current_stage_index: 0,
        progress: 5,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  return (
    <>
      <SectionHeader
        eye="Producer Launch"
        title="Chuyển vào sản xuất"
        subtitle="Launch theo product-level. Mỗi product được đưa vào stage đầu tiên theo module của chính nó."
      />
      <Card title="Queue product chờ launch">
        <div className="stack">
          {launchQueue.map(({ order, product, module }) => (
            <div className="list-item" key={product.id}>
              <div>
                <div className="list-title">{product.id} · {product.name}</div>
                <div className="muted-text">{order.id} · {order.client} · {module}</div>
                <div className="muted-text">Launch sẽ mở {getStageEntryLabel(module)}</div>
              </div>
              <div className="action-row">
                <Badge tone="warning">{getStatusDisplayLabel(order.status)}</Badge>
                <button className="btn btn-danger btn-small" onClick={() => launchMutation.mutate({ orderId: order.id, productId: product.id })} disabled={launchMutation.isPending}>
                  Chuyển vào sản xuất
                </button>
              </div>
            </div>
          ))}
          {!launchQueue.length ? <div className="muted-text">Không có product nào đang chờ launch.</div> : null}
          {launchMutation.error ? <div className="muted-text">{String(launchMutation.error)}</div> : null}
        </div>
      </Card>
    </>
  );
}

export function TasksRealPage() {
  const queryClient = useQueryClient();
  const { profile, loading } = useAuth();
  const { role: shellRole } = useAppShell();
  const viewerRole = String(profile?.role || shellRole || '').toLowerCase();
  const shouldUseServerPreview = false;
  const previewOptions = useMemo(() => ({ includeActivityLogs: true }), []);
  const previewQuery = useQuery({
    queryKey: getMyTasksPreviewQueryKey(viewerRole || shellRole, profile?.email || '', previewOptions),
    queryFn: () => fetchMyTasksPreview(viewerRole || shellRole, profile?.email || null, previewOptions),
    enabled: shouldUseServerPreview,
    staleTime: 1000 * 60,
  });
  const useFallbackQueries = !shouldUseServerPreview || previewQuery.isError;
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks(), enabled: useFallbackQueries });
  const activityLogsQuery = useQuery({
    queryKey: ['activity-logs', 'task-details'],
    queryFn: () =>
      listActivityLogs({
        actionTypes: ['workflow_step_assigned', 'task_started', 'workflow_step_started', 'workflow_review_claimed', 'workflow_step_submitted', 'workflow_step_returned', 'workflow_step_approved'],
        limit: 1000,
      }),
    enabled: useFallbackQueries,
  });
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts, enabled: useFallbackQueries });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'tasks-real'], queryFn: listProfiles, enabled: useFallbackQueries });
  const navigate = useNavigate();
  const ordersData = previewQuery.data ? { orders: previewQuery.data.orders, products: previewQuery.data.products } : ordersQuery.data;
  const tasksData = previewQuery.data?.tasks || tasksQuery.data || [];
  const activityLogs = previewQuery.data?.activityLogs || activityLogsQuery.data || [];
  const profiles: ProfileRow[] = previewQuery.data?.profiles || profilesQuery.data || [];
  const viewerProfile = profile || previewQuery.data?.viewerProfile || null;
  const previewWorkItems = previewQuery.data?.workItems || null;

  const orderMap = useMemo(() => new Map((ordersData?.orders || []).map((order) => [order.id, order])), [ordersData]);
  const productMap = useMemo(() => new Map((ordersData?.products || []).map((product) => [product.id, product])), [ordersData]);
  const displayProductCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    const orders = ordersData?.orders || [];
    const products = ordersData?.products || [];
    for (const order of orders) {
      const displayOrderCode = getDisplayOrderCode(order);
      const displayMap = buildDisplayProductCodeMap(displayOrderCode, products.filter((product) => product.order_id === order.id));
      for (const [productId, displayCode] of displayMap) map.set(productId, displayCode);
    }
    return map;
  }, [ordersData]);
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

  const scopedTasks = useMemo(
    () =>
      tasksData
        .filter((task) => {
          if (!viewerProfile) return true;
          if (viewerProfile.role === 'pm' || isAdminLikeRole(viewerProfile.role)) return true;
          return isTaskExplicitlyAssignedToCurrentProfile(task, viewerProfile, profiles);
        })
        .filter((task) => !task.archived)
        .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || Number(a.stage_index) - Number(b.stage_index)),
    [profiles, tasksData, viewerProfile],
  );

  const assignedWorkItems = useMemo(() => {
    if (previewWorkItems) {
      return [...previewWorkItems].sort(
        (a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || Number(a.stage_index) - Number(b.stage_index),
      );
    }

    const itemsByStage = new Map<string, MyWorkItem>();
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
      const trackingAssignments = readTrackingAssignments(order);
      for (const [assignmentKey, assignment] of Object.entries(trackingAssignments)) {
        if (!assignment || typeof assignment !== 'object') continue;
        if (!isTrackingAssignmentForProfile(assignment, viewerProfile, profiles)) continue;
        const productId = getTrackingProductId(assignmentKey, assignment);
        const stageIndex = parseTrackingStageIndex(assignmentKey, assignment);
        if (!productId || stageIndex === null) continue;
        const stageKey = `${order.id}::${productId}::${stageIndex}`;
        if (itemsByStage.has(stageKey)) continue;
        const dueDate = String(assignment.plannedDeadline || order.deadline || '').slice(0, 10) || null;
        let status = normalizeTrackingTaskStatus(assignment.checkpointStatus);
        if (status !== 'done' && dueDate && new Date(`${dueDate}T23:59:59`).getTime() < Date.now()) {
          status = 'overdue';
        }
        itemsByStage.set(stageKey, {
          id: `tracking:${stageKey}`,
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

    return [...itemsByStage.values()].sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')) || Number(a.stage_index) - Number(b.stage_index));
  }, [ordersData, previewWorkItems, profiles, scopedTasks, viewerProfile]);

  const productGroups = useMemo(() => {
    const groups = new Map<string, { productId: string; productName: string; displayProductCode: string; orderLabel: string; module: string; tasks: MyWorkItem[] }>();
    for (const task of assignedWorkItems) {
      const order = orderMap.get(task.order_id);
      const product = productMap.get(task.product_id);
      const module = inferProductWorkflowModule(task.product_id, order?.module);
      const group = groups.get(task.product_id) || {
        productId: task.product_id,
        productName: product?.name || task.product_id,
        displayProductCode: displayProductCodeMap.get(task.product_id) || task.product_id,
        orderLabel: order ? getDisplayOrderCode(order) : task.order_id,
        module,
        tasks: [],
      };
      group.tasks.push(task);
      groups.set(task.product_id, group);
    }
    return [...groups.values()].sort((a, b) => a.displayProductCode.localeCompare(b.displayProductCode, 'vi'));
  }, [assignedWorkItems, displayProductCodeMap, orderMap, productMap]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const selectedProductGroup = productGroups.find((group) => group.productId === selectedProductId) || productGroups[0] || null;
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const selectedWorkItem = assignedWorkItems.find((task) => task.id === selectedTaskId) || selectedProductGroup?.tasks[0] || assignedWorkItems[0] || null;

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, patch }: { taskId: string; patch: any }) => {
      const task = tasksData.find((entry) => entry.id === taskId);
      if (!task) throw new Error('Không tìm thấy task.');
      const order = orderMap.get(task.order_id);
      const module = inferProductWorkflowModule(task.product_id, order?.module);
      const stageCode = getStageCode(module, task.stage_index);
      await updateTask(taskId, patch);

      const nextProgress = Number(patch.progress ?? task.progress ?? 0);
      const currentProduct = productMap.get(task.product_id);
      if (currentProduct) {
        await updateProduct(task.product_id, {
          current_stage_index: Math.max(currentProduct.current_stage_index || 0, task.stage_index),
          progress: Math.max(currentProduct.progress || 0, nextProgress),
        });
      }

      if (patch.status === 'in_progress') {
        await updateOrder(task.order_id, { status: 'in_production' });
        if (task.status !== 'in_progress') {
          await createActivityLog({
            actorProfileId: viewerProfile?.id || null,
            actionType: getTaskStartActionType(module, task.stage_index),
            objectType: 'task',
            objectId: task.id,
            summary: stageCode ? `${task.product_id} started ${stageCode}` : `${task.product_id} started task B${task.stage_index + 1}`,
            metadata: {
              task_id: task.id,
              order_id: task.order_id,
              product_id: task.product_id,
              stage_index: task.stage_index,
              stage_code: stageCode,
              module,
              source: 'my_tasks',
            },
          });
        }
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['activity-logs', 'task-details'] });
    },
  });

  const openTaskStage = (task: MyWorkItem) => {
    const order = orderMap.get(task.order_id);
    const module = inferProductWorkflowModule(task.product_id, order?.module);
    const pageKey = getStagePageKey(module, task.stage_index);
    if (pageKey) navigate(`/${pageKey}?product=${encodeURIComponent(`${task.order_id}::${task.product_id}`)}`);
  };
  const findLatestTaskLog = (task: MyWorkItem) =>
    activityLogs.find((log) => {
      const metadataTaskId = typeof log.metadata?.task_id === 'string' ? log.metadata.task_id : null;
      if (task.taskId && metadataTaskId === task.taskId) return true;
      const metadataProductId = typeof log.metadata?.product_id === 'string' ? log.metadata.product_id : null;
      const metadataStageIndex = Number(log.metadata?.stage_index);
      return metadataProductId === task.product_id && Number.isFinite(metadataStageIndex) && metadataStageIndex === task.stage_index;
    }) || null;
  const overdueTaskCount = assignedWorkItems.filter((task) => task.due_date && new Date(`${task.due_date}T23:59:59`).getTime() < Date.now() && task.status !== 'done').length;

  useEffect(() => {
    const scope = document.querySelector('.content-grid.two-column') as HTMLElement | null;
    if (!scope) return;
    if (!scope.querySelector('.task-list-card')) return;

    const onMove = (event: MouseEvent) => {
      const rect = scope.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      scope.style.setProperty('--spot-x', `${x}px`);
      scope.style.setProperty('--spot-y', `${y}px`);
    };

    const onLeave = () => {
      scope.style.setProperty('--spot-x', '50%');
      scope.style.setProperty('--spot-y', '50%');
    };

    scope.addEventListener('mousemove', onMove);
    scope.addEventListener('mouseleave', onLeave);
    return () => {
      scope.removeEventListener('mousemove', onMove);
      scope.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <>
      <SectionHeader
        eye="Workspace cá nhân"
        title="Công việc của tôi"
        subtitle="Tổng hợp theo sản phẩm và các công đoạn SMF/VSMF/GSMF được giao cho tài khoản hiện tại."
      />
      <div className="kpi-row small">
        <Badge tone="violet">{productGroups.length} sản phẩm</Badge>
        <Badge tone="neutral">{assignedWorkItems.length} công đoạn</Badge>
        <Badge tone={overdueTaskCount ? 'danger' : 'success'}>{overdueTaskCount} quá hạn</Badge>
        {viewerProfile ? <Badge tone="neutral">{viewerProfile.email || viewerProfile.fullName}</Badge> : null}
      </div>
      <div className="content-grid two-column">
        <Card title="Sản phẩm được giao">
          <div className="stack">
            {productGroups.map((group) => {
              const active = selectedProductGroup?.productId === group.productId;
              return (
                <button
                  key={group.productId}
                  className={`list-item workflow-nav-card task-list-card${active ? ' active' : ''}`}
                  onClick={() => {
                    setSelectedProductId(group.productId);
                    setSelectedTaskId(group.tasks[0]?.id || '');
                  }}
                >
                  <div className="workflow-nav-main">
                    <div className="workflow-nav-code">{group.displayProductCode}</div>
                    <div className="workflow-nav-meta">{group.productName}</div>
                    <div className="workflow-nav-meta">{group.orderLabel} · {group.tasks.length} công đoạn</div>
                    <div className="action-row">
                      {group.tasks.map((task) => {
                        const stageCode = getStageCode(group.module, task.stage_index) || `B${task.stage_index + 1}`;
                        return <Badge key={task.id} tone={toneForStatus(task.status)}>{stageCode}</Badge>;
                      })}
                    </div>
                  </div>
                </button>
              );
            })}
            {!productGroups.length ? <div className="muted-text">Chưa có sản phẩm hoặc công đoạn nào được giao.</div> : null}
          </div>
        </Card>
        <Card title={selectedProductGroup ? `Công đoạn của ${selectedProductGroup.displayProductCode}` : 'Công đoạn được giao'}>
          {selectedProductGroup ? (
            <div className="stack compact task-detail-summary">
              {selectedProductGroup.tasks.map((task) => {
                const stageCode = getStageCode(selectedProductGroup.module, task.stage_index) || `B${task.stage_index + 1}`;
                const latestLog = findLatestTaskLog(task);
                const active = selectedWorkItem?.id === task.id;
                return (
                  <div className={`list-item workflow-nav-card${active ? ' active' : ''}`} key={task.id} onClick={() => setSelectedTaskId(task.id)}>
                    <div className="workflow-nav-main">
                      <div className="action-row">
                        <Badge tone={toneForStatus(task.status)}>{stageCode}</Badge>
                        <span className="muted-text">{getStatusDisplayLabel(task.status)}</span>
                        {task.source === 'tracking' ? <Badge tone="warning">Từ kế hoạch</Badge> : <Badge tone="neutral">Task</Badge>}
                      </div>
                      <div className="workflow-nav-meta">Deadline: {task.due_date || '-'}</div>
                      <div className="workflow-nav-meta">Người thực hiện: {task.assignee || viewerProfile?.fullName || '-'}{task.assignee_email ? ` · ${task.assignee_email}` : ''}</div>
                      <div className="workflow-nav-meta">Bắt đầu: {task.taskId && startedAtByTask.get(task.taskId) ? new Date(String(startedAtByTask.get(task.taskId))).toLocaleString('vi-VN') : '-'}</div>
                      <div className="workflow-nav-meta">
                        Log: {latestLog ? `${localizeWorkflowText(latestLog.summary)} · ${new Date(latestLog.happened_at).toLocaleString('vi-VN')}` : 'Chưa có log xử lý'}
                      </div>
                    </div>
                    <div className="action-row">
                      <button
                        className="btn btn-ghost btn-small"
                        disabled={!task.taskId || shouldUseServerPreview}
                        onClick={() => task.taskId && !shouldUseServerPreview && updateTaskMutation.mutate({ taskId: task.taskId, patch: { status: 'in_progress', progress: Math.max(task.progress, 25) } })}
                      >
                        Start
                      </button>
                      <button
                        className="btn btn-ghost btn-small"
                        disabled={!task.taskId || shouldUseServerPreview}
                        onClick={() => task.taskId && !shouldUseServerPreview && updateTaskMutation.mutate({ taskId: task.taskId, patch: { status: 'done', progress: 100 } })}
                      >
                        Done
                      </button>
                      <button className="btn btn-danger btn-small" onClick={() => openTaskStage(task)}>
                        Mở màn
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="muted-text">Chưa có sản phẩm được giao.</div>
          )}
          {updateTaskMutation.error ? <div className="muted-text tone-danger">{String(updateTaskMutation.error)}</div> : null}
        </Card>
      </div>
    </>
  );

}

export function DeliveryRealPage() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const deliveriesQuery = useQuery({ queryKey: ['deliveries'], queryFn: listDeliveries });
  const [selectedProductId, setSelectedProductId] = useState('');
  const [deliveryNote, setDeliveryNote] = useState('');

  const deliverableProducts = (ordersQuery.data?.products || []).filter((product) => product.ready_for_delivery || product.finished || product.progress >= 100);

  const createDeliveryMutation = useMutation({
    mutationFn: async () => {
      if (!profile || !selectedProductId) throw new Error('Thiếu profile hoặc product được chọn.');
      const product = (ordersQuery.data?.products || []).find((item) => item.id === selectedProductId);
      if (!product) throw new Error('Không tìm thấy product.');
      await updateProduct(product.id, {
        ready_for_delivery: true,
        finished: true,
        delivered_at: new Date().toISOString().slice(0, 10),
      });
      const deliveryId = await createDelivery({
        sentByProfileId: profile.id,
        note: deliveryNote,
        items: [
          {
            orderId: product.order_id,
            productId: product.id,
            productName: product.name,
          },
        ],
      });
      await updateOrder(product.order_id, { status: 'pending_acceptance' });
      return deliveryId;
    },
    onSuccess: async () => {
      setSelectedProductId('');
      setDeliveryNote('');
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['deliveries'] });
    },
  });

  return (
    <>
      <SectionHeader eye="Delivery" title="Bàn giao sản phẩm" subtitle="PM tạo batch bàn giao thật. Sau khi gửi, order chuyển sang pending_acceptance." />
      <div className="content-grid two-column">
        <Card title="Tạo batch bàn giao">
          <div className="form-grid">
            <label>
              <span>Sản phẩm sẵn sàng</span>
              <select value={selectedProductId} onChange={(event) => setSelectedProductId(event.target.value)}>
                <option value="">-- Chọn product --</option>
                {deliverableProducts.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>
            <label className="full">
              <span>Ghi chú bàn giao</span>
              <textarea value={deliveryNote} onChange={(event) => setDeliveryNote(event.target.value)} placeholder="Nội dung bàn giao, link package, ghi chú nghiệm thu..." />
            </label>
            <div className="action-row">
              <button className="btn btn-danger" onClick={() => createDeliveryMutation.mutate()} disabled={!selectedProductId || createDeliveryMutation.isPending}>
                {createDeliveryMutation.isPending ? 'Đang tạo...' : 'Tạo batch bàn giao'}
              </button>
            </div>
            {createDeliveryMutation.error ? <div className="muted-text">{String(createDeliveryMutation.error)}</div> : null}
          </div>
        </Card>
        <Card title="Batch gần nhất">
          <div className="stack compact">
            {(deliveriesQuery.data || []).slice(0, 6).map((item) => (
              <div className="bullet-item" key={item.id}>{item.id} · {item.status} · {item.sent_at}</div>
            ))}
            {!deliveriesQuery.data?.length ? <div className="muted-text">Chưa có batch delivery nào.</div> : null}
          </div>
        </Card>
      </div>
    </>
  );
}

export function PaymentRealPage({ clientMode = false }: { clientMode?: boolean }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const paymentRequestsQuery = useQuery({ queryKey: ['payment-requests'], queryFn: listPaymentRequests });
  const paymentReceiptsQuery = useQuery({ queryKey: ['payment-receipts'], queryFn: listPaymentReceipts });
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [amount, setAmount] = useState('0');
  const [note, setNote] = useState('');

  const requestMutation = useMutation({
    mutationFn: async () => {
      if (!profile || !selectedOrderId) throw new Error('Thiếu order hoặc profile hiện tại.');
      return createPaymentRequest({
        orderId: selectedOrderId,
        title: `Thanh toán ${selectedOrderId}`,
        amount: Number(amount),
        dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().slice(0, 10),
        createdByProfileId: profile.id,
        note,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      setSelectedOrderId('');
      setAmount('0');
      setNote('');
    },
  });

  const confirmPaymentMutation = useMutation({
    mutationFn: ({ paymentRequestId, orderId, payAmount }: { paymentRequestId: string; orderId: string; payAmount: number }) => {
      if (!profile) throw new Error('Thiếu profile hiện tại.');
      return createPaymentReceipt({
        paymentRequestId,
        orderId,
        amount: payAmount,
        paidAt: new Date().toISOString().slice(0, 10),
        note: 'Client confirmed payment on portal.',
        confirmedByProfileId: profile.id,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-requests'] });
      await queryClient.invalidateQueries({ queryKey: ['payment-receipts'] });
    },
  });

  const visibleOrders = (ordersQuery.data?.orders || []).filter((order) => {
    if (profile?.companyId && order.company_id !== profile.companyId) return false;
    return clientMode ? true : ['pending_acceptance', 'ready_delivery', 'paid', 'in_production'].includes(order.status);
  });
  const visiblePaymentRequests = (paymentRequestsQuery.data || []).filter((item) => {
    const order = (ordersQuery.data?.orders || []).find((entry) => entry.id === item.order_id);
    if (!order) return !clientMode;
    if (profile?.companyId && order.company_id !== profile.companyId) return false;
    return true;
  });

  return (
    <>
      <SectionHeader
        eye="Payment"
        title={clientMode ? 'Thanh toán' : 'Đề nghị thanh toán'}
        subtitle={clientMode ? 'Client xác nhận đã thanh toán và sinh receipt thật.' : 'PM tạo payment request thật trên Supabase.'}
      />
      <div className="content-grid two-column">
        {!clientMode ? (
          <Card title="Tạo đề nghị thanh toán">
            <div className="form-grid">
              <label>
                <span>Order</span>
                <select value={selectedOrderId} onChange={(event) => setSelectedOrderId(event.target.value)}>
                  <option value="">-- Chọn order --</option>
                  {visibleOrders.map((order) => (
                    <option key={order.id} value={order.id}>{order.id} · {order.title}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Số tiền</span>
                <input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </label>
              <label className="full">
                <span>Ghi chú</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Nội dung thanh toán, đợt, điều kiện..." />
              </label>
              <div className="action-row">
                <button className="btn btn-danger" onClick={() => requestMutation.mutate()} disabled={!selectedOrderId || Number(amount) <= 0 || requestMutation.isPending}>
                  {requestMutation.isPending ? 'Đang tạo...' : 'Tạo đề nghị'}
                </button>
              </div>
              {requestMutation.error ? <div className="muted-text">{String(requestMutation.error)}</div> : null}
            </div>
          </Card>
        ) : null}
        <Card title={clientMode ? 'Yêu cầu thanh toán của tôi' : 'Danh sách payment request'}>
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Order</th>
                <th>Số tiền</th>
                <th>Trạng thái</th>
                <th>Hạn</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visiblePaymentRequests.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.order_id}</td>
                  <td>{Number(item.amount).toLocaleString('vi-VN')} {item.currency}</td>
                  <td><Badge tone={toneForStatus(item.status)}>{clientMode ? getClientFacingOrderStatus({ status: item.status }) : item.status}</Badge></td>
                  <td>{item.due_date}</td>
                  <td>
                    {clientMode && item.status !== 'paid' ? (
                      <button className="btn btn-ghost btn-small" onClick={() => confirmPaymentMutation.mutate({ paymentRequestId: item.id, orderId: item.order_id, payAmount: Number(item.amount) })}>
                        Xác nhận đã thanh toán
                      </button>
                    ) : (
                      <span className="muted-text">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {confirmPaymentMutation.error ? <div className="muted-text">{String(confirmPaymentMutation.error)}</div> : null}
          <div className="stack compact">
            {(paymentReceiptsQuery.data || []).slice(0, 4).map((receipt) => (
              <div className="bullet-item" key={receipt.id}>{receipt.id} · {receipt.order_id} · {receipt.paid_at}</div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

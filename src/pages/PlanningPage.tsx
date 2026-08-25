import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { getProjectedOrderStatus, getProjectedProductDeadline, getProjectedProductStatus } from '@/lib/workflowProjection';
import { getOrderWorkflowStatus, getProductWorkflowStatus, getTaskWorkflowStatus, resolveSummaryWorkflowStatus, type WorkflowStatus } from '@/lib/workflowStatus';
import {
  listOrdersWithProducts,
  listTasks,
  updateOrder,
  type OrderRow,
  type ProductRow,
  type TaskRow,
} from '@/services/vcontent';

type PlanStatus = 'not_started' | 'in_progress' | 'overdue' | 'pending' | 'completed';
type OrderType = 'H' | 'E' | 'G' | 'M';

type ProductRowView = {
  productId: string;
  productName: string;
  status: PlanStatus;
  deadline: string;
};

type CheckpointRow = {
  checkpointId: string;
  orderId: string;
  productId: string;
  productName: string;
  deadline: string;
  status: PlanStatus;
  note: string;
};

type OrderRowView = {
  orderId: string;
  orderName: string;
  orderType: OrderType;
  customer: string;
  productCount: number;
  deadline: string;
  status: PlanStatus;
  pmNote: string;
  products: ProductRowView[];
  checkpoints: CheckpointRow[];
};

type StoredCheckpoint = {
  checkpointId?: string;
  productId?: string;
  productName?: string;
  deadline?: string;
  status?: PlanStatus;
  note?: string;
};

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
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value: string | null | undefined) {
  const date = parseDate(value);
  if (!date) return '-';
  return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
}

function buildDisplayProductCodeMap(orderId: string, products: Array<{ productId: string }>) {
  const baseCode = String(orderId || '').trim().toUpperCase();
  return new Map(
    products.map((product, index) => [
      product.productId,
      baseCode ? `${baseCode}_${String(index + 1).padStart(2, '0')}` : product.productId,
    ]),
  );
}

function mapOrderType(order: OrderRow): OrderType {
  const match = String(order.id || '').toUpperCase().match(/_([HEGM])$/);
  if (match) return match[1] as OrderType;
  const module = String(order.module || '').toUpperCase();
  if (module === 'GAME') return 'G';
  if (module === 'ELN') return 'E';
  if (module === 'VIDEO') return 'H';
  return 'M';
}

function mapCustomer(order: OrderRow) {
  const prefix = String(order.id || '').split('_')[0]?.trim();
  if (prefix) return prefix;
  return String(order.client || '').trim() || '-';
}

function mapTaskStatus(task: TaskRow, fallbackDeadline?: string) {
  return getTaskWorkflowStatus(task, fallbackDeadline) as PlanStatus;
}

function mapProductStatus(product: ProductRow, order: OrderRow, tasks: TaskRow[]) {
  const computedStatus = getProductWorkflowStatus({
    finished: product.finished,
    readyForDelivery: product.ready_for_delivery,
    progress: product.progress,
    currentStageIndex: product.current_stage_index,
    tasks,
    fallbackDeadline: order.deadline,
  }) as PlanStatus;
  return getProjectedProductStatus(order, product.id, computedStatus) as PlanStatus;
}

function mapOrderStatus(order: OrderRow, products: ProductRowView[]) {
  const computedStatus = getOrderWorkflowStatus(products.map((item) => item.status) as WorkflowStatus[]) as PlanStatus;
  return getProjectedOrderStatus(order, computedStatus) as PlanStatus;
}

function getOrderStoredCheckpoints(order: OrderRow) {
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
        status: (row.status || 'not_started') as PlanStatus,
        note: String(row.note || '').trim(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function buildDefaultCheckpoints(order: OrderRow, products: ProductRowView[]) {
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

function mergeCheckpoints(order: OrderRow, products: ProductRowView[]) {
  const defaults = buildDefaultCheckpoints(order, products);
  const stored = getOrderStoredCheckpoints(order);
  const mergedById = new Map(defaults.map((item) => [item.checkpointId, item]));

  for (const item of stored) {
    if (!item.checkpointId) continue;
    const current = mergedById.get(item.checkpointId);
    if (current) {
      mergedById.set(item.checkpointId, {
        ...current,
        productId: item.productId || current.productId,
        productName: item.productName || current.productName,
        deadline: item.deadline || current.deadline,
        status: item.status || current.status,
        note: item.note || current.note,
      });
      continue;
    }

    mergedById.set(item.checkpointId, {
      checkpointId: item.checkpointId,
      orderId: order.id,
      productId: item.productId || '',
      productName: item.productName || 'Checkpoint bổ sung',
      deadline: item.deadline || order.deadline || '',
      status: item.status || 'not_started',
      note: item.note || '',
    });
  }

  return [...mergedById.values()];
}

function buildOrderRows(orders: OrderRow[], products: ProductRow[], tasks: TaskRow[]) {
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
    const orderProducts = (productsByOrder.get(order.id) || []).map((product) => {
      const productTasks = (tasksByProduct.get(product.id) || []).slice().sort((a, b) => Number(a.stage_index) - Number(b.stage_index));
      const deadline = productTasks[productTasks.length - 1]?.due_date || order.deadline || '';
      return {
        productId: product.id,
        productName: product.name,
        deadline: getProjectedProductDeadline(order, product.id, deadline) || deadline,
        status: resolveSummaryWorkflowStatus(
          mapProductStatus(product, order, productTasks),
          getProjectedProductDeadline(order, product.id, deadline) || deadline,
        ) as PlanStatus,
      } satisfies ProductRowView;
    });

    return {
      orderId: order.id,
      orderName: order.title || '-',
      orderType: mapOrderType(order),
      customer: mapCustomer(order),
      productCount: orderProducts.length,
      deadline: order.deadline || '',
      status: mapOrderStatus(order, orderProducts),
      pmNote: String(order.intake_note || '').trim(),
      products: orderProducts,
      checkpoints: mergeCheckpoints(order, orderProducts),
    } satisfies OrderRowView;
  });
}

function toStoredCheckpointPayload(row: CheckpointRow) {
  return {
    checkpointId: row.checkpointId,
    productId: row.productId,
    productName: row.productName,
    deadline: row.deadline,
    status: row.status,
    note: row.note,
  };
}

export function PlanningSetupPage() {
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'order-plan'], queryFn: () => listTasks() });

  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [checkpointProductId, setCheckpointProductId] = useState('');
  const [checkpointDeadline, setCheckpointDeadline] = useState('');
  const [checkpointStatus, setCheckpointStatus] = useState<PlanStatus>('not_started');
  const [checkpointNote, setCheckpointNote] = useState('');

  const orders = ordersQuery.data?.orders || [];
  const products = ordersQuery.data?.products || [];
  const tasks = tasksQuery.data || [];
  const orderRows = useMemo(() => buildOrderRows(orders, products, tasks), [orders, products, tasks]);
  const selectedOrder = orderRows.find((item) => item.orderId === selectedOrderId) || null;
  const selectedOrderProductCodeMap = useMemo(
    () => (selectedOrder ? buildDisplayProductCodeMap(selectedOrder.orderId, selectedOrder.products) : new Map<string, string>()),
    [selectedOrder],
  );

  const kpi = useMemo(() => {
    const projectSet = new Set(orderRows.map((item) => `${item.customer}::${item.orderName}`));
    const totalProducts = orderRows.reduce((sum, row) => sum + row.productCount, 0);
    return {
      totalOrders: orderRows.length,
      totalProducts,
      totalProjects: projectSet.size,
    };
  }, [orderRows]);

  const saveCheckpointMutation = useMutation({
    mutationFn: async (payload: { orderId: string; checkpoints: CheckpointRow[] }) => {
      const order = orders.find((item) => item.id === payload.orderId);
      if (!order) throw new Error('Không tìm thấy đơn hàng để lưu checkpoint.');

      const base =
        order.stage_sla_overrides && typeof order.stage_sla_overrides === 'object'
          ? order.stage_sla_overrides
          : {};

      await updateOrder(payload.orderId, {
        stage_sla_overrides: {
          ...base,
          order_checkpoints: payload.checkpoints.map(toStoredCheckpointPayload),
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      setCheckpointDeadline('');
      setCheckpointNote('');
      setCheckpointStatus('not_started');
    },
  });

  function handleAddCheckpoint() {
    if (!selectedOrder) return;
    const nextIndex = selectedOrder.checkpoints.length + 1;
    const fallbackProduct = selectedOrder.products[0] || null;
    const product = selectedOrder.products.find((item) => item.productId === checkpointProductId) || fallbackProduct;
    if (!product) return;

    const nextCheckpoint: CheckpointRow = {
      checkpointId: `${selectedOrder.orderId}_CP${String(nextIndex).padStart(2, '0')}`,
      orderId: selectedOrder.orderId,
      productId: product.productId,
      productName: product.productName,
      deadline: checkpointDeadline || selectedOrder.deadline || '',
      status: checkpointStatus,
      note: checkpointNote.trim(),
    };

    saveCheckpointMutation.mutate({
      orderId: selectedOrder.orderId,
      checkpoints: [...selectedOrder.checkpoints, nextCheckpoint],
    });
  }

  if (selectedOrder) {
    return (
      <>
        <SectionHeader
          eye="Tổng quan / Kế hoạch sản xuất"
          title={`Chi tiết đơn hàng ${selectedOrder.orderId}`}
          subtitle="Xem danh sách sản phẩm theo đơn hàng, checkpoint và ghi chú PM."
          actions={<button className="btn btn-ghost" onClick={() => setSelectedOrderId('')}>← Quay lại danh sách đơn hàng</button>}
        />

        <div className="kpi-row small">
          <Kpi label="Mã đơn hàng" value={selectedOrder.orderId} sub={selectedOrder.customer} tone="neutral" />
          <Kpi label="Số sản phẩm" value={String(selectedOrder.productCount)} sub="Trong đơn hàng hiện tại" tone="warning" />
          <Kpi label="Hạn hoàn thành" value={formatDate(selectedOrder.deadline)} sub="Theo đơn hàng" tone="violet" />
          <Kpi label="Trạng thái" value={STATUS_LABEL[selectedOrder.status]} sub="Tổng hợp theo sản phẩm" tone={STATUS_TONE[selectedOrder.status]} />
        </div>

        <Card title="Danh sách sản phẩm trong đơn hàng">
          <table className="data-table order-plan-table">
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>Deadline</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {selectedOrder.products.map((product) => (
                <tr key={product.productId}>
                  <td>{product.productId}</td>
                  <td>{product.productName}</td>
                  <td>{formatDate(product.deadline)}</td>
                  <td><Badge tone={STATUS_TONE[product.status]}>{STATUS_LABEL[product.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Checking point">
          <table className="data-table order-plan-table">
            <thead>
              <tr>
                <th>Mã sản phẩm</th>
                <th>Tên sản phẩm</th>
                <th>Deadline</th>
                <th>Trạng thái</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {selectedOrder.checkpoints.map((checkpoint) => (
                <tr key={checkpoint.checkpointId}>
                  <td>{selectedOrderProductCodeMap.get(checkpoint.productId) || checkpoint.productId}</td>
                  <td>{checkpoint.productName}</td>
                  <td>{formatDate(checkpoint.deadline)}</td>
                  <td><Badge tone={STATUS_TONE[checkpoint.status]}>{STATUS_LABEL[checkpoint.status]}</Badge></td>
                  <td>{checkpoint.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Tạo checking point cho đơn hàng">
          <div className="order-plan-checkpoint-form">
            <label>
              <span>Sản phẩm</span>
              <select value={checkpointProductId} onChange={(event) => setCheckpointProductId(event.target.value)}>
                <option value="">Chọn sản phẩm</option>
                {selectedOrder.products.map((product) => (
                  <option key={product.productId} value={product.productId}>{product.productName}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Deadline</span>
              <input type="date" value={checkpointDeadline} onChange={(event) => setCheckpointDeadline(event.target.value)} />
            </label>

            <label>
              <span>Trạng thái</span>
              <select value={checkpointStatus} onChange={(event) => setCheckpointStatus(event.target.value as PlanStatus)}>
                <option value="not_started">Chưa bắt đầu</option>
                <option value="in_progress">Đang thực hiện</option>
                <option value="overdue">Quá hạn</option>
                <option value="pending">Pending</option>
                <option value="completed">Hoàn thành</option>
              </select>
            </label>

            <label>
              <span>Ghi chú</span>
              <input value={checkpointNote} onChange={(event) => setCheckpointNote(event.target.value)} placeholder="Ghi chú của PM..." />
            </label>

            <div className="action-row">
              <button className="btn btn-primary" onClick={handleAddCheckpoint} disabled={saveCheckpointMutation.isPending}>
                {saveCheckpointMutation.isPending ? 'Đang lưu...' : 'Thêm checkpoint'}
              </button>
            </div>
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionHeader
        eye="Tổng quan / Kế hoạch sản xuất"
        title="Kế hoạch sản xuất"
        subtitle="Theo dõi đơn hàng theo lớp tổng hợp. Nhấn View chi tiết đơn hàng để xem danh sách sản phẩm và checkpoint."
      />

      <div className="kpi-row">
        <Kpi label="Tổng số đơn hàng" value={String(kpi.totalOrders)} tone="danger" />
        <Kpi label="Tổng số sản phẩm" value={String(kpi.totalProducts)} tone="warning" />
        <Kpi label="Tổng số dự án" value={String(kpi.totalProjects)} tone="success" />
      </div>

      <Card title="Danh sách đơn hàng">
        <table className="data-table order-plan-table">
          <thead>
            <tr>
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
            {orderRows.map((row) => (
              <tr key={row.orderId}>
                <td>{row.orderId}</td>
                <td>{row.orderName}</td>
                <td>{row.orderType}</td>
                <td>{row.customer}</td>
                <td>{row.productCount}</td>
                <td className="order-plan-date-cell">{formatDate(row.deadline)}</td>
                <td className="order-plan-status-cell"><Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge></td>
                <td className="order-plan-action-cell">
                  <button className="btn btn-ghost btn-small" onClick={() => setSelectedOrderId(row.orderId)}>
                    View chi tiết đơn hàng
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

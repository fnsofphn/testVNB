import { useMemo, useState } from 'react';
import { Badge, Card } from '@/components/ui/Primitives';
import { getDisplayOrderCode } from '@/lib/orderDisplayCodes';
import { getProjectedOrderStatus, getProjectedProductStatus } from '@/lib/workflowProjection';
import { getOrderWorkflowStatus, getProductWorkflowStatus, resolveSummaryWorkflowStatus, type WorkflowStatus } from '@/lib/workflowStatus';
import { inferProductWorkflowModule, type OrderRow, type ProductRow, type TaskRow } from '@/services/vcontent';

type ModuleCode = 'ELN' | 'VIDEO' | 'GAME';
type OrderTypeCode = 'E' | 'H' | 'G' | 'M';
type OrderCatalogSection = {
  type: OrderTypeCode;
  title: string;
  orders: OrderCatalogRow[];
};

type OrderCatalogRow = {
  order: OrderRow;
  orderType: OrderTypeCode;
  products: ProductRow[];
  ownerTags: string[];
  currentStepLabel: string;
  currentStepIndex: number;
  statusLabel: string;
  statusTone: 'danger' | 'warning' | 'success' | 'neutral' | 'violet';
};

type WorkflowStep = {
  label: string;
  stageIndex: number;
};

const MODULE_SECTION_TYPES: Record<ModuleCode, OrderTypeCode[]> = {
  ELN: ['E', 'M'],
  VIDEO: ['H', 'M'],
  GAME: ['G', 'M'],
};

const SECTION_TITLES: Record<OrderTypeCode, string> = {
  E: 'Danh mục đơn hàng E',
  H: 'Danh mục đơn hàng H',
  G: 'Danh mục đơn hàng G',
  M: 'Danh mục đơn hàng M',
};

const STEP_CONFIGS: Record<ModuleCode, WorkflowStep[]> = {
  ELN: [
    { label: 'Storyboard', stageIndex: 1 },
    { label: 'Thiết kế Slide', stageIndex: 2 },
    { label: 'QC Slide', stageIndex: 3 },
    { label: 'Thu voice', stageIndex: 4 },
    { label: 'QC voice', stageIndex: 5 },
    { label: 'Biên tập video', stageIndex: 6 },
    { label: 'QC video', stageIndex: 7 },
    { label: 'Scorm, Quiz', stageIndex: 8 },
  ],
  VIDEO: [
    { label: 'Storyboard', stageIndex: 1 },
    { label: 'Thiết kế Slide', stageIndex: 2 },
    { label: 'QC Slide', stageIndex: 3 },
    { label: 'Thu voice', stageIndex: 4 },
    { label: 'QC voice', stageIndex: 5 },
    { label: 'Biên tập video', stageIndex: 6 },
    { label: 'QC video', stageIndex: 7 },
    { label: 'Bàn giao', stageIndex: 8 },
  ],
  GAME: [
    { label: 'Yêu cầu khởi chạy', stageIndex: 0 },
    { label: 'Màn chạy thử game', stageIndex: 1 },
    { label: 'QC game', stageIndex: 2 },
    { label: 'Game hoàn chỉnh', stageIndex: 3 },
  ],
};

function readOrderMeta(order: OrderRow) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, unknown>;
  const orderMeta = (raw as { order_meta?: Record<string, unknown> }).order_meta;
  if (!orderMeta || typeof orderMeta !== 'object') return {} as Record<string, unknown>;
  return orderMeta;
}

function normalizeOrderType(order: OrderRow): OrderTypeCode {
  const orderMeta = readOrderMeta(order);
  const explicit = String(order.order_type || orderMeta.order_type || '').trim().toUpperCase();
  if (explicit === 'E' || explicit === 'H' || explicit === 'G' || explicit === 'M') return explicit;
  if (order.module === 'GAME') return 'G';
  if (order.module === 'VIDEO') return 'H';
  return 'E';
}

function getStatusTone(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' {
  if (['overdue', 'qc_fail', 'fail', 'changes_requested', 'rejected'].includes(status)) return 'danger';
  if (['not_started', 'todo'].includes(status)) return 'violet';
  if (['submitted', 'review', 'in_review', 'pending', 'ready_for_launch'].includes(status)) return 'warning';
  if (['done', 'approved', 'ready_delivery', 'paid', 'completed'].includes(status)) return 'success';
  if (['in_production', 'in_progress', 'recording', 'editing'].includes(status)) return 'violet';
  return 'neutral';
}

function getStatusLabel(status: string) {
  if (status === 'not_started') return 'Chưa bắt đầu';
  if (status === 'in_progress') return 'Đang thực hiện';
  if (status === 'pending') return 'Đang chờ';
  if (status === 'overdue') return 'Quá hạn';
  if (status === 'completed') return 'Hoàn thành';
  if (status === 'ready_delivery') return 'Sẵn sàng bàn giao';
  return status || 'Chưa bắt đầu';
}

function getOrderPlanningStatus(order: OrderRow, products: ProductRow[], tasks: TaskRow[]) {
  const productStatuses = products.map((product) =>
    resolveSummaryWorkflowStatus(
      getProjectedProductStatus(order, product.id, getProductWorkflowStatus({
        finished: product.finished,
        readyForDelivery: product.ready_for_delivery,
        progress: product.progress,
        currentStageIndex: product.current_stage_index,
        tasks: tasks.filter((task) => task.product_id === product.id && !task.archived),
        fallbackDeadline: order.deadline,
      })),
      order.deadline,
    ),
  );

  const aggregateStatus = getProjectedOrderStatus(order, getOrderWorkflowStatus(productStatuses as WorkflowStatus[]));
  if (aggregateStatus === 'completed' && order.status === 'ready_delivery') return 'ready_delivery';
  return aggregateStatus;
}

function getWorkflowSteps(module: ModuleCode) {
  return STEP_CONFIGS[module];
}

function getCurrentStepIndex(module: ModuleCode, products: ProductRow[]) {
  const steps = getWorkflowSteps(module);
  const furthestStage = products.reduce((max, product) => Math.max(max, Number(product.current_stage_index || 0)), 0);
  const matchedIndex = steps.findIndex((step, index) => {
    const next = steps[index + 1];
    if (!next) return furthestStage >= step.stageIndex;
    return furthestStage >= step.stageIndex && furthestStage < next.stageIndex;
  });
  if (matchedIndex >= 0) return matchedIndex;
  return furthestStage >= steps[steps.length - 1].stageIndex ? steps.length - 1 : 0;
}

function getCurrentStepLabel(module: ModuleCode, products: ProductRow[]) {
  const steps = getWorkflowSteps(module);
  return steps[getCurrentStepIndex(module, products)]?.label || steps[0]?.label || '-';
}

function getOwnerTags(products: ProductRow[], tasks: TaskRow[]) {
  const tags = new Set<string>();
  products.forEach((product) => {
    tasks
      .filter((task) => task.product_id === product.id && !task.archived)
      .forEach((task) => {
        const owner = String(task.assignee || '').trim();
        if (owner) tags.add(owner);
      });
  });
  return Array.from(tags);
}

function isCompatibleModule(product: ProductRow, order: OrderRow, module: ModuleCode) {
  return inferProductWorkflowModule(product.id, order.module) === module;
}

function getStepSummary(module: ModuleCode, step: WorkflowStep, products: ProductRow[]) {
  let completed = 0;
  let current = 0;

  products.forEach((product) => {
    if (product.finished || product.ready_for_delivery) {
      completed += 1;
      return;
    }
    if (product.current_stage_index > step.stageIndex) {
      completed += 1;
      return;
    }
    if (product.current_stage_index === step.stageIndex) {
      current += 1;
    }
  });

  const pending = Math.max(0, products.length - completed - current);
  const tone = current > 0 ? 'violet' : completed === products.length ? 'success' : pending === products.length ? 'neutral' : 'warning';
  const summary = current > 0 ? `${current} đang ở bước này` : completed === products.length ? 'Đã qua bước này' : `${pending} chưa tới bước này`;

  return { completed, current, pending, tone, summary };
}

export function ModuleOrderCatalog({
  module,
  orders,
  products,
  tasks,
}: {
  module: ModuleCode;
  orders: OrderRow[];
  products: ProductRow[];
  tasks: TaskRow[];
}) {
  const [activeOrderId, setActiveOrderId] = useState('');

  const sections = useMemo<OrderCatalogSection[]>(() => {
    return MODULE_SECTION_TYPES[module]
      .map((type) => {
        const rows = orders
          .map((order) => {
            const orderType = normalizeOrderType(order);
            if (orderType !== type) return null;

            const orderProducts = products.filter((product) => product.order_id === order.id && isCompatibleModule(product, order, module));
            if (!orderProducts.length) return null;

            const orderTasks = tasks.filter((task) => task.order_id === order.id && orderProducts.some((product) => product.id === task.product_id));
            const status = getOrderPlanningStatus(order, orderProducts, orderTasks);
            return {
              order,
              orderType,
              products: orderProducts,
              ownerTags: getOwnerTags(orderProducts, orderTasks),
              currentStepLabel: getCurrentStepLabel(module, orderProducts),
              currentStepIndex: getCurrentStepIndex(module, orderProducts),
              statusLabel: getStatusLabel(status),
              statusTone: getStatusTone(status),
            } satisfies OrderCatalogRow;
          })
          .filter(Boolean) as OrderCatalogRow[];

        return {
          type,
          title: SECTION_TITLES[type],
          orders: rows,
        };
      })
      .filter((section) => section.orders.length);
  }, [module, orders, products, tasks]);

  const activeOrder = useMemo(
    () => sections.flatMap((section) => section.orders).find((item) => item.order.id === activeOrderId) || null,
    [sections, activeOrderId],
  );

  const steps = getWorkflowSteps(module);

  return (
    <>
      {!activeOrder ? (
      <Card title="Danh mục đơn hàng">
        <div className="module-order-catalog">
          {sections.map((section) => (
            <section className="module-order-section" key={section.type}>
              <div className="module-order-section-head">
                <div>
                  <div className="module-order-section-title">{section.title}</div>
                  <div className="muted-text">{section.orders.length} đơn hàng rút gọn từ tab Kế hoạch sản xuất</div>
                </div>
              </div>

              <div className="module-order-grid">
                {section.orders.map((row) => (
                  <button
                    type="button"
                    className="module-order-card"
                    key={row.order.id}
                    onClick={() => setActiveOrderId(row.order.id)}
                  >
                    <div className="module-order-card-top">
                      <div>
                        <div className="module-order-code">{getDisplayOrderCode(row.order)}</div>
                        <div className="module-order-title">{row.order.title}</div>
                      </div>
                      <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                    </div>
                    <div className="module-order-meta">Khách hàng: {row.order.client}</div>
                    <div className="module-order-meta">Số sản phẩm: {row.products.length}</div>
                    <div className="module-order-meta">Tiến trình hiện tại: {row.currentStepLabel}</div>
                    <div className="module-order-meta">Deadline: {row.order.deadline || '-'}</div>
                    <div className="module-order-tag-row">
                      <Badge tone="neutral">{row.orderType}</Badge>
                      {row.ownerTags.slice(0, 3).map((owner) => (
                        <Badge key={`${row.order.id}-${owner}`} tone="violet">{owner}</Badge>
                      ))}
                      {row.ownerTags.length > 3 ? <Badge tone="neutral">+{row.ownerTags.length - 3}</Badge> : null}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}

          {!sections.length ? <div className="muted-text">Chưa có đơn hàng phù hợp cho module này.</div> : null}
        </div>
      </Card>
      ) : null}

      {activeOrder ? (
        <div className="module-order-detail-page">
          <div className="module-order-modal module-order-detail-shell">
            <div className="module-order-modal-head">
              <div>
                <div className="module-order-code">{getDisplayOrderCode(activeOrder.order)}</div>
                <h3>{activeOrder.order.title}</h3>
                <div className="muted-text">
                  {activeOrder.order.client} · {activeOrder.products.length} sản phẩm · Hiện tại: {activeOrder.currentStepLabel}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => setActiveOrderId('')}>
                Đóng
              </button>
            </div>

            <div className="module-order-progress-rail">
              {steps.map((step, index) => {
                const stepSummary = getStepSummary(module, step, activeOrder.products);
                const stepState =
                  index < activeOrder.currentStepIndex ? 'done' :
                  index === activeOrder.currentStepIndex ? 'current' :
                  'pending';
                return (
                  <div className={`module-progress-step is-${stepState}`} key={`${activeOrder.order.id}-${step.label}`}>
                    <div className="module-progress-dot">{index + 1}</div>
                    <div className="module-progress-content">
                      <div className="module-progress-label">{step.label}</div>
                      <div className="module-progress-summary">{stepSummary.summary}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="module-order-product-table">
              <table className="data-table table-fit">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Bước hiện tại</th>
                    <th>Tiến độ</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOrder.products.map((product) => {
                    const currentIndex = getCurrentStepIndex(module, [product]);
                    const statusTone = product.finished || product.ready_for_delivery ? 'success' : currentIndex > 0 ? 'violet' : 'warning';
                    return (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td>{product.name}</td>
                        <td>{steps[currentIndex]?.label || '-'}</td>
                        <td>{product.progress}%</td>
                        <td>
                          <Badge tone={statusTone}>
                            {product.finished || product.ready_for_delivery ? 'Hoàn thành' : steps[currentIndex]?.label || 'Chưa bắt đầu'}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

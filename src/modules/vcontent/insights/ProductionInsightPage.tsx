import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Boxes, CalendarClock, Eye, LineChart, PackageCheck, Pencil, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { PRODUCT_LIBRARY_ITEMS } from '@/data/productLibrary2025';
import { buildDisplayProductCodeMap, getDisplayOrderCode } from '@/lib/orderDisplayCodes';
import { getProductWorkflowStatus } from '@/lib/workflowStatus';
import {
  inferProductWorkflowModule,
  listProfiles,
  listOrdersWithProducts,
  listTasks,
  listWorkflowRecords,
  type OrderRow,
  type ProfileRow,
  type ProductRow,
  type TaskRow,
} from '@/services/vcontent';

type InsightStatus = 'completed' | 'overdue' | 'in_progress' | 'pending' | 'not_started';
type InsightModule = 'ELN' | 'VIDEO' | 'GAME';

type ProductInsightRow = {
  order: OrderRow;
  product: ProductRow;
  tasks: TaskRow[];
  module: string;
  status: InsightStatus;
  deadline: string;
  displayProductCode: string;
  updatedAt: string;
};

const MANUAL_VIDEO_LINKS_STORAGE_KEY = 'vcontent.manualVideoLinks';

const STAGE_LABELS: Record<string, string> = {
  'ELN:0': 'SMF-01 Đầu vào',
  'ELN:1': 'SMF-02 Storyboard',
  'ELN:2': 'SMF-03 Thiết kế slides',
  'ELN:3': 'SMF-04 QC Slides',
  'ELN:4': 'SMF-05 Thu âm',
  'ELN:5': 'SMF-06 QC Âm thanh',
  'ELN:6': 'SMF-07 Biên tập Video',
  'ELN:7': 'SMF-08 QC Video',
  'ELN:8': 'SMF-09 SCORM',
  'VIDEO:0': 'VSMF-01 Đầu vào',
  'VIDEO:1': 'VSMF-02 Storyboard',
  'VIDEO:2': 'VSMF-03 Thiết kế slides',
  'VIDEO:3': 'VSMF-04 QC Slides',
  'VIDEO:4': 'VSMF-05 Thu âm',
  'VIDEO:5': 'VSMF-06 QC Âm thanh',
  'VIDEO:6': 'VSMF-07 Biên tập Video',
  'VIDEO:7': 'VSMF-08 QC Video',
  'GAME:0': 'GSMF-01 Khởi chạy',
  'GAME:1': 'GSMF-02 Prototype',
  'GAME:2': 'GSMF-03 QC game',
  'GAME:3': 'GSMF-04 Hoàn chỉnh',
};

function parseDate(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const vnDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalized = vnDate ? `${vnDate[3]}-${vnDate[2].padStart(2, '0')}-${vnDate[1].padStart(2, '0')}` : raw.slice(0, 10);
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(start?: string | null, end?: string | null) {
  const from = parseDate(start);
  const to = parseDate(end);
  if (!from || !to) return null;
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
}

function daysUntil(value?: string | null) {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function isPastDeadline(value?: string | null) {
  const due = daysUntil(value);
  return due !== null && due < 0;
}

function normalizeStatus(value: string): InsightStatus {
  const raw = String(value || '').trim().toLowerCase();
  if (['done', 'completed', 'approved', 'qc_passed', 'accepted', 'ready_delivery'].includes(raw)) return 'completed';
  if (['overdue', 'fail', 'qc_fail', 'rejected', 'critical'].includes(raw)) return 'overdue';
  if (['started', 'in_progress', 'recording', 'editing', 'packaging', 'in_production'].includes(raw)) return 'in_progress';
  if (['pending', 'review', 'in_review', 'submitted', 'changes_requested', 'waiting', 'submitted_qc', 'submitted_video'].includes(raw)) return 'pending';
  return 'not_started';
}

function resolveInsightStatus(value: string, deadline?: string | null): InsightStatus {
  const status = normalizeStatus(value);
  if (status === 'completed') return 'completed';
  if (isPastDeadline(deadline)) return 'overdue';
  if (status === 'overdue') return 'in_progress';
  return status;
}

function statusTone(status: InsightStatus) {
  if (status === 'completed') return 'success' as const;
  if (status === 'overdue') return 'danger' as const;
  if (status === 'in_progress') return 'violet' as const;
  if (status === 'pending') return 'warning' as const;
  return 'neutral' as const;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}

function formatDays(value: number | null) {
  if (value === null) return '-';
  return `${value} ngày`;
}

function normalizeSearchText(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function readManualVideoLinks() {
  if (typeof window === 'undefined') return {} as Record<string, string>;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MANUAL_VIDEO_LINKS_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function getRowYear(row: ProductInsightRow) {
  return String(row.updatedAt || '').match(/\d{4}/)?.[0] || String(row.deadline || '').match(/\d{4}/)?.[0] || '-';
}

function buildCountOptions(values: string[]) {
  const counts = values.reduce<Map<string, number>>((acc, value) => {
    const key = value || '-';
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'vi'));
}

function rowMatchesSearch(row: ProductInsightRow, query: string) {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  return normalizeSearchText([
    row.displayProductCode,
    row.product.name,
    row.order.title,
    row.order.client,
    row.module,
    row.updatedAt,
    row.status,
  ].join(' ')).includes(needle);
}

function buildProductRows(orders: OrderRow[], products: ProductRow[], tasks: TaskRow[]): ProductInsightRow[] {
  const tasksByProduct = tasks.reduce<Map<string, TaskRow[]>>((acc, task) => {
    const bucket = acc.get(task.product_id) || [];
    bucket.push(task);
    acc.set(task.product_id, bucket);
    return acc;
  }, new Map());
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const productsByOrder = products.reduce<Map<string, ProductRow[]>>((acc, product) => {
    const bucket = acc.get(product.order_id) || [];
    bucket.push(product);
    acc.set(product.order_id, bucket);
    return acc;
  }, new Map());

  return products
    .map((product) => {
      const order = orderById.get(product.order_id);
      if (!order) return null;
      const productTasks = (tasksByProduct.get(product.id) || []).filter((task) => !task.archived);
      const latestTask = productTasks.slice().sort((left, right) => Number(right.stage_index) - Number(left.stage_index))[0] || null;
      const deadline = latestTask?.due_date || order.deadline || '';
      const productCodeMap = buildDisplayProductCodeMap(getDisplayOrderCode(order), productsByOrder.get(order.id) || []);
      const workflowStatus = getProductWorkflowStatus({
        finished: product.finished,
        readyForDelivery: product.ready_for_delivery,
        progress: product.progress,
        currentStageIndex: product.current_stage_index,
        tasks: productTasks,
        fallbackDeadline: deadline,
      });
      const status = resolveInsightStatus(workflowStatus, deadline);
      return {
        order,
        product,
        tasks: productTasks,
        module: inferProductWorkflowModule(product.id, order.module),
        status,
        deadline,
        displayProductCode: productCodeMap.get(product.id) || product.id,
        updatedAt: String(product.delivered_at || order.launched_at || order.submitted_at || order.deadline || '').slice(0, 10) || '-',
      } satisfies ProductInsightRow;
    })
    .filter((item): item is ProductInsightRow => Boolean(item));
}

function buildLibraryProductRows(manualVideoLinks: Record<string, string>): ProductInsightRow[] {
  return PRODUCT_LIBRARY_ITEMS.map((item) => {
    const orderId = `library-${item.year}-${item.module.toLowerCase()}-${item.client}-${item.topic}`;
    const yearEnd = `${item.year}-12-31`;
    const hasVideoLink = Boolean(item.videoLink || manualVideoLinks[item.id]);
    const order = {
      id: orderId,
      client: item.client,
      company_id: null,
      title: `${item.source} ${item.year} - ${item.topic}`,
      module: item.module,
      deadline: yearEnd,
      status: 'ready_delivery',
      created_by_profile_id: null,
      intake_note: item.summary || item.note || '',
      rejection_reason: '',
      change_request_reason: '',
      stage_sla_overrides: {
        order_meta: {
          display_order_code: `${item.client}_${item.module}_2025`,
          source_import: 'product-library-2025',
        },
      },
      created_at: `${yearEnd}T00:00:00.000Z`,
      submitted_at: yearEnd,
      launched_at: yearEnd,
      assignees: {},
    } as OrderRow;
    const product = {
      id: item.id,
      order_id: orderId,
      name: item.title,
      current_stage_index: item.module === 'ELN' ? 8 : 7,
      progress: hasVideoLink ? 100 : 0,
      ready_for_delivery: hasVideoLink,
      finished: hasVideoLink,
      delivered_at: hasVideoLink ? yearEnd : null,
    } as ProductRow;

    return {
      order,
      product,
      tasks: [],
      module: item.module,
      status: hasVideoLink ? 'completed' : 'pending',
      deadline: yearEnd,
      displayProductCode: item.displayCode,
      updatedAt: String(item.year),
    };
  });
}

function getRowSortTime(row: ProductInsightRow) {
  if (/^\d{4}$/.test(row.updatedAt)) return new Date(`${row.updatedAt}-12-31T00:00:00`).getTime();
  return parseDate(row.updatedAt)?.getTime() || parseDate(row.deadline)?.getTime() || 0;
}

function weekKey(value?: string | null) {
  const date = parseDate(value);
  if (!date) return 'Chưa có ngày';
  const start = new Date(date);
  const day = start.getDay() || 7;
  start.setDate(start.getDate() - day + 1);
  return start.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export function ProductionInsightPage({ moduleFilter = null }: { moduleFilter?: InsightModule | null }) {
  const [manualVideoLinks, setManualVideoLinks] = useState<Record<string, string>>(() => readManualVideoLinks());
  const [moduleSearch, setModuleSearch] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'production-insight'], queryFn: () => listTasks() });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'production-insight'], queryFn: listProfiles });
  const workflowQuery = useQuery({ queryKey: ['workflow-records', 'production-insight'], queryFn: () => listWorkflowRecords({ kinds: ['video_edit', 'scorm_package'], includeReviews: false, includeQuestionLibrary: false }) });
  const orders = (ordersQuery.data?.orders || []) as OrderRow[];
  const products = (ordersQuery.data?.products || []) as ProductRow[];
  const tasks = (tasksQuery.data || []) as TaskRow[];
  const profiles = (profilesQuery.data || []) as ProfileRow[];
  const isLoading = ordersQuery.isLoading || tasksQuery.isLoading || profilesQuery.isLoading || workflowQuery.isLoading;
  const error = ordersQuery.error || tasksQuery.error || profilesQuery.error || workflowQuery.error;
  const videoLinkByProductId = useMemo(
    () => {
      const map = new Map(
        (workflowQuery.data?.videoEdits || [])
          .filter((record) => String(record.file_name || '').trim())
          .map((record) => [record.product_id, String(record.file_name || '').trim()]),
      );
      PRODUCT_LIBRARY_ITEMS.forEach((item) => {
        if (item.videoLink) map.set(item.id, item.videoLink);
      });
      Object.entries(manualVideoLinks).forEach(([productId, link]) => {
        if (String(link || '').trim()) map.set(productId, String(link || '').trim());
      });
      return map;
    },
    [manualVideoLinks, workflowQuery.data?.videoEdits],
  );
  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);

  useEffect(() => {
    window.localStorage.setItem(MANUAL_VIDEO_LINKS_STORAGE_KEY, JSON.stringify(manualVideoLinks));
  }, [manualVideoLinks]);

  const insight = useMemo(() => {
    const rows = [...buildProductRows(orders, products, tasks), ...buildLibraryProductRows(manualVideoLinks)];
    const activeRows = rows.filter((row) => row.status !== 'completed');
    const completedRows = rows.filter((row) => row.status === 'completed');
    const overdueRows = rows.filter((row) => row.status !== 'completed' && isPastDeadline(row.deadline));
    const dueSoonRows = activeRows.filter((row) => {
      const due = daysUntil(row.deadline);
      return due !== null && due >= 0 && due <= 3;
    });
    const averageProgress = rows.length ? rows.reduce((sum, row) => sum + Number(row.product.progress || 0), 0) / rows.length : 0;
    const finishedDurations = completedRows
      .map((row) => daysBetween(row.order.launched_at || row.order.submitted_at || row.order.created_at, row.product.delivered_at || new Date().toISOString()))
      .filter((value): value is number => value !== null);
    const averageCycle = finishedDurations.length ? Math.round(finishedDurations.reduce((sum, value) => sum + value, 0) / finishedDurations.length) : null;

    const moduleRows = ['ELN', 'VIDEO', 'GAME'].map((module) => {
      const moduleProducts = rows.filter((row) => row.module === module);
      const completed = moduleProducts.filter((row) => row.status === 'completed').length;
      return {
        module,
        count: moduleProducts.length,
        active: moduleProducts.length - completed,
        completed,
        completionRate: moduleProducts.length ? (completed / moduleProducts.length) * 100 : 0,
      };
    });

    const stageMap = activeRows.reduce<Map<string, { label: string; count: number; overdue: number; pending: number }>>((acc, row) => {
      const latestTask = row.tasks.slice().sort((left, right) => Number(right.stage_index) - Number(left.stage_index))[0];
      const stageIndex = Number(latestTask?.stage_index ?? row.product.current_stage_index ?? 0);
      const key = `${row.module}:${stageIndex}`;
      const current = acc.get(key) || { label: STAGE_LABELS[key] || `${row.module} bước ${stageIndex + 1}`, count: 0, overdue: 0, pending: 0 };
      current.count += 1;
      if (row.status !== 'completed' && isPastDeadline(row.deadline)) current.overdue += 1;
      if (row.status === 'pending') current.pending += 1;
      acc.set(key, current);
      return acc;
    }, new Map());
    const stageBottlenecks = [...stageMap.values()].sort((left, right) => (right.overdue * 3 + right.count) - (left.overdue * 3 + left.count)).slice(0, 6);

    const weeklyMap = orders.reduce<Map<string, { label: string; orders: number; products: number }>>((acc, order) => {
      const label = weekKey(order.submitted_at || order.created_at || order.launched_at);
      const current = acc.get(label) || { label, orders: 0, products: 0 };
      current.orders += 1;
      current.products += rows.filter((row) => row.order.id === order.id).length;
      acc.set(label, current);
      return acc;
    }, new Map());
    const weeklyTrend = [...weeklyMap.values()].slice(-8);

    const assigneeMap = tasks.filter((task) => !task.archived && task.assignee_profile_id).reduce<Map<string, { name: string; email: string; count: number }>>((acc, task) => {
      const profile = profileById.get(task.assignee_profile_id || '');
      const key = task.assignee_profile_id || task.assignee || 'unassigned';
      const current = acc.get(key) || {
        name: task.assignee || profile?.full_name || task.assignee_profile_id || 'Chưa gán',
        email: profile?.email || '',
        count: 0,
      };
      current.count += 1;
      acc.set(key, current);
      return acc;
    }, new Map());
    const workload = [...assigneeMap.values()].sort((left, right) => right.count - left.count).slice(0, 5);

    const recommendations = [
      overdueRows.length ? `Ưu tiên xử lý ${overdueRows.length} sản phẩm quá hạn trước khi mở thêm việc mới.` : '',
      dueSoonRows.length ? `${dueSoonRows.length} sản phẩm sẽ tới hạn trong 3 ngày, nên chốt người phụ trách và mốc bàn giao ngay.` : '',
      stageBottlenecks[0]?.count ? `Điểm nghẽn lớn nhất hiện ở ${stageBottlenecks[0].label} với ${stageBottlenecks[0].count} sản phẩm đang nằm tại đây.` : '',
      averageProgress < 55 && rows.length ? 'Tiến độ trung bình còn thấp, nên rà lại kế hoạch start/deadline theo từng module.' : '',
    ].filter(Boolean);

    return {
      rows,
      orderCount: new Set(rows.map((row) => row.order.id)).size,
      activeRows,
      completedRows,
      overdueRows,
      dueSoonRows,
      averageProgress,
      averageCycle,
      moduleRows,
      stageBottlenecks,
      weeklyTrend,
      workload,
      recommendations,
    };
  }, [manualVideoLinks, orders, products, profileById, tasks]);

  const maxWeeklyProducts = Math.max(1, ...insight.weeklyTrend.map((item) => item.products));
  const selectedModuleRows = moduleFilter
    ? insight.rows
        .filter((row) => row.module === moduleFilter)
        .sort((left, right) => getRowSortTime(right) - getRowSortTime(left) || left.displayProductCode.localeCompare(right.displayProductCode, 'vi'))
    : [];
  const customerOptions = useMemo(() => buildCountOptions(selectedModuleRows.map((row) => row.order.client || '-')), [selectedModuleRows]);
  const yearOptions = useMemo(() => buildCountOptions(selectedModuleRows.map(getRowYear)), [selectedModuleRows]);
  const filteredSelectedModuleRows = useMemo(
    () =>
      selectedModuleRows.filter((row) => {
        if (customerFilter && (row.order.client || '-') !== customerFilter) return false;
        if (yearFilter && getRowYear(row) !== yearFilter) return false;
        return rowMatchesSearch(row, moduleSearch);
      }),
    [customerFilter, moduleSearch, selectedModuleRows, yearFilter],
  );

  function openProductVideo(row: ProductInsightRow) {
    const videoLink = videoLinkByProductId.get(row.product.id);
    if (!videoLink) return;
    window.open(videoLink, '_blank', 'noopener,noreferrer');
  }

  function hasProductVideo(row: ProductInsightRow) {
    return Boolean(videoLinkByProductId.get(row.product.id));
  }

  function editProductVideo(row: ProductInsightRow) {
    const currentLink = videoLinkByProductId.get(row.product.id) || '';
    const nextLink = window.prompt(`Nhập link video cho ${row.displayProductCode}`, currentLink);
    if (nextLink === null) return;
    setManualVideoLinks((current) => {
      const next = { ...current };
      const trimmed = nextLink.trim();
      if (trimmed) next[row.product.id] = trimmed;
      else delete next[row.product.id];
      return next;
    });
  }

  if (moduleFilter) {
    return (
      <div className="production-insight-page">
        <SectionHeader
          eye="Insight sản xuất"
          title={`Danh sách sản phẩm ${moduleFilter}`}
          subtitle="Sắp xếp theo dữ liệu mới nhất trước; sản phẩm 2026 được đưa lên đầu danh sách."
          actions={<Link className="btn btn-ghost btn-small" to="/production-insight">Quay lại insight</Link>}
        />
        {error ? <div className="notice danger">{error instanceof Error ? error.message : 'Không tải được dữ liệu insight.'}</div> : null}
        {isLoading ? <div className="data-empty data-processing" aria-label="Đang tải danh sách"><span className="fine-spinner" aria-hidden="true" /></div> : null}
        <Card title={`Sản phẩm ${moduleFilter}`}>
          <div className="production-insight-toolbar">
            <input
              value={moduleSearch}
              onChange={(event) => setModuleSearch(event.target.value)}
              placeholder="Tìm mã, tên, khách hàng, nguồn, trạng thái..."
            />
            <select value={customerFilter} onChange={(event) => setCustomerFilter(event.target.value)}>
              <option value="">Tất cả khách hàng ({selectedModuleRows.length})</option>
              {customerOptions.map(([client, count]) => <option key={client} value={client}>{client} ({count})</option>)}
            </select>
            <select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)}>
              <option value="">Tất cả năm ({selectedModuleRows.length})</option>
              {yearOptions.map(([year, count]) => <option key={year} value={year}>{year} ({count})</option>)}
            </select>
            <Badge tone="neutral">{filteredSelectedModuleRows.length} sản phẩm</Badge>
          </div>
          <div className="production-insight-table-wrap">
            <table className="data-table production-insight-table">
              <thead>
                <tr>
                  <th>Mã sản phẩm</th>
                  <th>Tên sản phẩm</th>
                  <th>Đơn hàng / nguồn</th>
                  <th>Khách hàng</th>
                  <th>Cập nhật</th>
                  <th>Tình trạng</th>
                  <th>Xem</th>
                </tr>
              </thead>
              <tbody>
                {filteredSelectedModuleRows.map((row) => (
                  <tr key={row.product.id}>
                    <td><strong>{row.displayProductCode}</strong></td>
                    <td>{row.product.name}</td>
                    <td>{getDisplayOrderCode(row.order)}</td>
                    <td>{row.order.client || '-'}</td>
                    <td>{row.updatedAt}</td>
                    <td><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
                    <td className="overview-orders-detail-cell">
                      <button
                        className="production-plan-icon-btn"
                        type="button"
                        title={hasProductVideo(row) ? `Mở link video ${row.displayProductCode}` : `Chưa có link video ${row.displayProductCode}`}
                        aria-label={hasProductVideo(row) ? `Mở link video ${row.displayProductCode}` : `Chưa có link video ${row.displayProductCode}`}
                        disabled={!hasProductVideo(row)}
                        onClick={() => openProductVideo(row)}
                      >
                        <Eye size={16} strokeWidth={1.9} />
                      </button>
                      <button
                        className="production-plan-icon-btn"
                        type="button"
                        title={`Thêm hoặc sửa link video ${row.displayProductCode}`}
                        aria-label={`Thêm hoặc sửa link video ${row.displayProductCode}`}
                        onClick={() => editProductVideo(row)}
                      >
                        <Pencil size={16} strokeWidth={1.9} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredSelectedModuleRows.length ? (
                  <tr>
                    <td colSpan={7} className="muted-text">Không có sản phẩm phù hợp.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="production-insight-page">
      <SectionHeader
        eye="Insight sản xuất"
        title="Insight sản xuất"
        subtitle="Tổng hợp đơn hàng, sản phẩm, thời gian, số lượng và các tín hiệu cần điều chỉnh trong vận hành."
      />
      {error ? <div className="notice danger">{error instanceof Error ? error.message : 'Không tải được dữ liệu insight.'}</div> : null}
      {isLoading ? <div className="data-empty data-processing" aria-label="Đang tải insight"><span className="fine-spinner" aria-hidden="true" /></div> : null}

      <div className="kpi-row production-insight-kpis">
        <Kpi label="Đơn hàng" value={String(insight.orderCount)} sub={`${insight.activeRows.length} sản phẩm đang mở`} tone="violet" />
        <Kpi label="Sản phẩm" value={String(insight.rows.length)} sub={`${insight.completedRows.length} đã hoàn thành`} tone="success" />
        <Kpi label="Quá hạn" value={String(insight.overdueRows.length)} sub={`${insight.dueSoonRows.length} sắp tới hạn 3 ngày`} tone={insight.overdueRows.length ? 'danger' : 'neutral'} />
        <Kpi label="Tiến độ TB" value={formatPercent(insight.averageProgress)} sub={`Cycle TB ${formatDays(insight.averageCycle)}`} tone="warning" />
      </div>

      <div className="production-insight-grid">
        <Card title="Mix sản phẩm">
          <div className="production-insight-bars">
            {insight.moduleRows.map((item) => (
              <Link
                className="production-insight-bar-row"
                key={item.module}
                to={`/production-insight/${String(item.module).toLowerCase()}`}
              >
                <div>
                  <strong>{item.module}</strong>
                  <span>{item.count} sản phẩm · {item.active} đang mở</span>
                </div>
                <div className="production-insight-bar-track">
                  <span style={{ width: `${Math.max(4, item.completionRate)}%` }} />
                </div>
                <Badge tone={item.completionRate >= 80 ? 'success' : item.completionRate >= 50 ? 'warning' : 'neutral'}>{formatPercent(item.completionRate)}</Badge>
              </Link>
            ))}
          </div>
        </Card>

        <Card title="Xu hướng theo tuần">
          <div className="production-insight-trend">
            {insight.weeklyTrend.length ? insight.weeklyTrend.map((item) => (
              <div className="production-insight-trend-col" key={item.label}>
                <div style={{ height: `${Math.max(10, (item.products / maxWeeklyProducts) * 100)}%` }} />
                <strong>{item.products}</strong>
                <span>{item.label}</span>
              </div>
            )) : <div className="muted-text">Chưa có dữ liệu tuần.</div>}
          </div>
        </Card>
      </div>

      <div className="production-insight-grid is-wide">
        <Card title="Điểm nghẽn công đoạn">
          <div className="production-insight-stage-list">
            {insight.stageBottlenecks.length ? insight.stageBottlenecks.map((item) => (
              <div className="production-insight-stage" key={item.label}>
                <Boxes size={18} />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.count} sản phẩm · {item.overdue} quá hạn · {item.pending} chờ duyệt</span>
                </div>
                <Badge tone={item.overdue ? 'danger' : item.pending ? 'warning' : 'violet'}>{item.count}</Badge>
              </div>
            )) : <div className="muted-text">Chưa phát hiện điểm nghẽn.</div>}
          </div>
        </Card>

        <Card title="Gợi ý điều chỉnh">
          <div className="production-insight-actions">
            {(insight.recommendations.length ? insight.recommendations : ['Vận hành đang ổn định. Tiếp tục theo dõi deadline, phân bổ tải và tỉ lệ trả về QC.']).map((item, index) => (
              <div className="production-insight-action" key={item}>
                {index === 0 ? <AlertTriangle size={18} /> : index === 1 ? <CalendarClock size={18} /> : index === 2 ? <TrendingUp size={18} /> : <LineChart size={18} />}
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Sản phẩm cần chú ý">
        <div className="production-insight-table-wrap">
          <table className="data-table production-insight-table">
            <thead>
              <tr>
                <th>Đơn hàng</th>
                <th>Sản phẩm</th>
                <th>Module</th>
                <th>Deadline</th>
                <th>Tiến độ</th>
                <th>Tín hiệu</th>
                <th>Xem</th>
              </tr>
            </thead>
            <tbody>
              {insight.rows
                .filter((row) => row.status !== 'completed')
                .sort((left, right) => (daysUntil(left.deadline) ?? 999) - (daysUntil(right.deadline) ?? 999))
                .slice(0, 12)
                .map((row) => (
                  <tr key={row.product.id}>
                    <td><strong>{getDisplayOrderCode(row.order)}</strong><span>{row.order.title}</span></td>
                    <td>{row.product.name}</td>
                    <td>{row.module}</td>
                    <td>{row.deadline || '-'}</td>
                    <td>{formatPercent(Number(row.product.progress || 0))}</td>
                    <td><Badge tone={statusTone(row.status)}>{row.status}</Badge></td>
                    <td className="overview-orders-detail-cell">
                      <button
                        className="production-plan-icon-btn"
                        type="button"
                        title={hasProductVideo(row) ? `Mo link video ${row.displayProductCode}` : `Chua co link video ${row.displayProductCode}`}
                        aria-label={hasProductVideo(row) ? `Mo link video ${row.displayProductCode}` : `Chua co link video ${row.displayProductCode}`}
                        disabled={!hasProductVideo(row)}
                        onClick={() => openProductVideo(row)}
                      >
                        <Eye size={16} strokeWidth={1.9} />
                      </button>
                    </td>
                  </tr>
                ))}
              {!insight.rows.filter((row) => row.status !== 'completed').length ? (
                <tr>
                  <td colSpan={7}>
                    <div className="production-insight-empty"><PackageCheck size={18} /> Không có sản phẩm đang mở.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Tải công việc theo người phụ trách">
        <div className="production-insight-workload">
          {insight.workload.length ? insight.workload.map((item) => (
            <div className="production-insight-workload-row" key={item.name}>
              <div className="production-insight-user">
                <strong>{item.name}</strong>
                <span>{item.email || '-'}</span>
              </div>
              <div className="production-insight-workload-track">
                <span style={{ width: `${Math.min(100, item.count * 12)}%` }} />
              </div>
              <Badge tone={item.count >= 8 ? 'warning' : 'neutral'}>{item.count} việc</Badge>
            </div>
          )) : <div className="muted-text">Chưa có task được gán người phụ trách.</div>}
        </div>
      </Card>
    </div>
  );
}

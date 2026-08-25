import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppShell } from '@/contexts/AppShellContext';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { GeneralInfoSummary } from '@/components/workflow/GeneralInfoSummary';
import { useToast } from '@/components/system/ToastProvider';
import { fetchMyTasksPreview, getMyTasksPreviewQueryKey, shouldUseMyTasksPreview } from '@/lib/myTasksPreview';
import { isTaskExplicitlyAssignedToCurrentProfile } from '@/lib/taskAssignee';
import {
  archiveTasksForStage,
  deleteIntakeAsset,
  ensureInputItemsForProduct,
  ensureTaskForStage,
  getInputTemplate,
  inferProductWorkflowModule,
  listInputItems,
  listOrdersWithProducts,
  listProfiles,
  listTasks,
  normalizeOrderCodeFragment,
  updateInputItem,
  updateOrder,
  updateProduct,
  updateTask,
  uploadIntakeAsset,
  type InputItemRow,
  type OrderRow,
  type ProductRow,
  type ProfileRow,
} from '@/services/vcontent';
import { isAdminLikeRole, normalizeAppRole, type PageKey } from '@/data/vcontent';

type InputGateConfig = {
  pageId: 'smf01' | 'vsmf01';
  module: 'ELN' | 'VIDEO';
  eye: string;
  title: string;
  subtitle: string;
  nextStagePage: string;
  nextStageRoute: PageKey;
};

type IntakeMetaDraft = {
  info: string;
  note: string;
  assignee: string;
  dueDate: string;
};

type ItemOperationState = {
  action: 'upload' | 'delete' | 'request' | 'approve' | 'save';
  label: string;
  progress: number;
  tone: 'warning' | 'danger' | 'success' | 'violet' | 'neutral';
};

const INTAKE_MAX_UPLOAD_MB = 200;
const INTAKE_MAX_UPLOAD_BYTES = INTAKE_MAX_UPLOAD_MB * 1024 * 1024;

function sanitizeUtf8Text(value: string) {
  const normalized = String(value || '')
    .normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ');
  return new TextDecoder('utf-8', { fatal: false }).decode(new TextEncoder().encode(normalized));
}

const CONFIGS: Record<'smf01' | 'vsmf01', InputGateConfig> = {
  smf01: {
    pageId: 'smf01',
    module: 'ELN',
    eye: 'Module 2 · SMF-01',
    title: 'Bảng điều khiển đầu vào sản phẩm E-learning',
    subtitle: 'Chọn sản phẩm từ bảng để vào màn đầu vào chi tiết.',
    nextStagePage: 'SMF-02',
    nextStageRoute: 'smf02',
  },
  vsmf01: {
    pageId: 'vsmf01',
    module: 'VIDEO',
    eye: 'Module 3 · VSMF-01',
    title: 'Bảng điều khiển đầu vào sản phẩm Video',
    subtitle: 'Chọn sản phẩm từ bảng để vào màn đầu vào chi tiết.',
    nextStagePage: 'VSMF-02',
    nextStageRoute: 'vsmf02',
  },
};

function validateIntakeFile(file: File) {
  if (file.size > INTAKE_MAX_UPLOAD_BYTES) {
    throw new Error(`File vượt quá ${INTAKE_MAX_UPLOAD_MB}MB.`);
  }
}

function isModuleMatch(productId: string, order: OrderRow, module: 'ELN' | 'VIDEO') {
  return inferProductWorkflowModule(productId, order.module) === module;
}

function isLaunchedProduct(productId: string, progress: number, tasks: Array<{ product_id: string; stage_index: number; archived: boolean }>) {
  return progress > 0 || tasks.some((task) => task.product_id === productId && task.stage_index === 0 && !task.archived);
}

function getSummary(items: InputItemRow[]) {
  const total = items.length;
  const required = items.filter((item) => item.required);
  const checkedTotal = items.filter((item) => item.status !== 'missing').length;
  const approvedRequired = required.filter((item) => item.status === 'approved').length;
  const ready = required.length > 0 && approvedRequired === required.length;
  const blocked = required.filter((item) => item.status === 'missing' || item.status === 'changes_requested').length;
  const review = required.filter((item) => item.status === 'submitted').length;

  return {
    total,
    required: required.length,
    checkedTotal,
    approvedRequired,
    ready,
    blocked,
    review,
  };
}

const EMPTY_SUMMARY = {
  total: 0,
  required: 0,
  checkedTotal: 0,
  approvedRequired: 0,
  ready: false,
  blocked: 0,
  review: 0,
};

function getIntakeMetaFromOrder(order: OrderRow | null, productId: string | null): IntakeMetaDraft {
  if (!order || !productId || !order.stage_sla_overrides || typeof order.stage_sla_overrides !== 'object') {
    return { info: '', note: '', assignee: '', dueDate: '' };
  }

  const raw = order.stage_sla_overrides as Record<string, unknown>;
  const intakeMeta = raw.intake_meta && typeof raw.intake_meta === 'object' ? (raw.intake_meta as Record<string, unknown>) : null;
  const productMeta = intakeMeta?.[productId] && typeof intakeMeta[productId] === 'object' ? (intakeMeta[productId] as Record<string, unknown>) : null;

  return {
    info: String(productMeta?.info || ''),
    note: String(productMeta?.note || ''),
    assignee: String(productMeta?.assignee || ''),
    dueDate: String(productMeta?.dueDate || ''),
  };
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

function buildDisplayProductCodeMap(orderCode: string, products: Array<{ id: string }>) {
  const baseCode = normalizeOrderCodeFragment(orderCode).toUpperCase();
  return new Map(
    products.map((product, index) => [
      product.id,
      baseCode ? `${baseCode}_${String(index + 1).padStart(2, '0')}` : product.id,
    ]),
  );
}

function suggestDueDate(orderDeadline: string | null | undefined) {
  if (!orderDeadline) return '';
  return orderDeadline;
}

function formatDisplayDate(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN').format(date);
}

function resolveIntakeStartDate(order: OrderRow | null | undefined) {
  if (!order) return '';
  return order.launched_at || order.submitted_at || '';
}

function getInputStatusMeta(status: InputItemRow['status']) {
  switch (status) {
    case 'approved':
      return { label: 'Hoàn thành', tone: 'success' as const };
    case 'submitted':
      return { label: 'Chờ duyệt', tone: 'info' as const };
    case 'changes_requested':
      return { label: 'Chưa hoàn thành', tone: 'danger' as const };
    default:
      return { label: 'Chưa có file', tone: 'muted' as const };
  }
}

export function InputGatePage({ pageId }: { pageId: PageKey }) {
  const config = CONFIGS[pageId as 'smf01' | 'vsmf01'];
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { profile, loading } = useAuth();
  const { role: shellRole } = useAppShell();
  const { pushToast } = useToast();
  const viewerRole = normalizeAppRole(profile?.role || shellRole);
  const shouldAutoNavigate = isAdminLikeRole(viewerRole);
  const canViewAllStageProducts = viewerRole === 'pm' || isAdminLikeRole(viewerRole);
  // Stage pages must share the same source data as the admin screens.
  const shouldUseServerPreview = false;
  const previewOptions = useMemo(() => ({ stageIndices: [0], includeActivityLogs: false }), []);
  const queryClient = useQueryClient();
  const [selectedKey, setSelectedKey] = useState('');
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);
  const [itemOperations, setItemOperations] = useState<Record<string, ItemOperationState>>({});
  const [metaDraft, setMetaDraft] = useState<IntakeMetaDraft>({ info: '', note: '', assignee: '', dueDate: '' });

  const previewQuery = useQuery({
    queryKey: getMyTasksPreviewQueryKey(viewerRole || shellRole, profile?.email || '', previewOptions),
    queryFn: () => fetchMyTasksPreview(viewerRole || shellRole, profile?.email || null, previewOptions),
    enabled: shouldUseServerPreview,
    staleTime: 1000 * 60,
  });
  const useFallbackQueries = !shouldUseServerPreview || previewQuery.isError;
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts, staleTime: 1000 * 60, enabled: useFallbackQueries });
  const inputItemsQuery = useQuery({ queryKey: ['input-items', config.module], queryFn: () => listInputItems({ module: config.module }), staleTime: 1000 * 60 });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'stage-0'], queryFn: () => listTasks({ stageIndices: [0] }), staleTime: 1000 * 60, enabled: useFallbackQueries });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'input-gate-assignees'], queryFn: listProfiles, staleTime: 1000 * 60 * 5, enabled: useFallbackQueries });
  const usePreviewData = shouldUseServerPreview && Boolean(previewQuery.data);
  const ordersData = usePreviewData ? { orders: previewQuery.data!.orders, products: previewQuery.data!.products } : ordersQuery.data;
  const tasksData = usePreviewData ? (previewQuery.data?.tasks || []) : (tasksQuery.data || []);
  const profilesData = usePreviewData ? (previewQuery.data?.profiles || []) : (profilesQuery.data || []);
  const stageWorkKeys = useMemo(
    () =>
      new Set(
        (previewQuery.data?.workItems || [])
          .filter((item) => item.stage_index === 0)
          .map((item) => `${item.order_id}::${item.product_id}`),
      ),
    [previewQuery.data?.workItems],
  );
  const intakeView = searchParams.get('view') === 'detail' ? 'detail' : 'dashboard';
  const selectedProductKeyFromUrl = searchParams.get('product') || '';
  const resolvedSelectedKey = selectedProductKeyFromUrl || selectedKey;

  const orderById = useMemo(
    () => new Map((ordersData?.orders || []).map((order) => [order.id, order])),
    [ordersData?.orders],
  );
  const productByOrderProductKey = useMemo(
    () => new Map((ordersData?.products || []).map((product) => [`${product.order_id}::${product.id}`, product])),
    [ordersData?.products],
  );
  const displayCodesByOrderProductKey = useMemo(() => {
    const map = new Map<string, { displayOrderCode: string; displayProductCode: string }>();
    const orders = ordersData?.orders || [];
    const products = ordersData?.products || [];
    const productsByOrderId = new Map<string, typeof products>();
    for (const product of products) {
      const bucket = productsByOrderId.get(product.order_id) || [];
      bucket.push(product);
      productsByOrderId.set(product.order_id, bucket);
    }
    for (const order of orders) {
      const displayOrderCode = mapDisplayOrderCode(order);
      const orderProducts = productsByOrderId.get(order.id) || [];
      const displayMap = buildDisplayProductCodeMap(displayOrderCode, orderProducts);
      for (const product of orderProducts) {
        map.set(`${order.id}::${product.id}`, {
          displayOrderCode,
          displayProductCode: displayMap.get(product.id) || product.id,
        });
      }
    }
    return map;
  }, [ordersData?.orders, ordersData?.products]);

  const scopedProducts = useMemo(() => {
    if (intakeView === 'detail' && selectedProductKeyFromUrl) {
      return [] as Array<{
        order: OrderRow;
        product: ProductRow;
        displayOrderCode: string;
        displayProductCode: string;
      }>;
    }
    const orders = ordersData?.orders || [];
    const products = ordersData?.products || [];
    const tasks = tasksData;
    const productsByOrderId = new Map<string, typeof products>();
    const stageZeroTaskByOrderProduct = new Map<string, (typeof tasks)[number]>();
    const hasAnyTaskByProduct = new Set<string>();

    for (const product of products) {
      const bucket = productsByOrderId.get(product.order_id) || [];
      bucket.push(product);
      productsByOrderId.set(product.order_id, bucket);
    }

    for (const task of tasks) {
      if (task.archived) continue;
      hasAnyTaskByProduct.add(task.product_id);
      if (task.stage_index !== 0) continue;
      const key = `${task.order_id}::${task.product_id}`;
      if (!stageZeroTaskByOrderProduct.has(key)) {
        stageZeroTaskByOrderProduct.set(key, task);
      }
    }

    const rows = orders.flatMap((order) => {
      const orderProducts = (productsByOrderId.get(order.id) || [])
        .slice()
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));
      const displayOrderCode = mapDisplayOrderCode(order);
      const displayProductCodeMap = buildDisplayProductCodeMap(displayOrderCode, orderProducts);

      return orderProducts
        .filter((product) => isModuleMatch(product.id, order, config.module))
        .map((product) => {
          const stageKey = `${order.id}::${product.id}`;
          const task = stageZeroTaskByOrderProduct.get(stageKey) || null;
          const assignedToViewer = isTaskExplicitlyAssignedToCurrentProfile(task, profile, profilesData);
          const launched = product.progress > 0 || hasAnyTaskByProduct.has(product.id);
          if (usePreviewData) {
            if (!stageWorkKeys.has(stageKey)) return null;
          } else if (canViewAllStageProducts ? !launched : !assignedToViewer) {
            return null;
          }
          return {
            order,
            product,
            displayOrderCode,
            displayProductCode: displayProductCodeMap.get(product.id) || product.id,
          };
        });
    }).filter(Boolean) as Array<{
      order: (typeof orders)[number];
      product: (typeof products)[number];
      displayOrderCode: string;
      displayProductCode: string;
    }>;

    return rows;
  }, [canViewAllStageProducts, config.module, intakeView, ordersData, profile, profilesData, selectedProductKeyFromUrl, stageWorkKeys, tasksData, usePreviewData]);

  useEffect(() => {
    const productKey = searchParams.get('product');
    if (productKey) {
      if (productKey !== selectedKey) setSelectedKey(productKey);
      return;
    }
    if (!selectedKey && scopedProducts[0]) {
      setSelectedKey(`${scopedProducts[0].order.id}::${scopedProducts[0].product.id}`);
    }
  }, [scopedProducts, searchParams, selectedKey]);

  const selected = useMemo(() => {
    if (resolvedSelectedKey) {
      const [orderId, productId] = resolvedSelectedKey.split('::');
      const order = orderById.get(orderId);
      const product = productByOrderProductKey.get(resolvedSelectedKey);
      if (order && product && isModuleMatch(product.id, order, config.module)) {
        const stageTask = tasksData.find((task) => !task.archived && task.stage_index === 0 && task.order_id === order.id && task.product_id === product.id);
        if (!canViewAllStageProducts && !isTaskExplicitlyAssignedToCurrentProfile(stageTask, profile, profilesData)) {
          return null;
        }
        const display = displayCodesByOrderProductKey.get(resolvedSelectedKey);
        return {
          order,
          product,
          displayOrderCode: display?.displayOrderCode || mapDisplayOrderCode(order),
          displayProductCode: display?.displayProductCode || product.id,
        };
      }
    }
    return scopedProducts.find((item) => `${item.order.id}::${item.product.id}` === selectedKey) || null;
  }, [canViewAllStageProducts, config.module, displayCodesByOrderProductKey, orderById, productByOrderProductKey, profile, profilesData, resolvedSelectedKey, scopedProducts, selectedKey, tasksData]);

  const stageZeroTaskByOrderProduct = useMemo(() => {
    const map = new Map<string, (typeof tasksData)[number]>();
    for (const task of tasksData) {
      if (task.archived || task.stage_index !== 0) continue;
      const key = `${task.order_id}::${task.product_id}`;
      if (!map.has(key)) {
        map.set(key, task);
      }
    }
    return map;
  }, [tasksData]);

  const stageZeroTask = useMemo(() => {
    if (!selected) return null;
    return stageZeroTaskByOrderProduct.get(`${selected.order.id}::${selected.product.id}`) || null;
  }, [selected, stageZeroTaskByOrderProduct]);

  const seededProductKeysRef = useRef<Set<string>>(new Set());
  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      return ensureInputItemsForProduct({
        orderId: selected.order.id,
        productId: selected.product.id,
        module: config.module,
        existingItems: inputItemsQuery.data || [],
        ownerProfileId: profile?.id || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['input-items', config.module] });
    },
  });

  useEffect(() => {
    if (!selected || !inputItemsQuery.data) return;
    const key = `${selected.order.id}::${selected.product.id}`;
    if (seededProductKeysRef.current.has(key)) return;
    const existing = inputItemsQuery.data.filter(
      (item) => item.order_id === selected.order.id && item.product_id === selected.product.id && item.module === config.module,
    );
    const template = getInputTemplate(config.module);
    const missingTemplateCodes = template.filter((templateItem) => !existing.some((item) => item.item_code === templateItem.code));
    const hasLegacyTemplateMismatch = existing.some((item) => {
      const templateItem = template.find((entry) => entry.code === item.item_code);
      if (!templateItem) return false;
      return item.label !== templateItem.label || item.item_type !== templateItem.type || item.required !== templateItem.required;
    });
    if (!existing.length || missingTemplateCodes.length || hasLegacyTemplateMismatch) {
      seededProductKeysRef.current.add(key);
      void seedMutation.mutateAsync().catch(() => {
        seededProductKeysRef.current.delete(key);
      });
      return;
    }
    seededProductKeysRef.current.add(key);
  }, [selected, inputItemsQuery.data, config.module, seedMutation]);

  const items = useMemo(() => {
    if (!selected) return [];
    const raw = (inputItemsQuery.data || []).filter(
      (item) => item.order_id === selected.order.id && item.product_id === selected.product.id && item.module === config.module,
    );
    return getInputTemplate(config.module)
      .map((template) => {
        const existingItem = raw.find((item) => item.item_code === template.code);
        if (!existingItem) return null;
        return {
          ...existingItem,
          label: template.label,
          item_type: template.type,
          required: template.required,
        };
      })
      .filter(Boolean) as InputItemRow[];
  }, [selected, inputItemsQuery.data, config.module]);

  useEffect(() => {
    if (!selected) return;
    const fromOrder = getIntakeMetaFromOrder(selected.order, selected.product.id);
    setMetaDraft({
      info: fromOrder.info,
      note: fromOrder.note,
      assignee: fromOrder.assignee || stageZeroTask?.assignee || '',
      dueDate: fromOrder.dueDate || stageZeroTask?.due_date || suggestDueDate(selected.order.deadline),
    });
  }, [selectedKey, selected, stageZeroTask]);

  useEffect(() => {
    setConfirmNotice(null);
  }, [selectedKey]);

  useEffect(() => {
    const activeIds = Object.keys(itemOperations);
    if (!activeIds.length) return;

    const timer = window.setInterval(() => {
      setItemOperations((current) =>
        Object.fromEntries(
          Object.entries(current).map(([itemId, operation]) => [
            itemId,
            {
              ...operation,
              progress: operation.progress >= 92 ? operation.progress : Math.min(92, operation.progress + (operation.progress < 40 ? 18 : operation.progress < 72 ? 10 : 4)),
            },
          ]),
        ) as Record<string, ItemOperationState>,
      );
    }, 260);

    return () => window.clearInterval(timer);
  }, [itemOperations]);

  const summary = getSummary(items);
  const dashboardSummaryByOrderProductKey = useMemo(() => {
    const grouped = new Map<string, InputItemRow[]>();
    for (const item of inputItemsQuery.data || []) {
      if (item.module !== config.module) continue;
      const key = `${item.order_id}::${item.product_id}`;
      const bucket = grouped.get(key) || [];
      bucket.push(item);
      grouped.set(key, bucket);
    }
    const summaryMap = new Map<string, ReturnType<typeof getSummary>>();
    for (const [key, productItems] of grouped) {
      summaryMap.set(key, getSummary(productItems));
    }
    return summaryMap;
  }, [config.module, inputItemsQuery.data]);
  const intakeStartDate = selected ? resolveIntakeStartDate(selected.order) : '';
  const intakeAssignee = metaDraft.assignee || stageZeroTask?.assignee || 'Ch\u01b0a ph\u00e2n c\u00f4ng';
  const productInfoLabel = config.module === 'VIDEO' ? 'T\u00ean b\u00e0i gi\u1ea3ng Video' : 'T\u00ean b\u00e0i gi\u1ea3ng E-learning';
  const summaryTitle = 'Th\u00f4ng tin chung';
  const orderCodeLabel = 'M\u00e3 \u0111\u01a1n:';
  const productCodeLabel = 'M\u00e3 s\u1ea3n ph\u1ea9m';
  const ownerLabel = 'Ng\u01b0\u1eddi ph\u1ee5 tr\u00e1ch';
  const startDateLabel = 'Ng\u00e0y b\u1eaft \u0111\u1ea7u';

  function openDetailPanel(productKey: string) {
    setSelectedKey(productKey);
    setSearchParams(
      {
        view: 'detail',
        product: productKey,
      },
      { replace: false },
    );
  }

  function openDashboard() {
    setSearchParams({}, { replace: false });
  }

  function startItemOperation(itemId: string, action: ItemOperationState['action']) {
    const metaByAction: Record<ItemOperationState['action'], Omit<ItemOperationState, 'progress'>> = {
      upload: { action: 'upload', label: 'Đang tải tệp lên máy chủ', tone: 'violet' },
      delete: { action: 'delete', label: 'Đang xóa tệp hoặc link', tone: 'danger' },
      request: { action: 'request', label: 'Đang cập nhật yêu cầu bổ sung', tone: 'warning' },
      approve: { action: 'approve', label: 'Đang xác nhận hoàn thành', tone: 'success' },
      save: { action: 'save', label: 'Đang lưu đầu vào', tone: 'warning' },
    };

    setItemOperations((current) => ({
      ...current,
      [itemId]: {
        ...metaByAction[action],
        progress: 8,
      },
    }));
  }

  function finishItemOperation(itemId: string) {
    setItemOperations((current) => ({
      ...current,
      [itemId]: current[itemId]
        ? {
            ...current[itemId],
            progress: 100,
            tone: 'success',
            label: 'Đã cập nhật xong',
          }
        : current[itemId],
    }));

    window.setTimeout(() => {
      setItemOperations((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }, 700);
  }

  function failItemOperation(itemId: string, message?: string) {
    setItemOperations((current) => ({
      ...current,
      [itemId]: current[itemId]
        ? {
            ...current[itemId],
            progress: 100,
            tone: 'danger',
            label: message || 'Có lỗi, vui lòng thử lại',
          }
        : current[itemId],
    }));
  }

  const itemMutation = useMutation({
    mutationFn: async (input: { item: InputItemRow; action: 'upload' | 'delete' | 'request' | 'approve' | 'save'; file?: File; fileUrl?: string; notes?: string }) => {
      if (input.action === 'upload') {
        if (!selected || !input.file) throw new Error('Chưa có file để upload.');
        validateIntakeFile(input.file);
        const uploaded = await uploadIntakeAsset({
          file: input.file,
          orderId: selected.order.id,
          productId: selected.product.id,
          itemCode: input.item.item_code,
          module: config.module,
          previousUrl: input.item.file_url,
        });
        await updateInputItem(input.item.id, {
          file_name: uploaded.fileName,
          file_url: uploaded.fileUrl,
          status: 'submitted',
        });
        return;
      }

      if (input.action === 'delete') {
        if (input.item.file_url?.includes('/storage/v1/object/')) {
          await deleteIntakeAsset({ fileUrl: input.item.file_url });
        }
        await updateInputItem(input.item.id, {
          file_name: null,
          file_url: null,
          status: input.item.required ? 'changes_requested' : 'missing',
        });
        return;
      }

      if (input.action === 'request') {
        await updateInputItem(input.item.id, {
          status: 'changes_requested',
          notes: input.notes ?? input.item.notes ?? 'Đang chờ client/PM bổ sung.',
        });
        return;
      }

      if (input.action === 'approve') {
        await updateInputItem(input.item.id, {
          status: 'approved',
          notes: input.notes ?? input.item.notes,
        });
        return;
      }

      const nextFileUrl = (input.fileUrl ?? input.item.file_url ?? '').trim() || null;
      await updateInputItem(input.item.id, {
        file_url: nextFileUrl,
        notes: input.notes ?? input.item.notes,
        status:
          ['missing', 'changes_requested'].includes(input.item.status) && (nextFileUrl || input.item.file_name)
            ? 'submitted'
            : input.item.status,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['input-items', config.module] });
    },
    onError: (error) => {
      pushToast({ title: 'Thao tác đầu vào thất bại', message: error instanceof Error ? error.message : String(error), tone: 'danger', durationMs: 4200 });
    },
  });

  async function runItemAction(input: { item: InputItemRow; action: 'upload' | 'delete' | 'request' | 'approve' | 'save'; file?: File; fileUrl?: string; notes?: string }) {
    startItemOperation(input.item.id, input.action);
    try {
      await itemMutation.mutateAsync(input);
      finishItemOperation(input.item.id);
    } catch (error) {
      failItemOperation(input.item.id, error instanceof Error ? error.message : String(error));
    }
  }

  const saveOverviewMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Chưa chọn sản phẩm.');

      const existingOverrides = selected.order.stage_sla_overrides && typeof selected.order.stage_sla_overrides === 'object'
        ? (selected.order.stage_sla_overrides as Record<string, unknown>)
        : {};

      const currentIntakeMeta = existingOverrides.intake_meta && typeof existingOverrides.intake_meta === 'object'
        ? (existingOverrides.intake_meta as Record<string, unknown>)
        : {};

      await updateOrder(selected.order.id, {
        stage_sla_overrides: {
          ...existingOverrides,
          intake_meta: {
            ...currentIntakeMeta,
            [selected.product.id]: {
              info: sanitizeUtf8Text(metaDraft.info),
              note: sanitizeUtf8Text(metaDraft.note),
              assignee: sanitizeUtf8Text(metaDraft.assignee),
              dueDate: sanitizeUtf8Text(metaDraft.dueDate),
              updatedAt: new Date().toISOString(),
            },
          },
        },
      });

      const ensuredTask = await ensureTaskForStage({
        orderId: selected.order.id,
        productId: selected.product.id,
        stageIndex: 0,
        existingTasks: tasksData,
        dueDate: metaDraft.dueDate || null,
      });

      if (ensuredTask?.id) {
        await updateTask(ensuredTask.id, {
          due_date: metaDraft.dueDate || null,
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      pushToast({ title: 'Đã lưu đầu vào', message: 'Thông tin sản phẩm đã được cập nhật.', tone: 'success' });
    },
    onError: (error) => {
      pushToast({ title: 'Không lưu được đầu vào', message: error instanceof Error ? error.message : String(error), tone: 'danger', durationMs: 4200 });
    },
  });

  const approveRequiredMutation = useMutation({
    mutationFn: async () => {
      for (const item of items.filter((entry) => entry.required)) {
        await updateInputItem(item.id, {
          status: 'approved',
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['input-items', config.module] });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Chưa chọn product.');
      if (!summary.ready) throw new Error('Chưa đủ mục bắt buộc được xác nhận.');

      await archiveTasksForStage(selected.order.id, selected.product.id, 0).catch(() => null);
      await updateProduct(selected.product.id, {
        current_stage_index: 1,
        progress: 13,
      });
      if (!['in_production', 'pending_acceptance', 'ready_delivery', 'paid'].includes(String(selected.order.status || ''))) {
        await updateOrder(selected.order.id, {
          status: 'in_production',
        });
      }
      await ensureTaskForStage({
        orderId: selected.order.id,
        productId: selected.product.id,
        stageIndex: 1,
        existingTasks: tasksData,
        dueDate: metaDraft.dueDate || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      pushToast({ title: 'Đã xác nhận để đi tiếp', message: `${config.pageId.toUpperCase()} đã hoàn tất đầu vào.`, tone: 'success' });
      if (shouldAutoNavigate) {
        setConfirmNotice(`Đã xác nhận đầu vào. Đang chuyển sang ${config.nextStagePage}.`);
        navigate(`/${config.nextStageRoute}`);
        return;
      }
      setConfirmNotice(`Đã xác nhận đầu vào. Hãy mở ${config.nextStagePage} từ menu bên trái để tiếp tục.`);
    },
    onError: (error) => {
      pushToast({ title: 'Không xác nhận được', message: error instanceof Error ? error.message : String(error), tone: 'danger', durationMs: 4200 });
    },
  });

  return (
    <div className="intake-page">
      <SectionHeader eye={config.eye} title={config.title} subtitle={config.subtitle} />

      {intakeView === 'dashboard' ? (
        <Card title='Bảng sản phẩm đầu vào'>
          <div className="intake-dashboard-table-wrap">
            <table className="data-table intake-dashboard-table">
              <thead>
                <tr>
                  <th>Mã sản phẩm</th>
                  <th>Tên sản phẩm</th>
                  <th>Đơn hàng</th>
                  <th>Tiến trình</th>
                  <th>Deadline KH</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {scopedProducts.map((entry) => {
                  const key = `${entry.order.id}::${entry.product.id}`;
                  const rowSummary = dashboardSummaryByOrderProductKey.get(key) || EMPTY_SUMMARY;
                  const active = key === selectedKey;
                  return (
                    <tr key={key} className={active ? 'is-active' : ''}>
                      <td>{entry.displayProductCode}</td>
                      <td>{entry.product.name}</td>
                      <td>{entry.displayOrderCode}</td>
                      <td>
                        <Badge tone={rowSummary.ready ? 'success' : rowSummary.blocked ? 'danger' : 'warning'}>
                          {rowSummary.approvedRequired}/{rowSummary.required}
                        </Badge>
                      </td>
                      <td>{entry.order.deadline || '-'}</td>
                      <td>
                        <button
                          className="production-plan-icon-btn"
                          type="button"
                          title="Đầu vào chi tiết"
                          aria-label={`Đầu vào chi tiết ${entry.displayProductCode}`}
                          onClick={() => openDetailPanel(key)}
                        >
                          <Eye size={16} strokeWidth={1.9} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {!scopedProducts.length ? (
                  <tr>
                    <td colSpan={6} className='muted-text'>Chưa có sản phẩm phù hợp để nhập đầu vào.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {intakeView === 'detail' && !selected ? (
        <Card title="Đang tải chi tiết đầu vào">
          <div className="muted-text">Đang chuẩn bị dữ liệu sản phẩm...</div>
        </Card>
      ) : null}

      {intakeView === 'detail' && selected ? (
        <div className="intake-detail-page">
          <div className="intake-popup-shell intake-detail-shell">
            <div className="intake-popup-head">
              <div>
                <div className="intake-popup-eyebrow">{selected.displayProductCode}</div>
                <h3>Quản lý đầu vào chi tiết</h3>
              </div>
              <button className="intake-popup-close" onClick={openDashboard} aria-label="Đóng chi tiết">
                ×
              </button>
            </div>

            <GeneralInfoSummary
              infoTitle={summaryTitle}
              infoLabel={productInfoLabel}
              name={selected.product.name}
              orderCode={selected.displayOrderCode}
              orderId={selected.order.id}
              productCode={selected.displayProductCode}
              assigneeLabel={intakeAssignee}
              startDate={formatDisplayDate(intakeStartDate)}
              deadline={formatDisplayDate(metaDraft.dueDate || selected.order.deadline)}
              note={metaDraft.note}
            />

            <div className="intake-popup-section">
              <div className="intake-popup-section-head">
                <div>
                  <h4>Bảng checkpoint tài liệu</h4>
                  <p>SMF_01 gồm {items.length} nội dung tài liệu: {summary.required} phần bắt buộc và {items.length - summary.required} phần bổ sung.</p>
                </div>
                <div className="intake-popup-summary-stat">
                  <span>Mục bắt buộc đã duyệt</span>
                  <strong>{summary.approvedRequired}/{summary.required}</strong>
                </div>
              </div>

              <div className="intake-popup-table-wrap">
                <table className="data-table intake-popup-table">
                  <thead>
                    <tr>
                      <th>Loại tài liệu</th>
                      <th>Tên tài liệu</th>
                      <th>Thời gian cập nhật</th>
                      <th>Trạng thái</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => {
                      const operation = itemOperations[item.id];
                      const statusMeta = getInputStatusMeta(item.status);
                      return (
                        <tr key={item.id}>
                          <td>{item.label}</td>
                          <td>
                            <div className="intake-popup-file-cell">
                              <div className="intake-popup-file-main">{item.file_name || 'Bắt buộc. Chưa chọn file'}</div>
                              <div className="intake-popup-file-actions">
                                <label className="btn btn-ghost btn-small">
                                  {item.file_name ? 'Đổi file' : 'Chọn file'}
                                  <input
                                    type="file"
                                    style={{ display: 'none' }}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (!file) return;
                                      void runItemAction({ item, action: 'upload', file });
                                      event.currentTarget.value = '';
                                    }}
                                  />
                                </label>
                                {item.file_url ? (
                                  <a className="btn btn-ghost btn-small" href={item.file_url} target="_blank" rel="noreferrer">
                                    Xem file
                                  </a>
                                ) : null}
                              </div>
                              {operation ? (
                                <div className="intake-popup-operation">
                                  <div className={`intake-popup-operation-label tone-${operation.tone}`}>{operation.label}</div>
                                  <div className="progress-track intake-progress-track">
                                    <div className={`progress-fill tone-${operation.tone}`} style={{ width: `${operation.progress}%` }} />
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </td>
                          <td>{formatDisplayDate(item.updated_at)}</td>
                          <td>
                            <span className={`intake-popup-status tone-${statusMeta.tone}`}>{statusMeta.label}</span>
                          </td>
                          <td>
                            <div className="intake-popup-row-actions">
                              <button
                                className="btn btn-ghost btn-small"
                                onClick={() => void runItemAction({ item, action: 'approve' })}
                                disabled={itemMutation.isPending}
                              >
                                Duyệt
                              </button>
                              <button
                                className="btn btn-ghost btn-small"
                                onClick={() => void runItemAction({ item, action: 'request' })}
                                disabled={itemMutation.isPending}
                              >
                                Chưa đạt
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="intake-popup-footer">
              <div className="intake-popup-footer-note">
                {confirmNotice || `Mục bắt buộc đã duyệt: ${summary.approvedRequired}/${summary.required}`}
              </div>
              <div className="intake-popup-footer-actions">
                <button className="btn btn-ghost" onClick={() => saveOverviewMutation.mutate()} disabled={saveOverviewMutation.isPending}>
                  {saveOverviewMutation.isPending ? 'Đang lưu...' : 'Lưu thông tin'}
                </button>
                <button className="btn btn-ghost" onClick={() => approveRequiredMutation.mutate()} disabled={approveRequiredMutation.isPending || !items.length}>
                  Duyệt toàn bộ
                </button>
                <button className="btn btn-primary" onClick={() => confirmMutation.mutate()} disabled={!summary.ready || confirmMutation.isPending}>
                  {confirmMutation.isPending ? 'Đang xác nhận...' : 'Xác nhận'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAppShell } from '@/contexts/AppShellContext';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { GeneralInfoSummary } from '@/components/workflow/GeneralInfoSummary';
import { useToast } from '@/components/system/ToastProvider';
import { isAdminLikeRole, normalizeAppRole } from '@/data/vcontent';
import { fetchMyTasksPreview, getMyTasksPreviewQueryKey, shouldUseMyTasksPreview } from '@/lib/myTasksPreview';
import { buildDisplayProductCodeMap, getDisplayOrderCode } from '@/lib/orderDisplayCodes';
import { toAssignableProfiles } from '@/lib/taskAssignee';
import {
  archiveTasksForStage,
  createActivityLog,
  ensureTaskForStage,
  ensureWorkflowRecord,
  inferProductWorkflowModule,
  listActivityLogs,
  listInputItems,
  listOrdersWithProducts,
  listProfiles,
  listTasks,
  listWorkflowRecords,
  updateOrder,
  updateProduct,
  updateTask,
  updateWorkflowRecord,
  uploadWorkflowAsset,
  type InputItemRow,
  type OrderRow,
  type ProductRow,
  type StoryboardRow,
  type TaskRow,
} from '@/services/vcontent';
import type { PageKey } from '@/data/vcontent';

const STORYBOARD_MAX_UPLOAD_MB = 200;
const STORYBOARD_MAX_UPLOAD_BYTES = STORYBOARD_MAX_UPLOAD_MB * 1024 * 1024;

type StoryboardPageConfig = {
  pageId: 'smf02' | 'vsmf02';
  module: 'ELN' | 'VIDEO';
  eye: string;
  title: string;
  subtitle: string;
  nextStagePage: string;
  nextStageRoute: PageKey;
  stageCode: 'SMF-02' | 'VSMF-02';
};

type NoticeState = {
  tone: 'success' | 'danger' | 'warning';
  message: string;
} | null;

type UploadOperationState = {
  label: string;
  progress: number;
  tone: 'warning' | 'danger' | 'success' | 'violet' | 'neutral';
};

type StoryboardAction = 'start' | 'submit' | 'upload_file';

type TrackingAssignment = {
  productId?: string;
  stageCode?: string;
  plannedStartDate?: string | null;
  plannedDeadline?: string | null;
  assigneeProfileId?: string | null;
  assigneeName?: string | null;
  note?: string | null;
  checkpointStatus?: string | null;
  updatedAt?: string | null;
};

type StoryboardQueueRow = {
  order: OrderRow;
  product: ProductRow;
  displayProductCode: string;
  task: TaskRow | null;
  storyboard: StoryboardRow | null;
  inputScript: InputItemRow | null;
  stageAssignment: TrackingAssignment | null;
};

const CONFIGS: Record<'smf02' | 'vsmf02', StoryboardPageConfig> = {
  smf02: {
    pageId: 'smf02',
    module: 'ELN',
    eye: 'Module 2 · SMF-02',
    title: 'Storyboard',
    subtitle: 'Danh sách sản phẩm storyboard, xem chi tiết và cập nhật tiến độ thực hiện.',
    nextStagePage: 'SMF-03',
    nextStageRoute: 'smf03',
    stageCode: 'SMF-02',
  },
  vsmf02: {
    pageId: 'vsmf02',
    module: 'VIDEO',
    eye: 'Module 3 · VSMF-02',
    title: 'Storyboard',
    subtitle: 'Danh sách sản phẩm storyboard video, xem chi tiết và cập nhật tiến độ thực hiện.',
    nextStagePage: 'VSMF-03',
    nextStageRoute: 'vsmf03',
    stageCode: 'VSMF-02',
  },
};

function getPendingNotice(action: StoryboardAction, payload?: { file?: File }) {
  if (action === 'start') return 'Đang ghi nhận thao tác xác nhận công việc...';
  if (action === 'submit') return 'Đang ghi nhận thao tác hoàn thành storyboard...';
  if (action === 'upload_file') return `Đang tải lên file storyboard${payload?.file?.name ? ` ${payload.file.name}` : ''}...`;
  return 'Đang xử lý thao tác...';
}

function formatErrorMessage(error: unknown) {
  if (!error) return 'Đã xảy ra lỗi.';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const maybe = error as { message?: string; details?: string; hint?: string; code?: string };
    return maybe.message || maybe.details || maybe.hint || maybe.code || JSON.stringify(error);
  }
  return String(error);
}

function toneForStatus(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' | 'purple' {
  if (['overdue', 'fail', 'rejected', 'changes_requested'].includes(status)) return 'danger';
  if (['todo', 'not_started'].includes(status)) return 'purple';
  if (['submitted', 'review', 'in_review'].includes(status)) return 'warning';
  if (['done', 'approved', 'completed'].includes(status)) return 'success';
  if (['draft', 'in_progress', 'confirmed'].includes(status)) return 'violet';
  return 'neutral';
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

function moduleMatches(productId: string, order: OrderRow, module: 'ELN' | 'VIDEO') {
  return inferProductWorkflowModule(productId, order.module) === module;
}

function makeAssignmentKey(productId: string, stageCode: string) {
  return `${productId}::${stageCode}`;
}

function readTrackingAssignments(order: OrderRow) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {};
  const assignments = (raw as { tracking_assignments?: Record<string, TrackingAssignment> }).tracking_assignments;
  if (!assignments || typeof assignments !== 'object') return {};
  return assignments;
}

function getStageAssignment(order: OrderRow, productId: string, stageCode: StoryboardPageConfig['stageCode']) {
  const assignments = readTrackingAssignments(order);
  return (
    assignments[makeAssignmentKey(productId, stageCode)] ||
    Object.values(assignments).find((entry) => entry?.productId === productId && entry?.stageCode === stageCode) ||
    null
  );
}

function getStoryboardStageDeadline(row: StoryboardQueueRow | null | undefined) {
  return row?.stageAssignment?.plannedDeadline || row?.task?.due_date || row?.storyboard?.due_date || row?.order.deadline || '';
}

function getStoryboardStageStartDate(row: StoryboardQueueRow | null | undefined) {
  return row?.stageAssignment?.plannedStartDate || '';
}

function getStoryboardStatus(task: TaskRow | null, product: ProductRow, storyboard: StoryboardRow | null) {
  if (storyboard?.status) return storyboard.status;
  if (product.current_stage_index > 1) return 'approved';
  if (!task) return 'todo';
  if (task.status === 'review') return 'submitted';
  if (task.status === 'fail' || task.status === 'qc_fail') return 'changes_requested';
  if (task.status === 'in_progress') return 'in_progress';
  return task.status || 'todo';
}

function getAssetLabel(value: string | null | undefined) {
  if (!value) return 'Chưa có file';
  if (/^https?:\/\//i.test(value)) {
    const clean = value.split('?')[0];
    return decodeURIComponent(clean.slice(clean.lastIndexOf('/') + 1));
  }
  return value;
}

function pickStepOneScript(inputItems: InputItemRow[], orderId: string, productId: string, module: 'ELN' | 'VIDEO') {
  const scopedItems = inputItems.filter(
    (entry) => entry.order_id === orderId && entry.product_id === productId && entry.module === module,
  );

  const ranked = scopedItems
    .map((entry) => {
      const hasFile = Boolean(entry.file_url || entry.file_name);
      const looksLikeScript =
        entry.item_code === 'lesson_script' ||
        entry.item_type === 'script' ||
        /kịch bản|lesson script|script/i.test(`${entry.label} ${entry.item_code}`);

      let score = 0;
      if (looksLikeScript) score += 10;
      if (entry.item_code === 'lesson_script') score += 8;
      if (entry.item_type === 'script') score += 6;
      if (hasFile) score += 4;
      if (entry.status === 'approved') score += 2;
      if (entry.status === 'submitted') score += 1;
      return { entry, score };
    })
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.entry || null;
}

function resolveInputAssetUrl(item: InputItemRow | null) {
  if (!item) return null;
  if (item.file_url) return item.file_url;
  return /^https?:\/\//i.test(item.file_name || '') ? item.file_name : null;
}

function formatRelativeUploadMeta(value: string | null | undefined) {
  if (!value) return 'Vừa upload';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Vừa upload';
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) return `Cập nhật ${diffHours} giờ trước`;
  const diffDays = Math.max(1, Math.round(diffHours / 24));
  return `Cập nhật ${diffDays} ngày trước`;
}

function getAvatarInitials(name: string) {
  const parts = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return '--';
  return parts
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function validateStoryboardFile(file: File) {
  if (file.size > STORYBOARD_MAX_UPLOAD_BYTES) {
    throw new Error(`File storyboard vượt quá ${STORYBOARD_MAX_UPLOAD_MB}MB.`);
  }
}

function getWorkflowStartedAt(task: TaskRow | null, startedAtByTask: Map<string, string>, startedAtOverrides: Record<string, string>) {
  if (!task?.id) return '';
  return startedAtOverrides[task.id] || startedAtByTask.get(task.id) || '';
}

function parseStoryboardDeadline(value: string | null | undefined) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const vnDate = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalized = vnDate ? `${vnDate[3]}-${vnDate[2].padStart(2, '0')}-${vnDate[1].padStart(2, '0')}` : raw.slice(0, 10);
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPastStoryboardDeadline(value: string | null | undefined) {
  const deadline = parseStoryboardDeadline(value);
  if (!deadline) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return deadline.getTime() < today.getTime();
}

function getCheckpointMeta(row: StoryboardQueueRow, startedAt: string) {
  const deadline = getStoryboardStageDeadline(row);
  const hasInput = Boolean(row.inputScript?.file_url || row.inputScript?.file_name);
  const hasStoryboardFile = Boolean(row.storyboard?.file_name);
  const rawStatus = row.storyboard?.status || row.task?.status || 'todo';
  const isCompleted = ['approved', 'done', 'submitted', 'review', 'in_review'].includes(rawStatus);
  const isStarted = Boolean(startedAt) || rawStatus === 'in_progress' || rawStatus === 'draft';

  if (!hasInput) {
    return { label: 'Chưa có đầu vào', tone: 'warning' as const };
  }

  if (isPastStoryboardDeadline(deadline) && !isCompleted) {
    return { label: 'Quá hạn', tone: 'danger' as const };
  }

  if (isCompleted) {
    return { label: 'Hoàn thành', tone: 'success' as const };
  }

  if (hasStoryboardFile) {
    return { label: 'Đang thực hiện', tone: 'violet' as const };
  }

  if (isStarted) {
    return { label: 'Đã xác nhận', tone: 'violet' as const };
  }

  return { label: 'Chưa bắt đầu', tone: 'neutral' as const };
}

function isCompletedCheckpoint(row: StoryboardQueueRow) {
  const rawStatus = row.storyboard?.status || row.task?.status || 'todo';
  return ['approved', 'done', 'submitted', 'review', 'in_review'].includes(rawStatus);
}

export function StoryboardStagePage({ pageId }: { pageId: PageKey }) {
  const config = CONFIGS[pageId as 'smf02' | 'vsmf02'];
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile, loading } = useAuth();
  const { role: shellRole } = useAppShell();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const viewerRole = normalizeAppRole(profile?.role || shellRole);
  const shouldAutoNavigate = isAdminLikeRole(viewerRole);
  const isAdminRole = isAdminLikeRole(viewerRole);
  const canEditStoryboard = Boolean(viewerRole && !['client', 'client_director'].includes(viewerRole));
  const showAdminMonitorBlock = isAdminRole;
  const shouldUseServerPreview = !loading && shouldUseMyTasksPreview(viewerRole);
  const previewOptions = useMemo(() => ({ stageIndices: [1], includeActivityLogs: true }), []);

  const [selectedKey, setSelectedKey] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [startedAtOverrides, setStartedAtOverrides] = useState<Record<string, string>>({});
  const [uploadOperation, setUploadOperation] = useState<UploadOperationState | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const previewQuery = useQuery({
    queryKey: getMyTasksPreviewQueryKey(viewerRole || shellRole, profile?.email || '', previewOptions),
    queryFn: () => fetchMyTasksPreview(viewerRole || shellRole, profile?.email || null, previewOptions),
    enabled: shouldUseServerPreview,
    staleTime: 1000 * 60,
  });
  const useFallbackQueries = !shouldUseServerPreview || previewQuery.isError;
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts, staleTime: 1000 * 60, enabled: useFallbackQueries });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'stage', 1], queryFn: () => listTasks({ stageIndices: [1] }), staleTime: 1000 * 60, enabled: useFallbackQueries });
  const workflowQuery = useQuery({
    queryKey: ['workflow-records', 'storyboard', config.module],
    queryFn: () => listWorkflowRecords({ kinds: ['storyboard'], includeReviews: false, includeQuestionLibrary: false }),
    staleTime: 1000 * 60,
    enabled: useFallbackQueries,
  });
  const inputItemsQuery = useQuery({
    queryKey: ['input-items', config.module],
    queryFn: () => listInputItems({ module: config.module }),
    staleTime: 1000 * 60,
    enabled: useFallbackQueries,
  });
  const activityLogsQuery = useQuery({
    queryKey: ['activity-logs', 'task-starts', config.stageCode],
    queryFn: () => listActivityLogs({ actionTypes: ['task_started', 'workflow_step_started', 'workflow_review_claimed'], limit: 500 }),
    staleTime: 1000 * 60 * 2,
    enabled: useFallbackQueries,
  });
  const profilesQuery = useQuery({ queryKey: ['profiles', 'storyboard-assignees'], queryFn: listProfiles, staleTime: 1000 * 60 * 5, enabled: useFallbackQueries });
  const usePreviewData = shouldUseServerPreview && Boolean(previewQuery.data);
  const ordersData = usePreviewData ? { orders: previewQuery.data!.orders, products: previewQuery.data!.products } : ordersQuery.data;
  const tasksData = usePreviewData ? (previewQuery.data?.tasks || []) : (tasksQuery.data || []);
  const profilesData = usePreviewData ? (previewQuery.data?.profiles || []) : (profilesQuery.data || []);
  const activityLogs = usePreviewData ? (previewQuery.data?.activityLogs || []) : (activityLogsQuery.data || []);
  const storyboardsData = usePreviewData ? (previewQuery.data?.storyboards || []) : (workflowQuery.data?.storyboards || []);
  const inputItemsData = usePreviewData ? (previewQuery.data?.inputItems || []) : (inputItemsQuery.data || []);
  const stageWorkKeys = useMemo(
    () =>
      new Set(
        (previewQuery.data?.workItems || [])
          .filter((item) => item.stage_index === 1)
          .map((item) => `${item.order_id}::${item.product_id}`),
      ),
    [previewQuery.data?.workItems],
  );

  const rows = useMemo(() => {
    const orders = ordersData?.orders || [];
    const products = ordersData?.products || [];
    const tasks = tasksData;
    const storyboards = storyboardsData;
    const inputItems = inputItemsData;
    const productsByOrderId = new Map<string, typeof products>();
    const stageTaskByOrderProduct = new Map<string, (typeof tasks)[number]>();
    const storyboardByOrderProduct = new Map<string, (typeof storyboards)[number]>();
    const inputItemsByOrderProduct = new Map<string, InputItemRow[]>();

    for (const product of products) {
      const bucket = productsByOrderId.get(product.order_id) || [];
      bucket.push(product);
      productsByOrderId.set(product.order_id, bucket);
    }
    for (const task of tasks) {
      if (task.archived || task.stage_index !== 1) continue;
      const key = `${task.order_id}::${task.product_id}`;
      if (!stageTaskByOrderProduct.has(key)) stageTaskByOrderProduct.set(key, task);
    }
    for (const storyboard of storyboards) {
      const key = `${storyboard.order_id}::${storyboard.product_id}`;
      if (!storyboardByOrderProduct.has(key)) storyboardByOrderProduct.set(key, storyboard);
    }
    for (const item of inputItems) {
      const key = `${item.order_id}::${item.product_id}`;
      const bucket = inputItemsByOrderProduct.get(key) || [];
      bucket.push(item);
      inputItemsByOrderProduct.set(key, bucket);
    }

    const displayProductCodeMap = new Map(
      orders.flatMap((order) => {
        const orderProducts = productsByOrderId.get(order.id) || [];
        const displayOrderCode = getDisplayOrderCode(order);
        return [...buildDisplayProductCodeMap(displayOrderCode, orderProducts)];
      }),
    );

    const baseRows = orders
      .flatMap((order) =>
        (productsByOrderId.get(order.id) || [])
          .filter((product) => moduleMatches(product.id, order, config.module))
          .map((product) => {
            const key = `${order.id}::${product.id}`;
            const task = stageTaskByOrderProduct.get(key) || null;
            const storyboard = storyboardByOrderProduct.get(key) || null;
            const scopedInputItems = (inputItemsByOrderProduct.get(key) || []).filter((entry) => entry.module === config.module);
            const inputScript = pickStepOneScript(scopedInputItems, order.id, product.id, config.module);
            const stageAssignment = getStageAssignment(order, product.id, config.stageCode);
            const isRelevant = product.current_stage_index >= 1 || task || storyboard || inputScript;
            if (!isRelevant) return null;

            return {
              order,
              product,
              displayProductCode: displayProductCodeMap.get(product.id) || product.id,
              task,
              storyboard: storyboard
                ? {
                    ...storyboard,
                    status: getStoryboardStatus(task, product, storyboard),
                  }
                : null,
              inputScript,
              stageAssignment,
            };
          }),
      )
      .filter(Boolean) as StoryboardQueueRow[];

    if (usePreviewData) {
      return baseRows.filter((row) => stageWorkKeys.has(`${row.order.id}::${row.product.id}`));
    }
    return baseRows;
  }, [config.module, config.stageCode, inputItemsData, ordersData, stageWorkKeys, storyboardsData, tasksData, usePreviewData]);

  useEffect(() => {
    const productKey = searchParams.get('product');
    if (productKey) {
      if (productKey !== selectedKey) setSelectedKey(productKey);
      return;
    }
    if (!selectedKey && rows[0]) {
      setSelectedKey(`${rows[0].order.id}::${rows[0].product.id}`);
    }
  }, [rows, searchParams, selectedKey]);

  const selected = useMemo(
    () => rows.find((entry) => `${entry.order.id}::${entry.product.id}` === selectedKey) || null,
    [rows, selectedKey],
  );

  const assigneeProfiles = useMemo(
    () => toAssignableProfiles(profilesData, ['admin', 'content_manager', 'production_manager', 'pm', 'specialist', 'designer', 'vc', 'hoc_gia']),
    [profilesData],
  );

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
    if (!uploadOperation) return;
    const timer = window.setInterval(() => {
      setUploadOperation((current) => {
        if (!current) return current;
        return {
          ...current,
          progress: current.progress >= 92 ? current.progress : Math.min(92, current.progress + (current.progress < 40 ? 18 : current.progress < 72 ? 10 : 4)),
        };
      });
    }, 260);
    return () => window.clearInterval(timer);
  }, [uploadOperation]);

  const selectedStartedAt = selected
    ? getWorkflowStartedAt(selected.task, startedAtByTask, startedAtOverrides) || getStoryboardStageStartDate(selected)
    : '';
  const selectedCheckpoint = selected ? getCheckpointMeta(selected, selectedStartedAt) : null;
  const selectedIsCompleted = selected ? isCompletedCheckpoint(selected) : false;
  const selectedAssigneeLabel =
    selected?.task?.assignee ||
    assigneeProfiles.find((entry) => entry.profileId === selected?.storyboard?.assignee_profile_id)?.fullName ||
    'Chưa phân công';
  const selectedDeadline = formatDisplayDate(getStoryboardStageDeadline(selected));
  const stageNote = selected?.storyboard?.notes?.trim() || 'Vui lòng đối chiếu storyboard với tài liệu đầu vào từ SMF-01 trước khi hoàn thành.';
  const inputFileStatus = selected?.inputScript?.status === 'approved' ? 'Đã xác nhận đầu vào' : 'Vừa upload';
  const selectedInputAssetUrl = resolveInputAssetUrl(selected?.inputScript || null);
  const selectedInputAssetLabel = getAssetLabel(selected?.inputScript?.file_name || selected?.inputScript?.file_url || '');
  const selectedInputMeta = selected?.inputScript?.file_name
    ? `Tài liệu bước 1 | ${formatRelativeUploadMeta(selected.inputScript.updated_at)}`
    : 'Chưa có tài liệu đầu vào';

  function handleStoryboardFile(file: File) {
    setIsDragOver(false);
    void runStoryboardUpload(file);
  }

  async function runStoryboardUpload(file: File) {
    setUploadOperation({
      label: 'Đang tải file storyboard lên hệ thống',
      progress: 8,
      tone: 'violet',
    });
    try {
      await storyboardMutation.mutateAsync({ action: 'upload_file', payload: { file } });
      setUploadOperation({
        label: 'Đã tải file lên thành công',
        progress: 100,
        tone: 'success',
      });
      window.setTimeout(() => setUploadOperation(null), 700);
    } catch (error) {
      setUploadOperation({
        label: 'Tải file thất bại, vui lòng thử lại',
        progress: 100,
        tone: 'danger',
      });
      window.setTimeout(() => setUploadOperation(null), 1200);
      throw error;
    }
  }

  const storyboardMutation = useMutation({
    mutationFn: async (input: { action: StoryboardAction; payload?: { file?: File } }) => {
      if (!selected) throw new Error('Chưa chọn storyboard.');
      const { order, product, task } = selected;
      const existingTasks = tasksData;
      const ensuredTask =
        task ||
        (await ensureTaskForStage({
          orderId: order.id,
          productId: product.id,
          stageIndex: 1,
          existingTasks,
          assignee: selected.task?.assignee || null,
          assigneeProfileId: selected.task?.assignee_profile_id || null,
          assigneeAccountId: selected.task?.assignee_account_id || null,
          dueDate: selected.task?.due_date || order.deadline || null,
        }));

      const storyboard = await ensureWorkflowRecord({
        kind: 'storyboard',
        orderId: order.id,
        productId: product.id,
        title: `${product.id}: ${product.name}`,
        profileId: profile?.id || null,
      });

      if (input.action === 'upload_file') {
        if (!input.payload?.file) throw new Error('Chưa có file để tải lên.');
        validateStoryboardFile(input.payload.file);
        const uploaded = await uploadWorkflowAsset({
          file: input.payload.file,
          orderId: order.id,
          productId: product.id,
          module: config.module,
          stageCode: config.stageCode,
          slot: 'storyboard',
          previousUrl: storyboard.file_name,
        });
        await updateWorkflowRecord('storyboard', storyboard.id, {
          file_name: uploaded.fileUrl,
          status: ensuredTask.status === 'todo' ? 'draft' : storyboard.status || 'draft',
          updated_at: new Date().toISOString(),
        });
        await updateTask(ensuredTask.id, {
          status: ensuredTask.status === 'todo' ? 'in_progress' : ensuredTask.status,
          progress: Math.max(ensuredTask.progress, 65),
        });
        return { notice: 'Đã tải file storyboard lên hệ thống.' };
      }

      if (input.action === 'start') {
        const shouldLogStart = ensuredTask.status === 'todo';
        const startedAt = new Date().toISOString();
        await updateWorkflowRecord('storyboard', storyboard.id, {
          status: 'draft',
          due_date: ensuredTask.due_date || order.deadline || storyboard.due_date,
          updated_at: new Date().toISOString(),
        });
        await updateTask(ensuredTask.id, {
          status: 'in_progress',
          progress: Math.max(ensuredTask.progress, 30),
          due_date: ensuredTask.due_date || order.deadline || null,
        });
        await updateProduct(product.id, {
          current_stage_index: 1,
          progress: Math.max(product.progress, 25),
        });
        if (!['in_production', 'pending_acceptance', 'ready_delivery', 'paid'].includes(String(order.status || ''))) {
          await updateOrder(order.id, {
            status: 'in_production',
          });
        }
        if (shouldLogStart) {
          await createActivityLog({
            actorProfileId: profile?.id || null,
            actionType: 'workflow_step_started',
            objectType: 'task',
            objectId: ensuredTask.id,
            summary: `${product.id} started ${config.stageCode}`,
            metadata: {
              task_id: ensuredTask.id,
              order_id: order.id,
              product_id: product.id,
              stage_code: config.stageCode,
              stage_index: 1,
              module: config.module,
            },
          });
        }
        return { notice: 'Đã xác nhận công việc storyboard.', taskId: ensuredTask.id, startedAt };
      }

      if (!storyboard.file_name && !isAdminRole) {
        throw new Error('Vui lòng upload file storyboard trước khi hoàn thành.');
      }

      await updateWorkflowRecord('storyboard', storyboard.id, {
        status: 'in_review',
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await updateTask(ensuredTask.id, {
        status: 'review',
        progress: 100,
      });
      await createActivityLog({
        actorProfileId: profile?.id || null,
        actionType: 'workflow_step_submitted',
        objectType: 'workflow',
        objectId: storyboard.id,
        summary: `${product.id} submitted ${config.stageCode} to ${config.nextStagePage}`,
        metadata: {
          order_id: order.id,
          product_id: product.id,
          stage_code: config.stageCode,
          stage_index: 1,
          module: config.module,
        },
      });
      return { notice: 'Đã hoàn thành storyboard và chuyển sang trạng thái chờ duyệt.' };
    },
    onMutate: (input) => {
      const message = getPendingNotice(input.action, input.payload);
      setNotice({ tone: 'warning', message });
      pushToast({ title: 'Đang xử lý storyboard', message, tone: 'info', durationMs: 1800 });
    },
    onSuccess: async (result) => {
      setNotice({ tone: 'success', message: result?.notice || 'Đã ghi nhận thao tác.' });
      if (result?.taskId && result?.startedAt) {
        setStartedAtOverrides((current) => ({ ...current, [result.taskId]: result.startedAt }));
      }
      await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
      await queryClient.invalidateQueries({ queryKey: ['activity-logs', 'task-starts'] });
      if (shouldAutoNavigate && result?.notice?.includes('trạng thái chờ duyệt')) {
        navigate(`/${config.nextStageRoute}`);
      }
    },
    onError: (error) => {
      setNotice({ tone: 'danger', message: formatErrorMessage(error) });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Chưa chọn storyboard.');
      const { order, product, task, storyboard } = selected;
      const existingTasks = tasksData;
      const ensuredTask =
        task ||
        (await ensureTaskForStage({
          orderId: order.id,
          productId: product.id,
          stageIndex: 1,
          existingTasks,
          assignee: selected.task?.assignee || null,
          assigneeProfileId: selected.task?.assignee_profile_id || null,
          assigneeAccountId: selected.task?.assignee_account_id || null,
          dueDate: selected.task?.due_date || order.deadline || null,
        }));

      const ensuredStoryboard =
        storyboard ||
        (await ensureWorkflowRecord({
          kind: 'storyboard',
          orderId: order.id,
          productId: product.id,
          title: `${product.id}: ${product.name}`,
          profileId: profile?.id || null,
        }));

      await updateWorkflowRecord('storyboard', ensuredStoryboard.id, {
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      await updateTask(ensuredTask.id, {
        status: 'done',
        progress: 100,
      });
      await archiveTasksForStage(order.id, product.id, 1);
      await updateProduct(product.id, {
        current_stage_index: 2,
        progress: 38,
      });
      await ensureTaskForStage({
        orderId: order.id,
        productId: product.id,
        stageIndex: 2,
        existingTasks,
        assignee: null,
      });
    },
    onSuccess: async () => {
      setNotice({ tone: 'success', message: `Đã duyệt storyboard và mở ${config.nextStagePage}.` });
      await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['my-tasks-preview'] });
    },
    onError: (error) => {
      setNotice({ tone: 'danger', message: formatErrorMessage(error) });
    },
  });

  function openDetail(key: string) {
    setSelectedKey(key);
    setIsDetailOpen(true);
  }

  function closeDetail() {
    setIsDetailOpen(false);
  }

  return (
    <>
      <SectionHeader eye={config.eye} title={config.title} subtitle={config.subtitle} />

      {!isDetailOpen ? (
        <>
          <Card title="Danh sách storyboard">
            <div className="intake-dashboard-table-wrap">
              <table className="data-table intake-dashboard-table storyboard-dashboard-table">
                <thead>
                  <tr>
                    <th>Mã sản phẩm</th>
                    <th>Tên sản phẩm</th>
                    <th>Người phụ trách</th>
                    <th>Ngày bắt đầu</th>
                    <th>Deadline</th>
                    <th>Checkpoint</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = `${row.order.id}::${row.product.id}`;
                    const startedAt = getWorkflowStartedAt(row.task, startedAtByTask, startedAtOverrides);
                    const checkpoint = getCheckpointMeta(row, startedAt);
                    const assignee =
                      row.task?.assignee ||
                      assigneeProfiles.find((entry) => entry.profileId === row.storyboard?.assignee_profile_id)?.fullName ||
                      'Chưa phân công';
                    return (
                      <tr key={key} className={selectedKey === key ? 'is-active' : ''}>
                        <td>{row.displayProductCode}</td>
                        <td>{row.product.name}</td>
                        <td>{assignee}</td>
                        <td>{formatDisplayDateTime(startedAt)}</td>
                        <td>{formatDisplayDate(getStoryboardStageDeadline(row))}</td>
                        <td>
                          <Badge tone={checkpoint.tone}>{checkpoint.label}</Badge>
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-small" onClick={() => openDetail(key)}>
                            Xem chi tiết
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={7} className="muted-text">Chưa có sản phẩm phù hợp cho bước storyboard.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {isDetailOpen && selected ? (
        <div className="storyboard-detail-page">
          <div className="storyboard-detail-shell slide-design-detail-shell">
            <div className="storyboard-modal-head">
              <div>
                <div className="storyboard-modal-eyebrow">{config.stageCode} / Script / Storyboard Phase</div>
              </div>
              <button className="storyboard-modal-close" onClick={closeDetail} aria-label="Đóng cửa sổ chi tiết">
                Đóng
              </button>
            </div>

            <div className="slide-design-workspace storyboard-detail-workspace">
              <GeneralInfoSummary
                name={selected.product.name}
                orderCode={getDisplayOrderCode(selected.order)}
                orderId={selected.order.id}
                productCode={selected.displayProductCode}
                assigneeLabel={selectedAssigneeLabel}
                startDate={formatDisplayDateTime(selectedStartedAt)}
                deadline={selectedDeadline}
                note={selected.storyboard?.notes}
              />

              {notice ? (
                <div className={`bullet-item ${notice.tone === 'danger' ? 'tone-danger' : notice.tone === 'warning' ? 'tone-warning' : 'tone-success'}`}>
                  {notice.message}
                </div>
              ) : null}

              <div className="storyboard-modal-stack">
                  <section className="storyboard-modal-panel slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <div className="slide-design-section-eyebrow">PHẦN 1</div>
                        <h4>Tài liệu đầu vào</h4>
                        <p>File kịch bản từ SMF-01 để thực hiện storyboard.</p>
                      </div>
                    </div>
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
                          <div className="storyboard-input-bar-title">
                            {selectedInputAssetLabel || 'File kịch bản chi tiết - V2.pdf'}
                          </div>
                          <div className="storyboard-input-bar-meta">
                            {selectedInputMeta}
                          </div>
                        </div>
                      </div>
                      {selectedInputAssetUrl ? (
                        <a className="storyboard-input-bar-download" href={selectedInputAssetUrl} target="_blank" rel="noreferrer">
                          <span aria-hidden="true">↓</span>
                          <span>Tải xuống</span>
                        </a>
                      ) : (
                        <div className="storyboard-input-bar-empty">Chưa có file</div>
                      )}
                    </div>
                  </section>

                  <section className="storyboard-modal-panel slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <div className="slide-design-section-eyebrow">PHẦN 2</div>
                        <h4>Thực hiện Storyboard</h4>
                        <p>Nhận task, tải file storyboard và gửi hoàn thành để chuyển bước kế tiếp.</p>
                      </div>
                      <button
                        className="storyboard-ui-btn storyboard-confirm-btn"
                        onClick={() => storyboardMutation.mutate({ action: 'start' })}
                        disabled={!canEditStoryboard || storyboardMutation.isPending}
                      >
                        Xác nhận công việc
                      </button>
                    </div>
                  <div className="stack">
                    <div className="slide-design-upload-label">Tải lên Storyboard</div>
                    <label
                      className={`storyboard-upload-dropzone slide-design-upload-dropzone ${isDragOver ? 'is-dragover' : ''}`}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragEnter={(event) => {
                        event.preventDefault();
                        setIsDragOver(true);
                      }}
                      onDragLeave={(event) => {
                        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                        setIsDragOver(false);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const file = event.dataTransfer.files?.[0];
                        if (!file) {
                          setIsDragOver(false);
                          return;
                        }
                        handleStoryboardFile(file);
                      }}
                    >
                      <div className="slide-design-upload-icon" aria-hidden="true">📄</div>
                      <div className="storyboard-upload-dropzone-title">Nhấn để tải lên hoặc kéo thả file</div>
                      <div className="storyboard-upload-dropzone-subtitle">File storyboard, tối đa {STORYBOARD_MAX_UPLOAD_MB}MB</div>
                      <input
                        type="file"
                        disabled={!canEditStoryboard}
                        hidden
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (!file) return;
                          handleStoryboardFile(file);
                          event.currentTarget.value = '';
                        }}
                      />
                    </label>

                    {uploadOperation ? (
                      <div className="intake-progress-panel">
                        <div className="intake-progress-head">
                          <span>{uploadOperation.label}</span>
                          <span>{uploadOperation.progress}%</span>
                        </div>
                        <div className="progress-track intake-progress-track">
                          <div className={`progress-fill tone-${uploadOperation.tone}`} style={{ width: `${uploadOperation.progress}%` }} />
                        </div>
                      </div>
                    ) : null}

                    {selected.storyboard?.file_name ? (
                      <div className="storyboard-uploaded-file">
                        <div className="storyboard-input-file">
                          <div className="storyboard-input-file-icon" aria-hidden="true">
                            📎
                          </div>
                          <div className="storyboard-input-file-copy">
                            <div className="muted-text">File storyboard đã tải lên</div>
                            <a href={selected.storyboard.file_name} target="_blank" rel="noreferrer">
                              {getAssetLabel(selected.storyboard.file_name)}
                            </a>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="storyboard-upload-meta-row" aria-hidden="true">
                      <span className="storyboard-upload-meta-item">☁</span>
                      <span className="storyboard-upload-meta-item is-danger">■</span>
                    </div>
                  </div>
                </section>

                <div className="storyboard-note-box" role="note" aria-label="Lưu ý thực hiện">
                  <div className="storyboard-note-box-label">LƯU Ý THỰC HIỆN</div>
                  <p>{stageNote}</p>
                </div>

                {showAdminMonitorBlock && isAdminRole ? (
                  <section className="storyboard-modal-panel slide-design-section">
                    <div className="slide-design-section-head">
                      <div>
                        <div className="slide-design-section-eyebrow">THEO DÕI</div>
                        <h4>Chi tiết theo dõi</h4>
                        <p>Thông tin hiển thị cho quản trị viên.</p>
                      </div>
                    </div>
                    <div className="stack compact">
                      <div className="bullet-item">Tên sản phẩm: {selected.product.name}</div>
                      <div className="bullet-item">Mã sản phẩm: {selected.displayProductCode}</div>
                      <div className="bullet-item">Người phụ trách: {selectedAssigneeLabel}</div>
                      <div className="bullet-item">Ngày bắt đầu: {formatDisplayDateTime(selectedStartedAt)}</div>
                      <div className="bullet-item">Deadline: {formatDisplayDate(getStoryboardStageDeadline(selected))}</div>
                      <div className="bullet-item">Checkpoint hiện tại: {selectedCheckpoint?.label || '-'}</div>
                      {selectedIsCompleted && selected.storyboard?.file_name ? (
                        <div className="bullet-item">
                          File storyboard đã tải lên: <a href={selected.storyboard.file_name} target="_blank" rel="noreferrer">{getAssetLabel(selected.storyboard.file_name)}</a>
                        </div>
                      ) : (
                        <div className="bullet-item">File storyboard đã tải lên: {selectedIsCompleted ? 'Chưa có' : 'Chỉ hiển thị khi đã hoàn thành'}</div>
                      )}
                    </div>
                    {selected.storyboard?.status === 'submitted' || selected.task?.status === 'review' ? (
                      <div className="action-row storyboard-modal-footer-row">
                        <button className="btn btn-primary" onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
                          {approveMutation.isPending ? `Đang mở ${config.nextStagePage}...` : `Duyệt và mở ${config.nextStagePage}`}
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <div className="storyboard-modal-footer slide-design-footer">
                  <div className="storyboard-modal-actions">
                    <button className="storyboard-ui-btn storyboard-ui-btn-ghost" onClick={closeDetail}>
                      Hủy bỏ
                    </button>
                    <button
                      className="storyboard-ui-btn storyboard-ui-btn-primary storyboard-ui-btn-complete"
                      onClick={() => storyboardMutation.mutate({ action: 'submit' })}
                      disabled={!canEditStoryboard || storyboardMutation.isPending || (!isAdminRole && !selected.storyboard?.file_name)}
                    >
                      Hoàn thành
                    </button>
                  </div>
                </div>
              </div>
          </div>
        </div>
        </div>
      ) : null}
    </>
  );
}

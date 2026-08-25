import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useToast } from '@/components/system/ToastProvider';
import { getStatusDisplayLabel } from '@/lib/statusLabels';
import { isAdminLikeRole } from '@/data/vcontent';
import {
  archiveTasksForStage,
  deleteIntakeAsset,
  ensureGameBriefConfigItem,
  ensureInputItemsForProduct,
  ensureTaskForStage,
  getInputTemplate,
  inferProductWorkflowModule,
  isGameBriefReady,
  listInputItems,
  listOrdersWithProducts,
  listProfiles,
  listTasks,
  parseGameBriefConfig,
  saveGameBriefConfig,
  updateInputItem,
  updateOrder,
  updateProduct,
  uploadIntakeAsset,
  type GameBriefConfig,
  type InputItemRow,
} from '@/services/vcontent';

type ItemOperationState = {
  action: 'upload' | 'delete' | 'request' | 'approve' | 'save';
  label: string;
  progress: number;
  tone: 'warning' | 'danger' | 'success' | 'violet' | 'neutral';
};

function toneForStatus(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' | 'purple' {
  if (['missing', 'changes_requested', 'blocked', 'fail'].includes(status)) return 'danger';
  if (['todo', 'not_started'].includes(status)) return 'purple';
  if (['submitted', 'review', 'in_review'].includes(status)) return 'warning';
  if (['approved', 'done', 'ready', 'ready_launch'].includes(status)) return 'success';
  if (['in_progress'].includes(status)) return 'violet';
  return 'neutral';
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

function makeInitialDrafts(items: InputItemRow[]) {
  return {
    links: Object.fromEntries(items.map((item) => [item.id, item.file_url || ''])) as Record<string, string>,
    notes: Object.fromEntries(items.map((item) => [item.id, item.notes || ''])) as Record<string, string>,
  };
}

function defaultBriefDates() {
  const start = new Date();
  const end = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function mergeBrief(base: GameBriefConfig, patch: Partial<GameBriefConfig>) {
  return { ...base, ...patch };
}

const GAME_INTAKE_MAX_UPLOAD_MB = 200;
const GAME_INTAKE_MAX_UPLOAD_BYTES = GAME_INTAKE_MAX_UPLOAD_MB * 1024 * 1024;

function validateGameIntakeFile(file: File) {
  if (file.size > GAME_INTAKE_MAX_UPLOAD_BYTES) {
    throw new Error(`File vượt quá ${GAME_INTAKE_MAX_UPLOAD_MB}MB.`);
  }
}

export function GameInputGatePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pushToast } = useToast();
  const shouldAutoNavigate = isAdminLikeRole(profile?.role);
  const queryClient = useQueryClient();
  const seededProductKeysRef = useRef<Set<string>>(new Set());
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const inputItemsQuery = useQuery({ queryKey: ['input-items', 'GAME'], queryFn: () => listInputItems({ module: 'GAME' }) });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'stage-0'], queryFn: () => listTasks({ stageIndices: [0] }) });

  const scopedProducts = useMemo(() => {
    const orders = ordersQuery.data?.orders || [];
    const products = ordersQuery.data?.products || [];
    const tasks = tasksQuery.data || [];
    return orders.flatMap((order) =>
      products
        .filter((product) => product.order_id === order.id && inferProductWorkflowModule(product.id, order.module) === 'GAME')
        .map((product) => {
          if (!isLaunchedProduct(product.id, product.progress, tasks)) return null;
          return { order, product };
        }),
    ).filter(Boolean) as Array<{ order: (typeof orders)[number]; product: (typeof products)[number] }>;
  }, [ordersQuery.data, tasksQuery.data]);

  const [selectedKey, setSelectedKey] = useState('');
  const [linkDrafts, setLinkDrafts] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [confirmNotice, setConfirmNotice] = useState<string | null>(null);
  const [itemOperations, setItemOperations] = useState<Record<string, ItemOperationState>>({});
  const [briefDraft, setBriefDraft] = useState<GameBriefConfig>(() => {
    const dates = defaultBriefDates();
    return {
      projectName: '',
      topicName: '',
      gameTitle: '',
      gameDescription: '',
      gameLogic: '',
      targetSkill: '',
      durationMinutes: 15,
      platform: 'web',
      deviceTarget: 'desktop',
      exportResultRequired: false,
      excelTemplateUrl: '',
      startDate: dates.startDate,
      endDate: dates.endDate,
      status: 'draft',
      notes: '',
    };
  });

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

  const selected = useMemo(
    () => scopedProducts.find((item) => `${item.order.id}::${item.product.id}` === selectedKey) || null,
    [scopedProducts, selectedKey],
  );

  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await ensureInputItemsForProduct({
        orderId: selected.order.id,
        productId: selected.product.id,
        module: 'GAME',
        existingItems: inputItemsQuery.data || [],
        ownerProfileId: profile?.id || null,
      });
      await ensureGameBriefConfigItem({
        orderId: selected.order.id,
        productId: selected.product.id,
        existingItems: inputItemsQuery.data || [],
        ownerProfileId: profile?.id || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['input-items'] });
      pushToast({ title: 'Đã chuẩn bị checklist GSMF-01', message: 'Hệ thống đã tạo các mục intake game cần thiết.', tone: 'success' });
    },
    onError: (error) => {
      pushToast({ title: 'Thao tác intake game thất bại', message: error instanceof Error ? error.message : String(error), tone: 'danger', durationMs: 4200 });
    },
  });

  useEffect(() => {
    if (!selected || !inputItemsQuery.data) return;
    const currentItems = inputItemsQuery.data.filter(
      (item) => item.order_id === selected.order.id && item.product_id === selected.product.id && item.module === 'GAME',
    );
    const hasTemplate = currentItems.some((item) => item.item_code === 'game_objective');
    const hasConfig = currentItems.some((item) => item.item_code === 'game_brief_config');
    if (!hasTemplate || !hasConfig) {
      const productKey = `${selected.order.id}::${selected.product.id}`;
      if (seedMutation.isPending || seededProductKeysRef.current.has(productKey)) return;
      seededProductKeysRef.current.add(productKey);
      void seedMutation.mutateAsync(undefined, {
        onError: () => {
          seededProductKeysRef.current.delete(productKey);
        },
      });
    }
  }, [selected, inputItemsQuery.data, seedMutation.isPending]);

  const items = useMemo(() => {
    if (!selected) return [];
    const raw = (inputItemsQuery.data || []).filter(
      (item) =>
        item.order_id === selected.order.id &&
        item.product_id === selected.product.id &&
        item.module === 'GAME' &&
        item.item_code !== 'game_brief_config',
    );
    return getInputTemplate('GAME')
      .map((template) => raw.find((item) => item.item_code === template.code))
      .filter(Boolean) as InputItemRow[];
  }, [selected, inputItemsQuery.data]);

  const configItem = useMemo(() => {
    if (!selected) return null;
    return (
      (inputItemsQuery.data || []).find(
        (item) =>
          item.order_id === selected.order.id &&
          item.product_id === selected.product.id &&
          item.module === 'GAME' &&
          item.item_code === 'game_brief_config',
      ) || null
    );
  }, [selected, inputItemsQuery.data]);

  useEffect(() => {
    const drafts = makeInitialDrafts(items);
    setLinkDrafts(drafts.links);
    setNoteDrafts(drafts.notes);
  }, [selectedKey, items]);

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

  useEffect(() => {
    if (!configItem) return;
    const parsed = parseGameBriefConfig(configItem);
    const dates = defaultBriefDates();
    setBriefDraft({
      ...parsed,
      startDate: parsed.startDate || dates.startDate,
      endDate: parsed.endDate || dates.endDate,
    });
  }, [configItem]);

  const summary = getSummary(items);
  const briefReady = isGameBriefReady(briefDraft);

  function startItemOperation(itemId: string, action: ItemOperationState['action']) {
    const metaByAction: Record<ItemOperationState['action'], Omit<ItemOperationState, 'progress'>> = {
      upload: { action: 'upload', label: 'Đang tải file lên server', tone: 'violet' },
      delete: { action: 'delete', label: 'Dang xoa tep hoac link', tone: 'danger' },
      request: { action: 'request', label: 'Dang cap nhat yeu cau bo sung', tone: 'warning' },
      approve: { action: 'approve', label: 'Dang xac nhan hoan thanh', tone: 'success' },
      save: { action: 'save', label: 'Dang luu intake game', tone: 'warning' },
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
            label: 'Da cap nhat xong',
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

  function failItemOperation(itemId: string) {
    setItemOperations((current) => ({
      ...current,
      [itemId]: current[itemId]
        ? {
            ...current[itemId],
            progress: 100,
            tone: 'danger',
            label: 'Có lỗi, vui lòng thử lại',
          }
        : current[itemId],
    }));

    window.setTimeout(() => {
      setItemOperations((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
    }, 1200);
  }

  const itemMutation = useMutation({
    mutationFn: async (input: { item: InputItemRow; action: 'upload' | 'delete' | 'request' | 'approve' | 'save'; file?: File; fileUrl?: string; notes?: string }) => {
      if (input.action === 'upload') {
        if (!selected || !input.file) throw new Error('Chưa có file để upload.');
        validateGameIntakeFile(input.file);
        const uploaded = await uploadIntakeAsset({
          file: input.file,
          orderId: selected.order.id,
          productId: selected.product.id,
          itemCode: input.item.item_code,
          module: 'GAME',
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

      await updateInputItem(input.item.id, {
        file_url: input.fileUrl ?? input.item.file_url,
        notes: input.notes ?? input.item.notes,
        status:
          input.item.status === 'missing' && (input.fileUrl || input.item.file_name || input.item.file_url)
            ? 'submitted'
            : input.item.status,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['input-items'] });
      pushToast({ title: 'Đã lưu game brief', message: 'Thông tin brief game đã được cập nhật.', tone: 'success' });
    },
    onError: (error) => {
      pushToast({ title: 'Không lưu được game brief', message: error instanceof Error ? error.message : String(error), tone: 'danger', durationMs: 4200 });
    },
  });

  async function runItemAction(input: { item: InputItemRow; action: 'upload' | 'delete' | 'request' | 'approve' | 'save'; file?: File; fileUrl?: string; notes?: string }) {
    startItemOperation(input.item.id, input.action);
    try {
      await itemMutation.mutateAsync(input);
      finishItemOperation(input.item.id);
    } catch (error) {
      failItemOperation(input.item.id);
      throw error;
    }
  }

  const briefMutation = useMutation({
    mutationFn: async () => {
      if (!configItem) throw new Error('Chưa có game brief config item.');
      return saveGameBriefConfig(configItem.id, briefDraft);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['input-items'] });
      pushToast({ title: 'Đã duyệt checklist game', message: 'Các mục bắt buộc đã được xác nhận.', tone: 'success' });
    },
    onError: (error) => {
      pushToast({ title: 'Không duyệt được checklist game', message: error instanceof Error ? error.message : String(error), tone: 'danger', durationMs: 4200 });
    },
  });

  const approveRequiredMutation = useMutation({
    mutationFn: async () => {
      for (const item of items.filter((entry) => entry.required && (entry.file_name || entry.file_url))) {
        await updateInputItem(item.id, {
          status: 'approved',
          notes: noteDrafts[item.id] || item.notes || 'Intake game đã được approve.',
        });
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['input-items'] });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Chưa chọn product game.');
      if (!summary.ready) throw new Error('Chưa đủ checklist bắt buộc cho game.');
      if (!briefReady) throw new Error('Game brief chưa đủ thông tin để mở GSMF-02.');
      if (configItem) {
        await saveGameBriefConfig(configItem.id, { ...briefDraft, status: 'ready_prototype' });
      }
      await archiveTasksForStage(selected.order.id, selected.product.id, 0).catch(() => null);
      await updateProduct(selected.product.id, {
        current_stage_index: 1,
        progress: 15,
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
        existingTasks: tasksQuery.data || [],
        assignee: null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['input-items'] });
      pushToast({ title: 'Đã xác nhận để đi tiếp', message: 'Product game đã qua bước intake.', tone: 'success' });
      if (shouldAutoNavigate) {
        setConfirmNotice('Đã xác nhận intake game. Đang chuyển sang GSMF-02.');
        navigate('/gsmf02');
        return;
      }
      setConfirmNotice('Đã xác nhận intake game. Hãy mở GSMF-02 từ menu bên trái để tiếp tục.');
    },
  });

  return (
    <>
      <SectionHeader
        eye="Module 4 · GSMF-01"
            title="Yêu cầu khởi chạy game"
        subtitle="Chỉ product game đã launch mới vào GSMF-01. Brief và checklist được xử lý độc lập theo từng product_id."
      />

      <div className="intake-layout">
        <Card title="Product game trong GSMF-01">
          <div className="intake-product-list">
            {scopedProducts.map((item) => {
              const productItems = (inputItemsQuery.data || []).filter(
                (entry) =>
                  entry.order_id === item.order.id &&
                  entry.product_id === item.product.id &&
                  entry.module === 'GAME' &&
                  entry.item_code !== 'game_brief_config',
              );
              const productConfig =
                (inputItemsQuery.data || []).find(
                  (entry) =>
                    entry.order_id === item.order.id &&
                    entry.product_id === item.product.id &&
                    entry.module === 'GAME' &&
                    entry.item_code === 'game_brief_config',
                ) || null;
              const productSummary = getSummary(productItems);
              const productBriefReady = isGameBriefReady(parseGameBriefConfig(productConfig));
              const active = `${item.order.id}::${item.product.id}` === selectedKey;
              return (
                <button key={`${item.order.id}-${item.product.id}`} className={`list-item intake-product-item workflow-nav-card${active ? ' active' : ''}`} onClick={() => setSelectedKey(`${item.order.id}::${item.product.id}`)}>
                  <div className="workflow-nav-main">
                    <div className="workflow-nav-code">{item.product.id}</div>
                    <div className="workflow-nav-meta">{item.order.id} · {item.order.client}</div>
                    <div className="workflow-nav-meta">Brief {productBriefReady ? 'đã xong' : 'bản nháp'} · {productSummary.approvedRequired}/{productSummary.required} bắt buộc</div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        <div className="stack intake-section-stack">
          <Card title={selected ? `${selected.product.name} · Game brief` : 'Game brief'}>
            {selected ? (
              <div className="form-grid game-brief-grid">
                <label>
                  <span>Project</span>
                  <input value={briefDraft.projectName} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { projectName: event.target.value }))} />
                </label>
                <label>
                  <span>Topic</span>
                  <input value={briefDraft.topicName} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { topicName: event.target.value }))} />
                </label>
                <label className="full">
                  <span>Game title</span>
                  <input value={briefDraft.gameTitle} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { gameTitle: event.target.value }))} />
                </label>
                <label className="full">
                  <span>Game description</span>
                  <textarea rows={3} value={briefDraft.gameDescription} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { gameDescription: event.target.value }))} />
                </label>
                <label className="full">
                  <span>Game logic</span>
                  <textarea rows={4} value={briefDraft.gameLogic} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { gameLogic: event.target.value }))} />
                </label>
                <label>
                  <span>Target skill</span>
                  <input value={briefDraft.targetSkill} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { targetSkill: event.target.value }))} />
                </label>
                <label>
                  <span>Duration (minutes)</span>
                  <input type="number" min="1" value={briefDraft.durationMinutes} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { durationMinutes: Math.max(1, Number(event.target.value) || 1) }))} />
                </label>
                <label>
                  <span>Platform</span>
                  <select value={briefDraft.platform} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { platform: event.target.value }))}>
                    <option value="web">Web</option>
                    <option value="lms">LMS</option>
                    <option value="mobile_web">Mobile web</option>
                  </select>
                </label>
                <label>
                  <span>Device target</span>
                  <select value={briefDraft.deviceTarget} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { deviceTarget: event.target.value }))}>
                    <option value="desktop">Desktop</option>
                    <option value="mobile">Mobile</option>
                    <option value="responsive">Responsive</option>
                  </select>
                </label>
                <label>
                  <span>Start date</span>
                  <input type="date" value={briefDraft.startDate} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { startDate: event.target.value }))} />
                </label>
                <label>
                  <span>End date</span>
                  <input type="date" value={briefDraft.endDate} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { endDate: event.target.value }))} />
                </label>
                <label>
                  <span>Status</span>
                  <select value={briefDraft.status} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { status: event.target.value }))}>
                    <option value="draft">draft</option>
                    <option value="review">review</option>
                    <option value="ready_prototype">ready_prototype</option>
                  </select>
                </label>
                <label>
                  <span>Export result</span>
                  <select value={briefDraft.exportResultRequired ? 'yes' : 'no'} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { exportResultRequired: event.target.value === 'yes' }))}>
                    <option value="no">Không cần</option>
                    <option value="yes">Cần export</option>
                  </select>
                </label>
                <label className="full">
                  <span>Excel template url</span>
                  <input value={briefDraft.excelTemplateUrl} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { excelTemplateUrl: event.target.value }))} placeholder="Link file mẫu kết quả" />
                </label>
                <label className="full">
                  <span>Ghi chú brief</span>
                  <textarea rows={3} value={briefDraft.notes} onChange={(event) => setBriefDraft((current) => mergeBrief(current, { notes: event.target.value }))} />
                </label>
                <div className="action-row">
                  <button className="btn btn-ghost" onClick={() => briefMutation.mutate()} disabled={!selected || briefMutation.isPending}>
                    {briefMutation.isPending ? 'Đang lưu...' : 'Lưu game brief'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="muted-text">Chọn product game để bổ sung yêu cầu chi tiết.</div>
            )}
          </Card>

          <Card title={selected ? `${selected.product.name} · Checklist intake` : 'Checklist intake'}>
            {selected ? (
              <div className="intake-checklist">
                {items.map((item, index) => {
                  const hasAsset = Boolean(item.file_name || item.file_url);
                  const noteValue = noteDrafts[item.id] ?? item.notes ?? '';
                  const linkValue = linkDrafts[item.id] ?? item.file_url ?? '';
                  const operation = itemOperations[item.id];

                  return (
                    <article className="intake-item-card" key={item.id}>
                      <div className="intake-item-top">
                        <div className="intake-item-title-group">
                          <div className="intake-item-index">{String(index + 1).padStart(2, '0')}</div>
                          <div>
                            <div className="fw6">{item.label}</div>
                            <div className="intake-meta-row">
                              <span className="muted-text">{item.item_code}</span>
                              <Badge tone="neutral">{item.item_type}</Badge>
                              <Badge tone={item.required ? 'danger' : 'neutral'}>{item.required ? 'Bắt buộc' : 'Tùy chọn'}</Badge>
                              <Badge tone={toneForStatus(item.status)}>{item.status}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="intake-action-pack">
                          <button className="btn btn-ghost btn-small" disabled={!hasAsset || itemMutation.isPending} onClick={() => void runItemAction({ item, action: 'approve', notes: noteValue })}>
                            Hoàn thành
                          </button>
                          <button className="btn btn-ghost btn-small" disabled={itemMutation.isPending} onClick={() => void runItemAction({ item, action: 'request', notes: noteValue || 'Đang chờ client/PM bổ sung.' })}>
                            Yêu cầu bổ sung
                          </button>
                        </div>
                      </div>

                      <div className="intake-controls-grid">
                        <label className="intake-upload-box">
                          <span className="muted-text">Tải file lên server</span>
                          <input
                            type="file"
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              void runItemAction({ item, action: 'upload', file });
                              event.currentTarget.value = '';
                            }}
                          />
                        </label>

                        <div className="stack compact">
                          <label className="stack compact">
                            <span className="muted-text">Hoặc dán link ngoài</span>
                            <input
                              className="fi"
                              value={linkValue}
                              placeholder="Dán link tệp tại đây"
                              onChange={(event) => setLinkDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                              onBlur={(event) => {
                                void runItemAction({
                                  item,
                                  action: 'save',
                                  fileUrl: event.target.value.trim(),
                                  notes: noteValue,
                                });
                              }}
                            />
                          </label>
                          {(item.file_name || item.file_url) ? (
                            <div className="intake-file-row">
                              <div className="muted-text intake-file-name">{item.file_name || item.file_url}</div>
                              <div className="intake-inline-actions">
                                {item.file_url ? (
                                  <a className="btn btn-ghost btn-small" href={item.file_url} target="_blank" rel="noreferrer">
                                    Mở file
                                  </a>
                                ) : null}
                                <button className="btn btn-ghost btn-small" onClick={() => void runItemAction({ item, action: 'delete' })}>
                                  Xóa file
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="muted-text">Chưa có file hoặc link.</div>
                          )}
                        </div>
                      </div>

                      {operation ? (
                        <div className="intake-progress-panel">
                          <div className="intake-progress-head">
                            <span>{operation.label}</span>
                            <span>{operation.progress}%</span>
                          </div>
                          <div className="progress-track intake-progress-track">
                            <div className={`progress-fill tone-${operation.tone}`} style={{ width: `${operation.progress}%` }} />
                          </div>
                        </div>
                      ) : null}

                      <label className="stack compact">
                        <span className="muted-text">Ghi chú intake</span>
                        <textarea
                          className="fta"
                          rows={2}
                          value={noteValue}
                          onChange={(event) => setNoteDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                          onBlur={(event) => {
                            void runItemAction({
                              item,
                              action: 'save',
                              fileUrl: linkValue.trim(),
                              notes: event.target.value,
                            });
                          }}
                        />
                      </label>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="muted-text">Chọn product game để thao tác intake.</div>
            )}
          </Card>
        </div>

        <div className="stack intake-sidebar">
          <Card title="Tổng hợp điều kiện GSMF-01">
            <div className="stack compact">
              <div className="bullet-item">Trạng thái đơn hàng: {getStatusDisplayLabel(selected?.order.status || '-')}</div>
              <div className="bullet-item">Product game: {selected?.product.id || '-'}</div>
              <div className="bullet-item">Checklist đã kiểm: {summary.checkedTotal}/{summary.total}</div>
              <div className="bullet-item">Mục bắt buộc đã duyệt: {summary.approvedRequired}/{summary.required}</div>
              <div className={`bullet-item${briefReady ? '' : ' tone-danger'}`}>Game brief: {briefReady ? 'ĐẠT' : 'CHẶN'}</div>
              <div className={`bullet-item${summary.ready && briefReady ? '' : ' tone-danger'}`}>
                {summary.ready && briefReady ? 'Product game đã sẵn sàng để mở GSMF-02.' : 'Vẫn còn thiếu checklist bắt buộc hoặc game brief chưa đủ chi tiết.'}
              </div>
            </div>
          </Card>

          <Card title="Thao tác nhanh">
            <div className="stack compact">
              <button className="btn btn-ghost" onClick={() => briefMutation.mutate()} disabled={!selected || briefMutation.isPending}>
                Lưu game brief
              </button>
              <button className="btn btn-ghost" onClick={() => approveRequiredMutation.mutate()} disabled={!selected || approveRequiredMutation.isPending}>
                Duyệt tất cả mục bắt buộc đã có file
              </button>
              <button className="btn btn-danger" onClick={() => {
                setConfirmNotice(null);
                confirmMutation.mutate();
              }} disabled={!selected || !summary.ready || !briefReady || confirmMutation.isPending}>
                Xác nhận để vào GSMF-02
              </button>
              {confirmNotice ? <div className="muted-text">{confirmNotice}</div> : null}
              {briefMutation.error ? <div className="muted-text">{String(briefMutation.error)}</div> : null}
              {itemMutation.error ? <div className="muted-text">{String(itemMutation.error)}</div> : null}
              {confirmMutation.error ? <div className="muted-text">{String(confirmMutation.error)}</div> : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

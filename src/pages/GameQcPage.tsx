import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { useToast } from '@/components/system/ToastProvider';
import { isAdminLikeRole } from '@/data/vcontent';
import {
  archiveTasksForStage,
  ensureTaskForStage,
  inferProductWorkflowModule,
  listInputItems,
  listOrdersWithProducts,
  listTasks,
  parseGameBriefConfig,
  updateProduct,
} from '@/services/vcontent';

function toneForStatus(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'purple' {
  if (['fail', 'changes_requested', 'blocked'].includes(status)) return 'danger';
  if (['todo', 'not_started'].includes(status)) return 'purple';
  if (['review', 'draft'].includes(status)) return 'warning';
  if (['approved', 'done', 'ready'].includes(status)) return 'success';
  return 'neutral';
}

function isQcReady(
  currentStageIndex: number,
  progress: number,
  tasks: Array<{ product_id: string; stage_index: number; archived: boolean }>,
  productId: string,
) {
  return currentStageIndex === 2 || progress >= 55 || tasks.some((task) => task.product_id === productId && task.stage_index === 2 && !task.archived);
}

const PUBLIC_GAME_PATH = '/play/evnspc';

export function GameQcPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { profile } = useAuth();
  const { pushToast } = useToast();
  const shouldAutoNavigate = isAdminLikeRole(profile?.role);
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const inputItemsQuery = useQuery({ queryKey: ['input-items', 'GAME'], queryFn: () => listInputItems({ module: 'GAME' }) });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'gsmf03'], queryFn: () => listTasks({ stageIndices: [2, 3] }) });

  const scopedProducts = useMemo(() => {
    const orders = ordersQuery.data?.orders || [];
    const products = ordersQuery.data?.products || [];
    const tasks = tasksQuery.data || [];

    return orders.flatMap((order) =>
      products
        .filter((product) => product.order_id === order.id && inferProductWorkflowModule(product.id, order.module) === 'GAME')
        .map((product) => {
          if (!isQcReady(product.current_stage_index, product.progress, tasks, product.id)) return null;
          return { order, product };
        }),
    ).filter(Boolean) as Array<{ order: (typeof orders)[number]; product: (typeof products)[number] }>;
  }, [ordersQuery.data, tasksQuery.data]);

  const [selectedKey, setSelectedKey] = useState('');
  const [qcNote, setQcNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

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

  useEffect(() => {
    setNotice(null);
  }, [selectedKey]);

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

  const brief = useMemo(() => parseGameBriefConfig(configItem), [configItem]);
  const publicUrl = useMemo(() => {
    if (typeof window === 'undefined') return PUBLIC_GAME_PATH;
    const baseUrl = window.location.origin;
    return `${baseUrl}${PUBLIC_GAME_PATH}`;
  }, []);

  const reviewMutation = useMutation({
    mutationFn: async (action: 'pass' | 'fail') => {
      if (!selected) throw new Error('Chua chon product game.');

      await archiveTasksForStage(selected.order.id, selected.product.id, 2).catch(() => null);
      if (action === 'pass') {
        await updateProduct(selected.product.id, {
          current_stage_index: 3,
          progress: Math.max(selected.product.progress, 85),
        });
        await ensureTaskForStage({
          orderId: selected.order.id,
          productId: selected.product.id,
          stageIndex: 3,
          existingTasks: tasksQuery.data || [],
          assignee: null,
        });
        return 'Da pass QC va day sang GSMF-04.';
      }

      await updateProduct(selected.product.id, {
        current_stage_index: 1,
        progress: 45,
      });
      await ensureTaskForStage({
        orderId: selected.order.id,
        productId: selected.product.id,
        stageIndex: 1,
        existingTasks: tasksQuery.data || [],
        assignee: null,
      });
      return 'Đã fail QC và trả về GSMF-02.';
    },
    onSuccess: async (message, action) => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setNotice(message);
      pushToast({ title: action === 'pass' ? 'QC game đã pass' : 'QC game đã fail', message, tone: action === 'pass' ? 'success' : 'warning' });
      if (!shouldAutoNavigate) return;
      if (action === 'pass') {
        navigate('/gsmf04');
        return;
      }
      navigate('/gsmf02');
    },
    onError: (error) => {
      pushToast({ title: 'QC game thất bại', message: error instanceof Error ? error.message : String(error), tone: 'danger', durationMs: 4200 });
    },
  });

  return (
    <>
      <SectionHeader
        eye="Module 4 · GSMF-03"
        title="QC game EVNSPC"
        subtitle="QC dùng public link để mở đúng bản game dành cho học viên, kiểm tra flow trước khi pass sang GSMF-04."
      />

      <div className="game-prototype-page">
        <Card title="Public link cho QC">
          <div className="stack compact">
            <div className="bullet-item">QC mo link nay de test ban public: <a href={publicUrl} target="_blank" rel="noreferrer">{publicUrl}</a></div>
            <div className="action-row">
              <a className="btn btn-ghost" href={publicUrl} target="_blank" rel="noreferrer">Mo link public</a>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(publicUrl);
                    setNotice('Da copy public link.');
                  } catch {
                    setNotice('Không copy được. Hãy copy thủ công từ ô trên.');
                  }
                }}
              >
                Sao chép link
              </button>
            </div>
          </div>
        </Card>

        <div className="game-prototype-bottom">
          <Card title="Danh sach product game cho QC">
            <div className="intake-product-list">
              {scopedProducts.map((item) => {
                const active = `${item.order.id}::${item.product.id}` === selectedKey;
                const itemConfig =
                  (inputItemsQuery.data || []).find(
                    (entry) =>
                      entry.order_id === item.order.id &&
                      entry.product_id === item.product.id &&
                      entry.module === 'GAME' &&
                      entry.item_code === 'game_brief_config',
                  ) || null;
                const itemBrief = parseGameBriefConfig(itemConfig);
                return (
                  <button
                    key={`${item.order.id}-${item.product.id}`}
                    className={`list-item intake-product-item workflow-nav-card${active ? ' active' : ''}`}
                    onClick={() => setSelectedKey(`${item.order.id}::${item.product.id}`)}
                  >
                    <div className="workflow-nav-main">
                      <div className="workflow-nav-code">{item.product.id}</div>
                      <div className="workflow-nav-meta">{itemBrief.gameTitle || item.product.name}</div>
                      <div className="workflow-nav-meta">{item.order.id} · {item.order.client}</div>
                    </div>
                  </button>
                );
              })}
              {!scopedProducts.length ? <div className="muted-text">Chưa có product game nào tại GSMF-03. Vẫn có thể dùng public link để review demo.</div> : null}
            </div>
          </Card>

          <div className="stack intake-sidebar">
            <Card title="Thong tin ban review">
              {selected ? (
                <div className="stack compact">
                  <div className="bullet-item">Project: {brief.projectName || '-'}</div>
                  <div className="bullet-item">Topic: {brief.topicName || '-'}</div>
                  <div className="bullet-item">Game title: {brief.gameTitle || selected.product.name}</div>
                  <div className="bullet-item">Platform: {brief.platform || '-'}</div>
                  <div className="bullet-item">Device: {brief.deviceTarget || '-'}</div>
                  <div className="bullet-item">Status brief: {brief.status || '-'}</div>
                </div>
              ) : (
                <div className="muted-text">Dang review demo local qua public link.</div>
              )}
            </Card>

            <Card title="Checklist QC nhanh">
              <div className="stack compact">
                <div className="bullet-item">Mo duoc public link khong can login.</div>
                <div className="bullet-item">Cả 2 role Giảng viên / Học viên chạy được.</div>
                <div className="bullet-item">Tab Quiz, Tu danh gia, Ket qua khong vo flow.</div>
                <div className="bullet-item">Layout mobile / desktop khong bi vo.</div>
              </div>
            </Card>
          </div>

          <Card title="Ket luan QC">
            <div className="stack compact">
              <label className="stack compact">
                <span className="muted-text">Ghi chú QC</span>
                <textarea className="fta" rows={5} value={qcNote} onChange={(event) => setQcNote(event.target.value)} placeholder="Ghi chú lỗi, checklist, ghi nhận..." />
              </label>
              <button className="btn btn-ghost" onClick={() => reviewMutation.mutate('fail')} disabled={!selected || reviewMutation.isPending}>
                Trả lại {'->'} GSMF-02
              </button>
              <button className="btn btn-danger" onClick={() => reviewMutation.mutate('pass')} disabled={!selected || reviewMutation.isPending}>
                Duyệt {'->'} GSMF-04
              </button>
              {notice ? <div className="muted-text">{notice}</div> : null}
              {reviewMutation.error ? <div className="muted-text">{String(reviewMutation.error)}</div> : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

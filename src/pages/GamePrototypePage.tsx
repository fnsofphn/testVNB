import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Badge, Card, SectionHeader } from '@/components/ui/Primitives';
import { EvnSpcGameEmbed } from '@/components/game/EvnSpcGameEmbed';
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
  saveGameBriefConfig,
  updateProduct,
} from '@/services/vcontent';

function isPrototypeReady(
  currentStageIndex: number,
  progress: number,
  tasks: Array<{ product_id: string; stage_index: number; archived: boolean }>,
  productId: string,
) {
  return currentStageIndex === 1 || progress >= 15 || tasks.some((task) => task.product_id === productId && task.stage_index === 1 && !task.archived);
}

export function GamePrototypePage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pushToast } = useToast();
  const shouldAutoNavigate = isAdminLikeRole(profile?.role);
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const inputItemsQuery = useQuery({ queryKey: ['input-items', 'GAME'], queryFn: () => listInputItems({ module: 'GAME' }) });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'gsmf02'], queryFn: () => listTasks({ stageIndices: [1, 2] }) });

  const scopedProducts = useMemo(() => {
    const orders = ordersQuery.data?.orders || [];
    const products = ordersQuery.data?.products || [];
    const tasks = tasksQuery.data || [];

    return orders.flatMap((order) =>
      products
        .filter((product) => product.order_id === order.id && inferProductWorkflowModule(product.id, order.module) === 'GAME')
        .map((product) => {
          if (!isPrototypeReady(product.current_stage_index, product.progress, tasks, product.id)) return null;
          return { order, product };
        }),
    ).filter(Boolean) as Array<{ order: (typeof orders)[number]; product: (typeof products)[number] }>;
  }, [ordersQuery.data, tasksQuery.data]);

  const [selectedKey, setSelectedKey] = useState('');
  const [prototypeReviewed, setPrototypeReviewed] = useState(false);
  const [prototypeNotice, setPrototypeNotice] = useState<string | null>(null);

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
    setPrototypeReviewed(false);
    setPrototypeNotice(null);
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
  const demoMode = !selected;

  const advanceMutation = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Chua chon product game.');
      if (!configItem) throw new Error('Chưa có game brief config.');
      if (!prototypeReviewed) throw new Error('Can xac nhan da review prototype truoc khi chuyen sang QC.');

      await saveGameBriefConfig(configItem.id, {
        ...brief,
        status: 'review',
        notes: [brief.notes, 'GSMF-02: da review app EVNSPC 5 co che va san sang chuyen QC.'].filter(Boolean).join('\n'),
      });
      await archiveTasksForStage(selected.order.id, selected.product.id, 1).catch(() => null);
      await updateProduct(selected.product.id, {
        current_stage_index: 2,
        progress: Math.max(selected.product.progress, 55),
      });
      await ensureTaskForStage({
        orderId: selected.order.id,
        productId: selected.product.id,
        stageIndex: 2,
        existingTasks: tasksQuery.data || [],
        assignee: null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['input-items'] });
      pushToast({ title: 'Đã đẩy game sang GSMF-03', message: 'Prototype đã sẵn sàng cho QC.', tone: 'success' });
      if (shouldAutoNavigate) {
        setPrototypeNotice('Da day game EVNSPC sang GSMF-03 de QC. Dang chuyen trang...');
        navigate('/gsmf03');
        return;
      }
      setPrototypeNotice('Da day game EVNSPC sang GSMF-03 de QC.');
    },
    onError: (error) => {
      pushToast({ title: 'Không thể đẩy sang GSMF-03', message: error instanceof Error ? error.message : String(error), tone: 'danger', durationMs: 4200 });
    },
  });

  return (
    <>
      <SectionHeader
        eye="Module 4 · GSMF-02"
        title="Playtest game EVNSPC"
        subtitle="Tích hợp app gamification 5 cơ chế điều hành vào workflow Gamification. Chọn product game, chạy thử bản thật, rồi đẩy sang GSMF-03 khi đã review xong."
      />

      <div className="stack game-prototype-page">
        <Card title={selected ? `${brief.gameTitle || selected.product.name} · Game prototype` : 'Game prototype'}>
          <EvnSpcGameEmbed />
          {demoMode ? <div className="muted-text top-gap-12">Dang o che do demo local vi chua co product game nao duoc day vao GSMF-02.</div> : null}
        </Card>

        <div className="game-prototype-bottom">
          <Card title="Danh sach product game">
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
                    <Badge tone={item.product.current_stage_index >= 2 ? 'success' : 'warning'}>
                      {item.product.current_stage_index >= 2 ? 'Cho QC' : 'Dang prototype'}
                    </Badge>
                  </button>
                );
              })}
              {!scopedProducts.length ? <div className="muted-text">Chưa có product game nào tại GSMF-02.</div> : null}
            </div>
          </Card>

          <div className="stack intake-sidebar">
            <Card title="Tom tat brief">
              {selected ? (
                <div className="stack compact">
                  <div className="bullet-item">Project: {brief.projectName || '-'}</div>
                  <div className="bullet-item">Topic: {brief.topicName || '-'}</div>
                  <div className="bullet-item">Game title: {brief.gameTitle || selected.product.name}</div>
                  <div className="bullet-item">Target skill: {brief.targetSkill || '-'}</div>
                  <div className="bullet-item">Platform: {brief.platform || '-'}</div>
                  <div className="bullet-item">Device: {brief.deviceTarget || '-'}</div>
                  <div className="bullet-item">Duration: {brief.durationMinutes} phut</div>
                  <div className="bullet-item">Timeline: {brief.startDate || '-'} → {brief.endDate || '-'}</div>
                  <div className="bullet-item">Status brief: {brief.status || 'draft'}</div>
                </div>
              ) : (
                <div className="muted-text">Dang demo local. Khi co product GAME o stage GSMF-02, brief thuc te se hien tai day.</div>
              )}
            </Card>

            <Card title="Logic game">
              <div className="stack compact">
                <div className="bullet-item">2 role: Giảng viên và Học viên.</div>
                <div className="bullet-item">Học viên có 4 luồng: Khám phá, Thử thách, Tự đánh giá, Kết quả.</div>
                <div className="bullet-item">Core loop: 5 cơ chế ảnh hưởng đồng thời Quản lý và Trải nghiệm KH.</div>
                <div className="bullet-item">Du lieu noi dung dang duoc lay truc tiep tu source `gamespc`.</div>
              </div>
            </Card>
          </div>

          <Card title="Thao tac nhanh">
            <div className="stack compact">
              <label className="stack compact">
                <span className="muted-text">Xac nhan sau khi da review ca 2 role va flow quiz / self-assessment</span>
                <button
                  className={`btn ${prototypeReviewed ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setPrototypeReviewed((current) => !current)}
                  disabled={!selected}
                >
                  {prototypeReviewed ? 'Da review prototype' : 'Danh dau da review'}
                </button>
              </label>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setPrototypeNotice(null);
                  advanceMutation.mutate();
                }}
                disabled={!selected || !prototypeReviewed || advanceMutation.isPending}
              >
                {advanceMutation.isPending ? 'Dang chuyen...' : 'Day sang GSMF-03'}
              </button>
              {demoMode ? <div className="muted-text">Che do demo khong cho phep day stage. Muon chuyen QC can co product GAME thuc te.</div> : null}
              {prototypeNotice ? <div className="muted-text">{prototypeNotice}</div> : null}
              {advanceMutation.error ? <div className="muted-text">{String(advanceMutation.error)}</div> : null}
              {profile ? <div className="muted-text">Nguoi thao tac: {profile.fullName}</div> : null}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

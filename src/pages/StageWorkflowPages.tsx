import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { getStatusDisplayLabel } from '@/lib/statusLabels';
import {
  archiveTasksForStage,
  createActivityLog,
  deleteWorkflowRecord,
  ensureTaskForStage,
  ensureWorkflowRecord,
  listOrdersWithProducts,
  listTasks,
  listWorkflowRecords,
  updateOrder,
  updateProduct,
  updateTask,
  updateWorkflowRecord,
  syncWorkflowStatusProjection,
  type OrderRow,
  type ProductRow,
  type TaskRow,
  type WorkflowRecordKind,
} from '@/services/vcontent';
import { type PageKey } from '@/data/vcontent';

type StageConfig = {
  pageId: PageKey;
  stageIndex: number;
  module: 'ELN' | 'VIDEO';
  eye: string;
  title: string;
  subtitle: string;
  actionPrimary: string;
  actionSecondary?: string;
  doneLabel: string;
  failLabel?: string;
  nextStageLabel?: string;
  recordKind?: WorkflowRecordKind;
};

const STAGE_CONFIGS: Record<string, StageConfig> = {
  smf01: { pageId: 'smf01', stageIndex: 0, module: 'ELN', eye: 'Module 2 · SMF-01', title: 'Đầu vào', subtitle: 'Khóa intake, trả bổ sung hoặc mở Storyboard.', actionPrimary: 'Xác nhận đầu vào', actionSecondary: 'Yêu cầu bổ sung', doneLabel: 'Mở SMF-02', nextStageLabel: 'SMF-02' },
  smf02: { pageId: 'smf02', stageIndex: 1, module: 'ELN', eye: 'Module 2 · SMF-02', title: 'Storyboard', subtitle: 'Nhận task, viết storyboard, submit sang thiết kế slides.', actionPrimary: 'Nhận task', actionSecondary: 'Submit storyboard', doneLabel: 'Mở SMF-03', nextStageLabel: 'SMF-03', recordKind: 'storyboard' },
  smf03: { pageId: 'smf03', stageIndex: 2, module: 'ELN', eye: 'Module 2 · SMF-03', title: 'Thiết kế Slides', subtitle: 'Thiết kế slides và chuyển sang QC slides.', actionPrimary: 'Bắt đầu thiết kế', actionSecondary: 'Submit QC slides', doneLabel: 'Mở SMF-04', nextStageLabel: 'SMF-04', recordKind: 'slide_design' },
  smf04: { pageId: 'smf04', stageIndex: 3, module: 'ELN', eye: 'Module 2 · SMF-04', title: 'QC Slides', subtitle: 'Claim review, pass/fail và trả về thiết kế khi cần.', actionPrimary: 'Claim review', actionSecondary: 'PASS QC', doneLabel: 'Mở SMF-05', failLabel: 'FAIL -> SMF-03', nextStageLabel: 'SMF-05', recordKind: 'slide_design' },
  smf05: { pageId: 'smf05', stageIndex: 4, module: 'ELN', eye: 'Module 2 · SMF-05', title: 'Thu Voice', subtitle: 'Theo dõi thu voice và bàn giao asset âm thanh sang dựng.', actionPrimary: 'Bắt đầu thu voice', actionSecondary: 'Submit voice', doneLabel: 'Mở SMF-06', nextStageLabel: 'SMF-06', recordKind: 'voice_over' },
  smf06: { pageId: 'smf06', stageIndex: 5, module: 'ELN', eye: 'Module 2 · SMF-06', title: 'Biên tập Video', subtitle: 'Dựng video, subtitle, render và chuyển QC video.', actionPrimary: 'Bắt đầu dựng', actionSecondary: 'Submit QC video', doneLabel: 'Mở SMF-07', nextStageLabel: 'SMF-07', recordKind: 'video_edit' },
  smf07: { pageId: 'smf07', stageIndex: 6, module: 'ELN', eye: 'Module 2 · SMF-07', title: 'QC Video', subtitle: 'QC video, pass/fail và mở đóng gói cuối.', actionPrimary: 'Claim QC', actionSecondary: 'PASS QC', doneLabel: 'Mở SMF-08', failLabel: 'FAIL -> SMF-06', nextStageLabel: 'SMF-08', recordKind: 'video_edit' },
  smf08: { pageId: 'smf08', stageIndex: 7, module: 'ELN', eye: 'Module 2 · SMF-08', title: 'SCORM + Quiz', subtitle: 'Đóng gói SCORM, test LMS và đưa sang ready_delivery.', actionPrimary: 'Bắt đầu đóng gói', actionSecondary: 'Sẵn sàng bàn giao', doneLabel: 'Ready delivery', recordKind: 'scorm_package' },
  vsmf01: { pageId: 'vsmf01', stageIndex: 0, module: 'VIDEO', eye: 'Module 3 · VSMF-01', title: 'Đầu vào', subtitle: 'Khóa intake video và mở storyboard video.', actionPrimary: 'Xác nhận đầu vào', actionSecondary: 'Yêu cầu bổ sung', doneLabel: 'Mở VSMF-02', nextStageLabel: 'VSMF-02' },
  vsmf02: { pageId: 'vsmf02', stageIndex: 1, module: 'VIDEO', eye: 'Module 3 · VSMF-02', title: 'Storyboard', subtitle: 'Theo dõi storyboard video và mở thiết kế khung hình.', actionPrimary: 'Nhận task', actionSecondary: 'Submit storyboard', doneLabel: 'Mở VSMF-03', nextStageLabel: 'VSMF-03', recordKind: 'storyboard' },
  vsmf03: { pageId: 'vsmf03', stageIndex: 2, module: 'VIDEO', eye: 'Module 3 · VSMF-03', title: 'Thiết kế Slides', subtitle: 'Thiết kế khung hình video và submit sang QC khung hình.', actionPrimary: 'Bắt đầu thiết kế', actionSecondary: 'Submit QC khung hình', doneLabel: 'Mở VSMF-04', nextStageLabel: 'VSMF-04', recordKind: 'slide_design' },
  vsmf04: { pageId: 'vsmf04', stageIndex: 3, module: 'VIDEO', eye: 'Module 3 · VSMF-04', title: 'QC Slides', subtitle: 'Review khung hình video, pass/fail và trả về VSMF-03.', actionPrimary: 'Claim review', actionSecondary: 'PASS QC', doneLabel: 'Mở VSMF-05', failLabel: 'FAIL -> VSMF-03', nextStageLabel: 'VSMF-05', recordKind: 'slide_design' },
  vsmf05: { pageId: 'vsmf05', stageIndex: 4, module: 'VIDEO', eye: 'Module 3 · VSMF-05', title: 'Thu voice', subtitle: 'Thu voice video và chuẩn bị handoff sang dựng video.', actionPrimary: 'Bắt đầu thu voice', actionSecondary: 'Submit voice', doneLabel: 'Mở VSMF-06', nextStageLabel: 'VSMF-06', recordKind: 'voice_over' },
  vsmf06: { pageId: 'vsmf06', stageIndex: 5, module: 'VIDEO', eye: 'Module 3 · VSMF-06', title: 'Biên tập Video', subtitle: 'Dựng video, render và chuyển sang QC video.', actionPrimary: 'Bắt đầu dựng', actionSecondary: 'Submit QC video', doneLabel: 'Mở VSMF-07', nextStageLabel: 'VSMF-07', recordKind: 'video_edit' },
  vsmf07: { pageId: 'vsmf07', stageIndex: 6, module: 'VIDEO', eye: 'Module 3 · VSMF-07', title: 'QC Video', subtitle: 'Review video cuối, pass/fail và mở bàn giao.', actionPrimary: 'Claim QC', actionSecondary: 'PASS -> Bàn giao', doneLabel: 'Ready delivery', failLabel: 'FAIL -> VSMF-06', recordKind: 'video_edit' },
};

function toneForStatus(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' | 'purple' {
  if (['overdue', 'qc_fail', 'fail', 'changes_requested', 'critical', 'rejected'].includes(status)) return 'danger';
  if (['todo', 'not_started'].includes(status)) return 'purple';
  if (['submitted', 'review', 'in_review', 'pending_launch', 'packaging', 'warning'].includes(status)) return 'warning';
  if (['done', 'approved', 'ready_delivery', 'paid', 'success', 'accepted', 'confirmed'].includes(status)) return 'success';
  if (['in_production', 'in_progress', 'recording', 'editing', 'info'].includes(status)) return 'violet';
  return 'neutral';
}

function moduleMatches(order: OrderRow, module: 'ELN' | 'VIDEO') {
  return module === 'VIDEO' ? order.module === 'VIDEO' : order.module !== 'VIDEO';
}

function getStageProgress(stageIndex: number) {
  return Math.min(100, Math.max(5, Math.round(((stageIndex + 1) / 8) * 100)));
}

export function StageWorkflowPage({ pageId }: { pageId: PageKey }) {
  const config = STAGE_CONFIGS[pageId];
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks', 'stage', config.stageIndex], queryFn: () => listTasks({ stageIndices: [config.stageIndex] }) });
  const workflowRecordsQuery = useQuery({
    queryKey: ['workflow-records', config.recordKind || 'none', 'lite'],
    queryFn: () =>
      config.recordKind
        ? listWorkflowRecords({ kinds: [config.recordKind], includeReviews: false, includeQuestionLibrary: false })
        : listWorkflowRecords({ kinds: [], includeReviews: false, includeQuestionLibrary: false }),
  });

  const scopedItems = useMemo(() => {
    const orders = ordersQuery.data?.orders || [];
    const products = ordersQuery.data?.products || [];
    const tasks = tasksQuery.data || [];

    return orders
      .filter((order) => moduleMatches(order, config.module))
      .flatMap((order) =>
        products
          .filter((product) => product.order_id === order.id)
          .map((product) => {
            const stageTask =
              tasks.find((task) => task.order_id === order.id && task.product_id === product.id && task.stage_index === config.stageIndex && !task.archived) || null;
            const isCurrent = product.current_stage_index === config.stageIndex;
            const isReady = product.current_stage_index >= config.stageIndex;
            if (!isCurrent && !stageTask && !isReady) return null;
            return { order, product, task: stageTask, isCurrent };
          }),
      )
      .filter(Boolean) as Array<{ order: OrderRow; product: ProductRow; task: TaskRow | null; isCurrent: boolean }>;
  }, [ordersQuery.data, tasksQuery.data, config.module, config.stageIndex]);

  const queueStats = useMemo(() => {
    const total = scopedItems.length;
    const active = scopedItems.filter((item) => item.task?.status === 'in_progress').length;
    const review = scopedItems.filter((item) => ['review', 'in_review', 'submitted'].includes(item.task?.status || '')).length;
    const done = scopedItems.filter((item) => item.product.current_stage_index > config.stageIndex || item.task?.status === 'done').length;
    return { total, active, review, done };
  }, [scopedItems, config.stageIndex]);

  const workflowMutation = useMutation({
    mutationFn: async (input: { item: { order: OrderRow; product: ProductRow }; action: 'create' | 'bump' | 'note' | 'delete' }) => {
      if (!config.recordKind) return;
      const { order, product } = input.item;
      const title = `${order.title} · ${product.name}`;
      const record = await ensureWorkflowRecord({
        kind: config.recordKind,
        orderId: order.id,
        productId: product.id,
        title,
        profileId: profile?.id || null,
      });

      if (input.action === 'create') return record;
      if (input.action === 'delete') {
        await deleteWorkflowRecord(config.recordKind, record.id);
        return;
      }
      if (input.action === 'bump') {
        await updateWorkflowRecord(config.recordKind, record.id, {
          current_version: (record.current_version || 1) + 1,
        });
        return;
      }
      if (input.action === 'note') {
        const nextNote = window.prompt(`Cập nhật ghi chú cho ${product.name}`, record.notes || '');
        if (nextNote === null) return;
        const patchByKind: Record<WorkflowRecordKind, Record<string, unknown>> = {
          storyboard: { notes: nextNote, file_name: `${product.name}.storyboard.v${record.current_version || 1}.docx` },
          slide_design: { notes: nextNote, completed_slides: Math.min((record.target_slides || 24), (record.completed_slides || 0) + 5) },
          voice_over: { notes: nextNote, recorded_minutes: Math.min(record.estimated_minutes || 18, (record.recorded_minutes || 0) + 3) },
          video_edit: { notes: nextNote, render_progress: Math.min(100, (record.render_progress || 0) + 20) },
          scorm_package: { notes: nextNote, manifest_status: 'draft' },
        };
        await updateWorkflowRecord(config.recordKind, record.id, patchByKind[config.recordKind]);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
    },
  });

  const stageMutation = useMutation({
    mutationFn: async (input: { item: { order: OrderRow; product: ProductRow; task: TaskRow | null }; action: 'start' | 'submit' | 'pass' | 'fail' | 'request_changes' }) => {
      const { order, product, task } = input.item;
      const existingTasks = tasksQuery.data || [];
      const ensuredTask =
        task ||
        (await ensureTaskForStage({
          orderId: order.id,
          productId: product.id,
          stageIndex: config.stageIndex,
          existingTasks,
          assignee: profile?.fullName || null,
        }));

      if (config.recordKind) {
        await ensureWorkflowRecord({
          kind: config.recordKind,
          orderId: order.id,
          productId: product.id,
          title: `${order.title} · ${product.name}`,
          profileId: profile?.id || null,
        });
      }

      if (input.action === 'start') {
        const shouldLogStart = ensuredTask.status !== 'in_progress';
        await updateTask(ensuredTask.id, {
          status: 'in_progress',
          assignee: profile?.fullName || ensuredTask.assignee,
          progress: Math.max(ensuredTask.progress, 20),
        });
        await updateProduct(product.id, {
          current_stage_index: config.stageIndex,
          progress: Math.max(product.progress, getStageProgress(config.stageIndex)),
        });
        if (!['in_production', 'pending_acceptance', 'ready_delivery', 'paid'].includes(String(order.status || ''))) {
          await updateOrder(order.id, { status: 'in_production' });
        }
        if (shouldLogStart) {
          await createActivityLog({
            actorProfileId: profile?.id || null,
            actionType: 'workflow_step_started',
            objectType: 'task',
            objectId: ensuredTask.id,
            summary: `${product.id} started ${String(config.pageId).toUpperCase()}`,
            metadata: {
              task_id: ensuredTask.id,
              order_id: order.id,
              product_id: product.id,
              stage_code: String(config.pageId).toUpperCase(),
              stage_index: config.stageIndex,
              module: config.module,
            },
          });
        }
        await syncWorkflowStatusProjection(order.id);
        return;
      }

      if (input.action === 'request_changes') {
        await updateTask(ensuredTask.id, { status: 'changes_requested' });
        await updateOrder(order.id, { status: 'changes_requested' });
        await syncWorkflowStatusProjection(order.id);
        return;
      }

      if (input.action === 'fail') {
        const previousStage = Math.max(0, config.stageIndex - 1);
        if (config.recordKind) {
          await updateWorkflowRecord(config.recordKind, `${order.id}::${product.id}`, {
            status: 'changes_requested',
            returned_at: new Date().toISOString(),
          });
        }
        await updateTask(ensuredTask.id, { status: 'fail' });
        await updateProduct(product.id, {
          current_stage_index: previousStage,
          progress: getStageProgress(previousStage),
        });
        await ensureTaskForStage({
          orderId: order.id,
          productId: product.id,
          stageIndex: previousStage,
          existingTasks,
          assignee: null,
        });
        await syncWorkflowStatusProjection(order.id);
        return;
      }

      if (input.action === 'submit') {
        if (config.recordKind) {
          const workflowData = workflowRecordsQuery.data;
          const record =
            (config.recordKind === 'storyboard' ? workflowData?.storyboards : [])
              ?.find((item: any) => item.order_id === order.id && item.product_id === product.id)
            || (config.recordKind === 'slide_design' ? workflowData?.slideDesigns : [])
              ?.find((item: any) => item.order_id === order.id && item.product_id === product.id)
            || (config.recordKind === 'voice_over' ? workflowData?.voiceOvers : [])
              ?.find((item: any) => item.order_id === order.id && item.product_id === product.id)
            || (config.recordKind === 'video_edit' ? workflowData?.videoEdits : [])
              ?.find((item: any) => item.order_id === order.id && item.product_id === product.id)
            || (config.recordKind === 'scorm_package' ? workflowData?.scormPackages : [])
              ?.find((item: any) => item.order_id === order.id && item.product_id === product.id);
          const recordId = record?.id || `${order.id}::${product.id}`;
          const submitPatchByKind: Record<WorkflowRecordKind, Record<string, unknown>> = {
            storyboard: { status: 'in_review', submitted_at: new Date().toISOString() },
            slide_design: { status: 'submitted_qc', submitted_at: new Date().toISOString() },
            voice_over: { status: 'submitted_video', submitted_at: new Date().toISOString() },
            video_edit: { status: 'submitted_qc', submitted_at: new Date().toISOString() },
            scorm_package: { status: 'packaging', manifest_status: 'draft' },
          };
          await updateWorkflowRecord(config.recordKind, recordId, submitPatchByKind[config.recordKind]);
        }
        await updateTask(ensuredTask.id, {
          status: config.stageIndex === 3 || config.stageIndex === 6 ? 'review' : 'submitted',
          progress: Math.max(ensuredTask.progress, 80),
        });
        await syncWorkflowStatusProjection(order.id);
        return;
      }

      if (input.action === 'pass') {
        const nextStage = config.stageIndex + 1;
        if (config.recordKind) {
          const recordId = `${order.id}::${product.id}`;
          const passPatchByKind: Record<WorkflowRecordKind, Record<string, unknown>> = {
            storyboard: { status: 'approved', approved_at: new Date().toISOString() },
            slide_design: { status: 'qc_passed', approved_at: new Date().toISOString() },
            voice_over: { status: 'completed', completed_at: new Date().toISOString() },
            video_edit: { status: 'qc_passed', approved_at: new Date().toISOString() },
            scorm_package: { status: 'ready_delivery', manifest_status: 'ready' },
          };
          await updateWorkflowRecord(config.recordKind, recordId, passPatchByKind[config.recordKind]);
        }
        await updateTask(ensuredTask.id, { status: 'done', progress: 100, assignee: ensuredTask.assignee || profile?.fullName || null });
        await archiveTasksForStage(order.id, product.id, config.stageIndex);
        if (config.pageId === 'smf08' || config.pageId === 'vsmf07') {
          await updateProduct(product.id, {
            current_stage_index: nextStage,
            progress: 100,
            ready_for_delivery: true,
            finished: true,
          });
          await updateOrder(order.id, { status: 'ready_delivery' });
          await syncWorkflowStatusProjection(order.id);
          return;
        }
        await updateProduct(product.id, {
          current_stage_index: nextStage,
          progress: getStageProgress(nextStage),
        });
        await ensureTaskForStage({
          orderId: order.id,
          productId: product.id,
          stageIndex: nextStage,
          existingTasks,
          assignee: null,
        });
        await syncWorkflowStatusProjection(order.id);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      await queryClient.invalidateQueries({ queryKey: ['workflow-records'] });
    },
  });

  const recordsForItems = useMemo(() => {
    const workflowData = workflowRecordsQuery.data;
    const itemsByKind: Record<WorkflowRecordKind, any[]> = {
      storyboard: workflowData?.storyboards || [],
      slide_design: workflowData?.slideDesigns || [],
      voice_over: workflowData?.voiceOvers || [],
      video_edit: workflowData?.videoEdits || [],
      scorm_package: workflowData?.scormPackages || [],
    };
    return config.recordKind ? itemsByKind[config.recordKind] : [];
  }, [workflowRecordsQuery.data, config.recordKind]);

  return (
    <>
      <SectionHeader eye={config.eye} title={config.title} subtitle={config.subtitle} />
      <div className="kpi-row small">
        <Kpi label="Tổng queue" value={String(queueStats.total)} sub="Theo module và bước hiện tại" tone="neutral" />
        <Kpi label="Đang làm" value={String(queueStats.active)} sub="Task đã claim/in progress" tone="violet" />
        <Kpi label="Chờ review" value={String(queueStats.review)} sub="Submit hoặc review pending" tone="warning" />
        <Kpi label="Đã qua bước" value={String(queueStats.done)} sub={config.doneLabel} tone="success" />
      </div>
      <div className="content-grid two-column">
        <Card title="Queue thao tác">
          <div className="stack">
            {scopedItems.map((item) => (
              <div className="list-item" key={`${item.order.id}-${item.product.id}`}>
                <div>
                  <div className="list-title">{item.order.id} · {item.product.name}</div>
                  <div className="muted-text">{item.order.client} · {config.module} · deadline {item.order.deadline}</div>
                  <div className="muted-text">Task: {item.task?.status || 'chưa tạo'} · Stage index: B{config.stageIndex + 1}</div>
                </div>
                <div className="stack compact right">
                    <Badge tone={toneForStatus(item.task?.status || item.order.status)}>{getStatusDisplayLabel(item.task?.status || item.order.status)}</Badge>
                  <div className="action-row">
                    <button className="btn btn-ghost btn-small" onClick={() => stageMutation.mutate({ item, action: 'start' })}>{config.actionPrimary}</button>
                    {config.actionSecondary ? <button className="btn btn-ghost btn-small" onClick={() => stageMutation.mutate({ item, action: 'submit' })}>{config.actionSecondary}</button> : null}
                    <button className="btn btn-danger btn-small" onClick={() => stageMutation.mutate({ item, action: 'pass' })}>{config.doneLabel}</button>
                    {config.failLabel ? <button className="btn btn-ghost btn-small" onClick={() => stageMutation.mutate({ item, action: 'fail' })}>{config.failLabel}</button> : null}
                    {config.stageIndex === 0 ? <button className="btn btn-ghost btn-small" onClick={() => stageMutation.mutate({ item, action: 'request_changes' })}>Yêu cầu bổ sung</button> : null}
                  </div>
                </div>
              </div>
            ))}
            {!scopedItems.length ? <div className="muted-text">Chưa có item nào phù hợp cho bước này.</div> : null}
          </div>
        </Card>
        <Card title={config.recordKind ? 'Hồ sơ tác nghiệp' : 'Quy ước thao tác'}>
          <div className="stack compact">
            {config.recordKind ? scopedItems.map((item) => {
              const record = recordsForItems.find((entry) => entry.order_id === item.order.id && entry.product_id === item.product.id);
              return (
                <div className="list-item" key={`record-${item.order.id}-${item.product.id}`}>
                  <div>
                    <div className="list-title">{item.product.name}</div>
                    <div className="muted-text">{record ? `${record.id} · ${record.status} · v${record.current_version || 1}` : 'Chưa có hồ sơ tác nghiệp'}</div>
                    <div className="muted-text">{record?.notes || record?.file_name || 'Bạn có thể tạo hồ sơ, cập nhật note, tăng version hoặc xóa hồ sơ.'}</div>
                  </div>
                  <div className="action-row">
                    <button className="btn btn-ghost btn-small" onClick={() => workflowMutation.mutate({ item, action: 'create' })}>Tạo hồ sơ</button>
                    <button className="btn btn-ghost btn-small" onClick={() => workflowMutation.mutate({ item, action: 'note' })}>Cập nhật note</button>
                    <button className="btn btn-ghost btn-small" onClick={() => workflowMutation.mutate({ item, action: 'bump' })}>Tăng version</button>
                    <button className="btn btn-ghost btn-small" onClick={() => workflowMutation.mutate({ item, action: 'delete' })}>Xóa hồ sơ</button>
                  </div>
                </div>
              );
            }) : (
              <>
                <div className="bullet-item">`{config.actionPrimary}` sẽ claim task hiện tại hoặc tạo task nếu bước chưa có task.</div>
                {config.actionSecondary ? <div className="bullet-item">`{config.actionSecondary}` dùng để chuyển task sang trạng thái submit/review.</div> : null}
                <div className="bullet-item">`{config.doneLabel}` sẽ đóng bước hiện tại và mở bước kế tiếp nếu có.</div>
                {config.failLabel ? <div className="bullet-item">`{config.failLabel}` sẽ trả product về bước trước.</div> : null}
                {config.nextStageLabel ? <div className="bullet-item">Sau khi pass, product được đẩy sang {config.nextStageLabel}.</div> : <div className="bullet-item">Đây là bước cuối, pass sẽ đưa product sang `ready_delivery`.</div>}
              </>
            )}
            {workflowMutation.error ? <div className="bullet-item">{String(workflowMutation.error)}</div> : null}
            {stageMutation.error ? <div className="bullet-item">{String(stageMutation.error)}</div> : null}
          </div>
        </Card>
      </div>
    </>
  );
}

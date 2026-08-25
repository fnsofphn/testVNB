import { Suspense, lazy, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Activity, CheckCircle2, Clock3, FileAudio, Languages, MessageSquareText, ShieldAlert, ShieldCheck, Subtitles, UserRound } from 'lucide-react';
import {
  ALERTS,
  HEATMAP_ROWS,
  KPIS,
  ORDERS,
  PAGE_LABELS,
  QC_CRITERIA,
  STAGE_PAGES,
  TASKS,
  USERS,
  GAME_STAGE_MAP,
  VIDEO_STAGE_MAP,
  isWorkflowStage,
  type PageKey,
} from '@/data/vcontent';
import { useAuth } from '@/contexts/AuthContext';
import { Badge, Card, Kpi, SectionHeader } from '@/components/ui/Primitives';
import { readWorkflowStatusProjection } from '@/lib/workflowProjection';
import { getStatusDisplayLabel } from '@/lib/statusLabels';
import { formatAssignmentNotificationTitle, isAssignmentNotification } from '@/lib/notificationText';
import { getProductWorkflowStatus } from '@/lib/workflowStatus';
import { buildDisplayProductCodeMap, getDisplayOrderCode as getDisplayOrderCodeFromMeta } from '@/lib/orderDisplayCodes';
import { getPageIdFromBrowserPath, getSecondSegmentFromBrowserPath, useBrowserPath } from '@/lib/browserPath';
import {
  createClientOrder,
  deleteOrder,
  inferProductWorkflowModule,
  listActivityLogs,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  listOrdersWithProducts,
  listProfiles,
  listTasks,
  listWorkflowRecords,
  updateProduct,
  type ActivityLogRow,
  type NotificationRow,
  type OrderRow,
  type ProductRow,
  type ProfileRow,
  type TaskRow,
} from '@/services/vcontent';

function setNotificationReadInCache(queryClient: QueryClient, notificationId: string, readAt: string) {
  queryClient.setQueriesData({ queryKey: ['notifications'] }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    return current.map((item) =>
      item && typeof item === 'object' && (item as NotificationRow).id === notificationId
        ? { ...item, read_at: readAt }
        : item,
    );
  });
}

function setAllNotificationsReadInCache(queryClient: QueryClient, readAt: string) {
  queryClient.setQueriesData({ queryKey: ['notifications'] }, (current: unknown) => {
    if (!Array.isArray(current)) return current;
    return current.map((item) => (item && typeof item === 'object' ? { ...item, read_at: (item as NotificationRow).read_at || readAt } : item));
  });
}

const ClientNewOrderPage = lazy(() => import('@/pages/ClientNewOrderPage').then((module) => ({ default: module.ClientNewOrderPage })));
const DataPage = lazy(() => import('@/modules/vcontent/data/DataPage').then((module) => ({ default: module.DataPage })));
const ProductionInsightPage = lazy(() => import('@/modules/vcontent/insights/ProductionInsightPage').then((module) => ({ default: module.ProductionInsightPage })));
const TrainingKnowledgePage = lazy(() => import('@/modules/vcontent/training/TrainingOperationsPages').then((module) => ({ default: module.TrainingKnowledgePage })));
const TrainingTestPage = lazy(() => import('@/modules/vcontent/training/TrainingOperationsPages').then((module) => ({ default: module.TrainingTestPage })));
const ElearningLibraryHomePage = lazy(() => import('@/pages/vlearning/ElearningLibraryHomePage').then((module) => ({ default: module.ElearningLibraryHomePage })));
const GameCatalogPage = lazy(() => import('@/pages/GameCatalogPage').then((module) => ({ default: module.GameCatalogPage })));
const GameInputGatePage = lazy(() => import('@/pages/GameInputGatePage').then((module) => ({ default: module.GameInputGatePage })));
const GamePrototypePage = lazy(() => import('@/pages/GamePrototypePage').then((module) => ({ default: module.GamePrototypePage })));
const GameQcPage = lazy(() => import('@/pages/GameQcPage').then((module) => ({ default: module.GameQcPage })));
const GuidePage = lazy(() => import('@/pages/GuidePage').then((module) => ({ default: module.GuidePage })));
const InputGatePage = lazy(() => import('@/pages/InputGatePages').then((module) => ({ default: module.InputGatePage })));
const LecturerQuestionBankPage = lazy(() => import('@/pages/LecturerQuestionBankPage').then((module) => ({ default: module.LecturerQuestionBankPage })));
const QuizCreateTestPage = lazy(() => import('@/pages/QuizPages').then((module) => ({ default: module.QuizCreateTestPage })));
const QuizQuestionLibraryPage = lazy(() => import('@/pages/QuizPages').then((module) => ({ default: module.QuizQuestionLibraryPage })));
const QuizTestLibraryPage = lazy(() => import('@/pages/QuizPages').then((module) => ({ default: module.QuizTestLibraryPage })));
const StudentSurveyResultsPage = lazy(() => import('@/pages/StudentSurveyResultsPage').then((module) => ({ default: module.StudentSurveyResultsPage })));
const StudentSurveyResults2Page = lazy(() => import('@/pages/StudentSurveyResults2Page').then((module) => ({ default: module.StudentSurveyResults2Page })));
const StudentSurveyPlxTnaPage = lazy(() => import('@/pages/StudentSurveyPlxTnaPage').then((module) => ({ default: module.StudentSurveyPlxTnaPage })));
const TodayTodoPage = lazy(() => import('@/pages/TodayTodoPage').then((module) => ({ default: module.TodayTodoPage })));
const ModuleCatalogPage = lazy(() => import('@/pages/ModuleCatalogPages').then((module) => ({ default: module.ModuleCatalogPage })));
const RealDashboardPage = lazy(() => import('@/pages/MonitoringPages').then((module) => ({ default: module.RealDashboardPage })));
const ProductionPlanningPage = lazy(() => import('@/pages/ProductionPlanningPage').then((module) => ({ default: module.ProductionPlanningPage })));
const RealArchiveLibraryPage = lazy(() => import('@/pages/MonitoringPages').then((module) => ({ default: module.RealArchiveLibraryPage })));
const DeliveryRealPage = lazy(() => import('@/pages/OperationsPages').then((module) => ({ default: module.DeliveryRealPage })));
const PaymentRealPage = lazy(() => import('@/pages/OperationsPages').then((module) => ({ default: module.PaymentRealPage })));
const ProducerInboxRealPage = lazy(() => import('@/pages/OperationsPages').then((module) => ({ default: module.ProducerInboxRealPage })));
const ProducerLaunchRealPage = lazy(() => import('@/pages/OperationsPages').then((module) => ({ default: module.ProducerLaunchRealPage })));
const TasksRealPage = lazy(() => import('@/pages/OperationsPages').then((module) => ({ default: module.TasksRealPage })));
const MyTasksBoardPage = lazy(() => import('@/pages/MyTasksBoardPage').then((module) => ({ default: module.MyTasksBoardPage })));
const PlanningSetupPage = lazy(() => import('@/pages/PlanningPage').then((module) => ({ default: module.PlanningSetupPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const DomainStagePage = lazy(() => import('@/pages/ProductionStagePages').then((module) => ({ default: module.DomainStagePage })));
const QualityGatePage = lazy(() => import('@/pages/ProductionStagePages').then((module) => ({ default: module.QualityGatePage })));
const ScormStagePage = lazy(() => import('@/pages/ProductionStagePages').then((module) => ({ default: module.ScormStagePage })));
const StoryboardStagePage = lazy(() => import('@/pages/StoryboardStagePages').then((module) => ({ default: module.StoryboardStagePage })));
const UsersAdminPage = lazy(() => import('@/pages/UsersAdminPage').then((module) => ({ default: module.UsersAdminPage })));
const AccountManagerPage = lazy(() => import('@/pages/AccountManagerPage').then((module) => ({ default: module.AccountManagerPage })));
const VToolsPage = lazy(() => import('@/pages/VToolsPage'));

function RouteLoadingFallback() {
  return (
    <div className="route-loading" aria-label="Đang tải màn hình">
      <span className="fine-spinner" aria-hidden="true" />
    </div>
  );
}

function withPageLoader(node: ReactNode) {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      {node}
    </Suspense>
  );
}

type RealOrderView = {
  id: string;
  displayCode: string;
  client: string;
  companyId: string | null;
  title: string;
  module: string;
  deadline: string;
  status: string;
  productCount: number;
};

function toneForStatus(status: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' | 'purple' {
  if (['overdue', 'qc_fail', 'fail', 'changes_requested', 'critical'].includes(status)) return 'danger';
  if (['submitted', 'review', 'in_review', 'pending_launch', 'packaging', 'warning'].includes(status)) return 'warning';
  if (['done', 'approved', 'ready_delivery', 'paid', 'success'].includes(status)) return 'success';
  if (['todo', 'not_started'].includes(status)) return 'purple';
  if (['in_production', 'in_progress', 'recording', 'editing', 'info'].includes(status)) return 'violet';
  return 'neutral';
}

function getClientOrderStatusLabel(order: { status: string; change_request_reason?: string | null; rejection_reason?: string | null }) {
  const resolvedStatus = getWorkflowOrderStatus(order);
  if (['submitted', 'pm_review'].includes(order.status)) return 'da_xac_nhan';
  if (order.status === 'changes_requested') return order.change_request_reason?.trim() ? `thieu: ${order.change_request_reason}` : 'can_bo_sung';
  if (['ready_for_launch', 'in_production', 'in_progress', 'pending'].includes(resolvedStatus)) return 'dang_san_xuat';
  if (['qc_fail', 'fail', 'overdue'].includes(resolvedStatus)) return order.rejection_reason?.trim() ? `tra_ve_qc: ${order.rejection_reason}` : 'tra_ve_qc';
  if (order.status === 'pending_acceptance') return 'cho_xac_nhan_nghiem_thu';
  if (order.status === 'ready_delivery' || resolvedStatus === 'completed') return 'san_sang_ban_giao';
  if (order.status === 'paid') return 'da_thanh_toan';
  if (order.rejection_reason?.trim()) return `can_xu_ly: ${order.rejection_reason}`;
  return resolvedStatus;
}

function getOrderDisplayCode(order: { id: string; stage_sla_overrides?: Record<string, unknown> | null }) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return order.id;
  const orderMeta = (raw as Record<string, unknown>).order_meta;
  if (!orderMeta || typeof orderMeta !== 'object') return order.id;
  const display = String((orderMeta as Record<string, unknown>).display_order_code || '').trim();
  return display || order.id;
}

function getWorkflowOrderStatus(order: { status: string; stage_sla_overrides?: Record<string, unknown> | null }) {
  return readWorkflowStatusProjection(order)?.orderStatus || order.status;
}

function getWorkflowProductStatus(order: { stage_sla_overrides?: Record<string, unknown> | null }, productId: string, fallbackStatus: string) {
  return readWorkflowStatusProjection(order)?.products?.[productId]?.status || fallbackStatus;
}

function getWorkflowStageLabel(module: string, currentStageIndex: number) {
  const stageMap =
    module === 'VIDEO'
      ? ['VSMF-01', 'VSMF-02', 'VSMF-03', 'VSMF-04', 'VSMF-05', 'VSMF-06', 'VSMF-07', 'VSMF-08', 'Ready delivery']
      : module === 'GAME'
        ? ['GSMF-01', 'GSMF-02', 'GSMF-03', 'GSMF-04', 'Ready delivery']
        : ['SMF-01', 'SMF-02', 'SMF-03', 'SMF-04', 'SMF-05', 'SMF-06', 'SMF-07', 'SMF-08', 'SMF-09', 'Ready delivery'];

  return stageMap[Math.max(0, Math.min(stageMap.length - 1, currentStageIndex))] || '-';
}

type NotificationDisplayCodes = {
  orderCodes: Map<string, string>;
  productCodes: Map<string, string>;
};

function fallbackDisplayCodeFromRawId(value: string) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized.replace(/^ORD_\d{4}_/, '') || value;
}

function displayCodeFromOrderProductId(value: string) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return /^ORD_\d{4}_.+/.test(normalized) ? normalized.replace(/^ORD_\d{4}_/, '') : '';
}

function buildNotificationDisplayCodes(orders: OrderRow[], products: ProductRow[]) {
  const orderCodes = new Map<string, string>();
  const productCodes = new Map<string, string>();
  const productsByOrder = new Map<string, ProductRow[]>();

  for (const product of products) {
    const list = productsByOrder.get(product.order_id) || [];
    list.push(product);
    productsByOrder.set(product.order_id, list);
  }

  for (const order of orders) {
    const displayOrderCode = getDisplayOrderCodeFromMeta(order);
    orderCodes.set(order.id, displayOrderCode);
    const displayProductMap = buildDisplayProductCodeMap(displayOrderCode, productsByOrder.get(order.id) || []);
    for (const product of productsByOrder.get(order.id) || []) {
      const generatedDisplayCode = displayProductMap.get(product.id) || '';
      const idDisplayCode = displayCodeFromOrderProductId(product.id);
      const displayProductCode = idDisplayCode || generatedDisplayCode || product.id;
      productCodes.set(product.id, displayProductCode);
      if (product.name) productCodes.set(product.name, displayProductCode);
    }
  }

  return { orderCodes, productCodes };
}

function replaceRawCodes(value: string, displayCodes: NotificationDisplayCodes, metadata: Record<string, unknown>) {
  let next = String(value || '');
  const replacements = new Map<string, string>();
  const orderId = String(metadata.order_id || '').trim();
  const productId = String(metadata.product_id || '').trim();
  const displayOrderCode = String(metadata.display_order_code || '').trim() || displayCodes.orderCodes.get(orderId) || '';
  const displayProductCode =
    String(metadata.display_product_code || '').trim() ||
    displayCodes.productCodes.get(productId) ||
    (productId ? fallbackDisplayCodeFromRawId(productId) : '');

  if (orderId && displayOrderCode) replacements.set(orderId, displayOrderCode);
  if (productId && displayProductCode) replacements.set(productId, displayProductCode);
  for (const [raw, display] of displayCodes.orderCodes) replacements.set(raw, display);
  for (const [raw, display] of displayCodes.productCodes) replacements.set(raw, display);

  for (const [raw, display] of [...replacements.entries()].sort((left, right) => right[0].length - left[0].length)) {
    if (raw && display && raw !== display) next = next.split(raw).join(display);
  }
  return next;
}

function formatAssignmentNotice(item: NotificationRow, displayCodes: NotificationDisplayCodes) {
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
  const productId = String(metadata.product_id || '').trim();
  const productName = (
    String(metadata.display_product_code || '').trim() ||
    displayCodes.productCodes.get(productId) ||
    (productId ? fallbackDisplayCodeFromRawId(productId) : '') ||
    String(metadata.product_name || '').trim()
  );

  if (!isAssignmentNotification(item)) {
    return {
      title: replaceRawCodes(item.title, displayCodes, metadata),
      body: replaceRawCodes(item.body, displayCodes, metadata),
    };
  }

  return {
    title: formatAssignmentNotificationTitle(item),
    body: productName
      ? `Thuộc sản phẩm ${productName}. Vui lòng kiểm tra.`
      : 'Vui lòng kiểm tra công việc được giao.',
  };
}

function scrollToClientSection(sectionId: string) {
  if (typeof document === 'undefined') return;
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function isLaunchedProductRealtime(product: { id: string; progress: number }, tasks: Array<{ product_id: string; archived?: boolean }>) {
  return product.progress > 0 || tasks.some((task) => task.product_id === product.id && !task.archived);
}

function getStageCodeForTask(task: { product_id: string; stage_index: number }, orderModule?: string | null) {
  const module = inferProductWorkflowModule(task.product_id, orderModule || null);
  const prefix = module === 'VIDEO' ? 'VSMF' : module === 'GAME' ? 'GSMF' : 'SMF';
  return `${prefix}-${String(task.stage_index + 1).padStart(2, '0')}`;
}

function summarizeWorkflowModules(entries: string[]) {
  const counts = entries.reduce<Record<string, number>>((acc, entry) => {
    if (!entry) return acc;
    acc[entry] = (acc[entry] || 0) + 1;
    return acc;
  }, {});

  return ['ELN', 'VIDEO', 'GAME']
    .filter((key) => counts[key])
    .map((key) => `${counts[key]} ${key}`)
    .join(' · ') || 'Chưa có';
}

function EmptyPage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <>
      <SectionHeader eye="Vinabrain Ecosystem" title={title} subtitle={subtitle} />
      <Card title="Roadmap">
        <div className="stack compact">
          <div className="bullet-item">Màn này sẽ được nối vào use-case và Supabase schema thật ở phase tiếp theo.</div>
          <div className="bullet-item">Hiện tại shell, route, IA và ngôn ngữ giao diện đã bám theo VContent cũ.</div>
        </div>
      </Card>
    </>
  );
}

function EcosystemPage() {
  const products = [
    { name: 'VContent', path: '/dashboard', status: 'core', detail: 'Điều hành đơn hàng, sản xuất, game và khảo sát PLX.' },
    { name: 'VTraining', path: '/vtraining', status: 'native', detail: 'Module vận hành đào tạo đã port native vào VContent.' },
    { name: 'VDiscussion', path: '/vdiscussion', status: 'native', detail: 'Module thảo luận đã port native vào VContent.' },
    { name: 'V-events', path: '/v-events', status: 'native', detail: 'Live interaction kiểu Mentimeter với mã tham gia, QR và link public.' },
    { name: 'V-Suite', path: '/v-suite', status: 'native', detail: 'Điều hành đào tạo end-to-end, checklist, chi phí và nghiệm thu.' },
    { name: 'VBusiness', path: '/vbusiness', status: 'native', detail: 'CRM, pipeline, báo giá, thầu, hợp đồng, tài chính, dự án và nhân sự.' },
    { name: 'VLearning', path: '/vlearning', status: 'native', detail: 'Thư viện học và player hiện có của VContent.' },
    { name: 'V-tools', path: '/v-tools', status: 'ai', detail: 'Turbo transcript, chuyển định dạng file và tạo ảnh bằng worker nội bộ.' },
    { name: 'V-helpdesk', path: '/v-helpdesk', status: 'native', detail: 'Hỗ trợ học viên theo chương trình, link public và bảng xử lý yêu cầu.' },
  ];

  return (
    <>
      <SectionHeader eye="Vinabrain" title="Hệ sinh thái ứng dụng" />
      <div className="kpi-row">
        <Kpi label="VContent" value="Core" sub="Giữ nguyên code chính" tone="violet" />
        <Kpi label="Suni modules" value="0" sub="VTraining và VDiscussion đã native" tone="success" />
        <Kpi label="PLX survey" value="Safe" sub="Không đụng luồng khảo sát" tone="warning" />
        <Kpi label="Static isolate" value="On" sub="Không trộn dependency" tone="neutral" />
      </div>
      <Card title="Module Vinabrain">
        <div className="stack">
          {products.map((product) => (
            <div className="list-item" key={product.name}>
              <div>
                <div className="list-title">{product.name}</div>
                <div className="muted-text">{product.detail}</div>
              </div>
              <div className="action-row">
                <Badge tone={product.status === 'suni' ? 'success' : product.status === 'core' ? 'violet' : 'neutral'}>{product.status}</Badge>
                <Link className="btn btn-ghost btn-small" to={product.path}>Mở</Link>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

const TRANSCRIPT_WORKFLOW_STEPS = [
  { icon: FileAudio, title: 'Nhận file nội bộ', detail: 'Upload audio/video vào workspace VContent, giữ metadata theo đơn hàng và sản phẩm.' },
  { icon: Languages, title: 'Transcript tự vận hành', detail: 'Kết nối engine tự host hoặc local worker, không gửi file sang dịch vụ transcript bên thứ ba.' },
  { icon: Subtitles, title: 'Xuất subtitle', detail: 'Chuẩn hóa transcript thành SRT/VTT để dùng cho bước biên tập video và QC.' },
];

function UtilitiesPage() {
  const [transcriptFile, setTranscriptFile] = useState<File | null>(null);
  const [transcriptLanguage, setTranscriptLanguage] = useState('vi');
  const [transcriptStatus, setTranscriptStatus] = useState('');
  const [transcriptResult, setTranscriptResult] = useState<{ text?: string; subtitles?: { srt?: string; vtt?: string } } | null>(null);
  const [transcriptError, setTranscriptError] = useState('');
  const transcriptEndpoint = String(import.meta.env.VITE_TRANSCRIPT_ENDPOINT || '/api/transcript').replace(/\/+$/, '');

  const runTranscript = async () => {
    if (!transcriptFile) return;
    setTranscriptStatus('Đang gửi file tới worker nội bộ...');
    setTranscriptError('');
    setTranscriptResult(null);

    const formData = new FormData();
    formData.append('file', transcriptFile);
    formData.append('language', transcriptLanguage);

    try {
      const response = await fetch(transcriptEndpoint, {
        method: 'POST',
        body: formData,
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || 'Transcript worker trả về lỗi.');
      setTranscriptResult(payload.result || null);
      setTranscriptStatus('Transcript hoàn tất.');
    } catch (error) {
      setTranscriptStatus('');
      setTranscriptError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <SectionHeader
        eye="VContent"
        title="Tiện ích nội bộ"
        subtitle="Khung công cụ transcript/subtitle tự vận hành trong VContent, không gắn API hay link dịch vụ ngoài."
      />
      <div className="kpi-row small">
        <Kpi label="Nguồn xử lý" value="Internal" sub="Không dùng API transcript ngoài" tone="success" />
        <Kpi label="Trạng thái engine" value="Chờ nối" sub="Cần backend/local model để chạy thật" tone="warning" />
      </div>
      <div className="content-grid two-column">
        <Card title="VContent Transcript Lab" action={<Badge tone="warning">Prototype</Badge>}>
          <div className="utility-tool-card">
            <label className="utility-upload-zone">
              <FileAudio size={24} aria-hidden="true" />
              <span>{transcriptFile ? transcriptFile.name : 'Chọn file audio/video'}</span>
              <small>MP3, WAV, M4A, MP4 hoặc WebM</small>
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={(event) => {
                  setTranscriptFile(event.currentTarget.files?.[0] || null);
                  setTranscriptResult(null);
                  setTranscriptError('');
                  setTranscriptStatus('');
                }}
              />
            </label>
            <div className="form-grid">
              <label>
                <span>Ngôn ngữ</span>
                <select value={transcriptLanguage} onChange={(event) => setTranscriptLanguage(event.currentTarget.value)}>
                  <option value="vi">Tiếng Việt</option>
                  <option value="auto">Tự nhận diện</option>
                </select>
              </label>
              <label>
                <span>Đầu ra</span>
                <select disabled defaultValue="transcript-subtitle">
                  <option value="transcript-subtitle">Transcript + subtitle</option>
                  <option value="transcript">Transcript</option>
                  <option value="subtitle">Subtitle</option>
                </select>
              </label>
            </div>
            <button className="btn btn-primary utility-open-link" type="button" disabled={!transcriptFile || Boolean(transcriptStatus && !transcriptResult)} onClick={runTranscript}>
              Bắt đầu transcript
            </button>
            {transcriptStatus ? <div className="muted-text">{transcriptStatus}</div> : null}
            {transcriptError ? <div className="utility-error-note">{transcriptError}</div> : null}
            {transcriptResult?.text ? (
              <div className="utility-result-box">
                <strong>Kết quả transcript</strong>
                <p>{transcriptResult.text}</p>
              </div>
            ) : null}
            <div className="utility-fit-note">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>File được xử lý bằng engine nội bộ của VContent. Không gọi dịch vụ transcript bên ngoài từ màn này.</span>
            </div>
          </div>
        </Card>
        <Card title="Luồng xử lý dự kiến">
          <div className="utility-feature-list">
            {TRANSCRIPT_WORKFLOW_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div className="utility-feature-row" key={step.title}>
                  <Icon size={18} aria-hidden="true" />
                  <span>
                    <strong>{step.title}</strong>
                    <small>{step.detail}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <Card title="Nguyên tắc sử dụng">
        <div className="stack compact">
          <div className="bullet-item">Không tích hợp dịch vụ transcript bên ngoài nếu chưa có phê duyệt rõ về bảo mật dữ liệu.</div>
          <div className="bullet-item">Engine phù hợp nhất là backend tự host hoặc worker nội bộ, sau đó VContent chỉ gọi API nội bộ của mình.</div>
          <div className="bullet-item">Khi dùng cho subtitle, cần kiểm tra lại timing, xuống dòng và giới hạn ký tự trước khi đưa vào video bàn giao.</div>
        </div>
      </Card>
    </>
  );
}

function DashboardPage() {
  return (
    <>
      <SectionHeader
        eye="Tổng quan · F01"
        title="Tổng quan điều hành"
        subtitle="Toàn cảnh SX · Realtime · 10/4/2026"
        actions={
          <>
            <button className="btn btn-ghost">Xuất dữ liệu</button>
            <Link className="btn btn-danger" to="/client-new-order">+ Đơn hàng mới</Link>
          </>
        }
      />
      <div className="kpi-row">
        {KPIS.map((item) => (
          <Kpi key={item.label} {...item} />
        ))}
      </div>
      <div className="content-grid dashboard-grid">
        <Card title="Bản đồ nhiệt luồng công việc theo Đơn hàng × Bước">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>Đơn hàng</th>
                {['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'].map((stage) => (
                  <th key={stage}>{stage}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HEATMAP_ROWS.map((row) => (
                <tr key={row.order}>
                  <td>{row.order}</td>
                  {row.stages.map((stage, index) => (
                    <td key={`${row.order}-${index}`}>
                      <span className={`stage-dot state-${stage}`}>
                        {stage === 'done' ? '✓' : stage === 'active' ? '▶' : stage === 'fail' ? '✗' : stage === 'locked' ? '🔒' : '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="stack">
          <Card title="Cần xử lý ngay" action={<Badge tone="danger">6 gấp</Badge>}>
            <div className="stack">
              {ALERTS.map((item) => (
                <div className={`alert-card tone-${item.level === 'critical' ? 'danger' : 'warning'}`} key={item.title}>
                  <div>
                    <div className="alert-title">{item.title}</div>
                    <div className="alert-detail">{item.detail}</div>
                  </div>
                  <Link className="btn btn-ghost btn-small" to={`/${item.action}`}>Xem</Link>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Tiến độ theo Module">
            <div className="metric-list">
              {[
                { name: 'E-learning', value: '12/20', width: '60%', tone: 'violet' },
                { name: 'Video', value: '6/8', width: '75%', tone: 'danger' },
                { name: 'Gamification', value: '2/5', width: '40%', tone: 'warning' },
              ].map((item) => (
                <div className="progress-row" key={item.name}>
                  <div className="progress-label">{item.name}</div>
                  <div className="progress-track">
                    <div className={`progress-fill tone-${item.tone}`} style={{ width: item.width }} />
                  </div>
                  <div className="progress-value">{item.value}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function OrdersTablePage(props: { eye: string; title: string; subtitle: string; actionLabel?: string }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: listOrdersWithProducts,
  });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      if (!profile) throw new Error('Missing current profile.');
      return createClientOrder({
        title: `Đơn mới ${new Date().toLocaleDateString('vi-VN')}`,
        deadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10),
        client: profile.fullName,
        companyId: profile.companyId,
        createdByProfileId: profile.id,
        bundleCounts: {
          eln: 1,
          video: 0,
          game: 0,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const deleteOrderMutation = useMutation({
    mutationFn: deleteOrder,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const realOrders: RealOrderView[] =
    ordersQuery.data?.orders.map((order) => ({
      id: order.id,
      displayCode: getOrderDisplayCode(order),
      client: order.client,
      companyId: order.company_id,
      title: order.title,
      module: order.module,
      deadline: order.deadline,
      status: getWorkflowOrderStatus(order),
      productCount: ordersQuery.data?.products.filter((product) => product.order_id === order.id).length || 0,
    })) || [];

  const scopedOrders = profile?.companyId
    ? realOrders.filter((order) => order.companyId === profile.companyId)
    : realOrders;

  return (
    <>
      <SectionHeader
        eye={props.eye}
        title={props.title}
        subtitle={props.subtitle}
        actions={
          props.actionLabel ? (
            <button className="btn btn-danger" onClick={() => createOrderMutation.mutate()} disabled={createOrderMutation.isPending}>
              {createOrderMutation.isPending ? 'Đang tạo...' : props.actionLabel}
            </button>
          ) : null
        }
      />
      <Card title="Danh sách đơn hàng">
        <table className="data-table">
          <thead>
            <tr>
              <th>Đơn hàng</th>
              <th>Module</th>
              <th>Status</th>
              <th>Deadline</th>
              <th>Sản phẩm</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(scopedOrders.length ? scopedOrders : ORDERS.map((order) => ({ ...order, productCount: order.products, companyId: null }))).map((order) => (
              <tr key={order.id}>
                <td><div className="fw6">{'displayCode' in order ? order.displayCode : order.id}</div><div className="muted-text">{order.title}</div></td>
                <td>{order.module}</td>
                <td><Badge tone={toneForStatus(order.status)}>{profile?.role === 'client' || profile?.role === 'client_director' ? getClientOrderStatusLabel(order) : getWorkflowOrderStatus(order)}</Badge></td>
                <td>{order.deadline}</td>
                <td>{order.productCount}</td>
                <td>
                  <div className="action-row">
                    <Link className="btn btn-ghost btn-small" to={`/client-order-detail?orderId=${encodeURIComponent(order.id)}`}>Chi tiết</Link>
                    <Link className="btn btn-ghost btn-small" to={`/client-products?orderId=${encodeURIComponent(order.id)}`}>Input</Link>
                    {profile?.companyId && order.companyId === profile.companyId ? (
                      <button className="btn btn-ghost btn-small" onClick={() => deleteOrderMutation.mutate(order.id)}>
                        Xóa
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function ClientOrderDetailPage() {
  const { profile } = useAuth();
  const location = useLocation();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks() });
  const workflowQuery = useQuery({
    queryKey: ['workflow-records', 'client-detail'],
    queryFn: () => listWorkflowRecords({ kinds: ['storyboard', 'slide_design', 'voice_over', 'video_edit', 'scorm_package'], includeReviews: false, includeQuestionLibrary: false }),
  });

  const scopedOrders = useMemo(() => {
    const orders = ordersQuery.data?.orders || [];
    if (!profile?.companyId) return orders;
    return orders.filter((order) => order.company_id === profile.companyId);
  }, [ordersQuery.data, profile?.companyId]);

  const selectedOrderId = useMemo(() => new URLSearchParams(location.search).get('orderId') || scopedOrders[0]?.id || '', [location.search, scopedOrders]);
  const selectedOrder = scopedOrders.find((order) => order.id === selectedOrderId) || null;
  const orderProducts = (ordersQuery.data?.products || []).filter((product) => product.order_id === selectedOrder?.id);
  const orderTasks = ((tasksQuery.data || []) as TaskRow[]).filter((task) => task.order_id === selectedOrder?.id);

  const statusCards = selectedOrder
    ? [
        { id: 'client-order-products', label: 'Sản phẩm', value: String(orderProducts.length), sub: 'Danh sách sản phẩm', tone: 'neutral' as const },
        { id: 'client-order-progress', label: 'Đang SX', value: String(orderProducts.filter((product) => product.progress > 0 && !product.finished).length), sub: 'Sản phẩm đang chạy', tone: 'violet' as const },
        { id: 'client-order-delivery', label: 'Sẵn sàng BG', value: String(orderProducts.filter((product) => product.ready_for_delivery || product.finished).length), sub: 'Chờ nghiệm thu', tone: 'success' as const },
        { id: 'client-order-alerts', label: 'Trả về/lỗi', value: String(orderTasks.filter((task) => ['fail', 'qc_fail', 'changes_requested'].includes(task.status)).length), sub: 'Cần xử lý', tone: 'danger' as const },
      ]
    : [];

  return (
    <>
      <SectionHeader
      eye="Cổng khách hàng"
        title="Chi tiết đơn hàng"
        subtitle="Theo dõi xác nhận đơn, tiến độ sản xuất, các mốc bàn giao và các trạng thái bị trả về."
        actions={<Link className="btn btn-ghost" to="/client-orders">Quay lại danh sách</Link>}
      />

      <Card title="Chọn đơn">
        <div className="stack compact">
          {scopedOrders.map((order) => (
            <Link key={order.id} className={`list-item workflow-nav-card${order.id === selectedOrderId ? ' active' : ''}`} to={`/client-order-detail?orderId=${encodeURIComponent(order.id)}`}>
              <div className="workflow-nav-main">
                <div className="workflow-nav-code">{order.id}</div>
                <div className="workflow-nav-meta">{order.title}</div>
                <div className="workflow-nav-meta">{order.deadline} · {order.client}</div>
              </div>
              <Badge tone={toneForStatus(getWorkflowOrderStatus(order))}>{getClientOrderStatusLabel(order)}</Badge>
            </Link>
          ))}
        </div>
      </Card>

      {selectedOrder ? (
        <>
          <div className="kpi-row small">
            {statusCards.map((item) => (
              <button key={item.id} className="kpi-button-reset" onClick={() => scrollToClientSection(item.id)}>
                <Kpi label={item.label} value={item.value} sub={item.sub} tone={item.tone} />
              </button>
            ))}
          </div>

          <div className="content-grid two-column">
            <Card title="Tổng quan đơn">
              <div className="stack compact">
                <div className="bullet-item">Đơn hàng: {selectedOrder.id}</div>
                <div className="bullet-item">Chương trình: {selectedOrder.title}</div>
                <div className="bullet-item">Deadline: {selectedOrder.deadline}</div>
                <div className="bullet-item">Trạng thái client: {getClientOrderStatusLabel(selectedOrder)}</div>
              <div className="bullet-item">Ghi chú đầu vào: {selectedOrder.intake_note || 'Chưa có ghi chú.'}</div>
                {selectedOrder.change_request_reason ? <div className="bullet-item tone-danger">Thiếu / cần bổ sung: {selectedOrder.change_request_reason}</div> : null}
                {selectedOrder.rejection_reason ? <div className="bullet-item tone-danger">Lý do trả về: {selectedOrder.rejection_reason}</div> : null}
              </div>
            </Card>
            <Card title="Tiến độ từng sản phẩm">
              <table className="data-table" id="client-order-products">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Module</th>
                    <th>Bước hiện tại</th>
                    <th>Tiến độ</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {orderProducts.map((product) => {
                    const module = inferProductWorkflowModule(product.id, selectedOrder.module);
                    const fallbackProductStatus = getProductWorkflowStatus({
                      finished: product.finished,
                      readyForDelivery: product.ready_for_delivery,
                      progress: product.progress,
                      currentStageIndex: product.current_stage_index,
                      tasks: orderTasks.filter((task) => task.product_id === product.id && !task.archived),
                      fallbackDeadline: selectedOrder.deadline,
                    });
                    const health = product.ready_for_delivery || product.finished
                      ? 'ready_delivery'
                      : getWorkflowProductStatus(selectedOrder, product.id, fallbackProductStatus);
                    return (
                      <tr key={product.id}>
                        <td><div className="fw6">{product.id}</div><div className="muted-text">{product.name}</div></td>
                        <td>{module}</td>
                        <td>{getWorkflowStageLabel(module, product.current_stage_index)}</td>
                        <td>{product.progress}%</td>
                        <td><Badge tone={toneForStatus(health)}>{health}</Badge></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>

          <div className="content-grid two-column">
            <Card title="Việc đang mở">
              <div id="client-order-progress" className="stack compact">
                {orderTasks.map((task) => (
                  <div className="list-item" key={task.id}>
                    <div>
                      <div className="list-title">{task.product_id}</div>
                    <div className="muted-text">Công đoạn {task.stage_index + 1} · {task.due_date || '-'}</div>
                    </div>
                    <Badge tone={toneForStatus(task.status)}>{task.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Asset / bàn giao">
              <div id="client-order-delivery" className="stack compact">
                <div className="bullet-item">Kịch bản: {(workflowQuery.data?.storyboards || []).filter((item) => item.order_id === selectedOrder.id && item.file_name).length}</div>
                <div className="bullet-item">Slides/âm thanh/video: {(workflowQuery.data?.slideDesigns || []).filter((item) => item.order_id === selectedOrder.id && item.file_name).length + (workflowQuery.data?.voiceOvers || []).filter((item) => item.order_id === selectedOrder.id && item.file_name).length + (workflowQuery.data?.videoEdits || []).filter((item) => item.order_id === selectedOrder.id && item.file_name).length}</div>
                <div className="bullet-item">Gói sẵn sàng: {(workflowQuery.data?.scormPackages || []).filter((item) => item.order_id === selectedOrder.id && item.package_file_name).length}</div>
                <div id="client-order-alerts" className="bullet-item">Việc lỗi / trả về: {orderTasks.filter((task) => ['fail', 'qc_fail', 'changes_requested'].includes(task.status)).length}</div>
              </div>
            </Card>
          </div>
        </>
      ) : (
        <Card title="Chi tiết đơn hàng">
          <div className="muted-text">Chưa có đơn hàng nào trong phạm vi hiện tại.</div>
        </Card>
      )}
    </>
  );
}

function ClientProductsPage() {
  const { profile } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const workflowQuery = useQuery({
    queryKey: ['workflow-records', 'client-products'],
    queryFn: () => listWorkflowRecords({ kinds: ['storyboard', 'slide_design', 'voice_over', 'video_edit'], includeReviews: false, includeQuestionLibrary: false }),
  });
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  const scopedOrders = useMemo(() => {
    const orders = ordersQuery.data?.orders || [];
    if (!profile?.companyId) return orders;
    return orders.filter((order) => order.company_id === profile.companyId);
  }, [ordersQuery.data, profile?.companyId]);

  const selectedOrderId = useMemo(() => new URLSearchParams(location.search).get('orderId') || scopedOrders[0]?.id || '', [location.search, scopedOrders]);
  const selectedOrder = scopedOrders.find((order) => order.id === selectedOrderId) || null;
  const orderProducts = (ordersQuery.data?.products || []).filter((product) => product.order_id === selectedOrder?.id);

  useEffect(() => {
    setDraftNames(Object.fromEntries(orderProducts.map((product) => [product.id, product.name || ''])) as Record<string, string>);
    setEditingProductId(null);
  }, [selectedOrderId, orderProducts]);

  const renameProductMutation = useMutation({
    mutationFn: async (productId: string) => {
      const nextName = String(draftNames[productId] || '').trim();
      if (!nextName) throw new Error('Tên sản phẩm không được để trống.');
      await updateProduct(productId, { name: nextName });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      setEditingProductId(null);
    },
  });

  const statusCards = selectedOrder
    ? [
        { id: 'client-products-list', label: 'Danh sách SP', value: String(orderProducts.length), sub: 'Mở chi tiết phía dưới', tone: 'neutral' as const },
        { id: 'client-products-storyboard', label: 'Storyboard', value: String((workflowQuery.data?.storyboards || []).filter((item) => item.order_id === selectedOrder.id && item.file_name).length), sub: 'File đã hiển thị', tone: 'violet' as const },
        { id: 'client-products-video', label: 'Link video', value: String((workflowQuery.data?.videoEdits || []).filter((item) => item.order_id === selectedOrder.id && item.file_name).length), sub: 'Dán link thay vì upload', tone: 'warning' as const },
      ]
    : [];

  return (
    <>
      <SectionHeader
      eye="Cổng khách hàng"
        title="Nhập yêu cầu từng sản phẩm"
        subtitle="Theo dõi file storyboard, slide/script tham chiếu và link video từng sản phẩm trong đơn."
        actions={<Link className="btn btn-ghost" to="/client-orders">Quay lại danh sách</Link>}
      />

      <Card title="Chọn đơn">
        <div className="stack compact">
          {scopedOrders.map((order) => (
            <Link key={order.id} className={`list-item workflow-nav-card${order.id === selectedOrderId ? ' active' : ''}`} to={`/client-products?orderId=${encodeURIComponent(order.id)}`}>
              <div className="workflow-nav-main">
                <div className="workflow-nav-code">{order.id}</div>
                <div className="workflow-nav-meta">{order.title}</div>
                <div className="workflow-nav-meta">{order.deadline} · {order.client}</div>
              </div>
              <Badge tone={toneForStatus(getWorkflowOrderStatus(order))}>{getClientOrderStatusLabel(order)}</Badge>
            </Link>
          ))}
        </div>
      </Card>

      {selectedOrder ? (
        <>
          <div className="kpi-row small">
            {statusCards.map((item) => (
              <button key={item.id} className="kpi-button-reset" onClick={() => scrollToClientSection(item.id)}>
                <Kpi label={item.label} value={item.value} sub={item.sub} tone={item.tone} />
              </button>
            ))}
          </div>
          <Card title="Danh sách từng sản phẩm">
            <div id="client-products-list" className="stack">
              {orderProducts.map((product) => {
                const storyboard = (workflowQuery.data?.storyboards || []).find((entry) => entry.product_id === product.id);
                const video = (workflowQuery.data?.videoEdits || []).find((entry) => entry.product_id === product.id);
                const isEditing = editingProductId === product.id;
                const draftName = draftNames[product.id] ?? product.name ?? '';
                return (
                  <div className="list-item" key={product.id}>
                    <div>
                      {isEditing ? (
                        <div className="action-row" style={{ marginTop: 8 }}>
                          <input
                            className="input"
                            value={draftName}
                            onChange={(event) => setDraftNames((current) => ({ ...current, [product.id]: event.target.value }))}
                            placeholder="Nhập tên sản phẩm"
                            disabled={renameProductMutation.isPending}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-small"
                            onClick={() => renameProductMutation.mutate(product.id)}
                            disabled={renameProductMutation.isPending || !draftName.trim()}
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => {
                              setDraftNames((current) => ({ ...current, [product.id]: product.name || '' }));
                              setEditingProductId(null);
                            }}
                            disabled={renameProductMutation.isPending}
                          >
                            Hủy
                          </button>
                        </div>
                      ) : null}
                      <div className="list-title">{product.id} · {product.name}</div>
                      <div className="muted-text">{inferProductWorkflowModule(product.id, selectedOrder.module)} · {product.progress}%</div>
                    </div>
                    <div className="action-row">
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => setEditingProductId(product.id)}
                        disabled={renameProductMutation.isPending}
                      >
                        Sửa tên
                      </button>
                      {storyboard?.file_name ? <a id="client-products-storyboard" className="btn btn-ghost btn-small" href={storyboard.file_name} target="_blank" rel="noreferrer">Xem storyboard</a> : null}
                      {video?.file_name ? <a id="client-products-video" className="btn btn-ghost btn-small" href={video.file_name} target="_blank" rel="noreferrer">Mở link video</a> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      ) : (
        <Card title="Nhập yêu cầu từng sản phẩm">
          <div className="muted-text">Chưa có đơn hàng nào trong phạm vi hiện tại.</div>
        </Card>
      )}
    </>
  );
}

function ProducerInboxPage() {
  return (
    <>
          <SectionHeader eye="Hộp thư PM" title="Hộp thư đơn hàng" subtitle="Nơi PM nhận đơn, xem hồ sơ đầu vào và quyết định khởi chạy hoặc yêu cầu bổ sung." actions={<Link className="btn btn-danger" to="/producer-launch">Mở khởi chạy</Link>} />
      <div className="content-grid two-column">
        <Card title="Đơn đang chờ PM nhận">
          <div className="stack">
            {ORDERS.filter((item) => item.status === 'pending_launch' || item.status === 'in_production').map((order) => (
              <div className="list-item" key={order.id}>
                <div>
                  <div className="list-title">{order.id} · {order.title}</div>
                  <div className="muted-text">{order.client} · {order.module} · deadline {order.deadline}</div>
                </div>
                <div className="action-row">
                  <button className="btn btn-ghost btn-small">Yêu cầu bổ sung</button>
                  <button className="btn btn-danger btn-small">Nhận đơn</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      <Card title="Danh mục kiểm đầu vào đang nóng">
          <div className="stack compact">
            {['Brand guideline bản cuối chưa upload', 'Client director note chưa phản hồi', 'SLA B5 cần override do volume voice tăng'].map((item) => (
              <div className="bullet-item" key={item}>{item}</div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function TrackingPage() {
  return (
    <>
      <SectionHeader eye="Theo dõi sản xuất" title="Theo dõi sản xuất" subtitle="Theo dõi danh sách, tiến độ, điểm nghẽn và trạng thái liên module theo từng đơn." />
      <Card title="Danh sách theo dõi đơn hàng">
        <table className="data-table">
          <thead>
            <tr>
              <th>Đơn hàng</th>
              <th>Client</th>
              <th>Module</th>
              <th>Current stage</th>
              <th>Owner</th>
              <th>Progress</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((order) => (
              <tr key={order.id}>
                <td>{order.id}</td>
                <td>{order.client}</td>
                <td>{order.module}</td>
                <td>{order.stage}</td>
                <td>{order.owner}</td>
                <td>
                  <div className="progress-inline">
                    <div className="progress-track">
                      <div className="progress-fill tone-violet" style={{ width: `${order.progress}%` }} />
                    </div>
                    <span>{order.progress}%</span>
                  </div>
                </td>
                <td><Badge tone={toneForStatus(order.status)}>{getStatusDisplayLabel(order.status)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function WorkflowOverviewPage() {
  return (
    <>
      <SectionHeader
        eye="Tình huống ưu tiên · PM / Sản xuất"
        title="Luồng sản xuất"
        subtitle="Điều phối sản xuất từ nhận đơn đến bàn giao, tập trung vào theo dõi điểm nghẽn và hành động trong ngày."
        actions={
          <>
            <Link className="btn btn-ghost" to="/tracking">Theo dõi sản xuất</Link>
            <Link className="btn btn-primary" to="/order-pm-dashboard">Dashboard PM</Link>
          </>
        }
      />
      <div className="kpi-row">
        <Kpi label="Cần xử lý ngay" value="4" sub="2 quá hạn · 1 QC fail · 1 đơn chờ khởi chạy" tone="danger" />
        <Kpi label="Đơn đang SX" value="3" sub="1 ELN · 1 Video · 1 Game" tone="violet" />
        <Kpi label="SP sẵn sàng bàn giao" value="3" sub="Có thể gom gói bàn giao" tone="success" />
        <Kpi label="Điểm nghẽn chính" value="B5" sub="Voice overdue kéo chậm critical path" tone="warning" />
      </div>
      <Card title="Luồng vận hành ưu tiên">
        <div className="workflow-grid">
          {[
          { label: '1. Nhận đơn', page: 'producer-inbox', desc: 'Kiểm đầu vào, phụ trách, SLA.' },
          { label: '2. Khởi chạy', page: 'producer-launch', desc: 'Khóa phân công và mở việc.' },
          { label: '3. Theo dõi việc', page: 'my-tasks', desc: 'Bám quá hạn và QC fail.' },
            { label: '4. Bàn giao', page: 'producer-deliver', desc: 'Gom sản phẩm ready delivery.' },
          ].map((step) => (
            <Link className="workflow-step" key={step.label} to={`/${step.page}`}>
              <div className="workflow-step-label">{step.label}</div>
              <div className="muted-text">{step.desc}</div>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

function WorkflowOverviewRealPage() {
  const ordersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts });
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => listTasks() });
  const orders = ordersQuery.data?.orders || [];
  const products = ordersQuery.data?.products || [];
  const tasks = (tasksQuery.data || []) as TaskRow[];

  const orderMap = useMemo(() => new Map(orders.map((order) => [order.id, order])), [orders]);
  const waitingInboxOrders = useMemo(() => orders.filter((order) => ['submitted', 'pm_review', 'changes_requested'].includes(order.status)), [orders]);
  const activeOrders = useMemo(() => orders.filter((order) => ['ready_for_launch', 'in_production', 'in_progress', 'pending', 'overdue'].includes(getWorkflowOrderStatus(order))), [orders]);
  const readyProducts = useMemo(() => products.filter((product) => product.ready_for_delivery || product.finished), [products]);
  const launchQueueProducts = useMemo(
    () =>
      products.filter((product) => {
        const order = orderMap.get(product.order_id);
        return ['ready_for_launch', 'in_production'].includes(order?.status || '') && !isLaunchedProductRealtime(product, tasks);
      }),
    [orderMap, products, tasks],
  );
  const overdueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter((task) => !task.archived && task.due_date && task.due_date < today && !['done', 'approved'].includes(task.status));
  }, [tasks]);
  const qcFailTasks = useMemo(() => tasks.filter((task) => !task.archived && ['qc_fail', 'fail', 'changes_requested'].includes(task.status)), [tasks]);
  const urgentCount = overdueTasks.length + qcFailTasks.length + waitingInboxOrders.length;
  const activeOrderModuleSummary = summarizeWorkflowModules(activeOrders.map((order) => String(order.module || '')));
  const readyProductModuleSummary = summarizeWorkflowModules(
    readyProducts.map((product) => {
      const order = orderMap.get(product.order_id);
      return inferProductWorkflowModule(product.id, order?.module);
    }),
  );
  const bottleneckTask = useMemo(() => {
    const ranked = [...qcFailTasks, ...overdueTasks];
    return ranked.sort((a, b) => String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31')))[0] || null;
  }, [overdueTasks, qcFailTasks]);
  const bottleneckValue = bottleneckTask ? getStageCodeForTask(bottleneckTask, orderMap.get(bottleneckTask.order_id)?.module) : '-';
  const bottleneckSub = bottleneckTask ? `${bottleneckTask.product_id} · ${bottleneckTask.status}` : 'Chưa có điểm nghẽn cần xử lý';
  const workflowSteps = [
    { label: '1. Nhận đơn', page: 'producer-inbox', desc: `${waitingInboxOrders.length} đơn chờ PM nhận`, accent: 'danger' },
      { label: '2. Khởi chạy', page: 'producer-launch', desc: `${launchQueueProducts.length} sản phẩm chờ khởi chạy`, accent: 'violet' },
      { label: '3. Theo dõi việc', page: 'my-tasks', desc: `${overdueTasks.length} quá hạn · ${qcFailTasks.length} QC fail`, accent: 'warning' },
    { label: '4. Bàn giao', page: 'producer-deliver', desc: `${readyProducts.length} product sẵn sàng bàn giao`, accent: 'success' },
  ] as const;
  const managementHighlights = [
    {
      title: 'Việc cần chốt ngay',
      metric: `${urgentCount}`,
        detail: `${waitingInboxOrders.length} đơn chưa nhận, ${overdueTasks.length} việc quá hạn, ${qcFailTasks.length} việc QC fail`,
      page: '/my-tasks',
      accent: 'danger',
    },
    {
        title: 'Áp lực khởi chạy',
      metric: `${launchQueueProducts.length}`,
      detail: launchQueueProducts.length
        ? 'Khóa assignment, SLA và mở sản xuất cho nhóm product đang chờ đầu vào.'
          : 'Hàng chờ khởi chạy đang thoáng, có thể dồn lực sang xử lý các công đoạn chậm.',
      page: '/producer-launch',
      accent: 'warning',
    },
    {
      title: 'Năng lực bàn giao',
      metric: `${readyProducts.length}`,
      detail: readyProducts.length
        ? `${readyProductModuleSummary}. Có thể chốt lịch giao và nghiệm thu với khách hàng.`
        : 'Chưa có product sẵn sàng bàn giao, cần bảo vệ tiến độ ở các stage cuối.',
      page: '/producer-deliver',
      accent: 'success',
    },
  ] as const;

  return (
    <>
      <div className="action-row top-gap-12">
        <Link className="btn btn-ghost" to="/tracking">Theo dõi sản xuất</Link>
        <Link className="btn btn-primary" to="/order-pm-dashboard">Dashboard PM</Link>
      </div>
      <div className="kpi-row">
        <Link className="kpi-button-reset" to="/my-tasks">
          <Kpi label="Cần xử lý ngay" value={String(urgentCount)} sub={`${overdueTasks.length} quá hạn · ${qcFailTasks.length} QC fail · ${waitingInboxOrders.length} đơn chờ nhận`} tone="danger" />
        </Link>
        <Link className="kpi-button-reset" to="/tracking">
          <Kpi label="Đơn đang sản xuất" value={String(activeOrders.length)} sub={activeOrderModuleSummary} tone="violet" />
        </Link>
        <Link className="kpi-button-reset" to="/producer-deliver">
          <Kpi label="SP sẵn sàng bàn giao" value={String(readyProducts.length)} sub={readyProductModuleSummary} tone="success" />
        </Link>
        <Link className="kpi-button-reset" to="/my-tasks">
          <Kpi label="Điểm nghẽn chính" value={bottleneckValue} sub={bottleneckSub} tone="warning" />
        </Link>
      </div>
      <Card title="Luồng vận hành ưu tiên">
        <div className="workflow-grid">
          {workflowSteps.map((step) => (
            <Link className={`workflow-step tone-${step.accent}`} key={step.label} to={`/${step.page}`}>
              <div className="workflow-step-label">{step.label}</div>
              <div className="muted-text">{step.desc}</div>
            </Link>
          ))}
        </div>
        <div className="workflow-orbit-matrix">
          {managementHighlights.map((item) => (
            <Link className={`workflow-orbit-card tone-${item.accent}`} key={item.title} to={item.page}>
              <span className="workflow-orbit-glow" aria-hidden="true" />
              <span className="workflow-orbit-ring" aria-hidden="true" />
              <span className="workflow-orbit-core">
                <span className="workflow-orbit-metric">{item.metric}</span>
                <span className="workflow-orbit-title">{item.title}</span>
                <span className="workflow-orbit-detail">{item.detail}</span>
                <span className="workflow-orbit-cta">Mở chi tiết</span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}
function PmDashboardPage() {
  const order = ORDERS[0];
  return (
    <>
      <SectionHeader eye="Bảng điều khiển PM" title={`${order.id} - ${order.title}`} subtitle="Quản lý phân công nhóm, hạn, SLA và ghi chú đầu vào trước khi khởi chạy." actions={<Link className="btn btn-ghost" to="/producer-inbox">← Hộp thư</Link>} />
      <div className="content-grid two-column">
        <Card title="Thiết lập đơn hàng">
          <div className="form-grid">
            <label><span>Tiêu đề</span><input defaultValue={order.title} /></label>
            <label><span>Deadline</span><input defaultValue={order.deadline} /></label>
        <label className="full"><span>Ghi chú đầu vào</span><textarea defaultValue="Khóa phạm vi học phần 3 trước 12/4. Khách hàng yêu cầu giọng nam miền Bắc." /></label>
            <label className="full"><span>Request change reason</span><textarea defaultValue="Typography và glossary cần xác nhận lại." /></label>
          </div>
        </Card>
        <Card title="Team assignment">
          <div className="form-grid">
            {['PM', 'Executor', 'QC', 'Client', 'Client Director'].map((field) => (
              <label key={field}>
                <span>{field}</span>
                <select defaultValue={field === 'PM' ? 'Văn Đức' : ''}>
                  <option value="">-- Chọn --</option>
                  <option>Văn Đức</option>
                  <option>Phương Anh</option>
                  <option>Minh Tú</option>
                  <option>Hà Nhi</option>
                  <option>Nguyễn Lan</option>
                </select>
              </label>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}

function NotificationsPage() {
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: listNotifications,
  });
  const ordersQuery = useQuery({
    queryKey: ['orders'],
    queryFn: listOrdersWithProducts,
    staleTime: 1000 * 60,
  });
  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onMutate: async (notificationId) => {
      const readAt = new Date().toISOString();
      setNotificationReadInCache(queryClient, notificationId, readAt);
      return { readAt };
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: async () => {
      setAllNotificationsReadInCache(queryClient, new Date().toISOString());
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const liveNotifications = (notificationsQuery.data || []) as NotificationRow[];
  const displayCodes = useMemo(
    () => buildNotificationDisplayCodes(ordersQuery.data?.orders || [], ordersQuery.data?.products || []),
    [ordersQuery.data],
  );
  const items = liveNotifications.map((item) => ({
    id: item.id,
    level: item.level || 'info',
    ...formatAssignmentNotice(item, displayCodes),
    when: item.created_at ? new Date(item.created_at).toLocaleString('vi-VN') : '-',
    page: (item.link_page || 'notifications') as PageKey,
    unread: !item.read_at,
  }));
  const unreadCount = items.filter((item) => item.unread).length;
  const criticalCount = items.filter((item) => item.level === 'danger' || item.level === 'critical').length;
  const warningCount = items.filter((item) => item.level === 'warning').length;

  return (
    <>
      <SectionHeader
        eye="Thông báo"
        title="Thông báo hệ thống"
        subtitle="Cảnh báo trong ứng dụng theo vai trò hiện tại."
        actions={<button className="btn btn-ghost" onClick={() => markAllReadMutation.mutate()} disabled={!unreadCount || markAllReadMutation.isPending}>Đánh dấu tất cả đã đọc</button>}
      />
      <div className="kpi-row small">
        <Kpi label="Tổng thông báo" value={String(items.length)} sub={`${criticalCount} critical · ${warningCount} warning`} tone="violet" />
        <Kpi label="Chưa đọc" value={String(unreadCount)} sub="Cần phản hồi trong ngày" tone="danger" />
      </div>
      <Card title="Feed cảnh báo vận hành">
        <div className="stack notification-feed">
          {notificationsQuery.isLoading ? (
            <div className="muted-text">Đang tải thông báo...</div>
          ) : items.length ? items.map((item) => (
            <div className="notification-row" key={item.id}>
              <div className="notification-main">
                <div className="notification-title-row">
                  <Badge tone={toneForStatus(item.level)}>{item.level}</Badge>
                  <strong>{item.title}</strong>
                </div>
                <div className="notification-body">{item.body}</div>
              </div>
              <div className="notification-side">
                <span>{item.when}</span>
                <Link
                  className="btn btn-ghost btn-small"
                  to={`/${item.page}`}
                  onClick={() => {
                    if (item.unread) markReadMutation.mutate(item.id);
                  }}
                >
                  Mở màn liên quan
                </Link>
              </div>
            </div>
          )) : (
            <div className="muted-text">Chưa có thông báo thực tế cho tài khoản này.</div>
          )}
        </div>
      </Card>
    </>
  );
}

function MyTasksPage() {
  return (
    <>
      <SectionHeader eye="Không gian làm việc cá nhân" title="Công việc của tôi" subtitle="Danh sách việc ưu tiên theo hạn, QC fail và hàng chờ hiện tại." />
      <Card title="Hàng chờ công việc">
        <div className="stack">
          {TASKS.map((task) => (
            <div className="task-row" key={task.id}>
              <div className="task-row-content">
                <div className="list-title">{task.title}</div>
              <div className="muted-text">{task.id} · {task.stage} · phụ trách {task.owner}</div>
                <div className="muted-text">{task.due}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

function StagePage({ pageId }: { pageId: PageKey }) {
  const { profile } = useAuth();
  const gameCompletionEnabled = pageId === 'gsmf04';
  const gameOrdersQuery = useQuery({ queryKey: ['orders'], queryFn: listOrdersWithProducts, enabled: gameCompletionEnabled });
  const gameTasksQuery = useQuery({ queryKey: ['tasks', 'gsmf04'], queryFn: () => listTasks({ stageIndices: [3] }), enabled: gameCompletionEnabled });
  const stageKey = pageId.startsWith('vsmf')
    ? VIDEO_STAGE_MAP[pageId]
    : pageId.startsWith('gsmf')
      ? GAME_STAGE_MAP[pageId]
      : pageId;
  const stage = STAGE_PAGES[stageKey];

  if (!stage) {
    return <EmptyPage title={PAGE_LABELS[pageId]} subtitle="Màn này đang được tách lại theo chuẩn luồng mới." />;
  }

  const gameCompletionRows = gameCompletionEnabled
    ? (gameOrdersQuery.data?.orders || []).flatMap((order) =>
        (gameOrdersQuery.data?.products || [])
          .filter((product) => product.order_id === order.id && inferProductWorkflowModule(product.id, order.module) === 'GAME')
          .map((product) => {
            const task = (gameTasksQuery.data || []).find((entry) => entry.order_id === order.id && entry.product_id === product.id && entry.stage_index === 3 && !entry.archived) || null;
            if (!task && product.current_stage_index !== 3) return null;
            return {
              product: `${order.id} - ${product.name}`,
              note: `${order.client} - GAME - ${task?.due_date || order.deadline || '-'}`,
              owner: task?.assignee || profile?.fullName || '-',
              status: task?.status || order.status,
            };
          }),
      ).filter(Boolean) as Array<{ product: string; note: string; owner: string; status: string }>
    : [];
  const queueItems = gameCompletionEnabled ? gameCompletionRows : stage.queue;

  return (
    <>
      <SectionHeader eye={stage.eye} title={stage.title} subtitle={stage.subtitle} />
      <div className="kpi-row small">
        {stage.columns.map((column) => (
          <Kpi key={column.title} label={column.title} value={String(column.count)} sub="Queue theo stage" tone={column.tone} />
        ))}
      </div>
      <Card title="Workspace stage">
        <div className="stack">
          {queueItems.map((item) => (
            <div className="list-item" key={item.product}>
              <div>
                <div className="list-title">{item.product}</div>
                <div className="muted-text">{item.note}</div>
              </div>
              <div className="stack compact right">
                <span className="muted-text">{item.owner}</span>
                <Badge tone={toneForStatus(item.status)}>{getStatusDisplayLabel(item.status)}</Badge>
              </div>
            </div>
          ))}
          {gameCompletionEnabled && !gameCompletionRows.length ? <div className="muted-text">Chưa có product game nào được gán ở GSMF-04.</div> : null}
        </div>
      </Card>
    </>
  );
}

function SimpleTablePage({
  eye,
  title,
  subtitle,
  headers,
  rows,
}: {
  eye: string;
  title: string;
  subtitle: string;
  headers: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <>
      <SectionHeader eye={eye} title={title} subtitle={subtitle} />
      <Card title={title}>
        <table className="data-table">
          <thead>
            <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function getAuditTone(action: string): 'danger' | 'warning' | 'success' | 'neutral' | 'violet' {
  const normalized = action.toLowerCase();
  if (normalized.includes('fail') || normalized.includes('returned') || normalized.includes('deleted')) return 'danger';
  if (normalized.includes('submitted') || normalized.includes('review') || normalized.includes('claimed')) return 'warning';
  if (normalized.includes('accepted') || normalized.includes('approved') || normalized.includes('completed')) return 'success';
  if (normalized.includes('order') || normalized.includes('assigned') || normalized.includes('started')) return 'violet';
  return 'neutral';
}

function getAuditIcon(action: string) {
  const normalized = action.toLowerCase();
  if (normalized.includes('fail')) return ShieldAlert;
  if (normalized.includes('accepted') || normalized.includes('approved')) return CheckCircle2;
  if (normalized.includes('submitted')) return MessageSquareText;
  return Activity;
}

function getProfileDisplayName(profile: ProfileRow | undefined, fallback: string | null) {
  return profile?.full_name || profile?.email || fallback || 'Hệ thống';
}

function formatAuditTime(value: string | null | undefined) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getAuditMetadata(item: ActivityLogRow): Record<string, unknown> {
  return item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : {};
}

function getAuditResolvedMetadata(item: ActivityLogRow) {
  const metadata = { ...getAuditMetadata(item) };
  if (item.object_id && item.object_type?.toLowerCase().includes('product') && !metadata.product_id) {
    metadata.product_id = item.object_id;
  }
  if (item.object_id && item.object_type?.toLowerCase().includes('order') && !metadata.order_id) {
    metadata.order_id = item.object_id;
  }
  return metadata;
}

function getAuditObjectLabel(item: ActivityLogRow, displayCodes: NotificationDisplayCodes) {
  const metadata = getAuditResolvedMetadata(item);
  const productId = String(metadata.product_id || '').trim();
  const orderId = String(metadata.order_id || '').trim();
  const displayProductCode = String(metadata.display_product_code || '').trim();
  const displayOrderCode = String(metadata.display_order_code || '').trim();
  const productName = String(metadata.product_name || '').trim();
  const mappedProductCode = productId ? displayCodes.productCodes.get(productId) : '';
  const mappedOrderCode = orderId ? displayCodes.orderCodes.get(orderId) : '';
  const objectProductCode =
    item.object_id && item.object_type?.toLowerCase().includes('product') ? displayCodes.productCodes.get(item.object_id) : '';
  const objectOrderCode =
    item.object_id && item.object_type?.toLowerCase().includes('order') ? displayCodes.orderCodes.get(item.object_id) : '';
  return displayProductCode || mappedProductCode || objectProductCode || displayOrderCode || mappedOrderCode || objectOrderCode || productName || item.object_id || item.object_type || '-';
}

function getAuditSummary(item: ActivityLogRow, displayCodes: NotificationDisplayCodes) {
  const metadata = getAuditResolvedMetadata(item);
  const value = item.summary || getAuditObjectLabel(item, displayCodes);
  return replaceRawCodes(value, displayCodes, metadata);
}

function getAuditInitials(value: string) {
  return String(value || 'VB')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'VB';
}

function AuditFeedPage() {
  const activityLogsQuery = useQuery({
    queryKey: ['activity-logs', 'audit-feed'],
    queryFn: () => listActivityLogs({ limit: 60 }),
    refetchInterval: 30000,
    staleTime: 10000,
  });
  const profilesQuery = useQuery({
    queryKey: ['profiles', 'audit-feed'],
    queryFn: listProfiles,
    staleTime: 1000 * 60 * 5,
  });
  const ordersQuery = useQuery({
    queryKey: ['orders', 'audit-feed'],
    queryFn: listOrdersWithProducts,
    staleTime: 1000 * 60,
  });
  const activityLogs = activityLogsQuery.data || [];
  const profiles = (profilesQuery.data || []) as ProfileRow[];
  const profileMap = useMemo(() => new Map(profiles.map((item) => [item.id, item])), [profiles]);
  const displayCodes = useMemo(
    () => buildNotificationDisplayCodes(ordersQuery.data?.orders || [], ordersQuery.data?.products || []),
    [ordersQuery.data],
  );
  const visibleLogs = activityLogs.slice(0, 24);
  const failCount = activityLogs.filter((item) => getAuditTone(item.action_type) === 'danger').length;
  const acceptedCount = activityLogs.filter((item) => getAuditTone(item.action_type) === 'success').length;
  const actorCount = new Set(activityLogs.map((item) => item.actor_profile_id).filter(Boolean)).size;
  const latest = activityLogs[0]?.happened_at ? formatAuditTime(activityLogs[0].happened_at) : '-';

  return (
    <div className="audit-feed-page">
      <SectionHeader
        eye="Hệ thống"
        title="Nhật ký kiểm tra"
        subtitle="Live feed từ bảng activity logs của VContent."
      />

      <div className="audit-feed-layout">
        <section className="audit-feed-main" aria-label="Audit feed">
          <div className="audit-feed-composer">
            <div className="audit-feed-avatar">VB</div>
            <div>
              <div className="audit-feed-composer-title">Live state</div>
              <div className="audit-feed-composer-subtitle">
                {activityLogsQuery.isLoading ? 'Đang tải activity logs...' : `${activityLogs.length} activities thật được đồng bộ từ hệ thống.`}
              </div>
            </div>
          </div>

          <div className="audit-feed-live-window">
            {activityLogsQuery.isLoading ? (
              <div className="audit-feed-empty">Đang tải activity logs...</div>
            ) : visibleLogs.length ? (
              <div className="audit-live-loop">
                {visibleLogs.map((item) => {
                  const tone = getAuditTone(item.action_type);
                  const actorName = getProfileDisplayName(profileMap.get(item.actor_profile_id || ''), item.actor_profile_id);
                  return (
                    <article className={`audit-live-row tone-${tone}`} key={item.id}>
                      <div className="audit-live-avatar">{getAuditInitials(actorName)}</div>
                      <strong className="audit-live-actor">{actorName}</strong>
                      <span className="audit-live-action">{item.action_type}</span>
                      <div className="audit-live-copy">
                        <p>{getAuditSummary(item, displayCodes)}</p>
                      </div>
                      <time>{formatAuditTime(item.happened_at)}</time>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="audit-feed-empty">Chưa có activity log thật để hiển thị.</div>
            )}
          </div>
        </section>

        <aside className="audit-feed-side" aria-label="Audit summary">
          <Card title="Tổng quan feed">
            <div className="audit-feed-stats">
              <div>
                <span>Tổng log</span>
                <strong>{activityLogs.length}</strong>
              </div>
              <div>
                <span>Cần kiểm tra</span>
                <strong>{failCount}</strong>
              </div>
              <div>
                <span>Hoàn tất</span>
                <strong>{acceptedCount}</strong>
              </div>
            </div>
          </Card>
          <Card title="Tín hiệu nhanh">
            <div className="audit-feed-side-list">
              <div>
                <Clock3 size={16} aria-hidden="true" />
                <span>Mới nhất: {latest}</span>
              </div>
              <div>
                <UserRound size={16} aria-hidden="true" />
                <span>{actorCount} người có hoạt động</span>
              </div>
              <div>
                <ShieldCheck size={16} aria-hidden="true" />
                <span>Theo dõi QC, đơn hàng và nghiệm thu</span>
              </div>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function UsersPage() {
  const usersQuery = useQuery({
    queryKey: ['profiles'],
    queryFn: listProfiles,
  });

  const rows = usersQuery.data?.length
    ? usersQuery.data.map((item: any) => [
        item.full_name,
        item.email,
        item.role,
        item.company_id || item.organization_id || '-',
        item.active ? <Badge tone="success">✅</Badge> : <Badge tone="danger">❌</Badge>,
      ])
    : USERS.map((item) => [
        item.name,
        item.email,
        item.role,
        item.org,
        item.active ? <Badge tone="success">✅</Badge> : <Badge tone="danger">❌</Badge>,
      ]);

  return (
    <SimpleTablePage
      eye="Hệ thống"
      title="Người dùng & Phân quyền"
      subtitle="Quản lý tổ chức, công ty, người dùng, vai trò, trạng thái hoạt động và phạm vi truy cập."
      headers={['Tên', 'Email', 'Vai trò', 'Đơn vị', 'Hoạt động']}
      rows={rows}
    />
  );
}

export function WorkspacePage() {
  const browserPath = useBrowserPath();
  const routePath = browserPath.split(/[?#]/, 1)[0] || '/';
  const pageId = getPageIdFromBrowserPath(browserPath) as PageKey;
  const gameId = getSecondSegmentFromBrowserPath(browserPath);

  const withWorkspaceRoute = (node: ReactNode) => (
    <div className="route-page-shell" data-workspace-page={pageId} data-workspace-path={routePath} key={routePath}>
      {node}
    </div>
  );

  if (pageId === 'profile') return withWorkspaceRoute(withPageLoader(<ProfilePage />));
  if (pageId === 'guide') return withWorkspaceRoute(withPageLoader(<GuidePage />));
  if (pageId === 'dashboard') return withWorkspaceRoute(withPageLoader(<RealDashboardPage />));
  if (pageId === 'tracking') return withWorkspaceRoute(withPageLoader(<ProductionPlanningPage />));
  if (pageId === 'archived-products') return withWorkspaceRoute(withPageLoader(<RealArchiveLibraryPage />));
  if (pageId === 'producer-inbox') return withWorkspaceRoute(withPageLoader(<ProducerInboxRealPage />));
  if (pageId === 'order-pm-dashboard') return withWorkspaceRoute(<PmDashboardPage />);
  if (pageId === 'production-workflow') return withWorkspaceRoute(<WorkflowOverviewRealPage />);
  if (pageId === 'notifications') return withWorkspaceRoute(<NotificationsPage />);
  if (pageId === 'my-tasks') return withWorkspaceRoute(withPageLoader(<MyTasksBoardPage />));
  if (pageId === 'smf-my-tasks') return withWorkspaceRoute(withPageLoader(<MyTasksBoardPage moduleFilter="ELN" />));
  if (pageId === 'vsmf-my-tasks') return withWorkspaceRoute(withPageLoader(<MyTasksBoardPage moduleFilter="VIDEO" />));
  if (pageId === 'gsmf-my-tasks') return withWorkspaceRoute(withPageLoader(<MyTasksBoardPage moduleFilter="GAME" />));
  if (pageId === 'smf00' || pageId === 'vsmf00') return withWorkspaceRoute(withPageLoader(<ModuleCatalogPage key={pageId} pageId={pageId} />));
  if (pageId === 'smf01' || pageId === 'vsmf01') return withWorkspaceRoute(withPageLoader(<InputGatePage key={pageId} pageId={pageId} />));
  if (pageId === 'gsmf00') return withWorkspaceRoute(withPageLoader(<GameCatalogPage key={gameId || pageId} gameId={gameId} />));
  if (pageId === 'gsmf01') return withWorkspaceRoute(withPageLoader(<GameInputGatePage />));
  if (pageId === 'gsmf02') return withWorkspaceRoute(withPageLoader(<GamePrototypePage />));
  if (pageId === 'gsmf03') return withWorkspaceRoute(withPageLoader(<GameQcPage />));
  if (pageId === 'smf02' || pageId === 'vsmf02') return withWorkspaceRoute(withPageLoader(<StoryboardStagePage key={pageId} pageId={pageId} />));
  if (/^(smf03|vsmf03|smf05|vsmf05|smf07|vsmf07)$/.test(pageId)) return withWorkspaceRoute(withPageLoader(<DomainStagePage key={pageId} pageId={pageId} />));
  if (/^(smf04|vsmf04|smf06|vsmf06|smf08|vsmf08)$/.test(pageId)) return withWorkspaceRoute(withPageLoader(<QualityGatePage key={pageId} pageId={pageId} />));
  if (pageId === 'smf09') return withWorkspaceRoute(withPageLoader(<ScormStagePage key={pageId} />));
  if (pageId === 'client-new-order') return withWorkspaceRoute(withPageLoader(<ClientNewOrderPage />));
  if (pageId === 'producer-launch') return withWorkspaceRoute(withPageLoader(<ProducerLaunchRealPage />));
  if (pageId === 'producer-deliver') return withWorkspaceRoute(withPageLoader(<DeliveryRealPage />));
  if (pageId === 'client-delivery') return withWorkspaceRoute(withPageLoader(<DeliveryRealPage />));
  if (pageId === 'producer-invoice') return withWorkspaceRoute(withPageLoader(<PaymentRealPage />));
  if (pageId === 'client-payment') return withWorkspaceRoute(withPageLoader(<PaymentRealPage clientMode />));
  if (pageId === 'client-orders') {
    return withWorkspaceRoute(<OrdersTablePage eye="Cổng khách hàng" title="Đơn hàng của tôi" subtitle="Theo dõi đơn, tạo đơn mới và quay lại cập nhật khi PM yêu cầu bổ sung." actionLabel="+ Đơn mới" />);
  }
  if (pageId === 'client-order-detail') {
    return withWorkspaceRoute(<ClientOrderDetailPage />);
  }
  if (pageId === 'client-products') {
    return withWorkspaceRoute(<ClientProductsPage />);
  }
  if (false) {
    return <OrdersTablePage eye="Khởi chạy sản xuất" title="Chuyển vào sản xuất" subtitle="Khóa phân công, SLA và tạo việc đầu tiên theo kế hoạch công đoạn." actionLabel="Khởi chạy mục đã chọn" />;
  }
  if (false) {
    return <OrdersTablePage eye="Bàn giao" title="Bàn giao sản phẩm" subtitle="Gom sản phẩm sẵn sàng bàn giao, tạo đợt và gửi khách hàng nghiệm thu." actionLabel="Tạo đợt bàn giao" />;
  }
  if (false) {
    return <OrdersTablePage eye="Nghiệm thu khách hàng" title="Nghiệm thu sản phẩm" subtitle="Khách hàng xem gói bàn giao, chấp nhận hoặc yêu cầu chỉnh sửa." />;
  }
  if (false) {
    return (
      <SimpleTablePage
        eye="Thanh toán"
        title={PAGE_LABELS[pageId]}
        subtitle="Quản lý đề nghị thanh toán, biên nhận và xác nhận đối soát theo từng đợt."
        headers={['Đợt', 'Đơn hàng', 'Giá trị', 'Trạng thái', 'Ngày', 'Thao tác']}
        rows={[
          ['PR-001', 'ORD-2606', '120.000.000đ', <Badge tone="warning">đã gửi</Badge>, '12/4/2026', <button className="btn btn-ghost btn-small">Mở</button>],
          ['PR-002', 'ORD-2609', '48.000.000đ', <Badge tone="success">đã thanh toán</Badge>, '10/4/2026', <button className="btn btn-ghost btn-small">Biên nhận</button>],
        ]}
      />
    );
  }
  if (false) {
    return (
      <>
      <SectionHeader eye="Cổng khách hàng" title="Tạo Đơn hàng mới" subtitle="Luồng 3 bước: thông tin đơn hàng, yêu cầu kỹ thuật, xem lại và gửi duyệt." actions={<button className="btn btn-danger">Gửi duyệt</button>} />
        <div className="content-grid two-column">
          <Card title="Thông tin đơn hàng">
            <div className="form-grid">
              <label><span>Tên chương trình</span><input defaultValue="Chương trình đào tạo nội bộ quý 2" /></label>
              <label><span>Phân hệ</span><select defaultValue="ELN"><option>ELN</option><option>VIDEO</option></select></label>
              <label><span>Hạn hoàn thành</span><input defaultValue="2026-04-30" /></label>
              <label><span>Số sản phẩm</span><input defaultValue="3" /></label>
              <label className="full"><span>Mô tả mục tiêu</span><textarea defaultValue="Chuẩn hóa đào tạo nhập môn bán hàng và kỹ năng chăm sóc khách hàng." /></label>
            </div>
          </Card>
          <Card title="Yêu cầu kỹ thuật">
            <div className="stack compact">
              {['Hướng dẫn nhận diện', 'Tệp logo', 'Bảng màu', 'Kịch bản bài học', 'Mục tiêu học tập', 'Đặc tả SCORM'].map((item) => (
                <div className="bullet-item" key={item}>{item}</div>
              ))}
            </div>
          </Card>
        </div>
      </>
    );
  }
  if (pageId === 'client-approvals') {
    return withWorkspaceRoute(<OrdersTablePage eye="Giám đốc khách hàng" title="Duyệt đơn khách hàng" subtitle="Kiểm tra đơn nội bộ phía khách hàng trước khi chuyển cho PM xử lý đầu vào." />);
  }
  if (pageId === 'schedule-setup') {
    return withWorkspaceRoute(withPageLoader(<PlanningSetupPage />));
  }
  if (pageId === 'qc-criteria') {
    return withWorkspaceRoute(
      <SimpleTablePage
        eye="Hệ thống"
        title="Tiêu chí QC — Quản lý"
        subtitle="Quản lý quy tắc cho B4 slides và B7 video."
        headers={['Nhóm', 'Tiêu chí', 'Mức độ', 'Bước áp dụng']}
        rows={QC_CRITERIA.map((item) => [item.group, item.name, <Badge tone={item.severity === 'Nghiêm trọng' ? 'danger' : 'warning'}>{item.severity}</Badge>, item.stage])}
      />
    );
  }
  if (pageId === 'lecturer-question-bank') {
    return withWorkspaceRoute(withPageLoader(<LecturerQuestionBankPage />));
  }
  if (pageId === 'ecosystem') {
    return withWorkspaceRoute(<EcosystemPage />);
  }
  if (pageId === 'vdiscussion') {
    return <Navigate to="/vdiscussion" replace />;
  }
  if (pageId === 'v-events') {
    return <Navigate to="/v-events" replace />;
  }
  if (pageId === 'vbusiness') {
    window.location.assign('/vbusiness');
    return null;
  }
  if (pageId === 'vplanning') {
    window.location.assign('/vwork');
    return null;
  }
  if (pageId === 'vtraining') {
    return <Navigate to="/vtraining" replace />;
  }
  if (pageId === 'vlearning' || pageId === 'elearning-courses') {
    return withWorkspaceRoute(withPageLoader(<ElearningLibraryHomePage />));
  }
  if (pageId === 'quiz-test-library') {
    return withWorkspaceRoute(withPageLoader(<QuizTestLibraryPage />));
  }
  if (pageId === 'quiz-question-library') {
    return withWorkspaceRoute(withPageLoader(<QuizQuestionLibraryPage />));
  }
  if (pageId === 'quiz-create-test') {
    return withWorkspaceRoute(withPageLoader(<QuizCreateTestPage />));
  }
  if (pageId === 'v-survey') {
    return withWorkspaceRoute(withPageLoader(<StudentSurveyResultsPage surveyType="plx-tna" templateVariant="plx-tna" pageTitle="V-survey" pageSubtitle="Triển khai khảo sát theo mẫu PLX TNA 2026, phát hành link public hoặc V-Training và kết xuất kết quả tổng hợp." defaultFormTitle="V-survey - Khảo sát TNA 2026" defaultFormCode="v-survey-tna-2026" />));
  }
  if (pageId === 'student-survey-results') {
    return withWorkspaceRoute(withPageLoader(<StudentSurveyResultsPage />));
  }
  if (pageId === 'student-survey-results-2') {
    return withWorkspaceRoute(withPageLoader(<StudentSurveyResults2Page />));
  }
  if (pageId === 'student-survey-plx-tna') {
    return withWorkspaceRoute(withPageLoader(<StudentSurveyPlxTnaPage />));
  }
  if (pageId === 'users') {
    return withWorkspaceRoute(withPageLoader(<UsersAdminPage />));
  }
  if (pageId === 'account-manager') {
    return withWorkspaceRoute(withPageLoader(<AccountManagerPage />));
  }
  if (pageId === 'today-todo') {
    return withWorkspaceRoute(withPageLoader(<TodayTodoPage />));
  }
  if (pageId === 'utilities') {
    return withWorkspaceRoute(withPageLoader(<VToolsPage />));
  }
  if (pageId === 'v-helpdesk') {
    return <Navigate to="/v-helpdesk" replace />;
  }
  if (pageId === 'data') {
    return withWorkspaceRoute(withPageLoader(<DataPage />));
  }
  if (pageId === 'training-knowledge') {
    return withWorkspaceRoute(withPageLoader(<TrainingKnowledgePage />));
  }
  if (pageId === 'training-test') {
    return withWorkspaceRoute(withPageLoader(<TrainingTestPage />));
  }
  if (pageId === 'production-insight') {
    const insightModule = String(gameId || '').trim().toUpperCase();
    const moduleFilter = insightModule === 'ELN' || insightModule === 'VIDEO' || insightModule === 'GAME' ? insightModule : null;
    return withWorkspaceRoute(withPageLoader(<ProductionInsightPage moduleFilter={moduleFilter} />));
  }
  if (false) {
    return <UsersPage />;
  }
  if (pageId === 'audit') {
    return withWorkspaceRoute(<AuditFeedPage />);
  }
  if (false) return null;
  if (isWorkflowStage(pageId)) return withWorkspaceRoute(<StagePage pageId={pageId} />);

  return withWorkspaceRoute(<EmptyPage title={PAGE_LABELS[pageId]} subtitle="Màn này sẽ được dựng tiếp theo capability backlog." />);
}

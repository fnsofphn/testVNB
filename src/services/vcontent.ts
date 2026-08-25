import { supabase } from '@/lib/supabaseClient';
import { buildWorkflowStatusProjection, withWorkflowStatusProjection } from '@/lib/workflowProjection';
import type { ImportedModuleCode } from '@/lib/orderImport';
import { measureTelemetry } from '@/lib/telemetry';

export type OrderRow = {
  id: string;
  client: string;
  company_id: string | null;
  title: string;
  module: string;
  order_type?: string | null;
  project_code?: string | null;
  deadline: string;
  status: string;
  created_by_profile_id: string | null;
  intake_note: string | null;
  rejection_reason: string | null;
  change_request_reason: string | null;
  stage_sla_overrides: Record<string, unknown> | null;
  created_at?: string | null;
  submitted_at: string | null;
  launched_at: string | null;
  assignees: Record<string, unknown> | null;
};

export type ProductRow = {
  id: string;
  order_id: string;
  name: string;
  current_stage_index: number;
  progress: number;
  ready_for_delivery: boolean;
  finished: boolean;
  delivered_at: string | null;
};

export type OrderBundleCounts = {
  eln: number;
  video: number;
  game: number;
};

export type ManualOrderProductInput = {
  module: 'ELN' | 'VIDEO' | 'GAME';
  name: string;
  kind?: OrderProductCodeKind;
  code?: string;
};

export type OrderProductCodeKind = 'E' | 'H' | 'G';

export type ImportedOrderProductSeed = {
  module: ImportedModuleCode;
  sourceCode: string;
  detail: string;
  productType?: string;
};

export type ImportedOrderSeed = {
  title: string;
  client: string;
  deadline: string;
  companyId: string | null;
  createdByProfileId: string;
  intakeNote?: string;
  status?: string;
  products: ImportedOrderProductSeed[];
};

export type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string;
  role: string;
  company_id: string | null;
  organization_id: string | null;
  title: string | null;
  active: boolean;
  access_scope: string;
  auth_user_id?: string | null;
  avatar_initials?: string | null;
  student_class?: string | null;
  student_group?: string | null;
  student_code?: string | null;
};

export type TrainingResourceDetailRow = {
  profile_id: string;
  resource_kind: 'instructors' | 'collaborators';
  detail: Record<string, any>;
  updated_at?: string | null;
};

export type AccountManagerRecordRow = {
  id: string;
  tt: string;
  website: string;
  purpose: string;
  account: string;
  password: string;
  renew_month: string;
  renew_year: string;
  payment_method: string;
  payment_deadline: string;
  sort_index: number;
  created_at?: string;
  updated_at?: string;
};

export type AccountManagerRecordInput = {
  id: string;
  tt: string;
  website: string;
  purpose: string;
  account: string;
  password: string;
  renewMonth: string;
  renewYear: string;
  paymentMethod: string;
  paymentDeadline: string;
  sortIndex: number;
};

export type TodayTodoSectionPayload = {
  id: string;
  title: string;
};

export type TodayTodoItemPayload = {
  id: string;
  sectionId: string;
  title: string;
  note: string;
  done: boolean;
};

export type TodayTodoListRow = {
  id: string;
  account_profile_id: string;
  date_key: string;
  sections: TodayTodoSectionPayload[];
  items: TodayTodoItemPayload[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type TaskRow = {
  id: string;
  order_id: string;
  product_id: string;
  stage_index: number;
  status: string;
  progress: number;
  due_date: string | null;
  assignee: string | null;
  assignee_profile_id?: string | null;
  assignee_account_id?: string | null;
  archived: boolean;
  created_at?: string | null;
};

export type ActivityLogRow = {
  id: string;
  happened_at: string;
  actor_profile_id: string | null;
  action_type: string;
  object_type: string;
  object_id: string;
  summary: string;
  metadata: Record<string, unknown>;
};

export type NotificationRow = {
  id: string;
  level: string;
  title: string;
  body: string;
  link_page: string | null;
  recipient_profile_id: string | null;
  recipient_account_id: string | null;
  event_key?: string | null;
  metadata?: Record<string, unknown> | null;
  read_at?: string | null;
  email_status?: string | null;
  email_sent_at?: string | null;
  email_error?: string | null;
  created_at?: string;
};

export type DeliveryRow = {
  id: string;
  sent_at: string;
  status: string;
  note: string | null;
  document_name: string | null;
  sent_by_profile_id: string | null;
  items: Array<{ orderId: string; productId: string; productName?: string }>;
};

export type PaymentRequestRow = {
  id: string;
  order_id: string;
  delivery_id: string | null;
  title: string;
  amount: number;
  currency: string;
  due_date: string;
  status: string;
  sent_at: string | null;
  created_by_profile_id: string | null;
  client_confirmed_at: string | null;
  note: string | null;
  receipt_required: boolean;
};

export type PaymentReceiptRow = {
  id: string;
  payment_request_id: string;
  order_id: string;
  amount: number;
  paid_at: string;
  method: string;
  receipt_file_name: string | null;
  note: string | null;
  confirmed_by_profile_id: string | null;
  confirmed_at: string | null;
};

export type StoryboardRow = {
  id: string;
  order_id: string;
  product_id: string;
  title: string;
  current_version: number;
  total_scenes: number;
  estimated_minutes: number;
  status: string;
  assignee_profile_id: string | null;
  reviewer_profile_id: string | null;
  due_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  returned_at: string | null;
  file_name: string | null;
  notes: string | null;
};

export type StoryboardReviewRow = {
  id: string;
  storyboard_id: string;
  reviewer_profile_id: string | null;
  decision: string;
  comment: string | null;
  criteria: Record<string, boolean>;
  created_at: string;
};

export type SlideDesignRow = {
  id: string;
  order_id: string;
  product_id: string;
  title: string;
  current_version: number;
  target_slides: number;
  completed_slides: number;
  status: string;
  designer_profile_id: string | null;
  qc_reviewer_profile_id: string | null;
  due_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  returned_at: string | null;
  file_name: string | null;
  brand_spec: string | null;
  notes: string | null;
  checklist?: Record<string, boolean>;
};

export type SlideDesignReviewRow = {
  id: string;
  slide_design_id: string;
  reviewer_profile_id: string | null;
  decision: string;
  comment: string | null;
  criteria: Record<string, boolean | number | string>;
  created_at: string;
};

export type VoiceOverRow = {
  id: string;
  order_id: string;
  product_id: string;
  title: string;
  current_version: number;
  estimated_minutes: number;
  recorded_minutes: number;
  status: string;
  talent_profile_id: string | null;
  handoff_profile_id: string | null;
  due_date: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  returned_at: string | null;
  file_name: string | null;
  voice_style: string | null;
  notes: string | null;
  checklist?: Record<string, boolean>;
};

export type VoiceReviewRow = {
  id: string;
  voice_over_id: string;
  reviewer_profile_id: string | null;
  decision: string;
  comment: string | null;
  criteria: Record<string, boolean | number | string>;
  created_at: string;
};

export type VideoEditRow = {
  id: string;
  order_id: string;
  product_id: string;
  title: string;
  current_version: number;
  target_minutes: number;
  render_progress: number;
  status: string;
  editor_profile_id: string | null;
  qc_reviewer_profile_id: string | null;
  due_date: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  returned_at: string | null;
  file_name: string | null;
  subtitle_file: string | null;
  render_preset: string | null;
  notes: string | null;
  checklist?: Record<string, boolean>;
};

export type VideoReviewRow = {
  id: string;
  video_edit_id: string;
  reviewer_profile_id: string | null;
  decision: string;
  comment: string | null;
  criteria: Record<string, boolean | number | string>;
  created_at: string;
};

export type ScormPackageRow = {
  id: string;
  order_id: string;
  product_id: string;
  title: string;
  current_version: number;
  status: string;
  owner_profile_id: string | null;
  due_date: string | null;
  selected_question_ids: string[];
  pass_score: number;
  randomize_questions: boolean;
  completion_rule: string;
  manifest_status: string;
  package_file_name: string | null;
  notes: string | null;
};

export type ScormReviewRow = {
  id: string;
  scorm_package_id: string;
  reviewer_profile_id: string | null;
  decision: string;
  comment: string | null;
  criteria: Record<string, boolean | number | string>;
  created_at: string;
};

export type QuestionLibraryRow = {
  id: string;
  module: string;
  prompt: string;
  difficulty: string;
  tags: string[];
  correct_answer: string;
  distractors: string[];
  active: boolean;
};

export type WorkflowRecordKind = 'storyboard' | 'slide_design' | 'voice_over' | 'video_edit' | 'scorm_package';
export type InputItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  module: string;
  item_code: string;
  label: string;
  item_type: string;
  required: boolean;
  status: 'missing' | 'submitted' | 'approved' | 'changes_requested';
  file_name: string | null;
  file_url: string | null;
  notes: string | null;
  owner_profile_id: string | null;
  due_date: string | null;
  updated_at?: string | null;
};

export type IntakeTemplateItem = {
  code: string;
  label: string;
  type: string;
  required: boolean;
};

export type IntakeUploadResult = {
  fileName: string;
  fileUrl: string;
  bucket: string;
  path: string;
};

export type WorkflowUploadResult = IntakeUploadResult;

export type GameBriefConfig = {
  projectName: string;
  topicName: string;
  gameTitle: string;
  gameDescription: string;
  gameLogic: string;
  targetSkill: string;
  durationMinutes: number;
  platform: string;
  deviceTarget: string;
  exportResultRequired: boolean;
  excelTemplateUrl: string;
  startDate: string;
  endDate: string;
  status: string;
  notes: string;
};

const DEFAULT_GAME_BRIEF_CONFIG: GameBriefConfig = {
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
  startDate: '',
  endDate: '',
  status: 'draft',
  notes: '',
};

export function getInputTemplate(moduleCode: 'ELN' | 'VIDEO' | 'GAME'): IntakeTemplateItem[] {
  const sharedTemplate: IntakeTemplateItem[] = [
    { code: 'lesson_plan', label: '01. Gi\u00e1o \u00e1n', type: 'document', required: true },
    { code: 'task_outline', label: '02. \u0110\u1ec1 c\u01b0\u01a1ng nhi\u1ec7m v\u1ee5', type: 'scope', required: true },
    { code: 'logo_files', label: '03. Logo files (PNG + SVG)', type: 'asset', required: true },
    { code: 'lesson_script', label: '04. Kịch bản lời thoại', type: 'script', required: true },
    { code: 'brand_guidelines', label: '05. Brand Guidelines', type: 'brand', required: false },
    { code: 'typography', label: '06. Typography', type: 'font', required: false },
    { code: 'extended_reference', label: '07. Ki\u1ebfn th\u1ee9c / T\u01b0 li\u1ec7u m\u1edf r\u1ed9ng', type: 'reference', required: false },
    { code: 'voice_script', label: '08. Kịch bản thu voice', type: 'voice_script', required: false },
  ];

  const gameTemplate: IntakeTemplateItem[] = [
    { code: 'game_objective', label: '01. Muc tieu game / Learning Objective', type: 'objective', required: true },
    { code: 'gameplay_reference', label: '02. Gameplay reference / Flow mau', type: 'gameplay', required: true },
    { code: 'scoring_rule', label: '03. Scoring / Rule expectation', type: 'rule', required: true },
    { code: 'brand_assets', label: '04. Brand guideline + visual assets', type: 'brand', required: true },
    { code: 'content_assets', label: '05. Content / Asset source', type: 'asset', required: true },
    { code: 'player_sample', label: '06. Player list / Data sample', type: 'player', required: true },
    { code: 'export_template', label: '07. Export result template', type: 'template', required: true },
    { code: 'technical_constraints', label: '08. Technical constraints', type: 'technical', required: true },
    { code: 'extended_reference', label: '09. Reference mo rong', type: 'reference', required: false },
  ];

  const elnTemplate: IntakeTemplateItem[] = [
    ...sharedTemplate,
    { code: 'scorm_quiz', label: '09. Quiz SCORM', type: 'scorm_quiz', required: false },
  ];

  if (moduleCode === 'GAME') return gameTemplate;
  return moduleCode === 'VIDEO'
    ? sharedTemplate.map((item) => (item.code === 'lesson_script' ? { ...item, label: '04. Kịch bản lời thoại' } : item))
    : elnTemplate;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  return supabase;
}

export function inferProductWorkflowModule(productId: string, fallbackModule?: string | null) {
  const normalized = String(productId || '').toLowerCase();
  if (normalized.includes('-eln-')) return 'ELN';
  if (normalized.includes('-video-')) return 'VIDEO';
  if (normalized.includes('-game-')) return 'GAME';
  const normalizedUnderscore = normalized.replace(/-/g, '_');
  if (/[_-]h\d{2,}$/i.test(normalized) || /_h\d{2,}$/i.test(normalizedUnderscore)) return 'VIDEO';
  if (/[_-]g\d{2,}$/i.test(normalized) || /_g\d{2,}$/i.test(normalizedUnderscore)) return 'GAME';
  if (/[_-]e\d{2,}$/i.test(normalized) || /_e\d{2,}$/i.test(normalizedUnderscore)) return 'ELN';
  if (fallbackModule === 'VIDEO') return 'VIDEO';
  if (fallbackModule === 'GAME') return 'GAME';
  return 'ELN';
}

export function getWorkflowStageIndicesByModule(module: 'ELN' | 'VIDEO' | 'GAME') {
  if (module === 'VIDEO') return [0, 1, 2, 3, 4, 5, 6, 7];
  if (module === 'GAME') return [0, 1, 2, 3];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8];
}

function sanitizeGameBriefConfig(input: Partial<GameBriefConfig> | null | undefined): GameBriefConfig {
  return {
    projectName: String(input?.projectName || ''),
    topicName: String(input?.topicName || ''),
    gameTitle: String(input?.gameTitle || ''),
    gameDescription: String(input?.gameDescription || ''),
    gameLogic: String(input?.gameLogic || ''),
    targetSkill: String(input?.targetSkill || ''),
    durationMinutes: Math.max(1, Number(input?.durationMinutes) || DEFAULT_GAME_BRIEF_CONFIG.durationMinutes),
    platform: String(input?.platform || DEFAULT_GAME_BRIEF_CONFIG.platform),
    deviceTarget: String(input?.deviceTarget || DEFAULT_GAME_BRIEF_CONFIG.deviceTarget),
    exportResultRequired: Boolean(input?.exportResultRequired),
    excelTemplateUrl: String(input?.excelTemplateUrl || ''),
    startDate: String(input?.startDate || ''),
    endDate: String(input?.endDate || ''),
    status: String(input?.status || DEFAULT_GAME_BRIEF_CONFIG.status),
    notes: String(input?.notes || ''),
  };
}

export function parseGameBriefConfig(item: InputItemRow | null | undefined): GameBriefConfig {
  if (!item?.notes) return { ...DEFAULT_GAME_BRIEF_CONFIG };
  try {
    return sanitizeGameBriefConfig(JSON.parse(item.notes));
  } catch {
    return { ...DEFAULT_GAME_BRIEF_CONFIG };
  }
}

export function isGameBriefReady(config: GameBriefConfig) {
  return Boolean(
    config.projectName.trim() &&
      config.topicName.trim() &&
      config.gameTitle.trim() &&
      config.gameDescription.trim() &&
      config.gameLogic.trim() &&
      config.platform.trim() &&
      config.deviceTarget.trim() &&
      config.startDate &&
      config.endDate,
  );
}

async function getNextClientOrderId() {
  const client = requireSupabase();
  const { data, error } = await client.from('vcontent_orders').select('id').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const numericIds = (data || [])
    .map((item: { id: string }) => /^ord-(\d{4})$/i.exec(String(item.id || '').trim()))
    .filter(Boolean)
    .map((match) => Number(match?.[1] || 0));
  const nextNumber = (numericIds.length ? Math.max(...numericIds) : 0) + 1;
  return `ord-${String(nextNumber).padStart(4, '0')}`;
}

function clampBundleCount(value: number | undefined) {
  return Math.max(0, Math.min(20, Number(value) || 0));
}

export function normalizeOrderCodeFragment(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function mapOrderProductKindToModule(kind: OrderProductCodeKind): ManualOrderProductInput['module'] {
  if (kind === 'H') return 'VIDEO';
  if (kind === 'G') return 'GAME';
  return 'ELN';
}

export function mapModuleToOrderProductKind(module: ManualOrderProductInput['module']): OrderProductCodeKind {
  if (module === 'VIDEO') return 'H';
  if (module === 'GAME') return 'G';
  return 'E';
}

export function buildOrderProductCode(orderCode: string, kind: OrderProductCodeKind, sequence: number) {
  const safeBase = normalizeOrderCodeFragment(orderCode) || 'ORDER';
  const no = String(Math.max(1, Number(sequence) || 1)).padStart(2, '0');
  return `${safeBase}${kind}${no}`;
}

function mapImportedModuleToBundleKey(module: ImportedModuleCode) {
  if (module === 'VIDEO') return 'video';
  if (module === 'GAME') return 'game';
  return 'eln';
}

function getOrderModuleLabel(bundleCounts: OrderBundleCounts) {
  const activeModules = [
    bundleCounts.eln > 0 ? 'ELN' : null,
    bundleCounts.video > 0 ? 'VIDEO' : null,
    bundleCounts.game > 0 ? 'GAME' : null,
  ].filter(Boolean);
  if (activeModules.length === 1) return activeModules[0] as string;
  return activeModules.length > 1 ? 'MIXED' : 'ELN';
}

function getOrderModuleLabelFromType(orderType?: string | null) {
  const normalized = String(orderType || '').trim().toUpperCase();
  if (normalized === 'H') return 'VIDEO';
  if (normalized === 'G') return 'GAME';
  if (normalized === 'M') return 'MIXED';
  return 'ELN';
}

function inferOrderTypeFromBundleCounts(bundleCounts: OrderBundleCounts) {
  const activeTypes = [
    bundleCounts.eln > 0 ? 'E' : null,
    bundleCounts.video > 0 ? 'H' : null,
    bundleCounts.game > 0 ? 'G' : null,
  ].filter(Boolean);
  if (activeTypes.length === 1) return activeTypes[0] as 'E' | 'H' | 'G';
  return 'M';
}

function buildDisplayOrderCode(input: {
  client: string;
  projectCode?: string | null;
  orderType?: string | null;
  fallbackOrderId?: string | null;
}) {
  const clientCode = normalizeOrderCodeFragment(input.client);
  const projectCode = normalizeOrderCodeFragment(input.projectCode || '');
  const orderType = normalizeOrderCodeFragment(input.orderType || '');
  const parts = [clientCode, projectCode, orderType].filter(Boolean);
  if (parts.length) return parts.join('_');
  return normalizeOrderCodeFragment(input.fallbackOrderId || '') || String(input.fallbackOrderId || '').trim() || 'ORDER';
}

function normalizeDisplayOrderCode(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function buildProductBundlePayload(orderId: string, title: string, bundleCounts: OrderBundleCounts) {
  const specs = [
    { key: 'eln', code: 'eln', label: 'E-learning', count: bundleCounts.eln },
    { key: 'video', code: 'video', label: 'Video', count: bundleCounts.video },
    { key: 'game', code: 'game', label: 'Gamification', count: bundleCounts.game },
  ] as const;

  return specs.flatMap((spec) =>
    Array.from({ length: spec.count }, (_value, index) => {
      const itemNo = String(index + 1).padStart(2, '0');
      return {
        id: `${orderId}-${spec.code}-${itemNo}`,
        order_id: orderId,
        name: `${title} / ${spec.label} ${itemNo}`,
        current_stage_index: 0,
        progress: 0,
        ready_for_delivery: false,
        finished: false,
        delivered_at: null,
      };
    }),
  );
}

function buildManualProductPayload(orderId: string, title: string, products: ManualOrderProductInput[]) {
  const counters: Record<'eln' | 'video' | 'game', number> = {
    eln: 0,
    video: 0,
    game: 0,
  };

  return products.map((product) => {
    const bundleKey = product.module === 'VIDEO' ? 'video' : product.module === 'GAME' ? 'game' : 'eln';
    counters[bundleKey] += 1;
    const itemNo = String(counters[bundleKey]).padStart(2, '0');
    const kind = product.kind || mapModuleToOrderProductKind(product.module);
    const code = normalizeOrderCodeFragment(product.code || '');
    const normalizedCode = code || `${orderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}${kind}${itemNo}`;
    return {
      id: `${orderId}-${normalizedCode.toLowerCase()}`,
      order_id: orderId,
      name: product.name.trim() || `${title} / ${product.module} ${itemNo}`,
      current_stage_index: 0,
      progress: 0,
      ready_for_delivery: false,
      finished: false,
      delivered_at: null,
    };
  });
}

function buildPlannedProductPayload(input: {
  orderId: string;
  title: string;
  plannedProductCount: number;
  displayOrderCode: string;
}) {
  return Array.from({ length: input.plannedProductCount }, (_value, index) => {
    const itemNo = String(index + 1).padStart(2, '0');
    const normalizedCode = normalizeOrderCodeFragment(`${input.displayOrderCode}_${itemNo}`);
    return {
      id: `${input.orderId}-${normalizedCode.toLowerCase()}`,
      order_id: input.orderId,
      name: '',
      current_stage_index: 0,
      progress: 0,
      ready_for_delivery: false,
      finished: false,
      delivered_at: null,
    };
  });
}

function buildImportedProductPayload(orderId: string, orderTitle: string, products: ImportedOrderProductSeed[]) {
  const counters: Record<'eln' | 'video' | 'game', number> = {
    eln: 0,
    video: 0,
    game: 0,
  };

  return products.map((product) => {
    const bundleKey = mapImportedModuleToBundleKey(product.module);
    counters[bundleKey] += 1;
    const itemNo = String(counters[bundleKey]).padStart(2, '0');
    return {
      id: `${orderId}-${bundleKey}-${itemNo}`,
      order_id: orderId,
      name: `${product.sourceCode} - ${product.detail}`,
      current_stage_index: 0,
      progress: 0,
      ready_for_delivery: false,
      finished: false,
      delivered_at: null,
    };
  });
}

async function getAccessToken() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  let session = data.session;
  const expiresAt = Number(session?.expires_at || 0);
  if (session && expiresAt > 0 && expiresAt - Math.floor(Date.now() / 1000) < 60) {
    const refreshed = await client.auth.refreshSession();
    if (refreshed.error) throw refreshed.error;
    session = refreshed.data.session;
  }
  if (session) {
    const verified = await client.auth.getUser(session.access_token);
    if (verified.error) throw verified.error;
  }
  const token = session?.access_token;
  if (!token) {
    throw new Error('Missing session token.');
  }
  return token;
}

async function requestAppApi(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }

  return payload;
}

type NoticeDispatchInput = {
  eventType: string;
  objectType?: string;
  objectId?: string;
  actorProfileId?: string | null;
  title?: string;
  body?: string;
  summary?: string;
  level?: 'info' | 'warning' | 'danger' | 'success';
  linkPage?: string | null;
  recipientProfileId?: string | null;
  recipientProfileIds?: string[];
  recipientEmail?: string | null;
  recipientEmails?: string[];
  recipientAccountId?: string | null;
  recipientAccountIds?: string[];
  notificationId?: string | null;
  persistInApp?: boolean;
  notifyActor?: boolean;
  eventKey?: string | null;
  metadata?: Record<string, unknown>;
};

export async function dispatchNotice(input: NoticeDispatchInput) {
  return requestAppApi('/api/notice-dispatch', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

function runOptionalNoticeDispatch(input: NoticeDispatchInput) {
  void (async () => {
    try {
      await dispatchNotice(input);
    } catch {
      // Notice/email delivery must not block the business action that already succeeded.
    }
  })();
}

async function notifyProductionManagersOrderCreated(input: {
  orderId: string;
  title: string;
  client: string;
  module: string;
  deadline: string;
  displayOrderCode?: string | null;
  productCount?: number | null;
  actorProfileId?: string | null;
}) {
  const displayOrderCode = String(input.displayOrderCode || input.orderId || '').trim();
  const productCount = Number(input.productCount || 0);
  runOptionalNoticeDispatch({
    eventType: 'order_created',
    objectType: 'order',
    objectId: input.orderId,
    actorProfileId: input.actorProfileId || null,
    notifyActor: true,
    title: `Có đơn hàng mới: ${displayOrderCode}`,
    body: [
      `Đơn hàng: ${displayOrderCode}`,
      input.title ? `Tên đơn: ${input.title}` : '',
      input.client ? `Khách hàng: ${input.client}` : '',
      input.module ? `Module: ${input.module}` : '',
      input.deadline ? `Deadline: ${input.deadline}` : '',
      productCount > 0 ? `Số sản phẩm: ${productCount}` : '',
    ].filter(Boolean).join('\n'),
    level: 'warning',
    linkPage: 'tracking',
    eventKey: `order_created:${input.orderId}`,
    metadata: {
      order_id: input.orderId,
      display_order_code: displayOrderCode,
      order_title: input.title,
      client: input.client,
      module: input.module,
      deadline: input.deadline,
      product_count: productCount || null,
    },
  });
}

function shouldDispatchActivityNotice(actionType: string) {
  return [
    'workflow_step_started',
    'workflow_step_submitted',
    'workflow_step_returned',
    'workflow_step_approved',
    'workflow_review_claimed',
    'workflow_step_assigned',
    'task_assigned',
    'task_started',
    'input_item_submitted',
    'input_item_approved',
    'input_item_changes_requested',
  ].includes(actionType);
}

export async function fetchWorkflowRecordsPreview() {
  const payload = await requestAppApi('/api/workflow-records-preview', { method: 'GET' });
  return payload as {
    ok: true;
    viewerProfile: unknown;
    storyboards: StoryboardRow[];
    slideDesigns: SlideDesignRow[];
    voiceOvers: VoiceOverRow[];
    videoEdits: VideoEditRow[];
    scormPackages: ScormPackageRow[];
  };
}

export async function requestPlanningAi(input: {
  orderId: string;
  planningContext: string;
  teamCapacity: {
    pm: number;
    storyboard: number;
    design: number;
    qc: number;
    voice: number;
    video: number;
    scorm: number;
    game: number;
  };
  bottlenecks: string;
}) {
  return requestAppApi('/api/planning-ai', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

async function fileToBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });

  const commaIndex = dataUrl.indexOf(',');
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

const INTAKE_STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_INTAKE_BUCKET || 'vcontent-intake';
const WORKFLOW_STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_WORKFLOW_BUCKET || import.meta.env.VITE_SUPABASE_INTAKE_BUCKET || 'vcontent-intake';
const AVATAR_STORAGE_BUCKET = import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || 'vcontent-avatars';

function isPolicyError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error
        ? String((error as { message?: unknown; details?: unknown; code?: unknown }).message || (error as { details?: unknown }).details || (error as { code?: unknown }).code || '')
        : String(error || '');
  const normalized = message.toLowerCase();
  return normalized.includes('row-level security') || normalized.includes('permission denied');
}

function slugifyStoragePath(value: string) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function extractStorageObjectPath(fileUrl: string | null | undefined, bucket: string) {
  if (!fileUrl) return null;
  const publicSegment = `/storage/v1/object/public/${bucket}/`;
  const signedSegment = `/storage/v1/object/sign/${bucket}/`;

  if (fileUrl.includes(publicSegment)) {
    return decodeURIComponent(fileUrl.split(publicSegment)[1].split('?')[0]);
  }
  if (fileUrl.includes(signedSegment)) {
    return decodeURIComponent(fileUrl.split(signedSegment)[1].split('?')[0]);
  }
  if (fileUrl.startsWith(`storage://${bucket}/`)) {
    return fileUrl.slice(`storage://${bucket}/`.length);
  }

  return null;
}

async function uploadFileToSignedUrl(signedUrl: string, file: File) {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);

  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'x-upsert': 'true',
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = text;
    try {
      const payload = text ? JSON.parse(text) : null;
      message = payload?.error || payload?.message || payload?.msg || text;
    } catch {
      // Keep the raw response text when Storage does not return JSON.
    }
    throw new Error(message || `Upload failed with HTTP ${response.status}.`);
  }
}

async function uploadStorageFileDirect(input: {
  bucket: string;
  file: File;
  previousUrl?: string | null;
  segments: string[];
}): Promise<IntakeUploadResult> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const objectPath = input.segments.filter(Boolean).join('/');
  const previousObjectPath = extractStorageObjectPath(input.previousUrl, input.bucket);

  if (previousObjectPath) {
    const deleteResult = await supabase.storage.from(input.bucket).remove([previousObjectPath]);
    if (deleteResult.error) {
      throw deleteResult.error;
    }
  }

  const uploadResult = await supabase.storage.from(input.bucket).upload(objectPath, input.file, {
    contentType: input.file.type || 'application/octet-stream',
    upsert: true,
  });
  if (uploadResult.error) {
    throw uploadResult.error;
  }

  const publicUrl = supabase.storage.from(input.bucket).getPublicUrl(objectPath).data.publicUrl;
  if (!publicUrl) {
    throw new Error('Failed to resolve uploaded file URL.');
  }

  return {
    fileName: input.file.name,
    fileUrl: publicUrl,
    bucket: input.bucket,
    path: objectPath,
  };
}

async function deleteStorageFileDirect(input: { bucket: string; fileUrl: string }) {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const objectPath = extractStorageObjectPath(input.fileUrl, input.bucket);
  if (!objectPath) return;

  const deleteResult = await supabase.storage.from(input.bucket).remove([objectPath]);
  if (deleteResult.error) {
    throw deleteResult.error;
  }
}

async function uploadWorkflowAssetWithSignedUrl(input: {
  file: File;
  orderId: string;
  productId: string;
  module: string;
  stageCode: string;
  slot: string;
  previousUrl?: string | null;
}): Promise<WorkflowUploadResult> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }
  const payload = await requestAppApi('/api/workflow-upload', {
    method: 'POST',
    body: JSON.stringify({
      action: 'signed_upload_url',
      orderId: input.orderId,
      productId: input.productId,
      module: input.module,
      stageCode: input.stageCode,
      slot: input.slot,
      previousUrl: input.previousUrl || null,
      fileName: input.file.name,
      contentType: input.file.type || 'application/octet-stream',
    }),
  });
  const upload = (payload as { upload?: { bucket?: string; path?: string; token?: string; signedUrl?: string; fileName?: string } }).upload;
  if (!upload?.bucket || !upload.path || !upload.token || !upload.signedUrl) {
    throw new Error('Server did not return a signed upload URL.');
  }
  await uploadFileToSignedUrl(upload.signedUrl, input.file);
  const publicUrl = supabase.storage.from(upload.bucket).getPublicUrl(upload.path).data.publicUrl;
  if (!publicUrl) {
    throw new Error('Failed to resolve uploaded file URL.');
  }
  return {
    fileName: upload.fileName || input.file.name,
    fileUrl: publicUrl,
    bucket: upload.bucket,
    path: upload.path,
  };
}

async function uploadIntakeAssetWithSignedUrl(input: {
  file: File;
  orderId: string;
  productId: string;
  itemCode: string;
  module: string;
  previousUrl?: string | null;
}): Promise<IntakeUploadResult> {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }
  const payload = await requestAppApi('/api/intake-upload', {
    method: 'POST',
    body: JSON.stringify({
      action: 'signed_upload_url',
      orderId: input.orderId,
      productId: input.productId,
      itemCode: input.itemCode,
      module: input.module,
      previousUrl: input.previousUrl || null,
      fileName: input.file.name,
      contentType: input.file.type || 'application/octet-stream',
    }),
  });
  const upload = (payload as { upload?: { bucket?: string; path?: string; token?: string; signedUrl?: string; fileName?: string } }).upload;
  if (!upload?.bucket || !upload.path || !upload.token || !upload.signedUrl) {
    throw new Error('Server did not return a signed upload URL.');
  }
  await uploadFileToSignedUrl(upload.signedUrl, input.file);
  const publicUrl = supabase.storage.from(upload.bucket).getPublicUrl(upload.path).data.publicUrl;
  if (!publicUrl) {
    throw new Error('Failed to resolve uploaded file URL.');
  }
  return {
    fileName: upload.fileName || input.file.name,
    fileUrl: publicUrl,
    bucket: upload.bucket,
    path: upload.path,
  };
}

const ORDER_SELECT = 'id,client,company_id,title,module,deadline,status,created_by_profile_id,intake_note,rejection_reason,change_request_reason,stage_sla_overrides,created_at,submitted_at,launched_at,assignees';
const PRODUCT_SELECT = 'id,order_id,name,current_stage_index,progress,ready_for_delivery,finished,delivered_at';
const TASK_SELECT = 'id,order_id,product_id,stage_index,status,progress,due_date,assignee,assignee_profile_id,assignee_account_id,archived';
const TASK_SELECT_LEGACY = 'id,order_id,product_id,stage_index,status,progress,due_date,assignee,archived';

function isMissingColumnError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return /column/i.test(message) && /(assignee_profile_id|assignee_account_id|recipient_profile_id|recipient_account_id|event_key|email_status|email_sent_at|email_error|read_at|metadata)/i.test(message);
}

function normalizeTaskRows(data: any[]) {
  return (data || []).map((item) => ({
    ...item,
    assignee_profile_id: 'assignee_profile_id' in item ? item.assignee_profile_id : null,
    assignee_account_id: 'assignee_account_id' in item ? item.assignee_account_id : null,
  })) as TaskRow[];
}

async function refreshOrderStatusProjection(orderId: string) {
  await syncWorkflowStatusProjection(orderId);
}
const INPUT_ITEM_SELECT = 'id,order_id,product_id,module,item_code,label,item_type,required,status,file_name,file_url,notes,owner_profile_id,due_date,updated_at';
const STORYBOARD_SELECT = 'id,order_id,product_id,title,current_version,total_scenes,estimated_minutes,status,assignee_profile_id,reviewer_profile_id,due_date,submitted_at,approved_at,returned_at,file_name,notes';
const STORYBOARD_REVIEW_SELECT = 'id,storyboard_id,reviewer_profile_id,decision,comment,criteria,created_at';
const SLIDE_DESIGN_SELECT = 'id,order_id,product_id,title,current_version,target_slides,completed_slides,status,designer_profile_id,qc_reviewer_profile_id,due_date,submitted_at,approved_at,returned_at,file_name,brand_spec,notes,checklist';
const SLIDE_DESIGN_REVIEW_SELECT = 'id,slide_design_id,reviewer_profile_id,decision,comment,criteria,created_at';
const VOICE_OVER_SELECT = 'id,order_id,product_id,title,current_version,estimated_minutes,recorded_minutes,status,talent_profile_id,handoff_profile_id,due_date,submitted_at,completed_at,returned_at,file_name,voice_style,notes,checklist';
const VOICE_REVIEW_SELECT = 'id,voice_over_id,reviewer_profile_id,decision,comment,criteria,created_at';
const VIDEO_EDIT_SELECT = 'id,order_id,product_id,title,current_version,target_minutes,render_progress,status,editor_profile_id,qc_reviewer_profile_id,due_date,submitted_at,approved_at,returned_at,file_name,subtitle_file,render_preset,notes,checklist';
const VIDEO_REVIEW_SELECT = 'id,video_edit_id,reviewer_profile_id,decision,comment,criteria,created_at';
const QUESTION_LIBRARY_SELECT = 'id,module,prompt,difficulty,tags,correct_answer,distractors,active';
const SCORM_PACKAGE_SELECT = 'id,order_id,product_id,title,current_version,status,owner_profile_id,due_date,selected_question_ids,pass_score,randomize_questions,completion_rule,manifest_status,package_file_name,notes';
const SCORM_REVIEW_SELECT = 'id,scorm_package_id,reviewer_profile_id,decision,comment,criteria,created_at';
const ACTIVITY_LOG_SELECT = 'id,happened_at,actor_profile_id,action_type,object_type,object_id,summary,metadata';

type ListTasksOptions = {
  includeArchived?: boolean;
  stageIndices?: number[];
};

type ListInputItemsOptions = {
  module?: string;
  orderId?: string;
  productId?: string;
};

type ListWorkflowRecordsOptions = {
  kinds?: WorkflowRecordKind[];
  includeReviews?: boolean;
  includeQuestionLibrary?: boolean;
};

function parseChecklistValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

type WorkflowRecordsBundle = {
  storyboards: StoryboardRow[];
  storyboardReviews: StoryboardReviewRow[];
  slideDesigns: SlideDesignRow[];
  slideDesignReviews: SlideDesignReviewRow[];
  voiceOvers: VoiceOverRow[];
  voiceReviews: VoiceReviewRow[];
  videoEdits: VideoEditRow[];
  videoReviews: VideoReviewRow[];
  questionLibrary: QuestionLibraryRow[];
  scormPackages: ScormPackageRow[];
  scormReviews: ScormReviewRow[];
};

export async function listOrdersWithProducts() {
  const client = requireSupabase();
  const [{ data: orders, error: ordersError }, { data: products, error: productsError }] = await Promise.all([
    client.from('vcontent_orders').select(ORDER_SELECT).order('created_at', { ascending: false }),
    client.from('vcontent_products').select(PRODUCT_SELECT).order('created_at', { ascending: true }),
  ]);

  if (ordersError) throw ordersError;
  if (productsError) throw productsError;

  const orderRows = (orders || []) as OrderRow[];
  const existingOrderIds = new Set(orderRows.map((order) => order.id));

  return {
    orders: orderRows,
    products: ((products || []) as ProductRow[]).filter((product) => existingOrderIds.has(product.order_id)),
  };
}

export async function syncWorkflowStatusProjection(orderId: string) {
  const client = requireSupabase();
  const [ordersResult, productsResult, tasksResult, inputItemsResult, workflowRecordsResult] = await Promise.all([
    client.from('vcontent_orders').select(ORDER_SELECT).eq('id', orderId).limit(1),
    client.from('vcontent_products').select(PRODUCT_SELECT).eq('order_id', orderId).order('created_at', { ascending: true }),
    listTasks({ includeArchived: true }),
    listInputItems({ orderId }),
    listWorkflowRecords({ kinds: ['storyboard', 'slide_design', 'voice_over', 'video_edit', 'scorm_package'], includeReviews: false, includeQuestionLibrary: false }),
  ]);

  if (ordersResult.error) throw ordersResult.error;
  if (productsResult.error) throw productsResult.error;

  const order = (ordersResult.data || [])[0] as OrderRow | undefined;
  if (!order) return;

  const projection = buildWorkflowStatusProjection({
    order,
    products: (productsResult.data || []) as ProductRow[],
    tasks: ((tasksResult || []) as TaskRow[]).filter((task) => task.order_id === orderId),
    inputItems: (inputItemsResult || []) as InputItemRow[],
    workflowRecords: workflowRecordsResult,
  });

  const { error: updateError } = await client
    .from('vcontent_orders')
    .update({
      stage_sla_overrides: withWorkflowStatusProjection(order.stage_sla_overrides, projection),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId);

  if (updateError) throw updateError;
}

export async function listTasks(options?: ListTasksOptions) {
  const client = requireSupabase();
  const buildQuery = (selectClause: string) => {
    let query = client
      .from('vcontent_tasks')
      .select(selectClause)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (!options?.includeArchived) {
      query = query.eq('archived', false);
    }

    if (options?.stageIndices?.length) {
      query = query.in('stage_index', options.stageIndices);
    }

    return query;
  };

  const primary = await buildQuery(TASK_SELECT);
  if (!primary.error) return normalizeTaskRows(primary.data || []);
  if (!isMissingColumnError(primary.error)) throw primary.error;

  const legacy = await buildQuery(TASK_SELECT_LEGACY);
  if (legacy.error) throw legacy.error;
  return normalizeTaskRows(legacy.data || []);
}

export async function listDeliveries() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_deliveries')
    .select('*')
    .order('sent_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data || []) as any[]).map((item) => ({
    ...item,
    items: Array.isArray(item.items) ? item.items : [],
  })) as DeliveryRow[];
}

export async function listPaymentRequests() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_payment_requests')
    .select('*')
    .order('due_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as PaymentRequestRow[];
}

export async function listPaymentReceipts() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_payment_receipts')
    .select('*')
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as PaymentReceiptRow[];
}

export async function listWorkflowRecords(options?: ListWorkflowRecordsOptions) {
  const client = requireSupabase();
  const kinds = options?.kinds?.length ? options.kinds : ['storyboard', 'slide_design', 'voice_over', 'video_edit', 'scorm_package'];
  const includeReviews = options?.includeReviews ?? true;
  const includeQuestionLibrary = options?.includeQuestionLibrary ?? true;

  const requests: Array<PromiseLike<{ key: keyof WorkflowRecordsBundle; data: unknown[] }>> = [];

  if (kinds.includes('storyboard')) {
    requests.push(
      client
        .from('vcontent_storyboards')
        .select(STORYBOARD_SELECT)
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return { key: 'storyboards' as const, data: (data || []) as unknown[] };
        }),
    );
    if (includeReviews) {
      requests.push(
        client
          .from('vcontent_storyboard_reviews')
          .select(STORYBOARD_REVIEW_SELECT)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return { key: 'storyboardReviews' as const, data: (data || []) as unknown[] };
          }),
      );
    }
  }

  if (kinds.includes('slide_design')) {
    requests.push(
      client
        .from('vcontent_slide_designs')
        .select(SLIDE_DESIGN_SELECT)
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return { key: 'slideDesigns' as const, data: (data || []) as unknown[] };
        }),
    );
    if (includeReviews) {
      requests.push(
        client
          .from('vcontent_slide_design_reviews')
          .select(SLIDE_DESIGN_REVIEW_SELECT)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return { key: 'slideDesignReviews' as const, data: (data || []) as unknown[] };
          }),
      );
    }
  }

  if (kinds.includes('voice_over')) {
    requests.push(
      client
        .from('vcontent_voice_overs')
        .select(VOICE_OVER_SELECT)
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return { key: 'voiceOvers' as const, data: (data || []) as unknown[] };
        }),
    );
    if (includeReviews) {
      requests.push(
        client
          .from('vcontent_voice_reviews')
          .select(VOICE_REVIEW_SELECT)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return { key: 'voiceReviews' as const, data: (data || []) as unknown[] };
          }),
      );
    }
  }

  if (kinds.includes('video_edit')) {
    requests.push(
      client
        .from('vcontent_video_edits')
        .select(VIDEO_EDIT_SELECT)
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return { key: 'videoEdits' as const, data: (data || []) as unknown[] };
        }),
    );
    if (includeReviews) {
      requests.push(
        client
          .from('vcontent_video_reviews')
          .select(VIDEO_REVIEW_SELECT)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return { key: 'videoReviews' as const, data: (data || []) as unknown[] };
          }),
      );
    }
  }

  if (kinds.includes('scorm_package')) {
    requests.push(
      client
        .from('vcontent_scorm_packages')
        .select(SCORM_PACKAGE_SELECT)
        .order('updated_at', { ascending: false })
        .then(({ data, error }) => {
          if (error) throw error;
          return { key: 'scormPackages' as const, data: (data || []) as unknown[] };
        }),
    );
    if (includeReviews) {
      requests.push(
        client
          .from('vcontent_scorm_reviews')
          .select(SCORM_REVIEW_SELECT)
          .order('created_at', { ascending: false })
          .then(({ data, error }) => {
            if (error) throw error;
            return { key: 'scormReviews' as const, data: (data || []) as unknown[] };
          }),
      );
    }
  }

  if (includeQuestionLibrary) {
    requests.push(
      client
        .from('vcontent_question_library')
        .select(QUESTION_LIBRARY_SELECT)
        .order('id', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return { key: 'questionLibrary' as const, data: (data || []) as unknown[] };
        }),
    );
  }

  const resolved = await Promise.all(requests);

  const bundle: WorkflowRecordsBundle = {
    storyboards: [],
    storyboardReviews: [],
    slideDesigns: [],
    slideDesignReviews: [],
    voiceOvers: [],
    voiceReviews: [],
    videoEdits: [],
    videoReviews: [],
    questionLibrary: [],
    scormPackages: [],
    scormReviews: [],
  };

  for (const entry of resolved) {
    if (entry.key === 'storyboards') {
      bundle.storyboards = entry.data as StoryboardRow[];
      continue;
    }
    if (entry.key === 'storyboardReviews') {
      bundle.storyboardReviews = (entry.data as any[]).map((item) => ({
        ...item,
        criteria: item.criteria && typeof item.criteria === 'object' ? item.criteria : {},
      })) as StoryboardReviewRow[];
      continue;
    }
    if (entry.key === 'slideDesigns') {
      bundle.slideDesigns = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        checklist: parseChecklistValue(item.checklist),
      })) as SlideDesignRow[];
      continue;
    }
    if (entry.key === 'slideDesignReviews') {
      bundle.slideDesignReviews = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        criteria: item.criteria && typeof item.criteria === 'object' ? item.criteria : {},
      })) as SlideDesignReviewRow[];
      continue;
    }
    if (entry.key === 'voiceOvers') {
      bundle.voiceOvers = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        checklist: parseChecklistValue(item.checklist),
      })) as VoiceOverRow[];
      continue;
    }
    if (entry.key === 'voiceReviews') {
      bundle.voiceReviews = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        criteria: item.criteria && typeof item.criteria === 'object' ? item.criteria : {},
      })) as VoiceReviewRow[];
      continue;
    }
    if (entry.key === 'videoEdits') {
      bundle.videoEdits = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        checklist: parseChecklistValue(item.checklist),
      })) as VideoEditRow[];
      continue;
    }
    if (entry.key === 'videoReviews') {
      bundle.videoReviews = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        criteria: item.criteria && typeof item.criteria === 'object' ? item.criteria : {},
      })) as VideoReviewRow[];
      continue;
    }
    if (entry.key === 'questionLibrary') {
      bundle.questionLibrary = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        tags: Array.isArray(item.tags) ? item.tags : [],
        distractors: Array.isArray(item.distractors) ? item.distractors : [],
      })) as QuestionLibraryRow[];
      continue;
    }
    if (entry.key === 'scormPackages') {
      bundle.scormPackages = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        selected_question_ids: Array.isArray(item.selected_question_ids) ? item.selected_question_ids : [],
      })) as ScormPackageRow[];
      continue;
    }
    if (entry.key === 'scormReviews') {
      bundle.scormReviews = ((entry.data || []) as any[]).map((item) => ({
        ...item,
        criteria: item.criteria && typeof item.criteria === 'object' ? item.criteria : {},
      })) as ScormReviewRow[];
    }
  }

  return bundle;
}

export async function listInputItems(options?: ListInputItemsOptions) {
  const client = requireSupabase();
  let query = client
    .from('vcontent_input_items')
    .select(INPUT_ITEM_SELECT)
    .order('updated_at', { ascending: false });

  if (options?.module) {
    query = query.eq('module', options.module);
  }

  if (options?.orderId) {
    query = query.eq('order_id', options.orderId);
  }

  if (options?.productId) {
    query = query.eq('product_id', options.productId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []) as InputItemRow[];
}

async function getCurrentNotificationRecipient() {
  const client = requireSupabase();
  const { data: sessionData } = await client.auth.getSession();
  const accountId = sessionData.session?.user?.id || null;
  const email = String(sessionData.session?.user?.email || '').trim().toLowerCase();
  if (!accountId) return { profileId: null as string | null, accountId: null as string | null };

  const { data: profileByAccount } = await client
    .from('vcontent_profiles')
    .select('id,auth_user_id')
    .eq('auth_user_id', accountId)
    .maybeSingle();

  if (profileByAccount?.id) {
    return {
      profileId: profileByAccount.id,
      accountId,
    };
  }

  const { data: profileByEmail } = email
    ? await client
        .from('vcontent_profiles')
        .select('id,auth_user_id,email')
        .ilike('email', email)
        .maybeSingle()
    : { data: null };

  return {
    profileId: (profileByEmail as { id?: string } | null)?.id || null,
    accountId,
  };
}

async function listNotificationsUnscoped() {
  const client = requireSupabase();
  const recipient = await getCurrentNotificationRecipient();
  const { data, error } = await client
    .from('vcontent_notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return filterNotificationsByTaskAssignee(client, (data || []) as NotificationRow[], recipient);
}

export async function listNotifications() {
  const client = requireSupabase();
  const recipient = await getCurrentNotificationRecipient();
  const filters = [];
  if (recipient.profileId) filters.push(`recipient_profile_id.eq.${recipient.profileId}`);
  if (recipient.accountId) filters.push(`recipient_account_id.eq.${recipient.accountId}`);
  if (!filters.length) filters.push('and(recipient_profile_id.is.null,recipient_account_id.is.null)');

  const { data, error } = await client
    .from('vcontent_notifications')
    .select('*')
    .or(filters.join(','))
    .order('created_at', { ascending: false })
    .limit(50);

  if (!error) return filterNotificationsByTaskAssignee(client, (data || []) as NotificationRow[], recipient);
  const message = error instanceof Error ? error.message : String(error || '');
  if (isMissingColumnError(error) || /parse|logic tree/i.test(message)) return listNotificationsUnscoped();
  throw error;
}

async function filterNotificationsByTaskAssignee(
  client: ReturnType<typeof requireSupabase>,
  rows: NotificationRow[],
  recipient: { profileId: string | null; accountId: string | null },
) {
  const scopedRows = rows.filter((item) => item.recipient_profile_id || item.recipient_account_id);
  const taskIds = [...new Set(scopedRows.map((item) => String(item.metadata?.task_id || '')).filter(Boolean))];
  const productStageKeys = [
    ...new Set(
      scopedRows
        .map((item) => {
          const productId = String(item.metadata?.product_id || '');
          const stageIndex = item.metadata?.stage_index;
          return productId && Number.isInteger(Number(stageIndex)) ? `${productId}::${Number(stageIndex)}` : '';
        })
        .filter(Boolean),
    ),
  ];

  if (!taskIds.length && !productStageKeys.length) return rows;

  const taskById = new Map<string, TaskRow>();
  const taskByProductStage = new Map<string, TaskRow>();

  if (taskIds.length) {
    const { data } = await client.from('vcontent_tasks').select(TASK_SELECT).in('id', taskIds);
    for (const task of normalizeTaskRows(data || [])) {
      taskById.set(task.id, task);
      taskByProductStage.set(`${task.product_id}::${task.stage_index}`, task);
    }
  }

  const missingProductIds = [
    ...new Set(
      productStageKeys
        .filter((key) => !taskByProductStage.has(key))
        .map((key) => key.split('::')[0])
        .filter(Boolean),
    ),
  ];
  if (missingProductIds.length) {
    const { data } = await client.from('vcontent_tasks').select(TASK_SELECT).in('product_id', missingProductIds).eq('archived', false);
    for (const task of normalizeTaskRows(data || [])) {
      taskById.set(task.id, task);
      taskByProductStage.set(`${task.product_id}::${task.stage_index}`, task);
    }
  }

  return rows.filter((item) => {
    if (
      (recipient.profileId && item.recipient_profile_id === recipient.profileId) ||
      (recipient.accountId && item.recipient_account_id === recipient.accountId)
    ) {
      return true;
    }
    const metadata = item.metadata || {};
    const task =
      taskById.get(String(metadata.task_id || '')) ||
      taskByProductStage.get(`${String(metadata.product_id || '')}::${Number(metadata.stage_index)}`);
    if (!task || (!task.assignee_profile_id && !task.assignee_account_id)) return true;
    return Boolean(
      (recipient.profileId && task.assignee_profile_id === recipient.profileId) ||
      (recipient.accountId && task.assignee_account_id === recipient.accountId),
    );
  });
}

export async function markNotificationRead(notificationId: string) {
  const client = requireSupabase();
  const readAt = new Date().toISOString();
  const { error } = await client
    .from('vcontent_notifications')
    .update({ read_at: readAt })
    .eq('id', notificationId);

  if (error) throw error;
  return { id: notificationId, read_at: readAt };
}

export async function markAllNotificationsRead() {
  const client = requireSupabase();
  const recipient = await getCurrentNotificationRecipient();
  const filters = [];
  if (recipient.profileId) filters.push(`recipient_profile_id.eq.${recipient.profileId}`);
  if (recipient.accountId) filters.push(`recipient_account_id.eq.${recipient.accountId}`);
  if (!filters.length) filters.push('and(recipient_profile_id.is.null,recipient_account_id.is.null)');
  const readAt = new Date().toISOString();
  const { error } = await client
    .from('vcontent_notifications')
    .update({ read_at: readAt })
    .is('read_at', null)
    .or(filters.join(','));

  if (error) throw error;
  return { read_at: readAt };
}

export async function createNotification(input: {
  title: string;
  body: string;
  level?: 'info' | 'warning' | 'danger' | 'success';
  linkPage?: string | null;
  recipientProfileId?: string | null;
  recipientAccountId?: string | null;
  eventKey?: string | null;
  metadata?: Record<string, unknown>;
  sendEmail?: boolean;
}) {
  const client = requireSupabase();
  if (input.eventKey && (input.recipientProfileId || input.recipientAccountId)) {
    let existingQuery = client
      .from('vcontent_notifications')
      .select('*')
      .eq('event_key', input.eventKey)
      .limit(1);
    if (input.recipientProfileId) {
      existingQuery = existingQuery.eq('recipient_profile_id', input.recipientProfileId);
    } else {
      existingQuery = existingQuery.is('recipient_profile_id', null);
    }
    if (input.recipientAccountId) {
      existingQuery = existingQuery.eq('recipient_account_id', input.recipientAccountId);
    } else {
      existingQuery = existingQuery.is('recipient_account_id', null);
    }
    const { data: existingRows, error: existingError } = await existingQuery;
    if (!existingError && existingRows?.[0]) return existingRows[0] as NotificationRow;
  }
  const payload = {
    id: `NOTI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    level: input.level || 'info',
    title: input.title,
    body: input.body,
    link_page: input.linkPage || null,
    recipient_profile_id: input.recipientProfileId || null,
    recipient_account_id: input.recipientAccountId || null,
    event_key: input.eventKey || null,
    metadata: input.metadata || {},
    email_status: input.sendEmail === false ? 'skipped' : 'pending',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('vcontent_notifications')
    .insert(payload)
    .select('*')
    .single();

  if (!error) {
    const notification = data as NotificationRow;
    if (input.sendEmail !== false && (input.recipientProfileId || input.recipientAccountId)) {
      runOptionalNoticeDispatch({
        eventType: 'manual_notification',
        title: input.title,
        body: input.body,
        level: input.level || 'info',
        linkPage: input.linkPage || null,
        recipientProfileId: input.recipientProfileId || null,
        recipientAccountId: input.recipientAccountId || null,
        notificationId: notification.id,
        persistInApp: false,
        eventKey: input.eventKey || notification.id,
        metadata: input.metadata || {},
      });
    }
    return notification;
  }

  const fallbackPayload = {
    id: payload.id,
    level: payload.level,
    title: payload.title,
    body: payload.body,
    link_page: payload.link_page,
    recipient_profile_id: payload.recipient_profile_id,
    recipient_account_id: payload.recipient_account_id,
    created_at: payload.created_at,
  };
  let fallback = await client.from('vcontent_notifications').insert(fallbackPayload).select('*').single();
  if (fallback.error && isMissingColumnError(fallback.error)) {
    const minimalPayload = {
      id: payload.id,
      level: payload.level,
      title: payload.title,
      body: payload.body,
      link_page: payload.link_page,
      created_at: payload.created_at,
    };
    fallback = await client.from('vcontent_notifications').insert(minimalPayload).select('*').single();
  }
  if (fallback.error) throw fallback.error;
  const notification = fallback.data as NotificationRow;
  if (input.sendEmail !== false && (input.recipientProfileId || input.recipientAccountId)) {
    runOptionalNoticeDispatch({
      eventType: 'manual_notification',
      title: input.title,
      body: input.body,
      level: input.level || 'info',
      linkPage: input.linkPage || null,
      recipientProfileId: input.recipientProfileId || null,
      recipientAccountId: input.recipientAccountId || null,
      notificationId: notification.id,
      persistInApp: false,
      eventKey: input.eventKey || notification.id,
      metadata: input.metadata || {},
    });
  }
  return notification;
}

export async function listActivityLogs(options?: { actionTypes?: string[]; limit?: number }) {
  const client = requireSupabase();
  let query = client
    .from('vcontent_activity_logs')
    .select(ACTIVITY_LOG_SELECT)
    .order('happened_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (options?.actionTypes?.length) {
    query = query.in('action_type', options.actionTypes);
  }

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data || []) as any[]).map((item) => ({
    ...item,
    metadata: item.metadata && typeof item.metadata === 'object' ? item.metadata : {},
  })) as ActivityLogRow[];
}

export async function listProfiles() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_profiles')
    .select('id,email,full_name,role,company_id,organization_id,title,active,access_scope,auth_user_id,student_class,student_group,student_code')
    .order('full_name', { ascending: true });

  const directProfiles = data || [];

  try {
    const payload = await requestAppApi('/api/profiles-list');
    const apiProfiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
    if (apiProfiles.length > directProfiles.length) return apiProfiles;
  } catch {
    // Keep the direct Supabase result for roles that are intentionally scoped by RLS.
  }

  if (error) throw error;
  return directProfiles;
}

export async function listAccountManagerRecords() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_account_manager_records')
    .select('id,tt,website,purpose,account,password,renew_month,renew_year,payment_method,payment_deadline,sort_index,created_at,updated_at')
    .order('sort_index', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []) as AccountManagerRecordRow[];
}

export async function replaceAccountManagerRecords(input: AccountManagerRecordInput[]) {
  const client = requireSupabase();
  const table = 'vcontent_account_manager_records';
  const nowIso = new Date().toISOString();
  const normalized = input.map((item, index) => ({
    id: String(item.id || '').trim() || `acc-${index + 1}`,
    tt: String(item.tt || '').trim(),
    website: String(item.website || '').trim(),
    purpose: String(item.purpose || '').trim(),
    account: String(item.account || '').trim(),
    password: String(item.password || '').trim(),
    renew_month: String(item.renewMonth || '').trim(),
    renew_year: String(item.renewYear || '').trim(),
    payment_method: String(item.paymentMethod || '').trim(),
    payment_deadline: String(item.paymentDeadline || '').trim(),
    sort_index: Number.isFinite(item.sortIndex) ? Math.max(0, Math.floor(item.sortIndex)) : index + 1,
    updated_at: nowIso,
  }));

  const { data: existingRows, error: existingError } = await client.from(table).select('id');
  if (existingError) throw existingError;

  if (normalized.length) {
    const { error: upsertError } = await client.from(table).upsert(normalized, { onConflict: 'id' });
    if (upsertError) throw upsertError;
  }

  const keepIds = new Set(normalized.map((item) => item.id));
  const deleteIds = (existingRows || [])
    .map((item: { id?: string }) => String(item.id || '').trim())
    .filter((id) => id && !keepIds.has(id));

  if (deleteIds.length) {
    const { error: deleteError } = await client.from(table).delete().in('id', deleteIds);
    if (deleteError) throw deleteError;
  }
}

function normalizeTodayTodoSections(value: unknown): TodayTodoSectionPayload[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const section = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      id: String(section.id || `section-${index + 1}`),
      title: String(section.title || ''),
    };
  });
}

function normalizeTodayTodoItems(value: unknown): TodayTodoItemPayload[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const todo = item && typeof item === 'object' ? item as Record<string, unknown> : {};
    return {
      id: String(todo.id || `todo-${index + 1}`),
      sectionId: String(todo.sectionId || ''),
      title: String(todo.title || ''),
      note: String(todo.note || ''),
      done: Boolean(todo.done),
    };
  });
}

function normalizeTodayTodoRow(row: any): TodayTodoListRow {
  return {
    ...row,
    sections: normalizeTodayTodoSections(row?.sections),
    items: normalizeTodayTodoItems(row?.items),
  } as TodayTodoListRow;
}

export async function getTodayTodoList(accountProfileId: string, dateKey: string): Promise<TodayTodoListRow | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_today_todo_lists')
    .select('id,account_profile_id,date_key,sections,items,created_at,updated_at')
    .eq('account_profile_id', accountProfileId)
    .eq('date_key', dateKey)
    .maybeSingle();

  if (error) throw error;
  return data ? normalizeTodayTodoRow(data) : null;
}

export async function upsertTodayTodoList(input: {
  accountProfileId: string;
  dateKey: string;
  sections: TodayTodoSectionPayload[];
  items: TodayTodoItemPayload[];
}): Promise<TodayTodoListRow> {
  const client = requireSupabase();
  const id = `${input.accountProfileId}:${input.dateKey}`;
  const payload = {
    id,
    account_profile_id: input.accountProfileId,
    date_key: input.dateKey,
    sections: normalizeTodayTodoSections(input.sections),
    items: normalizeTodayTodoItems(input.items),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await client
    .from('vcontent_today_todo_lists')
    .upsert(payload, { onConflict: 'account_profile_id,date_key' })
    .select('id,account_profile_id,date_key,sections,items,created_at,updated_at')
    .single();

  if (error) throw error;
  return normalizeTodayTodoRow(data);
}

export async function listOrganizations() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_organizations')
    .select('id,name')
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function listCompanies() {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_companies')
    .select('id,name,organization_id')
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

type CreateClientOrderInput = {
  title: string;
  deadline: string;
  client: string;
  companyId: string | null;
  createdByProfileId: string;
  bundleCounts: OrderBundleCounts;
  products?: ManualOrderProductInput[];
  plannedProductCount?: number;
  intakeNote?: string;
  status?: string;
  orderMeta?: Record<string, unknown>;
};

async function createClientOrderDirect(input: CreateClientOrderInput) {
  const client = requireSupabase();
  const orderId = await getNextClientOrderId();
  const manualProducts = (input.products || [])
    .map((product) => ({
      module: product.module,
      kind: product.kind,
      code: String(product.code || '').trim(),
      name: String(product.name || '').trim(),
    }))
    .filter((product) => product.name);
  const bundleCounts = manualProducts.length
    ? manualProducts.reduce(
        (acc, product) => {
          if (product.module === 'VIDEO') acc.video += 1;
          else if (product.module === 'GAME') acc.game += 1;
          else acc.eln += 1;
          return acc;
        },
        { eln: 0, video: 0, game: 0 },
      )
    : {
        eln: clampBundleCount(input.bundleCounts.eln),
        video: clampBundleCount(input.bundleCounts.video),
        game: clampBundleCount(input.bundleCounts.game),
      };
  const totalProducts = bundleCounts.eln + bundleCounts.video + bundleCounts.game;
  const submittedAt = input.status === 'submitted' ? new Date().toISOString() : null;
  const plannedProductCount = Math.max(0, Math.floor(Number(input.plannedProductCount || totalProducts || 0)));
  const inferredOrderType = String(input.orderMeta?.order_type || inferOrderTypeFromBundleCounts(bundleCounts));
  const requestedDisplayOrderCode = normalizeDisplayOrderCode(String(input.orderMeta?.display_order_code || ''));
  const orderMeta = {
    ...(input.orderMeta || {}),
    display_order_code:
      requestedDisplayOrderCode ||
      buildDisplayOrderCode({
        client: input.client,
        projectCode: String(input.orderMeta?.project_code || ''),
        orderType: inferredOrderType,
        fallbackOrderId: orderId,
      }),
    total_products: plannedProductCount,
  };
  const effectiveBundleCounts =
    totalProducts > 0
      ? bundleCounts
      : inferredOrderType === 'H'
        ? { eln: 0, video: plannedProductCount, game: 0 }
        : inferredOrderType === 'G'
          ? { eln: 0, video: 0, game: plannedProductCount }
          : { eln: plannedProductCount, video: 0, game: 0 };

  const orderPayload = {
    id: orderId,
    client: input.client,
    company_id: input.companyId,
    title: input.title,
    module: plannedProductCount > 0 ? getOrderModuleLabel(effectiveBundleCounts) : getOrderModuleLabelFromType(inferredOrderType),
    deadline: input.deadline,
    status: input.status || 'draft',
    submitted_at: submittedAt,
    launched_at: null,
    assignees: {},
    created_by_profile_id: input.createdByProfileId,
    intake_note: input.intakeNote || '',
    rejection_reason: '',
    change_request_reason: '',
    stage_sla_overrides: { order_meta: orderMeta },
  };

  const productPayload = manualProducts.length
    ? buildManualProductPayload(orderId, input.title, manualProducts)
    : totalProducts > 0
      ? buildProductBundlePayload(orderId, input.title, bundleCounts)
      : buildPlannedProductPayload({
          orderId,
          title: input.title,
          plannedProductCount,
          displayOrderCode: String(orderMeta.display_order_code || orderId),
        });

  const { error: orderError } = await client.from('vcontent_orders').insert(orderPayload);
  if (orderError) throw orderError;

  if (productPayload.length) {
    const { error: productError } = await client.from('vcontent_products').insert(productPayload);
    if (productError) throw productError;
    await ensureWorkflowTasksForProducts({
      orderId,
      products: productPayload.map((item) => ({ id: item.id })),
      fallbackModule: orderPayload.module,
      dueDate: input.deadline || null,
    });
  }

  return {
    orderId,
    orderModule: orderPayload.module,
    productIds: productPayload.map((item) => item.id),
    bundleCounts: effectiveBundleCounts,
    displayOrderCode: String(orderMeta.display_order_code || orderId),
    productCount: productPayload.length,
  };
}

export async function createClientOrder(input: CreateClientOrderInput) {
  let result: Awaited<ReturnType<typeof createClientOrderDirect>>;
  try {
    const payload = await requestAppApi('/api/order-create', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    result = (payload as { result: Awaited<ReturnType<typeof createClientOrderDirect>> }).result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (!/not configured|HTTP 404|HTTP 405/i.test(message)) throw error;
    result = await createClientOrderDirect(input);
  }
  await notifyProductionManagersOrderCreated({
    orderId: result.orderId,
    title: input.title,
    client: input.client,
    module: result.orderModule,
    deadline: input.deadline,
    displayOrderCode: result.displayOrderCode,
    productCount: result.productCount || result.productIds.length,
    actorProfileId: input.createdByProfileId,
  });
  return result;
}

export async function createImportedOrders(input: { orders: ImportedOrderSeed[] }) {
  const client = requireSupabase();
  const orders = input.orders.filter((order) => order.products.length > 0);
  if (!orders.length) {
    throw new Error('Kh?ng c? ??n h?ng h?p l? ?? nh?p.');
  }

  const { data: existingOrders, error: existingOrdersError } = await client
    .from('vcontent_orders')
    .select('id')
    .order('created_at', { ascending: false })
    .limit(500);
  if (existingOrdersError) throw existingOrdersError;

  const numericIds = (existingOrders || [])
    .map((item: { id: string }) => /^ord-(\d{4})$/i.exec(String(item.id || '').trim()))
    .filter(Boolean)
    .map((match) => Number(match?.[1] || 0));

  let nextNumber = (numericIds.length ? Math.max(...numericIds) : 0) + 1;
  const createdOrders: Array<{ orderId: string; productIds: string[]; title: string; displayOrderCode: string }> = [];

  for (const order of orders) {
    const orderId = `ord-${String(nextNumber).padStart(4, '0')}`;
    nextNumber += 1;

    const bundleCounts = order.products.reduce(
      (acc, product) => {
        if (product.module === 'ELN') acc.eln += 1;
        if (product.module === 'VIDEO') acc.video += 1;
        if (product.module === 'GAME') acc.game += 1;
        return acc;
      },
      { eln: 0, video: 0, game: 0 },
    );

    const orderPayload = {
      id: orderId,
      client: order.client,
      company_id: order.companyId,
      title: order.title,
      module: getOrderModuleLabel(bundleCounts),
      deadline: order.deadline,
      status: order.status || 'submitted',
      submitted_at: order.status === 'draft' ? null : new Date().toISOString(),
      launched_at: null,
      assignees: {},
      created_by_profile_id: order.createdByProfileId,
      intake_note: order.intakeNote || '',
      rejection_reason: '',
      change_request_reason: '',
      stage_sla_overrides: {
        order_meta: {
          display_order_code: buildDisplayOrderCode({
            client: order.client,
            orderType: inferOrderTypeFromBundleCounts(bundleCounts),
            fallbackOrderId: orderId,
          }),
          order_type: inferOrderTypeFromBundleCounts(bundleCounts),
        },
      },
    };

    const productPayload = buildImportedProductPayload(orderId, order.title, order.products);

    const { error: orderError } = await client.from('vcontent_orders').insert(orderPayload);
    if (orderError) throw orderError;

    const { error: productError } = await client.from('vcontent_products').insert(productPayload);
    if (productError) throw productError;
    await ensureWorkflowTasksForProducts({
      orderId,
      products: productPayload.map((item) => ({ id: item.id })),
      fallbackModule: orderPayload.module,
      dueDate: order.deadline || null,
    });
    const displayOrderCode = String(orderPayload.stage_sla_overrides.order_meta.display_order_code || orderId);
    await notifyProductionManagersOrderCreated({
      orderId,
      title: order.title,
      client: order.client,
      module: orderPayload.module,
      deadline: order.deadline,
      displayOrderCode,
      productCount: productPayload.length,
      actorProfileId: order.createdByProfileId,
    });

    createdOrders.push({
      orderId,
      title: order.title,
      displayOrderCode,
      productIds: productPayload.map((product) => product.id),
    });
  }

  return {
    orderCount: createdOrders.length,
    productCount: createdOrders.reduce((sum, order) => sum + order.productIds.length, 0),
    createdOrders,
  };
}

export async function createProfile(input: {
  fullName: string;
  email: string;
  role: string;
  organizationId: string | null;
  companyId: string | null;
  title: string | null;
  accessScope: string;
  studentClass?: string | null;
  studentGroup?: string | null;
  studentCode?: string | null;
}) {
  const token = await getAccessToken();
  const response = await fetch('/api/admin-create-profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const rawText = await response.text();
  let payload: any = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch {
    payload = { rawText };
  }

  if (!response.ok || payload?.ok === false) {
    const detail =
      payload?.error ||
      payload?.message ||
      payload?.rawText ||
      `HTTP ${response.status}`;
  throw new Error(`Kh?ng t?o ???c h? s?. ${detail}`);
  }
  return String(payload?.profile?.id || '');
}

export async function createTasksForLaunch(input: {
  orderId: string;
  products: ProductRow[];
  dueDate: string | null;
}) {
  const client = requireSupabase();
  const payload = input.products.map((product, index) => ({
    id: `TASK-${Date.now()}-${index + 1}`,
    order_id: input.orderId,
    product_id: product.id,
    stage_index: product.current_stage_index || 0,
    status: 'todo',
    progress: 0,
    due_date: input.dueDate,
    assignee: null,
    archived: false,
  }));

  if (!payload.length) return [];
  const { error } = await client.from('vcontent_tasks').insert(payload);
  if (error) throw error;
  await refreshOrderStatusProjection(input.orderId);
  return payload;
}

export async function ensureWorkflowTasksForProducts(input: {
  orderId: string;
  products: Array<{ id: string }>;
  fallbackModule?: string | null;
  dueDate?: string | null;
}) {
  const client = requireSupabase();
  const { data: existingRows, error: existingError } = await client
    .from('vcontent_tasks')
    .select('product_id,stage_index,archived')
    .eq('order_id', input.orderId);
  if (existingError) throw existingError;

  const existingKeys = new Set(
    (existingRows || [])
      .filter((row: any) => !row.archived)
      .map((row: any) => `${row.product_id}::${Number(row.stage_index)}`),
  );

  let counter = 0;
  const payload = input.products.flatMap((product) => {
    const module = inferProductWorkflowModule(product.id, input.fallbackModule);
    return getWorkflowStageIndicesByModule(module)
      .filter((stageIndex) => !existingKeys.has(`${product.id}::${stageIndex}`))
      .map((stageIndex) => {
        counter += 1;
        return {
          id: `TASK-${Date.now()}-${counter}`,
          order_id: input.orderId,
          product_id: product.id,
          stage_index: stageIndex,
          status: 'todo',
          progress: 0,
          due_date: input.dueDate || null,
          assignee: null,
          assignee_profile_id: null,
          assignee_account_id: null,
          archived: false,
        };
      });
  });

  if (!payload.length) return [];
  const { error } = await client.from('vcontent_tasks').insert(payload);
  if (!error) {
    await refreshOrderStatusProjection(input.orderId);
    return payload;
  }
  if (!isMissingColumnError(error)) throw error;

  const legacyPayload = payload.map((item) => ({
    id: item.id,
    order_id: item.order_id,
    product_id: item.product_id,
    stage_index: item.stage_index,
    status: item.status,
    progress: item.progress,
    due_date: item.due_date,
    assignee: item.assignee,
    archived: item.archived,
  }));
  const legacyResult = await client.from('vcontent_tasks').insert(legacyPayload);
  if (legacyResult.error) throw legacyResult.error;
  await refreshOrderStatusProjection(input.orderId);
  return payload;
}

type CreateOrderProductInput = {
  orderId: string;
  productCode: string;
  productName: string;
  fallbackModule?: string | null;
  dueDate?: string | null;
  ownerProfileId?: string | null;
};

function normalizeDateOnly(value: string | null | undefined) {
  return String(value || '').slice(0, 10);
}

function isDateAfter(value: string | null | undefined, maxValue: string | null | undefined) {
  const normalizedValue = normalizeDateOnly(value);
  const normalizedMaxValue = normalizeDateOnly(maxValue);
  if (!normalizedValue || !normalizedMaxValue) return false;
  return normalizedValue > normalizedMaxValue;
}

async function createOrderProductDirect(input: CreateOrderProductInput) {
  const client = requireSupabase();
  const normalizedCode = normalizeOrderCodeFragment(input.productCode || '');
  const normalizedName = String(input.productName || '').normalize('NFC').trim();

  if (!String(input.orderId || '').trim()) {
    throw new Error('Không tìm thấy đơn hàng để tạo sản phẩm.');
  }
  if (!normalizedCode) {
    throw new Error('Vui lòng nhập mã sản phẩm.');
  }
  if (!normalizedName) {
    throw new Error('Vui lòng nhập tên sản phẩm.');
  }

  const { data: orderRows, error: orderError } = await client
    .from('vcontent_orders')
    .select('deadline')
    .eq('id', input.orderId)
    .limit(1);
  if (orderError) throw orderError;
  const orderDeadline = Array.isArray(orderRows) && orderRows[0] ? orderRows[0].deadline : null;
  if (isDateAfter(input.dueDate, orderDeadline)) {
    throw new Error('Deadline sản phẩm không được sau deadline của đơn hàng.');
  }

  const productId = `${input.orderId}-${normalizedCode.toLowerCase()}`;
  const module = inferProductWorkflowModule(productId, input.fallbackModule);

  const { data: existing, error: existingError } = await client
    .from('vcontent_products')
    .select('id')
    .eq('id', productId)
    .limit(1);
  if (existingError) throw existingError;
  if (Array.isArray(existing) && existing.length) {
    throw new Error('Mã sản phẩm đã tồn tại trong đơn hàng này.');
  }

  const payload = {
    id: productId,
    order_id: input.orderId,
    name: normalizedName,
    current_stage_index: 0,
    progress: 0,
    ready_for_delivery: false,
    finished: false,
    delivered_at: null,
  };

  const { error } = await client.from('vcontent_products').insert(payload);
  if (error) throw error;

  await ensureWorkflowTasksForProducts({
    orderId: input.orderId,
    products: [{ id: productId }],
    fallbackModule: module,
    dueDate: input.dueDate || null,
  });

  const existingItems = await listInputItems({
    orderId: input.orderId,
    productId,
    module,
  });

  await ensureInputItemsForProduct({
    orderId: input.orderId,
    productId,
    module,
    existingItems,
    ownerProfileId: input.ownerProfileId || null,
  });

  if (module === 'GAME') {
    await ensureGameBriefConfigItem({
      orderId: input.orderId,
      productId,
      existingItems,
      ownerProfileId: input.ownerProfileId || null,
    });
  }

  await refreshOrderStatusProjection(input.orderId);
  return payload as ProductRow;
}

export async function createOrderProduct(input: CreateOrderProductInput) {
  try {
    const payload = await requestAppApi('/api/product-create', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return (payload as { product: ProductRow }).product;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (!/not configured|HTTP 404|HTTP 405/i.test(message)) throw error;
    return createOrderProductDirect(input);
  }
}

async function selectDirectIds(table: string, column: string, filterColumn: string, filterValue: string) {
  const client = requireSupabase();
  const { data, error } = await client.from(table).select(column).eq(filterColumn, filterValue);
  if (error) throw error;
  return [...new Set((data || []).map((row: any) => String(row?.[column] || '').trim()).filter(Boolean))];
}

async function deleteDirectByEq(table: string, column: string, value: string) {
  if (!value) return;
  const client = requireSupabase();
  const { error } = await client.from(table).delete().eq(column, value);
  if (error) throw error;
}

async function deleteDirectByIn(table: string, column: string, values: string[]) {
  const ids = [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!ids.length) return;
  const client = requireSupabase();
  const { error } = await client.from(table).delete().in(column, ids);
  if (error) throw error;
}

function pruneDeletedProductOverrides(overrides: Record<string, unknown> | null | undefined, productId: string) {
  const next = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? { ...overrides } : {};

  if (next.production_plan_products && typeof next.production_plan_products === 'object' && !Array.isArray(next.production_plan_products)) {
    const productPlans = { ...(next.production_plan_products as Record<string, unknown>) };
    delete productPlans[productId];
    next.production_plan_products = productPlans;
  }

  if (next.tracking_assignments && typeof next.tracking_assignments === 'object' && !Array.isArray(next.tracking_assignments)) {
    const assignments: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(next.tracking_assignments as Record<string, unknown>)) {
      const assignment = value && typeof value === 'object' ? (value as { productId?: unknown }) : {};
      if (assignment.productId === productId || key.startsWith(`${productId}::`)) continue;
      assignments[key] = value;
    }
    next.tracking_assignments = assignments;
  }

  return next;
}

async function pruneDeletedProductFromOrder(orderId: string | null | undefined, productId: string) {
  if (!orderId) return;
  const client = requireSupabase();
  const { data, error } = await client.from('vcontent_orders').select('id,stage_sla_overrides').eq('id', orderId).limit(1);
  if (error) throw error;
  const order = (data || [])[0] as Pick<OrderRow, 'stage_sla_overrides'> | undefined;
  if (!order) return;

  const { error: updateError } = await client
    .from('vcontent_orders')
    .update({ stage_sla_overrides: pruneDeletedProductOverrides(order.stage_sla_overrides, productId) })
    .eq('id', orderId);
  if (updateError) throw updateError;
}

async function deleteProductCascadeDirect(productId: string, orderId?: string | null) {
  const storyboards = await selectDirectIds('vcontent_storyboards', 'id', 'product_id', productId);
  const slideDesigns = await selectDirectIds('vcontent_slide_designs', 'id', 'product_id', productId);
  const voiceOvers = await selectDirectIds('vcontent_voice_overs', 'id', 'product_id', productId);
  const videoEdits = await selectDirectIds('vcontent_video_edits', 'id', 'product_id', productId);
  const scormPackages = await selectDirectIds('vcontent_scorm_packages', 'id', 'product_id', productId);

  await deleteDirectByIn('vcontent_storyboard_reviews', 'storyboard_id', storyboards);
  await deleteDirectByIn('vcontent_slide_design_reviews', 'slide_design_id', slideDesigns);
  await deleteDirectByIn('vcontent_voice_reviews', 'voice_over_id', voiceOvers);
  await deleteDirectByIn('vcontent_video_reviews', 'video_edit_id', videoEdits);
  await deleteDirectByIn('vcontent_scorm_reviews', 'scorm_package_id', scormPackages);

  await deleteDirectByEq('vcontent_storyboards', 'product_id', productId);
  await deleteDirectByEq('vcontent_slide_designs', 'product_id', productId);
  await deleteDirectByEq('vcontent_voice_overs', 'product_id', productId);
  await deleteDirectByEq('vcontent_video_edits', 'product_id', productId);
  await deleteDirectByEq('vcontent_scorm_packages', 'product_id', productId);
  await deleteDirectByEq('vcontent_input_items', 'product_id', productId);
  await deleteDirectByEq('vcontent_tasks', 'product_id', productId);
  await deleteDirectByEq('vcontent_products', 'id', productId);
  await pruneDeletedProductFromOrder(orderId, productId);
}

export async function deleteOrderProduct(input: { orderId?: string | null; productId: string }) {
  try {
    await requestAppApi('/api/product-delete', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    if (input.orderId) {
      await refreshOrderStatusProjection(input.orderId);
    }
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (!/not configured|HTTP 404|HTTP 405/i.test(message)) throw error;
  }

  await deleteProductCascadeDirect(input.productId, input.orderId);
  if (input.orderId) {
    await refreshOrderStatusProjection(input.orderId);
  }
}

export async function createTask(input: {
  orderId: string;
  productId: string;
  stageIndex: number;
  dueDate?: string | null;
  assignee?: string | null;
  assigneeProfileId?: string | null;
  assigneeAccountId?: string | null;
  status?: string;
  progress?: number;
  notifyAssignment?: boolean;
}) {
  const client = requireSupabase();
  const payload = {
    id: `TASK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    order_id: input.orderId,
    product_id: input.productId,
    stage_index: input.stageIndex,
    status: input.status || 'todo',
    progress: input.progress ?? 0,
    due_date: input.dueDate || null,
    assignee: input.assignee || null,
    assignee_profile_id: input.assigneeProfileId || null,
    assignee_account_id: input.assigneeAccountId || null,
    archived: false,
  };
  const { error } = await client.from('vcontent_tasks').insert(payload);
  if (!error) {
    await refreshOrderStatusProjection(input.orderId);
    if (input.notifyAssignment !== false && (payload.assignee_profile_id || payload.assignee_account_id)) {
      runOptionalNoticeDispatch({
        eventType: 'task_assigned',
        objectType: 'task',
        objectId: payload.id,
        title: 'Bạn được giao công đoạn mới',
        summary: `${payload.product_id} được phân công công đoạn ${payload.stage_index + 1}.`,
        level: 'warning',
        recipientProfileId: payload.assignee_profile_id,
        recipientAccountId: payload.assignee_account_id,
        eventKey: `${payload.id}:assigned`,
        metadata: {
          order_id: payload.order_id,
          product_id: payload.product_id,
          task_id: payload.id,
          stage_index: payload.stage_index,
          assignee_profile_id: payload.assignee_profile_id,
          assignee_account_id: payload.assignee_account_id,
          status: payload.status,
        },
      });
    }
    return payload;
  }
  if (isPolicyError(error)) {
    const ensured = await requestAppApi('/api/task-ensure', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    const task = (ensured as { task?: unknown }).task;
    if (!task) throw error;
    await refreshOrderStatusProjection(input.orderId);
    const ensuredTask = task as TaskRow;
    if (input.notifyAssignment !== false && (ensuredTask.assignee_profile_id || ensuredTask.assignee_account_id)) {
      runOptionalNoticeDispatch({
        eventType: 'task_assigned',
        objectType: 'task',
        objectId: ensuredTask.id,
        title: 'Bạn được giao công đoạn mới',
        summary: `${ensuredTask.product_id} được phân công công đoạn ${ensuredTask.stage_index + 1}.`,
        level: 'warning',
        recipientProfileId: ensuredTask.assignee_profile_id || null,
        recipientAccountId: ensuredTask.assignee_account_id || null,
        eventKey: `${ensuredTask.id}:assigned`,
        metadata: {
          order_id: ensuredTask.order_id,
          product_id: ensuredTask.product_id,
          task_id: ensuredTask.id,
          stage_index: ensuredTask.stage_index,
          assignee_profile_id: ensuredTask.assignee_profile_id || null,
          assignee_account_id: ensuredTask.assignee_account_id || null,
          status: ensuredTask.status,
        },
      });
    }
    return ensuredTask;
  }
  if (!isMissingColumnError(error)) throw error;

  const legacyPayload = {
    id: payload.id,
    order_id: payload.order_id,
    product_id: payload.product_id,
    stage_index: payload.stage_index,
    status: payload.status,
    progress: payload.progress,
    due_date: payload.due_date,
    assignee: payload.assignee,
    archived: payload.archived,
  };
  const legacyResult = await client.from('vcontent_tasks').insert(legacyPayload);
  if (legacyResult.error) {
    if (isPolicyError(legacyResult.error)) {
      const ensured = await requestAppApi('/api/task-ensure', {
        method: 'POST',
        body: JSON.stringify(input),
      });
      const task = (ensured as { task?: unknown }).task;
      if (!task) throw legacyResult.error;
      await refreshOrderStatusProjection(input.orderId);
      const ensuredTask = task as TaskRow;
      if (input.notifyAssignment !== false && (ensuredTask.assignee_profile_id || ensuredTask.assignee_account_id)) {
        runOptionalNoticeDispatch({
          eventType: 'task_assigned',
          objectType: 'task',
          objectId: ensuredTask.id,
          title: 'Bạn được giao công đoạn mới',
          summary: `${ensuredTask.product_id} được phân công công đoạn ${ensuredTask.stage_index + 1}.`,
          level: 'warning',
          recipientProfileId: ensuredTask.assignee_profile_id || null,
          recipientAccountId: ensuredTask.assignee_account_id || null,
          eventKey: `${ensuredTask.id}:assigned`,
          metadata: {
            order_id: ensuredTask.order_id,
            product_id: ensuredTask.product_id,
            task_id: ensuredTask.id,
            stage_index: ensuredTask.stage_index,
            assignee_profile_id: ensuredTask.assignee_profile_id || null,
            assignee_account_id: ensuredTask.assignee_account_id || null,
            status: ensuredTask.status,
          },
        });
      }
      return ensuredTask;
    }
    throw legacyResult.error;
  }
  await refreshOrderStatusProjection(input.orderId);
  if (input.notifyAssignment !== false && (payload.assignee_profile_id || payload.assignee_account_id)) {
    runOptionalNoticeDispatch({
      eventType: 'task_assigned',
      objectType: 'task',
      objectId: payload.id,
      title: 'Bạn được giao công đoạn mới',
      summary: `${payload.product_id} được phân công công đoạn ${payload.stage_index + 1}.`,
      level: 'warning',
      recipientProfileId: payload.assignee_profile_id,
      recipientAccountId: payload.assignee_account_id,
      eventKey: `${payload.id}:assigned`,
      metadata: {
        order_id: payload.order_id,
        product_id: payload.product_id,
        task_id: payload.id,
        stage_index: payload.stage_index,
        assignee_profile_id: payload.assignee_profile_id,
        assignee_account_id: payload.assignee_account_id,
        status: payload.status,
      },
    });
  }
  return payload;
}

export async function ensureInputItemsForProduct(input: {
  orderId: string;
  productId: string;
  module: 'ELN' | 'VIDEO' | 'GAME';
  existingItems: InputItemRow[];
  ownerProfileId?: string | null;
}) {
  const client = requireSupabase();
  const template = getInputTemplate(input.module);
  const existingForProduct = input.existingItems.filter((item) => item.order_id === input.orderId && item.product_id === input.productId);
  const templateByCode = new Map(template.map((item) => [item.code, item]));

  const stalePayload = existingForProduct
    .map((item) => {
      const templateItem = templateByCode.get(item.item_code);
      if (!templateItem) return null;
      if (
        item.label === templateItem.label &&
        item.item_type === templateItem.type &&
        item.required === templateItem.required &&
        item.module === input.module
      ) {
        return null;
      }
      return {
        id: item.id,
        label: templateItem.label,
        item_type: templateItem.type,
        required: templateItem.required,
        module: input.module,
      };
    })
    .filter(Boolean) as Array<{
    id: string;
    label: string;
    item_type: string;
    required: boolean;
    module: 'ELN' | 'VIDEO' | 'GAME';
  }>;

  if (stalePayload.length) {
    for (const payload of stalePayload) {
      const { error } = await client.from('vcontent_input_items').update(payload).eq('id', payload.id);
      if (error) throw error;
    }
  }

  const missingPayload = template
    .filter((templateItem) => !input.existingItems.some((item) => item.order_id === input.orderId && item.product_id === input.productId && item.item_code === templateItem.code))
    .map((templateItem) => ({
      id: `IN-${input.orderId}-${input.productId}-${templateItem.code}`,
      order_id: input.orderId,
      product_id: input.productId,
      module: input.module,
      item_code: templateItem.code,
      label: templateItem.label,
      item_type: templateItem.type,
      required: templateItem.required,
      status: 'changes_requested',
      file_name: null,
      file_url: null,
      notes: '\u0110ang ch\u1edd client/PM b\u1ed5 sung.',
      owner_profile_id: input.ownerProfileId || null,
      due_date: null,
    }));

  if (!missingPayload.length) return [];
  const { error } = await client.from('vcontent_input_items').insert(missingPayload);
  if (error) throw error;
  return missingPayload as InputItemRow[];
}

export async function ensureGameBriefConfigItem(input: {
  orderId: string;
  productId: string;
  existingItems: InputItemRow[];
  ownerProfileId?: string | null;
}) {
  const existing = input.existingItems.find(
    (item) => item.order_id === input.orderId && item.product_id === input.productId && item.module === 'GAME' && item.item_code === 'game_brief_config',
  );
  if (existing) return existing;

  const client = requireSupabase();
  const payload = {
    id: `IN-${input.orderId}-${input.productId}-game_brief_config`,
    order_id: input.orderId,
    product_id: input.productId,
    module: 'GAME',
    item_code: 'game_brief_config',
    label: 'Game brief config',
    item_type: 'config',
    required: true,
    status: 'submitted',
    file_name: null,
    file_url: null,
    notes: JSON.stringify(DEFAULT_GAME_BRIEF_CONFIG),
    owner_profile_id: input.ownerProfileId || null,
    due_date: null,
  };

  const { data, error } = await client.from('vcontent_input_items').insert(payload).select('*').single();
  if (error) throw error;
  return data as InputItemRow;
}

export async function saveGameBriefConfig(itemId: string, config: Partial<GameBriefConfig>) {
  const nextConfig = sanitizeGameBriefConfig(config);
  await updateInputItem(itemId, {
    notes: JSON.stringify(nextConfig),
    status: isGameBriefReady(nextConfig) ? 'approved' : 'submitted',
  });
  return nextConfig;
}

export async function ensureWorkflowRecord(input: {
  kind: WorkflowRecordKind;
  orderId: string;
  productId: string;
  title: string;
  profileId?: string | null;
}) {
  const client = requireSupabase();
  const tableByKind: Record<WorkflowRecordKind, string> = {
    storyboard: 'vcontent_storyboards',
    slide_design: 'vcontent_slide_designs',
    voice_over: 'vcontent_voice_overs',
    video_edit: 'vcontent_video_edits',
    scorm_package: 'vcontent_scorm_packages',
  };

  const { data: existing, error: readError } = await client
    .from(tableByKind[input.kind])
    .select('*')
    .eq('order_id', input.orderId)
    .eq('product_id', input.productId)
    .limit(1)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return existing;

  const baseId = `${input.orderId}::${input.productId}`;
  const common = {
    id: baseId,
    order_id: input.orderId,
    product_id: input.productId,
    title: input.title,
  };

  const payloadByKind: Record<WorkflowRecordKind, Record<string, unknown>> = {
    storyboard: {
      ...common,
      current_version: 1,
      total_scenes: 12,
      estimated_minutes: 24,
      status: 'todo',
      assignee_profile_id: input.profileId || null,
      reviewer_profile_id: null,
      due_date: null,
      submitted_at: null,
      approved_at: null,
      returned_at: null,
      file_name: null,
      notes: '',
    },
    slide_design: {
      ...common,
      current_version: 1,
      target_slides: 24,
      completed_slides: 0,
      status: 'todo',
      designer_profile_id: input.profileId || null,
      qc_reviewer_profile_id: null,
      due_date: null,
      submitted_at: null,
      approved_at: null,
      returned_at: null,
      file_name: null,
      brand_spec: '',
      notes: '',
      checklist: {},
    },
    voice_over: {
      ...common,
      current_version: 1,
      estimated_minutes: 18,
      recorded_minutes: 0,
      status: 'todo',
      talent_profile_id: input.profileId || null,
      handoff_profile_id: null,
      due_date: null,
      submitted_at: null,
      completed_at: null,
      returned_at: null,
      file_name: null,
      voice_style: '',
      notes: '',
      checklist: {},
    },
    video_edit: {
      ...common,
      current_version: 1,
      target_minutes: 18,
      render_progress: 0,
      status: 'todo',
      editor_profile_id: input.profileId || null,
      qc_reviewer_profile_id: null,
      due_date: null,
      submitted_at: null,
      approved_at: null,
      returned_at: null,
      file_name: null,
      subtitle_file: null,
      render_preset: '1080p',
      notes: '',
      checklist: {},
    },
    scorm_package: {
      ...common,
      current_version: 1,
      status: 'building_quiz',
      owner_profile_id: input.profileId || null,
      due_date: null,
      selected_question_ids: [],
      pass_score: 80,
      randomize_questions: true,
      completion_rule: 'watch_video_and_pass_quiz',
      manifest_status: 'draft',
      package_file_name: null,
      notes: '',
    },
  };

  const { data, error } = await client
    .from(tableByKind[input.kind])
    .insert(payloadByKind[input.kind])
    .select('*')
    .single();
  if (error) {
    if (!isPolicyError(error)) throw error;
    const payload = await requestAppApi('/api/workflow-record-ensure', {
      method: 'POST',
      body: JSON.stringify({
        kind: input.kind,
        orderId: input.orderId,
        productId: input.productId,
        title: input.title,
      }),
    });
    const record = (payload as { record?: unknown }).record;
    if (!record) throw error;
    return record;
  }
  return data;
}

export async function ensureTaskForStage(input: {
  orderId: string;
  productId: string;
  stageIndex: number;
  existingTasks: TaskRow[];
  dueDate?: string | null;
  assignee?: string | null;
  assigneeProfileId?: string | null;
  assigneeAccountId?: string | null;
  notifyAssignment?: boolean;
}) {
  const existing = input.existingTasks.find(
    (task) => task.order_id === input.orderId && task.product_id === input.productId && task.stage_index === input.stageIndex && !task.archived,
  );
  if (existing) return existing;
  return createTask(input);
}

export async function createDelivery(input: {
  sentByProfileId: string;
  note: string;
  documentName?: string;
  items: Array<{ orderId: string; productId: string; productName?: string }>;
}) {
  const client = requireSupabase();
  const deliveryId = `DEL-${Date.now()}`;
  const payload = {
    id: deliveryId,
    sent_at: new Date().toISOString().slice(0, 10),
    status: 'sent',
    note: input.note,
    document_name: input.documentName || null,
    sent_by_profile_id: input.sentByProfileId,
    items: input.items,
  };
  const { error } = await client.from('vcontent_deliveries').insert(payload);
  if (error) throw error;
  for (const item of input.items) {
    runOptionalNoticeDispatch({
      eventType: 'delivery_sent',
      objectType: 'delivery',
      objectId: deliveryId,
      actorProfileId: input.sentByProfileId,
      title: 'Da gui ban giao',
      body: `${item.productId}${item.productName ? ` - ${item.productName}` : ''} da duoc gui ban giao.`,
      level: 'success',
      linkPage: 'client-delivery',
      eventKey: `delivery:${deliveryId}:${item.productId}`,
      metadata: {
        order_id: item.orderId,
        product_id: item.productId,
        product_name: item.productName || null,
      },
    });
  }
  return deliveryId;
}

export async function createPaymentRequest(input: {
  orderId: string;
  deliveryId?: string | null;
  title: string;
  amount: number;
  dueDate: string;
  createdByProfileId: string;
  note?: string;
}) {
  const client = requireSupabase();
  const requestId = `PAY-${Date.now()}`;
  const payload = {
    id: requestId,
    order_id: input.orderId,
    delivery_id: input.deliveryId || null,
    title: input.title,
    amount: input.amount,
    currency: 'VND',
    due_date: input.dueDate,
    status: 'sent',
    sent_at: new Date().toISOString().slice(0, 10),
    created_by_profile_id: input.createdByProfileId,
    client_confirmed_at: null,
    note: input.note || '',
    receipt_required: true,
  };
  const { error } = await client.from('vcontent_payment_requests').insert(payload);
  if (error) throw error;
  runOptionalNoticeDispatch({
    eventType: 'payment_requested',
    objectType: 'payment_request',
    objectId: requestId,
    actorProfileId: input.createdByProfileId,
    title: 'Da tao de nghi thanh toan',
    body: `${input.title} - ${input.amount.toLocaleString('vi-VN')} VND. Han thanh toan: ${input.dueDate}.`,
    level: 'warning',
    linkPage: 'client-payment',
    eventKey: `payment-request:${requestId}`,
    metadata: {
      order_id: input.orderId,
      delivery_id: input.deliveryId || null,
      amount: input.amount,
      due_date: input.dueDate,
    },
  });
  return requestId;
}

export async function createPaymentReceipt(input: {
  paymentRequestId: string;
  orderId: string;
  amount: number;
  paidAt: string;
  note?: string;
  confirmedByProfileId: string;
}) {
  const client = requireSupabase();
  const receiptId = `REC-${Date.now()}`;
  const payload = {
    id: receiptId,
    payment_request_id: input.paymentRequestId,
    order_id: input.orderId,
    amount: input.amount,
    paid_at: input.paidAt,
    method: 'bank_transfer',
    receipt_file_name: null,
    note: input.note || '',
    confirmed_by_profile_id: input.confirmedByProfileId,
    confirmed_at: new Date().toISOString(),
  };
  const { error } = await client.from('vcontent_payment_receipts').insert(payload);
  if (error) throw error;
  await updatePaymentRequest(input.paymentRequestId, {
    status: 'paid',
    client_confirmed_at: new Date().toISOString(),
  });
  runOptionalNoticeDispatch({
    eventType: 'payment_confirmed',
    objectType: 'payment_receipt',
    objectId: receiptId,
    actorProfileId: input.confirmedByProfileId,
    title: 'Khach hang da xac nhan thanh toan',
    body: `Khoan thanh toan ${input.amount.toLocaleString('vi-VN')} VND da duoc xac nhan.`,
    level: 'success',
    linkPage: 'producer-invoice',
    eventKey: `payment-receipt:${receiptId}`,
    metadata: {
      order_id: input.orderId,
      payment_request_id: input.paymentRequestId,
      amount: input.amount,
      paid_at: input.paidAt,
    },
  });
  return receiptId;
}

export async function updateProfile(profileId: string, patch: Partial<ProfileRow>) {
  const client = requireSupabase();
  const { error } = await client
    .from('vcontent_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', profileId);
  if (error) throw error;
}

export async function listTrainingResourceDetails(profileIds: string[]) {
  const ids = [...new Set(profileIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) return [] as TrainingResourceDetailRow[];
  const client = requireSupabase();
  const { data, error } = await client
    .from('vcontent_training_resource_details')
    .select('profile_id,resource_kind,detail,updated_at')
    .in('profile_id', ids);
  if (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (/relation .*vcontent_training_resource_details|does not exist|schema cache/i.test(message)) return [];
    throw error;
  }
  return (data || []).map((row: any) => ({
    profile_id: String(row.profile_id || ''),
    resource_kind: row.resource_kind === 'collaborators' ? 'collaborators' : 'instructors',
    detail: row.detail && typeof row.detail === 'object' && !Array.isArray(row.detail) ? row.detail : {},
    updated_at: row.updated_at || null,
  })) as TrainingResourceDetailRow[];
}

export async function upsertTrainingResourceDetail(input: TrainingResourceDetailRow) {
  const client = requireSupabase();
  const payload = {
    profile_id: input.profile_id,
    resource_kind: input.resource_kind,
    detail: input.detail || {},
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client
    .from('vcontent_training_resource_details')
    .upsert(payload, { onConflict: 'profile_id' })
    .select('profile_id,resource_kind,detail,updated_at')
    .single();
  if (error) throw error;
  return data as TrainingResourceDetailRow;
}

export async function deleteProfile(profileId: string) {
  const client = requireSupabase();
  const { error } = await client
    .from('vcontent_profiles')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', profileId);
  if (error) throw error;
}

export async function updateProduct(productId: string, patch: Partial<ProductRow>) {
  const client = requireSupabase();
  const { data: existingRows, error: existingError } = await client.from('vcontent_products').select('order_id,current_stage_index').eq('id', productId).limit(1);
  if (existingError) throw existingError;
  const { error } = await client
    .from('vcontent_products')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', productId);
  if (error) throw error;
  const existing = (existingRows || [])[0] as { order_id?: string; current_stage_index?: number } | undefined;
  const orderId = String(existing?.order_id || '');
  if (orderId) await refreshOrderStatusProjection(orderId);
  const previousStageIndex = Number(existing?.current_stage_index);
  const nextStageIndex = Number(patch.current_stage_index);
  if (orderId && Number.isInteger(previousStageIndex) && Number.isInteger(nextStageIndex) && previousStageIndex !== nextStageIndex) {
    runOptionalNoticeDispatch({
      eventType: 'workflow_stage_changed',
      objectType: 'product',
      objectId: productId,
      eventKey: `product-stage:${productId}:${previousStageIndex}:${nextStageIndex}:${Date.now()}`,
      metadata: {
        order_id: orderId,
        product_id: productId,
        previous_stage_index: previousStageIndex,
        stage_index: nextStageIndex,
      },
    });
  }
}

export async function updateInputItem(itemId: string, patch: Partial<InputItemRow>) {
  const client = requireSupabase();
  const { data: existingRows, error: existingError } = await client
    .from('vcontent_input_items')
    .select('order_id,product_id,module,item_code,label,status,owner_profile_id')
    .eq('id', itemId)
    .limit(1);
  if (existingError) throw existingError;
  const { error } = await client
    .from('vcontent_input_items')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
  const existing = (existingRows || [])[0] as
    | { order_id?: string; product_id?: string; module?: string; item_code?: string; label?: string; status?: string; owner_profile_id?: string | null }
    | undefined;
  const orderId = String(existing?.order_id || '');
  if (orderId) await refreshOrderStatusProjection(orderId);
  const nextStatus = String(patch.status || '');
  const previousStatus = String(existing?.status || '');
  if (orderId && nextStatus && nextStatus !== previousStatus) {
    const eventType =
      nextStatus === 'approved'
        ? 'input_item_approved'
        : nextStatus === 'changes_requested'
          ? 'input_item_changes_requested'
          : nextStatus === 'submitted'
            ? 'input_item_submitted'
            : 'input_item_status_updated';
    runOptionalNoticeDispatch({
      eventType,
      objectType: 'input_item',
      objectId: itemId,
      eventKey: `input-item:${itemId}:${previousStatus}:${nextStatus}:${Date.now()}`,
      metadata: {
        order_id: orderId,
        product_id: existing?.product_id || null,
        module: existing?.module || null,
        stage_index: 0,
        stage_code: existing?.module === 'VIDEO' ? 'VSMF01' : existing?.module === 'GAME' ? 'GSMF01' : 'SMF01',
        item_code: existing?.item_code || null,
        item_label: existing?.label || null,
        owner_profile_id: existing?.owner_profile_id || null,
        previous_status: previousStatus,
        status: nextStatus,
      },
    });
  }
}

export async function updateOrder(orderId: string, patch: Partial<OrderRow>, options?: { refreshProjection?: boolean }) {
  const client = requireSupabase();
  const { error } = await client
    .from('vcontent_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', orderId);

  if (error) {
    if (!isPolicyError(error)) throw error;
    await requestAppApi('/api/order-update', {
      method: 'POST',
      body: JSON.stringify({ orderId, patch }),
    });
  }
  if (options?.refreshProjection !== false) {
    await refreshOrderStatusProjection(orderId);
  }
}

export async function updateTask(taskId: string, patch: Partial<TaskRow>, options?: { notifyAssignment?: boolean }) {
  const client = requireSupabase();
  const { data: existingRows, error: existingError } = await client
    .from('vcontent_tasks')
    .select('order_id,product_id,stage_index,status,assignee,assignee_profile_id,assignee_account_id')
    .eq('id', taskId)
    .limit(1);
  if (existingError) {
    if (!isPolicyError(existingError)) throw existingError;
    await requestAppApi('/api/task-update', {
      method: 'POST',
      body: JSON.stringify({ taskId, patch }),
    });
    return;
  }
  const existingTask = (existingRows || [])[0] as Partial<TaskRow> | undefined;
  const primaryPatch = { ...patch, updated_at: new Date().toISOString() };
  const { error } = await client
    .from('vcontent_tasks')
    .update(primaryPatch)
    .eq('id', taskId);
  if (!error) {
    const orderId = String(existingTask?.order_id || '');
    if (orderId) await refreshOrderStatusProjection(orderId);
    const nextAssigneeProfileId = patch.assignee_profile_id !== undefined ? patch.assignee_profile_id : existingTask?.assignee_profile_id;
    const nextAssigneeAccountId = patch.assignee_account_id !== undefined ? patch.assignee_account_id : existingTask?.assignee_account_id;
    const assigneeChanged =
      (patch.assignee_profile_id !== undefined && patch.assignee_profile_id !== existingTask?.assignee_profile_id) ||
      (patch.assignee_account_id !== undefined && patch.assignee_account_id !== existingTask?.assignee_account_id);
    if (options?.notifyAssignment !== false && assigneeChanged && (nextAssigneeProfileId || nextAssigneeAccountId)) {
      runOptionalNoticeDispatch({
        eventType: 'task_assigned',
        objectType: 'task',
        objectId: taskId,
        title: 'Bạn được giao công đoạn mới',
        summary: `${existingTask?.product_id || taskId} được phân công công đoạn ${Number(existingTask?.stage_index ?? 0) + 1}.`,
        level: 'warning',
        recipientProfileId: nextAssigneeProfileId || null,
        recipientAccountId: nextAssigneeAccountId || null,
        eventKey: `${taskId}:assigned:${nextAssigneeProfileId || nextAssigneeAccountId}`,
        metadata: {
          order_id: orderId,
          product_id: existingTask?.product_id || null,
          task_id: taskId,
          stage_index: existingTask?.stage_index ?? null,
          assignee_profile_id: nextAssigneeProfileId || null,
          assignee_account_id: nextAssigneeAccountId || null,
          previous_assignee_profile_id: existingTask?.assignee_profile_id || null,
          status: patch.status || existingTask?.status || null,
        },
      });
    }
    return;
  }
  if (isPolicyError(error)) {
    await requestAppApi('/api/task-update', {
      method: 'POST',
      body: JSON.stringify({ taskId, patch }),
    });
    const orderId = String(existingTask?.order_id || '');
    if (orderId) {
      await refreshOrderStatusProjection(orderId).catch(() => undefined);
    }
    return;
  }
  if (!isMissingColumnError(error)) throw error;

  const legacyPatch = { ...primaryPatch } as Record<string, unknown>;
  delete legacyPatch.assignee_profile_id;
  delete legacyPatch.assignee_account_id;
  const legacyResult = await client
    .from('vcontent_tasks')
    .update(legacyPatch)
    .eq('id', taskId);
  if (legacyResult.error) throw legacyResult.error;
  const orderId = String(existingTask?.order_id || '');
  if (orderId) await refreshOrderStatusProjection(orderId);
}

export async function updateDelivery(deliveryId: string, patch: Partial<DeliveryRow>) {
  const client = requireSupabase();
  const { error } = await client
    .from('vcontent_deliveries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', deliveryId);
  if (error) throw error;
}

export async function updatePaymentRequest(paymentRequestId: string, patch: Partial<PaymentRequestRow>) {
  const client = requireSupabase();
  const { error } = await client
    .from('vcontent_payment_requests')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', paymentRequestId);
  if (error) throw error;
}

export async function updateWorkflowRecord(kind: WorkflowRecordKind, recordId: string, patch: Record<string, unknown>) {
  await measureTelemetry(
    'workflow.record.update',
    {
      kind,
      record_id: recordId,
      patch_keys: Object.keys(patch),
    },
    async () => {
      const client = requireSupabase();
      const tableByKind: Record<WorkflowRecordKind, string> = {
        storyboard: 'vcontent_storyboards',
        slide_design: 'vcontent_slide_designs',
        voice_over: 'vcontent_voice_overs',
        video_edit: 'vcontent_video_edits',
        scorm_package: 'vcontent_scorm_packages',
      };
      const { data, error } = await client
        .from(tableByKind[kind])
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', recordId)
        .select('id')
        .maybeSingle();
      if (!error && data?.id) return;
      if (error && !isPolicyError(error)) throw error;

      const payload = await requestAppApi('/api/workflow-record-update', {
        method: 'POST',
        body: JSON.stringify({
          kind,
          recordId,
          patch,
        }),
      });
      if (!(payload as { ok?: boolean }).ok) {
        throw new Error('Không thể cập nhật workflow record.');
      }
    },
  );
}

export async function createStoryboardReview(input: {
  storyboardId: string;
  reviewerProfileId?: string | null;
  decision: string;
  comment?: string | null;
  criteria?: Record<string, boolean>;
}) {
  const client = requireSupabase();
  const payload = {
    id: `SR-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    storyboard_id: input.storyboardId,
    reviewer_profile_id: input.reviewerProfileId || null,
    decision: input.decision,
    comment: input.comment || '',
    criteria: input.criteria || {},
  };
  const { data, error } = await client
    .from('vcontent_storyboard_reviews')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as StoryboardReviewRow;
}

export async function deleteStoryboardReview(reviewId: string) {
  const client = requireSupabase();
  const { error } = await client.from('vcontent_storyboard_reviews').delete().eq('id', reviewId);
  if (error) throw error;
}

async function createWorkflowReviewRecord(table: string, idPrefix: string, idField: string, objectId: string, reviewerProfileId: string | null | undefined, decision: string, comment: string | null | undefined, criteria: Record<string, unknown> | undefined) {
  const client = requireSupabase();
  const payload = {
    id: `${idPrefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    [idField]: objectId,
    reviewer_profile_id: reviewerProfileId || null,
    decision,
    comment: comment || '',
    criteria: criteria || {},
  };
  const { data, error } = await client.from(table).insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

export async function createSlideDesignReview(input: {
  slideDesignId: string;
  reviewerProfileId?: string | null;
  decision: string;
  comment?: string | null;
  criteria?: Record<string, unknown>;
}) {
  return await createWorkflowReviewRecord(
    'vcontent_slide_design_reviews',
    'SDR',
    'slide_design_id',
    input.slideDesignId,
    input.reviewerProfileId,
    input.decision,
    input.comment,
    input.criteria,
  ) as SlideDesignReviewRow;
}

export async function deleteSlideDesignReview(reviewId: string) {
  const client = requireSupabase();
  const { error } = await client.from('vcontent_slide_design_reviews').delete().eq('id', reviewId);
  if (error) throw error;
}

export async function createVoiceReview(input: {
  voiceOverId: string;
  reviewerProfileId?: string | null;
  decision: string;
  comment?: string | null;
  criteria?: Record<string, unknown>;
}) {
  return await createWorkflowReviewRecord(
    'vcontent_voice_reviews',
    'VR',
    'voice_over_id',
    input.voiceOverId,
    input.reviewerProfileId,
    input.decision,
    input.comment,
    input.criteria,
  ) as VoiceReviewRow;
}

export async function deleteVoiceReview(reviewId: string) {
  const client = requireSupabase();
  const { error } = await client.from('vcontent_voice_reviews').delete().eq('id', reviewId);
  if (error) throw error;
}

export async function createVideoReview(input: {
  videoEditId: string;
  reviewerProfileId?: string | null;
  decision: string;
  comment?: string | null;
  criteria?: Record<string, unknown>;
}) {
  return await createWorkflowReviewRecord(
    'vcontent_video_reviews',
    'VDR',
    'video_edit_id',
    input.videoEditId,
    input.reviewerProfileId,
    input.decision,
    input.comment,
    input.criteria,
  ) as VideoReviewRow;
}

export async function deleteVideoReview(reviewId: string) {
  const client = requireSupabase();
  const { error } = await client.from('vcontent_video_reviews').delete().eq('id', reviewId);
  if (error) throw error;
}

export async function createScormReview(input: {
  scormPackageId: string;
  reviewerProfileId?: string | null;
  decision: string;
  comment?: string | null;
  criteria?: Record<string, unknown>;
}) {
  return await createWorkflowReviewRecord(
    'vcontent_scorm_reviews',
    'SCR',
    'scorm_package_id',
    input.scormPackageId,
    input.reviewerProfileId,
    input.decision,
    input.comment,
    input.criteria,
  ) as ScormReviewRow;
}

export async function deleteScormReview(reviewId: string) {
  const client = requireSupabase();
  const { error } = await client.from('vcontent_scorm_reviews').delete().eq('id', reviewId);
  if (error) throw error;
}

export async function deleteWorkflowRecord(kind: WorkflowRecordKind, recordId: string) {
  const client = requireSupabase();
  const tableByKind: Record<WorkflowRecordKind, string> = {
    storyboard: 'vcontent_storyboards',
    slide_design: 'vcontent_slide_designs',
    voice_over: 'vcontent_voice_overs',
    video_edit: 'vcontent_video_edits',
    scorm_package: 'vcontent_scorm_packages',
  };
  const { error } = await client.from(tableByKind[kind]).delete().eq('id', recordId);
  if (error) throw error;
}

export async function archiveTasksForStage(orderId: string, productId: string, stageIndex: number) {
  const client = requireSupabase();
  const { error } = await client
    .from('vcontent_tasks')
    .update({ archived: true, updated_at: new Date().toISOString() })
    .eq('order_id', orderId)
    .eq('product_id', productId)
    .eq('stage_index', stageIndex);
  if (error) throw error;
}

async function deleteOrderCascadeDirect(orderId: string) {
  const storyboards = await selectDirectIds('vcontent_storyboards', 'id', 'order_id', orderId);
  const slideDesigns = await selectDirectIds('vcontent_slide_designs', 'id', 'order_id', orderId);
  const voiceOvers = await selectDirectIds('vcontent_voice_overs', 'id', 'order_id', orderId);
  const videoEdits = await selectDirectIds('vcontent_video_edits', 'id', 'order_id', orderId);
  const scormPackages = await selectDirectIds('vcontent_scorm_packages', 'id', 'order_id', orderId);

  await deleteDirectByIn('vcontent_storyboard_reviews', 'storyboard_id', storyboards);
  await deleteDirectByIn('vcontent_slide_design_reviews', 'slide_design_id', slideDesigns);
  await deleteDirectByIn('vcontent_voice_reviews', 'voice_over_id', voiceOvers);
  await deleteDirectByIn('vcontent_video_reviews', 'video_edit_id', videoEdits);
  await deleteDirectByIn('vcontent_scorm_reviews', 'scorm_package_id', scormPackages);

  await deleteDirectByEq('vcontent_storyboards', 'order_id', orderId);
  await deleteDirectByEq('vcontent_slide_designs', 'order_id', orderId);
  await deleteDirectByEq('vcontent_voice_overs', 'order_id', orderId);
  await deleteDirectByEq('vcontent_video_edits', 'order_id', orderId);
  await deleteDirectByEq('vcontent_scorm_packages', 'order_id', orderId);
  await deleteDirectByEq('vcontent_input_items', 'order_id', orderId);
  await deleteDirectByEq('vcontent_tasks', 'order_id', orderId);
  await deleteDirectByEq('vcontent_products', 'order_id', orderId);
  await deleteDirectByEq('vcontent_orders', 'id', orderId);
}

export async function deleteOrder(orderId: string) {
  try {
    await requestAppApi('/api/order-delete', {
      method: 'POST',
      body: JSON.stringify({ orderIds: [orderId] }),
    });
    return;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (!/not configured|HTTP 404|HTTP 405/i.test(message)) throw error;
  }

  await deleteOrderCascadeDirect(orderId);
}

export async function uploadIntakeAsset(input: {
  file: File;
  orderId: string;
  productId: string;
  itemCode: string;
  module: string;
  previousUrl?: string | null;
}) {
  return uploadIntakeAssetWithSignedUrl(input);
}

export async function deleteIntakeAsset(input: { fileUrl: string }) {
  try {
    await deleteStorageFileDirect({ bucket: INTAKE_STORAGE_BUCKET, fileUrl: input.fileUrl });
  } catch {
    await requestAppApi('/api/intake-delete', {
      method: 'POST',
      body: JSON.stringify({
        fileUrl: input.fileUrl,
      }),
    });
  }
}

export async function uploadWorkflowAsset(input: {
  file: File;
  orderId: string;
  productId: string;
  module: string;
  stageCode: string;
  slot: string;
  previousUrl?: string | null;
}) {
  return measureTelemetry('workflow.asset.upload', {
    order_id: input.orderId,
    product_id: input.productId,
    module: input.module,
    stage_code: input.stageCode,
    slot: input.slot,
    file_name: input.file.name,
    file_size: input.file.size,
  }, async () => uploadWorkflowAssetWithSignedUrl(input));
}

export async function deleteWorkflowAsset(input: { fileUrl: string }) {
  await measureTelemetry('workflow.asset.delete', {
    file_url: input.fileUrl,
  }, async () => {
    try {
      await deleteStorageFileDirect({ bucket: WORKFLOW_STORAGE_BUCKET, fileUrl: input.fileUrl });
    } catch {
      await requestAppApi('/api/intake-delete', {
        method: 'POST',
        body: JSON.stringify({
          fileUrl: input.fileUrl,
        }),
      });
    }
  });
}

export async function createActivityLog(input: {
  actorProfileId?: string | null;
  actionType: string;
  objectType: string;
  objectId: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const client = requireSupabase();
  const payload = {
    id: `ACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    happened_at: new Date().toISOString(),
    actor_profile_id: input.actorProfileId || null,
    action_type: input.actionType,
    object_type: input.objectType,
    object_id: input.objectId,
    summary: input.summary,
    metadata: input.metadata || {},
  };
  const { data, error } = await client.from('vcontent_activity_logs').insert(payload).select('*').single();
  if (error) throw error;
  if (shouldDispatchActivityNotice(payload.action_type)) {
    runOptionalNoticeDispatch({
      eventType: payload.action_type,
      objectType: payload.object_type,
      objectId: payload.object_id,
      actorProfileId: payload.actor_profile_id,
      summary: payload.summary,
      eventKey: payload.id,
      metadata: {
        ...payload.metadata,
        activity_log_id: payload.id,
        happened_at: payload.happened_at,
      },
    });
  }
  return data;
}

export async function uploadProfileAvatar(input: {
  file: File;
  profileId: string;
  previousUrl?: string | null;
}) {
  try {
    return await uploadStorageFileDirect({
      bucket: AVATAR_STORAGE_BUCKET,
      file: input.file,
      previousUrl: input.previousUrl,
      segments: [
        'avatars',
        slugifyStoragePath(input.profileId) || 'unknown-profile',
        `${Date.now()}-${slugifyStoragePath(input.file.name) || 'avatar'}`,
      ],
    });
  } catch {
    const base64 = await fileToBase64(input.file);
    const payload = await requestAppApi('/api/profile-avatar-upload', {
      method: 'POST',
      body: JSON.stringify({
        profileId: input.profileId,
        previousUrl: input.previousUrl || null,
        fileName: input.file.name,
        contentType: input.file.type || 'application/octet-stream',
        base64Data: base64,
      }),
    });

    return payload.file as WorkflowUploadResult;
  }
}

export async function adminCreateAuthUser(input: {
  accessToken: string;
  email: string;
  password: string;
  fullName: string;
  profileId: string;
}) {
  const response = await fetch('/api/admin-create-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Kh?ng t?o ???c Supabase Auth user.');
  }
  return payload.user;
}

export async function adminResetAuthPassword(input: {
  accessToken: string;
  userId: string;
  password: string;
}) {
  const response = await fetch('/api/admin-reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Kh?ng reset ???c m?t kh?u.');
  }
  return payload.user;
}

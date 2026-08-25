import { supabase } from '@/lib/supabaseClient';
import type { VsuiteTabKey, VsuiteChecklistState } from '../domain/contract';
import type { VsuitePaymentAction, VsuitePaymentStatus, VsuitePlanAction, VsuitePlanStatus } from '../domain/paymentWorkflow';
import { canCurrentProfileActOnPaymentRequest, getNextPaymentStatus, getNextPlanStatus, isDirectorPaymentProfile } from '../domain/paymentWorkflow';

export type VsuiteProfile = {
  id: string;
  email: string | null;
  full_name: string;
  role: string;
  title: string | null;
};

export type VsuiteContract = {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  status: string;
  value_amount: number;
  start_date: string | null;
  end_date: string | null;
  notes: string;
};

export type VsuiteProgram = {
  id: string;
  contract_id: string | null;
  code: string;
  name: string;
  description: string;
  status: string;
};

export type VsuiteClass = {
  id: string;
  program_id: string | null;
  training_class_id: string | null;
  code: string;
  name: string;
  format: string;
  location: string;
  start_date: string | null;
  end_date: string | null;
  student_count: number;
  status: string;
  alert_level: string;
  pm_profile_id: string | null;
  teamlead_profile_id: string | null;
  notes: string;
};

export type VsuiteAssignment = {
  id: string;
  class_id: string;
  profile_id: string | null;
  role_in_class: string;
  contract_signed: boolean;
  briefed: boolean;
  readiness_done: boolean;
  notes: string;
};

export type VsuiteChecklistItem = {
  id: string;
  class_id: string;
  tab: VsuiteTabKey;
  label: string;
  owner_role: string;
  assignee_profile_id: string | null;
  due_date: string | null;
  state: VsuiteChecklistState;
  evidence: string;
  sort_order: number;
};

export type VsuiteReminder = {
  id: string;
  class_id: string;
  checklist_item_id: string | null;
  from_profile_id: string | null;
  to_profile_id: string | null;
  message: string;
  due_date: string | null;
  status: string;
};

export type VsuiteExpense = {
  id: string;
  class_id: string | null;
  category: string;
  amount: number;
  has_receipt: boolean;
  status: string;
  note: string;
};

export type VsuitePaymentRequest = {
  id: string;
  class_id: string | null;
  code: string;
  title: string;
  requester_profile_id: string | null;
  vendor_name: string;
  payee_name: string;
  payee_bank: string;
  payee_account: string;
  amount: number;
  currency: string;
  purpose: string;
  status: VsuitePaymentStatus;
  due_date: string | null;
  accountant_note: string;
  manager_note: string;
  director_note: string;
  payment_transaction_ref: string;
  paid_amount: number | null;
  paid_date: string | null;
  paid_at: string | null;
  delegated_approver_email: string | null;
  opinion_requested_email: string | null;
  opinion_requested_name: string;
  opinion_request_note: string;
  opinion_requested_at: string | null;
  opinion_status: 'none' | 'pending' | 'responded';
  opinion_response: string;
  opinion_responded_at: string | null;
  last_action_note: string;
  created_at: string;
  updated_at: string;
};

export type VsuitePaymentDocument = {
  id: string;
  payment_request_id: string;
  document_type: string;
  title: string;
  url: string;
  note: string;
  verified: boolean;
  created_at: string;
};

export type VsuiteApprovalEvent = {
  id: string;
  entity_type: string;
  entity_id: string;
  actor_profile_id: string | null;
  action: string;
  from_status: string;
  to_status: string;
  note: string;
  created_at: string;
};

export type VsuiteOperationPlan = {
  id: string;
  class_id: string | null;
  title: string;
  owner_profile_id: string | null;
  objective: string;
  scope: string;
  budget_amount: number;
  timeline: string;
  status: VsuitePlanStatus;
  approver_note: string;
  created_at: string;
  updated_at: string;
};

export type VsuiteDashboardData = {
  profiles: VsuiteProfile[];
  contracts: VsuiteContract[];
  programs: VsuiteProgram[];
  classes: VsuiteClass[];
  assignments: VsuiteAssignment[];
  checklistItems: VsuiteChecklistItem[];
  reminders: VsuiteReminder[];
  expenses: VsuiteExpense[];
  paymentRequests: VsuitePaymentRequest[];
  paymentDocuments: VsuitePaymentDocument[];
  approvalEvents: VsuiteApprovalEvent[];
  operationPlans: VsuiteOperationPlan[];
};

function requireSupabase() {
  if (!supabase) throw new Error('Supabase client is not configured.');
  return supabase;
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
  if (!token) throw new Error('Missing session token.');
  return token;
}

async function requestVsuiteApi(path: string, init: RequestInit = {}) {
  const token = await getAccessToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...init, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

let currentProfileCacheKey = '';
let currentProfileCache: Promise<VsuiteProfile | null> | null = null;

async function getCurrentProfile() {
  const client = requireSupabase();
  const { data: sessionData } = await client.auth.getSession();
  const accountId = sessionData.session?.user?.id || null;
  const email = String(sessionData.session?.user?.email || '').trim();
  if (!accountId && !email) return null;

  const cacheKey = accountId || email.toLowerCase();
  if (currentProfileCache && currentProfileCacheKey === cacheKey) return currentProfileCache;

  currentProfileCacheKey = cacheKey;
  currentProfileCache = (async () => {
    let query = client.from('vcontent_profiles').select('id,email,full_name,role,title').eq('active', true).limit(1);
    query = accountId ? query.eq('auth_user_id', accountId) : query.ilike('email', email);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    return (data as VsuiteProfile | null) || null;
  })();
  try {
    return await currentProfileCache;
  } catch (error) {
    currentProfileCache = null;
    currentProfileCacheKey = '';
    throw error;
  }
}

async function getCurrentProfileId() {
  return (await getCurrentProfile())?.id || null;
}

async function getActiveProfileIdsByRoles(roles: string[]) {
  if (!roles.length) return [];
  const { data, error } = await requireSupabase()
    .from('vcontent_profiles')
    .select('id')
    .eq('active', true)
    .in('role', roles);
  if (error) throw error;
  return [...new Set((data || []).map((item) => String(item.id || '')).filter(Boolean))];
}

function runOptionalNoticeDispatch(input: {
  eventType: string;
  objectType: string;
  objectId: string;
  actorProfileId?: string | null;
  title: string;
  body: string;
  level?: 'info' | 'warning' | 'danger' | 'success';
  linkPage?: string | null;
  recipientProfileIds: string[];
  eventKey: string;
  metadata?: Record<string, unknown>;
  explicitRecipientsOnly?: boolean;
}) {
  if (!input.recipientProfileIds.length) return;
  void (async () => {
    try {
      await requestVsuiteApi('/api/notice-dispatch', {
        method: 'POST',
        body: JSON.stringify({
          ...input,
          persistInApp: true,
          notifyActor: false,
        }),
      });
    } catch {
      // Notification/email delivery should not block the V-Suite workflow action.
    }
  })();
}

function getPaymentReviewAction(status: VsuitePaymentStatus): VsuitePaymentAction | null {
  if (status === 'submitted') return 'accountant_review';
  if (status === 'accountant_review') return 'director_approve';
  if (status === 'manager_approved') return 'director_approve';
  if (status === 'director_approved') return 'mark_paid';
  return null;
}

async function getActivePaymentReviewerProfileIds(request: VsuitePaymentRequest) {
  const action = getPaymentReviewAction(request.status);
  if (!action) return [];
  const { data, error } = await requireSupabase()
    .from('vcontent_profiles')
    .select('id,email,role,title')
    .eq('active', true);
  if (error) throw error;
  return [...new Set((data || [])
    .filter((profile) => canCurrentProfileActOnPaymentRequest(profile, request, action))
    .map((profile) => String(profile.id || ''))
    .filter(Boolean))];
}

const PLAN_REVIEW_ROLES: Partial<Record<VsuitePlanStatus, string[]>> = {
  submitted: ['vsuite_admin', 'vsuite_ops', 'vsuite_manager', 'vsuite_director'],
};

function getVsuitePaymentReviewLabel(status: VsuitePaymentStatus) {
  if (status === 'submitted') return 'Kế toán kiểm tra chứng từ';
  if (status === 'accountant_review') return 'Quản lý duyệt nghiệp vụ';
  if (status === 'manager_approved') return 'Giám đốc duyệt chi';
  if (status === 'director_approved') return 'Thủ quỹ/kế toán xác nhận chi tiền';
  return 'Duyệt đề nghị thanh toán';
}

async function uploadFileToSignedUrl(signedUrl: string, file: File) {
  const body = new FormData();
  body.append('cacheControl', '3600');
  body.append('', file);

  const response = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'x-upsert': 'true' },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = text;
    try {
      const payload = text ? JSON.parse(text) : null;
      message = payload?.error || payload?.message || payload?.msg || text;
    } catch {
      // Storage can return plain text for failed signed uploads.
    }
    throw new Error(message || `Upload failed with HTTP ${response.status}.`);
  }
}

export async function uploadVsuitePaymentDocumentFile(input: {
  file: File;
  paymentRequestId: string;
  documentType: string;
}) {
  const payload = await requestVsuiteApi('/api/vsuite-file', {
    method: 'POST',
    body: JSON.stringify({
      action: 'signed_upload_url',
      fileName: input.file.name,
      contentType: input.file.type || 'application/octet-stream',
      paymentRequestId: input.paymentRequestId,
      documentType: input.documentType,
    }),
  });
  const upload = (payload as { upload?: { bucket?: string; path?: string; token?: string; signedUrl?: string; fileName?: string } }).upload;
  if (!upload?.bucket || !upload.path || !upload.token || !upload.signedUrl) {
    throw new Error('Server did not return a signed upload URL.');
  }
  await uploadFileToSignedUrl(upload.signedUrl, input.file);
  const publicUrl = requireSupabase().storage.from(upload.bucket).getPublicUrl(upload.path).data.publicUrl;
  if (!publicUrl) throw new Error('Failed to resolve uploaded file URL.');
  return {
    fileName: upload.fileName || input.file.name,
    fileUrl: publicUrl,
    bucket: upload.bucket,
    path: upload.path,
  };
}

export async function uploadVworkDocumentFile(input: {
  file: File;
  entityId: string;
  documentType: string;
}) {
  const payload = await requestVsuiteApi('/api/vwork-file', {
    method: 'POST',
    body: JSON.stringify({
      action: 'signed_upload_url',
      fileName: input.file.name,
      contentType: input.file.type || 'application/octet-stream',
      entityId: input.entityId,
      documentType: input.documentType,
    }),
  });
  const upload = (payload as { upload?: { bucket?: string; path?: string; token?: string; signedUrl?: string; fileName?: string } }).upload;
  if (!upload?.bucket || !upload.path || !upload.token || !upload.signedUrl) {
    throw new Error('Server did not return a signed upload URL.');
  }
  await uploadFileToSignedUrl(upload.signedUrl, input.file);
  const publicUrl = requireSupabase().storage.from(upload.bucket).getPublicUrl(upload.path).data.publicUrl;
  if (!publicUrl) throw new Error('Failed to resolve uploaded file URL.');
  return {
    fileName: upload.fileName || input.file.name,
    fileUrl: publicUrl,
    bucket: upload.bucket,
    path: upload.path,
  };
}

async function selectRows<T>(table: string, select = '*', order?: { column: string; ascending?: boolean }) {
  let query = requireSupabase().from(table).select(select);
  if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as T[];
}

export async function fetchVsuiteDashboard(): Promise<VsuiteDashboardData> {
  const [
    profiles,
    contracts,
    programs,
    classes,
    assignments,
    checklistItems,
    reminders,
    expenses,
    paymentRequests,
    paymentDocuments,
    approvalEvents,
    operationPlans,
  ] = await Promise.all([
    selectRows<VsuiteProfile>('vcontent_profiles', 'id,email,full_name,role,title', { column: 'full_name' }),
    selectRows<VsuiteContract>('vsuite_contracts', '*', { column: 'created_at', ascending: false }),
    selectRows<VsuiteProgram>('vsuite_programs', '*', { column: 'created_at', ascending: false }),
    selectRows<VsuiteClass>('vsuite_classes', '*', { column: 'start_date' }),
    selectRows<VsuiteAssignment>('vsuite_class_assignments', '*', { column: 'created_at', ascending: false }),
    selectRows<VsuiteChecklistItem>('vsuite_checklist_items', '*', { column: 'sort_order' }),
    selectRows<VsuiteReminder>('vsuite_reminders', '*', { column: 'created_at', ascending: false }),
    selectRows<VsuiteExpense>('vsuite_expenses', '*', { column: 'created_at', ascending: false }),
    selectRows<VsuitePaymentRequest>('vsuite_payment_requests', '*', { column: 'created_at', ascending: false }),
    selectRows<VsuitePaymentDocument>('vsuite_payment_documents', '*', { column: 'created_at', ascending: false }),
    selectRows<VsuiteApprovalEvent>('vsuite_approval_events', '*', { column: 'created_at', ascending: false }),
    selectRows<VsuiteOperationPlan>('vsuite_operation_plans', '*', { column: 'created_at', ascending: false }),
  ]);

  return { profiles, contracts, programs, classes, assignments, checklistItems, reminders, expenses, paymentRequests, paymentDocuments, approvalEvents, operationPlans };
}

export async function fetchVsuitePaymentRequests(): Promise<VsuitePaymentRequest[]> {
  return selectRows<VsuitePaymentRequest>('vsuite_payment_requests', '*', { column: 'created_at', ascending: false });
}

export async function fetchVsuitePeopleProfiles(): Promise<VsuiteProfile[]> {
  const { data, error } = await requireSupabase()
    .from('vcontent_profiles')
    .select('id,email,full_name,role,title')
    .eq('active', true)
    .order('full_name', { ascending:true });
  if (error) throw error;
  return (data || []) as VsuiteProfile[];
}

export async function fetchVsuitePaymentDocuments(): Promise<VsuitePaymentDocument[]> {
  return selectRows<VsuitePaymentDocument>('vsuite_payment_documents', '*', { column: 'created_at', ascending: false });
}

export async function fetchVsuitePaymentApprovalEvents(): Promise<VsuiteApprovalEvent[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('vsuite_approval_events')
    .select('*')
    .eq('entity_type', 'payment_request')
    .order('created_at', { ascending:false });
  if (error) throw error;
  return (data || []) as VsuiteApprovalEvent[];
}

export async function createVsuiteContract(input: Omit<Partial<VsuiteContract>, 'id'> & { code: string; name: string }) {
  const { error } = await requireSupabase().from('vsuite_contracts').insert({
    code: input.code,
    name: input.name,
    customer_name: input.customer_name || '',
    status: input.status || 'draft',
    value_amount: Number(input.value_amount || 0),
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    notes: input.notes || '',
  });
  if (error) throw error;
}

export async function createVsuiteProgram(input: Omit<Partial<VsuiteProgram>, 'id'> & { code: string; name: string }) {
  const { error } = await requireSupabase().from('vsuite_programs').insert({
    contract_id: input.contract_id || null,
    code: input.code,
    name: input.name,
    description: input.description || '',
    status: input.status || 'planning',
  });
  if (error) throw error;
}

export async function createVsuiteClass(input: Omit<Partial<VsuiteClass>, 'id'> & { code: string; name: string }) {
  const { error } = await requireSupabase().from('vsuite_classes').insert({
    program_id: input.program_id || null,
    training_class_id: input.training_class_id || null,
    code: input.code,
    name: input.name,
    format: input.format || 'offline',
    location: input.location || '',
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    student_count: Number(input.student_count || 0),
    status: input.status || 'preparing',
    alert_level: input.alert_level || 'none',
    pm_profile_id: input.pm_profile_id || null,
    teamlead_profile_id: input.teamlead_profile_id || null,
    notes: input.notes || '',
  });
  if (error) throw error;
}

export async function createVsuiteAssignment(input: Omit<Partial<VsuiteAssignment>, 'id'> & { class_id: string; role_in_class: string }) {
  const { error } = await requireSupabase().from('vsuite_class_assignments').insert({
    class_id: input.class_id,
    profile_id: input.profile_id || null,
    role_in_class: input.role_in_class,
    contract_signed: Boolean(input.contract_signed),
    briefed: Boolean(input.briefed),
    readiness_done: Boolean(input.readiness_done),
    notes: input.notes || '',
  });
  if (error) throw error;
}

export async function createVsuiteChecklistItem(input: Omit<Partial<VsuiteChecklistItem>, 'id'> & { class_id: string; tab: VsuiteTabKey; label: string }) {
  const { error } = await requireSupabase().from('vsuite_checklist_items').insert({
    class_id: input.class_id,
    tab: input.tab,
    label: input.label,
    owner_role: input.owner_role || '',
    assignee_profile_id: input.assignee_profile_id || null,
    due_date: input.due_date || null,
    state: input.state || 'pending',
    evidence: input.evidence || '',
    sort_order: Number(input.sort_order || 1),
  });
  if (error) throw error;
}

export async function updateVsuiteChecklistItem(id: string, patch: Partial<Pick<VsuiteChecklistItem, 'state' | 'evidence' | 'due_date' | 'assignee_profile_id' | 'owner_role' | 'label'>>) {
  const { error } = await requireSupabase().from('vsuite_checklist_items').update(patch).eq('id', id);
  if (error) throw error;
}

export async function createVsuiteReminder(input: Omit<Partial<VsuiteReminder>, 'id'> & { class_id: string; message: string }) {
  const { error } = await requireSupabase().from('vsuite_reminders').insert({
    class_id: input.class_id,
    checklist_item_id: input.checklist_item_id || null,
    to_profile_id: input.to_profile_id || null,
    message: input.message,
    due_date: input.due_date || null,
    status: input.status || 'open',
  });
  if (error) throw error;
}

export async function updateVsuiteReminder(id: string, status: string) {
  const { error } = await requireSupabase()
    .from('vsuite_reminders')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function createVsuiteExpense(input: Omit<Partial<VsuiteExpense>, 'id'> & { category: string }) {
  const { error } = await requireSupabase().from('vsuite_expenses').insert({
    class_id: input.class_id || null,
    category: input.category,
    amount: Number(input.amount || 0),
    has_receipt: Boolean(input.has_receipt),
    status: input.status || 'pending',
    note: input.note || '',
  });
  if (error) throw error;
}

export async function createVsuitePaymentRequest(input: Omit<Partial<VsuitePaymentRequest>, 'id' | 'status'> & { title: string; amount: number; initialStatus?: VsuitePaymentStatus }) {
  const code = input.code || `PAY-${Date.now().toString(36).toUpperCase()}`;
  const requesterProfileId = await getCurrentProfileId();
  const { data, error } = await requireSupabase().from('vsuite_payment_requests').insert({
    class_id: input.class_id || null,
    code,
    title: input.title,
    requester_profile_id: requesterProfileId,
    vendor_name: input.vendor_name || '',
    payee_name: input.payee_name || '',
    payee_bank: input.payee_bank || '',
    payee_account: input.payee_account || '',
    amount: Number(input.amount || 0),
    currency: input.currency || 'VND',
    purpose: input.purpose || '',
    status: input.initialStatus || 'draft',
    due_date: input.due_date || null,
  }).select('*').single();
  if (error) throw error;
  return data as VsuitePaymentRequest;
}

export async function createVsuitePaymentDocument(input: Omit<Partial<VsuitePaymentDocument>, 'id'> & { payment_request_id: string; title: string }) {
  const { data, error } = await requireSupabase().from('vsuite_payment_documents').insert({
    payment_request_id: input.payment_request_id,
    document_type: input.document_type || 'other',
    title: input.title,
    url: input.url || '',
    note: input.note || '',
    verified: Boolean(input.verified),
  }).select('*').single();
  if (error) throw error;
  return data as VsuitePaymentDocument;
}

export async function updateVsuitePaymentRequest(input: {
  request: VsuitePaymentRequest;
  title: string;
  vendorName: string;
  payeeName?: string;
  amount: number;
  purpose: string;
  dueDate: string | null;
}) {
  if (!['draft', 'submitted', 'returned'].includes(input.request.status)) {
    throw new Error('Phiếu đã qua bước kế toán nên không thể sửa thông tin.');
  }
  const { data, error } = await requireSupabase()
    .from('vsuite_payment_requests')
    .update({
      title: input.title,
      vendor_name: input.vendorName,
      payee_name: input.payeeName || input.vendorName,
      amount: Number(input.amount || 0),
      purpose: input.purpose,
      due_date: input.dueDate,
    })
    .eq('id', input.request.id)
    .eq('status', input.request.status)
    .select('*')
    .single();
  if (error) throw error;
  return data as VsuitePaymentRequest;
}

export async function deleteVsuitePaymentDocument(documentId: string) {
  const { error } = await requireSupabase()
    .from('vsuite_payment_documents')
    .delete()
    .eq('id', documentId);
  if (error) throw error;
}

export async function softDeleteVsuitePaymentRequest(input: { requestId: string; reason: string }) {
  const reason = String(input.reason || '').trim();
  if (!reason) throw new Error('Vui lòng nhập lý do xóa phiếu.');
  const { data, error } = await requireSupabase().rpc('vsuite_soft_delete_payment_request', {
    target_request_id: input.requestId,
    delete_reason: reason,
  });
  if (error) throw error;
  if (!data) throw new Error('Không thể xóa phiếu này hoặc bạn không có quyền xóa.');
  return true;
}

export async function advanceVsuitePaymentRequest(input: {
  request: VsuitePaymentRequest;
  action: VsuitePaymentAction;
  note?: string;
  transactionRef?: string;
  paidAmount?: number;
  paidDate?: string;
}) {
  const toStatus = getNextPaymentStatus(input.request.status, input.action);
  const actorProfile = await getCurrentProfile();
  if (!canCurrentProfileActOnPaymentRequest(actorProfile, input.request, input.action)) {
    throw new Error('Bạn không có quyền thực hiện bước thanh toán này hoặc phiếu đã đổi trạng thái.');
  }
  const actorProfileId = actorProfile?.id || null;
  const client = requireSupabase();
  const { data: updatedRequest, error } = await client
    .rpc('vsuite_transition_payment_request', {
      p_request_id: input.request.id,
      p_expected_status: input.request.status,
      p_action: input.action,
      p_note: input.note || '',
      p_transaction_ref: input.transactionRef || null,
      p_paid_amount: input.action === 'mark_paid' ? Number(input.paidAmount || input.request.amount || 0) : null,
      p_paid_date: input.action === 'mark_paid' ? (input.paidDate || new Date().toISOString().slice(0, 10)) : null,
    })
    .single();
  if (error) throw error;
  const storedRequest = updatedRequest as VsuitePaymentRequest | null;
  if (!storedRequest || storedRequest.status !== toStatus) {
    throw new Error('Phiếu chưa chuyển đúng trạng thái. Vui lòng tải lại trước khi thao tác tiếp.');
  }
  void (async () => {
    try {
      const recipientProfileIds = await getActivePaymentReviewerProfileIds(storedRequest);
      runOptionalNoticeDispatch({
        eventType: 'vsuite_payment_submitted',
        objectType: 'vsuite_payment_request',
        objectId: input.request.id,
        actorProfileId,
        title: `V-Suite cần duyệt: ${input.request.code}`,
        body: [
          `Đề nghị thanh toán: ${input.request.title}`,
          `Mã: ${input.request.code}`,
          `Bước cần xử lý: ${getVsuitePaymentReviewLabel(toStatus)}`,
          `Số tiền: ${Number(input.request.amount || 0).toLocaleString('vi-VN')} ${input.request.currency || 'VND'}`,
          input.note ? `Ghi chú: ${input.note}` : '',
        ].filter(Boolean).join('\n'),
        level: 'warning',
        linkPage: 'vplanning',
        recipientProfileIds,
        eventKey: `vsuite-payment:${input.request.id}:${toStatus}`,
        metadata: {
          module: 'vplanning',
          workflow: 'payment_request',
          payment_request_id: input.request.id,
          payment_code: input.request.code,
          status: toStatus,
          recipient_action: getPaymentReviewAction(toStatus),
        },
        explicitRecipientsOnly: true,
      });
    } catch {
      // Recipient lookup/notification should not block the workflow action.
    }
  })();
  return storedRequest;
}

async function getActiveProfileByEmail(email: string) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { data, error } = await requireSupabase()
    .from('vcontent_profiles')
    .select('id,email,full_name,role,title')
    .eq('active', true)
    .ilike('email', normalizedEmail)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as VsuiteProfile | null;
}

export async function requestVsuitePaymentOpinion(input: {
  request: VsuitePaymentRequest;
  targetEmail: string;
  note?: string;
}) {
  const actorProfile = await getCurrentProfile();
  const target = await getActiveProfileByEmail(input.targetEmail);
  const actorIsDelegate = String(actorProfile?.email || '').trim().toLowerCase()
    === String(input.request.delegated_approver_email || '').trim().toLowerCase();
  if ((!isDirectorPaymentProfile(actorProfile) && !actorIsDelegate)
    || !['accountant_review', 'manager_approved'].includes(input.request.status)) {
    throw new Error('Chỉ Giám đốc hoặc người được ủy quyền được đề nghị cho ý kiến ở bước chờ duyệt.');
  }
  if (!target || String(target.id) === String(input.request.requester_profile_id || '')) {
    throw new Error('Người được hỏi phải là tài khoản PeopleOne đang hoạt động và không phải người gửi phiếu.');
  }
  const patch = {
    opinion_requested_email: String(target.email || '').trim().toLowerCase(),
    opinion_requested_name: target.full_name || target.email || '',
    opinion_request_note: String(input.note || '').trim(),
    opinion_requested_at: new Date().toISOString(),
    opinion_status: 'pending',
    opinion_response: '',
    opinion_responded_at: null,
  };
  const { data, error } = await requireSupabase()
    .from('vsuite_payment_requests')
    .update(patch)
    .eq('id', input.request.id)
    .eq('status', input.request.status)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Phiếu đã được cập nhật. Vui lòng tải lại trước khi đề nghị cho ý kiến.');
  runOptionalNoticeDispatch({
    eventType: 'vsuite_payment_opinion_requested',
    objectType: 'vsuite_payment_request',
    objectId: input.request.id,
    actorProfileId: actorProfile?.id || null,
    title: `V-Work cần ý kiến: ${input.request.code}`,
    body: [input.request.title, input.note ? `Nội dung cần góp ý: ${input.note}` : 'Vui lòng mở phiếu và bổ sung ý kiến.'].join('\n'),
    level: 'warning',
    linkPage: 'vplanning',
    recipientProfileIds: [target.id],
    eventKey: `vsuite-payment-opinion:${input.request.id}:${patch.opinion_requested_at}`,
    metadata: { module:'vplanning', workflow:'payment_request', payment_request_id:input.request.id, action:'respond_opinion' },
    explicitRecipientsOnly: true,
  });
  return data as VsuitePaymentRequest;
}

export async function respondVsuitePaymentOpinion(input: {
  request: VsuitePaymentRequest;
  response: string;
}) {
  const response = String(input.response || '').trim();
  const actorProfile = await getCurrentProfile();
  if (!response || input.request.opinion_status !== 'pending'
    || String(actorProfile?.email || '').trim().toLowerCase() !== String(input.request.opinion_requested_email || '').trim().toLowerCase()) {
    throw new Error('Chỉ người đang được hỏi ý kiến mới có thể gửi phản hồi cho phiếu này.');
  }
  const respondedAt = new Date().toISOString();
  const { data, error } = await requireSupabase()
    .from('vsuite_payment_requests')
    .update({ opinion_status:'responded', opinion_response:response, opinion_responded_at:respondedAt })
    .eq('id', input.request.id)
    .eq('status', input.request.status)
    .eq('opinion_status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Yêu cầu ý kiến đã được cập nhật. Vui lòng tải lại.');
  const recipientIds = await getActivePaymentReviewerProfileIds(input.request);
  runOptionalNoticeDispatch({
    eventType: 'vsuite_payment_opinion_responded',
    objectType: 'vsuite_payment_request',
    objectId: input.request.id,
    actorProfileId: actorProfile?.id || null,
    title: `Đã có ý kiến: ${input.request.code}`,
    body: `${actorProfile?.full_name || actorProfile?.email || 'Người được hỏi'} đã bổ sung ý kiến cho ${input.request.title}.`,
    level: 'info',
    linkPage: 'vplanning',
    recipientProfileIds: recipientIds,
    eventKey: `vsuite-payment-opinion-response:${input.request.id}:${respondedAt}`,
    metadata: { module:'vplanning', workflow:'payment_request', payment_request_id:input.request.id, action:'review_opinion' },
    explicitRecipientsOnly: true,
  });
  return data as VsuitePaymentRequest;
}

export async function remindVsuitePaymentOpinion(input: { request: VsuitePaymentRequest }) {
  const actorProfile = await getCurrentProfile();
  const target = await getActiveProfileByEmail(input.request.opinion_requested_email || '');
  const actorIsDelegate = String(actorProfile?.email || '').trim().toLowerCase()
    === String(input.request.delegated_approver_email || '').trim().toLowerCase();
  if ((!isDirectorPaymentProfile(actorProfile) && !actorIsDelegate) || !target || input.request.opinion_status !== 'pending') {
    throw new Error('Không thể nhắc ý kiến cho phiếu này.');
  }
  const minuteBucket = new Date().toISOString().slice(0, 16);
  runOptionalNoticeDispatch({
    eventType: 'vsuite_payment_opinion_reminder',
    objectType: 'vsuite_payment_request',
    objectId: input.request.id,
    actorProfileId: actorProfile?.id || null,
    title: `Nhắc bổ sung ý kiến: ${input.request.code}`,
    body: input.request.opinion_request_note || input.request.title,
    level: 'warning',
    linkPage: 'vplanning',
    recipientProfileIds: [target.id],
    eventKey: `vsuite-payment-opinion-reminder:${input.request.id}:${minuteBucket}`,
    metadata: { module:'vplanning', workflow:'payment_request', payment_request_id:input.request.id, action:'respond_opinion' },
    explicitRecipientsOnly: true,
  });
}

export async function delegateVsuitePaymentRequest(input: {
  request: VsuitePaymentRequest;
  approverEmail: string;
}) {
  const approverEmail = input.approverEmail.trim().toLowerCase();
  if (!['accountant_review', 'manager_approved'].includes(input.request.status)) {
    throw new Error('Chỉ có thể ủy quyền ở bước chờ Giám đốc duyệt.');
  }

  const client = requireSupabase();
  if (!approverEmail) {
    const { data, error } = await client
      .from('vsuite_payment_requests')
      .update({ delegated_approver_email:null })
      .eq('id', input.request.id)
      .eq('status', input.request.status)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Phiếu đã được người khác cập nhật. Vui lòng tải lại trước khi thu hồi ủy quyền.');
    return data as VsuitePaymentRequest;
  }
  const { data, error } = await client
    .from('vsuite_payment_requests')
    .update({ delegated_approver_email: approverEmail })
    .eq('id', input.request.id)
    .eq('status', input.request.status)
    .select('*')
    .maybeSingle();
  if (error) {
    if (String(error.message || '').includes('VSUITE_PAYMENT_DELEGATE_PROFILE_NOT_ALLOWED')) {
      throw new Error('Người được ủy quyền phải là tài khoản PeopleOne đang hoạt động và không phải người gửi phiếu.');
    }
    throw error;
  }
  if (!data) throw new Error('Phiếu đã được người khác cập nhật. Vui lòng tải lại trước khi ủy quyền.');
  return data as VsuitePaymentRequest;
}

export async function createVsuiteOperationPlan(input: Omit<Partial<VsuiteOperationPlan>, 'id' | 'status'> & { title: string }) {
  const { error } = await requireSupabase().from('vsuite_operation_plans').insert({
    class_id: input.class_id || null,
    title: input.title,
    objective: input.objective || '',
    scope: input.scope || '',
    budget_amount: Number(input.budget_amount || 0),
    timeline: input.timeline || '',
    status: 'draft',
  });
  if (error) throw error;
}

export async function advanceVsuiteOperationPlan(input: { plan: VsuiteOperationPlan; action: VsuitePlanAction; note?: string }) {
  const toStatus = getNextPlanStatus(input.plan.status, input.action);
  const actorProfileId = await getCurrentProfileId();
  const client = requireSupabase();
  const { error } = await client.from('vsuite_operation_plans').update({
    status: toStatus,
    approver_note: input.note || '',
  }).eq('id', input.plan.id);
  if (error) throw error;
  await client.from('vsuite_approval_events').insert({
    entity_type: 'operation_plan',
    entity_id: input.plan.id,
    actor_profile_id: actorProfileId,
    action: input.action,
    from_status: input.plan.status,
    to_status: toStatus,
    note: input.note || '',
  });
  const nextRoles = PLAN_REVIEW_ROLES[toStatus] || [];
  void (async () => {
    try {
      const recipientProfileIds = await getActiveProfileIdsByRoles(nextRoles);
      runOptionalNoticeDispatch({
    eventType: 'vsuite_plan_submitted',
    objectType: 'vsuite_operation_plan',
    objectId: input.plan.id,
    actorProfileId,
    title: `V-Suite cần duyệt kế hoạch: ${input.plan.title}`,
    body: [
      `Kế hoạch vận hành: ${input.plan.title}`,
      `Ngân sách dự kiến: ${Number(input.plan.budget_amount || 0).toLocaleString('vi-VN')} VND`,
      input.note ? `Ghi chú: ${input.note}` : '',
    ].filter(Boolean).join('\n'),
    level: 'warning',
    linkPage: 'v-suite',
    recipientProfileIds,
    eventKey: `vsuite-plan:${input.plan.id}:${toStatus}`,
    metadata: {
      module: 'vsuite',
      workflow: 'operation_plan',
      operation_plan_id: input.plan.id,
      status: toStatus,
      recipient_roles: nextRoles,
    },
      });
    } catch {
      // Recipient lookup/notification should not block the workflow action.
    }
  })();
}

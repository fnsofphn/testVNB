import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

export type HelpdeskStatus = 'received' | 'processing' | 'completed';
export type HelpdeskProjectStatus = 'draft' | 'active' | 'paused' | 'closed';

export type HelpdeskProject = {
  id: string;
  vtrainingProgramId?: string | null;
  programName?: string | null;
  name: string;
  slug: string;
  status: HelpdeskProjectStatus;
  customerViewerProfileIds: string[];
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type HelpdeskAttachment = {
  id: string;
  ticketId: string;
  projectId: string;
  fileName: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  createdAt?: string | null;
};

export type HelpdeskTicket = {
  id: string;
  projectId: string;
  ticketCode: string;
  learnerName: string;
  learnerEmail: string;
  learnerPhone: string;
  issueText: string;
  status: HelpdeskStatus;
  assigneeProfileId?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  customerViewerProfileIds: string[];
  submittedAt?: string | null;
  updatedAt?: string | null;
  attachments: HelpdeskAttachment[];
};

export type HelpdeskComment = {
  id: string;
  ticketId: string;
  authorProfileId?: string | null;
  body: string;
  eventType: string;
  isInternal: boolean;
  createdAt?: string | null;
};

const BUCKET = 'vhelpdesk-attachments';
const PROJECT_SELECT = '*,program:vcontent_training_programs(id,code,name)';
const TICKET_SELECT = '*,assignee:vcontent_profiles!vcontent_helpdesk_tickets_assignee_profile_id_fkey(id,email,full_name),attachments:vcontent_helpdesk_attachments(*)';
const HELP_DESK_STATUS_LABELS: Record<HelpdeskStatus, string> = {
  received: 'Tiếp nhận',
  processing: 'Đang xử lý',
  completed: 'Hoàn thành',
};

function requireClient() {
  if (!supabase) throw new Error('Supabase chưa được cấu hình.');
  return supabase;
}

function requirePublicClient() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Supabase public chưa được cấu hình.');
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function sanitizeHelpdeskSlug(value: string) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function randomId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function mapProject(row: any): HelpdeskProject {
  const program = row.program && typeof row.program === 'object' ? row.program : null;
  return {
    id: String(row.id || ''),
    vtrainingProgramId: row.vtraining_program_id || null,
    programName: program?.name || null,
    name: row.name || '',
    slug: row.slug || '',
    status: row.status || 'active',
    customerViewerProfileIds: Array.isArray(row.customer_viewer_profile_ids) ? row.customer_viewer_profile_ids.map(String) : [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapAttachment(row: any): HelpdeskAttachment {
  return {
    id: String(row.id || ''),
    ticketId: String(row.ticket_id || ''),
    projectId: String(row.project_id || ''),
    fileName: row.file_name || '',
    storageBucket: row.storage_bucket || BUCKET,
    storagePath: row.storage_path || '',
    mimeType: row.mime_type || '',
    fileSize: Number(row.file_size || 0),
    createdAt: row.created_at || null,
  };
}

function mapTicket(row: any): HelpdeskTicket {
  const assignee = row.assignee && typeof row.assignee === 'object' ? row.assignee : null;
  return {
    id: String(row.id || ''),
    projectId: String(row.project_id || ''),
    ticketCode: row.ticket_code || '',
    learnerName: row.learner_name || '',
    learnerEmail: row.learner_email || '',
    learnerPhone: row.learner_phone || '',
    issueText: row.issue_text || '',
    status: row.status || 'received',
    assigneeProfileId: row.assignee_profile_id || null,
    assigneeName: assignee?.full_name || '',
    assigneeEmail: assignee?.email || '',
    customerViewerProfileIds: Array.isArray(row.customer_viewer_profile_ids) ? row.customer_viewer_profile_ids.map(String) : [],
    submittedAt: row.submitted_at || null,
    updatedAt: row.updated_at || null,
    attachments: Array.isArray(row.attachments) ? row.attachments.map(mapAttachment) : [],
  };
}

export async function listHelpdeskProjects() {
  const client = requireClient();
  const { data, error } = await client
    .from('vcontent_helpdesk_projects')
    .select(PROJECT_SELECT)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapProject);
}

export async function getHelpdeskProjectBySlug(slug: string) {
  const client = requirePublicClient();
  const { data, error } = await client
    .from('vcontent_helpdesk_projects')
    .select(PROJECT_SELECT)
    .eq('slug', sanitizeHelpdeskSlug(slug))
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  return data ? mapProject(data) : null;
}

export async function saveHelpdeskProject(input: {
  id?: string;
  name: string;
  slug?: string;
  vtrainingProgramId?: string | null;
  status?: HelpdeskProjectStatus;
  customerViewerProfileIds?: string[];
  createdByProfileId?: string | null;
}) {
  const client = requireClient();
  const slug = sanitizeHelpdeskSlug(input.slug || input.name);
  const id = input.id || slug || randomId('helpdesk-project');
  const { data, error } = await client
    .from('vcontent_helpdesk_projects')
    .upsert({
      id,
      name: input.name.trim(),
      slug,
      vtraining_program_id: input.vtrainingProgramId || null,
      status: input.status || 'active',
      customer_viewer_profile_ids: input.customerViewerProfileIds || [],
      created_by_profile_id: input.createdByProfileId || null,
      updated_at: new Date().toISOString(),
    })
    .select(PROJECT_SELECT)
    .single();
  if (error) throw error;
  return mapProject(data);
}

export async function listHelpdeskTickets(input: { projectId?: string; status?: string; assigneeProfileId?: string } = {}) {
  const client = requireClient();
  let query = client
    .from('vcontent_helpdesk_tickets')
    .select(TICKET_SELECT)
    .order('submitted_at', { ascending: false });
  if (input.projectId) query = query.eq('project_id', input.projectId);
  if (input.status) query = query.eq('status', input.status);
  if (input.assigneeProfileId) query = query.eq('assignee_profile_id', input.assigneeProfileId);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapTicket);
}

export async function createHelpdeskTicket(input: {
  projectId: string;
  projectSlug: string;
  learnerName: string;
  learnerEmail: string;
  learnerPhone?: string;
  issueText: string;
  files?: File[];
}) {
  const client = requirePublicClient();
  const id = randomId('helpdesk-ticket');
  const ticketCode = `HD-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { error: ticketError } = await client.from('vcontent_helpdesk_tickets').insert({
    id,
    project_id: input.projectId,
    ticket_code: ticketCode,
    learner_name: input.learnerName.trim(),
    learner_email: input.learnerEmail.trim(),
    learner_phone: input.learnerPhone?.trim() || '',
    issue_text: input.issueText.trim(),
    status: 'received',
  });
  if (ticketError) throw ticketError;

  const attachments: HelpdeskAttachment[] = [];
  for (const file of input.files || []) {
    const attachmentId = randomId('helpdesk-attachment');
    const safeName = file.name.replace(/[^\w.\-]+/g, '-').slice(0, 140) || 'attachment';
    const storagePath = `${sanitizeHelpdeskSlug(input.projectSlug)}/${id}/${attachmentId}-${safeName}`;
    const { error: uploadError } = await client.storage.from(BUCKET).upload(storagePath, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploadError) throw uploadError;
    const row = {
      id: attachmentId,
      ticket_id: id,
      project_id: input.projectId,
      file_name: file.name,
      storage_bucket: BUCKET,
      storage_path: storagePath,
      mime_type: file.type || '',
      file_size: file.size || 0,
    };
    const { error } = await client.from('vcontent_helpdesk_attachments').insert(row);
    if (error) throw error;
    attachments.push(mapAttachment(row));
  }

  return { id, ticketCode, attachments };
}

export async function updateHelpdeskTickets(ids: string[], patch: { status?: HelpdeskStatus; assigneeProfileId?: string | null }) {
  const ticketIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ticketIds.length) return [];
  const client = requireClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status) row.status = patch.status;
  if (patch.assigneeProfileId !== undefined) row.assignee_profile_id = patch.assigneeProfileId || null;
  const { data, error } = await client
    .from('vcontent_helpdesk_tickets')
    .update(row)
    .in('id', ticketIds)
    .select(TICKET_SELECT);
  if (error) throw error;
  return (data || []).map(mapTicket);
}

export async function getHelpdeskAttachmentUrl(attachment: HelpdeskAttachment) {
  const client = requireClient();
  const { data, error } = await client.storage
    .from(attachment.storageBucket || BUCKET)
    .createSignedUrl(attachment.storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

export function buildHelpdeskPublicLink(slug: string) {
  const configuredBaseUrl = String(import.meta.env.VITE_PUBLIC_APP_BASE_URL || '').replace(/\/+$/, '');
  const path = `/helpdesk/${encodeURIComponent(sanitizeHelpdeskSlug(slug))}`;
  if (configuredBaseUrl) return `${configuredBaseUrl}${path}`;
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`;
  return path;
}

export function exportHelpdeskTicketsToWorkbook(tickets: HelpdeskTicket[], projects: HelpdeskProject[]) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const rows = tickets.map((ticket) => ({
    'Mã yêu cầu': ticket.ticketCode,
    'Chương trình/project': projectById.get(ticket.projectId)?.name || ticket.projectId,
    'Tên học viên': ticket.learnerName,
    Email: ticket.learnerEmail,
    'Điện thoại': ticket.learnerPhone,
    'Vấn đề gặp phải': ticket.issueText,
    'Số ảnh đính kèm': ticket.attachments.length,
    'Tình trạng': HELP_DESK_STATUS_LABELS[ticket.status] || ticket.status,
    'Người phụ trách': ticket.assigneeName || ticket.assigneeEmail || '',
    'Nộp lúc': ticket.submittedAt || '',
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'V-helpdesk');
  XLSX.writeFile(workbook, `v-helpdesk-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

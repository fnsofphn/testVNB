import { createLimitedBufferReader, parseByteLimit } from './_body-limit.js';
import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';
import { TRAINING_OPERATIONS_STATE_ID } from '../src/modules/vplanning/trainingOperations/domain.js';

const MAX_BODY_BYTES = parseByteLimit(process.env.VWORK_TRAINING_OPERATIONS_FILE_BODY_LIMIT, 64 * 1024);
const MAX_UPLOAD_BYTES = parseByteLimit(process.env.VWORK_TRAINING_OPERATIONS_FILE_LIMIT, 25 * 1024 * 1024);
const readLimitedBuffer = createLimitedBufferReader({ maxBytes: MAX_BODY_BYTES });
const ALLOWED_EXTENSIONS = new Set(['xlsx', 'xls', 'csv', 'pdf', 'docx', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'txt']);
const DOCUMENT_ACCESS = Object.freeze({
  roster: { upload: ['intake'], download: ['intake'] },
  vlearning: { upload: ['content'], download: ['content'] },
  game: { upload: ['content'], download: ['content'] },
  discussion: { upload: ['content'], download: ['content'] },
  assignment: { upload: ['content'], download: ['content'] },
  test: { upload: ['content'], download: ['content'] },
  material: { upload: ['vtraining'], download: ['vtraining'] },
  evidence: { upload: ['member'], download: ['member', 'manager'] },
});

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function trainingRole(profile) {
  const tokens = [profile?.role, profile?.title, ...(Array.isArray(profile?.vplanning_roles) ? profile.vplanning_roles : [])].map(normalizeRole).filter(Boolean);
  const has = (...values) => values.some((value) => tokens.includes(value) || tokens.some((token) => token.includes(value)));
  if (has('admin', 'training_ops_admin', 'vplanning_admin')) return 'admin';
  if (has('client', 'sale', 'account_manager', 'dau_moi')) return 'intake';
  if (has('specialist', 'content_manager', 'chuyen_vien_noi_dung', 'noi_dung')) return 'content';
  if (has('vtraining', 'training_instructor', 'van_hanh_vtraining')) return 'vtraining';
  if (has('training_manager', 'training_admin', 'production_manager', 'vplanning_director')) return 'operations';
  if (has('vplanning_manager', 'manager', 'teamlead', 'quan_ly_ekip')) return 'manager';
  if (has('vplanning_member', 'vplanning_collaborator', 'ctv', 'member', 'cong_tac_vien')) return 'member';
  return null;
}

function canAccessDocument(role, documentType, action) {
  return ['operations', 'admin'].includes(role) || DOCUMENT_ACCESS[documentType]?.[action]?.includes(role);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function readJson(req) {
  if (req.body && typeof req.body === 'object') {
    if (Buffer.byteLength(JSON.stringify(req.body)) > MAX_BODY_BYTES) { const error = new Error('Request body is too large.'); error.status = 413; throw error; }
    return req.body;
  }
  const buffer = await readLimitedBuffer(req);
  return buffer.length ? JSON.parse(buffer.toString('utf8')) : {};
}

function slug(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

function encodeEntityId(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64url');
}

function decodeEntityId(value) {
  try { return Buffer.from(String(value || ''), 'base64url').toString('utf8'); } catch { return ''; }
}

function profileMatches(profile, ...values) {
  const tokens = new Set([profile?.id, profile?.email, profile?.full_name].map((item) => String(item || '').trim().toLowerCase()).filter(Boolean));
  return values.some((value) => tokens.has(String(value || '').trim().toLowerCase()));
}

async function assertEvidenceTaskAccess(admin, profile, role, taskId, action) {
  const { data: task, error } = await admin.from('vwork_training_operations_tasks').select('assignee_id,assignee_name,snapshot').eq('state_id', TRAINING_OPERATIONS_STATE_ID).eq('task_id', taskId).maybeSingle();
  if (error) throw error;
  if (!task) { const missing = new Error('Không tìm thấy công việc của file minh chứng.'); missing.status = 404; throw missing; }
  if (['operations', 'admin'].includes(role)) return;
  const snapshot = task.snapshot || {};
  const allowed = role === 'member'
    ? profileMatches(profile, task.assignee_id, task.assignee_name, snapshot.assigneeId, snapshot.assignee)
    : action === 'download' && role === 'manager' && profileMatches(profile, snapshot.reviewerId, snapshot.reviewer, snapshot.managerId, snapshot.manager);
  if (!allowed) { const denied = new Error('Bạn không được phân công trên công việc của file minh chứng này.'); denied.status = 403; throw denied; }
}

async function authorize(req, config) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) { const error = new Error('Missing session token.'); error.status = 401; throw error; }
  const sessionUser = await requestJson(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` } });
  const serviceHeaders = { apikey: config.serviceRoleKey, Authorization: `Bearer ${config.serviceRoleKey}` };
  const authId = encodeURIComponent(`eq.${sessionUser.id}`);
  const email = encodeURIComponent(`eq.${String(sessionUser.email || '').toLowerCase()}`);
  const select = 'id,email,full_name,active,role,title,vplanning_roles';
  let rows = await requestJson(`${config.supabaseUrl}/rest/v1/vcontent_profiles?select=${select}&auth_user_id=${authId}&active=is.true&limit=1`, { headers: serviceHeaders });
  if (!Array.isArray(rows) || !rows.length) rows = await requestJson(`${config.supabaseUrl}/rest/v1/vcontent_profiles?select=${select}&email=${email}&active=is.true&limit=1`, { headers: serviceHeaders });
  if (!Array.isArray(rows) || !rows.length) { const error = new Error('Tài khoản chưa được cấp quyền upload trong VWork.'); error.status = 403; throw error; }
  return rows[0];
}

export default async function handler(req, res) {
  if (process.env.VERCEL_ENV === 'production' && process.env.VWORK_TRAINING_OPERATIONS_ENABLED !== 'true') { res.status(404).json({ ok: false, code: 'TRAINING_OPERATIONS_DISABLED', error: 'VWork Training Operations is not enabled.' }); return; }
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); res.status(405).json({ ok: false, error: 'Method not allowed.' }); return; }
  if (!enforceRateLimit(req, res, { route: 'vwork-training-operations-file', ...RATE_LIMITS.upload })) return;
  const config = {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    anonKey: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    bucket: process.env.SUPABASE_VWORK_TRAINING_BUCKET || 'vwork-training-operations-private',
  };
  if (!config.supabaseUrl || !config.serviceRoleKey || !config.anonKey) { res.status(500).json({ ok: false, error: 'Server upload is not configured.' }); return; }
  try {
    const profile = await authorize(req, config);
    const role = trainingRole(profile);
    if (!role) { res.status(403).json({ ok: false, error: 'Vai trò hiện tại không được phép truy cập kho file vận hành đào tạo.' }); return; }
    const body = await readJson(req);
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    if (body.action === 'signed_download') {
      const objectPath = String(body.path || '');
      if (!objectPath.startsWith('training-operations/')) { res.status(400).json({ ok: false, error: 'Đường dẫn file không hợp lệ.' }); return; }
      const documentType = objectPath.split('/')[2] || '';
      if (!canAccessDocument(role, documentType, 'download')) { res.status(403).json({ ok: false, error: 'Vai trò hiện tại không được phép đọc file này.' }); return; }
      if (documentType === 'evidence') await assertEvidenceTaskAccess(admin, profile, role, decodeEntityId(objectPath.split('/')[1]), 'download');
      const signedDownload = await admin.storage.from(config.bucket).createSignedUrl(objectPath, 300, { download: String(body.fileName || '').trim() || true });
      if (signedDownload.error) throw signedDownload.error;
      res.status(200).json({ ok: true, download: { signedUrl: signedDownload.data.signedUrl, expiresIn: 300 } });
      return;
    }
    const fileName = String(body.fileName || '').trim();
    const documentType = String(body.documentType || 'other').trim();
    if (!canAccessDocument(role, documentType, 'upload')) { res.status(403).json({ ok: false, error: 'Vai trò hiện tại không được phép upload loại file này.' }); return; }
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const size = Number(body.size || 0);
    if (!fileName || !body.entityId || !ALLOWED_EXTENSIONS.has(extension)) { res.status(400).json({ ok: false, error: 'Loại file không được hỗ trợ.' }); return; }
    if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) { res.status(400).json({ ok: false, error: `File phải nhỏ hơn ${MAX_UPLOAD_BYTES} bytes.` }); return; }
    if (documentType === 'evidence') await assertEvidenceTaskAccess(admin, profile, role, String(body.entityId), 'upload');
    const existing = await admin.storage.getBucket(config.bucket);
    if (existing.error && String(existing.error.message || '').toLowerCase().includes('not found')) {
      const created = await admin.storage.createBucket(config.bucket, { public: false, fileSizeLimit: MAX_UPLOAD_BYTES });
      if (created.error) throw created.error;
    } else if (existing.error) throw existing.error;
    else if (existing.data?.public) {
      const secured = await admin.storage.updateBucket(config.bucket, { public: false, fileSizeLimit: MAX_UPLOAD_BYTES });
      if (secured.error) throw secured.error;
    }
    const objectPath = ['training-operations', encodeEntityId(body.entityId), slug(documentType), `${Date.now()}-${slug(fileName)}`].join('/');
    const signed = await admin.storage.from(config.bucket).createSignedUploadUrl(objectPath, { upsert: false });
    if (signed.error) throw signed.error;
    res.status(200).json({ ok: true, upload: { bucket: config.bucket, path: objectPath, signedUrl: signed.data.signedUrl, token: signed.data.token || '', fileName, private: true, requestedBy: profile.id } });
  } catch (error) {
    res.status(Number(error.status || 500)).json({ ok: false, error: String(error.message || error) });
  }
}


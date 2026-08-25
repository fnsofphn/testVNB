import { randomUUID } from 'node:crypto';
import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

const FORM_ID = 'ql01a-ai-dien-luc-4-ung-dung';
const STORAGE_BUCKET = process.env.SUPABASE_STUDENT_SURVEY_BUCKET || 'student-survey-attachments';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt']);
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
];
const ADMIN_ROLES = new Set([
  'admin',
  'content_manager',
  'production_manager',
  'training_ops_admin',
  'training_manager',
  'training_admin',
  'vtraining_manager',
  'vtraining_admin',
  'coaching_admin',
]);

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 64_000) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function getExtension(fileName) {
  return String(fileName || '').split('.').pop()?.toLowerCase() || '';
}

async function ensureBucket(admin) {
  const options = {
    public: false,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: ALLOWED_MIME_TYPES,
  };
  const existing = await admin.storage.getBucket(STORAGE_BUCKET);
  if (!existing.error) {
    const updated = await admin.storage.updateBucket(STORAGE_BUCKET, options);
    if (updated.error) throw updated.error;
    return;
  }
  if (!String(existing.error.message || '').toLowerCase().includes('not found')) throw existing.error;
  const created = await admin.storage.createBucket(STORAGE_BUCKET, options);
  if (created.error && !String(created.error.message || '').toLowerCase().includes('already exists')) throw created.error;
}

async function requireAdmin(admin, token) {
  if (!token) throw Object.assign(new Error('Phiên đăng nhập admin không hợp lệ.'), { status: 401 });
  const userResult = await admin.auth.getUser(token);
  if (userResult.error || !userResult.data.user) {
    throw Object.assign(new Error('Phiên đăng nhập admin đã hết hạn.'), { status: 401 });
  }
  const profileResult = await admin
    .from('vcontent_profiles')
    .select('role,active')
    .eq('auth_user_id', userResult.data.user.id)
    .eq('active', true)
    .maybeSingle();
  if (profileResult.error || !profileResult.data || !ADMIN_ROLES.has(String(profileResult.data.role || ''))) {
    throw Object.assign(new Error('Tài khoản chưa có quyền xem file của nhóm.'), { status: 403 });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'student-survey-attachment', ...RATE_LIMITS.upload })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(res, 500, { ok: false, error: 'Server upload is not configured.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const action = String(body.action || '');
    const formId = String(body.formId || '').trim();
    if (formId !== FORM_ID) throw Object.assign(new Error('Form thực hành không hợp lệ.'), { status: 400 });

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (action === 'signed_upload_url') {
      const sessionId = slugify(body.sessionId).slice(0, 120);
      const applicationIndex = Number(body.applicationIndex || 0);
      const fileName = String(body.fileName || '').trim().slice(0, 240);
      const fileSize = Number(body.fileSize || 0);
      const fileType = String(body.fileType || '').trim().toLowerCase();
      const extension = getExtension(fileName);
      if (!sessionId || !Number.isInteger(applicationIndex) || applicationIndex < 1 || applicationIndex > 4) {
        throw Object.assign(new Error('Phiên hoặc ứng dụng thực hành không hợp lệ.'), { status: 400 });
      }
      if (!fileName || !ALLOWED_EXTENSIONS.has(extension) || !ALLOWED_MIME_TYPES.includes(fileType)) {
        throw Object.assign(new Error('Chỉ nhận PDF, ảnh, Word, Excel, PowerPoint hoặc TXT.'), { status: 400 });
      }
      if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_UPLOAD_BYTES) {
        throw Object.assign(new Error('File phải có dung lượng từ 1 byte đến 10 MB.'), { status: 400 });
      }

      const formResult = await admin
        .from('vcontent_student_survey_forms')
        .select('id,status,settings')
        .eq('id', FORM_ID)
        .eq('status', 'active')
        .maybeSingle();
      if (formResult.error || !formResult.data || formResult.data.settings?.templateVariant !== 'ai-power-practice') {
        throw Object.assign(new Error('Form thực hành đang tạm dừng hoặc chưa sẵn sàng.'), { status: 403 });
      }

      await ensureBucket(admin);
      const safeName = slugify(fileName.replace(/\.[^.]+$/, '')).slice(0, 80) || 'ket-qua-thuc-hanh';
      const objectPath = `survey-practice/${FORM_ID}/${sessionId}/application-${applicationIndex}/${randomUUID()}-${safeName}.${extension}`;
      const signed = await admin.storage.from(STORAGE_BUCKET).createSignedUploadUrl(objectPath);
      if (signed.error) throw signed.error;
      sendJson(res, 200, {
        ok: true,
        upload: {
          bucket: STORAGE_BUCKET,
          path: objectPath,
          token: signed.data.token,
        },
      });
      return;
    }

    if (action === 'signed_download_url') {
      const authHeader = String(req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
      await requireAdmin(admin, token);
      const path = String(body.path || '').trim();
      const expectedPrefix = `survey-practice/${FORM_ID}/`;
      if (!path.startsWith(expectedPrefix) || path.includes('..')) {
        throw Object.assign(new Error('Đường dẫn file không hợp lệ.'), { status: 400 });
      }
      const signed = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(path, 300);
      if (signed.error) throw signed.error;
      sendJson(res, 200, { ok: true, url: signed.data.signedUrl });
      return;
    }

    throw Object.assign(new Error('Unsupported attachment action.'), { status: 400 });
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: String(error.message || error) });
  }
}

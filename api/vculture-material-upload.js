import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

const BUCKET = 'vculture-materials';
const MATERIALS_TABLE = 'vcontent_vculture_materials';
const READ_ROLES = new Set(['admin', 'content_manager', 'production_manager', 'pm', 'coaching_admin', 'coach', 'coachee', 'observer']);
const WRITE_ROLES = new Set(['admin', 'content_manager', 'production_manager', 'pm', 'coaching_admin', 'coach']);

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!response.ok) {
    const message = typeof data === 'string' ? data : data?.msg || data?.message || JSON.stringify(data);
    const error = new Error(message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function buildHeaders(apiKey, authorization) {
  const headers = {
    apikey: apiKey,
    'Content-Type': 'application/json',
  };
  if (authorization) headers.Authorization = authorization;
  return headers;
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

function normalizeRole(value) {
  return String(value || '').trim().toLowerCase();
}

async function ensureBucket(client) {
  const bucketOptions = {
    public: false,
    fileSizeLimit: 50 * 1024 * 1024,
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  };
  const existing = await client.storage.getBucket(BUCKET);
  if (!existing.error) {
    const updated = await client.storage.updateBucket(BUCKET, bucketOptions);
    if (updated.error && !String(updated.error.message || '').toLowerCase().includes('already exists')) {
      throw updated.error;
    }
    return;
  }
  if (!String(existing.error.message || '').toLowerCase().includes('not found')) {
    throw existing.error;
  }

  const created = await client.storage.createBucket(BUCKET, bucketOptions);
  if (created.error && !String(created.error.message || '').toLowerCase().includes('already exists')) {
    throw created.error;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'vculture-material-upload', ...RATE_LIMITS.upload })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Server upload is not configured.' });
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      sendJson(res, 401, { ok: false, error: 'Missing session token.' });
      return;
    }

    const sessionUser = await requestJson(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: buildHeaders(anonKey, `Bearer ${token}`),
    });

    const encodedRequesterId = encodeURIComponent(`eq.${sessionUser.id}`);
    const requesterProfiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active,auth_user_id&auth_user_id=${encodedRequesterId}&active=is.true`,
      {
        method: 'GET',
        headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
      },
    );

    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    const role = normalizeRole(requesterProfile?.role);
    if (!requesterProfile || !READ_ROLES.has(role)) {
      sendJson(res, 403, { ok: false, error: 'No permission for V-culture materials.' });
      return;
    }

    const body = await readJsonBody(req);
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (body.action === 'signed_upload_url') {
      if (!WRITE_ROLES.has(role)) {
        sendJson(res, 403, { ok: false, error: 'No permission to upload V-culture materials.' });
        return;
      }
      const fileName = String(body.fileName || '').trim();
      const chapter = String(body.chapter || '').trim();
      const sessionLabel = String(body.sessionLabel || '').trim();
      const coacheeGroup = String(body.coacheeGroup || '').trim();
      if (!fileName || !chapter || !sessionLabel || !coacheeGroup) {
        sendJson(res, 400, { ok: false, error: 'Missing upload payload.' });
        return;
      }

      await ensureBucket(admin);

      const safeFileName = `${Date.now()}-${slugify(fileName) || 'material'}`;
      const objectPath = [
        'pre-reading',
        slugify(chapter) || 'chapter',
        slugify(sessionLabel) || 'session',
        slugify(coacheeGroup) || 'group',
        safeFileName,
      ].join('/');

      const signedResult = await admin.storage.from(BUCKET).createSignedUploadUrl(objectPath, { upsert: true });
      if (signedResult.error) throw signedResult.error;

      sendJson(res, 200, {
        ok: true,
        upload: {
          bucket: BUCKET,
          path: objectPath,
          token: signedResult.data?.token || '',
          signedUrl: signedResult.data?.signedUrl || '',
          fileName,
        },
      });
      return;
    }

    if (body.action === 'signed_download_url') {
      const materialId = String(body.materialId || '').trim();
      if (!materialId) {
        sendJson(res, 400, { ok: false, error: 'Missing material id.' });
        return;
      }
      const materialRows = await requestJson(
        `${supabaseUrl}/rest/v1/${MATERIALS_TABLE}?select=id,file_name,storage_bucket,storage_path&id=eq.${encodeURIComponent(materialId)}&limit=1`,
        {
          method: 'GET',
          headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
        },
      );
      const material = Array.isArray(materialRows) ? materialRows[0] : null;
      if (!material?.storage_path) {
        sendJson(res, 404, { ok: false, error: 'Material file not found.' });
        return;
      }

      const bucket = String(material.storage_bucket || BUCKET);
      const signedResult = await admin.storage.from(bucket).createSignedUrl(String(material.storage_path), 300, {
        download: String(material.file_name || 'material'),
      });
      if (signedResult.error) throw signedResult.error;

      sendJson(res, 200, {
        ok: true,
        download: {
          signedUrl: signedResult.data?.signedUrl || '',
          fileName: String(material.file_name || 'material'),
        },
      });
      return;
    }

    if (body.action === 'update_material') {
      if (!WRITE_ROLES.has(role)) {
        sendJson(res, 403, { ok: false, error: 'No permission to update V-culture materials.' });
        return;
      }
      const materialId = String(body.materialId || '').trim();
      const fileName = String(body.fileName || '').trim();
      const chapter = String(body.chapter || '').trim();
      const sessionLabel = String(body.sessionLabel || '').trim();
      const coacheeGroup = String(body.coacheeGroup || '').trim();
      if (!materialId || !fileName || !chapter || !sessionLabel || !coacheeGroup) {
        sendJson(res, 400, { ok: false, error: 'Missing material update payload.' });
        return;
      }

      const updated = await admin
        .from(MATERIALS_TABLE)
        .update({
          file_name: fileName,
          chapter,
          session_label: sessionLabel,
          coachee_group: coacheeGroup,
        })
        .eq('id', materialId)
        .select('id,file_name,file_size,content_type,chapter,session_label,coachee_group,owner_name,uploaded_at,storage_bucket,storage_path,deleted_at')
        .maybeSingle();
      if (updated.error) throw updated.error;
      if (!updated.data) {
        sendJson(res, 404, { ok: false, error: 'Material not found.' });
        return;
      }

      sendJson(res, 200, { ok: true, material: updated.data });
      return;
    }

    if (body.action === 'delete_material') {
      if (!WRITE_ROLES.has(role)) {
        sendJson(res, 403, { ok: false, error: 'No permission to delete V-culture materials.' });
        return;
      }
      const materialId = String(body.materialId || '').trim();
      if (!materialId) {
        sendJson(res, 400, { ok: false, error: 'Missing material id.' });
        return;
      }

      const existing = await admin
        .from(MATERIALS_TABLE)
        .select('id,file_name,storage_bucket,storage_path')
        .eq('id', materialId)
        .maybeSingle();
      if (existing.error) throw existing.error;
      if (!existing.data) {
        sendJson(res, 404, { ok: false, error: 'Material not found.' });
        return;
      }

      const bucket = String(existing.data.storage_bucket || BUCKET);
      const storagePath = String(existing.data.storage_path || '');
      if (storagePath) {
        const removed = await admin.storage.from(bucket).remove([storagePath]);
        if (removed.error) throw removed.error;
      }

      const deleted = await admin
        .from(MATERIALS_TABLE)
        .delete()
        .eq('id', materialId)
        .select('id')
        .maybeSingle();
      if (deleted.error) throw deleted.error;
      if (!deleted.data) {
        sendJson(res, 404, { ok: false, error: 'Material metadata was not deleted.' });
        return;
      }

      sendJson(res, 200, { ok: true, deleted: 1, materialId });
      return;
    }

    sendJson(res, 400, { ok: false, error: 'Unsupported material action.' });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

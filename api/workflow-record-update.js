import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

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
  return {
    apikey: apiKey,
    Authorization: authorization || `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'workflow-record-update', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Workflow record update API is not configured.' });
    return;
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      sendJson(res, 401, { ok: false, error: 'Missing session token.' });
      return;
    }

    await requestJson(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: buildHeaders(anonKey, `Bearer ${token}`),
    });

    const body = await readJsonBody(req);
    const kind = String(body.kind || '').trim();
    const recordId = String(body.recordId || '').trim();
    const patch = body.patch && typeof body.patch === 'object' && !Array.isArray(body.patch) ? body.patch : null;
    if (!kind || !recordId || !patch) {
      sendJson(res, 400, { ok: false, error: 'Missing workflow update payload.' });
      return;
    }

    const tableByKind = {
      storyboard: 'vcontent_storyboards',
      slide_design: 'vcontent_slide_designs',
      voice_over: 'vcontent_voice_overs',
      video_edit: 'vcontent_video_edits',
      scorm_package: 'vcontent_scorm_packages',
    };
    const table = tableByKind[kind];
    if (!table) {
      sendJson(res, 400, { ok: false, error: 'Unsupported workflow kind.' });
      return;
    }

    const headers = buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`);
    const encodedId = encodeURIComponent(`eq.${recordId}`);
    const updated = await requestJson(`${supabaseUrl}/rest/v1/${table}?id=${encodedId}&select=*`, {
      method: 'PATCH',
      headers: {
        ...headers,
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
    });

    const record = Array.isArray(updated) ? updated[0] || null : updated;
    if (!record) {
      sendJson(res, 404, { ok: false, error: 'Workflow record not found or not updated.' });
      return;
    }

    sendJson(res, 200, { ok: true, record });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

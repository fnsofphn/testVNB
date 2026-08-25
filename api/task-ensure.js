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

function normalizeAssignee(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function parseStageIndex(value) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) return null;
  return normalized;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'task-ensure', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Task ensure API is not configured.' });
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

    const headers = buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`);
    const encodedRequesterId = encodeURIComponent(`eq.${sessionUser.id}`);
    const requesterProfiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,active&auth_user_id=${encodedRequesterId}&active=is.true&limit=1`,
      { headers },
    );
    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    if (!requesterProfile) {
      sendJson(res, 403, { ok: false, error: 'No active profile mapped to this session.' });
      return;
    }

    const body = await readJsonBody(req);
    const orderId = String(body.orderId || '').trim();
    const productId = String(body.productId || '').trim();
    const stageIndex = parseStageIndex(body.stageIndex);
    if (!orderId || !productId || stageIndex === null) {
      sendJson(res, 400, { ok: false, error: 'Missing task payload.' });
      return;
    }

    const encodedOrderId = encodeURIComponent(`eq.${orderId}`);
    const encodedProductId = encodeURIComponent(`eq.${productId}`);
    const encodedStageIndex = encodeURIComponent(`eq.${stageIndex}`);
    const existing = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_tasks?select=*&order_id=${encodedOrderId}&product_id=${encodedProductId}&stage_index=${encodedStageIndex}&archived=is.false&limit=1`,
      { headers },
    );
    if (Array.isArray(existing) && existing[0]) {
      sendJson(res, 200, { ok: true, task: existing[0] });
      return;
    }

    const payload = {
      id: `TASK-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      order_id: orderId,
      product_id: productId,
      stage_index: stageIndex,
      status: String(body.status || 'todo').trim() || 'todo',
      progress: Number.isFinite(Number(body.progress)) ? Number(body.progress) : 0,
      due_date: normalizeAssignee(body.dueDate),
      assignee: normalizeAssignee(body.assignee),
      assignee_profile_id: normalizeAssignee(body.assigneeProfileId),
      assignee_account_id: normalizeAssignee(body.assigneeAccountId),
      archived: false,
    };

    let created = null;
    try {
      created = await requestJson(`${supabaseUrl}/rest/v1/vcontent_tasks?select=*`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      const message = String(error?.message || error || '');
      if (!message.toLowerCase().includes('assignee_profile_id') && !message.toLowerCase().includes('assignee_account_id')) {
        throw error;
      }
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
      created = await requestJson(`${supabaseUrl}/rest/v1/vcontent_tasks?select=*`, {
        method: 'POST',
        headers: {
          ...headers,
          Prefer: 'return=representation',
        },
        body: JSON.stringify(legacyPayload),
      });
    }

    sendJson(res, 200, { ok: true, task: Array.isArray(created) ? created[0] : created });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
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

function normalizeRole(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
  if (['quan_ly_noi_dung', 'quan_ly_don_hang', 'order_manager'].includes(normalized)) return 'content_manager';
  if (normalized === 'quan_ly_san_xuat') return 'production_manager';
  return normalized;
}

function uniqueIds(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function inFilter(values) {
  return `in.(${values.join(',')})`;
}

async function selectIds(supabaseUrl, table, column, filterColumn, filterValue, headers) {
  const rows = await requestJson(
    `${supabaseUrl}/rest/v1/${table}?select=${column}&${filterColumn}=${encodeURIComponent(filterValue)}`,
    { headers },
  );
  return uniqueIds((Array.isArray(rows) ? rows : []).map((row) => row?.[column]));
}

async function deleteByEq(supabaseUrl, table, column, value, headers) {
  if (!value) return;
  await requestJson(`${supabaseUrl}/rest/v1/${table}?${column}=${encodeURIComponent(`eq.${value}`)}`, {
    method: 'DELETE',
    headers,
  });
}

async function deleteByIn(supabaseUrl, table, column, values, headers) {
  const ids = uniqueIds(values);
  if (!ids.length) return;
  await requestJson(`${supabaseUrl}/rest/v1/${table}?${column}=${encodeURIComponent(inFilter(ids))}`, {
    method: 'DELETE',
    headers,
  });
}

async function deleteOrderCascade(supabaseUrl, orderId, headers) {
  const storyboards = await selectIds(supabaseUrl, 'vcontent_storyboards', 'id', 'order_id', `eq.${orderId}`, headers);
  const slideDesigns = await selectIds(supabaseUrl, 'vcontent_slide_designs', 'id', 'order_id', `eq.${orderId}`, headers);
  const voiceOvers = await selectIds(supabaseUrl, 'vcontent_voice_overs', 'id', 'order_id', `eq.${orderId}`, headers);
  const videoEdits = await selectIds(supabaseUrl, 'vcontent_video_edits', 'id', 'order_id', `eq.${orderId}`, headers);
  const scormPackages = await selectIds(supabaseUrl, 'vcontent_scorm_packages', 'id', 'order_id', `eq.${orderId}`, headers);

  await deleteByIn(supabaseUrl, 'vcontent_storyboard_reviews', 'storyboard_id', storyboards, headers);
  await deleteByIn(supabaseUrl, 'vcontent_slide_design_reviews', 'slide_design_id', slideDesigns, headers);
  await deleteByIn(supabaseUrl, 'vcontent_voice_reviews', 'voice_over_id', voiceOvers, headers);
  await deleteByIn(supabaseUrl, 'vcontent_video_reviews', 'video_edit_id', videoEdits, headers);
  await deleteByIn(supabaseUrl, 'vcontent_scorm_reviews', 'scorm_package_id', scormPackages, headers);

  await deleteByEq(supabaseUrl, 'vcontent_storyboards', 'order_id', orderId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_slide_designs', 'order_id', orderId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_voice_overs', 'order_id', orderId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_video_edits', 'order_id', orderId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_scorm_packages', 'order_id', orderId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_input_items', 'order_id', orderId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_tasks', 'order_id', orderId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_products', 'order_id', orderId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_orders', 'id', orderId, headers);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'order-delete', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Order delete API is not configured.' });
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
    const profiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active&auth_user_id=${encodeURIComponent(`eq.${sessionUser.id}`)}&active=is.true&limit=1`,
      { headers },
    );
    const profile = Array.isArray(profiles) ? profiles[0] : null;
    if (!profile) {
      sendJson(res, 403, { ok: false, error: 'No active profile mapped to this session.' });
      return;
    }

    const role = normalizeRole(profile.role);
    if (!['admin', 'content_manager', 'pm'].includes(role)) {
      sendJson(res, 403, { ok: false, error: 'This role cannot delete orders.' });
      return;
    }

    const body = await readJsonBody(req);
    const orderIds = uniqueIds(Array.isArray(body.orderIds) ? body.orderIds : [body.orderId]);
    if (!orderIds.length) {
      sendJson(res, 400, { ok: false, error: 'Missing order ids.' });
      return;
    }

    for (const orderId of orderIds) {
      await deleteOrderCascade(supabaseUrl, orderId, headers);
    }

    sendJson(res, 200, { ok: true, deleted: orderIds.length });
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: String(error.message || error) });
  }
}

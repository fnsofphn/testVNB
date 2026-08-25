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

async function selectRows(supabaseUrl, table, select, query, headers) {
  return requestJson(`${supabaseUrl}/rest/v1/${table}?select=${select}&${query}`, { headers });
}

async function selectIds(supabaseUrl, table, column, filterColumn, filterValue, headers) {
  const rows = await selectRows(supabaseUrl, table, column, `${filterColumn}=${encodeURIComponent(filterValue)}`, headers);
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

function pruneOrderOverrides(overrides, productId) {
  const next = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? { ...overrides } : {};

  if (next.production_plan_products && typeof next.production_plan_products === 'object' && !Array.isArray(next.production_plan_products)) {
    const productPlans = { ...next.production_plan_products };
    delete productPlans[productId];
    next.production_plan_products = productPlans;
  }

  if (next.tracking_assignments && typeof next.tracking_assignments === 'object' && !Array.isArray(next.tracking_assignments)) {
    const assignments = {};
    for (const [key, value] of Object.entries(next.tracking_assignments)) {
      const assignment = value && typeof value === 'object' ? value : {};
      if (assignment.productId === productId || key.startsWith(`${productId}::`)) continue;
      assignments[key] = value;
    }
    next.tracking_assignments = assignments;
  }

  return next;
}

async function updateOrderOverrides(supabaseUrl, orderId, productId, headers) {
  const orders = await selectRows(
    supabaseUrl,
    'vcontent_orders',
    'id,stage_sla_overrides',
    `id=${encodeURIComponent(`eq.${orderId}`)}&limit=1`,
    headers,
  );
  const order = Array.isArray(orders) ? orders[0] : null;
  if (!order) return;

  await requestJson(`${supabaseUrl}/rest/v1/vcontent_orders?id=${encodeURIComponent(`eq.${orderId}`)}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ stage_sla_overrides: pruneOrderOverrides(order.stage_sla_overrides, productId) }),
  });
}

async function deleteProductCascade(supabaseUrl, productId, orderId, headers) {
  const storyboards = await selectIds(supabaseUrl, 'vcontent_storyboards', 'id', 'product_id', `eq.${productId}`, headers);
  const slideDesigns = await selectIds(supabaseUrl, 'vcontent_slide_designs', 'id', 'product_id', `eq.${productId}`, headers);
  const voiceOvers = await selectIds(supabaseUrl, 'vcontent_voice_overs', 'id', 'product_id', `eq.${productId}`, headers);
  const videoEdits = await selectIds(supabaseUrl, 'vcontent_video_edits', 'id', 'product_id', `eq.${productId}`, headers);
  const scormPackages = await selectIds(supabaseUrl, 'vcontent_scorm_packages', 'id', 'product_id', `eq.${productId}`, headers);

  await deleteByIn(supabaseUrl, 'vcontent_storyboard_reviews', 'storyboard_id', storyboards, headers);
  await deleteByIn(supabaseUrl, 'vcontent_slide_design_reviews', 'slide_design_id', slideDesigns, headers);
  await deleteByIn(supabaseUrl, 'vcontent_voice_reviews', 'voice_over_id', voiceOvers, headers);
  await deleteByIn(supabaseUrl, 'vcontent_video_reviews', 'video_edit_id', videoEdits, headers);
  await deleteByIn(supabaseUrl, 'vcontent_scorm_reviews', 'scorm_package_id', scormPackages, headers);

  await deleteByEq(supabaseUrl, 'vcontent_storyboards', 'product_id', productId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_slide_designs', 'product_id', productId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_voice_overs', 'product_id', productId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_video_edits', 'product_id', productId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_scorm_packages', 'product_id', productId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_input_items', 'product_id', productId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_tasks', 'product_id', productId, headers);
  await deleteByEq(supabaseUrl, 'vcontent_products', 'id', productId, headers);

  if (orderId) {
    await updateOrderOverrides(supabaseUrl, orderId, productId, headers);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'product-delete', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Product delete API is not configured.' });
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
      sendJson(res, 403, { ok: false, error: 'This role cannot delete products.' });
      return;
    }

    const body = await readJsonBody(req);
    const productId = String(body.productId || '').trim();
    if (!productId) {
      sendJson(res, 400, { ok: false, error: 'Missing product id.' });
      return;
    }

    let orderId = String(body.orderId || '').trim();
    if (!orderId) {
      const products = await selectRows(
        supabaseUrl,
        'vcontent_products',
        'id,order_id',
        `id=${encodeURIComponent(`eq.${productId}`)}&limit=1`,
        headers,
      );
      const product = Array.isArray(products) ? products[0] : null;
      orderId = product?.order_id || '';
    }

    await deleteProductCascade(supabaseUrl, productId, orderId, headers);
    sendJson(res, 200, { ok: true, deleted: 1 });
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: String(error.message || error) });
  }
}

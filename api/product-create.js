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

function normalizeOrderCodeFragment(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
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

function normalizeDateOnly(value) {
  return String(value || '').slice(0, 10);
}

function isDateAfter(value, maxValue) {
  const normalizedValue = normalizeDateOnly(value);
  const normalizedMaxValue = normalizeDateOnly(maxValue);
  if (!normalizedValue || !normalizedMaxValue) return false;
  return normalizedValue > normalizedMaxValue;
}

function inferProductWorkflowModule(productId, fallbackModule) {
  const normalized = String(productId || '').toLowerCase();
  const normalizedUnderscore = normalized.replace(/-/g, '_');
  if (normalized.includes('-video-')) return 'VIDEO';
  if (normalized.includes('-game-')) return 'GAME';
  if (/[_-]h\d{2,}$/i.test(normalized) || /_h\d{2,}$/i.test(normalizedUnderscore)) return 'VIDEO';
  if (/[_-]g\d{2,}$/i.test(normalized) || /_g\d{2,}$/i.test(normalizedUnderscore)) return 'GAME';
  if (fallbackModule === 'VIDEO') return 'VIDEO';
  if (fallbackModule === 'GAME') return 'GAME';
  return 'ELN';
}

function getWorkflowStageIndicesByModule(module) {
  if (module === 'VIDEO') return [0, 1, 2, 3, 4, 5, 6, 7];
  if (module === 'GAME') return [0, 1, 2, 3];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8];
}

function getInputTemplate(moduleCode) {
  const sharedTemplate = [
    { code: 'lesson_plan', label: '01. Giáo án', type: 'document', required: true },
    { code: 'task_outline', label: '02. Đề cương nhiệm vụ', type: 'scope', required: true },
    { code: 'logo_files', label: '03. Logo files (PNG + SVG)', type: 'asset', required: true },
    { code: 'lesson_script', label: '04. Kịch bản lời thoại', type: 'script', required: true },
    { code: 'brand_guidelines', label: '05. Brand Guidelines', type: 'brand', required: false },
    { code: 'typography', label: '06. Typography', type: 'font', required: false },
    { code: 'extended_reference', label: '07. Kiến thức / Tư liệu mở rộng', type: 'reference', required: false },
    { code: 'voice_script', label: '08. Kịch bản thu voice', type: 'voice_script', required: false },
  ];
  const gameTemplate = [
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
  const elnTemplate = [
    ...sharedTemplate,
    { code: 'scorm_quiz', label: '09. Quiz SCORM', type: 'scorm_quiz', required: false },
  ];
  if (moduleCode === 'GAME') return gameTemplate;
  return moduleCode === 'VIDEO' ? sharedTemplate : elnTemplate;
}

async function insertRows(supabaseUrl, table, rows, headers) {
  if (!rows.length) return [];
  return requestJson(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify(rows),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'product-create', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Product create API is not configured.' });
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
    const requesterProfiles = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active&auth_user_id=${encodeURIComponent(`eq.${sessionUser.id}`)}&active=is.true&limit=1`,
      { headers },
    );
    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    if (!requesterProfile) {
      sendJson(res, 403, { ok: false, error: 'No active profile mapped to this session.' });
      return;
    }

    const role = normalizeRole(requesterProfile.role);
    if (!['admin', 'content_manager', 'pm'].includes(role)) {
      sendJson(res, 403, { ok: false, error: 'This role cannot create products.' });
      return;
    }

    const body = await readJsonBody(req);
    const orderId = String(body.orderId || '').trim();
    const normalizedCode = normalizeOrderCodeFragment(body.productCode || '');
    const productName = String(body.productName || '').normalize('NFC').trim();
    if (!orderId || !normalizedCode || !productName) {
      sendJson(res, 400, { ok: false, error: 'Missing order, product code or product name.' });
      return;
    }

    const orders = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_orders?select=deadline&id=${encodeURIComponent(`eq.${orderId}`)}&limit=1`,
      { headers },
    );
    const orderDeadline = Array.isArray(orders) && orders[0] ? orders[0].deadline : null;
    if (isDateAfter(body.dueDate, orderDeadline)) {
      sendJson(res, 400, { ok: false, error: 'Deadline sản phẩm không được sau deadline của đơn hàng.' });
      return;
    }

    const productId = `${orderId}-${normalizedCode.toLowerCase()}`;
    const existing = await requestJson(
      `${supabaseUrl}/rest/v1/vcontent_products?select=id&id=${encodeURIComponent(`eq.${productId}`)}&limit=1`,
      { headers },
    );
    if (Array.isArray(existing) && existing.length) {
      sendJson(res, 409, { ok: false, error: 'Mã sản phẩm đã tồn tại trong đơn hàng này.' });
      return;
    }

    const module = inferProductWorkflowModule(productId, body.fallbackModule);
    const productPayload = {
      id: productId,
      order_id: orderId,
      name: productName,
      current_stage_index: 0,
      progress: 0,
      ready_for_delivery: false,
      finished: false,
      delivered_at: null,
    };

    const createdProducts = await insertRows(supabaseUrl, 'vcontent_products', [productPayload], headers);
    const taskPayload = getWorkflowStageIndicesByModule(module).map((stageIndex, index) => ({
      id: `TASK-${Date.now()}-${index + 1}`,
      order_id: orderId,
      product_id: productId,
      stage_index: stageIndex,
      status: 'todo',
      progress: 0,
      due_date: body.dueDate || null,
      assignee: null,
      assignee_profile_id: null,
      assignee_account_id: null,
      archived: false,
    }));

    try {
      await insertRows(supabaseUrl, 'vcontent_tasks', taskPayload, headers);
    } catch (error) {
      const message = String(error?.message || error || '').toLowerCase();
      if (!message.includes('assignee_profile_id') && !message.includes('assignee_account_id')) throw error;
      await insertRows(
        supabaseUrl,
        'vcontent_tasks',
        taskPayload.map(({ assignee_profile_id, assignee_account_id, ...task }) => task),
        headers,
      );
    }

    const inputPayload = getInputTemplate(module).map((item) => ({
      id: `IN-${orderId}-${productId}-${item.code}`,
      order_id: orderId,
      product_id: productId,
      module,
      item_code: item.code,
      label: item.label,
      item_type: item.type,
      required: item.required,
      status: 'changes_requested',
      file_name: null,
      file_url: null,
      notes: 'Đang chờ client/PM bổ sung.',
      owner_profile_id: body.ownerProfileId || null,
      due_date: null,
    }));
    await insertRows(supabaseUrl, 'vcontent_input_items', inputPayload, headers);

    sendJson(res, 200, {
      ok: true,
      product: Array.isArray(createdProducts) && createdProducts[0] ? createdProducts[0] : productPayload,
    });
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: String(error.message || error) });
  }
}

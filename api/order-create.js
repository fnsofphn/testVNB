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

function clampBundleCount(value) {
  return Math.max(0, Math.min(20, Number(value) || 0));
}

function getOrderModuleLabel(bundleCounts) {
  const activeModules = [
    bundleCounts.eln > 0 ? 'ELN' : null,
    bundleCounts.video > 0 ? 'VIDEO' : null,
    bundleCounts.game > 0 ? 'GAME' : null,
  ].filter(Boolean);
  if (activeModules.length === 1) return activeModules[0];
  return activeModules.length > 1 ? 'MIXED' : 'ELN';
}

function getOrderModuleLabelFromType(orderType) {
  const normalized = String(orderType || '').trim().toUpperCase();
  if (normalized === 'H') return 'VIDEO';
  if (normalized === 'G') return 'GAME';
  if (normalized === 'M') return 'MIXED';
  return 'ELN';
}

function inferOrderTypeFromBundleCounts(bundleCounts) {
  const activeTypes = [
    bundleCounts.eln > 0 ? 'E' : null,
    bundleCounts.video > 0 ? 'H' : null,
    bundleCounts.game > 0 ? 'G' : null,
  ].filter(Boolean);
  return activeTypes.length === 1 ? activeTypes[0] : 'M';
}

function buildDisplayOrderCode(input) {
  const client = normalizeOrderCodeFragment(input.client || '');
  const project = normalizeOrderCodeFragment(input.projectCode || '');
  const type = normalizeOrderCodeFragment(input.orderType || '');
  const parts = [client, project, type].filter(Boolean);
  if (parts.length) return parts.join('_');
  return normalizeOrderCodeFragment(input.fallbackOrderId || '') || String(input.fallbackOrderId || '').trim() || 'ORDER';
}

function normalizeDisplayOrderCode(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function mapModuleToOrderProductKind(module) {
  if (module === 'VIDEO') return 'H';
  if (module === 'GAME') return 'G';
  return 'E';
}

function buildManualProductPayload(orderId, title, products) {
  const counters = { eln: 0, video: 0, game: 0 };
  return products.map((product) => {
    const bundleKey = product.module === 'VIDEO' ? 'video' : product.module === 'GAME' ? 'game' : 'eln';
    counters[bundleKey] += 1;
    const itemNo = String(counters[bundleKey]).padStart(2, '0');
    const kind = product.kind || mapModuleToOrderProductKind(product.module);
    const code = normalizeOrderCodeFragment(product.code || '');
    const normalizedCode = code || `${orderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}${kind}${itemNo}`;
    return {
      id: `${orderId}-${normalizedCode.toLowerCase()}`,
      order_id: orderId,
      name: String(product.name || '').trim() || `${title} / ${product.module} ${itemNo}`,
      current_stage_index: 0,
      progress: 0,
      ready_for_delivery: false,
      finished: false,
      delivered_at: null,
    };
  });
}

function buildProductBundlePayload(orderId, title, bundleCounts) {
  const specs = [
    { code: 'eln', label: 'E-learning', count: bundleCounts.eln },
    { code: 'video', label: 'Video', count: bundleCounts.video },
    { code: 'game', label: 'Gamification', count: bundleCounts.game },
  ];
  return specs.flatMap((spec) =>
    Array.from({ length: spec.count }, (_value, index) => {
      const itemNo = String(index + 1).padStart(2, '0');
      return {
        id: `${orderId}-${spec.code}-${itemNo}`,
        order_id: orderId,
        name: `${title} / ${spec.label} ${itemNo}`,
        current_stage_index: 0,
        progress: 0,
        ready_for_delivery: false,
        finished: false,
        delivered_at: null,
      };
    }),
  );
}

function buildPlannedProductPayload(input) {
  return Array.from({ length: input.plannedProductCount }, (_value, index) => {
    const itemNo = String(index + 1).padStart(2, '0');
    const normalizedCode = normalizeOrderCodeFragment(`${input.displayOrderCode}_${itemNo}`);
    return {
      id: `${input.orderId}-${normalizedCode.toLowerCase()}`,
      order_id: input.orderId,
      name: '',
      current_stage_index: 0,
      progress: 0,
      ready_for_delivery: false,
      finished: false,
      delivered_at: null,
    };
  });
}

function inferProductWorkflowModule(productId, fallbackModule) {
  const normalized = String(productId || '').toLowerCase();
  if (normalized.includes('-video-') || normalized.endsWith('-h') || normalized.match(/h\d+$/)) return 'VIDEO';
  if (normalized.includes('-game-') || normalized.endsWith('-g') || normalized.match(/g\d+$/)) return 'GAME';
  if (fallbackModule === 'VIDEO' || fallbackModule === 'GAME') return fallbackModule;
  return 'ELN';
}

function getWorkflowStageIndicesByModule(module) {
  if (module === 'VIDEO') return [0, 1, 2, 3, 4, 5, 6, 7];
  if (module === 'GAME') return [0, 1, 2, 3];
  return [0, 1, 2, 3, 4, 5, 6, 7, 8];
}

async function getNextOrderId(supabaseUrl, headers) {
  const rows = await requestJson(
    `${supabaseUrl}/rest/v1/vcontent_orders?select=id&order=created_at.desc&limit=500`,
    { headers },
  );
  const numericIds = (Array.isArray(rows) ? rows : [])
    .map((item) => /^ord-(\d{4})$/i.exec(String(item.id || '').trim()))
    .filter(Boolean)
    .map((match) => Number(match?.[1] || 0));
  const nextNumber = (numericIds.length ? Math.max(...numericIds) : 0) + 1;
  return `ord-${String(nextNumber).padStart(4, '0')}`;
}

function buildTaskPayload(orderId, products, fallbackModule, dueDate) {
  let counter = 0;
  return products.flatMap((product) => {
    const module = inferProductWorkflowModule(product.id, fallbackModule);
    return getWorkflowStageIndicesByModule(module).map((stageIndex) => {
      counter += 1;
      return {
        id: `TASK-${Date.now()}-${counter}`,
        order_id: orderId,
        product_id: product.id,
        stage_index: stageIndex,
        status: 'todo',
        progress: 0,
        due_date: dueDate || null,
        assignee: null,
        assignee_profile_id: null,
        assignee_account_id: null,
        archived: false,
      };
    });
  });
}

async function insertRows(supabaseUrl, table, rows, headers) {
  if (!rows.length) return [];
  return requestJson(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(rows),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'order-create', ...RATE_LIMITS.mutation })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Order create API is not configured.' });
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
      `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active,company_id,full_name&auth_user_id=${encodedRequesterId}&active=is.true&limit=1`,
      { headers },
    );
    const requesterProfile = Array.isArray(requesterProfiles) ? requesterProfiles[0] : null;
    if (!requesterProfile) {
      sendJson(res, 403, { ok: false, error: 'No active profile mapped to this session.' });
      return;
    }

    const role = normalizeRole(requesterProfile.role);
    const managerRoles = new Set(['admin', 'content_manager', 'pm']);
    const selfServiceRoles = new Set(['client', 'client_director']);
    if (!managerRoles.has(role) && !selfServiceRoles.has(role)) {
      sendJson(res, 403, { ok: false, error: 'This role cannot create orders.' });
      return;
    }

    const body = await readJsonBody(req);
    const createdByProfileId = String(body.createdByProfileId || '').trim();
    if (!managerRoles.has(role) && createdByProfileId !== String(requesterProfile.id)) {
      sendJson(res, 403, { ok: false, error: 'Cannot create orders for another profile.' });
      return;
    }

    const title = String(body.title || '').normalize('NFC').trim();
    const deadline = String(body.deadline || '').trim();
    const clientName = String(body.client || requesterProfile.full_name || '').normalize('NFC').trim();
    if (!title || !deadline || !clientName) {
      sendJson(res, 400, { ok: false, error: 'Missing order title, client or deadline.' });
      return;
    }

    const orderId = await getNextOrderId(supabaseUrl, headers);
    const manualProducts = (Array.isArray(body.products) ? body.products : [])
      .map((product) => ({
        module: product.module === 'VIDEO' || product.module === 'GAME' ? product.module : 'ELN',
        kind: product.kind,
        code: String(product.code || '').trim(),
        name: String(product.name || '').trim(),
      }))
      .filter((product) => product.name);

    const initialBundleCounts = body.bundleCounts || {};
    const bundleCounts = manualProducts.length
      ? manualProducts.reduce(
          (acc, product) => {
            if (product.module === 'VIDEO') acc.video += 1;
            else if (product.module === 'GAME') acc.game += 1;
            else acc.eln += 1;
            return acc;
          },
          { eln: 0, video: 0, game: 0 },
        )
      : {
          eln: clampBundleCount(initialBundleCounts.eln),
          video: clampBundleCount(initialBundleCounts.video),
          game: clampBundleCount(initialBundleCounts.game),
        };

    const totalProducts = bundleCounts.eln + bundleCounts.video + bundleCounts.game;
    const orderMetaInput = body.orderMeta && typeof body.orderMeta === 'object' ? body.orderMeta : {};
    const plannedProductCount = Math.max(0, Math.floor(Number(body.plannedProductCount || totalProducts || 0)));
    const inferredOrderType = String(orderMetaInput.order_type || inferOrderTypeFromBundleCounts(bundleCounts));
    const requestedDisplayOrderCode = normalizeDisplayOrderCode(orderMetaInput.display_order_code || '');
    const orderMeta = {
      ...orderMetaInput,
      display_order_code:
        requestedDisplayOrderCode ||
        buildDisplayOrderCode({
          client: clientName,
          projectCode: String(orderMetaInput.project_code || ''),
          orderType: inferredOrderType,
          fallbackOrderId: orderId,
        }),
      total_products: plannedProductCount,
    };
    const effectiveBundleCounts =
      totalProducts > 0
        ? bundleCounts
        : inferredOrderType === 'H'
          ? { eln: 0, video: plannedProductCount, game: 0 }
          : inferredOrderType === 'G'
            ? { eln: 0, video: 0, game: plannedProductCount }
            : { eln: plannedProductCount, video: 0, game: 0 };

    const orderPayload = {
      id: orderId,
      client: clientName,
      company_id: body.companyId || requesterProfile.company_id || null,
      title,
      module: plannedProductCount > 0 ? getOrderModuleLabel(effectiveBundleCounts) : getOrderModuleLabelFromType(inferredOrderType),
      deadline,
      status: String(body.status || 'draft').trim() || 'draft',
      submitted_at: body.status === 'submitted' ? new Date().toISOString() : null,
      launched_at: null,
      assignees: {},
      created_by_profile_id: createdByProfileId || requesterProfile.id,
      intake_note: String(body.intakeNote || ''),
      rejection_reason: '',
      change_request_reason: '',
      stage_sla_overrides: { order_meta: orderMeta },
    };

    const productPayload = manualProducts.length
      ? buildManualProductPayload(orderId, title, manualProducts)
      : totalProducts > 0
        ? buildProductBundlePayload(orderId, title, bundleCounts)
        : buildPlannedProductPayload({
            orderId,
            title,
            plannedProductCount,
            displayOrderCode: String(orderMeta.display_order_code || orderId),
          });

    await insertRows(supabaseUrl, 'vcontent_orders', [orderPayload], headers);
    await insertRows(supabaseUrl, 'vcontent_products', productPayload, headers);

    const taskPayload = buildTaskPayload(orderId, productPayload, orderPayload.module, deadline);
    try {
      await insertRows(supabaseUrl, 'vcontent_tasks', taskPayload, headers);
    } catch (error) {
      const message = String(error?.message || error || '').toLowerCase();
      if (!message.includes('assignee_profile_id') && !message.includes('assignee_account_id')) {
        throw error;
      }
      await insertRows(
        supabaseUrl,
        'vcontent_tasks',
        taskPayload.map(({ assignee_profile_id, assignee_account_id, ...task }) => task),
        headers,
      );
    }

    sendJson(res, 200, {
      ok: true,
      result: {
        orderId,
        orderModule: orderPayload.module,
        productIds: productPayload.map((item) => item.id),
        bundleCounts: effectiveBundleCounts,
        displayOrderCode: String(orderMeta.display_order_code || orderId),
        productCount: productPayload.length,
      },
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

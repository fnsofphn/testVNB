import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';
import { createHash } from 'node:crypto';

const NOTICE_HTTP_TIMEOUT_MS = 10_000;
const NOTICE_SMTP_TIMEOUT_MS = 12_000;
const NOTICE_RECIPIENT_CONCURRENCY = 4;

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

function buildHeaders(apiKey, authorization) {
  return {
    apikey: apiKey,
    Authorization: authorization || `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

async function requestJson(url, options = {}) {
  const { timeoutMs = NOTICE_HTTP_TIMEOUT_MS, ...fetchOptions } = options;
  const response = await fetch(url, {
    ...fetchOptions,
    signal: fetchOptions.signal || AbortSignal.timeout(timeoutMs),
  });
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
    error.payload = data;
    throw error;
  }
  return data;
}

function isMissingNoticeDeliverySchema(error) {
  const code = String(error?.payload?.code || '');
  const message = String(error?.message || '');
  return code === 'PGRST204'
    || code === '42703'
    || /event_key|recipient_profile_id|recipient_account_id|email_status|schema cache/i.test(message);
}

function logNotice(level, fields) {
  const line = JSON.stringify({
    level,
    route: 'notice-dispatch',
    module: 'shared',
    region: process.env.VERCEL_REGION || 'unknown',
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) }, () => runWorker()),
  );
  return results;
}

async function optionalRequestJson(url, options = {}) {
  try {
    return await requestJson(url, options);
  } catch {
    return null;
  }
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function compactStrings(values) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function recipientEventKey(recipient) {
  if (recipient?.id) return String(recipient.id);
  return `email-${createHash('sha256').update(String(recipient?.email || '').trim().toLowerCase()).digest('hex').slice(0, 24)}`;
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

function getDisplayProductCode(productId, orderId) {
  const rawProductId = String(productId || '').trim();
  const rawOrderId = String(orderId || '').trim();
  const withoutOrderPrefix =
    rawOrderId && rawProductId.toLowerCase().startsWith(`${rawOrderId.toLowerCase()}-`)
      ? rawProductId.slice(rawOrderId.length + 1)
      : rawProductId;
  return withoutOrderPrefix
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function restEq(column, value) {
  return `${column}=eq.${encodeURIComponent(String(value))}`;
}

function stagePageFrom(module, stageIndex) {
  const normalizedModule = String(module || '').toUpperCase();
  const index = Number(stageIndex);
  if (!Number.isInteger(index) || index < 0) return null;
  const pages =
    normalizedModule === 'VIDEO'
      ? ['vsmf01', 'vsmf02', 'vsmf03', 'vsmf04', 'vsmf05', 'vsmf06', 'vsmf07', 'vsmf08']
      : normalizedModule === 'GAME'
        ? ['gsmf01', 'gsmf02', 'gsmf03', 'gsmf04']
        : ['smf01', 'smf02', 'smf03', 'smf04', 'smf05', 'smf06', 'smf07', 'smf08', 'smf09'];
  return pages[index] || null;
}

function pageFromStageCode(stageCode) {
  const value = String(stageCode || '').trim().toLowerCase();
  if (/^(v?smf|gsmf)\d{2}$/.test(value)) return value;
  return null;
}

function getLinkPage(input, metadata, context) {
  return (
    String(input.linkPage || metadata.link_page || '').trim() ||
    pageFromStageCode(metadata.stage_code) ||
    stagePageFrom(metadata.module || context.order?.module, metadata.stage_index) ||
    'my-tasks'
  );
}

function getLevel(eventType, inputLevel) {
  if (inputLevel) return inputLevel;
  if (/returned|changes_requested|fail|rejected/i.test(eventType)) return 'danger';
  if (/approved|passed|completed|done/i.test(eventType)) return 'success';
  if (/submitted|review|claimed|assigned|started/i.test(eventType)) return 'warning';
  return 'info';
}

function getStageLabel(metadata, context) {
  return (
    String(metadata.stage_code || metadata.stage_label || '').trim() ||
    stagePageFrom(metadata.module || context.order?.module, metadata.stage_index)?.toUpperCase() ||
    'Workflow'
  );
}

function withVinabrainSender(from) {
  const value = String(from || '').trim();
  if (!value) return value;
  const renamed = value.replace(/VContent/gi, 'Vinabrain');
  if (/<[^>]+>$/.test(renamed)) return renamed;
  return `Vinabrain <${renamed}>`;
}

function buildMessage(input, context) {
  const metadata = input.metadata || {};
  const eventType = String(input.eventType || '');
  const productCode = String(
    metadata.display_product_code ||
      getDisplayProductCode(context.product?.id || metadata.product_id || input.objectId, context.order?.id || metadata.order_id) ||
      '',
  ).trim();
  const productName = String(context.product?.name || metadata.product_name || '').trim();
  const orderCode = String(metadata.display_order_code || context.order?.id || metadata.order_id || '').trim();
  const stage = getStageLabel(metadata, context);
  const target = [productCode, productName].filter(Boolean).join(' - ') || orderCode || 'Công việc';
  let title = String(input.title || '').trim();

  if (!title) {
    if (/returned|changes_requested|fail|rejected/i.test(eventType)) title = `${stage} bị trả lại`;
    else if (/approved|passed/i.test(eventType)) title = `${stage} đã được duyệt`;
    else if (/submitted/i.test(eventType)) title = `${stage} đang chờ duyệt`;
    else if (/claimed|review/i.test(eventType)) title = `${stage} đang được review`;
    else if (/assigned/i.test(eventType)) title = `${stage} được phân công`;
    else if (/started/i.test(eventType)) title = `${stage} đã bắt đầu`;
    else if (/input_item/i.test(eventType)) title = 'Input đã cập nhật trạng thái';
    else if (/stage_changed/i.test(eventType)) title = `${target} chuyển bước`;
    else title = 'Cập nhật liên quan đến bạn';
  }

  const summary = String(input.summary || '').trim();
  const status = String(metadata.status || metadata.next_status || '').trim();
  const previousStatus = String(metadata.previous_status || '').trim();
  const reason = String(metadata.reason || metadata.comment || metadata.feedback || '').trim();
  const parts = [
    target,
    orderCode ? `Đơn hàng: ${orderCode}` : '',
    previousStatus && status ? `Trạng thái: ${previousStatus} -> ${status}` : status ? `Trạng thái: ${status}` : '',
    summary,
    reason ? `Ghi chú: ${reason}` : '',
  ].filter(Boolean);
  const body = String(input.body || '').trim() || parts.join('\n');

  return { title, body };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendEmail({ to, subject, text, linkPage }) {
  const provider = String(process.env.NOTICE_EMAIL_PROVIDER || '').trim().toLowerCase();
  const from = withVinabrainSender(process.env.NOTICE_EMAIL_FROM || '');
  const apiKey = String(process.env.NOTICE_EMAIL_API_KEY || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY || '').trim();
  const smtpHost = String(process.env.NOTICE_SMTP_HOST || '').trim();
  const smtpPort = Number(process.env.NOTICE_SMTP_PORT || 587);
  const smtpUser = String(process.env.NOTICE_SMTP_USER || '').trim();
  const smtpPass = String(process.env.NOTICE_SMTP_PASS || '').trim();
  const appUrl = String(process.env.NOTICE_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '').trim();
  const absoluteLink = appUrl ? `${appUrl.startsWith('http') ? appUrl : `https://${appUrl}`}/${String(linkPage || '').replace(/^\/+/, '')}` : '';

  if (!to) return { status: 'skipped', provider: provider || 'none', error: 'Recipient email is missing.' };
  if (!provider || provider === 'none') return { status: 'skipped', provider: 'none', error: 'Email provider is not configured.' };
  if (!from) return { status: 'skipped', provider, error: 'Email sender is not configured.' };

  const html = [
    `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`,
    absoluteLink ? `<p><a href="${escapeHtml(absoluteLink)}">Mở màn liên quan</a></p>` : '',
  ].join('');

  if (provider === 'resend') {
    if (!apiKey) return { status: 'skipped', provider, error: 'Resend API key is not configured.' };
    await requestJson('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text, html }),
    });
    return { status: 'sent', provider };
  }

  if (provider === 'sendgrid') {
    if (!apiKey) return { status: 'skipped', provider, error: 'SendGrid API key is not configured.' };
    await requestJson('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from.match(/<([^>]+)>$/)?.[1] || from, name: 'Vinabrain' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });
    return { status: 'sent', provider };
  }

  if (provider === 'smtp') {
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return { status: 'skipped', provider, error: 'SMTP host, port, user, or password is not configured.' };
    }
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      connectionTimeout: NOTICE_SMTP_TIMEOUT_MS,
      greetingTimeout: NOTICE_SMTP_TIMEOUT_MS,
      socketTimeout: NOTICE_SMTP_TIMEOUT_MS,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    await transporter.sendMail({
      from,
      to,
      subject,
      text: absoluteLink ? `${text}\n\nMở màn liên quan: ${absoluteLink}` : text,
      html,
    });
    return { status: 'sent', provider };
  }

  return { status: 'skipped', provider, error: `Unsupported email provider: ${provider}` };
}

async function getRows(supabaseUrl, headers, table, select, filters = []) {
  const query = [`select=${encodeURIComponent(select)}`, ...filters].join('&');
  const data = await optionalRequestJson(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: 'GET',
    headers,
  });
  return Array.isArray(data) ? data : [];
}

async function loadContext(supabaseUrl, headers, input) {
  const metadata = input.metadata || {};
  const orderId = String(metadata.order_id || input.orderId || '').trim();
  const productId = String(metadata.product_id || input.productId || '').trim();
  const taskId = String(metadata.task_id || (input.objectType === 'task' ? input.objectId : '') || '').trim();
  const [profiles, orders, products, tasks, storyboards, slideDesigns, voiceOvers, videoEdits, scormPackages] = await Promise.all([
    getRows(supabaseUrl, headers, 'vcontent_profiles', 'id,email,full_name,role,auth_user_id,active', ['active=eq.true']),
    orderId ? getRows(supabaseUrl, headers, 'vcontent_orders', 'id,title,client,module,status,created_by_profile_id', [restEq('id', orderId)]) : Promise.resolve([]),
    productId ? getRows(supabaseUrl, headers, 'vcontent_products', 'id,order_id,name,current_stage_index', [restEq('id', productId)]) : Promise.resolve([]),
    taskId
      ? getRows(supabaseUrl, headers, 'vcontent_tasks', 'id,order_id,product_id,stage_index,status,assignee,assignee_profile_id,assignee_account_id,archived', [restEq('id', taskId)])
      : orderId && productId
        ? getRows(supabaseUrl, headers, 'vcontent_tasks', 'id,order_id,product_id,stage_index,status,assignee,assignee_profile_id,assignee_account_id,archived', [restEq('order_id', orderId), restEq('product_id', productId)])
        : Promise.resolve([]),
    orderId && productId ? getRows(supabaseUrl, headers, 'vcontent_storyboards', 'id,order_id,product_id,status,assignee_profile_id,reviewer_profile_id', [restEq('order_id', orderId), restEq('product_id', productId)]) : Promise.resolve([]),
    orderId && productId ? getRows(supabaseUrl, headers, 'vcontent_slide_designs', 'id,order_id,product_id,status,designer_profile_id,qc_reviewer_profile_id', [restEq('order_id', orderId), restEq('product_id', productId)]) : Promise.resolve([]),
    orderId && productId ? getRows(supabaseUrl, headers, 'vcontent_voice_overs', 'id,order_id,product_id,status,talent_profile_id,handoff_profile_id', [restEq('order_id', orderId), restEq('product_id', productId)]) : Promise.resolve([]),
    orderId && productId ? getRows(supabaseUrl, headers, 'vcontent_video_edits', 'id,order_id,product_id,status,editor_profile_id,qc_reviewer_profile_id', [restEq('order_id', orderId), restEq('product_id', productId)]) : Promise.resolve([]),
    orderId && productId ? getRows(supabaseUrl, headers, 'vcontent_scorm_packages', 'id,order_id,product_id,status,owner_profile_id', [restEq('order_id', orderId), restEq('product_id', productId)]) : Promise.resolve([]),
  ]);

  return {
    profiles,
    order: orders[0] || null,
    product: products[0] || null,
    tasks,
    workflowRecords: [...storyboards, ...slideDesigns, ...voiceOvers, ...videoEdits, ...scormPackages],
  };
}

function resolveRecipients(input, context) {
  const metadata = input.metadata || {};
  const explicitRecipientsOnly = input.explicitRecipientsOnly === true || metadata.explicit_recipients_only === true;
  const eventType = String(input.eventType || '');
  const actorProfileId = String(input.actorProfileId || '').trim();
  const directEmails = new Set(
    compactStrings([
      ...toArray(input.recipientEmails),
      ...toArray(input.recipientEmail),
      ...toArray(metadata.recipient_emails),
      ...toArray(metadata.recipient_email),
    ]).map((email) => email.toLowerCase()),
  );
  const profileIds = new Set(
    compactStrings([
      ...toArray(input.recipientProfileIds),
      ...toArray(input.recipientProfileId),
      ...toArray(metadata.recipient_profile_ids),
      ...toArray(metadata.recipient_profile_id),
      ...toArray(metadata.assignee_profile_id),
      ...toArray(metadata.owner_profile_id),
    ]),
  );
  const accountIds = new Set(
    compactStrings([
      ...toArray(input.recipientAccountIds),
      ...toArray(input.recipientAccountId),
      ...toArray(metadata.recipient_account_ids),
      ...toArray(metadata.recipient_account_id),
      ...toArray(metadata.assignee_account_id),
    ]),
  );
  const stageIndex = Number(metadata.stage_index);
  const nextStageIndex = Number.isInteger(stageIndex) ? stageIndex + 1 : null;
  const managerRoles = new Set(['admin', 'pm', 'production_manager']);
  const productionManagerRoles = new Set(['production_manager']);
  const shouldNotifyManagers = /delivery|payment/i.test(eventType);
  const shouldNotifyProductionManagers = /order_created/i.test(eventType);

  if (!explicitRecipientsOnly) {
    for (const task of context.tasks || []) {
      const taskStage = Number(task.stage_index);
      const isCurrentStage = Number.isInteger(stageIndex) && taskStage === stageIndex;
      const isNextStage = Number.isInteger(nextStageIndex) && taskStage === nextStageIndex;
      if (isCurrentStage || (/submitted|approved|passed/i.test(eventType) && isNextStage)) {
        if (task.assignee_profile_id) profileIds.add(String(task.assignee_profile_id));
        if (task.assignee_account_id) accountIds.add(String(task.assignee_account_id));
      }
    }

    if (shouldNotifyManagers) {
      if (context.order?.created_by_profile_id) profileIds.add(String(context.order.created_by_profile_id));
      for (const profile of context.profiles || []) {
        if (managerRoles.has(normalizeRole(profile.role))) profileIds.add(String(profile.id));
      }
    }

    if (shouldNotifyProductionManagers) {
      for (const profile of context.profiles || []) {
        if (productionManagerRoles.has(normalizeRole(profile.role))) profileIds.add(String(profile.id));
      }
    }
  }

  if (actorProfileId && input.notifyActor !== true) profileIds.delete(actorProfileId);

  const matchedProfiles = (context.profiles || []).filter((profile) => {
    const id = String(profile.id || '');
    const accountId = String(profile.auth_user_id || '');
    const email = String(profile.email || '').trim().toLowerCase();
    return profileIds.has(id) || (accountId && accountIds.has(accountId)) || (email && directEmails.has(email));
  });
  const matchedEmails = new Set(matchedProfiles.map((profile) => String(profile.email || '').trim().toLowerCase()).filter(Boolean));
  const directRecipients = [...directEmails]
    .filter((email) => !matchedEmails.has(email))
    .map((email) => ({ id: null, auth_user_id: null, email, full_name: email, role: 'direct_email' }));
  return [...matchedProfiles, ...directRecipients];
}

async function findExistingNotification(supabaseUrl, headers, eventKey, recipient) {
  if (!eventKey) return null;
  const filters = [
    restEq('event_key', eventKey),
    recipient?.id ? restEq('recipient_profile_id', recipient.id) : 'recipient_profile_id=is.null',
  ];
  const rows = await getRows(supabaseUrl, headers, 'vcontent_notifications', '*', filters);
  return rows[0] || null;
}

async function insertNotification(supabaseUrl, headers, input, recipient, message, eventKey, linkPage, level) {
  if (input.persistInApp === false) {
    return {
      id: String(input.notificationId || `NOTI-${Date.now()}-${Math.floor(Math.random() * 1000)}`),
      reused: true,
    };
  }

  const existing = await findExistingNotification(supabaseUrl, headers, eventKey, recipient);
  if (existing?.id) return { ...existing, reused: true };

  const payload = {
    id: `NOTI-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    level,
    title: message.title,
    body: message.body,
    link_page: linkPage,
    recipient_profile_id: recipient?.id || null,
    recipient_account_id: recipient?.auth_user_id || null,
    event_key: eventKey || null,
    metadata: input.metadata || {},
    email_status: 'pending',
    created_at: new Date().toISOString(),
  };

  try {
    const inserted = await requestJson(`${supabaseUrl}/rest/v1/vcontent_notifications?select=*`, {
      method: 'POST',
      headers: {
        ...headers,
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    if (Array.isArray(inserted) && inserted[0]) return inserted[0];
  } catch (error) {
    if (Number(error?.status) === 409 && eventKey) {
      const concurrentExisting = await findExistingNotification(supabaseUrl, headers, eventKey, recipient);
      if (concurrentExisting?.id) return { ...concurrentExisting, reused: true };
    }
    if (!isMissingNoticeDeliverySchema(error)) throw error;
  }

  const legacyPayload = {
    id: payload.id,
    level: payload.level,
    title: payload.title,
    body: payload.body,
    link_page: payload.link_page,
    recipient_profile_id: payload.recipient_profile_id,
    recipient_account_id: payload.recipient_account_id,
    created_at: payload.created_at,
  };
  const legacyInserted = await optionalRequestJson(`${supabaseUrl}/rest/v1/vcontent_notifications?select=*`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(legacyPayload),
  });
  if (Array.isArray(legacyInserted) && legacyInserted[0]) return legacyInserted[0];

  const minimalInserted = await requestJson(`${supabaseUrl}/rest/v1/vcontent_notifications?select=*`, {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      id: payload.id,
      level: payload.level,
      title: payload.title,
      body: payload.body,
      link_page: payload.link_page,
      created_at: payload.created_at,
    }),
  });
  return Array.isArray(minimalInserted) ? minimalInserted[0] : minimalInserted;
}

async function updateNotificationEmailStatus(supabaseUrl, headers, notificationId, status, error) {
  if (!notificationId) return;
  await optionalRequestJson(`${supabaseUrl}/rest/v1/vcontent_notifications?id=${encodeURIComponent(`eq.${notificationId}`)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      email_status: status,
      email_sent_at: status === 'sent' ? new Date().toISOString() : null,
      email_error: error || null,
    }),
  });
}

async function insertDelivery(supabaseUrl, headers, notificationId, recipient, email, result) {
  await optionalRequestJson(`${supabaseUrl}/rest/v1/vcontent_notification_deliveries`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      id: `ND-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      notification_id: notificationId,
      recipient_profile_id: recipient?.id || null,
      recipient_account_id: recipient?.auth_user_id || null,
      email,
      channel: 'email',
      provider: result.provider || null,
      status: result.status || 'failed',
      error: result.error || null,
      sent_at: result.status === 'sent' ? new Date().toISOString() : null,
    }),
  });
}

export const __noticeDispatchTest = Object.freeze({
  isMissingNoticeDeliverySchema,
  mapWithConcurrency,
  recipientEventKey,
});

export default async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = String(req.headers['x-vercel-id'] || req.headers['x-request-id'] || '');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'notice-dispatch', ...RATE_LIMITS.email })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    sendJson(res, 500, { ok: false, error: 'Notice dispatch API is not configured.' });
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

    const input = await readJsonBody(req);
    const eventType = String(input.eventType || '').trim();
    if (!eventType) {
      sendJson(res, 400, { ok: false, error: 'Missing notice event type.' });
      return;
    }

    const headers = buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`);
    const context = await loadContext(supabaseUrl, headers, input);
    const metadata = {
      ...(input.metadata || {}),
      display_product_code:
        input.metadata?.display_product_code ||
        getDisplayProductCode(context.product?.id || input.metadata?.product_id || input.productId || input.objectId, context.order?.id || input.metadata?.order_id),
    };
    const enrichedInput = { ...input, metadata };
    const recipients = resolveRecipients(enrichedInput, context);
    const linkPage = getLinkPage(enrichedInput, metadata, context);
    const level = getLevel(eventType, input.level);
    const message = buildMessage(enrichedInput, context);
    const baseEventKey = String(input.eventKey || '').trim() || `${eventType}:${input.objectType || 'event'}:${input.objectId || ''}:${metadata.stage_code || ''}:${metadata.status || ''}`;
    const deliveries = await mapWithConcurrency(recipients, NOTICE_RECIPIENT_CONCURRENCY, async (recipient) => {
      const eventKey = baseEventKey ? `${baseEventKey}:${recipientEventKey(recipient)}` : null;
      const notification = await insertNotification(supabaseUrl, headers, enrichedInput, recipient, message, eventKey, linkPage, level);
      const email = String(recipient.email || '').trim();
      if (notification?.reused && notification?.email_status === 'sent') {
        return {
          notificationId: notification.id,
          recipientProfileId: recipient.id,
          email,
          status: 'sent',
          provider: 'existing-delivery',
          reused: true,
          emailSkipped: true,
        };
      }
      let result;
      try {
        result = await sendEmail({
          to: email,
          subject: message.title,
          text: message.body,
          linkPage,
        });
      } catch (error) {
        result = { status: 'failed', provider: String(process.env.NOTICE_EMAIL_PROVIDER || 'unknown'), error: String(error.message || error) };
      }
      await updateNotificationEmailStatus(supabaseUrl, headers, notification?.id, result.status, result.error);
      await insertDelivery(supabaseUrl, headers, notification?.id, recipient, email, result);
      return {
        notificationId: notification?.id || null,
        recipientProfileId: recipient.id,
        email,
        status: result.status,
        provider: result.provider || null,
        reused: Boolean(notification?.reused),
        emailSkipped: false,
      };
    });

    sendJson(res, 200, {
      ok: true,
      recipientCount: recipients.length,
      deliveries,
    });
    logNotice('info', {
      event: 'notice_dispatch_completed',
      requestId,
      status: 200,
      recipientCount: recipients.length,
      reusedCount: deliveries.filter((delivery) => delivery.reused).length,
      sentCount: deliveries.filter((delivery) => delivery.status === 'sent' && !delivery.emailSkipped).length,
      skippedDuplicateCount: deliveries.filter((delivery) => delivery.emailSkipped).length,
      failedCount: deliveries.filter((delivery) => delivery.status === 'failed').length,
      totalMs: Date.now() - startedAt,
    });
  } catch (error) {
    const status = Number(error?.status || (error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 504 : 500));
    logNotice('error', {
      event: 'notice_dispatch_failed',
      requestId,
      status,
      code: String(error?.payload?.code || error?.code || 'NOTICE_DISPATCH_ERROR'),
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, status, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

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

function buildHeaders(apiKey, authorization) {
  return {
    apikey: apiKey,
    Authorization: authorization || `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
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

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

async function requireSurveyManager(req) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    const error = new Error('Survey email API is not configured.');
    error.status = 500;
    throw error;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) {
    const error = new Error('Missing session token.');
    error.status = 401;
    throw error;
  }

  const sessionUser = await requestJson(`${supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: buildHeaders(anonKey, `Bearer ${token}`),
  });

  const profiles = await requestJson(
    `${supabaseUrl}/rest/v1/vcontent_profiles?select=id,role,active,auth_user_id,email&auth_user_id=eq.${encodeURIComponent(sessionUser.id)}&active=is.true`,
    {
      method: 'GET',
      headers: buildHeaders(serviceRoleKey, `Bearer ${serviceRoleKey}`),
    },
  );
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  const allowedRoles = new Set(['admin', 'pm', 'qc', 'content_manager', 'production_manager', 'training_ops_admin']);
  if (!profile || !allowedRoles.has(normalizeRole(profile.role))) {
    const error = new Error('Only survey managers can send survey emails.');
    error.status = 403;
    throw error;
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function safeHref(value) {
  const href = String(value || '').trim();
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (/^\{\{\s*link\s*\}\}$/i.test(href)) return href;
  return '#';
}

function protectAllowedHtml(source) {
  const tokens = [];
  const withLinks = String(source || '').replace(/<a\b[^>]*href=(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi, (_, quote, href, label) => {
    const token = `__VC_HTML_TOKEN_${tokens.length}__`;
    tokens.push(`<a href="${escapeHtml(safeHref(href))}">${escapeHtml(normalizeInlineText(stripHtml(label)))}</a>`);
    return token;
  });
  const withBold = withLinks
    .replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (_, tag, label) => {
      const token = `__VC_HTML_TOKEN_${tokens.length}__`;
      tokens.push(`<strong>${escapeHtml(normalizeInlineText(stripHtml(label)))}</strong>`);
      return token;
    })
    .replace(/\*\*([^\n*][\s\S]*?[^\n*]|\S)\*\*/g, (_, label) => {
      const token = `__VC_HTML_TOKEN_${tokens.length}__`;
      tokens.push(`<strong>${escapeHtml(normalizeInlineText(label))}</strong>`);
      return token;
    });
  return { source: withBold, tokens };
}

function normalizeInlineText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function restoreHtmlTokens(value, tokens) {
  return String(value || '').replace(/__VC_HTML_TOKEN_(\d+)__/g, (_, index) => tokens[Number(index)] || '');
}

function renderInline(value, tokens) {
  return restoreHtmlTokens(escapeHtml(normalizeInlineText(value)), tokens);
}

function parseBulletItems(lines) {
  const items = [];
  for (const line of lines) {
    const match = /^([-•*]|\d+[.)])\s+(.*)$/.exec(line);
    if (match) {
      items.push(match[2]);
    } else if (items.length) {
      items[items.length - 1] = `${items[items.length - 1]} ${line}`;
    } else {
      return null;
    }
  }
  return items.length ? items : null;
}

function renderLineBlock(lines, tokens) {
  return `<div style="margin:0 0 10px">${lines.map((line) => `<div style="margin:0 0 3px">${renderInline(line, tokens)}</div>`).join('')}</div>`;
}

function normalizeEmailSource(value) {
  return String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/(^|\n)\s*[-•]\s*\n+/g, '$1- ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function renderHtmlBody(value) {
  const source = normalizeEmailSource(value);
  if (!source) return '';
  const protectedHtml = protectAllowedHtml(source);
  const blocks = protectedHtml.source
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const htmlBlocks = [];
  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) continue;
    const bulletItems = parseBulletItems(lines);
    if (bulletItems) {
      htmlBlocks.push(renderLineBlock(bulletItems.map((item) => `- ${item}`), protectedHtml.tokens));
      continue;
    }
    if (lines.length === 1 && /^Phần\s+[A-F]\s*:/i.test(lines[0])) {
      htmlBlocks.push(renderLineBlock([`- ${lines[0]}`], protectedHtml.tokens));
      continue;
    }
    htmlBlocks.push(`<div style="margin:0 0 10px">${renderInline(lines.join(' '), protectedHtml.tokens)}</div>`);
  }
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#111827;width:100%;max-width:none">${htmlBlocks.join('')}</div>`;
}

function renderTemplate(template, recipient, shareLink) {
  const replacements = {
    email: recipient.email,
    name: recipient.name || recipient.email,
    hoten: recipient.name || recipient.email,
    unit: recipient.unit || '',
    donvi: recipient.unit || '',
    link: shareLink || '',
  };
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key) => {
    const normalizedKey = String(key || '').toLowerCase();
    return replacements[normalizedKey] ?? '';
  });
}

function normalizeRecipients(value) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set();
  const recipients = [];
  for (const item of items) {
    const email = String(item?.email || '').trim().toLowerCase();
    if (!email || seen.has(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    seen.add(email);
    recipients.push({
      email,
      name: String(item?.name || '').trim(),
      unit: String(item?.unit || '').trim(),
    });
  }
  return recipients;
}

function normalizeSmtp(input) {
  const smtp = input && typeof input === 'object' ? input : {};
  const port = Number(smtp.port || 587);
  return {
    host: String(smtp.host || '').trim(),
    port,
    secure: Boolean(smtp.secure) || port === 465,
    requireTLS: smtp.requireTLS !== false && port !== 465,
    user: String(smtp.user || '').trim(),
    pass: String(smtp.pass || ''),
    fromEmail: String(smtp.fromEmail || smtp.user || '').trim(),
    fromName: String(smtp.fromName || smtp.fromEmail || smtp.user || '').trim(),
  };
}

function validateInput(input, recipients, smtp) {
  if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass) return 'Missing SMTP host, port, user, or password.';
  if (!smtp.fromEmail) return 'Missing sender email.';
  if (!String(input.subject || '').trim()) return 'Missing email subject.';
  if (!String(input.body || '').trim()) return 'Missing email body.';
  if (!recipients.length) return 'Missing valid recipients.';
  if (recipients.length > 100) return 'Send at most 100 recipients per request.';
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'student-survey-email-dispatch', ...RATE_LIMITS.email })) return;

  try {
    await requireSurveyManager(req);
    const input = await readJsonBody(req);
    const smtp = normalizeSmtp(input.smtp);
    const recipients = normalizeRecipients(input.recipients);
    const validationError = validateInput(input, recipients, smtp);
    if (validationError) {
      sendJson(res, 400, { ok: false, error: validationError });
      return;
    }

    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: smtp.requireTLS,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    const from = smtp.fromName ? `"${smtp.fromName.replace(/"/g, '\\"')}" <${smtp.fromEmail}>` : smtp.fromEmail;
    const subjectTemplate = String(input.subject || '').trim();
    const bodyTemplate = String(input.body || '').trim();
    const shareLink = String(input.shareLink || '').trim();
    const delayMs = Math.max(0, Math.min(Number(input.delayMs || 0), 2000));
    const results = [];

    for (const recipient of recipients) {
      try {
        const subject = renderTemplate(subjectTemplate, recipient, shareLink);
        const renderedBody = renderTemplate(bodyTemplate, recipient, shareLink);
        const html = renderHtmlBody(renderedBody);
        const text = stripHtml(html);
        const threadBreaker = `vcontent-survey-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const info = await transporter.sendMail({
          from,
          to: recipient.email,
          subject,
          text,
          html,
          headers: {
            'X-Entity-Ref-ID': threadBreaker,
            'X-VContent-Survey-Send-ID': threadBreaker,
          },
        });
        results.push({
          email: recipient.email,
          status: 'sent',
          messageId: info.messageId || null,
          accepted: Array.isArray(info.accepted) ? info.accepted : [],
          rejected: Array.isArray(info.rejected) ? info.rejected : [],
          response: info.response || '',
        });
      } catch (error) {
        results.push({ email: recipient.email, status: 'failed', error: String(error.message || error) });
      }
      if (delayMs) await sleep(delayMs);
    }

    sendJson(res, 200, {
      ok: true,
      sent: results.filter((item) => item.status === 'sent').length,
      failed: results.filter((item) => item.status === 'failed').length,
      results,
    });
  } catch (error) {
    sendJson(res, error.status || 500, {
      ok: false,
      error: String(error.message || error),
    });
  }
}

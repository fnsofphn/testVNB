import { createHash, randomUUID } from 'node:crypto';
import { enforceRateLimit } from './_rate-limit.js';
import {
  PublicQuizTicketError,
  createPublicQuizTicket,
  verifyPublicQuizTicket,
} from './_public-quiz-ticket.js';

const MAX_BODY_BYTES = 96 * 1024;

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

function cleanText(value, max) {
  return String(value || '').trim().slice(0, max);
}

function cleanUuid(value) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : '';
}

function hash(value, length = 20) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function getBearerToken(req) {
  const authorization = String(req.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function getProjectRef(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : '';
  } catch {
    return '';
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      const error = new Error('Payload too large.');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body.');
    error.statusCode = 400;
    throw error;
  }
}

async function createAdmin() {
  const supabaseUrl = cleanText(
    process.env.PUBLIC_QUIZ_SUPABASE_URL || process.env.SUPABASE_URL,
    500,
  );
  const secretKey = cleanText(
    process.env.PUBLIC_QUIZ_SUPABASE_SECRET_KEY
      || process.env.PUBLIC_QUIZ_SUPABASE_SERVICE_ROLE_KEY
      || process.env.SUPABASE_SECRET_KEY
      || process.env.SUPABASE_SERVICE_ROLE_KEY,
    4096,
  );
  const expectedRef = cleanText(process.env.PUBLIC_QUIZ_EXPECTED_PROJECT_REF, 80);
  const actualRef = getProjectRef(supabaseUrl);
  if (!supabaseUrl || !secretKey || !expectedRef || actualRef !== expectedRef) {
    const error = new Error('Public quiz database authority is not configured safely.');
    error.statusCode = 503;
    throw error;
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getVerifiedProfileId(admin, req, email) {
  const token = getBearerToken(req);
  if (!token) return null;
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    const error = new Error('Invalid bearer token.');
    error.statusCode = 401;
    throw error;
  }
  const { data: profile, error: profileError } = await admin
    .from('vcontent_profiles')
    .select('id,email,active')
    .eq('auth_user_id', authData.user.id)
    .eq('active', true)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.id || String(profile.email || '').trim().toLowerCase() !== email) {
    const error = new Error('Authenticated profile does not match quiz identity.');
    error.statusCode = 403;
    throw error;
  }
  return String(profile.id);
}

function mapSubmission(row) {
  return {
    id: String(row?.id || ''),
    formId: String(row?.form_id || ''),
    respondentName: String(row?.respondent_name || ''),
    email: String(row?.email || ''),
    className: String(row?.class_name || ''),
    answers: row?.answers || {},
    questionOrder: Array.isArray(row?.question_order) ? row.question_order : [],
    score: row?.score == null ? null : Number(row.score),
    total: row?.total == null ? null : Number(row.total),
    studentProfileId: row?.student_profile_id || null,
    attemptNo: Number(row?.attempt_no || 1),
    metadata: row?.metadata || {},
    submittedAt: String(row?.submitted_at || ''),
  };
}

function log(level, fields) {
  const line = JSON.stringify({
    level,
    route: 'public-quiz',
    module: 'vtraining',
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = String(req.headers['x-vercel-id'] || req.headers['x-request-id'] || randomUUID());
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const action = cleanText(body.action, 20);
    if (action !== 'start' && action !== 'submit') {
      sendJson(res, 400, { ok: false, error: 'Invalid public quiz action.' });
      return;
    }
    const allowed = await enforceRateLimit(req, res, {
      route: `public-quiz:${action}`,
      windowMs: 60_000,
      max: action === 'start' ? 10 : 30,
      mode: process.env.VCONTENT_PUBLIC_AUTHORITY_RATE_LIMIT_MODE,
      failureMode: 'closed',
    });
    if (!allowed) return;

    const admin = await createAdmin();
    if (action === 'start') {
      const formId = cleanText(body.formId, 240);
      const respondentName = cleanText(body.respondentName, 160);
      const email = cleanText(body.email, 254).toLowerCase();
      const className = cleanText(body.className, 160);
      const idempotencyKey = cleanText(body.idempotencyKey, 200);
      if (!formId || respondentName.length < 2 || !email.includes('@') || idempotencyKey.length < 16) {
        sendJson(res, 400, { ok: false, error: 'Invalid public quiz start payload.' });
        return;
      }
      const verifiedProfileId = await getVerifiedProfileId(admin, req, email);
      const { data, error } = await admin.rpc('vcontent_start_public_quiz_attempt', {
        p_form_id: formId,
        p_respondent_name: respondentName,
        p_email: email,
        p_class_name: className,
        p_verified_profile_id: verifiedProfileId,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw error;
      const ticket = createPublicQuizTicket(data);
      log('info', {
        event: 'public_quiz_started',
        requestId,
        formHash: hash(formId),
        sessionHash: hash(data?.sessionId),
        verifiedProfile: Boolean(verifiedProfileId),
        resumed: Boolean(data?.resumed),
        totalMs: Date.now() - startedAt,
      });
      sendJson(res, 200, { ok: true, attempt: { ...data, ticket } });
      return;
    }

    const sessionId = cleanUuid(body.sessionId);
    const formId = cleanText(body.formId, 240);
    const idempotencyKey = cleanText(body.idempotencyKey, 200);
    const answers = body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)
      ? body.answers
      : null;
    if (!sessionId || !formId || !answers || idempotencyKey.length < 16) {
      sendJson(res, 400, { ok: false, error: 'Invalid public quiz submit payload.' });
      return;
    }
    verifyPublicQuizTicket(body.ticket, { sessionId, formId });
    const { data, error } = await admin.rpc('vcontent_submit_public_quiz_attempt', {
      p_session_id: sessionId,
      p_answers: answers,
      p_idempotency_key: idempotencyKey,
      p_client_metadata: body.autoSubmitted
        ? { autoSubmitted: true, autoSubmittedAt: new Date().toISOString(), reason: 'time_up' }
        : {},
    });
    if (error) throw error;
    log('info', {
      event: 'public_quiz_submitted',
      requestId,
      formHash: hash(formId),
      sessionHash: hash(sessionId),
      submissionHash: hash(data?.submission?.id),
      duplicate: Boolean(data?.duplicate),
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, 200, {
      ok: true,
      submission: mapSubmission(data?.submission),
      duplicate: Boolean(data?.duplicate),
    });
  } catch (error) {
    const status = Number(error?.statusCode)
      || (error instanceof PublicQuizTicketError ? 401 : 500);
    log(status >= 500 ? 'error' : 'warning', {
      event: 'public_quiz_failed',
      requestId,
      status,
      code: cleanText(error?.code, 80) || 'PUBLIC_QUIZ_ERROR',
      error: cleanText(error?.message, 220),
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, status, {
      ok: false,
      error: status >= 500
        ? 'Public quiz authority is temporarily unavailable.'
        : cleanText(error?.message, 220),
    });
  }
}

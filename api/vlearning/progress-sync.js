import { createHash } from 'node:crypto';
import { enforceRateLimit } from '../_rate-limit.js';
import { getObservabilityContext, setObservabilityResponseHeaders } from '../_observability.js';
import { verifyVLearningAdmissionTicket } from '../_vlearning-ticket.js';
import { recordVLearningRuntimeMetric } from './runtime-metrics.js';

const MAX_EVENTS = 50;
const MAX_BODY_BYTES = 128 * 1024;

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

function logProgressSync(level, fields) {
  const line = JSON.stringify({
    level,
    route: 'vlearning-progress-sync',
    module: 'vlearning',
    region: process.env.VERCEL_REGION || 'unknown',
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

function hash(value, length = 18) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function cleanText(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function cleanUuid(value) {
  const text = cleanText(value, 80);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text) ? text : null;
}

function clampPercent(value) {
  const numeric = Number(value);
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(numeric) ? numeric : 0)));
}

function clampSeconds(value) {
  const numeric = Number(value);
  return Math.max(0, Math.round(Number.isFinite(numeric) ? numeric : 0));
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

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || '');
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

async function createSupabaseUser(token) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anonKey) {
    const error = new Error('Supabase user-client environment variables are missing.');
    error.statusCode = 500;
    throw error;
  }
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function verifyProgressTicket(req, rawEvents) {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Missing bearer token.');
    error.statusCode = 401;
    throw error;
  }

  const courseIds = [...new Set(
    rawEvents
      .map((event) => cleanText(event?.courseId, 180))
      .filter(Boolean),
  )];
  if (!courseIds.length) {
    const error = new Error('Missing course scope.');
    error.statusCode = 400;
    throw error;
  }
  if (courseIds.length !== 1) {
    const error = new Error('A progress batch must target exactly one course.');
    error.statusCode = 400;
    throw error;
  }

  const admissionTicket = String(req.headers['x-vlearning-admission-ticket'] || '');
  if (!admissionTicket) {
    const error = new Error('Missing admission ticket.');
    error.statusCode = 401;
    throw error;
  }
  const authority = verifyVLearningAdmissionTicket(admissionTicket, {
    courseId: courseIds[0],
    sessionToken: token,
  });
  return {
    userId: String(authority.sub),
    enrollmentId: cleanUuid(authority.enrollmentId),
    courseId: courseIds[0],
    token,
  };
}

function normalizeOccurredAt(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function buildFallbackIdempotencyKey(event) {
  const digest = hash(JSON.stringify({
    type: event.type,
    userId: event.userId,
    courseId: event.courseId,
    lessonId: event.lessonId,
    entityId: event.partId || event.blockId,
    occurredAt: event.occurredAt,
    progressPercent: event.progressPercent,
    lastPositionSeconds: event.lastPositionSeconds,
    isCompleted: event.isCompleted,
    answer: event.answer,
  }), 32);
  return `${event.type}:${event.userId}:${event.courseId}:${event.partId || event.blockId}:${digest}`;
}

function normalizeEvent(raw, verified, index) {
  const type = raw?.type === 'block_attempt' ? 'block_attempt' : raw?.type === 'lesson_progress' ? 'lesson_progress' : '';
  const courseId = cleanText(raw?.courseId, 180);
  const lessonId = cleanText(raw?.lessonId, 180);
  if (!type || !courseId || !lessonId) {
    return { ok: false, result: { index, type: type || 'unknown', status: 'failed', error: 'Missing required event fields.' } };
  }
  const enrollmentId = verified.enrollmentId;
  const occurredAt = normalizeOccurredAt(raw?.occurredAt);
  if (type === 'lesson_progress') {
    const partId = cleanText(raw?.partId, 180);
    if (!partId) return { ok: false, result: { index, type, status: 'failed', error: 'Missing partId.' } };
    const event = {
      ok: true,
      event: {
        index,
        type,
        userId: verified.userId,
        enrollmentId,
        courseId,
        lessonId,
        partId,
        occurredAt,
        progressPercent: clampPercent(raw?.progressPercent),
        lastPositionSeconds: clampSeconds(raw?.lastPositionSeconds),
        isCompleted: raw?.isCompleted === true || clampPercent(raw?.progressPercent) >= 100,
      },
    };
    event.event.key = cleanText(raw?.idempotencyKey, 260) || buildFallbackIdempotencyKey(event.event);
    return event;
  }
  const blockId = cleanText(raw?.blockId, 180);
  if (!blockId) return { ok: false, result: { index, type, status: 'failed', error: 'Missing blockId.' } };
  const event = {
    ok: true,
    event: {
      index,
      type,
      userId: verified.userId,
      enrollmentId,
      courseId,
      lessonId,
      blockId,
      occurredAt,
      answer: raw?.answer ?? null,
      isCompleted: raw?.isCompleted !== false,
    },
  };
  event.event.key = cleanText(raw?.idempotencyKey, 260) || buildFallbackIdempotencyKey(event.event);
  return event;
}

function isNonRetryableRpcError(error) {
  return ['22023', '28000', '42501'].includes(String(error?.code || ''));
}

async function applyProgressEvent(userClient, event) {
  const isLessonProgress = event.type === 'lesson_progress';
  const payload = isLessonProgress
    ? {
        progressPercent: event.progressPercent,
        lastPositionSeconds: event.lastPositionSeconds,
        isCompleted: event.isCompleted,
      }
    : {
        answer: event.answer,
        isCompleted: event.isCompleted,
      };
  const { data, error } = await userClient.rpc('vlearning_apply_progress_event', {
    p_course_id: event.courseId,
    p_event_type: isLessonProgress ? 'lesson_progress' : 'video_block',
    p_lesson_id: event.lessonId,
    p_entity_id: isLessonProgress ? event.partId : event.blockId,
    p_payload: payload,
    p_idempotency_key: event.key,
    p_enrollment_id: event.enrollmentId,
    p_occurred_at: event.occurredAt,
  });
  if (error) {
    error.retryable = !isNonRetryableRpcError(error);
    throw error;
  }
  return data;
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const { requestId, correlationId } = getObservabilityContext(req);
  setObservabilityResponseHeaders(res, { requestId, correlationId });
  const log = (level, fields) => logProgressSync(level, {
    requestId,
    correlationId,
    ...fields,
  });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'vlearning-progress-sync-preauth', windowMs: 60_000, max: 1800, mode: 'local' })) return;

  try {
    const body = await readJsonBody(req);
    const rawEvents = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [];
    if (!rawEvents.length) {
      sendJson(res, 400, { ok: false, error: 'No progress events supplied.' });
      return;
    }

    const verified = verifyProgressTicket(req, rawEvents);
    if (!await enforceRateLimit(req, res, {
      route: 'vlearning-progress-sync-authorized',
      windowMs: 60_000,
      max: 1800,
      verifiedIdentity: verified.userId,
    })) return;
    const userClient = await createSupabaseUser(verified.token);
    const normalized = rawEvents.map((event, index) => normalizeEvent(event, verified, index));
    const results = normalized.filter((item) => !item.ok).map((item) => item.result);
    let savedCount = 0;
    let duplicateCount = 0;
    let retryableCount = 0;
    const dbStartedAt = Date.now();

    for (const item of normalized.filter((entry) => entry.ok)) {
      const event = item.event;
      try {
        const applied = await applyProgressEvent(userClient, event);
        const duplicate = applied?.duplicate === true;
        if (duplicate) duplicateCount += 1;
        else savedCount += 1;
        results.push({
          index: event.index,
          type: event.type,
          key: event.key,
          status: duplicate ? 'duplicate' : 'saved',
          row: applied?.row || null,
        });
      } catch (error) {
        const retryable = error?.retryable !== false;
        if (retryable) retryableCount += 1;
        results.push({
          index: event.index,
          type: event.type,
          key: event.key,
          status: retryable ? 'retryable_error' : 'failed',
          error: error?.message || 'Unable to save event.',
        });
      }
    }

    const failedCount = results.filter((item) => item.status === 'failed').length;
    const scopeHash = hash(`course:${normalized.find((item) => item.ok)?.event?.courseId || 'unknown'}`, 24);
    log('info', {
      msg: 'done',
      module: 'vlearning',
      requestId,
      scopeHash,
      status: retryableCount || failedCount ? 207 : 200,
      eventCount: rawEvents.length,
      savedCount,
      duplicateCount,
      retryableCount,
      failedCount,
      dbMs: Date.now() - dbStartedAt,
      totalMs: Date.now() - startedAt,
    });
    recordVLearningRuntimeMetric('vlearning-progress-sync', {
      scope: scopeHash,
      status: retryableCount ? 'retryable_error' : 'saved',
      eventCount: rawEvents.length,
      savedCount,
      duplicateCount,
      retryableCount,
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, retryableCount || failedCount ? 207 : 200, {
      ok: retryableCount === 0 && failedCount === 0,
      results: results.sort((a, b) => a.index - b.index),
      counts: {
        eventCount: rawEvents.length,
        savedCount,
        duplicateCount,
        retryableCount,
        failedCount,
      },
      totalMs: Date.now() - startedAt,
    });
  } catch (error) {
    const status = error?.statusCode || 500;
    recordVLearningRuntimeMetric('vlearning-progress-sync', {
      status: 'error',
      error: true,
      totalMs: Date.now() - startedAt,
    });
    log(status >= 500 ? 'error' : 'warning', {
      msg: 'failed',
      module: 'vlearning',
      requestId,
      status,
      error: error?.message || String(error),
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, status, { ok: false, error: error?.message || 'Unable to sync progress.' });
  }
}

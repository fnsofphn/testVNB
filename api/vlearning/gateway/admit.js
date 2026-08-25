import { createHash } from 'node:crypto';
import { getVLearningAdmissionCounterMode, incrementSharedCounters } from '../../_shared-counter.js';
import { authorizeVLearningCourse, getVLearningAuthorityErrorStatus } from '../../_vlearning-authority.js';
import { createVLearningAdmissionTicket } from '../../_vlearning-ticket.js';
import { getObservabilityContext, setObservabilityResponseHeaders } from '../../_observability.js';
import { getVLearningRuntimeMode, recordVLearningRuntimeMetric } from '../runtime-metrics.js';

const DEFAULT_MAX_ADMIT_PER_SECOND = 30;
const DEFAULT_MAX_AUTHORITY_PER_SECOND = 30;
const DEFAULT_RETRY_AFTER_MS = 1500;
const MAX_RETRY_AFTER_MS = 5000;
const TICKET_TTL_SECONDS = 60;
const ABUSE_WINDOW_MS = 60_000;
const ABUSE_MAX_REQUESTS = 1800;

function getQueryParam(req, name) {
  const url = new URL(req.url || '', 'http://localhost');
  return url.searchParams.get(name) || '';
}

function getBearerToken(req) {
  const authorization = String(req?.headers?.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function cleanRuntimeId(value, fallback = 'global') {
  const cleaned = String(value || '').trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 160);
  return cleaned || fallback;
}

function hash(value, length = 16) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function getClientIdentity(req, authority) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.socket?.remoteAddress || 'anonymous');
  return `${ip}:${authority?.userId ? hash(authority.userId, 24) : 'anonymous'}`;
}

function getRequestIdentity(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || String(req.socket?.remoteAddress || 'anonymous');
  return hash(ip, 24);
}

function getRuntimeScope(authority) {
  const classId = cleanRuntimeId(authority?.classId, '');
  const courseId = cleanRuntimeId(authority?.courseId, '');
  return classId ? `class:${classId}` : `course:${courseId || 'global'}`;
}

function getMaxAdmitPerSecond() {
  const raw = Number(process.env.VLEARNING_MAX_ADMIT_PER_SECOND || DEFAULT_MAX_ADMIT_PER_SECOND);
  return Math.max(1, Math.min(200, Math.floor(Number.isFinite(raw) ? raw : DEFAULT_MAX_ADMIT_PER_SECOND)));
}

function getMaxAuthorityPerSecond() {
  const raw = Number(process.env.VLEARNING_MAX_AUTHORITY_PER_SECOND || DEFAULT_MAX_AUTHORITY_PER_SECOND);
  return Math.max(1, Math.min(200, Math.floor(Number.isFinite(raw) ? raw : DEFAULT_MAX_AUTHORITY_PER_SECOND)));
}

function getEffectiveMaxAdmitPerSecond(maxAdmitPerSecond, runtimeMode) {
  if (runtimeMode === 'protect') return Math.max(1, Math.floor(maxAdmitPerSecond * 0.2));
  if (runtimeMode === 'degraded') return Math.max(1, Math.floor(maxAdmitPerSecond * 0.5));
  return maxAdmitPerSecond;
}

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

function logAdmission(level, fields) {
  const line = JSON.stringify({
    level,
    route: 'vlearning-gateway-admit',
    module: 'vlearning',
    region: process.env.VERCEL_REGION || 'unknown',
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const { requestId, correlationId } = getObservabilityContext(req);
  setObservabilityResponseHeaders(res, { requestId, correlationId });
  const log = (level, fields) => logAdmission(level, {
    requestId,
    correlationId,
    ...fields,
  });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  const courseId = cleanRuntimeId(getQueryParam(req, 'courseId'), '');
  if (!courseId) {
    sendJson(res, 400, { ok: false, error: 'Missing courseId.' });
    return;
  }
  const sessionToken = getBearerToken(req);
  if (!sessionToken) {
    sendJson(res, 401, {
      ok: false,
      status: 'denied',
      error: 'Authentication required.',
      retryAfterMs: 0,
    });
    return;
  }

  const now = Date.now();
  const runtimeMode = getVLearningRuntimeMode();
  const counterMode = getVLearningAdmissionCounterMode();
  const requestIdentity = getRequestIdentity(req);
  const configuredMaxAuthorityPerSecond = getMaxAuthorityPerSecond();
  const maxAuthorityPerSecond = getEffectiveMaxAdmitPerSecond(configuredMaxAuthorityPerSecond, runtimeMode);
  if (counterMode === 'unconfigured') {
    log('error', {
      msg: 'distributed_counter_unconfigured',
      requestId,
      stage: 'authority_gate',
      runtimeMode,
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, 503, {
      ok: false,
      status: 'degraded',
      error: 'Admission control is not configured.',
      retryAfterMs: DEFAULT_RETRY_AFTER_MS,
    });
    return;
  }

  let authorityGateCount = 1;
  let abuseCount = 1;
  let authorityCounterSource = 'disabled';
  if (counterMode === 'shadow' || counterMode === 'enforce') {
    try {
      const windowId = Math.floor(now / 1000);
      const [authorityCounter, abuseCounter] = await incrementSharedCounters([
        { key: `admission-authority:global:${windowId}`, windowMs: 1000 },
        { key: `admission-abuse:${requestIdentity}`, windowMs: ABUSE_WINDOW_MS },
      ]);
      authorityGateCount = authorityCounter.count;
      abuseCount = abuseCounter.count;
      authorityCounterSource = 'redis-rest';
    } catch (error) {
      authorityCounterSource = 'redis-error-shadow';
      log(counterMode === 'enforce' ? 'error' : 'warning', {
        msg: 'distributed_counter_error',
        requestId,
        stage: 'authority_gate',
        runtimeMode,
        counterMode,
        error: error instanceof Error ? error.message : String(error),
        totalMs: Date.now() - startedAt,
      });
      if (counterMode === 'enforce') {
        sendJson(res, 503, {
          ok: false,
          status: 'degraded',
          error: 'Admission control is temporarily unavailable.',
          retryAfterMs: DEFAULT_RETRY_AFTER_MS,
        });
        return;
      }
    }
  }

  if (counterMode === 'enforce' && abuseCount > ABUSE_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil(ABUSE_WINDOW_MS / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    sendJson(res, 429, {
      ok: false,
      status: 'degraded',
      error: 'Too many admission requests.',
      retryAfterMs: retryAfterSeconds * 1000,
    });
    return;
  }

  const authorityPosition = counterMode === 'enforce'
    ? Math.max(0, authorityGateCount - maxAuthorityPerSecond)
    : 0;
  if (authorityPosition > 0) {
    const authorityWaitMs = Math.min(
      MAX_RETRY_AFTER_MS,
      DEFAULT_RETRY_AFTER_MS
        + Math.ceil(authorityPosition / maxAuthorityPerSecond) * 1000
        + (Number.parseInt(hash(requestIdentity, 4), 16) % 500),
    );
    recordVLearningRuntimeMetric('vlearning-gateway-admit', {
      scope: 'authority-gate',
      status: 'wait',
      waitMs: authorityWaitMs,
      totalMs: Date.now() - startedAt,
    });
    log('info', {
      msg: 'authority_wait',
      requestId,
      stage: 'authority_gate',
      status: 'wait',
      position: authorityPosition,
      waitMs: authorityWaitMs,
      runtimeMode,
      counterMode,
      counterSource: authorityCounterSource,
      authorityGateCount,
      configuredMaxAuthorityPerSecond,
      maxAuthorityPerSecond,
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, 200, {
      ok: true,
      status: runtimeMode === 'normal' ? 'wait' : 'degraded',
      position: authorityPosition,
      retryAfterMs: authorityWaitMs,
      runtimeMode,
      counterMode,
      message: 'He thong dang chuan bi phien hoc',
    });
    return;
  }

  let authority;
  try {
    authority = await authorizeVLearningCourse(req, courseId);
  } catch (error) {
    const status = getVLearningAuthorityErrorStatus(error);
    log(status >= 500 ? 'error' : 'warning', {
      msg: 'course_authority_denied',
      requestId,
      courseHash: hash(courseId, 24),
      status,
      code: error?.code || 'UNKNOWN_AUTHORITY_ERROR',
      totalMs: Date.now() - startedAt,
    });
    sendJson(res, status, {
      ok: false,
      status: status >= 500 ? 'degraded' : 'denied',
      error: status === 401 ? 'Authentication required.' : status === 403 ? 'Course access denied.' : 'Course authority unavailable.',
      retryAfterMs: status >= 500 ? DEFAULT_RETRY_AFTER_MS : 0,
    });
    return;
  }

  const scope = getRuntimeScope(authority);
  const scopeHash = hash(scope, 24);
  const identity = getClientIdentity(req, authority);
  const configuredMaxAdmitPerSecond = getMaxAdmitPerSecond();
  const maxAdmitPerSecond = getEffectiveMaxAdmitPerSecond(configuredMaxAdmitPerSecond, runtimeMode);
  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }

  const jitterMs = Number.parseInt(hash(`${scope}:${identity}`, 4), 16) % 500;
  let admissionCount = 1;
  let counterSource = 'disabled';
  if (counterMode === 'shadow' || counterMode === 'enforce') {
    try {
      const windowId = Math.floor(now / 1000);
      const [admissionCounter] = await incrementSharedCounters([
        { key: `admission:${scope}:${windowId}`, windowMs: 1000 },
      ]);
      admissionCount = admissionCounter.count;
      counterSource = 'redis-rest';
    } catch (error) {
      counterSource = 'redis-error-shadow';
      log(counterMode === 'enforce' ? 'error' : 'warning', {
        msg: 'distributed_counter_error',
        requestId,
        scopeHash,
        runtimeMode,
        counterMode,
        error: error instanceof Error ? error.message : String(error),
        totalMs: Date.now() - startedAt,
      });
      if (counterMode === 'enforce') {
        sendJson(res, 503, {
          ok: false,
          status: 'degraded',
          error: 'Admission control is temporarily unavailable.',
          retryAfterMs: DEFAULT_RETRY_AFTER_MS,
        });
        return;
      }
    }
  }

  const position = counterMode === 'enforce'
    ? Math.max(0, admissionCount - maxAdmitPerSecond)
    : 0;
  const waitMs = position > 0
    ? Math.min(MAX_RETRY_AFTER_MS, DEFAULT_RETRY_AFTER_MS + Math.ceil(position / maxAdmitPerSecond) * 1000 + jitterMs)
    : 0;

  const status = waitMs > 0 ? 'wait' : 'ready';
  let admissionTicket = null;
  if (status === 'ready') {
    try {
      admissionTicket = createVLearningAdmissionTicket(authority, TICKET_TTL_SECONDS, sessionToken);
    } catch (error) {
      log('error', {
        msg: 'admission_ticket_error',
        requestId,
        scopeHash,
        code: error?.code || 'UNKNOWN_TICKET_ERROR',
        totalMs: Date.now() - startedAt,
      });
      sendJson(res, 503, {
        ok: false,
        status: 'degraded',
        error: 'Admission ticket is not configured.',
        retryAfterMs: DEFAULT_RETRY_AFTER_MS,
      });
      return;
    }
  }
  const payload = status === 'ready'
    ? {
      ok: true,
      status,
      ticket: admissionTicket.token,
      expiresInSeconds: admissionTicket.expiresInSeconds,
      runtimeMode,
      counterMode,
      retryAfterMs: 0,
    }
    : {
      ok: true,
      status: runtimeMode === 'normal' ? status : 'degraded',
      position,
      retryAfterMs: waitMs,
      runtimeMode,
      counterMode,
      message: 'He thong dang chuan bi phien hoc',
    };

  recordVLearningRuntimeMetric('vlearning-gateway-admit', {
    scope: scopeHash,
    status: payload.status,
    waitMs,
    totalMs: Date.now() - startedAt,
  });
  log('info', {
    msg: 'done',
    requestId,
    method: req.method,
    scopeHash,
    status: payload.status,
    position,
    waitMs,
    runtimeMode,
    counterMode,
    counterSource,
    authorityCounterSource,
    authorityGateCount,
    admissionCount,
    configuredMaxAuthorityPerSecond,
    maxAuthorityPerSecond,
    configuredMaxAdmitPerSecond,
    maxAdmitPerSecond,
    totalMs: Date.now() - startedAt,
  });
  sendJson(res, 200, payload);
}

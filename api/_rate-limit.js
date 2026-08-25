import { createHash } from 'node:crypto';
import { incrementSharedCounters } from './_shared-counter.js';

const globalStore = globalThis.__vcontentRateLimitStore || new Map();
globalThis.__vcontentRateLimitStore = globalStore;

export const RATE_LIMITS = {
  admin: { windowMs: 60_000, max: 20 },
  ai: { windowMs: 60_000, max: 8 },
  email: { windowMs: 60_000, max: 5 },
  import: { windowMs: 60_000, max: 6 },
  mutation: { windowMs: 60_000, max: 45 },
  upload: { windowMs: 60_000, max: 12 },
};

function hash(value) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, 24);
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || String(req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown').trim();
}

function decodeBase64Url(value) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function getBearerSubject(req) {
  const authHeader = String(req.headers.authorization || '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const payload = token.split('.')[1];
  if (!payload) return '';
  try {
    return JSON.parse(decodeBase64Url(payload)).sub || '';
  } catch {
    return '';
  }
}

function getLimiterIdentity(req, verifiedIdentity) {
  if (verifiedIdentity !== undefined) {
    const normalized = String(verifiedIdentity || '').trim();
    if (!normalized) {
      throw new Error('Verified rate-limit identity is required.');
    }
    return `verified:${hash(normalized)}`;
  }
  const ipPart = `ip:${hash(getClientIp(req))}`;
  const subject = getBearerSubject(req);
  if (subject) return `${ipPart}:user:${hash(subject)}`;
  return ipPart;
}

function cleanup(now) {
  if (globalStore.size < 2000) return;
  for (const [key, bucket] of globalStore.entries()) {
    if (!bucket || bucket.resetAt <= now) globalStore.delete(key);
  }
}

export function getRateLimitMode(env = process.env) {
  const explicit = String(env.VCONTENT_RATE_LIMIT_MODE || '').trim().toLowerCase();
  if (explicit === 'shadow' || explicit === 'enforce' || explicit === 'local') return explicit;
  return 'local';
}

function setRateLimitHeaders(res, limit, count, resetAt, source) {
  const remaining = Math.max(0, limit.max - count);
  res.setHeader('X-RateLimit-Limit', String(limit.max));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
  res.setHeader('X-RateLimit-Source', source);
}

function rejectRateLimited(res, resetAt) {
  const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.status(429).json({
    ok: false,
    error: 'Too many requests. Please wait and try again.',
    retryAfter: retryAfterSeconds,
  });
  return false;
}

function rejectDistributedUnavailable(res) {
  const retryAfterSeconds = 2;
  res.setHeader('Retry-After', String(retryAfterSeconds));
  res.setHeader('X-RateLimit-Source', 'redis-unavailable');
  res.status(503).json({
    ok: false,
    error: 'Request protection is temporarily unavailable. Please try again.',
    retryAfter: retryAfterSeconds,
  });
  return false;
}

function enforceLocalRateLimit(key, limit, res, source = 'local') {
  const now = Date.now();
  cleanup(now);
  const current = globalStore.get(key);
  const bucket = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + limit.windowMs };
  bucket.count += 1;
  globalStore.set(key, bucket);

  setRateLimitHeaders(res, limit, bucket.count, bucket.resetAt, source);
  if (bucket.count <= limit.max) return true;
  return rejectRateLimited(res, bucket.resetAt);
}

function logDistributedFallback(route, error, failureMode) {
  console.warn(JSON.stringify({
    event: 'rate_limit_distributed_fallback',
    route: String(route || 'api').slice(0, 120),
    failureMode,
    error: error instanceof Error ? error.message.slice(0, 180) : 'Distributed counter unavailable.',
  }));
}

function normalizePositiveNumber(value, fallback, minimum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, parsed) : fallback;
}

export async function enforceRateLimit(req, res, options) {
  const env = options?.env || process.env;
  const mode = options?.mode
    ? getRateLimitMode({ VCONTENT_RATE_LIMIT_MODE: options.mode })
    : getRateLimitMode(env);
  const limit = {
    windowMs: normalizePositiveNumber(options?.windowMs, 60_000, 100),
    max: normalizePositiveNumber(options?.max, 30, 1),
  };
  const route = String(options?.route || req.url || 'api');
  const failureMode = options?.failureMode === 'local'
    ? 'local'
    : mode === 'enforce'
      ? 'closed'
      : 'local';
  const identity = getLimiterIdentity(req, options?.verifiedIdentity);
  const localKey = `${route}:${identity}`;

  if (mode === 'local') {
    return enforceLocalRateLimit(localKey, limit, res);
  }

  try {
    const [counter] = await incrementSharedCounters(
      [{ key: `rate:${route}:${identity}`, windowMs: limit.windowMs }],
      {
        env,
        fetchImpl: options?.fetchImpl,
        timeoutMs: options?.timeoutMs,
      },
    );
    if (mode === 'shadow') {
      const allowed = enforceLocalRateLimit(localKey, limit, res, 'redis-shadow');
      res.setHeader('X-RateLimit-Shared-Remaining', String(Math.max(0, limit.max - counter.count)));
      res.setHeader('X-RateLimit-Shared-Reset', String(Math.ceil(counter.resetAt / 1000)));
      res.setHeader('X-RateLimit-Shared-Exceeded', counter.count > limit.max ? '1' : '0');
      return allowed;
    }
    setRateLimitHeaders(res, limit, counter.count, counter.resetAt, 'redis-rest');
    if (counter.count <= limit.max) return true;
    return rejectRateLimited(res, counter.resetAt);
  } catch (error) {
    logDistributedFallback(route, error, failureMode);
    if (failureMode === 'closed') return rejectDistributedUnavailable(res);
    return enforceLocalRateLimit(localKey, limit, res, 'local-fallback');
  }
}

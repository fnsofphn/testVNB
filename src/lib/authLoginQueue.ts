export type LoginQueueOptions = {
  baseDelayMs?: number;
  maxSpreadMs?: number;
  loginsPerSecond?: number;
  jitterMs?: number;
};

export type AuthRateLimitRetryOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  identity?: string;
};

const DEFAULT_BASE_DELAY_MS = 0;
const DEFAULT_MAX_SPREAD_MS = 0;
const DEFAULT_LOGINS_PER_SECOND = 3;
const DEFAULT_JITTER_MS = 500;
const DEFAULT_RETRY_BASE_DELAY_MS = 15_000;
const DEFAULT_RETRY_MAX_DELAY_MS = 60_000;
const DEFAULT_RETRY_JITTER_MS = 30_000;
const DEFAULT_LEARNING_QUEUE_OPTIONS: Required<LoginQueueOptions> = {
  baseDelayMs: 0,
  maxSpreadMs: 4_000,
  loginsPerSecond: 30,
  jitterMs: 0,
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getNumberedLearnerIndex(email: string) {
  const localPart = email.split('@')[0] || '';
  const match = localPart.match(/^(?:test|learner|student|vlearning|vtraining|quiz)(?:[._-]?[a-z]+)?(?:[._-]?)(\d{1,5})$/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function getLoginQueueDelayMs(email: string, options: LoginQueueOptions = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxSpreadMs = Math.max(0, options.maxSpreadMs ?? DEFAULT_MAX_SPREAD_MS);
  const loginsPerSecond = Math.max(1, Math.floor(options.loginsPerSecond ?? DEFAULT_LOGINS_PER_SECOND));
  const jitterMs = Math.max(0, options.jitterMs ?? DEFAULT_JITTER_MS);
  const numberedLearnerIndex = getNumberedLearnerIndex(normalizedEmail);

  if (baseDelayMs === 0 && maxSpreadMs === 0) return 0;

  if (numberedLearnerIndex !== null) {
    const slotSecond = Math.floor((numberedLearnerIndex - 1) / loginsPerSecond);
    const slotDelayMs = Math.min(slotSecond * 1000, maxSpreadMs);
    const jitter = jitterMs ? stableHash(normalizedEmail) % (jitterMs + 1) : 0;
    return baseDelayMs + slotDelayMs + jitter;
  }

  const spreadDelayMs = stableHash(normalizedEmail || 'anonymous') % (maxSpreadMs + 1);
  const jitter = jitterMs ? stableHash(`${normalizedEmail}:jitter`) % (jitterMs + 1) : 0;
  return baseDelayMs + spreadDelayMs + jitter;
}

export function getLoginQueueWaitSeconds(email: string, options: LoginQueueOptions = {}) {
  return Math.max(1, Math.ceil(getLoginQueueDelayMs(email, options) / 1000));
}

export function isLearningLoginPath(path: string | null | undefined) {
  const normalizedPath = String(path || '').trim().toLowerCase();
  return (
    normalizedPath === '/vtraining' ||
    normalizedPath.startsWith('/vtraining/') ||
    normalizedPath === '/vdiscussion' ||
    normalizedPath.startsWith('/vdiscussion/') ||
    normalizedPath === '/vlearning' ||
    normalizedPath.startsWith('/vlearning/') ||
    normalizedPath.startsWith('/quiz/')
  );
}

export function getLearningLoginQueueDelayMs(
  email: string,
  path: string | null | undefined,
  options: LoginQueueOptions = DEFAULT_LEARNING_QUEUE_OPTIONS,
) {
  if (!isLearningLoginPath(path)) return 0;
  if (getNumberedLearnerIndex(String(email || '').trim().toLowerCase()) === null) return 0;
  return getLoginQueueDelayMs(email, options);
}

export function getLearningRuntimeQueueDelayMs(
  identity: string,
  path: string | null | undefined,
  options: LoginQueueOptions = {},
) {
  void identity;
  void options;
  if (!isLearningLoginPath(path)) return 0;
  return 0;
}

export function getAuthRateLimitRetryDelayMs(attempt: number, options: AuthRateLimitRetryOptions = {}) {
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS);
  const jitterMs = Math.max(0, options.jitterMs ?? DEFAULT_RETRY_JITTER_MS);
  const exponentialDelayMs = baseDelayMs * 2 ** Math.max(0, attempt);
  const identity = String(options.identity || 'anonymous').trim().toLowerCase();
  const jitter = jitterMs ? stableHash(`auth-rate-limit:${identity}:${attempt}`) % (jitterMs + 1) : 0;
  return Math.min(maxDelayMs, exponentialDelayMs + jitter);
}

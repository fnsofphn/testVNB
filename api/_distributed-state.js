const DEFAULT_TIMEOUT_MS = 1200;

export function cleanDistributedKeyPart(value, fallback = 'unknown') {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, 180);
  return cleaned || fallback;
}

export function getDistributedStateConfig(env = process.env) {
  const url = String(env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || '').trim().replace(/\/+$/, '');
  const token = String(env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url, token };
}

export function getDistributedStatePrefix(env = process.env) {
  const app = cleanDistributedKeyPart(env.VCONTENT_DISTRIBUTED_STATE_PREFIX, 'vcontent');
  const environment = cleanDistributedKeyPart(env.VERCEL_ENV || env.NODE_ENV, 'local');
  return `${app}:${environment}`;
}

export function buildDistributedStateKey(key, env = process.env) {
  return `${getDistributedStatePrefix(env)}:${cleanDistributedKeyPart(key)}`;
}

export async function executeDistributedStateCommand(command, options = {}) {
  const env = options.env || process.env;
  const redis = getDistributedStateConfig(env);
  if (!redis) {
    throw new Error('Distributed state credentials are not configured.');
  }
  const timeoutMs = Math.max(
    100,
    Math.min(
      10_000,
      Math.round(Number(options.timeoutMs || env.VCONTENT_DISTRIBUTED_STATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)),
    ),
  );
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch is unavailable for distributed state.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(redis.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redis.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || `Distributed state failed with HTTP ${response.status}.`);
    }
    return payload?.result;
  } finally {
    clearTimeout(timeout);
  }
}

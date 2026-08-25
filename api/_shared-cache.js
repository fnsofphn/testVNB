import { randomUUID } from 'node:crypto';
import {
  buildDistributedStateKey,
  executeDistributedStateCommand,
} from './_distributed-state.js';

const RELEASE_LOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`.trim();

const DEFAULT_TTL_SECONDS = 3600;
const DEFAULT_MAX_VALUE_BYTES = 1_500_000;
const DEFAULT_LOCK_MS = 2500;
const DEFAULT_WAIT_MS = 900;

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(key, options) {
  const result = await executeDistributedStateCommand(['GET', key], options);
  if (typeof result !== 'string' || !result) return null;
  try {
    return JSON.parse(result);
  } catch {
    await executeDistributedStateCommand(['DEL', key], options).catch(() => undefined);
    return null;
  }
}

async function writeJson(key, value, ttlSeconds, maxValueBytes, options) {
  const encoded = JSON.stringify(value);
  const payloadBytes = Buffer.byteLength(encoded, 'utf8');
  if (payloadBytes > maxValueBytes) {
    return { stored: false, payloadBytes, status: 'OVERSIZE' };
  }
  await executeDistributedStateCommand(['SET', key, encoded, 'EX', String(ttlSeconds)], options);
  return { stored: true, payloadBytes, status: 'MISS' };
}

export async function readThroughSharedJsonCache(cacheKey, loader, options = {}) {
  if (typeof loader !== 'function') {
    throw new Error('Shared cache loader is required.');
  }
  const env = options.env || process.env;
  const key = buildDistributedStateKey(`cache:${cacheKey}`, env);
  const lockKey = `${key}:lock`;
  const ttlSeconds = boundedNumber(
    options.ttlSeconds || env.VLEARNING_CONTENT_CACHE_TTL_SECONDS,
    DEFAULT_TTL_SECONDS,
    30,
    86_400,
  );
  const maxValueBytes = boundedNumber(
    options.maxValueBytes || env.VLEARNING_CONTENT_CACHE_MAX_BYTES,
    DEFAULT_MAX_VALUE_BYTES,
    16_384,
    1_900_000,
  );
  const lockMs = boundedNumber(options.lockMs, DEFAULT_LOCK_MS, 500, 10_000);
  const waitMs = boundedNumber(options.waitMs, DEFAULT_WAIT_MS, 0, 5000);
  const commandOptions = {
    env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  };

  let cached;
  try {
    cached = await readJson(key, commandOptions);
  } catch {
    return { value: await loader(), cacheStatus: 'BYPASS', payloadBytes: null };
  }
  if (cached !== null) {
    return {
      value: cached,
      cacheStatus: 'HIT',
      payloadBytes: Buffer.byteLength(JSON.stringify(cached), 'utf8'),
    };
  }

  const lockToken = randomUUID();
  let ownsLock = false;
  try {
    const lockResult = await executeDistributedStateCommand(
      ['SET', lockKey, lockToken, 'NX', 'PX', String(lockMs)],
      commandOptions,
    );
    ownsLock = lockResult === 'OK';
  } catch {
    return { value: await loader(), cacheStatus: 'BYPASS', payloadBytes: null };
  }

  if (!ownsLock && waitMs > 0) {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
      await sleep(Math.min(75, Math.max(10, deadline - Date.now())));
      try {
        cached = await readJson(key, commandOptions);
      } catch {
        break;
      }
      if (cached !== null) {
        return {
          value: cached,
          cacheStatus: 'WAIT_HIT',
          payloadBytes: Buffer.byteLength(JSON.stringify(cached), 'utf8'),
        };
      }
    }
  }

  try {
    const value = await loader();
    if (!ownsLock) {
      return { value, cacheStatus: 'MISS', payloadBytes: null };
    }
    const writeResult = await writeJson(key, value, ttlSeconds, maxValueBytes, commandOptions);
    return {
      value,
      cacheStatus: writeResult.status,
      payloadBytes: writeResult.payloadBytes,
    };
  } finally {
    if (ownsLock) {
      await executeDistributedStateCommand(
        ['EVAL', RELEASE_LOCK_SCRIPT, '1', lockKey, lockToken],
        commandOptions,
      ).catch(() => undefined);
    }
  }
}

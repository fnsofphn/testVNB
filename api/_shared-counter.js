const ATOMIC_INCREMENT_SCRIPT = `
local results = {}
for index, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 then
    redis.call('PEXPIRE', key, ARGV[index])
  end
  local ttl = redis.call('PTTL', key)
  table.insert(results, count)
  table.insert(results, ttl)
end
return results
`.trim();

import {
  buildDistributedStateKey,
  executeDistributedStateCommand,
} from './_distributed-state.js';

export function getVLearningAdmissionCounterMode(env = process.env) {
  const explicit = String(env.VLEARNING_ADMISSION_COUNTER_MODE || '').trim().toLowerCase();
  const isProduction = env.VERCEL_ENV
    ? env.VERCEL_ENV === 'production'
    : env.NODE_ENV === 'production';
  if (explicit === 'shadow' || explicit === 'enforce') return explicit;
  if (explicit === 'disabled') return isProduction ? 'unconfigured' : 'disabled';
  return isProduction ? 'unconfigured' : 'disabled';
}

export async function incrementSharedCounters(counters, options = {}) {
  if (!Array.isArray(counters) || counters.length === 0) {
    throw new Error('At least one shared counter is required.');
  }
  const env = options.env || process.env;
  const normalized = counters.map((counter) => ({
    key: buildDistributedStateKey(counter?.key, env),
    windowMs: Math.max(100, Math.min(86_400_000, Math.round(Number(counter?.windowMs || 1000)))),
  }));
  const command = [
    'EVAL',
    ATOMIC_INCREMENT_SCRIPT,
    String(normalized.length),
    ...normalized.map((counter) => counter.key),
    ...normalized.map((counter) => String(counter.windowMs)),
  ];
  const result = await executeDistributedStateCommand(command, {
    env,
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });
  if (!Array.isArray(result) || result.length !== normalized.length * 2) {
    throw new Error('Distributed counter returned an invalid result shape.');
  }
  return normalized.map((counter, index) => {
    const count = Number(result[index * 2]);
    const ttlMs = Number(result[index * 2 + 1]);
    if (!Number.isFinite(count) || !Number.isFinite(ttlMs)) {
      throw new Error('Distributed counter returned non-numeric values.');
    }
    return {
      key: counter.key,
      count,
      ttlMs: Math.max(0, ttlMs),
      resetAt: Date.now() + Math.max(0, ttlMs),
    };
  });
}

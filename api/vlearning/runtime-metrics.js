const MAX_RECENT_EVENTS = 200;

const globalMetrics = globalThis.__vlearningRuntimeMetrics || {
  startedAt: new Date().toISOString(),
  routes: new Map(),
};
globalThis.__vlearningRuntimeMetrics = globalMetrics;

function cleanRoute(value) {
  return String(value || 'unknown').trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 120) || 'unknown';
}

function cleanScope(value) {
  return String(value || 'global').trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 160) || 'global';
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1));
  return sorted[index];
}

function getRouteBucket(route) {
  const routeName = cleanRoute(route);
  const existing = globalMetrics.routes.get(routeName);
  if (existing) return existing;
  const bucket = {
    route: routeName,
    count: 0,
    errorCount: 0,
    retryableCount: 0,
    waitCount: 0,
    totalMsSamples: [],
    waitMsSamples: [],
    lastEventAt: null,
    recent: [],
  };
  globalMetrics.routes.set(routeName, bucket);
  return bucket;
}

export function getVLearningRuntimeMode() {
  const mode = String(process.env.VLEARNING_RUNTIME_MODE || 'normal').trim().toLowerCase();
  return mode === 'degraded' || mode === 'protect' ? mode : 'normal';
}

export function recordVLearningRuntimeMetric(route, fields = {}) {
  const bucket = getRouteBucket(route);
  const now = new Date().toISOString();
  const totalMs = Math.max(0, Math.round(Number(fields.totalMs || 0)));
  const waitMs = Math.max(0, Math.round(Number(fields.waitMs || 0)));
  const status = String(fields.status || fields.result || 'ok');
  const isError = fields.error === true || status === 'error' || status === 'failed';
  const isRetryable = Number(fields.retryableCount || 0) > 0 || status === 'retryable_error';

  bucket.count += 1;
  if (isError) bucket.errorCount += 1;
  if (isRetryable) bucket.retryableCount += Number(fields.retryableCount || 1);
  if (waitMs > 0 || status === 'wait' || status === 'degraded') bucket.waitCount += 1;
  bucket.lastEventAt = now;
  bucket.totalMsSamples.push(totalMs);
  if (bucket.totalMsSamples.length > MAX_RECENT_EVENTS) bucket.totalMsSamples.shift();
  if (waitMs > 0) {
    bucket.waitMsSamples.push(waitMs);
    if (bucket.waitMsSamples.length > MAX_RECENT_EVENTS) bucket.waitMsSamples.shift();
  }
  bucket.recent.push({
    at: now,
    scope: cleanScope(fields.scope),
    status,
    totalMs,
    waitMs,
    eventCount: Math.max(0, Math.round(Number(fields.eventCount || 0))),
    savedCount: Math.max(0, Math.round(Number(fields.savedCount || 0))),
    retryableCount: Math.max(0, Math.round(Number(fields.retryableCount || 0))),
  });
  if (bucket.recent.length > 25) bucket.recent.shift();
}

export function getVLearningRuntimeSnapshot() {
  const routes = Array.from(globalMetrics.routes.values()).map((bucket) => {
    const totalMsSamples = bucket.totalMsSamples.filter((value) => Number.isFinite(value));
    const waitMsSamples = bucket.waitMsSamples.filter((value) => Number.isFinite(value));
    return {
      route: bucket.route,
      count: bucket.count,
      errorCount: bucket.errorCount,
      retryableCount: bucket.retryableCount,
      waitCount: bucket.waitCount,
      lastEventAt: bucket.lastEventAt,
      totalMs: {
        p50: percentile(totalMsSamples, 50),
        p95: percentile(totalMsSamples, 95),
        p99: percentile(totalMsSamples, 99),
      },
      waitMs: {
        p50: percentile(waitMsSamples, 50),
        p95: percentile(waitMsSamples, 95),
        p99: percentile(waitMsSamples, 99),
      },
      recent: bucket.recent,
    };
  });
  return {
    ok: true,
    mode: getVLearningRuntimeMode(),
    startedAt: globalMetrics.startedAt,
    generatedAt: new Date().toISOString(),
    routes,
  };
}

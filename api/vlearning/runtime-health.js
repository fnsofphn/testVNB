import { enforceRateLimit } from '../_rate-limit.js';
import { getVLearningRuntimeSnapshot } from './runtime-metrics.js';

const DEFAULT_ADMISSION_P95_WARN_MS = 5000;
const DEFAULT_PROGRESS_P95_WARN_MS = 2000;

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(payload);
}

function logRuntimeHealth(level, fields) {
  const line = JSON.stringify({ level, route: 'vlearning-runtime-health', ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

function getWarnThresholds() {
  const admissionP95WarnMs = Number(process.env.VLEARNING_ADMISSION_P95_WARN_MS || DEFAULT_ADMISSION_P95_WARN_MS);
  const progressP95WarnMs = Number(process.env.VLEARNING_PROGRESS_P95_WARN_MS || DEFAULT_PROGRESS_P95_WARN_MS);
  return {
    admissionP95WarnMs: Number.isFinite(admissionP95WarnMs) ? admissionP95WarnMs : DEFAULT_ADMISSION_P95_WARN_MS,
    progressP95WarnMs: Number.isFinite(progressP95WarnMs) ? progressP95WarnMs : DEFAULT_PROGRESS_P95_WARN_MS,
  };
}

function deriveSuggestedMode(snapshot, thresholds) {
  const admission = snapshot.routes.find((route) => route.route === 'vlearning-gateway-admit');
  const progress = snapshot.routes.find((route) => route.route === 'vlearning-progress-sync');
  const admissionP95 = Number(admission?.waitMs?.p95 || 0);
  const progressP95 = Number(progress?.totalMs?.p95 || 0);
  const progressRetryableRate = progress?.count ? Number(progress.retryableCount || 0) / progress.count : 0;
  const progressErrorRate = progress?.count ? Number(progress.errorCount || 0) / progress.count : 0;

  if (progressErrorRate >= 0.1 || progressRetryableRate >= 0.25 || progressP95 >= thresholds.progressP95WarnMs * 2) {
    return {
      suggestedMode: 'protect',
      reasons: ['progress-sync pressure is above protect threshold'],
    };
  }
  const reasons = [];
  if (admissionP95 >= thresholds.admissionP95WarnMs) reasons.push('admission wait p95 is above target');
  if (progressP95 >= thresholds.progressP95WarnMs) reasons.push('progress-sync p95 is above target');
  if (progressRetryableRate > 0) reasons.push('progress-sync has retryable writes');
  return {
    suggestedMode: reasons.length ? 'degraded' : 'normal',
    reasons,
  };
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const requestId = req.headers['x-vercel-id'] || req.headers['x-request-id'] || '';

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'vlearning-runtime-health', windowMs: 60_000, max: 600 })) return;
  const rateLimitSource = String(res.getHeader('X-RateLimit-Source') || 'unknown');

  const snapshot = getVLearningRuntimeSnapshot();
  const thresholds = getWarnThresholds();
  const derived = deriveSuggestedMode(snapshot, thresholds);
  const payload = {
    ...snapshot,
    thresholds,
    currentMode: snapshot.mode,
    suggestedMode: derived.suggestedMode,
    reasons: derived.reasons,
    note: 'Per-instance in-memory metrics. Use with Vercel logs and Supabase health for production decisions.',
  };

  logRuntimeHealth('info', {
    msg: 'done',
    requestId,
    currentMode: payload.currentMode,
    suggestedMode: payload.suggestedMode,
    rateLimitSource,
    routeCount: payload.routes.length,
    totalMs: Date.now() - startedAt,
  });

  if (req.method === 'HEAD') {
    res.statusCode = 200;
    res.end();
    return;
  }
  sendJson(res, 200, payload);
}

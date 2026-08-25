export type RuntimeRealtimeMode = 'realtime' | 'hybrid' | 'polling' | 'off';
export type RuntimeScope = 'discussion' | 'training' | 'events' | 'global';

const MIN_POLL_MS = 3000;
const MAX_POLL_MS = 60000;
type RuntimeEnv = Record<string, string | undefined>;
type RuntimePollOptions = {
  envName?: string;
  useScopeDefault?: boolean;
};
export type ScalePollProfile = 'discussion-session' | 'discussion-monitor' | 'discussion-steps' | 'discussion-contributions';

function readEnv(name: string): string {
  return String(import.meta.env[name] || '').trim();
}

function normalizeMode(value: string, fallback: RuntimeRealtimeMode): RuntimeRealtimeMode {
  const mode = value.toLowerCase();
  if (mode === 'realtime' || mode === 'hybrid' || mode === 'polling' || mode === 'off') return mode;
  return fallback;
}

function scopedPollEnvName(scope: RuntimeScope) {
  return scope === 'discussion'
    ? 'VITE_DISCUSSION_POLL_MS'
    : scope === 'events'
      ? 'VITE_EVENTS_POLL_MS'
    : scope === 'training'
      ? 'VITE_TRAINING_POLL_MS'
      : 'VITE_GLOBAL_POLL_MS';
}

export function getRuntimePollMsFromEnv(
  env: RuntimeEnv,
  scope: RuntimeScope,
  fallbackMs: number,
  options: RuntimePollOptions = {},
): number {
  const specificValue = options.envName ? String(env[options.envName] || '').trim() : '';
  const scopedValue = options.useScopeDefault === false ? '' : String(env[scopedPollEnvName(scope)] || '').trim();
  const globalValue = options.useScopeDefault === false ? '' : String(env.VITE_POLL_MS || '').trim();
  const rawValue = Number(specificValue || scopedValue || globalValue || fallbackMs);
  const value = Number.isFinite(rawValue) ? rawValue : fallbackMs;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(value)));
}

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildRuntimeRefetchInterval(baseMs: number, seed = '', jitterRatio = 0.2): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return MIN_POLL_MS;
  const safeBase = Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(baseMs)));
  const safeJitterRatio = Math.min(0.5, Math.max(0, jitterRatio));
  if (!safeJitterRatio || !seed) return safeBase;
  const spread = Math.round(safeBase * safeJitterRatio);
  const offset = (hashSeed(seed) % (spread * 2 + 1)) - spread;
  return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, safeBase + offset));
}

function getConcurrencyTarget(env: RuntimeEnv) {
  const target = Number(String(env.VITE_CONCURRENCY_TARGET || env.VITE_SCALE_TARGET || '').trim());
  return Number.isFinite(target) && target > 0 ? target : 0;
}

function getScaleFloorMs(profile: ScalePollProfile, target: number) {
  if (target >= 1000) {
    if (profile === 'discussion-monitor') return 30000;
    if (profile === 'discussion-steps') return 30000;
    return 20000;
  }
  if (target >= 500) {
    if (profile === 'discussion-monitor') return 20000;
    if (profile === 'discussion-steps') return 20000;
    return 15000;
  }
  return 0;
}

export function getScaleAwarePollMsFromEnv(env: RuntimeEnv, profile: ScalePollProfile, configuredMs: number): number {
  const target = getConcurrencyTarget(env);
  const scaleFloorMs = getScaleFloorMs(profile, target);
  const safeConfiguredMs = Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, Math.round(configuredMs)));
  return Math.max(safeConfiguredMs, scaleFloorMs);
}

export function getScaleAwarePollMs(profile: ScalePollProfile, configuredMs: number): number {
  return getScaleAwarePollMsFromEnv(import.meta.env as RuntimeEnv, profile, configuredMs);
}

export function getRuntimeRealtimeMode(scope: RuntimeScope, fallback: RuntimeRealtimeMode = 'hybrid'): RuntimeRealtimeMode {
  const scopedMode = scope === 'discussion'
    ? readEnv('VITE_DISCUSSION_REALTIME_MODE')
    : scope === 'events'
      ? readEnv('VITE_EVENTS_REALTIME_MODE')
    : scope === 'training'
      ? readEnv('VITE_TRAINING_REALTIME_MODE')
      : readEnv('VITE_REALTIME_SYNC_MODE');
  return normalizeMode(scopedMode || readEnv('VITE_REALTIME_MODE'), fallback);
}

export function shouldUseRuntimeRealtime(scope: RuntimeScope, fallback: RuntimeRealtimeMode = 'hybrid'): boolean {
  const mode = getRuntimeRealtimeMode(scope, fallback);
  return mode === 'realtime' || mode === 'hybrid';
}

export function shouldUseRuntimePolling(scope: RuntimeScope, fallback: RuntimeRealtimeMode = 'hybrid'): boolean {
  const mode = getRuntimeRealtimeMode(scope, fallback);
  return mode === 'polling' || mode === 'hybrid';
}

export function getRuntimePollMs(scope: RuntimeScope, fallbackMs: number, options: RuntimePollOptions = {}): number {
  return getRuntimePollMsFromEnv(import.meta.env as RuntimeEnv, scope, fallbackMs, options);
}

export function shouldUseFullDiscussionRealtime(): boolean {
  return readEnv('VITE_DISCUSSION_FULL_REALTIME').toLowerCase() === 'true';
}

export function shouldUseGlobalSuniRealtime(): boolean {
  return readEnv('VITE_GLOBAL_SUNI_REALTIME').toLowerCase() === 'true';
}

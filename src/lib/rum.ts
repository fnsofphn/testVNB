import { supabase } from '@/lib/supabaseClient';

export type VLearningRumEvent = 'login' | 'open_course' | 'open_class' | 'submit_quiz';

type RumOptions = {
  status?: 'ok' | 'error';
  scopeType?: 'course' | 'class' | 'quiz' | 'global';
  scopeId?: string;
  retryCount?: number;
};

function getNavigationType() {
  if (typeof performance === 'undefined') return 'unknown';
  const entry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  return entry?.type || 'unknown';
}

function getConnectionType() {
  if (typeof navigator === 'undefined') return 'unknown';
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  return connection?.effectiveType || 'unknown';
}

export function getRumStartedAt() {
  return typeof performance === 'undefined' ? Date.now() : performance.now();
}

export function getRumDurationMs(startedAt: number) {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now();
  return Math.max(0, Math.round(now - startedAt));
}

export async function reportVLearningRum(
  event: VLearningRumEvent,
  totalMs: number,
  options: RumOptions = {},
) {
  if (!supabase || typeof fetch !== 'function') return;
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;
    await fetch('/api/vlearning/rum', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event,
        status: options.status || 'ok',
        scopeType: options.scopeType || 'global',
        scopeId: options.scopeId || 'global',
        retryCount: options.retryCount || 0,
        totalMs,
        navigationType: getNavigationType(),
        connectionType: getConnectionType(),
      }),
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    // Telemetry must never block the learner flow.
  }
}

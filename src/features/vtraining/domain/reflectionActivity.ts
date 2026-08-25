export const DEFAULT_REFLECTION_DURATION_MINUTES = 60;
export const REFLECTION_SERVER_DRAFT_INTERVAL_MS = 5 * 60 * 1000;

type ReflectionMetadataInput = {
  libraryMetadata?: Record<string, unknown>;
  libraryItemId?: string;
  maxAttempts: number | string;
  durationMinutes?: number | string | null;
};

export function formatReflectionQuestionPrompt(prompt: string) {
  return String(prompt || '')
    .replace(/^\s*Ph\u1ea7n\s+\d+(?:\.\d+)?\s*[:\-\u2013]\s*/iu, '')
    .trim();
}

export function normalizeReflectionDurationMinutes(value?: number | string | null) {
  if (value == null || String(value).trim() === '') return DEFAULT_REFLECTION_DURATION_MINUTES;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_REFLECTION_DURATION_MINUTES;
  return Math.max(1, Math.round(parsed));
}

export function buildReflectionActivityMetadata(input: ReflectionMetadataInput) {
  const metadata = input.libraryMetadata || {};
  return {
    templateId: input.libraryItemId || '',
    variants: Array.isArray(metadata.variants) ? metadata.variants : [],
    maxAttempts: Math.max(1, Number(input.maxAttempts || 1)),
    durationMinutes: normalizeReflectionDurationMinutes(input.durationMinutes),
    requireAllQuestions: false,
  };
}

export function shouldAllowEmptyReflectionSubmission(input: {
  requireAllQuestions: boolean;
  autoSubmit?: boolean;
}) {
  return !input.requireAllQuestions || Boolean(input.autoSubmit);
}

export function getReflectionRemainingSeconds(input: { durationMinutes?: number | string | null; startedAt: number; now?: number }) {
  const durationSeconds = normalizeReflectionDurationMinutes(input.durationMinutes) * 60;
  const elapsedSeconds = Math.floor(((input.now ?? Date.now()) - input.startedAt) / 1000);
  return Math.max(0, durationSeconds - elapsedSeconds);
}

export function formatReflectionCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function shouldAutoSubmitReflection(input: {
  isTimeUp: boolean;
  isReadonlyView: boolean;
  completed: boolean;
  alreadySubmitted: boolean;
  submitting: boolean;
  canAttempt: boolean;
}) {
  return Boolean(
    input.isTimeUp
      && !input.isReadonlyView
      && !input.completed
      && !input.alreadySubmitted
      && !input.submitting
      && input.canAttempt,
  );
}

export function shouldAutoSubmitTimedActivity(input: {
  isTimeUp: boolean;
  hasStarted: boolean;
  completed: boolean;
  submitting: boolean;
  canAttempt: boolean;
}) {
  return Boolean(
    input.isTimeUp
      && input.hasStarted
      && !input.completed
      && !input.submitting
      && input.canAttempt,
  );
}

export function getTrainingActivityStudentStatus(input: {
  completedCount: number;
  hasNeedsResubmission?: boolean;
}) {
  if (input.hasNeedsResubmission) {
    return { label: 'Cần cập nhật bài', done: false, tone: 'warning' as const };
  }
  if (Math.max(0, Number(input.completedCount || 0)) > 0) {
    return { label: 'Đã hoàn thành', done: true, tone: 'success' as const };
  }
  return { label: 'Chưa hoàn thành', done: false, tone: 'warning' as const };
}

export function getReflectionDraftStorageKey(activityId: string, profileId?: string | null) {
  return `vcontent.reflection.draft.${String(activityId || 'unknown')}.${String(profileId || 'anonymous')}`;
}

export function hasReflectionDraftContent(answers: Record<string, string>) {
  return Object.values(answers || {}).some((value) => String(value || '').trim().length > 0);
}

export function shouldSaveReflectionServerDraft(input: {
  answers: Record<string, string>;
  lastSavedAnswers?: Record<string, string>;
  lastSavedAt: number;
  now?: number;
  intervalMs?: number;
  disabled?: boolean;
}) {
  if (input.disabled) return false;
  if (!hasReflectionDraftContent(input.answers)) return false;
  const now = input.now ?? Date.now();
  const intervalMs = input.intervalMs ?? REFLECTION_SERVER_DRAFT_INTERVAL_MS;
  if (now - Math.max(0, Number(input.lastSavedAt || 0)) < intervalMs) return false;
  return JSON.stringify(input.answers || {}) !== JSON.stringify(input.lastSavedAnswers || {});
}

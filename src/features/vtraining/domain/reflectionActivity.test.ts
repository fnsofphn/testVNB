import assert from 'node:assert/strict';
import {
  buildReflectionActivityMetadata,
  formatReflectionCountdown,
  formatReflectionQuestionPrompt,
  getReflectionRemainingSeconds,
  getReflectionDraftStorageKey,
  getTrainingActivityStudentStatus,
  normalizeReflectionDurationMinutes,
  shouldAllowEmptyReflectionSubmission,
  shouldSaveReflectionServerDraft,
  shouldAutoSubmitReflection,
  shouldAutoSubmitTimedActivity,
} from './reflectionActivity.ts';

assert.equal(formatReflectionQuestionPrompt('Phần 1: Mô tả tình huống thực tế'), 'Mô tả tình huống thực tế');
assert.equal(formatReflectionQuestionPrompt('  Phần 2 : Phân tích điểm chưa chuẩn  '), 'Phân tích điểm chưa chuẩn');
assert.equal(formatReflectionQuestionPrompt('Phần 2.1 - Nhận diện vấn đề'), 'Nhận diện vấn đề');
assert.equal(formatReflectionQuestionPrompt('Mô tả tình huống thực tế'), 'Mô tả tình huống thực tế');

assert.equal(normalizeReflectionDurationMinutes(0), 1);
assert.equal(normalizeReflectionDurationMinutes('45'), 45);
assert.equal(normalizeReflectionDurationMinutes(''), 60);

assert.deepEqual(
  buildReflectionActivityMetadata({
    libraryMetadata: { variants: [{ id: 'v1', title: 'Mẫu', questions: [] }] },
    maxAttempts: 2,
    durationMinutes: '30',
  }),
  {
    templateId: '',
    variants: [{ id: 'v1', title: 'Mẫu', questions: [] }],
    maxAttempts: 2,
    durationMinutes: 30,
    requireAllQuestions: false,
  },
);

assert.equal(shouldAllowEmptyReflectionSubmission({ requireAllQuestions: false }), true);
assert.equal(shouldAllowEmptyReflectionSubmission({ requireAllQuestions: true }), false);
assert.equal(shouldAllowEmptyReflectionSubmission({ requireAllQuestions: true, autoSubmit: true }), true);

assert.equal(getReflectionRemainingSeconds({ durationMinutes: 30, startedAt: 1_000, now: 61_000 }), 1_740);
assert.equal(getReflectionRemainingSeconds({ durationMinutes: 1, startedAt: 1_000, now: 120_000 }), 0);
assert.equal(formatReflectionCountdown(3_661), '61:01');
assert.equal(formatReflectionCountdown(59), '00:59');

assert.equal(shouldAutoSubmitReflection({
  isTimeUp: true,
  isReadonlyView: false,
  completed: false,
  alreadySubmitted: false,
  submitting: false,
  canAttempt: true,
}), true);
assert.equal(shouldAutoSubmitReflection({
  isTimeUp: true,
  isReadonlyView: false,
  completed: false,
  alreadySubmitted: false,
  submitting: true,
  canAttempt: true,
}), false);
assert.equal(shouldAutoSubmitTimedActivity({
  isTimeUp: true,
  hasStarted: true,
  completed: false,
  submitting: false,
  canAttempt: true,
}), true);
assert.equal(shouldAutoSubmitTimedActivity({
  isTimeUp: true,
  hasStarted: false,
  completed: false,
  submitting: false,
  canAttempt: true,
}), false);

assert.deepEqual(getTrainingActivityStudentStatus({ completedCount: 0, hasNeedsResubmission: false }), {
  label: 'Chưa hoàn thành',
  done: false,
  tone: 'warning',
});
assert.deepEqual(getTrainingActivityStudentStatus({ completedCount: 1, hasNeedsResubmission: false }), {
  label: 'Đã hoàn thành',
  done: true,
  tone: 'success',
});
assert.deepEqual(getTrainingActivityStudentStatus({ completedCount: 1, hasNeedsResubmission: true }), {
  label: 'Cần cập nhật bài',
  done: false,
  tone: 'warning',
});

assert.equal(
  getReflectionDraftStorageKey('activity-1', 'profile-1'),
  'vcontent.reflection.draft.activity-1.profile-1',
);
assert.equal(shouldSaveReflectionServerDraft({
  answers: {},
  lastSavedAnswers: {},
  lastSavedAt: 0,
  now: 10 * 60 * 1000,
}), false);
assert.equal(shouldSaveReflectionServerDraft({
  answers: { 'q-1': 'abc' },
  lastSavedAnswers: {},
  lastSavedAt: 0,
  now: 2 * 60 * 1000,
}), false);
assert.equal(shouldSaveReflectionServerDraft({
  answers: { 'q-1': 'abc' },
  lastSavedAnswers: {},
  lastSavedAt: 0,
  now: 5 * 60 * 1000,
}), true);
assert.equal(shouldSaveReflectionServerDraft({
  answers: { 'q-1': 'abc' },
  lastSavedAnswers: { 'q-1': 'abc' },
  lastSavedAt: 0,
  now: 10 * 60 * 1000,
}), false);

console.log('reflectionActivity tests passed');

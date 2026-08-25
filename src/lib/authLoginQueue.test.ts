import { getAuthRateLimitRetryDelayMs, getLearningLoginQueueDelayMs, getLearningRuntimeQueueDelayMs, getLoginQueueDelayMs } from './authLoginQueue.ts';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

assertEqual(getLoginQueueDelayMs('test150@vinabrain.com'), 0, 'default login queue adds no artificial delay');
assertEqual(getLearningLoginQueueDelayMs('test150@vinabrain.com', '/vbusiness'), 0, 'non-learning login routes are not queued');
assert(getLearningLoginQueueDelayMs('test150@vinabrain.com', '/quiz/form-1') > 0, 'quiz login route uses learning queue');
assert(getLearningLoginQueueDelayMs('test150@vinabrain.com', '/vtraining/reflections/activity-1') > 0, 'reflection login route uses learning queue');
assert(getLearningLoginQueueDelayMs('test150@vinabrain.com', '/vlearning/course-1') > 0, 'vlearning learner route uses learning queue');
assertEqual(getLearningLoginQueueDelayMs('binh2tn@hcmpc.com.vn', '/vtraining'), 0, 'real learner emails skip artificial learning login queue');
assertEqual(getLearningLoginQueueDelayMs('student@example.com', '/quiz/form-1'), 0, 'generic learner emails skip artificial learning login queue');

const learningDelays = Array.from({ length: 150 }, (_, index) =>
  getLearningLoginQueueDelayMs(`test${index + 1}@vinabrain.com`, '/quiz/form-1'),
);
assertEqual(learningDelays[0], 0, 'first learner starts immediately');
assert(learningDelays[149] <= 4_000, '150 queued learners finish within four seconds by default');

const learningPerSecond = new Map<number, number>();
for (const delay of learningDelays) {
  const second = Math.floor(delay / 1000);
  learningPerSecond.set(second, (learningPerSecond.get(second) || 0) + 1);
}
assert(
  Math.max(...learningPerSecond.values()) <= 30,
  'learning login queue must keep 150-account classroom tests inside the five-second login target',
);

const runtimeDelays = Array.from({ length: 150 }, (_, index) =>
  getLearningRuntimeQueueDelayMs(`vlearning150.${String(index + 1).padStart(3, '0')}@vinabrain.local`, '/vlearning/course-1'),
);
assertEqual(getLearningRuntimeQueueDelayMs('student150@example.com', '/vbusiness'), 0, 'non-learning routes skip runtime queue');
assertEqual(getLearningRuntimeQueueDelayMs('b24493ce-78fc-49ea-bbfa-f1a9e963a678', '/vlearning/course-1'), 0, 'real learner profile ids must not wait in a runtime queue');
assertEqual(getLearningRuntimeQueueDelayMs('phamhoainamk54@gmail.com', '/vlearning/course-1'), 0, 'real learner emails must not wait in a runtime queue');
assert(runtimeDelays.every((delay) => delay === 0), 'numbered VLearning load-test users must not be staggered by the learner runtime');

const delays = Array.from({ length: 150 }, (_, index) =>
  getLoginQueueDelayMs(`test${index + 1}@vinabrain.com`, {
    baseDelayMs: 1000,
    maxSpreadMs: 60_000,
    loginsPerSecond: 3,
    jitterMs: 0,
  }),
);

assertEqual(delays[0], 1000, 'first numbered learner waits one base slot');
assertEqual(delays[2], 1000, 'third numbered learner shares first slot');
assertEqual(delays[3], 2000, 'fourth numbered learner moves to second slot');
assertEqual(delays[149], 50_000, '150 learners at 3/s finish inside 50 seconds plus base');

const perSecond = new Map<number, number>();
for (const delay of delays) {
  const second = Math.floor(delay / 1000);
  perSecond.set(second, (perSecond.get(second) || 0) + 1);
}
assert(
  Math.max(...perSecond.values()) <= 3,
  'numbered learner emails must be capped at three login attempts per second',
);

const hashedDelay = getLoginQueueDelayMs('student@example.com', {
  baseDelayMs: 1000,
  maxSpreadMs: 60_000,
  loginsPerSecond: 3,
  jitterMs: 500,
});
assert(hashedDelay >= 1000 && hashedDelay <= 61_500, 'generic email gets bounded deterministic delay');

assertEqual(getAuthRateLimitRetryDelayMs(0, { baseDelayMs: 3000, jitterMs: 0 }), 3000, 'first 429 retry waits base delay');
assertEqual(getAuthRateLimitRetryDelayMs(1, { baseDelayMs: 3000, jitterMs: 0 }), 6000, 'second 429 retry doubles delay');
assertEqual(getAuthRateLimitRetryDelayMs(4, { baseDelayMs: 3000, maxDelayMs: 10_000, jitterMs: 0 }), 10_000, '429 retry delay is capped');
assertEqual(getAuthRateLimitRetryDelayMs(0, { jitterMs: 0 }), 15_000, 'default first 429 retry waits 15 seconds');
assertEqual(getAuthRateLimitRetryDelayMs(1, { jitterMs: 0 }), 30_000, 'default second 429 retry waits 30 seconds');
assertEqual(getAuthRateLimitRetryDelayMs(2, { jitterMs: 0 }), 60_000, 'default third 429 retry waits 60 seconds');

const learnerOneRetry = getAuthRateLimitRetryDelayMs(0, { identity: 'learner1@example.com' });
const learnerTwoRetry = getAuthRateLimitRetryDelayMs(0, { identity: 'learner2@example.com' });
assert(learnerOneRetry >= 15_000 && learnerOneRetry <= 45_000, 'first 429 retry has a bounded per-user spread');
assert(learnerTwoRetry >= 15_000 && learnerTwoRetry <= 45_000, 'second learner retry has a bounded per-user spread');
assert(learnerOneRetry !== learnerTwoRetry, 'different learners must not retry 429 responses in one synchronized wave');
assertEqual(
  getAuthRateLimitRetryDelayMs(0, { identity: 'learner1@example.com' }),
  learnerOneRetry,
  '429 retry spread is deterministic for one learner and attempt',
);
assertEqual(
  getAuthRateLimitRetryDelayMs(1, { identity: 'learner1@example.com' }) <= 60_000,
  true,
  'second 429 retry remains capped at 60 seconds',
);

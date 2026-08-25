import { buildRuntimeRefetchInterval, getRuntimePollMsFromEnv, getScaleAwarePollMsFromEnv } from './runtimeLoadMode.ts';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function testMonitorPollDoesNotInheritSessionPoll() {
  const env = {
    VITE_DISCUSSION_POLL_MS: '5000',
    VITE_DISCUSSION_MONITOR_POLL_MS: '',
  };

  const monitorPollMs = getRuntimePollMsFromEnv(env, 'discussion', 15000, {
    envName: 'VITE_DISCUSSION_MONITOR_POLL_MS',
    useScopeDefault: false,
  });

  assertEqual(monitorPollMs, 15000, 'Monitor polling should keep its safer fallback when no monitor-specific env is set');
}

function testPurposeSpecificPollEnvWins() {
  const env = {
    VITE_DISCUSSION_POLL_MS: '10000',
    VITE_DISCUSSION_MONITOR_POLL_MS: '20000',
  };

  const monitorPollMs = getRuntimePollMsFromEnv(env, 'discussion', 15000, {
    envName: 'VITE_DISCUSSION_MONITOR_POLL_MS',
    useScopeDefault: false,
  });

  assertEqual(monitorPollMs, 20000, 'Monitor-specific polling env should override the fallback');
}

function testRefetchIntervalAddsStableJitter() {
  const first = buildRuntimeRefetchInterval(10000, 'session-a');
  const second = buildRuntimeRefetchInterval(10000, 'session-a');
  const other = buildRuntimeRefetchInterval(10000, 'session-b');

  assertEqual(first, second, 'Poll jitter should be stable for the same seed');
  if (first === other) {
    throw new Error('Different seeds should spread polling intervals');
  }
  if (first < 8000 || first > 12000 || other < 8000 || other > 12000) {
    throw new Error('Jittered polling should stay within a 20 percent band');
  }
}

function testScaleTargetRaisesDiscussionSessionFloor() {
  const pollMs = getScaleAwarePollMsFromEnv({
    VITE_CONCURRENCY_TARGET: '1000',
    VITE_DISCUSSION_SESSION_POLL_MS: '10000',
  }, 'discussion-session', 10000);

  assertEqual(pollMs, 20000, '1000-user scale target should raise discussion session polling to the safe floor');
}

function testScaleTargetRaisesMonitorFloor() {
  const pollMs = getScaleAwarePollMsFromEnv({
    VITE_CONCURRENCY_TARGET: '1000',
    VITE_DISCUSSION_MONITOR_POLL_MS: '15000',
  }, 'discussion-monitor', 15000);

  assertEqual(pollMs, 30000, '1000-user scale target should raise monitor polling to the safe floor');
}

testMonitorPollDoesNotInheritSessionPoll();
testPurposeSpecificPollEnvWins();
testRefetchIntervalAddsStableJitter();
testScaleTargetRaisesDiscussionSessionFloor();
testScaleTargetRaisesMonitorFloor();
console.log('runtimeLoadMode tests passed');

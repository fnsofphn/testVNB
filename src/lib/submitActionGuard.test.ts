import { createSubmitActionGuard } from './submitActionGuard';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

async function flushMicrotasks() {
  await Promise.resolve();
}

const guard = createSubmitActionGuard();
let releaseFirst!: () => void;
let calls = 0;

const first = guard.run('same-action', async () => {
  calls += 1;
  await new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  return 'saved';
});

const duplicate = guard.run('same-action', async () => {
  calls += 1;
  return 'duplicate';
});

await flushMicrotasks();
assertEqual(calls, 1, 'duplicate submit with same key is blocked while pending');
assertEqual(await duplicate, null, 'blocked duplicate returns null');
releaseFirst();
assertEqual(await first, 'saved', 'first submit returns action result');

const second = await guard.run('same-action', async () => {
  calls += 1;
  return 'saved-again';
});
assertEqual(second, 'saved-again', 'same key can run again after previous submit finishes');

let parallelCalls = 0;
let releaseParallel!: () => void;
const parallelA = guard.run('parallel-a', async () => {
  parallelCalls += 1;
  await new Promise<void>((resolve) => {
    releaseParallel = resolve;
  });
});
const parallelB = guard.run('parallel-b', async () => {
  parallelCalls += 1;
});
await flushMicrotasks();
assertEqual(parallelCalls, 2, 'different submit keys can run in parallel');
releaseParallel();
await parallelA;
await parallelB;

let failed = false;
try {
  await guard.run('failing-action', async () => {
    throw new Error('expected failure');
  });
} catch {
  failed = true;
}
assertEqual(failed, true, 'guard preserves action errors');

const afterFailure = await guard.run('failing-action', async () => 'recovered');
assertEqual(afterFailure, 'recovered', 'failed key is released for retry');

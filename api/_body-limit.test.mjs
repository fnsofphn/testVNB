import { createLimitedBufferReader, parseByteLimit } from './_body-limit.js';

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${expected}, received ${actual}`);
  }
}

async function testParseByteLimitSupportsUnits() {
  assertEqual(parseByteLimit('25mb', 1), 25 * 1024 * 1024, 'MB limit should parse');
  assertEqual(parseByteLimit('10kb', 1), 10 * 1024, 'KB limit should parse');
  assertEqual(parseByteLimit('', 7), 7, 'Empty limit should use fallback');
}

async function testReaderRejectsContentLengthBeforeBuffering() {
  const readBuffer = createLimitedBufferReader({ maxBytes: 10 });
  const req = {
    headers: { 'content-length': '11' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('never-read');
    },
  };

  let rejected = false;
  try {
    await readBuffer(req);
  } catch (error) {
    rejected = String(error.message || error).includes('exceeds');
  }

  assertEqual(rejected, true, 'Oversized Content-Length should be rejected before reading chunks');
}

async function testReaderRejectsOversizedStreamingBody() {
  const readBuffer = createLimitedBufferReader({ maxBytes: 5 });
  const req = {
    headers: {},
    async *[Symbol.asyncIterator]() {
      yield Buffer.from('abc');
      yield Buffer.from('def');
    },
  };

  let rejected = false;
  try {
    await readBuffer(req);
  } catch (error) {
    rejected = String(error.message || error).includes('exceeds');
  }

  assertEqual(rejected, true, 'Streaming bodies should be capped while reading');
}

await testParseByteLimitSupportsUnits();
await testReaderRejectsContentLengthBeforeBuffering();
await testReaderRejectsOversizedStreamingBody();
console.log('body-limit tests passed');

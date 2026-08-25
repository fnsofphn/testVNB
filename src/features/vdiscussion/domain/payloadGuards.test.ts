import { assertDiscussionPayloadWithinLimit, getUtf8ByteLength } from './payloadGuards.ts';

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, received ${String(actual)}`);
  }
}

function testUtf8ByteLengthCountsMultibyteText() {
  assertEqual(getUtf8ByteLength('abc'), 3, 'ASCII byte length should match character count');
  assertEqual(getUtf8ByteLength('á'), 2, 'UTF-8 byte length should count multibyte characters');
}

function testPayloadLimitAllowsNormalContent() {
  assertDiscussionPayloadWithinLimit('short content', 100);
}

function testPayloadLimitRejectsOversizedContent() {
  let rejected = false;
  try {
    assertDiscussionPayloadWithinLimit('123456', 5);
  } catch (error) {
    rejected = String(error instanceof Error ? error.message : error).includes('qua lon');
  }

  assertEqual(rejected, true, 'Oversized discussion payload should be rejected');
}

testUtf8ByteLengthCountsMultibyteText();
testPayloadLimitAllowsNormalContent();
testPayloadLimitRejectsOversizedContent();
console.log('payloadGuards tests passed');

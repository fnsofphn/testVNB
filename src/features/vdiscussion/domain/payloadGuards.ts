const DEFAULT_MAX_DISCUSSION_PAYLOAD_BYTES = 24 * 1024;

export function getUtf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export function assertDiscussionPayloadWithinLimit(content: string, maxBytes = DEFAULT_MAX_DISCUSSION_PAYLOAD_BYTES) {
  const safeMaxBytes = Math.max(1, Math.round(Number(maxBytes) || DEFAULT_MAX_DISCUSSION_PAYLOAD_BYTES));
  const byteLength = getUtf8ByteLength(content);
  if (byteLength > safeMaxBytes) {
    throw new Error(`Noi dung thao luan qua lon (${byteLength}/${safeMaxBytes} bytes). Vui long rut gon truoc khi gui.`);
  }
}

export function parseByteLimit(value, fallbackBytes) {
  const fallback = Number.isFinite(Number(fallbackBytes)) ? Number(fallbackBytes) : 0;
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib)?$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return fallback;
  const unit = match[2] || 'b';
  const multiplier = unit === 'gb' || unit === 'gib'
    ? 1024 * 1024 * 1024
    : unit === 'mb' || unit === 'mib'
      ? 1024 * 1024
      : unit === 'kb' || unit === 'kib'
        ? 1024
        : 1;
  return Math.round(amount * multiplier);
}

function readContentLength(req) {
  const value = Number(req?.headers?.['content-length'] || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function buildLimitError(maxBytes) {
  const error = new Error(`Request body exceeds ${maxBytes} bytes.`);
  error.status = 413;
  return error;
}

export function createLimitedBufferReader({ maxBytes }) {
  const safeMaxBytes = Math.max(1, Number(maxBytes || 1));
  return async function readLimitedRequestBuffer(req) {
    const contentLength = readContentLength(req);
    if (contentLength > safeMaxBytes) throw buildLimitError(safeMaxBytes);

    let totalBytes = 0;
    const chunks = [];
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.length;
      if (totalBytes > safeMaxBytes) {
        if (typeof req.destroy === 'function') req.destroy();
        throw buildLimitError(safeMaxBytes);
      }
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  };
}

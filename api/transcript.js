import { createLimitedBufferReader, parseByteLimit } from './_body-limit.js';

const DEFAULT_WORKER_URL = 'http://127.0.0.1:8787';
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  const workerUrl = String(process.env.VCONTENT_TRANSCRIPT_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, '');
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('multipart/form-data')) {
    sendJson(res, 400, { ok: false, error: 'Expected multipart/form-data upload.' });
    return;
  }

  try {
    const readBody = createLimitedBufferReader({
      maxBytes: parseByteLimit(process.env.VCONTENT_TRANSCRIPT_PROXY_MAX_BYTES, DEFAULT_MAX_BYTES),
    });
    const body = await readBody(req);
    const response = await fetch(`${workerUrl}/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
      },
      body,
    });
    const text = await response.text();
    res.statusCode = response.status;
    res.setHeader('Content-Type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    res.end(text);
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

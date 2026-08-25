import { enforceRateLimit } from './_rate-limit.js';

function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

function getQueryParam(req, key) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  return String(url.searchParams.get(key) || '').trim();
}

async function readBlobText(blob) {
  if (typeof blob.text === 'function') return blob.text();
  const buffer = Buffer.from(await blob.arrayBuffer());
  return buffer.toString('utf8');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'storage-download', windowMs: 60_000, max: 60 })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(res, 500, { ok: false, error: 'Server download is not configured.' });
    return;
  }

  try {
    const bucket = getQueryParam(req, 'bucket');
    const manifestPath = getQueryParam(req, 'path');
    const requestedName = getQueryParam(req, 'filename');
    if (!bucket || !manifestPath) {
      sendJson(res, 400, { ok: false, error: 'Missing download payload.' });
      return;
    }

    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const manifestResult = await admin.storage.from(bucket).download(manifestPath);
    if (manifestResult.error) throw manifestResult.error;

    const manifest = JSON.parse(await readBlobText(manifestResult.data));
    if (manifest?.kind !== 'vcontent-chunked-file' || !Array.isArray(manifest.chunks)) {
      throw new Error('Invalid chunked file manifest.');
    }

    const fileName = requestedName || String(manifest.fileName || 'download.bin');
    const contentType = String(manifest.contentType || 'application/octet-stream');
    const safeFileName = fileName.replace(/["\r\n]/g, '_');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
    if (Number.isFinite(Number(manifest.size))) {
      res.setHeader('Content-Length', String(Number(manifest.size)));
    }

    const chunks = [...manifest.chunks].sort((left, right) => Number(left.index) - Number(right.index));
    for (const chunk of chunks) {
      const chunkPath = String(chunk.path || '');
      if (!chunkPath) throw new Error('Invalid chunk path.');
      const chunkResult = await admin.storage.from(bucket).download(chunkPath);
      if (chunkResult.error) throw chunkResult.error;
      const buffer = Buffer.from(await chunkResult.data.arrayBuffer());
      res.write(buffer);
    }
    res.end();
  } catch (error) {
    if (!res.headersSent) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: String(error.message || error),
      });
      return;
    }
    res.end();
  }
}

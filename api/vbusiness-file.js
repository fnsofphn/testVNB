import { randomUUID } from 'node:crypto';
import { createLimitedBufferReader, parseByteLimit } from './_body-limit.js';
import { enforceRateLimit, RATE_LIMITS } from './_rate-limit.js';

const DEFAULT_BUCKET = 'vbusiness-files';
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

function getQueryParam(req, key) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);
  return String(url.searchParams.get(key) || '').trim();
}

function parseMultipart(req, buffer) {
  const contentType = String(req.headers['content-type'] || '');
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error('Missing multipart boundary.');
  const boundary = `--${match[1] || match[2]}`;
  const parts = buffer.toString('binary').split(boundary).slice(1, -1);
  const fields = {};
  const files = {};

  for (const rawPart of parts) {
    const normalized = rawPart.replace(/^\r\n/, '').replace(/\r\n$/, '');
    const separator = normalized.indexOf('\r\n\r\n');
    if (separator === -1) continue;
    const rawHeaders = normalized.slice(0, separator);
    const bodyBinary = normalized.slice(separator + 4);
    const name = rawHeaders.match(/name="([^"]+)"/i)?.[1];
    if (!name) continue;
    const filename = rawHeaders.match(/filename="([^"]*)"/i)?.[1];
    const type = rawHeaders.match(/content-type:\s*([^\r\n]+)/i)?.[1] || 'application/octet-stream';
    const data = Buffer.from(bodyBinary, 'binary');
    if (filename) {
      files[name] = { filename, type, data };
    } else {
      fields[name] = data.toString('utf8');
    }
  }

  return { fields, files };
}

function safeFileName(value) {
  return String(value || 'file.bin').replace(/[\\/:*?"<>|\r\n]+/g, '_').slice(0, 160) || 'file.bin';
}

function buildAdminClient(supabaseUrl, serviceRoleKey) {
  return import('@supabase/supabase-js').then(({ createClient }) => createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }));
}

export default async function handler(req, res) {
  if (!await enforceRateLimit(req, res, { ...RATE_LIMITS.upload, route: 'vbusiness-file' })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucket = process.env.SUPABASE_VBUSINESS_BUCKET || DEFAULT_BUCKET;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ ok: false, error: 'Supabase server config is missing.' });
    return;
  }

  try {
    const admin = await buildAdminClient(supabaseUrl, serviceRoleKey);

    if (req.method === 'POST') {
      const readRequestBuffer = createLimitedBufferReader({
        maxBytes: parseByteLimit(process.env.VCONTENT_VBUSINESS_FILE_MAX_BYTES, DEFAULT_MAX_UPLOAD_BYTES),
      });
      const parsed = parseMultipart(req, await readRequestBuffer(req));
      const upload = parsed.files.file;
      if (!upload?.data?.length) {
        res.status(400).json({ ok: false, error: 'Missing file.' });
        return;
      }

      const tenderId = safeFileName(parsed.fields.tender_id || 'general');
      const section = safeFileName(parsed.fields.section || 'docs');
      const fileName = safeFileName(upload.filename);
      const objectPath = `tenders/${tenderId}/${section}/${Date.now()}-${randomUUID()}-${fileName}`;
      const result = await admin.storage.from(bucket).upload(objectPath, upload.data, {
        contentType: upload.type,
        upsert: false,
      });
      if (result.error) throw result.error;

      res.status(200).json({
        ok: true,
        bucket,
        path: objectPath,
        fileName,
        fileSize: upload.data.length,
        contentType: upload.type,
      });
      return;
    }

    if (req.method === 'GET') {
      const objectPath = getQueryParam(req, 'path');
      const fileName = safeFileName(getQueryParam(req, 'filename') || objectPath.split('/').pop());
      if (!objectPath) {
        res.status(400).json({ ok: false, error: 'Missing file path.' });
        return;
      }

      const result = await admin.storage.from(bucket).createSignedUrl(objectPath, 60, { download: fileName });
      if (result.error) throw result.error;
      res.setHeader('Cache-Control', 'no-store');
      res.writeHead(302, { Location: result.data.signedUrl });
      res.end();
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ ok: false, error: 'Method not allowed.' });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, error: error.message || 'VBusiness file request failed.' });
  }
}

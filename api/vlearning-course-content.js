import { createHash } from 'node:crypto';
import { enforceRateLimit } from './_rate-limit.js';
import { getObservabilityContext, setObservabilityResponseHeaders } from './_observability.js';
import { readThroughSharedJsonCache } from './_shared-cache.js';
import { verifyVLearningAdmissionTicket } from './_vlearning-ticket.js';
import { recordVLearningRuntimeMetric } from './vlearning/runtime-metrics.js';

function getQueryParam(req, name) {
  const url = new URL(req.url || '', 'http://localhost');
  return url.searchParams.get(name) || '';
}

function setCacheHeaders(res, cacheControl = 'no-store', cdnCacheControl = '') {
  res.setHeader('Cache-Control', cacheControl);
  if (cdnCacheControl) {
    res.setHeader('CDN-Cache-Control', cdnCacheControl);
    res.setHeader('Vercel-CDN-Cache-Control', cdnCacheControl);
  }
}

function sendJson(res, status, payload, cacheControl = 'no-store', cdnCacheControl = '') {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  setCacheHeaders(res, cacheControl, cdnCacheControl);
  res.status(status).json(payload);
}

function cleanCourseId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 160);
}

function getBearerToken(req) {
  const authorization = String(req?.headers?.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function hash(value, length = 24) {
  return createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function logCourseContent(level, fields) {
  const payload = {
    level,
    route: 'vlearning-course-content',
    module: 'vlearning',
    region: process.env.VERCEL_REGION || 'unknown',
    ...fields,
  };
  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warning') console.warn(line);
  else console.log(line);
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const { requestId, correlationId } = getObservabilityContext(req);
  setObservabilityResponseHeaders(res, { requestId, correlationId });
  const log = (level, fields) => logCourseContent(level, {
    requestId,
    correlationId,
    ...fields,
  });
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    sendJson(res, 405, { ok: false, error: 'Method not allowed.' });
    return;
  }
  if (!await enforceRateLimit(req, res, { route: 'vlearning-course-content-preauth', windowMs: 60_000, max: 1200, mode: 'local' })) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    sendJson(res, 500, { ok: false, error: 'Server VLearning content is not configured.' });
    return;
  }

  const courseId = cleanCourseId(getQueryParam(req, 'courseId'));
  if (!courseId) {
    sendJson(res, 400, { ok: false, error: 'Missing courseId.' });
    return;
  }

  try {
    const sessionToken = getBearerToken(req);
    if (!sessionToken) {
      sendJson(res, 401, { ok: false, error: 'Missing session token.' });
      return;
    }
    const admissionTicket = String(req.headers['x-vlearning-admission-ticket'] || '');
    if (!admissionTicket) {
      sendJson(res, 401, { ok: false, error: 'Missing admission ticket.' });
      return;
    }
    const ticketAuthority = verifyVLearningAdmissionTicket(admissionTicket, {
      courseId,
      sessionToken,
    });
    if (!await enforceRateLimit(req, res, {
      route: 'vlearning-course-content-authorized',
      windowMs: 60_000,
      max: 1200,
      verifiedIdentity: ticketAuthority.sub,
    })) return;

    if (req.method === 'HEAD') {
      setCacheHeaders(res, 'private, no-store');
      res.statusCode = 200;
      res.end();
      return;
    }

    let dbMs = 0;
    const cacheStartedAt = Date.now();
    const cached = await readThroughSharedJsonCache(
      `vlearning:published:${courseId}:v${ticketAuthority.contentVersion}`,
      async () => {
        const dbStartedAt = Date.now();
        const { createClient } = await import('@supabase/supabase-js');
        const admin = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        });
        const { data, error } = await admin.rpc(
          'vlearning_get_published_course_content_v2',
          { p_course_id: courseId },
        );
        dbMs = Date.now() - dbStartedAt;
        if (error) throw error;
        if (
          data?.course
          && String(data.contentVersion || '') !== String(ticketAuthority.contentVersion)
        ) {
          const versionError = new Error('Published course content changed after admission.');
          versionError.code = 'CONTENT_VERSION_CHANGED';
          versionError.statusCode = 409;
          throw versionError;
        }
        return data;
      },
    );
    const bundle = cached.value;
    if (!bundle?.course) {
      sendJson(res, 404, { ok: false, error: 'Course not found.' });
      return;
    }
    const links = Array.isArray(bundle.links) ? bundle.links : [];
    const publishedLessons = Array.isArray(bundle.lessons) ? bundle.lessons : [];
    const parts = Array.isArray(bundle.parts) ? bundle.parts : [];
    const lessonBlocks = Array.isArray(bundle.lessonBlocks) ? bundle.lessonBlocks : [];
    const scormPackages = Array.isArray(bundle.scormPackages) ? bundle.scormPackages : [];

    res.setHeader('X-VLearning-Cache', cached.cacheStatus);
    sendJson(
      res,
      200,
      {
        ok: true,
        contentVersion: String(bundle.contentVersion || ''),
        course: bundle.course,
        links,
        lessons: publishedLessons,
        parts,
        lessonBlocks,
        scormPackages,
      },
      'private, no-store',
    );
    log('info', {
      msg: 'done',
      method: req.method,
      module: 'vlearning',
      status: 200,
      scopeHash: hash(`course:${courseId}`),
      requestId,
      lessonCount: publishedLessons.length,
      partCount: parts.length,
      blockCount: lessonBlocks.length,
      scormPackageCount: scormPackages.length,
      contentVersionHash: hash(String(bundle.contentVersion || ticketAuthority.contentVersion)),
      cacheStatus: cached.cacheStatus,
      cacheMs: Date.now() - cacheStartedAt,
      payloadBytes: cached.payloadBytes,
      dbMs,
      totalMs: Date.now() - startedAt,
    });
    recordVLearningRuntimeMetric('vlearning-course-content', {
      scope: hash(`course:${courseId}`),
      status: 'ok',
      totalMs: Date.now() - startedAt,
    });
  } catch (error) {
    const status = error?.name === 'VLearningTicketError'
      ? (error?.code === 'TICKET_SECRET_NOT_CONFIGURED' ? 503 : 401)
      : Number(error?.statusCode || 500);
    log('error', {
      msg: 'failed',
      method: req.method,
      module: 'vlearning',
      scopeHash: hash(`course:${courseId}`),
      requestId,
      code: error?.code || 'COURSE_CONTENT_ERROR',
      status,
      totalMs: Date.now() - startedAt,
    });
    recordVLearningRuntimeMetric('vlearning-course-content', {
      scope: hash(`course:${courseId}`),
      status: 'error',
      error: true,
      totalMs: Date.now() - startedAt,
    });
    sendJson(
      res,
      status,
      {
        ok: false,
        error: status === 401
          ? 'Authentication or admission ticket required.'
          : status === 403
            ? 'Course access denied.'
            : 'Unable to load VLearning course content.',
      },
    );
  }
}

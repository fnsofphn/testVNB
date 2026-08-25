const DEFAULT_AUTHORITY_TIMEOUT_MS = 2500;

export class VLearningAuthorityError extends Error {
  constructor(message, statusCode, code = 'VLEARNING_AUTHORITY_ERROR') {
    super(message);
    this.name = 'VLearningAuthorityError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function getBearerToken(req) {
  const authorization = String(req?.headers?.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
}

function getAuthorityTimeoutMs() {
  const configured = Number(process.env.VLEARNING_AUTHORITY_TIMEOUT_MS || DEFAULT_AUTHORITY_TIMEOUT_MS);
  return Math.max(500, Math.min(10_000, Number.isFinite(configured) ? configured : DEFAULT_AUTHORITY_TIMEOUT_MS));
}

async function readResponsePayload(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function authorizeVLearningCourse(req, courseId) {
  const normalizedCourseId = String(courseId || '').trim();
  if (!normalizedCourseId) {
    throw new VLearningAuthorityError('Missing course scope.', 400, 'MISSING_COURSE_SCOPE');
  }

  const token = getBearerToken(req);
  if (!token) {
    throw new VLearningAuthorityError('Missing session token.', 401, 'MISSING_SESSION_TOKEN');
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !anonKey) {
    throw new VLearningAuthorityError('VLearning authority is not configured.', 500, 'AUTHORITY_NOT_CONFIGURED');
  }

  let response;
  try {
    response = await fetch(`${supabaseUrl}/rest/v1/rpc/vlearning_authorize_course_access`, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_course_id: normalizedCourseId }),
      signal: AbortSignal.timeout(getAuthorityTimeoutMs()),
    });
  } catch (error) {
    throw new VLearningAuthorityError(
      error instanceof Error ? `Course authority unavailable: ${error.message}` : 'Course authority unavailable.',
      503,
      'AUTHORITY_UNAVAILABLE',
    );
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    if (response.status === 401) {
      throw new VLearningAuthorityError('Invalid or expired session token.', 401, 'INVALID_SESSION_TOKEN');
    }
    if (response.status === 403) {
      throw new VLearningAuthorityError('Course access denied.', 403, 'COURSE_ACCESS_DENIED');
    }
    throw new VLearningAuthorityError('Unable to verify course access.', 503, 'AUTHORITY_RPC_FAILED');
  }

  if (!payload || typeof payload !== 'object') {
    throw new VLearningAuthorityError('Course access denied.', 403, 'COURSE_ACCESS_DENIED');
  }

  const authority = {
    courseId: String(payload.courseId || ''),
    classId: String(payload.classId || ''),
    enrollmentId: String(payload.enrollmentId || ''),
    userId: String(payload.userId || ''),
    profileId: String(payload.profileId || ''),
    contentVersion: String(payload.contentVersion || ''),
  };
  if (
    authority.courseId !== normalizedCourseId
    || !authority.enrollmentId
    || !authority.userId
    || !authority.contentVersion
  ) {
    throw new VLearningAuthorityError('Course access denied.', 403, 'COURSE_ACCESS_DENIED');
  }
  return authority;
}

export function getVLearningAuthorityErrorStatus(error) {
  return error instanceof VLearningAuthorityError
    ? error.statusCode
    : Number(error?.statusCode || 500);
}

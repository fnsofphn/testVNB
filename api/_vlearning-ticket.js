import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const DEFAULT_TICKET_TTL_SECONDS = 60;

export class VLearningTicketError extends Error {
  constructor(message, code = 'INVALID_ADMISSION_TICKET') {
    super(message);
    this.name = 'VLearningTicketError';
    this.code = code;
  }
}

function getTicketSecret() {
  const secret = String(process.env.VLEARNING_ADMISSION_TICKET_SECRET || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new VLearningTicketError(
      'Admission ticket secret must contain at least 32 bytes.',
      'TICKET_SECRET_NOT_CONFIGURED',
    );
  }
  return secret;
}

function encodeJson(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function sign(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function hashSessionToken(sessionToken) {
  const token = String(sessionToken || '').trim();
  return token ? createHash('sha256').update(token).digest('base64url') : '';
}

export function createVLearningAdmissionTicket(
  authority,
  ttlSeconds = DEFAULT_TICKET_TTL_SECONDS,
  sessionToken = '',
) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const boundedTtl = Math.max(15, Math.min(300, Math.floor(Number(ttlSeconds) || DEFAULT_TICKET_TTL_SECONDS)));
  const payload = {
    v: 3,
    sub: String(authority.userId || ''),
    courseId: String(authority.courseId || ''),
    classId: String(authority.classId || ''),
    enrollmentId: String(authority.enrollmentId || ''),
    contentVersion: String(authority.contentVersion || ''),
    sessionHash: hashSessionToken(sessionToken),
    iat: nowSeconds,
    exp: nowSeconds + boundedTtl,
    jti: randomUUID(),
  };
  if (!payload.sub || !payload.courseId || !payload.enrollmentId || !payload.contentVersion || !payload.sessionHash) {
    throw new VLearningTicketError('Admission ticket authority is incomplete.', 'INVALID_TICKET_AUTHORITY');
  }
  const encodedPayload = encodeJson(payload);
  return {
    token: `${encodedPayload}.${sign(encodedPayload, getTicketSecret())}`,
    expiresInSeconds: boundedTtl,
    payload,
  };
}

export function verifyVLearningAdmissionTicket(token, expected = {}) {
  const [encodedPayload, encodedSignature, extra] = String(token || '').split('.');
  if (!encodedPayload || !encodedSignature || extra) {
    throw new VLearningTicketError('Admission ticket is malformed.');
  }

  const expectedSignature = sign(encodedPayload, getTicketSecret());
  const actualBuffer = Buffer.from(encodedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new VLearningTicketError('Admission ticket signature is invalid.');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new VLearningTicketError('Admission ticket payload is invalid.');
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload?.v !== 3 || !payload.exp || payload.exp <= nowSeconds) {
    throw new VLearningTicketError('Admission ticket has expired.', 'ADMISSION_TICKET_EXPIRED');
  }
  if (expected.userId && payload.sub !== expected.userId) {
    throw new VLearningTicketError('Admission ticket subject does not match.');
  }
  if (expected.courseId && payload.courseId !== expected.courseId) {
    throw new VLearningTicketError('Admission ticket course does not match.');
  }
  if (expected.enrollmentId && payload.enrollmentId !== expected.enrollmentId) {
    throw new VLearningTicketError('Admission ticket enrollment does not match.');
  }
  if (expected.sessionToken && payload.sessionHash !== hashSessionToken(expected.sessionToken)) {
    throw new VLearningTicketError('Admission ticket session does not match.');
  }
  return payload;
}

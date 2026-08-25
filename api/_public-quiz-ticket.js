import { createHmac, timingSafeEqual } from 'node:crypto';

export class PublicQuizTicketError extends Error {
  constructor(message, code = 'INVALID_PUBLIC_QUIZ_TICKET') {
    super(message);
    this.name = 'PublicQuizTicketError';
    this.code = code;
  }
}

function getSecret(env = process.env) {
  const secret = String(env.VCONTENT_PUBLIC_QUIZ_TICKET_SECRET || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new PublicQuizTicketError(
      'Public quiz ticket secret must contain at least 32 bytes.',
      'PUBLIC_QUIZ_TICKET_SECRET_NOT_CONFIGURED',
    );
  }
  return secret;
}

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signature(encodedPayload, env) {
  return createHmac('sha256', getSecret(env))
    .update(encodedPayload)
    .digest('base64url');
}

export function createPublicQuizTicket(authority, env = process.env) {
  const sessionId = String(authority?.sessionId || '');
  const formId = String(authority?.formId || '');
  const expiresAtMs = Date.parse(String(authority?.expiresAt || ''));
  if (!sessionId || !formId || !Number.isFinite(expiresAtMs)) {
    throw new PublicQuizTicketError(
      'Public quiz ticket authority is incomplete.',
      'INVALID_PUBLIC_QUIZ_TICKET_AUTHORITY',
    );
  }
  const payload = {
    v: 1,
    sessionId,
    formId,
    exp: Math.floor((expiresAtMs + 30_000) / 1000),
  };
  const encodedPayload = encode(payload);
  return `${encodedPayload}.${signature(encodedPayload, env)}`;
}

export function verifyPublicQuizTicket(token, expected = {}, env = process.env) {
  const [encodedPayload, encodedSignature, extra] = String(token || '').split('.');
  if (!encodedPayload || !encodedSignature || extra) {
    throw new PublicQuizTicketError('Public quiz ticket is malformed.');
  }
  const expectedSignature = signature(encodedPayload, env);
  const actualBuffer = Buffer.from(encodedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new PublicQuizTicketError('Public quiz ticket signature is invalid.');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new PublicQuizTicketError('Public quiz ticket payload is invalid.');
  }
  if (payload?.v !== 1 || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new PublicQuizTicketError(
      'Public quiz ticket has expired.',
      'PUBLIC_QUIZ_TICKET_EXPIRED',
    );
  }
  if (expected.sessionId && payload.sessionId !== expected.sessionId) {
    throw new PublicQuizTicketError('Public quiz ticket session does not match.');
  }
  if (expected.formId && payload.formId !== expected.formId) {
    throw new PublicQuizTicketError('Public quiz ticket form does not match.');
  }
  return payload;
}

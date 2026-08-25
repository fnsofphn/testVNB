import { createHmac, timingSafeEqual } from 'node:crypto';

export class PublicGameTicketError extends Error {
  constructor(message, code = 'INVALID_PUBLIC_GAME_TICKET') {
    super(message);
    this.name = 'PublicGameTicketError';
    this.code = code;
  }
}

function getSecret(env = process.env) {
  const secret = String(env.VCONTENT_PUBLIC_GAME_TICKET_SECRET || '');
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new PublicGameTicketError(
      'Public game ticket secret must contain at least 32 bytes.',
      'PUBLIC_GAME_TICKET_SECRET_NOT_CONFIGURED',
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

export function createPublicGameTicket(authority, env = process.env) {
  const sessionId = String(authority?.sessionId || '');
  const gameId = String(authority?.gameId || '');
  const expiresAtMs = Date.parse(String(authority?.expiresAt || ''));
  if (!sessionId || !gameId || !Number.isFinite(expiresAtMs)) {
    throw new PublicGameTicketError(
      'Public game ticket authority is incomplete.',
      'INVALID_PUBLIC_GAME_TICKET_AUTHORITY',
    );
  }
  const payload = {
    v: 1,
    sessionId,
    gameId,
    classId: authority?.classId || '',
    activityId: authority?.activityId || '',
    exp: Math.floor((expiresAtMs + 30_000) / 1000),
  };
  const encodedPayload = encode(payload);
  return `${encodedPayload}.${signature(encodedPayload, env)}`;
}

export function verifyPublicGameTicket(token, expected = {}, env = process.env) {
  const [encodedPayload, encodedSignature, extra] = String(token || '').split('.');
  if (!encodedPayload || !encodedSignature || extra) {
    throw new PublicGameTicketError('Public game ticket is malformed.');
  }
  const expectedSignature = signature(encodedPayload, env);
  const actualBuffer = Buffer.from(encodedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (
    actualBuffer.length !== expectedBuffer.length
    || !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    throw new PublicGameTicketError('Public game ticket signature is invalid.');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new PublicGameTicketError('Public game ticket payload is invalid.');
  }
  if (payload?.v !== 1 || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new PublicGameTicketError(
      'Public game ticket has expired.',
      'PUBLIC_GAME_TICKET_EXPIRED',
    );
  }
  for (const field of ['sessionId', 'gameId', 'classId', 'activityId']) {
    if (expected[field] != null && String(payload[field] || '') !== String(expected[field] || '')) {
      throw new PublicGameTicketError(`Public game ticket ${field} does not match.`);
    }
  }
  return payload;
}

import { randomUUID } from 'node:crypto';

export function cleanObservabilityId(value, maxLength = 96) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '')
    .slice(0, maxLength);
}

export function getObservabilityContext(req) {
  const requestId = (
    cleanObservabilityId(req?.headers?.['x-vercel-id'])
    || cleanObservabilityId(req?.headers?.['x-request-id'])
    || randomUUID()
  );
  const correlationId = (
    cleanObservabilityId(req?.headers?.['x-vlearning-correlation-id'])
    || requestId
  );
  return { requestId, correlationId };
}

export function setObservabilityResponseHeaders(res, context) {
  res.setHeader('X-Request-Id', context.requestId);
  res.setHeader('X-VLearning-Correlation-Id', context.correlationId);
}

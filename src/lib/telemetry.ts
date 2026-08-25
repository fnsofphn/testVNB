type TelemetryPayload = Record<string, unknown>;

type TelemetryEntry = {
  event: string;
  at: string;
  payload: TelemetryPayload;
};

const TELEMETRY_STORAGE_KEY = 'vcontent.telemetry';
const TELEMETRY_LIMIT = 120;

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    message: String(error),
  };
}

export function recordTelemetry(event: string, payload: TelemetryPayload = {}) {
  const entry: TelemetryEntry = {
    event,
    at: new Date().toISOString(),
    payload,
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const current = window.localStorage.getItem(TELEMETRY_STORAGE_KEY);
      const items = current ? (JSON.parse(current) as TelemetryEntry[]) : [];
      items.push(entry);
      if (items.length > TELEMETRY_LIMIT) {
        items.splice(0, items.length - TELEMETRY_LIMIT);
      }
      window.localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {
    // Never block the user flow because of telemetry writes.
  }

  try {
    console.info('[telemetry]', event, payload);
  } catch {
    // Ignore console failures in restricted environments.
  }
}

export async function measureTelemetry<T>(event: string, payload: TelemetryPayload, run: () => Promise<T>): Promise<T> {
  const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  recordTelemetry(`${event}.started`, payload);

  try {
    const result = await run();
    const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordTelemetry(`${event}.succeeded`, {
      ...payload,
      duration_ms: Math.round(finishedAt - startedAt),
    });
    return result;
  } catch (error) {
    const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordTelemetry(`${event}.failed`, {
      ...payload,
      duration_ms: Math.round(finishedAt - startedAt),
      error: normalizeError(error),
    });
    throw error;
  }
}

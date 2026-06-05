// app/server/logger.ts
// Structured logging utilities for [METRIC] and [ERROR] output.

export function logMetric(action: string, context: Record<string, unknown> = {}) {
  const parts = Object.entries(context)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`[METRIC] ${action}${parts ? " - " + parts : ""}`);
}

export function logError(location: string, error: unknown) {
  console.error(`[ERROR] ${location}:`, error);
}

// Wraps an async function so that any non-Response error (i.e. unexpected
// exceptions, not intentional HTTP errors) is logged before being rethrown.
export function withErrorLogging<T>(
  location: string,
  fn: () => Promise<T>
): Promise<T> {
  return fn().catch((err: unknown) => {
    if (!(err instanceof Response)) {
      logError(location, err);
    }
    throw err;
  });
}

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


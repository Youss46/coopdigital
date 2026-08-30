import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

export const RH_STORAGE_FAILURE_ALERT_THRESHOLD_DEFAULT = 3;
export const RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS_DEFAULT = 300;

interface RhStorageFailureState {
  failures: number[];
  alertSent: boolean;
}

export interface RhStorageFailureReport {
  count: number;
  threshold: number;
  windowSeconds: number;
  shouldAlert: boolean;
}

const rhStorageFailures = new Map<number, RhStorageFailureState>();

function positiveIntegerFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function rhStorageFailureThreshold(): number {
  return positiveIntegerFromEnv(
    "RH_STORAGE_FAILURE_ALERT_THRESHOLD",
    RH_STORAGE_FAILURE_ALERT_THRESHOLD_DEFAULT,
  );
}

function rhStorageFailureWindowSeconds(): number {
  return positiveIntegerFromEnv(
    "RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS",
    RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS_DEFAULT,
  );
}

/**
 * Counts storage read failures per cooperative in a rolling window.
 *
 * The returned alert is only true when the threshold is crossed for the
 * current window, preventing one failing storage from flooding operations
 * logs while still making the first sustained outage visible.
 */
export function recordRhStorageReadFailure(
  cooperativeId: number,
  now = Date.now(),
): RhStorageFailureReport {
  const threshold = rhStorageFailureThreshold();
  const windowSeconds = rhStorageFailureWindowSeconds();
  const windowMs = windowSeconds * 1000;
  const state = rhStorageFailures.get(cooperativeId) ?? { failures: [], alertSent: false };
  const recentFailures = state.failures.filter((timestamp) => now - timestamp <= windowMs);

  if (recentFailures.length === 0) {
    state.alertSent = false;
  }
  recentFailures.push(now);
  state.failures = recentFailures;
  const shouldAlert = recentFailures.length >= threshold && !state.alertSent;
  if (shouldAlert) {
    state.alertSent = true;
  }
  rhStorageFailures.set(cooperativeId, state);

  return {
    count: recentFailures.length,
    threshold,
    windowSeconds,
    shouldAlert,
  };
}

/** Resets in-memory counters, primarily for isolated tests and graceful shutdowns. */
export function resetRhStorageReadFailureCounters(): void {
  rhStorageFailures.clear();
}

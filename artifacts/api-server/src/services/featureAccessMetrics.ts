import {
  OPERATIONS_ALERT_CHANNEL,
  operationsAlertLogger,
} from "../lib/logger.js";

export const FEATURE_ACCESS_DENIAL_WINDOW_MS = 5 * 60 * 1000;
export const FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD = 20;

export interface FeatureAccessDenialContext {
  cooperativeId: number;
  featureKey: string;
  mode: "lecture_seule" | "disabled";
  method: string;
}

interface FeatureAccessDenialLogger {
  warn(bindings: Record<string, unknown>, message: string): void;
}

interface DenialCounter {
  windowStartedAt: number;
  count: number;
}

const denialCounters = new Map<string, DenialCounter>();

function counterKey(context: FeatureAccessDenialContext): string {
  return `${context.cooperativeId}:${context.featureKey}:${context.mode}`;
}

function removeExpiredCounters(now: number): void {
  for (const [key, counter] of denialCounters) {
    if (now - counter.windowStartedAt >= FEATURE_ACCESS_DENIAL_WINDOW_MS) {
      denialCounters.delete(key);
    }
  }
}

/**
 * Records a structured denial event suitable for log aggregation.
 * Deliberately logs no URL, user identity, query, body, token, or business data.
 */
export function recordFeatureAccessDenied(
  context: FeatureAccessDenialContext,
  logger: FeatureAccessDenialLogger = operationsAlertLogger,
): number {
  const now = Date.now();
  removeExpiredCounters(now);

  const key = counterKey(context);
  const existing = denialCounters.get(key);
  const counter = existing && now - existing.windowStartedAt < FEATURE_ACCESS_DENIAL_WINDOW_MS
    ? existing
    : { windowStartedAt: now, count: 0 };
  counter.count += 1;
  denialCounters.set(key, counter);

  const safeFields = {
    event: "feature_access_denied",
    cooperativeId: context.cooperativeId,
    featureKey: context.featureKey,
    mode: context.mode,
    method: context.method.toUpperCase(),
    denialCount: counter.count,
    windowSeconds: FEATURE_ACCESS_DENIAL_WINDOW_MS / 1000,
  };
  logger.warn(safeFields, "Accès à une fonctionnalité refusé");

  if (counter.count === FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD) {
    logger.warn({
      channel: OPERATIONS_ALERT_CHANNEL,
      event: "feature_access_denied_spike",
      cooperativeId: context.cooperativeId,
      featureKey: context.featureKey,
      mode: context.mode,
      denialCount: counter.count,
      windowSeconds: FEATURE_ACCESS_DENIAL_WINDOW_MS / 1000,
      threshold: FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD,
    }, "Volume anormal de refus d'accès à une fonctionnalité");
  }

  return counter.count;
}

export function resetFeatureAccessDenialMetrics(): void {
  denialCounters.clear();
}
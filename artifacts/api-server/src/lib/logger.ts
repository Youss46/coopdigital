import pino from "pino";
import { eq } from "drizzle-orm";
import { db, rhStorageFailureStatesTable } from "@workspace/db";

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

/**
 * Logger indépendant du contexte HTTP pour les alertes destinées à
 * l'exploitation. Les alertes ne doivent jamais hériter de req.log, qui peut
 * contenir des bindings de requête (notamment l'URL).
 *
 * En production, la sortie JSON est routée par le collecteur de logs. Le
 * champ `channel` constitue le contrat de routage stable du canal.
 */
export const OPERATIONS_ALERT_CHANNEL = "operations-alerts";
export const operationsAlertLogger = logger.child({
  channel: OPERATIONS_ALERT_CHANNEL,
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

function recordRhStorageReadFailureInMemory(
  cooperativeId: number,
  now: number,
  threshold: number,
  windowSeconds: number,
): RhStorageFailureReport {
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

/**
 * Counts storage read failures per cooperative in a rolling window.
 *
 * The state is stored in PostgreSQL and updated while holding the cooperative
 * row lock. This makes the threshold crossing atomic across API instances and
 * keeps a pending alert across restarts.
 */
export async function recordRhStorageReadFailure(
  cooperativeId: number,
  now = Date.now(),
): Promise<RhStorageFailureReport> {
  const threshold = rhStorageFailureThreshold();
  const windowSeconds = rhStorageFailureWindowSeconds();
  const windowMs = windowSeconds * 1000;
  const timestamp = new Date(now);

  try {
    return await db.transaction(async (tx) => {
      await tx.insert(rhStorageFailureStatesTable).values({
        cooperativeId,
        failureCount: 0,
        windowStartedAt: timestamp,
        alertSent: false,
        updatedAt: timestamp,
      }).onConflictDoNothing();

      const [state] = await tx
        .select({
          failureCount: rhStorageFailureStatesTable.failureCount,
          windowStartedAt: rhStorageFailureStatesTable.windowStartedAt,
          alertSent: rhStorageFailureStatesTable.alertSent,
        })
        .from(rhStorageFailureStatesTable)
        .where(eq(rhStorageFailureStatesTable.cooperativeId, cooperativeId))
        .for("update");

      if (!state) {
        throw new Error("État des incidents de stockage RH introuvable après insertion");
      }

      const withinWindow = now - state.windowStartedAt.getTime() <= windowMs;
      const count = withinWindow ? state.failureCount + 1 : 1;
      const alreadyAlerted = withinWindow && state.alertSent;
      const shouldAlert = count >= threshold && !alreadyAlerted;

      await tx.update(rhStorageFailureStatesTable)
        .set({
          failureCount: count,
          windowStartedAt: withinWindow ? state.windowStartedAt : timestamp,
          alertSent: alreadyAlerted || shouldAlert,
          updatedAt: timestamp,
        })
        .where(eq(rhStorageFailureStatesTable.cooperativeId, cooperativeId));

      rhStorageFailures.delete(cooperativeId);
      return { count, threshold, windowSeconds, shouldAlert };
    });
  } catch (error) {
    // Une panne du mécanisme d'alerte ne doit pas masquer la panne de lecture
    // qui doit être renvoyée au client. Le repli local conserve au moins le
    // comportement historique jusqu'au rétablissement de la base.
    logger.error({ err: error, cooperativeId }, "Persistance de l'alerte de stockage RH indisponible");
    return recordRhStorageReadFailureInMemory(cooperativeId, now, threshold, windowSeconds);
  }
}

/** Clears a cooperative state after a successful storage read. */
export async function resetRhStorageReadFailureState(cooperativeId: number): Promise<void> {
  rhStorageFailures.delete(cooperativeId);
  try {
    await db.delete(rhStorageFailureStatesTable)
      .where(eq(rhStorageFailureStatesTable.cooperativeId, cooperativeId));
  } catch (error) {
    logger.error({ err: error, cooperativeId }, "Réinitialisation de l'alerte de stockage RH impossible");
  }
}

/** Clears persistent and in-memory counters, primarily for isolated tests. */
export async function resetRhStorageReadFailureCounters(): Promise<void> {
  rhStorageFailures.clear();
  try {
    await db.delete(rhStorageFailureStatesTable);
  } catch (error) {
    logger.error({ err: error }, "Nettoyage des alertes de stockage RH impossible");
  }
}

/**
 * logger.ts — Logger console minimaliste avec niveaux et horodatage.
 * Conçu pour un usage terrain (peu de support technique sur site).
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_RANK: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = (process.env.LOG_LEVEL ?? "info") as Level;
const currentRank = LEVEL_RANK[currentLevel] ?? 1;

function timestamp() {
  return new Date().toLocaleTimeString("fr-FR", { hour12: false });
}

function makeLogger(level: Level, color: string) {
  return (...args: unknown[]) => {
    if (LEVEL_RANK[level] < currentRank) return;
    const prefix = `[${timestamp()}] ${color}[${level.toUpperCase()}]\x1b[0m`;
    // eslint-disable-next-line no-console
    console.log(prefix, ...args);
  };
}

export const log = {
  debug: makeLogger("debug", "\x1b[90m"),   // gris
  info:  makeLogger("info",  "\x1b[36m"),   // cyan
  warn:  makeLogger("warn",  "\x1b[33m"),   // jaune
  error: makeLogger("error", "\x1b[31m"),   // rouge
};

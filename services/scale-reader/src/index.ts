/**
 * index.ts — Point d'entrée du service de lecture balance Yaohua A12E
 *
 * Usage :
 *   npm run dev          (développement, rechargement auto avec tsx watch)
 *   npm run build && npm start   (production)
 *   npm run pm2:start    (tâche de fond avec pm2)
 *
 * Variables d'environnement (voir .env.example) :
 *   SCALE_PORT   = COM1 | /dev/ttyS0  (port série de la balance)
 *   WS_PORT      = 4001               (WebSocket vers le navigateur)
 *   HTTP_PORT    = 4002               (HTTP fallback)
 *   LOG_LEVEL    = debug | info | warn | error
 */

import { log } from "./logger.js";
import { ScaleSerialReader } from "./serial.js";
import { StabilityFilter } from "./stability.js";
import { ScaleServer } from "./server.js";

// ── Configuration ────────────────────────────────────────────────────────────
const SCALE_PORT = process.env.SCALE_PORT ?? "COM1";
const WS_PORT    = parseInt(process.env.WS_PORT   ?? "4001", 10);
const HTTP_PORT  = parseInt(process.env.HTTP_PORT ?? "4002", 10);

log.info("╔══════════════════════════════════════════════╗");
log.info("║  CoopDigital — Lecteur Balance Yaohua A12E  ║");
log.info("╚══════════════════════════════════════════════╝");
log.info(`Port série : ${SCALE_PORT}  |  WS : ${WS_PORT}  |  HTTP : ${HTTP_PORT}`);

// ── Instanciation ─────────────────────────────────────────────────────────────
const server   = new ScaleServer(WS_PORT, HTTP_PORT);
const filter   = new StabilityFilter();
const reader   = new ScaleSerialReader(SCALE_PORT);
const MAX_READING_GAP_MS = 3_000;
let lastReadingAt = 0;

// ── Câblage événements ────────────────────────────────────────────────────────
reader.on("connected", () => {
  filter.reset();
  lastReadingAt = 0;
  server.publish({
    weightKg: null,
    isStable: false,
    isConnected: true,
    error: null,
  });
  log.info("[main] Balance connectée — en attente de lectures…");
});

reader.on("disconnected", (reason: string) => {
  filter.reset();
  lastReadingAt = 0;
  server.publish({
    weightKg: null,
    isConnected: false,
    isStable: false,
    error: `Balance non connectée : ${reason}`,
  });
  log.warn(`[main] Balance déconnectée : ${reason}`);
});

reader.on("reading", (weightKg: number, rawLine: string) => {
  lastReadingAt = Date.now();
  const { isStable, weightKg: stableWeight } = filter.push(weightKg);

  server.publish({
    weightKg: stableWeight,
    isStable,
    error: null,
  });

  if (isStable) {
    log.info(`[main] ✅ Poids STABLE : ${stableWeight} kg`);
  } else {
    log.debug(`[main] Poids en cours : ${weightKg} kg (stabilisation…)  [trame: ${rawLine}]`);
  }
});

// Une liaison série peut rester ouverte alors que les trames ont cessé.
// N'affichons jamais indéfiniment le dernier poids reçu dans ce cas.
const staleReadingTimer = setInterval(() => {
  if (!lastReadingAt || Date.now() - lastReadingAt <= MAX_READING_GAP_MS) return;

  lastReadingAt = 0;
  filter.reset();
  server.publish({
    weightKg: null,
    isStable: false,
    isConnected: true,
    error: "Aucune lecture récente de la balance.",
  });
  log.warn("[main] Aucune trame balance reçue depuis 3 s — poids effacé.");
}, 1_000);

// ── Démarrage ─────────────────────────────────────────────────────────────────
reader.start();

// Diffuser l'état "déconnecté" immédiatement (le reader va tenter de connecter)
server.publish({ isConnected: false, error: "Connexion au port série en cours…" });

// ── Arrêt propre ──────────────────────────────────────────────────────────────
process.on("SIGINT",  () => { log.info("Arrêt (SIGINT)…");  clearInterval(staleReadingTimer); reader.stop(); process.exit(0); });
process.on("SIGTERM", () => { log.info("Arrêt (SIGTERM)…"); clearInterval(staleReadingTimer); reader.stop(); process.exit(0); });

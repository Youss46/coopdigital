import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { checkEcheancesEnRetard } from "./services/empruntService";
import { runNotificationsCron } from "./jobs/notificationsCron";
import { runMigrations } from "@workspace/db";
import path from "path";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Migrations DB (idempotentes) ─────────────────────────────────────────────
// Le chemin est résolu depuis le répertoire de travail du serveur
// (artifacts/api-server/) vers lib/db/drizzle/
const migrationsFolder = path.resolve(process.cwd(), "../../lib/db/drizzle");

runMigrations(migrationsFolder)
  .then(() => logger.info("Migrations DB appliquées"))
  .catch((err) => logger.error({ err }, "Erreur migrations DB — démarrage quand même"));

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});


// CRON : vérification quotidienne des échéances en retard (chaque jour à 06h00)
// CRON budget : sync réalisé toutes les nuits à 02h00
import { syncTousLesBudgets } from "./services/budgetService";
import { initLicenceCrons } from "./services/licenceService";

initLicenceCrons();

cron.schedule("0 2 * * *", () => {
  syncTousLesBudgets().catch((err) => logger.error({ err }, "Erreur cron syncBudget"));
});

cron.schedule("0 6 * * *", () => {
  checkEcheancesEnRetard().catch((err) => {
    logger.error({ err }, "Erreur cron checkEcheancesEnRetard");
  });
});

// CRON notifications : vérifications quotidiennes à 8h00
cron.schedule("0 8 * * *", () => {
  runNotificationsCron().catch((err) => {
    logger.error({ err }, "Erreur cron notifications");
  });
});

// CRON fiscalité : vérification des échéances fiscales à 8h05
cron.schedule("5 8 * * *", () => {
  Promise.all([
    import("./services/fiscaliteService.js"),
    import("@workspace/db").then(async ({ db, cooperativesTable }) => {
      const { sql: drizzleSql } = await import("drizzle-orm");
      return db.execute<{ id: number }>(drizzleSql`SELECT id FROM cooperatives`).then(r => r.rows);
    }),
  ]).then(([{ checkEcheancesFiscales }, coops]) => {
    return Promise.allSettled(coops.map(c => checkEcheancesFiscales(c.id)));
  }).then(results => {
    results.forEach(r => { if (r.status === "rejected") logger.error({ err: r.reason }, "Erreur cron checkEcheancesFiscales"); });
  }).catch((err: unknown) => logger.error({ err }, "Erreur cron fiscaliteService"));
});

// CRON support : alertes tickets haute priorité non pris en charge après 30 min (toutes les 5 min)
cron.schedule("*/5 * * * *", () => {
  import("./services/supportService.js").then(({ envoyerAlertesHautePriorite }) => {
    envoyerAlertesHautePriorite().catch((err: unknown) => {
      logger.error({ err }, "Erreur cron alertes support haute priorité");
    });
  }).catch((err: unknown) => logger.error({ err }, "Import supportService"));
});

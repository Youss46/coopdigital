import path from "path";
import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "@workspace/db/migrate";
import cron from "node-cron";
import { checkEcheancesEnRetard } from "./services/empruntService";
import { runNotificationsCron } from "./jobs/notificationsCron";

// ─── Migrations automatiques (production uniquement) ─────────────────────────
// En développement, le schéma est synchronisé via `drizzle-kit push`.
// En production (Railway), les migrations SQL sont appliquées au démarrage :
// toutes les tables manquantes sont créées, sans jamais supprimer de données.
if (process.env.NODE_ENV === "production") {
  try {
    const migrationsFolder = path.join(__dirname, "migrations");
    await runMigrations(migrationsFolder);
    logger.info("Migrations appliquées avec succès");
  } catch (err) {
    logger.error({ err }, "Erreur critique lors des migrations — démarrage annulé");
    process.exit(1);
  }
}

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
  import("./services/fiscaliteService.js").then(({ checkEcheancesFiscales }) => {
    checkEcheancesFiscales().catch((err: unknown) => {
      logger.error({ err }, "Erreur cron checkEcheancesFiscales");
    });
  }).catch((err: unknown) => logger.error({ err }, "Import fiscaliteService"));
});

// CRON support : alertes tickets haute priorité non pris en charge après 30 min (toutes les 5 min)
cron.schedule("*/5 * * * *", () => {
  import("./services/supportService.js").then(({ envoyerAlertesHautePriorite }) => {
    envoyerAlertesHautePriorite().catch((err: unknown) => {
      logger.error({ err }, "Erreur cron alertes support haute priorité");
    });
  }).catch((err: unknown) => logger.error({ err }, "Import supportService"));
});

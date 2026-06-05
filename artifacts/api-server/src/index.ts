import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { checkEcheancesEnRetard } from "./services/empruntService";
import { runNotificationsCron } from "./jobs/notificationsCron";

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

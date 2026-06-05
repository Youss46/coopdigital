import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { checkEcheancesEnRetard } from "./services/empruntService";

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
cron.schedule("0 6 * * *", () => {
  checkEcheancesEnRetard().catch((err) => {
    logger.error({ err }, "Erreur cron checkEcheancesEnRetard");
  });
});

import { db, avancesTable } from "@workspace/db";
import { eq, and, lt, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { notifierParRole } from "../services/notificationService";

const COOP_ID = 1;

// ─── Avances en retard ────────────────────────────────────────────────────────

async function checkAvancesEnRetard(): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0]!;

    const avancesRetard = await db
      .select({ id: avancesTable.id, montant: avancesTable.soldeRestantFcfa })
      .from(avancesTable)
      .where(
        and(
          eq(avancesTable.statut, "en_cours"),
          lt(avancesTable.dateEcheance, today),
        ),
      );

    if (avancesRetard.length === 0) return;

    const total = avancesRetard.reduce((s, a) => s + a.montant, 0);

    await notifierParRole(COOP_ID, ["pca", "directeur", "comptable"], {
      type:         "avance_retard",
      gravite:      "attention",
      titre:        `${avancesRetard.length} avance${avancesRetard.length > 1 ? "s" : ""} en retard`,
      message:      `${avancesRetard.length} avance${avancesRetard.length > 1 ? "s sont" : " est"} en retard de remboursement — solde total : ${total.toLocaleString("fr-FR")} FCFA`,
      lien:         "/avances",
      lienLibelle:  "Voir les avances",
      sourceModule: "avances",
    });

    // Mettre à jour le statut en retard
    await db
      .update(avancesTable)
      .set({ statut: "en_retard" })
      .where(
        and(
          eq(avancesTable.statut, "en_cours"),
          lt(avancesTable.dateEcheance, today),
        ),
      );

    logger.info({ nb: avancesRetard.length }, "Notifications avances en retard envoyées");
  } catch (err) {
    logger.error({ err }, "Erreur checkAvancesEnRetard (notif)");
  }
}

// ─── Écritures comptables en attente ─────────────────────────────────────────

async function checkEcrituresEnAttente(): Promise<void> {
  try {
    const result = await db.execute<{ nb: string }>(
      sql`SELECT COUNT(*)::int AS nb FROM ecritures_comptables WHERE statut = 'brouillon'`,
    );
    const nb = parseInt(String(result.rows[0]?.nb ?? "0"));
    if (nb === 0) return;

    await notifierParRole(COOP_ID, ["pca", "directeur", "comptable"], {
      type:         "ecriture_attente",
      gravite:      "info",
      titre:        `${nb} écriture${nb > 1 ? "s" : ""} en attente de validation`,
      message:      `${nb} écriture${nb > 1 ? "s comptables sont" : " comptable est"} en attente de validation`,
      lien:         "/comptabilite",
      lienLibelle:  "Voir la comptabilité",
      sourceModule: "comptabilite",
    });
  } catch (err) {
    logger.error({ err }, "Erreur checkEcrituresEnAttente (notif)");
  }
}

// ─── Emprunts dont l'échéance approche dans 7 jours ──────────────────────────

async function checkEcheancesEmprunt(): Promise<void> {
  try {
    const dans7j = new Date();
    dans7j.setDate(dans7j.getDate() + 7);
    const dateStr = dans7j.toISOString().split("T")[0]!;
    const today   = new Date().toISOString().split("T")[0]!;

    const result = await db.execute<{ nb: string }>(
      sql`SELECT COUNT(*)::int AS nb
          FROM echeances_emprunts
          WHERE statut = 'en_attente'
            AND date_echeance BETWEEN ${today} AND ${dateStr}`,
    );
    const nb = parseInt(String(result.rows[0]?.nb ?? "0"));
    if (nb === 0) return;

    await notifierParRole(COOP_ID, ["pca", "directeur", "comptable"], {
      type:         "echeance_emprunt",
      gravite:      "attention",
      titre:        `${nb} échéance${nb > 1 ? "s" : ""} d'emprunt dans 7 jours`,
      message:      `${nb} échéance${nb > 1 ? "s" : ""} d'emprunt arrive${nb > 1 ? "nt" : ""} dans moins de 7 jours`,
      lien:         "/emprunts",
      lienLibelle:  "Voir les emprunts",
      sourceModule: "emprunts",
    });
  } catch (err) {
    logger.error({ err }, "Erreur checkEcheancesEmprunt (notif)");
  }
}

// ─── Budget dépassé > 10% ─────────────────────────────────────────────────────

async function checkBudgetDepasse(): Promise<void> {
  try {
    const result = await db.execute<{ nb: string }>(
      sql`SELECT COUNT(*)::int AS nb
          FROM lignes_budget
          WHERE montant_prevu > 0
            AND montant_realise > montant_prevu * 1.10`,
    );
    const nb = parseInt(String(result.rows[0]?.nb ?? "0"));
    if (nb === 0) return;

    await notifierParRole(COOP_ID, ["pca", "directeur", "comptable"], {
      type:         "budget_depasse",
      gravite:      "attention",
      titre:        `${nb} ligne${nb > 1 ? "s" : ""} budgétaire${nb > 1 ? "s" : ""} dépassée${nb > 1 ? "s" : ""} de plus de 10 %`,
      message:      `${nb} poste${nb > 1 ? "s" : ""} du budget dépasse${nb > 1 ? "nt" : ""} le montant prévu de plus de 10 %`,
      lien:         "/budget",
      lienLibelle:  "Voir le budget",
      sourceModule: "budget",
    });
  } catch (err) {
    logger.error({ err }, "Erreur checkBudgetDepasse (notif)");
  }
}

// ─── Entrée principale du CRON ────────────────────────────────────────────────

export async function runNotificationsCron(): Promise<void> {
  logger.info("Démarrage du CRON notifications");
  await Promise.allSettled([
    checkAvancesEnRetard(),
    checkEcrituresEnAttente(),
    checkEcheancesEmprunt(),
    checkBudgetDepasse(),
  ]);
  logger.info("CRON notifications terminé");
}

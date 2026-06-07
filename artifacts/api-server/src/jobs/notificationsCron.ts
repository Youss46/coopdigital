import { db, avancesTable, cooperativesTable, membresTable } from "@workspace/db";
import { eq, and, lt, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { notifierParRole } from "../services/notificationService";

// ─── Récupère toutes les coopératives actives ─────────────────────────────────

async function getAllCoopIds(): Promise<number[]> {
  const rows = await db.select({ id: cooperativesTable.id }).from(cooperativesTable);
  return rows.map((r) => r.id);
}

// ─── Avances en retard ────────────────────────────────────────────────────────

async function checkAvancesEnRetard(cooperativeId: number): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0]!;

    const avancesRetard = await db
      .select({ id: avancesTable.id, montant: avancesTable.soldeRestantFcfa })
      .from(avancesTable)
      .innerJoin(membresTable, eq(membresTable.id, avancesTable.membreId))
      .where(
        and(
          eq(avancesTable.statut, "en_cours"),
          lt(avancesTable.dateEcheance, today),
          eq(membresTable.cooperativeId, cooperativeId),
        ),
      );

    if (avancesRetard.length === 0) return;

    const total = avancesRetard.reduce((s, a) => s + a.montant, 0);

    await notifierParRole(cooperativeId, ["pca", "directeur", "comptable"], {
      type:         "avance_retard",
      gravite:      "attention",
      titre:        `${avancesRetard.length} avance${avancesRetard.length > 1 ? "s" : ""} en retard`,
      message:      `${avancesRetard.length} avance${avancesRetard.length > 1 ? "s sont" : " est"} en retard de remboursement — solde total : ${total.toLocaleString("fr-FR")} FCFA`,
      lien:         "/avances",
      lienLibelle:  "Voir les avances",
      sourceModule: "avances",
    });

    // Mettre à jour le statut en retard
    const ids = avancesRetard.map((a) => a.id);
    await db
      .update(avancesTable)
      .set({ statut: "en_retard" })
      .where(
        and(
          eq(avancesTable.statut, "en_cours"),
          lt(avancesTable.dateEcheance, today),
          inArray(avancesTable.id, ids),
        ),
      );

    logger.info({ nb: avancesRetard.length, cooperativeId }, "Notifications avances en retard envoyées");
  } catch (err) {
    logger.error({ err, cooperativeId }, "Erreur checkAvancesEnRetard (notif)");
  }
}

// ─── Écritures comptables en attente ─────────────────────────────────────────

async function checkEcrituresEnAttente(cooperativeId: number): Promise<void> {
  try {
    const result = await db.execute<{ nb: string }>(
      sql`SELECT COUNT(*)::int AS nb FROM ecritures_comptables WHERE statut = 'brouillon' AND cooperative_id = ${cooperativeId}`,
    );
    const nb = parseInt(String(result.rows[0]?.nb ?? "0"));
    if (nb === 0) return;

    await notifierParRole(cooperativeId, ["pca", "directeur", "comptable"], {
      type:         "ecriture_attente",
      gravite:      "info",
      titre:        `${nb} écriture${nb > 1 ? "s" : ""} en attente de validation`,
      message:      `${nb} écriture${nb > 1 ? "s comptables sont" : " comptable est"} en attente de validation`,
      lien:         "/comptabilite",
      lienLibelle:  "Voir la comptabilité",
      sourceModule: "comptabilite",
    });
  } catch (err) {
    logger.error({ err, cooperativeId }, "Erreur checkEcrituresEnAttente (notif)");
  }
}

// ─── Emprunts dont l'échéance approche dans 7 jours ──────────────────────────

async function checkEcheancesEmprunt(cooperativeId: number): Promise<void> {
  try {
    const dans7j = new Date();
    dans7j.setDate(dans7j.getDate() + 7);
    const dateStr = dans7j.toISOString().split("T")[0]!;
    const today   = new Date().toISOString().split("T")[0]!;

    const result = await db.execute<{ nb: string }>(
      sql`SELECT COUNT(*)::int AS nb
          FROM echeances_emprunts
          WHERE statut = 'en_attente'
            AND date_echeance BETWEEN ${today} AND ${dateStr}
            AND cooperative_id = ${cooperativeId}`,
    );
    const nb = parseInt(String(result.rows[0]?.nb ?? "0"));
    if (nb === 0) return;

    await notifierParRole(cooperativeId, ["pca", "directeur", "comptable"], {
      type:         "echeance_emprunt",
      gravite:      "attention",
      titre:        `${nb} échéance${nb > 1 ? "s" : ""} d'emprunt dans 7 jours`,
      message:      `${nb} échéance${nb > 1 ? "s" : ""} d'emprunt arrive${nb > 1 ? "nt" : ""} dans moins de 7 jours`,
      lien:         "/emprunts",
      lienLibelle:  "Voir les emprunts",
      sourceModule: "emprunts",
    });
  } catch (err) {
    logger.error({ err, cooperativeId }, "Erreur checkEcheancesEmprunt (notif)");
  }
}

// ─── Budget dépassé > 10% ─────────────────────────────────────────────────────

async function checkBudgetDepasse(cooperativeId: number): Promise<void> {
  try {
    const result = await db.execute<{ nb: string }>(
      sql`SELECT COUNT(*)::int AS nb
          FROM lignes_budget lb
          JOIN budgets_campagne bc ON bc.id = lb.budget_id
          WHERE lb.montant_prevu > 0
            AND lb.montant_realise > lb.montant_prevu * 1.10
            AND bc.cooperative_id = ${cooperativeId}`,
    );
    const nb = parseInt(String(result.rows[0]?.nb ?? "0"));
    if (nb === 0) return;

    await notifierParRole(cooperativeId, ["pca", "directeur", "comptable"], {
      type:         "budget_depasse",
      gravite:      "attention",
      titre:        `${nb} ligne${nb > 1 ? "s" : ""} budgétaire${nb > 1 ? "s" : ""} dépassée${nb > 1 ? "s" : ""} de plus de 10 %`,
      message:      `${nb} poste${nb > 1 ? "s" : ""} du budget dépasse${nb > 1 ? "nt" : ""} le montant prévu de plus de 10 %`,
      lien:         "/budget",
      lienLibelle:  "Voir le budget",
      sourceModule: "budget",
    });
  } catch (err) {
    logger.error({ err, cooperativeId }, "Erreur checkBudgetDepasse (notif)");
  }
}

// ─── Entrée principale du CRON ────────────────────────────────────────────────

export async function runNotificationsCron(): Promise<void> {
  logger.info("Démarrage du CRON notifications");

  let coopIds: number[];
  try {
    coopIds = await getAllCoopIds();
  } catch (err) {
    logger.error({ err }, "Impossible de récupérer les coopératives — CRON annulé");
    return;
  }

  if (coopIds.length === 0) {
    logger.info("Aucune coopérative trouvée — CRON terminé");
    return;
  }

  await Promise.allSettled(
    coopIds.flatMap((coopId) => [
      checkAvancesEnRetard(coopId),
      checkEcrituresEnAttente(coopId),
      checkEcheancesEmprunt(coopId),
      checkBudgetDepasse(coopId),
    ]),
  );

  logger.info({ nb: coopIds.length }, "CRON notifications terminé");
}

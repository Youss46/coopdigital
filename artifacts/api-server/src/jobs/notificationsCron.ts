import { db, avancesTable, avancesDeleguesTable, cooperativesTable, membresTable, intrantsTable, usersTable } from "@workspace/db";
import { eq, and, lt, lte, between, gt, sql, inArray, isNotNull, isNull, or, ne } from "drizzle-orm";
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

// ─── Péremption des intrants phytosanitaires ──────────────────────────────────
//
// Seuils :
//   • date_peremption < aujourd'hui          → critique  "Intrant(s) périmé(s)"
//   • date_peremption dans 1–7 jours         → critique  "Expiration imminente"
//   • date_peremption dans 8–30 jours        → attention "Expiration dans 30 jours"
//
// Seuls les intrants actifs avec stock > 0 et une date de péremption renseignée
// sont considérés. Une seule notification groupée par seuil et par coopérative.

async function checkPeremptionIntrants(cooperativeId: number): Promise<void> {
  try {
    const today   = new Date().toISOString().split("T")[0]!;
    const in7j    = new Date(); in7j.setDate(in7j.getDate() + 7);
    const in30j   = new Date(); in30j.setDate(in30j.getDate() + 30);
    const d7  = in7j.toISOString().split("T")[0]!;
    const d30 = in30j.toISOString().split("T")[0]!;

    const intrants = await db
      .select({
        id:             intrantsTable.id,
        nom:            intrantsTable.nom,
        datePeremption: intrantsTable.datePeremption,
        stockActuel:    intrantsTable.stockActuel,
      })
      .from(intrantsTable)
      .where(and(
        eq(intrantsTable.cooperativeId, cooperativeId),
        eq(intrantsTable.actif, true),
        isNotNull(intrantsTable.datePeremption),
        gt(intrantsTable.stockActuel, "0"),
        lte(intrantsTable.datePeremption, d30),   // seulement ceux qui expirent dans ≤ 30 j
      ));

    if (intrants.length === 0) return;

    const perimes   = intrants.filter((i) => i.datePeremption! < today);
    const imminents = intrants.filter((i) => i.datePeremption! >= today && i.datePeremption! <= d7);
    const proches   = intrants.filter((i) => i.datePeremption! > d7   && i.datePeremption! <= d30);

    const roles = ["pca", "directeur", "magasinier"] as const;

    if (perimes.length > 0) {
      const noms = perimes.slice(0, 3).map((i) => i.nom).join(", ");
      const suite = perimes.length > 3 ? ` et ${perimes.length - 3} autre(s)` : "";
      await notifierParRole(cooperativeId, [...roles], {
        type:         "peremption_intrant",
        gravite:      "critique",
        titre:        `${perimes.length} intrant${perimes.length > 1 ? "s" : ""} périmé${perimes.length > 1 ? "s" : ""} en stock`,
        message:      `${noms}${suite} ${perimes.length > 1 ? "sont périmés" : "est périmé"} et toujours en stock — retrait urgent recommandé.`,
        lien:         "/intrants",
        lienLibelle:  "Gérer les intrants",
        sourceModule: "intrants",
      });
    }

    if (imminents.length > 0) {
      const noms = imminents.slice(0, 3).map((i) => i.nom).join(", ");
      const suite = imminents.length > 3 ? ` et ${imminents.length - 3} autre(s)` : "";
      await notifierParRole(cooperativeId, [...roles], {
        type:         "peremption_intrant",
        gravite:      "critique",
        titre:        `Expiration imminente — ${imminents.length} intrant${imminents.length > 1 ? "s" : ""} dans ≤ 7 jours`,
        message:      `${noms}${suite} expire${imminents.length > 1 ? "nt" : ""} dans moins de 7 jours. Planifiez la distribution ou le retrait.`,
        lien:         "/intrants",
        lienLibelle:  "Gérer les intrants",
        sourceModule: "intrants",
      });
    }

    if (proches.length > 0) {
      const noms = proches.slice(0, 3).map((i) => i.nom).join(", ");
      const suite = proches.length > 3 ? ` et ${proches.length - 3} autre(s)` : "";
      await notifierParRole(cooperativeId, [...roles], {
        type:         "peremption_intrant",
        gravite:      "attention",
        titre:        `${proches.length} intrant${proches.length > 1 ? "s" : ""} expirent dans les 30 jours`,
        message:      `${noms}${suite} expire${proches.length > 1 ? "nt" : ""} dans moins de 30 jours. Pensez à planifier leur distribution.`,
        lien:         "/intrants",
        lienLibelle:  "Gérer les intrants",
        sourceModule: "intrants",
      });
    }

    logger.info(
      { cooperativeId, perimes: perimes.length, imminents: imminents.length, proches: proches.length },
      "checkPeremptionIntrants terminé",
    );
  } catch (err) {
    logger.error({ err, cooperativeId }, "Erreur checkPeremptionIntrants (notif)");
  }
}

// ─── Avances membres avec plan "reporté" et date dépassée ────────────────────

async function checkAvancesReportees(cooperativeId: number): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0]!;

    const avances = await db
      .select({
        id: avancesTable.id,
        solde: avancesTable.soldeRestantFcfa,
        reportDate: avancesTable.reportDate,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
      })
      .from(avancesTable)
      .innerJoin(membresTable, eq(membresTable.id, avancesTable.membreId))
      .where(
        and(
          eq(membresTable.cooperativeId, cooperativeId),
          eq(avancesTable.planType, "reporte"),
          ne(avancesTable.statut, "rembourse"),
          or(isNull(avancesTable.reportDate), lt(avancesTable.reportDate, today)),
        ),
      );

    if (avances.length === 0) return;

    const total = avances.reduce((s, a) => s + a.solde, 0);
    const sansDate = avances.filter((a) => !a.reportDate).length;
    const depasse  = avances.filter((a) => !!a.reportDate).length;

    let detail = "";
    if (sansDate > 0 && depasse > 0) detail = ` (${sansDate} sans date, ${depasse} date dépassée)`;
    else if (sansDate > 0) detail = ` (sans date de report)`;
    else detail = ` (date de report dépassée)`;

    await notifierParRole(cooperativeId, ["pca", "directeur", "comptable"], {
      type:         "avance_reportee",
      gravite:      "attention",
      titre:        `${avances.length} avance${avances.length > 1 ? "s" : ""} membre${avances.length > 1 ? "s" : ""} reportée${avances.length > 1 ? "s" : ""} sans retenue active`,
      message:      `${avances.length} avance${avances.length > 1 ? "s sont" : " est"} en plan "reporté"${detail} — solde total non recouvré : ${total.toLocaleString("fr-FR")} FCFA. Action requise.`,
      lien:         "/avances",
      lienLibelle:  "Voir les avances",
      sourceModule: "avances",
    });

    logger.info({ nb: avances.length, cooperativeId }, "Notifications avances membres reportées envoyées");
  } catch (err) {
    logger.error({ err, cooperativeId }, "Erreur checkAvancesReportees (notif)");
  }
}

// ─── Avances délégués avec plan "reporté" et date dépassée ───────────────────

async function checkAvancesDeleguesReportees(cooperativeId: number): Promise<void> {
  try {
    const today = new Date().toISOString().split("T")[0]!;

    const avances = await db
      .select({
        id:         avancesDeleguesTable.id,
        solde:      avancesDeleguesTable.soldeRestantFcfa,
        reportDate: avancesDeleguesTable.reportDate,
        delegueNom: usersTable.nom,
      })
      .from(avancesDeleguesTable)
      .innerJoin(usersTable, eq(usersTable.id, avancesDeleguesTable.delegueId))
      .where(
        and(
          eq(avancesDeleguesTable.cooperativeId, cooperativeId),
          eq(avancesDeleguesTable.planType, "reporte"),
          ne(avancesDeleguesTable.statut, "rembourse"),
          or(isNull(avancesDeleguesTable.reportDate), lt(avancesDeleguesTable.reportDate, today)),
        ),
      );

    if (avances.length === 0) return;

    const total = avances.reduce((s, a) => s + a.solde, 0);

    await notifierParRole(cooperativeId, ["pca", "directeur", "comptable"], {
      type:         "avance_reportee",
      gravite:      "attention",
      titre:        `${avances.length} avance${avances.length > 1 ? "s" : ""} délégué${avances.length > 1 ? "s" : ""} reportée${avances.length > 1 ? "s" : ""} sans retenue active`,
      message:      `${avances.length} avance${avances.length > 1 ? "s délégués sont" : " délégué est"} en plan "reporté" avec date dépassée ou indéfinie — solde total : ${total.toLocaleString("fr-FR")} FCFA.`,
      lien:         "/delegues",
      lienLibelle:  "Voir les délégués",
      sourceModule: "avances",
    });

    logger.info({ nb: avances.length, cooperativeId }, "Notifications avances délégués reportées envoyées");
  } catch (err) {
    logger.error({ err, cooperativeId }, "Erreur checkAvancesDeleguesReportees (notif)");
  }
}

// ─── Entrée hebdomadaire : avances reportées ──────────────────────────────────
// Lancé le lundi à 08:00 pour éviter le spam quotidien (une seule alerte par semaine).

export async function runAvancesReporteesCron(): Promise<void> {
  logger.info("Démarrage du CRON avances reportées (hebdomadaire)");

  let coopIds: number[];
  try {
    coopIds = await getAllCoopIds();
  } catch (err) {
    logger.error({ err }, "CRON avances reportées — impossible de récupérer les coopératives");
    return;
  }

  await Promise.allSettled(
    coopIds.flatMap((coopId) => [
      checkAvancesReportees(coopId),
      checkAvancesDeleguesReportees(coopId),
    ]),
  );

  logger.info({ nb: coopIds.length }, "CRON avances reportées terminé");
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
      checkPeremptionIntrants(coopId),
    ]),
  );

  logger.info({ nb: coopIds.length }, "CRON notifications terminé");
}

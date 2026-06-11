import { type Request, type Response, type NextFunction } from "express";
import {
  db,
  campagnesTable, bilansCampagneTable,
  livraisonsTable, membresTable,
  avancesTable,
  ventesExportateursTable, exportateursTable,
  empruntsTable, echeancierEmpruntsTable, preteursTable,
  budgetsCampagneTable, lignesBudgetTable, hypothesesBudgetTable,
  personnelTable, bulletinsPaieTable,
  distributionsIntrantsTable,
  ecrituresComptablesTable,
  caissesTable,
} from "@workspace/db";
import { eq, desc, sql, and, lt, gte, lte, ne, gt, not, or, isNull } from "drizzle-orm";

// ─── Middleware rôle PCA ───────────────────────────────────────────────────────

export function requirePca(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "pca") {
    res.status(403).json({ erreur: "Accès réservé au Président du Conseil d'Administration" });
    return;
  }
  next();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekStartStr(): string {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().slice(0, 10);
}

function nDaysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function nDaysLaterStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function pct(num: number, den: number): number {
  if (!den || den === 0) return 0;
  return Math.round((num / den) * 100);
}

// ─── GET /dashboard/pca/synthese ─────────────────────────────────────────────

export async function getSynthesePca(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
      return;
    }

    const today = todayStr();
    const weekStart = weekStartStr();
    const thirtyDaysAgo = nDaysAgoStr(30);
    const thirtyDaysLater = nDaysLaterStr(30);

    // 1. Campagne active (filtrée par coopérative)
    const [campagne] = await db
      .select()
      .from(campagnesTable)
      .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
      .orderBy(desc(campagnesTable.dateOuverture))
      .limit(1);

    const campagneId = campagne?.id ?? null;

    let campagneActive = null;
    if (campagne) {
      const ouverture = new Date(campagne.dateOuverture);
      const fermeture = campagne.dateFermeture ? new Date(campagne.dateFermeture) : null;
      const maintenant = new Date();
      const joursEcoules = Math.floor((maintenant.getTime() - ouverture.getTime()) / 86_400_000);
      const joursRestants = fermeture
        ? Math.max(0, Math.floor((fermeture.getTime() - maintenant.getTime()) / 86_400_000))
        : null;
      const totalJours = fermeture
        ? Math.floor((fermeture.getTime() - ouverture.getTime()) / 86_400_000)
        : 365;
      campagneActive = {
        id: campagne.id,
        nom: campagne.libelle,
        date_ouverture: campagne.dateOuverture,
        date_fermeture: campagne.dateFermeture ?? null,
        jours_ecoules: Math.max(0, joursEcoules),
        jours_restants: joursRestants,
        avancement_pct: Math.min(100, Math.round((Math.max(0, joursEcoules) / totalJours) * 100)),
      };
    }

    // 2. Production (parallel)
    const [
      [tonnageJourRow],
      [tonnageSemaineRow],
      [tonnageCampagneRow],
      historique30jRows,
      hypotheseRows,
    ] = await Promise.all([
      db.select({ t: sql<number>`coalesce(sum(poids_kg::numeric),0)::float` })
        .from(livraisonsTable)
        .innerJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(livraisonsTable.dateLivraison, today))),

      db.select({ t: sql<number>`coalesce(sum(poids_kg::numeric),0)::float` })
        .from(livraisonsTable)
        .innerJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), gte(livraisonsTable.dateLivraison, weekStart))),

      campagneId
        ? db.select({ t: sql<number>`coalesce(sum(poids_kg::numeric),0)::float` })
            .from(livraisonsTable)
            .innerJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
            .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(livraisonsTable.campagneId, campagneId)))
        : Promise.resolve([{ t: 0 }]),

      db.select({
          date: livraisonsTable.dateLivraison,
          tonnage: sql<number>`coalesce(sum(poids_kg::numeric),0)::float`,
        })
        .from(livraisonsTable)
        .innerJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), gte(livraisonsTable.dateLivraison, thirtyDaysAgo)))
        .groupBy(livraisonsTable.dateLivraison)
        .orderBy(livraisonsTable.dateLivraison),

      campagneId
        ? db.select({ tonnagePrev: hypothesesBudgetTable.tonnagePrevisionnelKg })
            .from(hypothesesBudgetTable)
            .innerJoin(budgetsCampagneTable, eq(hypothesesBudgetTable.budgetId, budgetsCampagneTable.id))
            .where(and(eq(budgetsCampagneTable.campagneId, campagneId), eq(budgetsCampagneTable.cooperativeId, cooperativeId)))
            .limit(1)
        : Promise.resolve([]),
    ]);

    const tonnageCampagne = tonnageCampagneRow?.t ?? 0;
    const objectifCampagne = hypotheseRows[0]?.tonnagePrev ? Number(hypotheseRows[0].tonnagePrev) * 1000 : 0;

    const exerciceCourant = new Date().getFullYear();

    // 3. Financier (parallel)
    const [
      [caRow],
      [bilanRow],
      [creancesRow],
      [avancesRow],
      [empruntsRow],
      [tresorerieRow],
      [fluxRow],
      creancesEnRetardRows,
    ] = await Promise.all([
      campagneId && campagne
        ? db.select({ ca: sql<number>`coalesce(sum(montant_total_fcfa),0)::bigint` })
            .from(ventesExportateursTable)
            .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
            .where(and(
              eq(exportateursTable.cooperativeId, cooperativeId),
              or(
                eq(ventesExportateursTable.campagneId, campagneId),
                and(
                  isNull(ventesExportateursTable.campagneId),
                  gte(ventesExportateursTable.dateVente, `${campagne.anneeDebut}-01-01`),
                  lte(ventesExportateursTable.dateVente, `${campagne.anneeFin}-12-31`),
                ),
              ),
            ))
        : Promise.resolve([{ ca: 0 }]),

      campagneId
        ? db.select().from(bilansCampagneTable)
            .where(eq(bilansCampagneTable.campagneId, campagneId))
            .orderBy(desc(bilansCampagneTable.dateGeneration)).limit(1)
        : Promise.resolve([null]),

      db.select({ total: sql<number>`coalesce(sum(solde_du_fcfa),0)::bigint` })
        .from(ventesExportateursTable)
        .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
        .where(and(eq(exportateursTable.cooperativeId, cooperativeId), ne(ventesExportateursTable.statut, "regle"))),

      db.select({ total: sql<number>`coalesce(sum(solde_restant_fcfa),0)::bigint` })
        .from(avancesTable)
        .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(avancesTable.statut, "en_cours"))),

      db.select({ total: sql<number>`coalesce(sum(solde_restant_fcfa),0)::bigint` })
        .from(empruntsTable)
        .where(and(eq(empruntsTable.cooperativeId, cooperativeId), eq(empruntsTable.statut, "en_cours"))),

      db.select({
          tresorerie: sql<number>`coalesce(sum(solde_actuel_fcfa::numeric),0)::bigint`,
        }).from(caissesTable)
        .where(and(eq(caissesTable.cooperativeId, cooperativeId), eq(caissesTable.actif, true))),

      db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN compte_debit = '521' THEN montant_fcfa ELSE 0 END), 0)::bigint AS "totalEntrees",
          COALESCE(SUM(CASE WHEN compte_credit = '521' THEN montant_fcfa ELSE 0 END), 0)::bigint AS "totalSorties"
        FROM ecritures_comptables
        WHERE cooperative_id = ${cooperativeId} AND exercice = ${exerciceCourant}
      `).then(r => [r.rows[0] as { totalEntrees: number; totalSorties: number } | undefined]),

      db.select({ count: sql<number>`count(*)::int` })
        .from(ventesExportateursTable)
        .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
        .where(and(eq(exportateursTable.cooperativeId, cooperativeId), eq(ventesExportateursTable.statut, "en_retard"))),
    ]);

    const caCampagne = Number(caRow?.ca ?? 0);
    const bilan = bilanRow ?? null;
    const margeNette = bilan ? Number(bilan.margeNetteFcfa ?? 0) : Math.round(caCampagne * 0.09);
    const margeKg = tonnageCampagne > 0 ? Math.round(margeNette / (tonnageCampagne / 1000)) : 0;
    const soldeCaisses = Number(tresorerieRow?.tresorerie ?? 0);
    const fluxNet = Number(fluxRow?.totalEntrees ?? 0) - Number(fluxRow?.totalSorties ?? 0);
    const tresorerieDisponible = soldeCaisses + fluxNet;

    // 4. Budget
    const [budgetRows, lignesDepassementRows] = await Promise.all([
      campagneId
        ? db.select({
              prevu: sql<number>`coalesce(sum(montant_previsionnel_fcfa),0)::bigint`,
              realise: sql<number>`coalesce(sum(montant_realise_fcfa),0)::bigint`,
            })
            .from(lignesBudgetTable)
            .innerJoin(budgetsCampagneTable, eq(lignesBudgetTable.budgetId, budgetsCampagneTable.id))
            .where(and(
              eq(budgetsCampagneTable.cooperativeId, cooperativeId),
              eq(budgetsCampagneTable.campagneId, campagneId),
              eq(budgetsCampagneTable.statut, "valide"),
            ))
        : Promise.resolve([{ prevu: 0, realise: 0 }]),

      campagneId
        ? db.select({
              libelle: lignesBudgetTable.libelle,
              prevu: lignesBudgetTable.montantPrevisionnelFcfa,
              realise: lignesBudgetTable.montantRealiseFcfa,
              ecartPct: lignesBudgetTable.ecartPct,
            })
            .from(lignesBudgetTable)
            .innerJoin(budgetsCampagneTable, eq(lignesBudgetTable.budgetId, budgetsCampagneTable.id))
            .where(and(
              eq(budgetsCampagneTable.cooperativeId, cooperativeId),
              eq(budgetsCampagneTable.campagneId, campagneId),
              gt(lignesBudgetTable.montantRealiseFcfa, lignesBudgetTable.montantPrevisionnelFcfa),
              sql`${lignesBudgetTable.montantPrevisionnelFcfa} > 0`,
            ))
            .orderBy(desc(sql`${lignesBudgetTable.montantRealiseFcfa} - ${lignesBudgetTable.montantPrevisionnelFcfa}`))
            .limit(5)
        : Promise.resolve([]),
    ]);

    const prevuFcfa = Number(budgetRows[0]?.prevu ?? 0);
    const realiseFcfa = Number(budgetRows[0]?.realise ?? 0);
    const ecartFcfa = realiseFcfa - prevuFcfa;

    // 5. Alertes critiques
    const [creancesRetard, empruntsProches, avancesRetard] = await Promise.all([
      db.select({
          id: ventesExportateursTable.id,
          montant: ventesExportateursTable.soldeDuFcfa,
          date: ventesExportateursTable.dateEcheanceReglement,
          exportateurNom: exportateursTable.nom,
        })
        .from(ventesExportateursTable)
        .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
        .where(and(eq(exportateursTable.cooperativeId, cooperativeId), eq(ventesExportateursTable.statut, "en_retard")))
        .orderBy(desc(ventesExportateursTable.soldeDuFcfa))
        .limit(5),

      db.select({
          id: echeancierEmpruntsTable.id,
          empruntId: echeancierEmpruntsTable.empruntId,
          dateEcheance: echeancierEmpruntsTable.dateEcheance,
          total: echeancierEmpruntsTable.totalEcheanceFcfa,
          libelle: empruntsTable.libelle,
          preteurNom: preteursTable.nom,
        })
        .from(echeancierEmpruntsTable)
        .innerJoin(empruntsTable, eq(echeancierEmpruntsTable.empruntId, empruntsTable.id))
        .leftJoin(preteursTable, eq(empruntsTable.preteurId, preteursTable.id))
        .where(and(
          eq(empruntsTable.cooperativeId, cooperativeId),
          eq(echeancierEmpruntsTable.statut, "a_payer"),
          gte(echeancierEmpruntsTable.dateEcheance, today),
          lte(echeancierEmpruntsTable.dateEcheance, thirtyDaysLater),
        ))
        .orderBy(echeancierEmpruntsTable.dateEcheance)
        .limit(5),

      db.select({ count: sql<number>`count(*)::int` })
        .from(avancesTable)
        .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(avancesTable.statut, "en_retard"))),
    ]);

    const alertesCritiques = [
      ...creancesRetard.map(c => {
        const joursRetard = c.date
          ? Math.max(0, Math.floor((new Date().getTime() - new Date(c.date).getTime()) / 86_400_000))
          : null;
        return {
          type: "creance_retard",
          message: `Créance ${c.exportateurNom ?? "exportateur"} — ${Number(c.montant).toLocaleString("fr-FR")} FCFA${joursRetard ? ` — En retard de ${joursRetard} jours` : ""}`,
          date: c.date ?? today,
          montant_fcfa: Number(c.montant),
          lien: "/creances",
        };
      }),
      ...lignesDepassementRows.map(l => {
        const prevuN = Number(l.prevu);
        const realiseN = Number(l.realise);
        const pctDep = prevuN > 0 ? Math.round(((realiseN - prevuN) / prevuN) * 100) : 0;
        return {
          type: "budget_depasse",
          message: `Budget ${l.libelle} dépassé de ${pctDep}% — Prévu : ${prevuN.toLocaleString("fr-FR")} FCFA — Réalisé : ${realiseN.toLocaleString("fr-FR")} FCFA`,
          date: today,
          montant_fcfa: realiseN - prevuN,
          lien: "/budget",
        };
      }),
      ...empruntsProches.map(e => {
        const joursRestants = Math.floor((new Date(e.dateEcheance).getTime() - new Date().getTime()) / 86_400_000);
        return {
          type: "emprunt_echeance",
          message: `Emprunt ${e.preteurNom ?? e.libelle} — Échéance dans ${joursRestants} jour${joursRestants > 1 ? "s" : ""} — ${Number(e.total).toLocaleString("fr-FR")} FCFA`,
          date: e.dateEcheance,
          montant_fcfa: Number(e.total),
          lien: "/emprunts",
        };
      }),
      ...(avancesRetard[0]?.count && avancesRetard[0].count > 0
        ? [{
            type: "avances_retard",
            message: `${avancesRetard[0].count} avance${avancesRetard[0].count > 1 ? "s" : ""} membre${avancesRetard[0].count > 1 ? "s" : ""} en retard de remboursement`,
            date: today,
            montant_fcfa: 0,
            lien: "/avances",
          }]
        : []),
    ];

    // 6. Membres
    const [
      [membresActifsRow],
      [membresNouveauxRow],
      [avancesTotalRow],
      [intrantsTotalRow],
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(membresTable)
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"))),

      campagne
        ? db.select({ count: sql<number>`count(*)::int` })
            .from(membresTable)
            .where(and(eq(membresTable.cooperativeId, cooperativeId), gte(membresTable.dateAdhesion, campagne.dateOuverture)))
        : Promise.resolve([{ count: 0 }]),

      db.select({
          octroyees: sql<number>`coalesce(sum(montant_octroye_fcfa),0)::bigint`,
          remboursees: sql<number>`coalesce(sum(montant_rembourse_fcfa),0)::bigint`,
        })
        .from(avancesTable)
        .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(eq(membresTable.cooperativeId, cooperativeId)),

      db.select({
          distribues: sql<number>`coalesce(sum(montant_fcfa::numeric),0)::bigint`,
          recouvres: sql<number>`coalesce(sum(montant_rembourse_fcfa::numeric),0)::bigint`,
        })
        .from(distributionsIntrantsTable)
        .where(eq(distributionsIntrantsTable.cooperativeId, cooperativeId)),
    ]);

    // 7. Personnel
    const [
      [personnelRow],
      [bulletinsRow],
    ] = await Promise.all([
      db.select({
          count: sql<number>`count(*)::int`,
          masse: sql<number>`coalesce(sum(salaire_base_fcfa + sursalaire_fcfa),0)::bigint`,
        })
        .from(personnelTable)
        .where(and(eq(personnelTable.cooperativeId, cooperativeId), eq(personnelTable.statut, "actif"))),

      db.select({ count: sql<number>`count(*)::int` })
        .from(bulletinsPaieTable)
        .where(and(eq(bulletinsPaieTable.cooperativeId, cooperativeId), eq(bulletinsPaieTable.statut, "brouillon"))),
    ]);

    // 8. CA mensuel (pour graphique)
    const caMensuelRows = campagneId && campagne
      ? await db.select({
            mois: sql<string>`to_char(date_vente, 'YYYY-MM')`,
            ca: sql<number>`coalesce(sum(montant_total_fcfa),0)::bigint`,
          })
          .from(ventesExportateursTable)
          .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
          .where(and(
            eq(exportateursTable.cooperativeId, cooperativeId),
            or(
              eq(ventesExportateursTable.campagneId, campagneId),
              and(
                isNull(ventesExportateursTable.campagneId),
                gte(ventesExportateursTable.dateVente, `${campagne.anneeDebut}-01-01`),
                lte(ventesExportateursTable.dateVente, `${campagne.anneeFin}-12-31`),
              ),
            ),
          ))
          .groupBy(sql`to_char(date_vente, 'YYYY-MM')`)
          .orderBy(sql`to_char(date_vente, 'YYYY-MM')`)
      : [];

    res.json({
      campagne_active: campagneActive,
      production: {
        tonnage_jour: tonnageJourRow?.t ?? 0,
        tonnage_semaine: tonnageSemaineRow?.t ?? 0,
        tonnage_campagne: tonnageCampagne,
        objectif_campagne: objectifCampagne,
        pct_objectif: pct(tonnageCampagne, objectifCampagne),
        historique_30j: historique30jRows.map(r => ({ date: r.date, tonnage: r.tonnage })),
        ca_mensuel: caMensuelRows.map(r => ({ mois: r.mois, ca_fcfa: Number(r.ca) })),
      },
      financier: {
        ca_campagne_fcfa: caCampagne,
        marge_nette_fcfa: margeNette,
        marge_pct: pct(margeNette, caCampagne),
        marge_kg_fcfa: margeKg,
        tresorerie_disponible_fcfa: tresorerieDisponible,
        creances_exportateurs_fcfa: Number(creancesRow?.total ?? 0),
        creances_en_retard: creancesEnRetardRows[0]?.count ?? 0,
        avances_en_cours_fcfa: Number(avancesRow?.total ?? 0),
        emprunts_solde_fcfa: Number(empruntsRow?.total ?? 0),
      },
      budget: {
        prevu_fcfa: prevuFcfa,
        realise_fcfa: realiseFcfa,
        ecart_fcfa: ecartFcfa,
        ecart_pct: pct(ecartFcfa, prevuFcfa),
        lignes_en_depassement: lignesDepassementRows.map(l => ({
          libelle: l.libelle,
          prevu_fcfa: Number(l.prevu),
          realise_fcfa: Number(l.realise),
          ecart_pct: l.ecartPct ? Number(l.ecartPct) : pct(Number(l.realise) - Number(l.prevu), Number(l.prevu)),
        })),
      },
      alertes_critiques: alertesCritiques.slice(0, 8),
      membres: {
        nb_actifs: membresActifsRow?.count ?? 0,
        nb_nouveaux_campagne: membresNouveauxRow?.count ?? 0,
        taux_remboursement_avances_pct: pct(
          Number(avancesTotalRow?.remboursees ?? 0),
          Number(avancesTotalRow?.octroyees ?? 0),
        ),
        taux_remboursement_intrants_pct: pct(
          Number(intrantsTotalRow?.recouvres ?? 0),
          Number(intrantsTotalRow?.distribues ?? 0),
        ),
      },
      personnel: {
        nb_employes: personnelRow?.count ?? 0,
        masse_salariale_mois_fcfa: Number(personnelRow?.masse ?? 0),
        bulletins_en_attente: bulletinsRow?.count ?? 0,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getSynthesePca");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /dashboard/pca/alertes-prioritaires ─────────────────────────────────

export async function getAlertesPrioritairesPca(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
      return;
    }

    const today = todayStr();
    const fourteenDaysLater = nDaysLaterStr(14);

    const [creancesRetard, empruntsProches, avancesRetard, budgetDepassements] = await Promise.all([
      db.select({
          id: ventesExportateursTable.id,
          exportateurNom: exportateursTable.nom,
          montantFcfa: ventesExportateursTable.soldeDuFcfa,
          dateEcheance: ventesExportateursTable.dateEcheanceReglement,
          statut: ventesExportateursTable.statut,
        })
        .from(ventesExportateursTable)
        .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
        .where(and(eq(exportateursTable.cooperativeId, cooperativeId), eq(ventesExportateursTable.statut, "en_retard")))
        .orderBy(desc(ventesExportateursTable.soldeDuFcfa)),

      db.select({
          id: echeancierEmpruntsTable.id,
          dateEcheance: echeancierEmpruntsTable.dateEcheance,
          totalFcfa: echeancierEmpruntsTable.totalEcheanceFcfa,
          empruntLibelle: empruntsTable.libelle,
          preteurNom: preteursTable.nom,
        })
        .from(echeancierEmpruntsTable)
        .innerJoin(empruntsTable, eq(echeancierEmpruntsTable.empruntId, empruntsTable.id))
        .leftJoin(preteursTable, eq(empruntsTable.preteurId, preteursTable.id))
        .where(and(
          eq(empruntsTable.cooperativeId, cooperativeId),
          eq(echeancierEmpruntsTable.statut, "a_payer"),
          gte(echeancierEmpruntsTable.dateEcheance, today),
          lte(echeancierEmpruntsTable.dateEcheance, fourteenDaysLater),
        ))
        .orderBy(echeancierEmpruntsTable.dateEcheance),

      db.select({
          id: avancesTable.id,
          membreId: avancesTable.membreId,
          solde: avancesTable.soldeRestantFcfa,
          dateEcheance: avancesTable.dateEcheance,
        })
        .from(avancesTable)
        .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
        .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(avancesTable.statut, "en_retard")))
        .orderBy(desc(avancesTable.soldeRestantFcfa))
        .limit(10),

      db.select({
          libelle: lignesBudgetTable.libelle,
          categorie: lignesBudgetTable.categorie,
          prevu: lignesBudgetTable.montantPrevisionnelFcfa,
          realise: lignesBudgetTable.montantRealiseFcfa,
          ecartPct: lignesBudgetTable.ecartPct,
        })
        .from(lignesBudgetTable)
        .innerJoin(budgetsCampagneTable, eq(lignesBudgetTable.budgetId, budgetsCampagneTable.id))
        .where(and(
          eq(budgetsCampagneTable.cooperativeId, cooperativeId),
          eq(budgetsCampagneTable.statut, "valide"),
          gt(lignesBudgetTable.montantRealiseFcfa, lignesBudgetTable.montantPrevisionnelFcfa),
          sql`${lignesBudgetTable.montantPrevisionnelFcfa} > 0`,
        ))
        .orderBy(desc(sql`${lignesBudgetTable.montantRealiseFcfa} - ${lignesBudgetTable.montantPrevisionnelFcfa}`))
        .limit(5),
    ]);

    const alertes = [
      ...creancesRetard.map(c => {
        const joursRetard = c.dateEcheance
          ? Math.max(0, Math.floor((new Date().getTime() - new Date(c.dateEcheance).getTime()) / 86_400_000))
          : null;
        return {
          type: "creance_retard",
          gravite: "critique",
          exportateur: c.exportateurNom,
          montant_fcfa: Number(c.montantFcfa),
          date_echeance: c.dateEcheance,
          jours_retard: joursRetard,
          lien: "/creances",
        };
      }),
      ...empruntsProches.map(e => {
        const joursRestants = Math.floor((new Date(e.dateEcheance).getTime() - new Date().getTime()) / 86_400_000);
        return {
          type: "emprunt_echeance",
          gravite: joursRestants <= 7 ? "critique" : "haute",
          preteur: e.preteurNom ?? e.empruntLibelle,
          libelle: e.empruntLibelle,
          montant_fcfa: Number(e.totalFcfa),
          date_echeance: e.dateEcheance,
          jours_restants: joursRestants,
          lien: "/emprunts",
        };
      }),
      ...avancesRetard.map(a => ({
        type: "avance_retard",
        gravite: "haute",
        membre_id: a.membreId,
        montant_fcfa: Number(a.solde),
        date_echeance: a.dateEcheance,
        lien: "/avances",
      })),
      ...budgetDepassements.map(b => ({
        type: "budget_depasse",
        gravite: "haute",
        libelle: b.libelle,
        categorie: b.categorie,
        prevu_fcfa: Number(b.prevu),
        realise_fcfa: Number(b.realise),
        ecart_pct: b.ecartPct ? Number(b.ecartPct) : Math.round(((Number(b.realise) - Number(b.prevu)) / Number(b.prevu)) * 100),
        lien: "/budget",
      })),
    ];

    res.json(alertes);
  } catch (err) {
    req.log.error({ err }, "Erreur getAlertesPrioritairesPca");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /dashboard/pca/comparaison-campagnes ─────────────────────────────────

export async function getComparaisonCampagnesPca(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) {
      res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
      return;
    }

    const campagnes = await db
      .select()
      .from(campagnesTable)
      .where(eq(campagnesTable.cooperativeId, cooperativeId))
      .orderBy(desc(campagnesTable.dateOuverture))
      .limit(3);

    const rows = await Promise.all(
      campagnes.map(async (c) => {
        const [bilan] = await db
          .select()
          .from(bilansCampagneTable)
          .where(eq(bilansCampagneTable.campagneId, c.id))
          .orderBy(desc(bilansCampagneTable.dateGeneration))
          .limit(1);

        if (bilan) {
          const tonnageT = Number(bilan.tonnageTotalKg ?? 0) / 1000;
          const margeNette = Number(bilan.margeNetteFcfa ?? 0);
          const margeKg = tonnageT > 0 ? Math.round(margeNette / tonnageT) : 0;
          const avOctroyees = Number(bilan.avancesOctroYeesFcfa ?? 0);
          const avRemboursees = Number(bilan.avancesRembouRseesFcfa ?? 0);
          return {
            campagne_id: c.id,
            campagne_libelle: c.libelle,
            statut: c.statut,
            tonnage_t: Math.round(tonnageT),
            ca_fcfa: Number(bilan.caVentesFcfa ?? 0),
            marge_nette_fcfa: margeNette,
            marge_kg_fcfa: margeKg,
            nb_membres_actifs: bilan.nbMembresActifs ?? 0,
            taux_remboursement_avances_pct: avOctroyees > 0 ? Math.round((avRemboursees / avOctroyees) * 100) : 0,
            source: "bilan",
          };
        }

        // Fallback: compute from raw data
        const [[livraisonsRow], [avRow], [membresRow], [caRow]] = await Promise.all([
          db.select({ t: sql<number>`coalesce(sum(poids_kg::numeric),0)::float` })
            .from(livraisonsTable)
            .innerJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
            .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(livraisonsTable.campagneId, c.id))),
          db.select({
              octroyees: sql<number>`coalesce(sum(montant_octroye_fcfa),0)::bigint`,
              remboursees: sql<number>`coalesce(sum(montant_rembourse_fcfa),0)::bigint`,
            })
            .from(avancesTable)
            .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
            .where(eq(membresTable.cooperativeId, cooperativeId)),
          db.select({ count: sql<number>`count(*)::int` })
            .from(membresTable)
            .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"))),
          db.select({ ca: sql<number>`coalesce(sum(montant_total_fcfa),0)::bigint` })
            .from(ventesExportateursTable)
            .leftJoin(exportateursTable, eq(ventesExportateursTable.exportateurId, exportateursTable.id))
            .where(and(
              eq(exportateursTable.cooperativeId, cooperativeId),
              or(
                eq(ventesExportateursTable.campagneId, c.id),
                and(
                  isNull(ventesExportateursTable.campagneId),
                  gte(ventesExportateursTable.dateVente, `${c.anneeDebut}-01-01`),
                  lte(ventesExportateursTable.dateVente, `${c.anneeFin}-12-31`),
                ),
              ),
            )),
        ]);

        const tonnageT = (livraisonsRow?.t ?? 0) / 1000;
        const caCampagne = Number(caRow?.ca ?? 0);
        const margeNette = Math.round(caCampagne * 0.09);
        const margeKg = tonnageT > 0 ? Math.round(margeNette / tonnageT) : 0;
        return {
          campagne_id: c.id,
          campagne_libelle: c.libelle,
          statut: c.statut,
          tonnage_t: Math.round(tonnageT),
          ca_fcfa: caCampagne,
          marge_nette_fcfa: margeNette,
          marge_kg_fcfa: margeKg,
          nb_membres_actifs: membresRow?.count ?? 0,
          taux_remboursement_avances_pct: Number(avRow?.octroyees ?? 0) > 0
            ? Math.round((Number(avRow?.remboursees ?? 0) / Number(avRow?.octroyees ?? 0)) * 100)
            : 0,
          source: "computed",
        };
      }),
    );

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getComparaisonCampagnesPca");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

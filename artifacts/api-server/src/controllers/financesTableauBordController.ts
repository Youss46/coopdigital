import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export async function getTableauBordFinancier(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  try {
    // ── 1. Trésorerie : solde total des caisses actives ─────────────────────
    const tresorerieRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(solde_actuel_fcfa::numeric), 0)::bigint        AS "totalCaissesFcfa",
        COUNT(*)::int                                                 AS "nombreCaisses",
        COUNT(CASE WHEN solde_actuel_fcfa::numeric < fond_caisse_minimum_fcfa::numeric
                   AND fond_caisse_minimum_fcfa::numeric > 0
              THEN 1 END)::int                                        AS "nombreCaissesBasses"
      FROM caisses
      WHERE cooperative_id = ${cooperativeId} AND actif = true
    `);
    const tresorerie = (tresorerieRows.rows[0] ?? {}) as {
      totalCaissesFcfa: string; nombreCaisses: number; nombreCaissesBasses: number;
    };

    // ── 2. Créances exportateurs : retards + total non réglé ─────────────────
    const creancesRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN v.statut = 'en_retard' THEN v.solde_du_fcfa ELSE 0 END), 0)::bigint AS "totalEnRetardFcfa",
        COUNT(CASE WHEN v.statut = 'en_retard' THEN 1 END)::int                                    AS "nbEnRetard",
        COALESCE(SUM(CASE WHEN v.statut IN ('en_attente','partiel','en_retard') THEN v.solde_du_fcfa ELSE 0 END), 0)::bigint AS "totalNonRegleFcfa",
        COUNT(CASE WHEN v.statut IN ('en_attente','partiel','en_retard') THEN 1 END)::int           AS "nbNonRegle"
      FROM ventes_exportateurs v
      JOIN exportateurs e ON v.exportateur_id = e.id
      WHERE e.cooperative_id = ${cooperativeId}
    `);
    const creances = (creancesRows.rows[0] ?? {}) as {
      totalEnRetardFcfa: string; nbEnRetard: number; totalNonRegleFcfa: string; nbNonRegle: number;
    };

    // ── 3. Budget vs réel — campagne ouverte ──────────────────────────────────
    const budgetRows = await db.execute(sql`
      SELECT
        c.nom                                                                             AS "campagneNom",
        COALESCE(SUM(lb.montant_previsionnel_fcfa::numeric), 0)::bigint                  AS "totalPrevFcfa",
        COALESCE(SUM(lb.montant_realise_fcfa::numeric), 0)::bigint                       AS "totalReelFcfa",
        COUNT(CASE WHEN lb.montant_realise_fcfa::numeric > lb.montant_previsionnel_fcfa::numeric
                    AND lb.montant_previsionnel_fcfa::numeric > 0 THEN 1 END)::int        AS "nbDepassements"
      FROM budgets_campagne bc
      JOIN campagnes c ON bc.campagne_id = c.id
      LEFT JOIN lignes_budget lb ON lb.budget_id = bc.id
      WHERE bc.cooperative_id = ${cooperativeId}
        AND c.statut = 'ouverte'
      GROUP BY c.nom
      ORDER BY bc.id DESC
      LIMIT 1
    `);
    const budgetRow = (budgetRows.rows[0] ?? null) as {
      campagneNom: string; totalPrevFcfa: string; totalReelFcfa: string; nbDepassements: number;
    } | null;
    const budget = budgetRow ? {
      campagneNom: budgetRow.campagneNom,
      totalPrevFcfa: parseInt(String(budgetRow.totalPrevFcfa), 10) || 0,
      totalReelFcfa: parseInt(String(budgetRow.totalReelFcfa), 10) || 0,
      tauxExecution: (parseInt(String(budgetRow.totalPrevFcfa), 10) || 0) > 0
        ? Math.round(((parseInt(String(budgetRow.totalReelFcfa), 10) || 0) / (parseInt(String(budgetRow.totalPrevFcfa), 10) || 0)) * 100)
        : 0,
      nbDepassements: budgetRow.nbDepassements ?? 0,
    } : null;

    // ── 4. Salaires à payer ce mois ──────────────────────────────────────────
    const now = new Date();
    const mois = now.getMonth() + 1;
    const annee = now.getFullYear();

    const salairesRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(salaire_net_fcfa), 0)::bigint AS "montantAPayerFcfa",
        COUNT(*)::int                               AS "nbBulletinsNonPaies"
      FROM bulletins_paie
      WHERE cooperative_id = ${cooperativeId}
        AND mois = ${mois}
        AND annee = ${annee}
        AND statut IN ('brouillon', 'valide')
    `);
    const salaires = (salairesRows.rows[0] ?? {}) as {
      montantAPayerFcfa: string; nbBulletinsNonPaies: number;
    };

    // ── 5. Avances membres en cours ──────────────────────────────────────────
    const avancesRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(a.solde_restant_fcfa), 0)::bigint AS "totalEncoursFcfa",
        COUNT(*)::int                                    AS "nombreEncours"
      FROM avances a
      JOIN membres m ON a.membre_id = m.id
      WHERE m.cooperative_id = ${cooperativeId}
        AND a.statut = 'en_cours'
    `);
    const avances = (avancesRows.rows[0] ?? {}) as {
      totalEncoursFcfa: string; nombreEncours: number;
    };

    // ── 6. Emprunts en cours ─────────────────────────────────────────────────
    const empruntsRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(solde_restant_fcfa::numeric), 0)::bigint AS "totalSoldeRestantFcfa",
        COUNT(*)::int                                          AS "nombreEnCours"
      FROM emprunts
      WHERE cooperative_id = ${cooperativeId}
        AND statut = 'en_cours'
    `);
    const emprunts = (empruntsRows.rows[0] ?? {}) as {
      totalSoldeRestantFcfa: string; nombreEnCours: number;
    };

    res.json({
      tresorerie: {
        totalCaissesFcfa: parseInt(String(tresorerie.totalCaissesFcfa), 10) || 0,
        nombreCaisses: tresorerie.nombreCaisses ?? 0,
        nombreCaissesBasses: tresorerie.nombreCaissesBasses ?? 0,
      },
      creances: {
        totalEnRetardFcfa: parseInt(String(creances.totalEnRetardFcfa), 10) || 0,
        nbEnRetard: creances.nbEnRetard ?? 0,
        totalNonRegleFcfa: parseInt(String(creances.totalNonRegleFcfa), 10) || 0,
        nbNonRegle: creances.nbNonRegle ?? 0,
      },
      budget,
      salaires: {
        mois,
        annee,
        montantAPayerFcfa: parseInt(String(salaires.montantAPayerFcfa), 10) || 0,
        nbBulletinsNonPaies: salaires.nbBulletinsNonPaies ?? 0,
      },
      avances: {
        totalEncoursFcfa: parseInt(String(avances.totalEncoursFcfa), 10) || 0,
        nombreEncours: avances.nombreEncours ?? 0,
      },
      emprunts: {
        totalSoldeRestantFcfa: parseInt(String(emprunts.totalSoldeRestantFcfa), 10) || 0,
        nombreEnCours: emprunts.nombreEnCours ?? 0,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getTableauBordFinancier");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

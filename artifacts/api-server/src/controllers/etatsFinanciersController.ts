import { type Request, type Response } from "express";
import { db, ecrituresComptablesTable, planComptableTable, ventesExportateursTable, livraisonsTable, avancesTable } from "@workspace/db";
import { eq, sql, gte } from "drizzle-orm";

const COOP_ID = 1;

function exerciceCourant(): number {
  return new Date().getFullYear();
}

export async function getBilan(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();

    const rows = await db.execute(sql`
      SELECT
        p.numero_compte AS "numeroCompte",
        p.libelle,
        p.type,
        (
          COALESCE(SUM(CASE WHEN e.compte_debit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN e.compte_credit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0)
        )::int AS "solde"
      FROM plan_comptable p
      LEFT JOIN ecritures_comptables e
        ON (e.compte_debit = p.numero_compte OR e.compte_credit = p.numero_compte)
        AND e.cooperative_id = ${COOP_ID}
        AND e.exercice = ${exercice}
      WHERE p.cooperative_id = ${COOP_ID}
      GROUP BY p.id, p.numero_compte, p.libelle, p.type
      ORDER BY p.numero_compte
    `);

    const lignes = rows.rows as Array<{ numeroCompte: string; libelle: string; type: string; solde: number }>;

    const actif = lignes
      .filter((l) => l.type === "actif" && l.solde > 0)
      .map((l) => ({ compte: l.numeroCompte, libelle: l.libelle, montantFcfa: l.solde }));

    const passif = lignes
      .filter((l) => l.type === "passif" && l.solde < 0)
      .map((l) => ({ compte: l.numeroCompte, libelle: l.libelle, montantFcfa: Math.abs(l.solde) }));

    // Résultat comme poste du passif
    const produits = lignes.filter((l) => l.type === "produit").reduce((s, l) => s + Math.abs(l.solde), 0);
    const charges = lignes.filter((l) => l.type === "charge").reduce((s, l) => s + l.solde, 0);
    const resultatNet = produits - charges;
    if (resultatNet !== 0) {
      passif.push({ compte: "130", libelle: "Résultat de l'exercice", montantFcfa: resultatNet });
    }

    res.json({
      actif,
      passif,
      totalActifFcfa: actif.reduce((s, a) => s + a.montantFcfa, 0),
      totalPassifFcfa: passif.reduce((s, a) => s + a.montantFcfa, 0),
      exercice,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getBilan");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getCompteResultat(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();

    const rows = await db.execute(sql`
      SELECT
        p.numero_compte AS "numeroCompte",
        p.libelle,
        p.type,
        COALESCE(
          CASE
            WHEN p.type = 'produit' THEN SUM(CASE WHEN e.compte_credit = p.numero_compte THEN e.montant_fcfa ELSE 0 END)
            WHEN p.type = 'charge'  THEN SUM(CASE WHEN e.compte_debit  = p.numero_compte THEN e.montant_fcfa ELSE 0 END)
            ELSE 0
          END, 0
        )::int AS montant
      FROM plan_comptable p
      LEFT JOIN ecritures_comptables e
        ON (e.compte_debit = p.numero_compte OR e.compte_credit = p.numero_compte)
        AND e.cooperative_id = ${COOP_ID}
        AND e.exercice = ${exercice}
      WHERE p.cooperative_id = ${COOP_ID} AND p.type IN ('produit', 'charge')
      GROUP BY p.id, p.numero_compte, p.libelle, p.type
      ORDER BY p.numero_compte
    `);

    const lignes = rows.rows as Array<{ numeroCompte: string; libelle: string; type: string; montant: number }>;
    const produits = lignes.filter((l) => l.type === "produit").map((l) => ({ compte: l.numeroCompte, libelle: l.libelle, montantFcfa: l.montant }));
    const charges = lignes.filter((l) => l.type === "charge").map((l) => ({ compte: l.numeroCompte, libelle: l.libelle, montantFcfa: l.montant }));

    const totalProduits = produits.reduce((s, l) => s + l.montantFcfa, 0);
    const totalCharges = charges.reduce((s, l) => s + l.montantFcfa, 0);
    const resultatNet = totalProduits - totalCharges;

    // Ventilation mensuelle
    const mensuel = await db.execute(sql`
      SELECT
        EXTRACT(MONTH FROM date_ecriture::date)::int AS mois,
        COALESCE(SUM(CASE WHEN compte_credit = '701' THEN montant_fcfa ELSE 0 END), 0)::int AS "produitsFcfa",
        COALESCE(SUM(CASE WHEN compte_debit IN ('601','621','641','661') THEN montant_fcfa ELSE 0 END), 0)::int AS "chargesFcfa"
      FROM ecritures_comptables
      WHERE cooperative_id = ${COOP_ID} AND exercice = ${exercice}
      GROUP BY mois
      ORDER BY mois
    `);

    const mensuelMap: Record<number, { produitsFcfa: number; chargesFcfa: number }> = {};
    (mensuel.rows as Array<{ mois: number; produitsFcfa: number; chargesFcfa: number }>).forEach((r) => {
      mensuelMap[r.mois] = { produitsFcfa: r.produitsFcfa, chargesFcfa: r.chargesFcfa };
    });
    const ventilationMensuelle = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const d = mensuelMap[m] ?? { produitsFcfa: 0, chargesFcfa: 0 };
      return { mois: m, produitsFcfa: d.produitsFcfa, chargesFcfa: d.chargesFcfa, resultatFcfa: d.produitsFcfa - d.chargesFcfa };
    });

    res.json({ produits, charges, totalProduitsFcfa: totalProduits, totalChargesFcfa: totalCharges, resultatNetFcfa: resultatNet, exercice, ventilationMensuelle });
  } catch (err) {
    req.log.error({ err }, "Erreur getCompteResultat");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getFluxTresorerie(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();

    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN compte_debit = '521' AND source = 'paiement' THEN montant_fcfa ELSE 0 END), 0)::int AS "encaissementsExportateursFcfa",
        COALESCE(SUM(CASE WHEN compte_credit = '521' AND source = 'livraison' THEN montant_fcfa ELSE 0 END), 0)::int AS "paiementsProducteursFcfa",
        COALESCE(SUM(CASE WHEN compte_credit = '521' AND source = 'avance' THEN montant_fcfa ELSE 0 END), 0)::int AS "avancesOctroyes",
        COALESCE(SUM(CASE WHEN compte_debit = '521' THEN montant_fcfa ELSE 0 END), 0)::int AS "totalEntrees",
        COALESCE(SUM(CASE WHEN compte_credit = '521' THEN montant_fcfa ELSE 0 END), 0)::int AS "totalSorties"
      FROM ecritures_comptables
      WHERE cooperative_id = ${COOP_ID} AND exercice = ${exercice}
    `);

    const r = rows.rows[0] as {
      encaissementsExportateursFcfa: number;
      paiementsProducteursFcfa: number;
      avancesOctroyes: number;
      totalEntrees: number;
      totalSorties: number;
    };

    const encaissements = r?.encaissementsExportateursFcfa ?? 0;
    const paiements = r?.paiementsProducteursFcfa ?? 0;
    const avances = r?.avancesOctroyes ?? 0;
    const totalEntrees = r?.totalEntrees ?? 0;
    const totalSorties = r?.totalSorties ?? 0;

    const fluxOperationnels = encaissements - paiements;
    const fluxFinancement = -avances;

    res.json({
      fluxOperationnelsFcfa: fluxOperationnels,
      fluxFinancementFcfa: fluxFinancement,
      encaissementsExportateursFcfa: encaissements,
      paiementsProducteursFcfa: paiements,
      avancesOctroyes: avances,
      avancesRembourses: 0,
      soldeDebutFcfa: 0,
      soldeFinalFcfa: totalEntrees - totalSorties,
      exercice,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getFluxTresorerie");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMargeCampagnes(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db.execute(sql`
      SELECT
        exercice AS annee,
        COALESCE(SUM(CASE WHEN compte_credit = '701' THEN montant_fcfa ELSE 0 END), 0)::int AS "caVentesFcfa",
        COALESCE(SUM(CASE WHEN compte_debit = '601' THEN montant_fcfa ELSE 0 END), 0)::int AS "coutAchatsFcfa",
        COALESCE(SUM(CASE WHEN compte_debit IN ('621','641','661') THEN montant_fcfa ELSE 0 END), 0)::int AS "chargesFcfa"
      FROM ecritures_comptables
      WHERE cooperative_id = ${COOP_ID}
      GROUP BY exercice
      ORDER BY exercice DESC
    `);

    const result = (rows.rows as Array<{ annee: number; caVentesFcfa: number; coutAchatsFcfa: number; chargesFcfa: number }>)
      .map((r) => {
        const margeNetteFcfa = r.caVentesFcfa - r.coutAchatsFcfa - r.chargesFcfa;
        const tauxMarge = r.caVentesFcfa > 0 ? Math.round((margeNetteFcfa / r.caVentesFcfa) * 10000) / 100 : 0;
        return { annee: r.annee, caVentesFcfa: r.caVentesFcfa, coutAchatsFcfa: r.coutAchatsFcfa, chargesFcfa: r.chargesFcfa, margeNetteFcfa, tauxMarge };
      });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur getMargeCampagnes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

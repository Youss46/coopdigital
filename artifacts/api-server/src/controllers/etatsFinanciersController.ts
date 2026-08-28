import { type Request, type Response } from "express";
import { db, ecrituresComptablesTable, planComptableTable, ventesExportateursTable, livraisonsTable } from "@workspace/db";
import { eq, sql, gte } from "drizzle-orm";

class TenantError extends Error {
  readonly status = 401;
  readonly erreur = "Coopérative non associée au compte";
  constructor() { super("TENANT_REQUIRED"); }
}

const coopId = (req: import("express").Request): number => {
  const id = req.user?.cooperativeId;
  if (!id) throw new TenantError();
  return id;
};

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
        AND e.cooperative_id = ${coopId(req)}
        AND e.exercice = ${exercice}
      WHERE p.cooperative_id = ${coopId(req)}
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
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
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
        AND e.cooperative_id = ${coopId(req)}
        AND e.exercice = ${exercice}
      WHERE p.cooperative_id = ${coopId(req)} AND p.type IN ('produit', 'charge')
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
      WHERE cooperative_id = ${coopId(req)} AND exercice = ${exercice}
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
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getCompteResultat");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getFluxTresorerie(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();
    const cooperativeId = coopId(req);
    const dateDebut = `${exercice}-01-01`;
    const dateFin = `${exercice + 1}-01-01`;

    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN compte_debit = '521' AND source = 'paiement' THEN montant_fcfa ELSE 0 END), 0)::int AS "encaissementsExportateursFcfa",
        COALESCE(SUM(CASE WHEN compte_debit = '401' AND compte_credit IN ('521','552','571') AND source = 'paiement' THEN montant_fcfa ELSE 0 END), 0)::int AS "paiementsProducteursFcfa",
        COALESCE((
          SELECT SUM(a.montant_octroye_fcfa)
          FROM avances a
          INNER JOIN membres m ON m.id = a.membre_id
          WHERE m.cooperative_id = ${cooperativeId}
            AND a.date_octroi >= ${dateDebut}
            AND a.date_octroi < ${dateFin}
        ), 0)::int AS "avancesOctroyes",
        COALESCE((
          SELECT SUM(r.montant_fcfa)
          FROM remboursements_avances_membres r
          INNER JOIN avances a ON a.id = r.avance_id
          INNER JOIN membres m ON m.id = a.membre_id
          WHERE m.cooperative_id = ${cooperativeId}
            AND r.created_at >= ${dateDebut}
            AND r.created_at < ${dateFin}
        ), 0)::int AS "avancesRembourses",
        COALESCE(SUM(CASE WHEN compte_debit IN ('521','552','571') THEN montant_fcfa ELSE 0 END), 0)::int AS "totalEntrees",
        COALESCE(SUM(CASE WHEN compte_credit IN ('521','552','571') THEN montant_fcfa ELSE 0 END), 0)::int AS "totalSorties"
      FROM ecritures_comptables
      WHERE cooperative_id = ${cooperativeId} AND exercice = ${exercice}
    `);

    const r = rows.rows[0] as {
      encaissementsExportateursFcfa: number;
      paiementsProducteursFcfa: number;
      avancesOctroyes: number;
      avancesRembourses: number;
      totalEntrees: number;
      totalSorties: number;
    };

    const encaissements = r?.encaissementsExportateursFcfa ?? 0;
    const paiements = r?.paiementsProducteursFcfa ?? 0;
    const avances = r?.avancesOctroyes ?? 0;
    const avancesRembourses = r?.avancesRembourses ?? 0;
    const totalEntrees = r?.totalEntrees ?? 0;
    const totalSorties = r?.totalSorties ?? 0;

    const fluxOperationnels = encaissements - paiements;
    const fluxFinancement = -avances + avancesRembourses;

    res.json({
      fluxOperationnelsFcfa: fluxOperationnels,
      fluxFinancementFcfa: fluxFinancement,
      encaissementsExportateursFcfa: encaissements,
      paiementsProducteursFcfa: paiements,
      avancesOctroyes: avances,
      avancesRembourses,
      soldeDebutFcfa: 0,
      soldeFinalFcfa: totalEntrees - totalSorties,
      exercice,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getFluxTresorerie");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getComparatifCampagnes(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = coopId(req);

    const rows = await db.execute(sql`
      SELECT
        c.id                                    AS "campagneId",
        c.libelle,
        c.annee_debut                           AS "anneeDebut",
        c.annee_fin                             AS "anneeFin",
        c.statut,
        COALESCE(lv."tonnageKg", 0)::int         AS "tonnageKg",
        COALESCE(lv."membresActifs", 0)::int     AS "membresActifs",
        COALESCE(ec."caVentesFcfa", 0)::int      AS "caVentesFcfa",
        COALESCE(ec."coutAchatsFcfa", 0)::int    AS "coutAchatsFcfa",
        COALESCE(ec."chargesFcfa", 0)::int       AS "chargesFcfa",
        GREATEST(0, COALESCE(di."intrantsDist", 0) - COALESCE(di."intrantsRecouvres", 0))::int AS "intrantsNetFcfa",
        COALESCE(cd."commissionsPay", 0)::int    AS "commissionsPay"
      FROM campagnes c
      LEFT JOIN LATERAL (
        SELECT
          SUM(COALESCE(l.poids_net_kg, l.poids_kg)) AS "tonnageKg",
          COUNT(DISTINCT l.membre_id)               AS "membresActifs"
        FROM livraisons l
        WHERE l.campagne_id = c.id
          AND (
            EXISTS (SELECT 1 FROM membres m WHERE m.id = l.membre_id AND m.cooperative_id = c.cooperative_id)
            OR EXISTS (SELECT 1 FROM fournisseurs f WHERE f.id = l.fournisseur_id AND f.cooperative_id = c.cooperative_id)
          )
      ) lv ON true
      LEFT JOIN LATERAL (
        SELECT
          SUM(CASE WHEN e.compte_credit = '701' THEN e.montant_fcfa ELSE 0 END)                  AS "caVentesFcfa",
          SUM(CASE WHEN e.compte_debit  = '601' THEN e.montant_fcfa ELSE 0 END)                  AS "coutAchatsFcfa",
          SUM(CASE WHEN e.compte_debit IN ('621','641','661') THEN e.montant_fcfa ELSE 0 END)    AS "chargesFcfa"
        FROM ecritures_comptables e
        WHERE e.cooperative_id = c.cooperative_id
          AND e.exercice = c.annee_debut
      ) ec ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(montant_fcfa), 0)           AS "intrantsDist",
          COALESCE(SUM(montant_rembourse_fcfa), 0) AS "intrantsRecouvres"
        FROM distributions_intrants
        WHERE campagne_id = c.id
      ) di ON true
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(montant_fcfa), 0) AS "commissionsPay"
        FROM commissions_delegues
        WHERE campagne_id = c.id AND statut = 'payé'
      ) cd ON true
      WHERE c.cooperative_id = ${cooperativeId}
      ORDER BY c.annee_debut DESC
      LIMIT 6
    `);

    const result = (rows.rows as Array<{
      campagneId: number;
      libelle: string;
      anneeDebut: number;
      anneeFin: number;
      statut: string;
      tonnageKg: number;
      membresActifs: number;
      caVentesFcfa: number;
      coutAchatsFcfa: number;
      chargesFcfa: number;
      intrantsNetFcfa: number;
      commissionsPay: number;
    }>).map((r) => {
      const margeNetteFcfa = r.caVentesFcfa - r.coutAchatsFcfa - r.chargesFcfa - r.intrantsNetFcfa - r.commissionsPay;
      const tauxMarge = r.caVentesFcfa > 0 ? Math.round((margeNetteFcfa / r.caVentesFcfa) * 10000) / 100 : 0;
      return {
        campagneId: r.campagneId,
        libelle: r.libelle,
        anneeDebut: r.anneeDebut,
        anneeFin: r.anneeFin,
        statut: r.statut,
        tonnageKg: r.tonnageKg,
        tonnageTonnes: Math.round(r.tonnageKg / 1000 * 10) / 10,
        membresActifs: r.membresActifs,
        caVentesFcfa: r.caVentesFcfa,
        coutAchatsFcfa: r.coutAchatsFcfa,
        chargesFcfa: r.chargesFcfa,
        intrantsNetFcfa: r.intrantsNetFcfa,
        commissionsPay: r.commissionsPay,
        margeNetteFcfa,
        tauxMarge,
      };
    });

    res.json(result);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getComparatifCampagnes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMargeCampagnes(req: Request, res: Response): Promise<void> {
  try {
    const cid = coopId(req);

    const [ecrituresRows, intrantsRows, commissionsRows] = await Promise.all([
      db.execute(sql`
        SELECT
          exercice AS annee,
          COALESCE(SUM(CASE WHEN compte_credit = '701' THEN montant_fcfa ELSE 0 END), 0)::int AS "caVentesFcfa",
          COALESCE(SUM(CASE WHEN compte_debit = '601' THEN montant_fcfa ELSE 0 END), 0)::int AS "coutAchatsFcfa",
          COALESCE(SUM(CASE WHEN compte_debit IN ('621','641','661') THEN montant_fcfa ELSE 0 END), 0)::int AS "chargesFcfa"
        FROM ecritures_comptables
        WHERE cooperative_id = ${cid}
        GROUP BY exercice
        ORDER BY exercice DESC
      `),
      db.execute(sql`
        SELECT
          c.annee_debut AS annee,
          GREATEST(0, COALESCE(SUM(di.montant_fcfa), 0) - COALESCE(SUM(di.montant_rembourse_fcfa), 0))::int AS "intrantsNetFcfa"
        FROM distributions_intrants di
        INNER JOIN campagnes c ON c.id = di.campagne_id
        WHERE di.cooperative_id = ${cid}
        GROUP BY c.annee_debut
      `),
      db.execute(sql`
        SELECT
          c.annee_debut AS annee,
          COALESCE(SUM(cd.montant_fcfa), 0)::int AS "commissionsPay"
        FROM commissions_delegues cd
        INNER JOIN campagnes c ON c.id = cd.campagne_id
        WHERE c.cooperative_id = ${cid} AND cd.statut = 'payé'
        GROUP BY c.annee_debut
      `),
    ]);

    const intrantsMap = new Map<number, number>(
      (intrantsRows.rows as Array<{ annee: number; intrantsNetFcfa: number }>)
        .map((r) => [r.annee, r.intrantsNetFcfa])
    );
    const commissionsMap = new Map<number, number>(
      (commissionsRows.rows as Array<{ annee: number; commissionsPay: number }>)
        .map((r) => [r.annee, r.commissionsPay])
    );

    const result = (ecrituresRows.rows as Array<{ annee: number; caVentesFcfa: number; coutAchatsFcfa: number; chargesFcfa: number }>)
      .map((r) => {
        const intrantsNetFcfa = intrantsMap.get(r.annee) ?? 0;
        const commissionsPay = commissionsMap.get(r.annee) ?? 0;
        const margeNetteFcfa = r.caVentesFcfa - r.coutAchatsFcfa - r.chargesFcfa - intrantsNetFcfa - commissionsPay;
        const tauxMarge = r.caVentesFcfa > 0 ? Math.round((margeNetteFcfa / r.caVentesFcfa) * 10000) / 100 : 0;
        return { annee: r.annee, caVentesFcfa: r.caVentesFcfa, coutAchatsFcfa: r.coutAchatsFcfa, chargesFcfa: r.chargesFcfa, intrantsNetFcfa, commissionsPay, margeNetteFcfa, tauxMarge };
      });

    res.json(result);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getMargeCampagnes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

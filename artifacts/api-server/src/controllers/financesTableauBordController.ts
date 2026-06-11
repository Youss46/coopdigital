import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

type QueryResult<T> = { ok: true; data: T } | { ok: false; erreur: string };

async function safeQuery<T>(label: string, req: Request, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    req.log.error({ err, label }, `tableau-bord: requête "${label}" en échec`);
    return fallback;
  }
}

export async function getTableauBordFinancier(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  // ── 1. Trésorerie ────────────────────────────────────────────────────────
  const tresorerie = await safeQuery("tresorerie", req, async () => {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(solde_actuel_fcfa::numeric), 0)::bigint        AS "totalCaissesFcfa",
        COUNT(*)::int                                                 AS "nombreCaisses",
        COUNT(CASE WHEN solde_actuel_fcfa::numeric < fond_caisse_minimum_fcfa::numeric
                   AND fond_caisse_minimum_fcfa::numeric > 0
              THEN 1 END)::int                                        AS "nombreCaissesBasses"
      FROM caisses
      WHERE cooperative_id = ${cooperativeId} AND actif = true
    `);
    const r = (rows.rows[0] ?? {}) as { totalCaissesFcfa: string; nombreCaisses: number; nombreCaissesBasses: number };
    return {
      totalCaissesFcfa: parseInt(String(r.totalCaissesFcfa), 10) || 0,
      nombreCaisses: r.nombreCaisses ?? 0,
      nombreCaissesBasses: r.nombreCaissesBasses ?? 0,
    };
  }, { totalCaissesFcfa: 0, nombreCaisses: 0, nombreCaissesBasses: 0 });

  // ── 2. Créances exportateurs ──────────────────────────────────────────────
  const creances = await safeQuery("creances", req, async () => {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN v.statut = 'en_retard' THEN v.solde_du_fcfa ELSE 0 END), 0)::bigint AS "totalEnRetardFcfa",
        COUNT(CASE WHEN v.statut = 'en_retard' THEN 1 END)::int                                    AS "nbEnRetard",
        COALESCE(SUM(CASE WHEN v.statut IN ('en_attente','partiel','en_retard') THEN v.solde_du_fcfa ELSE 0 END), 0)::bigint AS "totalNonRegleFcfa",
        COUNT(CASE WHEN v.statut IN ('en_attente','partiel','en_retard') THEN 1 END)::int           AS "nbNonRegle"
      FROM ventes_exportateurs v
      JOIN exportateurs e ON v.exportateur_id = e.id
      WHERE e.cooperative_id = ${cooperativeId}
    `);
    const r = (rows.rows[0] ?? {}) as { totalEnRetardFcfa: string; nbEnRetard: number; totalNonRegleFcfa: string; nbNonRegle: number };
    return {
      totalEnRetardFcfa: parseInt(String(r.totalEnRetardFcfa), 10) || 0,
      nbEnRetard: r.nbEnRetard ?? 0,
      totalNonRegleFcfa: parseInt(String(r.totalNonRegleFcfa), 10) || 0,
      nbNonRegle: r.nbNonRegle ?? 0,
    };
  }, { totalEnRetardFcfa: 0, nbEnRetard: 0, totalNonRegleFcfa: 0, nbNonRegle: 0 });

  // ── 3. Budget vs réel ────────────────────────────────────────────────────
  const budget = await safeQuery("budget", req, async () => {
    const rows = await db.execute(sql`
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
    const row = (rows.rows[0] ?? null) as { campagneNom: string; totalPrevFcfa: string; totalReelFcfa: string; nbDepassements: number } | null;
    if (!row) return null;
    const prev = parseInt(String(row.totalPrevFcfa), 10) || 0;
    const reel = parseInt(String(row.totalReelFcfa), 10) || 0;
    return {
      campagneNom: row.campagneNom,
      totalPrevFcfa: prev,
      totalReelFcfa: reel,
      tauxExecution: prev > 0 ? Math.round((reel / prev) * 100) : 0,
      nbDepassements: row.nbDepassements ?? 0,
    };
  }, null);

  // ── 4. Salaires ──────────────────────────────────────────────────────────
  const now = new Date();
  const mois = now.getMonth() + 1;
  const annee = now.getFullYear();

  const salaires = await safeQuery("salaires", req, async () => {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(salaire_net_fcfa), 0)::bigint AS "montantAPayerFcfa",
        COUNT(*)::int                               AS "nbBulletinsNonPaies"
      FROM bulletins_paie
      WHERE cooperative_id = ${cooperativeId}
        AND mois = ${mois}
        AND annee = ${annee}
        AND statut IN ('brouillon', 'valide')
    `);
    const r = (rows.rows[0] ?? {}) as { montantAPayerFcfa: string; nbBulletinsNonPaies: number };
    return {
      mois,
      annee,
      montantAPayerFcfa: parseInt(String(r.montantAPayerFcfa), 10) || 0,
      nbBulletinsNonPaies: r.nbBulletinsNonPaies ?? 0,
    };
  }, { mois, annee, montantAPayerFcfa: 0, nbBulletinsNonPaies: 0 });

  // ── 5. Avances ───────────────────────────────────────────────────────────
  const avances = await safeQuery("avances", req, async () => {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(a.solde_restant_fcfa), 0)::bigint AS "totalEncoursFcfa",
        COUNT(*)::int                                    AS "nombreEncours"
      FROM avances a
      JOIN membres m ON a.membre_id = m.id
      WHERE m.cooperative_id = ${cooperativeId}
        AND a.statut = 'en_cours'
    `);
    const r = (rows.rows[0] ?? {}) as { totalEncoursFcfa: string; nombreEncours: number };
    return {
      totalEncoursFcfa: parseInt(String(r.totalEncoursFcfa), 10) || 0,
      nombreEncours: r.nombreEncours ?? 0,
    };
  }, { totalEncoursFcfa: 0, nombreEncours: 0 });

  // ── 6. Emprunts ──────────────────────────────────────────────────────────
  const emprunts = await safeQuery("emprunts", req, async () => {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(solde_restant_fcfa::numeric), 0)::bigint AS "totalSoldeRestantFcfa",
        COUNT(*)::int                                          AS "nombreEnCours"
      FROM emprunts
      WHERE cooperative_id = ${cooperativeId}
        AND statut = 'en_cours'
    `);
    const r = (rows.rows[0] ?? {}) as { totalSoldeRestantFcfa: string; nombreEnCours: number };
    return {
      totalSoldeRestantFcfa: parseInt(String(r.totalSoldeRestantFcfa), 10) || 0,
      nombreEnCours: r.nombreEnCours ?? 0,
    };
  }, { totalSoldeRestantFcfa: 0, nombreEnCours: 0 });

  res.json({ tresorerie, creances, budget, salaires, avances, emprunts });
}

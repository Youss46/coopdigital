import { type Request, type Response } from "express";
import { db, ecrituresComptablesTable, planComptableTable, exercicesTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc, asc } from "drizzle-orm";
import { CreateEcritureManuelleBody } from "@workspace/api-zod";

const COOP_ID = 1;

function exerciceCourant(): number {
  return new Date().getFullYear();
}

export async function getGrandLivre(req: Request, res: Response): Promise<void> {
  try {
    const compte = req.query["compte"] as string | undefined;
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : undefined;
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "50")));
    const offset = (page - 1) * limit;

    const conditions = [eq(ecrituresComptablesTable.cooperativeId, COOP_ID)];
    if (exercice) conditions.push(eq(ecrituresComptablesTable.exercice, exercice));
    if (dateDebut) conditions.push(gte(ecrituresComptablesTable.dateEcriture, dateDebut));
    if (dateFin) conditions.push(lte(ecrituresComptablesTable.dateEcriture, dateFin));
    if (compte) {
      conditions.push(
        sql`(${ecrituresComptablesTable.compteDebit} = ${compte} OR ${ecrituresComptablesTable.compteCredit} = ${compte})`
      );
    }

    const where = and(...conditions);

    const [ecritures, [{ count }]] = await Promise.all([
      db.select().from(ecrituresComptablesTable)
        .where(where)
        .orderBy(desc(ecrituresComptablesTable.dateEcriture), desc(ecrituresComptablesTable.id))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(ecrituresComptablesTable)
        .where(where),
    ]);

    res.json({ ecritures, total: count ?? 0, page, limit });
  } catch (err) {
    req.log.error({ err }, "Erreur getGrandLivre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getBalance(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();

    const rows = await db.execute(sql`
      SELECT
        p.numero_compte AS "numeroCompte",
        p.libelle,
        p.type,
        COALESCE(SUM(CASE WHEN e.compte_debit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0)::int AS "totalDebit",
        COALESCE(SUM(CASE WHEN e.compte_credit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0)::int AS "totalCredit",
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
      HAVING (
        COALESCE(SUM(CASE WHEN e.compte_debit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0) > 0 OR
        COALESCE(SUM(CASE WHEN e.compte_credit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0) > 0
      )
      ORDER BY p.numero_compte ASC
    `);

    res.json(rows.rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getBalance");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getJournalComptable(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "50")));
    const offset = (page - 1) * limit;

    const where = and(
      eq(ecrituresComptablesTable.cooperativeId, COOP_ID),
      eq(ecrituresComptablesTable.exercice, exercice)
    );

    const [ecritures, [{ count }]] = await Promise.all([
      db.select().from(ecrituresComptablesTable)
        .where(where)
        .orderBy(asc(ecrituresComptablesTable.dateEcriture), asc(ecrituresComptablesTable.id))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(ecrituresComptablesTable).where(where),
    ]);

    res.json({ ecritures, total: count ?? 0, page, limit });
  } catch (err) {
    req.log.error({ err }, "Erreur getJournalComptable");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createEcritureManuelle(req: Request, res: Response): Promise<void> {
  const parse = CreateEcritureManuelleBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  if (req.user?.role !== "admin") {
    res.status(403).json({ erreur: "Accès réservé aux administrateurs" });
    return;
  }

  const { dateEcriture, numeroPiece, libelle, compteDebit, compteCredit, montantFcfa } = parse.data;
  const exercice = new Date(dateEcriture).getFullYear();

  try {
    const [ecriture] = await db.insert(ecrituresComptablesTable).values({
      cooperativeId: COOP_ID,
      dateEcriture,
      numeroPiece: numeroPiece ?? null,
      libelle,
      compteDebit,
      compteCredit,
      montantFcfa,
      source: "manuel",
      sourceId: null,
      exercice,
    }).returning();

    res.status(201).json(ecriture);
  } catch (err) {
    req.log.error({ err }, "Erreur createEcritureManuelle");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMargeCollecte(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();

    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN compte_credit = '701' THEN montant_fcfa ELSE 0 END), 0)::int AS "caVentesFcfa",
        COALESCE(SUM(CASE WHEN compte_debit = '601' THEN montant_fcfa ELSE 0 END), 0)::int AS "coutAchatsFcfa",
        COALESCE(SUM(CASE WHEN compte_debit IN ('621', '641', '661') THEN montant_fcfa ELSE 0 END), 0)::int AS "chargesFcfa"
      FROM ecritures_comptables
      WHERE cooperative_id = ${COOP_ID} AND exercice = ${exercice}
    `);

    const r = rows.rows[0] as { caVentesFcfa: number; coutAchatsFcfa: number; chargesFcfa: number };
    const caVentesFcfa = r?.caVentesFcfa ?? 0;
    const coutAchatsFcfa = r?.coutAchatsFcfa ?? 0;
    const chargesFcfa = r?.chargesFcfa ?? 0;
    const margeNetteFcfa = caVentesFcfa - coutAchatsFcfa - chargesFcfa;
    const tauxMarge = caVentesFcfa > 0 ? Math.round((margeNetteFcfa / caVentesFcfa) * 10000) / 100 : 0;

    res.json({ caVentesFcfa, coutAchatsFcfa, chargesFcfa, margeNetteFcfa, exercice, tauxMarge });
  } catch (err) {
    req.log.error({ err }, "Erreur getMargeCollecte");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getTresorerie(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN compte_debit = '521' THEN montant_fcfa ELSE 0 END) -
                 SUM(CASE WHEN compte_credit = '521' THEN montant_fcfa ELSE 0 END), 0)::int AS "soldeBanqueFcfa",
        COALESCE(SUM(CASE WHEN compte_debit = '571' THEN montant_fcfa ELSE 0 END) -
                 SUM(CASE WHEN compte_credit = '571' THEN montant_fcfa ELSE 0 END), 0)::int AS "soldeCaisseFcfa"
      FROM ecritures_comptables
      WHERE cooperative_id = ${COOP_ID}
    `);

    const r = rows.rows[0] as { soldeBanqueFcfa: number; soldeCaisseFcfa: number };
    const soldeBanqueFcfa = r?.soldeBanqueFcfa ?? 0;
    const soldeCaisseFcfa = r?.soldeCaisseFcfa ?? 0;

    res.json({
      soldeBanqueFcfa,
      soldeCaisseFcfa,
      totalFcfa: soldeBanqueFcfa + soldeCaisseFcfa,
      dateCalcul: new Date().toISOString(),
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getTresorerie");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

import { type Request, type Response } from "express";
import { checkEcriture, creerAnomalies } from "../services/anomalieService";
import { db, ecrituresComptablesTable, planComptableTable, exercicesTable, configComptableTable, ecrituresEnAttenteTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc, asc, inArray } from "drizzle-orm";
import { CreateEcritureManuelleBody } from "@workspace/api-zod";

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

export async function getGrandLivre(req: Request, res: Response): Promise<void> {
  try {
    const compte = req.query["compte"] as string | undefined;
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : undefined;
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "50")));
    const offset = (page - 1) * limit;

    const conditions = [eq(ecrituresComptablesTable.cooperativeId, coopId(req))];
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
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
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
        AND e.cooperative_id = ${coopId(req)}
        AND e.exercice = ${exercice}
      WHERE p.cooperative_id = ${coopId(req)}
      GROUP BY p.id, p.numero_compte, p.libelle, p.type
      HAVING (
        COALESCE(SUM(CASE WHEN e.compte_debit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0) > 0 OR
        COALESCE(SUM(CASE WHEN e.compte_credit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0) > 0
      )
      ORDER BY p.numero_compte ASC
    `);

    res.json(rows.rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
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
      eq(ecrituresComptablesTable.cooperativeId, coopId(req)),
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
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
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

  const { dateEcriture, numeroPiece, libelle, compteDebit, compteCredit, montantFcfa } = parse.data;
  const exercice = new Date(dateEcriture).getFullYear();

  try {
    // ── Détection anomalies ──────────────────────────────────────────────
    const anomaliesDetectees = await checkEcriture(coopId(req), { montantFcfa, agentId: (req.user as { id?: number } | undefined)?.id ?? null });
    const anomaliesCritiques = anomaliesDetectees.filter((a) => a.niveauGravite === "critique");
    if (anomaliesCritiques.length > 0) {
      void creerAnomalies(coopId(req), anomaliesCritiques, "comptabilite");
      res.status(422).json({
        erreur: anomaliesCritiques[0]!.description,
        anomalie: "bloquee",
        anomalies: anomaliesCritiques,
      });
      return;
    }
    const anomaliesAttention = anomaliesDetectees.filter((a) => a.niveauGravite !== "critique");

    const [ecriture] = await db.insert(ecrituresComptablesTable).values({
      cooperativeId: coopId(req),
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

    if (anomaliesAttention.length > 0) {
      void creerAnomalies(coopId(req), anomaliesAttention, "comptabilite", { entiteId: ecriture!.id, entiteType: "ecriture" });
    }
    res.status(201).json(ecriture);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
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
      WHERE cooperative_id = ${coopId(req)} AND exercice = ${exercice}
    `);

    const r = rows.rows[0] as { caVentesFcfa: number; coutAchatsFcfa: number; chargesFcfa: number };
    const caVentesFcfa = r?.caVentesFcfa ?? 0;
    const coutAchatsFcfa = r?.coutAchatsFcfa ?? 0;
    const chargesFcfa = r?.chargesFcfa ?? 0;
    const margeNetteFcfa = caVentesFcfa - coutAchatsFcfa - chargesFcfa;
    const tauxMarge = caVentesFcfa > 0 ? Math.round((margeNetteFcfa / caVentesFcfa) * 10000) / 100 : 0;

    res.json({ caVentesFcfa, coutAchatsFcfa, chargesFcfa, margeNetteFcfa, exercice, tauxMarge });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
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
      WHERE cooperative_id = ${coopId(req)}
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
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getTresorerie");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Config comptable ─────────────────────────────────────────────────────────

export async function getConfigComptable(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(configComptableTable)
      .where(eq(configComptableTable.cooperativeId, coopId(req)))
      .limit(1);

    if (rows.length === 0) {
      await db.insert(configComptableTable).values({ cooperativeId: coopId(req) }).onConflictDoNothing();
      const created = await db.select().from(configComptableTable).where(eq(configComptableTable.cooperativeId, coopId(req))).limit(1);
      res.json(created[0]);
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getConfigComptable");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function updateConfigComptable(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      autoLivraisons?: boolean;
      autoPaiements?: boolean;
      autoAvances?: boolean;
      autoVentesExport?: boolean;
      autoEncaissements?: boolean;
      autoSalaires?: boolean;
      autoStocks?: boolean;
    };

    const [updated] = await db
      .update(configComptableTable)
      .set({
        ...body,
        modifiePar: req.user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(configComptableTable.cooperativeId, coopId(req)))
      .returning();

    if (!updated) {
      await db.insert(configComptableTable).values({ cooperativeId: coopId(req), ...body, modifiePar: req.user?.id ?? null, updatedAt: new Date() }).onConflictDoNothing();
      const created = await db.select().from(configComptableTable).where(eq(configComptableTable.cooperativeId, coopId(req))).limit(1);
      res.json(created[0]);
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "updateConfigComptable");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Écritures en attente ─────────────────────────────────────────────────────

export async function listEcrituresEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const source = req.query["source"] as string | undefined;
    const statut = (req.query["statut"] as string | undefined) ?? "en_attente";
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;

    const conditions = [eq(ecrituresEnAttenteTable.cooperativeId, coopId(req))];
    if (source) conditions.push(eq(ecrituresEnAttenteTable.source, source as "livraison" | "paiement" | "avance" | "vente" | "encaissement" | "salaire" | "stock"));
    if (statut) conditions.push(eq(ecrituresEnAttenteTable.statut, statut as "en_attente" | "validee" | "rejetee" | "modifiee"));
    if (dateDebut) conditions.push(gte(ecrituresEnAttenteTable.dateProposee, dateDebut));
    if (dateFin) conditions.push(lte(ecrituresEnAttenteTable.dateProposee, dateFin));

    const ecritures = await db
      .select()
      .from(ecrituresEnAttenteTable)
      .where(and(...conditions))
      .orderBy(desc(ecrituresEnAttenteTable.creeLe));

    res.json(ecritures);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "listEcrituresEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function countEcrituresEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ecrituresEnAttenteTable)
      .where(and(
        eq(ecrituresEnAttenteTable.cooperativeId, coopId(req)),
        eq(ecrituresEnAttenteTable.statut, "en_attente"),
      ));
    res.json({ count: count ?? 0 });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "countEcrituresEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function validerEcritureEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]));
    if (!id || isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const [ecriture] = await db
      .select()
      .from(ecrituresEnAttenteTable)
      .where(and(eq(ecrituresEnAttenteTable.id, id), eq(ecrituresEnAttenteTable.cooperativeId, coopId(req))))
      .limit(1);

    if (!ecriture) { res.status(404).json({ erreur: "Écriture introuvable" }); return; }
    if (ecriture.statut !== "en_attente") { res.status(400).json({ erreur: "Cette écriture a déjà été traitée" }); return; }

    const body = req.body as {
      compteDebit?: string;
      compteCredit?: string;
      montantFcfa?: number;
      libelle?: string;
      commentaire?: string;
    };

    const compteDebit = body.compteDebit ?? ecriture.compteDebitPropose;
    const compteCredit = body.compteCredit ?? ecriture.compteCreditPropose;
    const montantFcfa = body.montantFcfa ?? ecriture.montantFcfa;
    const libelle = body.libelle ?? ecriture.libelleProppose;

    const modifie =
      compteDebit !== ecriture.compteDebitPropose ||
      compteCredit !== ecriture.compteCreditPropose ||
      montantFcfa !== ecriture.montantFcfa ||
      libelle !== ecriture.libelleProppose;

    const nouveauStatut = modifie ? "modifiee" : "validee";

    const exercice = new Date(ecriture.dateProposee).getFullYear();
    const sourceMap: Record<string, "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock"> = {
      livraison: "livraison",
      paiement: "paiement",
      avance: "avance",
      vente: "vente",
      encaissement: "encaissement",
      salaire: "salaire",
      stock: "stock",
    };

    await db.insert(ecrituresComptablesTable).values({
      cooperativeId: coopId(req),
      dateEcriture: ecriture.dateProposee,
      libelle: modifie ? `${libelle} [modifiée]` : libelle,
      compteDebit,
      compteCredit,
      montantFcfa,
      source: sourceMap[ecriture.source] ?? "manuel",
      sourceId: ecriture.sourceId,
      exercice,
    });

    const [updated] = await db
      .update(ecrituresEnAttenteTable)
      .set({
        statut: nouveauStatut,
        commentaireComptable: body.commentaire ?? null,
        traiteLe: new Date(),
        traitePar: req.user?.id ?? null,
      })
      .where(eq(ecrituresEnAttenteTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "validerEcritureEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function rejeterEcritureEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]));
    if (!id || isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const [ecriture] = await db
      .select()
      .from(ecrituresEnAttenteTable)
      .where(and(eq(ecrituresEnAttenteTable.id, id), eq(ecrituresEnAttenteTable.cooperativeId, coopId(req))))
      .limit(1);

    if (!ecriture) { res.status(404).json({ erreur: "Écriture introuvable" }); return; }
    if (ecriture.statut !== "en_attente") { res.status(400).json({ erreur: "Cette écriture a déjà été traitée" }); return; }

    const { commentaire } = req.body as { commentaire?: string };
    if (!commentaire?.trim()) { res.status(400).json({ erreur: "Le motif du rejet est obligatoire" }); return; }

    const [updated] = await db
      .update(ecrituresEnAttenteTable)
      .set({
        statut: "rejetee",
        commentaireComptable: commentaire,
        traiteLe: new Date(),
        traitePar: req.user?.id ?? null,
      })
      .where(eq(ecrituresEnAttenteTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "rejeterEcritureEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function validerToutEcrituresEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const enAttente = await db
      .select()
      .from(ecrituresEnAttenteTable)
      .where(and(
        eq(ecrituresEnAttenteTable.cooperativeId, coopId(req)),
        eq(ecrituresEnAttenteTable.statut, "en_attente"),
      ));

    if (enAttente.length === 0) {
      res.json({ validees: 0 });
      return;
    }

    const sourceMap: Record<string, "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock"> = {
      livraison: "livraison", paiement: "paiement", avance: "avance",
      vente: "vente", encaissement: "encaissement", salaire: "salaire", stock: "stock",
    };

    await db.insert(ecrituresComptablesTable).values(
      enAttente.map((e) => ({
        cooperativeId: coopId(req),
        dateEcriture: e.dateProposee,
        libelle: e.libelleProppose,
        compteDebit: e.compteDebitPropose,
        compteCredit: e.compteCreditPropose,
        montantFcfa: e.montantFcfa,
        source: sourceMap[e.source] ?? "manuel",
        sourceId: e.sourceId,
        exercice: new Date(e.dateProposee).getFullYear(),
      }))
    );

    const ids = enAttente.map((e) => e.id);
    await db
      .update(ecrituresEnAttenteTable)
      .set({ statut: "validee", traiteLe: new Date(), traitePar: req.user?.id ?? null })
      .where(inArray(ecrituresEnAttenteTable.id, ids));

    res.json({ validees: enAttente.length });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "validerToutEcrituresEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Clôture d'exercice — 6 étapes OHADA SYSCOHADA ───────────────────────────
export async function cloturerExercice(req: Request, res: Response): Promise<void> {
  try {
    const coop = coopId(req);
    const annee = req.body.exercice ? parseInt(String(req.body.exercice)) : exerciceCourant();

    if (isNaN(annee) || annee < 2000 || annee > exerciceCourant()) {
      res.status(400).json({ erreur: "Exercice invalide" });
      return;
    }

    // ── Vérifier si déjà clôturé ─────────────────────────────────────────────
    const existing = await db.select().from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));

    if (existing[0]?.statut === "cloture") {
      res.status(409).json({ erreur: `L'exercice ${annee} est déjà clôturé` });
      return;
    }

    // ── Calculer les soldes de tous les groupes de comptes ───────────────────
    // Solde compte = SUM(crédits) - SUM(débits) pour les produits (solde créditeur normal)
    //             = SUM(débits) - SUM(crédits) pour les charges (solde débiteur normal)
    const totaux = await db.execute(sql`
      SELECT
        -- Produits d'exploitation (70x, 71x, 75x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('70','71','75') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('70','71','75') THEN montant_fcfa ELSE 0 END), 0))::int
        AS "prodExploitation",

        -- Charges d'exploitation (60x, 61x, 62x, 63x, 64x, 65x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('60','61','62','63','64','65') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('60','61','62','63','64','65') THEN montant_fcfa ELSE 0 END), 0))::int
        AS "chargesExploitation",

        -- Produits financiers (76x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '76' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '76' THEN montant_fcfa ELSE 0 END), 0))::int
        AS "prodFinanciers",

        -- Charges financières (66x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '66' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '66' THEN montant_fcfa ELSE 0 END), 0))::int
        AS "chargesFinancieres",

        -- Produits HAO (77x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '77' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '77' THEN montant_fcfa ELSE 0 END), 0))::int
        AS "prodHAO",

        -- Charges HAO (67x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '67' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '67' THEN montant_fcfa ELSE 0 END), 0))::int
        AS "chargesHAO"

      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee}
        AND LEFT(type_ecriture, 7) != 'cloture'
    `);

    const g = totaux.rows[0] as {
      prodExploitation: number; chargesExploitation: number;
      prodFinanciers: number; chargesFinancieres: number;
      prodHAO: number; chargesHAO: number;
    };

    const prodExploitation   = g?.prodExploitation   ?? 0;
    const chargesExploitation= g?.chargesExploitation?? 0;
    const prodFinanciers     = g?.prodFinanciers     ?? 0;
    const chargesFinancieres = g?.chargesFinancieres ?? 0;
    const prodHAO            = g?.prodHAO            ?? 0;
    const chargesHAO         = g?.chargesHAO         ?? 0;

    // Soldes intermédiaires (avant écritures de clôture)
    const solde135 = prodExploitation - chargesExploitation;   // Résultat exploitation
    const solde136 = prodFinanciers - chargesFinancieres;      // Résultat financier
    const solde137 = solde135 + solde136;                      // RAO
    const solde138 = prodHAO - chargesHAO;                     // RHAO
    const resultatNet = solde137 + solde138;

    const dateClot = `${annee}-12-31`;
    type EntreeClot = {
      cooperativeId: number; dateEcriture: string; numeroPiece: string | null;
      libelle: string; compteDebit: string; compteCredit: string;
      montantFcfa: number; source: "manuel"; sourceId: null; exercice: number;
      typeEcriture: string;
    };
    const entries: EntreeClot[] = [];

    const add = (piece: string, libelle: string, debit: string, credit: string, montant: number) => {
      if (montant <= 0) return;
      entries.push({ cooperativeId: coop, dateEcriture: dateClot, numeroPiece: piece, libelle, compteDebit: debit, compteCredit: credit, montantFcfa: Math.round(montant), source: "manuel", sourceId: null, exercice: annee, typeEcriture: "cloture" });
    };

    // ── ÉTAPE 1 : Résultat d'exploitation → compte 135 ───────────────────────
    const lib1 = `Clôture exploitation ${annee}`;
    add(`CLOT-${annee}-E1-PRD`, lib1, "701", "135", prodExploitation);
    add(`CLOT-${annee}-E1-CHG`, lib1, "135", "601", chargesExploitation);

    // ── ÉTAPE 2 : Résultat financier → compte 136 ────────────────────────────
    const lib2 = `Clôture financier ${annee}`;
    add(`CLOT-${annee}-E2-PRD`, lib2, "760", "136", prodFinanciers);
    add(`CLOT-${annee}-E2-CHG`, lib2, "136", "660", chargesFinancieres);

    // ── ÉTAPE 3 : Virer 135 + 136 → compte 137 (RAO) ────────────────────────
    const lib3 = `Calcul RAO ${annee}`;
    if (solde135 > 0)  add(`CLOT-${annee}-E3-135`, lib3, "135", "137",  solde135);
    if (solde135 < 0)  add(`CLOT-${annee}-E3-135`, lib3, "137", "135", -solde135);
    if (solde136 > 0)  add(`CLOT-${annee}-E3-136`, lib3, "136", "137",  solde136);
    if (solde136 < 0)  add(`CLOT-${annee}-E3-136`, lib3, "137", "136", -solde136);

    // ── ÉTAPE 4 : Résultat HAO → compte 138 ─────────────────────────────────
    const lib4 = `Clôture HAO ${annee}`;
    add(`CLOT-${annee}-E4-PRD`, lib4, "770", "138", prodHAO);
    add(`CLOT-${annee}-E4-CHG`, lib4, "138", "670", chargesHAO);

    // ── ÉTAPE 5 : Résultat net → 131 (bénéfice) ou 139 (perte) ──────────────
    const lib5 = `Résultat net ${annee}`;
    const cptRes = resultatNet >= 0 ? "131" : "139";
    if (solde137 > 0)  add(`CLOT-${annee}-E5-137`, lib5, "137",   cptRes, solde137);
    if (solde137 < 0)  add(`CLOT-${annee}-E5-137`, lib5, cptRes, "137",  -solde137);
    if (solde138 > 0)  add(`CLOT-${annee}-E5-138`, lib5, "138",   cptRes, solde138);
    if (solde138 < 0)  add(`CLOT-${annee}-E5-138`, lib5, cptRes, "138",  -solde138);

    // ── Insérer toutes les écritures ─────────────────────────────────────────
    if (entries.length > 0) {
      await db.insert(ecrituresComptablesTable).values(entries);
    }

    // ── ÉTAPE 6 : Verrouiller l'exercice ────────────────────────────────────
    if (existing.length > 0) {
      await db.update(exercicesTable)
        .set({ statut: "cloture" })
        .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));
    } else {
      await db.insert(exercicesTable).values({ cooperativeId: coop, annee, statut: "cloture" });
    }

    res.json({
      message: `Exercice ${annee} clôturé avec succès`,
      exercice: annee,
      soldeResultatExploitation: solde135,
      soldeResultatFinancier: solde136,
      soldeRAO: solde137,
      soldeRHAO: solde138,
      resultatNet,
      compteResultat: cptRes,
      ecrituresGenerees: entries.length,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur cloturerExercice");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Statut des exercices ─────────────────────────────────────────────────────
export async function getStatutsExercices(req: Request, res: Response): Promise<void> {
  try {
    const coop = coopId(req);
    const rows = await db.select().from(exercicesTable)
      .where(eq(exercicesTable.cooperativeId, coop))
      .orderBy(desc(exercicesTable.annee));
    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getStatutsExercices");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

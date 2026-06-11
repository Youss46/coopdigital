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

// ─── Clôture d'exercice — SYSCOHADA 6 phases complètes ───────────────────────
export async function cloturerExercice(req: Request, res: Response): Promise<void> {
  try {
    const coop          = coopId(req);
    const annee         = req.body.exercice       ? parseInt(String(req.body.exercice))        : exerciceCourant();
    const stockFinal    = req.body.stockFinalCacao != null ? Math.round(Number(req.body.stockFinalCacao)) : null;
    const impotResultat = req.body.impotResultat   != null ? Math.round(Number(req.body.impotResultat))   : 0;

    if (isNaN(annee) || annee < 2000 || annee > exerciceCourant()) {
      res.status(400).json({ erreur: "Exercice invalide" }); return;
    }

    const existing = await db.select().from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));
    if (existing[0]?.statut === "cloture") {
      res.status(409).json({ erreur: `L'exercice ${annee} est déjà clôturé` }); return;
    }

    // ── Type partagé pour toutes les écritures générées ──────────────────────
    type EntreeClot = {
      cooperativeId: number; dateEcriture: string; numeroPiece: string | null;
      libelle: string; compteDebit: string; compteCredit: string;
      montantFcfa: number; source: "manuel"; sourceId: null; exercice: number;
      typeEcriture: string;
    };
    const dateClot = `${annee}-12-31`;
    const dateOuv  = `${annee + 1}-01-01`;

    const mkE = (exo: number, type: string) =>
      (piece: string, libelle: string, debit: string, credit: string, montant: number): EntreeClot[] => {
        const m = Math.round(montant);
        if (m <= 0) return [];
        return [{ cooperativeId: coop, dateEcriture: exo === annee ? dateClot : dateOuv,
                  numeroPiece: piece, libelle, compteDebit: debit, compteCredit: credit,
                  montantFcfa: m, source: "manuel", sourceId: null, exercice: exo, typeEcriture: type }];
      };
    const ec = mkE(annee, "cloture");
    const ea = mkE(annee + 1, "a_nouveau");

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 1 — Vérifications préalables (informationnel, non-bloquant)
    // ══════════════════════════════════════════════════════════════════════════
    const v1 = await db.execute(sql`
      SELECT
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('52','57') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('52','57') THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeTresorerie",
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '40' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '40' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeFournisseurs",
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '42' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '42' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldePersonnel",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '48' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '48' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeRegularisation",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '31' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '31' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeStock311"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee}
        AND type_ecriture NOT IN ('cloture','a_nouveau')
    `);
    const p1 = v1.rows[0] as {
      soldeTresorerie: number; soldeFournisseurs: number; soldePersonnel: number;
      soldeRegularisation: number; soldeStock311: number;
    };
    const alertes: string[] = [];
    if (Number(p1?.soldeTresorerie ?? 0) < 0)
      alertes.push("⚠ Solde trésorerie négatif — vérifier comptes 52x/57x avant clôture");
    if (Number(p1?.soldeRegularisation ?? 0) !== 0)
      alertes.push("⚠ Comptes 48x non soldés — régulariser 481/476/477 avant clôture");

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2 — Amortissements non encore journalisés (681 → 28x)
    // ══════════════════════════════════════════════════════════════════════════
    const dotRows = await db.execute(sql`
      SELECT cat.compte_amortissement AS "compteAmort",
             SUM(d.dotation_fcfa)::bigint AS "total"
      FROM   dotations_amortissement d
      JOIN   equipements              e   ON e.id  = d.equipement_id
      JOIN   categories_equipements   cat ON cat.id = e.categorie_id
      WHERE  d.cooperative_id = ${coop}
        AND  d.exercice       = ${annee}
        AND  d.ecriture_id IS NULL
      GROUP  BY cat.compte_amortissement
      HAVING SUM(d.dotation_fcfa) > 0
    `);
    const phase2: EntreeClot[] = [];
    for (const row of dotRows.rows as { compteAmort: string; total: number }[]) {
      phase2.push(...ec(
        `CLOT-${annee}-AMORT`,
        `Dotations amortissements ${annee}`,
        "681", row.compteAmort || "284",
        Number(row.total),
      ));
    }
    if (phase2.length > 0) await db.insert(ecrituresComptablesTable).values(phase2);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 3 — Variation de stocks cacao (si stockFinalCacao fourni)
    // ══════════════════════════════════════════════════════════════════════════
    const phase3: EntreeClot[] = [];
    if (stockFinal !== null) {
      const stockInitial = Math.max(0, Number(p1?.soldeStock311 ?? 0));
      if (stockInitial > 0)
        phase3.push(...ec(`CLOT-${annee}-STK-INIT`, `Annulation stock initial cacao ${annee}`, "6031", "311", stockInitial));
      if (stockFinal > 0)
        phase3.push(...ec(`CLOT-${annee}-STK-FIN`,  `Constatation stock final cacao ${annee}`, "311", "6031", stockFinal));
      if (phase3.length > 0) await db.insert(ecrituresComptablesTable).values(phase3);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 4 — Calcul des soldes (APRÈS phases 2+3 = journal complet)
    //   SYSCOHADA correct :
    //     Charges exploitation : 60x-66x, 68x, 69x (incl. personnel, amort, provisions)
    //     Charges financières  : 67x  (frais financiers)
    //     Produits financiers  : 77x  (revenus financiers)
    //     Produits HAO         : 82x, 84x, 86x
    //     Charges HAO          : 81x, 83x, 85x
    // ══════════════════════════════════════════════════════════════════════════
    const soldesQ = await db.execute(sql`
      SELECT
        -- Produits exploitation (70x, 71x, 75x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('70','71','75') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('70','71','75') THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "prodExpl",
        -- Charges exploitation (60x–66x, 68x, 69x — personnel, amort, provisions inclus)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('60','61','62','63','64','65','66','68','69') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('60','61','62','63','64','65','66','68','69') THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "chgExpl",
        -- Produits financiers (77x — revenus financiers SYSCOHADA)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '77' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '77' THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "prodFin",
        -- Charges financières (67x — frais financiers SYSCOHADA)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '67' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '67' THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "chgFin",
        -- Produits HAO (82x, 84x, 86x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('82','84','86') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('82','84','86') THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "prodHAO",
        -- Charges HAO (81x, 83x, 85x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('81','83','85') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('81','83','85') THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "chgHAO"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee}
        AND type_ecriture NOT IN ('cloture','a_nouveau')
    `);
    const g = soldesQ.rows[0] as {
      prodExpl: number; chgExpl: number; prodFin: number; chgFin: number;
      prodHAO: number; chgHAO: number;
    };
    const prodExpl = Number(g?.prodExpl ?? 0);
    const chgExpl  = Number(g?.chgExpl  ?? 0);
    const prodFin  = Number(g?.prodFin  ?? 0);
    const chgFin   = Number(g?.chgFin   ?? 0);
    const prodHAO  = Number(g?.prodHAO  ?? 0);
    const chgHAO   = Number(g?.chgHAO   ?? 0);

    // Soldes intermédiaires de gestion
    const solde135 = prodExpl - chgExpl;        // Résultat exploitation
    const solde136 = prodFin  - chgFin;          // Résultat financier
    const solde137 = solde135 + solde136;         // RAO
    const solde138 = prodHAO  - chgHAO;           // RHAO
    const resAvantImpot = solde137 + solde138;
    const resultatNet   = resAvantImpot - impotResultat;

    const entries: EntreeClot[] = [];

    // ── Phase 4A : Résultat d'exploitation → 135 ─────────────────────────────
    entries.push(...ec(`CLOT-${annee}-E1-PRD`, `Clôture exploitation ${annee}`, "701", "135", prodExpl));
    entries.push(...ec(`CLOT-${annee}-E1-CHG`, `Clôture exploitation ${annee}`, "135", "601", chgExpl));

    // ── Phase 4B : Résultat financier → 136 ──────────────────────────────────
    entries.push(...ec(`CLOT-${annee}-E2-PRD`, `Clôture financier ${annee}`, "771", "136", prodFin));
    entries.push(...ec(`CLOT-${annee}-E2-CHG`, `Clôture financier ${annee}`, "136", "671", chgFin));

    // ── Phase 4C : RAO — virer 135 + 136 → 137 ───────────────────────────────
    if (solde135 > 0) entries.push(...ec(`CLOT-${annee}-E3-135P`, `Calcul RAO ${annee}`, "135",    "137",    solde135));
    if (solde135 < 0) entries.push(...ec(`CLOT-${annee}-E3-135N`, `Calcul RAO ${annee}`, "137",    "135",   -solde135));
    if (solde136 > 0) entries.push(...ec(`CLOT-${annee}-E3-136P`, `Calcul RAO ${annee}`, "136",    "137",    solde136));
    if (solde136 < 0) entries.push(...ec(`CLOT-${annee}-E3-136N`, `Calcul RAO ${annee}`, "137",    "136",   -solde136));

    // ── Phase 4D : RHAO → 138 ────────────────────────────────────────────────
    entries.push(...ec(`CLOT-${annee}-E4-PRD`, `Clôture HAO ${annee}`, "820", "138", prodHAO));
    entries.push(...ec(`CLOT-${annee}-E4-CHG`, `Clôture HAO ${annee}`, "138", "810", chgHAO));

    // ── Phase E : Impôt sur le résultat (891 / 441) ───────────────────────────
    if (impotResultat > 0)
      entries.push(...ec(`CLOT-${annee}-IMPOT`, `Impôt sur résultat ${annee}`, "891", "441", impotResultat));

    // ── Phase F : Résultat net → 131 (bénéfice) ou 139 (perte) ───────────────
    const cptRes  = resultatNet >= 0 ? "131" : "139";
    const libRes  = `Résultat net ${annee}`;
    if (solde137 > 0)        entries.push(...ec(`CLOT-${annee}-E5-137P`, libRes, "137",   cptRes,  solde137));
    if (solde137 < 0)        entries.push(...ec(`CLOT-${annee}-E5-137N`, libRes, cptRes,  "137",  -solde137));
    if (solde138 > 0)        entries.push(...ec(`CLOT-${annee}-E5-138P`, libRes, "138",   cptRes,  solde138));
    if (solde138 < 0)        entries.push(...ec(`CLOT-${annee}-E5-138N`, libRes, cptRes,  "138",  -solde138));
    if (impotResultat > 0)   entries.push(...ec(`CLOT-${annee}-E5-IMP`,  libRes, cptRes,  "891",   impotResultat));

    if (entries.length > 0) await db.insert(ecrituresComptablesTable).values(entries);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 5 — Balance d'ouverture (À-nouveaux exercice+1)
    //   Tous les comptes classes 1,2,3,4,5 avec solde non nul
    //   Solde débiteur  → DEBIT compte  / CREDIT "ANOUV"
    //   Solde créditeur → DEBIT "ANOUV" / CREDIT compte
    // ══════════════════════════════════════════════════════════════════════════
    const bilanQ = await db.execute(sql`
      SELECT compte, (SUM(td) - SUM(tc))::bigint AS solde
      FROM (
        SELECT compte_debit  AS compte, montant_fcfa AS td, 0 AS tc
        FROM   ecritures_comptables
        WHERE  cooperative_id = ${coop} AND exercice = ${annee}
          AND  LEFT(compte_debit, 1) IN ('1','2','3','4','5')
        UNION ALL
        SELECT compte_credit AS compte, 0 AS td, montant_fcfa AS tc
        FROM   ecritures_comptables
        WHERE  cooperative_id = ${coop} AND exercice = ${annee}
          AND  LEFT(compte_credit, 1) IN ('1','2','3','4','5')
      ) t
      GROUP  BY compte
      HAVING SUM(td) - SUM(tc) != 0
      ORDER  BY compte
    `);
    const aNouveaux: EntreeClot[] = [];
    for (const row of bilanQ.rows as { compte: string; solde: number }[]) {
      const s = Number(row.solde);
      if (s > 0)      aNouveaux.push(...ea(`AN-${annee + 1}`, `À-nouveau ${annee + 1}`, row.compte, "ANOUV", s));
      else if (s < 0) aNouveaux.push(...ea(`AN-${annee + 1}`, `À-nouveau ${annee + 1}`, "ANOUV", row.compte, -s));
    }
    if (aNouveaux.length > 0) await db.insert(ecrituresComptablesTable).values(aNouveaux);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 6 — Verrouillage exercice clôturé + ouverture exercice suivant
    // ══════════════════════════════════════════════════════════════════════════
    if (existing.length > 0) {
      await db.update(exercicesTable)
        .set({ statut: "cloture", dateCloture: new Date() })
        .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));
    } else {
      await db.insert(exercicesTable).values({ cooperativeId: coop, annee, statut: "cloture", dateCloture: new Date() });
    }
    const nextEx = await db.select().from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee + 1)));
    if (nextEx.length === 0)
      await db.insert(exercicesTable).values({ cooperativeId: coop, annee: annee + 1, statut: "ouvert" });

    res.json({
      message: `Exercice ${annee} clôturé avec succès`,
      exercice: annee,
      prochainExercice: annee + 1,
      alertes,
      soldes: {
        exploitation: solde135,
        financier:    solde136,
        rao:          solde137,
        rhao:         solde138,
        avantImpot:   resAvantImpot,
        impot:        impotResultat,
        net:          resultatNet,
      },
      compteResultat: cptRes,
      ecrituresGenerees: phase2.length + phase3.length + entries.length + aNouveaux.length,
      detailEcritures: {
        amortissements:  phase2.length,
        variationStocks: phase3.length,
        cloture:         entries.length,
        aNouveaux:       aNouveaux.length,
      },
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

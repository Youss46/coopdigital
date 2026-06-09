import { type Request, type Response } from "express";
import { db, intrantsTable, categoriesIntrantsTable, distributionsIntrantsTable, approvisionnmentsIntrantsTable, remboursementsIntrantsTable, membresTable, campagnesTable } from "@workspace/db";
import { eq, and, sql, lt, desc, asc, gte } from "drizzle-orm";
import { CampagneFermeeError, assertCampagneOuverte } from "../lib/campagneGuard";
import { getEncoursMembre } from "../services/intrantsService";

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

// ─── CATALOGUE ────────────────────────────────────────────────────────────────

export async function listIntrants(req: Request, res: Response): Promise<void> {
  try {
    const actifSeulement = req.query["actif"] !== "false";

    const rows = await db
      .select({
        id: intrantsTable.id,
        cooperativeId: intrantsTable.cooperativeId,
        categorieId: intrantsTable.categorieId,
        categorieLibelle: categoriesIntrantsTable.libelle,
        nom: intrantsTable.nom,
        description: intrantsTable.description,
        unite: intrantsTable.unite,
        prixUnitaireFcfa: intrantsTable.prixUnitaireFcfa,
        stockActuel: intrantsTable.stockActuel,
        stockMinimum: intrantsTable.stockMinimum,
        fournisseurIntrant: intrantsTable.fournisseurIntrant,
        datePeremption: intrantsTable.datePeremption,
        actif: intrantsTable.actif,
        createdAt: intrantsTable.createdAt,
        updatedAt: intrantsTable.updatedAt,
      })
      .from(intrantsTable)
      .leftJoin(categoriesIntrantsTable, eq(intrantsTable.categorieId, categoriesIntrantsTable.id))
      .where(
        and(
          eq(intrantsTable.cooperativeId, coopId(req)),
          actifSeulement ? eq(intrantsTable.actif, true) : undefined
        )
      )
      .orderBy(asc(intrantsTable.nom));

    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur listIntrants");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getIntrantById(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const [row] = await db
      .select()
      .from(intrantsTable)
      .where(and(eq(intrantsTable.id, id), eq(intrantsTable.cooperativeId, coopId(req))))
      .limit(1);

    if (!row) { res.status(404).json({ erreur: "Intrant introuvable" }); return; }
    res.json(row);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getIntrantById");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createIntrant(req: Request, res: Response): Promise<void> {
  try {
    const { nom, description, unite, prixUnitaireFcfa, stockMinimum, fournisseurIntrant, datePeremption, categorieId } = req.body as Record<string, unknown>;

    if (!nom || !unite) {
      res.status(400).json({ erreur: "nom et unite sont obligatoires" });
      return;
    }

    const [intrant] = await db
      .insert(intrantsTable)
      .values({
        cooperativeId: coopId(req),
        nom: String(nom),
        description: description ? String(description) : null,
        unite: String(unite),
        prixUnitaireFcfa: String(prixUnitaireFcfa ?? 0),
        stockMinimum: String(stockMinimum ?? 0),
        fournisseurIntrant: fournisseurIntrant ? String(fournisseurIntrant) : null,
        datePeremption: datePeremption ? String(datePeremption) : null,
        categorieId: categorieId ? Number(categorieId) : null,
      })
      .returning();

    res.status(201).json(intrant);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur createIntrant");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function updateIntrant(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { nom, description, unite, prixUnitaireFcfa, stockMinimum, fournisseurIntrant, datePeremption, categorieId, actif } = req.body as Record<string, unknown>;

    const [updated] = await db
      .update(intrantsTable)
      .set({
        nom: nom ? String(nom) : undefined,
        description: description !== undefined ? (description ? String(description) : null) : undefined,
        unite: unite ? String(unite) : undefined,
        prixUnitaireFcfa: prixUnitaireFcfa !== undefined ? String(prixUnitaireFcfa) : undefined,
        stockMinimum: stockMinimum !== undefined ? String(stockMinimum) : undefined,
        fournisseurIntrant: fournisseurIntrant !== undefined ? (fournisseurIntrant ? String(fournisseurIntrant) : null) : undefined,
        datePeremption: datePeremption !== undefined ? (datePeremption ? String(datePeremption) : null) : undefined,
        categorieId: categorieId !== undefined ? (categorieId ? Number(categorieId) : null) : undefined,
        actif: actif !== undefined ? Boolean(actif) : undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(intrantsTable.id, id), eq(intrantsTable.cooperativeId, coopId(req))))
      .returning();

    if (!updated) { res.status(404).json({ erreur: "Intrant introuvable" }); return; }
    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur updateIntrant");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getStockAlertes(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db
      .select({
        id: intrantsTable.id,
        nom: intrantsTable.nom,
        unite: intrantsTable.unite,
        stockActuel: intrantsTable.stockActuel,
        stockMinimum: intrantsTable.stockMinimum,
        prixUnitaireFcfa: intrantsTable.prixUnitaireFcfa,
      })
      .from(intrantsTable)
      .where(
        and(
          eq(intrantsTable.cooperativeId, coopId(req)),
          eq(intrantsTable.actif, true),
          sql`stock_actuel < stock_minimum`
        )
      )
      .orderBy(asc(intrantsTable.nom));

    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getStockAlertes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── CATÉGORIES ───────────────────────────────────────────────────────────────

export async function listCategories(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(categoriesIntrantsTable)
      .where(eq(categoriesIntrantsTable.cooperativeId, coopId(req)))
      .orderBy(asc(categoriesIntrantsTable.libelle));
    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur listCategories");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── APPROVISIONNEMENT ────────────────────────────────────────────────────────

export async function createAppro(req: Request, res: Response): Promise<void> {
  try {
    const { intrantId, campagneId, dateAppro, quantite, prixUnitaireFcfa, fournisseur, numeroFacture } = req.body as Record<string, unknown>;

    if (!intrantId || !quantite || !prixUnitaireFcfa || !dateAppro) {
      res.status(400).json({ erreur: "intrantId, quantite, prixUnitaireFcfa, dateAppro requis" });
      return;
    }

    const qte = parseFloat(String(quantite));
    const pu = parseFloat(String(prixUnitaireFcfa));
    const montantTotal = qte * pu;

    if (campagneId) {
      const [cs] = await db.select({ statut: campagnesTable.statut })
        .from(campagnesTable)
        .where(and(eq(campagnesTable.id, Number(campagneId)), eq(campagnesTable.cooperativeId, coopId(req))))
        .limit(1);
      if (cs?.statut === "fermee") throw new CampagneFermeeError();
    }

    const result = await db.transaction(async (tx) => {
      const [appro] = await tx
        .insert(approvisionnmentsIntrantsTable)
        .values({
          cooperativeId: coopId(req),
          intrantId: Number(intrantId),
          campagneId: campagneId ? Number(campagneId) : null,
          dateAppro: String(dateAppro),
          quantite: String(qte),
          prixUnitaireFcfa: String(pu),
          montantTotalFcfa: String(montantTotal),
          fournisseur: fournisseur ? String(fournisseur) : null,
          numeroFacture: numeroFacture ? String(numeroFacture) : null,
        })
        .returning();

      // Mise à jour stock
      await tx
        .update(intrantsTable)
        .set({ stockActuel: sql`stock_actuel + ${String(qte)}`, updatedAt: new Date() })
        .where(eq(intrantsTable.id, Number(intrantId)));

      return appro;
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    if (err instanceof CampagneFermeeError) { res.status(err.status).json({ erreur: err.erreur }); return; }
    req.log.error({ err }, "Erreur createAppro");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── DISTRIBUTION ─────────────────────────────────────────────────────────────

export async function createDistribution(req: Request, res: Response): Promise<void> {
  try {
    const {
      intrantId, membreId, campagneId, dateDistribution,
      quantite, prixUnitaireFcfa, mode, tauxSubventionPct,
    } = req.body as Record<string, unknown>;

    if (!intrantId || !membreId || !quantite || !prixUnitaireFcfa || !dateDistribution) {
      res.status(400).json({ erreur: "Champs obligatoires manquants" });
      return;
    }

    const qte = parseFloat(String(quantite));
    const pu = parseFloat(String(prixUnitaireFcfa));
    const modeVal = String(mode ?? "credit") as "credit" | "gratuit" | "subventionne";
    const taux = parseFloat(String(tauxSubventionPct ?? 0));
    const montantTotal = qte * pu;

    let montantMembre = montantTotal;
    if (modeVal === "gratuit") montantMembre = 0;
    else if (modeVal === "subventionne") montantMembre = montantTotal * (1 - taux / 100);

    if (campagneId) {
      const [cs] = await db.select({ statut: campagnesTable.statut })
        .from(campagnesTable)
        .where(and(eq(campagnesTable.id, Number(campagneId)), eq(campagnesTable.cooperativeId, coopId(req))))
        .limit(1);
      if (cs?.statut === "fermee") throw new CampagneFermeeError();
    }

    const result = await db.transaction(async (tx) => {
      // Vérifier stock disponible
      const [intrant] = await tx
        .select({ stock: intrantsTable.stockActuel })
        .from(intrantsTable)
        .where(eq(intrantsTable.id, Number(intrantId)))
        .limit(1);

      if (!intrant || parseFloat(String(intrant.stock)) < qte) {
        throw new Error("Stock insuffisant");
      }

      const [dist] = await tx
        .insert(distributionsIntrantsTable)
        .values({
          cooperativeId: coopId(req),
          intrantId: Number(intrantId),
          membreId: Number(membreId),
          campagneId: campagneId ? Number(campagneId) : null,
          dateDistribution: String(dateDistribution),
          quantite: String(qte),
          prixUnitaireFcfa: String(pu),
          montantFcfa: String(montantTotal),
          mode: modeVal,
          tauxSubventionPct: String(taux),
          montantMembreFcfa: String(montantMembre),
          agentId: req.user?.id ?? null,
        })
        .returning();

      // Décrémenter stock
      await tx
        .update(intrantsTable)
        .set({ stockActuel: sql`stock_actuel - ${String(qte)}`, updatedAt: new Date() })
        .where(eq(intrantsTable.id, Number(intrantId)));

      return dist;
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof CampagneFermeeError) { res.status(err.status).json({ erreur: err.erreur }); return; }
    if (err instanceof Error && err.message === "Stock insuffisant") {
      res.status(409).json({ erreur: "Stock insuffisant pour cette distribution" });
      return;
    }
    req.log.error({ err }, "Erreur createDistribution");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getDistributionsMembre(req: Request, res: Response): Promise<void> {
  try {
    const membreId = parseInt(String(req.params["id"] ?? "0"));

    const rows = await db
      .select({
        id: distributionsIntrantsTable.id,
        intrantId: distributionsIntrantsTable.intrantId,
        intrantNom: intrantsTable.nom,
        intrantUnite: intrantsTable.unite,
        dateDistribution: distributionsIntrantsTable.dateDistribution,
        quantite: distributionsIntrantsTable.quantite,
        prixUnitaireFcfa: distributionsIntrantsTable.prixUnitaireFcfa,
        montantFcfa: distributionsIntrantsTable.montantFcfa,
        mode: distributionsIntrantsTable.mode,
        tauxSubventionPct: distributionsIntrantsTable.tauxSubventionPct,
        montantMembreFcfa: distributionsIntrantsTable.montantMembreFcfa,
        statutRemboursement: distributionsIntrantsTable.statutRemboursement,
        montantRembourse_fcfa: distributionsIntrantsTable.montantRembourse_fcfa,
        createdAt: distributionsIntrantsTable.createdAt,
      })
      .from(distributionsIntrantsTable)
      .leftJoin(intrantsTable, eq(distributionsIntrantsTable.intrantId, intrantsTable.id))
      .where(
        and(
          eq(distributionsIntrantsTable.membreId, membreId),
          eq(distributionsIntrantsTable.cooperativeId, coopId(req))
        )
      )
      .orderBy(desc(distributionsIntrantsTable.dateDistribution));

    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getDistributionsMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── ENCOURS ─────────────────────────────────────────────────────────────────

export async function getEncours(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db
      .select({
        membreId: distributionsIntrantsTable.membreId,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        membreTelephone: membresTable.telephone,
        totalDu: sql<string>`SUM(montant_membre_fcfa)`,
        totalRembourse: sql<string>`SUM(montant_rembourse_fcfa)`,
        soldeDu: sql<string>`SUM(montant_membre_fcfa - montant_rembourse_fcfa)`,
        derniereDistribution: sql<string>`MAX(date_distribution)`,
        nbDistributions: sql<string>`COUNT(*)`,
      })
      .from(distributionsIntrantsTable)
      .leftJoin(membresTable, eq(distributionsIntrantsTable.membreId, membresTable.id))
      .where(
        and(
          eq(distributionsIntrantsTable.cooperativeId, coopId(req)),
          sql`statut_remboursement != 'rembourse'`,
          sql`montant_membre_fcfa > montant_rembourse_fcfa`
        )
      )
      .groupBy(
        distributionsIntrantsTable.membreId,
        membresTable.nom,
        membresTable.prenoms,
        membresTable.telephone
      )
      .orderBy(desc(sql`SUM(montant_membre_fcfa - montant_rembourse_fcfa)`));

    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getEncours");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── REMBOURSEMENT MANUEL ─────────────────────────────────────────────────────

export async function remboursementManuel(req: Request, res: Response): Promise<void> {
  try {
    const { distributionId, montantFcfa, mode, dateRemboursement } = req.body as Record<string, unknown>;

    if (!distributionId || !montantFcfa || !mode) {
      res.status(400).json({ erreur: "distributionId, montantFcfa, mode requis" });
      return;
    }

    const modeVal = String(mode) as "deduction_livraison" | "especes" | "mobile";
    const montant = parseFloat(String(montantFcfa));
    const dateStr = dateRemboursement ? String(dateRemboursement) : new Date().toISOString().split("T")[0]!;

    const result = await db.transaction(async (tx) => {
      const [dist] = await tx
        .select()
        .from(distributionsIntrantsTable)
        .where(eq(distributionsIntrantsTable.id, Number(distributionId)))
        .limit(1);

      if (!dist) throw new Error("Distribution introuvable");

      const solde = parseFloat(String(dist.montantMembreFcfa)) - parseFloat(String(dist.montantRembourse_fcfa));
      const remb = Math.min(solde, montant);
      const nouveauRembourse = parseFloat(String(dist.montantRembourse_fcfa)) + remb;
      const nouveauStatut = nouveauRembourse >= parseFloat(String(dist.montantMembreFcfa)) - 0.01
        ? "rembourse" : nouveauRembourse > 0 ? "partiel" : "non_rembourse";

      await tx
        .update(distributionsIntrantsTable)
        .set({
          montantRembourse_fcfa: String(nouveauRembourse),
          statutRemboursement: nouveauStatut as "rembourse" | "partiel" | "non_rembourse",
        })
        .where(eq(distributionsIntrantsTable.id, Number(distributionId)));

      const [remboursement] = await tx
        .insert(remboursementsIntrantsTable)
        .values({
          distributionId: Number(distributionId),
          membreId: dist.membreId,
          dateRemboursement: dateStr,
          montantFcfa: String(remb),
          mode: modeVal,
        })
        .returning();

      return remboursement;
    });

    res.status(201).json(result);
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "Distribution introuvable") {
      res.status(404).json({ erreur: "Distribution introuvable" });
      return;
    }
    req.log.error({ err }, "Erreur remboursementManuel");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── RAPPORT CAMPAGNE ─────────────────────────────────────────────────────────

export async function getRapportCampagne(req: Request, res: Response): Promise<void> {
  try {
    const campagneId = req.query["campagne_id"] ? parseInt(String(req.query["campagne_id"])) : null;

    const where = and(
      eq(distributionsIntrantsTable.cooperativeId, coopId(req)),
      campagneId ? eq(distributionsIntrantsTable.campagneId, campagneId) : undefined
    );

    const parIntrant = await db
      .select({
        intrantId: distributionsIntrantsTable.intrantId,
        intrantNom: intrantsTable.nom,
        intrantUnite: intrantsTable.unite,
        totalQuantite: sql<string>`SUM(quantite)`,
        totalValeur: sql<string>`SUM(montant_membre_fcfa)`,
        totalRembourse: sql<string>`SUM(montant_rembourse_fcfa)`,
        nbDistributions: sql<string>`COUNT(*)`,
      })
      .from(distributionsIntrantsTable)
      .leftJoin(intrantsTable, eq(distributionsIntrantsTable.intrantId, intrantsTable.id))
      .where(where)
      .groupBy(distributionsIntrantsTable.intrantId, intrantsTable.nom, intrantsTable.unite)
      .orderBy(desc(sql`SUM(montant_membre_fcfa)`));

    const [totaux] = await db
      .select({
        totalDu: sql<string>`SUM(montant_membre_fcfa)`,
        totalRembourse: sql<string>`SUM(montant_rembourse_fcfa)`,
        nbDistributions: sql<string>`COUNT(*)`,
        nbMembres: sql<string>`COUNT(DISTINCT membre_id)`,
      })
      .from(distributionsIntrantsTable)
      .where(where);

    const totalDu = parseFloat(totaux?.totalDu ?? "0");
    const totalRembourse = parseFloat(totaux?.totalRembourse ?? "0");
    const tauxRecouvrement = totalDu > 0 ? Math.round((totalRembourse / totalDu) * 100) : 0;

    const top10 = await db
      .select({
        membreId: distributionsIntrantsTable.membreId,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        totalRecu: sql<string>`SUM(montant_membre_fcfa)`,
      })
      .from(distributionsIntrantsTable)
      .leftJoin(membresTable, eq(distributionsIntrantsTable.membreId, membresTable.id))
      .where(where)
      .groupBy(distributionsIntrantsTable.membreId, membresTable.nom, membresTable.prenoms)
      .orderBy(desc(sql`SUM(montant_membre_fcfa)`))
      .limit(10);

    res.json({
      parIntrant,
      totaux: {
        totalDu,
        totalRembourse,
        tauxRecouvrement,
        nbDistributions: parseInt(totaux?.nbDistributions ?? "0"),
        nbMembres: parseInt(totaux?.nbMembres ?? "0"),
      },
      top10,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getRapportCampagne");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getEncoursMemberApi(req: Request, res: Response): Promise<void> {
  try {
    const membreId = parseInt(String(req.params["id"] ?? "0"));
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const encours = await getEncoursMembre(cooperativeId, membreId);
    res.json({ membreId, encoursFcfa: encours });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getEncoursMemberApi");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

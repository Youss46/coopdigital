import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  budgetsCampagneTable, lignesBudgetTable, hypothesesBudgetTable, campagnesTable,
} from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";
import { syncRealise, getAlertesDepassement } from "../services/budgetService";

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

const LIGNES_DEFAULT = [
  { categorie: "recette"            as const, libelle: "Ventes cacao exportateurs",     ordre: 1 },
  { categorie: "recette"            as const, libelle: "Subventions reçues",             ordre: 2 },
  { categorie: "charge_achat"       as const, libelle: "Achats cacao producteurs",       ordre: 3 },
  { categorie: "charge_exploitation"as const, libelle: "Transport et collecte",           ordre: 4 },
  { categorie: "charge_exploitation"as const, libelle: "Main d'œuvre collecte",           ordre: 5 },
  { categorie: "charge_exploitation"as const, libelle: "Entretien & carburant",           ordre: 6 },
  { categorie: "charge_personnel"   as const, libelle: "Salaires bruts",                 ordre: 7 },
  { categorie: "charge_personnel"   as const, libelle: "Charges patronales",              ordre: 8 },
  { categorie: "charge_financiere"  as const, libelle: "Intérêts emprunts",              ordre: 9 },
  { categorie: "investissement"     as const, libelle: "Acquisitions matériel",          ordre: 10 },
];

// ─── Créer ou retourner un budget pour une campagne ──────────────────────────
export async function creerOuGetBudget(req: Request, res: Response): Promise<void> {
  try {
    const campagneId = parseInt(String(req.params["id"] ?? "0"));

    // Vérifie que la campagne appartient à la coop
    const [campagne] = await db
      .select()
      .from(campagnesTable)
      .where(and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, coopId(req))))
      .limit(1);

    if (!campagne) {
      res.status(404).json({ erreur: "Campagne introuvable" });
      return;
    }

    // Cherche un budget existant
    const [existing] = await db
      .select()
      .from(budgetsCampagneTable)
      .where(and(eq(budgetsCampagneTable.campagneId, campagneId), eq(budgetsCampagneTable.cooperativeId, coopId(req))))
      .limit(1);

    if (existing) {
      res.status(200).json({ budget: existing, cree: false });
      return;
    }

    // Crée le budget
    const [budget] = await db.insert(budgetsCampagneTable).values({
      cooperativeId: coopId(req),
      campagneId,
      statut: "brouillon",
    }).returning();

    // Crée les lignes par défaut
    await db.insert(lignesBudgetTable).values(
      LIGNES_DEFAULT.map((l) => ({ ...l, budgetId: budget!.id, montantPrevisionnelFcfa: "0" }))
    );

    res.status(201).json({ budget, cree: true });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur creerOuGetBudget");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── GET budget complet (lignes + hypothèses + totaux) ───────────────────────
export async function getBudgetCampagne(req: Request, res: Response): Promise<void> {
  try {
    const campagneId = parseInt(String(req.params["id"] ?? "0"));

    const [budget] = await db
      .select()
      .from(budgetsCampagneTable)
      .where(and(eq(budgetsCampagneTable.campagneId, campagneId), eq(budgetsCampagneTable.cooperativeId, coopId(req))))
      .limit(1);

    if (!budget) {
      res.status(404).json({ erreur: "Aucun budget pour cette campagne" });
      return;
    }

    const lignes = await db
      .select()
      .from(lignesBudgetTable)
      .where(eq(lignesBudgetTable.budgetId, budget.id))
      .orderBy(asc(lignesBudgetTable.ordre));

    const [hypotheses] = await db
      .select()
      .from(hypothesesBudgetTable)
      .where(eq(hypothesesBudgetTable.budgetId, budget.id))
      .limit(1);

    // Calcul des totaux par catégorie + résultat
    const totaux: Record<string, { previsionnel: number; realise: number }> = {};
    for (const l of lignes) {
      const cat = l.categorie;
      if (!totaux[cat]) totaux[cat] = { previsionnel: 0, realise: 0 };
      totaux[cat]!.previsionnel += parseFloat(l.montantPrevisionnelFcfa ?? "0");
      totaux[cat]!.realise      += parseFloat(l.montantRealiseFcfa      ?? "0");
    }

    const totalRecettesPrev = totaux["recette"]?.previsionnel ?? 0;
    const totalChargesPrev  = Object.entries(totaux)
      .filter(([k]) => k !== "recette")
      .reduce((s, [, v]) => s + v.previsionnel, 0);
    const totalRecettesReal = totaux["recette"]?.realise ?? 0;
    const totalChargesReal  = Object.entries(totaux)
      .filter(([k]) => k !== "recette")
      .reduce((s, [, v]) => s + v.realise, 0);

    res.json({
      budget,
      lignes,
      hypotheses: hypotheses ?? null,
      totaux,
      resultat: {
        previsionnel: totalRecettesPrev - totalChargesPrev,
        realise:      totalRecettesReal - totalChargesReal,
      },
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getBudgetCampagne");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Modifier une ligne ───────────────────────────────────────────────────────
export async function modifierLigne(req: Request, res: Response): Promise<void> {
  try {
    const budgetId = parseInt(String(req.params["id"] ?? "0"));
    const { ligneId, montantPrevisionnelFcfa, libelle, ordre } = req.body as {
      ligneId: number; montantPrevisionnelFcfa?: number; libelle?: string; ordre?: number;
    };

    if (!ligneId) {
      res.status(400).json({ erreur: "ligneId requis" });
      return;
    }

    const updates: Record<string, unknown> = {};
    if (montantPrevisionnelFcfa !== undefined) updates["montantPrevisionnelFcfa"] = String(montantPrevisionnelFcfa);
    if (libelle !== undefined) updates["libelle"] = libelle;
    if (ordre !== undefined)   updates["ordre"]   = ordre;

    const [updated] = await db
      .update(lignesBudgetTable)
      .set(updates)
      .where(and(eq(lignesBudgetTable.id, ligneId), eq(lignesBudgetTable.budgetId, budgetId)))
      .returning();

    if (!updated) {
      res.status(404).json({ erreur: "Ligne introuvable" });
      return;
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur modifierLigne");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Valider le budget ────────────────────────────────────────────────────────
export async function validerBudget(req: Request, res: Response): Promise<void> {
  try {
    const budgetId = parseInt(String(req.params["id"] ?? "0"));
    const userId   = req.user?.id;

    const [updated] = await db
      .update(budgetsCampagneTable)
      .set({ statut: "valide", validePar: userId ?? null, dateValidation: new Date(), updatedAt: new Date() })
      .where(and(eq(budgetsCampagneTable.id, budgetId), eq(budgetsCampagneTable.cooperativeId, coopId(req))))
      .returning();

    if (!updated) {
      res.status(404).json({ erreur: "Budget introuvable" });
      return;
    }

    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur validerBudget");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Alertes dépassement ─────────────────────────────────────────────────────
export async function getAlertes(req: Request, res: Response): Promise<void> {
  try {
    const budgetId = parseInt(String(req.params["id"] ?? "0"));
    const alertes  = await getAlertesDepassement(budgetId);
    res.json(alertes);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getAlertes");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Rapport budget vs réalisé ────────────────────────────────────────────────
export async function getRapport(req: Request, res: Response): Promise<void> {
  try {
    const budgetId = parseInt(String(req.params["id"] ?? "0"));

    // Sync avant rapport
    try { await syncRealise(budgetId); } catch { /* ignore si pas de données */ }

    const lignes = await db
      .select()
      .from(lignesBudgetTable)
      .where(eq(lignesBudgetTable.budgetId, budgetId))
      .orderBy(asc(lignesBudgetTable.ordre));

    // Grouper par catégorie
    const parCategorie: Record<string, {
      lignes: typeof lignes;
      totalPrev: number;
      totalReel: number;
      ecartPct: number;
    }> = {};

    for (const l of lignes) {
      if (!parCategorie[l.categorie]) {
        parCategorie[l.categorie] = { lignes: [], totalPrev: 0, totalReel: 0, ecartPct: 0 };
      }
      const cat = parCategorie[l.categorie]!;
      cat.lignes.push(l);
      cat.totalPrev += parseFloat(l.montantPrevisionnelFcfa ?? "0");
      cat.totalReel += parseFloat(l.montantRealiseFcfa      ?? "0");
    }

    for (const cat of Object.values(parCategorie)) {
      cat.ecartPct = cat.totalPrev > 0
        ? ((cat.totalReel - cat.totalPrev) / cat.totalPrev) * 100
        : 0;
    }

    // Exécution globale
    const totalPrev = lignes.reduce((s, l) => s + parseFloat(l.montantPrevisionnelFcfa ?? "0"), 0);
    const totalReel = lignes.reduce((s, l) => s + parseFloat(l.montantRealiseFcfa      ?? "0"), 0);
    const tauxExecution = totalPrev > 0 ? (totalReel / totalPrev) * 100 : 0;

    res.json({ parCategorie, totalPrev, totalReel, tauxExecution });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getRapport");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Hypothèses ───────────────────────────────────────────────────────────────
export async function saisirHypotheses(req: Request, res: Response): Promise<void> {
  try {
    const budgetId = parseInt(String(req.params["id"] ?? "0"));
    const {
      tonnagePrevisionnelKg, prixAchatMoyenFcfa, prixVenteMoyenFcfa,
      nbMembresActifs, nbLivraisonsEstimees,
    } = req.body as Record<string, number>;

    // Upsert
    const [existing] = await db
      .select()
      .from(hypothesesBudgetTable)
      .where(eq(hypothesesBudgetTable.budgetId, budgetId))
      .limit(1);

    const values = {
      budgetId,
      tonnagePrevisionnelKg:  tonnagePrevisionnelKg  ? String(tonnagePrevisionnelKg)  : null,
      prixAchatMoyenFcfa:     prixAchatMoyenFcfa     ? String(prixAchatMoyenFcfa)     : null,
      prixVenteMoyenFcfa:     prixVenteMoyenFcfa     ? String(prixVenteMoyenFcfa)     : null,
      nbMembresActifs:        nbMembresActifs         ?? null,
      nbLivraisonsEstimees:   nbLivraisonsEstimees    ?? null,
    };

    let result;
    if (existing) {
      [result] = await db
        .update(hypothesesBudgetTable)
        .set(values)
        .where(eq(hypothesesBudgetTable.id, existing.id))
        .returning();
    } else {
      [result] = await db
        .insert(hypothesesBudgetTable)
        .values(values)
        .returning();
    }

    res.json(result);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur saisirHypotheses");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Sync manuel réalisé ─────────────────────────────────────────────────────
export async function triggerSync(req: Request, res: Response): Promise<void> {
  try {
    const budgetId = parseInt(String(req.params["id"] ?? "0"));
    await syncRealise(budgetId);
    res.json({ ok: true, message: "Synchronisation réalisé effectuée" });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur triggerSync");
    res.status(500).json({ erreur: String(err) });
  }
}

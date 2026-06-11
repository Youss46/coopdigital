import { db } from "@workspace/db";
import {
  projetsInvestissementTable,
  depensesInvestissementTable,
} from "@workspace/db";
import { eq, and, sql, lt, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { proposerEcriture } from "./comptabiliteService";



// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateProjetInput {
  titre: string;
  description?: string;
  categorie: string;
  montantEstimeFcfa: number;
  sourceFinancement: string;
  empruntId?: number;
  subventionId?: number;
  dateDebutPrevue?: string;
  dateFinPrevue?: string;
  statut?: string;
  priorite?: string;
  responsableId?: number;
}

export interface UpdateProjetInput extends Partial<CreateProjetInput> {
  statut?: string;
  dateFinReelle?: string;
  montantEngageFcfa?: number;
}

export interface CreateDepenseInput {
  projetId: number;
  dateDepense: string;
  libelle: string;
  montantFcfa: number;
  fournisseur?: string;
  referenceFacture?: string;
  factureUrl?: string;
  equipementId?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toInt(v: unknown): number {
  return Math.round(Number(v ?? 0));
}

// ─── Projets ──────────────────────────────────────────────────────────────────

export async function listProjets(cooperativeId: number, statut?: string, categorie?: string) {
  const rows = await db
    .select({
      id:                  projetsInvestissementTable.id,
      titre:               projetsInvestissementTable.titre,
      description:         projetsInvestissementTable.description,
      categorie:           projetsInvestissementTable.categorie,
      montantEstimeFcfa:   projetsInvestissementTable.montantEstimeFcfa,
      montantEngageFcfa:   projetsInvestissementTable.montantEngageFcfa,
      montantRealiseFcfa:  projetsInvestissementTable.montantRealiseFcfa,
      sourceFinancement:   projetsInvestissementTable.sourceFinancement,
      empruntId:           projetsInvestissementTable.empruntId,
      subventionId:        projetsInvestissementTable.subventionId,
      dateDebutPrevue:     projetsInvestissementTable.dateDebutPrevue,
      dateFinPrevue:       projetsInvestissementTable.dateFinPrevue,
      dateFinReelle:       projetsInvestissementTable.dateFinReelle,
      statut:              projetsInvestissementTable.statut,
      priorite:            projetsInvestissementTable.priorite,
      responsableId:       projetsInvestissementTable.responsableId,
      createdAt:           projetsInvestissementTable.createdAt,
      updatedAt:           projetsInvestissementTable.updatedAt,
    })
    .from(projetsInvestissementTable)
    .where(
      and(
        eq(projetsInvestissementTable.cooperativeId, cooperativeId),
        statut    ? eq(projetsInvestissementTable.statut,    statut)    : undefined,
        categorie ? eq(projetsInvestissementTable.categorie, categorie) : undefined,
      )
    )
    .orderBy(desc(projetsInvestissementTable.createdAt));

  return rows.map((r) => ({
    ...r,
    montantEstimeFcfa:  toInt(r.montantEstimeFcfa),
    montantEngageFcfa:  toInt(r.montantEngageFcfa),
    montantRealiseFcfa: toInt(r.montantRealiseFcfa),
    tauxExecutionPct:   r.montantEstimeFcfa
      ? Math.round((toInt(r.montantRealiseFcfa) / toInt(r.montantEstimeFcfa)) * 100)
      : 0,
  }));
}

export async function getProjet(cooperativeId: number, id: number) {
  const [projet] = await db
    .select()
    .from(projetsInvestissementTable)
    .where(
      and(
        eq(projetsInvestissementTable.id, id),
        eq(projetsInvestissementTable.cooperativeId, cooperativeId)
      )
    )
    .limit(1);
  if (!projet) return null;

  const depenses = await db
    .select()
    .from(depensesInvestissementTable)
    .where(eq(depensesInvestissementTable.projetId, id))
    .orderBy(desc(depensesInvestissementTable.dateDepense));

  return {
    ...projet,
    montantEstimeFcfa:  toInt(projet.montantEstimeFcfa),
    montantEngageFcfa:  toInt(projet.montantEngageFcfa),
    montantRealiseFcfa: toInt(projet.montantRealiseFcfa),
    tauxExecutionPct:   projet.montantEstimeFcfa
      ? Math.round((toInt(projet.montantRealiseFcfa) / toInt(projet.montantEstimeFcfa)) * 100)
      : 0,
    depenses: depenses.map((d) => ({
      ...d,
      montantFcfa: toInt(d.montantFcfa),
    })),
  };
}

export async function createProjet(cooperativeId: number, data: CreateProjetInput) {
  const [projet] = await db
    .insert(projetsInvestissementTable)
    .values({
      cooperativeId:    cooperativeId,
      titre:            data.titre,
      description:      data.description,
      categorie:        data.categorie,
      montantEstimeFcfa: String(data.montantEstimeFcfa),
      sourceFinancement: data.sourceFinancement,
      empruntId:         data.empruntId ?? null,
      subventionId:      data.subventionId ?? null,
      dateDebutPrevue:   data.dateDebutPrevue ?? null,
      dateFinPrevue:     data.dateFinPrevue ?? null,
      statut:            data.statut ?? "planifie",
      priorite:          data.priorite ?? "normale",
      responsableId:     data.responsableId ?? null,
    })
    .returning();
  return projet;
}

export async function updateProjet(cooperativeId: number, id: number, data: UpdateProjetInput) {
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };
  if (data.titre             !== undefined) updates.titre             = data.titre;
  if (data.description       !== undefined) updates.description       = data.description;
  if (data.categorie         !== undefined) updates.categorie         = data.categorie;
  if (data.montantEstimeFcfa !== undefined) updates.montantEstimeFcfa = String(data.montantEstimeFcfa);
  if (data.montantEngageFcfa !== undefined) updates.montantEngageFcfa = String(data.montantEngageFcfa);
  if (data.sourceFinancement !== undefined) updates.sourceFinancement = data.sourceFinancement;
  if (data.empruntId         !== undefined) updates.empruntId         = data.empruntId;
  if (data.subventionId      !== undefined) updates.subventionId      = data.subventionId;
  if (data.dateDebutPrevue   !== undefined) updates.dateDebutPrevue   = data.dateDebutPrevue;
  if (data.dateFinPrevue     !== undefined) updates.dateFinPrevue     = data.dateFinPrevue;
  if (data.dateFinReelle     !== undefined) updates.dateFinReelle      = data.dateFinReelle;
  if (data.statut            !== undefined) updates.statut            = data.statut;
  if (data.priorite          !== undefined) updates.priorite          = data.priorite;
  if (data.responsableId     !== undefined) updates.responsableId     = data.responsableId;

  const [updated] = await db
    .update(projetsInvestissementTable)
    .set(updates)
    .where(
      and(
        eq(projetsInvestissementTable.id, id),
        eq(projetsInvestissementTable.cooperativeId, cooperativeId)
      )
    )
    .returning();
  return updated ?? null;
}

export async function deleteProjet(cooperativeId: number, id: number) {
  const [deleted] = await db
    .delete(projetsInvestissementTable)
    .where(
      and(
        eq(projetsInvestissementTable.id, id),
        eq(projetsInvestissementTable.cooperativeId, cooperativeId)
      )
    )
    .returning({ id: projetsInvestissementTable.id });
  return !!deleted;
}

// ─── Dépenses ─────────────────────────────────────────────────────────────────

// Mappe la catégorie d'un projet au compte d'immobilisation SYSCOHADA
function compteImmoFromCategorie(categorie: string): string {
  const cat = (categorie ?? "").toLowerCase();
  if (cat.includes("vehicule") || cat.includes("transport"))          return "245"; // Matériel de transport
  if (cat.includes("batiment") || cat.includes("construction") ||
      cat.includes("infrastructure"))                                  return "231"; // Bâtiments industriels
  if (cat.includes("terrain") || cat.includes("foncier"))             return "221"; // Terrains agricoles
  if (cat.includes("incorporel") || cat.includes("logiciel") ||
      cat.includes("brevet"))                                          return "212"; // Logiciels et licences
  return "244"; // Matériel et mobilier (défaut)
}

export async function ajouterDepense(cooperativeId: number, data: CreateDepenseInput) {
  let projetCategorie = "";

  const result = await db.transaction(async (tx) => {
    const [projet] = await tx
      .select({
        id:        projetsInvestissementTable.id,
        statut:    projetsInvestissementTable.statut,
        categorie: projetsInvestissementTable.categorie,
      })
      .from(projetsInvestissementTable)
      .where(
        and(
          eq(projetsInvestissementTable.id, data.projetId),
          eq(projetsInvestissementTable.cooperativeId, cooperativeId)
        )
      )
      .limit(1)
      .for("update");

    if (!projet) throw new Error("Projet introuvable");
    if (projet.statut === "annule" || projet.statut === "termine") {
      throw new Error(`Impossible d'ajouter une dépense sur un projet ${projet.statut}`);
    }
    projetCategorie = projet.categorie ?? "";

    const [depense] = await tx
      .insert(depensesInvestissementTable)
      .values({
        projetId:         data.projetId,
        cooperativeId:    cooperativeId,
        dateDepense:      data.dateDepense,
        libelle:          data.libelle,
        montantFcfa:      String(data.montantFcfa),
        fournisseur:      data.fournisseur ?? null,
        referenceFacture: data.referenceFacture ?? null,
        factureUrl:       data.factureUrl ?? null,
        equipementId:     data.equipementId ?? null,
      })
      .returning();

    await tx
      .update(projetsInvestissementTable)
      .set({
        montantRealiseFcfa: sql`montant_realise_fcfa + ${data.montantFcfa}`,
        updatedAt:          new Date(),
      })
      .where(eq(projetsInvestissementTable.id, data.projetId));

    return { ...depense, montantFcfa: toInt(depense.montantFcfa) };
  });

  // Écriture comptable : dépense investissement → 2xx Immobilisation / 481 Fournisseurs invest. (ou 521 Banque)
  if (data.montantFcfa > 0) {
    void proposerEcriture(cooperativeId, {
      source: "paiement",
      sourceId: result.id,
      libelle: `Dépense projet – ${data.libelle}`,
      compteDebit:  compteImmoFromCategorie(projetCategorie),
      compteCredit: data.referenceFacture ? "481" : "521",
      montantFcfa:  data.montantFcfa,
      date:         data.dateDepense,
      numeroPiece:  data.referenceFacture ?? `INV-${result.id}`,
    });
  }

  return result;
}

// ─── Tableau de bord ──────────────────────────────────────────────────────────

export async function getTableauBord(cooperativeId: number) {
  const today = new Date().toISOString().slice(0, 10);

  const statsRes = await db.execute<{
    nb_projets:    string;
    total_estime:  string;
    total_realise: string;
  }>(sql`
    SELECT
      COUNT(*)::text                           AS nb_projets,
      COALESCE(SUM(montant_estime_fcfa),  0)::text AS total_estime,
      COALESCE(SUM(montant_realise_fcfa), 0)::text AS total_realise
    FROM projets_investissement
    WHERE cooperative_id = ${cooperativeId}
      AND statut NOT IN ('annule')
  `);
  const stats = statsRes.rows[0];

  const retardRes = await db.execute<{ projets_en_retard: string }>(sql`
    SELECT COUNT(*)::text AS projets_en_retard
    FROM projets_investissement
    WHERE cooperative_id = ${cooperativeId}
      AND statut IN ('planifie','en_cours')
      AND date_fin_prevue IS NOT NULL
      AND date_fin_prevue < ${today}
  `);
  const retard = retardRes.rows[0];

  const parStatutRes = await db.execute<{ statut: string; nb: string }>(sql`
    SELECT statut, COUNT(*)::text AS nb
    FROM projets_investissement
    WHERE cooperative_id = ${cooperativeId}
    GROUP BY statut
  `);

  const parCategorieRes = await db.execute<{ categorie: string; nb: string; total: string }>(sql`
    SELECT
      categorie,
      COUNT(*)::text                              AS nb,
      COALESCE(SUM(montant_estime_fcfa), 0)::text AS total
    FROM projets_investissement
    WHERE cooperative_id = ${cooperativeId}
      AND statut NOT IN ('annule')
    GROUP BY categorie
  `);

  const nbProjets    = toInt(stats?.nb_projets ?? 0);
  const totalEstime  = toInt(stats?.total_estime ?? 0);
  const totalRealise = toInt(stats?.total_realise ?? 0);

  return {
    nb_projets:         nbProjets,
    total_estime:       totalEstime,
    total_realise:      totalRealise,
    taux_execution_pct: totalEstime > 0 ? Math.round((totalRealise / totalEstime) * 100) : 0,
    projets_en_retard:  toInt(retard?.projets_en_retard ?? 0),
    par_statut:         parStatutRes.rows.map((r) => ({ statut: r.statut, nb: toInt(r.nb) })),
    par_categorie:      parCategorieRes.rows.map((r) => ({
      categorie: r.categorie,
      nb:        toInt(r.nb),
      total:     toInt(r.total),
    })),
  };
}

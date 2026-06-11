import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  traitementsRefusTable,
  ventesExportateursTable,
  mouvementsStockTable,
  exportateursTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { proposerEcriture } from "../services/comptabiliteService";

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

export async function listRefus(req: Request, res: Response) {
  const { statut } = req.query as { statut?: string };

  const rows = await db
    .select({
      refus: traitementsRefusTable,
      vente: {
        exportateurId: ventesExportateursTable.exportateurId,
        dateVente: ventesExportateursTable.dateVente,
        produit: ventesExportateursTable.produit,
        nombreSacsRefoules: ventesExportateursTable.nombreSacsRefoules,
        numeroBonSortie: ventesExportateursTable.numeroBonSortie,
      },
    })
    .from(traitementsRefusTable)
    .leftJoin(
      ventesExportateursTable,
      eq(traitementsRefusTable.venteExportateurId, ventesExportateursTable.id)
    )
    .where(
      and(
        eq(traitementsRefusTable.cooperativeId, coopId(req)),
        statut ? eq(traitementsRefusTable.statut, statut as "en_attente" | "traite") : undefined
      )
    )
    .orderBy(desc(traitementsRefusTable.createdAt));

  return res.json(rows);
}

export async function getStatsRefus(req: Request, res: Response) {
  const stats = await db
    .select({
      totalRefulesKg: sql<string>`COALESCE(SUM(poids_refoule_kg), 0)`,
      totalTraitesKg: sql<string>`COALESCE(SUM(CASE WHEN statut='traite' THEN poids_refoule_kg ELSE 0 END), 0)`,
      totalEnAttenteKg: sql<string>`COALESCE(SUM(CASE WHEN statut='en_attente' THEN poids_refoule_kg ELSE 0 END), 0)`,
      nbEnAttente: sql<number>`COUNT(CASE WHEN statut='en_attente' THEN 1 END)`,
      nbTraites: sql<number>`COUNT(CASE WHEN statut='traite' THEN 1 END)`,
    })
    .from(traitementsRefusTable)
    .where(eq(traitementsRefusTable.cooperativeId, coopId(req)));

  return res.json(stats[0]);
}

export async function traiterRefus(req: Request, res: Response) {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const userId = req.user?.id;

  const {
    decision,
    entrepotRetourId,
    ancienGrade,
    nouveauGrade,
    prixUnitaireNouveauFcfa,
    motifPerte,
    pvConstat,
    tauxHumidite,
    // Autre acheteur
    acheteurId,
    nomNouvelAcheteur,
    telNouvelAcheteur,
    dateVenteRefus,
    modeReglement,
    dateEcheanceRefus,
  } = req.body as {
    decision: "retour_stock" | "declassement" | "autre_acheteur" | "perte";
    entrepotRetourId?: number;
    ancienGrade?: string;
    nouveauGrade?: string;
    prixUnitaireNouveauFcfa?: number;
    motifPerte?: string;
    pvConstat?: boolean;
    tauxHumidite?: number;
    acheteurId?: number;
    nomNouvelAcheteur?: string;
    telNouvelAcheteur?: string;
    dateVenteRefus?: string;
    modeReglement?: "immediat" | "credit";
    dateEcheanceRefus?: string;
  };

  if (!decision) return res.status(400).json({ erreur: "Décision requise" });

  const cooperativeId = coopId(req);

  const refus = await db.query.traitementsRefusTable.findFirst({
    where: and(
      eq(traitementsRefusTable.id, id),
      eq(traitementsRefusTable.cooperativeId, cooperativeId)
    ),
  });

  if (!refus) return res.status(404).json({ erreur: "Refus introuvable" });
  if (refus.statut === "traite") return res.status(400).json({ erreur: "Déjà traité" });

  let exportateurIdFinal: number | undefined;

  await db.transaction(async (tx) => {
    // ── Autre acheteur : résoudre ou créer l'exportateur ─────────────────────
    if (decision === "autre_acheteur") {
      if (!prixUnitaireNouveauFcfa) throw new Error("Prix unitaire requis");

      if (acheteurId) {
        exportateurIdFinal = acheteurId;
      } else if (nomNouvelAcheteur) {
        const [newExp] = await tx
          .insert(exportateursTable)
          .values({
            cooperativeId,
            nom: nomNouvelAcheteur.trim(),
            contact: telNouvelAcheteur?.trim() ?? null,
          })
          .returning({ id: exportateursTable.id });
        exportateurIdFinal = newExp!.id;
      } else {
        throw new Error("Acheteur requis pour la décision 'autre acheteur'");
      }

      const poidsNum = Number(refus.poidsRefuleKg);
      const montantTotal = Math.round(poidsNum * prixUnitaireNouveauFcfa);
      const estImmediat = modeReglement === "immediat";
      const dateVente = dateVenteRefus ?? new Date().toISOString().slice(0, 10);

      await tx.insert(ventesExportateursTable).values({
        exportateurId: exportateurIdFinal,
        poidsKg: String(poidsNum),
        prixUnitaireFcfa: prixUnitaireNouveauFcfa,
        montantTotalFcfa: montantTotal,
        dateVente,
        dateEcheanceReglement: estImmediat ? null : (dateEcheanceRefus ?? null),
        montantRecuFcfa: estImmediat ? montantTotal : 0,
        soldeDuFcfa: estImmediat ? 0 : montantTotal,
        statut: estImmediat ? "regle" : "en_attente",
        produit: "cacao",
      });
    }

    // ── Mise à jour du refus ──────────────────────────────────────────────────
    await tx
      .update(traitementsRefusTable)
      .set({
        decision,
        entrepotRetourId: entrepotRetourId ?? null,
        ancienGrade: ancienGrade ?? null,
        nouveauGrade: nouveauGrade ?? null,
        nouvelExportateurId: exportateurIdFinal ?? null,
        prixUnitaireNouveauFcfa: prixUnitaireNouveauFcfa?.toString() ?? null,
        motifPerte: motifPerte ?? null,
        pvConstat: pvConstat ?? false,
        tauxHumidite: tauxHumidite?.toString() ?? null,
        statut: "traite",
        traitePar: userId,
        traiteLe: new Date(),
      })
      .where(eq(traitementsRefusTable.id, id));

    // ── Mouvement de stock selon décision ────────────────────────────────────
    if (decision === "retour_stock" && entrepotRetourId) {
      await tx.insert(mouvementsStockTable).values({
        entrepotId: entrepotRetourId,
        type: "retour_refus",
        poidsKg: refus.poidsRefuleKg,
        motif: `Retour stock lot refoulé #${refus.venteExportateurId}`,
        agentId: userId,
      });
    } else if (decision === "perte" && entrepotRetourId) {
      await tx.insert(mouvementsStockTable).values({
        entrepotId: entrepotRetourId,
        type: "perte",
        poidsKg: refus.poidsRefuleKg,
        motif: motifPerte ?? `Perte lot refoulé #${refus.venteExportateurId}`,
        agentId: userId,
      });
    }
  });

  // ── Écritures comptables (hors transaction) ───────────────────────────────
  const dateOp = new Date().toISOString().slice(0, 10);

  if (decision === "retour_stock") {
    const montantEstime = Math.round(Number(refus.poidsRefuleKg) * 900);
    void proposerEcriture(cooperativeId, {
      source: "stock",
      sourceId: refus.id,
      libelle: `Retour stock lot refoulé #${refus.venteExportateurId}`,
      compteDebit: "31",
      compteCredit: "603",
      montantFcfa: montantEstime,
      date: dateOp,
    });
  } else if (decision === "perte") {
    const montantEstime = Math.round(Number(refus.poidsRefuleKg) * 900);
    void proposerEcriture(cooperativeId, {
      source: "stock",
      sourceId: refus.id,
      libelle: `Perte lot refoulé #${refus.venteExportateurId}`,
      compteDebit: "6031",
      compteCredit: "31",
      montantFcfa: montantEstime,
      date: dateOp,
    });
  } else if (decision === "autre_acheteur" && prixUnitaireNouveauFcfa) {
    const montant = Math.round(Number(refus.poidsRefuleKg) * prixUnitaireNouveauFcfa);
    const estImmediat = modeReglement === "immediat";
    // Immédiat : Caisse/Ventes — À crédit : Clients/Ventes
    void proposerEcriture(cooperativeId, {
      source: "vente",
      sourceId: refus.id,
      libelle: `Vente lot refoulé — acheteur #${exportateurIdFinal}`,
      compteDebit: estImmediat ? "571" : "4111",
      compteCredit: "701",
      montantFcfa: montant,
      date: dateOp,
    });
  }

  const updated = await db.query.traitementsRefusTable.findFirst({
    where: eq(traitementsRefusTable.id, id),
  });

  return res.json(updated);
}

export async function countRefusEnAttente(req: Request, res: Response) {
  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(traitementsRefusTable)
    .where(
      and(
        eq(traitementsRefusTable.cooperativeId, coopId(req)),
        eq(traitementsRefusTable.statut, "en_attente")
      )
    );
  return res.json({ count: Number(result[0]?.count ?? 0) });
}

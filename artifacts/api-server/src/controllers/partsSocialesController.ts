import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  membresTable,
  liberationsPartsTable,
  configPartsSocialesTable,
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

export async function getConfigParts(req: Request, res: Response) {
  let config = await db.query.configPartsSocialesTable.findFirst({
    where: eq(configPartsSocialesTable.cooperativeId, coopId(req)),
  });
  if (!config) {
    const [created] = await db
      .insert(configPartsSocialesTable)
      .values({ cooperativeId: coopId(req), valeurNominaleFcfa: 5000, nbrePartsMin: 5 })
      .onConflictDoNothing()
      .returning();
    config = created;
  }
  return res.json(config);
}

export async function updateConfigParts(req: Request, res: Response) {
  const { valeurNominaleFcfa, nbrePartsMin } = req.body as {
    valeurNominaleFcfa?: number;
    nbrePartsMin?: number;
  };

  const [config] = await db
    .insert(configPartsSocialesTable)
    .values({
      cooperativeId: coopId(req),
      valeurNominaleFcfa: valeurNominaleFcfa ?? 5000,
      nbrePartsMin: nbrePartsMin ?? 1,
    })
    .onConflictDoUpdate({
      target: configPartsSocialesTable.cooperativeId,
      set: {
        ...(valeurNominaleFcfa !== undefined ? { valeurNominaleFcfa } : {}),
        ...(nbrePartsMin !== undefined ? { nbrePartsMin } : {}),
        updatedAt: new Date(),
      },
    })
    .returning();

  return res.json(config);
}

export async function getPartsMembre(req: Request, res: Response) {
  const membreId = parseInt(String(req.params["id"] ?? "0"));

  const membre = await db.query.membresTable.findFirst({
    where: and(eq(membresTable.id, membreId), eq(membresTable.cooperativeId, coopId(req))),
  });
  if (!membre) return res.status(404).json({ erreur: "Membre introuvable" });

  const liberations = await db.query.liberationsPartsTable.findMany({
    where: and(
      eq(liberationsPartsTable.membreId, membreId),
      eq(liberationsPartsTable.cooperativeId, coopId(req))
    ),
    orderBy: [desc(liberationsPartsTable.dateVersement)],
  });

  const config = await db.query.configPartsSocialesTable.findFirst({
    where: eq(configPartsSocialesTable.cooperativeId, coopId(req)),
  });

  return res.json({
    membre: {
      id: membre.id,
      nom: membre.nom,
      prenoms: membre.prenoms,
      nbrePartsSouscrites: membre.nbrePartsSouscrites,
      valeurNominalePartFcfa: membre.valeurNominalePartFcfa,
      totalSouscritFcfa: membre.totalSouscritFcfa,
      totalLibereFcfa: membre.totalLibereFcfa,
      resteALibererFcfa: membre.resteALibererFcfa,
    },
    liberations,
    config: config ?? { valeurNominaleFcfa: 5000, nbrePartsMin: 1 },
  });
}

export async function enregistrerLiberation(req: Request, res: Response) {
  const {
    membreId,
    montantFcfa,
    dateVersement,
    codeLiberation,
    versement,
  } = req.body as {
    membreId: number;
    montantFcfa: number;
    dateVersement: string;
    codeLiberation?: string;
    versement?: string;
  };

  if (!membreId || !montantFcfa || !dateVersement) {
    return res.status(400).json({ erreur: "Données manquantes" });
  }

  const membre = await db.query.membresTable.findFirst({
    where: and(eq(membresTable.id, membreId), eq(membresTable.cooperativeId, coopId(req))),
  });
  if (!membre) return res.status(404).json({ erreur: "Membre introuvable" });

  if (montantFcfa > membre.resteALibererFcfa) {
    return res.status(400).json({
      erreur: "Montant supérieur au reste à libérer",
      resteALibererFcfa: membre.resteALibererFcfa,
    });
  }

  const agentId = (req as unknown as { utilisateur?: { id?: number } }).utilisateur?.id;

  await db.transaction(async (tx) => {
    await tx.insert(liberationsPartsTable).values({
      membreId,
      cooperativeId: coopId(req),
      dateVersement,
      codeLiberation,
      versement,
      montantFcfa,
      agentId,
    });

    const nouveauLibere = membre.totalLibereFcfa + montantFcfa;
    const nouveauReste = membre.totalSouscritFcfa - nouveauLibere;

    await tx
      .update(membresTable)
      .set({
        totalLibereFcfa: nouveauLibere,
        resteALibererFcfa: Math.max(0, nouveauReste),
        updatedAt: new Date(),
      })
      .where(eq(membresTable.id, membreId));
  });

  // Écriture comptable : Débit 521 Banque / Crédit 101 Capital
  void proposerEcriture(coopId(req), {
    source: "encaissement",
    sourceId: membreId,
    libelle: `Libération parts sociales — ${membre.prenoms} ${membre.nom}`,
    compteDebit: "521",
    compteCredit: "101",
    montantFcfa,
    date: dateVersement,
  });

  const updated = await db.query.membresTable.findFirst({
    where: eq(membresTable.id, membreId),
  });

  return res.status(201).json({ succes: true, membre: updated });
}

export async function getRapportParts(req: Request, res: Response) {
  const result = await db
    .select({
      totalMembresSouscripteurs: sql<number>`COUNT(DISTINCT id) FILTER (WHERE nbre_parts_souscrites > 0)`,
      totalPartsSouscrites: sql<number>`SUM(nbre_parts_souscrites)`,
      totalSouscritFcfa: sql<number>`SUM(total_souscrit_fcfa)`,
      totalLibereFcfa: sql<number>`SUM(total_libere_fcfa)`,
      totalResteALibererFcfa: sql<number>`SUM(reste_a_liberer_fcfa)`,
    })
    .from(membresTable)
    .where(eq(membresTable.cooperativeId, coopId(req)));

  return res.json(result[0]);
}

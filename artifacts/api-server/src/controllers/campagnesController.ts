import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { campagnesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";

const COOP_ID = 1;

export async function getCampagneActive(req: Request, res: Response) {
  const campagne = await db.query.campagnesTable.findFirst({
    where: and(
      eq(campagnesTable.cooperativeId, COOP_ID),
      eq(campagnesTable.statut, "ouverte")
    ),
    orderBy: [desc(campagnesTable.anneeDebut)],
  });
  if (!campagne) return res.status(404).json({ erreur: "Aucune campagne active" });
  return res.json(campagne);
}

export async function listCampagnes(req: Request, res: Response) {
  const campagnes = await db.query.campagnesTable.findMany({
    where: eq(campagnesTable.cooperativeId, COOP_ID),
    orderBy: [desc(campagnesTable.anneeDebut)],
  });
  return res.json(campagnes);
}

export async function createCampagne(req: Request, res: Response) {
  const { libelle, anneeDebut, anneeFin, dateOuverture } = req.body as {
    libelle: string;
    anneeDebut: number;
    anneeFin: number;
    dateOuverture: string;
  };

  if (!libelle || !anneeDebut || !anneeFin || !dateOuverture) {
    return res.status(400).json({ erreur: "Données manquantes" });
  }

  const [campagne] = await db
    .insert(campagnesTable)
    .values({
      cooperativeId: COOP_ID,
      libelle,
      anneeDebut,
      anneeFin,
      dateOuverture,
      statut: "ouverte",
    })
    .returning();

  return res.status(201).json(campagne);
}

export async function fermerCampagne(req: Request, res: Response) {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const { dateFermeture } = req.body as { dateFermeture?: string };

  const [campagne] = await db
    .update(campagnesTable)
    .set({ statut: "fermee", dateFermeture: dateFermeture ?? new Date().toISOString().slice(0, 10) })
    .where(and(eq(campagnesTable.id, id), eq(campagnesTable.cooperativeId, COOP_ID)))
    .returning();

  if (!campagne) return res.status(404).json({ erreur: "Campagne introuvable" });
  return res.json(campagne);
}

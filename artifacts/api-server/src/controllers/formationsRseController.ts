import { Request, Response } from "express";
import { db, formationsRseTable, campagnesTable } from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";

export async function listerFormationsRse(req: Request, res: Response): Promise<void> {
  const coopId = req.user?.cooperativeId;
  if (!coopId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const campagneId = req.query.campagne_id ? parseInt(req.query.campagne_id as string, 10) : undefined;
  const cond = [eq(formationsRseTable.cooperativeId, coopId)];
  if (campagneId) cond.push(eq(formationsRseTable.campagneId, campagneId));
  const rows = await db
    .select()
    .from(formationsRseTable)
    .where(and(...cond))
    .orderBy(desc(formationsRseTable.dateFormation));
  res.json(rows);
}

export async function creerFormationRse(req: Request, res: Response): Promise<void> {
  const coopId = req.user?.cooperativeId;
  if (!coopId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const { titre, thematique, dateFormation, lieu, formateur, nbParticipants, nbFemmes, dureeJours, financement, campagneId } = req.body as Record<string, unknown>;
  if (!titre) { res.status(400).json({ erreur: "Le titre est obligatoire" }); return; }
  const [row] = await db.insert(formationsRseTable).values({
    cooperativeId: coopId,
    campagneId:    campagneId ? Number(campagneId) : null,
    titre:         String(titre),
    thematique:    thematique ? String(thematique) : null,
    dateFormation: dateFormation ? String(dateFormation) : null,
    lieu:          lieu ? String(lieu) : null,
    formateur:     formateur ? String(formateur) : null,
    nbParticipants:nbParticipants ? Number(nbParticipants) : null,
    nbFemmes:      nbFemmes ? Number(nbFemmes) : null,
    dureeJours:    dureeJours ? String(dureeJours) : null,
    financement:   financement ? String(financement) : null,
  }).returning();
  res.status(201).json(row);
}

export async function supprimerFormationRse(req: Request, res: Response): Promise<void> {
  const coopId = req.user?.cooperativeId;
  const id = parseInt(req.params["id"] ?? "", 10);
  if (!coopId || isNaN(id)) { res.status(400).json({ erreur: "Paramètres invalides" }); return; }
  await db
    .delete(formationsRseTable)
    .where(and(eq(formationsRseTable.id, id), eq(formationsRseTable.cooperativeId, coopId)));
  res.json({ ok: true });
}

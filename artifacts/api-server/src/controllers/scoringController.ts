import type { Request, Response } from "express";
import * as scoringService from "../services/scoringService";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const pid = (v: string | string[]) => parseInt(Array.isArray(v) ? v[0] : v, 10);

// GET /api/scoring/campagne/:id
export async function getClassementCampagne(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const campagneId = pid(req.params.id);
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "id invalide" }); return; }
  const data = await scoringService.getClassementCampagne(cooperativeId, campagneId);
  res.json(data);
}

// GET /api/scoring/membre/:id
export async function getScoreMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const membreId = pid(req.params.id);
  if (isNaN(membreId)) { res.status(400).json({ erreur: "id invalide" }); return; }
  const data = await scoringService.getScoreMembre(cooperativeId, membreId);
  res.json(data);
}

// GET /api/scoring/top
export async function getTopN(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const n = pid(req.query.n as string);
  const campagneId = pid(req.query.campagneId as string);
  if (isNaN(n) || isNaN(campagneId)) {
    res.status(400).json({ erreur: "n et campagneId sont requis" });
    return;
  }
  const data = await scoringService.getTopN(cooperativeId, campagneId, Math.min(n, 100));
  res.json(data);
}

// GET /api/scoring/par-niveau
export async function getParNiveau(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const niveau = req.query.niveau as string;
  const campagneId = pid(req.query.campagneId as string);
  if (!["bronze", "argent", "or", "platine", "non_classe"].includes(niveau)) {
    res.status(400).json({ erreur: "niveau invalide" }); return;
  }
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "campagneId requis" }); return; }
  const data = await scoringService.getParNiveau(cooperativeId, campagneId, niveau);
  res.json(data);
}

// POST /api/scoring/recalculer
export async function recalculerScores(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const { campagneId } = req.body as { campagneId?: number };
  if (!campagneId) { res.status(400).json({ erreur: "campagneId requis" }); return; }
  const result = await scoringService.recalculerTous(cooperativeId, Number(campagneId));
  res.json(result);
}

// GET /api/scoring/config
export async function getConfig(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const cfg = await scoringService.getConfig(cooperativeId);
  if (!cfg) { res.status(404).json({ erreur: "Configuration introuvable" }); return; }
  res.json(cfg);
}

// PUT /api/scoring/config
export async function updateConfig(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const data = req.body as Parameters<typeof scoringService.updateConfig>[1];
  const cfg = await scoringService.updateConfig(cooperativeId, data);
  res.json(cfg);
}

// GET /api/scoring/evolution/:membreId
export async function getEvolution(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const membreId = pid(req.params.membreId);
  if (isNaN(membreId)) { res.status(400).json({ erreur: "membreId invalide" }); return; }
  const data = await scoringService.getEvolution(cooperativeId, membreId);
  res.json(data);
}

// GET /api/scoring/diagnostic/:campagneId
export async function getDiagnostic(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const campagneId = pid(req.params.campagneId);
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "campagneId invalide" }); return; }

  const rows = await db.execute<{
    nb_membres_actifs: string;
    nb_livraisons_campagne: string;
    nb_livraisons_null: string;
    nb_livraisons_autres: string;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM membres WHERE cooperative_id = ${cooperativeId} AND statut = 'actif') AS nb_membres_actifs,
      (SELECT COUNT(*) FROM livraisons l JOIN membres m ON m.id = l.membre_id
        WHERE l.campagne_id = ${campagneId} AND m.cooperative_id = ${cooperativeId}) AS nb_livraisons_campagne,
      (SELECT COUNT(*) FROM livraisons l JOIN membres m ON m.id = l.membre_id
        WHERE l.campagne_id IS NULL AND m.cooperative_id = ${cooperativeId}) AS nb_livraisons_null,
      (SELECT COUNT(*) FROM livraisons l JOIN membres m ON m.id = l.membre_id
        WHERE l.campagne_id IS NOT NULL AND l.campagne_id != ${campagneId} AND m.cooperative_id = ${cooperativeId}) AS nb_livraisons_autres
  `);

  const r = rows.rows[0] ?? { nb_membres_actifs: "0", nb_livraisons_campagne: "0", nb_livraisons_null: "0", nb_livraisons_autres: "0" };
  res.json({
    nbMembresActifs:      Number(r.nb_membres_actifs),
    nbLivraisonsCampagne: Number(r.nb_livraisons_campagne),
    nbLivraisonsNull:     Number(r.nb_livraisons_null),
    nbLivraisonsAutres:   Number(r.nb_livraisons_autres),
  });
}

// GET /api/scoring/resume/:membreId  (pour fiche membre + formulaire avance)
export async function getResumeMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const membreId = pid(req.params.membreId);
  if (isNaN(membreId)) { res.status(400).json({ erreur: "membreId invalide" }); return; }
  const data = await scoringService.getResumeMembre(cooperativeId, membreId);
  res.json(data ?? null);
}

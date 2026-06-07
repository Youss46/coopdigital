import type { Request, Response } from "express";
import * as scoringService from "../services/scoringService";

const pid = (v: string | string[]) => parseInt(Array.isArray(v) ? v[0] : v, 10);

// GET /api/scoring/campagne/:id
export async function getClassementCampagne(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const campagneId = pid(req.params.id);
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "id invalide" }); return; }
  const data = await scoringService.getClassementCampagne(cooperativeId, campagneId);
  res.json(data);
}

// GET /api/scoring/membre/:id
export async function getScoreMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const membreId = pid(req.params.id);
  if (isNaN(membreId)) { res.status(400).json({ erreur: "id invalide" }); return; }
  const data = await scoringService.getScoreMembre(cooperativeId, membreId);
  res.json(data);
}

// GET /api/scoring/top
export async function getTopN(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
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
  const cooperativeId = req.user?.cooperativeId ?? 1;
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
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const { campagneId } = req.body as { campagneId?: number };
  if (!campagneId) { res.status(400).json({ erreur: "campagneId requis" }); return; }
  const result = await scoringService.recalculerTous(cooperativeId, Number(campagneId));
  res.json(result);
}

// GET /api/scoring/config
export async function getConfig(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const cfg = await scoringService.getConfig(cooperativeId);
  if (!cfg) { res.status(404).json({ erreur: "Configuration introuvable" }); return; }
  res.json(cfg);
}

// PUT /api/scoring/config
export async function updateConfig(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const data = req.body as Parameters<typeof scoringService.updateConfig>[1];
  const cfg = await scoringService.updateConfig(cooperativeId, data);
  res.json(cfg);
}

// GET /api/scoring/evolution/:membreId
export async function getEvolution(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const membreId = pid(req.params.membreId);
  if (isNaN(membreId)) { res.status(400).json({ erreur: "membreId invalide" }); return; }
  const data = await scoringService.getEvolution(cooperativeId, membreId);
  res.json(data);
}

// GET /api/scoring/resume/:membreId  (pour fiche membre + formulaire avance)
export async function getResumeMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const membreId = pid(req.params.membreId);
  if (isNaN(membreId)) { res.status(400).json({ erreur: "membreId invalide" }); return; }
  const data = await scoringService.getResumeMembre(cooperativeId, membreId);
  res.json(data ?? null);
}

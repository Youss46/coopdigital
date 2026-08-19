import type { Request, Response } from "express";
import * as svc from "../services/enqueteAgentService.js";

function requireAgent(req: Request, res: Response): boolean {
  if (req.agent?.role !== "agent_terrain") {
    res.status(403).json({ erreur: "Réservé aux agents terrain" });
    return false;
  }
  return true;
}

export async function getEnquetesAgentHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgent(req, res)) return;
  const { id, cooperativeId } = req.agent!;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    res.json(await svc.getEnquetesAgent(id, cooperativeId));
  } catch (err) {
    req.log.error({ err }, "getEnquetesAgent");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function getEnqueteDetailHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgent(req, res)) return;
  const { id } = req.agent!;
  const missionId = Number(req.params["id"]);
  if (isNaN(missionId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const detail = await svc.getEnqueteDetail(missionId, id);
    if (!detail) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    res.json(detail);
  } catch (err) {
    req.log.error({ err }, "getEnqueteDetail");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function soumettreReponsesHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgent(req, res)) return;
  const { id } = req.agent!;
  const missionId = Number(req.params["id"]);
  const membreId  = Number(req.params["membreId"]);
  if (isNaN(missionId) || isNaN(membreId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { reponses, notesAgent } = req.body as {
    reponses: Record<string, { valeur: "oui" | "non" | "na"; commentaire?: string }>;
    notesAgent?: string;
  };
  if (!reponses || typeof reponses !== "object") {
    res.status(400).json({ erreur: "Réponses manquantes" });
    return;
  }
  try {
    await svc.soumettreReponses(missionId, id, membreId, reponses, notesAgent);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "soumettreReponses");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function syncEnquetesHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgent(req, res)) return;
  const { id } = req.agent!;
  const { operations } = req.body as {
    operations: Array<{
      localId: string;
      missionId: number;
      membreId: number;
      reponses: Record<string, { valeur: "oui" | "non" | "na"; commentaire?: string }>;
      notesAgent?: string;
    }>;
  };
  if (!Array.isArray(operations)) {
    res.status(400).json({ erreur: "operations manquantes" });
    return;
  }
  try {
    const result = await svc.syncReponsesBatch(id, operations);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "syncEnquetes");
    res.status(500).json({ erreur: apiError(err) });
  }
}

export async function soumettreEnqueteHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgent(req, res)) return;
  const { id } = req.agent!;
  const missionId = Number(req.params["id"]);
  if (isNaN(missionId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    await svc.soumettreEnqueteMission(missionId, id);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "soumettreEnquete");
    res.status(500).json({ erreur: apiError(err) });
  }
}

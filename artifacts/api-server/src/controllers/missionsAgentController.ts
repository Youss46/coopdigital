import { type Request, type Response } from "express";
import * as svc from "../services/missionsAgentService.js";

function requireAgentTerrain(req: Request, res: Response): boolean {
  if (req.agent?.role !== "agent_terrain") {
    res.status(403).json({ erreur: "Réservé aux agents terrain" });
    return false;
  }
  return true;
}

export async function getMissionsHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgentTerrain(req, res)) return;
  const { id, cooperativeId } = req.agent!;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const missions = await svc.getMissionsAgent(id, cooperativeId);
    res.json(missions);
  } catch (err) {
    req.log.error({ err }, "Erreur getMissionsAgent");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getMissionDetailHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgentTerrain(req, res)) return;
  const { id } = req.agent!;
  const missionId = Number(req.params["id"]);
  if (isNaN(missionId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const detail = await svc.getMissionDetail(missionId, id);
    if (!detail) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    res.json(detail);
  } catch (err) {
    req.log.error({ err }, "Erreur getMissionDetail");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function collecterParcelleHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgentTerrain(req, res)) return;
  const { id } = req.agent!;
  const missionId = Number(req.params["id"]);
  const membreId = Number(req.params["membreId"]);
  if (isNaN(missionId) || isNaN(membreId)) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const { polygoneGps, photos, notes, superficieCalculeeHa, probleme } = req.body as {
    polygoneGps?: object;
    photos?: string[];
    notes?: string;
    superficieCalculeeHa?: number;
    probleme?: { type: string; description: string };
  };

  if (!polygoneGps || !photos) {
    res.status(400).json({ erreur: "polygoneGps et photos requis" });
    return;
  }

  try {
    const result = await svc.collecterParcelleAgent(missionId, membreId, id, {
      polygoneGps,
      photos,
      notes,
      superficieCalculeeHa,
      probleme,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur collecterParcelle");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function soumettresMissionHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgentTerrain(req, res)) return;
  const { id } = req.agent!;
  const missionId = Number(req.params["id"]);
  if (isNaN(missionId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const result = await svc.soumettresMission(missionId, id);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur soumettresMission");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function getMessagesHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgentTerrain(req, res)) return;
  const { id } = req.agent!;
  const missionId = Number(req.params["missionId"]);
  if (isNaN(missionId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const messages = await svc.getMessages(missionId, id);
    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Erreur getMessages");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgentTerrain(req, res)) return;
  const { id } = req.agent!;
  const missionId = Number(req.params["missionId"]);
  if (isNaN(missionId)) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const { message, type } = req.body as { message?: string; type?: string };
  if (!message) { res.status(400).json({ erreur: "Message requis" }); return; }

  try {
    const msg = await svc.sendMessage(missionId, id, message, type ?? "commentaire");
    res.status(201).json(msg);
  } catch (err) {
    req.log.error({ err }, "Erreur sendMessage");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getStatsAgentHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgentTerrain(req, res)) return;
  const { id } = req.agent!;
  try {
    const stats = await svc.getStatsAgent(id);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Erreur getStatsAgent");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getHistoriqueAgentHandler(req: Request, res: Response): Promise<void> {
  if (!requireAgentTerrain(req, res)) return;
  const { id, cooperativeId } = req.agent!;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const historique = await svc.getHistoriqueAgent(id, cooperativeId);
    res.json(historique);
  } catch (err) {
    req.log.error({ err }, "Erreur getHistoriqueAgent");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

import { Request, Response } from "express";
import * as planningService from "../services/planningService.js";

// ─── Zones ─────────────────────────────────────────────────────────────────

export async function getZones(req: Request, res: Response): Promise<void> {
  try {
    const zones = await planningService.listZones();
    res.json(zones);
  } catch (err) {
    req.log.error({ err }, "getZones");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function postZone(req: Request, res: Response): Promise<void> {
  try {
    const { nom, section, villages, agentResponsableId, objectifTonnageKg } = req.body as {
      nom: string;
      section?: string;
      villages?: string[];
      agentResponsableId?: number;
      objectifTonnageKg?: number;
    };
    if (!nom) { res.status(400).json({ error: "nom requis" }); return; }
    const zone = await planningService.createZone({ nom, section, villages, agentResponsableId, objectifTonnageKg });
    res.status(201).json(zone);
  } catch (err) {
    req.log.error({ err }, "postZone");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function putZone(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const zone = await planningService.updateZone(id, req.body);
    if (!zone) { res.status(404).json({ error: "Zone introuvable" }); return; }
    res.json(zone);
  } catch (err) {
    req.log.error({ err }, "putZone");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function deleteZone(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    await planningService.deleteZone(id);
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "deleteZone");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Plannings ─────────────────────────────────────────────────────────────

export async function getPlannings(req: Request, res: Response): Promise<void> {
  try {
    const { agent_id, zone, semaine, statut } = req.query as Record<string, string | undefined>;
    const plannings = await planningService.listPlannings({
      agentId:  agent_id ? parseInt(agent_id, 10) : undefined,
      zoneId:   zone     ? parseInt(zone, 10)      : undefined,
      semaine,
      statut,
    });
    res.json(plannings);
  } catch (err) {
    req.log.error({ err }, "getPlannings");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function getPlanningsSemaine(req: Request, res: Response): Promise<void> {
  try {
    const plannings = await planningService.getPlanningsSemaine();
    res.json(plannings);
  } catch (err) {
    req.log.error({ err }, "getPlanningsSemaine");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function postPlanning(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      campagneId?: number;
      zoneCollecteId: number;
      agentId?: number;
      dateCollecte: string;
      heureDebut?: string;
      heureFin?: string;
      villagesPrevus?: string[];
      objectifKg?: number;
      nbProducteursPrevus?: number;
      observations?: string;
    };
    if (!body.zoneCollecteId || !body.dateCollecte) {
      res.status(400).json({ error: "zoneCollecteId et dateCollecte requis" });
      return;
    }
    const planning = await planningService.createPlanning(body);
    res.status(201).json(planning);
  } catch (err) {
    req.log.error({ err }, "postPlanning");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function putPlanning(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const planning = await planningService.updatePlanning(id, req.body);
    if (!planning) { res.status(404).json({ error: "Planning introuvable" }); return; }
    res.json(planning);
  } catch (err) {
    req.log.error({ err }, "putPlanning");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function demarrerPlanning(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const planning = await planningService.demarrerPlanning(id);
    if (!planning) { res.status(404).json({ error: "Planning introuvable" }); return; }
    res.json(planning);
  } catch (err) {
    req.log.error({ err }, "demarrerPlanning");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function terminerPlanning(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const result = await planningService.cloturerPlanning(id);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "terminerPlanning");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function annulerPlanning(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const planning = await planningService.annulerPlanning(id);
    if (!planning) { res.status(404).json({ error: "Planning introuvable" }); return; }
    res.json(planning);
  } catch (err) {
    req.log.error({ err }, "annulerPlanning");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function notifierMembres(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const result = await planningService.notifierMembresZone(id);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "notifierMembres");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function getRapportPlanning(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const rapport = await planningService.getRapportPlanning(id);
    if (!rapport) { res.status(404).json({ error: "Planning introuvable" }); return; }
    res.json(rapport);
  } catch (err) {
    req.log.error({ err }, "getRapportPlanning");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function getStatsPlannings(req: Request, res: Response): Promise<void> {
  try {
    const stats = await planningService.getStatsPlannings();
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "getStatsPlannings");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function getStatsZones(req: Request, res: Response): Promise<void> {
  try {
    const stats = await planningService.getStatsZones();
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "getStatsZones");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

import { type Request, type Response } from "express";
import * as delegueService from "../services/delegueService.js";

// ─── Routes terrain (agent_terrain) ────────────────────────────────────────

export async function getCaisseHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  if (!agent.cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const caisse = await delegueService.getCaisseDelegue(agent.id, agent.cooperativeId);
    res.json(caisse);
  } catch (err) {
    req.log.error({ err }, "Erreur getCaisse délégué");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getPaiementsDifferesHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  if (!agent.cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const list = await delegueService.getPaiementsDifferes(agent.id, agent.cooperativeId);
    res.json(list);
  } catch (err) {
    req.log.error({ err }, "Erreur paiements différés terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function regulariserPaiementHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  if (!agent.cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const livraisonId = Number(req.params["livraisonId"]);
  if (isNaN(livraisonId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { modePaiement } = req.body as { modePaiement?: string };
  if (!modePaiement) { res.status(400).json({ erreur: "Mode de paiement requis" }); return; }
  try {
    const result = await delegueService.regulariserPaiement(agent.id, agent.cooperativeId, livraisonId, modePaiement);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur régularisation");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

// ─── Routes admin (coopérative) ────────────────────────────────────────────

export async function listDeleguesHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user!.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  try {
    const list = await delegueService.listDelegues(cooperativeId);
    res.json(list);
  } catch (err) {
    req.log.error({ err }, "Erreur listDelegues");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getDetailCaisseHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user!.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const agentId = Number(req.params["agentId"]);
  if (isNaN(agentId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const detail = await delegueService.getDetailCaisse(agentId, cooperativeId);
    res.json(detail);
  } catch (err) {
    req.log.error({ err }, "Erreur detail caisse");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function approvisionnerHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user!.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const agentId = Number(req.params["agentId"]);
  if (isNaN(agentId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { montantFcfa, note } = req.body as { montantFcfa?: number; note?: string };
  if (!montantFcfa || montantFcfa <= 0) { res.status(400).json({ erreur: "Montant invalide" }); return; }
  try {
    const result = await delegueService.approvisionnerCaisse(agentId, cooperativeId, montantFcfa, note ?? null, req.user!.id);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur approvisionnement");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function getPaiementsDifferesAdminHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user!.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  try {
    const list = await delegueService.getPaiementsDifferesCooperative(cooperativeId);
    res.json(list);
  } catch (err) {
    req.log.error({ err }, "Erreur paiements différés admin");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

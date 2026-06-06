import { Request, Response } from "express";
import * as svc from "../services/previsionService.js";

function getCoopId(req: Request, res: Response): number | null {
  const id = req.user?.cooperativeId;
  if (!id) { res.status(403).json({ error: "Coopérative non déterminée" }); return null; }
  return id;
}

// GET /previsions/campagne/:id
export async function getProjectionCampagne(req: Request, res: Response) {
  const coopId = getCoopId(req, res);
  if (!coopId) return;
  const campagneId = Number(req.params["id"]);
  if (isNaN(campagneId)) { res.status(400).json({ error: "ID campagne invalide" }); return; }
  const result = await svc.projeterFinCampagne(campagneId, coopId);
  if (!result) { res.status(404).json({ error: "Campagne introuvable" }); return; }
  res.json(result);
}

// POST /previsions/campagne/:id/hypotheses
export async function postHypotheses(req: Request, res: Response) {
  const coopId = getCoopId(req, res);
  if (!coopId) return;
  const campagneId = Number(req.params["id"]);
  if (isNaN(campagneId)) { res.status(400).json({ error: "ID campagne invalide" }); return; }
  const result = await svc.saisirHypotheses(campagneId, coopId, req.body);
  res.json(result);
}

// GET /previsions/tresorerie?jours=90
export async function getTresorerie(req: Request, res: Response) {
  const coopId = getCoopId(req, res);
  if (!coopId) return;
  const jours = Number(req.query["jours"]) || 90;
  const result = await svc.projeterTresorerie(coopId, jours);
  res.json(result);
}

// POST /previsions/simuler
export async function postSimuler(req: Request, res: Response) {
  const coopId = getCoopId(req, res);
  if (!coopId) return;
  const { campagne_id, parametres, nom_simulation, type } = req.body as {
    campagne_id?: number;
    parametres: { prix_achat: number; prix_vente: number; tonnage: number; nb_membres?: number };
    nom_simulation: string;
    type?: string;
  };
  if (!parametres || !nom_simulation) {
    res.status(400).json({ error: "parametres et nom_simulation obligatoires" });
    return;
  }
  const result = await svc.simuler(coopId, campagne_id ?? null, parametres, nom_simulation, type ?? "mix", req.user?.id);
  res.status(201).json(result);
}

// GET /previsions/simulations
export async function getSimulations(req: Request, res: Response) {
  const coopId = getCoopId(req, res);
  if (!coopId) return;
  const result = await svc.listerSimulations(coopId);
  res.json(result);
}

// GET /previsions/alertes
export async function getAlertes(req: Request, res: Response) {
  const coopId = getCoopId(req, res);
  if (!coopId) return;
  const result = await svc.getAlertesPrevisions(coopId);
  res.json(result);
}

// GET /previsions/campagnes  — liste des campagnes disponibles
export async function getCampagnes(req: Request, res: Response) {
  const coopId = getCoopId(req, res);
  if (!coopId) return;
  const result = await svc.listerCampagnes(coopId);
  res.json(result);
}

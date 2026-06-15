import { type Request, type Response } from "express";
import * as svc from "../services/entrepotDelegueService.js";

function coopId(req: Request): number | null {
  return req.user?.cooperativeId ?? null;
}

// ─── Vue direction ────────────────────────────────────────────────────────────

export async function getStatsHandler(req: Request, res: Response): Promise<void> {
  const coop = coopId(req);
  if (!coop) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  try {
    res.json(await svc.getStatsConsolideesDirection(coop));
  } catch (err) {
    req.log.error({ err }, "getStats entrepôts");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function listEntrepotsHandler(req: Request, res: Response): Promise<void> {
  const coop = coopId(req);
  if (!coop) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  try {
    res.json(await svc.listEntrepots(coop));
  } catch (err) {
    req.log.error({ err }, "listEntrepots");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function creerEntrepotHandler(req: Request, res: Response): Promise<void> {
  const coop = coopId(req);
  if (!coop) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const { delegueId, nom, zoneNom, zoneType, capaciteMaxKg, seuilAlerteKg, adresse, gpsLat, gpsLng } =
    req.body as Record<string, unknown>;
  if (!delegueId || !nom) { res.status(400).json({ erreur: "delegueId et nom sont requis" }); return; }
  try {
    const e = await svc.creerEntrepot(coop, {
      delegueId: Number(delegueId),
      nom: String(nom),
      zoneNom: zoneNom ? String(zoneNom) : undefined,
      zoneType: zoneType ? String(zoneType) : undefined,
      capaciteMaxKg: capaciteMaxKg ? Number(capaciteMaxKg) : undefined,
      seuilAlerteKg: seuilAlerteKg ? Number(seuilAlerteKg) : undefined,
      adresse: adresse ? String(adresse) : undefined,
      gpsLat: gpsLat ? Number(gpsLat) : undefined,
      gpsLng: gpsLng ? Number(gpsLng) : undefined,
    });
    res.status(201).json(e);
  } catch (err) {
    req.log.error({ err }, "creerEntrepot");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function modifierEntrepotHandler(req: Request, res: Response): Promise<void> {
  const coop = coopId(req);
  if (!coop) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const updated = await svc.modifierEntrepot(id, coop, req.body as Parameters<typeof svc.modifierEntrepot>[2]);
    if (!updated) { res.status(404).json({ erreur: "Entrepôt non trouvé" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "modifierEntrepot");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function getMouvementsEntrepotHandler(req: Request, res: Response): Promise<void> {
  const coop = coopId(req);
  if (!coop) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const limit = Number(req.query["limit"] ?? 50);
  const offset = Number(req.query["offset"] ?? 0);
  try {
    res.json(await svc.getMouvements(id, coop, { limit, offset }));
  } catch (err) {
    req.log.error({ err }, "getMouvements entrepôt");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function listTransfertsHandler(req: Request, res: Response): Promise<void> {
  const coop = coopId(req);
  if (!coop) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const statut = req.query["statut"] ? String(req.query["statut"]) : undefined;
  try {
    res.json(await svc.listTransferts(coop, { statut, limit: 100 }));
  } catch (err) {
    req.log.error({ err }, "listTransferts");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function confirmerArriveeHandler(req: Request, res: Response): Promise<void> {
  const coop = coopId(req);
  if (!coop) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { poidsArrivee_kg, motifEcart, notes } = req.body as Record<string, unknown>;
  if (!poidsArrivee_kg) { res.status(400).json({ erreur: "Poids à l'arrivée requis" }); return; }
  try {
    const updated = await svc.confirmerArrivee(id, coop, req.user!.id, {
      poidsArrivee_kg: Number(poidsArrivee_kg),
      motifEcart: motifEcart ? String(motifEcart) : undefined,
      notes: notes ? String(notes) : undefined,
    });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "confirmerArrivee");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function signalerLitigeHandler(req: Request, res: Response): Promise<void> {
  const coop = coopId(req);
  if (!coop) { res.status(403).json({ erreur: "Coopérative requise" }); return; }
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { motifEcart, notes } = req.body as Record<string, unknown>;
  if (!motifEcart) { res.status(400).json({ erreur: "Motif d'écart requis" }); return; }
  try {
    const updated = await svc.signalerLitige(id, coop, req.user!.id, String(motifEcart), notes ? String(notes) : "");
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "signalerLitige");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

// ─── Vue délégué (terrain JWT) ────────────────────────────────────────────────

export async function getMonEntrepotHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  if (!agent.cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const entrepot = await svc.getEntrepotDuDelegue(agent.id, agent.cooperativeId);
    if (!entrepot) { res.status(404).json({ erreur: "Aucun entrepôt associé à ce délégué" }); return; }
    res.json(entrepot);
  } catch (err) {
    req.log.error({ err }, "getMonEntrepot");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getMesMouvementsHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  if (!agent.cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const limit = Number(req.query["limit"] ?? 50);
  const offset = Number(req.query["offset"] ?? 0);
  try {
    res.json(await svc.getMouvementsDelegue(agent.id, agent.cooperativeId, { limit, offset }));
  } catch (err) {
    req.log.error({ err }, "getMesMouvements");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getMesTransfertsHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  if (!agent.cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    res.json(await svc.listTransfertsDelegue(agent.id, agent.cooperativeId));
  } catch (err) {
    req.log.error({ err }, "getMesTransferts");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function creerTransfertHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  if (!agent.cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const {
    entrepotId, poidsKg, typeVehicule, immatriculation, nomChauffeur,
    telephoneChauffeur, transporteur, datePrevue, campagneId, notes,
  } = req.body as Record<string, unknown>;
  if (!entrepotId || !poidsKg) { res.status(400).json({ erreur: "entrepotId et poidsKg sont requis" }); return; }
  try {
    const t = await svc.creerTransfert(agent.id, agent.cooperativeId, {
      entrepotId: Number(entrepotId),
      poidsKg: Number(poidsKg),
      typeVehicule: typeVehicule ? String(typeVehicule) : undefined,
      immatriculation: immatriculation ? String(immatriculation) : undefined,
      nomChauffeur: nomChauffeur ? String(nomChauffeur) : undefined,
      telephoneChauffeur: telephoneChauffeur ? String(telephoneChauffeur) : undefined,
      transporteur: transporteur ? String(transporteur) : undefined,
      datePrevue: datePrevue ? new Date(String(datePrevue)) : undefined,
      campagneId: campagneId ? Number(campagneId) : undefined,
      notes: notes ? String(notes) : undefined,
    });
    res.status(201).json(t);
  } catch (err) {
    req.log.error({ err }, "creerTransfert");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function confirmerDepartHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  if (!agent.cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const id = Number(req.params["id"]);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { poidsDepart_kg, immatriculation, nomChauffeur } = req.body as Record<string, unknown>;
  if (!poidsDepart_kg) { res.status(400).json({ erreur: "Poids au départ requis" }); return; }
  try {
    const updated = await svc.confirmerDepart(id, agent.cooperativeId, agent.id, {
      poidsDepart_kg: Number(poidsDepart_kg),
      immatriculation: immatriculation ? String(immatriculation) : undefined,
      nomChauffeur: nomChauffeur ? String(nomChauffeur) : undefined,
    });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "confirmerDepart");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

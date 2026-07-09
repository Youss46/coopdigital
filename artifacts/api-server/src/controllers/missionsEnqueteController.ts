import type { Request, Response } from "express";
import * as svc from "../services/missionsEnqueteService.js";
import { generateRapportEnquete } from "../services/enqueteRapportService.js";

function coopId(req: Request): number | null { return req.user?.cooperativeId ?? null; }
function userId(req: Request): number | null { return req.user?.id ?? null; }
function parseId(req: Request, key = "id"): number | null {
  const n = Number(req.params[key]);
  return isNaN(n) ? null : n;
}

export async function handleListMissionsEnquete(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const certifId = req.query["certificationId"] ? Number(req.query["certificationId"]) : undefined;
  try {
    res.json(await svc.listMissionsEnquete(cid, certifId));
  } catch (err) { req.log.error({ err }, "listMissionsEnquete"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleCreateMissionEnquete(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const uid = userId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const { titre, certificationId, datePrevue, agentId, instructions, membreIds } = req.body as {
    titre: string; certificationId: number; datePrevue: string;
    agentId?: number; instructions?: string; membreIds?: number[];
  };
  if (!titre || !certificationId || !datePrevue) {
    res.status(400).json({ erreur: "Champs obligatoires manquants (titre, certificationId, datePrevue)" });
    return;
  }
  try {
    const mission = await svc.createMissionEnquete(cid, uid, {
      titre, certificationId, datePrevue, agentId, instructions,
      membreIds: membreIds ?? [],
    });
    res.status(201).json(mission);
  } catch (err) { req.log.error({ err }, "createMissionEnquete"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleGetMissionEnquete(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const mission = await svc.getMissionEnquete(cid, id);
    if (!mission) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    const membres = await svc.getMembresEnquete(cid, id);
    res.json({ ...mission, membres: membres ?? [] });
  } catch (err) { req.log.error({ err }, "getMissionEnquete"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleUpdateMissionEnquete(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id)  { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { titre, datePrevue, agentId, instructions } = req.body as {
    titre?: string; datePrevue?: string; agentId?: number | null; instructions?: string | null;
  };
  try {
    const updated = await svc.updateMissionEnquete(cid, id, { titre, datePrevue, agentId, instructions });
    if (!updated) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    res.json(updated);
  } catch (err) { req.log.error({ err }, "updateMissionEnquete"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleUpdateStatut(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { statut } = req.body as { statut: string };
  const VALIDES = ["planifiee", "en_cours", "soumise", "validee"];
  if (!VALIDES.includes(statut)) { res.status(400).json({ erreur: "Statut invalide" }); return; }
  try {
    const updated = await svc.updateMissionStatut(cid, id, statut);
    if (!updated) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    res.json(updated);
  } catch (err) { req.log.error({ err }, "updateStatutMission"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleValiderMembre(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req); const membreId = parseId(req, "membreId");
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id || !membreId) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const result = await svc.validerEnqueteMembre(cid, id, membreId);
    if (!result.ok) { res.status(400).json({ erreur: result.message }); return; }
    res.json({ ok: true });
  } catch (err) { req.log.error({ err }, "validerEnqueteMembre"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleRejeterMembre(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req); const membreId = parseId(req, "membreId");
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id || !membreId) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const { commentaireRt } = req.body as { commentaireRt?: string };
  if (!commentaireRt?.trim()) { res.status(400).json({ erreur: "Un motif de rejet est requis" }); return; }
  try {
    const result = await svc.rejeterEnqueteMembre(cid, id, membreId, commentaireRt.trim());
    res.json(result);
  } catch (err) { req.log.error({ err }, "rejeterMembre"); res.status(500).json({ erreur: err instanceof Error ? err.message : "Erreur interne" }); }
}

export async function handleDeleteMissionEnquete(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const ok = await svc.deleteMissionEnquete(cid, id);
    if (!ok) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    res.status(204).end();
  } catch (err) { req.log.error({ err }, "deleteMissionEnquete"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleRapportPdfEnquete(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id)  { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const buf = await generateRapportEnquete(cid, id);
    if (!buf) { res.status(404).json({ erreur: "Mission introuvable" }); return; }
    res.set({
      "Content-Type":        "application/pdf",
      "Content-Disposition": `attachment; filename="rapport-enquete-${id}.pdf"`,
      "Content-Length":      String(buf.length),
    });
    res.end(buf);
  } catch (err) {
    req.log.error({ err }, "handleRapportPdfEnquete");
    res.status(500).json({ erreur: "Erreur génération PDF" });
  }
}

export async function handleGetAgentsDisponibles(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    res.json(await svc.getAgentsDisponibles(cid));
  } catch (err) { req.log.error({ err }, "getAgentsDisponibles"); res.status(500).json({ erreur: "Erreur interne" }); }
}

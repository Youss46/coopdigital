import { type Request, type Response } from "express";
import {
  listExpeditions,
  getExpeditionsStats,
  getExpedition,
  createExpedition,
  changerStatut,
  confirmerReception,
  getRapportEudr,
  getFlotteVehicules,
  getFlotteChauffeurs,
  getLotsDisponibles,
  rattacherLot,
  detacherLot,
} from "../services/expeditionsService";

export async function handleListExpeditions(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }

  try {
    const { statut, port, type_vehicule, litiges } = req.query as Record<string, string>;
    const rows = await listExpeditions(cooperativeId, {
      statut:       statut  || undefined,
      port:         port    || undefined,
      typeVehicule: type_vehicule || undefined,
      litiges:      litiges === "true",
    });
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "handleListExpeditions");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetStats(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const stats = await getExpeditionsStats(cooperativeId);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "handleGetStats");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetExpedition(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const exp = await getExpedition(cooperativeId, id);
    if (!exp) { res.status(404).json({ erreur: "Expédition introuvable" }); return; }
    res.json(exp);
  } catch (err) {
    req.log.error({ err }, "handleGetExpedition");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateExpedition(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const exp = await createExpedition(cooperativeId, userId, req.body);
    res.status(201).json(exp);
  } catch (err) {
    req.log.error({ err }, "handleCreateExpedition");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleChangerStatut(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const { statut, notes, positionGps } = req.body as { statut: string; notes?: string; positionGps?: unknown };
    if (!statut) { res.status(400).json({ erreur: "statut requis" }); return; }
    const result = await changerStatut(cooperativeId, id, userId, statut, notes, positionGps);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "handleChangerStatut");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleConfirmerReception(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const result = await confirmerReception(cooperativeId, id, userId, req.body);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "handleConfirmerReception");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleGetLotsDisponibles(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const expeditionId = parseInt(String(req.params["id"]), 10);
  if (isNaN(expeditionId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const lots = await getLotsDisponibles(cooperativeId, expeditionId);
    res.json(lots);
  } catch (err) {
    req.log.error({ err }, "handleGetLotsDisponibles");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleRattacherLot(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const expeditionId = parseInt(String(req.params["id"]), 10);
  const { lotId } = req.body as { lotId?: number };
  if (isNaN(expeditionId) || !lotId) { res.status(400).json({ erreur: "Données invalides" }); return; }
  try {
    const row = await rattacherLot(expeditionId, lotId, cooperativeId);
    res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleDetacherLot(req: Request, res: Response): Promise<void> {
  const expeditionId = parseInt(String(req.params["id"]), 10);
  const expeditionLotId = parseInt(String(req.params["lotRowId"]), 10);
  if (isNaN(expeditionId) || isNaN(expeditionLotId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    await detacherLot(expeditionLotId, expeditionId);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleGetFlotteVehicules(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const vehicules = await getFlotteVehicules(cooperativeId);
    res.json(vehicules);
  } catch (err) {
    req.log.error({ err }, "handleGetFlotteVehicules");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetFlotteChauffeurs(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const chauffeurs = await getFlotteChauffeurs(cooperativeId);
    res.json(chauffeurs);
  } catch (err) {
    req.log.error({ err }, "handleGetFlotteChauffeurs");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleRapportEudr(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const rapport = await getRapportEudr(cooperativeId, id);
    res.json(rapport);
  } catch (err: unknown) {
    req.log.error({ err }, "handleRapportEudr");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

import type { Request, Response } from "express";
import {
  archiverCampagne,
  getArchivesCampagnes,
  getArchiveCampagne,
  getArchiveLivraisons,
  getArchiveMembres,
  comparerCampagnes,
  verifierIntegrite,
} from "../services/archiveService";

function coopId(req: Request): number | null {
  return req.user?.cooperativeId ?? null;
}
function userId(req: Request): number | null {
  return req.user?.id ?? null;
}

export async function handleListArchives(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    res.json(await getArchivesCampagnes(cid));
  } catch (err) {
    req.log.error({ err }, "handleListArchives");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetArchive(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const campagneId = parseInt(String(req.params["campagneId"]), 10);
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    res.json(await getArchiveCampagne(cid, campagneId));
  } catch (err) {
    req.log.error({ err }, "handleGetArchive");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(404).json({ erreur: msg });
  }
}

export async function handleArchiveLivraisons(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const campagneId = parseInt(String(req.params["campagneId"]), 10);
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const { search, zone, delegue, offset, limit } = req.query as Record<string, string>;
    res.json(await getArchiveLivraisons(cid, campagneId, {
      search, zone, delegue,
      offset: offset ? parseInt(offset, 10) : 0,
      limit:  limit  ? parseInt(limit, 10)  : 50,
    }));
  } catch (err) {
    req.log.error({ err }, "handleArchiveLivraisons");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleArchiveMembres(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const campagneId = parseInt(String(req.params["campagneId"]), 10);
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const { search, zone, actif, offset, limit } = req.query as Record<string, string>;
    res.json(await getArchiveMembres(cid, campagneId, {
      search, zone,
      actif:  actif !== undefined ? actif === "true" : undefined,
      offset: offset ? parseInt(offset, 10) : 0,
      limit:  limit  ? parseInt(limit, 10)  : 50,
    }));
  } catch (err) {
    req.log.error({ err }, "handleArchiveMembres");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleComparerCampagnes(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const ids = (req.query["ids"] as string | undefined)
      ?.split(",").map(Number).filter(n => !isNaN(n)) ?? [];
    res.json(await comparerCampagnes(cid, ids));
  } catch (err) {
    req.log.error({ err }, "handleComparerCampagnes");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleVerifierIntegrite(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const campagneId = parseInt(String(req.params["campagneId"]), 10);
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    res.json(await verifierIntegrite(cid, campagneId));
  } catch (err) {
    req.log.error({ err }, "handleVerifierIntegrite");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(404).json({ erreur: msg });
  }
}

export async function handleArchiverCampagne(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  const uid = userId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const campagneId = parseInt(String(req.params["campagneId"]), 10);
  if (isNaN(campagneId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    await archiverCampagne(cid, campagneId, uid);
    res.json({ ok: true, message: "Campagne archivée avec succès" });
  } catch (err) {
    req.log.error({ err }, "handleArchiverCampagne");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

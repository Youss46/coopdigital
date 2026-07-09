import type { Request, Response } from "express";
import {
  listCertifications,
  getCertification,
  getAuditsCertification,
  getStatsCertifications,
  createCertification,
  updateCertification,
  deleteCertification,
} from "../services/certificationService";

function coopId(req: Request): number | null {
  return req.user?.cooperativeId ?? null;
}
function userId(req: Request): number | null {
  return req.user?.id ?? null;
}

export async function handleListCertifications(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    res.json(await listCertifications(cid));
  } catch (err) {
    req.log.error({ err }, "handleListCertifications");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetStatsCertifications(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    res.json(await getStatsCertifications(cid));
  } catch (err) {
    req.log.error({ err }, "handleGetStatsCertifications");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const cert = await getCertification(cid, id);
    if (!cert) { res.status(404).json({ erreur: "Certification introuvable" }); return; }
    res.json(cert);
  } catch (err) {
    req.log.error({ err }, "handleGetCertification");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetAuditsCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    res.json(await getAuditsCertification(cid, id));
  } catch (err) {
    req.log.error({ err }, "handleGetAuditsCertification");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  const uid = userId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Non autorisé" }); return; }
  try {
    const cert = await createCertification(cid, req.body, uid);
    res.status(201).json(cert);
  } catch (err) {
    req.log.error({ err }, "handleCreateCertification");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleUpdateCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  const uid = userId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Non autorisé" }); return; }
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const cert = await updateCertification(cid, id, req.body, uid);
    res.json(cert);
  } catch (err) {
    req.log.error({ err }, "handleUpdateCertification");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(msg === "Certification introuvable" ? 404 : 500).json({ erreur: msg });
  }
}

export async function handleDeleteCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  const uid = userId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Non autorisé" }); return; }
  const id = parseInt(String(req.params["id"]), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    await deleteCertification(cid, id, uid);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "handleDeleteCertification");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(msg === "Certification introuvable" ? 404 : 500).json({ erreur: msg });
  }
}

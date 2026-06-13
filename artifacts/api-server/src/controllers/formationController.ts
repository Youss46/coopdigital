import { Request, Response } from "express";
import * as svc from "../services/formationService.js";

// ─── Programmes ───────────────────────────────────────────────────────────────

export async function getProgrammes(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.listProgrammes(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getProgrammes"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function postProgramme(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const body = req.body as { titre: string; description?: string; thematiques?: string[]; financeur?: string; budgetFcfa?: number; dateDebut?: string; dateFin?: string; };
    if (!body.titre) { res.status(400).json({ error: "titre requis" }); return; }
    res.status(201).json(await svc.createProgramme(cooperativeId, body));
  } catch (err) { req.log.error({ err }, "postProgramme"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function putProgramme(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    const row = await svc.updateProgramme(cooperativeId, id, req.body);
    if (!row) { res.status(404).json({ error: "Programme introuvable" }); return; }
    res.json(row);
  } catch (err) { req.log.error({ err }, "putProgramme"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function deleteProgramme(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    await svc.deleteProgramme(cooperativeId, parseInt(String(req.params["id"]), 10));
    res.json({ ok: true });
  } catch (err) { req.log.error({ err }, "deleteProgramme"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessions(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const { statut, programme_id, upcoming } = req.query as Record<string, string | undefined>;
    res.json(await svc.listSessions(cooperativeId, {
      statut,
      programmeId: programme_id ? parseInt(programme_id, 10) : undefined,
      upcoming: upcoming === "1" || upcoming === "true",
    }));
  } catch (err) { req.log.error({ err }, "getSessions"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function postSession(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const body = req.body as { titre: string; dateSession: string; [k: string]: unknown };
    if (!body.titre || !body.dateSession) { res.status(400).json({ error: "titre et dateSession requis" }); return; }
    res.status(201).json(await svc.createSession(cooperativeId, body as Parameters<typeof svc.createSession>[1]));
  } catch (err) { req.log.error({ err }, "postSession"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function putSession(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    const row = await svc.updateSession(cooperativeId, id, req.body);
    if (!row) { res.status(404).json({ error: "Session introuvable" }); return; }
    res.json(row);
  } catch (err) { req.log.error({ err }, "putSession"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Inscriptions ─────────────────────────────────────────────────────────────

export async function postInscrire(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    const { membreIds, zone, section, tous } = req.body as { membreIds?: number[]; zone?: string; section?: string; tous?: boolean };
    const result = await svc.inscrireMembres(cooperativeId, id, { membreIds, zone, section, tous });
    res.json(result);
  } catch (err) {
    const e = err as { code?: string; disponibles?: number; message?: string };
    if (e.code === "CAPACITE_DEPASSEE") {
      res.status(422).json({ erreur: e.message ?? "Session complète", code: "CAPACITE_DEPASSEE", disponibles: e.disponibles ?? 0 });
      return;
    }
    req.log.error({ err }, "postInscrire"); res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function getInscrits(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    const delegueId = req.user?.role === "delegue" ? req.user?.id : undefined;
    res.json(await svc.getInscrits(cooperativeId, id, delegueId));
  } catch (err) { req.log.error({ err }, "getInscrits"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function deleteInscription(req: Request, res: Response): Promise<void> {
  try {
    const sessionId = parseInt(String(req.params["id"]), 10);
    const membreId  = parseInt(String(req.params["membreId"]), 10);
    await svc.desinscrireMembre(sessionId, membreId);
    res.json({ ok: true });
  } catch (err) { req.log.error({ err }, "deleteInscription"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Présences ────────────────────────────────────────────────────────────────

export async function putPresences(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const { presences } = req.body as { presences: Array<{ membreId: number; statut: string }> };
    if (!Array.isArray(presences)) { res.status(400).json({ error: "presences[] requis" }); return; }
    res.json(await svc.enregistrerPresences(id, presences));
  } catch (err) { req.log.error({ err }, "putPresences"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── SMS ──────────────────────────────────────────────────────────────────────

export async function postConvoquer(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    res.json(await svc.envoyerConvocations(cooperativeId, id));
  } catch (err) { req.log.error({ err }, "postConvoquer"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function postRappel(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    res.json(await svc.envoyerRappels(cooperativeId, id));
  } catch (err) { req.log.error({ err }, "postRappel"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Attestations ─────────────────────────────────────────────────────────────

export async function postAttestations(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    res.json(await svc.genererAttestations(id));
  } catch (err) { req.log.error({ err }, "postAttestations"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function getAttestation(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const sessionId = parseInt(String(req.params["id"]), 10);
    const membreId  = parseInt(String(req.params["membreId"]), 10);
    const buffer = await svc.genererPdfAttestation(cooperativeId, sessionId, membreId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="attestation-${sessionId}-${membreId}.pdf"`);
    res.send(buffer);
  } catch (err) { req.log.error({ err }, "getAttestation"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function getListeAttestations(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const { session_id, membre_id, q } = req.query as Record<string, string | undefined>;
    const delegueId = req.user?.role === "delegue" ? req.user?.id : undefined;
    res.json(await svc.listAttestations(cooperativeId, {
      sessionId: session_id ? parseInt(session_id, 10) : undefined,
      membreId:  membre_id  ? parseInt(membre_id, 10)  : undefined,
      search:    q,
      delegueId,
    }));
  } catch (err) { req.log.error({ err }, "getListeAttestations"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Stats membre ─────────────────────────────────────────────────────────────

export async function getStatsMembre(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["membreId"]), 10);
    res.json(await svc.getStatsMembre(cooperativeId, id));
  } catch (err) { req.log.error({ err }, "getStatsMembre"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Stats globales ───────────────────────────────────────────────────────────

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.getStats(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getStats formations"); res.status(500).json({ error: "Erreur serveur" }); }
}

import { type Request, type Response } from "express";
import * as svc from "../services/chequesService.js";

function getCoop(req: Request) { return req.user?.cooperativeId ?? null; }
function getUser(req: Request) { return req.user?.id ?? null; }

// ─── GET /cheques ──────────────────────────────────────────────────────────────

export async function getCheques(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const statut = req.query["statut"] ? String(req.query["statut"]) : undefined;
  try {
    const rows = await svc.listCheques(cooperativeId, statut);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getCheques");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── POST /cheques ─────────────────────────────────────────────────────────────

export async function postCheque(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  const userId = getUser(req);
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const body = (req.body ?? {}) as {
    numeroCheque?: string;
    beneficiaire?: string;
    montantFcfa?: number;
    compteBancaireId?: number;
    dateEmission?: string;
    dateEcheance?: string;
  };
  if (!body.beneficiaire?.trim() || !body.montantFcfa || body.montantFcfa <= 0) {
    res.status(400).json({ erreur: "Bénéficiaire et montant obligatoires" });
    return;
  }
  try {
    const cheque = await svc.creerCheque(cooperativeId, {
      numeroCheque:     body.numeroCheque,
      beneficiaire:     body.beneficiaire,
      montantFcfa:      body.montantFcfa,
      compteBancaireId: body.compteBancaireId,
      dateEmission:     body.dateEmission,
      dateEcheance:     body.dateEcheance,
    }, userId);
    res.status(201).json(cheque);
  } catch (err) {
    req.log.error({ err }, "Erreur postCheque");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── PUT /cheques/:id ─────────────────────────────────────────────────────────

export async function putCheque(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const body = (req.body ?? {}) as {
    numeroCheque?: string | null;
    compteBancaireId?: number | null;
    dateEcheance?: string | null;
    beneficiaire?: string;
  };
  try {
    const updated = await svc.mettreAJourCheque(id, cooperativeId, body);
    res.json(updated);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Chèque introuvable") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Seul un chèque")) { res.status(409).json({ erreur: msg }); return; }
    req.log.error({ err }, "Erreur putCheque");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── POST /cheques/:id/encaisser ──────────────────────────────────────────────

export async function postEncaisser(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  const userId = getUser(req);
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const body = (req.body ?? {}) as { compteBancaireId?: number; dateEncaissement?: string };
  if (!body.compteBancaireId) {
    res.status(400).json({ erreur: "Le compte bancaire est obligatoire pour encaisser un chèque" });
    return;
  }
  try {
    const result = await svc.encaisserCheque(id, cooperativeId, {
      compteBancaireId:  body.compteBancaireId,
      dateEncaissement:  body.dateEncaissement,
    }, userId);
    res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Chèque introuvable") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Seul un chèque")) { res.status(409).json({ erreur: msg }); return; }
    req.log.error({ err }, "Erreur postEncaisser");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── POST /cheques/:id/rejeter ────────────────────────────────────────────────

export async function postRejeter(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  const userId = getUser(req);
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const body = (req.body ?? {}) as { motifRejet?: string; dateRejet?: string };
  if (!body.motifRejet?.trim()) {
    res.status(400).json({ erreur: "Le motif de rejet est obligatoire" });
    return;
  }
  try {
    const result = await svc.rejeterCheque(id, cooperativeId, {
      motifRejet: body.motifRejet,
      dateRejet:  body.dateRejet,
    }, userId);
    res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Chèque introuvable") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Seul un chèque")) { res.status(409).json({ erreur: msg }); return; }
    req.log.error({ err }, "Erreur postRejeter");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── POST /cheques/:id/annuler ────────────────────────────────────────────────

export async function postAnnuler(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  const body = (req.body ?? {}) as { motifAnnulation?: string };
  if (!body.motifAnnulation?.trim()) {
    res.status(400).json({ erreur: "Le motif d'annulation est obligatoire" });
    return;
  }
  try {
    const result = await svc.annulerCheque(id, cooperativeId, { motifAnnulation: body.motifAnnulation });
    res.json(result);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Chèque introuvable") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Seul un chèque")) { res.status(409).json({ erreur: msg }); return; }
    req.log.error({ err }, "Erreur postAnnuler");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

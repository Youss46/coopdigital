import { type Request, type Response } from "express";
import * as svc from "../services/chequesService.js";
import * as recusSvc from "../services/chequesRecusService.js";

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
    if (msg === "Compte bancaire introuvable" || msg === "Compte bancaire inactif") {
      res.status(400).json({ erreur: msg });
      return;
    }
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

// ─── Chèques reçus ─────────────────────────────────────────────────────────────

export async function getChequesRecus(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const statut = req.query["statut"] ? String(req.query["statut"]) : undefined;
  try {
    res.json(await recusSvc.listChequesRecus(cooperativeId, statut));
  } catch (err) {
    req.log.error({ err }, "Erreur getChequesRecus");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function postCreerRecu(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  const userId = getUser(req);
  if (!cooperativeId || !userId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const body = (req.body ?? {}) as {
    venteExportateurId?: number;
    numeroCheque?: string;
    banque?: string;
    montantFcfa?: number;
    dateReception?: string;
    dateEcheance?: string | null;
  };
  const venteExportateurId = Number(body.venteExportateurId);
  const montantFcfa = Number(body.montantFcfa);
  const dateReception = body.dateReception?.trim() || new Date().toISOString().slice(0, 10);
  if (
    !Number.isInteger(venteExportateurId) ||
    venteExportateurId <= 0 ||
    !body.numeroCheque?.trim() ||
    !body.banque?.trim() ||
    !Number.isInteger(montantFcfa) ||
    montantFcfa <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dateReception)
  ) {
    res.status(400).json({
      erreur: "Vente, numéro, banque, montant et date de réception sont obligatoires",
    });
    return;
  }

  try {
    const cheque = await recusSvc.creerChequeRecu(cooperativeId, {
      venteExportateurId,
      numeroCheque: body.numeroCheque.trim(),
      banque: body.banque.trim(),
      montantFcfa,
      dateReception,
      dateEcheance: body.dateEcheance?.trim() || null,
      createdBy: userId,
    });
    res.status(201).json(cheque);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Vente exportateur introuvable") {
      res.status(404).json({ erreur: msg });
      return;
    }
    if (
      msg === "La vente est déjà réglée" ||
      msg.startsWith("Le montant dépasse") ||
      msg.includes("numéro de chèque") ||
      msg.includes("duplicate key")
    ) {
      res.status(409).json({
        erreur: msg.includes("duplicate key")
          ? "Ce numéro de chèque existe déjà pour cette coopérative."
          : msg,
      });
      return;
    }
    req.log.error({ err }, "Erreur postCreerRecu");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function postDeposerRecu(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    res.json(await recusSvc.deposerChequeRecu(id, cooperativeId, (req.body ?? {}).dateDepot));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Chèque reçu introuvable") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Seul un chèque")) { res.status(409).json({ erreur: msg }); return; }
    req.log.error({ err }, "Erreur postDeposerRecu");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function postEncaisserRecu(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  const userId = getUser(req);
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const id = parseInt(String(req.params["id"]));
  const body = (req.body ?? {}) as { compteBancaireId?: number; dateEncaissement?: string };
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  if (!body.compteBancaireId) {
    res.status(400).json({ erreur: "Le compte bancaire est obligatoire pour encaisser un chèque reçu" });
    return;
  }
  try {
    res.json(await recusSvc.encaisserChequeRecu(id, cooperativeId, {
      compteBancaireId: body.compteBancaireId,
      dateEncaissement: body.dateEncaissement,
    }, userId));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Chèque reçu introuvable") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Le chèque doit")) { res.status(409).json({ erreur: msg }); return; }
    if (msg === "Compte bancaire introuvable" || msg === "Compte bancaire inactif") {
      res.status(400).json({ erreur: msg }); return;
    }
    req.log.error({ err }, "Erreur postEncaisserRecu");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function postRejeterRecu(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const id = parseInt(String(req.params["id"]));
  const body = (req.body ?? {}) as { motifRejet?: string; dateRejet?: string };
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  if (!body.motifRejet?.trim()) { res.status(400).json({ erreur: "Le motif de rejet est obligatoire" }); return; }
  try {
    res.json(await recusSvc.rejeterChequeRecu(id, cooperativeId, {
      motifRejet: body.motifRejet,
      dateRejet: body.dateRejet,
    }));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Chèque reçu introuvable") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Seul un chèque")) { res.status(409).json({ erreur: msg }); return; }
    req.log.error({ err }, "Erreur postRejeterRecu");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function postAnnulerRecu(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  const id = parseInt(String(req.params["id"]));
  const motifAnnulation = String((req.body ?? {}).motifAnnulation ?? "").trim();
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  if (!motifAnnulation) { res.status(400).json({ erreur: "Le motif d'annulation est obligatoire" }); return; }
  try {
    res.json(await recusSvc.annulerChequeRecu(id, cooperativeId, motifAnnulation));
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Chèque reçu introuvable") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Seul un chèque")) { res.status(409).json({ erreur: msg }); return; }
    req.log.error({ err }, "Erreur postAnnulerRecu");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

import type { Request, Response } from "express";
import * as svc from "../services/commissionMembreDelegueService.js";

// ─── Taux ─────────────────────────────────────────────────────────────────

export async function listTauxHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const taux = await svc.listTauxMembres(cooperativeId);
    res.json(taux);
  } catch (err) {
    req.log.error({ err }, "listTauxMembresDelegues");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function upsertTauxHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const { id, campagneId, membreDelegueId, tauxFcfaParKg, dateDebut, dateFin, frequencePaiement, actif } = req.body as {
    id?: number;
    campagneId?: number | null;
    membreDelegueId?: number | null;
    tauxFcfaParKg: number;
    dateDebut: string;
    dateFin?: string | null;
    frequencePaiement?: "chaque_paiement" | "fin_campagne";
    actif?: boolean;
  };
  if (!tauxFcfaParKg || tauxFcfaParKg <= 0) {
    res.status(400).json({ erreur: "tauxFcfaParKg doit être > 0" });
    return;
  }
  if (!dateDebut) {
    res.status(400).json({ erreur: "dateDebut est obligatoire" });
    return;
  }
  try {
    const row = await svc.upsertTauxMembre(cooperativeId, {
      id, campagneId, membreDelegueId, tauxFcfaParKg, dateDebut, dateFin, frequencePaiement, actif,
    });
    res.status(id ? 200 : 201).json(row);
  } catch (err) {
    req.log.error({ err }, "upsertTauxMembreDelegue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function deleteTauxHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const id = Number(req.params["tauxId"]);
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    await svc.deleteTauxMembre(id, cooperativeId);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "deleteTauxMembreDelegue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Récapitulatif global ─────────────────────────────────────────────────

export async function getRecapHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const campagneId = req.query["campagneId"] ? Number(req.query["campagneId"]) : undefined;
  try {
    const recap = await svc.getRecapCommissionsParMembreDelegue(cooperativeId, campagneId);
    res.json(recap);
  } catch (err) {
    req.log.error({ err }, "getRecapCommissionsMembresDelegues");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Commissions d'un membre délégué ─────────────────────────────────────

export async function getCommissionsHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const membreId = Number(req.params["membreId"]);
  const campagneId = req.query["campagneId"] ? Number(req.query["campagneId"]) : undefined;
  try {
    const data = await svc.getCommissionsMembreDelegue(membreId, cooperativeId, campagneId);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "getCommissionsMembreDelegue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Paiement ─────────────────────────────────────────────────────────────

export async function payerHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const membreId = Number(req.params["membreId"]);
  const { commissionIds, modePaiement, referencePaiement } = req.body as {
    commissionIds?: number[];
    modePaiement: string;
    referencePaiement?: string | null;
  };
  if (!modePaiement) { res.status(400).json({ erreur: "modePaiement est obligatoire" }); return; }
  try {
    const result = await svc.payerCommissionsMembreDelegue(membreId, cooperativeId, {
      commissionIds,
      modePaiement,
      referencePaiement,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "payerCommissionsMembreDelegue");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(500).json({ erreur: msg });
  }
}

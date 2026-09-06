import type { Request, Response } from "express";
import * as commissionService from "../services/commissionService.js";

// ─── Récapitulatif global par délégué ─────────────────────────────────────

export async function getRecapCommissionsHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const campagneId = req.query.campagneId ? Number(req.query.campagneId) : undefined;
  try {
    const recap = await commissionService.getRecapCommissionsParDelegue(cooperativeId, campagneId);
    res.json(recap);
  } catch (err) {
    req.log.error({ err }, "getRecapCommissions");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Taux (admin) ─────────────────────────────────────────────────────────

export async function listTauxHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const taux = await commissionService.listTaux(cooperativeId);
    res.json(taux);
  } catch (err) {
    req.log.error({ err }, "listTaux");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function upsertTauxHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const { id, campagneId, delegueId, tauxFcfaParKg, dateDebut, dateFin, actif } = req.body as {
    id?: number;
    campagneId?: number | null;
    delegueId?: number | null;
    tauxFcfaParKg: number;
    dateDebut: string;
    dateFin?: string | null;
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
    const row = await commissionService.upsertTaux(cooperativeId, {
      id, campagneId, delegueId, tauxFcfaParKg, dateDebut, dateFin, actif,
    });
    res.status(id ? 200 : 201).json(row);
  } catch (err) {
    req.log.error({ err }, "upsertTaux");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function deleteTauxHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const id = Number(req.params.tauxId);
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    await commissionService.deleteTaux(id, cooperativeId);
    res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "deleteTaux");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Commissions d'un délégué (admin) ────────────────────────────────────

export async function getCommissionsDelegueHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const delegueId = Number(req.params.agentId);
  const campagneId = req.query.campagneId ? Number(req.query.campagneId) : undefined;
  try {
    const data = await commissionService.getCommissionsDelegue(delegueId, cooperativeId, campagneId);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "getCommissionsDelegue");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function payerCommissionsHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const delegueId = Number(req.params.agentId);
  const { commissionIds, modePaiement, referencePaiement } = req.body as {
    commissionIds?: number[];
    modePaiement: string;
    referencePaiement?: string;
  };

  if (!modePaiement || !commissionService.MODES_PAIEMENT_COMMISSION.includes(modePaiement as commissionService.ModePaiementCommission)) {
    res.status(400).json({ erreur: `modePaiement invalide. Valeurs acceptées : ${commissionService.MODES_PAIEMENT_COMMISSION.join(", ")}` });
    return;
  }

  try {
    const result = await commissionService.payerCommissions(
      delegueId,
      cooperativeId,
      modePaiement as commissionService.ModePaiementCommission,
      commissionIds,
      referencePaiement,
      req.user?.id,
    );
    if (result.nb === 0) {
      res.status(400).json({ erreur: "Aucune commission en attente à payer" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "payerCommissions");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Vue délégué terrain (mes commissions) ───────────────────────────────

export async function getMesCommissionsHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  let campagneId: number | undefined;
  if (req.query.campagneId !== undefined) {
    const parsed = Number(req.query.campagneId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ erreur: "campagneId doit être un entier positif" });
      return;
    }
    campagneId = parsed;
  }
  try {
    const data = await commissionService.getResumeMesCommissions(agent.id, campagneId);
    res.json(data);
  } catch (err) {
    req.log.error({ err }, "getMesCommissions");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

import type { Request, Response } from "express";
import * as prixService from "../services/prixService";

const pid = (v: string | string[]) => parseInt(Array.isArray(v) ? v[0] : v, 10);

// GET /api/prix/actuel
export async function getPrixActuel(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const historique = await prixService.getHistorique(cooperativeId, { limit: 1 });
  res.json(historique[0] ?? null);
}

// POST /api/prix
export async function saisirPrix(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const { campagneId, datePrix, prixBordChampFcfa, prixVenteExportFcfa, source } = req.body as {
    campagneId?: number;
    datePrix: string;
    prixBordChampFcfa: number;
    prixVenteExportFcfa: number;
    source?: string;
  };

  if (!datePrix || !prixBordChampFcfa || !prixVenteExportFcfa) {
    res.status(400).json({ erreur: "datePrix, prixBordChampFcfa et prixVenteExportFcfa sont requis" });
    return;
  }

  const nouveau = await prixService.saisirPrix(cooperativeId, {
    campagneId,
    datePrix,
    prixBordChampFcfa: Number(prixBordChampFcfa),
    prixVenteExportFcfa: Number(prixVenteExportFcfa),
    source,
    saisiPar: req.user?.id,
  });
  res.status(201).json(nouveau);
}

// GET /api/prix/historique
export async function getHistorique(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const { campagneId, dateDebut, dateFin, limit } = req.query as Record<string, string>;
  const rows = await prixService.getHistorique(cooperativeId, {
    campagneId: campagneId ? parseInt(campagneId) : undefined,
    dateDebut,
    dateFin,
    limit: limit ? parseInt(limit) : undefined,
  });
  res.json(rows);
}

// GET /api/prix/analyse-marge
export async function getAnalyseMarge(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const { campagneId } = req.query as { campagneId?: string };
  const result = await prixService.analyserMarge(cooperativeId, {
    campagneId: campagneId ? parseInt(campagneId) : undefined,
  });
  res.json(result);
}

// GET /api/prix/comparaison
export async function getComparaison(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const rows = await prixService.getComparaison(cooperativeId);
  res.json(rows);
}

// GET /api/prix/tendance
export async function getTendance(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const result = await prixService.getTendance(cooperativeId);
  res.json(result ?? { direction: "stable", moyenneMobile: 0, variationSemainePct: 0, dernierPrix: null, series: [] });
}

// PUT /api/prix/config
export async function updateConfig(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const { seuilMargeMinimumFcfa, seuilVariationAlertePct, diffusionAutoSms } = req.body as {
    seuilMargeMinimumFcfa?: number;
    seuilVariationAlertePct?: number;
    diffusionAutoSms?: boolean;
  };
  const config = await prixService.updateConfig(cooperativeId, { seuilMargeMinimumFcfa, seuilVariationAlertePct, diffusionAutoSms });
  res.json(config);
}

// GET /api/prix/config
export async function getConfig(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const config = await prixService.getConfig(cooperativeId);
  res.json(config ?? { seuilMargeMinimumFcfa: 100, seuilVariationAlertePct: 10, diffusionAutoSms: false });
}

// GET /api/prix/alertes
export async function getAlertes(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const nonLuesSeulement = req.query.nonLues === "true";
  const alertes = await prixService.getAlertes(cooperativeId, nonLuesSeulement);
  res.json(alertes);
}

// PUT /api/prix/alertes/:id/lu
export async function marquerAlerteLue(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const id = pid(req.params.id!);
  const alerte = await prixService.marquerAlerteLue(cooperativeId, id);
  if (!alerte) { res.status(404).json({ erreur: "Alerte introuvable" }); return; }
  res.json(alerte);
}

// POST /api/prix/diffuser-sms
export async function diffuserSMS(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const { prix, date } = req.body as { prix: number; date: string };
  if (!prix || !date) {
    res.status(400).json({ erreur: "prix et date requis" });
    return;
  }
  const result = await prixService.diffuserPrixSMS(cooperativeId, Number(prix), date);
  res.json(result);
}

// GET /api/prix/simulation
export async function getSimulation(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId ?? 1;
  const { prixHypothetique } = req.query as { prixHypothetique?: string };
  if (!prixHypothetique) {
    res.status(400).json({ erreur: "prixHypothetique requis" });
    return;
  }
  const result = await prixService.simulerMarge(cooperativeId, parseInt(prixHypothetique));
  res.json(result);
}

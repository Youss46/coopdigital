import { type Request, type Response } from "express";
import * as service from "../services/reglementsCartesProducteursService.js";

function getCoop(req: Request) { return req.user?.cooperativeId ?? null; }
function getUser(req: Request) { return req.user?.id ?? null; }
function getId(req: Request) { return Number.parseInt(String(req.params["id"]), 10); }

export async function list(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  try {
    res.json(await service.listReglementsCartesProducteurs(cooperativeId, req.query["statut"] ? String(req.query["statut"]) : undefined));
  } catch (err) {
    req.log.error({ err }, "Erreur listReglementsCartesProducteurs");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function payer(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  const userId = getUser(req);
  const id = getId(req);
  const compteBancaireId = Number(req.body?.compteBancaireId);
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(compteBancaireId) || compteBancaireId <= 0) {
    res.status(400).json({ erreur: "Le règlement et le compte bancaire sont obligatoires" }); return;
  }
  try {
    res.json(await service.payerReglementCarteProducteur(id, cooperativeId, {
      compteBancaireId,
      datePaiement: req.body?.datePaiement,
    }, userId));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Impossible de marquer le règlement payé";
    if (/introuvable/i.test(message)) { res.status(404).json({ erreur: message }); return; }
    if (/Seul|déjà|inactif|insuffisant|format/i.test(message)) { res.status(409).json({ erreur: message }); return; }
    req.log.error({ err }, "Erreur payerReglementCarteProducteur");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function rejeter(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  const id = getId(req);
  const motifRejet = String(req.body?.motifRejet ?? "").trim();
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  if (!motifRejet) { res.status(400).json({ erreur: "Le motif de rejet est obligatoire" }); return; }
  try { res.json(await service.rejeterReglementCarteProducteur(id, cooperativeId, motifRejet)); }
  catch (err) {
    const message = err instanceof Error ? err.message : "Impossible de rejeter le règlement";
    if (/introuvable/i.test(message)) { res.status(404).json({ erreur: message }); return; }
    if (/Seul/i.test(message)) { res.status(409).json({ erreur: message }); return; }
    req.log.error({ err }, "Erreur rejeterReglementCarteProducteur");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function annuler(req: Request, res: Response): Promise<void> {
  const cooperativeId = getCoop(req);
  const id = getId(req);
  const motifAnnulation = String(req.body?.motifAnnulation ?? "").trim();
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée à ce compte" }); return; }
  if (!motifAnnulation) { res.status(400).json({ erreur: "Le motif d'annulation est obligatoire" }); return; }
  try { res.json(await service.annulerReglementCarteProducteur(id, cooperativeId, motifAnnulation)); }
  catch (err) {
    const message = err instanceof Error ? err.message : "Impossible d'annuler le règlement";
    if (/introuvable/i.test(message)) { res.status(404).json({ erreur: message }); return; }
    if (/Seul/i.test(message)) { res.status(409).json({ erreur: message }); return; }
    req.log.error({ err }, "Erreur annulerReglementCarteProducteur");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
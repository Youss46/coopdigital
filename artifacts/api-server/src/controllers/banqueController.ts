import { Request, Response } from "express";
import * as svc from "../services/banqueService.js";

function coopId(req: Request): number | null {
  return req.user?.cooperativeId ?? null;
}

// ─── Comptes ──────────────────────────────────────────────────────────────────

export async function getComptes(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try { res.json(await svc.listComptes(cid)); }
  catch (err) { req.log.error({ err }, "getComptesBancaires"); res.status(500).json({ erreur: "Erreur serveur" }); }
}

export async function postCompte(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const { nom, banque, numeroCompte, iban, soldeInitial, soldeMiniAlerte } = req.body as {
    nom?: string; banque?: string; numeroCompte?: string; iban?: string;
    soldeInitial?: number; soldeMiniAlerte?: number;
  };
  if (!nom || !banque) { res.status(400).json({ erreur: "nom et banque requis" }); return; }
  try {
    const compte = await svc.creerCompte(cid, { nom, banque, numeroCompte, iban, soldeInitial, soldeMiniAlerte });
    res.status(201).json(compte);
  } catch (err) { req.log.error({ err }, "postCompteBancaire"); res.status(500).json({ erreur: "Erreur serveur" }); }
}

export async function putCompte(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try {
    const id  = parseInt(String(req.params["id"]), 10);
    const row = await svc.updateCompte(id, cid, req.body);
    if (!row) { res.status(404).json({ erreur: "Compte introuvable" }); return; }
    res.json(row);
  } catch (err) { req.log.error({ err }, "putCompteBancaire"); res.status(500).json({ erreur: "Erreur serveur" }); }
}

// ─── Mouvements ───────────────────────────────────────────────────────────────

export async function postMouvement(req: Request, res: Response): Promise<void> {
  const cid    = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const compteId = parseInt(String(req.params["id"]), 10);
  const { type, motif, montantFcfa, libelle, reference, dateOperation, dateValeur } = req.body as {
    type?: "credit" | "debit"; motif?: string; montantFcfa?: number;
    libelle?: string; reference?: string; dateOperation?: string; dateValeur?: string;
  };
  if (!type || !motif || !montantFcfa) {
    res.status(400).json({ erreur: "type, motif et montantFcfa requis" }); return;
  }
  try {
    const result = await svc.enregistrerMouvement(compteId, cid, {
      type, motif, montantFcfa, libelle, reference,
      dateOperation, dateValeur,
      userId: req.user?.id,
    });
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postMouvementBanque");
    res.status(400).json({ erreur: msg });
  }
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export async function getJournal(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const compteId = parseInt(String(req.params["id"]), 10);
  const { dateDebut, dateFin, type, nonRapproche } = req.query as {
    dateDebut?: string; dateFin?: string; type?: string; nonRapproche?: string;
  };
  try {
    const rows = await svc.getJournal(compteId, cid, {
      dateDebut,
      dateFin,
      type,
      nonRapproché: nonRapproche === "1",
    });
    res.json(rows);
  } catch (err) { req.log.error({ err }, "getJournalBanque"); res.status(500).json({ erreur: "Erreur serveur" }); }
}

// ─── Rapprochement ────────────────────────────────────────────────────────────

export async function postRapprocher(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const compteId = parseInt(String(req.params["id"]), 10);
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ erreur: "ids (tableau d'identifiants) requis" }); return;
  }
  try {
    const result = await svc.rapprocherMouvements(compteId, cid, ids);
    res.json(result);
  } catch (err) { req.log.error({ err }, "postRapprocherBanque"); res.status(500).json({ erreur: "Erreur serveur" }); }
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

export async function getAlertes(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try { res.json(await svc.getAlertes(cid)); }
  catch (err) { req.log.error({ err }, "getAlertesBanque"); res.status(500).json({ erreur: "Erreur serveur" }); }
}

import { Request, Response } from "express";
import * as svc from "../services/fiscaliteService.js";

export async function getObligations(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.listObligations(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getObligations"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function postGenererMensuel(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const mois  = parseInt(String(req.params["mois"]), 10);
    const annee = parseInt(String(req.params["annee"]), 10);
    if (mois < 1 || mois > 12 || annee < 2000) { res.status(400).json({ error: "mois (1-12) et annee valides requis" }); return; }
    res.status(201).json(await svc.genererDeclarationsMensuelles(cooperativeId, mois, annee));
  } catch (err) { req.log.error({ err }, "postGenererMensuel"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function postGenererAnnuel(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const annee = parseInt(String(req.params["annee"]), 10);
    if (annee < 2000) { res.status(400).json({ error: "annee valide requise" }); return; }
    res.status(201).json(await svc.genererDeclarationsAnnuelles(cooperativeId, annee));
  } catch (err) { req.log.error({ err }, "postGenererAnnuel"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function getDeclarations(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const { statut, type_taxe, periode } = req.query as Record<string, string | undefined>;
    res.json(await svc.listDeclarations(cooperativeId, { statut, typeTaxe: type_taxe, periode }));
  } catch (err) { req.log.error({ err }, "getDeclarations"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function putPayer(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    const { montantPaye, reference, datePaiement } = req.body as {
      montantPaye: number; reference?: string; datePaiement?: string;
    };
    if (!montantPaye) { res.status(400).json({ error: "montantPaye requis" }); return; }
    res.json(await svc.enregistrerPaiement(cooperativeId, id, { montantPaye: Math.round(montantPaye), reference, datePaiement }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "putPayer");
    res.status(400).json({ error: msg });
  }
}

export async function getCalendrier(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.getCalendrier(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getCalendrier"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function getAlertes(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.getAlertes(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getAlertes fiscalite"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function getRapportAnnuel(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const annee = parseInt((req.query["annee"] as string) ?? String(new Date().getFullYear()), 10);
    res.json(await svc.getRapportAnnuel(cooperativeId, annee));
  } catch (err) { req.log.error({ err }, "getRapportAnnuel"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function getRapportPdf(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const annee = parseInt((req.query["annee"] as string) ?? String(new Date().getFullYear()), 10);
    const buf   = await svc.genererRapportPdf(cooperativeId, annee);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rapport-fiscal-${annee}.pdf"`);
    res.send(buf);
  } catch (err) { req.log.error({ err }, "getRapportPdf fiscalite"); res.status(500).json({ error: "Erreur serveur" }); }
}

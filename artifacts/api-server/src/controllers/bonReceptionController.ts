import type { Request, Response } from "express";
import * as svc from "../services/bonReceptionService.js";

// ─── Créer un bon de réception ─────────────────────────────────────────────

export async function creerBonHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const magasinierId  = req.user?.id;
  if (!cooperativeId || !magasinierId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const {
    membreDelegueId,
    poidsDeclaraKg, nombreSacsDeclares,
    typeTransport,
    vehiculeId, chauffeurId,
    typeVehicule, immatriculation, nomChauffeur, telephoneChauffeur,
    fraisCarburantFcfa, autresChargesFcfa, autresChargesLibelle,
    notes,
  } = req.body as Record<string, unknown>;

  if (!membreDelegueId) { res.status(400).json({ erreur: "membreDelegueId est obligatoire" }); return; }
  if (!typeTransport || !["cooperatif", "externe"].includes(String(typeTransport))) {
    res.status(400).json({ erreur: "typeTransport doit être 'cooperatif' ou 'externe'" }); return;
  }

  try {
    const bon = await svc.creerBonReception(cooperativeId, magasinierId, {
      membreDelegueId:     Number(membreDelegueId),
      poidsDeclaraKg:      poidsDeclaraKg != null ? Number(poidsDeclaraKg) : null,
      nombreSacsDeclares:  nombreSacsDeclares != null ? Number(nombreSacsDeclares) : null,
      typeTransport:       typeTransport as "cooperatif" | "externe",
      vehiculeId:          vehiculeId != null ? Number(vehiculeId) : null,
      chauffeurId:         chauffeurId != null ? Number(chauffeurId) : null,
      typeVehicule:        typeVehicule != null ? String(typeVehicule) : null,
      immatriculation:     immatriculation != null ? String(immatriculation) : null,
      nomChauffeur:        nomChauffeur != null ? String(nomChauffeur) : null,
      telephoneChauffeur:  telephoneChauffeur != null ? String(telephoneChauffeur) : null,
      fraisCarburantFcfa:  fraisCarburantFcfa != null ? Number(fraisCarburantFcfa) : 0,
      autresChargesFcfa:   autresChargesFcfa != null ? Number(autresChargesFcfa) : 0,
      autresChargesLibelle: autresChargesLibelle != null ? String(autresChargesLibelle) : null,
      notes:               notes != null ? String(notes) : null,
    });
    res.status(201).json(bon);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    req.log.error({ err }, "creerBonReception");
    res.status(400).json({ erreur: msg });
  }
}

// ─── Lister les bons ──────────────────────────────────────────────────────────

export async function listerBonsHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const { statuts } = req.query;
  const statutsList = statuts
    ? String(statuts).split(",").map(s => s.trim())
    : undefined;

  try {
    const bons = await svc.listerBonsReception(cooperativeId, { statuts: statutsList });
    res.json(bons);
  } catch (err) {
    req.log.error({ err }, "listerBonsReception");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Détail ───────────────────────────────────────────────────────────────────

export async function detailBonHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const id = Number(req.params["id"]);
  try {
    const bon = await svc.getBonReceptionDetail(id, cooperativeId);
    if (!bon) { res.status(404).json({ erreur: "Bon introuvable" }); return; }
    res.json(bon);
  } catch (err) {
    req.log.error({ err }, "detailBon");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Annuler ──────────────────────────────────────────────────────────────────

export async function annulerBonHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const id = Number(req.params["id"]);
  try {
    await svc.annulerBonReception(id, cooperativeId);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    req.log.error({ err }, "annulerBon");
    res.status(400).json({ erreur: msg });
  }
}

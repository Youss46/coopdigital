import type { Request, Response } from "express";
import * as svc from "../services/bonReceptionService.js";

function parseBonReceptionBody(body: Record<string, unknown>) {
  const {
    membreDelegueId,
    poidsDeclaraKg, nombreSacsDeclares,
    typeTransport,
    vehiculeId, chauffeurId,
    typeVehicule, immatriculation, nomChauffeur, telephoneChauffeur,
    fraisCarburantFcfa, autresChargesFcfa, autresChargesLibelle,
    notes,
  } = body;

  if (!Number.isInteger(Number(membreDelegueId)) || Number(membreDelegueId) <= 0) {
    throw new Error("membreDelegueId est obligatoire");
  }
  if (!typeTransport || !["cooperatif", "externe"].includes(String(typeTransport))) {
    throw new Error("typeTransport doit être 'cooperatif' ou 'externe'");
  }

  const parseMontant = (value: unknown, label: string) => {
    const montant = value == null || value === "" ? 0 : Number(value);
    if (!Number.isFinite(montant) || montant < 0) throw new Error(`${label} doit être un montant positif`);
    return montant;
  };
  const parseOptionalNumber = (value: unknown, label: string) => {
    if (value == null || value === "") return null;
    const nombre = Number(value);
    if (!Number.isFinite(nombre) || nombre < 0) throw new Error(`${label} doit être positif`);
    return nombre;
  };

  const transportCooperatif = typeTransport === "cooperatif";
  if (transportCooperatif && (!vehiculeId || !chauffeurId)) {
    throw new Error("Un véhicule et un chauffeur sont obligatoires pour le transport coopératif");
  }

  return {
    membreDelegueId: Number(membreDelegueId),
    poidsDeclaraKg: parseOptionalNumber(poidsDeclaraKg, "Le poids déclaré"),
    nombreSacsDeclares: parseOptionalNumber(nombreSacsDeclares, "Le nombre de sacs déclaré"),
    typeTransport: typeTransport as "cooperatif" | "externe",
    vehiculeId: transportCooperatif && vehiculeId != null ? Number(vehiculeId) : null,
    chauffeurId: transportCooperatif && chauffeurId != null ? Number(chauffeurId) : null,
    typeVehicule: !transportCooperatif && typeVehicule != null ? String(typeVehicule).trim() || null : null,
    immatriculation: !transportCooperatif && immatriculation != null ? String(immatriculation).trim() || null : null,
    nomChauffeur: !transportCooperatif && nomChauffeur != null ? String(nomChauffeur).trim() || null : null,
    telephoneChauffeur: !transportCooperatif && telephoneChauffeur != null ? String(telephoneChauffeur).trim() || null : null,
    fraisCarburantFcfa: parseMontant(fraisCarburantFcfa, "Le montant du carburant"),
    autresChargesFcfa: parseMontant(autresChargesFcfa, "Le montant des autres charges"),
    autresChargesLibelle: autresChargesLibelle != null ? String(autresChargesLibelle).trim() || null : null,
    notes: notes != null ? String(notes).trim() || null : null,
  };
}

// ─── Créer un bon de réception ─────────────────────────────────────────────

export async function creerBonHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const magasinierId  = req.user?.id;
  if (!cooperativeId || !magasinierId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  try {
    const bon = await svc.creerBonReception(
      cooperativeId,
      { id: magasinierId, role: req.user?.role ?? "magasinier" },
      parseBonReceptionBody(req.body as Record<string, unknown>),
    );
    res.status(201).json(bon);
  } catch (err) {
    const msg = apiError(err);
    req.log.error({ err }, "creerBonReception");
    res.status(400).json({ erreur: msg });
  }
}

export async function getBonReceptionOptionsTerrainHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  try {
    res.json(await svc.getOptionsCreationBonReception(cooperativeId));
  } catch (err) {
    req.log.error({ err }, "getBonReceptionOptionsTerrain");
    res.status(500).json({ erreur: "Impossible de charger les options du bon de réception" });
  }
}

export async function creerBonTerrainHandler(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId;
  const peseurId = req.agent?.id;
  if (!cooperativeId || !peseurId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  try {
    const bon = await svc.creerBonReception(
      cooperativeId,
      { id: peseurId, role: "peseur" },
      parseBonReceptionBody(req.body as Record<string, unknown>),
    );
    res.status(201).json(bon);
  } catch (err) {
    const msg = apiError(err);
    req.log.error({ err }, "creerBonTerrain");
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
    res.status(500).json({ erreur: apiError(err) });
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
    res.status(500).json({ erreur: apiError(err) });
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
    const msg = apiError(err);
    req.log.error({ err }, "annulerBon");
    res.status(400).json({ erreur: msg });
  }
}

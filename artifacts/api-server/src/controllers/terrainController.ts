import { type Request, type Response } from "express";
import * as terrainService from "../services/terrainService.js";

function getAgent(req: Request) {
  return req.agent!;
}

export async function loginTerrainHandler(req: Request, res: Response): Promise<void> {
  const { telephone, motDePasse } = req.body as { telephone?: string; motDePasse?: string };
  if (!telephone || !motDePasse) {
    res.status(400).json({ erreur: "Téléphone et mot de passe requis" });
    return;
  }

  try {
    const result = await terrainService.loginTerrain(telephone, motDePasse);
    if (!result) {
      res.status(401).json({ erreur: "Numéro ou mot de passe incorrect" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur login terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getProfilHandler(req: Request, res: Response): Promise<void> {
  const { id, cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  try {
    const profil = await terrainService.getProfilAgent(id, cooperativeId);
    res.json(profil);
  } catch (err) {
    req.log.error({ err }, "Erreur profil terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getPrixHandler(req: Request, res: Response): Promise<void> {
  const { cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  try {
    const prix = await terrainService.getPrixActuel(cooperativeId);
    res.json(prix);
  } catch (err) {
    req.log.error({ err }, "Erreur prix terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getFournisseursHandler(req: Request, res: Response): Promise<void> {
  const { cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const search = req.query["search"] as string | undefined;
  const section = req.query["section"] as string | undefined;
  try {
    const fournisseurs = await terrainService.getFournisseurs(cooperativeId, section, search);
    res.json(fournisseurs);
  } catch (err) {
    req.log.error({ err }, "Erreur fournisseurs terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getFournisseurRecapHandler(req: Request, res: Response): Promise<void> {
  const { cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const membreId = Number(req.params["id"]);
  if (isNaN(membreId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const recap = await terrainService.getFournisseurRecap(membreId, cooperativeId);
    if (!recap) { res.status(404).json({ erreur: "Fournisseur introuvable" }); return; }
    res.json(recap);
  } catch (err) {
    req.log.error({ err }, "Erreur recap fournisseur");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function postCollecteHandler(req: Request, res: Response): Promise<void> {
  const { id, cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const { membreId, nombreSacs, poidsBrutKg, retenueKg, modePaiement } = req.body as {
    membreId?: number;
    nombreSacs?: number;
    poidsBrutKg?: number;
    retenueKg?: number;
    modePaiement?: string;
  };
  if (!membreId || !poidsBrutKg || !modePaiement) {
    res.status(400).json({ erreur: "Données manquantes" });
    return;
  }
  try {
    const result = await terrainService.enregistrerCollecte(id, cooperativeId, {
      membreId,
      nombreSacs: nombreSacs ?? 1,
      poidsBrutKg,
      retenueKg: retenueKg ?? 0,
      modePaiement,
    });
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur enregistrement collecte terrain");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function postPaiementHandler(req: Request, res: Response): Promise<void> {
  const { id, cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const { membreId, livraisonId, modePaiement } = req.body as {
    membreId?: number;
    livraisonId?: number;
    modePaiement?: string;
  };
  if (!membreId || !livraisonId || !modePaiement) {
    res.status(400).json({ erreur: "Données manquantes" });
    return;
  }
  try {
    const result = await terrainService.enregistrerPaiement(id, cooperativeId, { membreId, livraisonId, modePaiement });
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur paiement terrain");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function postAvanceHandler(req: Request, res: Response): Promise<void> {
  const { id, cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const { membreId, montantFcfa, motif } = req.body as {
    membreId?: number;
    montantFcfa?: number;
    motif?: string;
  };
  if (!membreId || !montantFcfa || !motif) {
    res.status(400).json({ erreur: "Données manquantes" });
    return;
  }
  try {
    const result = await terrainService.octroierAvance(id, cooperativeId, { membreId, montantFcfa, motif });
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur avance terrain");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function getBilanJourHandler(req: Request, res: Response): Promise<void> {
  const { id, cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  try {
    const bilan = await terrainService.getBilanJour(id, cooperativeId);
    res.json(bilan);
  } catch (err) {
    req.log.error({ err }, "Erreur bilan jour terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function postSyncHandler(req: Request, res: Response): Promise<void> {
  const { id, cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const { operations } = req.body as { operations?: unknown[] };
  if (!Array.isArray(operations)) {
    res.status(400).json({ erreur: "operations doit être un tableau" });
    return;
  }
  try {
    const result = await terrainService.syncOperations(
      id,
      cooperativeId,
      operations as Parameters<typeof terrainService.syncOperations>[2]
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur sync terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const { id } = getAgent(req);
  const { motDePasseActuel, nouveauMotDePasse } = req.body as { motDePasseActuel?: string; nouveauMotDePasse?: string };
  if (!motDePasseActuel || !nouveauMotDePasse) {
    res.status(400).json({ erreur: "Données manquantes" }); return;
  }
  try {
    await terrainService.changerMotDePasse(id, motDePasseActuel, nouveauMotDePasse);
    res.json({ message: "Mot de passe mis à jour" });
  } catch (err) {
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function postRapportHandler(req: Request, res: Response): Promise<void> {
  const { id, cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  try {
    const result = await terrainService.envoyerRapportJournalier(id, cooperativeId);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur rapport terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

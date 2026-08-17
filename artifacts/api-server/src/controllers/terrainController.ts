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
    if ("blockedMode" in result && result.blockedMode === "central") {
      res.status(403).json({ erreur: "COMPTE_CENTRAL", message: "Ce compte est géré par la base centrale. Contactez votre coopérative." });
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
  const agent = getAgent(req);
  const { cooperativeId } = agent;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const search = req.query["search"] as string | undefined;
  const section = req.query["section"] as string | undefined;
  // Peseur : filtrer selon le périmètre de rattachement (delegueId du peseur dans le JWT)
  const peseurScopeDelegueId = agent.role === "peseur" ? (agent.delegueId ?? null) : undefined;
  // Fournisseurs externes : scoper par délégué créateur
  //   - délégué : ses propres externals (agent.id)
  //   - peseur rattaché : les externals du délégué auquel il est rattaché
  //   - agent_terrain / autre : tous les externals de la coopérative (undefined)
  const delegueIdForExternals =
    agent.role === "delegue" ? agent.id :
    agent.role === "peseur" && agent.delegueId ? agent.delegueId :
    undefined;
  try {
    const fournisseurs = await terrainService.getFournisseurs(cooperativeId, section, search, peseurScopeDelegueId, delegueIdForExternals);
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

export async function getDeleguesCentrauxHandler(req: Request, res: Response): Promise<void> {
  const { cooperativeId } = req.agent!;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  try {
    const delegues = await terrainService.getDeleguesCentraux(cooperativeId);
    res.json(delegues);
  } catch (err) {
    req.log.error({ err }, "Erreur liste délégués centraux");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

async function resolveEffectiveAgent(
  agent: NonNullable<Request["agent"]>,
  cooperativeId: number,
  targetDelegueId?: number,
): Promise<{ effectiveAgentId: number; peseurId: number | undefined } | null> {
  if (targetDelegueId) {
    // Valider que la cible est bien un délégué central de la même coopérative
    const cibles = await terrainService.getDeleguesCentraux(cooperativeId);
    const cible = cibles.find((d) => d.id === Number(targetDelegueId));
    if (!cible) return null; // 403
    return { effectiveAgentId: cible.id, peseurId: agent.id };
  }
  return { effectiveAgentId: agent.delegueId ?? agent.id, peseurId: agent.delegueId ? agent.id : undefined };
}

export async function postCollecteHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  const { cooperativeId } = agent;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }

  const { membreId, fournisseurId, nombreSacs, poidsBrutKg, retenueKg, targetDelegueId } = req.body as {
    membreId?: number;
    fournisseurId?: number;
    nombreSacs?: number;
    poidsBrutKg?: number;
    retenueKg?: number;
    targetDelegueId?: number;
  };
  if ((!membreId && !fournisseurId) || !poidsBrutKg) {
    res.status(400).json({ erreur: "Données manquantes (membreId ou fournisseurId requis)" });
    return;
  }

  const ids = await resolveEffectiveAgent(agent, cooperativeId, targetDelegueId);
  if (!ids) { res.status(403).json({ erreur: "Délégué cible invalide ou non géré centralement" }); return; }
  const { effectiveAgentId, peseurId } = ids;

  // Mode proxy : l'agent connecté saisit pour le compte d'un délégué
  const agentSaisiseurId = effectiveAgentId !== agent.id ? agent.id : undefined;

  try {
    const result = await terrainService.enregistrerCollecte(effectiveAgentId, cooperativeId, {
      membreId: membreId ? Number(membreId) : undefined,
      fournisseurId: fournisseurId ? Number(fournisseurId) : undefined,
      nombreSacs: nombreSacs ?? 1,
      poidsBrutKg,
      retenueKg: retenueKg ?? 0,
      peseurId,
    }, agentSaisiseurId);
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur enregistrement collecte terrain");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function postPaiementHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  const { cooperativeId } = agent;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const { membreId, livraisonId, modePaiement, targetDelegueId } = req.body as {
    membreId?: number;
    livraisonId?: number;
    modePaiement?: string;
    targetDelegueId?: number;
  };
  if (!membreId || !livraisonId || !modePaiement) {
    res.status(400).json({ erreur: "Données manquantes" });
    return;
  }
  const ids = await resolveEffectiveAgent(agent, cooperativeId, targetDelegueId);
  if (!ids) { res.status(403).json({ erreur: "Délégué cible invalide ou non géré centralement" }); return; }
  const { effectiveAgentId } = ids;
  try {
    const result = await terrainService.enregistrerPaiement(
      effectiveAgentId,
      cooperativeId,
      { membreId, livraisonId, modePaiement },
      effectiveAgentId !== agent.id ? agent.id : undefined,
    );
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur paiement terrain");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function postAvanceHandler(req: Request, res: Response): Promise<void> {
  const agent = req.agent!;
  const { cooperativeId } = agent;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  const { membreId, montantFcfa, motif, targetDelegueId } = req.body as {
    membreId?: number;
    montantFcfa?: number;
    motif?: string;
    targetDelegueId?: number;
  };
  if (!membreId || !montantFcfa || !motif) {
    res.status(400).json({ erreur: "Données manquantes" });
    return;
  }
  const ids = await resolveEffectiveAgent(agent, cooperativeId, targetDelegueId);
  if (!ids) { res.status(403).json({ erreur: "Délégué cible invalide ou non géré centralement" }); return; }
  const { effectiveAgentId } = ids;
  try {
    const result = await terrainService.octroierAvance(
      effectiveAgentId,
      cooperativeId,
      { membreId, montantFcfa, motif },
      effectiveAgentId !== agent.id ? agent.id : undefined,
    );
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
  const agent = req.agent!;
  const { cooperativeId } = agent;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }

  const { operations, targetDelegueId } = req.body as { operations?: unknown[]; targetDelegueId?: number };

  const ids = await resolveEffectiveAgent(agent, cooperativeId, targetDelegueId);
  if (!ids) { res.status(403).json({ erreur: "Délégué cible invalide ou non géré centralement" }); return; }
  const { effectiveAgentId, peseurId } = ids;
  if (!Array.isArray(operations)) {
    res.status(400).json({ erreur: "operations doit être un tableau" });
    return;
  }
  const role = agent.role;
  const allowedTypes = role === "delegue"
    ? ["collecte", "paiement", "avance"]
    : role === "peseur"
      ? ["collecte"]
      : ["gps_collecte"];
  const filtered = (operations as Array<{ type?: string }>).filter(
    (op) => allowedTypes.includes(op.type ?? ""),
  );

  try {
    const result = await terrainService.syncOperations(
      effectiveAgentId,
      cooperativeId,
      filtered as Parameters<typeof terrainService.syncOperations>[2],
      peseurId,
      agent.id,
    );
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur sync terrain");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  const { id } = getAgent(req);
  const { nouveauMotDePasse } = req.body as { nouveauMotDePasse?: string };
  if (!nouveauMotDePasse) {
    res.status(400).json({ erreur: "Nouveau mot de passe requis" }); return;
  }
  try {
    await terrainService.changerMotDePasse(id, nouveauMotDePasse);
    res.json({ message: "Mot de passe mis à jour" });
  } catch (err) {
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function getPeseurCollectesHandler(req: Request, res: Response): Promise<void> {
  const { id, cooperativeId } = getAgent(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée à l'agent" }); return; }
  try {
    const collectes = await terrainService.getPeseurCollectes(id, cooperativeId);
    res.json(collectes);
  } catch (err) {
    req.log.error({ err }, "Erreur historique collectes peseur");
    res.status(500).json({ erreur: "Erreur interne" });
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

import { type Request, type Response } from "express";
import {
  listAnomalies,
  traiterAnomalie,
  getStats,
  getConfigAnomalie,
  updateConfigAnomalie,
} from "../services/anomalieService";

export async function getAnomalies(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const { gravite, statut, module, membre_id, agent_id, date_debut, date_fin, limit, offset } = req.query as Record<string, string>;
    const result = await listAnomalies(cooperativeId, {
      gravite:   gravite   || undefined,
      statut:    statut    || undefined,
      module:    module    || undefined,
      membreId:  membre_id  ? parseInt(membre_id)  : undefined,
      agentId:   agent_id   ? parseInt(agent_id)   : undefined,
      dateDebut: date_debut || undefined,
      dateFin:   date_fin   || undefined,
      limit:     limit  ? parseInt(limit)  : undefined,
      offset:    offset ? parseInt(offset) : undefined,
    });
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur getAnomalies");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getStatsAnomalies(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const stats = await getStats(cooperativeId);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Erreur getStatsAnomalies");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function traiter(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"]));
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const { statut, commentaire } = req.body as { statut?: string; commentaire?: string };
  if (!statut || !["resolue", "ignoree", "faux_positif"].includes(statut)) {
    res.status(400).json({ erreur: "Statut invalide. Valeurs: resolue | ignoree | faux_positif" });
    return;
  }

  const traitePar = req.user?.id;
  if (!traitePar) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const anomalie = await traiterAnomalie(cooperativeId, id, {
      statut: statut as "resolue" | "ignoree" | "faux_positif",
      commentaire,
      traitePar,
    });
    if (!anomalie) { res.status(404).json({ erreur: "Anomalie introuvable" }); return; }
    res.json(anomalie);
  } catch (err) {
    req.log.error({ err }, "Erreur traiterAnomalie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getConfig(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const cfg = await getConfigAnomalie(cooperativeId);
    if (!cfg) { res.status(404).json({ erreur: "Configuration introuvable" }); return; }
    res.json(cfg);
  } catch (err) {
    req.log.error({ err }, "Erreur getConfig");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function putConfig(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      poidsMaxLivraisonKg?:      number;
      poidsMoyenMultiplicateur?: number;
      delaiMinEntreLivraisonsH?: number;
      avanceMaxFcfa?:            number;
      avanceSiRetardExistant?:   boolean;
      sortieMaxPctStock?:        number;
      paiementSansLivraison?:    boolean;
      doublonPaiementDelaiH?:    number;
      ecritureMontantMaxFcfa?:   number;
      ecartReconciliationPct?:   number;
    };
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const updated = await updateConfigAnomalie(cooperativeId, body);
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Erreur putConfig");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

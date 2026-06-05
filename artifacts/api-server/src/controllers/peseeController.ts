import { type Request, type Response } from "express";
import {
  CreateBalanceBody,
  UpdateBalanceBody,
  CreateVerificationBalanceBody,
  ValiderDoublePeseeBody,
  CreateLitigeBody,
  ResoudreLitigeBody,
  UpdateConfigPeseeBody,
} from "@workspace/api-zod";
import {
  getBalances,
  createBalance,
  updateBalance,
  getBalancesAlertes,
  createVerification,
  validerDoublePeseeLivraison,
  getLitiges,
  createLitige,
  resoudreLitige,
  getStatistiques,
  getRapportAgent,
  getConfig,
  upsertConfig,
} from "../services/peseeService";

// ─── Helper ───────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  if (typeof d === "string") return d;
  return d.toISOString().split("T")[0]!;
}

// ─── Balances ─────────────────────────────────────────────────────────────────

export async function handleGetBalancesAlertes(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const alertes = await getBalancesAlertes(cooperativeId);
    res.json({ alertes });
  } catch (err) {
    req.log.error(err, "handleGetBalancesAlertes");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function handleGetBalances(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const balances = await getBalances(cooperativeId);
    res.json({ balances });
  } catch (err) {
    req.log.error(err, "handleGetBalances");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function handleCreateBalance(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const parse = CreateBalanceBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }
    const d = parse.data;
    const balance = await createBalance(cooperativeId, {
      numeroSerie: d.numero_serie,
      marque: d.marque,
      capaciteMaxKg: d.capacite_max_kg != null ? String(d.capacite_max_kg) : null,
      precisionG: d.precision_g != null ? String(d.precision_g) : null,
      site: d.site,
      dateAcquisition: toDateStr(d.date_acquisition) ?? null,
      dateProchainVerification: toDateStr(d.date_prochaine_verification) ?? null,
      statut: d.statut,
    });
    res.status(201).json({ balance });
  } catch (err) {
    req.log.error(err, "handleCreateBalance");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function handleUpdateBalance(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    const parse = UpdateBalanceBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }
    const d = parse.data;
    const balance = await updateBalance(cooperativeId, id, {
      ...(d.numero_serie !== undefined && { numeroSerie: d.numero_serie }),
      ...(d.marque !== undefined && { marque: d.marque }),
      ...(d.capacite_max_kg !== undefined && { capaciteMaxKg: String(d.capacite_max_kg) }),
      ...(d.precision_g !== undefined && { precisionG: String(d.precision_g) }),
      ...(d.site !== undefined && { site: d.site }),
      ...(d.date_acquisition !== undefined && { dateAcquisition: toDateStr(d.date_acquisition) ?? null }),
      ...(d.date_derniere_verification !== undefined && { dateDerniereVerification: toDateStr(d.date_derniere_verification) ?? null }),
      ...(d.date_prochaine_verification !== undefined && { dateProchainVerification: toDateStr(d.date_prochaine_verification) ?? null }),
      ...(d.statut !== undefined && { statut: d.statut }),
    });
    if (!balance) { res.status(404).json({ erreur: "Balance introuvable" }); return; }
    res.json({ balance });
  } catch (err) {
    req.log.error(err, "handleUpdateBalance");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function handleCreateVerification(req: Request, res: Response) {
  try {
    const id = parseInt(String(req.params["id"]));
    const parse = CreateVerificationBalanceBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }
    const d = parse.data;
    const verification = await createVerification(id, {
      date_verification: toDateStr(d.date_verification)!,
      verificateur: d.verificateur,
      resultat: d.resultat,
      ecart_mesure_g: d.ecart_mesure_g,
      observations: d.observations,
      prochaine_verification: toDateStr(d.prochaine_verification),
    });
    res.status(201).json({ verification });
  } catch (err) {
    req.log.error(err, "handleCreateVerification");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

// ─── Pesée / double pesée ─────────────────────────────────────────────────────

export async function handleValiderDoublePesee(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const parse = ValiderDoublePeseeBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }
    const d = parse.data;
    const result = await validerDoublePeseeLivraison(
      cooperativeId,
      d.livraison_id,
      d.poids_2eme_pesee,
      d.balance_id,
      d.peseur_id ?? null,
    );
    if (!result) { res.status(404).json({ erreur: "Livraison introuvable" }); return; }
    res.json(result);
  } catch (err) {
    req.log.error(err, "handleValiderDoublePesee");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

// ─── Litiges ──────────────────────────────────────────────────────────────────

export async function handleGetLitiges(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const litiges = await getLitiges(cooperativeId);
    res.json({ litiges });
  } catch (err) {
    req.log.error(err, "handleGetLitiges");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function handleCreateLitige(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const parse = CreateLitigeBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }
    const d = parse.data;
    const litige = await createLitige(cooperativeId, {
      livraison_id: d.livraison_id,
      membre_id: d.membre_id,
      date_litige: toDateStr(d.date_litige)!,
      poids_conteste_kg: d.poids_conteste_kg,
      poids_revendique_membre_kg: d.poids_revendique_membre_kg,
      motif: d.motif,
    });
    res.status(201).json({ litige });
  } catch (err) {
    req.log.error(err, "handleCreateLitige");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function handleResoudreLitige(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const id = parseInt(String(req.params["id"]));
    const userId = req.user?.id;
    if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }
    const parse = ResoudreLitigeBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }
    const d = parse.data;
    const litige = await resoudreLitige(cooperativeId, id, d.poids_final_retenu_kg, d.decision, userId);
    if (!litige) { res.status(404).json({ erreur: "Litige introuvable" }); return; }
    res.json({ litige });
  } catch (err) {
    req.log.error(err, "handleResoudreLitige");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

// ─── Statistiques & rapports ──────────────────────────────────────────────────

export async function handleGetStatistiques(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const stats = await getStatistiques(cooperativeId);
    res.json(stats);
  } catch (err) {
    req.log.error(err, "handleGetStatistiques");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function handleGetRapportAgent(req: Request, res: Response) {
  try {
    const agentId = parseInt(String(req.params["agent_id"]));
    const rapport = await getRapportAgent(agentId);
    res.json(rapport);
  } catch (err) {
    req.log.error(err, "handleGetRapportAgent");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

// ─── Config ───────────────────────────────────────────────────────────────────

export async function handleGetConfig(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const config = await getConfig(cooperativeId);
    res.json({
      id:                           config.id,
      cooperative_id:               config.cooperativeId,
      ecart_max_autorise_pct:       Number(config.ecartMaxAutorisePct ?? 2),
      seuil_double_pesee_kg:        Number(config.seuilDoublePeseeKg ?? 500),
      tolerance_balance_g:          Number(config.toleranceBalanceG ?? 500),
      frequence_verification_jours: config.frequenceVerificationJours ?? 90,
      updated_at:                   config.updatedAt ?? null,
    });
  } catch (err) {
    req.log.error(err, "handleGetConfig");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

export async function handleUpdateConfig(req: Request, res: Response) {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(400).json({ erreur: "Coopérative introuvable" }); return; }
    const parse = UpdateConfigPeseeBody.safeParse(req.body);
    if (!parse.success) { res.status(400).json({ erreur: "Données invalides", details: parse.error.issues }); return; }
    const config = await upsertConfig(cooperativeId, parse.data);
    res.json({
      id:                           config?.id,
      cooperative_id:               config?.cooperativeId,
      ecart_max_autorise_pct:       Number(config?.ecartMaxAutorisePct ?? 2),
      seuil_double_pesee_kg:        Number(config?.seuilDoublePeseeKg ?? 500),
      tolerance_balance_g:          Number(config?.toleranceBalanceG ?? 500),
      frequence_verification_jours: config?.frequenceVerificationJours ?? 90,
      updated_at:                   config?.updatedAt ?? null,
    });
  } catch (err) {
    req.log.error(err, "handleUpdateConfig");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}

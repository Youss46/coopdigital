import { type Request, type Response } from "express";
import { generateBordereauAchatSession } from "../services/pdfService.js";
import {
  createSession,
  getSessions,
  getSessionDetail,
  addLigne,
  deleteLigne,
  terminerSession,
  annulerSession,
  creerLivraisonDepuisSession,
  expirerSessionsStales,
  creerSessionBatch,
  SessionEnCoursError,
  SessionTransfertExistanteError,
} from "../services/peseeSessionService";
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

// ─── Sessions de pesée ────────────────────────────────────────────────────────

/** Endpoint de synchronisation hors-ligne : crée une session complète depuis un brouillon local. */
export async function handleBatchCreateSession(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const peseurId = req.agent!.id;

  const { localId, membreId, produit, operation, lignes, statut } = req.body as {
    localId?: string;
    membreId?: number;
    produit?: string;
    operation?: string;
    lignes?: Array<{ localId: string; nbSacs: number; poidsBrutKg: number; tareKg: number; notes?: string }>;
    statut?: "terminee" | "en_cours";
  };

  if (!localId || !membreId || !Array.isArray(lignes) || lignes.length === 0) {
    res.status(400).json({ erreur: "localId, membreId et au moins une ligne sont requis" });
    return;
  }

  try {
    const result = await creerSessionBatch(cooperativeId, peseurId, {
      localId,
      membreId: Number(membreId),
      produit: produit ?? "cacao",
      operation: operation ?? "reception",
      lignes,
      statut: statut ?? "terminee",
    });
    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "handleBatchCreateSession");
    res.status(400).json({ erreur: (err as Error).message });
  }
}

export async function handleCreateSession(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const actorId = req.agent?.id ?? req.user?.id;
  const { membreId, produit, operation, balanceId, notes, transfertId } = req.body as {
    membreId?: number; produit?: string; operation?: string; balanceId?: number; notes?: string; transfertId?: number;
  };

  // ── Guard : seul le peseur central (delegueId === null) peut démarrer une session de réception de transfert
  if (transfertId != null) {
    const isCentralPeseur = req.agent?.role === "peseur" && (req.agent.delegueId == null);
    if (!isCentralPeseur) {
      res.status(403).json({ erreur: "Seul le peseur central peut démarrer une session de réception de transfert" });
      return;
    }
  }

  try {
    const session = await createSession(cooperativeId, {
      membreId, produit, operation, balanceId, notes,
      peseurId: actorId,
      transfertId: transfertId ? Number(transfertId) : undefined,
    });
    res.status(201).json(session);
  } catch (err) {
    if (err instanceof SessionEnCoursError) {
      res.status(409).json({
        erreur: err.message,
        code: "SESSION_EN_COURS",
        sessionId: err.sessionId,
        numeroSession: err.numeroSession,
      });
      return;
    }
    if (err instanceof SessionTransfertExistanteError) {
      res.status(409).json({
        erreur: err.message,
        code: "SESSION_TRANSFERT_EXISTANTE",
        sessionId: err.sessionId,
      });
      return;
    }
    req.log.error(err, "handleCreateSession");
    res.status(500).json({ erreur: (err as Error).message ?? "Erreur création session" });
  }
}

export async function handleGetSessions(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const { statut, membreId, limit, date_debut, date_fin } = req.query as { statut?: string; membreId?: string; limit?: string; date_debut?: string; date_fin?: string };
  // Peseur : ne voit que ses propres sessions (filtre par peseurId)
  const peseurId = req.agent?.role === "peseur" ? req.agent.id : undefined;
  try {
    const sessions = await getSessions(cooperativeId, {
      statut,
      membreId: membreId ? parseInt(membreId) : undefined,
      limit: limit ? parseInt(limit) : undefined,
      peseurId,
      dateDebut: date_debut,
      dateFin: date_fin,
    });
    res.json(sessions);
  } catch (err) {
    req.log.error(err, "handleGetSessions");
    res.status(500).json({ erreur: "Erreur récupération sessions" });
  }
}

export async function handleGetSession(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const sessionId = parseInt(String(req.params["id"] ?? "0"));
  try {
    const session = await getSessionDetail(cooperativeId, sessionId);
    if (!session) { res.status(404).json({ erreur: "Session introuvable" }); return; }
    res.json(session);
  } catch (err) {
    req.log.error(err, "handleGetSession");
    res.status(500).json({ erreur: "Erreur récupération session" });
  }
}

async function guardCentralPeseurForTransfertSession(
  req: Request, res: Response, cooperativeId: number, sessionId: number,
): Promise<boolean> {
  const s = await getSessionDetail(cooperativeId, sessionId);
  if (!s) { res.status(404).json({ erreur: "Session introuvable" }); return false; }
  if (s.operation === "reception_transfert") {
    const isCentralPeseur = req.agent?.role === "peseur" && (req.agent.delegueId == null);
    if (!isCentralPeseur) {
      res.status(403).json({ erreur: "Seul le peseur central peut modifier une session de réception de transfert" });
      return false;
    }
  }
  return true;
}

export async function handleAddLigne(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const sessionId = parseInt(String(req.params["id"] ?? "0"));
  const { nbSacs, poidsBrutKg, tareKg, notes } = req.body as {
    nbSacs?: number; poidsBrutKg?: number; tareKg?: number; notes?: string;
  };
  if (!poidsBrutKg || poidsBrutKg <= 0) { res.status(400).json({ erreur: "Poids invalide" }); return; }
  if (!await guardCentralPeseurForTransfertSession(req, res, cooperativeId, sessionId)) return;
  try {
    const ligne = await addLigne(cooperativeId, sessionId, {
      nbSacs: nbSacs ?? 0,
      poidsBrutKg,
      tareKg,
      notes,
    });
    const session = await getSessionDetail(cooperativeId, sessionId);
    res.status(201).json({ ligne, session });
  } catch (err) {
    req.log.error(err, "handleAddLigne");
    const msg = err instanceof Error ? err.message : "Erreur ajout ligne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleDeleteLigne(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const sessionId = parseInt(String(req.params["id"] ?? "0"));
  const ligneId = parseInt(String(req.params["ligneId"] ?? "0"));
  if (!await guardCentralPeseurForTransfertSession(req, res, cooperativeId, sessionId)) return;
  try {
    await deleteLigne(cooperativeId, sessionId, ligneId);
    const session = await getSessionDetail(cooperativeId, sessionId);
    res.json({ ok: true, session });
  } catch (err) {
    req.log.error(err, "handleDeleteLigne");
    const msg = err instanceof Error ? err.message : "Erreur suppression ligne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleTerminerSession(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const sessionId = parseInt(String(req.params["id"] ?? "0"));
  if (!await guardCentralPeseurForTransfertSession(req, res, cooperativeId, sessionId)) return;
  try {
    const session = await terminerSession(cooperativeId, sessionId);
    res.json(session);
  } catch (err) {
    req.log.error(err, "handleTerminerSession");
    const msg = err instanceof Error ? err.message : "Erreur clôture session";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleAnnulerSession(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const sessionId = parseInt(String(req.params["id"] ?? "0"));
  if (!await guardCentralPeseurForTransfertSession(req, res, cooperativeId, sessionId)) return;
  try {
    await annulerSession(cooperativeId, sessionId);
    res.json({ ok: true });
  } catch (err) {
    req.log.error(err, "handleAnnulerSession");
    const msg = err instanceof Error ? err.message : "Erreur annulation session";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleConvertirSessionEnLivraison(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const actorId = req.agent?.id ?? req.user?.id;
  // Peseur rattaché : la livraison est imputée au délégué, le peseur est tracé séparément
  const effectiveAgentId = req.agent?.delegueId ?? actorId;
  const peseurId = req.agent?.delegueId ? req.agent.id : undefined;
  const sessionId = parseInt(String(req.params["id"] ?? "0"));
  try {
    const result = await creerLivraisonDepuisSession(cooperativeId, sessionId, {
      agentId: effectiveAgentId,
      peseurId,
    });
    res.status(201).json(result);
  } catch (err) {
    req.log.error(err, "handleConvertirSessionEnLivraison");
    const msg = err instanceof Error ? err.message : "Erreur conversion session en livraison";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleExpirerSessionsStales(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  try {
    const n = await expirerSessionsStales(cooperativeId);
    res.json({ ok: true, expirées: n });
  } catch (err) {
    req.log.error(err, "handleExpirerSessionsStales");
    res.status(500).json({ erreur: "Erreur lors de l'expiration des sessions" });
  }
}

export async function handleGetBordereauSession(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId ?? req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }
  const sessionId = Number(req.params.id);
  if (!sessionId) { res.status(400).json({ erreur: "ID session invalide" }); return; }
  try {
    const buf = await generateBordereauAchatSession(sessionId, cooperativeId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="bordereau-pesee-${sessionId}.pdf"`);
    res.send(buf);
  } catch (err: any) {
    req.log.error(err, "handleGetBordereauSession");
    res.status(500).json({ erreur: err.message ?? "Erreur génération bordereau" });
  }
}

import { Request, Response } from "express";
import * as svc from "../services/caisseService.js";
import { db, usersTable, caissesDeleguesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── Caisses ──────────────────────────────────────────────────────────────────

export async function getCaisses(req: Request, res: Response): Promise<void> {
  const role    = req.user?.role;
  const userId  = req.user?.id;
  let cooperativeId = req.user?.cooperativeId ?? null;

  // Pour un délégué dont le cooperativeId est absent du JWT,
  // on le résout depuis la DB (évite un 401 alors que l'utilisateur est valide)
  if (role === "delegue" && !cooperativeId && userId) {
    const [u] = await db
      .select({ cooperativeId: usersTable.cooperativeId })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    cooperativeId = u?.cooperativeId ?? null;
  }

  if (!cooperativeId) {
    res.status(401).json({ erreur: "Coopérative non associée au compte" });
    return;
  }

  // Un délégué ne voit que la caisse dont il est responsable
  const responsableId = role === "delegue" ? userId : undefined;
  try {
    const caisses = await svc.listCaisses(cooperativeId, responsableId);
    // Source de vérité unique : caissesTable (créée depuis la page Caisse admin).
    // Si aucune caisse n'existe pour ce délégué, on retourne [] — pas de fallback
    // sur caisses_delegues (voir règle : une caisse = une référence en base).
    res.json(caisses);
  } catch (err) {
    req.log.error({ err }, "getCaisses");
    res.status(500).json({ error: "Erreur serveur" });
  }
}

export async function postCaisse(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ error: "Coopérative non associée à ce compte" }); return; }
  try {
    const { nom, typeCaisse, responsableId, soldeinitial, fondMinimum } = req.body as {
      nom: string; typeCaisse?: "centrale" | "deleguee"; responsableId?: number; soldeinitial?: number; fondMinimum?: number;
    };
    if (!nom) { res.status(400).json({ error: "nom requis" }); return; }
    res.status(201).json(await svc.creerCaisse({ nom, typeCaisse, responsableId, soldeinitial, fondMinimum }, cooperativeId));
  } catch (err) { req.log.error({ err }, "postCaisse"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function putCaisse(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ error: "Coopérative non associée à ce compte" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const row = await svc.updateCaisse(id, req.body, cooperativeId);
    if (!row) { res.status(404).json({ error: "Caisse introuvable" }); return; }
    res.json(row);
  } catch (err) { req.log.error({ err }, "putCaisse"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessionActive(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const session = await svc.getSessionActive(id);
    res.json(session ?? null);
  } catch (err) { req.log.error({ err }, "getSessionActive"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function postOuvrir(req: Request, res: Response): Promise<void> {
  try {
    const id     = parseInt(String(req.params["id"]), 10);
    const userId = (req as Request & { user?: { id: number } }).user?.id ?? 0;
    const session = await svc.ouvrirSession(id, userId);
    res.status(201).json(session);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postOuvrir");
    res.status(400).json({ error: msg });
  }
}

// ─── Mouvements ───────────────────────────────────────────────────────────────

export async function postMouvement(req: Request, res: Response): Promise<void> {
  try {
    const id     = parseInt(String(req.params["id"]), 10);
    const userId = (req as Request & { user?: { id: number } }).user?.id;
    const { type, motif, montantFcfa, libelle, referenceOperation, dateOperation } = req.body as {
      type: "entree" | "sortie"; motif: string; montantFcfa: number;
      libelle?: string; referenceOperation?: string; dateOperation?: string;
    };
    if (!type || !motif || !montantFcfa) {
      res.status(400).json({ error: "type, motif et montantFcfa requis" }); return;
    }
    const result = await svc.enregistrerMouvement(id, {
      type, motif, montantFcfa, libelle, referenceOperation, dateOperation, userId,
    });
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postMouvement");
    res.status(400).json({ error: msg });
  }
}

// ─── Fermeture ────────────────────────────────────────────────────────────────

export async function putFermer(req: Request, res: Response): Promise<void> {
  try {
    const id     = parseInt(String(req.params["id"]), 10);
    const userId = (req as Request & { user?: { id: number } }).user?.id ?? 0;
    const { soldeReel, observations } = req.body as { soldeReel: number; observations?: string };
    if (soldeReel === undefined || soldeReel === null) {
      res.status(400).json({ error: "soldeReel requis" }); return;
    }
    res.json(await svc.fermerSession(id, Math.round(soldeReel), userId, observations));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "putFermer");
    res.status(400).json({ error: msg });
  }
}

// ─── Transfert inter-caisses ──────────────────────────────────────────────────

export async function postTransfert(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ error: "Coopérative non associée à ce compte" }); return; }
  try {
    const sourceCaisseId = parseInt(String(req.params["id"]), 10);
    const { destCaisseId, montantFcfa, libelle } = req.body as {
      destCaisseId: number; montantFcfa: number; libelle?: string;
    };
    if (!destCaisseId || !montantFcfa) {
      res.status(400).json({ error: "destCaisseId et montantFcfa requis" }); return;
    }
    const userId = req.user?.id;
    const result = await svc.transfererFonds(sourceCaisseId, destCaisseId, montantFcfa, libelle, userId, cooperativeId);
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postTransfert");
    res.status(400).json({ error: msg });
  }
}

// ─── Journal ──────────────────────────────────────────────────────────────────

export async function getJournal(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const { date_debut, date_fin } = req.query as Record<string, string | undefined>;
    res.json(await svc.getJournal(id, { dateDebut: date_debut, dateFin: date_fin }));
  } catch (err) { req.log.error({ err }, "getJournal"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Rapport PDF ──────────────────────────────────────────────────────────────

export async function getRapportPdf(req: Request, res: Response): Promise<void> {
  try {
    const id   = parseInt(String(req.params["id"]), 10);
    const date = (req.query["date"] as string | undefined) ?? new Date().toISOString().slice(0, 10);
    const buffer = await svc.genererRapportPdf(id, date);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rapport-caisse-${date}.pdf"`);
    res.send(buffer);
  } catch (err) { req.log.error({ err }, "getRapportPdf"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Soldes & Alertes ─────────────────────────────────────────────────────────

export async function getSoldes(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try { res.json(await svc.getSoldes(cooperativeId)); }
  catch (err) { req.log.error({ err }, "getSoldes"); res.status(500).json({ error: "Erreur serveur" }); }
}

export async function getAlertes(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try { res.json(await svc.getAlertes(cooperativeId)); }
  catch (err) { req.log.error({ err }, "getAlertes"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Comptes bancaires disponibles ───────────────────────────────────────────

export async function getComptesBancaires(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try { res.json(await svc.getComptesBancairesCoop(cooperativeId)); }
  catch (err) { req.log.error({ err }, "getComptesBancairesCaisse"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Virement Caisse → Banque ─────────────────────────────────────────────────

export async function postVirementBanque(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  const caisseId = parseInt(String(req.params["id"]), 10);
  const { compteBancaireId, montantFcfa, libelle, reference, dateOperation } = req.body as {
    compteBancaireId?: number; montantFcfa?: number;
    libelle?: string; reference?: string; dateOperation?: string;
  };
  if (!compteBancaireId || !montantFcfa || montantFcfa <= 0) {
    res.status(400).json({ erreur: "compteBancaireId et montantFcfa (> 0) requis" }); return;
  }
  try {
    const result = await svc.virementVersBanque(caisseId, cooperativeId, {
      compteBancaireId, montantFcfa, libelle, reference, dateOperation,
      userId: req.user?.id,
    });
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postVirementBanqueCaisse");
    res.status(400).json({ error: msg });
  }
}

// ─── Historique sessions ──────────────────────────────────────────────────────

export async function getSessions(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const { date_debut, date_fin } = req.query as Record<string, string | undefined>;
    res.json(await svc.listSessions(id, { dateDebut: date_debut, dateFin: date_fin }));
  } catch (err) { req.log.error({ err }, "getSessions caisse"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Transfert vers banque (dépôt) ────────────────────────────────────────────

export async function postTransfertBanque(req: Request, res: Response): Promise<void> {
  try {
    const id     = parseInt(String(req.params["id"]), 10);
    const userId = (req as Request & { user?: { id: number } }).user?.id ?? 0;
    const { montant, libelle } = req.body as { montant: number; libelle?: string };
    if (!montant) { res.status(400).json({ error: "montant requis" }); return; }
    res.json(await svc.transfertVersBanque(id, Math.round(montant), userId, libelle));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postTransfertBanque");
    res.status(400).json({ error: msg });
  }
}

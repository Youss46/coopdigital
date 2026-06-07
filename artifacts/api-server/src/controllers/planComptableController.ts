import { type Request, type Response } from "express";
import * as svc from "../services/planComptableService.js";

// ── Plan comptable ────────────────────────────────────────────────────────────

export async function listPlanComptableHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const classe = req.query["classe"] ? parseInt(String(req.query["classe"])) : undefined;
    const type = req.query["type"] as string | undefined;
    const actifStr = req.query["actif"] as string | undefined;
    const actif = actifStr === "true" ? true : actifStr === "false" ? false : undefined;
    const search = req.query["search"] as string | undefined;
    const comptes = await svc.listerPlanComptable({ cooperativeId, classe, type, actif, search });
    res.json(comptes);
  } catch (err) {
    req.log.error({ err }, "listPlanComptable");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createCompteHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const { numeroCompte, libelle, type, classe, compteParent, soldeNormal, ordreAffichage } = req.body as {
      numeroCompte?: string; libelle?: string; type?: string;
      classe?: number; compteParent?: string; soldeNormal?: string; ordreAffichage?: number;
    };
    if (!numeroCompte || !libelle || !type) {
      res.status(400).json({ erreur: "numeroCompte, libelle et type sont obligatoires" });
      return;
    }
    const compte = await svc.ajouterCompte({
      cooperativeId, numeroCompte, libelle, type: type as "actif" | "passif" | "charge" | "produit",
      classe, compteParent, soldeNormal, ordreAffichage,
    });
    res.status(201).json(compte);
  } catch (err: unknown) {
    req.log.error({ err }, "createCompte");
    const msg = err instanceof Error ? err.message : "Erreur interne du serveur";
    res.status(msg.includes("déjà") || msg.includes("unique") ? 409 : 500).json({ erreur: msg });
  }
}

export async function updateCompteHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { libelle, actif, ordreAffichage } = req.body as { libelle?: string; actif?: boolean; ordreAffichage?: number };
    const compte = await svc.modifierCompte(cooperativeId, id, { libelle, actif, ordreAffichage });
    res.json(compte);
  } catch (err: unknown) {
    req.log.error({ err }, "updateCompte");
    const msg = err instanceof Error ? err.message : "Erreur interne du serveur";
    res.status(msg.includes("introuvable") ? 404 : 500).json({ erreur: msg });
  }
}

export async function deleteCompteHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"] ?? "0"));
    const compte = await svc.desactiverCompte(cooperativeId, id);
    res.json(compte);
  } catch (err: unknown) {
    req.log.error({ err }, "deleteCompte");
    const msg = err instanceof Error ? err.message : "Erreur interne du serveur";
    const status = msg.includes("introuvable") ? 404 : msg.includes("Désactivation refusée") ? 409 : 500;
    res.status(status).json({ erreur: msg });
  }
}

// ── Paramètres comptes modules ────────────────────────────────────────────────

export async function listParamsHandler(req: Request, res: Response): Promise<void> {
  try {
    const rows = await svc.listerParams();
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "listParams");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function listParamsModuleHandler(req: Request, res: Response): Promise<void> {
  try {
    const module = String(req.params["module"] ?? "");
    const rows = await svc.listerParams(undefined, module);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "listParamsModule");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function updateParamsHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { compteDebit, compteCredit, libelleEcritureAuto } = req.body as {
      compteDebit?: string; compteCredit?: string; libelleEcritureAuto?: string;
    };
    const modifiePar = req.user?.id;
    const updated = await svc.modifierParams(cooperativeId, id, { compteDebit, compteCredit, libelleEcritureAuto, modifiePar });
    res.json(updated);
  } catch (err: unknown) {
    req.log.error({ err }, "updateParams");
    const msg = err instanceof Error ? err.message : "Erreur interne du serveur";
    res.status(msg.includes("introuvable") ? 404 : msg.includes("désactivé") ? 422 : 500).json({ erreur: msg });
  }
}

export async function resetModuleHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const module = String(req.params["module"] ?? "");
    const modifiePar = req.user?.id;
    const result = await svc.resetModuleOhada(cooperativeId, module, modifiePar);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "resetModule");
    const msg = err instanceof Error ? err.message : "Erreur interne du serveur";
    res.status(msg.includes("non reconnu") ? 400 : 500).json({ erreur: msg });
  }
}

// ── Correction d'écriture ─────────────────────────────────────────────────────

export async function searchEcrituresHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const q = String(req.query["q"] ?? "");
    if (q.length < 2) { res.json([]); return; }
    const rows = await svc.rechercherEcritures(cooperativeId, q);
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "searchEcritures");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function corrigerEcritureHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { nouveauCompteDebit, nouveauCompteCredit, nouveauMontant, nouveauLibelle, motifCorrection } = req.body as {
      nouveauCompteDebit?: string; nouveauCompteCredit?: string;
      nouveauMontant?: number; nouveauLibelle?: string; motifCorrection?: string;
    };
    if (!motifCorrection) {
      res.status(400).json({ erreur: "motifCorrection est obligatoire" });
      return;
    }
    const corrigePar = req.user?.id;
    if (!corrigePar) { res.status(401).json({ erreur: "Non authentifié" }); return; }

    const result = await svc.corrigerEcriture(cooperativeId, id, {
      nouveauCompteDebit, nouveauCompteCredit, nouveauMontant, nouveauLibelle,
      motifCorrection, corrigePar,
    });
    res.status(201).json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "corrigerEcriture");
    const msg = err instanceof Error ? err.message : "Erreur interne du serveur";
    const status = msg.includes("introuvable") ? 404 : msg.includes("Seules") ? 422 : 500;
    res.status(status).json({ erreur: msg });
  }
}

export async function getHistoriqueEcritureHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"] ?? "0"));
    const result = await svc.getHistoriqueCorrections(cooperativeId, id);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "getHistoriqueEcriture");
    const msg = err instanceof Error ? err.message : "Erreur interne du serveur";
    res.status(msg.includes("introuvable") ? 404 : 500).json({ erreur: msg });
  }
}

export async function validerNumeroCompteHandler(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const numero = String(req.query["numero"] ?? "");
    if (!numero) { res.status(400).json({ erreur: "numero requis" }); return; }
    const result = await svc.validerNumeroCompte(cooperativeId, numero);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "validerNumeroCompte");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

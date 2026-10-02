import { type Request, type Response } from "express";
import * as service from "../services/avancesExportateursService.js";

function cooperativeId(req: Request) {
  return req.user?.cooperativeId ?? null;
}

function userId(req: Request) {
  return req.user?.id ?? null;
}

function parseId(req: Request, res: Response) {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ erreur: "ID invalide" });
    return null;
  }
  return id;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function reportError(req: Request, res: Response, err: unknown, operation: string) {
  const message = err instanceof Error ? err.message : "";
  if (message.includes("introuvable")) {
    res.status(404).json({ erreur: message });
    return;
  }
  if (
    message.includes("déjà") ||
    message.includes("Seul") ||
    message.includes("doit être") ||
    message.includes("ne peut") ||
    message.includes("dépasse") ||
    message.includes("n'a plus") ||
    message.includes("même exportateur") ||
    message.includes("changé de statut")
  ) {
    res.status(409).json({ erreur: message });
    return;
  }
  if (message === "Compte bancaire introuvable" || message === "Compte bancaire inactif") {
    res.status(400).json({ erreur: message });
    return;
  }
  req.log.error({ err }, `Erreur ${operation}`);
  res.status(500).json({ erreur: "Erreur interne du serveur" });
}

export async function getAvancesExportateurs(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  if (!coopId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  try {
    res.json(await service.listAvancesExportateurs(coopId));
  } catch (err) {
    reportError(req, res, err, "getAvancesExportateurs");
  }
}

export async function getAvanceExportateur(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  if (!coopId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const id = parseId(req, res);
  if (id === null) return;
  try {
    const detail = await service.getAvanceExportateurDetail(id, coopId);
    if (!detail) {
      res.status(404).json({ erreur: "Avance exportateur introuvable" });
      return;
    }
    res.json(detail);
  } catch (err) {
    reportError(req, res, err, "getAvanceExportateur");
  }
}

export async function getVentesEligiblesAvanceExportateur(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  if (!coopId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const id = parseId(req, res);
  if (id === null) return;
  try {
    res.json(await service.listVentesEligiblesAvanceExportateur(id, coopId));
  } catch (err) {
    reportError(req, res, err, "getVentesEligiblesAvanceExportateur");
  }
}

export async function postCreerAvanceExportateur(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  const actorId = userId(req);
  if (!coopId || !actorId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const numeroCheque = typeof body["numeroCheque"] === "string" ? body["numeroCheque"].trim() : "";
  const banque = typeof body["banque"] === "string" ? body["banque"].trim() : "";
  if (
    !Number.isInteger(body["exportateurId"]) ||
    Number(body["exportateurId"]) <= 0 ||
    !numeroCheque ||
    numeroCheque.length > 80 ||
    !banque ||
    banque.length > 200 ||
    !Number.isInteger(body["montantFcfa"]) ||
    Number(body["montantFcfa"]) <= 0 ||
    !isDate(body["dateReception"]) ||
    (body["dateEcheance"] != null && !isDate(body["dateEcheance"]))
  ) {
    res.status(400).json({ erreur: "Données invalides pour enregistrer le chèque d'avance" });
    return;
  }
  try {
    const created = await service.creerAvanceExportateur(coopId, {
      exportateurId: Number(body["exportateurId"]),
      numeroCheque,
      banque,
      montantFcfa: Number(body["montantFcfa"]),
      dateReception: body["dateReception"],
      dateEcheance: body["dateEcheance"] == null ? null : String(body["dateEcheance"]),
      createdBy: actorId,
    });
    const detail = await service.getAvanceExportateurSummary(created.id, coopId);
    if (!detail) {
      res.status(500).json({ erreur: "L'avance créée n'a pas pu être relue" });
      return;
    }
    res.status(201).json(detail);
  } catch (err) {
    reportError(req, res, err, "postCreerAvanceExportateur");
  }
}

export async function postDeposerAvanceExportateur(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  if (!coopId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const id = parseId(req, res);
  if (id === null) return;
  const dateDepot = (req.body as { dateDepot?: unknown } | undefined)?.dateDepot;
  if (dateDepot != null && !isDate(dateDepot)) {
    res.status(400).json({ erreur: "Date de dépôt invalide" });
    return;
  }
  try {
    await service.deposerAvanceExportateur(id, coopId, dateDepot as string | undefined);
    const avance = await service.getAvanceExportateurSummary(id, coopId);
    if (!avance) {
      res.status(404).json({ erreur: "Avance exportateur introuvable" });
      return;
    }
    res.json(avance);
  } catch (err) {
    reportError(req, res, err, "postDeposerAvanceExportateur");
  }
}

export async function postEncaisserAvanceExportateur(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  const actorId = userId(req);
  if (!coopId || !actorId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const id = parseId(req, res);
  if (id === null) return;
  const body = (req.body ?? {}) as { compteBancaireId?: unknown; dateEncaissement?: unknown };
  if (
    !Number.isInteger(body.compteBancaireId) ||
    Number(body.compteBancaireId) <= 0 ||
    (body.dateEncaissement != null && !isDate(body.dateEncaissement))
  ) {
    res.status(400).json({ erreur: "Compte bancaire et date d'encaissement valides obligatoires" });
    return;
  }
  try {
    await service.encaisserAvanceExportateur(id, coopId, {
      compteBancaireId: Number(body.compteBancaireId),
      dateEncaissement: body.dateEncaissement == null ? undefined : String(body.dateEncaissement),
    }, actorId);
    const avance = await service.getAvanceExportateurSummary(id, coopId);
    if (!avance) {
      res.status(404).json({ erreur: "Avance exportateur introuvable" });
      return;
    }
    res.json(avance);
  } catch (err) {
    reportError(req, res, err, "postEncaisserAvanceExportateur");
  }
}

export async function postRejeterAvanceExportateur(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  if (!coopId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const id = parseId(req, res);
  if (id === null) return;
  const body = (req.body ?? {}) as { motifRejet?: unknown; dateRejet?: unknown };
  const motifRejet = typeof body.motifRejet === "string" ? body.motifRejet.trim() : "";
  if (!motifRejet || (body.dateRejet != null && !isDate(body.dateRejet))) {
    res.status(400).json({ erreur: "Motif obligatoire et date de rejet valide" });
    return;
  }
  try {
    await service.rejeterAvanceExportateur(id, coopId, {
      motifRejet,
      dateRejet: body.dateRejet == null ? undefined : String(body.dateRejet),
    });
    const avance = await service.getAvanceExportateurSummary(id, coopId);
    if (!avance) {
      res.status(404).json({ erreur: "Avance exportateur introuvable" });
      return;
    }
    res.json(avance);
  } catch (err) {
    reportError(req, res, err, "postRejeterAvanceExportateur");
  }
}

export async function postAnnulerAvanceExportateur(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  if (!coopId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const id = parseId(req, res);
  if (id === null) return;
  const motifAnnulation =
    typeof (req.body as { motifAnnulation?: unknown } | undefined)?.motifAnnulation === "string"
      ? String((req.body as { motifAnnulation: string }).motifAnnulation).trim()
      : "";
  if (!motifAnnulation) {
    res.status(400).json({ erreur: "Le motif d'annulation est obligatoire" });
    return;
  }
  try {
    await service.annulerAvanceExportateur(id, coopId, motifAnnulation);
    const avance = await service.getAvanceExportateurSummary(id, coopId);
    if (!avance) {
      res.status(404).json({ erreur: "Avance exportateur introuvable" });
      return;
    }
    res.json(avance);
  } catch (err) {
    reportError(req, res, err, "postAnnulerAvanceExportateur");
  }
}

export async function postImputerAvanceExportateur(req: Request, res: Response): Promise<void> {
  const coopId = cooperativeId(req);
  const actorId = userId(req);
  if (!coopId || !actorId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const id = parseId(req, res);
  if (id === null) return;
  const body = (req.body ?? {}) as { venteExportateurId?: unknown; montantFcfa?: unknown };
  if (
    !Number.isInteger(body.venteExportateurId) ||
    Number(body.venteExportateurId) <= 0 ||
    !Number.isInteger(body.montantFcfa) ||
    Number(body.montantFcfa) <= 0
  ) {
    res.status(400).json({ erreur: "Vente et montant strictement positif obligatoires" });
    return;
  }
  try {
    const imputation = await service.imputerAvanceExportateur(id, coopId, {
      venteExportateurId: Number(body.venteExportateurId),
      montantFcfa: Number(body.montantFcfa),
    }, actorId);
    res.status(201).json(imputation);
  } catch (err) {
    reportError(req, res, err, "postImputerAvanceExportateur");
  }
}
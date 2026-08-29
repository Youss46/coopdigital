import { type Request, type Response } from "express";
import {
  listExpeditions,
  getExpeditionsStats,
  getExpedition,
  createExpedition,
  changerStatut,
  confirmerReception,
  getRapportEudr,
  getFlotteVehicules,
  getFlotteChauffeurs,
  getLotsDisponibles,
  rattacherLot,
  detacherLot,
  genererNumeroExpedition,
  reglerFraisTransport,
} from "../services/expeditionsService";
import { generateBonLivraison, generateBordereauTransport, generateRapportEudrPdf, generateConstatReception } from "../services/pdfService";

export async function handleProchainNumero(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const numero = await genererNumeroExpedition(cooperativeId);
    res.json({ numero });
  } catch (err) {
    req.log.error({ err }, "handleProchainNumero");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleListExpeditions(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }

  try {
    const { statut, port, type_vehicule, litiges } = req.query as Record<string, string>;
    const rows = await listExpeditions(cooperativeId, {
      statut:       statut  || undefined,
      port:         port    || undefined,
      typeVehicule: type_vehicule || undefined,
      litiges:      litiges === "true",
    });
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "handleListExpeditions");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetStats(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const stats = await getExpeditionsStats(cooperativeId);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "handleGetStats");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetExpedition(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const exp = await getExpedition(cooperativeId, id);
    if (!exp) { res.status(404).json({ erreur: "Expédition introuvable" }); return; }
    res.json(exp);
  } catch (err) {
    req.log.error({ err }, "handleGetExpedition");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleCreateExpedition(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const exp = await createExpedition(cooperativeId, userId, req.body);
    res.status(201).json(exp);
  } catch (err) {
    req.log.error({ err }, "handleCreateExpedition");
    // Extraire le vrai message Postgres (souvent dans err.cause)
    const causeMsg = (err instanceof Error && err.cause instanceof Error) ? err.cause.message : "";
    const msg = causeMsg || (err instanceof Error ? err.message : String(err));
    const isColumnMissing   = msg.includes("column") && msg.includes("does not exist");
    const isMissingRelation = !isColumnMissing && msg.includes("relation") && msg.includes("does not exist");
    const isMissingType     = msg.includes("type") && msg.includes("does not exist");
    const isFKViolation     = msg.includes("violates foreign key constraint");
    const isUniqueViolation = msg.includes("duplicate key value violates unique constraint");
    const isCheckViolation  = msg.includes("violates check constraint");
    const isNotNull         = msg.includes("violates not-null constraint") || msg.includes("null value in column");
    const isInvalidInput    = msg.includes("invalid input") || msg.includes("invalid value");

    if (isColumnMissing) {
      res.status(500).json({ erreur: `Colonne manquante en base de données : ${msg}. Appliquez les migrations manquantes sur Railway.` });
    } else if (isMissingType) {
      res.status(500).json({ erreur: `Type ENUM manquant en base de données : ${msg}. Appliquez les migrations manquantes sur Railway.` });
    } else if (isMissingRelation) {
      res.status(500).json({ erreur: `Table manquante en base de données : ${msg}. Appliquez les migrations manquantes sur Railway.` });
    } else if (isFKViolation) {
      res.status(400).json({ erreur: `Référence invalide : ${msg}` });
    } else if (isUniqueViolation) {
      res.status(409).json({ erreur: `Doublon détecté : ${msg}` });
    } else if (isCheckViolation || isNotNull || isInvalidInput) {
      res.status(400).json({ erreur: `Contrainte de données : ${msg}` });
    } else {
      res.status(500).json({ erreur: `Erreur interne : ${msg}` });
    }
  }
}

export async function handleChangerStatut(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const { statut, notes, positionGps } = req.body as { statut: string; notes?: string; positionGps?: unknown };
    if (!statut) { res.status(400).json({ erreur: "statut requis" }); return; }
    const result = await changerStatut(cooperativeId, id, userId, statut, notes, positionGps);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "handleChangerStatut");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleConfirmerReception(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const result = await confirmerReception(cooperativeId, id, userId, req.body);
    res.json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "handleConfirmerReception");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleReglerFraisTransport(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) {
    res.status(403).json({ erreur: "Coopérative non associée" });
    return;
  }

  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ erreur: "ID invalide" });
      return;
    }
    const {
      modePaiement,
      caisseId,
      compteBancaireId,
      dateReglement,
      reference,
    } = req.body as {
      modePaiement?: "especes" | "banque";
      caisseId?: number;
      compteBancaireId?: number;
      dateReglement?: string;
      reference?: string;
    };

    const result = await reglerFraisTransport(cooperativeId, id, userId, {
      modePaiement: modePaiement!,
      caisseId: caisseId === undefined ? undefined : Number(caisseId),
      compteBancaireId: compteBancaireId === undefined ? undefined : Number(compteBancaireId),
      dateReglement,
      reference,
    });
    res.status(201).json(result);
  } catch (err: unknown) {
    req.log.error({ err }, "handleReglerFraisTransport");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleGetLotsDisponibles(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const expeditionId = parseInt(String(req.params["id"]), 10);
  if (isNaN(expeditionId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const lots = await getLotsDisponibles(cooperativeId, expeditionId);
    res.json(lots);
  } catch (err) {
    req.log.error({ err }, "handleGetLotsDisponibles");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleRattacherLot(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  const expeditionId = parseInt(String(req.params["id"]), 10);
  const { lotId } = req.body as { lotId?: number };
  if (isNaN(expeditionId) || !lotId) { res.status(400).json({ erreur: "Données invalides" }); return; }
  try {
    const row = await rattacherLot(expeditionId, lotId, cooperativeId);
    res.status(201).json(row);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleDetacherLot(req: Request, res: Response): Promise<void> {
  const expeditionId = parseInt(String(req.params["id"]), 10);
  const expeditionLotId = parseInt(String(req.params["lotRowId"]), 10);
  if (isNaN(expeditionId) || isNaN(expeditionLotId)) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    await detacherLot(expeditionLotId, expeditionId);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleGetFlotteVehicules(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const vehicules = await getFlotteVehicules(cooperativeId);
    res.json(vehicules);
  } catch (err) {
    req.log.error({ err }, "handleGetFlotteVehicules");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleGetFlotteChauffeurs(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const chauffeurs = await getFlotteChauffeurs(cooperativeId);
    res.json(chauffeurs);
  } catch (err) {
    req.log.error({ err }, "handleGetFlotteChauffeurs");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function handleRapportEudr(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    const rapport = await getRapportEudr(cooperativeId, id);
    res.json(rapport);
  } catch (err: unknown) {
    req.log.error({ err }, "handleRapportEudr");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleRapportEudrPdf(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const pdfBuffer = await generateRapportEudrPdf(id, cooperativeId);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rapport-eudr-${id}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    });
    res.end(pdfBuffer);
  } catch (err: unknown) {
    req.log.error({ err }, "handleRapportEudrPdf");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleBonLivraison(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const pdfBuffer = await generateBonLivraison(id, cooperativeId);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bon-livraison-${id}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    });
    res.end(pdfBuffer);
  } catch (err: unknown) {
    req.log.error({ err }, "handleBonLivraison");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleBordereauTransport(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const pdfBuffer = await generateBordereauTransport(id, cooperativeId);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="bordereau-transport-${id}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    });
    res.end(pdfBuffer);
  } catch (err: unknown) {
    req.log.error({ err }, "handleBordereauTransport");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function handleConstatReception(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }
    const pdfBuffer = await generateConstatReception(id, cooperativeId);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="constat-reception-${id}.pdf"`,
      "Content-Length": String(pdfBuffer.length),
    });
    res.end(pdfBuffer);
  } catch (err: unknown) {
    req.log.error({ err }, "handleConstatReception");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

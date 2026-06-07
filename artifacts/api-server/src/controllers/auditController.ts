import { type Request, type Response } from "express";
import * as auditService from "../services/auditService";

export async function getJournal(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId ?? 1;
    const {
      user_id, module, action, entite_id, entite_type,
      date_debut, date_fin, recherche,
      limit, offset,
    } = req.query as Record<string, string>;

    const result = await auditService.getJournal(cooperativeId, {
      userId:     user_id    ? parseInt(user_id)    : undefined,
      module:     module     || undefined,
      action:     action     || undefined,
      entiteId:   entite_id  ? parseInt(entite_id)  : undefined,
      entiteType: entite_type || undefined,
      dateDebut:  date_debut || undefined,
      dateFin:    date_fin   || undefined,
      recherche:  recherche  || undefined,
      limit:      limit      ? parseInt(limit)      : 50,
      offset:     offset     ? parseInt(offset)     : 0,
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur getJournal");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getEntiteHistorique(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId ?? 1;
    const type = String(req.params["type"]);
    const id   = String(req.params["id"]);
    const entries = await auditService.getHistoriqueEntite(cooperativeId, type, parseInt(id));
    res.json({ entries });
  } catch (err) {
    req.log.error({ err }, "Erreur getEntiteHistorique");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getUserActions(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId ?? 1;
    const id = String(req.params["id"]);
    const { limit } = req.query as { limit?: string };
    const entries = await auditService.getUserActions(cooperativeId, parseInt(id), limit ? parseInt(limit) : 100);
    res.json({ entries });
  } catch (err) {
    req.log.error({ err }, "Erreur getUserActions");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getSessions(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId ?? 1;
    const { limit } = req.query as { limit?: string };
    const sessions = await auditService.getSessions(cooperativeId, limit ? parseInt(limit) : 50);
    res.json({ sessions });
  } catch (err) {
    req.log.error({ err }, "Erreur getSessions");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getStats(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId ?? 1;
    const stats = await auditService.getStats(cooperativeId);
    res.json(stats);
  } catch (err) {
    req.log.error({ err }, "Erreur getStats");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function exportPdf(req: Request, res: Response): Promise<void> {
  try {
    const {
      date_debut, date_fin, module, user_id,
    } = req.query as Record<string, string>;

    const generatedBy = req.user?.role ?? "inconnu";

    const cooperativeId = req.user?.cooperativeId ?? 1;
    const pdfBuffer = await auditService.exportAuditPDF(
      cooperativeId,
      {
        dateDebut: date_debut || undefined,
        dateFin:   date_fin   || undefined,
        module:    module     || undefined,
        userId:    user_id    ? parseInt(user_id) : undefined,
      },
      generatedBy,
    );

    const dateStr  = new Date().toISOString().slice(0, 10);
    const filename = `audit_coopdigital_coop1_${dateStr}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    req.log.error({ err }, "Erreur exportPdf");
    res.status(500).json({ erreur: "Erreur génération PDF" });
  }
}

export async function getModifications(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId ?? 1;
    const entite_type = String(req.params["entite_type"]);
    const entite_id   = String(req.params["entite_id"]);
    const entries = await auditService.getHistoriqueEntite(cooperativeId, entite_type, parseInt(entite_id));

    // Filtre uniquement UPDATE pour les avant/après
    const modifications = entries
      .filter((e) => e.action === "UPDATE" && (e.valeursAvant || e.valeursApres))
      .map((e) => ({
        id:             e.id,
        userId:         e.userId,
        userNom:        e.userNom,
        userRole:       e.userRole,
        createdAt:      e.createdAt,
        champsModifies: e.champsModifies,
        valeursAvant:   e.valeursAvant,
        valeursApres:   e.valeursApres,
      }));

    res.json({ modifications });
  } catch (err) {
    req.log.error({ err }, "Erreur getModifications");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

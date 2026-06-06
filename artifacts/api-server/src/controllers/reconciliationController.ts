import { Request, Response } from "express";
import multer from "multer";
import * as svc from "../services/reconciliationService.js";

// ─── Multer en mémoire (pas de disque) ───────────────────────────────────────

export const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 }, // 10 Mo
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.includes("csv")
      || file.mimetype.includes("excel")
      || file.mimetype.includes("spreadsheet")
      || file.originalname.endsWith(".csv")
      || file.originalname.endsWith(".xlsx")
      || file.originalname.endsWith(".xls");
    if (!ok) cb(new Error("Format non supporté — CSV ou Excel uniquement"));
    else cb(null, true);
  },
});

// ─── Aperçu avant import ──────────────────────────────────────────────────────

export async function postPreview(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) { res.status(400).json({ error: "Fichier requis" }); return; }
    const { headers, preview } = svc.parseFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ headers, preview });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur parsing";
    req.log.error({ err }, "postPreview reconciliation");
    res.status(400).json({ error: msg });
  }
}

// ─── Import complet ───────────────────────────────────────────────────────────

export async function postImporter(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) { res.status(400).json({ error: "Fichier requis" }); return; }
    const { banque, numero_compte, user_mapping } = req.body as {
      banque?: string; numero_compte?: string; user_mapping?: string;
    };
    const userMapping = user_mapping ? (JSON.parse(user_mapping) as Record<string, string>) : undefined;

    const result = await svc.importerReleve({
      buffer:       req.file.buffer,
      mimetype:     req.file.mimetype,
      originalname: req.file.originalname,
      banque,
      numeroCompte: numero_compte,
      importePar:   (req as Request & { user?: { id: number } }).user?.id,
      userMapping,
    });
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur import";
    req.log.error({ err }, "postImporter reconciliation");
    res.status(400).json({ error: msg });
  }
}

// ─── Liste des relevés ────────────────────────────────────────────────────────

export async function getReleves(req: Request, res: Response): Promise<void> {
  try { res.json(await svc.listReleves()); }
  catch (err) { req.log.error({ err }, "getReleves"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Détail d'un relevé ───────────────────────────────────────────────────────

export async function getReleve(req: Request, res: Response): Promise<void> {
  try {
    const id   = parseInt(String(req.params["id"]), 10);
    const data = await svc.getReleve(id);
    if (!data) { res.status(404).json({ error: "Relevé introuvable" }); return; }
    res.json(data);
  } catch (err) { req.log.error({ err }, "getReleve"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Réconciliation automatique ───────────────────────────────────────────────

export async function postAuto(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]), 10);
    res.json(await svc.reconcilierAutomatiquement(id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "postAuto reconciliation");
    res.status(400).json({ error: msg });
  }
}

// ─── Réconciliation manuelle ──────────────────────────────────────────────────

export async function putReconcilier(req: Request, res: Response): Promise<void> {
  try {
    const ligneId    = parseInt(String(req.params["id"]), 10);
    const { ecriture_id } = req.body as { ecriture_id: number };
    if (!ecriture_id) { res.status(400).json({ error: "ecriture_id requis" }); return; }
    res.json(await svc.reconcilierManuel(ligneId, ecriture_id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    req.log.error({ err }, "putReconcilier");
    res.status(400).json({ error: msg });
  }
}

// ─── Ignorer une ligne ────────────────────────────────────────────────────────

export async function putIgnorer(req: Request, res: Response): Promise<void> {
  try {
    const id   = parseInt(String(req.params["id"]), 10);
    const { motif } = req.body as { motif?: string };
    res.json(await svc.ignorerLigne(id, motif));
  } catch (err) { req.log.error({ err }, "putIgnorer"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Recherche écritures (autocomplete) ───────────────────────────────────────

export async function getEcritures(req: Request, res: Response): Promise<void> {
  try {
    const q       = String(req.query["q"] ?? "");
    const montant = req.query["montant"] ? parseInt(String(req.query["montant"]), 10) : undefined;
    res.json(await svc.rechercherEcritures(q, montant));
  } catch (err) { req.log.error({ err }, "getEcritures reconciliation"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Rapport PDF ──────────────────────────────────────────────────────────────

export async function getRapportPdf(req: Request, res: Response): Promise<void> {
  try {
    const id  = parseInt(String(req.params["id"]), 10);
    const buf = await svc.genererRapportPdf(id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="reconciliation-${id}.pdf"`);
    res.send(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur PDF";
    req.log.error({ err }, "getRapportPdf reconciliation");
    res.status(500).json({ error: msg });
  }
}

import { Request, Response } from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
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
      || file.originalname.endsWith(".xlsx");
    if (!ok) cb(new Error("Format non supporté — CSV ou Excel (.xlsx) uniquement"));
    else cb(null, true);
  },
});

// ─── Aperçu avant import ──────────────────────────────────────────────────────

export async function postPreview(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) { res.status(400).json({ error: "Fichier requis" }); return; }
    const { headers, preview } = await svc.parseFileBuffer(req.file.buffer, req.file.mimetype, req.file.originalname);
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
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    if (!req.file) { res.status(400).json({ error: "Fichier requis" }); return; }
    const { banque, numero_compte, user_mapping } = req.body as {
      banque?: string; numero_compte?: string; user_mapping?: string;
    };
    const userMapping = user_mapping ? (JSON.parse(user_mapping) as Record<string, string>) : undefined;

    const result = await svc.importerReleve(cooperativeId, {
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
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.listReleves(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getReleves"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Détail d'un relevé ───────────────────────────────────────────────────────

export async function getReleve(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id   = parseInt(String(req.params["id"]), 10);
    const data = await svc.getReleve(cooperativeId, id);
    if (!data) { res.status(404).json({ error: "Relevé introuvable" }); return; }
    res.json(data);
  } catch (err) { req.log.error({ err }, "getReleve"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Réconciliation automatique ───────────────────────────────────────────────

export async function postAuto(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    res.json(await svc.reconcilierAutomatiquement(cooperativeId, id));
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
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const q       = String(req.query["q"] ?? "");
    const montant = req.query["montant"] ? parseInt(String(req.query["montant"]), 10) : undefined;
    res.json(await svc.rechercherEcritures(cooperativeId, q, montant));
  } catch (err) { req.log.error({ err }, "getEcritures reconciliation"); res.status(500).json({ error: "Erreur serveur" }); }
}

// ─── Suggestions IA pour une ligne ───────────────────────────────────────────

export async function postSuggestionsIA(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

    const ligneId = parseInt(String(req.params["id"]), 10);

    const ligneQ = await db.execute<{
      libelle_banque: string; montant_fcfa: string; date_operation: string;
      type: string; reference_banque: string | null; banque: string; numero_compte: string | null;
    }>(sql`
      SELECT l.libelle_banque, l.montant_fcfa::text, l.date_operation::text, l.type,
             l.reference_banque, r.banque, r.numero_compte
      FROM lignes_releve l
      JOIN releves_bancaires r ON r.id = l.releve_id
      WHERE l.id = ${ligneId} AND r.cooperative_id = ${cooperativeId}
    `);
    const ligne = ligneQ.rows[0];
    if (!ligne) { res.status(404).json({ error: "Ligne introuvable" }); return; }

    const montant = Math.round(parseFloat(ligne.montant_fcfa));

    const candidatesQ = await db.execute<{
      id: number; date_ecriture: string; libelle: string;
      compte_debit: string; compte_credit: string; montant_fcfa: number; source: string;
    }>(sql`
      SELECT id, date_ecriture::text AS date_ecriture, libelle,
             compte_debit, compte_credit, montant_fcfa::numeric AS montant_fcfa, source
      FROM ecritures_comptables
      WHERE cooperative_id = ${cooperativeId}
        AND (compte_debit IN ('521','522','571') OR compte_credit IN ('521','522','571'))
        AND montant_fcfa::numeric BETWEEN ${Math.round(montant * 0.6)} AND ${Math.round(montant * 1.4)}
        AND date_ecriture BETWEEN (${ligne.date_operation}::date - INTERVAL '30 days')
                               AND (${ligne.date_operation}::date + INTERVAL '30 days')
        AND id NOT IN (SELECT ecriture_id FROM lignes_releve WHERE ecriture_id IS NOT NULL)
      ORDER BY ABS(montant_fcfa::numeric - ${montant}) ASC,
               ABS(date_ecriture::date - ${ligne.date_operation}::date) ASC
      LIMIT 15
    `);
    const candidates = candidatesQ.rows;

    if (candidates.length === 0) {
      res.json({ suggestions: [], message: "Aucune écriture candidate dans la plage montant/date" });
      return;
    }

    const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

    const system = `Tu es expert-comptable spécialisé en rapprochement bancaire pour des coopératives agricoles en Côte d'Ivoire (SYSCOHADA).
Réponds UNIQUEMENT avec un tableau JSON valide, sans markdown, sans texte hors du JSON.`;

    const user = `Opération bancaire à rapprocher :
- Date : ${ligne.date_operation}
- Libellé banque : ${ligne.libelle_banque}
- Montant : ${montant.toLocaleString("fr-FR")} FCFA (${ligne.type === "debit" ? "débit — sortie banque" : "crédit — entrée banque"})
- Référence : ${ligne.reference_banque ?? "—"}
- Banque : ${ligne.banque}${ligne.numero_compte ? ` (compte ${ligne.numero_compte})` : ""}

Écritures candidates (filtrées par montant ±40 % et date ±30 jours) :
${candidates.map((e, i) => `${i + 1}. ID=${e.id} | ${e.date_ecriture} | ${e.libelle} | ${Number(e.montant_fcfa).toLocaleString("fr-FR")} FCFA | Débit:${e.compte_debit} Crédit:${e.compte_credit} | Source:${e.source}`).join("\n")}

Retourne les 3 meilleures correspondances (ou moins s'il n'y en a pas). Score de 0 à 100. Raison en 1-2 phrases en français.
Format JSON exact :
[{"ecritureId":<id>,"score":<0-100>,"raison":"<explication>"}]`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
    let parsed: { ecritureId: number; score: number; raison: string }[] = [];
    try { parsed = JSON.parse(text); } catch { req.log.warn({ text }, "Claude suggestions JSON parse error"); }

    const suggestions = parsed
      .map((s) => ({ ...s, ecriture: candidates.find((c) => c.id === s.ecritureId) ?? null }))
      .filter((s) => s.ecriture !== null);

    res.json({ suggestions });
  } catch (err) {
    req.log.error({ err }, "postSuggestionsIA reconciliation");
    res.status(500).json({ error: "Erreur lors de la consultation IA" });
  }
}

// ─── Analyse IA streaming d'un relevé complet ─────────────────────────────────

export async function postAnalyseIA(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
    const id = parseInt(String(req.params["id"]), 10);

    const releveQ = await db.execute<{
      banque: string; numero_compte: string | null;
      periode_debut: string | null; periode_fin: string | null;
      solde_debut_fcfa: string; solde_fin_fcfa: string;
    }>(sql`
      SELECT banque, numero_compte, periode_debut::text, periode_fin::text,
             solde_debut_fcfa::text, solde_fin_fcfa::text
      FROM releves_bancaires
      WHERE id = ${id} AND cooperative_id = ${cooperativeId}
    `);
    const releve = releveQ.rows[0];
    if (!releve) { res.status(404).json({ error: "Relevé introuvable" }); return; }

    const lignesQ = await db.execute<{
      date_operation: string; libelle_banque: string; montant_fcfa: string; type: string;
      reference_banque: string | null; statut_reconciliation: string; ecart_fcfa: string;
      ecriture_libelle: string | null;
    }>(sql`
      SELECT l.date_operation::text, l.libelle_banque, l.montant_fcfa::text, l.type,
             l.reference_banque, l.statut_reconciliation, l.ecart_fcfa::text,
             e.libelle AS ecriture_libelle
      FROM lignes_releve l
      LEFT JOIN ecritures_comptables e ON e.id = l.ecriture_id
      WHERE l.releve_id = ${id}
      ORDER BY l.date_operation, l.id
    `);
    const lignes = lignesQ.rows;

    const nonRec  = lignes.filter(l => ["non_reconciliee", "a_justifier"].includes(l.statut_reconciliation));
    const recAvecEcart = lignes.filter(l => l.statut_reconciliation === "reconciliee" && Math.abs(parseFloat(l.ecart_fcfa)) > 0);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

    const system = `Tu es expert-comptable et auditeur spécialisé dans les coopératives agricoles SYSCOHADA en Côte d'Ivoire.
Tu produis des rapports de rapprochement bancaire clairs et actionnables en français professionnel.
Utilise des titres Markdown (## et ###) et des listes à puces. Sois concis et précis.`;

    const user = `# Analyse de rapprochement bancaire

## Informations du relevé
- Banque : ${releve.banque}${releve.numero_compte ? ` — compte ${releve.numero_compte}` : ""}
- Période : ${releve.periode_debut ?? "?"} → ${releve.periode_fin ?? "?"}
- Solde début : ${Number(releve.solde_debut_fcfa).toLocaleString("fr-FR")} FCFA | Solde fin : ${Number(releve.solde_fin_fcfa).toLocaleString("fr-FR")} FCFA
- Total lignes : ${lignes.length} | Réconciliées : ${lignes.length - nonRec.length} | Non réconciliées : ${nonRec.length}

## Lignes réconciliées avec écart (${recAvecEcart.length})
${recAvecEcart.slice(0, 10).map(l => `- ${l.date_operation} | ${l.libelle_banque} | Banque: ${Number(l.montant_fcfa).toLocaleString("fr-FR")} FCFA | Écart: ${Number(l.ecart_fcfa).toLocaleString("fr-FR")} FCFA`).join("\n") || "Aucun écart."}

## Lignes non réconciliées (${nonRec.length})
${nonRec.slice(0, 40).map(l => `- ${l.date_operation} | ${l.type === "debit" ? "↓ Débit" : "↑ Crédit"} | ${Number(l.montant_fcfa).toLocaleString("fr-FR")} FCFA | ${l.libelle_banque}${l.statut_reconciliation === "a_justifier" ? " [À VÉRIFIER — écriture proposée : " + (l.ecriture_libelle ?? "?") + "]" : ""}`).join("\n") || "Aucune ligne non réconciliée."}

## Analyse demandée
1. **Synthèse** — taux de réconciliation, montant total non réconcilié, appréciation globale
2. **Anomalies** — opérations suspectes, montants inhabituels, doublons potentiels, libellés atypiques
3. **Patterns** — types d'opérations dominants, charges récurrentes identifiées
4. **Actions prioritaires** — top 5 lignes à traiter en urgence avec suggestion de traitement
5. **Conclusion** — recommandations comptables et appréciation de la situation de trésorerie`;

    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: user }],
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    req.log.error({ err }, "postAnalyseIA reconciliation");
    if (!res.headersSent) res.status(500).json({ error: "Erreur analyse IA" });
    else { res.write(`data: ${JSON.stringify({ erreur: "Erreur analyse IA" })}\n\n`); res.end(); }
  }
}

// ─── Rapport PDF ──────────────────────────────────────────────────────────────

export async function getRapportPdf(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id  = parseInt(String(req.params["id"]), 10);
    const buf = await svc.genererRapportPdf(cooperativeId, id);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="reconciliation-${id}.pdf"`);
    res.send(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur PDF";
    req.log.error({ err }, "getRapportPdf reconciliation");
    res.status(500).json({ error: msg });
  }
}

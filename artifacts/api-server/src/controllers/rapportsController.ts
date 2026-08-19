import { type Request, type Response } from "express";
import { db, campagnesTable, usersTable, livraisonsTable, membresTable, rapportsIaTable, fournisseursTable, sessionsPeseeTable } from "@workspace/db";
import { and, eq, desc, or } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import PDFDocument from "pdfkit";
import {
  Document, Packer, Paragraph, TextRun,
  Table, TableRow, TableCell,
  HeadingLevel, WidthType, BorderStyle, ShadingType, AlignmentType,
} from "docx";
import { getKPIs, buildPrompt } from "../services/rapportIAService";
import { drawHeader, drawFooter } from "../services/pdfHeaderService";
import {
  generateFicheMembre,
  generateRapportMensuel,
  generateBilanCampagne,
  generateBilanOHADA,
  generateCompteResultatOHADA,
  generateFluxTresoreiriePdf,
  generateRecuLivraison,
  generateBordereauAchatSession,
  generateRecuPaiement,
  generateBulletinPaie,
  generateBordereauPesee,
  generateRecuAvance,
  generateRecuIntrant,
  generateEtatPartsSociales,
  generateReleveCommissions,
} from "../services/pdfService";

function sendPdf(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buffer.length));
  res.end(buffer);
}

export async function getMemberPdf(req: Request, res: Response): Promise<void> {
  const membreId = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!membreId) { res.status(400).json({ erreur: "ID membre invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try {
    const buffer = await generateFicheMembre(membreId, cooperativeId);
    sendPdf(res, buffer, `fiche_membre_${membreId}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getMemberPdf");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getMonthlyReport(req: Request, res: Response): Promise<void> {
  const mois = parseInt(String(req.params["mois"] ?? "0"));
  const annee = parseInt(String(req.params["an"] ?? "0"));
  if (!mois || mois < 1 || mois > 12 || !annee) {
    res.status(400).json({ erreur: "Mois ou année invalide" }); return;
  }
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try {
    const buffer = await generateRapportMensuel(cooperativeId, mois, annee);
    const moisStr = String(mois).padStart(2, "0");
    sendPdf(res, buffer, `rapport_mensuel_${annee}_${moisStr}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getMonthlyReport");
    res.status(500).json({ erreur: "Erreur génération PDF" });
  }
}

export async function getCampaignBilan(req: Request, res: Response): Promise<void> {
  const annee = parseInt(String(req.params["annee"] ?? "0"));
  if (!annee) { res.status(400).json({ erreur: "Année invalide" }); return; }

  const anneeEnCours = new Date().getFullYear();
  if (annee >= anneeEnCours) {
    res.status(422).json({
      erreur: `La campagne ${annee} n'est pas encore clôturée. Le bilan annuel ne peut être généré qu'après la clôture de l'exercice.`,
      code: "CAMPAGNE_NON_CLOTUREE",
    });
    return;
  }

  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const buffer = await generateBilanCampagne(cooperativeId, annee);
    sendPdf(res, buffer, `bilan_campagne_${annee}.pdf`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    req.log.error({ err, msg, stack }, "Erreur getCampaignBilan");
    res.status(500).json({ erreur: "Erreur génération PDF", detail: msg });
  }
}

// ─── Nouveaux reçus ───────────────────────────────────────────────────────────

export async function getRecuLivraison(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID livraison invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const [livraison] = await db
      .select({
        sessionId: sessionsPeseeTable.id,
        bonReceptionId: sessionsPeseeTable.bonReceptionId,
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
      .leftJoin(fournisseursTable, eq(fournisseursTable.id, livraisonsTable.fournisseurId))
      .leftJoin(sessionsPeseeTable, eq(sessionsPeseeTable.livraisonId, livraisonsTable.id))
      .where(
        and(
          eq(livraisonsTable.id, id),
          or(
            eq(membresTable.cooperativeId, cooperativeId),
            eq(fournisseursTable.cooperativeId, cooperativeId),
          ),
        ),
      )
      .limit(1);
    if (!livraison) { res.status(404).json({ erreur: "Livraison introuvable" }); return; }

    const bordereauAchat = livraison.bonReceptionId != null && livraison.sessionId != null;
    const buffer = bordereauAchat
      ? await generateBordereauAchatSession(livraison.sessionId, cooperativeId)
      : await generateRecuLivraison(id, cooperativeId);
    sendPdf(
      res,
      buffer,
      bordereauAchat
        ? `bordereau_achat_${livraison.sessionId}.pdf`
        : `recu_livraison_${id}.pdf`,
    );
  } catch (err) {
    req.log.error({ err }, "Erreur getRecuLivraison");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getTerrainRecuLivraison(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const agent = req.agent;
  const cooperativeId = agent?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID livraison invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  // For peseur: verify ownership using the same join/fields as getPeseurCollectes history.
  // A grouped delivery can be assigned to the delegue (agentId) while its peseur is
  // recorded separately on the livraison or the source session.
  const [livraison] = await db
    .select({
      agentId: livraisonsTable.agentId,
      peseurId: livraisonsTable.peseurId,
      sessionPeseurId: sessionsPeseeTable.peseurId,
      sessionId: sessionsPeseeTable.id,
      bonReceptionId: sessionsPeseeTable.bonReceptionId,
    })
    .from(livraisonsTable)
    .leftJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
    .leftJoin(fournisseursTable, eq(fournisseursTable.id, livraisonsTable.fournisseurId))
    .leftJoin(sessionsPeseeTable, eq(sessionsPeseeTable.livraisonId, livraisonsTable.id))
    .where(
      and(
        eq(livraisonsTable.id, id),
        or(
          eq(membresTable.cooperativeId, cooperativeId),
          eq(fournisseursTable.cooperativeId, cooperativeId),
        ),
      ),
    )
    .limit(1);
  if (!livraison) { res.status(404).json({ erreur: "Livraison introuvable" }); return; }

  if (agent?.role === "peseur") {
    const isOwner = livraison.agentId === agent.id
      || livraison.peseurId === agent.id
      || livraison.sessionPeseurId === agent.id;
    if (!isOwner) {
      res.status(403).json({ erreur: "Accès non autorisé à cette livraison" }); return;
    }
  }

  try {
    const bordereauAchat = livraison.bonReceptionId != null && livraison.sessionId != null;
    const buffer = bordereauAchat
      ? await generateBordereauAchatSession(livraison.sessionId, cooperativeId)
      : await generateRecuLivraison(id, cooperativeId);
    sendPdf(
      res,
      buffer,
      bordereauAchat
        ? `bordereau_achat_${livraison.sessionId}.pdf`
        : `recu_livraison_${id}.pdf`,
    );
  } catch (err) {
    req.log.error({ err }, "Erreur getTerrainRecuLivraison");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getRecuPaiement(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID paiement invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateRecuPaiement(id, cooperativeId);
    sendPdf(res, buffer, `recu_paiement_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getRecuPaiement");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getBulletinPaie(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID bulletin invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateBulletinPaie(id, cooperativeId);
    sendPdf(res, buffer, `bulletin_paie_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getBulletinPaie");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getBordereauPesee(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID livraison invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateBordereauPesee(id, cooperativeId);
    sendPdf(res, buffer, `bordereau_pesee_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getBordereauPesee");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getRecuAvance(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID avance invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateRecuAvance(id, cooperativeId);
    sendPdf(res, buffer, `recu_avance_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getRecuAvance");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getRecuIntrant(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID distribution invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateRecuIntrant(id, cooperativeId);
    sendPdf(res, buffer, `recu_intrant_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getRecuIntrant");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getEtatPartsSociales(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID membre invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateEtatPartsSociales(id, cooperativeId);
    sendPdf(res, buffer, `parts_sociales_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getEtatPartsSociales");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getBilanOHADAPdf(req: Request, res: Response): Promise<void> {
  const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : new Date().getFullYear();
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateBilanOHADA(cooperativeId, exercice);
    sendPdf(res, buffer, `bilan_ohada_${exercice}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getBilanOHADAPdf");
    res.status(500).json({ erreur: "Erreur génération PDF bilan" });
  }
}

export async function getCompteResultatOHADAPdf(req: Request, res: Response): Promise<void> {
  const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : new Date().getFullYear();
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateCompteResultatOHADA(cooperativeId, exercice);
    sendPdf(res, buffer, `compte_resultat_ohada_${exercice}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getCompteResultatOHADAPdf");
    res.status(500).json({ erreur: "Erreur génération PDF compte de résultat" });
  }
}

export async function getFluxTresoreiriePdf(req: Request, res: Response): Promise<void> {
  const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : new Date().getFullYear();
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateFluxTresoreiriePdf(cooperativeId, exercice);
    sendPdf(res, buffer, `flux_tresorerie_${exercice}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getFluxTresoreiriePdf");
    res.status(500).json({ erreur: "Erreur génération PDF flux de trésorerie" });
  }
}

export async function getAdminReleveCommissions(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  const delegueId = parseInt(String(req.params["agentId"] ?? "0"));
  if (!delegueId) { res.status(400).json({ erreur: "ID délégué invalide" }); return; }

  // Vérifier que le délégué appartient à la coopérative du responsable
  const [delegue] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, delegueId), eq(usersTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!delegue) { res.status(404).json({ erreur: "Délégué introuvable ou non autorisé" }); return; }

  let campagneId: number | undefined;
  if (req.query.campagneId !== undefined) {
    const parsed = Number(req.query.campagneId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ erreur: "campagneId doit être un entier positif" });
      return;
    }
    const [campagne] = await db
      .select({ id: campagnesTable.id })
      .from(campagnesTable)
      .where(and(eq(campagnesTable.id, parsed), eq(campagnesTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!campagne) { res.status(404).json({ erreur: "Campagne introuvable ou non autorisée" }); return; }
    campagneId = parsed;
  }

  try {
    const buffer = await generateReleveCommissions(delegueId, cooperativeId, campagneId);
    const suffix = campagneId ? `_campagne_${campagneId}` : "_toutes";
    sendPdf(res, buffer, `releve_commissions_delegue_${delegueId}${suffix}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getAdminReleveCommissions");
    res.status(500).json({ erreur: "Erreur génération PDF relevé commissions" });
  }
}

export async function getTerrainReleveCommissions(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId;
  const delegueId = req.agent?.id;
  if (!cooperativeId || !delegueId) {
    res.status(401).json({ erreur: "Non autorisé" });
    return;
  }
  let campagneId: number | undefined;
  if (req.query.campagneId !== undefined) {
    const parsed = Number(req.query.campagneId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ erreur: "campagneId doit être un entier positif" });
      return;
    }
    // Vérifier que la campagne existe et appartient à la coopérative de l'agent
    const [campagne] = await db
      .select({ id: campagnesTable.id })
      .from(campagnesTable)
      .where(and(eq(campagnesTable.id, parsed), eq(campagnesTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!campagne) {
      res.status(404).json({ erreur: "Campagne introuvable ou non autorisée" });
      return;
    }
    campagneId = parsed;
  }
  try {
    const buffer = await generateReleveCommissions(delegueId, cooperativeId, campagneId);
    const suffix = campagneId ? `_campagne_${campagneId}` : "_toutes";
    sendPdf(res, buffer, `releve_commissions${suffix}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getTerrainReleveCommissions");
    res.status(500).json({ erreur: "Erreur génération PDF relevé commissions" });
  }
}

// ─── Rapport de gestion IA — streaming SSE ────────────────────────────────────
export async function genererRapportIA(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  const { sections, campagneId } = req.body as { sections?: string[]; campagneId?: number };
  if (!sections || sections.length === 0) {
    res.status(400).json({ erreur: "Aucune section sélectionnée" }); return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    // Si aucune campagne sélectionnée, auto-associer à la campagne en cours
    let resolvedCampagneId = campagneId;
    if (!resolvedCampagneId) {
      const [active] = await db
        .select({ id: campagnesTable.id })
        .from(campagnesTable)
        .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
        .limit(1);
      if (active) resolvedCampagneId = active.id;
    }

    const kpis = await getKPIs(cooperativeId, resolvedCampagneId);
    const { system, user } = buildPrompt(kpis, sections);

    const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-5",
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
    });

    let contenuComplet = "";
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        contenuComplet += event.delta.text;
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    // ── Sauvegarde automatique en base ────────────────────────────────────────
    if (contenuComplet.trim()) {
      try {
        const titre = kpis.campagne
          ? `Rapport de gestion — Campagne ${kpis.campagne.libelle}`
          : "Rapport de gestion — Toutes campagnes";
        const [saved] = await db
          .insert(rapportsIaTable)
          .values({
            cooperativeId,
            campagneId: kpis.campagne ? (resolvedCampagneId ?? null) : null,
            titre,
            sections,
            contenu: contenuComplet,
            generePar: req.user?.id ?? null,
          })
          .returning({ id: rapportsIaTable.id });
        if (saved) {
          res.write(`data: ${JSON.stringify({ saved: saved.id })}\n\n`);
        }
      } catch (saveErr) {
        req.log.error({ err: saveErr }, "Erreur sauvegarde rapport IA");
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    req.log.error({ err }, "Erreur genererRapportIA");
    res.write(`data: ${JSON.stringify({ erreur: "Erreur lors de la génération" })}\n\n`);
    res.end();
  }
}

// ─── Rapport de gestion IA — export PDF ──────────────────────────────────────
export async function telechargerRapportIAPdf(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const { contenu, titre } = req.body as { contenu?: string; titre?: string };
  if (!contenu) { res.status(400).json({ erreur: "Contenu manquant" }); return; }

  try {
    const MARGIN = 50;
    const doc = new PDFDocument({ margin: MARGIN, size: "A4", bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));

    const pageW  = doc.page.width - MARGIN * 2;
    const VERT   = "#1a4731";
    const GRIS   = "#6b7280";
    const BODY   = 12;
    const LGAP   = 6; // lineGap → interligne 1,5

    // ── En-tête coopérative ───────────────────────────────────────────────────
    await drawHeader(doc, cooperativeId, {
      titre_document: titre ?? "Rapport de gestion",
    });

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Rend une ligne avec support du **gras** inline. */
    function renderInline(
      text: string,
      opts: { width: number; indent?: number; lineGap?: number; align?: string }
    ): void {
      const stripped = text.replace(/\*([^*]+)\*/g, "$1").replace(/_([^_]+)_/g, "$1");
      const parts = stripped.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const o = opts as any;
      if (parts.length === 1) {
        doc.font("Helvetica").text(stripped.replace(/\*\*/g, ""), o);
        return;
      }
      parts.forEach((part, i) => {
        const bold = part.startsWith("**") && part.endsWith("**");
        const txt  = bold ? part.slice(2, -2) : part;
        if (!txt) return;
        const isLast = i === parts.length - 1;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica")
          .text(txt, { ...o, continued: !isLast });
      });
    }

    /** Supprime les emojis et caractères hors-latin non supportés par Helvetica. */
    function stripUnsupported(text: string): string {
      return text
        // Emojis unicode (cercles colorés, symboles, etc.)
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
        .replace(/[\u{2600}-\u{26FF}]/gu, "")
        .replace(/[\u{2700}-\u{27BF}]/gu, "")
        // Remplacer indicateurs courants par équivalents ASCII
        .replace(/🟢/gu, "[OK]")
        .replace(/🟡/gu, "[~]")
        .replace(/🔴/gu, "[!]")
        .replace(/✅/gu, "[OK]")
        .replace(/❌/gu, "[X]")
        .replace(/⚠️/gu, "[!]")
        .replace(/⚠/gu, "[!]")
        .trim();
    }

    /** Rend un tableau Markdown en vraie grille PDF. */
    function renderTable(rows: string[]): void {
      // Supprimer les lignes séparatrices (|---|---|)
      const dataRows = rows.filter(r => !/^\|[\s\-:|]+\|$/.test(r.trim()));
      if (!dataRows.length) return;

      const parsed = dataRows.map(r =>
        r.split("|").slice(1, -1).map(c =>
          stripUnsupported(c.trim().replace(/\*\*/g, "").replace(/\*/g, ""))
        )
      );
      const colCount = Math.max(...parsed.map(r => r.length));
      if (!colCount) return;

      const PAD  = 7;
      const FS   = 10;
      const colW = pageW / colCount;

      parsed.forEach((cells, rIdx) => {
        const isHeader = rIdx === 0;

        // Calcul de la hauteur de ligne
        let rowH = FS + PAD * 2 + 2;
        cells.forEach(cell => {
          const approxCharsPerLine = Math.floor((colW - PAD * 2) / (FS * 0.55));
          const nLines = Math.max(1, Math.ceil(cell.length / Math.max(1, approxCharsPerLine)));
          const h = nLines * (FS + 2) + PAD * 2;
          if (h > rowH) rowH = h;
        });

        // Saut de page si nécessaire
        if (doc.y + rowH > doc.page.height - 80) {
          doc.addPage();
        }
        const rowY = doc.y;

        // Fond de cellule
        for (let c = 0; c < colCount; c++) {
          const bg = isHeader ? "#e8f4ed" : rIdx % 2 !== 0 ? "#f9fafb" : "#ffffff";
          doc.rect(MARGIN + c * colW, rowY, colW, rowH).fill(bg);
        }
        // Bordures
        for (let c = 0; c < colCount; c++) {
          doc.rect(MARGIN + c * colW, rowY, colW, rowH)
            .lineWidth(0.4)
            .stroke(isHeader ? "#a3c4b0" : "#e2e8f0");
        }
        // Texte
        for (let c = 0; c < colCount; c++) {
          const cell = cells[c] ?? "";
          doc
            .fillColor(isHeader ? VERT : "#1f2937")
            .font(isHeader ? "Helvetica-Bold" : "Helvetica")
            .fontSize(FS)
            .text(cell, MARGIN + c * colW + PAD, rowY + PAD, {
              width: colW - PAD * 2,
              lineGap: 2,
            } as never);
        }
        doc.y = rowY + rowH;
      });

      doc.moveDown(0.7);
    }

    // ── Parseur Markdown ──────────────────────────────────────────────────────
    const lines    = contenu.split("\n");
    let tableBuf: string[] = [];

    function flushTable(): void {
      if (tableBuf.length) {
        renderTable(tableBuf);
        tableBuf = [];
        // Réinitialiser X au bord gauche — PDFKit retient la position de la
        // dernière cellule rendue, ce qui décale tout le texte suivant.
        doc.x = MARGIN;
      }
    }

    for (const raw of lines) {
      const line = raw.trimEnd();

      // Accumulation des lignes de tableau
      if (line.startsWith("|")) {
        tableBuf.push(line);
        continue;
      }
      flushTable();

      if (line.startsWith("## ")) {
        doc.addPage();
        doc.fillColor(VERT).font("Helvetica-Bold").fontSize(15)
          .text(line.slice(3).toUpperCase(), { width: pageW } as never);
        doc.moveTo(MARGIN, doc.y + 4)
          .lineTo(MARGIN + pageW, doc.y + 4)
          .strokeColor("#c6dfd2").lineWidth(1.5).stroke();
        doc.moveDown(0.8);

      } else if (line.startsWith("### ")) {
        doc.fillColor(VERT).font("Helvetica-Bold").fontSize(13)
          .text(line.slice(4), { width: pageW } as never);
        doc.moveDown(0.45);

      } else if (line.startsWith("#### ")) {
        doc.fillColor(GRIS).font("Helvetica-Bold").fontSize(12)
          .text(line.slice(5), { width: pageW } as never);
        doc.moveDown(0.3);

      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        doc.fillColor("#1f2937").fontSize(BODY);
        renderInline(`• ${line.slice(2)}`, { width: pageW - 16, indent: 16, lineGap: LGAP });
        doc.moveDown(0.2);

      } else if (/^\d+\.\s/.test(line)) {
        doc.fillColor("#1f2937").fontSize(BODY);
        renderInline(line, { width: pageW - 16, indent: 16, lineGap: LGAP });
        doc.moveDown(0.2);

      } else if (line.startsWith("---")) {
        doc.moveTo(MARGIN, doc.y)
          .lineTo(MARGIN + pageW, doc.y)
          .strokeColor("#e5e7eb").lineWidth(0.5).stroke();
        doc.moveDown(0.5);

      } else if (line.trim() === "") {
        doc.moveDown(0.5);

      } else {
        doc.fillColor("#1f2937").fontSize(BODY);
        renderInline(line, { width: pageW, lineGap: LGAP });
        doc.moveDown(0.35);
      }
    }
    flushTable();

    // ── Pieds de page ─────────────────────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      await drawFooter(doc, cooperativeId, i - range.start + 1, range.count);
    }

    doc.end();
    await new Promise<void>(resolve => doc.on("end", resolve));

    const buffer = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rapport_gestion.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (err) {
    req.log.error({ err }, "Erreur telechargerRapportIAPdf");
    res.status(500).json({ erreur: "Erreur génération PDF" });
  }
}

// ─── Rapport IA → Word (.docx) ───────────────────────────────────────────────

export async function telechargerRapportIADocx(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const { contenu, titre } = req.body as { contenu?: string; titre?: string };
  if (!contenu) { res.status(400).json({ erreur: "Contenu manquant" }); return; }

  try {
    const VERT  = "1A4731";
    const GRIS  = "6B7280";
    const NOIR  = "1F2937";
    const SPACE = { line: 360, lineRule: "auto" as const }; // interligne 1.5

    /** Supprime les emojis non supportés. */
    function stripEmoji(s: string): string {
      return s
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
        .replace(/[\u{2600}-\u{27BF}]/gu, "")
        .replace(/🟢/gu, "[OK]").replace(/🟡/gu, "[~]")
        .replace(/🔴/gu, "[!]").replace(/✅/gu, "[OK]")
        .replace(/❌/gu, "[X]").replace(/⚠️/gu, "[!]").replace(/⚠/gu, "[!]");
    }

    /** Parse le **gras** inline → TextRun[]. */
    function parseInline(text: string, sz = 24, color = NOIR): TextRun[] {
      const clean = stripEmoji(text)
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/_([^_]+)_/g, "$1");
      const parts = clean.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
      return parts.map(p => {
        const bold = p.startsWith("**") && p.endsWith("**");
        return new TextRun({ text: bold ? p.slice(2, -2) : p, bold, size: sz, color, font: "Calibri" });
      });
    }

    /** Construit un vrai tableau Word depuis les lignes Markdown buffurisées. */
    function buildTable(rows: string[]): Table | null {
      const data = rows.filter(r => !/^\|[\s\-:|]+\|$/.test(r.trim()));
      if (!data.length) return null;
      const parsed = data.map(r =>
        r.split("|").slice(1, -1).map(c =>
          stripEmoji(c.trim().replace(/\*\*/g, "").replace(/\*/g, ""))
        )
      );
      const colCount = Math.max(...parsed.map(r => r.length));
      const pct      = Math.floor(5000 / colCount);

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top:              { style: BorderStyle.SINGLE, size: 4, color: "A3C4B0" },
          bottom:           { style: BorderStyle.SINGLE, size: 4, color: "A3C4B0" },
          left:             { style: BorderStyle.SINGLE, size: 4, color: "A3C4B0" },
          right:            { style: BorderStyle.SINGLE, size: 4, color: "A3C4B0" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
          insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: "E2E8F0" },
        },
        rows: parsed.map((cells, rIdx) => {
          const isHeader = rIdx === 0;
          return new TableRow({
            tableHeader: isHeader,
            children: Array.from({ length: colCount }, (_, c) =>
              new TableCell({
                width: { size: pct, type: WidthType.PERCENTAGE },
                shading: isHeader
                  ? { fill: "E8F4ED", type: ShadingType.CLEAR, color: "auto" }
                  : rIdx % 2 !== 0
                    ? { fill: "F2F4F7", type: ShadingType.CLEAR, color: "auto" }
                    : { fill: "FFFFFF", type: ShadingType.CLEAR, color: "auto" },
                margins: { top: 80, bottom: 80, left: 100, right: 100 },
                children: [new Paragraph({
                  children: [new TextRun({
                    text: cells[c] ?? "",
                    bold: isHeader,
                    color: isHeader ? VERT : NOIR,
                    size: 20,
                    font: "Calibri",
                  })],
                  spacing: { line: 276, lineRule: "auto" },
                })],
              })
            ),
          });
        }),
      });
    }

    // ── Parsing Markdown → éléments docx ─────────────────────────────────────
    const lines    = contenu.split("\n");
    const children: (Paragraph | Table)[] = [];
    let   tableBuf: string[] = [];

    function flushTable(): void {
      if (!tableBuf.length) return;
      const t = buildTable(tableBuf);
      if (t) {
        children.push(t);
        children.push(new Paragraph({ children: [], spacing: { after: 140 } }));
      }
      tableBuf = [];
    }

    // Titre du document
    children.push(new Paragraph({
      children: [new TextRun({ text: titre ?? "Rapport de gestion", bold: true, size: 40, color: VERT, font: "Calibri" })],
      spacing: { after: 400 },
      alignment: AlignmentType.CENTER,
    }));

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (line.startsWith("|")) { tableBuf.push(line); continue; }
      flushTable();

      if (line.startsWith("## ")) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: line.slice(3).toUpperCase(), bold: true, size: 30, color: VERT, font: "Calibri" })],
          spacing: { before: 440, after: 120 },
          pageBreakBefore: true,
        }));
      } else if (line.startsWith("### ")) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [new TextRun({ text: line.slice(4), bold: true, size: 26, color: VERT, font: "Calibri" })],
          spacing: { before: 280, after: 100 },
        }));
      } else if (line.startsWith("#### ")) {
        children.push(new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: line.slice(5), bold: true, size: 24, color: GRIS, font: "Calibri" })],
          spacing: { before: 180, after: 80 },
        }));
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          children: parseInline(line.slice(2)),
          spacing: { ...SPACE, after: 60 },
        }));
      } else if (/^\d+\.\s/.test(line)) {
        children.push(new Paragraph({
          numbering: { reference: "ol", level: 0 },
          children: parseInline(line.replace(/^\d+\.\s/, "")),
          spacing: { ...SPACE, after: 60 },
        }));
      } else if (line.startsWith("---")) {
        children.push(new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" } },
          children: [],
          spacing: { before: 100, after: 100 },
        }));
      } else if (line.trim() === "") {
        children.push(new Paragraph({ children: [], spacing: { after: 100 } }));
      } else {
        children.push(new Paragraph({
          children: parseInline(line),
          spacing: { ...SPACE, after: 80 },
        }));
      }
    }
    flushTable();

    const doc = new Document({
      numbering: {
        config: [{
          reference: "ol",
          levels: [{
            level: 0,
            format: "decimal",
            text: "%1.",
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        }],
      },
      sections: [{ properties: {}, children }],
    });

    const buffer = await Packer.toBuffer(doc);
    const safeName = (titre ?? "rapport_gestion").replace(/[^a-z0-9]/gi, "_").toLowerCase();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.docx"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (err) {
    req.log.error({ err }, "Erreur telechargerRapportIADocx");
    res.status(500).json({ erreur: "Erreur génération Word" });
  }
}

export async function listerRapportsIA(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  let campagneFilter = eq(rapportsIaTable.cooperativeId, cooperativeId);
  if (req.query["campagneId"] !== undefined) {
    const parsed = Number(req.query["campagneId"]);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ erreur: "campagneId doit être un entier positif" });
      return;
    }
    campagneFilter = and(campagneFilter, eq(rapportsIaTable.campagneId, parsed))!;
  }

  try {
    const rapports = await db
      .select({
        id: rapportsIaTable.id,
        titre: rapportsIaTable.titre,
        campagneId: rapportsIaTable.campagneId,
        sections: rapportsIaTable.sections,
        createdAt: rapportsIaTable.createdAt,
        auteurNom: usersTable.nom,
        auteurPrenom: usersTable.prenoms,
      })
      .from(rapportsIaTable)
      .leftJoin(usersTable, eq(usersTable.id, rapportsIaTable.generePar))
      .where(campagneFilter)
      .orderBy(desc(rapportsIaTable.createdAt));
    res.json(rapports);
  } catch (err) {
    req.log.error({ err }, "Erreur listerRapportsIA");
    res.status(500).json({ erreur: "Erreur chargement historique" });
  }
}

export async function getRapportIA(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const id = parseInt(String(req.params["id"] ?? "0"));
  if (!id) { res.status(400).json({ erreur: "ID rapport invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  try {
    const [rapport] = await db
      .select({
        id: rapportsIaTable.id,
        titre: rapportsIaTable.titre,
        campagneId: rapportsIaTable.campagneId,
        sections: rapportsIaTable.sections,
        contenu: rapportsIaTable.contenu,
        createdAt: rapportsIaTable.createdAt,
        auteurNom: usersTable.nom,
        auteurPrenom: usersTable.prenoms,
      })
      .from(rapportsIaTable)
      .leftJoin(usersTable, eq(usersTable.id, rapportsIaTable.generePar))
      .where(and(eq(rapportsIaTable.id, id), eq(rapportsIaTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!rapport) { res.status(404).json({ erreur: "Rapport introuvable" }); return; }
    res.json(rapport);
  } catch (err) {
    req.log.error({ err }, "Erreur getRapportIA");
    res.status(500).json({ erreur: "Erreur chargement rapport" });
  }
}

export async function supprimerRapportIA(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const id = parseInt(String(req.params["id"] ?? "0"));
  if (!id) { res.status(400).json({ erreur: "ID rapport invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  try {
    const deleted = await db
      .delete(rapportsIaTable)
      .where(and(eq(rapportsIaTable.id, id), eq(rapportsIaTable.cooperativeId, cooperativeId)))
      .returning({ id: rapportsIaTable.id });
    if (!deleted.length) { res.status(404).json({ erreur: "Rapport introuvable" }); return; }
    res.json({ succes: true });
  } catch (err) {
    req.log.error({ err }, "Erreur supprimerRapportIA");
    res.status(500).json({ erreur: "Erreur suppression rapport" });
  }
}

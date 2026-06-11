import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
import type { IndicateurRse } from "@workspace/db";
import { db, campagnesTable, cooperativesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { drawHeader, drawFooter } from "../services/pdfHeaderService";
import {
  calculerIndicateurs,
  getIndicateurs,
  getComparaison,
  getFormations,
  creerFormation,
  enregistrerEngagements,
  getDistributionRevenus,
} from "../services/rseService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function num(v: string | null | undefined, dec = 0): string {
  const n = parseFloat(v ?? "0") || 0;
  return dec > 0 ? n.toFixed(dec) : String(Math.round(n));
}

function formatFCFA(v: string | null | undefined): string {
  const n = Math.round(parseFloat(v ?? "0") || 0);
  return n.toLocaleString("fr-CI") + " FCFA";
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function getIndicateursHandler(req: Request, res: Response): Promise<void> {
  const coopId     = req.user?.cooperativeId;
  const campagneId = parseInt(String(req.params["campagne_id"] ?? ""), 10);
  if (!coopId || isNaN(campagneId)) { res.status(400).json({ error: "Paramètres invalides" }); return; }

  const ind = await getIndicateurs(coopId, campagneId);
  res.json({ calculé: !!ind, indicateurs: ind });
}

export async function calculerIndicateursHandler(req: Request, res: Response): Promise<void> {
  const coopId     = req.user?.cooperativeId;
  const campagneId = parseInt(String(req.params["campagne_id"] ?? ""), 10);
  if (!coopId || isNaN(campagneId)) { res.status(400).json({ error: "Paramètres invalides" }); return; }

  try {
    req.log.info({ coopId, campagneId }, "RSE: calcul indicateurs");
    const ind = await calculerIndicateurs(coopId, campagneId, req.user?.id);
    res.json({ success: true, indicateurs: ind });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    req.log.error({ err, coopId, campagneId }, "RSE: erreur calcul indicateurs");
    res.status(500).json({ error: `Erreur lors du calcul des indicateurs : ${msg}` });
  }
}

export async function getComparaisonHandler(req: Request, res: Response): Promise<void> {
  const coopId = req.user?.cooperativeId;
  if (!coopId) { res.status(400).json({ error: "cooperativeId manquant" }); return; }

  const data = await getComparaison(coopId);
  res.json(data);
}

export async function getFormationsHandler(req: Request, res: Response): Promise<void> {
  const coopId     = req.user?.cooperativeId;
  const campagneId = req.query["campagne_id"] ? parseInt(String(req.query["campagne_id"]), 10) : undefined;
  if (!coopId) { res.status(400).json({ error: "cooperativeId manquant" }); return; }

  const formations = await getFormations(coopId, campagneId);
  res.json(formations);
}

export async function creerFormationHandler(req: Request, res: Response): Promise<void> {
  const coopId = req.user?.cooperativeId;
  if (!coopId) { res.status(400).json({ error: "cooperativeId manquant" }); return; }

  const formation = await creerFormation(coopId, req.body as Parameters<typeof creerFormation>[1]);
  res.status(201).json(formation);
}

export async function getDistributionHandler(req: Request, res: Response): Promise<void> {
  const coopId     = req.user?.cooperativeId;
  const campagneId = parseInt(String(req.params["campagne_id"] ?? ""), 10);
  if (!coopId || isNaN(campagneId)) { res.status(400).json({ error: "Paramètres invalides" }); return; }

  const dist = await getDistributionRevenus(coopId, campagneId);
  res.json(dist);
}

export async function enregistrerEngagementsHandler(req: Request, res: Response): Promise<void> {
  const coopId     = req.user?.cooperativeId;
  const campagneId = parseInt(String(req.params["campagne_id"] ?? ""), 10);
  if (!coopId || isNaN(campagneId)) { res.status(400).json({ error: "Paramètres invalides" }); return; }

  const { engagements } = req.body as { engagements?: string };
  if (!engagements) { res.status(400).json({ error: "Champ engagements requis" }); return; }

  await enregistrerEngagements(coopId, campagneId, engagements);
  res.json({ success: true });
}

// ── PDF Rapport RSE ──────────────────────────────────────────────────────────

export async function genererRapportPdfHandler(req: Request, res: Response): Promise<void> {
  const coopId     = req.user?.cooperativeId;
  const campagneId = parseInt(String(req.params["campagne_id"] ?? ""), 10);
  if (!coopId || isNaN(campagneId)) { res.status(400).json({ error: "Paramètres invalides" }); return; }

  const [campagne] = await db.select().from(campagnesTable).where(eq(campagnesTable.id, campagneId)).limit(1);
  if (!campagne) { res.status(404).json({ error: "Campagne introuvable" }); return; }

  const ind = await getIndicateurs(coopId, campagneId);
  if (!ind) { res.status(404).json({ error: "Indicateurs non encore calculés. Lancez d'abord le calcul." }); return; }

  const [coop] = await db.select().from(cooperativesTable).where(eq(cooperativesTable.id, coopId)).limit(1);
  const formations = await getFormations(coopId, campagneId);

  const annee     = campagne.anneeDebut;
  const nomCoop   = coop?.nom ?? "Coopérative";
  const filename  = `rapport_rse_${(coop?.nom ?? "coop").toLowerCase().replace(/\s+/g, "_")}_${annee}.pdf`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  doc.pipe(res);

  const VERT   = "#1a4731";
  const ORANGE = "#f59e0b";
  const ROUGE  = "#dc2626";
  const GRIS   = "#6b7280";
  const W      = doc.page.width;
  const H      = doc.page.height;
  const MARGIN = 50;
  const CW     = W - MARGIN * 2;

  // ── Page 1 : Couverture ───────────────────────────────────────────────────
  doc.rect(0, 0, W, H).fill(VERT);

  // Bandeau décoratif bas
  doc.rect(0, H - 120, W, 120).fill("#0f2e1f");

  doc.fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("RAPPORT DE DURABILITÉ", MARGIN, 160, { width: CW, align: "center" });

  doc.fontSize(36)
    .text(String(annee), MARGIN, 190, { width: CW, align: "center" });

  doc.fontSize(22)
    .text(nomCoop.toUpperCase(), MARGIN, 255, { width: CW, align: "center" });

  doc.font("Helvetica")
    .fontSize(13)
    .fillColor("#a7f3d0")
    .text(`Campagne ${campagne.libelle}`, MARGIN, 300, { width: CW, align: "center" });

  // Ligne décorative
  doc.moveTo(MARGIN + 60, 340).lineTo(W - MARGIN - 60, 340).strokeColor("#4ade80").lineWidth(1.5).stroke();

  doc.fillColor("#d1fae5")
    .fontSize(13)
    .font("Helvetica-Oblique")
    .text("Ensemble pour un cacao durable et équitable", MARGIN, 360, { width: CW, align: "center" });

  // 5 KPI en bas
  const kpis = [
    { icon: "Membres",   val: String(ind.nbMembresTotal ?? 0), lbl: "producteurs" },
    { icon: "Femmes",    val: num(ind.pctFemmes) + "%",         lbl: "femmes" },
    { icon: "EUDR",      val: num(ind.pctConformiteEudr) + "%", lbl: "EUDR conforme" },
    { icon: "Revenu",    val: num(ind.revenuMoyenMembreFcfa),   lbl: "FCFA moy./an" },
    { icon: "Certifiés", val: num(ind.pctMembresCertifies) + "%", lbl: "certifiés" },
  ];
  const kpiW = (W - MARGIN * 2) / kpis.length;
  kpis.forEach((k, i) => {
    const x = MARGIN + i * kpiW;
    doc.fillColor("#4ade80").font("Helvetica-Bold").fontSize(18)
      .text(k.val, x, H - 95, { width: kpiW, align: "center" });
    doc.fillColor("#a7f3d0").font("Helvetica").fontSize(8)
      .text(k.lbl, x, H - 70, { width: kpiW, align: "center" });
  });

  doc.fillColor("#6b7280").fontSize(7).font("Helvetica")
    .text(`Généré le ${new Date().toLocaleDateString("fr-CI")} — CoopDigital`, MARGIN, H - 30, { width: CW, align: "center" });

  // ── Page 2 : Résumé exécutif ────────────────────────────────────────────────
  doc.addPage();
  await drawHeader(doc, coopId, { titre_document: "RÉSUMÉ EXÉCUTIF" });

  let y = 95;

  doc.fillColor(VERT).font("Helvetica-Bold").fontSize(14)
    .text("Chiffres clés de durabilité", MARGIN, y);
  y += 30;

  const kpi2 = [
    { val: String(ind.nbMembresTotal ?? 0),           lbl: "Producteurs membres", color: VERT   },
    { val: num(ind.pctFemmes) + "%",                   lbl: "Femmes membres",      color: ORANGE },
    { val: num(ind.pctConformiteEudr) + "%",           lbl: "Conformité EUDR",     color: VERT   },
    { val: formatFCFA(ind.revenuMoyenMembreFcfa),      lbl: "Revenu moyen annuel", color: VERT   },
    { val: num(ind.pctMembresCertifies) + "%",         lbl: "Membres certifiés",   color: ORANGE },
    { val: String(ind.nbFormationsDispensees ?? 0),    lbl: "Formations dispensées", color: VERT },
  ];
  const boxW = (CW - 20) / 3;
  const boxH = 70;
  kpi2.forEach((k, i) => {
    const col  = i % 3;
    const row  = Math.floor(i / 3);
    const bx   = MARGIN + col * (boxW + 10);
    const by   = y + row * (boxH + 12);
    doc.roundedRect(bx, by, boxW, boxH, 6).fill("#f0fdf4");
    doc.fillColor(k.color).font("Helvetica-Bold").fontSize(16)
      .text(k.val, bx + 8, by + 12, { width: boxW - 16, align: "center" });
    doc.fillColor(GRIS).font("Helvetica").fontSize(8)
      .text(k.lbl, bx + 8, by + 42, { width: boxW - 16, align: "center" });
  });
  y += 2 * (boxH + 12) + 20;

  // Score global RSE
  const scoreGlobal = _scoreGlobal(ind);
  doc.fillColor(VERT).font("Helvetica-Bold").fontSize(13)
    .text("Score global RSE", MARGIN, y);
  y += 22;
  doc.roundedRect(MARGIN, y, CW, 30, 4).fill("#e5e7eb");
  doc.roundedRect(MARGIN, y, CW * scoreGlobal / 100, 30, 4).fill(scoreGlobal >= 70 ? VERT : ORANGE);
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(13)
    .text(`${scoreGlobal} / 100`, MARGIN, y + 8, { width: CW, align: "center" });
  y += 50;

  // Engagements
  if (ind.engagementsCampagneSuivante) {
    doc.fillColor(VERT).font("Helvetica-Bold").fontSize(11).text("Engagements campagne suivante", MARGIN, y);
    y += 18;
    doc.fillColor("#374151").font("Helvetica").fontSize(9)
      .text(ind.engagementsCampagneSuivante, MARGIN, y, { width: CW });
  }

  await drawFooter(doc, coopId, 2, 7);

  // ── Page 3 : Dimension sociale ──────────────────────────────────────────────
  doc.addPage();
  await drawHeader(doc, coopId, { titre_document: "DIMENSION SOCIALE" });
  y = 95;

  _sectionTitle(doc, "Profil des membres", MARGIN, y, VERT); y += 28;

  _row2col(doc, MARGIN, y, CW,
    [
      ["Membres actifs",          String(ind.nbMembresTotal ?? 0)],
      ["Membres femmes",          String(ind.nbMembresFemmes ?? 0)],
      ["Part femmes",             num(ind.pctFemmes) + "%"],
      ["Membres jeunes (< 35 ans)", String(ind.nbMembresJeunes ?? 0)],
    ]
  ); y += 110;

  _sectionTitle(doc, "Analyse des revenus", MARGIN, y, VERT); y += 28;

  _row2col(doc, MARGIN, y, CW,
    [
      ["Revenu moyen annuel",     formatFCFA(ind.revenuMoyenMembreFcfa)],
      ["Revenu médian",           formatFCFA(ind.revenuMedianMembreFcfa)],
      ["Revenu minimum",          formatFCFA(ind.revenuMinMembreFcfa)],
      ["Revenu maximum",          formatFCFA(ind.revenuMaxMembreFcfa)],
      ["Seuil pauvreté national", "750 000 FCFA / an"],
      ["Membres sous le seuil",   `${ind.nbMembresSousSeuil ?? 0} (${num(ind.pctMembresSousSeuil)}%)`],
    ]
  ); y += 160;

  if (ind.pctMembresSousSeuil && parseFloat(ind.pctMembresSousSeuil) > 20) {
    doc.roundedRect(MARGIN, y, CW, 50, 6).fill("#fef3c7");
    doc.fillColor(ORANGE).font("Helvetica-Bold").fontSize(9)
      .text("Point d'attention", MARGIN + 12, y + 10);
    doc.fillColor("#92400e").font("Helvetica").fontSize(8)
      .text(
        `${ind.nbMembresSousSeuil ?? 0} membres ont un revenu cacao inférieur au seuil de pauvreté national. ` +
        "Actions recommandées : renforcer les formations qualité, augmenter les avances intrants.",
        MARGIN + 12, y + 25, { width: CW - 24 }
      );
    y += 62;
  }

  _sectionTitle(doc, "Formations dispensées", MARGIN, y, VERT); y += 28;
  _row2col(doc, MARGIN, y, CW,
    [
      ["Formations organisées",   String(ind.nbFormationsDispensees ?? 0)],
      ["Bénéficiaires formés",    String(ind.nbBeneficiairesFormation ?? 0)],
      ["Jours de formation",      String(ind.nbJoursFormation ?? 0)],
      ["Thématiques",             (ind.thematiquesFormation ?? []).join(", ") || "—"],
    ]
  );

  await drawFooter(doc, coopId, 3, 7);

  // ── Page 4 : Dimension environnementale ─────────────────────────────────────
  doc.addPage();
  await drawHeader(doc, coopId, { titre_document: "ENVIRONNEMENT & EUDR" });
  y = 95;

  _sectionTitle(doc, "Conformité EUDR", MARGIN, y, VERT); y += 28;

  const pctEudr = parseFloat(ind.pctConformiteEudr ?? "0") || 0;
  _barIndicateur(doc, "Parcelles conformes EUDR", pctEudr, MARGIN, y, CW, pctEudr >= 80 ? VERT : ROUGE);
  y += 55;

  _row2col(doc, MARGIN, y, CW,
    [
      ["Parcelles conformes",     String(ind.nbParcellesConformesEudr ?? 0)],
      ["Conformité EUDR",         num(ind.pctConformiteEudr) + "%"],
      ["Superficie totale",       (parseFloat(ind.superficieTotaleHa ?? "0") || 0).toFixed(2) + " ha"],
      ["Superficie certifiée",    (parseFloat(ind.superficieCertifieeHa ?? "0") || 0).toFixed(2) + " ha"],
      ["% superficie certifiée",  num(ind.pctSuperficieCertifiee) + "%"],
      ["Arbres plantés",          String(ind.nbArbresPlantes ?? 0)],
    ]
  ); y += 160;

  _sectionTitle(doc, "Certifications", MARGIN, y, VERT); y += 28;
  _row2col(doc, MARGIN, y, CW,
    [
      ["Membres certifiés UTZ",           String(ind.nbMembresCertifiesUtz       ?? 0)],
      ["Membres Rainforest Alliance",     String(ind.nbMembresCertifiesRainforest ?? 0)],
      ["Membres Fairtrade",               String(ind.nbMembresCertifiesFairtrade  ?? 0)],
      ["Membres certifiés EUDR",          String(ind.nbMembresCertifiesEudr       ?? 0)],
      ["% membres certifiés (global)",    num(ind.pctMembresCertifies) + "%"],
    ]
  );

  await drawFooter(doc, coopId, 4, 7);

  // ── Page 5 : Dimension économique ────────────────────────────────────────────
  doc.addPage();
  await drawHeader(doc, coopId, { titre_document: "DIMENSION ÉCONOMIQUE" });
  y = 95;

  _sectionTitle(doc, "Prix et soutien financier", MARGIN, y, VERT); y += 28;
  _row2col(doc, MARGIN, y, CW,
    [
      ["Prix moyen payé au kg",        ind.prixMoyenPayeKgFcfa ? formatFCFA(ind.prixMoyenPayeKgFcfa) + "/kg" : "—"],
      ["Primes qualité distribuées",   formatFCFA(ind.primeQualiteDistribueeFcfa)],
      ["Primes certification",         formatFCFA(ind.primeCertificationFcfa)],
      ["Subventions intrants",         formatFCFA(ind.subventionsIntrantsFcfa)],
      ["Taux remboursement avances",   num(ind.tauxRemboursementAvancesPct) + "%"],
    ]
  );

  await drawFooter(doc, coopId, 5, 7);

  // ── Page 6 : Gouvernance ──────────────────────────────────────────────────────
  doc.addPage();
  await drawHeader(doc, coopId, { titre_document: "GOUVERNANCE" });
  y = 95;

  _sectionTitle(doc, "Assemblées générales", MARGIN, y, VERT); y += 28;
  _row2col(doc, MARGIN, y, CW,
    [
      ["AG tenues",              String(ind.nbAgTenues ?? 0)],
      ["Taux de participation",  num(ind.tauxParticipationAgPct) + "%"],
    ]
  ); y += 90;

  // Barre participation AG
  const tauxAg = parseFloat(ind.tauxParticipationAgPct ?? "0") || 0;
  _barIndicateur(doc, "Taux de participation aux AG", tauxAg, MARGIN, y, CW, tauxAg >= 60 ? VERT : ORANGE);
  y += 60;

  if (formations.length > 0) {
    _sectionTitle(doc, "Formations des équipes", MARGIN, y, VERT); y += 28;
    const rows = formations.slice(0, 8);
    const cols = [MARGIN, MARGIN + 100, MARGIN + 260, MARGIN + 360];
    doc.fillColor(VERT).font("Helvetica-Bold").fontSize(8);
    doc.text("DATE", cols[0]!, y, { width: 90 });
    doc.text("TITRE", cols[1]!, y, { width: 155 });
    doc.text("LIEU", cols[2]!, y, { width: 95 });
    doc.text("PARTICIPANTS", cols[3]!, y, { width: 90, align: "right" });
    y += 14;
    doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
    y += 6;
    doc.fillColor("#374151").font("Helvetica").fontSize(8);
    for (const f of rows) {
      const d = f.dateFormation ? new Date(f.dateFormation).toLocaleDateString("fr-CI") : "—";
      doc.text(d,                    cols[0]!, y, { width: 90 });
      doc.text(f.titre ?? "—",      cols[1]!, y, { width: 155 });
      doc.text(f.lieu ?? "—",       cols[2]!, y, { width: 95 });
      doc.text(String(f.nbParticipants ?? 0), cols[3]!, y, { width: 90, align: "right" });
      y += 16;
    }
  }

  await drawFooter(doc, coopId, 6, 7);

  // ── Page 7 : Engagements ──────────────────────────────────────────────────────
  doc.addPage();
  await drawHeader(doc, coopId, { titre_document: `ENGAGEMENTS ${annee + 1}` });
  y = 95;

  _sectionTitle(doc, `Objectifs RSE — Campagne ${annee + 1}`, MARGIN, y, VERT); y += 28;

  if (ind.engagementsCampagneSuivante) {
    doc.roundedRect(MARGIN, y, CW, 120, 6).fill("#f0fdf4");
    doc.fillColor("#374151").font("Helvetica").fontSize(10)
      .text(ind.engagementsCampagneSuivante, MARGIN + 12, y + 12, { width: CW - 24 });
    y += 135;
  } else {
    doc.roundedRect(MARGIN, y, CW, 60, 6).fill("#f9fafb");
    doc.fillColor(GRIS).font("Helvetica-Oblique").fontSize(10)
      .text("Aucun engagement enregistré pour la prochaine campagne.", MARGIN + 12, y + 18, { width: CW - 24 });
    y += 75;
  }

  // Objectifs standard
  const objectifs = [
    `Maintenir la conformité EUDR ≥ ${Math.min(100, pctEudr + 5)}%`,
    "Atteindre 40% de membres femmes",
    "Organiser au moins 4 formations par campagne",
    "Réduire le pourcentage de membres sous le seuil de pauvreté",
    "Augmenter le taux de participation aux AG à 80%",
  ];
  _sectionTitle(doc, "Objectifs standard GRI", MARGIN, y, VERT); y += 25;
  for (const obj of objectifs) {
    doc.fillColor(VERT).font("Helvetica-Bold").fontSize(9).text("›", MARGIN, y);
    doc.fillColor("#374151").font("Helvetica").fontSize(9).text(obj, MARGIN + 14, y, { width: CW - 14 });
    y += 16;
  }
  y += 20;

  // Signature
  doc.moveTo(MARGIN, y).lineTo(W - MARGIN, y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  y += 15;
  doc.fillColor(GRIS).font("Helvetica").fontSize(8)
    .text(
      `Ce rapport a été généré le ${new Date().toLocaleDateString("fr-CI")} par CoopDigital. ` +
      "Conforme aux standards GRI (Global Reporting Initiative) et aux exigences Fairtrade / Rainforest Alliance.",
      MARGIN, y, { width: CW, align: "center" }
    );

  await drawFooter(doc, coopId, 7, 7);

  doc.end();
  req.log.info({ coopId, campagneId, filename }, "RSE: rapport PDF généré");
}

// ── Helpers PDF ────────────────────────────────────────────────────────────────

function _sectionTitle(doc: InstanceType<typeof PDFDocument>, titre: string, x: number, y: number, color: string): void {
  doc.fillColor(color).font("Helvetica-Bold").fontSize(11).text(titre, x, y);
  doc.moveTo(x, y + 16).lineTo(x + 495, y + 16).strokeColor(color).lineWidth(0.8).stroke();
}

function _row2col(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  cw: number,
  rows: [string, string][],
): void {
  const colW = (cw - 20) / 2;
  rows.forEach((r, i) => {
    const col   = i % 2;
    const row   = Math.floor(i / 2);
    const bx    = x + col * (colW + 20);
    const by    = y + row * 25;
    doc.fillColor("#6b7280").font("Helvetica").fontSize(8).text(r[0], bx, by, { width: colW });
    doc.fillColor("#111827").font("Helvetica-Bold").fontSize(9).text(r[1], bx, by + 11, { width: colW });
  });
}

function _barIndicateur(
  doc: InstanceType<typeof PDFDocument>,
  label: string,
  pct: number,
  x: number,
  y: number,
  cw: number,
  color: string,
): void {
  const barW = cw - 60;
  doc.fillColor("#374151").font("Helvetica").fontSize(9).text(label, x, y);
  doc.fillColor("#374151").font("Helvetica-Bold").fontSize(9).text(`${Math.round(pct)}%`, x + cw - 40, y);
  y += 16;
  doc.roundedRect(x, y, barW, 18, 4).fill("#e5e7eb");
  if (pct > 0) doc.roundedRect(x, y, barW * Math.min(pct, 100) / 100, 18, 4).fill(color);
}

function _scoreGlobal(ind: IndicateurRse): number {
  const dims = [
    Math.min(100, (parseFloat(ind.pctFemmes ?? "0") || 0) * 2),
    parseFloat(ind.pctConformiteEudr      ?? "0") || 0,
    Math.max(0, 100 - (parseFloat(ind.pctMembresSousSeuil ?? "0") || 0)),
    parseFloat(ind.pctMembresCertifies    ?? "0") || 0,
    Math.min(100, (ind.nbBeneficiairesFormation ?? 0) / Math.max(1, ind.nbMembresTotal ?? 1) * 100),
    parseFloat(ind.tauxParticipationAgPct ?? "0") || 0,
  ];
  return Math.round(dims.reduce((s, v) => s + v, 0) / dims.length);
}

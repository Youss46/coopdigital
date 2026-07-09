import type { Request, Response } from "express";
import {
  listCertifications,
  getCertification,
  getAuditsCertification,
  getStatsCertifications,
  createCertification,
  updateCertification,
  deleteCertification,
  createAudit,
  listMembresCertification,
  getMembreCertification,
  evaluerMembre,
  getStatsMembresConformite,
  getTonnageCampagneCertification,
  getDashboardCertifications,
  CRITERES_PAR_TYPE,
} from "../services/certificationService";

function coopId(req: Request): number | null { return req.user?.cooperativeId ?? null; }
function userId(req: Request): number | null { return req.user?.id ?? null; }
function parseId(req: Request, key = "id"): number | null {
  const n = parseInt(String(req.params[key]), 10);
  return isNaN(n) ? null : n;
}

// ─── Certifications coopérative ───────────────────────────────────────────────

export async function handleListCertifications(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try { res.json(await listCertifications(cid)); }
  catch (err) { req.log.error({ err }, "handleListCertifications"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleGetStatsCertifications(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try { res.json(await getStatsCertifications(cid)); }
  catch (err) { req.log.error({ err }, "handleGetStatsCertifications"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleGetDashboardCertifications(req: Request, res: Response): Promise<void> {
  const cid = coopId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  try { res.json(await getDashboardCertifications(cid)); }
  catch (err) { req.log.error({ err }, "handleGetDashboardCertifications"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleGetCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const cert = await getCertification(cid, id);
    if (!cert) { res.status(404).json({ erreur: "Certification introuvable" }); return; }
    const criteres       = CRITERES_PAR_TYPE[cert.type] ?? [];
    const statsM         = await getStatsMembresConformite(cid, id);
    const tonnageCampagne = await getTonnageCampagneCertification(cid, id);
    res.json({ ...cert, criteresType: criteres, statsMembres: statsM, tonnageCampagne: tonnageCampagne ?? null });
  } catch (err) { req.log.error({ err }, "handleGetCertification"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleGetAuditsCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try { res.json(await getAuditsCertification(cid, id)); }
  catch (err) { req.log.error({ err }, "handleGetAuditsCertification"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleCreateCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const uid = userId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Non autorisé" }); return; }
  try { res.status(201).json(await createCertification(cid, req.body, uid)); }
  catch (err) { req.log.error({ err }, "handleCreateCertification"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleUpdateCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const uid = userId(req); const id = parseId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Non autorisé" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try { res.json(await updateCertification(cid, id, req.body, uid)); }
  catch (err) {
    req.log.error({ err }, "handleUpdateCertification");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(msg === "Certification introuvable" ? 404 : 500).json({ erreur: msg });
  }
}

export async function handleDeleteCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const uid = userId(req); const id = parseId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Non autorisé" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try { await deleteCertification(cid, id, uid); res.status(204).end(); }
  catch (err) {
    req.log.error({ err }, "handleDeleteCertification");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(msg === "Certification introuvable" ? 404 : 500).json({ erreur: msg });
  }
}

// ─── Audits ───────────────────────────────────────────────────────────────────

export async function handleCreateAudit(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const uid = userId(req); const id = parseId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Non autorisé" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try { res.status(201).json(await createAudit(cid, id, req.body, uid)); }
  catch (err) {
    req.log.error({ err }, "handleCreateAudit");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(msg === "Certification introuvable" ? 404 : 500).json({ erreur: msg });
  }
}

// ─── Membres conformité ───────────────────────────────────────────────────────

export async function handleListMembresCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try { res.json(await listMembresCertification(cid, id)); }
  catch (err) { req.log.error({ err }, "handleListMembresCertification"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleGetMembreCertification(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req); const membreId = parseId(req, "membreId");
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id || !membreId) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const certif  = await getCertification(cid, id);
    if (!certif) { res.status(404).json({ erreur: "Certification introuvable" }); return; }
    const membre  = await getMembreCertification(cid, id, membreId);
    const criteres = CRITERES_PAR_TYPE[certif.type] ?? [];
    res.json({ membre, criteresType: criteres, certif });
  } catch (err) { req.log.error({ err }, "handleGetMembreCertification"); res.status(500).json({ erreur: "Erreur interne" }); }
}

export async function handleEvaluerMembre(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const uid = userId(req); const id = parseId(req);
  if (!cid || !uid) { res.status(403).json({ erreur: "Non autorisé" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try { res.json(await evaluerMembre(cid, id, req.body, uid)); }
  catch (err) {
    req.log.error({ err }, "handleEvaluerMembre");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(msg === "Certification introuvable" ? 404 : 500).json({ erreur: msg });
  }
}

export async function handleGetCriteres(_req: Request, res: Response): Promise<void> {
  res.json(CRITERES_PAR_TYPE);
}

// ─── PDF rapport conformité ───────────────────────────────────────────────────

export async function handleRapportPdf(req: Request, res: Response): Promise<void> {
  const cid = coopId(req); const id = parseId(req);
  if (!cid) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }
  if (!id) { res.status(400).json({ erreur: "ID invalide" }); return; }
  try {
    const { db, cooperativesTable, certificationsTable: ct, certificationsMembresTable: cmt, membresTable } = await import("@workspace/db");
    const { eq, and } = await import("drizzle-orm");
    const PDFDocument = require("pdfkit") as typeof import("pdfkit");
    const { listMembresCertification, CRITERES_PAR_TYPE } = await import("../services/certificationService.js");

    const [certif] = await db.select().from(ct)
      .where(and(eq(ct.cooperativeId, cid), eq(ct.id, id))).limit(1);
    if (!certif) { res.status(404).json({ erreur: "Certification introuvable" }); return; }

    const [coop] = await db.select().from(cooperativesTable).where(eq(cooperativesTable.id, cid)).limit(1);

    const membres = await listMembresCertification(cid, id);
    const certifies    = membres.filter(m => m.statutConformite === "certifie").length;
    const enCours      = membres.filter(m => m.statutConformite === "en_cours").length;
    const nonConformes = membres.filter(m => m.statutConformite === "non_conforme").length;
    const taux         = membres.length > 0 ? Math.round(certifies / membres.length * 100) : 0;
    const criteres     = CRITERES_PAR_TYPE[certif.type] ?? [];

    const LABELS: Record<string, string> = {
      rainforest_alliance: "Rainforest Alliance", fairtrade: "Fairtrade",
      bio: "Agriculture Bio", eudr: "EUDR", utz: "UTZ", autre: "Autre",
    };

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="conformite-${certif.type}-${id}.pdf"`);

    doc.fontSize(18).font("Helvetica-Bold").text(`Rapport de Conformité`, { align: "center" });
    doc.fontSize(14).font("Helvetica").text(LABELS[certif.type] ?? certif.type, { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`Coopérative : ${coop?.nom ?? cid}`, { align: "left" });
    doc.text(`N° certificat : ${certif.numeroCertificat ?? "—"}`);
    doc.text(`Statut : ${certif.statut}`);
    if (certif.dateExpiration) doc.text(`Date d'expiration : ${certif.dateExpiration}`);
    doc.text(`Généré le : ${new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`);
    doc.moveDown();

    doc.fontSize(12).font("Helvetica-Bold").text("Synthèse de conformité des membres");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica").text(`Total évalués : ${membres.length}`);
    doc.text(`Certifiés (≥80%) : ${certifies} (${taux}%)`);
    doc.text(`En cours (50-79%) : ${enCours}`);
    doc.text(`Non conformes (<50%) : ${nonConformes}`);
    doc.moveDown();

    if (criteres.length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text("Critères de certification");
      doc.moveDown(0.3);
      for (const crit of criteres) {
        const validees = membres.filter(m => (m.criteresValides as string[]).includes(crit)).length;
        const pctCrit  = membres.length > 0 ? Math.round(validees / membres.length * 100) : 0;
        doc.fontSize(9).font("Helvetica").text(`• ${crit} — ${validees}/${membres.length} membres (${pctCrit}%)`);
      }
      doc.moveDown();
    }

    if (membres.length > 0) {
      doc.fontSize(12).font("Helvetica-Bold").text("Liste des membres évalués");
      doc.moveDown(0.3);
      for (const m of membres) {
        const badge = m.statutConformite === "certifie" ? "✓" : m.statutConformite === "en_cours" ? "◎" : "✗";
        doc.fontSize(9).font("Helvetica")
          .text(`${badge} ${m.membreNom} — score ${m.score}/${m.scoreMax} (${m.statutConformite.replace("_", " ")})`);
      }
    }

    doc.end();
    await new Promise<void>(resolve => doc.on("end", resolve));
    res.end(Buffer.concat(chunks));
  } catch (err) {
    req.log.error({ err }, "handleRapportPdf");
    if (!res.headersSent) res.status(500).json({ erreur: "Erreur interne" });
  }
}

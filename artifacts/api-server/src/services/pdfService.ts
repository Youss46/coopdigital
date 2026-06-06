/**
 * Service de génération PDF OHADA — pdfkit
 */
import PDFDocument from "pdfkit";
import path from "path";
import {
  db,
  membresTable,
  livraisonsTable,
  avancesTable,
  ventesExportateursTable,
  exportateursTable,
  ecrituresComptablesTable,
  planComptableTable,
} from "@workspace/db";
import { eq, desc, gte, lte, and, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";

const LOGO_PATH = path.join(process.cwd(), "public", "logo-192.png");

const VERT = "#1a4731";
const OR = "#c4962a";
const GRIS = "#6b7280";
const PAGE_W = 595.28;
const MARGIN = 50;
const COL1 = MARGIN;
const COL2 = PAGE_W / 2;

function formaterFCFA(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}
function formaterDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function enTeteDoc(doc: InstanceType<typeof PDFDocument>, titre: string) {
  doc.rect(0, 0, PAGE_W, 60).fill(VERT);
  try { doc.image(LOGO_PATH, MARGIN - 10, 8, { width: 44, height: 44 }); } catch (_) { /* logo facultatif */ }
  doc.fontSize(18).fillColor("white").font("Helvetica-Bold")
    .text("CoopDigital", MARGIN + 46, 14, { width: 220 });
  doc.fontSize(9).fillColor("#d1fae5").font("Helvetica")
    .text("Gestion des coopératives cacaoyères de Côte d'Ivoire", MARGIN + 46, 36);
  doc.fontSize(14).fillColor("white").font("Helvetica-Bold")
    .text(titre, PAGE_W / 2, 22, { width: PAGE_W / 2 - MARGIN, align: "right" });
  doc.fillColor("black");
  doc.moveDown(3);
}

function piedPage(doc: InstanceType<typeof PDFDocument>) {
  const pageH = doc.page.height;
  doc.fontSize(7).fillColor(GRIS).font("Helvetica")
    .text(
      `Généré le ${formaterDate(new Date())} — CoopDigital © ${new Date().getFullYear()}`,
      MARGIN,
      pageH - 30,
      { width: PAGE_W - MARGIN * 2, align: "center" }
    );
}

function ligneTableau(doc: InstanceType<typeof PDFDocument>, colonnes: string[], widths: number[], x: number, y: number, fond?: string) {
  if (fond) doc.rect(x, y, widths.reduce((a, b) => a + b, 0), 16).fill(fond);
  let cx = x;
  colonnes.forEach((col, i) => {
    doc.fontSize(8).fillColor(fond ? "white" : "black").font(fond ? "Helvetica-Bold" : "Helvetica")
      .text(col, cx + 3, y + 4, { width: (widths[i] ?? 80) - 6, lineBreak: false });
    cx += widths[i] ?? 80;
  });
  doc.fillColor("black");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fiche membre
// ─────────────────────────────────────────────────────────────────────────────
export async function generateFicheMembre(membreId: number): Promise<Buffer> {
  const [membre] = await db.select().from(membresTable).where(eq(membresTable.id, membreId));
  if (!membre) throw new Error("Membre introuvable");

  const sixMoisAvant = new Date();
  sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6);
  const dateMin = sixMoisAvant.toISOString().split("T")[0]!;

  const [livraisons, avances] = await Promise.all([
    db.select().from(livraisonsTable)
      .where(and(eq(livraisonsTable.membreId, membreId), gte(livraisonsTable.dateLivraison, dateMin)))
      .orderBy(desc(livraisonsTable.dateLivraison))
      .limit(20),
    db.select().from(avancesTable)
      .where(eq(avancesTable.membreId, membreId))
      .orderBy(desc(avancesTable.dateOctroi))
      .limit(10),
  ]);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    enTeteDoc(doc, "Fiche Membre");

    // Identité
    doc.fontSize(14).fillColor(VERT).font("Helvetica-Bold")
      .text(`${membre.prenoms} ${membre.nom}`, { underline: false });
    doc.fontSize(9).fillColor(GRIS).font("Helvetica")
      .text(`N° CNI : ${membre.numeroCni ?? "—"}   |   Statut : ${membre.statut}   |   Groupement : ${membre.groupement ?? "—"}`);
    doc.text(`Tél : ${membre.telephone ?? "—"}   |   Enregistré le : ${formaterDate(membre.createdAt)}`);

    // Parcelle
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("Parcelle");
    doc.fontSize(9).fillColor("black").font("Helvetica")
      .text(`Superficie : ${membre.superficieHa ? membre.superficieHa + " ha" : "—"}   |   GPS : ${membre.parcelleLat && membre.parcelleLng ? `${membre.parcelleLat}, ${membre.parcelleLng}` : "—"}`);

    // Tableau livraisons
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("Livraisons (6 derniers mois)");
    doc.moveDown(0.2);

    const lwCols = [80, 60, 80, 80, 80, 100];
    const lwHeaders = ["Date", "Poids (kg)", "Brut FCFA", "Avance déduite", "Net FCFA", "Prix unitaire"];
    let y = doc.y;
    ligneTableau(doc, lwHeaders, lwCols, MARGIN, y, VERT);
    y += 18;

    livraisons.forEach((l, idx) => {
      if (y > 730) { doc.addPage(); enTeteDoc(doc, "Fiche Membre (suite)"); y = doc.y; }
      const bg = idx % 2 === 0 ? "#f0fdf4" : undefined;
      if (bg) doc.rect(MARGIN, y, lwCols.reduce((a, b) => a + b, 0), 16).fill(bg);
      ligneTableau(doc, [
        formaterDate(l.dateLivraison),
        String(parseFloat(l.poidsKg).toFixed(1)),
        formaterFCFA(l.montantBrutFcfa),
        formaterFCFA(l.avanceDeduiteFcfa),
        formaterFCFA(l.montantNetFcfa),
        formaterFCFA(l.prixUnitaireFcfa) + "/kg",
      ], lwCols, MARGIN, y);
      y += 16;
    });

    if (livraisons.length === 0) {
      doc.fontSize(8).fillColor(GRIS).text("Aucune livraison sur la période", MARGIN, y + 4);
      y += 20;
    }

    // Tableau avances
    doc.y = y + 10;
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("Avances");
    doc.moveDown(0.2);

    const awCols = [80, 90, 90, 90, 90];
    const awHeaders = ["Date", "Montant octroyé", "Remboursé", "Solde restant", "Statut"];
    y = doc.y;
    ligneTableau(doc, awHeaders, awCols, MARGIN, y, VERT);
    y += 18;

    avances.forEach((a, idx) => {
      if (y > 730) { doc.addPage(); enTeteDoc(doc, "Fiche Membre (suite)"); y = doc.y; }
      const bg = idx % 2 === 0 ? "#fffbeb" : undefined;
      if (bg) doc.rect(MARGIN, y, awCols.reduce((a, b) => a + b, 0), 16).fill(bg);
      ligneTableau(doc, [
        formaterDate(a.dateOctroi),
        formaterFCFA(a.montantOctroyeFcfa),
        formaterFCFA(a.montantRembourse_fcfa),
        formaterFCFA(a.soldeRestantFcfa),
        a.statut,
      ], awCols, MARGIN, y);
      y += 16;
    });

    piedPage(doc);
    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Rapport mensuel
// ─────────────────────────────────────────────────────────────────────────────
export async function generateRapportMensuel(cooperativeId: number, mois: number, annee: number): Promise<Buffer> {
  const dateMin = `${annee}-${String(mois).padStart(2, "0")}-01`;
  const lastDay = new Date(annee, mois, 0).getDate();
  const dateMax = `${annee}-${String(mois).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const [livraisons, ventes, avancesRetard, ecritures] = await Promise.all([
    db.select({
      id: livraisonsTable.id,
      membreId: livraisonsTable.membreId,
      poidsKg: livraisonsTable.poidsKg,
      montantBrutFcfa: livraisonsTable.montantBrutFcfa,
      montantNetFcfa: livraisonsTable.montantNetFcfa,
      dateLivraison: livraisonsTable.dateLivraison,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
    })
    .from(livraisonsTable)
    .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
    .where(and(gte(livraisonsTable.dateLivraison, dateMin), lte(livraisonsTable.dateLivraison, dateMax)))
    .orderBy(livraisonsTable.dateLivraison),

    db.select({
      id: ventesExportateursTable.id,
      exportateurId: ventesExportateursTable.exportateurId,
      exportateurNom: exportateursTable.nom,
      montantTotalFcfa: ventesExportateursTable.montantTotalFcfa,
      soldeDuFcfa: ventesExportateursTable.soldeDuFcfa,
      statut: ventesExportateursTable.statut,
      dateVente: ventesExportateursTable.dateVente,
    })
    .from(ventesExportateursTable)
    .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
    .where(and(gte(ventesExportateursTable.dateVente, dateMin), lte(ventesExportateursTable.dateVente, dateMax))),

    db.select({ id: avancesTable.id, membreNom: membresTable.nom, membrePrenoms: membresTable.prenoms, montantOctroyeFcfa: avancesTable.montantOctroyeFcfa, soldeRestantFcfa: avancesTable.soldeRestantFcfa, dateEcheance: avancesTable.dateEcheance })
    .from(avancesTable)
    .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
    .where(eq(avancesTable.statut, "en_retard")),

    db.select().from(ecrituresComptablesTable)
    .where(and(eq(ecrituresComptablesTable.exercice, annee), gte(ecrituresComptablesTable.dateEcriture, dateMin), lte(ecrituresComptablesTable.dateEcriture, dateMax))),
  ]);

  const tonnage = livraisons.reduce((s, l) => s + parseFloat(l.poidsKg), 0);
  const caProduits = ecritures.filter(e => e.compteCredit === "701").reduce((s, e) => s + e.montantFcfa, 0);
  const coutAchats = ecritures.filter(e => e.compteDebit === "601").reduce((s, e) => s + e.montantFcfa, 0);
  const moisLabel = new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Page 1 – KPIs
    enTeteDoc(doc, `Rapport mensuel – ${moisLabel}`);

    const kpis = [
      { label: "Tonnage collecté", val: `${(tonnage / 1000).toFixed(2)} T` },
      { label: "CA ventes cacao", val: formaterFCFA(caProduits) },
      { label: "Coût achats producteurs", val: formaterFCFA(coutAchats) },
      { label: "Livraisons enregistrées", val: String(livraisons.length) },
      { label: "Ventes exportateurs", val: String(ventes.length) },
      { label: "Avances en retard", val: String(avancesRetard.length) },
    ];

    let y = doc.y;
    kpis.forEach((kpi, i) => {
      const col = i % 2 === 0 ? MARGIN : COL2;
      if (i % 2 === 0 && i > 0) y += 40;
      doc.rect(col, y, 220, 32).fill("#f0fdf4").stroke("#bbf7d0");
      doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(kpi.label, col + 8, y + 5, { width: 200 });
      doc.fontSize(13).fillColor(VERT).font("Helvetica-Bold").text(kpi.val, col + 8, y + 15, { width: 200 });
    });

    // Page 2 – Livraisons
    doc.addPage();
    enTeteDoc(doc, "Livraisons du mois");
    const lCols = [80, 140, 60, 90, 90];
    y = doc.y;
    ligneTableau(doc, ["Date", "Producteur", "Poids (kg)", "Brut FCFA", "Net FCFA"], lCols, MARGIN, y, VERT);
    y += 18;
    livraisons.forEach((l, idx) => {
      if (y > 730) { doc.addPage(); enTeteDoc(doc, "Livraisons (suite)"); y = doc.y; }
      if (idx % 2 === 0) doc.rect(MARGIN, y, lCols.reduce((a, b) => a + b, 0), 16).fill("#f0fdf4");
      ligneTableau(doc, [formaterDate(l.dateLivraison), `${l.membreNom} ${l.membrePrenoms}`, parseFloat(l.poidsKg).toFixed(0), formaterFCFA(l.montantBrutFcfa), formaterFCFA(l.montantNetFcfa)], lCols, MARGIN, y);
      y += 16;
    });

    // Page 3 – Ventes
    doc.addPage();
    enTeteDoc(doc, "Ventes exportateurs");
    const vCols = [80, 140, 100, 80, 70];
    y = doc.y;
    ligneTableau(doc, ["Date", "Exportateur", "Montant total", "Solde dû", "Statut"], vCols, MARGIN, y, OR);
    y += 18;
    ventes.forEach((v, idx) => {
      if (y > 730) { doc.addPage(); enTeteDoc(doc, "Ventes (suite)"); y = doc.y; }
      if (idx % 2 === 0) doc.rect(MARGIN, y, vCols.reduce((a, b) => a + b, 0), 16).fill("#fffbeb");
      ligneTableau(doc, [formaterDate(v.dateVente), v.exportateurNom ?? "—", formaterFCFA(v.montantTotalFcfa), formaterFCFA(v.soldeDuFcfa), v.statut], vCols, MARGIN, y);
      y += 16;
    });

    // Page 4 – Compte de résultat simplifié
    doc.addPage();
    enTeteDoc(doc, "Compte de résultat simplifié");
    const margeNette = caProduits - coutAchats;
    const crData = [
      { label: "Produits — Ventes cacao (701)", montant: caProduits, type: "produit" },
      { label: "Charges — Achats cacao (601)", montant: coutAchats, type: "charge" },
      { label: "Résultat net du mois", montant: margeNette, type: "resultat" },
    ];
    y = doc.y;
    crData.forEach((row) => {
      const bg = row.type === "resultat" ? VERT : row.type === "produit" ? "#f0fdf4" : "#fff7ed";
      doc.rect(MARGIN, y, 400, 22).fill(bg);
      doc.fontSize(10).fillColor(row.type === "resultat" ? "white" : "black").font(row.type === "resultat" ? "Helvetica-Bold" : "Helvetica")
        .text(row.label, MARGIN + 8, y + 6, { width: 280 });
      doc.text(formaterFCFA(row.montant), MARGIN + 300, y + 6, { width: 100, align: "right" });
      y += 24;
    });

    // Page 5 – Avances en retard
    doc.addPage();
    enTeteDoc(doc, "Avances en retard");
    const aCols = [160, 100, 100, 100];
    y = doc.y;
    ligneTableau(doc, ["Membre", "Montant octroyé", "Solde dû", "Échéance"], aCols, MARGIN, y, "#ef4444");
    y += 18;
    avancesRetard.forEach((a, idx) => {
      if (y > 730) { doc.addPage(); enTeteDoc(doc, "Avances en retard (suite)"); y = doc.y; }
      if (idx % 2 === 0) doc.rect(MARGIN, y, aCols.reduce((a, b) => a + b, 0), 16).fill("#fff1f2");
      ligneTableau(doc, [`${a.membreNom} ${a.membrePrenoms}`, formaterFCFA(a.montantOctroyeFcfa), formaterFCFA(a.soldeRestantFcfa), a.dateEcheance ? formaterDate(a.dateEcheance) : "—"], aCols, MARGIN, y);
      y += 16;
    });

    piedPage(doc);
    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bilan de campagne
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBilanCampagne(cooperativeId: number, annee: number): Promise<Buffer> {
  const ecritures = await db.select().from(ecrituresComptablesTable)
    .where(eq(ecrituresComptablesTable.exercice, annee));

  const planComptes = await db.select().from(planComptableTable).where(eq(planComptableTable.cooperativeId, cooperativeId));

  const topProducteurs = await db
    .select({
      nom: membresTable.nom,
      prenoms: membresTable.prenoms,
      tonnage: sql<number>`coalesce(sum(${livraisonsTable.poidsKg}::numeric), 0)::float`,
      caFcfa: sql<number>`coalesce(sum(${livraisonsTable.montantBrutFcfa}), 0)::int`,
    })
    .from(livraisonsTable)
    .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
    .where(gte(livraisonsTable.dateLivraison, `${annee}-01-01`))
    .groupBy(membresTable.id, membresTable.nom, membresTable.prenoms)
    .orderBy(sql`tonnage DESC`)
    .limit(10);

  const topExportateurs = await db
    .select({
      nom: exportateursTable.nom,
      caTotalFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.montantTotalFcfa}), 0)::int`,
      soldeDuFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.soldeDuFcfa}), 0)::int`,
    })
    .from(ventesExportateursTable)
    .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
    .where(gte(ventesExportateursTable.dateVente, `${annee}-01-01`))
    .groupBy(exportateursTable.id, exportateursTable.nom)
    .orderBy(sql`caTotalFcfa DESC`)
    .limit(5);

  // Agrégats
  const ca701 = ecritures.filter(e => e.compteCredit === "701").reduce((s, e) => s + e.montantFcfa, 0);
  const couts601 = ecritures.filter(e => e.compteDebit === "601").reduce((s, e) => s + e.montantFcfa, 0);
  const charges = ecritures.filter(e => ["621","641","661"].includes(e.compteDebit)).reduce((s, e) => s + e.montantFcfa, 0);
  const resultatNet = ca701 - couts601 - charges;
  const soldeBanque = ecritures.filter(e => e.compteDebit === "521").reduce((s, e) => s + e.montantFcfa, 0)
    - ecritures.filter(e => e.compteCredit === "521").reduce((s, e) => s + e.montantFcfa, 0);

  // Ventilation mensuelle (ASCII-like tableau)
  const parMois: Record<number, { ca: number; achats: number }> = {};
  for (let m = 1; m <= 12; m++) parMois[m] = { ca: 0, achats: 0 };
  ecritures.forEach(e => {
    const m = new Date(e.dateEcriture).getMonth() + 1;
    if (e.compteCredit === "701") parMois[m]!.ca += e.montantFcfa;
    if (e.compteDebit === "601") parMois[m]!.achats += e.montantFcfa;
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Page 1 – Résumé exécutif
    enTeteDoc(doc, `Bilan de campagne ${annee}`);
    doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold").text("Résumé exécutif");
    doc.moveDown(0.3);
    const kpis = [
      ["CA ventes cacao", formaterFCFA(ca701)],
      ["Coût achats producteurs", formaterFCFA(couts601)],
      ["Autres charges", formaterFCFA(charges)],
      ["Résultat net", formaterFCFA(resultatNet)],
      ["Solde banque", formaterFCFA(soldeBanque)],
      ["Taux de marge", ca701 > 0 ? `${((resultatNet / ca701) * 100).toFixed(1)} %` : "—"],
    ];
    let y = doc.y;
    kpis.forEach((kpi, i) => {
      const col = i % 2 === 0 ? MARGIN : COL2;
      if (i % 2 === 0 && i > 0) y += 38;
      doc.rect(col, y, 220, 30).fill(i === 6 ? VERT : "#f9fafb").stroke("#e5e7eb");
      doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(kpi[0]!, col + 8, y + 4, { width: 200 });
      doc.fontSize(12).fillColor(VERT).font("Helvetica-Bold").text(kpi[1]!, col + 8, y + 15, { width: 200 });
    });

    // Page 2 – Ventilation mensuelle
    doc.addPage();
    enTeteDoc(doc, "Évolution mensuelle");
    const moisNoms = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
    const mCols = [40, 90, 90, 90];
    y = doc.y;
    ligneTableau(doc, ["Mois", "CA Ventes (FCFA)", "Achats (FCFA)", "Marge (FCFA)"], mCols, MARGIN, y, VERT);
    y += 18;
    for (let m = 1; m <= 12; m++) {
      const d = parMois[m]!;
      const marge = d.ca - d.achats;
      if (m % 2 === 0) doc.rect(MARGIN, y, mCols.reduce((a, b) => a + b, 0), 16).fill("#f0fdf4");
      ligneTableau(doc, [moisNoms[m-1]!, formaterFCFA(d.ca), formaterFCFA(d.achats), formaterFCFA(marge)], mCols, MARGIN, y);
      y += 16;
    }

    // Page 3 – Top producteurs
    doc.addPage();
    enTeteDoc(doc, "Top 10 producteurs");
    const pCols = [160, 90, 90, 90];
    y = doc.y;
    ligneTableau(doc, ["Producteur", "Tonnage (T)", "Achats FCFA", "Rang"], pCols, MARGIN, y, VERT);
    y += 18;
    topProducteurs.forEach((p, i) => {
      if (i % 2 === 0) doc.rect(MARGIN, y, pCols.reduce((a, b) => a + b, 0), 16).fill("#f0fdf4");
      ligneTableau(doc, [`${p.nom} ${p.prenoms}`, (p.tonnage / 1000).toFixed(2), formaterFCFA(p.caFcfa), String(i + 1)], pCols, MARGIN, y);
      y += 16;
    });

    // Page 4 – Top exportateurs + Bilan
    doc.addPage();
    enTeteDoc(doc, "Top 5 exportateurs");
    const eCols = [160, 120, 100];
    y = doc.y;
    ligneTableau(doc, ["Exportateur", "CA total FCFA", "Solde dû FCFA"], eCols, MARGIN, y, OR);
    y += 18;
    topExportateurs.forEach((e, i) => {
      if (i % 2 === 0) doc.rect(MARGIN, y, eCols.reduce((a, b) => a + b, 0), 16).fill("#fffbeb");
      ligneTableau(doc, [e.nom ?? "—", formaterFCFA(e.caTotalFcfa), formaterFCFA(e.soldeDuFcfa)], eCols, MARGIN, y);
      y += 16;
    });

    // Bilan simplifié OHADA
    y += 20;
    doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold").text("Bilan simplifié OHADA", MARGIN, y);
    y += 18;
    const bilanData = [
      { sect: "ACTIF", label: "Créances exportateurs (4111)", montant: ecritures.filter(e => e.compteDebit === "4111").reduce((s, e) => s + e.montantFcfa, 0) - ecritures.filter(e => e.compteCredit === "4111").reduce((s, e) => s + e.montantFcfa, 0) },
      { sect: "ACTIF", label: "Créances producteurs avances (416)", montant: ecritures.filter(e => e.compteDebit === "416").reduce((s, e) => s + e.montantFcfa, 0) - ecritures.filter(e => e.compteCredit === "416").reduce((s, e) => s + e.montantFcfa, 0) },
      { sect: "ACTIF", label: "Banque (521)", montant: soldeBanque },
      { sect: "PASSIF", label: "Dettes fournisseurs producteurs (401)", montant: ecritures.filter(e => e.compteCredit === "401").reduce((s, e) => s + e.montantFcfa, 0) - ecritures.filter(e => e.compteDebit === "401").reduce((s, e) => s + e.montantFcfa, 0) },
      { sect: "PASSIF", label: "Résultat de l'exercice (130)", montant: resultatNet },
    ];
    bilanData.forEach((row) => {
      const bg = row.sect === "ACTIF" ? "#f0fdf4" : "#fff7ed";
      doc.rect(MARGIN, y, 420, 18).fill(bg);
      doc.fontSize(8).fillColor("black").font("Helvetica")
        .text(`[${row.sect}] ${row.label}`, MARGIN + 4, y + 5, { width: 310 });
      doc.text(formaterFCFA(Math.max(0, row.montant)), MARGIN + 320, y + 5, { width: 100, align: "right" });
      y += 20;
    });

    piedPage(doc);
    doc.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Procès-verbal d'Assemblée Générale
// ─────────────────────────────────────────────────────────────────────────────
type AgRow = {
  id: number; libelle: string; type: string; dateAg: string;
  heureDebut?: string|null; heureFin?: string|null; lieu?: string|null;
  nbMembresConvoques?: number|null; nbMembresPresents: number;
  quorumAtteint: boolean; quorumRequisPct: string;
  ordreDuJour?: string[]|null; statut: string;
};
type PointRow = {
  id: number; numero: number; intitule: string; type: string;
  rapporteur?: string|null; statut: string; decision?: string|null;
};
type PresenceRow = {
  p: { modePresence: string; heureArrivee?: Date|null };
  m: { nom: string; prenoms?: string|null; numeroCarte?: string|null };
};
type VoteRow = {
  id: number; pointId: number; intituleResolution: string;
  nbPour: number; nbContre: number; nbAbstention: number;
  nbVotants: number; resultat: string; pourcentagePour?: string|null;
};

export async function generatePvAg(params: {
  ag: AgRow; points: PointRow[]; presences: PresenceRow[]; votes: VoteRow[];
}): Promise<Buffer> {
  const { ag, points, presences, votes } = params;
  const typeFr: Record<string, string> = {
    ordinaire: "Ordinaire", extraordinaire: "Extraordinaire", constitutive: "Constitutive",
  };

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: MARGIN, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // ─── En-tête ─────────────────────────────────────────────────────────────
    enTeteDoc(doc, `PV — AG ${typeFr[ag.type] ?? ag.type} ${new Date(ag.dateAg).getFullYear()}`);

    // ─── Bloc infos AG ────────────────────────────────────────────────────────
    const dateStr = new Date(ag.dateAg).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    doc.fontSize(11).font("Helvetica-Bold").fillColor(VERT)
      .text(ag.libelle, MARGIN, doc.y, { width: PAGE_W - MARGIN * 2 });
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica").fillColor("black");
    const infos = [
      ["Date",  dateStr],
      ["Heure", `${ag.heureDebut ? ag.heureDebut.slice(0,5) : "—"}${ag.heureFin ? " → " + ag.heureFin.slice(0,5) : ""}`],
      ["Lieu",  ag.lieu ?? "—"],
    ];
    infos.forEach(([k, v]) => {
      doc.font("Helvetica-Bold").text(`${k} :  `, MARGIN, doc.y, { continued: true })
         .font("Helvetica").text(v!);
    });
    doc.moveDown(0.5);

    // ─── Quorum ───────────────────────────────────────────────────────────────
    const quorumPct = ag.nbMembresConvoques && ag.nbMembresConvoques > 0
      ? Math.round((ag.nbMembresPresents / ag.nbMembresConvoques) * 100) : 0;
    const quorumColor = ag.quorumAtteint ? "#16a34a" : "#dc2626";
    doc.fontSize(10).font("Helvetica-Bold").fillColor(VERT).text("CONSTAT DE QUORUM", MARGIN, doc.y);
    doc.fontSize(9).font("Helvetica").fillColor("black");
    doc.text(`Membres convoqués : ${ag.nbMembresConvoques ?? 0}   |   Présents : ${ag.nbMembresPresents}   |   Taux : ${quorumPct}%`);
    doc.fontSize(9).fillColor(quorumColor).font("Helvetica-Bold")
      .text(ag.quorumAtteint ? `✓ Quorum atteint (requis : ${parseFloat(ag.quorumRequisPct)}%)` : `✗ Quorum non atteint (requis : ${parseFloat(ag.quorumRequisPct)}%)`);
    doc.fillColor("black").moveDown(0.8);

    // ─── Ordre du jour ────────────────────────────────────────────────────────
    doc.fontSize(10).font("Helvetica-Bold").fillColor(VERT).text("ORDRE DU JOUR");
    doc.fontSize(9).font("Helvetica").fillColor("black").moveDown(0.2);
    points.forEach((pt) => {
      const resultVote = votes.find((v) => v.pointId === pt.id);
      const marker = resultVote ? (resultVote.resultat === "adopte" ? "✓" : "✗") : "•";
      doc.text(`${pt.numero}. ${marker} ${pt.intitule}`, MARGIN + 10, doc.y);
    });
    doc.moveDown(0.8);

    // ─── Délibérations & votes ────────────────────────────────────────────────
    const votePoints = points.filter((pt) => votes.find((v) => v.pointId === pt.id));
    if (votePoints.length > 0) {
      doc.fontSize(10).font("Helvetica-Bold").fillColor(VERT).text("RÉSOLUTIONS");
      doc.moveDown(0.3);
      let resNum = 1;
      votePoints.forEach((pt) => {
        const v = votes.find((x) => x.pointId === pt.id)!;
        const adopte = v.resultat === "adopte";
        doc.fontSize(9).font("Helvetica-Bold").fillColor(adopte ? "#16a34a" : "#dc2626")
          .text(`Résolution n°${resNum++} — ${v.intituleResolution}`);
        doc.fontSize(8).font("Helvetica").fillColor("black")
          .text(`Pour : ${v.nbPour}   Contre : ${v.nbContre}   Abstentions : ${v.nbAbstention}   Votants : ${v.nbVotants}   Résultat : ${adopte ? "ADOPTÉ" : "REJETÉ"} à ${Math.round(parseFloat(v.pourcentagePour ?? "0"))}%`);
        if (pt.decision) doc.fontSize(8).font("Helvetica-Oblique").text(`Décision : ${pt.decision}`);
        doc.moveDown(0.4);
      });
    }

    // ─── Émargement (50 premiers) ─────────────────────────────────────────────
    doc.addPage();
    enTeteDoc(doc, "Feuille d'émargement");
    doc.fontSize(10).font("Helvetica-Bold").fillColor(VERT).text("LISTE DES PRÉSENTS");
    doc.moveDown(0.4);

    const W = [30, 200, 100, 100, 100];
    ligneTableau(doc, ["#","Nom et prénoms","Mode","Heure arrivée","Émargement"], W, MARGIN, doc.y, VERT);
    let y = doc.y + 16;
    presences.slice(0, 80).forEach((row, i) => {
      const bg = i % 2 === 0 ? "#f9fafb" : "white";
      doc.rect(MARGIN, y, W.reduce((a, b) => a + b, 0), 16).fill(bg);
      const nom = [row.m.prenoms, row.m.nom].filter(Boolean).join(" ");
      const heure = row.p.heureArrivee ? new Date(row.p.heureArrivee).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
      ligneTableau(doc, [String(i+1), nom, row.p.modePresence, heure, ""], W, MARGIN, y);
      y += 16;
      if (y > 750) { doc.addPage(); enTeteDoc(doc, "Feuille d'émargement (suite)"); y = doc.y + 10; }
    });

    // ─── Signatures ───────────────────────────────────────────────────────────
    doc.moveDown(3);
    const sigY = Math.min(doc.y + 20, 730);
    doc.fontSize(9).font("Helvetica-Bold").text("Président de séance", MARGIN, sigY, { width: 200, align: "center" });
    doc.text("Secrétaire de séance", PAGE_W - MARGIN - 200, sigY, { width: 200, align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(8).font("Helvetica").fillColor(GRIS)
      .text("Signature :", MARGIN, doc.y, { width: 200, align: "center" });
    doc.text("Signature :", PAGE_W - MARGIN - 200, doc.y - doc.currentLineHeight(), { width: 200, align: "center" });

    piedPage(doc);
    doc.end();
  });
}

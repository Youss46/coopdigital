/**
 * Service de génération PDF OHADA — pdfkit
 * Utilise pdfHeaderService pour l'en-tête/pied-de-page dynamique.
 */
import PDFDocument from "pdfkit";
import {
  db,
  membresTable,
  livraisonsTable,
  avancesTable,
  ventesExportateursTable,
  exportateursTable,
  ecrituresComptablesTable,
  planComptableTable,
  paiementsTable,
  bulletinsPaieTable,
  lignesBulletinTable,
  personnelTable,
  distributionsIntrantsTable,
  intrantsTable,
  liberationsPartsTable,
  configPartsSocialesTable,
} from "@workspace/db";
import { eq, desc, gte, lte, and, sql, inArray } from "drizzle-orm";
import { drawHeader, drawFooter } from "./pdfHeaderService";
import { computeCodeMembre } from "./portailService";

const VERT = "#1a4731";
const OR   = "#c4962a";
const GRIS = "#6b7280";
const PAGE_W = 595.28;
const MARGIN  = 50;
const COL1    = MARGIN;
const COL2    = PAGE_W / 2;

function formaterFCFA(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}
function formaterDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
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

/** Helper : ajoute les pieds de page sur toutes les pages bufferisées */
async function addFooters(doc: InstanceType<typeof PDFDocument>, cooperativeId: number): Promise<void> {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    await drawFooter(doc, cooperativeId, i + 1, range.count);
  }
}

/** Helper : crée un PDFDocument avec collecte en Buffer */
function makePdfDoc(opts: PDFKit.PDFDocumentOptions = {}): {
  doc: InstanceType<typeof PDFDocument>;
  endPromise: Promise<Buffer>;
} {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, ...opts });
  const chunks: Buffer[] = [];
  const endPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  return { doc, endPromise };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Fiche membre
// ─────────────────────────────────────────────────────────────────────────────
export async function generateFicheMembre(membreId: number, cooperativeId: number): Promise<Buffer> {
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

  const { doc, endPromise } = makePdfDoc();

  await drawHeader(doc, cooperativeId, {
    titre_document: "Fiche Membre",
    reference: `MBR-${String(membre.id).padStart(4, "0")}`,
  });

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

  for (const [idx, l] of livraisons.entries()) {
    if (y > 730) {
      doc.addPage();
      await drawHeader(doc, cooperativeId, { titre_document: "Fiche Membre (suite)" });
      y = doc.y;
    }
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
  }

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

  for (const [idx, a] of avances.entries()) {
    if (y > 730) {
      doc.addPage();
      await drawHeader(doc, cooperativeId, { titre_document: "Fiche Membre (suite)" });
      y = doc.y;
    }
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
  }

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
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

  const tonnage    = livraisons.reduce((s, l) => s + parseFloat(l.poidsKg), 0);
  const caProduits = ecritures.filter(e => e.compteCredit === "701").reduce((s, e) => s + e.montantFcfa, 0);
  const coutAchats = ecritures.filter(e => e.compteDebit === "601").reduce((s, e) => s + e.montantFcfa, 0);
  const moisLabel  = new Date(annee, mois - 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const { doc, endPromise } = makePdfDoc();

  // Page 1 – KPIs
  await drawHeader(doc, cooperativeId, { titre_document: `Rapport ${moisLabel}` });

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
  await drawHeader(doc, cooperativeId, { titre_document: "Livraisons du mois" });
  const lCols = [80, 140, 60, 90, 90];
  y = doc.y;
  ligneTableau(doc, ["Date", "Producteur", "Poids (kg)", "Brut FCFA", "Net FCFA"], lCols, MARGIN, y, VERT);
  y += 18;
  for (const [idx, l] of livraisons.entries()) {
    if (y > 730) {
      doc.addPage();
      await drawHeader(doc, cooperativeId, { titre_document: "Livraisons (suite)" });
      y = doc.y;
    }
    if (idx % 2 === 0) doc.rect(MARGIN, y, lCols.reduce((a, b) => a + b, 0), 16).fill("#f0fdf4");
    ligneTableau(doc, [formaterDate(l.dateLivraison), `${l.membreNom} ${l.membrePrenoms}`, parseFloat(l.poidsKg).toFixed(0), formaterFCFA(l.montantBrutFcfa), formaterFCFA(l.montantNetFcfa)], lCols, MARGIN, y);
    y += 16;
  }

  // Page 3 – Ventes
  doc.addPage();
  await drawHeader(doc, cooperativeId, { titre_document: "Ventes exportateurs" });
  const vCols = [80, 140, 100, 80, 70];
  y = doc.y;
  ligneTableau(doc, ["Date", "Exportateur", "Montant total", "Solde dû", "Statut"], vCols, MARGIN, y, OR);
  y += 18;
  for (const [idx, v] of ventes.entries()) {
    if (y > 730) {
      doc.addPage();
      await drawHeader(doc, cooperativeId, { titre_document: "Ventes (suite)" });
      y = doc.y;
    }
    if (idx % 2 === 0) doc.rect(MARGIN, y, vCols.reduce((a, b) => a + b, 0), 16).fill("#fffbeb");
    ligneTableau(doc, [formaterDate(v.dateVente), v.exportateurNom ?? "—", formaterFCFA(v.montantTotalFcfa), formaterFCFA(v.soldeDuFcfa), v.statut], vCols, MARGIN, y);
    y += 16;
  }

  // Page 4 – Compte de résultat simplifié
  doc.addPage();
  await drawHeader(doc, cooperativeId, { titre_document: "Compte de résultat" });
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
  await drawHeader(doc, cooperativeId, { titre_document: "Avances en retard" });
  const aCols = [160, 100, 100, 100];
  y = doc.y;
  ligneTableau(doc, ["Membre", "Montant octroyé", "Solde dû", "Échéance"], aCols, MARGIN, y, "#ef4444");
  y += 18;
  for (const [idx, a] of avancesRetard.entries()) {
    if (y > 730) {
      doc.addPage();
      await drawHeader(doc, cooperativeId, { titre_document: "Avances en retard (suite)" });
      y = doc.y;
    }
    if (idx % 2 === 0) doc.rect(MARGIN, y, aCols.reduce((a, b) => a + b, 0), 16).fill("#fff1f2");
    ligneTableau(doc, [`${a.membreNom} ${a.membrePrenoms}`, formaterFCFA(a.montantOctroyeFcfa), formaterFCFA(a.soldeRestantFcfa), a.dateEcheance ? formaterDate(a.dateEcheance) : "—"], aCols, MARGIN, y);
    y += 16;
  }

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
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
  const ca701      = ecritures.filter(e => e.compteCredit === "701").reduce((s, e) => s + e.montantFcfa, 0);
  const couts601   = ecritures.filter(e => e.compteDebit === "601").reduce((s, e) => s + e.montantFcfa, 0);
  const charges    = ecritures.filter(e => ["621","641","661"].includes(e.compteDebit)).reduce((s, e) => s + e.montantFcfa, 0);
  const resultatNet = ca701 - couts601 - charges;
  const soldeBanque = ecritures.filter(e => e.compteDebit === "521").reduce((s, e) => s + e.montantFcfa, 0)
    - ecritures.filter(e => e.compteCredit === "521").reduce((s, e) => s + e.montantFcfa, 0);

  // Ventilation mensuelle
  const parMois: Record<number, { ca: number; achats: number }> = {};
  for (let m = 1; m <= 12; m++) parMois[m] = { ca: 0, achats: 0 };
  ecritures.forEach(e => {
    const m = new Date(e.dateEcriture).getMonth() + 1;
    if (e.compteCredit === "701") parMois[m]!.ca += e.montantFcfa;
    if (e.compteDebit === "601") parMois[m]!.achats += e.montantFcfa;
  });

  // Suppress unused variable warning
  void planComptes;

  const { doc, endPromise } = makePdfDoc();

  // Page 1 – Résumé exécutif
  await drawHeader(doc, cooperativeId, { titre_document: `Bilan ${annee}` });
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
  await drawHeader(doc, cooperativeId, { titre_document: "Évolution mensuelle" });
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
  await drawHeader(doc, cooperativeId, { titre_document: "Top 10 producteurs" });
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
  await drawHeader(doc, cooperativeId, { titre_document: "Top 5 exportateurs" });
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

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
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
  cooperativeId: number;
}): Promise<Buffer> {
  const { ag, points, presences, votes, cooperativeId } = params;
  const typeFr: Record<string, string> = {
    ordinaire: "Ordinaire", extraordinaire: "Extraordinaire", constitutive: "Constitutive",
  };

  const { doc, endPromise } = makePdfDoc();

  // ─── En-tête ─────────────────────────────────────────────────────────────
  const titreAg = `PV AG ${typeFr[ag.type] ?? ag.type} ${new Date(ag.dateAg).getFullYear()}`;
  await drawHeader(doc, cooperativeId, {
    titre_document: titreAg,
    reference: `AG-${ag.id}`,
  });

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
  await drawHeader(doc, cooperativeId, { titre_document: "Feuille d'émargement" });
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
    if (y > 750) {
      doc.addPage();
      // inline mini header for continuation (no await here due to sync context)
      y = MARGIN;
    }
  });

  // ─── Signatures ───────────────────────────────────────────────────────────
  doc.moveDown(3);
  const sigY = Math.min(doc.y + 20, 730);
  doc.fontSize(9).font("Helvetica-Bold").text("Président de séance", MARGIN, sigY, { width: 200, align: "center" });
  doc.text("Secrétaire de séance", PAGE_W - MARGIN - 200, sigY, { width: 200, align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(8).font("Helvetica").fillColor(GRIS)
    .text("(Signature et cachet)", MARGIN, doc.y + 20, { width: 200, align: "center" });
  doc.text("(Signature)", PAGE_W - MARGIN - 200, doc.y, { width: 200, align: "center" });

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Reçu de livraison
// ─────────────────────────────────────────────────────────────────────────────
export async function generateRecuLivraison(livraisonId: number, cooperativeId: number): Promise<Buffer> {
  const [row] = await db.select({
    id: livraisonsTable.id,
    codeAchat: livraisonsTable.codeAchat,
    dateLivraison: livraisonsTable.dateLivraison,
    produit: livraisonsTable.produit,
    nombreSacs: livraisonsTable.nombreSacs,
    produitBrutKg: livraisonsTable.produitBrutKg,
    retenueKg: livraisonsTable.retenueKg,
    poidsKg: livraisonsTable.poidsKg,
    prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
    montantBrutFcfa: livraisonsTable.montantBrutFcfa,
    avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
    intrantsDeduitsFcfa: livraisonsTable.intrantsDeduitsFcfa,
    montantNetFcfa: livraisonsTable.montantNetFcfa,
    statutPaiement: livraisonsTable.statutPaiement,
    sectionLivraison: livraisonsTable.sectionLivraison,
    membreNom: membresTable.nom,
    membrePrenoms: membresTable.prenoms,
    membreCni: membresTable.numeroCni,
    membreGroupement: membresTable.groupement,
    membreTel: membresTable.telephone,
  }).from(livraisonsTable)
    .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
    .where(eq(livraisonsTable.id, livraisonId));
  if (!row) throw new Error("Livraison introuvable");

  const { doc, endPromise } = makePdfDoc();
  const ref = row.codeAchat ?? `LIV-${String(row.id).padStart(5, "0")}`;
  await drawHeader(doc, cooperativeId, { titre_document: "Reçu de Livraison", reference: ref });

  let y = doc.y;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 52).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("PRODUCTEUR", MARGIN + 8, y + 5);
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(`${row.membrePrenoms ?? ""} ${row.membreNom ?? "—"}`, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`CNI : ${row.membreCni ?? "—"}   |   Groupement : ${row.membreGroupement ?? "—"}   |   Tél : ${row.membreTel ?? "—"}`, MARGIN + 8, y + 30);
  if (row.sectionLivraison) doc.text(`Section : ${row.sectionLivraison}`, MARGIN + 8, y + 40);
  y += 60;

  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("DÉTAILS DE LA LIVRAISON", MARGIN, y);
  y += 14;
  const recuLivDetails: Array<[string, string]> = [
    ["Date de livraison",  formaterDate(row.dateLivraison)],
    ["Produit",            row.produit ?? "Cacao"],
    ["Nombre de sacs",     row.nombreSacs ? String(row.nombreSacs) : "—"],
    ["Poids brut",         row.produitBrutKg ? `${parseFloat(row.produitBrutKg).toFixed(2)} kg` : `${parseFloat(row.poidsKg).toFixed(2)} kg`],
    ["Retenue",            row.retenueKg ? `${parseFloat(row.retenueKg).toFixed(2)} kg` : "0 kg"],
    ["Poids net retenu",   `${parseFloat(row.poidsKg).toFixed(2)} kg`],
    ["Prix unitaire",      `${formaterFCFA(row.prixUnitaireFcfa)} / kg`],
  ];
  for (const [i, [label, val]] of recuLivDetails.entries()) {
    if (i % 2 === 0) doc.rect(MARGIN, y, 370, 16).fill("#f9fafb");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(label, MARGIN + 6, y + 4, { width: 160, lineBreak: false });
    doc.fontSize(9).fillColor("black").font("Helvetica-Bold").text(val, MARGIN + 170, y + 4, { width: 190, lineBreak: false });
    y += 16;
  }
  y += 8;
  const recuLivTotaux: Array<[string, string, string]> = [
    ["Montant brut",      formaterFCFA(row.montantBrutFcfa),             "#f9fafb"],
    ["Avance déduite",   `- ${formaterFCFA(row.avanceDeduiteFcfa)}`,     "#fffbeb"],
    ["Intrants déduits", `- ${formaterFCFA(row.intrantsDeduitsFcfa)}`,   "#fff7ed"],
  ];
  for (const [label, val, bg] of recuLivTotaux) {
    doc.rect(MARGIN, y, 370, 18).fill(bg);
    doc.fontSize(9).fillColor("black").font("Helvetica").text(label, MARGIN + 8, y + 5, { width: 250, lineBreak: false });
    doc.font("Helvetica-Bold").text(val, MARGIN + 265, y + 5, { width: 100, align: "right", lineBreak: false });
    y += 18;
  }
  doc.rect(MARGIN, y, 370, 26).fill(VERT);
  doc.fontSize(11).fillColor("white").font("Helvetica-Bold")
    .text("MONTANT NET", MARGIN + 8, y + 8, { width: 200, lineBreak: false });
  doc.text(formaterFCFA(row.montantNetFcfa), MARGIN + 218, y + 8, { width: 145, align: "right", lineBreak: false });
  y += 34;
  const livStatutColor = (row.statutPaiement ?? "").toUpperCase().includes("PAY") ? "#16a34a" : "#f59e0b";
  doc.fontSize(9).font("Helvetica-Bold").fillColor(livStatutColor)
    .text(`Statut : ${row.statutPaiement ?? "À payer"}`, MARGIN, y);

  y = 700;
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text("Agent réceptionnaire", MARGIN, y, { width: 150, align: "center" });
  doc.text("Producteur / Mandataire", PAGE_W - MARGIN - 170, y, { width: 160, align: "center" });
  doc.rect(MARGIN, y + 12, 150, 38).stroke("#d1d5db");
  doc.rect(PAGE_W - MARGIN - 170, y + 12, 160, 38).stroke("#d1d5db");

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Reçu de paiement
// ─────────────────────────────────────────────────────────────────────────────
export async function generateRecuPaiement(paiementId: number, cooperativeId: number): Promise<Buffer> {
  const [row] = await db.select({
    id: paiementsTable.id,
    numeroRecu: paiementsTable.numeroRecu,
    montantFcfa: paiementsTable.montantFcfa,
    montantAPayerFcfa: paiementsTable.montantAPayerFcfa,
    montantVerseFcfa: paiementsTable.montantVerseFcfa,
    resteAPayerFcfa: paiementsTable.resteAPayerFcfa,
    modePaiement: paiementsTable.modePaiement,
    modeReglement: paiementsTable.modeReglement,
    referenceTransaction: paiementsTable.referenceTransaction,
    statut: paiementsTable.statut,
    createdAt: paiementsTable.createdAt,
    libelle: paiementsTable.libelle,
    livraisonId: paiementsTable.livraisonId,
    membreNom: membresTable.nom,
    membrePrenoms: membresTable.prenoms,
    membreCni: membresTable.numeroCni,
    membreTel: membresTable.telephone,
    livraisonDate: livraisonsTable.dateLivraison,
    livraisonRef: livraisonsTable.codeAchat,
  }).from(paiementsTable)
    .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
    .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
    .where(eq(paiementsTable.id, paiementId));
  if (!row) throw new Error("Paiement introuvable");

  const { doc, endPromise } = makePdfDoc();
  const ref = row.numeroRecu ?? `PAY-${String(row.id).padStart(5, "0")}`;
  await drawHeader(doc, cooperativeId, { titre_document: "Reçu de Paiement", reference: ref });

  let y = doc.y;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 52).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("BÉNÉFICIAIRE", MARGIN + 8, y + 5);
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(`${row.membrePrenoms ?? ""} ${row.membreNom ?? "—"}`, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`CNI : ${row.membreCni ?? "—"}   |   Tél : ${row.membreTel ?? "—"}`, MARGIN + 8, y + 30);
  y += 60;

  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("DÉTAILS DU PAIEMENT", MARGIN, y);
  y += 14;
  const payModeLabel: Record<string, string> = {
    orange_money: "Orange Money", mtn_momo: "MTN MoMo", especes: "Espèces",
  };
  const payDetails: Array<[string, string]> = [
    ["Date",                 formaterDate(row.createdAt)],
    ["Mode de paiement",     payModeLabel[row.modeReglement ?? row.modePaiement] ?? row.modePaiement],
    ["Référence transaction",row.referenceTransaction ?? "—"],
    ["Libellé",              row.libelle ?? "Paiement livraison cacao"],
    ["Livraison associée",   row.livraisonRef ?? (row.livraisonId ? `LIV-${String(row.livraisonId).padStart(5,"0")}` : "—")],
    ["Date livraison",       row.livraisonDate ? formaterDate(row.livraisonDate) : "—"],
  ];
  for (const [i, [label, val]] of payDetails.entries()) {
    if (i % 2 === 0) doc.rect(MARGIN, y, 370, 16).fill("#f9fafb");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(label, MARGIN + 6, y + 4, { width: 160, lineBreak: false });
    doc.fontSize(9).fillColor("black").font("Helvetica-Bold").text(val, MARGIN + 170, y + 4, { width: 190, lineBreak: false });
    y += 16;
  }
  y += 10;
  if (row.montantAPayerFcfa) {
    const payMontants: Array<[string, string, string]> = [
      ["Montant dû",    formaterFCFA(parseFloat(row.montantAPayerFcfa)),    "#f9fafb"],
      ["Montant versé", formaterFCFA(parseFloat(row.montantVerseFcfa ?? "0")), "#f0fdf4"],
      ["Reste à payer", formaterFCFA(parseFloat(row.resteAPayerFcfa ?? "0")), "#fff7ed"],
    ];
    for (const [label, val, bg] of payMontants) {
      doc.rect(MARGIN, y, 370, 18).fill(bg);
      doc.fontSize(9).fillColor("black").font("Helvetica").text(label, MARGIN + 8, y + 5, { width: 250, lineBreak: false });
      doc.font("Helvetica-Bold").text(val, MARGIN + 265, y + 5, { width: 100, align: "right", lineBreak: false });
      y += 18;
    }
  }
  doc.rect(MARGIN, y, 370, 26).fill(VERT);
  doc.fontSize(11).fillColor("white").font("Helvetica-Bold")
    .text("MONTANT PAYÉ", MARGIN + 8, y + 8, { width: 200, lineBreak: false });
  doc.text(formaterFCFA(row.montantFcfa), MARGIN + 218, y + 8, { width: 145, align: "right", lineBreak: false });
  y += 34;
  const payStatutColor: Record<string, string> = { effectue: "#16a34a", confirme: "#16a34a", en_attente: "#f59e0b", echec: "#ef4444", rejete: "#ef4444" };
  doc.fontSize(9).font("Helvetica-Bold").fillColor(payStatutColor[row.statut] ?? GRIS)
    .text(`Statut : ${row.statut.replace(/_/g, " ").toUpperCase()}`, MARGIN, y);

  y = 700;
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text("Caissier / Agent payeur", MARGIN, y, { width: 150, align: "center" });
  doc.text("Bénéficiaire", PAGE_W - MARGIN - 170, y, { width: 160, align: "center" });
  doc.rect(MARGIN, y + 12, 150, 38).stroke("#d1d5db");
  doc.rect(PAGE_W - MARGIN - 170, y + 12, 160, 38).stroke("#d1d5db");

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Bulletin de paie
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBulletinPaie(bulletinId: number, cooperativeId: number): Promise<Buffer> {
  const [bulletin] = await db.select().from(bulletinsPaieTable)
    .where(and(eq(bulletinsPaieTable.id, bulletinId), eq(bulletinsPaieTable.cooperativeId, cooperativeId)));
  if (!bulletin) throw new Error("Bulletin introuvable");

  const [agent] = await db.select().from(personnelTable).where(eq(personnelTable.id, bulletin.personnelId));
  const lignes = await db.select().from(lignesBulletinTable).where(eq(lignesBulletinTable.bulletinId, bulletinId));
  const avantages = lignes.filter(l => l.type === "avantage");
  const retenues  = lignes.filter(l => l.type === "retenue");

  const { doc, endPromise } = makePdfDoc();
  const ref = `BP-${bulletin.annee}-${String(bulletin.mois).padStart(2,"0")}-${String(bulletin.personnelId).padStart(3,"0")}`;
  await drawHeader(doc, cooperativeId, { titre_document: "Bulletin de Paie", reference: ref });

  let y = doc.y;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 60).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("SALARIÉ", MARGIN + 8, y + 5);
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(`${agent?.prenoms ?? ""} ${agent?.nom ?? "—"}`, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`Poste : ${agent?.poste ?? "—"}   |   Contrat : ${agent?.typeContrat ?? "—"}   |   CNPS : ${agent?.numeroCnps ?? "—"}`, MARGIN + 8, y + 30);
  doc.text(`CNI : ${agent?.numeroCni ?? "—"}   |   Période : ${bulletin.periode}`, MARGIN + 8, y + 42);
  y += 68;

  if (avantages.length > 0) {
    doc.fontSize(9).fillColor(VERT).font("Helvetica-Bold").text("AVANTAGES", MARGIN, y);
    y += 12;
    for (const [i, l] of avantages.entries()) {
      if (i % 2 === 0) doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 15).fill("#f0fdf4");
      doc.fontSize(8).fillColor("black").font("Helvetica").text(l.libelle, MARGIN + 6, y + 3, { width: 320, lineBreak: false });
      doc.font("Helvetica-Bold").text(`+ ${formaterFCFA(l.montantFcfa)}`, MARGIN + 330, y + 3, { width: 150, align: "right", lineBreak: false });
      y += 15;
    }
    y += 4;
  }

  if (retenues.length > 0) {
    doc.fontSize(9).fillColor("#dc2626").font("Helvetica-Bold").text("RETENUES", MARGIN, y);
    y += 12;
    for (const [i, l] of retenues.entries()) {
      if (i % 2 === 0) doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 15).fill("#fff7ed");
      doc.fontSize(8).fillColor("black").font("Helvetica").text(l.libelle, MARGIN + 6, y + 3, { width: 320, lineBreak: false });
      doc.fontSize(8).font("Helvetica-Bold").fillColor("#dc2626")
        .text(`- ${formaterFCFA(l.montantFcfa)}`, MARGIN + 330, y + 3, { width: 150, align: "right", lineBreak: false });
      doc.fillColor("black");
      y += 15;
    }
    y += 4;
  }

  const bpRecap: Array<[string, number, string]> = [
    ["Salaire de base",  bulletin.salaireBaseFcfa,      "#f9fafb"],
    ["Total avantages",  bulletin.totalAvantagesFcfa,   "#f0fdf4"],
    ["Salaire brut",     bulletin.salaireBrutFcfa,      "#e0f2fe"],
    ["Total retenues",   bulletin.totalRetenuesFcfa,    "#fff7ed"],
  ];
  y += 4;
  for (const [label, montant, bg] of bpRecap) {
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 18).fill(bg);
    doc.fontSize(9).fillColor("black").font("Helvetica").text(label, MARGIN + 8, y + 5, { width: 320, lineBreak: false });
    doc.font("Helvetica-Bold").text(formaterFCFA(montant), MARGIN + 330, y + 5, { width: 155, align: "right", lineBreak: false });
    y += 18;
  }
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 26).fill(VERT);
  doc.fontSize(12).fillColor("white").font("Helvetica-Bold")
    .text("SALAIRE NET À PAYER", MARGIN + 8, y + 8, { width: 300, lineBreak: false });
  doc.text(formaterFCFA(bulletin.salaireNetFcfa), MARGIN + 320, y + 8, { width: 165, align: "right", lineBreak: false });
  y += 34;

  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`Coût total employeur : ${formaterFCFA(bulletin.coutTotalEmployeurFcfa)}   |   CNPS patronale : ${formaterFCFA(bulletin.chargesCnpsPatronaleFcfa)}   |   TA : ${formaterFCFA(bulletin.chargesTaxeApprentissageFcfa)}`, MARGIN, y);
  y += 14;
  if (bulletin.referencePaiement) {
    doc.fontSize(8).fillColor(GRIS).text(`Référence paiement : ${bulletin.referencePaiement}`, MARGIN, y);
    y += 12;
  }
  const bStatutColor: Record<string, string> = { paye: "#16a34a", valide: "#2563eb", brouillon: "#f59e0b" };
  doc.fontSize(9).font("Helvetica-Bold").fillColor(bStatutColor[bulletin.statut] ?? GRIS)
    .text(`Statut : ${bulletin.statut.toUpperCase()}`, MARGIN, y);

  y = 700;
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text("Directeur / Gérant", MARGIN, y, { width: 150, align: "center" });
  doc.text("Salarié (signature)", PAGE_W - MARGIN - 170, y, { width: 160, align: "center" });
  doc.rect(MARGIN, y + 12, 150, 38).stroke("#d1d5db");
  doc.rect(PAGE_W - MARGIN - 170, y + 12, 160, 38).stroke("#d1d5db");

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Bordereau de pesée
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBordereauPesee(livraisonId: number, cooperativeId: number): Promise<Buffer> {
  const [row] = await db.select({
    id: livraisonsTable.id,
    codeAchat: livraisonsTable.codeAchat,
    dateLivraison: livraisonsTable.dateLivraison,
    produit: livraisonsTable.produit,
    nombreSacs: livraisonsTable.nombreSacs,
    poidsBrut1: livraisonsTable.poidsBrut1erePeseeKg,
    poidsBrut2: livraisonsTable.poidsBrut2emePeseeKg,
    ecartKg: livraisonsTable.ecartPeseeKg,
    ecartPct: livraisonsTable.ecartPeseePct,
    poidsRetenu: livraisonsTable.poidsRetenuKg,
    poidsKg: livraisonsTable.poidsKg,
    doublePeseeRequise: livraisonsTable.doublePeseeRequise,
    doublePeseeEffectuee: livraisonsTable.doublePeseeEffectuee,
    litigePesee: livraisonsTable.litigePesee,
    prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
    montantBrutFcfa: livraisonsTable.montantBrutFcfa,
    membreNom: membresTable.nom,
    membrePrenoms: membresTable.prenoms,
    membreGroupement: membresTable.groupement,
  }).from(livraisonsTable)
    .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
    .where(eq(livraisonsTable.id, livraisonId));
  if (!row) throw new Error("Livraison introuvable");

  const { doc, endPromise } = makePdfDoc();
  const ref = row.codeAchat ?? `PES-${String(row.id).padStart(5,"0")}`;
  await drawHeader(doc, cooperativeId, { titre_document: "Bordereau de Pesée", reference: ref });

  let y = doc.y;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 44).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("PRODUCTEUR", MARGIN + 8, y + 5);
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(`${row.membrePrenoms ?? ""} ${row.membreNom ?? "—"}`, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`Groupement : ${row.membreGroupement ?? "—"}   |   Produit : ${row.produit ?? "Cacao"}   |   Sacs : ${row.nombreSacs ?? "—"}`, MARGIN + 8, y + 30);
  y += 52;

  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("RÉSULTATS DE PESÉE", MARGIN, y);
  y += 14;

  const pW = [180, 120, 120, 75];
  ligneTableau(doc, ["Mesure", "1ère pesée", "2ème pesée", "Retenu"], pW, MARGIN, y, VERT);
  y += 18;
  const p1 = row.poidsBrut1 ? `${parseFloat(row.poidsBrut1).toFixed(3)} kg` : "—";
  const p2 = row.poidsBrut2 ? `${parseFloat(row.poidsBrut2).toFixed(3)} kg` : "—";
  const pr = row.poidsRetenu ? `${parseFloat(row.poidsRetenu).toFixed(3)} kg` : `${parseFloat(row.poidsKg).toFixed(2)} kg`;
  doc.rect(MARGIN, y, pW.reduce((a,b)=>a+b,0), 18).fill("#f0fdf4");
  ligneTableau(doc, ["Poids brut (kg)", p1, p2, pr], pW, MARGIN, y);
  y += 24;

  if (row.ecartKg || row.ecartPct) {
    const litigeCl = row.litigePesee ? "#ef4444" : "#16a34a";
    doc.rect(MARGIN, y, 370, 22).fill(row.litigePesee ? "#fff1f2" : "#f0fdf4");
    doc.fontSize(9).fillColor("black").font("Helvetica")
      .text(`Écart : ${row.ecartKg ? parseFloat(row.ecartKg).toFixed(3) : "—"} kg (${row.ecartPct ? parseFloat(row.ecartPct).toFixed(3) : "—"} %)`, MARGIN + 8, y + 7);
    doc.font("Helvetica-Bold").fillColor(litigeCl)
      .text(row.litigePesee ? "⚠ LITIGE PESÉE" : "✓ Conforme", MARGIN + 270, y + 7, { width: 100 });
    y += 30;
  }

  y += 6;
  doc.rect(MARGIN, y, 370, 26).fill(VERT);
  doc.fontSize(11).fillColor("white").font("Helvetica-Bold")
    .text("MONTANT BRUT", MARGIN + 8, y + 8, { width: 200, lineBreak: false });
  doc.text(formaterFCFA(row.montantBrutFcfa), MARGIN + 218, y + 8, { width: 145, align: "right", lineBreak: false });
  y += 34;
  doc.fontSize(9).fillColor(GRIS).font("Helvetica")
    .text(`Prix unitaire : ${formaterFCFA(row.prixUnitaireFcfa)} / kg   |   Double pesée requise : ${row.doublePeseeRequise ? "Oui" : "Non"}`, MARGIN, y);

  y = 680;
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text("Peseur (signature)", MARGIN, y, { width: 150, align: "center" });
  doc.text("Vérificateur", MARGIN + 175, y, { width: 140, align: "center" });
  doc.text("Producteur", PAGE_W - MARGIN - 150, y, { width: 140, align: "center" });
  doc.rect(MARGIN, y + 12, 150, 38).stroke("#d1d5db");
  doc.rect(MARGIN + 175, y + 12, 140, 38).stroke("#d1d5db");
  doc.rect(PAGE_W - MARGIN - 150, y + 12, 140, 38).stroke("#d1d5db");

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Reçu d'avance
// ─────────────────────────────────────────────────────────────────────────────
export async function generateRecuAvance(avanceId: number, cooperativeId: number): Promise<Buffer> {
  const [row] = await db.select({
    id: avancesTable.id,
    montantOctroyeFcfa: avancesTable.montantOctroyeFcfa,
    montantRembourse: avancesTable.montantRembourse_fcfa,
    soldeRestantFcfa: avancesTable.soldeRestantFcfa,
    dateOctroi: avancesTable.dateOctroi,
    dateEcheance: avancesTable.dateEcheance,
    motif: avancesTable.motif,
    statut: avancesTable.statut,
    membreNom: membresTable.nom,
    membrePrenoms: membresTable.prenoms,
    membreCni: membresTable.numeroCni,
    membreGroupement: membresTable.groupement,
    membreTel: membresTable.telephone,
  }).from(avancesTable)
    .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
    .where(eq(avancesTable.id, avanceId));
  if (!row) throw new Error("Avance introuvable");

  const { doc, endPromise } = makePdfDoc();
  const ref = `AVC-${String(row.id).padStart(5, "0")}`;
  await drawHeader(doc, cooperativeId, { titre_document: "Reçu d'Avance", reference: ref });

  let y = doc.y;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 60).fill("#fffbeb").stroke("#fde68a");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("BÉNÉFICIAIRE", MARGIN + 8, y + 5);
  doc.fontSize(11).fillColor(OR).font("Helvetica-Bold")
    .text(`${row.membrePrenoms ?? ""} ${row.membreNom ?? "—"}`, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`CNI : ${row.membreCni ?? "—"}   |   Groupement : ${row.membreGroupement ?? "—"}   |   Tél : ${row.membreTel ?? "—"}`, MARGIN + 8, y + 30);
  y += 68;

  doc.fontSize(10).fillColor(OR).font("Helvetica-Bold").text("DÉTAILS DE L'AVANCE", MARGIN, y);
  y += 14;
  const avcDetails: Array<[string, string]> = [
    ["Date d'octroi",  formaterDate(row.dateOctroi)],
    ["Motif",          row.motif ?? "—"],
    ["Échéance",       row.dateEcheance ? formaterDate(row.dateEcheance) : "Non définie"],
  ];
  for (const [i, [label, val]] of avcDetails.entries()) {
    if (i % 2 === 0) doc.rect(MARGIN, y, 370, 16).fill("#fffbeb");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(label, MARGIN + 6, y + 4, { width: 160, lineBreak: false });
    doc.fontSize(9).fillColor("black").font("Helvetica-Bold").text(val, MARGIN + 170, y + 4, { width: 190, lineBreak: false });
    y += 16;
  }
  y += 10;
  const avcMontants: Array<[string, string, string]> = [
    ["Montant octroyé",  formaterFCFA(row.montantOctroyeFcfa),  "#fffbeb"],
    ["Déjà remboursé",   formaterFCFA(row.montantRembourse),    "#f0fdf4"],
  ];
  for (const [label, val, bg] of avcMontants) {
    doc.rect(MARGIN, y, 370, 18).fill(bg);
    doc.fontSize(9).fillColor("black").font("Helvetica").text(label, MARGIN + 8, y + 5, { width: 250, lineBreak: false });
    doc.font("Helvetica-Bold").text(val, MARGIN + 265, y + 5, { width: 100, align: "right", lineBreak: false });
    y += 18;
  }
  doc.rect(MARGIN, y, 370, 26).fill(OR);
  doc.fontSize(11).fillColor("white").font("Helvetica-Bold")
    .text("SOLDE RESTANT DÛ", MARGIN + 8, y + 8, { width: 200, lineBreak: false });
  doc.text(formaterFCFA(row.soldeRestantFcfa), MARGIN + 218, y + 8, { width: 145, align: "right", lineBreak: false });
  y += 34;
  const aStatutColor: Record<string, string> = { rembourse: "#16a34a", en_cours: "#f59e0b", en_retard: "#ef4444" };
  doc.fontSize(9).font("Helvetica-Bold").fillColor(aStatutColor[row.statut] ?? GRIS)
    .text(`Statut : ${row.statut.replace(/_/g, " ").toUpperCase()}`, MARGIN, y);

  y += 20;
  doc.fontSize(8).fillColor(GRIS).font("Helvetica-Oblique")
    .text("L'avance sera déduite des prochaines livraisons. Le bénéficiaire s'engage à rembourser la totalité avant l'échéance.", MARGIN, y, { width: PAGE_W - MARGIN * 2 });

  y = 700;
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text("Gérant / Caissier", MARGIN, y, { width: 150, align: "center" });
  doc.text("Bénéficiaire", PAGE_W - MARGIN - 170, y, { width: 160, align: "center" });
  doc.rect(MARGIN, y + 12, 150, 38).stroke("#d1d5db");
  doc.rect(PAGE_W - MARGIN - 170, y + 12, 160, 38).stroke("#d1d5db");

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. Reçu d'intrant
// ─────────────────────────────────────────────────────────────────────────────
export async function generateRecuIntrant(distributionId: number, cooperativeId: number): Promise<Buffer> {
  const [row] = await db.select({
    id: distributionsIntrantsTable.id,
    dateDistribution: distributionsIntrantsTable.dateDistribution,
    quantite: distributionsIntrantsTable.quantite,
    prixUnitaireFcfa: distributionsIntrantsTable.prixUnitaireFcfa,
    montantFcfa: distributionsIntrantsTable.montantFcfa,
    mode: distributionsIntrantsTable.mode,
    tauxSubventionPct: distributionsIntrantsTable.tauxSubventionPct,
    montantMembreFcfa: distributionsIntrantsTable.montantMembreFcfa,
    statutRemboursement: distributionsIntrantsTable.statutRemboursement,
    montantRembourse: distributionsIntrantsTable.montantRembourse_fcfa,
    intrantNom: intrantsTable.nom,
    intrantUnite: intrantsTable.unite,
    membreNom: membresTable.nom,
    membrePrenoms: membresTable.prenoms,
    membreCni: membresTable.numeroCni,
    membreGroupement: membresTable.groupement,
    membreTel: membresTable.telephone,
  }).from(distributionsIntrantsTable)
    .leftJoin(intrantsTable, eq(distributionsIntrantsTable.intrantId, intrantsTable.id))
    .leftJoin(membresTable, eq(distributionsIntrantsTable.membreId, membresTable.id))
    .where(eq(distributionsIntrantsTable.id, distributionId));
  if (!row) throw new Error("Distribution introuvable");

  const { doc, endPromise } = makePdfDoc();
  const ref = `INT-${String(row.id).padStart(5, "0")}`;
  await drawHeader(doc, cooperativeId, { titre_document: "Reçu d'Intrant", reference: ref });

  let y = doc.y;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 52).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("BÉNÉFICIAIRE", MARGIN + 8, y + 5);
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(`${row.membrePrenoms ?? ""} ${row.membreNom ?? "—"}`, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`CNI : ${row.membreCni ?? "—"}   |   Groupement : ${row.membreGroupement ?? "—"}   |   Tél : ${row.membreTel ?? "—"}`, MARGIN + 8, y + 30);
  y += 60;

  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("INTRANT DISTRIBUÉ", MARGIN, y);
  y += 14;
  const intModeLabel: Record<string, string> = { credit: "Crédit", gratuit: "Gratuit", subventionne: "Subventionné" };
  const intDetails: Array<[string, string]> = [
    ["Date",             formaterDate(row.dateDistribution)],
    ["Intrant",          row.intrantNom ?? "—"],
    ["Quantité",         `${parseFloat(row.quantite).toFixed(2)} ${row.intrantUnite ?? ""}`],
    ["Prix unitaire",    formaterFCFA(parseFloat(row.prixUnitaireFcfa))],
    ["Mode",             intModeLabel[row.mode] ?? row.mode],
    ["Taux subvention",  `${parseFloat(row.tauxSubventionPct ?? "0")} %`],
  ];
  for (const [i, [label, val]] of intDetails.entries()) {
    if (i % 2 === 0) doc.rect(MARGIN, y, 370, 16).fill("#f9fafb");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(label, MARGIN + 6, y + 4, { width: 160, lineBreak: false });
    doc.fontSize(9).fillColor("black").font("Helvetica-Bold").text(val, MARGIN + 170, y + 4, { width: 190, lineBreak: false });
    y += 16;
  }
  y += 10;
  const intMontants: Array<[string, string, string]> = [
    ["Valeur totale",      formaterFCFA(parseFloat(row.montantFcfa)),       "#f9fafb"],
    ["À charge du membre", formaterFCFA(parseFloat(row.montantMembreFcfa)), "#fffbeb"],
    ["Déjà remboursé",     formaterFCFA(parseFloat(row.montantRembourse)),  "#f0fdf4"],
  ];
  for (const [label, val, bg] of intMontants) {
    doc.rect(MARGIN, y, 370, 18).fill(bg);
    doc.fontSize(9).fillColor("black").font("Helvetica").text(label, MARGIN + 8, y + 5, { width: 250, lineBreak: false });
    doc.font("Helvetica-Bold").text(val, MARGIN + 265, y + 5, { width: 100, align: "right", lineBreak: false });
    y += 18;
  }
  doc.rect(MARGIN, y, 370, 26).fill(VERT);
  const soldeInt = Math.max(0, parseFloat(row.montantMembreFcfa) - parseFloat(row.montantRembourse));
  doc.fontSize(11).fillColor("white").font("Helvetica-Bold")
    .text("SOLDE À REMBOURSER", MARGIN + 8, y + 8, { width: 200, lineBreak: false });
  doc.text(formaterFCFA(soldeInt), MARGIN + 218, y + 8, { width: 145, align: "right", lineBreak: false });
  y += 34;
  const iStatutColor: Record<string, string> = { rembourse: "#16a34a", partiel: "#f59e0b", non_rembourse: "#ef4444" };
  doc.fontSize(9).font("Helvetica-Bold").fillColor(iStatutColor[row.statutRemboursement] ?? GRIS)
    .text(`Statut remboursement : ${row.statutRemboursement.replace(/_/g," ").toUpperCase()}`, MARGIN, y);

  y = 700;
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text("Agent distributeur", MARGIN, y, { width: 150, align: "center" });
  doc.text("Bénéficiaire", PAGE_W - MARGIN - 170, y, { width: 160, align: "center" });
  doc.rect(MARGIN, y + 12, 150, 38).stroke("#d1d5db");
  doc.rect(PAGE_W - MARGIN - 170, y + 12, 160, 38).stroke("#d1d5db");

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. État des parts sociales
// ─────────────────────────────────────────────────────────────────────────────
export async function generateEtatPartsSociales(membreId: number, cooperativeId: number): Promise<Buffer> {
  const [membre] = await db.select().from(membresTable).where(eq(membresTable.id, membreId));
  if (!membre) throw new Error("Membre introuvable");

  const [config] = await db.select().from(configPartsSocialesTable)
    .where(eq(configPartsSocialesTable.cooperativeId, cooperativeId));
  const versements = await db.select().from(liberationsPartsTable)
    .where(and(eq(liberationsPartsTable.membreId, membreId), eq(liberationsPartsTable.cooperativeId, cooperativeId)))
    .orderBy(desc(liberationsPartsTable.dateVersement));

  const valeurNominale   = config?.valeurNominaleFcfa ?? 5000;
  const nbrePartsMin     = config?.nbrePartsMin ?? 1;
  const totalLibereFcfa  = versements.reduce((s, v) => s + v.montantFcfa, 0);
  const nbrePartsTotales = Math.floor(totalLibereFcfa / valeurNominale);
  const montantMinFcfa   = nbrePartsMin * valeurNominale;
  const restantFcfa      = Math.max(0, montantMinFcfa - totalLibereFcfa);
  const pctLibere        = montantMinFcfa > 0 ? Math.min(100, Math.round((totalLibereFcfa / montantMinFcfa) * 100)) : 100;

  const { doc, endPromise } = makePdfDoc();
  const ref = `PS-${String(membre.id).padStart(4, "0")}`;
  await drawHeader(doc, cooperativeId, { titre_document: "État des Parts Sociales", reference: ref });

  let y = doc.y;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 52).fill("#fffbeb").stroke("#fde68a");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("SOCIÉTAIRE", MARGIN + 8, y + 5);
  doc.fontSize(11).fillColor(OR).font("Helvetica-Bold")
    .text(`${membre.prenoms} ${membre.nom}`, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`CNI : ${membre.numeroCni ?? "—"}   |   Tél : ${membre.telephone ?? "—"}   |   Membre depuis : ${formaterDate(membre.createdAt)}`, MARGIN + 8, y + 30);
  y += 60;

  doc.fontSize(10).fillColor(OR).font("Helvetica-Bold").text("RÉCAPITULATIF DES PARTS", MARGIN, y);
  y += 14;
  const psRecap: Array<[string, string, string]> = [
    ["Valeur nominale d'une part",  formaterFCFA(valeurNominale),    "#f9fafb"],
    ["Nombre de parts minimum",     String(nbrePartsMin),            "#f9fafb"],
    ["Souscription minimale",       formaterFCFA(montantMinFcfa),    "#fffbeb"],
    ["Total libéré",                formaterFCFA(totalLibereFcfa),   "#f0fdf4"],
    ["Nombre de parts détenues",    String(nbrePartsTotales),        "#f0fdf4"],
    ["Restant à libérer",           formaterFCFA(restantFcfa),       "#fff7ed"],
  ];
  for (const [label, val, bg] of psRecap) {
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 18).fill(bg);
    doc.fontSize(9).fillColor("black").font("Helvetica").text(label, MARGIN + 8, y + 5, { width: 320, lineBreak: false });
    doc.font("Helvetica-Bold").text(val, MARGIN + 330, y + 5, { width: 155, align: "right", lineBreak: false });
    y += 18;
  }
  y += 8;
  // Barre de progression
  const barW = PAGE_W - MARGIN * 2;
  doc.rect(MARGIN, y, barW, 14).fill("#e5e7eb");
  doc.rect(MARGIN, y, Math.max(4, (barW * pctLibere) / 100), 14).fill(pctLibere >= 100 ? VERT : OR);
  doc.fontSize(8).fillColor("white").font("Helvetica-Bold").text(`${pctLibere} %`, MARGIN + 6, y + 3, { lineBreak: false });
  y += 22;

  // Historique
  doc.fontSize(10).fillColor(OR).font("Helvetica-Bold").text("HISTORIQUE DES VERSEMENTS", MARGIN, y);
  y += 12;
  if (versements.length === 0) {
    doc.fontSize(9).fillColor(GRIS).font("Helvetica").text("Aucun versement enregistré.", MARGIN, y);
  } else {
    const vCols = [80, 110, 100, 110, 95];
    ligneTableau(doc, ["Date", "Code", "Versement", "Montant", "Nbre parts"], vCols, MARGIN, y, OR);
    y += 18;
    for (const [i, v] of versements.entries()) {
      if (y > 730) {
        doc.addPage();
        await drawHeader(doc, cooperativeId, { titre_document: "Parts sociales (suite)" });
        y = doc.y;
      }
      if (i % 2 === 0) doc.rect(MARGIN, y, vCols.reduce((a,b)=>a+b,0), 15).fill("#fffbeb");
      ligneTableau(doc, [
        formaterDate(v.dateVersement),
        v.codeLiberation ?? "—",
        v.versement ?? "—",
        formaterFCFA(v.montantFcfa),
        String(Math.floor(v.montantFcfa / valeurNominale)),
      ], vCols, MARGIN, y);
      y += 15;
    }
    y += 6;
    doc.rect(MARGIN, y, vCols.reduce((a,b)=>a+b,0), 22).fill(VERT);
    doc.fontSize(10).fillColor("white").font("Helvetica-Bold")
      .text("TOTAL LIBÉRÉ", MARGIN + 8, y + 7, { width: 310, lineBreak: false });
    doc.text(formaterFCFA(totalLibereFcfa), MARGIN + 320, y + 7, { width: 170, align: "right", lineBreak: false });
  }

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. Liste des membres (export tableau)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateListeMembres(
  membres: Array<{
    id: number;
    nom: string;
    prenoms: string;
    telephone: string | null;
    village: string | null;
    superficieHa: string;
    statut: string;
    dateAdhesion: string;
  }>,
  statutFilter: string | undefined,
  cooperativeId: number,
): Promise<Buffer> {
  const { doc, endPromise } = makePdfDoc({ margin: 50 });

  const label =
    statutFilter === "actif"   ? "Membres actifs"   :
    statutFilter === "inactif" ? "Membres inactifs" :
    "Tous les membres";

  await drawHeader(doc, cooperativeId, {
    titre_document: "Liste des membres",
    reference: `${label} · ${new Date().toLocaleDateString("fr-FR")}`,
  });

  const VERT_L = "#1a4731";
  const GRIS_L = "#6b7280";
  const NOIR_L = "#111827";

  const nbActifs   = membres.filter((m) => m.statut === "actif").length;
  const nbInactifs = membres.filter((m) => m.statut === "inactif").length;
  doc.fontSize(10).font("Helvetica").fillColor(GRIS_L)
    .text(
      `Total : ${membres.length} membres   |   Actifs : ${nbActifs}   |   Inactifs : ${nbInactifs}`,
      50, doc.y,
    );
  doc.moveDown(0.8);

  const cols = { nom: 50, code: 200, tel: 285, village: 370, superficie: 450, statut: 510 };
  const rowH = 20;

  const drawTableHeader = () => {
    const headerY = doc.y;
    doc.rect(50, headerY, doc.page.width - 100, rowH).fill("#f0fdf4");
    const ty = headerY + 6;
    doc.fillColor(VERT_L).fontSize(8).font("Helvetica-Bold");
    doc.text("NOM & PRÉNOMS", cols.nom,        ty, { width: 145, lineBreak: false });
    doc.text("CODE",          cols.code,       ty, { width: 80,  lineBreak: false });
    doc.text("TÉLÉPHONE",     cols.tel,        ty, { width: 80,  lineBreak: false });
    doc.text("VILLAGE",       cols.village,    ty, { width: 75,  lineBreak: false });
    doc.text("HA",            cols.superficie, ty, { width: 55,  lineBreak: false, align: "right" });
    doc.text("STATUT",        cols.statut,     ty, { width: 55,  lineBreak: false });
    doc.fillColor(NOIR_L);
    doc.y = headerY + rowH;
    doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).stroke("#e5e7eb");
  };

  drawTableHeader();

  for (const [i, m] of membres.entries()) {
    if (doc.y > doc.page.height - 80) {
      doc.addPage();
      drawTableHeader();
    }
    const rowY = doc.y;
    if (i % 2 === 0) doc.rect(50, rowY, doc.page.width - 100, rowH).fill("#f9fafb");
    const ty   = rowY + 5;
    const code = computeCodeMembre(m.id, m.dateAdhesion);
    doc.fillColor(NOIR_L).fontSize(8).font("Helvetica");
    doc.text(`${m.nom} ${m.prenoms}`,              cols.nom,        ty, { width: 145, lineBreak: false });
    doc.fillColor(VERT_L).font("Helvetica-Bold");
    doc.text(code,                                  cols.code,       ty, { width: 80,  lineBreak: false });
    doc.fillColor(NOIR_L).font("Helvetica");
    doc.text(m.telephone    ?? "—",                 cols.tel,        ty, { width: 80,  lineBreak: false });
    doc.text(m.village      ?? "—",                 cols.village,    ty, { width: 75,  lineBreak: false });
    doc.text(parseFloat(m.superficieHa).toFixed(2), cols.superficie, ty, { width: 55,  lineBreak: false, align: "right" });
    doc.fillColor(m.statut === "actif" ? "#16a34a" : "#6b7280").font("Helvetica-Bold");
    doc.text(m.statut === "actif" ? "Actif" : "Inactif", cols.statut, ty, { width: 55, lineBreak: false });
    doc.fillColor(NOIR_L);
    doc.y = rowY + rowH;
  }

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

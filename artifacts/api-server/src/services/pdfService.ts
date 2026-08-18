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
  avancesDeleguesTable,
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
  transfertsStockTable,
  entrepotsDeleguesTable,
  usersTable,
  cooperativesTable,
  expeditionsTable,
  expeditionLotsTable,
  parcellesTable,
  lotsTable,
  lotLivraisonsTable,
  traitementsRefusTable,
  campagnesTable,
  commissionsDeleguesTable,
  commissionsMembresDelaguesTable,
  remboursementsAvancesDeleguesTable,
  certificationsTable,
  certificationsMembresTable,
  sessionsPeseeTable,
  lignesPeseeTable,
  historiquePrixTable,
} from "@workspace/db";
import { eq, desc, gte, lte, lt, and, sql, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { drawHeader, drawFooter } from "./pdfHeaderService";
import { computeCodeMembre } from "./portailService";
import { getMontantAlimentationsCaisseDelegue } from "./delegueService";
import { getTauxActif } from "./commissionService";

const VERT = "#1a4731";
const OR   = "#c4962a";
const GRIS = "#6b7280";
const PAGE_W = 595.28;
const MARGIN  = 50;
const COL1    = MARGIN;
const COL2    = PAGE_W / 2;

function formaterFCFA(n: number): string {
  // Intl en Node.js utilise U+202F (espace insécable étroit) comme séparateur de milliers
  // en locale fr-FR. PDFKit ne supporte pas ce caractère et l'affiche comme "¬" ou "|".
  // On remplace par un espace ordinaire pour un rendu correct.
  return new Intl.NumberFormat("fr-FR").format(n).replace(/[\u202F\u00A0]/g, " ") + " FCFA";
}
function formaterNombre(n: number): string {
  return new Intl.NumberFormat("fr-FR").format(n).replace(/[\u202F\u00A0]/g, " ");
}
function formaterDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formaterDateHeure(d: string | Date): string {
  const dt = new Date(d);
  const tz = "Africa/Abidjan";
  const date = dt.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: tz });
  const heure = dt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return `${date} à ${heure}`;
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

/** Retourne le libellé de la campagne ouverte de la coopérative, ou null si aucune.
 *  Format : "Libellé (annéeDebut/anneeFin)" ou "Libellé (année)" si une seule année. */
async function getCampagneEnCours(cooperativeId: number): Promise<string | null> {
  const [c] = await db
    .select({ libelle: campagnesTable.libelle, anneeDebut: campagnesTable.anneeDebut, anneeFin: campagnesTable.anneeFin })
    .from(campagnesTable)
    .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
    .orderBy(desc(campagnesTable.dateOuverture))
    .limit(1);
  if (!c) return null;
  const years = c.anneeDebut === c.anneeFin ? String(c.anneeDebut) : `${c.anneeDebut}/${c.anneeFin}`;
  return `${c.libelle} (${years})`;
}

/** Retourne le libellé de certification du produit pour un membre.
 *  Ex : "Cacao certifié Rainforest Alliance · Fairtrade" ou "Cacao ordinaire". */
async function getMentionCertification(membreId: number | null | undefined, cooperativeId: number): Promise<string> {
  const LABELS: Record<string, string> = {
    rainforest_alliance: "Rainforest Alliance",
    fairtrade: "Fairtrade",
    bio: "Agriculture Biologique",
    eudr: "EUDR",
    utz: "UTZ",
    autre: "Certifié",
  };
  if (!membreId) return "Cacao ordinaire";
  const rows = await db
    .select({ type: certificationsTable.type })
    .from(certificationsMembresTable)
    .innerJoin(certificationsTable, eq(certificationsTable.id, certificationsMembresTable.certificationId))
    .where(and(
      eq(certificationsMembresTable.membreId, membreId),
      eq(certificationsMembresTable.cooperativeId, cooperativeId),
      eq(certificationsMembresTable.statutConformite, "certifie"),
      eq(certificationsTable.statut, "actif"),
    ));
  if (rows.length === 0) return "Cacao ordinaire";
  const labels = rows.map(r => LABELS[r.type] ?? r.type);
  return `Cacao certifié ${labels.join(" · ")}`;
}

/** Helper : ajoute les pieds de page sur toutes les pages bufferisées puis libère le buffer.
 *  drawFooter neutralise temporairement margin.bottom pour éviter que PDFKit ne détecte
 *  un débordement et insère des pages vides lors du rendu du footer. */
async function addFooters(doc: InstanceType<typeof PDFDocument>, cooperativeId: number): Promise<void> {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    await drawFooter(doc, cooperativeId, i + 1, range.count);
  }
  doc.flushPages();
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

  const [livraisons, ventes, avancesRetard, ecritures, intrantsMois, commissionsMois] = await Promise.all([
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
    .innerJoin(membresTable, and(eq(livraisonsTable.membreId, membresTable.id), eq(membresTable.cooperativeId, cooperativeId)))
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
    .innerJoin(exportateursTable, and(eq(exportateursTable.id, ventesExportateursTable.exportateurId), eq(exportateursTable.cooperativeId, cooperativeId)))
    .where(and(gte(ventesExportateursTable.dateVente, dateMin), lte(ventesExportateursTable.dateVente, dateMax))),

    db.select({ id: avancesTable.id, membreNom: membresTable.nom, membrePrenoms: membresTable.prenoms, montantOctroyeFcfa: avancesTable.montantOctroyeFcfa, soldeRestantFcfa: avancesTable.soldeRestantFcfa, dateEcheance: avancesTable.dateEcheance })
    .from(avancesTable)
    .innerJoin(membresTable, and(eq(avancesTable.membreId, membresTable.id), eq(membresTable.cooperativeId, cooperativeId)))
    .where(eq(avancesTable.statut, "en_retard")),

    db.select().from(ecrituresComptablesTable)
    .where(and(eq(ecrituresComptablesTable.cooperativeId, cooperativeId), eq(ecrituresComptablesTable.exercice, annee), gte(ecrituresComptablesTable.dateEcriture, dateMin), lte(ecrituresComptablesTable.dateEcriture, dateMax))),

    db.execute(sql`
      SELECT
        COALESCE((
          SELECT SUM(montant_fcfa)
          FROM distributions_intrants
          WHERE cooperative_id = ${cooperativeId}
            AND date_distribution BETWEEN ${dateMin} AND ${dateMax}
        ), 0) AS intrants_distribues,
        COALESCE((
          SELECT SUM(ri.montant_fcfa)
          FROM remboursements_intrants ri
          INNER JOIN distributions_intrants di ON di.id = ri.distribution_id
          WHERE di.cooperative_id = ${cooperativeId}
            AND ri.date_remboursement BETWEEN ${dateMin} AND ${dateMax}
        ), 0) AS intrants_recouvres
    `),

    db.execute(sql`
      SELECT COALESCE(SUM(montant_fcfa), 0) AS commissions_payees
      FROM commissions_delegues cd
      INNER JOIN campagnes c ON c.id = cd.campagne_id
      WHERE c.cooperative_id = ${cooperativeId}
        AND cd.statut = 'payé'
        AND cd.date_paiement::date BETWEEN ${dateMin} AND ${dateMax}
    `),
  ]);

  const tonnage    = livraisons.reduce((s, l) => s + parseFloat(l.poidsKg), 0);
  const caProduits = ecritures.filter(e => e.compteCredit === "701").reduce((s, e) => s + e.montantFcfa, 0);
  const coutAchats = ecritures.filter(e => e.compteDebit === "601").reduce((s, e) => s + e.montantFcfa, 0);
  const chargesPersonnelMois = ecritures.filter(e => ["621","641","661"].includes(e.compteDebit ?? "")).reduce((s, e) => s + e.montantFcfa, 0);
  const itRow = intrantsMois.rows[0] as Record<string, string>;
  const intrantsDistrib  = Number(itRow?.intrants_distribues ?? 0);
  const intrantsRecouvres = Number(itRow?.intrants_recouvres ?? 0);
  const intrantsNetMois  = intrantsDistrib - intrantsRecouvres;
  const comRow = commissionsMois.rows[0] as Record<string, string>;
  const commissionsMoisFcfa = Number(comRow?.commissions_payees ?? 0);
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

  // Page 2 – Livraisons (seulement s'il y en a)
  if (livraisons.length > 0) {
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
  }

  // Page 3 – Ventes (seulement s'il y en a)
  if (ventes.length > 0) {
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
  }

  // Page suivante – Compte de résultat simplifié (toujours inclus)
  doc.addPage();
  await drawHeader(doc, cooperativeId, { titre_document: "Compte de résultat" });
  const margeNette = caProduits - coutAchats - chargesPersonnelMois - intrantsNetMois - commissionsMoisFcfa;
  const crData: Array<{ label: string; montant: number; type: "produit" | "charge" | "resultat" }> = [
    { label: "Produits — Ventes cacao (701)", montant: caProduits, type: "produit" },
    { label: "Charges — Achats cacao (601)", montant: coutAchats, type: "charge" },
    ...(chargesPersonnelMois > 0 ? [{ label: "Charges personnel (621/641/661)", montant: chargesPersonnelMois, type: "charge" as const }] : []),
    ...(intrantsNetMois !== 0 ? [{ label: intrantsNetMois >= 0 ? "Intrants nets distribués" : "Intrants — recouvrement net", montant: intrantsNetMois, type: (intrantsNetMois >= 0 ? "charge" : "produit") as "charge" | "produit" }] : []),
    ...(commissionsMoisFcfa > 0 ? [{ label: "Commissions délégués payées", montant: commissionsMoisFcfa, type: "charge" as const }] : []),
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

  // Page suivante – Avances en retard (seulement s'il y en a)
  if (avancesRetard.length > 0) {
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
  }

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Bilan de campagne
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBilanCampagne(cooperativeId: number, annee: number): Promise<Buffer> {
  const dateDebut = `${annee}-01-01`;
  const dateFin   = `${annee}-12-31`;

  const [ecritures, planComptes, topProducteurs, topExportateurs] = await Promise.all([
    db.select().from(ecrituresComptablesTable)
      .where(and(
        eq(ecrituresComptablesTable.cooperativeId, cooperativeId),
        eq(ecrituresComptablesTable.exercice, annee),
      )),

    db.select().from(planComptableTable)
      .where(eq(planComptableTable.cooperativeId, cooperativeId)),

    db.select({
        nom: membresTable.nom,
        prenoms: membresTable.prenoms,
        tonnage: sql<number>`coalesce(sum(${livraisonsTable.poidsKg}::numeric), 0)::float8`,
        caFcfa: sql<number>`coalesce(sum(${livraisonsTable.montantBrutFcfa}::bigint), 0)::float8`,
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .where(and(
        eq(membresTable.cooperativeId, cooperativeId),
        gte(livraisonsTable.dateLivraison, dateDebut),
        lte(livraisonsTable.dateLivraison, dateFin),
      ))
      .groupBy(membresTable.id, membresTable.nom, membresTable.prenoms)
      .orderBy(desc(sql`coalesce(sum(${livraisonsTable.poidsKg}::numeric), 0)`))
      .limit(10),

    db.select({
        nom: exportateursTable.nom,
        caTotalFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.montantTotalFcfa}::bigint), 0)::float8`,
        soldeDuFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.soldeDuFcfa}::bigint), 0)::float8`,
      })
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(and(
        eq(exportateursTable.cooperativeId, cooperativeId),
        gte(ventesExportateursTable.dateVente, dateDebut),
        lte(ventesExportateursTable.dateVente, dateFin),
      ))
      .groupBy(exportateursTable.id, exportateursTable.nom)
      .orderBy(desc(sql`coalesce(sum(${ventesExportateursTable.montantTotalFcfa}), 0)`))
      .limit(5),
  ]);

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

  // Page 3 – Top producteurs (seulement s'il y en a)
  if (topProducteurs.length > 0) {
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
  }

  // Page 4 – Top exportateurs + Bilan (toujours inclus car le bilan OHADA l'est)
  doc.addPage();
  await drawHeader(doc, cooperativeId, { titre_document: "Top 5 exportateurs" });
  const eCols = [160, 120, 100];
  y = doc.y;
  if (topExportateurs.length > 0) {
    ligneTableau(doc, ["Exportateur", "CA total FCFA", "Solde dû FCFA"], eCols, MARGIN, y, OR);
    y += 18;
    topExportateurs.forEach((e, i) => {
      if (i % 2 === 0) doc.rect(MARGIN, y, eCols.reduce((a, b) => a + b, 0), 16).fill("#fffbeb");
      ligneTableau(doc, [e.nom ?? "—", formaterFCFA(e.caTotalFcfa), formaterFCFA(e.soldeDuFcfa)], eCols, MARGIN, y);
      y += 16;
    });
  } else {
    doc.fontSize(8).fillColor(GRIS).text("Aucune vente exportateur enregistrée sur la période.", MARGIN, y + 4);
    y += 20;
  }

  // Bilan simplifié OHADA
  y += 20;
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold").text("Bilan simplifié OHADA", MARGIN, y);
  y += 18;
  const bilanData = [
    { sect: "ACTIF", label: "Créances exportateurs (4111)", montant: ecritures.filter(e => e.compteDebit === "4111").reduce((s, e) => s + e.montantFcfa, 0) - ecritures.filter(e => e.compteCredit === "4111").reduce((s, e) => s + e.montantFcfa, 0) },
    { sect: "ACTIF", label: "Avances producteurs (4091)", montant: ecritures.filter(e => e.compteDebit === "4091").reduce((s, e) => s + e.montantFcfa, 0) - ecritures.filter(e => e.compteCredit === "4091").reduce((s, e) => s + e.montantFcfa, 0) },
    { sect: "ACTIF", label: "Banque (521)", montant: soldeBanque },
    { sect: "PASSIF", label: "Dettes fournisseurs producteurs (401)", montant: ecritures.filter(e => e.compteCredit === "401").reduce((s, e) => s + e.montantFcfa, 0) - ecritures.filter(e => e.compteDebit === "401").reduce((s, e) => s + e.montantFcfa, 0) },
    { sect: "PASSIF", label: "Résultat de l'exercice (130)", montant: resultatNet },
  ];
  bilanData.forEach((row) => {
    const bg = row.sect === "ACTIF" ? "#f0fdf4" : "#fff7ed";
    doc.rect(MARGIN, y, 420, 18).fill(bg);
    doc.fontSize(8).fillColor("black").font("Helvetica")
      .text(`[${row.sect}] ${row.label}`, MARGIN + 4, y + 5, { width: 310, lineBreak: false });
    doc.text(formaterFCFA(Math.max(0, row.montant)), MARGIN + 320, y + 5, { width: 100, align: "right", lineBreak: false });
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
  const drawEmargementHeader = () => {
    ligneTableau(doc, ["#","Nom et prénoms","Mode","Heure arrivée","Émargement"], W, MARGIN, doc.y, VERT);
  };
  drawEmargementHeader();
  let y = doc.y + 16;
  for (const [i, row] of presences.slice(0, 80).entries()) {
    const bg = i % 2 === 0 ? "#f9fafb" : "white";
    doc.rect(MARGIN, y, W.reduce((a, b) => a + b, 0), 16).fill(bg);
    const nom = [row.m.prenoms, row.m.nom].filter(Boolean).join(" ");
    const heure = row.p.heureArrivee ? new Date(row.p.heureArrivee).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—";
    ligneTableau(doc, [String(i+1), nom, row.p.modePresence, heure, ""], W, MARGIN, y);
    y += 16;
    if (y > 750) {
      doc.addPage();
      await drawHeader(doc, cooperativeId, { titre_document: "Émargement (suite)" });
      y = doc.y;
      drawEmargementHeader();
      y = doc.y + 16;
    }
  }

  // ─── Signatures ───────────────────────────────────────────────────────────
  const sigY = Math.min(y + 20, 730);
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
  const agentUserAlias = alias(usersTable, "agent_user");
  const peseurUserAlias = alias(usersTable, "peseur_user");
  const [row] = await db.select({
    id: livraisonsTable.id,
    membreId: livraisonsTable.membreId,
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
    planAvanceType: livraisonsTable.planAvanceType,
    membreNom: membresTable.nom,
    membrePrenoms: membresTable.prenoms,
    membreCni: membresTable.numeroCni,
    membreGroupement: membresTable.groupement,
    membreTel: membresTable.telephone,
    agentId: livraisonsTable.agentId,
    agentNom: agentUserAlias.nom,
    agentPrenoms: agentUserAlias.prenoms,
    agentRole: agentUserAlias.role,
    peseurId: livraisonsTable.peseurId,
    peseurNom: peseurUserAlias.nom,
    peseurPrenoms: peseurUserAlias.prenoms,
    createdAt: livraisonsTable.createdAt,
  }).from(livraisonsTable)
    .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
    .leftJoin(agentUserAlias, eq(livraisonsTable.agentId, agentUserAlias.id))
    .leftJoin(peseurUserAlias, eq(livraisonsTable.peseurId, peseurUserAlias.id))
    .where(eq(livraisonsTable.id, livraisonId));
  if (!row) throw new Error("Livraison introuvable");

  const [campagne, mentionCertif] = await Promise.all([
    getCampagneEnCours(cooperativeId),
    getMentionCertification(row.membreId, cooperativeId),
  ]);
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
    ["N° Reçu",            ref],
    ["Campagne",           campagne ?? "—"],
    ["Date de livraison",  formaterDate(row.dateLivraison)],
    ["Heure de pesée",     row.createdAt
      ? new Date(row.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Africa/Abidjan" })
      : "—"],
    ["Produit",            mentionCertif],
    ["Nombre de sacs",     row.nombreSacs ? String(row.nombreSacs) : "—"],
    ["Poids brut",         row.produitBrutKg
      ? `${parseFloat(row.produitBrutKg).toFixed(2)} kg`
      : `${(parseFloat(row.poidsKg) + parseFloat(row.retenueKg ?? "0")).toFixed(2)} kg`],
    ["Retenue",            row.retenueKg && parseFloat(row.retenueKg) > 0 ? `${parseFloat(row.retenueKg).toFixed(2)} kg` : "0 kg"],
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
  // Libellé et couleur de la ligne avance selon le plan choisi
  const planAvance = row.planAvanceType ?? "integral";
  let avanceLabel: string;
  let avanceBg: string;
  if (planAvance === "reporte") {
    avanceLabel = "Avance reportée (non déduite)";
    avanceBg = "#fef9c3"; // jaune pâle
  } else if (planAvance === "partiel") {
    avanceLabel = "Avance déduite (partiel)";
    avanceBg = "#fef3c7";
  } else {
    avanceLabel = "Avance déduite";
    avanceBg = "#fffbeb";
  }
  const recuLivTotaux: Array<[string, string, string]> = [
    ["Montant brut",      formaterFCFA(row.montantBrutFcfa),                                                     "#f9fafb"],
    [avanceLabel,         planAvance === "reporte" ? "—" : `- ${formaterFCFA(row.avanceDeduiteFcfa)}`,           avanceBg],
    ["Intrants déduits",  `- ${formaterFCFA(row.intrantsDeduitsFcfa)}`,                                          "#fff7ed"],
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

  // — Ligne "Pesé par" si un peseur distinct est enregistré
  if (row.peseurId && (row.peseurNom || row.peseurPrenoms)) {
    y += 14;
    const peseurFullName = `${row.peseurPrenoms ?? ""} ${row.peseurNom ?? ""}`.trim();
    doc.fontSize(9).font("Helvetica").fillColor(GRIS)
      .text("Pesé par : ", MARGIN, y, { continued: true })
      .font("Helvetica-Bold").fillColor("black")
      .text(`${peseurFullName} (Peseur)`);
  }
  // — Ligne "Saisi par" pour l'agent créateur (délégué, agent terrain, etc.)
  if (row.agentId && (row.agentNom || row.agentPrenoms)) {
    y += 14;
    const roleStr = String(row.agentRole ?? "");
    const roleLabel = roleStr === "peseur" ? "Peseur"
      : roleStr === "delegue" ? "Délégué"
      : roleStr === "agent_terrain" ? "Agent terrain"
      : roleStr === "directeur" ? "Directeur"
      : roleStr || "Agent";
    const agentFullName = `${row.agentPrenoms ?? ""} ${row.agentNom ?? ""}`.trim();
    doc.fontSize(9).font("Helvetica").fillColor(GRIS)
      .text("Saisi par : ", MARGIN, y, { continued: true })
      .font("Helvetica-Bold").fillColor("black")
      .text(`${agentFullName} (${roleLabel})`);
  }

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
  const validateurAlias = alias(usersTable, "validateur");
  const saisiseurPayAlias = alias(usersTable, "saisiseur_pay");
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
    // Agent validateur
    validateurNom: validateurAlias.nom,
    validateurPrenoms: validateurAlias.prenoms,
    validateurRole: validateurAlias.role,
    // Saisie proxy (gérant agissant pour un délégué)
    agentSaisiseurId: paiementsTable.agentSaisiseurId,
    agentSaisiseurNom: saisiseurPayAlias.nom,
  }).from(paiementsTable)
    .leftJoin(membresTable, eq(paiementsTable.membreId, membresTable.id))
    .leftJoin(livraisonsTable, eq(paiementsTable.livraisonId, livraisonsTable.id))
    .leftJoin(validateurAlias, eq(paiementsTable.validePar, validateurAlias.id))
    .leftJoin(saisiseurPayAlias, eq(paiementsTable.agentSaisiseurId, saisiseurPayAlias.id))
    .where(eq(paiementsTable.id, paiementId));
  if (!row) throw new Error("Paiement introuvable");

  const campagne = await getCampagneEnCours(cooperativeId);
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
    ["N° Reçu",              ref],
    ["Campagne",             campagne ?? "—"],
    ["Date",                 formaterDateHeure(row.createdAt)],
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

  // — Ligne "Validé par" si l'agent validateur est connu
  if (row.validateurNom || row.validateurPrenoms) {
    y += 14;
    const roleStr = String(row.validateurRole ?? "");
    const roleLabel = roleStr === "delegue" ? "Délégué"
      : roleStr === "agent_terrain" ? "Agent terrain"
      : roleStr === "directeur" ? "Directeur"
      : roleStr === "comptable" ? "Comptable"
      : roleStr === "pca" ? "PCA"
      : roleStr || "Agent";
    const validateurFullName = `${row.validateurPrenoms ?? ""} ${row.validateurNom ?? ""}`.trim();
    doc.fontSize(9).font("Helvetica").fillColor(GRIS)
      .text("Validé par : ", MARGIN, y, { continued: true })
      .font("Helvetica-Bold").fillColor("black")
      .text(`${validateurFullName} (${roleLabel})`);
  }

  // — Ligne "Saisi par" si l'opération a été saisie par proxy (gérant pour délégué)
  if (row.agentSaisiseurId && row.agentSaisiseurNom) {
    y += 14;
    doc.fontSize(9).font("Helvetica").fillColor(GRIS)
      .text("Saisi par : ", MARGIN, y, { continued: true })
      .font("Helvetica-Bold").fillColor("black")
      .text(row.agentSaisiseurNom);
  }

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
// ── Type & helpers internes pour le bulletin de paie ─────────────────────────

type BulletinData = {
  bulletin:  typeof bulletinsPaieTable.$inferSelect;
  agent:     typeof personnelTable.$inferSelect | undefined;
  avantages: (typeof lignesBulletinTable.$inferSelect)[];
  retenues:  (typeof lignesBulletinTable.$inferSelect)[];
};

async function fetchBulletinData(bulletinId: number, cooperativeId: number): Promise<BulletinData> {
  const [bulletin] = await db.select().from(bulletinsPaieTable)
    .where(and(eq(bulletinsPaieTable.id, bulletinId), eq(bulletinsPaieTable.cooperativeId, cooperativeId)));
  if (!bulletin) throw new Error("Bulletin introuvable");
  const [agent] = await db.select().from(personnelTable).where(eq(personnelTable.id, bulletin.personnelId));
  const lignes  = await db.select().from(lignesBulletinTable).where(eq(lignesBulletinTable.bulletinId, bulletinId));
  return { bulletin, agent, avantages: lignes.filter(l => l.type === "avantage"), retenues: lignes.filter(l => l.type === "retenue") };
}

async function drawBulletinOnDoc(
  doc: InstanceType<typeof PDFDocument>,
  cooperativeId: number,
  { bulletin, agent, avantages, retenues }: BulletinData,
): Promise<void> {
  // ── Constantes de mise en page ─────────────────────────────────────────────
  const REF      = `BP-${bulletin.annee}-${String(bulletin.mois).padStart(2,"0")}-${String(bulletin.id).padStart(5,"0")}`;
  const W        = PAGE_W - MARGIN * 2;         // 495 pt
  const DARK     = "#0f2d1f";                    // vert très sombre pour titres
  const ACCENT   = "#e8f5ef";                    // vert très pale pour alternance
  const BORDER   = "#c7ddd1";
  const RED      = "#dc2626";
  const STAT_CLR: Record<string, string> = { paye: "#16a34a", valide: "#2563eb", brouillon: "#f59e0b" };

  // helpers positionnels
  const RIGHT = MARGIN + W;
  const hline  = (y: number, color = BORDER) => doc.moveTo(MARGIN, y).lineTo(RIGHT, y).strokeColor(color).lineWidth(0.5).stroke().lineWidth(1);
  const sectionTitle = (label: string, y: number, color: string = VERT) => {
    doc.rect(MARGIN, y, 3, 11).fill(color);
    doc.fontSize(8).fillColor(color).font("Helvetica-Bold")
       .text(label, MARGIN + 8, y + 1, { lineBreak: false });
    return y + 16;
  };

  await drawHeader(doc, cooperativeId, { titre_document: "Bulletin de Paie", reference: REF });

  // ── 1. Bloc salarié — deux colonnes ────────────────────────────────────────
  let y = doc.y + 4;
  const BOX_H = 72;
  const MID   = MARGIN + W / 2;

  // Fond & bordure du bloc
  doc.rect(MARGIN, y, W, BOX_H).fill(ACCENT);
  doc.rect(MARGIN, y, W, BOX_H).stroke(BORDER);
  // Séparateur vertical central
  doc.moveTo(MID, y + 8).lineTo(MID, y + BOX_H - 8).strokeColor(BORDER).lineWidth(0.5).stroke().lineWidth(1);

  // Colonne gauche — identité salarié
  doc.fontSize(6.5).fillColor(GRIS).font("Helvetica")
     .text("SALARIÉ", MARGIN + 10, y + 7);
  doc.fontSize(12).fillColor(DARK).font("Helvetica-Bold")
     .text(`${agent?.prenoms ?? ""} ${agent?.nom ?? "—"}`.trim(), MARGIN + 10, y + 17, { width: W / 2 - 20, lineBreak: false });
  doc.fontSize(7.5).fillColor(GRIS).font("Helvetica")
     .text(`Poste : ${agent?.poste ?? "—"}`, MARGIN + 10, y + 32)
     .text(`Contrat : ${(agent?.typeContrat ?? "—").toUpperCase()}   •   CNPS : ${agent?.numeroCnps ?? "—"}`, MARGIN + 10, y + 43)
     .text(`CNI : ${agent?.numeroCni ?? "—"}`, MARGIN + 10, y + 54);

  // Colonne droite — période / référence / statut
  const statut = bulletin.statut;
  const statutLabel = statut === "paye" ? "PAYÉ" : statut === "valide" ? "VALIDÉ" : "BROUILLON";
  const statutClr   = STAT_CLR[statut] ?? GRIS;

  doc.fontSize(6.5).fillColor(GRIS).font("Helvetica")
     .text("INFORMATIONS", MID + 10, y + 7);
  doc.fontSize(8.5).fillColor(DARK).font("Helvetica-Bold")
     .text(`Période : ${bulletin.periode}`, MID + 10, y + 19);
  doc.fontSize(7.5).fillColor(GRIS).font("Helvetica")
     .text(`Référence : ${REF}`, MID + 10, y + 31)
     .text(`Ancienneté : ${agent?.anciennete ?? "—"}`, MID + 10, y + 42);

  // Badge statut
  const BADGE_W = 64, BADGE_H = 14;
  const bx = RIGHT - BADGE_W - 8, by = y + 50;
  doc.rect(bx, by, BADGE_W, BADGE_H).fill(statutClr);
  doc.fontSize(7).fillColor("white").font("Helvetica-Bold")
     .text(statutLabel, bx, by + 3.5, { width: BADGE_W, align: "center", lineBreak: false });
  doc.fillColor("black");

  y += BOX_H + 12;

  // ── 2. Table des avantages ─────────────────────────────────────────────────
  if (avantages.length > 0) {
    y = sectionTitle("ÉLÉMENTS DE RÉMUNÉRATION", y, VERT);

    // En-tête de table
    doc.rect(MARGIN, y, W, 15).fill(VERT);
    doc.fontSize(7.5).fillColor("white").font("Helvetica-Bold");
    doc.text("Libellé", MARGIN + 8, y + 4, { width: W - 100, lineBreak: false });
    doc.text("Montant (FCFA)", RIGHT - 108, y + 4, { width: 100, align: "right", lineBreak: false });
    y += 15;

    for (const [i, l] of avantages.entries()) {
      const rowH = 14;
      if (i % 2 === 0) doc.rect(MARGIN, y, W, rowH).fill(ACCENT);
      doc.fontSize(7.5).fillColor("#1a1a1a").font("Helvetica")
         .text(l.libelle, MARGIN + 8, y + 3, { width: W - 110, lineBreak: false });
      doc.font("Helvetica-Bold").fillColor("#16a34a")
         .text(`+ ${formaterFCFA(l.montantFcfa)}`, RIGHT - 108, y + 3, { width: 100, align: "right", lineBreak: false });
      doc.fillColor("black");
      y += rowH;
    }
    hline(y);
    y += 10;
  }

  // ── 3. Table des retenues ──────────────────────────────────────────────────
  if (retenues.length > 0) {
    y = sectionTitle("RETENUES", y, RED);

    doc.rect(MARGIN, y, W, 15).fill(RED);
    doc.fontSize(7.5).fillColor("white").font("Helvetica-Bold");
    doc.text("Libellé", MARGIN + 8, y + 4, { width: W - 100, lineBreak: false });
    doc.text("Montant (FCFA)", RIGHT - 108, y + 4, { width: 100, align: "right", lineBreak: false });
    y += 15;

    for (const [i, l] of retenues.entries()) {
      const rowH = 14;
      if (i % 2 === 0) doc.rect(MARGIN, y, W, rowH).fill("#fff8f8");
      doc.fontSize(7.5).fillColor("#1a1a1a").font("Helvetica")
         .text(l.libelle, MARGIN + 8, y + 3, { width: W - 110, lineBreak: false });
      doc.font("Helvetica-Bold").fillColor(RED)
         .text(`- ${formaterFCFA(l.montantFcfa)}`, RIGHT - 108, y + 3, { width: 100, align: "right", lineBreak: false });
      doc.fillColor("black");
      y += rowH;
    }
    hline(y);
    y += 10;
  }

  // ── 4. Récapitulatif ───────────────────────────────────────────────────────
  y = sectionTitle("RÉCAPITULATIF", y, VERT);

  const recap: Array<{ label: string; montant: number; bold?: boolean; color?: string }> = [
    { label: "Salaire de base",  montant: bulletin.salaireBaseFcfa },
    { label: "Total avantages",  montant: bulletin.totalAvantagesFcfa,  color: "#16a34a" },
    { label: "Salaire brut",     montant: bulletin.salaireBrutFcfa,     bold: true },
    { label: "Total retenues",   montant: bulletin.totalRetenuesFcfa,   color: RED },
  ];

  // En-tête deux colonnes
  doc.rect(MARGIN, y, W, 15).fill("#e2e8f0");
  doc.fontSize(7.5).fillColor("#334155").font("Helvetica-Bold")
     .text("Libellé", MARGIN + 8, y + 4, { width: W - 100, lineBreak: false });
  doc.text("Montant", RIGHT - 108, y + 4, { width: 100, align: "right", lineBreak: false });
  y += 15;

  for (const [i, row] of recap.entries()) {
    const rowH = 16;
    if (i % 2 === 0) doc.rect(MARGIN, y, W, rowH).fill(ACCENT);
    doc.fontSize(8).fillColor("#1a1a1a")
       .font(row.bold ? "Helvetica-Bold" : "Helvetica")
       .text(row.label, MARGIN + 8, y + 4, { width: W - 110, lineBreak: false });
    doc.font("Helvetica-Bold").fillColor(row.color ?? "#1a1a1a")
       .text(formaterFCFA(row.montant), RIGHT - 108, y + 4, { width: 100, align: "right", lineBreak: false });
    doc.fillColor("black");
    y += rowH;
  }
  y += 6;

  // ── 5. Net à payer — bandeau principal ────────────────────────────────────
  const NET_H = 32;
  doc.rect(MARGIN, y, W, NET_H).fill(VERT);
  // Sous-bande décorative gauche
  doc.rect(MARGIN, y, 5, NET_H).fill(OR);
  doc.fontSize(11).fillColor("white").font("Helvetica-Bold")
     .text("NET À PAYER", MARGIN + 14, y + 10, { width: W - 130, lineBreak: false });
  doc.fontSize(13).fillColor("white").font("Helvetica-Bold")
     .text(formaterFCFA(bulletin.salaireNetFcfa), RIGHT - 130, y + 9, { width: 122, align: "right", lineBreak: false });
  y += NET_H + 10;

  // ── 6. Charges employeur ──────────────────────────────────────────────────
  const CHARG_W = W / 3 - 4;
  const charges: Array<[string, number]> = [
    ["CNPS patronale",   bulletin.chargesCnpsPatronaleFcfa],
    ["Taxe apprentissage", bulletin.chargesTaxeApprentissageFcfa],
    ["Coût total employeur", bulletin.coutTotalEmployeurFcfa],
  ];
  doc.rect(MARGIN, y, W, 38).fill("#f8fafc").stroke(BORDER);
  doc.fontSize(6.5).fillColor(GRIS).font("Helvetica-Bold")
     .text("CHARGES EMPLOYEUR", MARGIN + 8, y + 5);
  charges.forEach(([label, montant], i) => {
    const cx = MARGIN + 8 + i * (CHARG_W + 4);
    doc.fontSize(6.5).fillColor(GRIS).font("Helvetica")
       .text(label, cx, y + 16, { width: CHARG_W, lineBreak: false });
    doc.fontSize(8).fillColor(DARK).font("Helvetica-Bold")
       .text(formaterFCFA(montant), cx, y + 25, { width: CHARG_W, lineBreak: false });
  });
  y += 46;

  // Référence paiement si disponible
  if (bulletin.referencePaiement) {
    doc.fontSize(7.5).fillColor(GRIS).font("Helvetica")
       .text(`Réf. paiement : ${bulletin.referencePaiement}`, MARGIN, y);
    y += 12;
  }

  // ── 7. Signatures ─────────────────────────────────────────────────────────
  const SIG_Y = Math.max(y + 16, 682);
  const SIG_W = 155, SIG_H = 44;
  const sig2x = RIGHT - SIG_W;

  // Boîte gauche — employeur
  doc.rect(MARGIN, SIG_Y, SIG_W, SIG_H).fill("#f8fafc").stroke(BORDER);
  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Bold")
     .text("L'EMPLOYEUR", MARGIN, SIG_Y + 5, { width: SIG_W, align: "center", lineBreak: false });
  doc.fontSize(6.5).fillColor(GRIS).font("Helvetica")
     .text("Directeur Général / Gérant", MARGIN, SIG_Y + 33, { width: SIG_W, align: "center", lineBreak: false });

  // Boîte droite — salarié
  doc.rect(sig2x, SIG_Y, SIG_W, SIG_H).fill("#f8fafc").stroke(BORDER);
  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Bold")
     .text("LE SALARIÉ", sig2x, SIG_Y + 5, { width: SIG_W, align: "center", lineBreak: false });
  doc.fontSize(6.5).fillColor(GRIS).font("Helvetica")
     .text("Signature précédée de « Lu et approuvé »", sig2x, SIG_Y + 33, { width: SIG_W, align: "center", lineBreak: false });
}

export async function generateBulletinPaie(bulletinId: number, cooperativeId: number): Promise<Buffer> {
  const data = await fetchBulletinData(bulletinId, cooperativeId);
  const { doc, endPromise } = makePdfDoc();
  await drawBulletinOnDoc(doc, cooperativeId, data);
  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7b. Export groupé — bulletins de paie (un par page dans un seul PDF)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBulletinsPaieGroupes(bulletinIds: number[], cooperativeId: number): Promise<Buffer> {
  if (bulletinIds.length === 0) throw new Error("Aucun bulletin sélectionné");
  const { doc, endPromise } = makePdfDoc();
  for (let i = 0; i < bulletinIds.length; i++) {
    if (i > 0) doc.addPage();
    const data = await fetchBulletinData(bulletinIds[i]!, cooperativeId);
    await drawBulletinOnDoc(doc, cooperativeId, data);
  }
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
    membreId: livraisonsTable.membreId,
    membreNom: membresTable.nom,
    membrePrenoms: membresTable.prenoms,
    membreGroupement: membresTable.groupement,
  }).from(livraisonsTable)
    .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
    .where(eq(livraisonsTable.id, livraisonId));
  if (!row) throw new Error("Livraison introuvable");

  const [campagne, mentionCertif] = await Promise.all([
    getCampagneEnCours(cooperativeId),
    getMentionCertification(row.membreId, cooperativeId),
  ]);
  const { doc, endPromise } = makePdfDoc();
  const ref = row.codeAchat ?? `PES-${String(row.id).padStart(5,"0")}`;
  await drawHeader(doc, cooperativeId, { titre_document: "Bordereau de Pesée", reference: ref });

  let y = doc.y;
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 44).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("PRODUCTEUR", MARGIN + 8, y + 5);
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(`${row.membrePrenoms ?? ""} ${row.membreNom ?? "—"}`, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`Groupement : ${row.membreGroupement ?? "—"}   |   ${mentionCertif}   |   Sacs : ${row.nombreSacs ?? "—"}`, MARGIN + 8, y + 30);
  y += 52;

  if (campagne) {
    doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 16).fill("#e0f2fe");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("Campagne :", MARGIN + 8, y + 4, { width: 100, lineBreak: false });
    doc.fontSize(8).fillColor("#0c4a6e").font("Helvetica-Bold").text(campagne, MARGIN + 110, y + 4, { lineBreak: false });
    y += 20;
  }

  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 16).fill("#f0fdf4");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("N° Bordereau :", MARGIN + 8, y + 4, { width: 120, lineBreak: false });
  doc.fontSize(8).fillColor(VERT).font("Helvetica-Bold").text(ref, MARGIN + 130, y + 4, { lineBreak: false });
  y += 22;

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
  const saisiseurAvcAlias = alias(usersTable, "saisiseur_avc");
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
    // Saisie proxy (gérant agissant pour un délégué)
    agentSaisiseurId: avancesTable.agentSaisiseurId,
    agentSaisiseurNom: saisiseurAvcAlias.nom,
  }).from(avancesTable)
    .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
    .leftJoin(saisiseurAvcAlias, eq(avancesTable.agentSaisiseurId, saisiseurAvcAlias.id))
    .where(eq(avancesTable.id, avanceId));
  if (!row) throw new Error("Avance introuvable");

  const campagne = await getCampagneEnCours(cooperativeId);
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
    ["N° Reçu",        ref],
    ["Campagne",       campagne ?? "—"],
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

  // — Ligne "Saisi par" si l'opération a été saisie par proxy (gérant pour délégué)
  if (row.agentSaisiseurId && row.agentSaisiseurNom) {
    y += 14;
    doc.fontSize(9).font("Helvetica").fillColor(GRIS)
      .text("Saisi par : ", MARGIN, y, { continued: true })
      .font("Helvetica-Bold").fillColor("black")
      .text(row.agentSaisiseurNom);
  }

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

  const campagne = await getCampagneEnCours(cooperativeId);
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
    ["N° Reçu",          ref],
    ["Campagne",         campagne ?? "—"],
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

  const campagne = await getCampagneEnCours(cooperativeId);
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
    ["Campagne en cours",           campagne ?? "—",                 "#e0f2fe"],
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
    numeroMembre: number;
    nom: string;
    prenoms: string;
    sexe?: string | null;
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
  const nbHommes   = membres.filter((m) => m.sexe === "M").length;
  const nbFemmes   = membres.filter((m) => m.sexe === "F").length;
  doc.fontSize(10).font("Helvetica").fillColor(GRIS_L)
    .text(
      `Total : ${membres.length} membres   |   Actifs : ${nbActifs}   |   Inactifs : ${nbInactifs}   |   Hommes : ${nbHommes}   |   Femmes : ${nbFemmes}`,
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
    const code = computeCodeMembre(m.numeroMembre, m.dateAdhesion);
    const civilite = m.sexe === "M" ? "M." : m.sexe === "F" ? "Mme" : "";
    doc.fillColor(NOIR_L).fontSize(8).font("Helvetica");
    doc.text(`${civilite ? civilite + " " : ""}${m.nom} ${m.prenoms}`, cols.nom, ty, { width: 145, lineBreak: false });
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

// ─────────────────────────────────────────────────────────────────────────────
// Rapport de transfert (bon de livraison entrepôt délégué → central)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateRapportTransfert(transfertId: number, cooperativeId: number): Promise<Buffer> {
  const [row] = await db
    .select({
      id:               transfertsStockTable.id,
      numeroTransfert:  transfertsStockTable.numeroTransfert,
      statut:           transfertsStockTable.statut,
      poidsDepart_kg:   transfertsStockTable.poidsDepart_kg,
      poidsArrivee_kg:  transfertsStockTable.poidsArrivee_kg,
      ecartKg:          transfertsStockTable.ecartKg,
      motifEcart:       transfertsStockTable.motifEcart,
      nombreSacs:       transfertsStockTable.nombreSacs,
      nombreSacsArrivee: transfertsStockTable.nombreSacsArrivee,
      typeVehicule:     transfertsStockTable.typeVehicule,
      immatriculation:  transfertsStockTable.immatriculation,
      nomChauffeur:     transfertsStockTable.nomChauffeur,
      telephoneChauffeur: transfertsStockTable.telephoneChauffeur,
      dateDepart:       transfertsStockTable.dateDepart,
      dateArrivee:      transfertsStockTable.dateArrivee,
      datePrevue:       transfertsStockTable.datePrevue,
      notes:            transfertsStockTable.notes,
      entrepotNom:      entrepotsDeleguesTable.nom,
      entrepotZone:     entrepotsDeleguesTable.zoneNom,
      entrepotAdresse:  entrepotsDeleguesTable.adresse,
      delegueNom:       usersTable.nom,
      deleguePrenoms:   usersTable.prenoms,
      delegueTel:       usersTable.telephone,
    })
    .from(transfertsStockTable)
    .leftJoin(entrepotsDeleguesTable, eq(entrepotsDeleguesTable.id, transfertsStockTable.entrepotSourceId))
    .leftJoin(usersTable, eq(usersTable.id, transfertsStockTable.delegueId))
    .where(eq(transfertsStockTable.id, transfertId))
    .limit(1);

  if (!row) throw new Error("Transfert introuvable");
  if (row.id === null) throw new Error("Transfert non trouvé");

  const { doc, endPromise } = makePdfDoc();
  await drawHeader(doc, cooperativeId, {
    titre_document: "Bon de Transfert",
    reference: row.numeroTransfert,
  });

  const W = PAGE_W - MARGIN * 2;
  let y = doc.y + 4;

  // ── Bandeau statut ────────────────────────────────────────────────────────
  const STATUT_CFG: Record<string, { label: string; bg: string; fg: string }> = {
    planifie:  { label: "PLANIFIÉ",   bg: "#dbeafe", fg: "#1d4ed8" },
    en_cours:  { label: "EN TRANSIT", bg: "#fef3c7", fg: "#b45309" },
    arrive:    { label: "ARRIVÉ",     bg: "#ede9fe", fg: "#6d28d9" },
    confirme:  { label: "CONFIRMÉ",   bg: "#dcfce7", fg: "#15803d" },
    litige:    { label: "LITIGE",     bg: "#fee2e2", fg: "#b91c1c" },
  };
  const sc = STATUT_CFG[row.statut ?? "planifie"] ?? STATUT_CFG["planifie"]!;
  doc.rect(MARGIN, y, W, 20).fill(sc.bg);
  doc.fontSize(9).font("Helvetica-Bold").fillColor(sc.fg)
    .text(`Statut : ${sc.label}`, MARGIN + 8, y + 6, { width: W - 16, lineBreak: false });
  doc.fillColor("black");
  y += 28;

  // ── Bloc entrepôt / délégué ───────────────────────────────────────────────
  const half = (W - 8) / 2;
  doc.rect(MARGIN, y, half, 60).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("ENTREPÔT SOURCE", MARGIN + 8, y + 5);
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text(row.entrepotNom ?? "—", MARGIN + 8, y + 14);
  doc.fontSize(8).fillColor("black").font("Helvetica");
  if (row.entrepotZone) doc.text(`Zone : ${row.entrepotZone}`, MARGIN + 8, y + 26);
  if (row.entrepotAdresse) doc.text(row.entrepotAdresse, MARGIN + 8, y + 36, { width: half - 16, lineBreak: false });

  const col2 = MARGIN + half + 8;
  doc.rect(col2, y, half, 60).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("DÉLÉGUÉ RESPONSABLE", col2 + 8, y + 5);
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold")
    .text(`${row.deleguePrenoms ?? ""} ${row.delegueNom ?? "—"}`.trim(), col2 + 8, y + 14);
  doc.fontSize(8).fillColor("black").font("Helvetica");
  if (row.delegueTel) doc.text(`Tél : ${row.delegueTel}`, col2 + 8, y + 26);
  y += 68;

  // ── Section poids & sacs ──────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("QUANTITÉS", MARGIN, y);
  y += 14;

  const poidsRows: Array<[string, string, string, string]> = [
    ["", "DÉPART (expédié)", "ARRIVÉE (reçu)", "ÉCART"],
  ];
  const dep_kg  = row.poidsDepart_kg  ? parseFloat(row.poidsDepart_kg).toFixed(2)  : "—";
  const arr_kg  = row.poidsArrivee_kg ? parseFloat(row.poidsArrivee_kg).toFixed(2) : "—";
  const ec_kg   = row.ecartKg         ? parseFloat(row.ecartKg).toFixed(2)         : "—";
  const ec_num  = row.ecartKg         ? parseFloat(row.ecartKg)                    : null;
  const dep_sac = row.nombreSacs      != null ? String(row.nombreSacs)             : "—";
  const arr_sac = row.nombreSacsArrivee != null ? String(row.nombreSacsArrivee)    : "—";
  const ec_sac  = row.nombreSacs != null && row.nombreSacsArrivee != null
    ? String(row.nombreSacs - row.nombreSacsArrivee)
    : "—";

  const cws = [120, 120, 120, 135];
  const cxs = [MARGIN, MARGIN + 120, MARGIN + 240, MARGIN + 360];

  // En-tête tableau
  doc.rect(MARGIN, y, W, 16).fill(VERT);
  (["", "DÉPART (expédié)", "ARRIVÉE (reçu)", "ÉCART"] as string[]).forEach((h, i) => {
    doc.fontSize(7).font("Helvetica-Bold").fillColor("white")
      .text(h, (cxs[i] ?? MARGIN) + 4, y + 5, { width: (cws[i] ?? 100) - 8, lineBreak: false });
  });
  doc.fillColor("black");
  y += 16;

  const quantRows: Array<[string, string, string, string]> = [
    ["Poids (kg)", `${dep_kg} kg`, `${arr_kg} kg`, `${ec_kg !== "—" ? `${ec_num! > 0 ? "-" : "+"}${Math.abs(ec_num ?? 0).toFixed(2)}` : "—"} kg`],
    ["Nombre de sacs", dep_sac, arr_sac, ec_sac !== "—" ? `${parseInt(ec_sac) > 0 ? "-" : "+"}${Math.abs(parseInt(ec_sac))} sac${Math.abs(parseInt(ec_sac)) > 1 ? "s" : ""}` : "—"],
  ];

  for (const [ri, cols] of quantRows.entries()) {
    const bg = ri % 2 === 0 ? "#f9fafb" : "white";
    doc.rect(MARGIN, y, W, 18).fill(bg);
    doc.rect(MARGIN, y, W, 18).stroke("#e5e7eb");
    cols.forEach((cell, ci) => {
      const isEcart = ci === 3 && cell !== "— kg" && cell !== "— sac" && cell !== "—";
      const ecartBad = isEcart && (cell.startsWith("-"));
      doc.fontSize(8)
        .font(ci === 0 ? "Helvetica-Bold" : "Helvetica")
        .fillColor(ecartBad ? "#b91c1c" : ci === 0 ? GRIS : "black")
        .text(cell, (cxs[ci] ?? MARGIN) + 4, y + 5, { width: (cws[ci] ?? 100) - 8, lineBreak: false, align: ci > 0 ? "center" : "left" });
    });
    doc.fillColor("black");
    y += 18;
  }

  // Motif écart si présent
  if (row.motifEcart) {
    y += 6;
    doc.rect(MARGIN, y, W, 18).fill("#fef2f2");
    doc.fontSize(8).font("Helvetica-Bold").fillColor("#b91c1c")
      .text("Motif d'écart :", MARGIN + 8, y + 5, { width: 120, lineBreak: false });
    doc.font("Helvetica").fillColor("black")
      .text(row.motifEcart, MARGIN + 128, y + 5, { width: W - 136, lineBreak: false });
    y += 24;
  }

  y += 12;

  // ── Section transport ──────────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("TRANSPORT", MARGIN, y);
  y += 14;

  const transportRows: Array<[string, string]> = [
    ["Type de véhicule", row.typeVehicule ?? "—"],
    ["Immatriculation",  row.immatriculation ?? "—"],
    ["Chauffeur",        row.nomChauffeur ?? "—"],
    ["Téléphone",        row.telephoneChauffeur ?? "—"],
  ];
  for (const [ri, [label, val]] of transportRows.entries()) {
    if (ri % 2 === 0) doc.rect(MARGIN, y, W, 16).fill("#f9fafb");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(label, MARGIN + 6, y + 4, { width: 150, lineBreak: false });
    doc.fontSize(8).fillColor("black").font("Helvetica-Bold").text(val, MARGIN + 160, y + 4, { width: W - 166, lineBreak: false });
    y += 16;
  }
  y += 12;

  // ── Section dates ──────────────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("DATES", MARGIN, y);
  y += 14;

  const dateRows: Array<[string, string]> = [
    ["Date prévue",  row.datePrevue  ? formaterDate(row.datePrevue)  : "—"],
    ["Date départ",  row.dateDepart  ? formaterDate(row.dateDepart)  : "—"],
    ["Date arrivée", row.dateArrivee ? formaterDate(row.dateArrivee) : "—"],
  ];
  for (const [ri, [label, val]] of dateRows.entries()) {
    if (ri % 2 === 0) doc.rect(MARGIN, y, W, 16).fill("#f9fafb");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(label, MARGIN + 6, y + 4, { width: 150, lineBreak: false });
    doc.fontSize(8).fillColor("black").font("Helvetica-Bold").text(val, MARGIN + 160, y + 4, { width: W - 166, lineBreak: false });
    y += 16;
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (row.notes) {
    y += 12;
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("OBSERVATIONS", MARGIN, y);
    y += 12;
    doc.rect(MARGIN, y, W, 40).fill("#f9fafb").stroke("#e5e7eb");
    doc.fontSize(8).fillColor("black").font("Helvetica")
      .text(row.notes, MARGIN + 8, y + 6, { width: W - 16 });
    y += 48;
  }

  // ── Zone signatures ────────────────────────────────────────────────────────
  y = Math.max(y + 20, 660);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text("Délégué expéditeur", MARGIN, y, { width: 160, align: "center" })
    .text("Réceptionnaire (central)", MARGIN + 180, y, { width: 160, align: "center" })
    .text("Directeur / PCA", MARGIN + 360, y, { width: 130, align: "center" });
  y += 12;
  doc.rect(MARGIN,       y, 160, 40).stroke("#d1d5db");
  doc.rect(MARGIN + 180, y, 160, 40).stroke("#d1d5db");
  doc.rect(MARGIN + 360, y, 130, 40).stroke("#d1d5db");

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rapport EUDR — Expédition au port
// Structure par lot, miroir de l'export EUDR de la page Traçabilité + QR code
// ─────────────────────────────────────────────────────────────────────────────

function centroidePolygone(poly: [number, number][] | null | undefined): { lat: number; lng: number } | null {
  if (!poly || poly.length === 0) return null;
  const lat = poly.reduce((s, p) => s + (p[0] ?? 0), 0) / poly.length;
  const lng = poly.reduce((s, p) => s + (p[1] ?? 0), 0) / poly.length;
  return { lat, lng };
}

async function fetchQrImageBuffer(data: string, size = 100): Promise<Buffer | null> {
  try {
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=png&data=${encodeURIComponent(data)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

const EUDR_STATUT_LABELS: Record<string, string> = {
  conforme:      "Conforme",
  non_conforme:  "Non conforme",
  non_verifie:   "Non verifie",
};
const EUDR_RISQUE_LABELS: Record<string, string> = {
  faible:   "Faible",
  moyen:    "Moyen",
  eleve:    "Eleve",
  inconnu:  "Inconnu",
};

export async function generateRapportEudrPdf(expeditionId: number, cooperativeId: number): Promise<Buffer> {
  // ── 1. Expedition ─────────────────────────────────────────────────────────
  const [exp] = await db
    .select()
    .from(expeditionsTable)
    .where(and(eq(expeditionsTable.id, expeditionId), eq(expeditionsTable.cooperativeId, cooperativeId)));
  if (!exp) throw new Error("Expédition introuvable");

  // ── 2. Lots distincts de l'expédition ─────────────────────────────────────
  const expLotRows = await db
    .select({
      lotId:        expeditionLotsTable.lotId,
      qrCodeLot:    lotsTable.qrCodeLot,
      poidsTotalKg: lotsTable.poidsTotalKg,
      dateCreation: lotsTable.dateCreation,
    })
    .from(expeditionLotsTable)
    .innerJoin(lotsTable, eq(lotsTable.id, expeditionLotsTable.lotId))
    .where(eq(expeditionLotsTable.expeditionId, expeditionId));

  // Dédupliquer les lots
  const lotsMap = new Map<number, { lotId: number; qrCodeLot: string; poidsTotalKg: string; dateCreation: Date }>();
  for (const r of expLotRows) {
    if (r.lotId && !lotsMap.has(r.lotId)) {
      lotsMap.set(r.lotId, {
        lotId:        r.lotId,
        qrCodeLot:    r.qrCodeLot,
        poidsTotalKg: r.poidsTotalKg,
        dateCreation: r.dateCreation,
      });
    }
  }
  const lotsDistincts = Array.from(lotsMap.values());

  // ── 3. Pour chaque lot : producteurs + données EUDR + QR code ─────────────
  const portailBase =
    process.env.PORTAIL_BASE_URL?.replace(/\/$/, "") ||
    (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]?.trim()}` : null) ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);

  type Producteur = {
    nom: string;
    poidsKg: number;
    superficieHa: string | null;
    gpsStr: string;
    hasGps: boolean;
    eudrStatut: string;
    eudrStatutLabel: string;
    eudrRisque: string;
    eudrRisqueLabel: string;
    eudrConforme: boolean;
  };
  type LotRendu = {
    lotId: number;
    qrCodeLot: string;
    poidsTotalKg: number;
    dateCreation: Date;
    lotPublicUrl: string;
    qrBuf: Buffer | null;
    producteurs: Producteur[];
    nbConformes: number;
    nbNonVerifies: number;
    nbNonConformes: number;
  };

  const lotsRendus: LotRendu[] = await Promise.all(lotsDistincts.map(async (lot) => {
    const lotPublicUrl = portailBase
      ? `${portailBase}/portail/lots/${lot.qrCodeLot}`
      : lot.qrCodeLot;

    // Producteurs du lot via lotLivraisonsTable → livraisonsTable → membresTable
    const livraisonsLot = await db
      .select({
        membreId:     livraisonsTable.membreId,
        membreNom:    membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        poidsKg:      livraisonsTable.poidsKg,
      })
      .from(lotLivraisonsTable)
      .innerJoin(livraisonsTable, eq(livraisonsTable.id, lotLivraisonsTable.livraisonId))
      .innerJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
      .where(eq(lotLivraisonsTable.lotId, lot.lotId));

    // Agréger poids par membre
    const poidsParMembre = new Map<number, { nom: string; poidsKg: number }>();
    for (const l of livraisonsLot) {
      if (!l.membreId) continue;
      const prev = poidsParMembre.get(l.membreId) ?? { nom: `${l.membreNom ?? ""} ${l.membrePrenoms ?? ""}`.trim(), poidsKg: 0 };
      prev.poidsKg += l.poidsKg ? parseFloat(String(l.poidsKg)) : 0;
      poidsParMembre.set(l.membreId, prev);
    }

    const membreIds = Array.from(poidsParMembre.keys());

    // Données EUDR depuis parcellesTable (première parcelle active par membre)
    const parcelles = membreIds.length
      ? await db
          .select({
            membreId:             parcellesTable.membreId,
            coordonneesPoint:     parcellesTable.coordonneesPoint,
            polygone:             parcellesTable.polygone,
            superficieDeclareeHa: parcellesTable.superficieDeclareeHa,
            superficieCalculeeHa: parcellesTable.superficieCalculeeHa,
            eudrStatut:           parcellesTable.eudrStatut,
            eudrRisqueDeforestation: parcellesTable.eudrRisqueDeforestation,
          })
          .from(parcellesTable)
          .where(and(
            inArray(parcellesTable.membreId, membreIds),
            eq(parcellesTable.actif, true),
          ))
      : [];

    // Map membreId → données parcelle EUDR
    const parcelleParMembre = new Map<number, typeof parcelles[number]>();
    for (const p of parcelles) {
      if (!parcelleParMembre.has(p.membreId)) parcelleParMembre.set(p.membreId, p);
    }

    // Construire la liste des producteurs
    const producteurs: Producteur[] = Array.from(poidsParMembre.entries()).map(([membreId, info]) => {
      const p = parcelleParMembre.get(membreId);
      const point =
        (p?.coordonneesPoint as { lat: number; lng: number } | null | undefined) ??
        centroidePolygone(p?.polygone as [number, number][] | null | undefined);
      const hasGps = !!(point?.lat && point?.lng);
      const gpsStr = hasGps
        ? `${point!.lat.toFixed(5)}, ${point!.lng.toFixed(5)}`
        : "—";
      const superficieHa = p
        ? (p.superficieCalculeeHa ?? p.superficieDeclareeHa ?? null)
        : null;
      const eudrStatut = p?.eudrStatut ?? "non_verifie";
      const eudrRisque = p?.eudrRisqueDeforestation ?? "inconnu";
      return {
        nom:             info.nom || "—",
        poidsKg:         info.poidsKg,
        superficieHa,
        gpsStr,
        hasGps,
        eudrStatut,
        eudrStatutLabel: EUDR_STATUT_LABELS[eudrStatut] ?? eudrStatut,
        eudrRisque,
        eudrRisqueLabel: EUDR_RISQUE_LABELS[eudrRisque] ?? eudrRisque,
        eudrConforme:    eudrStatut === "conforme" && hasGps,
      };
    });

    const nbConformes    = producteurs.filter(p => p.eudrConforme).length;
    const nbNonVerifies  = producteurs.filter(p => p.eudrStatut === "non_verifie").length;
    const nbNonConformes = producteurs.filter(p => p.eudrStatut === "non_conforme").length;

    const [qrBuf] = await Promise.all([fetchQrImageBuffer(lotPublicUrl, 100)]);

    return {
      lotId:        lot.lotId,
      qrCodeLot:    lot.qrCodeLot,
      poidsTotalKg: parseFloat(lot.poidsTotalKg),
      dateCreation: lot.dateCreation,
      lotPublicUrl,
      qrBuf,
      producteurs,
      nbConformes,
      nbNonVerifies,
      nbNonConformes,
    };
  }));

  // ── 4. Métriques globales ─────────────────────────────────────────────────
  const totalLots         = lotsRendus.length;
  const totalProducteurs  = lotsRendus.reduce((s, l) => s + l.producteurs.length, 0);
  const poidsTotal        = lotsRendus.reduce((s, l) => s + l.poidsTotalKg, 0);
  const totalConformes    = lotsRendus.reduce((s, l) => s + l.nbConformes, 0);
  const totalNonVerifies  = lotsRendus.reduce((s, l) => s + l.nbNonVerifies, 0);
  const conforme          = totalLots > 0 && lotsRendus.every(l => l.nbNonConformes === 0 && l.nbNonVerifies === 0);

  if (totalProducteurs === 0) {
    throw new Error("EUDR non applicable : les lots de cette expédition proviennent de fournisseurs externes et ne contiennent pas de producteurs membres.");
  }

  // ── 5. Rendu PDF ──────────────────────────────────────────────────────────
  const { doc, endPromise } = makePdfDoc();
  const W    = PAGE_W - 2 * MARGIN;
  const BLEU = "#1e40af";
  const AMBRE = "#b45309";

  await drawHeader(doc, cooperativeId, {
    titre_document: "RAPPORT EUDR",
    reference: exp.numeroExpedition,
  });
  let y = doc.y;

  // ── Bandeau conformité ────────────────────────────────────────────────────
  const confBg  = conforme ? "#f0fdf4" : "#fff7ed";
  const confBdr = conforme ? "#bbf7d0" : "#fde68a";
  const confClr = conforme ? VERT     : AMBRE;
  doc.rect(MARGIN, y, W, 30).fill(confBg).stroke(confBdr);
  doc.fontSize(10).fillColor(confClr).font("Helvetica-Bold")
    .text(
      conforme
        ? "Expedition CONFORME EUDR — Tracabilite complete"
        : "Tracabilite incomplete — certains producteurs manquent de donnees EUDR",
      MARGIN + 12, y + 10, { width: W - 24, lineBreak: false },
    );
  y += 40;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = [
    { label: "Lots",              val: String(totalLots) },
    { label: "Producteurs",       val: String(totalProducteurs) },
    { label: "Poids total",       val: `${formaterNombre(poidsTotal)} kg` },
    { label: "Conformes EUDR",    val: `${totalConformes} / ${totalProducteurs}` },
    { label: "Non verifies",      val: `${totalNonVerifies} / ${totalProducteurs}` },
    { label: "Port destination",  val: exp.port },
  ];
  const kpiW = (W - 10) / 3;
  kpis.forEach((kpi, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    if (col === 0 && row > 0) y += 44;
    const kx = MARGIN + col * (kpiW + 5);
    doc.rect(kx, y, kpiW, 36).fill("#f8fafc").stroke("#e2e8f0");
    doc.fontSize(7.5).fillColor(GRIS).font("Helvetica")
      .text(kpi.label, kx + 8, y + 6, { width: kpiW - 16, lineBreak: false });
    doc.fontSize(12).fillColor(BLEU).font("Helvetica-Bold")
      .text(kpi.val, kx + 8, y + 18, { width: kpiW - 16, lineBreak: false });
  });
  y += 50;

  // ── Infos expédition ──────────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("INFORMATIONS EXPEDITION", MARGIN, y);
  y += 14;
  const infoFields: Array<[string, string]> = [
    ["N Expedition",    exp.numeroExpedition],
    ["Date depart",     exp.dateDepart ? formaterDate(exp.dateDepart.toISOString()) : "—"],
    ["Lieu depart",     exp.lieuDepart ?? "Magasin central"],
    ["Port",            exp.port],
    ["Contrat export",  exp.numeroContratExport ?? "—"],
    ["Exportateur",     exp.exportateurNom ?? "—"],
    ["Certificat phyto", exp.certificatPhytoNumero ?? "Non renseigne"],
    ["Pays origine",    "Cote d'Ivoire"],
  ];
  for (const [ri, [label, val]] of infoFields.entries()) {
    if (ri % 2 === 0) doc.rect(MARGIN, y, W, 16).fill("#f8fafc");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica")
      .text(label, MARGIN + 6, y + 4, { width: 160, lineBreak: false });
    doc.fontSize(8).fillColor("black").font("Helvetica-Bold")
      .text(val, MARGIN + 170, y + 4, { width: W - 176, lineBreak: false });
    y += 16;
  }
  y += 16;

  // ── Section par lot ───────────────────────────────────────────────────────
  const QR_SIZE  = 85;
  const INFO_W   = W - QR_SIZE - 12;
  const pCols    = [130, 55, 62, 95, 75, 60];
  const pHeaders = ["Producteur", "Poids kg", "Sup. ha", "GPS (lat, lng)", "EUDR Statut", "Risque"];

  for (const lot of lotsRendus) {
    const sectionH = 18 + Math.max(QR_SIZE + 4, 40) + 18 + lot.producteurs.length * 15 + 20;
    if (y + sectionH > 780 && y > 150) {
      doc.addPage();
      await drawHeader(doc, cooperativeId, { titre_document: "RAPPORT EUDR (suite)", reference: exp.numeroExpedition });
      y = doc.y;
    }

    // En-tête du lot
    doc.rect(MARGIN, y, W, 18).fill(VERT);
    doc.fontSize(9).fillColor("white").font("Helvetica-Bold")
      .text(`LOT #${lot.lotId}`, MARGIN + 6, y + 5, { width: 80, lineBreak: false });
    doc.fontSize(8).fillColor("white").font("Helvetica")
      .text(
        `${formaterNombre(lot.poidsTotalKg)} kg  |  ${lot.producteurs.length} producteur(s)  |  ${formaterDate(lot.dateCreation)}`,
        MARGIN + 90, y + 6, { width: W - 190, lineBreak: false },
      );
    // Statut conformité du lot
    const lotOk = lot.nbNonConformes === 0 && lot.nbNonVerifies === 0;
    doc.fontSize(7.5).fillColor(lotOk ? "#86efac" : "#fde68a").font("Helvetica-Bold")
      .text(lotOk ? "CONFORME" : "INCOMPLET", MARGIN + W - 75, y + 5, { width: 70, align: "right", lineBreak: false });
    y += 22;

    // Zone QR + infos lot
    const infoY = y;
    // Infos lot (à gauche)
    doc.fontSize(7).fillColor(GRIS).font("Helvetica")
      .text("Code QR / URL traçabilité :", MARGIN, y + 2, { width: INFO_W, lineBreak: false });
    y += 11;
    doc.fontSize(6).fillColor("#374151").font("Helvetica")
      .text(lot.lotPublicUrl, MARGIN, y, { width: INFO_W });
    y = Math.max(y + 10, infoY + 18);
    doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("UUID lot :", MARGIN, y, { lineBreak: false });
    y += 9;
    doc.fontSize(6).fillColor("#6b7280").font("Helvetica").text(lot.qrCodeLot, MARGIN, y, { width: INFO_W });
    y += 10;
    // Conformité lot
    const conformStr = lot.nbNonConformes > 0
      ? `${lot.nbNonConformes} non conforme(s)`
      : lot.nbNonVerifies > 0
      ? `${lot.nbNonVerifies} non verifie(s)`
      : `${lot.nbConformes}/${lot.producteurs.length} conformes`;
    const conformColor = lot.nbNonConformes > 0 ? "#dc2626" : lot.nbNonVerifies > 0 ? AMBRE : "#16a34a";
    doc.fontSize(8).fillColor(conformColor).font("Helvetica-Bold")
      .text(conformStr, MARGIN, y, { width: INFO_W, lineBreak: false });
    y += 14;

    // QR code image (à droite de la zone)
    if (lot.qrBuf) {
      const qrX = MARGIN + W - QR_SIZE;
      const qrY = infoY;
      try {
        doc.image(lot.qrBuf, qrX, qrY, { width: QR_SIZE, height: QR_SIZE });
        doc.rect(qrX, qrY, QR_SIZE, QR_SIZE).stroke("#d1d5db");
      } catch { /* skip si image invalide */ }
    }

    // S'assurer qu'on est en dessous du QR code
    y = Math.max(y, infoY + QR_SIZE + 6);

    // Tableau producteurs
    ligneTableau(doc, pHeaders, pCols, MARGIN, y, BLEU);
    y += 16;

    if (lot.producteurs.length === 0) {
      doc.fontSize(8).fillColor(GRIS).font("Helvetica")
        .text("Aucun producteur trouvé pour ce lot.", MARGIN + 4, y + 3);
      y += 14;
    }

    for (const [pidx, p] of lot.producteurs.entries()) {
      if (y > 760) {
        doc.addPage();
        await drawHeader(doc, cooperativeId, { titre_document: "RAPPORT EUDR (suite)", reference: exp.numeroExpedition });
        y = doc.y;
        ligneTableau(doc, pHeaders, pCols, MARGIN, y, BLEU);
        y += 16;
      }

      if (pidx % 2 === 0) doc.rect(MARGIN, y, pCols.reduce((a, b) => a + b, 0), 14).fill("#f8fafc");

      const eudrColor = p.eudrStatut === "conforme" ? "#16a34a"
        : p.eudrStatut === "non_conforme" ? "#dc2626"
        : "#92400e";

      let cx = MARGIN;
      const cellsData = [
        { val: p.nom,             w: pCols[0]!, color: "black" },
        { val: p.poidsKg > 0 ? formaterNombre(p.poidsKg) : "—", w: pCols[1]!, color: "black" },
        { val: p.superficieHa ? `${parseFloat(String(p.superficieHa)).toFixed(2)}` : "—", w: pCols[2]!, color: "black" },
        { val: p.gpsStr,          w: pCols[3]!, color: p.hasGps ? "#1e40af" : GRIS },
        { val: p.eudrStatutLabel, w: pCols[4]!, color: eudrColor },
        { val: p.eudrRisqueLabel, w: pCols[5]!, color: "black" },
      ];
      for (const cell of cellsData) {
        doc.fontSize(7).fillColor(cell.color).font(cell.color !== "black" && cell.color !== GRIS ? "Helvetica-Bold" : "Helvetica")
          .text(cell.val, cx + 3, y + 4, { width: cell.w - 6, lineBreak: false });
        cx += cell.w;
      }
      doc.fillColor("black");
      y += 14;
    }

    // Ligne total du lot
    const totWLot = pCols.reduce((a, b) => a + b, 0);
    doc.rect(MARGIN, y, totWLot, 14).fill("#e2e8f0");
    doc.fontSize(7.5).fillColor("#374151").font("Helvetica-Bold")
      .text("Total lot", MARGIN + 3, y + 3, { width: pCols[0]! - 6, lineBreak: false });
    doc.text(
      `${formaterNombre(lot.poidsTotalKg)} kg`,
      MARGIN + pCols[0]!, y + 3, { width: pCols[1]! - 6, lineBreak: false },
    );
    y += 20;
  }

  if (lotsRendus.length === 0) {
    doc.fontSize(9).fillColor(GRIS).font("Helvetica")
      .text("Aucun lot rattaché à cette expédition.", MARGIN, y + 4);
    y += 20;
  }

  // ── Déclaration de conformité ─────────────────────────────────────────────
  if (y + 70 > 780) { doc.addPage(); await drawHeader(doc, cooperativeId, { titre_document: "RAPPORT EUDR", reference: exp.numeroExpedition }); y = doc.y; }
  y += 8;
  doc.rect(MARGIN, y, W, conforme ? 52 : 60).fill(confBg).stroke(confBdr);
  doc.fontSize(9).fillColor(confClr).font("Helvetica-Bold")
    .text("DECLARATION DE CONFORMITE EUDR — Reglement (UE) 2023/1115", MARGIN + 10, y + 8, { width: W - 20, lineBreak: false });
  if (conforme) {
    doc.fontSize(8).fillColor("black").font("Helvetica")
      .text(
        `Le soussigne certifie que l'ensemble des ${totalProducteurs} producteurs composant les ${totalLots} lot(s) `
        + `de l'expedition ${exp.numeroExpedition} ont ete verifies conformes EUDR : parcelles geolocalisees `
        + `et statuts de deforestation conformes au Reglement (UE) 2023/1115.`,
        MARGIN + 10, y + 22, { width: W - 20 },
      );
  } else {
    doc.fontSize(8).fillColor("#92400e").font("Helvetica")
      .text(
        `Tracabilite incomplete : ${totalNonVerifies} producteur(s) non verifie(s), `
        + `${lotsRendus.reduce((s, l) => s + l.nbNonConformes, 0)} non conforme(s). `
        + `Cette expedition ne peut pas etre declaree conforme au Reglement (UE) 2023/1115 en l'etat.`,
        MARGIN + 10, y + 22, { width: W - 20 },
      );
  }
  y += conforme ? 60 : 68;

  // ── Zone signatures ───────────────────────────────────────────────────────
  y = Math.max(y + 16, 680);
  const sigW2 = Math.floor(W / 2) - 10;
  for (const [label, sx] of [["Responsable qualite / Tracabilite", MARGIN], ["Directeur de la cooperative", MARGIN + sigW2 + 20]] as [string, number][]) {
    doc.fontSize(8).fillColor(GRIS).font("Helvetica")
      .text(label, sx, y, { width: sigW2, align: "center", lineBreak: false });
    doc.rect(sx, y + 14, sigW2, 44).stroke("#d1d5db");
    doc.fontSize(7).fillColor("#aaaaaa").font("Helvetica")
      .text("Nom, Fonction & Signature", sx, y + 50, { width: sigW2, align: "center", lineBreak: false });
  }

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bon de livraison — Expédition au port
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBonLivraison(expeditionId: number, cooperativeId: number): Promise<Buffer> {
  const [exp] = await db
    .select()
    .from(expeditionsTable)
    .where(and(eq(expeditionsTable.id, expeditionId), eq(expeditionsTable.cooperativeId, cooperativeId)));
  if (!exp) throw new Error("Expédition introuvable");

  const lots = await db
    .select({
      lotId:           expeditionLotsTable.lotId,
      poidsKg:         expeditionLotsTable.poidsKg,
      nombreSacs:      expeditionLotsTable.nombreSacs,
      certificatEudr:  expeditionLotsTable.certificatEudr,
      parcelleOrigine: expeditionLotsTable.parcelleOrigine,
      membreNom:       membresTable.nom,
      membrePrenoms:   membresTable.prenoms,
    })
    .from(expeditionLotsTable)
    .leftJoin(membresTable, eq(expeditionLotsTable.membreId, membresTable.id))
    .where(eq(expeditionLotsTable.expeditionId, expeditionId));

  const { doc, endPromise } = makePdfDoc();
  const W = PAGE_W - 2 * MARGIN;

  await drawHeader(doc, cooperativeId, {
    titre_document: "BON DE LIVRAISON",
    reference: exp.numeroExpedition,
  });

  let y = doc.y;

  // ── Bandeau récapitulatif ─────────────────────────────────────────────────
  doc.rect(MARGIN, y, W, 28).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(`Expédition  ${exp.numeroExpedition}`, MARGIN + 10, y + 8, { width: W / 2 - 10, lineBreak: false });
  const dateDepart = exp.dateDepart
    ? new Date(exp.dateDepart).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  doc.fontSize(9).fillColor(GRIS).font("Helvetica")
    .text(`Date départ : ${dateDepart}`, MARGIN + W / 2, y + 10, { width: W / 2 - 10, align: "right", lineBreak: false });
  y += 36;

  // ── Deux colonnes : Expéditeur | Destinataire ─────────────────────────────
  const colW = (W - 16) / 2;

  doc.rect(MARGIN, y, colW, 80).fill("#f9fafb").stroke("#e5e7eb");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica-Bold")
    .text("EXPÉDITEUR", MARGIN + 8, y + 6, { width: colW - 16, lineBreak: false });
  doc.fontSize(9).fillColor("black").font("Helvetica")
    .text(exp.lieuDepart ?? "Magasin central", MARGIN + 8, y + 20, { width: colW - 16 });

  const col2X = MARGIN + colW + 16;
  doc.rect(col2X, y, colW, 80).fill("#f9fafb").stroke("#e5e7eb");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica-Bold")
    .text("DESTINATAIRE", col2X + 8, y + 6, { width: colW - 16, lineBreak: false });
  doc.fontSize(9).fillColor("black").font("Helvetica")
    .text(`Port de ${exp.port}`, col2X + 8, y + 20, { width: colW - 16 });
  if (exp.exportateurNom) {
    doc.text(`Exportateur : ${exp.exportateurNom}`, col2X + 8, y + 34, { width: colW - 16 });
  }
  if (exp.entrepotDestination) {
    doc.text(`Entrepôt : ${exp.entrepotDestination}`, col2X + 8, y + 48, { width: colW - 16 });
  }
  if (exp.numeroContratExport) {
    doc.fontSize(8).fillColor(GRIS)
      .text(`Contrat export : ${exp.numeroContratExport}`, col2X + 8, y + 62, { width: colW - 16 });
  }
  y += 88;

  // ── Transport ──────────────────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("TRANSPORT", MARGIN, y);
  y += 14;

  const transportFields: Array<[string, string]> = [
    ["Immatriculation",  exp.immatriculation ?? "—"],
    ["Chauffeur",        exp.nomChauffeur ?? "—"],
    ["Téléphone",        exp.telephoneChauffeur ?? "—"],
    ["Transporteur",     exp.transporteur ?? (exp.typeVehicule === "propre" ? "Flotte propre" : "—")],
    ["Bon de transport", exp.numeroBonTransport ?? "—"],
  ];
  for (const [ri, [label, val]] of transportFields.entries()) {
    if (ri % 2 === 0) doc.rect(MARGIN, y, W, 16).fill("#f9fafb");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica")
      .text(label, MARGIN + 6, y + 4, { width: 160, lineBreak: false });
    doc.fontSize(8).fillColor("black").font("Helvetica-Bold")
      .text(val, MARGIN + 170, y + 4, { width: W - 176, lineBreak: false });
    y += 16;
  }
  y += 10;

  // ── Certificat phytosanitaire ──────────────────────────────────────────────
  if (exp.certificatPhytoNumero) {
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("CERTIFICAT PHYTOSANITAIRE", MARGIN, y);
    y += 14;
    const phytoFields: Array<[string, string]> = [
      ["Numéro",      exp.certificatPhytoNumero],
      ["Organisme",   exp.certificatPhytoOrganisme ?? "DPVC"],
      ["Émission",    exp.certificatPhytoDateEmission ? formaterDate(exp.certificatPhytoDateEmission) : "—"],
      ["Expiration",  exp.certificatPhytoDateExpiration ? formaterDate(exp.certificatPhytoDateExpiration) : "—"],
    ];
    for (const [ri, [label, val]] of phytoFields.entries()) {
      if (ri % 2 === 0) doc.rect(MARGIN, y, W, 16).fill("#ecfdf5");
      doc.fontSize(8).fillColor(GRIS).font("Helvetica")
        .text(label, MARGIN + 6, y + 4, { width: 160, lineBreak: false });
      doc.fontSize(8).fillColor("black").font("Helvetica-Bold")
        .text(val, MARGIN + 170, y + 4, { width: W - 176, lineBreak: false });
      y += 16;
    }
    y += 10;
  }

  // ── Lots cacao ─────────────────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("DÉTAIL DES LOTS CACAO", MARGIN, y);
  y += 14;

  const lCols = [50, 155, 80, 120, 90];
  const lHeaders = ["Lot #", "Producteur", "Poids (kg)", "Cert. EUDR", "Parcelle"];
  ligneTableau(doc, lHeaders, lCols, MARGIN, y, VERT);
  y += 18;

  let totalPoidsLots = 0;
  let totalSacs = 0;

  for (const [idx, l] of lots.entries()) {
    if (y > 720) {
      doc.addPage();
      await drawHeader(doc, cooperativeId, {
        titre_document: "BON DE LIVRAISON (suite)",
        reference: exp.numeroExpedition,
      });
      y = doc.y;
      ligneTableau(doc, lHeaders, lCols, MARGIN, y, VERT);
      y += 18;
    }
    const poids = l.poidsKg ? parseFloat(String(l.poidsKg)) : 0;
    totalPoidsLots += poids;
    totalSacs += l.nombreSacs ?? 0;

    if (idx % 2 === 0) doc.rect(MARGIN, y, lCols.reduce((a, b) => a + b, 0), 16).fill("#f0fdf4");
    ligneTableau(doc, [
      l.lotId ? `#${l.lotId}` : "—",
      l.membreNom ? `${l.membreNom} ${l.membrePrenoms ?? ""}`.trim() : "—",
      poids > 0 ? formaterNombre(poids) : "—",
      l.certificatEudr ?? "—",
      l.parcelleOrigine ?? "—",
    ], lCols, MARGIN, y);
    y += 16;
  }

  if (lots.length === 0) {
    doc.fontSize(8).fillColor(GRIS).font("Helvetica")
      .text("Aucun lot rattaché à cette expédition.", MARGIN, y + 4);
    y += 20;
  }

  // ── Ligne totaux ───────────────────────────────────────────────────────────
  y += 4;
  doc.rect(MARGIN, y, lCols.reduce((a, b) => a + b, 0), 18).fill(VERT);
  doc.fontSize(9).fillColor("white").font("Helvetica-Bold")
    .text("TOTAL", MARGIN + 6, y + 5, { width: lCols[0]! + lCols[1]! - 6, lineBreak: false });
  doc.text(
    totalPoidsLots > 0 ? formaterNombre(totalPoidsLots) + " kg" : "—",
    MARGIN + lCols[0]! + lCols[1]!, y + 5,
    { width: lCols[2]! - 6, lineBreak: false },
  );
  if (exp.nombreSacs || totalSacs > 0) {
    const sacs = exp.nombreSacs ?? totalSacs;
    doc.fontSize(8).fillColor("white").font("Helvetica")
      .text(`${sacs} sac${sacs > 1 ? "s" : ""}`, MARGIN + lCols[0]! + lCols[1]! + lCols[2]!, y + 6, {
        width: lCols[3]! + lCols[4]! - 6,
        lineBreak: false,
      });
  }
  y += 26;

  // ── Récap poids expédition ─────────────────────────────────────────────────
  if (exp.poidsChargeKg) {
    const poidsCharge = parseFloat(String(exp.poidsChargeKg));
    doc.rect(MARGIN, y, W, 22).fill("#fffbeb").stroke("#fde68a");
    doc.fontSize(9).fillColor(OR).font("Helvetica-Bold")
      .text(`Poids total chargé : ${formaterNombre(poidsCharge)} kg`, MARGIN + 10, y + 6, {
        width: W - 20, lineBreak: false,
      });
    y += 30;
  }

  // ── Zone signatures ────────────────────────────────────────────────────────
  y = Math.max(y + 20, 660);
  const sigW = Math.floor(W / 3) - 10;
  const sigLabels = ["Responsable expédition", "Chauffeur (lu et approuvé)", "Réceptionnaire port"];
  sigLabels.forEach((label, i) => {
    const sx = MARGIN + i * (sigW + 15);
    doc.fontSize(8).fillColor(GRIS).font("Helvetica")
      .text(label, sx, y, { width: sigW, align: "center", lineBreak: false });
    doc.rect(sx, y + 14, sigW, 42).stroke("#d1d5db");
    doc.fontSize(7).fillColor("#aaaaaa").font("Helvetica")
      .text("Nom & Signature", sx, y + 48, { width: sigW, align: "center", lineBreak: false });
  });

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fiche EUDR individuelle — un seul lot
// ─────────────────────────────────────────────────────────────────────────────
export async function generateLotEudrPdf(lotId: number, cooperativeId: number): Promise<Buffer> {
  const [lot] = await db
    .select()
    .from(lotsTable)
    .where(and(eq(lotsTable.id, lotId), eq(lotsTable.cooperativeId, cooperativeId)));
  if (!lot) throw new Error("Lot introuvable");

  const livraisonLinks = await db
    .select({ livraisonId: lotLivraisonsTable.livraisonId })
    .from(lotLivraisonsTable)
    .where(eq(lotLivraisonsTable.lotId, lotId));
  const livraisonIds = livraisonLinks.map((l) => l.livraisonId);

  const livraisons = livraisonIds.length
    ? await db
        .select({
          membreId:   livraisonsTable.membreId,
          poidsKg:       livraisonsTable.poidsKg,
          produitBrutKg: livraisonsTable.produitBrutKg,
        })
        .from(livraisonsTable)
        .where(inArray(livraisonsTable.id, livraisonIds))
    : [];

  const membreIds = [...new Set(livraisons.map((l) => l.membreId).filter((id): id is number => id !== null))];

  const membres = membreIds.length
    ? await db
        .select({ id: membresTable.id, nom: membresTable.nom, prenoms: membresTable.prenoms })
        .from(membresTable)
        .where(inArray(membresTable.id, membreIds))
    : [];

  const parcelles = membreIds.length
    ? await db
        .select({
          membreId:                parcellesTable.membreId,
          coordonneesPoint:        parcellesTable.coordonneesPoint,
          polygone:                parcellesTable.polygone,
          superficieDeclareeHa:    parcellesTable.superficieDeclareeHa,
          superficieCalculeeHa:    parcellesTable.superficieCalculeeHa,
          eudrStatut:              parcellesTable.eudrStatut,
          eudrRisqueDeforestation: parcellesTable.eudrRisqueDeforestation,
        })
        .from(parcellesTable)
        .where(and(inArray(parcellesTable.membreId, membreIds), eq(parcellesTable.actif, true)))
    : [];

  const poidsParMembre: Record<number, number> = {};
  for (const liv of livraisons) {
    if (!liv.membreId) continue;
    const kg = parseFloat(String(liv.produitBrutKg ?? liv.poidsKg ?? "0"));
    poidsParMembre[liv.membreId] = (poidsParMembre[liv.membreId] ?? 0) + kg;
  }

  const membreMap = new Map(membres.map((m) => [m.id, m]));
  const parcellesParMembre = new Map<number, typeof parcelles[0]>();
  for (const p of parcelles) {
    if (!parcellesParMembre.has(p.membreId)) parcellesParMembre.set(p.membreId, p);
  }

  type ProducteurRow = {
    nom: string; poidsKg: number; superficieHa: string | null;
    gpsStr: string; hasGps: boolean; eudrStatut: string; eudrStatutLabel: string;
    eudrRisque: string; eudrRisqueLabel: string; eudrConforme: boolean;
  };

  const producteurs: ProducteurRow[] = membreIds.map((mid) => {
    const m = membreMap.get(mid);
    const p = parcellesParMembre.get(mid) ?? null;
    const point =
      (p?.coordonneesPoint as { lat: number; lng: number } | null) ??
      centroidePolygone(p?.polygone as [number, number][] | null | undefined);
    const hasGps = Boolean(point?.lat && point?.lng);
    const gpsStr = hasGps ? `${point!.lat.toFixed(5)}, ${point!.lng.toFixed(5)}` : "—";
    const superficieHa = p ? (p.superficieCalculeeHa ?? p.superficieDeclareeHa ?? null) : null;
    const eudrStatut = p?.eudrStatut ?? "non_verifie";
    const eudrRisque = p?.eudrRisqueDeforestation ?? "inconnu";
    return {
      nom:             m ? `${m.nom} ${m.prenoms ?? ""}`.trim() : "—",
      poidsKg:         poidsParMembre[mid] ?? 0,
      superficieHa:    superficieHa != null ? Number(superficieHa).toFixed(2) : null,
      gpsStr, hasGps, eudrStatut,
      eudrStatutLabel: EUDR_STATUT_LABELS[eudrStatut] ?? eudrStatut,
      eudrRisque,
      eudrRisqueLabel: EUDR_RISQUE_LABELS[eudrRisque] ?? eudrRisque,
      eudrConforme:    eudrStatut === "conforme" && hasGps,
    };
  });

  const nbConformes    = producteurs.filter((p) => p.eudrConforme).length;
  const nbNonVerifies  = producteurs.filter((p) => p.eudrStatut === "non_verifie").length;
  const nbNonConformes = producteurs.filter((p) => p.eudrStatut === "non_conforme").length;
  const conforme       = producteurs.length > 0 && nbNonConformes === 0 && nbNonVerifies === 0;

  const portailBase =
    process.env.PORTAIL_BASE_URL?.replace(/\/$/, "") ||
    (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]?.trim()}` : null) ||
    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null);
  const lotPublicUrl = portailBase
    ? `${portailBase}/portail/lots/${lot.qrCodeLot}`
    : lot.qrCodeLot;
  const qrBuf = await fetchQrImageBuffer(lotPublicUrl, 100);

  const { doc, endPromise } = makePdfDoc();
  const W     = PAGE_W - 2 * MARGIN;
  const BLEU  = "#1e40af";
  const AMBRE = "#b45309";
  const ROUGE = "#dc2626";

  await drawHeader(doc, cooperativeId, {
    titre_document: "FICHE EUDR — LOT",
    reference: lot.qrCodeLot,
  });
  let y = doc.y;

  // ── Bandeau conformité ─────────────────────────────────────────────────────
  const confBg  = conforme ? "#f0fdf4" : "#fff7ed";
  const confBdr = conforme ? "#bbf7d0" : "#fde68a";
  const confClr = conforme ? VERT     : AMBRE;
  doc.rect(MARGIN, y, W, 30).fill(confBg).stroke(confBdr);
  doc.fontSize(10).fillColor(confClr).font("Helvetica-Bold")
    .text(
      conforme
        ? "Lot CONFORME EUDR — Tracabilite complete"
        : "Tracabilite incomplete — certains producteurs manquent de donnees EUDR",
      MARGIN + 12, y + 10, { width: W - 24, lineBreak: false },
    );
  y += 40;

  // ── Infos lot + QR ─────────────────────────────────────────────────────────
  const QR_SIZE  = 82;
  const infoW    = W - QR_SIZE - 14;

  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("INFORMATIONS LOT", MARGIN, y);
  y += 14;

  const infoFields: Array<[string, string]> = [
    ["Ref. lot",        lot.qrCodeLot],
    ["Date creation",   formaterDate(lot.dateCreation!)],
    ["Poids total",     `${formaterNombre(parseFloat(String(lot.poidsTotalKg)))} kg`],
    ["Entrepot",        lot.entrepot ?? "—"],
    ["Statut",          lot.statut],
    ["Producteurs",     String(membreIds.length)],
    ["Conformes EUDR",  `${nbConformes} / ${membreIds.length}`],
    ["Non verifies",    `${nbNonVerifies} / ${membreIds.length}`],
    ["Pays origine",    "Cote d'Ivoire"],
    ["Produit",         "Cacao"],
  ];
  const infoStartY = y;
  for (const [ri, [label, val]] of infoFields.entries()) {
    if (ri % 2 === 0) doc.rect(MARGIN, y, infoW, 16).fill("#f8fafc");
    doc.fontSize(8).fillColor(GRIS).font("Helvetica")
      .text(label, MARGIN + 6, y + 4, { width: 150, lineBreak: false });
    doc.fontSize(8).fillColor("black").font("Helvetica-Bold")
      .text(val, MARGIN + 160, y + 4, { width: infoW - 166, lineBreak: false });
    y += 16;
  }

  const qrX = MARGIN + infoW + 14;
  if (qrBuf) {
    doc.image(qrBuf, qrX, infoStartY, { width: QR_SIZE, height: QR_SIZE });
  }
  doc.fontSize(6).fillColor(GRIS).font("Helvetica")
    .text("Portail public — scannez pour verifier", qrX, infoStartY + QR_SIZE + 3,
      { width: QR_SIZE, align: "center", lineBreak: false });

  y += 20;

  // ── Tableau producteurs ────────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold")
    .text("PRODUCTEURS & DONNEES EUDR", MARGIN, y);
  y += 14;

  const cols: Array<{ label: string; w: number }> = [
    { label: "Producteur",   w: 110 },
    { label: "Poids (kg)",   w: 60  },
    { label: "Superf. (ha)", w: 62  },
    { label: "GPS",          w: 104 },
    { label: "Statut EUDR",  w: 74  },
    { label: "Risque",       w: 74  },
  ];

  let cx = MARGIN;
  doc.rect(MARGIN, y, W, 18).fill(VERT);
  for (const col of cols) {
    doc.fontSize(8).fillColor("white").font("Helvetica-Bold")
      .text(col.label, cx + 4, y + 5, { width: col.w - 8, lineBreak: false });
    cx += col.w;
  }
  y += 18;

  for (const [ri, p] of producteurs.entries()) {
    const rowH = 18;
    if (ri % 2 === 0) doc.rect(MARGIN, y, W, rowH).fill("#f8fafc");
    const statutColor = p.eudrStatut === "conforme" ? VERT
      : p.eudrStatut === "non_conforme" ? ROUGE : GRIS;
    const vals = [p.nom, formaterNombre(p.poidsKg), p.superficieHa ?? "—", p.gpsStr, p.eudrStatutLabel, p.eudrRisqueLabel];
    cx = MARGIN;
    for (const [ci, col] of cols.entries()) {
      const color = ci === 4 ? statutColor : "black";
      doc.fontSize(7.5).fillColor(color).font(ci === 0 ? "Helvetica-Bold" : "Helvetica")
        .text(vals[ci]!, cx + 4, y + 5, { width: col.w - 8, lineBreak: false });
      cx += col.w;
    }
    y += rowH;
  }

  if (producteurs.length === 0) {
    doc.fontSize(8).fillColor(GRIS).font("Helvetica")
      .text("Aucun producteur lie a ce lot.", MARGIN + 6, y + 6);
    y += 24;
  }
  y += 20;

  // ── KPIs conformité ───────────────────────────────────────────────────────
  const kpis = [
    { label: "Conformes EUDR",    val: String(nbConformes),    color: VERT  },
    { label: "Non conformes",     val: String(nbNonConformes), color: ROUGE },
    { label: "Non verifies",      val: String(nbNonVerifies),  color: AMBRE },
    { label: "Total producteurs", val: String(membreIds.length), color: BLEU },
  ];
  const kpiW = (W - 15) / 4;
  kpis.forEach((kpi, i) => {
    const kx = MARGIN + i * (kpiW + 5);
    doc.rect(kx, y, kpiW, 36).fill("#f8fafc").stroke("#e2e8f0");
    doc.fontSize(7).fillColor(GRIS).font("Helvetica")
      .text(kpi.label, kx + 6, y + 5, { width: kpiW - 12, lineBreak: false, align: "center" });
    doc.fontSize(16).fillColor(kpi.color).font("Helvetica-Bold")
      .text(kpi.val, kx + 6, y + 14, { width: kpiW - 12, lineBreak: false, align: "center" });
  });
  y += 46;

  // ── Déclaration EUDR ──────────────────────────────────────────────────────
  doc.rect(MARGIN, y, W, 1).fill("#e2e8f0");
  y += 10;
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(
      "Le responsable de la cooperative atteste que les donnees EUDR ci-dessus sont exactes " +
      "et que ce lot de cacao est issu de parcelles n'ayant pas contribue a la deforestation " +
      "ou a la degradation des forets apres le 31 decembre 2020, conformement au " +
      "Reglement (UE) 2023/1115 relatif aux produits associes a la deforestation.",
      MARGIN, y, { width: W },
    );

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constat de réception port
// ─────────────────────────────────────────────────────────────────────────────
const SEUIL_ACCEPTABLE_PCT = 0.5;
const SEUIL_LITIGE_PCT     = 2.0;

function niveauEcart(taux: number): "acceptable" | "a_justifier" | "litige" {
  if (taux <= SEUIL_ACCEPTABLE_PCT) return "acceptable";
  if (taux <= SEUIL_LITIGE_PCT)     return "a_justifier";
  return "litige";
}

function couleurNiveau(niveau: "acceptable" | "a_justifier" | "litige"): { bg: string; border: string; text: string } {
  if (niveau === "acceptable")  return { bg: "#f0fdf4", border: "#86efac", text: "#15803d" };
  if (niveau === "a_justifier") return { bg: "#fff7ed", border: "#fdba74", text: "#c2410c" };
  return                               { bg: "#fef2f2", border: "#fca5a5", text: "#b91c1c" };
}

function labelNiveau(niveau: "acceptable" | "a_justifier" | "litige"): string {
  if (niveau === "acceptable")  return "RECEPTION CONFORME — Ecart dans les tolerances";
  if (niveau === "a_justifier") return "ECART A JUSTIFIER — Ecart entre 0,5 % et 2 %";
  return                               "LITIGE — Ecart superieur a 2 % (direction notifiee)";
}

const MOTIF_LABELS: Record<string, string> = {
  perte_transport:   "Perte pendant le transport",
  vol:               "Vol",
  humidite:          "Humidite / Sechage",
  erreur_pesee:      "Erreur de pesee",
  conditionnement:   "Erreur de conditionnement",
  autre:             "Autre",
};

export async function generateConstatReception(expeditionId: number, cooperativeId: number): Promise<Buffer> {
  const [exp] = await db
    .select()
    .from(expeditionsTable)
    .where(and(eq(expeditionsTable.id, expeditionId), eq(expeditionsTable.cooperativeId, cooperativeId)));
  if (!exp) throw new Error("Expedition introuvable");

  if (!exp.poidsRecuPortKg) throw new Error("La reception n'a pas encore ete confirmee pour cette expedition");

  const { doc, endPromise } = makePdfDoc();
  const W = PAGE_W - 2 * MARGIN;

  await drawHeader(doc, cooperativeId, {
    titre_document: "CONSTAT DE RECEPTION",
    reference: exp.numeroExpedition ?? `EXP-${expeditionId}`,
  });

  let y = doc.y + 4;

  // ── Calculs écarts ─────────────────────────────────────────────────────────
  const poidsCharge = parseFloat(String(exp.poidsChargeKg ?? "0"));
  const poidsRecu   = parseFloat(String(exp.poidsRecuPortKg ?? "0"));
  const ecartPoids  = poidsCharge - poidsRecu;
  const tauxPoidsPct = poidsCharge > 0 ? Math.abs(ecartPoids) / poidsCharge * 100 : 0;

  const sacsCharges = exp.nombreSacs ?? null;
  const sacsRecus   = exp.nombreSacsRecuPort ?? null;
  const ecartSacs   = sacsCharges !== null && sacsRecus !== null ? sacsCharges - sacsRecus : null;
  const tauxSacsPct = ecartSacs !== null && sacsCharges !== null && sacsCharges > 0
    ? Math.abs(ecartSacs) / sacsCharges * 100 : null;

  const niveauPoids = niveauEcart(tauxPoidsPct);
  const niveauSacs  = tauxSacsPct !== null ? niveauEcart(tauxSacsPct) : null;
  const niveauGlobal: "acceptable" | "a_justifier" | "litige" =
    niveauSacs === "litige" || niveauPoids === "litige" ? "litige"
    : niveauSacs === "a_justifier" || niveauPoids === "a_justifier" ? "a_justifier"
    : "acceptable";

  const couleur = couleurNiveau(niveauGlobal);

  // ── Bandeau statut ────────────────────────────────────────────────────────
  doc.rect(MARGIN, y, W, 22).fill(couleur.bg).stroke(couleur.border);
  doc.fontSize(8.5).fillColor(couleur.text).font("Helvetica-Bold")
    .text(labelNiveau(niveauGlobal), MARGIN + 10, y + 7, { width: W - 20, lineBreak: false });
  y += 30;

  // ── Deux colonnes : Expédition | Réception ────────────────────────────────
  const colW = (W - 12) / 2;

  // Col gauche : infos expédition
  doc.rect(MARGIN, y, colW, 90).fill("#f9fafb").stroke("#e5e7eb");
  doc.fontSize(7.5).fillColor(GRIS).font("Helvetica-Bold")
    .text("EXPEDITION", MARGIN + 8, y + 7);
  const dateDepart = exp.dateDepart
    ? new Date(exp.dateDepart).toLocaleDateString("fr-FR") : "—";
  const lignesExp: Array<[string, string]> = [
    ["N° Expedition",  exp.numeroExpedition ?? `EXP-${expeditionId}`],
    ["Date depart",    dateDepart],
    ["Lieu depart",    exp.lieuDepart ?? "—"],
    ["Port destination", exp.port ?? "—"],
    ["Exportateur",    exp.exportateurNom ?? "—"],
  ];
  let ly = y + 20;
  for (const [label, val] of lignesExp) {
    doc.fontSize(7.5).fillColor(GRIS).font("Helvetica")
      .text(`${label} :`, MARGIN + 8, ly, { width: colW / 2 - 4, lineBreak: false });
    doc.fontSize(7.5).fillColor("black").font("Helvetica-Bold")
      .text(val, MARGIN + colW / 2 + 4, ly, { width: colW / 2 - 12, lineBreak: false });
    ly += 12;
  }

  // Col droite : infos réception
  const col2X = MARGIN + colW + 12;
  doc.rect(col2X, y, colW, 90).fill("#f9fafb").stroke("#e5e7eb");
  doc.fontSize(7.5).fillColor(GRIS).font("Helvetica-Bold")
    .text("RECEPTION PORT", col2X + 8, y + 7);
  const dateArrivee = exp.dateArriveePort
    ? new Date(exp.dateArriveePort).toLocaleDateString("fr-FR") : "—";
  const dateGen = formaterDateHeure(new Date());
  const lignesRec: Array<[string, string]> = [
    ["Date arrivee port", dateArrivee],
    ["N° Recepisse",      exp.numeroRecepissePort ?? "—"],
    ["Receptionnaire",    exp.nomReceptionnaire ?? "—"],
    ["Date constat",      dateGen],
  ];
  let ly2 = y + 20;
  for (const [label, val] of lignesRec) {
    doc.fontSize(7.5).fillColor(GRIS).font("Helvetica")
      .text(`${label} :`, col2X + 8, ly2, { width: colW / 2 - 4, lineBreak: false });
    doc.fontSize(7.5).fillColor("black").font("Helvetica-Bold")
      .text(val, col2X + colW / 2 + 4, ly2, { width: colW / 2 - 12, lineBreak: false });
    ly2 += 12;
  }
  y += 98;

  // ── Tableau comparatif Chargé / Reçu / Écart ──────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold")
    .text("COMPARATIF MARCHANDISE", MARGIN, y);
  y += 14;

  const colsW = [W * 0.34, W * 0.22, W * 0.22, W * 0.22];
  // En-tête tableau
  ligneTableau(doc, ["Mesure", "Charge au depart", "Recu au port", "Ecart"], colsW, MARGIN, y, VERT);
  y += 18;

  // Ligne poids
  const ecartPoidsStr = `${ecartPoids > 0 ? "-" : "+"}${formaterNombre(Math.abs(ecartPoids))} kg (${tauxPoidsPct.toFixed(2)}%)`;
  const fondPoids = niveauPoids === "acceptable" ? "#f0fdf4" : niveauPoids === "a_justifier" ? "#fff7ed" : "#fef2f2";
  doc.rect(MARGIN, y, W, 16).fill(fondPoids);
  ligneTableau(doc, [
    "Poids (kg)",
    `${formaterNombre(poidsCharge)} kg`,
    `${formaterNombre(poidsRecu)} kg`,
    ecartPoidsStr,
  ], colsW, MARGIN, y);
  y += 18;

  // Ligne sacs (si disponible)
  if (sacsCharges !== null && sacsRecus !== null && ecartSacs !== null) {
    const ecartSacsStr = `${ecartSacs > 0 ? "-" : "+"}${Math.abs(ecartSacs)} sac(s) (${(tauxSacsPct ?? 0).toFixed(2)}%)`;
    const fondSacs = niveauSacs === "acceptable" ? "#f0fdf4" : niveauSacs === "a_justifier" ? "#fff7ed" : "#fef2f2";
    doc.rect(MARGIN, y, W, 16).fill(fondSacs);
    ligneTableau(doc, [
      "Nombre de sacs",
      `${formaterNombre(sacsCharges)} sacs`,
      `${formaterNombre(sacsRecus)} sacs`,
      ecartSacsStr,
    ], colsW, MARGIN, y);
    y += 18;
  }
  y += 10;

  // ── Motif d'écart ─────────────────────────────────────────────────────────
  if (exp.motifEcart) {
    const motifLabel = MOTIF_LABELS[exp.motifEcart] ?? exp.motifEcart;
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("MOTIF DE L'ECART", MARGIN, y);
    y += 14;
    doc.rect(MARGIN, y, W, 24).fill("#fffbeb").stroke("#fde68a");
    doc.fontSize(9).fillColor("#92400e").font("Helvetica")
      .text(motifLabel, MARGIN + 10, y + 8, { width: W - 20, lineBreak: false });
    y += 32;
  }
  y += 4;

  // ── Zone de signatures ────────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("SIGNATURES", MARGIN, y);
  y += 14;

  const sigW = (W - 24) / 3;
  const sigH  = 80;
  const sigLabels = ["Receptionnaire", "Gerant de la cooperative", "Visa douanes / exportateur"];

  for (let i = 0; i < 3; i++) {
    const sx = MARGIN + i * (sigW + 12);
    doc.rect(sx, y, sigW, sigH).fill("#f9fafb").stroke("#d1d5db");
    doc.fontSize(7.5).fillColor(GRIS).font("Helvetica-Bold")
      .text(sigLabels[i]!, sx + 6, y + 6, { width: sigW - 12, align: "center", lineBreak: false });
    doc.fontSize(7).fillColor("#9ca3af").font("Helvetica")
      .text("Nom :", sx + 6, y + 22, { width: sigW - 12, lineBreak: false });
    // Ligne de signature
    doc.moveTo(sx + 6, y + 60).lineTo(sx + sigW - 6, y + 60)
      .strokeColor("#9ca3af").lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor("#9ca3af").font("Helvetica")
      .text("Signature et cachet", sx + 6, y + 63, { width: sigW - 12, align: "center", lineBreak: false });
  }
  y += sigH + 14;

  // ── Mention légale ─────────────────────────────────────────────────────────
  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Oblique")
    .text(
      "Ce constat est etabli contradictoirement et vaut preuve de reception pour les besoins " +
      "de la comptabilite-matiere et du suivi des expeditions. Tout ecart superieur a 2 % fait l'objet " +
      "d'une procedure de litige conformement au contrat de transport.",
      MARGIN, y, { width: W },
    );

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ── Constat de refoulement ────────────────────────────────────────────────────
export async function generateConstatRefoulement(refusId: number, cooperativeId: number): Promise<Buffer> {
  const [refus] = await db
    .select({
      refus: traitementsRefusTable,
      expedition: {
        id: expeditionsTable.id,
        numeroExpedition: expeditionsTable.numeroExpedition,
        port: expeditionsTable.port,
        poidsChargeKg: expeditionsTable.poidsChargeKg,
        poidsRecuPortKg: expeditionsTable.poidsRecuPortKg,
        nombreSacs: expeditionsTable.nombreSacs,
        nombreSacsRecuPort: expeditionsTable.nombreSacsRecuPort,
        dateArriveePort: expeditionsTable.dateArriveePort,
        nomReceptionnaire: expeditionsTable.nomReceptionnaire,
        numeroRecepissePort: expeditionsTable.numeroRecepissePort,
      },
    })
    .from(traitementsRefusTable)
    .leftJoin(expeditionsTable, eq(traitementsRefusTable.expeditionId, expeditionsTable.id))
    .where(and(
      eq(traitementsRefusTable.id, refusId),
      eq(traitementsRefusTable.cooperativeId, cooperativeId),
    ))
    .limit(1);

  if (!refus) throw new Error("Refus introuvable");

  const r = refus.refus;
  const exp = refus.expedition;

  const { doc, endPromise } = makePdfDoc();
  const W = PAGE_W - 2 * MARGIN;

  await drawHeader(doc, cooperativeId, {
    titre_document: "CONSTAT DE REFOULEMENT",
    reference: exp?.numeroExpedition ? `REFOUL-${refusId} / ${exp.numeroExpedition}` : `REFOUL-${refusId}`,
  });

  let y = doc.y + 4;

  // ── Bandeau statut ─────────────────────────────────────────────────────────
  const estTraite = r.statut === "traite";
  const bandeauBg  = estTraite ? "#f0fdf4" : "#fff7ed";
  const bandeauBrd = estTraite ? "#86efac" : "#fde68a";
  const bandeauTxt = estTraite ? "#166534" : "#92400e";
  const bandeauMsg = estTraite ? "TRAITE" : "EN ATTENTE DE TRAITEMENT";
  doc.rect(MARGIN, y, W, 22).fill(bandeauBg).stroke(bandeauBrd);
  doc.fontSize(8.5).fillColor(bandeauTxt).font("Helvetica-Bold")
    .text(`STOCK REFOULE — ${bandeauMsg}`, MARGIN + 10, y + 7, { width: W - 20, lineBreak: false });
  y += 30;

  // ── Deux colonnes : Expédition | Refoulement ──────────────────────────────
  const colW = (W - 12) / 2;

  const dateRefus  = r.dateRefus ? new Date(r.dateRefus).toLocaleDateString("fr-FR") : "—";
  const dateGen    = formaterDateHeure(new Date());

  // Col gauche : infos expédition
  doc.rect(MARGIN, y, colW, 90).fill("#f9fafb").stroke("#e5e7eb");
  doc.fontSize(7.5).fillColor(GRIS).font("Helvetica-Bold")
    .text("EXPEDITION", MARGIN + 8, y + 7);
  const lignesExp: Array<[string, string]> = [
    ["N° Expedition",  exp?.numeroExpedition ?? "—"],
    ["Port d'arrivee", exp?.port ?? "—"],
    ["Receptionnaire", exp?.nomReceptionnaire ?? "—"],
    ["N° Recepisse",   exp?.numeroRecepissePort ?? "—"],
    ["Source",         r.sourceType === "reception_port" ? "Reception port" : "Vente exportateur"],
  ];
  let ly = y + 20;
  for (const [label, val] of lignesExp) {
    doc.fontSize(7.5).fillColor(GRIS).font("Helvetica")
      .text(`${label} :`, MARGIN + 8, ly, { width: colW / 2 - 4, lineBreak: false });
    doc.fontSize(7.5).fillColor("black").font("Helvetica-Bold")
      .text(val, MARGIN + colW / 2 + 4, ly, { width: colW / 2 - 12, lineBreak: false });
    ly += 12;
  }

  // Col droite : infos refoulement
  const col2X = MARGIN + colW + 12;
  doc.rect(col2X, y, colW, 90).fill("#fff7ed").stroke("#fed7aa");
  doc.fontSize(7.5).fillColor("#9a3412").font("Helvetica-Bold")
    .text("REFOULEMENT", col2X + 8, y + 7);
  const lignesRef: Array<[string, string]> = [
    ["Date du refus",       dateRefus],
    ["Poids refoule",       `${formaterNombre(parseFloat(String(r.poidsRefuleKg ?? "0")))} kg`],
    ["Sacs refoules",       r.nombreSacsRefoules !== null ? String(r.nombreSacsRefoules) : "—"],
    ["Motif",               r.motifRefus ?? "—"],
    ["Date constat",        dateGen],
  ];
  let ly2 = y + 20;
  for (const [label, val] of lignesRef) {
    doc.fontSize(7.5).fillColor(GRIS).font("Helvetica")
      .text(`${label} :`, col2X + 8, ly2, { width: colW / 2 - 4, lineBreak: false });
    doc.fontSize(7.5).fillColor("black").font("Helvetica-Bold")
      .text(val, col2X + colW / 2 + 4, ly2, { width: colW / 2 - 12, lineBreak: false });
    ly2 += 12;
  }
  y += 98;

  // ── Tableau comparatif Marchandise ────────────────────────────────────────
  if (exp?.poidsChargeKg && exp?.poidsRecuPortKg) {
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold")
      .text("BILAN MARCHANDISE", MARGIN, y);
    y += 14;

    const poidsCharge  = parseFloat(String(exp.poidsChargeKg));
    const poidsRecu    = parseFloat(String(exp.poidsRecuPortKg));
    const poidsRefule  = parseFloat(String(r.poidsRefuleKg ?? "0"));
    const poidsAccepte = poidsRecu - poidsRefule;

    const colsW = [W * 0.40, W * 0.20, W * 0.20, W * 0.20];
    ligneTableau(doc, ["Mesure", "Charge", "Recu au port", "Accepte", "Refoule"].slice(0, 4), colsW, MARGIN, y, VERT);
    y += 18;

    // Ligne poids
    ligneTableau(doc, [
      "Poids (kg)",
      `${formaterNombre(poidsCharge)} kg`,
      `${formaterNombre(poidsRecu)} kg`,
      `${formaterNombre(poidsAccepte)} kg`,
    ], colsW, MARGIN, y);
    y += 18;

    // Ligne refoulé
    doc.rect(MARGIN, y, W, 16).fill("#fff7ed");
    ligneTableau(doc, [
      "Dont refoule",
      "—",
      "—",
      `${formaterNombre(poidsRefule)} kg`,
    ], colsW, MARGIN, y);
    y += 26;
  }

  // ── Motif du refus ────────────────────────────────────────────────────────
  if (r.motifRefus) {
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("MOTIF DU REFOULEMENT", MARGIN, y);
    y += 14;
    doc.rect(MARGIN, y, W, 28).fill("#fff7ed").stroke("#fed7aa");
    doc.fontSize(9).fillColor("#9a3412").font("Helvetica")
      .text(r.motifRefus, MARGIN + 10, y + 10, { width: W - 20 });
    y += 36;
  }
  y += 4;

  // ── Décision (si traitée) ─────────────────────────────────────────────────
  if (estTraite && r.decision) {
    const DECISION_FR: Record<string, string> = {
      retour_stock: "Retour en stock",
      declassement: "Déclassement qualité",
      autre_acheteur: "Vente à un autre acheteur",
      perte: "Perte constatée",
    };
    doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("DECISION PRISE", MARGIN, y);
    y += 14;
    doc.rect(MARGIN, y, W, 24).fill("#f0fdf4").stroke("#86efac");
    doc.fontSize(9).fillColor("#166534").font("Helvetica-Bold")
      .text(DECISION_FR[r.decision] ?? r.decision, MARGIN + 10, y + 8, { width: W - 20, lineBreak: false });
    y += 32;
  }

  // ── Zone de signatures ────────────────────────────────────────────────────
  doc.fontSize(10).fillColor(VERT).font("Helvetica-Bold").text("SIGNATURES", MARGIN, y);
  y += 14;

  const sigW = (W - 12) / 2;
  const sigH  = 80;
  const sigLabels = ["Responsable coopérative", "Réceptionnaire port / exportateur"];

  for (let i = 0; i < 2; i++) {
    const sx = MARGIN + i * (sigW + 12);
    doc.rect(sx, y, sigW, sigH).fill("#f9fafb").stroke("#d1d5db");
    doc.fontSize(7.5).fillColor(GRIS).font("Helvetica-Bold")
      .text(sigLabels[i]!, sx + 6, y + 6, { width: sigW - 12, align: "center", lineBreak: false });
    doc.fontSize(7).fillColor("#9ca3af").font("Helvetica")
      .text("Nom :", sx + 6, y + 22, { width: sigW - 12, lineBreak: false });
    doc.moveTo(sx + 6, y + 60).lineTo(sx + sigW - 6, y + 60)
      .strokeColor("#9ca3af").lineWidth(0.5).stroke();
    doc.fontSize(7).fillColor("#9ca3af").font("Helvetica")
      .text("Signature et cachet", sx + 6, y + 63, { width: sigW - 12, align: "center", lineBreak: false });
  }
  y += sigH + 14;

  // ── Mention légale ────────────────────────────────────────────────────────
  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Oblique")
    .text(
      "Ce constat de refoulement est etabli par la cooperative et les parties concernees. " +
      "Il retrace la quantite de marchandise refusee lors de la reception au port et servira " +
      "de base pour le traitement du stock refoule conformement aux procedures internes.",
      MARGIN, y, { width: W },
    );

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bilan OHADA — état financier téléchargeable
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBilanOHADA(cooperativeId: number, exercice: number): Promise<Buffer> {
  const rows = await db.execute(sql`
    SELECT
      p.numero_compte AS "numeroCompte",
      p.libelle,
      p.type,
      (
        COALESCE(SUM(CASE WHEN e.compte_debit  = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN e.compte_credit = p.numero_compte THEN e.montant_fcfa ELSE 0 END), 0)
      )::int AS "solde"
    FROM plan_comptable p
    LEFT JOIN ecritures_comptables e
      ON (e.compte_debit = p.numero_compte OR e.compte_credit = p.numero_compte)
      AND e.cooperative_id = ${cooperativeId}
      AND e.exercice = ${exercice}
    WHERE p.cooperative_id = ${cooperativeId}
    GROUP BY p.id, p.numero_compte, p.libelle, p.type
    ORDER BY p.numero_compte
  `);

  const lignes = rows.rows as Array<{ numeroCompte: string; libelle: string; type: string; solde: number }>;
  const actif  = lignes.filter(l => l.type === "actif"  && l.solde > 0).map(l => ({ compte: l.numeroCompte, libelle: l.libelle, montant: l.solde }));
  const passif = lignes.filter(l => l.type === "passif" && l.solde < 0).map(l => ({ compte: l.numeroCompte, libelle: l.libelle, montant: Math.abs(l.solde) }));
  const produitsNet   = lignes.filter(l => l.type === "produit").reduce((s, l) => s + Math.abs(l.solde), 0);
  const chargesNet    = lignes.filter(l => l.type === "charge").reduce((s, l) => s + l.solde, 0);
  const resultatNet   = produitsNet - chargesNet;
  if (resultatNet !== 0) passif.push({ compte: "130", libelle: "Résultat de l'exercice", montant: resultatNet });

  const totalActif  = actif.reduce((s, a) => s + a.montant, 0);
  const totalPassif = passif.reduce((s, a) => s + a.montant, 0);

  const { doc, endPromise } = makePdfDoc();
  const W     = PAGE_W - 2 * MARGIN;
  const halfW = (W - 10) / 2;
  const MID   = MARGIN + halfW + 10;
  const ROW_H = 16;
  const colW  = halfW * 0.65;
  const amtW  = halfW * 0.35 - 4;

  await drawHeader(doc, cooperativeId, { titre_document: `Bilan OHADA — Exercice ${exercice}` });
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`Au 31 décembre ${exercice}  —  Unité : FCFA`, MARGIN, doc.y, { width: W, align: "right" });
  doc.moveDown(0.5);

  let y = doc.y;
  doc.rect(MARGIN, y, halfW, ROW_H).fill(VERT);
  doc.rect(MID, y, halfW, ROW_H).fill(OR);
  doc.fontSize(9).fillColor("white").font("Helvetica-Bold")
    .text("ACTIF",  MARGIN + 4, y + 4, { width: halfW - 8, lineBreak: false })
    .text("PASSIF", MID + 4,    y + 4, { width: halfW - 8, lineBreak: false });
  y += ROW_H;

  doc.rect(MARGIN, y, halfW, ROW_H - 2).fill("#f0fdf4");
  doc.rect(MID, y, halfW, ROW_H - 2).fill("#fffbeb");
  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Bold")
    .text("Libellé",  MARGIN + 4,       y + 3, { width: colW - 8, lineBreak: false })
    .text("Montant",  MARGIN + 4 + colW, y + 3, { width: amtW, align: "right", lineBreak: false })
    .text("Libellé",  MID + 4,           y + 3, { width: colW - 8, lineBreak: false })
    .text("Montant",  MID + 4 + colW,    y + 3, { width: amtW, align: "right", lineBreak: false });
  y += ROW_H - 2;

  const maxRows = Math.max(actif.length, passif.length);
  for (let i = 0; i < maxRows; i++) {
    const bg = i % 2 === 0 ? "#f9fafb" : "white";
    doc.rect(MARGIN, y, halfW, ROW_H).fill(bg);
    doc.rect(MID, y, halfW, ROW_H).fill(bg);
    const a = actif[i];
    if (a) {
      doc.fontSize(7).fillColor("black").font("Helvetica")
        .text(`${a.libelle} (${a.compte})`, MARGIN + 4, y + 4, { width: colW - 8, lineBreak: false });
      doc.fontSize(7).fillColor("black").font("Helvetica")
        .text(formaterFCFA(a.montant), MARGIN + 4 + colW, y + 4, { width: amtW, align: "right", lineBreak: false });
    }
    const p = passif[i];
    if (p) {
      doc.fontSize(7).fillColor("black").font("Helvetica")
        .text(`${p.libelle} (${p.compte})`, MID + 4, y + 4, { width: colW - 8, lineBreak: false });
      doc.fontSize(7).fillColor("black").font("Helvetica")
        .text(formaterFCFA(p.montant), MID + 4 + colW, y + 4, { width: amtW, align: "right", lineBreak: false });
    }
    y += ROW_H;
  }

  y += 2;
  doc.rect(MARGIN, y, halfW, ROW_H + 2).fill(VERT);
  doc.rect(MID, y, halfW, ROW_H + 2).fill(OR);
  doc.fontSize(8).fillColor("white").font("Helvetica-Bold")
    .text("TOTAL ACTIF",  MARGIN + 4,       y + 4, { width: colW - 8, lineBreak: false });
  doc.fontSize(8).fillColor("white").font("Helvetica-Bold")
    .text(formaterFCFA(totalActif), MARGIN + 4 + colW, y + 4, { width: amtW, align: "right", lineBreak: false });
  doc.fontSize(8).fillColor("white").font("Helvetica-Bold")
    .text("TOTAL PASSIF", MID + 4,           y + 4, { width: colW - 8, lineBreak: false });
  doc.fontSize(8).fillColor("white").font("Helvetica-Bold")
    .text(formaterFCFA(totalPassif), MID + 4 + colW, y + 4, { width: amtW, align: "right", lineBreak: false });
  y += ROW_H + 2 + 16;

  const delta = Math.abs(totalActif - totalPassif);
  if (delta < 100) {
    doc.fontSize(8).fillColor(VERT).font("Helvetica-Bold").text("Bilan equilibre", MARGIN, y);
  } else {
    doc.fontSize(8).fillColor("#dc2626").font("Helvetica-Bold")
      .text(`Ecart non equilibre : ${formaterFCFA(delta)} — verifier les ecritures comptables.`, MARGIN, y, { width: W });
  }
  y += 24;

  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Oblique")
    .text(
      `Le present bilan est etabli conformement au Systeme Comptable OHADA. ` +
      `Les montants sont exprimes en FCFA. ` +
      `Document genere le ${formaterDateHeure(new Date())} par CoopDigital.`,
      MARGIN, y, { width: W },
    );

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Compte de résultat OHADA — état financier téléchargeable
// ─────────────────────────────────────────────────────────────────────────────
export async function generateCompteResultatOHADA(cooperativeId: number, exercice: number): Promise<Buffer> {
  const rows = await db.execute(sql`
    SELECT
      p.numero_compte AS "numeroCompte",
      p.libelle,
      p.type,
      COALESCE(
        CASE
          WHEN p.type = 'produit' THEN SUM(CASE WHEN e.compte_credit = p.numero_compte THEN e.montant_fcfa ELSE 0 END)
          WHEN p.type = 'charge'  THEN SUM(CASE WHEN e.compte_debit  = p.numero_compte THEN e.montant_fcfa ELSE 0 END)
          ELSE 0
        END, 0
      )::int AS montant
    FROM plan_comptable p
    LEFT JOIN ecritures_comptables e
      ON (e.compte_debit = p.numero_compte OR e.compte_credit = p.numero_compte)
      AND e.cooperative_id = ${cooperativeId}
      AND e.exercice = ${exercice}
    WHERE p.cooperative_id = ${cooperativeId} AND p.type IN ('produit', 'charge')
    GROUP BY p.id, p.numero_compte, p.libelle, p.type
    ORDER BY p.numero_compte
  `);

  const lignes        = rows.rows as Array<{ numeroCompte: string; libelle: string; type: string; montant: number }>;
  const produits      = lignes.filter(l => l.type === "produit");
  const charges       = lignes.filter(l => l.type === "charge");
  const totalProduits = produits.reduce((s, l) => s + l.montant, 0);
  const totalCharges  = charges.reduce((s, l) => s + l.montant, 0);
  const resultatNet   = totalProduits - totalCharges;

  const mensuel = await db.execute(sql`
    SELECT
      EXTRACT(MONTH FROM date_ecriture::date)::int AS mois,
      COALESCE(SUM(CASE WHEN compte_credit = '701' THEN montant_fcfa ELSE 0 END), 0)::int AS "produitsFcfa",
      COALESCE(SUM(CASE WHEN compte_debit IN ('601','621','641','661') THEN montant_fcfa ELSE 0 END), 0)::int AS "chargesFcfa"
    FROM ecritures_comptables
    WHERE cooperative_id = ${cooperativeId} AND exercice = ${exercice}
    GROUP BY mois ORDER BY mois
  `);
  const mensuelMap: Record<number, { p: number; c: number }> = {};
  (mensuel.rows as Array<{ mois: number; produitsFcfa: number; chargesFcfa: number }>).forEach(r => {
    mensuelMap[r.mois] = { p: r.produitsFcfa, c: r.chargesFcfa };
  });

  const { doc, endPromise } = makePdfDoc();
  const W     = PAGE_W - 2 * MARGIN;
  const ROW_H = 16;
  const colW  = W * 0.65;
  const amtW  = W * 0.35 - 4;

  await drawHeader(doc, cooperativeId, { titre_document: `Compte de resultat — Exercice ${exercice}` });
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`Du 1er janvier au 31 decembre ${exercice}  —  Unite : FCFA`, MARGIN, doc.y, { width: W, align: "right" });
  doc.moveDown(0.5);

  let y = doc.y;

  doc.rect(MARGIN, y, W, ROW_H).fill(VERT);
  doc.fontSize(9).fillColor("white").font("Helvetica-Bold").text("PRODUITS", MARGIN + 4, y + 4, { width: W - 8, lineBreak: false });
  y += ROW_H;
  produits.forEach((p, i) => {
    doc.rect(MARGIN, y, W, ROW_H).fill(i % 2 === 0 ? "#f0fdf4" : "white");
    doc.fontSize(7).fillColor("black").font("Helvetica")
      .text(`${p.libelle}  (${p.numeroCompte})`, MARGIN + 4, y + 4, { width: colW - 8, lineBreak: false });
    doc.fontSize(7).fillColor("black").font("Helvetica")
      .text(formaterFCFA(p.montant), MARGIN + 4 + colW, y + 4, { width: amtW, align: "right", lineBreak: false });
    y += ROW_H;
  });
  if (produits.length === 0) {
    doc.fontSize(7).fillColor(GRIS).font("Helvetica-Oblique").text("Aucun produit enregistre sur cet exercice.", MARGIN + 4, y + 4, { width: W - 8 });
    y += ROW_H;
  }
  doc.rect(MARGIN, y, W, ROW_H + 2).fill("#d1fae5");
  doc.fontSize(8).fillColor("#065f46").font("Helvetica-Bold")
    .text("Total Produits", MARGIN + 4, y + 4, { width: colW - 8, lineBreak: false });
  doc.fontSize(8).fillColor("#065f46").font("Helvetica-Bold")
    .text(formaterFCFA(totalProduits), MARGIN + 4 + colW, y + 4, { width: amtW, align: "right", lineBreak: false });
  y += ROW_H + 2 + 10;

  doc.rect(MARGIN, y, W, ROW_H).fill(OR);
  doc.fontSize(9).fillColor("white").font("Helvetica-Bold").text("CHARGES", MARGIN + 4, y + 4, { width: W - 8, lineBreak: false });
  y += ROW_H;
  charges.forEach((c, i) => {
    doc.rect(MARGIN, y, W, ROW_H).fill(i % 2 === 0 ? "#fffbeb" : "white");
    doc.fontSize(7).fillColor("black").font("Helvetica")
      .text(`${c.libelle}  (${c.numeroCompte})`, MARGIN + 4, y + 4, { width: colW - 8, lineBreak: false });
    doc.fontSize(7).fillColor("black").font("Helvetica")
      .text(formaterFCFA(c.montant), MARGIN + 4 + colW, y + 4, { width: amtW, align: "right", lineBreak: false });
    y += ROW_H;
  });
  if (charges.length === 0) {
    doc.fontSize(7).fillColor(GRIS).font("Helvetica-Oblique").text("Aucune charge enregistree sur cet exercice.", MARGIN + 4, y + 4, { width: W - 8 });
    y += ROW_H;
  }
  doc.rect(MARGIN, y, W, ROW_H + 2).fill("#fee2e2");
  doc.fontSize(8).fillColor("#991b1b").font("Helvetica-Bold")
    .text("Total Charges", MARGIN + 4, y + 4, { width: colW - 8, lineBreak: false });
  doc.fontSize(8).fillColor("#991b1b").font("Helvetica-Bold")
    .text(formaterFCFA(totalCharges), MARGIN + 4 + colW, y + 4, { width: amtW, align: "right", lineBreak: false });
  y += ROW_H + 2 + 10;

  const isBene = resultatNet >= 0;
  doc.rect(MARGIN, y, W, ROW_H + 6).fill(isBene ? "#065f46" : "#7f1d1d");
  doc.fontSize(10).fillColor("white").font("Helvetica-Bold")
    .text(`RESULTAT NET ${isBene ? "BENEFICIAIRE" : "DEFICITAIRE"}`, MARGIN + 4, y + 6, { width: colW - 8, lineBreak: false });
  doc.fontSize(10).fillColor("white").font("Helvetica-Bold")
    .text(formaterFCFA(Math.abs(resultatNet)), MARGIN + 4 + colW, y + 6, { width: amtW, align: "right", lineBreak: false });
  y += ROW_H + 6 + 24;

  doc.addPage();
  await drawHeader(doc, cooperativeId, { titre_document: `Ventilation mensuelle — Exercice ${exercice}` });
  doc.moveDown(0.3);

  const moisNoms = ["Janvier","Fevrier","Mars","Avril","Mai","Juin","Juillet","Aout","Septembre","Octobre","Novembre","Decembre"];
  const mCols = [90, 90, 90, 90];
  y = doc.y;
  ligneTableau(doc, ["Mois", "Produits (FCFA)", "Charges (FCFA)", "Resultat (FCFA)"], mCols, MARGIN, y, VERT);
  y += 18;
  for (let m = 1; m <= 12; m++) {
    const d   = mensuelMap[m] ?? { p: 0, c: 0 };
    const res = d.p - d.c;
    if (m % 2 === 0) doc.rect(MARGIN, y, mCols.reduce((a, b) => a + b, 0), ROW_H).fill("#f9fafb");
    doc.fontSize(7).fillColor("black").font("Helvetica")
      .text(moisNoms[m - 1]!, MARGIN + 3, y + 4, { width: mCols[0]! - 6, lineBreak: false })
      .text(formaterFCFA(d.p), MARGIN + mCols[0]! + 3, y + 4, { width: mCols[1]! - 6, lineBreak: false })
      .text(formaterFCFA(d.c), MARGIN + mCols[0]! + mCols[1]! + 3, y + 4, { width: mCols[2]! - 6, lineBreak: false });
    doc.fontSize(7).fillColor(res >= 0 ? "#065f46" : "#991b1b").font(res !== 0 ? "Helvetica-Bold" : "Helvetica")
      .text(formaterFCFA(res), MARGIN + mCols[0]! + mCols[1]! + mCols[2]! + 3, y + 4, { width: mCols[3]! - 6, lineBreak: false });
    y += ROW_H;
  }
  y += 2;
  const sumP = Object.values(mensuelMap).reduce((s, m) => s + m.p, 0);
  const sumC = Object.values(mensuelMap).reduce((s, m) => s + m.c, 0);
  ligneTableau(doc, ["Total annuel", formaterFCFA(sumP), formaterFCFA(sumC), formaterFCFA(sumP - sumC)], mCols, MARGIN, y, OR);
  y += 18 + 24;

  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Oblique")
    .text(
      `Le present compte de resultat est etabli conformement au Systeme Comptable OHADA. ` +
      `Les montants sont exprimes en FCFA. ` +
      `Document genere le ${formaterDateHeure(new Date())} par CoopDigital.`,
      MARGIN, y, { width: W },
    );

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tableau des flux de tresorerie OHADA
// ─────────────────────────────────────────────────────────────────────────────
export async function generateFluxTresoreiriePdf(cooperativeId: number, exercice: number): Promise<Buffer> {
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN compte_debit  = '521' AND source = 'paiement'  THEN montant_fcfa ELSE 0 END), 0)::int AS "encaissementsExportateurs",
      COALESCE(SUM(CASE WHEN compte_debit = '401' AND compte_credit IN ('521','552','571') AND source = 'paiement' THEN montant_fcfa ELSE 0 END), 0)::int AS "paiementsProducteurs",
      COALESCE(SUM(CASE WHEN compte_credit = '521' AND source = 'avance'    THEN montant_fcfa ELSE 0 END), 0)::int AS "avancesOctroyes",
      COALESCE(SUM(CASE WHEN compte_debit  = '521' THEN montant_fcfa ELSE 0 END), 0)::int AS "totalEntrees",
      COALESCE(SUM(CASE WHEN compte_credit = '521' THEN montant_fcfa ELSE 0 END), 0)::int AS "totalSorties"
    FROM ecritures_comptables
    WHERE cooperative_id = ${cooperativeId} AND exercice = ${exercice}
  `);

  const r = rows.rows[0] as {
    encaissementsExportateurs: number;
    paiementsProducteurs: number;
    avancesOctroyes: number;
    totalEntrees: number;
    totalSorties: number;
  };

  const encaissements    = r?.encaissementsExportateurs ?? 0;
  const paiements        = r?.paiementsProducteurs      ?? 0;
  const avances          = r?.avancesOctroyes           ?? 0;
  const totalEntrees     = r?.totalEntrees              ?? 0;
  const totalSorties     = r?.totalSorties              ?? 0;
  const fluxExploitation = encaissements - paiements;
  const fluxFinancement  = -avances;
  const soldeFinal       = totalEntrees - totalSorties;

  const { doc, endPromise } = makePdfDoc();
  const W    = PAGE_W - 2 * MARGIN;
  const ROW_H = 18;
  const COL1  = W * 0.65;

  await drawHeader(doc, cooperativeId, {
    titre_document: `Tableau des flux de tresorerie — Exercice ${exercice}`,
  });
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(`Exercice clos le 31 decembre ${exercice}  —  Unite : FCFA`, MARGIN, doc.y, { width: W, align: "right" });
  doc.moveDown(0.8);

  function sectionTitre(titre: string) {
    const y = doc.y;
    doc.rect(MARGIN, y, W, ROW_H).fill(VERT);
    doc.fontSize(8).fillColor("white").font("Helvetica-Bold")
      .text(titre, MARGIN + 6, y + 5, { width: W - 12, lineBreak: false });
    doc.y = y + ROW_H + 1;
  }

  function ligneDonnee(libelle: string, montant: number, bg: string, bold = false, txtColor = "black") {
    const y = doc.y;
    doc.rect(MARGIN, y, W, ROW_H).fill(bg);
    const font = bold ? "Helvetica-Bold" : "Helvetica";
    doc.fontSize(8).fillColor(txtColor).font(font)
      .text(libelle, MARGIN + 6, y + 5, { width: COL1 - 6, lineBreak: false });
    const txt = montant >= 0 ? formaterFCFA(montant) : `(${formaterFCFA(Math.abs(montant))})`;
    doc.fontSize(8).fillColor(montant < 0 ? "#dc2626" : txtColor).font(font)
      .text(txt, MARGIN + COL1, y + 5, { width: W - COL1 - 6, align: "right", lineBreak: false });
    doc.y = y + ROW_H + 1;
  }

  // En-tête colonnes
  const yH = doc.y;
  doc.rect(MARGIN, yH, W, ROW_H - 4).fill("#f3f4f6");
  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Bold")
    .text("Description", MARGIN + 6, yH + 4, { width: COL1 - 6, lineBreak: false })
    .text("Montant (FCFA)", MARGIN + COL1, yH + 4, { width: W - COL1 - 6, align: "right", lineBreak: false });
  doc.y = yH + ROW_H - 4 + 4;

  // Section I — Exploitation
  sectionTitre("I. FLUX D'EXPLOITATION (activites operationnelles)");
  ligneDonnee("Encaissements sur ventes exportateurs",      encaissements, "#f0fdf4");
  ligneDonnee("(-) Paiements aux producteurs",              -paiements,    "#fef2f2");
  doc.moveDown(0.3);
  ligneDonnee("= Flux net d'exploitation", fluxExploitation, "#dcfce7", true,
    fluxExploitation >= 0 ? VERT : "#dc2626");

  doc.moveDown(0.8);

  // Section II — Financement
  sectionTitre("II. FLUX DE FINANCEMENT");
  ligneDonnee("Avances consenties aux membres (decaissements)", -avances, "#fffbeb");
  doc.moveDown(0.3);
  ligneDonnee("= Flux net de financement", fluxFinancement, "#fef9c3", true,
    fluxFinancement >= 0 ? VERT : "#b45309");

  doc.moveDown(0.8);

  // Section III — Autres
  const autresMvts = soldeFinal - fluxExploitation - fluxFinancement;
  sectionTitre("III. AUTRES MOUVEMENTS (caisse, banque, divers)");
  ligneDonnee("Autres flux de tresorerie nets", autresMvts, "#f9fafb");

  doc.moveDown(1);

  // Solde final
  const ySolde = doc.y;
  const soldeBg = soldeFinal >= 0 ? "#166534" : "#991b1b";
  doc.rect(MARGIN, ySolde, W, ROW_H + 4).fill(soldeBg);
  doc.fontSize(10).fillColor("white").font("Helvetica-Bold")
    .text("SOLDE FINAL DE TRESORERIE", MARGIN + 6, ySolde + 6, { width: COL1 - 6, lineBreak: false })
    .text(
      formaterFCFA(Math.abs(soldeFinal)) + (soldeFinal < 0 ? " (deficit)" : ""),
      MARGIN + COL1, ySolde + 6, { width: W - COL1 - 6, align: "right", lineBreak: false },
    );
  doc.y = ySolde + ROW_H + 4 + 12;

  // Recap numerique
  const yR = doc.y;
  doc.rect(MARGIN, yR, W, 1).fill("#e5e7eb");
  doc.y = yR + 8;
  doc.fontSize(7).fillColor(GRIS).font("Helvetica")
    .text(`Total entrees de fonds  : ${formaterFCFA(totalEntrees)}`, MARGIN, doc.y)
    .text(`Total sorties de fonds  : ${formaterFCFA(totalSorties)}`, MARGIN, doc.y)
    .text(`Variation nette         : ${soldeFinal >= 0 ? "+" : ""}${formaterFCFA(soldeFinal)}`, MARGIN, doc.y);

  doc.moveDown(1);
  doc.fontSize(7).fillColor(GRIS).font("Helvetica-Oblique")
    .text(
      `Le present tableau est etabli conformement au Systeme Comptable OHADA (methode indirecte simplifiee). ` +
      `Les flux sont calcules sur la base des ecritures comptables de l'exercice ${exercice}. ` +
      `Les montants entre parentheses representent des sorties nettes de tresorerie. ` +
      `Document genere le ${formaterDateHeure(new Date())} par CoopDigital.`,
      MARGIN, doc.y, { width: W },
    );

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Relevé PDF des commissions délégué (terrain)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateReleveCommissions(
  delegueId: number,
  cooperativeId: number,
  campagneId?: number,
): Promise<Buffer> {
  // ── Données ──────────────────────────────────────────────────────────────
  const [delegue] = await db
    .select({ nom: usersTable.nom, prenoms: usersTable.prenoms, telephone: usersTable.telephone })
    .from(usersTable)
    .where(eq(usersTable.id, delegueId));
  if (!delegue) throw new Error("Délégué introuvable");

  let campagneLibelle: string | null = null;
  if (campagneId) {
    const [camp] = await db
      .select({ libelle: campagnesTable.libelle })
      .from(campagnesTable)
      .where(eq(campagnesTable.id, campagneId));
    campagneLibelle = camp?.libelle ?? null;
  }

  const whereClause = campagneId
    ? and(
        eq(commissionsDeleguesTable.delegueId, delegueId),
        eq(commissionsDeleguesTable.campagneId, campagneId),
      )
    : eq(commissionsDeleguesTable.delegueId, delegueId);

  const commissions = await db
    .select()
    .from(commissionsDeleguesTable)
    .where(whereClause)
    .orderBy(desc(commissionsDeleguesTable.createdAt));

  // Totaux — seuls en_attente et payé comptent ; annulé est exclu des montants
  let enAttenteTotal = 0;
  let payeTotal = 0;
  let annuleTotal = 0;
  for (const c of commissions) {
    const m = Number(c.montantFcfa ?? 0);
    if (c.statut === "en_attente") enAttenteTotal += m;
    else if (c.statut === "payé") payeTotal += m;
    else if (c.statut === "annulé") annuleTotal += m;
    // statuts inconnus ignorés
  }
  const grandTotal = enAttenteTotal + payeTotal;

  // ── PDF ───────────────────────────────────────────────────────────────────
  const ref = campagneLibelle
    ? `COMM-${String(delegueId).padStart(4, "0")}-${campagneId}`
    : `COMM-${String(delegueId).padStart(4, "0")}`;
  const titreDoc = campagneLibelle
    ? `Relevé des commissions — ${campagneLibelle}`
    : "Relevé des commissions — Toutes campagnes";

  const { doc, endPromise } = makePdfDoc();
  await drawHeader(doc, cooperativeId, { titre_document: titreDoc, reference: ref });

  let y = doc.y;

  // Bloc délégué
  doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 44).fill("#fffbeb").stroke("#fde68a");
  doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("DÉLÉGUÉ", MARGIN + 8, y + 5);
  const delegueNomComplet = `${delegue.prenoms ?? ""} ${delegue.nom ?? "—"}`.trim();
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(delegueNomComplet, MARGIN + 8, y + 16);
  doc.fontSize(8).fillColor(GRIS).font("Helvetica")
    .text(
      `Tél : ${delegue.telephone ?? "—"}   |   Généré le : ${formaterDateHeure(new Date())}`,
      MARGIN + 8, y + 30,
    );
  y += 52;

  // Totaux récapitulatifs (annulé montré si > 0, exclu du total)
  const totauxCols = annuleTotal > 0
    ? [
        { label: "En attente", val: formaterFCFA(enAttenteTotal), bg: "#fffbeb", col: "#b45309" },
        { label: "Déjà payé",  val: formaterFCFA(payeTotal),      bg: "#f0fdf4", col: "#16a34a" },
        { label: "Annulé",     val: formaterFCFA(annuleTotal),    bg: "#f1f5f9", col: "#64748b" },
      ]
    : [
        { label: "En attente", val: formaterFCFA(enAttenteTotal), bg: "#fffbeb", col: "#b45309" },
        { label: "Déjà payé",  val: formaterFCFA(payeTotal),      bg: "#f0fdf4", col: "#16a34a" },
        { label: "Total net",  val: formaterFCFA(grandTotal),     bg: "#f0f9ff", col: "#0369a1" },
      ];
  const blockW = (PAGE_W - MARGIN * 2 - 16) / 3;
  totauxCols.forEach((t, i) => {
    const bx = MARGIN + i * (blockW + 8);
    doc.rect(bx, y, blockW, 38).fill(t.bg);
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text(t.label, bx + 6, y + 6, { width: blockW - 12, lineBreak: false });
    doc.fontSize(10).fillColor(t.col).font("Helvetica-Bold").text(t.val, bx + 6, y + 18, { width: blockW - 12, lineBreak: false });
  });
  y += 48;

  if (commissions.length === 0) {
    doc.fontSize(10).fillColor(GRIS).font("Helvetica").text("Aucune commission pour cette période.", MARGIN, y);
  } else {
    // En-tête du tableau
    doc.fontSize(9).fillColor(VERT).font("Helvetica-Bold").text("DÉTAIL DES COMMISSIONS", MARGIN, y);
    y += 14;

    const colW = [80, 72, 76, 82, 90, 68]; // Date | Livraison | Poids kg | Taux FCFA/kg | Montant | Statut
    const headers = ["Date", "Livraison #", "Poids (kg)", "Taux (FCFA/kg)", "Montant (FCFA)", "Statut"];
    ligneTableau(doc, headers, colW, MARGIN, y, VERT);
    y += 18;

    for (const c of commissions) {
      // Saut de page si nécessaire
      if (y > 720) {
        doc.addPage();
        await drawHeader(doc, cooperativeId, { titre_document: `${titreDoc} (suite)`, reference: ref });
        y = doc.y;
      }
      const rowBg = commissions.indexOf(c) % 2 === 0 ? "#f9fafb" : undefined;
      const statut =
        c.statut === "payé"    ? "Payée" :
        c.statut === "annulé"  ? "Annulée" :
        "En attente";
      const cols = [
        formaterDate(c.createdAt),
        `#${c.livraisonId}`,
        parseFloat(String(c.poidsKg)).toFixed(2),
        formaterNombre(parseFloat(String(c.tauxFcfaParKg))),
        formaterNombre(parseFloat(String(c.montantFcfa))),
        statut,
      ];
      if (rowBg) doc.rect(MARGIN, y, colW.reduce((a, b) => a + b, 0), 15).fill(rowBg);
      let cx = MARGIN;
      cols.forEach((col, i) => {
        const align = i >= 2 && i <= 4 ? "right" : "left";
        doc.fontSize(8).fillColor("black").font("Helvetica")
          .text(col, cx + 3, y + 3, { width: (colW[i] ?? 80) - 6, lineBreak: false, align });
        cx += colW[i] ?? 80;
      });
      y += 15;
    }

    // Ligne de total en bas du tableau
    y += 4;
    const totalW = colW.reduce((a, b) => a + b, 0);
    doc.rect(MARGIN, y, totalW, 22).fill(VERT);
    doc.fontSize(9).fillColor("white").font("Helvetica-Bold")
      .text(`TOTAL (${commissions.length} commission${commissions.length > 1 ? "s" : ""})`, MARGIN + 6, y + 7, {
        width: totalW - colW[colW.length - 1]! - colW[colW.length - 2]! - 12,
        lineBreak: false,
      });
    doc.text(formaterNombre(grandTotal), MARGIN + totalW - colW[colW.length - 1]! - colW[colW.length - 2]! - 6, y + 7, {
      width: colW[colW.length - 2]! + colW[colW.length - 1]! - 6,
      align: "right",
      lineBreak: false,
    });
  }

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bordereau d'achat — Session de pesée (transfert délégué → central)
// ─────────────────────────────────────────────────────────────────────────────
export async function generateBordereauAchatSession(
  sessionId: number,
  cooperativeId: number,
): Promise<Buffer> {
  // 1. Session
  const [session] = await db
    .select({
      id:                 sessionsPeseeTable.id,
      numeroSession:      sessionsPeseeTable.numeroSession,
      produit:            sessionsPeseeTable.produit,
      poidsTotalKg:       sessionsPeseeTable.poidsTotalKg,
      nbSacsTotal:        sessionsPeseeTable.nbSacsTotal,
      dateFin:            sessionsPeseeTable.dateFin,
      transfertId:        sessionsPeseeTable.transfertId,
      membreId:           sessionsPeseeTable.membreId,
      certificationCacao: sessionsPeseeTable.certificationCacao,
      createdAt:          sessionsPeseeTable.createdAt,
    })
    .from(sessionsPeseeTable)
    .where(and(
      eq(sessionsPeseeTable.id, sessionId),
      eq(sessionsPeseeTable.cooperativeId, cooperativeId),
    ))
    .limit(1);
  if (!session) throw new Error("Session introuvable");

  // 2. Lignes de pesée
  const lignes = await db
    .select()
    .from(lignesPeseeTable)
    .where(eq(lignesPeseeTable.sessionId, sessionId))
    .orderBy(lignesPeseeTable.numeroPassage);

  // 3. Transfert + délégué
  let immatriculation  = "—";
  let nomChauffeur     = "—";
  let delegueNom       = "—";
  let deleguePrenoms   = "";
  let delegueTel       = "—";
  let delegueZone      = "—";
  let carburantFcfa      = 0;
  let autresChargesFcfa  = 0;
  let modeFinancement    = "fonds_propres";
  let delegueIdSession: number | null = null;
  let transfertCharges: { carburantPar: string; carburantFcfa: number; autresFcfa: number; autresPar: string } | null = null;
  // Vrai quand la session appartient à un membre catégorisé "délégué de localités"
  // → même format bordereau que les délégués terrain, sans camion/chauffeur
  let estDelegueMembre = false;

  if (session.transfertId) {
    const [t] = await db
      .select({
        immatriculation:    transfertsStockTable.immatriculation,
        nomChauffeur:       transfertsStockTable.nomChauffeur,
        delegueId:          transfertsStockTable.delegueId,
        fraisCarburantFcfa: transfertsStockTable.fraisCarburantFcfa,
        fraisCarburantPar:  transfertsStockTable.fraisCarburantPar,
        autresChargesFcfa:  transfertsStockTable.autresChargesFcfa,
        autresChargesPar:   transfertsStockTable.autresChargesPar,
        modeFinancement:    transfertsStockTable.modeFinancement,
      })
      .from(transfertsStockTable)
      .where(eq(transfertsStockTable.id, session.transfertId))
      .limit(1);

    if (t) {
      immatriculation = t.immatriculation ?? "—";
      nomChauffeur    = t.nomChauffeur    ?? "—";
      carburantFcfa     = t.fraisCarburantFcfa ?? 0;
      autresChargesFcfa = t.autresChargesFcfa  ?? 0;
      modeFinancement   = t.modeFinancement ?? "fonds_propres";
      transfertCharges = {
        carburantPar:  t.fraisCarburantPar  ?? "cooperative",
        carburantFcfa: t.fraisCarburantFcfa ?? 0,
        autresFcfa:    t.autresChargesFcfa  ?? 0,
        autresPar:     t.autresChargesPar   ?? "cooperative",
      };

      if (t.delegueId) {
        delegueIdSession = t.delegueId;
        const [[delegue], [entrepot]] = await Promise.all([
          db.select({ nom: usersTable.nom, prenoms: usersTable.prenoms, telephone: usersTable.telephone })
            .from(usersTable)
            .where(eq(usersTable.id, t.delegueId))
            .limit(1),
          db.select({ zoneNom: entrepotsDeleguesTable.zoneNom })
            .from(entrepotsDeleguesTable)
            .where(and(
              eq(entrepotsDeleguesTable.delegueId, t.delegueId),
              eq(entrepotsDeleguesTable.cooperativeId, cooperativeId),
            ))
            .limit(1),
        ]);
        if (delegue) {
          delegueNom     = delegue.nom      ?? "—";
          deleguePrenoms = delegue.prenoms  ?? "";
          delegueTel     = delegue.telephone ?? "—";
        }
        if (entrepot) delegueZone = entrepot.zoneNom ?? "—";
      }
    }
  } else if (session.membreId) {
    // Chemin membre : vérifier si catégorie "délégué de localités"
    const [membreDelegue] = await db
      .select({
        nom:             membresTable.nom,
        prenoms:         membresTable.prenoms,
        telephone:       membresTable.telephone,
        section:         membresTable.section,
        categorieMembre: membresTable.categorieMembre,
      })
      .from(membresTable)
      .where(eq(membresTable.id, session.membreId))
      .limit(1);

    if (membreDelegue?.categorieMembre === "délégué de localités") {
      estDelegueMembre = true;
      delegueNom       = membreDelegue.nom       ?? "—";
      deleguePrenoms   = membreDelegue.prenoms   ?? "";
      delegueTel       = membreDelegue.telephone ?? "—";
      delegueZone      = membreDelegue.section   ?? "—";

      // Commission pour ce membre délégué (créée à terminerSession)
      const [commMembre] = await db
        .select({
          montantFcfa:        commissionsMembresDelaguesTable.montantFcfa,
          tauxFcfaParKg:      commissionsMembresDelaguesTable.tauxFcfaParKg,
          retenueAvancesFcfa: commissionsMembresDelaguesTable.retenueAvancesFcfa,
          statut:             commissionsMembresDelaguesTable.statut,
        })
        .from(commissionsMembresDelaguesTable)
        .where(eq(commissionsMembresDelaguesTable.sessionPeseeId, session.id))
        .orderBy(desc(commissionsMembresDelaguesTable.id))
        .limit(1);

      if (commMembre) {
        fraisCollecteFcfa = Math.round(parseFloat(commMembre.montantFcfa));
        // Si déjà payée : afficher la retenue réelle enregistrée
        // Si en attente : afficher le solde avances actif (ce qui sera déduit au paiement)
        if (commMembre.statut === "payé") {
          retenueAvancesFcfa = commMembre.retenueAvancesFcfa ?? 0;
        }
      }

      // Solde avances actif du membre (informatif)
      const avancesMembre = await db
        .select({ soldeRestantFcfa: avancesTable.soldeRestantFcfa })
        .from(avancesTable)
        .where(and(
          eq(avancesTable.membreId, session.membreId!),
          inArray(avancesTable.statut, ["en_cours", "en_retard"] as const),
        ));
      soldeAvancesFcfa = avancesMembre.reduce((s, a) => s + a.soldeRestantFcfa, 0);

      // Si commission non encore payée : la retenue anticipée = solde actif des avances
      // (capée au montant de la commission pour ne pas afficher un négatif)
      if (commMembre?.statut !== "payé") {
        retenueAvancesFcfa = Math.min(soldeAvancesFcfa, fraisCollecteFcfa);
        // soldeAvancesFcfa = ce qu'il restera après la retenue
        soldeAvancesFcfa = Math.max(0, soldeAvancesFcfa - retenueAvancesFcfa);
      } else {
        // Après paiement : solde = ce qui reste réellement
        soldeAvancesFcfa = Math.max(0, soldeAvancesFcfa);
      }
    }
  }

  // 4. Prix bord-champ le plus récent
  const [dernierPrix] = await db
    .select({ prix: historiquePrixTable.prixBordChampFcfa })
    .from(historiquePrixTable)
    .where(eq(historiquePrixTable.cooperativeId, cooperativeId))
    .orderBy(desc(historiquePrixTable.datePrix))
    .limit(1);
  const prixUnitaire = dernierPrix ? parseFloat(dernierPrix.prix) : 0;

  // 5. Commission = frais de collecte (toujours affiché en montant BRUT = poids × taux)
  // Cherche d'abord le record en DB (créé juste après terminerSession).
  // On lit montantBrutFcfa pour afficher la commission brute, indépendamment des
  // éventuelles charges de transport qui sont déduites séparément sur le bordereau.
  // Fallback : taux × poids net si le record n'existe pas encore.
  let fraisCollecteFcfa = 0;
  if (session.transfertId) {
    const [comm] = await db
      .select({
        montantBrutFcfa: commissionsDeleguesTable.montantBrutFcfa,
        montantFcfa:     commissionsDeleguesTable.montantFcfa,
      })
      .from(commissionsDeleguesTable)
      .where(eq(commissionsDeleguesTable.transfertId, session.transfertId))
      .orderBy(desc(commissionsDeleguesTable.id))
      .limit(1);
    if (comm) {
      // Préférer montantBrutFcfa (commission brute = poids × taux) ;
      // si NULL (anciennes lignes sans ce champ), fallback sur montantFcfa.
      const brut = parseFloat(comm.montantBrutFcfa ?? comm.montantFcfa ?? "0");
      fraisCollecteFcfa = Math.round(brut);
    } else if (delegueIdSession) {
      // Fallback : taux × poids net (commission brute, sans déduction de charges)
      const campagneActuelle = await getCampagneEnCours(cooperativeId);
      const taux = await getTauxActif(cooperativeId, campagneActuelle?.id ?? null, delegueIdSession);
      if (taux) {
        const poidsNetPourCommission = parseFloat(session.poidsTotalKg ?? "0");
        fraisCollecteFcfa = Math.round(poidsNetPourCommission * taux.tauxFcfaParKg);
      }
    }
  }

  // 6. Avances du délégué + montant caisse coopérative crédité avant la session
  let soldeAvancesFcfa   = 0;
  let retenueAvancesFcfa = 0;   // retenue réelle déjà opérée sur cette commission
  let montantCoopFcfa    = 0;   // total alimentations caisse avant session (mode caisse_cooperative)

  if (delegueIdSession) {
    // 6a. Retenues réelles déjà enregistrées sur la commission de cette session
    if (session.transfertId) {
      const [commPourRetenues] = await db
        .select({ id: commissionsDeleguesTable.id })
        .from(commissionsDeleguesTable)
        .where(eq(commissionsDeleguesTable.transfertId, session.transfertId))
        .orderBy(desc(commissionsDeleguesTable.id))
        .limit(1);
      if (commPourRetenues) {
        const retenues = await db
          .select({ montantFcfa: remboursementsAvancesDeleguesTable.montantFcfa })
          .from(remboursementsAvancesDeleguesTable)
          .where(eq(remboursementsAvancesDeleguesTable.commissionId, commPourRetenues.id));
        retenueAvancesFcfa = retenues.reduce((s, r) => s + r.montantFcfa, 0);
      }
    }

    // 6b. Solde total avances encore en cours (informatif)
    const avances = await db
      .select({ soldeRestantFcfa: avancesDeleguesTable.soldeRestantFcfa })
      .from(avancesDeleguesTable)
      .where(and(
        eq(avancesDeleguesTable.delegueId, delegueIdSession),
        eq(avancesDeleguesTable.cooperativeId, cooperativeId),
        inArray(avancesDeleguesTable.statut, ["en_cours", "en_retard"] as const),
      ));
    soldeAvancesFcfa = avances.reduce((s, a) => s + a.soldeRestantFcfa, 0);

    // 6b. Si mode caisse_cooperative : montant pré-financé sur le cycle courant
    if (modeFinancement === "caisse_cooperative" && delegueIdSession) {
      {
        const cutoff = session.createdAt ?? new Date();

        // Cycle start = dateFin de la dernière session terminée pour ce délégué
        // (pour ne compter que les alimentations du cycle de collecte en cours).
        const [derniereSessionTerminee] = await db
          .select({ dateFin: sessionsPeseeTable.dateFin })
          .from(sessionsPeseeTable)
          .innerJoin(transfertsStockTable, eq(transfertsStockTable.id, sessionsPeseeTable.transfertId))
          .where(and(
            eq(transfertsStockTable.delegueId, delegueIdSession!),
            eq(sessionsPeseeTable.cooperativeId, cooperativeId),
            sql`${sessionsPeseeTable.statut}::text = 'terminee'`,
            lt(sessionsPeseeTable.dateFin, cutoff),
          ))
          .orderBy(desc(sessionsPeseeTable.dateFin))
          .limit(1);

        const cycleDebut = derniereSessionTerminee?.dateFin ?? undefined;
        montantCoopFcfa = await getMontantAlimentationsCaisseDelegue(
          delegueIdSession!, cooperativeId, cutoff, cycleDebut,
        );
      }
    }
  }

  // 7. Campagne
  const campagne = await getCampagneEnCours(cooperativeId);

  // 8. Totaux
  const poidsNetKg    = parseFloat(session.poidsTotalKg ?? "0");
  const poidsBrutKg   = lignes.reduce((s, l) => s + parseFloat(l.poidsBrutKg), 0);
  const valeurProduit = Math.round(poidsNetKg * prixUnitaire);
  const caisseCoop    = modeFinancement === "caisse_cooperative";

  // Frais de collecte net = commission brute − carburant − autres charges de transport
  const fraisCollecteNet = Math.max(0, fraisCollecteFcfa - carburantFcfa - autresChargesFcfa);

  // Formule :
  //   fonds_propres      → NET = valeur + frais collecte net − retenues avances
  //   caisse_cooperative → NET = frais collecte net − retenues avances
  //     (la valeur produit est déjà réglée par la coopérative via caisse ; le délégué
  //      ne perçoit que sa commission nette de transport et d'avances)
  const resteValeurFcfa = caisseCoop ? Math.max(valeurProduit - montantCoopFcfa, 0) : valeurProduit;
  const montantNet = caisseCoop
    ? Math.max(0, fraisCollecteNet - retenueAvancesFcfa)
    : Math.max(0, resteValeurFcfa + fraisCollecteNet - retenueAvancesFcfa);

  // 8. PDF
  const { doc, endPromise } = makePdfDoc();
  // M=40 aligne avec les marges internes de drawHeader (marginLeft=40/marginRight=40)
  const M  = 40;
  const BW = PAGE_W - M * 2;             // 515.28 pt utilisables = toute la largeur utile
  await drawHeader(doc, cooperativeId, { titre_document: "BORDEREAU D'ACHAT", reference: session.numeroSession });

  // Bandeau Campagne / Date
  let y = doc.y + 4;
  if (campagne) {
    doc.rect(M, y, BW, 14).fill("#f0fdf4");
    const dateStr = session.dateFin
      ? formaterDateHeure(session.dateFin)
      : formaterDateHeure(new Date());
    doc.fontSize(8).fillColor(GRIS).font("Helvetica").text("Campagne :", M + 6, y + 3, { width: 78, lineBreak: false });
    doc.font("Helvetica-Bold").fillColor(VERT).text(campagne, M + 86, y + 3, { lineBreak: false });
    doc.font("Helvetica").fillColor(GRIS).text("Date :", PAGE_W - M - 130, y + 3, { width: 36, lineBreak: false });
    doc.font("Helvetica-Bold").fillColor("black").text(dateStr, PAGE_W - M - 94, y + 3, { width: 94, lineBreak: false });
    y += 18;
  }

  // Bandeau Certification cacao (si renseignée)
  if (session.certificationCacao) {
    const CERT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
      RA:        { bg: "#f0fdf4", border: "#16a34a", text: "#15803d" },
      FAIRTRADE: { bg: "#fffbeb", border: "#d97706", text: "#b45309" },
      ASR_1000:  { bg: "#eff6ff", border: "#2563eb", text: "#1d4ed8" },
      ORDINAIRE: { bg: "#f9fafb", border: "#6b7280", text: "#374151" },
    };
    const cc = CERT_COLORS[session.certificationCacao] ?? CERT_COLORS["ORDINAIRE"]!;
    const certW = 140;
    const certX = M + BW - certW;
    doc.rect(certX, y, certW, 16).fillAndStroke(cc.bg, cc.border);
    doc.fontSize(8).fillColor(cc.text).font("Helvetica-Bold")
      .text(`Cacao ${session.certificationCacao}`, certX, y + 4, { width: certW, align: "center", lineBreak: false });
    y += 20;
  }

  y += 6;

  // ── IDENTIFICATION (gauche) + DÉTAILS PESÉE (droite) ───────────────────────
  const LEFT_W  = 262;
  const RIGHT_X = M + LEFT_W + 10;
  const RIGHT_W = PAGE_W - RIGHT_X - M;
  const topY    = y;

  doc.fontSize(8.5).fillColor(VERT).font("Helvetica-Bold").text("IDENTIFICATION", M, y);
  y += 14;

  const fieldRow = (label: string, value: string) => {
    doc.fontSize(8).fillColor(GRIS).font("Helvetica")
      .text(`${label} :`, M, y, { width: 96, lineBreak: false });
    doc.font("Helvetica-Bold").fillColor("black")
      .text(value, M + 98, y, { width: LEFT_W - 98, lineBreak: false });
    y += 13;
  };

  fieldRow("Délégué",       `${deleguePrenoms} ${delegueNom}`.trim());
  fieldRow("Téléphone",     delegueTel);
  fieldRow("Section",       delegueZone);
  // Camion & chauffeur : uniquement pour les sessions avec transfert (délégués terrain)
  if (!estDelegueMembre) {
    fieldRow("N° Camion",     immatriculation);
    fieldRow("Nom Chauffeur", nomChauffeur);
  }
  fieldRow("Produit",       session.produit
    ? session.produit.charAt(0).toUpperCase() + session.produit.slice(1)
    : "Cacao");
  fieldRow("Ouverture",     formaterDateHeure(session.createdAt));
  fieldRow("Clôture",       session.dateFin ? formaterDateHeure(session.dateFin) : "—");

  const leftBottom = y;

  // Tableau DÉTAILS PESÉE
  let ry = topY;
  doc.fontSize(8.5).fillColor(VERT).font("Helvetica-Bold").text("DÉTAILS PESÉE", RIGHT_X, ry);
  ry += 14;

  const dCols = [26, 64, 32, RIGHT_W - 122];
  const dHdrs = ["N°", "POIDS BRUT", "SACS", "HORODATEUR"];
  doc.rect(RIGHT_X, ry, RIGHT_W, 16).fill(VERT);
  let cx = RIGHT_X;
  dHdrs.forEach((h, i) => {
    doc.fontSize(7).fillColor("white").font("Helvetica-Bold")
      .text(h, cx + 2, ry + 5, { width: dCols[i]! - 4, lineBreak: false });
    cx += dCols[i]!;
  });
  ry += 16;

  for (let idx = 0; idx < lignes.length; idx++) {
    const l = lignes[idx]!;
    if (idx % 2 === 0) doc.rect(RIGHT_X, ry, RIGHT_W, 14).fill("#f0fdf4");
    cx = RIGHT_X;
    [
      String(l.numeroPassage),
      `${parseFloat(l.poidsBrutKg).toFixed(1)} kg`,
      String(l.nbSacs),
      formaterDateHeure(l.createdAt),
    ].forEach((v, i) => {
      doc.fontSize(7).fillColor("black").font("Helvetica")
        .text(v, cx + 2, ry + 4, { width: dCols[i]! - 4, lineBreak: false });
      cx += dCols[i]!;
    });
    ry += 14;
  }

  y = Math.max(leftBottom, ry) + 16;

  // ── Tableau de calcul ── colonnes calibrées pour BW ≈ 515 pt ──────────────
  const tW   = BW;   // 515.28 pt
  // Somme fixe des 6 premières colonnes = 70+48+70+70+80+85 = 423 → dernière = ~92
  const colW = [70, 48, 70, 70, 80, 85, tW - 70 - 48 - 70 - 70 - 80 - 85];

  const HDR_H = 32;
  doc.rect(M, y, tW, HDR_H).fill(VERT);
  cx = M;
  [
    "POIDS BRUT\n(KG)", "NBRE\nSACS", "POIDS NET\n(KG)",
    "PRIX\nUNITAIRE", "VALEUR\nPRODUIT", "AUTRES FRAIS", "MONTANT NET\nA PAYER",
  ].forEach((h, i) => {
    doc.fontSize(7.5).fillColor("white").font("Helvetica-Bold")
      .text(h, cx + 2, y + 7, { width: colW[i]! - 4, align: "center", lineBreak: true });
    cx += colW[i]!;
  });
  y += HDR_H;

  const autresLignes: { label: string; valeur: number; net?: boolean }[] = [
    { label: "FRAIS DE\nCOLLECTE",  valeur: fraisCollecteFcfa },
    { label: "CARBURANT",            valeur: carburantFcfa },
    ...(autresChargesFcfa > 0
      ? [{ label: "AUTRES\nCHARGES", valeur: autresChargesFcfa }]
      : []),
    { label: "FRAIS COLLECTE\nNET", valeur: fraisCollecteNet, net: true },
    { label: "RETENUE\nAVANCE",     valeur: retenueAvancesFcfa },
    { label: "SOLDE SUR\nAVANCES",  valeur: soldeAvancesFcfa },
  ];
  // SUB_H doit loger : label sur 2 lignes à 7 pt (≈18 pt) + valeur à 8.5 pt + marges
  const SUB_H = 32;
  const ROW_H = autresLignes.length * SUB_H;

  doc.rect(M, y, tW, ROW_H).fill("#f9fafb");
  doc.rect(M, y, tW, ROW_H).stroke("#d1d5db");

  cx = M;
  for (let i = 0; i < colW.length - 1; i++) {
    cx += colW[i]!;
    doc.moveTo(cx, y).lineTo(cx, y + ROW_H).stroke("#d1d5db");
  }

  const cellMidY = y + ROW_H / 2 - 6;
  cx = M;
  [
    `${poidsBrutKg.toFixed(1)} kg`,
    String(session.nbSacsTotal ?? lignes.reduce((s, l) => s + l.nbSacs, 0)),
    `${poidsNetKg.toFixed(1)} kg`,
    prixUnitaire > 0 ? `${formaterNombre(prixUnitaire)} F` : "—",
    "",   // valeur produit — handled below (may be greyed out)
    "",
    `${formaterNombre(montantNet)} F`,
  ].forEach((v, i) => {
    if (v) {
      doc.fontSize(10).fillColor("black").font("Helvetica-Bold")
        .text(v, cx + 3, cellMidY, { width: colW[i]! - 6, align: "center", lineBreak: false });
    }
    cx += colW[i]!;
  });

  // Valeur produit — colonne 4 (index 4)
  {
    const vpX = M + colW.slice(0, 4).reduce((a, b) => a + b, 0);
    const vpW = colW[4]!;
    if (caisseCoop && montantCoopFcfa >= valeurProduit) {
      doc.fontSize(8).fillColor(GRIS).font("Helvetica-Bold")
        .text(valeurProduit > 0 ? `${formaterNombre(valeurProduit)} F` : "—", vpX + 3, cellMidY - 5, { width: vpW - 6, align: "center", lineBreak: false });
      doc.fontSize(6.5).fillColor(GRIS).font("Helvetica")
        .text("réglée via caisse", vpX + 2, cellMidY + 4, { width: vpW - 4, align: "center", lineBreak: false });
    } else if (caisseCoop && montantCoopFcfa > 0) {
      doc.fontSize(9).fillColor("black").font("Helvetica-Bold")
        .text(`${formaterNombre(valeurProduit)} F`, vpX + 3, cellMidY - 5, { width: vpW - 6, align: "center", lineBreak: false });
      doc.fontSize(6).fillColor(GRIS).font("Helvetica")
        .text(`dont ${formaterNombre(montantCoopFcfa)} F caisse`, vpX + 2, cellMidY + 5, { width: vpW - 4, align: "center", lineBreak: false });
    } else {
      doc.fontSize(10).fillColor("black").font("Helvetica-Bold")
        .text(valeurProduit > 0 ? `${formaterNombre(valeurProduit)} F` : "—", vpX + 3, cellMidY, { width: vpW - 6, align: "center", lineBreak: false });
    }
  }

  // Sous-lignes AUTRES FRAIS — label (2 lignes) en haut, valeur en bas de chaque cellule
  const autresX = M + colW.slice(0, 5).reduce((a, b) => a + b, 0);
  const autresW = colW[5]!;
  let ay = y;
  autresLignes.forEach((al, idx) => {
    if (idx > 0) doc.moveTo(autresX, ay).lineTo(autresX + autresW, ay).stroke("#e5e7eb");
    // Fond distinctif pour la ligne "net"
    if (al.net) {
      doc.rect(autresX, ay, autresW, SUB_H).fill("#f0fdf4").stroke("#d1d5db");
    }
    // Label sur 2 lignes, ancré en haut de la cellule
    doc.fontSize(7).fillColor(al.net ? VERT : GRIS).font("Helvetica-Bold")
      .text(al.label, autresX + 2, ay + 4, { width: autresW - 4, align: "center", lineBreak: true });
    // Valeur ancrée en bas de la cellule (SUB_H - 11 laisse 11 pt depuis le bas)
    doc.fontSize(9).fillColor(al.valeur > 0 ? VERT : "black").font("Helvetica-Bold")
      .text(`${formaterNombre(al.valeur)} F`, autresX + 2, ay + SUB_H - 13, { width: autresW - 4, align: "center", lineBreak: false });
    ay += SUB_H;
  });

  y += ROW_H + 16;

  // ── Signatures épinglées au pied de page ────────────────────────────────────
  // Hauteur fixe de 80 pt ; les boîtes sont ancrées juste au-dessus du footer
  // (séparateur à pageHeight-38) quelle que soit la longueur du contenu.
  const footerSepY = doc.page.height - 38;
  const sigBoxH    = 80;
  const sigW       = (BW - 16) / 3;
  const sigY       = footerSepY - 8 - sigBoxH - 14; // label au-dessus de la boîte
  ["PESEUR", "LIVREUR", "MAGASINIER"].forEach((lbl, i) => {
    const sx = M + i * (sigW + 8);
    doc.fontSize(9).fillColor(GRIS).font("Helvetica-Bold")
      .text(lbl, sx, sigY, { width: sigW, align: "center", lineBreak: false });
    doc.rect(sx, sigY + 14, sigW, sigBoxH).stroke("#d1d5db");
  });

  await addFooters(doc, cooperativeId);
  doc.end();
  return endPromise;
}

import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import { drawHeader, drawFooter } from "./pdfHeaderService";

const VERT  = "#16a34a";
const GRIS  = "#6b7280";
const MARGIN = 40;
const PAGE_W = 595 - MARGIN * 2;

function formaterDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formaterFCFA(n: string | number | null | undefined): string {
  if (n == null) return "—";
  // PDFKit/Helvetica peut rendre U+202F et U+00A0 comme des barres obliques.
  const montant = Math.round(Number(n))
    .toLocaleString("fr-FR")
    .replace(/[\u202F\u00A0]/g, " ");
  return `${montant} FCFA`;
}

function tronquer(value: string | null | undefined, max: number): string {
  const text = value?.trim() || "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function nombreEnLettres(n: number): string {
  const units = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const underHundred = (value: number): string => {
    if (value < 17) return units[value]!;
    if (value < 20) return `dix-${units[value - 10]}`;
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];
    if (value < 70) {
      const dizaine = Math.floor(value / 10);
      const unite = value % 10;
      return `${tens[dizaine]}${unite === 1 ? " et un" : unite ? `-${units[unite]}` : ""}`;
    }
    if (value < 80) return value === 71 ? "soixante et onze" : `soixante-${underHundred(value - 60)}`;
    return value === 80 ? "quatre-vingts" : `quatre-vingt-${underHundred(value - 80)}`;
  };
  const underThousand = (value: number): string => {
    if (value < 100) return underHundred(value);
    const hundreds = Math.floor(value / 100);
    const reste = value % 100;
    const prefix = hundreds === 1 ? "cent" : `${units[hundreds]} cent`;
    return `${prefix}${reste === 0 && hundreds > 1 ? "s" : ""}${reste ? ` ${underHundred(reste)}` : ""}`;
  };
  const convert = (value: number): string => {
    if (value < 1000) return underThousand(value);
    if (value < 1_000_000) {
      const milliers = Math.floor(value / 1000);
      const reste = value % 1000;
      return `${milliers === 1 ? "mille" : `${underThousand(milliers)} mille`}${reste ? ` ${underThousand(reste)}` : ""}`;
    }
    const millions = Math.floor(value / 1_000_000);
    const reste = value % 1_000_000;
    return `${convert(millions)} million${millions > 1 ? "s" : ""}${reste ? ` ${convert(reste)}` : ""}`;
  };
  return convert(Math.max(0, Math.round(n)));
}

interface BonData {
  id: number;
  numero: string;
  statut: string;
  typeCarburant: string;
  quantiteAutorisee: string | null;
  montantAutoriseFcfa: string | null;
  quantiteLivree:    string | null;
  prixLitreFcfa:     string | null;
  montantFcfa:       string | null;
  dateEmission:      string;
  dateUtilisation:   string | null;
  stationService:    string | null;
  motif:             string | null;
  observations:      string | null;
  // joined
  immatriculation:   string | null;
  marque:            string | null;
  modele:            string | null;
  chauffeurNom:      string | null;
  chauffeurPrenoms:  string | null;
  approveParNom:     string | null;
}

const STATUT_LABELS: Record<string, string> = {
  brouillon: "BROUILLON",
  soumis:    "SOUMIS — EN ATTENTE D'APPROBATION",
  approuve:  "APPROUVÉ",
  utilise:   "UTILISÉ",
  annule:    "ANNULÉ",
};

const CARBURANT_LABELS: Record<string, string> = {
  gasoil:  "Gasoil",
  essence: "Essence",
  super:   "Super",
};

export async function generateBonCarburant(cooperativeId: number, bon: BonData): Promise<Buffer> {
  // Générer le QR code avec le numéro du bon
  const qrBuffer = await QRCode.toBuffer(bon.numero, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 96,
  });

  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  const endPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  await drawHeader(doc, cooperativeId, {
    titre_document: "BON DE CARBURANT",
    reference: bon.numero,
  });

  let y = doc.y + 4;

  // ── Bandeau statut ────────────────────────────────────────────────────────
  const statutColor = bon.statut === "approuve" || bon.statut === "utilise" ? "#16a34a"
    : bon.statut === "annule" ? "#dc2626"
    : bon.statut === "soumis" ? "#2563eb"
    : "#6b7280";
  doc.rect(MARGIN, y, PAGE_W, 20).fill(statutColor);
  doc.fontSize(9).fillColor("white").font("Helvetica-Bold")
    .text(STATUT_LABELS[bon.statut] ?? bon.statut, MARGIN + 8, y + 6, { width: PAGE_W - 16, align: "center", lineBreak: false });
  y += 26;

  // ── Numéro prominent + QR code ────────────────────────────────────────────
  const QR_SIZE = 72;
  const QR_X = MARGIN + PAGE_W - QR_SIZE;

  doc.fontSize(22).fillColor(VERT).font("Helvetica-Bold")
    .text(bon.numero, MARGIN, y + 8, { width: PAGE_W - QR_SIZE - 12, align: "left" });

  // QR code à droite du numéro
  doc.image(qrBuffer, QR_X, y, { width: QR_SIZE, height: QR_SIZE });
  doc.fontSize(6).fillColor(GRIS).font("Helvetica")
    .text("Scanner à la station", QR_X, y + QR_SIZE + 2, { width: QR_SIZE, align: "center", lineBreak: false });

  y += QR_SIZE + 14;

  // ── Bloc infos véhicule / chauffeur ───────────────────────────────────────
  const colW1 = 240;
  const colW2 = PAGE_W - colW1 - 10;

  // Colonne gauche
  doc.rect(MARGIN, y, colW1, 90).fill("#f0fdf4").stroke("#bbf7d0");
  doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("VÉHICULE", MARGIN + 8, y + 6);
  doc.fontSize(11).fillColor(VERT).font("Helvetica-Bold")
    .text(bon.immatriculation ?? "—", MARGIN + 8, y + 17);
  doc.fontSize(8).fillColor("#374151").font("Helvetica")
    .text(`${bon.marque ?? ""} ${bon.modele ?? ""}`.trim() || "—", MARGIN + 8, y + 32);
  doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("CHAUFFEUR", MARGIN + 8, y + 50);
  doc.fontSize(9).fillColor("#111827").font("Helvetica-Bold")
    .text(`${bon.chauffeurPrenoms ?? ""} ${bon.chauffeurNom ?? "—"}`.trim(), MARGIN + 8, y + 61);

  // Colonne droite
  const rx = MARGIN + colW1 + 10;
  doc.rect(rx, y, colW2, 90).fill("#eff6ff").stroke("#bfdbfe");
  doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("CARBURANT", rx + 8, y + 6);
  doc.fontSize(14).fillColor("#1d4ed8").font("Helvetica-Bold")
    .text(CARBURANT_LABELS[bon.typeCarburant] ?? bon.typeCarburant, rx + 8, y + 17);
  doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("MONTANT AUTORISÉ", rx + 8, y + 38);
  doc.fontSize(16).fillColor("#111827").font("Helvetica-Bold")
    .text(formaterFCFA(bon.montantAutoriseFcfa), rx + 8, y + 49);
  doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("DATE D'ÉMISSION", rx + 8, y + 70);
  doc.fontSize(9).fillColor("#111827").font("Helvetica")
    .text(formaterDate(bon.dateEmission), rx + 8, y + 79);
  y += 100;

  // ── Tableau détails ───────────────────────────────────────────────────────
  const detailsLeft: Array<[string, string]> = [
    ["Station-service",  bon.stationService ?? "—"],
    ["Motif",            bon.motif ?? "—"],
    ["Approuvé par",     bon.approveParNom ?? "—"],
  ];
  const detailsRight: Array<[string, string]> = [
    ["Qté autorisée",       bon.quantiteAutorisee ? `${parseFloat(bon.quantiteAutorisee).toFixed(2)} L` : "—"],
    ["Qté réellement servie", bon.quantiteLivree ? `${parseFloat(bon.quantiteLivree).toFixed(2)} L` : "—"],
    ["Prix au litre",         bon.prixLitreFcfa  ? `${parseFloat(bon.prixLitreFcfa).toFixed(0)} FCFA/L` : "—"],
    ["Montant total",         formaterFCFA(bon.montantFcfa)],
    ["Date d'utilisation",    formaterDate(bon.dateUtilisation)],
  ];

  const dW = (PAGE_W - 10) / 2;
  let ly = y;
  let ry = y;

  // Left column
  for (const [i, [label, val]] of detailsLeft.entries()) {
    const bg = i % 2 === 0 ? "#f9fafb" : "white";
    doc.rect(MARGIN, ly, dW, 18).fill(bg);
    doc.fontSize(7).fillColor(GRIS).font("Helvetica").text(label, MARGIN + 6, ly + 5, { width: 90, lineBreak: false });
    doc.fontSize(8).fillColor("#111827").font("Helvetica-Bold").text(val, MARGIN + 100, ly + 5, { width: dW - 108, lineBreak: false });
    ly += 18;
  }

  // Right column
  for (const [i, [label, val]] of detailsRight.entries()) {
    const rx2 = MARGIN + dW + 10;
    const bg = i % 2 === 0 ? "#f9fafb" : "white";
    doc.rect(rx2, ry, dW, 18).fill(bg);
    doc.fontSize(7).fillColor(GRIS).font("Helvetica").text(label, rx2 + 6, ry + 5, { width: 110, lineBreak: false });
    doc.fontSize(8).fillColor("#111827").font("Helvetica-Bold").text(val, rx2 + 118, ry + 5, { width: dW - 126, lineBreak: false });
    ry += 18;
  }

  y = Math.max(ly, ry) + 10;

  // ── Observations ──────────────────────────────────────────────────────────
  if (bon.observations) {
    doc.rect(MARGIN, y, PAGE_W, 28).fill("#fefce8").stroke("#fef08a");
    doc.fontSize(7).fillColor(GRIS).font("Helvetica").text("OBSERVATIONS", MARGIN + 8, y + 4);
    doc.fontSize(8).fillColor("#111827").font("Helvetica").text(bon.observations, MARGIN + 8, y + 14, { width: PAGE_W - 16, lineBreak: true });
    y += 38;
  }

  // ── Zones de signature ────────────────────────────────────────────────────
  y = Math.max(y, 620);
  const sigW = (PAGE_W - 20) / 3;
  const sigBoxes = [
    { label: "Chauffeur",            sublabel: `${bon.chauffeurPrenoms ?? ""} ${bon.chauffeurNom ?? ""}`.trim() },
    { label: "Responsable / Approbateur", sublabel: bon.approveParNom ?? "" },
    { label: "Agent de la station",  sublabel: bon.stationService ?? "" },
  ];
  for (const [i, s] of sigBoxes.entries()) {
    const sx = MARGIN + i * (sigW + 10);
    doc.rect(sx, y, sigW, 56).stroke("#d1d5db");
    doc.fontSize(7).fillColor(GRIS).font("Helvetica").text(s.label, sx + 6, y + 4, { width: sigW - 12, align: "center", lineBreak: false });
    if (s.sublabel) {
      doc.fontSize(7).fillColor("#374151").font("Helvetica").text(s.sublabel, sx + 6, y + 14, { width: sigW - 12, align: "center", lineBreak: false });
    }
    doc.moveTo(sx + 10, y + 46).lineTo(sx + sigW - 10, y + 46).stroke("#9ca3af");
    doc.fontSize(6.5).fillColor(GRIS).font("Helvetica").text("Signature", sx + 6, y + 48, { width: sigW - 12, align: "center", lineBreak: false });
  }

  doc.end();
  return endPromise;
}

export interface BonCarburantReglementData {
  numero: string;
  dateUtilisation: string | null;
  immatriculation: string | null;
  chauffeurNom: string | null;
  chauffeurPrenoms: string | null;
  typeCarburant: string;
  quantiteLivree: string | null;
  montantPaiementFcfa: number | string;
  stationService: string | null;
}

export interface BonCarburantReglementDocumentOptions {
  titreDocument?: string;
  totalLabel?: string;
  reference?: string;
}

export function formatFicheReglementReference(date = new Date()): string {
  const jour = String(date.getDate()).padStart(2, "0");
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const annee = String(date.getFullYear());
  return `CARB-${jour}-${mois}-${annee}`;
}

export function formatRecuReglementReference(date = new Date()): string {
  const jour = String(date.getDate()).padStart(2, "0");
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const annee = String(date.getFullYear());
  return `REC-CARB-${jour}-${mois}-${annee}`;
}

export async function generateBonsCarburantReglement(
  cooperativeId: number,
  bons: BonCarburantReglementData[],
  options: BonCarburantReglementDocumentOptions = {},
): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  const endPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const groups = new Map<string, BonCarburantReglementData[]>();
  for (const bon of bons) {
    const station = bon.stationService?.trim() || "Station non renseignée";
    const group = groups.get(station) ?? [];
    group.push(bon);
    groups.set(station, group);
  }

  const widths = [58, 48, 62, 112, 52, 54, 129];
  const headers = ["N° bon", "Date", "Véhicule", "Chauffeur", "Carburant", "Qté", "Montant"];
  const drawStationBlock = (
    station: string,
    rows: BonCarburantReglementData[],
    total: number,
    firstPage: boolean,
    lastPage: boolean,
  ) => {
    let y = doc.y + 8;
    if (firstPage) {
      doc.rect(MARGIN, y, PAGE_W, 38).fill("#f0fdf4").stroke("#bbf7d0");
      doc.font("Helvetica-Bold").fontSize(14).fillColor(VERT)
        .text(station, MARGIN + 12, y + 8, { width: PAGE_W - 24, lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#374151")
        .text(`${rows.length} bon${rows.length > 1 ? "s" : ""} · Total à payer : ${formaterFCFA(total)}`, MARGIN + 12, y + 25, { width: PAGE_W - 24, lineBreak: false });
      y += 50;
    } else {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(VERT)
        .text(`${station} — suite`, MARGIN, y, { width: PAGE_W, lineBreak: false });
      y += 20;
    }

    let x = MARGIN;
    doc.rect(MARGIN, y, PAGE_W, 22).fill("#166534");
    headers.forEach((header, index) => {
      doc.font("Helvetica-Bold").fontSize(7).fillColor("white")
        .text(header, x + 4, y + 7, { width: widths[index]! - 8, align: index >= 5 ? "right" : "left", lineBreak: false });
      x += widths[index]!;
    });
    y += 22;

    for (const [index, row] of rows.entries()) {
      x = MARGIN;
      const values = [
        tronquer(row.numero, 10),
        formaterDate(row.dateUtilisation),
        tronquer(row.immatriculation, 11),
        tronquer(`${row.chauffeurPrenoms ?? ""} ${row.chauffeurNom ?? ""}`.trim(), 20),
        tronquer(CARBURANT_LABELS[row.typeCarburant] ?? row.typeCarburant, 10),
        row.quantiteLivree ? `${parseFloat(row.quantiteLivree).toFixed(1)} L` : "—",
        formaterFCFA(row.montantPaiementFcfa),
      ];
      if (index % 2 === 0) doc.rect(MARGIN, y, PAGE_W, 22).fill("#f8fafc");
      values.forEach((value, valueIndex) => {
        doc.font("Helvetica").fontSize(7).fillColor("#111827")
          .text(value, x + 4, y + 7, { width: widths[valueIndex]! - 8, align: valueIndex >= 5 ? "right" : "left", lineBreak: false });
        x += widths[valueIndex]!;
      });
      y += 22;
    }

    if (lastPage) {
      doc.rect(MARGIN, y + 4, PAGE_W, 50).fill("#ecfdf5").stroke("#86efac");
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#166534")
         .text(options.totalLabel ?? "TOTAL À PAYER", MARGIN + 12, y + 14, { width: 180, lineBreak: false });
      doc.font("Helvetica-Bold").fontSize(15).fillColor("#111827")
        .text(formaterFCFA(total), MARGIN + 190, y + 11, { width: PAGE_W - 202, align: "right", lineBreak: false });
      doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#374151")
        .text(`Arrêté à : ${nombreEnLettres(total)} francs CFA`, MARGIN + 12, y + 35, { width: PAGE_W - 24, lineBreak: false });
      const signatureY = y + 76;
      const signatureWidth = (PAGE_W - 20) / 3;
      for (const [index, label] of ["Préparé par", "Contrôlé par", "Visa station"].entries()) {
        const signatureX = MARGIN + index * (signatureWidth + 10);
        doc.rect(signatureX, signatureY, signatureWidth, 48).stroke("#d1d5db");
        doc.font("Helvetica").fontSize(7).fillColor(GRIS)
          .text(label, signatureX + 6, signatureY + 6, { width: signatureWidth - 12, align: "center", lineBreak: false });
        doc.moveTo(signatureX + 10, signatureY + 38).lineTo(signatureX + signatureWidth - 10, signatureY + 38).stroke("#9ca3af");
        doc.fontSize(6).fillColor(GRIS)
          .text("Signature", signatureX + 6, signatureY + 40, { width: signatureWidth - 12, align: "center", lineBreak: false });
      }
      doc.y = signatureY + 58;
    }
  };

  let firstGroup = true;
  for (const [station, rows] of groups) {
    const total = rows.reduce((sum, row) => sum + Number(row.montantPaiementFcfa || 0), 0);
    const pages: BonCarburantReglementData[][] = [];
    for (let i = 0; i < rows.length; i += 18) pages.push(rows.slice(i, i + 18));
    for (const [pageIndex, pageRows] of pages.entries()) {
      if (!firstGroup || pageIndex > 0) doc.addPage();
      await drawHeader(doc, cooperativeId, {
         titre_document: options.titreDocument ?? "FICHE RÈGLEMENT",
         reference: options.reference ?? formatFicheReglementReference(),
      });
      drawStationBlock(station, pageRows, total, pageIndex === 0, pageIndex === pages.length - 1);
    }
    firstGroup = false;
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    await drawFooter(doc, cooperativeId, i + 1, range.count);
  }
  doc.flushPages();
  doc.end();
  return endPromise;
}

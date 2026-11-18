import PDFDocument from "pdfkit";
import type {
  bulletinsPaieTable,
  lignesBulletinTable,
  personnelTable,
} from "@workspace/db";
import { drawHeader } from "./pdfHeaderService.js";

export type BulletinData = {
  bulletin: Pick<
    typeof bulletinsPaieTable.$inferSelect,
    | "id"
    | "annee"
    | "mois"
    | "periode"
    | "salaireBaseFcfa"
    | "totalRetenuesFcfa"
    | "salaireBrutFcfa"
    | "salaireNetFcfa"
    | "chargesCnpsPatronaleFcfa"
    | "chargesTaxeApprentissageFcfa"
    | "chargesFpcFcfa"
    | "coutTotalEmployeurFcfa"
    | "statut"
    | "createdAt"
    | "referencePaiement"
  >;
  agent: Pick<
    typeof personnelTable.$inferSelect,
    | "prenoms"
    | "nom"
    | "poste"
    | "typeContrat"
    | "numeroCnps"
    | "numeroCni"
    | "dateEmbauche"
  > | undefined;
  avantages: Pick<typeof lignesBulletinTable.$inferSelect, "libelle" | "montantFcfa">[];
  retenues: Pick<typeof lignesBulletinTable.$inferSelect, "libelle" | "montantFcfa">[];
};

const PAGE_MARGIN = 40;
const DARK_GREEN = "#06442f";
const GREEN = "#07593a";
const GREEN_MID = "#218044";
const GREEN_PALE = "#e8f2e9";
const GREEN_PALE_ALT = "#f4f8f3";
const RED = "#b92831";
const RED_PALE = "#f8e5e6";
const INK = "#172d27";
const MUTED = "#64766d";
const BORDER = "#d4e0d8";

function formatAmount(amount: number): string {
  // PDFKit's standard fonts render narrow/non-breaking French spaces inconsistently.
  return new Intl.NumberFormat("fr-FR")
    .format(amount)
    .replace(/[\u202F\u00A0]/g, " ") + " FCFA";
}

function formatNumber(amount: number): string {
  return new Intl.NumberFormat("fr-FR")
    .format(amount)
    .replace(/[\u202F\u00A0]/g, " ");
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatAnciennete(dateEmbauche: string | null | undefined): string {
  if (!dateEmbauche) return "—";
  const debut = new Date(dateEmbauche);
  if (Number.isNaN(debut.getTime())) return "—";

  const now = new Date();
  let mois =
    (now.getFullYear() - debut.getFullYear()) * 12 +
    now.getMonth() -
    debut.getMonth();
  if (now.getDate() < debut.getDate()) mois -= 1;
  if (mois < 0) return "—";

  const annees = Math.floor(mois / 12);
  const moisRestants = mois % 12;
  if (annees === 0) return `${moisRestants} mois`;
  const anneeLabel = `${annees} an${annees > 1 ? "s" : ""}`;
  return moisRestants === 0 ? anneeLabel : `${anneeLabel} ${moisRestants} mois`;
}

function fitText(
  doc: InstanceType<typeof PDFDocument>,
  value: string,
  width: number,
  font: string,
  fontSize: number,
): string {
  const text = value || "—";
  doc.font(font).fontSize(fontSize);
  if (doc.widthOfString(text) <= width) return text;

  let shortened = text;
  while (shortened.length > 4 && doc.widthOfString(`${shortened}...`) > width) {
    shortened = shortened.slice(0, -1);
  }
  return shortened.length < text.length ? `${shortened}...` : shortened;
}

function drawText(
  doc: InstanceType<typeof PDFDocument>,
  value: string,
  x: number,
  y: number,
  width: number,
  options: {
    font?: string;
    size?: number;
    color?: string;
    align?: "left" | "center" | "right";
  } = {},
): void {
  const font = options.font ?? "Helvetica";
  const size = options.size ?? 8;
  doc
    .font(font)
    .fontSize(size)
    .fillColor(options.color ?? INK)
    .text(fitText(doc, value, width, font, size), x, y, {
      width,
      align: options.align ?? "left",
      lineBreak: false,
    });
}

function drawSectionBar(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  title: string,
): void {
  doc.save().roundedRect(x, y, width, 21, 6).fill(GREEN).restore();
  doc.circle(x + 13, y + 10.5, 6).fill("#ffffff");
  doc
    .moveTo(x + 10, y + 10.5)
    .lineTo(x + 12, y + 12.5)
    .lineTo(x + 16, y + 8.5)
    .strokeColor(GREEN)
    .lineWidth(1.2)
    .stroke();
  drawText(doc, title, x + 25, y + 6, width - 34, {
    font: "Helvetica-Bold",
    size: 9,
    color: "#ffffff",
  });
}

function drawTableHeader(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  title: string,
  total: string,
  background: string,
  foreground: string,
  totalBackground: string,
): void {
  doc.save().roundedRect(x, y, width, 20, 5).fill(background).restore();
  drawText(doc, title, x + 10, y + 6, width - 155, {
    font: "Helvetica-Bold",
    size: 8.5,
    color: foreground,
  });
  doc.save().roundedRect(x + width - 142, y + 3, 134, 14, 4).fill(totalBackground).restore();
  drawText(doc, total, x + width - 138, y + 6, 126, {
    font: "Helvetica-Bold",
    size: 7.5,
    color: "#ffffff",
    align: "right",
  });
}

function drawLineItem(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  rowHeight: number,
  label: string,
  amount: string,
  index: number,
  options: { color?: string; negative?: boolean; fontSize: number },
): void {
  const background =
    options.negative
      ? index % 2 === 0 ? "#fffafa" : "#fdf3f3"
      : index % 2 === 0 ? "#ffffff" : GREEN_PALE_ALT;
  doc.rect(x, y, width, rowHeight).fill(background);

  const fontSize = Math.min(options.fontSize, Math.max(5.8, rowHeight * 0.58));
  const value = options.negative ? `- ${amount}` : amount;
  const amountWidth = Math.min(145, width * 0.31);
  const textY = y + Math.max(1, (rowHeight - fontSize) / 2 - 0.3);
  drawText(doc, label, x + 10, textY, width - amountWidth - 23, {
    size: fontSize,
    color: INK,
  });
  drawText(doc, value, x + width - amountWidth - 12, textY, amountWidth, {
    font: "Helvetica-Bold",
    size: fontSize,
    color: options.color ?? INK,
    align: "right",
  });
  doc
    .moveTo(x, y + rowHeight)
    .lineTo(x + width, y + rowHeight)
    .strokeColor(options.negative ? "#f2dede" : "#e5ece6")
    .lineWidth(0.35)
    .stroke();
}

function drawStatusBadge(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  status: string,
): void {
  const values: Record<string, { label: string; background: string; foreground: string }> = {
    paye: { label: "PAYÉ", background: "#d8f1df", foreground: "#12643b" },
    valide: { label: "VALIDÉ", background: "#e0ebfb", foreground: "#2359a8" },
    brouillon: { label: "BROUILLON", background: "#fff0ca", foreground: "#8b5c08" },
  };
  const display = values[status] ?? {
    label: status.toUpperCase(),
    background: "#e9ecef",
    foreground: "#475569",
  };
  doc.save().roundedRect(x, y, 70, 22, 7).fill(display.background).restore();
  drawText(doc, display.label, x + 3, y + 7, 64, {
    font: "Helvetica-Bold",
    size: 7,
    color: display.foreground,
    align: "center",
  });
}

function drawSummaryCard(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
  unit = "FCFA",
): void {
  doc.save().roundedRect(x, y, width, 45, 6).fill("#ffffff").restore();
  doc.roundedRect(x, y, width, 45, 6).strokeColor(BORDER).lineWidth(0.7).stroke();
  drawText(doc, label, x + 5, y + 8, width - 10, {
    size: 6.5,
    color: MUTED,
    align: "center",
  });
  drawText(doc, value, x + 5, y + 22, width - 10, {
    font: "Helvetica-Bold",
    size: 9,
    color: DARK_GREEN,
    align: "center",
  });
  if (unit) {
    drawText(doc, unit, x + 5, y + 34, width - 10, {
      size: 6,
      color: MUTED,
      align: "center",
    });
  }
}

export async function drawBulletinOnDoc(
  doc: InstanceType<typeof PDFDocument>,
  cooperativeId: number,
  { bulletin, agent, avantages, retenues }: BulletinData,
): Promise<void> {
  const reference = `BP-${bulletin.annee}-${String(bulletin.mois).padStart(2, "0")}-${String(bulletin.id).padStart(5, "0")}`;
  const width = doc.page.width - PAGE_MARGIN * 2;
  const right = PAGE_MARGIN + width;

  await drawHeader(doc, cooperativeId, {
    titre_document: "Bulletin de paie",
    reference,
    hauteur_reservee: 100,
  });

  let y = Math.max(doc.y + 6, 102);
  const top = y;
  const signatureY = doc.page.height - 108;
  const hasPaymentReference = Boolean(bulletin.referencePaiement);
  const rowCount = Math.max(1, retenues.length) + 1 + avantages.length;

  // Réserve explicitement la place des signatures et du pied de page. Les
  // lignes de paie se resserrent proportionnellement, sans déplacer les totaux.
  const fixedBeforeRows =
    18 + 7 + 78 + 9 + 21 + 6 + 32 + 8 + 20 + 8 + 20;
  const fixedAfterRows =
    9 + 42 + 10 + 45 + 7 + 28 + (hasPaymentReference ? 18 : 0) + 10;
  const rowBudget = Math.max(0, signatureY - top - fixedBeforeRows - fixedAfterRows);
  const rowHeight = Math.max(5.8, Math.min(14, rowBudget / rowCount));
  const rowFontSize = Math.min(8, Math.max(5.8, rowHeight * 0.58));

  // Bandeau période / émission
  doc.save().roundedRect(PAGE_MARGIN, y, width, 18, 5).fill("#eef4ef").restore();
  drawText(doc, `Période : ${bulletin.periode}`, PAGE_MARGIN + 10, y + 6, width * 0.56, {
    font: "Helvetica-Bold",
    size: 7.5,
    color: DARK_GREEN,
  });
  drawText(doc, `Émis le : ${formatDate(bulletin.createdAt)}`, right - width * 0.4, y + 6, width * 0.38, {
    size: 7,
    color: MUTED,
    align: "right",
  });
  y += 25;

  // Identité du salarié et période concernée
  const employeeHeight = 78;
  doc.save().roundedRect(PAGE_MARGIN, y, width, employeeHeight, 8).fill(GREEN_PALE).restore();
  doc.roundedRect(PAGE_MARGIN, y, width, employeeHeight, 8).strokeColor(BORDER).lineWidth(0.7).stroke();
  const dividerX = PAGE_MARGIN + width * 0.49;
  doc
    .moveTo(dividerX, y + 10)
    .lineTo(dividerX, y + employeeHeight - 10)
    .strokeColor("#bfd1c4")
    .lineWidth(0.7)
    .stroke();

  drawText(doc, "SALARIÉ", PAGE_MARGIN + 11, y + 8, width * 0.43, {
    font: "Helvetica-Bold",
    size: 6.5,
    color: GREEN,
  });
  drawText(doc, `${agent?.prenoms ?? ""} ${agent?.nom ?? "—"}`.trim(), PAGE_MARGIN + 11, y + 18, width * 0.43, {
    font: "Helvetica-Bold",
    size: 12,
    color: INK,
  });
  drawText(doc, `Poste : ${agent?.poste ?? "—"}`, PAGE_MARGIN + 11, y + 36, width * 0.43, {
    size: 7,
  });
  drawText(doc, `Contrat : ${(agent?.typeContrat ?? "—").toUpperCase()}`, PAGE_MARGIN + 11, y + 48, width * 0.43, {
    size: 7,
  });
  drawText(doc, `CNPS : ${agent?.numeroCnps ?? "—"}   CNI : ${agent?.numeroCni ?? "—"}`, PAGE_MARGIN + 11, y + 60, width * 0.43, {
    size: 6.2,
    color: MUTED,
  });

  const periodX = dividerX + 12;
  const periodWidth = right - periodX - 82;
  drawText(doc, "PÉRIODE CONCERNÉE", periodX, y + 8, periodWidth, {
    font: "Helvetica-Bold",
    size: 6.5,
    color: GREEN,
  });
  drawText(doc, bulletin.periode, periodX, y + 21, periodWidth, {
    font: "Helvetica-Bold",
    size: 9,
    color: INK,
  });
  drawText(doc, `Date d'entrée : ${formatDate(agent?.dateEmbauche)}`, periodX, y + 39, periodWidth, {
    size: 6.8,
    color: MUTED,
  });
  drawText(doc, `Ancienneté : ${formatAnciennete(agent?.dateEmbauche)}`, periodX, y + 51, periodWidth, {
    size: 6.8,
    color: MUTED,
  });
  drawStatusBadge(doc, right - 77, y + 28, bulletin.statut);
  y += employeeHeight + 9;

  drawSectionBar(doc, PAGE_MARGIN, y, width, "ÉLÉMENTS DE PAIE");
  y += 27;

  // Salaire brut mis en avant
  doc.save().roundedRect(PAGE_MARGIN, y, width, 32, 6).fill("#dceee0").restore();
  drawText(doc, "SALAIRE BRUT", PAGE_MARGIN + 13, y + 11, width - 190, {
    font: "Helvetica-Bold",
    size: 10,
    color: DARK_GREEN,
  });
  doc.save().roundedRect(right - 175, y + 3, 167, 26, 5).fill(DARK_GREEN).restore();
  drawText(doc, formatAmount(bulletin.salaireBrutFcfa), right - 169, y + 11, 155, {
    font: "Helvetica-Bold",
    size: 10,
    color: "#ffffff",
    align: "right",
  });
  y += 40;

  // Retenues réelles du bulletin
  drawTableHeader(
    doc,
    PAGE_MARGIN,
    y,
    width,
    "LES RETENUES",
    formatAmount(bulletin.totalRetenuesFcfa),
    RED_PALE,
    "#8d1d25",
    RED,
  );
  y += 20;
  const retenueRows = retenues.length > 0
    ? retenues
    : [{ libelle: "Aucune retenue", montantFcfa: 0 }];
  retenueRows.forEach((line, index) => {
    drawLineItem(
      doc,
      PAGE_MARGIN,
      y,
      width,
      rowHeight,
      line.libelle,
      formatAmount(line.montantFcfa),
      index,
      { color: RED, negative: retenues.length > 0, fontSize: rowFontSize },
    );
    y += rowHeight;
  });

  y += 8;
  // Salaire de base et avantages réels
  drawTableHeader(
    doc,
    PAGE_MARGIN,
    y,
    width,
    "RÉMUNÉRATION DÉTAILLÉE",
    "Montant",
    GREEN_PALE,
    DARK_GREEN,
    GREEN_MID,
  );
  y += 20;
  const remunerationRows = [
    { libelle: "Salaire de base", montantFcfa: bulletin.salaireBaseFcfa },
    ...avantages.map((line) => ({ libelle: line.libelle, montantFcfa: line.montantFcfa })),
  ];
  remunerationRows.forEach((line, index) => {
    drawLineItem(
      doc,
      PAGE_MARGIN,
      y,
      width,
      rowHeight,
      line.libelle,
      formatAmount(line.montantFcfa),
      index,
      { color: index === 0 ? DARK_GREEN : GREEN_MID, fontSize: rowFontSize },
    );
    y += rowHeight;
  });

  y += 9;
  // Net à payer calculé par le système
  doc.save().roundedRect(PAGE_MARGIN, y, width, 42, 8).fill(DARK_GREEN).restore();
  doc.circle(PAGE_MARGIN + 21, y + 21, 12).fill("#ffffff");
  doc
    .moveTo(PAGE_MARGIN + 15, y + 21)
    .lineTo(PAGE_MARGIN + 19, y + 25)
    .lineTo(PAGE_MARGIN + 27, y + 17)
    .strokeColor(GREEN_MID)
    .lineWidth(2)
    .stroke();
  drawText(doc, "NET À PAYER", PAGE_MARGIN + 43, y + 15, width - 210, {
    font: "Helvetica-Bold",
    size: 12,
    color: "#ffffff",
  });
  drawText(doc, formatAmount(bulletin.salaireNetFcfa), right - 170, y + 14, 156, {
    font: "Helvetica-Bold",
    size: 12,
    color: "#ffffff",
    align: "right",
  });
  y += 52;

  // Récapitulatif des principaux montants
  const cardGap = 7;
  const cardWidth = (width - cardGap * 3) / 4;
  drawSummaryCard(doc, PAGE_MARGIN, y, cardWidth, "Salaire brut", formatNumber(bulletin.salaireBrutFcfa));
  drawSummaryCard(doc, PAGE_MARGIN + cardWidth + cardGap, y, cardWidth, "Total retenues", formatNumber(bulletin.totalRetenuesFcfa));
  drawSummaryCard(doc, PAGE_MARGIN + (cardWidth + cardGap) * 2, y, cardWidth, "Net à payer", formatNumber(bulletin.salaireNetFcfa));
  drawSummaryCard(doc, PAGE_MARGIN + (cardWidth + cardGap) * 3, y, cardWidth, "Période", bulletin.periode, "");
  y += 52;

  // Les charges patronales restent visibles, sans être ajoutées au net salarié.
  doc.save().roundedRect(PAGE_MARGIN, y, width, 28, 5).fill("#f2f6f2").restore();
  doc.roundedRect(PAGE_MARGIN, y, width, 28, 5).strokeColor(BORDER).lineWidth(0.6).stroke();
  drawText(doc, "CHARGES EMPLOYEUR", PAGE_MARGIN + 9, y + 4, width - 18, {
    font: "Helvetica-Bold",
    size: 6,
    color: MUTED,
  });
  const employerCharges: Array<[string, number]> = [
    ["CNPS patronale", bulletin.chargesCnpsPatronaleFcfa],
    ["Taxe apprentissage", bulletin.chargesTaxeApprentissageFcfa],
    ["FPC", bulletin.chargesFpcFcfa],
    ["Coût total", bulletin.coutTotalEmployeurFcfa],
  ];
  const chargeWidth = width / employerCharges.length;
  employerCharges.forEach(([label, amount], index) => {
    const chargeX = PAGE_MARGIN + index * chargeWidth;
    drawText(doc, `${label} : ${formatNumber(amount)}`, chargeX + 8, y + 15, chargeWidth - 12, {
      font: "Helvetica-Bold",
      size: 6.2,
      color: index === 3 ? DARK_GREEN : INK,
    });
  });
  y += 28;

  if (bulletin.referencePaiement) {
    drawText(
      doc,
      `Référence de paiement : ${bulletin.referencePaiement}`,
      PAGE_MARGIN + 2,
      y + 5,
      width - 4,
      { size: 6.5, color: MUTED },
    );
    y += 18;
  }

  // Signatures ancrées au bas de la page, au-dessus du pied dynamique.
  const signatureHeight = 44;
  const signatureWidth = (width - 16) / 2;
  const signatures = [
    { x: PAGE_MARGIN, title: "LE DIRECTEUR", hint: "Direction Générale" },
    { x: PAGE_MARGIN + signatureWidth + 16, title: "LE SALARIÉ", hint: "Signature" },
  ];
  for (const signature of signatures) {
    doc.save().roundedRect(signature.x, signatureY, signatureWidth, signatureHeight, 7).fill("#f7f8f5").restore();
    doc.roundedRect(signature.x, signatureY, signatureWidth, signatureHeight, 7).strokeColor(BORDER).lineWidth(0.7).stroke();
    drawText(doc, signature.title, signature.x + 8, signatureY + 7, signatureWidth - 16, {
      font: "Helvetica-Bold",
      size: 7.5,
      color: INK,
      align: "center",
    });
    doc
      .moveTo(signature.x + 25, signatureY + 31)
      .lineTo(signature.x + signatureWidth - 25, signatureY + 31)
      .strokeColor("#83958b")
      .lineWidth(0.6)
      .stroke();
    drawText(doc, signature.hint, signature.x + 8, signatureY + 35, signatureWidth - 16, {
      size: 5.8,
      color: MUTED,
      align: "center",
    });
  }
}

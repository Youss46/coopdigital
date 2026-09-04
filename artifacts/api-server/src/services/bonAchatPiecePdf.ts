import PDFDocument from "pdfkit";
import { drawHeader } from "./pdfHeaderService";

const MARGIN = 40;
const WIDTH = 515;
const GREEN = "#166534";
const GRAY = "#6b7280";

function dateFr(value: string): string {
  return new Date(value).toLocaleDateString("fr-FR");
}

function fcfa(value: string): string {
  return `${Math.round(Number(value)).toLocaleString("fr-FR").replace(/[\u202F\u00A0]/g, " ")} FCFA`;
}

export async function generateBonAchatPiece(cooperativeId: number, data: {
  id: number;
  dateDepense: string;
  montantFcfa: string;
  libelle: string;
  fournisseur: string | null;
  referencePiece: string | null;
  quantite: string | null;
  unite: string | null;
  immatriculation: string | null;
  marque: string | null;
  modele: string | null;
}): Promise<Buffer> {
  const numero = `BAP-${String(data.id).padStart(5, "0")}`;
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  await drawHeader(doc, cooperativeId, { titre_document: "BON D'ACHAT — PIÈCE DE RECHANGE", reference: numero });
  let y = doc.y + 12;
  doc.rect(MARGIN, y, WIDTH, 34).fill("#f0fdf4");
  doc.font("Helvetica-Bold").fontSize(15).fillColor(GREEN)
    .text(numero, MARGIN + 10, y + 9, { width: 250 });
  doc.font("Helvetica").fontSize(9).fillColor("#111827")
    .text(`Date : ${dateFr(data.dateDepense)}`, MARGIN + 300, y + 12, { width: 200, align: "right" });
  y += 52;

  const rows: Array<[string, string]> = [
    ["Véhicule", `${data.immatriculation ?? "—"} — ${`${data.marque ?? ""} ${data.modele ?? ""}`.trim() || "—"}`],
    ["Pièce / Désignation", data.libelle],
    ["Référence", data.referencePiece ?? "—"],
    ["Quantité", data.quantite ? `${Number(data.quantite)} ${data.unite ?? ""}`.trim() : "—"],
    ["Fournisseur", data.fournisseur ?? "—"],
    ["Montant autorisé", fcfa(data.montantFcfa)],
  ];
  for (const [index, [label, value]] of rows.entries()) {
    doc.rect(MARGIN, y, WIDTH, 30).fill(index % 2 === 0 ? "#f9fafb" : "#ffffff").stroke("#e5e7eb");
    doc.font("Helvetica").fontSize(8).fillColor(GRAY).text(label.toUpperCase(), MARGIN + 8, y + 10, { width: 135 });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#111827").text(value, MARGIN + 150, y + 9, { width: WIDTH - 160 });
    y += 30;
  }

  y += 55;
  const signatureWidth = (WIDTH - 20) / 3;
  ["Demandeur", "Responsable / Approbateur", "Fournisseur"].forEach((label, index) => {
    const x = MARGIN + index * (signatureWidth + 10);
    doc.rect(x, y, signatureWidth, 75).stroke("#d1d5db");
    doc.font("Helvetica-Bold").fontSize(8).fillColor(GRAY).text(label, x + 5, y + 8, { width: signatureWidth - 10, align: "center" });
    doc.moveTo(x + 15, y + 58).lineTo(x + signatureWidth - 15, y + 58).stroke("#9ca3af");
    doc.font("Helvetica").fontSize(7).text("Signature", x + 5, y + 62, { width: signatureWidth - 10, align: "center" });
  });

  doc.end();
  return finished;
}
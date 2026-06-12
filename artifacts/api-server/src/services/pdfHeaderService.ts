/**
 * Service en-tête/pied-de-page PDF — logo dynamique par coopérative
 * Récupère le logo depuis l'object storage ou utilise le logo CoopDigital par défaut.
 * Cache mémoire : config 5 min, logo 30 min.
 */
import PDFDocument from "pdfkit";
import path from "path";
import fs from "fs";
import { getConfig } from "./configService";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { logger } from "../lib/logger";

type PdfDoc = InstanceType<typeof PDFDocument>;

const DEFAULT_LOGO_PATH = path.join(process.cwd(), "public", "logo-192.png");
const objectStorageService = new ObjectStorageService();

// ── Caches mémoire ────────────────────────────────────────────────────────────
interface Entry<T> { data: T; ts: number }
const CONFIG_TTL = 5 * 60 * 1000;   // 5 min
const LOGO_TTL   = 30 * 60 * 1000;  // 30 min

type CoopConfig = Awaited<ReturnType<typeof getConfig>>;
const configCache = new Map<number, Entry<CoopConfig>>();
const logoCache   = new Map<number, Entry<{ buffer: Buffer; source: "cooperative" | "default" }>>();

// ── Helpers cache ─────────────────────────────────────────────────────────────

async function getCachedConfig(cooperativeId: number): Promise<CoopConfig> {
  const hit = configCache.get(cooperativeId);
  if (hit && Date.now() - hit.ts < CONFIG_TTL) return hit.data;
  const data = await getConfig(cooperativeId);
  configCache.set(cooperativeId, { data, ts: Date.now() });
  return data;
}

export function invalidateLogoCache(cooperativeId: number): void {
  logoCache.delete(cooperativeId);
  configCache.delete(cooperativeId);
}

// ── Récupération du buffer logo ───────────────────────────────────────────────

async function fetchFromStorage(logoUrl: string): Promise<Buffer> {
  // logoUrl stocké en DB : "/api/storage/objects/uploads/<uuid>"
  // On strip "/api/storage" pour obtenir le chemin d'entité
  const entityPath = logoUrl.replace(/^\/api\/storage/, "");
  const file = await objectStorageService.getObjectEntityFile(entityPath);
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const stream = file.createReadStream();
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function getLogoBuffer(
  cooperativeId: number,
): Promise<{ buffer: Buffer; source: "cooperative" | "default" }> {
  const hit = logoCache.get(cooperativeId);
  if (hit && Date.now() - hit.ts < LOGO_TTL) return hit.data;

  const config = await getCachedConfig(cooperativeId);
  let result: { buffer: Buffer; source: "cooperative" | "default" };

  if (config?.logoUrl) {
    try {
      let buffer: Buffer;
      if (config.logoUrl.startsWith("data:")) {
        // Logo stocké en base64 data URL (nouveau format)
        const base64Data = config.logoUrl.split(",")[1] ?? "";
        buffer = Buffer.from(base64Data, "base64");
      } else {
        // Ancien format : Object Storage path
        buffer = await fetchFromStorage(config.logoUrl);
      }
      result = { buffer, source: "cooperative" };
    } catch (err) {
      if (!(err instanceof ObjectNotFoundError)) {
        logger.warn({ err, cooperativeId }, "Logo coop inaccessible — utilisation logo par défaut");
      }
      result = { buffer: fs.readFileSync(DEFAULT_LOGO_PATH), source: "default" };
    }
  } else {
    result = { buffer: fs.readFileSync(DEFAULT_LOGO_PATH), source: "default" };
  }

  logoCache.set(cooperativeId, { data: result, ts: Date.now() });
  return result;
}

// ── En-tête ───────────────────────────────────────────────────────────────────

export interface DrawHeaderOptions {
  /** Titre affiché dans la boîte droite, ex: "FICHE MEMBRE" */
  titre_document?: string;
  /** Référence sous le titre, ex: "MBR-0042" */
  reference?: string;
  /** Afficher le numéro d'agrément (défaut: true) */
  show_agrement?: boolean;
  /** Position Y où positionner le curseur après l'en-tête (défaut: 98) */
  hauteur_reservee?: number;
}

export async function drawHeader(
  doc: PdfDoc,
  cooperativeId: number,
  options: DrawHeaderOptions = {},
): Promise<void> {
  const [config, { buffer: logoBuffer, source: logoSource }] = await Promise.all([
    getCachedConfig(cooperativeId),
    getLogoBuffer(cooperativeId),
  ]);

  const couleur      = config?.couleurPrimaire   || "#1a4731";
  const pageWidth    = doc.page.width;
  const marginLeft   = 40;
  const marginRight  = 40;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const hasTitre     = Boolean(options.titre_document);
  const titreBoxW    = 123;

  // ── Barre colorée en haut (4px) ─────────────────────────────────────────────
  doc.save().rect(0, 0, pageWidth, 4).fill(couleur).restore();

  // ── Logo gauche (55×55) ──────────────────────────────────────────────────────
  const logoSize = 55;
  const logoX    = marginLeft;
  const logoY    = 12;
  try {
    doc.image(logoBuffer, logoX, logoY, {
      width: logoSize,
      height: logoSize,
      fit: [logoSize, logoSize],
    });
  } catch (_) {
    // Format non supporté par PDFKit (SVG, WebP, etc.) → repli sur logo par défaut
    if (logoSource === "cooperative") {
      try {
        const fallback = fs.readFileSync(DEFAULT_LOGO_PATH);
        doc.image(fallback, logoX, logoY, {
          width: logoSize,
          height: logoSize,
          fit: [logoSize, logoSize],
        });
      } catch (_2) { /* logo facultatif */ }
    }
  }

  // ── Infos coopérative (centre) ───────────────────────────────────────────────
  const infoX     = logoX + logoSize + 12;
  const infoWidth = contentWidth - logoSize - 12 - (hasTitre ? titreBoxW + 16 : 0);

  doc
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .fillColor(couleur)
    .text(config?.nomComplet || "CoopDigital", infoX, 16, { width: infoWidth, lineBreak: false });

  // ── Slogan (optionnel, italique, sous le nom) ─────────────────────────────────
  if (config?.slogan) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(7.5)
      .fillColor("#555555")
      .text(config.slogan, infoX, 31, { width: infoWidth, lineBreak: false });
  }

  doc.font("Helvetica").fontSize(8).fillColor("#444444");

  // Ligne 1 : localisation (adresse · ville)
  const locParts: string[] = [];
  if (config?.adresse) locParts.push(config.adresse);
  if (config?.ville)   locParts.push(config.ville);
  const locLine = locParts.join(" · ");

  // Ligne 2 : contact (Tél · email)
  const contactParts: string[] = [];
  if (config?.telephone) contactParts.push(`Tél : ${config.telephone}`);
  if (config?.email)     contactParts.push(config.email);
  const contactLine = contactParts.join(" · ");

  // Si slogan présent, les infos démarrent 11pt plus bas
  let currentY = config?.slogan ? 42 : 31;
  if (locLine) {
    doc.text(locLine, infoX, currentY, { width: infoWidth, lineBreak: false });
    currentY += 11;
  }
  if (contactLine) {
    doc.text(contactLine, infoX, currentY, { width: infoWidth, lineBreak: false });
    currentY += 11;
  }

  if (config?.numeroAgrement && options.show_agrement !== false) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(7.5)
      .fillColor("#777777")
      .text(
        `Agrément N° ${config.numeroAgrement}`,
        infoX,
        currentY + 1,
        { width: infoWidth, lineBreak: false },
      );
  }

  // ── Boîte titre document (droite) ────────────────────────────────────────────
  if (hasTitre) {
    const titreX = pageWidth - marginRight - titreBoxW + 8;
    const titreY = 12;

    doc.save().rect(titreX - 8, titreY - 4, titreBoxW, 40).fill(couleur).restore();

    doc
      .font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor("#ffffff")
      .text(options.titre_document!.toUpperCase(), titreX, titreY + 3, {
        width: titreBoxW - 8,
        align: "center",
        lineBreak: true,
      });

    if (options.reference) {
      doc
        .font("Helvetica")
        .fontSize(7.5)
        .fillColor("#ffffff")
        .text(options.reference, titreX - 8, titreY + 22, {
          width: titreBoxW,
          align: "center",
          lineBreak: false,
        });
    }

    const dateGen = new Date().toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor("#888888")
      .text(`Généré le ${dateGen}`, titreX - 8, titreY + 46, {
        width: titreBoxW,
        align: "center",
      });
  }

  // ── Ligne séparatrice ────────────────────────────────────────────────────────
  doc
    .moveTo(marginLeft, 76)
    .lineTo(pageWidth - marginRight, 76)
    .strokeColor(couleur)
    .lineWidth(1)
    .stroke();

  // ── Filigrane si logo par défaut ─────────────────────────────────────────────
  if (logoSource === "default") {
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor("#cccccc")
      .text("Powered by CoopDigital — M15 Tech", marginLeft, 80, {
        width: contentWidth,
        align: "right",
      });
  }

  // ── Repositionne le curseur ───────────────────────────────────────────────────
  doc.x = marginLeft;
  doc.y = options.hauteur_reservee ?? 96;
}

// ── Pied de page ──────────────────────────────────────────────────────────────

export async function drawFooter(
  doc: PdfDoc,
  cooperativeId: number,
  numeroPage: number,
  totalPages: number,
): Promise<void> {
  const config = await getCachedConfig(cooperativeId);

  const couleur      = config?.couleurPrimaire || "#1a4731";
  const pageWidth    = doc.page.width;
  const pageHeight   = doc.page.height;
  const marginLeft   = 40;
  const marginRight  = 40;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const footerY      = pageHeight - 32;

  doc
    .moveTo(marginLeft, footerY - 6)
    .lineTo(pageWidth - marginRight, footerY - 6)
    .strokeColor("#dddddd")
    .lineWidth(0.5)
    .stroke();

  const piedTexte =
    config?.piedDePagePdf ??
    `${config?.nomComplet ?? "CoopDigital"} — Document confidentiel`;

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#888888")
    .text(piedTexte, marginLeft, footerY, {
      width: contentWidth - 60,
      lineBreak: false,
    });

  doc
    .font("Helvetica-Bold")
    .fontSize(7)
    .fillColor(couleur)
    .text(
      `Page ${numeroPage} / ${totalPages}`,
      pageWidth - marginRight - 55,
      footerY,
      { width: 55, align: "right" },
    );
}

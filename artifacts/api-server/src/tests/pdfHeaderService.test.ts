import { describe, expect, it, vi, beforeEach } from "vitest";
import PDFDocument from "pdfkit";

const getConfigMock = vi.hoisted(() => vi.fn());

vi.mock("../services/configService.js", () => ({
  getConfig: getConfigMock,
}));

const { drawHeader, invalidateLogoCache } = await import("../services/pdfHeaderService.js");

const COOPERATIVE_ID = 158;
const LONG_NAME =
  "COOPERATIVE AGRICOLE DES PRODUCTEURS DE CACAO DURABLE DE LA GRANDE REGION DU SUD-OUEST";
const LONG_SLOGAN =
  "ENSEMBLE POUR UNE AGRICULTURE RESPONSABLE, UNE QUALITE CERTIFIEE ET UN AVENIR PROSPERE";
const LONG_BANK = "BANQUE INTERNATIONALE DE DEVELOPPEMENT AGRICOLE ET COOPERATIF";
const LONG_ACCOUNT = "001234567890123456789012345678901234";
const LONG_IBAN = "CI93 12345 67890 123456789012345678901234567890";

function finishPdf(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

describe("en-tête PDF avec informations longues", () => {
  beforeEach(() => {
    getConfigMock.mockResolvedValue({
      cooperativeId: COOPERATIVE_ID,
      nomComplet: LONG_NAME,
      slogan: LONG_SLOGAN,
      banquePrincipale: LONG_BANK,
      numeroCompteBancaire: LONG_ACCOUNT,
      iban: LONG_IBAN,
      couleurPrimaire: "#1a4731",
      logoUrl: null,
    });
    invalidateLogoCache(COOPERATIVE_ID);
  });

  it("génère un document valide sans mélanger les informations avec la boîte de titre", async () => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const textSpy = vi.spyOn(doc, "text");

    await drawHeader(doc, COOPERATIVE_ID, {
      titre_document: "Reçu de paiement",
      reference: "REC-2026-00158",
      hauteur_reservee: 90,
    });
    const bodyY = doc.y;
    doc.font("Helvetica").fontSize(9).text("CORPS DU DOCUMENT", 50, bodyY);
    const pdf = await finishPdf(doc);

    expect(pdf.slice(0, 4).toString()).toBe("%PDF");
    expect(pdf.length).toBeGreaterThan(1000);
    expect(bodyY).toBeGreaterThan(90);
    expect(bodyY).toBeLessThan(doc.page.height - doc.page.margins.bottom);

    const titleBoxLeft = doc.page.width - 40 - 123;
    const infoCalls = Array.from(textSpy.mock.calls, (call) => Array.from(call)).filter(([text]) =>
      typeof text === "string" &&
      (text.includes(LONG_NAME) || text.includes(LONG_SLOGAN) || text.includes(LONG_IBAN)),
    );

    expect(infoCalls).toHaveLength(3);
    for (const call of infoCalls) {
      const x = call[1];
      const options = call[3];
      if (typeof x !== "number" || !hasTextWidth(options)) {
        throw new Error("L'appel de texte d'en-tête n'a pas de position ou largeur");
      }
      const y = call[2];
      expect(typeof y).toBe("number");
      expect(y).toBeLessThan(bodyY);
      expect(x).toBeGreaterThanOrEqual(124);
      expect(x + options.width).toBeLessThanOrEqual(titleBoxLeft);
    }
  });
});

function hasTextWidth(value: unknown): value is { width: number } {
  return typeof value === "object" && value !== null &&
    "width" in value && typeof value.width === "number";
}
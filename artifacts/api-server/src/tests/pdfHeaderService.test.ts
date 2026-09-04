import { describe, expect, it, vi } from "vitest";
import PDFDocument from "pdfkit";

const getConfigMock = vi.hoisted(() => vi.fn());

vi.mock("../services/configService.js", () => ({
  getConfig: getConfigMock,
}));

const { drawHeader, invalidateLogoCache } = await import("../services/pdfHeaderService.js");

describe("pdfHeaderService", () => {
  it("gère les identités et coordonnées longues sans chevauchement", async () => {
    const config = {
      cooperativeId: 1,
      nomComplet: "Société Coopérative Simplifiée Pour Le Bien Être Des Producteurs d'Agboville",
      slogan: "Des Producteurs d'Agboville",
      adresse: "Agboville Quartier Artisanal à 100 m derrière la nouvelle CNPS",
      ville: "AGBOVILLE",
      telephone: "0700000000",
      email: "cooperative@example.com",
      numeroAgrement: "RC0040318",
      banquePrincipale: "NSIA",
      numeroCompteBancaire: "CI042-14284-079694802001-17",
      iban: "CI93 CI04 8407 9694 8020 0117",
      couleurPrimaire: "#1a4731",
      logoUrl: null,
    };
    getConfigMock.mockResolvedValue(config);
    invalidateLogoCache(1);

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    const textSpy = vi.spyOn(doc, "text");
    const chunks: Buffer[] = [];
    const pdfComplete = new Promise<Buffer>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
    });

    await drawHeader(doc, 1, {
      titre_document: "Reçu de Livraison",
      reference: "PES-S-8",
    });

    const calls = textSpy.mock.calls as unknown as Array<
      [string, number?, number?, { width?: number; lineBreak?: boolean }?]
    >;
    const nameCall = calls.find(([text]) => text === config.nomComplet);
    const infoCalls = calls.filter(([, x]) => x === 124);

    expect(nameCall).toBeDefined();
    expect(nameCall?.[3]?.lineBreak).toBe(true);
    expect(nameCall?.[3]?.width).toBeLessThan(293);
    expect(infoCalls.length).toBeGreaterThanOrEqual(6);
    expect(doc.y).toBeGreaterThan(110);

    doc.end();
    const pdf = await pdfComplete;
    expect(pdf.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";
import PDFDocument from "pdfkit";
import zlib from "zlib";
import { writeFile } from "node:fs/promises";
import { db } from "@workspace/db";
import type { BulletinData } from "../services/bulletinPaiePdf.js";

const drawHeaderMock = vi.hoisted(() => vi.fn());
const drawFooterMock = vi.hoisted(() => vi.fn());

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((_table: unknown, name: string) => ({ _: { name } })),
}));

vi.mock("../services/pdfHeaderService.js", () => ({
  drawHeader: drawHeaderMock,
  drawFooter: drawFooterMock,
}));

vi.mock("../services/portailService.js", () => ({
  computeCodeMembre: vi.fn().mockReturnValue("MBR-00001"),
}));

const { drawBulletinOnDoc } = await import("../services/bulletinPaiePdf.js");
const { generateBulletinPaie, generateBulletinsPaieGroupes } = await import("../services/pdfService.js");

function makeBulletin(
  id: number,
  advantageCount = 10,
  deductionCount = 8,
): BulletinData {
  const avantages = Array.from({ length: advantageCount }, (_, index) => ({
    libelle: `Prime variable ${String(index + 1).padStart(2, "0")}`,
    type: "avantage" as const,
    montantFcfa: 1_000,
  }));
  const retenues = Array.from({ length: deductionCount }, (_, index) => ({
    libelle: `Retenue variable ${String(index + 1).padStart(2, "0")}`,
    type: "retenue" as const,
    montantFcfa: 100,
  }));
  const totalAvantagesFcfa = avantages.reduce((sum, line) => sum + line.montantFcfa, 0);
  const totalRetenuesFcfa = retenues.reduce((sum, line) => sum + line.montantFcfa, 0);
  const salaireBaseFcfa = 700_000;
  const salaireBrutFcfa = salaireBaseFcfa + totalAvantagesFcfa;

  return {
    bulletin: {
      id,
      annee: 2026,
      mois: 11,
      periode: "Novembre 2026",
      salaireBaseFcfa,
      totalRetenuesFcfa,
      salaireBrutFcfa,
      salaireNetFcfa: salaireBrutFcfa - totalRetenuesFcfa,
      chargesCnpsPatronaleFcfa: 31_000,
      chargesTaxeApprentissageFcfa: 2_000,
      chargesFpcFcfa: 1_000,
      coutTotalEmployeurFcfa: salaireBrutFcfa + 34_000,
      statut: "paye",
      createdAt: new Date("2026-11-17T12:00:00.000Z"),
      referencePaiement: `PAY-PAIE-${String(id).padStart(5, "0")}`,
    },
    agent: {
      prenoms: id === 42 ? "Angé" : "Mariame",
      nom: id === 42 ? "Guei" : "Kouassi",
      poste: "Responsable administratif",
      typeContrat: "cdi",
      numeroCnps: "CNPS-0072",
      numeroCni: "CI-0042",
      dateEmbauche: "2022-01-01",
    },
    avantages,
    retenues,
  };
}

function finishPdf(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function extractPdfText(buffer: Buffer): string {
  const parts = [buffer.toString("latin1")];
  let position = 0;

  while (position < buffer.length) {
    let marker = buffer.indexOf(Buffer.from("stream\r\n"), position);
    let delimiterLength = 8;
    const alternate = buffer.indexOf(Buffer.from("stream\n"), position);
    if (marker === -1 || (alternate !== -1 && alternate < marker)) {
      marker = alternate;
      delimiterLength = 7;
    }
    if (marker === -1) break;

    const contentStart = marker + delimiterLength;
    const endMarker = buffer.indexOf(Buffer.from("endstream"), contentStart);
    if (endMarker === -1) break;
    try {
      const content = zlib.inflateSync(buffer.slice(contentStart, endMarker)).toString("latin1");
      parts.push(content);
      const singleTextDecoded = content.replace(
        /<([0-9A-Fa-f]{2,})>/g,
        (_match, hex: string) => Buffer.from(hex, "hex").toString("latin1"),
      );
      parts.push(singleTextDecoded);
      const joinedText = content.replace(
        /\[([^\]]*)\]\s*TJ/g,
        (_match, inside: string) => Array.from(inside.matchAll(/<([0-9A-Fa-f]{2,})>/g))
          .map((match) => Buffer.from(match[1]!, "hex").toString("latin1"))
          .join(""),
      );
      parts.push(joinedText);
    } catch {
      // Ignore non-text streams, such as embedded images.
    }
    position = endMarker + 9;
  }

  return parts.join("\n");
}

function makeSelectChain(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ["from", "where", "orderBy"]) chain[method] = vi.fn(self);
  chain["where"] = vi.fn(() => Promise.resolve(data));
  chain["then"] = (
    resolve: (value: unknown) => unknown,
    reject?: (error: unknown) => unknown,
  ) => Promise.resolve(data).then(resolve, reject);
  return chain;
}

function queueBulletinData(data: BulletinData): void {
  const lignes = [
    ...data.avantages.map((line) => ({ ...line, type: "avantage" })),
    ...data.retenues.map((line) => ({ ...line, type: "retenue" })),
  ];
  vi.mocked(db.select)
    .mockReturnValueOnce(makeSelectChain([data.bulletin]) as unknown as ReturnType<typeof db.select>)
    .mockReturnValueOnce(makeSelectChain(data.agent ? [data.agent] : []) as unknown as ReturnType<typeof db.select>)
    .mockReturnValueOnce(makeSelectChain(lignes) as unknown as ReturnType<typeof db.select>);
}

function getPageCount(pdf: Buffer): number {
  const match = pdf.toString("latin1").match(/\/Count\s+(\d+)/);
  return Number(match?.[1] ?? 0);
}

function normalizePdfText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\u0096\u0097]/g, "-")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe("mise en page PDF du bulletin de paie", () => {
  beforeEach(() => {
    drawHeaderMock.mockClear();
    drawHeaderMock.mockResolvedValue(undefined);
    drawFooterMock.mockClear();
    drawFooterMock.mockResolvedValue(undefined);
    vi.mocked(db.select).mockReset();
  });

  it("reprend les vraies rubriques et tient sur une page avec de nombreuses lignes", async () => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    const data = makeBulletin(42, 10, 8);

    await drawBulletinOnDoc(doc, 158, data);

    expect(doc.bufferedPageRange().count).toBe(1);
    expect(drawHeaderMock).toHaveBeenCalledWith(
      doc,
      158,
      expect.objectContaining({
        titre_document: "Bulletin de paie",
        reference: "BP-2026-11-00042",
      }),
    );

    const pdf = await finishPdf(doc);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    if (process.env.BULLETIN_PDF_PREVIEW === "1") {
      await writeFile("/tmp/bulletin-paie-preview.pdf", pdf);
    }

    const text = normalizePdfText(extractPdfText(pdf));
    expect(text).toContain("elements de paie");
    expect(text).toContain("les retenues");
    expect(text).toContain("remuneration detaillee");
    expect(text).toContain("salaire de base");
    expect(text).toContain("prime variable 10");
    expect(text).toContain("retenue variable 08");
    expect(text).toContain("710 000 fcfa");
    expect(text).toContain("709 200 fcfa");
    expect(text).toContain("pay- paie- 00042".replace(/\s/g, ""));
  });

  it("garde une page A4 par salarié dans un document groupé", async () => {
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    await drawBulletinOnDoc(doc, 158, makeBulletin(42, 2, 2));
    doc.addPage();
    await drawBulletinOnDoc(doc, 158, makeBulletin(43, 1, 1));

    expect(doc.bufferedPageRange().count).toBe(2);
    const pdf = await finishPdf(doc);
    const text = normalizePdfText(extractPdfText(pdf));
    expect(text).toContain("ange guei");
    expect(text).toContain("mariame kouassi");
    expect(drawHeaderMock).toHaveBeenNthCalledWith(
      1,
      doc,
      158,
      expect.objectContaining({ reference: "BP-2026-11-00042" }),
    );
    expect(drawHeaderMock).toHaveBeenNthCalledWith(
      2,
      doc,
      158,
      expect.objectContaining({ reference: "BP-2026-11-00043" }),
    );
  });

  it("génère le bulletin individuel avec les montants du dossier", async () => {
    const data = makeBulletin(42, 3, 2);
    queueBulletinData(data);

    const pdf = await generateBulletinPaie(42, 158);

    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    expect(getPageCount(pdf)).toBe(1);
    expect(drawHeaderMock).toHaveBeenCalledWith(
      expect.anything(),
      158,
      expect.objectContaining({ reference: "BP-2026-11-00042" }),
    );
    expect(drawFooterMock).toHaveBeenCalledWith(expect.anything(), 158, 1, 1);
    const text = normalizePdfText(extractPdfText(pdf));
    expect(text).toContain("703 000 fcfa");
    expect(text).toContain("702 800 fcfa");
    expect(text).toContain("prime variable 03");
    expect(text).toContain("retenue variable 02");
    expect(text).toContain("charges employeur");
    expect(text).toContain("cnps patronale");
    expect(text).toContain("reference de paiement");
    expect(text).not.toContain("1 875 000");
  });

  it("exporte les bulletins groupés sur une page A4 par salarié", async () => {
    queueBulletinData(makeBulletin(42, 2, 2));
    queueBulletinData(makeBulletin(43, 1, 1));

    const pdf = await generateBulletinsPaieGroupes([42, 43], 158);

    expect(getPageCount(pdf)).toBe(2);
    expect(drawHeaderMock).toHaveBeenCalledTimes(2);
    expect(drawFooterMock).toHaveBeenCalledTimes(2);
    expect(drawFooterMock).toHaveBeenNthCalledWith(1, expect.anything(), 158, 1, 2);
    expect(drawFooterMock).toHaveBeenNthCalledWith(2, expect.anything(), 158, 2, 2);
    expect(drawHeaderMock).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      158,
      expect.objectContaining({ reference: "BP-2026-11-00042" }),
    );
    expect(drawHeaderMock).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      158,
      expect.objectContaining({ reference: "BP-2026-11-00043" }),
    );
  });
});

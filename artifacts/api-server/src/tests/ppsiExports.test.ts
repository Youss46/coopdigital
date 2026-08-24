import { beforeEach, describe, expect, it, vi } from "vitest";
import zlib from "zlib";
import { db } from "@workspace/db";

vi.mock("../services/pdfHeaderService.js", () => ({
  drawHeader: vi.fn().mockResolvedValue(undefined),
  drawFooter: vi.fn().mockResolvedValue(undefined),
}));

const { exporterPpsi, genererPpsiPdf } = await import("../services/fiscaliteService.js");

type PpsiRow = {
  date: string;
  prestataire: string;
  brut: number;
  reference: string;
};

function selectChain<T>(rows: T[], withLimit = false) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ["from", "where", "orderBy"]) {
    chain[method] = vi.fn(self);
  }
  chain.then = (resolve: (value: T[]) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  if (withLimit) {
    chain.limit = vi.fn(() => Promise.resolve(rows));
  }
  return chain;
}

function mockPpsiQueries(rows: PpsiRow[], taux: string) {
  vi.mocked(db.select)
    .mockReturnValueOnce(selectChain(rows) as never)
    .mockReturnValueOnce(selectChain([{ tauxPct: taux }], true) as never);
}

function csvFields(line: string): string[] {
  return line.slice(1, -1).split('";"').map(value => value.replaceAll('""', '"'));
}

/**
 * PDFKit compresses page streams and writes text as PDF hex strings. Decode
 * every stream so assertions validate the generated document, not its source.
 */
function extractPdfText(buffer: Buffer): string {
  const text: string[] = [buffer.toString("latin1")];
  let position = 0;
  while (position < buffer.length) {
    let marker = buffer.indexOf(Buffer.from("stream\r\n"), position);
    let delimiterLength = 8;
    const unixMarker = buffer.indexOf(Buffer.from("stream\n"), position);
    if (marker === -1 || (unixMarker !== -1 && unixMarker < marker)) {
      marker = unixMarker;
      delimiterLength = 7;
    }
    if (marker === -1) break;
    const end = buffer.indexOf(Buffer.from("endstream"), marker + delimiterLength);
    if (end === -1) break;
    try {
      const stream = zlib.inflateSync(buffer.subarray(marker + delimiterLength, end)).toString("latin1");
      text.push(stream);
      text.push(stream.replace(/<([0-9A-Fa-f]{2,})>/g, (_match, hex: string) =>
        Buffer.from(hex, "hex").toString("latin1")));
      for (const [, tj] of stream.matchAll(/\[(.*?)\]\s*TJ/g)) {
        const hexText = [...tj.matchAll(/<([0-9A-Fa-f]{2,})>/g)]
          .map(([, hex]) => Buffer.from(hex!, "hex").toString("latin1"))
          .join("");
        text.push(hexText);
      }
    } catch {
      // Non-compressed streams are already covered by the raw buffer text.
    }
    position = end + 9;
  }
  return text.join("");
}

describe("exports PPSI avec le taux configuré par coopérative", () => {
  const rows: PpsiRow[] = [
    { date: "2026-08-04", prestataire: "Prestataire A", brut: 100_000, reference: "PP-001" },
    { date: "2026-08-12", prestataire: "Prestataire B", brut: 250_000, reference: "PP-002" },
  ];

  beforeEach(() => {
    vi.mocked(db.select).mockReset();
  });

  it("met le taux configuré dans l'intitulé CSV et l'applique à chaque retenue", async () => {
    mockPpsiQueries(rows, "7.5");

    const csv = await exporterPpsi(42, 8, 2026);
    const lines = csv.replace("\uFEFF", "").trim().split("\r\n");
    const header = csvFields(lines[0]!);
    const values = lines.slice(1).map(csvFields);

    expect(header[4]).toBe("Retenue PPSSI (7,5 %) (FCFA)");
    expect(values).toEqual([
      ["Août 2026", "2026-08-04", "Prestataire A", "100000", "7500", "92500", "PP-001"],
      ["Août 2026", "2026-08-12", "Prestataire B", "250000", "18750", "231250", "PP-002"],
    ]);

    for (const value of values) {
      const brut = Number(value[3]);
      const retenue = Number(value[4]);
      const net = Number(value[5]);
      expect(retenue + net).toBe(brut);
    }
  });

  it("met le même taux dans le PDF, applique chaque retenue et conserve les totaux", async () => {
    mockPpsiQueries(rows, "7.5");

    const pdfText = extractPdfText(await genererPpsiPdf(42, 8, 2026));
    // PDFKit/WinAnsi may encode the narrow thousands separator as a slash
    // surrounded by a kerning adjustment; compare the displayed number.
    const normalizedPdfText = pdfText.replace(/(?<=\d)[ /]+(?=\d)/g, "");

    expect(normalizedPdfText).toContain("taux de retenue : 7,5 %");
    expect(normalizedPdfText).toContain("Retenue 7,5 %");
    expect(normalizedPdfText).toContain("7500 FCFA");
    expect(normalizedPdfText).toContain("18750 FCFA");
    expect(normalizedPdfText).toContain("92500 FCFA");
    expect(normalizedPdfText).toContain("231250 FCFA");
    expect(normalizedPdfText).toContain("350000 FCFA");
    expect(normalizedPdfText).toContain("26250 FCFA");
    expect(normalizedPdfText).toContain("323750 FCFA");
    expect(26_250 + 323_750).toBe(350_000);
  });
});
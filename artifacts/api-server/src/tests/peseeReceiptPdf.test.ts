/**
 * Tests: pesée receipt number rendering in PDF (Task #18)
 *
 * Covered scenarios:
 *  A. genererNumeroRecu (real implementation)
 *     — controlled db.insert mock returning a fixed counter value
 *     — asserts output is REC-YYYY-NNNNN (not a mocked hard-coded value)
 *
 *  B. generateRecuPaiement (real PDF generation, mocked DB)
 *     — paiement row with numeroRecu = "REC-2026-00042"
 *       → asserts emitted PDF buffer (decompressed streams) contains that exact string
 *       → asserts drawHeader was called with reference: "REC-2026-00042"
 *     — legacy row where numeroRecu is null
 *       → asserts PDF and header reference use PAY-{id} fallback
 *
 * pdfHeaderService is mocked to avoid file-system / object-storage access.
 * PDFKit runs for real, so the buffer is a genuine compressed PDF.
 * zlib.inflateSync is used to decompress content streams before text search.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import zlib from "zlib";
import { db } from "@workspace/db";
import { drawHeader } from "../services/pdfHeaderService.js";
import { generateBonAchatPiece } from "../services/bonAchatPiecePdf.js";

// ─── Mock drizzle-orm/pg-core (alias()) ───────────────────────────────────────
// alias() receives our stub table objects { _: { name } } which don't satisfy
// Drizzle's internal shape checks — swap it for a no-op.
vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((_table: unknown, _name: string) => ({ _: { name: _name } })),
}));

// ─── Mock pdfHeaderService ────────────────────────────────────────────────────
// drawHeader / drawFooter make DB + object-storage calls; replace with no-ops.
vi.mock("../services/pdfHeaderService.js", () => ({
  drawHeader: vi.fn().mockResolvedValue(undefined),
  drawFooter: vi.fn().mockResolvedValue(undefined),
  invalidateLogoCache: vi.fn(),
}));

// ─── Mock portailService ──────────────────────────────────────────────────────
vi.mock("../services/portailService.js", () => ({
  computeCodeMembre: vi.fn().mockReturnValue("MBR-00001"),
}));

// ─── Import SUTs after mocks ──────────────────────────────────────────────────
const { genererNumeroRecu } = await import("../services/recuService.js");
const { generateRecuPaiement } = await import("../services/pdfService.js");

// ─── Fluent builder helpers ───────────────────────────────────────────────────

/**
 * Returns an object that mimics the Drizzle select fluent chain.
 * Every chained method (from, leftJoin, where, …) returns the same object.
 * The object is also thenable so `await chain` resolves to `data`.
 * `.limit(n)` returns a Promise directly (for getCampagneEnCours).
 */
function makeSelectChain(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["from", "leftJoin", "innerJoin", "where", "orderBy"]) {
    chain[m] = vi.fn(self);
  }
  chain["limit"] = vi.fn((_n: unknown) => Promise.resolve(data));
  // Make the chain awaitable for queries that end with .where()
  chain["then"] = (
    resolve: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(data).then(resolve, reject);
  return chain;
}

/**
 * Returns an object that mimics the Drizzle update fluent chain.
 * `.returning(sel)` resolves to `data`.
 */
function makeUpdateChain(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ["set", "where"]) {
    chain[m] = vi.fn(self);
  }
  chain["returning"] = vi.fn((_sel: unknown) => Promise.resolve(data));
  return chain;
}

function makeReceiptSequenceInsert(data: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ["values", "onConflictDoUpdate"]) {
    chain[method] = vi.fn(self);
  }
  chain["returning"] = vi.fn((_sel: unknown) => Promise.resolve(data));
  return chain;
}

// ─── PDF text extraction ──────────────────────────────────────────────────────

/**
 * Extract human-readable text from a PDF buffer.
 *
 * PDFKit compresses page content streams with zlib (FlateDecode) and encodes
 * text using PDF hex string literals inside TJ operators, e.g.:
 *   [<5245432d323032362d3030303432> 0] TJ  →  "REC-2026-00042"
 *
 * This helper:
 *  1. Finds every "stream … endstream" block and inflates it with zlib
 *  2. Decodes PDF hex string literals <HEXDIGITS> → their ASCII characters
 *  3. Concatenates all results so callers can do `includes()` checks
 */
function extractPdfText(buf: Buffer): string {
  const parts: string[] = [];
  const decodePdfWinAnsi = (value: string): string => value.replace(/\u0097/g, "—");

  // Also include raw bytes decoded as latin1 (catches uncompressed metadata)
  parts.push(buf.toString("latin1"));

  // Walk the buffer looking for stream bodies
  let pos = 0;
  while (pos < buf.length) {
    // PDFKit writes "stream\r\n" or "stream\n" as the stream delimiter
    let marker = buf.indexOf(Buffer.from("stream\r\n"), pos);
    let headerBytes = 8;
    const alt = buf.indexOf(Buffer.from("stream\n"), pos);
    if (marker === -1 || (alt !== -1 && alt < marker)) {
      marker = alt;
      headerBytes = 7;
    }
    if (marker === -1) break;

    const dataStart = marker + headerBytes;
    const endMarker = buf.indexOf(Buffer.from("endstream"), dataStart);
    if (endMarker === -1) break;

    const streamData = buf.slice(dataStart, endMarker);
    try {
      const inflated = zlib.inflateSync(streamData);
      const inflatedStr = inflated.toString("latin1");

      // Add raw inflated content
      parts.push(inflatedStr);

      // Decode PDF hex string literals: <HEXDIGITS> → ASCII text
      // Simple per-pattern decode (catches single-chunk strings):
      const decoded = inflatedStr.replace(
        /<([0-9A-Fa-f]{2,})>/g,
        (_m, hex: string) => {
          try { return Buffer.from(hex, "hex").toString("latin1"); } catch { return _m; }
        },
      );
      parts.push(decodePdfWinAnsi(decoded));

      // Kerning-aware decode: PDFKit inserts kerning adjustments inside TJ arrays,
      // splitting a string like "PAY-00099" across multiple hex chunks:
      //   [<5041> 20 <592d3030303939> 0] TJ  →  "PA" + "Y-00099"
      // Concatenate all hex chunks within each TJ block to reconstruct the full string.
      const tjDecoded = inflatedStr.replace(
        /\[([^\]]*)\]\s*TJ/g,
        (_match, inside: string) => {
          const texts: string[] = [];
          const hexPat = /<([0-9A-Fa-f]{2,})>/g;
          let m: RegExpExecArray | null;
          // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic regex loop
          while ((m = hexPat.exec(inside)) !== null) {
            try { texts.push(Buffer.from(m[1]!, "hex").toString("latin1")); } catch { /* skip */ }
          }
          return texts.join("");
        },
      );
      parts.push(decodePdfWinAnsi(tjDecoded));
    } catch {
      // Stream is not FlateDecode (e.g. embedded image data) — skip
    }

    pos = endMarker + 9; // len("endstream")
  }

  return parts.join("\n");
}

// ─── Fixture data ─────────────────────────────────────────────────────────────

const RECEIPT_NUM = "REC-2026-00042";
const PAIEMENT_ID = 55;

function makePaiementRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: PAIEMENT_ID,
    numeroRecu: RECEIPT_NUM,
    montantFcfa: 144600,
    montantAPayerFcfa: null,
    montantVerseFcfa: null,
    resteAPayerFcfa: null,
    modePaiement: "especes",
    modeReglement: null,
    referenceTransaction: null,
    statut: "en_attente",
    createdAt: new Date("2026-08-17T10:30:00Z"),
    dateValidation: null,
    libelle: null,
    livraisonId: 100,
    membreNom: "KONÉ",
    membrePrenoms: "Amadou",
    membreCni: "CI12345",
    membreTel: "+22501234567",
    livraisonDate: "2026-08-17",
    livraisonMontantNetFcfa: 590000,
    livraisonMontantRestant: 400000,
    livraisonStatutPaiement: "PARTIEL",
    livraisonRef: null,
    validateurNom: null,
    validateurPrenoms: null,
    validateurRole: null,
    depenseVehiculeId: null,
    depenseVehiculeType: null,
    depenseVehiculeLibelle: null,
    depenseVehiculeDemandeur: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite A — Real genererNumeroRecu with controlled DB output
// ─────────────────────────────────────────────────────────────────────────────

describe("genererNumeroRecu (real implementation) — REC-YYYY-NNNNN format", () => {
  beforeEach(() => {
    vi.mocked(db.insert).mockReset();
  });

  it("returns REC-<currentYear>-00042 when the DB counter returns n=42", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(makeReceiptSequenceInsert([{ numero: 42 }]) as never);

    const result = await genererNumeroRecu(1);
    const year = new Date().getFullYear();

    expect(result).toBe(`REC-${year}-00042`);
    expect(result).toMatch(/^REC-\d{4}-00042$/);
  });

  it("returns REC-<year>-00001 when the DB counter returns n=1 (first ever reçu)", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(makeReceiptSequenceInsert([{ numero: 1 }]) as never);

    const result = await genererNumeroRecu(1);
    const year = new Date().getFullYear();

    expect(result).toBe(`REC-${year}-00001`);
    expect(result).not.toMatch(/^PAY-/);
  });

  it("fails explicitly when the sequence returns no value", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(makeReceiptSequenceInsert([]) as never);

    await expect(genererNumeroRecu(1)).rejects.toThrow(
      "Impossible de générer un numéro de reçu",
    );
  });

  it("increments the cooperative-local sequence exactly once per invocation", async () => {
    vi.mocked(db.insert).mockReturnValueOnce(makeReceiptSequenceInsert([{ numero: 7 }]) as never);

    await genererNumeroRecu(99);

    expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite B — Real generateRecuPaiement — PDF contains the receipt number
// ─────────────────────────────────────────────────────────────────────────────

describe("generateRecuPaiement (real PDF generation) — receipt number in PDF output", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(drawHeader).mockClear();
  });

  /**
   * Configure db.select for five consecutive calls:
   *  call 1 → main paiement join query  (returns [row])
   *  call 2 → paiement lignes query     (returns [] — legacy payment)
   *  call 3 → linked cheques query
   *  call 4 → linked delivery's validated payments query (returns [] — no history)
   *  call 5 → getCampagneEnCours query  (returns [] — no campaign)
   */
  function setupDbSelect(
    row: Record<string, unknown>,
    history: Array<{ id: number }> = [],
    cheques: Array<Record<string, unknown>> = [],
  ) {
    vi.mocked(db.select)
      .mockReturnValueOnce(makeSelectChain([row]) as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([])  as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(cheques)  as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain(history)  as unknown as ReturnType<typeof db.select>)
      .mockReturnValueOnce(makeSelectChain([])  as unknown as ReturnType<typeof db.select>);
  }

  it("emits a valid PDF buffer (non-empty, starts with %PDF)", async () => {
    setupDbSelect(makePaiementRow());
    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
  });

  it("passes the REC-YYYY-NNNNN number to drawHeader as `reference`", async () => {
    setupDbSelect(makePaiementRow());
    await generateRecuPaiement(PAIEMENT_ID, 1);

    expect(vi.mocked(drawHeader)).toHaveBeenCalledWith(
      expect.anything(),            // PDFDocument instance
      1,                            // cooperativeId
      expect.objectContaining({ reference: RECEIPT_NUM }),
    );
  });

  it("emits a PDF whose decompressed content streams contain the REC-YYYY-NNNNN number", async () => {
    setupDbSelect(makePaiementRow());
    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);

    // PDFKit compresses page content with FlateDecode; inflate streams before searching.
    const text = extractPdfText(buf);
    expect(text).toContain(RECEIPT_NUM);
  });

  it("affiche obligatoirement la date de règlement pour un paiement effectué", async () => {
    setupDbSelect(makePaiementRow({
      statut: "effectue",
      dateValidation: new Date("2026-08-18T14:45:00Z"),
    }));
    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);
    const text = extractPdfText(buf);
    expect(text).toContain("Date et heure de règlement");
    expect(text).toContain("18/08/2026");
  });

  it("PAY fallback: passes PAY-{id} to drawHeader when numeroRecu is null (legacy row)", async () => {
    const legacyId = 99;
    setupDbSelect(makePaiementRow({ id: legacyId, numeroRecu: null }));
    await generateRecuPaiement(legacyId, 1);

    const expectedFallback = `PAY-${String(legacyId).padStart(5, "0")}`;
    expect(vi.mocked(drawHeader)).toHaveBeenCalledWith(
      expect.anything(),
      1,
      expect.objectContaining({ reference: expectedFallback }),
    );
  });

  it("PAY fallback: decompressed PDF content contains PAY-{id} when numeroRecu is null", async () => {
    const legacyId = 99;
    setupDbSelect(makePaiementRow({ id: legacyId, numeroRecu: null }));
    const buf = await generateRecuPaiement(legacyId, 1);

    const text = extractPdfText(buf);
    const expectedFallback = `PAY-${String(legacyId).padStart(5, "0")}`;
    expect(text).toContain(expectedFallback);
  });

  it("pesée-originated paiement: PDF contains REC number and does NOT contain PAY fallback", async () => {
    const recNum = "REC-2026-00099";
    setupDbSelect(makePaiementRow({ numeroRecu: recNum }));
    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);

    const text = extractPdfText(buf);
    expect(text).toContain(recNum);
    // The PAY-{id} fallback must NOT appear anywhere in the output
    expect(text).not.toContain(`PAY-${String(PAIEMENT_ID).padStart(5, "0")}`);
  });

  it("displays the external supplier identity on the payment receipt", async () => {
    setupDbSelect(makePaiementRow({
      membreNom: null,
      membrePrenoms: null,
      membreCni: null,
      membreTel: null,
      fournisseurNom: "VINI",
      fournisseurPrenoms: "Junior",
      fournisseurCni: "CI987654",
      fournisseurTel: "+22507080910",
    }));
    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);
    const text = extractPdfText(buf);

    expect(text).toContain("Junior VINI");
    expect(text).toContain("CI987654");
    expect(text).toContain("+22507080910");
  });

  it("displays the requester and the spare-part nature on a payment receipt", async () => {
    setupDbSelect(makePaiementRow({
      depenseVehiculeId: 12,
      depenseVehiculeType: "piece_rechange",
      depenseVehiculeLibelle: "Alternateur",
      depenseVehiculeDemandeur: "KOUASSI Aïcha",
    }));

    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);
    const text = extractPdfText(buf);
    const textSansAccents = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();

    expect(text).toContain("KOUASSI Aïcha");
    expect(textSansAccents).toContain("PIECE DE RECHANGE");
    expect(textSansAccents).toContain("DEMANDEUR");
  });

  it("keeps generating a legacy spare-part receipt when its requester is absent", async () => {
    setupDbSelect(makePaiementRow({
      depenseVehiculeId: 13,
      depenseVehiculeType: "piece_rechange",
      depenseVehiculeLibelle: "Pompe à eau",
      depenseVehiculeDemandeur: null,
    }));

    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);
    const text = extractPdfText(buf);

    expect(text).toContain("Demandeur");
    expect(text).toContain("—");
    expect(text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase())
      .toContain("PIECE DE RECHANGE");
  });

  it("displays the current installment and remaining balance for a partial delivery", async () => {
    setupDbSelect(makePaiementRow({
      montantFcfa: 190000,
      livraisonMontantNetFcfa: 590000,
      livraisonMontantRestant: 400000,
      livraisonStatutPaiement: "PARTIEL",
    }), [{ id: PAIEMENT_ID }]);
    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);
    const text = extractPdfText(buf);
    const textSansAccents = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();

    expect(textSansAccents).toContain("REGLEMENT 1");
    expect(text).toContain("190 000 FCFA");
    expect(textSansAccents).toContain("RESTE DU");
    expect(text).toContain("400 000 FCFA");
    expect(text).toContain("PARTIELLE");
  });

  it("displays the settled status and zero balance for the final installment", async () => {
    setupDbSelect(makePaiementRow({
      montantFcfa: 150000,
      statut: "effectue",
      livraisonMontantNetFcfa: 590000,
      livraisonMontantRestant: 0,
      livraisonStatutPaiement: "PAYÉ",
    }), [{ id: PAIEMENT_ID }]);
    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);
    const text = extractPdfText(buf);
    const textSansAccents = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();

    expect(text).toContain("150 000 FCFA");
    expect(text).toContain("0 FCFA");
    expect(textSansAccents).toContain("REGLEE");
  });

  it("affiche zéro encaissé tant que le chèque reste émis", async () => {
    setupDbSelect(
      makePaiementRow({
        montantFcfa: 150000,
        modePaiement: "cheque",
        modeReglement: "cheque",
        statut: "effectue",
      }),
      [{ id: PAIEMENT_ID }],
      [{
        paiementLigneId: null,
        montantFcfa: 150000,
        statut: "emis",
        dateEncaissement: null,
      }],
    );

    const buf = await generateRecuPaiement(PAIEMENT_ID, 1);
    const text = extractPdfText(buf);
    const textSansAccents = text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();

    expect(textSansAccents).toContain("EN ATTENTE");
    expect(textSansAccents).toContain("ENCAISSEMENT");
    expect(textSansAccents).toContain("MONTANT ENCAISSE");
    expect(text).toContain("0 FCFA");
  });
});

describe("generateBonAchatPiece (real PDF generation) — requester rendering", () => {
  it("emits a PDF containing the requester name", async () => {
    const buf = await generateBonAchatPiece(1, {
      id: 73,
      dateDepense: "2026-08-17",
      montantFcfa: "125000",
      libelle: "Alternateur",
      demandeur: "KOUASSI Aïcha",
      fournisseur: "Fournisseur test",
      referencePiece: "ALT-2026",
      quantite: "1",
      unite: "pièce",
      immatriculation: "AB-123-CD",
      marque: "Test",
      modele: "Camion",
    });

    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");
    expect(extractPdfText(buf)).toContain("KOUASSI Aïcha");
  });

  it("keeps generating a legacy purchase order when its requester is absent", async () => {
    const buf = await generateBonAchatPiece(1, {
      id: 74,
      dateDepense: "2026-08-17",
      montantFcfa: "125000",
      libelle: "Pompe à eau",
      demandeur: null,
      fournisseur: null,
      referencePiece: null,
      quantite: null,
      unite: null,
      immatriculation: null,
      marque: null,
      modele: null,
    });

    const text = extractPdfText(buf);
    expect(text).toContain("Demandeur");
    expect(text).toContain("—");
  });
});

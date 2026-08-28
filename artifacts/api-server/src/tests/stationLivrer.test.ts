/**
 * End-to-end controller tests for PUT /station/carburant/bons/:numero/livrer
 *
 * These tests call handleLivrerBonStation directly (no HTTP server needed),
 * using real stationQrCrypto helpers to build fixtures and mocking only the
 * transport service layer. SESSION_SECRET is injected via vitest.config.ts.
 *
 * Covered scenarios:
 *  1. Correctly-signed QR whose exp is in the past  → 400 "QR code expiré"
 *  2. Valid payload with one byte of the sig flipped → 400 "Signature QR invalide"
 *  3. Payload whose num doesn't match the URL param  → 400 (num mismatch)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import { signQrPayload } from "../lib/stationQrCrypto";

// ── Mock transport service (before controller import) ────────────────────────

const mockGetBonCarburantByNumero = vi.fn();
const mockTransitionBon = vi.fn();

vi.mock("../services/transportService.js", () => ({
  getBonCarburantByNumero: (...args: unknown[]) =>
    mockGetBonCarburantByNumero(...args),
  transitionBon: (...args: unknown[]) => mockTransitionBon(...args),
  createDepense: vi.fn(),
}));

// ── Import controller after mocks are declared ────────────────────────────────

const { handleLivrerBonStation } = await import(
  "../controllers/stationController.js"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReq = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRes = any;

/** Build a minimal bon row that satisfies the "approuve" path */
function makeApprouveBon(numero: string) {
  return {
    bon: {
      id: 1,
      numero,
      statut: "approuve",
      cooperativeId: 42,
      vehiculeId: 7,
      typeCarburant: "gasoil",
      quantiteAutorisee: "50.00",
      montantAutoriseFcfa: "10000",
      stationService: null,
      motif: null,
      dateEmission: "2026-08-01",
      chauffeurId: 3,
    },
    chauffeurNom: "Koné",
    chauffeurPrenoms: "Amadou",
    immatriculation: "AB-1234-CI",
    marque: "Toyota",
    modele: "Hilux",
  };
}

function makeReq(
  numero: string,
  body: Record<string, unknown> = {},
): AnyReq {
  return {
    params: { numero },
    body,
    query: {},
    headers: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  };
}

function makeRes(): AnyRes {
  const res: AnyRes = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res;
}

/** Build a well-formed, signed QR payload for the given numero */
function buildQrPayload(numero: string, exp: number) {
  const data = {
    v: 1,
    num: numero,
    qte: 50,
    type: "gasoil",
    immat: "AB-1234-CI",
    chauffeur: "Amadou Koné",
    marque: "Toyota",
    date_em: "2026-08-01",
    motif: null,
    exp,
  };
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = signQrPayload(payload);
  return { payload, sig };
}

/** Flip one byte in a base64url string and return the new string */
function flipOneByte(base64url: string): string {
  const buf = Buffer.from(base64url, "base64url");
  buf[0] ^= 0xff;
  return buf.toString("base64url");
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("handleLivrerBonStation — QR rejection paths", () => {
  const NUMERO = "BC-00042";

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBonCarburantByNumero.mockResolvedValue(makeApprouveBon(NUMERO));
    mockTransitionBon.mockResolvedValue(undefined);
  });

  // ── 1. Expired QR ──────────────────────────────────────────────────────────
  it("rejects a correctly-signed but expired QR with 400 'QR code expiré'", async () => {
    const expiredExp = Date.now() - 60_000; // 1 minute in the past
    const { payload, sig } = buildQrPayload(NUMERO, expiredExp);

    const req = makeReq(NUMERO, {
      qr_payload: payload,
      qr_sig: sig,
      quantite_livree: 50,
      montant_fcfa: 9500,
      date_utilisation: "2026-08-14",
    });
    const res = makeRes();

    await handleLivrerBonStation(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(/expir/i);
    // transitionBon must NOT have been called
    expect(mockTransitionBon).not.toHaveBeenCalled();
  });

  // ── 2. Tampered signature (one byte flipped) ───────────────────────────────
  it("rejects a valid payload with a bit-flipped signature with 400 'Signature QR invalide'", async () => {
    const validExp = Date.now() + 60_000 * 60; // 1 hour in the future
    const { payload, sig } = buildQrPayload(NUMERO, validExp);
    const corruptedSig = flipOneByte(sig);

    const req = makeReq(NUMERO, {
      qr_payload: payload,
      qr_sig: corruptedSig,
      quantite_livree: 50,
      date_utilisation: "2026-08-14",
    });
    const res = makeRes();

    await handleLivrerBonStation(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(/signature/i);
    expect(mockTransitionBon).not.toHaveBeenCalled();
  });

  // ── 3. num mismatch between payload and URL ────────────────────────────────
  it("rejects a QR whose num field doesn't match the URL bon number with 400", async () => {
    const validExp = Date.now() + 60_000 * 60;
    // Sign a QR for a DIFFERENT bon number
    const { payload, sig } = buildQrPayload("BC-99999", validExp);

    const req = makeReq(NUMERO, {
      qr_payload: payload,
      qr_sig: sig,
      quantite_livree: 50,
      montant_fcfa: 9500,
      date_utilisation: "2026-08-14",
    });
    const res = makeRes();

    await handleLivrerBonStation(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(
      /ne correspond pas|num|bon/i,
    );
    expect(mockTransitionBon).not.toHaveBeenCalled();
  });

  // ── Sanity check: a valid QR proceeds to transitionBon ────────────────────
  it("accepts a valid, unexpired QR whose num matches and calls transitionBon", async () => {
    const validExp = Date.now() + 60_000 * 60;
    const { payload, sig } = buildQrPayload(NUMERO, validExp);

    const req = makeReq(NUMERO, {
      qr_payload: payload,
      qr_sig: sig,
      quantite_livree: 50,
      montant_fcfa: 9500,
      date_utilisation: "2026-08-14",
    });
    const res = makeRes();

    await handleLivrerBonStation(req as Request, res as Response);

    expect(res._status).toBe(200);
    expect((res._body as { success: boolean }).success).toBe(true);
    expect(mockTransitionBon).toHaveBeenCalledOnce();
  });

  it("rejects a consumed amount above the authorized ceiling", async () => {
    const validExp = Date.now() + 60_000 * 60;
    const { payload, sig } = buildQrPayload(NUMERO, validExp);

    const req = makeReq(NUMERO, {
      qr_payload: payload,
      qr_sig: sig,
      quantite_livree: 50,
      montant_fcfa: 10001,
      date_utilisation: "2026-08-14",
    });
    const res = makeRes();

    await handleLivrerBonStation(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(/dépasser|autorisé/i);
    expect(mockTransitionBon).not.toHaveBeenCalled();
  });

  it("keeps legacy litre-only bon records usable when a consumed amount is supplied", async () => {
    mockGetBonCarburantByNumero.mockResolvedValueOnce({
      ...makeApprouveBon(NUMERO),
      bon: { ...makeApprouveBon(NUMERO).bon, montantAutoriseFcfa: null },
    });
    const validExp = Date.now() + 60_000 * 60;
    const { payload, sig } = buildQrPayload(NUMERO, validExp);

    const req = makeReq(NUMERO, {
      qr_payload: payload,
      qr_sig: sig,
      quantite_livree: 50,
      montant_fcfa: 9500,
      date_utilisation: "2026-08-14",
    });
    const res = makeRes();

    await handleLivrerBonStation(req as Request, res as Response);

    expect(res._status).toBe(200);
    expect(mockTransitionBon).toHaveBeenCalledOnce();
  });
});

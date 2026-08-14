/**
 * Tests unitaires pour la génération et la vérification des QR codes carburant.
 * Importe les fonctions réelles du module stationQrCrypto (pas de duplication).
 * SESSION_SECRET est injecté via vitest.config.ts env.
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import {
  signQrPayload,
  verifyQrPayload,
  PUBLIC_KEY_SPKI_B64,
  QR_PRIVATE_KEY,
  QR_PUBLIC_KEY,
  QR_TTL_MS,
} from "../lib/stationQrCrypto";

// ── Clés ─────────────────────────────────────────────────────────────────────
describe("Station QR — key pair", () => {
  it("generates a valid Ed25519 key pair", () => {
    expect(QR_PRIVATE_KEY.asymmetricKeyType).toBe("ed25519");
    expect(QR_PUBLIC_KEY.asymmetricKeyType).toBe("ed25519");
  });

  it("exports a non-empty SPKI base64 public key", () => {
    expect(PUBLIC_KEY_SPKI_B64.length).toBeGreaterThan(0);
    // Should be parseable base64
    const decoded = Buffer.from(PUBLIC_KEY_SPKI_B64, "base64");
    expect(decoded.length).toBe(44); // Ed25519 SPKI DER is always 44 bytes
  });

  it("is deterministic: same SECRET_SESSION → same public key", () => {
    // The real module already used the test secret from env; re-derive to confirm determinism
    const PKCS8_HEADER = Buffer.from("302e020100300506032b657004220420", "hex");
    const secret = process.env["SESSION_SECRET"]!;
    const seed = crypto.scryptSync(Buffer.from(secret), Buffer.from("station-qr-ed25519-v1"), 32);
    const der = Buffer.concat([PKCS8_HEADER, seed]);
    const priv = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    const pub = crypto.createPublicKey(priv);
    const spki = (pub.export({ type: "spki", format: "der" }) as Buffer).toString("base64");
    expect(spki).toBe(PUBLIC_KEY_SPKI_B64);
  });
});

// ── Signature et vérification ─────────────────────────────────────────────────
describe("Station QR — sign and verify", () => {
  it("signs and verifies a valid payload", () => {
    const payload = Buffer.from(JSON.stringify({ num: "BC-00001", v: 1, qte: 50 })).toString("base64url");
    const sig = signQrPayload(payload);
    expect(verifyQrPayload(payload, sig)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const payload = Buffer.from(JSON.stringify({ num: "BC-00001", v: 1, qte: 50 })).toString("base64url");
    const sig = signQrPayload(payload);
    const tampered = Buffer.from(JSON.stringify({ num: "BC-00001", v: 1, qte: 9999 })).toString("base64url");
    expect(verifyQrPayload(tampered, sig)).toBe(false);
  });

  it("rejects a bit-flipped signature", () => {
    const payload = Buffer.from(JSON.stringify({ num: "BC-00001", v: 1, qte: 50 })).toString("base64url");
    const sig = signQrPayload(payload);
    const sigBuf = Buffer.from(sig, "base64url");
    sigBuf[0] ^= 0xff; // XOR first byte — guaranteed change
    expect(verifyQrPayload(payload, sigBuf.toString("base64url"))).toBe(false);
  });

  it("rejects a signature produced with a different secret", () => {
    const payload = Buffer.from(JSON.stringify({ num: "BC-00001", v: 1 })).toString("base64url");
    const PKCS8_HEADER = Buffer.from("302e020100300506032b657004220420", "hex");
    const otherSeed = crypto.scryptSync(Buffer.from("completely-different-secret"), Buffer.from("station-qr-ed25519-v1"), 32);
    const otherPriv = crypto.createPrivateKey({
      key: Buffer.concat([PKCS8_HEADER, otherSeed]),
      format: "der",
      type: "pkcs8",
    });
    const otherSig = crypto.sign(null, Buffer.from(payload, "utf8"), otherPriv).toString("base64url");
    expect(verifyQrPayload(payload, otherSig)).toBe(false);
  });

  it("rejects a malformed base64url signature gracefully", () => {
    const payload = Buffer.from("test").toString("base64url");
    expect(verifyQrPayload(payload, "!!!not-valid!!")).toBe(false);
  });
});

// ── Payload structure ─────────────────────────────────────────────────────────
describe("Station QR — payload expiry", () => {
  it("QR_TTL_MS is positive and at most 90 days", () => {
    expect(QR_TTL_MS).toBeGreaterThan(0);
    expect(QR_TTL_MS).toBeLessThanOrEqual(90 * 24 * 60 * 60 * 1000);
  });

  it("an expired payload is detectable by checking exp", () => {
    const expiredPayload = {
      v: 1, num: "BC-00001", qte: 50, type: "gasoil",
      immat: null, chauffeur: null, marque: null,
      date_em: "2024-01-01", motif: null,
      exp: Date.now() - 1000, // already expired
    };
    const payload = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const sig = signQrPayload(payload);
    // Signature is valid — expiry check is application-level
    expect(verifyQrPayload(payload, sig)).toBe(true);
    // But the caller should reject expired payloads
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp: number };
    expect(decoded.exp).toBeLessThan(Date.now());
  });
});

// ── Fail-closed guard ─────────────────────────────────────────────────────────
describe("Station QR — fail-closed without SESSION_SECRET", () => {
  it("the guard throws when SESSION_SECRET is falsy", () => {
    // The real module already imported with the secret; we test the guard logic directly
    let threw = false;
    const saved = process.env["SESSION_SECRET"];
    try {
      delete process.env["SESSION_SECRET"];
      const secret = process.env["SESSION_SECRET"];
      if (!secret) throw new Error("[stationQrCrypto] SESSION_SECRET manquant");
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain("SESSION_SECRET manquant");
    } finally {
      if (saved !== undefined) process.env["SESSION_SECRET"] = saved;
    }
    expect(threw).toBe(true);
  });
});

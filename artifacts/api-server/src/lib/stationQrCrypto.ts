/**
 * Crypto utilitaires pour les QR codes carburant station.
 * Fail-closed : lève une erreur au chargement du module si SESSION_SECRET est absent.
 * Exporté séparément du contrôleur pour permettre des tests unitaires réels.
 */
import crypto from "crypto";

const SESSION_SECRET = process.env["SESSION_SECRET"];
if (!SESSION_SECRET) {
  throw new Error(
    "[stationQrCrypto] SESSION_SECRET manquant — les endpoints QR ne peuvent pas démarrer.",
  );
}

// Dérivation déterministe : même secret → même paire de clés entre redémarrages
const PKCS8_ED25519_HEADER = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

const _seed = crypto.scryptSync(
  Buffer.from(SESSION_SECRET),
  Buffer.from("station-qr-ed25519-v1"),
  32,
);
const _privateDer = Buffer.concat([PKCS8_ED25519_HEADER, _seed]);

export const QR_PRIVATE_KEY = crypto.createPrivateKey({
  key: _privateDer,
  format: "der",
  type: "pkcs8",
});

export const QR_PUBLIC_KEY = crypto.createPublicKey(QR_PRIVATE_KEY);

/** Clé publique SPKI en base64 — embarquée dans le bundle client au build Vite. */
export const PUBLIC_KEY_SPKI_B64: string = (
  QR_PUBLIC_KEY.export({ type: "spki", format: "der" }) as Buffer
).toString("base64");

/** Durée de validité des QR codes : configurable via QR_TTL_DAYS (défaut 7 jours). */
const _ttlDays = process.env["QR_TTL_DAYS"]
  ? Math.max(1, parseInt(process.env["QR_TTL_DAYS"], 10))
  : 7;
export const QR_TTL_MS = _ttlDays * 24 * 60 * 60 * 1000;

/** Signe un payload (string base64url) avec la clé privée Ed25519. */
export function signQrPayload(payload: string): string {
  return crypto
    .sign(null, Buffer.from(payload, "utf8"), QR_PRIVATE_KEY)
    .toString("base64url");
}

/** Vérifie la signature Ed25519 d'un payload. Retourne false en cas d'erreur. */
export function verifyQrPayload(payload: string, sig: string): boolean {
  try {
    return crypto.verify(
      null,
      Buffer.from(payload, "utf8"),
      QR_PUBLIC_KEY,
      Buffer.from(sig, "base64url"),
    );
  } catch {
    return false;
  }
}

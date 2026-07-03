import { type Request } from "express";

interface StoredChallenge {
  challenge: string;
  expiresAt: number;
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

const registrationChallenges = new Map<string, StoredChallenge>();
const loginChallenges = new Map<string, StoredChallenge>();

function pruneExpired(store: Map<string, StoredChallenge>): void {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (value.expiresAt < now) store.delete(key);
  }
}

export function setRegistrationChallenge(userId: number, challenge: string): void {
  pruneExpired(registrationChallenges);
  registrationChallenges.set(String(userId), { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

export function popRegistrationChallenge(userId: number): string | undefined {
  const key = String(userId);
  const stored = registrationChallenges.get(key);
  registrationChallenges.delete(key);
  if (!stored || stored.expiresAt < Date.now()) return undefined;
  return stored.challenge;
}

export function setLoginChallenge(email: string, challenge: string): void {
  pruneExpired(loginChallenges);
  loginChallenges.set(email.toLowerCase(), { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

export function popLoginChallenge(email: string): string | undefined {
  const key = email.toLowerCase();
  const stored = loginChallenges.get(key);
  loginChallenges.delete(key);
  if (!stored || stored.expiresAt < Date.now()) return undefined;
  return stored.challenge;
}

/**
 * Dérive le rpID (domaine) et l'origine attendue à partir de la requête entrante.
 * La validation CORS (ALLOWED_ORIGINS) a déjà filtré les origines non autorisées en amont,
 * donc l'en-tête Origin peut être utilisé en confiance ici.
 */
export function getRpConfig(req: Request): { rpID: string; origin: string; rpName: string } {
  const originHeader = req.headers.origin;
  let origin = typeof originHeader === "string" && originHeader.length > 0 ? originHeader : undefined;

  if (!origin) {
    const allowedOrigins = process.env["ALLOWED_ORIGINS"]
      ? process.env["ALLOWED_ORIGINS"].split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    origin = allowedOrigins[0];
  }

  if (!origin) {
    const devDomain = process.env["REPLIT_DEV_DOMAIN"];
    origin = devDomain ? `https://${devDomain}` : "http://localhost:5173";
  }

  let rpID: string;
  try {
    rpID = new URL(origin).hostname;
  } catch {
    rpID = "localhost";
  }

  return { rpID, origin, rpName: "CoopDigital" };
}

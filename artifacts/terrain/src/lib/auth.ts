import type { AgentUser } from "./types";

const TOKEN_KEY = "terrain_token";
const USER_KEY = "terrain_user";
const ACTIVITY_KEY = "terrain_last_activity_at";
const AUTH_MESSAGE_KEY = "terrain_auth_message";
const ACCOUNT_DISABLED_KEY = "terrain_account_disabled";

export const TERRAIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const COMPTE_DESACTIVE_CODE = "COMPTE_DESACTIVE";
export const COMPTE_DESACTIVE_MESSAGE =
  "Votre compte a été désactivé par l’administration. Contactez votre responsable.";
export const COOPERATIVE_MISSING_MESSAGE =
  "Ce compte terrain n’est rattaché à aucune coopérative. Contactez l’administration.";

export interface StoredTerrainAuth {
  token: string;
  user: AgentUser;
}

export function saveAuth(token: string, user: AgentUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  clearAuthMessage();
  recordAuthActivity();
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AgentUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AgentUser;
  } catch {
    return null;
  }
}

export function recordAuthActivity(at = Date.now()) {
  localStorage.setItem(ACTIVITY_KEY, String(at));
}

export function getLastAuthActivity(): number | null {
  const value = Number(localStorage.getItem(ACTIVITY_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function isTerrainSessionIdle(
  lastActivityAt: number | null,
  now = Date.now(),
): boolean {
  return lastActivityAt == null || now - lastActivityAt >= TERRAIN_IDLE_TIMEOUT_MS;
}

/** Lit une session persistée uniquement si elle n'a pas dépassé le délai d'inactivité. */
export function getStoredActiveAuth(now = Date.now()): StoredTerrainAuth | null {
  const token = getToken();
  const user = getUser();
  if (!token || !user || isTerrainSessionIdle(getLastAuthActivity(), now)) {
    clearStoredSession();
    return null;
  }
  return { token, user };
}

function clearStoredSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
}

export function clearAuth() {
  clearStoredSession();
  clearAuthMessage();
}

export function setAuthMessage(message: string) {
  localStorage.setItem(AUTH_MESSAGE_KEY, message);
}

export function getAuthMessage(): string | null {
  return localStorage.getItem(AUTH_MESSAGE_KEY);
}

export function clearAuthMessage() {
  localStorage.removeItem(AUTH_MESSAGE_KEY);
  localStorage.removeItem(ACCOUNT_DISABLED_KEY);
}

/**
 * Conserve les opérations hors ligne, mais empêche leur nouvelle tentative
 * automatique tant que le compte n'a pas été réactivé.
 */
export function markAccountDisabled(message = COMPTE_DESACTIVE_MESSAGE) {
  clearAuth();
  setAuthMessage(message);
  localStorage.setItem(ACCOUNT_DISABLED_KEY, "true");
}

export function isAccountDisabled(): boolean {
  return localStorage.getItem(ACCOUNT_DISABLED_KEY) === "true";
}

export function isAuthenticated(): boolean {
  return getStoredActiveAuth() !== null;
}

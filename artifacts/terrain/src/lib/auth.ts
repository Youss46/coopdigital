import type { AgentUser } from "./types";

const TOKEN_KEY = "terrain_token";
const USER_KEY = "terrain_user";
const ACTIVITY_KEY = "terrain_last_activity_at";

export const TERRAIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export interface StoredTerrainAuth {
  token: string;
  user: AgentUser;
}

export function saveAuth(token: string, user: AgentUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
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
    clearAuth();
    return null;
  }
  return { token, user };
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(ACTIVITY_KEY);
}

export function isAuthenticated(): boolean {
  return getStoredActiveAuth() !== null;
}

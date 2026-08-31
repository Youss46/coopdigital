import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentUser } from "./types";
import {
  clearAuth,
  getAuthMessage,
  getLastAuthActivity,
  getStoredActiveAuth,
  getToken,
  isAccountDisabled,
  isTerrainSessionIdle,
  markAccountDisabled,
  recordAuthActivity,
  saveAuth,
  TERRAIN_IDLE_TIMEOUT_MS,
} from "./auth";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const user: AgentUser = {
  id: 1,
  nom: "Konde",
  prenoms: "Kami",
  email: "kami@example.test",
  telephone: "0700000000",
  role: "peseur",
  cooperativeId: 1,
  section: null,
  zoneType: null,
  zoneNom: null,
};

describe("session terrain persistée", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T08:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    clearAuth();
  });

  it("déconnecte au redémarrage après plus de 30 minutes d'inactivité", () => {
    saveAuth("token-valide", user);
    vi.setSystemTime(new Date(Date.now() + TERRAIN_IDLE_TIMEOUT_MS + 1));

    expect(getStoredActiveAuth()).toBeNull();
    expect(getToken()).toBeNull();
  });

  it("conserve une session relancée avant la limite d'inactivité", () => {
    saveAuth("token-valide", user);
    vi.setSystemTime(new Date(Date.now() + TERRAIN_IDLE_TIMEOUT_MS - 1));

    expect(getStoredActiveAuth()).toEqual({ token: "token-valide", user });
  });

  it("considère la session expirée au retour de visibilité ou de focus", () => {
    saveAuth("token-valide", user);
    const lastActivityAt = getLastAuthActivity();
    vi.setSystemTime(new Date(Date.now() + TERRAIN_IDLE_TIMEOUT_MS));

    expect(isTerrainSessionIdle(lastActivityAt)).toBe(true);
    recordAuthActivity();
    expect(isTerrainSessionIdle(getLastAuthActivity())).toBe(false);
  });

  it("conserve la raison de désactivation sans supprimer les données hors ligne", () => {
    saveAuth("token-valide", user);

    markAccountDisabled();

    expect(getToken()).toBeNull();
    expect(isAccountDisabled()).toBe(true);
    expect(getAuthMessage()).toContain("désactivé");
  });

  it("efface la raison de désactivation lors d'une nouvelle connexion", () => {
    markAccountDisabled();

    saveAuth("nouveau-token", user);

    expect(isAccountDisabled()).toBe(false);
    expect(getAuthMessage()).toBeNull();
  });

  it("conserve le message de refus de session au redémarrage de l'application", () => {
    clearAuth();
    localStorage.setItem("terrain_auth_message", "Session refusée par le serveur : compte non rattaché.");

    expect(getStoredActiveAuth()).toBeNull();
    expect(getAuthMessage()).toBe("Session refusée par le serveur : compte non rattaché.");
  });

  it("masque le diagnostic HTTP historique qui contient l'URL de l'API", () => {
    localStorage.setItem(
      "terrain_auth_message",
      "Numéro ou mot de passe incorrect [HTTP 401 · https://workspaceapi.example/api/terrain/auth/login]",
    );

    expect(getAuthMessage()).toBe("Numéro ou mot de passe incorrect");
    expect(getAuthMessage()).not.toMatch(/https?:\/\/|\/api\//);
  });
});
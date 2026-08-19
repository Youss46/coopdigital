import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentUser } from "./types";
import {
  clearAuth,
  getLastAuthActivity,
  getStoredActiveAuth,
  getToken,
  isTerrainSessionIdle,
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
});
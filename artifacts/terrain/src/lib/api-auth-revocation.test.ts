import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./api";
import {
  clearAuth,
  COOPERATIVE_MISSING_MESSAGE,
  getAuthMessage,
  getToken,
  isAccountDisabled,
  saveAuth,
  COMPTE_DESACTIVE_MESSAGE,
} from "./auth";
import type { AgentUser } from "./types";

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
  id: 42,
  nom: "Kone",
  prenoms: "Awa",
  email: "awa@example.test",
  telephone: "0700000000",
  role: "peseur",
  cooperativeId: 9,
  section: null,
  zoneType: null,
  zoneNom: null,
};

describe("révocation terrain côté client", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { href: "" } },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: "COMPTE_DESACTIVE",
        erreur: COMPTE_DESACTIVE_MESSAGE,
      }),
    }));
  });

  afterEach(() => {
    clearAuth();
    vi.unstubAllGlobals();
  });

  it("efface la session, conserve le motif et redirige après une réponse de révocation", async () => {
    saveAuth("jwt-encore-valide", user);

    await expect(apiGet("/profil")).rejects.toThrow(COMPTE_DESACTIVE_MESSAGE);

    expect(getToken()).toBeNull();
    expect(isAccountDisabled()).toBe(true);
    expect(getAuthMessage()).toBe(COMPTE_DESACTIVE_MESSAGE);
    expect((globalThis.window as { location: { href: string } }).location.href).toBe("/login");
  });

  it("remplace le 401 générique Non autorisé par une cause de rattachement explicite", async () => {
    saveAuth("jwt-encore-valide", user);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ erreur: "Non autorisé" }),
    }));

    await expect(apiGet("/profil")).rejects.toThrow(COOPERATIVE_MISSING_MESSAGE);

    expect(getToken()).toBeNull();
    expect(getAuthMessage()).toBe(COOPERATIVE_MISSING_MESSAGE);
    expect((globalThis.window as { location: { href: string } }).location.href).toBe("/login");
  });

  it("redirige aussi pour le code de coopérative manquante renvoyé en 403", async () => {
    saveAuth("jwt-encore-valide", user);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: "COOPERATIVE_MISSING",
        erreur: COOPERATIVE_MISSING_MESSAGE,
      }),
    }));

    await expect(apiGet("/profil")).rejects.toThrow(COOPERATIVE_MISSING_MESSAGE);

    expect(getToken()).toBeNull();
    expect(getAuthMessage()).toBe(COOPERATIVE_MISSING_MESSAGE);
    expect((globalThis.window as { location: { href: string } }).location.href).toBe("/login");
  });
});
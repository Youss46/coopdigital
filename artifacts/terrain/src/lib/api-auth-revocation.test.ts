import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet, apiPost } from "./api";
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
    expect(getAuthMessage()).toMatch(/HTTP 403.*COMPTE_DESACTIVE/);
    expect((globalThis.window as { location: { href: string } }).location.href).toBe("/login");
  });

  it("conserve le détail réel d'un 401 Non autorisé", async () => {
    saveAuth("jwt-encore-valide", user);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ erreur: "Non autorisé" }),
    }));

    await expect(apiGet("/profil")).rejects.toThrow(/Non autorisé.*HTTP 401/);

    expect(getToken()).toBeNull();
    expect(getAuthMessage()).toMatch(/Non autorisé.*HTTP 401/);
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

    await expect(apiGet("/profil")).rejects.toThrow(/HTTP 403.*COOPERATIVE_MISSING/);

    expect(getToken()).toBeNull();
    expect(getAuthMessage()).toMatch(/HTTP 403.*COOPERATIVE_MISSING/);
    expect((globalThis.window as { location: { href: string } }).location.href).toBe("/login");
  });

  it("conserve le code réel d'une fonctionnalité désactivée", async () => {
    saveAuth("jwt-encore-valide", user);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        code: "FEATURE_DISABLED",
        erreur: "La fonctionnalité pesee est désactivée pour cette coopérative",
      }),
    }));

    await expect(apiGet("/pesee/sessions")).rejects.toThrow(/HTTP 403.*FEATURE_DISABLED/);
    expect(getToken()).toBe("jwt-encore-valide");
    expect((globalThis.window as { location: { href: string } }).location.href).toBe("");
  });

  it("ne déconnecte pas la session pour un refus de souscription Push facultative", async () => {
    saveAuth("jwt-encore-valide", user);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ erreur: "Non autorisé" }),
    }));

    await expect(apiPost("/push/subscribe", {
      endpoint: "https://push.example/subscription",
      keys: { p256dh: "p256dh", auth: "auth" },
    }, true)).rejects.toThrow(/Non autorisé.*HTTP 401/);

    expect(getToken()).toBe("jwt-encore-valide");
    expect(getAuthMessage()).toBeNull();
    expect((globalThis.window as { location: { href: string } }).location.href).toBe("");
  });
});
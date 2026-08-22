import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fournisseurExterneCreationAllowed, terrainAuthMiddleware } from "../middlewares/terrainAuth.js";

const createFournisseurExterneTerrain = vi.fn();

vi.mock("../services/terrainService.js", () => ({
  createFournisseurExterneTerrain,
}));

const { createFournisseurExterneHandler } = await import("../controllers/terrainController.js");

function runAuthorization(agent?: { role: string; cooperativeId: number | null }) {
  const status = vi.fn().mockReturnThis();
  const json = vi.fn();
  const next = vi.fn();

  fournisseurExterneCreationAllowed(
    { agent } as never,
    { status, json } as never,
    next,
  );

  return { status, json, next };
}

describe("création de fournisseurs externes depuis Terrain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createFournisseurExterneTerrain.mockResolvedValue({
      id: 31,
      cooperativeId: 8,
      typeFournisseur: "externe",
    });
  });

  it.each([
    { role: "chauffeur", cooperativeId: 8 },
    { role: "agent_terrain", cooperativeId: 8 },
  ])("refuse le profil terrain non autorisé: $role", ({ role, cooperativeId }) => {
    const result = runAuthorization({ role, cooperativeId });

    expect(result.next).not.toHaveBeenCalled();
    expect(result.status).toHaveBeenCalledWith(403);
    expect(result.json).toHaveBeenCalledWith({ erreur: "Réservé aux délégués et peseurs" });
  });

  it.each([
    { role: "peseur", cooperativeId: 8 },
    { role: "delegue", cooperativeId: 8 },
  ])("autorise le profil terrain existant: $role", ({ role, cooperativeId }) => {
    const result = runAuthorization({ role, cooperativeId });

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.status).not.toHaveBeenCalled();
  });

  it("refuse une requête sans token avant le garde de rôle", () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn();
    const next = vi.fn();
    const request = {
      headers: {},
      log: { error: vi.fn() },
    } as unknown as Request;

    terrainAuthMiddleware(request, { status, json } as never, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ erreur: "Token d'authentification manquant" });
  });

  it("crée le fournisseur dans la coopérative portée par le token", async () => {
    const response = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    } as unknown as Response;
    const request = {
      agent: { id: 17, role: "peseur", cooperativeId: 8 },
      body: { nom: "Kouassi", prenoms: "Awa", telephone: "0700000000" },
      log: { error: vi.fn() },
    } as unknown as Request;

    await createFournisseurExterneHandler(request, response);

    expect(createFournisseurExterneTerrain).toHaveBeenCalledWith(8, {
      nom: "Kouassi",
      prenoms: "Awa",
      telephone: "0700000000",
    });
    expect(response.status).toHaveBeenCalledWith(201);
  });
});
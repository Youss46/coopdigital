import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const creerBonReception = vi.fn();

vi.mock("../services/bonReceptionService.js", () => ({
  creerBonReception,
}));

const { creerBonTerrainHandler } = await import("../controllers/bonReceptionController.js");

describe("création des bons de réception", () => {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;

  beforeEach(() => {
    vi.clearAllMocks();
    creerBonReception.mockResolvedValue({ id: 24 });
  });

  it("autorise le peseur central à créer un bon depuis Terrain", async () => {
    const request = {
      agent: { id: 7, cooperativeId: 3, role: "peseur", delegueId: null },
      body: {
        membreDelegueId: 18,
        typeTransport: "externe",
      },
      log: { error: vi.fn() },
    } as unknown as Request;

    await creerBonTerrainHandler(request, response);

    expect(creerBonReception).toHaveBeenCalledWith(3, {
      id: 7,
      role: "peseur",
    }, expect.objectContaining({
      membreDelegueId: 18,
      typeTransport: "externe",
    }));
    expect(response.status).toHaveBeenCalledWith(201);
  });
});
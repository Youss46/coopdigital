import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("@workspace/db", () => ({
  db: { execute },
  ecrituresComptablesTable: {},
  planComptableTable: {},
  ventesExportateursTable: {},
  livraisonsTable: {},
}));

import { getFluxTresorerie } from "../controllers/etatsFinanciersController.js";

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function request() {
  return {
    query: { exercice: "2025" },
    user: { cooperativeId: 42 },
    log: { error: vi.fn() },
  } as unknown as Request;
}

describe("getFluxTresorerie", () => {
  beforeEach(() => execute.mockReset());

  it("calcule les avances octroyées, remboursées et le flux net de financement", async () => {
    execute.mockResolvedValue({
      rows: [{
        encaissementsExportateursFcfa: 900000,
        paiementsProducteursFcfa: 700000,
        avancesOctroyes: 300000,
        avancesRembourses: 125000,
        totalEntrees: 900000,
        totalSorties: 1000000,
      }],
    });
    const res = response();

    await getFluxTresorerie(request(), res);

    expect(res.json).toHaveBeenCalledWith({
      fluxOperationnelsFcfa: 200000,
      fluxFinancementFcfa: -175000,
      encaissementsExportateursFcfa: 900000,
      paiementsProducteursFcfa: 700000,
      avancesOctroyes: 300000,
      avancesRembourses: 125000,
      soldeDebutFcfa: 0,
      soldeFinalFcfa: -100000,
      exercice: 2025,
    });
  });

  it("conserve un flux de financement nul quand les remboursements couvrent les avances", async () => {
    execute.mockResolvedValue({
      rows: [{
        encaissementsExportateursFcfa: 0,
        paiementsProducteursFcfa: 0,
        avancesOctroyes: 300000,
        avancesRembourses: 300000,
        totalEntrees: 0,
        totalSorties: 300000,
      }],
    });
    const res = response();

    await getFluxTresorerie(request(), res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      avancesOctroyes: 300000,
      avancesRembourses: 300000,
      fluxFinancementFcfa: 0,
    }));
  });
});
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  select: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({}, {
    get: (_target, property: string | symbol) => `${name}.${String(property)}`,
  });

  return {
    db: { select: state.select },
    lotsTable: table("lots"),
    lotLivraisonsTable: table("lot_livraisons"),
    livraisonsTable: table("livraisons"),
    membresTable: table("membres"),
    fournisseursTable: table("fournisseurs"),
    ventesExportateursTable: table("ventes_exportateurs"),
    exportateursTable: table("exportateurs"),
    usersTable: table("users"),
    parcellesTable: table("parcelles"),
    entrepotsTable: table("entrepots"),
    expeditionsTable: table("expeditions"),
    expeditionLotsTable: table("expedition_lots"),
    expeditionHistoriqueTable: table("expedition_historique"),
  };
});

vi.mock("drizzle-orm", () => {
  const predicate = (condition: unknown): Predicate =>
    typeof condition === "function" ? condition as Predicate : () => true;

  return {
    eq: (column: string, value: unknown): Predicate => (row) => row[column] === value,
    isNull: (column: string): Predicate => (row) => row[column] == null,
    isNotNull: (column: string): Predicate => (row) => row[column] != null,
    and: (...conditions: unknown[]): Predicate =>
      (row) => conditions.every((condition) => predicate(condition)(row)),
    or: (...conditions: unknown[]): Predicate =>
      (row) => conditions.some((condition) => predicate(condition)(row)),
    inArray: (): Predicate => () => true,
    desc: vi.fn(() => ({})),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: Array.from(strings),
      values,
    }),
  };
});

vi.mock("../services/recuService.js", () => ({ reserverNumeroPesee: vi.fn() }));
vi.mock("../services/pdfService", () => ({ generateLotEudrPdf: vi.fn() }));
vi.mock("../services/expeditionsService.js", () => ({
  corrigerStatutLotAvecHistoriqueExpedition: vi.fn(),
  getLotExpeditionSummary: vi.fn(),
}));

import { previewAutoLot } from "../controllers/lotsController.js";

function buildRequest(body: Record<string, unknown>): Request {
  return Object.assign(Object.create(null), {
    body,
    user: { cooperativeId: 42 },
    log: { error: vi.fn() },
  }) as Request;
}

function buildResponse(): Response {
  return Object.assign(Object.create(null), {
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  }) as Response;
}

describe("previewAutoLot", () => {
  beforeEach(() => {
    state.rows = [
      {
        id: 1,
        poidsKg: "3000",
        produitBrutKg: "3000",
        nombreSacs: 30,
        dateLivraison: "2026-01-01",
        "livraisons.membreId": 101,
        "livraisons.fournisseurId": null,
        "membres.cooperativeId": 42,
        "fournisseurs.cooperativeId": null,
        "lot_livraisons.livraisonId": null,
      },
      {
        id: 2,
        poidsKg: "2000",
        produitBrutKg: "2000",
        nombreSacs: 20,
        dateLivraison: "2026-01-02",
        "livraisons.membreId": null,
        "livraisons.fournisseurId": 201,
        "membres.cooperativeId": null,
        "fournisseurs.cooperativeId": 42,
        "lot_livraisons.livraisonId": null,
      },
      {
        id: 3,
        poidsKg: "90000",
        produitBrutKg: "90000",
        nombreSacs: 900,
        dateLivraison: "2026-01-03",
        "livraisons.membreId": null,
        "livraisons.fournisseurId": 301,
        "membres.cooperativeId": null,
        "fournisseurs.cooperativeId": 99,
        "lot_livraisons.livraisonId": null,
      },
    ];

    state.select.mockImplementation(() => {
      let filteredRows = state.rows;
      const query = {
        from: () => query,
        leftJoin: () => query,
        where: (condition: Predicate) => {
          filteredRows = state.rows.filter(condition);
          return query;
        },
        orderBy: () => filteredRows,
      };
      return query;
    });
  });

  it("sélectionne membres et fournisseurs sans inclure les autres coopératives", async () => {
    const response = buildResponse();

    await previewAutoLot(
      buildRequest({ quantiteCibleKg: 5000, toutesOrigines: true }),
      response,
    );

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      livraisonIds: [1, 2],
      poidsTotalKg: 5000,
      deficitKg: 0,
    }));
  });

  it("conserve le filtre membre par défaut pour les autres parcours", async () => {
    const response = buildResponse();

    await previewAutoLot(buildRequest({ quantiteCibleKg: 5000 }), response);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      livraisonIds: [1],
      poidsTotalKg: 3000,
      deficitKg: 2000,
    }));
  });
});

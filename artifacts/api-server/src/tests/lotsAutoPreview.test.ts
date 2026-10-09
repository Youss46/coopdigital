import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  centralRows: [] as Row[],
  locationRows: [] as Array<{ livraisonId: number; estCentral: boolean }>,
  select: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({}, {
    get: (_target, property: string | symbol) => `${name}.${String(property)}`,
  });

  return {
    db: { select: state.select, execute: state.execute },
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
  const sql = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: Array.from(strings),
      values,
    }),
    {
      join: (chunks: unknown[], separator: unknown) => ({ chunks, separator }),
    },
  );

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
    sql,
  };
});

vi.mock("../services/recuService.js", () => ({ reserverNumeroPesee: vi.fn() }));
vi.mock("../services/pdfService", () => ({ generateLotEudrPdf: vi.fn() }));
vi.mock("../services/expeditionsService.js", () => ({
  corrigerStatutLotAvecHistoriqueExpedition: vi.fn(),
  getLotExpeditionSummary: vi.fn(),
}));

import { createLot, previewAutoLot } from "../controllers/lotsController.js";

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
    state.centralRows = [{
      id: 10,
      "entrepots.cooperativeId": 42,
      "entrepots.pourFournisseursExt": false,
    }];
    state.locationRows = [
      { livraisonId: 1, estCentral: true },
      { livraisonId: 2, estCentral: false },
    ];
    state.rows = [
      {
        id: 2,
        poidsKg: "2000",
        produitBrutKg: "2000",
        nombreSacs: 20,
        dateLivraison: "2026-01-01",
        "livraisons.membreId": null,
        "livraisons.fournisseurId": 201,
        "membres.cooperativeId": null,
        "fournisseurs.cooperativeId": 42,
        "lot_livraisons.livraisonId": null,
      },
      {
        id: 1,
        poidsKg: "3000",
        produitBrutKg: "3000",
        nombreSacs: 30,
        dateLivraison: "2026-01-02",
        "livraisons.membreId": 101,
        "livraisons.fournisseurId": null,
        "membres.cooperativeId": 42,
        "fournisseurs.cooperativeId": null,
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

    state.select.mockImplementation((selection: { id?: string }) => {
      let filteredRows = selection.id === "entrepots.id" ? state.centralRows : state.rows;
      const query = {
        from: () => query,
        leftJoin: () => query,
        where: (condition: Predicate) => {
          filteredRows = filteredRows.filter(condition);
          return query;
        },
        orderBy: () => query,
        limit: (count: number) => {
          filteredRows = filteredRows.slice(0, count);
          return query;
        },
        then: (
          resolve: (rows: Row[]) => unknown,
          reject?: (reason: unknown) => unknown,
        ) => Promise.resolve(filteredRows).then(resolve, reject),
      };
      return query;
    });
    state.execute.mockImplementation(async () => ({ rows: state.locationRows }));
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

  it("utilise uniquement le central quand son stock suffit, même si un autre entrepôt est plus ancien", async () => {
    const response = buildResponse();

    await previewAutoLot(
      buildRequest({ quantiteCibleKg: 3000, toutesOrigines: true }),
      response,
    );

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      livraisonIds: [1],
      poidsTotalKg: 3000,
      deficitKg: 0,
      nbDisponibles: 2,
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

  it("renvoie le message d'erreur précis si le calcul automatique échoue", async () => {
    state.select.mockImplementationOnce(() => {
      throw new Error("Colonne requise absente");
    });
    const response = buildResponse();

    await previewAutoLot(
      buildRequest({ quantiteCibleKg: 5000, toutesOrigines: true }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ erreur: "Colonne requise absente" });
  });

  it("renvoie le message d'erreur précis si la création du lot échoue", async () => {
    const erreurBaseDeDonnees = Object.assign(
      new Error("Failed query: SELECT ..."),
      { cause: { message: 'la colonne "cooperative_id" est introuvable' } },
    );
    state.select.mockImplementationOnce(() => {
      throw erreurBaseDeDonnees;
    });
    const response = buildResponse();

    await createLot(
      buildRequest({ cooperativeId: 42, livraisonIds: [1] }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      erreur: 'la colonne "cooperative_id" est introuvable',
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

const fixtures = vi.hoisted(() => ({
  rows: [
    {
      id: 1,
      cooperativeId: 42,
      statut: "en_retard",
      dateEcheance: "2026-09-28",
      reportDate: "2027-02-28",
      montantOctroyeFcfa: 5_000_000,
      montantRembourseFcfa: 0,
      soldeRestantFcfa: 5_000_000,
      dateOctroi: "2026-01-01",
      membreNom: "Arouna",
      membrePrenoms: "Tahita",
    },
    {
      id: 2,
      cooperativeId: 42,
      statut: "en_cours",
      dateEcheance: "2026-09-23",
      reportDate: null,
      montantOctroyeFcfa: 150_000,
      montantRembourseFcfa: 0,
      soldeRestantFcfa: 150_000,
      dateOctroi: "2026-01-02",
      membreNom: "Hamadou",
      membrePrenoms: "Ouedraogo",
    },
    {
      id: 3,
      cooperativeId: 42,
      statut: "en_cours",
      dateEcheance: "2027-03-01",
      reportDate: null,
      montantOctroyeFcfa: 80_000,
      montantRembourseFcfa: 0,
      soldeRestantFcfa: 80_000,
      dateOctroi: "2026-01-03",
      membreNom: "Kouassi",
      membrePrenoms: "Awa",
    },
    {
      id: 4,
      cooperativeId: 99,
      statut: "en_retard",
      dateEcheance: "2026-09-20",
      reportDate: null,
      montantOctroyeFcfa: 70_000,
      montantRembourseFcfa: 0,
      soldeRestantFcfa: 70_000,
      dateOctroi: "2026-01-04",
      membreNom: "Hors",
      membrePrenoms: "Coop",
    },
  ] as Row[],
}));

const mockDb = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@workspace/db", () => {
  const makeTable = (name: string) => new Proxy({ _: { name } }, {
    get: (target, property: string | symbol) => property in target
      ? target[property as keyof typeof target]
      : String(property),
  });
  return {
    db: mockDb,
    usersTable: makeTable("users"),
    membresTable: makeTable("membres"),
    avancesTable: makeTable("avances"),
    livraisonsTable: makeTable("livraisons"),
    paiementsTable: makeTable("paiements"),
    ventesExportateursTable: makeTable("ventes_exportateurs"),
    exportateursTable: makeTable("exportateurs"),
    parcellesTable: makeTable("parcelles"),
    missionsTerrainTable: makeTable("missions_terrain"),
    campagnesTable: makeTable("campagnes"),
    fournisseursTable: makeTable("fournisseurs"),
    bonsCarburantTable: makeTable("bons_carburant"),
    transfertsStockTable: makeTable("transferts_stock"),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown): Predicate => (row) => row[column] === value,
  lt: (column: string, value: unknown): Predicate => (row) =>
    row[column] !== null && row[column] !== undefined && String(row[column]) < String(value),
  gte: (column: string, value: unknown): Predicate => (row) =>
    row[column] !== null && row[column] !== undefined && String(row[column]) >= String(value),
  inArray: (column: string, values: unknown[]): Predicate => (row) => values.includes(row[column]),
  and: (...conditions: Predicate[]): Predicate => (row) => conditions.every((condition) => condition(row)),
  or: (...conditions: Predicate[]): Predicate => (row) => conditions.some((condition) => condition(row)),
  isNull: (column: string): Predicate => (row) => row[column] === null,
  desc: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("drizzle-orm/pg-core", () => ({ alias: vi.fn((table: unknown) => table) }));

const { getDashboardAvancesRetard } = await import("../controllers/dashboardController.js");

function selectChain() {
  let rows = fixtures.rows;
  const chain = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn((predicate: Predicate) => {
      rows = rows.filter(predicate);
      return chain;
    }),
    orderBy: vi.fn(async () => rows),
  };
  return chain;
}

function request(): Request {
  return {
    user: { cooperativeId: 42, id: 7, role: "pca" },
    log: { error: vi.fn() },
  } as unknown as Request;
}

function response(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

describe("avances suivies sur le tableau de bord", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("affiche l'échéance reportée et garde l'avance en cours jusqu'à la reprise", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
    mockDb.select.mockImplementation(selectChain);
    const res = response();

    await getDashboardAvancesRetard(request(), res);

    const avances = vi.mocked(res.json).mock.calls[0]![0] as Array<{
      id: number;
      dateEcheance: string | null;
      statut: string;
    }>;
    expect(avances.map(({ id }) => id)).toEqual([1, 2]);
    expect(avances.find(({ id }) => id === 1)).toMatchObject({
      dateEcheance: "2027-02-28",
      statut: "en_cours",
    });
    expect(avances.find(({ id }) => id === 2)?.statut).toBe("en_retard");
  });
});
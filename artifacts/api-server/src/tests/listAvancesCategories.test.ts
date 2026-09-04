import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

const fixtures = vi.hoisted(() => ({
  rows: [
    {
      id: 1,
      membreId: 11,
      cooperativeId: 42,
      categorieMembre: null,
      statut: "en_cours",
      planType: "reporte",
      reportDate: null,
      soldeRestantFcfa: 10_000,
      montantOctroyeFcfa: 10_000,
      montantRembourseFcfa: 0,
      dateOctroi: "2026-01-01",
      createdAt: new Date("2026-01-01"),
      membreNom: "Sans catégorie",
      membrePrenoms: "Awa",
    },
    {
      id: 2,
      membreId: 12,
      cooperativeId: 42,
      categorieMembre: "producteur",
      statut: "en_cours",
      planType: "reporte",
      reportDate: null,
      soldeRestantFcfa: 20_000,
      montantOctroyeFcfa: 20_000,
      montantRembourseFcfa: 0,
      dateOctroi: "2026-01-02",
      createdAt: new Date("2026-01-02"),
      membreNom: "Ordinaire",
      membrePrenoms: "Koffi",
    },
    {
      id: 3,
      membreId: 13,
      cooperativeId: 42,
      categorieMembre: "délégué de localités",
      statut: "en_cours",
      planType: "reporte",
      reportDate: null,
      soldeRestantFcfa: 30_000,
      montantOctroyeFcfa: 30_000,
      montantRembourseFcfa: 0,
      dateOctroi: "2026-01-03",
      createdAt: new Date("2026-01-03"),
      membreNom: "Délégué",
      membrePrenoms: "Yao",
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
    avancesTable: makeTable("avances"),
    membresTable: makeTable("membres"),
    campagnesTable: makeTable("campagnes"),
    remboursementsAvancesMembresTable: makeTable("remboursements"),
    usersTable: makeTable("users"),
    caissesTable: makeTable("caisses"),
    sessionsCaisseTable: makeTable("sessions"),
    mouvementsCaisseTable: makeTable("mouvements"),
    comptesMobilesMarchandsTable: makeTable("mobiles"),
    mouvementsMobileMarchandTable: makeTable("mouvements_mobile"),
    comptesBancairesTable: makeTable("banques"),
    mouvementsBanqueTable: makeTable("mouvements_banque"),
  };
});

vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown): Predicate => (row) => row[column] === value,
  ne: (column: string, value: unknown): Predicate => (row) =>
    row[column] !== null && row[column] !== value,
  isNull: (column: string): Predicate => (row) => row[column] === null,
  lt: (column: string, value: unknown): Predicate => (row) =>
    row[column] !== null && String(row[column]) < String(value),
  and: (...conditions: Predicate[]): Predicate => (row) => conditions.every((condition) => condition(row)),
  or: (...conditions: Predicate[]): Predicate => (row) => conditions.some((condition) => condition(row)),
  desc: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("drizzle-orm/pg-core", () => ({ alias: vi.fn((table: unknown) => table) }));
vi.mock("@workspace/api-zod", () => ({
  CreateAvanceBody: { safeParse: vi.fn() },
  RembourserAvanceBody: { safeParse: vi.fn() },
}));
vi.mock("../services/anomalieService.js", () => ({ checkAvance: vi.fn(), creerAnomalies: vi.fn() }));
vi.mock("../services/comptabiliteService.js", () => ({ generateEcrituresAvance: vi.fn() }));
vi.mock("../lib/campagneGuard.js", () => ({
  CampagneFermeeError: class CampagneFermeeError extends Error {},
  assertCampagneActiveExiste: vi.fn(),
}));

const { listAvances, getAvancesEncours, getAvancesReportees } =
  await import("../controllers/avancesController.js");

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
    query: {},
    params: {},
    user: { cooperativeId: 42, id: 7, role: "pca" },
    log: { error: vi.fn() },
  } as unknown as Request;
}

function response(): Response {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: {},
  } as unknown as Response;
}

describe("listes des avances ordinaires", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockImplementation(selectChain);
  });

  it.each([
    ["générale", listAvances],
    ["en cours", getAvancesEncours],
    ["reportée", getAvancesReportees],
  ])("inclut les catégories NULL et ordinaires mais exclut le délégué — liste %s", async (_label, handler) => {
    const res = response();

    await handler(request(), res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    const payload = vi.mocked(res.json).mock.calls[0]![0] as { avances: Array<{ membreId: number }> };
    expect(payload.avances.map((avance) => avance.membreId).sort()).toEqual([11, 12]);
  });
});
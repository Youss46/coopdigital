import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
const initialRows = fixtures.rows.map((row) => ({ ...row }));

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
  inArray: (column: string, values: unknown[]): Predicate => (row) => values.includes(row[column]),
  and: (...conditions: unknown[]): Predicate => (row) => conditions.every((condition) => {
    if (typeof condition === "function") return (condition as Predicate)(row);
    if (!condition || typeof condition !== "object") return true;
    const expression = condition as { strings?: string[]; values?: unknown[] };
    if (!expression.strings?.join("").includes("::text = ")) return true;
    return effectiveStatus(row) === expression.values?.at(-1);
  }),
  or: (...conditions: Predicate[]): Predicate => (row) => conditions.some((condition) => condition(row)),
  desc: vi.fn(() => ({})),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: Array.from(strings),
    values,
  })),
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

const { listAvances, getAvancesDeleguesLocalitesResume, getAvancesEncours, getAvancesReportees } =
  await import("../controllers/avancesController.js");

function effectiveStatus(row: Row): string {
  const status = String(row["statut"] ?? "");
  if (status !== "en_cours" && status !== "en_retard") return status;
  const today = new Date().toISOString().slice(0, 10);
  const reportDate = typeof row["reportDate"] === "string" ? row["reportDate"] : null;
  const dueDate = typeof row["dateEcheance"] === "string" ? row["dateEcheance"] : null;
  if (reportDate && reportDate >= today) return "en_cours";
  const effectiveDueDate = [reportDate, dueDate].filter((date): date is string => date !== null).sort().at(-1);
  if (effectiveDueDate) return effectiveDueDate < today ? "en_retard" : "en_cours";
  return status;
}

function selectChain(selection: Record<string, unknown> = {}) {
  let rows = fixtures.rows;
  let offset = 0;
  let limit = Number.POSITIVE_INFINITY;
  const requestedStatus = (selection["total"] as { values?: unknown[] } | undefined)?.values?.at(-1);
  const chain: Record<string, any> = {};
  const result = () => {
    if ("aUneAvanceEnRetard" in selection) {
      const byMember = new Map<number, Row[]>();
      for (const row of rows) {
        const membreId = Number(row["membreId"]);
        byMember.set(membreId, [...(byMember.get(membreId) ?? []), row]);
      }
      return [...byMember.entries()].map(([membreId, membreRows]) => ({
        membreId,
        soldeActifFcfa: membreRows
          .filter((row) => ["en_cours", "en_retard"].includes(effectiveStatus(row)))
          .reduce((sum, row) => sum + Number(row["soldeRestantFcfa"] ?? 0), 0),
        aUneAvanceEnRetard: membreRows.some((row) => effectiveStatus(row) === "en_retard"),
      }));
    }
    if ("total" in selection) {
      const filteredRows = requestedStatus
        ? rows.filter((row) => effectiveStatus(row) === requestedStatus)
        : rows;
      return [{
        total: filteredRows.length,
        soldeActifFcfa: filteredRows
          .filter((row) => ["en_cours", "en_retard"].includes(effectiveStatus(row)))
          .reduce((sum, row) => sum + Number(row["soldeRestantFcfa"] ?? 0), 0),
      }];
    }
    return rows.slice(offset, offset + limit);
  };
  Object.assign(chain, {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn((predicate: unknown) => {
      if (typeof predicate === "function") rows = rows.filter(predicate as Predicate);
      return chain;
    }),
    orderBy: vi.fn(() => chain),
    limit: vi.fn((value: number) => {
      limit = value;
      return chain;
    }),
    offset: vi.fn((value: number) => {
      offset = value;
      return chain;
    }),
    groupBy: vi.fn(() => chain),
    then: (resolve: (value: Row[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve, reject),
  });
  return chain;
}

function request(query: Record<string, string> = {}): Request {
  return {
    query,
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
    fixtures.rows.splice(0, fixtures.rows.length, ...initialRows.map((row) => ({ ...row })));
    mockDb.select.mockImplementation(selectChain);
  });

  afterEach(() => {
    vi.useRealTimers();
    fixtures.rows.splice(0, fixtures.rows.length, ...initialRows.map((row) => ({ ...row })));
  });

  it("garde une avance reportée en cours jusqu'à sa date de reprise", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
    fixtures.rows.push(
      {
        ...fixtures.rows[0]!,
        id: 4,
        membreId: 14,
        categorieMembre: "producteur",
        statut: "en_cours",
        planType: "reporte",
        reportDate: "2027-02-28",
        dateEcheance: "2026-09-28",
      },
      {
        ...fixtures.rows[1]!,
        id: 5,
        membreId: 15,
        categorieMembre: "producteur",
        statut: "en_cours",
        planType: "integral",
        reportDate: null,
        dateEcheance: "2026-09-28",
      },
    );

    const res = response();
    await listAvances(request(), res);

    const payload = vi.mocked(res.json).mock.calls[0]![0] as {
      avances: Array<{ id: number; statut: string; dateEcheance: string | null }>;
    };
    expect(payload.avances.find((avance) => avance.id === 4)?.statut).toBe("en_cours");
    expect(payload.avances.find((avance) => avance.id === 4)?.dateEcheance).toBe("2027-02-28");
    expect(payload.avances.find((avance) => avance.id === 5)?.statut).toBe("en_retard");

    const resEnRetard = response();
    await listAvances(request({ statut: "en_retard" }), resEnRetard);
    const avancesEnRetard = vi.mocked(resEnRetard.json).mock.calls[0]![0] as {
      avances: Array<{ id: number }>;
    };
    expect(avancesEnRetard.avances.map((avance) => avance.id)).toEqual([5]);
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

  it.each([
    ["générale", listAvances],
    ["reportée", getAvancesReportees],
  ])("affiche uniquement les membres délégués dans la portée dédiée — liste %s", async (_label, handler) => {
    const res = response();
    res.locals.membreDelegueLocalite = true;

    await handler(request(), res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    const payload = vi.mocked(res.json).mock.calls[0]![0] as { avances: Array<{ membreId: number }> };
    expect(payload.avances.map((avance) => avance.membreId)).toEqual([13]);
  });

  it("retourne une seule page de la liste globale avec les totaux globaux", async () => {
    const template = fixtures.rows[2]!;
    fixtures.rows.splice(
      0,
      fixtures.rows.length,
      ...Array.from({ length: 55 }, (_, index) => ({
        ...template,
        id: 100 + index,
        membreId: 1000 + index,
        createdAt: new Date(`2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`),
      })),
    );
    const res = response();
    res.locals.membreDelegueLocalite = true;

    await listAvances(request({ page: "2", limit: "10" }), res);

    const payload = vi.mocked(res.json).mock.calls[0]![0] as {
      avances: Array<{ id: number }>;
      total: number;
      page: number;
      limit: number;
      totalPages: number;
    };
    expect(payload).toMatchObject({ total: 55, page: 2, limit: 10, totalPages: 6 });
    expect(payload.avances).toHaveLength(10);
    expect(payload.avances[0]?.id).toBe(110);
  });

  it("filtre les statuts effectifs avant de paginer la liste globale", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
    const template = fixtures.rows[2]!;
    fixtures.rows.splice(
      0,
      fixtures.rows.length,
      {
        ...template,
        id: 301,
        statut: "en_cours",
        dateEcheance: "2026-09-20",
        reportDate: null,
        soldeRestantFcfa: 4000,
      },
      {
        ...template,
        id: 302,
        statut: "en_cours",
        dateEcheance: "2026-12-20",
        reportDate: null,
        soldeRestantFcfa: 5000,
      },
    );
    const res = response();
    res.locals.membreDelegueLocalite = true;

    await listAvances(request({ statut: "en_retard", page: "1", limit: "1" }), res);

    const payload = vi.mocked(res.json).mock.calls[0]![0] as {
      avances: Array<{ id: number; statut: string }>;
      total: number;
      soldeActifFcfa: number;
    };
    expect(payload.total).toBe(1);
    expect(payload.soldeActifFcfa).toBe(4000);
    expect(payload.avances).toEqual([expect.objectContaining({ id: 301, statut: "en_retard" })]);
  });

  it("regroupe le solde actif et le signalement de retard par membre", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00.000Z"));
    const template = fixtures.rows[2]!;
    fixtures.rows.splice(
      0,
      fixtures.rows.length,
      {
        ...template,
        id: 401,
        statut: "en_cours",
        dateEcheance: "2026-09-20",
        reportDate: null,
        soldeRestantFcfa: 4000,
      },
      {
        ...template,
        id: 402,
        statut: "en_cours",
        dateEcheance: "2026-12-20",
        reportDate: null,
        soldeRestantFcfa: 5000,
      },
    );
    const res = response();
    res.locals.membreDelegueLocalite = true;

    await getAvancesDeleguesLocalitesResume(request(), res);

    expect(vi.mocked(res.json).mock.calls[0]![0]).toEqual({
      resumes: [{ membreId: 13, soldeActifFcfa: 9000, aUneAvanceEnRetard: true }],
    });
  });
});
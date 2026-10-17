import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  gte: vi.fn((...args: unknown[]) => ({ op: "gte", args })),
  lte: vi.fn((...args: unknown[]) => ({ op: "lte", args })),
  eq: vi.fn((...args: unknown[]) => ({ op: "eq", args })),
  inArray: vi.fn((...args: unknown[]) => ({ op: "inArray", args })),
  and: vi.fn((...args: unknown[]) => args),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({
    strings: Array.from(strings),
    values,
  })),
}));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({ _: { name } }, {
    get(target, property) {
      if (property in target) return Reflect.get(target, property);
      return { table: name, column: String(property) };
    },
  });
  return {
    db: { select: mocks.select },
    bonsCarburantTable: table("bons_carburant"),
    paiementsTable: table("paiements"),
    vehiculesTable: table("vehicules"),
    chauffeursTable: table("chauffeurs"),
    missionsTransportTable: table("missions_transport"),
    entretienVehiculeTable: table("entretien_vehicule"),
    depensesVehiculeTable: table("depenses_vehicule"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  eq: mocks.eq,
  gte: mocks.gte,
  lte: mocks.lte,
  inArray: mocks.inArray,
  desc: vi.fn(() => ({})),
  sql: mocks.sql,
}));

const { getBonsCarburantPourReglement, getBonsCarburantPourRecuReglement } =
  await import("../services/transportService.js");

function setupSelectResult(rows: unknown[] = []) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  mocks.select.mockReturnValue(chain);
  return chain;
}

describe("périodes des fiches de règlement carburant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filtre les bons en attente sur leur date d’utilisation", async () => {
    const chain = setupSelectResult();
    await getBonsCarburantPourReglement(42, undefined, {
      dateDebut: "2026-03-01",
      dateFin: "2026-03-31",
    });

    expect(mocks.gte).toHaveBeenCalledWith(
      expect.objectContaining({ column: "dateUtilisation", table: "bons_carburant" }),
      "2026-03-01",
    );
    expect(mocks.lte).toHaveBeenCalledWith(
      expect.objectContaining({ column: "dateUtilisation", table: "bons_carburant" }),
      "2026-03-31",
    );
    expect(chain.where).toHaveBeenCalledOnce();
  });

  it("filtre les bons réglés sur la date effective du paiement", async () => {
    const chain = setupSelectResult();
    await getBonsCarburantPourRecuReglement(42, {
      dateDebut: "2026-03-01",
      dateFin: "2026-03-31",
    });

    const dateFilters = mocks.sql.mock.calls.map(([strings, ...values]) => ({
      text: Array.from(strings as TemplateStringsArray).join(""),
      values,
    })).filter(({ text }) => text.includes("DATE(COALESCE"));
    expect(dateFilters).toHaveLength(2);
    expect(dateFilters[0]?.text).toContain(">= ");
    expect(dateFilters[1]?.text).toContain("<= ");
    expect(dateFilters[0]?.values).toContain("2026-03-01");
    expect(dateFilters[1]?.values).toContain("2026-03-31");
    expect(chain.where).toHaveBeenCalledOnce();
  });
});

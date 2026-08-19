import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ecritures: [] as Array<Record<string, unknown>>,
}));

vi.mock("@workspace/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@workspace/db")>();
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn().mockResolvedValue([{ autoLivraisons: false }]),
  };
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);

  return {
    ...original,
    db: {
      select: vi.fn(() => query),
      insert: vi.fn(() => ({
        values: vi.fn(async (value: Record<string, unknown>) => {
          state.ecritures.push(value);
        }),
      })),
    },
  };
});

vi.mock("../services/planComptableService.js", () => ({
  getParamsEcriture: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { generateEcrituresLivraison } = await import("../services/comptabiliteService.js");

describe("generateEcrituresLivraison — charges du bon membre délégué", () => {
  beforeEach(() => {
    state.ecritures.length = 0;
  });

  it("constate la charge avancée entière mais ne récupère sur le membre que la part déduite", async () => {
    await generateEcrituresLivraison(1, {
      livraisonId: 12,
      membreId: 7,
      membreNom: "Awa Koné",
      montantBrutFcfa: 10_000,
      avanceDeduiteFcfa: 0,
      montantNetFcfa: 0,
      dateLivraison: "2026-08-19",
      fraisCarburantAvancesFcfa: 8_000,
      autresChargesAvanceesFcfa: 6_000,
      fraisCarburantDeduitsFcfa: 8_000,
      autresChargesDeduitesFcfa: 2_000,
      autresChargesLibelle: "Transport complémentaire",
    });

    expect(state.ecritures).toEqual(expect.arrayContaining([
      expect.objectContaining({ libelleProppose: "Achat cacao – Awa Koné", montantFcfa: 10_000 }),
      expect.objectContaining({ libelleProppose: "Carburant avancé – Awa Koné", montantFcfa: 8_000 }),
      expect.objectContaining({ libelleProppose: "Retenue carburant – Awa Koné", montantFcfa: 8_000 }),
      expect.objectContaining({ libelleProppose: "Transport complémentaire avancé – Awa Koné", montantFcfa: 6_000 }),
      expect.objectContaining({ libelleProppose: "Retenue transport complémentaire – Awa Koné", montantFcfa: 2_000 }),
    ]));

    const recoveries401 = state.ecritures
      .filter((e) => e.compteDebitPropose === "401")
      .reduce((total, e) => total + Number(e.montantFcfa), 0);
    expect(recoveries401).toBe(10_000);
  });
});
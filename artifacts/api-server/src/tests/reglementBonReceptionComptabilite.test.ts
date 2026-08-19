import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  ecritures: [] as Array<Record<string, unknown>>,
  params: new Map<string, { compteDebit: string; compteCredit: string }>(),
  livraisonUpdate: null as Record<string, unknown> | null,
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
      update: vi.fn(() => {
        const updateQuery = {
          set: vi.fn((value: Record<string, unknown>) => {
            state.livraisonUpdate = value;
            return updateQuery;
          }),
          where: vi.fn().mockResolvedValue(undefined),
        };
        return updateQuery;
      }),
    },
  };
});

vi.mock("../services/planComptableService.js", () => ({
  getParamsEcriture: vi.fn(async (_cooperativeId: number, module: string, operation: string) =>
    state.params.get(`${module}:${operation}`),
  ),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const {
  generateEcrituresLivraison,
  proposerEcriture,
  resolveCompteDetteProducteur,
} = await import("../services/comptabiliteService.js");

describe("generateEcrituresLivraison — charges du bon membre délégué", () => {
  beforeEach(() => {
    state.ecritures.length = 0;
    state.params.clear();
    state.livraisonUpdate = null;
  });

  it("constate une créance entière et ne récupère sur le membre que la part déduite, sans produit 758", async () => {
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
      expect.objectContaining({ libelleProppose: "Achat cacao – Awa Koné", compteDebitPropose: "601", compteCreditPropose: "401", montantFcfa: 10_000 }),
      expect.objectContaining({ libelleProppose: "Carburant avancé – Awa Koné", compteDebitPropose: "4091", compteCreditPropose: "521", montantFcfa: 8_000 }),
      expect.objectContaining({ libelleProppose: "Retenue carburant – Awa Koné", compteDebitPropose: "401", compteCreditPropose: "4091", montantFcfa: 8_000 }),
      expect.objectContaining({ libelleProppose: "Transport complémentaire avancé – Awa Koné", compteDebitPropose: "4091", compteCreditPropose: "521", montantFcfa: 6_000 }),
      expect.objectContaining({ libelleProppose: "Retenue transport complémentaire – Awa Koné", compteDebitPropose: "401", compteCreditPropose: "4091", montantFcfa: 2_000 }),
    ]));
    expect(state.ecritures.some((e) => e.compteCreditPropose === "758")).toBe(false);

    const recoveries401 = state.ecritures
      .filter((e) => e.compteDebitPropose === "401")
      .reduce((total, e) => total + Number(e.montantFcfa), 0);
    expect(recoveries401).toBe(10_000);

    const creance4091 = state.ecritures.reduce((solde, e) => {
      const montant = Number(e.montantFcfa);
      if (e.compteDebitPropose === "4091") return solde + montant;
      if (e.compteCreditPropose === "4091") return solde - montant;
      return solde;
    }, 0);
    expect(creance4091).toBe(4_000);
  });

  it("débite la dette créée par l'achat et ignore les anciens comptes de retenue divergents", async () => {
    state.params.set("receptions_membres_delegues:frais_carburant", {
      compteDebit: "4092",
      compteCredit: "571",
    });
    state.params.set("receptions_membres_delegues:retenue_carburant", {
      compteDebit: "4012",
      compteCredit: "758",
    });

    await generateEcrituresLivraison(1, {
      livraisonId: 13,
      membreId: 8,
      membreNom: "Mariam Yao",
      montantBrutFcfa: 20_000,
      avanceDeduiteFcfa: 0,
      montantNetFcfa: 15_000,
      dateLivraison: "2026-08-19",
      fraisCarburantAvancesFcfa: 5_000,
      fraisCarburantDeduitsFcfa: 5_000,
    });

    expect(state.ecritures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        libelleProppose: "Carburant avancé – Mariam Yao",
        compteDebitPropose: "4092",
        compteCreditPropose: "571",
        montantFcfa: 5_000,
      }),
      expect.objectContaining({
        libelleProppose: "Retenue carburant – Mariam Yao",
        compteDebitPropose: "401",
        compteCreditPropose: "4092",
        montantFcfa: 5_000,
      }),
    ]));
    expect(state.ecritures.some((e) => e.compteCreditPropose === "758")).toBe(false);
    expect(state.ecritures.some((e) => e.compteDebitPropose === "4012")).toBe(false);
  });

  it("utilise le même compte de dette personnalisé pour l'achat et sa retenue", async () => {
    state.params.set("livraisons:achat_cacao_producteur", {
      compteDebit: "6012",
      compteCredit: "4012",
    });
    state.params.set("receptions_membres_delegues:frais_carburant", {
      compteDebit: "4092",
      compteCredit: "571",
    });
    state.params.set("receptions_membres_delegues:retenue_carburant", {
      compteDebit: "401",
      compteCredit: "758",
    });

    await generateEcrituresLivraison(1, {
      livraisonId: 15,
      membreId: 10,
      membreNom: "Akissi Koffi",
      montantBrutFcfa: 20_000,
      avanceDeduiteFcfa: 0,
      montantNetFcfa: 15_000,
      dateLivraison: "2026-08-19",
      fraisCarburantAvancesFcfa: 5_000,
      fraisCarburantDeduitsFcfa: 5_000,
    });

    expect(state.ecritures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        libelleProppose: "Achat cacao – Akissi Koffi",
        compteDebitPropose: "6012",
        compteCreditPropose: "4012",
        montantFcfa: 20_000,
      }),
      expect.objectContaining({
        libelleProppose: "Retenue carburant – Akissi Koffi",
        compteDebitPropose: "4012",
        compteCreditPropose: "4092",
        montantFcfa: 5_000,
      }),
    ]));
    expect(state.ecritures.some((e) => e.compteCreditPropose === "758")).toBe(false);

    expect(state.livraisonUpdate).toEqual({ compteDetteProducteur: "4012" });
    state.params.set("livraisons:achat_cacao_producteur", {
      compteDebit: "601",
      compteCredit: "401",
    });
    const compteDettePaiement = await resolveCompteDetteProducteur(
      1,
      String(state.livraisonUpdate?.["compteDetteProducteur"]),
    );
    await proposerEcriture(1, {
      source: "paiement",
      sourceId: 15,
      libelle: "Paiement producteur – Akissi Koffi",
      compteDebit: compteDettePaiement,
      compteCredit: "521",
      montantFcfa: 15_000,
      date: "2026-08-19",
      numeroPiece: "PAI-15",
      tiersId: 10,
      tiersType: "membre",
    });

    const soldeDette4012 = state.ecritures.reduce((solde, e) => {
      const montant = Number(e.montantFcfa);
      if (e.compteCreditPropose === "4012") return solde + montant;
      if (e.compteDebitPropose === "4012") return solde - montant;
      return solde;
    }, 0);
    expect(compteDettePaiement).toBe("4012");
    expect(soldeDette4012).toBe(0);
    expect(state.ecritures.some((e) =>
      e.libelleProppose === "Paiement producteur – Akissi Koffi" &&
      e.compteDebitPropose === "401"
    )).toBe(false);
  });

  it("remplace une ancienne configuration de charge par la créance membre 4091", async () => {
    state.params.set("receptions_membres_delegues:autres_charges", {
      compteDebit: "618",
      compteCredit: "521",
    });

    await generateEcrituresLivraison(1, {
      livraisonId: 14,
      membreId: 9,
      membreNom: "Aya N'Dri",
      montantBrutFcfa: 12_000,
      avanceDeduiteFcfa: 0,
      montantNetFcfa: 9_000,
      dateLivraison: "2026-08-19",
      autresChargesAvanceesFcfa: 3_000,
      autresChargesDeduitesFcfa: 3_000,
    });

    expect(state.ecritures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        libelleProppose: "Autres charges avancé – Aya N'Dri",
        compteDebitPropose: "4091",
        compteCreditPropose: "521",
        montantFcfa: 3_000,
      }),
      expect.objectContaining({
        libelleProppose: "Retenue autres charges – Aya N'Dri",
        compteDebitPropose: "401",
        compteCreditPropose: "4091",
        montantFcfa: 3_000,
      }),
    ]));
  });
});
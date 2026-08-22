import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  avancesTable,
  commissionsMembresDelaguesTable,
  db,
  remboursementsAvancesMembresTable,
} from "@workspace/db";

const proposerEcriture = vi.fn();
const generateEcrituresCommission = vi.fn();

vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcriture,
  generateEcrituresCommission,
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { payerCommissionsMembreDelegue } = await import(
  "../services/commissionMembreDelegueService.js"
);

function selectWithLimit(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function selectWithOrder(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
  };
}

function updateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(undefined),
  };
}

describe("payerCommissionsMembreDelegue", () => {
  let updates: Array<ReturnType<typeof updateChain>>;

  beforeEach(() => {
    vi.clearAllMocks();
    updates = [];
    vi.mocked(db.insert).mockImplementation(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    }) as never);
    vi.mocked(db.update).mockImplementation(() => {
      const chain = updateChain();
      updates.push(chain);
      return chain as never;
    });
  });

  it("propose une seule écriture 401/4091 pour une retenue d'avance", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(() => selectWithLimit([
        { id: 17, nom: "Konde", prenoms: "Kami" },
      ]) as never)
      .mockImplementationOnce(() => selectWithOrder([
        {
          id: 92,
          membreDelegueId: 17,
          montantFcfa: 300,
          statut: "en_attente",
          sessionPeseeId: null,
        },
      ]) as never)
      .mockImplementationOnce(() => selectWithOrder([
        {
          id: 4,
          membreId: 17,
          planType: "integral",
          soldeRestantFcfa: 300,
          montantRembourse_fcfa: 0,
          statut: "en_cours",
        },
      ]) as never);

    const result = await payerCommissionsMembreDelegue(17, 3, {
      modePaiement: "especes",
    });

    expect(result).toEqual({
      montantTotal: 300,
      totalRetenu: 300,
      montantNet: 0,
      nb: 1,
    });

    await vi.waitFor(() => expect(proposerEcriture).toHaveBeenCalledOnce());
    expect(proposerEcriture).toHaveBeenCalledWith(3, expect.objectContaining({
      source: "avance",
      compteDebit: "401",
      compteCredit: "4091",
      montantFcfa: 300,
      tiersId: 17,
      tiersType: "membre",
    }));
    expect(generateEcrituresCommission).not.toHaveBeenCalled();
  });

  it("ne rembourse qu'une partie de l'avance quand la commission est insuffisante", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(() => selectWithLimit([
        { id: 17, nom: "Konde", prenoms: "Kami" },
      ]) as never)
      .mockImplementationOnce(() => selectWithOrder([
        { id: 92, membreDelegueId: 17, montantFcfa: 300, statut: "en_attente", sessionPeseeId: null },
      ]) as never)
      .mockImplementationOnce(() => selectWithOrder([
        {
          id: 4,
          membreId: 17,
          planType: "integral",
          soldeRestantFcfa: 1_000,
          montantRembourse_fcfa: 0,
          statut: "en_cours",
        },
      ]) as never);

    const result = await payerCommissionsMembreDelegue(17, 3, { modePaiement: "especes" });

    expect(result).toMatchObject({ totalRetenu: 300, montantNet: 0, nb: 1 });
    expect(updates[0]!.set).toHaveBeenCalledWith(expect.objectContaining({
      soldeRestantFcfa: 700,
      montantRembourse_fcfa: 300,
      statut: "en_cours",
    }));
    expect(updates[1]!.set).toHaveBeenCalledWith(expect.objectContaining({
      retenueAvancesFcfa: 300,
    }));
    await vi.waitFor(() => expect(proposerEcriture).toHaveBeenCalledOnce());
    expect(proposerEcriture).toHaveBeenCalledWith(3, expect.objectContaining({ montantFcfa: 300 }));
  });

  it("laisse intactes les avances suivantes une fois les commissions épuisées", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(() => selectWithLimit([
        { id: 17, nom: "Konde", prenoms: "Kami" },
      ]) as never)
      .mockImplementationOnce(() => selectWithOrder([
        { id: 92, membreDelegueId: 17, montantFcfa: 300, statut: "en_attente", sessionPeseeId: null },
      ]) as never)
      .mockImplementationOnce(() => selectWithOrder([
        { id: 4, membreId: 17, planType: "integral", soldeRestantFcfa: 300, montantRembourse_fcfa: 0, statut: "en_cours" },
        { id: 5, membreId: 17, planType: "integral", soldeRestantFcfa: 1_000, montantRembourse_fcfa: 0, statut: "en_cours" },
      ]) as never);

    const result = await payerCommissionsMembreDelegue(17, 3, { modePaiement: "especes" });

    expect(result).toMatchObject({ totalRetenu: 300, montantNet: 0, nb: 1 });
    expect(updates[0]!.set).toHaveBeenCalledWith(expect.objectContaining({
      soldeRestantFcfa: 0,
      montantRembourse_fcfa: 300,
      statut: "rembourse",
    }));
    expect(updates[1]!.set).toHaveBeenCalledWith(expect.objectContaining({
      retenueAvancesFcfa: 300,
    }));
    expect(updates).toHaveLength(2);
    await vi.waitFor(() => expect(proposerEcriture).toHaveBeenCalledOnce());
    expect(proposerEcriture).toHaveBeenCalledWith(3, expect.objectContaining({ montantFcfa: 300 }));
  });

  it("annule les avances et commissions si une écriture de commission échoue", async () => {
    const state = {
      avance: {
        id: 4,
        membreId: 17,
        planType: "integral",
        soldeRestantFcfa: 1_000,
        montantRembourse_fcfa: 0,
        statut: "en_cours",
      },
      commission: {
        id: 92,
        membreDelegueId: 17,
        montantFcfa: 300,
        statut: "en_attente",
        sessionPeseeId: null,
      },
      remboursements: [] as unknown[],
    };
    const initialState = structuredClone(state);

    const tx = {
      select: vi.fn()
        .mockImplementationOnce(() => selectWithLimit([
          { id: 17, nom: "Konde", prenoms: "Kami" },
        ]))
        .mockImplementationOnce(() => selectWithOrder([state.commission]))
        .mockImplementationOnce(() => selectWithOrder([state.avance])),
      execute: vi.fn().mockResolvedValue(undefined),
      update: vi.fn((table: unknown) => {
        const chain = {
          set: vi.fn((values: Record<string, unknown>) => {
            if (table === commissionsMembresDelaguesTable) {
              throw new Error("échec de mise à jour de la commission");
            }
            Object.assign(state.avance, values);
            return chain;
          }),
          where: vi.fn().mockResolvedValue(undefined),
        };
        return chain;
      }),
      insert: vi.fn(() => ({
        values: vi.fn((values: unknown[]) => {
          state.remboursements.push(...values);
          return Promise.resolve(undefined);
        }),
      })),
    };

    vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
      try {
        return await callback(tx as never);
      } catch (error) {
        Object.assign(state, structuredClone(initialState));
        throw error;
      }
    });

    await expect(
      payerCommissionsMembreDelegue(17, 3, { modePaiement: "especes" }),
    ).rejects.toThrow("échec de mise à jour de la commission");

    expect(state).toEqual(initialState);
    expect(tx.update).toHaveBeenCalledWith(avancesTable);
    expect(tx.update).toHaveBeenCalledWith(commissionsMembresDelaguesTable);
    expect(tx.insert).toHaveBeenCalledWith(remboursementsAvancesMembresTable);
    expect(generateEcrituresCommission).not.toHaveBeenCalled();
    expect(proposerEcriture).not.toHaveBeenCalled();
  });
});
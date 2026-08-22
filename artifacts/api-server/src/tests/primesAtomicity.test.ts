import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@workspace/db";

const generateEcrituresPrimePaiementDansTransaction = vi.fn();

vi.mock("../services/comptabiliteService", () => ({
  generateEcrituresPrimeReception: vi.fn(),
  generateEcrituresPrimePaiementDansTransaction,
}));

vi.mock("../services/caisseService", () => ({
  verifierCaisseCentrale: vi.fn(),
  debiterCaissePourPrimeMembre: vi.fn(),
  verifierCompteMobilePourPrime: vi.fn(),
  debiterCompteMobilePourPrime: vi.fn(),
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const { payerBulk } = await import("../services/primesService");

function selectChain<T>(rows: T[], withLimit = true) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
    then: vi.fn((resolve: (value: T[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject)),
  };
  chain.where.mockReturnValue(chain);
  return chain;
}

function txUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

describe("paiement atomique des primes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propage une erreur comptable afin de rollbacker le paiement en masse", async () => {
    const distributionSelect = selectChain([{ id: 10, statut: "validee" }]);
    const membersSelect = selectChain([{
      pm: {
        id: 101,
        membreId: 7,
        distributionId: 10,
        statut: "en_attente",
        montantNetFcfa: 1000,
        deductionAvancesFcfa: 0,
      },
      membreNom: "Koffi",
    }], false);

    vi.mocked(db.select)
      .mockImplementationOnce(() => distributionSelect as never)
      .mockImplementationOnce(() => membersSelect as never);

    const tx = {
      select: vi.fn()
        .mockImplementationOnce(() => selectChain([{ id: 10, statut: "validee" }]))
        .mockImplementationOnce(() => selectChain([{
          pm: {
            id: 101,
            membreId: 7,
            distributionId: 10,
            statut: "en_attente",
            montantNetFcfa: 1000,
            deductionAvancesFcfa: 0,
          },
          membreNom: "Koffi",
        }])),
      update: vi.fn().mockImplementation(() => txUpdateChain()),
    };
    const rollbackError = new Error("écriture OHADA indisponible");
    generateEcrituresPrimePaiementDansTransaction.mockRejectedValueOnce(rollbackError);
    vi.mocked(db.transaction).mockImplementationOnce(async (callback) => callback(tx as never));

    let error: unknown;
    try {
      await payerBulk(3, 10, {
        modePaiement: "virement",
        datePaiement: "2026-08-22",
      }, 55);
    } catch (caught) {
      error = caught;
    }
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledOnce();
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(tx.select.mock.results[1].value.for).toHaveBeenCalledWith("update");
    expect(generateEcrituresPrimePaiementDansTransaction).toHaveBeenCalledWith(
      tx,
      3,
      expect.objectContaining({ primeMembreId: 101, montantFcfa: 1000 }),
    );
    expect(error).toBe(rollbackError);
  });

  it("refuse un second paiement en masse quand le verrou a déjà consommé les allocations", async () => {
    const distributionSelect = selectChain([{ id: 10, statut: "validee" }]);
    const membersSelect = selectChain([], false);
    const tx = {
      select: vi.fn()
        .mockImplementationOnce(() => distributionSelect)
        .mockImplementationOnce(() => membersSelect),
      update: vi.fn(),
    };
    vi.mocked(db.transaction).mockImplementationOnce(async (callback) => callback(tx as never));

    await expect(payerBulk(3, 10, {
      modePaiement: "virement",
      datePaiement: "2026-08-22",
    }, 56)).rejects.toThrow("déjà payées");

    expect(tx.update).not.toHaveBeenCalled();
    expect(generateEcrituresPrimePaiementDansTransaction).not.toHaveBeenCalled();
  });
});
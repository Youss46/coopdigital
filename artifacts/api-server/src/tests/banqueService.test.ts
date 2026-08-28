import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
};

const proposerEcriture = vi.fn();
const proposerEcrituresDansTransaction = vi.fn();

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({
    _: { name },
    id: {},
    cooperativeId: {},
    actif: {},
  });
  return {
    db: mockDb,
    comptesBancairesTable: table("comptes_bancaires"),
    mouvementsBanqueTable: table("mouvements_banque"),
    caissesTable: table("caisses"),
    mouvementsCaisseTable: table("mouvements_caisse"),
  };
});

vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcriture,
  proposerEcrituresDansTransaction,
}));

vi.mock("../lib/logger.js", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

const { enregistrerMouvement, virementVersCaisse } = await import("../services/banqueService.js");

function selectChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function insertChain<T>(rows: T[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

function updateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

function transactionFor(compte: Record<string, unknown>, mouvement = { id: 801 }) {
  return {
    select: vi.fn().mockReturnValue(selectChain([compte])),
    insert: vi.fn().mockReturnValue(insertChain([mouvement])),
    update: vi.fn().mockReturnValue(updateChain()),
  };
}

function virementTransaction() {
  const tx = {
    select: vi.fn()
      .mockReturnValueOnce(selectChain([{
        id: 902,
        cooperativeId: 7,
        actif: true,
        nom: "Compte principal",
        soldeActuelFcfa: "500000",
      }]))
      .mockReturnValueOnce(selectChain([{
        id: 12,
        cooperativeId: 7,
        nom: "Caisse centrale",
        soldeActuelFcfa: "100000",
      }])),
    execute: vi.fn().mockResolvedValue({ rows: [{ id: 44 }] }),
    insert: vi.fn()
      .mockReturnValueOnce(insertChain([{ id: 901 }]))
      .mockReturnValueOnce(insertChain([{ id: 902 }])),
    update: vi.fn().mockReturnValue(updateChain()),
  };
  return tx;
}
describe("mouvements bancaires pour encaissement de chèque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuse un compte inactif avant de créer le mouvement", async () => {
    const tx = {
      select: vi.fn().mockReturnValue(selectChain([{
        id: 902,
        cooperativeId: 7,
        actif: false,
        soldeActuelFcfa: "500000",
        soldeMiniAlerteFcfa: "0",
      }])),
      insert: vi.fn(),
      update: vi.fn(),
    };

    await expect(enregistrerMouvement(902, 7, {
      type: "debit",
      motif: "paiement_cheque",
      montantFcfa: 125000,
    }, tx as never)).rejects.toThrow("Compte bancaire inactif");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("débite le compte sélectionné et propose l'écriture dans la même transaction", async () => {
    const compte = {
      id: 902,
      cooperativeId: 7,
      actif: true,
      nom: "Compte principal",
      soldeActuelFcfa: "500000",
      soldeMiniAlerteFcfa: "0",
    };
    const mouvement = { id: 801 };
    const tx = {
      select: vi.fn().mockReturnValue(selectChain([compte])),
      insert: vi.fn().mockReturnValue(insertChain([mouvement])),
      update: vi.fn().mockReturnValue(updateChain()),
    };

    const result = await enregistrerMouvement(902, 7, {
      type: "debit",
      motif: "paiement_cheque",
      montantFcfa: 125000,
      libelle: "Chèque CH-41",
      dateOperation: "2026-08-28",
      userId: 55,
    }, tx as never);

    expect(tx.select).toHaveBeenCalledOnce();
    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledOnce();
    expect(result.soldeActuel).toBe(375000);
    expect(proposerEcrituresDansTransaction).toHaveBeenCalledWith(
      tx,
      7,
      [expect.objectContaining({
        source: "banque",
        sourceId: 801,
        montantFcfa: 125000,
        date: "2026-08-28",
      })],
    );
    expect(proposerEcriture).not.toHaveBeenCalled();
  });

  it("ouvre une transaction pour un mouvement bancaire manuel", async () => {
    const compte = {
      id: 902,
      cooperativeId: 7,
      actif: true,
      soldeActuelFcfa: "500000",
      soldeMiniAlerteFcfa: "0",
    };
    const tx = transactionFor(compte, { id: 802 });
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));

    const result = await enregistrerMouvement(902, 7, {
      type: "credit",
      motif: "autre_credit",
      montantFcfa: 50000,
    });

    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    expect(result.soldeActuel).toBe(550000);
    expect(proposerEcrituresDansTransaction).toHaveBeenCalledWith(
      tx,
      7,
      [expect.objectContaining({ source: "banque", sourceId: 802, montantFcfa: 50000 })],
    );
  });

  it("propage une erreur d'écriture pour permettre le rollback du mouvement et du solde", async () => {
    const compte = {
      id: 902,
      cooperativeId: 7,
      actif: true,
      soldeActuelFcfa: "500000",
      soldeMiniAlerteFcfa: "0",
    };
    const tx = transactionFor(compte, { id: 803 });
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));
    proposerEcrituresDansTransaction.mockRejectedValueOnce(new Error("écriture impossible"));

    await expect(enregistrerMouvement(902, 7, {
      type: "debit",
      motif: "autre_debit",
      montantFcfa: 50000,
    })).rejects.toThrow("écriture impossible");

    expect(tx.insert).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledOnce();
  });

  it("verrouille chaque compte lors d'appels concurrents", async () => {
    const compte = {
      id: 902,
      cooperativeId: 7,
      actif: true,
      soldeActuelFcfa: "500000",
      soldeMiniAlerteFcfa: "0",
    };
    const transactions = [transactionFor(compte, { id: 804 }), transactionFor(compte, { id: 805 })];
    mockDb.transaction
      .mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(transactions[0]))
      .mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(transactions[1]));

    await Promise.all([
      enregistrerMouvement(902, 7, { type: "debit", motif: "autre_debit", montantFcfa: 10000 }),
      enregistrerMouvement(902, 7, { type: "debit", motif: "autre_debit", montantFcfa: 20000 }),
    ]);

    expect(mockDb.transaction).toHaveBeenCalledTimes(2);
    for (const tx of transactions) {
      expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    }
  });

  it("annule les deux mouvements et les deux soldes si l'écriture d'un virement échoue", async () => {
    const tx = virementTransaction();
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));
    proposerEcrituresDansTransaction.mockRejectedValueOnce(new Error("comptabilité indisponible"));

    await expect(virementVersCaisse(902, 7, {
      caisseId: 12,
      montantFcfa: 75000,
    })).rejects.toThrow("comptabilité indisponible");

    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    expect(tx.select.mock.results[1].value.for).toHaveBeenCalledWith("update");
    expect(tx.insert).toHaveBeenCalledTimes(2);
    expect(tx.update).toHaveBeenCalledTimes(2);
  });
});
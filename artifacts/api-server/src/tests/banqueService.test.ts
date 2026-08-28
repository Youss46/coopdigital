import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
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

const { enregistrerMouvement } = await import("../services/banqueService.js");

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
});
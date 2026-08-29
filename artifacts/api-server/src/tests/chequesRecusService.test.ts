import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  transaction: vi.fn(),
};
const proposerEcrituresDansTransaction = vi.fn();

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({
    _: { name },
    id: {},
    cooperativeId: {},
    numeroCheque: {},
    banque: {},
    montantFcfa: {},
    dateReception: {},
    dateEcheance: {},
    statut: {},
    dateDepot: {},
    dateEncaissement: {},
    dateRejet: {},
    motifRejet: {},
    dateAnnulation: {},
    motifAnnulation: {},
    compteBancaireId: {},
    mouvementBanqueId: {},
    venteExportateurId: {},
    exportateurId: {},
    paiementId: {},
    paiementLigneId: {},
    createdBy: {},
    createdAt: {},
    nom: {},
    montantRecuFcfa: {},
    soldeDuFcfa: {},
    montantTotalFcfa: {},
    dateEcheanceReglement: {},
  });

  return {
    db: mockDb,
    chequesRecusTable: table("cheques_recus"),
    exportateursTable: table("exportateurs"),
    ventesExportateursTable: table("ventes_exportateurs"),
    paiementsTable: table("paiements"),
    paiementLignesTable: table("paiement_lignes"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcrituresDansTransaction,
}));

const { creerChequeRecu } = await import("../services/chequesRecusService.js");

function selectChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function insertChain<T>(rows: T[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

function updateChain<T>(rows: T[] = []) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

describe("création d'un chèque reçu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("met à jour la vente et crée les éléments comptables dans la même transaction", async () => {
    const vente = {
      id: 18,
      exportateurId: 6,
      montantTotalFcfa: 500000,
      montantRecuFcfa: 100000,
      soldeDuFcfa: 400000,
      statut: "partiel",
      dateEcheanceReglement: null,
    };
    const cheque = {
      id: 44,
      cooperativeId: 7,
      venteExportateurId: 18,
      exportateurId: 6,
      paiementId: 70,
      paiementLigneId: 71,
      numeroCheque: "CHQ-44",
      statut: "a_deposer",
    };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([vente]))
        .mockReturnValueOnce(selectChain([{ id: 6, nom: "Exportateur test" }]))
        .mockReturnValueOnce(selectChain([])),
      insert: vi.fn()
        .mockReturnValueOnce(insertChain([{ id: 70 }]))
        .mockReturnValueOnce(insertChain([{ id: 71 }]))
        .mockReturnValueOnce(insertChain([cheque])),
      update: vi.fn().mockReturnValueOnce(updateChain([{ id: 18 }])),
    };
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const result = await creerChequeRecu(7, {
      venteExportateurId: 18,
      numeroCheque: "CHQ-44",
      banque: "Banque test",
      montantFcfa: 125000,
      dateReception: "2026-08-29",
      dateEcheance: null,
      createdBy: 55,
    });

    expect(result).toEqual(cheque);
    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    expect(tx.update).toHaveBeenCalledWith(expect.anything());
    expect(tx.update.mock.results[0].value.set).toHaveBeenCalledWith({
      montantRecuFcfa: 225000,
      soldeDuFcfa: 275000,
      statut: "partiel",
    });
    expect(tx.insert.mock.results[0].value.values).toHaveBeenCalledWith(expect.objectContaining({
      modePaiement: "cheque",
      montantFcfa: 125000,
      statut: "confirme",
    }));
    expect(proposerEcrituresDansTransaction).toHaveBeenCalledWith(
      tx,
      7,
      [expect.objectContaining({
        source: "encaissement",
        sourceId: 44,
        compteDebit: "511",
        compteCredit: "4111",
        montantFcfa: 125000,
        numeroPiece: "ENC-CHQ-44",
      })],
    );
  });

  it("refuse un montant supérieur au solde de la vente avant toute insertion", async () => {
    const vente = {
      id: 18,
      exportateurId: 6,
      montantTotalFcfa: 500000,
      montantRecuFcfa: 490000,
      soldeDuFcfa: 10000,
      statut: "partiel",
      dateEcheanceReglement: null,
    };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([vente]))
        .mockReturnValueOnce(selectChain([{ id: 6, nom: "Exportateur test" }])),
    };
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    await expect(creerChequeRecu(7, {
      venteExportateurId: 18,
      numeroCheque: "CHQ-45",
      banque: "Banque test",
      montantFcfa: 125000,
      dateReception: "2026-08-29",
      createdBy: 55,
    })).rejects.toThrow("Le montant dépasse le solde de la vente");
    expect(tx.select).toHaveBeenCalledTimes(2);
    expect(proposerEcrituresDansTransaction).not.toHaveBeenCalled();
  });
});
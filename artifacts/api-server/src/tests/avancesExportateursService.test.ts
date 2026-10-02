import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = { transaction: vi.fn() };
const enregistrerMouvement = vi.fn();
const proposerEcrituresDansTransaction = vi.fn();

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({
    _: { name },
    id: {},
    cooperativeId: {},
    exportateurId: {},
    numeroCheque: {},
    montantFcfa: {},
    statut: {},
    venteExportateurId: {},
    avanceExportateurId: {},
    dateVente: {},
    poidsKg: {},
    montantTotalFcfa: {},
    montantRecuFcfa: {},
    montantAvanceImputeeFcfa: {},
    soldeDuFcfa: {},
    dateEcheanceReglement: {},
    createdAt: {},
    createdBy: {},
    dateImputation: {},
    montantRestitueFcfa: {},
    dateRestitution: {},
    dateReception: {},
    dateEcheance: {},
    banque: {},
    dateDepot: {},
    dateEncaissement: {},
    dateRejet: {},
    motifRejet: {},
    dateAnnulation: {},
    motifAnnulation: {},
    compteBancaireId: {},
    mouvementBanqueId: {},
    nom: {},
  });

  return {
    db: mockDb,
    avancesExportateursTable: table("avances_exportateurs"),
    chequesRecusTable: table("cheques_recus"),
    exportateursTable: table("exportateurs"),
    imputationsAvancesExportateursTable: table("imputations_avances_exportateurs"),
    ventesExportateursTable: table("ventes_exportateurs"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gt: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("../services/banqueService.js", () => ({ enregistrerMouvement }));
vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcrituresDansTransaction,
}));

const {
  encaisserAvanceExportateur,
  imputerAvanceExportateur,
  restaurerImputationsAvanceExportateurDansTransaction,
} = await import("../services/avancesExportateursService.js");

function selectChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function immediateSelectChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(rows),
  };
}

function insertChain<T>(rows: T[]) {
  return {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

function updateChain<T>(rows: T[]) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

function lockedSelectChain<T>(rows: T[]) {
  return Object.assign(Promise.resolve(rows), {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
  });
}

describe("avances par chèque des exportateurs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("n'autorise pas l'imputation tant que le chèque n'est pas encaissé", async () => {
    const tx = {
      select: vi.fn().mockReturnValueOnce(selectChain([{
        id: 31,
        cooperativeId: 7,
        exportateurId: 6,
        montantFcfa: 100000,
        statut: "depose",
      }])),
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    await expect(imputerAvanceExportateur(31, 7, {
      venteExportateurId: 50,
      montantFcfa: 5000,
    }, 12)).rejects.toThrow("Seule une avance encaissée peut être imputée");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(proposerEcrituresDansTransaction).not.toHaveBeenCalled();
  });

  it("refuse une imputation supérieure au solde de la vente avant toute écriture", async () => {
    const avance = {
      id: 31,
      cooperativeId: 7,
      exportateurId: 6,
      montantFcfa: 100000,
      statut: "encaisse",
    };
    const vente = {
      id: 50,
      exportateurId: 6,
      dateVente: "2026-09-01",
      montantAvanceImputeeFcfa: 0,
      soldeDuFcfa: 4000,
      statut: "partiel",
      dateEcheanceReglement: null,
    };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([avance]))
        .mockReturnValueOnce(selectChain([{ id: 6 }]))
        .mockReturnValueOnce(selectChain([vente])),
      insert: vi.fn(),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    await expect(imputerAvanceExportateur(31, 7, {
      venteExportateurId: 50,
      montantFcfa: 5000,
    }, 12)).rejects.toThrow("Le montant dépasse le solde de la vente");
    expect(tx.insert).not.toHaveBeenCalled();
    expect(proposerEcrituresDansTransaction).not.toHaveBeenCalled();
  });

  it("impute une avance encaissée sur une vente du même exportateur dans une seule transaction", async () => {
    const avance = {
      id: 31,
      cooperativeId: 7,
      exportateurId: 6,
      montantFcfa: 100000,
      statut: "encaisse",
    };
    const vente = {
      id: 50,
      exportateurId: 6,
      dateVente: "2026-09-01",
      montantAvanceImputeeFcfa: 1000,
      soldeDuFcfa: 20000,
      statut: "partiel",
      dateEcheanceReglement: null,
    };
    const imputation = {
      id: 88,
      avanceExportateurId: 31,
      venteExportateurId: 50,
      montantFcfa: 5000,
      dateImputation: "2026-10-02",
    };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([avance]))
        .mockReturnValueOnce(selectChain([{ id: 6 }]))
        .mockReturnValueOnce(selectChain([vente]))
        .mockReturnValueOnce(immediateSelectChain([{ montantImputeFcfa: 15000 }])),
      insert: vi.fn().mockReturnValueOnce(insertChain([imputation])),
      update: vi.fn().mockReturnValueOnce(updateChain([{ id: 50 }])),
    };
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    const result = await imputerAvanceExportateur(31, 7, {
      venteExportateurId: 50,
      montantFcfa: 5000,
    }, 12);

    expect(result).toMatchObject({ id: 88, venteExportateurId: 50, dateVente: "2026-09-01" });
    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(tx.update.mock.results[0].value.set).toHaveBeenCalledWith(expect.objectContaining({
      montantAvanceImputeeFcfa: 6000,
      soldeDuFcfa: 15000,
      statut: "partiel",
    }));
    expect(proposerEcrituresDansTransaction).toHaveBeenCalledWith(
      tx,
      7,
      [expect.objectContaining({
        source: "avance_exportateur",
        compteDebit: "4191",
        compteCredit: "4111",
        montantFcfa: 5000,
      })],
    );
  });

  it("restitue le solde d'une imputation et contre-passe l'écriture comptable", async () => {
    const tx = {
      select: vi.fn().mockReturnValue(lockedSelectChain([{
        id: 88,
        avanceExportateurId: 31,
        montantFcfa: 5000,
        montantRestitueFcfa: 1000,
      }])),
      update: vi.fn().mockReturnValue(updateChain([{ id: 88 }])),
    };

    const montantRestitue = await restaurerImputationsAvanceExportateurDansTransaction(
      tx as never,
      7,
      6,
      50,
      "2026-10-02",
    );

    expect(montantRestitue).toBe(4000);
    expect(tx.update.mock.results[0]?.value.set).toHaveBeenCalledWith({
      montantRestitueFcfa: 5000,
      dateRestitution: "2026-10-02",
    });
    expect(proposerEcrituresDansTransaction).toHaveBeenCalledWith(
      tx,
      7,
      [expect.objectContaining({
        source: "avance_exportateur",
        sourceId: 31,
        compteDebit: "4111",
        compteCredit: "4191",
        montantFcfa: 4000,
        numeroPiece: "RIMPVX-88",
      })],
    );
  });

  it("ne restitue pas une imputation déjà rétablie", async () => {
    const tx = {
      select: vi.fn().mockReturnValue(lockedSelectChain([{
        id: 88,
        avanceExportateurId: 31,
        montantFcfa: 5000,
        montantRestitueFcfa: 5000,
      }])),
      update: vi.fn(),
    };

    const montantRestitue = await restaurerImputationsAvanceExportateurDansTransaction(
      tx as never,
      7,
      6,
      50,
      "2026-10-02",
    );

    expect(montantRestitue).toBe(0);
    expect(tx.update).not.toHaveBeenCalled();
    expect(proposerEcrituresDansTransaction).not.toHaveBeenCalled();
  });

  it("n'enregistre pas de mouvement bancaire si le chèque n'a pas été déposé", async () => {
    const tx = {
      select: vi.fn().mockReturnValueOnce(selectChain([{
        id: 31,
        cooperativeId: 7,
        statut: "a_deposer",
      }])),
      update: vi.fn(),
    };
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback(tx));

    await expect(encaisserAvanceExportateur(31, 7, { compteBancaireId: 3 }, 12))
      .rejects.toThrow("Le chèque d'avance doit être déposé avant son encaissement");
    expect(enregistrerMouvement).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});
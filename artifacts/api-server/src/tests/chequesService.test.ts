import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
};

const mouvement = { id: 801 };
const enregistrerMouvement = vi.fn();

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({
    _: { name },
    id: {},
    cooperativeId: {},
    statut: {},
  });
  return {
    db: mockDb,
    chequesEmisTable: table("cheques_emis"),
    comptesBancairesTable: table("comptes_bancaires"),
    paiementsTable: table("paiements"),
    livraisonsTable: table("livraisons"),
    membresTable: table("membres"),
    fournisseursTable: table("fournisseurs"),
  };
});

vi.mock("../services/banqueService.js", () => ({
  enregistrerMouvement,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

const { encaisserCheque, resolveBeneficiaireCheque } = await import("../services/chequesService.js");

function selectChain<T>(rows: T[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

function updateChain<T>(rows: T[] = []) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

const cheque = {
  id: 41,
  cooperativeId: 7,
  beneficiaire: "Kouassi",
  montantFcfa: 125000,
  numeroCheque: "CH-41",
  statut: "emis",
  paiementId: 63,
};

describe("encaissement d'un chèque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enregistrerMouvement.mockResolvedValue({ mouvement });
  });

  it("utilise le compte choisi et conserve toutes les écritures dans la transaction", async () => {
    const updatedCheque = {
      ...cheque,
      statut: "encaisse",
      compteBancaireId: 902,
      mouvementBanqueId: mouvement.id,
      dateEncaissement: "2026-08-28",
    };
    const tx = {
      select: vi.fn().mockReturnValue(selectChain([cheque])),
      update: vi.fn()
        .mockReturnValueOnce(updateChain([updatedCheque]))
        .mockReturnValueOnce(updateChain()),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));

    const result = await encaisserCheque(41, 7, {
      compteBancaireId: 902,
      dateEncaissement: "2026-08-28",
    }, 55);

    expect(mockDb.transaction).toHaveBeenCalledOnce();
    expect(tx.select).toHaveBeenCalledOnce();
    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    expect(enregistrerMouvement).toHaveBeenCalledWith(
      902,
      7,
      expect.objectContaining({
        motif: "paiement_cheque",
        montantFcfa: 125000,
        dateOperation: "2026-08-28",
        userId: 55,
      }),
      tx,
    );
    expect(tx.update).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      statut: "encaisse",
      compteBancaireId: 902,
      mouvementBanqueId: 801,
    });
  });

  it("propage une erreur du paiement afin que la transaction puisse tout annuler", async () => {
    const chequeUpdate = updateChain([{
      ...cheque,
      statut: "encaisse",
      compteBancaireId: 902,
      mouvementBanqueId: mouvement.id,
    }]);
    const paiementUpdate = updateChain();
    paiementUpdate.where.mockRejectedValueOnce(new Error("paiement indisponible"));
    const tx = {
      select: vi.fn().mockReturnValue(selectChain([cheque])),
      update: vi.fn()
        .mockReturnValueOnce(chequeUpdate)
        .mockReturnValueOnce(paiementUpdate),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));

    await expect(encaisserCheque(41, 7, { compteBancaireId: 902 }, 55))
      .rejects.toThrow("paiement indisponible");
    expect(enregistrerMouvement).toHaveBeenCalledWith(
      902,
      7,
      expect.anything(),
      tx,
    );
  });
});

describe("bénéficiaires des chèques émis", () => {
  it("conserve deux bénéficiaires distincts lorsque le numéro de chèque est identique", () => {
    const numeroCheque = "2849398";
    const rows = [
      {
        numeroCheque,
        beneficiaire: "PAI-139",
        nomMembre: null,
        prenomsMembre: null,
        nomFournisseur: "KOFFI",
        prenomsFournisseur: "Aya",
      },
      {
        numeroCheque,
        beneficiaire: "PAI-140",
        nomMembre: "TRAORE",
        prenomsMembre: "Abdoulaye",
        nomFournisseur: null,
        prenomsFournisseur: null,
      },
    ];

    expect(rows.map(resolveBeneficiaireCheque)).toEqual([
      "KOFFI Aya",
      "TRAORE Abdoulaye",
    ]);
  });
});
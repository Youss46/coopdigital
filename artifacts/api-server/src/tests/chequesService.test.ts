import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
};

const mouvement = { id: 801 };
const enregistrerMouvement = vi.fn();
const genererNumeroRecuDansTransaction = vi.fn();
const proposerEcrituresDansTransaction = vi.fn();

vi.mock("@workspace/db", () => {
  const table = (name: string) => ({
    _: { name },
    id: {},
    cooperativeId: {},
    statut: {},
    livraisonId: {},
    bonCarburantId: {},
    depenseVehiculeId: {},
    membreId: {},
    campagneId: {},
    libelle: {},
    montantFcfa: {},
    montantNetFcfa: {},
    montantRestant: {},
    modePaiement: {},
    referenceTransaction: {},
    paiementId: {},
    paiementLigneId: {},
    numeroCheque: {},
  });
  return {
    db: mockDb,
    chequesEmisTable: table("cheques_emis"),
    comptesBancairesTable: table("comptes_bancaires"),
    paiementsTable: table("paiements"),
    paiementLignesTable: table("paiement_lignes"),
    livraisonsTable: table("livraisons"),
    membresTable: table("membres"),
    fournisseursTable: table("fournisseurs"),
  };
});

vi.mock("../services/banqueService.js", () => ({
  enregistrerMouvement,
}));

vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcrituresDansTransaction,
}));

vi.mock("../services/recuService.js", () => ({
  genererNumeroRecuDansTransaction,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
}));

const {
  annulerCheque,
  encaisserCheque,
  rejeterCheque,
  resolveBeneficiaireCheque,
} = await import("../services/chequesService.js");

function selectChain<T>(rows: T[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(rows),
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

function insertChain<T>(rows: T[] = []) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  return chain;
}

function deleteChain() {
  return { where: vi.fn().mockResolvedValue([]) };
}

const cheque = {
  id: 41,
  cooperativeId: 7,
  beneficiaire: "Kouassi",
  montantFcfa: 125000,
  numeroCheque: "CH-41",
  statut: "emis",
  paiementId: 63,
  paiementLigneId: 71,
  livraisonId: null,
  membreId: 19,
};

const paiement = {
  id: 63,
  cooperativeId: 7,
  livraisonId: 91,
  bonCarburantId: null,
  depenseVehiculeId: null,
  membreId: 19,
  campagneId: 5,
  libelle: null,
  montantFcfa: 125000,
  modePaiement: "cheque",
  referenceTransaction: null,
  statut: "confirme",
};

const ligneCheque = {
  id: 71,
  modePaiement: "cheque",
  montantFcfa: 125000,
  numeroCheque: "CH-41",
  referenceTransaction: null,
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

describe("retour en attente du règlement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    genererNumeroRecuDansTransaction.mockResolvedValue("REC-2026-00001");
  });

  it("remet le règlement et la livraison en attente quand le chèque est rejeté", async () => {
    const chequeUpdate = updateChain([{ ...cheque, statut: "rejete" }]);
    const paiementUpdate = updateChain();
    const livraisonUpdate = updateChain();
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([cheque]))
        .mockReturnValueOnce(selectChain([paiement]))
        .mockReturnValueOnce(selectChain([ligneCheque]))
        .mockReturnValueOnce(selectChain([{ compteDetteProducteur: "401" }]))
        .mockReturnValueOnce(selectChain([{ montantNetFcfa: "125000", montantRestant: "0" }])),
      update: vi.fn()
        .mockReturnValueOnce(chequeUpdate)
        .mockReturnValueOnce(paiementUpdate)
        .mockReturnValueOnce(livraisonUpdate),
      delete: vi.fn().mockReturnValue(deleteChain()),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));

    await rejeterCheque(41, 7, {
      motifRejet: "Provision insuffisante",
      dateRejet: "2026-09-04",
    }, 55);

    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    expect(paiementUpdate.set).toHaveBeenCalledWith(expect.objectContaining({
      statut: "en_attente",
      dateValidation: null,
      validePar: null,
      motifRejet: "Chèque rejeté : Provision insuffisante",
      modePaiement: null,
      referenceTransaction: null,
    }));
    expect(tx.delete).not.toHaveBeenCalled();
    expect(livraisonUpdate.set).toHaveBeenCalledWith({
      statutPaiement: "EN_ATTENTE",
      montantRestant: "125000",
    });
  });

  it("remet le règlement et la livraison en attente quand le chèque est annulé", async () => {
    const chequeLie = { ...cheque, livraisonId: 91 };
    const chequeUpdate = updateChain([{ ...chequeLie, statut: "annule" }]);
    const paiementUpdate = updateChain();
    const livraisonUpdate = updateChain();
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([chequeLie]))
        .mockReturnValueOnce(selectChain([paiement]))
        .mockReturnValueOnce(selectChain([ligneCheque]))
        .mockReturnValueOnce(selectChain([{ compteDetteProducteur: "401" }]))
        .mockReturnValueOnce(selectChain([{ montantNetFcfa: "200000", montantRestant: "50000" }])),
      update: vi.fn()
        .mockReturnValueOnce(chequeUpdate)
        .mockReturnValueOnce(paiementUpdate)
        .mockReturnValueOnce(livraisonUpdate),
      delete: vi.fn().mockReturnValue(deleteChain()),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));

    await annulerCheque(41, 7, { motifAnnulation: "Chèque remplacé" });

    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    expect(paiementUpdate.set).toHaveBeenCalledWith(expect.objectContaining({
      statut: "en_attente",
      dateValidation: null,
      validePar: null,
      motifRejet: "Chèque annulé : Chèque remplacé",
      modePaiement: null,
      referenceTransaction: null,
    }));
    expect(tx.delete).not.toHaveBeenCalled();
    expect(livraisonUpdate.set).toHaveBeenCalledWith({
      statutPaiement: "PARTIEL",
      montantRestant: "175000",
    });
  });

  it("isole la part du chèque rejeté et conserve les autres moyens déjà réglés", async () => {
    const chequeLie = { ...cheque, montantFcfa: 200000, livraisonId: 91 };
    const paiementVentile = { ...paiement, montantFcfa: 300000, modePaiement: null };
    const lignes = [
      {
        id: 70,
        modePaiement: "especes",
        montantFcfa: 100000,
        numeroCheque: null,
        referenceTransaction: null,
      },
      {
        ...ligneCheque,
        montantFcfa: 200000,
      },
    ];
    const chequeUpdate = updateChain([{ ...chequeLie, statut: "rejete" }]);
    const paiementUpdate = updateChain();
    const livraisonUpdate = updateChain();
    const pendingInsert = insertChain();
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([chequeLie]))
        .mockReturnValueOnce(selectChain([paiementVentile]))
        .mockReturnValueOnce(selectChain(lignes))
        .mockReturnValueOnce(selectChain([{ compteDetteProducteur: "401" }]))
        .mockReturnValueOnce(selectChain([{ montantNetFcfa: "300000", montantRestant: "0" }])),
      update: vi.fn()
        .mockReturnValueOnce(chequeUpdate)
        .mockReturnValueOnce(paiementUpdate)
        .mockReturnValueOnce(livraisonUpdate),
      delete: vi.fn().mockReturnValue(deleteChain()),
      insert: vi.fn().mockReturnValue(pendingInsert),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));

    await rejeterCheque(41, 7, {
      motifRejet: "Provision insuffisante",
      dateRejet: "2026-09-04",
    }, 55);

    expect(tx.delete).toHaveBeenCalledOnce();
    expect(paiementUpdate.set).toHaveBeenCalledWith({ montantFcfa: 100000 });
    expect(pendingInsert.values).toHaveBeenCalledWith(expect.objectContaining({
      cooperativeId: 7,
      livraisonId: 91,
      montantFcfa: 200000,
      statut: "en_attente",
      numeroRecu: "REC-2026-00001",
    }));
    expect(proposerEcrituresDansTransaction).toHaveBeenCalledWith(
      tx,
      7,
      [expect.objectContaining({
        compteDebit: "521",
        compteCredit: "401",
        montantFcfa: 200000,
      })],
    );
    expect(livraisonUpdate.set).toHaveBeenCalledWith({
      statutPaiement: "PARTIEL",
      montantRestant: "200000",
    });
  });

  it("annule toute la transaction si le règlement ne peut pas être remis en attente", async () => {
    const chequeLie = { ...cheque, livraisonId: 91 };
    const chequeUpdate = updateChain([{ ...chequeLie, statut: "rejete" }]);
    const paiementUpdate = updateChain();
    paiementUpdate.where.mockRejectedValueOnce(new Error("règlement indisponible"));
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectChain([chequeLie]))
        .mockReturnValueOnce(selectChain([paiement]))
        .mockReturnValueOnce(selectChain([ligneCheque])),
      update: vi.fn()
        .mockReturnValueOnce(chequeUpdate)
        .mockReturnValueOnce(paiementUpdate),
      delete: vi.fn().mockReturnValue(deleteChain()),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => callback(tx));

    await expect(rejeterCheque(41, 7, { motifRejet: "Rejet banque" }, 55))
      .rejects.toThrow("règlement indisponible");
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
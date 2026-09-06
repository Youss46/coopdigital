import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = { transaction: vi.fn() };
const enregistrerMouvement = vi.fn();

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({ _: { name } }, {
    get: (target, property) => property === "_" ? target._ : {},
  });
  return {
    db: mockDb,
    reglementsCartesProducteursTable: table("reglements_cartes_producteurs"),
    comptesBancairesTable: table("comptes_bancaires"),
    paiementsTable: table("paiements"),
    membresTable: table("membres"),
    livraisonsTable: table("livraisons"),
  };
});

vi.mock("../services/banqueService.js", () => ({ enregistrerMouvement }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

const {
  payerReglementCarteProducteur,
  rejeterReglementCarteProducteur,
  annulerReglementCarteProducteur,
} = await import("../services/reglementsCartesProducteursService.js");

function selectChain<T>(rows: T[]) {
  return {
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

function updateChain<T>(rows: T[] = []) {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
}

const pending = {
  id: 12,
  cooperativeId: 7,
  paiementId: 42,
  livraisonId: 91,
  beneficiaire: "KOUASSI Aya",
  montantFcfa: 125000,
  statut: "en_attente",
};

describe("règlements carte producteur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enregistrerMouvement.mockResolvedValue({ mouvement: { id: 801 } });
  });

  it("débite le compte uniquement au marquage payé et réutilise la transaction", async () => {
    const cardUpdate = updateChain([{ ...pending, statut: "paye", mouvementBanqueId: 801 }]);
    const paymentUpdate = updateChain();
    const tx = {
      select: vi.fn().mockReturnValue(selectChain([pending])),
      update: vi.fn().mockReturnValueOnce(cardUpdate).mockReturnValueOnce(paymentUpdate),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (value: unknown) => unknown) => callback(tx));

    const result = await payerReglementCarteProducteur(12, 7, {
      compteBancaireId: 902,
      datePaiement: "2026-09-06",
    }, 55);

    expect(tx.select.mock.results[0].value.for).toHaveBeenCalledWith("update");
    expect(enregistrerMouvement).toHaveBeenCalledWith(
      902,
      7,
      expect.objectContaining({
        type: "debit",
        motif: "paiement_carte_producteur",
        montantFcfa: 125000,
        dateOperation: "2026-09-06",
        userId: 55,
      }),
      tx,
    );
    expect(result).toMatchObject({ statut: "paye", mouvementBanqueId: 801 });
    expect(paymentUpdate.set).toHaveBeenCalledWith({ statut: "effectue", dateValidation: expect.any(Date) });
  });

  it("refuse un second traitement sans appeler la banque", async () => {
    const tx = { select: vi.fn().mockReturnValue(selectChain([{ ...pending, statut: "paye" }])), update: vi.fn() };
    mockDb.transaction.mockImplementationOnce(async (callback: (value: unknown) => unknown) => callback(tx));

    await expect(payerReglementCarteProducteur(12, 7, { compteBancaireId: 902 }, 55))
      .rejects.toThrow("Seul un règlement carte producteur en attente");
    expect(enregistrerMouvement).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejette et annule sans débit bancaire, puis remet le paiement en attente", async () => {
    for (const operation of [
      { run: () => rejeterReglementCarteProducteur(12, 7, "Carte invalide"), status: "rejete", expected: "Carte producteur rejetée : Carte invalide" },
      { run: () => annulerReglementCarteProducteur(12, 7, "Paiement remplacé"), status: "annule", expected: "Carte producteur annulée : Paiement remplacé" },
    ]) {
      const cardUpdate = updateChain([{ ...pending, statut: operation.status }]);
      const paymentUpdate = updateChain();
      const deliveryUpdate = updateChain();
      const tx = {
        select: vi.fn().mockReturnValue(selectChain([pending])),
        update: vi.fn().mockReturnValueOnce(cardUpdate).mockReturnValueOnce(paymentUpdate).mockReturnValueOnce(deliveryUpdate),
      };
      mockDb.transaction.mockImplementationOnce(async (callback: (value: unknown) => unknown) => callback(tx));

      await operation.run();
      expect(paymentUpdate.set).toHaveBeenCalledWith(expect.objectContaining({
        statut: "en_attente",
        dateValidation: null,
        motifRejet: operation.expected,
      }));
    }
    expect(enregistrerMouvement).not.toHaveBeenCalled();
  });
});
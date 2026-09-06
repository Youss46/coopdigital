import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}));
const proposerEcriture = vi.hoisted(() => vi.fn());
const proposerEcrituresDansTransaction = vi.hoisted(() => vi.fn());
const getTauxPpsi = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => {
  const makeTable = (name: string) => new Proxy({ _: { name } }, {
    get: (target, property: string | symbol) => property in target
      ? target[property as keyof typeof target]
      : `${name}.${String(property)}`,
  });
  return {
    db: mockDb,
    chargesDiversesTable: makeTable("charges_diverses"),
    caissesTable: makeTable("caisses"),
    sessionsCaisseTable: makeTable("sessions_caisse"),
    mouvementsCaisseTable: makeTable("mouvements_caisse"),
    comptesBancairesTable: makeTable("comptes_bancaires"),
    mouvementsBanqueTable: makeTable("mouvements_banque"),
    comptesMobilesMarchandsTable: makeTable("comptes_mobiles_marchands"),
    mouvementsMobileMarchandTable: makeTable("mouvements_mobile_marchand"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  gte: vi.fn(() => ({})),
  lte: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("../services/fiscaliteService.js", () => ({ getTauxPpsi }));
vi.mock("../services/comptabiliteService.js", () => ({ proposerEcriture, proposerEcrituresDansTransaction }));

const chargesDiversesService = await import("../services/chargesDiversesService.js");
const { validerChargeDiverses, reglerChargeFournisseur } = chargesDiversesService;
const {
  erreurStructureCharge,
  handleValiderChargeDiverses,
} = await import("../controllers/chargesDiversesController.js");

function chain<T>(rows: T[]) {
  const value: Record<string, unknown> = {};
  for (const method of ["from", "where", "for"]) {
    value[method] = vi.fn(() => value);
  }
  value.limit = vi.fn().mockResolvedValue(rows);
  return value;
}

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function request() {
  return {
    params: { id: "17" },
    user: { cooperativeId: 42, id: 7 },
    log: { error: vi.fn() },
  } as unknown as Request;
}

function creditCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: 17,
    cooperativeId: 42,
    dateCharge: "2026-09-05",
    libelle: "Achat de fournitures",
    description: null,
    montantFcfa: "50000",
    ppsiTauxPct: null,
    retenuePpsiFcfa: 0,
    montantNetFcfa: null,
    categorie: "autre",
    compteDebit: "604",
    compteCredit: "401",
    modePaiement: "credit",
    tiers: "Fournisseur Kouassi",
    referencePiece: "FACT-17",
    compteTresorerieId: null,
    compteTresorerieType: null,
    statut: "brouillon",
    createdBy: 7,
    approvedBy: null,
    approvedAt: null,
    montantRegleFcfa: 0,
    dateReglement: null,
    reglePar: null,
    compteReglementId: null,
    compteReglementType: null,
    referenceReglement: null,
    createdAt: new Date("2026-09-05T00:00:00Z"),
    updatedAt: new Date("2026-09-05T00:00:00Z"),
    ...overrides,
  };
}

describe("charges diverses à crédit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTauxPpsi.mockResolvedValue(2);
  });

  it("accepte une charge à crédit avec fournisseur, compte 401 et sans trésorerie", () => {
    expect(erreurStructureCharge("credit", "401", "Fournisseur Kouassi", null, null)).toBeNull();
  });

  it("rejette une charge à crédit sans fournisseur ou liée à une trésorerie", () => {
    expect(erreurStructureCharge("credit", "401", " ", null, null)).toMatch(/fournisseur/i);
    expect(erreurStructureCharge("credit", "401", "Fournisseur Kouassi", 3, "caisse")).toMatch(/trésorerie/i);
  });

  it("rejette une charge à crédit avec un compte autre que 401", () => {
    expect(erreurStructureCharge("credit", "571", "Fournisseur Kouassi", null, null)).toMatch(/401/);
  });

  it("valide une charge à crédit sans créer de mouvement de trésorerie", async () => {
    const charge = creditCharge();
    const tx = {
      select: vi.fn(() => chain([{ id: charge.id }])),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ ...charge, statut: "valide" }]),
          })),
        })),
      })),
      insert: vi.fn(),
    };
    mockDb.select.mockReturnValue(chain([charge]));
    mockDb.transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await validerChargeDiverses(42, charge.id, 7);

    expect(result).toEqual(expect.objectContaining({ statut: "valide" }));
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("refuse la validation d'une charge à crédit associée à une trésorerie", async () => {
    const charge = creditCharge({ compteTresorerieId: 3, compteTresorerieType: "caisse" });
    mockDb.select.mockReturnValue(chain([charge]));

    await expect(validerChargeDiverses(42, charge.id, 7)).rejects.toThrow(/fournisseur.*trésorerie/i);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("produit uniquement l'écriture charge / 401 pour une charge PPSI à crédit", async () => {
    const row = creditCharge({ categorie: "ppsi", compteDebit: "632" });
    vi.spyOn(chargesDiversesService, "validerChargeDiverses").mockResolvedValueOnce(row as never);
    const res = response();

    await handleValiderChargeDiverses(request(), res);

    expect(proposerEcriture).toHaveBeenCalledTimes(1);
    expect(proposerEcriture).toHaveBeenCalledWith(42, expect.objectContaining({
      compteDebit: "632",
      compteCredit: "401",
      montantFcfa: 50000,
    }));
  });

  it("règle la dette 401 et refuse un second règlement", async () => {
    const charge = creditCharge({
      statut: "valide",
      compteCredit: "401000",
      montantRegleFcfa: 0,
    });
    const caisse = {
      id: 3,
      cooperativeId: 42,
      nom: "Caisse centrale",
      actif: true,
      soldeActuelFcfa: "100000",
    };
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(chain([charge]))
        .mockReturnValueOnce(chain([caisse]))
        .mockReturnValueOnce(chain([{ id: 9 }])),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue([]) })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ ...charge, statut: "reglee", montantRegleFcfa: 50000 }]),
          })),
        })),
      })),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await reglerChargeFournisseur(42, charge.id, 7, {
      dateReglement: "2026-09-06",
      compteTresorerieId: 3,
      compteTresorerieType: "caisse",
    });

    expect(result).toEqual(expect.objectContaining({ statut: "reglee" }));
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(proposerEcrituresDansTransaction).toHaveBeenCalledWith(expect.anything(), 42, [
      expect.objectContaining({ compteDebit: "401000", compteCredit: "571000", montantFcfa: 50000 }),
    ]);

    const secondTx = {
      select: vi.fn(() => chain([])),
    };
    mockDb.transaction.mockImplementationOnce(async (callback: (value: typeof secondTx) => Promise<unknown>) => callback(secondTx));
    await expect(reglerChargeFournisseur(42, charge.id, 8, {
      dateReglement: "2026-09-06",
      compteTresorerieId: 3,
      compteTresorerieType: "caisse",
    })).resolves.toBeNull();
    expect(secondTx.select).toHaveBeenCalledTimes(1);
  });
});
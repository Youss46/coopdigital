import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const makeTable = (name: string) => new Proxy({ _: { name } }, {
    get: (target, property: string | symbol) => property in target
      ? target[property as keyof typeof target]
      : `${name}.${String(property)}`,
  });
  return {
    db: mockDb,
    avancesTable: makeTable("avances"),
    membresTable: makeTable("membres"),
    campagnesTable: makeTable("campagnes"),
    remboursementsAvancesMembresTable: makeTable("remboursements_avances_membres"),
    usersTable: makeTable("users"),
    caissesTable: makeTable("caisses"),
    sessionsCaisseTable: makeTable("sessions_caisse"),
    mouvementsCaisseTable: makeTable("mouvements_caisse"),
    comptesMobilesMarchandsTable: makeTable("comptes_mobiles_marchands"),
    mouvementsMobileMarchandTable: makeTable("mouvements_mobile_marchand"),
    comptesBancairesTable: makeTable("comptes_bancaires"),
    mouvementsBanqueTable: makeTable("mouvements_banque"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  asc: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  lt: vi.fn(() => ({})),
  ne: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("drizzle-orm/pg-core", () => ({
  alias: vi.fn((table: unknown) => table),
}));

vi.mock("@workspace/api-zod", () => ({
  CreateAvanceBody: { safeParse: vi.fn() },
  RembourserAvanceBody: {
    safeParse: vi.fn((body: unknown) => ({ success: true, data: body })),
  },
}));

vi.mock("../services/anomalieService.js", () => ({
  checkAvance: vi.fn(),
  creerAnomalies: vi.fn(),
}));
vi.mock("../services/comptabiliteService.js", () => ({
  generateEcrituresAvance: vi.fn(),
}));
vi.mock("../lib/campagneGuard.js", () => ({
  CampagneFermeeError: class CampagneFermeeError extends Error {},
  assertCampagneActiveExiste: vi.fn(),
}));

const { rembourserAvance } = await import("../controllers/avancesController.js");

function chain<T>(rows: T[]) {
  const value: Record<string, unknown> = {};
  for (const method of ["from", "leftJoin", "where", "orderBy", "for"]) {
    value[method] = vi.fn(() => value);
  }
  value.limit = vi.fn().mockResolvedValue(rows);
  return value;
}

function response() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    locals: {},
  } as unknown as Response;
}

function request() {
  return {
    params: { id: "5" },
    body: { montantFcfa: 3_000, note: "Remboursement au comptoir" },
    user: { cooperativeId: 42, id: 7 },
    log: { error: vi.fn() },
    locals: {},
  } as unknown as Request;
}

function configureTransaction(options: { soldeRestant: number; caisseSolde: string; session: unknown[] }) {
  const avanceFraiche = {
    id: 5,
    membreId: 9,
    montantRembourse_fcfa: 10_000 - options.soldeRestant,
    soldeRestantFcfa: options.soldeRestant,
    statut: "en_cours",
  };
  const caisse = { id: 3, soldeActuelFcfa: options.caisseSolde };
  const txSelect = vi.fn()
    .mockReturnValueOnce(chain([avanceFraiche]))
    .mockReturnValueOnce(chain([caisse]))
    .mockReturnValueOnce(chain(options.session));
  const historyValues = vi.fn();
  const historyReturning = vi.fn().mockResolvedValue([{ id: 77 }]);
  historyValues.mockReturnValue({ returning: historyReturning });
  const movementValues = vi.fn().mockResolvedValue(undefined);
  const txInsert = vi.fn()
    .mockReturnValueOnce({ values: historyValues })
    .mockReturnValueOnce({ values: movementValues });
  const avanceUpdateValues = vi.fn();
  const avanceUpdateWhere = vi.fn();
  const avanceUpdateReturning = vi.fn().mockResolvedValue([{
    ...avanceFraiche,
    montantRembourse_fcfa: avanceFraiche.montantRembourse_fcfa + 3_000,
    soldeRestantFcfa: options.soldeRestant - 3_000,
    statut: options.soldeRestant === 3_000 ? "rembourse" : "en_cours",
  }]);
  avanceUpdateWhere.mockReturnValue({ returning: avanceUpdateReturning });
  avanceUpdateValues.mockReturnValue({ where: avanceUpdateWhere });
  const caisseUpdateValues = vi.fn();
  const caisseUpdateWhere = vi.fn().mockResolvedValue(undefined);
  caisseUpdateValues.mockReturnValue({ where: caisseUpdateWhere });
  const txUpdate = vi.fn()
    .mockReturnValueOnce({ set: avanceUpdateValues })
    .mockReturnValueOnce({ set: caisseUpdateValues });
  const tx = { execute: vi.fn().mockResolvedValue(undefined), select: txSelect, insert: txInsert, update: txUpdate };

  mockDb.transaction.mockImplementation(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx));
  return { tx, historyValues, movementValues, caisseUpdateValues };
}

function configureOuterAdvance() {
  mockDb.select.mockReturnValue(chain([{
    avance: {
      id: 5,
      membreId: 9,
      montantRembourse_fcfa: 0,
      soldeRestantFcfa: 10_000,
      statut: "en_cours",
    },
    membreCoopId: 42,
    categorieMembre: null,
  }]));
}

describe("rembourserAvance — mouvement de caisse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("crédite la caisse et crée le mouvement pour un remboursement partiel", async () => {
    configureOuterAdvance();
    const { historyValues, movementValues, caisseUpdateValues } = configureTransaction({
      soldeRestant: 10_000,
      caisseSolde: "25000",
      session: [{ id: 8 }],
    });
    const res = response();

    await rembourserAvance(request(), res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(historyValues).toHaveBeenCalledWith(expect.objectContaining({
      avanceId: 5,
      montantFcfa: 3_000,
    }));
    expect(movementValues).toHaveBeenCalledWith(expect.objectContaining({
      caisseId: 3,
      sessionId: 8,
      cooperativeId: 42,
      type: "entree",
      motif: "remboursement",
      montantFcfa: "3000",
      soldeApresFcfa: "28000",
      referenceOperation: "AVA-5-RMB-77",
    }));
    expect(caisseUpdateValues).toHaveBeenCalledWith({ soldeActuelFcfa: "28000" });
  });

  it("crédite le montant exact restant pour un remboursement total", async () => {
    configureOuterAdvance();
    const { movementValues, caisseUpdateValues } = configureTransaction({
      soldeRestant: 3_000,
      caisseSolde: "25000",
      session: [{ id: 8 }],
    });
    const res = response();

    await rembourserAvance(request(), res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(movementValues).toHaveBeenCalledWith(expect.objectContaining({
      montantFcfa: "3000",
      soldeApresFcfa: "28000",
    }));
    expect(caisseUpdateValues).toHaveBeenCalledWith({ soldeActuelFcfa: "28000" });
  });

  it("n’enregistre aucune partie du remboursement sans session de caisse ouverte", async () => {
    configureOuterAdvance();
    const { tx } = configureTransaction({
      soldeRestant: 10_000,
      caisseSolde: "25000",
      session: [],
    });
    const res = response();

    await rembourserAvance(request(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      erreur: "Aucune session de caisse ouverte pour la caisse centrale.",
    });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});
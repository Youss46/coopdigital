import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mockDb = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({ _: { name } }, {
    get: (target, key: string | symbol) => key in target ? target[key as keyof typeof target] : `${name}.${String(key)}`,
  });
  return {
    db: mockDb,
    avancesTable: table("avances"),
    membresTable: table("membres"),
    remboursementsAvancesMembresTable: table("remboursements_avances_membres"),
    usersTable: table("users"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
}));
vi.mock("drizzle-orm/pg-core", () => ({ alias: vi.fn((value: unknown) => value) }));
vi.mock("../services/anomalieService.js", () => ({ checkAvance: vi.fn(), creerAnomalies: vi.fn() }));
vi.mock("../services/comptabiliteService.js", () => ({ generateEcrituresAvance: vi.fn() }));
vi.mock("../lib/campagneGuard.js", () => ({
  CampagneFermeeError: class CampagneFermeeError extends Error {},
  assertCampagneActiveExiste: vi.fn(),
}));
vi.mock("@workspace/api-zod", () => ({
  CreateAvanceBody: { safeParse: vi.fn() },
  RembourserAvanceBody: { safeParse: vi.fn() },
}));

const { annulerAvance, cloturerSoldeAvance } = await import("../controllers/avancesController.js");

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn(), locals: {} } as unknown as Response;
}

function request(body: unknown = { raison: "Décision du comité" }) {
  return {
    params: { id: "12" },
    body,
    path: "/avances/12/annuler",
    user: { id: 9, cooperativeId: 42 },
    log: { error: vi.fn() },
  } as unknown as Request;
}

function queryChain<T>(rows: T[]) {
  const chain: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "for"]) chain[method] = vi.fn(() => chain);
  chain.limit = vi.fn().mockResolvedValue(rows);
  return chain;
}

function setup(avance: Record<string, unknown>, repayments: unknown[] = []) {
  const advanceSelect = queryChain([{ avance, categorie: null }]);
  const historySelect = queryChain(repayments);
  const set = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([{ ...avance, soldeRestantFcfa: 0 }]) }),
  });
  const tx = {
    select: vi.fn()
      .mockReturnValueOnce(advanceSelect)
      .mockReturnValueOnce(historySelect),
    update: vi.fn().mockReturnValue({ set }),
  };
  mockDb.transaction.mockImplementation(async (callback: (value: any) => unknown) => callback(tx));
  return { set };
}

const untouched = () => ({
  id: 12, membreId: 4, montantRembourse_fcfa: 0, soldeRestantFcfa: 10_000, statut: "en_cours",
});

describe("terminaison des avances membres", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse un motif absent", async () => {
    const res = response();
    await annulerAvance(request({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("annule une avance intacte en conservant le montant initial", async () => {
    const avance = untouched();
    const { set } = setup(avance);
    const res = response();
    await annulerAvance(request(), res);
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      statut: "annulee", soldeRestantFcfa: 0, montantAbandonneFcfa: 10_000,
    }));
    expect(res.json).toHaveBeenCalled();
  });

  it("clôture le solde d'une avance partiellement remboursée", async () => {
    const avance = { ...untouched(), montantRembourse_fcfa: 4_000, soldeRestantFcfa: 6_000 };
    const { set } = setup(avance);
    await cloturerSoldeAvance(request({ raison: "Solde irrécouvrable" }), response());
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      statut: "cloturee", soldeRestantFcfa: 0, montantAbandonneFcfa: 6_000,
    }));
  });

  it("refuse la mauvaise action et protège les avances terminales", async () => {
    setup(untouched());
    const wrongAction = response();
    await cloturerSoldeAvance(request(), wrongAction);
    expect(wrongAction.status).toHaveBeenCalledWith(400);
    expect(wrongAction.json).toHaveBeenCalledWith(expect.objectContaining({ erreur: expect.stringContaining("partiellement") }));

    const remboursement = { id: 1 };
    setup(untouched(), [remboursement]);
    const res = response();
    await annulerAvance(request(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ erreur: expect.stringContaining("remboursement") }));

    setup({ ...untouched(), statut: "cloturee" });
    const terminal = response();
    await cloturerSoldeAvance(request(), terminal);
    expect(terminal.status).toHaveBeenCalledWith(400);
    expect(terminal.json).toHaveBeenCalledWith(expect.objectContaining({ erreur: expect.stringContaining("terminée") }));
  });
});
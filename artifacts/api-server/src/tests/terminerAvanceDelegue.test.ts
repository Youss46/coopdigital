import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mockDb = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@workspace/db", () => {
  const table = (name: string) => new Proxy({ _: { name } }, {
    get: (target, key: string | symbol) => key in target ? target[key as keyof typeof target] : `${name}.${String(key)}`,
  });
  return {
    db: mockDb,
    avancesDeleguesTable: table("avances_delegues"),
    remboursementsAvancesDeleguesTable: table("remboursements_avances_delegues"),
    usersTable: table("users"),
    caissesTable: table("caisses"),
  };
});

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})), eq: vi.fn(() => ({})), desc: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})), ne: vi.fn(() => ({})), isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})), lt: vi.fn(() => ({})),
}));
vi.mock("../services/caisseService.js", () => ({ enregistrerMouvement: vi.fn() }));
vi.mock("../lib/logger.js", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const { annulerAvanceDelegueHandler, cloturerSoldeAvanceDelegueHandler } =
  await import("../controllers/avancesDeleguesController.js");

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn(), locals: {} } as unknown as Response;
}
function request(body: unknown = { motif: "Décision du comité" }, agentId = "7") {
  return {
    params: { agentId, avanceId: "12" }, body,
    path: "/delegues/7/avances/12/annuler",
    user: { id: 9, cooperativeId: 42 },
    log: { error: vi.fn() },
  } as unknown as Request;
}
function chain<T>(rows: T[]) {
  const value: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "for"]) value[method] = vi.fn(() => value);
  value.limit = vi.fn().mockResolvedValue(rows);
  return value;
}
function setup(avance: Record<string, unknown> | null, history: unknown[] = []) {
  const rowSelect = chain(avance ? [{ avance }] : []);
  const historySelect = chain(history);
  const set = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue(avance ? [{ ...avance, soldeRestantFcfa: 0 }] : []),
    }),
  });
  const tx = {
    select: vi.fn().mockReturnValueOnce(rowSelect).mockReturnValueOnce(historySelect),
    update: vi.fn().mockReturnValue({ set }),
  };
  mockDb.transaction.mockImplementation(async (callback: (value: unknown) => unknown) => callback(tx));
  return { set };
}
const untouched = () => ({
  id: 12, delegueId: 7, montantRembourse: 0, soldeRestantFcfa: 10_000, statut: "en_cours",
});

describe("terminaison des avances délégués", () => {
  beforeEach(() => vi.clearAllMocks());

  it("refuse un motif absent", async () => {
    const res = response();
    await annulerAvanceDelegueHandler(request({}), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("annule une avance intacte", async () => {
    const { set } = setup(untouched());
    await annulerAvanceDelegueHandler(request(), response());
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      statut: "annulee", soldeRestantFcfa: 0, montantAbandonneFcfa: 10_000,
    }));
  });

  it("clôture seulement le solde d'une avance partiellement remboursée", async () => {
    const { set } = setup({ ...untouched(), montantRembourse: 4_000, soldeRestantFcfa: 6_000 });
    await cloturerSoldeAvanceDelegueHandler(request(), response());
    expect(set).toHaveBeenCalledWith(expect.objectContaining({
      statut: "cloturee", soldeRestantFcfa: 0, montantAbandonneFcfa: 6_000,
    }));
  });

  it("refuse la mauvaise action", async () => {
    setup(untouched());
    const res = response();
    await cloturerSoldeAvanceDelegueHandler(request(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ erreur: expect.stringContaining("partiellement") }));
  });

  it("protège le tenant et l'agentId du chemin", async () => {
    setup(null);
    const res = response();
    await annulerAvanceDelegueHandler(request({ motif: "Test ownership" }, "999"), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ erreur: "Avance introuvable" });
  });

  it("refuse une annulation avec historique de remboursement", async () => {
    setup(untouched(), [{ id: 1 }]);
    const res = response();
    await annulerAvanceDelegueHandler(request(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ erreur: expect.stringContaining("remboursement") }));
  });

  it("refuse les avances déjà terminales", async () => {
    setup({ ...untouched(), statut: "cloturee" });
    const res = response();
    await cloturerSoldeAvanceDelegueHandler(request(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ erreur: expect.stringContaining("terminée") }));
  });
});
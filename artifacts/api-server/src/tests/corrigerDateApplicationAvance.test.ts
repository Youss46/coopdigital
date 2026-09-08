import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

const mockDb = vi.hoisted(() => ({
  transaction: vi.fn(),
}));

vi.mock("@workspace/db", () => {
  const makeTable = (name: string) => {
    return new Proxy({ _: { name } }, {
      get: (target, property: string | symbol) => property in target
        ? target[property as keyof typeof target]
        : `${name}.${String(property)}`,
    });
  };

  return {
    db: mockDb,
    avancesTable: makeTable("avances"),
    membresTable: makeTable("membres"),
    livraisonsTable: makeTable("livraisons"),
    paiementsTable: makeTable("paiements"),
    campagnesTable: makeTable("campagnes"),
    remboursementsAvancesMembresTable: makeTable("remboursements_avances_membres"),
    sessionsPeseeTable: makeTable("sessions_pesee"),
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
  RembourserAvanceBody: { safeParse: vi.fn() },
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

const { corrigerDateApplicationAvance } = await import(
  "../controllers/avancesController.js"
);

type SelectChain = {
  from: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  for: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
};

function selectChain(rows: unknown[], terminal: "limit" | "for"): SelectChain {
  const chain = {} as SelectChain;
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy"] as const) {
    chain[method] = vi.fn(() => chain);
  }
  if (terminal === "limit") {
    chain.for = vi.fn(() => chain);
    chain.limit = vi.fn().mockResolvedValue(rows);
  } else {
    chain.for = vi.fn().mockResolvedValue(rows);
    chain.limit = vi.fn(() => chain);
  }
  return chain;
}

function makeResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
}

function makeRequest() {
  return {
    params: { id: "5" },
    body: {
      date_application: "2026-09-01",
      motif: "Correction après contrôle de la date",
    },
    user: { cooperativeId: 42, id: 7 },
    log: { error: vi.fn() },
  } as unknown as Request;
}

function configureTransaction(paymentStatut: "rejete" | "confirme" | "effectue") {
  const avance = {
    id: 5,
    membreId: 9,
    montantOctroyeFcfa: 10_000,
    montantRembourse_fcfa: 4_000,
    soldeRestantFcfa: 6_000,
    statut: "en_cours",
  };
  const historique = {
    id: 31,
    avanceId: 5,
    livraisonId: 21,
    montantFcfa: 4_000,
    note: null,
  };
  const livraison = {
    id: 21,
    cooperativeId: 42,
    dateLivraison: "2026-08-01",
    avanceDeduiteFcfa: 4_000,
    montantNetFcfa: 6_000,
    montantRestant: "6_000",
  };
  const paiement = {
    id: 41,
    livraisonId: 21,
    montantFcfa: 2_000,
    statut: paymentStatut,
    motifRejet: paymentStatut === "rejete" ? "Provision insuffisante" : null,
  };
  const updatedAvance = {
    ...avance,
    montantRembourse_fcfa: 0,
    soldeRestantFcfa: 10_000,
    planType: "reporte",
    reportDate: "2026-09-01",
  };

  const select = vi.fn()
    .mockReturnValueOnce(selectChain([{ avance, cooperativeId: 42 }], "limit"))
    .mockReturnValueOnce(selectChain([historique], "for"))
    .mockReturnValueOnce(selectChain([livraison], "limit"))
    .mockReturnValueOnce(selectChain([paiement], "for"))
    .mockReturnValueOnce(selectChain([livraison], "limit"))
    .mockReturnValueOnce(selectChain([paiement], "for"));

  const updates: Array<{ tableName: string; values: Record<string, unknown> }> = [];
  const update = vi.fn((table: object) => {
    const set = vi.fn((values: Record<string, unknown>) => {
      updates.push({
        tableName: String((table as { _: { name: string } })._.name),
        values,
      });
      const where = vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([updatedAvance]),
      }));
      return { where };
    });
    return { set };
  });

  const tx = { select, update };
  mockDb.transaction.mockImplementationOnce(async (callback: (value: typeof tx) => Promise<unknown>) => (
    callback(tx)
  ));

  return { updates, paiement, updatedAvance };
}

describe("corrigerDateApplicationAvance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restaure la retenue, remet un rejet en attente et conserve son motif dans l'historique", async () => {
    const { updates, paiement, updatedAvance } = configureTransaction("rejete");
    const res = makeResponse();

    await corrigerDateApplicationAvance(makeRequest(), res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      montantRestaure: 4_000,
      reglementsRecalcules: 1,
      avance: updatedAvance,
    }));

    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tableName: "remboursements_avances_membres",
        values: expect.objectContaining({
          montantFcfa: 0,
          note: expect.stringContaining("Déduction annulée"),
        }),
      }),
      expect.objectContaining({
        tableName: "paiements",
        values: {
          montantFcfa: 6_000,
          statut: "en_attente",
          motifRejet: null,
          dateValidation: null,
          validePar: null,
        },
      }),
    ]));

    const historiqueUpdate = updates.find(
      ({ tableName }) => tableName === "remboursements_avances_membres",
    );
    expect(historiqueUpdate?.values.note).toEqual(expect.stringContaining("Provision insuffisante"));
    expect(paiement.motifRejet).toBe("Provision insuffisante");
  });

  it.each(["confirme", "effectue"] as const)(
    "bloque la correction lorsqu'un règlement est %s",
    async (paymentStatut) => {
      const { updates } = configureTransaction(paymentStatut);
      const res = makeResponse();

      await corrigerDateApplicationAvance(makeRequest(), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        erreur: "La livraison du 2026-08-01 est déjà payée. Utilisez une régularisation comptable.",
      });
      expect(updates).toHaveLength(0);
    },
  );
});
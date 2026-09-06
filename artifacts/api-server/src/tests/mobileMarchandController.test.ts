import { Request, Response } from "express";
import pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
}));

const tables = vi.hoisted(() => ({
  comptesMobilesMarchandsTable: {
    id: {},
    cooperativeId: {},
    soldeActuelFcfa: {},
  },
  mouvementsMobileMarchandTable: {
    id: {},
    compteId: {},
    cooperativeId: {},
    type: {},
    motif: {},
    montantFcfa: {},
    libelle: {},
    reference: {},
    dateOperation: {},
    soldeApresFcfa: {},
    enregistrePar: {},
    createdAt: {},
  },
  comptesBancairesTable: {
    id: {},
    cooperativeId: {},
  },
  mouvementsBanqueTable: {
    id: {},
  },
  caissesTable: {
    id: {},
    cooperativeId: {},
  },
  mouvementsCaisseTable: {
    id: {},
  },
  sessionsCaisseTable: {
    id: {},
  },
  usersTable: {
    id: {},
    nom: {},
  },
}));

vi.mock("@workspace/db", () => ({
  db: mockDb,
  ...tables,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcriture: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const {
  getJournal,
  postVirementBanque,
  postVirementCaisse,
} = await import("../controllers/mobileMarchandController.js");

type JournalRow = {
  id: number;
  type: "credit" | "debit";
  motif: string;
  montantFcfa: string;
  libelle: string | null;
  reference: string | null;
  dateOperation: string;
  soldeApresFcfa: string;
  enregistrePar: number | null;
  enregistreParNom: string | null;
  createdAt: Date;
};

function journalChain(rows: JournalRow[]) {
  const chain = {
    from: vi.fn(),
    leftJoin: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockResolvedValue(rows);

  return chain;
}

function makeRequest(): Request {
  const request = Object.create(null) as Request;
  request.user = { id: 77, role: "comptable", cooperativeId: 12 };
  request.params = { id: "9" };
  request.body = {};
  request.log = pino({ enabled: false });
  return request;
}

function makeResponse() {
  const response = Object.create(null) as Response;
  response.status = vi.fn(() => response);
  response.json = vi.fn();
  return response;
}

function selectChain<T>(rows: T[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  return chain;
}

function updateChain() {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockResolvedValue([]);
  return chain;
}

function insertChain(rows: unknown[]) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);
  return chain;
}

function setupTransaction() {
  const tx = {
    insert: vi.fn((table: unknown) => {
      if (table === tables.mouvementsMobileMarchandTable) {
        return insertChain([{ id: 901 }]);
      }
      if (table === tables.mouvementsBanqueTable) {
        return insertChain([{ id: 902 }]);
      }
      return insertChain([{ id: 903 }]);
    }),
    update: vi.fn(() => updateChain()),
  };
  mockDb.transaction.mockImplementationOnce(async (callback: (value: typeof tx) => unknown) => callback(tx));
  return tx;
}

function mobileMovementValues(tx: ReturnType<typeof setupTransaction>) {
  const movementCall = tx.insert.mock.calls.find(([table]) =>
    table === tables.mouvementsMobileMarchandTable,
  );
  expect(movementCall).toBeDefined();
  const chain = tx.insert.mock.results[
    tx.insert.mock.calls.indexOf(movementCall!)
  ]?.value as { values: ReturnType<typeof vi.fn> };
  return chain.values;
}

function setupBankTransfer() {
  mockDb.select
    .mockReturnValueOnce(selectChain([{
      id: 9,
      nom: "Compte Wave",
      soldeActuelFcfa: "100000",
    }]))
    .mockReturnValueOnce(selectChain([{
      id: 21,
      nom: "Banque coopérative",
      soldeActuelFcfa: "200000",
    }]));
  return setupTransaction();
}

function setupCashTransfer() {
  mockDb.select
    .mockReturnValueOnce(selectChain([{
      id: 9,
      nom: "Compte Wave",
      soldeActuelFcfa: "100000",
    }]))
    .mockReturnValueOnce(selectChain([{
      id: 31,
      nom: "Caisse principale",
      soldeActuelFcfa: "200000",
    }]));
  mockDb.execute.mockResolvedValueOnce({
    rows: [{ id: 41, statut: "ouverte" }],
  });
  return setupTransaction();
}

function makeRow(overrides: Partial<JournalRow> = {}): JournalRow {
  return {
    id: 41,
    type: "credit",
    motif: "approvisionnement",
    montantFcfa: "25000",
    libelle: "Dépôt",
    reference: "DEP-41",
    dateOperation: "2026-09-01",
    soldeApresFcfa: "125000",
    enregistrePar: null,
    enregistreParNom: null,
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    ...overrides,
  };
}

describe("journal Mobile Marchand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renvoie l'identifiant et le nom de l'auteur d'une ligne", async () => {
    const chain = journalChain([
      makeRow({ enregistrePar: 77, enregistreParNom: "Awa Kouassi" }),
    ]);
    mockDb.select.mockReturnValue(chain);

    const res = makeResponse();
    await getJournal(makeRequest(), res);

    expect(chain.leftJoin).toHaveBeenCalledWith(
      tables.usersTable,
      expect.anything(),
    );
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        enregistre_par: 77,
        enregistre_par_nom: "Awa Kouassi",
      }),
    ]);
  });

  it("conserve des champs auteur nuls lorsqu'une ligne n'a pas d'auteur", async () => {
    const chain = journalChain([makeRow()]);
    mockDb.select.mockReturnValue(chain);

    const res = makeResponse();
    await getJournal(makeRequest(), res);

    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        enregistre_par: null,
        enregistre_par_nom: null,
      }),
    ]);
  });

  it.each([
    ["banque_vers_mobile", 77, 17500],
    ["mobile_vers_banque", 77, 12500],
  ] as const)(
    "conserve l'auteur %s sur le mouvement mobile d'un virement bancaire",
    async (sens, userId, montantFcfa) => {
      const tx = setupBankTransfer();
      const req = makeRequest();
      req.body = {
        compteBancaireId: 21,
        sens,
        montantFcfa,
        reference: `BANK-${sens}`,
      };
      const res = makeResponse();

      await postVirementBanque(req, res);

      expect(mobileMovementValues(tx)).toHaveBeenCalledWith(
        expect.objectContaining({ enregistrePar: userId }),
      );
    },
  );

  it.each([
    ["caisse_vers_mobile", 77, 17500],
    ["mobile_vers_caisse", 77, 12500],
  ] as const)(
    "conserve l'auteur %s sur le mouvement mobile d'un virement de caisse",
    async (sens, userId, montantFcfa) => {
      const tx = setupCashTransfer();
      const req = makeRequest();
      req.body = {
        caisseId: 31,
        sens,
        montantFcfa,
        reference: `CASH-${sens}`,
      };
      const res = makeResponse();

      await postVirementCaisse(req, res);

      expect(mobileMovementValues(tx)).toHaveBeenCalledWith(
        expect.objectContaining({ enregistrePar: userId }),
      );
    },
  );
});
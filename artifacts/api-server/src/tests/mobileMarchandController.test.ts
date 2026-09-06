import { Request, Response } from "express";
import pino from "pino";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
}));

const tables = vi.hoisted(() => ({
  comptesMobilesMarchandsTable: {
    id: {},
    cooperativeId: {},
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
}));

vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcriture: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { getJournal } = await import("../controllers/mobileMarchandController.js");

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
  request.log = pino({ enabled: false });
  return request;
}

function makeResponse() {
  const response = Object.create(null) as Response;
  response.json = vi.fn();
  return response;
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
});
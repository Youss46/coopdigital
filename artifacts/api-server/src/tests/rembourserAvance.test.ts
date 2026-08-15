/**
 * Unit tests for rembourserAvance (salairesController)
 *
 * Covered scenarios:
 *  1. montantRembourse: -500  → 400 "Le montant remboursé doit être un montant positif"
 *  2. montantRembourse: 0     → 400  same message
 *  3. montantRembourse > avance.montantFcfa → 400 "ne peut pas dépasser"
 *  4. Valid partial repayment              → 200
 *  5. Concurrent update path              → 409, no history row inserted
 *  6. Full repayment (omitting montantRembourse) → 200
 *
 * The DB is mocked via the workspace alias so no real database is needed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ── Mock @workspace/db BEFORE importing the controller ────────────────────────

const mockDb = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn(),
};

vi.mock("@workspace/db", async () => {
  const makeTable = (name: string) => ({ _: { name } });
  return {
    db: mockDb,
    avancesPersonnelTable: makeTable("avances_personnel"),
    remboursementsAvanceTable: makeTable("remboursements_avance"),
    personnelTable: makeTable("personnel"),
    composantesSalaireTable: makeTable("composantes_salaire"),
    bulletinsPaieTable: makeTable("bulletins_paie"),
    lignesBulletinTable: makeTable("lignes_bulletin"),
    configPaieTable: makeTable("config_paie"),
    comptesMobilesMarchandsTable: makeTable("comptes_mobiles_marchands"),
    mouvementsMobileMarchandTable: makeTable("mouvements_mobile_marchand"),
    ecrituresComptablesTable: makeTable("ecritures_comptables"),
    ecrituresEnAttenteTable: makeTable("ecritures_en_attente"),
  };
});

// Mock services that salairesController imports but are not exercised here
vi.mock("../services/paieService.js", () => ({
  generateBulletin: vi.fn(),
  generateMasse: vi.fn(),
}));
vi.mock("../services/comptabiliteService.js", () => ({
  generateEcrituresSalaire: vi.fn(),
  insererEcrituresSalaireDirectes: vi.fn(),
}));
vi.mock("../services/pdfService.js", () => ({
  generateBulletinPaie: vi.fn(),
  generateBulletinsPaieGroupes: vi.fn(),
}));
vi.mock("../services/caisseService.js", () => ({
  debitCaisseForSalaire: vi.fn(),
  listCaisses: vi.fn(),
}));
vi.mock("../services/banqueService.js", () => ({
  debitBanqueForSalaire: vi.fn(),
  listComptes: vi.fn(),
}));

// ── Import controller after mocks ─────────────────────────────────────────────

const { rembourserAvance } = await import(
  "../controllers/salairesController.js"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReq = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRes = any;

function makeReq(
  id: number,
  body: Record<string, unknown> = {},
): AnyReq {
  return {
    params: { id: String(id) },
    body,
    query: {},
    headers: {},
    user: { cooperativeId: 1, id: 99 },
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  };
}

function makeRes(): AnyRes {
  const res: AnyRes = {
    _status: 200,
    _body: null as unknown,
    status(code: number) {
      res._status = code;
      return res;
    },
    json(body: unknown) {
      res._body = body;
      return res;
    },
  };
  return res;
}

/**
 * Build a chainable fluent mock for db.select() that ultimately resolves to
 * `rows` when .limit() is awaited.
 */
function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    for: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
  mockDb.select.mockReturnValue(chain);
  return chain;
}

/** Build a chainable fluent mock for db.insert().values().returning() */
function makeInsertChain(rows: unknown[] = [{}]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.insert.mockReturnValue(chain);
  return chain;
}

/** Build a chainable fluent mock for db.update().set().where().returning() */
function makeUpdateChain(rows: unknown[] = [{}]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(rows),
  };
  mockDb.update.mockReturnValue(chain);
  return chain;
}

/** Sample avance row in "en_cours" state with montantFcfa=10_000 */
function makeAvance(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    personnelId: 3,
    cooperativeId: 1,
    montantFcfa: 10_000,
    montantRembourse: 0,
    statut: "en_cours",
    dateOctroi: "2026-07-01",
    motif: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("rembourserAvance — guard clauses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Negative amount ────────────────────────────────────────────────────
  it("rejects montantRembourse = -500 with 400 and the positive-amount message", async () => {
    const req = makeReq(5, { montantRembourse: -500 });
    const res = makeRes();

    await rembourserAvance(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(
      /montant positif/i,
    );
    // Guard fires before any DB access
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // ── 2. Zero amount ────────────────────────────────────────────────────────
  it("rejects montantRembourse = 0 with 400 and the positive-amount message", async () => {
    const req = makeReq(5, { montantRembourse: 0 });
    const res = makeRes();

    await rembourserAvance(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(
      /montant positif/i,
    );
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // ── 3. Amount exceeds the advance ─────────────────────────────────────────
  it("rejects montantRembourse exceeding avance.montantFcfa with 400", async () => {
    // DB returns an avance of 10 000 FCFA
    makeSelectChain([makeAvance()]);

    const req = makeReq(5, { montantRembourse: 15_000 });
    const res = makeRes();

    await rembourserAvance(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(
      /ne peut pas d[eé]passer/i,
    );
  });

  // ── 4. Valid partial repayment → 200 ──────────────────────────────────────
  it("accepts a valid partial repayment and returns 200 with the updated row", async () => {
    const avance = makeAvance({ montantFcfa: 10_000, montantRembourse: 0 });

    // First select: fetch the avance
    // Inside transaction: inner select (FOR UPDATE), insert, update
    makeSelectChain([avance]);

    const updatedAvance = { ...avance, montantRembourse: 3_000, statut: "en_cours" };

    // db.transaction receives a callback; we call it with a mock tx
    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      };

      // Inner tx.select().from().where().for().limit() — returns current montantRembourse
      const txSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ montantRembourse: 0 }]),
      };
      tx.select.mockReturnValue(txSelectChain);

      // tx.insert().values()
      const txInsertChain = { values: vi.fn().mockResolvedValue(undefined) };
      tx.insert.mockReturnValue(txInsertChain);

      // tx.update().set().where().returning()
      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([updatedAvance]),
      };
      tx.update.mockReturnValue(txUpdateChain);

      return callback(tx);
    });

    const req = makeReq(5, { montantRembourse: 3_000 });
    const res = makeRes();

    await rembourserAvance(req as Request, res as Response);

    expect(res._status).toBe(200);
    const body = res._body as typeof updatedAvance;
    expect(body.montantRembourse).toBe(3_000);
    expect(body.statut).toBe("en_cours");
    expect(mockDb.transaction).toHaveBeenCalledOnce();
  });

  // ── 5. Concurrent update → 409, no history row inserted ──────────────────
  //
  // Scenario: two requests race to repay the same advance for 3 000 FCFA.
  // The outer db.select() still sees montantRembourse = 0 (stale READ COMMITTED
  // snapshot), but by the time the transaction acquires the FOR UPDATE lock
  // the DB row has been updated by the winning request (montantRembourse = 3 000).
  //
  // The guard `nouveauMontant <= current.montantRembourse` (line ~988 of
  // salairesController.ts) must fire, and the controller must:
  //   - return 409
  //   - never call tx.insert (no duplicate remboursements_avance row)
  //   - never call tx.update
  it("returns 409 and skips the history insert when FOR UPDATE lock reveals a stale montantRembourse", async () => {
    // Outer read still shows the un-repaid state (stale snapshot)
    const avance = makeAvance({ montantFcfa: 10_000, montantRembourse: 0 });
    makeSelectChain([avance]);

    // Captured inside the mockImplementation so we can assert on them afterwards
    let capturedTxInsert: ReturnType<typeof vi.fn> | undefined;
    let capturedTxUpdate: ReturnType<typeof vi.fn> | undefined;

    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const txInsert = vi.fn();
      const txUpdate = vi.fn();
      capturedTxInsert = txInsert;
      capturedTxUpdate = txUpdate;

      const tx = {
        select: vi.fn(),
        insert: txInsert,
        update: txUpdate,
      };

      // FOR UPDATE read returns the already-updated montantRembourse (3 000):
      // a concurrent request already applied the same repayment amount.
      // nouveauMontant (3 000) <= current.montantRembourse (3 000) → guard fires.
      const txSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ montantRembourse: 3_000 }]),
      };
      tx.select.mockReturnValue(txSelectChain);

      // Run the real controller callback so its internal guard logic executes.
      // The callback throws CONCURRENT_UPDATE; we re-throw so the controller's
      // outer catch block can map it to a 409 response.
      await callback(tx);
    });

    const req = makeReq(5, { montantRembourse: 3_000 });
    const res = makeRes();

    await rembourserAvance(req as Request, res as Response);

    // Controller must return 409
    expect(res._status).toBe(409);
    expect((res._body as { erreur: string }).erreur).toMatch(/simultan[eé]/i);

    // The transaction was entered
    expect(mockDb.transaction).toHaveBeenCalledOnce();

    // Critical: no history row was inserted and no update was applied
    expect(capturedTxInsert).not.toHaveBeenCalled();
    expect(capturedTxUpdate).not.toHaveBeenCalled();
  });

  // ── 6. Already fully-repaid advance → 400, no transaction started ────────
  it("returns 400 and never starts a transaction when avance.statut is already 'rembourse'", async () => {
    // DB returns an advance that is already fully repaid
    const alreadyRepaid = makeAvance({
      statut: "rembourse",
      montantFcfa: 10_000,
      montantRembourse: 10_000,
    });
    makeSelectChain([alreadyRepaid]);

    const req = makeReq(5, { montantRembourse: 5_000 });
    const res = makeRes();

    await rembourserAvance(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(
      /d[eé]j[aà] rembours[eé]/i,
    );

    // The guard must fire before any transaction is opened
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  // ── 7. Full repayment (omitting montantRembourse) → 200 ──────────────────
  it("accepts full repayment when montantRembourse is omitted and marks avance rembourse", async () => {
    const avance = makeAvance({ montantFcfa: 10_000, montantRembourse: 0 });
    makeSelectChain([avance]);

    const updatedAvance = { ...avance, montantRembourse: 10_000, statut: "rembourse" };

    mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      };

      const txSelectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        for: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([{ montantRembourse: 0 }]),
      };
      tx.select.mockReturnValue(txSelectChain);

      const txInsertChain = { values: vi.fn().mockResolvedValue(undefined) };
      tx.insert.mockReturnValue(txInsertChain);

      const txUpdateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([updatedAvance]),
      };
      tx.update.mockReturnValue(txUpdateChain);

      return callback(tx);
    });

    // No montantRembourse in the body → full repayment path
    const req = makeReq(5, {});
    const res = makeRes();

    await rembourserAvance(req as Request, res as Response);

    expect(res._status).toBe(200);
    const body = res._body as typeof updatedAvance;
    expect(body.montantRembourse).toBe(10_000);
    expect(body.statut).toBe("rembourse");
    expect(mockDb.transaction).toHaveBeenCalledOnce();
  });
});

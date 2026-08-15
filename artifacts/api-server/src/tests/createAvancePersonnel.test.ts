/**
 * Unit tests for createAvancePersonnel (salairesController)
 *
 * Covered scenarios:
 *  1. montantFcfa: -1000  → 400 "montant positif"
 *  2. montantFcfa: 0      → 400  same message
 *  3. Missing required fields → 400 "Champs obligatoires manquants"
 *  4. Valid creation → 201 with the inserted row
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

const { createAvancePersonnel } = await import(
  "../controllers/salairesController.js"
);

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReq = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRes = any;

function makeReq(body: Record<string, unknown> = {}): AnyReq {
  return {
    params: {},
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

/** Build a chainable fluent mock for db.select() that resolves to `rows`. */
function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createAvancePersonnel — guard clauses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── 1. Negative amount ────────────────────────────────────────────────────
  it("rejects montantFcfa = -1000 with 400 and the positive-amount message", async () => {
    const req = makeReq({
      personnelId: 3,
      montantFcfa: -1000,
      dateOctroi: "2026-08-01",
    });
    const res = makeRes();

    await createAvancePersonnel(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(/montant positif/i);
    // Guard fires before any DB access
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // ── 2. Zero amount ────────────────────────────────────────────────────────
  it("rejects montantFcfa = 0 with 400 and the positive-amount message", async () => {
    const req = makeReq({
      personnelId: 3,
      montantFcfa: 0,
      dateOctroi: "2026-08-01",
    });
    const res = makeRes();

    await createAvancePersonnel(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(/montant positif/i);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // ── 3. Missing required fields → 400 ─────────────────────────────────────
  it("rejects a request missing required fields with 400", async () => {
    const req = makeReq({ personnelId: 3 }); // montantFcfa and dateOctroi absent
    const res = makeRes();

    await createAvancePersonnel(req as Request, res as Response);

    expect(res._status).toBe(400);
    expect((res._body as { erreur: string }).erreur).toMatch(/obligatoires/i);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  // ── 4. Valid creation → 201 ───────────────────────────────────────────────
  it("creates an advance and returns 201 when all fields are valid", async () => {
    const personnelRow = { id: 3 };
    makeSelectChain([personnelRow]);

    const insertedRow = {
      id: 42,
      personnelId: 3,
      cooperativeId: 1,
      montantFcfa: 5_000,
      montantRembourse: 0,
      statut: "en_cours",
      dateOctroi: "2026-08-01",
      motif: null,
      createdAt: new Date(),
    };
    makeInsertChain([insertedRow]);

    const req = makeReq({
      personnelId: 3,
      montantFcfa: 5_000,
      dateOctroi: "2026-08-01",
    });
    const res = makeRes();

    await createAvancePersonnel(req as Request, res as Response);

    expect(res._status).toBe(201);
    const body = res._body as typeof insertedRow;
    expect(body.montantFcfa).toBe(5_000);
    expect(body.statut).toBe("en_cours");
    expect(mockDb.insert).toHaveBeenCalledOnce();
  });
});

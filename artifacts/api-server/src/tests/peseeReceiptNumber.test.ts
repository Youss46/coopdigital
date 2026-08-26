/**
 * Tests: pesée receipt number stored correctly on paiement (Task #18)
 *
 * Covered scenarios:
 *  1. creerLivraisonDepuisSession calls genererNumeroRecu with the cooperative ID
 *  2. The returned REC-YYYY-NNNNN value is stored as paiementsTable.numeroRecu
 *  3. The returned paiement object exposes the correct numeroRecu
 *
 * These are unit tests — all DB calls and services are mocked.
 * No real PostgreSQL connection required.
 *
 * See peseeReceiptPdf.test.ts for:
 *  - Real genererNumeroRecu with controlled DB output
 *  - Real generateRecuPaiement asserting the PDF buffer contains the REC number
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared capture ───────────────────────────────────────────────────────────

/** Values captured from the paiementsTable.insert() call inside creerLivraisonDepuisSession */
let capturedPaiementInsert: Record<string, unknown> | null = null;
let capturedLivraisonInsert: Record<string, unknown> | null = null;

// ─── Fixture data ─────────────────────────────────────────────────────────────

const COOPERATIVE_ID = 1;
const SESSION_ID     = 10;
const MEMBRE_ID      = 5;
const FAKE_RECU      = "REC-2026-00042";

const mockSession = {
  id: SESSION_ID,
  cooperativeId: COOPERATIVE_ID,
  statut: "terminee",
  membreId: MEMBRE_ID,
  poidsTotalKg: "120.5",
  nbSacsTotal: 3,
  produit: "cacao",
  livraisonId: null,
  dateFin: "2026-08-17",
};

const mockLivraison = {
  id: 100,
  membreId: MEMBRE_ID,
  campagneId: 7,
  poidsKg: "120.5",
  prixUnitaireFcfa: 1200,
  montantBrutFcfa: 144600,
  avanceDeduiteFcfa: 0,
  intrantsDeduitsFcfa: 0,
  montantNetFcfa: 144600,
  dateLivraison: "2026-08-17",
};

const mockPaiement = {
  id: 55,
  livraisonId: 100,
  membreId: MEMBRE_ID,
  montantFcfa: 144600,
  numeroRecu: FAKE_RECU,
  statut: "en_attente",
};

// ─── Mock @workspace/db ───────────────────────────────────────────────────────
// The alias in vitest.config.ts routes "@workspace/db" to the shared mock file.
// Here we override it further to control db.transaction behaviour.

vi.mock("@workspace/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@workspace/db")>();

  const fakeTransaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    let selectCount = 0;
    const tx = {
      select: vi.fn(() => {
        selectCount += 1;
        const query = {
          from:    vi.fn(),
          where:   vi.fn(),
          for:     vi.fn(),
          limit:   vi.fn(),
          orderBy: vi.fn(),
          then:    (resolve: (value: unknown) => unknown) => Promise.resolve(
            selectCount === 2 ? [{ total: 0 }] : [],
          ).then(resolve),
        };
        query.from.mockReturnValue(query);
        query.where.mockReturnValue(query);
        query.for.mockReturnValue(query);
        query.orderBy.mockReturnValue(query);
        query.limit.mockResolvedValue(selectCount === 1 ? [mockSession] : []);
        return query;
      }),
      insert: vi.fn(() => ({
        values: vi.fn((vals: unknown) => {
          if (vals && typeof vals === "object" && "numeroRecu" in (vals as object)) {
            capturedPaiementInsert = vals as Record<string, unknown>;
          } else if (vals && typeof vals === "object" && "poidsKg" in (vals as object)) {
            capturedLivraisonInsert = vals as Record<string, unknown>;
          }
          return {
            returning: vi.fn().mockResolvedValue(
              vals && typeof vals === "object" && "montantFcfa" in (vals as object)
                ? [mockPaiement]
                : [mockLivraison],
            ),
          };
        }),
      })),
      update: vi.fn(() => ({
        set:       vi.fn().mockReturnThis(),
        where:     vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([mockSession]),
      })),
    };
    return fn(tx);
  };

  return {
    ...original,
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      execute: vi.fn(),
      transaction: fakeTransaction,
    },
  };
});

// ─── Mock service dependencies ────────────────────────────────────────────────

vi.mock("../services/terrainService.js", () => ({
  getPrixActuel: vi.fn().mockResolvedValue({
    prixBordChampFcfa: 1200,
    campagneId: 7,
  }),
}));

const mockGenererNumeroRecu = vi.fn().mockResolvedValue(FAKE_RECU);
const mockReserverNumeroPesee = vi.fn().mockResolvedValue({ numero: 1, annee: 2026 });
vi.mock("../services/recuService.js", () => ({
  genererNumeroRecu: (...args: unknown[]) => mockGenererNumeroRecu(...args),
  reserverNumeroPesee: (...args: unknown[]) => mockReserverNumeroPesee(...args),
}));

vi.mock("../services/intrantsService.js", () => ({
  getEncoursMembreTx: vi.fn().mockResolvedValue(0),
  enregistrerRemboursementParLivraison: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/notificationService.js", () => ({
  creerNotification:  vi.fn().mockResolvedValue(undefined),
  notifierParRole:    vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/comptabiliteService.js", () => ({
  generateEcrituresLivraison: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Import SUT after all mocks ───────────────────────────────────────────────

const { creerLivraisonDepuisSession } = await import(
  "../services/peseeSessionService.js"
);

// ─────────────────────────────────────────────────────────────────────────────
// creerLivraisonDepuisSession — stores REC receipt number on paiement
// ─────────────────────────────────────────────────────────────────────────────

describe("creerLivraisonDepuisSession — stores REC receipt number on paiement", () => {
  beforeEach(() => {
    capturedPaiementInsert = null;
    capturedLivraisonInsert = null;
    mockGenererNumeroRecu.mockClear();
    mockReserverNumeroPesee.mockClear();
  });

  it("calls genererNumeroRecu with the correct cooperative ID", async () => {
    await creerLivraisonDepuisSession(COOPERATIVE_ID, SESSION_ID, {});
    expect(mockGenererNumeroRecu).toHaveBeenCalledWith(COOPERATIVE_ID);
  });

  it("inserts paiement with numeroRecu = REC-YYYY-NNNNN (not null and not PAY-* fallback)", async () => {
    await creerLivraisonDepuisSession(COOPERATIVE_ID, SESSION_ID, {});
    expect(capturedPaiementInsert).not.toBeNull();
    const numeroRecu = capturedPaiementInsert!["numeroRecu"] as string;
    expect(numeroRecu).toBe(FAKE_RECU);
    expect(numeroRecu).toMatch(/^REC-\d{4}-\d{5}$/);
    expect(numeroRecu).not.toMatch(/^PAY-/);
  });

  it("returns the paiement with the correct numeroRecu", async () => {
    const result = await creerLivraisonDepuisSession(COOPERATIVE_ID, SESSION_ID, {});
    expect(result.paiement.numeroRecu).toBe(FAKE_RECU);
  });

  it("stores the cooperative-local weighing number on the generated delivery", async () => {
    await creerLivraisonDepuisSession(COOPERATIVE_ID, SESSION_ID, {});
    expect(mockReserverNumeroPesee).toHaveBeenCalledWith(COOPERATIVE_ID);
    expect(capturedLivraisonInsert?.numeroPesee).toBe(1);
  });

  it("keeps the generated delivery unpaid until its payment is validated", async () => {
    await creerLivraisonDepuisSession(COOPERATIVE_ID, SESSION_ID, {});
    expect(capturedLivraisonInsert?.statutPaiement).toBe("EN_ATTENTE");
    expect(capturedLivraisonInsert?.montantRestant).toBe("144600");
  });
});

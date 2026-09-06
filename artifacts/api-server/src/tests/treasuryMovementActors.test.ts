import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDb = vi.hoisted(() => ({
  select: vi.fn(),
  transaction: vi.fn(),
}));

const tables = vi.hoisted(() => ({
  tauxCommissionsDeleguesTable: { _: { name: "taux_commissions_delegues" } },
  commissionsDeleguesTable: { _: { name: "commissions_delegues" } },
  caissesTable: { _: { name: "caisses" } },
  mouvementsCaisseTable: { _: { name: "mouvements_caisse" } },
  comptesMobilesMarchandsTable: { _: { name: "comptes_mobiles_marchands" } },
  mouvementsMobileMarchandTable: { _: { name: "mouvements_mobile_marchand" } },
  comptesBancairesTable: { _: { name: "comptes_bancaires" } },
  mouvementsBanqueTable: { _: { name: "mouvements_banque" } },
  chequesEmisTable: { _: { name: "cheques_emis" } },
  usersTable: { _: { name: "users" } },
  campagnesTable: { _: { name: "campagnes" } },
  transfertsStockTable: { _: { name: "transferts_stock" } },
  avancesDeleguesTable: { _: { name: "avances_delegues" } },
  remboursementsAvancesDeleguesTable: { _: { name: "remboursements_avances_delegues" } },
}));

const generateEcrituresCommissionDansTransaction = vi.hoisted(() => vi.fn());

vi.mock("@workspace/db", () => ({
  db: mockDb,
  ...tables,
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => ({})),
  desc: vi.fn(() => ({})),
  eq: vi.fn(() => ({})),
  inArray: vi.fn(() => ({})),
  isNull: vi.fn(() => ({})),
  or: vi.fn(() => ({})),
  sql: vi.fn(() => ({})),
}));

vi.mock("../lib/logger.js", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../services/comptabiliteService.js", () => ({
  generateEcrituresCommissionDansTransaction,
}));

const { payerCommissions } = await import("../services/commissionService.js");

function selectChain<T>(rows: T[], terminal: "where" | "limit" | "orderBy") {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["from", "where", "limit", "orderBy"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain[terminal] = vi.fn().mockResolvedValue(rows);
  return chain;
}

function updateChain() {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn().mockResolvedValue([]);
  return chain;
}

function insertChain(rows: unknown[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn().mockResolvedValue(rows);
  return chain;
}

function setupPayment(mode: "especes" | "wave" | "virement") {
  const commission = {
    id: 501,
    delegueId: 44,
    montantFcfa: "25000",
    statut: "en_attente",
  };
  const tx = {
    select: vi.fn(() => selectChain([{
      id: 700,
      solde: "100000",
      nom: "Compte de paiement",
    }], "limit")),
    update: vi.fn(() => updateChain()),
    insert: vi.fn((table: unknown) => insertChain(
      table === tables.mouvementsBanqueTable ? [{ id: 801 }] : [],
    )),
  };

  mockDb.select
    .mockReturnValueOnce(selectChain([commission], "where"))
    .mockReturnValueOnce(selectChain([{ nom: "Délégué", prenoms: "Awa" }], "limit"))
    .mockReturnValueOnce(selectChain([], "orderBy"));
  mockDb.transaction.mockImplementationOnce(async (callback: (value: typeof tx) => unknown) => callback(tx));

  return { tx, commission };
}

describe("traçabilité des auteurs des mouvements de commissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["especes", "wave", "virement"] as const)(
    "transmet l'utilisateur authentifié pour un paiement par %s",
    async (mode) => {
      const { tx, commission } = setupPayment(mode);

      await payerCommissions(44, 9, mode, [commission.id], "PAY-501", 77);

      const movementIndex = tx.insert.mock.calls.findIndex(([table]) =>
        table === (
          mode === "especes"
            ? tables.mouvementsCaisseTable
            : mode === "wave"
            ? tables.mouvementsMobileMarchandTable
            : tables.mouvementsBanqueTable
        ),
      );
      expect(movementIndex).toBeGreaterThanOrEqual(0);
      const movementChain = tx.insert.mock.results[movementIndex]?.value as {
        values: ReturnType<typeof vi.fn>;
      };
      expect(movementChain.values).toHaveBeenCalledWith(
        expect.objectContaining({ enregistrePar: 77 }),
      );
    },
  );
});
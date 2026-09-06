import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { pool } from "@workspace/db";
import { virementVersCaisse } from "../services/banqueService.js";
import { virementVersBanque } from "../services/caisseService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

const postgresReferenceDate =
  process.env.POSTGRES_INTEGRATION_REFERENCE_DATE ?? "2026-08-29";

function shiftIsoDate(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      "POSTGRES_INTEGRATION_REFERENCE_DATE doit être une date ISO (AAAA-MM-JJ)",
    );
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(
      "POSTGRES_INTEGRATION_REFERENCE_DATE doit être une date civile valide",
    );
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

const postgresPreviousDate = shiftIsoDate(postgresReferenceDate, -1);

/**
 * These tests deliberately run the production transfer services against two
 * independent PostgreSQL transactions. Run them against a disposable
 * database:
 *
 * RUN_POSTGRES_INTEGRATION=1 DATABASE_URL=... \
 *   pnpm --filter @workspace/api-server test:integration
 */
describe("référence calendaire des virements banque-caisse", () => {
  it("calcule correctement une date précédente lors d'un changement d'année", () => {
    expect(shiftIsoDate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftIsoDate("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe.skipIf(!enabled)("virements banque-caisse concurrents sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let compteBancaireId: number;
  let caisseId: number;
  let sessionId: number;

  const objectSuffix = `${process.pid}_${Date.now()}`;
  const delayFunction = `task80_delay_${objectSuffix}`;
  const delayTrigger = `task80_delay_trigger_${objectSuffix}`;
  const failureFunction = `task80_failure_${objectSuffix}`;
  const failureTrigger = `task80_failure_trigger_${objectSuffix}`;

  function identifier(value: string): string {
    return `"${value.replaceAll(`"`, `""`)}"`;
  }

  async function dropTestAccountingFailure(): Promise<void> {
    await client.query(`
      DROP TRIGGER IF EXISTS ${identifier(failureTrigger)}
        ON ecritures_comptables;
      DROP FUNCTION IF EXISTS ${identifier(failureFunction)}();
    `);
  }

  async function installBankUpdateDelay(): Promise<void> {
    await client.query(`
      CREATE FUNCTION ${identifier(delayFunction)}()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        PERFORM pg_sleep(0.1);
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER ${identifier(delayTrigger)}
      BEFORE UPDATE OF solde_actuel_fcfa ON comptes_bancaires
      FOR EACH ROW
      WHEN (OLD.cooperative_id = ${cooperativeId})
      EXECUTE FUNCTION ${identifier(delayFunction)}();
    `);
  }

  async function dropBankUpdateDelay(): Promise<void> {
    await client.query(`
      DROP TRIGGER IF EXISTS ${identifier(delayTrigger)}
        ON comptes_bancaires;
      DROP FUNCTION IF EXISTS ${identifier(delayFunction)}();
    `);
  }

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`Task 80 treasury concurrency ${objectSuffix}`, "Test", "Test"],
    );
    cooperativeId = cooperative.rows[0].id;

    await client.query(
      `INSERT INTO config_comptable (cooperative_id, auto_banque, auto_caisse)
       VALUES ($1, true, true)`,
      [cooperativeId],
    );
  });

  beforeEach(async () => {
    const account = await client.query(
      `INSERT INTO comptes_bancaires
         (cooperative_id, nom, banque, solde_actuel_fcfa, solde_mini_alerte_fcfa, actif)
       VALUES ($1, $2, $3, $4, 0, true)
       RETURNING id`,
      [cooperativeId, "Compte concurrency", "Banque de test", "500000"],
    );
    compteBancaireId = account.rows[0].id;

    const caisse = await client.query(
      `INSERT INTO caisses
         (cooperative_id, nom, type_caisse, solde_actuel_fcfa,
          fond_caisse_minimum_fcfa, actif)
       VALUES ($1, $2, 'centrale', $3, 0, true)
       RETURNING id`,
      [cooperativeId, "Caisse concurrency", "500000"],
    );
    caisseId = caisse.rows[0].id;

    const session = await client.query(
      `INSERT INTO sessions_caisse
         (caisse_id, cooperative_id, date_session, solde_ouverture_fcfa, statut)
       VALUES ($1, $2, CURRENT_DATE, $3, 'ouverte')
       RETURNING id`,
      [caisseId, cooperativeId, "500000"],
    );
    sessionId = session.rows[0].id;
  });

  afterEach(async () => {
    await dropTestAccountingFailure();
    await dropBankUpdateDelay();

    await client.query(
      `DELETE FROM ecritures_comptables WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM ecritures_en_attente WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM mouvements_banque WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM mouvements_caisse WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(`DELETE FROM sessions_caisse WHERE id = $1`, [sessionId]);
    await client.query(`DELETE FROM caisses WHERE id = $1`, [caisseId]);
    await client.query(`DELETE FROM comptes_bancaires WHERE id = $1`, [
      compteBancaireId,
    ]);
  });

  afterAll(async () => {
    await dropTestAccountingFailure();
    await dropBankUpdateDelay();

    await client.query(
      `DELETE FROM ecritures_comptables WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM ecritures_en_attente WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM mouvements_banque WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM mouvements_caisse WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM sessions_caisse WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(`DELETE FROM caisses WHERE cooperative_id = $1`, [
      cooperativeId,
    ]);
    await client.query(
      `DELETE FROM comptes_bancaires WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(`DELETE FROM config_comptable WHERE cooperative_id = $1`, [
      cooperativeId,
    ]);
    await client.query(`DELETE FROM cooperatives WHERE id = $1`, [
      cooperativeId,
    ]);
    client.release();
  });

  it("sérialise deux virements opposés et conserve chaque solde après mouvement", async () => {
    await installBankUpdateDelay();

    let results;
    try {
      results = await Promise.all([
        virementVersCaisse(compteBancaireId, cooperativeId, {
          caisseId,
          montantFcfa: 175_000,
          reference: `TASK80-BANK-TO-CASH-${objectSuffix}`,
          dateOperation: postgresPreviousDate,
        }),
        virementVersBanque(caisseId, cooperativeId, {
          compteBancaireId,
          montantFcfa: 125_000,
          reference: `TASK80-CASH-TO-BANK-${objectSuffix}`,
          dateOperation: postgresPreviousDate,
        }),
      ]);
    } finally {
      await dropBankUpdateDelay();
    }

    expect(results).toHaveLength(2);
    expect(results.map((result) => result.reference)).toEqual(
      expect.arrayContaining([
        `TASK80-BANK-TO-CASH-${objectSuffix}`,
        `TASK80-CASH-TO-BANK-${objectSuffix}`,
      ]),
    );

    const balances = await client.query(
      `SELECT
         (SELECT solde_actuel_fcfa FROM comptes_bancaires WHERE id = $1) AS bank,
         (SELECT solde_actuel_fcfa FROM caisses WHERE id = $2) AS cash`,
      [compteBancaireId, caisseId],
    );
    const bankMovements = await client.query(
      `SELECT type, motif, montant_fcfa, solde_apres_fcfa, date_operation::text
       FROM mouvements_banque
       WHERE compte_id = $1
       ORDER BY id`,
      [compteBancaireId],
    );
    const cashMovements = await client.query(
      `SELECT type, motif, montant_fcfa, solde_apres_fcfa, date_operation::text
       FROM mouvements_caisse
       WHERE caisse_id = $1
       ORDER BY id`,
      [caisseId],
    );
    const accounting = await client.query(
      `SELECT montant_fcfa, compte_debit, compte_credit, date_ecriture::text
       FROM ecritures_comptables
       WHERE cooperative_id = $1
       ORDER BY id`,
      [cooperativeId],
    );

    expect(balances.rows[0]).toEqual({ bank: "450000", cash: "550000" });
    expect(bankMovements.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "debit",
          motif: "virement_sortant",
          montant_fcfa: "175000",
          date_operation: postgresPreviousDate,
        }),
        expect.objectContaining({
          type: "credit",
          motif: "virement_entrant",
          montant_fcfa: "125000",
          date_operation: postgresPreviousDate,
        }),
      ]),
    );
    const bankBalancesAfterMovements = new Set(
      bankMovements.rows.map((row: { solde_apres_fcfa: string }) => row.solde_apres_fcfa),
    );
    expect(
      [
        ["325000", "450000"],
        ["450000", "625000"],
      ].some((expected) =>
        expected.every((balance) => bankBalancesAfterMovements.has(balance)),
      ),
    ).toBe(true);
    expect(cashMovements.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "entree",
          motif: "virement_banque",
          montant_fcfa: "175000",
          date_operation: postgresPreviousDate,
        }),
        expect.objectContaining({
          type: "sortie",
          motif: "depot_banque",
          montant_fcfa: "125000",
          date_operation: postgresPreviousDate,
        }),
      ]),
    );
    const cashBalancesAfterMovements = new Set(
      cashMovements.rows.map((row: { solde_apres_fcfa: string }) => row.solde_apres_fcfa),
    );
    expect(
      [
        ["550000", "675000"],
        ["375000", "550000"],
      ].some((expected) =>
        expected.every((balance) => cashBalancesAfterMovements.has(balance)),
      ),
    ).toBe(true);
    expect(accounting.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          montant_fcfa: 175_000,
          compte_debit: "571000",
          compte_credit: "521000",
          date_ecriture: postgresPreviousDate,
        }),
        expect.objectContaining({
          montant_fcfa: 125_000,
          compte_debit: "521000",
          compte_credit: "571000",
          date_ecriture: postgresPreviousDate,
        }),
      ]),
    );
    expect(bankMovements.rows).toHaveLength(2);
    expect(cashMovements.rows).toHaveLength(2);
    expect(accounting.rows).toHaveLength(2);
  });

  it("rollbacke les mouvements et les soldes si PostgreSQL refuse l'écriture comptable", async () => {
    await client.query(`
      CREATE FUNCTION ${identifier(failureFunction)}()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'task 80 forced accounting failure';
      END;
      $$;

      CREATE TRIGGER ${identifier(failureTrigger)}
      BEFORE INSERT ON ecritures_comptables
      FOR EACH ROW
      WHEN (NEW.cooperative_id = ${cooperativeId})
      EXECUTE FUNCTION ${identifier(failureFunction)}();
    `);

    let accountingFailure: (Error & { cause?: Error }) | undefined;
    try {
      await virementVersCaisse(compteBancaireId, cooperativeId, {
        caisseId,
        montantFcfa: 75_000,
        reference: `TASK80-ACCOUNTING-FAILURE-${objectSuffix}`,
        dateOperation: postgresPreviousDate,
      });
    } catch (error) {
      if (error instanceof Error) {
        accountingFailure = error as Error & { cause?: Error };
      } else {
        throw error;
      }
    }

    if (!accountingFailure) {
      throw new Error("Le virement aurait dû échouer côté comptabilité");
    }
    expect(accountingFailure.message).toContain("Failed query");
    expect(accountingFailure.cause?.message).toContain(
      "task 80 forced accounting failure",
    );

    const balances = await client.query(
      `SELECT
         (SELECT solde_actuel_fcfa FROM comptes_bancaires WHERE id = $1) AS bank,
         (SELECT solde_actuel_fcfa FROM caisses WHERE id = $2) AS cash`,
      [compteBancaireId, caisseId],
    );
    const bankMovements = await client.query(
      `SELECT count(*)::int AS count
       FROM mouvements_banque
       WHERE compte_id = $1`,
      [compteBancaireId],
    );
    const cashMovements = await client.query(
      `SELECT count(*)::int AS count
       FROM mouvements_caisse
       WHERE caisse_id = $1`,
      [caisseId],
    );
    const accounting = await client.query(
      `SELECT count(*)::int AS count
       FROM ecritures_comptables
       WHERE cooperative_id = $1`,
      [cooperativeId],
    );

    expect(balances.rows[0]).toEqual({ bank: "500000", cash: "500000" });
    expect(bankMovements.rows[0].count).toBe(0);
    expect(cashMovements.rows[0].count).toBe(0);
    expect(accounting.rows[0].count).toBe(0);
  });
});
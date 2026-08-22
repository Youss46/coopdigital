import { pool } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);
type DbClient = {
  query: (...args: any[]) => Promise<any>;
  release: () => void;
};

/**
 * This test deliberately uses two PostgreSQL connections.  The unit tests
 * cover the service wiring; this test proves the database behavior that the
 * FOR UPDATE in payerMembre/payerBulk relies on.
 *
 * Run explicitly against a disposable PostgreSQL database:
 * RUN_POSTGRES_INTEGRATION=1 DATABASE_URL=... pnpm --filter @workspace/api-server test:integration
 */
describe.skipIf(!enabled)("paiements de primes concurrents sur PostgreSQL", () => {
  let first: DbClient;
  let second: DbClient;
  let allocationTable: string;
  let movementTable: string;
  let accountingTable: string;

  beforeAll(async () => {
    [first, second] = await Promise.all([pool.connect(), pool.connect()]);

    const suffix = `${process.pid}_${Date.now()}`.replaceAll("-", "_");
    allocationTable = `prime_concurrency_allocations_${suffix}`;
    movementTable = `prime_concurrency_movements_${suffix}`;
    accountingTable = `prime_concurrency_accounting_${suffix}`;

    await first.query(`
      CREATE TABLE ${allocationTable} (
        id integer PRIMARY KEY,
        status text NOT NULL CHECK (status IN ('en_attente', 'paye'))
      );
      CREATE TABLE ${movementTable} (
        allocation_id integer NOT NULL REFERENCES ${allocationTable}(id)
      );
      CREATE TABLE ${accountingTable} (
        allocation_id integer NOT NULL REFERENCES ${allocationTable}(id)
      );
      INSERT INTO ${allocationTable} (id, status) VALUES (1, 'en_attente');
    `);
  });

  afterAll(async () => {
    await first.query(`
      DROP TABLE IF EXISTS ${movementTable}, ${accountingTable}, ${allocationTable};
    `);
    first.release();
    second.release();
  });

  it("fait attendre le second paiement puis le refuse sans double effet financier", async () => {
    const payment = async (client: typeof first) => {
      await client.query("BEGIN");
      try {
        const { rows } = await client.query(
          `SELECT status FROM ${allocationTable} WHERE id = $1 FOR UPDATE`,
          [1],
        );
        if (rows.length === 0) throw new Error("allocation introuvable");
        if (rows[0].status === "paye") {
          throw new Error("allocation déjà payée");
        }

        await client.query(
          `UPDATE ${allocationTable} SET status = 'paye' WHERE id = $1`,
          [1],
        );
        await client.query(
          `INSERT INTO ${movementTable} (allocation_id) VALUES ($1)`,
          [1],
        );
        await client.query(
          `INSERT INTO ${accountingTable} (allocation_id) VALUES ($1)`,
          [1],
        );
        await client.query("COMMIT");
        return "paye" as const;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    };

    await first.query("BEGIN");
    const lock = await first.query(
      `SELECT status FROM ${allocationTable} WHERE id = $1 FOR UPDATE`,
      [1],
    );
    expect(lock.rows[0].status).toBe("en_attente");

    const secondPayment = payment(second);
    const waiting = await Promise.race([
      secondPayment.then(() => "finished", () => "finished"),
      new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 100)),
    ]);
    expect(waiting).toBe("waiting");

    await first.query(`UPDATE ${allocationTable} SET status = 'paye' WHERE id = $1`, [1]);
    await first.query("INSERT INTO " + movementTable + " (allocation_id) VALUES ($1)", [1]);
    await first.query("INSERT INTO " + accountingTable + " (allocation_id) VALUES ($1)", [1]);
    await first.query("COMMIT");

    await expect(secondPayment).rejects.toThrow("allocation déjà payée");

    const [allocation, movements, accounting] = await Promise.all([
      first.query(`SELECT status FROM ${allocationTable} WHERE id = $1`, [1]),
      first.query(`SELECT count(*)::int AS count FROM ${movementTable}`),
      first.query(`SELECT count(*)::int AS count FROM ${accountingTable}`),
    ]);
    expect(allocation.rows[0].status).toBe("paye");
    expect(movements.rows[0].count).toBe(1);
    expect(accounting.rows[0].count).toBe(1);
  });
});
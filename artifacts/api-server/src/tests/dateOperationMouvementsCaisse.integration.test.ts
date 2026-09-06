import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

const migrationUrl = new URL(
  "../../../../lib/db/drizzle/0163_date_operation_mouvements_caisse.sql",
  import.meta.url,
);

describe.skipIf(!enabled)(
  "migration date_operation des mouvements de caisse sur PostgreSQL",
  () => {
    let client: any;

    beforeAll(async () => {
      client = await pool.connect();
      await client.query(`
        CREATE TEMP TABLE mouvements_caisse (
          id serial PRIMARY KEY,
          type varchar(10) NOT NULL,
          motif varchar(50) NOT NULL,
          montant_fcfa numeric NOT NULL,
          reference_operation varchar(100),
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    });

    afterAll(async () => {
      client?.release();
    });

    it("préserve l'historique et applique les dates par défaut ou explicites", async () => {
      const migrationSql = await readFile(migrationUrl, "utf8");
      const historique = await client.query(
        `INSERT INTO mouvements_caisse
           (type, motif, montant_fcfa, reference_operation, created_at)
         VALUES ('entree', 'solde initial', 12500, 'LEGACY-001',
                 '2024-01-15T09:30:00Z')
         RETURNING id`,
      );

      await client.query(migrationSql);

      const historiqueApresMigration = await client.query(
        `SELECT id, type, motif, montant_fcfa::text AS montant_fcfa,
                reference_operation, created_at::text AS created_at,
                date_operation::text AS date_operation,
                CURRENT_DATE::text AS today
           FROM mouvements_caisse
          WHERE id = $1`,
        [historique.rows[0].id],
      );

      expect(historiqueApresMigration.rows[0]).toMatchObject({
        id: historique.rows[0].id,
        type: "entree",
        motif: "solde initial",
        montant_fcfa: "12500",
        reference_operation: "LEGACY-001",
        date_operation: historiqueApresMigration.rows[0].today,
      });
      expect(historiqueApresMigration.rows[0].created_at).toContain(
        "2024-01-15",
      );

      const insertionParDefaut = await client.query(
        `INSERT INTO mouvements_caisse
           (type, motif, montant_fcfa, reference_operation)
         VALUES ('sortie', 'retrait', 2500, 'DEFAULT-001')
         RETURNING id, date_operation::text AS date_operation`,
      );
      expect(insertionParDefaut.rows[0].date_operation).toBe(
        historiqueApresMigration.rows[0].today,
      );

      const insertionDatee = await client.query(
        `INSERT INTO mouvements_caisse
           (type, motif, montant_fcfa, reference_operation, date_operation)
         VALUES ('entree', 'regularisation', 3000, 'EXPLICIT-001', $1)
         RETURNING id, type, motif, montant_fcfa::text AS montant_fcfa,
                   reference_operation, date_operation::text AS date_operation`,
        ["2023-06-17"],
      );
      expect(insertionDatee.rows[0]).toMatchObject({
        type: "entree",
        motif: "regularisation",
        montant_fcfa: "3000",
        reference_operation: "EXPLICIT-001",
        date_operation: "2023-06-17",
      });
    });
  },
);
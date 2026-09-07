import { pool } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getJournal } from "../services/caisseService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("journal de caisse sur une période PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let caisseId: number;

  const dateDebut = "2026-08-28";
  const dateFin = "2026-08-30";

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [`Journal période ${process.pid}`, "Test", "Test"],
    );
    cooperativeId = cooperative.rows[0].id;

    const caisse = await client.query(
      `INSERT INTO caisses (cooperative_id, nom, type_caisse)
       VALUES ($1, $2, 'centrale')
       RETURNING id`,
      [cooperativeId, `Caisse journal période ${process.pid}`],
    );
    caisseId = caisse.rows[0].id;

    await client.query(
      `INSERT INTO mouvements_caisse
        (caisse_id, cooperative_id, type, motif, montant_fcfa,
         date_operation, solde_apres_fcfa, reference_operation)
       VALUES
        ($1, $2, 'sortie', 'autre', 10, '2026-08-27', 990, $3),
        ($1, $2, 'entree', 'autre', 100, '2026-08-28', 1090, $4),
        ($1, $2, 'sortie', 'autre', 25, '2026-08-30', 1065, $5),
        ($1, $2, 'entree', 'autre', 500, '2026-08-31', 1565, $6)`,
      [
        caisseId,
        cooperativeId,
        `PERIODE-AVANT-${process.pid}`,
        `PERIODE-DEBUT-${process.pid}`,
        `PERIODE-FIN-${process.pid}`,
        `PERIODE-APRES-${process.pid}`,
      ],
    );
  });

  afterAll(async () => {
    if (caisseId) {
      await client.query(`DELETE FROM mouvements_caisse WHERE caisse_id = $1`, [caisseId]);
      await client.query(`DELETE FROM caisses WHERE id = $1`, [caisseId]);
    }
    if (cooperativeId) {
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
    }
    client?.release();
  });

  it("inclut les deux bornes et additionne toute la période", async () => {
    const journal = await getJournal(caisseId, { dateDebut, dateFin });

    expect(journal.mouvements.map((m) => m.date_operation)).toEqual([
      dateDebut,
      dateFin,
    ]);
    expect(journal.totalEntrees).toBe(100);
    expect(journal.totalSorties).toBe(25);
  });

  it("refuse une période inversée avant toute requête SQL", async () => {
    await expect(
      getJournal(caisseId, { dateDebut: dateFin, dateFin: dateDebut }),
    ).rejects.toThrow("La date de fin doit être postérieure ou égale à la date de début.");
  });
});
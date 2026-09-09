import { pool } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deduireAvancesMembreDelegue } from "../services/peseeSessionService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("retenues d'avance concurrentes sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let membreId: number;
  let avanceId: number;
  const suffix = `${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Retenue avance concurrence ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const member = await client.query(
      `INSERT INTO membres
         (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion)
       VALUES ($1, 'Producteur', 'Concurrent', $2, 1, CURRENT_DATE)
       RETURNING id`,
      [cooperativeId, `+2250702${process.pid}`.slice(0, 14)],
    );
    membreId = member.rows[0].id;

    const avance = await client.query(
      `INSERT INTO avances
         (membre_id, montant_octroye_fcfa, montant_rembourse_fcfa,
          solde_restant_fcfa, date_octroi, statut, plan_type,
          deduction_source)
       VALUES ($1, 80000, 0, 80000, CURRENT_DATE, 'en_cours',
               'integral', 'livraison')
       RETURNING id`,
      [membreId],
    );
    avanceId = avance.rows[0].id;
  });

  afterAll(async () => {
    if (!client) return;

    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM remboursements_avances_membres WHERE avance_id = $1`,
        [avanceId],
      );
      await client.query(`DELETE FROM avances WHERE id = $1`, [avanceId]);
      await client.query(`DELETE FROM membres WHERE id = $1`, [membreId]);
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  it("ne dépasse ni le solde ni le payable lorsque deux retenues arrivent ensemble", async () => {
    const results = await Promise.all([
      deduireAvancesMembreDelegue(
        membreId,
        80_000,
        1001,
        `PES-CONC-A-${suffix}`,
        "2026-09-09",
      ),
      deduireAvancesMembreDelegue(
        membreId,
        80_000,
        1002,
        `PES-CONC-B-${suffix}`,
        "2026-09-09",
      ),
    ]);

    expect(results.sort((a, b) => a - b)).toEqual([0, 80_000]);

    const avance = await client.query(
      `SELECT solde_restant_fcfa, montant_rembourse_fcfa, statut
       FROM avances WHERE id = $1`,
      [avanceId],
    );
    expect(avance.rows).toEqual([
      { solde_restant_fcfa: 0, montant_rembourse_fcfa: 80000, statut: "rembourse" },
    ]);

    const historiques = await client.query(
      `SELECT montant_fcfa FROM remboursements_avances_membres
       WHERE avance_id = $1 ORDER BY id`,
      [avanceId],
    );
    expect(historiques.rows).toEqual([{ montant_fcfa: 80000 }]);
  });
});
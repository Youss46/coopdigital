import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { seederPlanSyscohadaPourCooperative } from "../services/planComptableService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

const expectedActiveAccounts = 1_342;

describe.skipIf(!enabled)("seeding du plan SYSCOHADA sur PostgreSQL", () => {
  let cooperativeId: number;
  const suffix = `${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    const result = await pool.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Plan SYSCOHADA idempotence ${suffix}`],
    );
    cooperativeId = result.rows[0].id;
  });

  beforeEach(async () => {
    await pool.query(
      `DELETE FROM plan_comptable WHERE cooperative_id = $1`,
      [cooperativeId],
    );
  });

  afterAll(async () => {
    if (!cooperativeId) return;

    await pool.query(
      `DELETE FROM plan_comptable WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await pool.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
  });

  it("insère les comptes attendus puis ne les réinsère pas", async () => {
    const premierChargement =
      await seederPlanSyscohadaPourCooperative(cooperativeId);

    expect(premierChargement.inseres).toBe(expectedActiveAccounts);
    expect(premierChargement.dejaPresents).toBe(0);

    const comptesApresPremierChargement = await pool.query(
      `SELECT numero_compte AS "numeroCompte", actif
       FROM plan_comptable
       WHERE cooperative_id = $1
       ORDER BY numero_compte`,
      [cooperativeId],
    );
    expect(comptesApresPremierChargement.rows).toHaveLength(
      expectedActiveAccounts,
    );
    expect(
      comptesApresPremierChargement.rows.every(
        (compte: { actif: boolean }) => compte.actif,
      ),
    ).toBe(true);
    expect(
      comptesApresPremierChargement.rows.map(
        (compte: { numeroCompte: string }) => compte.numeroCompte,
      ),
    ).toContain("101000");

    const secondChargement =
      await seederPlanSyscohadaPourCooperative(cooperativeId);

    expect(secondChargement.inseres).toBe(0);
    expect(secondChargement.dejaPresents).toBe(expectedActiveAccounts);

    const total = await pool.query(
      `SELECT count(*)::int AS count
       FROM plan_comptable
       WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    expect(total.rows[0].count).toBe(expectedActiveAccounts);
  });

  it("ne crée aucun doublon actif lors de deux chargements concurrents", async () => {
    const resultats = await Promise.all([
      seederPlanSyscohadaPourCooperative(cooperativeId),
      seederPlanSyscohadaPourCooperative(cooperativeId),
    ]);

    expect(
      resultats.reduce((total, resultat) => total + resultat.inseres, 0),
    ).toBe(expectedActiveAccounts);
    expect(
      resultats.every(
        (resultat) =>
          resultat.inseres + resultat.dejaPresents === expectedActiveAccounts,
      ),
    ).toBe(true);

    const doublonsActifs = await pool.query(
      `SELECT numero_compte AS "numeroCompte", count(*)::int AS count
       FROM plan_comptable
       WHERE cooperative_id = $1 AND actif = true
       GROUP BY numero_compte
       HAVING count(*) > 1`,
      [cooperativeId],
    );
    expect(doublonsActifs.rows).toHaveLength(0);

    const totalActif = await pool.query(
      `SELECT count(*)::int AS count
       FROM plan_comptable
       WHERE cooperative_id = $1 AND actif = true`,
      [cooperativeId],
    );
    expect(totalActif.rows[0].count).toBe(expectedActiveAccounts);
  });
});
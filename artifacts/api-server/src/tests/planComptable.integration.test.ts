import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  seederPlanSyscohadaPourCooperative,
  statutPlanSyscohada,
} from "../services/planComptableService.js";

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

  it("reprend un plan partiel sans écraser les personnalisations ni compter les historiques inactifs", async () => {
    await pool.query(
      `INSERT INTO plan_comptable
         (cooperative_id, numero_compte, libelle, type, classe, actif)
       VALUES
         ($1, '101000', 'Compte personnalisé conservé', 'passif', 1, true),
         ($1, '102000', 'Ancienne version historique', 'passif', 1, false)`,
      [cooperativeId],
    );

    const statutAvantChargement = await statutPlanSyscohada(cooperativeId);
    expect(statutAvantChargement).toEqual({
      attendu: expectedActiveAccounts,
      charges: 1,
      totalComptes: 1,
      complet: false,
    });

    const chargement =
      await seederPlanSyscohadaPourCooperative(cooperativeId);

    expect(chargement.inseres).toBe(expectedActiveAccounts - 1);
    expect(chargement.dejaPresents).toBe(1);

    const comptes = await pool.query(
      `SELECT numero_compte AS "numeroCompte", libelle, actif
       FROM plan_comptable
       WHERE cooperative_id = $1
       ORDER BY numero_compte, actif DESC`,
      [cooperativeId],
    );
    const comptesActifs = comptes.rows.filter(
      (compte: { actif: boolean }) => compte.actif,
    );

    expect(comptesActifs).toHaveLength(expectedActiveAccounts);
    expect(
      comptesActifs.filter(
        (compte: { numeroCompte: string }) =>
          compte.numeroCompte === "101000",
      ),
    ).toEqual([
      {
        numeroCompte: "101000",
        libelle: "Compte personnalisé conservé",
        actif: true,
      },
    ]);
    expect(
      comptes.rows.filter(
        (compte: { numeroCompte: string; actif: boolean }) =>
          compte.numeroCompte === "102000",
      ),
    ).toHaveLength(2);
    expect(
      comptes.rows.filter(
        (compte: { numeroCompte: string; actif: boolean }) =>
          compte.numeroCompte === "102000" && compte.actif,
      ),
    ).toHaveLength(1);
    expect(
      comptes.rows.filter(
        (compte: { numeroCompte: string; actif: boolean }) =>
          compte.numeroCompte === "102000" && !compte.actif,
      ),
    ).toEqual([
      {
        numeroCompte: "102000",
        libelle: "Ancienne version historique",
        actif: false,
      },
    ]);

    const statutApresChargement = await statutPlanSyscohada(cooperativeId);
    expect(statutApresChargement).toEqual({
      attendu: expectedActiveAccounts,
      charges: expectedActiveAccounts,
      totalComptes: expectedActiveAccounts,
      complet: true,
    });
  });
});

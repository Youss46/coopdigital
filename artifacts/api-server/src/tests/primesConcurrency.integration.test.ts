import { pool } from "@workspace/db";
import { payerMembre } from "../services/primesService";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

/**
 * This test deliberately uses two PostgreSQL connections. The calls go
 * through the production payment service, including its transaction, caisse
 * movement, and accounting entry handling.
 *
 * Run explicitly against a disposable PostgreSQL database:
 * RUN_POSTGRES_INTEGRATION=1 DATABASE_URL=... pnpm --filter @workspace/api-server test:integration
 */
describe.skipIf(!enabled)("paiements de primes concurrents sur PostgreSQL", () => {
  let first: any;
  let second: any;
  let cooperativeId: number;
  let memberId: number;
  let distributionId: number;
  let allocationId: number;
  let caisseId: number;
  let sessionId: number;
  let mobileDistributionId: number;
  let mobileAllocationId: number;
  let mobileAccountId: number;

  beforeAll(async () => {
    [first, second] = await Promise.all([pool.connect(), pool.connect()]);

    const coop = await first.query(
      `INSERT INTO cooperatives (nom, ville, region) VALUES ($1, $2, $3) RETURNING id`,
      [`Prime concurrency ${process.pid}`, "Test", "Test"],
    );
    cooperativeId = coop.rows[0].id;

    const member = await first.query(
      `INSERT INTO membres
        (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [cooperativeId, "Test", "Prime", `070000${process.pid}`, "1", "2026-01-01"],
    );
    memberId = member.rows[0].id;

    const reception = await first.query(
      `INSERT INTO primes_receptions
        (cooperative_id, type_prime, montant_total_fcfa, date_reception, statut)
       VALUES ($1, 'qualite', $2, $3, 'distribuee')
       RETURNING id`,
      [cooperativeId, 1000, "2026-01-01"],
    );
    const receptionId = reception.rows[0].id;

    const distribution = await first.query(
      `INSERT INTO primes_distributions
        (cooperative_id, prime_reception_id, date_distribution,
         tonnage_total_kg, montant_brut_fcfa, montant_frais_fcfa,
         montant_distribue_fcfa, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'validee')
       RETURNING id`,
      [cooperativeId, receptionId, "2026-01-01", "1", 1000, 0, 1000],
    );
    distributionId = distribution.rows[0].id;

    const allocation = await first.query(
      `INSERT INTO primes_membres
        (cooperative_id, distribution_id, membre_id, tonnage_kg,
         montant_brut_fcfa, deduction_avances_fcfa, deduction_frais_fcfa,
         montant_net_fcfa, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'en_attente')
       RETURNING id`,
      [cooperativeId, distributionId, memberId, "1", 1000, 0, 0, 1000],
    );
    allocationId = allocation.rows[0].id;

    const caisse = await first.query(
      `INSERT INTO caisses
        (cooperative_id, nom, type_caisse, solde_actuel_fcfa, fond_caisse_minimum_fcfa, actif)
       VALUES ($1, $2, 'centrale', $3, 0, true)
       RETURNING id`,
      [cooperativeId, "Caisse prime concurrency", "5000"],
    );
    caisseId = caisse.rows[0].id;

    const session = await first.query(
      `INSERT INTO sessions_caisse
        (caisse_id, cooperative_id, date_session, solde_ouverture_fcfa, statut)
       VALUES ($1, $2, CURRENT_DATE, $3, 'ouverte')
       RETURNING id`,
      [caisseId, cooperativeId, "5000"],
    );
    sessionId = session.rows[0].id;

    await first.query(
      `INSERT INTO config_comptable (cooperative_id, auto_primes)
       VALUES ($1, true)`,
      [cooperativeId],
    );

    const mobileReception = await first.query(
      `INSERT INTO primes_receptions
        (cooperative_id, type_prime, montant_total_fcfa, date_reception, statut)
       VALUES ($1, 'qualite', $2, $3, 'distribuee')
       RETURNING id`,
      [cooperativeId, 1000, "2026-01-01"],
    );
    const mobileDistribution = await first.query(
      `INSERT INTO primes_distributions
        (cooperative_id, prime_reception_id, date_distribution,
         tonnage_total_kg, montant_brut_fcfa, montant_frais_fcfa,
         montant_distribue_fcfa, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'validee')
       RETURNING id`,
      [cooperativeId, mobileReception.rows[0].id, "2026-01-01", "1", 1000, 0, 1000],
    );
    mobileDistributionId = mobileDistribution.rows[0].id;

    const mobileAllocation = await first.query(
      `INSERT INTO primes_membres
        (cooperative_id, distribution_id, membre_id, tonnage_kg,
         montant_brut_fcfa, deduction_avances_fcfa, deduction_frais_fcfa,
         montant_net_fcfa, statut)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'en_attente')
       RETURNING id`,
      [cooperativeId, mobileDistributionId, memberId, "1", 1000, 0, 0, 1000],
    );
    mobileAllocationId = mobileAllocation.rows[0].id;

    const mobileAccount = await first.query(
      `INSERT INTO comptes_mobiles_marchands
        (cooperative_id, nom, operateur, numero_marchand,
         solde_actuel_fcfa, solde_mini_alerte_fcfa, actif)
       VALUES ($1, $2, 'orange_money', $3, $4, 0, true)
       RETURNING id`,
      [cooperativeId, "Compte prime concurrency", `070000${process.pid}`, "5000"],
    );
    mobileAccountId = mobileAccount.rows[0].id;
  });

  afterAll(async () => {
    await first.query(`
      DELETE FROM ecritures_comptables
        WHERE cooperative_id = ${cooperativeId} AND source_id IN (${allocationId}, ${mobileAllocationId});
      DELETE FROM mouvements_caisse WHERE caisse_id = ${caisseId};
      DELETE FROM mouvements_mobile_marchand WHERE compte_id = ${mobileAccountId};
      DELETE FROM comptes_mobiles_marchands WHERE id = ${mobileAccountId};
      DELETE FROM sessions_caisse WHERE id = ${sessionId};
      DELETE FROM caisses WHERE id = ${caisseId};
      DELETE FROM primes_membres WHERE id = ${allocationId};
      DELETE FROM primes_membres WHERE id = ${mobileAllocationId};
      DELETE FROM primes_distributions WHERE id = ${distributionId};
      DELETE FROM primes_distributions WHERE id = ${mobileDistributionId};
      DELETE FROM primes_receptions WHERE cooperative_id = ${cooperativeId};
      DELETE FROM config_comptable WHERE cooperative_id = ${cooperativeId};
      DELETE FROM membres WHERE id = ${memberId};
      DELETE FROM cooperatives WHERE id = ${cooperativeId};
    `);
    first.release();
    second.release();
  });

  it("fait attendre le second paiement puis le refuse sans double effet financier", async () => {
    const payment = () => payerMembre(cooperativeId, allocationId, {
      modePaiement: "especes",
      datePaiement: "2026-01-02",
    }, 0);

    const results = await Promise.allSettled([payment(), payment()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason.message : "").toBe("Déjà payé");

    const [allocation, movements, accounting] = await Promise.all([
      first.query(`SELECT statut FROM primes_membres WHERE id = $1`, [allocationId]),
      first.query(
        `SELECT count(*)::int AS count FROM mouvements_caisse
         WHERE caisse_id = $1 AND motif = 'paiement_prime'`,
        [caisseId],
      ),
      first.query(
        `SELECT count(*)::int AS count FROM ecritures_comptables
         WHERE cooperative_id = $1 AND source = 'paiement' AND source_id = $2`,
        [cooperativeId, allocationId],
      ),
    ]);
    expect(allocation.rows[0].statut).toBe("paye");
    expect(movements.rows[0].count).toBe(1);
    expect(accounting.rows[0].count).toBe(1);
  });

  it("refuse le second paiement mobile sans double mouvement ni écriture", async () => {
    const payment = () => payerMembre(cooperativeId, mobileAllocationId, {
      modePaiement: "orange_money",
      datePaiement: "2026-01-02",
    }, 0);

    const results = await Promise.allSettled([payment(), payment()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason.message : "").toBe("Déjà payé");

    const [allocation, account, movements, accounting] = await Promise.all([
      first.query(`SELECT statut FROM primes_membres WHERE id = $1`, [mobileAllocationId]),
      first.query(`SELECT solde_actuel_fcfa FROM comptes_mobiles_marchands WHERE id = $1`, [mobileAccountId]),
      first.query(
        `SELECT count(*)::int AS count FROM mouvements_mobile_marchand
         WHERE compte_id = $1 AND motif = 'paiement_prime'`,
        [mobileAccountId],
      ),
      first.query(
        `SELECT count(*)::int AS count FROM ecritures_comptables
         WHERE cooperative_id = $1 AND source = 'paiement' AND source_id = $2`,
        [cooperativeId, mobileAllocationId],
      ),
    ]);
    expect(allocation.rows[0].statut).toBe("paye");
    expect(account.rows[0].solde_actuel_fcfa).toBe("4000");
    expect(movements.rows[0].count).toBe(1);
    expect(accounting.rows[0].count).toBe(1);
  });
});
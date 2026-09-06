import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  annulerReglementCarteProducteur,
  payerReglementCarteProducteur,
  rejeterReglementCarteProducteur,
} from "../services/reglementsCartesProducteursService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

/**
 * These tests deliberately call the production settlement service concurrently
 * through independent pool connections. Run against a disposable PostgreSQL
 * database:
 *
 * RUN_POSTGRES_INTEGRATION=1 DATABASE_URL=... \
 *   pnpm --filter @workspace/api-server test:integration
 */
describe.skipIf(!enabled)(
  "règlements cartes producteurs concurrents sur PostgreSQL",
  () => {
    let client: any;
    let cooperativeId: number;
    let otherCooperativeId: number;
    let memberId: number;
    let userId: number;
    let otherBankAccountId: number;

    const suffix = `${process.pid}_${Date.now()}`;
    let fixtureSequence = 0;

    async function querySequentially(
      queries: Array<() => Promise<any>>,
    ): Promise<any[]> {
      const results: any[] = [];
      for (const query of queries) {
        results.push(await query());
      }
      return results;
    }

    beforeAll(async () => {
      client = await pool.connect();

      const cooperative = await client.query(
        `INSERT INTO cooperatives (nom, ville, region)
         VALUES ($1, 'Test', 'Test')
         RETURNING id`,
        [`Cartes producteurs concurrency ${suffix}`],
      );
      cooperativeId = cooperative.rows[0].id;

      const otherCooperative = await client.query(
        `INSERT INTO cooperatives (nom, ville, region)
         VALUES ($1, 'Test', 'Test')
         RETURNING id`,
        [`Cartes producteurs autre coop ${suffix}`],
      );
      otherCooperativeId = otherCooperative.rows[0].id;

      const user = await client.query(
        `INSERT INTO users
           (cooperative_id, nom, prenoms, email, password_hash, role)
         VALUES ($1, 'Auteur', 'Carte', $2, 'integration-only', 'comptable')
         RETURNING id`,
        [cooperativeId, `cartes-producteurs-${suffix}@example.test`],
      );
      userId = user.rows[0].id;

      const member = await client.query(
        `INSERT INTO membres
           (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion)
         VALUES ($1, 'Producteur', 'Carte', $2, 1, '2026-01-01')
         RETURNING id`,
        [cooperativeId, `070000${process.pid}`],
      );
      memberId = member.rows[0].id;

      await client.query(
        `INSERT INTO config_comptable (cooperative_id, auto_banque)
         VALUES ($1, true)`,
        [cooperativeId],
      );

      const otherAccount = await client.query(
        `INSERT INTO comptes_bancaires
           (cooperative_id, nom, banque, solde_actuel_fcfa,
            solde_mini_alerte_fcfa, actif)
         VALUES ($1, 'Compte autre coop', 'Banque test', 500000, 0, true)
         RETURNING id`,
        [otherCooperativeId],
      );
      otherBankAccountId = otherAccount.rows[0].id;
    });

    async function createSettlement(options?: {
      amount?: number;
      balance?: number;
      active?: boolean;
    }): Promise<{ settlementId: number; bankAccountId: number; paymentId: number }> {
      const amount = options?.amount ?? 125_000;
      const balance = options?.balance ?? 500_000;
      const active = options?.active ?? true;
      const sequence = ++fixtureSequence;

      const account = await client.query(
        `INSERT INTO comptes_bancaires
           (cooperative_id, nom, banque, solde_actuel_fcfa,
            solde_mini_alerte_fcfa, actif)
         VALUES ($1, $2, 'Banque test', $3, 0, $4)
         RETURNING id`,
        [
          cooperativeId,
          `Compte règlement ${suffix}_${sequence}`,
          balance,
          active,
        ],
      );
      const bankAccountId = account.rows[0].id;

      const payment = await client.query(
        `INSERT INTO paiements
           (cooperative_id, membre_id, numero_recu, montant_fcfa,
            mode_paiement, statut)
         VALUES ($1, $2, $3, $4, 'carte_producteur', 'en_attente')
         RETURNING id`,
        [
          cooperativeId,
          memberId,
          `REC-CARTE-${suffix}-${sequence}`,
          amount,
        ],
      );
      const paymentId = payment.rows[0].id;

      const settlement = await client.query(
        `INSERT INTO reglements_cartes_producteurs
           (cooperative_id, paiement_id, paiement_ligne_id, membre_id,
            numero_carte_snapshot, beneficiaire, montant_fcfa, date_creation)
         VALUES ($1, $2, $2, $3, 'CARD-TEST', 'Producteur Carte', $4, CURRENT_DATE)
         RETURNING id`,
        [cooperativeId, paymentId, memberId, amount],
      );

      return {
        settlementId: settlement.rows[0].id,
        bankAccountId,
        paymentId,
      };
    }

    afterAll(async () => {
      try {
        if (!client || !cooperativeId) return;

        await client.query("BEGIN");
        try {
          await client.query(
            `DELETE FROM ecritures_comptables
             WHERE cooperative_id IN ($1, $2)`,
            [cooperativeId, otherCooperativeId],
          );
          await client.query(
            `DELETE FROM ecritures_en_attente
             WHERE cooperative_id IN ($1, $2)`,
            [cooperativeId, otherCooperativeId],
          );
          await client.query(
            `DELETE FROM mouvements_banque
             WHERE cooperative_id IN ($1, $2)`,
            [cooperativeId, otherCooperativeId],
          );
          await client.query(
            `DELETE FROM reglements_cartes_producteurs
             WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM paiements WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM comptes_bancaires
             WHERE cooperative_id IN ($1, $2)`,
            [cooperativeId, otherCooperativeId],
          );
          await client.query(
            `DELETE FROM config_comptable WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(`DELETE FROM membres WHERE cooperative_id = $1`, [
            cooperativeId,
          ]);
          await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
          await client.query(`DELETE FROM cooperatives WHERE id IN ($1, $2)`, [
            cooperativeId,
            otherCooperativeId,
          ]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => undefined);
          throw error;
        }
      } finally {
        client?.release();
      }
    });

    it("ne débite qu'une seule fois lors de deux paiements concurrents", async () => {
      const fixture = await createSettlement();
      const pay = () =>
        payerReglementCarteProducteur(
          fixture.settlementId,
          cooperativeId,
          { compteBancaireId: fixture.bankAccountId, datePaiement: "2026-09-06" },
          userId,
        );

      const results = await Promise.allSettled([pay(), pay()]);

      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected");
      expect(rejected?.status === "rejected" ? rejected.reason.message : "").toBe(
        "Seul un règlement carte producteur en attente peut être marqué payé",
      );

      const [settlement, payment, account, movements] = await querySequentially([
        () => client.query(
          `SELECT statut, mouvement_banque_id, compte_bancaire_id
           FROM reglements_cartes_producteurs
           WHERE id = $1`,
          [fixture.settlementId],
        ),
        () => client.query(`SELECT statut FROM paiements WHERE id = $1`, [
          fixture.paymentId,
        ]),
        () => client.query(
          `SELECT solde_actuel_fcfa
           FROM comptes_bancaires
           WHERE id = $1`,
          [fixture.bankAccountId],
        ),
        () => client.query(
          `SELECT count(*)::int AS count, COALESCE(SUM(montant_fcfa), 0)::numeric AS total
           FROM mouvements_banque
           WHERE compte_id = $1
             AND motif = 'paiement_carte_producteur'
             AND reference = $2`,
          [fixture.bankAccountId, `CARTE-${fixture.settlementId}`],
        ),
      ]);

      expect(settlement.rows).toEqual([
        {
          statut: "paye",
          mouvement_banque_id: expect.any(Number),
          compte_bancaire_id: fixture.bankAccountId,
        },
      ]);
      expect(payment.rows[0].statut).toBe("effectue");
      expect(account.rows[0].solde_actuel_fcfa).toBe("375000");
      expect(movements.rows).toEqual([{ count: 1, total: "125000" }]);
    });

    it("refuse un compte bancaire d'une autre coopérative sans effet", async () => {
      const fixture = await createSettlement();

      await expect(
        payerReglementCarteProducteur(
          fixture.settlementId,
          cooperativeId,
          { compteBancaireId: otherBankAccountId },
          userId,
        ),
      ).rejects.toThrow("Compte bancaire introuvable");

      const [settlement, payment, movements] = await querySequentially([
        () => client.query(
          `SELECT statut, mouvement_banque_id
           FROM reglements_cartes_producteurs
           WHERE id = $1`,
          [fixture.settlementId],
        ),
        () => client.query(`SELECT statut FROM paiements WHERE id = $1`, [
          fixture.paymentId,
        ]),
        () => client.query(
          `SELECT count(*)::int AS count
           FROM mouvements_banque
           WHERE motif = 'paiement_carte_producteur'
             AND reference = $1`,
          [`CARTE-${fixture.settlementId}`],
        ),
      ]);

      expect(settlement.rows).toEqual([
        { statut: "en_attente", mouvement_banque_id: null },
      ]);
      expect(payment.rows[0].statut).toBe("en_attente");
      expect(movements.rows[0].count).toBe(0);
    });

    it.each([
      {
        label: "un compte inactif",
        options: { active: false },
        expectedError: "Compte bancaire inactif",
      },
      {
        label: "un solde insuffisant",
        options: { amount: 125_000, balance: 100_000 },
        expectedError: "Solde bancaire insuffisant",
      },
    ])("refuse $label sans mouvement ni changement de statut", async ({
      options,
      expectedError,
    }) => {
      const fixture = await createSettlement(options);

      await expect(
        payerReglementCarteProducteur(
          fixture.settlementId,
          cooperativeId,
          { compteBancaireId: fixture.bankAccountId },
          userId,
        ),
      ).rejects.toThrow(expectedError);

      const [settlement, payment, account, movements] = await querySequentially([
        () => client.query(
          `SELECT statut, mouvement_banque_id
           FROM reglements_cartes_producteurs
           WHERE id = $1`,
          [fixture.settlementId],
        ),
        () => client.query(`SELECT statut FROM paiements WHERE id = $1`, [
          fixture.paymentId,
        ]),
        () => client.query(
          `SELECT solde_actuel_fcfa FROM comptes_bancaires WHERE id = $1`,
          [fixture.bankAccountId],
        ),
        () => client.query(
          `SELECT count(*)::int AS count
           FROM mouvements_banque
           WHERE compte_id = $1`,
          [fixture.bankAccountId],
        ),
      ]);

      expect(settlement.rows).toEqual([
        { statut: "en_attente", mouvement_banque_id: null },
      ]);
      expect(payment.rows[0].statut).toBe("en_attente");
      expect(account.rows[0].solde_actuel_fcfa).toBe(
        String(options.balance ?? 500_000),
      );
      expect(movements.rows[0].count).toBe(0);
    });

    it("ne débite pas les règlements rejetés ou annulés", async () => {
      const rejectedFixture = await createSettlement();
      const cancelledFixture = await createSettlement();

      await rejeterReglementCarteProducteur(
        rejectedFixture.settlementId,
        cooperativeId,
        "Carte invalide",
      );
      await annulerReglementCarteProducteur(
        cancelledFixture.settlementId,
        cooperativeId,
        "Paiement remplacé",
      );

      const [settlements, payments, movements] = await querySequentially([
        () => client.query(
          `SELECT id, statut, mouvement_banque_id
           FROM reglements_cartes_producteurs
           WHERE id IN ($1, $2)
           ORDER BY id`,
          [rejectedFixture.settlementId, cancelledFixture.settlementId],
        ),
        () => client.query(
          `SELECT id, statut
           FROM paiements
           WHERE id IN ($1, $2)
           ORDER BY id`,
          [rejectedFixture.paymentId, cancelledFixture.paymentId],
        ),
        () => client.query(
          `SELECT count(*)::int AS count
           FROM mouvements_banque
           WHERE motif = 'paiement_carte_producteur'
             AND reference IN ($1, $2)`,
          [
            `CARTE-${rejectedFixture.settlementId}`,
            `CARTE-${cancelledFixture.settlementId}`,
          ],
        ),
      ]);

      expect(settlements.rows).toEqual([
        {
          id: rejectedFixture.settlementId,
          statut: "rejete",
          mouvement_banque_id: null,
        },
        {
          id: cancelledFixture.settlementId,
          statut: "annule",
          mouvement_banque_id: null,
        },
      ]);
      expect(payments.rows).toEqual([
        { id: rejectedFixture.paymentId, statut: "en_attente" },
        { id: cancelledFixture.paymentId, statut: "en_attente" },
      ]);
      expect(movements.rows[0].count).toBe(0);
    });
  },
);
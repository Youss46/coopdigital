import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { validerLotPaiementsCarburant } from "../controllers/paiementsController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type TestResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => TestResponse;
  json: (body: unknown) => TestResponse;
};

function response(): TestResponse {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      result.statusCode = code;
      return result;
    },
    json(body: unknown) {
      result.body = body;
      return result;
    },
  };
  return result;
}

describe.skipIf(!enabled)("règlement groupé carburant sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let userId: number;
  let vehicleId: number;
  let caisseId: number;
  let openingBalance: number;
  const bonIds: number[] = [];
  const paymentIds: number[] = [];

  beforeAll(async () => {
    client = await pool.connect();

    const suffix = `${process.pid}_${Date.now()}`;
    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Règlement carburant groupé ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Test', 'Règlement carburant', $2, 'integration-test', 'comptable')
       RETURNING id`,
      [cooperativeId, `carburant-lot-${suffix}@test.invalid`],
    );
    userId = user.rows[0].id;

    const vehicle = await client.query(
      `INSERT INTO vehicules
         (cooperative_id, immatriculation, marque, modele, type)
       VALUES ($1, $2, 'Test', 'Carburant', 'camion')
       RETURNING id`,
      [cooperativeId, `CARB-${suffix}`],
    );
    vehicleId = vehicle.rows[0].id;

    openingBalance = 1_000_000;
    const caisse = await client.query(
      `INSERT INTO caisses
         (cooperative_id, nom, type_caisse, solde_actuel_fcfa,
          fond_caisse_minimum_fcfa, actif)
       VALUES ($1, 'Caisse règlement carburant', 'centrale', $2, 0, true)
       RETURNING id`,
      [cooperativeId, openingBalance],
    );
    caisseId = caisse.rows[0].id;

    await client.query(
      `INSERT INTO sessions_caisse
         (caisse_id, cooperative_id, date_session, solde_ouverture_fcfa, statut)
       VALUES ($1, $2, CURRENT_DATE, $3, 'ouverte')`,
      [caisseId, cooperativeId, openingBalance],
    );

    await client.query(
      `INSERT INTO config_comptable (cooperative_id, auto_paiements)
       VALUES ($1, true)`,
      [cooperativeId],
    );
  });

  afterAll(async () => {
    if (!client || !cooperativeId) {
      client?.release();
      return;
    }

    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM ecritures_comptables
         WHERE cooperative_id = $1 AND source = 'paiement'
           AND source_id = ANY($2::int[])`,
        [cooperativeId, paymentIds],
      );
      await client.query(
        `DELETE FROM ecritures_en_attente
         WHERE cooperative_id = $1 AND source = 'paiement'
           AND source_id = ANY($2::int[])`,
        [cooperativeId, paymentIds],
      );
      await client.query(
        `DELETE FROM paiement_lignes
         WHERE paiement_id = ANY($1::int[])`,
        [paymentIds],
      );
      await client.query(
        `DELETE FROM paiements
         WHERE id = ANY($1::int[])`,
        [paymentIds],
      );
      await client.query(
        `DELETE FROM bons_carburant
         WHERE id = ANY($1::int[])`,
        [bonIds],
      );
      await client.query(
        `DELETE FROM sessions_caisse WHERE caisse_id = $1`,
        [caisseId],
      );
      await client.query(
        `DELETE FROM caisses WHERE id = $1`,
        [caisseId],
      );
      await client.query(
        `DELETE FROM config_comptable WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM vehicules WHERE id = $1`,
        [vehicleId],
      );
      await client.query(
        `DELETE FROM users WHERE id = $1`,
        [userId],
      );
      await client.query(
        `DELETE FROM cooperatives WHERE id = $1`,
        [cooperativeId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  async function createPayment(
    amount: number,
    statut: "en_attente" | "effectue" = "en_attente",
  ): Promise<number> {
    const suffix = `${process.pid}_${Date.now()}_${bonIds.length}`;
    const bon = await client.query(
      `INSERT INTO bons_carburant
         (cooperative_id, numero, vehicule_id, type_carburant,
          montant_autorise_fcfa, date_emission, statut, created_by)
       VALUES ($1, $2, $3, 'gasoil', $4, CURRENT_DATE, 'utilise', $5)
       RETURNING id`,
      [
        cooperativeId,
        `BC-LOT-${suffix}`,
        vehicleId,
        amount,
        userId,
      ],
    );
    const bonId = bon.rows[0].id as number;
    bonIds.push(bonId);

    const payment = await client.query(
      `INSERT INTO paiements
         (cooperative_id, bon_carburant_id, numero_recu, montant_fcfa, statut,
          date_validation)
       VALUES ($1, $2, $3, $4, $5::paiement_statut,
               CASE WHEN $5::paiement_statut = 'effectue' THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING id`,
      [cooperativeId, bonId, `REC-CARB-${suffix}`, amount, statut],
    );
    const paymentId = payment.rows[0].id as number;
    paymentIds.push(paymentId);
    return paymentId;
  }

  function request(body: unknown) {
    return {
      body,
      user: { cooperativeId, id: userId, role: "comptable" },
      log: { error: () => undefined },
    } as any;
  }

  async function validateLot(
    paiementIds: number[],
    referenceTransaction: string,
  ): Promise<TestResponse> {
    const res = response();
    await validerLotPaiementsCarburant(
      request({
        paiementIds,
        modePaiement: "especes",
        referenceTransaction,
      }),
      res as any,
    );
    return res;
  }

  it("débite une seule fois la caisse et conserve les détails individuels", async () => {
    const firstPaymentId = await createPayment(12_500);
    const secondPaymentId = await createPayment(7_500);
    const reference = `CARB-LOT-${process.pid}-NOMINAL`;

    const result = await validateLot(
      [firstPaymentId, secondPaymentId],
      reference,
    );

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      reference,
      paiementIds: [firstPaymentId, secondPaymentId],
      nombrePaiements: 2,
      montantTotal: 20_000,
      statut: "effectue",
    });

    await expect(
      client.query(
        `SELECT statut, mode_paiement, reference_transaction
         FROM paiements
         WHERE id = ANY($1::int[])
         ORDER BY id`,
        [[firstPaymentId, secondPaymentId]],
      ),
    ).resolves.toMatchObject({
      rows: [
        { statut: "effectue", mode_paiement: "especes", reference_transaction: reference },
        { statut: "effectue", mode_paiement: "especes", reference_transaction: reference },
      ],
    });

    await expect(
      client.query(
        `SELECT mode_paiement, montant_fcfa, reference_transaction
         FROM paiement_lignes
         WHERE paiement_id = ANY($1::int[])
         ORDER BY paiement_id`,
        [[firstPaymentId, secondPaymentId]],
      ),
    ).resolves.toMatchObject({
      rows: [
        { mode_paiement: "especes", montant_fcfa: 12_500, reference_transaction: reference },
        { mode_paiement: "especes", montant_fcfa: 7_500, reference_transaction: reference },
      ],
    });

    await expect(
      client.query(
        `SELECT source_id, compte_debit, compte_credit, montant_fcfa, numero_piece
         FROM ecritures_comptables
         WHERE cooperative_id = $1
           AND source = 'paiement'
           AND source_id = ANY($2::int[])
         ORDER BY source_id`,
        [cooperativeId, [firstPaymentId, secondPaymentId]],
      ),
    ).resolves.toMatchObject({
      rows: [
        {
          source_id: firstPaymentId,
          compte_debit: "6042",
          compte_credit: "571",
          montant_fcfa: 12_500,
          numero_piece: `PAI-${firstPaymentId}`,
        },
        {
          source_id: secondPaymentId,
          compte_debit: "6042",
          compte_credit: "571",
          montant_fcfa: 7_500,
          numero_piece: `PAI-${secondPaymentId}`,
        },
      ],
    });

    await expect(
      client.query(
        `SELECT count(*)::int AS count, COALESCE(sum(montant_fcfa), 0)::int AS total
         FROM mouvements_caisse
         WHERE caisse_id = $1
           AND motif = 'carburant'
           AND reference_operation = $2`,
        [caisseId, reference],
      ),
    ).resolves.toMatchObject({
      rows: [{ count: 1, total: 20_000 }],
    });

    await expect(
      client.query(
        `SELECT solde_actuel_fcfa
         FROM caisses
         WHERE id = $1`,
        [caisseId],
      ),
    ).resolves.toMatchObject({
      rows: [{ solde_actuel_fcfa: "980000" }],
    });
  });

  it("refuse un lot contenant un paiement déjà traité sans débit partiel", async () => {
    const treatedPaymentId = await createPayment(4_000, "effectue");
    const pendingPaymentId = await createPayment(6_000);
    const reference = `CARB-LOT-${process.pid}-REJECTED`;

    const before = await client.query(
      `SELECT solde_actuel_fcfa,
              (SELECT count(*)::int FROM mouvements_caisse
               WHERE caisse_id = $1) AS movement_count
       FROM caisses
       WHERE id = $1`,
      [caisseId],
    );

    const result = await validateLot(
      [treatedPaymentId, pendingPaymentId],
      reference,
    );

    expect(result.statusCode).toBe(409);
    expect(result.body).toMatchObject({
      erreur: expect.stringContaining("déjà été réglés"),
    });

    await expect(
      client.query(
        `SELECT statut, mode_paiement, reference_transaction
         FROM paiements
         WHERE id = $1`,
        [pendingPaymentId],
      ),
    ).resolves.toMatchObject({
      rows: [{
        statut: "en_attente",
        mode_paiement: null,
        reference_transaction: null,
      }],
    });

    await expect(
      client.query(
        `SELECT count(*)::int AS count
         FROM mouvements_caisse
         WHERE caisse_id = $1
           AND reference_operation = $2`,
        [caisseId, reference],
      ),
    ).resolves.toMatchObject({ rows: [{ count: 0 }] });

    await expect(
      client.query(
        `SELECT solde_actuel_fcfa,
                (SELECT count(*)::int FROM mouvements_caisse
                 WHERE caisse_id = $1) AS movement_count
         FROM caisses
         WHERE id = $1`,
        [caisseId],
      ),
    ).resolves.toMatchObject({
      rows: [{
        solde_actuel_fcfa: before.rows[0].solde_actuel_fcfa,
        movement_count: before.rows[0].movement_count,
      }],
    });
  });

  it("ne débite qu'une seule fois lors de deux validations concurrentes du même lot", async () => {
    const firstPaymentId = await createPayment(9_000);
    const secondPaymentId = await createPayment(6_000);
    const reference = `CARB-LOT-${process.pid}-CONCURRENT`;
    const delayFunction = `task192_caisse_delay_${process.pid}_${Date.now()}`;
    const delayTrigger = `task192_caisse_delay_trigger_${process.pid}_${Date.now()}`;
    const identifier = (value: string) => `"${value.replaceAll(`"`, `""`)}"`;

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
      BEFORE UPDATE OF solde_actuel_fcfa ON caisses
      FOR EACH ROW
      WHEN (OLD.id = ${caisseId})
      EXECUTE FUNCTION ${identifier(delayFunction)}();
    `);

    try {
      const results = await Promise.all([
        validateLot([firstPaymentId, secondPaymentId], reference),
        validateLot([secondPaymentId, firstPaymentId], reference),
      ]);

      expect(results.filter((result) => result.statusCode === 200)).toHaveLength(1);
      expect(results.filter((result) => result.statusCode === 409)).toHaveLength(1);

      await expect(
        client.query(
          `SELECT count(*)::int AS count, COALESCE(sum(montant_fcfa), 0)::int AS total
           FROM mouvements_caisse
           WHERE caisse_id = $1
             AND motif = 'carburant'
             AND reference_operation = $2`,
          [caisseId, reference],
        ),
      ).resolves.toMatchObject({
        rows: [{ count: 1, total: 15_000 }],
      });

      await expect(
        client.query(
          `SELECT solde_actuel_fcfa
           FROM caisses
           WHERE id = $1`,
          [caisseId],
        ),
      ).resolves.toMatchObject({
        rows: [{ solde_actuel_fcfa: "965000" }],
      });

      await expect(
        client.query(
          `SELECT paiement_id, count(*)::int AS count
           FROM paiement_lignes
           WHERE paiement_id = ANY($1::int[])
           GROUP BY paiement_id
           ORDER BY paiement_id`,
          [[firstPaymentId, secondPaymentId]],
        ),
      ).resolves.toMatchObject({
        rows: [
          { paiement_id: firstPaymentId, count: 1 },
          { paiement_id: secondPaymentId, count: 1 },
        ],
      });

      await expect(
        client.query(
          `SELECT source_id, count(*)::int AS count
           FROM ecritures_comptables
           WHERE cooperative_id = $1
             AND source = 'paiement'
             AND source_id = ANY($2::int[])
           GROUP BY source_id
           ORDER BY source_id`,
          [cooperativeId, [firstPaymentId, secondPaymentId]],
        ),
      ).resolves.toMatchObject({
        rows: [
          { source_id: firstPaymentId, count: 1 },
          { source_id: secondPaymentId, count: 1 },
        ],
      });
    } finally {
      await client.query(`
        DROP TRIGGER IF EXISTS ${identifier(delayTrigger)} ON caisses;
        DROP FUNCTION IF EXISTS ${identifier(delayFunction)}();
      `);
    }
  });
});

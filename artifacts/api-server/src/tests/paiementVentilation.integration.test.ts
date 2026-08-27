import { pool } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validerPaiement } from "../controllers/paiementsController.js";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

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

describe.skipIf(!enabled)("règlement ventilé atomique sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let memberId: number;
  let caisseId: number;
  let sessionId: number;
  const paymentIds: number[] = [];
  const deliveryIds: number[] = [];

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, $2, $3) RETURNING id`,
      [`Ventilation atomique ${process.pid}`, "Test", "Test"],
    );
    cooperativeId = cooperative.rows[0].id;

    const member = await client.query(
      `INSERT INTO membres
        (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [cooperativeId, "Test", "Ventilation", `070001${process.pid}`, "1", "2026-01-01"],
    );
    memberId = member.rows[0].id;

    await client.query(
      `INSERT INTO config_comptable (cooperative_id, auto_paiements)
       VALUES ($1, true)`,
      [cooperativeId],
    );

    const caisse = await client.query(
      `INSERT INTO caisses
        (cooperative_id, nom, type_caisse, solde_actuel_fcfa,
         fond_caisse_minimum_fcfa, actif)
       VALUES ($1, $2, 'centrale', $3, 0, true)
       RETURNING id`,
      [cooperativeId, "Caisse ventilation atomique", "50000"],
    );
    caisseId = caisse.rows[0].id;

    const session = await client.query(
      `INSERT INTO sessions_caisse
        (caisse_id, cooperative_id, date_session, solde_ouverture_fcfa, statut)
       VALUES ($1, $2, CURRENT_DATE, $3, 'ouverte')
       RETURNING id`,
      [caisseId, cooperativeId, "50000"],
    );
    sessionId = session.rows[0].id;
  });

  afterAll(async () => {
    await client.query(`DELETE FROM cheques_emis WHERE paiement_id = ANY($1::int[])`, [paymentIds]);
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
    await client.query(`DELETE FROM mouvements_caisse WHERE caisse_id = $1`, [caisseId]);
    await client.query(`DELETE FROM paiements WHERE id = ANY($1::int[])`, [paymentIds]);
    await client.query(`DELETE FROM livraisons WHERE id = ANY($1::int[])`, [deliveryIds]);
    await client.query(`DELETE FROM sessions_caisse WHERE id = $1`, [sessionId]);
    await client.query(`DELETE FROM caisses WHERE id = $1`, [caisseId]);
    await client.query(`DELETE FROM config_comptable WHERE cooperative_id = $1`, [cooperativeId]);
    await client.query(`DELETE FROM membres WHERE id = $1`, [memberId]);
    await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
    client.release();
  });

  async function createPayment(amount: number): Promise<number> {
    const result = await client.query(
      `INSERT INTO paiements (membre_id, montant_fcfa, statut)
       VALUES ($1, $2, 'en_attente')
       RETURNING id`,
      [memberId, amount],
    );
    const id = result.rows[0].id;
    paymentIds.push(id);
    return id;
  }

  async function createDeferredPayment(amount: number): Promise<number> {
    const livraison = await client.query(
      `INSERT INTO livraisons
        (membre_id, poids_kg, prix_unitaire_fcfa, montant_brut_fcfa,
         avance_deduite_fcfa, intrants_deduits_fcfa, montant_net_fcfa,
         date_livraison, statut_paiement, montant_restant)
       VALUES ($1, 1, $2, $3, 0, 0, $3, CURRENT_DATE, 'EN_ATTENTE', $3)
       RETURNING id`,
      [memberId, amount, amount],
    );
    const livraisonId = livraison.rows[0].id as number;
    deliveryIds.push(livraisonId);
    const payment = await client.query(
      `INSERT INTO paiements (livraison_id, membre_id, montant_fcfa, statut)
       VALUES ($1, $2, $3, 'en_attente')
       RETURNING id`,
      [livraisonId, memberId, amount],
    );
    const id = payment.rows[0].id as number;
    paymentIds.push(id);
    return id;
  }

  function request(paymentId: number, body: unknown) {
    return {
      params: { id: String(paymentId) },
      body,
      user: { cooperativeId, id: undefined, role: "comptable" },
      log: { error: () => undefined },
    } as any;
  }

  async function validate(paymentId: number, body: unknown): Promise<TestResponse> {
    const res = response();
    await validerPaiement(request(paymentId, body), res as any);
    return res;
  }

  async function paymentEffects(paymentId: number) {
    const [payment, lines, movements, cheques, accounting] = await Promise.all([
      pool.query(`SELECT statut FROM paiements WHERE id = $1`, [paymentId]),
      pool.query(`SELECT count(*)::int AS count FROM paiement_lignes WHERE paiement_id = $1`, [paymentId]),
      pool.query(
        `SELECT count(*)::int AS count FROM mouvements_caisse
         WHERE caisse_id = $1 AND reference_operation = $2`,
        [caisseId, `PAI-${paymentId}`],
      ),
      pool.query(`SELECT count(*)::int AS count FROM cheques_emis WHERE paiement_id = $1`, [paymentId]),
      pool.query(
        `SELECT count(*)::int AS count FROM ecritures_comptables
         WHERE cooperative_id = $1 AND source = 'paiement' AND source_id = $2`,
        [cooperativeId, paymentId],
      ),
    ]);
    return {
      statut: payment.rows[0].statut,
      lines: lines.rows[0].count,
      movements: movements.rows[0].count,
      cheques: cheques.rows[0].count,
      accounting: accounting.rows[0].count,
    };
  }

  it("refuse un total ventilé incorrect avant tout mouvement financier", async () => {
    const paymentId = await createPayment(1_000);

    const result = await validate(paymentId, {
      ventilations: [
        { modePaiement: "especes", montantFcfa: 700 },
        { modePaiement: "cheque", montantFcfa: 200, numeroCheque: "CHQ-INVALID-TOTAL" },
      ],
    });

    expect(result.statusCode).toBe(400);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "en_attente",
      lines: 0,
      movements: 0,
      cheques: 0,
      accounting: 0,
    });
  });

  it("rollbacke les espèces si l'enregistrement du chèque échoue", async () => {
    const paymentId = await createPayment(2_000);

    const result = await validate(paymentId, {
      ventilations: [
        { modePaiement: "especes", montantFcfa: 1_000 },
        // La colonne historique numero_cheque est limitée à 50 caractères.
        { modePaiement: "cheque", montantFcfa: 1_000, numeroCheque: "X".repeat(51) },
      ],
    });

    expect(result.statusCode).toBe(500);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "en_attente",
      lines: 0,
      movements: 0,
      cheques: 0,
      accounting: 0,
    });
  });

  it("ne valide qu'une seule fois lors de deux validations concurrentes", async () => {
    const paymentId = await createPayment(3_000);
    const body = {
      ventilations: [
        { modePaiement: "especes", montantFcfa: 1_000 },
        { modePaiement: "cheque", montantFcfa: 2_000, numeroCheque: "CHQ-CONCURRENCE" },
      ],
    };

    const results = await Promise.all([validate(paymentId, body), validate(paymentId, body)]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([200, 409]);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "confirme",
      lines: 2,
      movements: 1,
      cheques: 1,
      accounting: 2,
    });
  });

  it("conserve le reliquat et crée le prochain versement", async () => {
    const paymentId = await createDeferredPayment(590_000);

    const result = await validate(paymentId, {
      montantReglementFcfa: 190_000,
      modePaiement: "especes",
    });

    expect(result.statusCode).toBe(200);
    const delivery = await client.query(
      `SELECT statut_paiement, montant_restant FROM livraisons WHERE id = $1`,
      [deliveryIds[0]],
    );
    expect(delivery.rows[0]).toMatchObject({
      statut_paiement: "PARTIEL",
      montant_restant: "400000.00",
    });
    const payments = await client.query(
      `SELECT id, montant_fcfa, statut FROM paiements WHERE livraison_id = $1 ORDER BY id`,
      [deliveryIds[0]],
    );
    expect(payments.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: paymentId, montant_fcfa: 190000, statut: "effectue" }),
      expect.objectContaining({ montant_fcfa: 400000, statut: "en_attente" }),
    ]));
    paymentIds.push(...payments.rows.map((row: { id: number }) => row.id).filter((id: number) => !paymentIds.includes(id)));
  });
});
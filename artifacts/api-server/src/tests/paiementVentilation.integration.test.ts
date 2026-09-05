import { pool } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { validerPaiement } from "../controllers/paiementsController.js";
import { getJournal } from "../services/caisseService.js";
import {
  annulerChequeRecu,
  deposerChequeRecu,
  encaisserChequeRecu,
  rejeterChequeRecu,
} from "../services/chequesRecusService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

const postgresReferenceDate =
  process.env.POSTGRES_INTEGRATION_REFERENCE_DATE ?? "2026-08-29";

function shiftIsoDate(date: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(
      "POSTGRES_INTEGRATION_REFERENCE_DATE doit être une date ISO (AAAA-MM-JJ)",
    );
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(
      "POSTGRES_INTEGRATION_REFERENCE_DATE doit être une date civile valide",
    );
  }

  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

const postgresPreviousDate = shiftIsoDate(postgresReferenceDate, -1);
const postgresReferenceYear = Number(postgresReferenceDate.slice(0, 4));

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
  let ancienneSessionId: number;
  let sessionDate: string;
  let mobileAccountId: number;
  const paymentIds: number[] = [];
  const deliveryIds: number[] = [];
  const sessionIds: number[] = [];
  const commissionIds: number[] = [];
  const advanceIds: number[] = [];

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
      [
        cooperativeId,
        "Test",
        "Ventilation",
        `070001${process.pid}`,
        "1",
        "2026-01-01",
      ],
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
      [cooperativeId, "Caisse ventilation atomique", "10000000"],
    );
    caisseId = caisse.rows[0].id;

    const ancienneSession = await client.query(
      `INSERT INTO sessions_caisse
        (caisse_id, cooperative_id, date_session, solde_ouverture_fcfa, statut)
       VALUES ($1, $2, CURRENT_DATE - INTERVAL '1 day', $3, 'ouverte')
       RETURNING id`,
      [caisseId, cooperativeId, "10000000"],
    );
    ancienneSessionId = ancienneSession.rows[0].id;

    const session = await client.query(
      `INSERT INTO sessions_caisse
        (caisse_id, cooperative_id, date_session, solde_ouverture_fcfa, statut)
       VALUES ($1, $2, CURRENT_DATE, $3, 'ouverte')
       RETURNING id`,
      [caisseId, cooperativeId, "10000000"],
    );
    sessionId = session.rows[0].id;
    sessionDate = session.rows[0].date_session
      ?? (await client.query(
        `SELECT date_session::text FROM sessions_caisse WHERE id = $1`,
        [sessionId],
      )).rows[0].date_session;

    const mobileAccount = await client.query(
      `INSERT INTO comptes_mobiles_marchands
        (cooperative_id, nom, operateur, solde_actuel_fcfa, actif)
       VALUES ($1, $2, 'orange_money', $3, true)
       RETURNING id`,
      [cooperativeId, "Orange Money ventilation atomique", "1000000"],
    );
    mobileAccountId = mobileAccount.rows[0].id;
  });

  afterAll(async () => {
    await client.query(
      `DELETE FROM remboursements_avances_membres
       WHERE avance_id = ANY($1::int[])
          OR commission_membre_delegue_id = ANY($2::int[])`,
      [advanceIds, commissionIds],
    );
    await client.query(
      `DELETE FROM ecritures_comptables
       WHERE cooperative_id = $1
         AND (
           (source = 'paiement' AND source_id = ANY($2::int[]))
           OR (source = 'avance' AND source_id = $3)
         )`,
      [cooperativeId, paymentIds, memberId],
    );
    await client.query(
      `DELETE FROM ecritures_en_attente
       WHERE cooperative_id = $1
         AND (
           (source = 'paiement' AND source_id = ANY($2::int[]))
           OR (source = 'avance' AND source_id = $3)
         )`,
      [cooperativeId, paymentIds, memberId],
    );
    await client.query(
      `DELETE FROM cheques_emis WHERE paiement_id = ANY($1::int[])`,
      [paymentIds],
    );
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
    await client.query(`DELETE FROM mouvements_caisse WHERE caisse_id = $1`, [
      caisseId,
    ]);
    await client.query(
      `DELETE FROM mouvements_mobile_marchand WHERE compte_id = $1`,
      [mobileAccountId],
    );
    await client.query(`DELETE FROM paiements WHERE id = ANY($1::int[])`, [
      paymentIds,
    ]);
    await client.query(`DELETE FROM livraisons WHERE id = ANY($1::int[])`, [
      deliveryIds,
    ]);
    await client.query(
      `DELETE FROM commissions_membres_delegues WHERE id = ANY($1::int[])`,
      [commissionIds],
    );
    await client.query(`DELETE FROM avances WHERE id = ANY($1::int[])`, [
      advanceIds,
    ]);
    await client.query(`DELETE FROM sessions_pesee WHERE id = ANY($1::int[])`, [
      sessionIds,
    ]);
    await client.query(`DELETE FROM sessions_caisse WHERE id = $1`, [
      sessionId,
    ]);
    await client.query(`DELETE FROM sessions_caisse WHERE id = $1`, [
      ancienneSessionId,
    ]);
    await client.query(`DELETE FROM caisses WHERE id = $1`, [caisseId]);
    await client.query(
      `DELETE FROM comptes_mobiles_marchands WHERE id = $1`,
      [mobileAccountId],
    );
    await client.query(
      `DELETE FROM config_comptable WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(`DELETE FROM membres WHERE id = $1`, [memberId]);
    await client.query(`DELETE FROM cooperatives WHERE id = $1`, [
      cooperativeId,
    ]);
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

  async function createDeferredPayment(
    amount: number,
  ): Promise<{ paymentId: number; deliveryId: number }> {
    const livraison = await client.query(
      `INSERT INTO livraisons
        (membre_id, poids_kg, prix_unitaire_fcfa, montant_brut_fcfa,
         avance_deduite_fcfa, intrants_deduits_fcfa, montant_net_fcfa,
         date_livraison, statut_paiement, montant_restant)
       VALUES ($1, 1, $2::integer, $3::integer, 0, 0, $3::integer,
               CURRENT_DATE, 'EN_ATTENTE', $4::numeric)
       RETURNING id`,
      [memberId, amount, amount, amount],
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
    return { paymentId: id, deliveryId: livraisonId };
  }

  function request(paymentId: number, body: unknown) {
    return {
      params: { id: String(paymentId) },
      body,
      user: { cooperativeId, id: undefined, role: "comptable" },
      log: { error: () => undefined },
    } as any;
  }

  async function validate(
    paymentId: number,
    body: unknown,
  ): Promise<TestResponse> {
    const res = response();
    await validerPaiement(request(paymentId, body), res as any);
    return res;
  }

  async function paymentEffects(paymentId: number) {
    const [payment, lines, movements, mobileMovements, cheques, accounting] = await Promise.all([
      pool.query(`SELECT statut FROM paiements WHERE id = $1`, [paymentId]),
      pool.query(
        `SELECT count(*)::int AS count FROM paiement_lignes WHERE paiement_id = $1`,
        [paymentId],
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM mouvements_caisse
         WHERE caisse_id = $1 AND reference_operation = $2`,
        [caisseId, `PAI-${paymentId}`],
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM mouvements_mobile_marchand
         WHERE compte_id = $1
           AND libelle = $2`,
        [mobileAccountId, `Paiement producteur — règlement #${paymentId}`],
      ),
      pool.query(
        `SELECT count(*)::int AS count FROM cheques_emis WHERE paiement_id = $1`,
        [paymentId],
      ),
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
      mobileMovements: mobileMovements.rows[0].count,
      cheques: cheques.rows[0].count,
      accounting: accounting.rows[0].count,
    };
  }

  async function journalMovementsFor(paymentIdsToFind: number[]) {
    const journal = await getJournal(caisseId, {
      dateDebut: sessionDate,
      dateFin: sessionDate,
    });
    return journal.mouvements.filter((movement) =>
      paymentIdsToFind.includes(Number(
        movement.reference_operation?.replace(/^PAI-/, ""),
      )),
    );
  }

  it("expose un paiement espèces seul dans le Journal de caisse", async () => {
    const paymentId = await createPayment(125_000);

    const result = await validate(paymentId, { modePaiement: "especes" });

    expect(result.statusCode).toBe(200);
    await expect(journalMovementsFor([paymentId])).resolves.toEqual([
      expect.objectContaining({
        type: "sortie",
        motif: "paiement_producteur",
        montant_fcfa: "125000",
        reference_operation: `PAI-${paymentId}`,
        session_id: sessionId,
        session_statut: "ouverte",
        date_session: sessionDate,
      }),
    ]);
  });

  it("expose uniquement la part espèces d'une ventilation espèces et chèque", async () => {
    const paymentId = await createPayment(200_000);
    const caisseAvant = await client.query(
      `SELECT solde_actuel_fcfa FROM caisses WHERE id = $1`,
      [caisseId],
    );

    const result = await validate(paymentId, {
      ventilations: [
        { modePaiement: "especes", montantFcfa: 75_000 },
        { modePaiement: "cheque", montantFcfa: 125_000, numeroCheque: "CHQ-JOURNAL-ESPECES" },
      ],
    });

    expect(result.statusCode).toBe(200);
    expect(await client.query(
      `SELECT solde_actuel_fcfa FROM caisses WHERE id = $1`,
      [caisseId],
    )).toMatchObject({
      rows: [{ solde_actuel_fcfa: String(Number(caisseAvant.rows[0].solde_actuel_fcfa) - 75_000) }],
    });
    const mouvements = await client.query(
      `SELECT caisse_id, session_id, type, motif, montant_fcfa, reference_operation
       FROM mouvements_caisse
       WHERE caisse_id = $1 AND reference_operation = $2`,
      [caisseId, `PAI-${paymentId}`],
    );
    expect(mouvements.rows).toEqual([{
      caisse_id: caisseId,
      session_id: sessionId,
      type: "sortie",
      motif: "paiement_producteur",
      montant_fcfa: "75000",
      reference_operation: `PAI-${paymentId}`,
    }]);
    await expect(journalMovementsFor([paymentId])).resolves.toEqual([
      expect.objectContaining({
        montant_fcfa: "75000",
        reference_operation: `PAI-${paymentId}`,
        session_id: sessionId,
      }),
    ]);
  });

  it("rattache la part espèces à la session ouverte du jour malgré une ancienne session restée ouverte", async () => {
    const paymentId = await createPayment(150_000);

    const result = await validate(paymentId, { modePaiement: "especes" });

    expect(result.statusCode).toBe(200);
    await expect(journalMovementsFor([paymentId])).resolves.toEqual([
      expect.objectContaining({
        type: "sortie",
        motif: "paiement_producteur",
        montant_fcfa: "150000",
        reference_operation: `PAI-${paymentId}`,
        session_id: sessionId,
        date_session: sessionDate,
      }),
    ]);
    expect(await client.query(
      `SELECT session_id FROM mouvements_caisse WHERE reference_operation = $1`,
      [`PAI-${paymentId}`],
    )).toMatchObject({ rows: [{ session_id: sessionId }] });
  });

  it("expose uniquement la part espèces d'une ventilation espèces et mobile money", async () => {
    const paymentId = await createPayment(200_000);

    const result = await validate(paymentId, {
      ventilations: [
        { modePaiement: "especes", montantFcfa: 80_000 },
        {
          modePaiement: "orange_money",
          montantFcfa: 120_000,
          referenceTransaction: "OM-JOURNAL-ESPECES",
        },
      ],
    });

    expect(result.statusCode).toBe(200);
    await expect(journalMovementsFor([paymentId])).resolves.toEqual([
      expect.objectContaining({
        montant_fcfa: "80000",
        reference_operation: `PAI-${paymentId}`,
        session_id: sessionId,
      }),
    ]);
  });

  it("refuse un total ventilé incorrect avant tout mouvement financier", async () => {
    const paymentId = await createPayment(1_000);

    const result = await validate(paymentId, {
      ventilations: [
        { modePaiement: "especes", montantFcfa: 700 },
        {
          modePaiement: "cheque",
          montantFcfa: 200,
          numeroCheque: "CHQ-INVALID-TOTAL",
        },
      ],
    });

    expect(result.statusCode).toBe(400);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "en_attente",
      lines: 0,
      movements: 0,
      mobileMovements: 0,
      cheques: 0,
      accounting: 0,
    });
  });

  it("accepte le montant ventilé hors commission quand l'avance couvre toute la commission", async () => {
    const numeroPesee = 900_000 + process.pid;
    const livraison = await client.query(
      `INSERT INTO livraisons
        (cooperative_id, membre_id, poids_kg, prix_unitaire_fcfa,
         montant_brut_fcfa, avance_deduite_fcfa, intrants_deduits_fcfa,
         montant_net_fcfa, date_livraison, numero_pesee,
         annee_numero_pesee, statut_paiement, montant_restant)
       VALUES ($1, $2, 1000, 495, 495000, 0, 0, 495000,
               CURRENT_DATE, $3, $4, 'EN_ATTENTE', 495000)
       RETURNING id`,
      [cooperativeId, memberId, numeroPesee, postgresReferenceYear],
    );
    const deliveryId = livraison.rows[0].id as number;
    deliveryIds.push(deliveryId);

    const session = await client.query(
      `INSERT INTO sessions_pesee
        (cooperative_id, numero_session, membre_id, statut,
         poids_total_kg, nb_sacs_total, livraison_id)
       VALUES ($1, $2, $3, 'terminee', 1000, 10, $4)
       RETURNING id`,
      [cooperativeId, `COM-${process.pid}`, memberId, deliveryId],
    );
    const sessionId = session.rows[0].id as number;
    sessionIds.push(sessionId);

    const commission = await client.query(
      `INSERT INTO commissions_membres_delegues
        (membre_delegue_id, session_pesee_id, taux_fcfa_par_kg,
         poids_kg, montant_fcfa, frequence_paiement, statut)
       VALUES ($1, $2, 22.5, 1000, 22500, 'fin_campagne', 'en_attente')
       RETURNING id`,
      [memberId, sessionId],
    );
    const commissionId = commission.rows[0].id as number;
    commissionIds.push(commissionId);

    const advance = await client.query(
      `INSERT INTO avances
        (membre_id, montant_octroye_fcfa, montant_rembourse_fcfa,
         solde_restant_fcfa, date_octroi, statut, plan_type, deduction_source)
       VALUES ($1, 22500, 0, 22500, CURRENT_DATE - INTERVAL '1 day',
               'en_cours', 'integral', 'commission')
       RETURNING id`,
      [memberId],
    );
    const advanceId = advance.rows[0].id as number;
    advanceIds.push(advanceId);

    const payment = await client.query(
      `INSERT INTO paiements
        (cooperative_id, livraison_id, membre_id, numero_recu,
         montant_fcfa, mode_paiement, statut)
       VALUES ($1, $2, $3, $4, 495000, NULL, 'en_attente')
       RETURNING id`,
      [cooperativeId, deliveryId, memberId, `TEST-COM-${process.pid}`],
    );
    const paymentId = payment.rows[0].id as number;
    paymentIds.push(paymentId);

    const result = await validate(paymentId, {
      montantReglementFcfa: 495_000,
      ventilations: [
        { modePaiement: "especes", montantFcfa: 495_000 },
      ],
      inclureFraisCollecte: true,
    });

    expect(result.statusCode).toBe(200);
    expect(await client.query(
      `SELECT statut, montant_fcfa FROM paiements WHERE id = $1`,
      [paymentId],
    )).toMatchObject({
      rows: [{ statut: "effectue", montant_fcfa: 495000 }],
    });
    expect(await client.query(
      `SELECT statut, retenue_avances_fcfa FROM commissions_membres_delegues WHERE id = $1`,
      [commissionId],
    )).toMatchObject({
      rows: [{ statut: "payé", retenue_avances_fcfa: 22500 }],
    });
    expect(await client.query(
      `SELECT solde_restant_fcfa, montant_rembourse_fcfa, statut
       FROM avances WHERE id = $1`,
      [advanceId],
    )).toMatchObject({
      rows: [{ solde_restant_fcfa: 0, montant_rembourse_fcfa: 22500, statut: "rembourse" }],
    });
    expect(await client.query(
      `SELECT count(*)::int AS count
       FROM ecritures_en_attente
       WHERE cooperative_id = $1
         AND source = 'avance'
         AND source_id = $2
         AND montant_fcfa = 22500`,
      [cooperativeId, memberId],
    )).toMatchObject({ rows: [{ count: 1 }] });
  });

  it("rollbacke les espèces si l'enregistrement du chèque échoue", async () => {
    const paymentId = await createPayment(2_000);

    const result = await validate(paymentId, {
      ventilations: [
        { modePaiement: "especes", montantFcfa: 1_000 },
        // La colonne historique numero_cheque est limitée à 50 caractères.
        {
          modePaiement: "cheque",
          montantFcfa: 1_000,
          numeroCheque: "X".repeat(51),
        },
      ],
    });

    expect(result.statusCode).toBe(500);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "en_attente",
      lines: 0,
      movements: 0,
      mobileMovements: 0,
      cheques: 0,
      accounting: 0,
    });
  });

  it("ne valide qu'une seule fois lors de deux validations concurrentes", async () => {
    const paymentId = await createPayment(3_000);
    const body = {
      ventilations: [
        { modePaiement: "especes", montantFcfa: 1_000 },
        {
          modePaiement: "cheque",
          montantFcfa: 2_000,
          numeroCheque: "CHQ-CONCURRENCE",
        },
      ],
    };

    const results = await Promise.all([
      validate(paymentId, body),
      validate(paymentId, body),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([
      200, 409,
    ]);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "confirme",
      lines: 2,
      movements: 1,
      mobileMovements: 0,
      cheques: 1,
      accounting: 2,
    });
  });

  it("conserve le reliquat et crée le prochain versement", async () => {
    const { paymentId, deliveryId } = await createDeferredPayment(590_000);

    const result = await validate(paymentId, {
      montantReglementFcfa: 190_000,
      modePaiement: "especes",
    });

    expect(result.statusCode).toBe(200);
    const delivery = await client.query(
      `SELECT statut_paiement, montant_restant FROM livraisons WHERE id = $1`,
      [deliveryId],
    );
    expect(delivery.rows[0]).toMatchObject({
      statut_paiement: "PARTIEL",
      montant_restant: "400000.00",
    });
    const payments = await client.query(
      `SELECT id, montant_fcfa, statut FROM paiements WHERE livraison_id = $1 ORDER BY id`,
      [deliveryId],
    );
    expect(payments.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: paymentId,
          montant_fcfa: 190000,
          statut: "effectue",
        }),
        expect.objectContaining({ montant_fcfa: 400000, statut: "en_attente" }),
      ]),
    );
    paymentIds.push(
      ...payments.rows
        .map((row: { id: number }) => row.id)
        .filter((id: number) => !paymentIds.includes(id)),
    );
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "effectue",
      lines: 1,
      movements: 1,
      mobileMovements: 0,
      cheques: 0,
      accounting: 1,
    });
  });

  it("valide le versement du reliquat et clôture la livraison sans doublon", async () => {
    const { paymentId, deliveryId } = await createDeferredPayment(590_000);

    const firstResult = await validate(paymentId, {
      montantReglementFcfa: 190_000,
      modePaiement: "especes",
    });
    expect(firstResult.statusCode).toBe(200);

    const pendingPayments = await client.query(
      `SELECT id FROM paiements
       WHERE livraison_id = $1 AND statut = 'en_attente'
       ORDER BY id`,
      [deliveryId],
    );
    expect(pendingPayments.rows).toHaveLength(1);
    const remainderPaymentId = pendingPayments.rows[0].id as number;
    paymentIds.push(remainderPaymentId);

    const remainderResult = await validate(remainderPaymentId, {
      modePaiement: "especes",
    });
    expect(remainderResult.statusCode).toBe(200);

    const delivery = await client.query(
      `SELECT statut_paiement, montant_restant FROM livraisons WHERE id = $1`,
      [deliveryId],
    );
    expect(delivery.rows[0]).toMatchObject({
      statut_paiement: "PAYÉ",
      montant_restant: "0.00",
    });

    expect(await client.query(
      `SELECT count(*)::int AS count, coalesce(sum(montant_fcfa), 0)::numeric AS total
       FROM paiements
       WHERE livraison_id = $1`,
      [deliveryId],
    )).toMatchObject({
      rows: [{ count: 2, total: "590000" }],
    });

    expect(await paymentEffects(paymentId)).toEqual({
      statut: "effectue",
      lines: 1,
      movements: 1,
      mobileMovements: 0,
      cheques: 0,
      accounting: 1,
    });
    expect(await paymentEffects(remainderPaymentId)).toEqual({
      statut: "effectue",
      lines: 1,
      movements: 1,
      mobileMovements: 0,
      cheques: 0,
      accounting: 1,
    });

    expect(await client.query(
      `SELECT count(*)::int AS count, coalesce(sum(montant_fcfa), 0)::numeric AS total
       FROM mouvements_caisse
       WHERE caisse_id = $1 AND reference_operation = ANY($2::text[])`,
      [caisseId, [`PAI-${paymentId}`, `PAI-${remainderPaymentId}`]],
    )).toMatchObject({
      rows: [{ count: 2, total: "590000" }],
    });
    await expect(journalMovementsFor([paymentId, remainderPaymentId])).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          montant_fcfa: "190000",
          reference_operation: `PAI-${paymentId}`,
          session_id: sessionId,
        }),
        expect.objectContaining({
          montant_fcfa: "400000",
          reference_operation: `PAI-${remainderPaymentId}`,
          session_id: sessionId,
        }),
      ]),
    );
    expect(await client.query(
      `SELECT count(*)::int AS count
       FROM paiement_lignes
       WHERE paiement_id = ANY($1::int[])`,
      [[paymentId, remainderPaymentId]],
    )).toMatchObject({ rows: [{ count: 2 }] });
    expect(await client.query(
      `SELECT count(*)::int AS count
       FROM ecritures_comptables
       WHERE cooperative_id = $1 AND source = 'paiement'
         AND source_id = ANY($2::int[])`,
      [cooperativeId, [paymentId, remainderPaymentId]],
    )).toMatchObject({ rows: [{ count: 2 }] });
  });

  it("refuse un versement supérieur au reliquat sans effet financier", async () => {
    const { paymentId, deliveryId } = await createDeferredPayment(590_000);

    const result = await validate(paymentId, {
      montantReglementFcfa: 590_001,
      modePaiement: "especes",
    });

    expect(result.statusCode).toBe(422);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "en_attente",
      lines: 0,
      movements: 0,
      mobileMovements: 0,
      cheques: 0,
      accounting: 0,
    });
    const delivery = await client.query(
      `SELECT statut_paiement, montant_restant FROM livraisons WHERE id = $1`,
      [deliveryId],
    );
    expect(delivery.rows[0]).toMatchObject({
      statut_paiement: "EN_ATTENTE",
      montant_restant: "590000.00",
    });
  });

  it("ne duplique pas un versement partiel lors de validations concurrentes", async () => {
    const { paymentId, deliveryId } = await createDeferredPayment(590_000);
    const body = {
      montantReglementFcfa: 190_000,
      modePaiement: "especes",
    };

    const results = await Promise.all([
      validate(paymentId, body),
      validate(paymentId, body),
    ]);
    expect(results.map((result) => result.statusCode).sort()).toEqual([
      200, 409,
    ]);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "effectue",
      lines: 1,
      movements: 1,
      mobileMovements: 0,
      cheques: 0,
      accounting: 1,
    });

    const delivery = await client.query(
      `SELECT statut_paiement, montant_restant FROM livraisons WHERE id = $1`,
      [deliveryId],
    );
    expect(delivery.rows[0]).toMatchObject({
      statut_paiement: "PARTIEL",
      montant_restant: "400000.00",
    });
    const payments = await client.query(
      `SELECT montant_fcfa, statut FROM paiements WHERE livraison_id = $1 ORDER BY id`,
      [deliveryId],
    );
    expect(payments.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ montant_fcfa: 190000, statut: "effectue" }),
        expect.objectContaining({ montant_fcfa: 400000, statut: "en_attente" }),
      ]),
    );
    expect(payments.rows).toHaveLength(2);
    paymentIds.push(
      ...(
        await client.query(`SELECT id FROM paiements WHERE livraison_id = $1`, [
          deliveryId,
        ])
      ).rows
        .map((row: { id: number }) => row.id)
        .filter((id: number) => !paymentIds.includes(id)),
    );
  });

  it("rollbacke le reliquat et la caisse si le chèque du versement échoue", async () => {
    const { paymentId, deliveryId } = await createDeferredPayment(590_000);

    const result = await validate(paymentId, {
      montantReglementFcfa: 190_000,
      ventilations: [
        { modePaiement: "especes", montantFcfa: 100_000 },
        {
          modePaiement: "cheque",
          montantFcfa: 90_000,
          // La colonne historique numero_cheque est limitée à 50 caractères.
          numeroCheque: "X".repeat(51),
        },
      ],
    });

    expect(result.statusCode).toBe(500);
    expect(await paymentEffects(paymentId)).toEqual({
      statut: "en_attente",
      lines: 0,
      movements: 0,
      mobileMovements: 0,
      cheques: 0,
      accounting: 0,
    });
    const delivery = await client.query(
      `SELECT statut_paiement, montant_restant FROM livraisons WHERE id = $1`,
      [deliveryId],
    );
    expect(delivery.rows[0]).toMatchObject({
      statut_paiement: "EN_ATTENTE",
      montant_restant: "590000.00",
    });
    const pendingPayments = await client.query(
      `SELECT count(*)::int AS count FROM paiements WHERE livraison_id = $1 AND statut = 'en_attente'`,
      [deliveryId],
    );
    expect(pendingPayments.rows[0].count).toBe(1);
  });

  it("solde le reliquat par chèque et ne crée aucun effet en double", async () => {
    const { paymentId, deliveryId } = await createDeferredPayment(590_000);

    const firstResult = await validate(paymentId, {
      montantReglementFcfa: 190_000,
      modePaiement: "especes",
    });
    expect(firstResult.statusCode).toBe(200);

    const pendingPayments = await client.query(
      `SELECT id FROM paiements
       WHERE livraison_id = $1 AND statut = 'en_attente'
       ORDER BY id`,
      [deliveryId],
    );
    expect(pendingPayments.rows).toHaveLength(1);
    const remainderPaymentId = pendingPayments.rows[0].id as number;
    paymentIds.push(remainderPaymentId);

    const remainderResult = await validate(remainderPaymentId, {
      modePaiement: "cheque",
      numeroCheque: "CHQ-RELIQUAT-590000",
      banque: "Banque de test",
    });
    expect(remainderResult.statusCode).toBe(200);

    const duplicateResult = await validate(remainderPaymentId, {
      modePaiement: "cheque",
      numeroCheque: "CHQ-RELIQUAT-590000",
      banque: "Banque de test",
    });
    expect(duplicateResult.statusCode).toBe(409);

    expect(await client.query(
      `SELECT statut_paiement, montant_restant
       FROM livraisons WHERE id = $1`,
      [deliveryId],
    )).toMatchObject({
      rows: [{ statut_paiement: "PAYÉ", montant_restant: "0.00" }],
    });
    expect(await client.query(
      `SELECT count(*)::int AS count, coalesce(sum(montant_fcfa), 0)::numeric AS total
       FROM paiements WHERE livraison_id = $1`,
      [deliveryId],
    )).toMatchObject({
      rows: [{ count: 2, total: "590000" }],
    });
    expect(await paymentEffects(remainderPaymentId)).toEqual({
      statut: "confirme",
      lines: 1,
      movements: 0,
      mobileMovements: 0,
      cheques: 1,
      accounting: 1,
    });
    expect(await client.query(
      `SELECT count(*)::int AS count
       FROM cheques_emis WHERE paiement_id = $1`,
      [remainderPaymentId],
    )).toMatchObject({ rows: [{ count: 1 }] });
  });

  it("solde le reliquat par mobile money et ne crée aucun effet en double", async () => {
    const { paymentId, deliveryId } = await createDeferredPayment(590_000);

    const firstResult = await validate(paymentId, {
      montantReglementFcfa: 190_000,
      modePaiement: "especes",
    });
    expect(firstResult.statusCode).toBe(200);

    const pendingPayments = await client.query(
      `SELECT id FROM paiements
       WHERE livraison_id = $1 AND statut = 'en_attente'
       ORDER BY id`,
      [deliveryId],
    );
    expect(pendingPayments.rows).toHaveLength(1);
    const remainderPaymentId = pendingPayments.rows[0].id as number;
    paymentIds.push(remainderPaymentId);

    const remainderResult = await validate(remainderPaymentId, {
      modePaiement: "orange_money",
      referenceTransaction: "OM-RELIQUAT-590000",
      telephone: "0700000000",
    });
    expect(remainderResult.statusCode).toBe(200);

    const duplicateResult = await validate(remainderPaymentId, {
      modePaiement: "orange_money",
      referenceTransaction: "OM-RELIQUAT-590000",
      telephone: "0700000000",
    });
    expect(duplicateResult.statusCode).toBe(409);

    expect(await client.query(
      `SELECT statut_paiement, montant_restant
       FROM livraisons WHERE id = $1`,
      [deliveryId],
    )).toMatchObject({
      rows: [{ statut_paiement: "PAYÉ", montant_restant: "0.00" }],
    });
    expect(await client.query(
      `SELECT count(*)::int AS count, coalesce(sum(montant_fcfa), 0)::numeric AS total
       FROM paiements WHERE livraison_id = $1`,
      [deliveryId],
    )).toMatchObject({
      rows: [{ count: 2, total: "590000" }],
    });
    expect(await paymentEffects(remainderPaymentId)).toEqual({
      statut: "confirme",
      lines: 1,
      movements: 0,
      mobileMovements: 1,
      cheques: 0,
      accounting: 1,
    });
    expect(await client.query(
      `SELECT solde_actuel_fcfa FROM comptes_mobiles_marchands WHERE id = $1`,
      [mobileAccountId],
    )).toMatchObject({ rows: [{ solde_actuel_fcfa: "480000" }] });
  });

  it("conserve les mouvements du Journal quand la session est clôturée", async () => {
    const paymentId = await createPayment(42_000);

    const result = await validate(paymentId, { modePaiement: "especes" });
    expect(result.statusCode).toBe(200);

    await client.query(
      `UPDATE sessions_caisse SET statut = 'fermee' WHERE id = $1`,
      [sessionId],
    );

    await expect(journalMovementsFor([paymentId])).resolves.toEqual([
      expect.objectContaining({
        montant_fcfa: "42000",
        reference_operation: `PAI-${paymentId}`,
        session_id: sessionId,
        session_statut: "fermee",
        date_session: sessionDate,
      }),
    ]);
  });
});

describe.skipIf(!enabled)("rejet de chèque reçu atomique sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let exportateurId: number;
  let compteBancaireId: number;
  const paymentIds: number[] = [];
  const saleIds: number[] = [];
  const chequeIds: number[] = [];

  type SaleFixture = {
    paymentId: number;
    saleId: number;
    chequeId: number;
  };

  beforeAll(async () => {
    vi.useFakeTimers({
      now: new Date(`${postgresReferenceDate}T12:00:00.000Z`),
    });
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, $2, $3) RETURNING id`,
      [`Rejet chèque reçu ${process.pid}`, "Test", "Test"],
    );
    cooperativeId = cooperative.rows[0].id;

    await client.query(
      `INSERT INTO config_comptable (cooperative_id, auto_encaissements)
       VALUES ($1, true)`,
      [cooperativeId],
    );

    const compteBancaire = await client.query(
      `INSERT INTO comptes_bancaires
        (cooperative_id, nom, banque, solde_actuel_fcfa, solde_mini_alerte_fcfa, actif)
       VALUES ($1, $2, 'Banque de test', 0, 0, true)
       RETURNING id`,
      [cooperativeId, "Compte bancaire test rejet/encaissement"],
    );
    compteBancaireId = compteBancaire.rows[0].id;

    const exportateur = await client.query(
      `INSERT INTO exportateurs (cooperative_id, nom)
       VALUES ($1, $2) RETURNING id`,
      [cooperativeId, "Exportateur test rejet"],
    );
    exportateurId = exportateur.rows[0].id;
  });

  afterAll(async () => {
    await client.query(
      `DELETE FROM ecritures_comptables WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM ecritures_en_attente WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM mouvements_banque WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM cheques_recus WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(`DELETE FROM paiements WHERE id = ANY($1::int[])`, [
      paymentIds,
    ]);
    await client.query(`DELETE FROM ventes_exportateurs WHERE id = ANY($1::int[])`, [
      saleIds,
    ]);
    await client.query(`DELETE FROM exportateurs WHERE id = $1`, [
      exportateurId,
    ]);
    await client.query(
      `DELETE FROM config_comptable WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(`DELETE FROM comptes_bancaires WHERE id = $1`, [
      compteBancaireId,
    ]);
    await client.query(`DELETE FROM cooperatives WHERE id = $1`, [
      cooperativeId,
    ]);
    client.release();
    vi.useRealTimers();
  });

  async function createFixture(
    lines: Array<{ mode: "especes" | "cheque"; amount: number }>,
    suffix: string,
  ): Promise<SaleFixture> {
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    const sale = await client.query(
      `INSERT INTO ventes_exportateurs
         (exportateur_id, poids_kg, prix_unitaire_fcfa, montant_total_fcfa,
          date_vente, montant_recu_fcfa, solde_du_fcfa, statut)
       VALUES ($1, 1::numeric, $2::integer, $2::integer,
               $3::date, $2::integer, 0, 'regle')
       RETURNING id`,
      [exportateurId, total, postgresReferenceDate],
    );
    const saleId = sale.rows[0].id as number;
    saleIds.push(saleId);

    const payment = await client.query(
      `INSERT INTO paiements
         (libelle, mode_reglement, montant_a_payer_fcfa, montant_verse_fcfa,
          reste_a_payer_fcfa, montant_fcfa, mode_paiement, statut)
       VALUES ($1, $2, $3::numeric, $3::numeric, 0, $5::integer, $4, 'confirme')
       RETURNING id`,
      [
        `Encaissement vente exportateur #${saleId}`,
        lines.length === 1 ? lines[0]!.mode : "mixte",
        total,
        lines.length === 1 ? lines[0]!.mode : null,
        total,
      ],
    );
    const paymentId = payment.rows[0].id as number;
    paymentIds.push(paymentId);

    const linePlaceholders = lines
      .map((_, index) => `($1, $${index * 2 + 2}::mode_paiement, $${index * 2 + 3}::integer)`)
      .join(", ");
    const lineParams = [
      paymentId,
      ...lines.flatMap((line) => [line.mode, line.amount]),
    ];
    const paymentLines = await client.query(
      `INSERT INTO paiement_lignes
         (paiement_id, mode_paiement, montant_fcfa)
       VALUES ${linePlaceholders}
       RETURNING id`,
      lineParams,
    );
    const insertedLines = paymentLines.rows as Array<{ id: number }>;

    for (const line of lines) {
      await client.query(
        `INSERT INTO ecritures_comptables
           (cooperative_id, date_ecriture, numero_piece, libelle,
            compte_debit, compte_credit, montant_fcfa, source, source_id, exercice)
         VALUES ($1, $7::date, $2, $3, $4, '4111', $5,
                 'encaissement', $6, $8)`,
        [
          cooperativeId,
          `ENC-${saleId}-${line.mode}`,
          `Encaissement ${line.mode} — vente ${saleId}`,
          line.mode === "cheque" ? "511" : "571",
          line.amount,
          saleId,
          postgresReferenceDate,
          postgresReferenceYear,
        ],
      );
    }

    const chequeLine = lines.find((line) => line.mode === "cheque");
    if (!chequeLine) {
      throw new Error("La fixture doit contenir un chèque");
    }
    const cheque = await client.query(
      `INSERT INTO cheques_recus
         (cooperative_id, numero_cheque, banque, montant_fcfa, date_reception,
          vente_exportateur_id, exportateur_id, paiement_id, paiement_ligne_id,
          created_by)
       VALUES ($1, $2, 'Banque de test', $3, $4::date, $5, $6, $7, $8, 0)
       RETURNING id`,
      [
        cooperativeId,
        `CHQ-${suffix}-${saleId}`,
        chequeLine.amount,
          postgresReferenceDate,
        saleId,
        exportateurId,
        paymentId,
        insertedLines[lines.indexOf(chequeLine)]!.id,
      ],
    );
    const chequeId = cheque.rows[0].id as number;
    chequeIds.push(chequeId);

    return { paymentId, saleId, chequeId };
  }

  async function saleState(saleId: number) {
    const result = await client.query(
      `SELECT montant_recu_fcfa, solde_du_fcfa, statut
       FROM ventes_exportateurs WHERE id = $1`,
      [saleId],
    );
    return result.rows[0];
  }

  async function paymentState(paymentId: number) {
    const result = await client.query(
      `SELECT statut, motif_rejet FROM paiements WHERE id = $1`,
      [paymentId],
    );
    return result.rows[0];
  }

  async function chequeState(chequeId: number) {
    const result = await client.query(
      `SELECT statut, date_depot::text, date_encaissement::text,
              date_rejet::text, motif_rejet,
              compte_bancaire_id, mouvement_banque_id,
              date_annulation::text, motif_annulation
       FROM cheques_recus WHERE id = $1`,
      [chequeId],
    );
    return result.rows[0];
  }

  async function bankState(chequeId: number) {
    const result = await client.query(
      `SELECT
         (SELECT count(*)::int
            FROM mouvements_banque
           WHERE cooperative_id = $1
             AND compte_id = $2
              AND motif = 'encaissement_cheque_recu'
              AND reference = (
                SELECT numero_cheque FROM cheques_recus WHERE id = $3
              )) AS mouvement_count`,
      [cooperativeId, compteBancaireId, chequeId],
    );
    return result.rows[0];
  }

  async function bankBalance(): Promise<string> {
    const result = await client.query(
      `SELECT solde_actuel_fcfa FROM comptes_bancaires WHERE id = $1`,
      [compteBancaireId],
    );
    return result.rows[0].solde_actuel_fcfa;
  }

  async function accountingState(fixture: SaleFixture) {
    const result = await client.query(
      `SELECT compte_debit, compte_credit, montant_fcfa, source, source_id,
              numero_piece
       FROM ecritures_comptables
       WHERE cooperative_id = $1
         AND (
           numero_piece LIKE $2
           OR numero_piece LIKE $3
           OR numero_piece = $4
         )
       ORDER BY id`,
      [
        cooperativeId,
        `ENC-${fixture.saleId}-%`,
        `REJ-CHQ-${fixture.chequeId}`,
        `ANN-CHQ-${fixture.chequeId}`,
      ],
    );
    return result.rows;
  }

  async function installFailureTrigger(
    table: "ecritures_comptables" | "ventes_exportateurs",
    operation: "INSERT" | "UPDATE",
    name: string,
    condition: string,
  ): Promise<void> {
    await client.query(`
      CREATE FUNCTION "${name}_fn"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'Erreur simulée pendant ${operation.toLowerCase()}';
      END;
      $$;

      CREATE TRIGGER "${name}"
      BEFORE ${operation} ON ${table}
      FOR EACH ROW
      WHEN (${condition})
      EXECUTE FUNCTION "${name}_fn"();
    `);
  }

  async function removeFailureTrigger(
    table: "ecritures_comptables" | "ventes_exportateurs",
    name: string,
  ): Promise<void> {
    await client.query(`
      DROP TRIGGER IF EXISTS "${name}" ON ${table};
      DROP FUNCTION IF EXISTS "${name}_fn"();
    `);
  }

  it("ne dépose qu'une seule fois lors de deux demandes concurrentes", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 70_000 }],
      "depot-concurrent",
    );

    const results = await Promise.allSettled([
      deposerChequeRecu(fixture.chequeId, cooperativeId, postgresReferenceDate),
      deposerChequeRecu(fixture.chequeId, cooperativeId, postgresReferenceDate),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof deposerChequeRecu>>> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({
      message: "Seul un chèque à déposer peut être déposé",
    });
    expect(fulfilled[0]!.value).toMatchObject({
      id: fixture.chequeId,
      statut: "depose",
      dateDepot: postgresReferenceDate,
    });

    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "depose",
      date_depot: postgresReferenceDate,
      date_encaissement: null,
      date_rejet: null,
      date_annulation: null,
      mouvement_banque_id: null,
    });
    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 70_000,
      solde_du_fcfa: 0,
      statut: "regle",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "confirme",
      motif_rejet: null,
    });
    await expect(bankState(fixture.chequeId)).resolves.toEqual({
      mouvement_count: 0,
    });
    await expect(accountingState(fixture)).resolves.toHaveLength(1);
  });

  it("ne crée qu'un mouvement bancaire lors de deux encaissements concurrents", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 72_000 }],
      "encaissement-concurrent",
    );
    await deposerChequeRecu(fixture.chequeId, cooperativeId, postgresReferenceDate);
    const bankBefore = Number(await bankBalance());

    const results = await Promise.allSettled([
      encaisserChequeRecu(
        fixture.chequeId,
        cooperativeId,
        { compteBancaireId, dateEncaissement: postgresReferenceDate },
        0,
      ),
      encaisserChequeRecu(
        fixture.chequeId,
        cooperativeId,
        { compteBancaireId, dateEncaissement: postgresReferenceDate },
        0,
      ),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof encaisserChequeRecu>>> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({
      message: "Le chèque doit être déposé avant son encaissement",
    });
    expect(fulfilled[0]!.value).toMatchObject({
      id: fixture.chequeId,
      statut: "encaisse",
      compteBancaireId,
      dateEncaissement: postgresReferenceDate,
    });

    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "encaisse",
      date_depot: postgresReferenceDate,
      date_encaissement: postgresReferenceDate,
      date_rejet: null,
      date_annulation: null,
      compte_bancaire_id: compteBancaireId,
      mouvement_banque_id: expect.any(Number),
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "effectue",
      motif_rejet: null,
    });
    await expect(bankState(fixture.chequeId)).resolves.toEqual({
      mouvement_count: 1,
    });
    await expect(bankBalance()).resolves.toBe(String(bankBefore + 72_000));
    await expect(accountingState(fixture)).resolves.toHaveLength(1);
  });

  it("réouvre toute la créance après le rejet d'un chèque seul", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 100_000 }],
      "seul",
    );

    await expect(
      rejeterChequeRecu(fixture.chequeId, cooperativeId, {
        motifRejet: "Provision insuffisante",
        dateRejet: postgresReferenceDate,
      }),
    ).resolves.toMatchObject({
      id: fixture.chequeId,
      statut: "rejete",
      dateRejet: postgresReferenceDate,
      motifRejet: "Provision insuffisante",
    });

    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 0,
      solde_du_fcfa: 100_000,
      statut: "en_attente",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "rejete",
      motif_rejet: "Provision insuffisante",
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "rejete",
      date_rejet: postgresReferenceDate,
      motif_rejet: "Provision insuffisante",
    });
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 100_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
      {
        compte_debit: "4111",
        compte_credit: "511",
        montant_fcfa: 100_000,
        source: "encaissement",
        source_id: fixture.chequeId,
        numero_piece: `REJ-CHQ-${fixture.chequeId}`,
      },
    ]);
  });

  it("conserve uniquement les espèces après le rejet du chèque ventilé", async () => {
    const fixture = await createFixture(
      [
        { mode: "especes", amount: 40_000 },
        { mode: "cheque", amount: 60_000 },
      ],
      "mixte",
    );

    await rejeterChequeRecu(fixture.chequeId, cooperativeId, {
      motifRejet: "Signature non conforme",
      dateRejet: postgresReferenceDate,
    });

    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 40_000,
      solde_du_fcfa: 60_000,
      statut: "partiel",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "rejete",
      motif_rejet: "Signature non conforme",
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "rejete",
      motif_rejet: "Signature non conforme",
    });
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "571",
        compte_credit: "4111",
        montant_fcfa: 40_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-especes`,
      },
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 60_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
      {
        compte_debit: "4111",
        compte_credit: "511",
        montant_fcfa: 60_000,
        source: "encaissement",
        source_id: fixture.chequeId,
        numero_piece: `REJ-CHQ-${fixture.chequeId}`,
      },
    ]);
  });

  it("réouvre correctement la créance après le dépôt puis le rejet du chèque", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 85_000 }],
      "depose-puis-rejete",
    );

    await deposerChequeRecu(fixture.chequeId, cooperativeId, postgresPreviousDate);
    await rejeterChequeRecu(fixture.chequeId, cooperativeId, {
      motifRejet: "Chèque retourné par la banque",
      dateRejet: postgresReferenceDate,
    });

    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 0,
      solde_du_fcfa: 85_000,
      statut: "en_attente",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "rejete",
      motif_rejet: "Chèque retourné par la banque",
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "rejete",
      date_depot: postgresPreviousDate,
      date_rejet: postgresReferenceDate,
      motif_rejet: "Chèque retourné par la banque",
    });
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 85_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
      {
        compte_debit: "4111",
        compte_credit: "511",
        montant_fcfa: 85_000,
        source: "encaissement",
        source_id: fixture.chequeId,
        numero_piece: `REJ-CHQ-${fixture.chequeId}`,
      },
    ]);
  });

  it("ne rejette qu'une seule fois lors de deux requêtes concurrentes", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 95_000 }],
      "concurrent",
    );

    const results = await Promise.allSettled([
      rejeterChequeRecu(fixture.chequeId, cooperativeId, {
        motifRejet: "Premier motif",
        dateRejet: postgresReferenceDate,
      }),
      rejeterChequeRecu(fixture.chequeId, cooperativeId, {
        motifRejet: "Second motif",
        dateRejet: postgresReferenceDate,
      }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof rejeterChequeRecu>>> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({
      message: "Seul un chèque à déposer ou déposé peut être rejeté",
    });

    const persistedMotif = fulfilled[0]!.value.motifRejet;
    expect(["Premier motif", "Second motif"]).toContain(persistedMotif);
    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 0,
      solde_du_fcfa: 95_000,
      statut: "en_attente",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "rejete",
      motif_rejet: persistedMotif,
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "rejete",
      date_rejet: postgresReferenceDate,
      motif_rejet: persistedMotif,
    });
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 95_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
      {
        compte_debit: "4111",
        compte_credit: "511",
        montant_fcfa: 95_000,
        source: "encaissement",
        source_id: fixture.chequeId,
        numero_piece: `REJ-CHQ-${fixture.chequeId}`,
      },
    ]);
  });

  it("ne conserve qu'une seule issue lors d'un rejet et d'une annulation concurrents", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 110_000 }],
      "rejet-annulation-concurrent",
    );

    const results = await Promise.allSettled([
      rejeterChequeRecu(fixture.chequeId, cooperativeId, {
        motifRejet: "Rejet concurrent",
        dateRejet: postgresReferenceDate,
      }),
      annulerChequeRecu(
        fixture.chequeId,
        cooperativeId,
        "Annulation concurrente",
      ),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof rejeterChequeRecu>>
        | Awaited<ReturnType<typeof annulerChequeRecu>>
      > => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const successfulStatus = fulfilled[0]!.value.statut;
    expect(["rejete", "annule"]).toContain(successfulStatus);
    expect(rejected[0]!.reason).toMatchObject({
      message: successfulStatus === "rejete"
        ? "Seul un chèque à déposer ou déposé peut être annulé"
        : "Seul un chèque à déposer ou déposé peut être rejeté",
    });

    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 0,
      solde_du_fcfa: 110_000,
      statut: "en_attente",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "rejete",
      motif_rejet: successfulStatus === "rejete"
        ? "Rejet concurrent"
        : "Annulation concurrente",
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject(
      successfulStatus === "rejete"
        ? {
            statut: "rejete",
            date_rejet: postgresReferenceDate,
            motif_rejet: "Rejet concurrent",
            date_annulation: null,
            motif_annulation: null,
          }
        : {
            statut: "annule",
            date_rejet: null,
            motif_rejet: null,
            date_annulation: postgresReferenceDate,
            motif_annulation: "Annulation concurrente",
          },
    );
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 110_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
      {
        compte_debit: "4111",
        compte_credit: "511",
        montant_fcfa: 110_000,
        source: "encaissement",
        source_id: fixture.chequeId,
        numero_piece: successfulStatus === "rejete"
          ? `REJ-CHQ-${fixture.chequeId}`
          : `ANN-CHQ-${fixture.chequeId}`,
      },
    ]);
  });

  it("ne peut pas encaisser et rejeter le même chèque en concurrence", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 120_000 }],
      "encaisse-rejet-concurrent",
    );

    await deposerChequeRecu(fixture.chequeId, cooperativeId, postgresPreviousDate);
    const bankBefore = Number(await bankBalance());

    const results = await Promise.allSettled([
      encaisserChequeRecu(
        fixture.chequeId,
        cooperativeId,
        {
          compteBancaireId,
          dateEncaissement: postgresReferenceDate,
        },
        0,
      ),
      rejeterChequeRecu(fixture.chequeId, cooperativeId, {
        motifRejet: "Rejet concurrent",
        dateRejet: postgresReferenceDate,
      }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof encaisserChequeRecu>>
        | Awaited<ReturnType<typeof rejeterChequeRecu>>
      > => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const successfulStatus = fulfilled[0]!.value.statut;
    expect(["encaisse", "rejete"]).toContain(successfulStatus);
    expect(rejected[0]!.reason).toMatchObject({
      message: successfulStatus === "encaisse"
        ? "Seul un chèque à déposer ou déposé peut être rejeté"
        : "Le chèque doit être déposé avant son encaissement",
    });

    if (successfulStatus === "encaisse") {
      await expect(saleState(fixture.saleId)).resolves.toEqual({
        montant_recu_fcfa: 120_000,
        solde_du_fcfa: 0,
        statut: "regle",
      });
      await expect(paymentState(fixture.paymentId)).resolves.toEqual({
        statut: "effectue",
        motif_rejet: null,
      });
      await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
        statut: "encaisse",
        date_depot: postgresPreviousDate,
        date_encaissement: postgresReferenceDate,
        date_rejet: null,
        motif_rejet: null,
        compte_bancaire_id: compteBancaireId,
        mouvement_banque_id: expect.any(Number),
        date_annulation: null,
        motif_annulation: null,
      });
      await expect(bankState(fixture.chequeId)).resolves.toEqual({
        mouvement_count: 1,
      });
      await expect(bankBalance()).resolves.toBe(String(bankBefore + 120_000));
      await expect(accountingState(fixture)).resolves.toEqual([
        {
          compte_debit: "511",
          compte_credit: "4111",
          montant_fcfa: 120_000,
          source: "encaissement",
          source_id: fixture.saleId,
          numero_piece: `ENC-${fixture.saleId}-cheque`,
        },
      ]);
    } else {
      await expect(saleState(fixture.saleId)).resolves.toEqual({
        montant_recu_fcfa: 0,
        solde_du_fcfa: 120_000,
        statut: "en_attente",
      });
      await expect(paymentState(fixture.paymentId)).resolves.toEqual({
        statut: "rejete",
        motif_rejet: "Rejet concurrent",
      });
      await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
        statut: "rejete",
        date_depot: postgresPreviousDate,
        date_encaissement: null,
        date_rejet: postgresReferenceDate,
        motif_rejet: "Rejet concurrent",
        compte_bancaire_id: null,
        mouvement_banque_id: null,
        date_annulation: null,
        motif_annulation: null,
      });
      await expect(bankState(fixture.chequeId)).resolves.toEqual({
        mouvement_count: 0,
      });
      await expect(bankBalance()).resolves.toBe(String(bankBefore));
      await expect(accountingState(fixture)).resolves.toEqual([
        {
          compte_debit: "511",
          compte_credit: "4111",
          montant_fcfa: 120_000,
          source: "encaissement",
          source_id: fixture.saleId,
          numero_piece: `ENC-${fixture.saleId}-cheque`,
        },
        {
          compte_debit: "4111",
          compte_credit: "511",
          montant_fcfa: 120_000,
          source: "encaissement",
          source_id: fixture.chequeId,
          numero_piece: `REJ-CHQ-${fixture.chequeId}`,
        },
      ]);
    }
  });

  it("ne crée qu'une seule annulation lors de deux requêtes concurrentes", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 115_000 }],
      "annulation-concurrente",
    );

    const results = await Promise.allSettled([
      annulerChequeRecu(
        fixture.chequeId,
        cooperativeId,
        "Première annulation",
      ),
      annulerChequeRecu(
        fixture.chequeId,
        cooperativeId,
        "Seconde annulation",
      ),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof annulerChequeRecu>>> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toMatchObject({
      message: "Seul un chèque à déposer ou déposé peut être annulé",
    });

    const persistedMotif = fulfilled[0]!.value.motifAnnulation;
    expect(["Première annulation", "Seconde annulation"]).toContain(persistedMotif);
    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 0,
      solde_du_fcfa: 115_000,
      statut: "en_attente",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "rejete",
      motif_rejet: persistedMotif,
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "annule",
      date_annulation: postgresReferenceDate,
      motif_annulation: persistedMotif,
      date_rejet: null,
      date_encaissement: null,
      mouvement_banque_id: null,
    });
    await expect(bankState(fixture.chequeId)).resolves.toEqual({
      mouvement_count: 0,
    });
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 115_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
      {
        compte_debit: "4111",
        compte_credit: "511",
        montant_fcfa: 115_000,
        source: "encaissement",
        source_id: fixture.chequeId,
        numero_piece: `ANN-CHQ-${fixture.chequeId}`,
      },
    ]);
  });

  it("ne crée qu'un effet terminal lors d'un encaissement et d'une annulation concurrents", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 125_000 }],
      "encaissement-annulation-concurrent",
    );
    await deposerChequeRecu(fixture.chequeId, cooperativeId, postgresReferenceDate);
    const bankBefore = Number(await bankBalance());

    const results = await Promise.allSettled([
      encaisserChequeRecu(
        fixture.chequeId,
        cooperativeId,
        { compteBancaireId, dateEncaissement: postgresReferenceDate },
        0,
      ),
      annulerChequeRecu(
        fixture.chequeId,
        cooperativeId,
        "Annulation concurrente",
      ),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof encaisserChequeRecu>>
        | Awaited<ReturnType<typeof annulerChequeRecu>>
      > => result.status === "fulfilled",
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const successfulStatus = fulfilled[0]!.value.statut;
    expect(["encaisse", "annule"]).toContain(successfulStatus);
    expect(rejected[0]!.reason).toMatchObject({
      message: successfulStatus === "encaisse"
        ? "Seul un chèque à déposer ou déposé peut être annulé"
        : "Le chèque doit être déposé avant son encaissement",
    });

    if (successfulStatus === "encaisse") {
      await expect(saleState(fixture.saleId)).resolves.toEqual({
        montant_recu_fcfa: 125_000,
        solde_du_fcfa: 0,
        statut: "regle",
      });
      await expect(paymentState(fixture.paymentId)).resolves.toEqual({
        statut: "effectue",
        motif_rejet: null,
      });
      await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
        statut: "encaisse",
        date_depot: postgresReferenceDate,
        date_encaissement: postgresReferenceDate,
        date_rejet: null,
        date_annulation: null,
        compte_bancaire_id: compteBancaireId,
        mouvement_banque_id: expect.any(Number),
      });
      await expect(bankState(fixture.chequeId)).resolves.toEqual({
        mouvement_count: 1,
      });
      await expect(bankBalance()).resolves.toBe(String(bankBefore + 125_000));
      await expect(accountingState(fixture)).resolves.toHaveLength(1);
    } else {
      await expect(saleState(fixture.saleId)).resolves.toEqual({
        montant_recu_fcfa: 0,
        solde_du_fcfa: 125_000,
        statut: "en_attente",
      });
      await expect(paymentState(fixture.paymentId)).resolves.toEqual({
        statut: "rejete",
        motif_rejet: "Annulation concurrente",
      });
      await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
        statut: "annule",
        date_depot: postgresReferenceDate,
        date_encaissement: null,
        date_rejet: null,
        date_annulation: postgresReferenceDate,
        motif_annulation: "Annulation concurrente",
        compte_bancaire_id: null,
        mouvement_banque_id: null,
      });
      await expect(bankState(fixture.chequeId)).resolves.toEqual({
        mouvement_count: 0,
      });
      await expect(bankBalance()).resolves.toBe(String(bankBefore));
      await expect(accountingState(fixture)).resolves.toEqual([
        {
          compte_debit: "511",
          compte_credit: "4111",
          montant_fcfa: 125_000,
          source: "encaissement",
          source_id: fixture.saleId,
          numero_piece: `ENC-${fixture.saleId}-cheque`,
        },
        {
          compte_debit: "4111",
          compte_credit: "511",
          montant_fcfa: 125_000,
          source: "encaissement",
          source_id: fixture.chequeId,
          numero_piece: `ANN-CHQ-${fixture.chequeId}`,
        },
      ]);
    }
  });

  it("annule le chèque et réouvre le solde avec une écriture inverse", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 75_000 }],
      "annulation",
    );

    await annulerChequeRecu(
      fixture.chequeId,
      cooperativeId,
      "Annulation demandée par l'exportateur",
    );

    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 0,
      solde_du_fcfa: 75_000,
      statut: "en_attente",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "rejete",
      motif_rejet: "Annulation demandée par l'exportateur",
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "annule",
      motif_annulation: "Annulation demandée par l'exportateur",
    });
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 75_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
      {
        compte_debit: "4111",
        compte_credit: "511",
        montant_fcfa: 75_000,
        source: "encaissement",
        source_id: fixture.chequeId,
        numero_piece: `ANN-CHQ-${fixture.chequeId}`,
      },
    ]);
  });

  it("annule toutes les étapes si l'écriture comptable échoue", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 90_000 }],
      "ecriture",
    );
    const trigger = `rejet_chq_ecriture_${process.pid}_${fixture.chequeId}`;
    await installFailureTrigger(
      "ecritures_comptables",
      "INSERT",
      trigger,
      `NEW.cooperative_id = ${cooperativeId}`,
    );

    try {
      await expect(
        rejeterChequeRecu(fixture.chequeId, cooperativeId, {
          motifRejet: "Écriture indisponible",
          dateRejet: postgresReferenceDate,
        }),
      ).rejects.toThrow();
    } finally {
      await removeFailureTrigger("ecritures_comptables", trigger);
    }

    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 90_000,
      solde_du_fcfa: 0,
      statut: "regle",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "confirme",
      motif_rejet: null,
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "a_deposer",
      date_rejet: null,
      motif_rejet: null,
    });
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 90_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
    ]);
  });

  it("annule toutes les étapes si la vente refuse sa mise à jour", async () => {
    const fixture = await createFixture(
      [{ mode: "cheque", amount: 80_000 }],
      "mise-a-jour",
    );
    const trigger = `rejet_chq_vente_${process.pid}_${fixture.chequeId}`;
    await installFailureTrigger(
      "ventes_exportateurs",
      "UPDATE",
      trigger,
      `OLD.id = ${fixture.saleId}`,
    );

    try {
      await expect(
        rejeterChequeRecu(fixture.chequeId, cooperativeId, {
          motifRejet: "Vente verrouillée",
          dateRejet: postgresReferenceDate,
        }),
      ).rejects.toThrow();
    } finally {
      await removeFailureTrigger("ventes_exportateurs", trigger);
    }

    await expect(saleState(fixture.saleId)).resolves.toEqual({
      montant_recu_fcfa: 80_000,
      solde_du_fcfa: 0,
      statut: "regle",
    });
    await expect(paymentState(fixture.paymentId)).resolves.toEqual({
      statut: "confirme",
      motif_rejet: null,
    });
    await expect(chequeState(fixture.chequeId)).resolves.toMatchObject({
      statut: "a_deposer",
      date_rejet: null,
      motif_rejet: null,
    });
    await expect(accountingState(fixture)).resolves.toEqual([
      {
        compte_debit: "511",
        compte_credit: "4111",
        montant_fcfa: 80_000,
        source: "encaissement",
        source_id: fixture.saleId,
        numero_piece: `ENC-${fixture.saleId}-cheque`,
      },
    ]);
  });
});

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { annulerLivraison } from "../controllers/livraisonsController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type TestResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => TestResponse;
  json: (body: unknown) => TestResponse;
};

function makeResponse(): TestResponse {
  const response: TestResponse = {
    statusCode: 200,
    body: undefined,
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(body) {
      response.body = body;
      return response;
    },
  };
  return response;
}

describe.skipIf(!enabled)("annulation de livraison : cohérence stock et règlements", () => {
  let client: any;
  let cooperativeId: number;
  let userId: number;
  let entrepotId: number;
  let sequence = 1;
  const delegatedUserIds: number[] = [];

  beforeAll(async () => {
    client = await pool.connect();
    const suffix = `${process.pid}-${Date.now()}`;

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Annulation intégrité ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Gestionnaire', 'Test', $2, 'integration-test', 'pca')
       RETURNING id`,
      [cooperativeId, `annulation-${suffix}@test.local`],
    );
    userId = user.rows[0].id;

    const entrepot = await client.query(
      `INSERT INTO entrepots (cooperative_id, nom, ville, capacite_kg)
       VALUES ($1, 'Entrepôt annulation test', 'Test', 10000)
       RETURNING id`,
      [cooperativeId],
    );
    entrepotId = entrepot.rows[0].id;
  });

  afterAll(async () => {
    if (!client) return;
    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM audit_trail WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM cheques_emis WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM entrepot_mouvements
         WHERE entrepot_id IN (
           SELECT id FROM entrepots_delegues WHERE cooperative_id = $1
         )`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_stock
         WHERE entrepot_id IN (
           SELECT id FROM entrepots WHERE cooperative_id = $1
         )`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM paiements
         WHERE livraison_id IN (
           SELECT id FROM livraisons WHERE cooperative_id = $1
         )`,
        [cooperativeId],
      );
      await client.query(`DELETE FROM livraisons WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM entrepots_delegues WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM entrepots WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(
        `DELETE FROM users WHERE cooperative_id = $1 OR id = ANY($2::int[])`,
        [cooperativeId, delegatedUserIds],
      );
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  async function createLivraison(): Promise<number> {
    const result = await client.query(
      `INSERT INTO livraisons
         (cooperative_id, poids_kg, prix_unitaire_fcfa, montant_brut_fcfa,
          montant_net_fcfa, date_livraison, numero_pesee, annee_numero_pesee)
       VALUES ($1, 100, 500, 50000, 50000, CURRENT_DATE, $2, 2026)
       RETURNING id`,
      [cooperativeId, sequence++],
    );
    return result.rows[0].id;
  }

  async function createPayment(livraisonId: number, statut: "en_attente" | "confirme" | "en_cours") {
    const result = await client.query(
      `INSERT INTO paiements
         (cooperative_id, livraison_id, numero_recu, montant_fcfa, statut, date_validation)
       VALUES ($1, $2, $3, 50000, $4,
               CASE WHEN $4 = 'confirme' THEN NOW() ELSE NULL END)
       RETURNING id`,
      [cooperativeId, livraisonId, `TEST-${process.pid}-${sequence++}`, statut],
    );
    return result.rows[0].id as number;
  }

  async function callAnnuler(livraisonId: number, motif = "Annulation de test") {
    const response = makeResponse();
    await annulerLivraison(
      {
        user: { id: userId, cooperativeId, role: "pca", nom: "Gestionnaire Test" },
        params: { id: String(livraisonId) },
        body: { motif },
        socket: { remoteAddress: "127.0.0.1" },
        headers: { "user-agent": "integration-test" },
        log: { error: () => undefined },
      } as never,
      response as never,
    );
    return response;
  }

  async function createDelegue(n: number): Promise<number> {
    const result = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, $2, 'Test', $3, 'integration-test', 'delegue')
       RETURNING id`,
      [
        cooperativeId,
        `Délégué ${n}`,
        `annulation-delegue-${process.pid}-${n}-${Date.now()}@test.local`,
      ],
    );
    const id = result.rows[0].id as number;
    delegatedUserIds.push(id);
    return id;
  }

  it("annule en transaction, compense le stock et archive le règlement en attente supprimé", async () => {
    const livraisonId = await createLivraison();
    const paiementId = await createPayment(livraisonId, "en_attente");
    await client.query(
      `INSERT INTO mouvements_stock (entrepot_id, livraison_id, type, poids_kg, motif)
       VALUES ($1, $2, 'entree', 100, $3)`,
      [entrepotId, livraisonId, `Livraison #${livraisonId}`],
    );

    const response = await callAnnuler(livraisonId);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ ok: true, id: livraisonId, statut: "annulee" });

    const livraison = await client.query(`SELECT id FROM livraisons WHERE id = $1`, [livraisonId]);
    const paiements = await client.query(`SELECT id FROM paiements WHERE id = $1`, [paiementId]);
    const audit = await client.query(
      `SELECT valeurs_avant -> 'paiements' AS paiements
         FROM audit_trail
        WHERE cooperative_id = $1 AND entite_type = 'livraison_annulee' AND entite_id = $2`,
      [cooperativeId, livraisonId],
    );
    const mouvements = await client.query(
      `SELECT type, poids_kg
         FROM mouvements_stock
        WHERE entrepot_id = $1
        ORDER BY id`,
      [entrepotId],
    );
    const soldeStock = mouvements.rows.reduce(
      (total: number, row: { type: string; poids_kg: string }) =>
        total + (row.type === "entree" || row.type === "retour_refus"
          ? Number(row.poids_kg)
          : -Number(row.poids_kg)),
      0,
    );

    expect(livraison.rowCount).toBe(0);
    expect(paiements.rowCount).toBe(0);
    expect(audit.rows[0].paiements).toHaveLength(1);
    expect(Number(audit.rows[0].paiements[0].id)).toBe(paiementId);
    expect(mouvements.rows).toHaveLength(2);
    expect(soldeStock).toBe(0);
  });

  it("refuse un règlement confirmé sans toucher à la livraison ni au stock", async () => {
    const livraisonId = await createLivraison();
    const paiementId = await createPayment(livraisonId, "confirme");
    await client.query(
      `INSERT INTO mouvements_stock (entrepot_id, livraison_id, type, poids_kg, motif)
       VALUES ($1, $2, 'entree', 100, $3)`,
      [entrepotId, livraisonId, `Livraison #${livraisonId}`],
    );

    const response = await callAnnuler(livraisonId);
    expect(response.statusCode).toBe(409);

    const livraison = await client.query(`SELECT id FROM livraisons WHERE id = $1`, [livraisonId]);
    const paiement = await client.query(`SELECT statut FROM paiements WHERE id = $1`, [paiementId]);
    const mouvementCount = await client.query(
      `SELECT count(*)::int AS count
         FROM mouvements_stock
        WHERE livraison_id = $1`,
      [livraisonId],
    );
    const auditCount = await client.query(
      `SELECT count(*)::int AS count
         FROM audit_trail
        WHERE cooperative_id = $1 AND entite_type = 'livraison_annulee' AND entite_id = $2`,
      [cooperativeId, livraisonId],
    );

    expect(livraison.rowCount).toBe(1);
    expect(paiement.rows[0].statut).toBe("confirme");
    expect(mouvementCount.rows[0].count).toBe(1);
    expect(auditCount.rows[0].count).toBe(0);
  });

  it("refuse si la quantité du stock ne permet plus d'inverser l'entrée", async () => {
    const livraisonId = await createLivraison();
    await client.query(
      `INSERT INTO mouvements_stock (entrepot_id, livraison_id, type, poids_kg, motif)
       VALUES ($1, $2, 'entree', 100, $3)`,
      [entrepotId, livraisonId, `Livraison #${livraisonId}`],
    );
    await client.query(
      `INSERT INTO mouvements_stock (entrepot_id, type, poids_kg, motif)
       VALUES ($1, 'sortie', 60, 'Stock utilisé avant annulation')`,
      [entrepotId],
    );

    const response = await callAnnuler(livraisonId);
    expect(response.statusCode).toBe(409);

    const livraison = await client.query(`SELECT id FROM livraisons WHERE id = $1`, [livraisonId]);
    const mouvements = await client.query(
      `SELECT count(*)::int AS count
         FROM mouvements_stock
        WHERE entrepot_id = $1`,
      [entrepotId],
    );
    const auditCount = await client.query(
      `SELECT count(*)::int AS count
         FROM audit_trail
        WHERE cooperative_id = $1 AND entite_type = 'livraison_annulee' AND entite_id = $2`,
      [cooperativeId, livraisonId],
    );

    expect(livraison.rowCount).toBe(1);
    expect(mouvements.rows[0].count).toBe(2);
    expect(auditCount.rows[0].count).toBe(0);
  });

  it("annule toute la transaction si un entrepôt délégué ne peut pas restituer le stock", async () => {
    const livraisonId = await createLivraison();
    const paiementId = await createPayment(livraisonId, "en_attente");
    const delegue1 = await createDelegue(1);
    const delegue2 = await createDelegue(2);
    const depot1 = await client.query(
      `INSERT INTO entrepots_delegues
         (delegue_id, cooperative_id, nom, stock_actuel_kg)
       VALUES ($1, $2, 'Dépôt annulation 1', 100)
       RETURNING id`,
      [delegue1, cooperativeId],
    );
    const depot2 = await client.query(
      `INSERT INTO entrepots_delegues
         (delegue_id, cooperative_id, nom, stock_actuel_kg)
       VALUES ($1, $2, 'Dépôt annulation 2', 25)
       RETURNING id`,
      [delegue2, cooperativeId],
    );
    const depot1Id = depot1.rows[0].id as number;
    const depot2Id = depot2.rows[0].id as number;
    await client.query(
      `INSERT INTO entrepot_mouvements
         (entrepot_id, type_mouvement, motif, poids_kg, livraison_id)
       VALUES
         ($1, 'entree', 'livraison_membre', 50, $3),
         ($2, 'entree', 'livraison_membre', 50, $3)`,
      [depot1Id, depot2Id, livraisonId],
    );

    const response = await callAnnuler(livraisonId);
    expect(response.statusCode).toBe(409);

    const stocks = await client.query(
      `SELECT id, stock_actuel_kg
         FROM entrepots_delegues
        WHERE id IN ($1, $2)
        ORDER BY id`,
      [depot1Id, depot2Id],
    );
    const sorties = await client.query(
      `SELECT count(*)::int AS count
         FROM entrepot_mouvements
        WHERE livraison_id IS NULL AND motif = 'livraison_membre'
          AND entrepot_id IN ($1, $2) AND type_mouvement = 'sortie'
          AND notes LIKE $3`,
      [depot1Id, depot2Id, `%Annulation livraison #${livraisonId}%`],
    );
    const livraison = await client.query(`SELECT id FROM livraisons WHERE id = $1`, [livraisonId]);
    const paiement = await client.query(`SELECT id FROM paiements WHERE id = $1`, [paiementId]);
    const auditCount = await client.query(
      `SELECT count(*)::int AS count
         FROM audit_trail
        WHERE cooperative_id = $1 AND entite_type = 'livraison_annulee' AND entite_id = $2`,
      [cooperativeId, livraisonId],
    );

    expect(stocks.rows.map((row: { stock_actuel_kg: string }) => Number(row.stock_actuel_kg)))
      .toEqual([100, 25]);
    expect(sorties.rows[0].count).toBe(0);
    expect(livraison.rowCount).toBe(1);
    expect(paiement.rowCount).toBe(1);
    expect(auditCount.rows[0].count).toBe(0);
  });
});

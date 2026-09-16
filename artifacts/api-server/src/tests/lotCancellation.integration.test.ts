import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { updateLotStatut } from "../controllers/lotsController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type JsonResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => JsonResponse;
  json: (body: unknown) => JsonResponse;
};

function makeResponse(): JsonResponse {
  const response = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

describe.skipIf(!enabled)("annulation des lots constitués sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let lotId: number;
  let livraisonId: number;

  beforeAll(async () => {
    client = await pool.connect();
    const suffix = `${process.pid}-${Date.now()}`;

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Annulation lot ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const lot = await client.query(
      `INSERT INTO lots (cooperative_id, statut, poids_total_kg, entrepot)
       VALUES ($1, 'en_stock', 1000, 'Entrepôt test')
       RETURNING id`,
      [cooperativeId],
    );
    lotId = lot.rows[0].id;

    const livraison = await client.query(
      `INSERT INTO livraisons
         (cooperative_id, poids_kg, prix_unitaire_fcfa, montant_brut_fcfa,
          montant_net_fcfa, date_livraison, numero_pesee, annee_numero_pesee)
       VALUES ($1, 1000, 1000, 1000000, 1000000, CURRENT_DATE, $2, 2026)
       RETURNING id`,
      [cooperativeId, 900000 + lotId],
    );
    livraisonId = livraison.rows[0].id;

    await client.query(
      `INSERT INTO lot_livraisons (lot_id, livraison_id)
       VALUES ($1, $2)`,
      [lotId, livraisonId],
    );
  });

  afterAll(async () => {
    if (!client) return;
    try {
      await client.query("DELETE FROM lot_livraisons WHERE lot_id = $1", [lotId]);
      await client.query("DELETE FROM livraisons WHERE id = $1", [livraisonId]);
      await client.query("DELETE FROM lots WHERE id = $1", [lotId]);
      await client.query("DELETE FROM cooperatives WHERE id = $1", [cooperativeId]);
    } finally {
      client.release();
    }
  });

  it("conserve le lot annulé et libère ses livraisons", async () => {
    const response = makeResponse();

    await updateLotStatut(
      {
        user: { id: 1, cooperativeId },
        params: { id: String(lotId) },
        body: { statut: "annule" },
        log: { error: () => undefined },
      } as never,
      response as never,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({
      id: lotId,
      statut: "annule",
      nbLivraisons: 0,
      nbProducteurs: 0,
    });

    const lotRow = await client.query(
      `SELECT statut FROM lots WHERE id = $1`,
      [lotId],
    );
    const links = await client.query(
      `SELECT 1 FROM lot_livraisons WHERE lot_id = $1`,
      [lotId],
    );

    expect(lotRow.rows[0].statut).toBe("annule");
    expect(links.rowCount).toBe(0);
  });
});
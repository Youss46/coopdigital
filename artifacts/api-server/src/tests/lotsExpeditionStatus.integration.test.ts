import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { getLotTracabilite, listLots } from "../controllers/lotsController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type JsonResponse = {
  statusCode: number;
  body: unknown;
};

function makeResponse(): JsonResponse & {
  status: (code: number) => JsonResponse;
  json: (body: unknown) => JsonResponse;
} {
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

describe.skipIf(!enabled)(
  "statut d'expédition exposé par la traçabilité",
  () => {
    let client: any;
    let cooperativeId: number;
    let actorUserId: number;
    let lotWithExpeditionId: number;
    let lotWithoutExpeditionId: number;
    let oldExpeditionId: number;
    let latestExpeditionId: number;

    beforeAll(async () => {
      client = await pool.connect();
      const suffix = `${process.pid}-${Date.now()}`;

      const cooperative = await client.query(
        `INSERT INTO cooperatives (nom, ville, region)
         VALUES ($1, 'Test', 'Test')
         RETURNING id`,
        [`Statut expédition ${suffix}`],
      );
      cooperativeId = cooperative.rows[0].id;

      const actor = await client.query(
        `INSERT INTO users
          (cooperative_id, nom, prenoms, email, password_hash, role)
         VALUES ($1, 'Kouassi', 'Awa', $2, 'integration-test-hash', 'magasinier')
         RETURNING id`,
        [cooperativeId, `historique-expedition-${suffix}@example.test`],
      );
      actorUserId = actor.rows[0].id;

      const lotWithExpedition = await client.query(
        `INSERT INTO lots
          (cooperative_id, statut, poids_total_kg, entrepot)
         VALUES ($1, 'transit', 8000, 'Entrepôt test')
         RETURNING id`,
        [cooperativeId],
      );
      lotWithExpeditionId = lotWithExpedition.rows[0].id;

      const lotWithoutExpedition = await client.query(
        `INSERT INTO lots
          (cooperative_id, statut, poids_total_kg, entrepot)
         VALUES ($1, 'en_stock', 1000, 'Entrepôt test')
         RETURNING id`,
        [cooperativeId],
      );
      lotWithoutExpeditionId = lotWithoutExpedition.rows[0].id;

      const oldExpedition = await client.query(
        `INSERT INTO expeditions
          (cooperative_id, numero_expedition, type_vehicule, port, statut, created_at)
         VALUES ($1, $2, 'location', 'San Pedro', 'en_transit', '2026-01-10T08:00:00Z')
         RETURNING id`,
        [cooperativeId, `EXP-OLD-${suffix}`],
      );
      oldExpeditionId = oldExpedition.rows[0].id;

      const latestExpedition = await client.query(
        `INSERT INTO expeditions
          (cooperative_id, numero_expedition, type_vehicule, port, statut, created_at)
         VALUES ($1, $2, 'location', 'San Pedro', 'receptionne', '2026-02-10T08:00:00Z')
         RETURNING id`,
        [cooperativeId, `EXP-LATEST-${suffix}`],
      );
      latestExpeditionId = latestExpedition.rows[0].id;

      await client.query(
        `INSERT INTO expedition_lots (expedition_id, lot_id, poids_kg)
         VALUES ($1, $3, 8000), ($2, $3, 8000)`,
        [oldExpeditionId, latestExpeditionId, lotWithExpeditionId],
      );

      await client.query(
        `INSERT INTO expedition_historique
          (expedition_id, statut_precedent, statut_nouveau, date_changement, notes)
         VALUES
          ($1, NULL, 'en_preparation', '2026-02-10T09:00:00Z', NULL),
          ($1, 'en_preparation', 'charge', '2026-02-10T10:00:00Z', NULL),
          ($1, 'charge', 'receptionne', '2026-02-10T11:00:00Z', 'Réception confirmée au port')`,
        [latestExpeditionId],
      );
      await client.query(
        `UPDATE expedition_historique
            SET fait_par = $2
          WHERE expedition_id = $1
            AND statut_nouveau = 'charge'`,
        [latestExpeditionId, actorUserId],
      );
    });

    afterAll(async () => {
      if (!client) return;

      try {
        await client.query(
          `DELETE FROM expedition_historique
            WHERE expedition_id IN ($1, $2)`,
          [oldExpeditionId, latestExpeditionId],
        );
        await client.query(
          `DELETE FROM expedition_lots
            WHERE expedition_id IN ($1, $2)`,
          [oldExpeditionId, latestExpeditionId],
        );
        await client.query(
          `DELETE FROM expeditions
            WHERE id IN ($1, $2)`,
          [oldExpeditionId, latestExpeditionId],
        );
        await client.query(
          `DELETE FROM lots
            WHERE id IN ($1, $2)`,
          [lotWithExpeditionId, lotWithoutExpeditionId],
        );
        await client.query(
          `DELETE FROM users
            WHERE id = $1`,
          [actorUserId],
        );
        await client.query(
          `DELETE FROM cooperatives
            WHERE id = $1`,
          [cooperativeId],
        );
      } finally {
        client.release();
      }
    });

    it("retient la dernière expédition dans la liste des lots", async () => {
      const response = makeResponse();

      await listLots(
        {
          user: { cooperativeId },
          query: {},
          log: { error: () => undefined },
        } as never,
        response as never,
      );

      expect(response.statusCode).toBe(200);
      const rows = response.body as Array<{
        id: number;
        expeditionStatut: string | null;
        expeditionNumero: string | null;
      }>;
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: lotWithExpeditionId,
            expeditionStatut: "receptionne",
            expeditionNumero: expect.stringContaining("EXP-LATEST-"),
          }),
          expect.objectContaining({
            id: lotWithoutExpeditionId,
            expeditionStatut: null,
            expeditionNumero: null,
          }),
        ]),
      );
    });

    it("utilise la même règle dans le détail de traçabilité", async () => {
      const response = makeResponse();

      await getLotTracabilite(
        {
          user: { cooperativeId },
          params: { id: String(lotWithExpeditionId) },
          log: { error: () => undefined },
        } as never,
        response as never,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        lot: {
          id: lotWithExpeditionId,
          expeditionStatut: "receptionne",
          expeditionNumero: expect.stringContaining("EXP-LATEST-"),
        },
        expeditionHistorique: [
          { statutPrecedent: null, statutNouveau: "en_preparation", faitPar: null },
          {
            statutPrecedent: "en_preparation",
            statutNouveau: "charge",
            faitPar: actorUserId,
            faitParNom: "Kouassi",
            faitParPrenoms: "Awa",
          },
          {
            statutPrecedent: "charge",
            statutNouveau: "receptionne",
            faitPar: null,
            faitParNom: null,
            faitParPrenoms: null,
            notes: "Réception confirmée au port",
          },
        ],
      });
      const historique = (response.body as {
        expeditionHistorique: Array<{ dateChangement: string | Date }>;
      }).expeditionHistorique;
      expect(new Date(historique[0]!.dateChangement).toISOString()).toBe("2026-02-10T09:00:00.000Z");
    });

    it("conserve des statuts d'expédition nuls pour un lot sans expédition", async () => {
      const response = makeResponse();

      await getLotTracabilite(
        {
          user: { cooperativeId },
          params: { id: String(lotWithoutExpeditionId) },
          log: { error: () => undefined },
        } as never,
        response as never,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        lot: {
          id: lotWithoutExpeditionId,
          expeditionStatut: null,
          expeditionNumero: null,
        },
        expeditionHistorique: [],
      });
    });
  },
);
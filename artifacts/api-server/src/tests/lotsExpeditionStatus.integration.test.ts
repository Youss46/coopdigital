import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { getLotTracabilite, listLots, updateLotStatut } from "../controllers/lotsController.js";

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
    let lotWithLitigeId: number;
    let lotCompleteId: number;
    let oldExpeditionId: number;
    let latestExpeditionId: number;
    let litigeExpeditionId: number;
    let completeExpeditionId: number;

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

      const lotWithLitige = await client.query(
        `INSERT INTO lots
          (cooperative_id, statut, poids_total_kg, entrepot)
         VALUES ($1, 'transit', 500, 'Entrepôt test')
         RETURNING id`,
        [cooperativeId],
      );
      lotWithLitigeId = lotWithLitige.rows[0].id;

      const lotComplete = await client.query(
        `INSERT INTO lots
          (cooperative_id, statut, poids_total_kg, entrepot)
         VALUES ($1, 'transit', 1200, 'Entrepôt test')
         RETURNING id`,
        [cooperativeId],
      );
      lotCompleteId = lotComplete.rows[0].id;

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
          (cooperative_id, numero_expedition, type_vehicule, port, statut, poids_recu_port_kg, poids_accepte_port_kg, created_at)
         VALUES ($1, $2, 'location', 'San Pedro', 'receptionne', 3000, 3000, '2026-02-10T08:00:00Z')
         RETURNING id`,
        [cooperativeId, `EXP-LATEST-${suffix}`],
      );
      latestExpeditionId = latestExpedition.rows[0].id;

      await client.query(
        `INSERT INTO expedition_lots (expedition_id, lot_id, poids_kg)
         VALUES ($1, $3, 5000), ($2, $3, 3000)`,
        [oldExpeditionId, latestExpeditionId, lotWithExpeditionId],
      );

      const litigeExpedition = await client.query(
        `INSERT INTO expeditions
          (cooperative_id, numero_expedition, type_vehicule, port, statut, poids_recu_port_kg, poids_accepte_port_kg, created_at)
         VALUES ($1, $2, 'location', 'San Pedro', 'litige', 450, 400, '2026-03-10T08:00:00Z')
         RETURNING id`,
        [cooperativeId, `EXP-LITIGE-${suffix}`],
      );
      litigeExpeditionId = litigeExpedition.rows[0].id;

      await client.query(
        `INSERT INTO expedition_lots (expedition_id, lot_id, poids_kg)
         VALUES ($1, $2, 500)`,
        [litigeExpeditionId, lotWithLitigeId],
      );

      const completeExpedition = await client.query(
        `INSERT INTO expeditions
          (cooperative_id, numero_expedition, type_vehicule, port, statut, poids_recu_port_kg, poids_accepte_port_kg, created_at)
         VALUES ($1, $2, 'location', 'San Pedro', 'receptionne', 1200, 1200, '2026-04-10T08:00:00Z')
         RETURNING id`,
        [cooperativeId, `EXP-COMP-${suffix}`],
      );
      completeExpeditionId = completeExpedition.rows[0].id;

      await client.query(
        `INSERT INTO expedition_lots (expedition_id, lot_id, poids_kg)
         VALUES ($1, $2, 1200)`,
        [completeExpeditionId, lotCompleteId],
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
            WHERE expedition_id IN ($1, $2, $3, $4)`,
          [oldExpeditionId, latestExpeditionId, litigeExpeditionId, completeExpeditionId],
        );
        await client.query(
          `DELETE FROM expedition_lots
            WHERE expedition_id IN ($1, $2, $3, $4)`,
          [oldExpeditionId, latestExpeditionId, litigeExpeditionId, completeExpeditionId],
        );
        await client.query(
          `DELETE FROM expeditions
            WHERE id IN ($1, $2, $3, $4)`,
          [oldExpeditionId, latestExpeditionId, litigeExpeditionId, completeExpeditionId],
        );
        await client.query(
          `DELETE FROM lots
            WHERE id IN ($1, $2, $3, $4)`,
          [lotWithExpeditionId, lotWithoutExpeditionId, lotWithLitigeId, lotCompleteId],
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
        nombreExpeditions: number;
        expeditionsMultiples: boolean;
      }>;
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: lotWithExpeditionId,
            expeditionStatut: "receptionne",
            expeditionNumero: expect.stringContaining("EXP-LATEST-"),
            nombreExpeditions: 2,
            expeditionsMultiples: true,
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
          nombreExpeditions: 2,
          expeditionsMultiples: true,
        },
        expeditionResume: {
          nombreExpeditions: 2,
          expeditionsMultiples: true,
          poidsAttenduKg: 8000,
          poidsAttribueKg: 8000,
          poidsRecuKg: 3000,
          receptionStatut: "partielle",
        },
        expeditions: [
          { numeroExpedition: expect.stringContaining("EXP-LATEST-"), poidsAttribueKg: 3000, poidsRecuKg: 3000 },
          { numeroExpedition: expect.stringContaining("EXP-OLD-"), poidsAttribueKg: 5000, poidsRecuKg: 0 },
        ],
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

    it("signale un litige même lorsqu'une seule expédition est liée", async () => {
      const response = makeResponse();

      await getLotTracabilite(
        {
          user: { cooperativeId },
          params: { id: String(lotWithLitigeId) },
          log: { error: () => undefined },
        } as never,
        response as never,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        lot: {
          id: lotWithLitigeId,
          expeditionStatut: "litige",
          nombreExpeditions: 1,
          expeditionsMultiples: false,
        },
        expeditionResume: {
          receptionStatut: "litige",
          poidsAttenduKg: 500,
          poidsRecuKg: 450,
          poidsAccepteKg: 400,
        },
        expeditions: [
          {
            numeroExpedition: expect.stringContaining("EXP-LITIGE-"),
            statut: "litige",
            poidsRecuKg: 450,
            poidsAccepteKg: 400,
          },
        ],
      });
    });

    it("distingue une réception complète d'une réception partielle", async () => {
      const response = makeResponse();

      await getLotTracabilite(
        {
          user: { cooperativeId },
          params: { id: String(lotCompleteId) },
          log: { error: () => undefined },
        } as never,
        response as never,
      );

      expect(response.statusCode).toBe(200);
      expect(response.body).toMatchObject({
        lot: {
          id: lotCompleteId,
          expeditionStatut: "receptionne",
          nombreExpeditions: 1,
          expeditionsMultiples: false,
        },
        expeditionResume: {
          receptionStatut: "complete",
          poidsAttenduKg: 1200,
          poidsRecuKg: 1200,
          poidsAccepteKg: 1200,
        },
      });
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
        expeditionResume: {
          nombreExpeditions: 0,
          expeditionsMultiples: false,
          receptionStatut: "aucune",
        },
        expeditionHistorique: [],
      });
    });

    it("conserve la correction manuelle dans l'historique après actualisation", async () => {
      const updateResponse = makeResponse();

      await updateLotStatut(
        {
          user: { id: actorUserId, cooperativeId },
          params: { id: String(lotWithExpeditionId) },
          body: { statut: "en_stock" },
          log: { error: () => undefined },
        } as never,
        updateResponse as never,
      );

      expect(updateResponse.statusCode).toBe(200);

      const refreshResponse = makeResponse();
      await getLotTracabilite(
        {
          user: { cooperativeId },
          params: { id: String(lotWithExpeditionId) },
          log: { error: () => undefined },
        } as never,
        refreshResponse as never,
      );

      expect(refreshResponse.statusCode).toBe(200);
      const historique = (refreshResponse.body as {
        expeditionHistorique: Array<{
          expeditionNumero: string;
          statutPrecedent: string;
          statutNouveau: string;
          faitPar: number;
          dateChangement: string | Date;
          notes: string;
        }>;
      }).expeditionHistorique;

      expect(historique).toHaveLength(4);
      expect(historique.at(-1)).toMatchObject({
        expeditionNumero: expect.stringContaining("EXP-LATEST-"),
        statutPrecedent: "receptionne",
        statutNouveau: "receptionne",
        faitPar: actorUserId,
        notes: "Correction manuelle du statut du lot : transit → en_stock",
      });
      expect(new Date(historique.at(-1)!.dateChangement).getTime()).toBeGreaterThan(
        new Date(historique[2]!.dateChangement).getTime(),
      );
    });
  },
);
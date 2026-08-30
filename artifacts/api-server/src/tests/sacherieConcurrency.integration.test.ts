import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { createMouvementSacherie } from "../controllers/sacherieController.js";
import {
  calculateSacherieCentralStock,
  calculateSacherieMemberBalance,
} from "../services/sacherieRules.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type MovementResponse = {
  movement: {
    id: number;
    reference: string;
  };
  idempotent: boolean;
};

/**
 * This test deliberately sends two requests through the production controller
 * while PostgreSQL serializes both transactions on the same sack type row.
 *
 * Run explicitly against a disposable PostgreSQL database:
 * RUN_POSTGRES_INTEGRATION=1 DATABASE_URL=... \
 *   pnpm --filter @workspace/api-server test:integration:sacherie
 */
describe.skipIf(!enabled)("idempotence de la sacherie sur PostgreSQL", () => {
  let client: any;
  let server: Server | undefined;
  let baseUrl: string;
  let cooperativeId: number;
  let userId: number;
  let memberId: number;
  let campaignId: number;
  let typeSacId: number;

  const suffix = `${process.pid}_${Date.now()}`;
  const delayFunction = `task136_sacherie_delay_${suffix}`;
  const delayTrigger = `task136_sacherie_delay_trigger_${suffix}`;

  function identifier(value: string): string {
    return `"${value.replaceAll(`"`, `""`)}"`;
  }

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Sacherie idempotence ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Test', 'Sacherie', $2, 'integration-test', 'sacherie')
       RETURNING id`,
      [cooperativeId, `sacherie-${suffix}@test.invalid`],
    );
    userId = user.rows[0].id;

    const member = await client.query(
      `INSERT INTO membres
         (cooperative_id, nom, prenoms, telephone, superficie_ha,
          date_adhesion, categorie_membre, statut_membre)
       VALUES ($1, 'Membre', 'Délégué', $2, 1, '2026-01-01',
               'délégué de localités', 'actif')
       RETURNING id`,
      [cooperativeId, `070135${process.pid}`],
    );
    memberId = member.rows[0].id;

    const campaign = await client.query(
      `INSERT INTO campagnes
         (cooperative_id, libelle, annee_debut, annee_fin, date_ouverture, statut)
       VALUES ($1, 'Campagne idempotence', 2026, 2027, '2026-01-01', 'ouverte')
       RETURNING id`,
      [cooperativeId],
    );
    campaignId = campaign.rows[0].id;

    const typeSac = await client.query(
      `INSERT INTO sacherie_types_sacs
         (cooperative_id, nom, stock_minimum, cree_par)
       VALUES ($1, 'Sac test concurrence', 0, $2)
       RETURNING id`,
      [cooperativeId, userId],
    );
    typeSacId = typeSac.rows[0].id;

    await client.query(
      `INSERT INTO sacherie_mouvements
         (cooperative_id, type_sac_id, type, quantite, reference, cree_par)
       VALUES ($1, $2, 'entree', 10, $3, $4)`,
      [cooperativeId, typeSacId, `TASK136-SEED-${suffix}`, userId],
    );
    await client.query(
      `INSERT INTO sacherie_mouvements
         (cooperative_id, type_sac_id, type, quantite, membre_id,
          campagne_id, reference, cree_par)
       VALUES ($1, $2, 'attribution', 4, $3, $4, $5, $6)`,
      [cooperativeId, typeSacId, memberId, campaignId, `TASK136-ATTRIBUTION-${suffix}`, userId],
    );

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
      BEFORE INSERT ON sacherie_mouvements
      FOR EACH ROW
      WHEN (NEW.cooperative_id = ${cooperativeId}
            AND NEW.type_sac_id = ${typeSacId})
      EXECUTE FUNCTION ${identifier(delayFunction)}();
    `);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: userId, role: "sacherie", cooperativeId };
      next();
    });
    app.post("/sacherie/mouvements", createMouvementSacherie);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const runningServer = server;
    if (!runningServer) throw new Error("Serveur de test indisponible");
    const address = runningServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Serveur de test indisponible");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }

    if (!client || !cooperativeId) {
      client?.release();
      return;
    }

    await client.query(`
      DROP TRIGGER IF EXISTS ${identifier(delayTrigger)}
        ON sacherie_mouvements;
      DROP FUNCTION IF EXISTS ${identifier(delayFunction)}();
    `);
    await client.query(
      `DELETE FROM sacherie_mouvements WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(
      `DELETE FROM sacherie_types_sacs WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    await client.query(`DELETE FROM membres WHERE id = $1`, [memberId]);
    await client.query(`DELETE FROM campagnes WHERE id = $1`, [campaignId]);
    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
    client.release();
  });

  async function request(quantity: number): Promise<Response> {
    return fetch(`${baseUrl}/sacherie/mouvements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "retour",
        typeSacId,
        quantite: quantity,
        membreId: memberId,
        reference: `TASK136-RETURN-${suffix}`,
      }),
    });
  }

  it("retourne le même mouvement et ne débite qu'une fois malgré deux retours concurrents", async () => {
    const responses = await Promise.all([request(4), request(4)]);
    const bodies = await Promise.all(
      responses.map((response) => response.json() as Promise<MovementResponse>),
    );

    expect(responses.map((response) => response.status).sort()).toEqual([200, 201]);
    expect(bodies[0].movement).toEqual(bodies[1].movement);
    expect(bodies.map((body) => body.idempotent).sort()).toEqual([false, true]);

    const movements = await client.query(
      `SELECT type, quantite, membre_id AS "membreId", sens
       FROM sacherie_mouvements
       WHERE cooperative_id = $1 AND type_sac_id = $2
       ORDER BY id`,
      [cooperativeId, typeSacId],
    );
    expect(movements.rows).toHaveLength(3);
    expect(movements.rows.filter((movement: { type: string }) => movement.type === "retour")).toHaveLength(1);
    expect(calculateSacherieCentralStock(movements.rows)).toBe(10);
    expect(calculateSacherieMemberBalance(movements.rows, memberId)).toBe(0);

    const conflicting = await request(5);
    expect(conflicting.status).toBe(409);
    expect(await conflicting.json()).toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });

    const afterConflict = await client.query(
      `SELECT count(*)::int AS count
       FROM sacherie_mouvements
       WHERE cooperative_id = $1 AND reference = $2`,
      [cooperativeId, `TASK136-RETURN-${suffix}`],
    );
    expect(afterConflict.rows[0].count).toBe(1);
  });
});
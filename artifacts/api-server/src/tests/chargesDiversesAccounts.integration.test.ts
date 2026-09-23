import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { handleCreateChargeDiverses } from "../controllers/chargesDiversesController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("validation du compte de charge sur PostgreSQL", () => {
  let client: any;
  let server: Server | undefined;
  let baseUrl: string;
  let cooperativeId: number;
  let userId: number;

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Charges diverses comptes ${process.pid}_${Date.now()}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Auteur', 'Charge', $2, 'integration-only', 'comptable')
       RETURNING id`,
      [cooperativeId, `charges-accounts-${process.pid}@example.test`],
    );
    userId = user.rows[0].id;

    await client.query(
      `INSERT INTO plan_comptable
         (cooperative_id, numero_compte, libelle, type, classe, actif)
       VALUES
         ($1, '604000', 'Achats de fournitures', 'charge', 6, true),
         ($1, '605000', 'Compte de charge désactivé', 'charge', 6, false),
         ($1, '706000', 'Ventes de produits', 'produit', 7, true)`,
      [cooperativeId],
    );

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: userId, role: "comptable", cooperativeId };
      req.log = { error: () => undefined } as any;
      next();
    });
    app.post("/charges-diverses", handleCreateChargeDiverses);

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
    try {
      if (server) {
        await new Promise<void>((resolve, reject) =>
          server!.close((error) => (error ? reject(error) : resolve())),
        );
      }

      if (!client || !cooperativeId) return;
      await client.query("BEGIN");
      try {
        await client.query(
          `DELETE FROM charges_diverses WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM plan_comptable WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
        await client.query(`DELETE FROM cooperatives WHERE id = $1`, [
          cooperativeId,
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

  async function createCharge(compteDebit: string): Promise<Response> {
    return fetch(`${baseUrl}/charges-diverses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date_charge: "2026-09-23",
        libelle: `Test compte ${compteDebit}`,
        montant_fcfa: 1000,
        categorie: "autre",
        compte_debit: compteDebit,
        compte_credit: "401000",
        mode_paiement: "credit",
        tiers: "Fournisseur test",
      }),
    });
  }

  it("accepte un compte de charge actif et refuse les comptes inactifs ou d'un autre type", async () => {
    const activeResponse = await createCharge("604000");
    expect(activeResponse.status).toBe(201);
    const activePayload = await activeResponse.json() as { compte_debit?: string };
    expect(activePayload.compte_debit).toBe("604000");

    for (const compteDebit of ["605000", "706000"]) {
      const response = await createCharge(compteDebit);
      expect(response.status).toBe(400);
      const errorPayload = await response.json() as { erreur?: string };
      expect(errorPayload.erreur).toMatch(/plan comptable actif/i);
    }

    const charges = await client.query(
      `SELECT compte_debit
       FROM charges_diverses
       WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    expect(charges.rows).toEqual([{ compte_debit: "604000" }]);
  });
});
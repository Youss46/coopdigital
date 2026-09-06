import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { handleReglerChargeFournisseur } from "../controllers/chargesDiversesController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("règlement fournisseur concurrent sur PostgreSQL", () => {
  let client: any;
  let server: Server | undefined;
  let baseUrl: string;
  let cooperativeId: number;
  let userId: number;
  let bankAccountId: number;
  let chargeId: number;

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Charges diverses concurrency ${process.pid}_${Date.now()}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Auteur', 'Règlement', $2, 'integration-only', 'comptable')
       RETURNING id`,
      [cooperativeId, `charges-concurrency-${process.pid}@example.test`],
    );
    userId = user.rows[0].id;

    await client.query(
      `INSERT INTO config_comptable (cooperative_id, auto_maintenances)
       VALUES ($1, true)`,
      [cooperativeId],
    );

    const account = await client.query(
      `INSERT INTO comptes_bancaires
         (cooperative_id, nom, banque, solde_actuel_fcfa,
          solde_mini_alerte_fcfa, actif)
       VALUES ($1, 'Compte règlement concurrency', 'Banque test', 100000, 0, true)
       RETURNING id`,
      [cooperativeId],
    );
    bankAccountId = account.rows[0].id;

    const charge = await client.query(
      `INSERT INTO charges_diverses
         (cooperative_id, date_charge, libelle, montant_fcfa,
          categorie, compte_debit, compte_credit, mode_paiement, tiers,
          reference_piece, statut, created_by, approved_by, approved_at)
       VALUES ($1, CURRENT_DATE, 'Dette fournisseur concurrency', 50000,
               'autre', '604000', '401000', 'credit', 'Fournisseur test',
               $2, 'valide', $3, $3, NOW())
       RETURNING id`,
      [cooperativeId, `FACT-CONCURRENCY-${process.pid}`, userId],
    );
    chargeId = charge.rows[0].id;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: userId, role: "comptable", cooperativeId };
      req.log = { error: () => undefined } as any;
      next();
    });
    app.post("/charges-diverses/:id/regler", handleReglerChargeFournisseur);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const runningServer = server;
    if (!runningServer) {
      throw new Error("Serveur de test indisponible");
    }
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
          `DELETE FROM charges_diverses WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM config_comptable WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM comptes_bancaires WHERE cooperative_id = $1`,
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

  it("ne débite qu'une seule fois et renvoie un conflit au second appel", async () => {
    const body = {
      date_reglement: new Date().toISOString().slice(0, 10),
      compte_tresorerie_id: bankAccountId,
      compte_tresorerie_type: "banque",
      reference: `REG-CONCURRENCY-${chargeId}`,
    };

    const responses = await Promise.all([
      fetch(`${baseUrl}/charges-diverses/${chargeId}/regler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      fetch(`${baseUrl}/charges-diverses/${chargeId}/regler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    ]);
    const statuses = responses.map((response) => response.status).sort();

    expect(statuses).toEqual([200, 409]);
    expect(await responses.find((response) => response.status === 409)?.json()).toEqual({
      erreur: "Cette dette fournisseur est introuvable ou déjà réglée",
    });

    const [charge, account, movements, accounting] = await Promise.all([
      client.query(
        `SELECT statut, montant_regle_fcfa, regle_par, compte_reglement_id,
                compte_reglement_type
         FROM charges_diverses
         WHERE id = $1`,
        [chargeId],
      ),
      client.query(
        `SELECT solde_actuel_fcfa
         FROM comptes_bancaires
         WHERE id = $1`,
        [bankAccountId],
      ),
      client.query(
        `SELECT count(*)::int AS count, COALESCE(SUM(montant_fcfa), 0)::numeric AS total
         FROM mouvements_banque
         WHERE compte_id = $1 AND motif = 'paiement_fournisseur'
           AND reference = $2`,
        [bankAccountId, body.reference],
      ),
      client.query(
        `SELECT count(*)::int AS count, COALESCE(SUM(montant_fcfa), 0)::numeric AS total,
                compte_debit, compte_credit
         FROM ecritures_comptables
         WHERE cooperative_id = $1
           AND source = 'paiement'
           AND source_id = $2
         GROUP BY compte_debit, compte_credit`,
        [cooperativeId, chargeId],
      ),
    ]);

    expect(charge.rows).toEqual([
      {
        statut: "reglee",
        montant_regle_fcfa: 50000,
        regle_par: userId,
        compte_reglement_id: bankAccountId,
        compte_reglement_type: "banque",
      },
    ]);
    expect(account.rows[0].solde_actuel_fcfa).toBe("50000");
    expect(movements.rows).toEqual([
      { count: 1, total: "50000", },
    ]);
    expect(accounting.rows).toEqual([
      {
        count: 1,
        total: "50000",
        compte_debit: "401000",
        compte_credit: "521000",
      },
    ]);
  });
});
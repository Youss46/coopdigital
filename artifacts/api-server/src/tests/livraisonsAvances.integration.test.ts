import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { createLivraison } from "../controllers/livraisonsController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)(
  "retenues d'avances lors de la création HTTP d'une livraison sur PostgreSQL",
  () => {
    let client: any;
    let server: any;
    let baseUrl: string;
    let cooperativeId: number;
    let campagneId: number;
    let membreId: number;
    let userId: number;

    beforeAll(async () => {
      client = await pool.connect();

      const cooperative = await client.query(
        `INSERT INTO cooperatives (nom, ville, region)
         VALUES ($1, 'Test', 'Test')
         RETURNING id`,
        [`Retenues livraison ${process.pid}-${Date.now()}`],
      );
      cooperativeId = cooperative.rows[0].id;

      const user = await client.query(
        `INSERT INTO users
           (cooperative_id, nom, prenoms, email, password_hash, role)
         VALUES ($1, 'Test', 'Retenues', $2, 'integration-test', 'comptable')
         RETURNING id`,
        [cooperativeId, `retenues-${process.pid}-${Date.now()}@test.local`],
      );
      userId = user.rows[0].id;

      const campagne = await client.query(
        `INSERT INTO campagnes
           (cooperative_id, libelle, annee_debut, annee_fin,
            date_ouverture, statut)
         VALUES ($1, 'Campagne retenues livraison', 2026, 2027,
                 '2026-01-01', 'ouverte')
         RETURNING id`,
        [cooperativeId],
      );
      campagneId = campagne.rows[0].id;

      const membre = await client.query(
        `INSERT INTO membres
           (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion)
         VALUES ($1, 'Producteur', 'Retenue', $2, 1, '2026-01-01')
         RETURNING id`,
        [cooperativeId, `0700${process.pid}${Date.now()}`.slice(0, 10)],
      );
      membreId = membre.rows[0].id;

      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => {
        req.user = {
          cooperativeId,
          id: userId,
          role: "comptable",
        };
        req.log = { error: () => undefined } as unknown as typeof req.log;
        next();
      });
      app.post("/livraisons", createLivraison);

      await new Promise<void>((resolve, reject) => {
        server = app.listen(0, "127.0.0.1", (error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Serveur de test indisponible");
      }
      baseUrl = `http://127.0.0.1:${address.port}`;
    });

    beforeEach(async () => {
      await client.query("BEGIN");
      try {
        await client.query(
          `DELETE FROM remboursements_avances_membres
           WHERE avance_id IN (
             SELECT id FROM avances WHERE membre_id = $1
           )`,
          [membreId],
        );
        await client.query(
          `DELETE FROM ecritures_comptables WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM paiements WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM livraisons WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(`DELETE FROM avances WHERE membre_id = $1`, [membreId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });

    afterAll(async () => {
      if (server) {
        await new Promise<void>((resolve, reject) => {
          server.close((error: Error | undefined) =>
            error ? reject(error) : resolve(),
          );
        });
      }

      if (!client) return;

      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM remboursements_avances_membres
           WHERE avance_id IN (
             SELECT id FROM avances WHERE membre_id = $1
           )`,
          [membreId],
        );
        await client.query(
          `DELETE FROM ecritures_comptables WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM paiements WHERE cooperative_id = $1`,
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
          `DELETE FROM livraisons WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(`DELETE FROM avances WHERE membre_id = $1`, [membreId]);
        await client.query(`DELETE FROM membres WHERE id = $1`, [membreId]);
        await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
        await client.query(`DELETE FROM campagnes WHERE id = $1`, [campagneId]);
        await client.query(
          `DELETE FROM cooperatives WHERE id = $1`,
          [cooperativeId],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    });

    async function createAdvance(values: {
      amount: number;
      reportDate: string | null;
      dueDate?: string;
      status?: "en_cours" | "en_retard";
    }): Promise<number> {
      const result = await client.query(
        `INSERT INTO avances
           (membre_id, montant_octroye_fcfa, montant_rembourse_fcfa,
            solde_restant_fcfa, date_octroi, date_echeance, statut,
            plan_type, report_date, deduction_source)
         VALUES ($1, $2, 0, $2, '2026-08-01', $3, $4, 'integral', $5, 'livraison')
         RETURNING id`,
        [
          membreId,
          values.amount,
          values.dueDate ?? null,
          values.status ?? "en_cours",
          values.reportDate,
        ],
      );
      return result.rows[0].id;
    }

    async function postLivraison(dateLivraison: string) {
      return fetch(`${baseUrl}/livraisons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membreId,
          poidsKg: 10,
          prixUnitaireFcfa: 1000,
          dateLivraison,
          campagneId,
          modePaiement: "especes",
        }),
      });
    }

    it("ignore une avance avant reportDate", async () => {
      const avanceId = await createAdvance({
        amount: 30_000,
        reportDate: "2026-09-10",
      });

      const response = await postLivraison("2026-09-09");
      expect(response.status).toBe(201);
      const body = await response.json() as {
        livraison: { id: number; avanceDeduiteFcfa: number; montantNetFcfa: number };
      };

      expect(body.livraison.avanceDeduiteFcfa).toBe(0);
      expect(body.livraison.montantNetFcfa).toBe(10_000);

      const state = await client.query(
        `SELECT solde_restant_fcfa, montant_rembourse_fcfa
           FROM avances WHERE id = $1`,
        [avanceId],
      );
      const history = await client.query(
        `SELECT count(*)::int AS count
           FROM remboursements_avances_membres
          WHERE avance_id = $1`,
        [avanceId],
      );

      expect(state.rows[0]).toEqual({
        solde_restant_fcfa: 30_000,
        montant_rembourse_fcfa: 0,
      });
      expect(history.rows[0].count).toBe(0);
    });

    it("retient une avance échue sans dépasser le brut et enregistre son historique", async () => {
      const avanceId = await createAdvance({
        amount: 30_000,
        reportDate: "2026-09-01",
        dueDate: "2026-09-05",
        status: "en_retard",
      });

      const response = await postLivraison("2026-09-10");
      expect(response.status).toBe(201);
      const body = await response.json() as {
        livraison: { id: number; avanceDeduiteFcfa: number; montantNetFcfa: number };
      };

      expect(body.livraison.avanceDeduiteFcfa).toBe(10_000);
      expect(body.livraison.montantNetFcfa).toBe(0);

      const state = await client.query(
        `SELECT solde_restant_fcfa, montant_rembourse_fcfa, statut
           FROM avances WHERE id = $1`,
        [avanceId],
      );
      const history = await client.query(
        `SELECT montant_fcfa, livraison_id, note
           FROM remboursements_avances_membres
          WHERE avance_id = $1`,
        [avanceId],
      );

      expect(state.rows[0]).toEqual({
        solde_restant_fcfa: 20_000,
        montant_rembourse_fcfa: 10_000,
        statut: "en_retard",
      });
      expect(history.rows).toHaveLength(1);
      expect(history.rows[0].montant_fcfa).toBe(10_000);
      expect(history.rows[0].note).toBe("Déduction automatique sur livraison");
      expect(history.rows[0].livraison_id).toBe(body.livraison.id);
    });
  },
);
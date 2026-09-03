import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  addLigne,
  creerLivraisonDepuisSession,
  createExpeditionControlSession,
  terminerSession,
} from "../services/peseeSessionService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type EffectCounts = {
  livraisons: number;
  paiements: number;
  commissionsMembres: number;
  commissionsDelegues: number;
  avances: number;
  ventesExportateurs: number;
  mouvementsStock: number;
  mouvementsStockDelegues: number;
  ecrituresComptables: number;
};

describe.skipIf(!enabled)(
  "contrôle de chargement sans effet financier ni stock sur PostgreSQL",
  () => {
    let client: any;
    let cooperativeId: number;
    let campaignId: number;
    let expeditionId: number;
    let sessionId: number;

    async function readEffectCounts(): Promise<EffectCounts> {
      const result = await client.query(
        `SELECT
           (SELECT count(*)::int
              FROM livraisons
             WHERE campagne_id = $1) AS livraisons,
           (SELECT count(*)::int
              FROM paiements
             WHERE campagne_id = $1) AS paiements,
           (SELECT count(*)::int
              FROM commissions_membres_delegues c
              JOIN membres m ON m.id = c.membre_delegue_id
             WHERE m.cooperative_id = $2) AS "commissionsMembres",
           (SELECT count(*)::int
              FROM commissions_delegues c
              JOIN users u ON u.id = c.delegue_id
             WHERE u.cooperative_id = $2) AS "commissionsDelegues",
           (SELECT count(*)::int
              FROM avances a
              JOIN membres m ON m.id = a.membre_id
             WHERE m.cooperative_id = $2) AS avances,
           (SELECT count(*)::int
              FROM ventes_exportateurs
             WHERE expedition_id = $3) AS "ventesExportateurs",
           (SELECT count(*)::int
              FROM mouvements_stock ms
              JOIN entrepots e ON e.id = ms.entrepot_id
             WHERE e.cooperative_id = $2) AS "mouvementsStock",
           (SELECT count(*)::int
              FROM entrepot_mouvements em
              JOIN entrepots_delegues ed ON ed.id = em.entrepot_id
             WHERE ed.cooperative_id = $2) AS "mouvementsStockDelegues",
           (SELECT count(*)::int
              FROM ecritures_comptables
             WHERE cooperative_id = $2) AS "ecrituresComptables"`,
        [campaignId, cooperativeId, expeditionId],
      );

      return result.rows[0] as EffectCounts;
    }

    beforeAll(async () => {
      client = await pool.connect();
      const suffix = `${process.pid}-${Date.now()}`;

      const cooperative = await client.query(
        `INSERT INTO cooperatives (nom, ville, region)
         VALUES ($1, 'Test', 'Test')
         RETURNING id`,
        [`Contrôle chargement ${suffix}`],
      );
      cooperativeId = cooperative.rows[0].id;

      const campaign = await client.query(
        `INSERT INTO campagnes
          (cooperative_id, libelle, annee_debut, annee_fin,
           date_ouverture, statut)
         VALUES ($1, 'Campagne contrôle chargement', 2026, 2027,
                 '2026-01-01', 'ouverte')
         RETURNING id`,
        [cooperativeId],
      );
      campaignId = campaign.rows[0].id;

      const expedition = await client.query(
        `INSERT INTO expeditions
          (cooperative_id, numero_expedition, type_vehicule, port,
           statut, exportateur_nom)
         VALUES ($1, $2, 'location', 'San Pedro', 'en_preparation',
                 'Exportateur de test')
         RETURNING id`,
        [cooperativeId, `EXP-CONTROLE-${suffix}`],
      );
      expeditionId = expedition.rows[0].id;

      // Some disposable databases are provisioned by schema push rather than
      // by the migration that introduced this index. The production service
      // relies on this constraint for its atomic weighing-number reservation.
      await client.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS
           sequences_pesee_cooperative_annee_unique
           ON sequences_pesee (cooperative_id, annee)`,
      );
    });

    afterAll(async () => {
      if (!client) return;

      try {
        if (cooperativeId) {
          await client.query(
            `DELETE FROM ecritures_en_attente
              WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM ecritures_comptables
              WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM commissions_delegues
              WHERE livraison_id IN (
                SELECT id FROM livraisons WHERE campagne_id = $1
              )`,
            [campaignId],
          );
          await client.query(
            `DELETE FROM commissions_membres_delegues
              WHERE session_pesee_id = $1`,
            [sessionId],
          );
          await client.query(
            `DELETE FROM remboursements_avances_membres
              WHERE avance_id IN (
                SELECT a.id
                  FROM avances a
                  JOIN membres m ON m.id = a.membre_id
                 WHERE m.cooperative_id = $1
              )`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM avances
              WHERE membre_id IN (
                SELECT id FROM membres WHERE cooperative_id = $1
              )`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM paiements
              WHERE campagne_id = $1`,
            [campaignId],
          );
          await client.query(
            `DELETE FROM livraisons
              WHERE campagne_id = $1`,
            [campaignId],
          );
          await client.query(
            `DELETE FROM ventes_exportateurs
              WHERE expedition_id = $1`,
            [expeditionId],
          );
          await client.query(
            `DELETE FROM mouvements_stock
              WHERE entrepot_id IN (
                SELECT id FROM entrepots WHERE cooperative_id = $1
              )`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM sessions_pesee
              WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM expeditions
              WHERE id = $1`,
            [expeditionId],
          );
          await client.query(
            `DELETE FROM historique_prix
              WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM campagnes
              WHERE id = $1`,
            [campaignId],
          );
          await client.query(
            `DELETE FROM cooperatives
              WHERE id = $1`,
            [cooperativeId],
          );
        }
      } finally {
        client.release();
      }
    });

    it("clôture les passages sans livraison, paiement, commission, avance, vente ni stock", async () => {
      const before = await readEffectCounts();

      const session = await createExpeditionControlSession(
        cooperativeId,
        expeditionId,
        { certificationCacao: "ORDINAIRE" },
      );
      sessionId = session.id;

      await addLigne(cooperativeId, sessionId, {
        nbSacs: 10,
        poidsBrutKg: 510,
        tareKg: 10,
      });
      await addLigne(cooperativeId, sessionId, {
        nbSacs: 6,
        poidsBrutKg: 306,
        tareKg: 6,
      });

      const terminee = await terminerSession(cooperativeId, sessionId);

      expect(terminee).toMatchObject({
        id: sessionId,
        operation: "controle_chargement",
        expeditionId,
        statut: "terminee",
        livraisonId: null,
        nbSacsTotal: 16,
        poidsTotalKg: "800.000",
      });
      expect(await readEffectCounts()).toEqual(before);

      await expect(
        creerLivraisonDepuisSession(cooperativeId, sessionId, {}),
      ).rejects.toThrow(
        "Une pesée de contrôle de chargement ne peut pas être convertie en livraison",
      );

      expect(await readEffectCounts()).toEqual(before);

      const persistedSession = await client.query(
        `SELECT statut, operation, expedition_id, livraison_id
           FROM sessions_pesee
          WHERE id = $1`,
        [sessionId],
      );
      expect(persistedSession.rows[0]).toEqual({
        statut: "terminee",
        operation: "controle_chargement",
        expedition_id: expeditionId,
        livraison_id: null,
      });
    });
  },
);
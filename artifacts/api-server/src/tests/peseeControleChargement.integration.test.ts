import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  addLigne,
  creerLivraisonDepuisSession,
  createExpeditionControlSession,
  terminerSession,
  SessionExpeditionExistanteError,
} from "../services/peseeSessionService.js";
import { changerStatut } from "../services/expeditionsService.js";

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
    let concurrentExpeditionId: number;
    let testUserId: number;
    let sessionId: number;
    let transitionExpeditionSequence = 0;

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

    async function setControleChargementObligatoire(obligatoire: boolean) {
      await client.query(
        `UPDATE config_cooperative
            SET controle_chargement_obligatoire = $2
          WHERE cooperative_id = $1`,
        [cooperativeId, obligatoire],
      );
    }

    async function createTransitionExpedition(poidsChargeKg: number): Promise<number> {
      transitionExpeditionSequence += 1;
      const expedition = await client.query(
        `INSERT INTO expeditions
          (cooperative_id, numero_expedition, type_vehicule, port,
           poids_charge_kg, statut, exportateur_nom)
         VALUES ($1, $2, 'location', 'San Pedro', $3, 'en_preparation',
                 'Exportateur de test')
         RETURNING id`,
        [
          cooperativeId,
          `ET-${process.pid}-${Date.now()}-${transitionExpeditionSequence}`,
          poidsChargeKg,
        ],
      );
      return expedition.rows[0].id;
    }

    async function createTermineeControl(expeditionIdToControl: number, poidsNetKg: number) {
      const session = await createExpeditionControlSession(
        cooperativeId,
        expeditionIdToControl,
        { certificationCacao: "ORDINAIRE" },
      );
      await addLigne(cooperativeId, session.id, {
        nbSacs: 10,
        poidsBrutKg: poidsNetKg + 10,
        tareKg: 10,
      });
      return terminerSession(cooperativeId, session.id);
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

      const user = await client.query(
        `INSERT INTO users
          (cooperative_id, nom, prenoms, email, password_hash, role)
         VALUES ($1, 'Test', 'Chargement', $2, 'integration-test-hash', 'magasinier')
         RETURNING id`,
        [cooperativeId, `controle-chargement-${suffix}@example.test`],
      );
      testUserId = user.rows[0].id;

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

      // Certaines bases de test sont provisionnées à partir d'une baseline
      // antérieure à la migration du contrôle de chargement.
      await client.query(
        `ALTER TABLE config_cooperative
           ADD COLUMN IF NOT EXISTS controle_chargement_obligatoire
           boolean NOT NULL DEFAULT false`,
      );
      await client.query(
        `INSERT INTO config_cooperative
          (cooperative_id, controle_chargement_obligatoire)
         VALUES ($1, true)`,
        [cooperativeId],
      );

      const expedition = await client.query(
        `INSERT INTO expeditions
          (cooperative_id, numero_expedition, type_vehicule, port,
           statut, exportateur_nom)
         VALUES ($1, $2, 'location', 'San Pedro', 'en_preparation',
                 'Exportateur de test')
         RETURNING id`,
        [cooperativeId, `E-${suffix}`],
      );
      expeditionId = expedition.rows[0].id;

      const concurrentExpedition = await client.query(
        `INSERT INTO expeditions
          (cooperative_id, numero_expedition, type_vehicule, port,
           statut, exportateur_nom)
         VALUES ($1, $2, 'location', 'San Pedro', 'en_preparation',
                 'Exportateur de test')
         RETURNING id`,
        [cooperativeId, `EC-${suffix}`],
      );
      concurrentExpeditionId = concurrentExpedition.rows[0].id;

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
            `DELETE FROM config_comptable
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
              WHERE expedition_id IN (
                SELECT id FROM expeditions WHERE cooperative_id = $1
              )
                OR exportateur_id IN (
                SELECT id FROM exportateurs WHERE cooperative_id = $1
              )`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM exportateurs
              WHERE cooperative_id = $1`,
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
            `DELETE FROM expedition_lots
              WHERE expedition_id IN (
                SELECT id FROM expeditions WHERE cooperative_id = $1
              )`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM lots
              WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM entrepots
              WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM sessions_pesee
              WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM sequences_pesee
              WHERE cooperative_id = $1`,
            [cooperativeId],
          );
          await client.query(
            `DELETE FROM expeditions
              WHERE cooperative_id = $1`,
            [cooperativeId],
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
            `DELETE FROM users
              WHERE id = $1`,
            [testUserId],
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

    it("refuse le chargement sans contrôle clôturé et conserve le statut", async () => {
      await setControleChargementObligatoire(true);

      await expect(
        changerStatut(cooperativeId, expeditionId, 1, "charge"),
      ).rejects.toThrow(
        "Le contrôle de chargement doit être clôturé avec un écart acceptable ou à justifier avant de confirmer le chargement",
      );

      const persisted = await client.query(
        `SELECT statut FROM expeditions WHERE id = $1`,
        [expeditionId],
      );
      expect(persisted.rows[0].statut).toBe("en_preparation");
    });

    it("autorise le chargement après un contrôle conforme", async () => {
      await setControleChargementObligatoire(true);
      const id = await createTransitionExpedition(1000);

      const controle = await createTermineeControl(id, 1000);
      expect(controle.statut).toBe("terminee");

      await expect(
        changerStatut(cooperativeId, id, 1, "charge"),
      ).resolves.toMatchObject({ ok: true, statut: "charge" });

      const persisted = await client.query(
        `SELECT statut FROM expeditions WHERE id = $1`,
        [id],
      );
      expect(persisted.rows[0].statut).toBe("charge");
    });

    it("autorise le chargement après un contrôle à justifier", async () => {
      await setControleChargementObligatoire(true);
      const id = await createTransitionExpedition(1000);

      const controle = await createTermineeControl(id, 1030);
      expect(controle.statut).toBe("terminee");

      await expect(
        changerStatut(cooperativeId, id, 1, "charge"),
      ).resolves.toMatchObject({ ok: true, statut: "charge" });

      const persisted = await client.query(
        `SELECT statut FROM expeditions WHERE id = $1`,
        [id],
      );
      expect(persisted.rows[0].statut).toBe("charge");
    });

    it("n'accepte qu'une confirmation concurrente et ne duplique pas ses effets", async () => {
      await setControleChargementObligatoire(false);

      const id = await createTransitionExpedition(1000);
      const expedition = await client.query(
        `SELECT numero_expedition FROM expeditions WHERE id = $1`,
        [id],
      );
      const numeroExpedition = expedition.rows[0].numero_expedition;

      const entrepot = await client.query(
        `INSERT INTO entrepots
          (cooperative_id, nom, ville, capacite_kg)
         VALUES ($1, $2, 'Test', 5000)
         RETURNING id`,
        [cooperativeId, `Entrepôt concurrence ${id}`],
      );
      const lot = await client.query(
        `INSERT INTO lots
          (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
         VALUES ($1, $2, 1000, $3, 20)
         RETURNING id`,
        [cooperativeId, campaignId, `Entrepôt concurrence ${id}`],
      );
      await client.query(
        `INSERT INTO expedition_lots
          (expedition_id, lot_id, poids_kg, nombre_sacs)
         VALUES ($1, $2, 1000, 20)`,
        [id, lot.rows[0].id],
      );
      const exportateur = await client.query(
        `INSERT INTO exportateurs
          (cooperative_id, nom)
         VALUES ($1, 'Exportateur concurrence')
         RETURNING id`,
        [cooperativeId],
      );
      await client.query(
        `INSERT INTO ventes_exportateurs
          (exportateur_id, lot_id, expedition_id, campagne_id,
           poids_kg, prix_unitaire_fcfa, montant_total_fcfa,
           date_vente, solde_du_fcfa)
         VALUES ($1, $2, $3, $4, 1000, 500, 500000, CURRENT_DATE, 500000)`,
        [exportateur.rows[0].id, lot.rows[0].id, id, campaignId],
      );
      await client.query(
        `UPDATE config_comptable
            SET auto_stocks = true
          WHERE cooperative_id = $1`,
        [cooperativeId],
      );

      const results = await Promise.allSettled([
        changerStatut(cooperativeId, id, testUserId, "charge"),
        changerStatut(cooperativeId, id, testUserId, "charge"),
      ]);

      const successes = results.filter(
        (result): result is PromiseFulfilledResult<{ ok: boolean; statut: string }> =>
          result.status === "fulfilled",
      );
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      expect(successes).toHaveLength(1);
      expect(successes[0].value).toEqual({ ok: true, statut: "charge" });
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toBeInstanceOf(Error);
      expect(failures[0].reason.message).toBe(
        "Transition charge → charge non autorisée",
      );

      const persisted = await client.query(
        `SELECT statut FROM expeditions WHERE id = $1`,
        [id],
      );
      expect(persisted.rows[0].statut).toBe("charge");

      const history = await client.query(
        `SELECT count(*)::int AS count
           FROM expedition_historique
          WHERE expedition_id = $1
            AND statut_precedent = 'en_preparation'
            AND statut_nouveau = 'charge'`,
        [id],
      );
      expect(history.rows[0].count).toBe(1);

      const movements = await client.query(
        `SELECT count(*)::int AS count
           FROM mouvements_stock
          WHERE entrepot_id = $1
            AND motif = $2`,
        [entrepot.rows[0].id, `Chargement expédition ${numeroExpedition}`],
      );
      expect(movements.rows[0].count).toBe(1);

      const accounting = await client.query(
        `SELECT (
           (SELECT count(*)
              FROM ecritures_comptables
             WHERE cooperative_id = $1
               AND source = 'stock'
               AND source_id = $2)
           +
           (SELECT count(*)
              FROM ecritures_en_attente
             WHERE cooperative_id = $1
               AND source = 'stock'
               AND source_id = $2)
         )::int AS count`,
        [cooperativeId, id],
      );
      expect(accounting.rows[0].count).toBe(1);
    });

    it("préserve le comportement historique quand le contrôle obligatoire est désactivé", async () => {
      await setControleChargementObligatoire(false);
      const id = await createTransitionExpedition(1000);

      await expect(
        changerStatut(cooperativeId, id, 1, "charge"),
      ).resolves.toMatchObject({ ok: true, statut: "charge" });

      const persisted = await client.query(
        `SELECT statut FROM expeditions WHERE id = $1`,
        [id],
      );
      expect(persisted.rows[0].statut).toBe("charge");
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

    it("ne conserve qu'une session quand deux contrôles démarrent en concurrence", async () => {
      const results = await Promise.allSettled([
        createExpeditionControlSession(
          cooperativeId,
          concurrentExpeditionId,
          { certificationCacao: "ORDINAIRE" },
        ),
        createExpeditionControlSession(
          cooperativeId,
          concurrentExpeditionId,
          { certificationCacao: "ORDINAIRE" },
        ),
      ]);

      const successes = results.filter(
        (result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof createExpeditionControlSession>>> =>
          result.status === "fulfilled",
      );
      const failures = results.filter(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].reason).toBeInstanceOf(SessionExpeditionExistanteError);
      expect(failures[0].reason).toMatchObject({
        code: "SESSION_EXPEDITION_EXISTANTE",
      });

      const persisted = await client.query(
        `SELECT count(*)::int AS count
           FROM sessions_pesee
          WHERE cooperative_id = $1
            AND expedition_id = $2
            AND operation = 'controle_chargement'
            AND statut = 'en_cours'`,
        [cooperativeId, concurrentExpeditionId],
      );
      expect(persisted.rows[0].count).toBe(1);
    });
  },
);
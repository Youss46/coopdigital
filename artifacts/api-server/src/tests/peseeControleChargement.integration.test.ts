import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  addLigne,
  creerLivraisonDepuisSession,
  createExpeditionControlSession,
  terminerSession,
  SessionExpeditionExistanteError,
} from "../services/peseeSessionService.js";
import { changerStatut, confirmerReception } from "../services/expeditionsService.js";

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
            `DELETE FROM traitements_refus
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
      const nomEntrepot = `Entrepôt concurrence ${id}`;

      const entrepot = await client.query(
        `INSERT INTO entrepots
          (cooperative_id, nom, ville, capacite_kg)
         VALUES ($1, $2, 'Test', 5000)
         RETURNING id`,
        [cooperativeId, nomEntrepot],
      );
      const lot = await client.query(
        `INSERT INTO lots
          (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
         VALUES ($1, $2, 1000, $3, 20)
         RETURNING id`,
        [cooperativeId, campaignId, nomEntrepot],
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

    it("annule le chargement, les sorties et l'historique si l'écriture comptable échoue", async () => {
      await setControleChargementObligatoire(false);

      const id = await createTransitionExpedition(1000);
      const expedition = await client.query(
        `SELECT numero_expedition FROM expeditions WHERE id = $1`,
        [id],
      );
      const numeroExpedition = expedition.rows[0].numero_expedition;
      const entrepotA = await client.query(
        `INSERT INTO entrepots
          (cooperative_id, nom, ville, capacite_kg)
         VALUES ($1, $2, 'Test', 5000)
         RETURNING id`,
        [cooperativeId, `Entrepôt atomique A ${id}`],
      );
      const entrepotB = await client.query(
        `INSERT INTO entrepots
          (cooperative_id, nom, ville, capacite_kg)
         VALUES ($1, $2, 'Test', 5000)
         RETURNING id`,
        [cooperativeId, `Entrepôt atomique B ${id}`],
      );
      const lotA = await client.query(
        `INSERT INTO lots
          (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
         VALUES ($1, $2, 600, $3, 12)
         RETURNING id`,
        [cooperativeId, campaignId, `Entrepôt atomique A ${id}`],
      );
      const lotB = await client.query(
        `INSERT INTO lots
          (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
         VALUES ($1, $2, 400, $3, 8)
         RETURNING id`,
        [cooperativeId, campaignId, `Entrepôt atomique B ${id}`],
      );
      await client.query(
        `INSERT INTO expedition_lots
          (expedition_id, lot_id, poids_kg, nombre_sacs)
         VALUES ($1, $2, 600, 12), ($1, $3, 400, 8)`,
        [id, lotA.rows[0].id, lotB.rows[0].id],
      );
      const exportateur = await client.query(
        `INSERT INTO exportateurs
          (cooperative_id, nom)
         VALUES ($1, $2)
         RETURNING id`,
        [cooperativeId, `Exportateur atomique ${id}`],
      );
      const vente = await client.query(
        `INSERT INTO ventes_exportateurs
          (exportateur_id, lot_id, expedition_id, campagne_id,
           poids_kg, prix_unitaire_fcfa, montant_total_fcfa,
           date_vente, solde_du_fcfa)
         VALUES ($1, $2, $3, $4, 600, 2000000000, 2000000000,
                 CURRENT_DATE, 2000000000)
         RETURNING id`,
        [exportateur.rows[0].id, lotA.rows[0].id, id, campaignId],
      );
      await client.query(
        `UPDATE config_comptable
            SET auto_stocks = true
          WHERE cooperative_id = $1`,
        [cooperativeId],
      );

      // Le montant calculé dépasse numeric(14,2). L'erreur survient après
      // les sorties stock et le passage des lots en transit dans la transaction.
      await expect(
        changerStatut(cooperativeId, id, testUserId, "charge"),
      ).rejects.toThrow();

      const rollback = await client.query(
        `SELECT
           (SELECT statut FROM expeditions WHERE id = $1) AS statut,
           (SELECT nombre_sacs FROM expeditions WHERE id = $1) AS nombre_sacs,
           (SELECT count(*)::int
              FROM expedition_historique
             WHERE expedition_id = $1
               AND statut_nouveau = 'charge') AS historiques,
           (SELECT count(*)::int
              FROM mouvements_stock
             WHERE motif = $2) AS sorties,
           (SELECT count(*)::int
              FROM lots
             WHERE id IN ($3, $4) AND statut = 'transit') AS lots_transit,
           (SELECT count(*)::int
              FROM ecritures_comptables
             WHERE cooperative_id = $5 AND source_id = $1) AS ecritures`,
        [
          id,
          `Chargement expédition ${numeroExpedition}`,
          lotA.rows[0].id,
          lotB.rows[0].id,
          cooperativeId,
        ],
      );
      expect(rollback.rows[0]).toEqual({
        statut: "en_preparation",
        nombre_sacs: null,
        historiques: 0,
        sorties: 0,
        lots_transit: 0,
        ecritures: 0,
      });

      await client.query(
        `UPDATE ventes_exportateurs
            SET prix_unitaire_fcfa = 500,
                montant_total_fcfa = 300000,
                solde_du_fcfa = 300000
          WHERE id = $1`,
        [vente.rows[0].id],
      );

      await expect(
        changerStatut(cooperativeId, id, testUserId, "charge"),
      ).resolves.toMatchObject({ ok: true, statut: "charge" });

      const success = await client.query(
        `SELECT
           (SELECT statut FROM expeditions WHERE id = $1) AS statut,
           (SELECT nombre_sacs FROM expeditions WHERE id = $1) AS nombre_sacs,
           (SELECT count(*)::int
              FROM expedition_historique
             WHERE expedition_id = $1
               AND statut_nouveau = 'charge') AS historiques,
           (SELECT count(*)::int
              FROM mouvements_stock
             WHERE motif = $2) AS sorties,
           (SELECT count(*)::int
              FROM lots
             WHERE id IN ($3, $4) AND statut = 'transit') AS lots_transit,
           (SELECT count(*)::int
              FROM ecritures_comptables
             WHERE cooperative_id = $5 AND source_id = $1) AS ecritures`,
        [
          id,
          `Chargement expédition ${numeroExpedition}`,
          lotA.rows[0].id,
          lotB.rows[0].id,
          cooperativeId,
        ],
      );
      expect(success.rows[0]).toEqual({
        statut: "charge",
        nombre_sacs: 20,
        historiques: 1,
        sorties: 2,
        lots_transit: 2,
        ecritures: 1,
      });
    });

  it("annule toutes les sorties si un entrepôt source manque, puis reprend après correction", async () => {
    await setControleChargementObligatoire(false);

    const id = await createTransitionExpedition(1000);
    const expedition = await client.query(
      `SELECT numero_expedition FROM expeditions WHERE id = $1`,
      [id],
    );
    const numeroExpedition = expedition.rows[0].numero_expedition;
    const motif = `Chargement expédition ${numeroExpedition}`;
    const nomEntrepotA = `Entrepôt manquant A ${id}`;
    const nomEntrepotB = `Entrepôt manquant B ${id}`;

    const entrepotA = await client.query(
      `INSERT INTO entrepots
        (cooperative_id, nom, ville, capacite_kg)
       VALUES ($1, $2, 'Test', 5000)
       RETURNING id`,
      [cooperativeId, nomEntrepotA],
    );
    const lots = await client.query(
      `INSERT INTO lots
        (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
       VALUES
         ($1, $2, 600, $3, 12),
         ($1, $2, 400, $4, 8)
       RETURNING id, statut
      `,
      [cooperativeId, campaignId, nomEntrepotA, nomEntrepotB],
    );
    await client.query(
      `INSERT INTO expedition_lots
        (expedition_id, lot_id, poids_kg, nombre_sacs)
       VALUES ($1, $2, 600, 12), ($1, $3, 400, 8)`,
      [id, lots.rows[0].id, lots.rows[1].id],
    );
    await client.query(
      `UPDATE config_comptable
          SET auto_stocks = true
        WHERE cooperative_id = $1`,
      [cooperativeId],
    );

    await expect(
      changerStatut(cooperativeId, id, testUserId, "charge"),
    ).rejects.toThrow("Entrepôt source introuvable");

    const rollback = await client.query(
      `SELECT
         (SELECT statut FROM expeditions WHERE id = $1) AS statut,
         (SELECT nombre_sacs FROM expeditions WHERE id = $1) AS nombre_sacs,
         (SELECT count(*)::int
            FROM expedition_historique
           WHERE expedition_id = $1
             AND statut_nouveau = 'charge') AS historiques,
         (SELECT count(*)::int
            FROM mouvements_stock
           WHERE motif = $2) AS sorties,
         (SELECT count(*)::int
            FROM lots
           WHERE id IN ($3, $4) AND statut = 'transit') AS lots_transit`,
      [id, motif, lots.rows[0].id, lots.rows[1].id],
    );
    expect(rollback.rows[0]).toEqual({
      statut: "en_preparation",
      nombre_sacs: null,
      historiques: 0,
      sorties: 0,
      lots_transit: 0,
    });

    const lotsApresErreur = await client.query(
      `SELECT id, statut
         FROM lots
        WHERE id IN ($1, $2)
        ORDER BY id`,
      [lots.rows[0].id, lots.rows[1].id],
    );
    expect(lotsApresErreur.rows).toEqual(lots.rows.map((lot: { id: number; statut: string }) => ({
      id: lot.id,
      statut: lot.statut,
    })));

    const entrepotB = await client.query(
      `INSERT INTO entrepots
        (cooperative_id, nom, ville, capacite_kg)
       VALUES ($1, $2, 'Test', 5000)
       RETURNING id`,
      [cooperativeId, nomEntrepotB],
    );

    await expect(
      changerStatut(cooperativeId, id, testUserId, "charge"),
    ).resolves.toMatchObject({ ok: true, statut: "charge" });

    const success = await client.query(
      `SELECT
         (SELECT statut FROM expeditions WHERE id = $1) AS statut,
         (SELECT nombre_sacs FROM expeditions WHERE id = $1) AS nombre_sacs,
         (SELECT count(*)::int
            FROM expedition_historique
           WHERE expedition_id = $1
             AND statut_nouveau = 'charge') AS historiques,
         (SELECT count(*)::int
            FROM lots
           WHERE id IN ($2, $3) AND statut = 'transit') AS lots_transit`,
      [id, lots.rows[0].id, lots.rows[1].id],
    );
    expect(success.rows[0]).toEqual({
      statut: "charge",
      nombre_sacs: 20,
      historiques: 1,
      lots_transit: 2,
    });

    const sorties = await client.query(
      `SELECT entrepot_id, count(*)::int AS count,
              coalesce(sum(poids_kg), 0)::numeric AS poids,
              coalesce(sum(nombre_sacs), 0)::int AS sacs
         FROM mouvements_stock
        WHERE motif = $1
        GROUP BY entrepot_id
        ORDER BY entrepot_id`,
      [motif],
    );
    expect(sorties.rows).toEqual([
      {
        entrepot_id: entrepotA.rows[0].id,
        count: 1,
        poids: "600.00",
        sacs: 12,
      },
      {
        entrepot_id: entrepotB.rows[0].id,
        count: 1,
        poids: "400.00",
        sacs: 8,
      },
    ]);
  });

    it("répare une sortie manquante à la réception et normalise le nom de l'entrepôt", async () => {
      await setControleChargementObligatoire(false);

      const id = await createTransitionExpedition(1000);
      const expedition = await client.query(
        `SELECT numero_expedition FROM expeditions WHERE id = $1`,
        [id],
      );
      const numeroExpedition = expedition.rows[0].numero_expedition;
      const nomEntrepot = `Entrepôt reprise ${id}`;

      const entrepot = await client.query(
        `INSERT INTO entrepots
          (cooperative_id, nom, ville, capacite_kg)
         VALUES ($1, $2, 'Test', 5000)
         RETURNING id`,
        [cooperativeId, nomEntrepot.toLowerCase()],
      );
      const lot = await client.query(
        `INSERT INTO lots
          (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
         VALUES ($1, $2, 1000, $3, 20)
         RETURNING id`,
        [cooperativeId, campaignId, nomEntrepot.toUpperCase()],
      );
      await client.query(
        `INSERT INTO expedition_lots
          (expedition_id, lot_id, poids_kg, nombre_sacs)
         VALUES ($1, $2, 1000, 20)`,
        [id, lot.rows[0].id],
      );

      await changerStatut(cooperativeId, id, testUserId, "charge");
      await changerStatut(cooperativeId, id, testUserId, "en_transit");
      await changerStatut(cooperativeId, id, testUserId, "arrive_port");

      const motif = `Chargement expédition ${numeroExpedition}`;
      const sortieAvantReprise = await client.query(
        `SELECT count(*)::int AS count
           FROM mouvements_stock
          WHERE entrepot_id = $1 AND motif = $2`,
        [entrepot.rows[0].id, motif],
      );
      expect(sortieAvantReprise.rows[0].count).toBe(1);

      // Reproduire une ancienne expédition dont le chargement a été validé
      // mais dont la sortie n'a pas été persistée.
      await client.query(
        `DELETE FROM mouvements_stock
          WHERE entrepot_id = $1 AND motif = $2`,
        [entrepot.rows[0].id, motif],
      );

      await expect(
        confirmerReception(cooperativeId, id, testUserId, {
          poidsRecuPortKg: 1000,
          numeroRecepissePort: `REC-${id}`,
          nomReceptionnaire: "Réception test",
        }),
      ).resolves.toMatchObject({ statut: "receptionne" });

      const sortieApresReprise = await client.query(
        `SELECT count(*)::int AS count, coalesce(sum(poids_kg), 0)::numeric AS poids
           FROM mouvements_stock
          WHERE entrepot_id = $1 AND motif = $2`,
        [entrepot.rows[0].id, motif],
      );
      expect(sortieApresReprise.rows[0].count).toBe(1);
      expect(Number(sortieApresReprise.rows[0].poids)).toBe(1000);

      // Une confirmation rejouée ne doit pas créer de seconde sortie.
      await confirmerReception(cooperativeId, id, testUserId, {
        poidsRecuPortKg: 1000,
        numeroRecepissePort: `REC-${id}`,
        nomReceptionnaire: "Réception test",
      });

      const sortieApresRetry = await client.query(
        `SELECT count(*)::int AS count
           FROM mouvements_stock
          WHERE entrepot_id = $1 AND motif = $2`,
        [entrepot.rows[0].id, motif],
      );
      expect(sortieApresRetry.rows[0].count).toBe(1);
    });

    it("annule la réparation et permet une reprise après une erreur de réception", async () => {
      await setControleChargementObligatoire(false);

      const id = await createTransitionExpedition(1000);
      const expedition = await client.query(
        `SELECT numero_expedition FROM expeditions WHERE id = $1`,
        [id],
      );
      const numeroExpedition = expedition.rows[0].numero_expedition;
      const nomEntrepot = `Entrepôt rollback ${id}`;

      const entrepot = await client.query(
        `INSERT INTO entrepots
          (cooperative_id, nom, ville, capacite_kg)
         VALUES ($1, $2, 'Test', 5000)
         RETURNING id`,
        [cooperativeId, nomEntrepot],
      );
      const lot = await client.query(
        `INSERT INTO lots
          (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
         VALUES ($1, $2, 1000, $3, 20)
         RETURNING id`,
        [cooperativeId, campaignId, nomEntrepot],
      );
      await client.query(
        `INSERT INTO expedition_lots
          (expedition_id, lot_id, poids_kg, nombre_sacs)
         VALUES ($1, $2, 1000, 20)`,
        [id, lot.rows[0].id],
      );

      await changerStatut(cooperativeId, id, testUserId, "charge");
      await changerStatut(cooperativeId, id, testUserId, "en_transit");
      await changerStatut(cooperativeId, id, testUserId, "arrive_port");

      const motif = `Chargement expédition ${numeroExpedition}`;

      const nomEntrepotA = `Entrepôt multi A ${id}`;
      await client.query(
        `DELETE FROM mouvements_stock
          WHERE entrepot_id = $1 AND motif = $2`,
        [entrepot.rows[0].id, motif],
      );

      await expect(
        confirmerReception(cooperativeId, id, testUserId, {
          poidsRecuPortKg: 1000,
          numeroRecepissePort: "R".repeat(101),
          nomReceptionnaire: "Réception rollback",
        }),
      ).rejects.toThrow();

      const etatApresErreur = await client.query(
        `SELECT statut, poids_recu_port_kg
           FROM expeditions
          WHERE id = $1`,
        [id],
      );
      expect(etatApresErreur.rows[0]).toEqual({
        statut: "arrive_port",
        poids_recu_port_kg: null,
      });

      const effetsApresErreur = await client.query(
        `SELECT
           (SELECT count(*)::int
              FROM expedition_historique
             WHERE expedition_id = $1
               AND statut_nouveau IN ('receptionne', 'litige')) AS historiques,
           (SELECT count(*)::int
              FROM mouvements_stock
             WHERE entrepot_id = $2 AND motif = $3) AS sorties,
           (SELECT count(*)::int
              FROM traitements_refus
             WHERE expedition_id = $1
               AND source_type = 'reception_port') AS refus`,
        [id, entrepot.rows[0].id, motif],
      );
      expect(effetsApresErreur.rows[0]).toEqual({
        historiques: 0,
        sorties: 0,
        refus: 0,
      });

      await expect(
        confirmerReception(cooperativeId, id, testUserId, {
          poidsRecuPortKg: 1000,
          numeroRecepissePort: `REC-${id}`,
          nomReceptionnaire: "Réception reprise",
        }),
      ).resolves.toMatchObject({ statut: "receptionne" });

      const effetsApresReprise = await client.query(
        `SELECT
           (SELECT count(*)::int
              FROM expedition_historique
             WHERE expedition_id = $1
               AND statut_nouveau = 'receptionne') AS historiques,
           (SELECT count(*)::int
              FROM mouvements_stock
             WHERE entrepot_id = $2 AND motif = $3) AS sorties`,
        [id, entrepot.rows[0].id, motif],
      );
      expect(effetsApresReprise.rows[0]).toEqual({
        historiques: 1,
        sorties: 1,
      });
    });

    it("annule la résolution du litige si l'écriture des frais de transport échoue, puis permet la reprise", async () => {
      await setControleChargementObligatoire(false);

      const id = await createTransitionExpedition(1000);
      const expedition = await client.query(
        `SELECT numero_expedition FROM expeditions WHERE id = $1`,
        [id],
      );
      const numeroExpedition = expedition.rows[0].numero_expedition;
      const nomEntrepot = `Entrepôt résolution litige ${id}`;
      const entrepot = await client.query(
        `INSERT INTO entrepots
          (cooperative_id, nom, ville, capacite_kg)
         VALUES ($1, $2, 'Test', 5000)
         RETURNING id`,
        [cooperativeId, nomEntrepot],
      );
      const lot = await client.query(
        `INSERT INTO lots
          (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
         VALUES ($1, $2, 1000, $3, 20)
         RETURNING id`,
        [cooperativeId, campaignId, nomEntrepot],
      );
      await client.query(
        `INSERT INTO expedition_lots
          (expedition_id, lot_id, poids_kg, nombre_sacs)
         VALUES ($1, $2, 1000, 20)`,
        [id, lot.rows[0].id],
      );

      await changerStatut(cooperativeId, id, testUserId, "charge");
      await changerStatut(cooperativeId, id, testUserId, "en_transit");
      await changerStatut(cooperativeId, id, testUserId, "arrive_port");
      await client.query(
        `UPDATE config_comptable
            SET auto_transport = true
          WHERE cooperative_id = $1`,
        [cooperativeId],
      );

      await expect(
        confirmerReception(cooperativeId, id, testUserId, {
          poidsRecuPortKg: 900,
          numeroRecepissePort: `REC-LITIGE-${id}`,
          nomReceptionnaire: "Réception litige",
          fraisTransportFcfa: 15_000,
        }),
      ).resolves.toMatchObject({ statut: "litige" });

      const failureFunction = `force_transport_resolution_failure_${id}`;
      const failureTrigger = `force_transport_resolution_failure_trigger_${id}`;
      await client.query(`
        CREATE FUNCTION "${failureFunction}"()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
          RAISE EXCEPTION 'Erreur simulée pendant l''écriture des frais de transport';
        END;
        $$;

        CREATE TRIGGER "${failureTrigger}"
        BEFORE INSERT ON ecritures_comptables
        FOR EACH ROW
        WHEN (
          NEW.cooperative_id = ${cooperativeId}
          AND NEW.source_id = ${id}
          AND NEW.compte_debit LIKE '612%'
          AND NEW.compte_credit LIKE '401%'
        )
        EXECUTE FUNCTION "${failureFunction}"();
      `);

      try {
        await expect(
          changerStatut(cooperativeId, id, testUserId, "receptionne"),
        ).rejects.toThrow();
      } finally {
        await client.query(`
          DROP TRIGGER IF EXISTS "${failureTrigger}" ON ecritures_comptables;
          DROP FUNCTION IF EXISTS "${failureFunction}"();
        `);
      }

      const rollback = await client.query(
        `SELECT
           (SELECT statut FROM expeditions WHERE id = $1) AS statut,
           (SELECT count(*)::int
              FROM expedition_historique
             WHERE expedition_id = $1
               AND statut_nouveau = 'litige') AS historiques_litige,
           (SELECT count(*)::int
              FROM expedition_historique
             WHERE expedition_id = $1
               AND statut_nouveau = 'receptionne') AS historiques_reception,
           (SELECT count(*)::int
              FROM ecritures_comptables
             WHERE cooperative_id = $2
               AND source_id = $1
               AND compte_debit LIKE '612%'
               AND compte_credit LIKE '401%') AS ecritures_transport`,
        [id, cooperativeId],
      );
      expect(rollback.rows[0]).toEqual({
        statut: "litige",
        historiques_litige: 1,
        historiques_reception: 0,
        ecritures_transport: 0,
      });

      await expect(
        changerStatut(cooperativeId, id, testUserId, "receptionne"),
      ).resolves.toMatchObject({ ok: true, statut: "receptionne" });

      const reprise = await client.query(
        `SELECT
           (SELECT statut FROM expeditions WHERE id = $1) AS statut,
           (SELECT count(*)::int
              FROM expedition_historique
             WHERE expedition_id = $1
               AND statut_nouveau = 'receptionne') AS historiques_reception,
           (SELECT count(*)::int
              FROM ecritures_comptables
             WHERE cooperative_id = $2
               AND source_id = $1
               AND compte_debit LIKE '612%'
               AND compte_credit LIKE '401%') AS ecritures_transport`,
        [id, cooperativeId],
      );
      expect(reprise.rows[0]).toEqual({
        statut: "receptionne",
        historiques_reception: 1,
        ecritures_transport: 1,
      });
    });

    it("n'accepte qu'une réception concurrente et ne duplique aucun effet", async () => {
      await setControleChargementObligatoire(false);

      const id = await createTransitionExpedition(2200);
      const expedition = await client.query(
        `SELECT numero_expedition FROM expeditions WHERE id = $1`,
        [id],
      );
      const numeroExpedition = expedition.rows[0].numero_expedition;
      const motif = `Chargement expédition ${numeroExpedition}`;
      const nomEntrepotA = `Entrepôt multi A ${id}`;
      const nomEntrepotB = `Entrepôt multi B ${id}`;

      const entrepots = await client.query(
        `INSERT INTO entrepots
          (cooperative_id, nom, ville, capacite_kg)
         VALUES
           ($1, $2, 'Test', 5000),
           ($1, $3, 'Test', 5000)
         RETURNING id, nom
        `,
        [cooperativeId, nomEntrepotA, nomEntrepotB],
      );
      const entrepotA = entrepots.rows.find((row: { nom: string }) => row.nom === nomEntrepotA);
      const entrepotB = entrepots.rows.find((row: { nom: string }) => row.nom === nomEntrepotB);
      expect(entrepotA).toBeDefined();
      expect(entrepotB).toBeDefined();

      const lots = await client.query(
        `INSERT INTO lots
          (cooperative_id, campagne_id, poids_total_kg, entrepot, nombre_sacs)
         VALUES
           ($1, $2, 700, $3, 14),
           ($1, $2, 300, $4, 6),
           ($1, $2, 1200, $5, 24)
         RETURNING id`,
        [
          cooperativeId,
          campaignId,
          `  ${nomEntrepotA.toUpperCase()}  `,
          nomEntrepotA,
          nomEntrepotB,
        ],
      );
      await client.query(
        `INSERT INTO expedition_lots
          (expedition_id, lot_id, poids_kg, nombre_sacs)
         VALUES
           ($1, $2, 700, 14),
           ($1, $3, 300, 6),
           ($1, $4, 1200, 24)`,
        [id, lots.rows[0].id, lots.rows[1].id, lots.rows[2].id],
      );

      await changerStatut(cooperativeId, id, testUserId, "charge");

      const sortiesAuChargement = await client.query(
        `SELECT entrepot_id, count(*)::int AS count,
                coalesce(sum(poids_kg), 0)::numeric AS poids,
                coalesce(sum(nombre_sacs), 0)::int AS sacs
           FROM mouvements_stock
          WHERE motif = $1
          GROUP BY entrepot_id
          ORDER BY entrepot_id`,
        [motif],
      );
      expect(sortiesAuChargement.rows).toHaveLength(2);
      expect(sortiesAuChargement.rows).toEqual(
        expect.arrayContaining([
          {
            entrepot_id: entrepotA.id,
            count: 1,
            poids: "1000.00",
            sacs: 20,
          },
          {
            entrepot_id: entrepotB.id,
            count: 1,
            poids: "1200.00",
            sacs: 24,
          },
        ]),
      );

      await changerStatut(cooperativeId, id, testUserId, "en_transit");
      await changerStatut(cooperativeId, id, testUserId, "arrive_port");
      await client.query(
        `DELETE FROM mouvements_stock
          WHERE motif = $1`,
        [motif],
      );

      const receptions = await Promise.all([
        confirmerReception(cooperativeId, id, testUserId, {
          poidsRecuPortKg: 2200,
          numeroRecepissePort: `REC-MULTI-${id}`,
          nomReceptionnaire: "Réception concurrente",
          poidsRefuleKg: 100,
          nombreSacsRefoules: 1,
          motifRefus: "Sac endommagé",
        }),
        confirmerReception(cooperativeId, id, testUserId, {
          poidsRecuPortKg: 2200,
          numeroRecepissePort: `REC-MULTI-${id}`,
          nomReceptionnaire: "Réception concurrente",
          poidsRefuleKg: 100,
          nombreSacsRefoules: 1,
          motifRefus: "Sac endommagé",
        }),
      ]);
      expect(receptions).toHaveLength(2);
      expect(receptions.map((reception) => reception.statut)).toEqual([
        "receptionne",
        "receptionne",
      ]);

      const sortiesApresReparation = await client.query(
        `SELECT entrepot_id, count(*)::int AS count,
                coalesce(sum(poids_kg), 0)::numeric AS poids,
                coalesce(sum(nombre_sacs), 0)::int AS sacs
           FROM mouvements_stock
          WHERE motif = $1
          GROUP BY entrepot_id
          ORDER BY entrepot_id`,
        [motif],
      );
      expect(sortiesApresReparation.rows).toHaveLength(2);
      expect(sortiesApresReparation.rows).toEqual(
        expect.arrayContaining([
          {
            entrepot_id: entrepotA.id,
            count: 1,
            poids: "1000.00",
            sacs: 20,
          },
          {
            entrepot_id: entrepotB.id,
            count: 1,
            poids: "1200.00",
            sacs: 24,
          },
        ]),
      );

      const receptionEffects = await client.query(
        `SELECT
           (SELECT statut FROM expeditions WHERE id = $1) AS statut,
           (SELECT count(*)::int
              FROM expedition_historique
             WHERE expedition_id = $1
               AND statut_nouveau = 'receptionne') AS historiques,
           (SELECT count(*)::int
              FROM traitements_refus
             WHERE expedition_id = $1
               AND source_type = 'reception_port') AS refus,
           ((SELECT count(*)
               FROM ecritures_comptables
              WHERE cooperative_id = $2
                AND source = 'stock'
                AND source_id = $1)
            +
            (SELECT count(*)
               FROM ecritures_en_attente
              WHERE cooperative_id = $2
                AND source = 'stock'
                AND source_id = $1))::int AS ecritures`,
        [id, cooperativeId],
      );
      expect(receptionEffects.rows[0]).toEqual({
        statut: "receptionne",
        historiques: 1,
        refus: 1,
        ecritures: 1,
      });
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

import { pool } from "@workspace/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addLigne,
  createSession,
  deduireAvancesMembreDelegue,
  terminerSession,
} from "../services/peseeSessionService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("retenues d'avance concurrentes sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let campagneId: number;
  let membreId: number;
  let avanceId: number;
  const suffix = `${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Retenue avance concurrence ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const campagne = await client.query(
      `INSERT INTO campagnes
         (cooperative_id, libelle, annee_debut, annee_fin,
          date_ouverture, statut)
       VALUES ($1, 'Campagne retenue session', 2026, 2027,
               '2026-01-01', 'ouverte')
       RETURNING id`,
      [cooperativeId],
    );
    campagneId = campagne.rows[0].id;

    const member = await client.query(
      `INSERT INTO membres
         (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion,
          categorie_membre, statut_membre)
       VALUES ($1, 'Producteur', 'Concurrent', $2, 1, CURRENT_DATE,
               'délégué de localités', 'actif')
       RETURNING id`,
      [cooperativeId, `+2250702${process.pid}`.slice(0, 14)],
    );
    membreId = member.rows[0].id;

    const avance = await client.query(
      `INSERT INTO avances
         (membre_id, montant_octroye_fcfa, montant_rembourse_fcfa,
          solde_restant_fcfa, date_octroi, statut, plan_type,
          deduction_source)
       VALUES ($1, 80000, 0, 80000, CURRENT_DATE, 'en_cours',
               'integral', 'livraison')
       RETURNING id`,
      [membreId],
    );
    avanceId = avance.rows[0].id;
  });

  afterAll(async () => {
    if (!client) return;

    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM remboursements_avances_membres WHERE avance_id = $1`,
        [avanceId],
      );
      await client.query(`DELETE FROM paiements WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM livraisons WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(
        `DELETE FROM lignes_pesee
         WHERE session_id IN (SELECT id FROM sessions_pesee WHERE cooperative_id = $1)`,
        [cooperativeId],
      );
      await client.query(`DELETE FROM sessions_pesee WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM avances WHERE id = $1`, [avanceId]);
      await client.query(`DELETE FROM membres WHERE id = $1`, [membreId]);
      await client.query(`DELETE FROM campagnes WHERE id = $1`, [campagneId]);
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  it("ne dépasse ni le solde ni le payable lorsque deux retenues arrivent ensemble", async () => {
    const results = await Promise.all([
      deduireAvancesMembreDelegue(
        membreId,
        80_000,
        1001,
        `PES-CONC-A-${suffix}`,
        "2026-09-09",
      ),
      deduireAvancesMembreDelegue(
        membreId,
        80_000,
        1002,
        `PES-CONC-B-${suffix}`,
        "2026-09-09",
      ),
    ]);

    expect(results.map((result) => result.montantDeduit).sort((a, b) => a - b)).toEqual([0, 80_000]);

    const avance = await client.query(
      `SELECT solde_restant_fcfa, montant_rembourse_fcfa, statut
       FROM avances WHERE id = $1`,
      [avanceId],
    );
    expect(avance.rows).toEqual([
      { solde_restant_fcfa: 0, montant_rembourse_fcfa: 80000, statut: "rembourse" },
    ]);

    const historiques = await client.query(
      `SELECT montant_fcfa FROM remboursements_avances_membres
       WHERE avance_id = $1 ORDER BY id`,
      [avanceId],
    );
    expect(historiques.rows).toEqual([{ montant_fcfa: 80000 }]);
  });

  it("retient une avance échue sans dépasser le payable et la lie à la livraison", async () => {
    await client.query("BEGIN");
    try {
      await client.query(
        `DELETE FROM remboursements_avances_membres WHERE avance_id = $1`,
        [avanceId],
      );
      await client.query(
        `UPDATE avances
            SET montant_octroye_fcfa = 100000,
                montant_rembourse_fcfa = 0,
                solde_restant_fcfa = 100000,
                date_echeance = '2026-09-05',
                report_date = '2026-09-01',
                statut = 'en_retard'
          WHERE id = $1`,
        [avanceId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    const session = await createSession(cooperativeId, {
      membreId,
      operation: "reception",
      certificationCacao: "ORDINAIRE",
    });
    await addLigne(cooperativeId, session.id, {
      nbSacs: 1,
      poidsBrutKg: 80,
      tareKg: 0,
    });

    const terminee = await terminerSession(cooperativeId, session.id);
    expect(terminee.livraisonId).toBeTypeOf("number");

    const history = await client.query(
      `SELECT montant_fcfa, livraison_id
         FROM remboursements_avances_membres
        WHERE avance_id = $1`,
      [avanceId],
    );
    expect(history.rows).toEqual([
      { montant_fcfa: 80000, livraison_id: terminee.livraisonId },
    ]);

    const avance = await client.query(
      `SELECT solde_restant_fcfa, montant_rembourse_fcfa, statut
         FROM avances
        WHERE id = $1`,
      [avanceId],
    );
    expect(avance.rows).toEqual([
      { solde_restant_fcfa: 20000, montant_rembourse_fcfa: 80000, statut: "en_retard" },
    ]);

    const livraison = await client.query(
      `SELECT avance_deduite_fcfa, montant_net_fcfa
         FROM livraisons
        WHERE id = $1`,
      [terminee.livraisonId],
    );
    expect(livraison.rows).toEqual([
      { avance_deduite_fcfa: 80000, montant_net_fcfa: 0 },
    ]);
  });

  it("ignore une avance de session avant sa date de début", async () => {
    await client.query("BEGIN");
    try {
      await client.query(
        `DELETE FROM remboursements_avances_membres WHERE avance_id = $1`,
        [avanceId],
      );
      await client.query(
        `UPDATE avances
            SET montant_octroye_fcfa = 50000,
                montant_rembourse_fcfa = 0,
                solde_restant_fcfa = 50000,
                date_echeance = '2026-09-05',
                report_date = '2099-01-01',
                statut = 'en_cours'
          WHERE id = $1`,
        [avanceId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    const session = await createSession(cooperativeId, {
      membreId,
      operation: "reception",
      certificationCacao: "ORDINAIRE",
    });
    await addLigne(cooperativeId, session.id, {
      nbSacs: 1,
      poidsBrutKg: 80,
      tareKg: 0,
    });

    const terminee = await terminerSession(cooperativeId, session.id);
    expect(terminee.livraisonId).toBeTypeOf("number");

    const [avance, history, livraison] = await Promise.all([
      client.query(
        `SELECT solde_restant_fcfa, montant_rembourse_fcfa
           FROM avances WHERE id = $1`,
        [avanceId],
      ),
      client.query(
        `SELECT count(*)::int AS count
           FROM remboursements_avances_membres WHERE avance_id = $1`,
        [avanceId],
      ),
      client.query(
        `SELECT avance_deduite_fcfa, montant_net_fcfa
           FROM livraisons WHERE id = $1`,
        [terminee.livraisonId],
      ),
    ]);

    expect(avance.rows).toEqual([
      { solde_restant_fcfa: 50000, montant_rembourse_fcfa: 0 },
    ]);
    expect(history.rows).toEqual([{ count: 0 }]);
    expect(livraison.rows).toEqual([
      { avance_deduite_fcfa: 0, montant_net_fcfa: 80000 },
    ]);
  });

  it("restaure l'avance et son historique si la livraison échoue après la retenue", async () => {
    await client.query("BEGIN");
    try {
      await client.query(`DELETE FROM paiements WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM livraisons WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(
        `DELETE FROM remboursements_avances_membres WHERE avance_id = $1`,
        [avanceId],
      );
      await client.query(
        `UPDATE avances
            SET montant_octroye_fcfa = 80000,
                montant_rembourse_fcfa = 0,
                solde_restant_fcfa = 80000,
                date_echeance = NULL,
                report_date = NULL,
                statut = 'en_cours'
          WHERE id = $1`,
        [avanceId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    const session = await createSession(cooperativeId, {
      membreId,
      operation: "reception",
      certificationCacao: "ORDINAIRE",
    });
    await addLigne(cooperativeId, session.id, {
      nbSacs: 1,
      poidsBrutKg: 80,
      tareKg: 0,
    });

    const constraintName = `test_livraison_failure_${process.pid}_${Date.now()}`;
    await client.query(
      `ALTER TABLE livraisons ADD CONSTRAINT "${constraintName}" CHECK (false)`,
    );
    try {
      await expect(terminerSession(cooperativeId, session.id)).rejects.toThrow();
    } finally {
      await client.query(`ALTER TABLE livraisons DROP CONSTRAINT "${constraintName}"`);
    }

    const [avance, history, livraison] = await Promise.all([
      client.query(
        `SELECT solde_restant_fcfa, montant_rembourse_fcfa, statut
           FROM avances WHERE id = $1`,
        [avanceId],
      ),
      client.query(
        `SELECT count(*)::int AS count
           FROM remboursements_avances_membres WHERE avance_id = $1`,
        [avanceId],
      ),
      client.query(
        `SELECT count(*)::int AS count
           FROM livraisons l
          WHERE l.cooperative_id = $1
            AND l.membre_id = $2`,
        [cooperativeId, membreId],
      ),
    ]);

    expect(avance.rows).toEqual([
      { solde_restant_fcfa: 80000, montant_rembourse_fcfa: 0, statut: "en_cours" },
    ]);
    expect(history.rows).toEqual([{ count: 0 }]);
    expect(livraison.rows).toEqual([{ count: 0 }]);
  });
});

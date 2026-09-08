import { pool } from "@workspace/db";
import type { Request, Response } from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { corrigerDateApplicationAvance } from "../controllers/avancesController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type Fixture = {
  avanceId: number;
  livraisonId: number;
  paiementId: number;
  remboursementId: number;
};

type TestResponse = Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function makeResponse(): TestResponse {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as TestResponse;
}

describe.skipIf(!enabled)("correction d'avance rejetée sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let membreId: number;
  const fixtures: Fixture[] = [];
  const suffix = `${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Correction avance atomique ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const member = await client.query(
      `INSERT INTO membres
         (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion)
       VALUES ($1, 'Producteur', 'Correction', $2, 1, CURRENT_DATE)
       RETURNING id`,
      [cooperativeId, `+2250701${process.pid}`.slice(0, 14)],
    );
    membreId = member.rows[0].id;
  });

  afterAll(async () => {
    if (!client) return;

    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM remboursements_avances_membres
         WHERE avance_id IN (SELECT id FROM avances WHERE membre_id = $1)`,
        [membreId],
      );
      await client.query(`DELETE FROM paiements WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM livraisons WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM avances WHERE membre_id = $1`, [membreId]);
      await client.query(`DELETE FROM membres WHERE id = $1`, [membreId]);
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  async function createFixture(paymentAmount: number): Promise<Fixture> {
    const avance = await client.query(
      `INSERT INTO avances
         (membre_id, montant_octroye_fcfa, montant_rembourse_fcfa,
          solde_restant_fcfa, date_octroi, statut)
       VALUES ($1, 10000, 4000, 6000, '2026-08-01', 'en_cours')
       RETURNING id`,
      [membreId],
    );
    const avanceId = avance.rows[0].id;

    const livraison = await client.query(
      `INSERT INTO livraisons
         (cooperative_id, membre_id, poids_kg, prix_unitaire_fcfa,
          montant_brut_fcfa, avance_deduite_fcfa, intrants_deduits_fcfa,
          montant_net_fcfa, date_livraison, numero_pesee, annee_numero_pesee,
          statut_paiement, montant_restant)
       VALUES ($1, $2, 10, 1000, 10000, 4000, 0, 6000,
               '2026-08-01', $3, 2026, 'EN_ATTENTE', '6000')
       RETURNING id`,
      [cooperativeId, membreId, fixtures.length + 1],
    );
    const livraisonId = livraison.rows[0].id;

    const paiement = await client.query(
      `INSERT INTO paiements
         (cooperative_id, livraison_id, membre_id, montant_fcfa,
          numero_recu, mode_paiement, statut, motif_rejet)
       VALUES ($1, $2, $3, $4, $5, 'especes', 'rejete', 'Provision insuffisante')
       RETURNING id`,
      [
        cooperativeId,
        livraisonId,
        membreId,
        paymentAmount,
        `INT-${suffix}-${fixtures.length + 1}`,
      ],
    );
    const paiementId = paiement.rows[0].id;

    const remboursement = await client.query(
      `INSERT INTO remboursements_avances_membres
         (avance_id, livraison_id, montant_fcfa, note)
       VALUES ($1, $2, 4000, NULL)
       RETURNING id`,
      [avanceId, livraisonId],
    );
    const remboursementId = remboursement.rows[0].id;

    const fixture = { avanceId, livraisonId, paiementId, remboursementId };
    fixtures.push(fixture);
    return fixture;
  }

  function makeRequest(avanceId: number): Request {
    return {
      params: { id: String(avanceId) },
      body: {
        date_application: "2026-09-01",
        motif: "Correction après contrôle de la date",
      },
      user: { cooperativeId, id: 1 },
      log: { error: () => undefined },
    } as unknown as Request;
  }

  async function readState(fixture: Fixture) {
    const avance = await client.query(
      `SELECT plan_type, report_date::text, montant_rembourse_fcfa,
              solde_restant_fcfa, statut
       FROM avances WHERE id = $1`,
      [fixture.avanceId],
    );
    const livraison = await client.query(
      `SELECT avance_deduite_fcfa, montant_net_fcfa,
              montant_restant::text, statut_paiement
       FROM livraisons WHERE id = $1`,
      [fixture.livraisonId],
    );
    const paiement = await client.query(
      `SELECT montant_fcfa, statut, motif_rejet, date_validation, valide_par
       FROM paiements WHERE id = $1`,
      [fixture.paiementId],
    );
    const remboursement = await client.query(
      `SELECT montant_fcfa, note
       FROM remboursements_avances_membres WHERE id = $1`,
      [fixture.remboursementId],
    );

    return {
      avance: avance.rows[0],
      livraison: livraison.rows[0],
      paiement: paiement.rows[0],
      remboursement: remboursement.rows[0],
    };
  }

  it("rétablit les quatre états et conserve le motif du rejet", async () => {
    const fixture = await createFixture(2000);
    const res = makeResponse();

    await corrigerDateApplicationAvance(makeRequest(fixture.avanceId), res);

    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        montantRestaure: 4000,
        reglementsRecalcules: 1,
      }),
    );
    await expect(readState(fixture)).resolves.toEqual({
      avance: {
        plan_type: "reporte",
        report_date: "2026-09-01",
        montant_rembourse_fcfa: 0,
        solde_restant_fcfa: 10000,
        statut: "en_cours",
      },
      livraison: {
        avance_deduite_fcfa: 0,
        montant_net_fcfa: 10000,
        montant_restant: "10000.00",
        statut_paiement: "EN_ATTENTE",
      },
      paiement: {
        montant_fcfa: 6000,
        statut: "en_attente",
        motif_rejet: null,
        date_validation: null,
        valide_par: null,
      },
      remboursement: {
        montant_fcfa: 0,
        note: expect.stringContaining(
          "Rejet précédent : Provision insuffisante",
        ),
      },
    });
    expect(
      (await readState(fixture)).remboursement.note,
    ).toContain("Correction après contrôle de la date");
  });

  it("annule toutes les mises à jour si le recalcul du paiement échoue", async () => {
    const fixture = await createFixture(2_147_482_647);
    const initialState = await readState(fixture);
    const res = makeResponse();

    await corrigerDateApplicationAvance(makeRequest(fixture.avanceId), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      erreur: expect.stringContaining("out of range for type integer"),
    });
    expect(await readState(fixture)).toEqual(initialState);
  });
});
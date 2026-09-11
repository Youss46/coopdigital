import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { listPaiements } from "../controllers/paiementsController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type TestRequest = {
  query: Record<string, string>;
  user: { id: number; role: string; cooperativeId: number };
  log: { error: (details: unknown, message: string) => void };
};

type TestResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => TestResponse;
  json: (body: unknown) => TestResponse;
};

function request(
  cooperativeId: number,
  query: Record<string, string> = {},
): TestRequest {
  return {
    query,
    user: { id: 0, role: "directeur", cooperativeId },
    log: { error: () => undefined },
  };
}

function response(): TestResponse {
  const result = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      result.statusCode = code;
      return result;
    },
    json(body: unknown) {
      result.body = body;
      return result;
    },
  };
  return result;
}

describe.skipIf(!enabled)("totaux paginés des règlements sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let memberId: number;
  let vehicleId: number;

  const deliveryCount = 210;
  const fuelCount = 25;
  const otherCount = 1;
  const deliveryRemainder = 1_234;
  const deliveryTotal = deliveryCount * deliveryRemainder;
  const fuelTotal = fuelCount * 2_000;
  const otherTotal = 3_000;

  beforeAll(async () => {
    client = await pool.connect();
    const suffix = `${process.pid}_${Date.now()}`;

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`KPI règlements ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const member = await client.query(
      `INSERT INTO membres
         (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion)
       VALUES ($1, 'KPI', 'Producteur', $2, 1, CURRENT_DATE)
       RETURNING id`,
      [cooperativeId, `kpi-${suffix}`],
    );
    memberId = member.rows[0].id;

    const vehicle = await client.query(
      `INSERT INTO vehicules
         (cooperative_id, immatriculation, marque, modele, type)
       VALUES ($1, $2, 'Test', 'KPI', 'camion')
       RETURNING id`,
      [cooperativeId, `KPI-${suffix}`],
    );
    vehicleId = vehicle.rows[0].id;

    await client.query(
      `WITH deliveries AS (
         INSERT INTO livraisons
           (cooperative_id, membre_id, poids_kg, prix_unitaire_fcfa,
            montant_brut_fcfa, avance_deduite_fcfa, intrants_deduits_fcfa,
            montant_net_fcfa, date_livraison, numero_pesee,
            annee_numero_pesee, statut_paiement, montant_restant)
         SELECT $1, $2, 1, 10000, 10000, 0, 0, 10000,
                CURRENT_DATE, 700000 + serie, 2026, 'EN_ATTENTE', $3
         FROM generate_series(1, $4::integer) AS serie
         RETURNING id
       )
       INSERT INTO paiements
         (cooperative_id, livraison_id, membre_id, numero_recu,
          montant_fcfa, statut, created_at)
       SELECT $1, id, $2, 'REC-KPI-LIV-' || row_number() OVER (ORDER BY id),
              10000, 'en_attente',
              CURRENT_TIMESTAMP - (row_number() OVER (ORDER BY id) * INTERVAL '1 second')
       FROM deliveries`,
      [cooperativeId, memberId, deliveryRemainder, deliveryCount],
    );

    await client.query(
      `WITH fuel_vouchers AS (
         INSERT INTO bons_carburant
           (cooperative_id, numero, vehicule_id, type_carburant,
            montant_autorise_fcfa, date_emission, statut)
         SELECT $1, 'BC-KPI-' || serie, $2, 'gasoil', 2000,
                CURRENT_DATE, 'utilise'
         FROM generate_series(1, $3::integer) AS serie
         RETURNING id
       )
       INSERT INTO paiements
         (cooperative_id, bon_carburant_id, numero_recu,
          montant_fcfa, statut, created_at)
       SELECT $1, id, 'REC-KPI-CARB-' || row_number() OVER (ORDER BY id),
              2000, 'en_attente',
              CURRENT_TIMESTAMP - INTERVAL '1 day'
                - (row_number() OVER (ORDER BY id) * INTERVAL '1 second')
       FROM fuel_vouchers`,
      [cooperativeId, vehicleId, fuelCount],
    );

    const expense = await client.query(
      `INSERT INTO depenses_vehicule
         (cooperative_id, vehicule_id, type, date_depense, montant_fcfa,
          libelle, demandeur, fournisseur)
       VALUES ($1, $2, 'autre', CURRENT_DATE, $3,
               'Dépense KPI', 'Test KPI', 'Fournisseur KPI')
       RETURNING id`,
      [cooperativeId, vehicleId, otherTotal],
    );
    await client.query(
      `INSERT INTO paiements
         (cooperative_id, depense_vehicule_id, numero_recu,
          montant_fcfa, statut, created_at)
       VALUES ($1, $2, 'REC-KPI-AUTRE-1', $3, 'en_attente',
               CURRENT_TIMESTAMP - INTERVAL '2 days')`,
      [cooperativeId, expense.rows[0].id, otherTotal],
    );
  });

  afterAll(async () => {
    if (!client || !cooperativeId) {
      client?.release();
      return;
    }

    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM paiement_lignes
         WHERE paiement_id IN (
           SELECT id FROM paiements WHERE cooperative_id = $1
         )`,
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
      await client.query(
        `DELETE FROM bons_carburant WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM depenses_vehicule WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(`DELETE FROM vehicules WHERE id = $1`, [vehicleId]);
      await client.query(`DELETE FROM membres WHERE id = $1`, [memberId]);
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  });

  it("retourne la page, le reliquat et les compteurs complets", async () => {
    const res = response();

    await listPaiements(
      request(cooperativeId, { page: "2", limit: "50" }) as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      items: Array<{ livraisonMontantRestant: number | null }>;
      pagination: { page: number; limit: number; total: number };
      summary: {
        livraisons: { count: number; montantTotal: number };
        carburant: { count: number; montantTotal: number };
        autres: { count: number; montantTotal: number };
        tous: { count: number; montantTotal: number };
      };
    };

    expect(body.items).toHaveLength(50);
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ livraisonMontantRestant: deliveryRemainder }),
      ]),
    );
    expect(body.pagination).toEqual({
      page: 2,
      limit: 50,
      total: deliveryCount + fuelCount + otherCount,
    });
    expect(body.summary).toEqual({
      livraisons: { count: deliveryCount, montantTotal: deliveryTotal },
      carburant: { count: fuelCount, montantTotal: fuelTotal },
      autres: { count: otherCount, montantTotal: otherTotal },
      tous: {
        count: deliveryCount + fuelCount + otherCount,
        montantTotal: deliveryTotal + fuelTotal + otherTotal,
      },
    });
  });

  it("conserve les totaux quand la page demandée est après la dernière", async () => {
    const filledPage = response();
    const emptyPage = response();

    await listPaiements(
      request(cooperativeId, { page: "2", limit: "50" }) as any,
      filledPage as any,
    );
    await listPaiements(
      request(cooperativeId, { page: "6", limit: "50" }) as any,
      emptyPage as any,
    );

    expect(filledPage.statusCode).toBe(200);
    expect(emptyPage.statusCode).toBe(200);

    const filledBody = filledPage.body as {
      summary: unknown;
    };
    const emptyBody = emptyPage.body as {
      items: unknown[];
      pagination: { page: number; limit: number; total: number };
      summary: unknown;
    };

    expect(emptyBody.items).toEqual([]);
    expect(emptyBody.pagination).toEqual({
      page: 6,
      limit: 50,
      total: deliveryCount + fuelCount,
    });
    expect(emptyBody.summary).toEqual(filledBody.summary);
  });

  it("conserve les compteurs globaux quand la page est filtrée par carburant", async () => {
    const res = response();

    await listPaiements(
      request(cooperativeId, { type: "carburant", page: "1", limit: "50" }) as any,
      res as any,
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as {
      items: Array<{ bonCarburantId: number | null }>;
      pagination: { page: number; limit: number; total: number };
      summary: {
        livraisons: { count: number; montantTotal: number };
        carburant: { count: number; montantTotal: number };
        autres: { count: number; montantTotal: number };
        tous: { count: number; montantTotal: number };
      };
    };

    expect(body.items).toHaveLength(fuelCount);
    expect(body.items.every((item) => item.bonCarburantId !== null)).toBe(true);
    expect(body.pagination).toEqual({ page: 1, limit: 50, total: fuelCount });
    expect(body.summary).toEqual({
      livraisons: { count: deliveryCount, montantTotal: deliveryTotal },
      carburant: { count: fuelCount, montantTotal: fuelTotal },
      autres: { count: otherCount, montantTotal: otherTotal },
      tous: {
        count: deliveryCount + fuelCount + otherCount,
        montantTotal: deliveryTotal + fuelTotal + otherTotal,
      },
    });
  });
});
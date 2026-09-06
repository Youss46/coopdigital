import express from "express";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { createAvance } from "../controllers/avancesController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type TreasuryKind = "caisse" | "mobile_marchand" | "banque";

const modeByKind: Record<TreasuryKind, "especes" | "mobile" | "banque"> = {
  caisse: "especes",
  mobile_marchand: "mobile",
  banque: "banque",
};

/**
 * Cette suite utilise le vrai handler d'octroi d'avance contre PostgreSQL.
 * Elle vérifie notamment que l'identifiant choisi est la seule source débitée,
 * qu'un compte étranger/inactif/insuffisant est rejeté sans effet partiel et
 * que le verrou de ligne sérialise deux octrois concurrents.
 *
 * Exécution explicite :
 * RUN_POSTGRES_INTEGRATION=1 DATABASE_URL=... \
 *   pnpm --filter @workspace/api-server exec vitest run \
 *   --config vitest.integration.config.ts src/tests/avancesTresorerie.integration.test.ts
 */
describe.skipIf(!enabled)("octroi d'avances et trésorerie sur PostgreSQL", () => {
  let client: any;
  let server: Server | undefined;
  let baseUrl: string;
  let cooperativeId: number;
  let foreignCooperativeId: number;
  let membreId: number;
  let foreignAccountId: number;
  let campagneId: number;
  let userId: number;

  const suffix = `${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Avances trésorerie ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Auteur', 'Intégration', $2, 'integration-only', 'comptable')
       RETURNING id`,
      [cooperativeId, `avances-treasury-${suffix}@example.test`],
    );
    userId = user.rows[0].id;

    const foreignCooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Avances trésorerie étrangère ${suffix}`],
    );
    foreignCooperativeId = foreignCooperative.rows[0].id;

    const campaign = await client.query(
      `INSERT INTO campagnes
         (cooperative_id, libelle, annee_debut, annee_fin,
          date_ouverture, statut)
       VALUES ($1, 'Campagne intégration avances', 2026, 2027,
               CURRENT_DATE, 'ouverte')
       RETURNING id`,
      [cooperativeId],
    );
    campagneId = campaign.rows[0].id;

    const member = await client.query(
      `INSERT INTO membres
         (cooperative_id, nom, prenoms, telephone, superficie_ha, date_adhesion)
       VALUES ($1, 'Producteur', 'Test', $2, 1, CURRENT_DATE)
       RETURNING id`,
      [cooperativeId, `+2250700${process.pid}`.slice(0, 14)],
    );
    membreId = member.rows[0].id;

    const foreignAccount = await client.query(
      `INSERT INTO comptes_bancaires
         (cooperative_id, nom, banque, solde_actuel_fcfa,
          solde_mini_alerte_fcfa, actif)
       VALUES ($1, 'Compte étranger', 'Banque test', 100000, 0, true)
       RETURNING id`,
      [foreignCooperativeId],
    );
    foreignAccountId = foreignAccount.rows[0].id;

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { role: "comptable", cooperativeId, id: userId } as NonNullable<typeof req.user>;
      req.log = { error: () => undefined } as unknown as typeof req.log;
      next();
    });
    app.post("/avances", createAvance);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const address = server?.address();
    if (!address || typeof address === "string") {
      throw new Error("Serveur de test indisponible");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    // L'écriture comptable est volontairement fire-and-forget dans le handler.
    // Laisser sa promesse terminer avant de nettoyer les fixtures.
    await new Promise((resolve) => setTimeout(resolve, 50));
    await client.query("BEGIN");
    try {
      await client.query(
        `DELETE FROM ecritures_en_attente WHERE cooperative_id IN ($1, $2)`,
        [cooperativeId, foreignCooperativeId],
      );
      await client.query(
        `DELETE FROM ecritures_comptables WHERE cooperative_id IN ($1, $2)`,
        [cooperativeId, foreignCooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_caisse WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_mobile_marchand WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_banque WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM sessions_caisse WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM caisses WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM comptes_mobiles_marchands WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM comptes_bancaires WHERE cooperative_id IN ($1, $2)`,
        [cooperativeId, foreignCooperativeId],
      );
      await client.query(
        `DELETE FROM avances WHERE membre_id = $1`,
        [membreId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
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

    try {
      await client.query("BEGIN");
      await client.query(
        `DELETE FROM ecritures_en_attente WHERE cooperative_id IN ($1, $2)`,
        [cooperativeId, foreignCooperativeId],
      );
      await client.query(
        `DELETE FROM ecritures_comptables WHERE cooperative_id IN ($1, $2)`,
        [cooperativeId, foreignCooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_caisse WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_mobile_marchand WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_banque WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM sessions_caisse WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM caisses WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM comptes_mobiles_marchands WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM comptes_bancaires WHERE cooperative_id IN ($1, $2)`,
        [cooperativeId, foreignCooperativeId],
      );
      await client.query(`DELETE FROM membres WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await client.query(`DELETE FROM campagnes WHERE id = $1`, [campagneId]);
      await client.query(`DELETE FROM cooperatives WHERE id IN ($1, $2)`, [
        cooperativeId,
        foreignCooperativeId,
      ]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  async function createTreasury(
    kind: TreasuryKind,
    balance: number,
    options: { active?: boolean; cooperativeId?: number } = {},
  ): Promise<number> {
    const targetCooperativeId = options.cooperativeId ?? cooperativeId;
    const active = options.active ?? true;

    if (kind === "caisse") {
      const caisse = await client.query(
        `INSERT INTO caisses
           (cooperative_id, nom, type_caisse, solde_actuel_fcfa,
            fond_caisse_minimum_fcfa, actif)
         VALUES ($1, $2, 'centrale', $3, 0, $4)
         RETURNING id`,
        [targetCooperativeId, `Caisse ${suffix}`, String(balance), active],
      );
      const caisseId = caisse.rows[0].id as number;
      await client.query(
        `INSERT INTO sessions_caisse
           (caisse_id, cooperative_id, date_session,
            solde_ouverture_fcfa, statut)
         VALUES ($1, $2, CURRENT_DATE, $3, 'ouverte')`,
        [caisseId, targetCooperativeId, String(balance)],
      );
      return caisseId;
    }

    if (kind === "mobile_marchand") {
      const mobile = await client.query(
        `INSERT INTO comptes_mobiles_marchands
           (cooperative_id, nom, operateur, solde_actuel_fcfa,
            solde_mini_alerte_fcfa, actif)
         VALUES ($1, $2, 'wave', $3, 0, $4)
         RETURNING id`,
        [targetCooperativeId, `Mobile ${suffix}`, String(balance), active],
      );
      return mobile.rows[0].id as number;
    }

    const bank = await client.query(
      `INSERT INTO comptes_bancaires
         (cooperative_id, nom, banque, solde_actuel_fcfa,
          solde_mini_alerte_fcfa, actif)
       VALUES ($1, $2, 'Banque test', $3, 0, $4)
       RETURNING id`,
      [targetCooperativeId, `Banque ${suffix}`, String(balance), active],
    );
    return bank.rows[0].id as number;
  }

  async function requestAdvance(
    kind: TreasuryKind,
    accountId: number,
    amount: number,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await fetch(`${baseUrl}/avances`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        membreId,
        montantOctroyeFcfa: amount,
        dateOctroi: "2026-09-04",
        modePaiement: modeByKind[kind],
        compteTresorerieId: accountId,
        compteTresorerieType: kind,
      }),
    });
    return {
      status: response.status,
      body: await response.json() as Record<string, unknown>,
    };
  }

  async function balance(kind: TreasuryKind, accountId: number): Promise<string> {
    const table = kind === "caisse"
      ? "caisses"
      : kind === "mobile_marchand"
      ? "comptes_mobiles_marchands"
      : "comptes_bancaires";
    const result = await client.query(
      `SELECT solde_actuel_fcfa FROM ${table} WHERE id = $1`,
      [accountId],
    );
    return result.rows[0]?.solde_actuel_fcfa;
  }

  it.each(["caisse", "mobile_marchand", "banque"] as TreasuryKind[])(
    "débite le compte %s sélectionné, pas le premier compte actif",
    async (kind) => {
      const firstAccountId = await createTreasury(kind, 10_000);
      const selectedAccountId = await createTreasury(kind, 1_000);

      const result = await requestAdvance(kind, selectedAccountId, 300);

      expect(result.status).toBe(201);
      expect(await balance(kind, firstAccountId)).toBe("10000");
      expect(await balance(kind, selectedAccountId)).toBe("700");

      const table = kind === "caisse"
        ? "mouvements_caisse"
        : kind === "mobile_marchand"
        ? "mouvements_mobile_marchand"
        : "mouvements_banque";
      const movement = await client.query(
        `SELECT *
         FROM ${table}
         WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      expect(movement.rows).toHaveLength(1);
      expect(movement.rows[0]).toEqual(expect.objectContaining({
        cooperative_id: cooperativeId,
        type: kind === "caisse" ? "sortie" : "debit",
        motif: "avance",
        montant_fcfa: "300",
        enregistre_par: userId,
      }));
      if (kind === "caisse") {
        expect(movement.rows[0].caisse_id).toBe(selectedAccountId);
      } else {
        expect(movement.rows[0].compte_id).toBe(selectedAccountId);
      }
    },
  );

  it("refuse un compte d'une autre coopérative sans créer d'avance ni de mouvement", async () => {
    const result = await requestAdvance("banque", foreignAccountId, 300);

    expect(result.status).toBe(400);
    expect(String(result.body.erreur)).toContain("compte bancaire actif");

    const avances = await client.query(
      `SELECT count(*)::int AS count FROM avances WHERE membre_id = $1`,
      [membreId],
    );
    const movements = await client.query(
      `SELECT count(*)::int AS count FROM mouvements_banque WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    expect(avances.rows[0].count).toBe(0);
    expect(movements.rows[0].count).toBe(0);
  });

  it("refuse un compte inactif de la coopérative sans effet financier", async () => {
    const accountId = await createTreasury("mobile_marchand", 10_000, { active: false });

    const result = await requestAdvance("mobile_marchand", accountId, 300);

    expect(result.status).toBe(400);
    expect(String(result.body.erreur)).toContain("Mobile Marchand actif");
    expect(await balance("mobile_marchand", accountId)).toBe("10000");

    const movements = await client.query(
      `SELECT count(*)::int AS count
       FROM mouvements_mobile_marchand WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    expect(movements.rows[0].count).toBe(0);
  });

  it("annule l'insertion de l'avance quand le solde est insuffisant", async () => {
    const accountId = await createTreasury("banque", 100);

    const result = await requestAdvance("banque", accountId, 300);

    expect(result.status).toBe(400);
    expect(String(result.body.erreur)).toContain("Solde bancaire insuffisant");
    expect(await balance("banque", accountId)).toBe("100");

    const avances = await client.query(
      `SELECT count(*)::int AS count FROM avances WHERE membre_id = $1`,
      [membreId],
    );
    const movements = await client.query(
      `SELECT count(*)::int AS count FROM mouvements_banque WHERE cooperative_id = $1`,
      [cooperativeId],
    );
    expect(avances.rows[0].count).toBe(0);
    expect(movements.rows[0].count).toBe(0);
  });

  it("ne laisse pas deux octrois concurrents dépasser le solde du même compte", async () => {
    const accountId = await createTreasury("mobile_marchand", 1_000);

    const results = await Promise.all([
      requestAdvance("mobile_marchand", accountId, 700),
      requestAdvance("mobile_marchand", accountId, 700),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 400]);
    expect(await balance("mobile_marchand", accountId)).toBe("300");

    const advances = await client.query(
      `SELECT count(*)::int AS count, coalesce(sum(montant_octroye_fcfa), 0)::int AS total
       FROM avances WHERE membre_id = $1`,
      [membreId],
    );
    const movements = await client.query(
      `SELECT count(*)::int AS count, coalesce(sum(montant_fcfa), 0)::int AS total
       FROM mouvements_mobile_marchand WHERE compte_id = $1`,
      [accountId],
    );
    expect(advances.rows[0]).toEqual({ count: 1, total: 700 });
    expect(movements.rows[0]).toEqual({ count: 1, total: 700 });
  });
});
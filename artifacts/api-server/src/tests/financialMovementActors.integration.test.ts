import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import { enregistrerPaiement } from "../services/fiscaliteService.js";
import {
  createChargeDiverses,
  validerChargeDiverses,
} from "../services/chargesDiversesService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type TreasuryKind = "caisse" | "banque" | "mobile_marchand";

const treasuryCases: Array<{
  kind: TreasuryKind;
  chargeMode: string;
  chargeCredit: string;
  fiscalMode: "especes" | "virement" | "mobile_marchand";
}> = [
  { kind: "caisse", chargeMode: "especes", chargeCredit: "571", fiscalMode: "especes" },
  { kind: "banque", chargeMode: "virement", chargeCredit: "521", fiscalMode: "virement" },
  { kind: "mobile_marchand", chargeMode: "mobile_money", chargeCredit: "552", fiscalMode: "mobile_marchand" },
];

describe.skipIf(!enabled)("auteur des flux financiers composés sur PostgreSQL", () => {
  let client: any;
  let cooperativeId: number;
  let userId: number;
  const suffix = `${process.pid}_${Date.now()}`;

  beforeAll(async () => {
    client = await pool.connect();
    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Auteurs flux financiers ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Auteur', 'Flux', $2, 'integration-only', 'comptable')
       RETURNING id`,
      [cooperativeId, `financial-actors-${suffix}@example.test`],
    );
    userId = user.rows[0].id;
  });

  afterEach(async () => {
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
        `DELETE FROM declarations_fiscales WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM obligations_fiscales WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM charges_diverses WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_caisse WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_banque WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_mobile_marchand WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM sessions_caisse WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(`DELETE FROM caisses WHERE cooperative_id = $1`, [
        cooperativeId,
      ]);
      await client.query(
        `DELETE FROM comptes_bancaires WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM comptes_mobiles_marchands WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  });

  afterAll(async () => {
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.query("DELETE FROM cooperatives WHERE id = $1", [cooperativeId]);
    client.release();
  });

  async function createTreasury(kind: TreasuryKind): Promise<number> {
    if (kind === "caisse") {
      const caisse = await client.query(
        `INSERT INTO caisses
           (cooperative_id, nom, type_caisse, solde_actuel_fcfa,
            fond_caisse_minimum_fcfa, actif)
         VALUES ($1, $2, 'centrale', 10000, 0, true)
         RETURNING id`,
        [cooperativeId, `Caisse auteurs ${suffix}`],
      );
      await client.query(
        `INSERT INTO sessions_caisse
           (caisse_id, cooperative_id, date_session,
            solde_ouverture_fcfa, statut)
         VALUES ($1, $2, CURRENT_DATE, 10000, 'ouverte')`,
        [caisse.rows[0].id, cooperativeId],
      );
      return caisse.rows[0].id;
    }

    if (kind === "banque") {
      const banque = await client.query(
        `INSERT INTO comptes_bancaires
           (cooperative_id, nom, banque, solde_actuel_fcfa,
            solde_mini_alerte_fcfa, actif)
         VALUES ($1, $2, 'Banque test', 10000, 0, true)
         RETURNING id`,
        [cooperativeId, `Banque auteurs ${suffix}`],
      );
      return banque.rows[0].id;
    }

    const mobile = await client.query(
      `INSERT INTO comptes_mobiles_marchands
         (cooperative_id, nom, operateur, solde_actuel_fcfa,
          solde_mini_alerte_fcfa, actif)
       VALUES ($1, $2, 'wave', 10000, 0, true)
       RETURNING id`,
      [cooperativeId, `Mobile auteurs ${suffix}`],
    );
    return mobile.rows[0].id;
  }

  function movementTable(kind: TreasuryKind): string {
    return kind === "caisse"
      ? "mouvements_caisse"
      : kind === "banque"
        ? "mouvements_banque"
        : "mouvements_mobile_marchand";
  }

  it.each(treasuryCases)(
    "conserve l'auteur d'une charge validée sur $kind",
    async ({ kind, chargeMode, chargeCredit }) => {
      const treasuryId = await createTreasury(kind);
      const charge = await createChargeDiverses(cooperativeId, userId, {
        dateCharge: new Date().toISOString().slice(0, 10),
        libelle: `Charge auteur ${kind}`,
        montantFcfa: "300",
        categorie: "autre",
        compteDebit: "658",
        compteCredit: chargeCredit,
        modePaiement: chargeMode,
        referencePiece: `ACTOR-CHARGE-${kind}-${suffix}`,
        compteTresorerieId: treasuryId,
        compteTresorerieType: kind,
      });

      await validerChargeDiverses(cooperativeId, charge.id, userId);

      const movement = await client.query(
        `SELECT enregistre_par
         FROM ${movementTable(kind)}
         WHERE cooperative_id = $1 AND motif = 'charge_diverse'
           AND montant_fcfa = 300`,
        [cooperativeId],
      );
      expect(movement.rows).toEqual([{ enregistre_par: userId }]);
    },
  );

  it.each(treasuryCases)(
    "conserve l'auteur d'un paiement fiscal sur $kind",
    async ({ kind, fiscalMode }) => {
      const treasuryId = await createTreasury(kind);
      const obligation = await client.query(
        `INSERT INTO obligations_fiscales
           (cooperative_id, type_taxe, libelle, periodicite, actif)
         VALUES ($1, 'tva', $2, 'mensuel', true)
         RETURNING id`,
        [cooperativeId, `TVA auteur ${kind}`],
      );
      const declaration = await client.query(
        `INSERT INTO declarations_fiscales
           (cooperative_id, obligation_id, periode,
            montant_calcule_fcfa, montant_paye_fcfa, statut)
         VALUES ($1, $2, '2026-09', 300, 0, 'a_payer')
         RETURNING id`,
        [cooperativeId, obligation.rows[0].id],
      );

      await enregistrerPaiement(cooperativeId, declaration.rows[0].id, {
        montantPaye: 300,
        datePaiement: new Date().toISOString().slice(0, 10),
        modePaiement: fiscalMode,
        ...(kind === "caisse" ? { caisseId: treasuryId } : {}),
        ...(kind !== "caisse" ? { mobileCompteId: treasuryId } : {}),
        userId,
      });

      const movement = await client.query(
        `SELECT enregistre_par
         FROM ${movementTable(kind)}
         WHERE cooperative_id = $1 AND motif = 'paiement_fiscal'
           AND montant_fcfa = 300`,
        [cooperativeId],
      );
      expect(movement.rows).toEqual([{ enregistre_par: userId }]);
    },
  );
});
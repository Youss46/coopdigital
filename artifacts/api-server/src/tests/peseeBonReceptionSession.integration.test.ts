import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  createSession,
  creerSessionBatch,
} from "../services/peseeSessionService.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type BonState = {
  statut: string;
  sessionPeseeId: number | null;
  membreDelegueId: number;
};

type NonEffectState = {
  sessionCount: number;
  bon: BonState;
};

describe.skipIf(!enabled)(
  "liaison bon de réception / membre sur PostgreSQL",
  () => {
    let client: any;
    let cooperativeId: number;
    let firstMemberId: number;
    let secondMemberId: number;
    let firstBonId: number;
    let secondBonId: number;

    const suffix = `${process.pid}_${Date.now()}`;

    beforeAll(async () => {
      client = await pool.connect();

      const cooperative = await client.query(
        `INSERT INTO cooperatives (nom, ville, region)
         VALUES ($1, 'Test', 'Test')
         RETURNING id`,
        [`Pesée bon membre ${suffix}`],
      );
      cooperativeId = cooperative.rows[0].id;

      const firstMember = await client.query(
        `INSERT INTO membres
           (cooperative_id, nom, prenoms, telephone, superficie_ha,
            date_adhesion, numero_membre, categorie_membre, statut_membre)
         VALUES ($1, 'Premier', 'Membre', $2, 1, CURRENT_DATE, 1,
                 'délégué de localités', 'actif')
         RETURNING id`,
        [
          cooperativeId,
          `+2250701${process.pid}1`,
        ],
      );
      firstMemberId = firstMember.rows[0].id;

      const secondMember = await client.query(
        `INSERT INTO membres
           (cooperative_id, nom, prenoms, telephone, superficie_ha,
            date_adhesion, numero_membre, categorie_membre, statut_membre)
         VALUES ($1, 'Second', 'Membre', $2, 1, CURRENT_DATE, 2,
                 'délégué de localités', 'actif')
         RETURNING id`,
        [cooperativeId, `+2250701${process.pid}2`],
      );
      secondMemberId = secondMember.rows[0].id;

      const firstBon = await client.query(
        `INSERT INTO bons_reception_membres_delegues
           (cooperative_id, membre_delegue_id, statut)
         VALUES ($1, $2, 'en_attente_pesee')
         RETURNING id`,
        [cooperativeId, firstMemberId],
      );
      firstBonId = firstBon.rows[0].id;

      const secondBon = await client.query(
        `INSERT INTO bons_reception_membres_delegues
           (cooperative_id, membre_delegue_id, statut)
         VALUES ($1, $2, 'en_attente_pesee')
         RETURNING id`,
        [cooperativeId, secondMemberId],
      );
      secondBonId = secondBon.rows[0].id;
    });

    afterAll(async () => {
      if (!client) return;

      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM lignes_pesee
           WHERE session_id IN (
             SELECT id FROM sessions_pesee WHERE cooperative_id = $1
           )`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM sessions_pesee WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM bons_reception_membres_delegues
           WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(
          `DELETE FROM sequences_pesee WHERE cooperative_id = $1`,
          [cooperativeId],
        );
        await client.query(`DELETE FROM membres WHERE id IN ($1, $2)`, [
          firstMemberId,
          secondMemberId,
        ]);
        await client.query(`DELETE FROM cooperatives WHERE id = $1`, [
          cooperativeId,
        ]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    });

    async function readNonEffectState(): Promise<NonEffectState> {
      const sessions = await client.query(
        `SELECT count(*)::int AS count
           FROM sessions_pesee
          WHERE cooperative_id = $1`,
        [cooperativeId],
      );
      const bon = await client.query(
        `SELECT statut,
                session_pesee_id AS "sessionPeseeId",
                membre_delegue_id AS "membreDelegueId"
           FROM bons_reception_membres_delegues
          WHERE id = $1`,
        [secondBonId],
      );

      return {
        sessionCount: sessions.rows[0].count,
        bon: bon.rows[0] as BonState,
      };
    }

    async function expectNoEffect(before: NonEffectState): Promise<void> {
      const after = await readNonEffectState();
      expect(after).toEqual(before);
    }

    it("refuse le bon d'un autre membre sans effet sur le chemin direct", async () => {
      const before = await readNonEffectState();

      await expect(
        createSession(cooperativeId, {
          membreId: firstMemberId,
          operation: "reception_membre_delegue",
          bonReceptionId: secondBonId,
          certificationCacao: "ORDINAIRE",
        }),
      ).rejects.toThrow("ne correspond pas au membre sélectionné");

      await expectNoEffect(before);
    });

    it("refuse le bon d'un autre membre sans effet pendant la synchronisation batch", async () => {
      const before = await readNonEffectState();

      await expect(
        creerSessionBatch(cooperativeId, 0, {
          localId: `mauvais-bon-${suffix}`,
          membreId: firstMemberId,
          produit: "cacao",
          operation: "reception_membre_delegue",
          certificationCacao: "ORDINAIRE",
          bonReceptionId: secondBonId,
          lignes: [
            {
              localId: "ligne-1",
              nbSacs: 1,
              poidsBrutKg: 101,
              tareKg: 1,
            },
          ],
          statut: "terminee",
        }),
      ).rejects.toThrow("ne correspond pas au membre sélectionné");

      await expectNoEffect(before);
    });

    it("conserve la fixture avec deux membres et deux bons distincts", async () => {
      const bons = await client.query(
        `SELECT membre_delegue_id
           FROM bons_reception_membres_delegues
          WHERE id = ANY($1::int[])
          ORDER BY id`,
        [[firstBonId, secondBonId]],
      );

      expect(bons.rows).toEqual([
        { membre_delegue_id: firstMemberId },
        { membre_delegue_id: secondMemberId },
      ]);
    });
  },
);
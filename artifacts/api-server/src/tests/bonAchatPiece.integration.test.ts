import express from "express";
import type { Server } from "node:http";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import {
  handleDeleteDepenseVehicule,
  handleEmettreBonAchatPiece,
  handleGetBonAchatPiecePdf,
  handleUpdateDepenseVehicule,
} from "../controllers/transportController.js";
import { listPaiements, rejeterPaiement, validerPaiement } from "../controllers/paiementsController.js";
import { getRecuPaiement } from "../controllers/rapportsController.js";

const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  Boolean(process.env.DATABASE_URL);

type BonResponse = {
  paiementId: number;
  dejaEmis: boolean;
};

/**
 * Cette suite passe par les vrais handlers Express et utilise PostgreSQL pour
 * vérifier que le verrou de la dépense et l'index unique garantissent une
 * émission idempotente, y compris pendant deux requêtes concurrentes.
 *
 * Exécution explicite :
 * RUN_POSTGRES_INTEGRATION=1 DATABASE_URL=... \
 *   pnpm --filter @workspace/api-server exec vitest run \
 *   --config vitest.integration.config.ts src/tests/bonAchatPiece.integration.test.ts
 */
describe.skipIf(!enabled)("bons d'achat pièces idempotents sur PostgreSQL", () => {
  let client: any;
  let server: Server | undefined;
  let baseUrl: string;
  let cooperativeId: number;
  let userId: number;
  let vehicleId: number;
  let caisseId: number;
  let mobileAccountId: number;
  let otherCooperativeId: number;
  let otherUserId: number;
  let otherVehicleId: number;
  let otherDepenseId: number;
  let otherPaymentId: number;
  const depenseIds: number[] = [];
  const paymentIds: number[] = [];

  const suffix = `${process.pid}_${Date.now()}`;
  const delayFunction = `task169_bon_achat_delay_${suffix}`;
  const delayTrigger = `task169_bon_achat_delay_trigger_${suffix}`;

  function identifier(value: string): string {
    return `"${value.replaceAll(`"`, `""`)}"`;
  }

  beforeAll(async () => {
    client = await pool.connect();

    const cooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Bons achat pièces ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Test', 'Bons pièces', $2, 'integration-test', 'comptable')
       RETURNING id`,
      [cooperativeId, `bons-pieces-${suffix}@test.invalid`],
    );
    userId = user.rows[0].id;

    const vehicle = await client.query(
      `INSERT INTO vehicules
         (cooperative_id, immatriculation, marque, modele, type)
       VALUES ($1, $2, 'Test', 'Pièces', 'camion')
       RETURNING id`,
      [cooperativeId, `TEST-${process.pid}`],
    );
    vehicleId = vehicle.rows[0].id;

    const caisse = await client.query(
      `INSERT INTO caisses
         (cooperative_id, nom, type_caisse, solde_actuel_fcfa,
          fond_caisse_minimum_fcfa, actif)
       VALUES ($1, 'Caisse bons pièces', 'centrale', 10000000, 0, true)
       RETURNING id`,
      [cooperativeId],
    );
    caisseId = caisse.rows[0].id;

    await client.query(
      `INSERT INTO sessions_caisse
         (caisse_id, cooperative_id, date_session, solde_ouverture_fcfa, statut)
       VALUES ($1, $2, CURRENT_DATE, 10000000, 'ouverte')`,
      [caisseId, cooperativeId],
    );

    const mobileAccount = await client.query(
      `INSERT INTO comptes_mobiles_marchands
         (cooperative_id, nom, operateur, solde_actuel_fcfa,
          solde_mini_alerte_fcfa, actif)
       VALUES ($1, 'Compte mobile bons pièces', 'orange_money', 10000000, 0, true)
       RETURNING id`,
      [cooperativeId],
    );
    mobileAccountId = mobileAccount.rows[0].id;

    await client.query(
      `INSERT INTO config_comptable (cooperative_id, auto_paiements)
       VALUES ($1, true)`,
      [cooperativeId],
    );

    const otherCooperative = await client.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Bons achat pièces autre coop ${suffix}`],
    );
    otherCooperativeId = otherCooperative.rows[0].id;

    const otherUser = await client.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Autre', 'Coopérative', $2, 'integration-test', 'comptable')
       RETURNING id`,
      [otherCooperativeId, `bons-pieces-autre-${suffix}@test.invalid`],
    );
    otherUserId = otherUser.rows[0].id;

    const otherVehicle = await client.query(
      `INSERT INTO vehicules
         (cooperative_id, immatriculation, marque, modele, type)
       VALUES ($1, $2, 'Autre', 'Coopérative', 'camion')
       RETURNING id`,
      [otherCooperativeId, `TEST-AUTRE-${process.pid}`],
    );
    otherVehicleId = otherVehicle.rows[0].id;

    const otherDepense = await client.query(
      `INSERT INTO depenses_vehicule
         (cooperative_id, vehicule_id, type, date_depense, montant_fcfa, libelle, demandeur, fournisseur)
       VALUES ($1, $2, 'piece_rechange', CURRENT_DATE, 1000, 'Pièce autre coop', 'Demandeur autre coop', 'Fournisseur autre coop')
       RETURNING id`,
      [otherCooperativeId, otherVehicleId],
    );
    otherDepenseId = otherDepense.rows[0].id;

    const otherPayment = await client.query(
      `INSERT INTO paiements
         (cooperative_id, depense_vehicule_id, montant_fcfa, montant_a_payer_fcfa,
          montant_verse_fcfa, reste_a_payer_fcfa, libelle, numero_recu, statut, initialise_par)
       VALUES ($1, $2, 1000, 1000, 0, 1000, 'Achat pièce autre coop',
               'REC-AUTRE-001', 'en_attente', $3)
       RETURNING id`,
      [otherCooperativeId, otherDepenseId, otherUserId],
    );
    otherPaymentId = otherPayment.rows[0].id;

    // Ralentir l'INSERT du premier appel afin de garantir que Promise.all
    // exerce réellement le second appel pendant que le premier est actif.
    await client.query(`
      CREATE FUNCTION ${identifier(delayFunction)}()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        PERFORM pg_sleep(0.1);
        RETURN NEW;
      END;
      $$;

      CREATE TRIGGER ${identifier(delayTrigger)}
      BEFORE INSERT ON paiements
      FOR EACH ROW
      WHEN (NEW.depense_vehicule_id IS NOT NULL)
      EXECUTE FUNCTION ${identifier(delayFunction)}();
    `);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: userId, role: "comptable", cooperativeId };
      next();
    });
    app.post("/transport/depenses/:id/emettre-bon-achat", handleEmettreBonAchatPiece);
    app.get("/transport/depenses/:id/bon-achat-pdf", handleGetBonAchatPiecePdf);
    app.put("/transport/depenses/:id", handleUpdateDepenseVehicule);
    app.delete("/transport/depenses/:id", handleDeleteDepenseVehicule);
    app.get("/paiements", listPaiements);
    app.get("/rapports/recu/paiement/:id", getRecuPaiement);
    app.patch("/paiements/:id/valider", validerPaiement);
    app.post("/paiements/:id/rejeter", rejeterPaiement);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const runningServer = server;
    if (!runningServer) throw new Error("Serveur de test indisponible");
    const address = runningServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Serveur de test indisponible");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
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
      await client.query(`DROP TRIGGER IF EXISTS ${identifier(delayTrigger)} ON paiements`);
      await client.query(`DROP FUNCTION IF EXISTS ${identifier(delayFunction)}()`);
      await client.query(
        `DELETE FROM ecritures_comptables
         WHERE cooperative_id = $1 AND source = 'paiement'`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM ecritures_en_attente
         WHERE cooperative_id = $1 AND source = 'paiement'`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_caisse
         WHERE caisse_id IN (SELECT id FROM caisses WHERE cooperative_id = $1)`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM mouvements_mobile_marchand
         WHERE compte_id IN (
           SELECT id FROM comptes_mobiles_marchands WHERE cooperative_id = $1
         )`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM paiement_lignes
         WHERE paiement_id IN (
           SELECT id FROM paiements WHERE depense_vehicule_id IN (
             SELECT id FROM depenses_vehicule WHERE cooperative_id = $1
           )
         )`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM cheques_emis
         WHERE paiement_id IN (
           SELECT id FROM paiements WHERE depense_vehicule_id IN (
             SELECT id FROM depenses_vehicule WHERE cooperative_id = $1
           )
         )`,
        [cooperativeId],
      );
      await client.query(
        `DELETE FROM paiements
         WHERE depense_vehicule_id IN (
           SELECT id FROM depenses_vehicule WHERE cooperative_id = $1
         )`,
        [cooperativeId],
      );
      await client.query(`DELETE FROM config_comptable WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM sessions_caisse WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM caisses WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM comptes_mobiles_marchands WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM depenses_vehicule WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM vehicules WHERE cooperative_id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
      await client.query(`DELETE FROM paiements WHERE id = $1`, [otherPaymentId]);
      await client.query(`DELETE FROM depenses_vehicule WHERE id = $1`, [otherDepenseId]);
      await client.query(`DELETE FROM vehicules WHERE id = $1`, [otherVehicleId]);
      await client.query(`DELETE FROM users WHERE id = $1`, [otherUserId]);
      await client.query(`DELETE FROM cooperatives WHERE id = $1`, [otherCooperativeId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  async function createDepense(libelle: string, demandeur: string | null = "Demandeur integration"): Promise<number> {
    const result = await client.query(
      `INSERT INTO depenses_vehicule
         (cooperative_id, vehicule_id, type, date_depense, montant_fcfa, libelle, demandeur, fournisseur)
       VALUES ($1, $2, 'piece_rechange', CURRENT_DATE, 1000, $3, $4, 'Fournisseur test')
       RETURNING id`,
      [cooperativeId, vehicleId, libelle, demandeur],
    );
    const id = result.rows[0].id as number;
    depenseIds.push(id);
    return id;
  }

  async function emit(depenseId: number): Promise<Response> {
    return fetch(`${baseUrl}/transport/depenses/${depenseId}/emettre-bon-achat`, {
      method: "POST",
    });
  }

  async function emitJson(depenseId: number): Promise<{ response: Response; body: BonResponse }> {
    const response = await emit(depenseId);
    return { response, body: await response.json() as BonResponse };
  }

  async function validate(paymentId: number, body: Record<string, unknown>): Promise<Response> {
    return fetch(`${baseUrl}/paiements/${paymentId}/valider`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function reject(paymentId: number, motifRejet: string): Promise<Response> {
    return fetch(`${baseUrl}/paiements/${paymentId}/rejeter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motifRejet }),
    });
  }

  async function emitAndGetPaymentId(libelle: string): Promise<number> {
    const depenseId = await createDepense(libelle);
    const { response, body } = await emitJson(depenseId);
    expect(response.status).toBe(201);
    expect(body.dejaEmis).toBe(false);
    paymentIds.push(body.paiementId);
    return body.paiementId;
  }

  function extractPdfText(buffer: Buffer): string {
    const parts: string[] = [buffer.toString("latin1")];
    let position = 0;

    while (position < buffer.length) {
      let marker = buffer.indexOf(Buffer.from("stream\r\n"), position);
      let markerLength = 8;
      const alternateMarker = buffer.indexOf(Buffer.from("stream\n"), position);
      if (marker === -1 || (alternateMarker !== -1 && alternateMarker < marker)) {
        marker = alternateMarker;
        markerLength = 7;
      }
      if (marker === -1) break;

      const start = marker + markerLength;
      const end = buffer.indexOf(Buffer.from("endstream"), start);
      if (end === -1) break;

      try {
        const inflated = zlib.inflateSync(buffer.subarray(start, end)).toString("latin1");
        parts.push(inflated);
        parts.push(inflated.replace(/<([0-9A-Fa-f]{2,})>/g, (_match, hex: string) => {
          try {
            return Buffer.from(hex, "hex").toString("latin1");
          } catch {
            return _match;
          }
        }).replace(/\u0097/g, "—"));
        parts.push(inflated.replace(/\[([^\]]*)\]\s*TJ/g, (_match, inside: string) => {
          const chunks: string[] = [];
          for (const match of inside.matchAll(/<([0-9A-Fa-f]{2,})>/g)) {
            chunks.push(Buffer.from(match[1]!, "hex").toString("latin1"));
          }
          return chunks.join("");
        }).replace(/\u0097/g, "—"));
      } catch {
        // Les flux non compressés (par exemple des images) ne contiennent pas
        // le texte métier recherché par ces assertions.
      }
      position = end + "endstream".length;
    }

    return parts.join("\n");
  }

  async function paymentState(paymentId: number) {
    const result = await client.query(
      `SELECT depense_vehicule_id, montant_fcfa, statut, mode_paiement, motif_rejet
       FROM paiements WHERE id = $1`,
      [paymentId],
    );
    return result.rows[0];
  }

  it("retourne le même règlement au second appel et le rend visible dans GET /paiements", async () => {
    const depenseId = await createDepense("Pompe de direction");
    const first = await emitJson(depenseId);
    paymentIds.push(first.body.paiementId);

    const second = await emitJson(depenseId);

    expect(first.response.status).toBe(201);
    expect(first.body).toEqual({
      paiementId: first.body.paiementId,
      dejaEmis: false,
    });
    expect(second.response.status).toBe(200);
    expect(second.body).toEqual({
      paiementId: first.body.paiementId,
      dejaEmis: true,
    });

    const count = await client.query(
      `SELECT count(*)::int AS count
       FROM paiements WHERE depense_vehicule_id = $1`,
      [depenseId],
    );
    expect(count.rows[0].count).toBe(1);

    const visible = await fetch(`${baseUrl}/paiements`);
    expect(visible.status).toBe(200);
    const paiements = await visible.json() as Array<Record<string, unknown>>;
    expect(paiements).toContainEqual(
      expect.objectContaining({
        id: first.body.paiementId,
        depenseVehiculeId: depenseId,
        montantFcfa: 1000,
        statut: "en_attente",
      }),
    );
  });

  it("télécharge le bon d'achat via sa route avec le demandeur", async () => {
    const depenseId = await createDepense("Pompe de direction", "Demandeur bon achat");

    const response = await fetch(`${baseUrl}/transport/depenses/${depenseId}/bon-achat-pdf`);
    const body = Buffer.from(await response.arrayBuffer());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/pdf/);
    expect(body.slice(0, 4).toString()).toBe("%PDF");
    expect(extractPdfText(body)).toContain("Demandeur bon achat");
  });

  it("télécharge le reçu de règlement avec le demandeur et la nature de pièce", async () => {
    const depenseId = await createDepense("Alternateur", "Demandeur reçu pièce");
    const { response: emissionResponse, body: emission } = await emitJson(depenseId);
    paymentIds.push(emission.paiementId);
    expect(emissionResponse.status).toBe(201);

    const response = await fetch(`${baseUrl}/rapports/recu/paiement/${emission.paiementId}`);
    const body = Buffer.from(await response.arrayBuffer());
    const normalizedText = extractPdfText(body)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/pdf/);
    expect(normalizedText).toContain("DEMANDEUR RECU PIECE");
    expect(normalizedText).toContain("PIECE DE RECHANGE");
  });

  it("refuse le reçu d'une autre coopérative tout en autorisant celui de la coopérative courante", async () => {
    const ownPaymentId = await emitAndGetPaymentId("Reçu coopérative courante");

    const foreignResponse = await fetch(`${baseUrl}/rapports/recu/paiement/${otherPaymentId}`);
    const foreignBody = await foreignResponse.json() as { erreur: string };

    expect(foreignResponse.status).toBe(404);
    expect(foreignBody).toEqual({ erreur: "Paiement introuvable" });

    const ownResponse = await fetch(`${baseUrl}/rapports/recu/paiement/${ownPaymentId}`);
    const ownBody = Buffer.from(await ownResponse.arrayBuffer());

    expect(ownResponse.status).toBe(200);
    expect(ownResponse.headers.get("content-type")).toMatch(/application\/pdf/);
    expect(ownBody.slice(0, 4).toString()).toBe("%PDF");
  });

  it("télécharge une dépense historique sans demandeur avec le repli —", async () => {
    const depenseId = await createDepense("Dépense historique sans demandeur", null);

    const response = await fetch(`${baseUrl}/transport/depenses/${depenseId}/bon-achat-pdf`);
    const body = Buffer.from(await response.arrayBuffer());
    const text = extractPdfText(body);

    expect(response.status).toBe(200);
    expect(text).toContain("Demandeur");
    expect(text).toContain("—");
  });

  it("ne crée qu'un règlement lors de deux émissions concurrentes", async () => {
    const depenseId = await createDepense("Alternateur");
    const responses = await Promise.all([
      emitJson(depenseId),
      emitJson(depenseId),
    ]);
    paymentIds.push(responses[0].body.paiementId);

    expect(responses.map(({ response }) => response.status).sort()).toEqual([200, 201]);
    expect(responses[0].body.paiementId).toBe(responses[1].body.paiementId);
    expect(responses.map(({ body }) => body.dejaEmis).sort()).toEqual([false, true]);

    const count = await client.query(
      `SELECT count(*)::int AS count
       FROM paiements WHERE depense_vehicule_id = $1`,
      [depenseId],
    );
    expect(count.rows[0].count).toBe(1);
  });

  it.each([
    ["montant", { montant_fcfa: 2000 }],
    ["libellé", { libelle: "Libellé modifié" }],
  ])("refuse la modification du %s après émission du bon sans modifier la dépense", async (_field, patch) => {
    const depenseId = await createDepense("Dépense verrouillée");
    const { response: emitResponse, body } = await emitJson(depenseId);
    paymentIds.push(body.paiementId);
    expect(emitResponse.status).toBe(201);

    const before = await client.query(
      `SELECT montant_fcfa, libelle FROM depenses_vehicule WHERE id = $1`,
      [depenseId],
    );
    const response = await fetch(`${baseUrl}/transport/depenses/${depenseId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const responseBody = await response.json() as { erreur: string };

    expect(response.status).toBe(409);
    expect(responseBody.erreur).toMatch(/déjà liée à un règlement/i);

    const after = await client.query(
      `SELECT montant_fcfa, libelle FROM depenses_vehicule WHERE id = $1`,
      [depenseId],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it("refuse la suppression d'une dépense après émission du bon sans supprimer la dépense", async () => {
    const depenseId = await createDepense("Dépense non supprimable");
    const { response: emitResponse, body } = await emitJson(depenseId);
    paymentIds.push(body.paiementId);
    expect(emitResponse.status).toBe(201);

    const response = await fetch(`${baseUrl}/transport/depenses/${depenseId}`, {
      method: "DELETE",
    });
    const responseBody = await response.json() as { erreur: string };

    expect(response.status).toBe(409);
    expect(responseBody.erreur).toMatch(/déjà liée à un règlement/i);

    const remaining = await client.query(
      `SELECT id FROM depenses_vehicule WHERE id = $1`,
      [depenseId],
    );
    expect(remaining.rows).toHaveLength(1);
  });

  it.each([
    ["espèces", { modePaiement: "especes" }, "effectue", "571"],
    ["banque", { modePaiement: "virement" }, "confirme", "521"],
    [
      "Mobile Money",
      { modePaiement: "orange_money", referenceTransaction: "OM-BON-PIECE-169" },
      "confirme",
      "552",
    ],
    [
      "chèque",
      { modePaiement: "cheque", numeroCheque: "CHQ-BON-PIECE-169", banque: "Banque test" },
      "confirme",
      "521",
    ],
  ] as const)("valide un règlement de pièce en %s sans effet en double", async (_label, body, statut, compteCredit) => {
    const paymentId = await emitAndGetPaymentId(`Pièce validation ${_label}`);
    const response = await validate(paymentId, body);
    expect(response.status).toBe(200);

    const state = await paymentState(paymentId);
    expect(state).toMatchObject({
      depense_vehicule_id: expect.any(Number),
      montant_fcfa: 1000,
      statut,
      mode_paiement: body.modePaiement,
      motif_rejet: null,
    });

    const accounting = await client.query(
      `SELECT count(*)::int AS count, compte_debit, compte_credit, montant_fcfa
       FROM ecritures_comptables
       WHERE cooperative_id = $1 AND source = 'paiement' AND source_id = $2
       GROUP BY compte_debit, compte_credit, montant_fcfa`,
      [cooperativeId, paymentId],
    );
    expect(accounting.rows).toEqual([{
      count: 1,
      compte_debit: "624",
      compte_credit: compteCredit,
      montant_fcfa: 1000,
    }]);

    if (body.modePaiement === "especes") {
      const movements = await client.query(
        `SELECT count(*)::int AS count
         FROM mouvements_caisse WHERE reference_operation = $1`,
        [`PAI-${paymentId}`],
      );
      expect(movements.rows[0].count).toBe(1);
    }

    if (body.modePaiement === "orange_money") {
      const movements = await client.query(
        `SELECT count(*)::int AS count
         FROM mouvements_mobile_marchand
         WHERE compte_id = $1 AND libelle = $2`,
        [mobileAccountId, `Paiement producteur — règlement #${paymentId}`],
      );
      expect(movements.rows[0].count).toBe(1);
    }

    if (body.modePaiement === "cheque") {
      const cheques = await client.query(
        `SELECT count(*)::int AS count
         FROM cheques_emis WHERE paiement_id = $1`,
        [paymentId],
      );
      expect(cheques.rows[0].count).toBe(1);
    }
  });

  it("rejette un règlement de pièce sans créer d'effet financier", async () => {
    const paymentId = await emitAndGetPaymentId("Pièce rejetée");
    const response = await reject(paymentId, "Bon fournisseur non conforme");
    expect(response.status).toBe(200);

    expect(await paymentState(paymentId)).toMatchObject({
      montant_fcfa: 1000,
      statut: "rejete",
      mode_paiement: null,
      motif_rejet: "Bon fournisseur non conforme",
    });

    const effects = await client.query(
      `SELECT
         (SELECT count(*) FROM ecritures_comptables
          WHERE cooperative_id = $1 AND source = 'paiement' AND source_id = $2) AS accounting,
         (SELECT count(*) FROM ecritures_en_attente
          WHERE cooperative_id = $1 AND source = 'paiement' AND source_id = $2) AS pending_accounting,
         (SELECT count(*) FROM mouvements_caisse
          WHERE reference_operation = $3) AS cash_movements,
         (SELECT count(*) FROM mouvements_mobile_marchand
          WHERE libelle = $4) AS mobile_movements,
         (SELECT count(*) FROM cheques_emis WHERE paiement_id = $2) AS cheques`,
      [
        cooperativeId,
        paymentId,
        `PAI-${paymentId}`,
        `Paiement producteur — règlement #${paymentId}`,
      ],
    );
    expect(effects.rows[0]).toEqual({
      accounting: "0",
      pending_accounting: "0",
      cash_movements: "0",
      mobile_movements: "0",
      cheques: "0",
    });
  });
});
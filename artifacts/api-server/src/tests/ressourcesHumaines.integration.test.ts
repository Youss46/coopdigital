import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { pool } from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";
import {
  logger,
  recordRhStorageReadFailure,
  resetRhStorageReadFailureCounters,
  resetRhStorageReadFailureState,
} from "../lib/logger.js";
import ressourcesHumainesRouter from "../routes/ressourcesHumaines.js";
import salairesRouter from "../routes/salaires.js";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1" && Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("décisions de congés RH sur PostgreSQL", () => {
  let server: Server;
  let baseUrl: string;
  let cooperativeA: number;
  let cooperativeB: number;
  let personnelA: number;
  let personnelB: number;
  let userA: number;
  let userB: number;
  const createdLeaveIds: number[] = [];
  const createdDocumentIds: number[] = [];

  beforeAll(async () => {
    const suffix = `${process.pid}-${Date.now()}`;
    const cooperativeRows = await Promise.all([
      pool.query(
        `INSERT INTO cooperatives (nom, ville, region) VALUES ($1, 'Test', 'Test') RETURNING id`,
        [`RH concurrency A ${suffix}`],
      ),
      pool.query(
        `INSERT INTO cooperatives (nom, ville, region) VALUES ($1, 'Test', 'Test') RETURNING id`,
        [`RH concurrency B ${suffix}`],
      ),
    ]);
    cooperativeA = cooperativeRows[0].rows[0].id;
    cooperativeB = cooperativeRows[1].rows[0].id;

    const userRows = await Promise.all([
      pool.query(
        `INSERT INTO users
          (cooperative_id, nom, prenoms, email, password_hash, role)
         VALUES ($1, 'RH', 'A', $2, 'integration-test', 'responsable_rh')
         RETURNING id`,
        [cooperativeA, `rh-a-${suffix}@test.invalid`],
      ),
      pool.query(
        `INSERT INTO users
          (cooperative_id, nom, prenoms, email, password_hash, role)
         VALUES ($1, 'RH', 'B', $2, 'integration-test', 'responsable_rh')
         RETURNING id`,
        [cooperativeB, `rh-b-${suffix}@test.invalid`],
      ),
    ]);
    userA = userRows[0].rows[0].id;
    userB = userRows[1].rows[0].id;

    const personnelRows = await Promise.all([
      pool.query(
        `INSERT INTO personnel
          (cooperative_id, nom, prenoms, poste, date_embauche, salaire_base_fcfa)
         VALUES ($1, 'Salarié', 'A', 'Assistant', '2025-01-01', 100000)
         RETURNING id`,
        [cooperativeA],
      ),
      pool.query(
        `INSERT INTO personnel
          (cooperative_id, nom, prenoms, poste, date_embauche, salaire_base_fcfa)
         VALUES ($1, 'Salarié', 'B', 'Assistant', '2025-01-01', 100000)
         RETURNING id`,
        [cooperativeB],
      ),
    ]);
    personnelA = personnelRows[0].rows[0].id;
    personnelB = personnelRows[1].rows[0].id;

    const app = express();
    app.use(express.json());
    app.use(ressourcesHumainesRouter);
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Serveur de test indisponible");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await pool.query(`DELETE FROM rh_historique WHERE cooperative_id IN ($1, $2)`, [cooperativeA, cooperativeB]);
    if (createdDocumentIds.length > 0) {
      await pool.query(`DELETE FROM rh_documents WHERE id = ANY($1::int[])`, [createdDocumentIds]);
    }
    if (createdLeaveIds.length > 0) {
      await pool.query(`DELETE FROM rh_conges WHERE id = ANY($1::int[])`, [createdLeaveIds]);
    }
    await pool.query(`DELETE FROM personnel WHERE id IN ($1, $2)`, [personnelA, personnelB]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
    await pool.query(`DELETE FROM cooperatives WHERE id IN ($1, $2)`, [cooperativeA, cooperativeB]);
  });

  function token(userId: number, cooperativeId: number): string {
    const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
    if (!secret) throw new Error("JWT_SECRET et SESSION_SECRET non configurés");
    return jwt.sign({ id: userId, role: "responsable_rh", cooperativeId }, secret);
  }

  async function request(
    cooperativeId: number,
    userId: number,
    leaveId: number,
    body: Record<string, unknown>,
  ): Promise<globalThis.Response> {
    return fetch(`${baseUrl}/rh/conges/${leaveId}/decision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token(userId, cooperativeId)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  async function insertLeave(
    cooperativeId: number,
    personnelId: number,
    dateDebut: string,
    dateFin: string,
    statut = "demande",
  ): Promise<number> {
    const result = await pool.query(
      `INSERT INTO rh_conges
        (cooperative_id, personnel_id, date_debut, date_fin, jours, statut)
       VALUES ($1, $2, $3, $4, ($4::date - $3::date) + 1, $5)
       RETURNING id`,
      [cooperativeId, personnelId, dateDebut, dateFin, statut],
    );
    const id = result.rows[0].id;
    createdLeaveIds.push(id);
    return id;
  }

  async function insertDocument(
    cooperativeId: number,
    personnelId: number,
    filePath: string,
    fileName: string,
  ): Promise<number> {
    const result = await pool.query(
      `INSERT INTO rh_documents
        (cooperative_id, personnel_id, type, titre, fichier_path, fichier_nom, fichier_mime_type, fichier_taille)
       VALUES ($1, $2, 'attestation', $3, $4, $5, 'application/pdf', 128)
       RETURNING id`,
      [cooperativeId, personnelId, `Justificatif ${fileName}`, filePath, fileName],
    );
    const id = result.rows[0].id;
    createdDocumentIds.push(id);
    return id;
  }

  it("rejette les dates calendaires invalides et couvre demande → refusé", async () => {
    const invalid = await fetch(`${baseUrl}/rh/conges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token(userA, cooperativeA)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personnelId: personnelA,
        dateDebut: "2026-02-30",
        dateFin: "2026-03-02",
        type: "annuel",
      }),
    });
    expect(invalid.status).toBe(400);

    const created = await fetch(`${baseUrl}/rh/conges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token(userA, cooperativeA)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personnelId: personnelA,
        dateDebut: "2026-03-01",
        dateFin: "2026-03-03",
        type: "annuel",
      }),
    });
    expect(created.status).toBe(201);
    const leave = await created.json() as { id: number; statut: string; jours: number };
    createdLeaveIds.push(leave.id);
    expect(leave).toMatchObject({ statut: "demande", jours: 3 });

    const refused = await request(cooperativeA, userA, leave.id, {
      decision: "refuse",
      commentaire: "Période indisponible",
    });
    expect(refused.status).toBe(200);
    expect(await refused.json()).toMatchObject({ id: leave.id, statut: "refuse" });

    const alreadyProcessed = await request(cooperativeA, userA, leave.id, { decision: "approuve" });
    expect(alreadyProcessed.status).toBe(409);
    expect(await alreadyProcessed.json()).toMatchObject({ erreur: "Cette demande a déjà été traitée" });
  });

  it("isole le solde par coopérative et refuse une approbation hors plafond", async () => {
    await insertLeave(cooperativeB, personnelB, "2026-01-01", "2026-01-26", "approuve");
    const pendingB = await insertLeave(cooperativeB, personnelB, "2026-02-01", "2026-02-07");
    const pendingA = await insertLeave(cooperativeA, personnelA, "2026-02-01", "2026-02-07");

    const crossTenant = await request(cooperativeA, userA, pendingB, { decision: "approuve" });
    expect(crossTenant.status).toBe(404);

    const [responseB, responseA] = await Promise.all([
      request(cooperativeB, userB, pendingB, { decision: "approuve" }),
      request(cooperativeA, userA, pendingA, { decision: "approuve" }),
    ]);
    expect(responseB.status).toBe(409);
    expect(await responseB.json()).toMatchObject({ erreur: "Solde de congés annuel insuffisant" });
    expect(responseA.status).toBe(200);
    expect(await responseA.json()).toMatchObject({ id: pendingA, statut: "approuve" });
  });

  it("ne valide qu'une seule demande concurrente quand le solde restant est de 26 jours", async () => {
    const first = await insertLeave(cooperativeA, personnelA, "2027-04-01", "2027-04-14");
    const second = await insertLeave(cooperativeA, personnelA, "2027-05-01", "2027-05-14");

    const [responseOne, responseTwo] = await Promise.all([
      request(cooperativeA, userA, first, { decision: "approuve" }),
      request(cooperativeA, userA, second, { decision: "approuve" }),
    ]);
    expect([responseOne.status, responseTwo.status].sort()).toEqual([200, 409]);

    const approved = await pool.query(
      `SELECT COALESCE(SUM(jours), 0) AS jours
       FROM rh_conges
       WHERE cooperative_id = $1 AND personnel_id = $2
         AND statut = 'approuve' AND type = 'annuel'
         AND date_debut >= '2027-01-01' AND date_debut < '2028-01-01'`,
      [cooperativeA, personnelA],
    );
    expect(Number(approved.rows[0].jours)).toBe(14);
  });

  it("journalise les téléchargements de justificatifs et isole l'historique par coopérative et dossier", async () => {
    const documentA = await insertDocument(
      cooperativeA,
      personnelA,
      `/objects/rh-documents/${cooperativeA}/${personnelA}/document-a.pdf`,
      "contrat-a.pdf",
    );
    const documentB = await insertDocument(
      cooperativeB,
      personnelB,
      `/objects/rh-documents/${cooperativeB}/${personnelB}/document-b.pdf`,
      "contrat-b.pdf",
    );

    const getObjectEntityFile = vi
      .spyOn(ObjectStorageService.prototype, "getObjectEntityFile")
      .mockImplementation(async () => Object.create(null));
    const downloadObject = vi
      .spyOn(ObjectStorageService.prototype, "downloadObject")
      .mockImplementation(async () => new Response("contenu du justificatif", {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }));

    try {
      const authorizedDownload = await fetch(`${baseUrl}/rh/documents/${documentA}/fichier`, {
        headers: { Authorization: `Bearer ${token(userA, cooperativeA)}` },
      });
      expect(authorizedDownload.status).toBe(200);
      expect(await authorizedDownload.text()).toBe("contenu du justificatif");

      const crossTenantDownload = await fetch(`${baseUrl}/rh/documents/${documentA}/fichier`, {
        headers: { Authorization: `Bearer ${token(userB, cooperativeB)}` },
      });
      expect(crossTenantDownload.status).toBe(404);

      const auditRows = await pool.query(
        `SELECT cooperative_id, personnel_id, entite, entite_id, action, details, fait_par, created_at
         FROM rh_historique
         WHERE entite = 'document' AND entite_id = $1 AND action = 'consultation_fichier'
         ORDER BY id`,
        [documentA],
      );
      expect(auditRows.rows).toHaveLength(1);
      expect(auditRows.rows[0]).toMatchObject({
        cooperative_id: cooperativeA,
        personnel_id: personnelA,
        entite: "document",
        entite_id: documentA,
        action: "consultation_fichier",
        fait_par: userA,
        details: {
          nom: "contrat-a.pdf",
          typeMime: "application/pdf",
          taille: 128,
        },
      });
      expect(auditRows.rows[0].created_at).toBeInstanceOf(Date);

      const dossierA = await fetch(`${baseUrl}/rh/personnel/${personnelA}`, {
        headers: { Authorization: `Bearer ${token(userA, cooperativeA)}` },
      });
      expect(dossierA.status).toBe(200);
      const dossierAJson = await dossierA.json() as {
        historique: Array<{
          cooperativeId: number;
          personnelId: number;
          action: string;
          entiteId: number | null;
          faitPar: number | null;
          createdAt: string;
        }>;
      };
      expect(dossierAJson.historique).toEqual(expect.arrayContaining([
        expect.objectContaining({
          cooperativeId: cooperativeA,
          personnelId: personnelA,
          entiteId: documentA,
          action: "consultation_fichier",
          faitPar: userA,
          createdAt: expect.any(String),
        }),
      ]));
      expect(dossierAJson.historique.every((entry) =>
        entry.cooperativeId === cooperativeA && entry.personnelId === personnelA,
      )).toBe(true);

      const dossierAFromB = await fetch(`${baseUrl}/rh/personnel/${personnelA}`, {
        headers: { Authorization: `Bearer ${token(userB, cooperativeB)}` },
      });
      expect(dossierAFromB.status).toBe(404);

      const authorizedDownloadB = await fetch(`${baseUrl}/rh/documents/${documentB}/fichier`, {
        headers: { Authorization: `Bearer ${token(userB, cooperativeB)}` },
      });
      expect(authorizedDownloadB.status).toBe(200);

      const dossierB = await fetch(`${baseUrl}/rh/personnel/${personnelB}`, {
        headers: { Authorization: `Bearer ${token(userB, cooperativeB)}` },
      });
      expect(dossierB.status).toBe(200);
      const dossierBJson = await dossierB.json() as {
        historique: Array<{ cooperativeId: number; personnelId: number; entiteId: number | null }>;
      };
      expect(dossierBJson.historique).toEqual(expect.arrayContaining([
        expect.objectContaining({
          cooperativeId: cooperativeB,
          personnelId: personnelB,
          entiteId: documentB,
        }),
      ]));
      expect(dossierBJson.historique.every((entry) =>
        entry.cooperativeId === cooperativeB && entry.personnelId === personnelB,
      )).toBe(true);
    } finally {
      getObjectEntityFile.mockRestore();
      downloadObject.mockRestore();
    }
  });

  it("distingue une absence de fichier d'une panne répétée du stockage sans journaliser de consultation", async () => {
    const missingDocument = await insertDocument(
      cooperativeA,
      personnelA,
      `/objects/rh-documents/${cooperativeA}/${personnelA}/document-missing.pdf`,
      "contrat-missing.pdf",
    );
    const unavailableDocument = await insertDocument(
      cooperativeA,
      personnelA,
      `/objects/rh-documents/${cooperativeA}/${personnelA}/document-unavailable.pdf`,
      "contrat-unavailable.pdf",
    );

    const getObjectEntityFile = vi
      .spyOn(ObjectStorageService.prototype, "getObjectEntityFile")
      .mockImplementation(async (objectPath) => {
        if (objectPath.endsWith("document-missing.pdf")) {
          throw new ObjectNotFoundError();
        }
        return Object.create(null);
      });
    const downloadObject = vi
      .spyOn(ObjectStorageService.prototype, "downloadObject")
      .mockRejectedValue(new Error("Stockage RH indisponible"));
    const loggerError = vi.spyOn(logger, "error");
    const previousThreshold = process.env["RH_STORAGE_FAILURE_ALERT_THRESHOLD"];
    const previousWindow = process.env["RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS"];
    process.env["RH_STORAGE_FAILURE_ALERT_THRESHOLD"] = "2";
    process.env["RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS"] = "60";

    try {
      const missingDownload = await fetch(`${baseUrl}/rh/documents/${missingDocument}/fichier`, {
        headers: { Authorization: `Bearer ${token(userA, cooperativeA)}` },
      });
      expect(missingDownload.status).toBe(404);
      expect(await missingDownload.json()).toMatchObject({ erreur: "Fichier RH introuvable" });

      const unavailableDownload = await fetch(`${baseUrl}/rh/documents/${unavailableDocument}/fichier`, {
        headers: { Authorization: `Bearer ${token(userA, cooperativeA)}` },
      });
      expect(unavailableDownload.status).toBe(500);
      expect(await unavailableDownload.json()).toMatchObject({ erreur: "Erreur interne du serveur" });

      const repeatedUnavailableDownload = await fetch(`${baseUrl}/rh/documents/${unavailableDocument}/fichier`, {
        headers: { Authorization: `Bearer ${token(userA, cooperativeA)}` },
      });
      expect(repeatedUnavailableDownload.status).toBe(500);
      expect(await repeatedUnavailableDownload.json()).toMatchObject({ erreur: "Erreur interne du serveur" });

      const alertCall = loggerError.mock.calls.find(([, message]) =>
        message === "Alerte opérationnelle : stockage RH indisponible",
      );
      expect(alertCall).toBeDefined();
      expect(alertCall?.[0]).toMatchObject({
        event: "rh_storage_read_failure",
        alert: "rh_storage_unavailable",
        cooperativeId: cooperativeA,
        failureCount: 2,
        failureThreshold: 2,
        classification: "storage_unavailable",
      });
      expect(JSON.stringify(alertCall?.[0])).not.toContain("document-unavailable.pdf");
      expect(JSON.stringify(alertCall?.[0])).not.toContain("Stockage RH indisponible");

      const auditRows = await pool.query(
        `SELECT id
         FROM rh_historique
         WHERE cooperative_id = $1
           AND entite = 'document'
           AND entite_id = ANY($2::int[])
           AND action = 'consultation_fichier'`,
        [cooperativeA, [missingDocument, unavailableDocument]],
      );
      expect(auditRows.rows).toHaveLength(0);

      const dossier = await fetch(`${baseUrl}/rh/personnel/${personnelA}`, {
        headers: { Authorization: `Bearer ${token(userA, cooperativeA)}` },
      });
      expect(dossier.status).toBe(200);
      const dossierJson = await dossier.json() as {
        historique: Array<{ entiteId: number | null; action: string }>;
      };
      const consultationIds = dossierJson.historique
        .filter((entry) => entry.action === "consultation_fichier")
        .map((entry) => entry.entiteId);
      expect(consultationIds).not.toContain(missingDocument);
      expect(consultationIds).not.toContain(unavailableDocument);
    } finally {
      getObjectEntityFile.mockRestore();
      downloadObject.mockRestore();
      loggerError.mockRestore();
      await resetRhStorageReadFailureCounters();
      if (previousThreshold === undefined) {
        delete process.env["RH_STORAGE_FAILURE_ALERT_THRESHOLD"];
      } else {
        process.env["RH_STORAGE_FAILURE_ALERT_THRESHOLD"] = previousThreshold;
      }
      if (previousWindow === undefined) {
        delete process.env["RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS"];
      } else {
        process.env["RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS"] = previousWindow;
      }
    }
  });

  it("partage le compteur entre appels concurrents, le conserve en base et le réinitialise après succès", async () => {
    const previousThreshold = process.env["RH_STORAGE_FAILURE_ALERT_THRESHOLD"];
    const previousWindow = process.env["RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS"];
    process.env["RH_STORAGE_FAILURE_ALERT_THRESHOLD"] = "3";
    process.env["RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS"] = "60";
    const startedAt = Date.now();

    try {
      await resetRhStorageReadFailureState(cooperativeA);
      const reports = await Promise.all(
        Array.from({ length: 8 }, (_, index) =>
          recordRhStorageReadFailure(cooperativeA, startedAt + index),
        ),
      );

      expect(reports.map((report) => report.count).sort((a, b) => a - b)).toEqual(
        [1, 2, 3, 4, 5, 6, 7, 8],
      );
      expect(reports.filter((report) => report.shouldAlert)).toHaveLength(1);

      const persisted = await pool.query(
        `SELECT failure_count, alert_sent
         FROM rh_storage_failure_states
         WHERE cooperative_id = $1`,
        [cooperativeA],
      );
      expect(persisted.rows[0]).toMatchObject({ failure_count: 8, alert_sent: true });

      await resetRhStorageReadFailureState(cooperativeA);
      const afterSuccessfulRead = await recordRhStorageReadFailure(cooperativeA, startedAt + 1_000);
      expect(afterSuccessfulRead).toMatchObject({ count: 1, shouldAlert: false });
    } finally {
      await resetRhStorageReadFailureState(cooperativeA);
      if (previousThreshold === undefined) {
        delete process.env["RH_STORAGE_FAILURE_ALERT_THRESHOLD"];
      } else {
        process.env["RH_STORAGE_FAILURE_ALERT_THRESHOLD"] = previousThreshold;
      }
      if (previousWindow === undefined) {
        delete process.env["RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS"];
      } else {
        process.env["RH_STORAGE_FAILURE_ALERT_WINDOW_SECONDS"] = previousWindow;
      }
    }
  });
});

describe.skipIf(!enabled)("auteur des sorties de salaires sur PostgreSQL", () => {
  let server: Server;
  let baseUrl: string;
  let cooperativeId: number;
  let userId: number;
  let personnelId: number;
  let caisseId: number;
  let sessionId: number;
  let compteBancaireId: number;
  let bulletinCaisseId: number;
  let bulletinBanqueId: number;
  const suffix = `${process.pid}-${Date.now()}`;

  beforeAll(async () => {
    const cooperative = await pool.query(
      `INSERT INTO cooperatives (nom, ville, region)
       VALUES ($1, 'Test', 'Test')
       RETURNING id`,
      [`Auteurs salaires ${suffix}`],
    );
    cooperativeId = cooperative.rows[0].id;

    const user = await pool.query(
      `INSERT INTO users
         (cooperative_id, nom, prenoms, email, password_hash, role)
       VALUES ($1, 'Comptable', 'Salaires', $2, 'integration-test', 'responsable_rh')
       RETURNING id`,
      [cooperativeId, `salary-actor-${suffix}@test.invalid`],
    );
    userId = user.rows[0].id;

    const personnel = await pool.query(
      `INSERT INTO personnel
         (cooperative_id, nom, prenoms, poste, date_embauche, salaire_base_fcfa)
       VALUES ($1, 'Salarié', 'Test', 'Assistant', '2025-01-01', 100000)
       RETURNING id`,
      [cooperativeId],
    );
    personnelId = personnel.rows[0].id;

    const caisse = await pool.query(
      `INSERT INTO caisses
         (cooperative_id, nom, type_caisse, solde_actuel_fcfa,
          fond_caisse_minimum_fcfa, actif)
       VALUES ($1, $2, 'centrale', 10000, 0, true)
       RETURNING id`,
      [cooperativeId, `Caisse salaires ${suffix}`],
    );
    caisseId = caisse.rows[0].id;

    const session = await pool.query(
      `INSERT INTO sessions_caisse
         (caisse_id, cooperative_id, date_session, solde_ouverture_fcfa, statut)
       VALUES ($1, $2, CURRENT_DATE, 10000, 'ouverte')
       RETURNING id`,
      [caisseId, cooperativeId],
    );
    sessionId = session.rows[0].id;

    const banque = await pool.query(
      `INSERT INTO comptes_bancaires
         (cooperative_id, nom, banque, solde_actuel_fcfa,
          solde_mini_alerte_fcfa, actif)
       VALUES ($1, $2, 'Banque test', 10000, 0, true)
       RETURNING id`,
      [cooperativeId, `Banque salaires ${suffix}`],
    );
    compteBancaireId = banque.rows[0].id;

    const bulletins = await pool.query(
      `INSERT INTO bulletins_paie
         (personnel_id, cooperative_id, mois, annee, periode,
          salaire_base_fcfa, salaire_brut_fcfa, salaire_net_fcfa,
          cout_total_employeur_fcfa, statut)
       VALUES
         ($1, $2, 1, 2026, 'janvier 2026', 1000, 1000, 1000, 1000, 'valide'),
         ($1, $2, 2, 2026, 'février 2026', 2000, 2000, 2000, 2000, 'valide')
       RETURNING id, mois`,
      [personnelId, cooperativeId],
    );
    bulletinCaisseId = bulletins.rows.find((row: { mois: number }) => row.mois === 1).id;
    bulletinBanqueId = bulletins.rows.find((row: { mois: number }) => row.mois === 2).id;

    await pool.query(
      `INSERT INTO mouvements_caisse
         (caisse_id, session_id, cooperative_id, type, motif,
          montant_fcfa, libelle, solde_apres_fcfa, enregistre_par)
       VALUES ($1, $2, $3, 'sortie', 'paiement_salaire',
               50, 'Paiement historique', 9950, NULL)`,
      [caisseId, sessionId, cooperativeId],
    );
    await pool.query(
      `INSERT INTO mouvements_banque
         (compte_id, cooperative_id, type, motif, montant_fcfa,
          libelle, date_operation, solde_apres_fcfa, enregistre_par)
       VALUES ($1, $2, 'debit', 'paiement_salaire',
               50, 'Paiement historique', CURRENT_DATE, 9950, NULL)`,
      [compteBancaireId, cooperativeId],
    );

    const app = express();
    app.use(express.json());
    app.use(salairesRouter);
    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Serveur de test indisponible");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await pool.query(`DELETE FROM ecritures_en_attente WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM ecritures_comptables WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM mouvements_caisse WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM mouvements_banque WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM sessions_caisse WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM caisses WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM comptes_bancaires WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM bulletins_paie WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM personnel WHERE cooperative_id = $1`, [cooperativeId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await pool.query(`DELETE FROM cooperatives WHERE id = $1`, [cooperativeId]);
  });

  function token(): string {
    const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
    if (!secret) throw new Error("JWT_SECRET et SESSION_SECRET non configurés");
    return jwt.sign({ id: userId, role: "responsable_rh", cooperativeId }, secret);
  }

  async function pay(bulletinId: number, compteSourceType: "caisse" | "banque", compteSourceId: number) {
    return fetch(`${baseUrl}/salaires/bulletins/${bulletinId}/payer`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        compteSourceType,
        compteSourceId,
        referencePaiement: `SAL-${compteSourceType}-${suffix}`,
      }),
    });
  }

  it("conserve l'auteur authentifié pour les paiements caisse et banque, sans réécrire les historiques NULL", async () => {
    const caisseResponse = await pay(bulletinCaisseId, "caisse", caisseId);
    expect(caisseResponse.status).toBe(200);

    const banqueResponse = await pay(bulletinBanqueId, "banque", compteBancaireId);
    expect(banqueResponse.status).toBe(200);

    const caisseMovements = await pool.query(
      `SELECT enregistre_par
       FROM mouvements_caisse
       WHERE cooperative_id = $1 AND motif = 'paiement_salaire'
       ORDER BY id`,
      [cooperativeId],
    );
    expect(caisseMovements.rows).toEqual([
      { enregistre_par: null },
      { enregistre_par: userId },
    ]);

    const banqueMovements = await pool.query(
      `SELECT enregistre_par
       FROM mouvements_banque
       WHERE cooperative_id = $1 AND motif = 'paiement_salaire'
       ORDER BY id`,
      [cooperativeId],
    );
    expect(banqueMovements.rows).toEqual([
      { enregistre_par: null },
      { enregistre_par: userId },
    ]);
  });
});

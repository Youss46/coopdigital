import express from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@workspace/db";
import ressourcesHumainesRouter from "../routes/ressourcesHumaines.js";

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
    if (createdLeaveIds.length > 0) {
      await pool.query(`DELETE FROM rh_historique WHERE entite = 'conge' AND entite_id = ANY($1::int[])`, [createdLeaveIds]);
      await pool.query(`DELETE FROM rh_conges WHERE id = ANY($1::int[])`, [createdLeaveIds]);
    }
    await pool.query(`DELETE FROM personnel WHERE id IN ($1, $2)`, [personnelA, personnelB]);
    await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [userA, userB]);
    await pool.query(`DELETE FROM cooperatives WHERE id IN ($1, $2)`, [cooperativeA, cooperativeB]);
  });

  function token(userId: number, cooperativeId: number): string {
    return jwt.sign({ id: userId, role: "responsable_rh", cooperativeId }, process.env.JWT_SECRET!);
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
});
import express, { type Request, type Response as ExpressResponse } from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { okHandler } = vi.hoisted(() => ({
  okHandler: (_req: Request, res: ExpressResponse) => {
    res.status(200).json({ ok: true });
  },
}));

vi.mock("../controllers/entrepotDelegueController.js", () => ({
  getMonEntrepotHandler: okHandler,
  getMesMouvementsHandler: okHandler,
  getMesTransfertsHandler: okHandler,
  creerTransfertHandler: okHandler,
  confirmerDepartHandler: okHandler,
  getStatsHandler: okHandler,
  listEntrepotsHandler: okHandler,
  creerEntrepotHandler: okHandler,
  modifierEntrepotHandler: okHandler,
  getMouvementsEntrepotHandler: okHandler,
  ajusterStockHandler: okHandler,
  listTransfertsHandler: okHandler,
  confirmerArriveeHandler: okHandler,
  signalerLitigeHandler: okHandler,
  listDeleguesEntrepotsHandler: okHandler,
  creerTransfertAdminHandler: okHandler,
  getRapportTransfertPdfHandler: okHandler,
  signalerArriveePhysiqueHandler: okHandler,
  listTransfertsEnAttentePeseeHandler: okHandler,
}));

vi.mock("../controllers/m15Controller.js", () => ({
  loginM15Handler: okHandler,
  getDashboardHandler: okHandler,
  getCooperativesHandler: okHandler,
  createCooperativeHandler: okHandler,
  getCooperativeHandler: okHandler,
  updateCooperativeHandler: okHandler,
  getPlansHandler: okHandler,
  updatePlanHandler: okHandler,
  genererLicenceHandler: okHandler,
  activerLicenceHandler: okHandler,
  renouvelerLicenceHandler: okHandler,
  toggleRenouvellementAutoHandler: okHandler,
  suspendreCooperativeHandler: okHandler,
  reactiverCooperativeHandler: okHandler,
  supprimerCooperativeHandler: okHandler,
  getHistoriqueLicenceHandler: okHandler,
  resetPasswordPcaHandler: okHandler,
  updatePcaHandler: okHandler,
}));

vi.mock("../controllers/systemController.js", () => ({
  getSystemBannerHandler: okHandler,
  updateSystemBannerHandler: okHandler,
}));

vi.mock("../controllers/supportController.js", () => ({
  getFaqHandler: okHandler,
  creerTicketHandler: okHandler,
  mesTicketsHandler: okHandler,
  detailTicketHandler: okHandler,
  ajouterMessageHandler: okHandler,
  fermerTicketHandler: okHandler,
  tousLesTicketsM15Handler: okHandler,
  detailTicketM15Handler: okHandler,
  repondreM15Handler: okHandler,
  prendreEnChargeHandler: okHandler,
  marquerResoluHandler: okHandler,
}));

describe("périmètre des routeurs montés avant le garde global", () => {
  let server: Server;
  let baseUrl: string;
  let app: express.Express;

  beforeAll(async () => {
    process.env.JWT_SECRET = "upstream-route-access-test-secret";
    delete process.env.M15_JWT_SECRET;
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    process.env.NODE_ENV = "test";

    ({ default: app } = await import("../app.js"));

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Serveur de test indisponible");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  function cooperativeToken(role: string): string {
    return jwt.sign({ id: 1, role, cooperativeId: 1 }, process.env.JWT_SECRET!);
  }

  function terrainToken(role: "delegue" | "agent_terrain" | "peseur" | "chauffeur"): string {
    return jwt.sign({
      id: 1,
      role,
      cooperativeId: 1,
      section: null,
      zoneType: null,
      zoneNom: null,
    }, process.env.JWT_SECRET!);
  }

  function m15Token(role = "admin"): string {
    return jwt.sign({
      id: 1,
      email: "admin@m15.test",
      role,
      type: "m15",
    }, process.env.JWT_SECRET!);
  }

  async function request(
    path: string,
    token: string,
    method = "GET",
  ): Promise<globalThis.Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: method === "GET" ? undefined : "{}",
    });
  }

  it.each(["comptable", "caissier", "magasinier", "responsable_tracabilite", "delegue"])(
    "refuse le rôle coopératif %s sur les entrepôts délégués",
    async (role) => {
      expect((await request("/api/entrepots", cooperativeToken(role))).status).toBe(403);
      expect((await request("/api/transferts", cooperativeToken(role))).status).toBe(403);
    },
  );

  it.each(["pca", "directeur", "auditeur"])(
    "laisse le rôle coopératif %s consulter les entrepôts et transferts",
    async (role) => {
      expect((await request("/api/entrepots", cooperativeToken(role))).status).toBe(200);
      expect((await request("/api/transferts", cooperativeToken(role))).status).toBe(200);
    },
  );

  it.each(["pca", "directeur"])(
    "laisse le rôle coopératif %s effectuer les opérations administratives",
    async (role) => {
      const token = cooperativeToken(role);
      expect((await request("/api/entrepots", token, "POST")).status).toBe(200);
      expect((await request("/api/entrepots/1", token, "PUT")).status).toBe(200);
      expect((await request("/api/entrepots/1/ajustement", token, "POST")).status).toBe(200);
      expect((await request("/api/entrepots/1/transfert", token, "POST")).status).toBe(200);
      expect((await request("/api/transferts/1/arrivee", token, "PUT")).status).toBe(200);
    },
  );

  it("refuse les opérations d'écriture à l'auditeur", async () => {
    const token = cooperativeToken("auditeur");
    expect((await request("/api/entrepots", token, "POST")).status).toBe(403);
    expect((await request("/api/transferts/1/arrivee", token, "PUT")).status).toBe(403);
  });

  it("conserve l'accès du token terrain à son espace entrepôt", async () => {
    expect((await request("/api/terrain/entrepot", terrainToken("delegue"))).status).toBe(200);
    expect((await request("/api/terrain/entrepot", cooperativeToken("pca"))).status).toBe(403);
  });

  it.each(["pca", "comptable", "delegue"])(
    "refuse le rôle coopératif %s sur M15",
    async (role) => {
      expect((await request("/api/m15/dashboard", cooperativeToken(role))).status).toBe(403);
    },
  );

  it("laisse un token M15 accéder au dashboard M15", async () => {
    expect((await request("/api/m15/dashboard", m15Token())).status).toBe(200);
  });
});
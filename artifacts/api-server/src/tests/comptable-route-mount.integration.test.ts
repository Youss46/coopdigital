import express, { type Request, type Response as ExpressResponse } from "express";
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { okHandler, featureConfigs } = vi.hoisted(() => ({
  okHandler: (_req: Request, res: ExpressResponse) => {
    res.status(200).json({ ok: true });
  },
  featureConfigs: new Map<number, Array<{ key: string; mode: string }>>(),
}));

vi.mock("../services/cooperativeFeaturesService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/cooperativeFeaturesService.js")>();
  return {
    ...actual,
    getCooperativeFeatureConfig: vi.fn(async (cooperativeId: number) => featureConfigs.get(cooperativeId) ?? []),
  };
});

vi.mock("../controllers/peseeController.js", () => ({
  handleGetBalancesAlertes: okHandler,
  handleGetBalances: okHandler,
  handleCreateBalance: okHandler,
  handleUpdateBalance: okHandler,
  handleCreateVerification: okHandler,
  handleValiderDoublePesee: okHandler,
  handleGetLitiges: okHandler,
  handleCreateLitige: okHandler,
  handleResoudreLitige: okHandler,
  handleGetStatistiques: okHandler,
  handleGetRapportAgent: okHandler,
  handleGetConfig: okHandler,
  handleUpdateConfig: okHandler,
  handleBatchCreateSession: okHandler,
  handleCreateSession: okHandler,
  handleGetSessions: okHandler,
  handleGetSession: okHandler,
  handleAddLigne: okHandler,
  handleDeleteLigne: okHandler,
  handleTerminerSession: okHandler,
  handleAnnulerSession: okHandler,
  handleConvertirSessionEnLivraison: okHandler,
  handleExpirerSessionsStales: okHandler,
  handleGetBordereauSession: okHandler,
}));

vi.mock("../controllers/delegueController.js", () => ({
  getCaisseHandler: okHandler,
  getPaiementsDifferesHandler: okHandler,
  regulariserPaiementHandler: okHandler,
  listDeleguesHandler: okHandler,
  getDetailCaisseHandler: okHandler,
  approvisionnerHandler: okHandler,
  getPaiementsDifferesAdminHandler: okHandler,
  alimenterCaisseHandler: okHandler,
  cloturerJourneeHandler: okHandler,
  getAlertesCaissesDeleguesHandler: okHandler,
}));

vi.mock("../controllers/comptabiliteController.js", () => ({
  getGrandLivre: okHandler,
  getBalance: okHandler,
  getJournalComptable: okHandler,
  createEcritureManuelle: okHandler,
  exportJournalCsv: okHandler,
  getMargeCollecte: okHandler,
  getTresorerie: okHandler,
  getConfigComptable: okHandler,
  updateConfigComptable: okHandler,
  listEcrituresEnAttente: okHandler,
  countEcrituresEnAttente: okHandler,
  validerEcritureEnAttente: okHandler,
  rejeterEcritureEnAttente: okHandler,
  validerToutEcrituresEnAttente: okHandler,
  listRegularisations: okHandler,
  suggestRegularisations: okHandler,
  createRegularisation: okHandler,
  deleteRegularisation: okHandler,
  apercuCloture: okHandler,
  cloturerExercice: okHandler,
  getBalanceAuxiliaire: okHandler,
  listComptesTiers: okHandler,
  updateComptesTiers: okHandler,
  exportBalanceAuxiliaireSage: okHandler,
  getGrandLivreTiers: okHandler,
  getApercuAffectationResultat: okHandler,
  apercuRistournes: okHandler,
  declencherRistournes: okHandler,
  getHistoriqueAffectations: okHandler,
  getStatutsExercices: okHandler,
  affecterResultat: okHandler,
}));

vi.mock("../middlewares/tenantGuard.js", () => ({
  tenantGuard: (_req: Request, _res: ExpressResponse, next: () => void) => next(),
}));

async function closeTestServer(server: Server | undefined): Promise<void> {
  if (!server || !server.listening) return;

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function listenForTest(app: express.Express, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1");
    server.once("listening", () => resolve(server));
    server.once("error", reject);
  });
}

describe("nettoyage après un échec de démarrage du serveur", () => {
  let server: Server | undefined;
  let occupiedServer: Server | undefined;
  let listenError: unknown;

  beforeAll(async () => {
    occupiedServer = await listenForTest(express(), 0);
    const address = occupiedServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Serveur de test indisponible");
    }

    try {
      server = await listenForTest(express(), address.port);
    } catch (error) {
      listenError = error;
    } finally {
      await closeTestServer(occupiedServer);
      occupiedServer = undefined;
    }
  });

  afterAll(async () => {
    await closeTestServer(server);
    await closeTestServer(occupiedServer);
  });

  it("ne masque pas l'erreur d'écoute avec une erreur de nettoyage", () => {
    expect(listenError).toMatchObject({ code: "EADDRINUSE" });
    expect(server).toBeUndefined();
  });
});

describe("montage des routes et périmètre du comptable", () => {
  let server: Server | undefined;
  let baseUrl: string;
  let app: express.Express;

  beforeAll(async () => {
    process.env.JWT_SECRET = "comptable-route-mount-test-secret";
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
    process.env.NODE_ENV = "test";

    ({ default: app } = await import("../app.js"));

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    const startedServer = server;
    if (!startedServer) {
      throw new Error("Serveur de test indisponible");
    }

    const address = startedServer.address();
    if (!address || typeof address === "string") {
      throw new Error("Serveur de test indisponible");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await closeTestServer(server);
  });

  beforeEach(() => {
    featureConfigs.clear();
  });

  function tokenFor(role: string, cooperativeId = 1): string {
    return jwt.sign({ id: 1, role, cooperativeId }, process.env.JWT_SECRET!);
  }

  async function request(
    path: string,
    role: string,
    cooperativeId = 1,
    method = "GET",
  ): Promise<globalThis.Response> {
    return fetch(`${baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${tokenFor(role, cooperativeId)}` },
    });
  }

  it.each([
    ["/api/pesee/balances", "la pesée"],
    ["/api/delegues", "les délégués"],
  ])("refuse le comptable sur %s malgré le montage avant le garde global (%s)", async (path) => {
    expect((await request(path, "comptable")).status).toBe(403);
  });

  it.each([
    ["/api/pesee/balances", "pca"],
    ["/api/pesee/balances", "directeur"],
    ["/api/delegues", "pca"],
    ["/api/delegues", "directeur"],
  ])("laisse %s accéder à %s", async (path, role) => {
    expect((await request(path, role)).status).toBe(200);
  });

  it("conserve l'accès du comptable aux routes comptables", async () => {
    expect((await request("/api/comptabilite/grand-livre", "comptable")).status).toBe(200);
  });

  it("isole une fonctionnalité désactivée entre deux coopératives", async () => {
    featureConfigs.set(1, [{ key: "pesee", mode: "disabled" }]);

    const disabled = await request("/api/pesee/balances", "pca", 1);
    const active = await request("/api/pesee/balances", "pca", 2);

    expect(disabled.status).toBe(403);
    expect(await disabled.json()).toMatchObject({
      code: "FEATURE_DISABLED",
      featureKey: "pesee",
      mode: "disabled",
    });
    expect(active.status).toBe(200);
  });

  it("autorise GET et HEAD mais refuse toutes les écritures en lecture seule", async () => {
    featureConfigs.set(1, [{ key: "pesee", mode: "lecture_seule" }]);

    expect((await request("/api/pesee/balances", "pca", 1, "GET")).status).toBe(200);
    expect((await request("/api/pesee/balances", "pca", 1, "HEAD")).status).toBe(200);

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const response = await request("/api/pesee/balances", "pca", 1, method);
      expect(response.status, method).toBe(403);
      expect(await response.json()).toMatchObject({
        code: "FEATURE_DISABLED",
        featureKey: "pesee",
        mode: "lecture_seule",
      });
    }
  });

  it("évalue le RBAC avant le module désactivé", async () => {
    featureConfigs.set(1, [{ key: "stocks", mode: "disabled" }]);

    const response = await request("/api/stocks/entrepots", "comptable");

    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("code", "FEATURE_DISABLED");
  });
});
import express, { type Request, type Response as ExpressResponse } from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { featureConfigs, licenceState } = vi.hoisted(() => ({
  featureConfigs: new Map<number, Array<{ key: string; mode: string }>>(),
  licenceState: { valide: true },
}));

vi.mock("../services/licenceService.js", () => ({
  verifierLicenceActive: vi.fn(async () => licenceState.valide
    ? { valide: true, statut: "active", joursRestants: null }
    : {
        valide: false,
        statut: "expiree",
        messageInvalide: "Licence expirée",
        joursRestants: null,
      }),
}));

vi.mock("../services/cooperativeFeaturesService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/cooperativeFeaturesService.js")>();
  return {
    ...actual,
    getCooperativeFeatureConfig: vi.fn(async (cooperativeId: number) => featureConfigs.get(cooperativeId) ?? []),
  };
});

const okHandler = (_req: Request, res: ExpressResponse) => res.status(200).json({ ok: true });

describe("ordre des protections de routes coopératives", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const [{ tenantGuard }, { featureGuard }, { denyComptableRestrictedModules }] =
      await Promise.all([
        import("../middlewares/tenantGuard.js"),
        import("../middlewares/featureGuard.js"),
        import("../middlewares/permissions.js"),
      ]);

    const app = express();
    app.use((req, _res, next) => {
      req.user = {
        id: 1,
        role: String(req.header("x-test-role") ?? "pca"),
        cooperativeId: Number(req.header("x-test-cooperative") ?? "1"),
      };
      next();
    });
    app.use(tenantGuard);
    app.use(denyComptableRestrictedModules);
    app.use(featureGuard);
    app.get("/api/membres", okHandler);
    app.get("/api/stocks", okHandler);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, "127.0.0.1", (error?: Error) => error ? reject(error) : resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Serveur de test indisponible");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  beforeEach(() => {
    featureConfigs.clear();
    licenceState.valide = true;
  });

  async function request(path: string, role = "pca") {
    return fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: "Bearer route-order-test-token",
        "x-test-role": role,
        "x-test-cooperative": "1",
      },
    });
  }

  it("évalue la licence avant une fonctionnalité désactivée", async () => {
    licenceState.valide = false;
    featureConfigs.set(1, [{ key: "membres", mode: "disabled" }]);

    const response = await request("/api/membres");

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ code: "LICENCE_INVALIDE" });
  });

  it("évalue le RBAC global avant une fonctionnalité désactivée", async () => {
    featureConfigs.set(1, [{ key: "stocks", mode: "disabled" }]);

    const response = await request("/api/stocks", "comptable");

    expect(response.status).toBe(403);
    expect(await response.json()).not.toMatchObject({ code: "FEATURE_DISABLED" });
  });
});
import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/licenceService.js", () => ({
  verifierLicenceActive: vi.fn(),
}));

vi.mock("../middlewares/auth.js", () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = {
      id: 1,
      cooperativeId: 1,
      role: String(req.header("x-test-role") ?? ""),
    } as typeof req.user;
    next();
  },
}));

const okHandler = (_req: express.Request, res: express.Response) => res.json({ ok: true });

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

vi.mock("../controllers/commissionController.js", () => ({
  listTauxHandler: okHandler,
  upsertTauxHandler: okHandler,
  deleteTauxHandler: okHandler,
  getCommissionsDelegueHandler: okHandler,
  payerCommissionsHandler: okHandler,
  getRecapCommissionsHandler: okHandler,
}));

vi.mock("../controllers/rapportsController.js", () => ({
  getAdminReleveCommissions: okHandler,
}));

vi.mock("../controllers/avancesDeleguesController.js", () => ({
  listAvancesDelegueHandler: okHandler,
  createAvanceDelegueHandler: okHandler,
  rembourserAvanceDelegueHandler: okHandler,
  getRemboursementsAvanceDelegueHandler: okHandler,
  getAvancesDelegueResumeHandler: okHandler,
  patchPlanAvanceDelegueHandler: okHandler,
  getAvancesDeleguesReporteesHandler: okHandler,
}));

vi.mock("../controllers/commissionMembreDelegueController.js", () => ({
  listTauxHandler: okHandler,
  upsertTauxHandler: okHandler,
  deleteTauxHandler: okHandler,
  getRecapHandler: okHandler,
  getCommissionsHandler: okHandler,
  payerHandler: (_req: express.Request, res: express.Response) => res.status(201).json({ ok: true }),
}));

describe("tenantGuard sur les routes administratives des délégués", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const [{ default: deleguesRouter }, { default: commissionsMembresDeleguesRouter }, { tenantGuard }, { authMiddleware }] = await Promise.all([
      import("../routes/delegues.js"),
      import("../routes/commissions_membres_delegues.js"),
      import("../middlewares/tenantGuard.js"),
      import("../middlewares/auth.js"),
    ]);

    const app = express();
    app.get("/standard", authMiddleware, tenantGuard, okHandler);
    app.use(deleguesRouter);
    app.use(commissionsMembresDeleguesRouter);

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

  beforeEach(async () => {
    const { verifierLicenceActive } = await import("../services/licenceService.js");
    vi.mocked(verifierLicenceActive).mockResolvedValue({
      valide: false,
      statut: "expiree",
      messageInvalide: "Votre période d'essai a expiré.",
      joursRestants: null,
    } as never);
  });

  async function request(path: string, role: string) {
    return fetch(`${baseUrl}${path}`, { headers: { "x-test-role": role } });
  }

  for (const role of ["pca", "directeur", "comptable"]) {
    it(`bloque ${role} sur une route standard et sur les taux des délégués`, async () => {
      expect((await request("/standard", role)).status).toBe(402);
      expect((await request("/delegues/commissions/taux", role)).status).toBe(402);
    });
  }

  it("laisse l'auditeur consulter les taux malgré une licence expirée", async () => {
    expect((await request("/standard", "auditeur")).status).toBe(200);
    expect((await request("/delegues/commissions/taux", "auditeur")).status).toBe(200);
  });

  it("laisse le magasinier passer une route opérationnelle malgré une licence expirée", async () => {
    expect((await request("/standard", "magasinier")).status).toBe(200);
  });

  it("laisse un comptable autorisé payer une commission membre délégué", async () => {
    const { verifierLicenceActive } = await import("../services/licenceService.js");
    vi.mocked(verifierLicenceActive).mockResolvedValue({
      valide: true,
      statut: "active",
      messageInvalide: "",
      joursRestants: null,
    } as never);

    const response = await fetch(`${baseUrl}/delegues-localites/123/commissions/payer`, {
      method: "POST",
      headers: { "x-test-role": "comptable" },
    });
    expect(response.status).toBe(201);
  });

  it("refuse le paiement de commission à un rôle non autorisé", async () => {
    const response = await fetch(`${baseUrl}/delegues-localites/123/commissions/payer`, {
      method: "POST",
      headers: { "x-test-role": "magasinier" },
    });
    expect(response.status).toBe(403);
  });
});
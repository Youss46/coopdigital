/**
 * Tenant Isolation Tests
 *
 * Vérifie que chaque contrôleur renvoie HTTP 4xx (401 ou 403) quand
 * req.user.cooperativeId est null, garantissant qu'aucune coopérative
 * ne peut accéder aux données d'une autre (protection multi-tenant).
 *
 * Ces tests sont purement unitaires : les services et la BDD sont mockés,
 * la garde coopérative s'exécute avant tout appel DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

// ─── Mocks services (avant tout import de contrôleur) ────────────────────────

vi.mock("../services/membresService.js", () => ({ listMembres: vi.fn(), getMembreById: vi.fn() }));
vi.mock("../services/avancesService.js", () => ({ listAvances: vi.fn(), createAvance: vi.fn() }));
vi.mock("../services/donService.js", () => ({
  getCategories: vi.fn(), getStatsDons: vi.fn(), listerDons: vi.fn(),
  creerDon: vi.fn(), listerProgrammes: vi.fn(), genererReference: vi.fn(),
}));
vi.mock("../services/fiscaliteService.js", () => ({
  listObligations: vi.fn().mockResolvedValue([]),
  listDeclarations: vi.fn(), genererDeclarationsMensuelles: vi.fn(),
  checkEcheancesFiscales: vi.fn(), getRapportAnnuel: vi.fn().mockResolvedValue({ lignes: [] }),
}));
vi.mock("../services/formationService.js", () => ({
  listProgrammes: vi.fn().mockResolvedValue([]),
  listSessions: vi.fn(), listAttestations: vi.fn(),
}));
vi.mock("../services/planningService.js", () => ({
  listZones: vi.fn(), listPlannings: vi.fn(), deleteZone: vi.fn(), createZone: vi.fn(),
}));
vi.mock("../services/prixService.js", () => ({
  listPrix: vi.fn(), analyserMarge: vi.fn(), getComparaison: vi.fn(),
  getHistorique: vi.fn(), getConfig: vi.fn(), getAlertes: vi.fn(), getTendance: vi.fn(),
}));
vi.mock("../services/lotsService.js", () => ({ listLots: vi.fn(), getLot: vi.fn() }));
vi.mock("../services/livraisonsService.js", () => ({ listLivraisons: vi.fn() }));
vi.mock("../services/anomalieService.js", () => ({ checkAvance: vi.fn(), creerAnomalies: vi.fn() }));
vi.mock("../services/exportateursService.js", () => ({ listExportateurs: vi.fn() }));
vi.mock("../services/stocksService.js", () => ({ listStocks: vi.fn() }));
vi.mock("../services/pdfHeaderService.js", () => ({ drawHeader: vi.fn(), drawFooter: vi.fn() }));
vi.mock("../services/portailService.js", () => ({ computeCodeMembre: vi.fn((id: number) => `MB-${id}`) }));
vi.mock("../services/auditService.js", () => ({ logAudit: vi.fn() }));
vi.mock("../services/comptabiliteService.js", () => ({
  proposerEcriture: vi.fn(), listerEcritures: vi.fn(), generateEcrituresAvance: vi.fn(),
}));
vi.mock("../services/communicationService.js", () => ({ listMessages: vi.fn() }));
vi.mock("../services/licenceService.js", () => ({
  verifierLicenceActive: vi.fn(() => ({ valide: true })), initLicenceCrons: vi.fn(),
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), or: vi.fn(), sql: vi.fn(() => "sql"),
  desc: vi.fn(), asc: vi.fn(), ilike: vi.fn(), inArray: vi.fn(),
  notInArray: vi.fn(), gte: vi.fn(), lte: vi.fn(), isNotNull: vi.fn(),
  isNull: vi.fn(), ne: vi.fn(), count: vi.fn(), sum: vi.fn(), avg: vi.fn(),
  not: vi.fn(), between: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyReq = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRes = any;

function makeReq(cooperativeId: number | null, extra: Record<string, unknown> = {}): AnyReq {
  return {
    user: { id: 99, role: "admin", cooperativeId },
    query: {},
    params: {},
    body: {},
    headers: {},
    log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
    ...extra,
  };
}

function makeRes(): AnyRes {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    pipe: vi.fn().mockReturnThis(),
  };
}

/** Les gardes coopérative peuvent renvoyer 401 ou 403 selon le contrôleur — les deux bloquent l'accès. */
function assertTenantRejected(res: AnyRes) {
  const statusCode = res.status.mock.calls[0]?.[0] as number | undefined;
  expect([401, 403]).toContain(statusCode);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({ erreur: expect.any(String) })
  );
}

function call(fn: (req: Request, res: Response) => Promise<void>, req: AnyReq, res: AnyRes) {
  return fn(req, res);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Tenant isolation — 4xx si cooperativeId est null", () => {

  // ── Membres ──────────────────────────────────────────────────────────────────
  describe("membresController", () => {
    let ctrl: typeof import("../controllers/membresController.js");
    beforeEach(async () => { ctrl = await import("../controllers/membresController.js"); });

    it("listMembres renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.listMembres, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("createMembre renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.createMembre, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("exportMembresPdf renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.exportMembresPdf, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("getMembreById renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getMembreById, makeReq(null, { params: { id: "1" } }), res);
      assertTenantRejected(res);
    });

    it("updateMembre renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.updateMembre, makeReq(null, { params: { id: "1" }, body: {} }), res);
      assertTenantRejected(res);
    });

    it("modifierStatutMembre renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.modifierStatutMembre, makeReq(null, { params: { id: "1" } }), res);
      assertTenantRejected(res);
    });

    it("getMembreHistorique renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getMembreHistorique, makeReq(null, { params: { id: "1" } }), res);
      assertTenantRejected(res);
    });
  });

  // ── Avances ──────────────────────────────────────────────────────────────────
  describe("avancesController", () => {
    let ctrl: typeof import("../controllers/avancesController.js");
    beforeEach(async () => { ctrl = await import("../controllers/avancesController.js"); });

    it("listAvances renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.listAvances, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("createAvance renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.createAvance, makeReq(null), res);
      assertTenantRejected(res);
    });
  });

  // ── Dons ─────────────────────────────────────────────────────────────────────
  describe("donController", () => {
    let ctrl: typeof import("../controllers/donController.js");
    beforeEach(async () => { ctrl = await import("../controllers/donController.js"); });

    it("getCategoriesHandler renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getCategoriesHandler, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("getStatsDonsHandler renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getStatsDonsHandler, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("listerDonsHandler renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.listerDonsHandler, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("creerDonHandler renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.creerDonHandler, makeReq(null, { body: {} }), res);
      assertTenantRejected(res);
    });

    it("getRapportDonsHandler renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getRapportDonsHandler, makeReq(null), res);
      assertTenantRejected(res);
    });
  });

  // ── Fiscalité ─────────────────────────────────────────────────────────────────
  describe("fiscaliteController", () => {
    let ctrl: typeof import("../controllers/fiscaliteController.js");
    beforeEach(async () => { ctrl = await import("../controllers/fiscaliteController.js"); });

    it("getObligations renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getObligations, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("getDeclarations renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getDeclarations, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("postGenererMensuel renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.postGenererMensuel, makeReq(null, { params: { mois: "1", annee: "2025" } }), res);
      assertTenantRejected(res);
    });

    it("getRapportAnnuel renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getRapportAnnuel, makeReq(null), res);
      assertTenantRejected(res);
    });
  });

  // ── Formation ─────────────────────────────────────────────────────────────────
  describe("formationController", () => {
    let ctrl: typeof import("../controllers/formationController.js");
    beforeEach(async () => { ctrl = await import("../controllers/formationController.js"); });

    it("getProgrammes renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getProgrammes, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("getSessions renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getSessions, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("getListeAttestations renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getListeAttestations, makeReq(null), res);
      assertTenantRejected(res);
    });
  });

  // ── Planning collecte ─────────────────────────────────────────────────────────
  describe("planningController", () => {
    let ctrl: typeof import("../controllers/planningController.js");
    beforeEach(async () => { ctrl = await import("../controllers/planningController.js"); });

    it("getPlannings renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getPlannings, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("deleteZone renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.deleteZone, makeReq(null, { params: { id: "1" } }), res);
      assertTenantRejected(res);
    });
  });

  // ── Prix ──────────────────────────────────────────────────────────────────────
  describe("prixController", () => {
    let ctrl: typeof import("../controllers/prixController.js");
    beforeEach(async () => { ctrl = await import("../controllers/prixController.js"); });

    it("getHistorique renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getHistorique, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("getAnalyseMarge renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getAnalyseMarge, makeReq(null), res);
      assertTenantRejected(res);
    });

    it("getComparaison renvoie 4xx", async () => {
      const res = makeRes();
      await call(ctrl.getComparaison, makeReq(null), res);
      assertTenantRejected(res);
    });
  });

  // ── Cas positif : cooperativeId présent ne déclenche PAS 4xx ─────────────────
  describe("Avec cooperativeId valide — pas de rejet prématuré", () => {
    it("getObligations avec cooperativeId=1 retourne les données", async () => {
      const fiscaliteService = await import("../services/fiscaliteService.js");
      vi.mocked(fiscaliteService.listObligations).mockResolvedValue([]);

      const ctrl = await import("../controllers/fiscaliteController.js");
      const res = makeRes();
      await call(ctrl.getObligations, makeReq(1), res);

      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith([]);
    });

    it("getProgrammes avec cooperativeId=1 retourne les données", async () => {
      const formationService = await import("../services/formationService.js");
      vi.mocked(formationService.listProgrammes).mockResolvedValue([]);

      const ctrl = await import("../controllers/formationController.js");
      const res = makeRes();
      await call(ctrl.getProgrammes, makeReq(1), res);

      expect(res.status).not.toHaveBeenCalledWith(401);
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith([]);
    });
  });
});

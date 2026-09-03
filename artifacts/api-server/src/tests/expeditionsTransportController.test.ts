import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class SessionExpeditionExistanteError extends Error {
    readonly code = "SESSION_EXPEDITION_EXISTANTE";
    constructor(
      public readonly sessionId: number,
      public readonly numeroSession: string,
    ) {
      super(`Une pesée de contrôle est déjà en cours pour cette expédition (${numeroSession})`);
      this.name = "SessionExpeditionExistanteError";
    }
  }

  return {
    listFraisTransportARegler: vi.fn(),
    createExpeditionControlSession: vi.fn(),
    SessionExpeditionExistanteError,
  };
});

vi.mock("../services/expeditionsService", () => ({
  listExpeditions: vi.fn(),
  listFraisTransportARegler: mocks.listFraisTransportARegler,
  getExpeditionsStats: vi.fn(),
  getExpedition: vi.fn(),
  createExpedition: vi.fn(),
  changerStatut: vi.fn(),
  confirmerReception: vi.fn(),
  getRapportEudr: vi.fn(),
  getFlotteVehicules: vi.fn(),
  getFlotteChauffeurs: vi.fn(),
  getLotsDisponibles: vi.fn(),
  rattacherLot: vi.fn(),
  detacherLot: vi.fn(),
  genererNumeroExpedition: vi.fn(),
  reglerFraisTransport: vi.fn(),
}));

vi.mock("../services/pdfService", () => ({
  generateBonLivraison: vi.fn(),
  generateBordereauTransport: vi.fn(),
  generateRapportEudrPdf: vi.fn(),
  generateConstatReception: vi.fn(),
}));

vi.mock("../services/peseeSessionService.js", () => ({
  addLigne: vi.fn(),
  annulerSession: vi.fn(),
  createExpeditionControlSession: mocks.createExpeditionControlSession,
  deleteLigne: vi.fn(),
  getSessionDetail: vi.fn(),
  terminerSession: vi.fn(),
  SessionExpeditionExistanteError: mocks.SessionExpeditionExistanteError,
}));

const {
  handleListFraisTransportARegler,
  handleStartExpeditionControl,
} = await import("../controllers/expeditionsController");

function makeReq(cooperativeId: number | null) {
  return {
    user: { cooperativeId },
    log: { error: vi.fn() },
  } as never;
}

function makeRes() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe("liste des frais d'exportation à régler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne les expéditions de la coopérative", async () => {
    const rows = [{ id: 12, numeroExpedition: "EXP-2026-001", fraisTransportStatut: "non_paye" }];
    mocks.listFraisTransportARegler.mockResolvedValueOnce(rows);
    const res = makeRes();

    await handleListFraisTransportARegler(makeReq(7), res as never);

    expect(mocks.listFraisTransportARegler).toHaveBeenCalledWith(7);
    expect(res.json).toHaveBeenCalledWith(rows);
  });

  it("refuse une requête sans coopérative", async () => {
    const res = makeRes();

    await handleListFraisTransportARegler(makeReq(null), res as never);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ erreur: "Coopérative non associée" });
    expect(mocks.listFraisTransportARegler).not.toHaveBeenCalled();
  });

  it("retourne une erreur JSON si le service échoue", async () => {
    mocks.listFraisTransportARegler.mockRejectedValueOnce(new Error("DB indisponible"));
    const res = makeRes();

    await handleListFraisTransportARegler(makeReq(7), res as never);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ erreur: "Erreur interne" });
  });

  it("démarre un contrôle distinct avec la certification déclarée", async () => {
    const session = { id: 44, operation: "controle_chargement", expeditionId: 12 };
    mocks.createExpeditionControlSession.mockResolvedValueOnce(session);
    const res = makeRes();
    const req = {
      user: { id: 9, role: "responsable_tracabilite", cooperativeId: 7 },
      params: { id: "12" },
      body: { certification_cacao: "RA" },
      log: { error: vi.fn() },
    } as never;

    await handleStartExpeditionControl(req, res as never);

    expect(mocks.createExpeditionControlSession).toHaveBeenCalledWith(7, 12, expect.objectContaining({
      certificationCacao: "RA",
    }));
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(session);
  });

  it("refuse le démarrage d'un contrôle sans certification", async () => {
    const res = makeRes();
    const req = {
      user: { id: 9, role: "responsable_tracabilite", cooperativeId: 7 },
      params: { id: "12" },
      body: {},
      log: { error: vi.fn() },
    } as never;

    await handleStartExpeditionControl(req, res as never);

    expect(mocks.createExpeditionControlSession).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("retourne le conflit et la session déjà ouverte", async () => {
    mocks.createExpeditionControlSession.mockRejectedValueOnce(
      new mocks.SessionExpeditionExistanteError(44, "PSE-2026-00044"),
    );
    const res = makeRes();
    const req = {
      user: { id: 9, role: "responsable_tracabilite", cooperativeId: 7 },
      params: { id: "12" },
      body: { certification_cacao: "RA" },
      log: { error: vi.fn() },
    } as never;

    await handleStartExpeditionControl(req, res as never);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      erreur: "Une pesée de contrôle est déjà en cours pour cette expédition (PSE-2026-00044)",
      sessionId: 44,
      numeroSession: "PSE-2026-00044",
    });
  });
});
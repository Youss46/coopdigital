import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listFraisTransportARegler: vi.fn(),
}));

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

const { handleListFraisTransportARegler } = await import("../controllers/expeditionsController");

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
});
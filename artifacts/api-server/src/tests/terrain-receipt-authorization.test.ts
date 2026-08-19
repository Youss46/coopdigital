import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@workspace/db";

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
}));

vi.mock("../services/rapportIAService.js", () => ({
  buildPrompt: vi.fn(),
  getKPIs: vi.fn(),
}));

vi.mock("../services/pdfHeaderService.js", () => ({
  drawFooter: vi.fn(),
  drawHeader: vi.fn(),
}));

const generateRecuLivraison = vi.fn();
vi.mock("../services/pdfService.js", () => ({
  generateFicheMembre: vi.fn(),
  generateRapportMensuel: vi.fn(),
  generateBilanCampagne: vi.fn(),
  generateBilanOHADA: vi.fn(),
  generateCompteResultatOHADA: vi.fn(),
  generateFluxTresoreiriePdf: vi.fn(),
  generateRecuLivraison,
  generateRecuPaiement: vi.fn(),
  generateBulletinPaie: vi.fn(),
  generateBordereauPesee: vi.fn(),
  generateRecuAvance: vi.fn(),
  generateRecuIntrant: vi.fn(),
  generateEtatPartsSociales: vi.fn(),
  generateReleveCommissions: vi.fn(),
}));

const { getTerrainRecuLivraison } = await import("../controllers/rapportsController.js");

function selectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ["from", "leftJoin", "where"]) chain[method] = vi.fn(self);
  chain["limit"] = vi.fn().mockResolvedValue(rows);
  return chain;
}

function makeResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn(),
  };
  response.status.mockReturnValue(response);
  return response;
}

describe("terrain delivery receipt authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateRecuLivraison.mockResolvedValue(Buffer.from("pdf"));
  });

  it("allows the peseur who created a grouped session to download its receipt", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([
      { agentId: 42, peseurId: 7, sessionPeseurId: 7 },
    ]) as never);
    const res = makeResponse();
    const req = {
      params: { id: "123" },
      agent: { id: 7, role: "peseur", cooperativeId: 3 },
      log: { error: vi.fn() },
    };

    await getTerrainRecuLivraison(req as never, res as never);

    expect(generateRecuLivraison).toHaveBeenCalledWith(123, 3);
    expect(res.end).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(403);
  });

  it("still refuses a receipt outside the peseur scope", async () => {
    vi.mocked(db.select).mockReturnValueOnce(selectChain([
      { agentId: 42, peseurId: 9, sessionPeseurId: 9 },
    ]) as never);
    const res = makeResponse();
    const req = {
      params: { id: "123" },
      agent: { id: 7, role: "peseur", cooperativeId: 3 },
      log: { error: vi.fn() },
    };

    await getTerrainRecuLivraison(req as never, res as never);

    expect(generateRecuLivraison).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ erreur: "Accès non autorisé à cette livraison" });
  });
});
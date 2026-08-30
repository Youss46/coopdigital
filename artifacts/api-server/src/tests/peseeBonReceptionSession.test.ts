import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createSession = vi.fn();
const creerSessionBatch = vi.fn();

vi.mock("../services/peseeSessionService", () => ({
  createSession,
  getSessions: vi.fn(),
  getSessionDetail: vi.fn(),
  addLigne: vi.fn(),
  deleteLigne: vi.fn(),
  terminerSession: vi.fn(),
  annulerSession: vi.fn(),
  creerLivraisonDepuisSession: vi.fn(),
  expirerSessionsStales: vi.fn(),
   creerSessionBatch,
  SessionEnCoursError: class SessionEnCoursError extends Error {},
  SessionBonExistanteError: class SessionBonExistanteError extends Error {
    constructor(public readonly sessionId: number) {
      super(`Une session est déjà associée au bon #${sessionId}`);
    }
  },
  SessionTransfertExistanteError: class SessionTransfertExistanteError extends Error {},
}));

vi.mock("../services/pdfService.js", () => ({
  generateBordereauAchatSession: vi.fn(),
}));

vi.mock("../services/peseeService", () => ({
  getBalances: vi.fn(),
  createBalance: vi.fn(),
  updateBalance: vi.fn(),
  getBalancesAlertes: vi.fn(),
  createVerification: vi.fn(),
  validerDoublePeseeLivraison: vi.fn(),
  getLitiges: vi.fn(),
  createLitige: vi.fn(),
  resoudreLitige: vi.fn(),
  getStatistiques: vi.fn(),
  getRapportAgent: vi.fn(),
  getConfig: vi.fn(),
  upsertConfig: vi.fn(),
}));

const { handleCreateSession, handleBatchCreateSession } = await import("../controllers/peseeController.js");

describe("création de session depuis un bon de réception", () => {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;

  beforeEach(() => {
    vi.clearAllMocks();
    createSession.mockResolvedValue({ id: 19, numeroSession: "PSE-2026-00019" });
  });

  it("transmet le bon et crée une session liée au membre délégué", async () => {
    const request = {
      agent: { id: 7, cooperativeId: 3, role: "peseur", delegueId: null },
      body: {
        bonReceptionId: 42,
        produit: "cacao",
        operation: "reception_membre_delegue",
        certificationCacao: "RA",
      },
      log: { error: vi.fn() },
    } as unknown as Request;

    await handleCreateSession(request, response);

    expect(createSession).toHaveBeenCalledWith(3, expect.objectContaining({
      peseurId: 7,
      bonReceptionId: 42,
      produit: "cacao",
      operation: "reception_membre_delegue",
      certificationCacao: "RA",
    }));
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it("refuse une réception de membre délégué sans bon de réception", async () => {
    const request = {
      agent: { id: 7, cooperativeId: 3, role: "peseur", delegueId: null },
      body: { produit: "cacao", operation: "reception_membre_delegue" },
      log: { error: vi.fn() },
    } as unknown as Request;

    await handleCreateSession(request, response);

    expect(createSession).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      erreur: expect.stringContaining("bon de réception"),
    }));
  });

  it("refuse de démarrer une pesée sans certification cacao", async () => {
    const request = {
      agent: { id: 7, cooperativeId: 3, role: "peseur", delegueId: null },
      body: {
        bonReceptionId: 42,
        produit: "cacao",
        operation: "reception_membre_delegue",
      },
      log: { error: vi.fn() },
    } as unknown as Request;

    await handleCreateSession(request, response);

    expect(createSession).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      erreur: expect.stringContaining("certification"),
    }));
  });

  it("renvoie la session liée au bon au lieu d'une erreur serveur", async () => {
    const { SessionBonExistanteError } = await import("../services/peseeSessionService.js");
    createSession.mockRejectedValueOnce(new SessionBonExistanteError(19));
    const request = {
      agent: { id: 7, cooperativeId: 3, role: "peseur", delegueId: null },
      body: {
        bonReceptionId: 42,
        produit: "cacao",
        operation: "reception_membre_delegue",
        certificationCacao: "RA",
      },
      log: { error: vi.fn() },
    } as unknown as Request;

    await handleCreateSession(request, response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      code: "SESSION_BON_EXISTANTE",
      sessionId: 19,
    }));
  });
});

describe("synchronisation d'une pré-pesée export", () => {
  const response = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;

  beforeEach(() => {
    vi.clearAllMocks();
    creerSessionBatch.mockResolvedValue({
      sessionId: 21,
      numeroSession: "PSE-2026-00021",
      poidsTotalKg: "500",
      nbSacsTotal: 10,
    });
  });

  it("accepte une expédition sans exiger de membre ni de certification", async () => {
    const request = {
      agent: { id: 7, cooperativeId: 3, role: "peseur", delegueId: null },
      body: {
        localId: "local-export-1",
        expeditionId: 88,
        operation: "prechargement_export",
        produit: "cacao",
        lignes: [{ localId: "line-1", nbSacs: 10, poidsBrutKg: 510, tareKg: 10 }],
        statut: "terminee",
      },
      log: { error: vi.fn() },
    } as unknown as Request;

    await handleBatchCreateSession(request, response);

    expect(creerSessionBatch).toHaveBeenCalledWith(3, 7, expect.objectContaining({
      localId: "local-export-1",
      expeditionId: 88,
      membreId: undefined,
      operation: "prechargement_export",
      certificationCacao: undefined,
    }));
    expect(response.status).toHaveBeenCalledWith(201);
  });
});
import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  creerChequeRecu,
  deposerChequeRecu,
  encaisserChequeRecu,
  rejeterChequeRecu,
  annulerChequeRecu,
} = vi.hoisted(() => ({
  creerChequeRecu: vi.fn(),
  deposerChequeRecu: vi.fn(),
  encaisserChequeRecu: vi.fn(),
  rejeterChequeRecu: vi.fn(),
  annulerChequeRecu: vi.fn(),
}));

vi.mock("../services/chequesRecusService.js", () => ({
  creerChequeRecu,
  deposerChequeRecu,
  encaisserChequeRecu,
  rejeterChequeRecu,
  annulerChequeRecu,
}));

vi.mock("../middlewares/permissions.js", () => ({
  checkPermission: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const { default: chequesRouter } = await import("../routes/cheques.js");
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: 55, role: "comptable", cooperativeId: 7 };
    next();
  });
  app.use(chequesRouter);

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /cheques-recus", () => {
  it("crée un chèque reçu avec la coopérative et l'utilisateur connectés", async () => {
    creerChequeRecu.mockResolvedValue({
      id: 44,
      cooperativeId: 7,
      venteExportateurId: 18,
      exportateurId: 6,
      numeroCheque: "CHQ-44",
      banque: "Banque test",
      montantFcfa: 125000,
      dateReception: "2026-08-29",
      dateEcheance: null,
      statut: "a_deposer",
    });

    const response = await fetch(`${baseUrl}/cheques-recus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        venteExportateurId: 18,
        numeroCheque: " CHQ-44 ",
        banque: " Banque test ",
        montantFcfa: 125000,
        dateReception: "2026-08-29",
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: 44,
      statut: "a_deposer",
    });
    expect(creerChequeRecu).toHaveBeenCalledWith(7, {
      venteExportateurId: 18,
      numeroCheque: "CHQ-44",
      banque: "Banque test",
      montantFcfa: 125000,
      dateReception: "2026-08-29",
      dateEcheance: null,
      createdBy: 55,
    });
  });

  it("refuse les données obligatoires manquantes avant d'appeler le service", async () => {
    const response = await fetch(`${baseUrl}/cheques-recus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ venteExportateurId: 18, montantFcfa: 125000 }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      erreur: "Vente, numéro, banque, montant et date de réception sont obligatoires",
    });
    expect(creerChequeRecu).not.toHaveBeenCalled();
  });
});

describe("POST /cheques-recus/:id/deposer", () => {
  it("retourne 409 au perdant d'une double demande de dépôt", async () => {
    let calls = 0;
    let releaseConcurrentRequests!: () => void;
    const concurrentRequests = new Promise<void>((resolve) => {
      releaseConcurrentRequests = resolve;
    });

    deposerChequeRecu.mockImplementation(async () => {
      const requestNumber = ++calls;
      if (requestNumber === 2) releaseConcurrentRequests();
      await concurrentRequests;

      if (requestNumber === 1) {
        return {
          id: 40,
          statut: "depose",
          dateDepot: "2026-08-29",
        };
      }
      throw new Error("Seul un chèque à déposer peut être déposé");
    });

    const request = () => fetch(`${baseUrl}/cheques-recus/40/deposer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dateDepot: "2026-08-29" }),
    });

    const [firstResponse, secondResponse] = await Promise.all([request(), request()]);
    const responses = await Promise.all([
      firstResponse.json() as Promise<Record<string, unknown>>,
      secondResponse.json() as Promise<Record<string, unknown>>,
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([200, 409]);
    expect(responses).toContainEqual({
      id: 40,
      statut: "depose",
      dateDepot: "2026-08-29",
    });
    expect(responses).toContainEqual({
      erreur: "Seul un chèque à déposer peut être déposé",
    });
    expect(deposerChequeRecu).toHaveBeenCalledTimes(2);
    expect(deposerChequeRecu).toHaveBeenCalledWith(40, 7, "2026-08-29");
  });
});

describe("POST /cheques-recus/:id/encaisser", () => {
  it("retourne 409 au perdant de la course et conserve la réponse du gagnant", async () => {
    let calls = 0;
    let releaseConcurrentRequests!: () => void;
    const concurrentRequests = new Promise<void>((resolve) => {
      releaseConcurrentRequests = resolve;
    });

    encaisserChequeRecu.mockImplementation(async () => {
      const requestNumber = ++calls;
      if (requestNumber === 2) releaseConcurrentRequests();
      await concurrentRequests;

      if (requestNumber === 1) {
        return {
          id: 41,
          statut: "encaisse",
          compteBancaireId: 902,
          mouvementBanqueId: 801,
          dateEncaissement: "2026-08-29",
        };
      }
      throw new Error("Le chèque doit être déposé avant son encaissement");
    });

    const request = () => fetch(`${baseUrl}/cheques-recus/41/encaisser`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        compteBancaireId: 902,
        dateEncaissement: "2026-08-29",
      }),
    });

    const [firstResponse, secondResponse] = await Promise.all([request(), request()]);
    const responses = await Promise.all([
      firstResponse.json() as Promise<Record<string, unknown>>,
      secondResponse.json() as Promise<Record<string, unknown>>,
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([200, 409]);
    expect(responses).toContainEqual({
      id: 41,
      statut: "encaisse",
      compteBancaireId: 902,
      mouvementBanqueId: 801,
      dateEncaissement: "2026-08-29",
    });
    expect(responses).toContainEqual({
      erreur: "Le chèque doit être déposé avant son encaissement",
    });
    expect(encaisserChequeRecu).toHaveBeenCalledTimes(2);
    expect(encaisserChequeRecu).toHaveBeenCalledWith(
      41,
      7,
      { compteBancaireId: 902, dateEncaissement: "2026-08-29" },
      55,
    );
  });
});

describe("POST /cheques-recus/:id/rejeter", () => {
  it("retourne 409 au perdant de la course et conserve la réponse du gagnant", async () => {
    let calls = 0;
    let releaseConcurrentRequests!: () => void;
    const concurrentRequests = new Promise<void>((resolve) => {
      releaseConcurrentRequests = resolve;
    });

    rejeterChequeRecu.mockImplementation(async () => {
      const requestNumber = ++calls;
      if (requestNumber === 2) releaseConcurrentRequests();
      await concurrentRequests;

      if (requestNumber === 1) {
        return {
          id: 42,
          statut: "rejete",
          dateRejet: "2026-08-29",
          motifRejet: "Compte clôturé",
        };
      }
      throw new Error("Seul un chèque à déposer ou déposé peut être rejeté");
    });

    const request = () => fetch(`${baseUrl}/cheques-recus/42/rejeter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        motifRejet: "Compte clôturé",
        dateRejet: "2026-08-29",
      }),
    });

    const [firstResponse, secondResponse] = await Promise.all([request(), request()]);
    const responses = await Promise.all([
      firstResponse.json() as Promise<Record<string, unknown>>,
      secondResponse.json() as Promise<Record<string, unknown>>,
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([200, 409]);
    expect(responses).toContainEqual({
      id: 42,
      statut: "rejete",
      dateRejet: "2026-08-29",
      motifRejet: "Compte clôturé",
    });
    expect(responses).toContainEqual({
      erreur: "Seul un chèque à déposer ou déposé peut être rejeté",
    });
    expect(rejeterChequeRecu).toHaveBeenCalledTimes(2);
    expect(rejeterChequeRecu).toHaveBeenCalledWith(
      42,
      7,
      { motifRejet: "Compte clôturé", dateRejet: "2026-08-29" },
    );
  });
});

describe("POST /cheques-recus/:id/annuler", () => {
  it("retourne 409 au perdant de la course et conserve la réponse du gagnant", async () => {
    let calls = 0;
    let releaseConcurrentRequests!: () => void;
    const concurrentRequests = new Promise<void>((resolve) => {
      releaseConcurrentRequests = resolve;
    });

    annulerChequeRecu.mockImplementation(async () => {
      const requestNumber = ++calls;
      if (requestNumber === 2) releaseConcurrentRequests();
      await concurrentRequests;

      if (requestNumber === 1) {
        return {
          id: 43,
          statut: "annule",
          dateAnnulation: "2026-08-29",
          motifAnnulation: "Erreur de saisie",
        };
      }
      throw new Error("Seul un chèque à déposer ou déposé peut être annulé");
    });

    const request = () => fetch(`${baseUrl}/cheques-recus/43/annuler`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motifAnnulation: "Erreur de saisie" }),
    });

    const [firstResponse, secondResponse] = await Promise.all([request(), request()]);
    const responses = await Promise.all([
      firstResponse.json() as Promise<Record<string, unknown>>,
      secondResponse.json() as Promise<Record<string, unknown>>,
    ]);

    expect([firstResponse.status, secondResponse.status].sort()).toEqual([200, 409]);
    expect(responses).toContainEqual({
      id: 43,
      statut: "annule",
      dateAnnulation: "2026-08-29",
      motifAnnulation: "Erreur de saisie",
    });
    expect(responses).toContainEqual({
      erreur: "Seul un chèque à déposer ou déposé peut être annulé",
    });
    expect(annulerChequeRecu).toHaveBeenCalledTimes(2);
    expect(annulerChequeRecu).toHaveBeenCalledWith(43, 7, "Erreur de saisie");
  });
});
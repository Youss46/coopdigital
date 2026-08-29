import express from "express";
import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { encaisserChequeRecu } = vi.hoisted(() => ({
  encaisserChequeRecu: vi.fn(),
}));

vi.mock("../services/chequesRecusService.js", () => ({
  encaisserChequeRecu,
}));

vi.mock("../middlewares/permissions.js", () => ({
  checkPermission: () => (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => next(),
}));

describe("POST /cheques-recus/:id/encaisser", () => {
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
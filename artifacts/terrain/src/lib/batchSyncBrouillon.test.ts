import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrouillonPesee } from "./types";
import { batchSyncBrouillon } from "./api";

describe("synchronisation d'un brouillon de pesée", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("transmet le même bon de réception après la reprise du brouillon", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: 901,
        numeroSession: "PES-S-2026-00901",
        poidsTotalKg: "0.000",
        nbSacsTotal: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const brouillon: BrouillonPesee = {
      localId: "offline-delegue-1",
      membreId: 42,
      membreNom: "Kouassi",
      membrePrenoms: "Awa",
      membreCode: "MEM-042",
      produit: "cacao",
      operation: "reception_membre_delegue",
      certificationCacao: "RA",
      bonReceptionId: 314,
      statut: "terminee",
      syncStatus: "pending",
      lignes: [{
        localId: "ligne-1",
        nbSacs: 5,
        poidsBrutKg: 250,
        tareKg: 5,
        numeroPassage: 1,
        timestamp: 1,
      }],
      poidsTotalKg: 245,
      nbSacsTotal: 5,
      createdAt: 1,
      updatedAt: 2,
    };

    await batchSyncBrouillon(brouillon);

    const [, request] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(request.body))).toMatchObject({
      operation: "reception_membre_delegue",
      membreId: 42,
      bonReceptionId: 314,
      certificationCacao: "RA",
    });
  });
});
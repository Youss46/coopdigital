// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsOp } from "../lib/idb";
import type { BrouillonPesee } from "../lib/types";

const fakeState = vi.hoisted(() => {
  const op: GpsOp = {
    localId: "gps-network-retry-1",
    missionId: 12,
    membreId: 34,
    data: { polygoneGps: [{ lat: 5.31, lon: -4.02, ts: 1 }], photos: [] },
    timestamp: 1,
    status: "pending",
  };
  const brouillon: BrouillonPesee = {
    localId: "delegue-brouillon-1",
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
    updatedAt: 1,
  };
  return {
    op,
    brouillon,
    syncGpsOps: vi.fn(),
    batchSyncBrouillon: vi.fn(),
    incrementGpsTentatives: vi.fn(async (_localId: string) => {
      fakeState.op.tentatives = (fakeState.op.tentatives ?? 0) + 1;
      return fakeState.op.tentatives;
    }),
    markGpsOpError: vi.fn(async (_localId: string, errorMsg?: string) => {
      op.errorMsg = errorMsg;
    }),
    markGpsOpSynced: vi.fn(async () => {
      op.status = "synced";
      delete op.errorMsg;
    }),
    markBrouillonSynced: vi.fn(async (_localId: string, serverId: number, numeroSession: string) => {
      brouillon.syncStatus = "synced";
      brouillon.serverId = serverId;
      brouillon.numeroSession = numeroSession;
      delete brouillon.errorMsg;
    }),
    markBrouillonError: vi.fn(async (_localId: string, errorMsg: string) => {
      brouillon.syncStatus = "error";
      brouillon.errorMsg = errorMsg;
    }),
  };
});

vi.mock("../lib/idb", () => ({
  getPendingOps: vi.fn(async () => []),
  getPendingCount: vi.fn(async () => 1),
  markOpSyncedWithTs: vi.fn(),
  markOpError: vi.fn(),
  incrementTentatives: vi.fn(),
  getPendingGpsOps: vi.fn(async () => fakeState.op.status === "synced" ? [] : [fakeState.op]),
  markGpsOpSynced: fakeState.markGpsOpSynced,
  markGpsOpError: fakeState.markGpsOpError,
  incrementGpsTentatives: fakeState.incrementGpsTentatives,
  retryGpsOp: vi.fn(async () => 2),
  getPendingEnqueteOps: vi.fn(async () => []),
  markEnqueteOpSynced: vi.fn(),
  markEnqueteOpError: vi.fn(),
  incrementEnqueteTentatives: vi.fn(),
  getPendingBrouillons: vi.fn(async () =>
    fakeState.brouillon.syncStatus === "synced" ? [] : [fakeState.brouillon]),
  markBrouillonSynced: fakeState.markBrouillonSynced,
  markBrouillonError: fakeState.markBrouillonError,
}));

vi.mock("../lib/api", () => ({
  syncGpsOps: fakeState.syncGpsOps,
  syncOps: vi.fn(),
  syncEnqueteOps: vi.fn(),
  batchSyncBrouillon: fakeState.batchSyncBrouillon,
}));

import { OfflineProvider, useOffline } from "./OfflineContext";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  const { syncStatus, syncResult, triggerSync } = useOffline();
  useEffect(() => {
    (globalThis as { triggerSync?: () => Promise<void> }).triggerSync = triggerSync;
  }, [triggerSync]);
  return createElement("output", { "data-testid": "sync-state" },
    `${syncStatus}:${syncResult?.operationErrors[0]?.erreur ?? syncResult?.erreurs[0] ?? ""}`);
}

describe("relance GPS après coupure réseau", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    fakeState.op.status = "pending";
    delete fakeState.op.errorMsg;
    fakeState.syncGpsOps.mockReset();
    fakeState.syncGpsOps
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({ succes: [fakeState.op.localId], echecs: [] });
    fakeState.brouillon.syncStatus = "pending";
    delete fakeState.brouillon.serverId;
    delete fakeState.brouillon.numeroSession;
    delete fakeState.brouillon.errorMsg;
    fakeState.batchSyncBrouillon.mockReset();
    fakeState.markBrouillonSynced.mockClear();
    fakeState.markBrouillonError.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("conserve le localId et l'erreur, puis relance la même opération sans doublon", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(OfflineProvider, null, createElement(Probe)));
      await Promise.resolve();
    });

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => {
      await (globalThis as unknown as { triggerSync: () => Promise<void> }).triggerSync();
    });
    expect(container.textContent).toContain("error:Réseau indisponible");
    expect(fakeState.markGpsOpError).toHaveBeenCalledWith(fakeState.op.localId, "Réseau indisponible");
    expect(fakeState.op.tentatives).toBe(1);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    expect(fakeState.syncGpsOps).toHaveBeenCalledTimes(2);
    expect(fakeState.syncGpsOps.mock.calls[0][0][0].localId)
      .toBe(fakeState.syncGpsOps.mock.calls[1][0][0].localId);
    expect(fakeState.syncGpsOps.mock.calls[1][0]).toHaveLength(1);
    expect(fakeState.markGpsOpSynced).toHaveBeenCalledWith(fakeState.op.localId);

    await act(async () => root.unmount());
    container.remove();
  });

  it("synchronise un brouillon délégué après reconnexion et conserve les références de session", async () => {
    fakeState.op.status = "synced";
    fakeState.batchSyncBrouillon.mockResolvedValue({
      sessionId: 901,
      numeroSession: "PES-S-2026-00901",
      poidsTotalKg: "245.000",
      nbSacsTotal: 5,
    });

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(OfflineProvider, null, createElement(Probe)));
      await Promise.resolve();
    });

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => {
      await (globalThis as unknown as { triggerSync: () => Promise<void> }).triggerSync();
    });

    expect(fakeState.batchSyncBrouillon).toHaveBeenCalledWith(
      expect.objectContaining({
        localId: fakeState.brouillon.localId,
        operation: "reception_membre_delegue",
        bonReceptionId: 314,
      }),
    );
    expect(fakeState.markBrouillonSynced).toHaveBeenCalledWith(
      fakeState.brouillon.localId,
      901,
      "PES-S-2026-00901",
    );
    expect(fakeState.brouillon).toMatchObject({
      syncStatus: "synced",
      serverId: 901,
      numeroSession: "PES-S-2026-00901",
    });

    await act(async () => root.unmount());
    container.remove();
  });

  it("affiche l'erreur du brouillon et le rend réessayable après un échec", async () => {
    fakeState.op.status = "synced";
    fakeState.batchSyncBrouillon
      .mockRejectedValueOnce(Object.assign(
        new Error("Le bon de réception #314 n'est plus disponible pour une pesée"),
        { code: "BON_RECEPTION_INDISPONIBLE" },
      ))
      .mockResolvedValueOnce({
        sessionId: 902,
        numeroSession: "PES-S-2026-00902",
        poidsTotalKg: "245.000",
        nbSacsTotal: 5,
      });

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(OfflineProvider, null, createElement(Probe)));
      await Promise.resolve();
    });

    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    await act(async () => {
      await (globalThis as unknown as { triggerSync: () => Promise<void> }).triggerSync();
    });

    expect(fakeState.brouillon).toMatchObject({
      syncStatus: "error",
      errorMsg: expect.stringContaining("Bon de réception indisponible (bon #314)"),
    });
    expect(container.textContent).toContain("error:Bon de réception indisponible (bon #314)");
    expect(fakeState.markBrouillonError).toHaveBeenCalledWith(
      fakeState.brouillon.localId,
      expect.stringContaining("Bon de réception indisponible (bon #314)"),
    );

    await act(async () => {
      await (globalThis as unknown as { triggerSync: () => Promise<void> }).triggerSync();
    });

    expect(fakeState.batchSyncBrouillon).toHaveBeenCalledTimes(2);
    expect(fakeState.brouillon).toMatchObject({
      syncStatus: "synced",
      serverId: 902,
      numeroSession: "PES-S-2026-00902",
    });

    await act(async () => root.unmount());
    container.remove();
  });
});
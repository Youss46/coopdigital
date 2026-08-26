// @vitest-environment jsdom

import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GpsOp } from "../lib/idb";

const fakeState = vi.hoisted(() => {
  const op: GpsOp = {
    localId: "gps-network-retry-1",
    missionId: 12,
    membreId: 34,
    data: { polygoneGps: [{ lat: 5.31, lon: -4.02, ts: 1 }], photos: [] },
    timestamp: 1,
    status: "pending",
  };
  return {
    op,
    syncGpsOps: vi.fn(),
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
  getPendingBrouillons: vi.fn(async () => []),
  markBrouillonSynced: vi.fn(),
  markBrouillonError: vi.fn(),
}));

vi.mock("../lib/api", () => ({
  syncGpsOps: fakeState.syncGpsOps,
  syncOps: vi.fn(),
  syncEnqueteOps: vi.fn(),
  batchSyncBrouillon: vi.fn(),
}));

import { OfflineProvider, useOffline } from "./OfflineContext";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  const { syncStatus, syncResult, triggerSync } = useOffline();
  useEffect(() => {
    (globalThis as { triggerSync?: () => Promise<void> }).triggerSync = triggerSync;
  }, [triggerSync]);
  return createElement("output", { "data-testid": "sync-state" },
    `${syncStatus}:${syncResult?.operationErrors[0]?.erreur ?? ""}`);
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
});
// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncHistoryOp } from "../lib/types";

const fakeState = vi.hoisted(() => ({
  ops: [] as SyncHistoryOp[],
  retryGpsOperation: vi.fn(async (_localId: string) => {}),
}));

vi.mock("../lib/idb", () => ({
  getAllOps: vi.fn(async () => fakeState.ops),
}));

vi.mock("../contexts/OfflineContext", () => ({
  useOffline: () => ({
    pendingCount: 1,
    triggerSync: vi.fn(async () => {}),
    retryGpsOperation: fakeState.retryGpsOperation,
    isOnline: false,
    syncStatus: "idle",
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/sync-historique", vi.fn()],
}));

import SyncHistorique from "./SyncHistorique";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe("relance depuis l'historique de synchronisation", () => {
  beforeEach(() => {
    fakeState.retryGpsOperation.mockClear();
    fakeState.ops = [{
      localId: "gps-history-retry-1",
      type: "gps_collecte",
      data: { missionId: 12, membreId: 34 },
      timestamp: 1,
      status: "pending",
      errorMsg: "Position hors de la parcelle",
      tentatives: 2,
    }];
  });

  it("affiche une relance GPS et utilise le localId existant", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    let root: Root;

    await act(async () => {
      root = createRoot(container);
      root!.render(createElement(SyncHistorique));
      await Promise.resolve();
    });

    const retryButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Relancer l\'opération GPS gps-history-retry-1"]',
    );
    expect(retryButton).not.toBeNull();

    await act(async () => {
      retryButton!.click();
      await Promise.resolve();
    });

    expect(fakeState.retryGpsOperation).toHaveBeenCalledWith("gps-history-retry-1");

    await act(async () => root!.unmount());
    container.remove();
  });
});
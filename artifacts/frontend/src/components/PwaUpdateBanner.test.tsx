import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  updateServiceWorker: vi.fn<() => Promise<void>>(async () => {}),
  getPendingCount: vi.fn<() => Promise<number>>(async () => 0),
  triggerSync: vi.fn<() => Promise<void>>(async () => {}),
  offline: {
    isOnline: true,
    pendingCount: 0,
    syncStatus: "idle" as "idle" | "syncing" | "done" | "error",
    syncResult: null,
    triggerSync: vi.fn<() => Promise<void>>(async () => {}),
  },
}));

vi.mock("@/lib/pwaServiceWorker", () => ({
  usePwaServiceWorker: () => ({
    needRefresh: [true, vi.fn()],
    updateServiceWorker: harness.updateServiceWorker,
  }),
}));

vi.mock("@/contexts/OfflineContext", () => ({
  useOffline: () => harness.offline,
}));

vi.mock("@/lib/idb", () => ({
  getPendingCount: harness.getPendingCount,
}));

import PwaUpdateBanner from "./PwaUpdateBanner";

describe("bannière de mise à jour CoopDigital", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    harness.updateServiceWorker.mockReset().mockResolvedValue(undefined);
    harness.getPendingCount.mockReset().mockResolvedValue(0);
    harness.triggerSync.mockReset().mockResolvedValue(undefined);
    harness.offline = {
      isOnline: true,
      pendingCount: 0,
      syncStatus: "idle",
      syncResult: null,
      triggerSync: harness.triggerSync,
    };
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.useRealTimers();
  });

  it("repropose la mise à jour dix minutes après le report", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T12:00:00Z"));

    await act(async () => {
      root.render(createElement(PwaUpdateBanner));
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="button-pwa-update-later"]')?.click();
    });
    expect(container.querySelector('[data-testid="pwa-update-banner"]')).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    });
    expect(container.querySelector('[data-testid="pwa-update-banner"]')).not.toBeNull();
  });

  it("demande confirmation et synchronise les opérations avant le rechargement", async () => {
    harness.getPendingCount
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    await act(async () => {
      root.render(createElement(PwaUpdateBanner));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="button-pwa-update-now"]')?.click();
    });

    const confirmButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="button-confirm-pwa-update"]',
    );
    expect(confirmButton?.disabled).toBe(true);

    await act(async () => {
      container.querySelector<HTMLInputElement>('[data-testid="checkbox-pwa-work-saved"]')?.click();
    });
    expect(confirmButton?.disabled).toBe(false);

    await act(async () => {
      confirmButton?.click();
    });

    expect(harness.triggerSync).toHaveBeenCalledTimes(1);
    expect(harness.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it("ne recharge pas l’application si des opérations restent en attente", async () => {
    harness.getPendingCount
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1);

    await act(async () => {
      root.render(createElement(PwaUpdateBanner));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="button-pwa-update-now"]')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLInputElement>('[data-testid="checkbox-pwa-work-saved"]')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="button-confirm-pwa-update"]')?.click();
    });

    expect(harness.triggerSync).toHaveBeenCalledTimes(1);
    expect(harness.updateServiceWorker).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="pwa-update-error"]')?.textContent).toContain(
      "1 opération(s) restent à synchroniser",
    );
  });
});

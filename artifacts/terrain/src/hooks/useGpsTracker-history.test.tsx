// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useGpsTracker } from "./useGpsTracker";

describe("historique du tracker GPS", () => {
  it("conserve l'historique restauré pour permettre l'annulation après rechargement", async () => {
    let tracker: ReturnType<typeof useGpsTracker> | undefined;

    function Harness() {
      tracker = useGpsTracker();
      return null;
    }

    const container = document.createElement("div");
    const root: Root = createRoot(container);
    const initial = [
      { lat: 5.31, lon: -4.02, accuracy: 8, ts: 1 },
      { lat: 5.311, lon: -4.02, accuracy: 8, ts: 2 },
      { lat: 5.311, lon: -4.019, accuracy: 8, ts: 3 },
    ];
    const corrected = [
      { lat: 5.31, lon: -4.02, accuracy: 8, ts: 1 },
      { lat: 5.311, lon: -4.02, accuracy: 8, ts: 2 },
      { lat: 5.312, lon: -4.019, accuracy: 8, ts: 3 },
    ];

    await act(async () => {
      root.render(<Harness />);
    });
    await act(async () => {
      tracker!.restore(corrected, [initial]);
    });

    expect(tracker!.historyLength).toBe(1);
    expect(tracker!.canUndo).toBe(true);

    await act(async () => {
      tracker!.undoLastCorrection();
    });

    expect(tracker!.points).toEqual(initial);
    expect(tracker!.historyLength).toBe(0);
    root.unmount();
    container.remove();
  });
});
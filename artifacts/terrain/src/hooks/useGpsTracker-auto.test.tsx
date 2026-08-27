// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { useGpsTracker } from "./useGpsTracker";

describe("capture automatique du tracker GPS", () => {
  let tracker: ReturnType<typeof useGpsTracker> | undefined;
  let root: Root;
  let container: HTMLDivElement;

  function Harness() {
    tracker = useGpsTracker();
    return null;
  }

  async function renderTracker() {
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => {
      root.render(<Harness />);
    });
  }

  function point(lat: number, accuracy = 5) {
    return { lat, lon: -4.02, accuracy, ts: Date.now() };
  }

  it("capture le premier point puis respecte la distance minimale", async () => {
    await renderTracker();

    let pointNumber: number | null;
    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.31), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBe(1);
    expect(tracker!.points).toHaveLength(1);

    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.31003), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBeNull();
    expect(tracker!.points).toHaveLength(1);

    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.3101), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBe(2);
    expect(tracker!.points).toHaveLength(2);

    await act(async () => root.unmount());
    container.remove();
  });

  it("ignore une position imprécise sans bloquer la prochaine position valide", async () => {
    await renderTracker();

    await act(async () => {
      tracker!.captureAutoPoint(point(5.31), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });

    let pointNumber: number | null;
    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.3101, 20), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBeNull();

    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.3101, 10), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBe(2);
    expect(tracker!.points[1]?.accuracy).toBe(10);

    await act(async () => root.unmount());
    container.remove();
  });

  it("reprend depuis le dernier point d'un brouillon restauré", async () => {
    await renderTracker();

    await act(async () => {
      tracker!.restore([point(5.31), point(5.3101)]);
    });

    let pointNumber: number | null;
    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.31013), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBeNull();

    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.3102), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBe(3);

    await act(async () => root.unmount());
    container.remove();
  });
});
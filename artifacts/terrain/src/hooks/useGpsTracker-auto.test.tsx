// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGpsTracker } from "./useGpsTracker";

describe("capture automatique du tracker GPS", () => {
  let tracker: ReturnType<typeof useGpsTracker> | undefined;
  let root: Root;
  let container: HTMLDivElement;
  let positions: Array<{ success: PositionCallback; error: PositionErrorCallback }>;
  let watchPosition: ReturnType<typeof vi.fn>;
  let clearWatch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    positions = [];
    watchPosition = vi.fn((success: PositionCallback, error: PositionErrorCallback) => {
      positions.push({ success, error });
      return positions.length - 1;
    });
    clearWatch = vi.fn();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition, clearWatch },
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  function browserPosition(lat: number, accuracy = 5): GeolocationPosition {
    return {
      coords: {
        latitude: lat,
        longitude: -4.02,
        accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
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
    expect(tracker!.autoIgnoredAccuracy).toBe(20);

    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.3101, 10), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBe(2);
    expect(tracker!.points[1]?.accuracy).toBe(10);
    expect(tracker!.autoIgnoredAccuracy).toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it("conserve le dernier point capturé après une pause puis reprend à 8 mètres", async () => {
    await renderTracker();

    await act(async () => {
      tracker!.captureAutoPoint(point(5.31), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });

    // Pendant la pause, aucune position n'est proposée au captureur automatique.
    // Le dernier point de référence reste donc le premier point.
    expect(tracker!.points).toHaveLength(1);

    let pointNumber: number | null;
    await act(async () => {
      pointNumber = tracker!.captureAutoPoint(point(5.31008), {
        minDistanceM: 8,
        maxAccuracyM: 15,
      });
    });
    expect(pointNumber).toBe(2);
    expect(tracker!.points).toHaveLength(2);

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

  it("conserve les points et reprend le tracé automatique après un verrouillage", async () => {
    await renderTracker();

    await act(async () => {
      tracker!.startTracking();
      positions[0]!.success(browserPosition(5.31));
      tracker!.captureAutoPoint(point(5.31), { minDistanceM: 8, maxAccuracyM: 15 });
    });
    expect(tracker!.points).toHaveLength(1);
    expect(watchPosition).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(watchPosition).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(watchPosition).toHaveBeenCalledTimes(2);
    expect(clearWatch).toHaveBeenCalledWith(0);
    expect(tracker!.points).toHaveLength(1);

    await act(async () => {
      positions[1]!.success(browserPosition(5.31003));
      expect(tracker!.captureAutoPoint(point(5.31003), { minDistanceM: 8, maxAccuracyM: 15 })).toBeNull();
    });
    expect(tracker!.points).toHaveLength(1);

    await act(async () => {
      positions[1]!.success(browserPosition(5.3101));
      expect(tracker!.captureAutoPoint(point(5.3101), { minDistanceM: 8, maxAccuracyM: 15 })).toBe(2);
    });
    expect(tracker!.points).toHaveLength(2);

    await act(async () => root.unmount());
    container.remove();
  });

  it("ignore une position tardive de l'ancien watch après une reprise pageshow", async () => {
    await renderTracker();

    await act(async () => {
      tracker!.startTracking();
    });
    expect(watchPosition).toHaveBeenCalledTimes(1);

    await act(async () => {
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(clearWatch).toHaveBeenCalledWith(0);
    expect(watchPosition).toHaveBeenCalledTimes(2);
    expect(tracker!.currentPos).toBeNull();

    await act(async () => {
      positions[0]!.success(browserPosition(5.31));
    });
    expect(tracker!.currentPos).toBeNull();

    await act(async () => {
      positions[1]!.success(browserPosition(5.3101));
    });
    expect(tracker!.currentPos?.lat).toBe(5.3101);

    await act(async () => root.unmount());
    container.remove();
  });

  it("explique une permission perdue puis confirme la reprise après réautorisation", async () => {
    await renderTracker();

    await act(async () => {
      tracker!.startTracking();
      positions[0]!.error({
        code: 1,
        message: "Permission denied",
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      });
    });
    expect(tracker!.status).toBe("permission_denied");
    expect(tracker!.isTracking).toBe(false);
    expect(tracker!.error).toContain("Autorisation GPS refusée");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(watchPosition).toHaveBeenCalledTimes(2);
    expect(tracker!.status).toBe("tracking");
    expect(tracker!.error).toBeNull();

    await act(async () => {
      positions[1]!.success(browserPosition(5.31, 7));
    });
    expect(tracker!.status).toBe("tracking");
    expect(tracker!.accuracy).toBe(7);

    await act(async () => root.unmount());
    container.remove();
  });
});
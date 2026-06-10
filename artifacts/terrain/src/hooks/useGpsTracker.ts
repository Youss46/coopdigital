import { useState, useRef, useCallback } from "react";
import type { GpsPoint } from "../lib/types";

export { polygonAreaHa };

function polygonAreaHa(points: GpsPoint[]): number {
  if (points.length < 3) return 0;
  const R = 6371000;
  const lat0 = points[0].lat * Math.PI / 180;
  const xy = points.map((p) => ({
    x: (p.lon - points[0].lon) * Math.PI / 180 * R * Math.cos(lat0),
    y: (p.lat - points[0].lat) * Math.PI / 180 * R,
  }));
  let area = 0;
  const n = xy.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += xy[i].x * xy[j].y;
    area -= xy[j].x * xy[i].y;
  }
  return Math.abs(area) / 2 / 10000;
}

const THROTTLE_MS = 5000;

interface GpsTrackerState {
  points: GpsPoint[];
  currentPos: GpsPoint | null;
  isTracking: boolean;
  accuracy: number | null;
  error: string | null;
}

export function useGpsTracker() {
  const [state, setState] = useState<GpsTrackerState>({
    points: [],
    currentPos: null,
    isTracking: false,
    accuracy: null,
    error: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const lastPointTsRef = useRef<number>(0);
  const isTrackingRef = useRef(false);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: "Géolocalisation non disponible sur cet appareil" }));
      return;
    }
    isTrackingRef.current = true;
    setState((s) => ({ ...s, isTracking: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const pt: GpsPoint = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          ts: now,
        };
        setState((s) => {
          const next: GpsTrackerState = { ...s, currentPos: pt, accuracy: position.coords.accuracy };
          if (isTrackingRef.current && now - lastPointTsRef.current >= THROTTLE_MS) {
            lastPointTsRef.current = now;
            next.points = [...s.points, pt];
          }
          return next;
        });
      },
      (err) => {
        setState((s) => ({ ...s, error: `GPS : ${err.message}`, isTracking: false }));
        isTrackingRef.current = false;
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }, []);

  const stopTracking = useCallback(() => {
    isTrackingRef.current = false;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((s) => ({ ...s, isTracking: false }));
  }, []);

  const addCurrentPoint = useCallback(() => {
    setState((s) => {
      if (!s.currentPos) return s;
      lastPointTsRef.current = Date.now();
      return { ...s, points: [...s.points, s.currentPos] };
    });
  }, []);

  const undoLastPoint = useCallback(() => {
    setState((s) => ({ ...s, points: s.points.slice(0, -1) }));
  }, []);

  const clearPoints = useCallback(() => {
    setState((s) => ({ ...s, points: [] }));
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
    addCurrentPoint,
    undoLastPoint,
    clearPoints,
  };
}

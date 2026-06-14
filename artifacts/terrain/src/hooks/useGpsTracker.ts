import { useState, useRef, useCallback } from "react";
import type { GpsPoint } from "../lib/types";

export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6371000;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function polygonAreaHa(points: GpsPoint[]): number {
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

export function polygonPerimeterM(points: GpsPoint[], closed = false): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineDistance(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
  }
  if (closed && points.length >= 3) {
    total += haversineDistance(
      points[points.length - 1].lat, points[points.length - 1].lon,
      points[0].lat, points[0].lon,
    );
  }
  return total;
}

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

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: "Géolocalisation non disponible sur cet appareil" }));
      return;
    }
    setState((s) => ({ ...s, isTracking: true, error: null }));
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const pt: GpsPoint = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          ts: Date.now(),
        };
        setState((s) => ({ ...s, currentPos: pt, accuracy: position.coords.accuracy }));
      },
      (err) => {
        setState((s) => ({ ...s, error: `GPS : ${err.message}`, isTracking: false }));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((s) => ({ ...s, isTracking: false }));
  }, []);

  const addPoint = useCallback((point: GpsPoint) => {
    setState((s) => ({ ...s, points: [...s.points, point] }));
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
    addPoint,
    undoLastPoint,
    clearPoints,
  };
}

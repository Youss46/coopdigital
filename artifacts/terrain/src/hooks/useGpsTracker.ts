import { useState, useRef, useCallback, useEffect } from "react";
import { normalizeGpsPoint, type GpsPoint } from "../lib/types";

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

function orientation(a: GpsPoint, b: GpsPoint, c: GpsPoint): number {
  return (b.lon - a.lon) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lon - a.lon);
}

function segmentsIntersect(a: GpsPoint, b: GpsPoint, c: GpsPoint, d: GpsPoint): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const eps = 1e-10;
  return ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps))
    && ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps));
}

/** Détecte un contour qui se croise, en ignorant les côtés voisins. */
export function hasSelfIntersection(points: GpsPoint[]): boolean {
  if (points.length < 4) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    for (let j = i + 1; j < points.length; j++) {
      if (j === i || j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      const c = points[j]!;
      const d = points[(j + 1) % points.length]!;
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

interface GpsTrackerState {
  points: GpsPoint[];
  currentPos: GpsPoint | null;
  isTracking: boolean;
  status: "idle" | "tracking" | "permission_denied" | "signal_unavailable" | "unavailable";
  accuracy: number | null;
  autoIgnoredAccuracy: number | null;
  error: string | null;
}

function formatGpsError(error: GeolocationPositionError): {
  status: GpsTrackerState["status"];
  message: string;
} {
  if (error.code === error.PERMISSION_DENIED) {
    return {
      status: "permission_denied",
      message: "Autorisation GPS refusée. Autorisez la localisation dans les réglages puis déverrouillez à nouveau le téléphone pour reprendre le tracé.",
    };
  }
  if (error.code === error.POSITION_UNAVAILABLE) {
    return {
      status: "signal_unavailable",
      message: "Signal GPS indisponible. Le tracé déjà capturé est conservé ; la reprise se fera dès qu'une position sera disponible.",
    };
  }
  if (error.code === error.TIMEOUT) {
    return {
      status: "signal_unavailable",
      message: "Délai GPS dépassé. Attendez une position précise ; le tracé déjà capturé est conservé.",
    };
  }
  return {
    status: "signal_unavailable",
    message: `GPS indisponible${error.message ? ` : ${error.message}` : ""}. Le tracé déjà capturé est conservé.`,
  };
}

export interface AutoCaptureOptions {
  minDistanceM: number;
  maxAccuracyM: number;
}

export function useGpsTracker() {
  const [state, setState] = useState<GpsTrackerState>({
    points: [],
    currentPos: null,
    isTracking: false,
    status: "idle",
    accuracy: null,
    autoIgnoredAccuracy: null,
    error: null,
  });

  const watchIdRef = useRef<number | null>(null);
  const pointsRef = useRef<GpsPoint[]>([]);
  const historyRef = useRef<GpsPoint[][]>([]);
  const autoLastPointRef = useRef<GpsPoint | null>(null);
  const trackingRequestedRef = useRef(false);
  const trackingGenerationRef = useRef(0);
  const [historyLength, setHistoryLength] = useState(0);

  const recordBeforeChange = useCallback((points: GpsPoint[]) => {
    historyRef.current.push(points);
    setHistoryLength(historyRef.current.length);
  }, []);

  const startTracking = useCallback(() => {
    trackingRequestedRef.current = true;
    const generation = ++trackingGenerationRef.current;

    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (!navigator.geolocation) {
      setState((s) => ({
        ...s,
        isTracking: false,
        status: "unavailable",
        currentPos: null,
        accuracy: null,
        error: "Géolocalisation non disponible sur cet appareil. Vérifiez que le GPS est activé.",
      }));
      return;
    }

    setState((s) => ({
      ...s,
      isTracking: true,
      status: "tracking",
      currentPos: null,
      accuracy: null,
      error: null,
    }));

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        if (generation !== trackingGenerationRef.current) return;
        const pt: GpsPoint = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy,
          ts: Date.now(),
        };
        setState((s) => ({
          ...s,
          currentPos: pt,
          accuracy: position.coords.accuracy,
          isTracking: true,
          status: "tracking",
          error: null,
        }));
      },
      (err) => {
        if (generation !== trackingGenerationRef.current) return;
        const gpsError = formatGpsError(err);
        setState((s) => ({
          ...s,
          error: gpsError.message,
          status: gpsError.status,
          isTracking: false,
          currentPos: null,
          accuracy: null,
        }));
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
      );
    } catch {
      setState((s) => ({
        ...s,
        isTracking: false,
        status: "unavailable",
        currentPos: null,
        accuracy: null,
        error: "Impossible de démarrer le GPS. Vérifiez l'autorisation de localisation puis réessayez.",
      }));
    }
  }, []);

  const stopTracking = useCallback(() => {
    trackingRequestedRef.current = false;
    trackingGenerationRef.current += 1;
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((s) => ({ ...s, isTracking: false, status: "idle" }));
  }, []);

  useEffect(() => {
    const resumeTracking = () => {
      if (document.visibilityState === "hidden" || !trackingRequestedRef.current) return;
      startTracking();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") resumeTracking();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", resumeTracking);
    window.addEventListener("pageshow", resumeTracking);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", resumeTracking);
      window.removeEventListener("pageshow", resumeTracking);
      stopTracking();
    };
  }, [startTracking, stopTracking]);

  const addPoint = useCallback((point: GpsPoint) => {
    const normalizedPoint = normalizeGpsPoint(point);
    const nextPoints = [...pointsRef.current, point];
    recordBeforeChange(pointsRef.current);
    nextPoints[nextPoints.length - 1] = normalizedPoint;
    pointsRef.current = nextPoints;
    setState((s) => ({ ...s, points: nextPoints }));
  }, [recordBeforeChange]);

  /**
   * Ajoute une position au polygone uniquement si elle est suffisamment
   * précise et éloignée du dernier point capturé automatiquement.
   *
   * Le dernier point est conservé dans une ref afin que des positions GPS
   * successives ne dépendent pas d'un rendu React intermédiaire.
   * Retourne le numéro du point ajouté, ou null si la position est ignorée.
   */
  const captureAutoPoint = useCallback((point: GpsPoint, options: AutoCaptureOptions): number | null => {
    if ((point.accuracy ?? Infinity) > options.maxAccuracyM) {
      setState((s) => s.autoIgnoredAccuracy === point.accuracy
        ? s
        : { ...s, autoIgnoredAccuracy: point.accuracy ?? Infinity });
      return null;
    }

    setState((s) => s.autoIgnoredAccuracy === null ? s : { ...s, autoIgnoredAccuracy: null });

    const normalizedPoint = normalizeGpsPoint(point);
    const previous = autoLastPointRef.current;
    if (
      previous &&
      haversineDistance(previous.lat, previous.lon, normalizedPoint.lat, normalizedPoint.lon) < options.minDistanceM
    ) {
      return null;
    }

    const pointNumber = pointsRef.current.length + 1;
    autoLastPointRef.current = normalizedPoint;
    addPoint(normalizedPoint);
    return pointNumber;
  }, [addPoint]);

  const resetAutoCapture = useCallback(() => {
    autoLastPointRef.current = null;
  }, []);

  const insertPoint = useCallback((index: number, point: GpsPoint) => {
    const points = [...pointsRef.current];
    recordBeforeChange(pointsRef.current);
    points.splice(Math.max(0, Math.min(index, points.length)), 0, normalizeGpsPoint(point));
    pointsRef.current = points;
    setState((s) => ({ ...s, points }));
  }, [recordBeforeChange]);

  const replacePoint = useCallback((index: number, point: GpsPoint) => {
    if (index < 0 || index >= pointsRef.current.length) return;
    const points = [...pointsRef.current];
    recordBeforeChange(pointsRef.current);
    points[index] = normalizeGpsPoint(point);
    pointsRef.current = points;
    setState((s) => ({ ...s, points }));
  }, [recordBeforeChange]);

  const removePoint = useCallback((index: number) => {
    if (index < 0 || index >= pointsRef.current.length) return;
    recordBeforeChange(pointsRef.current);
    const points = pointsRef.current.filter((_, pointIndex) => pointIndex !== index);
    pointsRef.current = points;
    setState((s) => ({ ...s, points }));
  }, [recordBeforeChange]);

  const undoLastCorrection = useCallback(() => {
    const previousPoints = historyRef.current.pop();
    if (!previousPoints) return false;
    setHistoryLength(historyRef.current.length);
    pointsRef.current = previousPoints;
    setState((s) => ({ ...s, points: previousPoints }));
    return true;
  }, []);

  const clearPoints = useCallback(() => {
    historyRef.current = [];
    setHistoryLength(0);
    pointsRef.current = [];
    autoLastPointRef.current = null;
    setState((s) => ({ ...s, points: [], autoIgnoredAccuracy: null }));
  }, []);

  const clearHistory = useCallback(() => {
    historyRef.current = [];
    setHistoryLength(0);
  }, []);

  const restore = useCallback((points: GpsPoint[], history: GpsPoint[][] = []) => {
    const restoredPoints = points.map(normalizeGpsPoint);
    const restoredHistory = history.map((snapshot) => snapshot.map(normalizeGpsPoint));
    pointsRef.current = restoredPoints;
    historyRef.current = restoredHistory;
    autoLastPointRef.current = restoredPoints.at(-1) ?? null;
    setHistoryLength(restoredHistory.length);
    setState((s) => ({ ...s, points: restoredPoints }));
  }, []);

  return {
    ...state,
    startTracking,
    stopTracking,
    addPoint,
    captureAutoPoint,
    resetAutoCapture,
    insertPoint,
    replacePoint,
    removePoint,
    undoLastCorrection,
    // Kept as an alias for callers that only need to remove the last captured point.
    undoLastPoint: undoLastCorrection,
    canUndo: historyLength > 0,
    clearHistory,
    clearPoints,
    restore,
    history: historyRef.current,
    historyLength,
  };
}

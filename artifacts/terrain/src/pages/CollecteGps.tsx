import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { getMissionDetail, collecterParcelle } from "../lib/api";
import { deleteGpsDraft, getGpsDraft, saveGpsDraft } from "../lib/idb";
import { useOffline } from "../contexts/OfflineContext";
import {
  useGpsTracker,
  polygonAreaHa,
  polygonPerimeterM,
  haversineDistance,
  hasSelfIntersection,
} from "../hooks/useGpsTracker";
import OfflineBanner from "../components/OfflineBanner";
import type { MissionMembre } from "../lib/types";
import { GPS_CRS, type GpsPoint } from "../lib/types";

const MAX_PHOTOS = 3;
const MIN_PHOTOS = 2;
const STABILISATION_SEC = 3;
const PRECISION_SEUIL = 10;
const AUTO_PRECISION_SEUIL = 15;
const AUTO_DISTANCE_MIN = 8;
const PROBLEME_TYPES = ["Accès difficile", "Conflit foncier", "Parcelle inexistante", "Membre absent", "Autre"];

function fmtDist(m: number): string {
  if (m >= 1000) return (m / 1000).toFixed(2).replace(".", ",") + " km";
  return m.toFixed(1).replace(".", ",") + " m";
}
function fmtHa(ha: number): string {
  return ha.toFixed(2).replace(".", ",") + " ha";
}

function PolygonSvg({
  points,
  currentPos,
  selectedIndex,
  onSelectPoint,
  onMovePoint,
}: {
  points: GpsPoint[];
  currentPos: GpsPoint | null;
  selectedIndex: number | null;
  onSelectPoint: (index: number) => void;
  onMovePoint: (index: number, point: GpsPoint) => void;
}) {
  const W = 280;
  const H = 180;
  const allPts = [...points, ...(currentPos ? [currentPos] : [])];

  if (allPts.length === 0) {
    return (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0f172a", borderRadius: 12, color: "#475569" }}>
        <div style={{ fontSize: "2rem" }}>🛰️</div>
        <div style={{ fontSize: ".8rem", marginTop: 6 }}>En attente du GPS…</div>
      </div>
    );
  }

  const lats = allPts.map((p) => p.lat);
  const lons = allPts.map((p) => p.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const pad = 20;

  function toSvg(lat: number, lon: number) {
    const latR = maxLat - minLat || 0.00005;
    const lonR = maxLon - minLon || 0.00005;
    return {
      x: pad + ((lon - minLon) / lonR) * (W - pad * 2),
      y: pad + ((maxLat - lat) / latR) * (H - pad * 2),
    };
  }

  const svgPts = points.map((p) => toSvg(p.lat, p.lon));
  const currSvg = currentPos ? toSvg(currentPos.lat, currentPos.lon) : null;
  const polygonStr = svgPts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingIndexRef = useRef<number | null>(null);

  const pointFromEvent = (event: React.PointerEvent<SVGSVGElement>): GpsPoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(pad, Math.min(W - pad, event.clientX - rect.left));
    const y = Math.max(pad, Math.min(H - pad, event.clientY - rect.top));
    const latR = maxLat - minLat || 0.00005;
    const lonR = maxLon - minLon || 0.00005;
    return {
      lat: maxLat - ((y - pad) / (H - pad * 2)) * latR,
      lon: minLon + ((x - pad) / (W - pad * 2)) * lonR,
      accuracy: undefined,
      ts: Date.now(),
    };
  };

  return (
    <svg
      ref={svgRef}
      width={W}
      height={H}
      onPointerMove={(event) => {
        if (draggingIndexRef.current !== null) {
          const point = pointFromEvent(event);
          if (point) onMovePoint(draggingIndexRef.current, point);
        }
      }}
      onPointerUp={() => { draggingIndexRef.current = null; }}
      onPointerCancel={() => { draggingIndexRef.current = null; }}
      style={{ background: "#0f172a", borderRadius: 12, display: "block", touchAction: "none" }}
      aria-label="Aperçu interactif du polygone GPS"
    >
      {svgPts.length >= 3 && (
        <polygon points={polygonStr} fill="rgba(34,197,94,0.18)" stroke="#22c55e" strokeWidth="2" />
      )}
      {svgPts.length >= 2 && svgPts.length < 3 && (
        <polyline points={polygonStr} fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="5,4" />
      )}
      {svgPts.map((p, i) => (
        <g key={i} onClick={() => onSelectPoint(i)} style={{ cursor: "pointer" }}>
          <circle cx={p.x} cy={p.y} r={selectedIndex === i ? 9 : 7} fill={selectedIndex === i ? "#f59e0b" : "#22c55e"} stroke="#0f172a" strokeWidth={1.5} />
          <text x={p.x + 9} y={p.y + 4} fill={selectedIndex === i ? "#f59e0b" : "#22c55e"} fontSize="9" fontWeight="bold">P{i + 1}</text>
          <circle
            cx={p.x}
            cy={p.y}
            r={16}
            fill="transparent"
            onPointerDown={(event) => {
              event.stopPropagation();
              draggingIndexRef.current = i;
              onSelectPoint(i);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
          />
        </g>
      ))}
      {currSvg && (
        <>
          <circle cx={currSvg.x} cy={currSvg.y} r={10} fill="rgba(239,68,68,.2)" />
          <circle cx={currSvg.x} cy={currSvg.y} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
        </>
      )}
    </svg>
  );
}

type CapturePhase = null | "stabilizing" | "accuracy_warning";

export default function CollecteGps() {
  const params = useParams<{ id: string; membreId: string }>();
  const missionId = Number(params.id);
  const membreId = Number(params.membreId);
  const [, navigate] = useLocation();
  const { isOnline } = useOffline();

  const [membre, setMembre] = useState<MissionMembre | null>(null);
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [probleme, setProbleme] = useState<{ type: string; description: string } | null>(null);
  const [showProbleme, setShowProbleme] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLDivElement>(null);

  const gps = useGpsTracker();

  const [gpsFinalized, setGpsFinalized] = useState(false);
  const [showGpsRecap, setShowGpsRecap] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>(null);
  const [countdown, setCountdown] = useState(STABILISATION_SEC);
  const [lastCapture, setLastCapture] = useState<{ idx: number; acc: number } | null>(null);
  const [gpsErreurPoints, setGpsErreurPoints] = useState<string | null>(null);
  const [autoMode, setAutoMode] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentPosRef = useRef<GpsPoint | null>(null);
  const accuracyRef = useRef<number | null>(null);
  const lastCaptureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoLastPointRef = useRef<GpsPoint | null>(null);

  useEffect(() => { currentPosRef.current = gps.currentPos; }, [gps.currentPos]);
  useEffect(() => { accuracyRef.current = gps.accuracy; }, [gps.accuracy]);

  useEffect(() => {
    let active = true;
    Promise.all([
      getMissionDetail(missionId).then((d) => {
        if (active) {
          const m = d.membres.find((mb) => mb.membreId === membreId);
          setMembre(m ?? null);
        }
      }).catch(() => {}),
      getGpsDraft(missionId, membreId).then((draft) => {
        if (!active || !draft) return;
        gps.restore(draft.points, draft.history ?? []);
        setGpsFinalized(draft.finalized);
        setAutoMode(draft.autoMode);
        setAutoPaused(draft.autoPaused);
        autoLastPointRef.current = draft.points.at(-1) ?? null;
      }).catch(() => {}).finally(() => {
        if (active) setDraftLoaded(true);
      }),
    ]).finally(() => { if (active) setLoading(false); });
    gps.startTracking();
    return () => {
      active = false;
      gps.stopTracking();
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (lastCaptureTimerRef.current) clearTimeout(lastCaptureTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, membreId, gps.restore, gps.startTracking, gps.stopTracking]);

  useEffect(() => {
    if (!draftLoaded) return;
    void saveGpsDraft({
      key: `gps_draft_${missionId}_${membreId}`,
      missionId,
      membreId,
      points: gps.points,
      history: gps.history,
      finalized: gpsFinalized,
      autoMode,
      autoPaused,
    }).catch(() => {});
  }, [draftLoaded, missionId, membreId, gps.points, gps.historyLength, gpsFinalized, autoMode, autoPaused]);

  const doCapture = useCallback((pos: GpsPoint) => {
    const newIdx = gps.points.length + 1;
    gps.addPoint(pos);
    setCapturePhase(null);
    setGpsErreurPoints(null);
    setLastCapture({ idx: newIdx, acc: Math.round(pos.accuracy ?? 0) });
    if (lastCaptureTimerRef.current) clearTimeout(lastCaptureTimerRef.current);
    lastCaptureTimerRef.current = setTimeout(() => setLastCapture(null), 2500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gps.points.length, gps.addPoint]);

  const handleStartCapture = useCallback(() => {
    if (capturePhase !== null) return;
    if (!currentPosRef.current) return;
    setCapturePhase("stabilizing");
    setCountdown(STABILISATION_SEC);
    let remaining = STABILISATION_SEC;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        countdownRef.current = null;
        const pos = currentPosRef.current;
        const acc = accuracyRef.current;
        if (!pos) { setCapturePhase(null); return; }
        if (acc !== null && acc > PRECISION_SEUIL) {
          setCapturePhase("accuracy_warning");
        } else {
          doCapture(pos);
        }
      }
    }, 1000);
  }, [capturePhase, doCapture]);

  const handleCancelCapture = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCapturePhase(null);
  }, []);

  const handleCaptureAnyway = useCallback(() => {
    const pos = currentPosRef.current;
    if (!pos) { setCapturePhase(null); return; }
    doCapture(pos);
  }, [doCapture]);

  const handleStop = useCallback(() => {
    if (gps.points.length < 3) {
      const manquants = 3 - gps.points.length;
      setGpsErreurPoints(`Minimum 3 points requis. Ajoutez encore ${manquants} point${manquants > 1 ? "s" : ""}.`);
      return;
    }
    if (hasSelfIntersection(gps.points)) {
      setGpsErreurPoints("Le contour se croise. Supprimez ou corrigez les points avant de finaliser.");
      return;
    }
    if (polygonAreaHa(gps.points) < 0.0001) {
      setGpsErreurPoints("La superficie calculée est nulle ou trop faible. Vérifiez les points GPS.");
      return;
    }
    setAutoPaused(true);
    setSelectedPointIndex(null);
    setGpsErreurPoints(null);
    setShowGpsRecap(true);
  }, [gps.points.length]);

  const handleMovePoint = useCallback((index: number, point: GpsPoint) => {
    gps.replacePoint(index, point);
    setSelectedPointIndex(index);
  }, [gps.replacePoint]);

  const handleDeleteSelectedPoint = useCallback(() => {
    if (selectedPointIndex === null) return;
    gps.removePoint(selectedPointIndex);
    setSelectedPointIndex(null);
    setGpsErreurPoints(null);
  }, [gps.removePoint, selectedPointIndex]);

  const handleAddManualPoint = useCallback(() => {
    const point = currentPosRef.current;
    if (!point) {
      setGpsErreurPoints("Position GPS indisponible. Attendez l'acquisition du signal.");
      return;
    }
    const insertAt = selectedPointIndex === null ? gps.points.length : selectedPointIndex + 1;
    gps.insertPoint(insertAt, point);
    setSelectedPointIndex(insertAt);
    setGpsErreurPoints(null);
  }, [gps.insertPoint, gps.points.length, selectedPointIndex]);

  const handleUndoCorrection = useCallback(() => {
    if (!gps.undoLastCorrection()) return;
    setSelectedPointIndex(null);
    setLastCapture(null);
    setGpsErreurPoints(null);
  }, [gps.undoLastCorrection]);

  // Mode automatique : on conserve un point tous les quelques mètres, uniquement
  // lorsque la précision GPS est suffisante. Cela évite les zigzags du signal.
  useEffect(() => {
    if (!autoMode || autoPaused || gpsFinalized || !gps.currentPos) return;
    const pos = gps.currentPos;
    if ((pos.accuracy ?? Infinity) > AUTO_PRECISION_SEUIL) return;
    const previous = autoLastPointRef.current;
    if (previous && haversineDistance(previous.lat, previous.lon, pos.lat, pos.lon) < AUTO_DISTANCE_MIN) return;
    autoLastPointRef.current = pos;
    gps.addPoint(pos);
    setLastCapture({ idx: gps.points.length + 1, acc: Math.round(pos.accuracy ?? 0) });
    if (lastCaptureTimerRef.current) clearTimeout(lastCaptureTimerRef.current);
    lastCaptureTimerRef.current = setTimeout(() => setLastCapture(null), 1800);
  }, [autoMode, autoPaused, gpsFinalized, gps.currentPos, gps.points.length, gps.addPoint]);

  const toggleAutoMode = useCallback(() => {
    if (gps.points.length > 0) {
      setGpsErreurPoints("Le mode automatique se choisit avant le premier point. Recommencez le contour pour changer de mode.");
      return;
    }
    setAutoMode((current) => !current);
    setAutoPaused(false);
    autoLastPointRef.current = null;
  }, [gps.points.length]);

  const handleRecapValidate = useCallback(() => {
    setShowGpsRecap(false);
    setSelectedPointIndex(null);
    setGpsFinalized(true);
    setTimeout(() => {
      photosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
  }, []);

  const handleRecapRecommencer = useCallback(() => {
    gps.clearPoints();
    setGpsFinalized(false);
    setShowGpsRecap(false);
    setSelectedPointIndex(null);
    setGpsErreurPoints(null);
    setAutoPaused(false);
    autoLastPointRef.current = null;
  }, [gps]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX_DIM = 1200;
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, w, h);
      setPhotos((prev) => prev.length < MAX_PHOTOS ? [...prev, canvas.toDataURL("image/jpeg", 0.75)] : prev);
    };
    img.src = objectUrl;
    e.target.value = "";
  };

  const handleSubmit = async () => {
    if (gps.points.length < 3) { setErreur("Tracez au moins 3 points GPS pour délimiter la parcelle"); return; }
    if (hasSelfIntersection(gps.points)) { setErreur("Le contour se croise. Corrigez les points avant l'enregistrement."); return; }
    if (areaHa < 0.0001) { setErreur("La superficie calculée est nulle ou trop faible."); return; }
    if (ecartPct > 75 && !probleme?.type) {
      setErreur("La superficie GPS est très éloignée de la superficie déclarée. Vérifiez le contour ou signalez un problème terrain.");
      setShowProbleme(true);
      return;
    }
    if (photos.length < MIN_PHOTOS) { setErreur(`Ajoutez au moins ${MIN_PHOTOS} photos de la parcelle`); return; }
    setSubmitting(true);
    setErreur(null);
    try {
      const areaHa = polygonAreaHa(gps.points);
      await collecterParcelle(missionId, membreId, {
        crs: GPS_CRS,
        polygoneGps: gps.points,
        photos,
        notes: notes || undefined,
        superficieCalculeeHa: areaHa > 0 ? areaHa : undefined,
        probleme: showProbleme && probleme?.type ? probleme : undefined,
      }, isOnline);
      await deleteGpsDraft(missionId, membreId);
      gps.stopTracking();
      setSubmitted(true);
      setTimeout(() => navigate(`/missions/${missionId}`), 1800);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="t-app"><div className="t-spinner" /></div>;

  if (submitted) {
    return (
      <div className="t-app" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "3rem" }}>✅</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem", marginTop: 12, color: "#22c55e" }}>
            {isOnline ? "Parcelle collectée !" : "Sauvegardé hors ligne"}
          </div>
          <div style={{ fontSize: ".85rem", color: "#94a3b8", marginTop: 6 }}>
            {!isOnline && "Synchronisation automatique à la reconnexion"}
          </div>
        </div>
      </div>
    );
  }

  const areaHa = polygonAreaHa(gps.points);
  const perimeterM = polygonPerimeterM(gps.points);
  const declareeHa = membre?.superficieHa ? parseFloat(membre.superficieHa) : 0;
  const ecartHa = areaHa > 0 && declareeHa > 0 ? areaHa - declareeHa : null;
  const ecartPct = ecartHa !== null && declareeHa > 0 ? Math.abs(ecartHa) / declareeHa * 100 : 0;
  const ecartColor = ecartPct < 20 ? "#22c55e" : ecartPct < 40 ? "#f59e0b" : "#ef4444";
  const ecartIcon = ecartPct < 20 ? "✅" : ecartPct < 40 ? "⚠️" : "🔴";
  const accuracyColor = gps.accuracy === null ? "#64748b" : gps.accuracy <= 5 ? "#22c55e" : gps.accuracy <= 10 ? "#22c55e" : gps.accuracy <= 30 ? "#f59e0b" : "#ef4444";
  const avgAccuracy = gps.points.length > 0
    ? gps.points.reduce((s, p) => s + (p.accuracy ?? 0), 0) / gps.points.length
    : null;
  const imprecisPoints = gps.points.filter((p) => (p.accuracy ?? Infinity) > PRECISION_SEUIL).length;
  const canSubmit = gps.points.length >= 3 && photos.length >= MIN_PHOTOS;
  const selectedPoint = selectedPointIndex === null ? null : gps.points[selectedPointIndex] ?? null;

  return (
    <div className="t-app">
      {/* Guide visuel modal */}
      {showGuide && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 100, display: "flex", alignItems: "flex-end", padding: "0 0 0 0" }}>
          <div style={{ background: "#1e293b", borderRadius: "18px 18px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ fontWeight: 800, fontSize: "1.1rem", marginBottom: 16, color: "#f1f5f9" }}>📍 Comment mapper une parcelle</div>
            <ol style={{ paddingLeft: 20, color: "#cbd5e1", fontSize: ".9rem", lineHeight: 1.9, margin: "0 0 16px" }}>
              <li>Choisissez le mode <strong style={{ color: "#60a5fa" }}>Automatique</strong> ou Manuel</li>
              <li>En automatique, marchez simplement autour de la parcelle</li>
              <li>En manuel, arrêtez-vous à chaque angle et appuyez sur <strong style={{ color: "#22c55e" }}>+ Point</strong></li>
              <li>Appuyez sur <strong style={{ color: "#f59e0b" }}>Arrêter</strong> pour finaliser</li>
            </ol>
            <div style={{ background: "#0f172a", borderRadius: 10, padding: "10px 14px", fontSize: ".8rem", color: "#94a3b8", marginBottom: 20, lineHeight: 1.7 }}>
               💡 <strong>Conseils :</strong> Téléphone sorti de la poche · En automatique, marchez lentement · Précision idéale ≤ 10 m
            </div>
            <button
              onClick={() => setShowGuide(false)}
              className="t-btn t-btn--primary"
              style={{ width: "100%", padding: "13px", fontSize: ".95rem" }}
            >
              J'ai compris ✅
            </button>
          </div>
        </div>
      )}

      {/* Recap modal */}
      {showGpsRecap && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#1e293b", borderRadius: "18px 18px 0 0", padding: "20px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto", maxHeight: "85vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 16, color: "#22c55e" }}>POLYGONE FINALISÉ ✅</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <PolygonSvg
                points={gps.points}
                currentPos={null}
                selectedIndex={selectedPointIndex}
                onSelectPoint={setSelectedPointIndex}
                onMovePoint={handleMovePoint}
              />
            </div>
            <div style={{ background: "#0f172a", borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: ".76rem", color: "#94a3b8", lineHeight: 1.5 }}>
              Touchez un point pour le sélectionner, puis faites-le glisser pour corriger sa position.
            </div>
            {selectedPointIndex !== null && (
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button onClick={handleDeleteSelectedPoint} className="t-btn t-btn--ghost" style={{ flex: 1, padding: "9px", color: "#f87171", borderColor: "#ef444466" }}>
                  Supprimer P{selectedPointIndex + 1}
                </button>
                <button onClick={handleAddManualPoint} className="t-btn" style={{ flex: 1, padding: "9px", color: "#60a5fa", background: "#2563eb22", border: "1px solid #2563eb66" }}>
                  + Ajouter après
                </button>
              </div>
            )}
             {selectedPoint && (
              <div style={{ color: "#64748b", fontSize: ".72rem", marginBottom: 12 }}>
                P{selectedPointIndex! + 1} sélectionné · {selectedPoint.lat.toFixed(6)}, {selectedPoint.lon.toFixed(6)}
              </div>
            )}
             {gps.canUndo && (
               <button
                 onClick={handleUndoCorrection}
                 className="t-btn t-btn--ghost"
                 style={{ width: "100%", padding: "9px", fontSize: ".82rem", marginBottom: 14, color: "#fbbf24", borderColor: "#f59e0b66" }}
               >
                 ↩ Annuler la dernière correction
               </button>
             )}
            {membre && (
              <div style={{ fontSize: ".85rem", color: "#94a3b8", marginBottom: 14, lineHeight: 1.8 }}>
                <div><strong style={{ color: "#e2e8f0" }}>Membre :</strong> {membre.membreNom} {membre.membrePrenoms}</div>
                <div><strong style={{ color: "#e2e8f0" }}>Village :</strong> {membre.membreVillage ?? "—"}</div>
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
              {[
                ["Points capturés", `${gps.points.length}`],
                ["Précision moy.", avgAccuracy ? `±${avgAccuracy.toFixed(1)} m` : "—"],
                ["Points imprécis", `${imprecisPoints}`],
                ["Périmètre", fmtDist(polygonPerimeterM(gps.points, true))],
                ["Superficie calculée", areaHa > 0 ? fmtHa(areaHa) : "—"],
                ...(declareeHa > 0 ? [
                  ["Superficie déclarée", fmtHa(declareeHa)],
                  ["Écart", ecartHa !== null ? `${ecartHa >= 0 ? "+" : ""}${fmtHa(ecartHa)} ${ecartIcon}` : "—"],
                ] : []),
              ].map(([label, value]) => (
                <div key={label} style={{ background: "#0f172a", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ fontSize: ".7rem", color: "#64748b" }}>{label}</div>
                  <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#e2e8f0", marginTop: 2 }}>{value}</div>
                </div>
              ))}
            </div>
            {ecartHa !== null && (
              <div style={{ background: `${ecartColor}22`, border: `1px solid ${ecartColor}44`, borderRadius: 8, padding: "8px 12px", fontSize: ".8rem", color: ecartColor, marginBottom: 14 }}>
                {ecartPct < 20 ? "Superficie conforme à la déclaration." : ecartPct < 40 ? "Écart important. Vérifiez que tous les angles sont bien capturés." : "Écart très important. Recommencez le mapping ou vérifiez les points."}
              </div>
            )}
            {imprecisPoints > 0 && (
              <div style={{ background: "#f59e0b22", border: "1px solid #f59e0b44", borderRadius: 8, padding: "8px 12px", fontSize: ".8rem", color: "#fbbf24", marginBottom: 14 }}>
                ⚠️ {imprecisPoints} point{imprecisPoints > 1 ? "s" : ""} avec une précision supérieure à {PRECISION_SEUIL} m. Vérifiez le contour avant de confirmer.
              </div>
            )}
            {ecartPct > 75 && (
              <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 8, padding: "8px 12px", fontSize: ".8rem", color: "#fca5a5", marginBottom: 14 }}>
                🔴 Écart très important avec la superficie déclarée. Corrigez le contour ou indiquez un problème terrain avant l’enregistrement.
              </div>
            )}
            <div style={{ fontSize: ".8rem", color: "#64748b", marginBottom: 8 }}>Détail des côtés :</div>
            <div style={{ marginBottom: 18 }}>
              {gps.points.map((pt, i) => {
                const nextIdx = (i + 1) % gps.points.length;
                const next = gps.points[nextIdx];
                const dist = haversineDistance(pt.lat, pt.lon, next.lat, next.lon);
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: ".82rem", color: "#cbd5e1", padding: "4px 0", borderBottom: "1px solid #1e3a5f" }}>
                    <span>P{i + 1} → P{nextIdx + 1}</span>
                    <span style={{ color: "#94a3b8" }}>{fmtDist(dist)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleRecapRecommencer} className="t-btn t-btn--ghost" style={{ flex: 1, padding: "12px" }}>
                🗑 Recommencer
              </button>
              <button onClick={handleRecapValidate} className="t-btn t-btn--primary" style={{ flex: 2, padding: "12px" }}>
                ✅ Valider → Photos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Accuracy warning overlay */}
      {capturePhase === "accuracy_warning" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 90, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#1e293b", borderRadius: "18px 18px 0 0", padding: "24px 20px 36px", width: "100%", maxWidth: 480, margin: "0 auto" }}>
            <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: "1rem", marginBottom: 10 }}>
              ⚠️ Précision faible (±{gps.accuracy?.toFixed(0)}m)
            </div>
            <div style={{ color: "#94a3b8", fontSize: ".88rem", marginBottom: 20, lineHeight: 1.7 }}>
              La précision GPS est insuffisante pour ce point. Attendez que le signal s'améliore, ou capturez quand même.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleCancelCapture} className="t-btn t-btn--ghost" style={{ flex: 1, padding: "12px" }}>
                Attendre
              </button>
              <button onClick={handleCaptureAnyway} className="t-btn" style={{ flex: 2, padding: "12px", background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>
                Capturer quand même
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="t-header">
        <button
          onClick={() => { gps.stopTracking(); navigate(`/missions/${missionId}`); }}
          style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, color: "#fff", padding: "6px 10px", marginRight: 10, cursor: "pointer" }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div className="t-header__title" style={{ fontSize: ".9rem" }}>
            {membre ? `${membre.membreNom} ${membre.membrePrenoms}` : "Collecte GPS"}
          </div>
          <div className="t-header__sub">
            {membre?.membreVillage ?? "—"}
            {declareeHa > 0 ? ` · Déclarée : ${fmtHa(declareeHa)}` : ""}
          </div>
        </div>
        {gps.accuracy !== null && (
          <span style={{ fontSize: ".75rem", color: accuracyColor, fontWeight: 600, whiteSpace: "nowrap" }}>
            ±{gps.accuracy.toFixed(0)}m {gps.accuracy <= 10 ? "🟢" : gps.accuracy <= 30 ? "🟡" : "🔴"}
          </span>
        )}
        <button
          onClick={() => setShowGuide(true)}
          style={{ background: "rgba(255,255,255,.1)", border: "none", borderRadius: 8, color: "#94a3b8", padding: "6px 10px", marginLeft: 8, cursor: "pointer", fontSize: ".85rem" }}
        >
          ?
        </button>
      </header>

      <OfflineBanner />

      <main className="t-main">
        {/* GPS Section */}
        {!gpsFinalized ? (
          <div className="t-card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div className="t-card__title">🛰️ Polygone GPS</div>
              <span style={{ fontSize: ".72rem", color: "#64748b" }}>
                {gps.points.length} point{gps.points.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
               <PolygonSvg
                 points={gps.points}
                 currentPos={gps.currentPos}
                 selectedIndex={selectedPointIndex}
                 onSelectPoint={setSelectedPointIndex}
                 onMovePoint={handleMovePoint}
               />
            </div>
             {gps.points.length > 0 && (
               <div style={{ background: "#0f172a", borderRadius: 8, padding: "8px 10px", marginBottom: 10, fontSize: ".76rem", color: "#94a3b8", lineHeight: 1.5 }}>
                 Touchez un point pour le sélectionner, puis faites-le glisser pour le déplacer. Les corrections restent locales et disponibles hors ligne.
               </div>
             )}
             {selectedPointIndex !== null && (
               <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                 <button onClick={handleDeleteSelectedPoint} className="t-btn t-btn--ghost" style={{ flex: 1, padding: "9px", color: "#f87171", borderColor: "#ef444466", fontSize: ".78rem" }}>
                   Supprimer P{selectedPointIndex + 1}
                 </button>
                 <button onClick={handleAddManualPoint} className="t-btn" style={{ flex: 1, padding: "9px", color: "#60a5fa", background: "#2563eb22", border: "1px solid #2563eb66", fontSize: ".78rem" }}>
                   + Ajouter après
                 </button>
               </div>
             )}

            {gps.error && (
              <div style={{ color: "#ef4444", fontSize: ".82rem", marginBottom: 8, textAlign: "center" }}>{gps.error}</div>
            )}

            {/* Stats temps réel */}
            {gps.points.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                <div style={{ background: "#0f172a", borderRadius: 8, padding: "7px 10px" }}>
                  <div style={{ fontSize: ".65rem", color: "#64748b" }}>Points</div>
                  <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#e2e8f0" }}>{gps.points.length}</div>
                </div>
                <div style={{ background: "#0f172a", borderRadius: 8, padding: "7px 10px" }}>
                  <div style={{ fontSize: ".65rem", color: "#64748b" }}>Périmètre</div>
                  <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#e2e8f0" }}>{perimeterM > 0 ? fmtDist(perimeterM) : "—"}</div>
                </div>
                {areaHa > 0 && (
                  <div style={{ background: "#0f172a", borderRadius: 8, padding: "7px 10px" }}>
                    <div style={{ fontSize: ".65rem", color: "#64748b" }}>Superficie estimée</div>
                    <div style={{ fontSize: ".9rem", fontWeight: 700, color: "#22c55e" }}>{fmtHa(areaHa)}</div>
                  </div>
                )}
                {declareeHa > 0 && areaHa > 0 && ecartHa !== null && (
                  <div style={{ background: "#0f172a", borderRadius: 8, padding: "7px 10px" }}>
                    <div style={{ fontSize: ".65rem", color: "#64748b" }}>Écart vs déclarée</div>
                    <div style={{ fontSize: ".9rem", fontWeight: 700, color: ecartColor }}>
                      {ecartHa >= 0 ? "+" : ""}{fmtHa(ecartHa)} {ecartIcon}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Liste des points */}
            {gps.points.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: ".72rem", color: "#64748b", marginBottom: 6 }}>Liste des points :</div>
                {gps.points.map((pt, i) => {
                  const distFromPrev = i > 0
                    ? haversineDistance(gps.points[i - 1].lat, gps.points[i - 1].lon, pt.lat, pt.lon)
                    : null;
                  return (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #1e3a5f", fontSize: ".8rem" }}>
                      <span style={{ color: "#22c55e" }}>P{i + 1} ✅ ±{pt.accuracy?.toFixed(0) ?? "?"}m</span>
                      {distFromPrev !== null && (
                        <span style={{ color: "#64748b", fontSize: ".75rem" }}>← {fmtDist(distFromPrev)} depuis P{i}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Confirmation de capture */}
            {lastCapture && (
              <div style={{ background: "#22c55e22", border: "1px solid #22c55e44", borderRadius: 8, padding: "8px 12px", fontSize: ".82rem", color: "#22c55e", marginBottom: 10, textAlign: "center" }}>
                ✅ Point {lastCapture.idx} ajouté — Précision ±{lastCapture.acc} m
              </div>
            )}

            {/* Erreur points insuffisants */}
            {gpsErreurPoints && (
              <div style={{ background: "#ef444422", border: "1px solid #ef444444", borderRadius: 8, padding: "8px 12px", fontSize: ".82rem", color: "#ef4444", marginBottom: 10 }}>
                {gpsErreurPoints}
              </div>
            )}

             {/* Annuler la dernière action de tracé */}
             {gps.canUndo && (
              <button
                 onClick={handleUndoCorrection}
                className="t-btn t-btn--ghost"
                style={{ width: "100%", padding: "9px", fontSize: ".82rem", marginBottom: 10 }}
              >
                 ↩ Annuler la dernière correction
              </button>
            )}

            {gps.points.length === 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <button
                  onClick={toggleAutoMode}
                  className="t-btn"
                  style={{ flex: 1, padding: "9px", fontSize: ".8rem", background: autoMode ? "#2563eb22" : "#0f172a", color: autoMode ? "#60a5fa" : "#94a3b8", border: `1px solid ${autoMode ? "#2563eb66" : "#334155"}`, fontWeight: 700 }}
                >
                  {autoMode ? "✓ Automatique" : "Automatique"}
                </button>
                <button
                  onClick={toggleAutoMode}
                  className="t-btn"
                  style={{ flex: 1, padding: "9px", fontSize: ".8rem", background: !autoMode ? "#22c55e22" : "#0f172a", color: !autoMode ? "#22c55e" : "#94a3b8", border: `1px solid ${!autoMode ? "#22c55e66" : "#334155"}`, fontWeight: 700 }}
                >
                  {!autoMode ? "✓ Manuel" : "Manuel"}
                </button>
              </div>
            )}
            {autoMode && gps.points.length > 0 && (
              <div style={{ background: "#2563eb18", border: "1px solid #2563eb44", borderRadius: 8, padding: "8px 10px", fontSize: ".78rem", color: "#60a5fa", marginBottom: 10 }}>
                🛰️ Tracé automatique actif — marchez autour de la parcelle. Un point est ajouté tous les {AUTO_DISTANCE_MIN} m environ.
              </div>
            )}

            {/* Boutons principaux */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleStop}
                className="t-btn"
                style={{ flex: 1, padding: "12px", background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44", fontWeight: 700 }}
              >
                ⏹ Arrêter
              </button>

              {autoMode && gps.points.length > 0 ? (
                <button
                  onClick={() => setAutoPaused((paused) => !paused)}
                  className="t-btn"
                  style={{ flex: 2, padding: "12px", background: autoPaused ? "#22c55e22" : "#2563eb22", color: autoPaused ? "#22c55e" : "#60a5fa", border: `1px solid ${autoPaused ? "#22c55e44" : "#2563eb44"}`, fontWeight: 700 }}
                >
                  {autoPaused ? "▶ Reprendre le tracé" : "Ⅱ Pause"}
                </button>
              ) : capturePhase === "stabilizing" ? (
                <button
                  disabled
                  className="t-btn"
                  style={{ flex: 2, padding: "12px", background: "#1e3a5f", color: "#3b82f6", fontWeight: 700, cursor: "not-allowed" }}
                >
                  📍 Stabilisation… {countdown}s
                </button>
              ) : (
                <button
                  onClick={handleStartCapture}
                  disabled={!gps.currentPos || capturePhase !== null}
                  className="t-btn"
                  style={{ flex: 2, padding: "12px", background: "#22c55e22", color: "#22c55e", border: "1px solid #22c55e44", fontWeight: 700, opacity: gps.currentPos ? 1 : 0.4 }}
                >
                  + Point 📍
                </button>
              )}
            </div>
          </div>
        ) : (
          /* GPS finalisé — résumé compact */
          <div className="t-card" style={{ marginBottom: 12, border: "1px solid #22c55e44" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 700, color: "#22c55e" }}>🛰️ Polygone validé ✅</div>
              <button
                onClick={() => setGpsFinalized(false)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: ".8rem" }}
              >
                Modifier
              </button>
            </div>
            <div style={{ display: "flex", gap: 16, fontSize: ".82rem", color: "#94a3b8" }}>
              <span>{gps.points.length} points</span>
              {areaHa > 0 && <span style={{ color: "#22c55e", fontWeight: 600 }}>{fmtHa(areaHa)}</span>}
              {ecartHa !== null && <span style={{ color: ecartColor }}>{ecartHa >= 0 ? "+" : ""}{fmtHa(ecartHa)} {ecartIcon}</span>}
            </div>
          </div>
        )}

        {/* Photos */}
        <div ref={photosRef} className="t-card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="t-card__title">
              📷 Photos ({photos.length}/{MAX_PHOTOS})
              {photos.length < MIN_PHOTOS && (
                <span style={{ color: "#ef4444", fontSize: ".72rem", marginLeft: 6, fontWeight: 400 }}>
                  min. {MIN_PHOTOS} requises
                </span>
              )}
            </div>
            {photos.length < MAX_PHOTOS && (
              <button
                onClick={() => photoInputRef.current?.click()}
                style={{ background: "#1e3a5f", border: "none", borderRadius: 7, color: "#3b82f6", padding: "6px 10px", fontSize: ".8rem", cursor: "pointer" }}
              >
                + Ajouter
              </button>
            )}
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            style={{ display: "none" }}
          />
          {photos.length === 0 ? (
            <div
              onClick={() => photoInputRef.current?.click()}
              style={{ border: "2px dashed #ef444466", borderRadius: 10, padding: "20px", textAlign: "center", color: "#ef4444", cursor: "pointer" }}
            >
              📷 Photographier la parcelle (min. {MIN_PHOTOS})
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={p} alt={`Photo ${i + 1}`} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} />
                  <button
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", color: "#fff", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", fontSize: ".7rem", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="t-card" style={{ marginBottom: 12 }}>
          <div className="t-card__title" style={{ marginBottom: 8 }}>📝 Notes (optionnel)</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observations sur la parcelle…"
            rows={3}
            style={{ width: "100%", background: "#1a2035", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: ".85rem", resize: "none", boxSizing: "border-box" }}
          />
        </div>

        {/* Problème */}
        <div className="t-card" style={{ marginBottom: 16 }}>
          <button
            onClick={() => setShowProbleme((v) => !v)}
            style={{ background: "none", border: "none", color: "#f59e0b", cursor: "pointer", fontSize: ".85rem", fontWeight: 600, padding: 0 }}
          >
            {showProbleme ? "▲" : "▼"} Signaler un problème
          </button>
          {showProbleme && (
            <div style={{ marginTop: 10 }}>
              <select
                value={probleme?.type ?? ""}
                onChange={(e) => setProbleme((p) => ({ type: e.target.value, description: p?.description ?? "" }))}
                style={{ width: "100%", background: "#1a2035", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: ".85rem", marginBottom: 8 }}
              >
                <option value="">— Type de problème —</option>
                {PROBLEME_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea
                value={probleme?.description ?? ""}
                onChange={(e) => setProbleme((p) => ({ type: p?.type ?? "", description: e.target.value }))}
                placeholder="Description du problème…"
                rows={2}
                style={{ width: "100%", background: "#1a2035", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: ".85rem", resize: "none", boxSizing: "border-box" }}
              />
            </div>
          )}
        </div>

        {erreur && <div className="t-error" style={{ marginBottom: 12 }}>{erreur}</div>}

        <button
          onClick={handleSubmit}
          disabled={submitting || !canSubmit}
          className="t-btn t-btn--primary"
          style={{ width: "100%", padding: "14px", fontSize: "1rem", opacity: canSubmit ? 1 : .5 }}
        >
          {submitting
            ? "Enregistrement…"
            : gps.points.length < 3
              ? `GPS : ${gps.points.length}/3 points minimum`
              : photos.length < MIN_PHOTOS
                ? `📷 ${photos.length}/${MIN_PHOTOS} photos requises`
                : "✅ Valider la collecte"}
        </button>

        <div style={{ height: 20 }} />
      </main>
    </div>
  );
}

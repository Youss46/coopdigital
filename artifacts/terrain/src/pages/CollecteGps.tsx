import { useEffect, useRef, useState } from "react";
import { useParams, useLocation } from "wouter";
import { getMissionDetail, collecterParcelle } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import { useGpsTracker, polygonAreaHa } from "../hooks/useGpsTracker";
import OfflineBanner from "../components/OfflineBanner";
import type { MissionMembre } from "../lib/types";
import type { GpsPoint } from "../lib/types";

const MAX_PHOTOS = 3;
const MIN_PHOTOS = 2;

const PROBLEME_TYPES = ["Accès difficile", "Conflit foncier", "Parcelle inexistante", "Membre absent", "Autre"];

function PolygonSvg({ points, currentPos }: { points: GpsPoint[]; currentPos: GpsPoint | null }) {
  const W = 280;
  const H = 200;
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

  return (
    <svg width={W} height={H} style={{ background: "#0f172a", borderRadius: 12, display: "block" }}>
      {svgPts.length >= 3 && (
        <polygon points={polygonStr} fill="rgba(34,197,94,0.2)" stroke="#22c55e" strokeWidth="2" />
      )}
      {svgPts.length >= 2 && svgPts.length < 3 && (
        <polyline points={polygonStr} fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="5,4" />
      )}
      {svgPts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill="#22c55e" stroke="#0f172a" strokeWidth={1.5} />
      ))}
      {currSvg && (
        <>
          <circle cx={currSvg.x} cy={currSvg.y} r={10} fill="rgba(239,68,68,.2)" />
          <circle cx={currSvg.x} cy={currSvg.y} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
        </>
      )}
      {svgPts.length === 0 && currSvg && (
        <circle cx={currSvg.x} cy={currSvg.y} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />
      )}
    </svg>
  );
}

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

  const gps = useGpsTracker();
  const areaHa = polygonAreaHa(gps.points);

  useEffect(() => {
    getMissionDetail(missionId)
      .then((d) => {
        const m = d.membres.find((mb) => mb.membreId === membreId);
        setMembre(m ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => { gps.stopTracking(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId, membreId]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = reader.result as string;
      setPhotos((prev) => prev.length < MAX_PHOTOS ? [...prev, b64] : prev);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const canSubmit = gps.points.length >= 3 && photos.length >= MIN_PHOTOS;

  const handleSubmit = async () => {
    if (gps.points.length < 3) {
      setErreur("Tracez au moins 3 points GPS pour délimiter la parcelle");
      return;
    }
    if (photos.length < MIN_PHOTOS) {
      setErreur(`Ajoutez au moins ${MIN_PHOTOS} photos de la parcelle`);
      return;
    }
    setSubmitting(true);
    setErreur(null);
    try {
      await collecterParcelle(missionId, membreId, {
        polygoneGps: gps.points,
        photos,
        notes: notes || undefined,
        superficieCalculeeHa: areaHa > 0 ? areaHa : undefined,
        probleme: showProbleme && probleme?.type ? probleme : undefined,
      }, isOnline);
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

  return (
    <div className="t-app">
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
            {membre?.superficieHa ? ` · ${parseFloat(membre.superficieHa).toFixed(2)} ha déclaré` : ""}
          </div>
        </div>
      </header>

      <OfflineBanner />

      <main className="t-main">
        {/* GPS Section */}
        <div className="t-card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="t-card__title">🛰️ Polygone GPS</div>
            {gps.accuracy !== null && (
              <span style={{ fontSize: ".72rem", color: gps.accuracy < 10 ? "#22c55e" : gps.accuracy < 30 ? "#f59e0b" : "#ef4444" }}>
                ±{gps.accuracy.toFixed(0)} m
              </span>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
            <PolygonSvg points={gps.points} currentPos={gps.currentPos} />
          </div>

          {areaHa > 0 && (
            <div style={{ textAlign: "center", fontSize: "1.1rem", fontWeight: 700, color: "#22c55e", marginBottom: 10 }}>
              {areaHa.toFixed(4)} ha · {gps.points.length} points
            </div>
          )}

          {gps.error && (
            <div style={{ color: "#ef4444", fontSize: ".82rem", marginBottom: 8, textAlign: "center" }}>{gps.error}</div>
          )}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {!gps.isTracking ? (
              <button
                onClick={gps.startTracking}
                className="t-btn t-btn--primary"
                style={{ flex: 1, padding: "10px" }}
              >
                ▶ Démarrer GPS
              </button>
            ) : (
              <button
                onClick={gps.stopTracking}
                className="t-btn"
                style={{ flex: 1, padding: "10px", background: "#f59e0b", color: "#000" }}
              >
                ⏸ Arrêter
              </button>
            )}
            <button
              onClick={gps.addCurrentPoint}
              disabled={!gps.currentPos}
              className="t-btn"
              style={{ flex: 1, padding: "10px", background: "#22c55e33", color: "#22c55e", opacity: gps.currentPos ? 1 : .4 }}
            >
              + Point
            </button>
            <button
              onClick={gps.undoLastPoint}
              disabled={gps.points.length === 0}
              className="t-btn t-btn--ghost"
              style={{ padding: "10px 14px", opacity: gps.points.length > 0 ? 1 : .4 }}
            >
              ↩
            </button>
            <button
              onClick={gps.clearPoints}
              disabled={gps.points.length === 0}
              className="t-btn t-btn--ghost"
              style={{ padding: "10px 14px", opacity: gps.points.length > 0 ? 1 : .4 }}
            >
              🗑
            </button>
          </div>
        </div>

        {/* Photos */}
        <div className="t-card" style={{ marginBottom: 12 }}>
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
              onClick={() => photos.length < MAX_PHOTOS && photoInputRef.current?.click()}
              style={{ border: "2px dashed #ef444466", borderRadius: 10, padding: "20px", textAlign: "center", color: "#ef4444", cursor: "pointer" }}
            >
              📷 Photographier la parcelle (min. {MIN_PHOTOS})
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {photos.map((p, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img
                    src={p}
                    alt={`Photo ${i + 1}`}
                    style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }}
                  />
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

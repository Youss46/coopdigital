import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { MapPin, CheckCircle, XCircle, Clock } from "lucide-react";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
  iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
  shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface GpsPoint { lat: number; lon: number; ts?: number; accuracy?: number; }

export interface MembreMissionCarte {
  membreId: number;
  statut: string;
  gpsCollecte: unknown;
  nom: string;
  prenoms: string;
  village: string | null;
  nombreParcelles: number | null;
  dateCollecte: string | null;
  notesAgent: string | null;
  motifRejet: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePolygon(raw: unknown): [number, number][] | null {
  if (!raw || !Array.isArray(raw)) return null;
  const pts = raw as GpsPoint[];
  if (pts.length < 3) return null;
  const pairs = pts.map((p) => [p.lat, p.lon] as [number, number]);
  if (pairs.some(([la, lo]) => typeof la !== "number" || typeof lo !== "number")) return null;
  return pairs;
}

function centroid(pts: [number, number][]): [number, number] {
  const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lat, lng];
}

const COLORS: Record<string, { stroke: string; fill: string; fillOpacity: number; label: string }> = {
  en_attente: { stroke: "#9ca3af", fill: "#9ca3af", fillOpacity: 0.12, label: "En attente" },
  collecte:   { stroke: "#16a34a", fill: "#22c55e", fillOpacity: 0.32, label: "Collecté" },
  valide:     { stroke: "#2563eb", fill: "#3b82f6", fillOpacity: 0.28, label: "Validé" },
  rejete:     { stroke: "#dc2626", fill: "#ef4444", fillOpacity: 0.22, label: "Rejeté" },
};

function statusColor(statut: string) {
  return COLORS[statut] ?? COLORS["en_attente"];
}

// ── Auto-fit bounds ───────────────────────────────────────────────────────────

function FitBounds({ polygons }: { polygons: [number, number][][] }) {
  const map = useMap();
  useEffect(() => {
    if (polygons.length === 0) return;
    const all: [number, number][] = polygons.flat();
    if (all.length === 0) return;
    try {
      map.fitBounds(L.latLngBounds(all), { padding: [32, 32], maxZoom: 16 });
    } catch { /* ignore */ }
  }, [map, polygons]);
  return null;
}

// ── Légende ───────────────────────────────────────────────────────────────────

function Legende() {
  return (
    <div className="absolute bottom-6 left-3 z-[1000] bg-white rounded-xl border border-gray-200 shadow px-3 py-2 text-xs space-y-1.5 pointer-events-none">
      {Object.entries(COLORS).map(([key, cfg]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm border flex-shrink-0"
            style={{ backgroundColor: cfg.fill, borderColor: cfg.stroke, opacity: 0.9 }} />
          <span className="text-gray-700">{cfg.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────

interface Props {
  membres: MembreMissionCarte[];
  hauteur?: string;
}

export default function MissionCarteGPS({ membres, hauteur = "420px" }: Props) {
  const avecGps = membres.filter((m) => parsePolygon(m.gpsCollecte) !== null);
  const polygons = avecGps
    .map((m) => parsePolygon(m.gpsCollecte))
    .filter((p): p is [number, number][] => p !== null);

  const sansGps = membres.filter((m) => parsePolygon(m.gpsCollecte) === null);

  if (avecGps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400 bg-gray-50 rounded-xl border border-gray-200" style={{ minHeight: hauteur }}>
        <MapPin size={32} className="mb-3 text-gray-300" />
        <p className="text-sm font-medium text-gray-500">Aucune donnée GPS collectée</p>
        <p className="text-xs text-gray-400 mt-1">{membres.length} membre{membres.length > 1 ? "s" : ""} dans cette mission</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats rapides */}
      <div className="flex flex-wrap gap-2 text-xs">
        {(["valide", "collecte", "rejete", "en_attente"] as const).map((s) => {
          const count = membres.filter((m) => m.statut === s).length;
          if (count === 0) return null;
          const cfg = COLORS[s];
          return (
            <span key={s} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: cfg.fill + "22", color: cfg.stroke, border: `1px solid ${cfg.stroke}44` }}>
              {s === "valide" && <CheckCircle size={10} />}
              {s === "collecte" && <MapPin size={10} />}
              {s === "rejete" && <XCircle size={10} />}
              {s === "en_attente" && <Clock size={10} />}
              {cfg.label} — {count}
            </span>
          );
        })}
        {sansGps.length > 0 && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium text-gray-500 bg-gray-100">
            Sans GPS — {sansGps.length}
          </span>
        )}
      </div>

      {/* Carte */}
      <div className="relative rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height: hauteur }}>
        <MapContainer
          center={[5.5, -5.5]}
          zoom={10}
          style={{ height: "100%", width: "100%" }}
          zoomControl={true}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          <FitBounds polygons={polygons} />

          {avecGps.map((m) => {
            const polygon = parsePolygon(m.gpsCollecte);
            if (!polygon) return null;
            const cfg = statusColor(m.statut);
            const center = centroid(polygon);

            return (
              <Polygon
                key={m.membreId}
                positions={polygon}
                pathOptions={{
                  color: cfg.stroke,
                  fillColor: cfg.fill,
                  fillOpacity: cfg.fillOpacity,
                  weight: 2,
                }}
              >
                <Popup maxWidth={220} minWidth={160}>
                  <div className="text-xs space-y-1 py-0.5">
                    <p className="font-bold text-gray-900 text-sm">{m.prenoms} {m.nom}</p>
                    {m.village && <p className="text-gray-500">{m.village}</p>}
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.stroke }} />
                      <span className="font-medium" style={{ color: cfg.stroke }}>{cfg.label}</span>
                    </div>
                    {m.nombreParcelles && (
                      <p className="text-gray-500">{m.nombreParcelles} parcelle{m.nombreParcelles > 1 ? "s" : ""}</p>
                    )}
                    {m.dateCollecte && (
                      <p className="text-gray-400">
                        Collecté le {new Date(m.dateCollecte).toLocaleDateString("fr-FR")}
                      </p>
                    )}
                    {m.notesAgent && (
                      <p className="text-blue-600 italic">{m.notesAgent}</p>
                    )}
                    {m.motifRejet && (
                      <p className="text-red-600">Motif : {m.motifRejet}</p>
                    )}
                    <p className="text-gray-300 text-[10px] font-mono mt-1">
                      {center[0].toFixed(5)}, {center[1].toFixed(5)}
                    </p>
                  </div>
                </Popup>
              </Polygon>
            );
          })}

          {/* Points pour membres avec un seul point GPS (non polygon) */}
          {membres.filter((m) => {
            const raw = m.gpsCollecte as { lat?: number; lng?: number; lon?: number } | null;
            if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
            const lng = raw.lng ?? raw.lon;
            return typeof raw.lat === "number" && typeof lng === "number";
          }).map((m) => {
            const raw = m.gpsCollecte as { lat: number; lng?: number; lon?: number };
            const lng = (raw.lng ?? raw.lon) as number;
            const cfg = statusColor(m.statut);
            return (
              <CircleMarker
                key={`pt-${m.membreId}`}
                center={[raw.lat, lng]}
                radius={8}
                pathOptions={{ color: cfg.stroke, fillColor: cfg.fill, fillOpacity: 0.8, weight: 2 }}
              >
                <Popup maxWidth={200}>
                  <div className="text-xs space-y-1 py-0.5">
                    <p className="font-bold text-gray-900">{m.prenoms} {m.nom}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.stroke }} />
                      <span className="font-medium" style={{ color: cfg.stroke }}>{cfg.label}</span>
                    </div>
                    {m.village && <p className="text-gray-500">{m.village}</p>}
                    {m.dateCollecte && (
                      <p className="text-gray-400">{new Date(m.dateCollecte).toLocaleDateString("fr-FR")}</p>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
        <Legende />
      </div>

      {/* Membres sans GPS */}
      {sansGps.length > 0 && (
        <details className="bg-gray-50 rounded-xl border border-gray-200 text-sm">
          <summary className="px-4 py-2.5 cursor-pointer text-gray-500 font-medium select-none">
            {sansGps.length} membre{sansGps.length > 1 ? "s" : ""} sans données GPS
          </summary>
          <div className="px-4 pb-3 divide-y divide-gray-100">
            {sansGps.map((m) => (
              <div key={m.membreId} className="py-2 flex items-center justify-between">
                <span className="text-gray-700">{m.prenoms} {m.nom}</span>
                {m.village && <span className="text-xs text-gray-400">{m.village}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

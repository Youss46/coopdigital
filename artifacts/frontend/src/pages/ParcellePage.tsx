import "leaflet/dist/leaflet.css";
import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  Map, List, ShieldCheck, Download, Plus, RefreshCw, X, CheckCircle2,
  AlertTriangle, XCircle, Clock, HelpCircle, ChevronRight, Leaf, Navigation,
  Globe, Users, Layers, Filter, FileDown, Printer,
} from "lucide-react";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)["_getIconUrl"];
L.Icon.Default.mergeOptions({
  iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
  iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
  shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
});

const TOKEN_KEY = "coop_token";

async function apiFetch<T = unknown>(url: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { erreur?: string };
    throw new Error(body.erreur ?? `Erreur ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParcelleCarte {
  id: number;
  codeParcelle: string | null;
  polygone: [number, number][] | null;
  coordonneesPoint: { lat: number; lng: number } | null;
  eudrStatut: string | null;
  culturePrincipale: string | null;
  superficieCalculeeHa: string | null;
  superficieDeclareeHa: string | null;
  membreNom: string;
  membrePrenoms: string;
  membreId: number;
}

interface GpsTerrainPolygon {
  membreId: number;
  membreNom: string;
  membrePrenoms: string;
  village: string | null;
  section: string | null;
  missionId: number;
  missionTitre: string;
  statut: string;
  dateCollecte: string | null;
  superficieHa: string | null;
  polygone: [number, number][];
}

interface ZoneRisque {
  id: number;
  nomZone: string;
  typeZone: string;
  polygoneZone: [number, number][];
  source: string | null;
}

interface EudrExportRow {
  membreNom: string;
  membrePrenoms: string;
  section: string | null;
  village: string | null;
  eudrStatut: string | null;
  superficieCalculeeHa: string | null;
  superficieDeclareeHa: string | null;
  hasPolygone: boolean;
  hasPoint: boolean;
  eudrDateVerification: string | null;
  codeParcelle: string | null;
}

interface MembreSansGps {
  id: number;
  nom: string;
  prenoms: string;
  telephone: string | null;
  village: string | null;
  section: string | null;
  parcelleLat: string | null;
  parcelleLng: string | null;
}

interface ParcelleListItem extends ParcelleCarte {
  membre_nom: string;
  telephone: string;
  village: string | null;
  section: string | null;
  certificationStatut: string | null;
  eudrDateVerification: string | null;
  eudrRisqueDeforestation: string | null;
  eudrDansZoneProtegee: boolean | null;
  createdAt: string;
}

interface ConformiteStats {
  nb_parcelles_total: number;
  nb_conformes: number;
  nb_non_conformes: number;
  nb_en_cours: number;
  nb_non_verifiees: number;
  superficie_totale_ha: number;
  superficie_conforme_ha: number;
  pct_superficie_conforme: number;
  membres_avec_parcelle: number;
  membres_sans_parcelle: number;
  par_section: { section: string; total: number; conformes: number; pct: number; superficie_ha: number }[];
}

interface NouvelleParcelleForm {
  membre_id: string;
  nom_parcelle: string;
  village: string;
  section: string;
  region: string;
  culture_principale: string;
  superficie_declaree_ha: string;
  annee_plantation: string;
  polygone: [number, number][] | null;
}

// ── Couleurs EUDR ─────────────────────────────────────────────────────────────

const EUDR_CONFIG: Record<string, { color: string; fill: string; label: string; icon: typeof CheckCircle2 }> = {
  conforme:      { color: "#16a34a", fill: "#16a34a22", label: "Conforme",      icon: CheckCircle2 },
  non_conforme:  { color: "#dc2626", fill: "#dc262622", label: "Non conforme",  icon: XCircle },
  en_cours:      { color: "#f59e0b", fill: "#f59e0b22", label: "En cours",      icon: Clock },
  non_verifie:   { color: "#6b7280", fill: "#6b728022", label: "Non vérifié",   icon: HelpCircle },
};

function getEudrConfig(statut: string | null) {
  return EUDR_CONFIG[statut ?? "non_verifie"] ?? EUDR_CONFIG["non_verifie"]!;
}

// ── Badge EUDR ────────────────────────────────────────────────────────────────

function BadgeEudr({ statut }: { statut: string | null }) {
  const cfg = getEudrConfig(statut);
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.fill, color: cfg.color, border: `1px solid ${cfg.color}44` }}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

// ── Couche de dessin ──────────────────────────────────────────────────────────

function DrawingLayer({
  active,
  vertices,
  onAddVertex,
}: {
  active: boolean;
  vertices: [number, number][];
  onAddVertex: (pt: [number, number]) => void;
}) {
  useMapEvents({
    click(e) {
      if (!active) return;
      onAddVertex([e.latlng.lat, e.latlng.lng]);
    },
  });

  return (
    <>
      {vertices.length >= 2 && (
        <Polyline positions={vertices} pathOptions={{ color: "#2563eb", dashArray: "6 4", weight: 2 }} />
      )}
      {vertices.map((v, i) => (
        <CircleMarker
          key={i}
          center={v}
          radius={5}
          pathOptions={{ color: "#2563eb", fillColor: "#fff", fillOpacity: 1, weight: 2 }}
        />
      ))}
    </>
  );
}

// ── Carte Leaflet ─────────────────────────────────────────────────────────────

function LeafletMap({
  parcelles,
  zones,
  selectedId,
  onSelect,
  drawingMode,
  drawVertices,
  onAddVertex,
  showZones,
  gpsTerrainPolygons,
  showGpsTerrain,
  membresSansGps,
  showMembresSansGps,
}: {
  parcelles: ParcelleCarte[];
  zones: ZoneRisque[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  drawingMode: boolean;
  drawVertices: [number, number][];
  onAddVertex: (pt: [number, number]) => void;
  showZones: boolean;
  gpsTerrainPolygons: GpsTerrainPolygon[];
  showGpsTerrain: boolean;
  membresSansGps: MembreSansGps[];
  showMembresSansGps: boolean;
}) {
  const COOP_CENTER: [number, number] = [7.0, -6.5];

  return (
    <MapContainer
      center={COOP_CENTER}
      zoom={8}
      style={{ height: "100%", width: "100%", cursor: drawingMode ? "crosshair" : "grab" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='© <a href="https://openstreetmap.org">OpenStreetMap</a>'
      />

      {showZones && zones.map(z => (
        <Polygon
          key={`zone-${z.id}`}
          positions={z.polygoneZone}
          pathOptions={{ color: "#7c3aed", fillColor: "#7c3aed33", fillOpacity: 0.4, weight: 2, dashArray: "4 4" }}
        >
          <Popup>
            <div className="text-sm">
              <p className="font-semibold text-purple-700">{z.nomZone}</p>
              <p className="text-gray-600">{z.typeZone}</p>
            </div>
          </Popup>
        </Polygon>
      ))}

      {parcelles.map(p => {
        const cfg = getEudrConfig(p.eudrStatut);
        const isSelected = p.id === selectedId;
        const ha = parseFloat(String(p.superficieCalculeeHa ?? p.superficieDeclareeHa ?? 0));

        if (p.polygone && p.polygone.length >= 3) {
          return (
            <Polygon
              key={p.id}
              positions={p.polygone}
              pathOptions={{
                color: cfg.color,
                fillColor: cfg.fill,
                fillOpacity: 0.5,
                weight: isSelected ? 3 : 1.5,
              }}
              eventHandlers={{ click: () => onSelect(p.id) }}
            >
              <Popup>
                <div className="text-sm min-w-32">
                  <p className="font-semibold">{p.codeParcelle}</p>
                  <p className="text-gray-600">{p.membreNom} {p.membrePrenoms}</p>
                  <p className="text-gray-500">{ha > 0 ? `${ha} ha` : "—"}</p>
                  <BadgeEudr statut={p.eudrStatut} />
                </div>
              </Popup>
            </Polygon>
          );
        }

        if (p.coordonneesPoint) {
          return (
            <CircleMarker
              key={p.id}
              center={[p.coordonneesPoint.lat, p.coordonneesPoint.lng]}
              radius={6}
              pathOptions={{ color: cfg.color, fillColor: cfg.color, fillOpacity: 0.8, weight: 2 }}
              eventHandlers={{ click: () => onSelect(p.id) }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-semibold">{p.codeParcelle}</p>
                  <p className="text-gray-600">{p.membreNom} {p.membrePrenoms}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        }

        return null;
      })}

      {showGpsTerrain && gpsTerrainPolygons.map((tp, idx) => (
        <Polygon
          key={`terrain-${tp.missionId}-${tp.membreId}-${idx}`}
          positions={tp.polygone}
          pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.18, weight: 2.5, dashArray: "6 3" }}
        >
          <Popup>
            <div className="text-sm min-w-40">
              <p className="font-semibold text-amber-700 flex items-center gap-1">
                GPS Terrain
              </p>
              <p className="text-gray-800 font-medium mt-0.5">{tp.membreNom} {tp.membrePrenoms}</p>
              {tp.village && (
                <p className="text-gray-500 text-xs">{tp.village}{tp.section ? ` — ${tp.section}` : ""}</p>
              )}
              <p className="text-gray-500 text-xs mt-1 italic">{tp.missionTitre}</p>
              {tp.dateCollecte && (
                <p className="text-gray-400 text-xs">{new Date(tp.dateCollecte).toLocaleDateString("fr-FR")}</p>
              )}
              {tp.superficieHa && (
                <p className="text-gray-600 text-xs">{parseFloat(String(tp.superficieHa))} ha</p>
              )}
              <span className={`inline-block mt-1.5 text-xs px-1.5 py-0.5 rounded-full font-medium ${
                tp.statut === "valide" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
              }`}>
                {tp.statut === "valide" ? "Validé" : "Collecté"}
              </span>
            </div>
          </Popup>
        </Polygon>
      ))}

      {showMembresSansGps && membresSansGps.map(m => {
        const lat = m.parcelleLat ? parseFloat(m.parcelleLat) : null;
        const lng = m.parcelleLng ? parseFloat(m.parcelleLng) : null;
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
        return (
          <CircleMarker
            key={`sans-gps-${m.id}`}
            center={[lat, lng]}
            radius={8}
            pathOptions={{ color: "#dc2626", fillColor: "#dc2626", fillOpacity: 0.75, weight: 2 }}
          >
            <Popup>
              <div className="text-sm min-w-36">
                <p className="font-semibold text-red-700 flex items-center gap-1 mb-1">
                  Sans GPS
                </p>
                <p className="text-gray-800 font-medium">{m.nom} {m.prenoms}</p>
                {m.telephone && (
                  <p className="text-gray-500 text-xs mt-0.5">{m.telephone}</p>
                )}
                {m.village && (
                  <p className="text-gray-500 text-xs">{m.village}{m.section ? ` — ${m.section}` : ""}</p>
                )}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      <DrawingLayer active={drawingMode} vertices={drawVertices} onAddVertex={onAddVertex} />
    </MapContainer>
  );
}

// ── Panneau latéral ───────────────────────────────────────────────────────────

function SidePanel({
  parcelle,
  onClose,
  onVerifier,
}: {
  parcelle: ParcelleCarte;
  onClose: () => void;
  onVerifier: (id: number) => void;
}) {
  const ha = parseFloat(String(parcelle.superficieCalculeeHa ?? parcelle.superficieDeclareeHa ?? 0));
  return (
    <div className="absolute top-0 right-0 h-full w-80 bg-white shadow-xl z-10 flex flex-col border-l border-gray-200">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-sm text-gray-800">{parcelle.codeParcelle ?? "Parcelle"}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div>
          <p className="text-xs text-gray-500 mb-1">Producteur</p>
          <p className="text-sm font-medium">{parcelle.membreNom} {parcelle.membrePrenoms}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Superficie</p>
            <p className="text-sm font-medium">{ha > 0 ? `${ha} ha` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Culture</p>
            <p className="text-sm font-medium capitalize">{parcelle.culturePrincipale ?? "—"}</p>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Statut EUDR</p>
          <BadgeEudr statut={parcelle.eudrStatut} />
        </div>
      </div>
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={() => onVerifier(parcelle.id)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
        >
          <ShieldCheck size={14} />
          Vérifier EUDR
        </button>
      </div>
    </div>
  );
}

// ── Formulaire nouvelle parcelle ──────────────────────────────────────────────

const FORM_DEFAULT: NouvelleParcelleForm = {
  membre_id: "", nom_parcelle: "", village: "", section: "",
  region: "", culture_principale: "cacao", superficie_declaree_ha: "",
  annee_plantation: "", polygone: null,
};

function NouvelleParcelleDrawer({
  polygone,
  onClose,
  onCreated,
}: {
  polygone: [number, number][] | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState<NouvelleParcelleForm>({ ...FORM_DEFAULT, polygone });
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const field = (k: keyof NouvelleParcelleForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.membre_id) { setErr("L'identifiant du membre est requis."); return; }
    setLoading(true); setErr("");
    try {
      await apiFetch("/api/parcelles", {
        method: "POST",
        body: JSON.stringify({ ...form, membre_id: parseInt(form.membre_id), polygone: form.polygone }),
      });
      onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30">
      <div className="bg-white w-full max-w-md h-full overflow-y-auto shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Nouvelle parcelle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {polygone && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700 flex items-center gap-2">
              <CheckCircle2 size={14} />
              Polygone dessiné — {polygone.length} sommets
            </div>
          )}
          {err && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{err}</div>
          )}
          <label className="block">
            <span className="text-sm font-medium text-gray-700">ID Membre *</span>
            <input type="number" value={form.membre_id} onChange={field("membre_id")} required
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Nom de la parcelle</span>
            <input type="text" value={form.nom_parcelle} onChange={field("nom_parcelle")}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Village</span>
              <input type="text" value={form.village} onChange={field("village")}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Section</span>
              <input type="text" value={form.section} onChange={field("section")}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Région</span>
            <input type="text" value={form.region} onChange={field("region")}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Culture</span>
              <select value={form.culture_principale} onChange={field("culture_principale")}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="cacao">Cacao</option>
                <option value="cafe">Café</option>
                <option value="hevea">Hévéa</option>
                <option value="palmier">Palmier</option>
                <option value="autre">Autre</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Superficie (ha)</span>
              <input type="number" step="0.01" value={form.superficie_declaree_ha} onChange={field("superficie_declaree_ha")}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Année de plantation</span>
            <input type="number" value={form.annee_plantation} onChange={field("annee_plantation")} min={1950} max={new Date().getFullYear()}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </label>
        </form>
        <div className="px-5 py-4 border-t border-gray-200">
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            {loading ? "Enregistrement…" : "Enregistrer la parcelle"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Onglet Carte ──────────────────────────────────────────────────────────────

function OngletCarte({
  parcelles,
  zones,
  gpsTerrainPolygons,
  isLoading,
  onRefresh,
  onVerifier,
}: {
  parcelles: ParcelleCarte[];
  zones: ZoneRisque[];
  gpsTerrainPolygons: GpsTerrainPolygon[];
  isLoading: boolean;
  onRefresh: () => void;
  onVerifier: (id: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [showZones, setShowZones] = useState(true);
  const [showGpsTerrain, setShowGpsTerrain] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [drawnPolygon, setDrawnPolygon] = useState<[number, number][] | null>(null);
  const [filterEudr, setFilterEudr] = useState("all");

  const selectedParcelle = parcelles.find(p => p.id === selected) ?? null;

  const filtered = filterEudr === "all"
    ? parcelles
    : parcelles.filter(p => p.eudrStatut === filterEudr);

  const addVertex = useCallback((pt: [number, number]) => {
    setDrawVertices(v => [...v, pt]);
  }, []);

  function finishDrawing() {
    if (drawVertices.length < 3) return;
    setDrawnPolygon(drawVertices);
    setDrawingMode(false);
    setDrawVertices([]);
    setShowForm(true);
  }

  function cancelDrawing() {
    setDrawingMode(false);
    setDrawVertices([]);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Barre filtres */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filterEudr}
          onChange={e => setFilterEudr(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">Tous les statuts EUDR</option>
          <option value="conforme">Conformes</option>
          <option value="non_conforme">Non conformes</option>
          <option value="en_cours">En cours</option>
          <option value="non_verifie">Non vérifiés</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showZones} onChange={e => setShowZones(e.target.checked)} className="rounded" />
          Zones protégées
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showGpsTerrain} onChange={e => setShowGpsTerrain(e.target.checked)} className="rounded" />
          <Navigation size={12} className="text-amber-500" />
          GPS Terrain
          {gpsTerrainPolygons.length > 0 && (
            <span className="ml-0.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">
              {gpsTerrainPolygons.length}
            </span>
          )}
        </label>
        <div className="ml-auto flex items-center gap-2">
          {drawingMode ? (
            <>
              <span className="text-xs text-blue-600 font-medium">{drawVertices.length} sommets — cliquez sur la carte</span>
              <button onClick={finishDrawing} disabled={drawVertices.length < 3}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300 transition-colors">
                Fermer le polygone
              </button>
              <button onClick={cancelDrawing} className="px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors">
                Annuler
              </button>
            </>
          ) : (
            <button
              onClick={() => { setDrawingMode(true); setDrawVertices([]); setSelected(null); }}
              className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
            >
              <Plus size={14} />
              Dessiner une parcelle
            </button>
          )}
          <button onClick={onRefresh} className="p-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
            <RefreshCw size={14} className={isLoading ? "animate-spin text-gray-400" : "text-gray-600"} />
          </button>
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EUDR_CONFIG).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: v.color }} />
            {v.label}
          </span>
        ))}
        {showZones && (
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm border-2 border-purple-600 border-dashed" />
            Zone protégée
          </span>
        )}
        {showGpsTerrain && gpsTerrainPolygons.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm border-2 border-amber-500" style={{ borderStyle: "dashed" }} />
            GPS Terrain
          </span>
        )}
      </div>

      {/* Carte + panneau */}
      <div className="relative rounded-xl overflow-hidden border border-gray-200" style={{ height: 520 }}>
        <LeafletMap
          parcelles={filtered}
          zones={zones}
          selectedId={selected}
          onSelect={setSelected}
          drawingMode={drawingMode}
          drawVertices={drawVertices}
          onAddVertex={addVertex}
          showZones={showZones}
          gpsTerrainPolygons={gpsTerrainPolygons}
          showGpsTerrain={showGpsTerrain}
          membresSansGps={[]}
          showMembresSansGps={false}
        />
        {selectedParcelle && (
          <SidePanel
            parcelle={selectedParcelle}
            onClose={() => setSelected(null)}
            onVerifier={async (id) => { await onVerifier(id); setSelected(null); }}
          />
        )}
      </div>

      <p className="text-xs text-gray-500 text-right">{filtered.length} parcelle{filtered.length > 1 ? "s" : ""} affichée{filtered.length > 1 ? "s" : ""}</p>

      {showForm && (
        <NouvelleParcelleDrawer
          polygone={drawnPolygon}
          onClose={() => { setShowForm(false); setDrawnPolygon(null); }}
          onCreated={onRefresh}
        />
      )}
    </div>
  );
}

// ── Onglet Liste ──────────────────────────────────────────────────────────────

function OngletListe({
  onExportGeoJSON,
  onVerifierTout,
  isVerifying,
}: {
  onExportGeoJSON: () => void;
  onVerifierTout: () => Promise<void>;
  isVerifying: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filterEudr, setFilterEudr] = useState("");
  const [filterCulture, setFilterCulture] = useState("");
  const [page, setPage] = useState(1);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (search) params.set("search", search);
  if (filterEudr) params.set("eudr_statut", filterEudr);
  if (filterCulture) params.set("culture", filterCulture);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["parcelles-liste", page, search, filterEudr, filterCulture],
    queryFn: () => apiFetch<{ parcelles: ParcelleListItem[]; total: number }>(`/api/parcelles?${params}`),
  });

  async function handleVerifierTout() {
    setVerifyLoading(true);
    await onVerifierTout();
    await refetch();
    setVerifyLoading(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Rechercher membre, code, village…"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <select value={filterEudr} onChange={e => { setFilterEudr(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Tous statuts EUDR</option>
          <option value="conforme">Conforme</option>
          <option value="non_conforme">Non conforme</option>
          <option value="en_cours">En cours</option>
          <option value="non_verifie">Non vérifié</option>
        </select>
        <select value={filterCulture} onChange={e => { setFilterCulture(e.target.value); setPage(1); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Toutes cultures</option>
          <option value="cacao">Cacao</option>
          <option value="cafe">Café</option>
          <option value="hevea">Hévéa</option>
          <option value="palmier">Palmier</option>
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={handleVerifierTout}
            disabled={verifyLoading || isVerifying}
            className="flex items-center gap-2 px-3 py-1.5 border border-green-600 text-green-700 text-sm rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            <ShieldCheck size={14} />
            {verifyLoading ? "Vérification…" : "Vérifier tout"}
          </button>
          <button
            onClick={onExportGeoJSON}
            className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download size={14} />
            Export GeoJSON
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw size={20} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Producteur</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Village</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Culture</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700">Superficie</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">EUDR</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700">Certification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.parcelles ?? []).map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{p.codeParcelle ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-gray-800">{p.membre_nom}</p>
                      <p className="text-xs text-gray-500">{p.telephone}</p>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{p.village ?? "—"}</td>
                    <td className="px-4 py-2.5 capitalize text-gray-600">{p.culturePrincipale ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right text-gray-600">
                      {parseFloat(String(p.superficieCalculeeHa ?? p.superficieDeclareeHa ?? 0)) || "—"} ha
                    </td>
                    <td className="px-4 py-2.5 text-center"><BadgeEudr statut={p.eudrStatut} /></td>
                    <td className="px-4 py-2.5 text-center">
                      {p.certificationStatut ? (
                        <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded-full border border-blue-200">
                          {p.certificationStatut}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!data?.parcelles?.length && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      <Leaf size={24} className="mx-auto mb-2 opacity-40" />
                      Aucune parcelle trouvée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>{data?.total ?? 0} parcelle{(data?.total ?? 0) > 1 ? "s" : ""} au total</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Préc.</button>
              <span>Page {page}</span>
              <button onClick={() => setPage(p => p + 1)} disabled={(data?.total ?? 0) <= page * 50}
                className="px-3 py-1 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50">Suiv.</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Onglet Conformité ─────────────────────────────────────────────────────────

function OngletConformite({ stats, isLoading }: { stats: ConformiteStats | undefined; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <RefreshCw size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }
  if (!stats) return null;

  const pctConformes = stats.nb_parcelles_total > 0
    ? Math.round((stats.nb_conformes / stats.nb_parcelles_total) * 100)
    : 0;
  const isAlert = pctConformes < 80;

  return (
    <div className="space-y-6">
      {isAlert && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle size={18} className="text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-red-700 text-sm">Niveau de conformité insuffisant</p>
            <p className="text-red-600 text-xs mt-0.5">
              Seulement {pctConformes}% des parcelles sont conformes EUDR (seuil requis : 80%).
              Des actions correctives sont nécessaires pour l'exportation.
            </p>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Conformes", value: stats.nb_conformes, color: "green", sub: `${pctConformes}%` },
          { label: "Non conformes", value: stats.nb_non_conformes, color: "red", sub: "" },
          { label: "En cours", value: stats.nb_en_cours, color: "amber", sub: "" },
          { label: "Non vérifiées", value: stats.nb_non_verifiees, color: "gray", sub: "" },
        ].map(k => (
          <div key={k.label} className={`bg-${k.color}-50 border border-${k.color}-200 rounded-xl p-4`}>
            <p className={`text-2xl font-bold text-${k.color}-700`}>{k.value}</p>
            {k.sub && <p className={`text-sm font-medium text-${k.color}-600`}>{k.sub}</p>}
            <p className={`text-xs text-${k.color}-600 mt-1`}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Barres de progression */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-semibold text-gray-800 text-sm">Superficie certifiée</h3>
        <div>
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{stats.superficie_conforme_ha} ha conformes</span>
            <span>{stats.superficie_totale_ha} ha total</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-700"
              style={{ width: `${stats.pct_superficie_conforme}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">{stats.pct_superficie_conforme}% de la superficie est conforme</p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
          <div>
            <p className="text-xs text-gray-500">Membres avec parcelle</p>
            <p className="text-lg font-bold text-gray-800">{stats.membres_avec_parcelle}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Membres sans parcelle</p>
            <p className="text-lg font-bold text-red-600">{stats.membres_sans_parcelle}</p>
          </div>
        </div>
      </div>

      {/* Par section */}
      {stats.par_section.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-800 text-sm">Conformité par section</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.par_section.map(s => (
              <div key={s.section} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{s.section}</p>
                  <p className="text-xs text-gray-500">{s.conformes}/{s.total} parcelles</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${s.pct}%`,
                        background: s.pct >= 80 ? "#16a34a" : s.pct >= 50 ? "#f59e0b" : "#dc2626",
                      }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-10 text-right">{s.pct}%</span>
                </div>
                <ChevronRight size={14} className="text-gray-400 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Onglet Carte Globale ──────────────────────────────────────────────────────

interface ZonesFiltres { villages: string[]; sections: string[]; typesZone: string[]; }

function StatCouverture({ label, value, sub, color, icon: Icon }: {
  label: string; value: string | number; sub?: string;
  color: "green" | "blue" | "amber" | "gray";
  icon: typeof Globe;
}) {
  const cls = {
    green: { bg: "bg-green-50", border: "border-green-200", val: "text-green-700", lbl: "text-green-600" },
    blue:  { bg: "bg-blue-50",  border: "border-blue-200",  val: "text-blue-700",  lbl: "text-blue-600"  },
    amber: { bg: "bg-amber-50", border: "border-amber-200", val: "text-amber-700", lbl: "text-amber-600" },
    gray:  { bg: "bg-gray-50",  border: "border-gray-200",  val: "text-gray-700",  lbl: "text-gray-500"  },
  }[color];
  return (
    <div className={`${cls.bg} border ${cls.border} rounded-xl p-4 flex items-start gap-3`}>
      <div className={`mt-0.5 p-2 rounded-lg ${cls.bg} border ${cls.border}`}>
        <Icon size={16} className={cls.val} />
      </div>
      <div>
        <p className={`text-2xl font-bold ${cls.val}`}>{value}</p>
        {sub && <p className={`text-sm font-medium ${cls.val}`}>{sub}</p>}
        <p className={`text-xs ${cls.lbl} mt-0.5`}>{label}</p>
      </div>
    </div>
  );
}

interface CoopConfig {
  nom_complet: string | null;
  nom_abrege: string | null;
  region: string | null;
  logo_url: string | null;
}

function OngletCarteGlobale() {
  const qc = useQueryClient();
  const [filterEudr, setFilterEudr] = useState("all");
  const [filterVillage, setFilterVillage] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterZoneType, setFilterZoneType] = useState("");
  const [showZones, setShowZones] = useState(true);
  const [showGpsTerrain, setShowGpsTerrain] = useState(true);
  const [showMembresSansGps, setShowMembresSansGps] = useState(true);
  const [selected, setSelected] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingXlsx, setIsExportingXlsx] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const configQ = useQuery({
    queryKey: ["coop-config"],
    queryFn: () => apiFetch<CoopConfig>("/api/config"),
    staleTime: 10 * 60 * 1000,
  });

  const coopNom = configQ.data?.nom_complet ?? configQ.data?.nom_abrege ?? "CoopDigital";
  const coopRegion = configQ.data?.region;
  const coopLogo = configQ.data?.logo_url ?? null;

  const zonesQ = useQuery({
    queryKey: ["parcelles-zones-filtres"],
    queryFn: () => apiFetch<ZonesFiltres>("/api/parcelles/zones-filtres"),
  });

  const carteQ = useQuery({
    queryKey: ["parcelles-carte-globale", filterEudr, filterVillage, filterSection],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterEudr !== "all") params.set("eudr_statut", filterEudr);
      if (filterVillage) params.set("village", filterVillage);
      if (filterSection) params.set("section", filterSection);
      const qs = params.toString();
      return apiFetch<{ parcelles: ParcelleCarte[]; zones: ZoneRisque[] }>(
        `/api/parcelles/carte${qs ? `?${qs}` : ""}`,
      );
    },
  });

  const gpsTerrainQ = useQuery({
    queryKey: ["parcelles-gps-terrain-globale"],
    queryFn: () => apiFetch<{ polygones: GpsTerrainPolygon[] }>("/api/parcelles/gps-terrain"),
  });

  const conformiteQ = useQuery({
    queryKey: ["parcelles-conformite-globale", filterVillage, filterSection],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterVillage) params.set("village", filterVillage);
      if (filterSection) params.set("section", filterSection);
      const qs = params.toString();
      return apiFetch<ConformiteStats>(`/api/parcelles/conformite${qs ? `?${qs}` : ""}`);
    },
  });

  const membresSansGpsQ = useQuery({
    queryKey: ["parcelles-membres-sans-gps"],
    queryFn: () => apiFetch<{ membres: MembreSansGps[] }>("/api/parcelles/membres-sans-gps"),
  });

  const parcelles = carteQ.data?.parcelles ?? [];
  const allZones = carteQ.data?.zones ?? [];
  const stats = conformiteQ.data;

  const allMembresSansGps = membresSansGpsQ.data?.membres ?? [];
  const membresSansGps = allMembresSansGps.filter(m => {
    if (filterVillage && m.village !== filterVillage) return false;
    if (filterSection && m.section !== filterSection) return false;
    return true;
  });
  const membresSansGpsAvecCoords = membresSansGps.filter(
    m => m.parcelleLat && m.parcelleLng && parseFloat(m.parcelleLat) !== 0 && parseFloat(m.parcelleLng) !== 0,
  );

  // Fix 2: filter GPS terrain polygons by village/section consistently with parcel filter
  const allGpsPolygones = gpsTerrainQ.data?.polygones ?? [];
  const gpsPolygones = allGpsPolygones.filter(p => {
    if (filterVillage && p.village !== filterVillage) return false;
    if (filterSection && p.section !== filterSection) return false;
    return true;
  });

  // Fix 1: filter protected zones by type
  const filteredZones = filterZoneType
    ? allZones.filter(z => z.typeZone === filterZoneType)
    : allZones;

  const totalMembres = (stats?.membres_avec_parcelle ?? 0) + (stats?.membres_sans_parcelle ?? 0);
  const pctCouverture = totalMembres > 0
    ? Math.round(((stats?.membres_avec_parcelle ?? 0) / totalMembres) * 100)
    : 0;
  const superficieTotale = parseFloat(String(stats?.superficie_totale_ha ?? 0));
  const membresTerrainUniques = new Set(allGpsPolygones.map(p => p.membreId)).size;

  const selectedParcelle = parcelles.find(p => p.id === selected) ?? null;
  const isLoading = carteQ.isFetching || conformiteQ.isLoading;

  // Fix 3: wire up EUDR verification properly
  async function handleVerifier(id: number) {
    setIsVerifying(true);
    try {
      await apiFetch(`/api/parcelles/${id}/verifier-eudr`, { method: "PUT" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["parcelles-carte-globale"] }),
        qc.invalidateQueries({ queryKey: ["parcelles-conformite-globale"] }),
      ]);
    } finally {
      setIsVerifying(false);
      setSelected(null);
    }
  }

  async function handleExportPDF() {
    const el = exportRef.current;
    if (!el) return;
    setIsExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }, autoTableModule] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      const autoTable = (autoTableModule as { default: typeof autoTableModule.default }).default ?? autoTableModule;

      const canvas = await html2canvas(el, {
        useCORS: true,
        scale: 1.5,
        logging: false,
        allowTaint: false,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 14;
      const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.text("Rapport EUDR — Couverture GPS parcelles", margin, 13);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.text(`Généré le ${dateStr} · CoopDigital`, margin, 20);

      const imgW = pageW - margin * 2;
      const imgH = Math.min((canvas.height * imgW) / canvas.width, pageH - 28);
      pdf.addImage(imgData, "PNG", margin, 25, imgW, imgH);

      if (stats && stats.par_section.length > 0) {
        pdf.addPage();

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.text("Synthèse par section", margin, 14);
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(9);
        pdf.text(`Généré le ${dateStr} · CoopDigital`, margin, 21);

        const tableData = stats.par_section.map(s => [
          s.section,
          `${s.conformes} / ${s.total}`,
          `${s.pct} %`,
          s.superficie_ha.toFixed(2),
        ]);

        const totaux = stats.par_section.reduce(
          (acc, s) => ({ conformes: acc.conformes + s.conformes, total: acc.total + s.total, superficie_ha: acc.superficie_ha + s.superficie_ha }),
          { conformes: 0, total: 0, superficie_ha: 0 },
        );
        const pctTotal = totaux.total > 0 ? Math.round((totaux.conformes / totaux.total) * 100) : 0;
        tableData.push([
          "TOTAL",
          `${totaux.conformes} / ${totaux.total}`,
          `${pctTotal} %`,
          totaux.superficie_ha.toFixed(2),
        ]);

        autoTable(pdf, {
          startY: 27,
          head: [["Section", "Membres conformes / Total", "% Conformité", "Superficie totale (ha)"]],
          body: tableData,
          margin: { left: margin, right: margin },
          styles: { fontSize: 10, cellPadding: 4 },
          headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: "bold" },
          columnStyles: {
            0: { cellWidth: "auto" },
            1: { halign: "center" },
            2: { halign: "center" },
            3: { halign: "right" },
          },
          didParseCell: (data) => {
            if (data.row.index === tableData.length - 1) {
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [240, 240, 240];
            }
          },
        });
      }

      pdf.save(`eudr_rapport_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération du PDF. Vérifiez que la carte est bien chargée.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleExportExcel() {
    setIsExportingXlsx(true);
    try {
      const params = new URLSearchParams();
      if (filterEudr !== "all") params.set("eudr_statut", filterEudr);
      if (filterVillage) params.set("village", filterVillage);
      if (filterSection) params.set("section", filterSection);
      const qs = params.toString();

      const data = await apiFetch<{ parcelles: EudrExportRow[] }>(
        `/api/parcelles/export-eudr${qs ? `?${qs}` : ""}`,
      );

      const LABELS: Record<string, string> = {
        conforme: "Conforme",
        non_conforme: "Non conforme",
        en_cours: "En cours",
        non_verifie: "Non vérifié",
      };

      const rows = data.parcelles.map(p => ({
        "Membre":             `${p.membreNom} ${p.membrePrenoms}`,
        "Section":            p.section ?? "",
        "Village":            p.village ?? "",
        "Statut EUDR":        LABELS[p.eudrStatut ?? "non_verifie"] ?? p.eudrStatut ?? "Non vérifié",
        "Superficie (ha)":    p.superficieCalculeeHa ?? p.superficieDeclareeHa ?? "",
        "GPS":                (p.hasPolygone || p.hasPoint) ? "Oui" : "Non",
        "Date vérification":  p.eudrDateVerification ?? "",
      }));

      const { utils, writeFile } = await import("xlsx");
      const ws = utils.json_to_sheet(rows);
      ws["!cols"] = [
        { wch: 28 }, { wch: 16 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 6 }, { wch: 18 },
      ];
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, "EUDR");
      writeFile(wb, `eudr_export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la génération du fichier Excel.");
    } finally {
      setIsExportingXlsx(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div ref={exportRef} className="space-y-4">
      {/* Statistiques de couverture */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCouverture
          label="Couverture GPS parcelles"
          value={`${pctCouverture}%`}
          sub={`${stats?.membres_avec_parcelle ?? "—"} / ${totalMembres || "—"} membres`}
          color={pctCouverture >= 80 ? "green" : pctCouverture >= 50 ? "amber" : "gray"}
          icon={Globe}
        />
        <StatCouverture
          label="Superficie totale cartographiée"
          value={superficieTotale > 0 ? `${superficieTotale.toFixed(1)} ha` : "—"}
          sub={stats ? `${stats.nb_parcelles_total} parcelle${stats.nb_parcelles_total > 1 ? "s" : ""}` : undefined}
          color="blue"
          icon={Layers}
        />
        <StatCouverture
          label="Membres avec GPS terrain"
          value={membresTerrainUniques || "—"}
          sub={`${allGpsPolygones.length} polygone${allGpsPolygones.length > 1 ? "s" : ""} collecté${allGpsPolygones.length > 1 ? "s" : ""}`}
          color="amber"
          icon={Navigation}
        />
        <StatCouverture
          label="Membres sans GPS"
          value={stats?.membres_sans_parcelle ?? "—"}
          sub={totalMembres > 0 ? `${100 - pctCouverture}% non couverts` : undefined}
          color="gray"
          icon={Users}
        />
      </div>

      {/* Barre filtres */}
      <div className="no-print bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-2">
        <Filter size={14} className="text-gray-400 shrink-0" />

        {/* Filtre statut EUDR */}
        <select
          value={filterEudr}
          onChange={e => setFilterEudr(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="all">Tous les statuts EUDR</option>
          <option value="conforme">Conformes</option>
          <option value="non_conforme">Non conformes</option>
          <option value="en_cours">En cours</option>
          <option value="non_verifie">Non vérifiés</option>
        </select>

        {/* Filtre village */}
        {(zonesQ.data?.villages ?? []).length > 0 && (
          <select
            value={filterVillage}
            onChange={e => { setFilterVillage(e.target.value); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Tous les villages</option>
            {(zonesQ.data?.villages ?? []).map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        )}

        {/* Filtre section */}
        {(zonesQ.data?.sections ?? []).length > 0 && (
          <select
            value={filterSection}
            onChange={e => { setFilterSection(e.target.value); }}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Toutes les sections</option>
            {(zonesQ.data?.sections ?? []).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        {/* Filtre type de zone protégée */}
        {(zonesQ.data?.typesZone ?? []).length > 0 && (
          <select
            value={filterZoneType}
            onChange={e => setFilterZoneType(e.target.value)}
            className="border border-purple-300 rounded-lg px-3 py-1.5 text-sm text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Toutes les zones protégées</option>
            {(zonesQ.data?.typesZone ?? []).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showZones} onChange={e => setShowZones(e.target.checked)} className="rounded" />
          <span className="inline-block w-2.5 h-2.5 rounded-sm border-2 border-purple-600" style={{ borderStyle: "dashed" }} />
          Zones
          {filterZoneType && filteredZones.length > 0 && (
            <span className="ml-0.5 text-xs bg-purple-100 text-purple-700 rounded-full px-1.5 py-0.5 font-medium">
              {filteredZones.length}
            </span>
          )}
        </label>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showGpsTerrain} onChange={e => setShowGpsTerrain(e.target.checked)} className="rounded" />
          <Navigation size={12} className="text-amber-500" />
          GPS Terrain
          {gpsPolygones.length > 0 && (
            <span className="ml-0.5 text-xs bg-amber-100 text-amber-700 rounded-full px-1.5 py-0.5 font-medium">
              {gpsPolygones.length}
            </span>
          )}
        </label>

        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={showMembresSansGps} onChange={e => setShowMembresSansGps(e.target.checked)} className="rounded" />
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
          Membres sans GPS
          <span className={`ml-0.5 text-xs rounded-full px-1.5 py-0.5 font-medium ${
            membresSansGps.length > 0 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
          }`}>
            {membresSansGps.length}
          </span>
          {membresSansGpsAvecCoords.length < membresSansGps.length && membresSansGps.length > 0 && (
            <span className="text-xs text-gray-400">({membresSansGpsAvecCoords.length} localisés)</span>
          )}
        </label>

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          {(isLoading || isVerifying) && <RefreshCw size={13} className="animate-spin" />}
          <span>{parcelles.length} parcelle{parcelles.length > 1 ? "s" : ""} affichée{parcelles.length > 1 ? "s" : ""}</span>
          <button
            onClick={handleExportExcel}
            disabled={isExportingXlsx || isLoading}
            title="Exporter les données EUDR en tableau Excel (.xlsx)"
            className="flex items-center gap-1 px-2.5 py-1 border border-green-300 rounded-lg text-xs text-green-700 hover:bg-green-50 disabled:opacity-50 transition-colors"
          >
            {isExportingXlsx
              ? <RefreshCw size={11} className="animate-spin" />
              : <FileDown size={11} />}
            {isExportingXlsx ? "Génération…" : "Exporter Excel"}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isExporting || isLoading}
            title="Exporter la carte et les statistiques en PDF"
            className="flex items-center gap-1 px-2.5 py-1 border border-gray-300 rounded-lg text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {isExporting
              ? <RefreshCw size={11} className="animate-spin" />
              : <FileDown size={11} />}
            {isExporting ? "Génération…" : "Exporter PDF"}
          </button>
          <button
            onClick={handlePrint}
            title="Imprimer le rapport EUDR directement"
            className="flex items-center gap-1 px-2.5 py-1 border border-blue-300 rounded-lg text-xs text-blue-700 hover:bg-blue-50 transition-colors"
          >
            <Printer size={11} />
            Imprimer
          </button>
        </div>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-3">
        {Object.entries(EUDR_CONFIG).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-full" style={{ background: v.color }} />
            {v.label}
          </span>
        ))}
        {showZones && filteredZones.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm border-2 border-purple-600 border-dashed" />
            Zone protégée{filterZoneType ? ` (${filterZoneType})` : ""}
          </span>
        )}
        {showGpsTerrain && gpsPolygones.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm border-2 border-amber-500" style={{ borderStyle: "dashed" }} />
            GPS Terrain{(filterVillage || filterSection) ? " (filtré)" : ""}
          </span>
        )}
        {showMembresSansGps && membresSansGpsAvecCoords.length > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-full bg-red-600" />
            Membre sans GPS
          </span>
        )}
      </div>

      {/* Carte */}
      <div className="no-print relative rounded-xl overflow-hidden border border-gray-200" style={{ height: 560 }}>
        <LeafletMap
          parcelles={parcelles}
          zones={filteredZones}
          selectedId={selected}
          onSelect={setSelected}
          drawingMode={false}
          drawVertices={[]}
          onAddVertex={() => {}}
          showZones={showZones}
          gpsTerrainPolygons={gpsPolygones}
          showGpsTerrain={showGpsTerrain}
          membresSansGps={membresSansGps}
          showMembresSansGps={showMembresSansGps}
        />
        {selectedParcelle && (
          <SidePanel
            parcelle={selectedParcelle}
            onClose={() => setSelected(null)}
            onVerifier={handleVerifier}
          />
        )}
      </div>

      {/* Répartition par section */}
      {stats && stats.par_section.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
            <Layers size={14} className="text-gray-400" />
            <h3 className="font-semibold text-gray-800 text-sm">Couverture par section</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.par_section
              .filter(s => !filterSection || s.section === filterSection)
              .map(s => (
                <div key={s.section} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">{s.section}</p>
                    <p className="text-xs text-gray-500">{s.conformes}/{s.total} conformes</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${s.pct}%`,
                          background: s.pct >= 80 ? "#16a34a" : s.pct >= 50 ? "#f59e0b" : "#dc2626",
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-700 w-10 text-right">{s.pct}%</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Tableau de synthèse pour impression uniquement */}
      {stats && stats.par_section.length > 0 && (() => {
        // Filter sections by the active filterSection (par_section has no village dimension)
        const sectionsFiltrées = stats.par_section.filter(s => !filterSection || s.section === filterSection);
        const totaux = sectionsFiltrées.reduce(
          (acc, s) => ({ conformes: acc.conformes + s.conformes, total: acc.total + s.total, superficie_ha: acc.superficie_ha + s.superficie_ha }),
          { conformes: 0, total: 0, superficie_ha: 0 },
        );
        const pctTotal = totaux.total > 0 ? Math.round((totaux.conformes / totaux.total) * 100) : 0;

        // Print KPIs — conformiteQ is now filter-aware (village+section params); stats already reflects the active filter scope
        const printTotal = (stats.membres_avec_parcelle) + (stats.membres_sans_parcelle);
        const printPct = printTotal > 0 ? Math.round((stats.membres_avec_parcelle / printTotal) * 100) : 0;
        // GPS terrain KPIs — gpsPolygones is already filtered by village+section client-side
        const printTerrainUniques = new Set(gpsPolygones.map(p => p.membreId)).size;
        const printNbPolygones = gpsPolygones.length;

        const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
        const filtreLabel = filterSection
          ? filterVillage ? `Section : ${filterSection} · Village : ${filterVillage}` : `Section : ${filterSection}`
          : filterVillage ? `Village : ${filterVillage}` : null;
        return (
          <div className="print-only">
            <div style={{ marginBottom: 16, borderBottom: "2px solid #15803d", paddingBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
              {coopLogo && (
                <img
                  src={coopLogo}
                  alt="Logo coopérative"
                  style={{ height: 50, width: "auto", objectFit: "contain", flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 10, color: "#6b7280", margin: "0 0 2px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {coopNom}{coopRegion ? ` · ${coopRegion}` : ""}
                </p>
                <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#111" }}>Rapport EUDR — Couverture GPS parcelles</h1>
                <p style={{ fontSize: 11, color: "#555", margin: "4px 0 0" }}>
                  Généré le {dateStr}
                  {filtreLabel && <span style={{ marginLeft: 8, background: "#dcfce7", color: "#15803d", borderRadius: 4, padding: "1px 6px", fontWeight: 600 }}>Filtre : {filtreLabel}</span>}
                </p>
              </div>
            </div>
            <div className="print-page-footer">
              {coopNom}{coopRegion ? ` · ${coopRegion}` : ""} &nbsp;·&nbsp; Rapport EUDR généré le {dateStr}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Couverture GPS</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{printPct}%</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{stats.membres_avec_parcelle} / {printTotal} membres</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Superficie cartographiée</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{parseFloat(String(stats.superficie_totale_ha)).toFixed(1)} ha</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{stats.nb_parcelles_total} parcelles</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Membres avec GPS terrain</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{printTerrainUniques || "—"}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{printNbPolygones} polygones collectés</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>Membres sans GPS</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.membres_sans_parcelle}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{100 - printPct}% non couverts</div>
              </div>
            </div>
            <h2 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Synthèse par section</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#16a34a", color: "#fff" }}>
                  <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>Section</th>
                  <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>Membres conformes / Total</th>
                  <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>% Conformité</th>
                  <th style={{ textAlign: "right", padding: "6px 10px", fontWeight: 600 }}>Superficie totale (ha)</th>
                </tr>
              </thead>
              <tbody>
                {sectionsFiltrées.map((s, i) => (
                  <tr key={s.section} style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <td style={{ padding: "6px 10px" }}>{s.section}</td>
                    <td style={{ textAlign: "center", padding: "6px 10px" }}>{s.conformes} / {s.total}</td>
                    <td style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600, color: s.pct >= 80 ? "#16a34a" : s.pct >= 50 ? "#d97706" : "#dc2626" }}>
                      {s.pct}%
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 10px" }}>{s.superficie_ha.toFixed(2)}</td>
                  </tr>
                ))}
                <tr style={{ background: "#f3f4f6", fontWeight: 700, borderTop: "2px solid #d1d5db" }}>
                  <td style={{ padding: "6px 10px" }}>TOTAL</td>
                  <td style={{ textAlign: "center", padding: "6px 10px" }}>{totaux.conformes} / {totaux.total}</td>
                  <td style={{ textAlign: "center", padding: "6px 10px" }}>{pctTotal}%</td>
                  <td style={{ textAlign: "right", padding: "6px 10px" }}>{totaux.superficie_ha.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = "carte" | "carte_globale" | "liste" | "conformite";

export default function ParcellePage() {
  const [tab, setTab] = useState<Tab>("carte_globale");
  const [isVerifying, setIsVerifying] = useState(false);
  const qc = useQueryClient();

  const carteQ = useQuery({
    queryKey: ["parcelles-carte"],
    queryFn: () => apiFetch<{ parcelles: ParcelleCarte[]; zones: ZoneRisque[] }>("/api/parcelles/carte"),
    enabled: tab === "carte",
  });

  const gpsTerrainQ = useQuery({
    queryKey: ["parcelles-gps-terrain"],
    queryFn: () => apiFetch<{ polygones: GpsTerrainPolygon[] }>("/api/parcelles/gps-terrain"),
    enabled: tab === "carte",
  });

  const conformiteQ = useQuery({
    queryKey: ["parcelles-conformite"],
    queryFn: () => apiFetch<ConformiteStats>("/api/parcelles/conformite"),
    enabled: tab === "conformite",
  });

  async function handleVerifier(id: number) {
    setIsVerifying(true);
    await apiFetch(`/api/parcelles/${id}/verifier-eudr`, { method: "PUT" });
    await qc.invalidateQueries({ queryKey: ["parcelles-carte"] });
    await qc.invalidateQueries({ queryKey: ["parcelles-conformite"] });
    setIsVerifying(false);
  }

  async function handleVerifierTout() {
    setIsVerifying(true);
    await apiFetch("/api/parcelles/verifier-tout", { method: "POST" });
    await qc.invalidateQueries({ queryKey: ["parcelles-carte"] });
    await qc.invalidateQueries({ queryKey: ["parcelles-conformite"] });
    await qc.invalidateQueries({ queryKey: ["parcelles-liste"] });
    setIsVerifying(false);
  }

  function handleExportGeoJSON() {
    const token = localStorage.getItem(TOKEN_KEY);
    const a = document.createElement("a");
    a.href = `/api/parcelles/export-geojson?_token=${encodeURIComponent(token ?? "")}`;
    a.download = `eudr_export_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
  }

  const tabs: { id: Tab; label: string; icon: typeof Map }[] = [
    { id: "carte_globale", label: "Vue globale",       icon: Globe },
    { id: "carte",         label: "Carte par mission", icon: Map },
    { id: "liste",         label: "Liste",             icon: List },
    { id: "conformite",    label: "Conformité EUDR",   icon: ShieldCheck },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parcelles & Cartographie EUDR</h1>
          <p className="text-gray-500 text-sm mt-1">
            Géolocalisation et conformité au règlement européen sur la déforestation
          </p>
        </div>
        <button
          onClick={handleExportGeoJSON}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
        >
          <Download size={14} />
          Export GeoJSON EUDR
        </button>
      </div>

      {/* Onglets */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {tabs.map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-green-600 text-green-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Contenu onglet */}
      {tab === "carte_globale" && (
        <OngletCarteGlobale />
      )}
      {tab === "carte" && (
        <OngletCarte
          parcelles={carteQ.data?.parcelles ?? []}
          zones={carteQ.data?.zones ?? []}
          gpsTerrainPolygons={gpsTerrainQ.data?.polygones ?? []}
          isLoading={carteQ.isFetching}
          onRefresh={() => carteQ.refetch()}
          onVerifier={handleVerifier}
        />
      )}
      {tab === "liste" && (
        <OngletListe
          onExportGeoJSON={handleExportGeoJSON}
          onVerifierTout={handleVerifierTout}
          isVerifying={isVerifying}
        />
      )}
      {tab === "conformite" && (
        <OngletConformite
          stats={conformiteQ.data}
          isLoading={conformiteQ.isLoading}
        />
      )}
    </div>
  );
}

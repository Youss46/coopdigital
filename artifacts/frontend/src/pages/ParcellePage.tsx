import "leaflet/dist/leaflet.css";
import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, Polyline, useMapEvents } from "react-leaflet";
import L from "leaflet";
import {
  Map, List, ShieldCheck, Download, Plus, RefreshCw, X, CheckCircle2,
  AlertTriangle, XCircle, Clock, HelpCircle, ChevronRight, Leaf,
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

interface ZoneRisque {
  id: number;
  nomZone: string;
  typeZone: string;
  polygoneZone: [number, number][];
  source: string | null;
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
  par_section: { section: string; total: number; conformes: number; pct: number }[];
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
}: {
  parcelles: ParcelleCarte[];
  zones: ZoneRisque[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  drawingMode: boolean;
  drawVertices: [number, number][];
  onAddVertex: (pt: [number, number]) => void;
  showZones: boolean;
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
  isLoading,
  onRefresh,
  onVerifier,
}: {
  parcelles: ParcelleCarte[];
  zones: ZoneRisque[];
  isLoading: boolean;
  onRefresh: () => void;
  onVerifier: (id: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [showZones, setShowZones] = useState(true);
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

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = "carte" | "liste" | "conformite";

export default function ParcellePage() {
  const [tab, setTab] = useState<Tab>("carte");
  const [isVerifying, setIsVerifying] = useState(false);
  const qc = useQueryClient();

  const carteQ = useQuery({
    queryKey: ["parcelles-carte"],
    queryFn: () => apiFetch<{ parcelles: ParcelleCarte[]; zones: ZoneRisque[] }>("/api/parcelles/carte"),
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
    { id: "carte",       label: "Carte",             icon: Map },
    { id: "liste",       label: "Liste",              icon: List },
    { id: "conformite",  label: "Conformité EUDR",    icon: ShieldCheck },
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
      {tab === "carte" && (
        <OngletCarte
          parcelles={carteQ.data?.parcelles ?? []}
          zones={carteQ.data?.zones ?? []}
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

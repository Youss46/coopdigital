import { useEffect, useState, useMemo } from "react";
import { useSearch } from "wouter";
import { apiGet } from "@/lib/api";
import { MapPin, Search, Fuel, Navigation, X } from "lucide-react";
import BottomNavChauffeur from "@/components/BottomNavChauffeur";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface Station {
  nom: string;
  types_carburant: string[];
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const TYPE_LABEL: Record<string, string> = {
  gasoil:  "Gasoil",
  essence: "Essence",
  super:   "Super",
};
const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
  gasoil:  { bg: "var(--t-info-bg)",    color: "var(--t-info)"    },
  essence: { bg: "var(--t-warning-bg)", color: "var(--t-warning)" },
  super:   { bg: "var(--t-success-bg)", color: "var(--t-success)" },
};

function openMaps(nom: string) {
  const q = encodeURIComponent(`station service ${nom} Côte d'Ivoire`);
  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank", "noopener");
}

/* ─── Composant ─────────────────────────────────────────────────────────── */

export default function StationChauffeur() {
  const search = useSearch();
  const params  = new URLSearchParams(search);
  const initType = params.get("type") ?? "all";

  const [stations, setStations]   = useState<Station[]>([]);
  const [loading, setLoading]     = useState(true);
  const [query, setQuery]         = useState("");
  const [typeFilter, setTypeFilter] = useState(initType);

  /* ── Chargement ── */
  useEffect(() => {
    apiGet<{ stations: Station[] }>("/chauffeur/stations")
      .then(r => setStations(r.stations))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  /* ── Types disponibles (pour chips) ── */
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    stations.forEach(s => s.types_carburant.forEach(t => set.add(t)));
    return [...set].sort();
  }, [stations]);

  /* ── Filtrage ── */
  const filtered = useMemo(() => {
    return stations.filter(s => {
      const matchType = typeFilter === "all" || s.types_carburant.includes(typeFilter);
      const matchQ    = !query.trim() || s.nom.toLowerCase().includes(query.trim().toLowerCase());
      return matchType && matchQ;
    });
  }, [stations, typeFilter, query]);

  const filterChips = [
    { value: "all", label: "Toutes" },
    ...availableTypes.map(t => ({ value: t, label: TYPE_LABEL[t] ?? t })),
  ];

  return (
    <div style={{ minHeight: "100dvh", background: "var(--t-bg)", paddingBottom: 88 }}>
      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)",
        padding: "48px 20px 32px",
        position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <MapPin size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 800, fontSize: "1.25rem" }}>Stations-service</h1>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem", marginTop: 2 }}>
              {loading ? "…" : `${filtered.length} station${filtered.length !== 1 ? "s" : ""} disponible${filtered.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <svg style={{ position: "absolute", bottom: 0, left: 0, right: 0, width: "100%", display: "block" }}
          viewBox="0 0 375 20" preserveAspectRatio="none">
          <path d="M0 20 C100 0 275 40 375 20 L375 20 L0 20Z" fill="var(--t-bg)" />
        </svg>
      </div>

      {/* ── Barre de recherche ── */}
      <div style={{ padding: "14px 16px 0" }}>
        <div style={{ position: "relative" }}>
          <Search size={16} color="var(--t-muted)"
            style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            className="t-search__input"
            style={{ paddingLeft: 42, height: 48 }}
            placeholder="Rechercher une station…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--t-muted)",
                display: "flex", alignItems: "center",
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Chips de filtrage carburant ── */}
      {availableTypes.length > 0 && (
        <div style={{ display: "flex", gap: 8, padding: "10px 16px 4px", overflowX: "auto" }}>
          {filterChips.map(f => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              style={{
                flexShrink: 0,
                padding: "6px 14px",
                borderRadius: 999,
                border: "none",
                fontSize: "0.8rem",
                fontWeight: 700,
                cursor: "pointer",
                background: typeFilter === f.value ? "var(--t-primary)" : "var(--t-card)",
                color: typeFilter === f.value ? "#fff" : "var(--t-muted)",
                boxShadow: typeFilter === f.value ? "none" : "0 1px 3px rgba(0,0,0,.07)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Indicateur filtre actif ── */}
      {typeFilter !== "all" && (
        <div style={{
          margin: "8px 16px 0",
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--t-info-bg)", borderRadius: 8, padding: "8px 12px",
        }}>
          <Fuel size={14} color="var(--t-info)" />
          <span style={{ fontSize: "0.82rem", color: "var(--t-info)", fontWeight: 600, flex: 1 }}>
            Filtré par carburant : {TYPE_LABEL[typeFilter] ?? typeFilter}
          </span>
          <button
            onClick={() => setTypeFilter("all")}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t-info)" }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Liste ── */}
      <div style={{ padding: "12px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} style={{
              height: 80, background: "var(--t-card)",
              borderRadius: "var(--t-radius)", boxShadow: "0 1px 4px rgba(0,0,0,.08)",
            }} />
          ))
        ) : filtered.length === 0 ? (
          <div className="t-empty">
            <MapPin size={40} color="var(--t-border)" />
            <p className="t-empty__text">
              {stations.length === 0
                ? "Aucune station enregistrée pour cette coopérative"
                : "Aucune station ne correspond à votre recherche"}
            </p>
            {stations.length === 0 && (
              <p style={{ fontSize: "0.82rem", color: "var(--t-muted)", maxWidth: 260, textAlign: "center", lineHeight: 1.5 }}>
                Le gestionnaire de votre coopérative peut configurer la liste des stations partenaires depuis l'espace admin.
              </p>
            )}
          </div>
        ) : (
          filtered.map((station, idx) => (
            <StationCard key={idx} station={station} />
          ))
        )}
      </div>

      <BottomNavChauffeur />
    </div>
  );
}

/* ─── Carte station ──────────────────────────────────────────────────────── */

function StationCard({ station }: { station: Station }) {
  return (
    <div className="t-card" style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px" }}>
      {/* Avatar */}
      <div style={{
        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
        background: "var(--t-primary-light)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Fuel size={20} color="var(--t-primary)" />
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontWeight: 700, fontSize: "0.95rem", color: "var(--t-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {station.nom}
        </p>

        {/* Badges carburant */}
        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
          {station.types_carburant.map(t => {
            const c = TYPE_COLOR[t] ?? { bg: "var(--t-bg)", color: "var(--t-muted)" };
            return (
              <span key={t} className="t-badge" style={{ background: c.bg, color: c.color }}>
                {TYPE_LABEL[t] ?? t}
              </span>
            );
          })}
        </div>
      </div>

      {/* Bouton directions */}
      <button
        onClick={() => openMaps(station.nom)}
        style={{
          flexShrink: 0, width: 40, height: 40,
          background: "var(--t-primary-light)", color: "var(--t-primary)",
          border: "none", borderRadius: 10, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        title="Ouvrir dans Google Maps"
      >
        <Navigation size={18} />
      </button>
    </div>
  );
}

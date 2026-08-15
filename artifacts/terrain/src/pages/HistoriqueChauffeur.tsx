import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { History, MapPin, Calendar, ChevronDown, ChevronUp, ArrowRight, CheckCircle, XCircle } from "lucide-react";
import BottomNavChauffeur from "@/components/BottomNavChauffeur";

interface Mission {
  id: number;
  type_mission: string;
  lieu_depart: string;
  lieu_arrivee: string;
  date_depart: string;
  date_arrivee_prevue: string | null;
  date_arrivee_reelle: string | null;
  statut: string;
  zone_collecte: string | null;
  section: string | null;
  observations: string | null;
  cout_fcfa: number | null;
  immatriculation: string | null;
  marque: string | null;
  modele: string | null;
}

const STATUT: Record<string, { label: string; color: string; bg: string }> = {
  terminee: { label: "Terminée", color: "var(--t-success)", bg: "var(--t-success-bg)" },
  annulee:  { label: "Annulée",  color: "var(--t-danger)",  bg: "var(--t-danger-bg)"  },
};

const TYPE: Record<string, string> = {
  collecte: "Collecte",
  livraison_exportateur: "Livraison exportateur",
  mission_achat: "Mission achat",
  autre: "Autre",
};

const FILTERS = [
  { value: "all",      label: "Toutes"   },
  { value: "terminee", label: "Terminées" },
  { value: "annulee",  label: "Annulées"  },
];

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
function formatFcfa(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR") + " FCFA";
}

function isThisMonth(d: string) {
  const date = new Date(d);
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

export default function HistoriqueChauffeur() {
  const [all, setAll]       = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    apiGet<{ missions: Mission[] }>("/chauffeur/missions")
      .then(r => setAll(r.missions.filter(m => m.statut === "terminee" || m.statut === "annulee")))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const missions = filter === "all" ? all : all.filter(m => m.statut === filter);

  const totalCeMois  = all.filter(m => isThisMonth(m.date_depart)).length;
  const terminesCeMois = all.filter(m => m.statut === "terminee" && isThisMonth(m.date_depart)).length;
  const totalTerminees = all.filter(m => m.statut === "terminee").length;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--t-bg)", paddingBottom: 88 }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)",
        padding: "48px 20px 32px", position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <History size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 800, fontSize: "1.25rem" }}>Historique</h1>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem", marginTop: 2 }}>
              Missions terminées et annulées
            </p>
          </div>
        </div>
        <svg style={{ position: "absolute", bottom: 0, left: 0, right: 0, width: "100%", display: "block" }}
          viewBox="0 0 375 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 20 C100 0 275 40 375 20 L375 20 L0 20Z" fill="var(--t-bg)" />
        </svg>
      </div>

      {/* ── Stats du mois ── */}
      <p className="t-section-title">Ce mois-ci</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "0 16px" }}>
        <StatTile
          icon={<Calendar size={20} color="var(--t-primary)" />}
          value={loading ? "…" : String(totalCeMois)}
          label="Mission(s)"
        />
        <StatTile
          icon={<CheckCircle size={20} color="var(--t-success)" />}
          value={loading ? "…" : String(terminesCeMois)}
          label="Terminée(s)"
        />
        <StatTile
          icon={<CheckCircle size={20} color="var(--t-info)" />}
          value={loading ? "…" : String(totalTerminees)}
          label="Total terminées"
        />
      </div>

      {/* ── Filtres ── */}
      <div style={{ display: "flex", gap: 8, padding: "16px 16px 4px", overflowX: "auto" }}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            style={{
              flexShrink: 0,
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              background: filter === f.value ? "var(--t-primary)" : "var(--t-card)",
              color: filter === f.value ? "#fff" : "var(--t-muted)",
              boxShadow: filter === f.value ? "none" : "0 1px 3px rgba(0,0,0,.07)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Liste ── */}
      <div style={{ padding: "10px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} style={{ height: 90, background: "var(--t-card)", borderRadius: "var(--t-radius)", boxShadow: "0 1px 4px rgba(0,0,0,.08)" }} />
          ))
        ) : missions.length === 0 ? (
          <div className="t-empty" style={{ padding: "60px 24px" }}>
            <History size={40} color="var(--t-border)" />
            <p className="t-empty__text">Aucune mission dans l'historique</p>
            <p style={{ fontSize: "0.82rem", color: "var(--t-muted)" }}>
              {filter === "all" ? "Vos missions terminées ou annulées apparaîtront ici." : "Essayez un autre filtre"}
            </p>
          </div>
        ) : (
          missions.map(m => {
            const s = STATUT[m.statut] ?? { label: m.statut, color: "var(--t-muted)", bg: "var(--t-bg)" };
            const open = expanded === m.id;
            return (
              <div key={m.id} className="t-card" style={{ padding: 0, overflow: "hidden" }}>
                {/* Barre statut */}
                <div style={{ height: 4, background: s.color }} />

                {/* Ligne principale cliquable */}
                <button
                  style={{ width: "100%", background: "none", border: "none", textAlign: "left", padding: "12px 16px", cursor: "pointer" }}
                  onClick={() => setExpanded(open ? null : m.id)}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Statut + type */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{
                          fontSize: "0.72rem", fontWeight: 700,
                          padding: "3px 9px", borderRadius: 999,
                          background: s.bg, color: s.color,
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          {m.statut === "terminee"
                            ? <CheckCircle size={11} />
                            : <XCircle size={11} />
                          }
                          {s.label}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--t-muted)" }}>
                          {TYPE[m.type_mission] ?? m.type_mission}
                        </span>
                      </div>
                      {/* Route */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                        <MapPin size={13} color="var(--t-muted)" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--t-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                          {m.lieu_depart}
                        </span>
                        <ArrowRight size={12} color="var(--t-muted)" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--t-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
                          {m.lieu_arrivee}
                        </span>
                      </div>
                      {/* Véhicule + date */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem", color: "var(--t-muted)" }}>
                        <span style={{ fontFamily: "monospace" }}>{m.immatriculation ?? "—"}</span>
                        <span>·</span>
                        <Calendar size={11} />
                        <span>{fmtShort(m.date_depart)}</span>
                      </div>
                    </div>
                    {open
                      ? <ChevronUp size={16} color="var(--t-muted)" style={{ flexShrink: 0, marginTop: 4 }} />
                      : <ChevronDown size={16} color="var(--t-muted)" style={{ flexShrink: 0, marginTop: 4 }} />
                    }
                  </div>
                </button>

                {/* Détails */}
                {open && (
                  <div style={{
                    borderTop: "1px solid var(--t-border)",
                    padding: "12px 16px",
                    display: "flex", flexDirection: "column", gap: 7,
                  }}>
                    <DetailRow label="Véhicule" value={[m.immatriculation, m.marque, m.modele].filter(Boolean).join(" ") || "—"} />
                    {m.zone_collecte && <DetailRow label="Zone" value={m.zone_collecte} />}
                    {m.section && <DetailRow label="Section" value={m.section} />}
                    <DetailRow label="Départ prévu" value={fmt(m.date_depart)} />
                    {m.date_arrivee_prevue && <DetailRow label="Arrivée prévue" value={fmt(m.date_arrivee_prevue)} />}
                    {m.date_arrivee_reelle && <DetailRow label="Arrivée réelle" value={fmt(m.date_arrivee_reelle)} />}
                    {m.cout_fcfa != null && (
                      <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 6, borderTop: "1px solid var(--t-border)" }}>
                        <span style={{ fontSize: "0.82rem", color: "var(--t-muted)" }}>Coût mission</span>
                        <span style={{ fontSize: "0.82rem", fontWeight: 800, color: "var(--t-primary)" }}>{formatFcfa(m.cout_fcfa)}</span>
                      </div>
                    )}
                    {m.observations && (
                      <div style={{ background: "var(--t-bg)", borderRadius: 8, padding: "8px 12px", marginTop: 4 }}>
                        <p style={{ fontSize: "0.72rem", color: "var(--t-muted)", marginBottom: 3 }}>Observations</p>
                        <p style={{ fontSize: "0.82rem", color: "var(--t-text)", fontStyle: "italic", lineHeight: 1.4 }}>{m.observations}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <BottomNavChauffeur />
    </div>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="t-stat">
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>{icon}</div>
      <p className="t-stat__value" style={{ fontSize: "1.2rem" }}>{value}</p>
      <p className="t-stat__label">{label}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
      <span style={{ fontSize: "0.78rem", color: "var(--t-muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--t-text)", textAlign: "right" }}>{value}</span>
    </div>
  );
}

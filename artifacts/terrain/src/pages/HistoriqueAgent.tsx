import { useEffect, useState } from "react";
import { getHistoriqueAgent } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavAgent from "../components/BottomNavAgent";
import type { MissionTerrain } from "../lib/types";

const STATUT_LABEL: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  planifiee: { label: "Planifiée", color: "#6366f1", bg: "#eef2ff", icon: "🕒" },
  en_cours:  { label: "En cours",  color: "#d97706", bg: "#fef3c7", icon: "⚡" },
  soumise:   { label: "Soumise",   color: "#2563eb", bg: "#dbeafe", icon: "📤" },
  validee:   { label: "Validée",   color: "#16a34a", bg: "#dcfce7", icon: "✅" },
  rejetee:   { label: "Rejetée",   color: "#dc2626", bg: "#fee2e2", icon: "❌" },
};

type FiltreKey = "toutes" | "en_cours" | "validee" | "rejetee";

const FILTRES: { key: FiltreKey; label: string }[] = [
  { key: "toutes",    label: "Toutes" },
  { key: "en_cours",  label: "⚡ En cours" },
  { key: "validee",   label: "✅ Validées" },
  { key: "rejetee",   label: "❌ Rejetées" },
];

export default function HistoriqueAgent() {
  const { isOnline } = useOffline();
  const [missions, setMissions] = useState<MissionTerrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<FiltreKey>("toutes");

  useEffect(() => {
    if (!isOnline) { setLoading(false); return; }
    getHistoriqueAgent().then(setMissions).catch(() => {}).finally(() => setLoading(false));
  }, [isOnline]);

  const displayed = filtre === "toutes"
    ? missions
    : missions.filter((m) => m.statut === filtre);

  return (
    <div className="t-app">
      <header className="t-header">
        <div className="t-header__title">📋 Historique</div>
      </header>

      <OfflineBanner />

      <div style={{ display: "flex", gap: 6, padding: "12px 16px", background: "var(--t-card)", borderBottom: "1px solid var(--t-border)", overflowX: "auto" }}>
        {FILTRES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFiltre(key)}
            style={{
              flexShrink: 0,
              padding: "7px 10px",
              borderRadius: 8,
              border: "none",
              fontSize: ".78rem",
              fontWeight: 600,
              cursor: "pointer",
              background: filtre === key ? "var(--t-primary)" : "var(--t-border)",
              color: filtre === key ? "#fff" : "var(--t-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <main className="t-main">
        {loading ? (
          <div className="t-spinner" />
        ) : !isOnline ? (
          <div className="t-card" style={{ textAlign: "center", color: "var(--t-warning)" }}>
            📡 Hors ligne — données non disponibles
          </div>
        ) : displayed.length === 0 ? (
          <div className="t-card" style={{ textAlign: "center", color: "var(--t-muted)", padding: 24 }}>
            Aucune mission trouvée
          </div>
        ) : (
          displayed.map((m) => {
            const s = STATUT_LABEL[m.statut] ?? { label: m.statut, color: "var(--t-muted)", bg: "var(--t-border)", icon: "❓" };
            const tauxValid = m.tauxValidation ?? (m.membresCollectes > 0 && m.membresValides !== undefined
              ? Math.round((m.membresValides / m.membresCollectes) * 100)
              : 0);
            return (
              <div key={m.id} style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", borderLeft: `3px solid ${s.color}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700, fontSize: ".95rem" }}>{m.titre}</div>
                  <span style={{ fontSize: ".7rem", background: s.bg, color: s.color, borderRadius: 4, padding: "2px 7px", flexShrink: 0, marginLeft: 6 }}>
                    {s.icon} {s.label}
                  </span>
                </div>
                <div style={{ color: "var(--t-muted)", fontSize: ".78rem", marginTop: 4 }}>
                  {m.zoneType} · {m.zoneNom}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--t-success)" }}>{m.membresCollectes}</div>
                    <div style={{ fontSize: ".65rem", color: "var(--t-muted)" }}>Collectées</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--t-info)" }}>{m.membresValides ?? "—"}</div>
                    <div style={{ fontSize: ".65rem", color: "var(--t-muted)" }}>Validées</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--t-warning)" }}>{tauxValid}%</div>
                    <div style={{ fontSize: ".65rem", color: "var(--t-muted)" }}>Taux valid.</div>
                  </div>
                </div>
                {m.statut === "rejetee" && m.motifRejet && (
                  <div style={{ marginTop: 8, fontSize: ".78rem", color: "var(--t-danger)", background: "var(--t-danger-bg)", padding: "6px 8px", borderRadius: 6 }}>
                    Motif : {m.motifRejet}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: ".72rem", color: "var(--t-muted)" }}>
                  Mis à jour : {new Date(m.updatedAt).toLocaleDateString("fr-FR")}
                </div>
              </div>
            );
          })
        )}
      </main>

      <BottomNavAgent />
    </div>
  );
}

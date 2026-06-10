import { useEffect, useState } from "react";
import { getHistoriqueAgent } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavAgent from "../components/BottomNavAgent";
import type { MissionTerrain } from "../lib/types";

const STATUT_LABEL: Record<string, { label: string; color: string; icon: string }> = {
  planifiee: { label: "Planifiée", color: "#6366f1", icon: "🕒" },
  en_cours:  { label: "En cours",  color: "#f59e0b", icon: "⚡" },
  soumise:   { label: "Soumise",   color: "#3b82f6", icon: "📤" },
  validee:   { label: "Validée",   color: "#22c55e", icon: "✅" },
  rejetee:   { label: "Rejetée",   color: "#ef4444", icon: "❌" },
};

export default function HistoriqueAgent() {
  const { isOnline } = useOffline();
  const [missions, setMissions] = useState<MissionTerrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtre, setFiltre] = useState<"toutes" | "validee" | "rejetee">("toutes");

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

      <div style={{ display: "flex", gap: 8, padding: "12px 16px 0", background: "#0f172a" }}>
        {(["toutes", "validee", "rejetee"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltre(f)}
            style={{
              flex: 1, padding: "7px 4px", borderRadius: 8, border: "none",
              fontSize: ".8rem", fontWeight: 600, cursor: "pointer",
              background: filtre === f ? "#3b82f6" : "#1e2d45",
              color: filtre === f ? "#fff" : "#94a3b8",
            }}
          >
            {f === "toutes" ? "Toutes" : f === "validee" ? "✅ Validées" : "❌ Rejetées"}
          </button>
        ))}
      </div>

      <main className="t-main">
        {loading ? (
          <div className="t-spinner" />
        ) : !isOnline ? (
          <div className="t-card" style={{ textAlign: "center", color: "#f59e0b" }}>
            📡 Hors ligne — données non disponibles
          </div>
        ) : displayed.length === 0 ? (
          <div className="t-card" style={{ textAlign: "center", color: "#64748b", padding: 24 }}>
            Aucune mission trouvée
          </div>
        ) : (
          displayed.map((m) => {
            const s = STATUT_LABEL[m.statut] ?? { label: m.statut, color: "#94a3b8", icon: "❓" };
            const pct = m.membresTotal > 0
              ? Math.round((m.membresCollectes / m.membresTotal) * 100)
              : 0;
            return (
              <div key={m.id} style={{ background: "#1e2d45", borderRadius: 12, padding: "14px 16px", marginBottom: 10, borderLeft: `3px solid ${s.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ fontWeight: 700, fontSize: ".95rem" }}>{m.titre}</div>
                  <span style={{ fontSize: ".7rem", background: s.color + "33", color: s.color, borderRadius: 4, padding: "2px 7px" }}>
                    {s.icon} {s.label}
                  </span>
                </div>
                <div style={{ color: "#94a3b8", fontSize: ".78rem", marginTop: 4 }}>
                  {m.zoneType} · {m.zoneNom}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#22c55e" }}>{m.membresCollectes}</div>
                    <div style={{ fontSize: ".65rem", color: "#64748b" }}>Collectées</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#3b82f6" }}>{m.membresTotal}</div>
                    <div style={{ fontSize: ".65rem", color: "#64748b" }}>Total</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#f59e0b" }}>{pct}%</div>
                    <div style={{ fontSize: ".65rem", color: "#64748b" }}>Taux</div>
                  </div>
                </div>
                {m.statut === "rejetee" && m.motifRejet && (
                  <div style={{ marginTop: 8, fontSize: ".78rem", color: "#ef4444", background: "#ef444422", padding: "6px 8px", borderRadius: 6 }}>
                    Motif : {m.motifRejet}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: ".72rem", color: "#475569" }}>
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

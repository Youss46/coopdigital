import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getMissions } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavAgent from "../components/BottomNavAgent";
import type { MissionTerrain } from "../lib/types";

type TabKey = "actives" | "soumises" | "terminees";

const STATUT_LABEL: Record<string, { label: string; color: string }> = {
  planifiee: { label: "Planifiée", color: "#6366f1" },
  en_cours:  { label: "En cours",  color: "#f59e0b" },
  soumise:   { label: "Soumise",   color: "#3b82f6" },
  validee:   { label: "Validée",   color: "#22c55e" },
  rejetee:   { label: "Rejetée",   color: "#ef4444" },
};

function filterByTab(missions: MissionTerrain[], tab: TabKey): MissionTerrain[] {
  if (tab === "actives") return missions.filter((m) => m.statut === "planifiee" || m.statut === "en_cours");
  if (tab === "soumises") return missions.filter((m) => m.statut === "soumise");
  return missions.filter((m) => m.statut === "validee" || m.statut === "rejetee");
}

export default function MissionsAgent() {
  const { isOnline } = useOffline();
  const [missions, setMissions] = useState<MissionTerrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("actives");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!isOnline) { setLoading(false); return; }
    getMissions()
      .then(setMissions)
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [isOnline]);

  const displayed = filterByTab(missions, tab);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "actives",   label: "Actives",   count: filterByTab(missions, "actives").length },
    { key: "soumises",  label: "Soumises",  count: filterByTab(missions, "soumises").length },
    { key: "terminees", label: "Terminées", count: filterByTab(missions, "terminees").length },
  ];

  return (
    <div className="t-app">
      <header className="t-header">
        <div className="t-header__title">📍 Mes missions</div>
      </header>

      <OfflineBanner />

      <div style={{ display: "flex", gap: 8, padding: "12px 16px 0", background: "#0f172a" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: "8px 4px",
              borderRadius: 8,
              border: "none",
              fontSize: ".8rem",
              fontWeight: 600,
              cursor: "pointer",
              background: tab === t.key ? "#3b82f6" : "#1e2d45",
              color: tab === t.key ? "#fff" : "#94a3b8",
            }}
          >
            {t.label} {t.count > 0 && <span style={{ fontSize: ".7rem", opacity: .8 }}>({t.count})</span>}
          </button>
        ))}
      </div>

      <main className="t-main">
        {loading ? (
          <div className="t-spinner" />
        ) : erreur ? (
          <div className="t-error">{erreur}</div>
        ) : !isOnline ? (
          <div className="t-card" style={{ textAlign: "center", color: "#f59e0b" }}>
            📡 Hors ligne — données non disponibles
          </div>
        ) : displayed.length === 0 ? (
          <div className="t-card" style={{ textAlign: "center", color: "#64748b", padding: "24px" }}>
            Aucune mission {tab === "actives" ? "active" : tab === "soumises" ? "soumise" : "terminée"}
          </div>
        ) : (
          displayed.map((m) => {
            const s = STATUT_LABEL[m.statut] ?? { label: m.statut, color: "#94a3b8" };
            const pct = m.membresTotal > 0 ? Math.round((m.membresCollectes / m.membresTotal) * 100) : 0;
            return (
              <Link key={m.id} href={`/missions/${m.id}`}>
                <div style={{ background: "#1e2d45", borderRadius: 12, padding: "14px 16px", marginBottom: 10, cursor: "pointer", borderLeft: `3px solid ${s.color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontWeight: 700, fontSize: ".95rem" }}>{m.titre}</div>
                    <span style={{ fontSize: ".7rem", background: s.color + "33", color: s.color, borderRadius: 4, padding: "2px 7px", flexShrink: 0, marginLeft: 8 }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: ".78rem", marginTop: 4 }}>
                    {m.zoneType} · {m.zoneNom}
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: ".78rem" }}>
                    📅 {new Date(m.datePrevue).toLocaleDateString("fr-FR")}
                  </div>
                  {m.statut !== "planifiee" && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", color: "#94a3b8", marginBottom: 3 }}>
                        <span>{m.membresCollectes}/{m.membresTotal} parcelles</span>
                        <span>{pct}%</span>
                      </div>
                      <div style={{ height: 5, background: "#1a2035", borderRadius: 3 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "#22c55e", borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                  {m.statut === "rejetee" && m.motifRejet && (
                    <div style={{ marginTop: 6, fontSize: ".78rem", color: "#ef4444" }}>
                      ❌ {m.motifRejet}
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </main>

      <BottomNavAgent />
    </div>
  );
}

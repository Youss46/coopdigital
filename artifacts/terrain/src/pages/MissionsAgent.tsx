import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getMissions } from "../lib/api";
import { cacheMissions, getCachedMissions } from "../lib/idb";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavAgent from "../components/BottomNavAgent";
import type { MissionTerrain } from "../lib/types";

type TabKey = "planifiees" | "en_cours" | "a_corriger";

const STATUT_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  planifiee: { label: "Planifiée",  color: "#6366f1", bg: "#eef2ff" },
  en_cours:  { label: "En cours",   color: "#d97706", bg: "#fef3c7" },
  soumise:   { label: "Soumise",    color: "#2563eb", bg: "#dbeafe" },
  validee:   { label: "Validée",    color: "#16a34a", bg: "#dcfce7" },
  rejetee:   { label: "À corriger", color: "#dc2626", bg: "#fee2e2" },
};

function filterByTab(missions: MissionTerrain[], tab: TabKey): MissionTerrain[] {
  if (tab === "planifiees") return missions.filter((m) => m.statut === "planifiee");
  if (tab === "en_cours") return missions.filter((m) => m.statut === "en_cours");
  return missions.filter((m) => m.statut === "rejetee");
}

export default function MissionsAgent() {
  const { isOnline } = useOffline();
  const [missions, setMissions] = useState<MissionTerrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [tab, setTab] = useState<TabKey>("en_cours");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (isOnline) {
      getMissions()
        .then((data) => {
          setMissions(data);
          setFromCache(false);
          cacheMissions(data).catch(() => {});
        })
        .catch((e: Error) => setErreur(e.message))
        .finally(() => setLoading(false));
    } else {
      getCachedMissions()
        .then((data) => {
          setMissions(data);
          setFromCache(true);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOnline]);

  const displayed = filterByTab(missions, tab);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "planifiees",  label: "Planifiées",  count: filterByTab(missions, "planifiees").length },
    { key: "en_cours",   label: "En cours",     count: filterByTab(missions, "en_cours").length },
    { key: "a_corriger", label: "À corriger",   count: filterByTab(missions, "a_corriger").length },
  ];

  const tabLabel = tab === "planifiees" ? "planifiée" : tab === "en_cours" ? "en cours" : "à corriger";

  return (
    <div className="t-app">
      <header className="t-header">
        <div className="t-header__title">📍 Mes missions</div>
        {fromCache && (
          <span style={{ fontSize: ".7rem", background: "var(--t-warning-bg)", color: "var(--t-warning)", borderRadius: 4, padding: "2px 6px" }}>
            📦 cache
          </span>
        )}
      </header>

      <OfflineBanner />

      <div style={{ display: "flex", gap: 8, padding: "12px 16px", background: "var(--t-card)", borderBottom: "1px solid var(--t-border)" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1,
              padding: "8px 4px",
              borderRadius: 8,
              border: "none",
              fontSize: ".78rem",
              fontWeight: 600,
              cursor: "pointer",
              background: tab === t.key ? "var(--t-primary)" : "var(--t-border)",
              color: tab === t.key ? "#fff" : "var(--t-muted)",
              position: "relative",
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                position: "absolute",
                top: -6,
                right: -4,
                background: t.key === "a_corriger" ? "var(--t-danger)" : "var(--t-info)",
                color: "#fff",
                borderRadius: "50%",
                width: 16,
                height: 16,
                fontSize: ".65rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <main className="t-main">
        {loading ? (
          <div className="t-spinner" />
        ) : erreur ? (
          <div className="t-error">{erreur}</div>
        ) : displayed.length === 0 ? (
          <div className="t-card" style={{ textAlign: "center", color: "var(--t-muted)", padding: "24px" }}>
            {fromCache && missions.length === 0
              ? "📡 Hors ligne — aucune donnée en cache"
              : `Aucune mission ${tabLabel}`}
          </div>
        ) : (
          displayed.map((m) => {
            const s = STATUT_LABEL[m.statut] ?? { label: m.statut, color: "var(--t-muted)", bg: "var(--t-border)" };
            const pct = m.membresTotal > 0 ? Math.round((m.membresCollectes / m.membresTotal) * 100) : 0;
            return (
              <Link key={m.id} href={`/missions/${m.id}`}>
                <div style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", borderLeft: `3px solid ${s.color}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ fontWeight: 700, fontSize: ".95rem" }}>{m.titre}</div>
                    <span style={{ fontSize: ".7rem", background: s.bg, color: s.color, borderRadius: 4, padding: "2px 7px", flexShrink: 0, marginLeft: 8 }}>
                      {s.label}
                    </span>
                  </div>
                  <div style={{ color: "var(--t-muted)", fontSize: ".78rem", marginTop: 4 }}>
                    {m.zoneType} · {m.zoneNom}
                  </div>
                  <div style={{ color: "var(--t-muted)", fontSize: ".78rem" }}>
                    📅 {new Date(m.datePrevue).toLocaleDateString("fr-FR")}
                  </div>
                  {m.statut !== "planifiee" && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", color: "var(--t-muted)", marginBottom: 3 }}>
                        <span>{m.membresCollectes}/{m.membresTotal} parcelles</span>
                        <span>{pct}%</span>
                      </div>
                      <div style={{ height: 5, background: "var(--t-border)", borderRadius: 3 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "var(--t-success)", borderRadius: 3 }} />
                      </div>
                    </div>
                  )}
                  {m.statut === "rejetee" && m.motifRejet && (
                    <div style={{ marginTop: 6, fontSize: ".78rem", color: "var(--t-danger)" }}>
                      ❌ Motif : {m.motifRejet}
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

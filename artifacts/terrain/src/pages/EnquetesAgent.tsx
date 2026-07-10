import { useEffect, useState } from "react";
import { Link } from "wouter";
import { apiGet } from "../lib/api";
import { cacheEnquetes, getCachedEnquetes } from "../lib/idb";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavAgent from "../components/BottomNavAgent";
import type { MissionEnquete } from "../lib/types";

const STATUT_LABEL: Record<string, { label: string; color: string }> = {
  planifiee: { label: "Planifiée", color: "#6366f1" },
  en_cours:  { label: "En cours",  color: "#f59e0b" },
  soumise:   { label: "Soumise",   color: "#3b82f6" },
  validee:   { label: "Validée",   color: "#22c55e" },
};

const TYPE_LABEL: Record<string, string> = {
  rainforest_alliance: "Rainforest Alliance",
  fairtrade: "Fairtrade",
  bio: "Bio",
  eudr: "EUDR",
};

export default function EnquetesAgent() {
  const { isOnline } = useOffline();
  const [enquetes, setEnquetes] = useState<MissionEnquete[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (isOnline) {
      apiGet<MissionEnquete[]>("/enquetes")
        .then((data: import("../lib/types").MissionEnquete[]) => {
          setEnquetes(data);
          setFromCache(false);
          cacheEnquetes(data).catch(() => {});
        })
        .catch((e: Error) => setErreur(e.message))
        .finally(() => setLoading(false));
    } else {
      getCachedEnquetes()
        .then((data) => { setEnquetes(data); setFromCache(true); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOnline]);

  return (
    <div className="t-app">
      <header className="t-header">
        <div className="t-header__title">📋 Mes enquêtes</div>
        {fromCache && (
          <span style={{ fontSize: ".7rem", background: "#f59e0b22", color: "#f59e0b", borderRadius: 4, padding: "2px 6px" }}>
            📦 cache
          </span>
        )}
      </header>

      <OfflineBanner />

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 80px" }}>
        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 14 }}>Chargement…</div>
        )}
        {erreur && (
          <div style={{ background: "#7f1d1d22", color: "#fca5a5", padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            ⚠ {erreur}
          </div>
        )}
        {!loading && enquetes.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <p style={{ fontSize: 14, margin: 0 }}>Aucune mission d'enquête assignée</p>
          </div>
        )}
        {enquetes.map(e => {
          const sc = STATUT_LABEL[e.statut] ?? { label: e.statut, color: "#6b7280" };
          const pct = e.membresTotal > 0 ? Math.round((e.membresProgres / e.membresTotal) * 100) : 0;
          return (
            <Link key={e.id} href={`/enquetes/${e.id}`} style={{ textDecoration: "none" }}>
              <div style={{
                background: "#1e293b", borderRadius: 10, padding: "14px", marginBottom: 10,
                border: "1px solid #334155", cursor: "pointer",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9", marginBottom: 3 }}>{e.titre}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>
                      {TYPE_LABEL[e.certType ?? ""] ?? e.certType} · Prévu le {new Date(e.datePrevue).toLocaleDateString("fr-FR")}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: sc.color,
                    background: `${sc.color}22`, padding: "3px 8px", borderRadius: 4, flexShrink: 0, marginLeft: 8,
                  }}>{sc.label}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {e.membresProgres}/{e.membresTotal} membres enquêtés
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? "#4ade80" : "#f59e0b" }}>
                    {pct}%
                  </span>
                </div>
                {e.membresTotal > 0 && (
                  <div style={{ height: 4, background: "#334155", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#4ade80" : "#f59e0b", borderRadius: 2 }} />
                  </div>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      <BottomNavAgent />
    </div>
  );
}

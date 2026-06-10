import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getStatsAgent, getMissions } from "../lib/api";
import { cacheMissions, getCachedMissions } from "../lib/idb";
import { useAuth } from "../contexts/AuthContext";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavAgent from "../components/BottomNavAgent";
import type { StatsAgent, MissionTerrain } from "../lib/types";

const STATUT_LABEL: Record<string, { label: string; color: string }> = {
  planifiee: { label: "Planifiée", color: "#6366f1" },
  en_cours:  { label: "En cours",  color: "#f59e0b" },
  soumise:   { label: "Soumise",   color: "#3b82f6" },
  validee:   { label: "Validée",   color: "#22c55e" },
  rejetee:   { label: "À corriger", color: "#ef4444" },
};

export default function AccueilAgent() {
  const { user, logout } = useAuth();
  const { isOnline, pendingCount } = useOffline();
  const [stats, setStats] = useState<StatsAgent | null>(null);
  const [missions, setMissions] = useState<MissionTerrain[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeconnexion, setConfirmDeconnexion] = useState(false);

  useEffect(() => {
    if (isOnline) {
      Promise.all([
        getStatsAgent().then(setStats).catch(() => {}),
        getMissions()
          .then((data) => { setMissions(data); cacheMissions(data).catch(() => {}); })
          .catch(() => {}),
      ]).finally(() => setLoading(false));
    } else {
      getCachedMissions()
        .then(setMissions)
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [isOnline]);

  const activeMissions = [...missions]
    .filter((m) => m.statut === "planifiee" || m.statut === "en_cours")
    .sort((a, b) => new Date(a.datePrevue).getTime() - new Date(b.datePrevue).getTime());

  const prochaineMission = activeMissions[0] ?? null;

  const notifications = missions.filter(
    (m) => m.statut === "validee" || m.statut === "rejetee",
  ).slice(0, 3);

  return (
    <div className="t-app">
      <header className="t-header">
        <div style={{ flex: 1 }}>
          <div className="t-header__title">Bonjour, {user?.nom} 👋</div>
          <div className="t-header__sub">
            {user?.zoneNom ? `Zone : ${user.zoneNom}` : "Agent terrain"}
          </div>
        </div>
        {pendingCount > 0 && (
          <span className="t-header__badge">📴 {pendingCount}</span>
        )}
        <button
          onClick={() => setConfirmDeconnexion(true)}
          style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: ".8rem", fontWeight: 700, cursor: "pointer" }}
        >
          ⎋
        </button>
      </header>

      <OfflineBanner />

      <main className="t-main">
        {loading ? (
          <div className="t-spinner" />
        ) : (
          <>
            {stats && (
              <div className="t-card" style={{ marginBottom: 12 }}>
                <div className="t-card__title">📊 Mes statistiques</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#22c55e" }}>{stats.parcellesMappees}</div>
                    <div style={{ fontSize: ".7rem", color: "#94a3b8" }}>Parcelles</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#3b82f6" }}>{stats.missionsTerminees}</div>
                    <div style={{ fontSize: ".7rem", color: "#94a3b8" }}>Validées</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#f59e0b" }}>{stats.tauxValidation}%</div>
                    <div style={{ fontSize: ".7rem", color: "#94a3b8" }}>Taux</div>
                  </div>
                </div>
              </div>
            )}

            {prochaineMission && (
              <div className="t-card" style={{ marginBottom: 12, borderLeft: "3px solid #6366f1" }}>
                <div className="t-card__title" style={{ marginBottom: 8 }}>🎯 Prochaine mission</div>
                <Link href={`/missions/${prochaineMission.id}`}>
                  <div style={{ cursor: "pointer" }}>
                    <div style={{ fontWeight: 700, fontSize: ".95rem" }}>{prochaineMission.titre}</div>
                    <div style={{ color: "#94a3b8", fontSize: ".78rem", marginTop: 2 }}>
                      {prochaineMission.zoneNom} · 📅 {new Date(prochaineMission.datePrevue).toLocaleDateString("fr-FR")}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".75rem", color: "#94a3b8", marginTop: 8 }}>
                      <span>{prochaineMission.membresCollectes}/{prochaineMission.membresTotal} parcelles collectées</span>
                      <span style={{ color: STATUT_LABEL[prochaineMission.statut]?.color ?? "#94a3b8" }}>
                        {STATUT_LABEL[prochaineMission.statut]?.label ?? prochaineMission.statut}
                      </span>
                    </div>
                    {prochaineMission.membresTotal > 0 && (
                      <div style={{ height: 4, background: "#1a2035", borderRadius: 2, marginTop: 4 }}>
                        <div style={{
                          width: `${Math.round((prochaineMission.membresCollectes / prochaineMission.membresTotal) * 100)}%`,
                          height: "100%", background: "#22c55e", borderRadius: 2,
                        }} />
                      </div>
                    )}
                  </div>
                </Link>
              </div>
            )}

            {notifications.length > 0 && (
              <div className="t-card" style={{ marginBottom: 12 }}>
                <div className="t-card__title" style={{ marginBottom: 8 }}>🔔 Notifications</div>
                {notifications.map((m) => {
                  const isRejetee = m.statut === "rejetee";
                  return (
                    <Link key={m.id} href={`/missions/${m.id}`}>
                      <div style={{
                        background: isRejetee ? "#ef444411" : "#22c55e11",
                        borderLeft: `3px solid ${isRejetee ? "#ef4444" : "#22c55e"}`,
                        borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontWeight: 600, fontSize: ".88rem" }}>
                            {isRejetee ? "❌" : "✅"} {m.titre}
                          </div>
                          <span style={{ fontSize: ".68rem", color: isRejetee ? "#ef4444" : "#22c55e", fontWeight: 600 }}>
                            {isRejetee ? "À corriger" : "Validée"}
                          </span>
                        </div>
                        {isRejetee && m.motifRejet && (
                          <div style={{ fontSize: ".75rem", color: "#ef4444", marginTop: 3 }}>
                            {m.motifRejet}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="t-card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className="t-card__title">📍 Missions actives</div>
                <Link href="/missions" style={{ fontSize: ".75rem", color: "#3b82f6" }}>Voir tout →</Link>
              </div>

              {activeMissions.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: ".85rem", textAlign: "center", padding: "12px 0" }}>
                  {!isOnline && missions.length === 0 ? "📡 Hors ligne — aucune donnée en cache" : "Aucune mission en cours"}
                </div>
              ) : (
                activeMissions.slice(0, 3).map((m) => {
                  const s = STATUT_LABEL[m.statut] ?? { label: m.statut, color: "#94a3b8" };
                  const pct = m.membresTotal > 0 ? Math.round((m.membresCollectes / m.membresTotal) * 100) : 0;
                  return (
                    <Link key={m.id} href={`/missions/${m.id}`}>
                      <div style={{ background: "#1e2d45", borderRadius: 10, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{m.titre}</div>
                          <span style={{ fontSize: ".7rem", background: s.color + "33", color: s.color, borderRadius: 4, padding: "2px 6px" }}>
                            {s.label}
                          </span>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: ".75rem", marginTop: 2 }}>
                          {m.zoneNom} · {new Date(m.datePrevue).toLocaleDateString("fr-FR")}
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <div style={{ height: 4, background: "#1a2035", borderRadius: 2 }}>
                            <div style={{ width: `${pct}%`, height: "100%", background: "#22c55e", borderRadius: 2 }} />
                          </div>
                          <div style={{ fontSize: ".7rem", color: "#94a3b8", marginTop: 2 }}>
                            {m.membresCollectes}/{m.membresTotal} parcelle(s)
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>

            {!isOnline && (
              <div className="t-card" style={{ background: "#1e293b", borderLeft: "3px solid #f59e0b" }}>
                <div style={{ fontSize: ".85rem", color: "#f59e0b" }}>
                  📡 Hors ligne — la collecte GPS sera sauvegardée et synchronisée à la reconnexion.
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {confirmDeconnexion && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setConfirmDeconnexion(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 320, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#111" }}>Déconnexion</div>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <div style={{ fontSize: ".9rem", color: "#555" }}>Voulez-vous vraiment vous déconnecter ?</div>
              {pendingCount > 0 && (
                <div style={{ marginTop: 8, fontSize: ".85rem", color: "#f59e0b" }}>
                  ⚠️ {pendingCount} opération(s) en attente de synchronisation.
                </div>
              )}
            </div>
            <div style={{ padding: "0 24px 20px", display: "flex", gap: 12 }}>
              <button
                onClick={() => setConfirmDeconnexion(false)}
                style={{ flex: 1, padding: "10px", border: "1px solid #e0e0e0", borderRadius: 10, fontSize: ".85rem", fontWeight: 600, cursor: "pointer", background: "#fff", color: "#333" }}
              >
                Annuler
              </button>
              <button
                onClick={logout}
                style={{ flex: 1, padding: "10px", border: "none", borderRadius: 10, fontSize: ".85rem", fontWeight: 600, cursor: "pointer", background: "#dc2626", color: "#fff" }}
              >
                Déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNavAgent />
    </div>
  );
}

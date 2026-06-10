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
  rejetee:   { label: "Rejetée",   color: "#ef4444" },
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

  const activeMissions = missions.filter((m) => m.statut === "planifiee" || m.statut === "en_cours");

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

            <div className="t-card" style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className="t-card__title">📍 Missions actives</div>
                <Link href="/missions" style={{ fontSize: ".75rem", color: "#3b82f6" }}>Voir tout →</Link>
              </div>

              {activeMissions.length === 0 ? (
                <div style={{ color: "#64748b", fontSize: ".85rem", textAlign: "center", padding: "12px 0" }}>
                  Aucune mission en cours
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
                  📡 Hors ligne — la collecte GPS sera sauvegardée localement et synchronisée dès le retour de la connexion.
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {confirmDeconnexion && (
        <div className="t-modal-overlay" onClick={() => setConfirmDeconnexion(false)}>
          <div className="t-modal" onClick={(e) => e.stopPropagation()}>
            <div className="t-modal__title">Déconnexion</div>
            <p>Confirmer la déconnexion ?</p>
            {pendingCount > 0 && (
              <p style={{ color: "#f59e0b", fontSize: ".85rem" }}>
                ⚠️ {pendingCount} opération(s) en attente de synchronisation.
              </p>
            )}
            <div className="t-modal__actions">
              <button className="t-btn t-btn--ghost" onClick={() => setConfirmDeconnexion(false)}>Annuler</button>
              <button className="t-btn t-btn--danger" onClick={logout}>Déconnecter</button>
            </div>
          </div>
        </div>
      )}

      <BottomNavAgent />
    </div>
  );
}

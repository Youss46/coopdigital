import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { apiGet } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavAgent from "../components/BottomNavAgent";
import type { EnqueteDetail } from "../lib/types";

const STATUT_LABEL: Record<string, { label: string; color: string }> = {
  a_faire:  { label: "À faire",  color: "#94a3b8" },
  collecte: { label: "Collecté", color: "#4ade80" },
  valide:   { label: "Validé",   color: "#22c55e" },
};

export default function MissionEnqueteDetail() {
  const { id } = useParams<{ id: string }>();
  const missionId = Number(id);
  const { isOnline } = useOffline();
  const [mission, setMission] = useState<EnqueteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (isOnline) {
      apiGet<EnqueteDetail>(`/enquetes/${missionId}`)
        .then(setMission)
        .catch((e: Error) => setErreur(e.message))
        .finally(() => setLoading(false));
    } else {
      setErreur("Connexion requise pour accéder aux détails");
      setLoading(false);
    }
  }, [missionId, isOnline]);

  if (loading) {
    return (
      <div className="t-app">
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ color: "#94a3b8", fontSize: 14 }}>Chargement…</div>
        </div>
      </div>
    );
  }

  if (erreur || !mission) {
    return (
      <div className="t-app">
        <header className="t-header">
          <div className="t-header__title">Mission d'enquête</div>
        </header>
        <div style={{ flex: 1, padding: 16 }}>
          <Link href="/enquetes" style={{ color: "#94a3b8", fontSize: 13, textDecoration: "none" }}>← Retour</Link>
          <div style={{ background: "#7f1d1d22", color: "#fca5a5", padding: 14, borderRadius: 8, marginTop: 16, fontSize: 13 }}>
            {erreur ?? "Mission introuvable"}
          </div>
        </div>
        <BottomNavAgent />
      </div>
    );
  }

  const total    = mission.membres.length;
  const collectes = mission.membres.filter(m => m.statut !== "a_faire").length;
  const pct      = total > 0 ? Math.round((collectes / total) * 100) : 0;

  return (
    <div className="t-app">
      <header className="t-header">
        <Link href="/enquetes" style={{ color: "#94a3b8", textDecoration: "none", fontSize: 13 }}>←</Link>
        <div className="t-header__title" style={{ flex: 1, marginLeft: 8 }}>{mission.titre}</div>
      </header>

      <OfflineBanner />

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 80px" }}>
        {/* Progression */}
        <div style={{ background: "#1e293b", borderRadius: 10, padding: 14, marginBottom: 12, border: "1px solid #334155" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 13 }}>
            <span style={{ color: "#94a3b8" }}>Avancement</span>
            <span style={{ color: pct === 100 ? "#4ade80" : "#f59e0b", fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: "#334155", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#4ade80" : "#f59e0b", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 8 }}>
            {collectes} / {total} membres enquêtés · {mission.criteres.length} critères
          </div>
        </div>

        {/* Instructions */}
        {mission.instructions && (
          <div style={{ background: "#1e3a5f", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 12, color: "#93c5fd" }}>
            📌 {mission.instructions}
          </div>
        )}

        {/* Liste membres */}
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Membres à enquêter ({total})
        </div>
        {mission.membres.map(m => {
          const sc = STATUT_LABEL[m.statut] ?? { label: m.statut, color: "#94a3b8" };
          const peutCollecte = m.statut === "a_faire" && isOnline;
          return (
            <div key={m.membreId} style={{
              background: "#1e293b", borderRadius: 10, padding: "13px 14px", marginBottom: 8,
              border: `1px solid ${m.statut !== "a_faire" ? "#166534" : "#334155"}`,
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{m.prenoms} {m.nom}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{m.code ?? "—"} · {m.village ?? "—"}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: sc.color, background: `${sc.color}22`, padding: "2px 7px", borderRadius: 4 }}>
                  {sc.label}
                </span>
                {peutCollecte && (
                  <Link href={`/enquetes/${missionId}/membres/${m.membreId}`}>
                    <button style={{ padding: "6px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Enquêter
                    </button>
                  </Link>
                )}
                {m.statut === "collecte" && (
                  <span style={{ fontSize: 11, color: "#4ade80" }}>✓ Envoyé</span>
                )}
                {m.statut === "valide" && (
                  <span style={{ fontSize: 11, color: "#22c55e" }}>✓ Validé</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Bouton soumettre */}
        {pct === 100 && mission.statut === "en_cours" && isOnline && (
          <SoumettreButton missionId={missionId} />
        )}
      </div>

      <BottomNavAgent />
    </div>
  );
}

function SoumettreButton({ missionId }: { missionId: number }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function soumettre() {
    setLoading(true);
    try {
      const token = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/terrain/enquetes/${missionId}/soumettre`, {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: "{}",
      });
      if (!r.ok) throw new Error((await r.json()).erreur ?? "Erreur");
      setDone(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  if (done) return (
    <div style={{ background: "#14532d", borderRadius: 10, padding: 16, textAlign: "center", color: "#4ade80", fontSize: 14, fontWeight: 600 }}>
      ✓ Mission soumise pour validation
    </div>
  );

  return (
    <div style={{ marginTop: 12 }}>
      {erreur && <div style={{ color: "#fca5a5", fontSize: 12, marginBottom: 8 }}>⚠ {erreur}</div>}
      <button onClick={soumettre} disabled={loading} style={{
        width: "100%", padding: "14px", background: "#16a34a", color: "#fff", border: "none",
        borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: loading ? 0.7 : 1,
      }}>
        {loading ? "Envoi en cours…" : "✅ Soumettre la mission"}
      </button>
    </div>
  );
}

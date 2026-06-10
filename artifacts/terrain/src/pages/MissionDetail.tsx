import { useEffect, useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { getMissionDetail, soumettresMission, sendMessage } from "../lib/api";
import { cacheMissionDetail, getCachedMissionDetail } from "../lib/idb";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import type { MissionDetail as TMissionDetail, MissionMembre, MessageMission } from "../lib/types";
import { useAuth } from "../contexts/AuthContext";

const STATUT_M: Record<string, { label: string; color: string }> = {
  a_faire:  { label: "À faire",  color: "#64748b" },
  collecte: { label: "Collectée", color: "#22c55e" },
  valide:   { label: "Validée",  color: "#10b981" },
  rejete:   { label: "Rejetée",  color: "#ef4444" },
};
const STATUT_MISSION: Record<string, { label: string; color: string }> = {
  planifiee: { label: "Planifiée", color: "#6366f1" },
  en_cours:  { label: "En cours",  color: "#f59e0b" },
  soumise:   { label: "Soumise",   color: "#3b82f6" },
  validee:   { label: "Validée",   color: "#22c55e" },
  rejetee:   { label: "Rejetée",   color: "#ef4444" },
};

function MembreRow({ m, missionId, missionStatut }: { m: MissionMembre; missionId: number; missionStatut: string }) {
  const [, navigate] = useLocation();
  const s = STATUT_M[m.statut] ?? { label: m.statut, color: "#94a3b8" };
  const canCollect = (m.statut === "a_faire" || m.statut === "rejete") && (missionStatut === "planifiee" || missionStatut === "en_cours");
  return (
    <div style={{ background: "#1a2035", borderRadius: 10, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: ".9rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {m.membreNom} {m.membrePrenoms}
        </div>
        <div style={{ fontSize: ".75rem", color: "#94a3b8" }}>
          {m.membreVillage ?? "—"} {m.membreSection ? `· ${m.membreSection}` : ""}
        </div>
        {m.superficieHa && (
          <div style={{ fontSize: ".72rem", color: "#64748b" }}>{parseFloat(m.superficieHa).toFixed(2)} ha déclaré</div>
        )}
        {m.statut === "collecte" && m.dateCollecte && (
          <div style={{ fontSize: ".72rem", color: "#22c55e", marginTop: 2 }}>
            ✓ {new Date(m.dateCollecte).toLocaleDateString("fr-FR")}
          </div>
        )}
        {m.statut === "rejete" && m.motifRejet && (
          <div style={{ fontSize: ".72rem", color: "#ef4444", marginTop: 2 }}>❌ {m.motifRejet}</div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 10 }}>
        <span style={{ fontSize: ".7rem", background: s.color + "33", color: s.color, borderRadius: 4, padding: "2px 6px" }}>{s.label}</span>
        {canCollect && (
          <button
            onClick={() => navigate(`/missions/${missionId}/parcelle/${m.membreId}`)}
            style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 7, padding: "6px 10px", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}
          >
            📍 Collecter
          </button>
        )}
      </div>
    </div>
  );
}

function MessagesSection({ messages, missionId, agentId }: { messages: MessageMission[]; missionId: number; agentId: number }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [localMessages, setLocalMessages] = useState<MessageMission[]>(messages);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const doSend = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      const msg = await sendMessage(missionId, text.trim());
      setLocalMessages((prev) => [...prev, msg]);
      setText("");
    } catch {
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="t-card" style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", color: "#e2e8f0", width: "100%", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", padding: 0 }}
      >
        <span className="t-card__title">💬 Messages ({localMessages.length})</span>
        <span style={{ color: "#94a3b8" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          {localMessages.length === 0 ? (
            <div style={{ color: "#64748b", fontSize: ".85rem" }}>Aucun message</div>
          ) : (
            localMessages.map((msg) => {
              const isMe = msg.auteurId === agentId;
              const typeLabelColor = msg.type === "probleme" ? "#ef4444" : msg.type === "reponse" ? "#22c55e" : "#94a3b8";
              return (
                <div
                  key={msg.id}
                  style={{ background: isMe ? "#1e3a5f" : "#1a2035", borderRadius: 8, padding: "8px 10px", marginBottom: 6, borderLeft: `3px solid ${typeLabelColor}` }}
                >
                  <div style={{ fontSize: ".72rem", color: "#64748b", marginBottom: 3 }}>
                    {msg.auteurNom} {msg.auteurPrenoms} · {new Date(msg.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div style={{ fontSize: ".85rem" }}>{msg.message}</div>
                </div>
              );
            })
          )}
          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Écrire un message..."
              rows={2}
              style={{ flex: 1, background: "#1a2035", border: "1px solid #334155", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: ".85rem", resize: "none" }}
            />
            <button
              onClick={doSend}
              disabled={sending || !text.trim()}
              style={{ background: "#3b82f6", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer", alignSelf: "flex-end", opacity: sending || !text.trim() ? .5 : 1 }}
            >
              Envoyer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function MissionDetailPage() {
  const params = useParams<{ id: string }>();
  const missionId = Number(params.id);
  const [, navigate] = useLocation();
  const { isOnline } = useOffline();
  const { user } = useAuth();

  const [mission, setMission] = useState<TMissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [soumission, setSoumission] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [soumissionErreur, setSoumissionErreur] = useState<string | null>(null);

  useEffect(() => {
    if (isNaN(missionId)) return;
    setLoading(true);
    setErreur(null);
    setFromCache(false);
    if (!isOnline) {
      getCachedMissionDetail(missionId)
        .then((cached) => {
          if (cached) { setMission(cached); setFromCache(true); }
          else setErreur("Données non disponibles hors ligne");
        })
        .catch(() => setErreur("Données non disponibles hors ligne"))
        .finally(() => setLoading(false));
      return;
    }
    getMissionDetail(missionId)
      .then((data) => {
        setMission(data);
        cacheMissionDetail(data).catch(() => {});
      })
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [missionId, isOnline]);

  const doSoumettre = async () => {
    if (!mission) return;
    setSoumission("loading");
    setSoumissionErreur(null);
    try {
      await soumettresMission(missionId);
      setSoumission("ok");
      setMission((m) => m ? { ...m, statut: "soumise" } : m);
    } catch (e) {
      setSoumission("error");
      setSoumissionErreur((e as Error).message);
    }
  };

  if (loading) return <div className="t-app"><div className="t-spinner" /></div>;
  if (erreur) return <div className="t-app"><main className="t-main"><div className="t-error">{erreur}</div></main></div>;
  if (!mission) return null;

  const statut = STATUT_MISSION[mission.statut] ?? { label: mission.statut, color: "#94a3b8" };
  const pct = mission.membresTotal > 0 ? Math.round((mission.membresCollectes / mission.membresTotal) * 100) : 0;
  const canSoumettre = (mission.statut === "en_cours") && mission.membresCollectes >= mission.membresTotal && mission.membresTotal > 0;

  return (
    <div className="t-app">
      <header className="t-header">
        <button
          onClick={() => navigate("/missions")}
          style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, color: "#fff", padding: "6px 10px", marginRight: 10, cursor: "pointer" }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div className="t-header__title" style={{ fontSize: ".95rem" }}>{mission.titre}</div>
          <div className="t-header__sub">
            {mission.zoneNom}
            {fromCache && <span style={{ marginLeft: 6, color: "#f59e0b", fontSize: ".7rem" }}>📦 cache</span>}
          </div>
        </div>
        <span style={{ fontSize: ".72rem", background: statut.color + "33", color: statut.color, borderRadius: 4, padding: "3px 8px" }}>
          {statut.label}
        </span>
      </header>

      <OfflineBanner />

      <main className="t-main">
        <div className="t-card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", color: "#94a3b8", marginBottom: 8 }}>
            <span>📅 {new Date(mission.datePrevue).toLocaleDateString("fr-FR")}</span>
            <span>{mission.zoneType}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".8rem", marginBottom: 4 }}>
            <span style={{ color: "#e2e8f0" }}>{mission.membresCollectes}/{mission.membresTotal} parcelles collectées</span>
            <span style={{ color: "#22c55e", fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={{ height: 6, background: "#1a2035", borderRadius: 3 }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "#22c55e", borderRadius: 3, transition: "width .3s" }} />
          </div>
          {mission.notes && (
            <div style={{ marginTop: 8, fontSize: ".8rem", color: "#94a3b8", borderTop: "1px solid #1e293b", paddingTop: 8 }}>
              📝 {mission.notes}
            </div>
          )}
          {mission.statut === "rejetee" && mission.motifRejet && (
            <div style={{ marginTop: 8, fontSize: ".82rem", color: "#ef4444", background: "#ef444422", borderRadius: 6, padding: "6px 8px" }}>
              ❌ Motif de rejet : {mission.motifRejet}
            </div>
          )}
        </div>

        <MessagesSection messages={mission.messages} missionId={missionId} agentId={user?.id ?? 0} />

        <div style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#94a3b8", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".05em" }}>
            Membres ({mission.membres.length})
          </div>
          {mission.membres.length === 0 ? (
            <div className="t-card" style={{ color: "#64748b", textAlign: "center" }}>Aucun membre assigné</div>
          ) : (
            mission.membres.map((m) => (
              <MembreRow key={m.id} m={m} missionId={missionId} missionStatut={mission.statut} />
            ))
          )}
        </div>

        {canSoumettre && (
          <button
            onClick={doSoumettre}
            disabled={soumission === "loading"}
            className="t-btn t-btn--primary"
            style={{ width: "100%", padding: "14px", fontSize: "1rem", marginBottom: 8 }}
          >
            {soumission === "loading" ? "Soumission en cours…" : "📤 Soumettre la mission"}
          </button>
        )}
        {soumission === "ok" && (
          <div className="t-success" style={{ textAlign: "center" }}>✅ Mission soumise avec succès</div>
        )}
        {soumissionErreur && (
          <div className="t-error">{soumissionErreur}</div>
        )}

        <div style={{ height: 16 }} />
      </main>
    </div>
  );
}

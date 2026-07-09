import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { apiGet, soumettreEnqueteOffline } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import type { EnqueteDetail } from "../lib/types";

type Valeur = "oui" | "non" | "na";

interface Reponse { valeur: Valeur; commentaire?: string; }

export default function CollecteEnquete() {
  const { id, membreId } = useParams<{ id: string; membreId: string }>();
  const missionId = Number(id);
  const mId = Number(membreId);
  const [, navigate] = useLocation();
  const { isOnline, triggerSync } = useOffline();

  const [mission, setMission] = useState<EnqueteDetail | null>(null);
  const [commentaireRt, setCommentaireRt] = useState<string | null>(null);
  const [reponses, setReponses] = useState<Record<string, Reponse>>({});
  const [notesAgent, setNotesAgent] = useState("");
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    apiGet<EnqueteDetail>(`/enquetes/${missionId}`)
      .then(data => {
        setMission(data);
        const membre = data.membres.find(m => m.membreId === mId);
        if (membre?.commentaireRt) setCommentaireRt(membre.commentaireRt);
        const init: Record<string, Reponse> = {};
        data.criteres.forEach(c => { init[c] = { valeur: "na" }; });
        if (membre?.reponses) {
          Object.assign(init, membre.reponses);
        }
        setReponses(init);
      })
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, [missionId, mId]);

  async function submit() {
    setSubmitting(true);
    setErreur(null);
    try {
      if (!isOnline) {
        await soumettreEnqueteOffline(missionId, mId, reponses, notesAgent || undefined);
        setSavedOffline(true);
        setTimeout(() => navigate(`/enquetes/${missionId}`), 2000);
        return;
      }

      const token = localStorage.getItem("coop_token") ?? "";
      const r = await fetch(
        `${import.meta.env.VITE_API_URL ?? ""}/api/terrain/enquetes/${missionId}/membres/${mId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ reponses, notesAgent: notesAgent || undefined }),
        },
      );
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { erreur?: string }).erreur ?? "Erreur"); }
      setSubmitted(true);
      setTimeout(() => navigate(`/enquetes/${missionId}`), 1500);
    } catch (e) {
      if (!isOnline) {
        try {
          await soumettreEnqueteOffline(missionId, mId, reponses, notesAgent || undefined);
          setSavedOffline(true);
          setTimeout(() => navigate(`/enquetes/${missionId}`), 2000);
          return;
        } catch {
          /* fall through to error */
        }
      }
      setErreur(e instanceof Error ? e.message : "Erreur lors de l'envoi");
    } finally {
      setSubmitting(false);
      if (isOnline) triggerSync();
    }
  }

  if (loading || !mission) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#94a3b8", fontSize: 14 }}>Chargement…</div>
      </div>
    );
  }

  const membre = mission.membres.find(m => m.membreId === mId);
  const criteres = mission.criteres;
  const totalCriteres = criteres.length;
  const reponsesRenseignees = Object.values(reponses).filter(r => r.valeur !== "na").length;
  const score = totalCriteres > 0 ? Math.round((Object.values(reponses).filter(r => r.valeur === "oui").length / Math.max(1, Object.values(reponses).filter(r => r.valeur !== "na").length)) * 100) : 0;

  if (savedOffline) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 60 }}>📥</div>
        <div style={{ color: "#fbbf24", fontSize: 18, fontWeight: 700 }}>Enregistré hors ligne</div>
        <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", maxWidth: 280 }}>
          Les réponses seront synchronisées automatiquement à la reconnexion.
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 60 }}>✅</div>
        <div style={{ color: "#4ade80", fontSize: 18, fontWeight: 700 }}>Enquête enregistrée !</div>
        <div style={{ color: "#94a3b8", fontSize: 13 }}>Retour à la mission…</div>
      </div>
    );
  }

  const currentCritere = criteres[step];
  const currentReponse = currentCritere ? (reponses[currentCritere] ?? { valeur: "na" as Valeur }) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      {/* Bandeau de rejet RT */}
      {commentaireRt && (
        <div style={{ background: "#7f1d1d", borderBottom: "1px solid #991b1b", padding: "10px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5", marginBottom: 2 }}>Collecte refusée par le responsable</div>
            <div style={{ fontSize: 12, color: "#fecaca" }}>Motif : {commentaireRt}</div>
            <div style={{ fontSize: 11, color: "#f87171", marginTop: 4 }}>Recommencez depuis le début.</div>
          </div>
        </div>
      )}

      <div style={{ background: "#1e293b", borderBottom: "1px solid #334155", padding: "12px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button onClick={() => navigate(`/enquetes/${missionId}`)} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>←</button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{membre?.prenoms} {membre?.nom}</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{mission.titre}</div>
          </div>
          {!isOnline && (
            <div style={{ marginLeft: "auto", background: "#78350f33", color: "#fbbf24", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6, border: "1px solid #78350f" }}>
              HORS LIGNE
            </div>
          )}
        </div>
        {/* Progression générale */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ flex: 1, height: 4, background: "#334155", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${totalCriteres > 0 ? Math.round((step / totalCriteres) * 100) : 0}%`, background: "#16a34a", borderRadius: 2 }} />
          </div>
          <span style={{ fontSize: 11, color: "#64748b", flexShrink: 0 }}>{step}/{totalCriteres}</span>
        </div>
      </div>

      {/* Corps — critère par critère */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px 100px" }}>
        {step < totalCriteres && currentCritere && currentReponse ? (
          <div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
              Critère {step + 1} sur {totalCriteres}
            </div>
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #334155" }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9", margin: "0 0 20px", lineHeight: 1.5 }}>
                {currentCritere}
              </p>
              {/* Boutons Oui / Non / N/A */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(["oui", "non", "na"] as Valeur[]).map(v => {
                  const cfg = {
                    oui: { label: "✓ Oui — Critère satisfait", color: "#22c55e", bg: "#14532d" },
                    non: { label: "✗ Non — Critère non satisfait", color: "#ef4444", bg: "#7f1d1d" },
                    na:  { label: "— Non applicable", color: "#94a3b8", bg: "#1e293b" },
                  }[v];
                  const active = currentReponse.valeur === v;
                  return (
                    <button key={v} onClick={() => {
                      setReponses(prev => ({ ...prev, [currentCritere]: { ...prev[currentCritere]!, valeur: v } }));
                    }} style={{
                      padding: "14px 16px", borderRadius: 10, border: `2px solid ${active ? cfg.color : "#334155"}`,
                      background: active ? cfg.bg : "#0f172a", color: active ? cfg.color : "#64748b",
                      fontSize: 14, fontWeight: active ? 700 : 400, cursor: "pointer", textAlign: "left",
                      transition: "all 0.15s",
                    }}>
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
              {/* Commentaire */}
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Commentaire (optionnel)</label>
                <textarea
                  value={currentReponse.commentaire ?? ""}
                  onChange={e => setReponses(prev => ({ ...prev, [currentCritere]: { ...prev[currentCritere]!, commentaire: e.target.value } }))}
                  rows={2} placeholder="Précision ou observation…"
                  style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontSize: 13, resize: "vertical", boxSizing: "border-box" }}
                />
              </div>
            </div>
            {/* Navigation critères */}
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
                style={{ flex: 1, padding: 14, borderRadius: 10, border: "1px solid #334155", background: "#1e293b", color: step === 0 ? "#334155" : "#94a3b8", cursor: step === 0 ? "default" : "pointer", fontSize: 14 }}>
                ← Précédent
              </button>
              <button onClick={() => setStep(s => s + 1)}
                style={{ flex: 1, padding: 14, borderRadius: 10, border: "none", background: "#16a34a", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                Suivant →
              </button>
            </div>
          </div>
        ) : (
          /* Récapitulatif final */
          <div>
            <div style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #334155" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>Récapitulatif</div>
              <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>
                {reponsesRenseignees}/{totalCriteres} critères renseignés
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                {[
                  { label: "Oui", count: Object.values(reponses).filter(r => r.valeur === "oui").length, color: "#4ade80" },
                  { label: "Non", count: Object.values(reponses).filter(r => r.valeur === "non").length, color: "#f87171" },
                  { label: "N/A", count: Object.values(reponses).filter(r => r.valeur === "na").length, color: "#94a3b8" },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: "center", background: "#0f172a", borderRadius: 8, padding: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: "center", padding: 12, background: "#0f172a", borderRadius: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: score >= 70 ? "#4ade80" : score >= 40 ? "#fbbf24" : "#f87171" }}>
                  {score}%
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  Score estimé · {score >= 70 ? "Certifiable" : score >= 40 ? "En cours" : "Non conforme"}
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 12, color: "#64748b", display: "block", marginBottom: 6 }}>Notes générales sur le producteur</label>
                <textarea value={notesAgent} onChange={e => setNotesAgent(e.target.value)} rows={3} placeholder="Remarques, contexte particulier…"
                  style={{ width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "9px 12px", color: "#f1f5f9", fontSize: 13, resize: "vertical", boxSizing: "border-box" }} />
              </div>
            </div>

            {!isOnline && (
              <div style={{ background: "#78350f22", border: "1px solid #78350f55", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 13, color: "#fde68a" }}>
                📵 Hors connexion — les réponses seront enregistrées localement et synchronisées à la reconnexion.
              </div>
            )}

            <button onClick={() => setStep(totalCriteres - 1)} style={{
              width: "100%", padding: 14, borderRadius: 10, border: "1px solid #334155",
              background: "#1e293b", color: "#94a3b8", cursor: "pointer", fontSize: 14, marginBottom: 10,
            }}>
              ← Modifier les réponses
            </button>

            {erreur && <div style={{ background: "#7f1d1d22", color: "#fca5a5", padding: 12, borderRadius: 8, marginBottom: 10, fontSize: 13 }}>⚠ {erreur}</div>}

            <button onClick={submit} disabled={submitting}
              style={{
                width: "100%", padding: 16, borderRadius: 10, border: "none",
                background: submitting ? "#334155" : isOnline ? "#16a34a" : "#b45309",
                color: submitting ? "#64748b" : "#fff",
                cursor: submitting ? "default" : "pointer", fontSize: 15, fontWeight: 700,
                opacity: submitting ? 0.7 : 1,
              }}>
              {submitting ? "Enregistrement…" : isOnline ? "✅ Valider et envoyer" : "📥 Enregistrer hors ligne"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

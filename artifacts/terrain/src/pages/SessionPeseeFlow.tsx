import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import FournisseurSearch from "../components/FournisseurSearch";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavPeseur from "../components/BottomNavPeseur";
import { useOffline } from "../contexts/OfflineContext";
import {
  createSessionPesee,
  getSessionsEnCours,
  addLignePesee,
  deleteLignePesee,
  terminerSessionPesee,
  annulerSessionPesee,
  SessionEnCoursError,
} from "../lib/api";
import type { Fournisseur, SessionDetail } from "../lib/types";

type Step = "membre" | "session" | "succes";

function fmtPoids(kg: number): string {
  if (kg >= 1000) return (kg / 1000).toFixed(3) + " T";
  return kg.toFixed(3) + " kg";
}

export default function SessionPeseeFlow() {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();

  const [step, setStep] = useState<Step>("membre");
  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [sessionTerminee, setSessionTerminee] = useState<SessionDetail | null>(null);

  // Formulaire nouvelle pesée
  const [nbSacs, setNbSacs] = useState("");
  const [poidsBrut, setPoidsBrut] = useState("");
  const [tare, setTare] = useState("0");
  const [notesLigne, setNotesLigne] = useState("");
  const [ajoutLoading, setAjoutLoading] = useState(false);
  const [terminerLoading, setTerminerLoading] = useState(false);
  const [annulerLoading, setAnnulerLoading] = useState(false);
  const [erreur, setErreur] = useState("");
  const [confirmAnnuler, setConfirmAnnuler] = useState(false);
  const [confirmTerminer, setConfirmTerminer] = useState(false);

  // IDs des membres ayant déjà une session en cours (pour le badge dans la liste)
  const [activeSessionIds, setActiveSessionIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!isOnline) return;
    getSessionsEnCours().then((sessions) => {
      setActiveSessionIds(new Set(sessions.map((s) => s.membreId).filter((id): id is number => id !== null)));
    }).catch(() => { /* silencieux */ });
  }, [isOnline]);

  // Reprise de session en cours pour ce membre
  useEffect(() => {
    if (!fournisseur || !isOnline) return;
    (async () => {
      try {
        const sessions = await getSessionsEnCours(fournisseur.id);
        if (sessions.length > 0) {
          const existing = sessions[0]!;
          // Charger le détail complet
          const { getSessionDetail: fetchDetail } = await import("../lib/api");
          const detail = await fetchDetail(existing.id);
          setSession(detail);
        }
      } catch {
        // Pas de session en cours — normal
      }
    })();
  }, [fournisseur, isOnline]);

  // ── Sélection du membre ────────────────────────────────────────────────────
  async function handleSelectMembre(f: Fournisseur) {
    setFournisseur(f);
    setErreur("");

    if (!isOnline) {
      setErreur("La pesée groupée requiert une connexion internet");
      return;
    }

    // Vérifier si session en cours existante
    try {
      const sessions = await getSessionsEnCours(f.id);
      if (sessions.length > 0) {
        const { getSessionDetail: fetchDetail } = await import("../lib/api");
        const detail = await fetchDetail(sessions[0]!.id);
        setSession(detail);
      } else {
        // Créer une nouvelle session
        try {
          const s = await createSessionPesee({ membreId: f.id, produit: "cacao", operation: "reception" });
          const { getSessionDetail: fetchDetail } = await import("../lib/api");
          const detail = await fetchDetail(s.id);
          setSession(detail);
        } catch (createErr) {
          // Race condition: another peseur created a session between our check and our create
          if (createErr instanceof SessionEnCoursError) {
            const { getSessionDetail: fetchDetail } = await import("../lib/api");
            const detail = await fetchDetail(createErr.sessionId);
            setSession(detail);
          } else {
            throw createErr;
          }
        }
      }
      setStep("session");
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  // ── Ajouter une ligne ──────────────────────────────────────────────────────
  async function handleAjouterLigne() {
    if (!session || !poidsBrut) return;
    const poidsNum = parseFloat(poidsBrut);
    if (isNaN(poidsNum) || poidsNum <= 0) { setErreur("Poids invalide"); return; }
    setAjoutLoading(true);
    setErreur("");
    try {
      const updated = await addLignePesee(session.id, {
        nbSacs: parseInt(nbSacs) || 0,
        poidsBrutKg: poidsNum,
        tareKg: parseFloat(tare) || 0,
        notes: notesLigne || undefined,
      });
      setSession(updated);
      // Reset form
      setNbSacs("");
      setPoidsBrut("");
      setTare("0");
      setNotesLigne("");
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setAjoutLoading(false);
    }
  }

  // ── Supprimer une ligne ────────────────────────────────────────────────────
  async function handleSupprimerLigne(ligneId: number) {
    if (!session) return;
    try {
      const updated = await deleteLignePesee(session.id, ligneId);
      setSession(updated);
    } catch (err) {
      setErreur((err as Error).message);
    }
  }

  // ── Terminer la session ────────────────────────────────────────────────────
  async function handleTerminer() {
    if (!session) return;
    setTerminerLoading(true);
    setErreur("");
    try {
      const closed = await terminerSessionPesee(session.id);
      setSessionTerminee(closed);
      setStep("succes");
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setTerminerLoading(false);
      setConfirmTerminer(false);
    }
  }

  // ── Annuler la session ─────────────────────────────────────────────────────
  async function handleAnnuler() {
    if (!session) return;
    setAnnulerLoading(true);
    try {
      await annulerSessionPesee(session.id);
      setLocation("/");
    } catch (err) {
      setErreur((err as Error).message);
      setAnnulerLoading(false);
      setConfirmAnnuler(false);
    }
  }

  function reset() {
    setStep("membre");
    setFournisseur(null);
    setSession(null);
    setSessionTerminee(null);
    setErreur("");
    setNbSacs("");
    setPoidsBrut("");
    setTare("0");
    setNotesLigne("");
  }

  const poidsNet = (parseFloat(poidsBrut) || 0) - (parseFloat(tare) || 0);
  const poidsTotalNum = parseFloat(String(session?.poidsTotalKg ?? 0));

  return (
    <div className="t-app">
      <header className="t-header">
        {step !== "succes" ? (
          <button className="t-header__back" onClick={() => step === "session" ? setLocation("/") : setLocation("/")}>‹</button>
        ) : null}
        <div>
          <div className="t-header__title">Pesée groupée</div>
          {step === "session" && session && (
            <div className="t-header__sub" style={{ fontFamily: "monospace", fontSize: ".75rem" }}>
              {session.numeroSession}
            </div>
          )}
        </div>
      </header>

      <OfflineBanner />

      <main className="t-main t-main--no-nav" style={{ paddingBottom: 90 }}>

        {/* ─── STEP : Choisir membre ─────────────────────────────────────── */}
        {step === "membre" && (
          <>
            {!isOnline && (
              <div className="t-card" style={{ margin: "16px 16px 0", borderLeft: "4px solid #f59e0b", background: "#1a2d3a" }}>
                <div style={{ color: "#f59e0b", fontWeight: 700, fontSize: ".9rem" }}>
                  📴 Connexion requise
                </div>
                <div style={{ color: "#94a3b8", fontSize: ".8rem", marginTop: 4 }}>
                  La pesée groupée nécessite une connexion internet active.
                </div>
              </div>
            )}
            {erreur && (
              <div className="t-card" style={{ margin: "12px 16px 0", borderLeft: "4px solid #ef4444", background: "#1a2020" }}>
                <span style={{ color: "#ef4444", fontSize: ".85rem" }}>⚠️ {erreur}</span>
              </div>
            )}
            <FournisseurSearch
              title="Choisir le planteur"
              onSelect={handleSelectMembre}
              activeSessionIds={activeSessionIds}
            />
          </>
        )}

        {/* ─── STEP : Session active ────────────────────────────────────── */}
        {step === "session" && session && fournisseur && (
          <>
            {/* Info membre */}
            <div className="t-card" style={{ margin: "16px 16px 8px", borderLeft: "4px solid var(--t-primary)" }}>
              <div style={{ fontWeight: 800, fontSize: "1rem" }}>
                {fournisseur.nom} {fournisseur.prenoms}
              </div>
              <div className="t-text-muted">{fournisseur.code}</div>
            </div>

            {/* Cumul session */}
            <div className="t-card" style={{ margin: "0 16px 8px", background: "linear-gradient(135deg, #0f2417 0%, #1a3a28 100%)" }}>
              <div style={{ fontSize: ".72rem", color: "#4ade80", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                Cumul session
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, textAlign: "center" }}>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
                    {session.lignes.length}
                  </div>
                  <div style={{ fontSize: ".68rem", color: "#86efac" }}>Pesée{session.lignes.length > 1 ? "s" : ""}</div>
                </div>
                <div>
                  <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#fff" }}>
                    {session.nbSacsTotal}
                  </div>
                  <div style={{ fontSize: ".68rem", color: "#86efac" }}>Sacs</div>
                </div>
                <div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "#22c55e" }}>
                    {fmtPoids(poidsTotalNum)}
                  </div>
                  <div style={{ fontSize: ".68rem", color: "#86efac" }}>Total net</div>
                </div>
              </div>
            </div>

            {/* Lignes existantes */}
            {session.lignes.length > 0 && (
              <div style={{ margin: "0 16px 8px" }}>
                <div style={{ fontSize: ".72rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                  Pesées enregistrées
                </div>
                {session.lignes.map((l) => {
                  const net = parseFloat(l.poidsBrutKg) - parseFloat(l.tareKg ?? "0");
                  return (
                    <div key={l.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "#1e2d3a", borderRadius: 10, padding: "10px 12px", marginBottom: 6,
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: "50%", background: "#1a4731",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: ".75rem", fontWeight: 800, color: "#4ade80", flexShrink: 0,
                      }}>
                        {l.numeroPassage}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: ".88rem", fontWeight: 700, color: "#fff" }}>
                          {fmtPoids(net)}
                          {l.nbSacs > 0 && <span style={{ color: "#94a3b8", fontWeight: 400, marginLeft: 6 }}>· {l.nbSacs} sac{l.nbSacs > 1 ? "s" : ""}</span>}
                        </div>
                        {parseFloat(l.tareKg ?? "0") > 0 && (
                          <div style={{ fontSize: ".72rem", color: "#64748b" }}>
                            Brut {parseFloat(l.poidsBrutKg).toFixed(3)} kg − tare {parseFloat(l.tareKg ?? "0").toFixed(3)} kg
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => handleSupprimerLigne(l.id)}
                        style={{ background: "none", border: "none", color: "#ef4444", fontSize: "1rem", cursor: "pointer", padding: 4 }}
                        title="Supprimer cette pesée"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Formulaire nouvelle pesée */}
            <div className="t-form" style={{ margin: "0 16px" }}>
              <div style={{ fontSize: ".75rem", color: "#4ade80", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
                ⊕ Nouveau passage
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div className="t-field">
                  <label className="t-label">Nb de sacs</label>
                  <input
                    type="number"
                    className="t-input t-input--lg"
                    value={nbSacs}
                    onChange={(e) => setNbSacs(e.target.value)}
                    inputMode="numeric"
                    min="0"
                    placeholder="0"
                  />
                </div>
                <div className="t-field">
                  <label className="t-label">Tare (kg)</label>
                  <input
                    type="number"
                    className="t-input"
                    value={tare}
                    onChange={(e) => setTare(e.target.value)}
                    inputMode="decimal"
                    step="0.1"
                    min="0"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="t-field" style={{ marginBottom: 8 }}>
                <label className="t-label">Poids brut (kg) *</label>
                <input
                  type="number"
                  className="t-input t-input--lg"
                  value={poidsBrut}
                  onChange={(e) => setPoidsBrut(e.target.value)}
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  placeholder="Ex : 247.500"
                />
              </div>

              {poidsBrut && parseFloat(poidsBrut) > 0 && (
                <div className="t-recap" style={{ marginBottom: 10 }}>
                  <div className="t-recap-row">
                    <span className="t-recap-row__label">Poids net ce passage</span>
                    <span className="t-recap-row__value">{Math.max(0, poidsNet).toFixed(3)} kg</span>
                  </div>
                  {session.lignes.length > 0 && (
                    <div className="t-recap-row t-recap-row--total">
                      <span className="t-recap-row__label" style={{ fontWeight: 700 }}>Total après ce passage</span>
                      <span className="t-recap-row__value">{fmtPoids(poidsTotalNum + Math.max(0, poidsNet))}</span>
                    </div>
                  )}
                </div>
              )}

              {erreur && (
                <div style={{ color: "#ef4444", fontSize: ".82rem", marginBottom: 8 }}>⚠️ {erreur}</div>
              )}

              <button
                className="t-btn t-btn--primary"
                style={{ width: "100%", marginBottom: 10 }}
                disabled={!poidsBrut || parseFloat(poidsBrut) <= 0 || ajoutLoading}
                onClick={handleAjouterLigne}
              >
                {ajoutLoading ? "Enregistrement…" : "⊕ Enregistrer ce passage"}
              </button>

              {/* Actions session */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="t-btn t-btn--ghost"
                  style={{ flex: 1, color: "#ef4444", borderColor: "#ef4444" }}
                  onClick={() => setConfirmAnnuler(true)}
                >
                  Annuler session
                </button>
                <button
                  className="t-btn t-btn--primary"
                  style={{ flex: 2, background: session.lignes.length === 0 ? "#334155" : undefined }}
                  disabled={session.lignes.length === 0 || terminerLoading}
                  onClick={() => setConfirmTerminer(true)}
                >
                  ✔ Terminer la pesée
                </button>
              </div>
            </div>
          </>
        )}

        {/* ─── STEP : Succès ────────────────────────────────────────────── */}
        {step === "succes" && sessionTerminee && (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#22c55e", marginBottom: 4 }}>
              Pesée terminée
            </div>
            <div style={{ fontSize: ".82rem", color: "#94a3b8", fontFamily: "monospace", marginBottom: 20 }}>
              {sessionTerminee.numeroSession}
            </div>

            <div className="t-recap" style={{ textAlign: "left", marginBottom: 20 }}>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Producteur</span>
                <span className="t-recap-row__value">{sessionTerminee.membreNom} {sessionTerminee.membrePrenoms}</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Produit</span>
                <span className="t-recap-row__value">{sessionTerminee.produit}</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Nombre de pesées</span>
                <span className="t-recap-row__value">{sessionTerminee.lignes?.length ?? 0} passages</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Total sacs</span>
                <span className="t-recap-row__value">{sessionTerminee.nbSacsTotal} sacs</span>
              </div>
              <div className="t-divider" />
              <div className="t-recap-row t-recap-row--total">
                <span className="t-recap-row__label" style={{ fontWeight: 700 }}>Poids total net</span>
                <span className="t-recap-row__value" style={{ color: "#22c55e", fontWeight: 800, fontSize: "1.1rem" }}>
                  {fmtPoids(parseFloat(String(sessionTerminee.poidsTotalKg)))}
                </span>
              </div>
            </div>

            {/* Détail lignes */}
            {(sessionTerminee.lignes?.length ?? 0) > 0 && (
              <div style={{ textAlign: "left", marginBottom: 20 }}>
                <div style={{ fontSize: ".7rem", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", marginBottom: 6 }}>
                  Détail des passages
                </div>
                {sessionTerminee.lignes.map((l) => {
                  const net = parseFloat(l.poidsBrutKg) - parseFloat(l.tareKg ?? "0");
                  return (
                    <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #1e2d3a", fontSize: ".85rem" }}>
                      <span style={{ color: "#94a3b8" }}>Passage {l.numeroPassage} · {l.nbSacs} sac{l.nbSacs !== 1 ? "s" : ""}</span>
                      <span style={{ color: "#fff", fontWeight: 600 }}>{net.toFixed(3)} kg</span>
                    </div>
                  );
                })}
              </div>
            )}

            <button className="t-btn t-btn--primary" style={{ width: "100%", marginBottom: 10 }} onClick={reset}>
              ⊕ Nouvelle session
            </button>
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => setLocation("/")}>
              Retour à l'accueil
            </button>
          </div>
        )}
      </main>

      <BottomNavPeseur />

      {/* Modal confirmation terminer */}
      {confirmTerminer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#1e2d3a", width: "100%", borderRadius: "18px 18px 0 0", padding: 24 }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#fff", marginBottom: 8, textAlign: "center" }}>
              Terminer la pesée ?
            </div>
            <div style={{ fontSize: ".85rem", color: "#94a3b8", textAlign: "center", marginBottom: 20 }}>
              {session?.nbSacsTotal} sacs · {fmtPoids(poidsTotalNum)} total net
              <br />Cette action est irréversible.
            </div>
            <button className="t-btn t-btn--primary" style={{ width: "100%", marginBottom: 10 }}
              disabled={terminerLoading} onClick={handleTerminer}>
              {terminerLoading ? "Clôture…" : "✔ Confirmer la clôture"}
            </button>
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => setConfirmTerminer(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmation annuler */}
      {confirmAnnuler && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#1e2d3a", width: "100%", borderRadius: "18px 18px 0 0", padding: 24 }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#ef4444", marginBottom: 8, textAlign: "center" }}>
              Annuler la session ?
            </div>
            <div style={{ fontSize: ".85rem", color: "#94a3b8", textAlign: "center", marginBottom: 20 }}>
              Toutes les pesées enregistrées seront perdues.
            </div>
            <button className="t-btn t-btn--ghost" style={{ width: "100%", color: "#ef4444", borderColor: "#ef4444", marginBottom: 10 }}
              disabled={annulerLoading} onClick={handleAnnuler}>
              {annulerLoading ? "Annulation…" : "Oui, annuler la session"}
            </button>
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => setConfirmAnnuler(false)}>
              Retour
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

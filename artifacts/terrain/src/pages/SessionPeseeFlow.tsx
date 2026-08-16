import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import FournisseurSearch from "../components/FournisseurSearch";
import OfflineBanner from "../components/OfflineBanner";
import BottomNavPeseur from "../components/BottomNavPeseur";
import ScaleWeightDisplay from "../components/ScaleWeightDisplay";
import { useOffline } from "../contexts/OfflineContext";
import { useAuth } from "../contexts/AuthContext";
import {
  createSessionPesee,
  getSessionsEnCours,
  getSessionDetail,
  addLignePesee,
  deleteLignePesee,
  terminerSessionPesee,
  annulerSessionPesee,
  convertirSessionEnLivraison,
  telechargerRecuLivraison,
  SessionEnCoursError,
  getPrix,
  getFournisseurRecap,
} from "../lib/api";
import type { Fournisseur, SessionDetail, ConversionLivraisonResult } from "../lib/types";

type Step = "membre" | "session" | "succes";

function RecuLivraisonButton({ livraisonId }: { livraisonId: number }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="t-btn t-btn--ghost"
      style={{ width: "100%", marginBottom: 10 }}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try { await telechargerRecuLivraison(livraisonId); }
        catch { /* silencieux */ }
        finally { setLoading(false); }
      }}
    >
      {loading ? "Génération…" : "📄 Télécharger le reçu PDF"}
    </button>
  );
}

function RecuButton({ livraisonId }: { livraisonId: number }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="t-btn t-btn--ghost"
      style={{ width: "100%", marginBottom: 10 }}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try { await telechargerRecuLivraison(livraisonId); }
        catch { /* silencieux */ }
        finally { setLoading(false); }
      }}
    >
      {loading ? "Génération…" : "🧾 Télécharger le reçu PDF"}
    </button>
  );
}

function fmtPoids(kg: number): string {
  if (kg >= 1000) return (kg / 1000).toFixed(3) + " T";
  return kg.toFixed(3) + " kg";
}

export default function SessionPeseeFlow({ params }: { params?: { sessionId?: string } }) {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const { user } = useAuth();
  const machinePeseeObligatoire = user?.machinePeseeObligatoire === true;

  const [step, setStep] = useState<Step>("membre");
  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [sessionTerminee, setSessionTerminee] = useState<SessionDetail | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);

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
  const [confirmConvertir, setConfirmConvertir] = useState(false);
  const [convertirLoading, setConvertirLoading] = useState(false);
  const [livraisonResult, setLivraisonResult] = useState<ConversionLivraisonResult | null>(null);
  // Synchronous guard — prevents a second tap from entering handleConvertir before the first resolves
  const convertirInProgressRef = useRef(false);

  // Estimation avant conversion
  const [estimeLoading, setEstimeLoading] = useState(false);
  const [estimePrixUnitaire, setEstimePrixUnitaire] = useState<number | null>(null);
  const [estimeAvance, setEstimeAvance] = useState<number>(0);
  const [estimeIntrants, setEstimeIntrants] = useState<number>(0);

  // Map membreId → sessionId pour les sessions actives (badge + reprise directe)
  // Rafraîchie toutes les 30 s tant que l'écran de sélection du membre est visible.
  const [activeSessions, setActiveSessions] = useState<Map<number, number>>(new Map());
  useEffect(() => {
    if (!isOnline || step !== "membre") return;

    function refresh() {
      getSessionsEnCours().then((sessions) => {
        const map = new Map<number, number>();
        for (const s of sessions) {
          if (s.membreId !== null && s.id !== undefined) map.set(s.membreId, s.id);
        }
        setActiveSessions(map);
      }).catch(() => { /* silencieux */ });
    }

    refresh();
    const timer = setInterval(refresh, 30_000);
    return () => clearInterval(timer);
  }, [isOnline, step]);

  // Reprise directe depuis l'accueil via /pesee-session/:sessionId
  useEffect(() => {
    const rawId = params?.sessionId;
    if (!rawId || !isOnline) return;
    const sessionId = parseInt(rawId, 10);
    if (isNaN(sessionId)) return;
    setResumeLoading(true);
    (async () => {
      try {
        const detail = await getSessionDetail(sessionId);
        // Construire un fournisseur synthétique depuis les données de la session
        if (detail.membreId != null) {
          setFournisseur({
            id: detail.membreId,
            code: detail.numeroSession,
            nom: detail.membreNom ?? "",
            prenoms: detail.membrePrenoms ?? "",
            telephone: "",
            section: null,
            village: null,
            typeMembre: "membre",
            avanceEnCours: 0,
            intrantsDus: 0,
            derniereLivraison: null,
          });
        }
        // Pour les sessions de réception de transfert (membreId=null), fournisseur reste null
        // La session s'affiche en mode "transfert" (sans membre)
        if (detail.statut === "terminee") {
          // Session clôturée — aller directement à l'écran de succès pour permettre la conversion
          setSessionTerminee(detail);
          setStep("succes");
        } else {
          setSession(detail);
          setStep("session");
        }
      } catch {
        // Silencieux — retombe sur le step "membre"
      } finally {
        setResumeLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.sessionId, isOnline]);

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

  // ── Reprise directe depuis le badge "Session en cours" ────────────────────
  async function handleSelectActiveSession(f: Fournisseur, sessionId: number) {
    setFournisseur(f);
    setErreur("");
    if (!isOnline) { setErreur("La pesée groupée requiert une connexion internet"); return; }
    try {
      const detail = await getSessionDetail(sessionId);
      setSession(detail);
      setStep("session");
    } catch {
      // Session clôturée ou expirée entre-temps — reprendre le chemin normal
      await handleSelectMembre(f);
    }
  }

  // ── Sélection du membre (chemin standard) ─────────────────────────────────
  async function handleSelectMembre(f: Fournisseur) {
    setFournisseur(f);
    setErreur("");

    if (!isOnline) {
      setErreur("La pesée groupée requiert une connexion internet");
      return;
    }

    try {
      // Chemin rapide : sessionId déjà connu dans le cache local
      const knownId = activeSessions.get(f.id);
      if (knownId !== undefined) {
        try {
          const detail = await getSessionDetail(knownId);
          setSession(detail);
          setStep("session");
          return;
        } catch {
          // Session expirée/annulée — continuer vers le chemin complet
        }
      }

      // Chemin complet : vérification API
      const sessions = await getSessionsEnCours(f.id);
      if (sessions.length > 0) {
        const detail = await getSessionDetail(sessions[0]!.id);
        setSession(detail);
      } else {
        // Créer une nouvelle session
        try {
          const s = await createSessionPesee({ membreId: f.id, produit: "cacao", operation: "reception" });
          const detail = await getSessionDetail(s.id);
          setSession(detail);
        } catch (createErr) {
          // Race condition : un autre peseur a créé une session entre le check et le create
          if (createErr instanceof SessionEnCoursError) {
            const detail = await getSessionDetail(createErr.sessionId);
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

  // ── Ouvrir le modal de conversion (et pré-charger l'estimation) ───────────
  async function ouvrirConvertirModal() {
    setConfirmConvertir(true);
    setEstimePrixUnitaire(null);
    setEstimeAvance(fournisseur?.avanceEnCours ?? 0);
    setEstimeIntrants(fournisseur?.intrantsDus ?? 0);
    setEstimeLoading(true);
    try {
      const membreId = sessionTerminee?.membreId ?? fournisseur?.id;
      const [prixData, recapData] = await Promise.all([
        getPrix(),
        membreId ? getFournisseurRecap(membreId).catch(() => null) : Promise.resolve(null),
      ]);
      setEstimePrixUnitaire(prixData.prixBordChampFcfa);
      if (recapData) {
        setEstimeAvance(recapData.avanceEnCours);
        setEstimeIntrants(recapData.intrantsDus);
      }
    } catch {
      // Silencieux — l'estimation restera null, on masque juste le bloc
    } finally {
      setEstimeLoading(false);
    }
  }

  // ── Convertir la session terminée en livraison ─────────────────────────────
  async function handleConvertir() {
    if (!sessionTerminee) return;
    // Synchronous guard: block any second invocation until the first resolves.
    // State-based guards (convertirLoading) are insufficient on mobile because
    // React may not re-render between two rapid taps.
    if (convertirInProgressRef.current) return;
    convertirInProgressRef.current = true;

    setConvertirLoading(true);
    setErreur("");
    try {
      const result = await convertirSessionEnLivraison(sessionTerminee.id);
      setLivraisonResult(result);
      setConfirmConvertir(false);
    } catch (err) {
      const msg = (err instanceof Error && err.message) ? err.message : "Erreur lors de la conversion — réessayez.";
      // The backend (FOR UPDATE + livraisonId check) throws this when a concurrent
      // request already created the livraison. Instead of showing a confusing error,
      // reload the session so the UI transitions to the receipt screen.
      if (msg.includes("Une livraison a déjà été créée")) {
        try {
          const updated = await getSessionDetail(sessionTerminee.id);
          setSessionTerminee(updated);
        } catch {
          // silencieux — la session restera telle quelle
        }
        setConfirmConvertir(false);
      } else {
        // Afficher l'erreur DANS la modale (ne pas fermer) pour que l'utilisateur la voit
        setErreur(msg);
        // La modale reste ouverte — l'utilisateur voit l'erreur et peut réessayer
      }
    } finally {
      setConvertirLoading(false);
      convertirInProgressRef.current = false;
    }
  }

  function reset() {
    setStep("membre");
    setFournisseur(null);
    setSession(null);
    setSessionTerminee(null);
    setLivraisonResult(null);
    setErreur("");
    setNbSacs("");
    setPoidsBrut("");
    setTare("0");
    setNotesLigne("");
  }

  const poidsNet = (parseFloat(poidsBrut) || 0) - (parseFloat(tare) || 0);
  const poidsTotalNum = parseFloat(String(session?.poidsTotalKg ?? 0));

  if (resumeLoading) {
    return (
      <div className="t-app">
        <header className="t-header">
          <button className="t-header__back" onClick={() => setLocation("/")}>‹</button>
          <div><div className="t-header__title">Pesée groupée</div></div>
        </header>
        <main className="t-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
          <div style={{ textAlign: "center", color: "#94a3b8" }}>
            <div style={{ fontSize: "2rem", marginBottom: 12 }}>⏳</div>
            <div style={{ fontSize: ".9rem" }}>Chargement de la session…</div>
          </div>
        </main>
      </div>
    );
  }

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
              activeSessions={activeSessions}
              onSelectActiveSession={handleSelectActiveSession}
            />
          </>
        )}

        {/* ─── STEP : Session active ────────────────────────────────────── */}
        {step === "session" && session && (fournisseur != null || session.operation === "reception_transfert") && (
          <>
            {/* Info membre OU info transfert */}
            {session.operation === "reception_transfert" ? (
              <div className="t-card" style={{ margin: "16px 16px 8px", borderLeft: "4px solid #3b82f6", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
                <div style={{ fontSize: ".68rem", color: "#3b82f6", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 4 }}>
                  🚛 Réception de transfert
                </div>
                <div style={{ fontWeight: 800, fontSize: "1rem", color: "#e2e8f0" }}>
                  Pesée sac par sac
                </div>
                <div className="t-text-muted">Session · {session.numeroSession}</div>
              </div>
            ) : fournisseur && (
              <div className="t-card" style={{ margin: "16px 16px 8px", borderLeft: "4px solid var(--t-primary)" }}>
                <div style={{ fontWeight: 800, fontSize: "1rem" }}>
                  {fournisseur.nom} {fournisseur.prenoms}
                </div>
                <div className="t-text-muted">{fournisseur.code}</div>
              </div>
            )}

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

              {/* Lecture automatique depuis la balance RS232 (service local) */}
              <ScaleWeightDisplay
                onUse={(kg) => setPoidsBrut(kg.toFixed(3))}
              />

              <div className="t-field" style={{ marginBottom: 8 }}>
                <label className="t-label">Poids brut (kg) *</label>
                {machinePeseeObligatoire && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: ".75rem", color: "#64748b", marginBottom: 4 }}>
                    <span>🔒</span>
                    <span>Saisie manuelle désactivée — utilisez la balance</span>
                  </div>
                )}
                <input
                  type="number"
                  className="t-input t-input--lg"
                  value={poidsBrut}
                  onChange={(e) => { if (!machinePeseeObligatoire) setPoidsBrut(e.target.value); }}
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  placeholder={machinePeseeObligatoire ? "Poids depuis la balance" : "Ex : 247.500"}
                  readOnly={machinePeseeObligatoire}
                  style={machinePeseeObligatoire ? { background: "#f1f5f9", color: "#94a3b8", cursor: "not-allowed" } : undefined}
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
        {step === "succes" && sessionTerminee && (() => {
          const isTransfertReception = sessionTerminee.operation === "reception_transfert";
          return (
          <div style={{ padding: "24px 16px", textAlign: "center" }}>
            <div style={{ fontSize: "3rem", marginBottom: 12 }}>
              {isTransfertReception ? "⚖️" : livraisonResult ? "🎉" : "✅"}
            </div>
            <div style={{ fontSize: "1.2rem", fontWeight: 800, color: "#22c55e", marginBottom: 4 }}>
              {isTransfertReception ? "Pesée de réception clôturée" : livraisonResult ? "Livraison créée" : "Pesée terminée"}
            </div>
            <div style={{ fontSize: ".82rem", color: "#94a3b8", fontFamily: "monospace", marginBottom: 20 }}>
              {sessionTerminee.numeroSession}
            </div>

            {/* Message spécifique réception de transfert */}
            {isTransfertReception && (
              <div style={{
                background: "rgba(34,197,94,.08)", border: "1px solid rgba(34,197,94,.3)",
                borderRadius: 10, padding: 14, marginBottom: 20, fontSize: ".85rem", color: "#86efac", textAlign: "left",
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  ✅ Poids officiel enregistré : {fmtPoids(parseFloat(String(sessionTerminee.poidsTotalKg)))}
                </div>
                <div style={{ fontSize: ".78rem", color: "#64748b" }}>
                  Le transfert a été mis à jour avec le poids pesé. Le stock central a été crédité automatiquement (ou un litige a été ouvert si l'écart dépasse 0,5 %).
                </div>
              </div>
            )}

            {/* Récap session — pour sessions membres uniquement */}
            {!isTransfertReception && (
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
            )}

            {/* Récap pesées pour sessions transfert (simplifié) */}
            {isTransfertReception && (
              <div className="t-recap" style={{ textAlign: "left", marginBottom: 20 }}>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Nombre de passages</span>
                  <span className="t-recap-row__value">{sessionTerminee.lignes?.length ?? 0}</span>
                </div>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Total sacs</span>
                  <span className="t-recap-row__value">{sessionTerminee.nbSacsTotal} sacs</span>
                </div>
                <div className="t-divider" />
                <div className="t-recap-row t-recap-row--total">
                  <span className="t-recap-row__label" style={{ fontWeight: 700 }}>Poids pesé (officiel)</span>
                  <span className="t-recap-row__value" style={{ color: "#22c55e", fontWeight: 800, fontSize: "1.1rem" }}>
                    {fmtPoids(parseFloat(String(sessionTerminee.poidsTotalKg)))}
                  </span>
                </div>
              </div>
            )}

            {/* ── Détail de la livraison (après conversion) ─────────────── */}
            {livraisonResult && (
              <div className="t-recap" style={{ textAlign: "left", marginBottom: 20, borderLeft: "4px solid #22c55e" }}>
                <div style={{ fontSize: ".7rem", color: "#4ade80", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
                  Décompte livraison
                </div>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">
                    Prix ({livraisonResult.prixUnitaireFcfa.toLocaleString("fr-FR")} FCFA/kg)
                  </span>
                  <span className="t-recap-row__value">{livraisonResult.montantBrutFcfa.toLocaleString("fr-FR")} FCFA</span>
                </div>
                {livraisonResult.avanceDeduiteFcfa > 0 && (
                  <div className="t-recap-row t-recap-row--deduction">
                    <span className="t-recap-row__label">Avance déduite</span>
                    <span className="t-recap-row__value" style={{ color: "#f87171" }}>
                      −{livraisonResult.avanceDeduiteFcfa.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                )}
                {livraisonResult.intrantsDeduitsFcfa > 0 && (
                  <div className="t-recap-row t-recap-row--deduction">
                    <span className="t-recap-row__label">Intrants déduits</span>
                    <span className="t-recap-row__value" style={{ color: "#f87171" }}>
                      −{livraisonResult.intrantsDeduitsFcfa.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                )}
                <div className="t-divider" />
                <div className="t-recap-row t-recap-row--total">
                  <span className="t-recap-row__label" style={{ fontWeight: 800 }}>Montant net</span>
                  <span className="t-recap-row__value" style={{ color: "#22c55e", fontWeight: 800, fontSize: "1.15rem" }}>
                    {livraisonResult.montantNetFcfa.toLocaleString("fr-FR")} FCFA
                  </span>
                </div>
              </div>
            )}

            {/* Erreur conversion */}
            {erreur && !livraisonResult && (
              <div style={{ color: "#ef4444", fontSize: ".82rem", marginBottom: 12, textAlign: "left" }}>⚠️ {erreur}</div>
            )}

            {/* Détail lignes */}
            {!livraisonResult && (sessionTerminee.lignes?.length ?? 0) > 0 && (
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

            {/* Bouton reçu PDF (après conversion dans cette session) */}
            {livraisonResult && isOnline && (
              <RecuButton livraisonId={livraisonResult.livraisonId} />
            )}

            {/* Bouton reçu PDF (session déjà convertie lors d'une visite précédente) */}
            {!livraisonResult && sessionTerminee?.livraisonId && isOnline && (
              <RecuButton livraisonId={sessionTerminee.livraisonId} />
            )}

            {/* Bouton conversion (si pas encore convertie, sessions membres uniquement) */}
            {!isTransfertReception && !livraisonResult && !sessionTerminee?.livraisonId && isOnline && (
              <button
                className="t-btn t-btn--primary"
                style={{ width: "100%", marginBottom: 10, background: "linear-gradient(135deg, #16a34a, #15803d)" }}
                onClick={ouvrirConvertirModal}
              >
                📦 Convertir en livraison
              </button>
            )}

            {isTransfertReception ? (
              <button className="t-btn t-btn--ghost" style={{ width: "100%", marginBottom: 10 }} onClick={() => setLocation("/receptions")}>
                ← Retour aux réceptions
              </button>
            ) : (
              <button className="t-btn t-btn--primary" style={{ width: "100%", marginBottom: 10, background: livraisonResult ? undefined : "#334155" }} onClick={reset}>
                ⊕ Nouvelle session
              </button>
            )}
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => setLocation("/")}>
              Retour à l'accueil
            </button>
          </div>
          );
        })()}
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

      {/* Modal confirmation convertir en livraison */}
      {confirmConvertir && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#1e2d3a", width: "100%", borderRadius: "18px 18px 0 0", padding: 24 }}>
            <div style={{ fontSize: "1.05rem", fontWeight: 800, color: "#22c55e", marginBottom: 8, textAlign: "center" }}>
              📦 Convertir en livraison
            </div>
            <div style={{ fontSize: ".85rem", color: "#94a3b8", textAlign: "center", marginBottom: 16 }}>
              {sessionTerminee?.membreNom} {sessionTerminee?.membrePrenoms}<br />
              {fmtPoids(parseFloat(String(sessionTerminee?.poidsTotalKg ?? 0)))} · {sessionTerminee?.nbSacsTotal} sacs
            </div>

            {/* Estimation financière */}
            {estimeLoading ? (
              <div style={{ textAlign: "center", color: "#64748b", fontSize: ".8rem", marginBottom: 16 }}>
                Calcul de l'estimation…
              </div>
            ) : estimePrixUnitaire !== null ? (() => {
              const poidsKg = parseFloat(String(sessionTerminee?.poidsTotalKg ?? 0));
              const brut = Math.round(poidsKg * estimePrixUnitaire);
              const avance = estimeAvance;
              const intrants = estimeIntrants;
              const net = Math.max(0, brut - avance - intrants);
              return (
                <div className="t-recap" style={{ marginBottom: 16, borderLeft: "4px solid #22c55e" }}>
                  <div style={{ fontSize: ".68rem", color: "#4ade80", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>
                    Estimation (prix actuel : {estimePrixUnitaire.toLocaleString("fr-FR")} FCFA/kg)
                  </div>
                  <div className="t-recap-row">
                    <span className="t-recap-row__label">Montant brut</span>
                    <span className="t-recap-row__value">{brut.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  {avance > 0 && (
                    <div className="t-recap-row">
                      <span className="t-recap-row__label">Avance à déduire</span>
                      <span className="t-recap-row__value" style={{ color: "#f87171" }}>−{avance.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  )}
                  {intrants > 0 && (
                    <div className="t-recap-row">
                      <span className="t-recap-row__label">Intrants à déduire</span>
                      <span className="t-recap-row__value" style={{ color: "#f87171" }}>−{intrants.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  )}
                  <div className="t-divider" />
                  <div className="t-recap-row t-recap-row--total">
                    <span className="t-recap-row__label" style={{ fontWeight: 800 }}>≈ Montant net estimé</span>
                    <span className="t-recap-row__value" style={{ color: "#22c55e", fontWeight: 800, fontSize: "1.1rem" }}>
                      {net.toLocaleString("fr-FR")} FCFA
                    </span>
                  </div>
                </div>
              );
            })() : null}

            <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".85rem", color: "#78350f" }}>
              ⏳ Le mode de paiement sera choisi lors du règlement.
            </div>
            {erreur && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: ".85rem", color: "#dc2626" }}>
                ⚠️ {erreur}
              </div>
            )}
            <button className="t-btn t-btn--primary" style={{ width: "100%", marginBottom: 10 }}
              disabled={convertirLoading} onClick={handleConvertir}>
              {convertirLoading ? "Création en cours…" : erreur ? "↩ Réessayer" : "✔ Confirmer la livraison"}
            </button>
            <button className="t-btn t-btn--ghost" style={{ width: "100%" }} onClick={() => { setConfirmConvertir(false); setErreur(""); }}>
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

import { useState } from "react";
import { useLocation } from "wouter";
import { MoneyInput } from "../components/ui/money-input";
import FournisseurSearch from "../components/FournisseurSearch";
import OfflineBanner from "../components/OfflineBanner";
import BottomNav from "../components/BottomNav";
import { useOffline } from "../contexts/OfflineContext";
import { octroierAvance, getFournisseurRecap } from "../lib/api";
import type { Fournisseur, FournisseurRecap } from "../lib/types";

type Step = 1 | 2 | 3;

const MOTIFS = [
  "Achat de vivres",
  "Frais scolaires",
  "Santé / médicaments",
  "Intrants agricoles",
  "Autre urgence",
];

export default function AvanceFlow() {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const [step, setStep] = useState<Step>(1);
  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [recap, setRecap] = useState<FournisseurRecap | null>(null);
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [autreMotif, setAutreMotif] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");
  const [avanceId, setAvanceId] = useState<number | null>(null);

  const motifFinal = motif === "Autre urgence" ? autreMotif : motif;

  async function handleSelectFournisseur(f: Fournisseur) {
    setFournisseur(f);
    if (isOnline) {
      try {
        const r = await getFournisseurRecap(f.id);
        setRecap(r);
      } catch {}
    }
    setStep(2);
  }

  async function handleConfirmer() {
    if (!fournisseur || !montant || !motifFinal) return;
    setSubmitting(true);
    setErreur("");
    const localId = crypto.randomUUID();
    try {
      const res = await octroierAvance(
        { membreId: fournisseur.id, montantFcfa: parseInt(montant), motif: motifFinal, localId },
        isOnline
      );
      if (res) setAvanceId(res.avanceId);
      setStep(3);
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep(1);
    setFournisseur(null);
    setRecap(null);
    setMontant("");
    setMotif("");
    setAutreMotif("");
    setAvanceId(null);
    setErreur("");
  }

  return (
    <div className="t-app">
      <header className="t-header">
        {step > 1 && step < 3 ? (
          <button className="t-header__back" onClick={() => setStep((step - 1) as Step)}>‹</button>
        ) : (
          <button className="t-header__back" onClick={() => setLocation("/")}>‹</button>
        )}
        <div>
          <div className="t-header__title">Octroyer une avance</div>
          {step < 3 && <div className="t-header__sub">Étape {step} / 2</div>}
        </div>
      </header>

      <OfflineBanner />

      {step < 3 && (
        <div className="t-steps">
          {[1, 2].map((s, i) => (
            <>
              <div key={s} className={`t-step${step === s ? " t-step--active" : step > s ? " t-step--done" : ""}`}>
                {step > s ? "✓" : s}
              </div>
              {i < 1 && <div className={`t-step-line${step > s ? " t-step-line--done" : ""}`} />}
            </>
          ))}
        </div>
      )}

      <main className="t-main t-main--no-nav" style={{ paddingBottom: "80px" }}>
        {step === 1 && (
          <FournisseurSearch title="Choisir le bénéficiaire" onSelect={handleSelectFournisseur} />
        )}

        {step === 2 && fournisseur && (
          <div className="t-form">
            <div className="t-card" style={{ borderLeft: "4px solid var(--t-warning)" }}>
              <div style={{ fontWeight: 800 }}>{fournisseur.nom} {fournisseur.prenoms}</div>
              <div className="t-text-muted">{fournisseur.code}</div>
              {fournisseur.avanceEnCours > 0 && (
                <div style={{ marginTop: 8 }}>
                  <span className="t-badge t-badge--danger">
                    ⚠️ Avance en cours : {fournisseur.avanceEnCours.toLocaleString("fr-FR")} FCFA — nouvel octroi impossible
                  </span>
                </div>
              )}
            </div>

            {fournisseur.avanceEnCours > 0 ? (
              <div style={{ background: "var(--t-danger-bg)", color: "var(--t-danger)", borderRadius: "var(--t-radius)", padding: "16px", fontWeight: 600, textAlign: "center" }}>
                Ce membre a déjà une avance en cours.<br />Il doit d'abord rembourser avant de recevoir une nouvelle avance.
              </div>
            ) : (
              <>
                <div className="t-field">
                  <label className="t-label">Montant de l'avance (FCFA)</label>
                  <MoneyInput
                    className="t-input t-input--lg"
                    value={montant}
                    onChange={(raw) => setMontant(raw)}
                    placeholder="Ex: 50 000"
                  />
                </div>

                {montant && (
                  <div className="t-montant-big">{parseInt(montant || "0").toLocaleString("fr-FR")} FCFA</div>
                )}

                <div className="t-field">
                  <label className="t-label">Motif</label>
                  <select className="t-select" value={motif} onChange={(e) => setMotif(e.target.value)}>
                    <option value="">Choisir un motif…</option>
                    {MOTIFS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>

                {motif === "Autre urgence" && (
                  <div className="t-field">
                    <label className="t-label">Préciser le motif</label>
                    <input
                      type="text"
                      className="t-input"
                      value={autreMotif}
                      onChange={(e) => setAutreMotif(e.target.value)}
                      placeholder="Décrire le motif…"
                    />
                  </div>
                )}

                {!isOnline && (
                  <div style={{ background: "var(--t-warning-bg)", color: "var(--t-warning)", borderRadius: "var(--t-radius)", padding: "12px 14px", fontSize: ".9rem", fontWeight: 600 }}>
                    📴 Hors ligne — sera synchronisé au retour du réseau
                  </div>
                )}

                {erreur && (
                  <div style={{ background: "var(--t-danger-bg)", color: "var(--t-danger)", borderRadius: "var(--t-radius)", padding: "12px 14px", fontSize: ".9rem", fontWeight: 600 }}>
                    ❌ {erreur}
                  </div>
                )}

                <button
                  className="t-btn t-btn--warning"
                  style={{ background: "var(--t-warning)", color: "#fff" }}
                  disabled={submitting || !montant || !motifFinal}
                  onClick={handleConfirmer}
                >
                  {submitting ? "Enregistrement…" : "✅ Confirmer l'avance"}
                </button>
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="t-success-screen">
            <div className="t-success-screen__icon">{isOnline ? "✅" : "📴"}</div>
            <div className="t-success-screen__title">
              {isOnline ? "Avance octroyée !" : "Enregistré hors ligne"}
            </div>
            <div className="t-success-screen__sub">
              {isOnline ? "L'avance a été enregistrée avec succès." : "Sera synchronisé dès le retour du réseau."}
            </div>

            <div className="t-success-screen__card t-gap">
              <div className="t-recap-row">
                <span className="t-recap-row__label">Bénéficiaire</span>
                <span className="t-recap-row__value">{fournisseur?.nom} {fournisseur?.prenoms}</span>
              </div>
              <div className="t-recap-row t-recap-row--total">
                <span className="t-recap-row__label">Montant</span>
                <span className="t-recap-row__value">{parseInt(montant || "0").toLocaleString("fr-FR")} FCFA</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Motif</span>
                <span className="t-recap-row__value">{motifFinal}</span>
              </div>
              {avanceId && (
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Réf.</span>
                  <span className="t-recap-row__value">AV-{String(avanceId).padStart(4, "0")}</span>
                </div>
              )}
            </div>

            <button className="t-btn t-btn--primary" style={{ width: "100%", maxWidth: 320 }} onClick={reset}>
              Nouvelle avance
            </button>
            <button className="t-btn t-btn--ghost" style={{ width: "100%", maxWidth: 320 }} onClick={() => setLocation("/")}>
              Retour à l'accueil
            </button>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

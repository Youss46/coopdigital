import { useState } from "react";
import { useLocation } from "wouter";
import FournisseurSearch from "../components/FournisseurSearch";
import OfflineBanner from "../components/OfflineBanner";
import BottomNav from "../components/BottomNav";
import { useOffline } from "../contexts/OfflineContext";
import { getFournisseurRecap, enregistrerPaiement } from "../lib/api";
import type { Fournisseur, FournisseurRecap } from "../lib/types";

type Step = 1 | 2 | 3;
type ModePaiement = "especes" | "orange_money" | "mtn_momo";

export default function PaiementFlow() {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const [step, setStep] = useState<Step>(1);
  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [recap, setRecap] = useState<FournisseurRecap | null>(null);
  const [livraisonId, setLivraisonId] = useState("");
  const [montant, setMontant] = useState("");
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");
  const [success, setSuccess] = useState(false);
  const [ref, setRef] = useState("");

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
    if (!fournisseur) return;
    setSubmitting(true);
    setErreur("");
    const localId = crypto.randomUUID();
    try {
      const res = await enregistrerPaiement(
        {
          membreId: fournisseur.id,
          livraisonId: parseInt(livraisonId) || 0,
          modePaiement,
          localId,
        },
        isOnline
      );
      if (res) setRef(res.ref);
      setSuccess(true);
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
    setLivraisonId("");
    setMontant("");
    setModePaiement("especes");
    setSuccess(false);
    setRef("");
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
          <div className="t-header__title">Paiement</div>
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
          <FournisseurSearch title="Choisir le membre à payer" onSelect={handleSelectFournisseur} />
        )}

        {step === 2 && fournisseur && (
          <div className="t-form">
            <div className="t-card" style={{ borderLeft: "4px solid var(--t-success)" }}>
              <div style={{ fontWeight: 800 }}>{fournisseur.nom} {fournisseur.prenoms}</div>
              <div className="t-text-muted">{fournisseur.code}</div>
              {recap && (
                <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {recap.avanceEnCours > 0 && (
                    <span className="t-badge t-badge--danger">Avance : {recap.avanceEnCours.toLocaleString("fr-FR")} FCFA</span>
                  )}
                  {recap.derniereLivraison && (
                    <span className="t-badge t-badge--info">Dernière livraison : {recap.derniereLivraison}</span>
                  )}
                </div>
              )}
            </div>

            <div className="t-field">
              <label className="t-label">ID Livraison (optionnel)</label>
              <input
                type="number"
                className="t-input"
                value={livraisonId}
                onChange={(e) => setLivraisonId(e.target.value)}
                inputMode="numeric"
                placeholder="Laisser vide si inconnu"
              />
              <span className="t-input-hint">Numéro de la livraison concernée</span>
            </div>

            <div className="t-field">
              <label className="t-label">Montant à payer (FCFA)</label>
              <input
                type="number"
                className="t-input t-input--lg"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                inputMode="numeric"
                placeholder="Ex: 75 000"
              />
            </div>

            <div className="t-field">
              <label className="t-label">Mode de paiement</label>
              <select className="t-select" value={modePaiement} onChange={(e) => setModePaiement(e.target.value as ModePaiement)}>
                <option value="especes">💵 Espèces</option>
                <option value="orange_money">🟠 Orange Money</option>
                <option value="mtn_momo">🟡 MTN Mobile Money</option>
              </select>
            </div>

            {montant && (
              <div className="t-montant-big">{parseInt(montant).toLocaleString("fr-FR")} FCFA</div>
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
              className="t-btn t-btn--success"
              disabled={submitting || (!montant && !livraisonId)}
              onClick={handleConfirmer}
            >
              {submitting ? "Enregistrement…" : "✅ Confirmer le paiement"}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="t-success-screen">
            <div className="t-success-screen__icon">{isOnline ? "✅" : "📴"}</div>
            <div className="t-success-screen__title">
              {isOnline ? "Paiement enregistré !" : "Enregistré hors ligne"}
            </div>
            <div className="t-success-screen__sub">
              {isOnline ? "Le paiement a été confirmé." : "Sera synchronisé dès le retour du réseau."}
            </div>

            {ref && (
              <div className="t-success-screen__card">
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Référence</span>
                  <span className="t-recap-row__value">{ref}</span>
                </div>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Membre</span>
                  <span className="t-recap-row__value">{fournisseur?.nom} {fournisseur?.prenoms}</span>
                </div>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Mode</span>
                  <span className="t-recap-row__value">
                    {modePaiement === "especes" ? "💵 Espèces" : modePaiement === "orange_money" ? "🟠 Orange Money" : "🟡 MTN MoMo"}
                  </span>
                </div>
              </div>
            )}

            <button className="t-btn t-btn--primary" style={{ width: "100%", maxWidth: 320 }} onClick={reset}>
              Nouveau paiement
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

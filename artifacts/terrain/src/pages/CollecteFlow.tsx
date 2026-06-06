import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import FournisseurSearch from "../components/FournisseurSearch";
import OfflineBanner from "../components/OfflineBanner";
import BottomNav from "../components/BottomNav";
import { useOffline } from "../contexts/OfflineContext";
import { enregistrerCollecte, getPrix } from "../lib/api";
import { getCachedPrix, cachePrix } from "../lib/idb";
import type { Fournisseur, CollecteResult, PrixActuel } from "../lib/types";

type Step = 1 | 2 | 3 | 4;
type ModePaiement = "especes" | "orange_money" | "mtn_momo";

export default function CollecteFlow() {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const [step, setStep] = useState<Step>(1);
  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [prix, setPrix] = useState<PrixActuel | null>(null);

  // Step 2 fields
  const [nombreSacs, setNombreSacs] = useState("");
  const [poidsBrut, setPoidsBrut] = useState("");
  const [retenueKg, setRetenueKg] = useState("0");
  const [modePaiement, setModePaiement] = useState<ModePaiement>("especes");

  // Step 3 result
  const [result, setResult] = useState<CollecteResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    const load = async () => {
      if (isOnline) {
        try {
          const p = await getPrix();
          setPrix(p);
          await cachePrix(p);
        } catch {}
      } else {
        const cached = await getCachedPrix();
        if (cached) setPrix(cached);
      }
    };
    load();
  }, [isOnline]);

  const poidsBrutNum = parseFloat(poidsBrut) || 0;
  const retenueNum = parseFloat(retenueKg) || 0;
  const poidsNet = Math.max(0, poidsBrutNum - retenueNum);
  const montantBrut = prix ? Math.round(poidsNet * prix.prixBordChampFcfa) : 0;
  const avanceDed = fournisseur ? Math.min(fournisseur.avanceEnCours, montantBrut) : 0;
  const intrantsDed = fournisseur ? Math.min(fournisseur.intrantsDus, montantBrut - avanceDed) : 0;
  const montantNet = Math.max(0, montantBrut - avanceDed - intrantsDed);

  async function handleConfirmer() {
    if (!fournisseur || !poidsBrut || !prix) return;
    setSubmitting(true);
    setErreur("");
    const localId = crypto.randomUUID();
    try {
      const res = await enregistrerCollecte(
        {
          membreId: fournisseur.id,
          nombreSacs: parseInt(nombreSacs) || 1,
          poidsBrutKg: poidsBrutNum,
          retenueKg: retenueNum,
          modePaiement,
          localId,
        },
        isOnline
      );
      if (res) {
        setResult(res);
        setStep(4);
      } else {
        setStep(4);
      }
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep(1);
    setFournisseur(null);
    setPoidsBrut("");
    setNombreSacs("");
    setRetenueKg("0");
    setModePaiement("especes");
    setResult(null);
    setErreur("");
  }

  return (
    <div className="t-app">
      <header className="t-header">
        {step > 1 && step < 4 ? (
          <button className="t-header__back" onClick={() => setStep((step - 1) as Step)}>‹</button>
        ) : (
          <button className="t-header__back" onClick={() => setLocation("/")}>‹</button>
        )}
        <div>
          <div className="t-header__title">Collecte de cacao</div>
          {step < 4 && <div className="t-header__sub">Étape {step} / 3</div>}
        </div>
      </header>

      <OfflineBanner />

      {/* Step indicator */}
      {step < 4 && (
        <div className="t-steps">
          {[1, 2, 3].map((s, i) => (
            <>
              <div key={s} className={`t-step${step === s ? " t-step--active" : step > s ? " t-step--done" : ""}`}>
                {step > s ? "✓" : s}
              </div>
              {i < 2 && <div className={`t-step-line${step > s ? " t-step-line--done" : ""}`} />}
            </>
          ))}
        </div>
      )}

      <main className="t-main t-main--no-nav" style={{ paddingBottom: "80px" }}>
        {/* STEP 1 : Choisir membre */}
        {step === 1 && (
          <FournisseurSearch
            title="Choisir le planteur"
            onSelect={(f) => { setFournisseur(f); setStep(2); }}
          />
        )}

        {/* STEP 2 : Saisir pesée */}
        {step === 2 && fournisseur && (
          <>
            {/* Récap fournisseur */}
            <div className="t-card" style={{ margin: "16px 16px 0", borderLeft: "4px solid var(--t-primary)" }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{fournisseur.nom} {fournisseur.prenoms}</div>
              <div className="t-text-muted">{fournisseur.code} · {fournisseur.section ?? "—"}</div>
              {fournisseur.avanceEnCours > 0 && (
                <div style={{ marginTop: 6 }}>
                  <span className="t-badge t-badge--danger">Avance en cours : {fournisseur.avanceEnCours.toLocaleString("fr-FR")} FCFA</span>
                </div>
              )}
            </div>

            <div className="t-form">
              <div className="t-field">
                <label className="t-label">Nombre de sacs</label>
                <input
                  type="number"
                  className="t-input t-input--lg"
                  value={nombreSacs}
                  onChange={(e) => setNombreSacs(e.target.value)}
                  inputMode="numeric"
                  min="1"
                  placeholder="Ex: 5"
                />
              </div>

              <div className="t-field">
                <label className="t-label">Poids brut (kg)</label>
                <input
                  type="number"
                  className="t-input t-input--lg"
                  value={poidsBrut}
                  onChange={(e) => setPoidsBrut(e.target.value)}
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="Ex: 125.5"
                />
              </div>

              <div className="t-field">
                <label className="t-label">Retenue / tare (kg)</label>
                <input
                  type="number"
                  className="t-input"
                  value={retenueKg}
                  onChange={(e) => setRetenueKg(e.target.value)}
                  inputMode="decimal"
                  step="0.1"
                  min="0"
                  placeholder="0"
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

              {/* Aperçu calcul */}
              {poidsBrut && prix && (
                <div className="t-recap">
                  <div className="t-recap-row">
                    <span className="t-recap-row__label">Poids net</span>
                    <span className="t-recap-row__value">{poidsNet.toFixed(1)} kg</span>
                  </div>
                  <div className="t-recap-row">
                    <span className="t-recap-row__label">Prix ({prix.prixBordChampFcfa.toLocaleString("fr-FR")} FCFA/kg)</span>
                    <span className="t-recap-row__value">{montantBrut.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                  {avanceDed > 0 && (
                    <div className="t-recap-row t-recap-row--deduction">
                      <span className="t-recap-row__label">− Avance</span>
                      <span className="t-recap-row__value">−{avanceDed.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  )}
                  {intrantsDed > 0 && (
                    <div className="t-recap-row t-recap-row--deduction">
                      <span className="t-recap-row__label">− Intrants</span>
                      <span className="t-recap-row__value">−{intrantsDed.toLocaleString("fr-FR")} FCFA</span>
                    </div>
                  )}
                  <div className="t-divider" />
                  <div className="t-recap-row t-recap-row--total">
                    <span className="t-recap-row__label" style={{ fontWeight: 700 }}>Net à payer</span>
                    <span className="t-recap-row__value">{montantNet.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                </div>
              )}

              <button
                className="t-btn t-btn--primary"
                disabled={!poidsBrut || parseFloat(poidsBrut) <= 0}
                onClick={() => setStep(3)}
              >
                Continuer →
              </button>
            </div>
          </>
        )}

        {/* STEP 3 : Confirmation */}
        {step === 3 && fournisseur && prix && (
          <div className="t-form">
            <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
              <div style={{ fontSize: "1rem", color: "var(--t-muted)" }}>Confirmer la collecte</div>
            </div>

            <div className="t-recap">
              <div className="t-recap-row">
                <span className="t-recap-row__label">Planteur</span>
                <span className="t-recap-row__value">{fournisseur.nom} {fournisseur.prenoms}</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Sacs / Poids brut</span>
                <span className="t-recap-row__value">{nombreSacs || "—"} sacs / {poidsBrutNum.toFixed(1)} kg</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Retenue</span>
                <span className="t-recap-row__value">{retenueNum.toFixed(1)} kg</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Poids net</span>
                <span className="t-recap-row__value">{poidsNet.toFixed(1)} kg</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Prix unitaire</span>
                <span className="t-recap-row__value">{prix.prixBordChampFcfa.toLocaleString("fr-FR")} FCFA/kg</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Montant brut</span>
                <span className="t-recap-row__value">{montantBrut.toLocaleString("fr-FR")} FCFA</span>
              </div>
              {avanceDed > 0 && (
                <div className="t-recap-row t-recap-row--deduction">
                  <span className="t-recap-row__label">− Avance déduite</span>
                  <span className="t-recap-row__value">−{avanceDed.toLocaleString("fr-FR")} FCFA</span>
                </div>
              )}
              {intrantsDed > 0 && (
                <div className="t-recap-row t-recap-row--deduction">
                  <span className="t-recap-row__label">− Intrants déduits</span>
                  <span className="t-recap-row__value">−{intrantsDed.toLocaleString("fr-FR")} FCFA</span>
                </div>
              )}
              <div className="t-divider" />
              <div className="t-recap-row t-recap-row--total">
                <span className="t-recap-row__label" style={{ fontWeight: 800, fontSize: "1rem" }}>NET À PAYER</span>
                <span className="t-recap-row__value" style={{ fontSize: "1.3rem" }}>{montantNet.toLocaleString("fr-FR")} FCFA</span>
              </div>
              <div className="t-recap-row">
                <span className="t-recap-row__label">Mode</span>
                <span className="t-recap-row__value">
                  {modePaiement === "especes" ? "💵 Espèces" : modePaiement === "orange_money" ? "🟠 Orange Money" : "🟡 MTN MoMo"}
                </span>
              </div>
            </div>

            {!isOnline && (
              <div style={{ background: "var(--t-warning-bg)", color: "var(--t-warning)", borderRadius: "var(--t-radius)", padding: "12px 14px", fontSize: ".9rem", fontWeight: 600 }}>
                📴 Hors ligne — l'opération sera synchronisée dès le retour du réseau
              </div>
            )}

            {erreur && (
              <div style={{ background: "var(--t-danger-bg)", color: "var(--t-danger)", borderRadius: "var(--t-radius)", padding: "12px 14px", fontSize: ".9rem", fontWeight: 600 }}>
                ❌ {erreur}
              </div>
            )}

            <button
              className="t-btn t-btn--success"
              disabled={submitting}
              onClick={handleConfirmer}
            >
              {submitting ? "Enregistrement…" : "✅ Confirmer la collecte"}
            </button>

            <button className="t-btn t-btn--ghost" onClick={() => setStep(2)}>
              Modifier
            </button>
          </div>
        )}

        {/* STEP 4 : Succès */}
        {step === 4 && (
          <div className="t-success-screen">
            <div className="t-success-screen__icon">{isOnline ? "✅" : "📴"}</div>
            <div className="t-success-screen__title">
              {isOnline ? "Collecte enregistrée !" : "Enregistré hors ligne"}
            </div>
            <div className="t-success-screen__sub">
              {isOnline ? "La collecte a été enregistrée avec succès." : "Sera synchronisé dès le retour du réseau."}
            </div>

            {result && (
              <div className="t-success-screen__card t-gap">
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Référence</span>
                  <span className="t-recap-row__value">{result.ref}</span>
                </div>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Planteur</span>
                  <span className="t-recap-row__value">{result.membreNom}</span>
                </div>
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Poids net</span>
                  <span className="t-recap-row__value">{result.poidsNetKg.toFixed(1)} kg</span>
                </div>
                {result.avanceDeduiteFcfa > 0 && (
                  <div className="t-recap-row t-recap-row--deduction">
                    <span className="t-recap-row__label">Avance déduite</span>
                    <span className="t-recap-row__value">−{result.avanceDeduiteFcfa.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                )}
                <div className="t-recap-row t-recap-row--total">
                  <span className="t-recap-row__label">Net payé</span>
                  <span className="t-recap-row__value">{result.montantNetFcfa.toLocaleString("fr-FR")} FCFA</span>
                </div>
              </div>
            )}

            <button className="t-btn t-btn--primary" style={{ width: "100%", maxWidth: 320 }} onClick={reset}>
              Nouvelle collecte
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

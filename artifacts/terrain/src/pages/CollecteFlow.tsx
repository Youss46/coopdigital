import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import FournisseurSearch from "../components/FournisseurSearch";
import OfflineBanner from "../components/OfflineBanner";
import BottomNav from "../components/BottomNav";
import BottomNavPeseur from "../components/BottomNavPeseur";
import ScaleWeightDisplay from "../components/ScaleWeightDisplay";
import { useOffline } from "../contexts/OfflineContext";
import { enregistrerCollecte, getPrix, imprimerRecuLivraison } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useProxy } from "../contexts/ProxyContext";
import { getCachedPrix, cachePrix } from "../lib/idb";
import type { Fournisseur, CollecteResult, PrixActuel } from "../lib/types";

type Step = 1 | 2 | 3 | 4;

function RecuButton({ livraisonId }: { livraisonId: number }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  async function handlePrint() {
    setLoading(true); setErr("");
    try { await imprimerRecuLivraison(livraisonId); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }
  return (
    <div style={{ width: "100%", maxWidth: 320 }}>
      <button
        className="t-btn t-btn--ghost"
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        onClick={handlePrint}
        disabled={loading}
      >
        {loading ? "⏳ Génération…" : "🖨️ Imprimer le reçu"}
      </button>
      {err && <div style={{ color: "var(--t-danger)", fontSize: ".78rem", textAlign: "center", marginTop: 4 }}>{err}</div>}
    </div>
  );
}
export default function CollecteFlow() {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const { user } = useAuth();
  const { proxy } = useProxy();
  const machinePeseeObligatoire = user?.machinePeseeObligatoire === true;
  const [step, setStep] = useState<Step>(1);
  const [fournisseur, setFournisseur] = useState<Fournisseur | null>(null);
  const [prix, setPrix] = useState<PrixActuel | null>(null);

  // Step 2 fields
  const [nombreSacs, setNombreSacs] = useState("");
  const [poidsBrut, setPoidsBrut] = useState("");
  const [retenueKg, setRetenueKg] = useState("0");

  // Step 3 result
  const [result, setResult] = useState<CollecteResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [erreur, setErreur] = useState("");

  // Plan de déduction de l'avance (Step 3)
  const [avancePlan, setAvancePlan] = useState<"integral" | "partiel" | "reporte">("integral");
  const [avanceMontantPartiel, setAvanceMontantPartiel] = useState("");

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

  const isExterne = fournisseur?.typeMembre === "externe";

  const poidsBrutNum = parseFloat(poidsBrut) || 0;
  const retenueNum = parseFloat(retenueKg) || 0;
  const poidsNet = Math.max(0, poidsBrutNum - retenueNum);
  const montantBrut = prix ? Math.round(poidsNet * prix.prixBordChampFcfa) : 0;
  // Plafond de l'avance (déduction maximale possible = intégral)
  const avanceDedMax = (!isExterne && fournisseur) ? Math.min(fournisseur.avanceEnCours, montantBrut) : 0;
  // Déduction effective selon le plan choisi par le délégué
  const avanceDed = avanceDedMax === 0 ? 0
    : avancePlan === "reporte" ? 0
    : avancePlan === "partiel" && avanceMontantPartiel
      ? Math.min(Number(avanceMontantPartiel), avanceDedMax)
      : avanceDedMax; // integral
  const intrantsDed = (!isExterne && fournisseur) ? Math.min(fournisseur.intrantsDus, montantBrut - avanceDed) : 0;
  const montantNet = Math.max(0, montantBrut - avanceDed - intrantsDed);

  async function handleConfirmer() {
    if (!fournisseur || !poidsBrut || !prix) return;
    setSubmitting(true);
    setErreur("");
    const localId = crypto.randomUUID();
    try {
      const res = await enregistrerCollecte(
        {
          ...(isExterne
            ? { fournisseurId: fournisseur.id }
            : { membreId: fournisseur.id }),
          nombreSacs: parseInt(nombreSacs) || 1,
          poidsBrutKg: poidsBrutNum,
          retenueKg: retenueNum,
          localId,
          ...(proxy ? { targetDelegueId: proxy.id } : {}),
          // Plan de déduction — transmis uniquement pour les membres avec avance
          ...(!isExterne && avanceDedMax > 0 ? {
            avancePlanType: avancePlan,
            avanceMontantPartiel: avancePlan === "partiel" && avanceMontantPartiel ? Number(avanceMontantPartiel) : undefined,
          } : {}),
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
    setResult(null);
    setErreur("");
    setAvancePlan("integral");
    setAvanceMontantPartiel("");
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
            title="Choisir le planteur ou fournisseur"
            onSelect={(f) => { setFournisseur(f); setStep(2); }}
          />
        )}

        {/* STEP 2 : Saisir pesée */}
        {step === 2 && fournisseur && (
          <>
            {/* Récap fournisseur */}
            <div className="t-card" style={{ margin: "16px 16px 0", borderLeft: `4px solid ${isExterne ? "#f59e0b" : "var(--t-primary)"}` }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem" }}>{fournisseur.nom} {fournisseur.prenoms}</div>
              <div className="t-text-muted">{fournisseur.code} · {isExterne ? "Fournisseur externe" : (fournisseur.section ?? "—")}</div>
              {isExterne && (
                <div style={{ marginTop: 6 }}>
                  <span className="t-badge" style={{ background: "rgba(245,158,11,.15)", color: "#f59e0b" }}>🏷️ Pisteur / Non-membre</span>
                </div>
              )}
              {!isExterne && fournisseur.avanceEnCours > 0 && (
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

              {/* Lecture automatique depuis la balance RS232 (service local) */}
              <ScaleWeightDisplay
                onUse={(kg) => setPoidsBrut(kg.toFixed(1))}
              />

              <div className="t-field">
                <label className="t-label">Poids brut (kg)</label>
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
                  step="0.1"
                  min="0"
                  placeholder={machinePeseeObligatoire ? "Poids depuis la balance" : "Ex: 125.5"}
                  readOnly={machinePeseeObligatoire}
                  style={machinePeseeObligatoire ? { background: "#f1f5f9", color: "#94a3b8", cursor: "not-allowed" } : undefined}
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
                <span className="t-recap-row__label">{isExterne ? "Fournisseur ext." : "Planteur"}</span>
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
            </div>

            {/* ── Choix du plan de déduction de l'avance ── */}
            {!isExterne && avanceDedMax > 0 && (
              <div style={{ background: "#fefce8", border: "2px solid #f59e0b", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: ".85rem", color: "#92400e", marginBottom: 8 }}>
                  ⚠️ Avance en cours : {fournisseur.avanceEnCours.toLocaleString("fr-FR")} FCFA
                </div>
                <select
                  value={avancePlan}
                  onChange={(e) => { setAvancePlan(e.target.value as "integral" | "partiel" | "reporte"); setAvanceMontantPartiel(""); }}
                  style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #d97706", background: "#fff", fontSize: ".85rem", marginBottom: 6 }}
                >
                  <option value="integral">Déduire intégralement — {avanceDedMax.toLocaleString("fr-FR")} FCFA</option>
                  <option value="partiel">Déduction partielle — montant à définir</option>
                  <option value="reporte">Reporter — pas de déduction sur cette livraison</option>
                </select>
                {avancePlan === "partiel" && (
                  <input
                    type="number"
                    placeholder={`Montant à déduire (max ${avanceDedMax.toLocaleString("fr-FR")} FCFA)`}
                    value={avanceMontantPartiel}
                    inputMode="numeric"
                    min={1}
                    max={avanceDedMax}
                    onChange={(e) => setAvanceMontantPartiel(e.target.value)}
                    style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1px solid #d97706", fontSize: ".85rem" }}
                  />
                )}
              </div>
            )}

            <div className="t-recap">
              {avanceDed > 0 && (
                <div className="t-recap-row t-recap-row--deduction">
                  <span className="t-recap-row__label">− Avance déduite</span>
                  <span className="t-recap-row__value">−{avanceDed.toLocaleString("fr-FR")} FCFA</span>
                </div>
              )}
              {avancePlan === "reporte" && avanceDedMax > 0 && (
                <div className="t-recap-row" style={{ color: "#f59e0b", fontSize: ".8rem" }}>
                  <span className="t-recap-row__label">↩ Avance reportée</span>
                  <span className="t-recap-row__value">{fournisseur.avanceEnCours.toLocaleString("fr-FR")} FCFA</span>
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
                <span className="t-recap-row__label">Règlement</span>
                <span className="t-recap-row__value" style={{ color: "var(--t-warning, #f59e0b)", fontWeight: 700 }}>⏳ En attente</span>
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
            <div className="t-success-screen__icon">
              {!isOnline ? "📴" : "✅"}
            </div>
            <div className="t-success-screen__title">
              {!isOnline ? "Enregistré hors ligne" : "Collecte enregistrée !"}
            </div>
            <div className="t-success-screen__sub">
              {!isOnline
                ? "Sera synchronisé dès le retour du réseau."
                : "Le règlement sera confirmé depuis la page Règlements."}
            </div>

            {result && (
              <div style={{ background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 12, padding: "12px 16px", margin: "0 24px", width: "100%", maxWidth: 320, boxSizing: "border-box" }}>
                <div style={{ fontWeight: 700, color: "#92400e", fontSize: ".9rem", marginBottom: 4 }}>⏳ En attente de règlement</div>
                <div style={{ fontSize: ".85rem", color: "#78350f" }}>
                  {result.montantNetFcfa.toLocaleString("fr-FR")} FCFA à régler à {result.membreNom || (isExterne ? "le fournisseur" : "le planteur")}.
                </div>
              </div>
            )}

            {(result?.saisiePour || (!result && proxy)) && (
              <div style={{ background: "rgba(99,102,241,.08)", border: "1px solid rgba(99,102,241,.25)", borderRadius: 10, padding: "10px 14px", margin: "0 24px", width: "100%", maxWidth: 320, boxSizing: "border-box", fontSize: ".85rem", color: "#4338ca", fontWeight: 600 }}>
                🔁 Saisie pour : {result?.saisiePour ?? `${proxy!.nom} ${proxy!.prenoms}`}
              </div>
            )}

            {result && (
              <div className="t-success-screen__card t-gap">
                <div className="t-recap-row">
                  <span className="t-recap-row__label">Référence</span>
                  <span className="t-recap-row__value">{result.ref}</span>
                </div>
                {result.saisiePour && (
                  <div className="t-recap-row">
                    <span className="t-recap-row__label">Saisie pour</span>
                    <span className="t-recap-row__value" style={{ color: "#4338ca", fontWeight: 700 }}>{result.saisiePour}</span>
                  </div>
                )}
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
                  <span className="t-recap-row__label">{result.statutPaiement === "DIFFÉRÉ" ? "Net à payer" : "Net payé"}</span>
                  <span className="t-recap-row__value">{result.montantNetFcfa.toLocaleString("fr-FR")} FCFA</span>
                </div>
                {result.commissionFcfa != null && result.commissionFcfa > 0 && (
                  <div className="t-recap-row" style={{ background: "#f0fdf4", borderRadius: 8, padding: "6px 0" }}>
                    <span className="t-recap-row__label" style={{ color: "#16a34a" }}>🎯 Ma commission</span>
                    <span className="t-recap-row__value" style={{ color: "#16a34a", fontWeight: 700 }}>+{result.commissionFcfa.toLocaleString("fr-FR")} FCFA</span>
                  </div>
                )}
                {result.statutPaiement && (
                  <div className="t-recap-row">
                    <span className="t-recap-row__label">Statut</span>
                    <span className="t-recap-row__value">
                      <span className={result.statutPaiement === "DIFFÉRÉ" ? "t-badge t-badge--warning" : "t-badge t-badge--success"}>
                        {result.statutPaiement}
                      </span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {result?.livraisonId && isOnline && (
              <RecuButton livraisonId={result.livraisonId} />
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

      {user?.role === "peseur"
        ? <BottomNavPeseur delegueId={user.delegueId} />
        : <BottomNav />}
    </div>
  );
}

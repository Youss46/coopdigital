import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/Layout";
import { fetchPlans, createCooperative, type Plan } from "@/lib/api";
import { CheckCircle2, ChevronRight, Loader2, AlertCircle } from "lucide-react";

const DUREES = [1, 2, 3, 5] as const;
type Duree = 1 | 2 | 3 | 5;

const inputCls = "w-full px-3 py-2.5 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

function prix(plan: Plan, duree: Duree): number {
  const map: Record<Duree, string> = {
    1: plan.prix1anFcfa, 2: plan.prix2ansFcfa,
    3: plan.prix3ansFcfa, 5: plan.prix5ansFcfa,
  };
  return parseInt(map[duree] || "0");
}

export default function NouvelleCoop() {
  const [step, setStep] = useState(1);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [, navigate] = useLocation();

  // Form state
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [region, setRegion] = useState("");
  const [pcaNom, setPcaNom] = useState("");
  const [pcaPrenoms, setPcaPrenoms] = useState("");
  const [pcaTel, setPcaTel] = useState("");
  const [pcaEmail, setPcaEmail] = useState("");
  const [planId, setPlanId] = useState<number | null>(null);
  const [duree, setDuree] = useState<Duree>(1);
  const [isTrial, setIsTrial] = useState(false);
  const [trialJours, setTrialJours] = useState(30);
  const [montantPaye, setMontantPaye] = useState("");
  const [modePaiement, setModePaiement] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchPlans().then(setPlans).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selectedPlan = plans.find((p) => p.id === planId);
  const montantAttendu = selectedPlan && !isTrial ? prix(selectedPlan, duree) : 0;

  async function submit() {
    if (!isTrial && !planId) return;
    setSubmitting(true); setError("");
    try {
      await createCooperative({
        nom, ville, region, planId, dureeAns: duree,
        renouvellementAuto: false,
        trialActif: isTrial, dureeTrialJours: isTrial ? trialJours : undefined,
        montantPaye: montantPaye ? parseInt(montantPaye) : undefined,
        modePaiement: modePaiement || undefined,
        referencePaiement: reference || undefined,
        notesInternes: notes || undefined,
        pcaNom, pcaPrenoms, pcaTelephone: pcaTel, pcaEmail: pcaEmail || undefined,
      });
      navigate("/cooperatives");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSubmitting(false);
    }
  }

  const steps = ["Coopérative", "Licence", "Paiement"];

  return (
    <Layout>
      <div className="p-8 max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Nouvelle coopérative</h1>
          <p className="text-muted-foreground text-sm">Enregistrement et activation de licence</p>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 ${step > i + 1 ? "text-primary" : step === i + 1 ? "text-foreground" : "text-muted-foreground"}`}>
                <div className={`size-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                  step > i + 1 ? "bg-primary border-primary text-white" :
                  step === i + 1 ? "border-primary text-primary" :
                  "border-border"
                }`}>
                  {step > i + 1 ? <CheckCircle2 size={14} /> : i + 1}
                </div>
                <span className="text-sm font-medium hidden sm:block">{s}</span>
              </div>
              {i < steps.length - 1 && <ChevronRight size={14} className="text-border" />}
            </div>
          ))}
        </div>

        <div className="bg-card border rounded-xl p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 size={20} className="animate-spin mr-2" /> Chargement…
            </div>
          ) : (
            <>
              {/* Step 1 */}
              {step === 1 && (
                <div className="space-y-4">
                  <h2 className="font-semibold text-lg mb-4">Informations de la coopérative</h2>
                  <Field label="Nom de la coopérative" required>
                    <input value={nom} onChange={(e) => setNom(e.target.value)} className={inputCls} placeholder="COOP-CA Divo" />
                  </Field>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Ville" required>
                      <input value={ville} onChange={(e) => setVille(e.target.value)} className={inputCls} placeholder="Divo" />
                    </Field>
                    <Field label="Région" required>
                      <input value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls} placeholder="Lôh-Djiboua" />
                    </Field>
                  </div>
                  <div className="border-t pt-4 mt-4">
                    <h3 className="font-medium mb-3 text-sm text-muted-foreground uppercase tracking-wide">PCA / Directeur</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label="Nom" required>
                        <input value={pcaNom} onChange={(e) => setPcaNom(e.target.value)} className={inputCls} placeholder="Konan" />
                      </Field>
                      <Field label="Prénoms" required>
                        <input value={pcaPrenoms} onChange={(e) => setPcaPrenoms(e.target.value)} className={inputCls} placeholder="Yao Bernard" />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <Field label="Téléphone" required>
                        <input value={pcaTel} onChange={(e) => setPcaTel(e.target.value)} className={inputCls} placeholder="+225 07 XX XX XX XX" />
                      </Field>
                      <Field label="Email">
                        <input value={pcaEmail} onChange={(e) => setPcaEmail(e.target.value)} className={inputCls} placeholder="directeur@coop.ci" />
                      </Field>
                    </div>
                  </div>
                  <button
                    onClick={() => { if (nom && ville && region && pcaNom && pcaPrenoms && pcaTel) setStep(2); }}
                    disabled={!nom || !ville || !region || !pcaNom || !pcaPrenoms || !pcaTel}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 mt-2"
                  >
                    Suivant →
                  </button>
                </div>
              )}

              {/* Step 2 */}
              {step === 2 && (
                <div className="space-y-5">
                  <h2 className="font-semibold text-lg mb-4">Plan & durée de licence</h2>
                  <div className="flex items-center gap-3 p-3 border rounded-lg bg-yellow-50 border-yellow-200">
                    <input type="checkbox" id="trial" checked={isTrial} onChange={(e) => setIsTrial(e.target.checked)} className="size-4 accent-yellow-500" />
                    <label htmlFor="trial" className="text-sm font-medium text-yellow-800 cursor-pointer">Activer une période d'essai (trial) à la place d'une licence payante</label>
                  </div>
                  {isTrial && (
                    <Field label="Durée du trial (jours)">
                      <input type="number" value={trialJours} onChange={(e) => setTrialJours(Number(e.target.value))} min={7} max={90} className={inputCls} />
                    </Field>
                  )}
                  {!isTrial && (
                    <>
                      <div>
                        <label className="block text-sm font-medium mb-2">Plan d'abonnement <span className="text-destructive">*</span></label>
                        <div className="space-y-2">
                          {plans.map((p) => (
                            <label key={p.id} className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors ${planId === p.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
                              <input type="radio" name="plan" value={p.id} checked={planId === p.id} onChange={() => setPlanId(p.id)} className="mt-0.5 accent-primary" />
                              <div className="flex-1">
                                <div className="font-semibold">{p.nom}</div>
                                <div className="text-sm text-muted-foreground mt-1">
                                  {p.nbMembresMax ? `${p.nbMembresMax} membres max · ` : "Membres illimités · "}
                                  {p.nbUsersMax ? `${p.nbUsersMax} utilisateurs · ` : ""}
                                  Stockage {p.stockageGo ?? "—"} Go
                                </div>
                                <div className="text-sm font-medium text-primary mt-1">
                                  {parseInt(p.prix1anFcfa).toLocaleString("fr-FR")} FCFA/an
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                      <Field label="Durée">
                        <div className="grid grid-cols-4 gap-2">
                          {DUREES.map((d) => (
                            <button key={d} onClick={() => setDuree(d)}
                              className={`py-2 border-2 rounded-lg text-sm font-medium transition-colors ${duree === d ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary/40"}`}>
                              {d} an{d > 1 ? "s" : ""}
                            </button>
                          ))}
                        </div>
                        {selectedPlan && (
                          <div className="mt-2 text-sm font-semibold text-primary">
                            Montant : {prix(selectedPlan, duree).toLocaleString("fr-FR")} FCFA
                          </div>
                        )}
                      </Field>
                    </>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setStep(1)} className="flex-1 py-2.5 border rounded-lg text-sm font-medium hover:bg-muted">← Retour</button>
                    <button onClick={() => setStep(3)} disabled={!isTrial && !planId} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40">
                      Suivant →
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3 */}
              {step === 3 && (
                <div className="space-y-4">
                  <h2 className="font-semibold text-lg mb-4">Paiement & finalisation</h2>
                  {!isTrial && (
                    <>
                      <Field label="Montant encaissé (FCFA)">
                        <input type="number" value={montantPaye} onChange={(e) => setMontantPaye(e.target.value)}
                          className={inputCls} placeholder={montantAttendu.toString()} />
                        {montantAttendu > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">Montant attendu : {montantAttendu.toLocaleString("fr-FR")} FCFA</div>
                        )}
                      </Field>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Mode de paiement">
                          <select value={modePaiement} onChange={(e) => setModePaiement(e.target.value)} className={inputCls}>
                            <option value="">— Sélectionner —</option>
                            <option>Virement bancaire</option>
                            <option>Mobile Money</option>
                            <option>Espèces</option>
                            <option>Chèque</option>
                          </select>
                        </Field>
                        <Field label="Référence / reçu">
                          <input value={reference} onChange={(e) => setReference(e.target.value)} className={inputCls} placeholder="VIR-2026-001" />
                        </Field>
                      </div>
                    </>
                  )}
                  <Field label="Notes internes">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                      rows={3} className={inputCls + " resize-none"} placeholder="Observations, conditions particulières…" />
                  </Field>

                  <div className="border rounded-lg p-4 bg-muted/30 text-sm space-y-1">
                    <div className="font-semibold mb-2">Récapitulatif</div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Coopérative</span><span className="font-medium">{nom}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">PCA</span><span>{pcaPrenoms} {pcaNom}</span></div>
                    {isTrial ? (
                      <div className="flex justify-between"><span className="text-muted-foreground">Trial</span><span>{trialJours} jours</span></div>
                    ) : (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span>{selectedPlan?.nom}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Durée</span><span>{duree} an{duree > 1 ? "s" : ""}</span></div>
                      </>
                    )}
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm">
                      <AlertCircle size={15} /> {error}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setStep(2)} className="flex-1 py-2.5 border rounded-lg text-sm font-medium hover:bg-muted">← Retour</button>
                    <button onClick={submit} disabled={submitting}
                      className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                      {submitting && <Loader2 size={14} className="animate-spin" />}
                      {submitting ? "Création…" : "Créer la coopérative"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

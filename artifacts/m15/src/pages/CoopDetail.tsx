import { useEffect, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import Layout from "@/components/Layout";
import {
  fetchCooperative, fetchPlans, renouvelerLicence, suspendreCooperative,
  reactiverCooperative, supprimerCooperative, toggleRenouvellementAuto,
  resetPasswordPca, updatePca,
  formatDate, formatFcfa, statutColor, joursColor,
  type CoopDetail as CoopDetailType, type Plan,
} from "@/lib/api";
import {
  Loader2, AlertCircle, ArrowLeft, CheckCircle2, PauseCircle, XCircle,
  RefreshCw, Trash2, RotateCcw, Clock, History, BarChart3, FileKey,
  User, KeyRound, Copy, Check, ShieldAlert, Pencil, Phone, Mail,
} from "lucide-react";

type Tab = "licence" | "pca" | "stats" | "historique";

const DUREES = [1, 2, 3, 5] as const;
type Duree = 1 | 2 | 3 | 5;

const inputCls = "w-full px-3 py-2.5 border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card border rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="p-1.5 rounded-md hover:bg-muted" title="Copier">
      {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} className="text-muted-foreground" />}
    </button>
  );
}

export default function CoopDetail() {
  const params = useParams<{ id: string }>();
  const id = parseInt(params.id ?? "0");
  const [, navigate] = useLocation();
  const [data, setData] = useState<CoopDetailType | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("licence");

  const [showRenouveler, setShowRenouveler] = useState(false);
  const [showSuspendre, setShowSuspendre] = useState(false);
  const [showSupprimer, setShowSupprimer] = useState(false);
  const [showResetPca, setShowResetPca] = useState(false);
  const [showEditPca, setShowEditPca] = useState(false);

  const [renouvDuree, setRenouvDuree] = useState<Duree>(1);
  const [renouvMontant, setRenouvMontant] = useState("");
  const [renouvMode, setRenouvMode] = useState("");
  const [renouvRef, setRenouvRef] = useState("");
  const [motifSuspendre, setMotifSuspendre] = useState("");
  const [motifSupp, setMotifSupp] = useState("");
  const [confirSupp, setConfirSupp] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Reset PCA result
  const [resetResult, setResetResult] = useState<{ motdepasse_clair: string; email: string; sms_envoye: boolean; telephone: string | null } | null>(null);

  // Edit PCA form
  const [editNom, setEditNom] = useState("");
  const [editPrenoms, setEditPrenoms] = useState("");
  const [editTel, setEditTel] = useState("");
  const [editEmail, setEditEmail] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [d, ps] = await Promise.all([fetchCooperative(id), fetchPlans()]);
      setData(d); setPlans(ps);
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [id]);

  function openEditPca() {
    if (!data?.pca) return;
    setEditNom(data.pca.nom);
    setEditPrenoms(data.pca.prenoms);
    setEditTel(data.pca.telephone ?? "");
    setEditEmail(data.pca.email);
    setActionError("");
    setShowEditPca(true);
  }

  async function doRenouveler() {
    if (!data?.licenceCourante) return;
    setActionLoading(true); setActionError("");
    try {
      await renouvelerLicence(data.licenceCourante.id, {
        dureeAns: renouvDuree,
        montantPaye: renouvMontant ? parseInt(renouvMontant) : undefined,
        modePaiement: renouvMode || undefined, referencePaiement: renouvRef || undefined,
      });
      setShowRenouveler(false); await load();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionLoading(false); }
  }

  async function doSuspendre() {
    setActionLoading(true); setActionError("");
    try { await suspendreCooperative(id, motifSuspendre); setShowSuspendre(false); await load(); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionLoading(false); }
  }

  async function doReactiver() {
    setActionLoading(true); setError("");
    try { await reactiverCooperative(id); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionLoading(false); }
  }

  async function doSupprimer() {
    setActionLoading(true); setActionError("");
    try { await supprimerCooperative(id, motifSupp, confirSupp); navigate("/cooperatives"); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionLoading(false); }
  }

  async function doToggleAuto(activer: boolean) {
    if (!data?.licenceCourante) return;
    setActionLoading(true);
    try { await toggleRenouvellementAuto(data.licenceCourante.id, activer); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionLoading(false); }
  }

  async function doResetPca() {
    setActionLoading(true); setActionError("");
    try {
      const res = await resetPasswordPca(id);
      setResetResult(res);
    } catch (e) { setActionError(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionLoading(false); }
  }

  async function doUpdatePca() {
    setActionLoading(true); setActionError("");
    try {
      await updatePca(id, { nom: editNom, prenoms: editPrenoms, telephone: editTel, email: editEmail });
      setShowEditPca(false);
      await load();
    } catch (e) { setActionError(e instanceof Error ? e.message : "Erreur"); }
    finally { setActionLoading(false); }
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: "licence", label: "Licence", icon: FileKey },
    { id: "pca", label: "PCA", icon: User },
    { id: "stats", label: "Statistiques", icon: BarChart3 },
    { id: "historique", label: "Historique", icon: History },
  ];

  return (
    <Layout>
      <div className="p-8 max-w-4xl mx-auto">
        <Link href="/cooperatives">
          <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors">
            <ArrowLeft size={15} /> Retour aux coopératives
          </button>
        </Link>

        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 size={24} className="animate-spin mr-3" /> Chargement…
          </div>
        )}
        {error && (
          <div className="text-destructive bg-destructive/10 rounded-lg p-4 text-sm mb-4 flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => void load()} className="shrink-0 text-xs underline hover:no-underline">Réessayer</button>
          </div>
        )}
        {!loading && !data && !error && (
          <div className="text-center py-20 text-muted-foreground">
            <p className="mb-3">Coopérative introuvable ou connexion perdue.</p>
            <button onClick={() => void load()} className="text-sm text-primary underline hover:no-underline">Réessayer</button>
          </div>
        )}

        {data && (
          <>
            {/* Header */}
            <div className="bg-card border rounded-xl p-6 mb-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h1 className="text-2xl font-bold">{data.cooperative.nom}</h1>
                    {data.licenceCourante && (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statutColor(data.licenceCourante.statut)}`}>
                        {data.licenceCourante.statut}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {data.cooperative.ville}, {data.cooperative.region} · Créée le {formatDate(data.cooperative.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-muted">
                    <RefreshCw size={13} />
                  </button>
                  {data.licenceCourante?.statut === "active" && (
                    <>
                      <button onClick={() => { setShowRenouveler(true); setActionError(""); }} className="flex items-center gap-1.5 px-3 py-2 border border-primary/30 text-primary rounded-lg text-sm hover:bg-primary/5">
                        <RotateCcw size={13} /> Renouveler
                      </button>
                      <button onClick={() => { setShowSuspendre(true); setActionError(""); setMotifSuspendre(""); }} className="flex items-center gap-1.5 px-3 py-2 border border-orange-200 text-orange-700 rounded-lg text-sm hover:bg-orange-50">
                        <PauseCircle size={13} /> Suspendre
                      </button>
                    </>
                  )}
                  {data.licenceCourante?.statut === "suspendue" && (
                    <button onClick={doReactiver} disabled={actionLoading} className="flex items-center gap-1.5 px-3 py-2 border border-green-200 text-green-700 rounded-lg text-sm hover:bg-green-50">
                      <CheckCircle2 size={13} /> Réactiver
                    </button>
                  )}
                  <button onClick={() => { setShowSupprimer(true); setActionError(""); setMotifSupp(""); setConfirSupp(""); }} className="flex items-center gap-1.5 px-3 py-2 border border-destructive/20 text-destructive rounded-lg text-sm hover:bg-destructive/5">
                    <Trash2 size={13} /> Supprimer
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 bg-muted rounded-lg p-1 w-fit">
              {tabs.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === t.id ? "bg-card shadow-sm" : "hover:bg-card/50 text-muted-foreground"}`}>
                  <t.icon size={14} /> {t.label}
                </button>
              ))}
            </div>

            {/* Licence Tab */}
            {tab === "licence" && (
              <div className="space-y-4">
                {data.licenceCourante ? (
                  <div className="bg-card border rounded-xl p-5 grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Plan</span><div className="font-semibold mt-0.5">{data.licenceCourante.planNom ?? "—"}</div></div>
                    <div><span className="text-muted-foreground">Clé de licence</span><div className="font-mono text-xs mt-0.5 bg-muted px-2 py-1 rounded">{data.licenceCourante.cleLicence}</div></div>
                    <div><span className="text-muted-foreground">Activation</span><div className="font-medium mt-0.5">{formatDate(data.licenceCourante.dateActivation)}</div></div>
                    <div><span className="text-muted-foreground">Expiration</span>
                      <div className={`font-medium mt-0.5 ${joursColor(data.joursRestants)}`}>
                        {formatDate(data.licenceCourante.dateExpiration)}
                        {data.joursRestants !== null && (
                          <span className="ml-1 text-xs">({data.joursRestants <= 0 ? "expirée" : `J-${data.joursRestants}`})</span>
                        )}
                      </div>
                    </div>
                    <div><span className="text-muted-foreground">Durée</span><div className="font-medium mt-0.5">{data.licenceCourante.dureeAns} an{data.licenceCourante.dureeAns > 1 ? "s" : ""}</div></div>
                    <div>
                      <span className="text-muted-foreground">Renouvellement auto</span>
                      <div className="flex items-center gap-2 mt-1">
                        <button onClick={() => doToggleAuto(!data.licenceCourante!.renouvellementAuto)} disabled={actionLoading}
                          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${data.licenceCourante.renouvellementAuto ? "bg-primary" : "bg-muted-foreground/30"}`}>
                          <span className={`pointer-events-none inline-block size-4 rounded-full bg-white shadow transition-transform ${data.licenceCourante.renouvellementAuto ? "translate-x-4" : "translate-x-0"}`} />
                        </button>
                        <span className="text-xs text-muted-foreground">{data.licenceCourante.renouvellementAuto ? "Activé" : "Désactivé"}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground">
                    <XCircle size={32} className="mx-auto mb-3 opacity-30" />
                    <div className="font-medium">Aucune licence active</div>
                    <div className="text-sm mt-1">Cette coopérative n'a pas de licence en cours.</div>
                  </div>
                )}
              </div>
            )}

            {/* PCA Tab */}
            {tab === "pca" && (
              <div className="space-y-4">
                {data.pca ? (
                  <>
                    <div className="bg-card border rounded-xl p-5">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <User size={20} className="text-primary" />
                          </div>
                          <div>
                            <div className="font-bold text-base">{data.pca.prenoms} {data.pca.nom}</div>
                            <div className="text-xs text-muted-foreground">PCA / Directeur de coopérative</div>
                          </div>
                        </div>
                        <button onClick={openEditPca}
                          className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-muted">
                          <Pencil size={13} /> Modifier
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Mail size={11} /> Email</div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">{data.pca.email}</span>
                            <CopyButton text={data.pca.email} />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Phone size={11} /> Téléphone</div>
                          <div className="font-medium">{data.pca.telephone ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Statut compte</div>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${data.pca.actif ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                            {data.pca.actif ? "Actif" : "Inactif"}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Mot de passe</div>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${data.pca.motDePasseTemporaire ? "bg-yellow-100 text-yellow-800" : "bg-green-100 text-green-800"}`}>
                            {data.pca.motDePasseTemporaire ? <><ShieldAlert size={10} /> Temporaire (non changé)</> : <><CheckCircle2 size={10} /> Personnel</>}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">Compte créé le</div>
                          <div className="font-medium">{formatDate(data.pca.createdAt)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Reset password */}
                    <div className="bg-card border rounded-xl p-5">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-semibold text-sm mb-0.5 flex items-center gap-2"><KeyRound size={14} /> Réinitialisation du mot de passe</div>
                          <div className="text-xs text-muted-foreground">Génère un nouveau mot de passe temporaire et l'envoie par SMS au PCA.</div>
                        </div>
                        <button
                          onClick={() => { setShowResetPca(true); setResetResult(null); setActionError(""); }}
                          className="flex items-center gap-1.5 px-3 py-2 border border-orange-200 text-orange-700 rounded-lg text-sm hover:bg-orange-50 shrink-0 ml-4">
                          <KeyRound size={13} /> Réinitialiser
                        </button>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="bg-card border rounded-xl p-8 text-center text-muted-foreground">
                    <User size={32} className="mx-auto mb-3 opacity-30" />
                    <div className="font-medium">Aucun compte PCA</div>
                    <div className="text-sm mt-1">Ce compte sera créé lors de l'activation de la licence.</div>
                  </div>
                )}
              </div>
            )}

            {/* Stats Tab */}
            {tab === "stats" && (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Membres enregistrés", value: data.stats.nbMembres },
                  { label: "Utilisateurs actifs", value: data.stats.nbUsers },
                ].map((s) => (
                  <div key={s.label} className="bg-card border rounded-xl p-6 text-center">
                    <div className="text-3xl font-bold text-primary mb-1">{s.value}</div>
                    <div className="text-sm text-muted-foreground">{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Historique Tab */}
            {tab === "historique" && (
              <div className="bg-card border rounded-xl overflow-hidden">
                {data.historique.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Clock size={28} className="mx-auto mb-2 opacity-30" />
                    <div>Aucun événement enregistré</div>
                  </div>
                ) : (
                  <div className="divide-y">
                    {data.historique.map((h) => (
                      <div key={h.id} className="px-5 py-4 flex items-start gap-4">
                        <div className="size-8 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">
                          <History size={13} className="text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{h.action}</div>
                          {(h.ancienStatut || h.nouveauStatut) && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {h.ancienStatut && <span className="mr-1">{h.ancienStatut}</span>}
                              {h.ancienStatut && h.nouveauStatut && <span className="mr-1">→</span>}
                              {h.nouveauStatut && <span>{h.nouveauStatut}</span>}
                            </div>
                          )}
                          {h.effectuePar && <div className="text-xs text-muted-foreground/60 mt-0.5">Par {h.effectuePar}</div>}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">{formatDate(h.createdAt)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal Renouveler */}
      {showRenouveler && (
        <Modal title="Renouveler la licence" onClose={() => setShowRenouveler(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Durée supplémentaire</label>
              <div className="grid grid-cols-4 gap-2">
                {DUREES.map((d) => (
                  <button key={d} onClick={() => setRenouvDuree(d)}
                    className={`py-2 border-2 rounded-lg text-sm font-medium ${renouvDuree === d ? "border-primary bg-primary text-white" : "border-border"}`}>
                    {d}a
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Montant encaissé (FCFA)</label>
              <input value={renouvMontant} onChange={(e) => setRenouvMontant(e.target.value)} className={inputCls} placeholder="0" type="number" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Mode de paiement</label>
                <select value={renouvMode} onChange={(e) => setRenouvMode(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option>Virement bancaire</option>
                  <option>Mobile Money</option>
                  <option>Espèces</option>
                  <option>Chèque</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Référence</label>
                <input value={renouvRef} onChange={(e) => setRenouvRef(e.target.value)} className={inputCls} placeholder="REF-001" />
              </div>
            </div>
            {actionError && <div className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14} /> {actionError}</div>}
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowRenouveler(false)} className="flex-1 py-2.5 border rounded-lg text-sm">Annuler</button>
              <button onClick={doRenouveler} disabled={actionLoading} className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {actionLoading && <Loader2 size={14} className="animate-spin" />} Confirmer
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Suspendre */}
      {showSuspendre && (
        <Modal title="Suspendre la licence" onClose={() => setShowSuspendre(false)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">La coopérative perdra l'accès à CoopDigital jusqu'à réactivation.</p>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Motif de suspension</label>
              <textarea value={motifSuspendre} onChange={(e) => setMotifSuspendre(e.target.value)} rows={3}
                className={inputCls + " resize-none"} placeholder="Non-paiement, demande client, …" />
            </div>
            {actionError && <div className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14} /> {actionError}</div>}
            <div className="flex gap-3">
              <button onClick={() => setShowSuspendre(false)} className="flex-1 py-2.5 border rounded-lg text-sm">Annuler</button>
              <button onClick={doSuspendre} disabled={actionLoading || !motifSuspendre}
                className="flex-1 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {actionLoading && <Loader2 size={14} className="animate-spin" />} Suspendre
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Supprimer */}
      {showSupprimer && (
        <Modal title="Supprimer la coopérative" onClose={() => setShowSupprimer(false)}>
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-sm text-destructive">
              ⚠️ Cette action est irréversible. Toutes les données seront archivées.
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Motif de suppression</label>
              <textarea value={motifSupp} onChange={(e) => setMotifSupp(e.target.value)} rows={2}
                className={inputCls + " resize-none"} placeholder="Raison…" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Tapez <span className="font-mono text-destructive">SUPPRIMER {data?.cooperative.nom.toUpperCase()}</span> pour confirmer
              </label>
              <input value={confirSupp} onChange={(e) => setConfirSupp(e.target.value)} className={inputCls}
                placeholder={`SUPPRIMER ${data?.cooperative.nom.toUpperCase() ?? ""}`} />
            </div>
            {actionError && <div className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14} /> {actionError}</div>}
            <div className="flex gap-3">
              <button onClick={() => setShowSupprimer(false)} className="flex-1 py-2.5 border rounded-lg text-sm">Annuler</button>
              <button onClick={doSupprimer} disabled={actionLoading || confirSupp !== `SUPPRIMER ${data?.cooperative.nom.toUpperCase() ?? ""}` || !motifSupp}
                className="flex-1 py-2.5 bg-destructive text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {actionLoading && <Loader2 size={14} className="animate-spin" />} Supprimer définitivement
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal Reset Mot de passe PCA */}
      {showResetPca && (
        <Modal title="Réinitialiser le mot de passe PCA" onClose={() => { if (!resetResult) setShowResetPca(false); }}>
          {resetResult ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-700 font-semibold">
                <CheckCircle2 size={18} /> Mot de passe réinitialisé avec succès
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Nouveau mot de passe temporaire</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 font-mono text-sm bg-yellow-50 border border-yellow-200 text-yellow-900 px-3 py-2 rounded-lg font-bold tracking-wider">
                    {resetResult.motdepasse_clair}
                  </code>
                  <CopyButton text={resetResult.motdepasse_clair} />
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Email du PCA</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-lg">{resetResult.email}</code>
                  <CopyButton text={resetResult.email} />
                </div>
              </div>
              <div className={`text-xs rounded-lg px-3 py-2 flex items-center gap-2 ${resetResult.sms_envoye ? "bg-green-50 text-green-800" : "bg-yellow-50 text-yellow-800"}`}>
                {resetResult.sms_envoye
                  ? `✓ SMS envoyé au ${resetResult.telephone}`
                  : "⚠️ SMS non envoyé — communiquer le mot de passe manuellement"}
              </div>
              <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                ⚠️ Ce mot de passe ne sera plus affiché après fermeture.
              </div>
              <button onClick={() => { setShowResetPca(false); setResetResult(null); void load(); }}
                className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium">
                Fermer
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Un nouveau mot de passe temporaire sera généré et envoyé par SMS au numéro du PCA.
                Le PCA sera invité à le changer à sa prochaine connexion.
              </p>
              {data?.pca?.telephone && (
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm">
                  <span className="text-muted-foreground">SMS envoyé à : </span>
                  <span className="font-medium">{data.pca.telephone}</span>
                </div>
              )}
              {actionError && <div className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14} /> {actionError}</div>}
              <div className="flex gap-3">
                <button onClick={() => setShowResetPca(false)} className="flex-1 py-2.5 border rounded-lg text-sm">Annuler</button>
                <button onClick={doResetPca} disabled={actionLoading}
                  className="flex-1 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                  {actionLoading && <Loader2 size={14} className="animate-spin" />} Réinitialiser
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* Modal Modifier PCA */}
      {showEditPca && (
        <Modal title="Modifier les informations du PCA" onClose={() => setShowEditPca(false)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Nom</label>
                <input value={editNom} onChange={(e) => setEditNom(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Prénoms</label>
                <input value={editPrenoms} onChange={(e) => setEditPrenoms(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Téléphone</label>
              <input value={editTel} onChange={(e) => setEditTel(e.target.value)} className={inputCls} placeholder="+225 07 XX XX XX XX" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Email de connexion</label>
              <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className={inputCls} type="email" />
            </div>
            {actionError && <div className="text-destructive text-sm flex items-center gap-1"><AlertCircle size={14} /> {actionError}</div>}
            <div className="flex gap-3">
              <button onClick={() => setShowEditPca(false)} className="flex-1 py-2.5 border rounded-lg text-sm">Annuler</button>
              <button onClick={doUpdatePca} disabled={actionLoading}
                className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {actionLoading && <Loader2 size={14} className="animate-spin" />} Enregistrer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}

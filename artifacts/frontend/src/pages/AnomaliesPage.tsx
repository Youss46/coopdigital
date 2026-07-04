import { useState } from "react";
import {
  useGetAnomalies,
  useGetAnomaliesStats,
  useGetAnomaliesConfig,
  useTraiterAnomalie,
  usePutAnomaliesConfig,
  getGetAnomaliesQueryKey,
  getGetAnomaliesStatsQueryKey,
  getGetAnomaliesConfigQueryKey,
  type AnomalieItem,
  type ConfigAnomalies,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { AlertTriangle, CheckCircle2, XCircle, Info, ShieldAlert, ChevronDown, ChevronUp } from "lucide-react";
import { usePermission } from "@/hooks/usePermission";

const GRAVITE_STYLES: Record<string, { label: string; bg: string; text: string; border: string; Icon: React.ElementType }> = {
  critique:  { label: "Critique",  bg: "bg-red-100",    text: "text-red-700",    border: "border-red-200",  Icon: XCircle },
  attention: { label: "Attention", bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-200",Icon: AlertTriangle },
  info:      { label: "Info",      bg: "bg-blue-100",   text: "text-blue-700",   border: "border-blue-200", Icon: Info },
};
const STATUT_LABELS: Record<string, string> = {
  nouvelle: "Nouvelle", en_cours: "En cours", resolue: "Résolue", ignoree: "Ignorée", faux_positif: "Faux positif",
};
const MODULE_LABELS: Record<string, string> = {
  livraisons: "Livraisons", avances: "Avances", stocks: "Stocks", paiements: "Paiements", comptabilite: "Comptabilité",
};

function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const TABS = ["Tableau de bord", "Liste des anomalies", "Configuration"] as const;
type Tab = typeof TABS[number];

// ─── Tab 1 : Dashboard ────────────────────────────────────────────────────────
function TabDashboard() {
  const { data: stats } = useGetAnomaliesStats({ query: { queryKey: getGetAnomaliesStatsQueryKey() } });

  const kpis = [
    { label: "Critiques non traitées", value: Number(stats?.nb_critiques ?? 0), color: "text-red-600",   bg: "bg-red-50",   border: "border-red-100",   Icon: XCircle },
    { label: "Attentions non traitées", value: Number(stats?.nb_attention ?? 0), color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100", Icon: AlertTriangle },
    { label: "Résolues ce mois",        value: Number(stats?.nb_resolues_mois ?? 0), color: "text-green-600", bg: "bg-green-50", border: "border-green-100", Icon: CheckCircle2 },
    { label: "Faux positifs ce mois",   value: Number(stats?.nb_faux_positifs ?? 0), color: "text-slate-500",  bg: "bg-slate-50", border: "border-slate-100", Icon: Info },
  ];

  const parModule = (stats?.par_module ?? []).map((m: { module?: string; nb?: number }) => ({
    name: MODULE_LABELS[m.module ?? ""] ?? m.module ?? "Autre",
    nb: Number(m.nb ?? 0),
  }));

  const evolution = (stats?.evolution ?? []).map((e: { jour?: string; nb?: number }) => ({
    jour: e.jour ? e.jour.slice(5) : "",
    nb: Number(e.nb ?? 0),
  }));

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className={`rounded-xl border ${k.border} ${k.bg} p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <k.Icon className={`${k.color} w-5 h-5`} />
              <span className="text-xs text-gray-500 leading-tight">{k.label}</span>
            </div>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Graphiques */}
      <div className="grid lg:grid-cols-2 gap-5">
        {/* Par module */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Anomalies par module</h3>
          {parModule.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={parModule} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="nb" fill="#c4962a" radius={[4, 4, 0, 0]} name="Anomalies" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Évolution 30j */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-4">Évolution sur 30 jours</h3>
          {evolution.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={evolution} margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="jour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="nb" stroke="#dc2626" strokeWidth={2} dot={false} name="Anomalies" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top agents / membres */}
      <div className="grid lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Top 5 agents déclencheurs</h3>
          {(stats?.top_agents ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm">Aucune donnée</p>
          ) : (
            <div className="space-y-2">
              {(stats?.top_agents ?? []).map((a: { agent_id?: number | null; nb?: number }, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Agent #{a.agent_id ?? "—"}</span>
                  <span className="font-semibold text-gray-900">{Number(a.nb ?? 0)} anomalies</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-800 text-sm mb-3">Top 5 membres concernés</h3>
          {(stats?.top_membres ?? []).length === 0 ? (
            <p className="text-gray-400 text-sm">Aucune donnée</p>
          ) : (
            <div className="space-y-2">
              {(stats?.top_membres ?? []).map((m: { membre_id?: number | null; nb?: number }, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Membre #{m.membre_id ?? "—"}</span>
                  <span className="font-semibold text-gray-900">{Number(m.nb ?? 0)} anomalies</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab 2 : Liste ────────────────────────────────────────────────────────────
function TabListe({ peutTraiter }: { peutTraiter: boolean }) {
  const qc = useQueryClient();
  const [filtreGravite, setFiltreGravite] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("");
  const [filtreModule, setFiltreModule] = useState("");
  const [modalAnomalie, setModalAnomalie] = useState<AnomalieItem | null>(null);
  const [traitementStatut, setTraitementStatut] = useState<"resolue" | "ignoree" | "faux_positif">("resolue");
  const [commentaire, setCommentaire] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data } = useGetAnomalies(
    { gravite: filtreGravite || undefined, statut: filtreStatut || undefined, module: filtreModule || undefined, limit: 50 },
    { query: { queryKey: getGetAnomaliesQueryKey({ gravite: filtreGravite || undefined, statut: filtreStatut || undefined, module: filtreModule || undefined, limit: 50 }) } },
  );
  const anomalies = (data?.anomalies ?? []) as AnomalieItem[];

  const traiterMutation = useTraiterAnomalie({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getGetAnomaliesQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetAnomaliesStatsQueryKey() });
        setModalAnomalie(null);
        setCommentaire("");
      },
    },
  });

  const handleTraiter = () => {
    if (!modalAnomalie) return;
    traiterMutation.mutate({ id: modalAnomalie.id, data: { statut: traitementStatut, commentaire: commentaire || undefined } });
  };

  const INPUT_CLS = "border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";

  return (
    <div className="space-y-4">
      {/* Filtres */}
      <div className="flex flex-wrap gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <select value={filtreGravite} onChange={(e) => setFiltreGravite(e.target.value)} className={INPUT_CLS}>
          <option value="">Toutes les gravités</option>
          <option value="critique">🔴 Critique</option>
          <option value="attention">🟡 Attention</option>
          <option value="info">🔵 Info</option>
        </select>
        <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value)} className={INPUT_CLS}>
          <option value="">Tous les statuts</option>
          <option value="nouvelle">Nouvelle</option>
          <option value="en_cours">En cours</option>
          <option value="resolue">Résolue</option>
          <option value="ignoree">Ignorée</option>
          <option value="faux_positif">Faux positif</option>
        </select>
        <select value={filtreModule} onChange={(e) => setFiltreModule(e.target.value)} className={INPUT_CLS}>
          <option value="">Tous les modules</option>
          {Object.entries(MODULE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <span className="text-sm text-gray-400 self-center ml-auto">{data?.total ?? 0} anomalies</span>
      </div>

      {/* Tableau */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {anomalies.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>Aucune anomalie détectée</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {anomalies.map((a) => {
              const g = GRAVITE_STYLES[a.niveau_gravite] ?? GRAVITE_STYLES.info!;
              const isExpanded = expandedId === a.id;
              return (
                <div key={a.id} className="px-4 py-3">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  >
                    {/* Badge gravité */}
                    <span className={`mt-0.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 ${g.bg} ${g.text}`}>
                      <g.Icon size={11} />
                      {g.label}
                    </span>

                    {/* Contenu */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 font-medium leading-snug">{a.description}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-400">
                        <span>{MODULE_LABELS[a.module_source] ?? a.module_source}</span>
                        {a.membre_id && <span>Membre #{a.membre_id}</span>}
                        {a.agent_id && <span>Agent #{a.agent_id}</span>}
                        <span>{formaterDate(a.created_at)}</span>
                      </div>
                    </div>

                    {/* Statut + toggle */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        a.statut === "resolue"      ? "bg-green-100 text-green-700" :
                        a.statut === "ignoree"      ? "bg-gray-100 text-gray-500" :
                        a.statut === "faux_positif" ? "bg-purple-100 text-purple-600" :
                        a.statut === "en_cours"     ? "bg-blue-100 text-blue-600" :
                                                      "bg-red-100 text-red-600"
                      }`}>
                        {STATUT_LABELS[a.statut] ?? a.statut}
                      </span>
                      {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                    </div>
                  </div>

                  {/* Détails expandés */}
                  {isExpanded && (
                    <div className={`mt-3 ml-0 p-4 rounded-lg border ${g.border} ${g.bg} space-y-3`}>
                      {a.valeur_detectee != null && (
                        <div className="text-sm">
                          <span className="text-gray-500">Valeur détectée :</span>{" "}
                          <span className="font-semibold">{a.valeur_detectee}</span>
                          {a.seuil_configure != null && (
                            <span className="text-gray-400"> · seuil : {a.seuil_configure}</span>
                          )}
                        </div>
                      )}
                      {a.entite_type && a.entite_id && (
                        <div className="text-sm">
                          <span className="text-gray-500">Opération source :</span>{" "}
                          <span className="font-medium">{a.entite_type} #{a.entite_id}</span>
                        </div>
                      )}
                      {a.commentaire_traitement && (
                        <div className="text-sm">
                          <span className="text-gray-500">Commentaire :</span>{" "}
                          <span>{a.commentaire_traitement}</span>
                        </div>
                      )}
                      {peutTraiter && !["resolue", "ignoree", "faux_positif"].includes(a.statut) && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => { setModalAnomalie(a); setTraitementStatut("resolue"); }}
                            className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700"
                          >
                            ✅ Résoudre
                          </button>
                          <button
                            onClick={() => { setModalAnomalie(a); setTraitementStatut("ignoree"); }}
                            className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200"
                          >
                            Ignorer
                          </button>
                          <button
                            onClick={() => { setModalAnomalie(a); setTraitementStatut("faux_positif"); }}
                            className="px-3 py-1.5 bg-purple-100 text-purple-600 text-xs font-medium rounded-lg hover:bg-purple-200"
                          >
                            Faux positif
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal traitement */}
      {modalAnomalie && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Traiter l'anomalie</h3>
              <p className="text-sm text-gray-500 mt-1 line-clamp-2">{modalAnomalie.description}</p>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Action *</label>
                <select
                  value={traitementStatut}
                  onChange={(e) => setTraitementStatut(e.target.value as "resolue" | "ignoree" | "faux_positif")}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
                >
                  <option value="resolue">✅ Résolue</option>
                  <option value="ignoree">Ignorée</option>
                  <option value="faux_positif">Faux positif</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Commentaire</label>
                <textarea
                  rows={3}
                  value={commentaire}
                  onChange={(e) => setCommentaire(e.target.value)}
                  placeholder="Expliquer la résolution…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setModalAnomalie(null)}
                className="flex-1 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleTraiter}
                disabled={traiterMutation.isPending}
                className="flex-1 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
                style={{ backgroundColor: "#1a4731" }}
              >
                {traiterMutation.isPending ? "Enregistrement…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab 3 : Configuration ────────────────────────────────────────────────────
function TabConfig({ peutConfigurer }: { peutConfigurer: boolean }) {
  const qc = useQueryClient();
  const { data: cfg } = useGetAnomaliesConfig({ query: { queryKey: getGetAnomaliesConfigQueryKey() } });
  const [form, setForm] = useState<Partial<ConfigAnomalies> | null>(null);
  const mutation = usePutAnomaliesConfig({
    mutation: { onSuccess: () => { void qc.invalidateQueries({ queryKey: getGetAnomaliesConfigQueryKey() }); } },
  });

  const current = form ?? cfg ?? {};

  const numVal = (key: keyof ConfigAnomalies) => {
    const v = (current as Record<string, unknown>)[key];
    return v != null ? String(v) : "";
  };
  const boolVal = (key: keyof ConfigAnomalies) => {
    const v = (current as Record<string, unknown>)[key];
    return v === true || v === "true";
  };

  const setNum = (key: string, val: string) => {
    setForm((f) => ({ ...(f ?? cfg ?? {}), [key]: val }));
  };
  const setBool = (key: string, val: boolean) => {
    setForm((f) => ({ ...(f ?? cfg ?? {}), [key]: val }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    mutation.mutate({
      data: {
        poidsMaxLivraisonKg:      form.poids_max_livraison_kg      ? parseFloat(String(form.poids_max_livraison_kg))      : undefined,
        poidsMoyenMultiplicateur: form.poids_moyen_multiplicateur  ? parseFloat(String(form.poids_moyen_multiplicateur))  : undefined,
        delaiMinEntreLivraisonsH: form.delai_min_entre_livraisons_h ? parseInt(String(form.delai_min_entre_livraisons_h)) : undefined,
        avanceMaxFcfa:            form.avance_max_fcfa              ? parseFloat(String(form.avance_max_fcfa))             : undefined,
        avanceSiRetardExistant:   form.avance_si_retard_existant   ?? undefined,
        sortieMaxPctStock:        form.sortie_max_pct_stock         ? parseFloat(String(form.sortie_max_pct_stock))        : undefined,
        paiementSansLivraison:    form.paiement_sans_livraison     ?? undefined,
        doublonPaiementDelaiH:    form.doublon_paiement_delai_h    ? parseInt(String(form.doublon_paiement_delai_h))       : undefined,
        ecritureMontantMaxFcfa:   form.ecriture_montant_max_fcfa   ? parseFloat(String(form.ecriture_montant_max_fcfa))   : undefined,
        ecartReconciliationPct:   form.ecart_reconciliation_pct    ? parseFloat(String(form.ecart_reconciliation_pct))    : undefined,
      },
    });
  };

  const INPUT_CLS = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <h3 className="font-semibold text-gray-800 text-sm border-b border-gray-100 pb-2">{title}</h3>
      {children}
    </div>
  );

  const Field = ({ label, field, unit, min, max, step }: { label: string; field: keyof ConfigAnomalies; unit?: string; min?: number; max?: number; step?: number }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}{unit ? ` (${unit})` : ""}</label>
      <input
        type="number"
        disabled={!peutConfigurer}
        className={INPUT_CLS + (peutConfigurer ? "" : " opacity-60 cursor-not-allowed")}
        value={numVal(field)}
        min={min}
        max={max}
        step={step ?? 1}
        onChange={(e) => setNum(String(field), e.target.value)}
      />
    </div>
  );

  const Toggle = ({ label, field }: { label: string; field: keyof ConfigAnomalies }) => (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        disabled={!peutConfigurer}
        onClick={() => setBool(String(field), !boolVal(field))}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${boolVal(field) ? "bg-green-600" : "bg-gray-200"} ${!peutConfigurer ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow ${boolVal(field) ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">
      <Section title="🚚 Livraisons">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Poids maximum par livraison" field="poids_max_livraison_kg" unit="kg" min={0} />
          <Field label="Multiplicateur moyenne membre" field="poids_moyen_multiplicateur" unit="x" min={1} step={0.5} />
          <Field label="Délai minimum entre livraisons" field="delai_min_entre_livraisons_h" unit="h" min={0} />
        </div>
      </Section>

      <Section title="💰 Avances">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Montant maximum par avance" field="avance_max_fcfa" unit="FCFA" min={0} />
        </div>
        <Toggle label="Bloquer si avance en retard existante" field="avance_si_retard_existant" />
      </Section>

      <Section title="📦 Stocks">
        <div className="grid grid-cols-2 gap-4">
          <Field label="% maximum par sortie unique" field="sortie_max_pct_stock" unit="%" min={0} max={100} />
        </div>
      </Section>

      <Section title="💳 Paiements">
        <Toggle label="Bloquer paiement sans livraison associée" field="paiement_sans_livraison" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fenêtre détection doublon" field="doublon_paiement_delai_h" unit="h" min={0} />
        </div>
      </Section>

      <Section title="📒 Comptabilité">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Montant écriture alerte" field="ecriture_montant_max_fcfa" unit="FCFA" min={0} />
          <Field label="Tolérance écart réconciliation" field="ecart_reconciliation_pct" unit="%" min={0} max={100} step={0.1} />
        </div>
      </Section>

      {peutConfigurer && (
        <button
          type="submit"
          disabled={mutation.isPending || !form}
          className="px-6 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
          style={{ backgroundColor: "#1a4731" }}
        >
          {mutation.isPending ? "Enregistrement…" : "Enregistrer la configuration"}
        </button>
      )}
    </form>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function AnomaliesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Tableau de bord");
  const peutTraiter    = usePermission("anomalies", "traiter");
  const peutConfigurer = usePermission("anomalies", "configurer");

  return (
    <div className="space-y-5">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <ShieldAlert className="w-6 h-6 text-red-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anomalies</h1>
          <p className="text-gray-500 text-sm mt-0.5">Détection et traitement des opérations suspectes</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-100 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab
                  ? "border-b-2 border-red-600 text-red-700"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="p-5">
          {activeTab === "Tableau de bord"     && <TabDashboard />}
          {activeTab === "Liste des anomalies" && <TabListe peutTraiter={peutTraiter} />}
          {activeTab === "Configuration"       && <TabConfig peutConfigurer={peutConfigurer} />}
        </div>
      </div>
    </div>
  );
}

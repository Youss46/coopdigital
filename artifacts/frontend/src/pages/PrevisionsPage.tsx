import { useState } from "react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import {
  useListPrevisionsCampagnes,
  useGetProjectionCampagne,
  usePostHypotheses,
  useGetProjectionTresorerie,
  usePostSimuler,
  useListSimulations,
  useGetAlertesPrevisions,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

// ─── helpers ─────────────────────────────────────────────────────────────────
function fcfa(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M FCFA`;
  return `${n.toLocaleString("fr-FR")} FCFA`;
}
function kg(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(3)} T`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} T`;
  return `${n.toLocaleString("fr-FR")} kg`;
}
function ecartBadge(pct: number | null | undefined) {
  if (pct == null) return null;
  const color = pct < -10 ? "text-red-600 bg-red-50" : pct < -2 ? "text-amber-600 bg-amber-50" : "text-green-600 bg-green-50";
  const sign = pct >= 0 ? "+" : "";
  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>{sign}{pct.toFixed(1)}%</span>;
}
const NIVEAU_COLOR: Record<string, string> = {
  rouge: "bg-red-100 border-red-300 text-red-800",
  orange: "bg-amber-100 border-amber-300 text-amber-800",
  vert: "bg-green-100 border-green-300 text-green-800",
  bleu: "bg-blue-100 border-blue-300 text-blue-800",
};
const NIVEAU_DOT: Record<string, string> = {
  rouge: "🔴", orange: "🟡", vert: "🟢", bleu: "🔵",
};

const SCENARIOS = {
  optimiste: { prix_achat: 1000, prix_vente: 1500, tonnage: 600_000, nb_membres: 480 },
  realiste: { prix_achat: 1100, prix_vente: 1400, tonnage: 480_000, nb_membres: 420 },
  pessimiste: { prix_achat: 1200, prix_vente: 1300, tonnage: 360_000, nb_membres: 360 },
};

const TABS = ["Projection campagne", "Projection trésorerie", "Simulateur", "Alertes prévisionnelles"] as const;
type Tab = typeof TABS[number];

// ─── composant principal ─────────────────────────────────────────────────────
export default function PrevisionsPage() {
  const [tab, setTab] = useState<Tab>("Projection campagne");

  // campagnes
  const { data: campagnes } = useListPrevisionsCampagnes();
  const premiereCampagne = campagnes?.[0];
  const [campagneId, setCampagneId] = useState<number | null>(null);
  const activeCampagneId = campagneId ?? premiereCampagne?.id ?? null;

  // alertes (pour badge)
  const { data: alertesData } = useGetAlertesPrevisions();
  const nbAlertes = alertesData?.alertes?.filter((a) => a.niveau === "rouge" || a.niveau === "orange").length ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prévisions & Simulations</h1>
          <p className="text-sm text-gray-500 mt-1">Projections de fin de campagne, trésorerie et simulateur de scénarios</p>
        </div>
        {activeCampagneId && campagnes && (
          <select
            value={activeCampagneId}
            onChange={(e) => setCampagneId(Number(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm bg-white shadow-sm"
          >
            {campagnes.map((c) => (
              <option key={c.id} value={c.id}>{c.libelle}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b flex gap-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors relative ${
              tab === t ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
            {t === "Alertes prévisionnelles" && nbAlertes > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{nbAlertes}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "Projection campagne" && activeCampagneId && (
        <ProjectionCampagneTab campagneId={activeCampagneId} />
      )}
      {tab === "Projection trésorerie" && <TresorerieTab />}
      {tab === "Simulateur" && <SimulateurTab campagneId={activeCampagneId} />}
      {tab === "Alertes prévisionnelles" && <AlertesTab data={alertesData as AlertesData | undefined} />}

      {!activeCampagneId && tab === "Projection campagne" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 text-center text-amber-700">
          Aucune campagne disponible. Créez une campagne pour accéder aux projections.
        </div>
      )}
    </div>
  );
}

// ─── Onglet 1 : Projection campagne ─────────────────────────────────────────
function ProjectionCampagneTab({ campagneId }: { campagneId: number }) {
  const { data, isLoading, refetch } = useGetProjectionCampagne(campagneId);
  const hypoMut = usePostHypotheses();
  const [showHypo, setShowHypo] = useState(false);
  const [hypoForm, setHypoForm] = useState({
    tonnage_prevu_kg: "",
    prix_achat_prevu_fcfa: "",
    prix_vente_prevu_fcfa: "",
    nb_membres_prevus: "",
    nb_semaines_campagne: "20",
  });

  if (isLoading) return <div className="text-center py-12 text-gray-400">Calcul en cours…</div>;
  if (!data) return null;

  const { campagne, projection, historique_hebdo, interpretation } = data;
  const p = projection;

  function saveHypo() {
    hypoMut.mutate(
      {
        id: campagneId,
        data: {
          tonnage_prevu_kg: hypoForm.tonnage_prevu_kg ? Number(hypoForm.tonnage_prevu_kg) : undefined,
          prix_achat_prevu_fcfa: hypoForm.prix_achat_prevu_fcfa ? Number(hypoForm.prix_achat_prevu_fcfa) : undefined,
          prix_vente_prevu_fcfa: hypoForm.prix_vente_prevu_fcfa ? Number(hypoForm.prix_vente_prevu_fcfa) : undefined,
          nb_membres_prevus: hypoForm.nb_membres_prevus ? Number(hypoForm.nb_membres_prevus) : undefined,
          nb_semaines_campagne: Number(hypoForm.nb_semaines_campagne),
        },
      },
      { onSuccess: () => { setShowHypo(false); refetch(); } }
    );
  }

  return (
    <div className="space-y-6">
      {/* Bandeau */}
      <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-3 flex items-center justify-between">
        <div className="text-sm text-green-800 font-medium">
          Projection au {format(new Date(), "d MMMM yyyy", { locale: fr })} — Semaine{" "}
          <span className="font-bold">{Math.round(p?.semaines_ecoulees ?? 0)}</span>/{p?.semaines_totales ?? "—"}
        </div>
        <button onClick={() => setShowHypo(!showHypo)} className="text-sm text-green-700 underline">
          {showHypo ? "Annuler" : "Modifier les hypothèses"}
        </button>
      </div>

      {/* Formulaire hypothèses */}
      {showHypo && (
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Hypothèses de la campagne</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { key: "tonnage_prevu_kg", label: "Tonnage prévu (kg)", placeholder: "ex: 500000" },
              { key: "prix_achat_prevu_fcfa", label: "Prix achat prévu (FCFA/kg)", placeholder: "ex: 1100" },
              { key: "prix_vente_prevu_fcfa", label: "Prix vente prévu (FCFA/kg)", placeholder: "ex: 1450" },
              { key: "nb_membres_prevus", label: "Nb membres prévus", placeholder: "ex: 450" },
              { key: "nb_semaines_campagne", label: "Nb semaines campagne", placeholder: "ex: 20" },
            ].map(({ key, label, placeholder }) => (
              <label key={key} className="block">
                <span className="text-xs text-gray-600 block mb-1">{label}</span>
                <input
                  type="number"
                  placeholder={placeholder}
                  value={hypoForm[key as keyof typeof hypoForm]}
                  onChange={(e) => setHypoForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="border rounded-lg px-3 py-2 text-sm w-full"
                />
              </label>
            ))}
          </div>
          <button
            onClick={saveHypo}
            disabled={hypoMut.isPending}
            className="mt-4 bg-green-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {hypoMut.isPending ? "Enregistrement…" : "Enregistrer et recalculer"}
          </button>
        </div>
      )}

      {/* Tableau PRÉVU vs PROJETÉ */}
      <div className="grid grid-cols-2 gap-4">
        {[
          {
            label: "PRÉVU",
            cols: [
              { l: "Tonnage", v: p?.tonnage_prevu_kg ? kg(p.tonnage_prevu_kg) : "—" },
              { l: "CA", v: p?.ca_prevu_fcfa ? fcfa(p.ca_prevu_fcfa) : "—" },
              { l: "Marge", v: "—" },
            ],
            cls: "bg-blue-50 border-blue-200",
          },
          {
            label: "PROJETÉ (tendance actuelle)",
            cols: [
              { l: "Tonnage", v: kg(p?.tonnage_projete_kg), ecart: p?.ecart_tonnage_pct },
              { l: "CA", v: fcfa(p?.ca_projete_fcfa), ecart: p?.ecart_ca_pct },
              { l: "Marge", v: fcfa(p?.marge_projetee_fcfa) },
            ],
            cls: "bg-gray-50 border-gray-200",
          },
        ].map(({ label, cols, cls }) => (
          <div key={label} className={`rounded-xl border p-5 ${cls}`}>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{label}</p>
            <div className="space-y-2">
              {cols.map(({ l, v, ecart }) => (
                <div key={l} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{l}</span>
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    {v} {ecart !== undefined && ecartBadge(ecart)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Graphique */}
      {historique_hebdo && historique_hebdo.length > 0 && (
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-4">Évolution hebdomadaire (tonnes cumulées)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={historique_hebdo} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="semaine" label={{ value: "Semaine", position: "insideBottom", offset: -2 }} tickFormatter={(v) => `S${v}`} />
              <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}T`} />
              <Tooltip
                formatter={(v: number, name: string) => [kg(v), name]}
                labelFormatter={(l) => `Semaine ${l}`}
              />
              <Legend verticalAlign="top" />
              <ReferenceLine
                y={historique_hebdo[historique_hebdo.length - 1]?.objectif}
                stroke="#ef4444"
                strokeDasharray="6 3"
                label={{ value: "Objectif", position: "right", fontSize: 11, fill: "#ef4444" }}
              />
              <Line
                type="monotone"
                dataKey="tonnage_reel"
                name="Réel"
                stroke="#2563eb"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="tonnage_projete"
                name="Projeté"
                stroke="#16a34a"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="objectif"
                name="Objectif"
                stroke="#ef4444"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Interprétation */}
      {interpretation && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">📊 Analyse CoopDigital</p>
          <p className="text-sm text-gray-700 leading-relaxed">{interpretation}</p>
          {p && (
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500">
              <span>Rythme actuel : <strong className="text-gray-700">{p.rythme_hebdo_kg?.toLocaleString("fr-FR")} kg/semaine</strong></span>
              <span>Semaines restantes : <strong className="text-gray-700">{Math.round(p.semaines_restantes ?? 0)}</strong></span>
            </div>
          )}
        </div>
      )}

      {!interpretation && p?.semaines_ecoulees === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
          Aucune livraison enregistrée pour cette campagne. Le calcul de projection sera disponible dès la première livraison.
        </div>
      )}
    </div>
  );
}

// ─── Onglet 2 : Projection trésorerie ────────────────────────────────────────
function TresorerieTab() {
  const [jours, setJours] = useState(90);
  const { data, isLoading } = useGetProjectionTresorerie({ jours });

  return (
    <div className="space-y-6">
      {/* Sélecteur horizon */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600 font-medium">Horizon :</span>
        {[30, 60, 90].map((j) => (
          <button
            key={j}
            onClick={() => setJours(j)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              jours === j ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {j} jours
          </button>
        ))}
      </div>

      {/* Alerte trésorerie */}
      {data?.risque_rupture && (
        <div className="bg-red-50 border border-red-300 rounded-lg px-5 py-3 flex items-center gap-3">
          <span className="text-xl">🔴</span>
          <span className="text-sm font-medium text-red-800">
            Risque de rupture de trésorerie dans{" "}
            <strong>{data.jours_avant_rupture ?? "?"} jours</strong>
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Calcul en cours…</div>
      ) : data ? (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Trésorerie actuelle</p>
              <p className={`text-xl font-bold ${(data.tresorerie_actuelle ?? 0) >= 0 ? "text-green-700" : "text-red-700"}`}>
                {fcfa(data.tresorerie_actuelle)}
              </p>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Avances en cours</p>
              <p className="text-xl font-bold text-amber-700">{fcfa(data.avances_en_cours_fcfa)}</p>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
              <p className="text-xs text-gray-500 mb-1">Horizon</p>
              <p className="text-xl font-bold text-gray-800">{data.horizon}</p>
            </div>
          </div>

          {/* Graphique aire */}
          <div className="bg-white border rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-4">Évolution de la trésorerie projetée</h3>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.semaines} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="encaissGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="decaissGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="semaine" tickFormatter={(v) => `S${v}`} />
                <YAxis tickFormatter={(v) => fcfa(v)} width={90} />
                <Tooltip
                  formatter={(v: number, name: string) => [fcfa(v), name]}
                  labelFormatter={(l) => `Semaine ${l}`}
                />
                <Legend verticalAlign="top" />
                <Area type="monotone" dataKey="encaissements" name="Encaissements" stroke="#16a34a" fill="url(#encaissGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="decaissements" name="Décaissements" stroke="#ef4444" fill="url(#decaissGrad)" strokeWidth={2} />
                <Line type="monotone" dataKey="solde_cumul" name="Trésorerie nette" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 2" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Tableau semaines */}
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {["Période", "Encaissements", "Décaissements", "Solde net", "Solde cumulé"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(data.semaines ?? []).map((s: { semaine: number; date_debut: string; encaissements: number; decaissements: number; solde_net: number; solde_cumul: number }) => (
                  <tr key={s.semaine} className={s.solde_cumul < 0 ? "bg-red-50" : "hover:bg-gray-50"}>
                    <td className="px-4 py-3 text-gray-700">S{s.semaine} — {s.date_debut}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{fcfa(s.encaissements)}</td>
                    <td className="px-4 py-3 text-red-700 font-medium">{fcfa(s.decaissements)}</td>
                    <td className={`px-4 py-3 font-medium ${s.solde_net >= 0 ? "text-green-700" : "text-red-700"}`}>{fcfa(s.solde_net)}</td>
                    <td className={`px-4 py-3 font-bold ${s.solde_cumul >= 0 ? "text-gray-900" : "text-red-700"}`}>{fcfa(s.solde_cumul)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Onglet 3 : Simulateur ────────────────────────────────────────────────────
function SimulateurTab({ campagneId }: { campagneId: number | null }) {
  const [scenario, setScenario] = useState<"optimiste" | "realiste" | "pessimiste" | "personnalise">("realiste");
  const [params, setParams] = useState(SCENARIOS.realiste);
  const [nomSim, setNomSim] = useState("");
  const simulMut = usePostSimuler();
  const { data: simulations, refetch: refetchSims } = useListSimulations();

  const resultLocal = {
    ca_fcfa: Math.round(params.tonnage * params.prix_vente),
    cout_fcfa: Math.round(params.tonnage * params.prix_achat),
    marge_fcfa: Math.round(params.tonnage * (params.prix_vente - params.prix_achat)),
    marge_kg: params.prix_vente - params.prix_achat,
  };

  function choisirScenario(s: "optimiste" | "realiste" | "pessimiste") {
    setScenario(s);
    setParams(SCENARIOS[s]);
  }

  function sauvegarder() {
    simulMut.mutate(
      {
        data: {
          campagne_id: campagneId ?? undefined,
          nom_simulation: nomSim || `Simulation ${new Date().toLocaleDateString("fr-FR")}`,
          type: scenario === "personnalise" ? "mix" : "mix",
          parametres: params,
        },
      },
      { onSuccess: () => { setNomSim(""); refetchSims(); } }
    );
  }

  return (
    <div className="space-y-6">
      {/* Sélecteur scénario */}
      <div className="flex gap-3">
        {(["optimiste", "realiste", "pessimiste", "personnalise"] as const).map((s) => (
          <button
            key={s}
            onClick={() => s !== "personnalise" ? choisirScenario(s as "optimiste" | "realiste" | "pessimiste") : setScenario("personnalise")}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              scenario === s ? "bg-green-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Formulaire */}
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-5">
          <h3 className="font-semibold text-gray-800">Paramètres de simulation</h3>
          {(
            [
              { key: "prix_achat" as const, label: "Prix d'achat (FCFA/kg)", min: 700, max: 1500, step: 10 },
              { key: "prix_vente" as const, label: "Prix de vente (FCFA/kg)", min: 900, max: 2000, step: 10 },
              { key: "tonnage" as const, label: "Tonnage total (kg)", min: 100_000, max: 1_000_000, step: 10_000 },
              { key: "nb_membres" as const, label: "Nb membres actifs", min: 100, max: 1000, step: 10 },
            ]
          ).map(({ key, label, min, max, step }) => (
            <label key={key} className="block">
              <div className="flex justify-between mb-1">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="text-sm font-bold text-gray-900">
                  {key === "tonnage" ? kg(params[key]) : `${params[key as keyof typeof params]?.toLocaleString("fr-FR")} FCFA/kg`}
                </span>
              </div>
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={params[key as keyof typeof params] ?? 0}
                onChange={(e) => { setScenario("personnalise"); setParams((p) => ({ ...p, [key]: Number(e.target.value) })); }}
                className="w-full accent-green-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>{key === "tonnage" ? kg(min) : `${min.toLocaleString("fr-FR")}`}</span>
                <span>{key === "tonnage" ? kg(max) : `${max.toLocaleString("fr-FR")}`}</span>
              </div>
            </label>
          ))}
        </div>

        {/* Résultats */}
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-5 shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-4">Résultats en temps réel</h3>
            <div className="space-y-3">
              {[
                { label: "CA simulé", value: fcfa(resultLocal.ca_fcfa), color: "text-gray-900" },
                { label: "Coût achat simulé", value: fcfa(resultLocal.cout_fcfa), color: "text-red-700" },
                { label: "Marge simulée", value: fcfa(resultLocal.marge_fcfa), color: "text-green-700" },
                { label: "Marge/kg simulée", value: `${resultLocal.marge_kg.toLocaleString("fr-FR")} FCFA/kg`, color: "text-green-700" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-green-100 last:border-0">
                  <span className="text-sm text-gray-600">{label}</span>
                  <span className={`font-bold text-lg ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sauvegarder */}
          <div className="bg-white border rounded-xl p-4 shadow-sm">
            <input
              type="text"
              placeholder="Nom de la simulation (optionnel)"
              value={nomSim}
              onChange={(e) => setNomSim(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-full mb-3"
            />
            <button
              onClick={sauvegarder}
              disabled={simulMut.isPending}
              className="w-full bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {simulMut.isPending ? "Enregistrement…" : "Sauvegarder cette simulation"}
            </button>
          </div>
        </div>
      </div>

      {/* Historique simulations */}
      {simulations && simulations.length > 0 && (
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-800">Historique des simulations ({simulations.length})</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                {["Nom", "Type", "Tonnage", "CA", "Marge", "Date"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {simulations.map((s) => {
                const res = s.resultats as Record<string, number>;
                const par = s.parametres as Record<string, number>;
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-800">{s.nom_simulation}</td>
                    <td className="px-4 py-3">
                      <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-xs">{s.type}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{par?.tonnage ? kg(par.tonnage) : "—"}</td>
                    <td className="px-4 py-3 text-gray-700">{res?.ca_fcfa ? fcfa(res.ca_fcfa) : "—"}</td>
                    <td className="px-4 py-3 text-green-700 font-medium">{res?.marge_fcfa ? fcfa(res.marge_fcfa) : "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.created_at ? new Date(s.created_at as string).toLocaleDateString("fr-FR") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Onglet 4 : Alertes prévisionnelles ──────────────────────────────────────
type AlertesData = { alertes: Array<{ type?: string; niveau?: string; message?: string; valeur?: number | null }>; campagne_active_id?: number | null };
function AlertesTab({ data }: { data: AlertesData | undefined }) {
  if (!data) return <div className="text-center py-12 text-gray-400">Chargement…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(data.alertes ?? []).map((alerte, i) => (
          <div
            key={i}
            className={`border rounded-xl px-5 py-4 flex items-start gap-3 ${NIVEAU_COLOR[alerte.niveau ?? "bleu"]}`}
          >
            <span className="text-xl mt-0.5">{NIVEAU_DOT[alerte.niveau ?? "bleu"]}</span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-0.5">
                {alerte.type}
              </p>
              <p className="text-sm font-medium">{alerte.message}</p>
              {alerte.valeur !== undefined && alerte.valeur !== null && (
                <p className="text-xs opacity-70 mt-0.5">Valeur : {alerte.valeur}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {data.campagne_active_id && (
        <div className="text-xs text-gray-400 text-center mt-4">
          Basé sur la campagne active #{data.campagne_active_id}
        </div>
      )}
    </div>
  );
}

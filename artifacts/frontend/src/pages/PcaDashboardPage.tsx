import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, RadialBarChart, RadialBar, Legend,
} from "recharts";
import {
  AlertTriangle, TrendingUp, Users, Wallet, Package, DollarSign,
  FileText, BarChart3, Star, ExternalLink, Loader2, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Synthese {
  campagne_active: {
    id: number; nom: string; date_ouverture: string;
    date_fermeture: string | null; jours_ecoules: number;
    jours_restants: number | null; avancement_pct: number;
  } | null;
  production: {
    tonnage_jour: number; tonnage_semaine: number;
    tonnage_campagne: number; objectif_campagne: number; pct_objectif: number;
    historique_30j: { date: string; tonnage: number }[];
    ca_mensuel: { mois: string; ca_fcfa: number }[];
  };
  financier: {
    ca_campagne_fcfa: number; marge_nette_fcfa: number;
    marge_pct: number; marge_kg_fcfa: number;
    tresorerie_disponible_fcfa: number;
    creances_exportateurs_fcfa: number; creances_en_retard: number;
    avances_en_cours_fcfa: number; emprunts_solde_fcfa: number;
  };
  budget: {
    prevu_fcfa: number; realise_fcfa: number;
    ecart_fcfa: number; ecart_pct: number;
    lignes_en_depassement: { libelle: string; prevu_fcfa: number; realise_fcfa: number; ecart_pct: number }[];
  };
  alertes_critiques: { type: string; message: string; date: string; montant_fcfa?: number; lien?: string }[];
  membres: {
    nb_actifs: number; nb_nouveaux_campagne: number;
    taux_remboursement_avances_pct: number; taux_remboursement_intrants_pct: number;
  };
  personnel: { nb_employes: number; masse_salariale_mois_fcfa: number; bulletins_en_attente: number };
}

interface ComparaisonRow {
  campagne_id: number; campagne_libelle: string; statut: string;
  tonnage_t: number; ca_fcfa: number; marge_nette_fcfa: number;
  marge_kg_fcfa: number; nb_membres_actifs: number;
  taux_remboursement_avances_pct: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TOKEN_KEY = "coop_token";
const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;

async function apiFetch<T>(path: string): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token ?? ""}` },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

const fmt = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)} k`
    : String(n);

const fmtFull = (n: number) => n.toLocaleString("fr-FR");
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
const fmtMois = (s: string) => {
  const [y, m] = s.split("-");
  return new Date(Number(y), Number(m) - 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
};

function KpiCard({
  icon, label, value, unit, sub, subColor = "text-gray-500", badge,
}: {
  icon: React.ReactNode; label: string; value: string; unit?: string;
  sub?: string; subColor?: string; badge?: { text: string; color: string };
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
          {icon}
        </div>
        {badge && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badge.color}`}>
            {badge.text}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black text-gray-900">{value}</span>
        {unit && <span className="text-sm text-gray-400">{unit}</span>}
      </div>
      {sub && <p className={`text-xs mt-1 font-medium ${subColor}`}>{sub}</p>}
    </div>
  );
}

function AlerteBadge({ type }: { type: string }) {
  const cfg: Record<string, string> = {
    creance_retard: "bg-red-100 text-red-700",
    emprunt_echeance: "bg-orange-100 text-orange-700",
    avances_retard: "bg-yellow-100 text-yellow-700",
    budget_depasse: "bg-purple-100 text-purple-700",
  };
  const labels: Record<string, string> = {
    creance_retard: "Créance",
    emprunt_echeance: "Emprunt",
    avances_retard: "Avances",
    budget_depasse: "Budget",
  };
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cfg[type] ?? "bg-gray-100 text-gray-600"}`}>
      {labels[type] ?? type}
    </span>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function PcaDashboardPage() {
  const { utilisateur } = useAuth();
  const [, setLoc] = useLocation();
  const [synthese, setSynthese] = useState<Synthese | null>(null);
  const [comparaison, setComparaison] = useState<ComparaisonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState("");
  const [lastRefresh, setLastRefresh] = useState(new Date());

  if (utilisateur?.role !== "pca") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-400">
        <AlertTriangle className="w-12 h-12 mb-3 text-yellow-400" />
        <p className="text-lg font-semibold">Accès réservé au PCA</p>
      </div>
    );
  }

  const charger = async () => {
    setLoading(true);
    setErreur("");
    try {
      const [s, c] = await Promise.all([
        apiFetch<Synthese>("/dashboard/pca/synthese"),
        apiFetch<ComparaisonRow[]>("/dashboard/pca/comparaison-campagnes"),
      ]);
      setSynthese(s);
      setComparaison(c);
      setLastRefresh(new Date());
    } catch {
      setErreur("Impossible de charger les données. Vérifiez votre connexion.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void charger(); }, []);

  if (loading && !synthese) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-10 h-10 animate-spin text-green-700" />
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <AlertTriangle className="w-12 h-12 text-red-400" />
        <p className="text-red-600 font-medium">{erreur}</p>
        <button onClick={charger} className="px-4 py-2 bg-green-700 text-white rounded-lg text-sm">
          Réessayer
        </button>
      </div>
    );
  }

  const s = synthese!;
  const camp = s.campagne_active;
  const alertesCritiques = s.alertes_critiques;

  // Gauges trésorerie
  const engagements = s.financier.avances_en_cours_fcfa + s.financier.emprunts_solde_fcfa;
  const tresoGauge = s.financier.tresorerie_disponible_fcfa > 0 || engagements > 0
    ? Math.min(100, s.financier.tresorerie_disponible_fcfa > 0
        ? Math.round((s.financier.tresorerie_disponible_fcfa / (s.financier.tresorerie_disponible_fcfa + engagements)) * 100)
        : 0)
    : 50;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Tableau de bord PCA</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Vue de synthèse haute direction — Lecture seule
            <span className="ml-3 text-xs text-gray-400">
              Actualisé à {lastRefresh.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </p>
        </div>
        <button
          onClick={charger}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {/* ── Section 1 : Bandeau campagne ─────────────────────────────────────── */}
      {camp ? (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1a4731" }}>
          <div className="px-6 py-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-green-300">Campagne active</span>
                  <span className="text-xs bg-green-500/30 text-green-200 px-2 py-0.5 rounded-full font-medium">
                    En cours
                  </span>
                </div>
                <h2 className="text-xl font-black text-white">{camp.nom}</h2>
                <p className="text-green-300 text-sm mt-1">
                  Ouverte le{" "}
                  {new Date(camp.date_ouverture).toLocaleDateString("fr-FR", {
                    day: "2-digit", month: "long", year: "numeric",
                  })}
                  {camp.date_fermeture && (
                    <> — Fermeture prévue le{" "}
                      {new Date(camp.date_fermeture).toLocaleDateString("fr-FR", {
                        day: "2-digit", month: "long", year: "numeric",
                      })}
                    </>
                  )}
                </p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-black text-white">{camp.avancement_pct}%</div>
                <div className="text-green-300 text-sm">
                  {camp.jours_restants !== null ? `${camp.jours_restants} jours restants` : `${camp.jours_ecoules} jours écoulés`}
                </div>
              </div>
            </div>
            <div className="w-full bg-green-900/60 rounded-full h-4 overflow-hidden">
              <div
                className="h-4 rounded-full transition-all duration-700"
                style={{
                  width: `${camp.avancement_pct}%`,
                  backgroundColor: "#c4962a",
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 p-6 text-center text-gray-400">
          Aucune campagne active en cours
        </div>
      )}

      {/* ── Section 2 : 6 KPI cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          icon={<Package className="w-5 h-5 text-green-700" />}
          label="Tonnage campagne"
          value={`${(s.production.tonnage_campagne / 1000).toFixed(1)}`}
          unit="T"
          sub={
            s.production.objectif_campagne > 0
              ? `${s.production.pct_objectif}% de l'objectif (${(s.production.objectif_campagne / 1000).toFixed(0)} T)`
              : `Aujourd'hui : ${s.production.tonnage_jour.toFixed(0)} kg`
          }
          subColor={s.production.pct_objectif >= 80 ? "text-green-600" : "text-amber-600"}
          badge={s.production.pct_objectif >= 100
            ? { text: "✅ Objectif atteint", color: "bg-green-100 text-green-700" }
            : undefined
          }
        />
        <KpiCard
          icon={<DollarSign className="w-5 h-5 text-green-700" />}
          label="CA ventes campagne"
          value={fmtFull(s.financier.ca_campagne_fcfa)}
          unit="FCFA"
          sub={`Marge : ${fmtFull(s.financier.marge_nette_fcfa)} FCFA (${s.financier.marge_pct}%)`}
          subColor="text-green-600"
        />
        <KpiCard
          icon={<TrendingUp className="w-5 h-5 text-green-700" />}
          label="Marge nette"
          value={fmtFull(s.financier.marge_nette_fcfa)}
          unit="FCFA"
          sub={`${s.financier.marge_kg_fcfa.toLocaleString("fr-FR")} FCFA/T`}
          subColor="text-green-600"
        />
        <KpiCard
          icon={<Wallet className="w-5 h-5 text-blue-600" />}
          label="Trésorerie disponible"
          value={fmtFull(Math.abs(s.financier.tresorerie_disponible_fcfa))}
          unit="FCFA"
          sub={s.financier.tresorerie_disponible_fcfa >= 0 ? "✅ Solde positif" : "⚠️ Solde négatif"}
          subColor={s.financier.tresorerie_disponible_fcfa >= 0 ? "text-green-600" : "text-red-600"}
        />
        <KpiCard
          icon={<FileText className="w-5 h-5 text-orange-500" />}
          label="Créances exportateurs"
          value={fmtFull(s.financier.creances_exportateurs_fcfa)}
          unit="FCFA"
          sub={s.financier.creances_en_retard > 0
            ? `⚠️ ${s.financier.creances_en_retard} en retard`
            : "✅ Aucune en retard"}
          subColor={s.financier.creances_en_retard > 0 ? "text-red-600" : "text-green-600"}
          badge={s.financier.creances_en_retard > 0
            ? { text: `${s.financier.creances_en_retard} retard${s.financier.creances_en_retard > 1 ? "s" : ""}`, color: "bg-red-100 text-red-700" }
            : undefined
          }
        />
        <KpiCard
          icon={<Users className="w-5 h-5 text-purple-600" />}
          label="Avances en cours"
          value={fmtFull(s.financier.avances_en_cours_fcfa)}
          unit="FCFA"
          sub={`${fmtFull(s.membres.nb_actifs)} membres actifs — ${s.membres.taux_remboursement_avances_pct}% remboursé`}
          subColor="text-gray-500"
        />
      </div>

      {/* ── Section 3 : Alertes critiques ────────────────────────────────────── */}
      {alertesCritiques.length > 0 && (
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm">
          <div className="flex items-center gap-3 px-6 py-4 border-b border-red-50">
            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <h2 className="font-bold text-gray-900 text-base">
              Alertes critiques
              <span className="ml-2 text-xs bg-red-100 text-red-700 font-bold px-2 py-0.5 rounded-full">
                {alertesCritiques.length}
              </span>
            </h2>
          </div>
          <div className="divide-y divide-gray-50">
            {alertesCritiques.map((a, i) => (
              <div key={i} className="flex items-start gap-3 px-6 py-4">
                <div className="w-2 h-2 rounded-full bg-red-500 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <AlerteBadge type={a.type} />
                    {a.montant_fcfa && a.montant_fcfa > 0 && (
                      <span className="text-sm font-bold text-gray-900">
                        {fmtFull(a.montant_fcfa)} FCFA
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700">{a.message}</p>
                </div>
                {a.lien && (
                  <button
                    onClick={() => setLoc(a.lien!)}
                    className="text-green-700 hover:text-green-900 flex-shrink-0"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Section 4 : Graphiques ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tonnage 30 jours */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-green-700" />
            Tonnage sur 30 jours
          </h3>
          {s.production.historique_30j.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={s.production.historique_30j} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} width={45} />
                <Tooltip
                  formatter={(v: number) => [`${v.toFixed(0)} kg`, "Tonnage"]}
                  labelFormatter={fmtDate}
                />
                <Line
                  type="monotone"
                  dataKey="tonnage"
                  stroke="#1a4731"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
              Aucune livraison sur 30 jours
            </div>
          )}
        </div>

        {/* CA mensuel */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-700" />
            CA mensuel (campagne en cours)
          </h3>
          {s.production.ca_mensuel.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={s.production.ca_mensuel} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="mois"
                  tickFormatter={fmtMois}
                  tick={{ fontSize: 10, fill: "#9ca3af" }}
                />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} width={55} tickFormatter={fmt} />
                <Tooltip
                  formatter={(v: number) => [`${fmtFull(v)} FCFA`, "CA"]}
                  labelFormatter={fmtMois}
                />
                <Bar dataKey="ca_fcfa" fill="#1a4731" radius={[4, 4, 0, 0]}>
                  {s.production.ca_mensuel.map((_, idx) => (
                    <Cell key={idx} fill={idx === s.production.ca_mensuel.length - 1 ? "#c4962a" : "#1a4731"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
              Aucune vente enregistrée
            </div>
          )}
        </div>
      </div>

      {/* Jauge trésorerie vs engagements */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h3 className="font-bold text-gray-900 mb-4">Trésorerie disponible vs engagements (avances + emprunts)</h3>
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="w-48 h-48 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%" cy="50%" innerRadius="55%" outerRadius="80%"
                startAngle={180} endAngle={-180}
                data={[
                  { name: "Trésorerie", value: tresoGauge, fill: "#1a4731" },
                  { name: "Engagements", value: 100 - tresoGauge, fill: "#f3f4f6" },
                ]}
              >
                <RadialBar dataKey="value" cornerRadius={4} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-800" />
                <span className="text-sm text-gray-600">Trésorerie disponible</span>
              </div>
              <span className="text-base font-bold text-green-800">
                {fmtFull(s.financier.tresorerie_disponible_fcfa)} FCFA
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-sm text-gray-600">Avances en cours</span>
              </div>
              <span className="text-base font-bold text-gray-700">
                {fmtFull(s.financier.avances_en_cours_fcfa)} FCFA
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-400" />
                <span className="text-sm text-gray-600">Emprunts (solde)</span>
              </div>
              <span className="text-base font-bold text-gray-700">
                {fmtFull(s.financier.emprunts_solde_fcfa)} FCFA
              </span>
            </div>
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Total engagements</span>
              <span className="text-base font-black text-gray-900">{fmtFull(engagements)} FCFA</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 5 : Comparaison campagnes ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-500" />
          <h2 className="font-bold text-gray-900">Comparaison des campagnes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-6 py-3 font-semibold text-gray-600">Indicateur</th>
                {comparaison.map(c => (
                  <th key={c.campagne_id} className={`text-right px-4 py-3 font-semibold ${c.statut === "ouverte" ? "text-green-700" : "text-gray-600"}`}>
                    {c.campagne_libelle}
                    {c.statut === "ouverte" && (
                      <span className="ml-1 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                        En cours
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                {
                  label: "Tonnage (T)",
                  key: (r: ComparaisonRow) => `${r.tonnage_t.toLocaleString("fr-FR")} T`,
                },
                {
                  label: "CA ventes (FCFA)",
                  key: (r: ComparaisonRow) => fmt(r.ca_fcfa),
                },
                {
                  label: "Marge nette (FCFA)",
                  key: (r: ComparaisonRow) => fmt(r.marge_nette_fcfa),
                },
                {
                  label: "Marge/T (FCFA)",
                  key: (r: ComparaisonRow) => `${r.marge_kg_fcfa.toLocaleString("fr-FR")} FCFA`,
                },
                {
                  label: "Membres actifs",
                  key: (r: ComparaisonRow) => r.nb_membres_actifs.toLocaleString("fr-FR"),
                },
                {
                  label: "Taux remboursement avances",
                  key: (r: ComparaisonRow) => `${r.taux_remboursement_avances_pct}%`,
                },
              ].map(({ label, key }) => (
                <tr key={label} className="hover:bg-gray-50/50">
                  <td className="px-6 py-3 font-medium text-gray-700">{label}</td>
                  {comparaison.map(c => (
                    <td
                      key={c.campagne_id}
                      className={`text-right px-4 py-3 font-mono ${c.statut === "ouverte" ? "font-bold text-green-800" : "text-gray-600"}`}
                    >
                      {key(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section 6 : Accès rapide ─────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="font-bold text-gray-900 mb-4">Accès rapide — Consultation</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: BarChart3, label: "États financiers", href: "/comptabilite" },
            { icon: Users, label: "Classement producteurs", href: "/scoring" },
            { icon: FileText, label: "Reporting bilan", href: "/reporting" },
            { icon: Star, label: "Journal d'audit", href: "/audit" },
          ].map(({ icon: Icon, label, href }) => (
            <button
              key={href}
              onClick={() => setLoc(href)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-gray-100
                hover:border-green-200 hover:bg-green-50 transition-colors group"
            >
              <div className="w-10 h-10 rounded-xl bg-gray-50 group-hover:bg-white flex items-center justify-center transition-colors">
                <Icon className="w-5 h-5 text-green-700" />
              </div>
              <span className="text-xs font-medium text-gray-600 text-center leading-tight">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Infos KPIs supplémentaires */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-xl font-black text-gray-900">{fmtFull(s.membres.nb_actifs)}</div>
          <div className="text-xs text-gray-500 mt-1">Membres actifs</div>
          <div className="text-xs text-green-600 font-medium">+{s.membres.nb_nouveaux_campagne} nouveaux</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-xl font-black text-gray-900">{s.membres.taux_remboursement_avances_pct}%</div>
          <div className="text-xs text-gray-500 mt-1">Taux remb. avances</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className="text-xl font-black text-gray-900">{s.personnel.nb_employes}</div>
          <div className="text-xs text-gray-500 mt-1">Employés actifs</div>
          <div className="text-xs text-gray-400">{fmt(s.personnel.masse_salariale_mois_fcfa)} FCFA/mois</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
          <div className={`text-xl font-black ${s.personnel.bulletins_en_attente > 0 ? "text-amber-600" : "text-green-700"}`}>
            {s.personnel.bulletins_en_attente}
          </div>
          <div className="text-xs text-gray-500 mt-1">Bulletins en attente</div>
        </div>
      </div>
    </div>
  );
}

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, Cell,
} from "recharts";
import {
  Leaf, Users, ShieldCheck, TrendingUp, Award, GraduationCap,
  Handshake, Calculator, FileText, Plus, ChevronDown,
  Download, AlertTriangle, RefreshCw, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Auth helper ───────────────────────────────────────────────────────────────

function authFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("coop_token");
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Indicateurs {
  id: number;
  campagneId: number;
  nbMembresTotal: number | null;
  nbMembresFemmes: number | null;
  nbMembresJeunes: number | null;
  pctFemmes: string | null;
  revenuMoyenMembreFcfa: string | null;
  revenuMedianMembreFcfa: string | null;
  revenuMinMembreFcfa: string | null;
  revenuMaxMembreFcfa: string | null;
  seuilPauvreteFcfa: string | null;
  nbMembresSousSeuil: number | null;
  pctMembresSousSeuil: string | null;
  nbFormationsDispensees: number | null;
  nbBeneficiairesFormation: number | null;
  nbJoursFormation: number | null;
  thematiquesFormation: string[] | null;
  superficieTotaleHa: string | null;
  superficieCertifieeHa: string | null;
  pctSuperficieCertifiee: string | null;
  nbParcellesConformesEudr: number | null;
  pctConformiteEudr: string | null;
  nbMembresCertifiesUtz: number | null;
  nbMembresCertifiesRainforest: number | null;
  nbMembresCertifiesFairtrade: number | null;
  nbMembresCertifiesEudr: number | null;
  pctMembresCertifies: string | null;
  prixMoyenPayeKgFcfa: string | null;
  primeQualiteDistribueeFcfa: string | null;
  primeCertificationFcfa: string | null;
  tauxRemboursementAvancesPct: string | null;
  nbAgTenues: number | null;
  tauxParticipationAgPct: string | null;
  engagementsCampagneSuivante: string | null;
  dateCalcul: string | null;
}

interface Formation {
  id: number;
  titre: string | null;
  thematique: string | null;
  dateFormation: string | null;
  lieu: string | null;
  formateur: string | null;
  nbParticipants: number | null;
  nbFemmes: number | null;
  dureeJours: string | null;
  financement: string | null;
}

interface DistributionBin {
  tranche: string;
  nb: number;
  sousSeuil: boolean;
}

interface Comparaison {
  campagne: string;
  annee: number;
  pctFemmes: number;
  pctConformiteEudr: number;
  pctCertifies: number;
  revenuMoyen: number;
  tauxParticipAg: number;
  nbFormations: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function n(v: string | number | null | undefined, dec = 0): number {
  return parseFloat(String(v ?? 0)) || 0;
}
function pct(v: string | number | null | undefined): string {
  return Math.round(n(v)) + "%";
}
function fcfa(v: string | number | null | undefined): string {
  const val = Math.round(n(v));
  if (val === 0) return "—";
  return val.toLocaleString("fr-CI") + " F";
}
function scoreGlobal(ind: Indicateurs): number {
  const dims = [
    Math.min(100, n(ind.pctFemmes) * 2),
    n(ind.pctConformiteEudr),
    Math.max(0, 100 - n(ind.pctMembresSousSeuil)),
    n(ind.pctMembresCertifies),
    Math.min(100, ((ind.nbBeneficiairesFormation ?? 0) / Math.max(1, ind.nbMembresTotal ?? 1)) * 100),
    n(ind.tauxParticipationAgPct),
  ];
  return Math.round(dims.reduce((s, v) => s + v, 0) / dims.length);
}

const THEMATIQUES = [
  { value: "bonnes_pratiques",    label: "Bonnes pratiques agricoles" },
  { value: "qualite_cacao",       label: "Qualité du cacao" },
  { value: "eudr",                label: "Conformité EUDR" },
  { value: "gestion_financiere",  label: "Gestion financière" },
  { value: "sante_securite",      label: "Santé & sécurité" },
  { value: "environnement",       label: "Environnement" },
];

const VERT = "#1a4731";

// ── Composants UI réutilisables ───────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, sub, color = "green",
}: { icon: React.ElementType; label: string; value: string; sub?: string; color?: "green" | "amber" | "blue" }) {
  const bg  = color === "amber" ? "bg-amber-50 border-amber-200" : color === "blue" ? "bg-blue-50 border-blue-200" : "bg-green-50 border-green-200";
  const txt = color === "amber" ? "text-amber-700" : color === "blue" ? "text-blue-700" : "text-green-700";
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-1 ${bg}`}>
      <div className="flex items-center gap-2">
        <Icon size={18} className={txt} />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <span className={`text-2xl font-bold ${txt}`}>{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

function ProgressBar({ value, max = 100, color = VERT }: { value: number; max?: number; color?: string }) {
  const w = Math.min(100, (value / max) * 100);
  return (
    <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${w}%`, backgroundColor: color }}
      />
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function RsePage() {
  const [activeTab, setActiveTab] = useState(0);
  const [campagneId, setCampagneId] = useState<number | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [engagements, setEngagements] = useState("");
  const [engagementsEdited, setEngagementsEdited] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const TABS = ["Tableau de bord RSE", "Revenus & bien-être", "Formations", "Rapport RSE"];

  // Campagnes
  const { data: campagnes = [] } = useQuery<Array<{ id: number; libelle: string; anneeDebut: number }>>({
    queryKey: ["campagnes-rse"],
    queryFn:  async () => {
      const r = await authFetch("/api/campagnes");
      if (!r.ok) return [];
      const j = await r.json() as { data?: unknown[] };
      return (Array.isArray(j) ? j : j.data ?? []) as Array<{ id: number; libelle: string; anneeDebut: number }>;
    },
    staleTime: 5 * 60_000,
  });
  const campagneActive = campagneId ?? campagnes[0]?.id ?? null;

  // Indicateurs
  const { data: indData, isLoading: indLoading } = useQuery({
    queryKey: ["rse", "indicateurs", campagneActive],
    enabled:  !!campagneActive,
    queryFn:  async () => {
      const r = await authFetch(`/api/rse/indicateurs/${campagneActive}`);
      if (!r.ok) throw new Error("Erreur chargement indicateurs");
      const j = await r.json() as { calculé: boolean; indicateurs: Indicateurs | null };
      return j;
    },
  });
  const ind: Indicateurs | null = indData?.indicateurs ?? null;

  // Distribution revenus
  const { data: distribution } = useQuery<DistributionBin[]>({
    queryKey: ["rse", "distribution", campagneActive],
    enabled:  !!campagneActive && activeTab === 1,
    queryFn:  async () => {
      const r = await authFetch(`/api/rse/distribution/${campagneActive}`);
      if (!r.ok) return [];
      return r.json() as Promise<DistributionBin[]>;
    },
  });

  // Comparaison
  const { data: comparaison } = useQuery<Comparaison[]>({
    queryKey: ["rse", "comparaison"],
    enabled:  activeTab === 0,
    queryFn:  async () => {
      const r = await authFetch("/api/rse/comparaison");
      if (!r.ok) return [];
      return r.json() as Promise<Comparaison[]>;
    },
  });

  // Formations
  const { data: formations } = useQuery<Formation[]>({
    queryKey: ["rse", "formations", campagneActive],
    enabled:  !!campagneActive,
    queryFn:  async () => {
      const url = campagneActive
        ? `/api/rse/formations?campagne_id=${campagneActive}`
        : "/api/rse/formations";
      const r = await authFetch(url);
      if (!r.ok) return [];
      return r.json() as Promise<Formation[]>;
    },
  });

  // Mutation : calculer
  const calculerMut = useMutation({
    mutationFn: async () => {
      const r = await authFetch(`/api/rse/calculer/${campagneActive}`, { method: "POST" });
      if (!r.ok) throw new Error("Erreur calcul");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Indicateurs calculés avec succès" });
      void qc.invalidateQueries({ queryKey: ["rse"] });
    },
    onError: () => toast({ title: "Erreur lors du calcul", variant: "destructive" }),
  });

  // Mutation : engagements
  const engagementsMut = useMutation({
    mutationFn: async (text: string) => {
      const r = await authFetch(`/api/rse/engagements/${campagneActive}`, {
        method: "PATCH",
        body:   JSON.stringify({ engagements: text }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      toast({ title: "Engagements enregistrés" });
      setEngagementsEdited(false);
      void qc.invalidateQueries({ queryKey: ["rse"] });
    },
    onError: () => toast({ title: "Erreur sauvegarde", variant: "destructive" }),
  });

  // Téléchargement PDF
  const downloadPdf = useCallback(async () => {
    if (!campagneActive) return;
    const token = localStorage.getItem("coop_token");
    const r = await fetch(`/api/rse/rapport-pdf/${campagneActive}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!r.ok) {
      toast({ title: "Impossible de générer le PDF — calculez d'abord les indicateurs", variant: "destructive" });
      return;
    }
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `rapport_rse_${campagneActive}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [campagneActive, toast]);

  // Radar data
  const radarData = ind
    ? [
        { dim: "Genre",        score: Math.min(100, n(ind.pctFemmes) * 2) },
        { dim: "EUDR",         score: n(ind.pctConformiteEudr) },
        { dim: "Revenus",      score: Math.max(0, 100 - n(ind.pctMembresSousSeuil)) },
        { dim: "Certification",score: n(ind.pctMembresCertifies) },
        { dim: "Formation",    score: Math.min(100, ((ind.nbBeneficiairesFormation ?? 0) / Math.max(1, ind.nbMembresTotal ?? 1)) * 100) },
        { dim: "Gouvernance",  score: n(ind.tauxParticipationAgPct) },
      ]
    : [];

  const score = ind ? scoreGlobal(ind) : 0;

  // ── Sélecteur campagne ────────────────────────────────────────────────────
  const CampagneSelector = () => (
    <div className="relative">
      <select
        value={campagneActive ?? ""}
        onChange={(e) => setCampagneId(Number(e.target.value))}
        className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
      >
        {campagnes.map((c) => (
          <option key={c.id} value={c.id}>{c.libelle}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2 top-3 text-gray-400 pointer-events-none" />
    </div>
  );

  // ── Rendu ─────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-xl">
            <Leaf size={24} className="text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">RSE & Durabilité</h1>
            <p className="text-sm text-gray-500">Responsabilité Sociale des Entreprises — Standards GRI</p>
          </div>
        </div>
        <CampagneSelector />
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors ${
              activeTab === i
                ? "text-green-700 border-b-2 border-green-700 bg-green-50"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* ── Onglet 1 : Tableau de bord RSE ─────────────────────────────────── */}
      {activeTab === 0 && (
        <div className="space-y-6">
          {!ind && !indLoading && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <Calculator size={48} className="text-gray-300" />
              <p className="text-gray-500 text-lg">Aucun indicateur calculé pour cette campagne</p>
              <button
                onClick={() => calculerMut.mutate()}
                disabled={calculerMut.isPending || !campagneActive}
                className="flex items-center gap-2 bg-green-700 text-white px-5 py-2.5 rounded-lg hover:bg-green-800 disabled:opacity-50"
              >
                {calculerMut.isPending
                  ? <><RefreshCw size={16} className="animate-spin" /> Calcul en cours…</>
                  : <><Calculator size={16} /> Calculer les indicateurs</>}
              </button>
            </div>
          )}

          {ind && (
            <>
              {/* 6 KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <KpiCard icon={Users}       label="Femmes"       value={pct(ind.pctFemmes)}         sub={`${ind.nbMembresFemmes ?? 0} sur ${ind.nbMembresTotal ?? 0}`} color="green" />
                <KpiCard icon={ShieldCheck} label="EUDR"         value={pct(ind.pctConformiteEudr)} sub={`${ind.nbParcellesConformesEudr ?? 0} parcelles conformes`}    color={n(ind.pctConformiteEudr) >= 80 ? "green" : "amber"} />
                <KpiCard icon={TrendingUp}  label="Revenu moyen" value={fcfa(ind.revenuMoyenMembreFcfa)} sub="par producteur / an"                                     color="blue" />
                <KpiCard icon={Award}       label="Certifiés"    value={pct(ind.pctMembresCertifies)} sub="membres avec certification"                                  color="green" />
                <KpiCard icon={GraduationCap} label="Formés"    value={String(ind.nbBeneficiairesFormation ?? 0)} sub={`${ind.nbFormationsDispensees ?? 0} formations`} color="blue" />
                <KpiCard icon={Handshake}   label="Particip. AG" value={pct(ind.tauxParticipationAgPct)} sub={`${ind.nbAgTenues ?? 0} AG tenues`}                     color={n(ind.tauxParticipationAgPct) >= 60 ? "green" : "amber"} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Score radar */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="font-semibold text-gray-900">Score global RSE</h2>
                    <span
                      className={`text-2xl font-bold ${score >= 70 ? "text-green-700" : score >= 50 ? "text-amber-600" : "text-red-600"}`}
                    >
                      {score} <span className="text-base font-normal text-gray-400">/ 100</span>
                    </span>
                  </div>
                  <ProgressBar value={score} color={score >= 70 ? VERT : score >= 50 ? "#f59e0b" : "#dc2626"} />
                  <div className="mt-4 h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                        <PolarGrid />
                        <PolarAngleAxis dataKey="dim" tick={{ fontSize: 11, fill: "#374151" }} />
                        <Radar
                          name="Score"
                          dataKey="score"
                          stroke={VERT}
                          fill={VERT}
                          fillOpacity={0.25}
                          dot={{ r: 3, fill: VERT }}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Indicateurs environnementaux */}
                <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                  <h2 className="font-semibold text-gray-900">Dimension environnementale</h2>
                  {[
                    { label: "Conformité EUDR",     val: n(ind.pctConformiteEudr),     warn: 80  },
                    { label: "% superficie certif.", val: n(ind.pctSuperficieCertifiee), warn: 50  },
                    { label: "Membres certifiés",    val: n(ind.pctMembresCertifies),   warn: 50  },
                  ].map((row) => (
                    <div key={row.label}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{row.label}</span>
                        <span className={`font-semibold ${row.val >= row.warn ? "text-green-700" : "text-amber-600"}`}>
                          {Math.round(row.val)}%
                        </span>
                      </div>
                      <ProgressBar value={row.val} color={row.val >= row.warn ? VERT : "#f59e0b"} />
                    </div>
                  ))}
                  <div className="pt-2 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Superficie totale</span>
                      <p className="font-semibold text-gray-900">{n(ind.superficieTotaleHa).toFixed(1)} ha</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Superficie certifiée</span>
                      <p className="font-semibold text-gray-900">{n(ind.superficieCertifieeHa).toFixed(1)} ha</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Comparaison multi-campagnes */}
              {comparaison && comparaison.length > 1 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-semibold text-gray-900 mb-4">Comparaison des campagnes</h2>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparaison} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="campagne" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                        <Tooltip formatter={(v: number) => `${Math.round(v)}%`} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="pctFemmes"       name="Femmes"      fill="#10b981" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="pctConformiteEudr" name="EUDR"      fill="#1a4731" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="pctCertifies"    name="Certifiés"   fill="#f59e0b" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="tauxParticipAg"  name="Particip. AG" fill="#6366f1" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Onglet 2 : Revenus & bien-être ─────────────────────────────────── */}
      {activeTab === 1 && (
        <div className="space-y-6">
          {!ind && (
            <p className="text-center text-gray-500 py-10">Calculez d'abord les indicateurs dans l'onglet "Rapport RSE".</p>
          )}

          {ind && (
            <>
              {/* KPI revenus */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Revenu moyen</span>
                  <p className="text-xl font-bold text-green-700 mt-1">{fcfa(ind.revenuMoyenMembreFcfa)}</p>
                  <span className="text-xs text-gray-400">par an</span>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Revenu médian</span>
                  <p className="text-xl font-bold text-gray-900 mt-1">{fcfa(ind.revenuMedianMembreFcfa)}</p>
                  <span className="text-xs text-gray-400">par an</span>
                </div>
                <div className={`border rounded-xl p-4 ${n(ind.pctMembresSousSeuil) > 20 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Sous le seuil</span>
                  <p className={`text-xl font-bold mt-1 ${n(ind.pctMembresSousSeuil) > 20 ? "text-red-600" : "text-green-700"}`}>
                    {ind.nbMembresSousSeuil ?? 0}
                  </p>
                  <span className="text-xs text-gray-400">membres ({pct(ind.pctMembresSousSeuil)})</span>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Seuil pauvreté</span>
                  <p className="text-xl font-bold text-gray-900 mt-1">750 000 F</p>
                  <span className="text-xs text-gray-400">national annuel</span>
                </div>
              </div>

              {/* Histogramme distribution */}
              {distribution && distribution.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-semibold text-gray-900 mb-1">Distribution des revenus</h2>
                  <p className="text-xs text-gray-500 mb-4">Nombre de membres par tranche de revenu annuel cacao</p>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={distribution} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                        <XAxis dataKey="tranche" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip
                          formatter={(v: number) => [`${v} membres`, "Nombre"]}
                          labelFormatter={(l) => `Tranche : ${l}`}
                        />
                        <ReferenceLine
                          x="600–750k"
                          stroke="#dc2626"
                          strokeDasharray="4 2"
                          label={{ value: "Seuil pauvreté", position: "top", fontSize: 10, fill: "#dc2626" }}
                        />
                        <Bar dataKey="nb" name="Membres" radius={[3, 3, 0, 0]}>
                          {distribution.map((d, i) => (
                            <Cell key={i} fill={d.sousSeuil ? "#fca5a5" : VERT} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Sous le seuil de pauvreté (750 000 F/an)</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: VERT }} /> Au-dessus du seuil</span>
                  </div>
                </div>
              )}

              {/* Message contextuel */}
              {ind.nbMembresSousSeuil && ind.nbMembresSousSeuil > 0 && (
                <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800 mb-1">Point d'attention</p>
                    <p className="text-amber-700">
                      Sur {ind.nbMembresTotal ?? 0} membres, <strong>{ind.nbMembresSousSeuil}</strong> ont un revenu
                      annuel cacao inférieur au seuil de pauvreté de 750 000 FCFA ({pct(ind.pctMembresSousSeuil)}).
                      Actions recommandées : augmenter les avances intrants, renforcer les formations qualité.
                    </p>
                  </div>
                </div>
              )}

              {/* Certification & prix */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="font-medium text-gray-800 mb-3">Prix et primes</h3>
                  {[
                    ["Prix moyen / kg",         ind.prixMoyenPayeKgFcfa  ? fcfa(ind.prixMoyenPayeKgFcfa) + "/kg" : "—"],
                    ["Primes qualité",           fcfa(ind.primeQualiteDistribueeFcfa)],
                    ["Primes certification",     fcfa(ind.primeCertificationFcfa)],
                    ["Subventions intrants",     fcfa(ind.tauxRemboursementAvancesPct)],
                    ["Taux remboursement avances", pct(ind.tauxRemboursementAvancesPct)],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-sm">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-medium text-gray-900">{v}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="font-medium text-gray-800 mb-3">Certifications actives</h3>
                  {[
                    ["UTZ",              ind.nbMembresCertifiesUtz],
                    ["Rainforest Alliance", ind.nbMembresCertifiesRainforest],
                    ["Fairtrade",        ind.nbMembresCertifiesFairtrade],
                    ["EUDR conforme",    ind.nbMembresCertifiesEudr],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-sm">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-semibold text-green-700">{v ?? 0} membres</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Onglet 3 : Formations ──────────────────────────────────────────── */}
      {activeTab === 2 && (
        <div className="space-y-6">
          {/* KPIs formations */}
          {ind && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <KpiCard icon={GraduationCap} label="Formations"    value={String(ind.nbFormationsDispensees ?? 0)}   color="green" />
              <KpiCard icon={Users}         label="Bénéficiaires" value={String(ind.nbBeneficiairesFormation ?? 0)} color="blue" />
              <KpiCard icon={TrendingUp}    label="Jours"         value={String(ind.nbJoursFormation ?? 0)}         color="green" />
              <KpiCard icon={Users}         label="Thématiques"   value={String((ind.thematiquesFormation ?? []).length)} color="blue" />
            </div>
          )}

          {/* Bouton enregistrer formation */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowFormModal(true)}
              className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 text-sm"
            >
              <Plus size={16} /> Enregistrer une formation
            </button>
          </div>

          {/* Graphique bénéficiaires par thématique */}
          {formations && formations.length > 0 && (() => {
            const byTheme: Record<string, number> = {};
            for (const f of formations) {
              const key = f.thematique ?? "Autre";
              byTheme[key] = (byTheme[key] ?? 0) + (f.nbParticipants ?? 0);
            }
            const themeData = Object.entries(byTheme).map(([t, nb]) => ({
              thematique: THEMATIQUES.find((x) => x.value === t)?.label ?? t,
              nb,
            }));
            return (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-4">Bénéficiaires par thématique</h2>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={themeData} layout="vertical" margin={{ left: 20, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="thematique" tick={{ fontSize: 10 }} width={160} />
                      <Tooltip formatter={(v: number) => [`${v} bénéficiaires`]} />
                      <Bar dataKey="nb" name="Bénéficiaires" fill={VERT} radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })()}

          {/* Tableau formations */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Liste des formations</h2>
            </div>
            {(!formations || formations.length === 0) ? (
              <p className="text-center text-gray-400 py-10">Aucune formation enregistrée pour cette campagne.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {["Date", "Titre", "Thématique", "Lieu", "Participants", "Dont femmes", "Financeur"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {formations.map((f) => (
                      <tr key={f.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600">
                          {f.dateFormation ? new Date(f.dateFormation).toLocaleDateString("fr-CI") : "—"}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{f.titre ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                            {THEMATIQUES.find((t) => t.value === f.thematique)?.label ?? f.thematique ?? "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{f.lieu ?? "—"}</td>
                        <td className="px-4 py-3 text-center font-semibold text-gray-900">{f.nbParticipants ?? 0}</td>
                        <td className="px-4 py-3 text-center text-gray-600">{f.nbFemmes ?? 0}</td>
                        <td className="px-4 py-3 text-gray-600">{f.financement ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Onglet 4 : Rapport RSE ─────────────────────────────────────────── */}
      {activeTab === 3 && (
        <div className="space-y-6">
          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => calculerMut.mutate()}
              disabled={calculerMut.isPending || !campagneActive}
              className="flex items-center gap-2 bg-green-700 text-white px-4 py-2.5 rounded-lg hover:bg-green-800 disabled:opacity-50 text-sm"
            >
              {calculerMut.isPending
                ? <><RefreshCw size={15} className="animate-spin" /> Calcul en cours…</>
                : <><Calculator size={15} /> Calculer les indicateurs</>}
            </button>
            <button
              onClick={downloadPdf}
              disabled={!ind}
              className="flex items-center gap-2 border border-green-700 text-green-700 px-4 py-2.5 rounded-lg hover:bg-green-50 disabled:opacity-50 text-sm"
            >
              <Download size={15} /> Générer le rapport RSE PDF
            </button>
          </div>

          {ind && (
            <>
              {/* Récapitulatif */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 size={18} className="text-green-600" />
                  <span className="font-semibold text-green-800">
                    Indicateurs calculés — {ind.dateCalcul ? new Date(ind.dateCalcul).toLocaleDateString("fr-CI") : ""}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  {[
                    ["Membres",         String(ind.nbMembresTotal ?? 0)],
                    ["Femmes",          pct(ind.pctFemmes)],
                    ["EUDR conforme",   pct(ind.pctConformiteEudr)],
                    ["Revenu moyen",    fcfa(ind.revenuMoyenMembreFcfa) + "/an"],
                    ["Certifiés",       pct(ind.pctMembresCertifies)],
                    ["Formations",      String(ind.nbFormationsDispensees ?? 0)],
                    ["Score RSE",       `${scoreGlobal(ind)} / 100`],
                    ["Particip. AG",    pct(ind.tauxParticipationAgPct)],
                    ["Superfície cert.",n(ind.pctSuperficieCertifiee).toFixed(1) + "%"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <span className="text-gray-500">{k}</span>
                      <p className="font-semibold text-gray-900">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Engagements campagne suivante */}
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                    <FileText size={16} className="text-green-600" />
                    Engagements campagne suivante
                  </h2>
                  {engagementsEdited && (
                    <button
                      onClick={() => engagementsMut.mutate(engagements)}
                      disabled={engagementsMut.isPending}
                      className="text-sm bg-green-700 text-white px-3 py-1.5 rounded-lg hover:bg-green-800 disabled:opacity-50"
                    >
                      {engagementsMut.isPending ? "Sauvegarde…" : "Enregistrer"}
                    </button>
                  )}
                </div>
                <textarea
                  rows={5}
                  placeholder="Décrivez ici les objectifs RSE pour la prochaine campagne (ex : atteindre 80% de conformité EUDR, organiser 6 formations, augmenter la représentation féminine…)"
                  defaultValue={ind.engagementsCampagneSuivante ?? ""}
                  onChange={(e) => {
                    setEngagements(e.target.value);
                    setEngagementsEdited(true);
                  }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Ces engagements seront inclus dans la dernière page du rapport PDF (standard GRI).
                </p>
              </div>
            </>
          )}

          {!ind && !indLoading && (
            <div className="text-center py-16 text-gray-400">
              <FileText size={48} className="mx-auto mb-3 opacity-30" />
              <p>Aucun indicateur calculé. Cliquez sur "Calculer les indicateurs" pour démarrer.</p>
            </div>
          )}
        </div>
      )}

      {/* ── Modal : Enregistrer une formation ────────────────────────────── */}
      {showFormModal && (
        <FormationModal
          campagneId={campagneActive}
          campagnes={campagnes}
          onClose={() => setShowFormModal(false)}
          onSaved={() => {
            setShowFormModal(false);
            void qc.invalidateQueries({ queryKey: ["rse", "formations"] });
            void qc.invalidateQueries({ queryKey: ["rse", "indicateurs"] });
            toast({ title: "Formation enregistrée" });
          }}
        />
      )}
    </div>
  );
}

// ── Modal création formation ───────────────────────────────────────────────────

function FormationModal({
  campagneId,
  campagnes,
  onClose,
  onSaved,
}: {
  campagneId: number | null;
  campagnes: Array<{ id: number; libelle: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    campagneId:    campagneId ?? "",
    titre:         "",
    thematique:    "",
    dateFormation: "",
    lieu:          "",
    formateur:     "",
    nbParticipants:"",
    nbFemmes:      "",
    dureeJours:    "",
    financement:   "",
  });
  const [saving, setSaving] = useState(false);

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        ...form,
        campagneId:     form.campagneId ? Number(form.campagneId) : undefined,
        nbParticipants: form.nbParticipants ? Number(form.nbParticipants) : undefined,
        nbFemmes:       form.nbFemmes ? Number(form.nbFemmes) : undefined,
        dureeJours:     form.dureeJours ? Number(form.dureeJours) : undefined,
      };
      const token = localStorage.getItem("coop_token");
      const r = await fetch("/api/rse/formations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      onSaved();
    } catch {
      alert("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <GraduationCap size={18} className="text-green-600" /> Enregistrer une formation
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="p-6 space-y-4">
          {/* Campagne */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campagne</label>
            <select value={form.campagneId} onChange={(e) => set("campagneId", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">— Sélectionner —</option>
              {campagnes.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
            </select>
          </div>

          {/* Titre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre *</label>
            <input required value={form.titre} onChange={(e) => set("titre", e.target.value)}
              placeholder="Ex : Formation bonnes pratiques agricoles"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          {/* Thématique */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Thématique</label>
            <select value={form.thematique} onChange={(e) => set("thematique", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">— Sélectionner —</option>
              {THEMATIQUES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={form.dateFormation} onChange={(e) => set("dateFormation", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {/* Durée */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Durée (jours)</label>
              <input type="number" min="0.5" step="0.5" value={form.dureeJours} onChange={(e) => set("dureeJours", e.target.value)}
                placeholder="1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Participants */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Participants</label>
              <input type="number" min="0" value={form.nbParticipants} onChange={(e) => set("nbParticipants", e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {/* Dont femmes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dont femmes</label>
              <input type="number" min="0" value={form.nbFemmes} onChange={(e) => set("nbFemmes", e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
          </div>

          {/* Lieu */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
            <input value={form.lieu} onChange={(e) => set("lieu", e.target.value)}
              placeholder="Village / salle..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Formateur */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Formateur</label>
              <input value={form.formateur} onChange={(e) => set("formateur", e.target.value)}
                placeholder="Nom du formateur"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            {/* Financement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Financement</label>
              <select value={form.financement} onChange={(e) => set("financement", e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                <option value="">— Source —</option>
                <option value="interne">Interne coopérative</option>
                <option value="GIZ">GIZ</option>
                <option value="FIRCA">FIRCA</option>
                <option value="Fairtrade">Fairtrade</option>
                <option value="Rainforest Alliance">Rainforest Alliance</option>
                <option value="autre">Autre</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 bg-green-700 text-white px-5 py-2 rounded-lg hover:bg-green-800 disabled:opacity-50 text-sm">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetDashboard, useGetDashboardLivraisons, useGetDashboardAvancesRetard } from "@workspace/api-client-react";
import { Users, Package, Banknote, AlertTriangle, Clock, MapPinned, MapPin, CheckCircle2, Navigation, Settings } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Redirect } from "wouter";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) => fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } });

function formaterFCFA(montant: number) {
  return new Intl.NumberFormat("fr-FR").format(montant) + " FCFA";
}

function formaterDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function CarteKpi({
  titre,
  valeur,
  icone: Icone,
  couleur,
  sousTitre,
}: {
  titre: string;
  valeur: string;
  icone: React.ElementType;
  couleur: string;
  sousTitre?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 sm:p-5 flex items-start gap-2 sm:gap-4">
      <div className="rounded-lg p-2 sm:p-2.5 flex-shrink-0" style={{ backgroundColor: couleur + "15" }}>
        <Icone size={18} style={{ color: couleur }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm text-gray-500 font-medium leading-snug">{titre}</p>
        <p className="text-base sm:text-2xl font-bold text-gray-900 mt-0.5 leading-tight break-words">{valeur}</p>
        {sousTitre && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sousTitre}</p>}
      </div>
    </div>
  );
}

interface StatsRT {
  membresTotal: number;
  membresSansGps: number;
  demandesEnAttente: number;
  missionsSoumises: number;
  parcellesTotal: number;
  parcellesConformes: number;
  parcellesNonConformes: number;
  parcellesNonVerifiees: number;
  tauxEudrConforme: number;
  tauxCompletionGps: number;
  membresEudrConformes: number;
  membresIdentiteComplets: number;
  tauxEudrMembres: number;
  tauxIdentite: number;
}

function JaugeCirculaire({ pct, couleur, taille = 80 }: { pct: number; couleur: string; taille?: number }) {
  const r = (taille - 12) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`}>
      <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" stroke="#f3f4f6" strokeWidth={10} />
      <circle
        cx={taille / 2} cy={taille / 2} r={r} fill="none"
        stroke={couleur} strokeWidth={10}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${taille / 2} ${taille / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize={taille * 0.22} fontWeight="bold" fill="#111827">
        {pct}%
      </text>
    </svg>
  );
}

const SEUILS_KEY = "coop_gps_seuils";
const DEFAULT_SEUILS = { warning: 50, objectif: 80 };
function readSeuils(): { warning: number; objectif: number } {
  try { return JSON.parse(localStorage.getItem(SEUILS_KEY) ?? "null") ?? DEFAULT_SEUILS; }
  catch { return DEFAULT_SEUILS; }
}

function DashboardRT() {
  const [, navigate] = useLocation();
  const [seuils, setSeuils] = useState<{ warning: number; objectif: number }>(readSeuils);
  const [editingSeuils, setEditingSeuils] = useState(false);
  const [seuilWarningDraft, setSeuilWarningDraft] = useState(String(DEFAULT_SEUILS.warning));
  const [seuilObjectifDraft, setSeuilObjectifDraft] = useState(String(DEFAULT_SEUILS.objectif));

  function openEditSeuils() {
    setSeuilWarningDraft(String(seuils.warning));
    setSeuilObjectifDraft(String(seuils.objectif));
    setEditingSeuils(true);
  }
  function saveSeuils() {
    const w = Math.max(0, Math.min(100, parseInt(seuilWarningDraft) || DEFAULT_SEUILS.warning));
    const o = Math.max(0, Math.min(100, parseInt(seuilObjectifDraft) || DEFAULT_SEUILS.objectif));
    const next = { warning: w, objectif: o };
    setSeuils(next);
    localStorage.setItem(SEUILS_KEY, JSON.stringify(next));
    setEditingSeuils(false);
  }

  const { data: stats, isLoading } = useQuery<StatsRT>({
    queryKey: ["dashboard-tracabilite"],
    queryFn: async () => {
      const r = await apiFetch("/api/dashboard/tracabilite");
      if (!r.ok) throw new Error("Erreur chargement");
      return r.json() as Promise<StatsRT>;
    },
  });

  const { data: conformite } = useQuery<{
    nb_parcelles_total: number;
    nb_conformes: number;
    nb_non_conformes: number;
    nb_non_verifiees: number;
    par_section: { section: string; total: number; conformes: number; pct: number }[];
  }>({
    queryKey: ["parcelles-conformite"],
    queryFn: async () => {
      const r = await apiFetch("/api/parcelles/conformite");
      if (!r.ok) return null;
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />
          ))}
        </div>
      </div>
    );
  }

  const s = stats ?? {
    membresTotal: 0, membresSansGps: 0, demandesEnAttente: 0, missionsSoumises: 0,
    parcellesTotal: 0, parcellesConformes: 0, parcellesNonConformes: 0, parcellesNonVerifiees: 0,
    tauxEudrConforme: 0, tauxCompletionGps: 0,
    membresEudrConformes: 0, membresIdentiteComplets: 0, tauxEudrMembres: 0, tauxIdentite: 0,
  };

  const parSections = (conformite?.par_section ?? []).slice(0, 6);

  const allSections = conformite?.par_section ?? [];
  const sectionsEnDanger = allSections.filter(sec => sec.pct < seuils.warning);
  const sectionsEnAvertissement = allSections.filter(sec => sec.pct >= seuils.warning && sec.pct < seuils.objectif);
  const hasAlertes = sectionsEnDanger.length > 0 || sectionsEnAvertissement.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord Traçabilité</h1>
        <p className="text-gray-500 text-sm mt-1">EUDR · Parcelles · Missions terrain</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <CarteKpi
          titre="Conformité EUDR"
          valeur={`${s.tauxEudrConforme} %`}
          icone={CheckCircle2}
          couleur={s.tauxEudrConforme >= 80 ? "#16a34a" : s.tauxEudrConforme >= 50 ? "#c4962a" : "#dc2626"}
          sousTitre={`${s.parcellesConformes} / ${s.parcellesTotal} parcelles`}
        />
        <CarteKpi
          titre="Couverture GPS"
          valeur={`${s.tauxCompletionGps} %`}
          icone={MapPin}
          couleur="#2563eb"
          sousTitre={`${s.membresSansGps} membre${s.membresSansGps !== 1 ? "s" : ""} sans GPS`}
        />
        <CarteKpi
          titre="Demandes en attente"
          valeur={String(s.demandesEnAttente)}
          icone={Users}
          couleur="#c4962a"
          sousTitre="À valider ou rejeter"
        />
        <CarteKpi
          titre="Missions à valider"
          valeur={String(s.missionsSoumises)}
          icone={Navigation}
          couleur={s.missionsSoumises > 0 ? "#7c3aed" : "#6b7280"}
          sousTitre="Données GPS soumises"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4 flex items-center gap-2">
            <MapPinned size={15} className="text-gray-400" />Conformité EUDR — Vue globale
          </h2>
          <div className="flex items-center gap-6">
            <JaugeCirculaire pct={s.tauxEudrConforme} couleur={s.tauxEudrConforme >= 80 ? "#16a34a" : s.tauxEudrConforme >= 50 ? "#c4962a" : "#dc2626"} taille={96} />
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Conformes</span>
                <span className="font-semibold">{s.parcellesConformes}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Non conformes</span>
                <span className="font-semibold">{s.parcellesNonConformes}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-gray-300 inline-block" />Non vérifiées</span>
                <span className="font-semibold">{s.parcellesNonVerifiees}</span>
              </div>
              <div className="pt-1 border-t border-gray-100 flex items-center justify-between text-sm font-medium">
                <span>Total</span>
                <span>{s.parcellesTotal}</span>
              </div>
            </div>
          </div>
          <button onClick={() => navigate("/parcelles")}
            className="mt-4 w-full text-center text-xs text-green-700 hover:underline">
            Voir toutes les parcelles →
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 text-sm mb-4 flex items-center gap-2">
            <MapPinned size={15} className="text-gray-400" />Conformité par section
          </h2>
          {parSections.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Aucune donnée de section disponible</p>
          ) : (
            <div className="space-y-2">
              {parSections.map((sec) => (
                <div key={sec.section}>
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-0.5">
                    <span className="truncate max-w-[60%]">{sec.section}</span>
                    <span className="font-medium">{sec.pct}% ({sec.conformes}/{sec.total})</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${sec.pct >= 80 ? "bg-green-500" : sec.pct >= 50 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${sec.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Alertes couverture GPS par section ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
            <AlertTriangle size={15} className={hasAlertes ? "text-amber-500" : "text-gray-400"} />
            Alertes couverture GPS
            {hasAlertes && (
              <span className="text-xs font-normal text-gray-500">
                ({sectionsEnDanger.length} critique{sectionsEnDanger.length !== 1 ? "s" : ""}, {sectionsEnAvertissement.length} avertissement{sectionsEnAvertissement.length !== 1 ? "s" : ""})
              </span>
            )}
          </h2>
          <button
            onClick={editingSeuils ? () => setEditingSeuils(false) : openEditSeuils}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            <Settings size={12} />
            {editingSeuils ? "Fermer" : `Seuils : ${seuils.warning}% / ${seuils.objectif}%`}
          </button>
        </div>

        {editingSeuils && (
          <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-red-700 font-medium text-xs">⚠ Seuil danger (%)</span>
              <input
                type="number" min="0" max="100" value={seuilWarningDraft}
                onChange={e => setSeuilWarningDraft(e.target.value)}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-amber-700 font-medium text-xs">◎ Objectif (%)</span>
              <input
                type="number" min="0" max="100" value={seuilObjectifDraft}
                onChange={e => setSeuilObjectifDraft(e.target.value)}
                className="w-16 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
            </label>
            <button
              onClick={saveSeuils}
              className="px-3 py-1 bg-green-700 text-white rounded-lg text-xs hover:bg-green-800 transition-colors"
            >
              Enregistrer
            </button>
          </div>
        )}

        {hasAlertes ? (
          <div className="divide-y divide-gray-100">
            {[...sectionsEnDanger, ...sectionsEnAvertissement].map(sec => {
              const isDanger = sec.pct < seuils.warning;
              return (
                <div key={sec.section} className={`flex items-center gap-4 px-5 py-3 ${isDanger ? "bg-red-50" : "bg-amber-50"}`}>
                  <AlertTriangle size={14} className={`shrink-0 ${isDanger ? "text-red-500" : "text-amber-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{sec.section}</p>
                    <p className="text-xs text-gray-500">{sec.conformes}/{sec.total} parcelles conformes</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isDanger ? "bg-red-400" : "bg-amber-400"}`}
                        style={{ width: `${sec.pct}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold w-10 text-right ${isDanger ? "text-red-600" : "text-amber-600"}`}>
                      {sec.pct}%
                    </span>
                  </div>
                  <button
                    onClick={() => navigate("/parcelles")}
                    className="text-xs text-blue-600 hover:underline shrink-0"
                  >
                    Voir →
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <CheckCircle2 size={22} className="mx-auto mb-2 text-green-500" />
            <p className="text-sm font-medium text-green-700">Toutes les sections sont au-dessus de l'objectif</p>
            <p className="text-xs text-gray-400 mt-1">Seuil danger : {seuils.warning}% · Objectif : {seuils.objectif}%</p>
          </div>
        )}
      </div>

      {/* ── Complétion des fiches membres — 2 groupes ────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
          <Users size={15} className="text-gray-400" />
          Complétion des fiches membres
          <span className="text-xs font-normal text-gray-400 ml-1">({s.membresTotal} actifs)</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Groupe A */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-700">Groupe A — Identité</p>
                <p className="text-[11px] text-gray-400">10 champs · requis pour activation</p>
              </div>
              <span className={`text-lg font-bold ${s.tauxIdentite === 100 ? "text-green-600" : s.tauxIdentite >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                {s.tauxIdentite}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${s.tauxIdentite === 100 ? "bg-green-500" : s.tauxIdentite >= 60 ? "bg-yellow-400" : "bg-red-400"}`}
                style={{ width: `${s.tauxIdentite}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{s.membresIdentiteComplets}</span> / {s.membresTotal} membres complets
            </p>
          </div>
          {/* Groupe B */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-gray-700">Groupe B — EUDR / GPS</p>
                <p className="text-[11px] text-gray-400">3 champs · requis pour conformité EUDR</p>
              </div>
              <span className={`text-lg font-bold ${s.tauxEudrMembres === 100 ? "text-green-600" : s.tauxEudrMembres >= 60 ? "text-blue-600" : "text-gray-400"}`}>
                {s.tauxEudrMembres}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${s.tauxEudrMembres === 100 ? "bg-green-500" : s.tauxEudrMembres >= 60 ? "bg-blue-500" : "bg-gray-300"}`}
                style={{ width: `${s.tauxEudrMembres}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">{s.membresEudrConformes}</span> / {s.membresTotal} membres conformes EUDR
            </p>
          </div>
        </div>
        {s.membresTotal > 0 && s.tauxEudrMembres < 100 && (
          <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
            <AlertTriangle size={13} className="text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700">
              <span className="font-semibold">{s.membresTotal - s.membresEudrConformes}</span> membre{(s.membresTotal - s.membresEudrConformes) > 1 ? "s" : ""} actif{(s.membresTotal - s.membresEudrConformes) > 1 ? "s" : ""} sans données GPS — missions terrain requises.
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {s.demandesEnAttente > 0 && (
          <button onClick={() => navigate("/membres?statut=en_attente")}
            className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left hover:bg-amber-100 transition-colors">
            <p className="text-amber-800 font-semibold text-sm">{s.demandesEnAttente} demande{s.demandesEnAttente > 1 ? "s" : ""} à traiter</p>
            <p className="text-amber-600 text-xs mt-0.5">Valider ou rejeter les nouveaux membres →</p>
          </button>
        )}
        {s.missionsSoumises > 0 && (
          <button onClick={() => navigate("/missions")}
            className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-left hover:bg-purple-100 transition-colors">
            <p className="text-purple-800 font-semibold text-sm">{s.missionsSoumises} mission{s.missionsSoumises > 1 ? "s" : ""} à valider</p>
            <p className="text-purple-600 text-xs mt-0.5">Données GPS soumises par les agents →</p>
          </button>
        )}
        {s.membresSansGps > 0 && (
          <button onClick={() => navigate("/missions")}
            className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left hover:bg-blue-100 transition-colors">
            <p className="text-blue-800 font-semibold text-sm">{s.membresSansGps} membre{s.membresSansGps > 1 ? "s" : ""} sans GPS</p>
            <p className="text-blue-600 text-xs mt-0.5">Créer des missions terrain pour les cartographier →</p>
          </button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { utilisateur } = useAuth();
  const { data: kpi, isLoading: kpiChargement } = useGetDashboard();
  const { data: livraisons } = useGetDashboardLivraisons();
  const { data: avancesRetard } = useGetDashboardAvancesRetard();

  if (utilisateur?.role === "responsable_tracabilite") {
    return <DashboardRT />;
  }

  if (utilisateur?.role === "delegue") {
    return <Redirect to="/dashboard-delegue" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de la coopérative</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiChargement ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />
          ))
        ) : (
          <>
            <CarteKpi
              titre="Membres actifs"
              valeur={String(kpi?.membresActifs ?? 0)}
              icone={Users}
              couleur="#1a4731"
              sousTitre={
                kpi?.membresHommes != null
                  ? `Hommes : ${kpi.membresHommes} · Femmes : ${kpi.membresFemmes ?? 0}`
                  : "Membres enregistrés"
              }
            />
            <CarteKpi
              titre="Avances en cours"
              valeur={formaterFCFA(kpi?.avancesEnCoursMontant ?? 0)}
              icone={CreditCard2}
              couleur="#c4962a"
              sousTitre="Solde total dû"
            />
            <CarteKpi
              titre="Tonnage ce mois"
              valeur={`${((kpi?.tonnageMois ?? 0) / 1000).toFixed(2)} T`}
              icone={Package}
              couleur="#2563eb"
              sousTitre="Cacao collecté"
            />
            <CarteKpi
              titre="Paiements ce mois"
              valeur={formaterFCFA(kpi?.paiementsMois ?? 0)}
              icone={Banknote}
              couleur="#16a34a"
              sousTitre="Confirmés"
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dernières livraisons */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Clock size={16} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Dernières livraisons</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {!livraisons || livraisons.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune livraison</p>
            ) : (
              livraisons.map((l) => (
                <div key={l.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {l.membreNom} {l.membrePrenoms}
                    </p>
                    <p className="text-xs text-gray-400">{formaterDate(l.dateLivraison)} · {Number(l.poidsKg).toFixed(1)} kg</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{formaterFCFA(l.montantNetFcfa)}</p>
                    {l.avanceDeduiteFcfa > 0 && (
                      <p className="text-xs text-amber-600">-{formaterFCFA(l.avanceDeduiteFcfa)} avance</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Avances en retard */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            <h2 className="font-semibold text-gray-900 text-sm">Avances en retard</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {!avancesRetard || avancesRetard.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">Aucune avance en retard</p>
            ) : (
              avancesRetard.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {a.membreNom} {a.membrePrenoms}
                    </p>
                    <p className="text-xs text-gray-400">
                      Échéance : {a.dateEcheance ? formaterDate(a.dateEcheance) : "—"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-600">{formaterFCFA(a.soldeRestantFcfa)}</p>
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">En retard</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreditCard2(props: React.SVGProps<SVGSVGElement> & { size?: number }) {
  const { size = 24, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <rect width="20" height="14" x="2" y="5" rx="2" />
      <line x1="2" x2="22" y1="10" y2="10" />
    </svg>
  );
}

import { useQuery } from "@tanstack/react-query";
import {
  Wallet, Banknote, TrendingUp, TrendingDown, CheckCircle2, XCircle,
  Clock, AlertTriangle, ChevronRight, LayoutDashboard, RefreshCw,
  Users, Package, Building2, Smartphone, ArrowDownUp,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { CarteKpi } from "@/components/CarteKpi";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } }).then((r) => r.json());

function formaterFCFA(n: number | string) {
  const v = typeof n === "string" ? parseFloat(n) || 0 : n;
  return new Intl.NumberFormat("fr-FR").format(v) + " FCFA";
}
function formaterHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface Caisse {
  id: number;
  nom: string;
  type_caisse: string;
  solde_actuel_fcfa: string;
  fond_caisse_minimum_fcfa: string;
  actif: boolean;
  session_id: number | null;
  session_statut: string | null;
  heure_ouverture: string | null;
  solde_ouverture_fcfa: string | null;
}

interface CompteBanque {
  id: number;
  nom: string;
  banque: string;
  numero_compte: string | null;
  solde_actuel_fcfa: string;
  solde_mini_alerte_fcfa: string;
  actif: boolean;
}

interface CompteMobile {
  id: number;
  nom: string;
  operateur: string;
  numero_marchand: string | null;
  solde_actuel_fcfa: string;
  solde_mini_alerte_fcfa: string;
  actif: boolean;
}

interface Mouvement {
  id: number;
  type: string;
  motif: string;
  montant_fcfa: string;
  libelle: string | null;
  solde_apres_fcfa: string | null;
  created_at: string;
}

interface Journal {
  mouvements: Mouvement[];
  totalEntrees: number;
  totalSorties: number;
}

interface DashboardData {
  membresActifs: number;
  avancesEnCoursMontant: number;
  avancesEnRetardNb: number;
}

interface Avance {
  id: number;
  montantFcfa: number;
  statut: string;
  createdAt: string;
}

// ─── Opérateurs Mobile ───────────────────────────────────────────────────────

const OPERATEURS: Record<string, { label: string; bg: string }> = {
  wave:         { label: "Wave",         bg: "#1351D8" },
  orange_money: { label: "Orange Money", bg: "#FF6600" },
  mtn_momo:     { label: "MTN MoMo",     bg: "#FFCC00" },
};

const MOTIF_LABELS: Record<string, string> = {
  paiement_producteur: "Paiement producteur",
  avance: "Avance membre",
  achat_intrants: "Achat intrants",
  frais_fonctionnement: "Frais fonct.",
  depot_banque: "Dépôt banque",
  retrait_banque: "Retrait banque",
  don: "Don / subvention",
  remboursement: "Remboursement",
  autre: "Autre",
};

// ─── Widget Caisse ───────────────────────────────────────────────────────────

function WidgetCaisse({ caisse, onNavigate }: { caisse: Caisse; onNavigate: () => void }) {
  const solde = parseFloat(caisse.solde_actuel_fcfa);
  const minimum = parseFloat(caisse.fond_caisse_minimum_fcfa);
  const sessionOuverte = caisse.session_statut === "ouverte";
  const alerte = minimum > 0 && solde < minimum;
  const pct = minimum > 0 ? Math.min(100, (solde / (minimum * 2 || 1)) * 100) : 100;

  return (
    <div
      onClick={onNavigate}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:border-pink-300 hover:shadow-sm transition group"
    >
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-gray-50">
        <div className="flex items-center gap-2">
          <Wallet size={15} className="text-pink-600" />
          <span className="font-semibold text-gray-800 text-sm">{caisse.nom}</span>
          <span className="text-xs text-gray-400 capitalize">({caisse.type_caisse})</span>
        </div>
        <div className="flex items-center gap-2">
          {sessionOuverte ? (
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
              <CheckCircle2 size={11} /> Ouverte
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              <XCircle size={11} /> Fermée
            </span>
          )}
          <ChevronRight size={14} className="text-gray-400 group-hover:text-pink-500 transition" />
        </div>
      </div>
      <div className="px-4 py-3">
        <p className={`text-xl font-bold ${alerte ? "text-red-600" : "text-gray-900"}`}>
          {formaterFCFA(solde)}
        </p>
        {alerte && (
          <p className="text-xs text-red-500 mt-0.5 flex items-center gap-1">
            <AlertTriangle size={11} /> Sous le minimum ({formaterFCFA(minimum)})
          </p>
        )}
        {caisse.heure_ouverture && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Clock size={11} />
            {sessionOuverte ? "Ouverte à" : "Dernière ouverture"} {formaterHeure(caisse.heure_ouverture)}
          </p>
        )}
        {minimum > 0 && (
          <div className="mt-2 w-full bg-gray-100 rounded-full h-1">
            <div
              className={`h-1 rounded-full ${alerte ? "bg-red-400" : "bg-emerald-400"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Widget Banque ───────────────────────────────────────────────────────────

function WidgetBanque({ compte, onNavigate }: { compte: CompteBanque; onNavigate: () => void }) {
  const solde = parseFloat(compte.solde_actuel_fcfa);
  const mini  = parseFloat(compte.solde_mini_alerte_fcfa);
  const alerte = mini > 0 && solde < mini;

  return (
    <div
      onClick={onNavigate}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:border-blue-300 hover:shadow-sm transition group"
    >
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-blue-50/50">
        <div className="flex items-center gap-2">
          <Building2 size={15} className="text-blue-600" />
          <div>
            <p className="font-semibold text-gray-800 text-sm leading-none">{compte.nom}</p>
            <p className="text-xs text-gray-400 mt-0.5">{compte.banque}</p>
          </div>
        </div>
        <ChevronRight size={14} className="text-gray-400 group-hover:text-blue-500 transition" />
      </div>
      <div className="px-4 py-3">
        <p className={`text-xl font-bold ${alerte ? "text-red-600" : "text-gray-900"}`}>
          {formaterFCFA(solde)}
        </p>
        {compte.numero_compte && (
          <p className="text-xs text-gray-400 mt-0.5 font-mono">{compte.numero_compte}</p>
        )}
        {alerte && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertTriangle size={11} /> Solde sous le seuil d'alerte
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Widget Mobile Marchand ──────────────────────────────────────────────────

function WidgetMobile({ compte, onNavigate }: { compte: CompteMobile; onNavigate: () => void }) {
  const solde = parseFloat(compte.solde_actuel_fcfa);
  const mini  = parseFloat(compte.solde_mini_alerte_fcfa);
  const alerte = mini > 0 && solde < mini;
  const op = OPERATEURS[compte.operateur] ?? { label: compte.operateur, bg: "#6b7280" };

  return (
    <div
      onClick={onNavigate}
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:border-indigo-300 hover:shadow-sm transition group"
    >
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-indigo-50/40">
        <div className="flex items-center gap-2">
          <div
            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ backgroundColor: op.bg }}
          >
            {op.label}
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm leading-none">{compte.nom}</p>
            {compte.numero_marchand && (
              <p className="text-xs text-gray-400 mt-0.5 font-mono">{compte.numero_marchand}</p>
            )}
          </div>
        </div>
        <ChevronRight size={14} className="text-gray-400 group-hover:text-indigo-500 transition" />
      </div>
      <div className="px-4 py-3">
        <p className={`text-xl font-bold ${alerte ? "text-red-600" : "text-gray-900"}`}>
          {formaterFCFA(solde)}
        </p>
        {alerte && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertTriangle size={11} /> Solde sous le seuil d'alerte
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ─────────────────────────────────────────────────────────

export default function DashboardCaissier() {
  const { utilisateur } = useAuth();
  const [, navigate] = useLocation();
  const today = new Date().toISOString().split("T")[0]!;

  const { data: caisses = [], isLoading: loadingCaisses, refetch: refetchCaisses } = useQuery<Caisse[]>({
    queryKey: ["dash-caissier-caisses"],
    queryFn: () => apiFetch("/api/caisse"),
    refetchInterval: 60_000,
  });

  const { data: comptesBanque = [], isLoading: loadingBanque, refetch: refetchBanque } = useQuery<CompteBanque[]>({
    queryKey: ["dash-caissier-banque"],
    queryFn: () => apiFetch("/api/banque"),
    refetchInterval: 60_000,
  });

  const { data: comptesMobile = [], isLoading: loadingMobile, refetch: refetchMobile } = useQuery<CompteMobile[]>({
    queryKey: ["dash-caissier-mobile"],
    queryFn: () => apiFetch("/api/mobile-marchand"),
    refetchInterval: 60_000,
  });

  const { data: dashboard } = useQuery<DashboardData>({
    queryKey: ["dash-caissier-stats"],
    queryFn: () => apiFetch("/api/dashboard"),
    refetchInterval: 60_000,
  });

  const premiereCaisseId = caisses[0]?.id ?? null;
  const { data: journal, isLoading: loadingJournal } = useQuery<Journal>({
    queryKey: ["dash-caissier-journal", premiereCaisseId, today],
    queryFn: () => apiFetch(`/api/caisse/${premiereCaisseId}/journal?dateDebut=${today}&dateFin=${today}`),
    enabled: premiereCaisseId !== null,
    refetchInterval: 60_000,
  });

  const { data: avancesRaw } = useQuery<{ avances: Avance[] } | Avance[]>({
    queryKey: ["dash-caissier-avances", today],
    queryFn: () => apiFetch(`/api/avances?dateDebut=${today}&dateFin=${today}`),
    refetchInterval: 60_000,
  });

  const avancesListe: Avance[] = Array.isArray(avancesRaw)
    ? avancesRaw
    : (avancesRaw as { avances: Avance[] })?.avances ?? [];

  // ── Agrégats ──
  const totalCaisses   = caisses.reduce((s, c) => s + parseFloat(c.solde_actuel_fcfa), 0);
  const totalBanque    = comptesBanque.filter(c => c.actif).reduce((s, c) => s + parseFloat(c.solde_actuel_fcfa), 0);
  const totalMobile    = comptesMobile.filter(c => c.actif).reduce((s, c) => s + parseFloat(c.solde_actuel_fcfa), 0);
  const totalTresorerie = totalCaisses + totalBanque + totalMobile;

  const nbSessionsOuvertes = caisses.filter(c => c.session_statut === "ouverte").length;
  const nbAlerteCaisses    = caisses.filter(c =>
    parseFloat(c.fond_caisse_minimum_fcfa) > 0 &&
    parseFloat(c.solde_actuel_fcfa) < parseFloat(c.fond_caisse_minimum_fcfa)
  ).length;
  const nbAlerteBanque  = comptesBanque.filter(c => parseFloat(c.solde_mini_alerte_fcfa) > 0 && parseFloat(c.solde_actuel_fcfa) < parseFloat(c.solde_mini_alerte_fcfa)).length;
  const nbAlerteMobile  = comptesMobile.filter(c => parseFloat(c.solde_mini_alerte_fcfa) > 0 && parseFloat(c.solde_actuel_fcfa) < parseFloat(c.solde_mini_alerte_fcfa)).length;
  const nbAlertesTotal  = nbAlerteCaisses + nbAlerteBanque + nbAlerteMobile;

  const entreesJour  = journal?.totalEntrees ?? 0;
  const sortiesJour  = journal?.totalSorties ?? 0;
  const netJour      = entreesJour - sortiesJour;
  const mouvements: Mouvement[] = journal?.mouvements ?? [];

  const nbAvancesJour     = avancesListe.length;
  const montantAvancesJour = avancesListe.reduce((s, a) => s + (a.montantFcfa ?? 0), 0);

  const loading = loadingCaisses || loadingBanque || loadingMobile;

  function refresh() {
    refetchCaisses();
    refetchBanque();
    refetchMobile();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-7">

      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl p-2.5 bg-pink-50">
            <LayoutDashboard size={22} className="text-pink-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Bonjour, {utilisateur?.prenoms ?? utilisateur?.nom} 👋
            </h1>
            <p className="text-sm text-gray-500">
              {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition"
        >
          <RefreshCw size={15} />
          Actualiser
        </button>
      </div>

      {/* ── Alerte globale ── */}
      {!loading && nbAlertesTotal > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 font-medium">
            {nbAlertesTotal} compte{nbAlertesTotal > 1 ? "s" : ""} sous le seuil d'alerte —{" "}
            {nbAlerteCaisses > 0 && `${nbAlerteCaisses} caisse${nbAlerteCaisses > 1 ? "s" : ""}`}
            {nbAlerteCaisses > 0 && (nbAlerteBanque > 0 || nbAlerteMobile > 0) && ", "}
            {nbAlerteBanque > 0 && `${nbAlerteBanque} banque`}
            {nbAlerteBanque > 0 && nbAlerteMobile > 0 && ", "}
            {nbAlerteMobile > 0 && `${nbAlerteMobile} mobile`}
          </p>
        </div>
      )}

      {/* ── KPIs ligne 1 : vue trésorerie ── */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CarteKpi
            titre="Trésorerie totale"
            valeur={formaterFCFA(totalTresorerie)}
            montantFcfa={totalTresorerie}
            icone={Wallet}
            couleur="#be185d"
            sousTitre="Caisses + Banque + Mobile"
            badge={nbAlertesTotal > 0 ? { texte: `${nbAlertesTotal} alerte${nbAlertesTotal > 1 ? "s" : ""}`, type: "danger" } : undefined}
          />
          <CarteKpi
            titre="Caisses physiques"
            valeur={formaterFCFA(totalCaisses)}
            montantFcfa={totalCaisses}
            icone={Wallet}
            couleur="#0284c7"
            sousTitre={`${nbSessionsOuvertes}/${caisses.length} session${caisses.length > 1 ? "s" : ""} ouverte${nbSessionsOuvertes > 1 ? "s" : ""}`}
          />
          <CarteKpi
            titre="Comptes bancaires"
            valeur={formaterFCFA(totalBanque)}
            montantFcfa={totalBanque}
            icone={Building2}
            couleur="#0891b2"
            sousTitre={`${comptesBanque.filter(c => c.actif).length} compte${comptesBanque.length > 1 ? "s" : ""} actif${comptesBanque.length > 1 ? "s" : ""}`}
          />
          <CarteKpi
            titre="Mobile Marchands"
            valeur={formaterFCFA(totalMobile)}
            montantFcfa={totalMobile}
            icone={Smartphone}
            couleur="#7c3aed"
            sousTitre={`${comptesMobile.filter(c => c.actif).length} compte${comptesMobile.length > 1 ? "s" : ""} actif${comptesMobile.length > 1 ? "s" : ""}`}
          />
        </div>
      )}

      {/* ── KPIs ligne 2 : activité du jour ── */}
      {!loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <CarteKpi
            titre="Entrées du jour"
            valeur={formaterFCFA(entreesJour)}
            montantFcfa={entreesJour}
            icone={TrendingUp}
            couleur="#059669"
            sousTitre={loadingJournal ? "Chargement…" : `${mouvements.filter(m => m.type === "entree").length} opération${mouvements.filter(m => m.type === "entree").length > 1 ? "s" : ""}`}
          />
          <CarteKpi
            titre="Sorties du jour"
            valeur={formaterFCFA(sortiesJour)}
            montantFcfa={sortiesJour}
            icone={TrendingDown}
            couleur="#dc2626"
            sousTitre={loadingJournal ? "Chargement…" : `${mouvements.filter(m => m.type === "sortie").length} opération${mouvements.filter(m => m.type === "sortie").length > 1 ? "s" : ""}`}
          />
          <CarteKpi
            titre="Net du jour (caisse)"
            valeur={(netJour >= 0 ? "+" : "") + formaterFCFA(netJour)}
            montantFcfa={Math.abs(netJour)}
            icone={ArrowDownUp}
            couleur={netJour >= 0 ? "#0284c7" : "#d97706"}
            sousTitre={netJour >= 0 ? "Solde positif" : "Solde négatif"}
          />
          <CarteKpi
            titre="Avances du jour"
            valeur={nbAvancesJour > 0 ? `${nbAvancesJour} avance${nbAvancesJour > 1 ? "s" : ""}` : "Aucune"}
            icone={Banknote}
            couleur="#d97706"
            sousTitre={nbAvancesJour > 0 ? formaterFCFA(montantAvancesJour) : undefined}
          />
        </div>
      )}

      {/* ── Caisses ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Wallet size={14} className="text-pink-500" /> Caisses physiques
          </h2>
          <button onClick={() => navigate("/caisse")} className="text-xs text-pink-600 hover:text-pink-800 font-medium flex items-center gap-1">
            Gérer <ChevronRight size={13} />
          </button>
        </div>
        {loadingCaisses ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2].map(i => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-24" />)}
          </div>
        ) : caisses.length === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-800">Aucune caisse configurée. Contactez un administrateur.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {caisses.map(c => (
              <WidgetCaisse key={c.id} caisse={c} onNavigate={() => navigate("/caisse")} />
            ))}
          </div>
        )}
      </section>

      {/* ── Comptes Bancaires ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Building2 size={14} className="text-blue-500" /> Comptes bancaires
          </h2>
          <button onClick={() => navigate("/banque")} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
            Voir tout <ChevronRight size={13} />
          </button>
        </div>
        {loadingBanque ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2].map(i => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-20" />)}
          </div>
        ) : comptesBanque.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 text-center">
            Aucun compte bancaire enregistré
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {comptesBanque.filter(c => c.actif).map(c => (
              <WidgetBanque key={c.id} compte={c} onNavigate={() => navigate("/banque")} />
            ))}
          </div>
        )}
      </section>

      {/* ── Comptes Mobile Marchands ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <Smartphone size={14} className="text-indigo-500" /> Mobile Marchands
          </h2>
          <button onClick={() => navigate("/mobile-marchand")} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
            Voir tout <ChevronRight size={13} />
          </button>
        </div>
        {loadingMobile ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2].map(i => <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-20" />)}
          </div>
        ) : comptesMobile.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 text-center">
            Aucun compte mobile enregistré
          </div>
        ) : (
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {comptesMobile.filter(c => c.actif).map(c => (
              <WidgetMobile key={c.id} compte={c} onNavigate={() => navigate("/mobile-marchand")} />
            ))}
          </div>
        )}
      </section>

      {/* ── Mouvements du jour (caisse principale) ── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-2">
            <ArrowDownUp size={14} className="text-gray-400" /> Mouvements caisse du jour
          </h2>
          <button onClick={() => navigate("/caisse")} className="text-xs text-pink-600 hover:text-pink-800 font-medium flex items-center gap-1">
            Voir tout <ChevronRight size={13} />
          </button>
        </div>
        {loadingJournal ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse h-32" />
        ) : mouvements.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400">
            <Package size={28} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Aucun mouvement enregistré aujourd'hui</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Heure</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Motif</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Libellé</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Montant</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 hidden sm:table-cell">Solde après</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {mouvements.slice(0, 10).map((m) => {
                  const entree = m.type === "entree";
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {formaterHeure(m.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {entree
                            ? <TrendingUp size={13} className="text-emerald-500 flex-shrink-0" />
                            : <TrendingDown size={13} className="text-red-400 flex-shrink-0" />
                          }
                          <span className="text-gray-700">{MOTIF_LABELS[m.motif] ?? m.motif}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell max-w-[160px] truncate">
                        {m.libelle ?? "—"}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${entree ? "text-emerald-600" : "text-red-500"}`}>
                        {entree ? "+" : "−"}{formaterFCFA(parseFloat(m.montant_fcfa))}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-gray-400 hidden sm:table-cell">
                        {m.solde_apres_fcfa ? formaterFCFA(parseFloat(m.solde_apres_fcfa)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {mouvements.length > 10 && (
              <div className="px-4 py-3 border-t border-gray-100 text-center">
                <button onClick={() => navigate("/caisse")} className="text-sm text-pink-600 hover:text-pink-800 font-medium">
                  Voir les {mouvements.length - 10} autres mouvements →
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Infos complémentaires ── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <CarteKpi
            titre="Avances en cours"
            valeur={formaterFCFA(dashboard?.avancesEnCoursMontant ?? 0)}
            montantFcfa={dashboard?.avancesEnCoursMontant ?? 0}
            icone={Clock}
            couleur="#0891b2"
            badge={(dashboard?.avancesEnRetardNb ?? 0) > 0
              ? { texte: `${dashboard!.avancesEnRetardNb} en retard`, type: "warning" }
              : undefined}
          />
          <CarteKpi
            titre="Membres actifs"
            valeur={String(dashboard?.membresActifs ?? "—")}
            icone={Users}
            couleur="#15803d"
            sousTitre="dans la coopérative"
          />
          <CarteKpi
            titre="Sessions ouvertes"
            valeur={`${nbSessionsOuvertes} / ${caisses.length}`}
            icone={CheckCircle2}
            couleur="#059669"
            sousTitre={nbSessionsOuvertes > 0 ? "Caisse(s) active(s)" : "Aucune session active"}
          />
        </div>
      )}

      {/* ── Accès rapide ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Accès rapide</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { label: "Caisse",       href: "/caisse",          icon: Wallet,    color: "#be185d" },
            { label: "Banque",       href: "/banque",          icon: Building2, color: "#0284c7" },
            { label: "Mobile",       href: "/mobile-marchand", icon: Smartphone,color: "#7c3aed" },
            { label: "Avances",      href: "/avances",         icon: Banknote,  color: "#d97706" },
            { label: "Règlements",   href: "/reglements",      icon: CheckCircle2, color: "#059669" },
            { label: "Membres",      href: "/membres",         icon: Users,     color: "#0891b2" },
          ].map(({ label, href, icon: Icon, color }) => (
            <button
              key={href}
              onClick={() => navigate(href)}
              className="bg-white rounded-xl border border-gray-200 p-3 sm:p-4 flex flex-col items-center gap-2 hover:border-gray-300 hover:shadow-sm transition text-center"
            >
              <div className="rounded-lg p-2" style={{ backgroundColor: color + "18" }}>
                <Icon size={18} style={{ color }} />
              </div>
              <span className="text-xs sm:text-sm font-medium text-gray-700">{label}</span>
            </button>
          ))}
        </div>
      </section>

    </div>
  );
}

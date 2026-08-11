import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Banknote,
  AlertTriangle,
  TrendingUp,
  Package,
  LayoutDashboard,
  RefreshCw,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronRight,
  CalendarDays,
  Scale,
  UserPlus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { CarteKpi } from "@/components/CarteKpi";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function formaterFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}
function formaterKg(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(2) + " t";
  return n.toFixed(1) + " kg";
}
function formaterDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
function formaterHeure(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

interface PeseurCollecte {
  id: number;
  dateLivraison: string;
  poidsKg: number;
  montantNetFcfa: number;
  statutPaiement: string;
  membreNom: string;
  membrePrenoms: string;
  peseurId: number | null;
  peseurNom: string;
  peseurPrenoms: string;
}
interface PeseurInfo { id: number; nom: string; prenoms: string; actif: boolean; }
interface PeseursCollectesData {
  peseurs: PeseurInfo[];
  collectes: PeseurCollecte[];
  stats: { nbPeseurs: number; nbCollectes: number; tonnageKg: number; montantFcfa: number };
}

interface DashboardData {
  membresActifs: number;
  avancesEnCoursMontant: number;
  avancesEnRetardNb: number;
  tauxRemboursement: number;
  tonnageCampagne: number;
  tonnageMois: number;
  nombreSacsMois: number;
  nombreSacsCampagne: number;
  nbLivraisonsCampagne: number;
  campagne: { id: number; libelle: string; anneeDebut: number; anneeFin: number } | null;
  dernieresLivraisons: {
    id: number;
    poidsKg: string;
    montantNetFcfa: number;
    dateLivraison: string;
    nombreSacs: number | null;
    membreNom: string | null;
    membrePrenoms: string | null;
  }[];
}

interface CaisseRow {
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

type Preset = "mois" | "mois_prec" | "campagne" | "perso";

function getPeriodeParams(preset: Preset, persoDebut: string, persoFin: string): { dateDebut?: string; dateFin?: string; label: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0]!;
  if (preset === "mois") {
    const debut = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateDebut: fmt(debut), dateFin: fmt(today), label: "Ce mois" };
  }
  if (preset === "mois_prec") {
    const debut = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const fin   = new Date(today.getFullYear(), today.getMonth(), 0);
    return { dateDebut: fmt(debut), dateFin: fmt(fin), label: "Mois précédent" };
  }
  if (preset === "campagne") {
    return { dateDebut: undefined, dateFin: undefined, label: "Toute la campagne" };
  }
  return { dateDebut: persoDebut || undefined, dateFin: persoFin || undefined, label: "Période perso." };
}

function WidgetCaisse({ caisses, onNavigate }: { caisses: CaisseRow[]; onNavigate: () => void }) {
  if (!caisses.length) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
        <div className="rounded-lg p-2.5 bg-gray-100">
          <Wallet size={22} className="text-gray-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">Caisse</p>
          <p className="text-sm text-gray-400">Aucune caisse assignée</p>
        </div>
      </div>
    );
  }

  const caisse = caisses[0]!;
  const solde = parseInt(caisse.solde_actuel_fcfa, 10);
  const minimum = parseInt(caisse.fond_caisse_minimum_fcfa, 10);
  const sessionOuverte = caisse.session_statut === "ouverte";
  const soldeInsuffisant = solde < minimum;

  return (
    <div
      className="bg-white rounded-xl border border-gray-200 overflow-hidden cursor-pointer hover:border-amber-300 transition group"
      onClick={onNavigate}
    >
      <div className="px-5 py-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Wallet size={18} className="text-amber-600" />
          <span className="font-semibold text-gray-800">{caisse.nom}</span>
        </div>
        <ChevronRight size={16} className="text-gray-400 group-hover:text-amber-500 transition" />
      </div>

      <div className="px-5 py-4 grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-400 mb-0.5">Solde actuel</p>
          <p className={`text-lg font-bold ${soldeInsuffisant ? "text-red-600" : "text-gray-900"}`}>
            {formaterFCFA(solde)}
          </p>
          {soldeInsuffisant && (
            <p className="text-xs text-red-500 mt-0.5">
              En dessous du minimum ({formaterFCFA(minimum)})
            </p>
          )}
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-0.5">Session</p>
          <div className="flex items-center gap-1.5">
            {sessionOuverte ? (
              <>
                <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                <span className="text-sm font-semibold text-emerald-700">Ouverte</span>
              </>
            ) : (
              <>
                <XCircle size={15} className="text-gray-400 flex-shrink-0" />
                <span className="text-sm font-semibold text-gray-500">Fermée</span>
              </>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-0.5">
            {sessionOuverte ? "Ouverte à" : "Dernière ouverture"}
          </p>
          {caisse.heure_ouverture ? (
            <div className="flex items-center gap-1.5">
              <Clock size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">
                {formaterHeure(caisse.heure_ouverture)}
              </span>
            </div>
          ) : (
            <span className="text-sm text-gray-400">—</span>
          )}
        </div>
      </div>

      {minimum > 0 && (
        <div className="px-5 pb-4">
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div
              className={`h-1.5 rounded-full transition-all ${soldeInsuffisant ? "bg-red-400" : "bg-emerald-400"}`}
              style={{ width: `${Math.min(100, (solde / Math.max(minimum * 2, solde)) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Fond minimum : {formaterFCFA(minimum)}
          </p>
        </div>
      )}
    </div>
  );
}

export default function DashboardDelegue() {
  const { utilisateur } = useAuth();
  const [, navigate] = useLocation();

  const [preset, setPreset] = useState<Preset>("mois");
  const [persoDebut, setPersoDebut] = useState("");
  const [persoFin, setPersoFin]   = useState("");
  const [showPerso, setShowPerso] = useState(false);

  const { dateDebut, dateFin, label: periodeLabel } = useMemo(
    () => getPeriodeParams(preset, persoDebut, persoFin),
    [preset, persoDebut, persoFin],
  );

  const buildUrl = () => {
    const params = new URLSearchParams();
    if (dateDebut) params.set("dateDebut", dateDebut);
    if (dateFin)   params.set("dateFin",   dateFin);
    const qs = params.toString();
    return `/api/dashboard/delegue${qs ? `?${qs}` : ""}`;
  };

  const { data, isLoading, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["dashboard-delegue", dateDebut, dateFin],
    queryFn: () => apiFetch(buildUrl()),
    staleTime: 60_000,
  });

  const { data: caisses = [], isLoading: caisseLoading } = useQuery<CaisseRow[]>({
    queryKey: ["caisse-delegue"],
    queryFn: () => apiFetch("/api/caisse"),
    staleTime: 60_000,
  });

  // ── Filtres section peseurs ─────────────────────────────────────────────────
  const [peseurFilter, setPeseurFilter] = useState<number | "all">("all");
  const [peseursPreset, setPeseursPreset] = useState<Preset>("mois");
  const [peseursPersoDebut, setPeseursPersoDebut] = useState("");
  const [peseursPersoFin, setPeseursPersoFin]     = useState("");
  const [showPeseursPerso, setShowPeseursPerso]   = useState(false);

  const { dateDebut: peseursDateDebut, dateFin: peseursDateFin } = useMemo(
    () => getPeriodeParams(peseursPreset, peseursPersoDebut, peseursPersoFin),
    [peseursPreset, peseursPersoDebut, peseursPersoFin],
  );

  const buildPeseursUrl = () => {
    const p = new URLSearchParams();
    if (peseurFilter !== "all") p.set("agentId", String(peseurFilter));
    if (peseursDateDebut) p.set("dateDebut", peseursDateDebut);
    if (peseursDateFin)   p.set("dateFin",   peseursDateFin);
    const qs = p.toString();
    return `/api/dashboard/peseurs-collectes${qs ? `?${qs}` : ""}`;
  };

  const { data: peseursData, isLoading: peseursLoading } = useQuery<PeseursCollectesData>({
    queryKey: ["delegue-peseurs-collectes", peseurFilter, peseursDateDebut, peseursDateFin],
    queryFn: () => apiFetch(buildPeseursUrl()),
    staleTime: 60_000,
  });

  const prenom = utilisateur?.prenoms ?? utilisateur?.nom ?? "Délégué";

  const presets: { key: Preset; label: string }[] = [
    { key: "mois",      label: "Ce mois" },
    { key: "mois_prec", label: "Mois précédent" },
    { key: "campagne",  label: "Toute la campagne" },
    { key: "perso",     label: "Période perso." },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 rounded-xl p-2.5">
            <LayoutDashboard size={22} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Bonjour, {prenom} 👋</h1>
            {data?.campagne ? (
              <p className="text-sm text-gray-500">
                Campagne active : <span className="font-medium text-amber-700">{data.campagne.libelle}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-400">Aucune campagne active</p>
            )}
          </div>
        </div>

        {/* Sélecteur de période + Actualiser */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-1.5 items-center">
            {presets.map((p) => (
              <button
                key={p.key}
                onClick={() => { setPreset(p.key); setShowPerso(p.key === "perso"); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  preset === p.key
                    ? "bg-amber-600 text-white border-amber-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {p.key === "perso" && <CalendarDays size={11} />}
                {p.label}
              </button>
            ))}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 bg-white rounded-lg px-3 py-1.5 transition"
            >
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
              Actualiser
            </button>
          </div>
          {showPerso && (
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <input
                type="date"
                value={persoDebut}
                onChange={(e) => setPersoDebut(e.target.value)}
                className="text-xs border-0 outline-none text-gray-700"
              />
              <span className="text-gray-400 text-xs">→</span>
              <input
                type="date"
                value={persoFin}
                onChange={(e) => setPersoFin(e.target.value)}
                className="text-xs border-0 outline-none text-gray-700"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-24 sm:h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <CarteKpi
            titre="Membres actifs"
            valeur={String(data?.membresActifs ?? 0)}
            icone={Users}
            couleur="#10b981"
            sousTitre="sous votre responsabilité"
          />
          <CarteKpi
            titre="Avances en cours"
            valeur={formaterFCFA(data?.avancesEnCoursMontant ?? 0)}
            montantFcfa={data?.avancesEnCoursMontant ?? 0}
            icone={Banknote}
            couleur="#f59e0b"
            badge={
              (data?.avancesEnRetardNb ?? 0) > 0
                ? { texte: `${data!.avancesEnRetardNb} en retard`, type: "danger" }
                : { texte: "Aucun retard", type: "success" }
            }
          />
          <CarteKpi
            titre={`Tonnage · ${periodeLabel}`}
            valeur={formaterKg(data?.tonnageMois ?? 0)}
            icone={Package}
            couleur="#6366f1"
            sousTitre={
              (data?.nombreSacsMois ?? 0) > 0
                ? `${data!.nombreSacsMois} sacs`
                : periodeLabel
            }
          />
          <CarteKpi
            titre="Taux remboursement"
            valeur={`${data?.tauxRemboursement ?? 0}%`}
            icone={TrendingUp}
            couleur="#0ea5e9"
            badge={
              (data?.tauxRemboursement ?? 0) >= 80
                ? { texte: "Bon", type: "success" }
                : (data?.tauxRemboursement ?? 0) >= 50
                ? { texte: "Moyen", type: "warning" }
                : { texte: "Faible", type: "danger" }
            }
          />
        </div>
      )}

      {/* Tonnage campagne + Widget caisse */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {data?.campagne && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-amber-700 font-medium">Tonnage campagne {data.campagne.libelle}</p>
              <p className="text-2xl font-bold text-amber-900 mt-0.5">{formaterKg(data.tonnageCampagne)}</p>
              {(data.nombreSacsCampagne ?? 0) > 0 && (
                <p className="text-xs text-amber-600 mt-0.5">{data.nombreSacsCampagne} sacs</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm text-amber-700 font-medium">Livraisons</p>
              <p className="text-2xl font-bold text-amber-900 mt-0.5">{data.nbLivraisonsCampagne}</p>
            </div>
          </div>
        )}

        {caisseLoading ? (
          <div className="bg-gray-100 rounded-xl animate-pulse h-36" />
        ) : (
          <WidgetCaisse caisses={caisses} onNavigate={() => navigate("/caisse")} />
        )}
      </div>

      {/* Alerte retards */}
      {(data?.avancesEnRetardNb ?? 0) > 0 && (
        <div
          className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 cursor-pointer hover:bg-red-100 transition"
          onClick={() => navigate("/avances")}
        >
          <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {data!.avancesEnRetardNb} avance{data!.avancesEnRetardNb > 1 ? "s" : ""} en retard de remboursement
            </p>
            <p className="text-xs text-red-600">Cliquez pour voir les avances concernées</p>
          </div>
        </div>
      )}

      {/* Dernières livraisons */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">Dernières livraisons</h2>
          <button
            onClick={() => navigate("/livraisons")}
            className="text-sm text-amber-600 hover:text-amber-700 font-medium"
          >
            Voir tout →
          </button>
        </div>

        {isLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-5 py-3 h-14 animate-pulse bg-gray-50" />
            ))}
          </div>
        ) : !data?.dernieresLivraisons?.length ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">
            Aucune livraison enregistrée pour vos membres.
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {data.dernieresLivraisons.map((l) => (
              <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {l.membreNom ?? "—"} {l.membrePrenoms ?? ""}
                  </p>
                  <p className="text-xs text-gray-400">{formaterDate(l.dateLivraison)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-800">{formaterFCFA(l.montantNetFcfa)}</p>
                  <p className="text-xs text-gray-400">
                    {parseFloat(l.poidsKg).toFixed(1)} kg
                    {l.nombreSacs ? ` · ${l.nombreSacs} sacs` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Collectes de mes peseurs */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* En-tête */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale size={18} className="text-blue-600" />
            <h2 className="font-semibold text-gray-800">Collectes de mes peseurs</h2>
            {(peseursData?.stats?.nbPeseurs ?? 0) > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold">
                {peseursData!.stats!.nbPeseurs} peseur{peseursData!.stats!.nbPeseurs > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={() => navigate("/mes-peseurs")}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Gérer →
          </button>
        </div>

        {/* Barre de filtres (visible dès qu'il y a au moins un peseur) */}
        {(peseursData?.peseurs?.length ?? 0) > 0 && (
          <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center gap-2">
            {/* Sélecteur peseur */}
            <select
              value={peseurFilter === "all" ? "all" : String(peseurFilter)}
              onChange={(e) => setPeseurFilter(e.target.value === "all" ? "all" : parseInt(e.target.value, 10))}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 font-medium outline-none cursor-pointer"
            >
              <option value="all">Tous les peseurs</option>
              {peseursData!.peseurs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.prenoms} {p.nom}{!p.actif ? " (inactif)" : ""}
                </option>
              ))}
            </select>

            {/* Séparateur */}
            <span className="text-gray-300 text-xs">|</span>

            {/* Presets période */}
            {(["mois", "mois_prec", "campagne", "perso"] as Preset[]).map((pk) => (
              <button
                key={pk}
                onClick={() => { setPeseursPreset(pk); setShowPeseursPerso(pk === "perso"); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  peseursPreset === pk
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {pk === "perso" && <CalendarDays size={10} />}
                {{ mois: "Ce mois", mois_prec: "Mois préc.", campagne: "Campagne", perso: "Perso." }[pk]}
              </button>
            ))}

            {/* Champs date perso */}
            {showPeseursPerso && (
              <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
                <input
                  type="date" value={peseursPersoDebut}
                  onChange={(e) => setPeseursPersoDebut(e.target.value)}
                  className="text-xs border-0 outline-none text-gray-700"
                />
                <span className="text-gray-400 text-xs">→</span>
                <input
                  type="date" value={peseursPersoFin}
                  onChange={(e) => setPeseursPersoFin(e.target.value)}
                  className="text-xs border-0 outline-none text-gray-700"
                />
              </div>
            )}
          </div>
        )}

        {peseursLoading ? (
          <div className="divide-y divide-gray-50">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="px-5 py-3 h-14 animate-pulse bg-gray-50" />
            ))}
          </div>
        ) : !peseursData || !peseursData.stats || peseursData.peseurs.length === 0 ? (
          /* Aucun peseur créé */
          <div className="px-5 py-8 text-center">
            <Scale size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600 mb-1">Aucun peseur rattaché</p>
            <p className="text-xs text-gray-400 mb-4">
              Créez un peseur pour qu'il enregistre les collectes à votre place
            </p>
            <button
              onClick={() => navigate("/mes-peseurs")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition"
            >
              <UserPlus size={14} />
              Créer mon premier peseur
            </button>
          </div>
        ) : peseursData.collectes.length === 0 ? (
          /* Peseurs existants mais aucune collecte */
          <div className="px-5 py-6 text-center text-gray-400 text-sm">
            <p className="font-medium text-gray-600 mb-1">
              {peseursData.stats?.nbPeseurs ?? 0} peseur{(peseursData.stats?.nbPeseurs ?? 0) > 1 ? "s" : ""} actif{(peseursData.stats?.nbPeseurs ?? 0) > 1 ? "s" : ""}
            </p>
            Aucune collecte enregistrée pour le moment.
          </div>
        ) : (
          <>
            {/* Mini KPIs peseurs */}
            <div className="px-5 py-3 grid grid-cols-3 gap-3 bg-blue-50 border-b border-blue-100">
              <div className="text-center">
                <p className="text-xs text-blue-600 font-medium">Collectes</p>
                <p className="text-lg font-bold text-blue-900">{peseursData.stats.nbCollectes}</p>
              </div>
              <div className="text-center border-x border-blue-100">
                <p className="text-xs text-blue-600 font-medium">Tonnage</p>
                <p className="text-lg font-bold text-blue-900">
                  {peseursData.stats.tonnageKg >= 1000
                    ? (peseursData.stats.tonnageKg / 1000).toFixed(2) + " t"
                    : peseursData.stats.tonnageKg.toFixed(1) + " kg"}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-blue-600 font-medium">Montant net</p>
                <p className="text-lg font-bold text-blue-900">
                  {new Intl.NumberFormat("fr-FR").format(peseursData.stats.montantFcfa)}
                </p>
              </div>
            </div>

            {/* Liste des collectes */}
            <div className="divide-y divide-gray-50">
              {peseursData.collectes.map((c) => (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Badge peseur */}
                    <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold max-w-[90px] truncate" title={`${c.peseurPrenoms} ${c.peseurNom}`}>
                      <Scale size={10} />
                      {c.peseurPrenoms.split(" ")[0]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {c.membreNom} {c.membrePrenoms}
                      </p>
                      <p className="text-xs text-gray-400">{formaterDate(c.dateLivraison)}</p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-gray-800">
                      {new Intl.NumberFormat("fr-FR").format(c.montantNetFcfa)} F
                    </p>
                    <p className="text-xs text-gray-400">{c.poidsKg.toFixed(1)} kg</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Actions rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Nouvelle livraison", path: "/livraisons/nouvelle", color: "bg-amber-500" },
          { label: "Octroyer une avance", path: "/avances", color: "bg-indigo-500" },
          { label: "Mes membres", path: "/membres", color: "bg-emerald-500" },
        ].map((a) => (
          <button
            key={a.path}
            onClick={() => navigate(a.path)}
            className={`${a.color} text-white rounded-xl py-3 px-4 text-sm font-semibold hover:opacity-90 transition`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}

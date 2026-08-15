import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet } from "@/lib/api";
import {
  Truck, Fuel, MapPin, AlertTriangle, ChevronRight,
  ArrowRight, ClipboardList, History, Circle,
} from "lucide-react";
import BottomNavChauffeur from "@/components/BottomNavChauffeur";

/* ─── Types ─────────────────────────────────────────────────────────────── */

interface MissionResume {
  id: number;
  type_mission: string;
  lieu_depart: string;
  lieu_arrivee: string;
  date_depart: string;
  statut: string;
  immatriculation: string | null;
  marque: string | null;
}

interface BonResume {
  id: number;
  numero: string;
  type_carburant: string;
  quantite_autorisee: number;
  station_service: string | null;
  immatriculation: string | null;
}

interface AccueilData {
  missions_en_cours: MissionResume[];
  bons_en_attente: BonResume[];
  chauffeur_rattache: boolean;
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const TYPE_LABEL: Record<string, string> = {
  collecte: "Collecte",
  livraison_exportateur: "Livraison",
  mission_achat: "Achat",
  autre: "Autre",
};

const STATUT_COLOR: Record<string, string> = {
  planifiee: "text-blue-600",
  en_cours: "text-amber-600",
  terminee: "text-green-600",
  annulee: "text-red-500",
};

const STATUT_LABEL: Record<string, string> = {
  planifiee: "Planifiée",
  en_cours: "En cours",
  terminee: "Terminée",
  annulee: "Annulée",
};

function initials(prenoms?: string, nom?: string) {
  return ((prenoms ?? "")[0] ?? "") + ((nom ?? "")[0] ?? "");
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/* ─── Composant principal ────────────────────────────────────────────────── */

export default function AccueilChauffeur() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [data, setData] = useState<AccueilData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<AccueilData>("/chauffeur/accueil")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const heure = new Date().getHours();
  const salutation =
    heure < 12 ? "Bonjour" : heure < 18 ? "Bon après-midi" : "Bonsoir";

  const bons = data?.bons_en_attente ?? [];
  const missions = data?.missions_en_cours ?? [];
  const prochaineMission = missions[0] ?? null;
  const totalLitres = bons.reduce((s, b) => s + b.quantite_autorisee, 0);

  /* ── Compte non rattaché ── */
  if (!data?.chauffeur_rattache && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-28 flex flex-col">
        <Header salutation={salutation} user={user} missionCount={0} />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="h-9 w-9 text-amber-500" />
          </div>
          <div>
            <p className="text-gray-800 font-semibold text-lg">Compte non rattaché</p>
            <p className="text-gray-500 text-sm mt-1 leading-relaxed max-w-xs mx-auto">
              Votre compte n'est pas encore lié à un chauffeur de la flotte.
              Contactez votre responsable transport.
            </p>
          </div>
        </div>
        <BottomNavChauffeur />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* ── Header ── */}
      <Header salutation={salutation} user={user} missionCount={missions.length} loading={loading} />

      <div className="px-4 pt-3 space-y-4">

        {/* ── Section « Aujourd'hui » ── */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
            Aujourd'hui
          </p>

          {/* Prochaine mission */}
          {loading ? (
            <div className="h-36 bg-white rounded-2xl animate-pulse shadow-sm" />
          ) : prochaineMission ? (
            <NextMissionCard m={prochaineMission} onNavigate={() => navigate("/missions")} />
          ) : (
            <EmptyMissionCard onNavigate={() => navigate("/missions")} />
          )}
        </div>

        {/* ── Bons carburant en attente ── */}
        {bons.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                Bons carburant à utiliser
              </p>
              <button
                onClick={() => navigate("/carburant")}
                className="text-xs text-amber-600 font-medium flex items-center gap-0.5"
              >
                Voir <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-2">
              {bons.map((bon) => (
                <FuelVoucherCard
                  key={bon.id}
                  bon={bon}
                  onUse={() => navigate("/carburant")}
                  onStation={() => navigate(`/station/${encodeURIComponent(bon.numero)}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── Stats rapides ── */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
            Mon activité
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            <StatCard
              icon={<Truck className="h-5 w-5 text-green-700" />}
              value={loading ? "…" : String(missions.length)}
              label="Mission(s)"
              bg="bg-green-50"
            />
            <StatCard
              icon={<Fuel className="h-5 w-5 text-amber-600" />}
              value={loading ? "…" : `${totalLitres} L`}
              label="Carburant"
              bg="bg-amber-50"
            />
            <StatCard
              icon={<ClipboardList className="h-5 w-5 text-blue-600" />}
              value={loading ? "…" : String(bons.length)}
              label="Bon(s)"
              bg="bg-blue-50"
            />
          </div>
        </div>

        {/* ── Actions rapides ── */}
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">
            Actions rapides
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            <QuickAction
              icon={<Fuel className="h-5 w-5 text-amber-600" />}
              label="Bons carburant"
              sub="Gérer mes bons"
              color="bg-amber-50"
              onClick={() => navigate("/carburant")}
            />
            <QuickAction
              icon={<Truck className="h-5 w-5 text-green-700" />}
              label="Mes missions"
              sub="Voir toutes"
              color="bg-green-50"
              onClick={() => navigate("/missions")}
            />
            <QuickAction
              icon={<MapPin className="h-5 w-5 text-blue-600" />}
              label="Stations"
              sub="Trouver une station"
              color="bg-blue-50"
              onClick={() => navigate("/station")}
            />
            <QuickAction
              icon={<History className="h-5 w-5 text-purple-600" />}
              label="Historique"
              sub="Activité passée"
              color="bg-purple-50"
              onClick={() => navigate("/missions")}
            />
          </div>
        </div>

      </div>

      <BottomNavChauffeur />
    </div>
  );
}

/* ─── Sous-composants ────────────────────────────────────────────────────── */

function Header({
  salutation,
  user,
  missionCount,
  loading = false,
}: {
  salutation: string;
  user: { prenoms?: string; nom?: string } | null;
  missionCount: number;
  loading?: boolean;
}) {
  return (
    <div
      className="relative px-5 pt-12 pb-8"
      style={{ background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)" }}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Identité */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-base ring-2 ring-white/25 uppercase">
            {initials(user?.prenoms, user?.nom)}
          </div>
          <div>
            <p className="text-green-200 text-sm">{salutation} 👋</p>
            <h1 className="text-white font-bold text-xl leading-tight">
              {user?.prenoms} {user?.nom}
            </h1>
            <p className="text-green-300 text-xs">Chauffeur</p>
          </div>
        </div>
        {/* Statut + missions */}
        <div className="flex flex-col items-end gap-1.5 pt-1">
          <span className="flex items-center gap-1 bg-white/15 rounded-full px-2.5 py-1 text-xs text-white font-medium">
            <Circle className="h-2 w-2 fill-green-400 text-green-400" />
            Disponible
          </span>
          {!loading && (
            <span className="text-green-200 text-xs">
              {missionCount} mission{missionCount !== 1 ? "s" : ""} en cours
            </span>
          )}
        </div>
      </div>

      {/* Vague */}
      <svg
        className="absolute bottom-0 left-0 right-0 w-full"
        viewBox="0 0 375 28"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M0 28 C100 0 275 56 375 28 L375 28 L0 28Z" fill="#f8fafc" />
      </svg>
    </div>
  );
}

function NextMissionCard({
  m,
  onNavigate,
}: {
  m: { type_mission: string; lieu_depart: string; lieu_arrivee: string; date_depart: string; statut: string; immatriculation: string | null };
  onNavigate: () => void;
}) {
  const statutColor = STATUT_COLOR[m.statut] ?? "text-gray-500";
  const statutLabel = STATUT_LABEL[m.statut] ?? m.statut;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-green-600 to-emerald-500" />
      <div className="px-4 pt-3 pb-4">
        {/* Type + statut */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-green-50 flex items-center justify-center">
              <Truck className="h-4 w-4 text-green-700" />
            </div>
            <div>
              <p className="text-xs font-bold text-gray-800">Prochaine mission</p>
              <p className="text-xs text-gray-400">{TYPE_LABEL[m.type_mission] ?? m.type_mission}</p>
            </div>
          </div>
          <span className={`text-xs font-semibold ${statutColor}`}>{statutLabel}</span>
        </div>

        {/* Route */}
        <div className="bg-slate-50 rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 mb-0.5">Départ</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{m.lieu_depart}</p>
          </div>
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center">
            <ArrowRight className="h-3.5 w-3.5 text-green-700" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <p className="text-xs text-gray-400 mb-0.5">Arrivée</p>
            <p className="text-sm font-semibold text-gray-800 truncate">{m.lieu_arrivee}</p>
          </div>
        </div>

        {/* Date + véhicule */}
        <div className="flex items-center gap-3 text-xs text-gray-400 mb-3">
          <span>📅 {fmtDate(m.date_depart)}</span>
          {m.immatriculation && (
            <>
              <span className="text-gray-200">·</span>
              <span className="font-mono">{m.immatriculation}</span>
            </>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={onNavigate}
          className="w-full py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-1.5"
          style={{ backgroundColor: "#1a4731" }}
        >
          Voir la mission <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function EmptyMissionCard({ onNavigate }: { onNavigate: () => void }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <Truck className="h-5 w-5 text-slate-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-700">Aucune mission planifiée</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Vous n'avez aucune mission à effectuer aujourd'hui.
          </p>
        </div>
      </div>
      <button
        onClick={onNavigate}
        className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-colors"
      >
        Voir toutes mes missions <ChevronRight className="h-4 w-4 text-gray-400" />
      </button>
    </div>
  );
}

function FuelVoucherCard({
  bon,
  onUse,
  onStation,
}: {
  bon: BonResume;
  onUse: () => void;
  onStation: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <Fuel className="h-4 w-4 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p className="font-mono text-xs font-bold text-green-700 truncate">{bon.numero}</p>
            <p className="text-xs text-gray-600 truncate">
              {bon.immatriculation ?? "—"} ·{" "}
              <span className="font-semibold">{bon.quantite_autorisee} L</span>{" "}
              {bon.type_carburant}
            </p>
            {bon.station_service && (
              <p className="text-xs text-gray-400 truncate">{bon.station_service}</p>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <button
            onClick={onUse}
            className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold"
          >
            Utiliser
          </button>
          <button
            onClick={onStation}
            className="px-2.5 py-1.5 rounded-lg border border-amber-200 text-amber-700"
          >
            <MapPin className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
  bg,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  bg: string;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-3 py-3 flex flex-col items-center gap-1.5">
      <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
        {icon}
      </div>
      <p className="text-base font-bold text-gray-900 leading-none">{value}</p>
      <p className="text-[10px] text-gray-400 font-medium text-center leading-tight">{label}</p>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  sub,
  color,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm border border-gray-100 px-3.5 py-3.5 flex items-center gap-3 text-left active:scale-[0.98] transition-transform w-full"
    >
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-800 leading-tight">{label}</p>
        <p className="text-xs text-gray-400 truncate">{sub}</p>
      </div>
    </button>
  );
}

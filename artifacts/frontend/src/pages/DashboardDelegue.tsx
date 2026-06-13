import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Banknote,
  AlertTriangle,
  TrendingUp,
  Package,
  LayoutDashboard,
  RefreshCw,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const apiFetch = (url: string) =>
  fetch(`${BASE}${url}`, { headers: { Authorization: `Bearer ${tok()}` } }).then((r) => r.json());

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

interface DashboardData {
  membresActifs: number;
  avancesEnCoursMontant: number;
  avancesEnRetardNb: number;
  tauxRemboursement: number;
  tonnageCampagne: number;
  tonnageMois: number;
  nbLivraisonsCampagne: number;
  campagne: { id: number; libelle: string; anneeDebut: number; anneeFin: number } | null;
  dernieresLivraisons: {
    id: number;
    poidsKg: string;
    montantNetFcfa: number;
    dateLivraison: string;
    membreNom: string | null;
    membrePrenoms: string | null;
  }[];
}

function CarteKpi({
  titre,
  valeur,
  icone: Icone,
  couleur,
  sousTitre,
  badge,
}: {
  titre: string;
  valeur: string;
  icone: React.ElementType;
  couleur: string;
  sousTitre?: string;
  badge?: { texte: string; type: "danger" | "warning" | "success" };
}) {
  const badgeClasses = {
    danger: "bg-red-100 text-red-700",
    warning: "bg-amber-100 text-amber-700",
    success: "bg-emerald-100 text-emerald-700",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className="rounded-lg p-2.5 flex-shrink-0" style={{ backgroundColor: couleur + "18" }}>
        <Icone size={22} style={{ color: couleur }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-500 font-medium">{titre}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5 truncate">{valeur}</p>
        {sousTitre && <p className="text-xs text-gray-400 mt-0.5">{sousTitre}</p>}
        {badge && (
          <span className={`inline-block mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClasses[badge.type]}`}>
            {badge.texte}
          </span>
        )}
      </div>
    </div>
  );
}

export default function DashboardDelegue() {
  const { utilisateur } = useAuth();
  const [, navigate] = useLocation();

  const { data, isLoading, refetch, isFetching } = useQuery<DashboardData>({
    queryKey: ["dashboard-delegue"],
    queryFn: () => apiFetch("/api/dashboard/delegue"),
    staleTime: 60_000,
  });

  const prenom = utilisateur?.prenom ?? utilisateur?.nom ?? "Délégué";

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-4">
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
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 transition"
        >
          <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          Actualiser
        </button>
      </div>

      {/* KPI */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-gray-100 rounded-xl h-28 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            icone={Banknote}
            couleur="#f59e0b"
            badge={
              (data?.avancesEnRetardNb ?? 0) > 0
                ? { texte: `${data!.avancesEnRetardNb} en retard`, type: "danger" }
                : { texte: "Aucun retard", type: "success" }
            }
          />
          <CarteKpi
            titre="Tonnage du mois"
            valeur={formaterKg(data?.tonnageMois ?? 0)}
            icone={Package}
            couleur="#6366f1"
            sousTitre="ce mois-ci"
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

      {/* Tonnage campagne */}
      {data?.campagne && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-amber-700 font-medium">Tonnage campagne {data.campagne.libelle}</p>
            <p className="text-2xl font-bold text-amber-900 mt-0.5">{formaterKg(data.tonnageCampagne)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-amber-700 font-medium">Livraisons</p>
            <p className="text-2xl font-bold text-amber-900 mt-0.5">{data.nbLivraisonsCampagne}</p>
          </div>
        </div>
      )}

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
                  <p className="text-xs text-gray-400">{parseFloat(l.poidsKg).toFixed(1)} kg</p>
                </div>
              </div>
            ))}
          </div>
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

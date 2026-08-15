import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet } from "@/lib/api";
import { Truck, Fuel, MapPin, AlertTriangle, ChevronRight, ArrowRight } from "lucide-react";
import BottomNavChauffeur from "@/components/BottomNavChauffeur";

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

const STATUT_STYLE: Record<string, { label: string; dot: string; bar: string; text: string }> = {
  planifiee: { label: "Planifiée",  dot: "bg-blue-500",  bar: "bg-blue-500",  text: "text-blue-700"  },
  en_cours:  { label: "En cours",   dot: "bg-amber-500", bar: "bg-amber-500", text: "text-amber-700" },
  terminee:  { label: "Terminée",   dot: "bg-green-500", bar: "bg-green-500", text: "text-green-700" },
  annulee:   { label: "Annulée",    dot: "bg-red-400",   bar: "bg-red-400",   text: "text-red-600"  },
};

const TYPE_LABEL: Record<string, string> = {
  collecte: "Collecte", livraison_exportateur: "Livraison", mission_achat: "Achat", autre: "Autre",
};

function initials(prenoms?: string, nom?: string) {
  const p = (prenoms ?? "").trim()[0] ?? "";
  const n = (nom ?? "").trim()[0] ?? "";
  return (p + n).toUpperCase();
}

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
  const salutation = heure < 12 ? "Bonjour" : heure < 18 ? "Bon après-midi" : "Bonsoir";
  const bons = data?.bons_en_attente ?? [];
  const missions = data?.missions_en_cours ?? [];

  // Compte non rattaché
  if (!data?.chauffeur_rattache && !loading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-28 flex flex-col">
        {/* Header */}
        <div
          className="relative px-5 pt-12 pb-20"
          style={{ background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-base">
              {initials(user?.prenoms, user?.nom)}
            </div>
            <div>
              <p className="text-green-200 text-sm">{salutation}</p>
              <h1 className="text-white font-bold text-lg leading-tight">{user?.prenoms} {user?.nom}</h1>
              <p className="text-green-300 text-xs">Chauffeur</p>
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-4 -mt-10">
          <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="h-9 w-9 text-amber-500" />
          </div>
          <div>
            <h2 className="text-gray-800 font-semibold text-lg">Compte non rattaché</h2>
            <p className="text-gray-500 text-sm mt-1 leading-relaxed max-w-xs mx-auto">
              Votre compte n'est pas encore lié à un chauffeur de la flotte. Contactez votre responsable transport.
            </p>
          </div>
        </div>
        <BottomNavChauffeur />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* ─── Header avec vague ─── */}
      <div
        className="relative px-5 pt-12 pb-8"
        style={{ background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)" }}
      >
        {/* Avatar + identité */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-base ring-2 ring-white/30">
              {initials(user?.prenoms, user?.nom)}
            </div>
            <div>
              <p className="text-green-200 text-sm">{salutation} 👋</p>
              <h1 className="text-white font-bold text-xl leading-tight">{user?.prenoms} {user?.nom}</h1>
              <p className="text-green-300 text-xs">Chauffeur</p>
            </div>
          </div>
        </div>

        {/* Stat chips */}
        <div className="flex gap-2 mt-5">
          <div className="flex items-center gap-1.5 bg-white/15 rounded-xl px-3 py-2">
            <Truck className="h-3.5 w-3.5 text-white/80" />
            <span className="text-white text-sm font-semibold">{loading ? "…" : missions.length}</span>
            <span className="text-green-200 text-xs">mission{missions.length !== 1 ? "s" : ""}</span>
          </div>
          {bons.length > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-400/80 rounded-xl px-3 py-2">
              <Fuel className="h-3.5 w-3.5 text-white" />
              <span className="text-white text-sm font-semibold">{bons.length}</span>
              <span className="text-white/90 text-xs">bon{bons.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Vague décorative */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full"
          viewBox="0 0 375 28"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M0 28 C100 0 275 56 375 28 L375 28 L0 28Z" fill="#f8fafc" />
        </svg>
      </div>

      <div className="px-4 pt-4 space-y-5">

        {/* ─── Bons carburant en attente ─── */}
        {bons.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                <Fuel className="h-4 w-4 text-amber-500" />
                Bons carburant à utiliser
              </h2>
              <button
                onClick={() => navigate("/carburant")}
                className="text-xs text-amber-600 font-medium flex items-center gap-0.5"
              >
                Voir <ChevronRight className="h-3 w-3" />
              </button>
            </div>
            <div className="space-y-2.5">
              {bons.map(bon => (
                <div
                  key={bon.id}
                  className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden"
                >
                  <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-500" />
                  <div className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                        <Fuel className="h-4.5 w-4.5 text-amber-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-bold text-green-700 truncate">{bon.numero}</p>
                        <p className="text-xs text-gray-600 truncate">
                          {bon.immatriculation ?? "—"} · <span className="font-semibold">{bon.quantite_autorisee} L</span> {bon.type_carburant}
                        </p>
                        {bon.station_service && (
                          <p className="text-xs text-gray-400 truncate">{bon.station_service}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => navigate("/carburant")}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-semibold"
                      >
                        Utiliser
                      </button>
                      <button
                        onClick={() => navigate(`/station/${encodeURIComponent(bon.numero)}`)}
                        className="px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 text-xs font-medium flex items-center gap-0.5"
                      >
                        <MapPin className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Missions actives ─── */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-green-700" />
              Mes missions
            </h2>
            <button
              onClick={() => navigate("/missions")}
              className="text-xs text-green-700 font-medium flex items-center gap-0.5"
            >
              Tout voir <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {loading ? (
            <div className="space-y-2.5">
              {[1, 2].map(i => (
                <div key={i} className="h-24 bg-white rounded-2xl animate-pulse shadow-sm" />
              ))}
            </div>
          ) : missions.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-10 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
                <Truck className="h-6 w-6 text-slate-400" />
              </div>
              <div>
                <p className="text-gray-600 font-medium text-sm">Aucune mission planifiée</p>
                <p className="text-gray-400 text-xs mt-0.5">Vos prochaines missions apparaîtront ici</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {missions.map(m => {
                const s = STATUT_STYLE[m.statut] ?? { label: m.statut, dot: "bg-gray-400", bar: "bg-gray-400", text: "text-gray-600" };
                return (
                  <button
                    key={m.id}
                    className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden text-left active:scale-[0.99] transition-transform"
                    onClick={() => navigate("/missions")}
                  >
                    <div className={`h-1 w-full ${s.bar}`} />
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          {/* Statut + type */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold ${s.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${s.dot} flex-shrink-0`} />
                              {s.label}
                            </span>
                            <span className="text-xs text-gray-400">{TYPE_LABEL[m.type_mission] ?? m.type_mission}</span>
                          </div>
                          {/* Route */}
                          <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                            <span className="truncate max-w-[100px]">{m.lieu_depart}</span>
                            <ArrowRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate max-w-[100px]">{m.lieu_arrivee}</span>
                          </div>
                          {/* Véhicule + date */}
                          <p className="text-xs text-gray-400 mt-1 font-mono">
                            {m.immatriculation ?? "—"} · {new Date(m.date_depart).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <BottomNavChauffeur />
    </div>
  );
}

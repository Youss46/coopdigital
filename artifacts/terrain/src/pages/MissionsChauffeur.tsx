import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Truck, MapPin, Calendar, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";
import BottomNavChauffeur from "@/components/BottomNavChauffeur";

interface Mission {
  id: number;
  type_mission: string;
  lieu_depart: string;
  lieu_arrivee: string;
  date_depart: string;
  date_arrivee_prevue: string | null;
  date_arrivee_reelle: string | null;
  statut: string;
  zone_collecte: string | null;
  section: string | null;
  observations: string | null;
  cout_fcfa: number | null;
  immatriculation: string | null;
  marque: string | null;
  modele: string | null;
}

const STATUT: Record<string, { label: string; dot: string; bar: string; text: string; pill: string }> = {
  planifiee: { label: "Planifiée",  dot: "bg-blue-500",  bar: "bg-blue-500",  text: "text-blue-700",  pill: "bg-blue-50 text-blue-700 ring-blue-200"   },
  en_cours:  { label: "En cours",   dot: "bg-amber-500", bar: "bg-amber-500", text: "text-amber-700", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  terminee:  { label: "Terminée",   dot: "bg-green-500", bar: "bg-green-500", text: "text-green-700", pill: "bg-green-50 text-green-700 ring-green-200" },
  annulee:   { label: "Annulée",    dot: "bg-red-400",   bar: "bg-red-400",   text: "text-red-600",  pill: "bg-red-50 text-red-600 ring-red-200"      },
};

const TYPE: Record<string, string> = {
  collecte: "Collecte", livraison_exportateur: "Livraison exportateur",
  mission_achat: "Mission achat", autre: "Autre",
};

const FILTERS = [
  { value: "all",       label: "Toutes"    },
  { value: "planifiee", label: "Planifiée" },
  { value: "en_cours",  label: "En cours"  },
  { value: "terminee",  label: "Terminée"  },
  { value: "annulee",   label: "Annulée"   },
];

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtShort(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}
function formatFcfa(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR") + " FCFA";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-gray-400 text-xs flex-shrink-0">{label}</span>
      <span className="text-gray-700 text-xs text-right font-medium">{value}</span>
    </div>
  );
}

export default function MissionsChauffeur() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const qs = filter !== "all" ? `?statut=${filter}` : "";
    setLoading(true);
    apiGet<{ missions: Mission[] }>(`/chauffeur/missions${qs}`)
      .then(r => setMissions(r.missions))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* ─── Header ─── */}
      <div
        className="relative px-5 pt-12 pb-8"
        style={{ background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)" }}
      >
        <h1 className="text-white font-bold text-xl flex items-center gap-2">
          <Truck className="h-5 w-5 text-green-300" />
          Mes missions
        </h1>
        <p className="text-green-300 text-xs mt-0.5">
          {loading ? "…" : missions.length} mission{missions.length !== 1 ? "s" : ""} trouvée{missions.length !== 1 ? "s" : ""}
        </p>
        <svg
          className="absolute bottom-0 left-0 right-0 w-full"
          viewBox="0 0 375 28"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M0 28 C100 0 275 56 375 28 L375 28 L0 28Z" fill="#f8fafc" />
        </svg>
      </div>

      {/* ─── Filtres chips ─── */}
      <div className="px-4 pt-4 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
              filter === f.value
                ? "text-white shadow-sm"
                : "bg-white text-gray-500 border border-gray-200"
            }`}
            style={filter === f.value ? { backgroundColor: "#1a4731" } : {}}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ─── Liste ─── */}
      <div className="px-4 pt-3 space-y-2.5">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-white rounded-2xl animate-pulse shadow-sm" />
          ))
        ) : missions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-6 py-12 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
              <Truck className="h-7 w-7 text-slate-400" />
            </div>
            <div>
              <p className="text-gray-600 font-medium text-sm">Aucune mission trouvée</p>
              <p className="text-gray-400 text-xs mt-0.5">Essayez un autre filtre</p>
            </div>
          </div>
        ) : (
          missions.map(m => {
            const s = STATUT[m.statut] ?? { label: m.statut, dot: "bg-gray-400", bar: "bg-gray-400", text: "text-gray-600", pill: "bg-gray-50 text-gray-600 ring-gray-200" };
            const open = expanded === m.id;
            return (
              <div
                key={m.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              >
                {/* Barre colorée statut */}
                <div className={`h-1 ${s.bar}`} />

                <button
                  className="w-full text-left px-4 py-3"
                  onClick={() => setExpanded(open ? null : m.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Pill statut + type */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${s.pill}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                        <span className="text-xs text-gray-400 truncate">{TYPE[m.type_mission] ?? m.type_mission}</span>
                      </div>
                      {/* Route */}
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                        <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                        <span className="truncate max-w-[110px]">{m.lieu_depart}</span>
                        <ArrowRight className="h-3 w-3 text-gray-300 flex-shrink-0" />
                        <span className="truncate max-w-[110px]">{m.lieu_arrivee}</span>
                      </div>
                      {/* Véhicule + date */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="font-mono text-xs text-gray-400">{m.immatriculation ?? "—"}</span>
                        <span className="text-gray-300">·</span>
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-400">{fmtShort(m.date_depart)}</span>
                      </div>
                    </div>
                    {open
                      ? <ChevronUp className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
                      : <ChevronDown className="h-4 w-4 text-gray-300 flex-shrink-0 mt-1" />
                    }
                  </div>
                </button>

                {/* Détails dépliables */}
                {open && (
                  <div className="px-4 pb-4 pt-1 border-t border-gray-50 space-y-2">
                    <DetailRow label="Véhicule" value={[m.immatriculation, m.marque, m.modele].filter(Boolean).join(" ") || "—"} />
                    {m.zone_collecte && <DetailRow label="Zone" value={m.zone_collecte} />}
                    {m.section && <DetailRow label="Section" value={m.section} />}
                    <DetailRow label="Départ prévu" value={fmt(m.date_depart)} />
                    {m.date_arrivee_prevue && <DetailRow label="Arrivée prévue" value={fmt(m.date_arrivee_prevue)} />}
                    {m.date_arrivee_reelle && <DetailRow label="Arrivée réelle" value={fmt(m.date_arrivee_reelle)} />}
                    {m.cout_fcfa != null && (
                      <div className="flex items-start justify-between gap-3 pt-1 border-t border-gray-50">
                        <span className="text-gray-400 text-xs">Coût mission</span>
                        <span className="text-green-700 text-xs font-bold">{formatFcfa(m.cout_fcfa)}</span>
                      </div>
                    )}
                    {m.observations && (
                      <div className="mt-2 bg-gray-50 rounded-xl px-3 py-2">
                        <p className="text-xs text-gray-400 mb-0.5">Observations</p>
                        <p className="text-xs text-gray-600 italic leading-relaxed">{m.observations}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <BottomNavChauffeur />
    </div>
  );
}

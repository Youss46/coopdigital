import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Truck, MapPin, Calendar, ChevronDown, ChevronUp } from "lucide-react";
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

const STATUT: Record<string, { label: string; color: string }> = {
  planifiee: { label: "Planifiée",  color: "bg-blue-100 text-blue-800" },
  en_cours:  { label: "En cours",   color: "bg-amber-100 text-amber-800" },
  terminee:  { label: "Terminée",   color: "bg-green-100 text-green-800" },
  annulee:   { label: "Annulée",    color: "bg-red-100 text-red-800" },
};

const TYPE: Record<string, string> = {
  collecte: "Collecte", livraison_exportateur: "Livraison exportateur",
  mission_achat: "Mission achat", autre: "Autre",
};

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatFcfa(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR") + " FCFA";
}

export default function MissionsChauffeur() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filterStatut, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    const qs = filterStatut !== "all" ? `?statut=${filterStatut}` : "";
    setLoading(true);
    apiGet<{ missions: Mission[] }>(`/chauffeur/missions${qs}`)
      .then(r => setMissions(r.missions))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filterStatut]);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <header className="bg-green-700 text-white px-4 py-4">
        <h1 className="text-lg font-bold flex items-center gap-2"><Truck className="h-5 w-5" /> Mes missions</h1>
      </header>

      <div className="p-4 space-y-4">
        {/* Filtre statut */}
        <Select value={filterStatut} onValueChange={setFilter}>
          <SelectTrigger className="h-9 text-sm bg-white">
            <SelectValue placeholder="Tous les statuts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            {Object.entries(STATUT).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse" />)}</div>
        ) : missions.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Aucune mission trouvée</p>
          </div>
        ) : (
          <div className="space-y-3">
            {missions.map(m => {
              const s = STATUT[m.statut] ?? { label: m.statut, color: "bg-gray-100 text-gray-700" };
              const open = expanded === m.id;
              return (
                <Card key={m.id} className="overflow-hidden">
                  <CardContent
                    className="p-3 cursor-pointer"
                    onClick={() => setExpanded(open ? null : m.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`${s.color} text-xs`}>{s.label}</Badge>
                          <span className="text-xs text-gray-500">{TYPE[m.type_mission] ?? m.type_mission}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm font-medium">
                          <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{m.lieu_depart}</span>
                          <span className="text-gray-400 mx-1">→</span>
                          <span className="truncate">{m.lieu_arrivee}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                          <span className="font-mono">{m.immatriculation ?? "—"}</span>
                          <span>·</span>
                          <Calendar className="h-3 w-3" />
                          <span>{fmt(m.date_depart)}</span>
                        </div>
                      </div>
                      {open ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                             : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />}
                    </div>

                    {open && (
                      <div className="mt-3 pt-3 border-t space-y-1.5 text-xs text-gray-600">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Véhicule</span>
                          <span>{m.immatriculation ?? "—"} {m.marque ?? ""} {m.modele ?? ""}</span>
                        </div>
                        {m.zone_collecte && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Zone</span>
                            <span>{m.zone_collecte}</span>
                          </div>
                        )}
                        {m.section && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Section</span>
                            <span>{m.section}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-400">Départ prévu</span>
                          <span>{fmt(m.date_depart)}</span>
                        </div>
                        {m.date_arrivee_prevue && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Arrivée prévue</span>
                            <span>{fmt(m.date_arrivee_prevue)}</span>
                          </div>
                        )}
                        {m.date_arrivee_reelle && (
                          <div className="flex justify-between">
                            <span className="text-gray-400">Arrivée réelle</span>
                            <span>{fmt(m.date_arrivee_reelle)}</span>
                          </div>
                        )}
                        {m.cout_fcfa != null && (
                          <div className="flex justify-between font-semibold">
                            <span className="text-gray-400">Coût mission</span>
                            <span>{formatFcfa(m.cout_fcfa)}</span>
                          </div>
                        )}
                        {m.observations && (
                          <div>
                            <span className="text-gray-400">Observations : </span>
                            <span className="italic">{m.observations}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <BottomNavChauffeur />
    </div>
  );
}

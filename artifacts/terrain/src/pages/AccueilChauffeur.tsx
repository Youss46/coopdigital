import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiGet, apiPut } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Truck, Fuel, MapPin, AlertTriangle, ChevronRight, CheckCircle2 } from "lucide-react";
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

const STATUT_MISSION: Record<string, { label: string; color: string }> = {
  planifiee: { label: "Planifiée",  color: "bg-blue-100 text-blue-800" },
  en_cours:  { label: "En cours",   color: "bg-amber-100 text-amber-800" },
  terminee:  { label: "Terminée",   color: "bg-green-100 text-green-800" },
  annulee:   { label: "Annulée",    color: "bg-red-100 text-red-800" },
};

function typeLabel(t: string) {
  const m: Record<string, string> = {
    collecte: "Collecte", livraison_exportateur: "Livraison", mission_achat: "Achat", autre: "Autre",
  };
  return m[t] ?? t;
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

  if (!data?.chauffeur_rattache && !loading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <header className="bg-green-700 text-white px-4 py-5">
          <p className="text-green-200 text-sm">{salutation}</p>
          <h1 className="text-xl font-bold">{user?.prenoms} {user?.nom}</h1>
          <p className="text-green-200 text-xs mt-0.5">Chauffeur</p>
        </header>
        <div className="p-4 flex flex-col items-center text-center mt-16 gap-4">
          <AlertTriangle className="h-16 w-16 text-amber-400" />
          <h2 className="text-lg font-semibold text-gray-700">Compte non rattaché</h2>
          <p className="text-gray-500 text-sm max-w-xs">
            Votre compte n'est pas encore lié à un chauffeur de la flotte.
            Contactez votre responsable transport.
          </p>
        </div>
        <BottomNavChauffeur />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-green-700 text-white px-4 py-5">
        <p className="text-green-200 text-sm">{salutation}</p>
        <h1 className="text-xl font-bold">{user?.prenoms} {user?.nom}</h1>
        <p className="text-green-200 text-xs mt-0.5">Chauffeur</p>
      </header>

      <div className="p-4 space-y-4">
        {/* Bons carburant approuvés */}
        {(data?.bons_en_attente ?? []).length > 0 && (
          <Card className="border-amber-300 bg-amber-50">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-800">
                <Fuel className="h-4 w-4" />
                {data!.bons_en_attente.length} bon{data!.bons_en_attente.length > 1 ? "s" : ""} carburant approuvé{data!.bons_en_attente.length > 1 ? "s" : ""} en attente
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              {data!.bons_en_attente.map(bon => (
                <div key={bon.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold text-green-700">{bon.numero}</p>
                    <p className="text-xs text-gray-600">{bon.immatriculation ?? "—"} · {bon.quantite_autorisee} L {bon.type_carburant}</p>
                    {bon.station_service && <p className="text-xs text-gray-400">{bon.station_service}</p>}
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" className="h-8 text-xs bg-amber-600 hover:bg-amber-700"
                      onClick={() => navigate("/carburant")}>
                      Utiliser
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs border-amber-400 text-amber-700"
                      onClick={() => navigate(`/station/${encodeURIComponent(bon.numero)}`)}>
                      Station →
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Missions actives */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-green-700" /> Mes missions
            </h2>
            <Button variant="ghost" size="sm" className="text-xs text-green-700 h-7" onClick={() => navigate("/missions")}>
              Tout voir <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
          {loading ? (
            <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}</div>
          ) : data?.missions_en_cours.length === 0 ? (
            <Card className="p-6 text-center">
              <CheckCircle2 className="h-10 w-10 mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">Aucune mission planifiée</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {data!.missions_en_cours.map(m => {
                const s = STATUT_MISSION[m.statut] ?? { label: m.statut, color: "bg-gray-100 text-gray-700" };
                return (
                  <Card key={m.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/missions")}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={`${s.color} text-xs`}>{s.label}</Badge>
                            <span className="text-xs text-gray-500">{typeLabel(m.type_mission)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <MapPin className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate font-medium">{m.lieu_depart}</span>
                            <span className="text-gray-400 mx-1">→</span>
                            <span className="truncate">{m.lieu_arrivee}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {m.immatriculation ?? "—"} · {new Date(m.date_depart).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <BottomNavChauffeur />
    </div>
  );
}

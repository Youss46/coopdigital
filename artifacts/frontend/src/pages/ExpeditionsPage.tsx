import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Ship, Plus, Truck, AlertTriangle, CheckCircle2, Clock,
  Package, MapPin, Filter, RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface ExpeditionRow {
  id: number;
  numeroExpedition: string;
  statut: string;
  typeVehicule: string;
  immatriculation?: string;
  nomChauffeur?: string;
  transporteur?: string;
  port: string;
  dateDepart?: string;
  poidsChargeKg?: string;
  nombreSacs?: number;
  poidsRecuPortKg?: string;
  ecartPoidsKg?: string;
  exportateurNom?: string;
  nbLots: number;
}

interface Stats {
  enCours: number;
  receptionnes: number;
  litiges: number;
}

const STATUT_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  en_preparation: { label: "En préparation", color: "bg-gray-100 text-gray-700", icon: <Clock className="h-3 w-3" /> },
  charge:         { label: "Chargé",          color: "bg-blue-100 text-blue-700",  icon: <Package className="h-3 w-3" /> },
  en_transit:     { label: "En transit",       color: "bg-orange-100 text-orange-700", icon: <Truck className="h-3 w-3" /> },
  arrive_port:    { label: "Arrivé au port",   color: "bg-purple-100 text-purple-700", icon: <MapPin className="h-3 w-3" /> },
  receptionne:    { label: "Réceptionné ✅",   color: "bg-green-100 text-green-700", icon: <CheckCircle2 className="h-3 w-3" /> },
  litige:         { label: "Litige ⚠️",        color: "bg-red-100 text-red-700",   icon: <AlertTriangle className="h-3 w-3" /> },
};

export default function ExpeditionsPage() {
  const { token } = useAuth();
  const [filtreStatut, setFiltreStatut] = useState("tous");
  const [filtrePort, setFiltrePort] = useState("tous");
  const [filtreType, setFiltreType] = useState("tous");

  const params = new URLSearchParams();
  if (filtreStatut !== "tous") params.set("statut", filtreStatut);
  if (filtrePort !== "tous") params.set("port", filtrePort);
  if (filtreType !== "tous") params.set("type_vehicule", filtreType);

  const queryString = params.toString();

  const { data: expeditions = [], isLoading, refetch } = useQuery<ExpeditionRow[]>({
    queryKey: ["expeditions", filtreStatut, filtrePort, filtreType],
    queryFn: () => apiFetch(`/api/expeditions${queryString ? `?${queryString}` : ""}`, token),
  });

  const { data: stats } = useQuery<Stats>({
    queryKey: ["expeditions-stats"],
    queryFn: () => apiFetch("/api/expeditions/stats", token),
  });

  const formatPoids = (kg?: string) => {
    if (!kg) return "—";
    return `${parseFloat(kg).toLocaleString("fr-FR")} kg`;
  };

  const formatDate = (d?: string) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const getEcartLabel = (ecart?: string, charge?: string) => {
    if (!ecart || !charge) return null;
    const e = parseFloat(ecart);
    const c = parseFloat(charge);
    if (c === 0) return null;
    const pct = Math.abs(e) / c * 100;
    const couleur = pct <= 0.5 ? "text-green-600" : pct <= 2 ? "text-orange-600" : "text-red-600";
    return <span className={`text-xs font-medium ${couleur}`}>{e > 0 ? "-" : "+"}{Math.abs(e).toFixed(0)} kg ({pct.toFixed(2)}%)</span>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-green-100 rounded-lg">
            <Ship className="h-6 w-6 text-green-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Expéditions port</h1>
            <p className="text-sm text-gray-500">Suivi des expéditions de cacao vers le port</p>
          </div>
        </div>
        <Link href="/expeditions/nouvelle">
          <Button className="bg-green-700 hover:bg-green-800 gap-2">
            <Plus className="h-4 w-4" />
            Nouvelle expédition
          </Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="p-4 flex items-center gap-3">
            <Truck className="h-8 w-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-blue-700">{stats?.enCours ?? "—"}</p>
              <p className="text-xs text-blue-600">En cours ce mois</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-700">{stats?.receptionnes ?? "—"}</p>
              <p className="text-xs text-green-600">Réceptionnées</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-600" />
            <div>
              <p className="text-2xl font-bold text-red-700">{stats?.litiges ?? "—"}</p>
              <p className="text-xs text-red-600">Litiges ⚠️</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtres */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Filter className="h-4 w-4 text-gray-500" />
            <Select value={filtreStatut} onValueChange={setFiltreStatut}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les statuts</SelectItem>
                <SelectItem value="en_preparation">En préparation</SelectItem>
                <SelectItem value="charge">Chargé</SelectItem>
                <SelectItem value="en_transit">En transit</SelectItem>
                <SelectItem value="arrive_port">Arrivé au port</SelectItem>
                <SelectItem value="receptionne">Réceptionné</SelectItem>
                <SelectItem value="litige">Litige</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtrePort} onValueChange={setFiltrePort}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Tous les ports" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous les ports</SelectItem>
                <SelectItem value="Abidjan">Abidjan</SelectItem>
                <SelectItem value="San Pedro">San Pedro</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtreType} onValueChange={setFiltreType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Type véhicule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tous">Tous types</SelectItem>
                <SelectItem value="propre">Camion propre</SelectItem>
                <SelectItem value="location">Location</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1 ml-auto">
              <RefreshCw className="h-3 w-3" /> Actualiser
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tableau */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {expeditions.length} expédition{expeditions.length !== 1 ? "s" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-12 text-gray-500">Chargement…</div>
          ) : expeditions.length === 0 ? (
            <div className="text-center py-12">
              <Ship className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Aucune expédition</p>
              <p className="text-xs text-gray-400 mt-1">Créez votre première expédition vers le port</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">N° Expédition</th>
                    <th className="px-4 py-3 text-left">Date départ</th>
                    <th className="px-4 py-3 text-left">Véhicule</th>
                    <th className="px-4 py-3 text-right">Poids chargé</th>
                    <th className="px-4 py-3 text-left">Port</th>
                    <th className="px-4 py-3 text-left">Statut</th>
                    <th className="px-4 py-3 text-right">Écart</th>
                    <th className="px-4 py-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {expeditions.map((exp) => {
                    const cfg = STATUT_CONFIG[exp.statut] ?? { label: exp.statut, color: "bg-gray-100 text-gray-700", icon: null };
                    return (
                      <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-mono font-semibold text-green-700">{exp.numeroExpedition}</div>
                          <div className="text-xs text-gray-500">{exp.nbLots} lot{exp.nbLots !== 1 ? "s" : ""}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatDate(exp.dateDepart)}</td>
                        <td className="px-4 py-3">
                          <div>{exp.immatriculation ?? exp.transporteur ?? "—"}</div>
                          <div className="text-xs text-gray-400">
                            {exp.typeVehicule === "propre" ? "🚛 Propre" : "🔑 Location"}
                            {exp.nomChauffeur ? ` · ${exp.nomChauffeur}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium">{formatPoids(exp.poidsChargeKg)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-gray-400" />
                            {exp.port}
                          </div>
                          {exp.exportateurNom && <div className="text-xs text-gray-400">{exp.exportateurNom}</div>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {getEcartLabel(exp.ecartPoidsKg, exp.poidsChargeKg) ?? <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link href={`/expeditions/${exp.id}`}>
                            <Button variant="ghost" size="sm" className="text-green-700 hover:text-green-900">
                              Voir →
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

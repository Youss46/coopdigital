import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Ship, MapPin, CheckCircle2,
  ChevronRight, FileText, Users, Leaf, AlertCircle,
  Plus, Unlink, Link, Download, Clock
} from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPut<T>(path: string, token: string | null, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})) as { erreur?: string }; throw new Error(err.erreur ?? `HTTP ${res.status}`); }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, token: string | null, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})) as { erreur?: string }; throw new Error(err.erreur ?? `HTTP ${res.status}`); }
  return res.json() as Promise<T>;
}

async function apiDelete(path: string, token: string | null): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) { const err = await res.json().catch(() => ({})) as { erreur?: string }; throw new Error(err.erreur ?? `HTTP ${res.status}`); }
}

interface LotDisponible {
  id: number;
  statut: string;
  poidsTotalKg: string;
  entrepot?: string;
  dateCreation: string;
  qrCodeLot: string;
}

const STATUT_CONFIG: Record<string, { label: string; color: string; step: number }> = {
  en_preparation: { label: "En préparation", color: "text-gray-600",   step: 0 },
  charge:         { label: "Chargé",          color: "text-blue-600",   step: 1 },
  en_transit:     { label: "En transit",       color: "text-orange-600", step: 2 },
  arrive_port:    { label: "Arrivé au port",   color: "text-purple-600", step: 3 },
  receptionne:    { label: "Réceptionné ✅",   color: "text-green-600",  step: 4 },
  litige:         { label: "Litige ⚠️",        color: "text-red-600",    step: 4 },
};

const TRANSITIONS: Record<string, { label: string; next: string }> = {
  en_preparation: { label: "Confirmer le chargement →",  next: "charge" },
  charge:         { label: "Marquer en transit →",        next: "en_transit" },
  en_transit:     { label: "Confirmer arrivée au port →", next: "arrive_port" },
  arrive_port:    { label: "Saisir la réception port →",  next: "reception" },
};

const MOTIFS_ECART = [
  { value: "evaporation", label: "Évaporation naturelle" },
  { value: "vol",         label: "Vol" },
  { value: "erreur_pesee", label: "Erreur de pesée" },
  { value: "avarie",      label: "Avarie" },
  { value: "autre",       label: "Autre" },
];

export default function ExpeditionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [showReception, setShowReception] = useState(false);
  const [showLotsPanel, setShowLotsPanel] = useState(false);
  const [downloadingBL, setDownloadingBL] = useState(false);
  const [downloadingEudr, setDownloadingEudr] = useState(false);
  const [downloadingConstat, setDownloadingConstat] = useState(false);
  const [poidsRecu, setPoidsRecu] = useState("");
  const [nombreSacsRecu, setNombreSacsRecu] = useState("");
  const [recepisse, setRecepisse] = useState("");
  const [receptionnaire, setReceptionnaire] = useState("");
  const [motifEcart, setMotifEcart] = useState("");
  const [fraisTransport, setFraisTransport] = useState("");
  const [notes, setNotes] = useState("");
  const [hasRefoulement, setHasRefoulement] = useState(false);
  const [poidsRefoul, setPoidsRefoul] = useState("");
  const [nombreSacsRefoul, setNombreSacsRefoul] = useState("");
  const [motifRefoulement, setMotifRefoulement] = useState("");

  const { data: exp, isLoading } = useQuery<Record<string, any>>({
    queryKey: ["expedition", id],
    queryFn: () => apiFetch(`/api/expeditions/${id}`, token),
    enabled: !!id,
  });

  const { data: lotsDisponibles = [], isLoading: lotsLoading } = useQuery<LotDisponible[]>({
    queryKey: ["expedition-lots-dispo", id],
    queryFn: () => apiFetch(`/api/expeditions/${id}/lots-disponibles`, token),
    enabled: !!id && showLotsPanel,
  });

  const rattacherMutation = useMutation({
    mutationFn: (lotId: number) => apiPost(`/api/expeditions/${id}/lots`, token, { lotId }),
    onSuccess: () => {
      toast({ title: "Lot rattaché" });
      void qc.invalidateQueries({ queryKey: ["expedition", id] });
      void qc.invalidateQueries({ queryKey: ["expedition-lots-dispo", id] });
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const detacherMutation = useMutation({
    mutationFn: (lotRowId: number) => apiDelete(`/api/expeditions/${id}/lots/${lotRowId}`, token),
    onSuccess: () => {
      toast({ title: "Lot détaché" });
      void qc.invalidateQueries({ queryKey: ["expedition", id] });
      void qc.invalidateQueries({ queryKey: ["expedition-lots-dispo", id] });
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const statutMutation = useMutation({
    mutationFn: ({ statut, notes: n }: { statut: string; notes?: string }) =>
      apiPut(`/api/expeditions/${id}/statut`, token, { statut, notes: n }),
    onSuccess: () => {
      toast({ title: "Statut mis à jour" });
      void qc.invalidateQueries({ queryKey: ["expedition", id] });
      void qc.invalidateQueries({ queryKey: ["expeditions"] });
      void qc.invalidateQueries({ queryKey: ["expeditions-stats"] });
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  const receptionMutation = useMutation({
    mutationFn: (body: unknown) => apiPut(`/api/expeditions/${id}/reception`, token, body),
    onSuccess: (data: any) => {
      const d = data as { statut: string; ecartKg: number; tauxEcartPct: number; niveauAlerte: string };
      const msg = d.niveauAlerte === "litige"
        ? `🔴 LITIGE détecté — écart de ${Math.abs(d.ecartKg).toFixed(0)} kg (${d.tauxEcartPct.toFixed(2)}%)`
        : d.niveauAlerte === "a_justifier"
        ? `⚠️ Écart à justifier — ${Math.abs(d.ecartKg).toFixed(0)} kg (${d.tauxEcartPct.toFixed(2)}%)`
        : `✅ Réception conforme — écart acceptable`;
      toast({ title: "Réception confirmée", description: msg });
      setShowReception(false);
      void qc.invalidateQueries({ queryKey: ["expedition", id] });
      void qc.invalidateQueries({ queryKey: ["expeditions"] });
    },
    onError: (err: Error) => toast({ title: "Erreur", description: err.message, variant: "destructive" }),
  });

  if (isLoading) return <div className="p-8 text-center text-gray-500">Chargement…</div>;
  if (!exp) return <div className="p-8 text-center text-gray-500">Expédition introuvable</div>;

  const statut = String(exp.statut ?? "");
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, color: "text-gray-600", step: 0 };
  const transition = TRANSITIONS[statut];

  const poidsCharge = parseFloat(String(exp.poidsChargeKg ?? "0"));
  const ecartKg = poidsRecu && poidsCharge
    ? poidsCharge - parseFloat(poidsRecu)
    : null;
  const tauxEcart = ecartKg !== null && poidsCharge > 0
    ? Math.abs(ecartKg) / poidsCharge * 100
    : null;

  // Écart sacs — calculé uniquement si les deux valeurs sont connues
  const sacsCharges = exp.nombreSacs ? parseInt(String(exp.nombreSacs)) : null;
  const ecartSacs = nombreSacsRecu && sacsCharges !== null
    ? sacsCharges - parseInt(nombreSacsRecu, 10)
    : null;
  const tauxEcartSacs = ecartSacs !== null && sacsCharges !== null && sacsCharges > 0
    ? Math.abs(ecartSacs) / sacsCharges * 100
    : null;

  // Niveau d'alerte global : le pire entre poids et sacs
  const niveauAlertePoids = tauxEcart === null ? null
    : tauxEcart <= 0.5 ? "acceptable"
    : tauxEcart <= 2   ? "a_justifier"
    : "litige";
  const niveauAlerteSacs = tauxEcartSacs === null ? null
    : tauxEcartSacs <= 0.5 ? "acceptable"
    : tauxEcartSacs <= 2   ? "a_justifier"
    : "litige";
  const alerteRank = (n: string | null) => n === "litige" ? 2 : n === "a_justifier" ? 1 : n === "acceptable" ? 0 : -1;
  const niveauAlerte = alerteRank(niveauAlertePoids) >= alerteRank(niveauAlerteSacs)
    ? niveauAlertePoids
    : niveauAlerteSacs;

  const lots = Array.isArray(exp.lots) ? exp.lots as any[] : [];
  const lotsNonMembres = exp.lotsNonMembres === true;
  const historique = Array.isArray(exp.historique) ? exp.historique as any[] : [];
  const documents = Array.isArray(exp.documents) ? exp.documents as any[] : [];

  const STEPS = ["Préparation", "Chargé", "En transit", "Port", "Réceptionné"];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/expeditions")} className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Retour
          </Button>
          <Ship className="h-5 w-5 text-green-700" />
          <h1 className="text-xl font-bold text-gray-900 font-mono">{String(exp.numeroExpedition ?? "")}</h1>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <span className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
          <Badge variant="outline">
            {String(exp.typeVehicule ?? "") === "propre" ? "🚛 Camion propre" : "🔑 Location"}
          </Badge>
        </div>
      </div>

      {/* Barre de progression */}
      <Card>
        <CardContent className="p-4 overflow-x-auto">
          <div className="flex items-center justify-between relative min-w-[500px]">
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0" />
            {STEPS.map((step, i) => {
              const done   = i < cfg.step;
              const active = i === cfg.step && !["receptionne", "litige"].includes(statut);
              const final  = ["receptionne", "litige"].includes(statut) && i === 4;
              return (
                <div key={step} className="flex flex-col items-center z-10 gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                    final  ? (statut === "litige" ? "bg-red-50 border-red-500 text-white" : "bg-green-500 border-green-500 text-white")
                    : done   ? "bg-green-500 border-green-500 text-white"
                    : active ? "bg-orange-500 border-orange-500 text-white animate-pulse"
                    : "bg-white border-gray-300 text-gray-400"
                  }`}>
                    {done || final ? "✓" : i + 1}
                  </div>
                  <span className="text-xs text-gray-500 text-center w-16">{step}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Infos principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-normal">Véhicule & Chauffeur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-semibold">{String(exp.immatriculation ?? "—")}</div>
            {exp.nomChauffeur && <div className="text-gray-600">🧑 {String(exp.nomChauffeur)}</div>}
            {exp.telephoneChauffeur && <div className="text-gray-500">📞 {String(exp.telephoneChauffeur)}</div>}
            {exp.transporteur && <div className="text-gray-600">🏢 {String(exp.transporteur)}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-normal">Destination</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-semibold flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Port de {String(exp.port ?? "—")}
            </div>
            {exp.exportateurNom && <div className="text-gray-600">🤝 {String(exp.exportateurNom)}</div>}
            {exp.entrepotDestination && <div className="text-gray-500">🏭 {String(exp.entrepotDestination)}</div>}
            {exp.heureEstimeeArrivee && (
              <div className="text-gray-500">⏱ Prévu : {new Date(String(exp.heureEstimeeArrivee)).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-normal">Chargement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="font-semibold text-lg">{poidsCharge > 0 ? `${poidsCharge.toLocaleString("fr-FR")} kg` : "—"}</div>
            {exp.nombreSacs && <div className="text-gray-600">📦 {String(exp.nombreSacs)} sacs</div>}
            {exp.lieuDepart && <div className="text-gray-500">📍 Départ : {String(exp.lieuDepart)}</div>}
            {exp.dateDepart && <div className="text-gray-500">🕐 {new Date(String(exp.dateDepart)).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-gray-500 font-normal">Réception port</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {exp.poidsRecuPortKg ? (
              <>
                <div className="font-semibold text-lg">{parseFloat(String(exp.poidsRecuPortKg)).toLocaleString("fr-FR")} kg reçus</div>
                {exp.nombreSacsRecuPort && (
                  <div className="text-gray-700">📦 {String(exp.nombreSacsRecuPort)} sacs reçus</div>
                )}
                {exp.ecartPoidsKg && (
                  <div className={`font-medium ${parseFloat(String(exp.ecartPoidsKg)) > 0 ? "text-red-600" : "text-green-600"}`}>
                    Écart : {parseFloat(String(exp.ecartPoidsKg)).toFixed(1)} kg
                  </div>
                )}
                {exp.nomReceptionnaire && <div className="text-gray-500">👤 {String(exp.nomReceptionnaire)}</div>}
                {exp.numeroRecepissePort && <div className="text-gray-500">🧾 {String(exp.numeroRecepissePort)}</div>}
              </>
            ) : (
              <div className="text-gray-400 italic">En attente de réception</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Certificat phytosanitaire */}
      {(() => {
        const phytoNumero    = exp.certificatPhytoNumero ? String(exp.certificatPhytoNumero) : null;
        const phytoOrganisme = exp.certificatPhytoOrganisme ? String(exp.certificatPhytoOrganisme) : "DPVC";
        const phytoEmission  = exp.certificatPhytoDateEmission ? String(exp.certificatPhytoDateEmission) : null;
        const phytoExpiration = exp.certificatPhytoDateExpiration ? String(exp.certificatPhytoDateExpiration) : null;
        const estExpire      = phytoExpiration ? new Date(phytoExpiration) < new Date() : false;
        return (
          <Card className={phytoNumero ? (estExpire ? "border-red-300" : "border-green-300") : "border-orange-200"}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Leaf className={`h-4 w-4 ${phytoNumero ? (estExpire ? "text-red-600" : "text-green-600") : "text-orange-500"}`} />
                Certificat phytosanitaire
                {phytoNumero
                  ? estExpire
                    ? <span className="ml-auto text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Expiré</span>
                    : <span className="ml-auto text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Valide</span>
                  : <span className="ml-auto text-xs text-orange-600">Non renseigné</span>
                }
              </CardTitle>
            </CardHeader>
            <CardContent>
              {phytoNumero ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <div>
                    <span className="text-gray-500 text-xs">Numéro</span>
                    <div className="font-mono font-semibold">{phytoNumero}</div>
                  </div>
                  <div>
                    <span className="text-gray-500 text-xs">Organisme émetteur</span>
                    <div className="font-medium">{phytoOrganisme}</div>
                  </div>
                  {phytoEmission && (
                    <div>
                      <span className="text-gray-500 text-xs">Date d'émission</span>
                      <div>{new Date(phytoEmission).toLocaleDateString("fr-FR")}</div>
                    </div>
                  )}
                  {phytoExpiration && (
                    <div>
                      <span className="text-gray-500 text-xs">Date d'expiration</span>
                      <div className={estExpire ? "text-red-600 font-semibold" : ""}>
                        {new Date(phytoExpiration).toLocaleDateString("fr-FR")}
                        {estExpire ? " ⚠️" : ""}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-orange-600 italic">
                  Certificat phytosanitaire non encore renseigné — obligatoire pour l'export.
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Lots cacao — traçabilité */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-green-600" />
            Lots cacao
            <span className="text-gray-400 font-normal">
              — {lots.length} lot{lots.length !== 1 ? "s" : ""} rattaché{lots.length !== 1 ? "s" : ""}
            </span>
            {["en_preparation", "charge"].includes(statut) && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto gap-1 h-7 text-xs"
                onClick={() => setShowLotsPanel(v => !v)}
              >
                {showLotsPanel ? <Unlink className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                {showLotsPanel ? "Fermer" : "Rattacher un lot"}
              </Button>
            )}
          </CardTitle>
        </CardHeader>

        {/* Lots déjà rattachés */}
        {lots.length > 0 && (
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs min-w-[600px]">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-500">
                  <th className="px-3 py-2 text-left">Lot #</th>
                  <th className="px-3 py-2 text-left">Membre</th>
                  <th className="px-3 py-2 text-right">Poids (kg)</th>
                  <th className="px-3 py-2 text-left">Cert. EUDR</th>
                  <th className="px-3 py-2 text-left">Parcelle</th>
                  {["en_preparation", "charge"].includes(statut) && <th className="px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {lots.map((l, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      {l.lotId
                        ? <span className="font-mono text-blue-700 font-semibold">#{String(l.lotId)}</span>
                        : <span className="text-gray-400 italic">Manuel</span>
                      }
                    </td>
                    <td className="px-3 py-2">{l.membreNom ? `${String(l.membreNom)} ${String(l.membrePrenoms ?? "")}`.trim() : "—"}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {l.poidsKg ? parseFloat(String(l.poidsKg)).toLocaleString("fr-FR") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {l.certificatEudr
                        ? <span className="text-green-600">✅ {String(l.certificatEudr)}</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-3 py-2 text-gray-500">{String(l.parcelleOrigine ?? "—")}</td>
                    {["en_preparation", "charge"].includes(statut) && (
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                          disabled={detacherMutation.isPending}
                          onClick={() => detacherMutation.mutate(Number(l.id))}
                          title="Détacher ce lot"
                        >
                          <Unlink className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        )}

        {lots.length === 0 && !showLotsPanel && (
          <CardContent>
            <p className="text-xs text-gray-400 italic text-center py-2">
              Aucun lot rattaché. {["en_preparation", "charge"].includes(statut) ? "Utilisez \"Rattacher un lot\" pour lier des lots existants." : ""}
            </p>
          </CardContent>
        )}

        {/* Panel lots disponibles */}
        {showLotsPanel && (
          <CardContent className="border-t pt-4 space-y-3">
            <p className="text-xs font-medium text-gray-600 flex items-center gap-2">
              <Link className="h-3 w-3" /> Lots en stock disponibles
            </p>
            {lotsLoading ? (
              <p className="text-xs text-gray-400">Chargement…</p>
            ) : lotsDisponibles.length === 0 ? (
              <p className="text-xs text-gray-400 italic">
                Aucun lot disponible (tous déjà rattachés ou aucun lot en stock/transit).
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-[500px]">
                  <thead>
                    <tr className="border-b bg-green-50 text-gray-500">
                      <th className="px-3 py-2 text-left">Lot #</th>
                      <th className="px-3 py-2 text-right">Poids (kg)</th>
                      <th className="px-3 py-2 text-left">Entrepôt</th>
                      <th className="px-3 py-2 text-left">Statut</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lotsDisponibles.map(lot => (
                      <tr key={lot.id} className="hover:bg-green-50">
                        <td className="px-3 py-2 font-mono font-semibold text-blue-700">#{lot.id}</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {parseFloat(lot.poidsTotalKg).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-3 py-2 text-gray-600">{lot.entrepot ?? "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            lot.statut === "en_stock" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                          }`}>
                            {lot.statut === "en_stock" ? "En stock" : "Transit"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-400">
                          {new Date(lot.dateCreation).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            className="h-6 text-xs bg-green-700 hover:bg-green-800 gap-1"
                            disabled={rattacherMutation.isPending}
                            onClick={() => rattacherMutation.mutate(lot.id)}
                          >
                            <Link className="h-3 w-3" /> Rattacher
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            Documents d'expédition
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={async () => {
                setDownloadingBL(true);
                try {
                  const res = await fetch(`${BASE}/api/expeditions/${id}/bon-livraison`, { headers: { Authorization: `Bearer ${token}` } });
                  if (!res.ok) throw new Error();
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `BL-${exp.numeroExpedition}.pdf`; a.click();
                } catch { toast({ title: "Erreur", description: "Impossible de générer le bon de livraison", variant: "destructive" }); }
                finally { setDownloadingBL(false); }
              }}
              disabled={downloadingBL}
            >
              <Download className={`h-4 w-4 ${downloadingBL ? "animate-bounce" : ""}`} />
              Bon de Livraison (BL)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={async () => {
                setDownloadingEudr(true);
                try {
                  const res = await fetch(`${BASE}/api/expeditions/${id}/certificat-eudr`, { headers: { Authorization: `Bearer ${token}` } });
                  if (!res.ok) throw new Error();
                  const blob = await res.blob();
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement("a"); a.href = url; a.download = `EUDR-${exp.numeroExpedition}.pdf`; a.click();
                } catch { toast({ title: "Erreur", description: "Impossible de générer le certificat EUDR", variant: "destructive" }); }
                finally { setDownloadingEudr(false); }
              }}
              disabled={downloadingEudr}
            >
              <Download className={`h-4 w-4 ${downloadingEudr ? "animate-bounce" : ""}`} />
              Certificat EUDR
            </Button>
            {statut === "litige" && (
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={async () => {
                  setDownloadingConstat(true);
                  try {
                    const res = await fetch(`${BASE}/api/expeditions/${id}/constat-litige`, { headers: { Authorization: `Bearer ${token}` } });
                    if (!res.ok) throw new Error();
                    const blob = await res.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = `CONSTAT-${exp.numeroExpedition}.pdf`; a.click();
                  } catch { toast({ title: "Erreur", description: "Impossible de générer le constat", variant: "destructive" }); }
                  finally { setDownloadingConstat(false); }
                }}
                disabled={downloadingConstat}
              >
                <AlertCircle className="h-4 w-4" />
                Constat de litige
              </Button>
            )}
          </div>
          {documents.length > 0 && (
            <div className="pt-2 border-t space-y-2">
              <p className="text-xs font-medium text-gray-500">Autres pièces jointes ({documents.length}) :</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {documents.map((doc, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                    <span className="truncate flex-1">{String(doc.nomFichier)}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(String(doc.url), "_blank")}>
                      <Download className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historique */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            Historique du suivi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {historique.map((h, i) => (
              <div key={i} className="flex gap-3 text-xs">
                <div className="w-20 shrink-0 text-gray-400 text-[10px] pt-0.5">
                  {new Date(String(h.dateAction)).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-700">{STATUT_CONFIG[String(h.statut)]?.label ?? String(h.statut)}</div>
                  {h.notes && <div className="text-gray-500 italic mt-0.5">"{String(h.notes)}"</div>}
                  {h.utilisateurNom && <div className="text-gray-400 mt-0.5">Par {String(h.utilisateurNom)}</div>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Actions de transition */}
      {transition && !showReception && (
        <Card className="border-green-200 bg-green-50 shadow-md">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-center sm:text-left">
              <p className="text-sm font-semibold text-green-800">Prêt pour l'étape suivante ?</p>
              <p className="text-xs text-green-600">L'expédition passera au statut <strong>{STATUT_CONFIG[transition.next]?.label ?? transition.next}</strong>.</p>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                className="bg-green-700 hover:bg-green-800 text-white flex-1 sm:flex-none"
                onClick={() => {
                  if (transition.next === "reception") setShowReception(true);
                  else statutMutation.mutate({ statut: transition.next });
                }}
                disabled={statutMutation.isPending}
              >
                {transition.label}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formulaire de réception port */}
      {showReception && (
        <Card className="border-orange-300 bg-orange-50 shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-orange-800">
              <CheckCircle2 className="h-5 w-5" />
              Réception au port
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-white p-4 rounded-xl border border-orange-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              <div className="space-y-1.5">
                <Label htmlFor="poidsRecu" className="text-orange-700">Poids net reçu (kg) *</Label>
                <Input
                  id="poidsRecu"
                  type="number"
                  step="0.5"
                  value={poidsRecu}
                  onChange={(e) => setPoidsRecu(e.target.value)}
                  className="bg-orange-50/30 border-orange-200 focus-visible:ring-orange-400 font-bold"
                  placeholder="Ex: 34500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sacsRecu" className="text-orange-700">Nombre de sacs reçus *</Label>
                <Input
                  id="sacsRecu"
                  type="number"
                  value={nombreSacsRecu}
                  onChange={(e) => setNombreSacsRecu(e.target.value)}
                  className="bg-orange-50/30 border-orange-200 focus-visible:ring-orange-400"
                  placeholder="Ex: 500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="recepisse" className="text-orange-700">N° Récépissé port *</Label>
                <Input
                  id="recepisse"
                  value={recepisse}
                  onChange={(e) => setRecepisse(e.target.value)}
                  className="bg-orange-50/30 border-orange-200 focus-visible:ring-orange-400 font-mono"
                  placeholder="REC-XXXXXX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="receptionnaire" className="text-orange-700">Réceptionné par *</Label>
                <Input
                  id="receptionnaire"
                  value={receptionnaire}
                  onChange={(e) => setReceptionnaire(e.target.value)}
                  className="bg-orange-50/30 border-orange-200 focus-visible:ring-orange-400"
                  placeholder="Nom de l'agent"
                />
              </div>
            </div>

            {/* Calcul de l'écart dynamique */}
            {(ecartKg !== null || ecartSacs !== null) && (
              <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-center gap-4 transition-colors ${
                niveauAlerte === "litige" ? "bg-red-50 border-red-200"
                : niveauAlerte === "a_justifier" ? "bg-amber-50 border-orange-200"
                : "bg-green-50 border-green-200"
              }`}>
                <div className={`p-2 rounded-full ${
                  niveauAlerte === "litige" ? "bg-red-100 text-red-600"
                  : niveauAlerte === "a_justifier" ? "bg-amber-100 text-orange-600"
                  : "bg-green-100 text-green-600"
                }`}>
                  {niveauAlerte === "litige" ? <AlertCircle className="h-6 w-6" /> : <CheckCircle2 className="h-6 w-6" />}
                </div>
                <div className="flex-1 text-center md:text-left">
                  <p className="text-sm font-bold uppercase tracking-wide">
                    {niveauAlerte === "litige" ? "⚠️ Litige détecté"
                    : niveauAlerte === "a_justifier" ? "🔍 Écart à justifier"
                    : "✅ Réception conforme"}
                  </p>
                  <div className="flex flex-wrap justify-center md:justify-start gap-4 mt-1 text-xs">
                    {ecartKg !== null && (
                      <span>Poids : <strong>{ecartKg > 0 ? "+" : ""}{(-ecartKg).toFixed(1)} kg</strong> ({(tauxEcart ?? 0).toFixed(2)}%)</span>
                    )}
                    {ecartSacs !== null && (
                      <span>Sacs : <strong>{ecartSacs > 0 ? "+" : ""}{-ecartSacs} sacs</strong> ({(tauxEcartSacs ?? 0).toFixed(2)}%)</span>
                    )}
                  </div>
                </div>
                {niveauAlerte !== "acceptable" && (
                  <div className="w-full md:w-64">
                    <Label className="text-[10px] text-gray-500 mb-1 block">Motif de l'écart *</Label>
                    <Select value={motifEcart} onValueChange={setMotifEcart}>
                      <SelectTrigger className="h-8 text-xs bg-white">
                        <SelectValue placeholder="Choisir un motif" />
                      </SelectTrigger>
                      <SelectContent>
                        {MOTIFS_ECART.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            {/* Section Refoulement / Tri */}
            <div className="pt-4 border-t border-orange-200">
              <div className="flex items-center gap-2 mb-3">
                <input
                  type="checkbox"
                  id="refoulement"
                  checked={hasRefoulement}
                  onChange={(e) => setHasRefoulement(e.target.checked)}
                  className="h-4 w-4 text-orange-600 rounded"
                />
                <Label htmlFor="refoulement" className="text-orange-800 font-semibold cursor-pointer">Y a-t-il eu un refoulement partiel ? (produit non conforme)</Label>
              </div>

              {hasRefoulement && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-orange-100/50 rounded-lg border border-orange-200 animate-in fade-in zoom-in-95 duration-200">
                  <div className="space-y-1">
                    <Label className="text-xs">Poids refoulé (kg)</Label>
                    <Input type="number" value={poidsRefoul} onChange={(e) => setPoidsRefoul(e.target.value)} className="h-8 text-sm" placeholder="Kg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Sacs refoulés</Label>
                    <Input type="number" value={nombreSacsRefoul} onChange={(e) => setNombreSacsRefoul(e.target.value)} className="h-8 text-sm" placeholder="Nombre" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Motif refoulement</Label>
                    <Input value={motifRefoulement} onChange={(e) => setMotifRefoulement(e.target.value)} className="h-8 text-sm" placeholder="Ex: Hors-normes" />
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="frais">Frais de transport réels (FCFA)</Label>
                <Input
                  id="frais"
                  type="number"
                  value={fraisTransport}
                  onChange={(e) => setFraisTransport(e.target.value)}
                  className="bg-white"
                  placeholder="Optionnel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes & observations</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-white h-20"
                  placeholder="Observations éventuelles sur la réception..."
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Button variant="ghost" onClick={() => setShowReception(false)} className="flex-1 text-gray-500">Annuler</Button>
              <Button
                className="flex-[2] bg-orange-600 hover:bg-orange-700 text-white font-bold h-12 shadow-lg"
                disabled={!poidsRecu || !nombreSacsRecu || !recepisse || !receptionnaire || (niveauAlerte !== "acceptable" && !motifEcart) || receptionMutation.isPending}
                onClick={() => {
                  receptionMutation.mutate({
                    poidsRecuPortKg: parseFloat(poidsRecu),
                    nombreSacsRecuPort: parseInt(nombreSacsRecu),
                    numeroRecepissePort: recepisse,
                    nomReceptionnaire: receptionnaire,
                    motifEcart: niveauAlerte !== "acceptable" ? motifEcart : undefined,
                    notes,
                    fraisTransportFcfa: fraisTransport ? parseFloat(fraisTransport) : undefined,
                    refoulement: hasRefoulement ? {
                      poidsKg: parseFloat(poidsRefoul),
                      nombreSacs: parseInt(nombreSacsRefoul),
                      motif: motifRefoulement
                    } : undefined
                  });
                }}
              >
                {receptionMutation.isPending ? "Traitement en cours..." : "CONFIRMER LA RÉCEPTION ET CLÔTURER"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Bouton retour en bas de page pour mobile */}
      <div className="sm:hidden pt-4 pb-8">
        <Button variant="outline" className="w-full gap-2" onClick={() => navigate("/expeditions")}>
          <ArrowLeft className="h-4 w-4" /> Retour à la liste
        </Button>
      </div>
    </div>
  );
}

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
  Plus, Unlink, Link,
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
  const [poidsRecu, setPoidsRecu] = useState("");
  const [recepisse, setRecepisse] = useState("");
  const [receptionnaire, setReceptionnaire] = useState("");
  const [motifEcart, setMotifEcart] = useState("");
  const [fraisTransport, setFraisTransport] = useState("");
  const [notes, setNotes] = useState("");

  const { data: exp, isLoading } = useQuery<Record<string, unknown>>({
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
    onSuccess: (data: unknown) => {
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
  const niveauAlerte = tauxEcart === null ? null
    : tauxEcart <= 0.5 ? "acceptable"
    : tauxEcart <= 2 ? "a_justifier"
    : "litige";

  const lots = Array.isArray(exp.lots) ? exp.lots as Record<string, unknown>[] : [];
  const historique = Array.isArray(exp.historique) ? exp.historique as Record<string, unknown>[] : [];
  const documents = Array.isArray(exp.documents) ? exp.documents as Record<string, unknown>[] : [];

  const STEPS = ["Préparation", "Chargé", "En transit", "Port", "Réceptionné"];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/expeditions")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        <Ship className="h-5 w-5 text-green-700" />
        <h1 className="text-xl font-bold text-gray-900 font-mono">{String(exp.numeroExpedition ?? "")}</h1>
        <span className={`ml-2 text-sm font-semibold ${cfg.color}`}>{cfg.label}</span>
        <Badge variant="outline" className="ml-auto">
          {String(exp.typeVehicule ?? "") === "propre" ? "🚛 Camion propre" : "🔑 Location"}
        </Badge>
      </div>

      {/* Barre de progression */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between relative">
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-gray-200 z-0" />
            {STEPS.map((step, i) => {
              const done   = i < cfg.step;
              const active = i === cfg.step && !["receptionne", "litige"].includes(statut);
              const final  = ["receptionne", "litige"].includes(statut) && i === 4;
              return (
                <div key={step} className="flex flex-col items-center z-10 gap-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                    final  ? (statut === "litige" ? "bg-red-500 border-red-500 text-white" : "bg-green-500 border-green-500 text-white")
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
      <div className="grid grid-cols-2 gap-4">
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
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
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
          <CardContent className="p-0">
            <table className="w-full text-xs">
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
              <table className="w-full text-xs">
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
            )}
          </CardContent>
        )}
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-xs text-gray-400">Aucun document joint</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {documents.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> {String(d.type ?? "")}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulaire réception port */}
      {showReception && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-blue-800">⚓ Saisir la réception au port</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Poids reçu au port (kg) *</Label>
                <Input
                  type="number"
                  value={poidsRecu}
                  onChange={e => setPoidsRecu(e.target.value)}
                  placeholder="18 465"
                />
              </div>
              <div>
                <Label>N° récépissé port *</Label>
                <Input value={recepisse} onChange={e => setRecepisse(e.target.value)} placeholder="REC-2025-..." />
              </div>
              <div>
                <Label>Réceptionnaire *</Label>
                <Input value={receptionnaire} onChange={e => setReceptionnaire(e.target.value)} placeholder="Nom du réceptionnaire" />
              </div>
              <div>
                <Label>Frais transport (FCFA)</Label>
                <Input type="number" value={fraisTransport} onChange={e => setFraisTransport(e.target.value)} placeholder="50000" />
              </div>
            </div>

            {/* Prévisualisation écart */}
            {tauxEcart !== null && (
              <div className={`rounded-lg p-4 border ${
                niveauAlerte === "acceptable"  ? "bg-green-50 border-green-300"
                : niveauAlerte === "a_justifier" ? "bg-orange-50 border-orange-300"
                : "bg-red-50 border-red-300"
              }`}>
                <div className="font-semibold mb-2">
                  {niveauAlerte === "acceptable"  ? "✅ Réception conforme"
                  : niveauAlerte === "a_justifier" ? "⚠️ Écart à justifier"
                  : "🔴 LITIGE — Direction sera notifiée"}
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div><span className="text-gray-500">Chargé :</span> <strong>{poidsCharge.toLocaleString("fr-FR")} kg</strong></div>
                  <div><span className="text-gray-500">Reçu :</span> <strong>{parseFloat(poidsRecu || "0").toLocaleString("fr-FR")} kg</strong></div>
                  <div><span className="text-gray-500">Écart :</span> <strong className={niveauAlerte !== "acceptable" ? "text-red-600" : ""}>{ecartKg !== null ? `${ecartKg.toFixed(1)} kg (${tauxEcart.toFixed(2)}%)` : "—"}</strong></div>
                </div>
              </div>
            )}

            {(niveauAlerte === "a_justifier" || niveauAlerte === "litige") && (
              <div>
                <Label>Motif de l'écart *</Label>
                <Select value={motifEcart || undefined} onValueChange={setMotifEcart}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                  <SelectContent>
                    {MOTIFS_ECART.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={() => setShowReception(false)}>Annuler</Button>
              <Button
                className="bg-blue-700 hover:bg-blue-800"
                disabled={receptionMutation.isPending || !poidsRecu || !recepisse || !receptionnaire}
                onClick={() => receptionMutation.mutate({
                  poidsRecuPortKg:    parseFloat(poidsRecu),
                  numeroRecepissePort: recepisse,
                  nomReceptionnaire:  receptionnaire,
                  motifEcart:         motifEcart || undefined,
                  fraisTransportFcfa: fraisTransport ? parseInt(fraisTransport, 10) : undefined,
                })}
              >
                {receptionMutation.isPending ? "Enregistrement…" : "Confirmer la réception →"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {transition && !showReception && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4 flex items-center justify-between">
            <p className="text-sm text-green-700">Prochaine étape disponible</p>
            <Button
              className="bg-green-700 hover:bg-green-800 gap-2"
              disabled={statutMutation.isPending}
              onClick={() => {
                if (transition.next === "reception") {
                  setShowReception(true);
                } else {
                  statutMutation.mutate({ statut: transition.next, notes });
                }
              }}
            >
              {transition.label} <ChevronRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Historique */}
      {historique.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Historique</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {historique.map((h, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                <div>
                  <div className="font-medium">
                    {STATUT_CONFIG[String(h.statutPrecedent ?? "")]?.label ?? String(h.statutPrecedent ?? "")}
                    {h.statutPrecedent ? <span className="text-gray-400"> → </span> : null}
                    {STATUT_CONFIG[String(h.statutNouveau ?? "")]?.label ?? String(h.statutNouveau ?? "")}
                  </div>
                  {h.notes && <div className="text-gray-500 text-xs">{String(h.notes)}</div>}
                  <div className="text-gray-400 text-xs">
                    {new Date(String(h.dateChangement)).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

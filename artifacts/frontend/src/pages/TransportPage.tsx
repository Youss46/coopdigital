import { useState } from "react";
import { MoneyInput } from "@/components/ui/money-input";
import { NumericInput } from "@/components/ui/numeric-input";
import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import {
  useGetVehicules,
  useCreateVehicule,
  useUpdateVehicule,
  useGetTransportAlertes,
  useGetChauffeurs,
  useCreateChauffeur,
  useUpdateChauffeur,
  useDeleteChauffeur,
  useGetMissions,
  useCreateMission,
  useDemarrerMission,
  useTerminerMission,
  useGetRapportCampagneTransport,
  useGetDepensesTransport,
  useCreateDepenseVehicule,
  useUpdateDepenseVehicule,
  useDeleteDepenseVehicule,
  useGetBonsCarburant,
  useCreateBonCarburant,
  useSoumettresBonCarburant,
  useApprouverBonCarburant,
  useUtiliserBonCarburant,
  useAnnulerBonCarburant,
  useGetStatsCarburant,
  getGetVehiculesQueryKey,
  getGetChauffeursQueryKey,
  getGetMissionsQueryKey,
  getGetTransportAlertesQueryKey,
  getGetRapportCampagneTransportQueryKey,
  getGetDepensesTransportQueryKey,
  getGetBonsCarburantQueryKey,
  getGetStatsCarburantQueryKey,
  getListPaiementsQueryKey,
  getGetPaiementsStatsQueryKey,
  getBonCarburantPdf,
} from "@workspace/api-client-react";
import type { DepenseVehicule, BonCarburant } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { openPdfViewer } from "@/lib/pdfViewer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Truck,
  Users,
  MapPin,
  BarChart3,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
  Edit2,
  Trash2,
  Play,
  Square,
  Wrench,
  Settings,
  History,
  ShieldAlert,
  Gauge,
  Receipt,
  Fuel,
  Package,
  Filter,
  FileText,
  Send,
  ThumbsUp,
  Droplets,
  Ban,
  Smartphone,
  KeyRound,
  Printer,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}

function formatTs(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function formatFcfa(n: number | string | null | undefined) {
  if (n == null) return "—";
  return `${Number(n).toLocaleString("fr-FR")} FCFA`;
}

function daysUntil(date: string | null | undefined): number | null {
  if (!date) return null;
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function ExpiryBadge({ date }: { date: string | null | undefined }) {
  const days = daysUntil(date);
  if (days == null) return <span className="text-gray-400">—</span>;
  if (days < 0) return <Badge variant="destructive">Expiré</Badge>;
  if (days <= 30) return <Badge variant="destructive">{days}j</Badge>;
  if (days <= 60) return <Badge className="bg-orange-100 text-orange-800">{days}j</Badge>;
  return <Badge variant="outline">{formatDate(date)}</Badge>;
}

function statutVehicule(statut: string) {
  const map: Record<string, { label: string; className: string }> = {
    disponible:  { label: "Disponible",   className: "bg-green-100 text-green-800" },
    en_mission:  { label: "En mission",   className: "bg-blue-100 text-blue-800" },
    en_panne:    { label: "En panne",     className: "bg-red-100 text-red-800" },
    maintenance: { label: "Maintenance",  className: "bg-orange-100 text-orange-800" },
  };
  const s = map[statut] ?? { label: statut, className: "bg-gray-100 text-gray-700" };
  return <Badge className={s.className}>{s.label}</Badge>;
}

function statutMission(statut: string) {
  const map: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
    planifiee:  { label: "Planifiée",  icon: <Clock className="h-3 w-3" />, className: "bg-gray-100 text-gray-700" },
    en_cours:   { label: "En cours",   icon: <Play className="h-3 w-3" />,  className: "bg-blue-100 text-blue-800" },
    terminee:   { label: "Terminée",   icon: <CheckCircle2 className="h-3 w-3" />, className: "bg-green-100 text-green-800" },
    annulee:    { label: "Annulée",    icon: <XCircle className="h-3 w-3" />, className: "bg-red-100 text-red-800" },
  };
  const s = map[statut] ?? { label: statut, icon: null, className: "bg-gray-100 text-gray-700" };
  return (
    <Badge className={`${s.className} flex items-center gap-1`}>
      {s.icon}{s.label}
    </Badge>
  );
}

function typeMission(t: string) {
  const map: Record<string, string> = {
    collecte:        "Collecte",
    livraison_export: "Export",
    intrants:        "Intrants",
    autre:           "Autre",
  };
  return map[t] ?? t;
}

// ─── Onglet Flotte ────────────────────────────────────────────────────────────

type VehiculeFormData = {
  immatriculation: string;
  marque: string;
  modele: string;
  type: string;
  capacite_kg: string;
  annee_fabrication: string;
  proprietaire: string;
  nom_prestataire: string;
  statut: string;
  kilometrage_actuel: string;
  assurance_expiration: string;
  visite_technique_expiration: string;
  prochain_entretien_km: string;
  prochain_entretien_date: string;
};

const vehiculeVide: VehiculeFormData = {
  immatriculation: "", marque: "", modele: "", type: "camion",
  capacite_kg: "", annee_fabrication: "", proprietaire: "cooperative",
  nom_prestataire: "", statut: "disponible", kilometrage_actuel: "0",
  assurance_expiration: "", visite_technique_expiration: "",
  prochain_entretien_km: "", prochain_entretien_date: "",
};

function TabFlotte() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useGetVehicules();
  const { data: alertesData } = useGetTransportAlertes();
  const createMut = useCreateVehicule({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetVehiculesQueryKey() }); toast({ title: "Véhicule créé" }); setShowForm(false); } } });
  const updateMut = useUpdateVehicule({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetVehiculesQueryKey() }); toast({ title: "Véhicule modifié" }); setShowForm(false); setEditId(null); } } });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<VehiculeFormData>(vehiculeVide);

  const vehicules = data?.vehicules ?? [];
  const alertesV = alertesData?.alertes_vehicules ?? [];

  function openCreate() { setForm(vehiculeVide); setEditId(null); setShowForm(true); }
  function openEdit(v: (typeof vehicules)[0]) {
    setForm({
      immatriculation: v.immatriculation,
      marque: v.marque ?? "",
      modele: v.modele ?? "",
      type: v.type,
      capacite_kg: v.capacite_kg ? String(Number(v.capacite_kg) / 1000) : "",
      annee_fabrication: v.annee_fabrication ? String(v.annee_fabrication) : "",
      proprietaire: v.proprietaire,
      nom_prestataire: v.nom_prestataire ?? "",
      statut: v.statut,
      kilometrage_actuel: String(v.kilometrage_actuel),
      assurance_expiration: v.assurance_expiration ?? "",
      visite_technique_expiration: v.visite_technique_expiration ?? "",
      prochain_entretien_km: v.prochain_entretien_km ? String(v.prochain_entretien_km) : "",
      prochain_entretien_date: v.prochain_entretien_date ?? "",
    });
    setEditId(v.id);
    setShowForm(true);
  }

  function buildPayload() {
    return {
      immatriculation:              form.immatriculation,
      marque:                       form.marque || undefined,
      modele:                       form.modele || undefined,
      type:                         form.type as "camion" | "camionnette" | "moto" | "tracteur",
      capacite_kg:                  form.capacite_kg ? Number(form.capacite_kg) * 1000 : undefined,
      annee_fabrication:            form.annee_fabrication ? Number(form.annee_fabrication) : undefined,
      proprietaire:                 form.proprietaire as "cooperative" | "location" | "prestataire",
      nom_prestataire:              form.nom_prestataire || undefined,
      statut:                       form.statut as "disponible" | "en_mission" | "en_panne" | "maintenance",
      kilometrage_actuel:           Number(form.kilometrage_actuel) || 0,
      assurance_expiration:         form.assurance_expiration || undefined,
      visite_technique_expiration:  form.visite_technique_expiration || undefined,
      prochain_entretien_km:        form.prochain_entretien_km ? Number(form.prochain_entretien_km) : undefined,
      prochain_entretien_date:      form.prochain_entretien_date || undefined,
    };
  }

  function handleSubmit() {
    if (!form.immatriculation || !form.type) return;
    if (editId) {
      updateMut.mutate({ id: editId, data: buildPayload() });
    } else {
      createMut.mutate({ data: buildPayload() });
    }
  }

  const alertesParVehicule = new Map<number, string[]>();
  for (const a of alertesV) {
    if (a.vehicule_id == null) continue;
    const arr = alertesParVehicule.get(a.vehicule_id) ?? [];
    arr.push(a.message ?? "");
    alertesParVehicule.set(a.vehicule_id, arr);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-start gap-2">
        <div>
          <h2 className="text-lg font-semibold">Flotte de véhicules</h2>
          <p className="text-sm text-gray-500">{vehicules.length} véhicule{vehicules.length !== 1 ? "s" : ""} enregistré{vehicules.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1.5" />Ajouter un véhicule</Button>
      </div>

      {alertesV.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
          <div className="flex items-center gap-2 text-red-700 font-medium text-sm"><AlertTriangle className="h-4 w-4" />Alertes ({alertesV.length})</div>
          {alertesV.map((a, i) => (
            <div key={i} className="text-sm text-red-600 ml-6">🔴 {a.immatriculation} — {a.message}</div>
          ))}
        </div>
      )}

      {vehicules.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Truck className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>Aucun véhicule enregistré</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicules.map(v => {
            const alertes = alertesParVehicule.get(v.id) ?? [];
            return (
              <Card key={v.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-green-50 rounded-lg"><Truck className="h-5 w-5 text-green-700" /></div>
                      <div>
                        <div className="font-bold text-base">{v.immatriculation}</div>
                        <div className="text-sm text-gray-500">{[v.marque, v.modele].filter(Boolean).join(" ") || v.type}</div>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(v)}><Edit2 className="h-4 w-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Statut</span>
                    {statutVehicule(v.statut)}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Capacité</span>
                    <span>{v.capacite_kg ? `${(Number(v.capacite_kg) / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} T` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Kilométrage</span>
                    <span>{(v.kilometrage_actuel ?? 0).toLocaleString("fr-FR")} km</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Assurance</span>
                    <ExpiryBadge date={v.assurance_expiration} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500">Visite tech.</span>
                    <ExpiryBadge date={v.visite_technique_expiration} />
                  </div>
                  {alertes.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {alertes.map((msg, i) => (
                        <div key={i} className="text-xs text-red-600 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 flex-shrink-0" />{msg}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={o => { if (!o) { setShowForm(false); setEditId(null); } }}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Modifier le véhicule" : "Ajouter un véhicule"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Immatriculation *</Label>
              <Input value={form.immatriculation} onChange={e => setForm(f => ({ ...f, immatriculation: e.target.value }))} placeholder="AB-1234-CI" />
            </div>
            <div>
              <Label>Marque</Label>
              <Input value={form.marque} onChange={e => setForm(f => ({ ...f, marque: e.target.value }))} placeholder="Toyota" />
            </div>
            <div>
              <Label>Modèle</Label>
              <Input value={form.modele} onChange={e => setForm(f => ({ ...f, modele: e.target.value }))} placeholder="Hilux" />
            </div>
            <div>
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="camion">Camion</SelectItem>
                  <SelectItem value="camionnette">Camionnette</SelectItem>
                  <SelectItem value="moto">Moto</SelectItem>
                  <SelectItem value="tracteur">Tracteur</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Capacité (T)</Label>
              <NumericInput step="0.1" value={form.capacite_kg} onChange={v => setForm(f => ({ ...f, capacite_kg: v }))} />
            </div>
            <div>
              <Label>Propriétaire</Label>
              <Select value={form.proprietaire} onValueChange={v => setForm(f => ({ ...f, proprietaire: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cooperative">Coopérative</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
                  <SelectItem value="prestataire">Prestataire</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Statut</Label>
              <Select value={form.statut} onValueChange={v => setForm(f => ({ ...f, statut: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="disponible">Disponible</SelectItem>
                  <SelectItem value="en_mission">En mission</SelectItem>
                  <SelectItem value="en_panne">En panne</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Kilométrage actuel</Label>
              <NumericInput decimal={false} value={form.kilometrage_actuel} onChange={v => setForm(f => ({ ...f, kilometrage_actuel: v }))} />
            </div>
            <div>
              <Label>Année fabrication</Label>
              <Input type="number" value={form.annee_fabrication} onChange={e => setForm(f => ({ ...f, annee_fabrication: e.target.value }))} />
            </div>
            <div>
              <Label>Expiration assurance</Label>
              <Input type="date" value={form.assurance_expiration} onChange={e => setForm(f => ({ ...f, assurance_expiration: e.target.value }))} />
            </div>
            <div>
              <Label>Expiration visite technique</Label>
              <Input type="date" value={form.visite_technique_expiration} onChange={e => setForm(f => ({ ...f, visite_technique_expiration: e.target.value }))} />
            </div>
            <div>
              <Label>Prochain entretien (km)</Label>
              <NumericInput decimal={false} value={form.prochain_entretien_km} onChange={v => setForm(f => ({ ...f, prochain_entretien_km: v }))} />
            </div>
            <div>
              <Label>Prochain entretien (date)</Label>
              <Input type="date" value={form.prochain_entretien_date} onChange={e => setForm(f => ({ ...f, prochain_entretien_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editId ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Onglet Chauffeurs ────────────────────────────────────────────────────────

type ChauffeurForm = {
  nom: string; prenoms: string; telephone: string;
  numero_permis: string; categorie_permis: string;
  date_expiration_permis: string; date_embauche: string; statut: string;
};

const chauffeurVide: ChauffeurForm = {
  nom: "", prenoms: "", telephone: "", numero_permis: "",
  categorie_permis: "", date_expiration_permis: "", date_embauche: "", statut: "actif",
};

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

function TabChauffeurs() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { token } = useAuth();
  const { data } = useGetChauffeurs();
  const createMut = useCreateChauffeur({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetChauffeursQueryKey() }); toast({ title: "Chauffeur créé" }); setShowForm(false); } } });
  const updateMut = useUpdateChauffeur({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetChauffeursQueryKey() }); toast({ title: "Chauffeur modifié" }); setShowForm(false); setEditId(null); } } });
  const deleteMut = useDeleteChauffeur({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetChauffeursQueryKey() }); toast({ title: "Chauffeur supprimé" }); } } });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ChauffeurForm>(chauffeurVide);

  // Création compte terrain chauffeur
  const [showAccesTerrain, setShowAccesTerrain] = useState(false);
  const [selectedChauffeur, setSelectedChauffeur] = useState<{ id: number; nom: string; prenoms: string | null; telephone: string | null } | null>(null);
  const [terrainForm, setTerrainForm] = useState({ telephone: "", motDePasse: "" });
  const [terrainLoading, setTerrainLoading] = useState(false);

  async function handleCreateAccesTerrain() {
    if (!terrainForm.telephone || !terrainForm.motDePasse || !selectedChauffeur) return;
    setTerrainLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/users/chauffeurs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          nom:         selectedChauffeur.nom,
          prenoms:     selectedChauffeur.prenoms ?? "",
          telephone:   terrainForm.telephone,
          motDePasse:  terrainForm.motDePasse,
          chauffeur_id: selectedChauffeur.id,
        }),
      });
      const json = await res.json() as { erreur?: string };
      if (!res.ok) { toast({ title: json.erreur ?? "Erreur", variant: "destructive" }); return; }
      toast({ title: `Accès terrain créé pour ${selectedChauffeur.nom}`, description: "Le mot de passe est temporaire — le chauffeur devra le changer à la connexion." });
      setShowAccesTerrain(false);
      setTerrainForm({ telephone: "", motDePasse: "" });
    } catch { toast({ title: "Erreur réseau", variant: "destructive" }); }
    finally { setTerrainLoading(false); }
  }

  const chauffeurs = data?.chauffeurs ?? [];

  function openCreate() { setForm(chauffeurVide); setEditId(null); setShowForm(true); }
  function openEdit(c: (typeof chauffeurs)[0]) {
    setForm({
      nom: c.nom, prenoms: c.prenoms ?? "", telephone: c.telephone ?? "",
      numero_permis: c.numero_permis ?? "", categorie_permis: c.categorie_permis ?? "",
      date_expiration_permis: c.date_expiration_permis ?? "",
      date_embauche: c.date_embauche ?? "", statut: c.statut,
    });
    setEditId(c.id); setShowForm(true);
  }

  function buildPayload() {
    return {
      nom: form.nom, prenoms: form.prenoms || undefined, telephone: form.telephone || undefined,
      numero_permis: form.numero_permis || undefined, categorie_permis: form.categorie_permis || undefined,
      date_expiration_permis: form.date_expiration_permis || undefined,
      date_embauche: form.date_embauche || undefined,
      statut: form.statut as "actif" | "inactif",
    };
  }

  function handleSubmit() {
    if (!form.nom) return;
    if (editId) updateMut.mutate({ id: editId, data: buildPayload() });
    else createMut.mutate({ data: buildPayload() });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-start gap-2">
        <div>
          <h2 className="text-lg font-semibold">Chauffeurs</h2>
          <p className="text-sm text-gray-500">{chauffeurs.length} chauffeur{chauffeurs.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1.5" />Ajouter un chauffeur</Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>N° Permis</TableHead>
              <TableHead>Catégorie</TableHead>
              <TableHead>Expiration permis</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {chauffeurs.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-8">Aucun chauffeur</TableCell></TableRow>
            )}
            {chauffeurs.map(c => {
              const days = daysUntil(c.date_expiration_permis);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nom} {c.prenoms ?? ""}</TableCell>
                  <TableCell>{c.telephone ?? "—"}</TableCell>
                  <TableCell>{c.numero_permis ?? "—"}</TableCell>
                  <TableCell>{c.categorie_permis === "tous" ? "Tout catégorie" : (c.categorie_permis ?? "—")}</TableCell>
                  <TableCell>
                    {days != null && days <= 30
                      ? <span className="text-red-600 font-medium flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{formatDate(c.date_expiration_permis)} ({days}j)</span>
                      : <span>{formatDate(c.date_expiration_permis)}</span>
                    }
                  </TableCell>
                  <TableCell>
                    <Badge className={c.statut === "actif" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}>
                      {c.statut === "actif" ? "Actif" : "Inactif"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Edit2 className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="text-blue-500 hover:text-blue-700"
                        title="Créer un accès terrain pour ce chauffeur"
                        onClick={() => { setSelectedChauffeur({ id: c.id, nom: c.nom, prenoms: c.prenoms ?? null, telephone: c.telephone ?? null }); setTerrainForm({ telephone: c.telephone ?? "", motDePasse: "" }); setShowAccesTerrain(true); }}>
                        <Smartphone className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm(`Supprimer ${c.nom} ?`)) deleteMut.mutate({ id: c.id }); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog accès terrain */}
      <Dialog open={showAccesTerrain} onOpenChange={o => { if (!o) setShowAccesTerrain(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-blue-600" /> Accès terrain</DialogTitle>
            {selectedChauffeur && (
              <p className="text-sm text-gray-500">
                Créer un compte pour <strong>{selectedChauffeur.prenoms} {selectedChauffeur.nom}</strong> dans l'app Agent Terrain.
              </p>
            )}
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Numéro de téléphone *</Label>
              <Input placeholder="Ex : 0701020304" value={terrainForm.telephone}
                onChange={e => setTerrainForm(f => ({ ...f, telephone: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Utilisé pour se connecter à l'application terrain</p>
            </div>
            <div>
              <Label className="flex items-center gap-1"><KeyRound className="h-3 w-3" /> Mot de passe provisoire *</Label>
              <Input type="password" placeholder="Min. 6 caractères" value={terrainForm.motDePasse}
                onChange={e => setTerrainForm(f => ({ ...f, motDePasse: e.target.value }))} />
              <p className="text-xs text-gray-400 mt-1">Le chauffeur devra le changer à la première connexion</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAccesTerrain(false)}>Annuler</Button>
            <Button onClick={handleCreateAccesTerrain}
              disabled={!terrainForm.telephone || terrainForm.motDePasse.length < 6 || terrainLoading}>
              Créer l'accès
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={o => { if (!o) { setShowForm(false); setEditId(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editId ? "Modifier le chauffeur" : "Ajouter un chauffeur"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nom *</Label>
              <Input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
            </div>
            <div>
              <Label>Prénoms</Label>
              <Input value={form.prenoms} onChange={e => setForm(f => ({ ...f, prenoms: e.target.value }))} />
            </div>
            <div>
              <Label>Téléphone</Label>
              <Input value={form.telephone} onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))} />
            </div>
            <div>
              <Label>N° Permis</Label>
              <Input value={form.numero_permis} onChange={e => setForm(f => ({ ...f, numero_permis: e.target.value }))} />
            </div>
            <div>
              <Label>Catégorie permis</Label>
              <Select value={form.categorie_permis} onValueChange={v => setForm(f => ({ ...f, categorie_permis: v }))}>
                <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tous">Tout catégorie</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                  <SelectItem value="D">D</SelectItem>
                  <SelectItem value="E">E</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date embauche</Label>
              <Input type="date" value={form.date_embauche} onChange={e => setForm(f => ({ ...f, date_embauche: e.target.value }))} />
            </div>
            <div>
              <Label>Expiration permis</Label>
              <Input type="date" value={form.date_expiration_permis} onChange={e => setForm(f => ({ ...f, date_expiration_permis: e.target.value }))} />
            </div>
            <div>
              <Label>Statut</Label>
              <Select value={form.statut} onValueChange={v => setForm(f => ({ ...f, statut: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="actif">Actif</SelectItem>
                  <SelectItem value="inactif">Inactif</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending || updateMut.isPending}>
              {editId ? "Modifier" : "Créer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Type pour missions avec jointure ─────────────────────────────────────────

type MissionRow = {
  mission: {
    id: number; cooperative_id: number; vehicule_id: number; chauffeur_id: number;
    type_mission: string; lieu_depart: string; lieu_arrivee: string;
    date_depart: string; date_arrivee_prevue?: string | null; date_arrivee_reelle?: string | null;
    poids_charge_kg: string | number; nombre_sacs: number;
    kilometrage_depart?: number | null; kilometrage_arrivee?: number | null; distance_km?: number | null;
    cout_carburant_fcfa: string | number; cout_chauffeur_fcfa: string | number;
    cout_peage_fcfa: string | number; cout_divers_fcfa: string | number;
    cout_total_fcfa: string | number; cout_par_kg_fcfa?: string | number | null;
    statut: string; observations?: string | null;
    created_at: string; updated_at: string;
  };
  vehicule: { id: number; immatriculation: string; marque?: string | null; modele?: string | null } | null;
  chauffeur: { id: number; nom: string; prenoms?: string | null } | null;
};

// ─── Onglet Missions ──────────────────────────────────────────────────────────

type MissionForm = {
  vehicule_id: string; chauffeur_id: string; type_mission: string;
  lieu_depart: string; lieu_arrivee: string; date_depart: string;
  date_arrivee_prevue: string; zone_collecte: string; exportateur_destination: string;
  observations: string; kilometrage_depart: string;
};

const missionVide: MissionForm = {
  vehicule_id: "", chauffeur_id: "", type_mission: "collecte",
  lieu_depart: "", lieu_arrivee: "", date_depart: "",
  date_arrivee_prevue: "", zone_collecte: "", exportateur_destination: "",
  observations: "", kilometrage_depart: "",
};

type TerminerForm = {
  date_arrivee_reelle: string; kilometrage_arrivee: string;
  cout_carburant_fcfa: string; cout_chauffeur_fcfa: string;
  cout_peage_fcfa: string; cout_divers_fcfa: string; poids_charge_kg: string; observations: string;
};

function TabMissions() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: vehiculesData } = useGetVehicules();
  const { data: chauffeursData } = useGetChauffeurs();
  const { data } = useGetMissions();
  const createMut = useCreateMission({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetMissionsQueryKey() }); toast({ title: "Mission planifiée" }); setShowForm(false); } } });
  const demarrerMut = useDemarrerMission({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetMissionsQueryKey() }); qc.invalidateQueries({ queryKey: getGetVehiculesQueryKey() }); toast({ title: "Mission démarrée" }); } } });
  const terminerMut = useTerminerMission({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetMissionsQueryKey() }); qc.invalidateQueries({ queryKey: getGetVehiculesQueryKey() }); qc.invalidateQueries({ queryKey: getGetRapportCampagneTransportQueryKey() }); toast({ title: "Mission terminée ✓" }); setTerminerId(null); } } });

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<MissionForm>(missionVide);
  const [terminerId, setTerminerId] = useState<number | null>(null);
  const [terminerForm, setTerminerForm] = useState<TerminerForm>({
    date_arrivee_reelle: "", kilometrage_arrivee: "", cout_carburant_fcfa: "0",
    cout_chauffeur_fcfa: "0", cout_peage_fcfa: "0", cout_divers_fcfa: "0",
    poids_charge_kg: "", observations: "",
  });

  const missions = (data?.missions as unknown as MissionRow[]) ?? [];
  const vehicules = vehiculesData?.vehicules ?? [];
  const chauffeurs = chauffeursData?.chauffeurs ?? [];
  const disponibles = vehicules.filter(v => v.statut === "disponible");

  function handleSubmit() {
    if (!form.vehicule_id || !form.chauffeur_id || !form.lieu_depart || !form.lieu_arrivee || !form.date_depart) return;
    createMut.mutate({
      data: {
        vehicule_id: Number(form.vehicule_id), chauffeur_id: Number(form.chauffeur_id),
        type_mission: form.type_mission as "collecte" | "livraison_export" | "intrants" | "autre",
        lieu_depart: form.lieu_depart, lieu_arrivee: form.lieu_arrivee,
        date_depart: form.date_depart,
        date_arrivee_prevue: form.date_arrivee_prevue || undefined,
        zone_collecte: form.zone_collecte || undefined,
        exportateur_destination: form.exportateur_destination || undefined,
        observations: form.observations || undefined,
        kilometrage_depart: form.kilometrage_depart ? Number(form.kilometrage_depart) : undefined,
      },
    });
  }

  function handleTerminer() {
    if (!terminerId || !terminerForm.date_arrivee_reelle || !terminerForm.kilometrage_arrivee || !terminerForm.poids_charge_kg) return;
    terminerMut.mutate({
      id: terminerId,
      data: {
        date_arrivee_reelle:  terminerForm.date_arrivee_reelle,
        kilometrage_arrivee:  Number(terminerForm.kilometrage_arrivee),
        cout_carburant_fcfa:  Number(terminerForm.cout_carburant_fcfa),
        cout_chauffeur_fcfa:  Number(terminerForm.cout_chauffeur_fcfa),
        cout_peage_fcfa:      Number(terminerForm.cout_peage_fcfa),
        cout_divers_fcfa:     Number(terminerForm.cout_divers_fcfa),
        poids_charge_kg:      Number(terminerForm.poids_charge_kg),
        observations:         terminerForm.observations || undefined,
      },
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-start gap-2">
        <div>
          <h2 className="text-lg font-semibold">Missions de transport</h2>
          <p className="text-sm text-gray-500">{missions.length} mission{missions.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => { setForm(missionVide); setShowForm(true); }} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />Planifier une mission
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date départ</TableHead>
              <TableHead>Véhicule</TableHead>
              <TableHead>Chauffeur</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Trajet</TableHead>
              <TableHead>Poids (kg)</TableHead>
              <TableHead>Coût total</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {missions.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-gray-400 py-8">Aucune mission</TableCell></TableRow>
            )}
            {missions.map(({ mission: m, vehicule: v, chauffeur: c }) => (
              <TableRow key={m.id}>
                <TableCell className="text-sm">{formatTs(m.date_depart)}</TableCell>
                <TableCell className="font-medium">{v?.immatriculation ?? "—"}</TableCell>
                <TableCell>{c ? `${c.nom} ${c.prenoms ?? ""}`.trim() : "—"}</TableCell>
                <TableCell><Badge variant="outline">{typeMission(m.type_mission)}</Badge></TableCell>
                <TableCell className="text-sm max-w-32 truncate">{m.lieu_depart} → {m.lieu_arrivee}</TableCell>
                <TableCell>{m.poids_charge_kg ? Number(m.poids_charge_kg).toLocaleString("fr-FR") : "—"}</TableCell>
                <TableCell>{m.cout_total_fcfa && Number(m.cout_total_fcfa) > 0 ? formatFcfa(String(m.cout_total_fcfa)) : "—"}</TableCell>
                <TableCell>{statutMission(m.statut)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {m.statut === "planifiee" && (
                      <Button size="sm" variant="outline" className="text-blue-600" onClick={() => demarrerMut.mutate({ id: m.id })}>
                        <Play className="h-3 w-3 mr-1" />Démarrer
                      </Button>
                    )}
                    {m.statut === "en_cours" && (
                      <Button size="sm" variant="outline" className="text-green-600" onClick={() => { setTerminerId(m.id); setTerminerForm({ date_arrivee_reelle: new Date().toISOString().slice(0,16), kilometrage_arrivee: "", cout_carburant_fcfa: "0", cout_chauffeur_fcfa: "0", cout_peage_fcfa: "0", cout_divers_fcfa: "0", poids_charge_kg: "", observations: "" }); }}>
                        <Square className="h-3 w-3 mr-1" />Terminer
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Modal planifier mission */}
      <Dialog open={showForm} onOpenChange={o => { if (!o) setShowForm(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Planifier une mission</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Véhicule disponible *</Label>
              <Select value={form.vehicule_id} onValueChange={v => setForm(f => ({ ...f, vehicule_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {disponibles.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.immatriculation} {v.marque ? `— ${v.marque}` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Chauffeur *</Label>
              <Select value={form.chauffeur_id} onValueChange={v => setForm(f => ({ ...f, chauffeur_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {chauffeurs.filter(c => c.statut === "actif").map(c => <SelectItem key={c.id} value={String(c.id)}>{c.nom} {c.prenoms ?? ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Type de mission *</Label>
              <Select value={form.type_mission} onValueChange={v => setForm(f => ({ ...f, type_mission: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="collecte">Collecte producteurs</SelectItem>
                  <SelectItem value="livraison_export">Livraison exportateur</SelectItem>
                  <SelectItem value="intrants">Transport intrants</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Lieu de départ *</Label>
              <Input value={form.lieu_depart} onChange={e => setForm(f => ({ ...f, lieu_depart: e.target.value }))} />
            </div>
            <div>
              <Label>Destination *</Label>
              <Input value={form.lieu_arrivee} onChange={e => setForm(f => ({ ...f, lieu_arrivee: e.target.value }))} />
            </div>
            <div>
              <Label>Date / heure départ *</Label>
              <Input type="datetime-local" value={form.date_depart} onChange={e => setForm(f => ({ ...f, date_depart: e.target.value }))} />
            </div>
            <div>
              <Label>Date arrivée prévue</Label>
              <Input type="datetime-local" value={form.date_arrivee_prevue} onChange={e => setForm(f => ({ ...f, date_arrivee_prevue: e.target.value }))} />
            </div>
            {form.type_mission === "collecte" && (
              <div className="col-span-2">
                <Label>Zone de collecte</Label>
                <Input value={form.zone_collecte} onChange={e => setForm(f => ({ ...f, zone_collecte: e.target.value }))} />
              </div>
            )}
            {form.type_mission === "livraison_export" && (
              <div className="col-span-2">
                <Label>Exportateur destination</Label>
                <Input value={form.exportateur_destination} onChange={e => setForm(f => ({ ...f, exportateur_destination: e.target.value }))} />
              </div>
            )}
            <div>
              <Label>Kilométrage départ</Label>
              <NumericInput decimal={false} value={form.kilometrage_depart} onChange={v => setForm(f => ({ ...f, kilometrage_depart: v }))} />
            </div>
            <div className="col-span-2">
              <Label>Observations</Label>
              <Textarea value={form.observations} onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending}>Planifier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal terminer mission */}
      <Dialog open={terminerId !== null} onOpenChange={o => { if (!o) setTerminerId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Terminer la mission</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Date / heure arrivée *</Label>
              <Input type="datetime-local" value={terminerForm.date_arrivee_reelle} onChange={e => setTerminerForm(f => ({ ...f, date_arrivee_reelle: e.target.value }))} />
            </div>
            <div>
              <Label>Kilométrage arrivée *</Label>
              <NumericInput decimal={false} value={terminerForm.kilometrage_arrivee} onChange={v => setTerminerForm(f => ({ ...f, kilometrage_arrivee: v }))} />
            </div>
            <div>
              <Label>Poids chargé (kg) *</Label>
              <NumericInput value={terminerForm.poids_charge_kg} onChange={v => setTerminerForm(f => ({ ...f, poids_charge_kg: v }))} />
            </div>
            <div>
              <Label>Coût carburant (FCFA)</Label>
              <MoneyInput value={terminerForm.cout_carburant_fcfa} onChange={(raw) => setTerminerForm(f => ({ ...f, cout_carburant_fcfa: raw }))} />
            </div>
            <div>
              <Label>Coût chauffeur (FCFA)</Label>
              <MoneyInput value={terminerForm.cout_chauffeur_fcfa} onChange={(raw) => setTerminerForm(f => ({ ...f, cout_chauffeur_fcfa: raw }))} />
            </div>
            <div>
              <Label>Péages (FCFA)</Label>
              <MoneyInput value={terminerForm.cout_peage_fcfa} onChange={(raw) => setTerminerForm(f => ({ ...f, cout_peage_fcfa: raw }))} />
            </div>
            <div>
              <Label>Divers (FCFA)</Label>
              <MoneyInput value={terminerForm.cout_divers_fcfa} onChange={(raw) => setTerminerForm(f => ({ ...f, cout_divers_fcfa: raw }))} />
            </div>
            <div className="col-span-2 rounded-lg bg-gray-50 p-3 text-sm">
              <span className="text-gray-500">Coût total estimé : </span>
              <span className="font-bold text-green-700">
                {formatFcfa(
                  (Number(terminerForm.cout_carburant_fcfa) || 0) +
                  (Number(terminerForm.cout_chauffeur_fcfa) || 0) +
                  (Number(terminerForm.cout_peage_fcfa) || 0) +
                  (Number(terminerForm.cout_divers_fcfa) || 0)
                )}
              </span>
            </div>
            <div className="col-span-2">
              <Label>Observations</Label>
              <Textarea value={terminerForm.observations} onChange={e => setTerminerForm(f => ({ ...f, observations: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminerId(null)}>Annuler</Button>
            <Button onClick={handleTerminer} disabled={terminerMut.isPending}>Terminer la mission</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Onglet Coûts & Rapports ──────────────────────────────────────────────────

function TabRapports() {
  const { data } = useGetRapportCampagneTransport();
  const { data: missionsData } = useGetMissions();

  const rapport = data;
  const missions = ((missionsData?.missions as unknown as MissionRow[]) ?? [])
    .filter(m => m.mission.statut === "terminee" && Number(m.mission.cout_total_fcfa) > 0)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Coûts & rapports transport</h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold text-green-700">{rapport?.nb_missions ?? 0}</div>
            <div className="text-sm text-gray-500 mt-1">Missions terminées</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold text-blue-700">{(rapport?.distance_totale_km ?? 0).toLocaleString("fr-FR")} km</div>
            <div className="text-sm text-gray-500 mt-1">Distance totale</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold text-orange-700">{formatFcfa(rapport?.cout_total_fcfa)}</div>
            <div className="text-sm text-gray-500 mt-1">Coût total transport</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-2xl font-bold text-purple-700">
              {rapport?.cout_moyen_kg_fcfa != null ? `${Number(rapport.cout_moyen_kg_fcfa).toFixed(1)} FCFA/kg` : "—"}
            </div>
            <div className="text-sm text-gray-500 mt-1">Coût moyen/kg</div>
          </CardContent>
        </Card>
      </div>

      {rapport?.vehicule_plus_utilise && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-500">Véhicule le plus utilisé</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg"><Truck className="h-5 w-5 text-green-700" /></div>
              <div>
                <div className="font-bold">{rapport.vehicule_plus_utilise.immatriculation}</div>
                <div className="text-sm text-gray-500">{rapport.vehicule_plus_utilise.nb_missions} missions</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-medium mb-3">Dernières missions terminées</h3>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead>Trajet</TableHead>
                <TableHead>Poids (kg)</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Coût total</TableHead>
                <TableHead>Coût/kg</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {missions.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">Aucune mission terminée</TableCell></TableRow>
              )}
              {missions.map(({ mission: m, vehicule: v }) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm">{formatTs(m.date_arrivee_reelle)}</TableCell>
                  <TableCell>{v?.immatriculation ?? "—"}</TableCell>
                  <TableCell className="text-sm max-w-36 truncate">{m.lieu_depart} → {m.lieu_arrivee}</TableCell>
                  <TableCell>{m.poids_charge_kg ? Number(m.poids_charge_kg).toLocaleString("fr-FR") : "—"}</TableCell>
                  <TableCell>{m.distance_km ? `${m.distance_km} km` : "—"}</TableCell>
                  <TableCell>{formatFcfa(String(m.cout_total_fcfa))}</TableCell>
                  <TableCell>{m.cout_par_kg_fcfa ? `${Number(m.cout_par_kg_fcfa).toFixed(1)} FCFA` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? "";

type AlerteVehicule = {
  vehicule_id: number; immatriculation: string;
  type: "assurance" | "visite_technique" | "entretien" | "entretien_km";
  message: string; date_expiration: string | null;
};
type AlerteChauffeur = {
  chauffeur_id: number; nom: string;
  type: "permis"; message: string; date_expiration: string | null;
};
type EntretienRow = {
  id: number; vehicule_id: number; type_entretien: string;
  date_entretien: string; kilometrage_entretien: number | null;
  description: string | null; cout_fcfa: number | null;
  garage: string | null; prochain_entretien_km: number | null;
  prochain_entretien_date: string | null; created_at: string;
};

const TYPES_ENTRETIEN = [
  "Vidange huile", "Vidange + filtres", "Revision generale",
  "Freins", "Pneus", "Batterie", "Courroie distribution",
  "Climatisation", "Assurance", "Visite technique", "Autre",
];

const URGENCE: Record<string, { label: string; icon: React.ReactNode; className: string; bg: string }> = {
  assurance:        { label: "Assurance",       icon: <ShieldAlert className="h-4 w-4" />,   className: "text-red-700",    bg: "bg-red-50 border-red-200" },
  visite_technique: { label: "Visite tech.",     icon: <CheckCircle2 className="h-4 w-4" />,  className: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  entretien:        { label: "Entretien date",   icon: <Wrench className="h-4 w-4" />,        className: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  entretien_km:     { label: "Entretien km",     icon: <Gauge className="h-4 w-4" />,         className: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  permis:           { label: "Permis chauffeur", icon: <AlertTriangle className="h-4 w-4" />, className: "text-red-700",    bg: "bg-red-50 border-red-200" },
};

type EntretienFormData = {
  type_entretien: string; date_entretien: string; kilometrage_entretien: string;
  description: string; cout_fcfa: string; garage: string;
  prochain_entretien_km: string; prochain_entretien_date: string;
};

const entretienVide: EntretienFormData = {
  type_entretien: "Vidange huile", date_entretien: new Date().toISOString().split("T")[0],
  kilometrage_entretien: "", description: "", cout_fcfa: "",
  garage: "", prochain_entretien_km: "", prochain_entretien_date: "",
};

function TabMaintenance() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [joursAlerte, setJoursAlerte] = useState<number>(() =>
    parseInt(localStorage.getItem("transport_seuil_jours") ?? "30") || 30,
  );
  const [seuilInput, setSeuilInput] = useState(String(joursAlerte));
  const [showSeuilEdit, setShowSeuilEdit] = useState(false);

  const [selectedVehiculeId, setSelectedVehiculeId] = useState<string>("");
  const [showEntretienForm, setShowEntretienForm] = useState(false);
  const [entretienTargetId, setEntretienTargetId] = useState<number | null>(null);
  const [form, setForm] = useState<EntretienFormData>(entretienVide);

  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const alertesQuery = useQuery({
    queryKey: ["transport-alertes-custom", joursAlerte],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/transport/vehicules/alertes?jours=${joursAlerte}`, { headers: authHeaders });
      if (!r.ok) throw new Error("Erreur alertes");
      return r.json() as Promise<{ alertes_vehicules: AlerteVehicule[]; alertes_chauffeurs: AlerteChauffeur[] }>;
    },
  });

  const { data: vehiculesData } = useGetVehicules();
  const vehicules = vehiculesData?.vehicules ?? [];

  const entretiensQuery = useQuery({
    queryKey: ["entretiens-vehicule", selectedVehiculeId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/transport/vehicules/${selectedVehiculeId}/entretiens`, { headers: authHeaders });
      if (!r.ok) throw new Error("Erreur entretiens");
      return r.json() as Promise<{ entretiens: EntretienRow[] }>;
    },
    enabled: !!selectedVehiculeId,
  });

  const createMut = useMutation({
    mutationFn: async ({ vehiculeId, data }: { vehiculeId: number; data: object }) => {
      const r = await fetch(`${BASE}/api/transport/vehicules/${vehiculeId}/entretien`, {
        method: "POST", headers: authHeaders, body: JSON.stringify(data),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur"); }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["entretiens-vehicule", selectedVehiculeId] });
      qc.invalidateQueries({ queryKey: ["transport-alertes-custom", joursAlerte] });
      qc.invalidateQueries({ queryKey: getGetVehiculesQueryKey() });
      toast({ title: "Entretien enregistre" });
      setShowEntretienForm(false);
      setForm(entretienVide);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  function saveSeuil() {
    const n = parseInt(seuilInput);
    if (!isNaN(n) && n >= 1 && n <= 365) {
      setJoursAlerte(n);
      localStorage.setItem("transport_seuil_jours", String(n));
    }
    setShowSeuilEdit(false);
  }

  function openEntretien(vehiculeId: number) {
    setEntretienTargetId(vehiculeId);
    if (String(vehiculeId) !== selectedVehiculeId) setSelectedVehiculeId(String(vehiculeId));
    setForm({ ...entretienVide, date_entretien: new Date().toISOString().split("T")[0] });
    setShowEntretienForm(true);
  }

  function handleSubmitEntretien() {
    if (!entretienTargetId || !form.type_entretien || !form.date_entretien) return;
    createMut.mutate({
      vehiculeId: entretienTargetId,
      data: {
        type_entretien:          form.type_entretien,
        date_entretien:          form.date_entretien,
        kilometrage_entretien:   form.kilometrage_entretien ? Number(form.kilometrage_entretien) : undefined,
        description:             form.description || undefined,
        cout_fcfa:               form.cout_fcfa ? Number(form.cout_fcfa) : undefined,
        garage:                  form.garage || undefined,
        prochain_entretien_km:   form.prochain_entretien_km ? Number(form.prochain_entretien_km) : undefined,
        prochain_entretien_date: form.prochain_entretien_date || undefined,
      },
    });
  }

  const alertesV = alertesQuery.data?.alertes_vehicules ?? [];
  const alertesC = alertesQuery.data?.alertes_chauffeurs ?? [];
  const totalAlertes = alertesV.length + alertesC.length;

  const alertesParType = Object.entries(URGENCE).map(([type, meta]) => ({
    type, meta,
    items: [
      ...alertesV.filter(a => a.type === type).map(a => ({
        id: `v${a.vehicule_id}`, label: a.immatriculation, message: a.message,
        date: a.date_expiration, vehiculeId: a.vehicule_id as number | null,
      })),
      ...alertesC.filter(a => a.type === type).map(a => ({
        id: `c${a.chauffeur_id}`, label: a.nom, message: a.message,
        date: a.date_expiration, vehiculeId: null,
      })),
    ],
  })).filter(g => g.items.length > 0);

  const entretiens = entretiensQuery.data?.entretiens ?? [];
  const selectedVehicule = vehicules.find(v => String(v.id) === selectedVehiculeId);

  return (
    <div className="space-y-6">

      {/* Seuil d'alerte */}
      <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Settings className="h-4 w-4" />
          <span>Seuil d'alerte : <strong>{joursAlerte} jours</strong> avant expiration</span>
        </div>
        {!showSeuilEdit ? (
          <Button variant="outline" size="sm" onClick={() => { setSeuilInput(String(joursAlerte)); setShowSeuilEdit(true); }}>
            Modifier
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              type="number" min={1} max={365} className="w-20 h-8 text-sm"
              value={seuilInput}
              onChange={e => setSeuilInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveSeuil(); if (e.key === "Escape") setShowSeuilEdit(false); }}
              autoFocus
            />
            <span className="text-sm text-gray-500">jours</span>
            <Button size="sm" onClick={saveSeuil}>OK</Button>
            <Button size="sm" variant="outline" onClick={() => setShowSeuilEdit(false)}>Annuler</Button>
          </div>
        )}
      </div>

      {/* Alertes consolidees */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-red-600" />
          <h2 className="text-base font-semibold">
            Alertes actives
            {totalAlertes > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold">{totalAlertes}</span>
            )}
          </h2>
        </div>

        {alertesQuery.isLoading && <div className="text-sm text-gray-400 py-4">Chargement...</div>}

        {!alertesQuery.isLoading && totalAlertes === 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 text-center">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-green-700 font-medium">Aucune alerte dans les {joursAlerte} prochains jours</p>
          </div>
        )}

        {alertesParType.length > 0 && (
          <div className="space-y-3">
            {alertesParType.map(({ type, meta, items }) => (
              <div key={type} className={`rounded-xl border p-4 ${meta.bg}`}>
                <div className={`flex items-center gap-2 font-semibold text-sm mb-2 ${meta.className}`}>
                  {meta.icon}{meta.label} ({items.length})
                </div>
                <div className="space-y-1">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{item.label}</span>
                        <span className="text-gray-600">— {item.message}</span>
                      </div>
                      {item.vehiculeId != null && (
                        <Button
                          size="sm" variant="outline" className="h-7 text-xs shrink-0 ml-2"
                          onClick={() => openEntretien(item.vehiculeId!)}
                        >
                          <Wrench className="h-3 w-3 mr-1" />Entretien
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historique entretiens */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <History className="h-5 w-5 text-gray-600" />
          <h2 className="text-base font-semibold">Historique des entretiens</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Select value={selectedVehiculeId} onValueChange={setSelectedVehiculeId}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Choisir un vehicule" />
            </SelectTrigger>
            <SelectContent>
              {vehicules.map(v => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.immatriculation}{v.marque ? ` — ${v.marque}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedVehiculeId && (
            <Button size="sm" onClick={() => openEntretien(Number(selectedVehiculeId))}>
              <Plus className="h-4 w-4 mr-1.5" />Nouvel entretien
            </Button>
          )}
        </div>

        {selectedVehiculeId && (
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Kilom.</TableHead>
                  <TableHead>Garage</TableHead>
                  <TableHead>Cout</TableHead>
                  <TableHead>Prochain entretien</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entretiensQuery.isLoading && (
                  <TableRow><TableCell colSpan={7} className="text-center text-gray-400 py-6">Chargement...</TableCell></TableRow>
                )}
                {!entretiensQuery.isLoading && entretiens.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-400 py-8">
                      <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p>Aucun entretien pour {selectedVehicule?.immatriculation}</p>
                    </TableCell>
                  </TableRow>
                )}
                {entretiens.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm font-medium">{formatDate(e.date_entretien)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{e.type_entretien}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.kilometrage_entretien != null ? `${e.kilometrage_entretien.toLocaleString("fr-FR")} km` : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{e.garage ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {e.cout_fcfa != null ? formatFcfa(e.cout_fcfa) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.prochain_entretien_date && <span>{formatDate(e.prochain_entretien_date)}</span>}
                      {e.prochain_entretien_km != null && <span className="ml-1 text-gray-500">/ {e.prochain_entretien_km.toLocaleString("fr-FR")} km</span>}
                      {!e.prochain_entretien_date && e.prochain_entretien_km == null && "—"}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-36 truncate">{e.description ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Modal entretien */}
      <Dialog open={showEntretienForm} onOpenChange={o => { if (!o) { setShowEntretienForm(false); setEntretienTargetId(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Enregistrer un entretien
              {entretienTargetId != null && vehicules.find(v => v.id === entretienTargetId) && (
                <span className="ml-2 text-green-700 font-normal text-base">
                  — {vehicules.find(v => v.id === entretienTargetId)!.immatriculation}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Type d'entretien *</Label>
              <Select value={form.type_entretien} onValueChange={v => setForm(f => ({ ...f, type_entretien: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES_ENTRETIEN.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date d'entretien *</Label>
              <Input type="date" value={form.date_entretien} onChange={e => setForm(f => ({ ...f, date_entretien: e.target.value }))} />
            </div>
            <div>
              <Label>Kilom. a l'entretien</Label>
            <NumericInput decimal={false} value={form.kilometrage_entretien} onChange={v => setForm(f => ({ ...f, kilometrage_entretien: v }))} placeholder="ex : 45 000" />
            </div>
            <div>
              <Label>Cout (FCFA)</Label>
              <MoneyInput value={form.cout_fcfa} onChange={raw => setForm(f => ({ ...f, cout_fcfa: raw }))} />
            </div>
            <div>
              <Label>Garage / prestataire</Label>
              <Input value={form.garage} onChange={e => setForm(f => ({ ...f, garage: e.target.value }))} placeholder="ex : Garage Coulibaly" />
            </div>
            <div>
              <Label>Prochain entretien (km)</Label>
            <NumericInput decimal={false} value={form.prochain_entretien_km} onChange={v => setForm(f => ({ ...f, prochain_entretien_km: v }))} placeholder="ex : 50 000" />
            </div>
            <div>
              <Label>Prochain entretien (date)</Label>
              <Input type="date" value={form.prochain_entretien_date} onChange={e => setForm(f => ({ ...f, prochain_entretien_date: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <Label>Description / observations</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Pieces changees, observations..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEntretienForm(false)}>Annuler</Button>
            <Button onClick={handleSubmitEntretien} disabled={createMut.isPending}>
              {createMut.isPending ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Onglet Bons de carburant ─────────────────────────────────────────────────

const STATUT_BON: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  demande:   { label: "Demande",    color: "bg-orange-100 text-orange-700", icon: <Send className="h-3 w-3" /> },
  brouillon: { label: "Brouillon",  color: "bg-gray-100 text-gray-700",   icon: <FileText className="h-3 w-3" /> },
  soumis:    { label: "Soumis",     color: "bg-blue-100 text-blue-800",    icon: <Send className="h-3 w-3" /> },
  approuve:  { label: "Approuvé",   color: "bg-green-100 text-green-800",  icon: <ThumbsUp className="h-3 w-3" /> },
  utilise:   { label: "Utilisé",    color: "bg-emerald-100 text-emerald-800", icon: <Droplets className="h-3 w-3" /> },
  annule:    { label: "Annulé",     color: "bg-red-100 text-red-800",      icon: <Ban className="h-3 w-3" /> },
};

const CARBURANT_TYPES = [
  { value: "gasoil",  label: "Gasoil" },
  { value: "essence", label: "Essence" },
  { value: "super",   label: "Super" },
];

interface BonForm {
  vehicule_id: string;
  chauffeur_id: string;
  type_carburant: string;
  montant_autorise_fcfa: number | string;
  quantite_autorisee: number | string;
  station_service: string;
  motif: string;
  date_emission: string;
}

interface UtiliserForm {
  montant_fcfa: number | string;
  quantite_livree: number | string;
  prix_litre_fcfa: number | string;
  date_utilisation: string;
  station_service: string;
  observations: string;
}

const EMPTY_BON_FORM: BonForm = {
  vehicule_id: "",
  chauffeur_id: "",
  type_carburant: "gasoil",
  montant_autorise_fcfa: "",
  quantite_autorisee: "",
  station_service: "",
  motif: "",
  date_emission: new Date().toISOString().split("T")[0],
};

const EMPTY_UTILISER_FORM: UtiliserForm = {
  montant_fcfa: "",
  quantite_livree: "",
  prix_litre_fcfa: "",
  date_utilisation: new Date().toISOString().split("T")[0],
  station_service: "",
  observations: "",
};

function statutBonBadge(statut: string) {
  const s = STATUT_BON[statut] ?? { label: statut, color: "bg-gray-100 text-gray-700", icon: null };
  return (
    <Badge className={`${s.color} flex items-center gap-1`}>{s.icon}{s.label}</Badge>
  );
}

// Le magasinier gère les bons de carburant de bout en bout, comme le PCA.
const ROLES_APPROBATEUR = ["pca", "directeur", "magasinier"];
const ROLES_EMETTEUR    = ["pca", "directeur", "magasinier"];

function TabCarburant() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { utilisateur } = useAuth();
  const role = utilisateur?.role ?? "";
  const peutApprouver = ROLES_APPROBATEUR.includes(role);
  const peutCreer     = ROLES_EMETTEUR.includes(role);

  const vehiculesQ = useGetVehicules();
  const vehicules  = vehiculesQ.data?.vehicules ?? [];
  const chauffeursQ = useGetChauffeurs();
  const chauffeurs  = chauffeursQ.data?.chauffeurs ?? [];

  const tok = () => localStorage.getItem("coop_token") ?? "";
  const stationsQ = useQuery<{ stations: StationAdminRow[] }>({
    queryKey: ["transport-stations-select"],
    queryFn:  () => fetch(`${BASE}/api/transport/stations-carburant`, {
      headers: { Authorization: `Bearer ${tok()}` },
    }).then(r => r.json() as Promise<{ stations: StationAdminRow[] }>),
  });
  const stationsActives = (stationsQ.data?.stations ?? []).filter(s => s.actif);

  // Filtres liste
  const [filterVehicule, setFilterVehicule] = useState("all");
  const [filterStatut,   setFilterStatut]   = useState("all");
  const [filterDebut,    setFilterDebut]    = useState("");
  const [filterFin,      setFilterFin]      = useState("");
  const [view, setView] = useState<"liste" | "stats">("liste");

  const bonsParams = {
    ...(filterVehicule !== "all" ? { vehicule_id: parseInt(filterVehicule) } : {}),
    ...(filterStatut   !== "all" ? { statut: filterStatut } : {}),
    ...(filterDebut ? { date_debut: filterDebut } : {}),
    ...(filterFin   ? { date_fin:   filterFin }   : {}),
  };
  const bonsQ  = useGetBonsCarburant(bonsParams);
  const bons   = bonsQ.data?.bons ?? [];
  const statsParams = {
    ...(filterVehicule !== "all" ? { vehicule_id: parseInt(filterVehicule) } : {}),
    ...(filterDebut ? { date_debut: filterDebut } : {}),
    ...(filterFin   ? { date_fin:   filterFin }   : {}),
  };
  const statsQ = useGetStatsCarburant(statsParams);
  const stats  = statsQ.data;

  // Dialogs
  const peutTraiter = ["pca", "directeur", "magasinier"].includes(role);

  const [showCreate, setShowCreate]       = useState(false);
  const [showUtiliser, setShowUtiliser]   = useState(false);
  const [showTraiter, setShowTraiter]     = useState(false);
  const [traiteBon, setTraiteBon]         = useState<BonCarburant | null>(null);
  const [traiterMontant, setTraiterMontant] = useState<string>("");
  const [selectedBon, setSelectedBon]     = useState<BonCarburant | null>(null);
  const [form,   setForm]   = useState<BonForm>(EMPTY_BON_FORM);
  const [uForm,  setUForm]  = useState<UtiliserForm>(EMPTY_UTILISER_FORM);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: getGetBonsCarburantQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetStatsCarburantQueryKey() });
  };

  const createMut = useCreateBonCarburant({ mutation: {
    onSuccess: () => { toast({ title: "Bon créé" }); setShowCreate(false); invalidate(); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  }});
  const soumMut = useSoumettresBonCarburant({ mutation: {
    onSuccess: () => { toast({ title: "Bon soumis pour approbation" }); invalidate(); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  }});
  const appMut = useApprouverBonCarburant({ mutation: {
    onSuccess: () => { toast({ title: "Bon approuvé ✓" }); invalidate(); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  }});
  const utilMut = useUtiliserBonCarburant({ mutation: {
    onSuccess: () => { toast({ title: "Utilisation enregistrée — dépense créée" }); setShowUtiliser(false); invalidate(); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  }});
  const annMut = useAnnulerBonCarburant({ mutation: {
    onSuccess: () => { toast({ title: "Bon annulé" }); invalidate(); },
    onError:   () => toast({ title: "Erreur", variant: "destructive" }),
  }});

  const traiterMut = useMutation({
      mutationFn: ({ id, montant_autorise_fcfa, quantite_autorisee }: { id: number; montant_autorise_fcfa: number; quantite_autorisee?: number }) =>
      fetch(`${BASE}/api/transport/carburant/bons/${id}/traiter`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("coop_token") ?? ""}`,
        },
        body: JSON.stringify({ montant_autorise_fcfa, ...(quantite_autorisee != null ? { quantite_autorisee } : {}) }),
      }).then(async r => {
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as {erreur?:string}).erreur ?? "Erreur"); }
        return r.json();
      }),
    onSuccess: () => {
      toast({ title: "Demande traitée — bon soumis pour approbation" });
      setShowTraiter(false);
      setTraiteBon(null);
      setTraiterMontant("");
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleCreate() {
    if (!form.vehicule_id || !form.montant_autorise_fcfa || !form.date_emission) return;
    createMut.mutate({ data: {
      vehicule_id:        parseInt(form.vehicule_id),
      ...(form.chauffeur_id ? { chauffeur_id: parseInt(form.chauffeur_id) } : {}),
      type_carburant:     form.type_carburant,
      montant_autorise_fcfa: Number(form.montant_autorise_fcfa),
      ...(form.quantite_autorisee !== "" ? { quantite_autorisee: Number(form.quantite_autorisee) } : {}),
      ...(form.station_service ? { station_service: form.station_service } : {}),
      ...(form.motif           ? { motif: form.motif }                     : {}),
      date_emission: form.date_emission,
    }});
  }

  function handleUtiliser() {
    if (!selectedBon || !uForm.montant_fcfa || !uForm.date_utilisation) return;
    utilMut.mutate({ id: selectedBon.id, data: {
      montant_fcfa:     Number(uForm.montant_fcfa),
      date_utilisation: uForm.date_utilisation,
      ...(uForm.quantite_livree !== "" ? { quantite_livree: Number(uForm.quantite_livree) } : {}),
      ...(uForm.prix_litre_fcfa !== "" ? { prix_litre_fcfa: Number(uForm.prix_litre_fcfa) } : {}),
      ...(uForm.station_service        ? { station_service: uForm.station_service }          : {}),
      ...(uForm.observations           ? { observations: uForm.observations }                : {}),
    }});
  }

  async function openPdf(bon: BonCarburant) {
    try {
      const blob = await getBonCarburantPdf(bon.id);
      openPdfViewer(URL.createObjectURL(blob), `bon-carburant-${bon.numero}.pdf`);
    } catch (e) {
      console.error(e);
      alert("Impossible de générer le PDF.");
    }
  }

  async function openReglementPdf() {
    const bonsUtilises = bons.filter(bon => bon.statut === "utilise");
    if (bonsUtilises.length === 0) {
      toast({
        title: "Aucun bon à régler",
        description: "Les bons utilisés en attente de règlement apparaîtront ici.",
        variant: "destructive",
      });
      return;
    }
    try {
      const params = new URLSearchParams({ ids: bonsUtilises.map(bon => String(bon.id)).join(",") });
      const response = await fetch(`${BASE}/api/transport/carburant/bons/reglement-pdf?${params.toString()}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { erreur?: string } | null;
        throw new Error(payload?.erreur ?? "Impossible de générer la fiche de règlement.");
      }
      const date = new Date();
      const dateFichier = [
        String(date.getDate()).padStart(2, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        date.getFullYear(),
      ].join("-");
      openPdfViewer(
        URL.createObjectURL(await response.blob()),
        `fiche-reglement-carburant-${dateFichier}.pdf`,
      );
    } catch (error) {
      toast({
        title: "Fiche de règlement impossible",
        description: error instanceof Error ? error.message : "Une erreur est survenue.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      {/* Barre de vues */}
      <div className="flex gap-2 border-b pb-2">
        <Button size="sm" variant={view === "liste"  ? "default" : "outline"} onClick={() => setView("liste")}>
          <FileText className="h-4 w-4 mr-1" /> Bons
        </Button>
        <Button size="sm" variant={view === "stats"  ? "default" : "outline"} onClick={() => setView("stats")}>
          <BarChart3 className="h-4 w-4 mr-1" /> Statistiques
        </Button>
        {view === "liste" && (
          <Button size="sm" variant="outline" onClick={() => void openReglementPdf()}>
            <Printer className="h-4 w-4 mr-1" /> Fiche de règlement
          </Button>
        )}
      </div>

      {view === "stats" ? (
        /* ─── Vue statistiques ─────────────────────────────────────────── */
        <div className="space-y-4">
          {statsQ.isLoading && (
            <Card className="p-8 text-center text-sm text-gray-500">
              Chargement des statistiques…
            </Card>
          )}
          {statsQ.isError && (
            <Card className="p-8 text-center">
              <p className="text-sm font-medium text-red-700">Impossible de charger les statistiques.</p>
              <p className="text-xs text-gray-500 mt-1">
                {statsQ.error instanceof Error ? statsQ.error.message : "Une erreur est survenue lors du chargement."}
              </p>
              <Button size="sm" variant="outline" className="mt-4" onClick={() => void statsQ.refetch()}>
                Réessayer
              </Button>
            </Card>
          )}
          {!statsQ.isLoading && !statsQ.isError && stats && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card className="p-3">
                  <div className="text-xs text-gray-500">Bons utilisés</div>
                  <div className="text-2xl font-bold">{stats.nb_bons}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-gray-500">Qté autorisée</div>
                  <div className="text-2xl font-bold">{stats.qte_autorisee_l.toFixed(0)} <span className="text-sm font-normal">L</span></div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-gray-500">Montant autorisé</div>
                  <div className="text-xl font-bold">{formatFcfa(stats.montant_autorise_total_fcfa)}</div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-gray-500">Qté livrée</div>
                  <div className="text-2xl font-bold text-green-700">{stats.qte_livree_l.toFixed(0)} <span className="text-sm font-normal">L</span></div>
                </Card>
                <Card className="p-3">
                  <div className="text-xs text-gray-500">Coût total</div>
                  <div className="text-xl font-bold">{formatFcfa(stats.montant_total_fcfa)}</div>
                </Card>
                <Card className="p-3 border-amber-200 bg-amber-50/50">
                  <div className="text-xs text-amber-700">Montant total en attente de règlement</div>
                  <div className="text-xl font-bold text-amber-700">{formatFcfa(stats.montant_total_en_attente_reglement_fcfa)}</div>
                  <div className="text-xs text-amber-600 mt-1">
                    {stats.nb_bons_en_attente_reglement} bon{stats.nb_bons_en_attente_reglement > 1 ? "s" : ""}
                  </div>
                </Card>
                <Card className="p-3 border-green-200 bg-green-50/50">
                  <div className="text-xs text-green-700">Montant total réglé</div>
                  <div className="text-xl font-bold text-green-700">{formatFcfa(stats.montant_total_regle_fcfa)}</div>
                  <div className="text-xs text-green-600 mt-1">
                    {stats.nb_bons_regles} bon{stats.nb_bons_regles > 1 ? "s" : ""}
                  </div>
                </Card>
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Consommation par véhicule</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Immatriculation</TableHead>
                        <TableHead>Marque</TableHead>
                        <TableHead className="text-right">Bons</TableHead>
                        <TableHead className="text-right">Litres livrés</TableHead>
                        <TableHead className="text-right">Montant autorisé</TableHead>
                        <TableHead className="text-right">Montant</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stats.par_vehicule.map((v, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-mono text-sm">{v.immatriculation ?? "—"}</TableCell>
                          <TableCell className="text-sm">{v.marque ?? "—"}</TableCell>
                          <TableCell className="text-right">{v.nb_bons}</TableCell>
                          <TableCell className="text-right font-semibold">{(v.qte_livree_l ?? 0).toFixed(1)} L</TableCell>
                          <TableCell className="text-right">{formatFcfa(v.montant_autorise_fcfa ?? 0)}</TableCell>
                          <TableCell className="text-right">{formatFcfa(v.montant_fcfa)}</TableCell>
                        </TableRow>
                      ))}
                      {stats.par_vehicule.length === 0 && (
                        <TableRow><TableCell colSpan={6} className="text-center text-gray-400 py-6">Aucune donnée</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      ) : (
        /* ─── Vue liste ────────────────────────────────────────────────── */
        <div className="space-y-4">
          {/* Filtres + créer */}
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[140px]">
              <Label className="text-xs">Véhicule</Label>
              <Select value={filterVehicule} onValueChange={setFilterVehicule}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {vehicules.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.immatriculation}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[130px]">
              <Label className="text-xs">Statut</Label>
              <Select value={filterStatut} onValueChange={setFilterStatut}>
                <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {Object.entries(STATUT_BON).map(([v, s]) => <SelectItem key={v} value={v}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Du</Label>
              <Input type="date" className="h-8 text-sm w-36" value={filterDebut} onChange={e => setFilterDebut(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Au</Label>
              <Input type="date" className="h-8 text-sm w-36" value={filterFin} onChange={e => setFilterFin(e.target.value)} />
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              La fiche regroupe les bons utilisés encore en attente, par station.
            </div>
            {peutCreer && (
              <Button size="sm" onClick={() => { setForm({ ...EMPTY_BON_FORM, vehicule_id: vehicules[0] ? String(vehicules[0].id) : "" }); setShowCreate(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Nouveau bon
              </Button>
            )}
          </div>

          {/* Table bons */}
          {bons.length === 0 ? (
            <Card className="p-12 text-center">
              <Fuel className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">Aucun bon de carburant</p>
              <p className="text-gray-400 text-xs mt-1">Créez un bon, soumettez-le, puis approuvez-le avant utilisation</p>
              {peutCreer && (
                <Button size="sm" className="mt-4" onClick={() => { setForm({ ...EMPTY_BON_FORM, vehicule_id: vehicules[0] ? String(vehicules[0].id) : "" }); setShowCreate(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Nouveau bon
                </Button>
              )}
            </Card>
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Bon</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Véhicule</TableHead>
                    <TableHead>Chauffeur</TableHead>
                    <TableHead>Carburant</TableHead>
                    <TableHead className="text-right">Montant auto.</TableHead>
                    <TableHead className="text-right">Qté auto.</TableHead>
                    <TableHead className="text-right">Qté livrée</TableHead>
                    <TableHead>Station</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="w-36" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bons.map(bon => (
                    <TableRow key={bon.id}>
                      <TableCell className="font-mono text-xs font-semibold text-green-700">{bon.numero}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(bon.date_emission)}</TableCell>
                      <TableCell className="text-sm font-mono">{bon.immatriculation ?? "—"}</TableCell>
                      <TableCell className="text-sm">{bon.chauffeur_nom ?? "—"}</TableCell>
                      <TableCell className="text-sm">{CARBURANT_TYPES.find(t => t.value === bon.type_carburant)?.label ?? bon.type_carburant}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{bon.montant_autorise_fcfa != null ? formatFcfa(bon.montant_autorise_fcfa) : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{bon.quantite_autorisee != null ? `${bon.quantite_autorisee} L` : "—"}</TableCell>
                      <TableCell className="text-right text-sm">{bon.quantite_livree != null ? `${bon.quantite_livree} L` : "—"}</TableCell>
                      <TableCell className="text-sm text-gray-500 max-w-[100px] truncate">{bon.station_service ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1 items-start">
                          {statutBonBadge(bon.statut)}
                          {/* Action primaire sous le badge — toujours visible */}
                          {bon.statut === "demande" && peutTraiter && (
                            <Button size="sm" className="h-6 text-xs px-2 bg-orange-500 hover:bg-orange-600 text-white"
                              onClick={() => { setTraiteBon(bon); setTraiterMontant(bon.montant_autorise_fcfa != null ? String(bon.montant_autorise_fcfa) : ""); setShowTraiter(true); }}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Traiter
                            </Button>
                          )}
                          {bon.statut === "demande" && !peutTraiter && (
                            <span className="text-xs text-orange-600">En attente traitement</span>
                          )}
                          {bon.statut === "brouillon" && peutCreer && (
                            <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                              onClick={() => soumMut.mutate({ id: bon.id })}>
                              <Send className="h-3 w-3 mr-1" /> Soumettre
                            </Button>
                          )}
                          {bon.statut === "soumis" && peutApprouver && (
                            <Button size="sm" className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700"
                              onClick={() => appMut.mutate({ id: bon.id })}>
                              <ThumbsUp className="h-3 w-3 mr-1" /> Approuver
                            </Button>
                          )}
                          {bon.statut === "soumis" && !peutApprouver && (
                            <span className="text-xs text-blue-600">Attente approbation</span>
                          )}
                          {bon.statut === "approuve" && (
                            <Button size="sm" className="h-6 text-xs px-2 bg-blue-600 hover:bg-blue-700"
                              onClick={() => { setSelectedBon(bon); setUForm({ ...EMPTY_UTILISER_FORM, station_service: bon.station_service ?? "" }); setShowUtiliser(true); }}>
                              <Droplets className="h-3 w-3 mr-1" /> Utiliser
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 justify-end">
                          {!["utilise","annule"].includes(bon.statut) && peutApprouver && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500"
                              onClick={() => { if (confirm("Annuler ce bon ?")) annMut.mutate({ id: bon.id }); }}>
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openPdf(bon)}>
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* ── Dialog traitement demande ── */}
      <Dialog open={showTraiter} onOpenChange={v => { setShowTraiter(v); if (!v) { setTraiteBon(null); setTraiterMontant(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Traiter la demande</DialogTitle>
            {traiteBon && (
              <p className="text-sm text-gray-500">
                Bon {traiteBon.numero} — {traiteBon.immatriculation ?? "—"} — demandé par <strong>{traiteBon.chauffeur_nom ?? "Chauffeur"}</strong>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            {traiteBon && (
              <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3 text-sm space-y-1">
                <p><span className="text-gray-500">Carburant :</span> <strong>{CARBURANT_TYPES.find(t => t.value === traiteBon.type_carburant)?.label ?? traiteBon.type_carburant}</strong></p>
                {traiteBon.motif && <p><span className="text-gray-500">Motif :</span> {traiteBon.motif}</p>}
                {traiteBon.station_service && <p><span className="text-gray-500">Station :</span> {traiteBon.station_service}</p>}
                {traiteBon.montant_autorise_fcfa != null && <p><span className="text-gray-500">Montant demandé :</span> {formatFcfa(traiteBon.montant_autorise_fcfa)}</p>}
                {traiteBon.quantite_autorisee != null && <p><span className="text-gray-500">Qté indicative :</span> {traiteBon.quantite_autorisee} L</p>}
              </div>
            )}
            <div>
              <Label>Montant autorisé (FCFA) *</Label>
               <NumericInput decimal={false} min={1} step="1" placeholder="Ex : 50 000"
                value={traiterMontant}
                 onChange={setTraiterMontant}
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">Le bon sera soumis pour approbation PCA/directeur.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTraiter(false)}>Annuler</Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              disabled={!traiterMontant || parseFloat(traiterMontant) <= 0 || traiterMut.isPending}
              onClick={() => traiteBon && traiterMut.mutate({ id: traiteBon.id, montant_autorise_fcfa: parseFloat(traiterMontant), ...(traiteBon.quantite_autorisee != null ? { quantite_autorisee: traiteBon.quantite_autorisee } : {}) })}
            >
              {traiterMut.isPending ? "Traitement…" : "Valider & soumettre"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog création ── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nouveau bon de carburant</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Véhicule *</Label>
                <Select value={form.vehicule_id} onValueChange={v => setForm(f => ({ ...f, vehicule_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Choisir..." /></SelectTrigger>
                  <SelectContent>
                    {vehicules.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.immatriculation} — {v.marque ?? ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Chauffeur</Label>
                <Select value={form.chauffeur_id || "none"} onValueChange={v => setForm(f => ({ ...f, chauffeur_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Aucun" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {chauffeurs.filter(c => c.statut === "actif").map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.prenoms ?? ""} {c.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type de carburant *</Label>
                <Select value={form.type_carburant} onValueChange={v => setForm(f => ({ ...f, type_carburant: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CARBURANT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Montant autorisé (FCFA) *</Label>
                 <NumericInput decimal={false} min={1} step="1" placeholder="50 000" value={form.montant_autorise_fcfa}
                   onChange={v => setForm(f => ({ ...f, montant_autorise_fcfa: v }))} />
              </div>
              <div>
                <Label>Quantité indicative (L)</Label>
                 <NumericInput min={0} step="any" placeholder="Optionnel" value={form.quantite_autorisee}
                   onChange={v => setForm(f => ({ ...f, quantite_autorisee: v }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date d'émission *</Label>
                <Input type="date" value={form.date_emission}
                  onChange={e => setForm(f => ({ ...f, date_emission: e.target.value }))} />
              </div>
              <div>
                <Label>Station-service</Label>
                <Select value={form.station_service} onValueChange={v => setForm(f => ({ ...f, station_service: v === "__aucune__" ? "" : v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une station…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__aucune__">— Aucune —</SelectItem>
                    {stationsActives.map(s => (
                      <SelectItem key={s.id} value={s.nom}>{s.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Motif</Label>
              <Input placeholder="Ex : Mission de collecte à Agboville" value={form.motif}
                onChange={e => setForm(f => ({ ...f, motif: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Annuler</Button>
            <Button onClick={handleCreate} disabled={!form.vehicule_id || !form.montant_autorise_fcfa || createMut.isPending}>
              Créer le bon
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog utilisation ── */}
      <Dialog open={showUtiliser} onOpenChange={setShowUtiliser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enregistrer l'utilisation</DialogTitle>
            {selectedBon && (
              <p className="text-sm text-gray-500">
                Bon {selectedBon.numero} — {selectedBon.immatriculation} — autorisé : <strong>{selectedBon.montant_autorise_fcfa != null ? formatFcfa(selectedBon.montant_autorise_fcfa) : "historique en litres"}</strong>
              </p>
            )}
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Montant réellement consommé (FCFA) *</Label>
                 <NumericInput decimal={false} min={1} step="1" placeholder="Ex : 47 500" value={uForm.montant_fcfa}
                   onChange={v => setUForm(f => ({ ...f, montant_fcfa: v }))} />
              </div>
              <div>
                <Label>Quantité réellement livrée (L)</Label>
                 <NumericInput min={0} step="any" placeholder="Optionnel" value={uForm.quantite_livree}
                   onChange={v => setUForm(f => ({ ...f, quantite_livree: v }))} />
              </div>
              <div>
                <Label>Date d'utilisation *</Label>
                <Input type="date" value={uForm.date_utilisation}
                  onChange={e => setUForm(f => ({ ...f, date_utilisation: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prix au litre (FCFA)</Label>
                 <NumericInput decimal={false} min={0} step="any" placeholder="Prix/L" value={uForm.prix_litre_fcfa}
                   onChange={v => setUForm(f => ({ ...f, prix_litre_fcfa: v }))} />
              </div>
              <div>
                  <Label>Montant saisi</Label>
                <div className="h-9 flex items-center px-3 rounded-md border bg-gray-50 text-sm font-semibold">
                  {uForm.montant_fcfa !== "" ? formatFcfa(Number(uForm.montant_fcfa)) : "—"}
                </div>
              </div>
            </div>
            <div>
              <Label>Station-service</Label>
              <Select value={uForm.station_service} onValueChange={v => setUForm(f => ({ ...f, station_service: v === "__aucune__" ? "" : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une station…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__aucune__">— Aucune —</SelectItem>
                  {stationsActives.map(s => (
                    <SelectItem key={s.id} value={s.nom}>{s.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observations</Label>
              <Input placeholder="Remarques éventuelles" value={uForm.observations}
                onChange={e => setUForm(f => ({ ...f, observations: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUtiliser(false)}>Annuler</Button>
            <Button onClick={handleUtiliser} disabled={!uForm.montant_fcfa || !uForm.date_utilisation || utilMut.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Onglet Dépenses véhicules ────────────────────────────────────────────────

const TYPE_DEPENSE = [
  { value: "carburant",     label: "Carburant",          icon: "⛽" },
  { value: "reparation",    label: "Réparation",          icon: "🔧" },
  { value: "piece_rechange",label: "Pièce de rechange",  icon: "📦" },
  { value: "autre",         label: "Autre dépense",       icon: "📋" },
] as const;

function typeDepenseLabel(t: string) {
  return TYPE_DEPENSE.find(x => x.value === t)?.label ?? t;
}

function typeDepenseBadge(t: string) {
  const colors: Record<string, string> = {
    carburant:      "bg-yellow-100 text-yellow-800",
    reparation:     "bg-red-100 text-red-800",
    piece_rechange: "bg-blue-100 text-blue-800",
    autre:          "bg-gray-100 text-gray-700",
  };
  return (
    <Badge className={colors[t] ?? "bg-gray-100 text-gray-700"}>
      {typeDepenseLabel(t)}
    </Badge>
  );
}

interface DepenseForm {
  type: string;
  date_depense: string;
  montant_fcfa: number | "";
  libelle: string;
  demandeur: string;
  fournisseur: string;
  reference_piece: string;
  quantite: number | string;
  unite: string;
}

const EMPTY_DEPENSE_FORM: DepenseForm = {
  type: "carburant",
  date_depense: new Date().toISOString().split("T")[0],
  montant_fcfa: "",
  libelle: "",
  demandeur: "",
  fournisseur: "",
  reference_piece: "",
  quantite: "",
  unite: "",
};

function TabDepenses() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const vehiculesQ = useGetVehicules();
  const vehicules = vehiculesQ.data?.vehicules ?? [];

  const [filterVehicule, setFilterVehicule] = useState<string>("all");
  const [filterType,     setFilterType]     = useState<string>("all");
  const [filterDebut,    setFilterDebut]    = useState("");
  const [filterFin,      setFilterFin]      = useState("");

  const params = {
    ...(filterVehicule !== "all" ? { vehicule_id: parseInt(filterVehicule) } : {}),
    ...(filterType !== "all"     ? { type: filterType } : {}),
    ...(filterDebut              ? { date_debut: filterDebut } : {}),
    ...(filterFin                ? { date_fin: filterFin } : {}),
  };
  const depensesQ = useGetDepensesTransport(params);
  const depenses  = depensesQ.data?.depenses ?? [];
  const totalFcfa = depensesQ.data?.total_fcfa ?? 0;

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing]       = useState<DepenseVehicule | null>(null);
  const [form, setForm]             = useState<DepenseForm>(EMPTY_DEPENSE_FORM);
  const [vehiculeId, setVehiculeId] = useState<string>("");
  const [pdfLoadingId, setPdfLoadingId] = useState<number | null>(null);

  async function openBonAchat(d: DepenseVehicule) {
    try {
      setPdfLoadingId(d.id);
      const base = import.meta.env.VITE_API_URL ?? "";
      const token = localStorage.getItem("coop_token") ?? "";
      const emission = await fetch(`${base}/api/transport/depenses/${d.id}/emettre-bon-achat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!emission.ok) throw new Error("Impossible d'émettre le bon d'achat");
      // L'émission crée le règlement en attente. Invalider les requêtes
      // partagées pour que la page Règlements déjà ouverte le voie aussitôt.
      await Promise.all([
        qc.invalidateQueries({ queryKey: getListPaiementsQueryKey() }),
        qc.invalidateQueries({ queryKey: getGetPaiementsStatsQueryKey() }),
      ]);
      const response = await fetch(`${base}/api/transport/depenses/${d.id}/bon-achat-pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Impossible de générer le bon d'achat");
      openPdfViewer(URL.createObjectURL(await response.blob()), `bon-achat-piece-BAP-${String(d.id).padStart(5, "0")}.pdf`);
    } catch {
      toast({ title: "Erreur", description: "Impossible d'émettre le bon d'achat", variant: "destructive" });
    } finally {
      setPdfLoadingId(null);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_DEPENSE_FORM);
    setVehiculeId(vehicules[0] ? String(vehicules[0].id) : "");
    setShowDialog(true);
  }
  function openEdit(d: DepenseVehicule) {
    setEditing(d);
    setVehiculeId(String(d.vehicule_id));
    setForm({
      type:           d.type,
      date_depense:   d.date_depense,
      montant_fcfa:   d.montant_fcfa,
      libelle:        d.libelle,
      demandeur:      d.demandeur ?? "",
      fournisseur:    d.fournisseur ?? "",
      reference_piece:d.reference_piece ?? "",
      quantite:       d.quantite ?? "",
      unite:          d.unite ?? "",
    });
    setShowDialog(true);
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetDepensesTransportQueryKey() });

  const createMut = useCreateDepenseVehicule({
    mutation: {
      onSuccess: () => { toast({ title: "Dépense enregistrée" }); setShowDialog(false); invalidate(); },
      onError:   () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const updateMut = useUpdateDepenseVehicule({
    mutation: {
      onSuccess: () => { toast({ title: "Dépense modifiée" }); setShowDialog(false); invalidate(); },
      onError:   () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const deleteMut = useDeleteDepenseVehicule({
    mutation: {
      onSuccess: () => { toast({ title: "Dépense supprimée" }); invalidate(); },
      onError:   () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  function handleSubmit() {
    if (!vehiculeId || !form.libelle || !form.montant_fcfa) return;
    const body = {
      type:           form.type,
      date_depense:   form.date_depense,
      montant_fcfa:   Number(form.montant_fcfa),
      libelle:        form.libelle,
      ...(form.type === "piece_rechange" && form.demandeur.trim() ? { demandeur: form.demandeur.trim() } : {}),
      ...(form.fournisseur     ? { fournisseur: form.fournisseur } : {}),
      ...(form.reference_piece ? { reference_piece: form.reference_piece } : {}),
      ...(form.quantite !== "" ? { quantite: Number(form.quantite), unite: form.unite || undefined } : {}),
    };
    if (editing) {
      updateMut.mutate({ id: editing.id, data: body });
    } else {
      createMut.mutate({ id: parseInt(vehiculeId), data: body });
    }
  }

  // Totaux par catégorie
  const totauxParType = TYPE_DEPENSE.map(t => ({
    ...t,
    total: depenses.filter(d => d.type === t.value).reduce((s, d) => s + d.montant_fcfa, 0),
  }));

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {totauxParType.map(t => (
          <Card key={t.value} className="p-3">
            <div className="text-lg">{t.icon}</div>
            <div className="text-xs text-gray-500 mt-1">{t.label}</div>
            <div className="font-bold text-sm">{t.total > 0 ? formatFcfa(t.total) : "—"}</div>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[160px]">
          <Label className="text-xs">Véhicule</Label>
          <Select value={filterVehicule} onValueChange={setFilterVehicule}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les véhicules</SelectItem>
              {vehicules.map(v => (
                <SelectItem key={v.id} value={String(v.id)}>{v.immatriculation} — {v.marque ?? ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs">Type</Label>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les types</SelectItem>
              {TYPE_DEPENSE.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Du</Label>
          <Input type="date" className="h-8 text-sm w-36" value={filterDebut} onChange={e => setFilterDebut(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Au</Label>
          <Input type="date" className="h-8 text-sm w-36" value={filterFin} onChange={e => setFilterFin(e.target.value)} />
        </div>
        <Button size="sm" onClick={openCreate} className="flex items-center gap-1.5">
          <Plus className="h-4 w-4" /> Nouvelle dépense
        </Button>
      </div>

      {/* Total */}
      <div className="flex items-center justify-between px-1">
        <span className="text-sm text-gray-500">{depenses.length} dépense{depenses.length !== 1 ? "s" : ""}</span>
        <span className="font-semibold text-base">{formatFcfa(totalFcfa)}</span>
      </div>

      {/* Table */}
      {depenses.length === 0 ? (
        <Card className="p-12 text-center">
          <Receipt className="h-12 w-12 mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">Aucune dépense enregistrée</p>
          <p className="text-gray-400 text-xs mt-1">Carburant, réparations, pièces de rechange…</p>
          <Button size="sm" className="mt-4" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Enregistrer une dépense</Button>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Véhicule</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Fournisseur</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="w-16" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {depenses.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(d.date_depense)}</TableCell>
                  <TableCell className="text-sm font-mono">{d.immatriculation ?? "—"}</TableCell>
                  <TableCell>{typeDepenseBadge(d.type)}</TableCell>
                  <TableCell className="text-sm max-w-[200px] truncate">{d.libelle}</TableCell>
                  <TableCell className="text-sm text-gray-500">{d.fournisseur ?? "—"}</TableCell>
                  <TableCell className="text-right text-sm font-semibold whitespace-nowrap">{formatFcfa(d.montant_fcfa)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {d.type === "piece_rechange" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-green-700"
                          title="Émettre, imprimer ou télécharger le bon d'achat"
                          disabled={pdfLoadingId === d.id}
                          onClick={() => void openBonAchat(d)}
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(d)}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => { if (confirm("Supprimer cette dépense ?")) deleteMut.mutate({ id: d.id }); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog saisie */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la dépense" : "Nouvelle dépense véhicule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && (
              <div>
                <Label>Véhicule *</Label>
                <Select value={vehiculeId} onValueChange={setVehiculeId}>
                  <SelectTrigger><SelectValue placeholder="Choisir un véhicule" /></SelectTrigger>
                  <SelectContent>
                    {vehicules.map(v => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.immatriculation} — {v.marque ?? ""} {v.modele ?? ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type de dépense *</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPE_DEPENSE.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date_depense}
                  onChange={e => setForm(f => ({ ...f, date_depense: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Libellé *</Label>
              <Input placeholder="Ex : Plein carburant véhicule AB-123" value={form.libelle}
                onChange={e => setForm(f => ({ ...f, libelle: e.target.value }))} />
            </div>
            <div>
              <Label>Montant (FCFA) *</Label>
              <MoneyInput value={form.montant_fcfa === "" ? 0 : form.montant_fcfa}
                onChange={(v) => setForm(f => ({ ...f, montant_fcfa: Number(v) }))} />
            </div>
            <div>
              <Label>Fournisseur / Garage</Label>
              <Input placeholder="Nom du fournisseur ou atelier" value={form.fournisseur}
                onChange={e => setForm(f => ({ ...f, fournisseur: e.target.value }))} />
            </div>
            {form.type === "piece_rechange" && (
              <div>
                <Label>Demandeur *</Label>
                <Input placeholder="Nom de la personne qui demande la pièce" value={form.demandeur}
                  onChange={e => setForm(f => ({ ...f, demandeur: e.target.value }))} />
              </div>
            )}
            {(form.type === "piece_rechange" || form.type === "autre") && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Référence pièce</Label>
                  <Input placeholder="Réf. ou désignation" value={form.reference_piece}
                    onChange={e => setForm(f => ({ ...f, reference_piece: e.target.value }))} />
                </div>
                <div>
                  <Label>Quantité</Label>
                  <div className="flex gap-2">
                    <NumericInput min={0} step="any" placeholder="0" value={form.quantite}
                      onChange={v => setForm(f => ({ ...f, quantite: v }))}
                      className="flex-1" />
                    <Input placeholder="unité" value={form.unite}
                      onChange={e => setForm(f => ({ ...f, unite: e.target.value }))}
                      className="w-24" />
                  </div>
                </div>
              </div>
            )}
            {form.type === "carburant" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Litres</Label>
                  <NumericInput min={0} step="any" placeholder="0" value={form.quantite}
                    onChange={v => setForm(f => ({ ...f, quantite: v, unite: "L" }))} />
                </div>
                <div>
                  <Label>Unité</Label>
                  <Input value="L" readOnly className="bg-gray-50" />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button onClick={handleSubmit}
              disabled={!vehiculeId || !form.libelle || !form.montant_fcfa
                || (form.type === "piece_rechange" && !form.demandeur.trim())
                || createMut.isPending || updateMut.isPending}>
              {editing ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Stations-service ──────────────────────────────────────────────────────────

interface StationAdminRow {
  id: number;
  nom: string;
  adresse: string | null;
  types_carburant: string[];
  latitude: number | null;
  longitude: number | null;
  actif: boolean;
}

const TYPE_CARB_OPTS = [
  { value: "gasoil",  label: "Gasoil" },
  { value: "essence", label: "Essence" },
  { value: "super",   label: "Super" },
];

// hint: Logic changed on both sides. Requires understanding intent of each change.
function TabStationsCarburant() {
  const BASE = import.meta.env.VITE_API_URL ?? "";
  const { toast } = useToast();
  const qc = useQueryClient();
  const QK = ["stations-carburant"];

  const { data, isLoading } = useQuery<{ stations: StationAdminRow[] }>({
    queryKey: QK,
    queryFn: () => fetch(`${BASE}/api/transport/stations-carburant`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("coop_token") ?? ""}` },
    }).then(r => r.json() as Promise<{ stations: StationAdminRow[] }>),
  });

  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<StationAdminRow | null>(null);
  const [form, setForm] = useState({ nom: "", adresse: "", types: ["gasoil"], latitude: "", longitude: "" });

  const authHeader = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${localStorage.getItem("coop_token") ?? ""}`,
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        nom: form.nom.trim(),
        adresse: form.adresse.trim() || null,
        types_carburant: form.types,
        latitude:  form.latitude  !== "" ? Number(form.latitude)  : null,
        longitude: form.longitude !== "" ? Number(form.longitude) : null,
      };
      const url  = editing
        ? `${BASE}/api/transport/stations-carburant/${editing.id}`
        : `${BASE}/api/transport/stations-carburant`;
      const res = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: authHeader(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `HTTP ${res.status}`;
        try { const d = JSON.parse(text) as { erreur?: string }; msg = d.erreur ? `${res.status} — ${d.erreur}` : `${res.status} — ${text}`; } catch { msg = `${res.status} — ${text}`; }
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QK });
      toast({ title: editing ? "Station mise à jour" : "Station ajoutée" });
      setShowDialog(false);
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const archiveMut = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/transport/stations-carburant/${id}`, {
      method: "DELETE", headers: authHeader(),
    }).then(r => r.json()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK }); toast({ title: "Station archivée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const restoreMut = useMutation({
    mutationFn: (s: StationAdminRow) => fetch(`${BASE}/api/transport/stations-carburant/${s.id}`, {
      method: "PUT", headers: authHeader(),
      body: JSON.stringify({ actif: true }),
    }).then(r => r.json()),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: QK }); toast({ title: "Station réactivée" }); },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  // ── Modal de prévisualisation de l'import ──
  const [showPreview, setShowPreview] = useState(false);
  const [selectedNoms, setSelectedNoms] = useState<Set<string>>(new Set());

  interface PreviewRow { nom: string; types_carburant: string[]; count: number; }
  const previewQuery = useQuery<{ stations: PreviewRow[] }>({
    queryKey: [...QK, "preview"],
    queryFn: () => fetch(`${BASE}/api/transport/stations-carburant/historique-preview`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("coop_token") ?? ""}` },
    }).then(r => r.json() as Promise<{ stations: PreviewRow[] }>),
    enabled: showPreview,
    staleTime: 0,
  });
  const previewRows = previewQuery.data?.stations ?? [];

  function openPreview() {
    setShowPreview(true);
    // pré-sélectionner tout après le chargement (géré dans useEffect ci-dessous)
  }
  // Sélectionner tout automatiquement quand les données arrivent
  const prevPreviewRows = previewRows;
  if (showPreview && previewQuery.isSuccess && selectedNoms.size === 0 && prevPreviewRows.length > 0) {
    setSelectedNoms(new Set(prevPreviewRows.map(r => r.nom)));
  }

  function toggleNom(nom: string) {
    setSelectedNoms(prev => {
      const next = new Set(prev);
      if (next.has(nom)) next.delete(nom); else next.add(nom);
      return next;
    });
  }
  function selectAll()   { setSelectedNoms(new Set(previewRows.map(r => r.nom))); }
  function deselectAll() { setSelectedNoms(new Set()); }

  const confirmImportMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/transport/stations-carburant/importer-historique`, {
        method: "POST",
        headers: authHeader(),
        body: JSON.stringify({ noms: [...selectedNoms] }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error((d as { erreur?: string }).erreur ?? "Erreur"); }
      return res.json() as Promise<{ importees: number }>;
    },
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: QK });
      void qc.invalidateQueries({ queryKey: [...QK, "preview"] });
      toast({ title: d.importees > 0 ? `${d.importees} station${d.importees > 1 ? "s" : ""} importée${d.importees > 1 ? "s" : ""}` : "Aucune station importée" });
      setShowPreview(false);
      setSelectedNoms(new Set());
    },
    onError: (e: Error) => toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ nom: "", adresse: "", types: ["gasoil"], latitude: "", longitude: "" });
    setShowDialog(true);
  }
  function openEdit(s: StationAdminRow) {
    setEditing(s);
    setForm({
      nom: s.nom,
      adresse: s.adresse ?? "",
      types: [...s.types_carburant],
      latitude:  s.latitude  != null ? String(s.latitude)  : "",
      longitude: s.longitude != null ? String(s.longitude) : "",
    });
    setShowDialog(true);
  }
  function toggleType(t: string) {
    setForm(f => ({
      ...f,
      types: f.types.includes(t) ? f.types.filter(x => x !== t) : [...f.types, t],
    }));
  }

  const stations = data?.stations ?? [];
  const actives  = stations.filter(s => s.actif);
  const archivees = stations.filter(s => !s.actif);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Stations-service partenaires</h2>
          <p className="text-sm text-gray-500">
            Ces stations apparaissent dans l'application chauffeur même avant la première utilisation de bon.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openPreview} className="gap-2">
            <History className="h-4 w-4" />
            Importer depuis l'historique
          </Button>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Ajouter une station
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : actives.length === 0 && archivees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 gap-3 text-gray-500">
            <MapPin className="h-10 w-10 text-gray-300" />
            <p className="font-medium">Aucune station configurée</p>
            <p className="text-sm text-center max-w-xs">
              Ajoutez les stations-service partenaires de votre coopérative.
              Les chauffeurs pourront les consulter depuis leur application.
            </p>
            <Button onClick={openCreate} variant="outline" className="mt-2 gap-2">
              <Plus className="h-4 w-4" /> Ajouter la première station
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Actives */}
          {actives.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Stations actives ({actives.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead>Carburants</TableHead>
                      <TableHead>GPS</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {actives.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.nom}</TableCell>
                        <TableCell className="text-gray-500 text-sm">{s.adresse ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5 flex-wrap">
                            {s.types_carburant.map(t => (
                              <Badge key={t} variant="secondary" className="text-xs">
                                {TYPE_CARB_OPTS.find(o => o.value === t)?.label ?? t}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {s.latitude != null && s.longitude != null
                            ? <Badge variant="outline" className="text-xs text-green-700 border-green-300 gap-1 whitespace-nowrap"><MapPin className="h-3 w-3" />{s.latitude.toFixed(4)}, {s.longitude.toFixed(4)}</Badge>
                            : <span className="text-gray-400 text-xs">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => archiveMut.mutate(s.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Archivées */}
          {archivees.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-gray-500">Archivées ({archivees.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nom</TableHead>
                      <TableHead>Adresse</TableHead>
                      <TableHead>Carburants</TableHead>
                      <TableHead className="text-right">Réactiver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {archivees.map(s => (
                      <TableRow key={s.id} className="opacity-60">
                        <TableCell className="font-medium">{s.nom}</TableCell>
                        <TableCell className="text-gray-500 text-sm">{s.adresse ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1.5 flex-wrap">
                            {s.types_carburant.map(t => (
                              <Badge key={t} variant="outline" className="text-xs">
                                {TYPE_CARB_OPTS.find(o => o.value === t)?.label ?? t}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="outline" onClick={() => restoreMut.mutate(s)}>
                            Réactiver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Dialog ajouter / modifier */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier la station" : "Nouvelle station-service"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nom de la station *</Label>
              <Input placeholder="Ex: Total Plateau" value={form.nom}
                onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Adresse (facultatif)</Label>
              <Input placeholder="Ex: Avenue Chardy, Plateau" value={form.adresse}
                onChange={e => setForm(f => ({ ...f, adresse: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Types de carburant distribués *</Label>
              <div className="flex gap-3">
                {TYPE_CARB_OPTS.map(opt => (
                  <label key={opt.value} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={form.types.includes(opt.value)}
                      onChange={() => toggleType(opt.value)}
                      className="rounded" />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              {form.types.length === 0 && (
                <p className="text-xs text-red-500">Sélectionnez au moins un type de carburant</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-gray-400" />
                Coordonnées GPS (facultatif)
              </Label>
              <p className="text-xs text-gray-400">Permettent aux chauffeurs d'obtenir un itinéraire précis.</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs text-gray-500">Latitude</Label>
                  <Input
                    type="number" step="0.0000001" placeholder="5.3600000"
                    value={form.latitude}
                    onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Longitude</Label>
                  <Input
                    type="number" step="0.0000001" placeholder="-4.0080000"
                    value={form.longitude}
                    onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))}
                  />
                </div>
              </div>
              {/* Pair completeness */}
              {(form.latitude !== "") !== (form.longitude !== "") && (
                <p className="text-xs text-red-500">Latitude et longitude doivent être renseignées ensemble</p>
              )}
              {/* Range check */}
              {form.latitude !== "" && form.longitude !== "" && (() => {
                const lat = Number(form.latitude), lng = Number(form.longitude);
                return (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lng) || lng < -180 || lng > 180);
              })() && (
                <p className="text-xs text-red-500">Latitude entre -90 et 90, longitude entre -180 et 180</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={(() => {
                if (!form.nom.trim() || form.types.length === 0 || saveMut.isPending) return true;
                const hasLat = form.latitude !== "", hasLng = form.longitude !== "";
                if (hasLat !== hasLng) return true;
                if (hasLat && hasLng) {
                  const lat = Number(form.latitude), lng = Number(form.longitude);
                  if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lng) || lng < -180 || lng > 180) return true;
                }
                return false;
              })()}
            >
              {editing ? "Enregistrer" : "Ajouter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Modal prévisualisation de l'import historique ── */}
      <Dialog open={showPreview} onOpenChange={o => { if (!o) { setShowPreview(false); setSelectedNoms(new Set()); } }}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Importer depuis l'historique</DialogTitle>
            <p className="text-sm text-gray-500">
              Ces noms de stations ont été utilisés dans vos bons de carburant mais ne sont pas encore configurés.
              Cochez ceux à importer.
            </p>
          </DialogHeader>

          {previewQuery.isPending ? (
            <div className="flex-1 flex items-center justify-center py-8 text-gray-400">Chargement…</div>
          ) : previewRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-8 gap-2 text-gray-500">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
              <p className="font-medium">Tout est déjà importé</p>
              <p className="text-sm text-center">Toutes les stations trouvées dans vos bons sont déjà dans votre liste configurée.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm text-gray-500 px-1">
                <span>{selectedNoms.size} / {previewRows.length} sélectionnée{previewRows.length > 1 ? "s" : ""}</span>
                <div className="flex gap-3">
                  <button onClick={selectAll}   className="text-blue-600 hover:underline">Tout sélectionner</button>
                  <button onClick={deselectAll} className="text-gray-500 hover:underline">Tout désélectionner</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto border rounded-md divide-y">
                {previewRows.map(row => (
                  <label key={row.nom} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedNoms.has(row.nom)}
                      onChange={() => toggleNom(row.nom)}
                      className="h-4 w-4 rounded flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{row.nom}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {row.types_carburant.map(t => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {TYPE_CARB_OPTS.find(o => o.value === t)?.label ?? t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {row.count} bon{row.count > 1 ? "s" : ""}
                    </span>
                  </label>
                ))}
              </div>
            </>
          )}

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => { setShowPreview(false); setSelectedNoms(new Set()); }}>Annuler</Button>
            {previewRows.length > 0 && (
              <Button
                onClick={() => confirmImportMut.mutate()}
                disabled={selectedNoms.size === 0 || confirmImportMut.isPending}
              >
                {confirmImportMut.isPending
                  ? "Importation…"
                  : `Importer ${selectedNoms.size} station${selectedNoms.size > 1 ? "s" : ""}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TransportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transport</h1>
        <p className="text-gray-500 text-sm mt-1">Gestion de la flotte, chauffeurs, missions et coûts</p>
      </div>

      <Tabs defaultValue="flotte">
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="flotte" className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">Flotte</span>
          </TabsTrigger>
          <TabsTrigger value="chauffeurs" className="flex items-center gap-1.5">
            <Users className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">Chauffeurs</span>
          </TabsTrigger>
          <TabsTrigger value="missions" className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">Missions</span>
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center gap-1.5">
            <Wrench className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">Maintenance</span>
          </TabsTrigger>
          <TabsTrigger value="carburant" className="flex items-center gap-1.5">
            <Fuel className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">Carburant</span>
          </TabsTrigger>
          <TabsTrigger value="depenses" className="flex items-center gap-1.5">
            <Receipt className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">Dépenses</span>
          </TabsTrigger>
          <TabsTrigger value="rapports" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">Coûts</span>
          </TabsTrigger>
          <TabsTrigger value="stations" className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="hidden sm:inline truncate">Stations</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flotte" className="mt-6"><TabFlotte /></TabsContent>
        <TabsContent value="chauffeurs" className="mt-6"><TabChauffeurs /></TabsContent>
        <TabsContent value="missions" className="mt-6"><TabMissions /></TabsContent>
        <TabsContent value="maintenance" className="mt-6"><TabMaintenance /></TabsContent>
        <TabsContent value="carburant" className="mt-6"><TabCarburant /></TabsContent>
        <TabsContent value="depenses" className="mt-6"><TabDepenses /></TabsContent>
        <TabsContent value="rapports" className="mt-6"><TabRapports /></TabsContent>
        <TabsContent value="stations" className="mt-6"><TabStationsCarburant /></TabsContent>
      </Tabs>
    </div>
  );
}

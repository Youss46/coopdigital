import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  getGetVehiculesQueryKey,
  getGetChauffeursQueryKey,
  getGetMissionsQueryKey,
  getGetTransportAlertesQueryKey,
  getGetRapportCampagneTransportQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
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
      capacite_kg: v.capacite_kg ? String(v.capacite_kg) : "",
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
      capacite_kg:                  form.capacite_kg ? Number(form.capacite_kg) : undefined,
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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Flotte de véhicules</h2>
          <p className="text-sm text-gray-500">{vehicules.length} véhicule{vehicules.length !== 1 ? "s" : ""} enregistré{vehicules.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Ajouter un véhicule</Button>
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
                    <span>{v.capacite_kg ? `${Number(v.capacite_kg).toLocaleString("fr-FR")} kg` : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Kilométrage</span>
                    <span>{v.kilometrage_actuel.toLocaleString("fr-FR")} km</span>
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
              <Label>Capacité (kg)</Label>
              <Input type="number" value={form.capacite_kg} onChange={e => setForm(f => ({ ...f, capacite_kg: e.target.value }))} />
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
              <Input type="number" value={form.kilometrage_actuel} onChange={e => setForm(f => ({ ...f, kilometrage_actuel: e.target.value }))} />
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
              <Input type="number" value={form.prochain_entretien_km} onChange={e => setForm(f => ({ ...f, prochain_entretien_km: e.target.value }))} />
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

function TabChauffeurs() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data } = useGetChauffeurs();
  const createMut = useCreateChauffeur({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetChauffeursQueryKey() }); toast({ title: "Chauffeur créé" }); setShowForm(false); } } });
  const updateMut = useUpdateChauffeur({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetChauffeursQueryKey() }); toast({ title: "Chauffeur modifié" }); setShowForm(false); setEditId(null); } } });
  const deleteMut = useDeleteChauffeur({ mutation: { onSuccess: () => { qc.invalidateQueries({ queryKey: getGetChauffeursQueryKey() }); toast({ title: "Chauffeur supprimé" }); } } });

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ChauffeurForm>(chauffeurVide);

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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Chauffeurs</h2>
          <p className="text-sm text-gray-500">{chauffeurs.length} chauffeur{chauffeurs.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Ajouter un chauffeur</Button>
      </div>

      <div className="rounded-lg border">
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
                  <TableCell>{c.categorie_permis ?? "—"}</TableCell>
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
                      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700" onClick={() => { if (confirm(`Supprimer ${c.nom} ?`)) deleteMut.mutate({ id: c.id }); }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

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
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Missions de transport</h2>
          <p className="text-sm text-gray-500">{missions.length} mission{missions.length !== 1 ? "s" : ""}</p>
        </div>
        <Button onClick={() => { setForm(missionVide); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />Planifier une mission
        </Button>
      </div>

      <div className="rounded-lg border">
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
              <Input type="number" value={form.kilometrage_depart} onChange={e => setForm(f => ({ ...f, kilometrage_depart: e.target.value }))} />
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
              <Input type="number" value={terminerForm.kilometrage_arrivee} onChange={e => setTerminerForm(f => ({ ...f, kilometrage_arrivee: e.target.value }))} />
            </div>
            <div>
              <Label>Poids chargé (kg) *</Label>
              <Input type="number" value={terminerForm.poids_charge_kg} onChange={e => setTerminerForm(f => ({ ...f, poids_charge_kg: e.target.value }))} />
            </div>
            <div>
              <Label>Coût carburant (FCFA)</Label>
              <Input type="number" value={terminerForm.cout_carburant_fcfa} onChange={e => setTerminerForm(f => ({ ...f, cout_carburant_fcfa: e.target.value }))} />
            </div>
            <div>
              <Label>Coût chauffeur (FCFA)</Label>
              <Input type="number" value={terminerForm.cout_chauffeur_fcfa} onChange={e => setTerminerForm(f => ({ ...f, cout_chauffeur_fcfa: e.target.value }))} />
            </div>
            <div>
              <Label>Péages (FCFA)</Label>
              <Input type="number" value={terminerForm.cout_peage_fcfa} onChange={e => setTerminerForm(f => ({ ...f, cout_peage_fcfa: e.target.value }))} />
            </div>
            <div>
              <Label>Divers (FCFA)</Label>
              <Input type="number" value={terminerForm.cout_divers_fcfa} onChange={e => setTerminerForm(f => ({ ...f, cout_divers_fcfa: e.target.value }))} />
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
        <div className="rounded-lg border">
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

export default function TransportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Transport</h1>
        <p className="text-gray-500 text-sm mt-1">Gestion de la flotte, chauffeurs, missions et coûts</p>
      </div>

      <Tabs defaultValue="flotte">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="flotte" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />Flotte
          </TabsTrigger>
          <TabsTrigger value="chauffeurs" className="flex items-center gap-2">
            <Users className="h-4 w-4" />Chauffeurs
          </TabsTrigger>
          <TabsTrigger value="missions" className="flex items-center gap-2">
            <MapPin className="h-4 w-4" />Missions
          </TabsTrigger>
          <TabsTrigger value="rapports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />Coûts & Rapports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="flotte" className="mt-6"><TabFlotte /></TabsContent>
        <TabsContent value="chauffeurs" className="mt-6"><TabChauffeurs /></TabsContent>
        <TabsContent value="missions" className="mt-6"><TabMissions /></TabsContent>
        <TabsContent value="rapports" className="mt-6"><TabRapports /></TabsContent>
      </Tabs>
    </div>
  );
}

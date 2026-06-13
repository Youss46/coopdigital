import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Ship, Plus, Trash2, CheckCircle2, XCircle, Leaf } from "lucide-react";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function apiFetch<T>(path: string, token: string | null): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, token: string | null, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { erreur?: string };
    throw new Error(err.erreur ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

interface LotLigne {
  key: string;
  poidsKg: string;
  nombreSacs: string;
  certificatEudr: string;
  parcelleOrigine: string;
}

interface Exportateur   { id: number; nom: string; }
interface VehiculeFlotte { id: number; immatriculation: string; marque?: string; modele?: string; capaciteKg?: string; statut: string; }
interface ChauffeurFlotte { id: number; nom: string; prenoms?: string; telephone?: string; }

const DOCS_REQUIS = [
  { key: "bon_livraison",       label: "Bon de livraison" },
  { key: "bordereau_transport", label: "Bordereau de transport" },
];

const DOCS_OPTIONNELS = [
  { key: "document_eudr", label: "Documents EUDR" },
];

export default function NouvelleExpeditionPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Véhicule
  const [typeVehicule, setTypeVehicule] = useState<"propre" | "location">("propre");
  const [vehiculeId, setVehiculeId] = useState("");
  const [chauffeurId, setChauffeurId] = useState("");
  const [immatriculationLibre, setImmatriculationLibre] = useState("");
  const [nomChauffeurLibre, setNomChauffeurLibre] = useState("");
  const [telephoneChauffeurLibre, setTelephoneChauffeurLibre] = useState("");
  const [transporteur, setTransporteur] = useState("");
  const [numeroBonTransport, setNumeroBonTransport] = useState("");

  // Chargement
  const [dateDepart, setDateDepart] = useState("");
  const [lieuDepart, setLieuDepart] = useState("Magasin central");
  const [poidsCharge, setPoidsCharge] = useState("");
  const [nombreSacs, setNombreSacs] = useState("");
  const [numeroLots, setNumeroLots] = useState("");

  // Destination
  const [port, setPort] = useState("Abidjan");
  const [portAutre, setPortAutre] = useState("");
  const [entrepotDestination, setEntrepotDestination] = useState("");
  const [exportateurId, setExportateurId] = useState("__libre__");
  const [exportateurNom, setExportateurNom] = useState("");
  const [numeroContrat, setNumeroContrat] = useState("");
  const [heureEstimeeArrivee, setHeureEstimeeArrivee] = useState("");

  // Certificat phytosanitaire
  const [phytoNumero, setPhytoNumero] = useState("");
  const [phytoDateEmission, setPhytoDateEmission] = useState("");
  const [phytoDateExpiration, setPhytoDateExpiration] = useState("");
  const [phytoOrganisme, setPhytoOrganisme] = useState("DPVC");

  // Documents et lots
  const [docsValides, setDocsValides] = useState<Record<string, boolean>>({});
  const [lots, setLots] = useState<LotLigne[]>([]);

  // Requêtes flotte + exportateurs
  const { data: vehiculesFlotte = [] } = useQuery<VehiculeFlotte[]>({
    queryKey: ["expedition-vehicules"],
    queryFn: () => apiFetch("/api/expeditions/flotte/vehicules", token),
    enabled: typeVehicule === "propre",
  });
  const { data: chauffeursFlotte = [] } = useQuery<ChauffeurFlotte[]>({
    queryKey: ["expedition-chauffeurs"],
    queryFn: () => apiFetch("/api/expeditions/flotte/chauffeurs", token),
    enabled: typeVehicule === "propre",
  });
  const { data: exportateurs = [] } = useQuery<Exportateur[]>({
    queryKey: ["exportateurs-liste"],
    queryFn: () => apiFetch("/api/exportateurs", token),
  });

  // Vehicule sélectionné → info affichée
  const vehiculeSelectionne = vehiculesFlotte.find(v => String(v.id) === vehiculeId);
  const chauffeurSelectionne = chauffeursFlotte.find(c => String(c.id) === chauffeurId);

  const mutation = useMutation({
    mutationFn: (body: unknown) => apiPost("/api/expeditions", token, body),
    onSuccess: (data: unknown) => {
      toast({ title: "Expédition créée", description: `${(data as { numeroExpedition?: string }).numeroExpedition ?? ""}` });
      navigate("/expeditions");
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    },
  });

  const ajouterLot = () =>
    setLots(prev => [...prev, { key: Date.now().toString(), poidsKg: "", nombreSacs: "", certificatEudr: "", parcelleOrigine: "" }]);

  const supprimerLot   = (key: string) => setLots(prev => prev.filter(l => l.key !== key));
  const mettreAJourLot = (key: string, field: keyof LotLigne, value: string) =>
    setLots(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));

  const toggleDoc = (key: string) => setDocsValides(prev => ({ ...prev, [key]: !prev[key] }));

  const phytoRenseigne = Boolean(phytoNumero && phytoDateEmission);
  const docsManquants = DOCS_REQUIS.filter(d => !docsValides[d.key]).map(d => d.label);

  const handleSubmit = () => {
    if (!dateDepart)                             { toast({ title: "Date de départ requise", variant: "destructive" }); return; }
    if (!poidsCharge || parseFloat(poidsCharge) <= 0) { toast({ title: "Poids chargé requis", variant: "destructive" }); return; }
    if (docsManquants.length > 0) {
      toast({ title: "Documents incomplets", description: docsManquants.join(", "), variant: "destructive" });
      return;
    }
    const portFinal = port === "autre" ? portAutre : port;
    if (!portFinal) { toast({ title: "Port de destination requis", variant: "destructive" }); return; }

    const isLibre = exportateurId === "__libre__";
    const exNom = isLibre
      ? exportateurNom || undefined
      : exportateurs.find(e => String(e.id) === exportateurId)?.nom;

    mutation.mutate({
      typeVehicule,
      vehiculeId:         vehiculeId ? parseInt(vehiculeId, 10) : undefined,
      chauffeurId:        chauffeurId ? parseInt(chauffeurId, 10) : undefined,
      immatriculation:    typeVehicule === "location" ? immatriculationLibre || undefined : undefined,
      nomChauffeur:       typeVehicule === "location" ? nomChauffeurLibre || undefined : undefined,
      telephoneChauffeur: typeVehicule === "location" ? telephoneChauffeurLibre || undefined : undefined,
      transporteur:       typeVehicule === "location" ? transporteur || undefined : undefined,
      numeroBonTransport: typeVehicule === "location" ? numeroBonTransport || undefined : undefined,
      dateDepart,
      lieuDepart,
      poidsChargeKg:  parseFloat(poidsCharge),
      nombreSacs:     nombreSacs ? parseInt(nombreSacs, 10) : undefined,
      numeroLots:     numeroLots || undefined,
      port: portFinal,
      entrepotDestination: entrepotDestination || undefined,
      exportateurId:  !isLibre ? parseInt(exportateurId, 10) : undefined,
      exportateurNom: exNom,
      numeroContratExport: numeroContrat || undefined,
      heureEstimeeArrivee: heureEstimeeArrivee || undefined,
      certificatPhytoNumero:         phytoNumero || undefined,
      certificatPhytoDateEmission:   phytoDateEmission || undefined,
      certificatPhytoDateExpiration: phytoDateExpiration || undefined,
      certificatPhytoOrganisme:      phytoOrganisme || "DPVC",
      documents: [...DOCS_REQUIS, ...DOCS_OPTIONNELS].filter(d => docsValides[d.key]).map(d => ({ type: d.key, url: "", date: new Date().toISOString() })),
      lots: lots.filter(l => l.poidsKg).map(l => ({
        poidsKg:        parseFloat(l.poidsKg),
        nombreSacs:     l.nombreSacs ? parseInt(l.nombreSacs, 10) : undefined,
        certificatEudr: l.certificatEudr || undefined,
        parcelleOrigine: l.parcelleOrigine || undefined,
      })),
    });
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/expeditions")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Button>
        <Ship className="h-5 w-5 text-green-700" />
        <h1 className="text-xl font-bold text-gray-900">Nouvelle expédition</h1>
        <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-mono">N° auto</span>
      </div>

      {/* VÉHICULE */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🚛 Véhicule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={typeVehicule} onValueChange={(v) => { setTypeVehicule(v as "propre" | "location"); setVehiculeId(""); setChauffeurId(""); }} className="flex gap-6">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="propre" id="propre" />
              <Label htmlFor="propre">Camion propre (flotte coopérative)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="location" id="location" />
              <Label htmlFor="location">Location / prestataire</Label>
            </div>
          </RadioGroup>

          {typeVehicule === "propre" ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Véhicule *</Label>
                  <Select value={vehiculeId || undefined} onValueChange={setVehiculeId}>
                    <SelectTrigger>
                      <SelectValue placeholder={vehiculesFlotte.length === 0 ? "Aucun véhicule dans la flotte" : "Sélectionner…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {vehiculesFlotte.map(v => (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.immatriculation}{v.marque ? ` — ${v.marque} ${v.modele ?? ""}` : ""}
                          {v.statut !== "disponible" ? ` (${v.statut})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {vehiculeSelectionne?.capaciteKg && (
                    <p className="text-xs text-gray-500 mt-1">Capacité : {parseFloat(vehiculeSelectionne.capaciteKg).toLocaleString("fr-FR")} kg</p>
                  )}
                </div>
                <div>
                  <Label>Chauffeur *</Label>
                  <Select value={chauffeurId || undefined} onValueChange={setChauffeurId}>
                    <SelectTrigger>
                      <SelectValue placeholder={chauffeursFlotte.length === 0 ? "Aucun chauffeur actif" : "Sélectionner…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {chauffeursFlotte.map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.nom} {c.prenoms ?? ""}{c.telephone ? ` — ${c.telephone}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {chauffeurSelectionne?.telephone && (
                    <p className="text-xs text-gray-500 mt-1">📞 {chauffeurSelectionne.telephone}</p>
                  )}
                </div>
              </div>
              {vehiculesFlotte.length === 0 && (
                <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-2">
                  ⚠️ Aucun véhicule trouvé dans la flotte. Ajoutez des véhicules dans le module Transport, ou utilisez "Location".
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Immatriculation *</Label>
                <Input value={immatriculationLibre} onChange={e => setImmatriculationLibre(e.target.value)} placeholder="CI-1234-AB" />
              </div>
              <div>
                <Label>Société transporteur *</Label>
                <Input value={transporteur} onChange={e => setTransporteur(e.target.value)} placeholder="Nom société" />
              </div>
              <div>
                <Label>N° bon de transport *</Label>
                <Input value={numeroBonTransport} onChange={e => setNumeroBonTransport(e.target.value)} placeholder="BT-2025-..." />
              </div>
              <div>
                <Label>Nom chauffeur</Label>
                <Input value={nomChauffeurLibre} onChange={e => setNomChauffeurLibre(e.target.value)} placeholder="Nom complet" />
              </div>
              <div>
                <Label>Téléphone chauffeur</Label>
                <Input value={telephoneChauffeurLibre} onChange={e => setTelephoneChauffeurLibre(e.target.value)} placeholder="+225 07 xx xx xx" />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CHARGEMENT */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📦 Chargement</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Date de départ *</Label>
              <Input type="datetime-local" value={dateDepart} onChange={e => setDateDepart(e.target.value)} />
            </div>
            <div>
              <Label>Lieu de départ *</Label>
              <Input value={lieuDepart} onChange={e => setLieuDepart(e.target.value)} />
            </div>
            <div>
              <Label>Poids chargé (kg) *</Label>
              <Input type="number" value={poidsCharge} onChange={e => setPoidsCharge(e.target.value)} placeholder="18500" />
              {vehiculeSelectionne?.capaciteKg && poidsCharge && parseFloat(poidsCharge) > parseFloat(vehiculeSelectionne.capaciteKg) && (
                <p className="text-xs text-orange-600 mt-1">⚠️ Dépasse la capacité ({parseFloat(vehiculeSelectionne.capaciteKg).toLocaleString("fr-FR")} kg)</p>
              )}
            </div>
            <div>
              <Label>Nombre de sacs *</Label>
              <Input type="number" value={nombreSacs} onChange={e => setNombreSacs(e.target.value)} placeholder="370" />
            </div>
            <div className="col-span-2">
              <Label>N° de lots (référence)</Label>
              <Input value={numeroLots} onChange={e => setNumeroLots(e.target.value)} placeholder="LOT-001, LOT-002, ..." />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CERTIFICAT PHYTOSANITAIRE */}
      <Card className="border-green-200">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Leaf className="h-4 w-4 text-green-600" />
            Certificat phytosanitaire
            {phytoRenseigne
              ? <span className="ml-auto text-xs text-green-600 font-normal flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Renseigné</span>
              : <span className="ml-auto text-xs text-gray-400 font-normal">Optionnel</span>
            }
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Numéro du certificat</Label>
              <Input
                value={phytoNumero}
                onChange={e => setPhytoNumero(e.target.value)}
                placeholder="DPVC-2025-XXXXX"
                className={phytoNumero ? "border-green-400" : ""}
              />
            </div>
            <div>
              <Label>Organisme émetteur</Label>
              <Input value={phytoOrganisme} onChange={e => setPhytoOrganisme(e.target.value)} placeholder="DPVC" />
              <p className="text-xs text-gray-400 mt-1">Direction de la Protection des Végétaux et du Contrôle</p>
            </div>
            <div>
              <Label>Date d'émission</Label>
              <Input type="date" value={phytoDateEmission} onChange={e => setPhytoDateEmission(e.target.value)} />
            </div>
            <div>
              <Label>Date d'expiration</Label>
              <Input type="date" value={phytoDateExpiration} onChange={e => setPhytoDateExpiration(e.target.value)} />
              {phytoDateExpiration && new Date(phytoDateExpiration) < new Date() && (
                <p className="text-xs text-red-600 mt-1">⚠️ Certificat expiré !</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LOTS EUDR */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">🌿 Lots cacao — traçabilité EUDR</CardTitle>
          <Button variant="outline" size="sm" onClick={ajouterLot} className="gap-1">
            <Plus className="h-3 w-3" /> Ajouter un lot
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {lots.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun lot ajouté. Cliquez sur "Ajouter un lot" pour lier les lots à des membres producteurs.</p>
          ) : (
            lots.map(lot => (
              <div key={lot.key} className="grid grid-cols-5 gap-2 items-end border rounded-lg p-3 bg-gray-50">
                <div>
                  <Label className="text-xs">Poids (kg)</Label>
                  <Input type="number" value={lot.poidsKg} onChange={e => mettreAJourLot(lot.key, "poidsKg", e.target.value)} placeholder="500" />
                </div>
                <div>
                  <Label className="text-xs">Sacs</Label>
                  <Input type="number" value={lot.nombreSacs} onChange={e => mettreAJourLot(lot.key, "nombreSacs", e.target.value)} placeholder="10" />
                </div>
                <div>
                  <Label className="text-xs">Cert. EUDR</Label>
                  <Input value={lot.certificatEudr} onChange={e => mettreAJourLot(lot.key, "certificatEudr", e.target.value)} placeholder="EUDR-..." />
                </div>
                <div>
                  <Label className="text-xs">Parcelle origine</Label>
                  <Input value={lot.parcelleOrigine} onChange={e => mettreAJourLot(lot.key, "parcelleOrigine", e.target.value)} placeholder="GPS ou code" />
                </div>
                <Button variant="ghost" size="sm" onClick={() => supprimerLot(lot.key)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* DESTINATION */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">🚢 Destination</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Port *</Label>
              <Select value={port} onValueChange={setPort}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Abidjan">Abidjan</SelectItem>
                  <SelectItem value="San Pedro">San Pedro</SelectItem>
                  <SelectItem value="autre">Autre</SelectItem>
                </SelectContent>
              </Select>
              {port === "autre" && (
                <Input className="mt-2" value={portAutre} onChange={e => setPortAutre(e.target.value)} placeholder="Nom du port" />
              )}
            </div>
            <div>
              <Label>Entrepôt destination</Label>
              <Input value={entrepotDestination} onChange={e => setEntrepotDestination(e.target.value)} placeholder="Entrepôt port" />
            </div>
            <div>
              <Label>Exportateur</Label>
              <Select value={exportateurId} onValueChange={setExportateurId}>
                <SelectTrigger><SelectValue placeholder="Sélectionner…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__libre__">Saisie libre</SelectItem>
                  {exportateurs.map(e => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.nom}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {exportateurId === "__libre__" && (
                <Input className="mt-2" value={exportateurNom} onChange={e => setExportateurNom(e.target.value)} placeholder="Nom exportateur" />
              )}
            </div>
            <div>
              <Label>N° contrat export</Label>
              <Input value={numeroContrat} onChange={e => setNumeroContrat(e.target.value)} placeholder="CTR-2025-..." />
            </div>
            <div>
              <Label>Heure estimée d'arrivée</Label>
              <Input type="datetime-local" value={heureEstimeeArrivee} onChange={e => setHeureEstimeeArrivee(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DOCUMENTS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">📎 Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Obligatoires</p>
          {DOCS_REQUIS.map(doc => (
            <div
              key={doc.key}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${docsValides[doc.key] ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
              onClick={() => toggleDoc(doc.key)}
            >
              <span className="text-sm font-medium">{doc.label}</span>
              {docsValides[doc.key]
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <XCircle className="h-5 w-5 text-gray-400" />
              }
            </div>
          ))}
          {docsManquants.length > 0 && (
            <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-3 py-2">
              ⚠️ Manquants : {docsManquants.join(", ")}
            </p>
          )}
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide pt-2">Optionnels</p>
          {DOCS_OPTIONNELS.map(doc => (
            <div
              key={doc.key}
              className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${docsValides[doc.key] ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200 hover:bg-gray-100"}`}
              onClick={() => toggleDoc(doc.key)}
            >
              <span className="text-sm font-medium">{doc.label}</span>
              {docsValides[doc.key]
                ? <CheckCircle2 className="h-5 w-5 text-green-600" />
                : <XCircle className="h-5 w-5 text-gray-400" />
              }
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3 justify-end pb-8">
        <Button variant="outline" onClick={() => navigate("/expeditions")}>Annuler</Button>
        <Button
          className="bg-green-700 hover:bg-green-800 gap-2"
          onClick={handleSubmit}
          disabled={mutation.isPending}
        >
          <Ship className="h-4 w-4" />
          {mutation.isPending ? "Enregistrement…" : "Enregistrer →"}
        </Button>
      </div>
    </div>
  );
}

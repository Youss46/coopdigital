import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Ship, CheckCircle2, XCircle, Leaf, Package, Search, CheckSquare, Square } from "lucide-react";

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

interface LotDisponible {
  id: number;
  qrCodeLot: string;
  statut: string;
  poidsTotalKg: string;
  entrepot: string | null;
  dateCreation: string;
  nombreSacs?: number | null;
  nbLivraisons?: number;
  nbProducteurs?: number;
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

  // Documents
  const [docsValides, setDocsValides] = useState<Record<string, boolean>>({});

  // Sélection de lots
  const [selectedLotIds, setSelectedLotIds] = useState<Set<number>>(new Set());
  const [lotSearch, setLotSearch] = useState("");
  const [nombreSacsCalcule, setNombreSacsCalcule] = useState(0);
  const [poidsChargeCalcule, setPoidsChargeCalcule] = useState(0);

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

  const { data: lotsDisponibles = [], isLoading: lotsLoading } = useQuery<LotDisponible[]>({
    queryKey: ["lots-disponibles-creation"],
    queryFn: () => apiFetch("/api/lots?statut=en_stock,vendu", token),
  });

  const { data: prochainNumero } = useQuery<{ numero: string }>({
    queryKey: ["expedition-prochain-numero"],
    queryFn: () => apiFetch("/api/expeditions/prochain-numero", token),
    staleTime: 0,
  });

  // Véhicule sélectionné → info affichée
  const vehiculeSelectionne = vehiculesFlotte.find(v => String(v.id) === vehiculeId);
  const chauffeurSelectionne = chauffeursFlotte.find(c => String(c.id) === chauffeurId);

  // Lots filtrés par recherche
  const lotsFiltres = lotsDisponibles.filter(l =>
    lotSearch === "" ||
    l.qrCodeLot.toLowerCase().includes(lotSearch.toLowerCase()) ||
    (l.entrepot ?? "").toLowerCase().includes(lotSearch.toLowerCase())
  );

  const toggleLot = (id: number) => {
    setSelectedLotIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);

      const lotsSelectionnes = lotsDisponibles.filter(l => next.has(l.id));

      // Poids total
      const totalPoids = lotsSelectionnes.reduce((s, l) => s + parseFloat(l.poidsTotalKg ?? "0"), 0);
      setPoidsChargeCalcule(totalPoids);
      if (next.size === 0) {
        setPoidsCharge("");
      } else {
        setPoidsCharge(totalPoids > 0 ? String(Math.round(totalPoids * 10) / 10) : "");
      }

      // Nombre de sacs
      const totalSacs = lotsSelectionnes
        .filter(l => l.nombreSacs != null)
        .reduce((s, l) => s + (l.nombreSacs ?? 0), 0);
      setNombreSacsCalcule(totalSacs);
      if (next.size === 0) {
        setNombreSacs("");
      } else if (totalSacs > 0) {
        setNombreSacs(String(totalSacs));
      }

      // Numéro de lots (référence)
      const refs = lotsSelectionnes.map(l => "LOT-" + l.qrCodeLot.slice(0, 8).toUpperCase());
      setNumeroLots(refs.join(", "));

      return next;
    });
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const mutation = useMutation({
    mutationFn: (body: unknown) => apiPost<{ id: number; numeroExpedition: string }>("/api/expeditions", token, body),
    onSuccess: async (exp) => {
      // Attacher les lots sélectionnés
      if (selectedLotIds.size > 0) {
        await Promise.allSettled(
          Array.from(selectedLotIds).map(lotId =>
            apiPost(`/api/expeditions/${exp.id}/lots`, token, { lotId })
          )
        );
      }
      toast({ title: "Expédition créée", description: exp.numeroExpedition });
      navigate("/expeditions");
    },
    onError: (err: Error) => {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
      setIsSubmitting(false);
    },
  });

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

    const nombreSacsInt = nombreSacs.trim() !== "" ? parseInt(nombreSacs, 10) : undefined;
    if (nombreSacsInt !== undefined && (isNaN(nombreSacsInt) || nombreSacsInt < 0)) {
      toast({ title: "Nombre de sacs invalide", description: "Veuillez saisir un entier positif.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
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
      nombreSacs:     nombreSacsInt,
      numeroLots:     numeroLots || undefined,
      port: portFinal,
      entrepotDestination: entrepotDestination || undefined,
      exportateurId:  !isLibre && exportateurId ? parseInt(exportateurId, 10) : undefined,
      exportateurNom: exNom,
      numeroContratExport: numeroContrat || undefined,
      heureEstimeeArrivee: heureEstimeeArrivee || undefined,
      certificatPhytoNumero:         phytoNumero || undefined,
      certificatPhytoDateEmission:   phytoDateEmission || undefined,
      certificatPhytoDateExpiration: phytoDateExpiration || undefined,
      certificatPhytoOrganisme:      phytoOrganisme || "DPVC",
      documents: [...DOCS_REQUIS, ...DOCS_OPTIONNELS].filter(d => docsValides[d.key]).map(d => ({ type: d.key, url: "", date: new Date().toISOString() })),
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
        <span className="ml-auto text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1 rounded-full font-mono font-semibold">
          {prochainNumero ? prochainNumero.numero : "N° …"}
        </span>
      </div>

      {/* SÉLECTION DES LOTS */}
      <Card className="border-green-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Leaf className="h-4 w-4 text-green-600" />
              Lots cacao — traçabilité EUDR
            </CardTitle>
            {selectedLotIds.size > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                <CheckSquare className="h-3 w-3" />
                {selectedLotIds.size} lot{selectedLotIds.size > 1 ? "s" : ""} sélectionné{selectedLotIds.size > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Sélectionnez les lots <span className="font-medium">en stock ou vendus</span> (non encore expédiés) à acheminer. La liaison est enregistrée automatiquement.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Barre de recherche */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              className="pl-9 text-sm"
              placeholder="Rechercher par QR code ou entrepôt…"
              value={lotSearch}
              onChange={e => setLotSearch(e.target.value)}
            />
          </div>

          {/* Liste des lots */}
          {lotsLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              Chargement des lots…
            </div>
          ) : lotsDisponibles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
              <Package className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500 font-medium">Aucun lot disponible à expédier</p>
              <p className="text-xs text-gray-400">Créez des lots depuis le module Traçabilité avant d'enregistrer une expédition.</p>
            </div>
          ) : lotsFiltres.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">Aucun lot ne correspond à la recherche.</p>
          ) : (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              {lotsFiltres.map(lot => {
                const selected = selectedLotIds.has(lot.id);
                const shortCode = lot.qrCodeLot.slice(0, 8).toUpperCase();
                const poids = parseFloat(lot.poidsTotalKg ?? "0").toLocaleString("fr-FR");
                const dateStr = new Date(lot.dateCreation).toLocaleDateString("fr-FR");
                const isVendu = lot.statut === "vendu";
                return (
                  <div
                    key={lot.id}
                    onClick={() => toggleLot(lot.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      selected ? "bg-green-50 hover:bg-green-100" : "bg-white hover:bg-gray-50"
                    }`}
                  >
                    {/* Checkbox visuel */}
                    <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${
                      selected ? "text-green-700" : "text-gray-300"
                    }`}>
                      {selected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                    </div>

                    {/* Infos lot */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-gray-900">
                          LOT-{shortCode}
                        </span>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          isVendu ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
                        }`}>
                          {isVendu ? "vendu" : "en stock"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span><span className="font-medium text-gray-700">{poids} kg</span></span>
                        {lot.nombreSacs != null && <span>🎒 {lot.nombreSacs.toLocaleString("fr-FR")} sacs</span>}
                        {lot.entrepot && <span>📦 {lot.entrepot}</span>}
                        <span>📅 {dateStr}</span>
                        {lot.nbLivraisons != null && <span>🌱 {lot.nbLivraisons} livraison{lot.nbLivraisons > 1 ? "s" : ""}</span>}
                      </div>
                    </div>

                    {/* Poids badge */}
                    <div className={`flex-shrink-0 text-right ${selected ? "text-green-700" : "text-gray-400"}`}>
                      <p className="text-sm font-semibold">{poids} kg</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {selectedLotIds.size > 0 && lotsDisponibles.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
              <span className="text-green-800 font-medium">
                {selectedLotIds.size} lot{selectedLotIds.size > 1 ? "s" : ""} sélectionné{selectedLotIds.size > 1 ? "s" : ""}
              </span>
              <span className="text-green-700 font-bold">
                {lotsDisponibles
                  .filter(l => selectedLotIds.has(l.id))
                  .reduce((s, l) => s + parseFloat(l.poidsTotalKg ?? "0"), 0)
                  .toLocaleString("fr-FR")} kg
                {lotsDisponibles.filter(l => selectedLotIds.has(l.id) && l.nombreSacs != null).length > 0 && (
                  <span className="ml-2">
                    · {lotsDisponibles.filter(l => selectedLotIds.has(l.id)).reduce((s, l) => s + (l.nombreSacs ?? 0), 0).toLocaleString("fr-FR")} sacs
                  </span>
                )}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

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
                  <Select value={vehiculeId} onValueChange={setVehiculeId}>
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
                  <Select value={chauffeurId} onValueChange={setChauffeurId}>
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
                <Input type="tel" inputMode="tel" minLength={10} maxLength={10} pattern="[0-9]{10}" value={telephoneChauffeurLibre} onChange={e => setTelephoneChauffeurLibre(e.target.value)} placeholder="07 XX XX XX XX" />
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
              <NumericInput value={poidsCharge} onChange={setPoidsCharge} placeholder="18500" />
              {poidsChargeCalcule > 0 && poidsCharge === String(Math.round(poidsChargeCalcule * 10) / 10) && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <span>✦</span>
                  <span>Calculé automatiquement depuis {selectedLotIds.size} lot{selectedLotIds.size > 1 ? "s" : ""} sélectionné{selectedLotIds.size > 1 ? "s" : ""}. Modifiable si besoin.</span>
                </p>
              )}
              {vehiculeSelectionne?.capaciteKg && poidsCharge && parseFloat(poidsCharge) > parseFloat(vehiculeSelectionne.capaciteKg) && (
                <p className="text-xs text-orange-600 mt-1">⚠️ Dépasse la capacité ({parseFloat(vehiculeSelectionne.capaciteKg).toLocaleString("fr-FR")} kg)</p>
              )}
            </div>
            <div>
              <Label>Nombre de sacs *</Label>
              <NumericInput
                value={nombreSacs}
                onChange={v => { setNombreSacs(v); }}
                placeholder="370"
              />
              {nombreSacsCalcule > 0 && nombreSacs === String(nombreSacsCalcule) && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <span>✦</span>
                  <span>Calculé automatiquement depuis {selectedLotIds.size} lot{selectedLotIds.size > 1 ? "s" : ""} sélectionné{selectedLotIds.size > 1 ? "s" : ""}. Modifiable si besoin.</span>
                </p>
              )}
            </div>
            <div className="col-span-2">
              <Label>N° de lots (référence)</Label>
              <Input
                value={numeroLots}
                onChange={e => setNumeroLots(e.target.value)}
                placeholder="LOT-001, LOT-002, ..."
                readOnly={selectedLotIds.size > 0}
                className={selectedLotIds.size > 0 ? "bg-gray-50 text-gray-600 cursor-default" : ""}
              />
              {selectedLotIds.size > 0 && (
                <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                  <span>✦</span>
                  <span>Renseigné automatiquement depuis {selectedLotIds.size} lot{selectedLotIds.size > 1 ? "s" : ""} sélectionné{selectedLotIds.size > 1 ? "s" : ""}.</span>
                </p>
              )}
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
          disabled={isSubmitting || mutation.isPending}
        >
          <Ship className="h-4 w-4" />
          {isSubmitting || mutation.isPending ? "Enregistrement…" : "Enregistrer →"}
        </Button>
      </div>
    </div>
  );
}

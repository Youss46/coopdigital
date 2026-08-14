/**
 * Espace partenaire station-service.
 * Page publique (sans login coopérative) accessible depuis le QR code du bon.
 */
import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Fuel, Search, CheckCircle2, XCircle, Loader2, Camera,
  Car, User, Droplets, CalendarDays, Receipt,
} from "lucide-react";

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;

interface BonInfo {
  id: number;
  numero: string;
  statut: string;
  type_carburant: string;
  quantite_autorisee: number;
  station_service: string | null;
  motif: string | null;
  date_emission: string;
  immatriculation: string | null;
  marque: string | null;
  modele: string | null;
  chauffeur_nom: string | null;
}

const TYPE_CARB: Record<string, string> = {
  gasoil: "Gasoil",
  essence: "Essence",
  super: "Super",
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
          else { w = Math.round((w * MAX) / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function StationService() {
  const { toast } = useToast();

  // Recherche
  const [searchValue, setSearchValue] = useState("");
  const [loading, setLoading]         = useState(false);
  const [bon, setBon]                 = useState<BonInfo | null>(null);
  const [notFound, setNotFound]       = useState(false);

  // Formulaire de délivrance
  const [form, setForm] = useState({
    quantite_livree:  "",
    prix_litre_fcfa:  "",
    date_utilisation: new Date().toISOString().split("T")[0]!,
    station_service:  "",
    observations:     "",
  });
  const [ticketPhoto, setTicketPhoto] = useState<string | null>(null);
  const [submitting, setSubmitting]   = useState(false);
  const [done, setDone]               = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Recherche du bon ─────────────────────────────────────────────────────────
  const rechercher = useCallback(async (numero?: string) => {
    const q = (numero ?? searchValue).trim().toUpperCase();
    if (!q) return;
    setLoading(true);
    setNotFound(false);
    setBon(null);
    setDone(false);
    try {
      const res = await fetch(`${BASE}/station/carburant/bons/${encodeURIComponent(q)}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = (await res.json()) as BonInfo;
      setBon(data);
      if (data.station_service) setForm(f => ({ ...f, station_service: data.station_service! }));
    } catch {
      toast({ title: "Erreur réseau", description: "Impossible de contacter le serveur.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [searchValue, toast]);

  // ── QR / photo capture ───────────────────────────────────────────────────────
  const handleScanQR = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // BarcodeDetector API (Chrome Mobile)
    if ("BarcodeDetector" in window) {
      try {
        const bd = new (window as unknown as { BarcodeDetector: new (opts: object) => { detect: (img: HTMLImageElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({ formats: ["qr_code"] });
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise<void>(r => { img.onload = () => r(); });
        const codes = await bd.detect(img);
        if (codes.length > 0) {
          const raw = codes[0]!.rawValue.trim().toUpperCase();
          setSearchValue(raw);
          rechercher(raw);
          return;
        }
      } catch { /* fallback */ }
    }
    toast({ title: "Scan non disponible", description: "Saisissez le numéro manuellement." });
  }, [rechercher, toast]);

  // ── Photo ticket ─────────────────────────────────────────────────────────────
  const handlePhotoTicket = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const b64 = await compressPhoto(file);
      setTicketPhoto(b64);
    } catch {
      toast({ title: "Erreur photo", description: "Impossible de lire l'image.", variant: "destructive" });
    }
  }, [toast]);

  // ── Soumettre la délivrance ───────────────────────────────────────────────────
  const handleLivrer = useCallback(async () => {
    if (!bon) return;
    if (!form.quantite_livree || !form.date_utilisation) {
      toast({ title: "Champs requis", description: "La quantité livrée et la date sont obligatoires.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        quantite_livree:  parseFloat(form.quantite_livree),
        date_utilisation: form.date_utilisation,
      };
      if (form.prix_litre_fcfa) body["prix_litre_fcfa"] = parseFloat(form.prix_litre_fcfa);
      if (form.station_service)  body["station_service"]  = form.station_service;
      if (form.observations)     body["observations"]     = form.observations;
      if (ticketPhoto)           body["ticket_url"]       = ticketPhoto;

      const res = await fetch(
        `${BASE}/station/carburant/bons/${encodeURIComponent(bon.numero)}/livrer`,
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      );
      const data = await res.json() as { success?: boolean; erreur?: string };
      if (!res.ok) throw new Error(data.erreur ?? `Erreur ${res.status}`);
      setDone(true);
      toast({ title: "Carburant délivré ✓", description: `Bon ${bon.numero} marqué comme utilisé.` });
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }, [bon, form, ticketPhoto, toast]);

  // ── Rendu ────────────────────────────────────────────────────────────────────
  if (done && bon) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-6">
        <CheckCircle2 className="h-20 w-20 text-green-500 mb-4" />
        <h1 className="text-2xl font-bold text-green-800 mb-1">Carburant délivré</h1>
        <p className="text-green-700 text-center mb-6">
          Bon <strong>{bon.numero}</strong> — {form.quantite_livree} L de {TYPE_CARB[bon.type_carburant] ?? bon.type_carburant}
        </p>
        <Button
          variant="outline"
          onClick={() => { setBon(null); setDone(false); setSearchValue(""); setTicketPhoto(null); setForm({ quantite_livree: "", prix_litre_fcfa: "", date_utilisation: new Date().toISOString().split("T")[0]!, station_service: "", observations: "" }); }}
        >
          Nouveau bon
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header */}
      <div className="bg-green-700 text-white px-4 py-5 shadow">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <Fuel className="h-7 w-7" />
          <div>
            <h1 className="text-lg font-bold leading-tight">Espace Station-Service</h1>
            <p className="text-green-200 text-sm">Délivrance de carburant</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {/* Recherche */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4" /> Rechercher un bon
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Numéro du bon (ex: BC-00001)"
                value={searchValue}
                onChange={e => setSearchValue(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && rechercher()}
                className="uppercase"
              />
              <Button onClick={() => rechercher()} disabled={loading || !searchValue.trim()}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>

            {/* Scan QR */}
            <div className="text-center">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => photoInputRef.current?.click()}
              >
                <Camera className="h-4 w-4" /> Scanner le QR code
              </Button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleScanQR}
              />
            </div>

            {notFound && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                <XCircle className="h-4 w-4 shrink-0" />
                Bon introuvable. Vérifiez le numéro.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Infos du bon */}
        {bon && (
          <>
            <Card className={bon.statut === "approuve" ? "border-green-400" : "border-orange-300"}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-mono">{bon.numero}</CardTitle>
                  <Badge
                    className={
                      bon.statut === "approuve"
                        ? "bg-green-100 text-green-800"
                        : bon.statut === "utilise"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-orange-100 text-orange-800"
                    }
                  >
                    {bon.statut === "approuve" ? "✓ Approuvé" : bon.statut === "utilise" ? "Déjà utilisé" : bon.statut}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Car className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-gray-500 text-xs">Véhicule</p>
                      <p className="font-semibold">{bon.immatriculation ?? "—"}</p>
                      {bon.marque && <p className="text-gray-500 text-xs">{bon.marque}</p>}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <User className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-gray-500 text-xs">Chauffeur</p>
                      <p className="font-semibold">{bon.chauffeur_nom ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Droplets className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-gray-500 text-xs">Carburant autorisé</p>
                      <p className="font-bold text-blue-700">
                        {bon.quantite_autorisee} L — {TYPE_CARB[bon.type_carburant] ?? bon.type_carburant}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <CalendarDays className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-gray-500 text-xs">Date d'émission</p>
                      <p className="font-semibold">{fmt(bon.date_emission)}</p>
                    </div>
                  </div>
                </div>
                {bon.motif && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded p-2">
                    <span className="text-gray-400 text-xs block">Motif</span>
                    {bon.motif}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Formulaire délivrance — seulement si bon approuvé */}
            {bon.statut === "approuve" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Fuel className="h-4 w-4 text-green-600" /> Enregistrer la délivrance
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="qte">Quantité livrée (L) *</Label>
                      <Input
                        id="qte"
                        type="number"
                        step="0.1"
                        min="0"
                        max={bon.quantite_autorisee + 1}
                        placeholder={`Max ${bon.quantite_autorisee} L`}
                        value={form.quantite_livree}
                        onChange={e => setForm(f => ({ ...f, quantite_livree: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="prix">Prix / litre (FCFA)</Label>
                      <Input
                        id="prix"
                        type="number"
                        min="0"
                        placeholder="ex: 650"
                        value={form.prix_litre_fcfa}
                        onChange={e => setForm(f => ({ ...f, prix_litre_fcfa: e.target.value }))}
                      />
                    </div>
                  </div>

                  {form.quantite_livree && form.prix_litre_fcfa && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <p className="text-xs text-green-600">Montant total</p>
                      <p className="text-xl font-bold text-green-800">
                        {Math.round(parseFloat(form.quantite_livree) * parseFloat(form.prix_litre_fcfa)).toLocaleString("fr-FR")} FCFA
                      </p>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="date">Date de délivrance *</Label>
                    <Input
                      id="date"
                      type="date"
                      value={form.date_utilisation}
                      onChange={e => setForm(f => ({ ...f, date_utilisation: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="station">Nom de votre station</Label>
                    <Input
                      id="station"
                      placeholder="Ex: Total Plateau, Shell Koumassi…"
                      value={form.station_service}
                      onChange={e => setForm(f => ({ ...f, station_service: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="obs">Observations</Label>
                    <Input
                      id="obs"
                      placeholder="Remarques éventuelles"
                      value={form.observations}
                      onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
                    />
                  </div>

                  {/* Photo ticket */}
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Receipt className="h-4 w-4" /> Ticket de carburant (photo)
                    </Label>
                    {ticketPhoto ? (
                      <div className="relative">
                        <img src={ticketPhoto} alt="Ticket" className="w-full max-h-48 object-contain rounded-lg border" />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute top-1 right-1 bg-white/80"
                          onClick={() => setTicketPhoto(null)}
                        >
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-green-400 transition-colors">
                        <Camera className="h-8 w-8 text-gray-400" />
                        <span className="text-sm text-gray-500">Prendre ou choisir une photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={handlePhotoTicket}
                        />
                      </label>
                    )}
                  </div>

                  <Button
                    className="w-full bg-green-700 hover:bg-green-800"
                    onClick={handleLivrer}
                    disabled={submitting || !form.quantite_livree || !form.date_utilisation}
                  >
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enregistrement…</>
                    ) : (
                      <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirmer la délivrance</>
                    )}
                  </Button>
                </CardContent>
              </Card>
            )}

            {bon.statut === "utilise" && (
              <div className="text-center text-gray-500 text-sm py-4">
                Ce bon a déjà été utilisé.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

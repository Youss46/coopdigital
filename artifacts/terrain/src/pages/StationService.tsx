/**
 * Espace partenaire station-service.
 * Page publique (sans login coopérative) accessible depuis le QR code du bon.
 *
 * Mode dégradé :
 * - La clé publique Ed25519 est embarquée dans le bundle au build (aucun réseau requis).
 * - Si le QR contient un payload signé (?p=...&s=...), les infos du bon sont affichées
 *   APRÈS vérification SubtleCrypto — jamais avant.
 * - La confirmation (livraison) nécessite internet ; le payload signé est retransmis
 *   au serveur pour revérification HMAC côté serveur.
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Fuel, Search, CheckCircle2, XCircle, Loader2, Camera,
  Car, User, Droplets, CalendarDays, Receipt, WifiOff, ShieldCheck, ShieldAlert,
} from "lucide-react";

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;

// ── Clé publique Ed25519 (embarquée au build) ────────────────────────────────
// __STATION_QR_PUBLIC_KEY__ est remplacé par Vite à la compilation avec la valeur
// dérivée de SESSION_SECRET. La clé est publique — safe à inclure dans le bundle.
const EMBEDDED_SPKI_B64: string = __STATION_QR_PUBLIC_KEY__;
const STATION_PK_LS_KEY = "station_qr_spki_v1";

/**
 * Charge la clé publique Ed25519 pour vérification.
 * Priorité : bundle embarqué → localStorage → fetch API.
 * Avec la clé embarquée au build, la première option est toujours disponible,
 * y compris sur un appareil n'ayant jamais été en ligne.
 */
async function loadPublicKey(): Promise<CryptoKey | null> {
  const candidates: string[] = [];
  if (EMBEDDED_SPKI_B64) candidates.push(EMBEDDED_SPKI_B64);
  const cached = localStorage.getItem(STATION_PK_LS_KEY);
  if (cached && !candidates.includes(cached)) candidates.push(cached);

  for (const b64 of candidates) {
    try {
      const spkiBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return await crypto.subtle.importKey(
        "spki",
        spkiBytes,
        { name: "Ed25519" },
        false,
        ["verify"],
      );
    } catch { /* essayer le suivant */ }
  }

  // Dernier recours : fetch réseau (met aussi à jour le cache)
  try {
    const res = await fetch(`${BASE}/station/carburant/public-key`);
    if (!res.ok) return null;
    const { spki } = await res.json() as { spki: string };
    try { localStorage.setItem(STATION_PK_LS_KEY, spki); } catch { /* ignore */ }
    const spkiBytes = Uint8Array.from(atob(spki), c => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      "spki",
      spkiBytes,
      { name: "Ed25519" },
      false,
      ["verify"],
    );
  } catch { return null; }
}

/** Vérifie la signature Ed25519 d'un payload base64url. */
async function verifyQrSig(
  payload: string,
  sig: string,
  pubKey: CryptoKey,
): Promise<boolean> {
  try {
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, "+").replace(/_/g, "/")),
      c => c.charCodeAt(0),
    );
    const payloadBytes = new TextEncoder().encode(payload);
    return await crypto.subtle.verify("Ed25519", pubKey, sigBytes, payloadBytes);
  } catch { return false; }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface BonInfo {
  id?: number;
  numero: string;
  statut: string;
  type_carburant: string;
  quantite_autorisee: number;
  station_service: string | null;
  motif: string | null;
  date_emission: string;
  immatriculation: string | null;
  marque: string | null;
  modele?: string | null;
  chauffeur_nom: string | null;
  /** true = données issues du QR, non encore confirmées par l'API */
  offline?: boolean;
}

interface QrData {
  v: number;
  num: string;
  qte: number;
  type: string;
  immat: string | null;
  chauffeur: string | null;
  marque: string | null;
  date_em: string;
  motif: string | null;
  exp: number;
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

/** Extrait le numéro de bon d'une valeur QR brute (URL ou numéro direct). */
function extractNumeroFromRaw(raw: string): string {
  try {
    const url = new URL(raw.trim());
    const parts = url.pathname.split("/");
    const idx = parts.findIndex(p => p === "station");
    if (idx !== -1 && parts[idx + 1]) {
      return decodeURIComponent(parts[idx + 1]!).toUpperCase();
    }
  } catch { /* pas une URL */ }
  return raw.trim().toUpperCase();
}

/** Extrait ?p= et ?s= depuis une URL QR brute. */
function extractQrParamsFromUrl(raw: string): { p: string; s: string } | null {
  try {
    const url = new URL(raw.trim());
    const p = url.searchParams.get("p");
    const s = url.searchParams.get("s");
    if (p && s) return { p, s };
  } catch { /* pas une URL */ }
  return null;
}

/** Décode un payload base64url en QrData. Retourne null si invalide/expiré. */
function decodeQrPayload(payload: string): QrData | null {
  try {
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as QrData;
    if (json.v !== 1 || !json.num) return null;
    if (json.exp < Date.now()) return null; // expiré
    return json;
  } catch { return null; }
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function StationService() {
  const { toast } = useToast();
  const params = useParams<{ numero?: string }>();

  // Recherche / bon affiché
  const [searchValue, setSearchValue] = useState(
    params.numero ? decodeURIComponent(params.numero).toUpperCase() : "",
  );
  const [loading, setLoading]   = useState(false);
  const [bon, setBon]           = useState<BonInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  // État QR — conservé en state pour être transmis à la confirmation
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrSig, setQrSig]         = useState<string | null>(null);
  /**
   * null     = vérification en cours (payload présent, vérif pas encore terminée)
   * true     = Ed25519 OK
   * false    = vérification échouée (QR invalide/falsifié)
   * "no-key" = clé absente, données affichées avec avertissement
   * "online" = bon chargé depuis l'API (pas de vérification Ed25519 requise)
   */
  const [qrVerified, setQrVerified] = useState<true | false | "no-key" | "online" | null>(null);

  // Compteur pour annuler les vérifications obsolètes (race condition API vs offline)
  const verifGenRef = useRef(0);

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

  // ── applyQrOffline : vérification Ed25519 avant affichage ────────────────────
  // N'appelle setBon() qu'APRÈS que la vérification soit terminée.
  const applyQrOffline = useCallback(async (payload: string, sig: string): Promise<"ok" | "failed" | "no-key"> => {
    const data = decodeQrPayload(payload);
    if (!data) return "failed";

    const gen = ++verifGenRef.current;
    setQrPayload(payload);
    setQrSig(sig);
    setQrVerified(null); // en cours

    const pubKey = await loadPublicKey();

    if (verifGenRef.current !== gen) return "failed"; // annulé par l'API

    if (!pubKey) {
      // Clé absente — afficher les données avec avertissement
      setQrVerified("no-key");
      setBon({
        numero: data.num, statut: "approuve",
        type_carburant: data.type, quantite_autorisee: data.qte,
        station_service: null, motif: data.motif,
        date_emission: data.date_em, immatriculation: data.immat,
        marque: data.marque, chauffeur_nom: data.chauffeur,
        offline: true,
      });
      return "no-key";
    }

    const ok = await verifyQrSig(payload, sig, pubKey);

    if (verifGenRef.current !== gen) return "failed"; // annulé par l'API

    if (ok) {
      setQrVerified(true);
      setBon({
        numero: data.num, statut: "approuve",
        type_carburant: data.type, quantite_autorisee: data.qte,
        station_service: null, motif: data.motif,
        date_emission: data.date_em, immatriculation: data.immat,
        marque: data.marque, chauffeur_nom: data.chauffeur,
        offline: true,
      });
      return "ok";
    } else {
      setQrVerified(false);
      setQrPayload(null);
      setQrSig(null);
      toast({
        title: "QR code invalide",
        description: "La signature est incorrecte. Ce bon pourrait être falsifié.",
        variant: "destructive",
      });
      return "failed";
    }
  }, [toast]);

  // ── Recherche du bon (en ligne) ───────────────────────────────────────────────
  const rechercher = useCallback(async (numero?: string, offlinePayload?: string, offlineSig?: string) => {
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
      // Annuler toute vérification Ed25519 en cours (on a la réponse API)
      verifGenRef.current++;
      setBon(data);
      setQrPayload(offlinePayload ?? null);
      setQrSig(offlineSig ?? null);
      setQrVerified("online");
      if (data.station_service) setForm(f => ({ ...f, station_service: data.station_service! }));
    } catch {
      // Si on a un payload QR valide → mode offline
      if (offlinePayload && offlineSig) {
        await applyQrOffline(offlinePayload, offlineSig);
      } else {
        toast({
          title: "Erreur réseau",
          description: "Impossible de contacter le serveur.",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [searchValue, toast, applyQrOffline]);

  // ── Auto-recherche au montage ─────────────────────────────────────────────────
  useEffect(() => {
    // Rafraîchir le cache de clé publique en arrière-plan dès que possible
    void loadPublicKey();

    if (!params.numero) return;

    const q = decodeURIComponent(params.numero).toUpperCase();
    setSearchValue(q);

    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("p");
    const s = sp.get("s");

    if (p && s) {
      // Tenter l'API en ligne et la vérification offline en parallèle.
      // L'API prend priorité si elle répond (verifGenRef annule la vérif offline).
      void rechercher(q, p, s);
    } else {
      rechercher(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── QR / photo scan ───────────────────────────────────────────────────────────
  const handleScanQR = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if ("BarcodeDetector" in window) {
      try {
        const bd = new (window as unknown as {
          BarcodeDetector: new (opts: object) => {
            detect: (img: HTMLImageElement) => Promise<Array<{ rawValue: string }>>;
          };
        }).BarcodeDetector({ formats: ["qr_code"] });
        const img = new Image();
        img.src = URL.createObjectURL(file);
        await new Promise<void>(r => { img.onload = () => r(); });
        const codes = await bd.detect(img);
        if (codes.length > 0) {
          const raw = codes[0]!.rawValue;
          const numero = extractNumeroFromRaw(raw);
          setSearchValue(numero);
          const qrParams = extractQrParamsFromUrl(raw);
          if (qrParams) {
            // Tenter API + vérification offline en parallèle
            await rechercher(numero, qrParams.p, qrParams.s);
          } else {
            rechercher(numero);
          }
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
      toast({ title: "Champs requis", description: "La quantité et la date sont obligatoires.", variant: "destructive" });
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
      // Payload signé depuis le state — fonctionne pour URL et scan photo
      if (qrPayload && qrSig) {
        body["qr_payload"] = qrPayload;
        body["qr_sig"] = qrSig;
      }

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
  }, [bon, form, ticketPhoto, toast, qrPayload, qrSig]);

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
          onClick={() => {
            setBon(null); setDone(false); setSearchValue(""); setTicketPhoto(null);
            setQrPayload(null); setQrSig(null); setQrVerified(null);
            setForm({ quantite_livree: "", prix_litre_fcfa: "", date_utilisation: new Date().toISOString().split("T")[0]!, station_service: "", observations: "" });
          }}
        >
          Nouveau bon
        </Button>
      </div>
    );
  }

  // Vérification Ed25519 en cours (bon pas encore affiché)
  const qrPending = qrPayload !== null && qrVerified === null;

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
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

            <div className="text-center">
              <Button variant="outline" size="sm" className="gap-2"
                onClick={() => photoInputRef.current?.click()}>
                <Camera className="h-4 w-4" /> Scanner le QR code
              </Button>
              <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={handleScanQR} />
            </div>

            {notFound && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                <XCircle className="h-4 w-4 shrink-0" />
                Bon introuvable. Vérifiez le numéro.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spinner pendant la vérification Ed25519 (bon pas encore affiché) */}
        {qrPending && (
          <div className="flex items-center gap-3 bg-gray-50 border rounded-xl px-4 py-5 text-gray-600 text-sm">
            <Loader2 className="h-5 w-5 animate-spin shrink-0 text-green-600" />
            <div>
              <p className="font-medium">Vérification de la signature QR…</p>
              <p className="text-xs text-gray-400 mt-0.5">Validation de l'authenticité du bon hors connexion</p>
            </div>
          </div>
        )}

        {/* Infos du bon — affichées seulement après vérification */}
        {bon && !qrPending && (
          <>
            {/* Bannière statut offline */}
            {bon.offline && qrVerified === true && (
              <div className="flex items-center gap-2 text-green-800 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
                QR authentique — signature vérifiée hors connexion. La confirmation nécessite internet.
              </div>
            )}
            {bon.offline && qrVerified === "no-key" && (
              <div className="flex items-center gap-2 text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <WifiOff className="h-4 w-4 shrink-0" />
                Clé de vérification introuvable (connexion hors ligne totale). Les données proviennent du QR mais n'ont pas pu être vérifiées. La confirmation nécessite internet.
              </div>
            )}

            <Card className={bon.statut === "approuve" ? "border-green-400" : "border-orange-300"}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-mono">{bon.numero}</CardTitle>
                  <div className="flex items-center gap-1.5">
                    {bon.offline && qrVerified === true && <ShieldCheck className="h-4 w-4 text-green-600" />}
                    {bon.offline && qrVerified === "no-key" && <ShieldAlert className="h-4 w-4 text-amber-500" />}
                    <Badge className={
                      bon.statut === "approuve" ? "bg-green-100 text-green-800"
                      : bon.statut === "utilise" ? "bg-gray-100 text-gray-600"
                      : "bg-orange-100 text-orange-800"
                    }>
                      {bon.statut === "approuve" ? "✓ Approuvé" : bon.statut === "utilise" ? "Déjà utilisé" : bon.statut}
                    </Badge>
                  </div>
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

            {/* Formulaire délivrance */}
            {bon.statut === "approuve" && qrVerified !== false && (
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
                      <Input id="qte" type="number" step="0.1" min="0"
                        max={bon.quantite_autorisee + 1}
                        placeholder={`Max ${bon.quantite_autorisee} L`}
                        value={form.quantite_livree}
                        onChange={e => setForm(f => ({ ...f, quantite_livree: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="prix">Prix / litre (FCFA)</Label>
                      <Input id="prix" type="number" min="0" placeholder="ex: 650"
                        value={form.prix_litre_fcfa}
                        onChange={e => setForm(f => ({ ...f, prix_litre_fcfa: e.target.value }))} />
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
                    <Input id="date" type="date" value={form.date_utilisation}
                      onChange={e => setForm(f => ({ ...f, date_utilisation: e.target.value }))} />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="station">Nom de votre station</Label>
                    <Input id="station" placeholder="Ex: Total Plateau, Shell Koumassi…"
                      value={form.station_service}
                      onChange={e => setForm(f => ({ ...f, station_service: e.target.value }))} />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="obs">Observations</Label>
                    <Input id="obs" placeholder="Remarques éventuelles"
                      value={form.observations}
                      onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Receipt className="h-4 w-4" /> Ticket de carburant (photo)
                    </Label>
                    {ticketPhoto ? (
                      <div className="relative">
                        <img src={ticketPhoto} alt="Ticket" className="w-full max-h-48 object-contain rounded-lg border" />
                        <Button variant="ghost" size="sm" className="absolute top-1 right-1 bg-white/80"
                          onClick={() => setTicketPhoto(null)}>✕</Button>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center gap-2 border-2 border-dashed border-gray-300 rounded-lg p-4 cursor-pointer hover:border-green-400 transition-colors">
                        <Camera className="h-8 w-8 text-gray-400" />
                        <span className="text-sm text-gray-500">Prendre ou choisir une photo</span>
                        <input type="file" accept="image/*" capture="environment"
                          className="hidden" onChange={handlePhotoTicket} />
                      </label>
                    )}
                  </div>

                  <Button
                    className="w-full bg-green-700 hover:bg-green-800"
                    onClick={handleLivrer}
                    disabled={submitting || !form.quantite_livree || !form.date_utilisation}
                  >
                    {submitting
                      ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Enregistrement…</>
                      : <><CheckCircle2 className="h-4 w-4 mr-2" /> Confirmer la délivrance</>
                    }
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

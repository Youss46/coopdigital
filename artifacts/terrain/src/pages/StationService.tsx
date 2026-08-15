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
import { useToast } from "@/hooks/use-toast";
import {
  Fuel, Search, CheckCircle2, XCircle, Camera,
  Car, User, Droplets, CalendarDays, Receipt, WifiOff, ShieldCheck, ShieldAlert,
} from "lucide-react";

const BASE = `${import.meta.env.VITE_API_URL ?? ""}/api`;

// ── Clé publique Ed25519 (embarquée au build) ────────────────────────────────
const EMBEDDED_SPKI_B64: string = __STATION_QR_PUBLIC_KEY__;
const STATION_PK_LS_KEY = "station_qr_spki_v1";

async function loadPublicKey(): Promise<CryptoKey | null> {
  const candidates: string[] = [];
  if (EMBEDDED_SPKI_B64) candidates.push(EMBEDDED_SPKI_B64);
  const cached = localStorage.getItem(STATION_PK_LS_KEY);
  if (cached && !candidates.includes(cached)) candidates.push(cached);

  for (const b64 of candidates) {
    try {
      const spkiBytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return await crypto.subtle.importKey(
        "spki", spkiBytes, { name: "Ed25519" }, false, ["verify"],
      );
    } catch { /* essayer le suivant */ }
  }

  try {
    const res = await fetch(`${BASE}/station/carburant/public-key`);
    if (!res.ok) return null;
    const { spki } = await res.json() as { spki: string };
    try { localStorage.setItem(STATION_PK_LS_KEY, spki); } catch { /* ignore */ }
    const spkiBytes = Uint8Array.from(atob(spki), c => c.charCodeAt(0));
    return await crypto.subtle.importKey(
      "spki", spkiBytes, { name: "Ed25519" }, false, ["verify"],
    );
  } catch { return null; }
}

async function verifyQrSig(payload: string, sig: string, pubKey: CryptoKey): Promise<boolean> {
  try {
    const sigBytes = Uint8Array.from(
      atob(sig.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0),
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
  gasoil: "Gasoil", essence: "Essence", super: "Super",
};

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800;
        let w = img.width, h = img.height;
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round((h * MAX) / w); w = MAX; }
          else { w = Math.round((w * MAX) / h); h = MAX; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
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

function extractQrParamsFromUrl(raw: string): { p: string; s: string } | null {
  try {
    const url = new URL(raw.trim());
    const p = url.searchParams.get("p");
    const s = url.searchParams.get("s");
    if (p && s) return { p, s };
  } catch { /* pas une URL */ }
  return null;
}

function decodeQrPayloadRaw(payload: string): QrData | null {
  try {
    const json = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as QrData;
    if (json.v !== 1 || !json.num) return null;
    return json;
  } catch { return null; }
}

function decodeQrPayload(payload: string): QrData | null {
  const data = decodeQrPayloadRaw(payload);
  if (!data) return null;
  if (data.exp < Date.now()) return null;
  return data;
}

function daysUntilExpiry(expMs: number): number {
  return Math.floor((expMs - Date.now()) / 86_400_000);
}

// ── Inline spinner (uses t-spin keyframe from terrain.css) ────────────────────
function Spinner({ color = "var(--t-primary)", size = 18 }: { color?: string; size?: number }) {
  return (
    <span style={{
      display: "inline-block",
      width: size, height: size,
      border: `2px solid ${color}33`,
      borderTopColor: color,
      borderRadius: "50%",
      animation: "t-spin .7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

// ── Composant ─────────────────────────────────────────────────────────────────
export default function StationService() {
  const { toast } = useToast();
  const params = useParams<{ numero?: string }>();

  const [searchValue, setSearchValue] = useState(
    params.numero ? decodeURIComponent(params.numero).toUpperCase() : "",
  );
  const [loading, setLoading]   = useState(false);
  const [bon, setBon]           = useState<BonInfo | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [qrPayload, setQrPayload]   = useState<string | null>(null);
  const [qrSig, setQrSig]           = useState<string | null>(null);
  const [qrVerified, setQrVerified] = useState<true | false | "no-key" | "online" | null>(null);
  const [qrExpired, setQrExpired]   = useState(false);
  const [qrExpiryMs, setQrExpiryMs] = useState<number | null>(null);

  const verifGenRef = useRef(0);

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

  const applyQrOffline = useCallback(async (payload: string, sig: string): Promise<"ok" | "failed" | "no-key" | "expired"> => {
    const rawData = decodeQrPayloadRaw(payload);
    if (!rawData) return "failed";

    const isExpired = rawData.exp < Date.now();
    const gen = ++verifGenRef.current;
    setQrPayload(payload); setQrSig(sig);
    setQrVerified(null); setQrExpired(isExpired); setQrExpiryMs(rawData.exp);

    const pubKey = await loadPublicKey();
    if (verifGenRef.current !== gen) return "failed";

    const sigOk = pubKey ? await verifyQrSig(payload, sig, pubKey) : null;
    if (verifGenRef.current !== gen) return "failed";

    if (sigOk === false) {
      setQrVerified(false); setQrPayload(null); setQrSig(null);
      toast({ title: "QR code invalide", description: "La signature est incorrecte. Ce bon pourrait être falsifié.", variant: "destructive" });
      return "failed";
    }

    setBon({
      numero: rawData.num, statut: "approuve",
      type_carburant: rawData.type, quantite_autorisee: rawData.qte,
      station_service: null, motif: rawData.motif,
      date_emission: rawData.date_em, immatriculation: rawData.immat,
      marque: rawData.marque, chauffeur_nom: rawData.chauffeur,
      offline: true,
    });

    if (!pubKey) { setQrVerified("no-key"); return isExpired ? "expired" : "no-key"; }
    setQrVerified(true);
    return isExpired ? "expired" : "ok";
  }, [toast]);

  const rechercher = useCallback(async (numero?: string, offlinePayload?: string, offlineSig?: string) => {
    const q = (numero ?? searchValue).trim().toUpperCase();
    if (!q) return;
    setLoading(true); setNotFound(false); setBon(null); setDone(false);
    try {
      const res = await fetch(`${BASE}/station/carburant/bons/${encodeURIComponent(q)}`);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data = (await res.json()) as BonInfo;

      verifGenRef.current++;
      setBon(data);
      if (data.station_service) setForm(f => ({ ...f, station_service: data.station_service! }));

      if (offlinePayload && offlineSig) {
        const rawData = decodeQrPayloadRaw(offlinePayload);
        if (!rawData) {
          setQrPayload(null); setQrSig(null); setQrVerified(false);
          setQrExpired(false); setQrExpiryMs(null);
          toast({ title: "QR code invalide", description: "Le payload QR est illisible.", variant: "destructive" });
          return;
        }
        const isExpired = rawData.exp < Date.now();
        setQrExpiryMs(rawData.exp); setQrExpired(isExpired);

        const pubKey = await loadPublicKey();
        if (pubKey) {
          const sigOk = await verifyQrSig(offlinePayload, offlineSig, pubKey);
          if (!sigOk) {
            setQrPayload(null); setQrSig(null); setQrVerified(false);
            setQrExpiryMs(null); setQrExpired(false);
            toast({ title: "QR code invalide", description: "La signature est incorrecte. Ce bon pourrait être falsifié.", variant: "destructive" });
            return;
          }
          setQrVerified(true);
        } else {
          setQrVerified("no-key");
        }
        setQrPayload(offlinePayload); setQrSig(offlineSig);
      } else {
        setQrPayload(null); setQrSig(null);
        setQrVerified(null); setQrExpired(false); setQrExpiryMs(null);
      }
    } catch {
      if (offlinePayload && offlineSig) {
        await applyQrOffline(offlinePayload, offlineSig);
      } else {
        toast({ title: "Erreur réseau", description: "Impossible de contacter le serveur.", variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  }, [searchValue, toast, applyQrOffline]);

  useEffect(() => {
    void loadPublicKey();
    if (!params.numero) return;

    const q = decodeURIComponent(params.numero).toUpperCase();
    setSearchValue(q);
    const sp = new URLSearchParams(window.location.search);
    const p = sp.get("p"); const s = sp.get("s");
    if (p && s) { void rechercher(q, p, s); }
    else { rechercher(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          if (qrParams) { await rechercher(numero, qrParams.p, qrParams.s); }
          else { rechercher(numero); }
          return;
        }
      } catch { /* fallback */ }
    }
    toast({ title: "Scan non disponible", description: "Saisissez le numéro manuellement." });
  }, [rechercher, toast]);

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
      if (qrPayload && qrSig)   { body["qr_payload"] = qrPayload; body["qr_sig"] = qrSig; }

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

  // ── Écran succès ──────────────────────────────────────────────────────────────
  if (done && bon) {
    return (
      <div style={{
        minHeight: "100dvh", background: "var(--t-success-bg)",
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", padding: "24px", gap: 16, textAlign: "center",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "var(--t-success)", display: "flex",
          alignItems: "center", justifyContent: "center",
        }}>
          <CheckCircle2 size={44} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--t-success)", marginBottom: 6 }}>
            Carburant délivré
          </h1>
          <p style={{ color: "var(--t-text)", fontSize: "0.95rem", lineHeight: 1.5 }}>
            Bon <strong>{bon.numero}</strong><br />
            {form.quantite_livree} L de {TYPE_CARB[bon.type_carburant] ?? bon.type_carburant}
          </p>
        </div>
        <button
          className="t-btn t-btn--ghost"
          style={{ maxWidth: 260, height: 48, fontSize: "0.9rem" }}
          onClick={() => {
            setBon(null); setDone(false); setSearchValue(""); setTicketPhoto(null);
            setQrPayload(null); setQrSig(null); setQrVerified(null);
            setQrExpired(false); setQrExpiryMs(null);
            setForm({ quantite_livree: "", prix_litre_fcfa: "", date_utilisation: new Date().toISOString().split("T")[0]!, station_service: "", observations: "" });
          }}
        >
          Nouveau bon
        </button>
      </div>
    );
  }

  const qrPending = qrPayload !== null && qrVerified === null;

  return (
    <div style={{ minHeight: "100dvh", background: "var(--t-bg)" }}>
      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)",
        padding: "40px 20px 32px", position: "relative",
      }}>
        <div style={{ maxWidth: 480, margin: "0 auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
            border: "2px solid rgba(255,255,255,0.25)",
          }}>
            <Fuel size={24} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 800, fontSize: "1.25rem", lineHeight: 1.2 }}>
              Espace Station-Service
            </h1>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem", marginTop: 2 }}>
              Délivrance de carburant
            </p>
          </div>
        </div>
        <svg style={{ position: "absolute", bottom: 0, left: 0, right: 0, width: "100%", display: "block" }}
          viewBox="0 0 375 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 20 C100 0 275 40 375 20 L375 20 L0 20Z" fill="var(--t-bg)" />
        </svg>
      </div>

      {/* ── Contenu ── */}
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ── Recherche ── */}
        <div className="t-card">
          <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--t-text)", display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Search size={16} color="var(--t-primary)" /> Rechercher un bon
          </p>

          {/* Ligne recherche */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input
              className="t-input"
              style={{ flex: 1, height: 48, fontSize: "1rem", textTransform: "uppercase" }}
              placeholder="Numéro du bon (ex: BC-00001)"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && rechercher()}
            />
            <button
              onClick={() => rechercher()}
              disabled={loading || !searchValue.trim()}
              style={{
                width: 48, height: 48, flexShrink: 0,
                background: "var(--t-primary)", color: "#fff",
                border: "none", borderRadius: "var(--t-radius)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: loading || !searchValue.trim() ? 0.5 : 1,
              }}
            >
              {loading
                ? <Spinner color="#fff" size={18} />
                : <Search size={18} />
              }
            </button>
          </div>

          {/* Scanner QR */}
          <div style={{ textAlign: "center" }}>
            <button
              className="t-btn t-btn--ghost t-btn--sm"
              style={{ width: "auto", padding: "0 20px", fontSize: "0.85rem" }}
              onClick={() => photoInputRef.current?.click()}
            >
              <Camera size={15} /> Scanner le QR code
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" capture="environment"
              style={{ display: "none" }} onChange={handleScanQR} />
          </div>

          {/* Introuvable */}
          {notFound && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 12,
              background: "var(--t-danger-bg)", color: "var(--t-danger)",
              borderRadius: 8, padding: "10px 14px", fontSize: "0.85rem", fontWeight: 600,
            }}>
              <XCircle size={16} style={{ flexShrink: 0 }} />
              Bon introuvable. Vérifiez le numéro.
            </div>
          )}
        </div>

        {/* ── Vérification QR en cours ── */}
        {qrPending && (
          <div className="t-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Spinner color="var(--t-primary)" size={22} />
            <div>
              <p style={{ fontWeight: 700, fontSize: "0.9rem", color: "var(--t-text)" }}>
                Vérification de la signature QR…
              </p>
              <p style={{ fontSize: "0.78rem", color: "var(--t-muted)", marginTop: 2 }}>
                Validation de l'authenticité du bon hors connexion
              </p>
            </div>
          </div>
        )}

        {/* ── Bon + bannières ── */}
        {bon && !qrPending && (
          <>
            {/* Bannière QR expiré */}
            {bon.offline && qrExpired && (
              <Banner variant="danger" icon={<XCircle size={16} style={{ flexShrink: 0 }} />}>
                <strong>QR code expiré</strong>
                <span style={{ fontSize: "0.78rem", display: "block", marginTop: 3 }}>
                  Ce QR a expiré le {new Date(qrExpiryMs!).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}.
                  Le chauffeur doit générer un nouveau QR depuis son application.
                </span>
              </Banner>
            )}

            {/* Bannière QR vérifié OK */}
            {bon.offline && !qrExpired && qrVerified === true && (
              <Banner variant="success" icon={<ShieldCheck size={16} style={{ flexShrink: 0 }} />}>
                QR authentique — signature vérifiée hors connexion. La confirmation nécessite internet.
              </Banner>
            )}

            {/* Bannière clé absente */}
            {bon.offline && !qrExpired && qrVerified === "no-key" && (
              <Banner variant="warning" icon={<WifiOff size={16} style={{ flexShrink: 0 }} />}>
                Clé de vérification introuvable (connexion hors ligne totale). Les données proviennent du QR mais n'ont pas pu être vérifiées. La confirmation nécessite internet.
              </Banner>
            )}

            {/* Carte bon */}
            <div className={`t-card ${bon.statut === "approuve" ? "t-card--success" : bon.statut === "utilise" ? "" : "t-card--warning"}`}
              style={{ padding: 0, overflow: "hidden" }}>

              {/* En-tête carte */}
              <div style={{
                display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                padding: "14px 16px 12px", borderBottom: "1px solid var(--t-border)",
              }}>
                <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.05rem", color: "var(--t-primary)" }}>
                  {bon.numero}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {/* Badge expiration QR */}
                  {bon.offline && qrExpired && (
                    <span className="t-badge t-badge--danger">QR expiré</span>
                  )}
                  {bon.offline && !qrExpired && qrExpiryMs !== null && (
                    <span className={`t-badge ${daysUntilExpiry(qrExpiryMs) <= 3 ? "t-badge--warning" : "t-badge--success"}`}>
                      {daysUntilExpiry(qrExpiryMs) <= 0 ? "Expire aujourd'hui" : `Expire dans ${daysUntilExpiry(qrExpiryMs)} j`}
                    </span>
                  )}
                  {/* Icône signature */}
                  {bon.offline && !qrExpired && qrVerified === true && <ShieldCheck size={16} color="var(--t-success)" />}
                  {bon.offline && !qrExpired && qrVerified === "no-key" && <ShieldAlert size={16} color="var(--t-warning)" />}
                  {bon.offline && qrExpired && <XCircle size={16} color="var(--t-danger)" />}
                  {/* Statut bon */}
                  <span className={`t-badge ${
                    bon.statut === "approuve" ? "t-badge--success"
                    : bon.statut === "utilise" ? ""
                    : "t-badge--warning"
                  }`} style={bon.statut === "utilise" ? { background: "#f3f4f6", color: "#6b7280" } : {}}>
                    {bon.statut === "approuve" ? "✓ Approuvé"
                     : bon.statut === "utilise" ? "Déjà utilisé"
                     : bon.statut}
                  </span>
                </div>
              </div>

              {/* Détails grille */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "14px 16px" }}>
                <InfoCell icon={<Car size={15} color="var(--t-muted)" />} label="Véhicule"
                  value={bon.immatriculation ?? "—"} sub={bon.marque ?? undefined} />
                <InfoCell icon={<User size={15} color="var(--t-muted)" />} label="Chauffeur"
                  value={bon.chauffeur_nom ?? "—"} />
                <InfoCell icon={<Droplets size={15} color="var(--t-info)" />} label="Carburant autorisé"
                  value={`${bon.quantite_autorisee} L — ${TYPE_CARB[bon.type_carburant] ?? bon.type_carburant}`}
                  valueColor="var(--t-info)" />
                <InfoCell icon={<CalendarDays size={15} color="var(--t-muted)" />} label="Date d'émission"
                  value={fmt(bon.date_emission)} />
              </div>

              {/* Motif */}
              {bon.motif && (
                <div style={{ margin: "0 16px 14px", background: "var(--t-bg)", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--t-muted)", display: "block", marginBottom: 2 }}>Motif</span>
                  <p style={{ fontSize: "0.88rem", color: "var(--t-text)" }}>{bon.motif}</p>
                </div>
              )}
            </div>

            {/* Avertissement QR requis (recherche manuelle) */}
            {bon.statut === "approuve" && !qrPayload && qrVerified === null && (
              <Banner variant="warning" icon={<ShieldAlert size={16} style={{ flexShrink: 0 }} />}>
                <strong>QR code requis pour livrer</strong>
                <span style={{ fontSize: "0.78rem", display: "block", marginTop: 3 }}>
                  Demandez au chauffeur de présenter son QR code, puis scannez-le ou saisissez l'URL du QR.
                </span>
              </Banner>
            )}

            {/* Formulaire délivrance */}
            {bon.statut === "approuve" && !!qrPayload && !!qrSig && qrVerified !== false && !qrExpired && (
              <div className="t-card">
                <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--t-text)", display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <Fuel size={16} color="var(--t-success)" /> Enregistrer la délivrance
                </p>

                {/* Quantité + Prix */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                  <div className="t-field">
                    <label className="t-label">Quantité livrée (L) *</label>
                    <input className="t-input" style={{ height: 48, fontSize: "1rem" }}
                      type="number" step="0.1" min="0" max={bon.quantite_autorisee + 1}
                      placeholder={`Max ${bon.quantite_autorisee} L`}
                      value={form.quantite_livree}
                      onChange={e => setForm(f => ({ ...f, quantite_livree: e.target.value }))} />
                  </div>
                  <div className="t-field">
                    <label className="t-label">Prix / litre (FCFA)</label>
                    <input className="t-input" style={{ height: 48, fontSize: "1rem" }}
                      type="number" min="0" placeholder="ex: 650"
                      value={form.prix_litre_fcfa}
                      onChange={e => setForm(f => ({ ...f, prix_litre_fcfa: e.target.value }))} />
                  </div>
                </div>

                {/* Montant total calculé */}
                {form.quantite_livree && form.prix_litre_fcfa && (
                  <div style={{
                    background: "var(--t-success-bg)", borderRadius: 10,
                    padding: "10px 16px", textAlign: "center", marginBottom: 12,
                  }}>
                    <p style={{ fontSize: "0.72rem", color: "var(--t-success)", marginBottom: 2 }}>Montant total</p>
                    <p style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--t-success)" }}>
                      {Math.round(parseFloat(form.quantite_livree) * parseFloat(form.prix_litre_fcfa)).toLocaleString("fr-FR")} FCFA
                    </p>
                  </div>
                )}

                <div className="t-field" style={{ marginBottom: 12 }}>
                  <label className="t-label">Date de délivrance *</label>
                  <input className="t-input" style={{ height: 48 }}
                    type="date" value={form.date_utilisation}
                    onChange={e => setForm(f => ({ ...f, date_utilisation: e.target.value }))} />
                </div>

                <div className="t-field" style={{ marginBottom: 12 }}>
                  <label className="t-label">Nom de votre station</label>
                  <input className="t-input" style={{ height: 48, fontSize: "1rem" }}
                    placeholder="Ex: Total Plateau, Shell Koumassi…"
                    value={form.station_service}
                    onChange={e => setForm(f => ({ ...f, station_service: e.target.value }))} />
                </div>

                <div className="t-field" style={{ marginBottom: 16 }}>
                  <label className="t-label">Observations</label>
                  <input className="t-input" style={{ height: 48, fontSize: "1rem" }}
                    placeholder="Remarques éventuelles"
                    value={form.observations}
                    onChange={e => setForm(f => ({ ...f, observations: e.target.value }))} />
                </div>

                {/* Photo ticket */}
                <div className="t-field" style={{ marginBottom: 16 }}>
                  <label className="t-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Receipt size={14} /> Ticket de carburant (photo)
                  </label>
                  {ticketPhoto ? (
                    <div style={{ position: "relative" }}>
                      <img src={ticketPhoto} alt="Ticket"
                        style={{ width: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 8, border: "1px solid var(--t-border)" }} />
                      <button
                        onClick={() => setTicketPhoto(null)}
                        style={{
                          position: "absolute", top: 6, right: 6,
                          background: "rgba(255,255,255,0.9)", border: "1px solid var(--t-border)",
                          borderRadius: 6, width: 28, height: 28, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.85rem", fontWeight: 700, color: "var(--t-text)",
                        }}
                      >✕</button>
                    </div>
                  ) : (
                    <label style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      border: "2px dashed var(--t-border)", borderRadius: "var(--t-radius)",
                      padding: "20px 16px", cursor: "pointer",
                      transition: "border-color .15s",
                    }}>
                      <Camera size={32} color="var(--t-muted)" />
                      <span style={{ fontSize: "0.85rem", color: "var(--t-muted)" }}>Prendre ou choisir une photo</span>
                      <input type="file" accept="image/*" capture="environment"
                        style={{ display: "none" }} onChange={handlePhotoTicket} />
                    </label>
                  )}
                </div>

                <button
                  className="t-btn t-btn--success"
                  onClick={handleLivrer}
                  disabled={submitting || !form.quantite_livree || !form.date_utilisation}
                >
                  {submitting
                    ? <><Spinner color="#fff" size={18} /> Enregistrement…</>
                    : <><CheckCircle2 size={18} /> Confirmer la délivrance</>
                  }
                </button>
              </div>
            )}

            {/* Bon déjà utilisé */}
            {bon.statut === "utilise" && (
              <div style={{ textAlign: "center", color: "var(--t-muted)", fontSize: "0.9rem", padding: "16px 0" }}>
                Ce bon a déjà été utilisé.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Sous-composants ────────────────────────────────────────────────────────────
type BannerVariant = "success" | "warning" | "danger";
const BANNER_STYLES: Record<BannerVariant, { bg: string; color: string; border: string }> = {
  success: { bg: "var(--t-success-bg)", color: "#166534", border: "#bbf7d0" },
  warning: { bg: "var(--t-warning-bg)", color: "#92400e", border: "#fde68a" },
  danger:  { bg: "var(--t-danger-bg)",  color: "#991b1b", border: "#fecaca" },
};

function Banner({ variant, icon, children }: { variant: BannerVariant; icon: React.ReactNode; children: React.ReactNode }) {
  const s = BANNER_STYLES[variant];
  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
      borderRadius: "var(--t-radius)", padding: "12px 14px",
      fontSize: "0.85rem", lineHeight: 1.4,
    }}>
      {icon}
      <div>{children}</div>
    </div>
  );
}

function InfoCell({ icon, label, value, sub, valueColor }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; valueColor?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ marginTop: 2, flexShrink: 0 }}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: "0.7rem", color: "var(--t-muted)", marginBottom: 2 }}>{label}</p>
        <p style={{ fontWeight: 700, fontSize: "0.88rem", color: valueColor ?? "var(--t-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</p>
        {sub && <p style={{ fontSize: "0.72rem", color: "var(--t-muted)" }}>{sub}</p>}
      </div>
    </div>
  );
}

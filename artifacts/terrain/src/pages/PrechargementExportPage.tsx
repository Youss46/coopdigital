import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, ChevronRight, Loader2, RefreshCw, Ship, Weight } from "lucide-react";
import BottomNavPeseur from "../components/BottomNavPeseur";
import { useOffline } from "../contexts/OfflineContext";
import { getExpeditionsApreparer, createSessionPesee } from "../lib/api";
import type { ExpeditionPrechargement } from "../lib/types";

function poids(value: string | number | null | undefined) {
  const n = Number(value ?? 0);
  return n > 0 ? `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg` : "Poids non renseigné";
}

export default function PrechargementExportPage() {
  const [, navigate] = useLocation();
  const { isOnline } = useOffline();
  const [items, setItems] = useState<ExpeditionPrechargement[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function scanQr(file: File) {
    setError("");
    try {
      const BarcodeDetectorCtor = (window as unknown as {
        BarcodeDetector?: new (options?: { formats?: string[] }) => {
          detect: (source: ImageBitmap) => Promise<Array<{ rawValue?: string }>>;
        };
      }).BarcodeDetector;
      if (!BarcodeDetectorCtor) {
        throw new Error("Le scan QR n'est pas disponible sur ce navigateur. Sélectionnez l'expédition dans la liste.");
      }
      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      const bitmap = await createImageBitmap(file);
      const codes = await detector.detect(bitmap);
      bitmap.close();
      const raw = codes[0]?.rawValue?.trim() ?? "";
      const found = items.find((exp) =>
        raw === exp.numeroExpedition
        || raw.includes(exp.numeroExpedition)
        || raw.endsWith(`/expeditions/${exp.id}`),
      );
      if (!found) throw new Error("QR reconnu, mais aucune expédition en préparation ne correspond.");
      await open(found);
    } catch (e) { setError((e as Error).message); }
  }

  async function refresh() {
    if (!isOnline) return;
    setLoading(true);
    setError("");
    try { setItems(await getExpeditionsApreparer()); }
    catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, [isOnline]);

  async function open(expedition: ExpeditionPrechargement) {
    if (!isOnline) return;
    const active = expedition.prechargement?.statut === "en_cours";
    setStarting(expedition.id);
    setError("");
    try {
      const session = active
        ? expedition.prechargement
        : await createSessionPesee({ operation: "prechargement_export", expeditionId: expedition.id, produit: "cacao" });
      if (session) navigate(`/prechargement-session/${session.id}`);
    } catch (e) {
      setError((e as Error).message);
      await refresh();
    } finally { setStarting(null); }
  }

  return (
    <div className="t-app">
      <header className="t-header t-header--peseur">
        <Link href="/" style={{ color: "#fff", display: "flex" }}><ArrowLeft size={20} /></Link>
        <div style={{ flex: 1, marginLeft: 12 }}>
          <div className="t-header__title">Chargements à préparer</div>
          <div className="t-header__sub">Pré-pesée export · connecté uniquement</div>
        </div>
        <button onClick={() => void refresh()} disabled={loading || !isOnline} className="t-icon-btn" title="Actualiser">
          <RefreshCw size={18} />
        </button>
      </header>

      <main className="t-main" style={{ padding: "16px 16px 90px" }}>
        {!isOnline && (
          <div className="t-alert t-alert--warning">La pré-pesée export nécessite une connexion active.</div>
        )}
        {error && <div className="t-alert t-alert--danger">{error}</div>}
        <label className="t-btn t-btn--ghost" style={{ width: "100%", marginBottom: 12, textAlign: "center", cursor: isOnline ? "pointer" : "not-allowed", opacity: isOnline ? 1 : .5 }}>
          Scanner le QR de l’expédition
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={!isOnline}
            onChange={(e) => { const file = e.target.files?.[0]; if (file) void scanQr(file); e.currentTarget.value = ""; }}
            style={{ display: "none" }}
          />
        </label>
        {loading ? (
          <div className="t-loading"><Loader2 className="t-spin" size={24} /> Chargement…</div>
        ) : items.length === 0 ? (
          <div className="t-empty">
            <Ship size={34} />
            <strong>Aucune expédition à préparer</strong>
            <span>Les expéditions en préparation apparaîtront ici.</span>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {items.map((exp) => {
              const pre = exp.prechargement;
              const status = pre?.statut === "en_cours"
                ? "Pré-pesée en cours"
                : pre?.prechargementStatut === "conforme" ? "Pré-pesée conforme"
                : pre?.prechargementStatut === "a_justifier" ? "Écart à justifier"
                : pre?.prechargementStatut === "valide" ? "Écart validé"
                : "À peser";
              const color = pre?.prechargementStatut === "conforme" || pre?.prechargementStatut === "valide"
                ? "#15803d" : pre?.prechargementStatut === "a_justifier" ? "#b45309" : "#0e7490";
              return (
                <button key={exp.id} onClick={() => void open(exp)} disabled={starting === exp.id || !isOnline}
                  style={{ textAlign: "left", border: "none", padding: 0, background: "transparent", cursor: "pointer" }}>
                  <div className="t-session-card">
                    <div className="t-session-card__stripe" style={{ background: color }} />
                    <div className="t-session-card__body">
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}18`, color, display: "grid", placeItems: "center", flexShrink: 0 }}>
                        {starting === exp.id ? <Loader2 className="t-spin" size={20} /> : <Ship size={20} />}
                      </div>
                      <div className="t-session-card__text">
                        <div className="t-session-card__title">{exp.numeroExpedition}</div>
                        <div className="t-session-card__name">{exp.immatriculation ?? "Véhicule non renseigné"} · Port de {exp.port}</div>
                        <div className="t-session-card__meta">
                          Prévu : <strong>{poids(exp.poidsPrevuKg ?? exp.poidsChargeKg)}</strong>
                          {exp.nombreSacs ? ` · ${exp.nombreSacs} sacs` : ""}
                        </div>
                        <div style={{ color, fontSize: ".74rem", fontWeight: 700, marginTop: 3 }}>{status}</div>
                      </div>
                      <ChevronRight size={18} color={color} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: "rgba(14,116,144,.08)", color: "var(--t-muted)", fontSize: ".76rem", display: "flex", gap: 8 }}>
          <Weight size={16} color="var(--t-peseur)" />
          <span>La pré-pesée ne crée pas de livraison et ne déduit pas le stock. Ces effets interviennent seulement à la confirmation du chargement.</span>
        </div>
      </main>
      <BottomNavPeseur />
    </div>
  );
}
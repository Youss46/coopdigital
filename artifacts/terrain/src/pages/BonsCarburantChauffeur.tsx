import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { apiGet, apiPut } from "@/lib/api";
import { Fuel, CheckCircle2, Clock, Droplets, QrCode, X, Share2, Copy, RefreshCw, AlertCircle } from "lucide-react";
import BottomNavChauffeur from "@/components/BottomNavChauffeur";
import { useToast } from "@/hooks/use-toast";
import QRCode from "react-qr-code";

interface BonCarburant {
  id: number;
  numero: string;
  statut: string;
  type_carburant: string;
  quantite_autorisee: number;
  quantite_livree: number | null;
  prix_litre_fcfa: number | null;
  montant_fcfa: number | null;
  station_service: string | null;
  motif: string | null;
  observations: string | null;
  date_emission: string;
  date_utilisation: string | null;
  immatriculation: string | null;
  marque: string | null;
}

interface UtiliserForm {
  quantite_livree: string;
  prix_litre_fcfa: string;
  date_utilisation: string;
  station_service: string;
  observations: string;
}

const STATUT_BON: Record<string, {
  label: string;
  badgeClass: string;
  cardClass: string;
  icon: React.ReactNode;
}> = {
  brouillon: {
    label: "Brouillon",
    badgeClass: "t-badge--info",
    cardClass: "",
    icon: <Clock size={11} />,
  },
  soumis: {
    label: "Soumis",
    badgeClass: "t-badge--info",
    cardClass: "t-card--info",
    icon: <Clock size={11} />,
  },
  approuve: {
    label: "Approuvé",
    badgeClass: "t-badge--success",
    cardClass: "t-card--success",
    icon: <CheckCircle2 size={11} />,
  },
  utilise: {
    label: "Utilisé",
    badgeClass: "t-badge--success",
    cardClass: "t-card--info",
    icon: <Droplets size={11} />,
  },
  annule: {
    label: "Annulé",
    badgeClass: "t-badge--danger",
    cardClass: "t-card--danger",
    icon: null,
  },
};

const TYPE_CARB: Record<string, string> = { gasoil: "Gasoil", essence: "Essence", super: "Super" };

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

const FILTER_TABS = [
  { value: "approuve,soumis,brouillon", label: "En cours" },
  { value: "utilise",                   label: "Utilisés" },
  { value: "annule",                    label: "Annulés"  },
];

export default function BonsCarburantChauffeur() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [bons, setBons] = useState<BonCarburant[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(FILTER_TABS[0]!.value);
  const [selected, setSelected] = useState<BonCarburant | null>(null);
  const [qrBon, setQrBon] = useState<BonCarburant | null>(null);
  const [qrToken, setQrToken] = useState<{ payload: string; sig: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrExpMs, setQrExpMs] = useState<number | null>(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<UtiliserForm>({
    quantite_livree: "", prix_litre_fcfa: "",
    date_utilisation: new Date().toISOString().split("T")[0]!,
    station_service: "", observations: "",
  });

  const load = useCallback(() => {
    setLoading(true);
    apiGet<{ bons: BonCarburant[] }>(`/chauffeur/bons-carburant?statut=${tab}`)
      .then(r => setBons(r.bons))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [tab]);

  const fetchQrToken = useCallback(async (bon: BonCarburant): Promise<boolean> => {
    setQrLoading(true);
    setQrError(null);
    setQrExpMs(null);
    setQrExpired(false);
    try {
      const tok = await apiGet<{ payload: string; sig: string; spki?: string }>(
        `/chauffeur/bons-carburant/${encodeURIComponent(bon.numero)}/qr-token`,
      );
      setQrToken({ payload: tok.payload, sig: tok.sig });
      if (tok.spki) {
        try { localStorage.setItem("station_qr_spki_v1", tok.spki); } catch { /* ignore */ }
      }
      return true;
    } catch (err) {
      setQrError((err as Error).message ?? "Impossible de générer le QR");
      setQrToken(null);
      return false;
    } finally {
      setQrLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!qrToken) {
      setQrExpMs(null);
      setQrExpired(false);
      return;
    }
    let exp: number | null = null;
    try {
      const json = JSON.parse(
        atob(qrToken.payload.replace(/-/g, "+").replace(/_/g, "/")),
      ) as { exp?: number };
      if (typeof json.exp === "number" && Number.isFinite(json.exp)) exp = json.exp;
    } catch { /* ignore malformed payload */ }
    setQrExpMs(exp);
    setQrExpired(exp !== null && exp < Date.now());
    if (exp === null) return;
    const delay = exp - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setQrExpired(true), delay);
    return () => clearTimeout(timer);
  }, [qrToken]);

  useEffect(() => { load(); }, [load]);

  const montantEstime = form.quantite_livree && form.prix_litre_fcfa
    ? Math.round(parseFloat(form.quantite_livree) * parseFloat(form.prix_litre_fcfa))
    : null;

  async function handleUtiliser() {
    if (!selected || !form.quantite_livree || !form.date_utilisation) return;
    setSubmitting(true);
    try {
      await apiPut(`/chauffeur/bons-carburant/${selected.id}/utiliser`, {
        quantite_livree:  parseFloat(form.quantite_livree),
        date_utilisation: form.date_utilisation,
        ...(form.prix_litre_fcfa ? { prix_litre_fcfa: parseFloat(form.prix_litre_fcfa) } : {}),
        ...(form.station_service  ? { station_service: form.station_service }              : {}),
        ...(form.observations     ? { observations: form.observations }                    : {}),
      });
      toast({ title: "Utilisation enregistrée ✓" });
      setSelected(null);
      load();
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", background: "var(--t-bg)", paddingBottom: 88 }}>

      {/* ── Header ── */}
      <div style={{
        background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)",
        padding: "48px 20px 32px",
        position: "relative",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: "rgba(255,255,255,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Fuel size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ color: "#fff", fontWeight: 800, fontSize: "1.25rem" }}>Bons carburant</h1>
            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "0.78rem", marginTop: 2 }}>
              {loading ? "…" : `${bons.length} bon${bons.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>
        <svg
          style={{ position: "absolute", bottom: 0, left: 0, right: 0, width: "100%", display: "block" }}
          viewBox="0 0 375 20" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M0 20 C100 0 275 40 375 20 L375 20 L0 20Z" fill="var(--t-bg)" />
        </svg>
      </div>

      {/* ── Filtres pill chips ── */}
      <div style={{ display: "flex", gap: 8, padding: "14px 16px 4px", overflowX: "auto" }}>
        {FILTER_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            style={{
              flexShrink: 0,
              padding: "6px 14px",
              borderRadius: 999,
              border: "none",
              fontSize: "0.8rem",
              fontWeight: 700,
              cursor: "pointer",
              background: tab === t.value ? "var(--t-primary)" : "var(--t-card)",
              color: tab === t.value ? "#fff" : "var(--t-muted)",
              boxShadow: tab === t.value ? "none" : "0 1px 3px rgba(0,0,0,.07)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Liste ── */}
      <div style={{ padding: "10px 16px 0", display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          [1, 2, 3].map(i => (
            <div key={i} style={{
              height: 110, background: "var(--t-card)",
              borderRadius: "var(--t-radius)", boxShadow: "0 1px 4px rgba(0,0,0,.08)",
            }} />
          ))
        ) : bons.length === 0 ? (
          <div style={{ padding: "60px 24px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <Fuel size={44} color="var(--t-border)" />
            <p style={{ color: "var(--t-muted)", fontSize: "0.9rem" }}>Aucun bon dans cette catégorie</p>
          </div>
        ) : (
          bons.map(bon => {
            const s = STATUT_BON[bon.statut] ?? {
              label: bon.statut,
              badgeClass: "t-badge--info",
              cardClass: "",
              icon: null,
            };
            return (
              <div key={bon.id} className={`t-card ${s.cardClass}`} style={{ padding: 14 }}>

                {/* Top row: numero + badge */}
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
                  <div>
                    <p style={{ fontFamily: "monospace", fontSize: "0.95rem", fontWeight: 800, color: "var(--t-primary)" }}>
                      {bon.numero}
                    </p>
                    <p style={{ fontSize: "0.75rem", color: "var(--t-muted)", marginTop: 2 }}>
                      {bon.immatriculation ?? "—"} · {TYPE_CARB[bon.type_carburant] ?? bon.type_carburant}
                    </p>
                  </div>
                  <span className={`t-badge ${s.badgeClass}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {s.icon}
                    {s.label}
                  </span>
                </div>

                {/* Data grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 4, columnGap: 16, fontSize: "0.78rem", marginBottom: 12 }}>
                  <span style={{ color: "var(--t-muted)" }}>Qté autorisée</span>
                  <span style={{ fontWeight: 700 }}>{bon.quantite_autorisee} L</span>

                  {bon.quantite_livree != null && <>
                    <span style={{ color: "var(--t-muted)" }}>Qté livrée</span>
                    <span style={{ fontWeight: 700, color: "var(--t-success)" }}>{bon.quantite_livree} L</span>
                  </>}

                  {bon.montant_fcfa != null && <>
                    <span style={{ color: "var(--t-muted)" }}>Montant</span>
                    <span style={{ fontWeight: 700 }}>{bon.montant_fcfa.toLocaleString("fr-FR")} FCFA</span>
                  </>}

                  <span style={{ color: "var(--t-muted)" }}>Date émission</span>
                  <span>{fmt(bon.date_emission)}</span>

                  {bon.station_service && <>
                    <span style={{ color: "var(--t-muted)" }}>Station</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bon.station_service}</span>
                  </>}

                  {bon.motif && <>
                    <span style={{ color: "var(--t-muted)" }}>Motif</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontStyle: "italic" }}>{bon.motif}</span>
                  </>}
                </div>

                {/* Actions — approved only */}
                {bon.statut === "approuve" && (
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="t-btn t-btn--success t-btn--sm"
                      style={{ flex: 1 }}
                      onClick={() => {
                        setSelected(bon);
                        setForm({
                          quantite_livree: "", prix_litre_fcfa: "",
                          date_utilisation: new Date().toISOString().split("T")[0]!,
                          station_service: bon.station_service ?? "", observations: "",
                        });
                      }}
                    >
                      <Droplets size={15} /> Utilisation
                    </button>
                    <button
                      className="t-btn t-btn--ghost t-btn--sm"
                      style={{ flex: 1 }}
                      disabled={qrLoading}
                      onClick={async () => {
                        setQrBon(bon);
                        setQrToken(null);
                        await fetchQrToken(bon);
                      }}
                    >
                      <QrCode size={15} /> QR code
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Modal utilisation ── */}
      {selected && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 60,
            background: "rgba(0,0,0,0.55)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={() => setSelected(null)}
        >
          <div
            style={{
              background: "var(--t-card)",
              borderRadius: "var(--t-radius) var(--t-radius) 0 0",
              padding: "24px 20px",
              width: "100%", maxWidth: 480,
              display: "flex", flexDirection: "column", gap: 16,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontWeight: 800, fontSize: "1.05rem", color: "var(--t-text)" }}>Retour station</p>
                <p style={{ fontSize: "0.75rem", color: "var(--t-muted)", marginTop: 2 }}>
                  Bon {selected.numero} · Autorisé : <strong>{selected.quantite_autorisee} L</strong>
                </p>
              </div>
              <button
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--t-muted)", padding: 4 }}
                onClick={() => setSelected(null)}
              >
                <X size={22} />
              </button>
            </div>

            {/* Fields */}
            <div className="t-field">
              <label className="t-label">Quantité livrée (L) *</label>
              <input
                className="t-input"
                type="number" min={0} step="any" placeholder="Ex: 45"
                value={form.quantite_livree}
                onChange={e => setForm(f => ({ ...f, quantite_livree: e.target.value }))}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="t-field">
                <label className="t-label">Prix au litre (FCFA)</label>
                <input
                  className="t-input"
                  type="number" min={0} step="any" placeholder="Prix/L"
                  value={form.prix_litre_fcfa}
                  onChange={e => setForm(f => ({ ...f, prix_litre_fcfa: e.target.value }))}
                />
              </div>
              <div className="t-field">
                <label className="t-label">Montant estimé</label>
                <div style={{
                  height: 56, display: "flex", alignItems: "center",
                  padding: "0 16px",
                  background: "var(--t-bg)",
                  border: "2px solid var(--t-border)",
                  borderRadius: "var(--t-radius)",
                  fontWeight: 700, fontSize: "0.95rem", color: "var(--t-primary)",
                }}>
                  {montantEstime != null ? `${montantEstime.toLocaleString("fr-FR")} F` : "—"}
                </div>
              </div>
            </div>

            <div className="t-field">
              <label className="t-label">Date *</label>
              <input
                className="t-input"
                type="date"
                value={form.date_utilisation}
                onChange={e => setForm(f => ({ ...f, date_utilisation: e.target.value }))}
              />
            </div>

            <div className="t-field">
              <label className="t-label">Station-service</label>
              <input
                className="t-input"
                placeholder="Nom de la station"
                value={form.station_service}
                onChange={e => setForm(f => ({ ...f, station_service: e.target.value }))}
              />
            </div>

            <div className="t-field">
              <label className="t-label">Observations</label>
              <input
                className="t-input"
                placeholder="Remarques éventuelles"
                value={form.observations}
                onChange={e => setForm(f => ({ ...f, observations: e.target.value }))}
              />
            </div>

            {/* Footer */}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="t-btn t-btn--ghost t-btn--sm"
                style={{ flex: 1 }}
                onClick={() => setSelected(null)}
              >
                Annuler
              </button>
              <button
                className="t-btn t-btn--success t-btn--sm"
                style={{ flex: 1 }}
                disabled={!form.quantite_livree || !form.date_utilisation || submitting}
                onClick={handleUtiliser}
              >
                {submitting ? "Enregistrement…" : "Confirmer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal QR plein écran ── */}
      {qrBon && (() => {
        const base = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}`;
        const stationUrl = qrToken
          ? `${base}/station/${encodeURIComponent(qrBon.numero)}?p=${qrToken.payload}&s=${qrToken.sig}`
          : `${base}/station/${encodeURIComponent(qrBon.numero)}`;

        return (
          <div
            style={{
              position: "fixed", inset: 0, zIndex: 70,
              background: "rgba(0,0,0,0.88)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              padding: 24,
            }}
            onClick={() => setQrBon(null)}
          >
            {/* Close button */}
            <button
              style={{
                position: "absolute", top: 16, right: 16,
                background: "rgba(255,255,255,0.15)", border: "none",
                borderRadius: 8, width: 40, height: 40,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
              onClick={() => setQrBon(null)}
            >
              <X size={22} color="#fff" />
            </button>

            <div
              style={{
                background: "var(--t-card)",
                borderRadius: "var(--t-radius)",
                padding: 24,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
                maxWidth: 320, width: "100%",
                boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Bon number */}
              <p style={{ fontFamily: "monospace", fontSize: "1.1rem", fontWeight: 800, color: "var(--t-primary)" }}>
                {qrBon.numero}
              </p>
              <p style={{ fontSize: "0.78rem", color: "var(--t-muted)", textAlign: "center" }}>
                Présentez ce QR à la station-service
              </p>

              {/* QR code */}
              <div style={{
                padding: 12, background: "#fff",
                borderRadius: "var(--t-radius)",
                border: "1px solid var(--t-border)",
                position: "relative",
                opacity: qrExpired ? 0.4 : 1,
                transition: "opacity .2s",
              }}>
                {qrLoading && (
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(255,255,255,0.8)",
                    borderRadius: "var(--t-radius)",
                  }}>
                    <div style={{
                      width: 28, height: 28,
                      border: "3px solid var(--t-primary)",
                      borderTopColor: "transparent",
                      borderRadius: "50%",
                      animation: "spin 0.7s linear infinite",
                    }} />
                  </div>
                )}
                <QRCode value={stationUrl} size={220} level="M" />
              </div>

              {/* Status line */}
              {qrError ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--t-danger)", fontSize: "0.78rem", textAlign: "center" }}>
                  <AlertCircle size={15} style={{ flexShrink: 0 }} />
                  <span>{qrError}</span>
                </div>
              ) : qrToken ? (
                qrExpMs !== null ? (
                  qrExpired ? (
                    <p style={{ fontSize: "0.78rem", color: "var(--t-danger)", textAlign: "center", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <AlertCircle size={14} style={{ flexShrink: 0 }} />
                      Expiré — rafraîchissez
                    </p>
                  ) : (
                    <p style={{ fontSize: "0.78rem", color: "var(--t-success)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                      <span>🔒</span> Valide jusqu'au{" "}
                      {new Date(qrExpMs).toLocaleString("fr-FR", {
                        day: "2-digit", month: "short", year: "numeric",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  )
                ) : (
                  <p style={{ fontSize: "0.78rem", color: "var(--t-success)", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                    <span>🔒</span> QR signé — lisible hors connexion
                  </p>
                )
              ) : (
                <p style={{ fontSize: "0.78rem", color: "var(--t-warning)", textAlign: "center" }}>
                  {qrLoading ? "Génération du QR sécurisé…" : "QR simple (connexion requise à la station)"}
                </p>
              )}

              {/* Refresh button */}
              <button
                className="t-btn t-btn--ghost t-btn--sm"
                disabled={qrLoading}
                style={qrExpired ? { borderColor: "var(--t-danger)", color: "var(--t-danger)" } : {}}
                onClick={async () => { await fetchQrToken(qrBon); }}
              >
                <RefreshCw size={14} style={{ animation: qrLoading ? "spin 0.7s linear infinite" : "none" }} />
                Rafraîchir le QR
              </button>

              <p style={{ fontSize: "0.72rem", color: "var(--t-muted)", fontFamily: "monospace" }}>{qrBon.numero}</p>

              {/* Share / copy */}
              <button
                className="t-btn t-btn--primary t-btn--sm"
                onClick={async () => {
                  if (navigator.share) {
                    try {
                      await navigator.share({
                        title: `Bon carburant ${qrBon.numero}`,
                        text: `Bon carburant ${qrBon.numero} — ${qrBon.quantite_autorisee} L`,
                        url: stationUrl,
                      });
                    } catch {
                      // user cancelled or share failed silently
                    }
                  } else {
                    try {
                      await navigator.clipboard.writeText(stationUrl);
                      toast({ title: "Lien copié dans le presse-papiers ✓" });
                    } catch {
                      toast({ title: "Impossible de copier le lien", variant: "destructive" });
                    }
                  }
                }}
              >
                {"share" in navigator
                  ? <><Share2 size={15} /> Partager</>
                  : <><Copy size={15} /> Copier le lien</>}
              </button>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <BottomNavChauffeur />
    </div>
  );
}

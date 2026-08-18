import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { getPeseurCollectes, telechargerRecuLivraison, telechargerBordereauSession } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import type { PeseurCollecte } from "../lib/types";
import BottomNavPeseur from "../components/BottomNavPeseur";

const CACHE_KEY = "peseur_collectes_cache";

function formatDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y?.slice(2)}`;
}

function formatMontant(n: number) {
  return n.toLocaleString("fr-FR") + " FCFA";
}

function statutStyle(s: string): { color: string; bg: string; label: string } {
  if (s === "PAYÉ") return { color: "#16a34a", bg: "rgba(22,163,74,.12)", label: "Payé" };
  if (s === "DIFFÉRÉ") return { color: "#f59e0b", bg: "rgba(245,158,11,.12)", label: "Différé" };
  return { color: "#94a3b8", bg: "rgba(148,163,184,.1)", label: s };
}

export default function HistoriquePeseur() {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const [collectes, setCollectes] = useState<PeseurCollecte[]>([]);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadErreur, setDownloadErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    setErreur(null);
    try {
      const data = await getPeseurCollectes();
      setCollectes(data);
      setFromCache(false);
      // Cache for offline use
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
    } catch (e) {
      // Try cache
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          setCollectes(JSON.parse(cached) as PeseurCollecte[]);
          setFromCache(true);
          return;
        }
      } catch {}
      setErreur((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load from cache immediately while fetching
  useEffect(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        setCollectes(JSON.parse(cached) as PeseurCollecte[]);
        setFromCache(true);
        setLoading(false);
      }
    } catch {}
    void charger();
  }, [charger]);

  const totalPoids = collectes.reduce((s, c) => s + c.poidsKg, 0);
  const totalMontant = collectes.filter((c) => c.type !== "reception_transfert").reduce((s, c) => s + c.montantNetFcfa, 0);

  return (
    <div className="t-app">
      <header className="t-header">
        <button className="t-header__back" onClick={() => setLocation("/")}>‹</button>
        <div style={{ flex: 1 }}>
          <div className="t-header__title">Mes collectes</div>
          <div className="t-header__sub">
            {loading ? "Chargement…" : `${collectes.length} livraison${collectes.length !== 1 ? "s" : ""}`}
          </div>
        </div>
        {!loading && isOnline && (
          <button
            onClick={() => void charger()}
            style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: ".8rem", fontWeight: 700, cursor: "pointer" }}
          >
            🔄
          </button>
        )}
      </header>

      <main className="t-main" style={{ paddingBottom: 24 }}>
        {/* Bannière hors-ligne/cache */}
        {(fromCache || !isOnline) && (
          <div style={{ margin: "0 0 12px", padding: "8px 14px", background: "#1e2d45", borderLeft: "3px solid #f59e0b", borderRadius: 8, fontSize: ".8rem", color: "#f59e0b" }}>
            📡 {isOnline ? "Données en cache — actualisation en cours…" : "Hors ligne — données en cache"}
          </div>
        )}

        {/* KPIs */}
        {collectes.length > 0 && (
          <div className="t-stats" style={{ marginBottom: 16 }}>
            <div className="t-stat">
              <div className="t-stat__value">{collectes.length}</div>
              <div className="t-stat__label">Livraisons</div>
            </div>
            <div className="t-stat">
              <div className="t-stat__value">{totalPoids.toLocaleString("fr-FR")}</div>
              <div className="t-stat__label">Kg total</div>
            </div>
            <div className="t-stat">
              <div className="t-stat__value" style={{ fontSize: ".85rem" }}>{totalMontant.toLocaleString("fr-FR")}</div>
              <div className="t-stat__label">FCFA net</div>
            </div>
          </div>
        )}

        {/* Erreur chargement */}
        {erreur && (
          <div style={{ margin: "0 0 12px", padding: "10px 14px", background: "rgba(220,38,38,.12)", border: "1px solid rgba(220,38,38,.3)", borderRadius: 8, fontSize: ".85rem", color: "#f87171" }}>
            ⚠️ {erreur}
          </div>
        )}

        {/* Erreur téléchargement reçu */}
        {downloadErreur && (
          <div
            style={{ margin: "0 0 12px", padding: "10px 14px", background: "rgba(220,38,38,.12)", border: "1px solid rgba(220,38,38,.3)", borderRadius: 8, fontSize: ".85rem", color: "#f87171", cursor: "pointer" }}
            onClick={() => setDownloadErreur(null)}
          >
            ⚠️ {downloadErreur} — appuyez pour fermer
          </div>
        )}

        {/* Spinner */}
        {loading && collectes.length === 0 && (
          <div className="t-spinner" style={{ marginTop: 40 }} />
        )}

        {/* Liste vide */}
        {!loading && collectes.length === 0 && !erreur && (
          <div className="t-empty" style={{ marginTop: 40 }}>
            <div className="t-empty__icon">📋</div>
            <div className="t-empty__text">Aucune collecte enregistrée</div>
          </div>
        )}

        {/* Liste des collectes */}
        <div>
          {collectes.map((c) => {
            const isTransfert = c.type === "reception_transfert";
            const st = statutStyle(c.statutPaiement);
            return (
              <div key={`${isTransfert ? "tr" : "lv"}-${c.id}`} className="t-card" style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ fontSize: "1.4rem", lineHeight: 1 }}>{isTransfert ? "🚛" : "⚖️"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isTransfert ? (
                      <>
                        <div style={{ fontWeight: 700, fontSize: ".9rem", marginBottom: 2 }}>
                          Réception transfert
                        </div>
                        <div style={{ fontSize: ".78rem", color: "var(--t-muted)", marginBottom: 4 }}>
                          {c.entrepotNom ?? "—"}{c.transfertNumero ? ` · ${c.transfertNumero}` : ""}
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 700, fontSize: ".9rem", marginBottom: 2 }}>
                          {c.membreNom} {c.membrePrenoms}
                        </div>
                        {c.membreCode && (
                          <div style={{ fontSize: ".75rem", color: "var(--t-muted)", marginBottom: 4 }}>
                            {c.membreCode}
                          </div>
                        )}
                      </>
                    )}
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <span style={{ fontSize: ".82rem", color: "#e2e8f0" }}>
                        🌿 {c.poidsKg.toLocaleString("fr-FR")} kg
                      </span>
                      {!isTransfert && (
                        <span style={{ fontSize: ".82rem", color: "#e2e8f0" }}>
                          💵 {formatMontant(c.montantNetFcfa)}
                        </span>
                      )}
                    </div>
                    {!isTransfert && (
                      <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {c.fromSession && (
                          <span style={{
                            fontSize: ".7rem", fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                            color: "#818cf8", background: "rgba(129,140,248,.15)",
                            border: "1px solid rgba(129,140,248,.3)",
                          }}>
                            ⚖️ Session groupée
                          </span>
                        )}
                        {c.planAvanceType === "reporte" && (
                          <span style={{
                            fontSize: ".7rem", fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                            color: "#fbbf24", background: "rgba(251,191,36,.12)",
                            border: "1px solid rgba(251,191,36,.35)",
                          }}>
                            ⏸ Avance reportée
                          </span>
                        )}
                        {c.planAvanceType === "partiel" && (
                          <span style={{
                            fontSize: ".7rem", fontWeight: 700, padding: "2px 7px", borderRadius: 10,
                            color: "#fb923c", background: "rgba(251,146,60,.12)",
                            border: "1px solid rgba(251,146,60,.35)",
                          }}>
                            ⚡ Avance partielle
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: ".7rem", color: "var(--t-muted)" }}>
                      {formatDate(c.dateLivraison)}
                    </span>
                    {!isTransfert && (
                      <span style={{
                        fontSize: ".72rem", fontWeight: 700, padding: "3px 8px", borderRadius: 12,
                        color: st.color, background: st.bg,
                      }}>
                        {st.label}
                      </span>
                    )}
                    {isOnline && !isTransfert && (
                      <button
                        disabled={downloadingId === c.id}
                        onClick={async () => {
                          setDownloadingId(c.id);
                          setDownloadErreur(null);
                          try {
                            await telechargerRecuLivraison(c.id);
                          } catch (e) {
                            setDownloadErreur((e as Error).message || "Erreur téléchargement");
                          }
                          setDownloadingId(null);
                        }}
                        style={{
                          marginTop: 2,
                          background: downloadingId === c.id ? "rgba(255,255,255,.08)" : "rgba(99,210,132,.18)",
                          border: "1px solid rgba(99,210,132,.35)",
                          borderRadius: 8,
                          color: downloadingId === c.id ? "var(--t-muted)" : "#63d284",
                          fontSize: ".7rem",
                          fontWeight: 700,
                          padding: "4px 10px",
                          cursor: downloadingId === c.id ? "default" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {downloadingId === c.id ? "…" : "📄 Reçu"}
                      </button>
                    )}
                    {isOnline && isTransfert && c.sessionId && (
                      <button
                        disabled={downloadingId === c.id}
                        onClick={async () => {
                          setDownloadingId(c.id);
                          setDownloadErreur(null);
                          try {
                            await telechargerBordereauSession(c.sessionId!);
                          } catch (e) {
                            setDownloadErreur((e as Error).message || "Erreur téléchargement");
                          }
                          setDownloadingId(null);
                        }}
                        style={{
                          marginTop: 2,
                          background: downloadingId === c.id ? "rgba(255,255,255,.08)" : "rgba(26,71,49,.4)",
                          border: "1px solid rgba(99,210,132,.35)",
                          borderRadius: 8,
                          color: downloadingId === c.id ? "var(--t-muted)" : "#63d284",
                          fontSize: ".7rem",
                          fontWeight: 700,
                          padding: "4px 10px",
                          cursor: downloadingId === c.id ? "default" : "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {downloadingId === c.id ? "…" : "📋 Bordereau"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
      <BottomNavPeseur />
    </div>
  );
}

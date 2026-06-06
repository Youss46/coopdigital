import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { getBilan, envoyerRapport } from "../lib/api";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import BottomNav from "../components/BottomNav";
import type { BilanJour } from "../lib/types";

export default function Bilan() {
  const [, setLocation] = useLocation();
  const { isOnline } = useOffline();
  const [bilan, setBilan] = useState<BilanJour | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!isOnline) { setLoading(false); return; }
    getBilan()
      .then(setBilan)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOnline]);

  async function handleEnvoyerRapport() {
    setSending(true);
    setMsg("");
    try {
      const r = await envoyerRapport();
      setMsg(r.message);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="t-app">
      <header className="t-header">
        <button className="t-header__back" onClick={() => setLocation("/")}>‹</button>
        <div>
          <div className="t-header__title">Bilan du jour</div>
          <div className="t-header__sub">{today}</div>
        </div>
      </header>

      <OfflineBanner />

      <main className="t-main t-main--no-nav" style={{ paddingBottom: "80px" }}>
        {loading && <div className="t-spinner" />}

        {!loading && !isOnline && (
          <div className="t-empty">
            <div className="t-empty__icon">📴</div>
            <div className="t-empty__text">Bilan non disponible hors ligne</div>
          </div>
        )}

        {!loading && bilan && (
          <>
            {/* Stats principales */}
            <div className="t-section-title">Récapitulatif</div>

            <div className="t-stats">
              <div className="t-stat">
                <div className="t-stat__value">{bilan.collectes.nb}</div>
                <div className="t-stat__label">Collectes</div>
              </div>
              <div className="t-stat">
                <div className="t-stat__value">{(bilan.collectes.tonnage / 1000).toFixed(2)} T</div>
                <div className="t-stat__label">Tonnage total</div>
              </div>
            </div>

            <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="t-card t-card--success">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{bilan.collectes.valeur.toLocaleString("fr-FR")} FCFA</div>
                    <div className="t-text-muted">Valeur brute collectes</div>
                  </div>
                  <span style={{ fontSize: "1.8rem" }}>⚖️</span>
                </div>
              </div>

              <div className="t-card t-card--info">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{bilan.paiements.total.toLocaleString("fr-FR")} FCFA</div>
                    <div className="t-text-muted">{bilan.paiements.nb} paiement(s) effectué(s)</div>
                  </div>
                  <span style={{ fontSize: "1.8rem" }}>💵</span>
                </div>
              </div>

              <div className="t-card t-card--warning">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{bilan.avances.total.toLocaleString("fr-FR")} FCFA</div>
                    <div className="t-text-muted">{bilan.avances.nb} avance(s) octroyée(s)</div>
                  </div>
                  <span style={{ fontSize: "1.8rem" }}>💰</span>
                </div>
              </div>
            </div>

            {/* Dernières opérations */}
            {bilan.dernieresOps.length > 0 && (
              <>
                <div className="t-section-title">Dernières opérations</div>
                <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {bilan.dernieresOps.map((op, i) => (
                    <div key={i} className="t-card" style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{ fontSize: "1.4rem" }}>
                        {op.type === "collecte" ? "⚖️" : op.type === "paiement" ? "💵" : "💰"}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: ".9rem" }}>{op.label}</div>
                        <div className="t-text-muted">{op.heure}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {bilan.dernieresOps.length === 0 && (
              <div className="t-empty">
                <div className="t-empty__icon">📭</div>
                <div className="t-empty__text">Aucune opération aujourd'hui</div>
              </div>
            )}

            {/* Envoyer rapport */}
            <div style={{ padding: "16px" }}>
              {msg && (
                <div style={{ background: "var(--t-success-bg)", color: "var(--t-success)", borderRadius: "var(--t-radius)", padding: "12px 14px", marginBottom: 12, fontSize: ".85rem", fontWeight: 600, whiteSpace: "pre-wrap" }}>
                  ✅ Rapport envoyé
                </div>
              )}
              <button
                className="t-btn t-btn--primary"
                disabled={sending || !isOnline}
                onClick={handleEnvoyerRapport}
              >
                {sending ? "Envoi…" : "📤 Envoyer le rapport journalier"}
              </button>
              {!isOnline && (
                <div className="t-text-muted" style={{ textAlign: "center", marginTop: 8, fontSize: ".85rem" }}>
                  Disponible uniquement en ligne
                </div>
              )}
            </div>
          </>
        )}
      </main>

      <BottomNav />
    </div>
  );
}

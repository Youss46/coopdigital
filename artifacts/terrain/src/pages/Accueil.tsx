import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getProfil, getCaisse } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useOffline } from "../contexts/OfflineContext";
import OfflineBanner from "../components/OfflineBanner";
import type { BilanJour, PrixActuel, CaisseDelegue } from "../lib/types";

export default function Accueil() {
  const { user, logout } = useAuth();
  const { isOnline, pendingCount } = useOffline();
  const [bilan, setBilan] = useState<BilanJour | null>(null);
  const [prix, setPrix] = useState<PrixActuel | null>(null);
  const [caisse, setCaisse] = useState<CaisseDelegue | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmDeconnexion, setConfirmDeconnexion] = useState(false);

  useEffect(() => {
    if (!isOnline) { setLoading(false); return; }
    Promise.all([
      getProfil().then((p) => { setBilan(p.statsJour); setPrix(p.prixActuel); }),
      getCaisse().then(setCaisse).catch(() => {}),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [isOnline]);

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="t-app">
      <header className="t-header">
        <div style={{ flex: 1 }}>
          <div className="t-header__title">Bonjour, {user?.nom} 👋</div>
          <div className="t-header__sub">
            {user?.zoneNom ? `Zone : ${user.zoneNom}` : (user?.section ?? "Délégué de localité")}
          </div>
        </div>
        {caisse && caisse.paiementsDifferesCount > 0 && (
          <Link href="/paiements-differes">
            <span className="t-header__badge" style={{ background: "#ef4444", cursor: "pointer" }}>
              ⏳ {caisse.paiementsDifferesCount}
            </span>
          </Link>
        )}
        {pendingCount > 0 && (
          <span className="t-header__badge">📴 {pendingCount}</span>
        )}
        <button
          onClick={() => setConfirmDeconnexion(true)}
          style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: ".8rem", fontWeight: 700, cursor: "pointer" }}
        >
          ⎋
        </button>
      </header>

      <OfflineBanner />

      <main className="t-main">
        {prix && (
          <div style={{ background: "var(--t-primary)", color: "#fff", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: ".85rem", opacity: .8 }}>Prix bord champ</span>
            <span style={{ fontWeight: 800, fontSize: "1.1rem" }}>{prix.prixBordChampFcfa.toLocaleString("fr-FR")} FCFA/kg</span>
          </div>
        )}

        {/* Caisse */}
        {caisse !== null && (
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(255,255,255,.15)" }}>
            <div style={{ flex: 1, padding: "10px 16px", background: "rgba(0,0,0,.15)" }}>
              <div style={{ fontSize: ".72rem", color: "rgba(255,255,255,.7)", marginBottom: 2 }}>Solde caisse</div>
              <div style={{ fontWeight: 800, fontSize: ".95rem", color: caisse.solde > 0 ? "#4ade80" : "#f87171" }}>
                {caisse.solde.toLocaleString("fr-FR")} FCFA
              </div>
            </div>
            {caisse.paiementsDifferesCount > 0 && (
              <Link href="/paiements-differes" style={{ flex: 1, padding: "10px 16px", background: "rgba(239,68,68,.2)", textDecoration: "none", display: "block" }}>
                <div style={{ fontSize: ".72rem", color: "rgba(255,255,255,.7)", marginBottom: 2 }}>Paiements différés</div>
                <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#fca5a5" }}>
                  {caisse.paiementsDifferesCount} · {caisse.montantDuFcfa.toLocaleString("fr-FR")} FCFA
                </div>
              </Link>
            )}
          </div>
        )}

        {/* Stats du jour */}
        {!loading && bilan && (
          <div className="t-stats">
            <div className="t-stat">
              <div className="t-stat__value">{bilan.collectes.nb}</div>
              <div className="t-stat__label">Collectes</div>
            </div>
            <div className="t-stat">
              <div className="t-stat__value">{(bilan.collectes.tonnage / 1000).toFixed(1)} T</div>
              <div className="t-stat__label">Tonnage</div>
            </div>
            <div className="t-stat">
              <div className="t-stat__value">{bilan.paiements.nb}</div>
              <div className="t-stat__label">Paiements</div>
            </div>
            <div className="t-stat">
              <div className="t-stat__value">{bilan.avances.nb}</div>
              <div className="t-stat__label">Avances</div>
            </div>
          </div>
        )}

        {loading && <div className="t-spinner" />}

        {/* Actions */}
        <div className="t-actions">
          <Link href="/collecte" className="t-action t-action--collecte">
            <span className="t-action__icon">⚖️</span>
            <span className="t-action__label">Collecte</span>
          </Link>
          <Link href="/paiement" className="t-action t-action--paiement">
            <span className="t-action__icon">💵</span>
            <span className="t-action__label">Paiement</span>
          </Link>
          <Link href="/avance" className="t-action t-action--avance">
            <span className="t-action__icon">💰</span>
            <span className="t-action__label">Avance</span>
          </Link>
          <Link href="/bilan" className="t-action t-action--bilan">
            <span className="t-action__icon">📊</span>
            <span className="t-action__label">Bilan du jour</span>
          </Link>
          <Link href="/paiements-differes" className="t-action" style={{ background: caisse && caisse.paiementsDifferesCount > 0 ? "#fef2f2" : undefined, position: "relative" }}>
            <span className="t-action__icon">⏳</span>
            <span className="t-action__label">Différés</span>
            {caisse && caisse.paiementsDifferesCount > 0 && (
              <span style={{ position: "absolute", top: 6, right: 6, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: ".65rem", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {caisse.paiementsDifferesCount}
              </span>
            )}
          </Link>
        </div>

        {/* Dernières opérations */}
        {bilan && bilan.dernieresOps.length > 0 && (
          <>
            <div className="t-section-title">Dernières opérations</div>
            <div style={{ padding: "0 16px 16px" }}>
              {bilan.dernieresOps.map((op, i) => (
                <div key={i} className="t-card" style={{ marginBottom: 10, display: "flex", gap: 12, alignItems: "center" }}>
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

        {/* Section info */}
        {user?.section && (
          <div style={{ padding: "0 16px 16px" }}>
            <div className="t-card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: "1.2rem" }}>📍</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".9rem" }}>Section : {user.section}</div>
                <div className="t-text-muted">Zone d'intervention</div>
              </div>
            </div>
          </div>
        )}
      </main>

      <nav className="t-nav">
        {[
          { path: "/", icon: "🏠", label: "Accueil" },
          { path: "/collecte", icon: "⚖️", label: "Collecte" },
          { path: "/paiement", icon: "💵", label: "Paiement" },
          { path: "/avance", icon: "💰", label: "Avance" },
          { path: "/bilan", icon: "📊", label: "Bilan" },
        ].map((item) => (
          <Link key={item.path} href={item.path} className={`t-nav__item${location.pathname === item.path ? " t-nav__item--active" : ""}`}>
            <span className="t-nav__icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>

      {/* Modal confirmation déconnexion */}
      {confirmDeconnexion && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 320, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#111" }}>Déconnexion</div>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <div style={{ fontSize: ".9rem", color: "#555" }}>Voulez-vous vraiment vous déconnecter ?</div>
            </div>
            <div style={{ padding: "0 24px 20px", display: "flex", gap: 12 }}>
              <button
                onClick={() => setConfirmDeconnexion(false)}
                style={{ flex: 1, padding: "10px", border: "1px solid #e0e0e0", borderRadius: 10, fontSize: ".85rem", fontWeight: 600, cursor: "pointer", background: "#fff", color: "#333" }}
              >
                Annuler
              </button>
              <button
                onClick={() => { setConfirmDeconnexion(false); logout(); }}
                style={{ flex: 1, padding: "10px", border: "none", borderRadius: 10, fontSize: ".85rem", fontWeight: 600, cursor: "pointer", background: "#dc2626", color: "#fff" }}
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

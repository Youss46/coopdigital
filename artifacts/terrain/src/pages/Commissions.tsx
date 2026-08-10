import { useEffect, useState } from "react";
import { Link } from "wouter";
import { getMesCommissions } from "../lib/api";
import type { CommissionResume } from "../lib/types";

function fmt(n: number | string) {
  return Number(n).toLocaleString("fr-FR");
}

function statutBadge(statut: string) {
  if (statut === "payee") return { label: "Payée", bg: "#dcfce7", color: "#16a34a" };
  return { label: "En attente", bg: "#fef9c3", color: "#ca8a04" };
}

export default function Commissions() {
  const [data, setData] = useState<CommissionResume | null>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    getMesCommissions()
      .then(setData)
      .catch((e: Error) => setErreur(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="t-app">
      <header className="t-header">
        <Link href="/" style={{ color: "#fff", textDecoration: "none", fontSize: "1.3rem", marginRight: 8 }}>←</Link>
        <div style={{ flex: 1 }}>
          <div className="t-header__title">Mes commissions</div>
          <div className="t-header__sub">Cumul et historique</div>
        </div>
      </header>

      <main className="t-main" style={{ paddingBottom: 80 }}>
        {loading && <div className="t-spinner" style={{ margin: "40px auto" }} />}

        {erreur && (
          <div style={{ margin: 16, background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "14px 16px", color: "#dc2626", fontSize: ".9rem" }}>
            ⚠️ {erreur}
          </div>
        )}

        {data && (
          <>
            {/* Résumé */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "16px 16px 0" }}>
              <div style={{ background: "#fffbeb", border: "1.5px solid #fde68a", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: ".72rem", color: "#92400e", marginBottom: 4 }}>En attente</div>
                <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#b45309" }}>
                  {fmt(data.enAttenteFcfa)} <span style={{ fontSize: ".7rem", fontWeight: 600 }}>FCFA</span>
                </div>
              </div>
              <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 14, padding: "14px 16px" }}>
                <div style={{ fontSize: ".72rem", color: "#166534", marginBottom: 4 }}>Déjà payé</div>
                <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "#16a34a" }}>
                  {fmt(data.payeFcfa)} <span style={{ fontSize: ".7rem", fontWeight: 600 }}>FCFA</span>
                </div>
              </div>
            </div>

            <div style={{ margin: "12px 16px 0", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: ".72rem", color: "#64748b", marginBottom: 2 }}>Total cumulé ({data.nb} livraisons)</div>
                <div style={{ fontWeight: 800, fontSize: "1.15rem", color: "#0f172a" }}>
                  {fmt(data.totalFcfa)} FCFA
                </div>
              </div>
              <span style={{ fontSize: "1.6rem" }}>🏅</span>
            </div>

            {/* Historique récent */}
            {data.recentes.length > 0 ? (
              <>
                <div className="t-section-title" style={{ marginTop: 20 }}>20 dernières commissions</div>
                <div style={{ padding: "0 16px 16px" }}>
                  {data.recentes.map((c) => {
                    const badge = statutBadge(c.statut);
                    return (
                      <div key={c.id} className="t-card" style={{ marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div style={{ fontSize: ".78rem", color: "#64748b" }}>
                            Livraison #{c.livraisonId} · {new Date(c.createdAt).toLocaleDateString("fr-FR")}
                          </div>
                          <span style={{ background: badge.bg, color: badge.color, borderRadius: 20, padding: "2px 10px", fontSize: ".7rem", fontWeight: 700 }}>
                            {badge.label}
                          </span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: ".95rem" }}>{fmt(c.montantFcfa)} FCFA</span>
                            <span style={{ fontSize: ".75rem", color: "#64748b", marginLeft: 8 }}>
                              ({fmt(c.poidsKg)} kg × {fmt(c.tauxFcfaParKg)} FCFA/kg)
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 24px", color: "#94a3b8" }}>
                <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>📋</div>
                <div style={{ fontWeight: 600 }}>Aucune commission enregistrée</div>
                <div style={{ fontSize: ".85rem", marginTop: 6 }}>Vos commissions apparaîtront ici après chaque collecte.</div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Bottom nav minimal avec retour */}
      <nav className="t-nav">
        <Link href="/" className="t-nav__item">
          <span className="t-nav__icon">🏠</span>
          <span>Accueil</span>
        </Link>
        <Link href="/collecte" className="t-nav__item">
          <span className="t-nav__icon">⚖️</span>
          <span>Collecte</span>
        </Link>
        <Link href="/commissions" className="t-nav__item t-nav__item--active">
          <span className="t-nav__icon">🏅</span>
          <span>Commissions</span>
        </Link>
        <Link href="/bilan" className="t-nav__item">
          <span className="t-nav__icon">📊</span>
          <span>Bilan</span>
        </Link>
      </nav>
    </div>
  );
}

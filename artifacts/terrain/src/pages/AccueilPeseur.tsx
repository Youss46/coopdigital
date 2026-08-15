import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { useOffline } from "../contexts/OfflineContext";
import { getBilan, getSessionsEnCours, getSessionsAConvertir } from "../lib/api";
import BottomNavPeseur from "../components/BottomNavPeseur";
import type { BilanJour, SessionPesee } from "../lib/types";

function fmtPoids(kg: number): string {
  if (kg >= 1000) return (kg / 1000).toFixed(2) + " T";
  return kg.toFixed(1) + " kg";
}

function fmtFcfa(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}

export default function AccueilPeseur() {
  const { user, logout } = useAuth();
  const { isOnline, pendingCount, syncStatus } = useOffline();
  const [location] = useLocation();
  const [confirmDeconnexion, setConfirmDeconnexion] = useState(false);
  const [bilan, setBilan] = useState<BilanJour | null>(null);
  const [sessionsEnCours, setSessionsEnCours] = useState<SessionPesee[]>([]);
  const [sessionsAConvertir, setSessionsAConvertir] = useState<SessionPesee[]>([]);

  // Rafraîchit le bilan à chaque fois que la route revient sur "/" (retour depuis collecte, historique…)
  // et à chaque changement de connectivité
  useEffect(() => {
    if (isOnline) {
      getBilan().then(setBilan).catch(() => {});
    }
  }, [location, isOnline]);

  // Rafraîchit aussi après chaque sync réussie (collectes hors-ligne)
  useEffect(() => {
    if (syncStatus === "done" && isOnline) {
      getBilan().then(setBilan).catch(() => {});
    }
  }, [syncStatus, isOnline]);

  // Récupère les sessions de pesée en cours + terminées sans livraison pour les afficher en raccourci
  useEffect(() => {
    if (!isOnline) { setSessionsEnCours([]); setSessionsAConvertir([]); return; }
    getSessionsEnCours().then(setSessionsEnCours).catch(() => setSessionsEnCours([]));
    getSessionsAConvertir().then(setSessionsAConvertir).catch(() => setSessionsAConvertir([]));
  }, [location, isOnline]);

  return (
    <div className="t-app">
      <header className="t-header">
        <div style={{ flex: 1 }}>
          <div className="t-header__title">Bonjour, {user?.nom} 👋</div>
          <div className="t-header__sub">
            {user?.section ? `Section : ${user.section}` : "Peseur"}
          </div>
        </div>
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

      <main className="t-main">
        {/* ── Bilan du jour ─────────────────────────────────────────────── */}
        {bilan && (
          <div className="t-card" style={{ marginBottom: 12 }}>
            <div className="t-card__title" style={{ marginBottom: 10 }}>📊 Aujourd'hui</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#22c55e" }}>
                  {bilan.collectes.nb}
                </div>
                <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 2 }}>
                  Collecte{bilan.collectes.nb !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#3b82f6" }}>
                  {fmtPoids(bilan.collectes.tonnage)}
                </div>
                <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 2 }}>
                  Tonnage
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: ".95rem", fontWeight: 800, color: "#f59e0b", lineHeight: 1.3 }}>
                  {bilan.collectes.valeur.toLocaleString("fr-FR")}
                </div>
                <div style={{ fontSize: ".68rem", color: "#94a3b8", marginTop: 2 }}>
                  FCFA brut
                </div>
              </div>
            </div>
            {bilan.collectes.nb === 0 && (
              <div style={{ textAlign: "center", color: "#64748b", fontSize: ".8rem", marginTop: 8 }}>
                Aucune collecte enregistrée pour l'instant
              </div>
            )}
          </div>
        )}

        {/* ── Sessions en cours — raccourcis de reprise ─────────────────── */}
        {sessionsEnCours.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {sessionsEnCours.map((s) => (
              <Link key={s.id} href={`/pesee-session/${s.id}`}>
                <div className="t-card" style={{
                  marginBottom: 8,
                  background: "linear-gradient(135deg, #1a2d4a 0%, #1e3a5f 100%)",
                  borderLeft: "4px solid #3b82f6",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ fontSize: "1.6rem" }}>▶</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: ".92rem", color: "#93c5fd" }}>
                      Session en cours
                    </div>
                    <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#e2e8f0", marginTop: 2 }}>
                      {s.membreNom} {s.membrePrenoms}
                    </div>
                    <div style={{ fontSize: ".72rem", color: "#64748b", marginTop: 2, fontFamily: "monospace" }}>
                      {s.numeroSession} · {s.nbLignes ?? 0} pesée{(s.nbLignes ?? 0) !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#22c55e" }}>
                      Reprendre
                    </div>
                    <span style={{ fontSize: "1.1rem", color: "#3b82f6" }}>›</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Sessions terminées sans livraison — à convertir ────────────── */}
        {sessionsAConvertir.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {sessionsAConvertir.map((s) => (
              <Link key={s.id} href={`/pesee-session/${s.id}`}>
                <div className="t-card" style={{
                  marginBottom: 8,
                  background: "linear-gradient(135deg, #1a2d14 0%, #1e3a1e 100%)",
                  borderLeft: "4px solid #22c55e",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ fontSize: "1.6rem" }}>📦</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: ".92rem", color: "#86efac" }}>
                      Pesée clôturée · à convertir
                    </div>
                    <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#e2e8f0", marginTop: 2 }}>
                      {s.membreNom} {s.membrePrenoms}
                    </div>
                    <div style={{ fontSize: ".72rem", color: "#64748b", marginTop: 2, fontFamily: "monospace" }}>
                      {s.numeroSession} · {fmtPoids(parseFloat(s.poidsTotalKg))}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: ".85rem", fontWeight: 700, color: "#22c55e" }}>
                      Convertir
                    </div>
                    <span style={{ fontSize: "1.1rem", color: "#22c55e" }}>›</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Actions pesée ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Link href="/collecte">
            <div className="t-card" style={{
              background: "linear-gradient(135deg, #16a34a 0%, #15803d 100%)",
              cursor: "pointer", textAlign: "center", padding: "18px 12px",
            }}>
              <span style={{ fontSize: "2rem" }}>⚖️</span>
              <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#fff", marginTop: 6 }}>
                Pesée simple
              </div>
              <div style={{ fontSize: ".72rem", color: "rgba(255,255,255,.75)", marginTop: 2 }}>
                1 membre · 1 pesée
              </div>
            </div>
          </Link>
          <Link href="/pesee-session">
            <div className="t-card" style={{
              background: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)",
              cursor: "pointer", textAlign: "center", padding: "18px 12px",
            }}>
              <span style={{ fontSize: "2rem" }}>📦</span>
              <div style={{ fontWeight: 800, fontSize: ".95rem", color: "#fff", marginTop: 6 }}>
                Pesée groupée
              </div>
              <div style={{ fontSize: ".72rem", color: "rgba(255,255,255,.75)", marginTop: 2 }}>
                Plusieurs passages cumulés
              </div>
            </div>
          </Link>
        </div>

        {/* ── Opérations en attente de sync ────────────────────────────── */}
        {pendingCount > 0 && (
          <div className="t-card" style={{ marginBottom: 12, borderLeft: "3px solid #f59e0b", background: "#1e2d45" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.4rem" }}>📴</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#f59e0b" }}>
                  {pendingCount} opération{pendingCount > 1 ? "s" : ""} en attente
                </div>
                <div style={{ fontSize: ".78rem", color: "#94a3b8", marginTop: 2 }}>
                  {isOnline
                    ? "Synchronisation en cours…"
                    : "Hors ligne — sera synchronisé à la reconnexion"}
                </div>
              </div>
              <Link href="/historique" style={{ marginLeft: "auto", fontSize: ".78rem", color: "#3b82f6", fontWeight: 600 }}>
                Voir →
              </Link>
            </div>
          </div>
        )}

        {/* ── Hors ligne sans opérations en attente ────────────────────── */}
        {!isOnline && pendingCount === 0 && (
          <div className="t-card" style={{ background: "#1e293b", borderLeft: "3px solid #f59e0b" }}>
            <div style={{ fontSize: ".85rem", color: "#f59e0b" }}>
              📡 Hors ligne — les collectes saisies seront synchronisées à la reconnexion.
            </div>
          </div>
        )}

        {/* ── Lien vers l'historique ────────────────────────────────────── */}
        <Link href="/historique">
          <div className="t-card" style={{
            marginBottom: 12,
            background: "#1e2d45",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}>
            <span style={{ fontSize: "1.6rem" }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: ".9rem", color: "#e2e8f0" }}>
                Mes collectes
              </div>
              <div style={{ fontSize: ".78rem", color: "#94a3b8", marginTop: 2 }}>
                Consulter l'historique de vos livraisons
              </div>
            </div>
            <span style={{ fontSize: "1.2rem", color: "#64748b" }}>›</span>
          </div>
        </Link>
      </main>

      {/* ── Modal déconnexion ─────────────────────────────────────────────── */}
      {confirmDeconnexion && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setConfirmDeconnexion(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 320, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f0f0f0" }}>
              <div style={{ fontWeight: 700, fontSize: "1rem", color: "#111" }}>Déconnexion</div>
            </div>
            <div style={{ padding: "16px 24px" }}>
              <div style={{ fontSize: ".9rem", color: "#555" }}>Voulez-vous vraiment vous déconnecter ?</div>
              {pendingCount > 0 && (
                <div style={{ marginTop: 8, fontSize: ".85rem", color: "#f59e0b" }}>
                  ⚠️ {pendingCount} opération(s) en attente de synchronisation.
                </div>
              )}
            </div>
            <div style={{ padding: "0 24px 20px", display: "flex", gap: 12 }}>
              <button
                onClick={() => setConfirmDeconnexion(false)}
                style={{ flex: 1, padding: "10px", border: "1px solid #e0e0e0", borderRadius: 10, fontSize: ".85rem", fontWeight: 600, cursor: "pointer", background: "#fff", color: "#333" }}
              >
                Annuler
              </button>
              <button
                onClick={logout}
                style={{ flex: 1, padding: "10px", border: "none", borderRadius: 10, fontSize: ".85rem", fontWeight: 600, cursor: "pointer", background: "#dc2626", color: "#fff" }}
              >
                Déconnecter
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNavPeseur />
    </div>
  );
}

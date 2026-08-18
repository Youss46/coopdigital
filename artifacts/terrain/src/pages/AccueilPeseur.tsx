import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { useOffline } from "../contexts/OfflineContext";
import { getBilan, getSessionsEnCours, getSessionsAConvertir } from "../lib/api";
import { getBrouillons } from "../lib/idb";
import BottomNavPeseur from "../components/BottomNavPeseur";
import type { BilanJour, SessionPesee, BrouillonPesee } from "../lib/types";

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
  const [brouillons, setBrouillons] = useState<BrouillonPesee[]>([]);

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

  // Charge les brouillons hors-ligne depuis IndexedDB (toujours, connecté ou non)
  useEffect(() => {
    getBrouillons()
      .then((all) => setBrouillons(all.filter((b) => b.statut !== "annulee" && b.syncStatus !== "synced")))
      .catch(() => {});
  }, [location, syncStatus]);

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
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--t-success)" }}>
                  {bilan.collectes.nb}
                </div>
                <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginTop: 2 }}>
                  Collecte{bilan.collectes.nb !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "var(--t-info)" }}>
                  {fmtPoids(bilan.collectes.tonnage)}
                </div>
                <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginTop: 2 }}>
                  Tonnage
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: ".95rem", fontWeight: 800, color: "var(--t-warning)", lineHeight: 1.3 }}>
                  {bilan.collectes.valeur.toLocaleString("fr-FR")}
                </div>
                <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginTop: 2 }}>
                  FCFA brut
                </div>
              </div>
            </div>
            {bilan.collectes.nb === 0 && (
              <div style={{ textAlign: "center", color: "var(--t-muted)", fontSize: ".8rem", marginTop: 8 }}>
                Aucune collecte enregistrée pour l'instant
              </div>
            )}
          </div>
        )}

        {/* ── Brouillons hors-ligne (pesées non encore synchronisées) ─────── */}
        {brouillons.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {brouillons.map((b) => (
              <Link key={b.localId} href={`/pesee-session/b-${b.localId}`}>
                <div className="t-card" style={{
                  marginBottom: 8,
                  background: b.syncStatus === "error" ? "var(--t-danger-bg)" : "var(--t-warning-bg)",
                  borderLeft: `4px solid ${b.syncStatus === "error" ? "var(--t-danger)" : "var(--t-warning)"}`,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ fontSize: "1.6rem" }}>{b.syncStatus === "error" ? "⚠️" : "📴"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: ".92rem", color: b.syncStatus === "error" ? "var(--t-danger)" : "var(--t-warning)" }}>
                      {b.statut === "terminee" ? "Pesée clôturée hors ligne" : "Pesée en cours hors ligne"}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--t-text)", marginTop: 2 }}>
                      {b.membreNom} {b.membrePrenoms}
                    </div>
                    <div style={{ fontSize: ".72rem", color: "var(--t-muted)", marginTop: 2 }}>
                      {b.lignes.length} pesée{b.lignes.length !== 1 ? "s" : ""} · {b.poidsTotalKg.toFixed(1)} kg
                      {b.syncStatus === "error" && b.errorMsg && (
                        <span style={{ color: "var(--t-danger)", marginLeft: 6 }}>— {b.errorMsg}</span>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: "1.1rem", color: b.syncStatus === "error" ? "var(--t-danger)" : "var(--t-warning)" }}>›</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Sessions en cours — raccourcis de reprise ─────────────────── */}
        {sessionsEnCours.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {sessionsEnCours.map((s) => (
              <Link key={s.id} href={`/pesee-session/${s.id}`}>
                <div className="t-card" style={{
                  marginBottom: 8,
                  background: "var(--t-info-bg)",
                  borderLeft: "4px solid var(--t-info)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ fontSize: "1.6rem" }}>▶</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: ".92rem", color: "var(--t-info)" }}>
                      Session en cours
                    </div>
                    <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--t-text)", marginTop: 2 }}>
                      {s.membreNom} {s.membrePrenoms}
                    </div>
                    <div style={{ fontSize: ".72rem", color: "var(--t-muted)", marginTop: 2, fontFamily: "monospace" }}>
                      {s.numeroSession} · {s.nbLignes ?? 0} pesée{(s.nbLignes ?? 0) !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--t-success)" }}>
                      Reprendre
                    </div>
                    <span style={{ fontSize: "1.1rem", color: "var(--t-info)" }}>›</span>
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
                  background: "var(--t-success-bg)",
                  borderLeft: "4px solid var(--t-success)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}>
                  <span style={{ fontSize: "1.6rem" }}>📦</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: ".92rem", color: "var(--t-success)" }}>
                      Pesée clôturée · à convertir
                    </div>
                    <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--t-text)", marginTop: 2 }}>
                      {s.membreNom} {s.membrePrenoms}
                    </div>
                    <div style={{ fontSize: ".72rem", color: "var(--t-muted)", marginTop: 2, fontFamily: "monospace" }}>
                      {s.numeroSession} · {fmtPoids(parseFloat(s.poidsTotalKg))}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: ".85rem", fontWeight: 700, color: "var(--t-success)" }}>
                      Convertir
                    </div>
                    <span style={{ fontSize: "1.1rem", color: "var(--t-success)" }}>›</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* ── Réceptions de transferts (peseur central uniquement) ─────── */}
        {user?.delegueId == null && (
          <Link href="/receptions">
            <div className="t-card" style={{
              marginBottom: 12,
              background: "var(--t-info-bg)",
              borderLeft: "4px solid var(--t-info)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <span style={{ fontSize: "1.8rem" }}>🚛</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: ".95rem", color: "var(--t-info)" }}>
                  Réceptions de transferts
                </div>
                <div style={{ fontSize: ".75rem", color: "var(--t-muted)", marginTop: 2 }}>
                  Peser les arrivages des délégués
                </div>
              </div>
              <span style={{ fontSize: "1.2rem", color: "var(--t-info)" }}>›</span>
            </div>
          </Link>
        )}

        {/* ── Actions pesée ─────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Link href="/collecte">
            <div className="t-card" style={{
              background: "var(--t-primary)",
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
              background: "var(--t-info)",
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
          <div className="t-card" style={{ marginBottom: 12, borderLeft: "3px solid var(--t-warning)", background: "var(--t-warning-bg)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "1.4rem" }}>📴</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--t-warning)" }}>
                  {pendingCount} opération{pendingCount > 1 ? "s" : ""} en attente
                </div>
                <div style={{ fontSize: ".78rem", color: "var(--t-muted)", marginTop: 2 }}>
                  {isOnline
                    ? "Synchronisation en cours…"
                    : "Hors ligne — sera synchronisé à la reconnexion"}
                </div>
              </div>
              <Link href="/historique" style={{ marginLeft: "auto", fontSize: ".78rem", color: "var(--t-info)", fontWeight: 600 }}>
                Voir →
              </Link>
            </div>
          </div>
        )}

        {/* ── Hors ligne sans opérations en attente ────────────────────── */}
        {!isOnline && pendingCount === 0 && (
          <div className="t-card" style={{ background: "var(--t-warning-bg)", borderLeft: "3px solid var(--t-warning)" }}>
            <div style={{ fontSize: ".85rem", color: "var(--t-warning)" }}>
              📡 Hors ligne — les collectes saisies seront synchronisées à la reconnexion.
            </div>
          </div>
        )}

        {/* ── Lien vers l'historique ────────────────────────────────────── */}
        <Link href="/historique">
          <div className="t-card" style={{
            marginBottom: 12,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}>
            <span style={{ fontSize: "1.6rem" }}>📋</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--t-text)" }}>
                Mes collectes
              </div>
              <div style={{ fontSize: ".78rem", color: "var(--t-muted)", marginTop: 2 }}>
                Consulter l'historique de vos livraisons
              </div>
            </div>
            <span style={{ fontSize: "1.2rem", color: "var(--t-muted)" }}>›</span>
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
                <div style={{ marginTop: 8, fontSize: ".85rem", color: "var(--t-warning)" }}>
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

      <BottomNavPeseur delegueId={user?.delegueId} />
    </div>
  );
}

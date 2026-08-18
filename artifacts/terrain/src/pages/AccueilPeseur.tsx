import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Scale, Package, Layers, History, Truck,
  LogOut, RefreshCw, AlertTriangle, Play,
  PackageCheck, WifiOff, TrendingUp, Banknote,
  ChevronRight,
} from "lucide-react";
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

function initiales(nom?: string, prenoms?: string): string {
  const n = (nom?.[0] ?? "").toUpperCase();
  const p = (prenoms?.[0] ?? "").toUpperCase();
  return n + p || "P";
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

  useEffect(() => {
    if (isOnline) {
      getBilan().then(setBilan).catch(() => {});
    }
  }, [location, isOnline]);

  useEffect(() => {
    if (syncStatus === "done" && isOnline) {
      getBilan().then(setBilan).catch(() => {});
    }
  }, [syncStatus, isOnline]);

  useEffect(() => {
    if (!isOnline) { setSessionsEnCours([]); setSessionsAConvertir([]); return; }
    getSessionsEnCours().then(setSessionsEnCours).catch(() => setSessionsEnCours([]));
    getSessionsAConvertir().then(setSessionsAConvertir).catch(() => setSessionsAConvertir([]));
  }, [location, isOnline]);

  useEffect(() => {
    getBrouillons()
      .then((all) => setBrouillons(all.filter((b) => b.statut !== "annulee" && b.syncStatus !== "synced")))
      .catch(() => {});
  }, [location, syncStatus]);

  return (
    <div className="t-app">
      {/* ── Header gradient peseur ──────────────────────────────── */}
      <header className="t-header t-header--peseur">
        <div className="t-avatar">{initiales(user?.nom, user?.prenoms)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="t-header__title" style={{ fontSize: "1rem" }}>
            {user?.nom} {user?.prenoms}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
            <span className={`t-dot ${isOnline ? "t-dot--online" : "t-dot--offline"}`} />
            <span className="t-header__sub">
              {user?.section ? `Section ${user.section}` : "Peseur"}
              {!isOnline && " · Hors ligne"}
            </span>
          </div>
        </div>

        {pendingCount > 0 && (
          <span className="t-header__badge">{pendingCount}</span>
        )}

        <button
          onClick={() => setConfirmDeconnexion(true)}
          style={{
            background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)",
            borderRadius: 8, color: "#fff", padding: "7px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          title="Déconnexion"
        >
          <LogOut size={16} />
        </button>
      </header>

      <main className="t-main" style={{ padding: "16px 16px 0" }}>

        {/* ── Bilan du jour ─────────────────────────────────────── */}
        {bilan && (
          <section style={{ marginBottom: 14 }}>
            <div style={{
              fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: ".06em", color: "var(--t-muted)", marginBottom: 8,
            }}>
              Aujourd'hui
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {/* Collectes */}
              <div className="t-kpi">
                <div className="t-kpi__icon" style={{ background: "rgba(26,71,49,.1)" }}>
                  <Scale size={18} color="var(--t-primary)" />
                </div>
                <div className="t-kpi__value" style={{ color: "var(--t-primary)" }}>
                  {bilan.collectes.nb}
                </div>
                <div className="t-kpi__label">Pesée{bilan.collectes.nb !== 1 ? "s" : ""}</div>
              </div>

              {/* Tonnage */}
              <div className="t-kpi">
                <div className="t-kpi__icon" style={{ background: "rgba(8,145,178,.1)" }}>
                  <TrendingUp size={18} color="var(--t-peseur)" />
                </div>
                <div className="t-kpi__value" style={{ color: "var(--t-peseur)", fontSize: "1.2rem" }}>
                  {fmtPoids(bilan.collectes.tonnage)}
                </div>
                <div className="t-kpi__label">Tonnage</div>
              </div>

              {/* Nombre de sacs */}
              <div className="t-kpi">
                <div className="t-kpi__icon" style={{ background: "rgba(124,58,237,.1)" }}>
                  <Layers size={18} color="#7c3aed" />
                </div>
                <div className="t-kpi__value" style={{ color: "#7c3aed" }}>
                  {bilan.collectes.nombreSacs > 0 ? bilan.collectes.nombreSacs : "—"}
                </div>
                <div className="t-kpi__label">Sac{bilan.collectes.nombreSacs !== 1 ? "s" : ""}</div>
              </div>

              {/* FCFA */}
              <div className="t-kpi">
                <div className="t-kpi__icon" style={{ background: "rgba(22,163,74,.1)" }}>
                  <Banknote size={18} color="var(--t-success)" />
                </div>
                <div className="t-kpi__value" style={{ fontSize: ".82rem", color: "var(--t-success)", wordBreak: "break-all" }}>
                  {bilan.collectes.valeur > 0
                    ? bilan.collectes.valeur.toLocaleString("fr-FR")
                    : "—"}
                </div>
                <div className="t-kpi__label">FCFA brut</div>
              </div>
            </div>

            {bilan.collectes.nb === 0 && (
              <div style={{
                marginTop: 8, textAlign: "center", fontSize: ".78rem",
                color: "var(--t-muted)", padding: "6px 0",
              }}>
                Aucune collecte enregistrée pour l'instant
              </div>
            )}
          </section>
        )}

        {/* ── Brouillons hors-ligne ─────────────────────────────── */}
        {brouillons.length > 0 && (
          <section style={{ marginBottom: 12 }}>
            {brouillons.map((b) => {
              const isErr = b.syncStatus === "error";
              const accentColor = isErr ? "var(--t-danger)" : "var(--t-warning)";
              const bgColor = isErr ? "var(--t-danger-bg)" : "var(--t-warning-bg)";
              return (
                <Link key={b.localId} href={`/pesee-session/b-${b.localId}`}>
                  <div className="t-session-card" style={{ marginBottom: 8, background: bgColor }}>
                    <div className="t-session-card__stripe" style={{ background: accentColor }} />
                    <div className="t-session-card__body">
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: isErr ? "rgba(220,38,38,.15)" : "rgba(217,119,6,.15)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {isErr
                          ? <AlertTriangle size={18} color="var(--t-danger)" />
                          : <WifiOff size={18} color="var(--t-warning)" />}
                      </div>
                      <div className="t-session-card__text">
                        <div className="t-session-card__title" style={{ color: accentColor }}>
                          {b.statut === "terminee" ? "Pesée clôturée hors ligne" : "Pesée en cours hors ligne"}
                        </div>
                        <div className="t-session-card__name">
                          {b.membreNom} {b.membrePrenoms}
                        </div>
                        <div className="t-session-card__meta">
                          {b.lignes.length} pesée{b.lignes.length !== 1 ? "s" : ""} · {b.poidsTotalKg.toFixed(1)} kg
                          {isErr && b.errorMsg && (
                            <span style={{ color: "var(--t-danger)", marginLeft: 4 }}>— {b.errorMsg}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={18} color={accentColor} style={{ flexShrink: 0 }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}

        {/* ── Sessions en cours ─────────────────────────────────── */}
        {sessionsEnCours.length > 0 && (
          <section style={{ marginBottom: 12 }}>
            {sessionsEnCours.map((s) => (
              <Link key={s.id} href={`/pesee-session/${s.id}`}>
                <div className="t-session-card" style={{ marginBottom: 8 }}>
                  <div className="t-session-card__stripe" style={{ background: "var(--t-peseur)" }} />
                  <div className="t-session-card__body">
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: "var(--t-peseur-bg)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <Play size={18} color="var(--t-peseur)" fill="var(--t-peseur)" />
                    </div>
                    <div className="t-session-card__text">
                      <div className="t-session-card__title" style={{ color: "var(--t-peseur)" }}>
                        Session en cours
                      </div>
                      <div className="t-session-card__name">
                        {s.membreNom} {s.membrePrenoms}
                      </div>
                      <div className="t-session-card__meta">
                        {s.numeroSession}
                        {(s.nbLignes ?? 0) > 0 && ` · ${s.nbLignes} passage${(s.nbLignes ?? 0) > 1 ? "s" : ""}`}
                      </div>
                    </div>
                    <span style={{
                      fontSize: ".72rem", fontWeight: 700, padding: "4px 8px", borderRadius: 20,
                      background: "var(--t-peseur-light)", color: "var(--t-peseur-dark)",
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      Reprendre
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        )}

        {/* ── Sessions terminées à convertir ───────────────────── */}
        {sessionsAConvertir.length > 0 && (
          <section style={{ marginBottom: 12 }}>
            {sessionsAConvertir.map((s) => (
              <Link key={s.id} href={`/pesee-session/${s.id}`}>
                <div className="t-session-card" style={{ marginBottom: 8 }}>
                  <div className="t-session-card__stripe" style={{ background: "var(--t-success)" }} />
                  <div className="t-session-card__body">
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: "var(--t-success-bg)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <PackageCheck size={18} color="var(--t-success)" />
                    </div>
                    <div className="t-session-card__text">
                      <div className="t-session-card__title" style={{ color: "var(--t-success)" }}>
                        Pesée clôturée · à convertir
                      </div>
                      <div className="t-session-card__name">
                        {s.membreNom} {s.membrePrenoms}
                      </div>
                      <div className="t-session-card__meta">
                        {s.numeroSession} · {fmtPoids(parseFloat(s.poidsTotalKg))}
                      </div>
                    </div>
                    <span style={{
                      fontSize: ".72rem", fontWeight: 700, padding: "4px 8px", borderRadius: 20,
                      background: "var(--t-success-bg)", color: "var(--t-success)",
                      border: "1px solid rgba(22,163,74,.3)",
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      Convertir
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        )}

        {/* ── Réceptions de transferts (peseur central) ─────────── */}
        {user?.delegueId == null && (
          <Link href="/receptions">
            <div className="t-session-card" style={{ marginBottom: 14 }}>
              <div className="t-session-card__stripe" style={{ background: "var(--t-peseur)" }} />
              <div className="t-session-card__body">
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: "var(--t-peseur-bg)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Truck size={18} color="var(--t-peseur)" />
                </div>
                <div className="t-session-card__text">
                  <div className="t-session-card__title" style={{ color: "var(--t-peseur)" }}>
                    Réceptions de transferts
                  </div>
                  <div className="t-session-card__meta">Peser les arrivages des délégués</div>
                </div>
                <ChevronRight size={18} color="var(--t-peseur)" style={{ flexShrink: 0 }} />
              </div>
            </div>
          </Link>
        )}

        {/* ── Actions pesée ─────────────────────────────────────── */}
        <section style={{ marginBottom: 14 }}>
          <div style={{
            fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: ".06em", color: "var(--t-muted)", marginBottom: 8,
          }}>
            Nouvelle pesée
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Link href="/collecte">
              <div
                className="t-peseur-tile"
                style={{ background: "linear-gradient(145deg, #1a4731 0%, #16a34a 100%)" }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: "rgba(255,255,255,.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Scale size={26} color="#fff" strokeWidth={1.8} />
                </div>
                <div>
                  <div className="t-peseur-tile__label">Pesée simple</div>
                  <div className="t-peseur-tile__sub">1 membre · 1 pesée</div>
                </div>
              </div>
            </Link>

            <Link href="/pesee-session">
              <div
                className="t-peseur-tile"
                style={{ background: "linear-gradient(145deg, #0e7490 0%, #0891b2 100%)" }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: 14,
                  background: "rgba(255,255,255,.18)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Layers size={26} color="#fff" strokeWidth={1.8} />
                </div>
                <div>
                  <div className="t-peseur-tile__label">Pesée groupée</div>
                  <div className="t-peseur-tile__sub">Passages cumulés</div>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* ── Opérations en attente de sync ────────────────────── */}
        {pendingCount > 0 && (
          <div style={{
            marginBottom: 12, padding: "12px 14px", borderRadius: 12,
            background: "var(--t-warning-bg)", border: "1px solid rgba(217,119,6,.2)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: "rgba(217,119,6,.15)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <RefreshCw size={18} color="var(--t-warning)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--t-warning)" }}>
                {pendingCount} opération{pendingCount > 1 ? "s" : ""} en attente
              </div>
              <div style={{ fontSize: ".75rem", color: "var(--t-muted)", marginTop: 1 }}>
                {isOnline ? "Synchronisation en cours…" : "Hors ligne — sera synchronisé à la reconnexion"}
              </div>
            </div>
            <Link href="/historique" style={{ fontSize: ".78rem", color: "var(--t-peseur)", fontWeight: 700 }}>
              Voir →
            </Link>
          </div>
        )}

        {/* ── Hors ligne sans ops en attente ───────────────────── */}
        {!isOnline && pendingCount === 0 && (
          <div style={{
            marginBottom: 12, padding: "10px 14px", borderRadius: 12,
            background: "var(--t-warning-bg)", border: "1px solid rgba(217,119,6,.2)",
            display: "flex", alignItems: "center", gap: 8,
            fontSize: ".82rem", color: "var(--t-warning)",
          }}>
            <WifiOff size={16} />
            <span>Hors ligne — les collectes saisies seront synchronisées à la reconnexion.</span>
          </div>
        )}

        {/* ── Historique ──────────────────────────────────────── */}
        <Link href="/historique">
          <div style={{
            marginBottom: 16, padding: "14px 16px", borderRadius: 14,
            background: "var(--t-card)",
            boxShadow: "0 2px 8px rgba(0,0,0,.06), 0 0 0 1px rgba(0,0,0,.04)",
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: "rgba(26,71,49,.08)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <History size={18} color="var(--t-primary)" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: ".9rem", color: "var(--t-text)" }}>
                Mes collectes
              </div>
              <div style={{ fontSize: ".75rem", color: "var(--t-muted)", marginTop: 1 }}>
                Consulter l'historique de vos livraisons
              </div>
            </div>
            <ChevronRight size={18} color="var(--t-muted)" />
          </div>
        </Link>
      </main>

      {/* ── Modal déconnexion ─────────────────────────────────────── */}
      {confirmDeconnexion && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
            zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center",
            padding: "0 0 env(safe-area-inset-bottom)",
          }}
          onClick={() => setConfirmDeconnexion(false)}
        >
          <div
            style={{
              background: "#fff", borderRadius: "20px 20px 0 0",
              width: "100%", maxWidth: 480,
              boxShadow: "0 -8px 40px rgba(0,0,0,.2)",
              padding: "8px 0 0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "#e5e7eb", margin: "0 auto 16px" }} />

            <div style={{ padding: "0 24px 8px" }}>
              <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#111", marginBottom: 4 }}>
                Déconnexion
              </div>
              <div style={{ fontSize: ".9rem", color: "#555" }}>
                Voulez-vous vraiment vous déconnecter ?
              </div>
              {pendingCount > 0 && (
                <div style={{
                  marginTop: 10, fontSize: ".82rem", color: "var(--t-warning)",
                  background: "var(--t-warning-bg)", borderRadius: 8,
                  padding: "8px 12px", display: "flex", gap: 6, alignItems: "center",
                }}>
                  <AlertTriangle size={14} />
                  {pendingCount} opération(s) en attente de synchronisation.
                </div>
              )}
            </div>

            <div style={{ padding: "16px 24px 24px", display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmDeconnexion(false)}
                style={{
                  flex: 1, padding: "12px", border: "1.5px solid #e0e0e0",
                  borderRadius: 12, fontSize: ".9rem", fontWeight: 600,
                  cursor: "pointer", background: "#fff", color: "#333",
                }}
              >
                Annuler
              </button>
              <button
                onClick={logout}
                style={{
                  flex: 1, padding: "12px", border: "none", borderRadius: 12,
                  fontSize: ".9rem", fontWeight: 700, cursor: "pointer",
                  background: "#dc2626", color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <LogOut size={16} />
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

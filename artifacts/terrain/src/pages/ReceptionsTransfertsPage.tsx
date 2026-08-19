/**
 * ReceptionsTransfertsPage
 *
 * Page réservée au peseur rattaché à la base centrale (delegueId === null).
 * Affiche :
 *   - Les transferts délégués arrivés en attente de pesée physique
 *   - Les bons de réception membres délégués de localités créés par le magasinier
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ChevronLeft, Truck, Scale, Package, RefreshCw,
  AlertTriangle, CheckCircle, Play, RotateCcw, Users,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import {
  getTransfertsEnAttentePesee,
  signalerArriveePhysique,
  createSessionPesee,
  getBonsReceptionEnAttente,
  SessionTransfertExistanteError,
} from "../lib/api";
import type { TransfertEnAttente, BonReceptionMembre } from "../lib/types";
import BottomNavPeseur from "../components/BottomNavPeseur";

function fmtPoids(kg: string | number): string {
  const n = typeof kg === "string" ? parseFloat(kg) : kg;
  if (isNaN(n)) return "— kg";
  if (n >= 1000) return (n / 1000).toFixed(2) + " T";
  return n.toLocaleString("fr-FR") + " kg";
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const STATUT_TRANSFERT: Record<string, { label: string; color: string; bg: string }> = {
  arrive:   { label: "Arrivé — à peser", color: "var(--t-warning)",  bg: "var(--t-warning-bg)"  },
  en_pesee: { label: "Pesée en cours",   color: "var(--t-peseur)",   bg: "var(--t-peseur-bg)"   },
};

const STATUT_BON: Record<string, { label: string; color: string; bg: string }> = {
  en_attente_pesee: { label: "En attente",     color: "var(--t-warning)", bg: "var(--t-warning-bg)" },
  en_pesee:         { label: "Pesée en cours", color: "var(--t-peseur)",  bg: "var(--t-peseur-bg)"  },
};

// ─── Onglets ──────────────────────────────────────────────────────────────────

type Onglet = "transferts" | "membres";
const CERTIFICATIONS_CACAO = ["RA", "FAIRTRADE", "ASR_1000", "ORDINAIRE"] as const;

type DemarrageCible =
  | { type: "transfert"; transfert: TransfertEnAttente }
  | { type: "bon"; bon: BonReceptionMembre };

export default function ReceptionsTransfertsPage() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const query = new URLSearchParams(window.location.search);
  const bonIdCible = Number(query.get("bonId")) || null;

  const [onglet, setOnglet] = useState<Onglet>("transferts");

  // Transferts
  const [transferts, setTransferts]     = useState<TransfertEnAttente[]>([]);
  const [loadingT, setLoadingT]         = useState(true);
  const [errorT, setErrorT]             = useState<string | null>(null);
  const [busyT, setBusyT]               = useState<number | null>(null);

  // Bons membres délégués
  const [bons, setBons]                 = useState<BonReceptionMembre[]>([]);
  const [loadingB, setLoadingB]         = useState(true);
  const [errorB, setErrorB]             = useState<string | null>(null);
  const [busyB, setBusyB]               = useState<number | null>(null);
  const [demarrageCible, setDemarrageCible] = useState<DemarrageCible | null>(null);
  const [certificationCacao, setCertificationCacao] = useState("");

  // ── Loaders ────────────────────────────────────────────────────────────
  async function reloadTransferts() {
    setLoadingT(true); setErrorT(null);
    try { setTransferts(await getTransfertsEnAttentePesee()); }
    catch (e) { setErrorT((e as Error).message); }
    finally { setLoadingT(false); }
  }

  async function reloadBons() {
    setLoadingB(true); setErrorB(null);
    try { setBons(await getBonsReceptionEnAttente()); }
    catch (e) { setErrorB((e as Error).message); }
    finally { setLoadingB(false); }
  }

  useEffect(() => { void reloadTransferts(); void reloadBons(); }, []);

  // L'accueil peut ouvrir directement le bon de réception affiché dans son badge.
  useEffect(() => {
    const ongletDemande = new URLSearchParams(window.location.search).get("onglet");
    if (ongletDemande === "membres" || ongletDemande === "transferts") {
      setOnglet(ongletDemande);
    }
  }, [location]);

  useEffect(() => {
    if (!bonIdCible || loadingB || !bons.some((bon) => bon.id === bonIdCible)) return;
    const animationFrame = requestAnimationFrame(() => {
      document.getElementById(`bon-reception-${bonIdCible}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [bonIdCible, bons, loadingB]);

  // ── Actions transferts ──────────────────────────────────────────────────
  async function handleSignalerArrivee(t: TransfertEnAttente) {
    setBusyT(t.id);
    try { await signalerArriveePhysique(t.id); await reloadTransferts(); }
    catch (e) { alert("Erreur : " + (e as Error).message); }
    finally { setBusyT(null); }
  }

  async function handleDemarrerPeseeTransfert(t: TransfertEnAttente, certification: string) {
    if (t.sessionPeseeId) { navigate(`/pesee-session/${t.sessionPeseeId}`); return; }
    setBusyT(t.id);
    try {
      const session = await createSessionPesee({
        produit: "cacao",
        operation: "reception_transfert",
        transfertId: t.id,
        certificationCacao: certification,
      });
      navigate(`/pesee-session/${session.id}`);
    } catch (e) {
      if (e instanceof SessionTransfertExistanteError) { navigate(`/pesee-session/${e.sessionId}`); return; }
      alert("Erreur : " + (e as Error).message);
    } finally { setBusyT(null); }
  }

  // ── Actions bons membres délégués ───────────────────────────────────────
  async function handleDemarrerPeseeBon(bon: BonReceptionMembre, certification: string) {
    if (bon.sessionPeseeId) { navigate(`/pesee-session/${bon.sessionPeseeId}`); return; }
    setBusyB(bon.id);
    try {
      const session = await createSessionPesee({
        produit: "cacao",
        operation: "reception_membre_delegue",
        bonReceptionId: bon.id,
        certificationCacao: certification,
      });
      navigate(`/pesee-session/${session.id}`);
    } catch (e) {
      const err = e as Error & { code?: string; sessionId?: number };
      if (err.code === "SESSION_BON_EXISTANTE" && err.sessionId) {
        navigate(`/pesee-session/${err.sessionId}`);
        return;
      }
      alert("Erreur : " + err.message);
    } finally { setBusyB(null); }
  }

  function demanderCertification(cible: DemarrageCible) {
    setCertificationCacao("");
    setDemarrageCible(cible);
  }

  async function confirmerDemarrage() {
    if (!demarrageCible || !certificationCacao) return;
    const cible = demarrageCible;
    setDemarrageCible(null);
    if (cible.type === "transfert") {
      await handleDemarrerPeseeTransfert(cible.transfert, certificationCacao);
    } else {
      await handleDemarrerPeseeBon(cible.bon, certificationCacao);
    }
  }

  // ── Compteurs pour les onglets ──────────────────────────────────────────
  const nbTransferts = transferts.length;
  const nbBons       = bons.length;

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="t-app">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="t-header t-header--peseur">
        <button
          className="t-header__back"
          onClick={() => navigate("/")}
          style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ChevronLeft size={22} />
        </button>
        <div style={{ flex: 1 }}>
          <div className="t-header__title">Réceptions</div>
          <div className="t-header__sub">Cacao en attente de pesée</div>
        </div>
        <button
          onClick={() => { void reloadTransferts(); void reloadBons(); }}
          style={{
            background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.25)",
            borderRadius: 8, color: "#fff", padding: "7px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <RefreshCw size={16} />
        </button>
      </header>

      <main className="t-main" style={{ padding: "16px 16px 0" }}>
        {/* Bannière rôle peseur */}
        {user && (
          <div style={{
            background: "var(--t-card)", borderRadius: 12, padding: "10px 14px", marginBottom: 12,
            border: "1px solid var(--t-border)", display: "flex", alignItems: "center", gap: 10,
            boxShadow: "0 1px 4px rgba(0,0,0,.06)",
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, background: "var(--t-peseur-bg)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Scale size={18} color="var(--t-peseur)" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--t-text)" }}>
                {user.nom} {user.prenoms}
              </div>
              <div style={{ fontSize: ".72rem", color: "var(--t-muted)" }}>Peseur · Base centrale</div>
            </div>
          </div>
        )}

        {/* ── Onglets ──────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", gap: 6, marginBottom: 14,
          background: "var(--t-card)", borderRadius: 12, padding: 6,
          border: "1px solid var(--t-border)",
        }}>
          {([ { key: "transferts", label: "Délégués terrain", icon: <Truck size={14} />, count: nbTransferts },
              { key: "membres",    label: "Membres délégués", icon: <Users size={14} />, count: nbBons },
          ] as { key: Onglet; label: string; icon: React.ReactNode; count: number }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => setOnglet(tab.key)}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "10px 8px", borderRadius: 8, cursor: "pointer", fontSize: ".78rem", fontWeight: 700,
                border: "none",
                background: onglet === tab.key ? "var(--t-peseur)" : "transparent",
                color: onglet === tab.key ? "#fff" : "var(--t-muted)",
                position: "relative",
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.count > 0 && (
                <span style={{
                  background: onglet === tab.key ? "rgba(255,255,255,.3)" : "var(--t-peseur-bg)",
                  color: onglet === tab.key ? "#fff" : "var(--t-peseur)",
                  borderRadius: 20, padding: "1px 7px", fontSize: ".65rem", fontWeight: 800,
                }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/*  ONGLET 1 — Transferts délégués terrain                         */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {onglet === "transferts" && (
          <>
            <div style={{
              background: "var(--t-peseur-bg)", border: "1px solid rgba(8,145,178,.2)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 16,
              fontSize: ".78rem", color: "var(--t-peseur-dark)", lineHeight: 1.5,
            }}>
              Les transferts expédiés par les délégués sont pesés sac par sac à la réception.
            </div>

            {loadingT && <div style={{ textAlign: "center", padding: "40px 0" }}><div className="t-spinner" style={{ margin: "0 auto" }} /></div>}

            {errorT && (
              <div style={{ background: "var(--t-danger-bg)", border: "1px solid var(--t-danger)", borderRadius: 10, padding: "10px 14px", color: "var(--t-danger)", marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <AlertTriangle size={15} />
                <span style={{ flex: 1 }}>{errorT}</span>
                <button onClick={reloadTransferts} style={{ background: "none", border: "none", color: "var(--t-peseur)", cursor: "pointer", fontSize: ".85rem", fontWeight: 600 }}>Réessayer</button>
              </div>
            )}

            {!loadingT && !errorT && transferts.length === 0 && (
              <div style={{ background: "var(--t-card)", borderRadius: 16, padding: "32px 24px", textAlign: "center", border: "1px solid var(--t-border)", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, margin: "0 auto 12px", background: "var(--t-success-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle size={28} color="var(--t-success)" />
                </div>
                <div style={{ fontWeight: 700, color: "var(--t-text)", marginBottom: 4 }}>Aucun transfert en attente</div>
                <div style={{ fontSize: ".78rem", color: "var(--t-muted)" }}>Les transferts arrivés apparaîtront ici dès qu'un délégué les a signalés.</div>
              </div>
            )}

            {transferts.map((t) => {
              const sc = STATUT_TRANSFERT[t.statut] ?? { label: t.statut, color: "var(--t-muted)", bg: "var(--t-bg)" };
              const isBusy = busyT === t.id;
              const poidsKg = parseFloat(String(t.poidsDepart_kg ?? 0));
              return (
                <div key={t.id} style={{ background: "var(--t-card)", borderRadius: 16, marginBottom: 12, boxShadow: "0 2px 10px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)", overflow: "hidden" }}>
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--t-border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "var(--t-peseur-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Truck size={18} color="var(--t-peseur)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: ".95rem", color: "var(--t-text)" }}>{t.numeroTransfert}</div>
                      <div style={{ fontSize: ".72rem", color: "var(--t-muted)", marginTop: 1 }}>{t.entrepotNom ?? "Entrepôt délégué"}{t.zoneNom ? ` · ${t.zoneNom}` : ""}</div>
                    </div>
                    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: ".7rem", fontWeight: 700, color: sc.color, background: sc.bg, border: `1px solid ${sc.color}22` }}>
                      {sc.label}
                    </span>
                  </div>
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: t.nombreSacs != null ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 12 }}>
                      <div style={{ background: "var(--t-success-bg)", borderRadius: 10, padding: "10px 14px" }}>
                        <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginBottom: 2 }}>Poids déclaré</div>
                        <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--t-success)" }}>{fmtPoids(poidsKg)}</div>
                      </div>
                      {t.nombreSacs != null && (
                        <div style={{ background: "var(--t-warning-bg)", borderRadius: 10, padding: "10px 14px" }}>
                          <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginBottom: 2 }}>Sacs déclarés</div>
                          <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--t-warning)" }}>{t.nombreSacs}</div>
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: ".73rem", color: "var(--t-muted)", marginBottom: 4 }}>
                      Délégué : <span style={{ color: "var(--t-text)", fontWeight: 600 }}>{t.delegueNom ?? "—"} {t.deleguePrenoms ?? ""}</span>
                    </div>
                    {t.dateArrivee && <div style={{ fontSize: ".73rem", color: "var(--t-muted)", marginBottom: 4 }}>Arrivée : <span style={{ color: "var(--t-text)" }}>{fmtDate(t.dateArrivee)}</span></div>}
                    {t.notes && <div style={{ fontSize: ".73rem", color: "var(--t-muted)", fontStyle: "italic", marginBottom: 8, padding: "6px 10px", background: "var(--t-bg)", borderRadius: 6, borderLeft: "2px solid var(--t-border)" }}>« {t.notes} »</div>}

                    {t.statut === "arrive" && !t.sessionPeseeId && (
                      <button onClick={() => void handleSignalerArrivee(t)} disabled={isBusy} className="t-btn t-btn--ghost" style={{ width: "100%", marginTop: 8, height: 44, borderColor: "var(--t-warning)", color: "var(--t-warning)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        {isBusy ? <RefreshCw size={14} style={{ animation: "t-spin .8s linear infinite" }} /> : <Package size={14} />}
                        Signaler l'arrivée physique
                      </button>
                    )}
                    {t.statut === "arrive" && t.sessionPeseeId == null && (
                      <button onClick={() => demanderCertification({ type: "transfert", transfert: t })} disabled={isBusy} className="t-btn t-btn--primary" style={{ width: "100%", marginTop: 8, height: 52, background: "linear-gradient(135deg, var(--t-peseur-dark) 0%, var(--t-peseur) 100%)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        {isBusy ? <RefreshCw size={16} style={{ animation: "t-spin .8s linear infinite" }} /> : <Play size={16} fill="#fff" />}
                        {isBusy ? "Démarrage…" : "Démarrer la pesée"}
                      </button>
                    )}
                    {t.statut === "en_pesee" && t.sessionPeseeId && (
                      <button onClick={() => navigate(`/pesee-session/${t.sessionPeseeId}`)} className="t-btn t-btn--ghost" style={{ width: "100%", marginTop: 8, height: 52, borderColor: "var(--t-peseur)", color: "var(--t-peseur)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <RotateCcw size={16} />
                        Reprendre la session de pesée
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {!loadingT && transferts.length > 0 && (
              <button onClick={reloadTransferts} style={{ width: "100%", background: "transparent", border: "1px dashed var(--t-border)", borderRadius: 10, color: "var(--t-muted)", padding: "10px", fontSize: ".78rem", cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <RefreshCw size={13} /> Rafraîchir
              </button>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/*  ONGLET 2 — Membres délégués de localités                       */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {onglet === "membres" && (
          <>
            <div style={{
              background: "var(--t-warning-bg)", border: "1px solid rgba(217,119,6,.2)",
              borderRadius: 10, padding: "10px 14px", marginBottom: 16,
              fontSize: ".78rem", color: "#92400e", lineHeight: 1.5,
            }}>
              Le magasinier crée un bon de réception quand un membre délégué arrive avec son cacao.
              Démarrez la pesée depuis chaque bon.
            </div>

            {loadingB && <div style={{ textAlign: "center", padding: "40px 0" }}><div className="t-spinner" style={{ margin: "0 auto" }} /></div>}

            {errorB && (
              <div style={{ background: "var(--t-danger-bg)", border: "1px solid var(--t-danger)", borderRadius: 10, padding: "10px 14px", color: "var(--t-danger)", marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
                <AlertTriangle size={15} />
                <span style={{ flex: 1 }}>{errorB}</span>
                <button onClick={reloadBons} style={{ background: "none", border: "none", color: "var(--t-peseur)", cursor: "pointer", fontSize: ".85rem", fontWeight: 600 }}>Réessayer</button>
              </div>
            )}

            {!loadingB && !errorB && bons.length === 0 && (
              <div style={{ background: "var(--t-card)", borderRadius: 16, padding: "32px 24px", textAlign: "center", border: "1px solid var(--t-border)", boxShadow: "0 2px 8px rgba(0,0,0,.05)" }}>
                <div style={{ width: 60, height: 60, borderRadius: 16, margin: "0 auto 12px", background: "var(--t-success-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <CheckCircle size={28} color="var(--t-success)" />
                </div>
                <div style={{ fontWeight: 700, color: "var(--t-text)", marginBottom: 4 }}>Aucun bon en attente</div>
                <div style={{ fontSize: ".78rem", color: "var(--t-muted)" }}>Le magasinier crée un bon quand un membre délégué arrive avec son cacao.</div>
              </div>
            )}

            {bons.map((bon) => {
              const sc = STATUT_BON[bon.statut] ?? { label: bon.statut, color: "var(--t-muted)", bg: "var(--t-bg)" };
              const isBusy = busyB === bon.id;
              const isBonCible = bon.id === bonIdCible;
              const fraisTotal = (bon.fraisCarburantFcfa ?? 0) + (bon.autresChargesFcfa ?? 0);

              return (
                <div
                  key={bon.id}
                  id={`bon-reception-${bon.id}`}
                  style={{
                    background: "var(--t-card)",
                    borderRadius: 16,
                    marginBottom: 12,
                    boxShadow: isBonCible
                      ? "0 0 0 3px rgba(217,119,6,.35), 0 4px 14px rgba(0,0,0,.12)"
                      : "0 2px 10px rgba(0,0,0,.08), 0 0 0 1px rgba(0,0,0,.04)",
                    overflow: "hidden",
                    scrollMarginTop: 16,
                  }}
                >
                  {/* Header carte */}
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--t-border)", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: "var(--t-warning-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Users size={18} color="var(--t-warning)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: ".95rem", color: "var(--t-text)" }}>
                        {bon.membrePrenoms} {bon.membreNom}
                      </div>
                      <div style={{ fontSize: ".72rem", color: "var(--t-muted)", marginTop: 1 }}>
                        {bon.membreSection ?? "Délégué de localités"} · Bon #{bon.id}
                      </div>
                    </div>
                    <span style={{ padding: "4px 10px", borderRadius: 20, fontSize: ".7rem", fontWeight: 700, color: sc.color, background: sc.bg, border: `1px solid ${sc.color}22` }}>
                      {sc.label}
                    </span>
                  </div>

                  {/* Corps */}
                  <div style={{ padding: "12px 16px" }}>
                    {/* Poids + sacs */}
                    {(bon.poidsDeclaraKg != null || bon.nombreSacsDeclares != null) && (
                      <div style={{ display: "grid", gridTemplateColumns: bon.poidsDeclaraKg != null && bon.nombreSacsDeclares != null ? "1fr 1fr" : "1fr", gap: 10, marginBottom: 12 }}>
                        {bon.poidsDeclaraKg != null && (
                          <div style={{ background: "var(--t-success-bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginBottom: 2 }}>Poids déclaré</div>
                            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--t-success)" }}>{fmtPoids(bon.poidsDeclaraKg)}</div>
                          </div>
                        )}
                        {bon.nombreSacsDeclares != null && (
                          <div style={{ background: "var(--t-warning-bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: ".68rem", color: "var(--t-muted)", marginBottom: 2 }}>Sacs déclarés</div>
                            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--t-warning)" }}>{bon.nombreSacsDeclares}</div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Transport */}
                    <div style={{ fontSize: ".73rem", color: "var(--t-muted)", marginBottom: 4 }}>
                      Transport :{" "}
                      <span style={{ color: "var(--t-text)", fontWeight: 600 }}>
                        {bon.typeTransport === "cooperatif" ? "Camion coop" : "Véhicule externe"}
                        {bon.immatriculation ? ` · ${bon.immatriculation}` : ""}
                      </span>
                    </div>
                    {bon.nomChauffeur && (
                      <div style={{ fontSize: ".73rem", color: "var(--t-muted)", marginBottom: 4 }}>
                        Chauffeur : <span style={{ color: "var(--t-text)", fontWeight: 600 }}>{bon.nomChauffeur}</span>
                      </div>
                    )}
                    {fraisTotal > 0 && (
                      <div style={{ fontSize: ".73rem", color: "var(--t-muted)", marginBottom: 4 }}>
                        Frais avancés :{" "}
                        <span style={{ color: "var(--t-danger)", fontWeight: 700 }}>
                          {fraisTotal.toLocaleString("fr-FR")} F
                        </span>
                        {" "}(déduits du net)
                      </div>
                    )}
                    {bon.notes && (
                      <div style={{ fontSize: ".73rem", color: "var(--t-muted)", fontStyle: "italic", marginBottom: 8, padding: "6px 10px", background: "var(--t-bg)", borderRadius: 6, borderLeft: "2px solid var(--t-border)" }}>
                        « {bon.notes} »
                      </div>
                    )}

                    {/* Action : démarrer la pesée */}
                    {bon.statut === "en_attente_pesee" && (
                      <button
                        onClick={() => demanderCertification({ type: "bon", bon })}
                        disabled={isBusy}
                        className="t-btn t-btn--primary"
                        style={{
                          width: "100%", marginTop: 8, height: 52,
                          background: "linear-gradient(135deg, var(--t-warning) 0%, #b45309 100%)",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        }}
                      >
                        {isBusy
                          ? <RefreshCw size={16} style={{ animation: "t-spin .8s linear infinite" }} />
                          : <Play size={16} fill="#fff" />}
                        {isBusy ? "Démarrage…" : "Démarrer la pesée"}
                      </button>
                    )}

                    {bon.statut === "en_pesee" && bon.sessionPeseeId && (
                      <button
                        onClick={() => navigate(`/pesee-session/${bon.sessionPeseeId}`)}
                        className="t-btn t-btn--ghost"
                        style={{ width: "100%", marginTop: 8, height: 52, borderColor: "var(--t-peseur)", color: "var(--t-peseur)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                      >
                        <RotateCcw size={16} />
                        Reprendre la session de pesée
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {!loadingB && bons.length > 0 && (
              <button onClick={reloadBons} style={{ width: "100%", background: "transparent", border: "1px dashed var(--t-border)", borderRadius: 10, color: "var(--t-muted)", padding: "10px", fontSize: ".78rem", cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                <RefreshCw size={13} /> Rafraîchir
              </button>
            )}
          </>
        )}
      </main>

      {demarrageCible && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="certification-dialog-title"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDemarrageCible(null);
          }}
          style={{
            position: "fixed", inset: 0, zIndex: 100,
            display: "flex", alignItems: "flex-end",
            background: "rgba(15, 23, 42, .52)",
          }}
        >
          <div style={{
            width: "100%", background: "var(--t-card)", borderRadius: "20px 20px 0 0",
            padding: "20px 16px max(24px, env(safe-area-inset-bottom))",
            boxShadow: "0 -12px 32px rgba(0,0,0,.18)",
          }}>
            <div style={{ width: 38, height: 4, borderRadius: 99, background: "var(--t-border)", margin: "0 auto 18px" }} />
            <div id="certification-dialog-title" style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--t-text)" }}>
              Certification du cacao
            </div>
            <p style={{ margin: "5px 0 18px", fontSize: ".82rem", lineHeight: 1.45, color: "var(--t-muted)" }}>
              Sélectionnez le type de cacao avant de démarrer la pesée. Cette information figurera sur le bordereau d’achat.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {CERTIFICATIONS_CACAO.map((certification) => {
                const selected = certificationCacao === certification;
                return (
                  <button
                    key={certification}
                    onClick={() => setCertificationCacao(certification)}
                    style={{
                      minHeight: 52, borderRadius: 12, cursor: "pointer",
                      border: `2px solid ${selected ? "var(--t-peseur)" : "var(--t-border)"}`,
                      background: selected ? "var(--t-peseur-bg)" : "var(--t-card)",
                      color: selected ? "var(--t-peseur-dark)" : "var(--t-text)",
                      fontSize: ".86rem", fontWeight: 800,
                    }}
                  >
                    {certification}
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setDemarrageCible(null)}
                className="t-btn t-btn--ghost"
                style={{ flex: 1, height: 48 }}
              >
                Annuler
              </button>
              <button
                onClick={() => void confirmerDemarrage()}
                disabled={!certificationCacao}
                className="t-btn t-btn--primary"
                style={{
                  flex: 1, height: 48,
                  opacity: certificationCacao ? 1 : .5,
                  cursor: certificationCacao ? "pointer" : "not-allowed",
                }}
              >
                Commencer
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNavPeseur delegueId={user?.delegueId} />
    </div>
  );
}

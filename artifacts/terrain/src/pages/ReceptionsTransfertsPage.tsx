/**
 * ReceptionsTransfertsPage
 *
 * Page réservée au peseur rattaché à la base centrale (delegueId === null).
 * Affiche les transferts de stock arrivés en attente de pesée physique.
 *
 * Statuts affichés : 'arrive' (à démarrer) et 'en_pesee' (session en cours).
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import {
  getTransfertsEnAttentePesee,
  signalerArriveePhysique,
  createSessionPesee,
  SessionTransfertExistanteError,
} from "../lib/api";
import type { TransfertEnAttente } from "../lib/types";
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
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const STATUT_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  arrive:   { label: "Arrivé — à peser", color: "var(--t-warning)", bg: "var(--t-warning-bg)" },
  en_pesee: { label: "Pesée en cours",   color: "var(--t-info)",    bg: "var(--t-info-bg)"    },
};

export default function ReceptionsTransfertsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [transferts, setTransfertsState] = useState<TransfertEnAttente[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState<number | null>(null); // transfert id en cours d'action

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransfertsEnAttentePesee();
      setTransfertsState(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  // Signaler arrivée physique (en_cours → arrive) — peut être fait par peseur ou délégué présent
  async function handleSignalerArrivee(t: TransfertEnAttente) {
    setBusy(t.id);
    try {
      await signalerArriveePhysique(t.id);
      await reload();
    } catch (e) {
      alert("Erreur : " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Démarrer / reprendre la session de pesée pour ce transfert
  async function handleDemarrerPesee(t: TransfertEnAttente) {
    // Si session déjà créée, aller directement dessus
    if (t.sessionPeseeId) {
      navigate(`/pesee-session/${t.sessionPeseeId}`);
      return;
    }

    setBusy(t.id);
    try {
      const session = await createSessionPesee({
        produit: "cacao",
        operation: "reception_transfert",
        transfertId: t.id,
      });
      navigate(`/pesee-session/${session.id}`);
    } catch (e) {
      if (e instanceof SessionTransfertExistanteError) {
        // session créée en parallèle — aller dessus
        navigate(`/pesee-session/${e.sessionId}`);
        return;
      }
      alert("Erreur : " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="t-app">
      <header className="t-header">
        <div style={{ flex: 1 }}>
          <div className="t-header__title">Réceptions de transferts</div>
          <div className="t-header__sub">Pesée physique obligatoire</div>
        </div>
        <button
          onClick={() => navigate("/")}
          style={{ background: "rgba(255,255,255,.15)", border: "none", borderRadius: 8, color: "#fff", padding: "6px 12px", fontSize: ".8rem", fontWeight: 700, cursor: "pointer" }}
        >
          ← Retour
        </button>
      </header>

      <main className="t-main">
        {/* Bannière rôle */}
        {user && (
          <div style={{
            background: "var(--t-card)",
            borderRadius: 12, padding: 12, marginBottom: 12,
            border: "1px solid var(--t-border)", display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: "1.4rem" }}>⚖️</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: ".88rem", color: "var(--t-text)" }}>{user.nom} {user.prenoms}</div>
              <div style={{ fontSize: ".72rem", color: "var(--t-muted)" }}>Peseur — Base centrale · {user.cooperativeId ? `Coop #${user.cooperativeId}` : ""}</div>
            </div>
          </div>
        )}

        {/* Infobannière */}
        <div style={{
          background: "var(--t-info-bg)", border: "1px solid var(--t-info)",
          borderRadius: 10, padding: 12, marginBottom: 16, fontSize: ".78rem", color: "var(--t-info)",
        }}>
          Les transferts expédiés par les délégués sont pesés sac par sac à la réception.
          Le poids pesé est le poids officiel enregistré en stock central.
        </div>

        {loading && (
          <div style={{ textAlign: "center", color: "var(--t-muted)", padding: 40 }}>
            Chargement…
          </div>
        )}

        {error && (
          <div style={{ background: "var(--t-danger-bg)", border: "1px solid var(--t-danger)", borderRadius: 10, padding: 12, color: "var(--t-danger)", marginBottom: 12 }}>
            {error}
            <button onClick={reload} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--t-info)", cursor: "pointer", fontSize: ".85rem" }}>Réessayer</button>
          </div>
        )}

        {!loading && !error && transferts.length === 0 && (
          <div style={{
            background: "var(--t-card)",
            borderRadius: 14, padding: 32, textAlign: "center",
            border: "1px solid var(--t-border)",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 700, color: "var(--t-text)", marginBottom: 4 }}>
              Aucun transfert en attente
            </div>
            <div style={{ fontSize: ".78rem", color: "var(--t-muted)" }}>
              Les transferts arrivés apparaîtront ici dès qu'un délégué les a signalés.
            </div>
          </div>
        )}

        {transferts.map((t) => {
          const statutInfo = STATUT_LABEL[t.statut] ?? { label: t.statut, color: "var(--t-muted)", bg: "var(--t-bg)" };
          const isBusy = busy === t.id;
          const poidsKg = parseFloat(String(t.poidsDepart_kg ?? 0));

          return (
            <div key={t.id} className="t-card" style={{ marginBottom: 12, padding: 0, overflow: "hidden" }}>
              {/* Header carte */}
              <div style={{
                background: "var(--t-bg)",
                padding: "12px 16px",
                borderBottom: "1px solid var(--t-border)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: "1.4rem" }}>🚛</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: ".92rem", color: "var(--t-text)" }}>
                    {t.numeroTransfert}
                  </div>
                  <div style={{ fontSize: ".72rem", color: "var(--t-muted)", marginTop: 2 }}>
                    {t.entrepotNom ?? "Entrepôt délégué"} · {t.zoneNom ?? ""}
                  </div>
                </div>
                <span style={{
                  background: statutInfo.bg, borderRadius: 6, padding: "3px 8px",
                  fontSize: ".7rem", fontWeight: 700, color: statutInfo.color,
                  border: `1px solid ${statutInfo.color}`,
                }}>
                  {statutInfo.label}
                </span>
              </div>

              {/* Corps */}
              <div style={{ padding: "12px 16px" }}>
                {/* Poids + sacs */}
                <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--t-success)" }}>
                      {fmtPoids(poidsKg)}
                    </div>
                    <div style={{ fontSize: ".68rem", color: "var(--t-muted)" }}>Poids déclaré</div>
                  </div>
                  {t.nombreSacs != null && (
                    <div style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--t-warning)" }}>
                        {t.nombreSacs}
                      </div>
                      <div style={{ fontSize: ".68rem", color: "var(--t-muted)" }}>Sacs</div>
                    </div>
                  )}
                </div>

                {/* Méta */}
                <div style={{ fontSize: ".73rem", color: "var(--t-muted)", marginBottom: 4 }}>
                  <span>Délégué : </span>
                  <span style={{ color: "var(--t-text)", fontWeight: 600 }}>
                    {t.delegueNom ?? "—"} {t.deleguePrenoms ?? ""}
                  </span>
                </div>
                {t.dateArrivee && (
                  <div style={{ fontSize: ".73rem", color: "var(--t-muted)", marginBottom: 4 }}>
                    Arrivée signalée : <span style={{ color: "var(--t-text)" }}>{fmtDate(t.dateArrivee)}</span>
                  </div>
                )}
                {t.notes && (
                  <div style={{ fontSize: ".73rem", color: "var(--t-muted)", fontStyle: "italic", marginBottom: 8 }}>
                    « {t.notes} »
                  </div>
                )}

                {/* Action */}
                {t.statut === "arrive" && (
                  <button
                    onClick={() => handleDemarrerPesee(t)}
                    disabled={isBusy}
                    className="t-btn t-btn--primary"
                    style={{ width: "100%", marginTop: 8 }}
                  >
                    {isBusy ? "Démarrage…" : "⚖️ Démarrer la pesée"}
                  </button>
                )}

                {t.statut === "en_pesee" && t.sessionPeseeId && (
                  <button
                    onClick={() => navigate(`/pesee-session/${t.sessionPeseeId}`)}
                    className="t-btn t-btn--secondary"
                    style={{ width: "100%", marginTop: 8 }}
                  >
                    ▶ Reprendre la session de pesée
                  </button>
                )}
              </div>
            </div>
          );
        })}

        <button
          onClick={reload}
          style={{
            width: "100%", background: "transparent", border: "1px dashed var(--t-border)",
            borderRadius: 10, color: "var(--t-muted)", padding: 10, fontSize: ".78rem", cursor: "pointer",
            marginTop: 8,
          }}
        >
          🔄 Rafraîchir la liste
        </button>
      </main>

      <BottomNavPeseur delegueId={user?.delegueId} />
    </div>
  );
}

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { getCaisse, getPaiementsDifferes, regulariserPaiement } from "../lib/api";
import BottomNav from "../components/BottomNav";
import type { CaisseDelegue, PaiementDiffere } from "../lib/types";

type ModePaiement = "especes" | "orange_money" | "mtn_momo";

export default function PaiementsDifferesPage() {
  const [, setLocation] = useLocation();
  const [caisse, setCaisse] = useState<CaisseDelegue | null>(null);
  const [differes, setDifferes] = useState<PaiementDiffere[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PaiementDiffere | null>(null);
  const [mode, setMode] = useState<ModePaiement>("especes");
  const [paying, setPaying] = useState(false);
  const [erreur, setErreur] = useState("");
  const [succes, setSucces] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [c, d] = await Promise.all([getCaisse(), getPaiementsDifferes()]);
      setCaisse(c);
      setDifferes(d);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handlePayer() {
    if (!selected) return;
    setPaying(true);
    setErreur("");
    try {
      const res = await regulariserPaiement(selected.livraisonId, mode);
      setSucces(`Paiement de ${selected.montantRestant.toLocaleString("fr-FR")} FCFA effectué. Solde caisse : ${res.solde.toLocaleString("fr-FR")} FCFA`);
      setSelected(null);
      await load();
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setPaying(false);
    }
  }

  const totalDu = differes.reduce((s, d) => s + d.montantRestant, 0);

  return (
    <div className="t-app">
      <header className="t-header">
        <button className="t-header__back" onClick={() => setLocation("/")}>‹</button>
        <div>
          <div className="t-header__title">Paiements différés</div>
          <div className="t-header__sub">{differes.length} en attente</div>
        </div>
      </header>

      <main className="t-main t-main--no-nav" style={{ paddingBottom: 80 }}>
        {loading && <div className="t-spinner" style={{ margin: "40px auto" }} />}

        {!loading && (
          <>
            {/* Solde caisse */}
            <div style={{ display: "flex", gap: 12, padding: "16px 16px 0" }}>
              <div className="t-card" style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: ".75rem", color: "var(--t-muted)", marginBottom: 4 }}>Solde caisse</div>
                <div style={{ fontWeight: 800, fontSize: "1.1rem", color: (caisse?.solde ?? 0) > 0 ? "var(--t-success)" : "var(--t-danger)" }}>
                  {(caisse?.solde ?? 0).toLocaleString("fr-FR")} FCFA
                </div>
              </div>
              <div className="t-card" style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: ".75rem", color: "var(--t-muted)", marginBottom: 4 }}>Total dû</div>
                <div style={{ fontWeight: 800, fontSize: "1.1rem", color: "var(--t-danger)" }}>
                  {totalDu.toLocaleString("fr-FR")} FCFA
                </div>
              </div>
            </div>

            {succes && (
              <div style={{ margin: "12px 16px 0", background: "var(--t-success-bg)", color: "var(--t-success)", borderRadius: "var(--t-radius)", padding: "12px 14px", fontSize: ".9rem", fontWeight: 600 }}>
                ✅ {succes}
              </div>
            )}

            {differes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 24px", color: "var(--t-muted)" }}>
                <div style={{ fontSize: "2rem", marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Aucun paiement en attente</div>
                <div style={{ fontSize: ".85rem" }}>Tous les planteurs ont été payés.</div>
              </div>
            ) : (
              <>
                <div className="t-section-title" style={{ marginTop: 16 }}>Planteurs à payer</div>
                <div style={{ padding: "0 16px 16px" }}>
                  {differes.map((d) => (
                    <div
                      key={d.livraisonId}
                      className="t-card"
                      style={{ marginBottom: 10, cursor: "pointer", border: selected?.livraisonId === d.livraisonId ? "2px solid var(--t-primary)" : "2px solid transparent" }}
                      onClick={() => { setSelected(d); setErreur(""); setSucces(""); }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: ".95rem" }}>{d.membreNom}</div>
                          <div className="t-text-muted" style={{ fontSize: ".8rem" }}>
                            {new Date(d.dateLivraison).toLocaleDateString("fr-FR")} · {d.poidsKg.toFixed(1)} kg
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 800, color: "var(--t-danger)", fontSize: ".95rem" }}>
                            {d.montantRestant.toLocaleString("fr-FR")} FCFA
                          </div>
                          <span className="t-badge t-badge--warning" style={{ fontSize: ".7rem" }}>DIFFÉRÉ</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </main>

      {/* Modal payer */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 100, display: "flex", alignItems: "flex-end" }}>
          <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", padding: "24px 20px", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 4 }}>Payer {selected.membreNom}</div>
            <div className="t-text-muted" style={{ marginBottom: 16, fontSize: ".85rem" }}>
              Montant : <strong>{selected.montantRestant.toLocaleString("fr-FR")} FCFA</strong> · Solde caisse : <strong>{(caisse?.solde ?? 0).toLocaleString("fr-FR")} FCFA</strong>
            </div>

            {(caisse?.solde ?? 0) < selected.montantRestant && (
              <div style={{ background: "var(--t-danger-bg)", color: "var(--t-danger)", borderRadius: "var(--t-radius)", padding: "10px 12px", fontSize: ".85rem", fontWeight: 600, marginBottom: 14 }}>
                ⚠️ Fonds insuffisants — alimentez la caisse avant de payer
              </div>
            )}

            <div className="t-field" style={{ marginBottom: 16 }}>
              <label className="t-label">Mode de paiement</label>
              <select className="t-select" value={mode} onChange={(e) => setMode(e.target.value as ModePaiement)}>
                <option value="especes">💵 Espèces</option>
                <option value="orange_money">🟠 Orange Money</option>
                <option value="mtn_momo">🟡 MTN Mobile Money</option>
              </select>
            </div>

            {erreur && (
              <div style={{ background: "var(--t-danger-bg)", color: "var(--t-danger)", borderRadius: "var(--t-radius)", padding: "10px 12px", fontSize: ".85rem", fontWeight: 600, marginBottom: 14 }}>
                ❌ {erreur}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="t-btn t-btn--ghost"
                style={{ flex: 1 }}
                onClick={() => { setSelected(null); setErreur(""); }}
              >
                Annuler
              </button>
              <button
                className="t-btn t-btn--success"
                style={{ flex: 2 }}
                disabled={paying || (caisse?.solde ?? 0) < selected.montantRestant}
                onClick={handlePayer}
              >
                {paying ? "Paiement…" : `✅ Payer ${selected.montantRestant.toLocaleString("fr-FR")} FCFA`}
              </button>
            </div>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

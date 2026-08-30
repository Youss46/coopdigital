import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, CheckCircle2, Loader2, Plus, Trash2, AlertTriangle, Ship } from "lucide-react";
import BottomNavPeseur from "../components/BottomNavPeseur";
import ScaleWeightDisplay from "../components/ScaleWeightDisplay";
import { NumericInput } from "../components/ui/numeric-input";
import { useOffline } from "../contexts/OfflineContext";
import { addLignePesee, deleteLignePesee, getSessionDetail, terminerSessionPesee } from "../lib/api";
import {
  addLigneToBrouillon,
  deleteLigneFromBrouillon,
  getBrouillon,
  retryBrouillon,
  terminerBrouillon,
} from "../lib/idb";
import type { BrouillonPesee, SessionDetail } from "../lib/types";

const fmt = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });

export default function PrechargementExportFlow({ params }: { params: { sessionId?: string } }) {
  const [, navigate] = useLocation();
  const { isOnline, triggerSync } = useOffline();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonPesee | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [done, setDone] = useState<SessionDetail | null>(null);
  const [nbSacs, setNbSacs] = useState("");
  const [brut, setBrut] = useState("");
  const [tare, setTare] = useState("0");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const id = Number(params.sessionId);
    const rawId = params.sessionId ?? "";
    if (rawId.startsWith("b-")) {
      setLoading(true);
      getBrouillon(rawId.slice(2)).then((draft) => {
        if (!draft || draft.operation !== "prechargement_export") {
          throw new Error("Brouillon de pré-pesée introuvable");
        }
        setBrouillon(draft);
        setSession(brouillonToSyntheticSession(draft));
        if (draft.statut === "terminee") setDone(brouillonToSyntheticSession(draft));
      }).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
      return;
    }
    if (!id || !isOnline) { setLoading(false); return; }
    getSessionDetail(id).then((s) => {
      if (s.operation !== "prechargement_export") throw new Error("Session de pré-pesée invalide");
      if (s.statut === "terminee") setDone(s); else setSession(s);
    }).catch((e) => setError((e as Error).message)).finally(() => setLoading(false));
  }, [params.sessionId, isOnline]);

  function brouillonToSyntheticSession(draft: BrouillonPesee): SessionDetail {
    return {
      id: -1,
      cooperativeId: 0,
      peseurId: null,
      numeroSession: draft.numeroSession ?? `LOCAL-${draft.localId.slice(0, 8)}`,
      membreId: null,
      membreNom: null,
      membrePrenoms: null,
      produit: draft.produit,
      operation: draft.operation,
      statut: draft.statut === "terminee" ? "terminee" : "en_cours",
      poidsTotalKg: draft.poidsTotalKg.toFixed(3),
      nbSacsTotal: draft.nbSacsTotal,
      dateDebut: new Date(draft.createdAt).toISOString(),
      dateFin: draft.statut === "terminee" ? new Date(draft.updatedAt).toISOString() : null,
      notes: null,
      livraisonId: null,
      expeditionId: draft.expeditionId,
      prechargementStatut: null,
      prechargementEcartKg: null,
      prechargementEcartPct: null,
      createdAt: new Date(draft.createdAt).toISOString(),
      lignes: draft.lignes.map((line) => ({
        id: 0,
        sessionId: -1,
        numeroPassage: line.numeroPassage,
        nbSacs: line.nbSacs,
        poidsBrutKg: String(line.poidsBrutKg),
        tareKg: String(line.tareKg),
        notes: line.notes ?? null,
        createdAt: new Date(line.timestamp).toISOString(),
      })),
    };
  }

  async function addPassage() {
    if (!session) return;
    const poidsBrutKg = Number(brut);
    const sacs = Number(nbSacs);
    const tareKg = Number(tare || 0);
    if (!Number.isFinite(poidsBrutKg) || poidsBrutKg <= 0) { setError("Saisissez un poids brut positif."); return; }
    if (!Number.isFinite(tareKg) || tareKg < 0 || tareKg >= poidsBrutKg) { setError("La tare doit être positive et inférieure au poids brut."); return; }
    if (!Number.isInteger(sacs) || sacs < 0) { setError("Nombre de sacs invalide."); return; }
    try {
      setError("");
      if (brouillon) {
        const updated = await addLigneToBrouillon(brouillon.localId, {
          nbSacs: sacs, poidsBrutKg, tareKg, notes: notes || undefined,
        });
        setBrouillon(updated);
        setSession(brouillonToSyntheticSession(updated));
      } else {
        setSession(await addLignePesee(session.id, { nbSacs: sacs, poidsBrutKg, tareKg, notes: notes || undefined }));
      }
      setNbSacs(""); setBrut(""); setTare("0"); setNotes("");
    } catch (e) { setError((e as Error).message); }
  }

  async function closeSession() {
    if (!session || session.lignes.length === 0) { setError("Ajoutez au moins un passage avant de clôturer."); return; }
    if (!window.confirm("Clôturer la pré-pesée ? Le résultat sera comparé au poids prévu.")) return;
    setClosing(true); setError("");
    try {
      if (brouillon) {
        const updated = await terminerBrouillon(brouillon.localId);
        setBrouillon(updated);
        setDone(brouillonToSyntheticSession(updated));
      } else {
        setDone(await terminerSessionPesee(session.id));
      }
      setSession(null);
    }
    catch (e) { setError((e as Error).message); }
    finally { setClosing(false); }
  }

  if (loading) return <div className="t-loading"><Loader2 className="t-spin" /> Chargement…</div>;
  if (done) {
    const status = done.prechargementStatut;
    const localStatus = brouillon?.syncStatus === "error"
      ? "rejected"
      : brouillon?.syncStatus === "synced" ? "synced" : "local";
    return (
      <div className="t-app">
        <main className="t-main" style={{ padding: "32px 16px 90px" }}>
          <div style={{ textAlign: "center" }}><CheckCircle2 size={54} color={status === "conforme" ? "#16a34a" : "#d97706"} /><h1 style={{ margin: "12px 0 4px" }}>Pré-pesée clôturée</h1><p style={{ color: "var(--t-muted)" }}>{done.numeroSession}</p></div>
          <div className="t-card" style={{ marginTop: 22 }}>
            <div style={{ fontWeight: 800, fontSize: "1.1rem" }}>{fmt(Number(done.poidsTotalKg))} kg · {done.nbSacsTotal} sacs</div>
          <div style={{ marginTop: 8, color: brouillon ? (localStatus === "rejected" ? "#b91c1c" : localStatus === "synced" ? "#15803d" : "#b45309") : status === "conforme" ? "#15803d" : "#b45309", fontWeight: 700 }}>
            {brouillon
              ? localStatus === "rejected" ? "Rejeté par le serveur · à reprendre"
                : localStatus === "synced" ? "Synchronisé · contrôle serveur effectué"
                : "Enregistré localement · à synchroniser"
              : status === "conforme" ? "Conforme à la tolérance" : "Écart à justifier avant chargement"}
            </div>
          {done.prechargementEcartKg && <div style={{ color: "var(--t-muted)", fontSize: ".82rem", marginTop: 5 }}>Écart : {fmt(Number(done.prechargementEcartKg))} kg ({fmt(Number(done.prechargementEcartPct))} %)</div>}
          </div>
          {brouillon?.syncStatus === "error" && (
            <button className="t-btn t-btn--primary" style={{ width: "100%", marginTop: 12 }} onClick={() => void retryBrouillon(brouillon.localId).then(triggerSync)}>
              Reprendre la synchronisation
            </button>
          )}
          <button className="t-btn t-btn--primary" style={{ width: "100%", marginTop: 18 }} onClick={() => navigate("/prechargement")}>Retour aux chargements</button>
        </main>
        <BottomNavPeseur />
      </div>
    );
  }
  if (!session) return <div className="t-loading">{error || "Session introuvable"}</div>;

  return (
    <div className="t-app">
      <header className="t-header t-header--peseur">
        <Link href="/prechargement" style={{ color: "#fff", display: "flex" }}><ArrowLeft size={20} /></Link>
          <div style={{ marginLeft: 12 }}><div className="t-header__title">Pré-pesée export</div><div className="t-header__sub">{session.numeroSession}{brouillon ? " · local" : ""}</div></div>
      </header>
      <main className="t-main" style={{ padding: "16px 16px 100px" }}>
        <div className="t-card" style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}><Ship size={19} color="var(--t-peseur)" /><strong>{session.numeroSession}</strong></div>
          <div style={{ fontSize: ".82rem", color: "var(--t-muted)", marginTop: 6 }}>Les passages sont cumulés puis comparés au poids prévu de l’expédition.</div>
          <div style={{ marginTop: 8, fontWeight: 800 }}>Total pré-pesé : {fmt(Number(session.poidsTotalKg))} kg · {session.nbSacsTotal} sacs</div>
        </div>
        {error && <div className="t-alert t-alert--danger">{error}</div>}
        <ScaleWeightDisplay onUse={(v) => setBrut(String(v))} />
        <div className="t-card">
          <div className="t-form-row"><label>Nombre de sacs</label><NumericInput value={nbSacs} onChange={setNbSacs} placeholder="0" /></div>
          <div className="t-form-row"><label>Poids brut (kg)</label><NumericInput value={brut} onChange={setBrut} placeholder="0,000" /></div>
          <div className="t-form-row"><label>Tare (kg)</label><NumericInput value={tare} onChange={setTare} placeholder="0" /></div>
          <div className="t-form-row"><label>Note (facultatif)</label><input className="t-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observation du passage" /></div>
          <button className="t-btn t-btn--primary" style={{ width: "100%", marginTop: 8 }} onClick={() => void addPassage()}><Plus size={17} /> Ajouter le passage</button>
        </div>
        <div style={{ marginTop: 14, display: "grid", gap: 7 }}>
          {session.lignes.map((line) => {
            const net = Number(line.poidsBrutKg) - Number(line.tareKg ?? 0);
            return <div key={line.id} className="t-card" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
              <span style={{ color: "var(--t-muted)", fontSize: ".75rem" }}>#{line.numeroPassage}</span><span style={{ flex: 1, fontWeight: 700 }}>{fmt(net)} kg · {line.nbSacs} sacs</span>
              <button onClick={() => {
                if (brouillon) {
                  const draftLine = brouillon.lignes[line.numeroPassage - 1];
                  if (!draftLine) return;
                  void deleteLigneFromBrouillon(brouillon.localId, draftLine.localId)
                    .then((updated) => { setBrouillon(updated); setSession(brouillonToSyntheticSession(updated)); })
                    .catch((e) => setError((e as Error).message));
                } else {
                  void deleteLignePesee(session.id, line.id).then(setSession).catch((e) => setError((e as Error).message));
                }
              }} className="t-icon-btn" title="Supprimer"><Trash2 size={16} /></button>
            </div>;
          })}
        </div>
        <button className="t-btn t-btn--primary" style={{ width: "100%", marginTop: 18 }} disabled={closing || session.lignes.length === 0} onClick={() => void closeSession()}>
          {closing ? <><Loader2 className="t-spin" size={17} /> Clôture…</> : <><CheckCircle2 size={17} /> Clôturer la pré-pesée</>}
        </button>
        <div style={{ display: "flex", gap: 7, marginTop: 12, color: "var(--t-muted)", fontSize: ".74rem" }}><AlertTriangle size={15} /><span>Aucune livraison ni sortie de stock n’est créée à cette étape.</span></div>
      </main>
      <BottomNavPeseur />
    </div>
  );
}
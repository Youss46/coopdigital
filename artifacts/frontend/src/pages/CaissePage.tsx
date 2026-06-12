import { useState, useCallback, useEffect } from "react";
import { Wallet, Plus, RefreshCw, Lock, Unlock, Download, AlertTriangle, TrendingUp, TrendingDown, ChevronRight, X, CheckCircle2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MoneyInput } from "@/components/ui/money-input";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";

const FCFA = (n: number | string) =>
  new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

const MOTIFS_ENTREE = [
  { value: "don",            label: "Don / subvention" },
  { value: "retrait_banque", label: "Retrait banque" },
  { value: "remboursement",  label: "Remboursement reçu" },
  { value: "autre",          label: "Autre entrée" },
];
const MOTIFS_SORTIE = [
  { value: "paiement_producteur",  label: "Paiement producteur" },
  { value: "avance",               label: "Avance à un membre" },
  { value: "achat_intrants",       label: "Achat intrants" },
  { value: "frais_fonctionnement", label: "Frais de fonctionnement" },
  { value: "depot_banque",         label: "Dépôt en banque" },
  { value: "remboursement",        label: "Remboursement" },
  { value: "autre",                label: "Autre sortie" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Caisse {
  id: number; nom: string; responsable_id: number | null; responsable_nom: string | null;
  solde_actuel_fcfa: string; fond_caisse_minimum_fcfa: string; actif: boolean;
  session_id: number | null; session_statut: string | null;
  heure_ouverture: string | null; solde_ouverture_fcfa: string | null;
}

interface Mouvement {
  id: number; type: string; motif: string; montant_fcfa: string;
  libelle: string | null; solde_apres_fcfa: string | null;
  created_at: string; enregistre_par_nom: string | null; session_id: number;
}

interface Session {
  id: number; date_session: string; statut: string;
  solde_ouverture_fcfa: string; solde_fermeture_theorique_fcfa: string | null;
  solde_fermeture_reel_fcfa: string | null; ecart_fcfa: string | null;
  heure_ouverture: string; heure_fermeture: string | null;
  ouvert_par_nom: string | null; ferme_par_nom: string | null; nb_mouvements: string;
}

interface Journal { mouvements: Mouvement[]; totalEntrees: number; totalSorties: number; }

interface DelegueInfo {
  id: number;
  nom: string;
  prenoms: string | null;
  telephone: string | null;
  section: string | null;
  actif: boolean;
  caisse: { id: number | null; solde: number; };
  paiementsDifferes: { nb: number; montantTotal: number; };
  nbCollectes: number;
}

interface MouvementDelegue {
  id: number;
  type: string;
  montantFcfa: number;
  soldeApresFcfa: number;
  note: string | null;
  livraisonId: number | null;
  createdAt: string | null;
}

// ─── Hook fetch générique ─────────────────────────────────────────────────────

function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!url) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
      setData(await r.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Erreur"); }
    finally { setLoading(false); }
  }, [url, ...deps]);

  return { data, loading, error, refetch: fetch_ };
}

// ─── Modal Mouvement ──────────────────────────────────────────────────────────

function ModalMouvement({ caisseId, onClose, onDone }: { caisseId: number; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState<"entree" | "sortie">("entree");
  const [motif, setMotif] = useState("");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [loading, setLoading] = useState(false);

  const motifs = type === "entree" ? MOTIFS_ENTREE : MOTIFS_SORTIE;

  const submit = async () => {
    if (!motif || !montant || parseInt(montant) <= 0) {
      toast({ title: "Champs requis", description: "Motif et montant obligatoires.", variant: "destructive" }); return;
    }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/caisse/${caisseId}/mouvement`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ type, motif, montantFcfa: parseInt(montant), libelle }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      if (json.alerte) toast({ title: "Alerte caisse", description: json.alerte, variant: "destructive" });
      else toast({ title: "Mouvement enregistré", description: `${type === "entree" ? "Entrée" : "Sortie"} de ${FCFA(parseInt(montant))} enregistrée.` });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Nouveau mouvement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Type */}
          <div className="grid grid-cols-2 gap-2">
            {(["entree", "sortie"] as const).map((t) => (
              <button key={t} onClick={() => { setType(t); setMotif(""); }}
                className={`py-3 rounded-lg font-medium transition-all ${type === t
                  ? t === "entree" ? "bg-green-600 text-white" : "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t === "entree" ? "💵 Entrée" : "💸 Sortie"}
              </button>
            ))}
          </div>
          {/* Motif */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif *</label>
            <select value={motif} onChange={e => setMotif(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">Sélectionner un motif</option>
              {motifs.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          {/* Montant */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Montant (FCFA) *</label>
            <MoneyInput value={montant} onChange={(raw) => setMontant(raw)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: 50 000" />
          </div>
          {/* Libellé */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Libellé</label>
            <input type="text" value={libelle} onChange={e => setLibelle(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Description optionnelle" />
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={submit} disabled={loading}
            className={`flex-1 py-2 rounded-lg text-sm font-medium text-white transition-colors ${type === "entree" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
            {loading ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Fermeture ──────────────────────────────────────────────────────────

function ModalFermeture({ caisseId, onClose, onDone }: { caisseId: number; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [soldeReel, setSoldeReel] = useState("");
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!soldeReel) { toast({ title: "Solde réel requis", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/caisse/${caisseId}/fermer`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ soldeReel: parseInt(soldeReel), observations }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Session fermée", description: `Solde théorique : ${FCFA(json.soldeTheorique)}. Réel : ${FCFA(json.soldeReel)}.` });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Fermer la session</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Saisissez le montant physiquement présent dans la caisse.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solde réel compté (FCFA) *</label>
            <MoneyInput value={soldeReel} onChange={(raw) => setSoldeReel(raw)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: 485 000" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observations</label>
            <textarea value={observations} onChange={e => setObservations(e.target.value)} rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Commentaires sur la clôture…" />
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors">
            {loading ? "Fermeture…" : "Fermer la session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Nouvelle Caisse ────────────────────────────────────────────────────

function ModalCreerCaisse({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [nom, setNom] = useState("");
  const [fondMin, setFondMin] = useState("");
  const [soldeInit, setSoldeInit] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!nom.trim()) { toast({ title: "Nom requis", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/caisse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ nom, fondMinimum: parseInt(fondMin) || 0, soldeinitial: parseInt(soldeInit) || 0 }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      toast({ title: "Caisse créée", description: `"${nom}" a été créée avec succès.` });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Nouvelle caisse</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom de la caisse *</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: Caisse principale siège" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Solde initial (FCFA)</label>
            <MoneyInput value={soldeInit} onChange={(raw) => setSoldeInit(raw)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fond minimum (FCFA)</label>
            <MoneyInput value={fondMin} onChange={(raw) => setFondMin(raw)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="100 000" />
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Annuler</button>
          <button onClick={submit} disabled={loading}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors">
            {loading ? "Création…" : "Créer la caisse"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 1 — État des caisses ──────────────────────────────────────────────

function EtatCaisses({ caisses, loading, refetch, onJournal }: {
  caisses: Caisse[] | null; loading: boolean; refetch: () => void;
  onJournal: (id: number) => void;
}) {
  const { toast } = useToast();
  const [modalMvt, setModalMvt] = useState<number | null>(null);
  const [modalFermer, setModalFermer] = useState<number | null>(null);
  const [modalCreer, setModalCreer] = useState(false);

  const ouvrirSession = async (id: number) => {
    try {
      const r = await fetch(`${BASE}/api/caisse/${id}/ouvrir`, {
        method: "POST", headers: { Authorization: `Bearer ${tok()}` },
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Session ouverte", description: "La caisse est maintenant ouverte." });
      refetch();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{caisses?.length ?? 0} caisse(s) enregistrée(s)</p>
        <div className="flex gap-2">
          <button onClick={refetch} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw size={14} /> Actualiser
          </button>
          <button onClick={() => setModalCreer(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
            <Plus size={14} /> Nouvelle caisse
          </button>
        </div>
      </div>

      {(!caisses || caisses.length === 0) && (
        <div className="text-center py-16 text-gray-400">
          <Wallet size={48} className="mx-auto mb-3 opacity-30" />
          <p>Aucune caisse enregistrée. Créez votre première caisse.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {caisses?.map((c) => {
          const solde = parseFloat(c.solde_actuel_fcfa);
          const min   = parseFloat(c.fond_caisse_minimum_fcfa);
          const pct   = min > 0 ? Math.min(100, Math.round(((solde - min) / min) * 100 + 100)) : 100;
          const sousMin = min > 0 && solde < min;
          const ouvert = c.session_statut === "ouverte";

          return (
            <div key={c.id} className={`bg-white rounded-xl border-2 p-5 shadow-sm ${sousMin ? "border-red-200" : ouvert ? "border-green-200" : "border-gray-100"}`}>
              {/* En-tête */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Wallet size={16} className="text-green-600" />
                    <h3 className="font-semibold text-gray-800">{c.nom}</h3>
                    {sousMin && <AlertTriangle size={14} className="text-red-500" />}
                  </div>
                  {c.responsable_nom && (
                    <p className="text-xs text-gray-400 mt-0.5">Responsable : {c.responsable_nom}</p>
                  )}
                </div>
                <span className={`text-xs font-medium px-2 py-1 rounded-full ${ouvert ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {ouvert ? "● OUVERTE" : "○ FERMÉE"}
                </span>
              </div>

              {/* Solde */}
              <div className="mb-3">
                <p className="text-2xl font-bold text-gray-900">{FCFA(solde)}</p>
                {min > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">Fond minimum : {FCFA(min)}</p>
                )}
              </div>

              {/* Barre progression */}
              {min > 0 && (
                <div className="mb-3">
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${sousMin ? "bg-red-500" : "bg-green-500"}`}
                      style={{ width: `${Math.max(2, Math.min(100, (solde / (min * 2)) * 100))}%` }} />
                  </div>
                  <p className={`text-xs mt-1 ${sousMin ? "text-red-600 font-medium" : "text-gray-400"}`}>
                    {sousMin ? `⚠️ Sous le minimum de ${FCFA(min - solde)}` : `${FCFA(solde - min)} au-dessus du minimum`}
                  </p>
                </div>
              )}

              {/* Infos session */}
              {ouvert && c.heure_ouverture && (
                <p className="text-xs text-green-600 mb-3">
                  Session ouverte depuis {c.heure_ouverture.slice(11, 16)}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-2 border-t border-gray-50">
                <button onClick={() => onJournal(c.id)}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50">
                  <ChevronRight size={12} /> Journal
                </button>
                {!ouvert ? (
                  <button onClick={() => ouvrirSession(c.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
                    <Unlock size={12} /> Ouvrir
                  </button>
                ) : (
                  <>
                    <button onClick={() => setModalMvt(c.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                      <Plus size={12} /> Mouvement
                    </button>
                    <button onClick={() => setModalFermer(c.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs hover:bg-red-700">
                      <Lock size={12} /> Fermer
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalMvt !== null && (
        <ModalMouvement caisseId={modalMvt} onClose={() => setModalMvt(null)} onDone={() => { setModalMvt(null); refetch(); }} />
      )}
      {modalFermer !== null && (
        <ModalFermeture caisseId={modalFermer} onClose={() => setModalFermer(null)} onDone={() => { setModalFermer(null); refetch(); }} />
      )}
      {modalCreer && (
        <ModalCreerCaisse onClose={() => setModalCreer(false)} onDone={() => { setModalCreer(false); refetch(); }} />
      )}
    </div>
  );
}

// ─── Onglet 2 — Journal de caisse ─────────────────────────────────────────────

function JournalCaisse({ caisses, initCaisseId }: { caisses: Caisse[] | null; initCaisseId?: number }) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [caisseId, setCaisseId] = useState<number | "">(initCaisseId ?? (caisses?.[0]?.id ?? ""));
  const [date, setDate] = useState(today);
  const [journal, setJournal] = useState<Journal | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalMvt, setModalMvt] = useState(false);
  const [modalFermer, setModalFermer] = useState(false);

  const charger = useCallback(async (id?: number | "", d?: string) => {
    const cid = id ?? caisseId;
    const dt  = d  ?? date;
    if (!cid) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/caisse/${cid}/journal?date_debut=${dt}&date_fin=${dt}`,
        { headers: { Authorization: `Bearer ${tok()}` } });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      setJournal(json);
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  }, [caisseId, date]);

  const ouvrirSession = async () => {
    if (!caisseId) return;
    try {
      const r = await fetch(`${BASE}/api/caisse/${caisseId}/ouvrir`, {
        method: "POST", headers: { Authorization: `Bearer ${tok()}` },
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      toast({ title: "Session ouverte" });
      charger();
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    }
  };

  const telechargerPdf = () => {
    if (!caisseId) return;
    const a = document.createElement("a");
    a.href = `${BASE}/api/caisse/${caisseId}/rapport-pdf?date=${date}`;
    const headers = new Headers({ Authorization: `Bearer ${tok()}` });
    fetch(a.href, { headers }).then(r => r.blob()).then(blob => {
      a.href = URL.createObjectURL(blob);
      a.download = `rapport-caisse-${date}.pdf`;
      a.click();
    });
  };

  const caisseSelectionnee = caisses?.find(c => c.id === caisseId);
  const sessionOuverte = caisseSelectionnee?.session_statut === "ouverte";

  return (
    <div>
      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={caisseId} onChange={e => { setCaisseId(Number(e.target.value)); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Sélectionner une caisse</option>
          {caisses?.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <input type="date" value={date} onChange={e => setDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
        <button onClick={() => charger()} disabled={!caisseId || loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
          {loading ? <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <RefreshCw size={14} />}
          Charger
        </button>
      </div>

      {/* Actions session */}
      {caisseId && (
        <div className="flex flex-wrap gap-2 mb-4">
          {!sessionOuverte && date === today && (
            <button onClick={ouvrirSession}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
              <Unlock size={14} /> Ouvrir la session du jour
            </button>
          )}
          {sessionOuverte && (
            <>
              <button onClick={() => setModalMvt(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                <Plus size={14} /> Nouveau mouvement
              </button>
              <button onClick={() => setModalFermer(true)}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                <Lock size={14} /> Fermer la session
              </button>
            </>
          )}
          {journal && (
            <button onClick={telechargerPdf}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              <Download size={14} /> Télécharger PDF
            </button>
          )}
        </div>
      )}

      {/* Résumé */}
      {journal && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
            <TrendingUp size={16} className="text-green-600 mx-auto mb-1" />
            <p className="text-xs text-green-600 font-medium">Total Entrées</p>
            <p className="text-base font-bold text-green-700">{FCFA(journal.totalEntrees)}</p>
          </div>
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
            <TrendingDown size={16} className="text-red-600 mx-auto mb-1" />
            <p className="text-xs text-red-600 font-medium">Total Sorties</p>
            <p className="text-base font-bold text-red-700">{FCFA(journal.totalSorties)}</p>
          </div>
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
            <Wallet size={16} className="text-blue-600 mx-auto mb-1" />
            <p className="text-xs text-blue-600 font-medium">Solde Final</p>
            <p className="text-base font-bold text-blue-700">
              {FCFA(journal.totalEntrees - journal.totalSorties + (caisseSelectionnee ? parseFloat(caisseSelectionnee.solde_ouverture_fcfa ?? caisseSelectionnee.solde_actuel_fcfa) : 0))}
            </p>
          </div>
        </div>
      )}

      {/* Tableau */}
      {journal ? (
        journal.mouvements.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl">
            <p>Aucun mouvement pour cette journée.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left px-4 py-3 font-medium">Heure</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Motif</th>
                  <th className="text-left px-4 py-3 font-medium">Libellé</th>
                  <th className="text-right px-4 py-3 font-medium">Montant</th>
                  <th className="text-right px-4 py-3 font-medium">Solde après</th>
                </tr>
              </thead>
              <tbody>
                {journal.mouvements.map((m, i) => (
                  <tr key={m.id} className={`border-t border-gray-50 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{m.created_at?.slice(11, 16) ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${m.type === "entree" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {m.type === "entree" ? "↑ Entrée" : "↓ Sortie"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{m.motif.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{m.libelle ?? "—"}</td>
                    <td className={`px-4 py-3 text-right font-semibold ${m.type === "entree" ? "text-green-600" : "text-red-600"}`}>
                      {m.type === "entree" ? "+" : "-"}{FCFA(m.montant_fcfa)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600 text-xs">
                      {m.solde_apres_fcfa ? FCFA(m.solde_apres_fcfa) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : !loading && (
        <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl">
          <p>Sélectionnez une caisse et une date, puis cliquez sur Charger.</p>
        </div>
      )}

      {modalMvt && caisseId && (
        <ModalMouvement caisseId={caisseId as number} onClose={() => setModalMvt(false)} onDone={() => { setModalMvt(false); charger(); }} />
      )}
      {modalFermer && caisseId && (
        <ModalFermeture caisseId={caisseId as number} onClose={() => setModalFermer(false)} onDone={() => { setModalFermer(false); charger(); }} />
      )}
    </div>
  );
}

// ─── Onglet 3 — Historique sessions ──────────────────────────────────────────

function HistoriqueSessions({ caisses }: { caisses: Caisse[] | null }) {
  const { toast } = useToast();
  const [caisseId, setCaisseId] = useState<number | "">(caisses?.[0]?.id ?? "");
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<{ session: Session; journal: Journal } | null>(null);

  const charger = async (id?: number | "") => {
    const cid = id ?? caisseId;
    if (!cid) return;
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/caisse/${cid}/sessions`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      setSessions(await r.json());
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  };

  const voirDetail = async (session: Session) => {
    if (!caisseId) return;
    try {
      const r = await fetch(
        `${BASE}/api/caisse/${caisseId}/journal?date_debut=${session.date_session}&date_fin=${session.date_session}`,
        { headers: { Authorization: `Bearer ${tok()}` } }
      );
      const j = await r.json();
      setDetail({ session, journal: j });
    } catch { /* ignore */ }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={caisseId}
          onChange={e => { const id = Number(e.target.value); setCaisseId(id); charger(id); }}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
          <option value="">Sélectionner une caisse</option>
          {caisses?.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <button onClick={() => charger()} disabled={!caisseId || loading}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
          <RefreshCw size={14} /> Charger
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" />
        </div>
      )}

      {sessions && !loading && (
        sessions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-xl">Aucune session pour cette caisse.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Statut</th>
                  <th className="text-right px-4 py-3 font-medium">Ouverture</th>
                  <th className="text-right px-4 py-3 font-medium">Fermeture théorique</th>
                  <th className="text-right px-4 py-3 font-medium">Fermeture réelle</th>
                  <th className="text-center px-4 py-3 font-medium">Écart</th>
                  <th className="text-left px-4 py-3 font-medium">Par qui</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => {
                  const ecart = parseFloat(s.ecart_fcfa ?? "0");
                  const hasEcart = Math.abs(ecart) > 0;
                  return (
                    <tr key={s.id} className={`border-t border-gray-50 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        {new Date(s.date_session + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "short" })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.statut === "ouverte" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {s.statut === "ouverte" ? "Ouverte" : "Fermée"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs">{FCFA(s.solde_ouverture_fcfa)}</td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs">
                        {s.solde_fermeture_theorique_fcfa ? FCFA(s.solde_fermeture_theorique_fcfa) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600 text-xs">
                        {s.solde_fermeture_reel_fcfa ? FCFA(s.solde_fermeture_reel_fcfa) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.ecart_fcfa !== null ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${hasEcart ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                            {hasEcart ? <AlertTriangle size={10} /> : <CheckCircle2 size={10} />}
                            {hasEcart ? (ecart > 0 ? "+" : "") + FCFA(ecart) : "OK"}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{s.ouvert_par_nom ?? "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => voirDetail(s)}
                          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                          <ChevronRight size={12} /> Détail
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Modal détail session */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">
                Session du {new Date(detail.session.date_session + "T00:00:00").toLocaleDateString("fr-FR")}
              </h2>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="overflow-auto p-5">
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-green-600">Entrées</p>
                  <p className="font-bold text-green-700">{FCFA(detail.journal.totalEntrees)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-red-600">Sorties</p>
                  <p className="font-bold text-red-700">{FCFA(detail.journal.totalSorties)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600">Mouvements</p>
                  <p className="font-bold text-gray-700">{detail.session.nb_mouvements}</p>
                </div>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs">
                    <th className="text-left px-3 py-2 font-medium">Heure</th>
                    <th className="text-left px-3 py-2 font-medium">Type</th>
                    <th className="text-left px-3 py-2 font-medium">Motif</th>
                    <th className="text-right px-3 py-2 font-medium">Montant</th>
                    <th className="text-right px-3 py-2 font-medium">Solde après</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.journal.mouvements.map((m) => (
                    <tr key={m.id} className="border-t border-gray-50">
                      <td className="px-3 py-2 text-gray-400 font-mono text-xs">{m.created_at?.slice(11, 16)}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium ${m.type === "entree" ? "text-green-600" : "text-red-600"}`}>
                          {m.type === "entree" ? "↑" : "↓"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 text-xs">{m.motif.replace(/_/g, " ")}</td>
                      <td className={`px-3 py-2 text-right font-semibold text-xs ${m.type === "entree" ? "text-green-600" : "text-red-600"}`}>
                        {m.type === "entree" ? "+" : "-"}{FCFA(m.montant_fcfa)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500 text-xs">
                        {m.solde_apres_fcfa ? FCFA(m.solde_apres_fcfa) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal Alimenter Caisse Déléguée ──────────────────────────────────────────

function ModalAlimenter({ delegue, caisses, onClose, onDone }: {
  delegue: DelegueInfo;
  caisses: Caisse[] | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [caisseSourceId, setCaisseSourceId] = useState<number | "">("");
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [loading, setLoading] = useState(false);

  const caisseSource = caisses?.find((c) => c.id === Number(caisseSourceId));
  const soldeSource = caisseSource ? parseFloat(caisseSource.solde_actuel_fcfa) : null;
  const montantNum = parseInt(montant) || 0;
  const insuffisant = soldeSource !== null && montantNum > 0 && montantNum > soldeSource;
  const nouveauSoldeDelegue = delegue.caisse.solde + montantNum;

  const submit = async () => {
    if (!montant || montantNum <= 0) { toast({ title: "Montant requis", variant: "destructive" }); return; }
    if (!caisseSourceId) { toast({ title: "Caisse source requise", variant: "destructive" }); return; }
    if (insuffisant) { toast({ title: "Solde insuffisant", description: "La caisse source n'a pas assez de fonds.", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/delegues/${delegue.id}/alimenter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
        body: JSON.stringify({ montantFcfa: montantNum, caisseSourceId: Number(caisseSourceId), motif }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.erreur ?? json.error ?? "Erreur");
      toast({
        title: "Caisse alimentée",
        description: `${FCFA(montantNum)} envoyés à ${delegue.nom} ${delegue.prenoms ?? ""}. SMS envoyé automatiquement.`,
      });
      onDone();
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-800">Alimenter la caisse</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-green-50 border border-green-100 rounded-lg p-3">
            <div className="font-medium text-gray-800">{delegue.nom} {delegue.prenoms}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Zone : {delegue.section ?? "—"} · Solde actuel : {FCFA(delegue.caisse.solde)}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Caisse source *</label>
            <select value={caisseSourceId} onChange={(e) => setCaisseSourceId(Number(e.target.value) || "")}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option value="">Sélectionner une caisse</option>
              {caisses?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom} — {FCFA(parseFloat(c.solde_actuel_fcfa))}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Montant (FCFA) *</label>
            <MoneyInput value={montant} onChange={(raw) => setMontant(raw)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Ex: 100 000" />
          </div>
          {montantNum > 0 && soldeSource !== null && (
            <div className={`text-xs px-3 py-2 rounded-lg border ${insuffisant
              ? "bg-red-50 text-red-700 border-red-200"
              : "bg-green-50 text-green-700 border-green-100"}`}>
              {insuffisant
                ? `❌ Solde insuffisant en caisse source (${FCFA(soldeSource)} disponible)`
                : `✅ Source : ${FCFA(soldeSource - montantNum)} restant · Délégué : ${FCFA(nouveauSoldeDelegue)}`}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif</label>
            <input type="text" value={motif} onChange={(e) => setMotif(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Alimentation journée, campagne…" />
          </div>
          <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-2.5">
            📱 Un SMS de confirmation sera envoyé automatiquement au délégué.
          </div>
        </div>
        <div className="flex gap-3 p-5 pt-0">
          <button onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={submit} disabled={loading || insuffisant}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 transition-colors">
            {loading ? "Envoi…" : "Alimenter la caisse"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 4 — Caisses déléguées ─────────────────────────────────────────────

function CaissesDelegueesTab({ caisses }: { caisses: Caisse[] | null }) {
  const { toast } = useToast();
  const [delegues, setDelegues] = useState<DelegueInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalAlimenter, setModalAlimenter] = useState<DelegueInfo | null>(null);
  const [detailAgent, setDetailAgent] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    agent: { nom: string; prenoms: string; section: string | null };
    caisse: { id: number | null; solde: number };
    mouvements: MouvementDelegue[];
  } | null>(null);

  const charger = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/delegues`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error((await r.json()).erreur ?? "Erreur");
      setDelegues(await r.json());
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { charger(); }, [charger]);

  const voirDetail = async (agentId: number) => {
    setDetailAgent(agentId);
    try {
      const r = await fetch(`${BASE}/api/delegues/${agentId}/caisse`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error((await r.json()).erreur ?? "Erreur");
      setDetail(await r.json());
    } catch (e) {
      toast({ title: "Erreur", description: (e as Error).message, variant: "destructive" });
    }
  };

  const totalSolde = delegues?.reduce((s, d) => s + d.caisse.solde, 0) ?? 0;
  const nbAlertes = delegues?.filter((d) => d.caisse.solde === 0 || d.paiementsDifferes.nb > 0).length ?? 0;
  const nbVides = delegues?.filter((d) => d.caisse.solde === 0).length ?? 0;

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" />
    </div>
  );

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Délégués actifs</p>
          <p className="text-2xl font-bold text-gray-800">{delegues?.length ?? 0}</p>
        </div>
        <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-400 mb-1">Total distribué</p>
          <p className="text-sm font-bold text-green-700">{FCFA(totalSolde)}</p>
        </div>
        <div className={`border rounded-xl p-4 shadow-sm ${nbAlertes > 0 ? "bg-red-50 border-red-200" : "bg-white border-gray-100"}`}>
          <p className="text-xs text-gray-400 mb-1">Alertes</p>
          <p className={`text-2xl font-bold ${nbAlertes > 0 ? "text-red-600" : "text-gray-800"}`}>{nbAlertes}</p>
          {nbVides > 0 && <p className="text-xs text-red-500 mt-0.5">{nbVides} caisse(s) vide(s)</p>}
        </div>
      </div>

      {/* Actions barre */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{delegues?.length ?? 0} délégué(s) enregistré(s)</p>
        <button onClick={charger} className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw size={14} /> Actualiser
        </button>
      </div>

      {/* Table */}
      {(!delegues || delegues.length === 0) ? (
        <div className="text-center py-16 text-gray-400">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>Aucun délégué avec une caisse enregistrée.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs">
                <th className="text-left px-4 py-3 font-medium">Délégué</th>
                <th className="text-left px-4 py-3 font-medium">Zone</th>
                <th className="text-right px-4 py-3 font-medium">Solde caisse</th>
                <th className="text-right px-4 py-3 font-medium">Paiements diff.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {delegues.map((d, i) => {
                const vide = d.caisse.solde === 0;
                const hasDifferes = d.paiementsDifferes.nb > 0;
                return (
                  <tr key={d.id} className={`border-t border-gray-50 ${i % 2 === 1 ? "bg-gray-50/50" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{d.nom} {d.prenoms}</div>
                      <div className="text-xs text-gray-400">{d.telephone ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{d.section ?? "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold text-sm ${vide ? "text-red-600" : "text-green-700"}`}>
                        {vide && <AlertTriangle size={12} className="inline mr-1" />}
                        {FCFA(d.caisse.solde)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {hasDifferes ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                          {d.paiementsDifferes.nb} · {FCFA(d.paiementsDifferes.montantTotal)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <button onClick={() => setModalAlimenter(d)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 transition-colors">
                          <Plus size={11} /> Alimenter
                        </button>
                        <button onClick={() => voirDetail(d.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-xs hover:bg-gray-50">
                          <ChevronRight size={11} /> Journal
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Alimenter */}
      {modalAlimenter && (
        <ModalAlimenter
          delegue={modalAlimenter}
          caisses={caisses}
          onClose={() => setModalAlimenter(null)}
          onDone={() => { setModalAlimenter(null); charger(); }}
        />
      )}

      {/* Modal Journal délégué */}
      {detailAgent !== null && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold text-gray-800">
                {detail ? `Caisse — ${detail.agent.nom} ${detail.agent.prenoms}` : "Chargement…"}
              </h2>
              <button onClick={() => { setDetailAgent(null); setDetail(null); }}
                className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            {!detail ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" />
              </div>
            ) : (
              <div className="overflow-auto p-5">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-green-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-green-600">Solde actuel</p>
                    <p className="font-bold text-green-700">{FCFA(detail.caisse.solde)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-xs text-gray-500">Zone</p>
                    <p className="font-bold text-gray-700">{detail.agent.section ?? "—"}</p>
                  </div>
                </div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Derniers mouvements</h3>
                {detail.mouvements.length === 0 ? (
                  <p className="text-center py-8 text-gray-400 text-sm">Aucun mouvement enregistré.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-400 text-xs bg-gray-50">
                        <th className="text-left px-3 py-2">Date</th>
                        <th className="text-left px-3 py-2">Type</th>
                        <th className="text-right px-3 py-2">Montant</th>
                        <th className="text-right px-3 py-2">Solde après</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.mouvements.map((m) => {
                        const positif = m.montantFcfa >= 0;
                        return (
                          <tr key={m.id} className="border-t border-gray-50">
                            <td className="px-3 py-2 text-xs text-gray-400 font-mono">
                              {m.createdAt ? new Date(m.createdAt).toLocaleDateString("fr-FR") : "—"}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${positif ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {m.type.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className={`px-3 py-2 text-right font-semibold text-xs ${positif ? "text-green-600" : "text-red-600"}`}>
                              {positif ? "+" : "−"}{FCFA(Math.abs(m.montantFcfa))}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gray-500">
                              {FCFA(m.soldeApresFcfa)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function CaissePage() {
  const [tab, setTab] = useState<"etat" | "journal" | "historique" | "delegues">("etat");
  const [journalCaisseId, setJournalCaisseId] = useState<number | undefined>();
  const [caisses, setCaisses] = useState<Caisse[] | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const chargerCaisses = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/caisse`, { headers: { Authorization: `Bearer ${tok()}` } });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      setCaisses(await r.json());
    } catch (e) {
      toast({ title: "Erreur", description: e instanceof Error ? e.message : "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  // Charger au montage
  useState(() => { chargerCaisses(); });

  const versJournal = (id: number) => {
    setJournalCaisseId(id);
    setTab("journal");
  };

  const TABS = [
    { id: "etat" as const,        label: "État des caisses" },
    { id: "journal" as const,     label: "Journal de caisse" },
    { id: "historique" as const,  label: "Historique sessions" },
    { id: "delegues" as const,    label: "Caisses déléguées" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-600 rounded-xl flex items-center justify-center">
            <Wallet size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Gestion de Caisse</h1>
            <p className="text-sm text-gray-400">Caisses, sessions et mouvements</p>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.id ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenu */}
      {tab === "etat" && (
        <EtatCaisses caisses={caisses} loading={loading} refetch={chargerCaisses} onJournal={versJournal} />
      )}
      {tab === "journal" && (
        <JournalCaisse caisses={caisses} initCaisseId={journalCaisseId} />
      )}
      {tab === "historique" && (
        <HistoriqueSessions caisses={caisses} />
      )}
      {tab === "delegues" && (
        <CaissesDelegueesTab caisses={caisses} />
      )}
    </div>
  );
}

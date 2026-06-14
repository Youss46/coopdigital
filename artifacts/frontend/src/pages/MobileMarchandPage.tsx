import { useState, useEffect } from "react";
import { Smartphone, Plus, RefreshCw, AlertTriangle, TrendingUp, TrendingDown, X, ChevronRight, ArrowRightLeft, Landmark } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok  = () => localStorage.getItem("coop_token") ?? "";

const FCFA = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : (n ?? 0)) + " FCFA";

const DATE_FR = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("fr-FR");

const OPERATEURS: Record<string, { label: string; bg: string; color: string }> = {
  wave:         { label: "Wave",         bg: "#1351D8", color: "#fff" },
  orange_money: { label: "Orange Money", bg: "#FF6600", color: "#fff" },
  mtn_momo:     { label: "MTN MoMo",     bg: "#FFCC00", color: "#000" },
};

const MOTIFS_CREDIT = [
  { value: "paiement_recu",    label: "Paiement reçu d'un producteur" },
  { value: "virement_entrant", label: "Virement entrant" },
  { value: "rechargement",     label: "Rechargement du compte" },
  { value: "autre_credit",     label: "Autre crédit" },
];
const MOTIFS_DEBIT = [
  { value: "paiement_producteur", label: "Paiement producteur" },
  { value: "virement_sortant",    label: "Virement sortant" },
  { value: "frais_transaction",   label: "Frais de transaction" },
  { value: "autre_debit",         label: "Autre débit" },
];

type Compte = {
  id: number; nom: string; operateur: string; numero_marchand: string | null;
  solde_actuel_fcfa: string; solde_mini_alerte_fcfa: string; actif: boolean;
};
type Mouvement = {
  id: number; type: string; motif: string; montant_fcfa: string;
  libelle: string | null; reference: string | null;
  date_operation: string; solde_apres_fcfa: string | null; created_at: string;
};

async function apiFetch(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${tok()}` } });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur serveur"); }
  return r.json();
}
async function apiPost(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur serveur"); }
  return r.json();
}
async function apiPut(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { erreur?: string }).erreur ?? "Erreur serveur"); }
  return r.json();
}

export default function MobileMarchandPage() {
  const { utilisateur } = useAuth();
  const { toast } = useToast();
  const role = utilisateur?.role ?? "";
  const peutCreer = ["pca", "directeur"].includes(role);
  const peutMouvement = ["pca", "directeur", "comptable"].includes(role);

  const [comptes, setComptes] = useState<Compte[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Compte | null>(null);
  const [journal, setJournal] = useState<Mouvement[]>([]);
  const [journalLoading, setJournalLoading] = useState(false);

  const [modalCreer, setModalCreer] = useState(false);
  const [modalEdit, setModalEdit] = useState<Compte | null>(null);
  const [modalMvt, setModalMvt] = useState<number | null>(null);
  const [modalVirement, setModalVirement] = useState<number | null>(null);

  const [erreur, setErreur] = useState<string | null>(null);

  async function refetch() {
    setLoading(true);
    try { setComptes(await apiFetch("/api/mobile-marchand")); setErreur(null); }
    catch (err) { setErreur((err as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { refetch(); }, []);

  async function loadJournal(c: Compte) {
    setSelected(c);
    setJournalLoading(true);
    try { setJournal(await apiFetch(`/api/mobile-marchand/${c.id}/journal`)); }
    catch { setJournal([]); }
    finally { setJournalLoading(false); }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Comptes Mobiles Marchands</h1>
          <p className="text-sm text-gray-500 mt-0.5">{comptes.length} compte(s) enregistré(s)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={refetch} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualiser
          </button>
          {peutCreer && (
            <button onClick={() => setModalCreer(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus size={14} /> Nouveau compte
            </button>
          )}
        </div>
      </div>

      {erreur && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {erreur}
        </div>
      )}

      {!erreur && comptes.length === 0 && !loading && (
        <div className="text-center py-16 text-gray-400">
          <Smartphone size={48} className="mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">Aucun compte mobile marchand</p>
          <p className="text-sm mt-1">Créez votre premier compte Wave, Orange Money ou MTN MoMo</p>
        </div>
      )}

      {/* Vue liste + journal */}
      <div className={`grid gap-6 ${selected ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"}`}>
        {/* Cartes comptes */}
        {!selected && comptes.map(c => <CompteCard key={c.id} compte={c} onSelect={loadJournal} onEdit={peutCreer ? setModalEdit : null} />)}

        {selected && (
          <>
            {/* Liste condensée */}
            <div className="space-y-3">
              {comptes.map(c => (
                <div key={c.id}
                  onClick={() => loadJournal(c)}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selected.id === c.id ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-blue-300"}`}>
                  <OperateurBadge op={c.operateur} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{c.nom}</p>
                    <p className="text-xs text-gray-500">{FCFA(c.solde_actuel_fcfa)}</p>
                  </div>
                  {peutMouvement && selected.id === c.id && (
                    <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setModalVirement(c.id)}
                        title="Virement depuis banque"
                        className="flex items-center gap-1 px-2 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 whitespace-nowrap">
                        <ArrowRightLeft size={11} /> Virer
                      </button>
                      <button onClick={() => setModalMvt(c.id)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700 whitespace-nowrap">
                        <Plus size={11} /> Mouvement
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Journal */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold text-gray-900">{selected.nom}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <OperateurBadge op={selected.operateur} size="sm" />
                    {selected.numero_marchand && <span className="text-xs text-gray-400 font-mono">{selected.numero_marchand}</span>}
                  </div>
                </div>
                <button onClick={() => { setSelected(null); setJournal([]); }} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 mb-4">
                <p className="text-xs text-gray-400 uppercase tracking-wide">Solde actuel</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{FCFA(selected.solde_actuel_fcfa)}</p>
              </div>

              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Journal des mouvements</h3>
                {peutMouvement && (
                  <div className="flex gap-2">
                    <button onClick={() => setModalVirement(selected.id)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700">
                      <ArrowRightLeft size={11} /> Virement banque
                    </button>
                    <button onClick={() => setModalMvt(selected.id)}
                      className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                      <Plus size={11} /> Mouvement
                    </button>
                  </div>
                )}
              </div>

              {journalLoading && <p className="text-sm text-gray-400 py-4 text-center">Chargement…</p>}
              {!journalLoading && journal.length === 0 && (
                <p className="text-sm text-gray-400 py-6 text-center">Aucun mouvement enregistré</p>
              )}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {journal.map(m => (
                  <div key={m.id} className="flex items-start gap-3 p-2.5 rounded-lg hover:bg-gray-50">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${m.type === "credit" ? "bg-green-100" : "bg-red-100"}`}>
                      {m.type === "credit"
                        ? <TrendingUp size={13} className="text-green-600" />
                        : <TrendingDown size={13} className="text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800">{m.libelle ?? m.motif}</p>
                      <p className="text-xs text-gray-400">{DATE_FR(m.date_operation)}{m.reference && ` · ${m.reference}`}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-semibold ${m.type === "credit" ? "text-green-600" : "text-red-500"}`}>
                        {m.type === "credit" ? "+" : "−"}{FCFA(m.montant_fcfa)}
                      </p>
                      {m.solde_apres_fcfa && <p className="text-xs text-gray-400">{FCFA(m.solde_apres_fcfa)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      {modalCreer && (
        <ModalCompte
          onClose={() => setModalCreer(false)}
          onSave={async (data) => {
            await apiPost("/api/mobile-marchand", data);
            setModalCreer(false);
            await refetch();
            toast({ title: "Compte créé" });
          }}
        />
      )}
      {modalEdit && (
        <ModalCompte
          compte={modalEdit}
          onClose={() => setModalEdit(null)}
          onSave={async (data) => {
            await apiPut(`/api/mobile-marchand/${modalEdit.id}`, data);
            setModalEdit(null);
            const updated = await apiFetch("/api/mobile-marchand");
            setComptes(updated);
            if (selected?.id === modalEdit.id) setSelected(updated.find((c: Compte) => c.id === modalEdit.id) ?? null);
            toast({ title: "Compte mis à jour" });
          }}
        />
      )}
      {modalMvt !== null && (
        <ModalMouvement
          compteId={modalMvt}
          onClose={() => setModalMvt(null)}
          onSave={async (data) => {
            await apiPost(`/api/mobile-marchand/${modalMvt}/mouvement`, data);
            setModalMvt(null);
            const updated = await apiFetch("/api/mobile-marchand");
            setComptes(updated);
            if (selected?.id === modalMvt) {
              const updatedCompte = updated.find((c: Compte) => c.id === modalMvt);
              if (updatedCompte) { setSelected(updatedCompte); await loadJournal(updatedCompte); }
            }
            toast({ title: "Mouvement enregistré" });
          }}
        />
      )}
      {modalVirement !== null && (
        <ModalVirement
          compteId={modalVirement}
          compteName={comptes.find(c => c.id === modalVirement)?.nom ?? ""}
          onClose={() => setModalVirement(null)}
          onSave={async () => {
            setModalVirement(null);
            const updated = await apiFetch("/api/mobile-marchand");
            setComptes(updated);
            if (selected?.id === modalVirement) {
              const updatedCompte = updated.find((c: Compte) => c.id === modalVirement);
              if (updatedCompte) { setSelected(updatedCompte); await loadJournal(updatedCompte); }
            }
            toast({ title: "Virement effectué", description: "Le compte mobile a été approvisionné depuis la banque." });
          }}
        />
      )}
    </div>
  );
}

// ─── CompteCard ───────────────────────────────────────────────────────────────

function CompteCard({ compte: c, onSelect, onEdit }: {
  compte: Compte;
  onSelect: (c: Compte) => void;
  onEdit: ((c: Compte) => void) | null;
}) {
  const solde = parseFloat(c.solde_actuel_fcfa);
  const mini  = parseFloat(c.solde_mini_alerte_fcfa);
  const alerte = mini > 0 && solde < mini;

  return (
    <div onClick={() => onSelect(c)}
      className={`bg-white rounded-xl border-2 p-5 cursor-pointer hover:shadow-md transition-all ${alerte ? "border-amber-200" : "border-gray-100 hover:border-blue-300"}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">{c.nom}</h3>
          {c.numero_marchand && <p className="text-xs text-gray-400 mt-0.5 font-mono">{c.numero_marchand}</p>}
        </div>
        <div className="flex items-center gap-2">
          {alerte && <AlertTriangle className="h-4 w-4 text-amber-500" />}
          <OperateurBadge op={c.operateur} size="sm" />
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs text-gray-400 uppercase tracking-wide">Solde actuel</p>
        <p className={`text-2xl font-bold mt-1 truncate ${alerte ? "text-amber-600" : "text-gray-900"}`}>
          {FCFA(c.solde_actuel_fcfa)}
        </p>
        {alerte && <p className="text-xs text-amber-600 mt-0.5">⚠️ Sous le minimum ({FCFA(mini - solde)} de moins)</p>}
      </div>

      <div className="flex gap-2 pt-3 border-t border-gray-50">
        <button onClick={(e) => { e.stopPropagation(); onSelect(c); }}
          className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap">
          <ChevronRight size={12} /> Journal
        </button>
        {onEdit && (
          <button onClick={(e) => { e.stopPropagation(); onEdit(c); }}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-600 hover:bg-gray-50 whitespace-nowrap">
            Modifier
          </button>
        )}
      </div>
    </div>
  );
}

// ─── OperateurBadge ───────────────────────────────────────────────────────────

function OperateurBadge({ op, size = "md" }: { op: string; size?: "sm" | "md" }) {
  const cfg = OPERATEURS[op] ?? { label: op, bg: "#6b7280", color: "#fff" };
  const cls = size === "sm" ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";
  return (
    <span className={`rounded-full font-semibold ${cls}`}
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── ModalCompte ──────────────────────────────────────────────────────────────

function ModalCompte({ compte, onClose, onSave }: {
  compte?: Compte;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [nom, setNom] = useState(compte?.nom ?? "");
  const [operateur, setOperateur] = useState(compte?.operateur ?? "wave");
  const [numero, setNumero] = useState(compte?.numero_marchand ?? "");
  const [soldeInitial, setSoldeInitial] = useState(compte ? "" : "0");
  const [soldeMini, setSoldeMini] = useState(compte?.solde_mini_alerte_fcfa ? String(parseFloat(compte.solde_mini_alerte_fcfa)) : "0");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function handleSave() {
    if (!nom.trim()) { setErr("Le nom est obligatoire"); return; }
    setSaving(true); setErr("");
    try {
      await onSave({
        nom: nom.trim(),
        operateur,
        numeroMarchand: numero.trim() || null,
        ...(!compte && { soldeInitial: parseInt(soldeInitial) || 0 }),
        soldeMiniAlerte: parseInt(soldeMini) || 0,
      });
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">{compte ? "Modifier le compte" : "Nouveau compte mobile"}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Opérateur</label>
            <select value={operateur} onChange={e => setOperateur(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="wave">Wave</option>
              <option value="orange_money">Orange Money</option>
              <option value="mtn_momo">MTN MoMo</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nom du compte</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)}
              placeholder="Ex: Wave principal coopérative"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Numéro marchand <span className="text-gray-400">(optionnel)</span></label>
            <input type="text" value={numero} onChange={e => setNumero(e.target.value)}
              placeholder="Ex: M-CI-12345"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          {!compte && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Solde initial (FCFA)</label>
              <input type="number" min="0" value={soldeInitial} onChange={e => setSoldeInitial(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Solde minimum alerte (FCFA)</label>
            <input type="number" min="0" value={soldeMini} onChange={e => setSoldeMini(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 hover:bg-blue-700">
              {saving ? "Enregistrement…" : compte ? "Enregistrer" : "Créer le compte"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ModalMouvement ───────────────────────────────────────────────────────────

function ModalMouvement({ compteId: _, onClose, onSave }: {
  compteId: number;
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => Promise<void>;
}) {
  const [type, setType] = useState<"credit" | "debit">("credit");
  const [motif, setMotif] = useState("");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const motifs = type === "credit" ? MOTIFS_CREDIT : MOTIFS_DEBIT;

  async function handleSave() {
    if (!motif || !montant || parseInt(montant) <= 0) { setErr("Motif et montant requis"); return; }
    setSaving(true); setErr("");
    try {
      await onSave({ type, motif, montantFcfa: parseInt(montant), libelle: libelle || null, reference: reference || null, dateOperation: date });
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Nouveau mouvement</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            <button onClick={() => { setType("credit"); setMotif(""); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${type === "credit" ? "bg-green-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              + Crédit
            </button>
            <button onClick={() => { setType("debit"); setMotif(""); }}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${type === "debit" ? "bg-red-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
              − Débit
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Motif</label>
            <select value={motif} onChange={e => setMotif(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">— Choisir un motif —</option>
              {motifs.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Montant (FCFA)</label>
            <input type="number" min="1" value={montant} onChange={e => setMontant(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Libellé <span className="text-gray-400">(optionnel)</span></label>
            <input type="text" value={libelle} onChange={e => setLibelle(e.target.value)}
              placeholder="Description du mouvement"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Référence <span className="text-gray-400">(opt.)</span></label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                placeholder="Ex: TXN-00123"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
              Annuler
            </button>
            <button onClick={handleSave} disabled={saving}
              className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold disabled:opacity-50 ${type === "credit" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ModalVirement ─────────────────────────────────────────────────────────────

type CompteBancaire = { id: number; nom: string; banque: string; solde_actuel_fcfa: string };

function ModalVirement({ compteId, compteName, onClose, onSave }: {
  compteId: number;
  compteName: string;
  onClose: () => void;
  onSave: () => Promise<void>;
}) {
  const [comptesBancaires, setComptesBancaires] = useState<CompteBancaire[]>([]);
  const [loadingBanques, setLoadingBanques] = useState(true);
  const [compteBancaireId, setCompteBancaireId] = useState<number | "">("");
  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/mobile-marchand/comptes-bancaires")
      .then((data: CompteBancaire[]) => { setComptesBancaires(data); if (data.length === 1) setCompteBancaireId(data[0]!.id); })
      .catch(() => setErr("Impossible de charger les comptes bancaires"))
      .finally(() => setLoadingBanques(false));
  }, []);

  const soldeBanque = compteBancaireId !== ""
    ? parseFloat(comptesBancaires.find(c => c.id === compteBancaireId)?.solde_actuel_fcfa ?? "0")
    : null;

  async function handleSubmit() {
    if (!compteBancaireId) { setErr("Sélectionnez un compte bancaire"); return; }
    const m = parseFloat(montant);
    if (!m || m <= 0) { setErr("Montant invalide"); return; }
    if (soldeBanque !== null && m > soldeBanque) {
      setErr(`Solde bancaire insuffisant (${new Intl.NumberFormat("fr-FR").format(soldeBanque)} FCFA disponible)`); return;
    }
    setSaving(true); setErr(null);
    try {
      await apiPost(`/api/mobile-marchand/${compteId}/virement-banque`, {
        compteBancaireId, montantFcfa: m,
        libelle: libelle || undefined,
        reference: reference || undefined,
        dateOperation: date,
      });
      await onSave();
    } catch (e) {
      setErr((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
              <ArrowRightLeft size={16} className="text-green-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Virement depuis la banque</h2>
              <p className="text-xs text-gray-400">→ {compteName}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Compte source */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Compte bancaire source *</label>
            {loadingBanques ? (
              <div className="text-xs text-gray-400 py-2">Chargement des comptes…</div>
            ) : comptesBancaires.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                <AlertTriangle size={14} /> Aucun compte bancaire actif dans cette coopérative
              </div>
            ) : (
              <select
                value={compteBancaireId}
                onChange={e => setCompteBancaireId(e.target.value === "" ? "" : parseInt(e.target.value, 10))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400">
                <option value="">— Sélectionner un compte —</option>
                {comptesBancaires.map(cb => (
                  <option key={cb.id} value={cb.id}>
                    {cb.nom} ({cb.banque}) — {new Intl.NumberFormat("fr-FR").format(parseFloat(cb.solde_actuel_fcfa))} FCFA
                  </option>
                ))}
              </select>
            )}
            {soldeBanque !== null && (
              <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                <Landmark size={11} /> Solde disponible : <span className="font-semibold text-gray-700">{new Intl.NumberFormat("fr-FR").format(soldeBanque)} FCFA</span>
              </p>
            )}
          </div>

          {/* Montant */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Montant (FCFA) *</label>
            <input type="number" min="1" step="1" value={montant} onChange={e => setMontant(e.target.value)}
              placeholder="Ex: 500000"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400" />
          </div>

          {/* Libellé */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Libellé <span className="text-gray-400">(opt.)</span></label>
            <input type="text" value={libelle} onChange={e => setLibelle(e.target.value)}
              placeholder="Ex: Approvisionnement campagne juin"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400" />
          </div>

          {/* Référence + Date sur la même ligne */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Référence <span className="text-gray-400">(opt.)</span></label>
              <input type="text" value={reference} onChange={e => setReference(e.target.value)}
                placeholder="Ex: BON-001"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date opération</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-400" />
            </div>
          </div>

          {err && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
              <AlertTriangle size={13} /> {err}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button onClick={handleSubmit} disabled={saving || comptesBancaires.length === 0}
            className="flex-1 py-2.5 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
            <ArrowRightLeft size={14} />
            {saving ? "Virement en cours…" : "Confirmer le virement"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import {
  useGetConfigComptable,
  useUpdateConfigComptable,
  useCountEcrituresEnAttente,
  useListEcrituresEnAttente,
  useValiderEcritureEnAttente,
  useRejeterEcritureEnAttente,
  useValiderToutEcrituresEnAttente,
  useGetJournalComptable,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetConfigComptableQueryKey, getCountEcrituresEnAttenteQueryKey, getListEcrituresEnAttenteQueryKey, getGetJournalComptableQueryKey } from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Settings, Clock, BookOpen, CheckCheck, X, Edit2, ChevronLeft, ChevronRight } from "lucide-react";

const VERT = "#1a4731";
const OR = "#c4962a";
const ROUGE = "#dc2626";

const FCFA = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";

const SOURCE_LABELS: Record<string, string> = {
  livraison: "Livraisons prod.",
  paiement: "Paiements prod.",
  avance: "Avances prod.",
  vente: "Ventes export.",
  encaissement: "Encaissements",
  salaire: "Salaires",
  stock: "Stocks",
  manuel: "Manuel",
};

const STATUT_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  en_attente: { label: "En attente", bg: "#fef3c7", text: "#92400e" },
  validee:    { label: "Validée",     bg: "#dcfce7", text: "#166534" },
  rejetee:    { label: "Rejetée",     bg: "#fee2e2", text: "#991b1b" },
  modifiee:   { label: "Modifiée",    bg: "#dbeafe", text: "#1e40af" },
};

const MODULE_CONFIG = [
  { key: "autoLivraisons",   label: "Livraisons producteurs" },
  { key: "autoPaiements",    label: "Paiements producteurs" },
  { key: "autoAvances",      label: "Avances producteurs" },
  { key: "autoVentesExport", label: "Ventes exportateurs" },
  { key: "autoEncaissements",label: "Encaissements exportateurs" },
  { key: "autoSalaires",     label: "Salaires & paie" },
  { key: "autoStocks",       label: "Mouvements de stocks" },
] as const;

type ModuleKey = typeof MODULE_CONFIG[number]["key"];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none"
      style={{ backgroundColor: checked ? "#1a4731" : "#d1d5db" }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(24px)" : "translateX(4px)" }}
      />
    </button>
  );
}

// ─── Onglet Configuration ────────────────────────────────────────────────────
function OngletConfiguration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: config, isLoading } = useGetConfigComptable();
  const { mutate: updateConfig, isPending } = useUpdateConfigComptable();

  const [local, setLocal] = useState<Partial<Record<ModuleKey, boolean>>>({});

  const getValue = (key: ModuleKey): boolean => {
    if (key in local) return local[key]!;
    return (config as Record<string, boolean> | undefined)?.[key] ?? false;
  };

  const handleToggle = (key: ModuleKey, val: boolean) => {
    setLocal((prev) => ({ ...prev, [key]: val }));
  };

  const handleSave = () => {
    const payload: Record<string, boolean> = {};
    MODULE_CONFIG.forEach(({ key }) => { payload[key] = getValue(key); });
    updateConfig(
      { data: payload },
      {
        onSuccess: () => {
          setLocal({});
          void queryClient.invalidateQueries({ queryKey: getGetConfigComptableQueryKey() });
          toast({ title: "Configuration enregistrée" });
        },
        onError: () => toast({ title: "Erreur lors de la sauvegarde", variant: "destructive" }),
      }
    );
  };

  if (isLoading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>;

  const modifiePar = (config as Record<string, unknown> | undefined)?.modifiePar;
  const updatedAt = (config as Record<string, unknown> | undefined)?.updatedAt as string | null | undefined;

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-900">Paramètres de saisie comptable</h2>
        <p className="text-sm text-gray-500 mt-1">
          Choisissez pour chaque module si les écritures sont générées automatiquement
          ou soumises à validation manuelle avant enregistrement.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Module</th>
              <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Mode actuel</th>
              <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Automatique</th>
            </tr>
          </thead>
          <tbody>
            {MODULE_CONFIG.map(({ key, label }) => {
              const isAuto = getValue(key);
              return (
                <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-gray-900">{label}</span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    <span
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: isAuto ? "#dcfce7" : "#f3f4f6",
                        color: isAuto ? "#166534" : "#374151",
                      }}
                    >
                      {isAuto ? "Automatique" : "Manuel"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Toggle checked={isAuto} onChange={(v) => handleToggle(key, v)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex gap-3 rounded-xl border p-4 mb-6"
        style={{ backgroundColor: "#fffbeb", borderColor: "#fcd34d" }}
      >
        <AlertTriangle className="flex-shrink-0 mt-0.5" size={16} style={{ color: "#d97706" }} />
        <p className="text-sm" style={{ color: "#78350f" }}>
          <strong>Mode automatique :</strong> les écritures sont enregistrées dès la validation de l'opération,
          sans intervention du comptable. <strong>Mode manuel :</strong> chaque écriture apparaît dans la file
          d'attente pour relecture et validation avant comptabilisation.
        </p>
      </div>

      <div className="flex items-center justify-between">
        {updatedAt && modifiePar ? (
          <p className="text-xs text-gray-400">
            Modifié le {new Date(updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        ) : <div />}
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: VERT }}
        >
          {isPending ? "Enregistrement…" : "Enregistrer la configuration"}
        </button>
      </div>
    </div>
  );
}

// ─── Modal Modifier & Valider ─────────────────────────────────────────────────
interface EcritureItem {
  id: number;
  source: string;
  sourceId?: number | null;
  libelleProppose: string;
  compteDebitPropose: string;
  compteCreditPropose: string;
  montantFcfa: number;
  dateProposee: string;
  statut: string;
  commentaireComptable?: string | null;
  creeLe: string;
}

function ModalModifierValider({ ecriture, onClose, onDone }: { ecriture: EcritureItem; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { mutate: valider, isPending } = useValiderEcritureEnAttente();
  const [form, setForm] = useState({
    compteDebit: ecriture.compteDebitPropose,
    compteCredit: ecriture.compteCreditPropose,
    montantFcfa: ecriture.montantFcfa,
    libelle: ecriture.libelleProppose,
    commentaire: "",
  });

  const handleSubmit = () => {
    valider(
      { id: ecriture.id, data: form },
      {
        onSuccess: () => { toast({ title: "Écriture validée avec modifications" }); onDone(); },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Modifier & Valider l'écriture</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Libellé</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Compte débit</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                value={form.compteDebit}
                onChange={(e) => setForm({ ...form, compteDebit: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Compte crédit</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                value={form.compteCredit}
                onChange={(e) => setForm({ ...form, compteCredit: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Montant (FCFA)</label>
            <input
              type="number"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              value={form.montantFcfa}
              onChange={(e) => setForm({ ...form, montantFcfa: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Commentaire (optionnel)</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              rows={2}
              value={form.commentaire}
              onChange={(e) => setForm({ ...form, commentaire: e.target.value })}
              placeholder="Justification de la modification…"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "#1d4ed8" }}
          >
            {isPending ? "Validation…" : "Valider l'écriture modifiée"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Rejeter ────────────────────────────────────────────────────────────
function ModalRejeter({ ecriture, onClose, onDone }: { ecriture: EcritureItem; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const { mutate: rejeter, isPending } = useRejeterEcritureEnAttente();
  const [motif, setMotif] = useState("");

  const handleSubmit = () => {
    if (!motif.trim()) { toast({ title: "Le motif est obligatoire", variant: "destructive" }); return; }
    rejeter(
      { id: ecriture.id, data: { commentaire: motif } },
      {
        onSuccess: () => { toast({ title: "Écriture rejetée" }); onDone(); },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Rejeter l'écriture</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-sm text-red-800">
            L'opération source reste valide, mais sans contrepartie comptable.
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Motif du rejet <span className="text-red-500">*</span></label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              rows={3}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Expliquez la raison du rejet…"
            />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: ROUGE }}
          >
            {isPending ? "Rejet…" : "Rejeter l'écriture"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal Confirmer Valider Tout ─────────────────────────────────────────────
function ModalConfirmerValiderTout({ count, onClose, onConfirm, isPending }: { count: number; onClose: () => void; onConfirm: () => void; isPending: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100">
          <h3 className="font-bold text-gray-900">Valider toutes les écritures</h3>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-600">
            Valider les <strong>{count}</strong> écriture{count > 1 ? "s" : ""} en attente ?
            Elles seront enregistrées directement en comptabilité sans modification.
          </p>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
            Annuler
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}
          >
            {isPending ? "Validation…" : "Tout valider"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet Écritures en attente ──────────────────────────────────────────────
function OngletEnAttente() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtreSource, setFiltreSource] = useState("");
  const [filtreStatut, setFiltreStatut] = useState("en_attente");
  const [filtreDebut, setFiltreDebut] = useState("");
  const [filtreFin, setFiltreFin] = useState("");
  const [modalModifier, setModalModifier] = useState<EcritureItem | null>(null);
  const [modalRejeter, setModalRejeter] = useState<EcritureItem | null>(null);
  const [confirmerValiderTout, setConfirmerValiderTout] = useState(false);

  const params: Record<string, string> = {};
  if (filtreSource) params["source"] = filtreSource;
  if (filtreStatut) params["statut"] = filtreStatut;
  if (filtreDebut) params["date_debut"] = filtreDebut;
  if (filtreFin) params["date_fin"] = filtreFin;

  const { data: ecritures = [], isLoading, refetch } = useListEcrituresEnAttente(params as Parameters<typeof useListEcrituresEnAttente>[0]);
  const { data: countData } = useCountEcrituresEnAttente();
  const { mutate: validerDirect, isPending: validantDirect } = useValiderEcritureEnAttente();
  const { mutate: validerTout, isPending: validantTout } = useValiderToutEcrituresEnAttente();

  const nbEnAttente = countData?.count ?? 0;
  const list = ecritures as EcritureItem[];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: getListEcrituresEnAttenteQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getCountEcrituresEnAttenteQueryKey() });
  };

  const handleValiderDirect = (e: EcritureItem) => {
    validerDirect(
      { id: e.id, data: {} },
      {
        onSuccess: () => { toast({ title: "Écriture validée" }); invalidate(); },
        onError: () => toast({ title: "Erreur", variant: "destructive" }),
      }
    );
  };

  const handleValiderTout = () => {
    validerTout(undefined, {
      onSuccess: (data) => {
        const n = (data as { validees?: number })?.validees ?? 0;
        toast({ title: `${n} écriture${n > 1 ? "s" : ""} validée${n > 1 ? "s" : ""}` });
        setConfirmerValiderTout(false);
        invalidate();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    });
  };

  return (
    <div>
      {/* Filtres */}
      <div className="flex flex-wrap gap-3 mb-5">
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          value={filtreStatut}
          onChange={(e) => setFiltreStatut(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="en_attente">En attente</option>
          <option value="validee">Validées</option>
          <option value="rejetee">Rejetées</option>
          <option value="modifiee">Modifiées</option>
        </select>
        <select
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          value={filtreSource}
          onChange={(e) => setFiltreSource(e.target.value)}
        >
          <option value="">Tous les modules</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filtreDebut} onChange={(e) => setFiltreDebut(e.target.value)} />
        <input type="date" className="border border-gray-200 rounded-lg px-3 py-2 text-sm" value={filtreFin} onChange={(e) => setFiltreFin(e.target.value)} />

        {filtreStatut === "en_attente" && nbEnAttente > 0 && (
          <button
            onClick={() => setConfirmerValiderTout(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: VERT }}
          >
            <CheckCheck size={15} />
            Tout valider ({nbEnAttente})
          </button>
        )}
      </div>

      {/* Tableau */}
      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <Clock className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Aucune écriture trouvée</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Date", "Module", "Libellé", "Débit", "Crédit", "Montant", "Statut", "Actions"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const badge = STATUT_BADGE[e.statut] ?? STATUT_BADGE["en_attente"]!;
                  return (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(e.dateProposee).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                          {SOURCE_LABELS[e.source] ?? e.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900 max-w-[200px] truncate" title={e.libelleProppose}>
                        {e.libelleProppose}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">{e.compteDebitPropose}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{e.compteCreditPropose}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{FCFA(e.montantFcfa)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {badge.label}
                        </span>
                        {e.commentaireComptable && (
                          <p className="text-xs text-gray-400 mt-0.5 max-w-[140px] truncate" title={e.commentaireComptable}>
                            {e.commentaireComptable}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {e.statut === "en_attente" && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleValiderDirect(e)}
                              disabled={validantDirect}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                              style={{ backgroundColor: "#16a34a" }}
                              title="Valider"
                            >
                              Valider
                            </button>
                            <button
                              onClick={() => setModalModifier(e)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                              style={{ backgroundColor: "#1d4ed8" }}
                              title="Modifier & Valider"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => setModalRejeter(e)}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white"
                              style={{ backgroundColor: ROUGE }}
                              title="Rejeter"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {modalModifier && (
        <ModalModifierValider
          ecriture={modalModifier}
          onClose={() => setModalModifier(null)}
          onDone={() => { setModalModifier(null); invalidate(); void refetch(); }}
        />
      )}
      {modalRejeter && (
        <ModalRejeter
          ecriture={modalRejeter}
          onClose={() => setModalRejeter(null)}
          onDone={() => { setModalRejeter(null); invalidate(); void refetch(); }}
        />
      )}
      {confirmerValiderTout && (
        <ModalConfirmerValiderTout
          count={nbEnAttente}
          onClose={() => setConfirmerValiderTout(false)}
          onConfirm={handleValiderTout}
          isPending={validantTout}
        />
      )}
    </div>
  );
}

// ─── Onglet Journal ───────────────────────────────────────────────────────────
function OngletJournal() {
  const [page, setPage] = useState(1);
  const LIMIT = 50;
  const annee = new Date().getFullYear();

  const { data, isLoading } = useGetJournalComptable({ exercice: annee, page, limit: LIMIT });
  const ecritures = (data as { ecritures?: unknown[]; total?: number } | undefined);
  const list = ecritures?.ecritures ?? [];
  const total = ecritures?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-gray-500">{total} écriture{total > 1 ? "s" : ""} — exercice {annee}</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-gray-600">{page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>
      ) : (list as unknown[]).length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Aucune écriture pour l'exercice {annee}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {["Date", "Pièce", "Libellé", "Débit", "Crédit", "Montant", "Source"].map((h) => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(list as Array<{
                  id: number;
                  dateEcriture: string;
                  numeroPiece?: string | null;
                  libelle: string;
                  compteDebit: string;
                  compteCredit: string;
                  montantFcfa: number;
                  source: string;
                }>).map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(e.dateEcriture).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.numeroPiece ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-900 max-w-[220px] truncate" title={e.libelle}>{e.libelle}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">{e.compteDebit}</td>
                    <td className="px-4 py-3 font-mono text-gray-700">{e.compteCredit}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{FCFA(e.montantFcfa)}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        {SOURCE_LABELS[e.source] ?? e.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
type Onglet = "journal" | "en_attente" | "config";

export default function ComptabilitePage() {
  const [onglet, setOnglet] = useState<Onglet>("en_attente");
  const peutVoirConfig = usePermission("comptabilite", "voir_config");
  const peutVoirAttente = usePermission("comptabilite", "voir_ecritures_attente");
  const { data: countData } = useCountEcrituresEnAttente({ query: { queryKey: getCountEcrituresEnAttenteQueryKey(), enabled: peutVoirAttente } });
  const nbEnAttente = countData?.count ?? 0;

  const tabs: { id: Onglet; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "en_attente", label: "Écritures en attente", icon: Clock, badge: nbEnAttente > 0 ? nbEnAttente : undefined },
    { id: "journal",    label: "Journal comptable",    icon: BookOpen },
    ...(peutVoirConfig ? [{ id: "config" as Onglet, label: "Configuration", icon: Settings }] : []),
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Comptabilité</h1>
        <p className="text-sm text-gray-500 mt-1">Gestion des écritures comptables OHADA</p>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => setOnglet(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
              onglet === id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon size={15} />
            {label}
            {badge !== undefined && badge > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1"
                style={{ backgroundColor: ROUGE }}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {onglet === "en_attente" && <OngletEnAttente />}
      {onglet === "journal" && <OngletJournal />}
      {onglet === "config" && peutVoirConfig && <OngletConfiguration />}
    </div>
  );
}

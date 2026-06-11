import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient as useQC } from "@tanstack/react-query";
import {
  useGetConfigComptable,
  useUpdateConfigComptable,
  useCountEcrituresEnAttente,
  useListEcrituresEnAttente,
  useValiderEcritureEnAttente,
  useRejeterEcritureEnAttente,
  useValiderToutEcrituresEnAttente,
  useGetJournalComptable,
  useGetDevisesTaux,
  usePostDevisesTaux,
  useGetDevisesTauxHistoriqueDevise,
  useGetDevisesGainPerte,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetConfigComptableQueryKey,
  getCountEcrituresEnAttenteQueryKey,
  getListEcrituresEnAttenteQueryKey,
  getGetJournalComptableQueryKey,
  getGetDevisesTauxQueryKey,
  getGetDevisesTauxHistoriqueDeviseQueryKey,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Settings, Clock, BookOpen, CheckCheck, X, Edit2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, RefreshCw, DollarSign, List, Sliders, RotateCcw, Plus, Pencil, Ban, ChevronDown, ChevronUp, Search, RotateCw, FileText, Scale, Droplets, Lock, Download, Filter } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { type TauxChange } from "@workspace/api-client-react";

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

      {/* ── Clôture d'exercice ─────────────────────────────────── */}
      <ClotureSection />
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

// ─── Onglet Devises ───────────────────────────────────────────────────────────
const DEVISE_COLORS: Record<string, string> = { EUR: "#2563eb", USD: "#16a34a", GBP: "#9333ea" };

function OngletDevises() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const peutModifier = usePermission("devises", "modifier_taux");
  const [deviseGraphe, setDeviseGraphe] = useState<string>("EUR");
  const [modalTaux, setModalTaux] = useState(false);
  const [formTaux, setFormTaux] = useState({ deviseSource: "EUR", taux: "", dateApplication: new Date().toISOString().slice(0, 10), sourceTaux: "BCEAO" as "BCEAO" | "manuel" | "COFACE" });

  const { data: tauxActuels = [] } = useGetDevisesTaux({ query: { queryKey: getGetDevisesTauxQueryKey() } });
  const { data: historique = [] } = useGetDevisesTauxHistoriqueDevise(deviseGraphe, {
    query: { queryKey: getGetDevisesTauxHistoriqueDeviseQueryKey(deviseGraphe) },
  });
  const { data: rapport } = useGetDevisesGainPerte();

  const mutTaux = usePostDevisesTaux({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDevisesTauxQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDevisesTauxHistoriqueDeviseQueryKey(formTaux.deviseSource) });
        setModalTaux(false);
        setFormTaux({ deviseSource: "EUR", taux: "", dateApplication: new Date().toISOString().slice(0, 10), sourceTaux: "BCEAO" });
        toast({ title: "Taux enregistré", description: "Le nouveau taux de change a été saisi." });
      },
      onError: () => toast({ title: "Erreur", description: "Impossible de sauvegarder le taux.", variant: "destructive" }),
    },
  });

  const graphData = (historique as TauxChange[]).map((h) => ({
    date: h.date_application ? new Date(h.date_application).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "",
    taux: parseFloat(h.taux ?? "0"),
  }));

  const details = (rapport as { details?: Record<string, unknown>[] } | undefined)?.details ?? [];
  const totalGain = (rapport as { totalGain?: number } | undefined)?.totalGain ?? 0;
  const totalPerte = (rapport as { totalPerte?: number } | undefined)?.totalPerte ?? 0;
  const soldeNet = (rapport as { soldeNet?: number } | undefined)?.soldeNet ?? 0;
  const ecritures = (rapport as { ecrituresComptables?: { debit: string; credit: string; montant: number; libelle: string }[] } | undefined)?.ecrituresComptables ?? [];

  return (
    <div className="space-y-6">
      {/* Tableau taux actuels */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900">Taux de change actuels</h3>
            <p className="text-xs text-gray-400 mt-0.5">Un taux par devise — source BCEAO ou saisie manuelle</p>
          </div>
          {peutModifier && (
            <button
              onClick={() => setModalTaux(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white rounded-lg"
              style={{ backgroundColor: VERT }}
            >
              <RefreshCw size={14} />
              Mettre à jour
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Devise</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Taux (1 → FCFA)</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {tauxActuels.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-gray-400 text-sm">Aucun taux enregistré</td></tr>
              ) : (tauxActuels as TauxChange[]).map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 font-semibold text-gray-900">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: DEVISE_COLORS[t.devise_source] ?? "#6b7280" }}
                      />
                      {t.devise_source} → {t.devise_cible}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                    {parseFloat(t.taux).toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {new Date(t.date_application).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      {t.source_taux}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historique graphique */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900">Historique 12 mois</h3>
            <p className="text-xs text-gray-400 mt-0.5">Évolution du taux vers FCFA</p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {["EUR", "USD", "GBP"].map((d) => (
              <button
                key={d}
                onClick={() => setDeviseGraphe(d)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${deviseGraphe === d ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        {graphData.length < 2 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Pas assez de données pour {deviseGraphe}</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={graphData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: number) => [`${v.toLocaleString("fr-FR", { minimumFractionDigits: 3 })} FCFA`, `1 ${deviseGraphe}`]}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="taux"
                name={`1 ${deviseGraphe} (FCFA)`}
                stroke={DEVISE_COLORS[deviseGraphe] ?? "#6b7280"}
                strokeWidth={2}
                dot={graphData.length < 15}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Rapport gains/pertes */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Gains / Pertes de change — campagne en cours</h3>
          <p className="text-xs text-gray-400 mt-0.5">Ventes exportateurs en devise étrangère vs FCFA</p>
        </div>
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-green-600" />
              <span className="text-xs text-gray-500 font-medium">Gains de change</span>
            </div>
            <p className="text-xl font-bold text-green-700">{FCFA(totalGain)}</p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={16} className="text-red-600" />
              <span className="text-xs text-gray-500 font-medium">Pertes de change</span>
            </div>
            <p className="text-xl font-bold text-red-700">{FCFA(totalPerte)}</p>
          </div>
          <div className={`rounded-lg p-4 ${soldeNet >= 0 ? "bg-blue-50" : "bg-orange-50"}`}>
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className={soldeNet >= 0 ? "text-blue-600" : "text-orange-600"} />
              <span className="text-xs text-gray-500 font-medium">Solde net</span>
            </div>
            <p className={`text-xl font-bold ${soldeNet >= 0 ? "text-blue-700" : "text-orange-700"}`}>{FCFA(Math.abs(soldeNet))}</p>
          </div>
        </div>

        {details.length > 0 && (
          <div className="px-5 pb-5">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Détail par exportateur</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 rounded-lg">
                    <th className="text-left px-3 py-2 font-medium text-gray-500">Exportateur</th>
                    <th className="text-center px-3 py-2 font-medium text-gray-500">Devise</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Facturé (FCFA)</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Converti (FCFA)</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-500">Gain / Perte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(details as Record<string, unknown>[]).map((d, i) => {
                    const gp = Number(d["totalGainPerte"] ?? 0);
                    return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900">{String(d["exportateurNom"] ?? "—")}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ backgroundColor: `${DEVISE_COLORS[String(d["devise"] ?? "")] ?? "#6b7280"}20`, color: DEVISE_COLORS[String(d["devise"] ?? "")] ?? "#6b7280" }}>
                            {String(d["devise"] ?? "—")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{FCFA(Number(d["totalMontantFcfa"] ?? 0))}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{FCFA(Number(d["totalConverti"] ?? 0))}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${gp >= 0 ? "text-green-700" : "text-red-700"}`}>
                          {gp >= 0 ? "+" : ""}{FCFA(gp)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {ecritures.length > 0 && (
          <div className="mx-5 mb-5 border border-blue-100 rounded-lg bg-blue-50 p-4">
            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-2">Écriture comptable suggérée (OHADA)</p>
            {ecritures.map((e, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-blue-900">
                <span className="font-mono font-semibold">{e.debit}</span>
                <span className="text-blue-400">/</span>
                <span className="font-mono font-semibold">{e.credit}</span>
                <span className="text-blue-600 ml-2">{FCFA(e.montant)}</span>
                <span className="text-blue-500 text-xs">— {e.libelle}</span>
              </div>
            ))}
          </div>
        )}

        {details.length === 0 && (
          <div className="px-5 pb-5 text-sm text-gray-400">
            Aucune vente en devise étrangère enregistrée sur la campagne.
          </div>
        )}
      </div>

      {/* Modal saisie taux */}
      {modalTaux && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Mettre à jour le taux</h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Devise</label>
                <select
                  value={formTaux.deviseSource}
                  onChange={(e) => setFormTaux((f) => ({ ...f, deviseSource: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                >
                  <option value="EUR">EUR — Euro</option>
                  <option value="USD">USD — Dollar américain</option>
                  <option value="GBP">GBP — Livre sterling</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nouveau taux (1 {formTaux.deviseSource} = ? FCFA)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={formTaux.taux}
                  onChange={(e) => setFormTaux((f) => ({ ...f, taux: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  placeholder="ex : 655.957"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date d'application</label>
                <input
                  type="date"
                  value={formTaux.dateApplication}
                  onChange={(e) => setFormTaux((f) => ({ ...f, dateApplication: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
                <select
                  value={formTaux.sourceTaux}
                  onChange={(e) => setFormTaux((f) => ({ ...f, sourceTaux: e.target.value as typeof formTaux.sourceTaux }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                >
                  <option value="BCEAO">BCEAO</option>
                  <option value="manuel">Saisie manuelle</option>
                  <option value="COFACE">COFACE</option>
                </select>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setModalTaux(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
              <button
                onClick={() => mutTaux.mutate({ data: { deviseSource: formTaux.deviseSource, taux: parseFloat(formTaux.taux), dateApplication: formTaux.dateApplication, sourceTaux: formTaux.sourceTaux } })}
                disabled={!formTaux.taux || mutTaux.isPending}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: VERT }}
              >
                {mutTaux.isPending ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Plan comptable — helpers API ────────────────────────────────────────────
const _BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const hdr = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${_BASE}${path}`, { headers: hdr() });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erreur?: string }).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${_BASE}${path}`, { method: "POST", headers: hdr(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erreur?: string }).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}
async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(`${_BASE}${path}`, { method: "PUT", headers: hdr(), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erreur?: string }).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}
async function apiDelete<T>(path: string): Promise<T> {
  const r = await fetch(`${_BASE}${path}`, { method: "DELETE", headers: hdr() });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { erreur?: string }).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ComptePC {
  id: number; cooperativeId: number; numeroCompte: string; libelle: string;
  type: string; classe: number | null; soldeNormal: string; actif: boolean; ordreAffichage: number | null;
}
interface ParamModule {
  id: number; module: string; operation: string; compteDebit: string;
  compteCredit: string; libelleEcritureAuto: string | null; actif: boolean; updatedAt: string | null;
}
interface EcriturePC {
  id: number; dateEcriture: string; numeroPiece: string | null; libelle: string;
  compteDebit: string; compteCredit: string; montantFcfa: number;
  source: string; typeEcriture: string; ecritureSourceId: number | null;
  motifCorrection: string | null; corrigePar: number | null;
}

const TYPES_COMPTE: Record<string, { label: string; color: string }> = {
  actif:   { label: "Actif",   color: "#1d4ed8" },
  passif:  { label: "Passif",  color: "#7e22ce" },
  charge:  { label: "Charge",  color: "#b45309" },
  produit: { label: "Produit", color: "#166534" },
};

const CLASSES_OHADA: Record<number, string> = {
  1: "Classe 1 — Capitaux",
  2: "Classe 2 — Immobilisations",
  3: "Classe 3 — Stocks",
  4: "Classe 4 — Tiers",
  5: "Classe 5 — Trésorerie",
  6: "Classe 6 — Charges",
  7: "Classe 7 — Produits",
};

const MODULES_LABELS: Record<string, string> = {
  livraisons:     "Livraisons producteurs",
  avances:        "Avances producteurs",
  ventes_export:  "Ventes exportateurs",
  salaires:       "Salaires & paie",
  dons:           "Dons & subventions",
  intrants:       "Intrants agricoles",
  emprunts:       "Emprunts bancaires",
  transport:      "Transport & logistique",
  amortissements: "Amortissements",
  parts_sociales: "Parts sociales",
};

// ─── Onglet A — Plan comptable ─────────────────────────────────────────────────
function OngletPlanComptable() {
  const qc = useQC();
  const { toast } = useToast();
  const peutAjouter = usePermission("comptabilite", "ajouter_compte");
  const peutModifier = usePermission("comptabilite", "modifier_compte");
  const peutDesactiver = usePermission("comptabilite", "desactiver_compte");

  const [search, setSearch] = useState("");
  const [classeFiltre, setClasseFiltre] = useState<string>("");
  const [typeFiltre, setTypeFiltre] = useState<string>("");
  const [showInactifs, setShowInactifs] = useState(false);
  const [modalCreate, setModalCreate] = useState(false);
  const [editCompte, setEditCompte] = useState<ComptePC | null>(null);
  const [form, setForm] = useState({ numeroCompte: "", libelle: "", type: "actif", classe: "" });
  const [editLibelle, setEditLibelle] = useState("");

  const { data: comptes = [], isLoading } = useQuery<ComptePC[]>({
    queryKey: ["plan-comptable"],
    queryFn: () => apiFetch<ComptePC[]>("/api/comptabilite/plan"),
  });

  const mutCreate = useMutation({
    mutationFn: () => apiPost("/api/comptabilite/plan", {
      ...form,
      classe: form.classe ? parseInt(form.classe) : undefined,
    }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plan-comptable"] });
      toast({ description: "Compte créé avec succès." });
      setModalCreate(false);
      setForm({ numeroCompte: "", libelle: "", type: "actif", classe: "" });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const mutUpdate = useMutation({
    mutationFn: ({ id, libelle }: { id: number; libelle: string }) =>
      apiPut(`/api/comptabilite/plan/${id}`, { libelle }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plan-comptable"] });
      toast({ description: "Libellé mis à jour." });
      setEditCompte(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const mutDesactiver = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/comptabilite/plan/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plan-comptable"] });
      toast({ description: "Compte désactivé." });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const filtres = comptes.filter((c) => {
    if (!showInactifs && !c.actif) return false;
    if (classeFiltre && String(c.classe) !== classeFiltre) return false;
    if (typeFiltre && c.type !== typeFiltre) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!c.numeroCompte.toLowerCase().includes(s) && !c.libelle.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const parClasse = filtres.reduce<Record<number, ComptePC[]>>((acc, c) => {
    const cl = c.classe ?? 0;
    if (!acc[cl]) acc[cl] = [];
    acc[cl]!.push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Barre de filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher numéro ou libellé…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
          />
        </div>
        <select
          value={classeFiltre}
          onChange={(e) => setClasseFiltre(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Toutes classes</option>
          {[1,2,3,4,5,6,7].map((n) => <option key={n} value={String(n)}>Classe {n}</option>)}
        </select>
        <select
          value={typeFiltre}
          onChange={(e) => setTypeFiltre(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          <option value="">Tous types</option>
          {Object.entries(TYPES_COMPTE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showInactifs} onChange={(e) => setShowInactifs(e.target.checked)} />
          Voir inactifs
        </label>
        {peutAjouter && (
          <button
            onClick={() => setModalCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white ml-auto"
            style={{ backgroundColor: VERT }}
          >
            <Plus size={14} /> Nouveau compte
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : Object.keys(parClasse).length === 0 ? (
        <div className="text-center py-12 text-gray-400">Aucun compte trouvé.</div>
      ) : (
        Object.entries(parClasse)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([cl, rows]) => (
            <div key={cl} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span className="font-semibold text-xs text-gray-600 uppercase tracking-wide">
                  {CLASSES_OHADA[parseInt(cl)] ?? `Classe ${cl}`}
                </span>
                <span className="ml-auto text-xs text-gray-400">{rows.length} compte{rows.length > 1 ? "s" : ""}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                    <th className="text-left px-4 py-2 font-medium">N°</th>
                    <th className="text-left px-4 py-2 font-medium">Libellé</th>
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-left px-4 py-2 font-medium">Solde normal</th>
                    <th className="text-left px-4 py-2 font-medium">Statut</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.sort((a,b) => a.numeroCompte.localeCompare(b.numeroCompte)).map((c) => (
                    <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 ${!c.actif ? "opacity-50" : ""}`}>
                      <td className="px-4 py-2.5 font-mono font-semibold text-gray-800">{c.numeroCompte}</td>
                      <td className="px-4 py-2.5 text-gray-700">
                        {editCompte?.id === c.id ? (
                          <input
                            autoFocus
                            value={editLibelle}
                            onChange={(e) => setEditLibelle(e.target.value)}
                            className="border border-green-700 rounded px-2 py-0.5 text-sm w-full"
                            onKeyDown={(e) => {
                              if (e.key === "Enter") mutUpdate.mutate({ id: c.id, libelle: editLibelle });
                              if (e.key === "Escape") setEditCompte(null);
                            }}
                          />
                        ) : c.libelle}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{ background: TYPES_COMPTE[c.type]?.color + "22", color: TYPES_COMPTE[c.type]?.color }}>
                          {TYPES_COMPTE[c.type]?.label ?? c.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 capitalize">{c.soldeNormal}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.actif ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                          {c.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 justify-end">
                          {editCompte?.id === c.id ? (
                            <>
                              <button onClick={() => mutUpdate.mutate({ id: c.id, libelle: editLibelle })}
                                className="text-xs px-2 py-1 rounded bg-green-700 text-white font-medium">
                                Sauver
                              </button>
                              <button onClick={() => setEditCompte(null)} className="text-xs px-2 py-1 rounded border text-gray-500">Annuler</button>
                            </>
                          ) : (
                            <>
                              {peutModifier && c.actif && (
                                <button onClick={() => { setEditCompte(c); setEditLibelle(c.libelle); }}
                                  className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                                  <Pencil size={13} />
                                </button>
                              )}
                              {peutDesactiver && c.actif && (
                                <button onClick={() => { if (confirm(`Désactiver le compte ${c.numeroCompte} ?`)) mutDesactiver.mutate(c.id); }}
                                  className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                                  <Ban size={13} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
      )}

      {/* Modal créer compte */}
      {modalCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Nouveau compte OHADA</h3>
              <button onClick={() => setModalCreate(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {([["Numéro de compte", "numeroCompte", "ex : 6025"], ["Libellé", "libelle", "ex : Achats hévéa brut"]] as const).map(([label, key, ph]) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    value={form[key]}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={ph}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="actif">Actif</option>
                    <option value="passif">Passif</option>
                    <option value="charge">Charge</option>
                    <option value="produit">Produit</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Classe (optionnel)</label>
                  <select value={form.classe} onChange={(e) => setForm((f) => ({ ...f, classe: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                    <option value="">Auto</option>
                    {[1,2,3,4,5,6,7].map((n) => <option key={n} value={String(n)}>{n}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-3">
              <button onClick={() => setModalCreate(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
              <button
                onClick={() => mutCreate.mutate()}
                disabled={!form.numeroCompte || !form.libelle || mutCreate.isPending}
                className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ backgroundColor: VERT }}
              >
                {mutCreate.isPending ? "Création…" : "Créer le compte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet B — Comptes des modules ──────────────────────────────────────────
function OngletComptesModules() {
  const qc = useQC();
  const { toast } = useToast();
  const peutModifier = usePermission("comptabilite", "modifier_params");
  const peutReset = usePermission("comptabilite", "reset_ohada");

  const { data: params = [], isLoading } = useQuery<ParamModule[]>({
    queryKey: ["params-comptes-modules"],
    queryFn: () => apiFetch<ParamModule[]>("/api/comptabilite/params"),
  });

  const [ouverts, setOuverts] = useState<Record<string, boolean>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ compteDebit: "", compteCredit: "", libelleEcritureAuto: "" });

  const toggleModule = (m: string) => setOuverts((o) => ({ ...o, [m]: !o[m] }));

  const mutUpdate = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof editForm }) =>
      apiPut(`/api/comptabilite/params/${id}`, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["params-comptes-modules"] });
      toast({ description: "Paramètre mis à jour." });
      setEditId(null);
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const mutReset = useMutation({
    mutationFn: (module: string) => apiPost(`/api/comptabilite/params/reset/${module}`, {}),
    onSuccess: (_, module) => {
      void qc.invalidateQueries({ queryKey: ["params-comptes-modules"] });
      toast({ description: `Module "${module}" réinitialisé avec les valeurs OHADA.` });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const parModule = params.reduce<Record<string, ParamModule[]>>((acc, p) => {
    if (!acc[p.module]) acc[p.module] = [];
    acc[p.module]!.push(p);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Configurez les comptes OHADA utilisés automatiquement par chaque module lors de la génération d'écritures.
      </p>
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : (
        Object.entries(parModule)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([module, rows]) => {
            const open = ouverts[module] ?? false;
            return (
              <div key={module} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => toggleModule(module)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <Sliders size={15} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    <span className="font-semibold text-sm text-gray-800">
                      {MODULES_LABELS[module] ?? module}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">{rows.length} opération{rows.length > 1 ? "s" : ""}</span>
                  </div>
                  {peutReset && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Réinitialiser le module "${MODULES_LABELS[module] ?? module}" avec les valeurs OHADA par défaut ?`))
                          mutReset.mutate(module);
                      }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-amber-400 hover:text-amber-600 mr-2"
                    >
                      <RotateCcw size={11} /> Réinitialiser OHADA
                    </button>
                  )}
                  {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </button>
                {open && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                          <th className="text-left px-4 py-2 font-medium">Opération</th>
                          <th className="text-left px-4 py-2 font-medium">Débit</th>
                          <th className="text-left px-4 py-2 font-medium">Crédit</th>
                          <th className="text-left px-4 py-2 font-medium">Libellé auto</th>
                          <th className="px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.sort((a,b) => a.operation.localeCompare(b.operation)).map((p) => (
                          <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-2.5 text-gray-700 font-mono text-xs">{p.operation}</td>
                            {editId === p.id ? (
                              <>
                                <td className="px-4 py-1.5">
                                  <input value={editForm.compteDebit}
                                    onChange={(e) => setEditForm((f) => ({ ...f, compteDebit: e.target.value }))}
                                    className="w-20 border border-gray-200 rounded px-2 py-1 text-sm font-mono" />
                                </td>
                                <td className="px-4 py-1.5">
                                  <input value={editForm.compteCredit}
                                    onChange={(e) => setEditForm((f) => ({ ...f, compteCredit: e.target.value }))}
                                    className="w-20 border border-gray-200 rounded px-2 py-1 text-sm font-mono" />
                                </td>
                                <td className="px-4 py-1.5">
                                  <input value={editForm.libelleEcritureAuto}
                                    onChange={(e) => setEditForm((f) => ({ ...f, libelleEcritureAuto: e.target.value }))}
                                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                                </td>
                                <td className="px-4 py-1.5">
                                  <div className="flex gap-2">
                                    <button onClick={() => mutUpdate.mutate({ id: p.id, data: editForm })}
                                      className="text-xs px-2 py-1 rounded bg-green-700 text-white font-medium">
                                      ✓
                                    </button>
                                    <button onClick={() => setEditId(null)} className="text-xs px-2 py-1 rounded border text-gray-500">✗</button>
                                  </div>
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="px-4 py-2.5 font-mono font-semibold text-blue-700">{p.compteDebit}</td>
                                <td className="px-4 py-2.5 font-mono font-semibold text-purple-700">{p.compteCredit}</td>
                                <td className="px-4 py-2.5 text-gray-500 text-xs">{p.libelleEcritureAuto ?? "—"}</td>
                                <td className="px-4 py-2.5 text-right">
                                  {peutModifier && (
                                    <button
                                      onClick={() => { setEditId(p.id); setEditForm({ compteDebit: p.compteDebit, compteCredit: p.compteCredit, libelleEcritureAuto: p.libelleEcritureAuto ?? "" }); }}
                                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                                      <Pencil size={13} />
                                    </button>
                                  )}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
      )}
    </div>
  );
}

// ─── Onglet C — Corriger une écriture ────────────────────────────────────────
function OngletCorrigerEcriture() {
  const qc = useQC();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selected, setSelected] = useState<EcriturePC | null>(null);
  const [historique, setHistorique] = useState<{ original: EcriturePC; corrections: EcriturePC[] } | null>(null);
  const [showHistorique, setShowHistorique] = useState(false);
  const [form, setForm] = useState({
    nouveauCompteDebit: "", nouveauCompteCredit: "",
    nouveauMontant: "", nouveauLibelle: "", motifCorrection: "",
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const { data: resultats = [] } = useQuery<EcriturePC[]>({
    queryKey: ["ecritures-search", searchQuery],
    queryFn: () => searchQuery.length >= 2
      ? apiFetch<EcriturePC[]>(`/api/comptabilite/ecritures/search?q=${encodeURIComponent(searchQuery)}`)
      : Promise.resolve([]),
    enabled: searchQuery.length >= 2,
  });

  const mutCorrect = useMutation({
    mutationFn: (id: number) => apiPut(`/api/comptabilite/ecritures/${id}/corriger`, {
      nouveauCompteDebit:  form.nouveauCompteDebit || undefined,
      nouveauCompteCredit: form.nouveauCompteCredit || undefined,
      nouveauMontant:      form.nouveauMontant ? parseInt(form.nouveauMontant) : undefined,
      nouveauLibelle:      form.nouveauLibelle || undefined,
      motifCorrection:     form.motifCorrection,
    }),
    onSuccess: () => {
      toast({ description: "Contre-passation + écriture corrective enregistrées." });
      setSelected(null);
      setForm({ nouveauCompteDebit: "", nouveauCompteCredit: "", nouveauMontant: "", nouveauLibelle: "", motifCorrection: "" });
      setSearchQuery("");
      void qc.invalidateQueries({ queryKey: ["ecritures-search"] });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });

  const chargerHistorique = async (e: EcriturePC) => {
    try {
      const h = await apiFetch<{ original: EcriturePC; corrections: EcriturePC[] }>(`/api/comptabilite/ecritures/${e.id}/historique`);
      setHistorique(h);
      setShowHistorique(true);
    } catch (err) {
      toast({ variant: "destructive", description: (err as Error).message });
    }
  };

  const TYPE_BADGE: Record<string, { label: string; bg: string; text: string }> = {
    normale:     { label: "Normale",     bg: "#f0fdf4", text: "#166534" },
    annulation:  { label: "Annulation",  bg: "#fef3c7", text: "#92400e" },
    correction:  { label: "Correction",  bg: "#dbeafe", text: "#1e40af" },
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-gray-500 mb-4">
          La correction crée une <strong>contre-passation</strong> (annulation) puis une <strong>écriture corrective</strong>.
          L'écriture originale est conservée dans l'audit trail complet.
        </p>

        {/* Recherche écriture */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          <label className="block text-sm font-semibold text-gray-700">1. Sélectionner l'écriture à corriger</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (debounceRef.current) clearTimeout(debounceRef.current);
              }}
              placeholder="Rechercher par libellé ou numéro de pièce…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
            />
          </div>
          {resultats.length > 0 && !selected && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {resultats.map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setSelected(e); setForm((f) => ({ ...f, nouveauMontant: String(e.montantFcfa) })); }}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 ${e.typeEcriture !== "normale" ? "opacity-50" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{e.dateEcriture}</span>
                      <span className="font-mono text-xs text-gray-500">{e.numeroPiece ?? `#${e.id}`}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ background: TYPE_BADGE[e.typeEcriture]?.bg, color: TYPE_BADGE[e.typeEcriture]?.text }}>
                        {TYPE_BADGE[e.typeEcriture]?.label ?? e.typeEcriture}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800 mt-0.5 truncate">{e.libelle}</p>
                    <p className="text-xs text-gray-500">
                      <span className="font-mono">{e.compteDebit}</span>
                      <span className="mx-1">→</span>
                      <span className="font-mono">{e.compteCredit}</span>
                      <span className="ml-2 font-semibold">{FCFA(e.montantFcfa)}</span>
                    </p>
                  </div>
                  {e.typeEcriture !== "normale" && <span className="text-xs text-red-400">Non corrigeable</span>}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-amber-700 font-semibold">Écriture sélectionnée</p>
                <p className="text-sm text-amber-900 mt-0.5">{selected.libelle}</p>
                <p className="text-xs text-amber-700 font-mono">{selected.compteDebit} → {selected.compteCredit} — {FCFA(selected.montantFcfa)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => chargerHistorique(selected)}
                  className="text-xs px-2 py-1 rounded border border-amber-300 text-amber-700 hover:bg-amber-100">
                  Historique
                </button>
                <button onClick={() => setSelected(null)} className="p-1 rounded hover:bg-amber-100 text-amber-600"><X size={14} /></button>
              </div>
            </div>
          )}
        </div>

        {/* Formulaire de correction */}
        {selected && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-4 mt-4">
            <label className="block text-sm font-semibold text-gray-700">2. Paramètres de la correction (laissez vide pour conserver l'original)</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nouveau compte débit <span className="text-gray-400">(actuellement : {selected.compteDebit})</span>
                </label>
                <input value={form.nouveauCompteDebit}
                  onChange={(e) => setForm((f) => ({ ...f, nouveauCompteDebit: e.target.value }))}
                  placeholder={selected.compteDebit}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-700" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nouveau compte crédit <span className="text-gray-400">(actuellement : {selected.compteCredit})</span>
                </label>
                <input value={form.nouveauCompteCredit}
                  onChange={(e) => setForm((f) => ({ ...f, nouveauCompteCredit: e.target.value }))}
                  placeholder={selected.compteCredit}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-700" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Nouveau montant FCFA <span className="text-gray-400">(actuellement : {FCFA(selected.montantFcfa)})</span>
                </label>
                <input type="number" value={form.nouveauMontant}
                  onChange={(e) => setForm((f) => ({ ...f, nouveauMontant: e.target.value }))}
                  placeholder={String(selected.montantFcfa)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nouveau libellé</label>
                <input value={form.nouveauLibelle}
                  onChange={(e) => setForm((f) => ({ ...f, nouveauLibelle: e.target.value }))}
                  placeholder={selected.libelle}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motif de correction <span className="text-red-500">*</span></label>
              <textarea
                value={form.motifCorrection}
                onChange={(e) => setForm((f) => ({ ...f, motifCorrection: e.target.value }))}
                placeholder="Expliquez la raison de cette correction…"
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 resize-none"
              />
            </div>
            <button
              onClick={() => mutCorrect.mutate(selected.id)}
              disabled={!form.motifCorrection || mutCorrect.isPending}
              className="w-full py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ backgroundColor: VERT }}
            >
              {mutCorrect.isPending ? <RotateCw size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              {mutCorrect.isPending ? "Correction en cours…" : "Appliquer la correction (contre-passation + nouvelle écriture)"}
            </button>
          </div>
        )}
      </div>

      {/* Modal historique */}
      {showHistorique && historique && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">Historique des corrections</h3>
              <button onClick={() => setShowHistorique(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="px-6 py-5 space-y-3 max-h-[60vh] overflow-y-auto">
              {[historique.original, ...historique.corrections].map((e) => (
                <div key={e.id} className="border border-gray-100 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400">{e.dateEcriture}</span>
                    <span className="font-mono text-xs text-gray-500">{e.numeroPiece ?? `#${e.id}`}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ background: { normale: "#f0fdf4", annulation: "#fef3c7", correction: "#dbeafe" }[e.typeEcriture] ?? "#f3f4f6",
                               color: { normale: "#166534", annulation: "#92400e", correction: "#1e40af" }[e.typeEcriture] ?? "#374151" }}>
                      {{ normale: "Originale", annulation: "Contre-passation", correction: "Correction" }[e.typeEcriture] ?? e.typeEcriture}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800">{e.libelle}</p>
                  <p className="text-xs text-gray-500 font-mono">{e.compteDebit} → {e.compteCredit} — {FCFA(e.montantFcfa)}</p>
                  {e.motifCorrection && <p className="text-xs text-amber-700 mt-1 italic">Motif : {e.motifCorrection}</p>}
                </div>
              ))}
            </div>
            <div className="px-6 pb-5">
              <button onClick={() => setShowHistorique(false)}
                className="w-full py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Plan comptable (avec 3 sous-onglets) ──────────────────────────────
type SousOngletPlan = "plan" | "modules" | "corriger";

function OngletPlanComptableContainer() {
  const [sousOnglet, setSousOnglet] = useState<SousOngletPlan>("plan");
  const peutVoirPlan = usePermission("comptabilite", "voir_plan");
  const peutVoirParams = usePermission("comptabilite", "voir_params");
  const peutCorriger = usePermission("comptabilite", "corriger");

  const sousOnglets: { id: SousOngletPlan; label: string; visible: boolean }[] = [
    { id: "plan",     label: "Plan comptable",     visible: peutVoirPlan },
    { id: "modules",  label: "Comptes des modules", visible: peutVoirParams },
    { id: "corriger", label: "Corriger une écriture", visible: peutCorriger },
  ];

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 mb-5 -mt-1">
        {sousOnglets.filter((s) => s.visible).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setSousOnglet(id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              sousOnglet === id
                ? "border-green-700 text-green-800"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sousOnglet === "plan"     && peutVoirPlan    && <OngletPlanComptable />}
      {sousOnglet === "modules"  && peutVoirParams  && <OngletComptesModules />}
      {sousOnglet === "corriger" && peutCorriger     && <OngletCorrigerEcriture />}
    </div>
  );
}

// ─── Widget taux de change (header) ───────────────────────────────────────────
export function WidgetTauxChange() {
  const { data: tauxActuels = [] } = useGetDevisesTaux({ query: { queryKey: getGetDevisesTauxQueryKey() } });
  const peutVoir = usePermission("devises", "voir_taux");
  if (!peutVoir || tauxActuels.length === 0) return null;

  const pertinentes = (tauxActuels as TauxChange[]).filter((t) => t.devise_source !== "XOF");
  const derniereMaj = pertinentes[0]?.date_application;
  const today = new Date().toISOString().slice(0, 10);
  const majLabel = derniereMaj === today ? "aujourd'hui" : derniereMaj ? new Date(derniereMaj).toLocaleDateString("fr-FR") : "—";

  return (
    <div className="flex items-center gap-3 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
      <span className="font-medium text-gray-400">Taux</span>
      {pertinentes.map((t) => (
        <span key={t.devise_source} className="flex items-center gap-1">
          <span className="font-semibold text-gray-700">
            1 {t.devise_source} = {parseFloat(t.taux).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} FCFA
          </span>
        </span>
      ))}
      <span className="text-gray-400 border-l border-gray-200 pl-3">Mis à jour : {majLabel}</span>
    </div>
  );
}

// ─── Export CSV helper ────────────────────────────────────────────────────────
function exportCSV(filename: string, headers: string[], rows: string[][]): void {
  const bom = "\uFEFF";
  const lines = [headers.join(";"), ...rows.map((r) => r.map((c) => c.includes(";") ? `"${c}"` : c).join(";"))];
  const blob = new Blob([bom + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Onglet Grand-livre ───────────────────────────────────────────────────────
interface GrandLivreLigne {
  id: number; dateEcriture: string; numeroPiece: string | null; libelle: string;
  compteDebit: string; compteCredit: string; montantFcfa: number; source: string; exercice: number;
}

function OngletGrandLivre() {
  const anneeActuelle = new Date().getFullYear();
  const [exercice, setExercice] = useState(anneeActuelle);
  const [compte, setCompte] = useState("");
  const [compteFiltre, setCompteFiltre] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const params = new URLSearchParams({ exercice: String(exercice), page: String(page), limit: String(LIMIT) });
  if (compteFiltre) params.set("compte", compteFiltre);

  const { data, isLoading } = useQuery({
    queryKey: ["grand-livre", exercice, compteFiltre, page],
    queryFn: () => apiFetch<{ ecritures: GrandLivreLigne[]; total: number }>(`/api/comptabilite/grand-livre?${params.toString()}`),
  });

  const list = data?.ecritures ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const annees = Array.from({ length: 5 }, (_, i) => anneeActuelle - i);

  const handleFilter = () => { setCompteFiltre(compte); setPage(1); };

  const handleExport = () => {
    exportCSV(
      `grand_livre_${exercice}${compteFiltre ? "_" + compteFiltre : ""}.csv`,
      ["Date", "Pièce", "Libellé", "Compte Débit", "Compte Crédit", "Montant FCFA", "Source"],
      list.map((e) => [
        new Date(e.dateEcriture).toLocaleDateString("fr-FR"),
        e.numeroPiece ?? "",
        e.libelle.replace(/;/g, ","),
        e.compteDebit,
        e.compteCredit,
        String(e.montantFcfa),
        SOURCE_LABELS[e.source] ?? e.source,
      ])
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Exercice</label>
          <select value={exercice} onChange={(e) => { setExercice(Number(e.target.value)); setPage(1); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700">
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Compte (optionnel)</label>
            <input type="text" value={compte} onChange={(e) => setCompte(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFilter()}
              placeholder="ex : 401"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 w-28" />
          </div>
          <button onClick={handleFilter}
            className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 flex items-center gap-1.5">
            <Filter size={14} /> Filtrer
          </button>
          {compteFiltre && (
            <button onClick={() => { setCompte(""); setCompteFiltre(""); setPage(1); }}
              className="px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 flex items-center gap-1">
              <X size={13} /> Effacer
            </button>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <p className="text-sm text-gray-500">{total} écriture{total > 1 ? "s" : ""}</p>
          <button onClick={handleExport} disabled={list.length === 0}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-40">
            <Download size={14} /> Exporter CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Aucune écriture pour cet exercice{compteFiltre ? ` / compte ${compteFiltre}` : ""}</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Date", "Pièce", "Libellé", "Compte Débit", "Compte Crédit", "Montant", "Source"].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(e.dateEcriture).toLocaleDateString("fr-FR")}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.numeroPiece ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-900 max-w-[220px] truncate" title={e.libelle}>{e.libelle}</td>
                      <td className="px-4 py-3 font-mono font-medium text-gray-700">{e.compteDebit}</td>
                      <td className="px-4 py-3 font-mono font-medium text-gray-700">{e.compteCredit}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{FCFA(e.montantFcfa)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{SOURCE_LABELS[e.source] ?? e.source}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">Page {page} / {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronLeft size={16} /></button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50"><ChevronRight size={16} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Onglet Balance des comptes ───────────────────────────────────────────────
interface BalanceLigne {
  numeroCompte: string; libelle: string; type: string;
  totalDebit: number; totalCredit: number; solde: number;
}

function OngletBalance() {
  const anneeActuelle = new Date().getFullYear();
  const [exercice, setExercice] = useState(anneeActuelle);
  const annees = Array.from({ length: 5 }, (_, i) => anneeActuelle - i);

  const { data, isLoading } = useQuery({
    queryKey: ["balance", exercice],
    queryFn: () => apiFetch<BalanceLigne[]>(`/api/comptabilite/balance?exercice=${exercice}`),
  });

  const list = data ?? [];
  const totalDebit  = list.reduce((s, l) => s + l.totalDebit,  0);
  const totalCredit = list.reduce((s, l) => s + l.totalCredit, 0);

  const handleExport = () => {
    exportCSV(
      `balance_${exercice}.csv`,
      ["N° Compte", "Libellé", "Type", "Total Débit", "Total Crédit", "Solde"],
      list.map((l) => [l.numeroCompte, l.libelle.replace(/;/g, ","), l.type, String(l.totalDebit), String(l.totalCredit), String(l.solde)])
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Exercice</label>
          <select value={exercice} onChange={(e) => setExercice(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700">
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <p className="text-sm text-gray-500">{list.length} compte{list.length > 1 ? "s" : ""} mouvementés</p>
          <button onClick={handleExport} disabled={list.length === 0}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-40">
            <Download size={14} /> Exporter CSV
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <Scale className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Aucun mouvement pour l'exercice {exercice}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">N° Compte</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Libellé</th>
                  <th className="text-center text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Type</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Total Débit</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Total Crédit</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Solde</th>
                </tr>
              </thead>
              <tbody>
                {list.map((l) => {
                  const ti = TYPES_COMPTE[l.type] ?? { label: l.type, color: "#6b7280" };
                  return (
                    <tr key={l.numeroCompte} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-800">{l.numeroCompte}</td>
                      <td className="px-4 py-3 text-gray-700">{l.libelle}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: `${ti.color}18`, color: ti.color }}>{ti.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">{FCFA(l.totalDebit)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">{FCFA(l.totalCredit)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${l.solde >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {l.solde < 0 && "-"}{FCFA(Math.abs(l.solde))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-4 py-3 font-bold text-gray-700 text-sm">TOTAUX</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{FCFA(totalDebit)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{FCFA(totalCredit)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${totalDebit >= totalCredit ? "text-green-700" : "text-red-600"}`}>
                    {FCFA(Math.abs(totalDebit - totalCredit))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Flux de trésorerie ────────────────────────────────────────────────
interface FluxData {
  fluxOperationnelsFcfa: number; fluxFinancementFcfa: number;
  encaissementsExportateursFcfa: number; paiementsProducteursFcfa: number;
  avancesOctroyes: number; avancesRembourses: number;
  soldeDebutFcfa: number; soldeFinalFcfa: number; exercice: number;
}

function OngletFluxTresorerie() {
  const anneeActuelle = new Date().getFullYear();
  const [exercice, setExercice] = useState(anneeActuelle);
  const annees = Array.from({ length: 5 }, (_, i) => anneeActuelle - i);

  const { data, isLoading } = useQuery({
    queryKey: ["flux-tresorerie", exercice],
    queryFn: () => apiFetch<FluxData>(`/api/etats-financiers/flux-tresorerie?exercice=${exercice}`),
  });

  const d: FluxData = data ?? {
    fluxOperationnelsFcfa: 0, fluxFinancementFcfa: 0,
    encaissementsExportateursFcfa: 0, paiementsProducteursFcfa: 0,
    avancesOctroyes: 0, avancesRembourses: 0,
    soldeDebutFcfa: 0, soldeFinalFcfa: 0, exercice,
  };

  if (isLoading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>;

  const sections = [
    {
      titre: "Flux opérationnels",
      lignes: [
        { label: "Encaissements exportateurs", montant: d.encaissementsExportateursFcfa, positif: true },
        { label: "Paiements producteurs",       montant: d.paiementsProducteursFcfa,       positif: false },
      ],
      total: d.fluxOperationnelsFcfa,
      color: VERT,
    },
    {
      titre: "Flux de financement",
      lignes: [
        { label: "Avances octroyées",   montant: d.avancesOctroyes,   positif: false },
        { label: "Avances remboursées", montant: d.avancesRembourses, positif: true  },
      ],
      total: d.fluxFinancementFcfa,
      color: OR,
    },
  ];

  return (
    <div>
      <div className="flex items-end gap-3 mb-6">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Exercice</label>
          <select value={exercice} onChange={(e) => setExercice(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700">
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* Solde final */}
      <div className={`rounded-xl p-5 mb-6 flex items-center justify-between ${d.soldeFinalFcfa >= 0 ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
        <div>
          <p className="text-sm font-medium text-gray-600">Variation nette de trésorerie — {exercice}</p>
          <p className={`text-3xl font-bold mt-1 ${d.soldeFinalFcfa >= 0 ? "text-green-700" : "text-red-700"}`}>
            {d.soldeFinalFcfa >= 0 ? "+" : ""}{FCFA(d.soldeFinalFcfa)}
          </p>
        </div>
        <Droplets size={36} className={d.soldeFinalFcfa >= 0 ? "text-green-400" : "text-red-400"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sections.map((s) => (
          <div key={s.titre} className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold mb-4 text-sm" style={{ color: s.color }}>{s.titre}</h3>
            <div className="space-y-2 mb-4">
              {s.lignes.map((l) => (
                <div key={l.label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{l.label}</span>
                  <span className={`font-medium ${l.positif ? "text-green-700" : "text-red-600"}`}>
                    {l.positif ? "+" : "-"}{FCFA(l.montant)}
                  </span>
                </div>
              ))}
            </div>
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Solde</span>
              <span className={`font-bold ${s.total >= 0 ? "text-green-700" : "text-red-600"}`}>
                {s.total >= 0 ? "+" : ""}{FCFA(s.total)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modal Saisie manuelle d'écriture ─────────────────────────────────────────
function ModalSaisieManuelle({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    dateEcriture: new Date().toISOString().slice(0, 10),
    numeroPiece: "",
    libelle: "",
    compteDebit: "",
    compteCredit: "",
    montantFcfa: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const montant = parseInt(form.montantFcfa.replace(/\s/g, ""), 10);
    if (!form.libelle.trim() || !form.compteDebit.trim() || !form.compteCredit.trim() || isNaN(montant) || montant <= 0) {
      toast({ title: "Tous les champs obligatoires doivent être renseignés", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiPost("/api/comptabilite/ecriture", {
        dateEcriture: form.dateEcriture,
        numeroPiece: form.numeroPiece.trim() || null,
        libelle: form.libelle.trim(),
        compteDebit: form.compteDebit.trim(),
        compteCredit: form.compteCredit.trim(),
        montantFcfa: montant,
      });
      toast({ title: "Écriture enregistrée" });
      void qc.invalidateQueries({ queryKey: ["grand-livre"] });
      void qc.invalidateQueries({ queryKey: getGetJournalComptableQueryKey() });
      onSuccess();
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Saisie manuelle d'écriture</h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form onSubmit={(e) => { void handleSubmit(e); }} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
              <input type="date" value={form.dateEcriture}
                onChange={(e) => setForm((f) => ({ ...f, dateEcriture: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">N° Pièce</label>
              <input type="text" value={form.numeroPiece} placeholder="ex : OV-2024-001"
                onChange={(e) => setForm((f) => ({ ...f, numeroPiece: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Libellé *</label>
            <input type="text" value={form.libelle} placeholder="ex : Achat fournitures de bureau"
              onChange={(e) => setForm((f) => ({ ...f, libelle: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Compte Débit *</label>
              <input type="text" value={form.compteDebit} placeholder="ex : 6011"
                onChange={(e) => setForm((f) => ({ ...f, compteDebit: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Compte Crédit *</label>
              <input type="text" value={form.compteCredit} placeholder="ex : 401"
                onChange={(e) => setForm((f) => ({ ...f, compteCredit: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Montant FCFA *</label>
            <input type="number" min="1" value={form.montantFcfa} placeholder="ex : 150000"
              onChange={(e) => setForm((f) => ({ ...f, montantFcfa: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-xs text-blue-700">
            <strong>OHADA :</strong> débit = crédit. L'écriture sera soumise à validation si le mode manuel est activé.
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: VERT }}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Section Clôture (dans OngletConfiguration) ───────────────────────────────
interface ExerciceStatut { id: number; annee: number; statut: string; }

function ClotureSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const anneeActuelle = new Date().getFullYear();
  const [annee, setAnnee] = useState(anneeActuelle - 1);
  const [confirm, setConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const { data: exercices, refetch } = useQuery({
    queryKey: ["exercices-statuts"],
    queryFn: () => apiFetch<ExerciceStatut[]>("/api/comptabilite/exercices"),
  });

  const statutAnnee = exercices?.find((e) => e.annee === annee)?.statut;
  const annees = Array.from({ length: 5 }, (_, i) => anneeActuelle - 1 - i);

  const handleCloture = async () => {
    setLoading(true);
    try {
      const res = await apiPost<{ message: string; totalProduits: number; totalCharges: number; resultatNet: number; ecrituresGenerees: number }>(
        "/api/comptabilite/cloture", { exercice: annee }
      );
      toast({
        title: `Exercice ${annee} clôturé`,
        description: `Résultat net : ${FCFA(res.resultatNet)} — ${res.ecrituresGenerees} écriture${res.ecrituresGenerees > 1 ? "s" : ""} de clôture générée${res.ecrituresGenerees > 1 ? "s" : ""}`,
      });
      void refetch();
      void qc.invalidateQueries({ queryKey: ["grand-livre"] });
      void qc.invalidateQueries({ queryKey: ["balance"] });
      setConfirm(false);
    } catch (err) {
      toast({ title: "Erreur lors de la clôture", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-8 pt-6 border-t border-gray-200">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Clôture d'exercice</h2>
      <p className="text-sm text-gray-500 mb-5">
        Génère les écritures de clôture OHADA (virement des charges et produits vers le compte 130 — Résultat de l'exercice)
        et verrouille définitivement l'exercice sélectionné.
      </p>

      {/* Liste des exercices */}
      {exercices && exercices.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Exercice</th>
                <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {exercices.map((e) => (
                <tr key={e.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{e.annee}</td>
                  <td className="px-4 py-3">
                    {e.statut === "cloture" ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        <Lock size={11} /> Clôturé
                      </span>
                    ) : (
                      <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-50 text-green-700">Ouvert</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Formulaire */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Exercice à clôturer</label>
          <select value={annee} onChange={(e) => { setAnnee(Number(e.target.value)); setConfirm(false); }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700">
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {statutAnnee === "cloture" ? (
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
            <Lock size={14} /> Exercice {annee} déjà clôturé
          </div>
        ) : !confirm ? (
          <button onClick={() => setConfirm(true)}
            className="px-4 py-2 border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2">
            <Lock size={14} /> Clôturer l'exercice {annee}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
              ⚠ Irréversible. Confirmer ?
            </div>
            <button onClick={() => { void handleCloture(); }} disabled={loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
              {loading ? "Clôture…" : "Oui, clôturer"}
            </button>
            <button onClick={() => setConfirm(false)}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
type Onglet = "journal" | "en_attente" | "config" | "devises" | "plan_comptable" | "grand_livre" | "balance" | "flux";

export default function ComptabilitePage() {
  const [onglet, setOnglet] = useState<Onglet>("en_attente");
  const [showSaisie, setShowSaisie] = useState(false);

  const peutVoirConfig  = usePermission("comptabilite", "voir_config");
  const peutVoirAttente = usePermission("comptabilite", "voir_ecritures_attente");
  const peutVoirPlan    = usePermission("comptabilite", "voir_plan");
  const peutGrandLivre  = usePermission("comptabilite", "voir_grand_livre");
  const peutBalance     = usePermission("comptabilite", "voir_balance");
  const peutSaisir      = usePermission("comptabilite", "saisir_ecriture_manuelle");

  const { data: countData } = useCountEcrituresEnAttente({ query: { queryKey: getCountEcrituresEnAttenteQueryKey(), enabled: peutVoirAttente } });
  const nbEnAttente = countData?.count ?? 0;

  const peutVoirTaux = usePermission("devises", "voir_taux");

  const tabs: { id: Onglet; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "en_attente",  label: "En attente",      icon: Clock,     badge: nbEnAttente > 0 ? nbEnAttente : undefined },
    { id: "journal",     label: "Journal",          icon: BookOpen },
    ...(peutGrandLivre ? [{ id: "grand_livre" as Onglet, label: "Grand-livre",  icon: FileText }] : []),
    ...(peutBalance    ? [{ id: "balance"     as Onglet, label: "Balance",      icon: Scale }] : []),
    { id: "flux",        label: "Flux trésorerie",  icon: Droplets },
    ...(peutVoirTaux   ? [{ id: "devises"         as Onglet, label: "Devises",        icon: DollarSign }] : []),
    ...(peutVoirPlan   ? [{ id: "plan_comptable"  as Onglet, label: "Plan comptable", icon: List }] : []),
    ...(peutVoirConfig ? [{ id: "config"          as Onglet, label: "Configuration",  icon: Settings }] : []),
  ];

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Comptabilité</h1>
          <p className="text-sm text-gray-500 mt-1">Gestion des écritures comptables OHADA</p>
        </div>
        {peutSaisir && (
          <button
            onClick={() => setShowSaisie(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm"
            style={{ backgroundColor: VERT }}
          >
            <Plus size={16} /> Saisie manuelle
          </button>
        )}
      </div>

      {/* Onglets */}
      <div className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
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

      {/* Widget taux dans l'onglet devises (en tête de page si visible) */}
      {peutVoirTaux && onglet !== "devises" && (
        <div className="mb-4">
          <WidgetTauxChange />
        </div>
      )}

      {onglet === "en_attente"    && <OngletEnAttente />}
      {onglet === "journal"       && <OngletJournal />}
      {onglet === "grand_livre"   && peutGrandLivre && <OngletGrandLivre />}
      {onglet === "balance"       && peutBalance    && <OngletBalance />}
      {onglet === "flux"          && <OngletFluxTresorerie />}
      {onglet === "devises"       && peutVoirTaux   && <OngletDevises />}
      {onglet === "plan_comptable"&& peutVoirPlan   && <OngletPlanComptableContainer />}
      {onglet === "config"        && peutVoirConfig && <OngletConfiguration />}

      {showSaisie && (
        <ModalSaisieManuelle
          onClose={() => setShowSaisie(false)}
          onSuccess={() => setShowSaisie(false)}
        />
      )}
    </div>
  );
}

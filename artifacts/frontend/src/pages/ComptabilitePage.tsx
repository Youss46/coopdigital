import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import ExcelJS from "exceljs";
import { MoneyInput } from "@/components/ui/money-input";
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
  getGetDevisesTauxQueryKey,
  getGetDevisesTauxHistoriqueDeviseQueryKey,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Settings, Clock, BookOpen, CheckCheck, X, Edit2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, RefreshCw, DollarSign, List, Sliders, RotateCcw, Plus, Pencil, Ban, ChevronDown, ChevronUp, Search, RotateCw, FileText, Scale, Droplets, Lock, Download, Filter, Users, Sparkles, ShieldAlert, Eye, Upload, CheckCircle2, FileSpreadsheet } from "lucide-react";
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
  { key: "autoLivraisons",      label: "Livraisons producteurs",      groupe: "Opérations principales" },
  { key: "autoPaiements",       label: "Paiements producteurs",       groupe: "Opérations principales" },
  { key: "autoAvances",         label: "Avances producteurs",         groupe: "Opérations principales" },
  { key: "autoVentesExport",    label: "Ventes exportateurs",         groupe: "Opérations principales" },
  { key: "autoEncaissements",   label: "Encaissements exportateurs",  groupe: "Opérations principales" },
  { key: "autoSalaires",        label: "Salaires & paie",             groupe: "Charges & exploitation" },
  { key: "autoStocks",          label: "Mouvements de stocks",        groupe: "Charges & exploitation" },
  { key: "autoIntrants",        label: "Achats intrants",             groupe: "Charges & exploitation" },
  { key: "autoTransport",       label: "Frais de transport",          groupe: "Charges & exploitation" },
  { key: "autoMaintenances",    label: "Maintenances & réparations",  groupe: "Charges & exploitation" },
  { key: "autoEmprunts",        label: "Emprunts & remboursements",   groupe: "Financier & exceptionnel" },
  { key: "autoInvestissements", label: "Investissements",             groupe: "Financier & exceptionnel" },
  { key: "autoDons",            label: "Dons & subventions reçus",    groupe: "Financier & exceptionnel" },
  { key: "autoSubventions",     label: "Réception de subventions",    groupe: "Financier & exceptionnel" },
  { key: "autoCaisse",          label: "Mouvements de caisse",        groupe: "Trésorerie" },
  { key: "autoBanque",          label: "Mouvements bancaires",        groupe: "Trésorerie" },
  { key: "autoMobileMarchand",  label: "Virements Mobile Marchand",   groupe: "Trésorerie" },
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

      {(() => {
        const groupes = [...new Set(MODULE_CONFIG.map((m) => m.groupe))];
        return groupes.map((groupe) => {
          const modules = MODULE_CONFIG.filter((m) => m.groupe === groupe);
          const nbAuto = modules.filter(({ key }) => getValue(key)).length;
          return (
            <div key={groupe} className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-3">
              <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{groupe}</span>
                <span className="text-xs text-gray-400">{nbAuto}/{modules.length} automatique{nbAuto > 1 ? "s" : ""}</span>
              </div>
              <table className="w-full">
                <tbody>
                  {modules.map(({ key, label }) => {
                    const isAuto = getValue(key);
                    return (
                      <tr key={key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                        <td className="px-5 py-3.5">
                          <span className="text-sm font-medium text-gray-900">{label}</span>
                        </td>
                        <td className="px-5 py-3.5 text-center w-32">
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
                        <td className="px-5 py-3.5 text-right w-20">
                          <Toggle checked={isAuto} onChange={(v) => handleToggle(key, v)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        });
      })()}

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
            <MoneyInput
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
              value={String(form.montantFcfa || "")}
              onChange={(raw) => setForm({ ...form, montantFcfa: raw ? parseInt(raw) : 0 })}
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
  // Envoyer aussi la valeur vide : l'API distingue l'absence du paramètre
  // (filtre par défaut « en_attente ») d'un statut vide (tous les statuts).
  params["statut"] = filtreStatut;
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
function OngletJournal({ defaultSource = "" }: { defaultSource?: string }) {
  const [page, setPage] = useState(1);
  const [filtreSource, setFiltreSource] = useState(defaultSource);
  const [filtreType, setFiltreType] = useState("");
  const [filtreDebut, setFiltreDebut] = useState("");
  const [filtreFin, setFiltreFin] = useState("");
  const [exporting, setExporting] = useState(false);
  const LIMIT = 50;
  const annee = new Date().getFullYear();

  const TYPE_LABELS: Record<string, string> = {
    normale:                 "Normale",
    regularisation:          "Régularisation",
    extourne_regularisation: "Extourne régul.",
    cloture:                 "Clôture",
    a_nouveau:               "À-nouveau",
    affectation:             "Affectation",
  };

  const TYPE_BADGE_STYLE: Record<string, { bg: string; color: string }> = {
    normale:                 { bg: "#f3f4f6", color: "#6b7280" },
    regularisation:          { bg: "#f3e8ff", color: "#7e22ce" },
    extourne_regularisation: { bg: "#ede9fe", color: "#5b21b6" },
    cloture:                 { bg: "#fee2e2", color: "#991b1b" },
    a_nouveau:               { bg: "#dbeafe", color: "#1e40af" },
    affectation:             { bg: "#d1fae5", color: "#065f46" },
  };

  const buildParams = () => {
    const p: Record<string, string> = { exercice: String(annee), page: String(page), limit: String(LIMIT) };
    if (filtreSource) p["source"] = filtreSource;
    if (filtreType) p["type_ecriture"] = filtreType;
    if (filtreDebut) p["date_debut"] = filtreDebut;
    if (filtreFin) p["date_fin"] = filtreFin;
    return p;
  };

  const { data, isLoading } = useQuery<{ ecritures: Array<{ id: number; dateEcriture: string; numeroPiece?: string | null; libelle: string; compteDebit: string; compteCredit: string; montantFcfa: number; source: string; typeEcriture: string; }>; total: number; page: number; limit: number }>({
    queryKey: ["journal-comptable", annee, page, filtreSource, filtreType, filtreDebut, filtreFin],
    queryFn: () => apiFetch(`/api/comptabilite/journal?${new URLSearchParams(buildParams()).toString()}`),
  });

  const list = data?.ecritures ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  const handleSourceChange = (v: string) => { setFiltreSource(v); setPage(1); };
  const handleTypeChange   = (v: string) => { setFiltreType(v);   setPage(1); };
  const handleDebutChange = (v: string) => { setFiltreDebut(v); setPage(1); };
  const handleFinChange   = (v: string) => { setFiltreFin(v);   setPage(1); };
  const hasFilters = !!(filtreSource || filtreType || filtreDebut || filtreFin);

  const resetFiltres = () => { setFiltreSource(""); setFiltreType(""); setFiltreDebut(""); setFiltreFin(""); setPage(1); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ exercice: String(annee) });
      if (filtreSource) params.set("source", filtreSource);
      if (filtreType) params.set("type_ecriture", filtreType);
      if (filtreDebut) params.set("date_debut", filtreDebut);
      if (filtreFin) params.set("date_fin", filtreFin);
      const url = `${import.meta.env.VITE_API_URL ?? ""}/api/comptabilite/journal/export?${params.toString()}`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${localStorage.getItem("coop_token") ?? ""}` },
      });
      if (!r.ok) throw new Error("Erreur lors de l'export");
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const cd = r.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `journal-${annee}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      alert("Impossible de télécharger le fichier Excel.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      {/* Ligne de filtres */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Filter size={14} className="text-gray-400 shrink-0" />

        {/* Source */}
        <select
          value={filtreSource}
          onChange={(e) => handleSourceChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value="">Toutes les sources</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Type d'écriture */}
        <select
          value={filtreType}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        >
          <option value="">Tous les types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        {/* Date début */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 shrink-0">Du</span>
          <input
            type="date"
            value={filtreDebut}
            onChange={(e) => handleDebutChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>

        {/* Date fin */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400 shrink-0">Au</span>
          <input
            type="date"
            value={filtreFin}
            onChange={(e) => handleFinChange(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          />
        </div>

        {hasFilters && (
          <button
            onClick={resetFiltres}
            className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 px-2 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
          >
            <X size={12} /> Réinitialiser
          </button>
        )}
      </div>

      {/* Ligne résumé + export + pagination */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <p className="text-sm text-gray-500 mr-auto">{total} écriture{total !== 1 ? "s" : ""} — exercice {annee}</p>

        <button
          onClick={() => { void handleExport(); }}
          disabled={exporting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <Download size={14} />
          {exporting ? "Export…" : hasFilters ? "Exporter la sélection" : "Exporter Excel"}
        </button>

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

      {hasFilters && !isLoading && (
        <div
          className="flex flex-wrap items-center gap-2 mb-4 px-4 py-2.5 rounded-lg text-sm font-medium"
          style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534" }}
        >
          <Filter size={14} />
          <span>
            {filtreSource && <><strong>{SOURCE_LABELS[filtreSource] ?? filtreSource}</strong>{(filtreType || filtreDebut || filtreFin) ? " · " : ""}</>}
            {filtreType && <><strong>{TYPE_LABELS[filtreType] ?? filtreType}</strong>{(filtreDebut || filtreFin) ? " · " : ""}</>}
            {filtreDebut && <>à partir du <strong>{new Date(filtreDebut).toLocaleDateString("fr-FR")}</strong></>}
            {filtreDebut && filtreFin && " "}
            {filtreFin && <>jusqu&apos;au <strong>{new Date(filtreFin).toLocaleDateString("fr-FR")}</strong></>}
          </span>
          <span className="text-green-600">— {total} écriture{total !== 1 ? "s" : ""} au total</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">
            {hasFilters
              ? "Aucune écriture ne correspond à ces filtres"
              : `Aucune écriture pour l'exercice ${annee}`}
          </p>
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
                {list.map((e) => {
                  const isManuel = e.source === "manuel";
                  const isRegul = e.typeEcriture === "regularisation" || e.typeEcriture === "extourne_regularisation";
                  const typeBadge = TYPE_BADGE_STYLE[e.typeEcriture] ?? { bg: "#f3f4f6", color: "#6b7280" };
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50"
                      style={isRegul ? { backgroundColor: "#faf5ff" } : (isManuel && filtreSource === "manuel" ? { backgroundColor: "#fffbeb" } : undefined)}
                    >
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {new Date(e.dateEcriture).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{e.numeroPiece ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-900 max-w-[220px] truncate" title={e.libelle}>
                        {e.libelle}
                        {isManuel && (
                          <span className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                            Manuel
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">{e.compteDebit}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{e.compteCredit}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{FCFA(e.montantFcfa)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <span
                            className="text-xs px-2 py-0.5 rounded-full w-fit"
                            style={
                              isManuel
                                ? { backgroundColor: "#fef3c7", color: "#92400e" }
                                : { backgroundColor: "#f3f4f6", color: "#6b7280" }
                            }
                          >
                            {SOURCE_LABELS[e.source] ?? e.source}
                          </span>
                          {e.typeEcriture && e.typeEcriture !== "normale" && (
                            <span
                              className="text-[10px] font-semibold px-2 py-0.5 rounded-full w-fit"
                              style={{ backgroundColor: typeBadge.bg, color: typeBadge.color }}
                            >
                              {TYPE_LABELS[e.typeEcriture] ?? e.typeEcriture}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
async function apiUpload<T>(path: string, file: File, fields: Record<string, unknown> = {}): Promise<T> {
  const body = new FormData();
  body.append("fichier", file);
  Object.entries(fields).forEach(([key, value]) => body.append(key, typeof value === "string" ? value : JSON.stringify(value)));
  const r = await fetch(`${_BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${tok()}` }, body });
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
function SeedOhadaButton({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => apiPost<{ message: string; inseres: number; dejaPresents: number }>(
      "/api/comptabilite/plan/seed-ohada", {}
    ),
    onSuccess: (data) => {
      onSuccess();
      toast({ description: data.message });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
      title="Charger les 1 346 comptes SYSCOHADA révisé"
    >
      {mut.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
      Plan SYSCOHADA
    </button>
  );
}

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
          <div className="flex items-center gap-2 ml-auto">
            <SeedOhadaButton onSuccess={() => void qc.invalidateQueries({ queryKey: ["plan-comptable"] })} />
            <button
              onClick={() => setModalCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: VERT }}
            >
              <Plus size={14} /> Nouveau compte
            </button>
          </div>
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
                    <th className="text-left px-2 sm:px-4 py-2 font-medium">N°</th>
                    <th className="text-left px-2 sm:px-4 py-2 font-medium">Libellé</th>
                    <th className="text-left px-2 sm:px-4 py-2 font-medium">Type</th>
                    <th className="hidden sm:table-cell text-left px-4 py-2 font-medium">Solde normal</th>
                    <th className="hidden sm:table-cell text-left px-4 py-2 font-medium">Statut</th>
                    <th className="hidden sm:table-cell px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.sort((a,b) => a.numeroCompte.localeCompare(b.numeroCompte)).map((c) => (
                    <tr key={c.id} className={`border-b border-gray-50 hover:bg-gray-50 ${!c.actif ? "opacity-50" : ""}`}>
                      <td className="px-2 sm:px-4 py-2.5 font-mono font-semibold text-gray-800 whitespace-nowrap">{c.numeroCompte}</td>
                      <td className="px-2 sm:px-4 py-2.5 text-gray-700">
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
                      <td className="px-2 sm:px-4 py-2.5">
                        <span className="px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold whitespace-nowrap"
                          style={{ background: TYPES_COMPTE[c.type]?.color + "22", color: TYPES_COMPTE[c.type]?.color }}>
                          {TYPES_COMPTE[c.type]?.label ?? c.type}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2.5 text-gray-500 capitalize">{c.soldeNormal}</td>
                      <td className="hidden sm:table-cell px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.actif ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                          {c.actif ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="hidden sm:table-cell px-4 py-2.5">
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

function SeedParamsButton({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const mut = useMutation({
    mutationFn: () => apiPost<{ message: string; inseres: number; mises_a_jour: number }>(
      "/api/comptabilite/params/seed-ohada", {}
    ),
    onSuccess: (data) => {
      onSuccess();
      toast({ description: data.message });
    },
    onError: (e: Error) => toast({ variant: "destructive", description: e.message }),
  });
  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 flex-shrink-0"
      title="Charger les 26 opérations OHADA par défaut"
    >
      {mut.isPending ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
      Initialiser OHADA
    </button>
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
      <div className="flex items-start gap-3">
        <p className="text-sm text-gray-500 flex-1">
          Configurez les comptes OHADA utilisés automatiquement par chaque module lors de la génération d'écritures.
        </p>
        <SeedParamsButton onSuccess={() => void qc.invalidateQueries({ queryKey: ["params-comptes-modules"] })} />
      </div>
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Chargement…</div>
      ) : params.length === 0 ? (
        <div className="text-center py-16 text-gray-400 space-y-3">
          <Sliders size={32} className="mx-auto text-gray-300" />
          <p className="text-sm">Aucun paramètre configuré.</p>
          <p className="text-xs">Cliquez sur <strong>Initialiser OHADA</strong> pour charger les 26 opérations standards.</p>
        </div>
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
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 hover:border-amber-400 hover:text-amber-600 mr-2 flex-shrink-0"
                      title="Réinitialiser OHADA"
                    >
                      <RotateCcw size={11} />
                      <span className="hidden sm:inline">Réinitialiser OHADA</span>
                    </button>
                  )}
                  {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                </button>
                {open && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 text-xs text-gray-500 uppercase">
                          <th className="text-left px-2 sm:px-4 py-2 font-medium">Opération</th>
                          <th className="text-left px-2 sm:px-4 py-2 font-medium">Débit</th>
                          <th className="text-left px-2 sm:px-4 py-2 font-medium">Crédit</th>
                          <th className="hidden sm:table-cell text-left px-4 py-2 font-medium">Libellé auto</th>
                          <th className="px-2 sm:px-4 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {rows.sort((a,b) => a.operation.localeCompare(b.operation)).map((p) => (
                          <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-2 sm:px-4 py-2.5 text-gray-700 font-mono text-xs">{p.operation}</td>
                            {editId === p.id ? (
                              <>
                                <td className="px-2 sm:px-4 py-1.5">
                                  <input value={editForm.compteDebit}
                                    onChange={(e) => setEditForm((f) => ({ ...f, compteDebit: e.target.value }))}
                                    className="w-16 sm:w-20 border border-gray-200 rounded px-2 py-1 text-sm font-mono" />
                                </td>
                                <td className="px-2 sm:px-4 py-1.5">
                                  <input value={editForm.compteCredit}
                                    onChange={(e) => setEditForm((f) => ({ ...f, compteCredit: e.target.value }))}
                                    className="w-16 sm:w-20 border border-gray-200 rounded px-2 py-1 text-sm font-mono" />
                                </td>
                                <td className="hidden sm:table-cell px-4 py-1.5">
                                  <input value={editForm.libelleEcritureAuto}
                                    onChange={(e) => setEditForm((f) => ({ ...f, libelleEcritureAuto: e.target.value }))}
                                    className="w-full border border-gray-200 rounded px-2 py-1 text-sm" />
                                </td>
                                <td className="px-2 sm:px-4 py-1.5">
                                  <div className="flex gap-1 sm:gap-2">
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
                                <td className="px-2 sm:px-4 py-2.5 font-mono font-semibold text-blue-700">{p.compteDebit}</td>
                                <td className="px-2 sm:px-4 py-2.5 font-mono font-semibold text-purple-700">{p.compteCredit}</td>
                                <td className="hidden sm:table-cell px-4 py-2.5 text-gray-500 text-xs">{p.libelleEcritureAuto ?? "—"}</td>
                                <td className="px-2 sm:px-4 py-2.5 text-right">
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
                <MoneyInput value={form.nouveauMontant}
                  onChange={(raw) => setForm((f) => ({ ...f, nouveauMontant: raw }))}
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

// ─── Export Excel helper ──────────────────────────────────────────────────────
interface ExcelCol {
  header: string; key: string; width: number;
  numFmt?: string; align?: "left" | "right" | "center";
}

async function exportExcel(
  filename: string,
  sheetName: string,
  columns: ExcelCol[],
  rows: Record<string, string | number>[],
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CoopDigital";
  wb.created = new Date();

  const ws = wb.addWorksheet(sheetName);
  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }));

  // En-tête vert foncé
  const hdr = ws.getRow(1);
  hdr.height = 22;
  hdr.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  hdr.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A4731" } };
  hdr.alignment = { vertical: "middle", horizontal: "center" };

  // Données avec lignes alternées
  for (let i = 0; i < rows.length; i++) {
    const row = ws.addRow(rows[i]!);
    row.font = { size: 9 };
    if (i % 2 === 1) {
      row.eachCell({ includeEmpty: true }, cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
      });
    }
  }

  // Formats et alignements par colonne
  columns.forEach(c => {
    if (c.numFmt) ws.getColumn(c.key).numFmt = c.numFmt;
    if (c.align)  ws.getColumn(c.key).alignment = { horizontal: c.align };
  });

  // Figer la 1ère ligne + auto-filtre
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const lastCol = String.fromCharCode(64 + columns.length);
  ws.autoFilter = { from: "A1", to: `${lastCol}1` };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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

  const handleExport = () => void exportExcel(
    `grand_livre_${exercice}${compteFiltre ? "_" + compteFiltre : ""}.xlsx`,
    "Grand livre",
    [
      { header: "Date",          key: "date",    width: 14 },
      { header: "Pièce",         key: "piece",   width: 22 },
      { header: "Libellé",       key: "libelle", width: 50 },
      { header: "Compte Débit",  key: "debit",   width: 16 },
      { header: "Compte Crédit", key: "credit",  width: 16 },
      { header: "Montant FCFA",  key: "montant", width: 18, numFmt: "#,##0", align: "right" },
      { header: "Source",        key: "source",  width: 22 },
    ],
    list.map((e) => ({
      date:    new Date(e.dateEcriture).toLocaleDateString("fr-FR"),
      piece:   e.numeroPiece ?? "",
      libelle: e.libelle,
      debit:   e.compteDebit,
      credit:  e.compteCredit,
      montant: Number(e.montantFcfa),
      source:  SOURCE_LABELS[e.source] ?? e.source,
    }))
  );

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
            <Download size={14} /> Exporter Excel
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
  numeroCompte: string; libelle: string;
  totalDebit: number; totalCredit: number;
  soldeDebiteur: number; soldeCrediteur: number;
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
  const totalSoldeDebiteur = list.reduce((s, l) => s + l.soldeDebiteur, 0);
  const totalSoldeCrediteur = list.reduce((s, l) => s + l.soldeCrediteur, 0);

  const handleExport = () => void exportExcel(
    `balance_${exercice}.xlsx`,
    "Balance des comptes",
    [
      { header: "N° Compte",    key: "compte",  width: 14 },
      { header: "Libellé",      key: "libelle", width: 45 },
      { header: "Mouvements Débit",   key: "debit",          width: 18, numFmt: "#,##0", align: "right" },
      { header: "Mouvements Crédit",  key: "credit",         width: 18, numFmt: "#,##0", align: "right" },
      { header: "Solde Débiteur",     key: "soldeDebiteur",  width: 18, numFmt: "#,##0", align: "right" },
      { header: "Solde Créditeur",    key: "soldeCrediteur", width: 18, numFmt: "#,##0", align: "right" },
    ],
    list.map((l) => ({
      compte:  l.numeroCompte,
      libelle: l.libelle,
      debit:   Number(l.totalDebit),
      credit:  Number(l.totalCredit),
      soldeDebiteur:  Number(l.soldeDebiteur),
      soldeCrediteur: Number(l.soldeCrediteur),
    }))
  );

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
            <Download size={14} /> Exporter Excel
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
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Mouvements Débit</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Mouvements Crédit</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Solde Débiteur</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Solde Créditeur</th>
                </tr>
              </thead>
              <tbody>
                {list.map((l) => {
                  return (
                    <tr key={l.numeroCompte} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-800">{l.numeroCompte}</td>
                      <td className="px-4 py-3 text-gray-700">{l.libelle}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">{FCFA(l.totalDebit)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">{FCFA(l.totalCredit)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">{FCFA(l.soldeDebiteur)}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-700">{FCFA(l.soldeCrediteur)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={2} className="px-4 py-3 font-bold text-gray-700 text-sm">TOTAUX</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{FCFA(totalDebit)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{FCFA(totalCredit)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{FCFA(totalSoldeDebiteur)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{FCFA(totalSoldeCrediteur)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Import des balances Sage ────────────────────────────────────────────────
type BalanceImportMode = "historique" | "reprise";
interface BalanceSageImport {
  id: number; exercice: number; mode: BalanceImportMode; nomFichier: string;
  feuille: string; statut: string; nombreLignes: number; nombreErreurs: number;
  comptesInconnus: number; compteContrepartie?: string | null; dateReprise?: string | null;
  nombreEcritures?: number | null; createdAt: string;
  prepareePar?: number | null; prepareeLe?: string | null; prepareeParNom?: string | null; prepareeParRole?: string | null;
  valideePar?: number | null; valideeLe?: string | null; valideeParNom?: string | null; valideeParRole?: string | null;
}
interface BalanceSageDetail extends BalanceSageImport {
  lignes: Array<{ numeroLigne: number; numeroCompte: string; libelle: string; totalDebit: number; totalCredit: number; soldeDebiteur: number; soldeCrediteur: number; compteConnu: boolean; erreur: string | null }>;
}
interface BalanceSageAuditEvent {
  id: number; importId: number; exercice: number; action: "preparation" | "validation";
  statut: "succes" | "echec"; userId: number | null; userNom: string | null; userRole: string | null;
  message: string; createdAt: string; nomFichier: string | null;
}
interface BalanceSagePreview {
  empreinte: string; feuille: string; headers: string[]; preview: unknown[][];
  mappingSuggere: Record<string, number | undefined>; lignesDetectees: number;
}
interface BalanceSagePreparation {
  import: BalanceSageImport; totalDebiteur: number; totalCrediteur: number; nombreEcritures: number;
  ecritures: Array<{ compteDebit: string; compteCredit: string; montantFcfa: number; libelle: string }>;
}
interface BalanceSageContrepartieSuggestion {
  numeroCompte: string; libelle: string; score: number; raison: string;
}
interface BalanceSageSuggestionsResponse {
  disponible: boolean;
  suggestions: BalanceSageContrepartieSuggestion[];
  message?: string;
}

function OngletImportBalances() {
  const { toast } = useToast();
  const exerciceActuel = new Date().getFullYear();
  const [exercice, setExercice] = useState(exerciceActuel);
  const [mode, setMode] = useState<BalanceImportMode>("historique");
  const [fichier, setFichier] = useState<File | null>(null);
  const [preview, setPreview] = useState<BalanceSagePreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, number | undefined>>({});
  const [importSelectionne, setImportSelectionne] = useState<number | null>(null);
  const [detail, setDetail] = useState<BalanceSageDetail | null>(null);
  const [contrepartie, setContrepartie] = useState("");
  const [preparation, setPreparation] = useState<BalanceSagePreparation | null>(null);
  const [suggestions, setSuggestions] = useState<BalanceSageContrepartieSuggestion[]>([]);
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const importsQuery = useQuery({
    queryKey: ["balances-sage-imports", exercice],
    queryFn: () => apiFetch<BalanceSageImport[]>(`/api/comptabilite/balances-sage/imports?exercice=${exercice}`),
  });
  const imports = importsQuery.data ?? [];
  const auditQuery = useQuery({
    queryKey: ["balances-sage-reprise-audit", exercice, importSelectionne],
    queryFn: () => {
      const params = new URLSearchParams({ exercice: String(exercice) });
      if (importSelectionne !== null) params.set("importId", String(importSelectionne));
      return apiFetch<BalanceSageAuditEvent[]>(`/api/comptabilite/balances-sage/reprises/audit?${params.toString()}`);
    },
  });
  const auditEvents = auditQuery.data ?? [];

  const lireDetail = async (id: number) => {
    try {
      const value = await apiFetch<BalanceSageDetail>(`/api/comptabilite/balances-sage/imports/${id}`);
      setImportSelectionne(id); setDetail(value);
      setPreparation(null);
      setSuggestions([]); setSuggestionMessage("");
      if (value.compteContrepartie) setContrepartie(value.compteContrepartie);
    } catch (err) {
      toast({ title: "Impossible de charger l'import", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handlePreview = async () => {
    if (!fichier) { toast({ title: "Choisissez un fichier Sage", variant: "destructive" }); return; }
    setActionLoading(true);
    try {
      const value = await apiUpload<BalanceSagePreview>("/api/comptabilite/balances-sage/preview", fichier);
      setPreview(value); setMapping(value.mappingSuggere);
    } catch (err) {
      toast({ title: "Lecture impossible", description: (err as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const handleImport = async () => {
    if (!fichier || !preview) return;
    setActionLoading(true);
    try {
      await apiUpload<BalanceSageImport>("/api/comptabilite/balances-sage/imports", fichier, { exercice, mode, mapping: JSON.stringify(mapping) });
      toast({ title: mode === "historique" ? "Balance importée pour consultation" : "Balance importée pour préparation" });
      setFichier(null); setPreview(null); setShowImport(false);
      void importsQuery.refetch();
    } catch (err) {
      toast({ title: "Import refusé", description: (err as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const handlePrepare = async () => {
    if (!detail || !contrepartie.trim()) {
      toast({ title: "Compte de contrepartie requis", variant: "destructive" }); return;
    }
    setActionLoading(true);
    try {
      const value = await apiPost<BalanceSagePreparation>(`/api/comptabilite/balances-sage/imports/${detail.id}/preparer-reprise`, { compteContrepartie: contrepartie.trim() });
      setPreparation(value); setDetail({ ...detail, ...value.import });
      void importsQuery.refetch();
      void auditQuery.refetch();
      void apiFetch<BalanceSageDetail>(`/api/comptabilite/balances-sage/imports/${detail.id}`).then(setDetail).catch(() => {});
      toast({ title: "Reprise préparée", description: "Contrôlez les écritures proposées avant validation." });
    } catch (err) {
      void auditQuery.refetch();
      toast({ title: "Préparation impossible", description: (err as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const handleSuggest = async () => {
    if (!detail) return;
    setSuggestionsLoading(true);
    setSuggestionMessage("");
    try {
      const value = await apiPost<BalanceSageSuggestionsResponse>(`/api/comptabilite/balances-sage/imports/${detail.id}/suggestions-contreparties`, {});
      setSuggestions(value.suggestions);
      const message = value.message ?? (value.suggestions.length ? "Sélectionnez une suggestion pour la reprendre dans le formulaire." : "");
      setSuggestionMessage(message);
      if (!value.disponible && message) {
        toast({ title: "Suggestion Claude indisponible", description: message, variant: "destructive" });
      }
    } catch (err) {
      setSuggestions([]);
      const message = (err as Error).message || "La suggestion Claude est indisponible. Vous pouvez saisir le compte manuellement.";
      setSuggestionMessage(message);
      toast({ title: "Suggestion Claude impossible", description: message, variant: "destructive" });
    } finally { setSuggestionsLoading(false); }
  };

  const handleValidate = async () => {
    if (!detail || !preparation) return;
    setActionLoading(true);
    try {
      const value = await apiPost<BalanceSageImport & { message: string }>(`/api/comptabilite/balances-sage/imports/${detail.id}/valider-reprise`, {});
      toast({ title: "Reprise validée", description: value.message });
      setDetail({ ...detail, ...value }); setPreparation(null); void importsQuery.refetch();
      void auditQuery.refetch();
      void apiFetch<BalanceSageDetail>(`/api/comptabilite/balances-sage/imports/${detail.id}`).then(setDetail).catch(() => {});
    } catch (err) {
      void auditQuery.refetch();
      toast({ title: "Validation impossible", description: (err as Error).message, variant: "destructive" });
    } finally { setActionLoading(false); }
  };

  const mappingFields = [
    ["numeroCompte", "Numéro de compte", true], ["libelle", "Intitulé", true],
    ["totalDebit", "Mouvements débit", true], ["totalCredit", "Mouvements crédit", true],
    ["soldeDebiteur", "Solde débiteur", false], ["soldeCrediteur", "Solde créditeur", false],
  ] as const;
  const statusLabel: Record<string, string> = { importe: "Importé", a_corriger: "À vérifier", preparee: "Préparée", validee: "Validée" };
  const statusColor: Record<string, string> = { importe: "bg-blue-50 text-blue-700", a_corriger: "bg-amber-50 text-amber-700", preparee: "bg-purple-50 text-purple-700", validee: "bg-green-50 text-green-700" };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Balances Sage</h2>
          <p className="text-sm text-gray-500 mt-1">Importez une balance .xls sans fabriquer de faux journaux historiques.</p>
        </div>
        <button onClick={() => { setShowImport(true); setPreview(null); }} className="ml-auto flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: VERT }}>
          <Upload size={15} /> Importer une balance
        </button>
      </div>

      <div className="flex items-end gap-3">
        <div><label className="block text-xs font-medium text-gray-500 mb-1">Exercice</label>
           <select value={exercice} onChange={(e) => { setExercice(Number(e.target.value)); setDetail(null); setImportSelectionne(null); }} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {Array.from({ length: 6 }, (_, i) => exerciceActuel - i).map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        <span className="text-xs text-gray-500 pb-2">Les imports sont isolés par coopérative, exercice et mode.</span>
      </div>

      {showImport && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
          <div className="flex items-start justify-between"><div><h3 className="font-semibold text-gray-900">Assistant d’import Sage</h3><p className="text-xs text-gray-500 mt-1">Le fichier n’est lu qu’en mémoire. Les montants sont normalisés en FCFA.</p></div><button onClick={() => setShowImport(false)}><X size={18} className="text-gray-400" /></button></div>
          <div className="grid md:grid-cols-2 gap-3">
            <label className="border rounded-lg p-3 cursor-pointer hover:border-green-500"><input type="radio" checked={mode === "historique"} onChange={() => setMode("historique")} className="mr-2" /><strong className="text-sm">Consultation historique</strong><span className="block text-xs text-gray-500 ml-5 mt-1">Conserve la balance sans modifier le journal.</span></label>
            <label className="border rounded-lg p-3 cursor-pointer hover:border-green-500"><input type="radio" checked={mode === "reprise"} onChange={() => setMode("reprise")} className="mr-2" /><strong className="text-sm">Préparer une reprise</strong><span className="block text-xs text-gray-500 ml-5 mt-1">Prépare des à-nouveaux contrôlables, puis validables.</span></label>
          </div>
          <div className="flex flex-wrap gap-3 items-center"><input type="file" accept=".xls,.xlsx,.csv" onChange={(e) => setFichier(e.target.files?.[0] ?? null)} className="text-sm" /><button onClick={handlePreview} disabled={!fichier || actionLoading} className="px-3 py-2 rounded-lg border text-sm disabled:opacity-40">{actionLoading ? "Lecture…" : "Prévisualiser"}</button></div>
          {preview && (
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 size={16} /> {preview.lignesDetectees} lignes détectées dans la feuille « {preview.feuille} »</div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {mappingFields.map(([key, label, required]) => <label key={key} className="text-xs font-medium text-gray-600">{label}{required ? " *" : ""}
                  <select value={mapping[key] ?? ""} onChange={(e) => setMapping({ ...mapping, [key]: e.target.value === "" ? undefined : Number(e.target.value) })} className="mt-1 w-full border rounded-lg px-2 py-2 text-sm">
                    {!required && <option value="">Déduire du débit/crédit</option>}
                    {preview.headers.map((header, index) => <option key={header} value={index}>{header}</option>)}
                  </select>
                </label>)}
              </div>
              <div className="overflow-x-auto border rounded-lg"><table className="text-xs min-w-full"><tbody>{preview.preview.slice(0, 5).map((row, i) => <tr key={i} className="border-b last:border-0">{(row as unknown[]).map((cell, j) => <td key={j} className="px-2 py-1.5 whitespace-nowrap">{String(cell ?? "")}</td>)}</tr>)}</tbody></table></div>
              <button onClick={handleImport} disabled={actionLoading} className="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50" style={{ backgroundColor: VERT }}>{actionLoading ? "Import…" : `Importer en mode ${mode === "historique" ? "consultation" : "reprise"}`}</button>
            </div>
          )}
        </div>
      )}

      {imports.length === 0 ? <div className="bg-white rounded-xl border border-dashed p-12 text-center text-sm text-gray-500"><FileSpreadsheet className="mx-auto mb-3 text-gray-300" size={36} />Aucune balance Sage importée pour {exercice}.</div> :
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden"><table className="w-full text-sm"><thead className="bg-gray-50"><tr><th className="text-left px-4 py-3 text-xs text-gray-500">Fichier</th><th className="text-left px-4 py-3 text-xs text-gray-500">Mode</th><th className="text-left px-4 py-3 text-xs text-gray-500">État</th><th className="text-right px-4 py-3 text-xs text-gray-500">Lignes</th><th className="px-4 py-3" /></tr></thead><tbody>{imports.map((item) => <tr key={item.id} className="border-t hover:bg-gray-50"><td className="px-4 py-3"><div className="font-medium">{item.nomFichier}</div><div className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleString("fr-FR")}</div></td><td className="px-4 py-3">{item.mode === "historique" ? "Consultation" : "Reprise"}</td><td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs ${statusColor[item.statut] ?? "bg-gray-100 text-gray-600"}`}>{statusLabel[item.statut] ?? item.statut}{item.nombreErreurs ? ` · ${item.nombreErreurs} erreur(s)` : ""}</span></td><td className="px-4 py-3 text-right">{item.nombreLignes}</td><td className="px-4 py-3 text-right"><button onClick={() => void lireDetail(item.id)} className="text-green-700 hover:underline text-xs">Consulter</button></td></tr>)}</tbody></table></div>}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Journal d’audit des reprises</h3>
          <p className="text-xs text-gray-500 mt-1">
            {importSelectionne === null ? `Événements de l’exercice ${exercice}` : `Événements de l’import sélectionné · exercice ${exercice}`}
          </p>
        </div>
        {auditQuery.isLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-5 w-5 border-2 border-green-600 border-t-transparent" /></div>
        ) : auditEvents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Aucun événement de reprise enregistré pour ce filtre.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-gray-100">
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Date</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Import</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Événement</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Utilisateur</th>
                <th className="text-left px-4 py-2.5 font-semibold text-gray-500">Détail</th>
              </tr></thead>
              <tbody>
                {auditEvents.map((event) => {
                  const actionLabel = event.action === "preparation" ? "Préparation" : "Validation";
                  const success = event.statut === "succes";
                  return (
                    <tr key={event.id} className="border-t border-gray-50 align-top">
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{new Date(event.createdAt).toLocaleString("fr-FR")}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <button className="text-left hover:text-green-700 hover:underline" onClick={() => void lireDetail(event.importId)}>
                          {event.nomFichier ?? `Import #${event.importId}`}
                        </button>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full ${success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                          {success ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                          {success ? actionLabel : `Échec — ${actionLabel.toLowerCase()}`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{event.userNom ?? (event.userId ? `Utilisateur #${event.userId}` : "Utilisateur inconnu")}</td>
                      <td className={`px-4 py-3 min-w-64 ${success ? "text-gray-500" : "text-red-700"}`}>{event.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detail && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
           <div className="flex items-start justify-between"><div><h3 className="font-semibold text-gray-900">{detail.nomFichier}</h3><p className="text-xs text-gray-500">{detail.mode === "historique" ? "Consultation sans impact sur les écritures" : "Reprise par à-nouveaux"}</p></div><button onClick={() => { setDetail(null); setImportSelectionne(null); }}><X size={18} className="text-gray-400" /></button></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"><div className="bg-gray-50 rounded-lg p-3"><span className="text-xs text-gray-500">Lignes</span><strong className="block">{detail.nombreLignes}</strong></div><div className="bg-gray-50 rounded-lg p-3"><span className="text-xs text-gray-500">Erreurs</span><strong className="block">{detail.nombreErreurs}</strong></div><div className="bg-gray-50 rounded-lg p-3"><span className="text-xs text-gray-500">Comptes inconnus</span><strong className="block">{detail.comptesInconnus}</strong></div><div className="bg-gray-50 rounded-lg p-3"><span className="text-xs text-gray-500">État</span><strong className="block">{statusLabel[detail.statut] ?? detail.statut}</strong></div></div>
           {detail.mode === "reprise" && (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
               <div className="rounded-lg border border-purple-100 bg-purple-50/50 px-3 py-2.5">
                 <p className="text-xs font-semibold text-purple-700">Préparée par</p>
                 <p className="text-sm text-gray-800 mt-0.5">{detail.prepareeParNom ?? "—"}</p>
                 <p className="text-xs text-gray-500">{detail.prepareeLe ? new Date(detail.prepareeLe).toLocaleString("fr-FR") : "Pas encore préparée"}</p>
               </div>
               <div className="rounded-lg border border-green-100 bg-green-50/50 px-3 py-2.5">
                 <p className="text-xs font-semibold text-green-700">Validée par</p>
                 <p className="text-sm text-gray-800 mt-0.5">{detail.valideeParNom ?? "—"}</p>
                 <p className="text-xs text-gray-500">{detail.valideeLe ? new Date(detail.valideeLe).toLocaleString("fr-FR") : "Pas encore validée"}</p>
               </div>
             </div>
           )}
          <div className="overflow-x-auto max-h-80 border rounded-lg"><table className="w-full text-xs"><thead className="sticky top-0 bg-gray-50"><tr><th className="text-left p-2">Compte</th><th className="text-left p-2">Libellé</th><th className="text-right p-2">Solde débiteur</th><th className="text-right p-2">Solde créditeur</th><th className="text-left p-2">Contrôle</th></tr></thead><tbody>{detail.lignes.map((line) => <tr key={line.numeroLigne} className="border-t"><td className="p-2 font-mono">{line.numeroCompte}</td><td className="p-2">{line.libelle}</td><td className="p-2 text-right">{FCFA(line.soldeDebiteur)}</td><td className="p-2 text-right">{FCFA(line.soldeCrediteur)}</td><td className={`p-2 ${line.erreur ? "text-amber-700" : "text-green-700"}`}>{line.erreur ?? "OK"}</td></tr>)}</tbody></table></div>
          {detail.mode === "reprise" && detail.statut !== "validee" && (
            <div className="border-t pt-4 space-y-3">
              <div>
                <h4 className="font-semibold text-sm">Préparer les à-nouveaux</h4>
                <p className="text-xs text-gray-500">Le compte doit être présent dans le plan comptable actif. Claude peut proposer des comptes à partir de ce plan, mais le choix reste à confirmer par le comptable.</p>
              </div>
              {detail.statut !== "preparee" && (
                <div className="space-y-2">
                  <button onClick={handleSuggest} disabled={suggestionsLoading || actionLoading} className="px-3 py-2 rounded-lg border border-purple-200 bg-purple-50 text-purple-800 text-sm font-medium disabled:opacity-50">
                    <span className="inline-flex items-center gap-1.5">{suggestionsLoading ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />} Suggérer avec Claude</span>
                  </button>
                  {suggestions.length > 0 && (
                    <div className="grid gap-2 md:grid-cols-3">
                      {suggestions.map((suggestion) => (
                        <button key={suggestion.numeroCompte} onClick={() => setContrepartie(suggestion.numeroCompte)} className={`text-left rounded-lg border p-3 transition-colors ${contrepartie === suggestion.numeroCompte ? "border-purple-500 bg-purple-50 ring-1 ring-purple-300" : "border-gray-200 hover:border-purple-300 hover:bg-purple-50/40"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold text-sm text-gray-900">{suggestion.numeroCompte}</span>
                            <span className="text-xs font-medium text-purple-700">{suggestion.score}%</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{suggestion.libelle}</p>
                          <p className="text-xs text-gray-500 mt-2">{suggestion.raison}</p>
                          <span className="text-xs text-purple-700 mt-2 inline-block">{contrepartie === suggestion.numeroCompte ? "Sélectionné" : "Utiliser ce compte"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {suggestionMessage && <p className="text-xs text-gray-500">{suggestionMessage}</p>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <input value={contrepartie} onChange={(e) => setContrepartie(e.target.value)} placeholder="Compte de contrepartie" className="border rounded-lg px-3 py-2 text-sm font-mono" />
                <button onClick={handlePrepare} disabled={actionLoading || detail.statut === "preparee"} className="px-3 py-2 rounded-lg text-white text-sm disabled:opacity-40" style={{ backgroundColor: VERT }}>{detail.statut === "preparee" ? "Reprise préparée" : "Préparer pour contrôle"}</button>
              </div>
            </div>
          )}
          {preparation && detail.statut === "preparee" && <div className="border rounded-lg bg-purple-50/50 p-4 space-y-3"><div className="flex justify-between text-sm"><span>Total débiteur : <strong>{FCFA(preparation.totalDebiteur)}</strong></span><span>Total créditeur : <strong>{FCFA(preparation.totalCrediteur)}</strong></span></div><p className="text-xs text-purple-800">{preparation.nombreEcritures} écritures seront ajoutées comme à-nouveaux. Contrôlez la liste puis validez.</p><div className="max-h-44 overflow-y-auto text-xs space-y-1">{preparation.ecritures.map((entry, i) => <div key={i} className="flex justify-between gap-3"><span>{entry.compteDebit} → {entry.compteCredit}</span><span className="font-medium">{FCFA(entry.montantFcfa)}</span></div>)}</div><button onClick={handleValidate} disabled={actionLoading} className="px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50" style={{ backgroundColor: VERT }}>{actionLoading ? "Validation…" : "Valider définitivement la reprise"}</button></div>}
        </div>
      )}
    </div>
  );
}

// ─── Onglet Balance auxiliaire (solde par tiers) ─────────────────────────────
interface BalanceAuxLigne {
  tiersId: number; nom: string; prenoms: string; code: string;
  totalDu: number; totalPaye: number;
  totalIntrantsDus: number; totalIntrantsRemb: number; soldeNet: number;
  compteAuxiliaire: string | null;
  comptesAuxiliaires: Array<{ compteCollectif: string; numeroCompte: string }>;
}

const TYPES_TIERS = [
  { id: "membre",         label: "Membres",        labelDu: "Dû au membre",      labelPaye: "Payé",    showIntrants: true,  lienBase: "/membres/", comptes: ["401", "4091", "4092"] },
  { id: "membre_delegue", label: "Membres délégués", labelDu: "Dû au membre-délégué", labelPaye: "Payé", showIntrants: false, lienBase: "/membres/", comptes: ["401", "4091", "4092"] },
  { id: "delegue",        label: "Délégués",        labelDu: "Dû au délégué",     labelPaye: "Payé",    showIntrants: false, lienBase: null, comptes: ["401", "4091", "4092"] },
  { id: "personnel",      label: "Personnel",       labelDu: "Salaire dû (421)",  labelPaye: "Versé",   showIntrants: false, lienBase: null, comptes: ["421"] },
  { id: "exportateur",    label: "Exportateurs",    labelDu: "Créance (4111)",     labelPaye: "Encaissé", showIntrants: false, lienBase: null, comptes: ["411", "4111"] },
  { id: "fournisseur_ext", label: "Fournisseurs ext.", labelDu: "Dû fournisseur (401)", labelPaye: "Payé", showIntrants: false, lienBase: null, comptes: ["401"] },
] as const;
type TiersType = typeof TYPES_TIERS[number]["id"];

function OngletBalanceAuxiliaire() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const anneeActuelle = new Date().getFullYear();
  const [exercice, setExercice]   = useState(anneeActuelle);
  const [recherche, setRecherche] = useState("");
  const [journalSage, setJournalSage] = useState("CAIS");
  const [tiersType, setTiersType] = useState<TiersType>("membre");
  const [edition, setEdition] = useState<{ tiersId: number; valeurs: Record<string, string> } | null>(null);
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);
  const annees = Array.from({ length: 5 }, (_, i) => anneeActuelle - i);
  const typeMeta = TYPES_TIERS.find(t => t.id === tiersType)!;

  const { data, isLoading } = useQuery({
    queryKey: ["balance-aux", exercice, tiersType],
    queryFn: () => apiFetch<BalanceAuxLigne[]>(`/api/comptabilite/balance-auxiliaire?exercice=${exercice}&tiersType=${tiersType}`),
  });

  const list = (data ?? []).filter((l) => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (
      l.nom.toLowerCase().includes(q) ||
      l.prenoms.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
    );
  });

  const totalSolde = list.reduce((s, l) => s + l.soldeNet, 0);

  const ouvrirEdition = (ligne: BalanceAuxLigne) => {
    const valeurs: Record<string, string> = {};
    typeMeta.comptes.forEach((compte) => {
      valeurs[compte] = ligne.comptesAuxiliaires?.find((item) => item.compteCollectif === compte)?.numeroCompte ?? "";
    });
    setEdition({ tiersId: ligne.tiersId, valeurs });
  };

  const enregistrerComptes = async () => {
    if (!edition) return;
    setSauvegardeEnCours(true);
    try {
      await apiPut(`/api/comptabilite/comptes-tiers/${tiersType}/${edition.tiersId}`, {
        comptes: typeMeta.comptes
          .map((compteCollectif) => ({
            compteCollectif,
            numeroCompte: edition.valeurs[compteCollectif]?.trim() ?? "",
          }))
          .filter((item) => item.numeroCompte.length > 0),
      });
      await queryClient.invalidateQueries({ queryKey: ["balance-aux", exercice, tiersType] });
      setEdition(null);
      toast({ title: "Comptes du tiers enregistrés" });
    } catch (error) {
      toast({
        title: "Impossible d'enregistrer les comptes",
        description: error instanceof Error ? error.message : "Vérifiez les numéros saisis.",
        variant: "destructive",
      });
    } finally {
      setSauvegardeEnCours(false);
    }
  };

  const handleExportSageTxt = async () => {
    try {
      const journal = journalSage.trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,8}$/.test(journal)) {
        throw new Error("Le code journal doit contenir de 1 à 8 caractères alphanumériques.");
      }
      const params = new URLSearchParams({ exercice: String(exercice), journal });
      const response = await fetch(`${_BASE}/api/comptabilite/balance-auxiliaire/export-txt?${params.toString()}`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { erreur?: string; tiersSansCompte?: string[] };
        const detail = payload.tiersSansCompte?.slice(0, 3).join(", ");
        throw new Error(`${payload.erreur ?? response.statusText}${detail ? ` : ${detail}` : ""}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `coopdigital_sage_${journal}_${exercice}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      toast({
        title: "Export TXT Sage généré",
        description: "Le fichier délimité est prêt à être importé avec le format Sage paramétré.",
      });
    } catch (error) {
      toast({
        title: "Export TXT Sage impossible",
        description: error instanceof Error ? error.message : "Des comptes tiers sont peut-être manquants.",
        variant: "destructive",
      });
    }
  };

  const handleExport = () => void exportExcel(
    `balance_auxiliaire_${tiersType}_${exercice}.xlsx`,
    `Balance auxiliaire — ${typeMeta.label}`,
    [
      { header: "Nom",               key: "nom",            width: 28 },
      { header: "Prénoms",           key: "prenoms",        width: 22 },
      { header: tiersType === "personnel" ? "Poste" : tiersType === "membre" ? "Code carte" : "—",
                                       key: "code",           width: 16 },
      { header: typeMeta.labelDu,    key: "totalDu",        width: 18, numFmt: "#,##0", align: "right" as const },
      { header: typeMeta.labelPaye,  key: "totalPaye",      width: 18, numFmt: "#,##0", align: "right" as const },
      ...(typeMeta.showIntrants ? [
        { header: "Intrants dus",    key: "intrantsDus",    width: 16, numFmt: "#,##0", align: "right" as const },
        { header: "Intrants remb.",  key: "intrantsRemb",   width: 16, numFmt: "#,##0", align: "right" as const },
      ] : []),
      { header: "Solde net",         key: "soldeNet",       width: 18, numFmt: "#,##0;[Red]-#,##0", align: "right" as const },
    ],
    list.map((l) => ({
      nom:          l.nom,
      prenoms:      l.prenoms,
      code:         l.code,
      totalDu:      Number(l.totalDu),
      totalPaye:    Number(l.totalPaye),
      intrantsDus:  Number(l.totalIntrantsDus),
      intrantsRemb: Number(l.totalIntrantsRemb),
      soldeNet:     Number(l.soldeNet),
    }))
  );

  return (
    <div>
      {/* Sélecteur de type de tiers */}
      <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-xl p-1 w-full sm:flex sm:flex-wrap sm:w-fit mb-5">
        {TYPES_TIERS.map((t) => (
          <button key={t.id}
            onClick={() => { setTiersType(t.id); setRecherche(""); }}
            className={`min-w-0 px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tiersType === t.id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="block truncate">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[auto_auto_minmax(0,1fr)] items-end gap-3 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Exercice</label>
          <select value={exercice} onChange={(e) => setExercice(Number(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700">
            {annees.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Journal Sage</label>
          <input
            value={journalSage}
            onChange={(e) => setJournalSage(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 8))}
            placeholder="CAIS"
            maxLength={8}
            className="w-full sm:w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-green-700"
          />
        </div>
        <div className="min-w-0">
          <label className="block text-xs font-medium text-gray-500 mb-1">Recherche</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Nom, prénoms…"
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
            />
          </div>
        </div>
        <div className="col-span-1 flex min-w-0 flex-wrap items-center justify-between gap-3 sm:col-span-3 sm:justify-end">
          <p className="text-sm text-gray-500">{list.length} {typeMeta.label.toLowerCase()}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleExport} disabled={list.length === 0}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-40">
              <Download size={14} /> Exporter Excel
            </button>
            <button onClick={() => void handleExportSageTxt()}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5 hover:opacity-90"
              style={{ backgroundColor: "#2563eb" }}>
              <FileText size={14} /> Export TXT Sage
            </button>
          </div>
        </div>
      </div>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <FileText size={16} className="mt-0.5 shrink-0" />
        <p>
          Les comptes collectifs CoopDigital restent inchangés. Utilisez <strong>Modifier</strong> pour associer
          chaque tiers à son ou ses comptes détaillés Sage. L’export est bloqué si une écriture utilise un compte tiers non paramétré.
          Le fichier TXT utilise le journal et le format délimité affichés dans cette page.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-2 border-green-600 border-t-transparent" /></div>
      ) : list.length === 0 ? (
        <div className="text-center py-16">
          <Users className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500 text-sm">Aucun tiers avec des mouvements pour l'exercice {exercice}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{typeMeta.label}</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">
                    {tiersType === "personnel" ? "Poste" : "Code"}
                  </th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{typeMeta.labelDu}</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">{typeMeta.labelPaye}</th>
                  {typeMeta.showIntrants && (
                    <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Intrants nets</th>
                  )}
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Solde net</th>
                  <th className="px-3 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {list.map((l) => {
                  const positif = l.soldeNet >= 0;
                  const intrantsNet = l.totalIntrantsDus - l.totalIntrantsRemb;
                  return (
                    <>
                    <tr key={l.tiersId} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{l.nom} {l.prenoms}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden sm:table-cell font-mono">{l.code || "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{FCFA(l.totalDu)}</td>
                      <td className="px-4 py-3 text-right text-green-700 hidden lg:table-cell">{FCFA(l.totalPaye)}</td>
                      {typeMeta.showIntrants && (
                        <td className={`px-4 py-3 text-right hidden lg:table-cell ${intrantsNet > 0 ? "text-amber-600" : "text-gray-400"}`}>{FCFA(intrantsNet)}</td>
                      )}
                      <td className={`px-4 py-3 text-right font-bold ${positif ? "text-green-700" : "text-red-600"}`}>
                        {positif ? "+" : ""}{FCFA(l.soldeNet)}
                      </td>
                      <td className="px-3 py-3 min-w-[170px]">
                        <div className="flex items-center justify-end gap-2">
                          {l.compteAuxiliaire ? (
                            <span className="font-mono text-xs text-gray-700">{l.compteAuxiliaire}</span>
                          ) : (
                            <span className="text-xs text-amber-600">Non paramétré</span>
                          )}
                          <button
                            onClick={() => ouvrirEdition(l)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                          >
                            <Pencil size={12} /> Modifier
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        {typeMeta.lienBase && (
                          <Link href={`${typeMeta.lienBase}${l.tiersId}`}
                            className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                            Fiche →
                          </Link>
                        )}
                      </td>
                    </tr>
                    {edition?.tiersId === l.tiersId && (
                      <tr className="border-b border-blue-100 bg-blue-50/60">
                        <td colSpan={typeMeta.showIntrants ? 7 : 6} className="px-4 py-4">
                          <div className="flex flex-wrap items-end gap-3">
                            {typeMeta.comptes.map((compteCollectif) => (
                              <label key={compteCollectif} className="min-w-[150px]">
                                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                                  Compte collectif {compteCollectif}
                                </span>
                                <input
                                  value={edition.valeurs[compteCollectif] ?? ""}
                                  onChange={(event) => setEdition((current) => current ? {
                                    ...current,
                                    valeurs: { ...current.valeurs, [compteCollectif]: event.target.value.toUpperCase() },
                                  } : current)}
                                  placeholder={`Ex. ${compteCollectif}000001`}
                                  maxLength={20}
                                  className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </label>
                            ))}
                            <div className="flex gap-2">
                              <button onClick={() => void enregistrerComptes()} disabled={sauvegardeEnCours}
                                className="rounded-lg px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                                style={{ backgroundColor: VERT }}>
                                {sauvegardeEnCours ? "Enregistrement…" : "Enregistrer"}
                              </button>
                              <button onClick={() => setEdition(null)} disabled={sauvegardeEnCours}
                                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
                                Annuler
                              </button>
                            </div>
                          </div>
                          <p className="mt-2 text-xs text-blue-700">
                            Laissez un champ vide pour retirer cette correspondance. Les numéros sont uniques dans la coopérative.
                          </p>
                        </td>
                      </tr>
                    )}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={typeMeta.showIntrants ? 2 : 2} className="px-4 py-3 font-bold text-gray-700 text-sm">
                    TOTAUX ({list.length})
                  </td>
                  <td colSpan={typeMeta.showIntrants ? 3 : 2} className="hidden lg:table-cell"></td>
                  <td></td>
                  <td className={`px-4 py-3 text-right font-bold ${totalSolde >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {totalSolde >= 0 ? "+" : ""}{FCFA(totalSolde)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
            <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1"></span>Solde positif = coop doit au tiers</span>
            <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>Solde négatif = tiers doit à la coop</span>
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
    typeEcriture: "normale" as "normale" | "regularisation",
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
        typeEcriture: form.typeEcriture,
      });
      toast({ title: "Écriture enregistrée" });
      void qc.invalidateQueries({ queryKey: ["grand-livre"] });
      void qc.invalidateQueries({ queryKey: ["journal-comptable"] });
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
            <label className="block text-xs font-medium text-gray-600 mb-1">Type d'écriture</label>
            <select
              value={form.typeEcriture}
              onChange={(e) => setForm((f) => ({ ...f, typeEcriture: e.target.value as "normale" | "regularisation" }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
            >
              <option value="normale">Normale</option>
              <option value="regularisation">Régularisation</option>
            </select>
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
            <MoneyInput value={form.montantFcfa} placeholder="150 000"
              onChange={(raw) => setForm((f) => ({ ...f, montantFcfa: raw }))}
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

// ─── Onglet Clôture d'exercice ────────────────────────────────────────────────
interface ExerciceStatut { id: number; annee: number; statut: string; }

interface ApercuCloture {
  exercice: number; statut: string; alertes: string[];
  soldes: {
    produitsExploitation: number; chargesExploitation: number; resultatExploitation: number;
    produitsFinanciers: number;   chargesFinancieres: number;  resultatFinancier: number;
    rao: number;
    produitsHAO: number;          chargesHAO: number;          resultatHAO: number;
    avantImpot: number;           impot: number;               net: number;
  };
  tresorerie: number; fournisseurs: number; stockCacao: number;
  regularisations?: { libelle: string; compteDebit: string; compteCredit: string; montantFcfa: number }[];
}

interface ApercuRistournes {
  montantTotal: number;
  dejaDeclenche: boolean;
  membres: { membreId: number; nomComplet: string; tonnageKg: number; montantFcfa: number }[];
  campagnes: { id: number; libelle: string; anneeDebut: number; anneeFin: number }[];
  campagneId: number | null;
}

interface HistoriqueAffectationRow {
  exerciceResultat: number;
  beneficeNet: number;
  reserveLegale: number;
  reportANouveau: number;
  ristournes: number;
  dateAffectation: string;
}

interface ApercuAffectation {
  exercice: number;
  solde131: number;
  solde139: number;
  compteResultat: string;
  dejaAffecte: boolean;
  ecrituresAffectation: { dateEcriture: string; libelle: string; compteDebit: string; compteCredit: string; montantFcfa: number }[];
}
function CompteAutocomplete({ value, onChange, placeholder, filter }: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  filter?: (c: ComptePC) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  const { data: plan = [] } = useQuery<ComptePC[]>({
    queryKey: ["plan-comptable"],
    queryFn: () => apiFetch<ComptePC[]>("/api/comptabilite/plan"),
    staleTime: 5 * 60 * 1000,
  });

  const lower = q.toLowerCase();
  const suggestions = plan
    .filter((c) => c.actif && (!filter || filter(c)))
    .filter((c) => c.numeroCompte.startsWith(q) || c.libelle.toLowerCase().includes(lower))
    .slice(0, 10);

  // Sync external value → input quand le parent change (ex: changement de type)
  useState(() => { setQ(value); });
  const prevValue = useRef(value);
  if (prevValue.current !== value) { prevValue.current = value; setQ(value); }

  // Fermer si clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        value={q}
        placeholder={placeholder}
        onChange={(e) => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-700"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {suggestions.map((c) => (
            <button key={c.id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(c.numeroCompte); setQ(c.numeroCompte); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-green-50 flex items-center gap-3 border-b border-gray-50 last:border-0">
              <span className="font-mono text-sm font-semibold text-blue-700 w-14 flex-shrink-0">{c.numeroCompte}</span>
              <span className="text-sm text-gray-700 truncate">{c.libelle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Types régularisations ────────────────────────────────────────────────────
// Comptes SYSCOHADA officiels (plan OHADA) :
// 408 = Fournisseurs, Factures non parvenues | 418 = Clients, Produits à recevoir
// 476 = Charges constatées d'avance          | 477 = Produits constatés d'avance
const TYPES_REGUL = [
  { code: "408", label: "Charges à payer",             defaultRegul: "408", exemple: "Facture énergie déc. non reçue",   compteHint: "compte de charge (6xx)",  debitSide: "contrepartie" },
  { code: "418", label: "Produits à recevoir",          defaultRegul: "418", exemple: "Intérêts courus sur placement",    compteHint: "compte de produit (7xx)", debitSide: "fixe" },
  { code: "476", label: "Charges constatées d'avance",  defaultRegul: "476", exemple: "Prime d'assurance payée pour N+1", compteHint: "compte de charge (6xx)",  debitSide: "fixe" },
  { code: "477", label: "Produits constatés d'avance",  defaultRegul: "477", exemple: "Acompte reçu pour livraison N+1",  compteHint: "compte de produit (7xx)", debitSide: "contrepartie" },
] as const;

type TypeRegul = typeof TYPES_REGUL[number]["code"];

interface ClaudeRegularisationSuggestion {
  type: TypeRegul;
  typeLibelle: string;
  compteRegul: string;
  compteRegulLibelle: string;
  compteContrepartie: string;
  compteContrepartieLibelle: string;
  libelle: string;
  montantFcfa: number | null;
  justification: string;
  score: number;
}

interface LigneRegul {
  id: number; dateEcriture: string; libelle: string;
  compteDebit: string; compteCredit: string; montantFcfa: number;
}

function OngletCloture() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const anneeActuelle = new Date().getFullYear();
  const [annee, setAnnee]           = useState(anneeActuelle - 1);
  const [impot, setImpot]           = useState(0);
  const [stock, setStock]           = useState<string>("");
  const [confirm, setConfirm]       = useState(false);
  const [loading, setLoading]       = useState(false);
  const [resultat, setResultat]     = useState<{ message: string; ecrituresGenerees: number; soldes: ApercuCloture["soldes"]; detailEcritures?: { amortissements: number; variationStocks: number; cloture: number; aNouveaux: number; extournesRegularisations: number } } | null>(null);

  // ── Régularisations ────────────────────────────────────────────────────────
  const [rType,      setRType]      = useState<TypeRegul>("408");
  const [rCompteRegul, setRCompteRegul] = useState<string>(TYPES_REGUL[0].defaultRegul);
  const [rCompte,    setRCompte]    = useState("");
  const [rLibelle,   setRLibelle]   = useState("");
  const [rMontant,   setRMontant]   = useState(0);
  const [rLoading,   setRLoading]   = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [suggestionSituation, setSuggestionSituation] = useState("");
  const [suggestionPeriode, setSuggestionPeriode] = useState("");
  const [suggestionMontant, setSuggestionMontant] = useState("");
  const [regularisationSuggestions, setRegularisationSuggestions] = useState<ClaudeRegularisationSuggestion[]>([]);
  const [regularisationSuggestionMessage, setRegularisationSuggestionMessage] = useState("");
  const [regularisationSuggestionsLoading, setRegularisationSuggestionsLoading] = useState(false);

  // ── Affectation du résultat ────────────────────────────────────────────────
  const [dateAG, setDateAG]                 = useState(() => `${anneeActuelle}-03-31`);
  const [reserveLegale, setReserveLegale]   = useState(0);
  const [reportANouveau, setReportANouveau] = useState(0);
  const [ristournes, setRistournes]         = useState(0);
  const [loadingAff, setLoadingAff]         = useState(false);

  const handleSetRType = (code: TypeRegul) => {
    setRType(code);
    setRCompteRegul(TYPES_REGUL.find((t) => t.code === code)?.defaultRegul ?? code);
  };

  const handleSuggestRegularisations = async () => {
    if (suggestionSituation.trim().length < 10) {
      toast({ title: "Décrivez la situation à régulariser", description: "Indiquez par exemple la facture, la période et ce qui a déjà été enregistré.", variant: "destructive" });
      return;
    }
    setRegularisationSuggestionsLoading(true);
    setRegularisationSuggestionMessage("");
    try {
      const body: Record<string, unknown> = {
        exercice: annee,
        situation: suggestionSituation.trim(),
      };
      if (suggestionPeriode.trim()) body["periode"] = suggestionPeriode.trim();
      if (suggestionMontant.trim()) body["montantFcfa"] = Number(suggestionMontant);
      const value = await apiPost<{
        disponible: boolean;
        suggestions: ClaudeRegularisationSuggestion[];
        message?: string;
      }>("/api/comptabilite/regularisations/suggestions-claude", body);
      setRegularisationSuggestions(value.suggestions);
      setRegularisationSuggestionMessage(value.message ?? (value.suggestions.length
        ? "Choisissez une proposition pour reprendre ses valeurs dans le formulaire."
        : "Aucune proposition compatible n’a été trouvée."));
    } catch (err) {
      setRegularisationSuggestions([]);
      setRegularisationSuggestionMessage((err as Error).message || "La suggestion Claude est indisponible. Vous pouvez saisir la régularisation manuellement.");
    } finally {
      setRegularisationSuggestionsLoading(false);
    }
  };

  const handleUseRegularisationSuggestion = (suggestion: ClaudeRegularisationSuggestion) => {
    handleSetRType(suggestion.type);
    setRCompteRegul(suggestion.compteRegul);
    setRCompte(suggestion.compteContrepartie);
    setRLibelle(suggestion.libelle);
    if (suggestion.montantFcfa !== null) {
      setRMontant(suggestion.montantFcfa);
      setSuggestionMontant(String(suggestion.montantFcfa));
    }
    setRegularisationSuggestionMessage("Proposition reprise dans le formulaire. Vérifiez-la puis cliquez sur « Enregistrer ».");
  };

  const regulQuery = useQuery({
    queryKey: ["regularisations", annee],
    queryFn:  () => apiFetch<LigneRegul[]>(`/api/comptabilite/regularisations?exercice=${annee}`),
  });
  const reguls = regulQuery.data ?? [];

  const handleAddRegul = async () => {
    if (!rCompte.trim() || !rLibelle.trim() || rMontant <= 0) {
      toast({ title: "Champs manquants", variant: "destructive" }); return;
    }
    setRLoading(true);
    try {
      await apiPost("/api/comptabilite/regularisations", {
        type: rType, compteContrepartie: rCompte.trim(),
        compteRegul: rCompteRegul.trim(),
        libelle: rLibelle.trim(), montantFcfa: rMontant,
        date: `${annee}-12-31`, exercice: annee,
      });
      toast({ title: "Régularisation enregistrée" });
      setRCompte(""); setRLibelle(""); setRMontant(0);
      void regulQuery.refetch();
      void apercu.refetch();
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally { setRLoading(false); }
  };

  const handleDeleteRegul = async (id: number) => {
    setDeletingId(id);
    try {
      await apiDelete(`/api/comptabilite/regularisations/${id}`);
      toast({ title: "Régularisation supprimée" });
      void regulQuery.refetch();
      void apercu.refetch();
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally { setDeletingId(null); }
  };

  const annees = Array.from({ length: 6 }, (_, i) => anneeActuelle - 1 - i);

  const { data: exercices, refetch: refetchEx } = useQuery({
    queryKey: ["exercices-statuts"],
    queryFn: () => apiFetch<ExerciceStatut[]>("/api/comptabilite/exercices"),
  });

  const stockNum  = stock !== "" ? Math.round(Number(stock)) : undefined;
  const apercu = useQuery({
    queryKey: ["cloture-apercu", annee, impot, stockNum],
    queryFn:  () => {
      const params = new URLSearchParams({ exercice: String(annee), impot: String(impot) });
      if (stockNum !== undefined) params.set("stock", String(stockNum));
      return apiFetch<ApercuCloture>(`/api/comptabilite/cloture/apercu?${params.toString()}`);
    },
  });

  const ap = apercu.data;
  const statutAnnee = ap?.statut ?? exercices?.find((e) => e.annee === annee)?.statut;
  const deja = statutAnnee === "cloture";

  const apercuAff = useQuery({
    queryKey: ["affectation-resultat-apercu", annee],
    queryFn: () => apiFetch<ApercuAffectation>(`/api/comptabilite/affectation-resultat?exercice=${annee}`),
    enabled: deja,
    retry: false,
  });

  const historiqueAff = useQuery({
    queryKey: ["historique-affectations"],
    queryFn: () => apiFetch<HistoriqueAffectationRow[]>("/api/comptabilite/historique-affectations"),
  });

  // ── Ristournes — aperçu déclenchement ──────────────────────────────────────
  const [campagneRistId, setCampagneRistId] = useState<number | null>(null);
  const [modeRist,       setModeRist]       = useState("");
  const [loadingRist,    setLoadingRist]    = useState(false);
  const [showRistModal,  setShowRistModal]  = useState(false);

  const apercuRist = useQuery({
    queryKey: ["apercu-ristournes", annee, campagneRistId],
    queryFn: () => {
      const p = new URLSearchParams({ exercice: String(annee) });
      if (campagneRistId) p.set("campagne_id", String(campagneRistId));
      return apiFetch<ApercuRistournes>(`/api/comptabilite/ristournes/apercu?${p.toString()}`);
    },
    enabled: deja,
    retry: false,
  });

  const handleDeclencherRistournes = async () => {
    const ap = apercuRist.data;
    if (!ap?.campagneId && !campagneRistId) {
      toast({ title: "Sélectionnez une campagne", variant: "destructive" }); return;
    }
    setLoadingRist(true);
    try {
      const res = await apiPost<{ count: number; montantTotal: number; message: string }>(
        "/api/comptabilite/ristournes/declencher",
        { exercice: annee, campagneId: campagneRistId ?? ap?.campagneId, modePaiement: modeRist || undefined },
      );
      toast({ title: `✅ ${res.message}` });
      setShowRistModal(false);
      void apercuRist.refetch();
      void qc.invalidateQueries({ queryKey: ["historique-affectations"] });
    } catch (err) {
      toast({ title: "Erreur", description: (err as Error).message, variant: "destructive" });
    } finally { setLoadingRist(false); }
  };

  const handleAffectation = async () => {
    setLoadingAff(true);
    try {
      const res = await apiPost<{ message: string; ecrituresGenerees: number; affectation: { reserveLegale: number; reportANouveau: number; ristournes: number; total: number } }>(
        "/api/comptabilite/affectation-resultat",
        { exercice: annee, dateAG, reserveLegale, reportANouveau, ristournes },
      );
      toast({ title: `✅ Affectation enregistrée`, description: `${res.ecrituresGenerees} écriture${res.ecrituresGenerees > 1 ? "s" : ""} générée${res.ecrituresGenerees > 1 ? "s" : ""}` });
      void apercuAff.refetch();
      void qc.invalidateQueries({ queryKey: ["grand-livre"] });
      void qc.invalidateQueries({ queryKey: ["balance"] });
    } catch (err) {
      toast({ title: "Erreur lors de l'affectation", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoadingAff(false);
    }
  };

  const handleCloture = async () => {
    setLoading(true);
    try {
      const body: Record<string, number> = { exercice: annee, impotResultat: impot };
      if (stockNum !== undefined) body["stockFinalCacao"] = stockNum;
      const res = await apiPost<{ message: string; ecrituresGenerees: number; soldes: ApercuCloture["soldes"]; detailEcritures?: { amortissements: number; variationStocks: number; cloture: number; aNouveaux: number; extournesRegularisations: number } }>(
        "/api/comptabilite/cloture", body
      );
      setResultat(res);
      toast({ title: `✅ Exercice ${annee} clôturé`, description: `${res.ecrituresGenerees} écritures générées` });
      void refetchEx();
      void apercu.refetch();
      void qc.invalidateQueries({ queryKey: ["grand-livre"] });
      void qc.invalidateQueries({ queryKey: ["balance"] });
      setConfirm(false);
    } catch (err) {
      toast({ title: "Erreur lors de la clôture", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const SIG = ({ label, montant, indent = false, bold = false, positif }: {
    label: string; montant: number; indent?: boolean; bold?: boolean; positif?: boolean;
  }) => {
    const color = positif !== undefined ? (positif || montant >= 0 ? "text-green-700" : "text-red-600") : "text-gray-800";
    return (
      <div className={`flex items-center justify-between py-1.5 ${indent ? "pl-4" : ""} ${bold ? "border-t border-gray-200 mt-1 pt-2.5" : ""}`}>
        <span className={`text-sm ${bold ? "font-semibold text-gray-900" : "text-gray-600"}`}>{label}</span>
        <span className={`text-sm font-mono ${bold ? "font-bold" : ""} ${color}`}>
          {montant >= 0 ? "" : "−"}{FCFA(Math.abs(montant))}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-5">

      {/* En-tête + paramètres */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
          <Lock size={16} className="text-gray-500" /> Clôture d'exercice OHADA
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          Simule le résultat net avant de verrouiller définitivement l'exercice.
          L'opération est irréversible.
        </p>

        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Exercice</label>
            <select value={annee}
              onChange={(e) => {
                setAnnee(Number(e.target.value));
                setConfirm(false);
                setResultat(null);
                setRegularisationSuggestions([]);
                setRegularisationSuggestionMessage("");
              }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700">
              {annees.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">IS / Impôt résultat (FCFA)</label>
            <MoneyInput value={impot} onChange={(raw) => setImpot(Number(raw) || 0)} className="w-44" placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Stock final cacao (FCFA) <span className="text-gray-400">— optionnel</span></label>
            <MoneyInput
              value={stock}
              min={0}
              onChange={setStock}
              placeholder="Laisser vide si non applicable"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 w-52"
            />
          </div>
        </div>
      </div>

      {/* Statuts exercices */}
      {exercices && exercices.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Exercices</p>
          </div>
          <div className="divide-y divide-gray-50">
            {exercices.map((e) => (
              <div key={e.id} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium text-gray-800">{e.annee}</span>
                {e.statut === "cloture" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                    <Lock size={11} /> Clôturé
                  </span>
                ) : (
                  <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-green-50 text-green-700">Ouvert</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Régularisations d'inventaire ──────────────────────────────────── */}
      {!deja && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
            <RotateCcw size={14} className="text-gray-400" /> Régularisations d'inventaire
          </h3>
          <p className="text-xs text-gray-400 mb-4">
            Rattachez à l'exercice {annee} les charges/produits non encore enregistrés ou à neutraliser (OHADA art. 59).
          </p>

          {/* Assistant de proposition Claude */}
          <div className="rounded-xl border border-purple-100 bg-purple-50/50 p-4 mb-5">
            <div className="flex items-start gap-2 mb-3">
              <Sparkles size={15} className="text-purple-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-semibold text-purple-900">Proposer une régularisation avec Claude</h4>
                <p className="text-xs text-purple-700 mt-1">
                  Claude s’appuie uniquement sur le plan comptable actif de votre coopérative. La proposition doit être vérifiée et enregistrée manuellement.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_13rem] gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Situation à régulariser *</label>
                <textarea
                  value={suggestionSituation}
                  onChange={(e) => setSuggestionSituation(e.target.value)}
                  rows={3}
                  maxLength={3000}
                  placeholder="Ex. Facture d’électricité de décembre 2025 reçue en janvier 2026, montant non encore enregistré."
                  className="w-full border border-purple-100 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Période concernée</label>
                  <input
                    value={suggestionPeriode}
                    onChange={(e) => setSuggestionPeriode(e.target.value)}
                    maxLength={200}
                    placeholder="Ex. décembre 2025"
                    className="w-full border border-purple-100 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Montant (FCFA)</label>
                  <MoneyInput
                    value={suggestionMontant}
                    onChange={setSuggestionMontant}
                    placeholder="Laisser vide si inconnu"
                    className="w-full border border-purple-100 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void handleSuggestRegularisations()}
                disabled={regularisationSuggestionsLoading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-purple-200 bg-white text-purple-800 text-sm font-medium hover:bg-purple-100 disabled:opacity-50"
              >
                {regularisationSuggestionsLoading
                  ? <><RefreshCw size={14} className="animate-spin" /> Analyse en cours…</>
                  : <><Sparkles size={14} /> Proposer avec Claude</>}
              </button>
              {regularisationSuggestionMessage && (
                <p className="text-xs text-gray-600">{regularisationSuggestionMessage}</p>
              )}
            </div>
            {regularisationSuggestions.length > 0 && (
              <div className="grid gap-3 md:grid-cols-3 mt-4">
                {regularisationSuggestions.map((suggestion, index) => {
                  const typeInfo = TYPES_REGUL.find((type) => type.code === suggestion.type);
                  const compteDebit = typeInfo?.debitSide === "contrepartie" ? suggestion.compteContrepartie : suggestion.compteRegul;
                  const compteCredit = typeInfo?.debitSide === "contrepartie" ? suggestion.compteRegul : suggestion.compteContrepartie;
                  return (
                    <div key={`${suggestion.type}-${suggestion.compteRegul}-${suggestion.compteContrepartie}-${index}`} className="rounded-lg border border-purple-100 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-purple-800">{suggestion.typeLibelle}</span>
                        <span className="text-xs font-medium text-purple-700">{suggestion.score}%</span>
                      </div>
                      <p className="text-xs text-gray-700 mt-2">
                        Débit <span className="font-mono font-semibold">{compteDebit}</span>
                        {" "} / Crédit <span className="font-mono font-semibold">{compteCredit}</span>
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        {suggestion.compteRegul} — {suggestion.compteRegulLibelle}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {suggestion.compteContrepartie} — {suggestion.compteContrepartieLibelle}
                      </p>
                      <p className="text-xs font-medium text-gray-800 mt-2">{suggestion.libelle}</p>
                      <p className="text-xs text-gray-600 mt-1">{suggestion.montantFcfa === null ? "Montant à préciser" : FCFA(suggestion.montantFcfa)}</p>
                      <p className="text-xs text-gray-500 mt-2">{suggestion.justification}</p>
                      <button
                        type="button"
                        onClick={() => handleUseRegularisationSuggestion(suggestion)}
                        className="mt-3 text-xs font-semibold text-purple-700 hover:text-purple-900 hover:underline"
                      >
                        Reprendre dans le formulaire
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Formulaire ajout */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {TYPES_REGUL.map((t) => (
                  <button key={t.code} type="button"
                    onClick={() => handleSetRType(t.code)}
                    className={`text-left px-3 py-2 rounded-lg border text-xs transition-colors ${rType === t.code ? "border-green-600 bg-green-50 text-green-800 font-semibold" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                    <span className="block text-gray-500 font-medium">{t.label}</span>
                    <span className="block text-gray-400 mt-0.5 text-[10px]">{t.exemple}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Compte de régularisation</label>
              <CompteAutocomplete
                value={rCompteRegul}
                onChange={setRCompteRegul}
                placeholder="Ex: 4487, 408…"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Compte contrepartie <span className="text-gray-400">— {TYPES_REGUL.find((t) => t.code === rType)?.compteHint}</span>
              </label>
              <CompteAutocomplete
                value={rCompte}
                onChange={setRCompte}
                placeholder={TYPES_REGUL.find((t) => t.code === rType)?.compteHint}
              />
              {rCompte && rCompteRegul && (
                <p className="text-xs text-gray-400 mt-1 font-mono">
                  {TYPES_REGUL.find((t) => t.code === rType)?.debitSide === "contrepartie"
                    ? `Débit ${rCompte} / Crédit ${rCompteRegul}`
                    : `Débit ${rCompteRegul} / Crédit ${rCompte}`}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Libellé</label>
              <input value={rLibelle} onChange={(e) => setRLibelle(e.target.value)}
                placeholder={TYPES_REGUL.find((t) => t.code === rType)?.exemple}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Montant (FCFA)</label>
              <MoneyInput value={rMontant} onChange={(raw) => setRMontant(Number(raw) || 0)} className="w-full" placeholder="0" />
            </div>
            <div className="flex items-end">
              <button onClick={() => void handleAddRegul()} disabled={rLoading}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50"
                style={{ backgroundColor: VERT }}>
                {rLoading
                  ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" /> Enregistrement…</>
                  : <><Plus size={14} /> Enregistrer</>}
              </button>
            </div>
          </div>

          {/* Liste existante */}
          {reguls.length > 0 ? (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-3 py-2 border-b border-gray-100 grid grid-cols-[1fr_2fr_auto_auto] gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <span>Comptes</span><span>Libellé</span><span className="text-right">Montant</span><span />
              </div>
              {reguls.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_2fr_auto_auto] gap-2 items-center px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <span className="text-xs font-mono text-gray-500">{r.compteDebit} / {r.compteCredit}</span>
                  <span className="text-sm text-gray-700">{r.libelle}</span>
                  <span className="text-sm font-semibold text-gray-800 text-right">{FCFA(r.montantFcfa)}</span>
                  <button onClick={() => void handleDeleteRegul(r.id)} disabled={deletingId === r.id}
                    className="ml-2 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40">
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex justify-end">
                <span className="text-xs font-semibold text-gray-600">
                  Total : {FCFA(reguls.reduce((s, r) => s + r.montantFcfa, 0))}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-3">Aucune régularisation saisie pour {annee}</p>
          )}
        </div>
      )}

      {/* Aperçu simulation */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-700">Simulation — Résultat {annee}</h3>
          {apercu.isFetching && <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-600 border-t-transparent" />}
        </div>

        {ap ? (
          <>
            {/* Alertes */}
            {ap.alertes.length > 0 && (
              <div className="mb-4 space-y-1.5">
                {ap.alertes.map((a, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                    {a}
                  </div>
                ))}
              </div>
            )}

            {/* SIG */}
            <div className="space-y-0 divide-y divide-gray-50">
              <div className="pb-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Exploitation</p>
                <SIG label="Produits d'exploitation (70x–75x)" montant={ap.soldes.produitsExploitation}  indent />
                <SIG label="Charges d'exploitation (60x–69x)"  montant={-ap.soldes.chargesExploitation} indent />
                <SIG label="Résultat d'exploitation"           montant={ap.soldes.resultatExploitation}  bold positif />
              </div>
              <div className="py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Financier</p>
                <SIG label="Produits financiers (77x)"   montant={ap.soldes.produitsFinanciers}  indent />
                <SIG label="Charges financières (67x)"   montant={-ap.soldes.chargesFinancieres} indent />
                <SIG label="Résultat financier"          montant={ap.soldes.resultatFinancier}   bold positif />
              </div>
              <div className="py-3">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">HAO</p>
                <SIG label="Produits HAO (82x–86x)" montant={ap.soldes.produitsHAO}  indent />
                <SIG label="Charges HAO (81x–85x)"  montant={-ap.soldes.chargesHAO}  indent />
                <SIG label="Résultat HAO"            montant={ap.soldes.resultatHAO}  bold positif />
              </div>
              <div className="pt-3 space-y-1">
                <SIG label="Résultat avant impôt" montant={ap.soldes.avantImpot}  bold positif />
                {ap.soldes.impot > 0 && <SIG label="Impôt sur le résultat (891)" montant={-ap.soldes.impot} indent />}
                <div className={`flex items-center justify-between py-2 px-3 rounded-lg mt-1 ${ap.soldes.net >= 0 ? "bg-green-50" : "bg-red-50"}`}>
                  <span className="text-sm font-bold text-gray-900">Résultat net {annee}</span>
                  <span className={`text-lg font-bold ${ap.soldes.net >= 0 ? "text-green-700" : "text-red-600"}`}>
                    {ap.soldes.net >= 0 ? "+" : "−"}{FCFA(Math.abs(ap.soldes.net))}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Compte {ap.soldes.net >= 0 ? "131 — Bénéfice net" : "139 — Déficit net"}
                </p>
              </div>
            </div>

            {/* KPIs tréso/fournisseurs */}
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
              {[
                { label: "Trésorerie nette", v: ap.tresorerie,    warn: ap.tresorerie < 0 },
                { label: "Dû aux membres/fourn.", v: -ap.fournisseurs, warn: false },
                { label: "Stock cacao (comptable)", v: ap.stockCacao, warn: false },
              ].map(({ label, v, warn }) => (
                <div key={label} className={`rounded-lg p-3 border ${warn ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100"}`}>
                  <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className={`text-sm font-bold ${warn ? "text-amber-700" : v >= 0 ? "text-gray-800" : "text-red-600"}`}>{FCFA(v)}</p>
                </div>
              ))}
            </div>

            {/* Extournes prévues au 01/01/N+1 */}
            {!deja && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <RotateCcw size={11} /> Extournes qui seront générées au 01/01/{annee + 1}
                </p>
                {ap.regularisations && ap.regularisations.length > 0 ? (
                  <div className="rounded-lg border border-blue-100 overflow-hidden">
                    {ap.regularisations.map((r, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2 border-b border-blue-50 last:border-0 bg-blue-50/40">
                        <span className="text-xs font-mono text-blue-600 whitespace-nowrap">{r.compteCredit} / {r.compteDebit}</span>
                        <span className="text-xs text-gray-600 flex-1 truncate">{r.libelle}</span>
                        <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">{FCFA(r.montantFcfa)}</span>
                      </div>
                    ))}
                    <div className="px-3 py-1.5 bg-blue-50 border-t border-blue-100 text-right">
                      <span className="text-xs text-blue-600">
                        {ap.regularisations.length} extourne{ap.regularisations.length > 1 ? "s" : ""} automatique{ap.regularisations.length > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">Aucune régularisation saisie — les extournes ne s'appliquent pas.</p>
                )}
              </div>
            )}
          </>
        ) : apercu.isLoading ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-2 border-green-600 border-t-transparent" /></div>
        ) : null}
      </div>

      {/* Résultat après clôture */}
      {resultat && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5">
          <h3 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
            <CheckCheck size={16} /> Exercice {annee} clôturé avec succès
          </h3>
          <p className="text-sm text-green-700">
            {resultat.ecrituresGenerees} écritures générées — résultat net :{" "}
            <span className="font-bold">{resultat.soldes.net >= 0 ? "+" : "−"}{FCFA(Math.abs(resultat.soldes.net))}</span>
            {" "}→ compte {resultat.soldes.net >= 0 ? "131" : "139"}
          </p>
          {resultat.detailEcritures && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-green-700">
              {resultat.detailEcritures.amortissements > 0 && <span>• {resultat.detailEcritures.amortissements} écriture(s) amortissement</span>}
              {resultat.detailEcritures.variationStocks > 0 && <span>• {resultat.detailEcritures.variationStocks} écriture(s) stock</span>}
              {resultat.detailEcritures.cloture > 0 && <span>• {resultat.detailEcritures.cloture} écriture(s) clôture SIG</span>}
              {resultat.detailEcritures.aNouveaux > 0 && <span>• {resultat.detailEcritures.aNouveaux} à-nouveaux {annee + 1}</span>}
              {resultat.detailEcritures.extournesRegularisations > 0 && (
                <span>• {resultat.detailEcritures.extournesRegularisations} extourne(s) régularisation au 01/01/{annee + 1}</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bouton clôture */}
      {!deja && !resultat && (
        <div className="bg-white rounded-xl border border-red-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Clôturer l'exercice {annee}</h3>
          <p className="text-sm text-gray-500 mb-4">
            Cette opération est <strong>irréversible</strong>. Elle génère les écritures de clôture OHADA
            (solde des 6xx/7xx, calcul du résultat, balance d'ouverture N+1) et verrouille le journal de l'exercice {annee}.
          </p>
          {!confirm ? (
            <button onClick={() => setConfirm(true)}
              className="flex items-center gap-2 px-4 py-2.5 border border-red-300 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50">
              <Lock size={14} /> Initier la clôture de l'exercice {annee}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
                ⚠ Irréversible. Confirmer la clôture de l'exercice {annee} ?
              </div>
              <button onClick={() => void handleCloture()} disabled={loading}
                className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {loading ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" /> Clôture en cours…</> : "Oui, clôturer"}
              </button>
              <button onClick={() => setConfirm(false)}
                className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Annuler
              </button>
            </div>
          )}
        </div>
      )}

      {deja && !resultat && (
        <div className="flex items-center gap-3 px-5 py-4 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">
          <Lock size={16} /> L'exercice {annee} est déjà clôturé — journal verrouillé.
        </div>
      )}

      {/* Affectation du résultat après AG */}
      {deja && (() => {
        const aff = apercuAff.data;
        if (apercuAff.isLoading) return (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-2 border-green-600 border-t-transparent" /></div>
        );
        if (!aff || aff.solde131 <= 0) return null;

        const beneficeNet = aff.solde131;
        const totalSaisi  = reserveLegale + reportANouveau + ristournes;
        const ecartFcfa   = totalSaisi - beneficeNet;
        const ok          = Math.abs(ecartFcfa) <= 1;
        const reserveMin  = Math.ceil(beneficeNet * 0.05);

        if (aff.dejaAffecte) {
          const ristRow = aff.ecrituresAffectation.find((e) => e.compteCredit === "4461");
          const ristMontant = ristRow?.montantFcfa ?? 0;
          const apRist = apercuRist.data;
          const campId = campagneRistId ?? apRist?.campagneId ?? null;

          return (
            <div className="space-y-4">
              {/* Affectation enregistrée */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <CheckCheck size={15} className="text-green-600" /> Affectation du résultat {annee} — enregistrée
                </h3>
                <div className="divide-y divide-gray-50">
                  {aff.ecrituresAffectation.map((e, i) => (
                    <div key={i} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-gray-600">{e.libelle}</span>
                      <span className="font-mono text-gray-800">{FCFA(e.montantFcfa)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-3">Comptes 131 → 1061 / 110 / 4461 • exercice {annee + 1}</p>
              </div>

              {/* Ristournes — déclenchement paiements */}
              {ristMontant > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Users size={15} className="text-amber-600" /> Ristournes membres — {FCFA(ristMontant)}
                    </h3>
                    {apRist?.dejaDeclenche ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
                        <CheckCheck size={11} /> Paiements déclenchés
                      </span>
                    ) : (
                      <button
                        onClick={() => setShowRistModal(true)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border text-amber-700 border-amber-200 hover:bg-amber-50 flex items-center gap-1.5"
                      >
                        <Users size={12} /> Déclencher les paiements
                      </button>
                    )}
                  </div>
                  {apRist?.dejaDeclenche ? (
                    <p className="text-xs text-gray-400">
                      Écriture 4461 → 521 générée en exercice {annee + 1}. Les paiements individuels sont visibles dans le module Paiements.
                    </p>
                  ) : (
                    <p className="text-xs text-gray-400">
                      Distribue {FCFA(ristMontant)} aux membres proportionnellement à leurs livraisons de la campagne sélectionnée.
                    </p>
                  )}
                </div>
              )}

              {/* Modal déclenchement */}
              {showRistModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRistModal(false)}>
                  <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                    <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                      <h3 className="font-bold text-gray-900">Déclencher les ristournes {annee}</h3>
                      <button onClick={() => setShowRistModal(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
                    </div>
                    <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                      {/* Campagne */}
                      {apRist?.campagnes && apRist.campagnes.length > 0 && (
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Campagne de référence</label>
                          <select
                            value={campId ?? ""}
                            onChange={(e) => setCampagneRistId(Number(e.target.value))}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                          >
                            {apRist.campagnes.map((c) => (
                              <option key={c.id} value={c.id}>{c.libelle} ({c.anneeDebut}/{c.anneeFin})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {/* Mode paiement */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Mode de paiement (optionnel)</label>
                        <select
                          value={modeRist}
                          onChange={(e) => setModeRist(e.target.value)}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                        >
                          <option value="">— Définir lors du paiement —</option>
                          <option value="especes">Espèces</option>
                          <option value="orange_money">Orange Money</option>
                          <option value="wave">Wave</option>
                          <option value="mtn_momo">MTN MoMo</option>
                          <option value="virement">Virement</option>
                        </select>
                      </div>
                      {/* Aperçu membres */}
                      {apercuRist.isLoading ? (
                        <div className="flex justify-center py-4"><div className="animate-spin rounded-full h-5 w-5 border-2 border-green-600 border-t-transparent" /></div>
                      ) : apRist?.membres && apRist.membres.length > 0 ? (
                        <div>
                          <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                            Répartition — {apRist.membres.length} membres
                          </p>
                          <div className="rounded-lg border border-gray-100 overflow-hidden max-h-48 overflow-y-auto">
                            {apRist.membres.map((m) => (
                              <div key={m.membreId} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                                <div>
                                  <span className="text-sm font-medium text-gray-800">{m.nomComplet}</span>
                                  <span className="text-xs text-gray-400 ml-2">{m.tonnageKg.toLocaleString("fr-FR")} kg</span>
                                </div>
                                <span className="text-sm font-mono font-semibold text-gray-700">{FCFA(m.montantFcfa)}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-between px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg mt-2 text-sm">
                            <span className="font-medium text-gray-700">Total</span>
                            <span className="font-bold font-mono text-gray-800">{FCFA(ristMontant)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-sm text-amber-600 bg-amber-50 rounded-lg border border-amber-100">
                          ⚠ Aucune livraison trouvée pour cette campagne — impossible de calculer les parts.
                        </div>
                      )}
                    </div>
                    <div className="px-6 pb-5 pt-3 border-t border-gray-100 flex gap-3">
                      <button onClick={() => setShowRistModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                        Annuler
                      </button>
                      <button
                        onClick={() => void handleDeclencherRistournes()}
                        disabled={loadingRist || !apRist?.membres?.length}
                        className="flex-1 py-2.5 rounded-lg text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                        style={{ backgroundColor: OR }}
                      >
                        {loadingRist
                          ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" /> Déclenchement…</>
                          : `Déclencher — ${apRist?.membres?.length ?? 0} membres`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        }

        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
              <Scale size={15} className="text-green-700" /> Affectation du résultat {annee} — après AG
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              Enregistre les décisions de l'assemblée générale : mise en réserve, report à nouveau et ristournes aux membres.
              Les écritures (131 → 1061 / 110 / 4461) seront datées à la date de l'AG et imputées à l'exercice {annee + 1}.
            </p>

            <div className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-lg mb-5">
              <span className="text-sm font-medium text-green-800">Bénéfice net {annee} (compte 131)</span>
              <span className="text-sm font-bold text-green-700 font-mono">+{FCFA(beneficeNet)}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Date de l'AG</label>
                <input type="date" value={dateAG} onChange={(e) => setDateAG(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-700" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Réserve légale (1061) <span className="text-gray-400">— min. 5&nbsp;% recommandé</span>
                </label>
                <MoneyInput value={reserveLegale} onChange={(raw) => setReserveLegale(Number(raw) || 0)} className="w-full" placeholder="0" />
                {reserveLegale > 0 && reserveLegale < reserveMin && (
                  <p className="text-xs text-amber-600 mt-1">⚠ Minimum OHADA recommandé : {FCFA(reserveMin)}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Report à nouveau (110)</label>
                <MoneyInput value={reportANouveau} onChange={(raw) => setReportANouveau(Number(raw) || 0)} className="w-full" placeholder="0" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Ristournes membres (4461)</label>
                <MoneyInput value={ristournes} onChange={(raw) => setRistournes(Number(raw) || 0)} className="w-full" placeholder="0" />
              </div>
            </div>

            <div className={`flex items-center justify-between px-4 py-3 rounded-lg mb-5 border ${ok ? "bg-green-50 border-green-200" : "bg-amber-50 border-amber-200"}`}>
              <span className="text-sm font-medium text-gray-700">Total affecté</span>
              <span className={`text-sm font-bold font-mono ${ok ? "text-green-700" : "text-amber-700"}`}>
                {FCFA(totalSaisi)}
                {!ok && <span className="ml-2 text-xs font-normal">({ecartFcfa > 0 ? "+" : ""}{FCFA(ecartFcfa)} vs bénéfice)</span>}
              </span>
            </div>

            <button
              onClick={() => void handleAffectation()}
              disabled={loadingAff || !ok || !dateAG}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-700 text-white rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">
              {loadingAff
                ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" /> Enregistrement…</>
                : <><CheckCheck size={14} /> Enregistrer l'affectation</>}
            </button>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Section Clôture (dans OngletConfiguration) — conservée pour rétrocompat ──

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

  const historiqueAff = useQuery({
    queryKey: ["historique-affectations"],
    queryFn: () => apiFetch<HistoriqueAffectationRow[]>("/api/comptabilite/historique-affectations"),
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
      {/* ── Historique des affectations de résultat ─────────────────────── */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
          <Users size={16} className="text-gray-500" /> Historique des affectations de résultat
        </h3>
        <p className="text-xs text-gray-400 mb-4">
          Décisions d'AG enregistrées — réserves constituées, ristournes versées et reports à nouveau par exercice clôturé.
        </p>
        {historiqueAff.isLoading ? (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-2 border-green-600 border-t-transparent" /></div>
        ) : historiqueAff.data && historiqueAff.data.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Exercice</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Bénéfice net</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Réserve légale</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Report à nouveau</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Ristournes</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Date AG</th>
                </tr>
              </thead>
              <tbody>
                {historiqueAff.data.map((row) => {
                  const totalAffecte = row.reserveLegale + row.reportANouveau + row.ristournes;
                  const nonAffecte = row.beneficeNet - totalAffecte;
                  return (
                    <tr key={row.exerciceResultat} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                      <td className="px-4 py-3 font-semibold text-gray-800">{row.exerciceResultat}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">{FCFA(row.beneficeNet)}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{row.reserveLegale > 0 ? FCFA(row.reserveLegale) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{row.reportANouveau > 0 ? FCFA(row.reportANouveau) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        {row.ristournes > 0 ? (
                          <span className="font-medium" style={{ color: OR }}>{FCFA(row.ristournes)}</span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 text-xs">
                        {row.dateAffectation ? new Date(row.dateAffectation).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                        {nonAffecte !== 0 && (
                          <div className="text-[10px] text-amber-600 mt-0.5">Δ {nonAffecte > 0 ? "+" : ""}{FCFA(nonAffecte)}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-sm text-gray-400">
            Aucune affectation de résultat enregistrée — clôturez un exercice puis enregistrez la décision d'AG.
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Onglet Veille IA ─────────────────────────────────────────────────────────

interface AnomalieIA {
  id: number; type_anomalie: string; niveau_gravite: string; description: string;
  entite_id: number | null; statut: string; created_at: string;
  ecriture_libelle: string | null; ecriture_date: string | null;
  compte_debit: string | null; compte_credit: string | null; ecriture_montant: string | null;
}

function OngletAnomaliesIA() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["anomalies-ia"],
    queryFn: () => apiFetch<{ anomalies: AnomalieIA[]; nbNouvelles: number }>("/api/comptabilite/anomalies-ia"),
  });

  const anomalies = data?.anomalies ?? [];

  const graviteConfig: Record<string, { cls: string; label: string }> = {
    critique:  { cls: "bg-red-50 border-red-200 text-red-700",    label: "🔴 Haute" },
    attention: { cls: "bg-amber-50 border-amber-200 text-amber-700", label: "🟡 Moyenne" },
    info:      { cls: "bg-blue-50 border-blue-200 text-blue-700",  label: "🔵 Basse" },
  };

  const typeLabel: Record<string, string> = {
    doublon:               "Doublon suspect",
    montant_anormal:       "Montant anormal",
    comptes_incoherents:   "Comptes incohérents",
    manuelle_suspecte:     "Écriture manuelle suspecte",
    extourne_irreguliere:  "Extourne irrégulière",
  };

  const marquerLue = async (id: number) => {
    await apiPost(`/api/comptabilite/anomalies-ia/${id}/lire`, {});
    void refetch();
  };

  const marquerToutesLues = async () => {
    try {
      await apiPost("/api/comptabilite/anomalies-ia/tout-lire", {});
      toast({ title: "Toutes les anomalies marquées comme lues" });
      void qc.invalidateQueries({ queryKey: ["anomalies-ia"] });
    } catch { /* */ }
  };

  const nbNouvelles = data?.nbNouvelles ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ShieldAlert size={18} className="text-purple-600" />
            Veille comptable IA
            {nbNouvelles > 0 && (
              <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                {nbNouvelles} nouvelle{nbNouvelles > 1 ? "s" : ""}
              </span>
            )}
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Claude Sonnet analyse chaque nuit les écritures de la veille et signale les anomalies au comptable.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {nbNouvelles > 0 && (
            <button
              onClick={() => void marquerToutesLues()}
              className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1.5"
            >
              <Eye size={12} /> Tout marquer lu
            </button>
          )}
          <button onClick={() => void refetch()} className="text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg p-1.5 hover:bg-gray-50">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent" />
        </div>
      ) : anomalies.length === 0 ? (
        <div className="text-center py-16 bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl border border-purple-100">
          <Sparkles size={40} className="mx-auto text-purple-300 mb-3" />
          <p className="font-medium text-purple-700">Aucune anomalie détectée</p>
          <p className="text-sm text-purple-400 mt-1">Claude n'a signalé aucune anomalie pour les écritures analysées.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {anomalies.map((a) => {
            const cfg = graviteConfig[a.niveau_gravite] ?? graviteConfig["info"]!;
            const isNew = a.statut === "nouvelle";
            return (
              <div
                key={a.id}
                className={`border rounded-xl p-4 transition-all ${cfg.cls} ${isNew ? "shadow-sm" : "opacity-70"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold">{cfg.label}</span>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60">
                        {typeLabel[a.type_anomalie] ?? a.type_anomalie}
                      </span>
                      {isNew && (
                        <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/80 text-red-600">NOUVEAU</span>
                      )}
                    </div>
                    <p className="text-sm font-medium">{a.description}</p>
                    {a.ecriture_libelle && (
                      <div className="mt-2 text-xs bg-white/50 rounded-lg px-3 py-1.5 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Écriture :</span>
                          <span>{a.ecriture_libelle}</span>
                          {a.ecriture_date && <span className="text-gray-400">— {a.ecriture_date}</span>}
                        </div>
                        {a.ecriture_montant && (
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold">
                              {Number(a.ecriture_montant).toLocaleString("fr-FR")} FCFA
                            </span>
                            {a.compte_debit && a.compte_credit && (
                              <span className="text-gray-400">| {a.compte_debit} / {a.compte_credit}</span>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    <p className="text-xs opacity-60 mt-1.5">
                      Détectée le {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {isNew && (
                    <button
                      onClick={() => void marquerLue(a.id)}
                      className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg bg-white/60 hover:bg-white/90 flex items-center gap-1"
                    >
                      <Eye size={11} /> Lu
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-400 flex items-start gap-2">
        <Sparkles size={14} className="shrink-0 mt-0.5 text-purple-400" />
        <span>
          Claude Sonnet analyse les écritures chaque nuit à 02h30. Les anomalies sont classées par sévérité et croisées avec le plan comptable SYSCOHADA de votre coopérative. Seul le comptable reçoit ces alertes.
        </span>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
type Onglet = "journal" | "en_attente" | "config" | "devises" | "plan_comptable" | "grand_livre" | "balance" | "balance_aux" | "import_balances" | "flux" | "cloture" | "anomalies_ia";

export default function ComptabilitePage() {
  const [onglet, setOnglet] = useState<Onglet>("en_attente");
  const [showSaisie, setShowSaisie] = useState(false);
  const [journalDefaultSource, setJournalDefaultSource] = useState("");

  const peutVoirConfig  = usePermission("comptabilite", "voir_config");
  const peutVoirAttente = usePermission("comptabilite", "voir_ecritures_attente");
  const peutVoirPlan    = usePermission("comptabilite", "voir_plan");
  const peutGrandLivre  = usePermission("comptabilite", "voir_grand_livre");
  const peutBalance     = usePermission("comptabilite", "voir_balance");
  const peutSaisir      = usePermission("comptabilite", "saisir_ecriture_manuelle");
  const peutImporterBalance = usePermission("comptabilite", "importer_balance");

  const { data: countData } = useCountEcrituresEnAttente({ query: { queryKey: getCountEcrituresEnAttenteQueryKey(), enabled: peutVoirAttente } });
  const nbEnAttente = countData?.count ?? 0;

  const peutVoirTaux      = usePermission("devises", "voir_taux");
  const peutVoirAnomIA    = usePermission("comptabilite", "voir_anomalies_ia");

  const { data: anomIaData } = useQuery({
    queryKey: ["anomalies-ia"],
    queryFn: () => apiFetch<{ anomalies: unknown[]; nbNouvelles: number }>("/api/comptabilite/anomalies-ia"),
    enabled: peutVoirAnomIA,
  });
  const nbAnomaliesIA = anomIaData?.nbNouvelles ?? 0;

  const tabs: { id: Onglet; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: "en_attente",  label: "En attente",      icon: Clock,     badge: nbEnAttente > 0 ? nbEnAttente : undefined },
    { id: "journal",     label: "Journal",          icon: BookOpen },
    ...(peutGrandLivre ? [{ id: "grand_livre" as Onglet, label: "Grand-livre",  icon: FileText }] : []),
    ...(peutBalance    ? [{ id: "balance"     as Onglet, label: "Balance",         icon: Scale }] : []),
    ...(peutBalance    ? [{ id: "balance_aux" as Onglet, label: "Comptes tiers",   icon: Users }] : []),
    ...(peutImporterBalance ? [{ id: "import_balances" as Onglet, label: "Import Sage", icon: Upload }] : []),
    { id: "flux",        label: "Flux trésorerie",  icon: Droplets },
    ...(peutVoirConfig ? [{ id: "cloture"         as Onglet, label: "Clôture",        icon: Lock }] : []),
    ...(peutVoirTaux   ? [{ id: "devises"         as Onglet, label: "Devises",        icon: DollarSign }] : []),
    ...(peutVoirPlan   ? [{ id: "plan_comptable"  as Onglet, label: "Plan comptable", icon: List }] : []),
    ...(peutVoirConfig ? [{ id: "config"          as Onglet, label: "Configuration",  icon: Settings }] : []),
    ...(peutVoirAnomIA ? [{ id: "anomalies_ia"   as Onglet, label: "Alertes IA",     icon: ShieldAlert, badge: nbAnomaliesIA > 0 ? nbAnomaliesIA : undefined }] : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* En-tête fixe */}
      <div className="flex-shrink-0 flex items-start justify-between mb-6">
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

      {/* Onglets — fixes */}
      <div className="flex-shrink-0 flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(({ id, label, icon: Icon, badge }) => (
          <button
            key={id}
            onClick={() => { setOnglet(id); if (id !== "journal") setJournalDefaultSource(""); }}
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
        <div className="flex-shrink-0 mb-4">
          <WidgetTauxChange />
        </div>
      )}

      {/* Zone de contenu — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0 pb-4">
        {onglet === "en_attente"    && <OngletEnAttente />}
        {onglet === "journal"       && <OngletJournal defaultSource={journalDefaultSource} />}
        {onglet === "grand_livre"   && peutGrandLivre && <OngletGrandLivre />}
        {onglet === "balance"       && peutBalance    && <OngletBalance />}
        {onglet === "balance_aux"   && peutBalance    && <OngletBalanceAuxiliaire />}
        {onglet === "import_balances" && peutImporterBalance && <OngletImportBalances />}
        {onglet === "flux"          && <OngletFluxTresorerie />}
        {onglet === "cloture"       && peutVoirConfig && <OngletCloture />}
        {onglet === "devises"       && peutVoirTaux   && <OngletDevises />}
        {onglet === "plan_comptable"&& peutVoirPlan   && <OngletPlanComptableContainer />}
        {onglet === "config"        && peutVoirConfig && <OngletConfiguration />}
        {onglet === "anomalies_ia"  && peutVoirAnomIA && <OngletAnomaliesIA />}
      </div>

      {showSaisie && (
        <ModalSaisieManuelle
          onClose={() => setShowSaisie(false)}
          onSuccess={() => {
            setShowSaisie(false);
            setJournalDefaultSource("manuel");
            setOnglet("journal");
          }}
        />
      )}
    </div>
  );
}

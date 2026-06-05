import { useState, type ReactNode } from "react";
import {
  useGetBailleurs,
  usePostBailleurs,
  useGetSubventions,
  usePostSubventions,
  useGetSubventionsId,
  usePostSubventionsIdTranche,
  usePutSubventionsIdUtiliser,
  usePostSubventionsIdRapport,
  usePutSubventionsIdRapportRapportIdSoumettre,
  useGetSubventionsDashboard,
  getGetSubventionsQueryKey,
  getGetBailleursQueryKey,
  getGetSubventionsIdQueryKey,
  getGetSubventionsDashboardQueryKey,
  type Bailleur,
  type SubventionAvecBailleur,
  type SubventionDetail,
  type TrancheSubvention,
  type LigneBudgetSubvention,
  type RapportBailleur,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  AlertTriangle, Plus, CheckCircle2, Clock, XCircle, RefreshCw,
  FileText, X, ChevronDown, ChevronUp, Send, Banknote, TrendingUp,
} from "lucide-react";

const VERT = "#1a4731";

const FCFA = (n: number | string | null | undefined) =>
  new Intl.NumberFormat("fr-FR").format(Math.round(parseFloat(String(n ?? "0")) || 0)) + " FCFA";

const PCT = (n: number | null | undefined) =>
  `${Math.round(n ?? 0)}%`;

const DATE_FR = (d: string | null | undefined) => {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};

type Onglet = "overview" | "budget" | "tranches" | "rapports";

const STATUT_BADGE: Record<string, { label: string; cls: string }> = {
  en_attente: { label: "En attente",  cls: "bg-yellow-100 text-yellow-700" },
  actif:      { label: "Actif",       cls: "bg-green-100  text-green-700"  },
  cloture:    { label: "Clôturé",     cls: "bg-gray-100   text-gray-600"   },
  suspendu:   { label: "Suspendu",    cls: "bg-red-100    text-red-700"     },
};
const TRANCHE_BADGE: Record<string, { label: string; cls: string; icon: ReactNode }> = {
  attendue:   { label: "Attendue",   cls: "bg-yellow-100 text-yellow-700", icon: <Clock size={12} /> },
  recue:      { label: "Reçue",      cls: "bg-green-100  text-green-700",  icon: <CheckCircle2 size={12} /> },
  en_retard:  { label: "En retard",  cls: "bg-red-100    text-red-700",    icon: <AlertTriangle size={12} /> },
};

// ─── Modal : Créer subvention ─────────────────────────────────────────────────
function ModalCreerSubvention({ bailleurs, onClose }: { bailleurs: Bailleur[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    bailleurId: "", reference: "", libelle: "", montantTotalFcfa: "", deviseOrigine: "XOF",
    montantDeviseOrigine: "", dateConvention: "", dateDebut: "", dateFin: "",
    statut: "en_attente", conditions: "", rapportRequis: true, periodiciteRapport: "",
  });
  const [lignes, setLignes] = useState<{ posteBudgetaire: string; montantAlloueFcfa: string }[]>([
    { posteBudgetaire: "Intrants",        montantAlloueFcfa: "" },
    { posteBudgetaire: "Formation",       montantAlloueFcfa: "" },
    { posteBudgetaire: "Infrastructure",  montantAlloueFcfa: "" },
    { posteBudgetaire: "Digitalisation",  montantAlloueFcfa: "" },
    { posteBudgetaire: "Fonctionnement",  montantAlloueFcfa: "" },
  ]);

  const mut = usePostSubventions({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSubventionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSubventionsDashboardQueryKey() });
        toast({ title: "Subvention créée" });
        onClose();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-lg">Nouvelle subvention</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Bailleur *</label>
              <select value={form.bailleurId} onChange={(e) => set("bailleurId", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700">
                <option value="">Sélectionner un bailleur…</option>
                {bailleurs.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Référence contrat *</label>
              <input value={form.reference} onChange={(e) => set("reference", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="ex : GIZ-2025-001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Statut</label>
              <select value={form.statut} onChange={(e) => set("statut", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="en_attente">En attente</option>
                <option value="actif">Actif</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Libellé *</label>
              <input value={form.libelle} onChange={(e) => set("libelle", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Description du projet subventionné" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Montant total (FCFA) *</label>
              <input type="number" value={form.montantTotalFcfa} onChange={(e) => set("montantTotalFcfa", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="ex : 50000000" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Devise d'origine</label>
              <select value={form.deviseOrigine} onChange={(e) => set("deviseOrigine", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="XOF">XOF (FCFA)</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            {form.deviseOrigine !== "XOF" && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Montant en {form.deviseOrigine}</label>
                <input type="number" value={form.montantDeviseOrigine} onChange={(e) => set("montantDeviseOrigine", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date convention</label>
              <input type="date" value={form.dateConvention} onChange={(e) => set("dateConvention", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date début</label>
              <input type="date" value={form.dateDebut} onChange={(e) => set("dateDebut", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date fin</label>
              <input type="date" value={form.dateFin} onChange={(e) => set("dateFin", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Périodicité rapport</label>
              <select value={form.periodiciteRapport} onChange={(e) => set("periodiciteRapport", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="">—</option>
                <option value="mensuel">Mensuel</option>
                <option value="trimestriel">Trimestriel</option>
                <option value="annuel">Annuel</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Conditions d'utilisation</label>
              <textarea value={form.conditions} onChange={(e) => set("conditions", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" rows={2} />
            </div>
          </div>

          {/* Lignes budgétaires */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Budget par poste</h4>
            <div className="space-y-2">
              {lignes.map((l, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-36 shrink-0">{l.posteBudgetaire}</span>
                  <input type="number" value={l.montantAlloueFcfa}
                    onChange={(e) => setLignes((prev) => prev.map((x, j) => j === i ? { ...x, montantAlloueFcfa: e.target.value } : x))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
                    placeholder="Montant FCFA" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
          <button
            onClick={() => mut.mutate({ data: {
              bailleurId:           parseInt(form.bailleurId),
              reference:            form.reference,
              libelle:              form.libelle,
              montantTotalFcfa:     parseFloat(form.montantTotalFcfa) || 0,
              deviseOrigine:        form.deviseOrigine,
              montantDeviseOrigine: form.montantDeviseOrigine ? parseFloat(form.montantDeviseOrigine) : undefined,
              dateConvention:       form.dateConvention || undefined,
              dateDebut:            form.dateDebut       || undefined,
              dateFin:              form.dateFin         || undefined,
              statut:               form.statut as "en_attente" | "actif",
              conditions:           form.conditions      || undefined,
              rapportRequis:        form.rapportRequis,
              periodiciteRapport:   form.periodiciteRapport || undefined,
              lignesBudget: lignes.filter((l) => l.montantAlloueFcfa).map((l) => ({
                posteBudgetaire:   l.posteBudgetaire,
                montantAlloueFcfa: parseFloat(l.montantAlloueFcfa),
              })),
            }})}
            disabled={mut.isPending || !form.bailleurId || !form.reference || !form.libelle || !form.montantTotalFcfa}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}
          >
            {mut.isPending ? "Création…" : "Créer la subvention"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Créer bailleur ───────────────────────────────────────────────────
function ModalCreerBailleur({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ nom: "", type: "ong", pays: "", contactNom: "", contactEmail: "", contactTelephone: "" });

  const mut = usePostBailleurs({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBailleursQueryKey() });
        toast({ title: "Bailleur créé" });
        onClose();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Nouveau bailleur</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {[
            { key: "nom",              label: "Nom *",             type: "text" },
            { key: "pays",             label: "Pays",              type: "text" },
            { key: "contactNom",       label: "Contact (nom)",     type: "text" },
            { key: "contactEmail",     label: "Email contact",     type: "email" },
            { key: "contactTelephone", label: "Tél. contact",      type: "tel" },
          ].map(({ key, label, type }) => (
            <div key={key}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input type={type} value={form[key as keyof typeof form] as string}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
              <option value="ong">ONG</option>
              <option value="institution">Institution</option>
              <option value="etat">État</option>
              <option value="prive">Privé</option>
            </select>
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
          <button
            onClick={() => mut.mutate({ data: {
              nom: form.nom, type: form.type as "ong"|"institution"|"etat"|"prive",
              pays: form.pays || undefined, contactNom: form.contactNom || undefined,
              contactEmail: form.contactEmail || undefined, contactTelephone: form.contactTelephone || undefined,
            }})}
            disabled={mut.isPending || !form.nom}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}
          >
            {mut.isPending ? "Création…" : "Créer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Confirmer réception tranche ─────────────────────────────────────
function ModalTranche({ subventionId, tranche, onClose }: {
  subventionId: number; tranche?: TrancheSubvention; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({
    montantFcfa: tranche ? parseFloat(tranche.montantFcfa ?? "0").toString() : "",
    referenceVirement: "",
    datePrevue: tranche?.datePrevue ?? "",
  });

  const mut = usePostSubventionsIdTranche({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSubventionsIdQueryKey(subventionId) });
        queryClient.invalidateQueries({ queryKey: getGetSubventionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSubventionsDashboardQueryKey() });
        toast({ title: "Tranche enregistrée ✓" });
        onClose();
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Confirmer réception tranche</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Montant reçu (FCFA) *</label>
            <input type="number" value={form.montantFcfa} onChange={(e) => setForm((f) => ({ ...f, montantFcfa: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Référence virement</label>
            <input value={form.referenceVirement} onChange={(e) => setForm((f) => ({ ...f, referenceVirement: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="ex : VIR-20250615-001" />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
          <button
            onClick={() => mut.mutate({ id: subventionId, data: {
              montantFcfa:       parseFloat(form.montantFcfa) || 0,
              referenceVirement: form.referenceVirement || undefined,
              trancheId:         tranche?.id,
            }})}
            disabled={mut.isPending || !form.montantFcfa}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}
          >
            {mut.isPending ? "Enregistrement…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Dépense sur ligne budgétaire ─────────────────────────────────────
function ModalDepense({ subventionId, ligne, onClose }: {
  subventionId: number; ligne: LigneBudgetSubvention; onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [montant, setMontant] = useState("");
  const [justificatifUrl, setJustificatifUrl] = useState("");

  const solde = parseFloat(ligne.montantAlloueFcfa ?? "0") - parseFloat(ligne.montantUtiliseFcfa ?? "0");

  const mut = usePutSubventionsIdUtiliser({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSubventionsIdQueryKey(subventionId) });
        toast({ title: "Dépense enregistrée ✓" });
        onClose();
      },
      onError: (e: unknown) => {
        const msg = (e as { response?: { data?: { erreur?: string } } })?.response?.data?.erreur;
        toast({ title: msg ?? "Erreur", variant: "destructive" });
      },
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Enregistrer une dépense</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <div className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">Poste budgétaire</p>
            <p className="font-semibold text-gray-900">{ligne.posteBudgetaire}</p>
            <p className="text-xs text-gray-500 mt-1">Solde disponible : <strong className="text-green-700">{FCFA(solde)}</strong></p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Montant (FCFA) *</label>
            <input type="number" value={montant} onChange={(e) => setMontant(e.target.value)}
              max={solde}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700"
              placeholder={`Max : ${FCFA(solde)}`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">URL justificatif</label>
            <input value={justificatifUrl} onChange={(e) => setJustificatifUrl(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="https://…" />
          </div>
        </div>
        <div className="px-6 pb-5 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700">Annuler</button>
          <button
            onClick={() => mut.mutate({ id: subventionId, data: {
              ligneId:        ligne.id,
              montant:        parseFloat(montant) || 0,
              justificatifUrl: justificatifUrl || undefined,
            }})}
            disabled={mut.isPending || !montant || parseFloat(montant) <= 0}
            className="flex-1 py-2.5 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: VERT }}
          >
            {mut.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Onglet 1 : Vue d'ensemble ────────────────────────────────────────────────
function OngletOverview({ subventions, bailleurs }: {
  subventions: SubventionAvecBailleur[]; bailleurs: Bailleur[];
}) {
  const peutCreer = usePermission("subventions", "creer_subvention");
  const { data: dash } = useGetSubventionsDashboard({
    query: { queryKey: getGetSubventionsDashboardQueryKey() },
  });
  const [showModalSub,     setShowModalSub]     = useState(false);
  const [showModalBailleur, setShowModalBailleur] = useState(false);

  const d = dash as {
    totalRecu?: number; totalUtilise?: number; soldeDisponible?: number;
    tauxUtilisationPct?: number; nbSubventionsActives?: number;
  } | undefined;

  const kpis = [
    { label: "Subventions actives",   value: d?.nbSubventionsActives ?? 0, unit: "",       color: "text-green-700" },
    { label: "Fonds reçus",           value: FCFA(d?.totalRecu),           unit: "",       color: "text-blue-700"  },
    { label: "Fonds utilisés",        value: FCFA(d?.totalUtilise),        unit: "",       color: "text-orange-700"},
    { label: "Solde disponible",      value: FCFA(d?.soldeDisponible),     unit: "",       color: "text-purple-700"},
    { label: "Taux d'utilisation",    value: PCT(d?.tauxUtilisationPct),   unit: "",       color: "text-gray-900"  },
  ];

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpis.map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className={`text-lg font-bold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      {peutCreer && (
        <div className="flex gap-2">
          <button onClick={() => setShowModalBailleur(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50">
            <Plus size={14} /> Nouveau bailleur
          </button>
          <button onClick={() => setShowModalSub(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm text-white rounded-lg"
            style={{ backgroundColor: VERT }}>
            <Plus size={14} /> Nouvelle subvention
          </button>
        </div>
      )}

      {/* Alertes */}
      {subventions.some((s) => s.alerteExpiration || s.alerteSousUtilisation) && (
        <div className="space-y-2">
          {subventions.filter((s) => s.alerteExpiration).map((s) => (
            <div key={s.id} className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 text-sm text-orange-800">
              <AlertTriangle size={15} />
              <span><strong>{s.bailleur?.nom}</strong> — subvention expire le {DATE_FR(s.dateFin)} (&lt;60 jours)</span>
            </div>
          ))}
          {subventions.filter((s) => s.alerteSousUtilisation).map((s) => (
            <div key={s.id} className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-800">
              <AlertTriangle size={15} />
              <span><strong>{s.bailleur?.nom}</strong> — taux d'utilisation faible ({s.tauxUtilisationPct}%) à mi-parcours</span>
            </div>
          ))}
        </div>
      )}

      {/* Tableau subventions */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
              <th className="px-4 py-3 text-left">Bailleur</th>
              <th className="px-4 py-3 text-left">Référence</th>
              <th className="px-4 py-3 text-right">Montant total</th>
              <th className="px-4 py-3 text-right">Reçu</th>
              <th className="px-4 py-3 text-right">Solde</th>
              <th className="px-4 py-3 text-center">Utilisation</th>
              <th className="px-4 py-3 text-center">Fin</th>
              <th className="px-4 py-3 text-center">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {subventions.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-400 text-sm">Aucune subvention</td></tr>
            )}
            {subventions.map((s) => {
              const badge = STATUT_BADGE[s.statut] ?? STATUT_BADGE.en_attente;
              return (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.bailleur?.nom ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{s.reference}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs">{FCFA(s.montantTotalFcfa)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-blue-700">{FCFA(s.montantRecuFcfa)}</td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-green-700">{FCFA(s.montantSoldeFcfa)}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full bg-green-600" style={{ width: `${Math.min(s.tauxUtilisationPct ?? 0, 100)}%` }} />
                      </div>
                      <span className="text-xs text-gray-600 w-8">{s.tauxUtilisationPct}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">{DATE_FR(s.dateFin)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showModalSub     && <ModalCreerSubvention bailleurs={bailleurs} onClose={() => setShowModalSub(false)} />}
      {showModalBailleur && <ModalCreerBailleur onClose={() => setShowModalBailleur(false)} />}
    </div>
  );
}

// ─── Onglet 2 : Suivi budgétaire par subvention ───────────────────────────────
function OngletBudget({ subventions }: { subventions: SubventionAvecBailleur[] }) {
  const peutUtiliser = usePermission("subventions", "utiliser_fonds");
  const [selectedId, setSelectedId] = useState<number | null>(subventions[0]?.id ?? null);
  const [depenseLigne, setDepenseLigne] = useState<LigneBudgetSubvention | null>(null);

  const { data: detail } = useGetSubventionsId(selectedId ?? 0, {
    query: { queryKey: getGetSubventionsIdQueryKey(selectedId ?? 0), enabled: !!selectedId },
  });

  const d = detail as SubventionDetail & { lignes?: LigneBudgetSubvention[] } | undefined;
  const lignes = (d?.lignes ?? []) as LigneBudgetSubvention[];

  const barData = lignes.map((l) => ({
    name: l.posteBudgetaire,
    Alloué:  parseFloat(l.montantAlloueFcfa  ?? "0"),
    Utilisé: parseFloat(l.montantUtiliseFcfa ?? "0"),
  }));

  return (
    <div className="space-y-5">
      {/* Sélecteur subvention */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Subvention</label>
        <select value={selectedId ?? ""} onChange={(e) => setSelectedId(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 w-full max-w-md">
          {subventions.map((s) => (
            <option key={s.id} value={s.id}>{s.bailleur?.nom} — {s.reference}</option>
          ))}
        </select>
      </div>

      {d && lignes.length > 0 && (
        <>
          {/* Graphique */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-900 mb-4">Alloué vs Utilisé par poste budgétaire</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barData} margin={{ top: 4, right: 16, left: 20, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v / 1_000_000).toFixed(0) + "M"} />
                <Tooltip formatter={(v: number) => FCFA(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="Alloué"  fill="#d1d5db" radius={[4,4,0,0]} />
                <Bar dataKey="Utilisé" fill="#1a4731" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Tableau postes */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500">
                  <th className="px-4 py-3 text-left">Poste budgétaire</th>
                  <th className="px-4 py-3 text-right">Alloué</th>
                  <th className="px-4 py-3 text-right">Utilisé</th>
                  <th className="px-4 py-3 text-right">Solde</th>
                  <th className="px-4 py-3 text-center">% utilisé</th>
                  {peutUtiliser && <th className="px-4 py-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lignes.map((l) => {
                  const alloue  = parseFloat(l.montantAlloueFcfa  ?? "0");
                  const utilise = parseFloat(l.montantUtiliseFcfa ?? "0");
                  const solde   = alloue - utilise;
                  const taux    = alloue > 0 ? (utilise / alloue) * 100 : 0;
                  return (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{l.posteBudgetaire}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs">{FCFA(alloue)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-orange-700">{FCFA(utilise)}</td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-green-700">{FCFA(solde)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all"
                              style={{
                                width: `${Math.min(taux, 100)}%`,
                                backgroundColor: taux > 90 ? "#dc2626" : taux > 70 ? "#f97316" : "#16a34a",
                              }}
                            />
                          </div>
                          <span className="text-xs w-8 text-gray-600">{Math.round(taux)}%</span>
                        </div>
                      </td>
                      {peutUtiliser && (
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => setDepenseLigne(l)}
                            disabled={solde <= 0}
                            className="text-xs px-2 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40">
                            Dépense
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {d && lignes.length === 0 && (
        <p className="text-gray-400 text-sm">Aucune ligne budgétaire pour cette subvention.</p>
      )}

      {depenseLigne && selectedId && (
        <ModalDepense subventionId={selectedId} ligne={depenseLigne} onClose={() => setDepenseLigne(null)} />
      )}
    </div>
  );
}

// ─── Onglet 3 : Tranches ─────────────────────────────────────────────────────
function OngletTranches({ subventions }: { subventions: SubventionAvecBailleur[] }) {
  const peutEnregistrer = usePermission("subventions", "enregistrer_fonds");
  const [selectedId, setSelectedId] = useState<number | null>(subventions[0]?.id ?? null);
  const [modalTranche, setModalTranche] = useState<TrancheSubvention | null | "new">(null);

  const { data: detail } = useGetSubventionsId(selectedId ?? 0, {
    query: { queryKey: getGetSubventionsIdQueryKey(selectedId ?? 0), enabled: !!selectedId },
  });

  const d = detail as SubventionDetail | undefined;
  const tranches = (d?.tranches ?? []) as TrancheSubvention[];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <select value={selectedId ?? ""} onChange={(e) => setSelectedId(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-700 w-full max-w-md">
          {subventions.map((s) => (
            <option key={s.id} value={s.id}>{s.bailleur?.nom} — {s.reference}</option>
          ))}
        </select>
        {peutEnregistrer && selectedId && (
          <button onClick={() => setModalTranche("new")}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white rounded-lg shrink-0"
            style={{ backgroundColor: VERT }}>
            <Plus size={14} /> Confirmer réception
          </button>
        )}
      </div>

      {/* Timeline des tranches */}
      <div className="space-y-3">
        {tranches.length === 0 && <p className="text-gray-400 text-sm">Aucune tranche enregistrée.</p>}
        {tranches.map((t) => {
          const badge = TRANCHE_BADGE[t.statut] ?? TRANCHE_BADGE.attendue;
          return (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.cls}`}>
                    {badge.icon} {badge.label}
                  </div>
                  <span className="text-sm font-semibold text-gray-900">Tranche #{t.numeroTranche}</span>
                  <span className="text-sm font-bold" style={{ color: VERT }}>{FCFA(t.montantFcfa)}</span>
                </div>
                {peutEnregistrer && t.statut === "attendue" && (
                  <button onClick={() => setModalTranche(t)}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                    <CheckCircle2 size={13} /> Confirmer réception
                  </button>
                )}
              </div>
              <div className="mt-2 flex gap-6 text-xs text-gray-500">
                {t.datePrevue  && <span>Date prévue : <strong>{DATE_FR(t.datePrevue)}</strong></span>}
                {t.dateRecue   && <span>Date reçue : <strong>{DATE_FR(t.dateRecue)}</strong></span>}
                {t.referenceVirement && <span>Réf. virement : <strong>{t.referenceVirement}</strong></span>}
              </div>
            </div>
          );
        })}
      </div>

      {modalTranche !== null && selectedId && (
        <ModalTranche
          subventionId={selectedId}
          tranche={modalTranche === "new" ? undefined : modalTranche}
          onClose={() => setModalTranche(null)}
        />
      )}
    </div>
  );
}

// ─── Onglet 4 : Rapports bailleurs ───────────────────────────────────────────
function OngletRapports({ subventions }: { subventions: SubventionAvecBailleur[] }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const peutGenerer = usePermission("subventions", "generer_rapport");
  const [selectedId, setSelectedId] = useState<number | null>(subventions[0]?.id ?? null);
  const [showForm, setShowForm] = useState(false);
  const [formRapport, setFormRapport] = useState({ periode: "", typeRapport: "trimestriel" });

  const { data: detail, refetch } = useGetSubventionsId(selectedId ?? 0, {
    query: { queryKey: getGetSubventionsIdQueryKey(selectedId ?? 0), enabled: !!selectedId },
  });

  const d = detail as SubventionDetail | undefined;
  const rapports = (d?.rapports ?? []) as RapportBailleur[];

  const mutGenerer = usePostSubventionsIdRapport({
    mutation: {
      onSuccess: () => {
        refetch();
        setShowForm(false);
        toast({ title: "Rapport généré ✓" });
      },
      onError: () => toast({ title: "Erreur", variant: "destructive" }),
    },
  });

  const mutSoumettre = usePutSubventionsIdRapportRapportIdSoumettre({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: "Rapport soumis ✓" }); },
    },
  });

  const RAPPORT_BADGE: Record<string, { label: string; cls: string }> = {
    brouillon: { label: "Brouillon", cls: "bg-yellow-100 text-yellow-700" },
    soumis:    { label: "Soumis",    cls: "bg-blue-100   text-blue-700"   },
    valide:    { label: "Validé",    cls: "bg-green-100  text-green-700"  },
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <select value={selectedId ?? ""} onChange={(e) => setSelectedId(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-full max-w-md">
          {subventions.map((s) => (
            <option key={s.id} value={s.id}>{s.bailleur?.nom} — {s.reference}</option>
          ))}
        </select>
        {peutGenerer && selectedId && (
          <button onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-white rounded-lg shrink-0"
            style={{ backgroundColor: VERT }}>
            <FileText size={14} /> Générer rapport
          </button>
        )}
      </div>

      {/* Formulaire génération rapport */}
      {showForm && selectedId && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-3">
          <h4 className="font-semibold text-sm text-gray-700">Générer un nouveau rapport</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Période *</label>
              <input value={formRapport.periode} onChange={(e) => setFormRapport((f) => ({ ...f, periode: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                placeholder="ex : T2 2026 / Juin 2026" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={formRapport.typeRapport} onChange={(e) => setFormRapport((f) => ({ ...f, typeRapport: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                <option value="mensuel">Mensuel</option>
                <option value="trimestriel">Trimestriel</option>
                <option value="final">Final</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg text-gray-600">Annuler</button>
            <button
              onClick={() => mutGenerer.mutate({ id: selectedId, data: { periode: formRapport.periode, typeRapport: formRapport.typeRapport } })}
              disabled={mutGenerer.isPending || !formRapport.periode}
              className="px-4 py-2 text-sm text-white rounded-lg disabled:opacity-50"
              style={{ backgroundColor: VERT }}>
              {mutGenerer.isPending ? "Génération…" : "Générer"}
            </button>
          </div>
        </div>
      )}

      {/* Liste des rapports */}
      <div className="space-y-3">
        {rapports.length === 0 && <p className="text-gray-400 text-sm">Aucun rapport généré.</p>}
        {rapports.map((r) => {
          const badge = RAPPORT_BADGE[r.statut] ?? RAPPORT_BADGE.brouillon;
          return (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                  <span className="font-semibold text-sm text-gray-900">{r.periode ?? "—"}</span>
                  <span className="text-xs text-gray-500 capitalize">{r.typeRapport ?? "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {r.dateSoumission && <span className="text-xs text-gray-400">Soumis le {DATE_FR(r.dateSoumission)}</span>}
                  {r.statut === "brouillon" && peutGenerer && selectedId && (
                    <button
                      onClick={() => mutSoumettre.mutate({ id: selectedId, rapportId: r.id })}
                      disabled={mutSoumettre.isPending}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">
                      <Send size={12} /> Soumettre
                    </button>
                  )}
                </div>
              </div>
              {/* Résumé données CoopDigital */}
              {(() => {
                if (!r.contenuJson || typeof r.contenuJson !== "object") return null;
                const coop = (r.contenuJson as Record<string, { tonnageTotalKg?: number; nbMembresActifs?: number } | undefined>)["donneesCoopDigital"];
                if (!coop) return null;
                return (
                  <div className="mt-3 flex gap-4 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                    <span>Données CoopDigital intégrées :</span>
                    <span>Tonnage : <strong>{FCFA(coop.tonnageTotalKg)}</strong> kg</span>
                    <span>Membres actifs : <strong>{coop.nbMembresActifs ?? 0}</strong></span>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function SubventionsPage() {
  const [onglet, setOnglet] = useState<Onglet>("overview");

  const { data: subventions = [] } = useGetSubventions({
    query: { queryKey: getGetSubventionsQueryKey() },
  });
  const { data: bailleurs = [] } = useGetBailleurs({
    query: { queryKey: getGetBailleursQueryKey() },
  });

  const subs = (subventions as SubventionAvecBailleur[]);
  const bails = (bailleurs as Bailleur[]);

  const tabs: { id: Onglet; label: string }[] = [
    { id: "overview",  label: "Vue d'ensemble"                    },
    { id: "budget",    label: "Suivi budgétaire"                  },
    { id: "tranches",  label: "Tranches"                          },
    { id: "rapports",  label: "Rapports bailleurs"                },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Subventions & Bailleurs</h1>
        <p className="text-sm text-gray-500 mt-1">Gestion des subventions, tranches et rapports bailleurs</p>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {tabs.map(({ id, label }) => (
          <button key={id} onClick={() => setOnglet(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              onglet === id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {onglet === "overview"  && <OngletOverview  subventions={subs} bailleurs={bails} />}
      {onglet === "budget"    && <OngletBudget    subventions={subs} />}
      {onglet === "tranches"  && <OngletTranches  subventions={subs} />}
      {onglet === "rapports"  && <OngletRapports  subventions={subs} />}
    </div>
  );
}

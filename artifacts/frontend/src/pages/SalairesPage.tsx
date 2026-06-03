import { useState, useMemo } from "react";
import {
  useGetEmployes,
  useCreateEmploye,
  useDesactiverEmploye,
  useGetFichesPaie,
  useCreateFichePaie,
  useValiderFichePaie,
  usePayerFichePaie,
  useDeleteFichePaie,
  useGetRecapSalaires,
} from "@workspace/api-client-react";
import { usePermission } from "@/hooks/usePermission";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Banknote, CheckCircle2, Clock, Plus, Trash2,
  ShieldCheck, ChevronDown, X, AlertCircle,
} from "lucide-react";

// ─── Constantes ───────────────────────────────────────────────────────────────

const MOIS_LABELS = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre",
];

const ANNEES = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

function formatFcfa(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
}

// ─── Badges ───────────────────────────────────────────────────────────────────

const STATUT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  brouillon: { bg: "#f3f4f6", text: "#6b7280", label: "Brouillon" },
  valide:    { bg: "#dbeafe", text: "#1d4ed8", label: "Validé" },
  paye:      { bg: "#d1fae5", text: "#065f46", label: "Payé" },
};

function StatutBadge({ statut }: { statut: string }) {
  const s = STATUT_STYLE[statut] ?? STATUT_STYLE["brouillon"]!;
  return (
    <span
      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

function Initiales({ nom, prenoms }: { nom: string; prenoms: string }) {
  const l = `${prenoms[0] ?? ""}${nom[0] ?? ""}`.toUpperCase();
  return (
    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
      style={{ backgroundColor: "#1a4731" }}>
      {l}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon: Icon, color }: {
  label: string; value: string | number; icon: React.ElementType; color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + "20" }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-gray-400">{label}</p>
        <p className="text-base font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// ─── Modal création employé ───────────────────────────────────────────────────

interface ModalEmployeProps { onClose: () => void; onSuccess: () => void; }

function ModalCreateEmploye({ onClose, onSuccess }: ModalEmployeProps) {
  const { toast } = useToast();
  const mutation = useCreateEmploye();
  const [form, setForm] = useState({
    nom: "", prenoms: "", poste: "", telephone: "", email: "",
    dateEmbauche: new Date().toISOString().slice(0, 10),
    salaireBaseFcfa: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      data: {
        nom: form.nom,
        prenoms: form.prenoms,
        poste: form.poste,
        telephone: form.telephone || undefined,
        email: form.email || undefined,
        dateEmbauche: form.dateEmbauche,
        salaireBaseFcfa: parseInt(form.salaireBaseFcfa),
      },
    }, {
      onSuccess: () => { toast({ title: "Employé ajouté" }); onSuccess(); onClose(); },
      onError: (err) => {
        const msg = err instanceof Error ? err.message : "Erreur";
        toast({ title: "Erreur", description: msg, variant: "destructive" });
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Ajouter un employé</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Prénom(s)", key: "prenoms", placeholder: "Kouassi" },
              { label: "Nom", key: "nom", placeholder: "KOFFI" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
                <input
                  required
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Poste</label>
            <input
              required value={form.poste}
              onChange={(e) => setForm({ ...form, poste: e.target.value })}
              placeholder="Comptable, Gardien, Secrétaire…"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Téléphone</label>
              <input value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                placeholder="+225 07…"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Date d'embauche</label>
              <input type="date" required value={form.dateEmbauche}
                onChange={(e) => setForm({ ...form, dateEmbauche: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Salaire de base (FCFA)</label>
            <input
              type="number" required min={0} value={form.salaireBaseFcfa}
              onChange={(e) => setForm({ ...form, salaireBaseFcfa: e.target.value })}
              placeholder="150000"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: "#1a4731" }}>
              {mutation.isPending ? "Ajout…" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal création fiche de paie ─────────────────────────────────────────────

interface ModalFicheProps {
  employes: Array<{ id: number; nom: string; prenoms: string; poste: string; salaireBaseFcfa: number }>;
  moisDefaut: number;
  anneeDefaut: number;
  onClose: () => void;
  onSuccess: () => void;
}

function ModalCreateFiche({ employes, moisDefaut, anneeDefaut, onClose, onSuccess }: ModalFicheProps) {
  const { toast } = useToast();
  const mutation = useCreateFichePaie();

  const [employeId, setEmployeId] = useState<string>("");
  const [mois, setMois] = useState(moisDefaut);
  const [annee, setAnnee] = useState(anneeDefaut);
  const [salaireBase, setSalaireBase] = useState("");
  const [primes, setPrimes] = useState("0");
  const [indemnites, setIndemnites] = useState("0");
  const [heuresSup, setHeuresSup] = useState("0");
  const [avance, setAvance] = useState("0");
  const [observations, setObservations] = useState("");

  // Sélection employé → pré-remplir salaire de base
  const handleSelectEmploye = (id: string) => {
    setEmployeId(id);
    const emp = employes.find((e) => e.id === parseInt(id));
    if (emp) setSalaireBase(String(emp.salaireBaseFcfa));
  };

  // Calcul automatique
  const base = parseInt(salaireBase) || 0;
  const cnps = Math.round(base * 0.063); // 6,3 % taux salarié CNPS Côte d'Ivoire
  const net = base + (parseInt(primes) || 0) + (parseInt(indemnites) || 0)
    + (parseInt(heuresSup) || 0) - cnps - (parseInt(avance) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeId) return;
    mutation.mutate({
      data: {
        employeId: parseInt(employeId),
        mois, annee,
        salaireBaseFcfa: base,
        primesFcfa: parseInt(primes) || 0,
        "indemnitésFcfa": parseInt(indemnites) || 0,
        heuresSupFcfa: parseInt(heuresSup) || 0,
        deductionCnpsFcfa: cnps,
        deductionImpotFcfa: 0,
        avanceSurSalaireFcfa: parseInt(avance) || 0,
        observations: observations || undefined,
      },
    }, {
      onSuccess: () => { toast({ title: "Fiche créée" }); onSuccess(); onClose(); },
      onError: (err) => {
        const msg = err instanceof Error ? err.message : "Erreur";
        toast({ title: "Erreur", description: msg, variant: "destructive" });
      },
    });
  };

  const inputCls = "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">Nouvelle fiche de paie</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Employé */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Employé</label>
            <div className="relative">
              <select required value={employeId} onChange={(e) => handleSelectEmploye(e.target.value)}
                className={inputCls + " appearance-none pr-8 bg-white"}>
                <option value="">Sélectionner un employé…</option>
                {employes.filter(e => e.id).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.prenoms} {e.nom} — {e.poste}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Mois / Année */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Mois</label>
              <select value={mois} onChange={(e) => setMois(parseInt(e.target.value))}
                className={inputCls + " bg-white"}>
                {MOIS_LABELS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Année</label>
              <select value={annee} onChange={(e) => setAnnee(parseInt(e.target.value))}
                className={inputCls + " bg-white"}>
                {ANNEES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>

          {/* Composantes du salaire */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Éléments de rémunération</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Salaire de base (FCFA)", val: salaireBase, set: setSalaireBase, required: true },
                { label: "Primes (FCFA)", val: primes, set: setPrimes },
                { label: "Indemnités (FCFA)", val: indemnites, set: setIndemnites },
                { label: "Heures sup (FCFA)", val: heuresSup, set: setHeuresSup },
                { label: "Avance sur salaire (FCFA)", val: avance, set: setAvance },
              ].map(({ label, val, set, required }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
                  <input
                    type="number" min={0} required={required}
                    value={val} onChange={(e) => set(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">CNPS (6,3% auto)</label>
                <input
                  type="number" readOnly value={cnps}
                  className="w-full px-3 py-2 border border-gray-100 rounded-lg text-sm bg-gray-100 text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Résumé net */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-xl"
            style={{ backgroundColor: net >= 0 ? "#d1fae5" : "#fee2e2" }}
          >
            <span className="text-sm font-semibold" style={{ color: net >= 0 ? "#065f46" : "#991b1b" }}>
              Net à payer
            </span>
            <span className="text-lg font-bold" style={{ color: net >= 0 ? "#1a4731" : "#dc2626" }}>
              {formatFcfa(Math.max(0, net))}
            </span>
          </div>

          {/* Observations */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Observations (optionnel)</label>
            <textarea value={observations} onChange={(e) => setObservations(e.target.value)}
              rows={2} placeholder="Note interne…"
              className={inputCls + " resize-none"} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Annuler
            </button>
            <button type="submit" disabled={mutation.isPending || !employeId}
              className="flex-1 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: "#1a4731" }}>
              {mutation.isPending ? "Création…" : "Créer la fiche"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function SalairesPage() {
  const { toast } = useToast();
  const canRead         = usePermission("salaires", "lire");
  const canCreerEmploye = usePermission("salaires", "creer_employe");
  const canCreerFiche   = usePermission("salaires", "creer_fiche");
  const canValider      = usePermission("salaires", "valider_fiche");
  const canPayer        = usePermission("salaires", "marquer_paye");
  const canSupprimer    = usePermission("salaires", "supprimer_fiche");

  const now = new Date();
  const [tab, setTab] = useState<"fiches" | "employes">("fiches");
  const [moisFiltre, setMoisFiltre] = useState(now.getMonth() + 1);
  const [anneeFiltre, setAnneeFiltre] = useState(now.getFullYear());
  const [showCreateEmploye, setShowCreateEmploye] = useState(false);
  const [showCreateFiche, setShowCreateFiche] = useState(false);

  const { data: employes, refetch: refetchEmployes, isLoading: loadingEmployes } = useGetEmployes();
  const { data: fiches, refetch: refetchFiches, isLoading: loadingFiches } = useGetFichesPaie(
    { mois: moisFiltre, annee: anneeFiltre },
    { query: { queryKey: ["fiches", moisFiltre, anneeFiltre] } },
  );
  const { data: recap, refetch: refetchRecap } = useGetRecapSalaires(
    { mois: moisFiltre, annee: anneeFiltre },
    { query: { queryKey: ["recap", moisFiltre, anneeFiltre] } },
  );

  const validerMutation = useValiderFichePaie();
  const payerMutation = usePayerFichePaie();
  const supprimerMutation = useDeleteFichePaie();
  const desactiverMutation = useDesactiverEmploye();

  const refetchAll = () => { void refetchFiches(); void refetchRecap(); };

  // Filtrer les fiches par mois/année côté client (backup si params non passés)
  const fichesFiltrees = useMemo(() =>
    (fiches ?? []).filter((f) => f.fiche.mois === moisFiltre && f.fiche.annee === anneeFiltre),
    [fiches, moisFiltre, anneeFiltre]);

  const employesActifs = useMemo(() =>
    (employes ?? []).filter((e) => e.statut === "actif"),
    [employes]);

  if (!canRead) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 text-center">
        <ShieldCheck className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">Accès réservé à la direction, comptabilité et audit</p>
      </div>
    );
  }

  function handleValider(id: number) {
    validerMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Fiche validée" }); refetchAll(); },
      onError: (err) => toast({ title: "Erreur", description: err instanceof Error ? err.message : "", variant: "destructive" }),
    });
  }

  function handlePayer(id: number) {
    payerMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Fiche marquée payée" }); refetchAll(); },
      onError: (err) => toast({ title: "Erreur", description: err instanceof Error ? err.message : "", variant: "destructive" }),
    });
  }

  function handleSupprimer(id: number) {
    if (!confirm("Supprimer cette fiche de paie ?")) return;
    supprimerMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Fiche supprimée" }); refetchAll(); },
      onError: (err) => toast({ title: "Erreur", description: err instanceof Error ? err.message : "", variant: "destructive" }),
    });
  }

  function handleDesactiver(id: number, nom: string) {
    if (!confirm(`Désactiver l'employé ${nom} ?`)) return;
    desactiverMutation.mutate({ id }, {
      onSuccess: () => { toast({ title: "Employé désactivé" }); void refetchEmployes(); },
      onError: (err) => toast({ title: "Erreur", description: err instanceof Error ? err.message : "", variant: "destructive" }),
    });
  }

  const moisLabel = MOIS_LABELS[(moisFiltre - 1)] ?? "";

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestion des salaires</h1>
          <p className="text-sm text-gray-500 mt-1">{moisLabel} {anneeFiltre}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filtre mois */}
          <select value={moisFiltre} onChange={(e) => setMoisFiltre(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
            {MOIS_LABELS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select value={anneeFiltre} onChange={(e) => setAnneeFiltre(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500">
            {ANNEES.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label="Employés actifs"
          value={recap?.nbEmployesActifs ?? employesActifs.length}
          icon={Users}
          color="#1a4731"
        />
        <KpiCard
          label="Masse salariale brute"
          value={formatFcfa(recap?.masseSalarialeBrute ?? 0)}
          icon={Banknote}
          color="#c4962a"
        />
        <KpiCard
          label="Masse salariale nette"
          value={formatFcfa(recap?.masseSalarialeNette ?? 0)}
          icon={Banknote}
          color="#1d4ed8"
        />
        <KpiCard
          label={`Fiches payées / ${recap?.nbFiches ?? 0}`}
          value={`${recap?.nbPayees ?? 0} / ${recap?.nbFiches ?? 0}`}
          icon={CheckCircle2}
          color="#059669"
        />
      </div>

      {/* Onglets */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {(["fiches", "employes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={tab === t ? { backgroundColor: "white", color: "#1a4731", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" } : { color: "#6b7280" }}
          >
            {t === "fiches" ? "Fiches de paie" : "Employés"}
          </button>
        ))}
      </div>

      {/* ── TAB FICHES DE PAIE ─────────────────────────────────────── */}
      {tab === "fiches" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {fichesFiltrees.length} fiche{fichesFiltrees.length !== 1 ? "s" : ""} — {moisLabel} {anneeFiltre}
            </p>
            {canCreerFiche && (
              <button onClick={() => setShowCreateFiche(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: "#1a4731" }}>
                <Plus size={15} />
                Nouvelle fiche
              </button>
            )}
          </div>

          {loadingFiches ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement…</div>
          ) : fichesFiltrees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clock className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-gray-500 text-sm">Aucune fiche pour {moisLabel} {anneeFiltre}</p>
              {canCreerFiche && (
                <button onClick={() => setShowCreateFiche(true)}
                  className="mt-3 text-sm font-medium underline"
                  style={{ color: "#1a4731" }}>
                  Créer les fiches du mois
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Employé</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Brut</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Déductions</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Net à payer</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fichesFiltrees.map(({ fiche, employe }) => {
                    const brut = fiche.salaireBaseFcfa + fiche.primesFcfa
                      + fiche.indemnitésFcfa
                      + fiche.heuresSupFcfa;
                    const deductions = fiche.deductionCnpsFcfa + fiche.deductionImpotFcfa
                      + fiche.avanceSurSalaireFcfa;
                    return (
                      <tr key={fiche.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Initiales nom={employe.nom} prenoms={employe.prenoms} />
                            <div>
                              <p className="font-medium text-gray-900">{employe.prenoms} {employe.nom}</p>
                              <p className="text-xs text-gray-400">{employe.poste}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {new Intl.NumberFormat("fr-FR").format(brut)}
                        </td>
                        <td className="px-4 py-3 text-right text-red-600 text-xs hidden sm:table-cell">
                          − {new Intl.NumberFormat("fr-FR").format(deductions)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold" style={{ color: "#1a4731" }}>
                          {new Intl.NumberFormat("fr-FR").format(fiche.netAPayerFcfa)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatutBadge statut={fiche.statut} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {canValider && fiche.statut === "brouillon" && (
                              <button
                                onClick={() => handleValider(fiche.id)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                              >
                                Valider
                              </button>
                            )}
                            {canPayer && fiche.statut === "valide" && (
                              <button
                                onClick={() => handlePayer(fiche.id)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                                style={{ backgroundColor: "#1a4731" }}
                              >
                                Payer
                              </button>
                            )}
                            {canSupprimer && fiche.statut === "brouillon" && (
                              <button
                                onClick={() => handleSupprimer(fiche.id)}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Ligne total */}
          {fichesFiltrees.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex justify-between items-center text-sm">
              <span className="text-gray-500">Total masse salariale nette</span>
              <span className="font-bold text-gray-900">{formatFcfa(recap?.masseSalarialeNette ?? 0)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── TAB EMPLOYÉS ──────────────────────────────────────────── */}
      {tab === "employes" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-medium text-gray-700">
              {employes?.length ?? 0} employé{(employes?.length ?? 0) !== 1 ? "s" : ""}
            </p>
            {canCreerEmploye && (
              <button onClick={() => setShowCreateEmploye(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: "#1a4731" }}>
                <Plus size={15} />
                Ajouter un employé
              </button>
            )}
          </div>

          {loadingEmployes ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Chargement…</div>
          ) : !employes || employes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertCircle className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-gray-500 text-sm">Aucun employé enregistré</p>
              {canCreerEmploye && (
                <button onClick={() => setShowCreateEmploye(true)}
                  className="mt-3 text-sm font-medium underline" style={{ color: "#1a4731" }}>
                  Ajouter le premier employé
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Employé</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">Poste</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Salaire de base</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {employes.map((emp) => (
                    <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <Initiales nom={emp.nom} prenoms={emp.prenoms} />
                          <div>
                            <p className="font-medium text-gray-900">{emp.prenoms} {emp.nom}</p>
                            <p className="text-xs text-gray-400 sm:hidden">{emp.poste}</p>
                            {emp.telephone && <p className="text-xs text-gray-400">{emp.telephone}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{emp.poste}</td>
                      <td className="px-4 py-3 text-right font-medium text-gray-900">
                        {formatFcfa(emp.salaireBaseFcfa)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          emp.statut === "actif" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {emp.statut === "actif" ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {canCreerEmploye && emp.statut === "actif" && (
                          <button
                            onClick={() => handleDesactiver(emp.id, `${emp.prenoms} ${emp.nom}`)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Désactiver"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showCreateEmploye && (
        <ModalCreateEmploye
          onClose={() => setShowCreateEmploye(false)}
          onSuccess={() => void refetchEmployes()}
        />
      )}
      {showCreateFiche && (
        <ModalCreateFiche
          employes={employesActifs}
          moisDefaut={moisFiltre}
          anneeDefaut={anneeFiltre}
          onClose={() => setShowCreateFiche(false)}
          onSuccess={refetchAll}
        />
      )}
    </div>
  );
}

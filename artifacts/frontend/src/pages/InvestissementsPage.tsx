import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { MoneyInput } from "@/components/ui/money-input";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.VITE_API_URL ?? "";

function fmtF(n: number) {
  return n.toLocaleString("fr-CI") + " FCFA";
}

type Statut = "planifie" | "en_cours" | "termine" | "suspendu" | "annule";
type Categorie = "infrastructure" | "equipement" | "vehicule" | "informatique" | "autre";
type Source = "fonds_propres" | "emprunt" | "subvention" | "mixte";
type Priorite = "haute" | "normale" | "basse";

interface Depense {
  id: number;
  dateDepense: string;
  libelle: string;
  montantFcfa: number;
  fournisseur?: string;
  referenceFacture?: string;
}

interface Projet {
  id: number;
  titre: string;
  description?: string;
  categorie: Categorie;
  montantEstimeFcfa: number;
  montantEngageFcfa: number;
  montantRealiseFcfa: number;
  tauxExecutionPct: number;
  sourceFinancement: Source;
  empruntId?: number;
  subventionId?: number;
  dateDebutPrevue?: string;
  dateFinPrevue?: string;
  dateFinReelle?: string;
  statut: Statut;
  priorite: Priorite;
  depenses?: Depense[];
}

interface TableauBord {
  nb_projets: number;
  total_estime: number;
  total_realise: number;
  taux_execution_pct: number;
  projets_en_retard: number;
  par_statut: { statut: string; nb: number }[];
  par_categorie: { categorie: string; nb: number; total: number }[];
}

const STATUT_LABELS: Record<Statut, string> = {
  planifie: "Planifié",
  en_cours: "En cours",
  termine:  "Terminé",
  suspendu: "Suspendu",
  annule:   "Annulé",
};

const STATUT_COLORS: Record<Statut, string> = {
  planifie: "bg-blue-100 text-blue-700",
  en_cours: "bg-yellow-100 text-yellow-700",
  termine:  "bg-green-100 text-green-700",
  suspendu: "bg-gray-100 text-gray-600",
  annule:   "bg-red-100 text-red-600",
};

const CAT_LABELS: Record<Categorie, string> = {
  infrastructure: "Infrastructure",
  equipement:     "Équipement",
  vehicule:       "Véhicule",
  informatique:   "Informatique",
  autre:          "Autre",
};

const SOURCE_LABELS: Record<Source, string> = {
  fonds_propres: "Fonds propres",
  emprunt:       "Emprunt",
  subvention:    "Subvention",
  mixte:         "Mixte",
};

const PRIO_LABELS: Record<Priorite, string> = {
  haute:   "Haute",
  normale: "Normale",
  basse:   "Basse",
};

const PRIO_COLORS: Record<Priorite, string> = {
  haute:   "text-red-600",
  normale: "text-yellow-600",
  basse:   "text-gray-500",
};

function ProgressBar({ pct, color = "bg-green-500" }: { pct: number; color?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

function isEnRetard(p: Projet): boolean {
  if (!p.dateFinPrevue) return false;
  if (p.statut === "termine" || p.statut === "annule") return false;
  return new Date(p.dateFinPrevue) < new Date();
}

// ─── Modal Nouveau Projet ─────────────────────────────────────────────────────

function ModalNouveauProjet({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    titre: "",
    description: "",
    categorie: "infrastructure" as Categorie,
    montantEstimeFcfa: "",
    sourceFinancement: "fonds_propres" as Source,
    priorite: "normale" as Priorite,
    statut: "planifie" as Statut,
    dateDebutPrevue: "",
    dateFinPrevue: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/investissements/projets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          montantEstimeFcfa: Number(form.montantEstimeFcfa),
          dateDebutPrevue: form.dateDebutPrevue || undefined,
          dateFinPrevue:   form.dateFinPrevue   || undefined,
          description:     form.description     || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Erreur");
      toast({ title: "Projet créé" });
      onSuccess();
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Nouveau projet</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Titre *</label>
            <input
              required
              value={form.titre}
              onChange={(e) => set("titre", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Construction hangar de stockage"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Catégorie</label>
              <select
                value={form.categorie}
                onChange={(e) => set("categorie", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {(Object.keys(CAT_LABELS) as Categorie[]).map((k) => (
                  <option key={k} value={k}>{CAT_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Priorité</label>
              <select
                value={form.priorite}
                onChange={(e) => set("priorite", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {(Object.keys(PRIO_LABELS) as Priorite[]).map((k) => (
                  <option key={k} value={k}>{PRIO_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Montant estimé (FCFA) *</label>
              <MoneyInput
                required
                value={form.montantEstimeFcfa}
                onChange={(raw) => set("montantEstimeFcfa", raw)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Source financement</label>
              <select
                value={form.sourceFinancement}
                onChange={(e) => set("sourceFinancement", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {(Object.keys(SOURCE_LABELS) as Source[]).map((k) => (
                  <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Date début prévue</label>
              <input
                type="date"
                value={form.dateDebutPrevue}
                onChange={(e) => set("dateDebutPrevue", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Date fin prévue</label>
              <input
                type="date"
                value={form.dateFinPrevue}
                onChange={(e) => set("dateFinPrevue", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Statut initial</label>
            <select
              value={form.statut}
              onChange={(e) => set("statut", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {(Object.keys(STATUT_LABELS) as Statut[]).map((k) => (
                <option key={k} value={k}>{STATUT_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Création…" : "Créer le projet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Ajouter dépense ────────────────────────────────────────────────────

function ModalDepense({
  projet,
  onClose,
  onSuccess,
}: {
  projet: Projet;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { token } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    dateDepense:      new Date().toISOString().slice(0, 10),
    libelle:          "",
    montantFcfa:      "",
    fournisseur:      "",
    referenceFacture: "",
  });

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await fetch(`${BASE}/api/investissements/${projet.id}/depense`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          dateDepense:      form.dateDepense,
          libelle:          form.libelle,
          montantFcfa:      Number(form.montantFcfa),
          fournisseur:      form.fournisseur      || undefined,
          referenceFacture: form.referenceFacture || undefined,
        }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Erreur");
      toast({ title: "Dépense enregistrée" });
      onSuccess();
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="p-5 border-b flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-800">Ajouter une dépense</h2>
            <p className="text-xs text-gray-500 mt-0.5">{projet.titre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Date *</label>
              <input
                required
                type="date"
                value={form.dateDepense}
                onChange={(e) => set("dateDepense", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Montant (FCFA) *</label>
              <MoneyInput
                required
                value={form.montantFcfa}
                onChange={(raw) => set("montantFcfa", raw)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Libellé *</label>
            <input
              required
              value={form.libelle}
              onChange={(e) => set("libelle", e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Achat matériaux, paiement prestataire…"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Fournisseur</label>
              <input
                value={form.fournisseur}
                onChange={(e) => set("fournisseur", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">N° facture</label>
              <input
                value={form.referenceFacture}
                onChange={(e) => set("referenceFacture", e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {loading ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal Détail Projet ──────────────────────────────────────────────────────

function ModalDetailProjet({
  projet,
  onClose,
  onDepense,
}: {
  projet: Projet & { depenses: Depense[] };
  onClose: () => void;
  onDepense: () => void;
}) {
  const retard = isEnRetard(projet);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-gray-800">{projet.titre}</h2>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[projet.statut]}`}>
                {STATUT_LABELS[projet.statut]}
              </span>
              {retard && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                  En retard
                </span>
              )}
            </div>
            {projet.description && (
              <p className="text-sm text-gray-500 mt-1">{projet.description}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl shrink-0">✕</button>
        </div>

        <div className="p-6 space-y-6">
          {/* Progression */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Avancement financier</span>
              <span className={`font-bold ${projet.tauxExecutionPct >= 100 ? "text-green-600" : "text-gray-800"}`}>
                {projet.tauxExecutionPct}%
              </span>
            </div>
            <ProgressBar pct={projet.tauxExecutionPct} color={projet.tauxExecutionPct >= 100 ? "bg-green-500" : "bg-blue-500"} />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Réalisé : {fmtF(projet.montantRealiseFcfa)}</span>
              <span>Estimé : {fmtF(projet.montantEstimeFcfa)}</span>
            </div>
          </div>

          {/* Infos */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <span className="text-gray-500">Catégorie</span>
              <p className="font-medium">{CAT_LABELS[projet.categorie]}</p>
            </div>
            <div>
              <span className="text-gray-500">Priorité</span>
              <p className={`font-medium ${PRIO_COLORS[projet.priorite]}`}>{PRIO_LABELS[projet.priorite]}</p>
            </div>
            <div>
              <span className="text-gray-500">Financement</span>
              <p className="font-medium">{SOURCE_LABELS[projet.sourceFinancement]}</p>
            </div>
            <div>
              <span className="text-gray-500">Montant engagé</span>
              <p className="font-medium">{fmtF(projet.montantEngageFcfa)}</p>
            </div>
            {projet.dateDebutPrevue && (
              <div>
                <span className="text-gray-500">Début prévu</span>
                <p className="font-medium">{new Date(projet.dateDebutPrevue).toLocaleDateString("fr-FR")}</p>
              </div>
            )}
            {projet.dateFinPrevue && (
              <div>
                <span className="text-gray-500">Fin prévue</span>
                <p className={`font-medium ${retard ? "text-red-600" : ""}`}>
                  {new Date(projet.dateFinPrevue).toLocaleDateString("fr-FR")}
                </p>
              </div>
            )}
            {projet.empruntId && (
              <div>
                <span className="text-gray-500">Emprunt lié</span>
                <p className="font-medium text-blue-600 underline cursor-pointer">
                  Emprunt #{projet.empruntId}
                </p>
              </div>
            )}
            {projet.subventionId && (
              <div>
                <span className="text-gray-500">Subvention liée</span>
                <p className="font-medium text-blue-600 underline cursor-pointer">
                  Subvention #{projet.subventionId}
                </p>
              </div>
            )}
          </div>

          {/* Dépenses */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700 text-sm">
                Dépenses enregistrées ({projet.depenses.length})
              </h3>
              {projet.statut !== "annule" && projet.statut !== "termine" && (
                <button
                  onClick={onDepense}
                  className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium"
                >
                  + Ajouter une dépense
                </button>
              )}
            </div>
            {projet.depenses.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Aucune dépense enregistrée</p>
            ) : (
              <div className="space-y-2">
                {projet.depenses.map((d) => (
                  <div key={d.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-gray-800">{d.libelle}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(d.dateDepense).toLocaleDateString("fr-FR")}
                        {d.fournisseur && ` · ${d.fournisseur}`}
                        {d.referenceFacture && ` · Fact. ${d.referenceFacture}`}
                      </p>
                    </div>
                    <span className="font-semibold text-gray-800 shrink-0 ml-4">{fmtF(d.montantFcfa)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Gantt simplifié ──────────────────────────────────────────────────────────

function GanttTimeline({ projets }: { projets: Projet[] }) {
  const avecDates = projets.filter((p) => p.dateDebutPrevue && p.dateFinPrevue);
  if (avecDates.length === 0) {
    return (
      <div className="text-sm text-gray-400 text-center py-8">
        Aucun projet avec dates définies
      </div>
    );
  }

  const minDate = new Date(Math.min(...avecDates.map((p) => new Date(p.dateDebutPrevue!).getTime())));
  const maxDate = new Date(Math.max(...avecDates.map((p) => new Date(p.dateFinPrevue!).getTime())));
  const totalMs = maxDate.getTime() - minDate.getTime() || 1;

  const months: string[] = [];
  const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    months.push(cur.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" }));
    cur.setMonth(cur.getMonth() + 1);
  }

  return (
    <div className="overflow-x-auto">
      {/* En-tête mois */}
      <div className="flex mb-2 ml-48 text-xs text-gray-400" style={{ minWidth: "600px" }}>
        {months.map((m, i) => (
          <div key={i} className="flex-1 text-center border-l border-gray-100 py-1">{m}</div>
        ))}
      </div>
      <div className="space-y-2" style={{ minWidth: "750px" }}>
        {avecDates.map((p) => {
          const start = new Date(p.dateDebutPrevue!).getTime();
          const end   = new Date(p.dateFinPrevue!).getTime();
          const left  = ((start - minDate.getTime()) / totalMs) * 100;
          const width = Math.max(2, ((end - start) / totalMs) * 100);
          const retard = isEnRetard(p);
          const barColor = retard ? "bg-red-400" : p.statut === "termine" ? "bg-green-500" : "bg-blue-400";

          return (
            <div key={p.id} className="flex items-center gap-2">
              <div className="w-48 shrink-0 text-xs font-medium text-gray-700 truncate pr-2 text-right">{p.titre}</div>
              <div className="flex-1 relative h-7 bg-gray-50 rounded">
                <div
                  className={`absolute top-1 h-5 rounded ${barColor} flex items-center px-2`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${p.dateDebutPrevue} → ${p.dateFinPrevue}`}
                >
                  <span className="text-white text-xs font-medium truncate">{p.tauxExecutionPct}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function InvestissementsPage() {
  const { token, utilisateur } = useAuth();
  const [tab, setTab] = useState<"projets" | "timeline">("projets");
  const [projets, setProjets]       = useState<Projet[]>([]);
  const [bord, setBord]             = useState<TableauBord | null>(null);
  const [loading, setLoading]       = useState(true);
  const [showNouveauProjet, setShowNouveauProjet] = useState(false);
  const [projetDetail, setProjetDetail] = useState<(Projet & { depenses: Depense[] }) | null>(null);
  const [projetDepense, setProjetDepense] = useState<Projet | null>(null);
  const [filtreStatut, setFiltreStatut]     = useState("");
  const [filtreCategorie, setFiltreCategorie] = useState("");

  const canCreate  = utilisateur && ["pca", "directeur"].includes(utilisateur.role);
  const canDepense = utilisateur && ["pca", "directeur", "comptable"].includes(utilisateur.role);

  async function load() {
    setLoading(true);
    try {
      const [rProjets, rBord] = await Promise.all([
        fetch(
          `${BASE}/api/investissements/projets${filtreStatut ? `?statut=${filtreStatut}` : ""}${filtreCategorie ? `${filtreStatut ? "&" : "?"}categorie=${filtreCategorie}` : ""}`,
          { headers: { Authorization: `Bearer ${token}` } }
        ),
        fetch(`${BASE}/api/investissements/tableau-bord`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setProjets(rProjets.ok ? await rProjets.json() : []);
      setBord(rBord.ok ? await rBord.json() : null);
    } finally {
      setLoading(false);
    }
  }

  // biome-ignore lint: load on mount + filter change
  useState(() => { void load(); });

  async function openDetail(p: Projet) {
    const r = await fetch(`${BASE}/api/investissements/projets/${p.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const data = await r.json();
      setProjetDetail(data);
    }
  }

  const projetsFiltres = useMemo(() => projets, [projets]);

  const nbEnRetard = projets.filter(isEnRetard).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

        {/* En-tête */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Investissements</h1>
            <p className="text-sm text-gray-500 mt-0.5">Suivi des projets d'investissement de la coopérative</p>
          </div>
          {canCreate && (
            <button
              onClick={() => setShowNouveauProjet(true)}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            >
              + Nouveau projet
            </button>
          )}
        </div>

        {/* KPIs */}
        {bord && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 font-medium">Projets actifs</p>
              <p className="text-2xl font-bold text-gray-800 mt-1">{bord.nb_projets}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 font-medium">Montant estimé total</p>
              <p className="text-xl font-bold text-gray-800 mt-1">{fmtF(bord.total_estime)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500 font-medium">Taux d'exécution</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{bord.taux_execution_pct}%</p>
              <ProgressBar pct={bord.taux_execution_pct} color="bg-blue-500" />
            </div>
            <div className={`rounded-xl border p-4 ${bord.projets_en_retard > 0 ? "bg-red-50 border-red-200" : "bg-white"}`}>
              <p className="text-xs text-gray-500 font-medium">Projets en retard</p>
              <p className={`text-2xl font-bold mt-1 ${bord.projets_en_retard > 0 ? "text-red-600" : "text-gray-800"}`}>
                {bord.projets_en_retard}
              </p>
            </div>
          </div>
        )}

        {/* Filtres + tabs */}
        <div className="bg-white rounded-xl border">
          <div className="flex items-center gap-4 p-4 border-b flex-wrap">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["projets", "timeline"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t ? "bg-white shadow text-gray-800" : "text-gray-500"}`}
                >
                  {t === "projets" ? "Projets" : "Timeline"}
                </button>
              ))}
            </div>
            <div className="flex gap-2 ml-auto flex-wrap">
              <select
                value={filtreStatut}
                onChange={(e) => setFiltreStatut(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Tous les statuts</option>
                {(Object.keys(STATUT_LABELS) as Statut[]).map((k) => (
                  <option key={k} value={k}>{STATUT_LABELS[k]}</option>
                ))}
              </select>
              <select
                value={filtreCategorie}
                onChange={(e) => setFiltreCategorie(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Toutes catégories</option>
                {(Object.keys(CAT_LABELS) as Categorie[]).map((k) => (
                  <option key={k} value={k}>{CAT_LABELS[k]}</option>
                ))}
              </select>
              <button
                onClick={() => load()}
                className="border rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                ↻ Filtrer
              </button>
            </div>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="text-center text-gray-400 py-10">Chargement…</div>
            ) : tab === "timeline" ? (
              <GanttTimeline projets={projetsFiltres} />
            ) : projetsFiltres.length === 0 ? (
              <div className="text-center text-gray-400 py-10">Aucun projet</div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {projetsFiltres.map((p) => {
                  const retard = isEnRetard(p);
                  return (
                    <div
                      key={p.id}
                      className={`border rounded-xl p-4 hover:shadow-md transition-shadow cursor-pointer ${retard ? "border-red-200 bg-red-50/30" : "bg-white"}`}
                      onClick={() => openDetail(p)}
                    >
                      {/* Header carte */}
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 text-sm leading-tight truncate">{p.titre}</h3>
                          <p className="text-xs text-gray-500 mt-0.5">{CAT_LABELS[p.categorie]} · {SOURCE_LABELS[p.sourceFinancement]}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUT_COLORS[p.statut]}`}>
                            {STATUT_LABELS[p.statut]}
                          </span>
                          {retard && (
                            <span className="text-xs text-red-500 font-medium">⚠ En retard</span>
                          )}
                        </div>
                      </div>

                      {/* Priorité */}
                      <p className={`text-xs font-medium mb-3 ${PRIO_COLORS[p.priorite]}`}>
                        ↑ Priorité {PRIO_LABELS[p.priorite].toLowerCase()}
                      </p>

                      {/* Barre progression */}
                      <div className="space-y-1 mb-3">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-500">Réalisé</span>
                          <span className="font-semibold text-gray-700">{p.tauxExecutionPct}%</span>
                        </div>
                        <ProgressBar
                          pct={p.tauxExecutionPct}
                          color={p.tauxExecutionPct >= 100 ? "bg-green-500" : retard ? "bg-red-400" : "bg-blue-500"}
                        />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>{fmtF(p.montantRealiseFcfa)}</span>
                          <span>{fmtF(p.montantEstimeFcfa)}</span>
                        </div>
                      </div>

                      {/* Dates */}
                      {(p.dateDebutPrevue || p.dateFinPrevue) && (
                        <p className="text-xs text-gray-400">
                          {p.dateDebutPrevue && new Date(p.dateDebutPrevue).toLocaleDateString("fr-FR")}
                          {p.dateDebutPrevue && p.dateFinPrevue && " → "}
                          {p.dateFinPrevue && (
                            <span className={retard ? "text-red-500 font-medium" : ""}>
                              {new Date(p.dateFinPrevue).toLocaleDateString("fr-FR")}
                            </span>
                          )}
                        </p>
                      )}

                      {/* Actions */}
                      {canDepense && p.statut !== "annule" && p.statut !== "termine" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setProjetDepense(p); }}
                          className="mt-3 w-full border border-green-300 text-green-700 hover:bg-green-50 rounded-lg py-1.5 text-xs font-medium"
                        >
                          + Ajouter une dépense
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      {showNouveauProjet && (
        <ModalNouveauProjet
          onClose={() => setShowNouveauProjet(false)}
          onSuccess={() => { setShowNouveauProjet(false); void load(); }}
        />
      )}
      {projetDetail && (
        <ModalDetailProjet
          projet={projetDetail}
          onClose={() => setProjetDetail(null)}
          onDepense={() => { setProjetDepense(projetDetail); setProjetDetail(null); }}
        />
      )}
      {projetDepense && (
        <ModalDepense
          projet={projetDepense}
          onClose={() => setProjetDepense(null)}
          onSuccess={() => { setProjetDepense(null); void load(); }}
        />
      )}
    </div>
  );
}

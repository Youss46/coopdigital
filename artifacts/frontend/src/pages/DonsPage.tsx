import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Gift, ArrowUpCircle, ArrowDownCircle, TrendingUp, Plus, Loader2,
  RefreshCw, CheckCircle2, XCircle, Clock, FileText, X, Trash2,
  BarChart3, Users,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

// ── Token auth ──────────────────────────────────────────────────────────────
const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";
const headers = () => ({
  Authorization: `Bearer ${tok()}`,
  "Content-Type": "application/json",
});

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(path, { headers: headers() });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ erreur: r.statusText }))).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ erreur: r.statusText }))).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}
async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method: "PUT", headers: headers(), body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error((await r.json().catch(() => ({ erreur: r.statusText }))).erreur ?? r.statusText);
  return r.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────
interface Categorie { id: number; libelle: string; sens: string }
interface LigneNature { designation: string; quantite: number; unite: string; valeurUnitaireFcfa: number }
interface Don {
  id: number; reference?: string; sens: string; forme: string;
  libelle: string; dateDon: string; statut: string;
  categorieId?: number; categorieLibelle?: string;
  beneficiaireNom?: string; beneficiaireType?: string; beneficiaireMembreId?: number;
  donateurNom?: string; donateurType?: string;
  montantFcfa?: string; valeurEstimeeFcfa?: string;
  pvRemise?: boolean; ecritureGeneree?: boolean;
}
interface Programme {
  id: number; libelle: string; description?: string;
  budgetAlloueFcfa: string; budgetUtiliseFcfa: string; statut: string;
}
interface Stats {
  donsEffectues: { nb: number; montantEspeces: number; valeurNature: number; total: number };
  donsRecus: { nb: number; montantEspeces: number; valeurNature: number; total: number };
  soldeNet: number;
  parCategorie: Array<{ label: string; montant: number }>;
  parMois: Array<{ mois: string; effectue: number; recu: number }>;
  derniersDons: Don[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const FCFA = (n: number | string) =>
  new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " F";

const montantDon = (d: Don) =>
  d.forme === "especes"
    ? parseFloat(d.montantFcfa ?? "0")
    : parseFloat(d.valeurEstimeeFcfa ?? "0");

function statutBadge(s: string) {
  const map: Record<string, string> = {
    brouillon: "bg-yellow-100 text-yellow-800",
    valide:    "bg-green-100 text-green-800",
    annule:    "bg-red-100 text-red-800",
  };
  return `inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[s] ?? "bg-gray-100 text-gray-700"}`;
}

const TABS = ["Tableau de bord", "Dons effectués", "Dons reçus", "Programmes"] as const;
type TabType = typeof TABS[number];

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

// ── Composant modal création ──────────────────────────────────────────────────
interface ModalDonProps {
  sens: "effectue" | "recu";
  categories: Categorie[];
  onClose: () => void;
  onSuccess: () => void;
}

function ModalNouveauDon({ sens, categories, onClose, onSuccess }: ModalDonProps) {
  const [forme, setForme] = useState<"especes" | "nature">("especes");
  const [libelle, setLibelle] = useState("");
  const [dateDon, setDateDon] = useState(new Date().toISOString().slice(0, 10));
  const [categorieId, setCategorieId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [montantFcfa, setMontantFcfa] = useState<number | "">("");
  // Bénéficiaire
  const [beneficiaireNom, setBeneficiaireNom] = useState("");
  const [beneficiaireType, setBeneficiaireType] = useState("communaute");
  const [beneficiaireVillage, setBeneficiaireVillage] = useState("");
  // Donateur
  const [donateurNom, setDonateurNom] = useState("");
  const [donateurType, setDonateurType] = useState("ong");
  const [donateurContact, setDonateurContact] = useState("");
  // Lignes nature
  const [lignes, setLignes] = useState<LigneNature[]>([
    { designation: "", quantite: 1, unite: "unité", valeurUnitaireFcfa: 0 },
  ]);
  const [pvRemise, setPvRemise] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const totalNature = lignes.reduce((s, l) => s + l.quantite * l.valeurUnitaireFcfa, 0);

  function addLigne() {
    setLignes([...lignes, { designation: "", quantite: 1, unite: "unité", valeurUnitaireFcfa: 0 }]);
  }
  function updateLigne(i: number, patch: Partial<LigneNature>) {
    setLignes(lignes.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function removeLigne(i: number) {
    setLignes(lignes.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!libelle || !dateDon) { setErr("Libellé et date obligatoires"); return; }
    setErr(""); setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        sens, forme, libelle, dateDon, pvRemise,
        categorieId: categorieId || undefined,
        description: description || undefined,
      };
      if (sens === "effectue") {
        Object.assign(payload, { beneficiaireNom, beneficiaireType, beneficiaireVillage });
      } else {
        Object.assign(payload, { donateurNom, donateurType, donateurContact });
      }
      if (forme === "especes") {
        payload.montantFcfa = montantFcfa || 0;
      } else {
        payload.lignesNature = lignes.filter((l) => l.designation);
      }
      await apiPost("/api/dons", payload);
      onSuccess();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  const cats = categories.filter((c) => c.sens === sens);
  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background";
  const labelCls = "text-sm font-medium mb-1 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">
            {sens === "effectue" ? "Nouveau don effectué" : "Enregistrer un don reçu"}
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-lg">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-4">
          {err && (
            <div className="bg-destructive/10 text-destructive border border-destructive/20 rounded-lg px-4 py-2 text-sm">
              {err}
            </div>
          )}

          {/* Catégorie + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Catégorie</label>
              <select value={categorieId} onChange={(e) => setCategorieId(e.target.value ? parseInt(e.target.value) : "")} className={inputCls}>
                <option value="">— Choisir —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date</label>
              <input type="date" value={dateDon} onChange={(e) => setDateDon(e.target.value)} required className={inputCls} />
            </div>
          </div>

          {/* Libellé */}
          <div>
            <label className={labelCls}>Libellé *</label>
            <input value={libelle} onChange={(e) => setLibelle(e.target.value)} required placeholder={sens === "effectue" ? "Ex : Aide funéraire — Famille Koné" : "Ex : Don de matériel GIZ"} className={inputCls} />
          </div>

          {/* Bénéficiaire / Donateur */}
          {sens === "effectue" ? (
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Bénéficiaire</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Type</label>
                  <select value={beneficiaireType} onChange={(e) => setBeneficiaireType(e.target.value)} className={inputCls}>
                    <option value="membre">Membre</option>
                    <option value="communaute">Communauté</option>
                    <option value="association">Association</option>
                    <option value="structure_sante">Structure de santé</option>
                    <option value="ecole">École</option>
                    <option value="autre">Autre</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Nom / Identifiant</label>
                  <input value={beneficiaireNom} onChange={(e) => setBeneficiaireNom(e.target.value)} placeholder="Nom du bénéficiaire" className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Village / Localité</label>
                <input value={beneficiaireVillage} onChange={(e) => setBeneficiaireVillage(e.target.value)} placeholder="Village" className={inputCls} />
              </div>
            </div>
          ) : (
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Donateur</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Type</label>
                  <select value={donateurType} onChange={(e) => setDonateurType(e.target.value)} className={inputCls}>
                    <option value="bailleur">Bailleur</option>
                    <option value="exportateur">Exportateur</option>
                    <option value="etat">État / Collectivité</option>
                    <option value="ong">ONG</option>
                    <option value="particulier">Particulier</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Nom</label>
                  <input value={donateurNom} onChange={(e) => setDonateurNom(e.target.value)} placeholder="Ex : GIZ, FIRCA..." className={inputCls} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Contact</label>
                <input value={donateurContact} onChange={(e) => setDonateurContact(e.target.value)} placeholder="Téléphone ou email" className={inputCls} />
              </div>
            </div>
          )}

          {/* Forme */}
          <div>
            <p className={labelCls}>Forme du don</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForme("especes")}
                className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${forme === "especes" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border"}`}>
                💵 En espèces
              </button>
              <button type="button" onClick={() => setForme("nature")}
                className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-colors ${forme === "nature" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted border-border"}`}>
                📦 En nature
              </button>
            </div>
          </div>

          {/* Montant / Lignes nature */}
          {forme === "especes" ? (
            <div>
              <label className={labelCls}>Montant FCFA *</label>
              <input type="number" min="0" value={montantFcfa} onChange={(e) => setMontantFcfa(e.target.value ? parseInt(e.target.value) : "")} placeholder="0" className={inputCls} />
            </div>
          ) : (
            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Articles / Désignations</p>
                <button type="button" onClick={addLigne} className="text-xs text-primary hover:underline flex items-center gap-1">
                  <Plus size={12} /> Ajouter une ligne
                </button>
              </div>
              <div className="space-y-2">
                {lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1 items-end">
                    <div className="col-span-4">
                      {i === 0 && <p className="text-xs text-muted-foreground mb-1">Désignation</p>}
                      <input value={l.designation} onChange={(e) => updateLigne(i, { designation: e.target.value })} placeholder="Sacs de riz 25kg" className={`${inputCls} text-xs`} />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <p className="text-xs text-muted-foreground mb-1">Qté</p>}
                      <input type="number" min="0" value={l.quantite} onChange={(e) => updateLigne(i, { quantite: parseFloat(e.target.value) || 0 })} className={`${inputCls} text-xs`} />
                    </div>
                    <div className="col-span-2">
                      {i === 0 && <p className="text-xs text-muted-foreground mb-1">Unité</p>}
                      <input value={l.unite} onChange={(e) => updateLigne(i, { unite: e.target.value })} placeholder="sac" className={`${inputCls} text-xs`} />
                    </div>
                    <div className="col-span-3">
                      {i === 0 && <p className="text-xs text-muted-foreground mb-1">Val. unit.</p>}
                      <input type="number" min="0" value={l.valeurUnitaireFcfa} onChange={(e) => updateLigne(i, { valeurUnitaireFcfa: parseFloat(e.target.value) || 0 })} placeholder="0" className={`${inputCls} text-xs`} />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button type="button" onClick={() => removeLigne(i)} disabled={lignes.length === 1} className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-30">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end pt-2 border-t">
                <span className="text-sm font-bold">Valeur totale estimée : {FCFA(totalNature)}</span>
              </div>
            </div>
          )}

          {/* Description + PV */}
          <div>
            <label className={labelCls}>Description (optionnel)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Contexte, conditions..." className={`${inputCls} resize-none`} />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={pvRemise} onChange={(e) => setPvRemise(e.target.checked)} className="rounded" />
            PV de remise établi
          </label>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 border rounded-lg text-sm hover:bg-muted">Annuler</button>
            <button type="submit" disabled={loading} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}
              Enregistrer en brouillon
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Tableau de dons ──────────────────────────────────────────────────────────
interface TableDonsProps {
  dons: Don[];
  onValider: (id: number) => void;
  onAnnuler: (id: number) => void;
  valideLoading: number | null;
  annuleLoading: number | null;
}

function TableDons({ dons, onValider, onAnnuler, valideLoading, annuleLoading }: TableDonsProps) {
  if (dons.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Gift size={32} className="mx-auto mb-3 opacity-30" />
        <p className="font-medium">Aucun don enregistré</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Vue mobile */}
      <div className="sm:hidden divide-y">
        {dons.map((d) => (
          <div key={d.id} className="px-4 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm truncate">{d.libelle}</span>
                  <span className={statutBadge(d.statut)}>{d.statut}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {String(d.dateDon).slice(0, 10)} · {d.reference ?? "—"} · {d.categorieLibelle ?? "—"}
                </div>
                <div className="text-xs mt-0.5">
                  {d.sens === "effectue" ? (d.beneficiaireNom ?? "—") : (d.donateurNom ?? "—")}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold text-sm">{FCFA(montantDon(d))}</div>
                <div className="text-xs text-muted-foreground">{d.forme}</div>
                {d.statut === "brouillon" && (
                  <div className="flex gap-1 mt-1 justify-end">
                    <button onClick={() => onValider(d.id)} disabled={valideLoading === d.id}
                      className="px-2 py-0.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 flex items-center gap-1">
                      {valideLoading === d.id ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />} Valider
                    </button>
                    <button onClick={() => onAnnuler(d.id)} disabled={annuleLoading === d.id}
                      className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">
                      <XCircle size={10} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Vue table desktop */}
      <table className="hidden sm:table w-full text-sm">
        <thead>
          <tr className="bg-muted/40 border-b">
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Référence</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Libellé</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Catégorie</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Bénéf. / Donat.</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Forme</th>
            <th className="text-right px-4 py-3 font-medium text-muted-foreground">Montant</th>
            <th className="text-left px-4 py-3 font-medium text-muted-foreground">Statut</th>
            <th className="w-28" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {dons.map((d) => (
            <tr key={d.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{d.reference ?? "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{String(d.dateDon).slice(0, 10)}</td>
              <td className="px-4 py-3 font-medium max-w-xs truncate">{d.libelle}</td>
              <td className="px-4 py-3 text-sm text-muted-foreground">{d.categorieLibelle ?? "—"}</td>
              <td className="px-4 py-3 text-sm">
                {d.sens === "effectue" ? (d.beneficiaireNom ?? "—") : (d.donateurNom ?? "—")}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{d.forme}</td>
              <td className="px-4 py-3 text-right font-semibold">{FCFA(montantDon(d))}</td>
              <td className="px-4 py-3"><span className={statutBadge(d.statut)}>{d.statut}</span></td>
              <td className="px-4 py-3">
                {d.statut === "brouillon" && (
                  <div className="flex gap-1">
                    <button onClick={() => onValider(d.id)} disabled={valideLoading === d.id}
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 flex items-center gap-1">
                      {valideLoading === d.id ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                      Valider
                    </button>
                    <button onClick={() => onAnnuler(d.id)} disabled={annuleLoading === d.id}
                      className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200">
                      <XCircle size={11} />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────────────────
export default function DonsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("Tableau de bord");
  const [showModal, setShowModal] = useState<"effectue" | "recu" | null>(null);
  const [valideLoading, setValideLoading] = useState<number | null>(null);
  const [annuleLoading, setAnnuleLoading] = useState<number | null>(null);
  const [showModalProgramme, setShowModalProgramme] = useState(false);
  const [progLibelle, setProgLibelle] = useState("");
  const [progBudget, setProgBudget] = useState<number | "">("");
  const [progDesc, setProgDesc] = useState("");
  const [progLoading, setProgLoading] = useState(false);
  const [progErr, setProgErr] = useState("");

  const qc = useQueryClient();

  const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErrObj, refetch: refetchStats } = useQuery<Stats>({
    queryKey: ["dons-stats"],
    queryFn: () => apiFetch<Stats>("/api/dons/stats"),
    enabled: activeTab === "Tableau de bord",
    retry: 1,
  });

  const { data: categories = [] } = useQuery<Categorie[]>({
    queryKey: ["dons-categories"],
    queryFn: () => apiFetch<Categorie[]>("/api/dons/categories"),
  });

  const { data: donsEffectues = [], isLoading: loadingEff, refetch: refetchEff } = useQuery<Don[]>({
    queryKey: ["dons", "effectue"],
    queryFn: () => apiFetch<Don[]>("/api/dons?sens=effectue"),
    enabled: activeTab === "Dons effectués",
  });

  const { data: donsRecus = [], isLoading: loadingRec, refetch: refetchRec } = useQuery<Don[]>({
    queryKey: ["dons", "recu"],
    queryFn: () => apiFetch<Don[]>("/api/dons?sens=recu"),
    enabled: activeTab === "Dons reçus",
  });

  const { data: programmes = [], isLoading: loadingProg, refetch: refetchProg } = useQuery<Programme[]>({
    queryKey: ["dons-programmes"],
    queryFn: () => apiFetch<Programme[]>("/api/dons/programmes"),
    enabled: activeTab === "Programmes",
  });

  async function handleValider(id: number) {
    setValideLoading(id);
    try {
      await apiPut(`/api/dons/${id}/valider`);
      void qc.invalidateQueries({ queryKey: ["dons"] });
      void qc.invalidateQueries({ queryKey: ["dons-stats"] });
    } finally {
      setValideLoading(null);
    }
  }

  async function handleAnnuler(id: number) {
    const motif = prompt("Motif d'annulation :") ?? "";
    setAnnuleLoading(id);
    try {
      await apiPut(`/api/dons/${id}/annuler`, { motif });
      void qc.invalidateQueries({ queryKey: ["dons"] });
    } finally {
      setAnnuleLoading(null);
    }
  }

  function onSuccess() {
    void qc.invalidateQueries({ queryKey: ["dons"] });
    void qc.invalidateQueries({ queryKey: ["dons-stats"] });
  }

  async function handleRapportPDF() {
    const r = await fetch(`${BASE}/api/dons/rapport-pdf`, { headers: { Authorization: `Bearer ${tok()}` } });
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-dons-${new Date().getFullYear()}.pdf`;
    a.click();
  }

  async function creerProgramme(e: React.FormEvent) {
    e.preventDefault();
    if (!progLibelle || !progBudget) { setProgErr("Libellé et budget obligatoires"); return; }
    setProgLoading(true); setProgErr("");
    try {
      await apiPost("/api/dons/programmes", { libelle: progLibelle, budgetAlloueFcfa: progBudget, description: progDesc });
      void refetchProg();
      setShowModalProgramme(false);
      setProgLibelle(""); setProgBudget(""); setProgDesc("");
    } catch (e) {
      setProgErr(e instanceof Error ? e.message : "Erreur");
    } finally {
      setProgLoading(false);
    }
  }

  const inputCls = "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring bg-background";

  return (
    <>
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Gift size={22} className="text-primary" /> Dons
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Gestion des dons effectués et reçus par la coopérative
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleRapportPDF} className="flex items-center gap-2 px-3 py-2 border rounded-lg text-sm hover:bg-muted">
              <FileText size={14} /> Rapport PDF
            </button>
            {activeTab === "Dons effectués" && (
              <button onClick={() => setShowModal("effectue")} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
                <Plus size={14} /> Don effectué
              </button>
            )}
            {activeTab === "Dons reçus" && (
              <button onClick={() => setShowModal("recu")} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
                <Plus size={14} /> Don reçu
              </button>
            )}
            {activeTab === "Programmes" && (
              <button onClick={() => setShowModalProgramme(true)} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90">
                <Plus size={14} /> Créer programme
              </button>
            )}
          </div>
        </div>

        {/* Onglets */}
        <div className="flex gap-1 border-b mb-6 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Onglet : Tableau de bord ─────────────────────────────────────── */}
        {activeTab === "Tableau de bord" && (
          <div>
            {statsLoading && (
              <div className="flex items-center justify-center py-20 text-muted-foreground">
                <Loader2 size={24} className="animate-spin mr-3" /> Chargement…
              </div>
            )}
            {statsError && !statsLoading && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="size-14 rounded-full bg-destructive/10 flex items-center justify-center">
                  <XCircle size={28} className="text-destructive" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-destructive mb-1">Impossible de charger le tableau de bord</p>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    {statsErrObj instanceof Error ? statsErrObj.message : "Erreur lors du chargement des statistiques"}
                  </p>
                </div>
                <button
                  onClick={() => void refetchStats()}
                  className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-muted"
                >
                  <RefreshCw size={14} /> Réessayer
                </button>
              </div>
            )}
            {!statsLoading && !statsError && stats && stats.donsEffectues.nb === 0 && stats.donsRecus.nb === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                <Gift size={40} className="opacity-20" />
                <p className="font-medium">Aucun don validé pour le moment</p>
                <p className="text-sm">Enregistrez et validez des dons pour voir les statistiques ici.</p>
              </div>
            )}
            {stats && (stats.donsEffectues.nb > 0 || stats.donsRecus.nb > 0) && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                  <div className="bg-card border rounded-xl p-5 flex items-start gap-4">
                    <div className="size-11 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                      <ArrowUpCircle size={20} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{FCFA(stats.donsEffectues.total)}</div>
                      <div className="text-sm text-muted-foreground">Dons effectués</div>
                      <div className="text-xs text-muted-foreground/70">{stats.donsEffectues.nb} don{stats.donsEffectues.nb > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <div className="bg-card border rounded-xl p-5 flex items-start gap-4">
                    <div className="size-11 rounded-lg bg-green-100 text-green-700 flex items-center justify-center shrink-0">
                      <ArrowDownCircle size={20} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{FCFA(stats.donsRecus.total)}</div>
                      <div className="text-sm text-muted-foreground">Dons reçus</div>
                      <div className="text-xs text-muted-foreground/70">{stats.donsRecus.nb} don{stats.donsRecus.nb > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <div className={`bg-card border rounded-xl p-5 flex items-start gap-4 ${stats.soldeNet >= 0 ? "border-green-200" : ""}`}>
                    <div className={`size-11 rounded-lg flex items-center justify-center shrink-0 ${stats.soldeNet >= 0 ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{stats.soldeNet >= 0 ? "+" : ""}{FCFA(stats.soldeNet)}</div>
                      <div className="text-sm text-muted-foreground">Solde net (reçus − effectués)</div>
                    </div>
                  </div>
                </div>

                {/* Graphique barres par mois */}
                {stats.parMois.length > 0 && (
                  <div className="bg-card border rounded-xl p-5 mb-6">
                    <h2 className="font-semibold mb-4">Évolution mensuelle</h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stats.parMois}>
                        <XAxis dataKey="mois" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                        <Tooltip formatter={(v: number) => FCFA(v)} />
                        <Bar dataKey="effectue" name="Dons effectués" fill="#ef4444" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="recu" name="Dons reçus" fill="#22c55e" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  {/* Camembert par catégorie */}
                  {stats.parCategorie.length > 0 && (
                    <div className="bg-card border rounded-xl p-5">
                      <h2 className="font-semibold mb-4">Répartition par catégorie</h2>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie data={stats.parCategorie} dataKey="montant" nameKey="label" cx="50%" cy="50%" outerRadius={80} label={({ label }: { label: string }) => label.split(" ")[0]}>
                            {stats.parCategorie.map((_, i) => (
                              <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => FCFA(v)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* 5 derniers dons */}
                  <div className="bg-card border rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b">
                      <h2 className="font-semibold">Derniers dons validés</h2>
                    </div>
                    {stats.derniersDons.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground text-sm">Aucun don validé</div>
                    ) : (
                      <div className="divide-y">
                        {stats.derniersDons.map((d) => (
                          <div key={d.id} className="flex items-center justify-between px-5 py-3">
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{d.libelle}</div>
                              <div className="text-xs text-muted-foreground">
                                {String(d.dateDon).slice(0, 10)} ·{" "}
                                <span className={d.sens === "effectue" ? "text-red-600" : "text-green-600"}>
                                  {d.sens === "effectue" ? "Effectué" : "Reçu"}
                                </span>
                              </div>
                            </div>
                            <div className="text-sm font-semibold ml-4 shrink-0">{FCFA(montantDon(d))}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Onglet : Dons effectués ──────────────────────────────────────── */}
        {activeTab === "Dons effectués" && (
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <ArrowUpCircle size={16} className="text-red-500" /> Dons effectués
              </h2>
              <button onClick={() => void refetchEff()} className="p-1.5 rounded hover:bg-muted">
                <RefreshCw size={14} className={loadingEff ? "animate-spin" : ""} />
              </button>
            </div>
            {loadingEff ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 size={20} className="animate-spin mr-2" /> Chargement…
              </div>
            ) : (
              <TableDons dons={donsEffectues} onValider={handleValider} onAnnuler={handleAnnuler} valideLoading={valideLoading} annuleLoading={annuleLoading} />
            )}
          </div>
        )}

        {/* ── Onglet : Dons reçus ──────────────────────────────────────────── */}
        {activeTab === "Dons reçus" && (
          <div className="bg-card border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold flex items-center gap-2">
                <ArrowDownCircle size={16} className="text-green-600" /> Dons reçus
              </h2>
              <button onClick={() => void refetchRec()} className="p-1.5 rounded hover:bg-muted">
                <RefreshCw size={14} className={loadingRec ? "animate-spin" : ""} />
              </button>
            </div>
            {loadingRec ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 size={20} className="animate-spin mr-2" /> Chargement…
              </div>
            ) : (
              <TableDons dons={donsRecus} onValider={handleValider} onAnnuler={handleAnnuler} valideLoading={valideLoading} annuleLoading={annuleLoading} />
            )}
          </div>
        )}

        {/* ── Onglet : Programmes ──────────────────────────────────────────── */}
        {activeTab === "Programmes" && (
          <div className="space-y-4">
            {loadingProg ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <Loader2 size={20} className="animate-spin mr-2" /> Chargement…
              </div>
            ) : programmes.length === 0 ? (
              <div className="bg-card border rounded-xl text-center py-16 text-muted-foreground">
                <BarChart3 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">Aucun programme de don créé</p>
                <button onClick={() => setShowModalProgramme(true)} className="mt-3 text-sm text-primary hover:underline">
                  Créer le premier programme →
                </button>
              </div>
            ) : (
              programmes.map((p) => {
                const alloue = parseFloat(p.budgetAlloueFcfa);
                const utilise = parseFloat(p.budgetUtiliseFcfa);
                const pct = alloue > 0 ? Math.round((utilise / alloue) * 100) : 0;
                return (
                  <div key={p.id} className="bg-card border rounded-xl p-5">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="font-semibold">{p.libelle}</h3>
                        {p.description && <p className="text-sm text-muted-foreground mt-0.5">{p.description}</p>}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.statut === "actif" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {p.statut}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Budget alloué</div>
                        <div className="font-semibold">{FCFA(alloue)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Utilisé</div>
                        <div className="font-semibold">{FCFA(utilise)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Restant</div>
                        <div className={`font-semibold ${alloue - utilise < 0 ? "text-red-600" : "text-green-600"}`}>
                          {FCFA(alloue - utilise)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-orange-400" : "bg-primary"}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Modal création don */}
      {showModal && (
        <ModalNouveauDon
          sens={showModal}
          categories={categories}
          onClose={() => setShowModal(null)}
          onSuccess={onSuccess}
        />
      )}

      {/* Modal création programme */}
      {showModalProgramme && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold">Créer un programme de dons</h2>
              <button onClick={() => setShowModalProgramme(false)} className="p-1.5 hover:bg-muted rounded-lg">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={creerProgramme} className="p-6 space-y-4">
              {progErr && <div className="bg-destructive/10 text-destructive text-sm rounded-lg px-4 py-2">{progErr}</div>}
              <div>
                <label className="text-sm font-medium mb-1 block">Libellé *</label>
                <input value={progLibelle} onChange={(e) => setProgLibelle(e.target.value)} required placeholder="Ex : Fonds d'aide funéraire 2026" className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Budget alloué (FCFA) *</label>
                <input type="number" min="0" value={progBudget} onChange={(e) => setProgBudget(e.target.value ? parseInt(e.target.value) : "")} required placeholder="500000" className={inputCls} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <textarea value={progDesc} onChange={(e) => setProgDesc(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModalProgramme(false)} className="flex-1 py-2.5 border rounded-lg text-sm hover:bg-muted">Annuler</button>
                <button type="submit" disabled={progLoading} className="flex-1 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                  {progLoading && <Loader2 size={14} className="animate-spin" />} Créer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

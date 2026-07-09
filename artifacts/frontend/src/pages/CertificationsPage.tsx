import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Award, Plus, CheckCircle, AlertTriangle, Clock, XCircle,
  RefreshCw, FileText, Users, ChevronRight, Trash2, Edit2,
  ShieldCheck, Leaf, Globe, Star, BarChart2, X, Download,
  ClipboardCheck, CalendarDays,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePermission } from "@/hooks/usePermission";

// ─── API helpers ──────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_URL ?? "";
function getToken() { return localStorage.getItem("coop_token") ?? ""; }
function authHeader() { return { Authorization: `Bearer ${getToken()}` }; }

async function apiFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: authHeader() });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json() as Promise<T>;
}
async function apiDelete(path: string): Promise<void> {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: authHeader() });
  if (!r.ok) throw new Error(`${r.status}`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Certification {
  id: number;
  cooperativeId: number;
  type: string;
  nomCertificateur: string | null;
  numeroCertificat: string | null;
  dateObtention: string | null;
  dateExpiration: string | null;
  statut: "actif" | "suspendu" | "expire" | "renouvellement_en_cours";
  superficieCertifieeHa: string | null;
  nbMembresCouVerts: number | null;
  lienDocument: string | null;
  notes: string | null;
  creePar: number | null;
  createdAt: string;
  updatedAt: string;
}

interface AuditCertification {
  id: number;
  certificationId: number;
  action: string;
  ancienStatut: string | null;
  nouveauStatut: string | null;
  notes: string | null;
  faitPar: number | null;
  createdAt: string;
}

interface CertificationMembre {
  id: number;
  membreId: number;
  certificationId: number;
  criteresValides: string[];
  score: number;
  scoreMax: number;
  statutConformite: "certifie" | "en_cours" | "non_conforme";
  primeFcfaHa: string | null;
  notes: string | null;
  dateEvaluation: string | null;
  membreNom: string;
  membreSection: string | null;
  membreTelephone: string | null;
}

interface Stats {
  total: number;
  actives: number;
  expirees: number;
  suspendues: number;
  aRenouveler: number;
  nbMembresCertifies: number;
  parType: Record<string, number>;
  prochesExpiration: Certification[];
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const TYPES_CERTIF = [
  { value: "rainforest_alliance", label: "Rainforest Alliance", icon: Leaf,       color: "text-green-600",  bg: "bg-green-50",  border: "border-green-200" },
  { value: "fairtrade",           label: "Fairtrade",           icon: Star,       color: "text-blue-600",   bg: "bg-blue-50",   border: "border-blue-200" },
  { value: "bio",                 label: "Agriculture Bio",     icon: ShieldCheck, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  { value: "eudr",                label: "EUDR",                icon: Globe,      color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" },
  { value: "utz",                 label: "UTZ",                 icon: Award,      color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
  { value: "autre",               label: "Autre",               icon: FileText,   color: "text-gray-600",   bg: "bg-gray-50",   border: "border-gray-200" },
];

const STATUTS = [
  { value: "actif",                   label: "Actif",                   icon: CheckCircle,   cls: "text-green-700 bg-green-50 border-green-200" },
  { value: "renouvellement_en_cours", label: "Renouvellement en cours", icon: RefreshCw,     cls: "text-blue-700 bg-blue-50 border-blue-200" },
  { value: "suspendu",                label: "Suspendu",                icon: AlertTriangle, cls: "text-amber-700 bg-amber-50 border-amber-200" },
  { value: "expire",                  label: "Expiré",                  icon: XCircle,       cls: "text-red-700 bg-red-50 border-red-200" },
];

const ACTION_LABELS: Record<string, string> = {
  creation: "Création", modification: "Modification", renouvellement: "Renouvellement",
  suspension: "Suspension", expiration: "Expiration", suppression: "Suppression",
  audit: "Audit planifié",
};

const STATUT_CONFORMITE_LABELS: Record<string, { label: string; cls: string }> = {
  certifie:     { label: "Certifié",     cls: "text-green-700 bg-green-50 border-green-200" },
  en_cours:     { label: "En cours",     cls: "text-blue-700 bg-blue-50 border-blue-200" },
  non_conforme: { label: "Non conforme", cls: "text-red-700 bg-red-50 border-red-200" },
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function getDaysLeft(d: string | null): number | null {
  if (!d) return null;
  return Math.round((new Date(d).getTime() - Date.now()) / 86_400_000);
}

function getTypeInfo(type: string) {
  return TYPES_CERTIF.find(t => t.value === type) ?? TYPES_CERTIF[TYPES_CERTIF.length - 1]!;
}
function getStatutInfo(statut: string) {
  return STATUTS.find(s => s.value === statut) ?? STATUTS[0]!;
}

// ─── Formulaire Certification ─────────────────────────────────────────────────

type CertifStatutEnum = "actif" | "suspendu" | "expire" | "renouvellement_en_cours";
const EMPTY_FORM = {
  type: "rainforest_alliance", nomCertificateur: "", numeroCertificat: "",
  dateObtention: "", dateExpiration: "", statut: "actif" as CertifStatutEnum,
  superficieCertifieeHa: "", nbMembresCouVerts: "", lienDocument: "", notes: "",
};

function CertifForm({ initial, onSubmit, onCancel, loading }: {
  initial?: Partial<typeof EMPTY_FORM>;
  onSubmit: (data: typeof EMPTY_FORM) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const set = (k: keyof typeof EMPTY_FORM, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">{initial?.type ? "Modifier la certification" : "Nouvelle certification"}</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type} onChange={e => set("type", e.target.value)}>
                {TYPES_CERTIF.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Statut</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.statut} onChange={e => set("statut", e.target.value as CertifStatutEnum)}>
                {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Organisme certificateur</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.nomCertificateur} onChange={e => set("nomCertificateur", e.target.value)} placeholder="Bureau Veritas…" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de certificat</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.numeroCertificat} onChange={e => set("numeroCertificat", e.target.value)} placeholder="RA-CI-00123" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date d'obtention</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.dateObtention} onChange={e => set("dateObtention", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date d'expiration</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.dateExpiration} onChange={e => set("dateExpiration", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Superficie certifiée (ha)</label>
              <input type="number" min="0" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.superficieCertifieeHa} onChange={e => set("superficieCertifieeHa", e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Membres couverts</label>
              <input type="number" min="0" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.nbMembresCouVerts} onChange={e => set("nbMembresCouVerts", e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lien document</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.lienDocument} onChange={e => set("lienDocument", e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>
        <div className="p-6 border-t flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Annuler</button>
          <button onClick={() => onSubmit(form)} disabled={loading || !form.type}
            className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw size={14} className="animate-spin" />}Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Formulaire Audit ─────────────────────────────────────────────────────────

function AuditForm({ certifId, onClose, onSaved }: { certifId: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [action, setAction] = useState("audit");
  const [nouveauStatut, setNouveauStatut] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!action) return;
    setLoading(true);
    try {
      await apiPost(`/api/certifications/${certifId}/audits`, {
        action, notes: notes || null, nouveauStatut: nouveauStatut || null,
      });
      toast({ title: "Audit enregistré" });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Erreur lors de l'enregistrement", variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b flex items-center justify-between">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2"><CalendarDays size={16} />Saisir un audit</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action *</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={action} onChange={e => setAction(e.target.value)}>
              <option value="audit">Audit planifié / effectué</option>
              <option value="renouvellement">Lancement renouvellement</option>
              <option value="suspension">Suspension</option>
              <option value="modification">Mise à jour informations</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau statut (optionnel)</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={nouveauStatut} onChange={e => setNouveauStatut(e.target.value)}>
              <option value="">— Inchangé —</option>
              {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes / Résultats</label>
            <textarea rows={4} className="w-full border rounded-lg px-3 py-2 text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observations, date prochaine visite…" />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Annuler</button>
          <button onClick={() => void handleSubmit()} disabled={loading}
            className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw size={14} className="animate-spin" />}Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Formulaire Évaluation membre ─────────────────────────────────────────────

function MembreEvalForm({ certif, membre, criteres, onClose, onSaved }: {
  certif: Certification;
  membre: { membreId: number; nom: string; existing: CertificationMembre | null };
  criteres: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set(membre.existing?.criteresValides ?? []));
  const [notes, setNotes] = useState(membre.existing?.notes ?? "");
  const [loading, setLoading] = useState(false);

  const toggle = (c: string) => setSelected(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const score = selected.size;
  const scoreMax = criteres.length;
  const pct = scoreMax > 0 ? Math.round(score / scoreMax * 100) : 0;
  const statut = pct >= 80 ? "certifie" : pct >= 50 ? "en_cours" : "non_conforme";

  async function handleSubmit() {
    setLoading(true);
    try {
      await apiPost(`/api/certifications/${certif.id}/membres`, {
        membreId: membre.membreId,
        criteresValides: Array.from(selected),
        notes: notes || null,
        dateEvaluation: new Date().toISOString().slice(0, 10),
      });
      toast({ title: `Évaluation de ${membre.nom} enregistrée` });
      onSaved();
      onClose();
    } catch {
      toast({ title: "Erreur lors de l'évaluation", variant: "destructive" });
    } finally { setLoading(false); }
  }

  const confInfo = STATUT_CONFORMITE_LABELS[statut] ?? STATUT_CONFORMITE_LABELS["non_conforme"]!;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardCheck size={16} />Évaluation — {membre.nom}
          </h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Score préviewé */}
          <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium ${confInfo.cls}`}>
            <span>Score : {score}/{scoreMax} ({pct}%)</span>
            <span className="ml-auto">{confInfo.label}</span>
          </div>

          {/* Critères checkboxes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Critères {getTypeInfo(certif.type).label} ({criteres.length})
            </p>
            <div className="space-y-2">
              {criteres.map(crit => (
                <label key={crit} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${selected.has(crit) ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"}`}>
                  <input type="checkbox" checked={selected.has(crit)} onChange={() => toggle(crit)} className="accent-green-600 w-4 h-4" />
                  <span className={`text-sm ${selected.has(crit) ? "text-green-800 font-medium" : "text-gray-700"}`}>{crit}</span>
                  {selected.has(crit) && <CheckCircle size={14} className="ml-auto text-green-600 shrink-0" />}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observations, actions correctives…" />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Annuler</button>
          <button onClick={() => void handleSubmit()} disabled={loading}
            className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw size={14} className="animate-spin" />}Enregistrer l'évaluation
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Panel détail certification ───────────────────────────────────────────────

function DetailPanel({ certif, onClose, canWrite, onEdit }: {
  certif: Certification;
  onClose: () => void;
  canWrite: boolean;
  onEdit: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"info" | "membres" | "audits">("info");
  const [showAuditForm, setShowAuditForm] = useState(false);
  const [evalMembre, setEvalMembre] = useState<{ membreId: number; nom: string; existing: CertificationMembre | null } | null>(null);

  const typeInfo = getTypeInfo(certif.type);
  const statutInfo = getStatutInfo(certif.statut);
  const StatutIcon = statutInfo.icon;
  const TypeIcon = typeInfo.icon;
  const daysLeft = getDaysLeft(certif.dateExpiration);

  const { data: criteres = [] } = useQuery<string[]>({
    queryKey: ["certif-criteres", certif.type],
    queryFn: async () => {
      const map = await apiFetch<Record<string, string[]>>("/api/certifications/criteres");
      return map[certif.type] ?? [];
    },
  });

  const { data: audits = [], refetch: refetchAudits } = useQuery<AuditCertification[]>({
    queryKey: ["certif-audits", certif.id],
    queryFn: () => apiFetch(`/api/certifications/${certif.id}/audits`),
  });

  const { data: membres = [], refetch: refetchMembres } = useQuery<CertificationMembre[]>({
    queryKey: ["certif-membres", certif.id],
    queryFn: () => apiFetch(`/api/certifications/${certif.id}/membres`),
    enabled: tab === "membres",
  });

  const certifies    = membres.filter(m => m.statutConformite === "certifie").length;
  const enCours      = membres.filter(m => m.statutConformite === "en_cours").length;
  const nonConformes = membres.filter(m => m.statutConformite === "non_conforme").length;
  const tauxConf     = membres.length > 0 ? Math.round(certifies / membres.length * 100) : 0;

  function downloadPdf() {
    window.open(`${BASE}/api/certifications/${certif.id}/rapport-pdf?token=${getToken()}`, "_blank");
  }

  // Calcul critères globaux
  const criteresStats = criteres.map(crit => {
    const nb = membres.filter(m => (m.criteresValides ?? []).includes(crit)).length;
    return { crit, nb, pct: membres.length > 0 ? Math.round(nb / membres.length * 100) : 0 };
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b flex items-start gap-3">
          <div className={`p-2.5 rounded-lg ${typeInfo.bg} flex-shrink-0`}>
            <TypeIcon size={22} className={typeInfo.color} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900">{typeInfo.label}</h3>
            {certif.numeroCertificat && <p className="text-xs text-gray-500">{certif.numeroCertificat}</p>}
            {certif.nomCertificateur && <p className="text-xs text-gray-400">{certif.nomCertificateur}</p>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {canWrite && (
              <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={15} /></button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        {/* Statut + expiration */}
        <div className="px-5 pt-4 pb-2 flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${statutInfo.cls}`}>
            <StatutIcon size={12} />
            {statutInfo.label}
          </div>
          {daysLeft !== null && certif.statut === "actif" && (
            <span className={`text-xs px-2 py-1 rounded-full border ${daysLeft <= 30 ? "text-red-700 bg-red-50 border-red-200" : daysLeft <= 90 ? "text-amber-700 bg-amber-50 border-amber-200" : "text-gray-600 bg-gray-50 border-gray-200"}`}>
              Expire dans {daysLeft}j — {fmtDate(certif.dateExpiration)}
            </span>
          )}
          {certif.statut === "actif" && (
            <button
              onClick={downloadPdf}
              className="ml-auto flex items-center gap-1.5 text-xs text-green-700 border border-green-300 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-full transition-colors"
            >
              <Download size={12} />Rapport PDF
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b px-5 gap-4 mt-1">
          {[
            { key: "info",    label: "Informations" },
            { key: "membres", label: `Membres (${membres.length > 0 ? `${certifies}✓ ${tauxConf}%` : "—"})` },
            { key: "audits",  label: `Historique (${audits.length})` },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as "info" | "membres" | "audits")}
              className={`text-sm pb-3 border-b-2 transition-colors ${tab === t.key ? "border-green-600 text-green-700 font-medium" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Tab Info */}
          {tab === "info" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {certif.dateObtention && (
                  <div><span className="text-xs text-gray-400 block">Date d'obtention</span><span className="font-medium">{fmtDate(certif.dateObtention)}</span></div>
                )}
                {certif.dateExpiration && (
                  <div><span className="text-xs text-gray-400 block">Date d'expiration</span><span className={`font-medium ${daysLeft !== null && daysLeft <= 30 ? "text-red-600" : daysLeft !== null && daysLeft <= 90 ? "text-amber-600" : ""}`}>{fmtDate(certif.dateExpiration)}</span></div>
                )}
                {certif.superficieCertifieeHa && (
                  <div><span className="text-xs text-gray-400 block">Superficie</span><span className="font-medium">{Number(certif.superficieCertifieeHa).toLocaleString("fr-FR")} ha</span></div>
                )}
                {certif.nbMembresCouVerts != null && (
                  <div><span className="text-xs text-gray-400 block">Membres couverts</span><span className="font-medium">{certif.nbMembresCouVerts.toLocaleString("fr-FR")}</span></div>
                )}
              </div>
              {certif.notes && (
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">{certif.notes}</div>
              )}
              {certif.lienDocument && (
                <a href={certif.lienDocument} target="_blank" rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                  <FileText size={14} />Voir le document
                </a>
              )}
              {/* Critères de la certification */}
              {criteres.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                    Critères {typeInfo.label} ({criteres.length})
                  </p>
                  {tab === "info" && membres.length > 0 ? (
                    <div className="space-y-2">
                      {criteresStats.map(cs => (
                        <div key={cs.crit}>
                          <div className="flex justify-between text-xs text-gray-600 mb-0.5">
                            <span className="truncate max-w-[70%]">{cs.crit}</span>
                            <span className="font-medium">{cs.nb}/{membres.length} ({cs.pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${cs.pct >= 80 ? "bg-green-500" : cs.pct >= 50 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${cs.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <ul className="space-y-1">
                      {criteres.map(c => (
                        <li key={c} className="flex items-center gap-2 text-sm text-gray-700">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full flex-shrink-0" />{c}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab Membres */}
          {tab === "membres" && (
            <div className="space-y-4">
              {/* Synthèse */}
              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "Certifiés", value: certifies, color: "text-green-600" },
                  { label: "En cours",  value: enCours,   color: "text-blue-600" },
                  { label: "Non conf.", value: nonConformes, color: "text-red-600" },
                ].map(k => (
                  <div key={k.label} className="bg-gray-50 rounded-lg p-3">
                    <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
                    <p className="text-xs text-gray-400">{k.label}</p>
                  </div>
                ))}
              </div>

              {canWrite && (
                <button
                  onClick={() => setEvalMembre({ membreId: 0, nom: "Nouveau membre", existing: null })}
                  className="w-full flex items-center justify-center gap-2 text-sm border-2 border-dashed border-green-300 text-green-700 rounded-lg py-3 hover:bg-green-50 transition-colors"
                >
                  <Plus size={16} />Évaluer un membre
                </button>
              )}

              {membres.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Aucun membre évalué pour cette certification</div>
              ) : (
                <div className="space-y-2">
                  {membres.map(m => {
                    const conf = STATUT_CONFORMITE_LABELS[m.statutConformite] ?? STATUT_CONFORMITE_LABELS["non_conforme"]!;
                    const pctM = m.scoreMax > 0 ? Math.round(m.score / m.scoreMax * 100) : 0;
                    return (
                      <div key={m.id} className="border rounded-lg p-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{m.membreNom}</p>
                            <p className="text-xs text-gray-400">{m.membreSection ?? "Section inconnue"}</p>
                          </div>
                          <div className={`text-xs px-2 py-0.5 rounded-full border font-medium ${conf.cls}`}>{conf.label}</div>
                          {canWrite && (
                            <button
                              onClick={() => setEvalMembre({ membreId: m.membreId, nom: m.membreNom, existing: m })}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                            >
                              <Edit2 size={13} />
                            </button>
                          )}
                        </div>
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                            <span>{m.score}/{m.scoreMax} critères</span><span>{pctM}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pctM >= 80 ? "bg-green-500" : pctM >= 50 ? "bg-blue-400" : "bg-red-400"}`} style={{ width: `${pctM}%` }} />
                          </div>
                        </div>
                        {m.notes && <p className="text-xs text-gray-500 mt-1 italic">{m.notes}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab Audits */}
          {tab === "audits" && (
            <div className="space-y-4">
              {canWrite && (
                <button
                  onClick={() => setShowAuditForm(true)}
                  className="flex items-center gap-2 text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Plus size={15} />Saisir un audit
                </button>
              )}
              {audits.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Aucun audit enregistré</div>
              ) : (
                <div className="space-y-3">
                  {audits.map(a => (
                    <div key={a.id} className="flex gap-3 text-sm border-l-2 border-gray-200 pl-3">
                      <div className="flex-1">
                        <span className="font-medium text-gray-800">{ACTION_LABELS[a.action] ?? a.action}</span>
                        {a.ancienStatut && a.nouveauStatut && a.ancienStatut !== a.nouveauStatut && (
                          <span className="text-gray-500 text-xs ml-1">({a.ancienStatut} → {a.nouveauStatut})</span>
                        )}
                        {a.notes && <p className="text-gray-500 text-xs mt-0.5">{a.notes}</p>}
                        <p className="text-gray-400 text-xs mt-0.5">
                          {new Date(a.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showAuditForm && (
        <AuditForm certifId={certif.id} onClose={() => setShowAuditForm(false)} onSaved={() => { void refetchAudits(); }} />
      )}

      {evalMembre && evalMembre.membreId !== 0 && (
        <MembreEvalForm
          certif={certif}
          membre={evalMembre}
          criteres={criteres}
          onClose={() => setEvalMembre(null)}
          onSaved={() => { void refetchMembres(); qc.invalidateQueries({ queryKey: ["certifications-stats"] }).catch(() => {}); }}
        />
      )}

      {evalMembre && evalMembre.membreId === 0 && (
        <NouvelleEvalForm
          certif={certif}
          criteres={criteres}
          onClose={() => setEvalMembre(null)}
          onSaved={() => { void refetchMembres(); qc.invalidateQueries({ queryKey: ["certifications-stats"] }).catch(() => {}); }}
        />
      )}
    </div>
  );
}

// ─── Formulaire Nouvelle évaluation (sélection du membre) ────────────────────

function NouvelleEvalForm({ certif, criteres, onClose, onSaved }: {
  certif: Certification;
  criteres: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  interface MembreOption { id: number; nom: string; prenom: string; }
  const { toast } = useToast();
  const [membreId, setMembreId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: membres = [] } = useQuery<MembreOption[]>({
    queryKey: ["membres-list"],
    queryFn: () => apiFetch("/api/membres?statut=actif&limit=500"),
  });

  const toggle = (c: string) => setSelected(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n; });
  const score = selected.size;
  const pct = criteres.length > 0 ? Math.round(score / criteres.length * 100) : 0;
  const statut = pct >= 80 ? "certifie" : pct >= 50 ? "en_cours" : "non_conforme";
  const confInfo = STATUT_CONFORMITE_LABELS[statut] ?? STATUT_CONFORMITE_LABELS["non_conforme"]!;

  async function handleSubmit() {
    if (!membreId) { toast({ title: "Sélectionnez un membre", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await apiPost(`/api/certifications/${certif.id}/membres`, {
        membreId, criteresValides: Array.from(selected), notes: notes || null,
        dateEvaluation: new Date().toISOString().slice(0, 10),
      });
      toast({ title: "Évaluation enregistrée" });
      onSaved(); onClose();
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex items-center justify-between">
          <h4 className="font-semibold text-gray-900 flex items-center gap-2"><ClipboardCheck size={16} />Nouvelle évaluation</h4>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Membre *</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={membreId ?? ""} onChange={e => setMembreId(parseInt(e.target.value) || null)}>
              <option value="">— Sélectionner un membre —</option>
              {membres.map((m: MembreOption) => <option key={m.id} value={m.id}>{m.prenom} {m.nom}</option>)}
            </select>
          </div>
          <div className={`flex items-center justify-between px-4 py-3 rounded-lg border text-sm font-medium ${confInfo.cls}`}>
            <span>Score : {score}/{criteres.length} ({pct}%)</span>
            <span>{confInfo.label}</span>
          </div>
          <div className="space-y-2">
            {criteres.map(crit => (
              <label key={crit} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer ${selected.has(crit) ? "bg-green-50 border-green-300" : "bg-gray-50 border-gray-200"}`}>
                <input type="checkbox" checked={selected.has(crit)} onChange={() => toggle(crit)} className="accent-green-600 w-4 h-4" />
                <span className={`text-sm ${selected.has(crit) ? "text-green-800 font-medium" : "text-gray-700"}`}>{crit}</span>
              </label>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="p-5 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Annuler</button>
          <button onClick={() => void handleSubmit()} disabled={loading || !membreId}
            className="px-4 py-2 text-sm text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50 flex items-center gap-2">
            {loading && <RefreshCw size={14} className="animate-spin" />}Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function CertificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const canWrite = usePermission("certifications", "creer");
  const canDelete = usePermission("certifications", "supprimer");

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Certification | null>(null);
  const [detail, setDetail] = useState<Certification | null>(null);
  const [filterStatut, setFilterStatut] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: stats } = useQuery<Stats>({
    queryKey: ["certifications-stats"],
    queryFn: () => apiFetch("/api/certifications/stats"),
  });

  const { data: certifications = [], isLoading } = useQuery<Certification[]>({
    queryKey: ["certifications"],
    queryFn: () => apiFetch("/api/certifications"),
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["certifications"] });
    void qc.invalidateQueries({ queryKey: ["certifications-stats"] });
  };

  function toPayload(data: typeof EMPTY_FORM) {
    return {
      ...data,
      nbMembresCouVerts:     data.nbMembresCouVerts     ? parseInt(data.nbMembresCouVerts) : null,
      superficieCertifieeHa: data.superficieCertifieeHa  || null,
      dateObtention:         data.dateObtention          || null,
      dateExpiration:        data.dateExpiration         || null,
      nomCertificateur:      data.nomCertificateur       || null,
      numeroCertificat:      data.numeroCertificat       || null,
      lienDocument:          data.lienDocument           || null,
      notes:                 data.notes                  || null,
    };
  }

  const createMut = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => apiPost("/api/certifications", toPayload(data)),
    onSuccess: () => { toast({ title: "Certification créée" }); setShowCreate(false); invalidate(); },
    onError: () => toast({ title: "Erreur lors de la création", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof EMPTY_FORM }) => apiPut(`/api/certifications/${id}`, toPayload(data)),
    onSuccess: () => { toast({ title: "Certification mise à jour" }); setEditing(null); invalidate(); },
    onError: () => toast({ title: "Erreur lors de la mise à jour", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/certifications/${id}`),
    onSuccess: () => { toast({ title: "Certification supprimée" }); invalidate(); },
    onError: () => toast({ title: "Erreur lors de la suppression", variant: "destructive" }),
  });

  const filtered = certifications.filter(c => {
    if (filterStatut !== "all" && c.statut !== filterStatut) return false;
    if (filterType !== "all" && c.type !== filterType) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Award className="text-green-600" size={26} />Certifications
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Rainforest Alliance, Fairtrade, Bio, EUDR et autres certifications</p>
        </div>
        {canWrite && (
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium">
            <Plus size={16} />Nouvelle certification
          </button>
        )}
      </div>

      {/* KPIs */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total",             value: stats.total,               icon: Award,        color: "text-gray-600",   bg: "bg-gray-50" },
            { label: "Actives",           value: stats.actives,             icon: CheckCircle,  color: "text-green-600",  bg: "bg-green-50" },
            { label: "À renouveler",      value: stats.aRenouveler,         icon: RefreshCw,    color: "text-blue-600",   bg: "bg-blue-50" },
            { label: "Suspendues",        value: stats.suspendues,          icon: AlertTriangle,color: "text-amber-600",  bg: "bg-amber-50" },
            { label: "Expirées",          value: stats.expirees,            icon: XCircle,      color: "text-red-600",    bg: "bg-red-50" },
            { label: "Membres certifiés", value: stats.nbMembresCertifies,  icon: Users,        color: "text-purple-600", bg: "bg-purple-50" },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="bg-white rounded-xl border p-4">
                <div className={`p-2 rounded-lg ${k.bg} w-fit mb-2`}><Icon size={18} className={k.color} /></div>
                <div className="text-2xl font-bold text-gray-900">{k.value}</div>
                <div className="text-xs text-gray-500 mt-0.5">{k.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Alertes expirations proches (≤ 90 jours) */}
      {stats && stats.prochesExpiration.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={16} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">
              {stats.prochesExpiration.length} certification{stats.prochesExpiration.length > 1 ? "s" : ""} expir{stats.prochesExpiration.length > 1 ? "ent" : "e"} dans les 90 jours
            </h3>
          </div>
          <div className="space-y-2">
            {stats.prochesExpiration.map(c => {
              const days = getDaysLeft(c.dateExpiration);
              return (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-amber-800">{getTypeInfo(c.type).label}{c.numeroCertificat ? ` — ${c.numeroCertificat}` : ""}</span>
                  <span className={`font-medium ${days !== null && days <= 30 ? "text-red-700" : "text-amber-700"}`}>
                    {fmtDate(c.dateExpiration)} (J-{days})
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <select className="border rounded-lg px-3 py-2 text-sm" value={filterStatut} onChange={e => setFilterStatut(e.target.value)}>
          <option value="all">Tous les statuts</option>
          {STATUTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">Tous les types</option>
          {TYPES_CERTIF.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} résultat{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-gray-400">
          <RefreshCw size={20} className="animate-spin mr-2" />Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border p-12 text-center">
          <Award size={40} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Aucune certification enregistrée</p>
          {canWrite && (
            <button onClick={() => setShowCreate(true)} className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
              Ajouter une certification
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => {
            const typeInfo = getTypeInfo(c.type);
            const statutInfo = getStatutInfo(c.statut);
            const StatutIcon = statutInfo.icon;
            const TypeIcon = typeInfo.icon;
            const daysLeft = getDaysLeft(c.dateExpiration);

            return (
              <div key={c.id} className="bg-white rounded-xl border hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetail(c)}>
                <div className="p-5">
                  <div className="flex items-start gap-3 mb-3">
                    <div className={`p-2 rounded-lg ${typeInfo.bg} flex-shrink-0`}><TypeIcon size={20} className={typeInfo.color} /></div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 text-sm">{typeInfo.label}</h3>
                      {c.nomCertificateur && <p className="text-xs text-gray-500 truncate">{c.nomCertificateur}</p>}
                    </div>
                    <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statutInfo.cls}`}>
                      <StatutIcon size={11} />{statutInfo.label}
                    </div>
                  </div>
                  {c.numeroCertificat && <p className="text-xs text-gray-500 mb-2">N° {c.numeroCertificat}</p>}
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-500 mb-3">
                    {c.dateExpiration && (
                      <div>
                        <span className="block text-gray-400">Expire le</span>
                        <span className={`font-medium ${daysLeft !== null && daysLeft <= 30 ? "text-red-600" : daysLeft !== null && daysLeft <= 90 ? "text-amber-600" : "text-gray-700"}`}>
                          {fmtDate(c.dateExpiration)}{daysLeft !== null && c.statut === "actif" && <span className="ml-1 text-gray-400">(J-{daysLeft})</span>}
                        </span>
                      </div>
                    )}
                    {c.nbMembresCouVerts != null && (
                      <div><span className="block text-gray-400">Membres</span><span className="font-medium text-gray-700">{c.nbMembresCouVerts.toLocaleString("fr-FR")}</span></div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t">
                    <button onClick={e => { e.stopPropagation(); setDetail(c); }} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1">
                      Détails <ChevronRight size={12} />
                    </button>
                    <div className="flex items-center gap-2">
                      {canWrite && (
                        <button onClick={e => { e.stopPropagation(); setEditing(c); }} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded">
                          <Edit2 size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={e => { e.stopPropagation(); if (confirm(`Supprimer ${typeInfo.label} ?`)) deleteMut.mutate(c.id); }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Répartition par type */}
      {stats && Object.keys(stats.parType).length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <BarChart2 size={16} className="text-gray-400" />Répartition par type
          </h3>
          <div className="space-y-2">
            {Object.entries(stats.parType).map(([type, nb]) => {
              const info = getTypeInfo(type);
              const pct = stats.total > 0 ? Math.round((nb / stats.total) * 100) : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className={`text-xs font-medium w-36 ${info.color}`}>{info.label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full">
                    <div className="h-2 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 w-6 text-right">{nb}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Formulaires */}
      {showCreate && <CertifForm onSubmit={data => createMut.mutate(data)} onCancel={() => setShowCreate(false)} loading={createMut.isPending} />}
      {editing && (
        <CertifForm
          initial={{ type: editing.type, nomCertificateur: editing.nomCertificateur ?? "", numeroCertificat: editing.numeroCertificat ?? "", dateObtention: editing.dateObtention ?? "", dateExpiration: editing.dateExpiration ?? "", statut: editing.statut, superficieCertifieeHa: editing.superficieCertifieeHa ?? "", nbMembresCouVerts: editing.nbMembresCouVerts?.toString() ?? "", lienDocument: editing.lienDocument ?? "", notes: editing.notes ?? "" }}
          onSubmit={data => updateMut.mutate({ id: editing.id, data })}
          onCancel={() => setEditing(null)}
          loading={updateMut.isPending}
        />
      )}

      {/* Detail panel */}
      {detail && (
        <DetailPanel
          certif={detail}
          onClose={() => setDetail(null)}
          canWrite={canWrite}
          onEdit={() => { setEditing(detail); setDetail(null); }}
        />
      )}
    </div>
  );
}
